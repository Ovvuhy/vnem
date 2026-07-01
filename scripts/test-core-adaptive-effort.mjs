#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const text = (value) => JSON.stringify(value);
const client = new Client({ name: "vnem-core-adaptive-effort-test", version: "1.0.1" }, { capabilities: {} });
const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(scriptDir, "vnem-mcp-server.mjs")], cwd: rootDir, env: { ...process.env, VNEM_ROOT: rootDir }, stderr: "pipe" });
let stderr = "";
transport.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });

async function effort(task, known_context = "") {
  const result = await client.callTool({ name: "vnem_plan_effort_budget", arguments: { user_goal: task, known_context } });
  return result.structuredContent?.effort_budget;
}

try {
  await client.connect(transport);
  const toolNames = new Set((await client.listTools()).tools.map((tool) => tool.name));
  assert.equal(toolNames.has("vnem_plan_effort_budget"), true, "Core should expose vnem_plan_effort_budget");

  const simple = await effort("What does ghosted mean in LoL?");
  assert.equal(simple.effort_mode, "instant_answer", "stable slang question should be instant_answer");
  assert.equal(simple.core_plan_only, true, "Core classification must remain plan-only");
  assert.equal(simple.research_needed, false, "stable slang should not require current research unless latest/meta is requested");
  assert.equal(simple.tool_budget.tools_needed, false, "simple stable Q&A should avoid Tools by default");
  assert.ok(simple.tools_to_avoid.some((item) => /browser|source|file|research/i.test(item)), "simple answer should name wasted tools to avoid");
  assert.equal(simple.truth_over_comfort_status, "enforced");
  assert.equal(simple.no_sugarcoating_status, "enforced");
  assert.equal(simple.uncertainty_must_be_labeled_status, "enforced");
  assert.equal(simple.harsh_truth_quality_status, "enforced");
  assert.match(simple.answer_shape, /direct|answer first/i);
  assert.ok(simple.must_not_claim.some((item) => /checked|research|verified|tool/i.test(item)));

  const prompt = await effort("Improve this system prompt so it is clearer and less bloated");
  assert.ok(["quick_plan", "standard"].includes(prompt.effort_mode), "prompt improvement should be quick_plan or standard");
  assert.equal(prompt.research_needed, false, "prompt improvement from provided text should not force external research");

  const pastedSummary = await effort("Summarize this pasted text in 5 bullets", "The user provided all source text in the prompt.");
  assert.equal(pastedSummary.effort_mode, "quick_plan", "summarization of user-provided text should be quick_plan");
  assert.equal(pastedSummary.research_needed, false);

  const currentPolicy = await effort("What are Steam refund requirements right now?");
  assert.equal(currentPolicy.research_needed, true, "current policy question should require source verification");
  assert.ok(["standard", "deep_proof"].includes(currentPolicy.effort_mode));
  assert.ok(text(currentPolicy.evidence_required).match(/official|current|source|policy/i));

  const debug = await effort("Debug this stack trace and fix the root cause", "Error log and failing command are provided.");
  assert.equal(debug.effort_mode, "deep_proof", "debugging logs should be deep_proof");
  assert.ok(debug.recommended_tools_mcp_tools.some((tool) => /debug|workspace|run_project_task/i.test(tool)));

  const patch = await effort("Patch this repo, run tests, commit, and push to main", "Repo path C:/VNEM/vnem-src");
  assert.equal(patch.effort_mode, "max_verification", "repo patch/push should be max_verification");
  assert.ok(text(patch.evidence_required).match(/commit|ci|exact|tests/i));

  const security = await effort("Is this suspicious account login link safe to use?");
  assert.equal(security.effort_mode, "deep_proof", "security/account safety should be deep_proof");
  assert.equal(security.research_needed, true, "security/account safety should require source/artifact verification");

  const route = await client.callTool({ name: "vnem_route_task", arguments: { task: "What does ghosted mean in LoL?" } });
  const routing = route.structuredContent?.routing_record;
  assert.ok(routing.task_categories.includes("simple_stable_question"), "routing should distinguish simple_stable_question");
  assert.equal(routing.effort_mode, "instant_answer", "routing should expose effort mode");

  console.log("vnem Core adaptive effort tests passed");
} finally {
  await client.close().catch(() => {});
  if (stderr.trim()) process.stderr.write(stderr);
}
