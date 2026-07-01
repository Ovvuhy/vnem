
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

await withClient("tools-reliability-catalog-test", {}, async (client) => {
  const toolNames = new Set((await client.listTools()).tools.map((tool) => tool.name));
  assert.ok(toolNames.has("vnem_tools_reliability_catalog"), "reliability catalog tool exists");
  const res = await client.callTool({ name: "vnem_tools_reliability_catalog", arguments: {} });
  const catalog = res.structuredContent?.reliability_catalog;
  assert.ok(catalog?.generated_at);
  assert.equal(catalog.permission_profile, "safe-readonly");
  const byName = new Map(catalog.tools.map((tool) => [tool.name, tool]));
  for (const name of ["vnem_tools_cloudflare_pages_deploy", "vnem_tools_browser_evidence_run", "vnem_tools_git_commit", "vnem_tools_api_request", "vnem_tools_apply_patch_batch", "vnem_tools_restore_batch", "vnem_tools_run_project_task", "vnem_tools_start_dev_server"]) assert.ok(byName.has(name), `catalog covers ${name}`);
  const groups = new Set(catalog.tools.map((tool) => tool.capability_group));
  for (const group of ["cloudflare_control", "ui_web_quality", "browser_proof", "local_git", "api_request", "patching", "rollback", "project_tasks", "dev_server", "research_sources"]) assert.ok(groups.has(group), `catalog covers group ${group}`);
  const cfDeploy = byName.get("vnem_tools_cloudflare_pages_deploy");
  assert.notEqual(cfDeploy.reliability_level, "production_safe_with_approval");
  assert.match(cfDeploy.unsafe_to_claim.join(" "), /real.*Cloudflare|live.*production/i);
  assert.match(cfDeploy.next_validation_step, /disposable/i);
  const browserRun = byName.get("vnem_tools_browser_evidence_run");
  assert.match(browserRun.unsafe_to_claim.join(" "), /screenshot proof|browser visual proof/i);
  for (const tool of catalog.tools) {
    assert.ok(tool.tool_reliability?.level);
    assert.ok(tool.tool_reliability?.meaning);
    assert.ok(Array.isArray(tool.safe_to_claim));
    assert.ok(Array.isArray(tool.unsafe_to_claim));
  }
});
console.log("vnem Tools reliability catalog tests passed");
