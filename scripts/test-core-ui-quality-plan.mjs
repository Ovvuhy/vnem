#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const client = new Client({ name: "vnem-core-ui-quality-plan-test", version: "1.0.1" }, { capabilities: {} });
const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(scriptDir, "vnem-mcp-server.mjs")], cwd: rootDir, env: { ...process.env, VNEM_ROOT: rootDir }, stderr: "pipe" });
let stderr = "";
transport.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });

try {
  await client.connect(transport);
  const toolNames = new Set((await client.listTools()).tools.map((tool) => tool.name));
  assert.equal(toolNames.has("vnem_build_ui_quality_plan"), true, "missing UI quality plan tool");

  const call = await client.callTool({ name: "vnem_build_ui_quality_plan", arguments: {
    user_goal: "Improve the dashboard layout and prove the responsive route works",
    ui_surface: "dashboard /projects route",
    expected_user_flow: "Open dashboard, navigate to projects, view empty/loading/error states",
    routes_or_components: ["/dashboard", "/projects", "ProjectCards"]
  } });
  const plan = call.structuredContent?.ui_quality_plan;
  assert.equal(plan.core_plan_only, true);
  assert.equal(plan.core_executes_browser, false);
  assert.equal(plan.core_captures_screenshots, false);
  assert.ok(plan.visual_evidence_required.some((item) => /screenshot|before\/after/i.test(item)));
  assert.ok(plan.browser_evidence_required.some((item) => /route|DOM|visible/i.test(item)));
  assert.ok(plan.console_checks_required.some((item) => /console/i.test(item)));
  assert.ok(plan.network_checks_required.some((item) => /network/i.test(item)));
  assert.ok(plan.accessibility_checks_required.some((item) => /accessibility|a11y/i.test(item)));
  assert.ok(plan.responsive_viewports_required.length >= 3);
  assert.ok(plan.responsive_viewports_required.some((item) => /mobile/i.test(JSON.stringify(item))));
  assert.ok(plan.empty_loading_error_states_required.some((item) => /empty/i.test(item)));
  assert.equal(plan.before_after_required, true);
  for (const expected of ["vnem_tools_ui_surface_review", "vnem_tools_browser_evidence_plan", "vnem_tools_ui_evidence_audit"]) assert.ok(plan.Tools_MCP_actions_needed.includes(expected), `missing ${expected}`);
  assert.equal(plan.permission_profile_expected, "safe-readonly for source review; safe-local-dev or approved-writes only for approved localhost browser proof after dry-run");
  assert.ok(plan.must_not_claim.some((item) => /Core opened a browser|captured screenshots|UI improved/i.test(item)));

  console.log("vnem Core UI quality plan tests passed");
} finally {
  await client.close().catch(() => {});
  if (stderr.trim()) process.stderr.write(stderr);
}
