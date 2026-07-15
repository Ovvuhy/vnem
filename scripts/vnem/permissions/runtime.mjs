import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  HARD_BLOCKED_ACTIONS,
  allKnownActions,
  buildPermissionProfiles,
  capabilityForAction,
  normalizeActionType,
  resolvePermissionProfile
} from "./profiles.mjs";

const CONFIG_SCHEMA_VERSION = "1.0.0";
const MAX_GRANT_MINUTES = 24 * 60;

export class PermissionRuntimeError extends Error {
  constructor(message, code = "permission_runtime_error", details = {}) {
    super(message);
    this.name = "PermissionRuntimeError";
    this.code = code;
    this.details = details;
  }
}

export class PermissionRuntime {
  constructor(options = {}) {
    this.workspaceRoot = path.resolve(options.workspaceRoot || process.cwd());
    this.allowedRoots = (options.allowedRoots || [this.workspaceRoot]).map((item) => path.resolve(item));
    this.configPath = options.configPath || path.join(this.workspaceRoot, ".vnem", "safety.json");
    this.backupRoot = options.backupRoot || path.join(this.workspaceRoot, ".vnem", "safety-backups");
    this.profileOverride = options.profileName || null;
    this.requests = new Map();
    this.sessionGrants = new Map();
    this.config = defaultSafetyConfig();
  }

  static async create(options = {}) {
    const runtime = new PermissionRuntime(options);
    runtime.config = await loadSafetyConfig(runtime.workspaceRoot, { configPath: runtime.configPath });
    return runtime;
  }

  activeProfile() {
    return resolvePermissionProfile(this.profileOverride || this.config.profile, {
      customAllowedActions: this.config.custom_allowed_actions
    });
  }

  profiles() {
    return buildPermissionProfiles({ customAllowedActions: this.config.custom_allowed_actions });
  }

  status() {
    this.pruneExpired();
    const profile = this.activeProfile();
    return {
      schema_version: CONFIG_SCHEMA_VERSION,
      profile,
      configured_by: this.profileOverride ? "environment_override" : existsSync(this.configPath) ? normalizeRelative(path.relative(this.workspaceRoot, this.configPath)) : "safe_default",
      workspace_root: this.workspaceRoot,
      allowed_roots: this.allowedRoots,
      session_grants: [...this.sessionGrants.values()].map(publicGrant),
      persistent_grants: (this.config.persistent_grants || []).filter(notExpired).map(publicGrant),
      hard_blocked_actions: [...HARD_BLOCKED_ACTIONS].sort(),
      config_path: normalizeRelative(path.relative(this.workspaceRoot, this.configPath)),
      backup_root: normalizeRelative(path.relative(this.workspaceRoot, this.backupRoot)),
      custom_allowed_actions: this.config.custom_allowed_actions || []
    };
  }

  requestGrant(options = {}) {
    const actions = uniqueActions(options.actions || [options.action]);
    if (!actions.length) throw new PermissionRuntimeError("At least one scoped action is required.", "permission_actions_required");
    const hardBlocked = actions.filter((action) => HARD_BLOCKED_ACTIONS.has(action));
    if (hardBlocked.length) {
      throw new PermissionRuntimeError("Hard-blocked actions cannot be requested through scoped grants.", "permission_hard_blocked", {
        hard_blocked_actions: hardBlocked,
        safer_alternative: "Use a non-destructive bounded action or a user-provided redacted input."
      });
    }
    const durationMinutes = clampMinutes(options.duration_minutes || 60);
    const persistent = options.persistence === "persistent";
    const scope = normalizeScope(options.scope, this.workspaceRoot, this.allowedRoots);
    const requestId = `grant-${randomUUID()}`;
    const acknowledgment = `I APPROVE VNEM ${persistent ? "PERSISTENT " : "SESSION "}GRANT ${requestId}`;
    const request = {
      schema_version: CONFIG_SCHEMA_VERSION,
      request_id: requestId,
      actions,
      capability_categories: [...new Set(actions.map(capabilityForAction))],
      scope,
      persistence: persistent ? "persistent" : "session",
      duration_minutes: durationMinutes,
      reason: String(options.reason || "The current task requires this bounded capability."),
      material_risks: riskNotes(actions, persistent),
      changes_allowed: describeChanges(actions, scope),
      rollback: persistent
        ? "Revoke the grant or run vnem safety --rollback to restore the previous safety configuration."
        : "Revoke the grant or stop the current Tools MCP process; session grants are not written to disk.",
      safer_alternative: String(options.safer_alternative || "Keep the current profile and use dry-run/read-only planning."),
      exact_acknowledgment: acknowledgment,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + durationMinutes * 60_000).toISOString()
    };
    this.requests.set(requestId, request);
    return request;
  }

  async approveGrant(options = {}) {
    const request = this.requests.get(String(options.request_id || ""));
    if (!request) throw new PermissionRuntimeError("Scoped permission request was not found in this server session.", "permission_request_not_found");
    if (String(options.acknowledgment || "") !== request.exact_acknowledgment) {
      throw new PermissionRuntimeError("Exact scoped-grant acknowledgment did not match.", "permission_acknowledgment_mismatch", {
        required_acknowledgment: request.exact_acknowledgment
      });
    }
    const grant = {
      grant_id: request.request_id,
      actions: request.actions,
      capability_categories: request.capability_categories,
      scope: request.scope,
      persistence: request.persistence,
      reason: request.reason,
      approved_at: new Date().toISOString(),
      expires_at: request.expires_at,
      evidence_id: `permission-${request.request_id}`
    };
    if (request.persistence === "persistent") {
      await this.saveConfig({
        ...this.config,
        persistent_grants: [...(this.config.persistent_grants || []).filter((item) => item.grant_id !== grant.grant_id), grant]
      });
    } else {
      this.sessionGrants.set(grant.grant_id, grant);
    }
    this.requests.delete(request.request_id);
    return { ok: true, grant: publicGrant(grant), repeated_approval_required: false };
  }

  async revokeGrant(grantId) {
    const id = String(grantId || "");
    const sessionRemoved = this.sessionGrants.delete(id);
    const persistentBefore = this.config.persistent_grants || [];
    const persistentAfter = persistentBefore.filter((item) => item.grant_id !== id);
    if (persistentAfter.length !== persistentBefore.length) {
      await this.saveConfig({ ...this.config, persistent_grants: persistentAfter });
    }
    return { ok: sessionRemoved || persistentAfter.length !== persistentBefore.length, grant_id: id, session_removed: sessionRemoved, persistent_removed: persistentAfter.length !== persistentBefore.length };
  }

  evaluate(options = {}) {
    this.pruneExpired();
    const action = normalizeActionType(options.action);
    if (HARD_BLOCKED_ACTIONS.has(action)) {
      return decision(action, false, true, "hard_block", null, this.activeProfile(), "Action remains hard-blocked in every profile and scoped grant.");
    }
    const profile = this.activeProfile();
    if (profile.profile_name === "dangerous-disabled") {
      return decision(action, false, true, "profile", null, profile, "All actions are disabled by the active profile.");
    }
    const grant = this.matchingGrant(action, options);
    if (grant) return decision(action, true, false, "scoped_grant", grant, profile, "Allowed by an active exact scoped grant; no per-call reapproval is required inside scope.");
    if (profile.allowed_actions.includes(action) && !profile.blocked_actions.includes(action)) {
      const approvalRequired = profile.requires_approval_actions.includes(action);
      return decision(action, true, approvalRequired, "profile", null, profile, approvalRequired ? "Allowed by profile with explicit per-call approval." : "Allowed by active profile.");
    }
    return decision(action, false, true, "profile", null, profile, `Blocked by active permission profile ${profile.profile_name}.`);
  }

  async setProfile(profileName, options = {}) {
    const requestedCustomActions = uniqueActions(options.custom_allowed_actions || this.config.custom_allowed_actions);
    const hardBlockedCustomActions = requestedCustomActions.filter((action) => HARD_BLOCKED_ACTIONS.has(action));
    if (profileName === "custom" && hardBlockedCustomActions.length) {
      throw new PermissionRuntimeError("Custom profiles cannot enable hard-blocked actions.", "permission_custom_hard_blocked", {
        hard_blocked_actions: hardBlockedCustomActions
      });
    }
    const profile = resolvePermissionProfile(profileName, { customAllowedActions: options.custom_allowed_actions || this.config.custom_allowed_actions });
    if (profile.profile_name !== profileName) throw new PermissionRuntimeError(`Unknown permission profile: ${profileName}`, "permission_profile_unknown");
    const next = {
      ...this.config,
      profile: profile.profile_name,
      custom_allowed_actions: profile.profile_name === "custom" ? requestedCustomActions : this.config.custom_allowed_actions,
      updated_at: new Date().toISOString()
    };
    if (options.persist === false) {
      this.profileOverride = profile.profile_name;
      return { ok: true, persisted: false, profile, preview: this.previewConfig(next) };
    }
    const backup = await this.saveConfig(next);
    return { ok: true, persisted: true, profile: this.activeProfile(), backup, preview: this.previewConfig(next) };
  }

  previewConfig(config = this.config) {
    const profile = resolvePermissionProfile(config.profile, { customAllowedActions: config.custom_allowed_actions });
    return {
      profile: profile.profile_name,
      power_level: profile.power_level,
      risk_level: profile.risk_level,
      enabled_categories: Object.entries(profile.capability_categories).filter(([, value]) => value.enabled).map(([name]) => name),
      hard_blocked_actions: [...HARD_BLOCKED_ACTIONS].sort(),
      persistent_grant_count: (config.persistent_grants || []).filter(notExpired).length,
      config_path: normalizeRelative(path.relative(this.workspaceRoot, this.configPath))
    };
  }

  async saveConfig(nextConfig) {
    await mkdir(path.dirname(this.configPath), { recursive: true });
    await mkdir(this.backupRoot, { recursive: true });
    let backupPath = null;
    if (existsSync(this.configPath)) {
      backupPath = path.join(this.backupRoot, `safety-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
      await copyFile(this.configPath, backupPath);
    }
    const normalized = sanitizeConfig(nextConfig);
    const temporary = `${this.configPath}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
    await rename(temporary, this.configPath);
    this.config = normalized;
    return backupPath ? normalizeRelative(path.relative(this.workspaceRoot, backupPath)) : null;
  }

  async rollbackLatestConfig() {
    if (!existsSync(this.backupRoot)) throw new PermissionRuntimeError("No safety configuration backup exists.", "permission_backup_not_found");
    const backups = (await readdir(this.backupRoot)).filter((name) => /^safety-.*\.json$/.test(name)).sort().reverse();
    if (!backups.length) throw new PermissionRuntimeError("No safety configuration backup exists.", "permission_backup_not_found");
    const source = path.join(this.backupRoot, backups[0]);
    const parsed = sanitizeConfig(JSON.parse(await readFile(source, "utf8")));
    const currentBackup = await this.saveConfig(parsed);
    return { ok: true, restored_from: normalizeRelative(path.relative(this.workspaceRoot, source)), current_backup: currentBackup, profile: this.activeProfile() };
  }

  doctor() {
    const issues = [];
    const known = new Set(allKnownActions());
    if (!this.profiles().some((item) => item.profile_name === this.config.profile)) issues.push({ code: "unknown_profile", value: this.config.profile });
    for (const action of this.config.custom_allowed_actions || []) {
      if (!known.has(action)) issues.push({ code: "unknown_custom_action", value: action });
      if (HARD_BLOCKED_ACTIONS.has(action)) issues.push({ code: "hard_block_in_custom_profile", value: action });
    }
    for (const grant of this.config.persistent_grants || []) {
      for (const action of grant.actions || []) {
        if (!known.has(action)) issues.push({ code: "unknown_grant_action", grant_id: grant.grant_id, value: action });
        if (HARD_BLOCKED_ACTIONS.has(action)) issues.push({ code: "hard_block_in_persistent_grant", grant_id: grant.grant_id, value: action });
      }
      if (grant.scope?.workspace_root && !insideAny(grant.scope.workspace_root, this.allowedRoots)) {
        issues.push({ code: "grant_scope_outside_allowed_roots", grant_id: grant.grant_id, value: grant.scope.workspace_root });
      }
    }
    return {
      ok: issues.length === 0,
      config_exists: existsSync(this.configPath),
      config_path: normalizeRelative(path.relative(this.workspaceRoot, this.configPath)),
      profile: this.activeProfile().profile_name,
      issues,
      backup_available: existsSync(this.backupRoot),
      hard_blocks_intact: !issues.some((item) => /hard_block/.test(item.code))
    };
  }

  matchingGrant(action, options = {}) {
    const grants = [...this.sessionGrants.values(), ...(this.config.persistent_grants || [])].filter(notExpired);
    return grants.find((grant) => grant.actions.includes(action) && scopeMatches(grant.scope, options, this.allowedRoots)) || null;
  }

  pruneExpired() {
    for (const [id, grant] of this.sessionGrants) if (!notExpired(grant)) this.sessionGrants.delete(id);
  }
}

export async function loadSafetyConfig(workspaceRoot, options = {}) {
  const configPath = options.configPath || path.join(path.resolve(workspaceRoot || process.cwd()), ".vnem", "safety.json");
  try {
    return sanitizeConfig(JSON.parse(await readFile(configPath, "utf8")));
  } catch (error) {
    if (error?.code === "ENOENT") return defaultSafetyConfig();
    throw new PermissionRuntimeError("Safety configuration is invalid JSON or unreadable.", "permission_config_invalid", { config_path: configPath });
  }
}

function defaultSafetyConfig() {
  return { schema_version: CONFIG_SCHEMA_VERSION, profile: "safe-readonly", custom_allowed_actions: [], persistent_grants: [], updated_at: null };
}

function sanitizeConfig(config = {}) {
  return {
    schema_version: CONFIG_SCHEMA_VERSION,
    profile: String(config.profile || "safe-readonly"),
    custom_allowed_actions: uniqueActions(config.custom_allowed_actions),
    persistent_grants: Array.isArray(config.persistent_grants) ? config.persistent_grants.map((grant) => ({
      grant_id: String(grant.grant_id || ""),
      actions: uniqueActions(grant.actions),
      capability_categories: [...new Set((grant.capability_categories || []).map(String))],
      scope: normalizeStoredScope(grant.scope),
      persistence: "persistent",
      reason: String(grant.reason || ""),
      approved_at: grant.approved_at || null,
      expires_at: grant.expires_at || null,
      evidence_id: grant.evidence_id || null
    })).filter((grant) => grant.grant_id && grant.actions.length) : [],
    updated_at: config.updated_at || null
  };
}

function normalizeScope(scope = {}, workspaceRoot, allowedRoots) {
  const pathPrefixes = (scope.path_prefixes || scope.paths || []).map((item) => {
    const absolute = path.isAbsolute(item) ? path.resolve(item) : path.resolve(workspaceRoot, item);
    if (!insideAny(absolute, allowedRoots)) throw new PermissionRuntimeError("Scoped path is outside allowed roots.", "permission_scope_outside_allowed_roots", { path: item });
    return normalizeRelative(path.relative(workspaceRoot, absolute)) || ".";
  });
  return normalizeStoredScope({
    workspace_root: workspaceRoot,
    path_prefixes: pathPrefixes,
    repositories: scope.repositories,
    branches: scope.branches,
    providers: scope.providers,
    domains: scope.domains
  });
}

function normalizeStoredScope(scope = {}) {
  return {
    workspace_root: scope.workspace_root ? path.resolve(scope.workspace_root) : null,
    path_prefixes: uniqueStrings(scope.path_prefixes),
    repositories: uniqueStrings(scope.repositories),
    branches: uniqueStrings(scope.branches),
    providers: uniqueStrings(scope.providers),
    domains: uniqueStrings(scope.domains).map((item) => item.toLowerCase())
  };
}

function scopeMatches(scope = {}, options = {}, allowedRoots) {
  if (scope.workspace_root && !insideAny(scope.workspace_root, allowedRoots)) return false;
  if (scope.path_prefixes?.length) {
    const base = scope.workspace_root || allowedRoots[0];
    const rawTarget = options.target_path || options.path || options.workspace_root || base;
    const target = path.isAbsolute(rawTarget) ? path.resolve(rawTarget) : path.resolve(base, rawTarget);
    if (!scope.path_prefixes.some((prefix) => insidePath(path.resolve(base, prefix), target))) return false;
  }
  for (const [scopeKey, optionKey] of [["repositories", "repository"], ["branches", "branch"], ["providers", "provider"]]) {
    if (scope[scopeKey]?.length && !scope[scopeKey].includes(String(options[optionKey] || ""))) return false;
  }
  if (scope.domains?.length) {
    let domain = String(options.domain || "").toLowerCase();
    if (!domain && options.url) {
      try { domain = new URL(options.url).hostname.toLowerCase(); } catch { return false; }
    }
    if (!scope.domains.includes(domain)) return false;
  }
  return true;
}

function decision(action, allowed, approvalRequired, source, grant, profile, reason) {
  return {
    action,
    capability_category: capabilityForAction(action),
    allowed,
    blocked: !allowed,
    approval_required: approvalRequired,
    decision_source: source,
    grant: grant ? publicGrant(grant) : null,
    profile: profile.profile_name,
    reason,
    hard_blocked: source === "hard_block",
    safe_next_action: allowed
      ? approvalRequired ? "Request explicit per-call approval or an exact scoped grant before execution." : "Proceed only inside the declared scope and retain redacted evidence."
      : source === "hard_block" ? "Use a non-destructive bounded alternative; this action cannot be granted." : "Request one narrow session grant or select an appropriate profile."
  };
}

function publicGrant(grant) {
  return {
    grant_id: grant.grant_id,
    actions: grant.actions,
    capability_categories: grant.capability_categories,
    scope: grant.scope,
    persistence: grant.persistence,
    reason: grant.reason,
    approved_at: grant.approved_at,
    expires_at: grant.expires_at,
    evidence_id: grant.evidence_id
  };
}

function riskNotes(actions, persistent) {
  const notes = [];
  if (actions.some((action) => /write|patch|commit|mutation|install|execute|action/.test(action))) notes.push("The grant may change local or remote state inside its exact scope.");
  if (actions.some((action) => /network|fetch|api|github|cloudflare/.test(action))) notes.push("The grant may send bounded metadata to the named provider or domain.");
  if (persistent) notes.push("Persistent grants survive server restarts until expiry or revocation.");
  return notes.length ? notes : ["The grant expands current permissions only for the listed action and scope."];
}

function describeChanges(actions, scope) {
  return { actions, path_prefixes: scope.path_prefixes, repositories: scope.repositories, branches: scope.branches, providers: scope.providers, domains: scope.domains };
}

function notExpired(grant) {
  return !grant.expires_at || Date.parse(grant.expires_at) > Date.now();
}

function clampMinutes(value) {
  const parsed = Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : 60;
  return Math.max(1, Math.min(MAX_GRANT_MINUTES, parsed));
}

function uniqueActions(values = []) {
  return [...new Set((values || []).filter(Boolean).map(normalizeActionType))];
}

function uniqueStrings(values = []) {
  return [...new Set((values || []).filter(Boolean).map((item) => String(item).trim()).filter(Boolean))];
}

function insideAny(candidate, roots) {
  return roots.some((root) => insidePath(root, candidate));
}

function insidePath(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function normalizeRelative(value) {
  return String(value || "").replace(/\\/g, "/");
}
