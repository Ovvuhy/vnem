import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { constants as fsConstants, existsSync } from "node:fs";
import { access, lstat, open, readlink, realpath } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { clientCatalog } from "../clients/catalog.mjs";

const SECRET_PATTERN = /(?:gh[pousr]_|github_pat_|sk-|xox[baprs]-|cfut_)[A-Za-z0-9_-]{8,}/i;
const SECRET_ASSIGNMENT_PATTERN = /(?:token|secret|password|credential|api[_-]?key|authorization|cookie|session)\s*[=:]\s*\S+/i;
const SENSITIVE_PATH_PATTERN = /(^|[\\/])(\.ssh|\.aws|\.gnupg|credentials?|secrets?|cookies?|sessions?)([\\/]|$)|(^|[\\/])\.env(?:\.|$)/i;
const SAFE_SERVICE_NAME = /^[A-Za-z0-9_.-]{1,128}$/;
const SAFE_PROCESS_NAME = /^[A-Za-z0-9_.-]{1,128}$/;
const EVENT_LOGS = new Set(["Application", "System", "Setup"]);
const CHANGE_OPERATIONS = new Set(["service_change", "registry_change", "scheduled_task_change", "firewall_change", "antivirus_exclusion", "system_path_change", "machine_configuration"]);
const MAX_PROBE_OUTPUT = 1024 * 1024;

export class WindowsLocalError extends Error {
  constructor(message, code = "windows_local_error", details = {}) {
    super(message);
    this.name = "WindowsLocalError";
    this.code = code;
    this.details = details;
  }
}

export class WindowsLocalRuntime {
  constructor({ allowedRoots }) {
    this.allowedRoots = allowedRoots.map((root) => path.resolve(root));
  }

  planPowerShellCommand(args = {}) {
    const executable = boundedText(args.executable || "powershell.exe", 512, "PowerShell executable");
    const commandArgs = arrayify(args.arguments).slice(0, 50).map((value, index) => boundedText(value, 2048, `PowerShell argument ${index + 1}`));
    if (arrayify(args.arguments).length > 50) throw new WindowsLocalError("PowerShell command plans are limited to 50 arguments.", "powershell_argument_limit");
    for (const value of [executable, ...commandArgs]) assertNoSecret(value, "powershell_secret_argument_blocked");
    const invocation = [`& ${quotePowerShellLiteral(executable)}`, ...commandArgs.map(quotePowerShellLiteral)].join(" ");
    return {
      schema_version: 1,
      operation_result: "planned",
      executed: false,
      shell: "PowerShell",
      executable,
      arguments: commandArgs,
      invocation,
      quoting_contract: {
        executable_uses_call_operator: true,
        every_token_is_single_quoted: true,
        embedded_single_quotes_are_doubled: true,
        shell_operators_remain_literal_arguments: true,
        native_spawn_array_preferred_when_available: true
      },
      must_not_claim: ["The command was executed.", "The target executable exists.", "The planned command is safe for unreviewed elevated or destructive use."],
      safe_next_step: "Review the exact executable and argument list, prefer a native argv spawn, and use the narrowest permission profile before any real execution."
    };
  }

  async systemSnapshot() {
    const commandNames = ["node", "npm", "git", "gh", "pwsh", "powershell", "cmd"];
    const commands = [];
    for (const name of commandNames) {
      const candidates = findExecutableCandidates(name);
      const selected = candidates[0] || null;
      commands.push({
        name,
        found: Boolean(selected),
        selected_path: selected ? publicPath(selected) : null,
        candidate_count: candidates.length,
        version: selected ? await probeVersion(name, selected) : null
      });
    }
    const pathStatus = inspectPathEnvironment();
    const tempDirectories = await inspectTempDirectories();
    const system = process.platform === "win32" ? await readWindowsSystemStatus() : { operation_result: "unsupported_platform", reason: "Windows-only system status was not queried on this platform." };
    const issues = [
      ...commands.filter((item) => ["node", "npm", "git", "gh"].includes(item.name) && !item.found).map((item) => `${item.name} was not found on PATH`),
      ...pathStatus.missing_entries.map((entry) => `PATH entry does not exist: ${entry}`),
      ...(pathStatus.duplicate_entries.length ? [`PATH contains ${pathStatus.duplicate_entries.length} duplicate entr${pathStatus.duplicate_entries.length === 1 ? "y" : "ies"}`] : []),
      ...(system.long_paths?.enabled === false ? ["Windows long paths are not enabled"] : [])
    ];
    return {
      schema_version: 1,
      operation_result: process.platform === "win32" ? "reported" : "unsupported_platform",
      read_only: true,
      platform: { value: process.platform, release: os.release(), version: os.version(), architecture: process.arch, hostname_hash: sha256(os.hostname()).slice(0, 12) },
      shells: commands.filter((item) => ["pwsh", "powershell", "cmd"].includes(item.name)),
      developer_commands: commands.filter((item) => !["pwsh", "powershell", "cmd"].includes(item.name)),
      path_status: pathStatus,
      temp_directories: tempDirectories,
      environment_presence: Object.fromEntries(["SystemRoot", "ComSpec", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "TEMP", "TMP", "PSModulePath"].map((name) => [name, Boolean(process.env[name])])),
      windows_status: system,
      issues,
      restart_reload_guidance: issues.length ? "Correct one diagnosed path/tool issue at a time, then restart only the affected terminal or application and rerun this snapshot." : "No restart is indicated by this bounded snapshot.",
      limitations: ["This is bounded visibility, not a security, health, or performance certification.", "Environment variable values, process command lines, credentials, and config contents are not returned.", "Unavailable or access-denied Windows providers are reported rather than bypassed."]
    };
  }

  async inspectPaths(args = {}) {
    const root = await this.resolveRoot(args.root || this.allowedRoots[0]);
    const requested = arrayify(args.paths).length ? arrayify(args.paths) : ["."];
    if (requested.length > 25) throw new WindowsLocalError("Path inspection is limited to 25 paths.", "windows_path_limit");
    const results = [];
    for (const input of requested) results.push(await inspectOnePath(root, input, this.allowedRoots));
    return {
      schema_version: 1,
      operation_result: "reported",
      root,
      paths: results,
      summary: {
        requested: results.length,
        existing: results.filter((item) => item.exists).length,
        links: results.filter((item) => item.link.type !== "none").length,
        possible_locks_or_permission_blocks: results.filter((item) => item.lock_probe?.signal === "possible_lock_or_permission").length,
        long_path_risks: results.filter((item) => item.long_path.risk).length
      },
      limitations: ["A writable-open failure cannot distinguish every file lock from an ACL or security-product denial.", "File-lock owner discovery requires a separately approved OS handle inspector and is not claimed here.", "Access checks report the current VNEM process token only."]
    };
  }

  async inspectProcesses(args = {}) {
    const vnemProcessPid = args.include_vnem_process === true ? process.pid : null;
    const pids = [...new Set([...arrayify(args.pids), vnemProcessPid].map(Number).filter((value) => Number.isInteger(value) && value > 0))].slice(0, 25);
    const names = [...new Set(arrayify(args.names).map((value) => String(value).trim()).filter(Boolean))].slice(0, 25);
    if (arrayify(args.pids).length > 25 || arrayify(args.names).length > 25) throw new WindowsLocalError("Process inspection is limited to 25 PIDs and 25 exact names.", "windows_process_limit");
    for (const name of names) if (!SAFE_PROCESS_NAME.test(name)) throw new WindowsLocalError("Process names must be exact executable names without wildcards or shell syntax.", "windows_process_name_invalid", { name });
    if (!pids.length && !names.length) throw new WindowsLocalError("Provide at least one PID or exact process name.", "windows_process_target_required");
    if (process.platform !== "win32") return unsupported("process inspection");
    const result = await runPowerShellJson(PROCESS_SCRIPT, { pids, names });
    return {
      schema_version: 1,
      operation_result: result.ok ? "reported" : "probe_failed",
      requested: { pids, names, vnem_process_pid: vnemProcessPid },
      processes: arrayify(result.value?.processes).map((item) => ({ name: item.name, pid: Number(item.pid), parent_pid: Number(item.parent_pid) || null, executable_path: item.executable_path ? publicPath(item.executable_path) : null, created_at: item.created_at || null, provider: item.provider || "unknown" })),
      not_found: arrayify(result.value?.not_found),
      probe: probeSummary(result),
      privacy: { command_lines_returned: false, environment_returned: false, owner_tokens_returned: false },
      safe_next_step: "Confirm the exact PID belongs to the intended application before requesting any stop, restart, or tree action."
    };
  }

  async inspectPorts(args = {}) {
    const ports = [...new Set(arrayify(args.ports).map(Number).filter((value) => Number.isInteger(value) && value > 0 && value <= 65535))].slice(0, 50);
    if (!ports.length) throw new WindowsLocalError("Provide one or more TCP ports from 1 to 65535.", "windows_port_required");
    if (arrayify(args.ports).length > 50) throw new WindowsLocalError("Port inspection is limited to 50 ports.", "windows_port_limit");
    if (process.platform !== "win32") return unsupported("TCP port inspection");
    const netstat = resolveWindowsSystemCommand("netstat.exe");
    const probe = await runProbe(netstat, ["-ano", "-p", "tcp"], { timeoutMs: 8_000 });
    const rows = parseWindowsNetstat(`${probe.stdout}\n${probe.stderr}`);
    const results = ports.map((port) => {
      const matches = rows.filter((row) => row.local_port === port);
      return { port, listening: matches.some((row) => row.state === "LISTENING"), listeners: matches.filter((row) => row.state === "LISTENING").slice(0, 10), connections: matches.filter((row) => row.state !== "LISTENING").slice(0, 10) };
    });
    const pids = [...new Set(results.flatMap((item) => item.listeners.map((listener) => listener.pid)).filter(Boolean))];
    const processDetails = pids.length ? await this.inspectProcesses({ pids }) : { processes: [] };
    return {
      schema_version: 1,
      operation_result: probe.spawned && !probe.timed_out ? "reported" : "probe_failed",
      ports: results,
      listener_processes: processDetails.processes,
      probe: probeSummary(probe),
      safe_next_step: results.some((item) => item.listening) ? "Verify the listener PID and owning app before any stop or restart action." : "No requested TCP listener was observed; reproduce the startup attempt and inspect its logs before changing firewall or security settings."
    };
  }

  async serviceStatus(args = {}) {
    const names = exactNames(args.names, ["EventLog", "Schedule", "WinDefend"], SAFE_SERVICE_NAME, 20, "service");
    if (process.platform !== "win32") return unsupported("Windows service status");
    const result = await runPowerShellJson(SERVICE_SCRIPT, { names });
    return {
      schema_version: 1,
      operation_result: result.ok ? "reported" : "probe_failed",
      services: arrayify(result.value?.services),
      probe: probeSummary(result),
      read_only: true,
      mutation_supported: false,
      safe_next_step: "Use the exact service name and current status as evidence; any start/stop/configuration change requires a separate scoped local_pc_action approval and rollback plan."
    };
  }

  async scheduledTaskStatus(args = {}) {
    const targets = arrayify(args.tasks).map(normalizeScheduledTask).slice(0, 20);
    if (!targets.length) throw new WindowsLocalError("Provide one or more exact scheduled-task paths.", "windows_scheduled_task_required");
    if (arrayify(args.tasks).length > 20) throw new WindowsLocalError("Scheduled-task inspection is limited to 20 exact paths.", "windows_scheduled_task_limit");
    if (process.platform !== "win32") return unsupported("Windows scheduled-task status");
    const result = await runPowerShellJson(SCHEDULED_TASK_SCRIPT, { tasks: targets });
    return {
      schema_version: 1,
      operation_result: result.ok ? "reported" : "probe_failed",
      tasks: arrayify(result.value?.tasks),
      probe: probeSummary(result),
      read_only: true,
      actions_or_arguments_returned: false,
      mutation_supported: false,
      safe_next_step: "Inspect task state and last/next run metadata; changing, creating, or deleting a task requires a scoped local_pc_action approval and rollback plan."
    };
  }

  async eventLogRead(args = {}) {
    const logName = String(args.log_name || "Application");
    if (!EVENT_LOGS.has(logName)) throw new WindowsLocalError("Event log must be one of Application, System, or Setup.", "windows_event_log_not_allowed", { log_name: logName });
    const lookbackMinutes = clamp(args.lookback_minutes, 1, 24 * 60, 60);
    const maxEvents = clamp(args.max_events, 1, 50, 20);
    const levels = [...new Set(arrayify(args.levels).map(Number).filter((value) => [1, 2, 3, 4].includes(value)))];
    if (process.platform !== "win32") return unsupported("Windows Event Viewer read");
    const result = await runPowerShellJson(EVENT_LOG_SCRIPT, { log_name: logName, lookback_minutes: lookbackMinutes, max_events: maxEvents, levels });
    const events = arrayify(result.value?.events).map((item) => redactObject({ ...item, message: String(item.message || "").slice(0, 800) }));
    return {
      schema_version: 1,
      operation_result: result.value?.access_denied ? "access_denied" : result.ok ? "reported" : "probe_failed",
      query: { log_name: logName, lookback_minutes: lookbackMinutes, max_events: maxEvents, levels },
      events,
      probe: probeSummary(result),
      bounded: true,
      export_performed: false,
      privacy: { messages_redacted: true, max_message_characters: 800, credentials_returned: false },
      safe_next_step: events.length ? "Correlate the newest relevant event timestamp/provider/id with the failing app or command before changing configuration." : "No matching bounded events were returned; reproduce once and retry a narrow time window or use an approved export plan."
    };
  }

  async detectAppConfigs(args = {}) {
    const root = await this.resolveRoot(args.root || this.allowedRoots[0]);
    const catalog = clientCatalog({ workspace: root });
    const clients = catalog.map((client) => {
      const commandCandidates = client.commands.flatMap(findExecutableCandidates);
      const installedPaths = client.installPaths.filter((candidate) => existsSync(candidate));
      const configPath = client.configPath || null;
      const profilePath = client.profilePath || null;
      return {
        id: client.id,
        display_name: client.displayName,
        detected: commandCandidates.length > 0 || installedPaths.length > 0,
        command_paths: commandCandidates.map(publicPath),
        install_paths: installedPaths.map(publicPath),
        config_path: configPath ? publicPath(configPath) : null,
        config_exists: Boolean(configPath && existsSync(configPath)),
        profile_path: profilePath ? publicPath(profilePath) : null,
        profile_exists: Boolean(profilePath && existsSync(profilePath)),
        support: client.support,
        proof_level: client.proofLevel,
        reload_guidance: client.reload,
        caveat: client.caveat
      };
    });
    return {
      schema_version: 1,
      operation_result: "reported",
      platform: process.platform,
      clients,
      detected_count: clients.filter((client) => client.detected).length,
      config_content_read: false,
      config_content_modified: false,
      limitations: ["Detection uses known executable/config locations and PATH only.", "Import-only clients remain import-only; no global config location is guessed."]
    };
  }

  planSystemChange(args = {}) {
    const operation = String(args.operation || "");
    if (!CHANGE_OPERATIONS.has(operation)) throw new WindowsLocalError("Unsupported Windows change-plan operation.", "windows_change_operation_invalid", { operation, allowed: [...CHANGE_OPERATIONS] });
    const target = boundedText(args.target || "", 512, "Windows change target");
    const desiredState = boundedText(args.desired_state || "", 512, "Windows desired state");
    const rollbackSteps = arrayify(args.rollback_steps).slice(0, 20).map((value, index) => boundedText(value, 1000, `Rollback step ${index + 1}`));
    for (const value of [target, desiredState, ...rollbackSteps]) assertNoSecret(value, "windows_change_secret_blocked");
    const disablesSecurity = /disable|turn\s+off|stopp?ed|inactive|bypass/i.test(desiredState) && /defender|antivirus|firewall|security|protection/i.test(`${target} ${operation}`);
    const complete = Boolean(target && desiredState && rollbackSteps.length);
    return {
      schema_version: 1,
      operation_result: disablesSecurity ? "hard_blocked" : complete ? "plan_ready_for_permission_review" : "incomplete_plan",
      operation,
      target,
      desired_state: desiredState,
      executed: false,
      execution_supported: false,
      permission_action: "local_pc_action",
      explicit_scoped_approval_required: true,
      exact_scope_required: true,
      rollback_plan_required: true,
      rollback_steps: rollbackSteps,
      hard_blocked: disablesSecurity,
      blockers: [disablesSecurity ? "VNEM does not disable Windows security products, firewall, antivirus, or protection controls." : null, !target ? "An exact target is required." : null, !desiredState ? "An exact desired state is required." : null, !rollbackSteps.length ? "At least one concrete rollback step is required." : null].filter(Boolean),
      must_not_claim: ["Any Windows service, registry, scheduled task, firewall, antivirus, PATH, or machine setting changed.", "A security control was disabled.", "Approval was granted by creating this plan."],
      safe_next_step: disablesSecurity ? "Keep the security control enabled and diagnose the actual compatibility, path, permission, or process failure." : complete ? "Run the shared permission preview for local_pc_action, obtain exact scoped approval, and use a separately implemented reviewed executor only if one exists." : "Complete the exact target, desired state, and rollback plan before requesting permission."
    };
  }

  async resolveRoot(candidate) {
    const absolute = path.resolve(candidate);
    const resolved = await realpath(absolute).catch(() => absolute);
    if (!this.allowedRoots.some((allowed) => isInside(allowed, resolved))) throw new WindowsLocalError("Windows/local-PC project root is outside allowed roots.", "path_outside_allowed_roots", { root: resolved });
    return resolved;
  }
}

async function inspectOnePath(root, input, allowedRoots) {
  const value = boundedText(input, 2048, "Path");
  if (SENSITIVE_PATH_PATTERN.test(value)) throw new WindowsLocalError("Secret/session/credential path metadata is blocked.", "windows_sensitive_path_blocked", { path: value });
  const candidate = path.resolve(root, value);
  if (!allowedRoots.some((allowed) => isInside(allowed, candidate))) throw new WindowsLocalError("Inspected path is outside allowed roots.", "path_outside_allowed_roots", { path: value });
  const windowsNormalized = path.win32.normalize(value.replaceAll("/", "\\"));
  if (!existsSync(candidate)) return { input: value, normalized: normalizePath(candidate), windows_normalized: windowsNormalized, exists: false, type: "missing", permissions: null, link: { type: "none", target: null }, lock_probe: null, long_path: longPathStatus(candidate), temp_directory: isInside(os.tmpdir(), candidate) };
  const info = await lstat(candidate);
  const linked = info.isSymbolicLink();
  const resolved = linked ? await realpath(candidate).catch(() => null) : candidate;
  if (resolved && !allowedRoots.some((allowed) => isInside(allowed, resolved))) throw new WindowsLocalError("Resolved path escapes allowed roots through a link or junction.", "path_link_escape_blocked", { path: value });
  const permissions = {
    readable: await canAccess(candidate, fsConstants.R_OK),
    writable: await canAccess(candidate, fsConstants.W_OK),
    executable_or_traversable: await canAccess(candidate, fsConstants.X_OK)
  };
  let lockProbe = null;
  if (info.isFile() && !linked) {
    try {
      const handle = await open(candidate, "r+");
      await handle.close();
      lockProbe = { attempted: true, writable_open: true, signal: "no_exclusive_write_lock_observed" };
    } catch (error) {
      lockProbe = { attempted: true, writable_open: false, signal: ["EBUSY", "EPERM", "EACCES"].includes(error.code) ? "possible_lock_or_permission" : "open_failed", code: error.code || null };
    }
  }
  return {
    input: value,
    normalized: normalizePath(candidate),
    windows_normalized: windowsNormalized,
    exists: true,
    type: info.isFile() ? "file" : info.isDirectory() ? "directory" : linked ? "link" : "other",
    size_bytes: info.isFile() ? info.size : null,
    permissions,
    link: linked ? { type: process.platform === "win32" ? "symbolic_link_or_junction" : "symbolic_link", target: publicPath(await readlink(candidate).catch(() => "unavailable")), resolved_inside_allowed_roots: Boolean(resolved) } : { type: "none", target: null },
    lock_probe: lockProbe,
    long_path: longPathStatus(candidate),
    temp_directory: isInside(os.tmpdir(), candidate)
  };
}

async function readWindowsSystemStatus() {
  const result = await runPowerShellJson(SYSTEM_STATUS_SCRIPT, {});
  if (!result.ok) return { operation_result: "probe_failed", probe: probeSummary(result) };
  return redactObject({ operation_result: "reported", ...result.value, probe: probeSummary(result) });
}

async function inspectTempDirectories() {
  const values = [...new Set([os.tmpdir(), process.env.TEMP, process.env.TMP].filter(Boolean).map((value) => path.resolve(value)))];
  const output = [];
  for (const value of values) output.push({ path: publicPath(value), exists: existsSync(value), readable: await canAccess(value, fsConstants.R_OK), writable: await canAccess(value, fsConstants.W_OK) });
  return output;
}

function inspectPathEnvironment() {
  const raw = String(process.env.PATH || "");
  const entries = raw.split(path.delimiter).map((value) => value.trim().replace(/^"|"$/g, "")).filter(Boolean);
  const seen = new Map();
  for (const entry of entries) {
    const key = process.platform === "win32" ? path.resolve(entry).toLowerCase() : path.resolve(entry);
    seen.set(key, (seen.get(key) || 0) + 1);
  }
  return {
    entry_count: entries.length,
    unique_entry_count: seen.size,
    missing_entries: entries.filter((entry) => !existsSync(entry)).map(publicPath).slice(0, 50),
    duplicate_entries: [...seen.entries()].filter(([, count]) => count > 1).map(([entry, count]) => ({ path: publicPath(entry), count })).slice(0, 50),
    empty_entries: raw.split(path.delimiter).filter((entry) => !entry.trim()).length,
    value_returned: false
  };
}

async function probeVersion(name, executable) {
  if (name === "node" && path.resolve(executable) === path.resolve(process.execPath)) return process.version;
  const args = name === "powershell" || name === "pwsh" ? ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", "$PSVersionTable.PSVersion.ToString()"] : ["--version"];
  let result;
  if (/\.(cmd|bat)$/i.test(executable)) {
    const powershell = resolvePowerShell();
    if (!powershell) return null;
    result = await runProbe(powershell, ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", "& $env:VNEM_VERSION_EXECUTABLE --version | Select-Object -First 1"], { env: { VNEM_VERSION_EXECUTABLE: executable }, timeoutMs: 5_000 });
  } else result = await runProbe(executable, args, { timeoutMs: 5_000 });
  const firstLine = `${result.stdout}\n${result.stderr}`.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
  return result.spawned && !result.timed_out ? redactText(firstLine || "") || null : null;
}

async function runPowerShellJson(script, input) {
  const powershell = resolvePowerShell();
  if (!powershell) return { ok: false, spawned: false, timed_out: false, exit_code: null, error: "PowerShell was not found." };
  const encoded = Buffer.from(JSON.stringify(input), "utf8").toString("base64");
  const probe = await runProbe(powershell, ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script], { env: { VNEM_WINDOWS_INPUT_B64: encoded }, timeoutMs: 15_000 });
  let value = null;
  let parseError = null;
  if (probe.stdout.trim()) {
    try { value = JSON.parse(probe.stdout.trim()); }
    catch (error) { parseError = error.message; }
  }
  return { ...probe, ok: probe.spawned && !probe.timed_out && probe.exit_code === 0 && !parseError && value !== null, value: redactObject(value), parse_error: parseError };
}

async function runProbe(command, args, options = {}) {
  return await new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    let spawned = false;
    const child = spawn(command, args, { windowsHide: true, shell: false, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, ...(options.env || {}) } });
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ stdout: redactText(stdout.slice(-MAX_PROBE_OUTPUT)), stderr: redactText(stderr.slice(-MAX_PROBE_OUTPUT)), spawned, ...value });
    };
    child.stdout?.on("data", (chunk) => { stdout = `${stdout}${chunk}`.slice(-MAX_PROBE_OUTPUT); });
    child.stderr?.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-MAX_PROBE_OUTPUT); });
    child.once("spawn", () => { spawned = true; });
    child.once("error", (error) => finish({ exit_code: null, timed_out: false, error: redactText(error.message) }));
    child.once("exit", (code, signal) => finish({ exit_code: code, signal: signal || null, timed_out: false }));
    const timer = setTimeout(() => {
      child.kill();
      finish({ exit_code: null, signal: null, timed_out: true, error: "Probe timed out." });
    }, options.timeoutMs || 10_000);
  });
}

function parseWindowsNetstat(text) {
  const rows = [];
  for (const line of String(text).split(/\r?\n/)) {
    const match = line.trim().match(/^TCP\s+(\S+):(\d+)\s+(\S+):(\d+)\s+(\S+)\s+(\d+)$/i);
    if (!match) continue;
    rows.push({ protocol: "TCP", local_address: match[1], local_port: Number(match[2]), remote_address: match[3], remote_port: Number(match[4]), state: match[5].toUpperCase(), pid: Number(match[6]) || null });
  }
  return rows;
}

function normalizeScheduledTask(value) {
  const full = boundedText(value, 512, "Scheduled task path").replaceAll("/", "\\");
  if (!full || /[*?\[\]]/.test(full) || !full.includes("\\")) throw new WindowsLocalError("Scheduled-task targets must be exact paths without wildcards.", "windows_scheduled_task_invalid", { task: full });
  const normalized = full.startsWith("\\") ? full : `\\${full}`;
  const index = normalized.lastIndexOf("\\");
  const taskPath = normalized.slice(0, index + 1);
  const taskName = normalized.slice(index + 1);
  if (!taskName) throw new WindowsLocalError("Scheduled-task path must include an exact task name.", "windows_scheduled_task_invalid", { task: full });
  return { full_path: `${taskPath}${taskName}`, task_path: taskPath, task_name: taskName };
}

function exactNames(values, defaults, pattern, limit, label) {
  const raw = arrayify(values).length ? arrayify(values) : defaults;
  if (raw.length > limit) throw new WindowsLocalError(`${label} inspection is limited to ${limit} exact names.`, `windows_${label}_limit`);
  const names = [...new Set(raw.map((value) => String(value).trim()).filter(Boolean))];
  for (const name of names) if (!pattern.test(name)) throw new WindowsLocalError(`${label} names must be exact and contain no wildcard or shell syntax.`, `windows_${label}_name_invalid`, { name });
  return names;
}

function findExecutableCandidates(command) {
  const requested = String(command || "");
  if (!requested) return [];
  if (path.isAbsolute(requested)) return existsSync(requested) ? [requested] : [];
  const pathEntries = String(process.env.PATH || "").split(path.delimiter).map((entry) => entry.trim().replace(/^"|"$/g, "")).filter(Boolean);
  const hasExtension = Boolean(path.extname(requested));
  const extensions = process.platform === "win32" && !hasExtension ? String(process.env.PATHEXT || ".EXE;.CMD;.BAT;.COM").split(";").filter(Boolean) : [""];
  const results = [];
  for (const directory of pathEntries) for (const extension of extensions) {
    const candidate = path.join(directory, hasExtension ? requested : `${requested}${extension.toLowerCase()}`);
    if (existsSync(candidate) && !results.some((value) => value.toLowerCase() === candidate.toLowerCase())) results.push(candidate);
  }
  return results.slice(0, 20);
}

function resolvePowerShell() {
  const pwsh = findExecutableCandidates("pwsh")[0];
  if (pwsh) return pwsh;
  if (process.platform !== "win32") return findExecutableCandidates("powershell")[0] || null;
  const legacy = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  return existsSync(legacy) ? legacy : findExecutableCandidates("powershell")[0] || null;
}

function resolveWindowsSystemCommand(name) {
  const candidate = path.join(process.env.SystemRoot || "C:\\Windows", "System32", name);
  return existsSync(candidate) ? candidate : name;
}

function quotePowerShellLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function boundedText(value, limit, label) {
  const text = String(value ?? "");
  if (text.length > limit) throw new WindowsLocalError(`${label} is limited to ${limit} characters.`, "windows_text_limit", { label, limit });
  if (/[\u0000\r\n]/.test(text)) throw new WindowsLocalError(`${label} contains blocked control characters.`, "windows_control_character_blocked", { label });
  return text;
}

function assertNoSecret(value, code) {
  if (SECRET_PATTERN.test(value) || SECRET_ASSIGNMENT_PATTERN.test(value)) throw new WindowsLocalError("Secret-shaped values are blocked from Windows/local-PC plans.", code);
}

function publicPath(value) {
  if (!value) return value;
  const home = path.resolve(os.homedir());
  const absolute = path.resolve(String(value));
  if (isInside(home, absolute)) {
    const relative = path.relative(home, absolute);
    return normalizePath(relative ? path.join("%USERPROFILE%", relative) : "%USERPROFILE%");
  }
  return normalizePath(value);
}

function longPathStatus(value) {
  const length = String(value).length;
  return { characters: length, risk: process.platform === "win32" && length >= 240, legacy_max_path_threshold: 260, guidance: length >= 240 ? "Prefer long-path-aware tools and verify LongPathsEnabled; do not rename or move automatically." : null };
}

async function canAccess(value, mode) {
  try { await access(value, mode); return true; } catch { return false; }
}

function unsupported(capability) {
  return { schema_version: 1, operation_result: "unsupported_platform", platform: process.platform, read_only: true, capability, reason: `${capability} is implemented for Windows and was not simulated on ${process.platform}.`, must_not_claim: [`${capability} was performed.`] };
}

function probeSummary(result) {
  return { spawned: result.spawned === true, exit_code: result.exit_code ?? null, timed_out: result.timed_out === true, error: result.error || result.parse_error || null, stderr_excerpt: result.stderr ? redactText(result.stderr).slice(0, 500) : null };
}

function redactObject(value) {
  if (value === null || value === undefined) return value;
  return JSON.parse(redactText(JSON.stringify(value)));
}

function redactText(value) {
  return String(value || "")
    .replace(/(?:gh[pousr]_|github_pat_|sk-|xox[baprs]-|cfut_)[A-Za-z0-9_-]{8,}/gi, "[REDACTED]")
    .replace(/((?:token|secret|password|credential|api[_-]?key|authorization|cookie|session)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]");
}

function isInside(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function normalizePath(value) {
  return String(value || "").replaceAll("\\", "/");
}

function arrayify(value) {
  return Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
}

function clamp(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.trunc(number))) : fallback;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

const SYSTEM_STATUS_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$longPaths = $null
try { $longPaths = [bool]((Get-ItemProperty -LiteralPath 'HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem' -Name LongPathsEnabled -ErrorAction Stop).LongPathsEnabled) } catch {}
$defender = $null
try {
  $mp = Get-MpComputerStatus -ErrorAction Stop
  $defender = [ordered]@{ available = $true; antivirus_enabled = [bool]$mp.AntivirusEnabled; antispyware_enabled = [bool]$mp.AntispywareEnabled; real_time_protection_enabled = [bool]$mp.RealTimeProtectionEnabled; behavior_monitor_enabled = [bool]$mp.BehaviorMonitorEnabled; last_quick_scan = $mp.QuickScanEndTime }
} catch { $defender = [ordered]@{ available = $false; reason = 'provider unavailable or access denied' } }
[ordered]@{
  powershell_version = $PSVersionTable.PSVersion.ToString()
  edition = $PSVersionTable.PSEdition
  elevated = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  long_paths = [ordered]@{ visible = ($null -ne $longPaths); enabled = $longPaths }
  defender = $defender
} | ConvertTo-Json -Compress -Depth 6
`;

const PROCESS_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$input = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:VNEM_WINDOWS_INPUT_B64)) | ConvertFrom-Json
$found = @{}
$missing = @()
foreach ($pidValue in @($input.pids)) {
  $items = @(Get-CimInstance Win32_Process -Filter ("ProcessId = {0}" -f [int]$pidValue) -ErrorAction SilentlyContinue)
  foreach ($item in $items) { $found[[string]$item.ProcessId] = [ordered]@{ name = $item.Name; pid = $item.ProcessId; parent_pid = $item.ParentProcessId; executable_path = $item.ExecutablePath; created_at = $item.CreationDate; provider = 'Win32_Process' } }
  if (-not $items.Count) {
    $fallback = Get-Process -Id ([int]$pidValue) -ErrorAction SilentlyContinue
    if ($null -eq $fallback) { $missing += [ordered]@{ type = 'pid'; value = [int]$pidValue } }
    else {
      $fallbackPath = $null; $fallbackCreated = $null
      try { $fallbackPath = $fallback.Path } catch {}
      try { $fallbackCreated = $fallback.StartTime } catch {}
      $found[[string]$fallback.Id] = [ordered]@{ name = ($fallback.ProcessName + '.exe'); pid = $fallback.Id; parent_pid = $null; executable_path = $fallbackPath; created_at = $fallbackCreated; provider = 'Get-Process fallback' }
    }
  }
}
foreach ($name in @($input.names)) {
  $items = @(Get-CimInstance Win32_Process -Filter ("Name = '{0}'" -f [string]$name) -ErrorAction SilentlyContinue)
  foreach ($item in $items) { $found[[string]$item.ProcessId] = [ordered]@{ name = $item.Name; pid = $item.ProcessId; parent_pid = $item.ParentProcessId; executable_path = $item.ExecutablePath; created_at = $item.CreationDate; provider = 'Win32_Process' } }
  if (-not $items.Count) {
    $fallbackItems = @(Get-Process -Name ([IO.Path]::GetFileNameWithoutExtension([string]$name)) -ErrorAction SilentlyContinue)
    if (-not $fallbackItems.Count) { $missing += [ordered]@{ type = 'name'; value = [string]$name } }
    foreach ($fallback in $fallbackItems) {
      $fallbackPath = $null; $fallbackCreated = $null
      try { $fallbackPath = $fallback.Path } catch {}
      try { $fallbackCreated = $fallback.StartTime } catch {}
      $found[[string]$fallback.Id] = [ordered]@{ name = ($fallback.ProcessName + '.exe'); pid = $fallback.Id; parent_pid = $null; executable_path = $fallbackPath; created_at = $fallbackCreated; provider = 'Get-Process fallback' }
    }
  }
}
$processes = @($found.Values | Sort-Object pid)
[ordered]@{ processes = $processes; not_found = @($missing) } | ConvertTo-Json -Compress -Depth 5
`;

const SERVICE_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$input = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:VNEM_WINDOWS_INPUT_B64)) | ConvertFrom-Json
$services = foreach ($name in @($input.names)) {
  $item = Get-CimInstance Win32_Service -Filter ("Name = '{0}'" -f [string]$name) -ErrorAction SilentlyContinue
  if ($null -ne $item) { [ordered]@{ name = $item.Name; display_name = $item.DisplayName; found = $true; state = $item.State; start_mode = $item.StartMode; process_id = $item.ProcessId; exit_code = $item.ExitCode; provider = 'Win32_Service' } }
  else {
    $fallback = Get-Service -Name ([string]$name) -ErrorAction SilentlyContinue
    if ($null -eq $fallback) { [ordered]@{ name = [string]$name; found = $false } }
    else { [ordered]@{ name = $fallback.Name; display_name = $fallback.DisplayName; found = $true; state = [string]$fallback.Status; start_mode = [string]$fallback.StartType; process_id = $null; exit_code = $null; provider = 'Get-Service fallback' } }
  }
}
[ordered]@{ services = @($services) } | ConvertTo-Json -Compress -Depth 5
`;

const SCHEDULED_TASK_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$input = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:VNEM_WINDOWS_INPUT_B64)) | ConvertFrom-Json
$tasks = foreach ($target in @($input.tasks)) {
  try {
    $task = Get-ScheduledTask -TaskPath ([string]$target.task_path) -TaskName ([string]$target.task_name) -ErrorAction Stop
    $info = Get-ScheduledTaskInfo -TaskPath ([string]$target.task_path) -TaskName ([string]$target.task_name) -ErrorAction SilentlyContinue
    [ordered]@{ full_path = [string]$target.full_path; found = $true; state = [string]$task.State; enabled = [bool]$task.Settings.Enabled; last_run_time = $info.LastRunTime; next_run_time = $info.NextRunTime; last_task_result = $info.LastTaskResult }
  } catch { [ordered]@{ full_path = [string]$target.full_path; found = $false; state = $null } }
}
[ordered]@{ tasks = @($tasks) } | ConvertTo-Json -Compress -Depth 5
`;

const EVENT_LOG_SCRIPT = String.raw`
$input = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:VNEM_WINDOWS_INPUT_B64)) | ConvertFrom-Json
try {
  $filter = @{ LogName = [string]$input.log_name; StartTime = (Get-Date).AddMinutes(-[int]$input.lookback_minutes) }
  if (@($input.levels).Count) { $filter.Level = @($input.levels | ForEach-Object { [int]$_ }) }
  $events = @(Get-WinEvent -FilterHashtable $filter -MaxEvents ([int]$input.max_events) -ErrorAction Stop | ForEach-Object { [ordered]@{ time_created = $_.TimeCreated; provider = $_.ProviderName; id = $_.Id; level = $_.Level; level_name = $_.LevelDisplayName; message = $_.Message } })
  [ordered]@{ access_denied = $false; events = $events } | ConvertTo-Json -Compress -Depth 5
} catch {
  [ordered]@{ access_denied = ($_.Exception -is [System.UnauthorizedAccessException]); events = @(); error = $_.Exception.Message } | ConvertTo-Json -Compress -Depth 5
}
`;

export const WINDOWS_LOCAL_MARKERS = Object.freeze({
  powershell: sha256("PowerShell call operator|single quote doubling|native argv preferred"),
  diagnostics: sha256("PATH|node|npm|gh|git|process|port|lock|service|task|event|Defender|client config"),
  safety: sha256("fixed probes|exact names|bounded events|no command lines|no config contents|no security disabling|permission and rollback")
});
