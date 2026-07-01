
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

await withClient("tools-quality-2-regression-test", {}, async (client) => {
  const status = (await client.callTool({ name: "vnem_tools_permission_status", arguments: {} })).structuredContent.permission_status;
  for (const key of ["high_power_summary", "cloudflare_summary", "mutation_allowed_summary", "destructive_allowed_summary", "approval_phrase_summary", "known_blocked_actions", "recommended_profile_for_goal"]) assert.ok(status[key] !== undefined, `permission status includes ${key}`);
  assert.equal(status.mutation_allowed_summary.safe_readonly_can_mutate, false);
  const cf = (await client.callTool({ name: "vnem_tools_cloudflare_status", arguments: {} })).structuredContent.cloudflare_status;
  assert.ok(cf.tool_reliability?.level);
  assert.ok(Array.isArray(cf.safe_to_claim));
  assert.ok(Array.isArray(cf.unsafe_to_claim));
  assert.ok(cf.next_validation_step);
});
await withClient("tools-quality-2-danger-test", { VNEM_TOOLS_PERMISSION_PROFILE: "dangerous-disabled" }, async (client) => {
  const status = (await client.callTool({ name: "vnem_tools_permission_status", arguments: {} })).structuredContent.permission_status;
  assert.match(status.cloudflare_summary.capability_status, /disabled/i);
  const review = (await client.callTool({ name: "vnem_tools_high_power_action_review", arguments: { tool_name: "vnem_tools_cloudflare_pages_deploy", operation: "deploy", target: "prod", mutation_type: "cloudflare_pages_deploy", approval_phrase: "I APPROVE CLOUDFLARE MUTATION" } })).structuredContent.high_power_action_review;
  assert.equal(review.action_allowed, false);
  assert.match(review.reasons_to_block.join(" "), /dangerous-disabled|permission profile/i);
});
console.log("vnem Tools QUALITY-2 regression tests passed");
