#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const text = (value) => JSON.stringify(value);
const client = new Client({ name: "vnem-core-output-quality-test", version: "1.0.1" }, { capabilities: {} });
const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(scriptDir, "vnem-mcp-server.mjs")], cwd: rootDir, env: { ...process.env, VNEM_ROOT: rootDir }, stderr: "pipe" });
let stderr = "";
transport.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });

try {
  await client.connect(transport);
  const toolNames = new Set((await client.listTools()).tools.map((tool) => tool.name));
  assert.equal(toolNames.has("vnem_output_quality_plan"), true);
  assert.equal(toolNames.has("vnem_completion_audit"), true);
  assert.equal(toolNames.has("vnem_proof_trail"), true);

  const handoff = await client.callTool({
    name: "vnem_output_quality_plan",
    arguments: {
      task: "Create a Building AI prompt handoff for a VNEM implementation batch",
      output_type: "building_ai_prompt_handoff",
      audience: "developer",
      evidence_available: ["required specs read", "targeted tests listed"],
      blockers: []
    }
  });
  const plan = handoff.structuredContent?.output_quality_plan;
  assert.equal(plan.compact_first_order[0], "status/result first");
  assert.ok(plan.required_sections.includes("Result"));
  assert.ok(plan.template_contract.includes("Must read first"));
  assert.ok(plan.template_contract.includes("Tests/checks required"));
  assert.ok(plan.template_contract.includes("What counts as done"));
  for (const label of ["proven", "tested", "supported", "likely", "assumed", "unknown", "blocked", "failed", "not_attempted", "preparation_only"]) assert.ok(plan.evidence_labels.includes(label), `missing label ${label}`);
  assert.ok(plan.must_not_claim.some((item) => /proof|evidence|done/i.test(item)));

  const command = await client.callTool({
    name: "vnem_output_quality_plan",
    arguments: {
      task: "Tell the user how to run the Core routing test",
      output_type: "user_command_handoff",
      commands_to_handoff: ["cd C:/VNEM/vnem-src", "npm run test:core-routing-memory-output"],
      output_text: "Run npm test. It should work."
    }
  });
  const commandPlan = command.structuredContent?.output_quality_plan;
  assert.ok(commandPlan.template_contract.includes("Run this"));
  assert.ok(commandPlan.template_contract.includes("Success looks like"));
  assert.ok(commandPlan.audit_flags.some((item) => /where to run|success looks like|too broad/i.test(item)), "command handoff audit should flag vague/broad command output");

  const docsOnlyAudit = await client.callTool({
    name: "vnem_completion_audit",
    arguments: {
      task: "Implement a major VNEM Core behavior improvement",
      claimed_result: "Major improvement done. I updated README wording only and it is safe and compatible.",
      changed_files: ["README.md"],
      commands_run: [],
      evidence: [],
      token_budget: "normal"
    }
  });
  const audit = docsOnlyAudit.structuredContent;
  assert.notEqual(audit.verdict, "pass", "docs-only major implementation claim must not pass");
  assert.ok(audit.evidence_ledger?.preparation_only?.some((item) => /docs-only/i.test(item)) || text(audit).match(/docs-only|documentation only/i));
  assert.ok(audit.what_must_not_be_claimed.some((item) => /major|implemented|compatible|safe|done/i.test(item)));
  assert.ok(audit.evidence_ledger?.unknown?.some((item) => /compatibility/i.test(item)) || text(audit).match(/compatibility/i));

  const testedAudit = await client.callTool({
    name: "vnem_completion_audit",
    arguments: {
      task: "Implement Core output-quality planning behavior",
      claimed_result: "Implemented vnem_output_quality_plan and tests pass.",
      changed_files: ["scripts/vnem-mcp-server.mjs", "scripts/test-core-output-quality.mjs"],
      commands_run: ["npm run test:core-output-quality passed"],
      evidence: ["MCP client listed vnem_output_quality_plan", "targeted test asserted compact-first contract"],
      token_budget: "normal"
    }
  });
  const tested = testedAudit.structuredContent;
  assert.ok(tested.evidence_ledger?.tested?.length > 0, "audit should classify test evidence separately");
  assert.ok(tested.evidence_ledger?.proven?.length > 0, "audit should classify proven implementation evidence separately");

  console.log("vnem Core output-quality tests passed");
} finally {
  await client.close().catch(() => {});
  if (stderr.trim()) process.stderr.write(stderr);
}
