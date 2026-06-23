#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
await mkdir(path.join(rootDir, ".tmp"), { recursive: true });
const tmpRoot = await mkdtemp(path.join(rootDir, ".tmp", "tools-browser-"));
const workspace = path.join(tmpRoot, "project");
await mkdir(path.join(workspace, "src"), { recursive: true });
const htmlPath = path.join(workspace, "src", "widget.html");
await writeFile(htmlPath, `<!doctype html>
<html><head><meta charset="utf-8"><title>Weather Widget</title></head>
<body><main id="widget"><h1>Weather widget placeholder ready</h1><p>Sunny and safe.</p></main></body></html>
`, "utf8");
await writeFile(path.join(workspace, ".env"), "TOKEN=example-placeholder\n", "utf8");

const client = new Client({ name: "vnem-tools-browser-test", version: "1.0.1" }, { capabilities: {} });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(scriptDir, "vnem-tools-mcp-server.mjs")],
  cwd: rootDir,
  env: {
    ...process.env,
    VNEM_TOOLS_ALLOWED_ROOTS: workspace,
    VNEM_TOOLS_EVIDENCE_ROOT: path.join(workspace, ".vnem", "tool-runs")
  },
  stderr: "pipe"
});
let stderr = "";
transport.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });

try {
  await client.connect(transport);
  const tools = new Set((await client.listTools()).tools.map((tool) => tool.name));
  assert.equal(tools.has("vnem_tools_browser_capture"), true, "browser capture tool should be registered");

  const status = await client.callTool({ name: "vnem_tools_status", arguments: {} });
  assert.equal(status.isError, undefined);
  assert.equal(status.structuredContent?.tools_status?.browser_policy?.local_url_only, true);
  assert.equal(status.structuredContent?.tools_status?.browser_policy?.external_url_default_block, true);
  assert.ok(status.structuredContent?.tools_status?.browser_policy?.unsupported_browser_actions?.some((item) => /cookie extraction/i.test(item)));

  const dryRun = await client.callTool({ name: "vnem_tools_browser_capture", arguments: { file_path: "src/widget.html" } });
  assert.equal(dryRun.isError, undefined);
  assert.equal(dryRun.structuredContent?.browser_capture?.dry_run, true);
  assert.equal(dryRun.structuredContent?.browser_capture?.captured, false);
  assert.equal(dryRun.structuredContent?.browser_capture?.screenshot_path, null);

  const unapproved = await client.callTool({ name: "vnem_tools_browser_capture", arguments: { file_path: "src/widget.html", dry_run: false } });
  assert.equal(unapproved.isError, true);
  assert.equal(unapproved.structuredContent?.code, "approval_required");

  const external = await client.callTool({ name: "vnem_tools_browser_capture", arguments: { url: "https://example.com", dry_run: false, approved: true, approval_note: "try external" } });
  assert.equal(external.isError, true);
  assert.equal(external.structuredContent?.code, "external_url_blocked");

  const dataUrl = await client.callTool({ name: "vnem_tools_browser_capture", arguments: { url: "data:text/html,<h1>x</h1>" } });
  assert.equal(dataUrl.isError, true);
  assert.equal(dataUrl.structuredContent?.code, "unsafe_browser_url_blocked");

  const credentialedUrl = await client.callTool({ name: "vnem_tools_browser_capture", arguments: { url: "http://user:pass@localhost:1234/" } });
  assert.equal(credentialedUrl.isError, true);
  assert.equal(credentialedUrl.structuredContent?.code, "credentialed_url_blocked");

  const secretUrl = await client.callTool({ name: "vnem_tools_browser_capture", arguments: { url: "http://localhost:1234/?token=rawsecret" } });
  assert.equal(secretUrl.isError, true);
  assert.equal(secretUrl.structuredContent?.code, "raw_secret_blocked");

  const secretFile = await client.callTool({ name: "vnem_tools_browser_capture", arguments: { file_path: ".env" } });
  assert.equal(secretFile.isError, true);
  assert.equal(secretFile.structuredContent?.code, "secret_path_blocked");

  const outsideFile = await client.callTool({ name: "vnem_tools_browser_capture", arguments: { file_path: path.join(tmpRoot, "outside.html") } });
  assert.equal(outsideFile.isError, true);
  assert.equal(outsideFile.structuredContent?.code, "path_outside_allowed_roots");

  const approved = await client.callTool({
    name: "vnem_tools_browser_capture",
    arguments: {
      file_path: "src/widget.html",
      dry_run: false,
      approved: true,
      approval_note: "Browser test approval: capture only local temp workspace HTML screenshot.",
      selector: "#widget",
      viewport_width: 900,
      viewport_height: 700,
      wait_ms: 50,
      max_screenshot_bytes: 2_000_000
    }
  });
  assert.equal(approved.isError, undefined);
  const capture = approved.structuredContent?.browser_capture;
  assert.ok(["captured", "browser_unavailable"].includes(capture?.status), `unexpected capture status ${capture?.status}`);
  assert.ok(capture.evidence_log_id);
  assert.doesNotMatch(JSON.stringify(capture), /TOKEN=|rawsecret|example-placeholder/);
  if (capture.status === "captured") {
    assert.equal(capture.captured, true);
    assert.ok(capture.screenshot_path?.includes("screenshots"));
    assert.ok((await stat(capture.screenshot_path)).isFile());
    assert.match(capture.screenshot_sha256, /^[a-f0-9]{64}$/);
    assert.ok(capture.screenshot_bytes > 0);
    assert.ok(capture.safe_to_claim?.some((item) => /browser screenshot evidence/i.test(item)));
  } else {
    assert.equal(capture.captured, false);
    assert.equal(capture.screenshot_path, null);
    assert.ok(capture.must_not_claim?.some((item) => /visual proof/i.test(item)));
  }

  const evidence = await client.callTool({
    name: "vnem_tools_collect_evidence",
    arguments: {
      task: "Visually prove the weather widget placeholder",
      screenshots: capture.screenshot_path ? [capture.screenshot_path] : [],
      browser_captures: [capture],
      visual_checks: [capture.status === "captured" ? "local screenshot captured for #widget" : "browser unavailable; screenshot not collected"],
      notes: "Browser proof test evidence"
    }
  });
  assert.equal(evidence.isError, undefined);
  const proof = evidence.structuredContent?.evidence?.proof_trail_compatible_summary;
  assert.ok(proof?.browser_evidence?.length === 1);
  if (capture.status === "captured") {
    assert.ok(proof.screenshot_paths?.includes(capture.screenshot_path));
    assert.ok(proof.screenshot_hashes?.includes(capture.screenshot_sha256));
    assert.ok(proof.safe_to_claim?.some((item) => /browser screenshot evidence was captured/i.test(item)));
    assert.equal(proof.must_not_claim?.some((item) => /visual\/browser verification was performed/i.test(item)), false);
  } else {
    assert.ok(proof.must_not_claim?.some((item) => /visual\/browser verification was performed/i.test(item)));
    assert.ok(proof.recommended_final_report_lines?.some((line) => /browser unavailable|not collected|No browser visual proof|unavailable or blocked/i.test(line)));
  }

  console.log("vnem Tools browser capture tests passed");
} catch (error) {
  if (stderr.trim()) console.error(stderr.trim());
  throw error;
} finally {
  await client.close().catch(() => {});
  await rm(tmpRoot, { recursive: true, force: true });
}
