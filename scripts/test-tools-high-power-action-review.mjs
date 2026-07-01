
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

await withClient("tools-high-power-review-test", { VNEM_TOOLS_PERMISSION_PROFILE: "creator-power" }, async (client) => {
  assert.ok(new Set((await client.listTools()).tools.map((t) => t.name)).has("vnem_tools_high_power_action_review"));
  const dns = (await client.callTool({ name: "vnem_tools_high_power_action_review", arguments: { tool_name: "vnem_tools_cloudflare_dns_apply", operation: "delete", target: "www.example.com", mutation_type: "cloudflare_dns_delete", destructive: true, protected_resources: ["www DNS"], expected_effect: "delete www DNS record" } })).structuredContent.high_power_action_review;
  assert.equal(dns.action_allowed, false);
  assert.equal(dns.destructive_approval_required, true);
  assert.match(dns.approval_phrase_needed, /I APPROVE CLOUDFLARE DESTRUCTIVE ACTION/);
  assert.ok(dns.protected_resource_risk.length > 0);
  const secret = (await client.callTool({ name: "vnem_tools_high_power_action_review", arguments: { tool_name: "vnem_tools_cloudflare_env_apply", operation: "put secret", target: "worker API_SECRET", mutation_type: "cloudflare_env", approval_phrase: "I APPROVE CLOUDFLARE MUTATION", expected_effect: "set API_SECRET=super-secret-value" } })).structuredContent.high_power_action_review;
  assert.equal(secret.secret_risk, true);
  assert.equal(secret.action_allowed, true);
  assert.match(secret.must_not_do.join(" "), /print|commit|secret/i);
  const git = (await client.callTool({ name: "vnem_tools_high_power_action_review", arguments: { tool_name: "vnem_tools_git_commit", operation: "commit", target: "repo", mutation_type: "local_git_commit", expected_effect: "create local commit" } })).structuredContent.high_power_action_review;
  assert.equal(git.approval_required, true);
  assert.match(git.safest_execution_path.join(" "), /explicit file list|local commit/i);
  const api = (await client.callTool({ name: "vnem_tools_high_power_action_review", arguments: { tool_name: "vnem_tools_api_request", operation: "GET", target: "https://api.example.com", mutation_type: "api_request", expected_effect: "read API" } })).structuredContent.high_power_action_review;
  assert.equal(api.approval_required, true);
  assert.match(api.must_not_do.join(" "), /unrestricted|secret/i);
});
await withClient("tools-high-power-review-readonly-test", { VNEM_TOOLS_PERMISSION_PROFILE: "safe-readonly" }, async (client) => {
  const res = (await client.callTool({ name: "vnem_tools_high_power_action_review", arguments: { tool_name: "vnem_tools_cloudflare_pages_deploy", operation: "deploy", target: "prod", mutation_type: "cloudflare_pages_deploy", approval_phrase: "I APPROVE CLOUDFLARE MUTATION" } })).structuredContent.high_power_action_review;
  assert.equal(res.action_allowed, false);
  assert.match(res.reasons_to_block.join(" "), /permission profile|safe-readonly/i);
});
console.log("vnem Tools high-power action review tests passed");
