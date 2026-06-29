#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const client = new Client({ name: "core-permission-planning-test", version: "1.0.1" }, { capabilities: {} });
const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(scriptDir, "vnem-mcp-server.mjs")], cwd: rootDir, env: { ...process.env, VNEM_ROOT: rootDir }, stderr: "pipe" });

try {
  await client.connect(transport);
  const toolNames = new Set((await client.listTools()).tools.map((tool) => tool.name));
  for (const forbidden of ["vnem_tools_apply_patch_batch", "vnem_tools_git_commit", "vnem_tools_action_policy_preview", "vnem_tools_permission_status"]) {
    assert.equal(toolNames.has(forbidden), false, `Core must not expose Tools action/status tool directly: ${forbidden}`);
  }

  const route = await client.callTool({ name: "vnem_route_task", arguments: { task: "Apply a patch to this repo, run tests, create a local commit, and do not read .env", known_context: "workspace C:/VNEM/vnem-src" } });
  assert.equal(route.isError, undefined);
  const routing = route.structuredContent?.routing_record;
  assert.ok(routing?.tools_permission_planning, "route should include Tools permission planning");
  assert.match(routing.tools_permission_planning.required_permission_profile || "", /approved-writes|safe-local-dev/);
  assert.ok(routing.tools_permission_planning.actions_requiring_approval?.some((item) => /apply_patch|local_commit|run_test/.test(JSON.stringify(item))));
  assert.ok(routing.tools_permission_planning.actions_blocked_by_current_profile?.some((item) => /safe-readonly|package_install|github|secret_read/.test(JSON.stringify(item))));
  assert.match(routing.tools_permission_planning.trust_boundary_level || "", /^[0-6]_/);
  assert.ok(routing.tools_permission_planning.safe_alternative);
  assert.ok(routing.must_not_claim.some((item) => /permission|approved|Tools MCP actions/i.test(item)));

  const plan = await client.callTool({ name: "vnem_build_tools_plan", arguments: { task: "Install a package, create a GitHub PR, and patch source files", known_context: "Node repo" } });
  assert.equal(plan.isError, undefined);
  const toolsPlan = plan.structuredContent?.tools_plan;
  assert.ok(toolsPlan?.permission_profile_plan, "tools plan should include permission profile plan");
  assert.ok(toolsPlan.permission_profile_plan.required_profiles?.includes("approved-writes"));
  assert.ok(toolsPlan.permission_profile_plan.actions_requiring_approval?.some((item) => /apply_patch/.test(JSON.stringify(item))));
  assert.ok(toolsPlan.permission_profile_plan.blocked_or_preview_only_actions?.some((item) => /package_install|github_pr/.test(JSON.stringify(item))));
  assert.ok(toolsPlan.permission_profile_plan.must_not_claim?.some((item) => /install|GitHub|without approval/i.test(item)));
  assert.equal(toolsPlan.core_executes_tools, false);

  const selected = await client.callTool({ name: "vnem_select_tools_for_task", arguments: { task: "Check a suspicious URL and do not bypass CAPTCHA or read browser cookies" } });
  assert.equal(selected.isError, undefined);
  assert.ok(selected.structuredContent?.tool_selection?.permission_profile_plan?.trust_boundary_level?.startsWith("6_") || selected.structuredContent?.tool_selection?.permission_profile_plan?.blocked_or_preview_only_actions?.length > 0);
  assert.ok(JSON.stringify(selected.structuredContent).includes("safe alternative"));

  const audit = await client.callTool({ name: "vnem_completion_audit", arguments: { task: "Tools permission work", claimed_result: "I installed packages and created a GitHub PR safely", evidence: ["only ran preview tests; no install command; no gh mutation"] } });
  assert.equal(audit.isError, undefined);
  assert.ok(JSON.stringify(audit.structuredContent).match(/permission|approval|install|GitHub|must_not_claim/i));

  console.log("vnem Core permission planning tests passed");
} finally {
  await client.close().catch(() => {});
}
