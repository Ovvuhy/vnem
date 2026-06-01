#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const scriptPath = path.join(rootDir, "scripts", "preview-connector-changes.mjs");

const result = spawnSync(process.execPath, [scriptPath], {
  cwd: rootDir,
  encoding: "utf8",
  env: {
    ...process.env,
    NO_COLOR: "1"
  },
  maxBuffer: 1024 * 1024 * 8
});

assert.equal(
  result.status,
  0,
  `preview-connector-changes exited with ${result.status}; signal=${result.signal}; error=${result.error?.message || "none"}; stderr=${result.stderr || ""}`
);
assert.equal(result.stderr.trim(), "", "preview-connector-changes must keep stderr clean");
assert.ok(result.stdout.trim().startsWith("{"), "preview-connector-changes must print one JSON object");

let payload;
assert.doesNotThrow(() => {
  payload = JSON.parse(result.stdout);
}, "preview-connector-changes stdout must be valid JSON");

assert.equal(payload.preview_metadata?.mode, "read-only-preview");
assert.equal(payload.preview_metadata?.writes_performed, false);
assert.ok(path.isAbsolute(payload.preview_metadata?.repository_root || ""), "repository_root must be absolute");
assert.equal(typeof payload.previews, "object");

for (const serverName of ["vnem", "vnem-precision"]) {
  const server = payload.server_definitions?.[serverName];
  assert.ok(server, `${serverName} server definition is required`);
  assert.equal(server.command, "node");
  assert.ok(Array.isArray(server.args), `${serverName} args must be an array`);
  assert.ok(path.isAbsolute(server.args[0]), `${serverName} script path must be absolute`);
  assert.match(server.args[0], /vnem(?:-precision)?-mcp-server\.mjs$/);
}

const requiredClients = ["claude_desktop", "cursor", "windsurf", "antigravity"];
for (const clientId of requiredClients) {
  const preview = payload.previews?.[clientId];
  assert.ok(preview, `${clientId} preview is required`);
  assert.equal(preview.writes_performed, false, `${clientId} preview must be read-only`);
  assert.ok(path.isAbsolute(preview.selected_config_path), `${clientId} selected_config_path must be absolute`);
  assert.equal(typeof preview.preview_status, "string");

  if (preview.target_config_state) {
    assert.ok(preview.target_config_state.mcpServers, `${clientId} target_config_state must contain mcpServers`);
    assert.ok(preview.target_config_state.mcpServers.vnem, `${clientId} target must contain vnem server`);
    assert.ok(preview.target_config_state.mcpServers["vnem-precision"], `${clientId} target must contain vnem-precision server`);
    assert.ok(path.isAbsolute(preview.target_config_state.mcpServers.vnem.args[0]));
    assert.ok(path.isAbsolute(preview.target_config_state.mcpServers["vnem-precision"].args[0]));
  }
}

console.log("preview connector change tests passed");

