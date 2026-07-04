
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
await mkdir(path.join(rootDir, ".tmp"), { recursive: true });
async function withClient(name, env, fn) {
  const tmpRoot = await mkdtemp(path.join(rootDir, ".tmp", `${name}-`));
  const client = new Client({ name, version: "1.0.0" }, { capabilities: {} });
  const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(scriptDir, "vnem-tools-mcp-server.mjs")], cwd: rootDir, env: { ...process.env, VNEM_TOOLS_ALLOWED_ROOTS: tmpRoot, VNEM_TOOLS_EVIDENCE_ROOT: path.join(tmpRoot, ".vnem", "tool-runs"), VNEM_TOOLS_SKIP_WRANGLER_CHECK: "1", ...env }, stderr: "pipe" });
  await client.connect(transport);
  try { return await fn(client, tmpRoot); } finally { await client.close().catch(() => {}); await rm(tmpRoot, { recursive: true, force: true }); }
}

await withClient("tools-gap-report-test", {}, async (client) => {
  assert.ok(new Set((await client.listTools()).tools.map((t) => t.name)).has("vnem_tools_capability_gap_report"));
  const report = (await client.callTool({ name: "vnem_tools_capability_gap_report", arguments: {} })).structuredContent.capability_gap_report;
  const text = JSON.stringify(report);
  for (const term of ["GitHub destructive admin operations", "package installs", "arbitrary shell", "unrestricted crawling", "automatic CAPTCHA bypass", "secret-manager-backed live API", "broad external browser automation"]) assert.match(text, new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), term);
  assert.ok(report.missing_or_limited_capabilities.length >= 7);
  for (const item of report.missing_or_limited_capabilities) {
    assert.ok(item.why_limited);
    assert.ok(item.current_safe_alternative);
    assert.ok(item.what_would_be_needed_to_add);
    assert.ok(item.risk_if_added_badly);
    assert.ok(item.priority);
  }
});
console.log("vnem Tools capability gap report tests passed");
