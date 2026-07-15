#!/usr/bin/env node
import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { TestingCiRuntime } from "./vnem/testing/runtime.mjs";
import { manifestResourceHints } from "./vnem/testing/suite-manifest.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const benchmarkOutput = valueArg("benchmark-output");
const tempRoot = await mkdtemp(path.join(os.tmpdir(), "vnem-testing-ci-"));
const projectRoot = path.join(tempRoot, "project");
const evidenceRoot = path.join(projectRoot, ".vnem", "tool-runs");
const timings = [];
const startedAt = performance.now();
await cp(path.join(rootDir, "fixtures", "testing-ci"), projectRoot, { recursive: true });

const client = new Client({ name: "vnem-tools-giga-testing-ci", version: "1.0.1" }, { capabilities: {} });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(scriptDir, "vnem-tools-mcp-server.mjs")],
  cwd: rootDir,
  env: {
    ...process.env,
    VNEM_TOOLS_ALLOWED_ROOTS: projectRoot,
    VNEM_TOOLS_PERMISSION_PROFILE: "safe-local-dev",
    VNEM_TOOLS_EVIDENCE_ROOT: evidenceRoot
  },
  stderr: "pipe"
});
let stderr = "";
transport.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });

try {
  await client.connect(transport);
  const names = new Set((await client.listTools()).tools.map((tool) => tool.name));
  for (const name of [
    "vnem_tools_test_system_inspect",
    "vnem_tools_affected_test_graph",
    "vnem_tools_test_run",
    "vnem_tools_ci_failure_diagnose",
    "vnem_tools_coverage_benchmark_report"
  ]) assert.equal(names.has(name), true, `missing ${name}`);

  const inspection = await call("vnem_tools_test_system_inspect", { root: projectRoot });
  const system = inspection.structuredContent.test_system_inspection;
  assert.deepEqual(system.test_frameworks, ["Node assertion scripts"]);
  assert.equal(system.package_manager, "unknown");
  assert.equal(system.ci_workflows[0].runtime_deprecations.length, 2);
  assert.equal(system.reliability_contract.binary_archives_excluded_from_source_text_scans, true);

  const affected = await call("vnem_tools_affected_test_graph", { root: projectRoot, changed_files: ["src/math.mjs"] });
  const graph = affected.structuredContent.affected_test_graph;
  assert.deepEqual(new Set(graph.selected_scripts), new Set(["lint", "test:unit", "test:integration"]));
  assert.equal(graph.graph_summary.filename_substring_only_selection, false);
  assert.ok(graph.selected_tests.find((item) => item.script === "test:integration").reasons.includes("transitive import graph"));

  const dry = await call("vnem_tools_test_run", { root: projectRoot, tier: "affected", changed_files: ["src/math.mjs"], max_parallel: 2 });
  assert.equal(dry.structuredContent.test_run.executed, false);
  assert.equal(dry.structuredContent.test_run.task_count, 3);
  const unapproved = await client.callTool({ name: "vnem_tools_test_run", arguments: { root: projectRoot, tier: "affected", changed_files: ["src/math.mjs"], max_parallel: 2, dry_run: false } });
  assert.equal(unapproved.isError, true);
  assert.equal(unapproved.structuredContent.code, "approval_required");
  const executed = await call("vnem_tools_test_run", { root: projectRoot, tier: "affected", changed_files: ["src/math.mjs"], max_parallel: 2, dry_run: false, approved: true, approval_note: "approve isolated affected fixture checks" });
  const run = executed.structuredContent.test_run;
  assert.equal(run.status, "passed");
  assert.deepEqual(run.counts, { planned: 3, completed: 3, passed: 3, failed: 0, skipped: 0 });
  assert.equal(run.retries.attempted, 0);
  assert.equal(run.flaky_indicators.length, 0);
  assert.equal(run.reliability.resource_conflicts_prevented, true);
  assert.equal(run.results.every((item) => item.evidence_dir && item.exit_code === 0), true);
  const savedRun = JSON.parse(await readFile(path.join(projectRoot, run.report_path), "utf8"));
  assert.equal(savedRun.report_path, run.report_path);
  assert.equal(savedRun.summary_path, run.summary_path);

  const failureLog = [
    "Run npm test",
    "AssertionError [ERR_ASSERTION]: dev-server port remained occupied",
    "    at scripts/test-tools-giga-project-automation.mjs:165:10",
    "Process completed with exit code 1"
  ].join("\n");
  const diagnosis = await call("vnem_tools_ci_failure_diagnose", { root: projectRoot, workflow_path: ".github/workflows/ci.yml", job: "test", step: "npm test", command: "npm test", run_id: "29259837515", log: failureLog, changed_files: ["src/math.mjs"] });
  const failure = diagnosis.structuredContent.ci_failure_diagnosis;
  assert.equal(failure.classification, "process_cleanup_failure");
  assert.equal(failure.branch_caused, true);
  assert.equal(failure.infrastructure_caused, false);
  assert.equal(failure.step, "npm test");
  assert.match(failure.smallest_safe_fix, /ownership and wait-for-release/);
  const scheduling = await call("vnem_tools_ci_failure_diagnose", { root: projectRoot, workflow_path: ".github/workflows/ci.yml", status: "queued", conclusion: "", run_id: "29260000000", log: "The job is waiting for a runner. No runner matching the specified labels was found." });
  assert.equal(scheduling.structuredContent.ci_failure_diagnosis.classification, "scheduling_failure");
  assert.equal(scheduling.structuredContent.ci_failure_diagnosis.branch_caused, false);

  const coverage = await call("vnem_tools_coverage_benchmark_report", { root: projectRoot, changed_files: ["src/math.mjs"], critical_paths: ["src/math.mjs", "src/service.mjs"], baseline_label: "baseline", post_label: "phase-9" });
  const report = coverage.structuredContent.coverage_benchmark_report;
  assert.equal(report.coverage.available, true);
  assert.equal(report.coverage.totals.lines.pct, 80);
  assert.deepEqual(report.coverage.uncovered_critical_paths, ["src/service.mjs"]);
  assert.equal(report.benchmarks.comparisons.find((item) => item.metric === "full_test_duration_ms").change_percent, -40);
  assert.equal(report.benchmarks.regressions.length, 0);

  const repositoryRuntime = new TestingCiRuntime({
    allowedRoots: [rootDir],
    evidenceRoot: path.join(rootDir, ".vnem", "test-runs")
  });
  const repositoryGraph = await repositoryRuntime.affectedGraph({ root: rootDir, changed_files: ["scripts/vnem/testing/runtime.mjs"] });
  assert.deepEqual(new Set(repositoryGraph.selected_scripts), new Set([
    "test:tools-giga-testing-ci",
    "test:giga-final-integration",
    "test:tools-mcp",
    "test:runtime-registry",
    "registry:behavior:check",
    "registry:check"
  ]));
  assert.equal(repositoryGraph.selected_scripts.some((script) => ["test", "test:affected", "test:full", "test:ci"].includes(script)), false);
  const packageGraph = await repositoryRuntime.affectedGraph({ root: rootDir, changed_files: ["package.json"] });
  assert.equal(packageGraph.selected_scripts.includes("build"), false, "VNEM build aggregate must expand before command-policy review");
  assert.equal(packageGraph.selected_scripts.includes("giga:benchmark"), false, "affected checks must not overwrite the immutable GIGA baseline");
  assert.ok(["validate", "generate", "dashboard:build"].every((script) => packageGraph.selected_scripts.includes(script)));
  for (const script of ["generate", "test:giga-final-integration", "test:giga-adoption-client-use", "test:vnem-install-adoption-1-regression"]) {
    assert.ok(manifestResourceHints(script).includes("repo-generated-state"), `${script} must serialize generated-state access`);
  }
  const capabilityGraph = await repositoryRuntime.affectedGraph({ root: rootDir, changed_files: ["scripts/vnem/giga/capability-benchmark.mjs"] });
  assert.equal(capabilityGraph.selected_scripts.includes("giga:benchmark"), false);
  assert.equal(capabilityGraph.selected_scripts.includes("test:giga-capability-current"), true);
  const clientBoundary = await repositoryRuntime.affectedGraph({ root: rootDir, changed_files: ["scripts/vnem/clients/setup.mjs"] });
  assert.equal(clientBoundary.selected_scripts.includes("test:clients"), false);
  assert.equal(clientBoundary.selected_scripts.includes("test:clients:setup"), true);
  const repositoryCoverage = await repositoryRuntime.coverageBenchmarks({ root: rootDir, baseline_label: "baseline", post_label: "phase-9" });
  assert.equal(repositoryCoverage.coverage.available, false, "nested fixture reports must not be treated as repository coverage");
  assert.equal(repositoryCoverage.benchmarks.comparisons.find((item) => item.metric === "full_test_duration_ms").change_percent < -70, true);

  if (benchmarkOutput) {
    const outputPath = path.resolve(rootDir, benchmarkOutput);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify({
      schema_version: 1,
      phase: 9,
      generated_at: new Date().toISOString(),
      benchmark_type: "actual_mcp_testing_ci_execution",
      mcp_transport: "stdio",
      total_duration_ms: Number((performance.now() - startedAt).toFixed(2)),
      tool_calls: timings,
      proof: {
        tools_registered: 5,
        frameworks_detected: system.test_frameworks,
        workflow_runtime_deprecations: system.ci_workflows[0].runtime_deprecations.length,
        changed_file: "src/math.mjs",
        selected_scripts: graph.selected_scripts,
        transitive_integration_selected: graph.selected_tests.find((item) => item.script === "test:integration").reasons.includes("transitive import graph"),
        filename_substring_only: graph.graph_summary.filename_substring_only_selection,
        affected_run_status: run.status,
        affected_run_duration_ms: run.duration_ms,
        affected_run_counts: run.counts,
        retries_attempted: run.retries.attempted,
        branch_failure_classification: failure.classification,
        scheduling_not_code_failure: scheduling.structuredContent.ci_failure_diagnosis.scheduling_failure,
        line_coverage_percent: report.coverage.totals.lines.pct,
        uncovered_critical_paths: report.coverage.uncovered_critical_paths,
        baseline_post_change_percent: report.benchmarks.comparisons.find((item) => item.metric === "full_test_duration_ms").change_percent
      },
      limitations: [
        "Static import/reference analysis does not execute dynamic framework resolvers.",
        "Fixture coverage proves report ingestion and critical-path analysis, not VNEM repository line coverage.",
        "Log-based CI diagnosis is not live remote status proof unless a remote run is separately inspected."
      ]
    }, null, 2)}\n`, "utf8");
  }

  console.log("vnem Tools GIGA testing/CI MCP tests passed");
} catch (error) {
  if (stderr.trim()) console.error(stderr.trim());
  throw error;
} finally {
  await client.close().catch(() => {});
  await removeTempRoot(tempRoot);
}

async function call(name, args) {
  const started = performance.now();
  let result;
  if (name === "vnem_tools_test_system_inspect") result = await client.callTool({ name: "vnem_tools_test_system_inspect", arguments: args });
  else if (name === "vnem_tools_affected_test_graph") result = await client.callTool({ name: "vnem_tools_affected_test_graph", arguments: args });
  else if (name === "vnem_tools_test_run") result = await client.callTool({ name: "vnem_tools_test_run", arguments: args });
  else if (name === "vnem_tools_ci_failure_diagnose") result = await client.callTool({ name: "vnem_tools_ci_failure_diagnose", arguments: args });
  else if (name === "vnem_tools_coverage_benchmark_report") result = await client.callTool({ name: "vnem_tools_coverage_benchmark_report", arguments: args });
  else throw new Error(`Unexpected tool ${name}`);
  timings.push({ tool: name, duration_ms: Number((performance.now() - started).toFixed(2)), status: result.isError ? "error" : "ok" });
  if (result.isError) throw new Error(`${name} failed: ${JSON.stringify(result.structuredContent || result.content)}`);
  return result;
}

async function removeTempRoot(root) {
  let lastError;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      return;
    } catch (error) {
      lastError = error;
      if (!["EBUSY", "EPERM", "ENOTEMPTY", "EACCES"].includes(error.code)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  throw lastError;
}

function valueArg(name) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) || "";
}
