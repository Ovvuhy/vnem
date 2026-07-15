import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, realpath, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";
import { ProjectAutomationRuntime } from "../tools/project-automation.mjs";
import {
  RETRY_POLICY,
  VNEM_FULL_SUITE,
  manifestResourceHints,
  scriptsForTier,
  stageForScript
} from "./suite-manifest.mjs";

const SKIPPED_DIRS = new Set([".git", "node_modules", "dist", "build", ".next", ".turbo", ".cache", "landing/dashboard", "landing-functions"]);
const SOURCE_EXTENSIONS = new Set([".cjs", ".js", ".jsx", ".mjs", ".ts", ".tsx"]);
const TEST_FILE_PATTERN = /(?:^|\/)(?:test|tests|__tests__)(?:\/|-)|\.(?:spec|test)\.[cm]?[jt]sx?$/i;
const CONFIG_FILE_PATTERN = /(?:^|\/)(?:vitest|jest|playwright|cypress|eslint|tsconfig|vite|webpack|rollup|nyc|babel|ava)(?:\.[^/]+)?$|(?:^|\/)\.github\/workflows\/[^/]+\.ya?ml$/i;
const COVERAGE_FILE_PATTERN = /^coverage\/(?:coverage-summary\.json|lcov\.info)$/i;
const MAX_FILES = 5000;
const MAX_TEXT_BYTES = 1024 * 1024;

export class TestingCiError extends Error {
  constructor(message, code = "testing_ci_error", details = {}) {
    super(message);
    this.name = "TestingCiError";
    this.code = code;
    this.details = details;
  }
}

export class TestingCiRuntime {
  constructor({ allowedRoots, evidenceRoot }) {
    this.allowedRoots = allowedRoots.map((root) => path.resolve(root));
    this.evidenceRoot = path.resolve(evidenceRoot);
    this.automation = new ProjectAutomationRuntime({ allowedRoots: this.allowedRoots, evidenceRoot: this.evidenceRoot });
  }

  async inspect(args = {}) {
    const root = await this.resolveRoot(args.root || this.allowedRoots[0]);
    const pkg = await readJson(path.join(root, "package.json"), true);
    const files = await collectFiles(root);
    const scripts = pkg?.scripts || {};
    const scriptSources = await mapScriptSources(root, scripts);
    const testFiles = files.filter((file) => TEST_FILE_PATTERN.test(file));
    const configs = files.filter((file) => CONFIG_FILE_PATTERN.test(file));
    const workflows = await inspectWorkflows(root, files.filter((file) => /^\.github\/workflows\/[^/]+\.ya?ml$/i.test(file)));
    const frameworks = detectTestFrameworks(pkg, scripts, testFiles, configs);
    const coverageTools = detectCoverageTools(pkg, scripts, files);
    const resourceMap = [];
    for (const [script, sourceFiles] of Object.entries(scriptSources)) {
      if (!/^test(?::|$)|^(?:lint|typecheck|build|validate)(?::|$)/.test(script)) continue;
      resourceMap.push({ script, source_files: sourceFiles, resources: await resourcesForScript(root, script, scripts[script], sourceFiles) });
    }
    const report = {
      schema_version: 1,
      operation_result: "inspected",
      root,
      package_manager: detectPackageManager(files),
      test_frameworks: frameworks,
      package_scripts: categorizeScripts(scripts),
      config_files: configs.slice(0, 120),
      test_locations: summarizeLocations(testFiles),
      test_files: testFiles.slice(0, 500),
      coverage: {
        tools: coverageTools,
        reports_present: files.filter((file) => COVERAGE_FILE_PATTERN.test(file)),
        changed_line_coverage_available: files.some((file) => /coverage\/lcov\.info$/i.test(file))
      },
      ci_workflows: workflows,
      generated_file_implications: generatedImplications(files, scripts),
      resource_isolation: resourceMap,
      reliability_contract: {
        unique_run_directory: true,
        bounded_per_task_logs: true,
        process_tree_timeout_cleanup: true,
        parallel_only_without_resource_overlap: true,
        retry_policy: RETRY_POLICY,
        binary_archives_excluded_from_source_text_scans: true
      },
      limitations: [
        coverageTools.length ? null : "No configured coverage producer was detected; VNEM can ingest coverage-summary.json or lcov.info but does not invent coverage.",
        "Static import/reference analysis does not execute dynamic module resolution or framework-specific build plugins."
      ].filter(Boolean)
    };
    return report;
  }

  async affectedGraph(args = {}) {
    const root = await this.resolveRoot(args.root || this.allowedRoots[0]);
    const pkg = await readJson(path.join(root, "package.json"), true);
    if (!pkg) throw new TestingCiError("package.json is required for affected-test selection.", "package_json_missing");
    const files = await collectFiles(root);
    const changedFiles = unique((args.changed_files?.length ? args.changed_files : await gitChangedFiles(root, args.base)).map(normalizePath));
    const graph = await buildSourceGraph(root, files);
    const scriptSources = await mapScriptSources(root, pkg.scripts || {});
    const sourceToScripts = invertScriptSources(scriptSources);
    const testFiles = files.filter((file) => TEST_FILE_PATTERN.test(file));
    const testTexts = new Map();
    const selections = new Map();
    const isVnem = pkg.name === "vnem" && Object.hasOwn(pkg.scripts || {}, "test:agents-rules");
    const runnerEntrypoints = new Set(["test", "test:smoke", "test:affected", "test:core", "test:tools", "test:precision-compat", "test:clients", "test:integration", "test:benchmarks", "test:full", "test:ci"]);

    const add = (script, reason, evidence = []) => {
      if (!script || !Object.hasOwn(pkg.scripts || {}, script)) return;
      if (isVnem && runnerEntrypoints.has(script)) {
        const expandableTier = script === "test:smoke" ? "smoke" : script === "test:clients" ? "clients" : null;
        if (expandableTier) {
          for (const leaf of scriptsForTier(expandableTier)) add(leaf, `${reason}; expanded trusted tier entrypoint`, evidence);
        }
        return;
      }
      if (isVnem && script === "test:giga-baseline") {
        for (const leaf of ["test:giga-baseline:capability", "test:runtime-registry", "registry:behavior:check", "registry:check"]) add(leaf, `${reason}; expanded trusted aggregate`, evidence);
        return;
      }
      if (isVnem && script === "test:giga-runtime-contracts") {
        for (const leaf of ["test:runtime-registry", "registry:behavior:check", "registry:check"]) add(leaf, `${reason}; expanded trusted aggregate`, evidence);
        return;
      }
      if (isVnem && script === "build") {
        for (const leaf of ["validate", "generate", "dashboard:build"]) add(leaf, `${reason}; expanded trusted aggregate`, evidence);
        return;
      }
      const current = selections.get(script) || { script, reasons: [], evidence: [] };
      current.reasons.push(reason);
      current.evidence.push(...evidence);
      selections.set(script, current);
    };

    for (const changed of changedFiles) {
      for (const script of preferredScriptsForSource(sourceToScripts.get(changed) || [], pkg.scripts || {})) add(script, "changed package-script source", [changed]);
      const importers = transitiveImporters(changed, graph.reverseImports);
      for (const importer of importers) {
        if (!TEST_FILE_PATTERN.test(importer)) continue;
        for (const script of preferredScriptsForSource(sourceToScripts.get(importer) || [], pkg.scripts || {})) add(script, "transitive import graph", [changed, importer]);
      }

      const changedText = await readText(path.join(root, changed));
      const ownedTools = unique(changedText.match(/vnem_(?:tools_)?[a-z0-9_]+/gi) || []);
      if (ownedTools.length) {
        for (const testFile of testFiles) {
          let text = testTexts.get(testFile);
          if (text === undefined) {
            text = await readText(path.join(root, testFile));
            testTexts.set(testFile, text);
          }
          const matched = ownedTools.filter((tool) => text.includes(tool));
          if (!matched.length) continue;
          for (const script of preferredScriptsForSource(sourceToScripts.get(testFile) || [], pkg.scripts || {})) add(script, "tool ownership reference", [changed, testFile, ...matched.slice(0, 4)]);
        }
      }
      applyIntegrationBoundaries(changed, add);
      applyGeneratedOwnership(changed, add);
    }

    if (changedFiles.includes("package.json")) {
      for (const script of genericSmokeScripts(pkg.scripts || {})) add(script, "package script contract changed", ["package.json"]);
    }
    if (changedFiles.some((file) => /^\.github\/workflows\//.test(file))) {
      for (const script of genericSmokeScripts(pkg.scripts || {})) add(script, "CI workflow integration boundary", changedFiles.filter((file) => /^\.github\/workflows\//.test(file)));
    }
    if (!selections.size && changedFiles.some((file) => /\.md$/i.test(file))) addExisting(add, pkg.scripts || {}, "test:public-repo-hygiene", "documentation/public hygiene boundary", changedFiles);
    if (!selections.size && changedFiles.length) {
      for (const script of genericSmokeScripts(pkg.scripts || {})) add(script, "bounded fallback because static graph found no executable edge", changedFiles);
    }

    const selected = [...selections.values()].map((item) => ({
      ...item,
      reasons: unique(item.reasons),
      evidence: unique(item.evidence).slice(0, 20)
    }));
    const fullTriggers = [];
    if (changedFiles.includes("package.json")) fullTriggers.push("package script orchestration changed");
    if (changedFiles.some((file) => /^scripts\/vnem\/(?:tools|core)\/server\.mjs$/.test(file)) && changedFiles.length > 20) fullTriggers.push("shared MCP server and broad change set");
    if (changedFiles.some((file) => /^scripts\/vnem\/testing\//.test(file) || /^\.github\/workflows\/ci\.yml$/.test(file))) fullTriggers.push("test runner or CI contract changed");
    if (changedFiles.some((file) => /^scripts\/generate-|^registry\/|^schemas\//.test(file))) fullTriggers.push("generator inputs or outputs changed");

    return {
      schema_version: 1,
      operation_result: "selected",
      root,
      changed_files: changedFiles,
      selected_tests: selected,
      selected_scripts: selected.map((item) => item.script),
      graph_summary: {
        source_files_indexed: graph.sourceFiles.length,
        import_edges: graph.importEdges,
        package_script_edges: [...sourceToScripts.values()].reduce((sum, items) => sum + items.length, 0),
        selection_basis: ["changed files", "import/reference graph", "package scripts", "tool ownership", "benchmark/generated ownership", "integration boundaries"],
        filename_substring_only_selection: false
      },
      full_suite_recommended: fullTriggers.length > 0,
      full_suite_triggers: fullTriggers,
      generated_checks: generatedChecksForChanges(changedFiles, pkg.scripts || {}),
      not_proven: [
        "Runtime-only dynamic imports and generated framework routes may require an integration test beyond the static graph.",
        "A selected test proves only the paths it executes; coverage evidence remains separate."
      ]
    };
  }

  async plan(args = {}) {
    const root = await this.resolveRoot(args.root || this.allowedRoots[0]);
    const pkg = await readJson(path.join(root, "package.json"), true);
    if (!pkg) throw new TestingCiError("package.json is required for test planning.", "package_json_missing");
    const tier = normalizeTier(args.tier || "affected");
    const affected = tier === "affected" ? await this.affectedGraph(args) : null;
    const isVnem = pkg.name === "vnem" && Object.hasOwn(pkg.scripts || {}, "test:agents-rules");
    const selectedScripts = isVnem
      ? scriptsForTier(tier, affected?.selected_scripts || [])
      : scriptsForGenericTier(tier, pkg.scripts || {}, affected?.selected_scripts || []);
    const missingScripts = selectedScripts.filter((script) => !Object.hasOwn(pkg.scripts || {}, script));
    if (missingScripts.length) throw new TestingCiError("Test manifest references missing package scripts.", "test_manifest_script_missing", { missing_scripts: missingScripts });
    const scriptSources = await mapScriptSources(root, pkg.scripts || {});
    const tasks = [];
    for (const script of selectedScripts) {
      const sourceFiles = scriptSources[script] || [];
      tasks.push({
        id: script,
        script,
        stage: isVnem ? stageForScript(script, tier) : 0,
        source_files: sourceFiles,
        resources: unique([...(isVnem ? manifestResourceHints(script) : []), ...(await resourcesForScript(root, script, pkg.scripts[script], sourceFiles))]),
        timeout_ms: clamp(args.timeout_ms, 5_000, 120_000, 120_000),
        retry_eligible: RETRY_POLICY.enabled_scripts.includes(script)
      });
    }
    return {
      schema_version: 1,
      operation_result: "planned",
      root,
      tier,
      tasks,
      task_count: tasks.length,
      stages: unique(tasks.map((task) => task.stage)).sort((a, b) => a - b),
      max_parallel: clamp(args.max_parallel, 1, 8, process.env.CI ? 3 : 4),
      affected_graph: affected,
      compatibility: isVnem && ["full", "ci"].includes(tier) ? {
        previous_npm_test_commands: VNEM_FULL_SUITE.length,
        preserved_legacy_entries: VNEM_FULL_SUITE.length,
        executable_leaf_tasks: tasks.length,
        renamed_leaf_scripts: [{ legacy_script: "test:clients", leaf_task: "test:clients:setup", reason: "test:clients is now the required public tier entrypoint" }],
        expanded_aggregates: [{ script: "test:giga-baseline", leaf_tasks: ["test:giga-baseline:capability", "test:runtime-registry", "registry:behavior:check", "registry:check"] }],
        phase_additions: ["test:tools-giga-testing-ci", "test:tools-giga-browser-interaction", "test:tools-giga-windows-local", "test:tools-giga-github-development"],
        exact_manifest_preserved: tasks.length === VNEM_FULL_SUITE.length + 7
      } : null,
      safety: {
        stage_barriers: true,
        shared_resources_serialized: true,
        shell_operators_from_user_input: false,
        package_scripts_only: true,
        retries_only_for_explicit_infrastructure_signatures: true
      }
    };
  }

  async run(args = {}, onProgress = () => {}) {
    const plan = await this.plan(args);
    if (args.dry_run !== false) return { ...plan, executed: false, status: "planned" };
    const runId = `test-run-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const runDir = path.join(this.evidenceRoot, "testing-ci", runId);
    await mkdir(runDir, { recursive: true });
    const startedAt = Date.now();
    const results = [];
    let completed = 0;
    onProgress({ type: "run_start", run_id: runId, tier: plan.tier, total: plan.task_count, max_parallel: plan.max_parallel });

    for (const stage of plan.stages) {
      const stageTasks = plan.tasks.filter((task) => task.stage === stage);
      const stageResults = await runResourceAware(stageTasks, plan.max_parallel, async (task) => {
        onProgress({ type: "task_start", script: task.script, stage, completed, total: plan.task_count });
        const result = await this.runTask(plan.root, task, args);
        completed += 1;
        onProgress({ type: "task_finish", script: task.script, status: result.status, duration_ms: result.duration_ms, completed, total: plan.task_count });
        return result;
      });
      results.push(...stageResults);
      if (stageResults.some((result) => result.status === "failed") && args.continue_on_failure !== true) break;
    }

    const finishedAt = Date.now();
    const report = buildRunReport({ plan, runId, runDir, startedAt, finishedAt, results });
    const reportPath = args.report_path ? await resolveOutputPath(plan.root, args.report_path) : path.join(runDir, "report.json");
    const summaryPath = args.summary_path ? await resolveOutputPath(plan.root, args.summary_path) : path.join(runDir, "summary.md");
    report.report_path = normalizePath(path.relative(plan.root, reportPath));
    report.summary_path = normalizePath(path.relative(plan.root, summaryPath));
    await atomicWrite(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    await atomicWrite(summaryPath, `${humanRunSummary(report)}\n`);
    onProgress({ type: "run_finish", status: report.status, duration_ms: report.duration_ms, passed: report.counts.passed, failed: report.counts.failed });
    return report;
  }

  async runTask(root, task, args) {
    const attempts = [];
    const maxAttempts = task.retry_eligible ? RETRY_POLICY.infrastructure_attempts : RETRY_POLICY.default_attempts;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const startedAt = Date.now();
      const review = await this.automation.reviewCommand({ root, mode: "project_script", script: task.script });
      const command = await this.automation.runCommand({
        root,
        mode: "project_script",
        script: task.script,
        review_id: review.review_id,
        dry_run: false,
        approved: true,
        approval_note: args.approval_note || "approved test runner execution",
        timeout_ms: task.timeout_ms,
        max_output_bytes: clamp(args.max_output_bytes, 1024, 65536, 12000)
      });
      const execution = command.execution;
      const output = `${execution.stdout || ""}\n${execution.stderr || ""}`;
      const classification = classifyFailure(output, execution);
      const result = {
        script: task.script,
        status: execution.ok ? "passed" : "failed",
        attempt,
        duration_ms: Date.now() - startedAt,
        exit_code: execution.exit_code,
        signal: execution.signal,
        timed_out: execution.timed_out,
        failure_classification: execution.ok ? null : classification.classification,
        infrastructure_failure: execution.ok ? false : classification.infrastructure,
        resources: task.resources,
        source_files: task.source_files,
        output_summary: execution.output_summary,
        evidence_dir: execution.evidence_dir,
        process_tree_termination_evidence: execution.process_tree_termination_evidence
      };
      attempts.push(result);
      if (execution.ok) return { ...result, attempts };
      if (!task.retry_eligible || !classification.infrastructure || attempt === maxAttempts) return { ...result, attempts };
    }
  }

  async diagnoseCi(args = {}) {
    const root = await this.resolveRoot(args.root || this.allowedRoots[0]);
    const workflowPath = normalizePath(args.workflow_path || ".github/workflows/ci.yml");
    const workflowAbsolute = await resolveInside(root, workflowPath);
    const workflowText = await readText(workflowAbsolute);
    if (!workflowText) throw new TestingCiError("CI workflow was not found or was not readable.", "ci_workflow_missing", { workflow_path: workflowPath });
    let workflow;
    try {
      workflow = yaml.load(workflowText);
    } catch (error) {
      throw new TestingCiError("CI workflow YAML could not be parsed.", "ci_workflow_parse_failed", { workflow_path: workflowPath, error: error.message });
    }
    const log = redact(String(args.log || args.stderr || args.stdout || "")).slice(0, 120_000);
    const classification = classifyCiFailure(log, args);
    const steps = flattenWorkflowSteps(workflow);
    const failingStep = findFailingStep(steps, args.step, args.command, log);
    const changedFiles = unique((args.changed_files || []).map(normalizePath));
    const affected = changedFiles.length ? await this.affectedGraph({ root, changed_files: changedFiles }) : null;
    const fileMatch = log.match(/[A-Za-z0-9_.:/\\-]+\.(?:mjs|cjs|js|jsx|ts|tsx|json|ya?ml|md)(?::\d+)?/);
    const runStatus = String(args.status || "completed").toLowerCase();
    const conclusion = String(args.conclusion || (classification.classification === "scheduling_failure" ? "not_started" : "failure")).toLowerCase();
    const branchCaused = ["product_test_failure", "generated_artifact_mismatch", "process_cleanup_failure", "test_fixture_failure"].includes(classification.classification);
    return {
      schema_version: 1,
      operation_result: "diagnosed",
      workflow: { path: workflowPath, name: workflow?.name || path.basename(workflowPath), parsed: true },
      job: args.job || failingStep?.job || null,
      step: args.step || failingStep?.name || null,
      failing_command: args.command || failingStep?.run || extractFailingCommand(log),
      status: runStatus,
      conclusion,
      classification: classification.classification,
      branch_caused: branchCaused,
      infrastructure_caused: classification.infrastructure,
      scheduling_failure: classification.classification === "scheduling_failure",
      relevant_changed_files: affected?.selected_tests.flatMap((item) => item.evidence.filter((entry) => changedFiles.includes(entry))).filter(Boolean).slice(0, 40) || changedFiles,
      affected_tests: affected?.selected_scripts || [],
      likely_root_cause: classification.root_cause,
      exact_file_or_function_to_inspect: fileMatch ? normalizePath(fileMatch[0]) : classification.inspect,
      smallest_safe_fix: classification.smallest_fix,
      rerun: {
        eligible: classification.infrastructure && runStatus !== "in_progress" || branchCaused && args.fix_applied === true,
        condition: classification.infrastructure ? "one rerun is reasonable after confirming runner/network availability" : branchCaused ? "rerun only after the smallest branch fix is applied" : "inspect configuration before rerun",
        command: args.run_id ? `gh run rerun ${String(args.run_id).replace(/[^0-9]/g, "")}` : null
      },
      final_status: args.final_status || (runStatus === "in_progress" ? "pending" : conclusion),
      error_excerpt: compactFailureExcerpt(log),
      runtime_deprecations: detectWorkflowRuntimeWarnings(workflowText, log),
      must_not_claim: [
        classification.classification === "scheduling_failure" ? "Do not describe a queued, runner, billing, or scheduling failure as a code failure." : null,
        conclusion !== "success" ? "Do not claim CI passed until a completed successful run is observed." : null,
        !args.run_id ? "No live run identity was supplied; this diagnosis is log/workflow evidence, not remote status proof." : null
      ].filter(Boolean)
    };
  }

  async coverageBenchmarks(args = {}) {
    const root = await this.resolveRoot(args.root || this.allowedRoots[0]);
    const files = await collectFiles(root);
    const summaryPath = files.find((file) => /^coverage\/coverage-summary\.json$/i.test(file));
    const lcovPath = files.find((file) => /^coverage\/lcov\.info$/i.test(file));
    const coverageSummary = summaryPath ? await readJson(path.join(root, summaryPath), true) : null;
    const lcov = lcovPath ? parseLcov(await readText(path.join(root, lcovPath))) : null;
    const changedFiles = unique((args.changed_files || []).map(normalizePath));
    const criticalPaths = unique((args.critical_paths?.length ? args.critical_paths : [
      "scripts/vnem/core/intelligence.mjs",
      "scripts/vnem/tools/server.mjs",
      "scripts/vnem/tools/project-automation.mjs",
      "scripts/vnem/testing/runtime.mjs"
    ]).map(normalizePath));
    const coverage = normalizeCoverageSummary(coverageSummary, lcov);
    const benchmarkFiles = files.filter((file) => /^\.vnem\/giga-evolution\/[^/]+\/(?:performance|capability-benchmark|execution-benchmark)\.json$/.test(file));
    const history = [];
    for (const file of benchmarkFiles) {
      const data = await readJson(path.join(root, file), true);
      if (!data) continue;
      history.push({ file, label: file.split("/")[2], metrics: extractBenchmarkMetrics(data) });
    }
    history.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
    const baseline = selectBenchmarkRecord(history, args.baseline_label || "baseline");
    const post = args.post_label ? selectBenchmarkRecord(history, args.post_label) : selectLatestBenchmarkRecord(history);
    const comparisons = compareMetrics(baseline?.metrics || {}, post?.metrics || {}, Number(args.regression_threshold_percent || 10));
    const uncoveredCritical = criticalPaths.filter((file) => !coverage.files[file] || coverage.files[file].lines?.pct < 80);
    return {
      schema_version: 1,
      operation_result: "reported",
      coverage: {
        available: Boolean(coverageSummary || lcov),
        sources: [summaryPath, lcovPath].filter(Boolean),
        totals: coverage.total,
        files: coverage.files,
        changed_line_coverage: lcov && changedFiles.length ? changedLineCoverage(lcov, changedFiles) : { available: false, reason: lcov ? "No changed files supplied." : "lcov.info was not found." },
        critical_paths: criticalPaths,
        uncovered_critical_paths: uncoveredCritical,
        limitations: coverageSummary || lcov ? ["Coverage reflects supplied reports only; VNEM does not infer execution from test names."] : ["No coverage report exists, so covered-line claims are not proven."]
      },
      benchmarks: {
        history,
        baseline: baseline || null,
        post: post || null,
        comparisons,
        regressions: comparisons.filter((item) => item.regression),
        machine_readable: true
      }
    };
  }

  async resolveRoot(candidate) {
    const absolute = path.resolve(candidate);
    const resolved = await realpath(absolute).catch(() => absolute);
    if (!this.allowedRoots.some((allowed) => resolved === allowed || resolved.startsWith(`${allowed}${path.sep}`))) {
      throw new TestingCiError("Project root is outside allowed roots.", "path_outside_allowed_roots", { root: resolved });
    }
    return resolved;
  }
}

async function runResourceAware(tasks, maxParallel, worker) {
  const pending = [...tasks];
  const active = new Map();
  const resources = new Set();
  const results = [];
  while (pending.length || active.size) {
    let launched = false;
    for (let index = 0; index < pending.length && active.size < maxParallel;) {
      const task = pending[index];
      if (task.resources.some((resource) => resources.has(resource))) {
        index += 1;
        continue;
      }
      pending.splice(index, 1);
      task.resources.forEach((resource) => resources.add(resource));
      const promise = worker(task).then((result) => ({ task, result }), (error) => ({
        task,
        result: {
          script: task.script,
          status: "failed",
          duration_ms: 0,
          exit_code: null,
          timed_out: false,
          failure_classification: "runner_internal_failure",
          infrastructure_failure: false,
          resources: task.resources,
          source_files: task.source_files,
          error: error.message || String(error),
          attempts: []
        }
      }));
      active.set(task.id, promise);
      launched = true;
    }
    if (!active.size && pending.length) throw new TestingCiError("Resource scheduler deadlocked.", "test_scheduler_deadlock", { pending: pending.map((task) => task.id) });
    if (!launched || active.size >= maxParallel || !pending.length) {
      const settled = await Promise.race(active.values());
      active.delete(settled.task.id);
      settled.task.resources.forEach((resource) => resources.delete(resource));
      results.push(settled.result);
    }
  }
  return results;
}

function buildRunReport({ plan, runId, runDir, startedAt, finishedAt, results }) {
  const counts = {
    planned: plan.task_count,
    completed: results.length,
    passed: results.filter((item) => item.status === "passed").length,
    failed: results.filter((item) => item.status === "failed").length,
    skipped: Math.max(0, plan.task_count - results.length)
  };
  const failureGroups = Object.entries(groupBy(results.filter((item) => item.status === "failed"), (item) => item.failure_classification || "unclassified")).map(([classification, items]) => ({
    classification,
    scripts: items.map((item) => item.script),
    infrastructure: items.every((item) => item.infrastructure_failure)
  }));
  return {
    schema_version: 1,
    operation_result: "executed",
    run_id: runId,
    tier: plan.tier,
    status: counts.failed ? "failed" : counts.skipped ? "partial" : "passed",
    started_at: new Date(startedAt).toISOString(),
    finished_at: new Date(finishedAt).toISOString(),
    duration_ms: finishedAt - startedAt,
    max_parallel: plan.max_parallel,
    counts,
    results,
    failure_groups: failureGroups,
    slowest_tests: [...results].sort((a, b) => b.duration_ms - a.duration_ms).slice(0, 10).map((item) => ({ script: item.script, duration_ms: item.duration_ms, status: item.status })),
    flaky_indicators: results.filter((item) => item.attempts?.length > 1).map((item) => ({ script: item.script, attempts: item.attempts.length })),
    retries: {
      attempted: results.reduce((sum, item) => sum + Math.max(0, (item.attempts?.length || 1) - 1), 0),
      policy: RETRY_POLICY,
      note: "Retries are disabled unless a script is explicitly allowlisted and output matches a known infrastructure signature."
    },
    reliability: {
      cleanup_warnings: results.filter((item) => /cleanup|ebusy|eperm|enotempty|orphan|port/i.test(item.failure_classification || "")).map((item) => item.script),
      timeout_process_evidence: results.filter((item) => item.timed_out).map((item) => ({ script: item.script, evidence: item.process_tree_termination_evidence })),
      resource_conflicts_prevented: true,
      run_directory: normalizePath(runDir)
    },
    compatibility: plan.compatibility,
    report_path: null,
    summary_path: null
  };
}

function humanRunSummary(report) {
  const lines = [
    `# VNEM test run ${report.run_id}`,
    "",
    `- Tier: ${report.tier}`,
    `- Status: ${report.status}`,
    `- Duration: ${(report.duration_ms / 1000).toFixed(2)} s`,
    `- Passed/failed/skipped: ${report.counts.passed}/${report.counts.failed}/${report.counts.skipped}`,
    `- Max parallel: ${report.max_parallel}`,
    "",
    "## Slowest tests",
    ...report.slowest_tests.map((item) => `- ${item.script}: ${(item.duration_ms / 1000).toFixed(2)} s (${item.status})`)
  ];
  if (report.failure_groups.length) lines.push("", "## Failure groups", ...report.failure_groups.map((group) => `- ${group.classification}: ${group.scripts.join(", ")}`));
  if (report.flaky_indicators.length) lines.push("", "## Flaky indicators", ...report.flaky_indicators.map((item) => `- ${item.script}: ${item.attempts} attempts`));
  else lines.push("", "## Flaky indicators", "- None observed; no retries were used.");
  return lines.join("\n");
}

async function collectFiles(root) {
  const files = [];
  const queue = [""];
  while (queue.length && files.length < MAX_FILES) {
    const relativeDir = queue.shift();
    const entries = await readdir(path.join(root, relativeDir), { withFileTypes: true }).catch(() => []);
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const relative = normalizePath(path.join(relativeDir, entry.name));
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRS.has(relative) && !SKIPPED_DIRS.has(entry.name) && !/^\.vnem\/(?:tool-runs|test-runs|staging)/.test(relative)) queue.push(relative);
      } else if (entry.isFile()) {
        files.push(relative);
        if (files.length >= MAX_FILES) break;
      }
    }
  }
  return files;
}

async function mapScriptSources(root, scripts) {
  const result = {};
  for (const [name, command] of Object.entries(scripts)) {
    const candidates = [];
    const tokenPattern = /(?:^|\s)([A-Za-z0-9_./\\-]+\.(?:mjs|cjs|js|jsx|ts|tsx|json|ya?ml))(?:\s|$)/g;
    for (const match of String(command).matchAll(tokenPattern)) {
      const relative = normalizePath(match[1].replace(/^['"]|['"]$/g, ""));
      if (existsSync(path.join(root, relative))) candidates.push(relative);
    }
    result[name] = unique(candidates);
  }
  return result;
}

function invertScriptSources(scriptSources) {
  const result = new Map();
  for (const [script, files] of Object.entries(scriptSources)) {
    for (const file of files) result.set(file, [...(result.get(file) || []), script]);
  }
  return result;
}

async function buildSourceGraph(root, files) {
  const sourceFiles = files.filter((file) => SOURCE_EXTENSIONS.has(path.extname(file).toLowerCase()));
  const known = new Set(files);
  const reverseImports = new Map();
  let importEdges = 0;
  for (const source of sourceFiles) {
    const text = await readText(path.join(root, source));
    for (const specifier of extractImportSpecifiers(text)) {
      const target = resolveImport(source, specifier, known);
      if (!target) continue;
      reverseImports.set(target, unique([...(reverseImports.get(target) || []), source]));
      importEdges += 1;
    }
  }
  return { sourceFiles, reverseImports, importEdges };
}

function extractImportSpecifiers(text) {
  const found = [];
  const patterns = [
    /(?:import|export)\s+(?:[^'";]+?\s+from\s+)?["']([^"']+)["']/g,
    /import\s*\(\s*["']([^"']+)["']\s*\)/g,
    /require\s*\(\s*["']([^"']+)["']\s*\)/g
  ];
  for (const pattern of patterns) for (const match of text.matchAll(pattern)) found.push(match[1]);
  return unique(found);
}

function resolveImport(source, specifier, known) {
  if (!specifier.startsWith(".")) return null;
  const base = normalizePath(path.join(path.dirname(source), specifier));
  for (const candidate of [base, ...[".mjs", ".js", ".cjs", ".ts", ".tsx", ".jsx"].map((extension) => `${base}${extension}`), ...["index.mjs", "index.js", "index.ts"].map((name) => `${base}/${name}`)]) {
    if (known.has(candidate)) return candidate;
  }
  return null;
}

function transitiveImporters(changed, reverseImports) {
  const visited = new Set();
  const queue = [changed];
  while (queue.length) {
    const current = queue.shift();
    for (const importer of reverseImports.get(current) || []) {
      if (visited.has(importer)) continue;
      visited.add(importer);
      queue.push(importer);
    }
  }
  return [...visited];
}

function applyIntegrationBoundaries(changed, add) {
  const rules = [
    [/^scripts\/vnem\/tools\/structural-code\.mjs$/, ["test:tools-giga-structural-code", "test:giga-performance-output"]],
    [/^scripts\/vnem\/tools\/data-systems\.mjs$/, ["test:tools-giga-data-systems", "test:giga-performance-output"]],
    [/^scripts\/vnem\/giga\/(?:mcp-client|performance-baseline)\.mjs$/, ["test:giga-performance-output", "test:giga-baseline:capability"]],
    [/^scripts\/vnem\/tools\//, ["test:tools-mcp", "test:core-tools-ecosystem", "test:core-tools-e2e", "test:vnem-adoption-reliability-2-regression"]],
    [/^scripts\/vnem\/core\//, ["test:core-tool-selection", "test:core-giga-intelligence", "test:core-tools-ecosystem", "test:vnem-adoption-reliability-1-regression"]],
    [/^scripts\/vnem\/permissions\//, ["test:tools-permission-profiles", "test:permission-runtime", "test:tools-scoped-permissions", "test:tools-trust-boundary"]],
    [/^scripts\/vnem\/clients\//, ["test:clients", "test:cli", "test:vnem-install-adoption-1-regression"]],
    [/^scripts\/vnem\/testing\//, ["test:tools-giga-testing-ci", "test:tools-mcp", "test:giga-runtime-contracts"]],
    [/^dashboard\//, ["test:dashboard", "test:dashboard-system", "test:dashboard-control-room"]]
  ];
  for (const [pattern, scripts] of rules) if (pattern.test(changed)) for (const script of scripts) add(script, "known integration boundary", [changed, pattern.source]);
}

function applyGeneratedOwnership(changed, add) {
  const rules = [
    [/^(?:registry|schemas|capabilities)\//, ["validate", "generate", "test:install-pack", "test:giga-runtime-contracts"]],
    [/^scripts\/generate-artifacts\.mjs$/, ["generate", "test:install-pack", "test:public-repo-hygiene"]],
    [/^\.vnem\/runtime-tool-/, ["test:giga-runtime-contracts", "test:tools-reliability-catalog"]],
    [/^\.vnem\/giga-evolution\//, ["test:giga-baseline"]],
    [/^(?:public\/install|landing\/install|llms)/, ["test:install-pack", "test:public-repo-hygiene"]]
  ];
  for (const [pattern, scripts] of rules) if (pattern.test(changed)) for (const script of scripts) add(script, "generated output or benchmark ownership", [changed, pattern.source]);
}

function generatedChecksForChanges(changedFiles, scripts) {
  const checks = [];
  if (changedFiles.some((file) => /^(?:registry|schemas|capabilities)\/|^scripts\/generate-|^\.vnem\/runtime-tool-/.test(file))) {
    for (const script of ["validate", "generate", "test:install-pack", "test:giga-runtime-contracts"]) if (Object.hasOwn(scripts, script)) checks.push(script);
  }
  return unique(checks);
}

function addExisting(add, scripts, script, reason, evidence) {
  if (Object.hasOwn(scripts, script)) add(script, reason, evidence);
}

function genericSmokeScripts(scripts) {
  const candidates = ["test:smoke", "test:unit", "test", "validate", "lint", "typecheck", "build"];
  return candidates.filter((name) => Object.hasOwn(scripts, name)).slice(0, 4);
}

function scriptsForGenericTier(tier, scripts, affected) {
  if (tier === "affected") return unique(affected.length ? affected : genericSmokeScripts(scripts));
  if (tier === "smoke") return genericSmokeScripts(scripts);
  if (tier === "full" || tier === "ci") return ["test:full", "test"].filter((name) => Object.hasOwn(scripts, name)).slice(0, 1);
  if (tier === "benchmarks") return Object.keys(scripts).filter((name) => /benchmark/.test(name));
  if (tier === "precision-compat") return Object.keys(scripts).filter((name) => /precision/.test(name));
  if (tier === "clients") return Object.keys(scripts).filter((name) => /client|connector/.test(name));
  if (tier === "core") return Object.keys(scripts).filter((name) => /test:core/.test(name));
  if (tier === "tools") return Object.keys(scripts).filter((name) => /test:tools/.test(name));
  if (tier === "integration") return Object.keys(scripts).filter((name) => /integration|e2e/.test(name));
  return [];
}

async function resourcesForScript(root, script, command, sourceFiles) {
  const resources = [];
  const textParts = [String(command || "")];
  for (const file of sourceFiles) textParts.push(await readText(path.join(root, file)));
  const text = textParts.join("\n");
  for (const match of text.matchAll(/(?:--port\s+|\.listen\(\s*|\bport\s*[:=]\s*)([3-9][0-9]{3,4})/gi)) resources.push(`port:${match[1]}`);
  for (const match of text.matchAll(/(?:\.tmp|tmp|temp)[/\\]([A-Za-z0-9_.-]{3,80})/g)) resources.push(`temp:${match[1].toLowerCase()}`);
  if (/chromium|playwright|browser capture|browser_evidence/i.test(text)) resources.push("browser-runtime");
  if (/git\s+(?:init|commit|checkout|switch)|mock-gh|fake-gh/i.test(text)) resources.push(`git-fixture:${script}`);
  return unique(resources);
}

function detectTestFrameworks(pkg, scripts, testFiles, configs) {
  const dependencies = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) };
  const text = `${Object.keys(dependencies).join(" ")} ${Object.values(scripts).join(" ")} ${configs.join(" ")}`.toLowerCase();
  const frameworks = [];
  for (const [name, pattern] of [["node:test", /node --test|from ["']node:test/], ["Vitest", /vitest/], ["Jest", /jest/], ["Playwright", /playwright/], ["Cypress", /cypress/], ["AVA", /\bava\b/], ["Mocha", /\bmocha\b/], ["Pytest", /pytest/]]) if (pattern.test(text)) frameworks.push(name);
  if (!frameworks.length && testFiles.length && Object.values(scripts).some((value) => /node\s+[^\s]+test/i.test(value))) frameworks.push("Node assertion scripts");
  return frameworks;
}

function detectCoverageTools(pkg, scripts, files) {
  const dependencies = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) };
  const text = `${Object.keys(dependencies).join(" ")} ${Object.values(scripts).join(" ")}`.toLowerCase();
  const tools = [];
  for (const [name, pattern] of [["c8", /\bc8\b/], ["nyc", /\bnyc\b/], ["Istanbul", /istanbul/], ["Vitest coverage", /vitest.*coverage|@vitest\/coverage/], ["Jest coverage", /jest.*coverage/], ["Node V8 coverage", /node.*--experimental-test-coverage/]]) if (pattern.test(text)) tools.push(name);
  if (!tools.length && files.some((file) => COVERAGE_FILE_PATTERN.test(file))) tools.push("external coverage report");
  return tools;
}

function categorizeScripts(scripts) {
  const entries = Object.entries(scripts);
  const pick = (pattern) => entries.filter(([name]) => pattern.test(name)).map(([name, command]) => ({ name, command }));
  return {
    tests: pick(/^test(?::|$)/),
    lint: pick(/^lint(?::|$)/),
    typecheck: pick(/^(?:typecheck|check:types)(?::|$)/),
    build: pick(/^(?:build|compile|dashboard:build)(?::|$)/),
    validation: pick(/^(?:validate|check)(?::|$)/),
    benchmarks: pick(/benchmark|giga:/)
  };
}

function summarizeLocations(testFiles) {
  const groups = groupBy(testFiles, (file) => file.includes("/__tests__/") ? file.slice(0, file.indexOf("/__tests__") + 10) : file.split("/").slice(0, 2).join("/"));
  return Object.entries(groups).map(([location, files]) => ({ location, count: files.length })).sort((a, b) => b.count - a.count);
}

function detectPackageManager(files) {
  if (files.includes("pnpm-lock.yaml")) return "pnpm";
  if (files.includes("yarn.lock")) return "yarn";
  if (files.includes("bun.lock") || files.includes("bun.lockb")) return "bun";
  return files.includes("package-lock.json") ? "npm" : "unknown";
}

function generatedImplications(files, scripts) {
  const outputs = files.filter((file) => /^\.vnem\/runtime-|^public\/install|^landing\/install|^llms|^public\/api\/index\.json/.test(file));
  return {
    generator_scripts: Object.entries(scripts).filter(([name, command]) => /generate|digest/.test(`${name} ${command}`)).map(([name, command]) => ({ name, command })),
    tracked_or_present_outputs: outputs.slice(0, 120),
    stale_check_scripts: Object.keys(scripts).filter((name) => /registry:check|behavior:check|install-pack|public-repo-hygiene/.test(name))
  };
}

async function inspectWorkflows(root, workflowFiles) {
  const reports = [];
  for (const file of workflowFiles) {
    const text = await readText(path.join(root, file));
    try {
      const data = yaml.load(text) || {};
      const steps = flattenWorkflowSteps(data);
      reports.push({
        path: file,
        name: data.name || path.basename(file),
        jobs: Object.keys(data.jobs || {}),
        steps: steps.map((step) => ({ job: step.job, name: step.name, run: step.run, uses: step.uses })),
        actions: steps.filter((step) => step.uses).map((step) => step.uses),
        commands: steps.filter((step) => step.run).map((step) => step.run),
        runtime_deprecations: detectWorkflowRuntimeWarnings(text, "")
      });
    } catch (error) {
      reports.push({ path: file, parse_error: error.message });
    }
  }
  return reports;
}

function flattenWorkflowSteps(workflow) {
  const steps = [];
  for (const [job, config] of Object.entries(workflow?.jobs || {})) {
    for (const [index, step] of (config?.steps || []).entries()) {
      steps.push({ job, index, name: step.name || step.run || step.uses || `step-${index + 1}`, run: step.run || null, uses: step.uses || null });
    }
  }
  return steps;
}

function detectWorkflowRuntimeWarnings(workflowText, log) {
  const warnings = [];
  for (const match of workflowText.matchAll(/uses:\s*([^\s#]+@v(\d+))/g)) {
    const major = Number(match[2]);
    if (/^actions\/(?:checkout|setup-node)@/.test(match[1]) && major < 6) warnings.push({ action: match[1], issue: "action major predates the current Node 24 runtime generation", recommended_major: 6 });
  }
  if (/Node\.js 20 is deprecated|forced to run on Node\.js 24/i.test(log)) warnings.push({ issue: "GitHub Actions Node 20 runtime deprecation", evidence: "workflow log annotation" });
  return warnings;
}

function findFailingStep(steps, requestedStep, command, log) {
  if (requestedStep) return steps.find((step) => step.name === requestedStep || step.name.includes(requestedStep)) || null;
  if (command) return steps.find((step) => step.run && String(step.run).includes(command)) || null;
  const group = log.match(/##\[group\]Run ([^\r\n]+)/i)?.[1];
  if (group) return steps.find((step) => step.run && String(step.run).includes(group)) || null;
  return steps.find((step) => step.run && log.includes(String(step.run).split(/\r?\n/)[0])) || null;
}

function classifyCiFailure(log, args) {
  const lower = `${log}\n${args.context || ""}`.toLowerCase();
  if (/waiting for a runner|no runner matching|queued|billing|spending limit|job was canceled before starting|scheduling/.test(lower)) return ciClass("scheduling_failure", true, "The job did not reach product execution because runner scheduling, billing, or queue state blocked it.", "workflow/job scheduling state", "Do not change product code; resolve runner, billing, or queue availability and rerun once.");
  if (/node\.js 20 is deprecated|deprecated.*action runtime/.test(lower) && !/assertionerror|process completed with exit code [1-9]/.test(lower)) return ciClass("runtime_deprecation_warning", false, "The workflow uses an action release backed by a deprecated runtime.", ".github/workflows", "Update the affected official action major and verify CI; do not change product behavior.");
  if (/ebusy|eperm|enotempty|port remained occupied|address already in use|eaddrinuse|orphan|taskkill/.test(lower)) return ciClass("process_cleanup_failure", false, "A test-owned process, listener, or temporary path was not released before acceptance.", "process/server cleanup path", "Fix ownership and wait-for-release behavior, then rerun the exact failing test before full CI.");
  if (/generated artifact|stale generated|registry artifacts? (?:are )?stale|archive mismatch|install\.tgz.*mismatch/.test(lower)) return ciClass("generated_artifact_mismatch", false, "Source inputs and generated outputs are out of sync.", "generator and generated-artifact manifest", "Regenerate with the repository command, inspect the semantic diff, and rerun the drift check.");
  if (/assertionerror|expected:|actual:|test failed|tests? failed|process completed with exit code [1-9]/.test(lower)) return ciClass(/fixture|snapshot|golden/.test(lower) ? "test_fixture_failure" : "product_test_failure", false, "The executed branch test reported a concrete assertion or non-zero command failure.", "first source location in the failing stack", "Make the smallest source or test-fixture correction supported by the log, then rerun the exact command.");
  if (/eai_again|econnreset|etimedout|dns|rate limit|http 429|service unavailable|network/.test(lower)) return ciClass("infrastructure_network_failure", true, "External network or provider availability interrupted the workflow.", "network/provider step", "Confirm the failure is external and rerun once; do not patch product code without branch evidence.");
  if (/secret.*not (?:set|found)|missing secret|not authenticated|permission denied|forbidden|unauthorized/.test(lower)) return ciClass("missing_auth_or_config", false, "Required workflow authentication or configuration was unavailable.", "workflow permissions, secrets, or variables", "Correct the workflow configuration without printing secrets, then rerun.");
  return ciClass("unclassified_failure", false, "The supplied evidence is insufficient for a branch-versus-infrastructure conclusion.", "failing job log around the first error", "Collect the exact failing step, command, and bounded log excerpt before changing code.");
}

function ciClass(classification, infrastructure, rootCause, inspect, smallestFix) {
  return { classification, infrastructure, root_cause: rootCause, inspect, smallest_fix: smallestFix };
}

function classifyFailure(output, execution) {
  const lower = output.toLowerCase();
  if (execution.timed_out) return { classification: "timeout", infrastructure: false };
  if (RETRY_POLICY.infrastructure_signatures.some((signature) => lower.includes(signature.toLowerCase()))) return { classification: "infrastructure_network_failure", infrastructure: true };
  if (/ebusy|eperm|enotempty|eaddrinuse|port remained occupied|orphan/.test(lower)) return { classification: "cleanup_or_resource_failure", infrastructure: false };
  if (/assertionerror|expected|actual/.test(lower)) return { classification: "assertion_failure", infrastructure: false };
  if (/generated|stale|mismatch/.test(lower)) return { classification: "generated_artifact_failure", infrastructure: false };
  return { classification: "command_failure", infrastructure: false };
}

function extractFailingCommand(log) {
  return log.match(/##\[group\]Run ([^\r\n]+)/i)?.[1] || log.match(/^>\s+vnem@[^\r\n]+\r?\n>\s+([^\r\n]+)/m)?.[1] || null;
}

function compactFailureExcerpt(log) {
  if (!log) return "";
  const lines = log.split(/\r?\n/);
  const index = lines.findIndex((line) => /##\[error\]|AssertionError|Error:|Process completed with exit code|failed/i.test(line));
  const start = Math.max(0, index < 0 ? lines.length - 20 : index - 4);
  return lines.slice(start, start + 16).join("\n").slice(0, 4000);
}

function normalizeCoverageSummary(summary, lcov) {
  const files = {};
  if (summary) {
    for (const [name, metrics] of Object.entries(summary)) {
      if (name === "total") continue;
      const relative = normalizePath(name.replace(/^.*?[\\/]vnem-src[\\/]/, ""));
      files[relative] = normalizeMetricSet(metrics);
    }
  }
  if (lcov) {
    for (const [name, metrics] of Object.entries(lcov.files)) files[normalizePath(name)] = { ...(files[normalizePath(name)] || {}), lines: metrics.lines };
  }
  return { total: summary?.total ? normalizeMetricSet(summary.total) : aggregateLcov(lcov), files };
}

function normalizeMetricSet(metrics) {
  const result = {};
  for (const key of ["lines", "statements", "functions", "branches"]) {
    if (!metrics?.[key]) continue;
    result[key] = {
      total: Number(metrics[key].total || 0),
      covered: Number(metrics[key].covered || 0),
      skipped: Number(metrics[key].skipped || 0),
      pct: Number(metrics[key].pct || 0)
    };
  }
  return result;
}

function parseLcov(text) {
  const files = {};
  let current = null;
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("SF:")) {
      current = normalizePath(line.slice(3));
      files[current] = { hits: new Map() };
    } else if (current && line.startsWith("DA:")) {
      const [number, hits] = line.slice(3).split(",").map(Number);
      files[current].hits.set(number, hits);
    } else if (line === "end_of_record") current = null;
  }
  for (const value of Object.values(files)) {
    const total = value.hits.size;
    const covered = [...value.hits.values()].filter((hits) => hits > 0).length;
    value.lines = { total, covered, skipped: 0, pct: total ? Number((covered / total * 100).toFixed(2)) : 100 };
  }
  return { files };
}

function aggregateLcov(lcov) {
  if (!lcov) return {};
  const total = Object.values(lcov.files).reduce((sum, file) => sum + file.lines.total, 0);
  const covered = Object.values(lcov.files).reduce((sum, file) => sum + file.lines.covered, 0);
  return { lines: { total, covered, skipped: 0, pct: total ? Number((covered / total * 100).toFixed(2)) : 100 } };
}

function changedLineCoverage(lcov, changedFiles) {
  let total = 0;
  let covered = 0;
  const files = {};
  for (const changed of changedFiles) {
    const match = Object.entries(lcov.files).find(([name]) => normalizePath(name).endsWith(changed));
    if (!match) continue;
    const [, metrics] = match;
    const fileTotal = metrics.hits.size;
    const fileCovered = [...metrics.hits.values()].filter((hits) => hits > 0).length;
    total += fileTotal;
    covered += fileCovered;
    files[changed] = { executable_lines_in_report: fileTotal, covered_lines: fileCovered };
  }
  return { available: total > 0, note: "Without diff hunks this is changed-file line coverage, not exact changed-line coverage.", total, covered, pct: total ? Number((covered / total * 100).toFixed(2)) : null, files };
}

function extractBenchmarkMetrics(data) {
  const metrics = {};
  if (Number.isFinite(Number(data.total_duration_ms))) metrics.total_duration_ms = Number(data.total_duration_ms);
  if (Number.isFinite(Number(data.suites?.full_test?.duration_ms))) metrics.full_test_duration_ms = Number(data.suites.full_test.duration_ms);
  if (Number.isFinite(Number(data.summary?.mean_score))) metrics.mean_score = Number(data.summary.mean_score);
  if (Number.isFinite(Number(data.summary?.strict_successes))) metrics.strict_successes = Number(data.summary.strict_successes);
  if (Number.isFinite(Number(data.summary?.core_startup_ms?.median))) metrics.core_startup_median_ms = Number(data.summary.core_startup_ms.median);
  if (Number.isFinite(Number(data.summary?.tools_startup_ms?.median))) metrics.tools_startup_median_ms = Number(data.summary.tools_startup_ms.median);
  return metrics;
}

function selectBenchmarkRecord(history, label) {
  return history
    .filter((item) => item.label === label && Object.keys(item.metrics).length)
    .sort((a, b) => benchmarkRecordScore(a) - benchmarkRecordScore(b))
    .at(-1) || null;
}

function selectLatestBenchmarkRecord(history) {
  const labels = unique(history.map((item) => item.label)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return labels.length ? selectBenchmarkRecord(history, labels.at(-1)) : null;
}

function benchmarkRecordScore(item) {
  return (Number.isFinite(item.metrics.full_test_duration_ms) ? 100 : 0) + Object.keys(item.metrics).length;
}

function compareMetrics(baseline, post, thresholdPercent) {
  const comparisons = [];
  for (const metric of unique([...Object.keys(baseline), ...Object.keys(post)])) {
    if (!Number.isFinite(baseline[metric]) || !Number.isFinite(post[metric])) continue;
    const change = baseline[metric] === 0 ? null : Number(((post[metric] - baseline[metric]) / Math.abs(baseline[metric]) * 100).toFixed(2));
    const lowerIsBetter = /duration|startup|memory|bytes/.test(metric);
    comparisons.push({ metric, baseline: baseline[metric], post: post[metric], change_percent: change, lower_is_better: lowerIsBetter, regression: change !== null && (lowerIsBetter ? change > thresholdPercent : change < -thresholdPercent) });
  }
  return comparisons;
}

async function gitChangedFiles(root, base) {
  const commands = base
    ? [["diff", "--name-only", `${base}...HEAD`], ["diff", "--name-only"], ["diff", "--cached", "--name-only"]]
    : [["diff", "--name-only"], ["diff", "--cached", "--name-only"], ["ls-files", "--others", "--exclude-standard"]];
  const files = [];
  for (const args of commands) {
    const result = await runBounded("git", args, root, 20_000);
    if (result.exitCode === 0) files.push(...result.stdout.split(/\r?\n/).filter(Boolean));
  }
  return unique(files.map(normalizePath));
}

async function runBounded(command, args, cwd, maxBytes) {
  return await new Promise((resolve) => {
    const child = spawn(command, args, { cwd, shell: false, windowsHide: true });
    let stdout = "";
    let stderr = "";
    const append = (current, chunk) => `${current}${chunk}`.slice(-maxBytes);
    child.stdout.on("data", (chunk) => { stdout = append(stdout, chunk); });
    child.stderr.on("data", (chunk) => { stderr = append(stderr, chunk); });
    child.on("error", (error) => resolve({ exitCode: null, stdout, stderr: `${stderr}\n${error.message}` }));
    child.on("exit", (code) => resolve({ exitCode: code, stdout, stderr }));
  });
}

async function readJson(file, optional = false) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (optional && error.code === "ENOENT") return null;
    if (optional) return null;
    throw error;
  }
}

async function readText(file) {
  try {
    const info = await stat(file);
    if (!info.isFile() || info.size > MAX_TEXT_BYTES || isBinaryPath(file)) return "";
    const buffer = await readFile(file);
    if (buffer.subarray(0, Math.min(buffer.length, 8192)).includes(0)) return "";
    return buffer.toString("utf8");
  } catch {
    return "";
  }
}

function isBinaryPath(file) {
  return /\.(?:7z|avi|bmp|class|dll|dylib|eot|exe|gif|gz|ico|jar|jpeg|jpg|mov|mp3|mp4|pdf|png|so|tar|tgz|ttf|webm|webp|woff2?|zip)$/i.test(file);
}

async function resolveInside(root, relative) {
  const absolute = path.resolve(root, relative);
  if (absolute !== root && !absolute.startsWith(`${root}${path.sep}`)) throw new TestingCiError("Path escapes project root.", "path_outside_project", { path: relative });
  return absolute;
}

async function resolveOutputPath(root, relative) {
  const absolute = await resolveInside(root, relative);
  await mkdir(path.dirname(absolute), { recursive: true });
  return absolute;
}

async function atomicWrite(file, content) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${randomUUID().slice(0, 8)}.tmp`;
  await writeFile(temporary, content, "utf8");
  await rename(temporary, file);
}

function normalizeTier(value) {
  const tier = String(value || "affected").toLowerCase();
  if (!["smoke", "affected", "core", "tools", "precision-compat", "clients", "integration", "benchmarks", "full", "ci"].includes(tier)) throw new TestingCiError("Unknown test tier.", "test_tier_unknown", { tier });
  return tier;
}

function groupBy(items, keyFn) {
  const groups = {};
  for (const item of items) {
    const key = keyFn(item);
    (groups[key] ||= []).push(item);
  }
  return groups;
}

function preferredScriptsForSource(candidates, scripts) {
  const available = unique(candidates);
  const withoutCaseAliases = available.filter((name) => !/--case(?:=|\s)/.test(String(scripts[name] || "")));
  const aggregateRegressions = withoutCaseAliases.filter((name) => /(?:^|:)regression$|(?:^|:)(?:all|full)$/.test(name));
  const primaryTests = withoutCaseAliases.filter((name) => /^test(?::|$)/.test(name));

  if (aggregateRegressions.length) return aggregateRegressions;
  if (primaryTests.length && withoutCaseAliases.some((name) => /benchmark|^giga:/.test(name))) return primaryTests;
  if (withoutCaseAliases.length < available.length && withoutCaseAliases.length) return withoutCaseAliases;
  return available;
}

function unique(values) {
  return [...new Set(values.filter((value) => value !== null && value !== undefined && value !== ""))];
}

function normalizePath(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function clamp(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function redact(value) {
  return String(value || "")
    .replace(/(?:gh[pousr]_|github_pat_|sk-|xox[baprs]-|cfut_)[A-Za-z0-9_-]{10,}/gi, "[REDACTED]")
    .replace(/(authorization\s*:\s*(?:bearer|token)\s+)[^\s]+/gi, "$1[REDACTED]")
    .replace(/((?:token|secret|password|api[_-]?key)\s*[=:]\s*)[^\s]+/gi, "$1[REDACTED]");
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

export const TESTING_CI_RUNTIME_MARKERS = Object.freeze({
  affected_graph: sha256("changed files|imports|references|scripts|ownership|benchmarks|generated|integration"),
  runner: sha256("stages|resources|bounded logs|progress|failure groups|slowest|no unproven retries"),
  ci_diagnosis: sha256("workflow|job|step|logs|command|branch-vs-infrastructure|smallest fix|rerun|final"),
  coverage_benchmarks: sha256("coverage summary|critical paths|changed files|history|baseline|post|regressions")
});
