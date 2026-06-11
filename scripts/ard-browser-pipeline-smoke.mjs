#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { startVnemAppServer } from "./vnem-app-server.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");

export async function runArdBrowserPipelineSmoke(options = {}) {
  const repositoryRoot = path.resolve(options.repositoryRoot || rootDir);
  const started = await startVnemAppServer({
    port: options.port ?? 0,
    repositoryRoot,
    enableLiveIntelligenceEngine: false
  });

  try {
    const runId = options.runId ?? createSmokeRunId();
    const response = await fetch(`${started.url}/api/ard/pipeline/run`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "origin": "http://127.0.0.1"
      },
      body: JSON.stringify({
        run_id: runId,
        mission: options.mission ?? "ARD Browser Pipeline v1 smoke test",
        push_mode: options.pushMode ?? "fixture-remote"
      })
    });
    const body = await response.json();
    if (!response.ok || body.ok === false) {
      const error = new Error(body.error || `ARD browser pipeline smoke failed with HTTP ${response.status}`);
      error.status = response.status;
      error.body = body;
      throw error;
    }
    return body;
  } finally {
    await closeServer(started.server);
  }
}

function createSmokeRunId(now = new Date()) {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z").toLowerCase();
  return `ard-browser-smoke-${stamp}`;
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function parseArgs(argv) {
  const parsed = {
    json: false,
    repositoryRoot: rootDir,
    runId: null,
    pushMode: "fixture-remote"
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") parsed.json = true;
    else if (arg === "--repo") parsed.repositoryRoot = argv[++index];
    else if (arg === "--run-id") parsed.runId = argv[++index];
    else if (arg === "--push-mode") parsed.pushMode = argv[++index];
    else if (arg === "--help" || arg === "-h") parsed.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return parsed;
}

function renderHumanSummary(result) {
  const dangerous = result.dangerousFindings?.length ?? result.protection?.dangerousFindings?.length ?? 0;
  return [
    "ARD Browser Pipeline smoke test passed.",
    `Run: ${result.runId}`,
    `Status: ${result.status}`,
    `Research AI: ${result.research?.status ?? "unknown"} (${result.research?.candidatesFound ?? 0} candidates)`,
    `Protection AI: allowed ${result.protection?.allowed ?? 0}, needs review ${result.protection?.needsReview ?? 0}, blocked ${result.protection?.blocked ?? 0}`,
    `Giving AI: included ${result.giving?.included ?? 0}, excluded ${result.giving?.excluded ?? 0}`,
    `Dangerous findings visible: ${dangerous}`,
    `Branch proof: ${result.branch?.pushed ? "pushed" : "not pushed"} (${result.branch?.mode ?? result.giving?.pushMode ?? "unknown"})`,
    `Next action: ${result.nextAction ?? "Review generated artifacts before implementation."}`
  ].join("\n");
}

function printHelp() {
  process.stdout.write(`Usage: node scripts/ard-browser-pipeline-smoke.mjs [--json] [--repo <path>] [--run-id <id>] [--push-mode fixture-remote]\n\nStarts a temporary local VNEM backend, calls POST /api/ard/pipeline/run, and prints the same Research AI -> Protection AI -> Giving AI result that the browser Run ARD pipeline button uses.\n\nThis writes local ARD run artifacts under <repo>/discovery/ard-runs/<run-id>/ and never pushes to main.\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      printHelp();
      process.exit(0);
    }
    const result = await runArdBrowserPipelineSmoke(options);
    process.stdout.write(options.json ? `${JSON.stringify(result, null, 2)}\n` : `${renderHumanSummary(result)}\n`);
  } catch (error) {
    process.stderr.write(`ARD Browser Pipeline smoke test failed: ${error.message}\n`);
    if (error.body) process.stderr.write(`${JSON.stringify(error.body, null, 2)}\n`);
    process.exit(1);
  }
}
