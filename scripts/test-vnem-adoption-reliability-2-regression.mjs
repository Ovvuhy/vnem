#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const selectedCase = (process.argv.find((arg) => arg.startsWith("--case=")) || "").slice("--case=".length);
const allCases = [
  "core-visibility-doctor",
  "core-underuse-detector",
  "core-description-discovery",
  "tools-visibility-doctor",
  "tools-underuse-detector",
  "tools-description-discovery",
  "cross-mcp-registered-names",
  "casual-task-not-needed",
  "github-ci-task-needed",
  "repo-debugging-needed",
  "regression"
];
const casesToRun = selectedCase ? [selectedCase] : allCases;
assert.ok(casesToRun.every((item) => allCases.includes(item)), `unknown case ${selectedCase}`);

const core = createClient("vnem-adoption-core-2", path.join(scriptDir, "vnem-mcp-server.mjs"), { VNEM_ROOT: rootDir });
const tools = createClient("vnem-adoption-tools-2", path.join(scriptDir, "vnem-tools-mcp-server.mjs"), {
  VNEM_TOOLS_ALLOWED_ROOTS: rootDir,
  VNEM_TOOLS_EVIDENCE_ROOT: path.join(rootDir, ".tmp", "adoption-reliability-2-tools"),
  VNEM_TOOLS_SKIP_WRANGLER_CHECK: "1"
});

try {
  await core.client.connect(core.transport);
  await tools.client.connect(tools.transport);

  const coreTools = (await core.client.listTools()).tools;
  const toolsTools = (await tools.client.listTools()).tools;
  const coreToolNames = new Set(coreTools.map((tool) => tool.name));
  const toolsToolNames = new Set(toolsTools.map((tool) => tool.name));
  const allVisibleToolNames = [...coreToolNames, ...toolsToolNames];

  if (casesToRun.includes("core-visibility-doctor")) {
    assert.equal(coreToolNames.has("vnem_mcp_visibility_doctor"), true, "Core visibility doctor must be registered");
    const coreOnly = await call(core.client, "vnem_mcp_visibility_doctor", {
      available_mcp_names: ["vnem"],
      available_tool_names: [...coreToolNames],
      user_goal: "Debug failing repo tests and prepare proof.",
      client_name: "regression-core-only"
    }, "visibility_doctor");
    assert.equal(coreOnly.core_visible, true);
    assert.equal(coreOnly.tools_visible, false);
    assert.equal(coreOnly.degraded_mode, "core_only_tools_needed");
    assert.ok(coreOnly.recommended_tools_handoff.unavailable_tools_calls.includes("vnem_tools_failure_triage"));
    assert.ok(coreOnly.next_step.match(/connect\/use VNEM Tools MCP|Call vnem_entrypoint/i));

    const both = await call(core.client, "vnem_mcp_visibility_doctor", {
      available_mcp_names: ["vnem", "vnem-tools"],
      available_tool_names: allVisibleToolNames,
      user_goal: "Implement a repo feature, find patch targets, run focused tests, push a PR, and verify Actions.",
      client_name: "regression-core-tools"
    }, "visibility_doctor");
    assert.equal(both.tools_visible, true);
    assert.equal(both.degraded_mode, "core_and_tools_visible");
    assert.ok(both.recommended_tools_handoff.exact_tools_calls.includes("vnem_tools_repo_deep_map"));
    assert.ok(both.recommended_tools_handoff.exact_tools_calls.includes("vnem_tools_github_actions_status"));
  }

  if (casesToRun.includes("core-underuse-detector")) {
    assert.equal(coreToolNames.has("vnem_underuse_detector"), true, "Core underuse detector must be registered");
    const detector = await call(core.client, "vnem_underuse_detector", {
      user_goal: "Debug failing repo tests and prepare PR CI proof.",
      recent_actions: [],
      available_mcp_names: ["vnem", "vnem-tools"]
    }, "underuse_detector");
    assert.equal(detector.should_have_used_vnem, true);
    assert.equal(detector.severity, "high");
    assert.ok(detector.missing_vnem_calls.includes("vnem_entrypoint"));
    assert.ok(detector.missing_vnem_calls.includes("vnem_tools_failure_triage") || detector.missing_vnem_calls.includes("vnem_tools_github_actions_status"));
    assert.ok(detector.exact_next_vnem_call?.tool);

    const recovered = await call(core.client, "vnem_underuse_detector", {
      user_goal: "Debug failing repo tests and prepare PR CI proof.",
      recent_actions: ["called vnem_entrypoint", "called vnem_tools_failure_triage"],
      available_mcp_names: ["vnem", "vnem-tools"]
    }, "underuse_detector");
    assert.equal(recovered.should_have_used_vnem, false);
  }

  if (casesToRun.includes("core-description-discovery")) {
    assertDescription(coreTools, "vnem_entrypoint", [/first-call/i, /recommend/i, /route/i, /next action/i, /Core MCP|Core/i, /Tools/i, /repo/i, /code/i, /proof/i]);
    assertDescription(coreTools, "vnem_usage_contract", [/first-call/i, /Core MCP|Core/i, /Tools/i, /exact next tool calls|exact next/i]);
    assertDescription(coreTools, "vnem_mcp_visibility_doctor", [/visibility doctor/i, /Core MCP/i, /Tools MCP/i, /repo\/code\/proof|repo.*code.*proof/i, /next action/i]);
    assertDescription(coreTools, "vnem_underuse_detector", [/underuse/i, /repo/i, /code/i, /GitHub/i, /proof/i, /exact next/i]);
  }

  if (casesToRun.includes("tools-visibility-doctor")) {
    assert.equal(toolsToolNames.has("vnem_tools_visibility_doctor"), true, "Tools visibility doctor must be registered");
    const doctor = await call(tools.client, "vnem_tools_visibility_doctor", {
      available_tool_names: [...toolsToolNames],
      user_goal: "Map a repo, find patch targets, test, and produce proof."
    }, "tools_visibility_doctor");
    assert.equal(doctor.tools_mcp_visible, true);
    assert.ok(doctor.registered_tool_count >= 100);
    assert.equal(doctor.entrypoint_tools_present.vnem_tools_visibility_doctor.registered, true);
    assert.equal(doctor.entrypoint_tools_present.vnem_tools_underuse_detector.registered, true);
    assert.ok(doctor.adoption_readiness_score >= 80);
    assert.ok(toolsToolNames.has(doctor.recommended_first_tools_call));
  }

  if (casesToRun.includes("tools-underuse-detector")) {
    assert.equal(toolsToolNames.has("vnem_tools_underuse_detector"), true, "Tools underuse detector must be registered");
    const debug = await call(tools.client, "vnem_tools_underuse_detector", {
      user_goal: "Debug failing repo tests and choose a focused rerun.",
      task_type: "debugging",
      repo_path: rootDir,
      recent_actions: []
    }, "tools_underuse_detector");
    assert.equal(debug.should_have_used_tools, true);
    assert.equal(debug.severity, "high");
    assert.ok(debug.missing_tools_calls.includes("vnem_tools_failure_triage"));

    const patch = await call(tools.client, "vnem_tools_underuse_detector", {
      user_goal: "Find exact patch target for a repo code change.",
      task_type: "patch",
      repo_path: rootDir,
      recent_actions: []
    }, "tools_underuse_detector");
    assert.equal(patch.should_have_used_tools, true);
    assert.ok(patch.missing_tools_calls.includes("vnem_tools_patch_target_finder"));

    const ci = await call(tools.client, "vnem_tools_underuse_detector", {
      user_goal: "Push a branch, open a PR, verify remote SHA, and check GitHub Actions.",
      task_type: "publish",
      repo_path: rootDir,
      recent_actions: []
    }, "tools_underuse_detector");
    assert.equal(ci.should_have_used_tools, true);
    assert.equal(ci.severity, "high");
    assert.ok(ci.missing_tools_calls.includes("vnem_tools_github_status") || ci.missing_tools_calls.includes("vnem_tools_github_actions_status"));

    const recovered = await call(tools.client, "vnem_tools_underuse_detector", {
      user_goal: "Debug failing repo tests and choose a focused rerun.",
      task_type: "debugging",
      repo_path: rootDir,
      recent_actions: ["called vnem_tools_failure_triage"]
    }, "tools_underuse_detector");
    assert.equal(recovered.should_have_used_tools, false);
  }

  if (casesToRun.includes("tools-description-discovery")) {
    assertDescription(toolsTools, "vnem_tools_entrypoint", [/first-call/i, /recommend/i, /route/i, /repo/i, /code/i, /proof/i, /GitHub/i, /next action/i]);
    assertDescription(toolsTools, "vnem_tools_capability_router", [/first-call/i, /router/i, /exact/i, /repo/i, /code/i, /proof/i, /MCP/i, /next action/i]);
    assertDescription(toolsTools, "vnem_tools_adoption_readiness", [/adoption readiness/i, /discoverability/i, /registered/i, /no-placebo/i]);
    assertDescription(toolsTools, "vnem_tools_visibility_doctor", [/visibility doctor/i, /entrypoint/i, /recommend/i, /route/i, /registered-name/i, /next action/i]);
    assertDescription(toolsTools, "vnem_tools_underuse_detector", [/underuse/i, /entrypoint/i, /recommend/i, /route/i, /exact registered/i]);

    const readiness = await call(tools.client, "vnem_tools_adoption_readiness", { root: rootDir }, "adoption_readiness");
    assert.equal(readiness.entrypoint_tools_present, true);
    assert.equal(readiness.route_descriptions_present, true);
    assert.equal(readiness.exact_registered_tool_validation, true);
    assert.deepEqual(readiness.missing_adoption_hooks, []);
  }

  if (casesToRun.includes("cross-mcp-registered-names")) {
    const manifest = await call(tools.client, "vnem_tools_manifest", {}, "manifest");
    const registered = new Set(manifest.tools.map((tool) => tool.name));
    const doctor = await call(core.client, "vnem_mcp_visibility_doctor", {
      available_mcp_names: ["vnem", "vnem-tools"],
      available_tool_names: allVisibleToolNames,
      user_goal: "Implement repo code, inspect MCP tools, run tests, open a PR, and verify Actions."
    }, "visibility_doctor");
    const coreUnderuse = await call(core.client, "vnem_underuse_detector", {
      user_goal: "Implement repo code, inspect MCP tools, run tests, open a PR, and verify Actions.",
      recent_actions: [],
      available_mcp_names: ["vnem", "vnem-tools"]
    }, "underuse_detector");
    const toolsUnderuse = await call(tools.client, "vnem_tools_underuse_detector", {
      user_goal: "Implement repo code, inspect MCP tools, run tests, open a PR, and verify Actions.",
      task_type: "publish",
      repo_path: rootDir,
      recent_actions: []
    }, "tools_underuse_detector");

    for (const tool of doctor.recommended_tools_handoff.exact_tools_calls) assert.equal(registered.has(tool), true, `Core doctor returned unregistered Tools call ${tool}`);
    for (const tool of coreUnderuse.missing_vnem_calls.filter((name) => name.startsWith("vnem_tools_"))) assert.equal(registered.has(tool), true, `Core underuse returned unregistered Tools call ${tool}`);
    for (const step of toolsUnderuse.exact_recovery_sequence) assert.equal(registered.has(step.tool), true, `Tools underuse returned unregistered recovery call ${step.tool}`);
  }

  if (casesToRun.includes("casual-task-not-needed")) {
    const coreCasual = await call(core.client, "vnem_underuse_detector", {
      user_goal: "Rewrite this short sentence to be friendlier.",
      recent_actions: [],
      available_mcp_names: ["vnem", "vnem-tools"]
    }, "underuse_detector");
    assert.equal(coreCasual.should_have_used_vnem, false);
    assert.ok(coreCasual.not_needed_reason);

    const toolsCasual = await call(tools.client, "vnem_tools_underuse_detector", {
      user_goal: "Rewrite this short sentence to be friendlier.",
      task_type: "auto",
      recent_actions: []
    }, "tools_underuse_detector");
    assert.equal(toolsCasual.should_have_used_tools, false);
    assert.ok(toolsCasual.not_needed_reason);
  }

  if (casesToRun.includes("github-ci-task-needed")) {
    const detector = await call(tools.client, "vnem_tools_underuse_detector", {
      user_goal: "Open a PR, verify the remote SHA, and check GitHub Actions.",
      task_type: "publish",
      repo_path: rootDir,
      recent_actions: []
    }, "tools_underuse_detector");
    assert.equal(detector.should_have_used_tools, true);
    assert.ok(detector.missing_tools_calls.includes("vnem_tools_github_status"));
    assert.ok(detector.missing_tools_calls.includes("vnem_tools_github_actions_status"));
  }

  if (casesToRun.includes("repo-debugging-needed")) {
    const detector = await call(tools.client, "vnem_tools_underuse_detector", {
      user_goal: "Debug a repo test failure, inspect the changed source, and rerun the focused test.",
      task_type: "debugging",
      repo_path: rootDir,
      recent_actions: []
    }, "tools_underuse_detector");
    assert.equal(detector.should_have_used_tools, true);
    assert.ok(detector.missing_tools_calls.includes("vnem_tools_failure_triage"));
    assert.ok(detector.missing_tools_calls.includes("vnem_tools_test_selection_plan"));
  }

  if (casesToRun.includes("regression")) {
    assert.equal(coreToolNames.has("vnem_mcp_visibility_doctor"), true);
    assert.equal(coreToolNames.has("vnem_underuse_detector"), true);
    assert.equal(toolsToolNames.has("vnem_tools_visibility_doctor"), true);
    assert.equal(toolsToolNames.has("vnem_tools_underuse_detector"), true);

    const status = await call(tools.client, "vnem_tools_status", {}, "tools_status");
    assert.equal(status.adoption_reliability_policy.underuse_detection_supported, true);
    assert.ok(status.adoption_reliability_policy.tools.includes("vnem_tools_visibility_doctor"));
    assert.ok(status.adoption_reliability_policy.tools.includes("vnem_tools_underuse_detector"));

    const adoptionManifest = await call(tools.client, "vnem_tools_manifest", { capability_group: "adoption_reliability" }, "manifest");
    assert.ok(adoptionManifest.tools.some((tool) => tool.name === "vnem_tools_visibility_doctor"));
    assert.ok(adoptionManifest.tools.some((tool) => tool.name === "vnem_tools_underuse_detector"));
    assert.ok(adoptionManifest.tools.every((tool) => tool.core_handoff_compatible));
  }

  console.log(`vnem Tools ADOPTION-RELIABILITY-2 ${selectedCase || "regression"} tests passed`);
} finally {
  await core.client.close().catch(() => {});
  await tools.client.close().catch(() => {});
}

function createClient(name, serverPath, extraEnv = {}) {
  const client = new Client({ name, version: "1.0.1" }, { capabilities: {} });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
    cwd: rootDir,
    env: { ...process.env, ...extraEnv },
    stderr: "pipe"
  });
  let stderr = "";
  transport.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });
  transport.stderr?.on("close", () => {
    if (stderr.trim()) process.stderr.write(stderr);
  });
  return { client, transport };
}

async function call(client, name, args, key) {
  const result = await client.callTool({ name, arguments: args });
  assert.equal(result.isError, undefined, `${name} returned error: ${result.content?.[0]?.text || ""}`);
  assert.ok(result.structuredContent?.[key], `${name} missing structuredContent.${key}`);
  return result.structuredContent[key];
}

function assertDescription(tools, name, patterns) {
  const tool = tools.find((item) => item.name === name);
  assert.ok(tool, `${name} is not listed by MCP`);
  for (const pattern of patterns) assert.match(tool.description || "", pattern, `${name} description missing ${pattern}`);
}
