import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import TOML from "@iarna/toml";
import yaml from "js-yaml";

const MAX_MANIFEST_BYTES = 4 * 1024 * 1024;
const MAX_LOCKFILE_BYTES = 32 * 1024 * 1024;
const MAX_PROCESS_OUTPUT_BYTES = 64 * 1024;
const SAFE_VERIFY_SCRIPT_NAMES = new Set(["test", "validate", "build", "lint", "typecheck", "check"]);
const LIFECYCLE_NAMES = new Set(["preinstall", "install", "postinstall", "prepare", "prepublish", "prepublishOnly"]);
const SUSPICIOUS_SCRIPT_PATTERNS = [
  ["remote_pipe_execution", /(?:curl|wget|invoke-webrequest|iwr)\b[^\n]*(?:\||iex|invoke-expression|sh\b|bash\b|powershell\b|pwsh\b)/i],
  ["encoded_or_inline_execution", /(?:-encodedcommand|frombase64string|node\s+-e\b|python\s+-c\b|powershell\s+-command\b|pwsh\s+-command\b)/i],
  ["destructive_filesystem", /(?:rm\s+-rf|del\s+\/s|rmdir\s+\/s|format\b|mkfs\b|diskpart\b)/i],
  ["publish_or_remote_mutation", /(?:npm|pnpm|yarn)\s+publish\b|git\s+push\b|gh\s+(?:release|pr|repo)\b/i],
  ["credential_reference", /(?:token|secret|password|credential|authorization|cookie)/i],
  ["shell_control", /(?:&&|\|\||;|`|\$\(|>|<|\|)/]
];
const POPULAR_PACKAGES = [
  "react", "react-dom", "vue", "angular", "express", "lodash", "axios", "chalk", "commander", "dotenv",
  "zod", "typescript", "vite", "webpack", "eslint", "prettier", "next", "fastify", "koa", "ws", "js-yaml",
  "requests", "django", "flask", "numpy", "pandas", "pytest", "serde", "tokio", "clap"
];
const APPROVED_ADVISORY_HOSTS = new Set([
  "registry.npmjs.org", "api.osv.dev", "osv.dev", "github.com", "api.github.com",
  "nvd.nist.gov", "services.nvd.nist.gov"
]);
const SECRET_ENV_PATTERN = /(?:token|secret|password|credential|cookie|authorization|auth|askpass|npm_config_userconfig|node_options)/i;
const SAFE_NPM_ENV_NAMES = new Set([
  "PATH", "PATHEXT", "SYSTEMROOT", "WINDIR", "COMSPEC", "TEMP", "TMP", "TMPDIR", "LANG", "LC_ALL",
  "CI", "SOURCE_DATE_EPOCH", "NUMBER_OF_PROCESSORS", "PROCESSOR_ARCHITECTURE", "PROCESSOR_IDENTIFIER", "OS"
]);
const SECRET_TEXT_PATTERNS = [
  /(?:["']?(?:_authToken|authorization|x-api-key|password|secret|token)["']?\s*[=:]\s*["']?)[^"',\s}]+/gi,
  /https?:\/\/[^\s/@:]+:[^\s/@]+@/gi,
  /\b(?:ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|npm_[A-Za-z0-9]{20,})\b/g
];

export class DependencySecurityError extends Error {
  constructor(message, code = "dependency_security_error", details = {}) {
    super(message);
    this.name = "DependencySecurityError";
    this.code = code;
    this.details = details;
  }
}

export class DependencySecurityRuntime {
  constructor({ allowedRoots, evidenceRoot }) {
    this.allowedRoots = allowedRoots.map((item) => path.resolve(item));
    this.evidenceRoot = path.resolve(evidenceRoot);
    this.plans = new Map();
  }

  async inventory(args = {}) {
    const snapshot = await this.#inspectRoot(args.root || ".", args);
    return {
      operation_result: "dependency_inventory_reported",
      root: snapshot.root,
      ecosystems: snapshot.ecosystems,
      manifest_files: snapshot.manifest_files,
      lockfiles: snapshot.lockfiles,
      package_managers: snapshot.package_managers,
      packages: snapshot.packages,
      dependency_graph: snapshot.graph,
      lifecycle_scripts: snapshot.lifecycle_scripts,
      lockfile_integrity: snapshot.lockfile_integrity,
      sbom: buildSbom(snapshot),
      credential_safety: snapshot.credential_safety,
      limitations: snapshot.limitations
    };
  }

  async riskAudit(args = {}) {
    const snapshot = await this.#inspectRoot(args.root || ".", args);
    const trustedNames = [...new Set([...POPULAR_PACKAGES, ...(args.trusted_package_names || [])].map(normalizePackageName).filter(Boolean))];
    const lifecycleFindings = [];
    for (const script of snapshot.lifecycle_scripts) {
      const codes = suspiciousScriptCodes(script.command || "");
      const severity = codes.length ? "high" : script.source === "dependency_lock" ? "medium" : "medium";
      lifecycleFindings.push({ severity, code: codes[0] || "lifecycle_script_present", ...script, indicators: codes });
    }
    const typosquattingIndicators = [];
    for (const pkg of snapshot.packages.filter((item) => item.direct)) {
      const unscoped = pkg.name.includes("/") ? pkg.name.split("/").pop() : pkg.name;
      const nearest = trustedNames
        .filter((name) => name !== unscoped)
        .map((name) => ({ name, distance: editDistance(unscoped, name) }))
        .sort((a, b) => a.distance - b.distance || a.name.localeCompare(b.name))[0];
      if (nearest && nearest.distance <= 1 && unscoped.length >= 4) {
        typosquattingIndicators.push({ severity: "high", package: pkg.name, resembles: nearest.name, edit_distance: nearest.distance, indicator_only: true });
      }
    }
    const metadata = new Map((args.package_metadata || []).map((item) => [normalizePackageName(item.name), item]));
    const maintenanceFindings = [];
    for (const pkg of snapshot.packages.filter((item) => item.direct)) {
      const item = metadata.get(pkg.name);
      if (!item) {
        maintenanceFindings.push({ severity: "unknown", package: pkg.name, code: "maintenance_metadata_unavailable", proven: false });
        continue;
      }
      const ageDays = item.last_published_at ? Math.floor((Date.now() - Date.parse(item.last_published_at)) / 86400000) : null;
      if (item.deprecated) maintenanceFindings.push({ severity: "high", package: pkg.name, code: "package_deprecated", detail: redactText(item.deprecated) });
      if (Number.isFinite(ageDays) && ageDays > 730) maintenanceFindings.push({ severity: "medium", package: pkg.name, code: "stale_publish_activity", age_days: ageDays });
      if (Number.isInteger(item.maintainer_count) && item.maintainer_count <= 1) maintenanceFindings.push({ severity: "medium", package: pkg.name, code: "single_maintainer_indicator", maintainer_count: item.maintainer_count });
      if (!item.deprecated && !(Number.isFinite(ageDays) && ageDays > 730) && !(Number.isInteger(item.maintainer_count) && item.maintainer_count <= 1)) {
        maintenanceFindings.push({ severity: "info", package: pkg.name, code: "provided_metadata_has_no_maintenance_warning", proven: true });
      }
    }
    const licenseFindings = snapshot.packages.map((pkg) => licenseFinding(pkg, args.project_license || snapshot.project_license));
    const sourceFindings = snapshot.packages.flatMap((pkg) => packageSourceFindings(pkg));
    const findings = [...lifecycleFindings, ...typosquattingIndicators, ...maintenanceFindings, ...licenseFindings.filter((item) => item.severity !== "info"), ...sourceFindings];
    return {
      operation_result: findings.some((item) => item.severity === "high") ? "dependency_risks_found" : "dependency_risk_review_complete",
      root: snapshot.root,
      summary: countSeverities(findings),
      lifecycle_findings: lifecycleFindings,
      typosquatting_indicators: typosquattingIndicators,
      maintenance_findings: maintenanceFindings,
      license_findings: licenseFindings,
      source_findings: sourceFindings,
      credential_safety: snapshot.credential_safety,
      must_not_claim: [
        "A typosquatting indicator proves malicious intent.",
        "Missing maintenance metadata proves abandonment.",
        "A license family label is legal advice or complete compatibility certification.",
        "Static script review proves downloaded package code is safe."
      ]
    };
  }

  async advisoryAudit(args = {}) {
    const root = await this.#resolveRoot(args.root || ".");
    if (args.source === "npm_registry") {
      if (args.dry_run !== false) {
        return {
          operation_result: "advisory_audit_planned",
          executed: false,
          source: { type: "npm_registry", url: "https://registry.npmjs.org/-/npm/v1/security/audits", approved: true },
          command: { executable: npmExecutable(), arguments: ["audit", "--json", "--ignore-scripts", "--registry=https://registry.npmjs.org/"] },
          credential_safety: credentialSafetyContract(),
          lifecycle_scripts_executed: false
        };
      }
      if (existsSync(path.join(root.absolutePath, ".npmrc"))) {
        throw new DependencySecurityError("Live advisory audit refuses a project .npmrc so registry credentials cannot be read or transmitted.", "project_npmrc_blocked");
      }
      const isolated = await this.#createIsolatedManifestCopy(root.absolutePath, "audit");
      const result = await runNpm(isolated, ["audit", "--json", "--ignore-scripts", "--registry=https://registry.npmjs.org/"], { timeoutMs: args.timeout_ms || 120000, network: true });
      if (![0, 1].includes(result.exit_code)) {
        throw new DependencySecurityError("npm audit did not return a usable advisory report.", "advisory_command_failed", { exit_code: result.exit_code, stderr: result.stderr });
      }
      const report = parseJson(result.stdout, "npm audit output");
      return formatAdvisoryReport(report, {
        sourceType: "npm_registry",
        sourceUrl: "https://registry.npmjs.org/-/npm/v1/security/audits",
        capturedAt: new Date().toISOString(),
        executed: true,
        command: result
      });
    }
    const reportPath = await this.#resolveFile(root.absolutePath, args.report_path, MAX_LOCKFILE_BYTES);
    const source = approvedAdvisorySource(args.source_url);
    if (!source.approved) throw new DependencySecurityError("The advisory report source is not on the approved primary-source allowlist.", "advisory_source_not_approved", { host: source.host });
    const report = parseJson(await readFile(reportPath.absolutePath, "utf8"), reportPath.relativePath);
    return formatAdvisoryReport(report, {
      sourceType: "approved_report",
      sourceUrl: source.url,
      capturedAt: args.captured_at || null,
      executed: false,
      reportPath: reportPath.relativePath
    });
  }

  async compare(args = {}) {
    const baseline = await this.#inspectRoot(args.baseline_root, args);
    const candidate = await this.#inspectRoot(args.candidate_root, args);
    const left = packageVersionMap(baseline.packages);
    const right = packageVersionMap(candidate.packages);
    const added = [];
    const removed = [];
    const versionChanged = [];
    for (const [key, pkg] of right) {
      if (!left.has(key)) added.push(compactPackage(pkg));
      else if (left.get(key).version !== pkg.version) versionChanged.push(versionChange(left.get(key), pkg));
    }
    for (const [key, pkg] of left) if (!right.has(key)) removed.push(compactPackage(pkg));
    const directChanges = [...added, ...removed, ...versionChanged].filter((item) => item.direct);
    const transitiveChanges = [...added, ...removed, ...versionChanged].filter((item) => !item.direct);
    const impactedDirect = reverseImpacted(candidate, [...added, ...removed, ...versionChanged].map((item) => item.name));
    const selectedTests = selectVerificationScripts(candidate.package_scripts, true);
    return {
      operation_result: "dependency_change_analysis_complete",
      baseline_root: baseline.root,
      candidate_root: candidate.root,
      added,
      removed,
      version_changed: versionChanged,
      direct_changes: directChanges,
      transitive_changes: transitiveChanges,
      breaking_major_changes: versionChanged.filter((item) => item.breaking_major_indicator),
      impacted_direct_dependencies: impactedDirect,
      selected_tests: selectedTests,
      affected_files: [...new Set([...baseline.manifest_files, ...baseline.lockfiles, ...candidate.manifest_files, ...candidate.lockfiles])],
      limitations: ["Semantic breaking changes require upstream changelog/API review; a major-version delta is only an indicator.", "Static reverse edges cannot prove runtime-only or optional dynamic usage."]
    };
  }

  async createUpgradePlan(args = {}) {
    const root = await this.#resolveRoot(args.root || ".");
    const snapshot = await this.#inspectRoot(root.absolutePath, args);
    if (!snapshot.manifest_files.includes("package.json")) throw new DependencySecurityError("Executable dependency plans currently require package.json.", "node_manifest_required");
    const rollbackLockfile = existsSync(path.join(root.absolutePath, "package-lock.json")) ? "package-lock.json" : existsSync(path.join(root.absolutePath, "npm-shrinkwrap.json")) ? "npm-shrinkwrap.json" : null;
    if (!rollbackLockfile) throw new DependencySecurityError("Executable npm dependency transactions require an existing package-lock.json or npm-shrinkwrap.json for deterministic rollback.", "dependency_transaction_lock_required");
    if (!snapshot.lockfile_integrity.parsed) throw new DependencySecurityError("The npm lockfile must parse cleanly before an executable dependency transaction can be planned.", "dependency_transaction_lock_invalid");
    const pkg = parseJson(await readBounded(path.join(root.absolutePath, "package.json"), MAX_MANIFEST_BYTES), "package.json");
    const requests = [];
    for (const raw of args.packages || []) requests.push(await normalizeInstallRequest(raw, root.absolutePath, this.allowedRoots, pkg));
    if (!requests.length) throw new DependencySecurityError("At least one exact dependency request is required.", "dependency_request_required");
    const verifyScripts = selectRequestedVerifyScripts(pkg.scripts || {}, args.verify_scripts || ["test", "build"]);
    const commands = buildNpmInstallCommands(requests);
    const inputHashes = await hashDependencyInputs(root.absolutePath);
    const current = manifestDependencyMap(pkg);
    const changes = requests.map((request) => {
      const currentSpec = current.get(request.name)?.spec || null;
      const currentVersion = exactSemver(currentSpec);
      const targetVersion = request.source_type === "registry" ? request.target_version : null;
      return {
        name: request.name,
        dependency_type: request.dependency_type,
        current_spec: currentSpec,
        target_spec: request.target_spec,
        breaking_major_indicator: Boolean(currentVersion && targetVersion && semverParts(currentVersion).major !== semverParts(targetVersion).major),
        source_type: request.source_type
      };
    });
    const planId = `dependency-plan-${hashJson({ root: root.absolutePath, requests, verifyScripts, inputHashes }).slice(0, 16)}`;
    const plan = {
      schema_version: 1,
      plan_id: planId,
      root: root.absolutePath,
      package_manager: "npm",
      requests,
      changes,
      commands,
      verify_scripts: verifyScripts,
      input_hashes: inputHashes,
      rollback_lockfile: rollbackLockfile,
      expected_changed_files: ["package.json", rollbackLockfile],
      install_policy: {
        exact_versions_only: requests.every((item) => item.source_type !== "registry" || Boolean(exactSemver(item.target_version))),
        global_install: false,
        lifecycle_scripts: "disabled",
        audit_during_install: false,
        publishing: "blocked",
        downloaded_binary_execution: "blocked unless a verification script is separately reviewed and explicitly approved"
      },
      rollback: "Restore exact package.json/package-lock.json bytes, then run npm ci with lifecycle scripts disabled when a prior lockfile exists.",
      affected_tests: verifyScripts,
      approval_required: true
    };
    this.plans.set(planId, plan);
    return { operation_result: "dependency_upgrade_planned", executed: false, ...publicPlan(plan) };
  }

  async applyInstall(args = {}) {
    const plan = this.plans.get(args.plan_id);
    if (!plan) throw new DependencySecurityError("Dependency plan is missing or belongs to another server session.", "dependency_plan_not_found");
    const root = await this.#resolveRoot(plan.root);
    const currentHashes = await hashDependencyInputs(root.absolutePath);
    if (!equalJson(currentHashes, plan.input_hashes)) throw new DependencySecurityError("Dependency inputs changed after planning.", "dependency_plan_stale", { expected: plan.input_hashes, current: currentHashes });
    if (existsSync(path.join(root.absolutePath, ".npmrc"))) throw new DependencySecurityError("Automatic install refuses a project .npmrc so registry credentials cannot be read or transmitted.", "project_npmrc_blocked");
    const scriptReview = reviewVerificationScripts(await readPackage(root.absolutePath), plan.verify_scripts);
    const dependencyBinaryScripts = scriptReview.filter((item) => item.uses_dependency_binary);
    if (dependencyBinaryScripts.length && !args.allow_dependency_binary_execution) {
      throw new DependencySecurityError("A verification script may execute a downloaded dependency binary and needs separate explicit approval.", "dependency_binary_execution_approval_required", { scripts: dependencyBinaryScripts.map((item) => item.name) });
    }
    if (dependencyBinaryScripts.length && !String(args.binary_approval_note || "").trim()) {
      throw new DependencySecurityError("Dependency binary approval requires a non-empty reason.", "dependency_binary_approval_note_required");
    }
    if (scriptReview.some((item) => !item.allowed)) throw new DependencySecurityError("A verification script failed strict command review.", "verification_script_blocked", { scripts: scriptReview.filter((item) => !item.allowed) });
    if (args.dry_run !== false) {
      return { operation_result: "dependency_install_planned", executed: false, ...publicPlan(plan), verification_script_review: scriptReview };
    }
    const transactionId = `dependency-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
    const transactionRoot = path.join(root.absolutePath, ".vnem", "dependency-security", "transactions", transactionId);
    const beforeRoot = path.join(transactionRoot, "before");
    await mkdir(beforeRoot, { recursive: true });
    const before = await backupDependencyInputs(root.absolutePath, beforeRoot);
    const record = {
      schema_version: 1,
      transaction_id: transactionId,
      plan_id: plan.plan_id,
      root: root.absolutePath,
      status: "running",
      created_at: new Date().toISOString(),
      before,
      after: null,
      commands: [],
      lifecycle_scripts_executed: false,
      downloaded_binary_execution_approved: dependencyBinaryScripts.length ? true : false,
      verification_script_review: scriptReview,
      rollback: null
    };
    await writeTransaction(transactionRoot, record);
    try {
      for (const command of plan.commands) {
        const localOnly = command.requests.every((item) => item.source_type === "local");
        const result = await runNpm(root.absolutePath, [...command.arguments, ...(localOnly ? ["--offline"] : ["--registry=https://registry.npmjs.org/"])], { timeoutMs: args.timeout_ms || 180000, network: !localOnly });
        record.commands.push({ phase: "install", executable: npmExecutable(), arguments: command.arguments, ...compactProcessResult(result) });
        if (result.exit_code !== 0) throw new DependencySecurityError("npm install failed.", "dependency_install_failed", { exit_code: result.exit_code, stderr: result.stderr });
      }
      const verifiedSnapshot = await this.#inspectRoot(root.absolutePath, {});
      verifyInstalledRequests(await readPackage(root.absolutePath), plan.requests);
      if (!verifiedSnapshot.lockfile_integrity.parsed) throw new DependencySecurityError("The generated lockfile could not be parsed.", "lockfile_verification_failed");
      for (const script of scriptReview) {
        const result = await runNpm(root.absolutePath, ["run", script.name, "--ignore-scripts"], { timeoutMs: args.timeout_ms || 180000, network: false });
        record.commands.push({ phase: "verify", executable: npmExecutable(), arguments: ["run", script.name, "--ignore-scripts"], ...compactProcessResult(result) });
        if (result.exit_code !== 0) throw new DependencySecurityError(`Verification script ${script.name} failed.`, "dependency_verification_failed", { script: script.name, exit_code: result.exit_code, stderr: result.stderr });
      }
      record.after = await hashDependencyInputs(root.absolutePath);
      record.status = "completed";
      record.completed_at = new Date().toISOString();
      await writeTransaction(transactionRoot, record);
      return {
        operation_result: "dependency_install_completed",
        executed: true,
        transaction_id: transactionId,
        changed_files: changedInputFiles(before, record.after),
        input_hashes_before: before.hashes,
        input_hashes_after: record.after,
        lifecycle_scripts_executed: false,
        verification: record.commands.filter((item) => item.phase === "verify"),
        rollback_available: true,
        transaction_manifest: relativeTo(root.absolutePath, path.join(transactionRoot, "transaction.json")),
        credential_safety: credentialSafetyContract()
      };
    } catch (error) {
      record.status = "failed_rolling_back";
      record.failure = serializeError(error);
      await writeTransaction(transactionRoot, record);
      const rollback = await restoreDependencyInputs(root.absolutePath, beforeRoot, before, args.timeout_ms || 180000);
      record.rollback = rollback;
      record.status = rollback.completed ? "failed_rolled_back" : "failed_rollback_incomplete";
      record.completed_at = new Date().toISOString();
      await writeTransaction(transactionRoot, record);
      throw new DependencySecurityError("Dependency install or verification failed; rollback evidence is attached.", record.status, { transaction_id: transactionId, failure: record.failure, commands: record.commands, rollback });
    }
  }

  async rollback(args = {}) {
    const root = await this.#resolveRoot(args.root || ".");
    if (!/^[A-Za-z0-9._-]+$/.test(String(args.transaction_id || ""))) throw new DependencySecurityError("Invalid dependency transaction id.", "invalid_transaction_id");
    const transactionRoot = path.join(root.absolutePath, ".vnem", "dependency-security", "transactions", args.transaction_id);
    const manifestPath = path.join(transactionRoot, "transaction.json");
    const manifestFile = await this.#resolveFile(root.absolutePath, relativeTo(root.absolutePath, manifestPath), MAX_MANIFEST_BYTES);
    const record = parseJson(await readFile(manifestFile.absolutePath, "utf8"), manifestFile.relativePath);
    if (path.resolve(record.root) !== root.absolutePath) throw new DependencySecurityError("Transaction root does not match the requested project.", "transaction_root_mismatch");
    const current = await hashDependencyInputs(root.absolutePath);
    if (!record.after) {
      const alreadyRestored = Boolean(record.rollback?.completed) && equalJson(current, record.before?.hashes || {});
      throw new DependencySecurityError(alreadyRestored ? "The failed dependency transaction was already automatically rolled back." : "The dependency transaction did not complete and has no safe post-install rollback precondition.", alreadyRestored ? "dependency_transaction_already_rolled_back" : "dependency_transaction_not_rollbackable");
    }
    if (record.after && !equalJson(current, record.after)) throw new DependencySecurityError("Dependency files changed after the transaction; rollback preconditions do not match.", "dependency_rollback_stale", { expected: record.after, current });
    const preview = {
      operation_result: "dependency_rollback_planned",
      executed: false,
      transaction_id: record.transaction_id,
      targets: Object.keys(record.before?.hashes || {}),
      current_hashes: current,
      expected_current_hashes: record.after,
      lifecycle_scripts_will_execute: false
    };
    if (args.dry_run !== false) return preview;
    const result = await restoreDependencyInputs(root.absolutePath, path.join(transactionRoot, "before"), record.before, args.timeout_ms || 180000);
    record.explicit_rollback = { ...result, completed_at: new Date().toISOString() };
    record.status = result.completed ? "rolled_back" : "rollback_incomplete";
    await writeTransaction(transactionRoot, record);
    if (!result.completed) throw new DependencySecurityError("Dependency rollback was incomplete.", "dependency_rollback_incomplete", result);
    return { ...preview, operation_result: "dependency_rollback_completed", executed: true, rollback: result };
  }

  async #inspectRoot(rootValue, args = {}) {
    const root = await this.#resolveRoot(rootValue || ".");
    const result = {
      root: root.absolutePath,
      ecosystems: [],
      manifest_files: [],
      lockfiles: [],
      package_managers: [],
      packages: [],
      graph: { nodes: [], edges: [], unresolved_edges: [] },
      lifecycle_scripts: [],
      lockfile_integrity: { parsed: true, findings: [] },
      package_scripts: {},
      project_license: null,
      credential_safety: credentialSafetyContract(),
      limitations: []
    };
    const packagePath = path.join(root.absolutePath, "package.json");
    if (existsSync(packagePath)) {
      const pkg = parseJson(await readBounded(packagePath, MAX_MANIFEST_BYTES), "package.json");
      result.ecosystems.push("npm");
      result.manifest_files.push("package.json");
      result.package_managers.push("npm");
      result.package_scripts = Object.fromEntries(Object.entries(pkg.scripts || {}).map(([name, command]) => [name, redactText(command)]));
      result.project_license = normalizeLicense(pkg.license);
      for (const [name, command] of Object.entries(pkg.scripts || {})) {
        if (LIFECYCLE_NAMES.has(name)) result.lifecycle_scripts.push({ source: "project_manifest", package: pkg.name || "<root>", name, command: redactText(command) });
      }
      const npmLockPath = existsSync(path.join(root.absolutePath, "package-lock.json")) ? path.join(root.absolutePath, "package-lock.json") : existsSync(path.join(root.absolutePath, "npm-shrinkwrap.json")) ? path.join(root.absolutePath, "npm-shrinkwrap.json") : null;
      if (npmLockPath) {
        const lockName = path.basename(npmLockPath);
        result.lockfiles.push(lockName);
        try {
          const lock = parseJson(await readBounded(npmLockPath, MAX_LOCKFILE_BYTES), lockName);
          const npmData = parseNpmLock(pkg, lock);
          result.packages.push(...npmData.packages);
          result.graph = npmData.graph;
          result.lifecycle_scripts.push(...npmData.lifecycle_scripts);
          result.lockfile_integrity.findings.push(...npmData.findings);
          result.lockfile_integrity.lockfile_version = lock.lockfileVersion || null;
        } catch (error) {
          result.lockfile_integrity.parsed = false;
          result.lockfile_integrity.findings.push({ severity: "high", code: "npm_lock_parse_failed", message: redactText(error.message) });
        }
      } else {
        result.lockfile_integrity.findings.push({ severity: "medium", code: "npm_lockfile_missing" });
        for (const item of manifestDependencies(pkg)) result.packages.push({ ecosystem: "npm", ...item, version: exactSemver(item.spec), resolved: null, integrity: null, license: null, location: null });
      }
    }
    await inspectPnpm(root.absolutePath, result);
    await inspectYarn(root.absolutePath, result);
    await inspectPython(root.absolutePath, result);
    await inspectCargo(root.absolutePath, result);
    await inspectGo(root.absolutePath, result);
    result.ecosystems = [...new Set(result.ecosystems)];
    result.package_managers = [...new Set(result.package_managers)];
    result.manifest_files = [...new Set(result.manifest_files)];
    result.lockfiles = [...new Set(result.lockfiles)];
    result.packages = dedupePackages(result.packages).slice(0, args.max_packages || 10000);
    result.graph.nodes = result.graph.nodes.slice(0, args.max_packages || 10000);
    result.graph.edges = result.graph.edges.slice(0, args.max_edges || 30000);
    result.graph.unresolved_edges = result.graph.unresolved_edges.slice(0, 2000);
    result.lockfile_integrity.parsed = result.lockfile_integrity.parsed && result.lockfile_integrity.findings.every((item) => item.severity !== "high");
    if (!result.ecosystems.length) result.limitations.push("No supported package manifest was found at the project root.");
    if (result.ecosystems.some((item) => item !== "npm")) result.limitations.push("Non-npm ecosystems are inspectable; automatic install/rollback mutation is currently npm-only.");
    result.limitations.push("Lockfile metadata cannot by itself prove current maintenance, advisory, license, or runtime compatibility state.");
    return result;
  }

  async #resolveRoot(value) {
    const candidate = path.resolve(value);
    if (!existsSync(candidate)) throw new DependencySecurityError("Dependency project root does not exist.", "root_not_found", { root: candidate });
    const actual = await realpath(candidate);
    if (!this.allowedRoots.some((root) => isInside(actual, root))) throw new DependencySecurityError("Dependency project root is outside allowed roots.", "root_outside_allowed_roots");
    const info = await stat(actual);
    if (!info.isDirectory()) throw new DependencySecurityError("Dependency project root must be a directory.", "root_not_directory");
    return { absolutePath: actual };
  }

  async #resolveFile(root, relativeValue, maxBytes) {
    if (!relativeValue) throw new DependencySecurityError("A file path is required.", "file_path_required");
    const candidate = path.resolve(root, relativeValue);
    if (!isInside(candidate, root)) throw new DependencySecurityError("Dependency file escapes the project root.", "file_outside_root");
    if (!existsSync(candidate)) throw new DependencySecurityError("Dependency file was not found.", "file_not_found", { path: relativeValue });
    const actual = await realpath(candidate);
    if (!isInside(actual, root)) throw new DependencySecurityError("Dependency file resolves outside the project root.", "file_link_escape");
    const info = await stat(actual);
    if (!info.isFile() || info.size > maxBytes) throw new DependencySecurityError("Dependency file is unsupported or too large.", "file_bounds_exceeded", { size: info.size, max_bytes: maxBytes });
    return { absolutePath: actual, relativePath: relativeTo(root, actual) };
  }

  async #createIsolatedManifestCopy(root, purpose) {
    const output = path.join(this.evidenceRoot, "dependency-security", `${purpose}-${Date.now()}-${randomUUID().slice(0, 8)}`);
    await mkdir(output, { recursive: true });
    for (const name of ["package.json", "package-lock.json", "npm-shrinkwrap.json"]) {
      const source = path.join(root, name);
      if (existsSync(source)) await copyFile(source, path.join(output, name));
    }
    if (!existsSync(path.join(output, "package.json"))) throw new DependencySecurityError("package.json is required for npm advisory audit.", "node_manifest_required");
    return output;
  }
}

function parseNpmLock(pkg, lock) {
  const rootDependencies = manifestDependencyMap(pkg);
  const packages = [];
  const nodes = [{ id: "npm:root", name: normalizePackageName(pkg.name) || "<root>", version: String(pkg.version || "") || null, direct: true, root: true }];
  const edges = [];
  const unresolved = [];
  const lifecycleScripts = [];
  const findings = [];
  const entries = lock.packages && typeof lock.packages === "object" ? Object.entries(lock.packages) : [];
  if (!entries.length && Number(lock.lockfileVersion) === 1 && lock.dependencies && typeof lock.dependencies === "object") return parseNpmLockV1(pkg, lock);
  const locations = new Map(entries.filter(([location]) => location).map(([location, data]) => [normalizePath(location), data]));
  for (const [rawLocation, data] of entries) {
    if (!rawLocation) continue;
    const location = normalizePath(rawLocation);
    const name = normalizePackageName(data.name || packageNameFromLocation(location));
    if (!name) continue;
    const directMeta = location === normalizePath(path.posix.join("node_modules", name)) ? rootDependencies.get(name) : null;
    const item = {
      ecosystem: "npm",
      name,
      version: String(data.version || "") || null,
      spec: directMeta?.spec || null,
      direct: Boolean(directMeta),
      dependency_type: directMeta?.dependency_type || "transitive",
      dev: Boolean(data.dev || directMeta?.dependency_type === "devDependency"),
      optional: Boolean(data.optional || directMeta?.dependency_type === "optionalDependency"),
      integrity: typeof data.integrity === "string" ? data.integrity.slice(0, 300) : null,
      resolved: sanitizeRegistryUrl(data.resolved),
      license: normalizeLicense(data.license),
      location,
      has_install_script: Boolean(data.hasInstallScript)
    };
    packages.push(item);
    nodes.push({ id: npmNodeId(location), name, version: item.version, direct: item.direct });
    if (item.has_install_script) lifecycleScripts.push({ source: "dependency_lock", package: name, name: "install", command: null, location });
  }
  for (const [rawLocation, data] of entries) {
    if (!rawLocation) continue;
    const fromLocation = normalizePath(rawLocation);
    for (const [dependency, requested] of Object.entries(data.dependencies || {})) {
      const target = resolveNpmDependencyLocation(fromLocation, dependency, locations);
      const edge = { from: npmNodeId(fromLocation), to: target ? npmNodeId(target) : `npm:${dependency}:unresolved`, dependency, requested: String(requested) };
      edges.push(edge);
      if (!target) unresolved.push(edge);
    }
  }
  for (const [dependency, meta] of rootDependencies) {
    const target = resolveNpmDependencyLocation("", dependency, locations);
    const edge = { from: "npm:root", to: target ? npmNodeId(target) : `npm:${dependency}:unresolved`, dependency, requested: meta.spec };
    edges.push(edge);
    if (!target) unresolved.push(edge);
  }
  if (![1, 2, 3].includes(Number(lock.lockfileVersion))) findings.push({ severity: "medium", code: "unknown_npm_lockfile_version", version: lock.lockfileVersion || null });
  for (const [name] of rootDependencies) if (!packages.some((item) => item.direct && item.name === name)) findings.push({ severity: "high", code: "direct_dependency_missing_from_lock", package: name });
  return { packages, graph: { nodes, edges, unresolved_edges: unresolved }, lifecycle_scripts: lifecycleScripts, findings };
}

function parseNpmLockV1(pkg, lock) {
  const rootDependencies = manifestDependencyMap(pkg);
  const packages = [];
  const nodes = [{ id: "npm:root", name: normalizePackageName(pkg.name) || "<root>", version: String(pkg.version || "") || null, direct: true, root: true }];
  const edges = [];
  const unresolved = [];
  const lifecycleScripts = [];
  const findings = [];
  const dataByLocation = new Map();
  const visit = (dependencies, parentLocation = "") => {
    for (const [rawName, data] of Object.entries(dependencies || {})) {
      const name = normalizePackageName(rawName);
      const location = normalizePath(parentLocation ? `${parentLocation}/node_modules/${name}` : `node_modules/${name}`);
      if (dataByLocation.has(location)) continue;
      dataByLocation.set(location, data || {});
      const directMeta = parentLocation ? null : rootDependencies.get(name);
      const item = {
        ecosystem: "npm",
        name,
        version: String(data?.version || "") || null,
        spec: directMeta?.spec || null,
        direct: Boolean(directMeta),
        dependency_type: directMeta?.dependency_type || "transitive",
        dev: Boolean(data?.dev || directMeta?.dependency_type === "devDependency"),
        optional: Boolean(data?.optional || directMeta?.dependency_type === "optionalDependency"),
        integrity: typeof data?.integrity === "string" ? data.integrity.slice(0, 300) : null,
        resolved: sanitizeRegistryUrl(data?.resolved),
        license: normalizeLicense(data?.license),
        location,
        has_install_script: Boolean(data?.hasInstallScript)
      };
      packages.push(item);
      nodes.push({ id: npmNodeId(location), name, version: item.version, direct: item.direct });
      if (item.has_install_script) lifecycleScripts.push({ source: "dependency_lock", package: name, name: "install", command: null, location });
      visit(data?.dependencies, location);
    }
  };
  visit(lock.dependencies);
  const locations = new Map([...dataByLocation].map(([location, data]) => [location, data]));
  for (const [dependency, meta] of rootDependencies) {
    const target = resolveNpmDependencyLocation("", dependency, locations);
    const edge = { from: "npm:root", to: target ? npmNodeId(target) : `npm:${dependency}:unresolved`, dependency, requested: meta.spec };
    edges.push(edge);
    if (!target) unresolved.push(edge);
  }
  for (const [location, data] of dataByLocation) {
    for (const [dependency, requested] of Object.entries(data.requires || {})) {
      const target = resolveNpmDependencyLocation(location, dependency, locations);
      const edge = { from: npmNodeId(location), to: target ? npmNodeId(target) : `npm:${dependency}:unresolved`, dependency, requested: String(requested) };
      edges.push(edge);
      if (!target) unresolved.push(edge);
    }
  }
  for (const [name] of rootDependencies) if (!packages.some((item) => item.direct && item.name === name)) findings.push({ severity: "high", code: "direct_dependency_missing_from_lock", package: name });
  return { packages, graph: { nodes, edges, unresolved_edges: unresolved }, lifecycle_scripts: lifecycleScripts, findings };
}

async function inspectPnpm(root, result) {
  const file = path.join(root, "pnpm-lock.yaml");
  if (!existsSync(file)) return;
  result.ecosystems.push("npm");
  result.package_managers.push("pnpm");
  result.lockfiles.push("pnpm-lock.yaml");
  try {
    const parsed = yaml.load(await readBounded(file, MAX_LOCKFILE_BYTES), { schema: yaml.FAILSAFE_SCHEMA }) || {};
    for (const key of Object.keys(parsed.packages || {}).slice(0, 10000)) {
      const match = String(key).match(/^\/?(@?[^@/]+(?:\/[^@/]+)?)@(.+)$/);
      if (match) result.packages.push({ ecosystem: "npm", name: normalizePackageName(match[1]), version: match[2], direct: false, dependency_type: "transitive", dev: false, optional: false, integrity: null, resolved: null, license: null, location: `pnpm:${key}` });
    }
  } catch (error) {
    result.lockfile_integrity.findings.push({ severity: "high", code: "pnpm_lock_parse_failed", message: redactText(error.message) });
  }
}

async function inspectYarn(root, result) {
  const file = path.join(root, "yarn.lock");
  if (!existsSync(file)) return;
  result.ecosystems.push("npm");
  result.package_managers.push("yarn");
  result.lockfiles.push("yarn.lock");
  const text = await readBounded(file, MAX_LOCKFILE_BYTES);
  const blocks = text.split(/\r?\n(?=[^ \t#][^\r\n]*:\r?$)/);
  for (const block of blocks.slice(0, 10000)) {
    const header = block.match(/^"?(@?[^@"\s,]+(?:\/[^@"\s,]+)?)@[^:\r\n]+"?:/);
    const version = block.match(/^\s+version\s+"?([^"\s]+)"?/m);
    if (header && version) result.packages.push({ ecosystem: "npm", name: normalizePackageName(header[1]), version: version[1], direct: false, dependency_type: "transitive", dev: false, optional: false, integrity: null, resolved: sanitizeRegistryUrl(block.match(/^\s+resolved\s+"?([^"\s]+)"?/m)?.[1]), license: null, location: `yarn:${header[1]}@${version[1]}` });
  }
}

async function inspectPython(root, result) {
  const pyproject = path.join(root, "pyproject.toml");
  const requirements = path.join(root, "requirements.txt");
  if (!existsSync(pyproject) && !existsSync(requirements)) return;
  result.ecosystems.push("python");
  if (existsSync(pyproject)) {
    result.manifest_files.push("pyproject.toml");
    try {
      const parsed = TOML.parse(await readBounded(pyproject, MAX_MANIFEST_BYTES));
      const deps = parsed.project?.dependencies || [];
      for (const raw of Array.isArray(deps) ? deps : []) {
        const match = String(raw).match(/^([A-Za-z0-9_.-]+)\s*(.*)$/);
        if (match) result.packages.push({ ecosystem: "pypi", name: normalizePackageName(match[1]), version: exactSemver(match[2]), spec: match[2] || null, direct: true, dependency_type: "dependency", dev: false, optional: false, integrity: null, resolved: null, license: null, location: "pyproject.toml" });
      }
    } catch (error) {
      result.lockfile_integrity.findings.push({ severity: "high", code: "pyproject_parse_failed", message: redactText(error.message) });
    }
  }
  if (existsSync(requirements)) {
    result.manifest_files.push("requirements.txt");
    for (const line of (await readBounded(requirements, MAX_MANIFEST_BYTES)).split(/\r?\n/)) {
      const value = line.trim();
      if (!value || value.startsWith("#") || value.startsWith("-") || value.includes("://")) continue;
      const match = value.match(/^([A-Za-z0-9_.-]+)(?:==([^;\s]+))?/);
      if (match) result.packages.push({ ecosystem: "pypi", name: normalizePackageName(match[1]), version: match[2] || null, spec: value.slice(match[1].length) || null, direct: true, dependency_type: "dependency", dev: false, optional: false, integrity: null, resolved: null, license: null, location: "requirements.txt" });
    }
  }
  for (const lock of ["uv.lock", "poetry.lock", "Pipfile.lock"]) if (existsSync(path.join(root, lock))) result.lockfiles.push(lock);
}

async function inspectCargo(root, result) {
  const manifest = path.join(root, "Cargo.toml");
  const lockfile = path.join(root, "Cargo.lock");
  if (!existsSync(manifest) && !existsSync(lockfile)) return;
  result.ecosystems.push("cargo");
  result.package_managers.push("cargo");
  if (existsSync(manifest)) result.manifest_files.push("Cargo.toml");
  if (existsSync(lockfile)) {
    result.lockfiles.push("Cargo.lock");
    try {
      const parsed = TOML.parse(await readBounded(lockfile, MAX_LOCKFILE_BYTES));
      for (const pkg of Array.isArray(parsed.package) ? parsed.package : []) result.packages.push({ ecosystem: "cargo", name: normalizePackageName(pkg.name), version: String(pkg.version || "") || null, direct: false, dependency_type: "transitive", dev: false, optional: false, integrity: pkg.checksum || null, resolved: sanitizeRegistryUrl(pkg.source), license: null, location: `cargo:${pkg.name}@${pkg.version}` });
    } catch (error) {
      result.lockfile_integrity.findings.push({ severity: "high", code: "cargo_lock_parse_failed", message: redactText(error.message) });
    }
  }
}

async function inspectGo(root, result) {
  const manifest = path.join(root, "go.mod");
  const lockfile = path.join(root, "go.sum");
  if (!existsSync(manifest) && !existsSync(lockfile)) return;
  result.ecosystems.push("go");
  result.package_managers.push("go");
  if (existsSync(manifest)) {
    result.manifest_files.push("go.mod");
    const text = await readBounded(manifest, MAX_MANIFEST_BYTES);
    for (const match of text.matchAll(/^\s*([A-Za-z0-9._~/-]+)\s+(v[^\s]+)(?:\s+\/\/\s+indirect)?\s*$/gm)) result.packages.push({ ecosystem: "golang", name: match[1], version: match[2], direct: !match[0].includes("indirect"), dependency_type: match[0].includes("indirect") ? "transitive" : "dependency", dev: false, optional: false, integrity: null, resolved: null, license: null, location: "go.mod" });
  }
  if (existsSync(lockfile)) result.lockfiles.push("go.sum");
}

function buildSbom(snapshot) {
  const components = snapshot.packages.map((pkg) => ({
    bom_ref: `${pkg.ecosystem}:${pkg.name}@${pkg.version || "unknown"}:${hashJson([pkg.location, pkg.spec]).slice(0, 10)}`,
    type: "library",
    ecosystem: pkg.ecosystem,
    name: pkg.name,
    version: pkg.version,
    purl: pkg.version ? `pkg:${pkg.ecosystem}/${encodeURIComponent(pkg.name)}@${encodeURIComponent(pkg.version)}` : null,
    direct: Boolean(pkg.direct),
    dependency_type: pkg.dependency_type,
    license: pkg.license,
    integrity: pkg.integrity
  }));
  return { format: "VNEM SBOM-style inventory", spec_version: "1", component_count: components.length, components, not_claimed: ["CycloneDX/SPDX conformance", "vulnerability completeness", "license legal advice"] };
}

function formatAdvisoryReport(report, meta) {
  const vulnerabilities = [];
  for (const [name, item] of Object.entries(report.vulnerabilities || {})) {
    vulnerabilities.push({
      package: normalizePackageName(name),
      severity: normalizeSeverity(item.severity),
      direct: Boolean(item.isDirect),
      range: redactText(item.range || ""),
      nodes: Array.isArray(item.nodes) ? item.nodes.map((node) => normalizePath(node)).slice(0, 100) : [],
      via: (Array.isArray(item.via) ? item.via : []).map((via) => typeof via === "string" ? { dependency: normalizePackageName(via) } : { source: String(via.source || ""), name: normalizePackageName(via.name || name), title: redactText(via.title || ""), url: sanitizeAdvisoryUrl(via.url), severity: normalizeSeverity(via.severity), range: redactText(via.range || "") }).slice(0, 100)
    });
  }
  const capturedMs = meta.capturedAt ? Date.parse(meta.capturedAt) : NaN;
  const futureTimestamp = Number.isFinite(capturedMs) && capturedMs - Date.now() > 300000;
  const ageHours = Number.isFinite(capturedMs) && !futureTimestamp ? Math.max(0, Math.round((Date.now() - capturedMs) / 360000) / 10) : null;
  return {
    operation_result: vulnerabilities.length ? "advisories_found" : "no_advisories_reported",
    executed: meta.executed,
    source: { type: meta.sourceType, url: meta.sourceUrl, approved: approvedAdvisorySource(meta.sourceUrl).approved, report_path: meta.reportPath || null, provenance: meta.executed ? "live_fetch_by_vnem" : "caller_supplied_report_and_source_attribution" },
    captured_at: meta.capturedAt,
    freshness: { age_hours: ageHours, current_within_24h: ageHours !== null ? ageHours <= 24 : false, independently_verified: Boolean(meta.executed), future_timestamp_rejected: futureTimestamp, captured_at_required_for_current_claim: true },
    vulnerabilities,
    severity_counts: countSeverities(vulnerabilities),
    npm_metadata: report.metadata ? { vulnerabilities: report.metadata.vulnerabilities || {}, dependencies: report.metadata.dependencies || {} } : null,
    command: meta.command ? compactProcessResult(meta.command) : null,
    credential_safety: credentialSafetyContract(),
    lifecycle_scripts_executed: false,
    must_not_claim: ["An empty or stale report proves the dependency set is vulnerability-free.", "One advisory source covers every ecosystem or private package.", meta.executed ? null : "Caller-supplied source attribution proves the report bytes were fetched from that source."].filter(Boolean)
  };
}

async function normalizeInstallRequest(raw, root, allowedRoots, pkg) {
  const name = normalizePackageName(raw.name);
  if (!/^(@[a-z0-9._-]+\/)?[a-z0-9._-]+$/.test(name)) throw new DependencySecurityError("Invalid package name.", "invalid_package_name", { name: raw.name });
  const dependencyType = ["dependency", "devDependency", "optionalDependency"].includes(raw.dependency_type) ? raw.dependency_type : "dependency";
  if (raw.source_type === "local") {
    const candidate = path.resolve(root, raw.source_path || "");
    if (!allowedRoots.some((allowed) => isInside(candidate, allowed)) || !existsSync(candidate)) throw new DependencySecurityError("Local dependency source must exist inside an allowed root.", "local_dependency_outside_allowed_roots");
    const actual = await realpath(candidate);
    if (!allowedRoots.some((allowed) => isInside(actual, allowed))) throw new DependencySecurityError("Local dependency source resolves outside allowed roots.", "local_dependency_link_escape");
    if (!(await stat(actual)).isDirectory()) throw new DependencySecurityError("Local dependency source must be a directory.", "local_dependency_not_directory");
    const localPkg = await readPackage(actual);
    if (normalizePackageName(localPkg.name) !== name) throw new DependencySecurityError("Local dependency package name does not match the request.", "local_dependency_name_mismatch", { expected: name, actual: localPkg.name });
    const relative = normalizePath(path.relative(root, actual));
    return { name, dependency_type: dependencyType, source_type: "local", source_path: actual, target_version: String(localPkg.version || "") || null, target_spec: `file:${relative}` };
  }
  const targetVersion = String(raw.target_version || "").trim();
  if (!exactSemver(targetVersion)) throw new DependencySecurityError("Registry dependency updates require an exact semantic version, not a tag or range.", "exact_version_required", { package: name, target_version: targetVersion });
  if (pkg.name === name) throw new DependencySecurityError("A project cannot install itself as a dependency through this tool.", "self_dependency_blocked");
  return { name, dependency_type: dependencyType, source_type: "registry", source_path: null, target_version: targetVersion, target_spec: targetVersion };
}

function buildNpmInstallCommands(requests) {
  const groups = new Map();
  for (const request of requests) {
    if (!groups.has(request.dependency_type)) groups.set(request.dependency_type, []);
    groups.get(request.dependency_type).push(request);
  }
  return [...groups.entries()].map(([type, items]) => ({
    requests: items,
    executable: npmExecutable(),
    arguments: ["install", ...items.map((item) => item.source_type === "local" ? item.target_spec : `${item.name}@${item.target_version}`), "--save-exact", "--ignore-scripts", "--no-audit", "--no-fund", ...(type === "devDependency" ? ["--save-dev"] : type === "optionalDependency" ? ["--save-optional"] : ["--save-prod"])]
  }));
}

function reviewVerificationScripts(pkg, names) {
  const scripts = pkg.scripts || {};
  return names.map((name) => {
    const queue = [name];
    const seen = new Set();
    const chain = [];
    while (queue.length) {
      const current = queue.shift();
      if (seen.has(current)) continue;
      seen.add(current);
      const command = String(scripts[current] || "");
      const indicators = suspiciousScriptCodes(command);
      const hasLifecycleHook = [`pre${current}`, `post${current}`].some((hook) => Object.hasOwn(scripts, hook));
      const first = command.trim().match(/^(?:cross-env\s+[^\s]+\s+)*([^\s]+)/i)?.[1]?.toLowerCase() || "";
      const nestedScripts = [...command.matchAll(/\bnpm(?:\.cmd)?\s+(?:run|run-script)\s+([A-Za-z0-9:_-]+)/gi)].map((match) => match[1]);
      if (["npm", "npm.cmd"].includes(first) && !nestedScripts.length) indicators.push("unreviewed_npm_subcommand");
      for (const nested of nestedScripts) {
        if (!Object.hasOwn(scripts, nested)) indicators.push("nested_script_missing");
        else if (seen.has(nested) || nested === current) indicators.push("nested_script_cycle");
        else queue.push(nested);
      }
      const usesDependencyBinary = first && !["node", "node.exe", "npm", "npm.cmd"].includes(first) && !first.startsWith("./") && !first.startsWith(".\\");
      chain.push({ name: current, command: redactText(command), indicators: [...new Set(indicators)], has_lifecycle_hook: hasLifecycleHook, uses_dependency_binary: Boolean(usesDependencyBinary), nested_scripts: nestedScripts });
    }
    const indicators = [...new Set(chain.flatMap((item) => item.indicators))];
    const hasLifecycleHook = chain.some((item) => item.has_lifecycle_hook);
    const usesDependencyBinary = chain.some((item) => item.uses_dependency_binary);
    return { name, command: chain[0]?.command || "", indicators, has_lifecycle_hook: hasLifecycleHook, uses_dependency_binary: usesDependencyBinary, nested_scripts: chain.slice(1).map((item) => item.name), script_chain: chain, allowed: Boolean(chain[0]?.command) && !indicators.length && !hasLifecycleHook };
  });
}

function selectRequestedVerifyScripts(scripts, requested) {
  const names = [...new Set(requested.map(String))];
  for (const name of names) if (!SAFE_VERIFY_SCRIPT_NAMES.has(name)) throw new DependencySecurityError("Only test/build/validate/lint/typecheck/check verification scripts are accepted.", "verification_script_name_blocked", { script: name });
  return names.filter((name) => Object.hasOwn(scripts, name));
}

function selectVerificationScripts(scripts, includeBuild) {
  return ["test", "validate", ...(includeBuild ? ["build"] : []), "typecheck", "lint"].filter((name) => Object.hasOwn(scripts || {}, name));
}

async function backupDependencyInputs(root, beforeRoot) {
  const files = {};
  const hashes = {};
  for (const name of ["package.json", "package-lock.json", "npm-shrinkwrap.json"]) {
    const source = path.join(root, name);
    const exists = existsSync(source);
    files[name] = { existed: exists };
    hashes[name] = exists ? await sha256File(source) : null;
    if (exists) await copyFile(source, path.join(beforeRoot, name));
  }
  return { files, hashes };
}

async function restoreDependencyInputs(root, beforeRoot, before, timeoutMs) {
  const restored = [];
  const removed = [];
  const errors = [];
  for (const [name, meta] of Object.entries(before.files || {})) {
    const target = path.join(root, name);
    try {
      if (meta.existed) {
        await copyFile(path.join(beforeRoot, name), target);
        restored.push(name);
      } else if (existsSync(target)) {
        await rm(target, { force: true });
        removed.push(name);
      }
    } catch (error) {
      errors.push({ file: name, message: redactText(error.message) });
    }
  }
  let npmCi = null;
  if (!errors.length && (before.files?.["package-lock.json"]?.existed || before.files?.["npm-shrinkwrap.json"]?.existed)) {
    npmCi = await runNpm(root, ["ci", "--ignore-scripts", "--no-audit", "--no-fund", "--offline"], { timeoutMs, network: false });
    if (npmCi.exit_code !== 0) errors.push({ phase: "npm_ci_restore", exit_code: npmCi.exit_code, stderr: npmCi.stderr });
  }
  const hashes = await hashDependencyInputs(root);
  const hashesMatch = equalJson(hashes, before.hashes);
  if (!hashesMatch) errors.push({ phase: "hash_verification", expected: before.hashes, current: hashes });
  return { completed: !errors.length && hashesMatch, restored, removed, npm_ci: npmCi ? compactProcessResult(npmCi) : null, hashes_match: hashesMatch, errors };
}

async function hashDependencyInputs(root) {
  const output = {};
  for (const name of ["package.json", "package-lock.json", "npm-shrinkwrap.json"]) output[name] = existsSync(path.join(root, name)) ? await sha256File(path.join(root, name)) : null;
  return output;
}

async function runNpm(cwd, args, options = {}) {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) if (SAFE_NPM_ENV_NAMES.has(key.toUpperCase())) env[key] = value;
  const configRoot = await mkdtemp(path.join(tmpdir(), "vnem-dependency-npm-"));
  const userConfig = path.join(configRoot, "user.npmrc");
  const globalConfig = path.join(configRoot, "global.npmrc");
  await writeFile(userConfig, "# VNEM credential-free ephemeral npm config\n", { encoding: "utf8", flag: "wx" });
  await writeFile(globalConfig, "# VNEM credential-free ephemeral npm global config\n", { encoding: "utf8", flag: "wx" });
  Object.assign(env, {
    NPM_CONFIG_IGNORE_SCRIPTS: "true",
    NPM_CONFIG_AUDIT: "false",
    NPM_CONFIG_FUND: "false",
    NPM_CONFIG_UPDATE_NOTIFIER: "false",
    NPM_CONFIG_PROGRESS: "false",
    NPM_CONFIG_COLOR: "false",
    NPM_CONFIG_USERCONFIG: userConfig,
    NPM_CONFIG_GLOBALCONFIG: globalConfig
  });
  if (!options.network) env.NPM_CONFIG_OFFLINE = "true";
  try {
    return await new Promise((resolve) => {
      const command = npmSpawnCommand(args);
      const child = spawn(command.executable, command.arguments, { cwd, env, shell: false, windowsHide: true, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      let settled = false;
      let terminationPromise = null;
      const append = (current, chunk) => `${current}${chunk}`.slice(-MAX_PROCESS_OUTPUT_BYTES);
      const finish = async (code, signal, error = null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        const termination = terminationPromise ? await terminationPromise : null;
        resolve({
          exit_code: code,
          signal,
          timed_out: timedOut,
          stdout: redactText(stdout),
          stderr: redactText(error ? `${stderr}\n${error.message}` : stderr),
          network_requested: Boolean(options.network),
          process_tree_termination: termination,
          environment_safety: { policy: "allowlisted_names_only", inherited_proxy_environment: false, inherited_secret_environment: false, npm_configs: "unique_ephemeral_os_temp_files" }
        });
      };
      child.stdout.on("data", (chunk) => { stdout = append(stdout, chunk.toString("utf8")); });
      child.stderr.on("data", (chunk) => { stderr = append(stderr, chunk.toString("utf8")); });
      const timer = setTimeout(() => {
        timedOut = true;
        terminationPromise = terminateNpmProcessTree(child);
      }, options.timeoutMs || 120000);
      child.on("error", (error) => { void finish(null, null, error); });
      child.on("close", (code, signal) => { void finish(code, signal); });
    });
  } finally {
    await rm(configRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }).catch(() => {});
  }
}

async function terminateNpmProcessTree(child) {
  if (!child?.pid) return { attempted: false, reason: "missing_pid" };
  if (process.platform === "win32") {
    const systemRoot = process.env.SystemRoot || process.env.WINDIR || "C:\\Windows";
    const taskkill = path.join(systemRoot, "System32", "taskkill.exe");
    const result = await new Promise((resolve) => {
      const killer = spawn(taskkill, ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, shell: false, stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      let done = false;
      const finish = (value) => { if (!done) { done = true; clearTimeout(timer); resolve(value); } };
      killer.stdout.on("data", (chunk) => { stdout = `${stdout}${chunk}`.slice(-4000); });
      killer.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-4000); });
      killer.on("error", (error) => finish({ ok: false, exit_code: null, error: redactText(error.message), stdout: redactText(stdout), stderr: redactText(stderr) }));
      killer.on("close", (code) => finish({ ok: code === 0, exit_code: code, error: null, stdout: redactText(stdout), stderr: redactText(stderr) }));
      const timer = setTimeout(() => { try { killer.kill("SIGKILL"); } catch {} finish({ ok: false, exit_code: null, error: "taskkill_timeout", stdout: redactText(stdout), stderr: redactText(stderr) }); }, 5000);
    });
    if (!result.ok) try { child.kill("SIGKILL"); } catch {}
    return { attempted: true, strategy: result.ok ? "taskkill_process_tree" : "taskkill_then_direct_kill", ...result };
  }
  try { process.kill(-child.pid, "SIGTERM"); } catch { try { child.kill("SIGTERM"); } catch {} }
  await new Promise((resolve) => setTimeout(resolve, 500));
  try { process.kill(-child.pid, "SIGKILL"); } catch { try { child.kill("SIGKILL"); } catch {} }
  return { attempted: true, strategy: "posix_process_group_sigterm_sigkill", ok: true };
}

function verifyInstalledRequests(pkg, requests) {
  const current = manifestDependencyMap(pkg);
  for (const request of requests) {
    const actual = current.get(request.name);
    if (!actual || actual.spec !== request.target_spec || actual.dependency_type !== request.dependency_type) throw new DependencySecurityError("Installed manifest does not match the reviewed request.", "installed_manifest_mismatch", { package: request.name, expected: request.target_spec, actual: actual?.spec || null });
  }
}

function manifestDependencies(pkg) {
  const result = [];
  for (const [section, type] of [["dependencies", "dependency"], ["devDependencies", "devDependency"], ["optionalDependencies", "optionalDependency"], ["peerDependencies", "peerDependency"]]) {
    for (const [name, spec] of Object.entries(pkg[section] || {})) result.push({ name: normalizePackageName(name), spec: String(spec), direct: true, dependency_type: type, dev: type === "devDependency", optional: type === "optionalDependency" });
  }
  return result;
}

function manifestDependencyMap(pkg) {
  return new Map(manifestDependencies(pkg).map((item) => [item.name, item]));
}

function packageVersionMap(packages) {
  return new Map(packages.map((pkg) => [`${pkg.ecosystem}:${pkg.name}:${pkg.location || pkg.dependency_type}`, pkg]));
}

function reverseImpacted(snapshot, changedNames) {
  const changed = new Set(changedNames.map(normalizePackageName));
  const directNames = new Set(snapshot.packages.filter((item) => item.direct).map((item) => item.name));
  const impacted = new Set([...changed].filter((name) => directNames.has(name)));
  for (const edge of snapshot.graph.edges) {
    if (!changed.has(normalizePackageName(edge.dependency))) continue;
    const source = snapshot.graph.nodes.find((node) => node.id === edge.from);
    if (source?.direct) impacted.add(source.name);
  }
  return [...impacted].sort();
}

function versionChange(left, right) {
  const from = semverParts(left.version);
  const to = semverParts(right.version);
  return { name: right.name, ecosystem: right.ecosystem, from: left.version, to: right.version, direct: Boolean(right.direct || left.direct), dependency_type: right.dependency_type, breaking_major_indicator: Boolean(from && to && from.major !== to.major) };
}

function compactPackage(pkg) {
  return { ecosystem: pkg.ecosystem, name: pkg.name, version: pkg.version, direct: Boolean(pkg.direct), dependency_type: pkg.dependency_type };
}

function dedupePackages(packages) {
  const seen = new Set();
  return packages.filter((pkg) => {
    const key = `${pkg.ecosystem}:${pkg.name}:${pkg.version || pkg.spec || ""}:${pkg.location || pkg.dependency_type}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function packageSourceFindings(pkg) {
  if (!pkg.resolved) return pkg.ecosystem === "npm" && pkg.location?.startsWith("node_modules/") ? [{ severity: "medium", package: pkg.name, code: "resolved_source_missing" }] : [];
  if (/^http:\/\//i.test(pkg.resolved)) return [{ severity: "high", package: pkg.name, code: "insecure_http_package_source", source: pkg.resolved }];
  if (/^(?:git\+|git:|file:|link:)/i.test(pkg.resolved)) return [{ severity: "medium", package: pkg.name, code: "non_registry_package_source", source: pkg.resolved }];
  if (!pkg.integrity && pkg.ecosystem === "npm") return [{ severity: "medium", package: pkg.name, code: "package_integrity_missing", source: pkg.resolved }];
  return [];
}

function licenseFinding(pkg, projectLicense) {
  const license = normalizeLicense(pkg.license);
  const family = licenseFamily(license);
  const review = family === "unknown" || family === "strong_copyleft" || (family === "weak_copyleft" && projectLicense && licenseFamily(projectLicense) === "permissive");
  return { severity: review ? "medium" : "info", package: pkg.name, version: pkg.version, license, family, project_license: projectLicense || null, compatibility: review ? "review_required" : "no_static_conflict_indicator", legal_advice: false };
}

function licenseFamily(value) {
  const text = String(value || "").toUpperCase();
  if (!text) return "unknown";
  if (/AGPL|GPL-(?:2|3)|GPLV/.test(text)) return "strong_copyleft";
  if (/LGPL|MPL|EPL|CDDL/.test(text)) return "weak_copyleft";
  if (/MIT|APACHE|BSD|ISC|0BSD|CC0|UNLICENSE/.test(text)) return "permissive";
  return "unknown";
}

function approvedAdvisorySource(value) {
  try {
    const url = new URL(String(value || ""));
    const host = url.hostname.toLowerCase();
    const approvedHost = APPROVED_ADVISORY_HOSTS.has(host);
    const approvedPath = host === "registry.npmjs.org"
      ? /^\/-\/npm\/v1\/security\/audits(?:\/|$)/.test(url.pathname)
      : host === "github.com"
        ? /^\/advisories\/GHSA-[A-Za-z0-9-]+\/?$/.test(url.pathname)
        : host === "api.github.com"
          ? /^\/advisories(?:\/|$)/.test(url.pathname)
          : true;
    const approved = url.protocol === "https:" && approvedHost && approvedPath;
    return { approved, host, url: approved ? `${url.origin}${url.pathname}` : null };
  } catch {
    return { approved: false, host: null, url: null };
  }
}

function sanitizeAdvisoryUrl(value) {
  const source = approvedAdvisorySource(value);
  return source.approved ? source.url : null;
}

function sanitizeRegistryUrl(value) {
  if (!value) return null;
  const text = String(value);
  if (/^(?:file:|link:|git\+|git:)/i.test(text)) return redactText(text).slice(0, 500);
  try {
    const url = new URL(text);
    return `${url.protocol}//${url.hostname}${url.port ? `:${url.port}` : ""}${url.pathname}`.slice(0, 1000);
  } catch {
    return redactText(text).slice(0, 500);
  }
}

function credentialSafetyContract() {
  return { registry_credentials_read: false, registry_credentials_returned: false, secret_environment_forwarded: false, user_npmrc_disabled: true, global_npmrc_disabled: true, project_npmrc_blocks_live_commands: true, npm_config_location: "unique_ephemeral_os_temp_files", environment_forwarding: "allowlisted_names_only_without_proxy_or_secret_values", output_redacted: true };
}

function publicPlan(plan) {
  return { plan_id: plan.plan_id, root: plan.root, package_manager: plan.package_manager, changes: plan.changes, commands: plan.commands.map((item) => ({ executable: item.executable, arguments: item.arguments })), verify_scripts: plan.verify_scripts, input_hashes: plan.input_hashes, rollback_lockfile: plan.rollback_lockfile, expected_changed_files: plan.expected_changed_files, install_policy: plan.install_policy, rollback: plan.rollback, affected_tests: plan.affected_tests, approval_required: plan.approval_required };
}

function suspiciousScriptCodes(value) {
  return SUSPICIOUS_SCRIPT_PATTERNS.filter(([, pattern]) => pattern.test(String(value || ""))).map(([code]) => code);
}

function countSeverities(items) {
  const result = { total: items.length, critical: 0, high: 0, moderate: 0, medium: 0, low: 0, info: 0, unknown: 0 };
  for (const item of items) {
    const severity = normalizeSeverity(item.severity);
    if (Object.hasOwn(result, severity)) result[severity] += 1;
    else result.unknown += 1;
  }
  return result;
}

function normalizeSeverity(value) {
  const text = String(value || "unknown").toLowerCase();
  return ["critical", "high", "moderate", "medium", "low", "info"].includes(text) ? text : "unknown";
}

function normalizePackageName(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeLicense(value) {
  if (typeof value === "string") return value.trim().slice(0, 200) || null;
  if (value && typeof value === "object" && typeof value.type === "string") return value.type.trim().slice(0, 200) || null;
  return null;
}

function packageNameFromLocation(location) {
  const parts = normalizePath(location).split("node_modules/").filter(Boolean);
  return parts.at(-1) || null;
}

function resolveNpmDependencyLocation(from, dependency, locations) {
  let cursor = normalizePath(from);
  while (true) {
    const candidate = normalizePath(path.posix.join(cursor, "node_modules", dependency));
    if (locations.has(candidate)) return candidate;
    const marker = cursor.lastIndexOf("/node_modules/");
    if (marker < 0) break;
    cursor = cursor.slice(0, marker);
  }
  const top = normalizePath(path.posix.join("node_modules", dependency));
  return locations.has(top) ? top : null;
}

function npmNodeId(location) {
  return `npm:${normalizePath(location)}`;
}

function semverParts(value) {
  const match = String(value || "").match(/^(?:v)?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  return match ? { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) } : null;
}

function exactSemver(value) {
  const text = String(value || "").trim();
  return semverParts(text) ? text.replace(/^v/, "") : null;
}

function editDistance(left, right) {
  const a = String(left);
  const b = String(right);
  const rows = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) rows[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) rows[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) for (let j = 1; j <= b.length; j += 1) rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return rows[a.length][b.length];
}

async function readPackage(root) {
  return parseJson(await readBounded(path.join(root, "package.json"), MAX_MANIFEST_BYTES), "package.json");
}

async function readBounded(file, maxBytes) {
  const info = await stat(file);
  if (!info.isFile() || info.size > maxBytes) throw new DependencySecurityError("Dependency input is unsupported or too large.", "dependency_input_bounds_exceeded", { file: path.basename(file), size: info.size, max_bytes: maxBytes });
  return await readFile(file, "utf8");
}

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new DependencySecurityError(`Invalid JSON in ${label}.`, "dependency_json_invalid", { file: label, message: redactText(error.message) });
  }
}

function redactText(value) {
  let text = String(value ?? "");
  for (const pattern of SECRET_TEXT_PATTERNS) text = text.replace(pattern, "[REDACTED]");
  return text.slice(0, MAX_PROCESS_OUTPUT_BYTES);
}

function compactProcessResult(result) {
  return { exit_code: result.exit_code, signal: result.signal, timed_out: result.timed_out, stdout: redactText(result.stdout), stderr: redactText(result.stderr), network_requested: Boolean(result.network_requested), process_tree_termination: redactObject(result.process_tree_termination), environment_safety: redactObject(result.environment_safety) };
}

function serializeError(error) {
  return { name: error.name || "Error", code: error.code || "error", message: redactText(error.message), details: redactObject(error.details || {}) };
}

function redactObject(value) {
  return redactValue(value, 0, new WeakSet());
}

function redactValue(value, depth, seen) {
  if (value === null || value === undefined || typeof value === "boolean" || typeof value === "number") return value ?? null;
  if (typeof value === "string") return redactText(value);
  if (depth >= 8) return "[TRUNCATED_DEPTH]";
  if (typeof value !== "object") return redactText(String(value));
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);
  if (Array.isArray(value)) return value.slice(0, 200).map((item) => redactValue(item, depth + 1, seen));
  const output = {};
  for (const [key, item] of Object.entries(value).slice(0, 200)) {
    const secretNamed = SECRET_ENV_PATTERN.test(key);
    output[key] = secretNamed && item !== false && item !== null && item !== undefined ? "[REDACTED]" : redactValue(item, depth + 1, seen);
  }
  return output;
}

function npmExecutable() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function npmSpawnCommand(args) {
  const execDir = path.dirname(process.execPath);
  const candidates = [
    path.join(execDir, "node_modules", "npm", "bin", "npm-cli.js"),
    path.resolve(execDir, "..", "lib", "node_modules", "npm", "bin", "npm-cli.js"),
    path.resolve(execDir, "..", "node_modules", "npm", "bin", "npm-cli.js"),
    path.resolve(execDir, "..", "..", "lib", "node_modules", "npm", "bin", "npm-cli.js")
  ];
  const discovered = [...new Set(candidates)].find((candidate) => existsSync(candidate));
  if (!discovered) {
    throw new DependencySecurityError("A trusted npm CLI was not found next to the active Node runtime.", "trusted_npm_cli_not_found", { node: process.execPath });
  }
  return { executable: process.execPath, arguments: [discovered, ...args] };
}

function normalizePath(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function relativeTo(root, value) {
  return normalizePath(path.relative(root, value));
}

function isInside(candidate, root) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function hashJson(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function sha256File(file) {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

function equalJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function changedInputFiles(before, after) {
  return Object.keys(after).filter((name) => before.hashes?.[name] !== after[name]);
}

async function writeTransaction(transactionRoot, record) {
  await mkdir(transactionRoot, { recursive: true });
  await writeFile(path.join(transactionRoot, "transaction.json"), `${JSON.stringify(record, null, 2)}\n`, "utf8");
}
