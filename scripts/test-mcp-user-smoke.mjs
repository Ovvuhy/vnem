#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
await mkdir(path.join(rootDir, ".tmp"), { recursive: true });
const tmpRoot = await mkdtemp(path.join(rootDir, ".tmp", "mcp-user-smoke-"));
const workspace = path.join(tmpRoot, "workspace");
await mkdir(workspace, { recursive: true });

const core = new Client({ name: "vnem-core-user-smoke", version: "1.0.1" }, { capabilities: {} });
const tools = new Client({ name: "vnem-tools-user-smoke", version: "1.0.1" }, { capabilities: {} });
const coreTransport = new StdioClientTransport({ command: process.execPath, args: [path.join(scriptDir, "vnem-mcp-server.mjs")], cwd: rootDir, env: { ...process.env, VNEM_ROOT: rootDir }, stderr: "pipe" });
const toolsTransport = new StdioClientTransport({ command: process.execPath, args: [path.join(scriptDir, "vnem-tools-mcp-server.mjs")], cwd: rootDir, env: { ...process.env, VNEM_TOOLS_ALLOWED_ROOTS: workspace, VNEM_TOOLS_EVIDENCE_ROOT: path.join(workspace, ".vnem", "tool-runs") }, stderr: "pipe" });
let stderr = "";
coreTransport.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });
toolsTransport.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });

try {
  await core.connect(coreTransport);
  await tools.connect(toolsTransport);

  const coreToolNames = new Set((await core.listTools()).tools.map((tool) => tool.name));
  for (const name of ["vnem_plan_effort_budget", "vnem_fast_answer_contract", "vnem_design_ambition_plan", "vnem_visual_taste_audit", "vnem_redesign_comparison_scorecard", "vnem_total_impact_design_plan", "vnem_design_direction_selector", "vnem_compact_output_contract"]) assert.ok(coreToolNames.has(name), `Core manifest missing ${name}`);

  const corePlan = await core.callTool({ name: "vnem_build_search_plan", arguments: { task: "Research a current browser MCP safely and identify suspicious download risks", freshness_required: true } });
  const searchPlan = corePlan.structuredContent?.search_plan;
  assert.ok(searchPlan.selected_tools.includes("vnem_tools_web_search"));
  assert.equal(searchPlan.core_executes_tools, false);

  const uiPlanCall = await core.callTool({ name: "vnem_build_ui_quality_plan", arguments: { user_goal: "Improve dashboard UI and prove responsive browser behavior", ui_surface: "dashboard", expected_user_flow: "open dashboard and verify empty state", routes_or_components: ["/dashboard", "Dashboard"] } });
  const uiPlan = uiPlanCall.structuredContent?.ui_quality_plan;
  assert.equal(uiPlan.core_plan_only, true);
  assert.equal(uiPlan.core_executes_browser, false);
  assert.ok(uiPlan.Tools_MCP_actions_needed.includes("vnem_tools_ui_evidence_audit"));

  const manifest = await tools.callTool({ name: "vnem_tools_manifest", arguments: {} });
  const toolNames = manifest.structuredContent?.manifest?.tools?.map((tool) => tool.name) || [];
  for (const name of ["vnem_tools_permission_profiles", "vnem_tools_permission_status", "vnem_tools_action_policy_preview", "vnem_tools_trust_boundary_classify", "vnem_tools_search_provider_manifest", "vnem_tools_search_query_builder", "vnem_tools_web_search", "vnem_tools_search_result_ranker", "vnem_tools_captcha_detector", "vnem_tools_download_safety_check", "vnem_tools_claim_source_matrix", "vnem_tools_research_gap_detector", "vnem_tools_source_map", "vnem_tools_source_extract", "vnem_tools_source_graph", "vnem_tools_architecture_review", "vnem_tools_debug_evidence", "vnem_tools_ui_surface_review", "vnem_tools_browser_evidence_plan", "vnem_tools_browser_evidence_run", "vnem_tools_ui_evidence_audit"]) assert.ok(toolNames.includes(name), `manifest missing ${name}`);

  const uiAudit = await tools.callTool({ name: "vnem_tools_ui_evidence_audit", arguments: { claim: "Dashboard UI improved", screenshots: [], dom_assertions: [], console_summary: { status: "unknown" }, network_summary: { status: "unknown" } } });
  assert.equal(uiAudit.structuredContent?.ui_evidence_audit?.safe_to_claim, false);

  const query = await tools.callTool({ name: "vnem_tools_search_query_builder", arguments: { task: "Find official docs for safe browser automation", source_types_needed: ["official_docs"], freshness_required: false } });
  assert.ok(query.structuredContent?.search_query_builder?.queries?.length >= 3);

  const ranked = await tools.callTool({ name: "vnem_tools_search_result_ranker", arguments: { task: "Rank fixture results", results: [
    { title: "Official Docs", url: "https://docs.example.com/tool", snippet: "Official documentation", source_type: "official_docs" },
    { title: "Free installer download", url: "https://bad.example.xyz/setup.exe", snippet: "Download now", source_type: "download" }
  ], preferred_source_types: ["official_docs"] } });
  assert.match(ranked.structuredContent?.search_result_ranker?.ranked_results?.[0]?.title || "", /Official/);
  assert.ok(ranked.structuredContent?.search_result_ranker?.risky_sources?.length >= 1);

  const captcha = await tools.callTool({ name: "vnem_tools_captcha_detector", arguments: { text: "Please verify you are human. Cloudflare Ray ID and captcha challenge required." } });
  assert.equal(captcha.structuredContent?.captcha_detector?.captcha_or_block_detected, true);

  const download = await tools.callTool({ name: "vnem_tools_download_safety_check", arguments: { download_url: "https://download.example.xyz/update.exe" } });
  assert.equal(download.structuredContent?.download_safety_check?.requires_manual_review, true);

  const matrix = await tools.callTool({ name: "vnem_tools_claim_source_matrix", arguments: { claims: ["Official docs exist", "Search was live"], sources: [{ title: "Docs", source_quality_score: 90, text_excerpt: "Official docs exist." }] } });
  assert.ok(matrix.structuredContent?.claim_source_matrix?.supported_claims?.some((item) => /Official docs/.test(item.claim)));
  assert.ok(matrix.structuredContent?.claim_source_matrix?.unsupported_claims?.some((item) => /Search was live/.test(item.claim)));

  const gaps = await tools.callTool({ name: "vnem_tools_research_gap_detector", arguments: { task: "Current best tool", freshness_required: true, sources: [] } });
  assert.equal(gaps.structuredContent?.research_gap_detector?.missing_current_search, true);
  assert.ok(gaps.structuredContent?.research_gap_detector?.recommended_next_tools?.includes("vnem_tools_web_search"));

  console.log("vnem MCP user smoke test passed");
} finally {
  await core.close().catch(() => {});
  await tools.close().catch(() => {});
  await rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
  if (stderr.trim()) process.stderr.write(stderr);
}
