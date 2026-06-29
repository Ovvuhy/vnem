#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
await mkdir(path.join(rootDir, ".tmp"), { recursive: true });
const tmpRoot = await mkdtemp(path.join(rootDir, ".tmp", "tools-redaction-blocking-"));
const projectDir = path.join(tmpRoot, "project");
await mkdir(path.join(projectDir, "src"), { recursive: true });
await mkdir(path.join(projectDir, ".ssh"), { recursive: true });
await mkdir(path.join(projectDir, "browser", "Default", "Network"), { recursive: true });
await writeFile(path.join(projectDir, "src", "safe.txt"), "safe API_TOKEN=should-redact-value and password=should-redact-pass and ghp_abcdefghijklmnopqrstuvwxyz1234567890\n", "utf8");
const secretFiles = [
  ".env",
  ".env.local",
  "prod.pem",
  "deploy.key",
  "id_rsa",
  "tokens.json",
  "credentials.json",
  "cookies.sqlite",
  "sessions.db",
  "browser/Default/Cookies",
  "browser/Default/Network/Cookies",
  ".ssh/id_ed25519"
];
for (const rel of secretFiles) {
  await mkdir(path.dirname(path.join(projectDir, rel)), { recursive: true });
  await writeFile(path.join(projectDir, rel), "SECRET_TOKEN=ghp_should_never_appear\n", "utf8");
}

const client = new Client({ name: "tools-secret-blocking-test", version: "1.0.1" }, { capabilities: {} });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(scriptDir, "vnem-tools-mcp-server.mjs")],
  cwd: rootDir,
  env: { ...process.env, VNEM_TOOLS_ALLOWED_ROOTS: projectDir, VNEM_TOOLS_EVIDENCE_ROOT: path.join(projectDir, ".vnem", "tool-runs"), VNEM_TOOLS_PERMISSION_PROFILE: "approved-writes" },
  stderr: "pipe"
});

try {
  await client.connect(transport);

  for (const rel of secretFiles) {
    const read = await client.callTool({ name: "vnem_tools_read_file", arguments: { path: rel } });
    assert.equal(read.isError, true, rel);
    assert.equal(read.structuredContent?.code, "secret_path_blocked", rel);
    assert.doesNotMatch(JSON.stringify(read.structuredContent), /ghp_should_never_appear/, rel);
  }

  const readSafe = await client.callTool({ name: "vnem_tools_read_file", arguments: { path: "src/safe.txt" } });
  assert.equal(readSafe.isError, undefined);
  const safeText = JSON.stringify(readSafe.structuredContent);
  assert.match(safeText, /\[REDACTED\]/);
  assert.doesNotMatch(safeText, /should-redact-value|should-redact-pass|ghp_abcdefghijklmnopqrstuvwxyz/);

  const patchSecretContent = await client.callTool({ name: "vnem_tools_apply_patch_batch", arguments: { target_root: ".", operations: [{ op: "create", path: "src/new.txt", content: "API_TOKEN=should-not-write\n" }] } });
  assert.equal(patchSecretContent.isError, true);
  assert.equal(patchSecretContent.structuredContent?.code, "raw_secret_blocked");
  assert.doesNotMatch(JSON.stringify(patchSecretContent.structuredContent), /should-not-write/);

  const collect = await client.callTool({ name: "vnem_tools_collect_evidence", arguments: { task: "redact token", changed_files: ["src/safe.txt"], commands_run: ["echo TOKEN=should-redact-value"], notes: "Authorization: Bearer ghp_should_redact_token" } });
  assert.equal(collect.isError, undefined);
  const evidenceText = JSON.stringify(collect.structuredContent);
  assert.match(evidenceText, /\[REDACTED\]/);
  assert.doesNotMatch(evidenceText, /should-redact-value|ghp_should_redact_token/);

  const status = await client.callTool({ name: "vnem_tools_permission_status", arguments: {} });
  assert.ok(status.structuredContent?.permission_status?.blocked_categories?.some((item) => /secret|cookie|session|browser profile|password/i.test(item)));

  console.log("vnem Tools secret blocking tests passed");
} finally {
  await client.close().catch(() => {});
  await rm(tmpRoot, { recursive: true, force: true });
}
