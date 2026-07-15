import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { clientCatalog } from "./catalog.mjs";
import { buildVnemServerConfigs, managedClientInstructionsPresent, mergeCodexToml, mergeJsonMcpConfig, mergeManagedClientInstructions, sha256, validateToml } from "./config-merge.mjs";
import { PermissionRuntime } from "../permissions/runtime.mjs";
import { callTimed, connectMcp } from "../giga/mcp-client.mjs";
import { defaultApprovals, defaultGlobalConfig, inspectProjectRoot } from "../projects/router.mjs";

const DEFAULT_COMPONENTS = ["core", "tools"];
const VALID_COMPONENTS = new Set(["core", "tools", "precision"]);

export async function detectSupportedClients(options = {}) {
  const catalog = clientCatalog(options);
  const pathEntries = String(options.pathValue ?? process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
  const detected = [];
  for (const client of catalog) {
    const configExists = Boolean(client.configPath && existsSync(client.configPath));
    const installPath = client.installPaths.find((candidate) => existsSync(candidate)) || null;
    const commandPath = findCommand(client.commands, pathEntries, options.platform || process.platform);
    detected.push({
      id: client.id,
      display_name: client.displayName,
      installed: Boolean(configExists || installPath || commandPath || client.id === "generic_stdio"),
      command_detected: Boolean(commandPath),
      config_detected: configExists,
      install_detected: Boolean(installPath),
      config_path: client.configPath,
      support: client.support,
      proof_level: client.proofLevel,
      reload_guidance: client.reload,
      caveat: client.caveat
    });
  }
  return {
    operation: "clients",
    mode: "read-only",
    generated_at: new Date().toISOString(),
    platform: options.platform || process.platform,
    clients: detected,
    detected_count: detected.filter((client) => client.installed).length
  };
}

export async function planClientSetup(options = {}) {
  const root = path.resolve(options.root || defaultRoot());
  const workspace = path.resolve(options.workspace || process.cwd());
  const home = path.resolve(options.home || os.homedir());
  const scope = normalizeSetupScope(options.scope);
  const components = normalizeComponents(options.components);
  const safetyProfile = options.safetyProfile || "safe-local-dev";
  if (scope === "global" && components.includes("precision")) {
    throw new Error("Global Codex mode supports Core and Tools. Precision remains an explicitly workspace-scoped compatibility server.");
  }
  const codexConfigPath = path.resolve(options.configOverrides?.codex_app || options.configOverrides?.codex_cli || path.join(home, ".codex", "config.toml"));
  const globalStateRoot = path.resolve(options.globalStateRoot || path.join(path.dirname(codexConfigPath), "vnem"));
  const catalog = clientCatalog({ ...options, root, workspace, home, scope, codexHome: path.dirname(codexConfigPath) });
  const byId = new Map(catalog.map((client) => [client.id, client]));
  const detection = await detectSupportedClients({ ...options, workspace, home });
  const detectedIds = detection.clients.filter((client) => client.installed).map((client) => client.id);
  const selectedIds = normalizeClientIds(options.clients?.length ? options.clients : detectedIds.length ? detectedIds : ["generic_stdio"], byId);
  if (scope === "global" && selectedIds.some((clientId) => !["codex_app", "codex_cli"].includes(clientId))) {
    throw new Error("Global setup is currently supported only for codex_app and codex_cli; use project scope for other clients.");
  }
  const servers = buildVnemServerConfigs({
    root,
    workspace,
    components,
    scope,
    stateRoot: globalStateRoot,
    codexConfigPath,
    safetyProfile
  });
  const grouped = new Map();
  const instructionGroups = new Map();

  for (const clientId of selectedIds) {
    const client = byId.get(clientId);
    const override = options.configOverrides?.[clientId];
    const target = path.resolve(override || client.configPath || client.profilePath);
    const format = client.configFormat || "json-mcp-servers";
    const key = `${format}:${target.toLowerCase()}`;
    const current = grouped.get(key) || { target, format, clients: [], support: [], proofLevels: [], reload: [] };
    current.clients.push(client.id);
    current.support.push(client.support);
    current.proofLevels.push(client.proofLevel);
    current.reload.push(client.reload);
    grouped.set(key, current);
    if (client.instructionPath) {
      const instructionTarget = path.resolve(client.instructionPath);
      const instructionKey = instructionTarget.toLowerCase();
      const instructionGroup = instructionGroups.get(instructionKey) || { target: instructionTarget, clients: [], support: [], proofLevels: [], reload: [] };
      instructionGroup.clients.push(client.id);
      instructionGroup.support.push(client.support);
      instructionGroup.proofLevels.push(client.proofLevel);
      instructionGroup.reload.push(client.reload);
      instructionGroups.set(instructionKey, instructionGroup);
    }
  }

  const files = [];
  for (const group of grouped.values()) {
    const existed = existsSync(group.target);
    const existingText = existed ? await readFile(group.target, "utf8") : "";
    const merged = group.format === "codex-toml"
      ? mergeCodexToml(existingText, servers)
      : mergeJsonMcpConfig(existingText, servers);
    files.push({
      path: group.target,
      role: "client-config",
      format: group.format,
      clients: group.clients,
      support: unique(group.support),
      proof_levels: unique(group.proofLevels),
      reload_guidance: unique(group.reload),
      existed,
      changed: merged.changed,
      before_sha256: sha256(existingText),
      after_sha256: sha256(merged.text),
      before_bytes: Buffer.byteLength(existingText),
      after_bytes: Buffer.byteLength(merged.text),
      preserved_unrelated_settings: true,
      _nextText: merged.text
    });
  }
  for (const group of instructionGroups.values()) {
    const existed = existsSync(group.target);
    const existingText = existed ? await readFile(group.target, "utf8") : "";
    const merged = mergeManagedClientInstructions(existingText);
    files.push({
      path: group.target,
      role: "client-instructions",
      format: "managed-markdown",
      clients: group.clients,
      support: unique(group.support),
      proof_levels: unique(group.proofLevels),
      reload_guidance: unique(group.reload),
      existed,
      changed: merged.changed,
      before_sha256: sha256(existingText),
      after_sha256: sha256(merged.text),
      before_bytes: Buffer.byteLength(existingText),
      after_bytes: Buffer.byteLength(merged.text),
      preserved_unrelated_settings: true,
      preserved_unrelated_instructions: true,
      _nextText: merged.text
    });
  }

  const permissionRuntime = await PermissionRuntime.create({ workspaceRoot: workspace, allowedRoots: [workspace] });
  if (!permissionRuntime.profiles().some((profile) => profile.profile_name === safetyProfile)) {
    throw new Error(`Unknown safety profile: ${safetyProfile}`);
  }
  if (scope === "global") files.push(...await buildGlobalStateFiles({ globalStateRoot, workspace, safetyProfile }));
  const safetyPreview = scope === "global"
    ? {
        profile: safetyProfile,
        configured_by: "global_vnem_state",
        config_path: path.join(globalStateRoot, "global.json"),
        hard_blocked_actions: permissionRuntime.previewConfig({ ...permissionRuntime.config, profile: safetyProfile }).hard_blocked_actions
      }
    : permissionRuntime.previewConfig({ ...permissionRuntime.config, profile: safetyProfile });
  const stateDir = path.resolve(options.stateDir || (scope === "global" ? path.join(globalStateRoot, "setup") : path.join(home, ".vnem", "setup")));
  return {
    operation: "setup_preview",
    generated_at: new Date().toISOString(),
    root,
    workspace,
    home,
    scope,
    dynamic_project_routing_active: scope === "global",
    global_state_root: scope === "global" ? globalStateRoot : null,
    codex_config_path: scope === "global" ? codexConfigPath : null,
    state_dir: stateDir,
    clients: selectedIds,
    components,
    safety_profile: safetyProfile,
    safety_preview: safetyPreview,
    files,
    change_count: files.filter((file) => file.changed).length,
    one_confirmation_required: true,
    secrets_in_output: false,
    next_action: scope === "global"
      ? "Review this global Codex migration preview, then rerun with --yes to activate dynamic project routing in one reversible transaction."
      : "Review this preview, then rerun with --yes to apply every listed change as one reversible setup transaction."
  };
}

export async function applyClientSetup(options = {}) {
  const plan = options.plan || await planClientSetup(options);
  if (!options.yes) return { ...publicSetupPlan(plan), applied: false };
  const transactionId = `setup-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
  const backupDir = path.join(plan.state_dir, "backups", transactionId);
  const manifestDir = path.join(plan.state_dir, "manifests");
  const manifestPath = path.join(manifestDir, `${transactionId}.json`);
  const changedFiles = plan.files.filter((file) => file.changed);
  const safetyPath = plan.scope === "global" ? null : path.join(plan.workspace, ".vnem", "safety.json");
  const safetyBefore = safetyPath && existsSync(safetyPath) ? await readFile(safetyPath, "utf8") : "";
  const manifest = {
    schema_version: "1.0.0",
    transaction_id: transactionId,
    created_at: new Date().toISOString(),
    root: plan.root,
    workspace: plan.workspace,
    scope: plan.scope,
    dynamic_project_routing_active: plan.dynamic_project_routing_active,
    global_state_root: plan.global_state_root,
    clients: plan.clients,
    components: plan.components,
    safety_profile: plan.safety_profile,
    files: [],
    status: "applying"
  };

  await mkdir(backupDir, { recursive: true });
  await mkdir(manifestDir, { recursive: true });
  try {
    const transactionFiles = [...changedFiles];
    if (safetyPath) transactionFiles.push({ path: safetyPath, existed: existsSync(safetyPath), before_sha256: sha256(safetyBefore), _safety: true });
    for (const [index, file] of transactionFiles.entries()) {
      const currentText = file.existed ? await readFile(file.path, "utf8") : "";
      if (!file._safety && sha256(currentText) !== file.before_sha256) {
        throw new Error(`Config changed after preview: ${file.path}. Preview again; no setup changes were applied.`);
      }
      const backupPath = path.join(backupDir, `${String(index + 1).padStart(2, "0")}.bak`);
      if (file.existed) await copyFile(file.path, backupPath);
      manifest.files.push({
        path: file.path,
        existed: file.existed,
        backup_path: file.existed ? backupPath : null,
        before_sha256: sha256(currentText),
        after_sha256: file._safety ? null : file.after_sha256,
        role: file._safety ? "safety-profile" : file.role
      });
    }
    await writeManifest(manifestPath, manifest);

    for (const file of changedFiles) {
      await atomicWrite(file.path, file._nextText);
      validateWrittenConfig(file.path, file.format, file._nextText);
    }

    if (safetyPath) {
      const permissionRuntime = await PermissionRuntime.create({ workspaceRoot: plan.workspace, allowedRoots: [plan.workspace] });
      await permissionRuntime.setProfile(plan.safety_profile, { persist: true });
      const safetyAfter = await readFile(safetyPath, "utf8");
      const safetyRecord = manifest.files.find((file) => file.role === "safety-profile");
      safetyRecord.after_sha256 = sha256(safetyAfter);
    }

    const proof = await verifySetup({ ...plan, runMcp: options.verifyMcp !== false });
    manifest.status = proof.ok ? "applied-and-verified" : "applied-verification-incomplete";
    manifest.completed_at = new Date().toISOString();
    manifest.proof = proof;
    await writeManifest(manifestPath, manifest);
    const reportPath = path.join(plan.state_dir, "proof", `${transactionId}.json`);
    await atomicWrite(reportPath, `${JSON.stringify({ ...proof, transaction_id: transactionId, manifest_path: manifestPath }, null, 2)}\n`);
    return {
      operation: "setup_apply",
      ok: proof.ok,
      applied: true,
      transaction_id: transactionId,
      changed_files: manifest.files.map((file) => ({ path: file.path, role: file.role, before_sha256: file.before_sha256, after_sha256: file.after_sha256 })),
      manifest_path: manifestPath,
      proof_report_path: reportPath,
      proof,
      rollback: `vnem rollback --state-dir ${quoteArg(plan.state_dir)} --yes`,
      reload_guidance: unique(plan.files.flatMap((file) => file.reload_guidance)),
      dynamic_project_routing_active: plan.dynamic_project_routing_active,
      global_state_root: plan.global_state_root,
      secrets_in_output: false
    };
  } catch (error) {
    manifest.status = "failed-rolling-back";
    manifest.failure = { message: String(error.message || error), details_redacted: true };
    await rollbackManifest(manifest);
    manifest.status = "failed-rolled-back";
    manifest.rolled_back_at = new Date().toISOString();
    await writeManifest(manifestPath, manifest);
    throw error;
  }
}

export async function rollbackClientSetup(options = {}) {
  const home = path.resolve(options.home || os.homedir());
  const defaultStateDir = options.scope === "global"
    ? path.join(path.dirname(path.resolve(options.configOverrides?.codex_app || options.configOverrides?.codex_cli || path.join(home, ".codex", "config.toml"))), "vnem", "setup")
    : path.join(home, ".vnem", "setup");
  const stateDir = path.resolve(options.stateDir || defaultStateDir);
  const manifestDir = path.join(stateDir, "manifests");
  const manifestPath = options.transactionId
    ? path.join(manifestDir, `${options.transactionId}.json`)
    : await latestManifestPath(manifestDir);
  if (!manifestPath) throw new Error("No VNEM setup transaction exists to roll back.");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (!options.yes) {
    return {
      operation: "rollback_preview",
      applied: false,
      transaction_id: manifest.transaction_id,
      files: manifest.files.map((file) => ({ path: file.path, restore: file.existed ? "backup" : "remove-created-file" })),
      next_action: "Review the rollback preview, then rerun with --yes."
    };
  }
  await rollbackManifest(manifest);
  manifest.status = "rolled-back";
  manifest.rolled_back_at = new Date().toISOString();
  await writeManifest(manifestPath, manifest);
  return {
    operation: "rollback",
    ok: true,
    applied: true,
    transaction_id: manifest.transaction_id,
    restored_files: manifest.files.map((file) => file.path),
    manifest_path: manifestPath
  };
}

export async function setupStatus(options = {}) {
  const home = path.resolve(options.home || os.homedir());
  const defaultStateDir = options.scope === "global"
    ? path.join(path.dirname(path.resolve(options.configOverrides?.codex_app || options.configOverrides?.codex_cli || path.join(home, ".codex", "config.toml"))), "vnem", "setup")
    : path.join(home, ".vnem", "setup");
  const stateDir = path.resolve(options.stateDir || defaultStateDir);
  const manifestPath = await latestManifestPath(path.join(stateDir, "manifests"));
  const latest = manifestPath ? JSON.parse(await readFile(manifestPath, "utf8")) : null;
  const detection = await detectSupportedClients(options);
  return {
    operation: "status",
    state_dir: stateDir,
    latest_transaction: latest ? {
      transaction_id: latest.transaction_id,
      status: latest.status,
      created_at: latest.created_at,
      root: latest.root,
      workspace: latest.workspace,
      scope: latest.scope || "project",
      dynamic_project_routing_active: latest.dynamic_project_routing_active === true,
      global_state_root: latest.global_state_root || null,
      clients: latest.clients,
      components: latest.components,
      safety_profile: latest.safety_profile
    } : null,
    clients: detection.clients,
    secrets_in_output: false
  };
}

export async function verifySetup(plan) {
  const configChecks = [];
  for (const file of plan.files.filter((candidate) => candidate.role === "client-config")) {
    const exists = existsSync(file.path);
    let valid = false;
    let serversPresent = [];
    if (exists) {
      const text = await readFile(file.path, "utf8");
      if (file.format === "codex-toml") {
        const result = validateToml(text);
        valid = result.ok;
        serversPresent = ["vnem", "vnem-tools", "vnem-precision"].filter((name) => new RegExp(`\\[mcp_servers\\.(?:\"${escapeRegExp(name)}\"|${escapeRegExp(name)})\\]`).test(text));
      } else {
        try {
          const parsed = JSON.parse(text);
          valid = Boolean(parsed && typeof parsed.mcpServers === "object");
          serversPresent = Object.keys(parsed.mcpServers || {}).filter((name) => ["vnem", "vnem-tools", "vnem-precision"].includes(name));
        } catch {
          valid = false;
        }
      }
    }
    configChecks.push({ path: file.path, clients: file.clients, exists, syntax_valid: valid, servers_present: serversPresent });
  }
  const instructionChecks = [];
  for (const file of plan.files.filter((candidate) => candidate.role === "client-instructions")) {
    const exists = existsSync(file.path);
    const text = exists ? await readFile(file.path, "utf8") : "";
    instructionChecks.push({
      path: file.path,
      clients: file.clients,
      exists,
      managed_block_present: managedClientInstructionsPresent(text),
      unrelated_instructions_preserved: file.preserved_unrelated_instructions === true
    });
  }
  const safety = plan.scope === "global"
    ? await readGlobalSafety(plan.global_state_root)
    : await PermissionRuntime.create({ workspaceRoot: plan.workspace, allowedRoots: [plan.workspace] }).then((runtime) => runtime.status());
  const activeProfile = plan.scope === "global" ? safety.global_profile : safety.profile.profile_name;
  const safetyOk = activeProfile === plan.safety_profile;
  const mcp = plan.runMcp ? await verifyMcpServers(plan) : { attempted: false, core: null, tools: null, reason: "MCP smoke disabled for this run." };
  const configOk = configChecks.every((check) => check.exists && check.syntax_valid && plan.components.every((component) => component === "precision" ? check.servers_present.includes("vnem-precision") : component === "core" ? check.servers_present.includes("vnem") : check.servers_present.includes("vnem-tools")));
  const instructionsOk = instructionChecks.every((check) => check.exists && check.managed_block_present && check.unrelated_instructions_preserved);
  const mcpOk = !plan.runMcp || (plan.components.includes("core") ? mcp.core?.ok : true) && (plan.components.includes("tools") ? mcp.tools?.ok : true);
  return {
    ok: configOk && instructionsOk && safetyOk && mcpOk,
    generated_at: new Date().toISOString(),
    config_checks: configChecks,
    instruction_checks: instructionChecks,
    safety: {
      ok: safetyOk,
      selected_profile: plan.safety_profile,
      active_profile: activeProfile,
      configured_by: plan.scope === "global" ? "global_vnem_state" : safety.configured_by,
      hard_blocks_present: plan.scope === "global" ? safety.hard_blocks_removable === false : safety.hard_blocked_actions.length > 0
    },
    mcp,
    what_is_not_proven: plan.runMcp
      ? ["The client UI has not been reloaded or visually inspected by this local stdio smoke test.", "Import-profile clients still require manual import through their current client UI."]
      : ["MCP server startup, tool discovery, and client UI visibility were not exercised in this run."],
    secrets_in_output: false
  };
}

export function publicSetupPlan(plan) {
  return {
    ...plan,
    files: plan.files.map(({ _nextText, ...file }) => file)
  };
}

async function verifyMcpServers(plan) {
  const result = { attempted: true, core: null, tools: null };
  if (plan.components.includes("core")) result.core = await smokeServer(plan, "core");
  if (plan.components.includes("tools")) result.tools = await smokeServer(plan, "tools");
  return result;
}

async function smokeServer(plan, kind) {
  const serverFile = kind === "core" ? "scripts/vnem-mcp-server.mjs" : "scripts/vnem-tools-mcp-server.mjs";
  const entrypoint = kind === "core" ? "vnem_entrypoint" : "vnem_tools_entrypoint";
  let connection;
  try {
    connection = await connectMcp({
      root: plan.root,
      serverFile,
      name: `vnem-setup-${kind}`,
      env: plan.scope === "global" && kind === "tools" ? {
        VNEM_TOOLS_GLOBAL_MODE: "codex",
        VNEM_TOOLS_STATE_ROOT: plan.global_state_root,
        VNEM_TOOLS_CODEX_CONFIG: plan.codex_config_path,
        VNEM_TOOLS_PERMISSION_PROFILE: plan.safety_profile
      } : {
        VNEM_TOOLS_ALLOWED_ROOTS: plan.workspace,
        VNEM_TOOLS_EVIDENCE_ROOT: path.join(plan.workspace, ".vnem", "tool-runs")
      }
    });
    const listed = await connection.client.listTools();
    const visible = listed.tools.some((tool) => tool.name === entrypoint);
    let projectSelection = null;
    if (visible && kind === "tools" && plan.scope === "global") {
      const selectVisible = listed.tools.some((tool) => tool.name === "vnem_tools_project_select");
      projectSelection = selectVisible ? await callTimed(connection.client, "vnem_tools_project_select", { root: plan.workspace }) : null;
    }
    const call = visible ? await callTimed(connection.client, entrypoint, kind === "core"
      ? { user_goal: "Verify VNEM setup and route a safe local repository inspection.", available_mcp_names: ["vnem", "vnem-tools"] }
      : { user_goal: "Verify VNEM setup with a safe local repository inspection.", root: plan.workspace, task_mode: "repo_inspection" }) : null;
    const selectionOk = plan.scope !== "global" || kind !== "tools" || projectSelection?.is_error === false;
    return {
      ok: visible && selectionOk && call?.is_error === false,
      server: kind,
      entrypoint,
      listed_tool_count: listed.tools.length,
      entrypoint_visible: visible,
      project_selection_ok: projectSelection ? projectSelection.is_error === false : null,
      entrypoint_call_ok: call?.is_error === false,
      latency_ms: call?.latency_ms || null
    };
  } catch (error) {
    return { ok: false, server: kind, entrypoint, error_code: error?.code || error?.name || "mcp_smoke_failed", details_redacted: true };
  } finally {
    await connection?.close();
  }
}

async function rollbackManifest(manifest) {
  for (const file of [...manifest.files].reverse()) {
    if (file.existed && file.backup_path && existsSync(file.backup_path)) {
      await mkdir(path.dirname(file.path), { recursive: true });
      await copyFile(file.backup_path, file.path);
    } else if (!file.existed && existsSync(file.path)) {
      await rm(file.path, { force: true });
    }
  }
}

async function atomicWrite(filePath, text) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${randomUUID().slice(0, 8)}.tmp`;
  await writeFile(temporary, text, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, filePath);
}

async function writeManifest(manifestPath, manifest) {
  await atomicWrite(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

async function latestManifestPath(manifestDir) {
  if (!existsSync(manifestDir)) return null;
  const files = (await readdir(manifestDir)).filter((name) => name.endsWith(".json")).sort().reverse();
  for (const name of files) {
    const candidate = path.join(manifestDir, name);
    try {
      const manifest = JSON.parse(await readFile(candidate, "utf8"));
      if (!manifest.rolled_back_at && manifest.status !== "rolled-back") return candidate;
    } catch {
      continue;
    }
  }
  return null;
}

function validateWrittenConfig(filePath, format, text) {
  if (format === "managed-markdown") {
    if (!managedClientInstructionsPresent(text)) throw new Error(`Managed VNEM instruction validation failed after writing ${filePath}.`);
    return;
  }
  if (format === "codex-toml") {
    const result = validateToml(text);
    if (!result.ok) throw new Error(`TOML validation failed after writing ${filePath}.`);
    return;
  }
  JSON.parse(text);
}

async function buildGlobalStateFiles({ globalStateRoot, workspace, safetyProfile }) {
  const globalPath = path.join(globalStateRoot, "global.json");
  const approvalsPath = path.join(globalStateRoot, "projects.json");
  const existingGlobalText = existsSync(globalPath) ? await readFile(globalPath, "utf8") : "";
  const existingApprovalsText = existsSync(approvalsPath) ? await readFile(approvalsPath, "utf8") : "";
  const existingGlobal = parseSetupJson(existingGlobalText, globalPath, {});
  const existingApprovals = parseSetupJson(existingApprovalsText, approvalsPath, defaultApprovals());
  const project = await inspectProjectRoot(workspace, { source: "vnem_persistent_approval" });
  assertProjectSpecificRoot(project.root, workspace);
  const globalConfig = {
    ...existingGlobal,
    ...defaultGlobalConfig(safetyProfile),
    migrated_from_static_workspace_root: true
  };
  const approvalRecord = {
    project_id: project.project_id,
    root: project.root,
    identity: project.identity,
    source: "vnem_persistent_approval",
    persistence: "persistent",
    approved_at: null,
    expires_at: null
  };
  const approvalsByIdentity = new Map((existingApprovals.projects || []).filter((item) => item?.identity || item?.root).map((item) => [item.identity || path.resolve(item.root).toLowerCase(), item]));
  approvalsByIdentity.set(project.identity, { ...(approvalsByIdentity.get(project.identity) || {}), ...approvalRecord });
  const approvals = {
    schema_version: defaultApprovals().schema_version,
    projects: [...approvalsByIdentity.values()].sort((left, right) => String(left.root).localeCompare(String(right.root), undefined, { sensitivity: "base" }))
  };
  return [
    setupJsonFile(globalPath, "global-router-config", existingGlobalText, globalConfig),
    setupJsonFile(approvalsPath, "global-project-approvals", existingApprovalsText, approvals)
  ];
}

function setupJsonFile(filePath, role, beforeText, value) {
  const nextText = `${JSON.stringify(value, null, 2)}\n`;
  return {
    path: filePath,
    role,
    format: "json-state",
    clients: ["codex_app", "codex_cli"],
    support: ["direct-merge"],
    proof_levels: ["local-fixture-and-stdio-verified"],
    reload_guidance: [],
    existed: Boolean(beforeText),
    changed: beforeText !== nextText,
    before_sha256: sha256(beforeText),
    after_sha256: sha256(nextText),
    before_bytes: Buffer.byteLength(beforeText),
    after_bytes: Buffer.byteLength(nextText),
    preserved_unrelated_settings: true,
    _nextText: nextText
  };
}

function parseSetupJson(text, filePath, fallback) {
  if (!String(text || "").trim()) return fallback;
  try {
    const parsed = JSON.parse(text);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error("not an object");
    return parsed;
  } catch {
    throw new Error(`Existing VNEM global state is invalid JSON; no changes were made: ${filePath}`);
  }
}

async function readGlobalSafety(globalStateRoot) {
  if (!globalStateRoot) throw new Error("Global VNEM state root is missing from the setup plan.");
  const filePath = path.join(globalStateRoot, "global.json");
  const parsed = parseSetupJson(await readFile(filePath, "utf8"), filePath, {});
  return parsed;
}

function assertProjectSpecificRoot(root, original) {
  const resolved = path.resolve(root);
  const home = path.resolve(os.homedir());
  const relativeSegments = resolved.slice(path.parse(resolved).root.length).split(path.sep).filter(Boolean);
  if (resolved === path.parse(resolved).root || resolved.toLowerCase() === home.toLowerCase() || relativeSegments.length < 2) {
    throw new Error(`Global setup cannot authorize a drive, filesystem, home, or dangerously broad root: ${original}`);
  }
}

function normalizeSetupScope(value) {
  const scope = String(value || "project").trim().toLowerCase();
  if (!["project", "global"].includes(scope)) throw new Error(`Unknown setup scope: ${value}`);
  return scope;
}

function normalizeComponents(components) {
  const normalized = unique((components?.length ? components : DEFAULT_COMPONENTS).map((item) => String(item).trim().toLowerCase()).filter(Boolean));
  if (!normalized.length) throw new Error("Select at least one component: core, tools, or precision.");
  for (const component of normalized) if (!VALID_COMPONENTS.has(component)) throw new Error(`Unknown setup component: ${component}`);
  return normalized;
}

function normalizeClientIds(clientIds, byId) {
  const normalized = unique(clientIds.map((item) => String(item).trim().toLowerCase()).filter(Boolean));
  for (const clientId of normalized) if (!byId.has(clientId)) throw new Error(`Unknown client: ${clientId}`);
  return normalized;
}

function findCommand(commands, pathEntries, platform) {
  const extensions = platform === "win32" ? [".exe", ".cmd", ".bat", ""] : [""];
  for (const directory of pathEntries) {
    for (const command of commands) {
      for (const extension of extensions) {
        const candidate = path.join(directory.replace(/^"|"$/g, ""), `${command}${extension}`);
        if (existsSync(candidate)) return candidate;
      }
    }
  }
  return null;
}

function defaultRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
}

function quoteArg(value) {
  return /\s/.test(value) ? JSON.stringify(value) : value;
}

function unique(values) {
  return [...new Set(values)];
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
