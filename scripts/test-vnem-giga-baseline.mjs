#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { callTimed, connectMcp } from "./vnem/giga/mcp-client.mjs";
import { GIGA_SCENARIOS, GIGA_SCENARIO_CATEGORIES } from "./vnem/giga/scenarios.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baselineDir = path.join(root, ".vnem", "giga-evolution", "baseline");
const blockedOutput = spawnSync(process.execPath, [path.join(root, "scripts", "vnem", "giga", "capability-benchmark.mjs"), "--label=guard-proof", "--output=package.json"], { cwd: root, encoding: "utf8" });
assert.notEqual(blockedOutput.status, 0, "capability benchmark must not overwrite arbitrary repository files");
assert.match(blockedOutput.stderr, /output must be JSON under \.tmp or \.vnem\/giga-evolution/);
assert.equal(GIGA_SCENARIOS.length, 35, "the deterministic suite must preserve all 35 required scenario categories");
assert.equal(new Set(GIGA_SCENARIOS.map((item) => item.id)).size, GIGA_SCENARIOS.length, "scenario ids must be unique");
assert.equal(new Set(GIGA_SCENARIO_CATEGORIES).size, 35, "scenario categories must be unique");
for (const item of GIGA_SCENARIOS) {
  assert.ok(item.goal.length >= 30, `${item.id} must have a meaningful task goal`);
  assert.ok(item.expected_tools.length >= 1, `${item.id} must define deterministic expected capabilities`);
  assert.ok(item.expected_tools.every((name) => name.startsWith("vnem_tools_")), `${item.id} must use exact Tools naming`);
  assert.ok(item.required_tools.every((name) => name.startsWith("vnem_tools_")), `${item.id} must use exact required Tools naming`);
}

const audit = JSON.parse(readFileSync(path.join(baselineDir, "repository-audit.json"), "utf8"));
const benchmark = JSON.parse(readFileSync(path.join(baselineDir, "capability-benchmark.json"), "utf8"));
const performance = JSON.parse(readFileSync(path.join(baselineDir, "performance.json"), "utf8"));
assert.ok(audit.tracked_inventory.file_count >= 800, "baseline audit must classify the full tracked repository");
assert.equal(benchmark.aggregate.scenario_count, 35);
assert.equal(benchmark.scenarios.length, 35);
assert.equal(performance.generation.deterministic, true);
assert.equal(performance.suites.full_test.status, "pass");
assert.ok(performance.servers.core.startup.runs >= 3);
assert.ok(performance.servers.tools.startup.runs >= 3);
assert.ok(performance.servers.precision.startup.runs >= 3);

const core = await connectMcp({ root, serverFile: "scripts/vnem-mcp-server.mjs", name: "giga-baseline-test-core" });
const tools = await connectMcp({ root, serverFile: "scripts/vnem-tools-mcp-server.mjs", name: "giga-baseline-test-tools" });
try {
  const [coreManifest, toolsManifest] = await Promise.all([core.client.listTools(), tools.client.listTools()]);
  assert.ok(coreManifest.tools.some((tool) => tool.name === "vnem_entrypoint"));
  assert.ok(toolsManifest.tools.some((tool) => tool.name === "vnem_tools_entrypoint"));
  const recovery = GIGA_SCENARIOS.find((item) => item.id === "session-recovery");
  const coreCall = await callTimed(core.client, "vnem_entrypoint", { user_goal: recovery.goal, available_mcp_names: ["vnem", "vnem-tools"], task_mode: "recovery" });
  const toolsCall = await callTimed(tools.client, "vnem_tools_entrypoint", { user_goal: recovery.goal, root, task_mode: "recovery" });
  assert.equal(coreCall.is_error, false);
  assert.equal(toolsCall.is_error, false);
  assert.match(coreCall.text, /use_vnem=yes/);
  assert.match(toolsCall.text, /vnem_tools_local_session_recovery/);
} finally {
  await Promise.all([core.close(), tools.close()]);
}

console.log("VNEM GIGA baseline harness test passed: 35 scenarios and live Core/Tools MCP route");
