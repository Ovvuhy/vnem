#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const scriptPath = path.join(rootDir, "scripts", "detect-ai-clients.mjs");

const result = spawnSync(process.execPath, [scriptPath], {
  cwd: rootDir,
  encoding: "utf8",
  env: {
    ...process.env,
    NO_COLOR: "1"
  }
});

assert.equal(
  result.status,
  0,
  `detect-ai-clients exited with ${result.status}; signal=${result.signal}; error=${result.error?.message || "none"}; stderr=${result.stderr || ""}`
);
assert.equal(result.stderr.trim(), "", "detect-ai-clients must keep stderr clean");
assert.ok(result.stdout.trim().startsWith("{"), "detect-ai-clients must print a JSON object");

let payload;
assert.doesNotThrow(() => {
  payload = JSON.parse(result.stdout);
}, "detect-ai-clients stdout must be valid JSON");

assert.equal(typeof payload.generated_at, "string");
assert.equal(typeof payload.scan_metadata, "object");
assert.equal(payload.scan_metadata.mode, "read-only");
assert.equal(typeof payload.detected_clients, "object");

const requiredClients = ["claude_desktop", "cursor", "windsurf", "antigravity"];
for (const client of requiredClients) {
  assert.ok(payload.detected_clients[client], `${client} must be present in detected_clients`);
  assert.equal(typeof payload.detected_clients[client].installed, "boolean");
  assert.equal(typeof payload.detected_clients[client].config_profile_present, "boolean");
  assert.equal(typeof payload.detected_clients[client].custom_mcp_hook_present, "boolean");
  assert.equal(typeof payload.detected_clients[client].vnem_connection_present, "boolean");
  assert.ok(Array.isArray(payload.detected_clients[client].install_signals));
  assert.ok(Array.isArray(payload.detected_clients[client].config_files));
}

console.log("detect-ai-clients tests passed");
