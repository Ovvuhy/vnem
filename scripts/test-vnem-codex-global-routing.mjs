import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import TOML from "@iarna/toml";
import { buildVnemServerConfigs, mergeCodexToml } from "./vnem/clients/config-merge.mjs";
import { applyClientSetup, planClientSetup, rollbackClientSetup } from "./vnem/clients/setup.mjs";
import { GlobalProjectRouter, ProjectRouterError } from "./vnem/projects/router.mjs";
import { callTimed, connectMcp } from "./vnem/giga/mcp-client.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const tempParent = path.join(os.tmpdir(), "vnem-tests");
await mkdir(tempParent, { recursive: true });
const temp = await mkdtemp(path.join(tempParent, "codex-global-routing-"));
const home = path.join(temp, "home");
const codexHome = path.join(home, ".codex");
const codexConfig = path.join(codexHome, "config.toml");
const globalAgents = path.join(codexHome, "AGENTS.md");
const stateRoot = path.join(codexHome, "vnem");
const stateDir = path.join(stateRoot, "setup");
const projectsRoot = path.join(temp, "projects");
const projectA = path.join(projectsRoot, "AlphaProject");
const projectB = path.join(projectsRoot, "BetaProject");
const projectC = path.join(projectsRoot, "GammaProject");
const projectD = path.join(projectsRoot, "DeltaProject");

try {
  for (const [root, marker] of [[projectA, "alpha"], [projectB, "beta"], [projectC, "gamma"], [projectD, "delta"]]) {
    await mkdir(path.join(root, "src"), { recursive: true });
    await writeFile(path.join(root, "hello.txt"), `${marker}\n`, "utf8");
    await writeFile(path.join(root, "src", `${marker}.js`), `export const ${marker}Value = ${JSON.stringify(marker)};\n`, "utf8");
    await writeFile(path.join(root, "rows.json"), `${JSON.stringify([{ id: 1, label: marker }], null, 2)}\n`, "utf8");
    await writeFile(path.join(root, ".env"), `TOKEN=${marker}-fixture-secret\n`, "utf8");
    await writeFile(path.join(root, "package.json"), `${JSON.stringify({ name: `${marker}-fixture`, private: true, scripts: { test: "node --test" } }, null, 2)}\n`, "utf8");
  }
  await mkdir(codexHome, { recursive: true });
  const unrelated = [
    'model = "gpt-5"',
    'plugins = ["fixture-plugin"]',
    '',
    '[desktop]',
    'theme = "dark"',
    '',
    '[mcp_servers.node_repl]',
    'command = "node"',
    'args = ["fixture-node-repl.mjs"]',
    '',
    projectTable(projectA),
    'trust_level = "trusted"',
    '',
    projectTable(swapWindowsCaseAndSeparators(projectA)),
    'trust_level = "trusted"',
    '',
    projectTable(projectB),
    'trust_level = "trusted"',
    ''
  ].join("\n");
  const staticServers = buildVnemServerConfigs({ root: repoRoot, workspace: repoRoot, components: ["core", "tools"] });
  const originalConfig = mergeCodexToml(unrelated, staticServers).text;
  await writeFile(codexConfig, originalConfig, "utf8");

  const setupOptions = {
    root: repoRoot,
    workspace: repoRoot,
    home,
    stateDir,
    clients: ["codex_app", "codex_cli"],
    components: ["core", "tools"],
    safetyProfile: "creator-power",
    scope: "global",
    configOverrides: { codex_app: codexConfig, codex_cli: codexConfig }
  };

  const preview = await planClientSetup(setupOptions);
  assert.equal(preview.scope, "global");
  assert.equal(preview.dynamic_project_routing_active, true);
  assert.equal(preview.global_state_root, stateRoot);
  assert.equal(preview.files.some((file) => file.path === path.join(repoRoot, "AGENTS.md")), false, "global setup must not touch project AGENTS.md");
  assert.equal(preview.files.some((file) => file.path === globalAgents), true, "global setup must target Codex global instructions");
  const previewToml = preview.files.find((file) => file.path === codexConfig)._nextText;
  assert.match(previewToml, /VNEM_TOOLS_GLOBAL_MODE = "codex"/);
  assert.match(previewToml, /VNEM_TOOLS_STATE_ROOT = /);
  assert.doesNotMatch(previewToml, /VNEM_TOOLS_ALLOWED_ROOTS/);
  assert.doesNotMatch(previewToml, /VNEM_TOOLS_EVIDENCE_ROOT/);

  const installed = await applyClientSetup({ ...setupOptions, plan: preview, yes: true });
  assert.equal(installed.ok, true);
  const migratedText = await readFile(codexConfig, "utf8");
  assert.ok(migratedText.startsWith(unrelated.trimEnd()), "migration must preserve unrelated TOML text ahead of the managed VNEM block");
  const migrated = TOML.parse(migratedText);
  assert.equal(migrated.model, "gpt-5");
  assert.deepEqual(migrated.plugins, ["fixture-plugin"]);
  assert.equal(migrated.desktop.theme, "dark");
  assert.equal(migrated.mcp_servers.node_repl.command, "node");
  assert.equal(migrated.mcp_servers["vnem-tools"].env.VNEM_TOOLS_PERMISSION_PROFILE, "creator-power");
  assert.equal(migrated.mcp_servers["vnem-tools"].env.VNEM_TOOLS_ALLOWED_ROOTS, undefined);
  assert.equal(migrated.mcp_servers["vnem-tools"].env.VNEM_TOOLS_EVIDENCE_ROOT, undefined);
  assert.equal(JSON.parse(await readFile(path.join(stateRoot, "global.json"), "utf8")).global_profile, "creator-power");
  assert.ok(JSON.parse(await readFile(path.join(stateRoot, "projects.json"), "utf8")).projects.some((item) => samePath(item.root, repoRoot)));

  const repeatedPreview = await planClientSetup(setupOptions);
  assert.equal(repeatedPreview.change_count, 0, "global setup must be idempotent");
  const rolledBack = await rollbackClientSetup({ ...setupOptions, transactionId: installed.transaction_id, yes: true });
  assert.equal(rolledBack.ok, true);
  assert.equal(await readFile(codexConfig, "utf8"), originalConfig, "rollback must restore the exact previous Codex config bytes");
  assert.equal(existsSync(globalAgents), false, "rollback must remove the global instruction file it created");

  const reinstallPlan = await planClientSetup(setupOptions);
  const reinstalled = await applyClientSetup({ ...setupOptions, plan: reinstallPlan, yes: true, verifyMcp: false });
  assert.equal(reinstalled.ok, true);

  const router = await GlobalProjectRouter.create({ stateRoot, codexConfigPath: codexConfig, home, globalProfile: "creator-power" });
  const discovered = await router.discoverCodexTrustedProjects();
  assert.equal(discovered.health.ok, true);
  assert.equal(discovered.projects.length, 2, "equivalent Windows roots must be deduplicated while distinct projects remain separate");
  assert.equal((await router.authorizationCheck(swapWindowsCaseAndSeparators(projectA))).authorized, true);
  const initialDenial = await router.authorizationCheck(projectC);
  assert.equal(initialDenial.authorized, false);
  assert.match(initialDenial.reason, /not inside a trusted Codex project or an active explicit VNEM project approval/i);

  const sessionRequest = await router.requestApproval({ root: projectC, persistence: "session", duration_minutes: 30 });
  await assert.rejects(() => router.activateApproval({ request_id: sessionRequest.request_id, acknowledgment: "wrong" }), (error) => error instanceof ProjectRouterError && error.code === "project_approval_acknowledgment_mismatch");
  const sessionApproval = await router.activateApproval({ request_id: sessionRequest.request_id, acknowledgment: sessionRequest.exact_acknowledgment });
  assert.equal(sessionApproval.persistence, "session");
  assert.equal((await router.authorizationCheck(projectC)).authorized, true);
  const selectedC = await router.select(projectC);
  assert.match(selectedC.evidence_root, new RegExp(`${escapeRegExp(sessionApproval.project.project_id)}[\\\\/]tool-runs$`));

  const restartedWithoutSession = await GlobalProjectRouter.create({ stateRoot, codexConfigPath: codexConfig, home, globalProfile: "creator-power" });
  assert.equal((await restartedWithoutSession.authorizationCheck(projectC)).authorized, false, "session approval must disappear after runtime restart");
  const persistentRequest = await restartedWithoutSession.requestApproval({ root: projectC, persistence: "persistent", duration_minutes: 1440 });
  await restartedWithoutSession.activateApproval({ request_id: persistentRequest.request_id, acknowledgment: persistentRequest.exact_acknowledgment });
  const restartedWithPersistent = await GlobalProjectRouter.create({ stateRoot, codexConfigPath: codexConfig, home, globalProfile: "creator-power" });
  assert.equal((await restartedWithPersistent.authorizationCheck(projectC)).authorized, true, "persistent approval must survive restart");
  const revoked = await restartedWithPersistent.revoke({ root: projectC });
  assert.equal(revoked.access_denied_after_revocation, true);
  assert.equal((await restartedWithPersistent.authorizationCheck(projectC)).authorized, false);
  await assert.rejects(() => restartedWithPersistent.requestApproval({ root: path.parse(projectA).root, persistence: "session" }), (error) => error instanceof ProjectRouterError && error.code === "project_root_too_broad");
  await assert.rejects(() => restartedWithPersistent.requestApproval({ root: home, persistence: "session" }), (error) => error instanceof ProjectRouterError && error.code === "project_root_too_broad");

  const tamperedStateRoot = path.join(temp, "tampered-state");
  await mkdir(tamperedStateRoot, { recursive: true });
  await writeFile(path.join(tamperedStateRoot, "projects.json"), `${JSON.stringify({ schema_version: "1.0.0", projects: [{ root: path.parse(projectA).root, persistence: "persistent" }] }, null, 2)}\n`, "utf8");
  const tamperedRouter = await GlobalProjectRouter.create({ stateRoot: tamperedStateRoot, codexConfigPath: path.join(temp, "missing-config.toml"), home });
  assert.equal((await tamperedRouter.authorizationCheck(projectA)).authorized, false, "tampered broad persistent approval must fail closed");
  assert.equal((await tamperedRouter.status()).global_state_health.ok, false);

  const configWithThirdProject = `${await readFile(codexConfig, "utf8")}\n${projectTable(projectD)}\ntrust_level = "trusted"\n`;
  await writeFile(codexConfig, configWithThirdProject, "utf8");
  const refreshed = await restartedWithPersistent.discoverCodexTrustedProjects();
  assert.equal(refreshed.projects.length, 3, "new Codex trusted projects must appear without reinstalling VNEM");
  assert.equal((await restartedWithPersistent.authorizationCheck(projectD)).authorized, true);

  const malformedConfig = path.join(temp, "malformed-codex.toml");
  await writeFile(malformedConfig, "[projects.\"broken\"\ntrust_level = \"trusted\"\n", "utf8");
  const malformedRouter = await GlobalProjectRouter.create({ stateRoot: path.join(temp, "malformed-state"), codexConfigPath: malformedConfig, home });
  assert.equal((await malformedRouter.discoverCodexTrustedProjects()).health.code, "codex_config_malformed");
  assert.equal((await malformedRouter.authorizationCheck(projectA)).authorized, false, "malformed Codex TOML must fail closed");

  let junctionCreated = false;
  const escapeLink = path.join(projectA, "escape-to-beta");
  try {
    await symlink(projectB, escapeLink, process.platform === "win32" ? "junction" : "dir");
    junctionCreated = true;
  } catch {}

  let alphaEvidence = null;
  const tools = await connectMcp({
    root: repoRoot,
    serverFile: "scripts/vnem-tools-mcp-server.mjs",
    name: "vnem-codex-global-routing-tools-test",
    env: {
      VNEM_TOOLS_GLOBAL_MODE: "codex",
      VNEM_TOOLS_STATE_ROOT: stateRoot,
      VNEM_TOOLS_CODEX_CONFIG: codexConfig,
      VNEM_TOOLS_PERMISSION_PROFILE: "creator-power",
      VNEM_TOOLS_SKIP_WRANGLER_CHECK: "1"
    }
  });
  const core = await connectMcp({ root: repoRoot, serverFile: "scripts/vnem-mcp-server.mjs", name: "vnem-codex-global-routing-core-test" });
  try {
    const coreTools = await core.client.listTools();
    const toolsList = await tools.client.listTools();
    assert.ok(coreTools.tools.some((tool) => tool.name === "vnem_entrypoint"));
    for (const name of ["vnem_tools_entrypoint", "vnem_tools_project_select", "vnem_tools_project_approval_request", "vnem_tools_project_revoke", "vnem_tools_project_router_doctor"]) {
      assert.ok(toolsList.tools.some((tool) => tool.name === name), `${name} must be registered`);
    }
    assert.equal((await callTimed(core.client, "vnem_entrypoint", { user_goal: "Prove global Codex project routing", available_mcp_names: ["vnem", "vnem-tools"] })).is_error, false);
    const firstToolsCall = await callOk(tools.client, "vnem_tools_entrypoint", { user_goal: "Prove global Codex project routing before a project is selected" }, "tools_entrypoint");
    assert.equal(firstToolsCall.project_selection_required, true);
    assert.equal(firstToolsCall.exact_tool_call_sequence[0].tool, "vnem_tools_codex_trusted_projects");

    await callOk(tools.client, "vnem_tools_project_select", { root: projectA }, "project_selection");
    const alphaRead = await callOk(tools.client, "vnem_tools_read_file", { path: "hello.txt" }, "file");
    assert.equal(alphaRead.content.trim(), "alpha");
    const secretRead = await callTimed(tools.client, "vnem_tools_read_file", { path: ".env" });
    assert.equal(secretRead.is_error, true);
    assert.equal(secretRead.structured.code, "secret_path_blocked");
    const alphaStatus = await callOk(tools.client, "vnem_tools_project_status", {}, "project_status");
    alphaEvidence = alphaStatus.evidence_namespace;
    const alphaSession = await callOk(tools.client, "vnem_tools_start_session", { task: "alpha isolated session", actions_planned: ["read"] }, "session");
    const grantRequest = await callOk(tools.client, "vnem_tools_permission_request", { actions: ["external_fetch"], scope: { path_prefixes: ["."] }, duration_minutes: 30, persistence: "session", reason: "isolation fixture", safer_alternative: "remain offline" }, "permission_request");
    await callOk(tools.client, "vnem_tools_permission_grant", { request_id: grantRequest.request_id, acknowledgment: grantRequest.exact_acknowledgment }, "permission_grant");
    await callOk(tools.client, "vnem_tools_structural_index_build", { root: projectA, refresh: true, max_files: 20 }, "structural_index");
    const alphaGraph = await callOk(tools.client, "vnem_tools_structural_graph_query", { symbol: "alphaValue" }, "structural_graph_query");
    assert.ok(alphaGraph.symbols.some((item) => item.name === "alphaValue"));
    const alphaRefactorPlan = await callOk(tools.client, "vnem_tools_refactor_rename_preview", { symbol: "alphaValue", new_name: "renamedAlphaValue", file: "src/alpha.js", allow_public_api_change: true, verify_scripts: ["test"] }, "refactor_rename_preview");
    assert.ok(alphaRefactorPlan.preview_id);
    const alphaPatch = await callOk(tools.client, "vnem_tools_apply_patch_batch", {
      target_root: ".",
      operations: [{ op: "replace", path: "hello.txt", search: "alpha\n", replace: "alpha-updated\n" }],
      dry_run: false,
      approved: true,
      approval_note: "Create an isolated backup for the global-routing acceptance test."
    }, "patch_batch");
    assert.ok(alphaPatch.restore_plan.length > 0);
    const alphaDataPlan = await callOk(tools.client, "vnem_tools_data_transform_plan", {
      path: "rows.json",
      output_path: "rows.csv",
      output_format: "csv",
      operations: { select: ["id", "label"] }
    }, "data_transform_plan");
    const alphaDataApply = await callOk(tools.client, "vnem_tools_data_transform_apply", {
      plan_id: alphaDataPlan.plan_id,
      dry_run: false,
      approved: true,
      approval_note: "Create a bounded project A data transaction for isolation proof."
    }, "data_transform_application");
    assert.ok(alphaDataApply.transaction_id);

    await callOk(tools.client, "vnem_tools_project_select", { root: projectB }, "project_selection");
    const betaRead = await callOk(tools.client, "vnem_tools_read_file", { path: "hello.txt" }, "file");
    assert.equal(betaRead.content.trim(), "beta");
    const betaStatus = await callOk(tools.client, "vnem_tools_project_status", {}, "project_status");
    assert.notEqual(betaStatus.evidence_namespace, alphaEvidence, "evidence namespaces must differ by project id");
    const absoluteCrossRead = await callTimed(tools.client, "vnem_tools_read_file", { path: path.join(projectA, "hello.txt") });
    assert.equal(absoluteCrossRead.is_error, true);
    assert.equal(absoluteCrossRead.structured.code, "path_outside_allowed_roots");
    const casingCrossRead = await callTimed(tools.client, "vnem_tools_read_file", { path: swapWindowsCaseAndSeparators(path.join(projectA, "hello.txt")) });
    assert.equal(casingCrossRead.is_error, true, "Windows casing and separator changes must not bypass the selected-project boundary");
    const traversal = await callTimed(tools.client, "vnem_tools_read_file", { path: path.join("..", path.basename(projectA), "hello.txt") });
    assert.equal(traversal.is_error, true);
    const crossSession = await callTimed(tools.client, "vnem_tools_finish_session", { session_id: alphaSession.session_id, test_results: [], notes: "cross project attempt" });
    assert.equal(crossSession.is_error, true);
    assert.equal(crossSession.structured.code, "session_project_mismatch");
    const crossPatchPlan = await callTimed(tools.client, "vnem_tools_refactor_apply_verify", { preview_id: alphaRefactorPlan.preview_id });
    assert.equal(crossPatchPlan.is_error, true, "project B must not apply project A's structural patch plan");
    assert.equal(crossPatchPlan.structured.code, "refactor_preview_not_found");
    const crossBackup = await callTimed(tools.client, "vnem_tools_restore_batch", { restore_plan: alphaPatch.restore_plan });
    assert.equal(crossBackup.is_error, true, "project B must not restore project A's backup");
    const crossDataTransaction = await callTimed(tools.client, "vnem_tools_data_transaction_rollback", { transaction_id: alphaDataApply.transaction_id });
    assert.equal(crossDataTransaction.is_error, true, "project B must not use project A's data transaction");
    const betaPermission = await callOk(tools.client, "vnem_tools_permission_status", {}, "permission_status");
    assert.equal(betaPermission.scoped_grants.session.length, 0, "project B must not inherit project A grants");
    await callOk(tools.client, "vnem_tools_structural_index_build", { root: projectB, refresh: true, max_files: 20 }, "structural_index");
    const betaGraph = await callOk(tools.client, "vnem_tools_structural_graph_query", { symbol: "alphaValue" }, "structural_graph_query");
    assert.equal(betaGraph.symbols.length, 0, "project B's structural namespace must not contain project A's index");
    assert.equal(junctionCreated ? (await callTimed(tools.client, "vnem_tools_read_file", { path: path.join(escapeLink, "hello.txt") })).is_error : true, true, "junction escape must be rejected when fixture creation is supported");

    const untrusted = await callTimed(tools.client, "vnem_tools_project_select", { root: projectC });
    assert.equal(untrusted.is_error, true);
    assert.equal(untrusted.structured.code, "project_not_authorized");
    const approval = await callOk(tools.client, "vnem_tools_project_approval_request", { root: projectC, persistence: "session", duration_minutes: 30 }, "project_approval_request");
    const badApproval = await callTimed(tools.client, "vnem_tools_project_approval_activate", { request_id: approval.request_id, acknowledgment: "incorrect" });
    assert.equal(badApproval.is_error, true);
    assert.equal(badApproval.structured.code, "project_approval_acknowledgment_mismatch");
    await callOk(tools.client, "vnem_tools_project_approval_activate", { request_id: approval.request_id, acknowledgment: approval.exact_acknowledgment }, "project_approval_activation");
    await callOk(tools.client, "vnem_tools_project_select", { root: projectC }, "project_selection");
    assert.equal((await callOk(tools.client, "vnem_tools_read_file", { path: "hello.txt" }, "file")).content.trim(), "gamma");
    await callOk(tools.client, "vnem_tools_project_revoke", { root: projectC }, "project_revocation");
    const revokedSelection = await callTimed(tools.client, "vnem_tools_project_select", { root: projectC });
    assert.equal(revokedSelection.is_error, true);

    await callOk(tools.client, "vnem_tools_project_select", { root: projectA }, "project_selection");
    const alphaPermission = await callOk(tools.client, "vnem_tools_permission_status", {}, "permission_status");
    assert.equal(alphaPermission.scoped_grants.session.length, 1, "project A grant must remain only in project A");
    const alphaRollback = await callOk(tools.client, "vnem_tools_data_transaction_rollback", { transaction_id: alphaDataApply.transaction_id, dry_run: false, approved: true, approval_note: "Return to project A and prove its transaction remains available only there." }, "data_transaction_rollback");
    assert.equal(alphaRollback.rollback.hashes_match, true);
    for (const hardBlocked of ["secret_output", "cookie_session_access", "captcha_bypass", "unknown_malware_execution", "repo_delete", "force_push", "protected_branch_write", "root_level_delete", "package_publish"]) {
      const decision = await callOk(tools.client, "vnem_tools_permission_evaluate", { action: hardBlocked }, "permission_decision");
      assert.equal(decision.hard_blocked, true, `${hardBlocked} must remain hard-blocked`);
      assert.equal(decision.allowed, false);
    }
    const doctor = await callOk(tools.client, "vnem_tools_project_router_doctor", {}, "project_router_doctor");
    assert.equal(doctor.ok, true);
    assert.equal(doctor.hard_blocks_intact, true);
  } finally {
    await tools.close();
    await core.close();
  }

  assert.ok(existsSync(alphaEvidence), "project A evidence namespace must exist");
  assert.ok(existsSync(path.join(stateRoot, "projects")), "global project state root must exist");
  console.log("VNEM Codex global routing tests passed: setup migration, trust refresh, approval lifecycle, project isolation, hard blocks, and real Core/Tools STDIO proof");
} finally {
  await rm(temp, { recursive: true, force: true }).catch(() => {});
}

async function callOk(client, name, args, key) {
  const response = await callTimed(client, name, args);
  assert.equal(response.is_error, false, `${name} failed: ${response.text}`);
  const value = response.structured?.[key];
  assert.ok(value, `${name} did not return structured key ${key}`);
  return value;
}

function projectTable(root) {
  return `[projects.${JSON.stringify(root.replace(/\\/g, "/"))}]`;
}

function swapWindowsCaseAndSeparators(root) {
  if (process.platform !== "win32") return root;
  return root.replace(/^([a-z]):/i, (_match, drive) => `${drive === drive.toLowerCase() ? drive.toUpperCase() : drive.toLowerCase()}:`).replace(/\\/g, "/");
}

function samePath(left, right) {
  const a = path.resolve(left);
  const b = path.resolve(right);
  return process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
