#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const client = new Client({ name: "vnem-core-tool-selection-test", version: "1.0.1" }, { capabilities: {} });
const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(scriptDir, "vnem-mcp-server.mjs")], cwd: rootDir, env: { ...process.env, VNEM_ROOT: rootDir }, stderr: "pipe" });
let stderr = "";
transport.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });
const text = (value) => JSON.stringify(value);

try {
  await client.connect(transport);
  const toolNames = new Set((await client.listTools()).tools.map((tool) => tool.name));
  assert.equal(toolNames.has("vnem_select_tools_for_task"), true);
  assert.equal(toolNames.has("vnem_build_tools_plan"), true);
  for (const mutationTool of ["vnem_tools_apply_patch_batch", "vnem_tools_run_project_task", "vnem_tools_git_commit"]) {
    assert.equal(toolNames.has(mutationTool), false, "Core must not expose Tools mutation tools directly");
  }

  const coding = await client.callTool({ name: "vnem_select_tools_for_task", arguments: { task: "Improve this small React app and prove the tests pass", task_type_hint: "coding task" } });
  assert.equal(coding.isError, undefined);
  const codingSelection = coding.structuredContent?.tool_selection;
  for (const expected of ["vnem_tools_workspace_map", "vnem_tools_code_search", "vnem_tools_read_many_files", "vnem_tools_project_scan", "vnem_tools_apply_patch_batch", "vnem_tools_run_project_task", "vnem_tools_start_session", "vnem_tools_finish_session"]) {
    assert.ok(codingSelection.selected_tools.includes(expected), `coding missing ${expected}`);
  }
  assert.ok(codingSelection.approval_required_steps.some((item) => /patch/i.test(item)));
  assert.ok(codingSelection.evidence_to_collect.length > 0);
  assert.ok(codingSelection.must_not_claim.some((item) => /executed|applied/i.test(item)));
  assert.equal(codingSelection.core_executes_tools, false);

  const ui = await client.callTool({ name: "vnem_build_tools_plan", arguments: { task: "Improve a dashboard UI and prove the rendered page looks correct" } });
  assert.equal(ui.isError, undefined);
  const uiPlan = ui.structuredContent?.tools_plan;
  assert.ok(uiPlan.selected_tools.includes("vnem_tools_browser_capture"), "UI plan should include browser proof when useful");
  assert.ok(uiPlan.tool_sequence.some((step) => step.tool === "vnem_tools_browser_capture"));
  assert.ok(text(uiPlan).match(/dry_run|approval|required|evidence/i));

  const research = await client.callTool({ name: "vnem_select_tools_for_task", arguments: { task: "Research this direct source URL and summarize what claims are supported: https://example.com/docs" } });
  assert.equal(research.isError, undefined);
  const researchSelection = research.structuredContent?.tool_selection;
  assert.ok(researchSelection.selected_tools.includes("vnem_tools_source_quality_check"));
  assert.ok(researchSelection.selected_tools.includes("vnem_tools_research_brief"));
  assert.ok(researchSelection.selected_tools.includes("vnem_tools_fetch_url_text"));
  assert.ok(researchSelection.must_not_claim.some((item) => /web search happened|search/i.test(item)));
  assert.ok(researchSelection.efficiency_guidance.some((item) => /direct approved URLs/i.test(item)));

  const debugging = await client.callTool({ name: "vnem_build_tools_plan", arguments: { task: "Debug this failing local project test and fix the root cause" } });
  assert.equal(debugging.isError, undefined);
  const debugPlan = debugging.structuredContent?.tools_plan;
  assert.ok(debugPlan.tool_sequence[0].purpose.match(/logs first|failure output/i), "debug plan should start with logs/failure output");
  assert.ok(debugPlan.selected_tools.includes("vnem_tools_project_scan"));
  assert.ok(debugPlan.selected_tools.includes("vnem_tools_code_search"));
  assert.ok(debugPlan.verification_plan.some((item) => /targeted failing/i.test(item)));

  const boost = await client.callTool({ name: "vnem_boost_task", arguments: { task: "Fix this repo issue and prove it works", token_budget: "normal" } });
  assert.equal(boost.isError, undefined);
  const boosted = boost.structuredContent || {};
  assert.ok(boosted.tool_selection_plan || boosted.tools_mcp_handoff?.tool_sequence || boosted.tools_plan, "boost should expose upgraded tool selection/plan data");
  assert.doesNotMatch(text(boosted), /"executed"\s*:\s*true|"applied"\s*:\s*true|"captured"\s*:\s*true|"committed"\s*:\s*true/);

  console.log("vnem Core tool selection tests passed");
} finally {
  await client.close().catch(() => {});
  if (stderr.trim()) process.stderr.write(stderr);
}
