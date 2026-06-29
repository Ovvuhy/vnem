#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const client = new Client({ name: "vnem-core-research-strategy-test", version: "1.0.1" }, { capabilities: {} });
const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(scriptDir, "vnem-mcp-server.mjs")], cwd: rootDir, env: { ...process.env, VNEM_ROOT: rootDir }, stderr: "pipe" });
let stderr = "";
transport.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });

try {
  await client.connect(transport);
  const toolNames = new Set((await client.listTools()).tools.map((tool) => tool.name));
  assert.equal(toolNames.has("vnem_build_research_strategy"), true, "missing research strategy tool");
  assert.equal(toolNames.has("vnem_tools_web_search"), false, "Core must not expose Tools search directly");

  const currentApi = await client.callTool({ name: "vnem_build_research_strategy", arguments: { task: "Find the current official API docs for Stripe webhook signature verification and compare outdated blog advice", known_context: "Need a reliable implementation answer for current code." } });
  const strategy = currentApi.structuredContent?.research_strategy;
  assert.equal(strategy.core_executes_tools, false);
  assert.equal(strategy.web_search_executed, false);
  assert.equal(strategy.currentness_required, true);
  assert.equal(strategy.official_docs_required, true);
  assert.equal(strategy.contradiction_check_needed, true);
  assert.equal(strategy.freshness_check_needed, true);
  assert.ok(strategy.source_types_to_check.includes("official_docs"));
  assert.ok(strategy.source_types_to_check.includes("release_notes"));
  assert.ok(strategy.source_ingestion_needed);
  assert.ok(strategy.claims_to_verify.some((claim) => /webhook|signature|current|official/i.test(claim)));
  assert.ok(strategy.queries_to_try.some((query) => /official|docs|Stripe|current|webhook/i.test(query)));
  assert.ok(strategy.must_not_claim.some((item) => /searched|research happened|Core executed/i.test(item)));
  assert.match(strategy.confidence_limit, /low|medium/i);

  const localUi = await client.callTool({ name: "vnem_build_research_strategy", arguments: { task: "Understand this local dashboard page and verify whether UI state matches backend data", known_context: "Local app inspection may be required." } });
  const uiStrategy = localUi.structuredContent?.research_strategy;
  assert.equal(uiStrategy.local_browser_or_app_inspection_required, true);
  assert.ok(uiStrategy.source_types_to_check.includes("local_browser_page"));
  assert.ok(uiStrategy.stop_condition.some((item) => /source map|evidence|claim/i.test(item)));

  console.log("vnem Core research strategy tests passed");
} finally {
  await client.close().catch(() => {});
  if (stderr.trim()) process.stderr.write(stderr);
}
