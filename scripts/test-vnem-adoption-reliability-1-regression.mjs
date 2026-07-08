#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const selectedCase = (process.argv.find((arg) => arg.startsWith("--case=")) || "").slice("--case=".length);
const allCases = ["core-entrypoint", "core-usage-contract", "tools-entrypoint", "tools-capability-router", "tools-adoption-readiness", "cross-mcp", "regression"];
const casesToRun = selectedCase ? [selectedCase] : allCases;
assert.ok(casesToRun.every((item) => allCases.includes(item)), `unknown case ${selectedCase}`);

const core = createClient("vnem-adoption-core", path.join(scriptDir, "vnem-mcp-server.mjs"), { VNEM_ROOT: rootDir });
const tools = createClient("vnem-adoption-tools", path.join(scriptDir, "vnem-tools-mcp-server.mjs"), {
  VNEM_TOOLS_ALLOWED_ROOTS: rootDir,
  VNEM_TOOLS_EVIDENCE_ROOT: path.join(rootDir, ".tmp", "adoption-reliability-1-tools"),
  VNEM_TOOLS_SKIP_WRANGLER_CHECK: "1"
});

try {
  await core.client.connect(core.transport);
  await tools.client.connect(tools.transport);

  const coreToolNames = new Set((await core.client.listTools()).tools.map((tool) => tool.name));
  const toolsToolNames = new Set((await tools.client.listTools()).tools.map((tool) => tool.name));

  if (casesToRun.includes("core-entrypoint")) {
    assert.equal(coreToolNames.has("vnem_entrypoint"), true, "Core entrypoint tool must be registered");
    const entry = await call(core.client, "vnem_entrypoint", {
      user_goal: "Fix failing tests in this repo, update code, push a PR, and verify GitHub Actions proof.",
      task_context: "Repo/code/debugging/GitHub proof task.",
      available_mcp_names: ["vnem", "vnem-tools"]
    }, "entrypoint");
    assert.equal(entry.should_use_vnem, "yes");
    assert.equal(entry.core_executes_tools, false);
    assert.ok(entry.recommended_tools_calls.includes("vnem_tools_failure_triage"));
    assert.ok(entry.recommended_tools_calls.includes("vnem_tools_patch_target_finder"));
    assert.ok(entry.recommended_tools_calls.includes("vnem_tools_github_actions_status"));
    assert.ok(entry.when_tools_mcp_is_needed.join(" ").match(/repo inspection|tests|GitHub|evidence/i));
    assert.ok(entry.what_core_cannot_do.join(" ").match(/mutate files|run terminal|push branches/i));
    assert.ok(entry.proof_contract.required_before_claims.some((item) => /remote branch SHA|GitHub Actions/i.test(item)));
    assert.ok(entry.no_placebo_risks.some((item) => /registration-only|docs-only/i.test(item)));
    assert.ok(JSON.stringify(entry).length < 12000, "Core entrypoint output should stay compact");

    const casual = await call(core.client, "vnem_entrypoint", {
      user_goal: "What is 2 plus 2?",
      available_mcp_names: ["vnem", "vnem-tools"]
    }, "entrypoint");
    assert.equal(casual.should_use_vnem, "conditional");
    assert.equal(casual.recommended_tools_calls.length, 0, "casual answer-only task should not recommend heavy Tools calls");
  }

  if (casesToRun.includes("core-usage-contract")) {
    assert.equal(coreToolNames.has("vnem_usage_contract"), true, "Core usage contract tool must be registered");
    const contract = await call(core.client, "vnem_usage_contract", {
      user_goal: "Implement repo code changes with proof.",
      available_mcp_names: ["vnem", "vnem-tools"]
    }, "usage_contract");
    assert.match(contract.core_role, /Read-only/i);
    assert.match(contract.tools_role, /repo inspection|patches|commands|GitHub/i);
    assert.equal(contract.core_executes_tools, false);
    assert.ok(contract.when_to_call_tools.some((item) => /repo inspection|edits|terminal|GitHub/i.test(item)));
    assert.ok(contract.safety_boundaries.some((item) => /secret|fake proof|hidden\/control/i.test(item)));
    assert.match(contract.disconnected_agent_limit, /connected\/configured/i);
  }

  if (casesToRun.includes("tools-entrypoint")) {
    const local = await call(tools.client, "vnem_tools_entrypoint", {
      root: rootDir,
      user_goal: "Implement a code fix in this repo with local proof only; no push and no PR.",
      task_mode: "local_only",
      changed_files: ["scripts/vnem-tools-mcp-server.mjs"]
    }, "tools_entrypoint");
    assert.ok(local.best_tools_for_task.some((tool) => tool.name === "vnem_tools_repo_deep_map"));
    assert.ok(local.exact_tool_call_sequence.some((step) => step.tool === "vnem_tools_code_symbol_map"));
    assert.ok(local.exact_tool_call_sequence.some((step) => step.tool === "vnem_tools_patch_target_finder"));
    assert.ok(local.exact_tool_call_sequence.some((step) => step.tool === "vnem_tools_test_selection_plan"));
    assert.ok(local.evidence_packet_shape.includes("what_is_not_proven"));
    assert.doesNotMatch(JSON.stringify(local.exact_tool_call_sequence), /github/i, "local-only task should not recommend live GitHub proof");
    assert.equal(local.output_compact, true);

    const publish = await call(tools.client, "vnem_tools_entrypoint", {
      root: rootDir,
      user_goal: "Push the feature branch, open a PR, verify remote SHA, and check GitHub Actions.",
      task_mode: "publish"
    }, "tools_entrypoint");
    assert.ok(publish.exact_tool_call_sequence.some((step) => step.tool === "vnem_tools_github_status"));
    assert.ok(publish.exact_tool_call_sequence.some((step) => step.tool === "vnem_tools_github_actions_status"));
    assert.ok(publish.exact_tool_call_sequence.some((step) => step.tool === "vnem_tools_pr_quality_gate"));
    assert.ok(publish.remote_proof_plan.join(" ").match(/remote branch SHA|PR head SHA|GitHub Actions/i));
  }

  if (casesToRun.includes("tools-capability-router")) {
    const manifest = await call(tools.client, "vnem_tools_manifest", {}, "manifest");
    const registered = new Set(manifest.tools.map((tool) => tool.name));

    const debug = await call(tools.client, "vnem_tools_capability_router", {
      user_goal: "Debug failing tests from this output and choose a targeted rerun.",
      task_type: "debugging",
      available_context: { root: rootDir, failing_output: "AssertionError: expected handler to be called" }
    }, "capability_router");
    assert.ok(debug.exact_call_sequence.some((step) => step.tool === "vnem_tools_failure_triage"));
    assert.ok(debug.exact_call_sequence.some((step) => step.tool === "vnem_tools_test_selection_plan"));

    const codeIntel = await call(tools.client, "vnem_tools_capability_router", {
      user_goal: "Map code symbols, MCP surface, patch targets, coverage, and source impact.",
      task_type: "code_intelligence",
      available_context: { root: rootDir }
    }, "capability_router");
    for (const expected of ["vnem_tools_code_symbol_map", "vnem_tools_mcp_surface_audit", "vnem_tools_patch_target_finder", "vnem_tools_tool_test_coverage_map", "vnem_tools_source_impact_trace"]) {
      assert.ok(codeIntel.exact_call_sequence.some((step) => step.tool === expected), `missing ${expected}`);
    }

    const localOnly = await call(tools.client, "vnem_tools_capability_router", {
      user_goal: "Inspect and validate locally only; do not push and do not create a PR.",
      task_type: "local_only",
      available_context: { root: rootDir, task_mode: "local_only" }
    }, "capability_router");
    assert.doesNotMatch(JSON.stringify(localOnly.exact_call_sequence), /github/i);

    for (const route of [debug, codeIntel, localOnly]) {
      assert.equal(route.fake_tool_names_removed, true);
      for (const step of route.exact_call_sequence) assert.equal(registered.has(step.tool), true, `router returned unregistered tool ${step.tool}`);
      for (const tool of route.ranked_tools) assert.equal(registered.has(tool.name), true, `router ranked unregistered tool ${tool.name}`);
    }
  }

  if (casesToRun.includes("tools-adoption-readiness")) {
    const readiness = await call(tools.client, "vnem_tools_adoption_readiness", { root: rootDir }, "adoption_readiness");
    assert.equal(readiness.entrypoint_tools_present, true);
    assert.equal(readiness.route_descriptions_present, true);
    assert.equal(readiness.readiness_markers_present, true);
    assert.equal(readiness.missing_adoption_hooks.length, 0);
    assert.equal(readiness.exact_registered_tool_validation, true);
    assert.ok(readiness.no_placebo_hooks.some((item) => /behavior tests/i.test(item)));
  }

  if (casesToRun.includes("cross-mcp")) {
    const manifest = await call(tools.client, "vnem_tools_manifest", {}, "manifest");
    const registered = new Set(manifest.tools.map((tool) => tool.name));
    const coreRepo = await call(core.client, "vnem_entrypoint", {
      user_goal: "Implement a repo feature with code intelligence, exact patch targets, focused tests, and proof.",
      available_mcp_names: ["vnem", "vnem-tools"]
    }, "entrypoint");
    const toolsRepo = await call(tools.client, "vnem_tools_capability_router", {
      user_goal: "Implement a repo feature with code intelligence, exact patch targets, focused tests, and proof.",
      task_type: "implementation",
      available_context: { root: rootDir }
    }, "capability_router");
    for (const tool of coreRepo.recommended_tools_calls) {
      assert.equal(registered.has(tool), true, `Core handoff recommended unregistered Tools MCP call ${tool}`);
    }
    const overlap = coreRepo.recommended_tools_calls.filter((tool) => toolsRepo.exact_call_sequence.some((step) => step.tool === tool));
    assert.ok(overlap.includes("vnem_tools_repo_deep_map"));
    assert.ok(overlap.includes("vnem_tools_patch_target_finder"));
    assert.ok(overlap.includes("vnem_tools_test_selection_plan"));
    assert.ok(JSON.stringify(coreRepo).match(/no_placebo|registration-only|fake proof/i));
    assert.ok(JSON.stringify(toolsRepo).match(/fake_tool_names_removed|proof|fake/i));
  }

  if (casesToRun.includes("regression")) {
    assert.equal(coreToolNames.has("vnem_entrypoint"), true);
    assert.equal(coreToolNames.has("vnem_usage_contract"), true);
    assert.equal(toolsToolNames.has("vnem_tools_entrypoint"), true);
    assert.equal(toolsToolNames.has("vnem_tools_capability_router"), true);
    assert.equal(toolsToolNames.has("vnem_tools_adoption_readiness"), true);

    const status = await call(tools.client, "vnem_tools_status", {}, "tools_status");
    assert.equal(status.adoption_reliability_policy.exact_registered_tool_names_only, true);
    assert.equal(status.adoption_reliability_policy.core_handoff_compatible, true);

    const adoptionManifest = await call(tools.client, "vnem_tools_manifest", { capability_group: "adoption_reliability" }, "manifest");
    assert.ok(adoptionManifest.tools.length >= 3);
    assert.ok(adoptionManifest.tools.some((tool) => tool.name === "vnem_tools_entrypoint"));
    assert.ok(adoptionManifest.tools.some((tool) => tool.name === "vnem_tools_capability_router"));
    assert.ok(adoptionManifest.tools.every((tool) => tool.core_handoff_compatible));
  }

  console.log(`vnem Tools ADOPTION-RELIABILITY-1 ${selectedCase || "regression"} tests passed`);
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
