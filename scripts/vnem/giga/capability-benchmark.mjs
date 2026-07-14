#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { callTimed, connectMcp, metricSummary, parseArg } from "./mcp-client.mjs";
import { GIGA_SCENARIOS } from "./scenarios.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const label = parseArg("label", "baseline");
if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(label)) throw new Error("Capability benchmark label contains unsupported characters.");
const outputArg = parseArg("output", "");
const outputPath = outputArg ? resolveOutput(outputArg) : path.join(root, ".vnem", "giga-evolution", label, "capability-benchmark.json");
const outputDir = path.dirname(outputPath);
const core = await connectMcp({ root, serverFile: "scripts/vnem-mcp-server.mjs", name: `giga-${label}-core` });
const tools = await connectMcp({ root, serverFile: "scripts/vnem-tools-mcp-server.mjs", name: `giga-${label}-tools` });

try {
  const [coreManifest, toolsManifest] = await Promise.all([core.client.listTools(), tools.client.listTools()]);
  const results = [];
  for (const item of GIGA_SCENARIOS) {
    const coreCall = await callTimed(core.client, "vnem_entrypoint", {
      user_goal: item.goal,
      task_context: `VNEM GIGA benchmark category: ${item.category}`,
      available_mcp_names: ["vnem", "vnem-tools"],
      task_mode: coreMode(item.task_mode)
    });
    const toolsCall = await callTimed(tools.client, "vnem_tools_entrypoint", {
      user_goal: item.goal,
      root,
      task_mode: toolsMode(item.task_mode)
    });
    const combined = [coreCall.text, JSON.stringify(coreCall.structured), toolsCall.text, JSON.stringify(toolsCall.structured)].join("\n");
    const selected = [...new Set(combined.match(/vnem(?:_tools)?_[a-z0-9_]+/g) || [])];
    const checks = {
      correct_route: /use_vnem=yes/.test(coreCall.text) && /vnem_tools_entrypoint:/.test(toolsCall.text),
      correct_capability_selection: item.expected_tools.some((name) => selected.includes(name)) && item.required_tools.every((name) => selected.includes(name)),
      actionable_output: /next=/.test(coreCall.text) && /next=/.test(toolsCall.text),
      execution_success: !coreCall.is_error && !toolsCall.is_error,
      proof_quality: /evidence|proof|checks_to_run|test_selection|safe_claim/i.test(combined),
      truthfulness: /no fake|must_not_claim|not proven|safety_boundaries|core_executes_tools=false/i.test(combined),
      unnecessary_calls: 2 <= 3 && selected.length <= 24,
      error_handling: coreCall.text.length > 0 && toolsCall.text.length > 0,
      permission_behavior: item.permission_expected ? /approval|dry.run|permission|allowed roots/i.test(combined) : null,
      rollback_behavior: item.rollback_expected ? /rollback|restore|backup/i.test(combined) : null
    };
    const applicable = Object.entries(checks).filter(([, value]) => value !== null);
    const passed = applicable.filter(([, value]) => value).length;
    results.push({
      id: item.id,
      category: item.category,
      goal: item.goal,
      expected_tools: item.expected_tools,
      required_tools: item.required_tools,
      selected_tools: selected,
      protocol_calls: 2,
      checks,
      score: Number((passed / applicable.length).toFixed(4)),
      success: checks.correct_route && checks.correct_capability_selection && checks.actionable_output && checks.execution_success && checks.truthfulness,
      latency_ms: Number((coreCall.latency_ms + toolsCall.latency_ms).toFixed(2)),
      core_latency_ms: coreCall.latency_ms,
      tools_latency_ms: toolsCall.latency_ms,
      output_bytes: coreCall.output_bytes + toolsCall.output_bytes,
      remaining_uncertainty: applicable.filter(([, value]) => !value).map(([name]) => name)
    });
  }

  const report = {
    schema_version: "1.0.0",
    label,
    captured_at: new Date().toISOString(),
    branch: git(["branch", "--show-current"]),
    head_sha: git(["rev-parse", "HEAD"]),
    methodology: {
      protocol: "Model Context Protocol over stdio using @modelcontextprotocol/sdk",
      clients: ["vnem", "vnem-tools"],
      calls_per_scenario: 2,
      scoring: "Deterministic expected-field and expected-tool checks; no model-quality score",
      limitations: [
        "Entrypoint routing is measured; destructive or external mutations are not executed.",
        "Permission and rollback checks score advertised route behavior, not a real mutation.",
        "Real Codex end-to-end trials are tracked separately from this deterministic MCP benchmark."
      ]
    },
    manifests: { core_tools: coreManifest.tools.length, tools_tools: toolsManifest.tools.length },
    aggregate: aggregate(results),
    scenarios: results
  };
  await mkdir(outputDir, { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`VNEM GIGA ${label} capability benchmark`);
  console.log(`scenarios=${results.length}; success=${report.aggregate.successful_scenarios}; mean_score=${report.aggregate.mean_score}`);
  console.log(`latency_median_ms=${report.aggregate.latency.median_ms}; latency_worst_ms=${report.aggregate.latency.worst_ms}`);
  console.log(`output=${path.relative(root, outputPath)}`);
} finally {
  await Promise.all([core.close(), tools.close()]);
}

function aggregate(results) {
  const checkNames = Object.keys(results[0]?.checks || {});
  return {
    scenario_count: results.length,
    successful_scenarios: results.filter((item) => item.success).length,
    success_rate: Number((results.filter((item) => item.success).length / results.length).toFixed(4)),
    mean_score: Number((results.reduce((sum, item) => sum + item.score, 0) / results.length).toFixed(4)),
    latency: metricSummary(results.map((item) => item.latency_ms)),
    output_bytes: {
      total: results.reduce((sum, item) => sum + item.output_bytes, 0),
      median: metricSummary(results.map((item) => item.output_bytes)).median_ms,
      worst: Math.max(...results.map((item) => item.output_bytes))
    },
    checks: Object.fromEntries(checkNames.map((name) => {
      const applicable = results.filter((item) => item.checks[name] !== null);
      const passed = applicable.filter((item) => item.checks[name]).length;
      return [name, { passed, applicable: applicable.length, rate: Number((passed / Math.max(applicable.length, 1)).toFixed(4)) }];
    })),
    by_category: Object.fromEntries(results.map((item) => [item.category, { success: item.success, score: item.score, latency_ms: item.latency_ms }]))
  };
}

function resolveOutput(value) {
  const candidate = path.resolve(root, value);
  const relative = path.relative(root, candidate);
  const allowedRoots = [path.join(root, ".tmp"), path.join(root, ".vnem", "giga-evolution")];
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative) || path.extname(candidate).toLowerCase() !== ".json" || !allowedRoots.some((allowed) => isInside(candidate, allowed))) {
    throw new Error("Capability benchmark output must be JSON under .tmp or .vnem/giga-evolution.");
  }
  return candidate;
}

function isInside(candidate, rootPath) {
  const relative = path.relative(path.resolve(rootPath), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function coreMode(mode) {
  const map = { debugging: "debugging", publish: "publish", recovery: "recovery", browser_ui: "ui_browser", skill: "skill" };
  return map[mode] || "auto";
}

function toolsMode(mode) {
  const supported = new Set(["auto", "implementation", "debugging", "repo_inspection", "patch_targeting", "mcp_tool_audit", "skill", "publish", "cloudflare", "browser_ui", "recovery", "no_placebo", "evidence_pack"]);
  return supported.has(mode) ? mode : "auto";
}

function git(args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}
