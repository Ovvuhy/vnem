#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const client = new Client({ name: "vnem-core-source-ingestion-planning-test", version: "1.0.1" }, { capabilities: {} });
const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(scriptDir, "vnem-mcp-server.mjs")], cwd: rootDir, env: { ...process.env, VNEM_ROOT: rootDir }, stderr: "pipe" });
let stderr = "";
transport.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });

try {
  await client.connect(transport);
  const toolNames = new Set((await client.listTools()).tools.map((tool) => tool.name));
  assert.equal(toolNames.has("vnem_build_source_ingestion_plan"), true, "missing source ingestion plan tool");

  const repoPlanCall = await client.callTool({ name: "vnem_build_source_ingestion_plan", arguments: { task: "Map a local repo to understand install steps, docs, source layout, tests, and changelog before making claims", source_type: "local_repo", source_targets: ["C:/example/project"], extraction_goal: "repo understanding" } });
  const repoPlan = repoPlanCall.structuredContent?.source_ingestion_plan;
  assert.equal(repoPlan.core_executes_tools, false);
  assert.equal(repoPlan.source_type, "local_repo");
  assert.equal(repoPlan.access_level, "user-approved local");
  assert.equal(repoPlan.permission_profile_expected, "safe-readonly");
  assert.ok(repoPlan.Tools_MCP_actions_needed.includes("vnem_tools_source_map"));
  assert.ok(repoPlan.Tools_MCP_actions_needed.includes("vnem_tools_source_extract"));
  assert.ok(repoPlan.required_source_areas.some((area) => /README|docs|package|source|tests|changelog/i.test(area)));
  assert.ok(repoPlan.exclusions.some((item) => /secret|node_modules|\.git|broad crawl/i.test(item)));
  assert.ok(repoPlan.stop_condition.some((item) => /bounded|required source areas|enough/i.test(item)));
  assert.ok(repoPlan.must_not_claim.some((item) => /crawled|full repo|executed/i.test(item)));

  const docsPlanCall = await client.callTool({ name: "vnem_build_source_ingestion_plan", arguments: { task: "Extract current API docs and release notes for a package without crawling the entire docs site", source_type: "API_docs", source_targets: ["https://docs.example.test"], extraction_goal: "API currentness" } });
  const docsPlan = docsPlanCall.structuredContent?.source_ingestion_plan;
  assert.equal(docsPlan.source_type, "API_docs");
  assert.equal(docsPlan.access_level, "public_or_user_provided");
  assert.ok(docsPlan.safety_boundaries.some((item) => /no broad|selected|approval/i.test(item)));
  assert.ok(docsPlan.Tools_MCP_actions_needed.includes("vnem_tools_source_graph"));

  console.log("vnem Core source ingestion planning tests passed");
} finally {
  await client.close().catch(() => {});
  if (stderr.trim()) process.stderr.write(stderr);
}
