#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const text = (value) => JSON.stringify(value);
const client = new Client({ name: "vnem-core-search-planning-test", version: "1.0.1" }, { capabilities: {} });
const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(scriptDir, "vnem-mcp-server.mjs")], cwd: rootDir, env: { ...process.env, VNEM_ROOT: rootDir }, stderr: "pipe" });
let stderr = "";
transport.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });

try {
  await client.connect(transport);
  const toolNames = new Set((await client.listTools()).tools.map((tool) => tool.name));
  for (const name of ["vnem_assess_research_need", "vnem_build_search_plan", "vnem_build_browsing_plan", "vnem_build_browser_research_plan", "vnem_build_tools_plan"]) assert.equal(toolNames.has(name), true, `missing ${name}`);
  for (const forbidden of ["vnem_tools_web_search", "vnem_tools_captcha_detector", "vnem_tools_download_safety_check"]) assert.equal(toolNames.has(forbidden), false, "Core must not expose Tools directly");

  const assess = await client.callTool({ name: "vnem_assess_research_need", arguments: { task: "Find the latest current Elden Ring PvP meta and cite official patch notes plus community sources" } });
  const need = assess.structuredContent?.research_need_assessment;
  assert.match(need.research_need_level, /high|critical/i);
  assert.equal(need.current_info_required, true);
  assert.equal(need.freshness_requirement.required, true);
  assert.equal(need.external_search_required, true);
  assert.ok(need.source_types_needed.includes("official_source"));
  assert.ok(need.source_types_needed.includes("community_source"));
  assert.ok(need.must_not_claim.some((item) => /web search happened|current/i.test(item)));

  const search = await client.callTool({ name: "vnem_build_search_plan", arguments: { task: "Research current browser MCP security and suspicious download risks", domain_hint: "security software", freshness_required: true } });
  const searchPlan = search.structuredContent?.search_plan;
  for (const expected of ["vnem_tools_search_provider_manifest", "vnem_tools_search_query_builder", "vnem_tools_web_search", "vnem_tools_search_result_ranker", "vnem_tools_url_reputation_check", "vnem_tools_claim_source_matrix", "vnem_tools_research_gap_detector"]) assert.ok(searchPlan.selected_tools.includes(expected), `search plan missing ${expected}`);
  assert.ok(searchPlan.search_queries.some((q) => /official|security|CVE|advisory/i.test(q)));
  assert.ok(searchPlan.approval_required_steps.some((step) => /web_search|external/i.test(step)));
  assert.ok(searchPlan.done_definition.some((item) => /supported|unsupported|gap/i.test(item)));
  assert.equal(searchPlan.core_executes_tools, false);
  assert.equal(searchPlan.web_search_executed, false);

  const browsing = await client.callTool({ name: "vnem_build_browsing_plan", arguments: { task: "Inspect a suspicious download page, detect CAPTCHA or redirect traps, and decide if it is safe" } });
  const browsingPlan = browsing.structuredContent?.browsing_plan;
  for (const expected of ["vnem_tools_redirect_chain_check", "vnem_tools_url_reputation_check", "vnem_tools_captcha_detector", "vnem_tools_download_safety_check", "vnem_tools_browser_page_inspect", "vnem_tools_source_quality_check"]) assert.ok(browsingPlan.selected_tools.includes(expected), `browsing plan missing ${expected}`);
  assert.ok(browsingPlan.captcha_handling_plan.some((item) => /manual|No automatic CAPTCHA bypass/i.test(item)));
  assert.ok(browsingPlan.download_safety_plan.some((item) => /do not download|manual review|HEAD/i.test(item)));
  assert.ok(browsingPlan.evidence_to_collect.some((item) => /redirect|reputation|captcha|download/i.test(item)));
  assert.ok(browsingPlan.must_not_claim.some((item) => /visual|searched|downloaded|CAPTCHA/i.test(item)));
  assert.equal(browsingPlan.core_executes_tools, false);

  const boosted = await client.callTool({ name: "vnem_build_browser_research_plan", arguments: { task: "Find current docs for a library and check if a CAPTCHA block appears on the docs page" } });
  const browserPlan = boosted.structuredContent?.browser_research_plan;
  assert.ok(text(browserPlan).includes("vnem_tools_search_query_builder"));
  assert.ok(text(browserPlan).includes("vnem_tools_captcha_detector"));
  assert.ok(browserPlan.when_external_web_search_is_required.length > 0);

  console.log("vnem Core search planning tests passed");
} finally {
  await client.close().catch(() => {});
  if (stderr.trim()) process.stderr.write(stderr);
}
