
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

await withClient("tools-action-recovery-test", {}, async (client) => {
  assert.ok(new Set((await client.listTools()).tools.map((t) => t.name)).has("vnem_tools_action_recovery_plan"));
  const missingAuth = (await client.callTool({ name: "vnem_tools_action_recovery_plan", arguments: { tool_name: "vnem_tools_cloudflare_projects_list", operation: "cloudflare discovery", error_code: "cloudflare_auth_missing", stderr: "CLOUDFLARE_API_TOKEN missing", context: "need project list" } })).structuredContent.action_recovery_plan;
  assert.equal(missingAuth.blocked_by_missing_auth, true);
  assert.match(missingAuth.exact_next_steps.join(" "), /wrangler login|CLOUDFLARE_API_TOKEN/i);
  const approval = (await client.callTool({ name: "vnem_tools_action_recovery_plan", arguments: { tool_name: "vnem_tools_cloudflare_pages_deploy", operation: "deploy", error_code: "cloudflare_mutation_approval_required", context: "deploy missing approval" } })).structuredContent.action_recovery_plan;
  assert.equal(approval.blocked_by_approval, true);
  assert.match(approval.exact_next_steps.join(" "), /I APPROVE CLOUDFLARE MUTATION/);
  const root = (await client.callTool({ name: "vnem_tools_action_recovery_plan", arguments: { tool_name: "vnem_tools_read_file", operation: "read", error_code: "path_outside_allowed_roots", context: "C:/outside/file.txt not allowed" } })).structuredContent.action_recovery_plan;
  assert.equal(root.blocked_by_path_or_allowed_root, true);
  assert.match(root.exact_next_steps.join(" "), /VNEM_TOOLS_ALLOWED_ROOTS|allowed root/i);
  const browser = (await client.callTool({ name: "vnem_tools_action_recovery_plan", arguments: { tool_name: "vnem_tools_browser_evidence_run", operation: "browser proof", error_code: "browser_unavailable", stderr: "chromium not found" } })).structuredContent.action_recovery_plan;
  assert.equal(browser.blocked_by_missing_dependency, true);
  assert.match(browser.must_not_claim.join(" "), /screenshot|browser proof/i);
  assert.equal(browser.safe_retry_allowed, false);
});
console.log("vnem Tools action recovery plan tests passed");
