import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createWriteStream, existsSync } from "node:fs";
import {
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import path from "node:path";

const CONTROL_TOKEN_PATTERN = /^(?:&&|\|\||;|\||>|>>|<|`|\$\()$/;
const CONTROL_TEXT_PATTERN = /(?:&&|&|\|\||;|(?<!\|)\|(?!\|)|(?:^|\s)(?:>|>>|<)(?:\s|$)|`|\$\()/;
const DANGEROUS_TEXT_PATTERN = /\b(?:rm\s+-rf|rmdir\s+\/s|del\s+\/s|format(?:\.com)?\b|diskpart\b|mkfs\b|git\s+(?:push|reset\s+--hard|clean\s+-[a-z]*f)|npm\s+publish|pnpm\s+publish|yarn\s+publish|curl\b.*\|\s*(?:sh|bash)|wget\b.*\|\s*(?:sh|bash)|powershell\b.*-encodedcommand|pwsh\b.*-encodedcommand|sudo\b|su\b|chmod\s+-r|chown\s+-r)\b/i;
const DANGEROUS_EXECUTABLES = new Set([
  "bash", "cmd", "cmd.exe", "del", "diskpart", "diskpart.exe", "fish", "format", "format.com",
  "kill", "mkfs", "mshta", "mshta.exe", "pkill", "powershell", "powershell.exe", "pwsh", "reg",
  "reg.exe", "rm", "rmdir", "rundll32", "rundll32.exe", "sc", "sc.exe", "sh", "sudo", "su",
  "taskkill", "taskkill.exe", "wscript", "wscript.exe", "wsl", "zsh"
]);
const SCRIPT_CONTROL_PATTERN = /(?:&&|&|\|\||;|(?<!\|)\|(?!\|)|(?:^|\s)(?:>|>>|<)(?:\s|$)|`|\$\()/;
const SAFE_SCRIPT_SEGMENT_EXECUTABLES = new Set([
  "astro", "bun", "cargo", "dotnet", "eslint", "go", "jest", "just", "make", "next", "node", "npm",
  "pnpm", "prettier", "pytest", "python", "python3", "tsc", "vite", "vitest", "yarn"
]);
const SAFE_DECLARED_SCRIPT_PATTERN = /^(?:test(?::[a-z0-9:_-]+)?|build(?::[a-z0-9:_-]+)?|validate(?::[a-z0-9:_-]+)?|lint(?::[a-z0-9:_-]+)?|typecheck(?::[a-z0-9:_-]+)?|check(?::[a-z0-9:_-]+)?|doctor(?::[a-z0-9:_-]+)?)$/i;
const BUILD_SCRIPT_PATTERN = /^(?:build|compile|typecheck)(?::|$)/i;
const BLOCKED_SCRIPT_NAME_PATTERN = /(?:^|[:_-])(?:preinstall|postinstall|install|publish|deploy|release|push|reset|clean:all)(?:$|[:_-])/i;
const SAFE_SCRIPT_NAME_PATTERN = /^[a-z0-9][a-z0-9:_-]{0,127}$/i;
const RAW_SECRET_ARGUMENT_PATTERN = /^(?:ghp_|github_pat_|sk-|xox[baprs]-|cf-)[_A-Za-z0-9-]{10,}$/i;
const SECRET_ARGUMENT_NAME_PATTERN = /^--?(?:token|secret|password|passwd|api[_-]?key|authorization|cookie|credential|private[_-]?key)(?:=|$)/i;
const SECRET_ENV_KEY_PATTERN = /(?:^|_)(?:auth|token|secret|password|passwd|cookie|authorization|api_?key|access_?key|private_?key|client_?secret|credential|credentials|session)(?:_|$)/i;
const TEMP_PATH_PATTERN = /^(?:\.tmp|tmp|temp|\.cache|\.vnem-temp)(?:\/|$)/i;
const MAX_RESPONSE_OUTPUT_BYTES = 64 * 1024;
const MAX_LOG_BYTES = 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 120_000;

export class ProjectAutomationError extends Error {
  constructor(message, code = "project_automation_error", details = {}) {
    super(message);
    this.name = "ProjectAutomationError";
    this.code = code;
    this.details = details;
  }
}

export class ProjectAutomationRuntime {
  constructor({ allowedRoots, evidenceRoot }) {
    this.allowedRoots = allowedRoots.map((root) => path.resolve(root));
    this.evidenceRoot = path.resolve(evidenceRoot);
    this.stateRoot = path.join(this.evidenceRoot, "project-automation");
  }

  async inspectEnvironment(args = {}) {
    const root = await this.resolveRoot(args.root || this.allowedRoots[0]);
    const manifest = await readPackageManifest(root);
    const shellCandidates = process.platform === "win32"
      ? [
          ["powershell.exe", ["-NoLogo", "-NoProfile", "-Command", "$PSVersionTable.PSVersion.ToString()"]],
          ["pwsh.exe", ["-NoLogo", "-NoProfile", "-Command", "$PSVersionTable.PSVersion.ToString()"]],
          ["cmd.exe", ["/d", "/c", "ver"]],
          ["bash.exe", ["--version"]]
        ]
      : [["sh", ["--version"]], ["bash", ["--version"]], ["zsh", ["--version"]], ["fish", ["--version"]]];
    const packageCandidates = [["npm", ["--version"]], ["pnpm", ["--version"]], ["yarn", ["--version"]], ["bun", ["--version"]]];
    const [shells, packageManagers] = await Promise.all([
      Promise.all(shellCandidates.map(([command, commandArgs]) => probeExecutable(command, commandArgs, root))),
      Promise.all(packageCandidates.map(([command, commandArgs]) => probeExecutable(command, commandArgs, root)))
    ]);
    const files = new Set(await readdir(root).catch(() => []));
    const taskRunners = detectTaskRunners(files, manifest);
    const selectedPackageManager = choosePackageManager(files, packageManagers);
    const report = {
      root,
      platform: process.platform,
      architecture: process.arch,
      node: { executable: process.execPath, version: process.version },
      shells,
      package_managers: packageManagers,
      selected_package_manager: selectedPackageManager,
      task_runners: taskRunners,
      package_scripts: Object.entries(manifest?.scripts || {}).map(([name, body]) => ({
        name,
        body_sha256: sha256(String(body)),
        policy: classifyDeclaredScript(name, body)
      })),
      command_policy_layers: ["known_safe", "project_declared", "reviewed_custom", "blocked_dangerous"],
      execution_contract: {
        cwd_is_explicit_and_workspace_bounded: true,
        shell_operators_in_custom_commands: "blocked",
        project_script_chaining: "only explicit && chains with individually reviewed executables",
        reviewed_custom_profile_action: "run_custom_command",
        long_output: "redacted bounded evidence log plus compact head/tail summary",
        timeout_cleanup: "process-tree termination with exit/signal/timeout evidence"
      }
    };
    return report;
  }

  async reviewCommand(args = {}) {
    const root = await this.resolveRoot(args.root || this.allowedRoots[0]);
    const cwd = await resolveWorkspaceDirectory(root, args.cwd || ".");
    const mode = normalizeMode(args.mode);
    let argv;
    let scriptBody = null;
    let scriptBodySha256 = null;
    let lifecycleHooks = [];
    let policyLayer;
    let permissionAction;
    let packageManager = null;

    if (mode === "project_script") {
      const manifest = await readPackageManifest(root, true);
      const script = String(args.script || "").trim();
      if (!SAFE_SCRIPT_NAME_PATTERN.test(script)) throw new ProjectAutomationError("Project script name contains unsupported shell-sensitive characters.", "project_script_name_blocked", { script });
      if (!script || !Object.hasOwn(manifest.scripts || {}, script)) {
        throw new ProjectAutomationError("Requested project script was not found.", "project_script_not_found", { script });
      }
      scriptBody = String(manifest.scripts[script]);
      const declared = classifyDeclaredScript(script, scriptBody);
      if (!declared.allowed) {
        throw new ProjectAutomationError("Project-declared script failed command-policy review.", declared.code, { script, reasons: declared.reasons });
      }
      lifecycleHooks = [`pre${script}`, `post${script}`].filter((name) => Object.hasOwn(manifest.scripts || {}, name)).map((name) => {
        const body = String(manifest.scripts[name]);
        const hookReview = classifyDeclaredScript(name, body);
        if (!hookReview.allowed) throw new ProjectAutomationError("A package lifecycle hook failed command-policy review.", "project_script_lifecycle_hook_blocked", { script, hook: name, reasons: hookReview.reasons });
        return { name, body_sha256: sha256(body), policy: hookReview };
      });
      const files = new Set(await readdir(root).catch(() => []));
      packageManager = choosePackageManager(files, []);
      argv = [packageManager, "run", script];
      scriptBodySha256 = sha256(scriptBody);
      policyLayer = "project_declared";
      permissionAction = SAFE_DECLARED_SCRIPT_PATTERN.test(script)
        ? BUILD_SCRIPT_PATTERN.test(script) ? "run_build" : "run_test"
        : "run_custom_command";
    } else {
      argv = normalizeArgv(args.argv);
      if (mode === "known_safe") validateKnownSafeArgv(argv, root, cwd);
      else validateReviewedCustomArgv(argv, root, cwd);
      policyLayer = mode === "known_safe" ? "known_safe" : "reviewed_custom";
      permissionAction = mode === "known_safe" && isBuildArgv(argv) ? "run_build" : mode === "known_safe" ? "run_test" : "run_custom_command";
    }

    const binding = {
      schema_version: 1,
      root,
      cwd,
      mode,
      argv,
      script_body_sha256: scriptBodySha256,
      lifecycle_hooks: lifecycleHooks,
      policy_layer: policyLayer,
      permission_action: permissionAction
    };
    return {
      ...binding,
      review_id: `command-review-${sha256(JSON.stringify(binding)).slice(0, 20)}`,
      display_command: argv.map(quoteDisplayArg).join(" "),
      package_manager: packageManager,
      project_script: mode === "project_script" ? { name: argv[2], body_sha256: scriptBodySha256, policy: classifyDeclaredScript(argv[2], scriptBody), lifecycle_hooks: lifecycleHooks } : null,
      allowed: true,
      exact_argv_bound: true,
      uses_shell_operators_from_request: false,
      required_permission_action: permissionAction,
      stronger_profile_required: permissionAction === "run_custom_command",
      approval_required_for_execution: true,
      review_limitations: [
        "Exact command review cannot prove arbitrary executable internals are harmless.",
        "Project-declared scripts are inspected for dangerous tokens and controlled chaining, but invoked source files remain project code."
      ]
    };
  }

  async runCommand(args = {}) {
    const review = await this.reviewCommand(args);
    if (args.dry_run !== false) {
      return {
        operation_result: "planned",
        executed: false,
        review,
        next_best_action: "Re-submit the exact command with this review_id, dry_run=false, approval, and an allowed permission profile."
      };
    }
    if (!args.review_id || args.review_id !== review.review_id) {
      throw new ProjectAutomationError("Execution requires the exact current review_id; the command or project script may have changed.", "command_review_mismatch", {
        supplied_review_id: args.review_id || null,
        current_review_id: review.review_id
      });
    }
    const execution = await this.executeReview(review, args);
    return { operation_result: execution.ok ? "completed" : "failed", executed: true, review, execution };
  }

  async planTaskGraph(args = {}) {
    const root = await this.resolveRoot(args.root || this.allowedRoots[0]);
    const nodes = Array.isArray(args.nodes) ? args.nodes : [];
    if (!nodes.length) throw new ProjectAutomationError("Task graph requires at least one node.", "task_graph_empty");
    if (nodes.length > 100) throw new ProjectAutomationError("Task graph is limited to 100 nodes.", "task_graph_too_large");
    const ids = nodes.map((node) => String(node.id || "").trim());
    if (ids.some((id) => !/^[a-z0-9][a-z0-9:_-]{0,63}$/i.test(id))) throw new ProjectAutomationError("Every task node needs a stable safe id.", "task_node_id_invalid");
    if (new Set(ids).size !== ids.length) throw new ProjectAutomationError("Task node ids must be unique.", "task_node_id_duplicate");

    const normalizedNodes = [];
    for (const raw of nodes) {
      const dependsOn = [...new Set((raw.depends_on || []).map(String))];
      for (const dependency of dependsOn) if (!ids.includes(dependency)) throw new ProjectAutomationError("Task dependency was not found.", "task_dependency_missing", { node: raw.id, dependency });
      const review = await this.reviewCommand({ ...raw, root });
      const rollbackReview = raw.rollback
        ? await this.reviewCommand({ ...raw.rollback, root, cwd: raw.rollback.cwd || raw.cwd || "." })
        : null;
      normalizedNodes.push({
        id: String(raw.id),
        depends_on: dependsOn,
        satisfaction: normalizeSatisfaction(raw.satisfaction),
        review,
        rollback_review: rollbackReview,
        timeout_ms: clamp(raw.timeout_ms, 1_000, MAX_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
        max_output_bytes: clamp(raw.max_output_bytes, 512, MAX_RESPONSE_OUTPUT_BYTES, 16_000),
        status: "pending",
        attempts: 0,
        result: null,
        rollback_result: null
      });
    }
    const order = topologicalOrder(normalizedNodes);
    const graphId = `task-graph-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const graph = {
      schema_version: 1,
      graph_id: graphId,
      name: String(args.name || "project automation graph"),
      root,
      status: "planned",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      order,
      nodes: normalizedNodes,
      run_count: 0,
      interruption_count: 0,
      evidence: [],
      rollback_contract: {
        declared_rollback_nodes: normalizedNodes.filter((node) => node.rollback_review).map((node) => node.id),
        nodes_without_rollback: normalizedNodes.filter((node) => !node.rollback_review).map((node) => node.id),
        guarantee: "Only exact declared rollback commands can be executed; undeclared side effects are reported as not automatically reversible."
      }
    };
    await this.saveGraph(graph);
    return graphSummary(graph, { includeNodes: true });
  }

  async runTaskGraph(args = {}, hooks = {}) {
    return this.withGraphLock(args.graph_id, async () => {
      const graph = await this.loadGraph(args.graph_id);
      for (const node of graph.nodes) {
        if (node.status === "running") {
          node.status = "pending";
          node.interrupted_before_resume = true;
          graph.interruption_count += 1;
        }
      }
      graph.status = "running";
      graph.run_count += 1;
      graph.updated_at = new Date().toISOString();
      await this.saveGraph(graph);
      const maxNodes = clamp(args.max_nodes, 1, graph.nodes.length, graph.nodes.length);
      let processed = 0;
      for (const nodeId of graph.order) {
        const node = graph.nodes.find((item) => item.id === nodeId);
        if (["completed", "satisfied", "rolled_back"].includes(node.status)) continue;
        const dependencies = node.depends_on.map((id) => graph.nodes.find((item) => item.id === id));
        if (dependencies.some((dependency) => ["failed", "blocked"].includes(dependency.status))) {
          node.status = "blocked";
          node.result = { reason: "dependency_failed", dependencies: dependencies.filter((item) => ["failed", "blocked"].includes(item.status)).map((item) => item.id) };
          continue;
        }
        if (!dependencies.every((dependency) => ["completed", "satisfied"].includes(dependency.status))) continue;
        const satisfaction = await evaluateSatisfaction(graph.root, node.satisfaction, args.ports || []);
        if (satisfaction.satisfied) {
          node.status = "satisfied";
          node.result = satisfaction;
          node.completed_at = new Date().toISOString();
          await this.saveGraph(graph);
          continue;
        }
        if (processed >= maxNodes) break;
        const currentReview = await this.refreshStoredReview(node.review);
        if (hooks.authorize) await hooks.authorize(currentReview);
        node.status = "running";
        node.started_at = new Date().toISOString();
        node.attempts += 1;
        await this.saveGraph(graph);
        const result = await this.executeReview(currentReview, {
          timeout_ms: node.timeout_ms,
          max_output_bytes: node.max_output_bytes
        });
        node.result = result;
        node.completed_at = new Date().toISOString();
        node.status = result.ok ? "completed" : "failed";
        graph.evidence.push(result.evidence_dir);
        processed += 1;
        await this.saveGraph(graph);
        if (!result.ok && args.continue_on_failure !== true) break;
      }
      const pending = graph.nodes.filter((node) => node.status === "pending");
      const failed = graph.nodes.filter((node) => node.status === "failed");
      const blocked = graph.nodes.filter((node) => node.status === "blocked");
      graph.status = failed.length || blocked.length ? "failed" : pending.length ? "paused" : "completed";
      if (graph.status === "paused") graph.interruption_count += 1;
      graph.updated_at = new Date().toISOString();
      await this.saveGraph(graph);
      return graphSummary(graph, { includeNodes: true, processedThisRun: processed });
    });
  }

  async taskGraphStatus(args = {}) {
    const graph = await this.loadGraph(args.graph_id);
    return graphSummary(graph, { includeNodes: args.include_nodes !== false });
  }

  async rollbackTaskGraph(args = {}, hooks = {}) {
    return this.withGraphLock(args.graph_id, async () => {
      const graph = await this.loadGraph(args.graph_id);
      const rollbackNodes = [...graph.order].reverse().map((id) => graph.nodes.find((node) => node.id === id))
        .filter((node) => node.status === "completed");
      const results = [];
      for (const node of rollbackNodes) {
        if (!node.rollback_review) {
          results.push({ node_id: node.id, rolled_back: false, reason: "rollback_not_declared" });
          continue;
        }
        const currentReview = await this.refreshStoredReview(node.rollback_review);
        if (hooks.authorize) await hooks.authorize(currentReview);
        const result = await this.executeReview(currentReview, {
          timeout_ms: node.timeout_ms,
          max_output_bytes: node.max_output_bytes
        });
        node.rollback_result = result;
        if (result.ok) node.status = "rolled_back";
        results.push({ node_id: node.id, rolled_back: result.ok, result });
        graph.evidence.push(result.evidence_dir);
        await this.saveGraph(graph);
        if (!result.ok && args.continue_on_failure !== true) break;
      }
      const unresolved = graph.nodes.filter((node) => node.status === "completed" && !node.rollback_result?.ok).map((node) => node.id);
      graph.status = unresolved.length ? "rollback_incomplete" : "rolled_back";
      graph.updated_at = new Date().toISOString();
      await this.saveGraph(graph);
      return { ...graphSummary(graph, { includeNodes: true }), rollback_results: results, unresolved_nodes: unresolved };
    });
  }

  async diagnoseRuntime(args = {}, context = {}) {
    const root = await this.resolveRoot(args.root || this.allowedRoots[0]);
    const logs = await collectLogsFirst(root, args.log_paths || [], clamp(args.max_log_files, 1, 30, 10));
    const ports = await inspectPorts(args.ports || []);
    const lockChecks = [];
    for (const item of (args.lock_paths || []).slice(0, 20)) lockChecks.push(await inspectLockPath(root, item));
    const tempPaths = await inspectTempCandidates(root);
    const graphs = await this.listGraphs(root);
    const report = {
      operation_result: "reported",
      root,
      diagnostic_order: ["logs", "ports", "known VNEM processes", "lock probes", "temporary paths", "interrupted task graphs"],
      logs,
      ports,
      known_dev_servers: context.devServers || [],
      lock_checks: lockChecks,
      windows_lock_handling: {
        platform: process.platform,
        strategy: "non-destructive open probe, exact path evidence, bounded rename retries during quarantine, no killing unknown owners",
        handle_exe_required: false,
        limitation: "Without an approved OS-specific handle inspector, VNEM may prove a path is blocked but not always identify the owning process."
      },
      temporary_paths: tempPaths,
      task_graphs: graphs,
      interrupted_graphs: graphs.filter((graph) => ["running", "paused"].includes(graph.status)),
      safe_next_step: chooseDiagnosticNextStep({ logs, ports, lockChecks, graphs })
    };
    const evidencePath = await this.writeReport("runtime-diagnosis", report);
    return { ...report, evidence_path: evidencePath };
  }

  async tempCleanup(args = {}) {
    const operation = String(args.operation || "preview");
    if (!["preview", "quarantine", "restore"].includes(operation)) throw new ProjectAutomationError("Unknown temp cleanup operation.", "temp_cleanup_operation_invalid");
    if (operation === "restore") return this.restoreCleanup(args);
    const root = await this.resolveRoot(args.root || this.allowedRoots[0]);
    const paths = [...new Set((args.paths || []).map(normalizeRelative))];
    if (!paths.length) throw new ProjectAutomationError("At least one temp path is required.", "temp_cleanup_paths_required");
    const targets = [];
    for (const relativePath of paths) {
      if (!TEMP_PATH_PATTERN.test(relativePath) || path.isAbsolute(relativePath) || relativePath.includes("..")) {
        throw new ProjectAutomationError("Cleanup is limited to explicit project-local temp/cache paths.", "temp_cleanup_path_blocked", { path: relativePath });
      }
      const absolutePath = path.resolve(root, relativePath);
      ensureInside(root, absolutePath);
      if (!existsSync(absolutePath)) {
        targets.push({ relative_path: relativePath, absolute_path: absolutePath, exists: false, bytes: 0, entries: 0 });
        continue;
      }
      const info = await lstat(absolutePath);
      if (info.isSymbolicLink()) throw new ProjectAutomationError("Symlink/junction cleanup targets are blocked.", "temp_cleanup_symlink_blocked", { path: relativePath });
      const inventory = await inventoryPath(absolutePath);
      targets.push({ relative_path: relativePath, absolute_path: absolutePath, exists: true, ...inventory });
    }
    if (operation === "preview" || args.dry_run !== false) {
      return {
        operation_result: "planned",
        operation: "quarantine",
        executed: false,
        root,
        targets,
        rollback_available: true,
        policy: "Targets will be moved into VNEM evidence quarantine, not irreversibly deleted."
      };
    }
    const cleanupId = `cleanup-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const quarantineRoot = path.join(this.stateRoot, "cleanups", cleanupId, "quarantine");
    await mkdir(quarantineRoot, { recursive: true });
    const moved = [];
    const unresolved = [];
    for (const target of targets.filter((item) => item.exists)) {
      const destination = path.join(quarantineRoot, `${sha256(target.relative_path).slice(0, 12)}-${path.basename(target.relative_path)}`);
      try {
        const retry = await renameWithRetry(target.absolute_path, destination, clamp(args.retry_count, 0, 10, 5), clamp(args.retry_delay_ms, 25, 2_000, 150));
        moved.push({ ...target, quarantine_path: destination, retry });
      } catch (error) {
        unresolved.push({ ...target, code: error.code || "rename_failed", error: error.message });
      }
    }
    const manifest = {
      schema_version: 1,
      cleanup_id: cleanupId,
      root,
      created_at: new Date().toISOString(),
      moved,
      unresolved,
      rollback_available: moved.length > 0,
      irreversible_delete_performed: false
    };
    const manifestPath = path.join(this.stateRoot, "cleanups", cleanupId, "manifest.json");
    await writeJsonAtomic(manifestPath, manifest);
    return {
      operation_result: unresolved.length ? "partial" : "quarantined",
      operation: "quarantine",
      executed: true,
      cleanup_id: cleanupId,
      moved,
      unresolved,
      rollback_available: manifest.rollback_available,
      manifest_path: manifestPath,
      retry_policy: { retry_count: clamp(args.retry_count, 0, 10, 5), retry_delay_ms: clamp(args.retry_delay_ms, 25, 2_000, 150), retry_codes: ["EBUSY", "EPERM", "ENOTEMPTY", "EACCES"] }
    };
  }

  async restoreCleanup(args = {}) {
    const cleanupId = String(args.cleanup_id || "");
    if (!/^cleanup-[a-z0-9-]+$/i.test(cleanupId)) throw new ProjectAutomationError("A valid cleanup_id is required for restore.", "cleanup_id_invalid");
    const manifestPath = path.join(this.stateRoot, "cleanups", cleanupId, "manifest.json");
    const manifest = await readJson(manifestPath, "cleanup_manifest_not_found");
    const root = await this.resolveRoot(manifest.root);
    const plans = manifest.moved.map((item) => ({ source: item.quarantine_path, target: path.resolve(root, item.relative_path), relative_path: item.relative_path }));
    if (args.dry_run !== false) return { operation_result: "planned", operation: "restore", executed: false, cleanup_id: cleanupId, plans };
    const restored = [];
    const unresolved = [];
    for (const plan of plans) {
      if (!existsSync(plan.source)) {
        unresolved.push({ ...plan, reason: "quarantine_source_missing" });
        continue;
      }
      if (existsSync(plan.target)) {
        unresolved.push({ ...plan, reason: "restore_target_exists" });
        continue;
      }
      await mkdir(path.dirname(plan.target), { recursive: true });
      try {
        const retry = await renameWithRetry(plan.source, plan.target, clamp(args.retry_count, 0, 10, 5), clamp(args.retry_delay_ms, 25, 2_000, 150));
        restored.push({ ...plan, retry });
      } catch (error) {
        unresolved.push({ ...plan, code: error.code || "rename_failed", error: error.message });
      }
    }
    const result = { operation_result: unresolved.length ? "partial" : "restored", operation: "restore", executed: true, cleanup_id: cleanupId, restored, unresolved };
    await this.writeReport(`cleanup-restore-${cleanupId}`, result);
    return result;
  }

  async executeReview(review, args = {}) {
    const timeoutMs = clamp(args.timeout_ms, 1_000, MAX_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
    const maxOutputBytes = clamp(args.max_output_bytes, 512, MAX_RESPONSE_OUTPUT_BYTES, 16_000);
    const runId = `command-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const runDir = path.join(this.stateRoot, "commands", runId);
    await mkdir(runDir, { recursive: true });
    const beforeGit = await inspectGitStatus(review.root);
    const result = await runExactProcess(review.argv, {
      cwd: review.cwd,
      timeoutMs,
      maxOutputBytes,
      runDir
    });
    const afterGit = await inspectGitStatus(review.root);
    const execution = {
      run_id: runId,
      command: review.display_command,
      policy_layer: review.policy_layer,
      permission_action: review.permission_action,
      cwd: review.cwd,
      timeout_ms: timeoutMs,
      ...result,
      before_git_status: beforeGit,
      after_git_status: afterGit,
      worktree_delta_detected: JSON.stringify(beforeGit.lines) !== JSON.stringify(afterGit.lines),
      rollback: {
        automatic: false,
        reason: "A standalone command has no declared compensating action. Use a task graph node with rollback for automatic rollback execution."
      },
      evidence_dir: runDir
    };
    await writeJsonAtomic(path.join(runDir, "result.json"), execution);
    return execution;
  }

  async refreshStoredReview(storedReview) {
    const current = await this.reviewCommand({
      root: storedReview.root,
      cwd: storedReview.cwd,
      mode: storedReview.mode,
      script: storedReview.mode === "project_script" ? storedReview.argv[2] : "",
      argv: storedReview.argv
    });
    if (current.review_id !== storedReview.review_id) {
      throw new ProjectAutomationError("A task graph command or project script changed after planning; create a new reviewed graph.", "task_graph_review_stale", {
        planned_review_id: storedReview.review_id,
        current_review_id: current.review_id
      });
    }
    return current;
  }

  async resolveRoot(requestedRoot) {
    const resolved = await realpath(path.resolve(requestedRoot)).catch(() => null);
    if (!resolved) throw new ProjectAutomationError("Project root does not exist.", "project_root_missing", { root: requestedRoot });
    if (!this.allowedRoots.some((root) => isInside(root, resolved))) throw new ProjectAutomationError("Project root is outside allowed roots.", "project_root_blocked", { root: resolved });
    const info = await stat(resolved);
    if (!info.isDirectory()) throw new ProjectAutomationError("Project root must be a directory.", "project_root_not_directory", { root: resolved });
    return resolved;
  }

  graphPath(graphId) {
    if (!/^task-graph-[a-z0-9-]+$/i.test(String(graphId || ""))) throw new ProjectAutomationError("Invalid task graph id.", "task_graph_id_invalid");
    return path.join(this.stateRoot, "graphs", `${graphId}.json`);
  }

  async saveGraph(graph) {
    graph.updated_at = new Date().toISOString();
    await writeJsonAtomic(this.graphPath(graph.graph_id), graph);
  }

  async loadGraph(graphId) {
    return readJson(this.graphPath(graphId), "task_graph_not_found");
  }

  async listGraphs(root) {
    const dir = path.join(this.stateRoot, "graphs");
    const files = await readdir(dir).catch(() => []);
    const out = [];
    for (const file of files.filter((name) => name.endsWith(".json")).slice(-50)) {
      const graph = await readJson(path.join(dir, file), "task_graph_not_found").catch(() => null);
      if (graph && samePath(graph.root, root)) out.push(graphSummary(graph));
    }
    return out;
  }

  async withGraphLock(graphId, callback) {
    const lockPath = `${this.graphPath(graphId)}.lock`;
    await mkdir(path.dirname(lockPath), { recursive: true });
    let handle;
    try {
      handle = await open(lockPath, "wx");
    } catch (error) {
      if (error.code === "EEXIST") {
        const lockInfo = await stat(lockPath).catch(() => null);
        if (lockInfo && Date.now() - lockInfo.mtimeMs > 5 * 60_000) {
          await rm(lockPath, { force: true });
          handle = await open(lockPath, "wx");
        } else {
          throw new ProjectAutomationError("Task graph is already running in another process.", "task_graph_locked", { graph_id: graphId });
        }
      } else throw error;
    }
    try {
      await handle.writeFile(JSON.stringify({ pid: process.pid, created_at: new Date().toISOString() }));
      return await callback();
    } finally {
      await handle?.close().catch(() => {});
      await rm(lockPath, { force: true }).catch(() => {});
    }
  }

  async writeReport(kind, payload) {
    const reportPath = path.join(this.stateRoot, "reports", `${kind}-${Date.now()}-${randomUUID().slice(0, 8)}.json`);
    await writeJsonAtomic(reportPath, payload);
    return reportPath;
  }
}

function normalizeMode(value) {
  const mode = String(value || "known_safe");
  if (!["known_safe", "project_script", "reviewed_custom"].includes(mode)) throw new ProjectAutomationError("Unknown command policy mode.", "command_mode_invalid", { mode });
  return mode;
}

function normalizeArgv(value) {
  if (!Array.isArray(value) || !value.length || value.length > 64) throw new ProjectAutomationError("argv must contain 1-64 exact tokens.", "command_argv_invalid");
  const argv = value.map((token) => String(token));
  if (argv.some((token) => !token || /[\r\n\0]/.test(token) || CONTROL_TOKEN_PATTERN.test(token) || CONTROL_TEXT_PATTERN.test(token))) {
    throw new ProjectAutomationError("Shell operators, chaining, redirection, substitutions, and control characters are blocked.", "shell_operator_blocked");
  }
  if (DANGEROUS_TEXT_PATTERN.test(argv.join(" "))) throw new ProjectAutomationError("Dangerous command pattern blocked.", "dangerous_command_blocked");
  if (argv.some((token) => RAW_SECRET_ARGUMENT_PATTERN.test(token) || SECRET_ARGUMENT_NAME_PATTERN.test(token))) {
    throw new ProjectAutomationError("Raw secret-bearing command arguments are blocked; use a dedicated credential reference capability.", "raw_secret_argument_blocked");
  }
  return argv;
}

function validateKnownSafeArgv(argvValue, root, cwd) {
  const argv = normalizeArgv(argvValue);
  const executable = path.basename(argv[0]).toLowerCase().replace(/\.exe$|\.cmd$/g, "");
  const verb = String(argv[1] || "").toLowerCase();
  if (executable === "git" && ["status", "diff", "log", "show", "ls-files", "rev-parse"].includes(verb)) return;
  if (executable === "git" && verb === "branch" && argv.length === 3 && argv[2] === "--show-current") return;
  if (executable === "node" && verb === "--check" && argv.length >= 3) return validateWorkspaceArgs(argv.slice(2), root, cwd);
  if (["cargo"].includes(executable) && ["test", "check", "build"].includes(verb)) return;
  if (executable === "go" && verb === "test") return;
  if (["python", "python3"].includes(executable) && verb === "-m" && ["pytest", "unittest"].includes(String(argv[2] || "").toLowerCase())) return;
  if (executable === "pytest") return;
  if (executable === "dotnet" && ["test", "build"].includes(verb)) return;
  throw new ProjectAutomationError("Command is not a known-safe task; use an exact reviewed custom command under a stronger profile.", "known_safe_command_blocked", { argv });
}

function validateReviewedCustomArgv(argvValue, root, cwd) {
  const argv = normalizeArgv(argvValue);
  const rawExecutable = argv[0];
  const executable = path.basename(rawExecutable).toLowerCase();
  if (path.isAbsolute(rawExecutable) || /[\\/]/.test(rawExecutable)) throw new ProjectAutomationError("Custom executable paths are blocked; use a PATH executable or project-declared script.", "custom_executable_path_blocked");
  if (DANGEROUS_EXECUTABLES.has(executable) || ["curl", "curl.exe", "wget", "wget.exe", "npx", "npx.cmd"].includes(executable)) {
    throw new ProjectAutomationError("Custom executable is blocked by command policy.", "custom_executable_blocked", { executable });
  }
  const lowered = argv.map((token) => token.toLowerCase());
  if (lowered.some((token) => ["-e", "--eval", "-c", "--command", "-command", "-encodedcommand", "--exec"].includes(token))) {
    throw new ProjectAutomationError("Inline code and shell-command flags are blocked for custom execution.", "custom_inline_code_blocked");
  }
  if (["git", "git.exe"].includes(executable) && !["status", "diff", "log", "show", "ls-files", "rev-parse"].includes(lowered[1])) {
    throw new ProjectAutomationError("Git mutations are not custom commands; use the scoped Git/GitHub tools.", "custom_git_mutation_blocked");
  }
  validateWorkspaceArgs(argv.slice(1), root, cwd, { onlyPathLike: true });
}

function validateWorkspaceArgs(args, root, cwd, options = {}) {
  for (const token of args) {
    if (token === ".." || token.includes("../") || token.includes("..\\")) throw new ProjectAutomationError("Path traversal token blocked.", "command_path_traversal_blocked", { token });
    const pathLike = /[\\/]/.test(token) || /\.(?:js|mjs|cjs|ts|tsx|jsx|json|py|go|rs|csproj)$/i.test(token);
    if (options.onlyPathLike && !pathLike) continue;
    if (!pathLike || token.startsWith("-") || /^https?:/i.test(token)) continue;
    if (isSecretLikeRelative(token)) throw new ProjectAutomationError("Secret-like command paths are blocked.", "command_secret_path_blocked", { path: token });
    const candidate = path.isAbsolute(token) ? path.resolve(token) : path.resolve(cwd, token);
    ensureInside(root, candidate);
  }
}

function classifyDeclaredScript(name, body) {
  const reasons = [];
  const text = String(body || "").trim();
  if (!text) reasons.push("empty script body");
  if (BLOCKED_SCRIPT_NAME_PATTERN.test(name) && !/^test(?::|$)/i.test(name)) reasons.push("dangerous lifecycle/deploy/release script name");
  if (DANGEROUS_TEXT_PATTERN.test(text)) reasons.push("dangerous command pattern");
  if (SCRIPT_CONTROL_PATTERN.test(text.replace(/\s+&&\s+/g, " "))) reasons.push("uncontrolled shell operator or redirection");
  const segments = text.split(/\s+&&\s+/).map((segment) => segment.trim()).filter(Boolean);
  const executables = [];
  for (const segment of segments) {
    const executable = segment.match(/^(?:[A-Za-z_][A-Za-z0-9_]*=[^\s]+\s+)*([^\s]+)/)?.[1]?.replace(/^"|"$/g, "").toLowerCase();
    if (executable) executables.push(path.basename(executable).replace(/\.cmd$|\.exe$/g, ""));
    if (!executable || !SAFE_SCRIPT_SEGMENT_EXECUTABLES.has(path.basename(executable).replace(/\.cmd$|\.exe$/g, ""))) reasons.push(`unreviewed script executable: ${executable || "unknown"}`);
    const segmentTokens = segment.split(/\s+/).map((token) => token.toLowerCase());
    if (segmentTokens.some((token) => ["-e", "--eval", "-c", "--command", "-command", "-encodedcommand", "--exec"].includes(token))) reasons.push("inline code or shell-command flag");
    if (["npm", "pnpm", "yarn", "bun"].includes(path.basename(executable || "")) && segmentTokens[1] === "run") reasons.push("nested package-script execution is hidden chaining");
  }
  return {
    layer: "project_declared",
    allowed: reasons.length === 0,
    code: reasons.length ? "project_script_policy_blocked" : "project_script_allowed",
    controlled_and_chain_segments: segments.length,
    reviewed_executables: [...new Set(executables)],
    reasons
  };
}

async function readPackageManifest(root, required = false) {
  const file = path.join(root, "package.json");
  if (!existsSync(file)) {
    if (required) throw new ProjectAutomationError("package.json is required for a project script.", "package_json_missing");
    return null;
  }
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    throw new ProjectAutomationError("package.json is invalid JSON.", "package_json_invalid", { error: error.message });
  }
}

function detectTaskRunners(files, manifest) {
  const found = [];
  if (manifest) found.push({ runner: "package-scripts", file: "package.json", tasks: Object.keys(manifest.scripts || {}) });
  const candidates = [
    ["Makefile", "make"], ["makefile", "make"], ["justfile", "just"], ["Taskfile.yml", "task"],
    ["Taskfile.yaml", "task"], ["Cargo.toml", "cargo"], ["pyproject.toml", "python"], ["go.mod", "go"],
    ["pom.xml", "maven"], ["build.gradle", "gradle"], ["build.gradle.kts", "gradle"]
  ];
  for (const [file, runner] of candidates) if (files.has(file)) found.push({ runner, file, tasks: [] });
  return found;
}

function choosePackageManager(files, probes) {
  if (files.has("pnpm-lock.yaml")) return "pnpm";
  if (files.has("yarn.lock")) return "yarn";
  if (files.has("bun.lock") || files.has("bun.lockb")) return "bun";
  if (files.has("package-lock.json")) return "npm";
  return probes.find((probe) => probe.available)?.command || "npm";
}

async function probeExecutable(command, args, cwd) {
  const result = await runProbe(command, args, cwd, 2_500);
  return { command, available: result.spawned, exit_code: result.exitCode, version: firstNonEmptyLine(`${result.stdout}\n${result.stderr}`), error: result.spawned ? null : result.error };
}

async function runProbe(command, args, cwd, timeoutMs, maxOutputBytes = 2_000) {
  return new Promise((resolve) => {
    const child = spawn(resolveWindowsCommand(command), args, { cwd, windowsHide: true, shell: windowsNeedsShell(command), stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => {
      terminateTree(child).finally(() => finish({ spawned: true, exitCode: null, stdout, stderr, error: "probe timeout" }));
    }, timeoutMs);
    child.stdout.on("data", (chunk) => { stdout = appendBounded(stdout, chunk.toString(), maxOutputBytes); });
    child.stderr.on("data", (chunk) => { stderr = appendBounded(stderr, chunk.toString(), Math.min(maxOutputBytes, 8_000)); });
    child.on("error", (error) => finish({ spawned: false, exitCode: null, stdout, stderr, error: error.code || error.message }));
    child.on("close", (code) => finish({ spawned: true, exitCode: code, stdout, stderr, error: null }));
  });
}

async function runExactProcess(argv, { cwd, timeoutMs, maxOutputBytes, runDir }) {
  const stdoutPath = path.join(runDir, "stdout.log");
  const stderrPath = path.join(runDir, "stderr.log");
  const stdoutStream = createWriteStream(stdoutPath, { encoding: "utf8" });
  const stderrStream = createWriteStream(stderrPath, { encoding: "utf8" });
  const startedAt = Date.now();
  const environment = sanitizedCommandEnvironment();
  return new Promise((resolve) => {
    const launch = exactSpawnSpec(argv);
    const child = spawn(launch.command, launch.args, {
      cwd,
      env: environment.env,
      windowsHide: true,
      shell: launch.shell,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let stdoutLines = 0;
    let stderrLines = 0;
    let timedOut = false;
    let terminationEvidence = null;
    let terminationPromise = null;
    let settled = false;
    const collect = (kind, chunk) => {
      const redacted = redactText(chunk.toString());
      const bytes = Buffer.byteLength(redacted);
      if (kind === "stdout") {
        stdoutBytes += bytes;
        stdoutLines += countLineBreaks(redacted);
        if (stdoutBytes <= MAX_LOG_BYTES) stdoutStream.write(redacted);
        stdout = appendHeadTail(stdout, redacted, maxOutputBytes);
      } else {
        stderrBytes += bytes;
        stderrLines += countLineBreaks(redacted);
        if (stderrBytes <= MAX_LOG_BYTES) stderrStream.write(redacted);
        stderr = appendHeadTail(stderr, redacted, maxOutputBytes);
      }
    };
    const finish = async (code, signal, spawnError = null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      stdoutStream.end();
      stderrStream.end();
      await Promise.all([streamFinished(stdoutStream), streamFinished(stderrStream)]);
      const durationMs = Date.now() - startedAt;
      const outputTruncated = stdoutBytes > maxOutputBytes || stderrBytes > maxOutputBytes;
      resolve({
        ok: code === 0 && !timedOut && !spawnError,
        exit_code: code,
        signal,
        timed_out: timedOut,
        duration_ms: durationMs,
        pid: child.pid || null,
        launch_transport: launch.transport,
        environment_safety: environment.summary,
        stdout: compactOutput(stdout, maxOutputBytes),
        stderr: compactOutput(spawnError ? `${stderr}\n${spawnError.message}` : stderr, maxOutputBytes),
        output_summary: {
          stdout_bytes: stdoutBytes,
          stderr_bytes: stderrBytes,
          stdout_lines: stdoutBytes ? stdoutLines + 1 : 0,
          stderr_lines: stderrBytes ? stderrLines + 1 : 0,
          output_truncated: outputTruncated,
          response_strategy: outputTruncated ? "head_tail_summary_with_redacted_log" : "bounded_full_output",
          evidence_log_cap_bytes: MAX_LOG_BYTES
        },
        stdout_log: stdoutPath,
        stderr_log: stderrPath,
        process_tree_termination: timedOut ? "attempted_and_waited" : "not_needed",
        process_tree_termination_evidence: terminationEvidence,
        orphan_status: timedOut ? "process tree termination requested; verify externally only if a child escaped its inherited process tree" : "no timeout"
      });
    };
    const timer = setTimeout(() => {
      timedOut = true;
      terminationPromise = terminateTree(child)
        .catch((error) => ({ attempted: true, strategy: "termination_runtime_error", ok: false, error: redactText(error?.message || String(error)) }))
        .then((evidence) => {
          terminationEvidence = evidence;
          setTimeout(() => finish(null, "SIGKILL"), 1_500).unref();
          return evidence;
        });
    }, timeoutMs);
    const finishAfterTermination = (code, signal, error = null) => {
      if (terminationPromise) terminationPromise.then(() => finish(code, signal, error));
      else finish(code, signal, error);
    };
    child.stdout.on("data", (chunk) => collect("stdout", chunk));
    child.stderr.on("data", (chunk) => collect("stderr", chunk));
    child.on("error", (error) => finishAfterTermination(null, null, error));
    child.on("close", (code, signal) => finishAfterTermination(code, signal));
  });
}

async function terminateTree(child) {
  if (!child?.pid) return { attempted: false, reason: "missing_pid" };
  if (process.platform === "win32") {
    const descendantSnapshot = windowsDescendantPids(child.pid);
    const result = await new Promise((resolve) => {
      const killer = spawn(resolveWindowsSystemCommand("taskkill.exe"), ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"], shell: false });
      let stdout = "";
      let stderr = "";
      killer.stdout.on("data", (chunk) => { stdout = appendBounded(stdout, chunk.toString(), 4_000); });
      killer.stderr.on("data", (chunk) => { stderr = appendBounded(stderr, chunk.toString(), 4_000); });
      killer.on("error", (error) => resolve({ ok: false, exit_code: null, error: error.message, stdout, stderr }));
      killer.on("close", (code) => resolve({ ok: code === 0, exit_code: code, error: null, stdout, stderr }));
    });
    const descendants = await descendantSnapshot;
    await sleep(150);
    const directTermination = [];
    const ownedPids = [...new Set([...descendants.pids, child.pid])];
    const survivingAfterTaskkill = ownedPids.filter(pidIsRunning);
    if (!result.ok || survivingAfterTaskkill.length) {
      for (const pid of [...survivingAfterTaskkill].reverse()) {
        try { process.kill(pid, "SIGKILL"); directTermination.push({ pid, killed: true }); }
        catch (error) { directTermination.push({ pid, killed: false, code: error.code || "kill_failed" }); }
      }
      await sleep(250);
    }
    const survivingAfterCleanup = ownedPids.filter(pidIsRunning);
    const cleanupVerified = descendants.available ? survivingAfterCleanup.length === 0 : result.ok && !pidIsRunning(child.pid);
    return {
      attempted: true,
      strategy: directTermination.length ? "taskkill_then_surviving_owned_pids" : "taskkill_process_tree",
      ...result,
      ok: cleanupVerified,
      stdout: redactText(result.stdout),
      stderr: redactText(result.stderr),
      termination_order: "taskkill_started_without_waiting_for_descendant_snapshot",
      descendant_discovery: descendants,
      direct_termination: directTermination,
      cleanup_verification: { available: descendants.available, surviving_after_taskkill: survivingAfterTaskkill, surviving_after_cleanup: survivingAfterCleanup }
    };
  }
  try { process.kill(-child.pid, "SIGTERM"); } catch { try { child.kill("SIGTERM"); } catch {} }
  await sleep(500);
  try { process.kill(-child.pid, "SIGKILL"); } catch { try { child.kill("SIGKILL"); } catch {} }
  return { attempted: true, strategy: "posix_process_group_sigterm_sigkill", ok: true };
}

function pidIsRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

async function windowsDescendantPids(rootPid) {
  const powershell = resolveWindowsSystemCommand(path.join("WindowsPowerShell", "v1.0", "powershell.exe"));
  const script = "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId | ConvertTo-Json -Compress";
  const result = await new Promise((resolve) => {
    const child = spawn(powershell, ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script], { windowsHide: true, shell: false, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => {
      try { child.kill("SIGKILL"); } catch {}
      finish({ ok: false, stdout, stderr, error: "process_snapshot_timeout" });
    }, 3_000);
    child.stdout.on("data", (chunk) => { stdout = appendBounded(stdout, chunk.toString(), 256_000); });
    child.stderr.on("data", (chunk) => { stderr = appendBounded(stderr, chunk.toString(), 8_000); });
    child.on("error", (error) => finish({ ok: false, stdout, stderr, error: error.code || error.message }));
    child.on("close", (code) => finish({ ok: code === 0, stdout, stderr, error: code === 0 ? null : `exit_${code}` }));
  });
  if (!result.ok) return { available: false, pids: [], error: result.error, stderr: redactText(result.stderr) };
  try {
    const parsed = JSON.parse(result.stdout);
    const rows = (Array.isArray(parsed) ? parsed : [parsed]).map((item) => ({ pid: Number(item.ProcessId), parent: Number(item.ParentProcessId) })).filter((item) => item.pid > 0 && item.parent >= 0);
    const pids = [];
    const visit = (parent) => {
      for (const row of rows.filter((item) => item.parent === parent)) {
        visit(row.pid);
        pids.push(row.pid);
      }
    };
    visit(Number(rootPid));
    return { available: true, pids, error: null };
  } catch (error) {
    return { available: false, pids: [], error: `process_snapshot_parse_failed: ${error.message}` };
  }
}

function streamFinished(stream) {
  if (stream.closed) return Promise.resolve();
  return new Promise((resolve) => {
    stream.once("close", resolve);
    stream.once("error", resolve);
  });
}

async function inspectGitStatus(root) {
  const result = await runProbe("git", ["status", "--short"], root, 3_000);
  return { available: result.spawned, ok: result.exitCode === 0, lines: result.exitCode === 0 ? result.stdout.split(/\r?\n/).filter(Boolean).slice(0, 200) : [], error: result.exitCode === 0 ? null : firstNonEmptyLine(result.stderr) };
}

function topologicalOrder(nodes) {
  const indegree = new Map(nodes.map((node) => [node.id, node.depends_on.length]));
  const queue = nodes.filter((node) => indegree.get(node.id) === 0).map((node) => node.id).sort();
  const order = [];
  while (queue.length) {
    const current = queue.shift();
    order.push(current);
    for (const node of nodes.filter((item) => item.depends_on.includes(current))) {
      indegree.set(node.id, indegree.get(node.id) - 1);
      if (indegree.get(node.id) === 0) queue.push(node.id);
    }
    queue.sort();
  }
  if (order.length !== nodes.length) throw new ProjectAutomationError("Task graph contains a dependency cycle.", "task_graph_cycle");
  return order;
}

function normalizeSatisfaction(value) {
  if (!value) return null;
  const type = String(value.type || "");
  if (!["path_exists", "path_missing", "file_sha256", "port_listening"].includes(type)) throw new ProjectAutomationError("Unsupported satisfaction condition.", "task_satisfaction_invalid", { type });
  return { type, path: value.path ? normalizeRelative(value.path) : null, sha256: value.sha256 || null, port: value.port ? Number(value.port) : null };
}

async function evaluateSatisfaction(root, condition, suppliedPorts) {
  if (!condition) return { satisfied: false, reason: "no_satisfaction_condition" };
  if (condition.type === "port_listening") {
    const port = condition.port;
    const found = (await inspectPorts([...new Set([port, ...suppliedPorts])])).find((item) => item.port === port);
    return { satisfied: Boolean(found?.listening), condition, observed: found || null };
  }
  const candidate = path.resolve(root, condition.path || "");
  ensureInside(root, candidate);
  const present = existsSync(candidate);
  if (condition.type === "path_exists") return { satisfied: present, condition, observed: { exists: present } };
  if (condition.type === "path_missing") return { satisfied: !present, condition, observed: { exists: present } };
  if (!present) return { satisfied: false, condition, observed: { exists: false } };
  const linkInfo = await lstat(candidate);
  if (linkInfo.isSymbolicLink()) return { satisfied: false, condition, observed: { exists: true, symlink_blocked: true } };
  const resolved = await realpath(candidate);
  ensureInside(root, resolved);
  const info = await stat(resolved);
  if (!info.isFile()) return { satisfied: false, condition, observed: { exists: true, file: false } };
  const digest = sha256(await readFile(resolved));
  return { satisfied: digest === condition.sha256, condition, observed: { exists: true, sha256: digest } };
}

function graphSummary(graph, options = {}) {
  const counts = Object.fromEntries(["pending", "running", "satisfied", "completed", "failed", "blocked", "rolled_back"].map((status) => [status, graph.nodes.filter((node) => node.status === status).length]));
  return {
    graph_id: graph.graph_id,
    name: graph.name,
    root: graph.root,
    status: graph.status,
    order: graph.order,
    counts,
    run_count: graph.run_count,
    interruption_count: graph.interruption_count,
    processed_this_run: options.processedThisRun ?? null,
    rollback_contract: graph.rollback_contract,
    evidence: graph.evidence,
    updated_at: graph.updated_at,
    nodes: options.includeNodes ? graph.nodes : undefined,
    resume_supported: ["planned", "running", "paused", "failed"].includes(graph.status),
    next_best_action: graph.status === "completed" ? "Inspect evidence or execute declared rollback if needed." : graph.status === "rolled_back" ? "Verify restored state." : "Resume the graph after addressing any failed node evidence."
  };
}

async function inspectPorts(ports) {
  const requested = [...new Set(ports.map(Number).filter((port) => Number.isInteger(port) && port > 0 && port <= 65535))].slice(0, 50);
  if (!requested.length) return [];
  const command = process.platform === "win32" ? resolveWindowsSystemCommand("netstat.exe") : "sh";
  const args = process.platform === "win32" ? ["-ano", "-p", "tcp"] : ["-c", "command -v ss >/dev/null 2>&1 && ss -ltnp || netstat -ltnp 2>/dev/null || true"];
  const result = await runProbe(command, args, process.cwd(), 5_000, 256_000);
  return requested.map((port) => {
    const lines = `${result.stdout}\n${result.stderr}`.split(/\r?\n/).filter((line) => new RegExp(`[:.]${port}(?:\\s|$)`).test(line) && /LISTEN|LISTENING/i.test(line));
    const pid = process.platform === "win32" ? Number(lines[0]?.trim().split(/\s+/).at(-1)) || null : Number(lines[0]?.match(/pid=(\d+)/)?.[1]) || null;
    return { port, listening: lines.length > 0, pid, evidence_lines: lines.slice(0, 5).map(redactText), probe_available: result.spawned };
  });
}

async function collectLogsFirst(root, requestedPaths, maxFiles) {
  const candidates = new Set();
  for (const requested of requestedPaths.slice(0, maxFiles)) {
    if (isSecretLikeRelative(requested)) continue;
    const candidate = path.resolve(root, requested);
    ensureInside(root, candidate);
    if (existsSync(candidate)) candidates.add(candidate);
  }
  const walkRoots = [root, path.join(root, "logs"), path.join(root, "log")].filter((candidate) => existsSync(candidate));
  for (const walkRoot of walkRoots) await findLogFiles(walkRoot, candidates, maxFiles, walkRoot === root ? 2 : 4);
  const logs = [];
  for (const file of [...candidates].slice(0, maxFiles)) {
    const linkInfo = await lstat(file).catch(() => null);
    if (!linkInfo || linkInfo.isSymbolicLink()) continue;
    const resolved = await realpath(file).catch(() => null);
    if (!resolved || !isInside(root, resolved)) continue;
    const info = await stat(resolved).catch(() => null);
    if (!info?.isFile()) continue;
    const bytes = await readFile(resolved);
    const tail = bytes.subarray(Math.max(0, bytes.length - 8_000)).toString("utf8");
    logs.push({ path: normalizeRelative(path.relative(root, resolved)), bytes: info.size, modified_at: info.mtime.toISOString(), tail: redactText(tail), truncated_to_tail: bytes.length > 8_000 });
  }
  logs.sort((left, right) => right.modified_at.localeCompare(left.modified_at));
  return logs;
}

async function findLogFiles(root, output, maxFiles, depth, currentDepth = 0) {
  if (output.size >= maxFiles || currentDepth > depth) return;
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (output.size >= maxFiles) break;
    if ([".git", "node_modules", "dist", "build", "coverage"].includes(entry.name)) continue;
    const full = path.join(root, entry.name);
    if (entry.isFile() && /(?:\.log$|npm-debug\.log$|yarn-error\.log$)/i.test(entry.name) && !isSecretLikeRelative(full)) output.add(full);
    else if (entry.isDirectory()) await findLogFiles(full, output, maxFiles, depth, currentDepth + 1);
  }
}

async function inspectLockPath(root, requested) {
  const candidate = path.resolve(root, requested);
  ensureInside(root, candidate);
  if (!existsSync(candidate)) return { path: normalizeRelative(requested), exists: false, writable_open: false, lock_signal: "missing" };
  const info = await lstat(candidate);
  if (info.isSymbolicLink()) return { path: normalizeRelative(requested), exists: true, type: "symlink", writable_open: false, lock_signal: "symlink_blocked" };
  const resolved = await realpath(candidate);
  ensureInside(root, resolved);
  if (!info.isFile()) return { path: normalizeRelative(requested), exists: true, type: info.isDirectory() ? "directory" : "other", writable_open: null, lock_signal: "not_a_file" };
  try {
    const handle = await open(resolved, "r+");
    await handle.close();
    return { path: normalizeRelative(requested), exists: true, type: "file", writable_open: true, lock_signal: "no_exclusive_write_lock_observed" };
  } catch (error) {
    return { path: normalizeRelative(requested), exists: true, type: "file", writable_open: false, lock_signal: ["EBUSY", "EPERM", "EACCES"].includes(error.code) ? "possible_file_lock_or_permission" : "open_failed", code: error.code, error: error.message };
  }
}

async function inspectTempCandidates(root) {
  const out = [];
  for (const name of [".tmp", "tmp", "temp", ".cache", ".vnem-temp"]) {
    const candidate = path.join(root, name);
    if (!existsSync(candidate)) continue;
    out.push({ path: name, ...(await inventoryPath(candidate)) });
  }
  return out;
}

async function inventoryPath(target) {
  let bytes = 0;
  let entries = 0;
  const queue = [target];
  while (queue.length && entries < 20_000) {
    const current = queue.pop();
    const info = await lstat(current);
    entries += 1;
    if (info.isFile()) bytes += info.size;
    else if (info.isDirectory()) {
      for (const child of await readdir(current)) queue.push(path.join(current, child));
    }
  }
  return { bytes, entries, inventory_truncated: entries >= 20_000 };
}

async function renameWithRetry(source, destination, retries, delayMs) {
  let attempt = 0;
  while (true) {
    try {
      await mkdir(path.dirname(destination), { recursive: true });
      await rename(source, destination);
      return { attempts: attempt + 1, retried: attempt > 0 };
    } catch (error) {
      if (!["EBUSY", "EPERM", "ENOTEMPTY", "EACCES"].includes(error.code) || attempt >= retries) throw error;
      attempt += 1;
      await sleep(delayMs * attempt);
    }
  }
}

function chooseDiagnosticNextStep({ logs, ports, lockChecks, graphs }) {
  if (logs.length) return `Inspect the newest captured log first: ${logs[0].path}.`;
  const locked = lockChecks.find((item) => item.lock_signal === "possible_file_lock_or_permission");
  if (locked) return `Resolve or close the owner of ${locked.path}, then retry bounded temp quarantine.`;
  const listening = ports.find((item) => item.listening);
  if (listening) return `Confirm whether PID ${listening.pid || "unknown"} on port ${listening.port} belongs to a VNEM-started server before stopping it.`;
  const resumable = graphs.find((graph) => graph.resume_supported);
  if (resumable) return `Resume task graph ${resumable.graph_id} from persisted state.`;
  return "Run the smallest reviewed project command that can reproduce the issue and collect its bounded evidence.";
}

async function resolveWorkspaceDirectory(root, requested) {
  const candidate = path.resolve(root, requested);
  ensureInside(root, candidate);
  const resolved = await realpath(candidate).catch(() => null);
  if (!resolved) throw new ProjectAutomationError("Command cwd does not exist.", "command_cwd_missing", { cwd: requested });
  ensureInside(root, resolved);
  const info = await stat(resolved);
  if (!info.isDirectory()) throw new ProjectAutomationError("Command cwd must be a directory.", "command_cwd_not_directory", { cwd: requested });
  return resolved;
}

async function writeJsonAtomic(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  if (process.platform === "win32" && existsSync(file)) {
    const backup = `${temp}.bak`;
    await rename(file, backup);
    try {
      await rename(temp, file);
      await rm(backup, { force: true });
    } catch (error) {
      await rename(backup, file).catch(() => {});
      throw error;
    }
  } else await rename(temp, file);
}

async function readJson(file, code) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    throw new ProjectAutomationError("Project automation state was not found or is invalid.", code, { file, error: error.message });
  }
}

function compactOutput(text, maxBytes) {
  const value = String(text || "");
  if (Buffer.byteLength(value) <= maxBytes) return value;
  const marker = "\n[vnem output compacted: middle omitted]\n";
  const half = Math.max(0, Math.floor((maxBytes - Buffer.byteLength(marker)) / 2));
  return `${value.slice(0, half)}${marker}${value.slice(-half)}`;
}

function appendBounded(existing, incoming, maxBytes) {
  const combined = `${existing}${incoming}`;
  if (Buffer.byteLength(combined) <= maxBytes * 2) return combined;
  return combined.slice(-maxBytes * 2);
}

function appendHeadTail(existing, incoming, maxBytes) {
  const combined = `${existing}${incoming}`;
  if (Buffer.byteLength(combined) <= maxBytes * 2) return combined;
  const marker = "\n[vnem streaming sample: middle omitted]\n";
  const half = Math.max(0, maxBytes - Math.ceil(Buffer.byteLength(marker) / 2));
  return `${combined.slice(0, half)}${marker}${combined.slice(-half)}`;
}

function redactText(value) {
  return String(value || "")
    .replace(/((?:authorization|x-api-key|api[_-]?key|token|password|passwd|secret|cookie)\s*[:=]\s*)[^\s,;]+/gi, "$1[REDACTED]")
    .replace(/\b(?:ghp|github_pat|sk|cf|xox[baprs])-[_A-Za-z0-9-]{12,}\b/g, "[REDACTED_TOKEN]")
    .replace(/-----BEGIN [^-]+ PRIVATE KEY-----[\s\S]*?-----END [^-]+ PRIVATE KEY-----/g, "[REDACTED_PRIVATE_KEY]");
}

function sanitizedCommandEnvironment() {
  const env = {};
  const removed = [];
  const blockedExact = new Set(["BASH_ENV", "ENV", "GIT_ASKPASS", "NODE_OPTIONS", "NPM_CONFIG_USERCONFIG", "PROMPT_COMMAND", "SSH_ASKPASS"]);
  for (const [key, value] of Object.entries(process.env)) {
    if (blockedExact.has(key.toUpperCase()) || SECRET_ENV_KEY_PATTERN.test(key)) {
      removed.push(key);
      continue;
    }
    env[key] = value;
  }
  env.CI = process.env.CI || "1";
  env.NO_COLOR = process.env.NO_COLOR || "1";
  env.FORCE_COLOR = "0";
  return {
    env,
    summary: {
      inherited_keys: Object.keys(env).length,
      removed_key_names: removed.sort(),
      removed_secret_values_exposed: false,
      forced_ci: env.CI,
      color_disabled: true
    }
  };
}

function resolveWindowsCommand(command) {
  if (process.platform !== "win32") return command;
  const lower = String(command).toLowerCase();
  if (["npm", "pnpm", "yarn", "bun", "npx"].includes(lower)) return `${command}.cmd`;
  return command;
}

function exactSpawnSpec(argv) {
  if (process.platform === "win32" && String(argv[0]).toLowerCase().replace(/\.cmd$/, "") === "npm") {
    const candidates = [
      process.env.npm_execpath,
      path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js")
    ].filter((candidate) => candidate && /npm-cli\.js$/i.test(candidate) && existsSync(candidate));
    if (candidates.length) return { command: process.execPath, args: [candidates[0], ...argv.slice(1)], shell: false, transport: "direct_node_package_manager_cli" };
  }
  const command = resolveWindowsCommand(argv[0]);
  return { command, args: argv.slice(1), shell: windowsNeedsShell(command), transport: windowsNeedsShell(command) ? "reviewed_windows_command_wrapper" : "direct_process" };
}

function windowsNeedsShell(command) {
  return process.platform === "win32" && /\.(?:cmd|bat)$/i.test(resolveWindowsCommand(command));
}

function resolveWindowsSystemCommand(name) {
  if (process.platform !== "win32") return name;
  const systemRoot = process.env.SystemRoot || process.env.SYSTEMROOT;
  return systemRoot ? path.join(systemRoot, "System32", name) : name;
}

function quoteDisplayArg(value) {
  const text = String(value);
  return /\s|["']/.test(text) ? JSON.stringify(text) : text;
}

function isBuildArgv(argv) {
  return argv.some((token) => /^(?:build|compile|typecheck)$/i.test(token));
}

function countLineBreaks(value) {
  return (String(value || "").match(/\n/g) || []).length;
}

function firstNonEmptyLine(value) {
  return String(value || "").split(/\r?\n/).map((line) => line.trim()).find(Boolean) || null;
}

function clamp(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.trunc(number))) : fallback;
}

function normalizeRelative(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function isSecretLikeRelative(value) {
  return normalizeRelative(value).toLowerCase().split("/").some((part) => part === ".env" || part.startsWith(".env.") || /(?:^|[._-])(?:secret|token|credential|password|passwd|api[_-]?key|private[_-]?key|cookies?|sessions?)(?:[._-]|$)/i.test(part) || /\.(?:pem|key|p12|pfx)$/i.test(part));
}

function ensureInside(root, candidate) {
  if (!isInside(root, candidate)) throw new ProjectAutomationError("Path escapes the project root.", "project_path_escape", { root, path: candidate });
}

function isInside(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function samePath(left, right) {
  const a = path.resolve(left);
  const b = path.resolve(right);
  return process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
