#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const text = (value) => JSON.stringify(value);
const client = new Client({ name: "vnem-core-browser-research-planning-test", version: "1.0.1" }, { capabilities: {} });
const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(scriptDir, "vnem-mcp-server.mjs")], cwd: rootDir, env: { ...process.env, VNEM_ROOT: rootDir }, stderr: "pipe" });
let stderr = "";
transport.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });

try {
  await client.connect(transport);
  const toolNames = new Set((await client.listTools()).tools.map((tool) => tool.name));
  assert.equal(toolNames.has("vnem_select_tools_for_task"), true);
  assert.equal(toolNames.has("vnem_build_tools_plan"), true);
  assert.equal(toolNames.has("vnem_build_browser_research_plan"), true);
  assert.equal(toolNames.has("vnem_explain_tools_chain"), true);
  for (const mutationTool of ["vnem_tools_apply_patch_batch", "vnem_tools_run_project_task", "vnem_tools_browser_page_inspect"]) {
    assert.equal(toolNames.has(mutationTool), false, "Core must remain plan-only and not expose Tools tools directly");
  }

  const direct = await client.callTool({ name: "vnem_build_browser_research_plan", arguments: { task: "Analyze this direct source URL and check its claims: https://example.com/docs" } });
  assert.equal(direct.isError, undefined);
  const directPlan = direct.structuredContent?.browser_research_plan;
  for (const expected of ["vnem_tools_fetch_url_text", "vnem_tools_browser_page_inspect", "vnem_tools_source_quality_check", "vnem_tools_browser_research_pack"]) assert.ok(directPlan.selected_tools.includes(expected), `direct source missing ${expected}`);
  assert.ok(directPlan.approval_required_steps.some((item) => /fetch_url_text/.test(item)));
  assert.ok(directPlan.must_not_claim.some((item) => /web search happened|Core executed Tools/i.test(item)));

  const website = await client.callTool({ name: "vnem_build_tools_plan", arguments: { task: "Understand this website page structure, main content, links, forms, and headings" } });
  const websitePlan = website.structuredContent?.tools_plan;
  for (const expected of ["vnem_tools_browser_page_inspect", "vnem_tools_browser_readability_extract", "vnem_tools_browser_link_map", "vnem_tools_browser_dom_search", "vnem_tools_browser_research_pack"]) assert.ok(websitePlan.selected_tools.includes(expected), `website understanding missing ${expected}`);
  assert.ok(text(websitePlan).match(/browser_understanding_limits|does not execute JavaScript|not full unrestricted browser/i));

  const localUi = await client.callTool({ name: "vnem_select_tools_for_task", arguments: { task: "Improve this local dashboard UI, compare before and after, audit accessibility, and prove it with localhost browser evidence" } });
  const uiPlan = localUi.structuredContent?.tool_selection;
  for (const expected of ["vnem_tools_workspace_map", "vnem_tools_code_search", "vnem_tools_apply_patch_batch", "vnem_tools_start_dev_server", "vnem_tools_browser_capture", "vnem_tools_browser_accessibility_audit", "vnem_tools_browser_compare_snapshots", "vnem_tools_finish_session"]) assert.ok(uiPlan.selected_tools.includes(expected), `local UI missing ${expected}`);

  const current = await client.callTool({ name: "vnem_build_browser_research_plan", arguments: { task: "Find the latest current news about browser MCP tools this week" } });
  const currentPlan = current.structuredContent?.browser_research_plan;
  assert.equal(currentPlan.when_external_web_search_is_required.length > 0, true);
  assert.ok(currentPlan.when_external_web_search_is_required.some((item) => /current|latest|external/i.test(item)));
  assert.ok(currentPlan.must_not_claim.some((item) => /web search happened/i.test(item)));
  assert.doesNotMatch(text(currentPlan), /"web_search_executed"\s*:\s*true/);

  const debug = await client.callTool({ name: "vnem_build_tools_plan", arguments: { task: "Debug this failing browser page test and fix the root cause" } });
  const debugPlan = debug.structuredContent?.tools_plan;
  assert.ok(debugPlan.tool_sequence[0].purpose.match(/logs first|failure output/i));
  assert.equal(debugPlan.core_executes_tools, false);

  const chain = await client.callTool({ name: "vnem_explain_tools_chain", arguments: { task: "Use browser tools to understand a local page" } });
  assert.equal(chain.isError, undefined);
  assert.equal(chain.structuredContent?.tools_chain?.core_executes_tools, false);
  assert.ok(chain.structuredContent?.tools_chain?.chain.some((step) => /browser/i.test(step.what_for)));

  console.log("vnem Core browser/research planning tests passed");
} finally {
  await client.close().catch(() => {});
  if (stderr.trim()) process.stderr.write(stderr);
}
