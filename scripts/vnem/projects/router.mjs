import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile, realpath, rename, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import TOML from "@iarna/toml";
import { resolvePermissionProfile } from "../permissions/profiles.mjs";

const ROUTER_SCHEMA_VERSION = "1.0.0";
const MAX_SESSION_MINUTES = 24 * 60;
const MAX_PERSISTENT_MINUTES = 30 * 24 * 60;

export class ProjectRouterError extends Error {
  constructor(message, code = "project_router_error", details = {}) {
    super(message);
    this.name = "ProjectRouterError";
    this.code = code;
    this.details = details;
  }
}

export class GlobalProjectRouter {
  constructor(options = {}) {
    this.platform = options.platform || process.platform;
    this.home = path.resolve(options.home || os.homedir());
    this.stateRoot = path.resolve(options.stateRoot || path.join(options.codexHome || process.env.CODEX_HOME || path.join(this.home, ".codex"), "vnem"));
    this.codexConfigPath = path.resolve(options.codexConfigPath || process.env.VNEM_TOOLS_CODEX_CONFIG || path.join(options.codexHome || process.env.CODEX_HOME || path.join(this.home, ".codex"), "config.toml"));
    this.globalConfigPath = path.join(this.stateRoot, "global.json");
    this.approvalsPath = path.join(this.stateRoot, "projects.json");
    this.auditPath = path.join(this.stateRoot, "project-router-audit.jsonl");
    this.globalConfig = defaultGlobalConfig(options.globalProfile || process.env.VNEM_TOOLS_PERMISSION_PROFILE);
    this.persistentApprovals = new Map();
    this.sessionApprovals = new Map();
    this.requests = new Map();
    this.selected = null;
    this.deniedAttempts = [];
    this.stateIssues = [];
    this.codexHealth = { ok: false, code: "not_checked", issues: [] };
    this.selectionHook = null;
  }

  static async create(options = {}) {
    const router = new GlobalProjectRouter(options);
    await router.initialize();
    return router;
  }

  async initialize() {
    await mkdir(this.stateRoot, { recursive: true });
    this.globalConfig = await readJson(this.globalConfigPath, defaultGlobalConfig(process.env.VNEM_TOOLS_PERMISSION_PROFILE), "global_project_config_invalid");
    const approvals = await readJson(this.approvalsPath, defaultApprovals(), "project_approval_registry_invalid");
    for (const item of approvals.projects || []) {
      try {
        const inspected = await inspectProjectRoot(item?.root, { platform: this.platform, source: "vnem_persistent_approval" });
        const broadness = broadRootIssues(inspected.root, this.home, this.platform);
        if (broadness.length) throw new ProjectRouterError("Stored project approval is dangerously broad.", "stored_project_root_too_broad", { issues: broadness });
        const normalized = {
          ...inspected,
          persistence: "persistent",
          approved_at: item.approved_at || null,
          expires_at: item.expires_at || null
        };
        if (!isExpired(normalized)) this.persistentApprovals.set(normalized.identity, normalized);
      } catch (error) {
        this.stateIssues.push({ code: error.code || "stored_project_invalid", project_id: item?.project_id || null });
      }
    }
    return this;
  }

  setSelectionHook(hook) {
    this.selectionHook = typeof hook === "function" ? hook : null;
  }

  globalProfileName() {
    return resolvePermissionProfile(this.globalConfig.global_profile).profile_name;
  }

  selectedProject() {
    return this.selected ? publicProject(this.selected) : null;
  }

  projectStateRoot(project) {
    const record = requireProject(project);
    return path.join(this.stateRoot, "projects", record.project_id);
  }

  evidenceRoot(project) {
    return path.join(this.projectStateRoot(project), "tool-runs");
  }

  async ensureProjectState(project) {
    const root = this.projectStateRoot(project);
    await mkdir(path.join(root, "tool-runs"), { recursive: true });
    await mkdir(path.join(root, "permissions"), { recursive: true });
    return {
      state_root: root,
      evidence_root: path.join(root, "tool-runs"),
      permission_config: path.join(root, "permissions", "safety.json"),
      permission_backups: path.join(root, "permissions", "backups")
    };
  }

  async effectiveProfile(project) {
    const global = resolvePermissionProfile(this.globalProfileName());
    const policyPath = path.join(this.projectStateRoot(project), "policy.json");
    const policy = await readJson(policyPath, {}, "project_policy_invalid");
    const requested = policy.profile_narrowing ? resolvePermissionProfile(policy.profile_narrowing) : null;
    const narrowing = requested && requested.profile_name === policy.profile_narrowing && requested.power_level <= global.power_level
      ? requested
      : null;
    return {
      global_profile: global.profile_name,
      project_profile_narrowing: narrowing?.profile_name || null,
      effective_profile: (narrowing || global).profile_name,
      invalid_broadening_ignored: Boolean(requested && requested.power_level > global.power_level)
    };
  }

  async discoverCodexTrustedProjects() {
    let text;
    try {
      text = await readFile(this.codexConfigPath, "utf8");
    } catch (error) {
      const code = error?.code === "ENOENT" ? "codex_config_missing" : "codex_config_unreadable";
      this.codexHealth = { ok: false, code, issues: [{ code }], config_path: this.codexConfigPath };
      return { projects: [], health: this.codexHealth, registrations: registrationsFrom(null) };
    }
    let parsed;
    try {
      parsed = TOML.parse(text);
    } catch {
      this.codexHealth = { ok: false, code: "codex_config_malformed", issues: [{ code: "codex_config_malformed" }], config_path: this.codexConfigPath };
      return { projects: [], health: this.codexHealth, registrations: registrationsFrom(null) };
    }
    const issues = [];
    const deduped = new Map();
    const projects = parsed?.projects && typeof parsed.projects === "object" ? parsed.projects : {};
    for (const [rawRoot, value] of Object.entries(projects)) {
      if (String(value?.trust_level || "").toLowerCase() !== "trusted") continue;
      if (!path.isAbsolute(rawRoot)) {
        issues.push({ code: "relative_codex_project_rejected", project: rawRoot });
        continue;
      }
      try {
        const record = await inspectProjectRoot(rawRoot, { platform: this.platform, source: "codex_trusted" });
        const broadness = broadRootIssues(record.root, this.home, this.platform);
        if (broadness.length) throw new ProjectRouterError("Codex trusted project root is dangerously broad.", "trusted_project_root_too_broad", { issues: broadness });
        deduped.set(record.identity, record);
      } catch (error) {
        issues.push({ code: error.code || "trusted_project_invalid", project: rawRoot });
      }
    }
    const result = [...deduped.values()].sort((a, b) => comparePaths(a.root, b.root));
    this.codexHealth = {
      ok: true,
      code: issues.length ? "codex_config_valid_with_project_issues" : "ok",
      issues,
      config_path: this.codexConfigPath,
      trusted_project_count: result.length
    };
    return { projects: result.map(publicProject), health: this.codexHealth, registrations: registrationsFrom(parsed) };
  }

  async authorizationCheck(input) {
    this.pruneExpired();
    const requested = await inspectExistingPath(input, { platform: this.platform });
    const trusted = await this.discoverCodexTrustedProjects();
    const candidates = [
      ...trusted.projects.map((item) => ({ ...item, source: "codex_trusted" })),
      ...[...this.sessionApprovals.values()].map((item) => ({ ...item, source: "vnem_session_approval" })),
      ...[...this.persistentApprovals.values()].map((item) => ({ ...item, source: "vnem_persistent_approval" }))
    ].filter((item) => !isExpired(item) && insidePath(item.root, requested.root));
    candidates.sort((a, b) => pathDepth(b.root) - pathDepth(a.root));
    const match = candidates[0] || null;
    if (!match) {
      const denial = {
        authorized: false,
        code: "project_not_authorized",
        requested_path: requested.root,
        reason: "The requested path is not inside a trusted Codex project or an active explicit VNEM project approval.",
        safe_next_action: "Request approval for the exact project root, then activate it with the returned acknowledgment phrase."
      };
      this.deniedAttempts.push({ ...denial, denied_at: new Date().toISOString() });
      this.deniedAttempts = this.deniedAttempts.slice(-50);
      await this.audit("authorization_denied", denial);
      return denial;
    }
    const project = await inspectProjectRoot(match.root, { platform: this.platform, source: match.source });
    return {
      authorized: true,
      code: "project_authorized",
      requested_path: requested.root,
      authorization_source: match.source,
      project: publicProject(project),
      matched_root: project.root,
      expires_at: match.expires_at || null
    };
  }

  async requestApproval(options = {}) {
    const project = await inspectProjectRoot(options.root, { platform: this.platform, source: "approval_request" });
    const broadness = broadRootIssues(project.root, this.home, this.platform);
    if (broadness.length) {
      throw new ProjectRouterError("Project approval rejected because the requested root is dangerously broad.", "project_root_too_broad", { root: project.root, issues: broadness });
    }
    const persistence = options.persistence === "persistent" ? "persistent" : "session";
    const maxMinutes = persistence === "persistent" ? MAX_PERSISTENT_MINUTES : MAX_SESSION_MINUTES;
    const durationMinutes = clampMinutes(options.duration_minutes || (persistence === "session" ? 60 : MAX_PERSISTENT_MINUTES), maxMinutes);
    const requestId = `project-${randomUUID()}`;
    const acknowledgment = `I APPROVE VNEM PROJECT ${requestId} ${project.root}`;
    const request = {
      schema_version: ROUTER_SCHEMA_VERSION,
      request_id: requestId,
      project: publicProject(project),
      persistence,
      duration_minutes: durationMinutes,
      expires_at: new Date(Date.now() + durationMinutes * 60_000).toISOString(),
      exact_access_boundary: project.root,
      material_risks: ["VNEM Tools may inspect or perform separately approved actions only inside this exact canonical project root.", "Existing secret-path and hard-action blocks remain active."],
      exact_acknowledgment: acknowledgment,
      created_at: new Date().toISOString()
    };
    this.requests.set(requestId, request);
    await this.audit("approval_requested", { request_id: requestId, project_id: project.project_id, root: project.root, persistence });
    return request;
  }

  async activateApproval(options = {}) {
    const request = this.requests.get(String(options.request_id || ""));
    if (!request) throw new ProjectRouterError("Project approval request was not found in this Tools server session.", "project_approval_request_not_found");
    if (String(options.acknowledgment || "") !== request.exact_acknowledgment) {
      throw new ProjectRouterError("Exact project approval acknowledgment did not match.", "project_approval_acknowledgment_mismatch", { required_acknowledgment: request.exact_acknowledgment });
    }
    const record = {
      ...request.project,
      source: request.persistence === "persistent" ? "vnem_persistent_approval" : "vnem_session_approval",
      persistence: request.persistence,
      approved_at: new Date().toISOString(),
      expires_at: request.expires_at
    };
    if (request.persistence === "persistent") {
      this.persistentApprovals.set(record.identity, record);
      await this.savePersistentApprovals();
    } else {
      this.sessionApprovals.set(record.identity, record);
    }
    this.requests.delete(request.request_id);
    await this.audit("approval_activated", { request_id: request.request_id, project_id: record.project_id, root: record.root, persistence: record.persistence });
    return { ok: true, project: publicProject(record), persistence: record.persistence, expires_at: record.expires_at, hard_blocks_retained: true };
  }

  async revoke(options = {}) {
    this.pruneExpired();
    const requested = String(options.project_id || options.root || "").trim();
    if (!requested) throw new ProjectRouterError("A project id or exact root is required for revocation.", "project_revoke_target_required");
    let identity = null;
    if (options.root) {
      const inspected = await inspectProjectRoot(options.root, { platform: this.platform, source: "revocation" });
      identity = inspected.identity;
    } else {
      identity = [...this.sessionApprovals.values(), ...this.persistentApprovals.values()].find((item) => item.project_id === requested)?.identity || null;
    }
    const sessionRemoved = identity ? this.sessionApprovals.delete(identity) : false;
    const persistentRemoved = identity ? this.persistentApprovals.delete(identity) : false;
    if (persistentRemoved) await this.savePersistentApprovals();
    const deselected = Boolean(identity && this.selected?.identity === identity);
    if (deselected) this.selected = null;
    const trusted = identity ? (await this.discoverCodexTrustedProjects()).projects.some((item) => item.identity === identity) : false;
    const result = {
      ok: sessionRemoved || persistentRemoved,
      project_id: requested,
      session_approval_removed: sessionRemoved,
      persistent_approval_removed: persistentRemoved,
      selected_project_cleared: deselected,
      still_authorized_by_codex_trust: trusted,
      access_denied_after_revocation: !trusted
    };
    await this.audit("approval_revoked", result);
    return result;
  }

  async select(input, options = {}) {
    const authorization = await this.authorizationCheck(input);
    if (!authorization.authorized) throw new ProjectRouterError(authorization.reason, authorization.code, authorization);
    const previous = this.selected;
    const project = await inspectProjectRoot(authorization.project.root, { platform: this.platform, source: authorization.authorization_source });
    this.selected = project;
    try {
      if (this.selectionHook) await this.selectionHook(publicProject(project));
    } catch (error) {
      this.selected = previous;
      throw error;
    }
    await this.ensureProjectState(project);
    await this.audit("project_selected", { project_id: project.project_id, root: project.root, source: authorization.authorization_source, reason: options.reason || "explicit_selection" });
    return {
      selected: true,
      project: publicProject(project),
      authorization_source: authorization.authorization_source,
      evidence_root: this.evidenceRoot(project),
      switched_from_project_id: previous?.project_id || null,
      selection_broadens_authorization: false
    };
  }

  async resolveForToolCall(args = {}) {
    const explicit = [args.project_root, args.workspace_root, args.repo_path, args.root, args.project_dir]
      .find((value) => typeof value === "string" && value.trim() && value.trim() !== ".");
    if (explicit) {
      const candidate = path.isAbsolute(explicit)
        ? explicit
        : this.selected ? path.resolve(this.selected.root, explicit) : explicit;
      return (await this.select(candidate, { reason: "explicit_tool_root" })).project;
    }
    if (!this.selected) {
      throw new ProjectRouterError("No project is selected in global VNEM mode.", "project_not_selected", {
        safe_next_action: "Call vnem_tools_project_select with an exact trusted or approved project root."
      });
    }
    const authorization = await this.authorizationCheck(this.selected.root);
    if (!authorization.authorized) {
      this.selected = null;
      throw new ProjectRouterError("The selected project is no longer authorized.", "selected_project_no_longer_authorized", authorization);
    }
    return publicProject(this.selected);
  }

  async status() {
    this.pruneExpired();
    const trusted = await this.discoverCodexTrustedProjects();
    const effective = this.selected ? await this.effectiveProfile(this.selected) : {
      global_profile: this.globalProfileName(),
      project_profile_narrowing: null,
      effective_profile: this.globalProfileName(),
      invalid_broadening_ignored: false
    };
    return {
      schema_version: ROUTER_SCHEMA_VERSION,
      mode: "codex-global",
      core_globally_registered: trusted.registrations.core,
      tools_globally_registered: trusted.registrations.tools,
      dynamic_project_routing_active: true,
      global_profile: effective.global_profile,
      project_specific_profile_narrowing: effective.project_profile_narrowing,
      effective_profile: effective.effective_profile,
      selected_project: this.selectedProject(),
      codex_trusted_projects: trusted.projects,
      explicit_session_approvals: [...this.sessionApprovals.values()].map(publicProject),
      explicit_persistent_approvals: [...this.persistentApprovals.values()].map(publicProject),
      denied_project_attempts: this.deniedAttempts.slice(-20),
      evidence_namespace: this.selected ? this.evidenceRoot(this.selected) : path.join(this.stateRoot, "projects", "<project-id>", "tool-runs"),
      state_root: this.stateRoot,
      global_hard_blocks: "retained by the shared permission runtime and not overridable by project approval",
      codex_configuration_health: trusted.health,
      global_state_health: { ok: this.stateIssues.length === 0, issues: this.stateIssues },
      core_runtime_health: {
        status: trusted.registrations.core ? "registered_not_probed_by_tools" : "not_registered",
        limitation: "The Tools server cannot truthfully probe the independent Core process from this local status call."
      },
      tools_runtime_health: { status: "responding", project_router_initialized: true },
      migration_state: this.globalConfig.migration_state || "unknown",
      secrets_in_output: false
    };
  }

  async doctor() {
    const status = await this.status();
    const issues = [];
    if (!status.core_globally_registered) issues.push({ code: "core_not_registered" });
    if (!status.tools_globally_registered) issues.push({ code: "tools_not_registered" });
    if (!status.codex_configuration_health.ok) issues.push({ code: status.codex_configuration_health.code });
    if (!status.global_state_health.ok) issues.push(...status.global_state_health.issues);
    if (!existsSync(this.globalConfigPath)) issues.push({ code: "global_router_config_missing" });
    if (!existsSync(this.approvalsPath)) issues.push({ code: "project_approval_registry_missing" });
    return {
      ok: issues.length === 0,
      mode: status.mode,
      issues,
      selected_project: status.selected_project,
      trusted_project_count: status.codex_trusted_projects.length,
      explicit_approval_count: status.explicit_session_approvals.length + status.explicit_persistent_approvals.length,
      evidence_namespace: status.evidence_namespace,
      global_profile: status.global_profile,
      hard_blocks_intact: true,
      codex_configuration_health: status.codex_configuration_health,
      migration_state: status.migration_state
    };
  }

  pruneExpired() {
    for (const [identity, record] of this.sessionApprovals) if (isExpired(record)) this.sessionApprovals.delete(identity);
    for (const [identity, record] of this.persistentApprovals) if (isExpired(record)) this.persistentApprovals.delete(identity);
  }

  async savePersistentApprovals() {
    const payload = {
      schema_version: ROUTER_SCHEMA_VERSION,
      projects: [...this.persistentApprovals.values()].sort((a, b) => comparePaths(a.root, b.root))
    };
    await atomicWrite(this.approvalsPath, `${JSON.stringify(payload, null, 2)}\n`);
  }

  async audit(event, details = {}) {
    const entry = {
      schema_version: ROUTER_SCHEMA_VERSION,
      event,
      at: new Date().toISOString(),
      ...sanitizeAudit(details)
    };
    await mkdir(path.dirname(this.auditPath), { recursive: true });
    await appendFile(this.auditPath, `${JSON.stringify(entry)}\n`, { encoding: "utf8", mode: 0o600 });
  }
}

export async function inspectProjectRoot(input, options = {}) {
  const inspected = await inspectExistingPath(input, options);
  const info = await stat(inspected.root);
  if (!info.isDirectory()) throw new ProjectRouterError("Project root must be a directory.", "project_root_not_directory", { root: inspected.root });
  return {
    schema_version: ROUTER_SCHEMA_VERSION,
    project_id: stableProjectId(inspected.identity),
    root: inspected.root,
    identity: inspected.identity,
    source: options.source || "unknown"
  };
}

export function stableProjectId(identity) {
  return createHash("sha256").update(String(identity)).digest("hex").slice(0, 24);
}

export function defaultGlobalConfig(profile = "safe-readonly") {
  return {
    schema_version: ROUTER_SCHEMA_VERSION,
    mode: "codex-global",
    global_profile: resolvePermissionProfile(profile || "safe-readonly").profile_name,
    migration_state: "dynamic-routing-active",
    hard_blocks_removable: false,
    evidence_strategy: "global-namespaced-by-canonical-project-id"
  };
}

export function defaultApprovals() {
  return { schema_version: ROUTER_SCHEMA_VERSION, projects: [] };
}

async function inspectExistingPath(input, options = {}) {
  const raw = String(input || "").trim();
  if (!raw) throw new ProjectRouterError("A project path is required.", "project_path_required");
  if (!path.isAbsolute(raw)) throw new ProjectRouterError("Project paths must be absolute in global mode.", "project_path_must_be_absolute", { path: raw });
  const absolute = path.resolve(raw);
  let resolved;
  try {
    resolved = await realpath(absolute);
  } catch {
    throw new ProjectRouterError("Project path does not exist or is unreadable.", "project_path_missing", { path: absolute });
  }
  return { root: resolved, identity: canonicalIdentity(resolved, options.platform || process.platform) };
}

function canonicalIdentity(value, platform) {
  const normalized = path.normalize(path.resolve(value)).replace(/[\\/]+$/, "");
  return platform === "win32" ? normalized.toLowerCase() : normalized;
}

function publicProject(project) {
  return {
    project_id: project.project_id,
    root: project.root,
    identity: project.identity,
    source: project.source,
    persistence: project.persistence || null,
    approved_at: project.approved_at || null,
    expires_at: project.expires_at || null
  };
}

function requireProject(project) {
  if (!project?.project_id || !project?.root) throw new ProjectRouterError("Project context is required.", "project_context_required");
  return project;
}

function registrationsFrom(parsed) {
  const servers = parsed?.mcp_servers && typeof parsed.mcp_servers === "object" ? parsed.mcp_servers : {};
  return { core: Boolean(servers.vnem), tools: Boolean(servers["vnem-tools"]) };
}

function broadRootIssues(root, home, platform = process.platform) {
  const resolved = path.resolve(root);
  const issues = [];
  if (resolved === path.parse(resolved).root) issues.push("filesystem_or_drive_root");
  if (home && canonicalIdentity(resolved, platform) === canonicalIdentity(home, platform)) issues.push("whole_user_home");
  const segments = resolved.slice(path.parse(resolved).root.length).split(path.sep).filter(Boolean);
  if (segments.length < 2) issues.push("dangerously_broad_parent");
  return issues;
}

function insidePath(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function pathDepth(value) {
  return path.resolve(value).split(path.sep).filter(Boolean).length;
}

function comparePaths(left, right) {
  return String(left).localeCompare(String(right), undefined, { sensitivity: "base" });
}

function clampMinutes(value, maximum) {
  const parsed = Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : 60;
  return Math.max(1, Math.min(maximum, parsed));
}

function isExpired(record) {
  return Boolean(record?.expires_at && Date.parse(record.expires_at) <= Date.now());
}

function sanitizeAudit(value) {
  if (Array.isArray(value)) return value.map(sanitizeAudit);
  if (!value || typeof value !== "object") return typeof value === "string" ? value.slice(0, 1000) : value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !/acknowledgment|token|secret|cookie|session_value|config_text/i.test(key))
    .map(([key, child]) => [key, sanitizeAudit(child)]));
}

async function readJson(filePath, fallback, code) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw new ProjectRouterError("Global VNEM project state is invalid or unreadable.", code, { path: filePath });
  }
}

async function atomicWrite(filePath, text) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${randomUUID().slice(0, 8)}.tmp`;
  await writeFile(temporary, text, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, filePath);
}
