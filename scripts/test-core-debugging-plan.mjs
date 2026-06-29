#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const client = new Client({ name: "vnem-core-debugging-plan-test", version: "1.0.1" }, { capabilities: {} });
const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(scriptDir, "vnem-mcp-server.mjs")], cwd: rootDir, env: { ...process.env, VNEM_ROOT: rootDir }, stderr: "pipe" });
let stderr = "";
transport.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });

try {
  await client.connect(transport);
  const toolNames = new Set((await client.listTools()).tools.map((tool) => tool.name));
  assert.equal(toolNames.has("vnem_build_debugging_plan"), true, "missing debugging plan tool");
  assert.equal(toolNames.has("vnem_tools_debug_evidence"), false, "Core must not expose Tools debug evidence directly");

  const missing = await client.callTool({ name: "vnem_build_debugging_plan", arguments: { task: "Fix the app crash on startup", expected_behavior: "server starts", actual_behavior: "crashes immediately" } });
  const plan = missing.structuredContent?.debugging_plan;
  assert.equal(plan.core_plan_only, true);
  assert.equal(plan.failure_type, "startup");
  assert.ok(plan.evidence_missing.some((item) => /log|failing command|stack trace|test output/i.test(item)));
  assert.ok(plan.specific_user_evidence_request.some((item) => /terminal output|first red error|failing command/i.test(item)));
  assert.ok(plan.logs_or_output_to_check_first.some((item) => /startup|crash|test|terminal/i.test(item)));
  assert.ok(plan.targeted_tests_or_checks.some((item) => /targeted|one failing|node --check|npm run/i.test(item)));
  assert.ok(plan.full_verification_near_final.some((item) => /full|npm test|near final/i.test(item)));
  assert.ok(plan.must_not_claim.some((item) => /inspected logs|ran tests|fixed/i.test(item)));

  const withError = await client.callTool({ name: "vnem_build_debugging_plan", arguments: { task: "Debug failing test", error_or_output: "TypeError: cannot read properties of undefined at src/app.js:42", failing_command: "npm run test:app" } });
  const errorPlan = withError.structuredContent?.debugging_plan;
  assert.equal(errorPlan.failure_type, "test");
  assert.ok(errorPlan.evidence_available.some((item) => /TypeError|npm run test:app/i.test(item)));
  assert.ok(errorPlan.logs_or_output_to_check_first[0].match(/provided error|failing command|test output/i));

  const ui = await client.callTool({ name: "vnem_build_debugging_plan", arguments: { task: "Debug a blank dashboard page after clicking Save", actual_behavior: "blank page", expected_behavior: "success toast and data reload" } });
  const uiPlan = ui.structuredContent?.debugging_plan;
  assert.equal(uiPlan.failure_type, "UI");
  assert.equal(uiPlan.user_input_or_screenshots_useful, true);
  assert.ok(uiPlan.specific_user_evidence_request.some((item) => /screenshot.*error|console|network|clicked/i.test(item)));

  console.log("vnem Core debugging plan tests passed");
} finally {
  await client.close().catch(() => {});
  if (stderr.trim()) process.stderr.write(stderr);
}
