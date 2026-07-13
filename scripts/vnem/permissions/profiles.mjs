export const PERMISSION_CAPABILITIES = Object.freeze({
  filesystem: ["read_file", "search_code", "inspect_workspace", "dependency_scan", "apply_patch", "restore_backup", "temp_cleanup"],
  commands: ["run_test", "run_build", "start_dev_server", "execute_script", "run_custom_command"],
  packages: ["package_install", "package_publish"],
  browser: ["browser_capture", "browser_interaction"],
  network: ["external_fetch", "download_check", "api_call", "external_api_mutation"],
  git: ["git_status", "local_commit", "git_branch", "git_push", "force_push", "protected_branch_write"],
  github: ["github_read", "github_issue", "github_pr", "github_actions", "github_release", "github_settings", "repo_delete"],
  cloudflare: ["cloudflare_read", "cloudflare_mutation", "cloudflare_destructive"],
  database: ["database_read", "database_write"],
  skills: ["skill_inspect", "skill_execute"],
  local_pc: ["local_pc_read", "local_pc_action", "root_level_delete", "disable_security_product", "hidden_persistence"],
  games: ["game_inspect", "game_config_write", "game_launch"],
  safety: ["permission_status", "trust_boundary_classify", "action_policy_preview", "evidence_pack_audit", "mutation_approval_contract", "secret_redaction_check"]
});

export const HARD_BLOCKED_ACTIONS = new Set([
  "secret_output",
  "secret_read",
  "credential_theft",
  "cookie_session_access",
  "captcha_bypass",
  "unknown_malware_execution",
  "repo_delete",
  "force_push",
  "root_level_delete",
  "destructive_shell",
  "protected_branch_write",
  "hidden_persistence",
  "disable_security_product",
  "silent_telemetry",
  "package_publish",
  "unrestricted_crawl",
  "unrestricted_filesystem_crawl",
  "silent_account_mutation",
  "malware_like_behavior"
]);

export const ACTION_ALIASES = Object.freeze({
  write_file: "apply_patch",
  patch: "apply_patch",
  commit: "local_commit",
  git_commit: "local_commit",
  run_command: "run_test",
  run_project_task: "run_test",
  reviewed_custom_command: "run_custom_command",
  cleanup_temp: "temp_cleanup",
  fetch_url_text: "external_fetch",
  web_search: "external_fetch",
  download_safety_check: "download_check",
  cloudflare_status: "cloudflare_read",
  cloudflare_discovery: "cloudflare_read",
  cloudflare_deploy: "cloudflare_mutation",
  cloudflare_pages_deploy: "cloudflare_mutation",
  cloudflare_workers_deploy: "cloudflare_mutation",
  cloudflare_dns: "cloudflare_mutation",
  cloudflare_dns_delete: "cloudflare_destructive",
  cloudflare_env: "cloudflare_mutation",
  cloudflare_secret: "cloudflare_mutation",
  cloudflare_rollback: "cloudflare_destructive",
  cloudflare_cache_purge: "cloudflare_mutation",
  evidence_pack_audit: "evidence_pack_audit",
  mutation_approval_contract: "mutation_approval_contract",
  secret_redaction_check: "secret_redaction_check"
});

const DANGEROUS = [...HARD_BLOCKED_ACTIONS];
const READ_ACTIONS = [
  "read_file", "search_code", "inspect_workspace", "dependency_scan", "permission_status",
  "trust_boundary_classify", "action_policy_preview", "cloudflare_read", "github_read", "git_status",
  "database_read", "skill_inspect", "local_pc_read", "game_inspect", "evidence_pack_audit",
  "mutation_approval_contract", "secret_redaction_check"
];
const LOCAL_DEV_ACTIONS = [...READ_ACTIONS, "run_test", "run_build", "start_dev_server", "execute_script", "browser_capture", "download_check", "external_fetch"];
const WRITE_ACTIONS = [...LOCAL_DEV_ACTIONS, "apply_patch", "restore_backup", "temp_cleanup", "local_commit", "git_branch", "database_write", "game_config_write"];

export function buildPermissionProfiles(options = {}) {
  const custom = new Set((options.customAllowedActions || []).map(normalizeActionType));
  const profiles = [
    profile("safe-readonly", "Default public profile: inspect metadata/files/code only; no real writes, commands, network fetches, browser captures, dev servers, commits, installs, GitHub mutation, or account actions.", {
      power_level: 1,
      risk_level: "low",
      allowed_actions: READ_ACTIONS,
      blocked_actions: [...allKnownActions().filter((action) => !READ_ACTIONS.includes(action)), ...DANGEROUS],
      public_default_safe: true,
      network_policy: "No live external network or browser capture by default; dry-run planning only.",
      command_policy: "No real project tasks/commands in safe-readonly; inspect package scripts only."
    }),
    profile("safe-local-dev", "Local development profile: read-only plus approved allowlisted diagnostics/tests/builds/dev-server/localhost proof; no file writes or local commits.", {
      power_level: 2,
      risk_level: "low-medium",
      allowed_actions: LOCAL_DEV_ACTIONS,
      blocked_actions: ["apply_patch", "restore_backup", "local_commit", "git_push", "package_install", "github_issue", "github_pr", "github_actions", "github_settings", "cloudflare_mutation", "cloudflare_destructive", "database_write", "skill_execute", "local_pc_action", "game_config_write", "game_launch", ...DANGEROUS],
      requires_approval_actions: ["run_test", "run_build", "start_dev_server", "browser_capture", "download_check", "external_fetch"],
      network_policy: "Approved localhost proof and direct-source GET/HEAD/search-provider flows only; no broad crawling or login/session use."
    }),
    profile("approved-writes", "Approved local write profile: allows patch/file writes, restores, allowlisted tests/builds/dev-server/browser localhost proof, and local commits only with explicit approval/evidence/rollback.", {
      power_level: 3,
      risk_level: "medium",
      allowed_actions: WRITE_ACTIONS,
      blocked_actions: ["package_install", "package_publish", "git_push", "github_issue", "github_pr", "github_actions", "github_settings", "cloudflare_destructive", "skill_execute", "local_pc_action", "game_launch", ...DANGEROUS],
      requires_approval_actions: WRITE_ACTIONS.filter((action) => !READ_ACTIONS.includes(action)),
      rollback_policy: "Patch and database writes require transaction evidence or backups; local commits use explicit file lists only."
    }),
    profile("approved-installs", "Compatibility profile for reviewed repository-local dependency installation. Publishing and unknown installers remain hard-blocked.", {
      power_level: 4,
      risk_level: "medium-high",
      allowed_actions: [...WRITE_ACTIONS, "package_install"],
      blocked_actions: ["package_publish", "git_push", "github_settings", "cloudflare_destructive", ...DANGEROUS],
      requires_approval_actions: [...WRITE_ACTIONS.filter((action) => !READ_ACTIONS.includes(action)), "package_install"],
      package_policy: "Only reviewed repository-local package-manager installation is grantable; unknown installers, lifecycle surprises, publishing, and global installs remain blocked."
    }),
    profile("approved-github", "Compatibility profile for approved feature-branch GitHub workflows with auth, secret, protected-branch, force-push, and repository-deletion gates.", {
      power_level: 4,
      risk_level: "medium-high",
      allowed_actions: [...WRITE_ACTIONS, "git_push", "github_issue", "github_pr", "github_actions", "github_release"],
      blocked_actions: ["package_publish", "github_settings", "cloudflare_destructive", ...DANGEROUS],
      requires_approval_actions: [...WRITE_ACTIONS.filter((action) => !READ_ACTIONS.includes(action)), "git_push", "github_issue", "github_pr", "github_actions", "github_release"],
      github_policy: "Feature-branch issue/PR/Actions workflows are approval-gated; settings, protected branches, force-push, and repo deletion remain blocked."
    }),
    profile("creator-power", "Creator/developer profile with broad repository-local execution while hard protections remain active.", {
      power_level: 5,
      risk_level: "high",
      allowed_actions: [...WRITE_ACTIONS, "run_custom_command", "package_install", "git_push", "github_issue", "github_pr", "github_actions", "github_release", "api_call", "external_api_mutation", "cloudflare_mutation", "cloudflare_destructive", "skill_execute", "local_pc_action", "game_launch"],
      blocked_actions: DANGEROUS,
      requires_approval_actions: allKnownActions().filter((action) => !READ_ACTIONS.includes(action) && !HARD_BLOCKED_ACTIONS.has(action)),
      creator_only: true
    }),
    profile("maintainer", "Repository maintainer profile for approved local writes, tests, feature-branch Git/GitHub work, CI, and release preparation without protected-branch or admin mutation.", {
      power_level: 5,
      risk_level: "high",
      allowed_actions: [...WRITE_ACTIONS, "run_custom_command", "package_install", "git_push", "github_issue", "github_pr", "github_actions", "github_release", "api_call", "external_api_mutation", "cloudflare_mutation", "skill_execute"],
      blocked_actions: ["github_settings", "cloudflare_destructive", "local_pc_action", "game_launch", ...DANGEROUS],
      requires_approval_actions: allKnownActions().filter((action) => !READ_ACTIONS.includes(action) && !HARD_BLOCKED_ACTIONS.has(action))
    }),
    profile("expert", "Expert profile for broad explicitly approved development and operations. Every high-impact action still requires evidence, rollback, and hard-block enforcement.", {
      power_level: 6,
      risk_level: "very-high",
      allowed_actions: allKnownActions().filter((action) => !HARD_BLOCKED_ACTIONS.has(action)),
      blocked_actions: DANGEROUS,
      requires_approval_actions: allKnownActions().filter((action) => !READ_ACTIONS.includes(action) && !HARD_BLOCKED_ACTIONS.has(action))
    }),
    profile("custom", "User-defined profile assembled from explicit capability categories and actions; hard blocks cannot be removed.", {
      power_level: 3,
      risk_level: "custom",
      allowed_actions: [...READ_ACTIONS, ...custom].filter((action) => !HARD_BLOCKED_ACTIONS.has(action)),
      blocked_actions: [...allKnownActions().filter((action) => !READ_ACTIONS.includes(action) && !custom.has(action)), ...DANGEROUS],
      requires_approval_actions: [...custom].filter((action) => !READ_ACTIONS.includes(action))
    }),
    profile("dangerous-disabled", "Hard-block policy profile documenting actions VNEM Tools MCP will not perform in public builds.", {
      power_level: 0,
      risk_level: "locked",
      allowed_actions: [],
      blocked_actions: allKnownActions(),
      risk_notes: ["All actions are disabled. Hard protections cannot be granted by a scoped permission."]
    })
  ];
  return profiles;
}

export function resolvePermissionProfile(name, options = {}) {
  const requested = String(name || "safe-readonly").trim() || "safe-readonly";
  const profiles = buildPermissionProfiles(options);
  return profiles.find((item) => item.profile_name === requested) || profiles[0];
}

export function normalizeActionType(value) {
  const normalized = String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  return ACTION_ALIASES[normalized] || normalized || "inspect_workspace";
}

export function allKnownActions() {
  return [...new Set(Object.values(PERMISSION_CAPABILITIES).flat().map(normalizeActionType))];
}

export function capabilityForAction(action) {
  const normalized = normalizeActionType(action);
  return Object.entries(PERMISSION_CAPABILITIES).find(([, actions]) => actions.includes(normalized))?.[0] || "other";
}

function profile(profile_name, description, options = {}) {
  const allowed = unique(options.allowed_actions).filter((action) => !HARD_BLOCKED_ACTIONS.has(action));
  return {
    profile_name,
    description,
    power_level: options.power_level ?? 1,
    risk_level: options.risk_level || "medium",
    capability_categories: capabilityMatrix(allowed),
    allowed_actions: allowed,
    blocked_actions: unique([...(options.blocked_actions || []), ...DANGEROUS]),
    requires_approval_actions: unique(options.requires_approval_actions),
    network_policy: options.network_policy || "No live network by default except explicit approved safe flows.",
    filesystem_policy: options.filesystem_policy || "Allowed roots only; secret-like paths blocked.",
    secret_policy: options.secret_policy || "Secret paths and raw secret-like values are blocked/redacted; no cookie/session extraction.",
    command_policy: options.command_policy || "No arbitrary shell; only allowlisted diagnostics/tasks where profile permits.",
    package_policy: options.package_policy || "Package publishing and unknown installers are blocked; reviewed repository-local install requires an explicit scoped grant.",
    git_policy: options.git_policy || "Feature branches only for writes; protected branches, force-push, and repository deletion remain blocked.",
    github_policy: options.github_policy || "GitHub mutation is scoped, approval-gated, evidence-backed, and excludes protected/admin actions.",
    browser_policy: options.browser_policy || "Bounded local or approved public interaction only; no login, cookie/session extraction, or CAPTCHA bypass.",
    evidence_policy: options.evidence_policy || "Real actions require bounded redacted evidence.",
    rollback_policy: options.rollback_policy || "Writes require transaction, backup, or explicit compensating-action evidence.",
    risk_notes: options.risk_notes || [],
    public_default_safe: options.public_default_safe === true,
    creator_only: options.creator_only === true
  };
}

function capabilityMatrix(allowed) {
  return Object.fromEntries(Object.entries(PERMISSION_CAPABILITIES).map(([category, actions]) => [category, {
    enabled: actions.some((action) => allowed.includes(action)),
    allowed_actions: actions.filter((action) => allowed.includes(action)),
    hard_blocked_actions: actions.filter((action) => HARD_BLOCKED_ACTIONS.has(action))
  }]));
}

function unique(values = []) {
  return [...new Set(values.map(normalizeActionType).filter(Boolean))];
}
