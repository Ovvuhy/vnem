#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const text = (value) => JSON.stringify(value);
const client = new Client({ name: "vnem-core-fast-answer-contract-test", version: "1.0.1" }, { capabilities: {} });
const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(scriptDir, "vnem-mcp-server.mjs")], cwd: rootDir, env: { ...process.env, VNEM_ROOT: rootDir }, stderr: "pipe" });
let stderr = "";
transport.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });

async function contract(task, known_context = "") {
  const result = await client.callTool({ name: "vnem_fast_answer_contract", arguments: { task_summary: task, known_context } });
  return result.structuredContent?.fast_answer_contract;
}

try {
  await client.connect(transport);
  const toolNames = new Set((await client.listTools()).tools.map((tool) => tool.name));
  assert.equal(toolNames.has("vnem_fast_answer_contract"), true, "Core should expose vnem_fast_answer_contract");

  const simple = await contract("What does ghosted mean in LoL?");
  assert.equal(simple.core_used_for_classification, true);
  assert.equal(simple.should_answer_directly, true);
  assert.equal(simple.tools_needed, false);
  assert.equal(simple.research_needed, false);
  assert.ok(simple.max_sections <= 2, "simple answer should not produce a report");
  assert.ok(simple.max_bullets <= 5, "simple answer should keep bullets tight");
  assert.equal(simple.answer_first_rule, true);
  assert.equal(simple.harsh_truth_rule, true);
  assert.match(simple.why_research_is_or_is_not_needed, /stable|not current|not latest/i);
  assert.ok(text(simple.forbidden_overhead).match(/long audit report|unnecessary tool plan|proof section without proof|pointless clarification|fake certainty/i));
  assert.equal(simple.ask_clarifying_question, false, "no pointless clarification for stable slang");

  const current = await contract("What are the current Steam refund requirements?");
  assert.equal(current.should_answer_directly, false, "current policy should not be answered as stable memory-only fact");
  assert.equal(current.research_needed, true);
  assert.match(current.why_research_is_or_is_not_needed, /current|policy|source|changed/i);
  assert.ok(text(current.escalation_triggers).match(/latest|current|policy/i));

  const ambiguous = await contract("Make this website look better");
  assert.equal(ambiguous.ask_clarifying_question, false, "generic make-it-better redesign should adapt rather than force a design-choice questionnaire");
  assert.ok(text(ambiguous.escalation_triggers).match(/ui|visual|browser|reference/i));

  console.log("vnem Core fast-answer contract tests passed");
} finally {
  await client.close().catch(() => {});
  if (stderr.trim()) process.stderr.write(stderr);
}
