#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const text = (value) => JSON.stringify(value);
const client = new Client({ name: "vnem-core-anti-overhead-audit-test", version: "1.0.1" }, { capabilities: {} });
const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(scriptDir, "vnem-mcp-server.mjs")], cwd: rootDir, env: { ...process.env, VNEM_ROOT: rootDir }, stderr: "pipe" });
let stderr = "";
transport.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });

async function audit(args) {
  const result = await client.callTool({ name: "vnem_completion_audit", arguments: { token_budget: "normal", ...args } });
  return result.structuredContent;
}

try {
  await client.connect(transport);

  const overkill = await audit({
    task: "What does ghosted mean in LoL?",
    claimed_result: "I will run a browser search, inspect files, use Tools MCP, prepare a full evidence report, then answer: ghosted means ignored.",
    evidence: ["No actual sources or tools were used; this is just a proof section without proof."],
    commands_run: []
  });
  assert.equal(overkill.wasted_tool_usage_status, "flagged", "simple stable task should flag MCP/tool ceremony");
  assert.ok(text(overkill.irrelevant_tool_calls).match(/browser|files|tools/i));
  assert.ok(text(overkill.tool_use_should_have_been_skipped).match(/simple|stable|direct/i));
  assert.ok(text(overkill.anti_overhead_findings).match(/long report|tool plan|proof section|process/i));

  const missingResearch = await audit({
    task: "What are the current Steam refund requirements?",
    claimed_result: "Steam refunds are always available within 14 days and 2 hours. No source needed.",
    evidence: []
  });
  assert.equal(missingResearch.tool_use_missing_when_needed.length > 0, true, "current policy answer should flag missing research/source tools");
  assert.ok(text(missingResearch.research_quality_findings).match(/source|current|verification/i));

  const missingUiTools = await audit({
    task: "Redesign this website and prove it is visually better",
    claimed_result: "I redesigned it and it looks better. No screenshots or browser proof are needed.",
    evidence: ["changed CSS"],
    changed_files: ["src/App.css"]
  });
  assert.equal(missingUiTools.wasted_tool_usage_status !== "pass", true);
  assert.ok(text(missingUiTools.tool_use_missing_when_needed).match(/browser|visual|ui|screenshot/i));
  assert.ok(text(missingUiTools.ui_quality_findings).match(/screenshot|visual|browser/i));

  const legitimateDeep = await audit({
    task: "Debug this failing test and fix the root cause",
    claimed_result: "Fixed the parser bug after reading the failing log and rerunning the targeted test.",
    evidence: ["failing command reproduced parser stack trace", "root cause matched changed parser branch"],
    commands_run: ["npm run test:parser -- passed exit 0"],
    changed_files: ["scripts/parser.mjs"]
  });
  assert.notEqual(legitimateDeep.wasted_tool_usage_status, "flagged", "deep proof should not be punished for debugging");
  assert.equal(text(legitimateDeep.anti_overhead_findings).includes("overused deep verification on simple stable task"), false);

  console.log("vnem Core anti-overhead audit tests passed");
} finally {
  await client.close().catch(() => {});
  if (stderr.trim()) process.stderr.write(stderr);
}
