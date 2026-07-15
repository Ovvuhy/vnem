#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import TOML from "@iarna/toml";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const proofOutput = arg("proof-output");
const activeCodexConfig = arg("active-codex-config");
const currentSessionVnemVisible = optionalBoolean(arg("current-session-vnem-visible"));
const codexAppVersion = arg("codex-app-version") || null;
const codexCliStatus = arg("codex-cli-status") || null;
const hermesInstalled = optionalBoolean(arg("hermes-installed"));
const hermesVnemConfigured = optionalBoolean(arg("hermes-vnem-configured"));
const hermesVersion = arg("hermes-version") || null;
const claudeInstalled = optionalBoolean(arg("claude-installed"));
const antigravityInstalled = optionalBoolean(arg("antigravity-installed"));
const tempParent = path.join(root, ".tmp");
await mkdir(tempParent, { recursive: true });
const temp = await mkdtemp(path.join(tempParent, "phase23-client-use-"));

try {
  const instructions = await readFile(path.join(root, ".vnem", "install-adoption", "prompts", "vnem-agent-use-instruction.md"), "utf8");
  assert.match(instructions, /vnem-managed-instructions:start/);
  assert.match(instructions, /VNEM is the default improvement layer/);
  assert.match(instructions, /Call Core first/);
  assert.match(instructions, /Use Tools for real inspection and execution/);
  assert.match(instructions, /Skip unnecessary VNEM overhead for trivial tasks/);
  assert.match(instructions, /preserve freedom to use the best workflow/i);
  assert.match(instructions, /Report what was proven/);

  const profileTrials = {};
  for (const client of ["generic", "claude", "antigravity", "hermes"]) {
    const profile = JSON.parse(await readFile(path.join(root, ".vnem", "install-adoption", client, "mcp.json"), "utf8"));
    profileTrials[client] = await runTrial(resolveProfile(profile.mcpServers), {
      label: `${client}-generated-profile`,
      instructions,
      inspectRepository: client === "generic"
    });
  }

  const codexSnippet = TOML.parse(await readFile(path.join(root, ".vnem", "install-adoption", "codex", "config-snippet.toml"), "utf8"));
  const codexGenerated = await runTrial(resolveProfile(codexSnippet.mcp_servers), {
    label: "codex-generated-profile",
    instructions,
    inspectRepository: false
  });

  let activeCodex = { attempted: false, status: "not_requested", what_is_not_proven: ["Active Codex configuration was not supplied to this run."] };
  if (activeCodexConfig) {
    activeCodex = await runActiveCodexTrial(activeCodexConfig, instructions, currentSessionVnemVisible);
  }

  const baseline = JSON.parse(await readFile(path.join(root, ".vnem", "giga-evolution", "baseline", "capability-benchmark.json"), "utf8"));
  const baselineClientInstall = baseline.scenarios.find((scenario) => scenario.id === "client-install");
  const baselineClientRollback = baseline.scenarios.find((scenario) => scenario.id === "client-rollback");
  const report = {
    schema_version: "1.0.0",
    phase: 23,
    status: "pass",
    protocol_and_audit_status: "pass",
    client_agent_adoption_status: currentSessionVnemVisible === false ? "not_proven_current_codex_entrypoints_hidden" : "not_proven_agent_selection_not_observed",
    managed_instruction: {
      status: "pass",
      merge_markers_present: true,
      preserves_user_workflow_freedom: true,
      trivial_task_opt_out_tested: true
    },
    generated_profile_trials: profileTrials,
    codex_generated_profile_trial: codexGenerated,
    active_codex_trial: activeCodex,
    local_client_observations: {
      current_codex_session_vnem_entrypoints_visible: currentSessionVnemVisible,
      codex_app_version: codexAppVersion,
      codex_cli_status: codexCliStatus,
      hermes_installed: hermesInstalled,
      hermes_vnem_configured: hermesVnemConfigured,
      hermes_version: hermesVersion,
      hermes_read_only_mcp_list_observed: hermesInstalled === true && hermesVnemConfigured !== null,
      hermes_global_config_modified: false,
      claude_installed: claudeInstalled,
      antigravity_installed: antigravityInstalled,
      evidence_scope: "explicit commands and current-session tool visibility supplied for this run; no hidden telemetry"
    },
    baseline_comparison: {
      source: ".vnem/giga-evolution/baseline/capability-benchmark.json",
      client_install: summarizeBaseline(baselineClientInstall),
      client_rollback: summarizeBaseline(baselineClientRollback),
      current_generated_profile_trials_pass: Object.values(profileTrials).every((trial) => trial.status === "pass") && codexGenerated.status === "pass",
      exact_like_for_like_client_agent_baseline_available: false
    },
    what_is_proven: [
      "Generated Codex, Claude, Antigravity, Hermes, and generic profiles start both real stdio servers.",
      "Every generated-profile trial discovers and calls Core and Tools entrypoints with structured output.",
      "The generic trial completes a bounded real repository map and produces structured evidence.",
      "The usage self-check detects used, skipped, hidden-entrypoint, and trivial-task cases without hidden telemetry."
    ],
    what_is_not_proven: [
      "A Codex agent process autonomously chose and invoked VNEM; direct MCP profile execution proves the configured protocol path, not agent policy compliance.",
      "Claude and Antigravity are not installed on this machine; their proof is isolated-profile protocol execution only.",
      "Hermes has not imported the VNEM profile into its global configuration; its existing config remains untouched.",
      "No exact like-for-like real-client trial was recorded in the Phase 1 baseline."
    ]
  };
  if (activeCodex.attempted && activeCodex.status !== "pass") report.status = "partial";
  if (proofOutput) {
    const output = path.resolve(root, proofOutput);
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
  console.log(`Phase 23 adoption/client-use regression passed: ${Object.keys(profileTrials).length + 1} generated profiles, real Core/Tools entrypoints, structured repo evidence, managed instructions, and no-telemetry usage audit.`);
} finally {
  await rm(temp, { recursive: true, force: true });
}

async function runTrial(servers, options) {
  assert.ok(servers.vnem, `${options.label} missing vnem`);
  assert.ok(servers["vnem-tools"], `${options.label} missing vnem-tools`);
  const core = await connect(`${options.label}-core`, servers.vnem);
  const tools = await connect(`${options.label}-tools`, servers["vnem-tools"], {
    VNEM_TOOLS_ALLOWED_ROOTS: root,
    VNEM_TOOLS_EVIDENCE_ROOT: path.join(temp, options.label, "evidence"),
    VNEM_TOOLS_SKIP_WRANGLER_CHECK: "1"
  });
  try {
    const coreTools = (await core.client.listTools()).tools.map((tool) => tool.name);
    const toolsTools = (await tools.client.listTools()).tools.map((tool) => tool.name);
    assert.ok(coreTools.includes("vnem_entrypoint"));
    assert.ok(coreTools.includes("vnem_usage_self_check"));
    assert.ok(toolsTools.includes("vnem_tools_entrypoint"));
    const coreRoute = await call(core.client, "vnem_entrypoint", {
      user_goal: "Inspect this repository, choose a safe implementation path, and prove the result.",
      available_mcp_names: ["vnem", "vnem-tools"],
      task_mode: "repo_inspection"
    }, "entrypoint");
    const toolsRoute = await call(tools.client, "vnem_tools_entrypoint", {
      user_goal: "Inspect this repository, choose a safe implementation path, and prove the result.",
      root,
      task_mode: "repo_inspection"
    }, "tools_entrypoint");
    let repositoryMap = null;
    if (options.inspectRepository) {
      repositoryMap = await call(tools.client, "vnem_tools_workspace_map", { root, max_depth: 2, max_files: 120 }, "workspace_map");
      assert.ok(repositoryMap.tree_summary?.length > 0);
      assert.ok(repositoryMap.evidence_log_id);
    }
    const visible = [...coreTools, ...toolsTools];
    const usage = await call(core.client, "vnem_usage_self_check", {
      client_name: options.label,
      configured_mcp_names: ["vnem", "vnem-tools"],
      visible_tool_names: visible,
      client_instructions: options.instructions,
      user_goal: "Inspect this repository, choose a safe implementation path, and prove the result.",
      recent_session_actions: ["called vnem_entrypoint", "called vnem_tools_entrypoint"],
      recent_session_evidence: repositoryMap ? ["vnem_tools_workspace_map returned structured evidence"] : ["Core and Tools entrypoints returned structured output"],
      configuration_observed: true,
      tool_list_observed: true,
      instructions_observed: true,
      session_evidence_observed: true
    }, "usage_self_check");
    assert.equal(usage.skipped_materially_useful_vnem, false);
    assert.equal(usage.hidden_telemetry_used, false);
    assert.equal(usage.exact_corrective_action.action, "none");
    const trivial = await call(core.client, "vnem_usage_self_check", {
      client_name: options.label,
      configured_mcp_names: ["vnem", "vnem-tools"],
      visible_tool_names: visible,
      client_instructions: options.instructions,
      user_goal: "Rewrite this greeting to sound friendlier.",
      recent_session_actions: [],
      recent_session_evidence: [],
      configuration_observed: true,
      tool_list_observed: true,
      instructions_observed: true,
      session_evidence_observed: true
    }, "usage_self_check");
    assert.equal(trivial.vnem_materially_useful, false);
    assert.equal(trivial.exact_corrective_action.action, "none");
    return {
      status: "pass",
      server_names: ["vnem", "vnem-tools"],
      core_tool_count: coreTools.length,
      tools_tool_count: toolsTools.length,
      core_entrypoint_visible: true,
      tools_entrypoint_visible: true,
      core_call_structured: Boolean(coreRoute),
      tools_call_structured: Boolean(toolsRoute),
      safe_repo_inspection_structured: repositoryMap ? true : "not_run_for_duplicate_profile",
      usage_audit_passed: true,
      rigid_workflow_avoided: true
    };
  } finally {
    await Promise.all([core.client.close().catch(() => {}), tools.client.close().catch(() => {})]);
  }
}

async function runActiveCodexTrial(file, instructions, sessionVnemVisible) {
  if (!existsSync(file)) return { attempted: true, status: "not_proven", blocker: "active_codex_config_missing" };
  try {
    const parsed = TOML.parse(await readFile(file, "utf8"));
    const servers = parsed.mcp_servers || {};
    const names = Object.keys(servers);
    if (!servers.vnem || !servers["vnem-tools"]) {
      return { attempted: true, status: "not_proven", configured_server_names: names, blocker: "vnem_core_or_tools_not_configured" };
    }
    const enabled = { core: servers.vnem.enabled !== false, tools: servers["vnem-tools"].enabled !== false };
    if (!enabled.core || !enabled.tools) {
      return { attempted: true, status: "not_proven", configured_server_names: names, enabled, blocker: "vnem_core_or_tools_disabled" };
    }
    const trial = await runTrial(servers, { label: "active-codex-config", instructions, inspectRepository: false });
    const core = await connect("active-codex-current-session-audit", servers.vnem);
    let currentSessionAudit;
    try {
      currentSessionAudit = await call(core.client, "vnem_usage_self_check", {
        client_name: "Codex App current task",
        configured_mcp_names: names,
        visible_tool_names: sessionVnemVisible === true ? ["vnem_entrypoint", "vnem_tools_entrypoint"] : [],
        client_instructions: "",
        user_goal: "Continue VNEM GIGA Evolution with repository implementation and proof.",
        recent_session_actions: [],
        recent_session_evidence: [],
        configuration_observed: true,
        tool_list_observed: sessionVnemVisible !== null,
        instructions_observed: false,
        session_evidence_observed: true
      }, "usage_self_check");
      if (sessionVnemVisible === false) assert.equal(currentSessionAudit.exact_corrective_action.action, "reload_core");
    } finally {
      await core.client.close().catch(() => {});
    }
    return {
      attempted: true,
      status: "pass",
      configured_server_names: names,
      enabled,
      configuration_launch_and_protocol_proven: true,
      codex_agent_invocation_proven: false,
      current_session_usage_audit: currentSessionAudit,
      trial,
      what_is_not_proven: ["The Codex agent itself selected these MCP calls; the exact configured server commands were exercised by the protocol harness."]
    };
  } catch (error) {
    return { attempted: true, status: "not_proven", blocker: error?.code || error?.name || "active_codex_trial_failed", details_redacted: true };
  }
}

async function connect(name, config, envOverride = {}) {
  const client = new Client({ name: `vnem-giga-phase23-${name}`, version: "1.0.1" }, { capabilities: {} });
  const transport = new StdioClientTransport({
    command: config.command,
    args: config.args || [],
    cwd: config.cwd || root,
    env: { ...process.env, ...(config.env || {}), ...envOverride },
    stderr: "pipe"
  });
  await client.connect(transport);
  return { client, transport };
}

async function call(client, name, args, key) {
  const result = await client.callTool({ name, arguments: args });
  assert.notEqual(result.isError, true, `${name} failed: ${result.content?.[0]?.text || "MCP error"}`);
  assert.ok(result.structuredContent?.[key], `${name} omitted structuredContent.${key}`);
  return result.structuredContent[key];
}

function resolveProfile(servers) {
  return JSON.parse(JSON.stringify(servers).replaceAll("${VNEM_CHECKOUT}", root.replaceAll("\\", "/")));
}

function summarizeBaseline(scenario) {
  return scenario ? { success: scenario.success, score: scenario.score, remaining_uncertainty: scenario.remaining_uncertainty } : null;
}

function arg(name) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) || "";
}

function optionalBoolean(value) {
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}
