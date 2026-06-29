#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const client = new Client({ name: "vnem-core-visual-proof-contract-test", version: "1.0.1" }, { capabilities: {} });
const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(scriptDir, "vnem-mcp-server.mjs")], cwd: rootDir, env: { ...process.env, VNEM_ROOT: rootDir }, stderr: "pipe" });
let stderr = "";
transport.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });

try {
  await client.connect(transport);
  const toolNames = new Set((await client.listTools()).tools.map((tool) => tool.name));
  assert.equal(toolNames.has("vnem_visual_proof_contract"), true, "missing visual proof contract tool");

  const visual = await client.callTool({ name: "vnem_visual_proof_contract", arguments: { claim_type: "visual_improvement", claim: "Dashboard UI improved" } });
  const contract = visual.structuredContent?.visual_proof_contract;
  assert.equal(contract.claim_type, "visual_improvement");
  assert.ok(contract.minimum_required_evidence.some((item) => /screenshot/i.test(item)));
  assert.equal(contract.screenshots_required, true);
  assert.equal(contract.route_or_component_integration_required, true);
  assert.equal(contract.console_error_check_required, true);
  assert.equal(contract.network_error_check_required, true);
  assert.ok(contract.what_counts_as_done.some((item) => /browser evidence|visual/i.test(item)));
  assert.ok(contract.must_not_claim.some((item) => /UI improved|screenshot/i.test(item)));

  const responsive = await client.callTool({ name: "vnem_visual_proof_contract", arguments: { claim_type: "responsive_fix", claim: "Layout is responsive now" } });
  const responsiveContract = responsive.structuredContent?.visual_proof_contract;
  assert.equal(responsiveContract.viewport_check_required, true);
  assert.ok(responsiveContract.preferred_evidence.some((item) => /mobile|tablet|desktop|multiple/i.test(item)));
  assert.ok(responsiveContract.must_not_claim.some((item) => /single viewport|responsive/i.test(item)));

  const loading = await client.callTool({ name: "vnem_visual_proof_contract", arguments: { claim_type: "loading_state", claim: "Loading state works" } });
  const stateContract = loading.structuredContent?.visual_proof_contract;
  assert.equal(stateContract.state_coverage_required, true);
  assert.ok(stateContract.minimum_required_evidence.some((item) => /loading|state/i.test(item)));

  console.log("vnem Core visual proof contract tests passed");
} finally {
  await client.close().catch(() => {});
  if (stderr.trim()) process.stderr.write(stderr);
}
