#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const client = new Client({ name: "vnem-core-code-quality-contract-test", version: "1.0.1" }, { capabilities: {} });
const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(scriptDir, "vnem-mcp-server.mjs")], cwd: rootDir, env: { ...process.env, VNEM_ROOT: rootDir }, stderr: "pipe" });
let stderr = "";
transport.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });

try {
  await client.connect(transport);
  const toolNames = new Set((await client.listTools()).tools.map((tool) => tool.name));
  assert.equal(toolNames.has("vnem_build_architecture_map"), true, "missing architecture map tool");
  assert.equal(toolNames.has("vnem_code_change_contract"), true, "missing code change contract tool");

  const archCall = await client.callTool({ name: "vnem_build_architecture_map", arguments: { task: "Add a new MCP tool to inspect project errors", known_context: "Repo has scripts/vnem-mcp-server.mjs and tests under scripts/test-*.mjs" } });
  const arch = archCall.structuredContent?.architecture_map;
  assert.equal(arch.core_plan_only, true);
  assert.ok(arch.relevant_entry_points.some((item) => /vnem-mcp-server|registerTool|package\.json/i.test(item)));
  assert.ok(arch.integration_points.some((item) => /MCP tool registry|package script|smoke test/i.test(item)));
  assert.ok(arch.files_likely_involved.some((item) => /vnem-mcp-server|test-/i.test(item)));
  assert.ok(arch.tests_likely_involved.some((item) => /test:mcp|targeted/i.test(item)));
  assert.ok(arch.risks.some((item) => /parallel fake|unwired|contract/i.test(item)));

  const contractCall = await client.callTool({ name: "vnem_code_change_contract", arguments: { goal: "Implement a dashboard component backed by an API route", architecture_evidence: arch, files_to_change: ["dashboard/src/App.jsx", "scripts/vnem-app-server.mjs"], contracts_affected: ["dashboard route", "API JSON output"] } });
  const contract = contractCall.structuredContent?.code_change_contract;
  assert.ok(contract.real_integration_point.some((item) => /route|caller|entry|render|API/i.test(item)));
  assert.ok(contract.tests_to_update_or_add.some((item) => /caller|contract|integration|targeted/i.test(item)));
  assert.ok(contract.verification_required.some((item) => /targeted|dashboard|build|test/i.test(item)));
  assert.ok(contract.what_counts_as_done.some((item) => /wired|verified|real/i.test(item)));
  assert.ok(contract.must_not_claim.some((item) => /implemented|wired|mock-only|unverified/i.test(item)));

  console.log("vnem Core code quality contract tests passed");
} finally {
  await client.close().catch(() => {});
  if (stderr.trim()) process.stderr.write(stderr);
}
