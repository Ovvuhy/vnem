export function createGithubOperationsRuntime({
  existsSync,
  readFile,
  readdir,
  stat,
  path,
  z,
  READ_ONLY_LOCAL,
  NETWORK_READ,
  ACTION_TOOL,
  NETWORK_ACTION,
  GITHUB_SETTINGS_HEADER,
  DEFAULT_GITHUB_ENV_SETTINGS,
  GITHUB_PROFILES,
  githubDevelopmentRuntime,
  ToolsError,
  actionPolicyPreview,
  enforceActionPolicy,
  decorateToolResult,
  resolveGithubRoot,
  resolveAllowedFile,
  repoDeepMap,
  nextActionRanker,
  runProcess,
  recordSession,
  writeEvidenceLog,
  isSecretLikePath,
  normalizePath,
  redactSecrets,
  containsRawSecret,
  truncate,
  arrayify,
  taskProgressTruthCheck,
  withToolErrors,
  toolResult
}) {
  function githubSetting(name) { return process.env[name] ?? DEFAULT_GITHUB_ENV_SETTINGS[name]; }
  function splitSetting(name) { return String(githubSetting(name) || "").split(/[;,:]/).map((item) => item.trim()).filter(Boolean); }
  function githubBool(name) { return String(githubSetting(name) || "0") === "1"; }
  function githubSettings() {
    return {
      autonomy_mode: githubSetting("VNEM_TOOLS_AUTONOMY_MODE"),
      profile: normalizeGithubProfile(githubSetting("VNEM_TOOLS_GITHUB_PROFILE")),
      allowed_repos: splitSetting("VNEM_TOOLS_GITHUB_ALLOWED_REPOS"),
      protected_branches: splitSetting("VNEM_TOOLS_GITHUB_PROTECTED_BRANCHES"),
      allow_direct_push: githubBool("VNEM_TOOLS_GITHUB_ALLOW_DIRECT_PUSH"),
      allow_force_push: githubBool("VNEM_TOOLS_GITHUB_ALLOW_FORCE_PUSH"),
      allow_repo_delete: githubBool("VNEM_TOOLS_GITHUB_ALLOW_REPO_DELETE"),
      allow_settings_mutation: githubBool("VNEM_TOOLS_GITHUB_ALLOW_SETTINGS_MUTATION"),
      allow_releases: githubBool("VNEM_TOOLS_GITHUB_ALLOW_RELEASES"),
      allow_actions_rerun: githubBool("VNEM_TOOLS_GITHUB_ALLOW_ACTIONS_RERUN"),
      malware_download_block: githubBool("VNEM_TOOLS_MALWARE_DOWNLOAD_BLOCK")
    };
  }
  function normalizeGithubProfile(profile) { return GITHUB_PROFILES.includes(String(profile || "").trim()) ? String(profile).trim() : "maintainer"; }
  function githubProfilePolicy(profile = githubSettings().profile) {
    const commonRead = ["inspect_repo", "inspect_branches", "inspect_commits", "inspect_issues", "inspect_prs", "inspect_actions", "ci_triage", "repo_intelligence"];
    const localWork = ["create_branch", "local_commit", "pr_plan", "issue_plan"];
    const maintainer = ["push_feature_branch", "open_pr", "update_pr", "comment_issue_pr", "create_issue", "update_issue", "manage_labels", "rerun_ci", "draft_release"];
    const admin = ["repo_settings_plan", "release_operations"];
    const owner = ["repo_delete_if_config_enabled", "force_push_if_config_enabled", "settings_mutation_if_config_enabled"];
    if (profile === "off") return { github_enabled: false, allowed_actions: [], blocked_actions: ["all_github_tools"], description: "GitHub tools disabled." };
    if (profile === "read") return { github_enabled: true, allowed_actions: commonRead, blocked_actions: [...localWork, ...maintainer, ...admin, ...owner], description: "Inspect-only GitHub/repo intelligence." };
    if (profile === "work") return { github_enabled: true, allowed_actions: [...commonRead, ...localWork], blocked_actions: [...maintainer, ...admin, ...owner], description: "Local branches/commits and PR/issue plans only." };
    if (profile === "maintainer") return { github_enabled: true, allowed_actions: [...commonRead, ...localWork, ...maintainer], blocked_actions: [...admin, ...owner], description: "Useful repo maintenance: feature branches, commits, feature pushes, PRs, issues, labels, CI reruns/releases when enabled." };
    if (profile === "admin") return { github_enabled: true, allowed_actions: [...commonRead, ...localWork, ...maintainer, ...admin], blocked_actions: owner, description: "Maintainer plus admin-level operations when config allows." };
    if (profile === "owner") return { github_enabled: true, allowed_actions: [...commonRead, ...localWork, ...maintainer, ...admin, ...owner], blocked_actions: [], description: "Maximum GitHub power allowed by config/token." };
    return { github_enabled: true, allowed_actions: [...commonRead, ...localWork, ...maintainer].filter((action) => String(process.env[`VNEM_TOOLS_GITHUB_ALLOW_${action.toUpperCase()}`] || "1") === "1"), blocked_actions: [], description: "Custom profile reads exact allow/deny env settings." };
  }
  function githubSettingsTomlBlock() {
    const lines = ["[mcp_servers.\"vnem-tools\".env]", GITHUB_SETTINGS_HEADER];
    for (const [key, value] of Object.entries(DEFAULT_GITHUB_ENV_SETTINGS)) lines.push(`${key} = ${JSON.stringify(value)}`);
    return lines.join("\n");
  }
  function githubSettingsGuide() {
    return {
      config_block: githubSettingsTomlBlock(),
      settings: [
        ["VNEM_TOOLS_AUTONOMY_MODE", "fast keeps outputs action-first and compact."],
        ["VNEM_TOOLS_GITHUB_PROFILE", "off/read/work/maintainer/admin/owner/custom power profile; default maintainer."],
        ["VNEM_TOOLS_GITHUB_ALLOWED_REPOS", "semicolon list of owner/repo repos remote GitHub writes may target."],
        ["VNEM_TOOLS_GITHUB_PROTECTED_BRANCHES", "semicolon list blocked from direct push unless direct push knob is enabled."],
        ["VNEM_TOOLS_GITHUB_ALLOW_DIRECT_PUSH", "1 allows direct push to protected branches; default 0."],
        ["VNEM_TOOLS_GITHUB_ALLOW_FORCE_PUSH", "1 allows force push; default 0."],
        ["VNEM_TOOLS_GITHUB_ALLOW_REPO_DELETE", "1 allows repo deletion tooling if implemented; default 0."],
        ["VNEM_TOOLS_GITHUB_ALLOW_SETTINGS_MUTATION", "1 allows repo settings apply tools; default 0."],
        ["VNEM_TOOLS_GITHUB_ALLOW_RELEASES", "1 allows draft release operations; default 1."],
        ["VNEM_TOOLS_GITHUB_ALLOW_ACTIONS_RERUN", "1 allows CI reruns; default 1."],
        ["VNEM_TOOLS_MALWARE_DOWNLOAD_BLOCK", "1 blocks malware-like or unknown installer execution; default 1."]
      ].map(([name, effect]) => ({ name, effect })),
      secret_policy: "Tokens are detected by presence only and never printed. Prefer gh, then git remote/auth, then GH_TOKEN/GITHUB_TOKEN only when needed."
    };
  }
  function githubProfileStatus(args = {}) {
    const settings = githubSettings();
    const policy = githubProfilePolicy(settings.profile);
    const blocked = [...policy.blocked_actions];
    if (!settings.allow_direct_push) blocked.push("direct_push_to_protected_branch");
    if (!settings.allow_force_push) blocked.push("force_push");
    if (!settings.allow_repo_delete) blocked.push("repo_delete");
    if (!settings.allow_settings_mutation) blocked.push("repo_settings_apply");
    if (!settings.allow_actions_rerun) blocked.push("actions_rerun");
    if (!settings.allow_releases) blocked.push("release_create");
    return { active_github_profile: settings.profile, autonomy_mode: settings.autonomy_mode, github_enabled: policy.github_enabled, profile_description: policy.description, allowed_actions: policy.allowed_actions, blocked_actions: [...new Set(blocked)], config_source: Object.fromEntries(Object.keys(DEFAULT_GITHUB_ENV_SETTINGS).map((k) => [k, process.env[k] !== undefined ? "env" : "default"])), recommended_profile_for_goal: recommendGithubProfile(args.goal || ""), config_knobs: Object.fromEntries(Object.entries(DEFAULT_GITHUB_ENV_SETTINGS).map(([k, v]) => [k, { current: githubSetting(k), default: v }])) };
  }
  function recommendGithubProfile(goal) { const g = String(goal || "").toLowerCase(); if (/delete repo|force push|settings|owner/.test(g)) return "owner/admin plus explicit config knob"; if (/push|pr|issue|label|ci|release/.test(g)) return "maintainer"; if (/branch|commit|plan/.test(g)) return "work"; if (/inspect|read|status|triage/.test(g)) return "read"; return "maintainer"; }
  function formatGithubProfileStatus(status) { return [`vnem_tools_github_profile_status: ${status.active_github_profile}`, `mode=${status.autonomy_mode}`, `allowed=${status.allowed_actions.slice(0, 8).join(",")}`, `blocked=${status.blocked_actions.slice(0, 8).join(",")}`].join("\n"); }
  function formatGithubSettingsGuide(guide) { return [`vnem_tools_github_settings_guide`, guide.config_block].join("\n"); }
  async function gitValue(cwd, args, maxOutputBytes = 4000) { const r = await runProcess("git", args, { cwd, timeoutMs: 10000, maxOutputBytes }); return r.ok ? r.stdout.trim() : ""; }
  async function githubStatus(args = {}) {
    const root = await resolveGithubRoot(args.root || ".");
    const ghAuth = await githubAuthStatus(root.absolutePath);
    const gitVersion = await runProcess("git", ["--version"], { cwd: root.absolutePath, timeoutMs: 5000, maxOutputBytes: 2000 });
    const remoteVerbose = await runProcess("git", ["remote", "-v"], { cwd: root.absolutePath, timeoutMs: 5000, maxOutputBytes: 5000 });
    const branch = await gitValue(root.absolutePath, ["branch", "--show-current"]);
    const head = await gitValue(root.absolutePath, ["rev-parse", "HEAD"]);
    const statusText = await gitValue(root.absolutePath, ["status", "--short"], args.max_bytes || 12000);
    const recent = (await gitValue(root.absolutePath, ["log", "--oneline", "-10", "--decorate"], args.max_bytes || 12000)).split(/\r?\n/).filter(Boolean);
    const remoteUrl = parseRemoteUrlFromVerbose(remoteVerbose.stdout) || await gitValue(root.absolutePath, ["remote", "get-url", "origin"]);
    const repoSlug = parseGithubRepo(remoteUrl) || args.repo || null;
    const gh = await ghRepoSummaries(root.absolutePath, args);
    const settings = githubSettings();
    const profile = githubProfileStatus({ goal: args.goal });
    const blocked = [...profile.blocked_actions];
    if (repoSlug && !repoAllowed(repoSlug, settings)) blocked.push(`repo_not_allowed:${repoSlug}`);
    if (!ghAuth.gh_available) blocked.push("gh_unavailable_for_remote_github_actions");
    if (ghAuth.gh_available && !ghAuth.auth_ready) blocked.push("gh_not_authenticated_or_token_absent");
    return { gh_available: ghAuth.gh_available, gh_version: ghAuth.gh_version, gh_auth_status: ghAuth.auth_ready ? "authenticated_or_status_ok" : "not_authenticated_or_unavailable", gh_auth_detail_redacted: ghAuth.auth_status_redacted, git_available: gitVersion.ok, git_version: gitVersion.ok ? gitVersion.stdout.trim() : null, git_repo_detected: Boolean(head), git_remote_detected: Boolean(remoteUrl), github_remote_detected: Boolean(repoSlug), actions_available: gh.ci_status?.status === "reported", git_remote_verbose: redactSecrets(remoteVerbose.stdout), current_repo_remote: redactSecrets(remoteUrl), github_repo: repoSlug, current_branch: branch, current_head: head, dirty_worktree_status: statusText ? statusText.split(/\r?\n/).filter(Boolean) : [], recent_commits: recent, repo_view: gh.repo_view, open_prs: gh.open_prs, open_issues: gh.open_issues, ci_status: gh.ci_status, active_github_profile: settings.profile, autonomy_mode: settings.autonomy_mode, allowed_repos: settings.allowed_repos, protected_branches: settings.protected_branches, config_switches: { allow_direct_push: settings.allow_direct_push, allow_force_push: settings.allow_force_push, allow_repo_delete: settings.allow_repo_delete, allow_settings_mutation: settings.allow_settings_mutation, allow_releases: settings.allow_releases, allow_actions_rerun: settings.allow_actions_rerun, malware_download_block: settings.malware_download_block }, actions_currently_available: profile.allowed_actions.filter((a) => !blocked.includes(a)), blocked_by_config_or_profile: [...new Set(blocked)], auth_fix_commands: ghAuth.auth_ready ? [] : ["gh auth login", "gh auth setup-git"], secret_values_exposed: false, operation_result: "reported", proof_summary: "Ran compact gh/git readiness and repo inspection commands with redacted output.", next_best_action: blocked.includes("gh_unavailable_for_remote_github_actions") || blocked.includes("gh_not_authenticated_or_token_absent") ? "Run gh auth login then gh auth setup-git; never print tokens." : "Use repo inspect/intelligence before mutating." };
  }
  function parseRemoteUrlFromVerbose(text) {
    const line = String(text || "").split(/\r?\n/).find((item) => /^origin\s+/.test(item) && /\(fetch\)/.test(item)) || String(text || "").split(/\r?\n/).find((item) => /^origin\s+/.test(item));
    return line ? line.split(/\s+/)[1] : "";
  }
  async function githubAuthStatus(cwd) {
    const ghVersion = await runProcess("gh", ["--version"], { cwd, timeoutMs: 5000, maxOutputBytes: 3000 });
    const ghAuth = ghVersion.ok ? await runProcess("gh", ["auth", "status"], { cwd, timeoutMs: 7000, maxOutputBytes: 5000 }) : { ok: false, stdout: "", stderr: "gh unavailable" };
    const tokenPresent = Boolean(process.env.GH_TOKEN || process.env.GITHUB_TOKEN);
    return { gh_available: ghVersion.ok, gh_version: ghVersion.ok ? ghVersion.stdout.split(/\r?\n/)[0] : null, gh_auth_ok: ghAuth.ok, token_present: tokenPresent, auth_ready: ghVersion.ok && (ghAuth.ok || tokenPresent), auth_status_redacted: redactSecrets(`${ghAuth.stdout}\n${ghAuth.stderr}`.trim()) };
  }
  function formatGithubStatus(s) { return [`vnem_tools_github_status: profile=${s.active_github_profile}`, `repo=${s.github_repo || "unknown"}`, `branch=${s.current_branch || "unknown"}`, `gh=${s.gh_available ? "available" : "unavailable"}`, `blocked=${s.blocked_by_config_or_profile.slice(0, 4).join(",") || "none"}`].join("\n"); }

  function parseGithubRepo(remoteUrl) {
    const value = String(remoteUrl || "").trim();
    if (!value) return null;
    let m = value.match(/github\.com[:/]([^/]+)\/([^/.]+)(?:\.git)?/i);
    return m ? `${m[1]}/${m[2]}` : null;
  }
  function repoAllowed(repo, settings = githubSettings()) { if (!repo) return true; return !settings.allowed_repos.length || settings.allowed_repos.some((r) => r.toLowerCase() === repo.toLowerCase()); }
  function cleanBranchName(branch) { const b = String(branch || "").trim(); if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/.test(b) || b.includes("..") || b.endsWith("/") || b.includes("//") || /[~^:?*[\\]/.test(b)) throw new ToolsError("GitHub branch name is not clean.", "github_branch_name_blocked", { branch: b }); return b; }
  function githubBlockedResult(tool, reason, knob = null, extras = {}) { return decorateToolResult(tool, { operation_result: "blocked", blocked_reason: reason, config_knob_to_change: knob, claim_status: "blocked", proof_summary: "No GitHub mutation performed.", next_best_action: knob ? `To allow it, set ${knob} = "1".` : "Change GitHub profile/config or auth, then retry.", ...extras }, { capability_group: "github_autonomy", mutation: true, network: true }); }
  async function enforceGithubRepoPolicy(root, operation, opts = {}) {
    const settings = githubSettings();
    const policy = githubProfilePolicy(settings.profile);
    if (!policy.github_enabled) return githubBlockedResult(operation.toolName, "GitHub tools disabled by profile off.", "VNEM_TOOLS_GITHUB_PROFILE");
    if (opts.requiredAction && !policy.allowed_actions.includes(opts.requiredAction)) return githubBlockedResult(operation.toolName, `GitHub profile ${settings.profile} does not allow ${opts.requiredAction}.`, "VNEM_TOOLS_GITHUB_PROFILE");
    const remote = await gitValue(root.absolutePath, ["remote", "get-url", opts.remote || "origin"]);
    const repo = parseGithubRepo(remote) || opts.repo || null;
    if (repo && !repoAllowed(repo, settings)) return githubBlockedResult(operation.toolName, `Repository ${repo} is not in VNEM_TOOLS_GITHUB_ALLOWED_REPOS.`, "VNEM_TOOLS_GITHUB_ALLOWED_REPOS", { github_repo: repo });
    return { allowed: true, github_repo: repo, remote_url: redactSecrets(remote) };
  }
  async function runGithubDevelopmentRead(args, requiredAction, operation) {
    const root = await resolveGithubRoot(args.root || ".");
    const settings = githubSettings();
    const profile = githubProfilePolicy(settings.profile);
    if (!profile.github_enabled || !profile.allowed_actions.includes(requiredAction)) {
      return { operation_result: "blocked", blocked_reason: `GitHub profile ${settings.profile} does not allow ${requiredAction}.`, config_knob_to_change: "VNEM_TOOLS_GITHUB_PROFILE", mutation_performed: false, must_not_claim: ["Live GitHub proof was collected."], safe_next_step: "Select a GitHub read-capable profile and retry the exact bounded read." };
    }
    const remote = await gitValue(root.absolutePath, ["remote", "get-url", args.remote || "origin"]);
    const repo = parseGithubRepo(remote) || args.repo || null;
    if (repo && !repoAllowed(repo, settings)) return { operation_result: "blocked", blocked_reason: `Repository ${repo} is not in VNEM_TOOLS_GITHUB_ALLOWED_REPOS.`, config_knob_to_change: "VNEM_TOOLS_GITHUB_ALLOWED_REPOS", github_repo: repo, mutation_performed: false, must_not_claim: ["Live GitHub proof was collected."], safe_next_step: "Add only the exact intended owner/repo to the allowlist, then retry." };
    return await operation();
  }
  function isProtectedBranch(branch) { const b = String(branch || "").trim().toLowerCase(); return githubSettings().protected_branches.map((x) => x.toLowerCase()).includes(b); }
  function githubSecretFileBlocked(files) { return arrayify(files).find((f) => isSecretLikePath(f) || /(^|\/)\.env(\.|$|\/)|secret|token|credential|cookie|session|id_rsa|id_ed25519|\.pem$|\.key$/i.test(String(f))); }
  function parseGitPathList(value) { const text = String(value || ""); return text.split(text.includes("\0") ? "\0" : /\r?\n/).map((item) => normalizePath(item.trim())).filter(Boolean); }
  async function scanGithubCommitContent(root, files) {
    for (const file of files) {
      const absolute = path.resolve(root, file);
      if (!existsSync(absolute)) continue;
      const info = await stat(absolute);
      if (!info.isFile() || info.size > 1024 * 1024) continue;
      const content = await readFile(absolute);
      if (content.includes(0)) continue;
      const detector = containsCommitSecret(content.toString("utf8"));
      if (detector) return { file, detector };
    }
    return null;
  }
  function containsCommitSecret(value) {
    for (const line of String(value || "").split(/\r?\n/)) {
      if (/\b(?:EXAMPLE|CANARY|REDACTED|PLACEHOLDER|FAKE|TEST_ONLY)\b/i.test(line)) continue;
      if (/(?:github_pat_|gh[pousr]_|sk-|xox[baprs]-|cfut_)[A-Za-z0-9_-]{16,}/i.test(line)) return "provider_token_pattern";
      if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bAKIA[0-9A-Z]{16}\b/.test(line)) return "private_key_or_cloud_key_pattern";
      const assignment = line.match(/(?:token|secret|password|credential|api[_-]?key|authorization|cookie|session)\s*[=:]\s*["']?([^\s"']{16,})/i);
      if (assignment && !/[\[({+*?\\]/.test(assignment[1])) return "secret_assignment_pattern";
    }
    return null;
  }
  async function githubRepoInspect(args = {}) {
    const root = await resolveGithubRoot(args.root || ".");
    const remoteUrl = await gitValue(root.absolutePath, ["remote", "get-url", args.remote || "origin"]);
    const branch = await gitValue(root.absolutePath, ["branch", "--show-current"]);
    const head = await gitValue(root.absolutePath, ["rev-parse", "HEAD"]);
    const statusText = await gitValue(root.absolutePath, ["status", "--short"], args.max_bytes || 12000);
    const recent = (await gitValue(root.absolutePath, ["log", "--oneline", "-10", "--decorate"], args.max_bytes || 12000)).split(/\r?\n/).filter(Boolean);
    const files = await listTopLevelFiles(root.absolutePath);
    const commands = await detectProjectCommands(root.absolutePath);
    const gh = await ghRepoSummaries(root.absolutePath, args);
    return { owner_repo: args.repo || parseGithubRepo(remoteUrl) || "local_repo_or_unknown_remote", remote_url: redactSecrets(remoteUrl), branch, head, dirty_worktree_status: statusText ? statusText.split(/\r?\n/).filter(Boolean) : [], recent_commits: recent, repo_view: gh.repo_view, open_prs: gh.open_prs, open_issues: gh.open_issues, ci_status: gh.ci_status, important_files: files.important, detected_build_test_commands: commands, operation_result: "reported", proof_summary: "Inspected git state and available GitHub repo/PR/issue/Actions metadata through gh/git command paths.", next_best_action: statusText ? "Review dirty files before branch/commit/push." : "Use repo intelligence report for next actions." };
  }
  async function listTopLevelFiles(root) { const names = await readdir(root).catch(() => []); const important = names.filter((n) => /^(package\.json|README|pnpm-lock|package-lock|yarn.lock|src|scripts|test|tests|\.github|tsconfig|vite|next|wrangler|Dockerfile)/i.test(n)).slice(0, 40); return { important }; }
  async function detectProjectCommands(root) {
    const commands = { build_commands: [], test_commands: [] };
    try { const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8")); const scripts = pkg.scripts || {}; for (const [name] of Object.entries(scripts)) { if (/build|compile/.test(name)) commands.build_commands.push(`npm run ${name}`); if (/test|check|lint|type|validate/.test(name)) commands.test_commands.push(`npm run ${name}`); } } catch {}
    if (existsSync(path.join(root, "pyproject.toml"))) commands.test_commands.push("pytest");
    if (existsSync(path.join(root, "Cargo.toml"))) { commands.build_commands.push("cargo build"); commands.test_commands.push("cargo test"); }
    return commands;
  }
  async function ghRepoSummaries(root, args = {}) {
    if (args.simulate_github) return { repo_view: { nameWithOwner: args.repo || "simulated/repo", source: "simulated" }, open_prs: [{ number: 1, title: "simulated PR", state: "OPEN" }], open_issues: [{ number: 2, title: "simulated issue", state: "OPEN" }], ci_status: { status: "simulated", conclusion: "unknown" } };
    const auth = await githubAuthStatus(root);
    if (!auth.gh_available) return { repo_view: null, open_prs: [], open_issues: [], ci_status: { status: "unavailable", reason: "gh unavailable" } };
    if (!auth.auth_ready) return { repo_view: null, open_prs: [], open_issues: [], ci_status: { status: "unavailable", reason: "gh auth missing", auth_fix_commands: ["gh auth login", "gh auth setup-git"] }, auth_ready: false, auth_fix_commands: ["gh auth login", "gh auth setup-git"] };
    const repoView = await runProcess("gh", ["repo", "view", "--json", "nameWithOwner,defaultBranchRef,isPrivate,url"], { cwd: root, timeoutMs: 8000, maxOutputBytes: 12000 });
    const prs = await runProcess("gh", ["pr", "list", "--limit", "5", "--json", "number,title,state,headRefName,baseRefName"], { cwd: root, timeoutMs: 8000, maxOutputBytes: 12000 });
    const issues = await runProcess("gh", ["issue", "list", "--limit", "5", "--json", "number,title,state,labels"], { cwd: root, timeoutMs: 8000, maxOutputBytes: 12000 });
    const runs = await runProcess("gh", ["run", "list", "--limit", "3", "--json", "databaseId,name,status,conclusion,headSha,headBranch,workflowName,url"], { cwd: root, timeoutMs: 8000, maxOutputBytes: 12000 });
    return { repo_view: repoView.ok ? parseJsonObjectOrNull(repoView.stdout) : null, open_prs: parseJsonOrEmpty(prs.stdout), open_issues: parseJsonOrEmpty(issues.stdout), ci_status: runs.ok ? { status: "reported", runs: parseJsonOrEmpty(runs.stdout) } : { status: "unavailable", reason: runs.stderr || runs.stdout }, auth_ready: auth.auth_ready, auth_fix_commands: auth.auth_ready ? [] : ["gh auth login", "gh auth setup-git"] };
  }
  function parseJsonOrEmpty(text) { try { return JSON.parse(text || "[]"); } catch { return []; } }
  function parseJsonObjectOrNull(text) { try { return JSON.parse(text || "{}"); } catch { return null; } }
  async function repoIntelligenceReport(args = {}) {
    const inspect = await githubRepoInspect(args);
    const deep = await repoDeepMap({ root: args.root || ".", max_files: 500, max_depth: 6, include_git: true });
    const ranked = await nextActionRanker({ root: args.root || ".", user_goal: args.goal || "", max_actions: 5 });
    const projectType = detectProjectType(inspect.important_files);
    const risky = [".env", ".env.local", "secrets/", "credentials/", ".git/", "node_modules/", "dist/", "build/", "package-lock.json if unrelated dependency churn"];
    const currentRisk = inspect.dirty_worktree_status.length ? "dirty_worktree_review_before_commit" : "clean_or_no_uncommitted_changes_detected";
    return { repo_identity: { owner_repo: inspect.owner_repo, remote_url: inspect.remote_url, branch: inspect.branch, head: inspect.head }, project_type: projectType, likely_build_commands: inspect.detected_build_test_commands.build_commands, likely_test_commands: inspect.detected_build_test_commands.test_commands, important_paths: inspect.important_files, risky_paths: risky, deep_repo_map_summary: deep.compact_summary, source_dirs: deep.source_dirs, test_dirs: deep.test_dirs, generated_artifact_dirs: deep.generated_artifact_dirs, todo_markers_sample: deep.todo_markers.slice(0, 5), active_branch: inspect.branch, recent_commits: inspect.recent_commits, open_prs_summary: inspect.open_prs.slice(0, 5), open_issues_summary: inspect.open_issues.slice(0, 5), ci_summary: inspect.ci_status, current_work_risk: currentRisk, best_next_actions: ranked.actions.map((action) => action.action), ranked_next_actions: ranked.actions, useless_actions_to_avoid: ["blind force-push", "random broad refactor before reading repo", "claiming CI green without checking exact SHA", "committing .env/secrets", "direct push to protected branch unless config explicitly enables it", "docs-only or registration-only work without behavior proof", "full npm test loops before targeted checks"] };
  }
  function detectProjectType(files) { const f = files.join(" ").toLowerCase(); if (f.includes("package.json")) return "node_js_or_web"; if (f.includes("pyproject.toml")) return "python"; if (f.includes("cargo.toml")) return "rust"; return "unknown_local_repo"; }
  function buildBestNextActions(inspect) { const out = []; if (inspect.dirty_worktree_status.length) out.push("Review changed files and secret-like paths before commit."); if (inspect.detected_build_test_commands.test_commands.length) out.push(`Run ${inspect.detected_build_test_commands.test_commands[0]} before PR/final claim.`); out.push("Use feature branch + PR for protected-branch work."); if (inspect.ci_status?.status === "reported") out.push("Read CI status/failures before rerun or final handoff."); return out; }
  function formatRepoIntelligence(r) { return [`vnem_tools_repo_intelligence_report: ${r.repo_identity.owner_repo}`, `branch=${r.active_branch || "unknown"}`, `tests=${r.likely_test_commands.join(",") || "unknown"}`, `next=${r.best_next_actions[0] || "inspect repo"}`].join("\n"); }
  function formatGithubRepoInspect(r) { return [`vnem_tools_github_repo_inspect: ${r.owner_repo}`, `branch=${r.branch || "unknown"}`, `dirty=${r.dirty_worktree_status.length}`, `tests=${r.detected_build_test_commands.test_commands.join(",") || "unknown"}`].join("\n"); }
  async function githubBranchCreate(args = {}) {
    const root = await resolveGithubRoot(args.root || ".");
    const branch = cleanBranchName(args.branch);
    const policy = await enforceGithubRepoPolicy(root, { toolName: "vnem_tools_github_branch_create" }, { requiredAction: "create_branch" });
    if (!policy.allowed) return policy;
    const existing = await runProcess("git", ["rev-parse", "--verify", branch], { cwd: root.absolutePath, timeoutMs: 5000, maxOutputBytes: 2000 });
    if (existing.ok && args.allow_existing !== true) return githubBlockedResult("vnem_tools_github_branch_create", `Branch ${branch} already exists; not overwriting.`, "VNEM_TOOLS_GITHUB_ALLOW_FORCE_PUSH", { branch });
    const dirty = await gitValue(root.absolutePath, ["status", "--short"]);
    if (args.dry_run === true) return decorateToolResult("vnem_tools_github_branch_create", { operation_result: "planned", branch, dirty_worktree_status: dirty ? dirty.split(/\r?\n/).filter(Boolean) : [], proof_summary: "No branch created in dry-run.", next_best_action: dirty ? "Review dirty worktree before branching." : `Create branch ${branch}.`, claim_status: "planned" }, { capability_group: "github_autonomy", mutation: true });
    if (dirty && args.allow_dirty !== true) return githubBlockedResult("vnem_tools_github_branch_create", "Branch creation blocked because the worktree is dirty and allow_dirty was not explicitly selected.", null, { branch, dirty_worktree_status: dirty.split(/\r?\n/).filter(Boolean), safe_recovery: "Review the exact changed files, commit them intentionally or restore them through a user-approved workflow, then retry. VNEM did not switch branches." });
    const cmd = args.from ? ["checkout", "-b", branch, args.from] : ["checkout", "-b", branch];
    const r = await runProcess("git", cmd, { cwd: root.absolutePath, timeoutMs: 10000, maxOutputBytes: 8000 });
    if (!r.ok) throw new ToolsError("git branch create failed.", "github_branch_create_failed", { stderr: r.stderr, stdout: r.stdout });
    return decorateToolResult("vnem_tools_github_branch_create", { operation_result: "created", branch, from: args.from || "current_HEAD", dirty_worktree_status: dirty ? dirty.split(/\r?\n/).filter(Boolean) : [], proof_summary: `Created local branch ${branch}.`, claim_status: "local_branch_created", next_best_action: "Commit selected files and push feature branch when ready." }, { capability_group: "github_autonomy", mutation: true });
  }
  async function githubCommitPush(args = {}) {
    const root = await resolveGithubRoot(args.root || ".");
    const branch = cleanBranchName(args.branch || await gitValue(root.absolutePath, ["branch", "--show-current"]));
    const remote = args.remote || "origin";
    const settings = githubSettings();
    if (args.force === true && !settings.allow_force_push) return githubBlockedResult("vnem_tools_github_commit_push", "Force push blocked by default.", "VNEM_TOOLS_GITHUB_ALLOW_FORCE_PUSH", { branch });
    if (isProtectedBranch(branch) && !settings.allow_direct_push) return githubBlockedResult("vnem_tools_github_commit_push", `Blocked: direct push to protected branch ${branch}.`, "VNEM_TOOLS_GITHUB_ALLOW_DIRECT_PUSH", { branch });
    const secret = githubSecretFileBlocked(args.files);
    if (secret) return githubBlockedResult("vnem_tools_github_commit_push", `Secret-like file blocked from commit: ${secret}`, null, { file: secret });
    const policy = await enforceGithubRepoPolicy(root, { toolName: "vnem_tools_github_commit_push" }, { requiredAction: isProtectedBranch(branch) ? "push_protected_branch" : "push_feature_branch", remote });
    if (!policy.allowed) return policy;
    const files = [];
    for (const file of arrayify(args.files)) {
      const target = await resolveAllowedFile(path.join(root.absolutePath, file), { mustExist: false, blockSecrets: true });
      const relative = normalizePath(path.relative(root.absolutePath, target.absolutePath));
      if (!relative || relative.startsWith("../") || path.isAbsolute(relative)) throw new ToolsError("Selected commit path is outside the target repository.", "github_commit_path_blocked", { file: String(file) });
      files.push(relative);
    }
    const preStaged = await runProcess("git", ["diff", "--cached", "--name-only", "--diff-filter=ACDMRTUXB", "-z"], { cwd: root.absolutePath, timeoutMs: 10000, maxOutputBytes: 24000 });
    if (!preStaged.ok) throw new ToolsError("Could not inspect the existing staged index before selective commit.", "github_staged_preflight_failed", { stderr: preStaged.stderr });
    const stagedBefore = parseGitPathList(preStaged.stdout);
    const unrelatedStaged = stagedBefore.filter((file) => !files.includes(normalizePath(file)));
    if (unrelatedStaged.length) return githubBlockedResult("vnem_tools_github_commit_push", "Selective commit blocked because unrelated files are already staged.", null, { pre_staged_files: stagedBefore, unrelated_pre_staged_files: unrelatedStaged, selected_files: files, safe_recovery: "Commit or unstage the unrelated files through an explicit user-reviewed workflow, then retry. VNEM did not alter the index." });
    const secretContent = await scanGithubCommitContent(root.absolutePath, files);
    if (secretContent) return githubBlockedResult("vnem_tools_github_commit_push", `Secret-like content blocked from commit in ${secretContent.file}.`, null, { file: secretContent.file, detector: secretContent.detector, content_returned: false });
    if (containsCommitSecret(String(args.message || ""))) return githubBlockedResult("vnem_tools_github_commit_push", "Secret-like content blocked from the commit message.", null, { content_returned: false });
    const planned = { operation_result: args.dry_run !== false ? "planned" : "pending", branch, remote, files_staged: files, pre_staged_files: stagedBefore, selective_index_isolation_verified: unrelatedStaged.length === 0, secret_content_scan: "passed", message: redactSecrets(args.message || ""), push_command: `git push ${args.force ? "--force-with-lease " : ""}${remote} ${branch}`, proof_summary: "No GitHub mutation performed in dry-run.", claim_status: args.dry_run !== false ? "planned" : "pending", next_best_action: "Run tests/quality gate, then push feature branch/open PR." };
    if (args.dry_run !== false) return decorateToolResult("vnem_tools_github_commit_push", planned, { capability_group: "github_autonomy", mutation: true, network: true });
    const ghAuth = await githubAuthStatus(root.absolutePath);
    if (!ghAuth.gh_available) return githubBlockedResult("vnem_tools_github_commit_push", "gh CLI unavailable for GitHub push readiness.", null, { auth_fix_commands: ["gh auth login", "gh auth setup-git"] });
    if (!ghAuth.auth_ready) return githubBlockedResult("vnem_tools_github_commit_push", "gh auth is missing for GitHub push readiness.", null, { auth_fix_commands: ["gh auth login", "gh auth setup-git"], gh_auth_status: ghAuth.auth_status_redacted });
    const add = await runProcess("git", ["add", "--", ...files], { cwd: root.absolutePath, timeoutMs: 10000, maxOutputBytes: 12000 });
    if (!add.ok) throw new ToolsError("git add failed.", "github_git_add_failed", { stdout: add.stdout, stderr: add.stderr });
    const commit = await runProcess("git", ["commit", "-m", args.message], { cwd: root.absolutePath, timeoutMs: 20000, maxOutputBytes: 20000 });
    if (!commit.ok) throw new ToolsError("git commit failed.", "github_commit_failed", { stdout: commit.stdout, stderr: commit.stderr });
    const push = await runProcess("git", ["push", ...(args.force ? ["--force-with-lease"] : []), remote, branch], { cwd: root.absolutePath, timeoutMs: 60000, maxOutputBytes: 24000 });
    if (!push.ok) throw new ToolsError("git push failed.", "github_push_failed", { stdout: push.stdout, stderr: push.stderr });
    const sha = await gitValue(root.absolutePath, ["rev-parse", "HEAD"]);
    const remoteProof = await runProcess("git", ["ls-remote", "--heads", remote, `refs/heads/${branch}`], { cwd: root.absolutePath, timeoutMs: 30000, maxOutputBytes: 12000 });
    const remoteSha = remoteProof.ok ? remoteProof.stdout.trim().split(/\s+/)[0] : "";
    if (!remoteProof.ok || !remoteSha || remoteSha !== sha) throw new ToolsError("Push completed but the exact remote branch SHA did not verify. VNEM will not force-push.", "github_push_remote_sha_mismatch", { local_sha: sha, remote_sha: remoteSha || null, remote, branch, ls_remote_error: remoteProof.ok ? null : remoteProof.stderr });
    return decorateToolResult("vnem_tools_github_commit_push", { ...planned, operation_result: "pushed", commit_sha: sha, remote_branch_sha: remoteSha, remote_sha_verified: true, proof_summary: `Committed and pushed ${files.length} file(s) to ${remote}/${branch}; exact remote SHA verified.`, claim_status: "pushed_feature_branch", push_stdout: push.stdout, push_stderr: push.stderr, repair_or_rollback_guidance: "Use a normal corrective commit or PR update if the pushed change is wrong; force-push remains blocked by default." }, { capability_group: "github_autonomy", mutation: true, network: true });
  }
  async function githubGhMutation(toolName, args, ghArgs, requiredAction, resultKey) {
    const root = await resolveGithubRoot(args.root || ".");
    const policy = await enforceGithubRepoPolicy(root, { toolName }, { requiredAction });
    if (!policy.allowed) return policy;
    const planned = { operation_result: args.dry_run !== false ? "planned" : "pending", gh_args_redacted: ghArgs.map(redactSecrets), proof_summary: "No GitHub mutation performed in dry-run.", claim_status: args.dry_run !== false ? "planned" : "pending", next_best_action: "Run the gh command after auth/config is ready, then verify status." };
    if (args.dry_run !== false) return decorateToolResult(toolName, planned, { capability_group: "github_autonomy", mutation: true, network: true });
    const ghAuth = await githubAuthStatus(root.absolutePath);
    if (!ghAuth.gh_available) return githubBlockedResult(toolName, "gh CLI unavailable for GitHub remote mutation.", null, { auth_fix_commands: ["gh auth login", "gh auth setup-git"] });
    if (!ghAuth.auth_ready) return githubBlockedResult(toolName, "gh auth is missing for GitHub remote mutation.", null, { auth_fix_commands: ["gh auth login", "gh auth setup-git"], gh_auth_status: ghAuth.auth_status_redacted });
    const r = await runProcess("gh", ghArgs, { cwd: root.absolutePath, timeoutMs: 60000, maxOutputBytes: 24000 });
    if (!r.ok) throw new ToolsError(`${toolName} gh command failed.`, "github_gh_command_failed", { stdout: r.stdout, stderr: r.stderr });
    return decorateToolResult(toolName, { ...planned, operation_result: "completed", [resultKey]: r.stdout.trim(), proof_summary: "GitHub operation completed via gh; verify on exact repo/PR/issue/run.", claim_status: "completed" }, { capability_group: "github_autonomy", mutation: true, network: true });
  }
  async function githubPrCreate(args) { const gh = ["pr", "create", "--title", args.title, "--body", args.body || "", "--base", args.base || "main", "--head", args.head || await gitValue((await resolveGithubRoot(args.root || ".")).absolutePath, ["branch", "--show-current"]), ...(args.draft ? ["--draft"] : [])]; return githubGhMutation("vnem_tools_github_pr_create", args, gh, "open_pr", "pr_url"); }
  async function githubPrUpdate(args) { const gh = ["pr", "edit", String(args.pr || args.number || ""), ...(args.title ? ["--title", args.title] : []), ...(args.body ? ["--body", args.body] : []), ...arrayify(args.add_labels).flatMap((l) => ["--add-label", String(l)]), ...arrayify(args.remove_labels).flatMap((l) => ["--remove-label", String(l)])].filter(Boolean); if (args.comment) return githubGhMutation("vnem_tools_github_pr_update", args, ["pr", "comment", String(args.pr || args.number || ""), "--body", args.comment], "update_pr", "comment_url"); return githubGhMutation("vnem_tools_github_pr_update", args, gh, "update_pr", "pr_update_output"); }
  async function githubIssueCreate(args) { return githubGhMutation("vnem_tools_github_issue_create", args, ["issue", "create", "--title", args.title, "--body", args.body || "", ...arrayify(args.labels).flatMap((l) => ["--label", String(l)])], "create_issue", "issue_url"); }
  async function githubIssueUpdate(args) { return githubGhMutation("vnem_tools_github_issue_update", args, ["issue", "edit", String(args.issue || args.number || ""), ...(args.title ? ["--title", args.title] : []), ...(args.body ? ["--body", args.body] : []), ...(args.state ? [args.state === "closed" ? "--close" : "--reopen"] : []), ...arrayify(args.add_labels || args.labels).flatMap((l) => ["--add-label", String(l)]), ...arrayify(args.remove_labels).flatMap((l) => ["--remove-label", String(l)])].filter(Boolean), "update_issue", "issue_update_output"); }
  async function githubIssueComment(args) { return githubGhMutation("vnem_tools_github_issue_comment", args, ["issue", "comment", String(args.issue || args.number || ""), "--body", args.body || args.comment || ""], "comment_issue_pr", "comment_url"); }
  async function githubLabelsManage(args) { return githubGhMutation("vnem_tools_github_labels_manage", args, ["label", args.exists ? "edit" : "create", args.name, ...(args.color ? ["--color", args.color] : []), ...(args.description ? ["--description", args.description] : [])], "manage_labels", "label_output"); }
  async function githubActionsStatus(args = {}) {
    const root = await resolveGithubRoot(args.root || ".");
    if (args.simulate) return { operation_result: "reported", runs: [{ databaseId: 123, name: "CI", status: "completed", conclusion: "failure", workflowName: "CI" }], proof_summary: "Simulated CI status only.", claim_status: "simulated_only", next_best_action: "Use real gh actions status for exact SHA before final claims." };
    const ghAuth = await githubAuthStatus(root.absolutePath);
    if (!ghAuth.gh_available) return { operation_result: "blocked", blocked_reason: "gh CLI unavailable", runs: [], auth_fix_commands: ["gh auth login", "gh auth setup-git"], claim_status: "blocked", next_best_action: "Install/authenticate gh or inspect GitHub Actions externally." };
    if (!ghAuth.auth_ready) return { operation_result: "blocked", blocked_reason: "gh auth missing", runs: [], gh_auth_status: ghAuth.auth_status_redacted, auth_fix_commands: ["gh auth login", "gh auth setup-git"], claim_status: "blocked", next_best_action: "Run gh auth login and gh auth setup-git, then check Actions for the exact SHA." };
    const argsRun = ["run", "list", "--limit", String(args.limit || 10), "--json", "databaseId,name,status,conclusion,headSha,headBranch,workflowName,createdAt,url"];
    if (args.branch) argsRun.push("--branch", args.branch);
    const r = await runProcess("gh", argsRun, { cwd: root.absolutePath, timeoutMs: 15000, maxOutputBytes: args.max_bytes || 20000 });
    return { operation_result: r.ok ? "reported" : "blocked", runs: parseJsonOrEmpty(r.stdout), blocked_reason: r.ok ? null : r.stderr || r.stdout, claim_status: r.ok ? "reported" : "blocked", next_best_action: r.ok ? "Use CI triage for failed runs." : "Fix gh auth/repo context." };
  }
  async function githubActionsRerun(args = {}) { if (!githubSettings().allow_actions_rerun) return githubBlockedResult("vnem_tools_github_actions_rerun", "GitHub Actions rerun is disabled by config.", "VNEM_TOOLS_GITHUB_ALLOW_ACTIONS_RERUN"); return githubGhMutation("vnem_tools_github_actions_rerun", args, ["run", "rerun", String(args.run_id), ...(args.failed_only !== false ? ["--failed"] : [])], "rerun_ci", "rerun_output"); }
  async function githubCiFailureTriage(args = {}) {
    const root = await resolveGithubRoot(args.root || ".");
    let log = String(args.simulated_log || "");
    let workflow = args.workflow || "unknown";
    if (!log && args.run_id) {
      const ghAuth = await githubAuthStatus(root.absolutePath);
      if (!ghAuth.gh_available) return { operation_result: "blocked", blocked_reason: "gh CLI unavailable", auth_fix_commands: ["gh auth login", "gh auth setup-git"], failing_workflow: String(args.run_id), likely_cause: "GitHub CLI unavailable; CI logs were not fetched.", exact_log_excerpt_summary: "", likely_files_to_fix: [], exact_next_commands: ["Install/authenticate gh, then rerun CI triage for the exact run."], must_not_claim: ["CI logs were fetched.", "CI failure was fully triaged."] };
      if (!ghAuth.auth_ready) return { operation_result: "blocked", blocked_reason: "gh auth missing", gh_auth_status: ghAuth.auth_status_redacted, auth_fix_commands: ["gh auth login", "gh auth setup-git"], failing_workflow: String(args.run_id), likely_cause: "GitHub auth missing; CI logs were not fetched.", exact_log_excerpt_summary: "", likely_files_to_fix: [], exact_next_commands: ["Run gh auth login.", "Run gh auth setup-git.", "Rerun CI triage for the exact run."], must_not_claim: ["CI logs were fetched.", "CI failure was fully triaged."] };
      const r = await runProcess("gh", ["run", "view", String(args.run_id), "--log-failed"], { cwd: root.absolutePath, timeoutMs: 20000, maxOutputBytes: args.max_bytes || 24000 });
      if (!r.ok) return { operation_result: "blocked", blocked_reason: r.stderr || r.stdout || "gh run view failed", failing_workflow: String(args.run_id), likely_cause: "GitHub CI log fetch failed.", exact_log_excerpt_summary: truncate(redactSecrets(`${r.stdout}\n${r.stderr}`.trim()), 800), likely_files_to_fix: [], exact_next_commands: ["Check gh auth/repo access.", "Retry gh run view for the exact run id."], must_not_claim: ["CI logs were fetched successfully.", "CI failure was fully triaged."] };
      log = `${r.stdout}\n${r.stderr}`;
      workflow = String(args.run_id);
    }
    const lines = log.split(/\r?\n/).filter(Boolean);
    const failLines = lines.filter((l) => /error|failed|failure|exit code|cannot find|not found|timeout|exception|traceback|assert/i.test(l)).slice(0, 10);
    const files = [...new Set(lines.join("\n").match(/[A-Za-z0-9_./-]+\.(mjs|js|ts|tsx|jsx|json|py|yml|yaml|toml|md)/g) || [])].slice(0, 8);
    const cause = failLines.find((l) => /cannot find|not found/i.test(l)) || failLines.find((l) => /error|failed/i.test(l)) || "Failure log unavailable or inconclusive.";
    return { failing_workflow: workflow, failing_job: args.job || "unknown_from_available_log", failed_step: args.step || (failLines[0] || "unknown"), likely_cause: truncate(redactSecrets(cause), 500), exact_log_excerpt_summary: failLines.map((l) => truncate(redactSecrets(l), 240)).join(" | "), likely_files_to_fix: files, exact_next_commands: ["Reproduce failing command locally if shown in log.", files[0] ? `Inspect ${files[0]}` : "Run repo intelligence to identify likely test/build command.", "Rerun the targeted test, then check GitHub Actions for exact SHA."], must_not_claim: ["CI is green.", "The failure is fixed before rerunning the failing check.", "Full logs were exhaustively analyzed if only excerpt/simulated log was provided."] };
  }
  async function prQualityGate(args = {}) {
    const root = await resolveGithubRoot(args.root || ".");
    const status = await gitValue(root.absolutePath, ["status", "--short"]);
    const changed = status.split(/\r?\n/).filter(Boolean).map((l) => l.slice(3).trim());
    const secret = githubSecretFileBlocked(changed);
    const unrelated = changed.filter((f) => /discovery\/daily-digest|\.tmp|node_modules|\.log$|scratch/i.test(f));
    const blockers = [];
    if (secret) blockers.push(`secret-like file changed: ${secret}`);
    if (!arrayify(args.test_commands_run).length) blockers.push("no test commands recorded");
    if (!String(args.pr_title || "").trim() || String(args.pr_title || "").length < 8) blockers.push("PR title missing or too vague");
    if (!String(args.pr_body || "").trim() || String(args.pr_body || "").length < 20) blockers.push("PR body missing useful summary/testing notes");
    if (unrelated.length) blockers.push("unrelated churn detected");
    return { operation_result: "reported", clean_worktree: changed.length === 0, changed_files: changed, unrelated_churn: unrelated, secret_like_files: secret ? [secret] : [], test_commands_run: arrayify(args.test_commands_run), ci_status: args.ci_status || "not_checked", github_execution_expectation: "For GitHub PR completion, verify exact pushed SHA plus PR/issue/Actions URL; dry-run or mocked command proof is not live GitHub proof.", pr_title_quality: blockers.some((b) => b.includes("title")) ? "weak" : "usable", pr_body_quality: blockers.some((b) => b.includes("body")) ? "weak" : "usable", blocked_reason: blockers.join("; ") || null, claim_status: blockers.length ? "not_ready" : "ready_to_claim_with_listed_evidence", result_can_be_claimed_done: blockers.length === 0, next_best_action: blockers[0] || "Open/update PR and verify CI for exact SHA." };
  }

  function formatPrQualityGate(g) { return [`vnem_tools_pr_quality_gate: ${g.claim_status}`, `changed=${g.changed_files.length}`, `blocked=${g.blocked_reason || "none"}`, `next=${g.next_best_action}`].join("\n"); }
  function formatTruthCheck(c) { return [`vnem_tools_task_progress_truth_check: ${c.status}`, `tested=${c.tested.length}`, `blocked=${c.blocked.length}`, `next=${c.next_action}`].join("\n"); }
  async function githubReleasePlan(args = {}) { return { operation_result: githubSettings().allow_releases ? "planned" : "blocked", config_knob_to_change: githubSettings().allow_releases ? null : "VNEM_TOOLS_GITHUB_ALLOW_RELEASES", tag: args.tag || "provide_tag", title: args.title || "provide_title", draft: args.draft !== false, next_best_action: githubSettings().allow_releases ? "Review tag/changelog and create draft release." : "Set VNEM_TOOLS_GITHUB_ALLOW_RELEASES = \"1\"." }; }
  async function githubReleaseCreate(args = {}) { if (!githubSettings().allow_releases) return githubBlockedResult("vnem_tools_github_release_create", "GitHub releases disabled by config.", "VNEM_TOOLS_GITHUB_ALLOW_RELEASES"); return githubGhMutation("vnem_tools_github_release_create", args, ["release", "create", args.tag, "--title", args.title || args.tag, "--notes", args.notes || "", ...(args.draft !== false ? ["--draft"] : [])], "draft_release", "release_url"); }
  async function githubRepoSettingsPlan(args = {}) { return { operation_result: "planned", allow_settings_mutation: githubSettings().allow_settings_mutation, config_knob_to_change: githubSettings().allow_settings_mutation ? null : "VNEM_TOOLS_GITHUB_ALLOW_SETTINGS_MUTATION", requested_settings: args.settings || {}, next_best_action: githubSettings().allow_settings_mutation ? "Review exact settings diff before apply." : "Set VNEM_TOOLS_GITHUB_ALLOW_SETTINGS_MUTATION = \"1\" to allow apply." }; }
  async function githubRepoSettingsApply(args = {}) { if (!githubSettings().allow_settings_mutation) return githubBlockedResult("vnem_tools_github_repo_settings_apply", "Repo settings mutation disabled by config.", "VNEM_TOOLS_GITHUB_ALLOW_SETTINGS_MUTATION"); return githubGhMutation("vnem_tools_github_repo_settings_apply", args, ["repo", "edit", ...(args.description ? ["--description", args.description] : [])], "repo_settings_plan", "settings_output"); }
  function formatGenericGithub(tool, result) { return [`${tool}: ${result.operation_result || "reported"}`, result.blocked_reason ? `blocked=${result.blocked_reason}` : null, result.config_knob_to_change ? `config_knob_to_change=${result.config_knob_to_change}` : null, result.next_best_action ? `next=${result.next_best_action}` : null].filter(Boolean).join("\n"); }
  function formatGithubDevelopment(tool, result) {
    return [
      `${tool}: ${result.operation_result || "reported"}`,
      result.verified === undefined ? null : `verified=${result.verified}`,
      result.summary ? `summary=${JSON.stringify(result.summary)}` : null,
      result.blocked_reason ? `blocked=${result.blocked_reason}` : null,
      result.safe_next_step ? `next=${result.safe_next_step}` : null
    ].filter(Boolean).join("\n");
  }

  function registerGithubTools(mcpServer) {
    mcpServer.registerTool("vnem_tools_github_status", { title: "GitHub Status", description: "Detect gh/git/auth/repo/profile/config readiness without printing tokens.", inputSchema: { root: z.string().default("."), repo: z.string().optional(), goal: z.string().default("") }, annotations: NETWORK_ACTION }, async (args) => withToolErrors(async () => { const result = await githubStatus(args); return toolResult(formatGithubStatus(result), { github_status: result }); }));
    mcpServer.registerTool("vnem_tools_github_settings_guide", { title: "GitHub Settings Guide", description: "Return the copy-pasteable GitHub config block and compact setting explanations.", inputSchema: {}, annotations: READ_ONLY_LOCAL }, async () => withToolErrors(async () => { const result = githubSettingsGuide(); return toolResult(formatGithubSettingsGuide(result), { github_settings_guide: result }); }));
    mcpServer.registerTool("vnem_tools_github_profile_status", { title: "GitHub Profile Status", description: "Show active GitHub profile, allowed/blocked actions, config source, and recommended profile.", inputSchema: { goal: z.string().default("") }, annotations: READ_ONLY_LOCAL }, async (args) => withToolErrors(async () => { const result = githubProfileStatus(args); return toolResult(formatGithubProfileStatus(result), { github_profile_status: result }); }));
    mcpServer.registerTool("vnem_tools_github_repo_inspect", { title: "GitHub Repo Inspect", description: "Inspect current/specified repo, branch, dirty state, commits, PRs/issues/CI if available, and build/test commands.", inputSchema: { root: z.string().default("."), remote: z.string().default("origin"), repo: z.string().optional(), simulate_github: z.boolean().default(false), max_bytes: z.number().int().min(1000).default(16000) }, annotations: NETWORK_ACTION }, async (args) => withToolErrors(async () => { const result = await githubRepoInspect(args); return toolResult(formatGithubRepoInspect(result), { github_repo_inspect: result }); }));
    mcpServer.registerTool("vnem_tools_github_diff_review", { title: "Review Local or GitHub PR Diff", description: "Inspect a bounded local Git range or live PR patch with file classification, workflow/dependency risk, hidden/bidi controls, secret-like additions, generated-only detection, and explicit semantic-review limits.", inputSchema: { root: z.string().default("."), pr: z.union([z.string(), z.number()]).optional(), base: z.string().default("origin/main"), head: z.string().default("HEAD"), max_bytes: z.number().int().min(8000).max(1048576).default(262144) }, annotations: NETWORK_READ }, async (args) => withToolErrors(async () => { const result = await runGithubDevelopmentRead(args, "inspect_prs", () => githubDevelopmentRuntime.diffReview(args)); return toolResult(formatGithubDevelopment("vnem_tools_github_diff_review", result), { github_diff_review: result }); }));
    mcpServer.registerTool("vnem_tools_github_review_threads", { title: "Inspect GitHub PR Review Threads", description: "Read up to 50 pull-request review threads with unresolved/resolved/outdated state, exact file/line context, bounded redacted comments, and honest pagination without replying or resolving.", inputSchema: { root: z.string().default("."), repo: z.string().optional(), pr: z.union([z.string(), z.number()]), include_resolved: z.boolean().default(false), limit: z.number().int().min(1).max(50).default(50) }, annotations: NETWORK_READ }, async (args) => withToolErrors(async () => { const result = await runGithubDevelopmentRead(args, "inspect_prs", () => githubDevelopmentRuntime.reviewThreads(args)); return toolResult(formatGithubDevelopment("vnem_tools_github_review_threads", result), { github_review_threads: result }); }));
    mcpServer.registerTool("vnem_tools_github_remote_proof", { title: "Verify Exact GitHub Remote PR and CI SHA", description: "Compare local HEAD, exact remote branch SHA, PR head SHA, and exact-head Actions runs; report worktree and configured/live base-branch protection without fetching, pushing, merging, or mutating.", inputSchema: { root: z.string().default("."), remote: z.string().default("origin"), branch: z.string().optional(), base: z.string().optional(), pr: z.union([z.string(), z.number()]).optional(), expected_sha: z.string().optional(), run_limit: z.number().int().min(1).max(20).default(10) }, annotations: NETWORK_READ }, async (args) => withToolErrors(async () => { const result = await runGithubDevelopmentRead(args, "inspect_repo", () => githubDevelopmentRuntime.remoteProof(args)); return toolResult(formatGithubDevelopment("vnem_tools_github_remote_proof", result), { github_remote_proof: result }); }));
    mcpServer.registerTool("vnem_tools_github_actions_run_inspect", { title: "Inspect GitHub Actions Jobs Steps and Logs", description: "Read one exact Actions run with job/step status and optional bounded failed or exact-job logs. Returns redacted high-signal lines and never reruns or mutates CI.", inputSchema: { root: z.string().default("."), run_id: z.union([z.string(), z.number()]), log_mode: z.enum(["none", "failed", "job"]).default("failed"), job_id: z.union([z.string(), z.number()]).optional(), max_bytes: z.number().int().min(4000).max(524288).default(98304) }, annotations: NETWORK_READ }, async (args) => withToolErrors(async () => { const result = await runGithubDevelopmentRead(args, "inspect_actions", () => githubDevelopmentRuntime.actionsRunInspect(args)); return toolResult(formatGithubDevelopment("vnem_tools_github_actions_run_inspect", result), { github_actions_run: result }); }));
    mcpServer.registerTool("vnem_tools_github_release_verify", { title: "Verify GitHub Release and Remote Tag Proof", description: "Read an exact GitHub release and remote tag, compare the peeled tag SHA with an optional expected SHA, and report draft/prerelease/assets state without creating, publishing, or changing a release.", inputSchema: { root: z.string().default("."), tag: z.string().min(1), remote: z.string().default("origin"), expected_sha: z.string().optional() }, annotations: NETWORK_READ }, async (args) => withToolErrors(async () => { const result = await runGithubDevelopmentRead(args, "inspect_repo", () => githubDevelopmentRuntime.releaseVerify(args)); return toolResult(formatGithubDevelopment("vnem_tools_github_release_verify", result), { github_release_verification: result }); }));
    mcpServer.registerTool("vnem_tools_github_public_surface_audit", { title: "Audit README and Public Repo Surface Consistency", description: "Compare a bounded README/package/public API surface for canonical repo links, Core/Tools naming, setup visibility, package metadata, front-page complexity, and simplification opportunities without crawling links or editing content.", inputSchema: { root: z.string().default("."), remote: z.string().default("origin"), paths: z.array(z.string()).max(12).default([]) }, annotations: READ_ONLY_LOCAL }, async (args) => withToolErrors(async () => { const result = await githubDevelopmentRuntime.publicSurfaceAudit(args); return toolResult(formatGithubDevelopment("vnem_tools_github_public_surface_audit", result), { github_public_surface_audit: result }); }));
    mcpServer.registerTool("vnem_tools_repo_intelligence_report", { title: "Repo Intelligence Report", description: "Return project type, build/test commands, important/risky paths, work risk, CI/PR/issue summaries, and next actions.", inputSchema: { root: z.string().default("."), remote: z.string().default("origin"), repo: z.string().optional(), simulate_github: z.boolean().default(false), max_bytes: z.number().int().min(1000).default(16000) }, annotations: NETWORK_ACTION }, async (args) => withToolErrors(async () => { const result = await repoIntelligenceReport(args); return toolResult(formatRepoIntelligence(result), { repo_intelligence_report: result }); }));
    mcpServer.registerTool("vnem_tools_github_branch_create", { title: "GitHub Branch Create", description: "Create a local feature branch; blocks a dirty worktree unless allow_dirty is explicitly selected and never overwrites an existing branch by default.", inputSchema: { root: z.string().default("."), branch: z.string().min(1), from: z.string().optional(), dry_run: z.boolean().default(true), allow_existing: z.boolean().default(false), allow_dirty: z.boolean().default(false) }, annotations: ACTION_TOOL }, async (args) => withToolErrors(async () => { const result = await githubBranchCreate(args); return toolResult(formatGenericGithub("vnem_tools_github_branch_create", result), { github_branch_create: result }); }));
    mcpServer.registerTool("vnem_tools_github_commit_push", { title: "GitHub Commit Push", description: "Commit selected safe files and push feature branches; blocks secrets, protected direct push, force push by default.", inputSchema: { root: z.string().default("."), files: z.array(z.string()).min(1), message: z.string().min(1), branch: z.string().optional(), remote: z.string().default("origin"), force: z.boolean().default(false), dry_run: z.boolean().default(true) }, annotations: NETWORK_ACTION }, async (args) => withToolErrors(async () => { const result = await githubCommitPush(args); return toolResult(formatGenericGithub("vnem_tools_github_commit_push", result), { github_commit_push: result }); }));
    mcpServer.registerTool("vnem_tools_github_pr_create", { title: "GitHub PR Create", description: "Create or dry-run a PR via gh.", inputSchema: { root: z.string().default("."), title: z.string().min(1), body: z.string().default(""), base: z.string().default("main"), head: z.string().default(""), draft: z.boolean().default(false), dry_run: z.boolean().default(true) }, annotations: NETWORK_ACTION }, async (args) => withToolErrors(async () => { const result = await githubPrCreate(args); return toolResult(formatGenericGithub("vnem_tools_github_pr_create", result), { github_pr_create: result }); }));
    mcpServer.registerTool("vnem_tools_github_pr_update", { title: "GitHub PR Update", description: "Update PR title/body/labels or comment via gh.", inputSchema: { root: z.string().default("."), pr: z.union([z.string(), z.number()]).optional(), number: z.union([z.string(), z.number()]).optional(), title: z.string().optional(), body: z.string().optional(), comment: z.string().optional(), add_labels: z.array(z.string()).default([]), remove_labels: z.array(z.string()).default([]), dry_run: z.boolean().default(true) }, annotations: NETWORK_ACTION }, async (args) => withToolErrors(async () => { const result = await githubPrUpdate(args); return toolResult(formatGenericGithub("vnem_tools_github_pr_update", result), { github_pr_update: result }); }));
    mcpServer.registerTool("vnem_tools_github_issue_create", { title: "GitHub Issue Create", description: "Create or dry-run issue via gh.", inputSchema: { root: z.string().default("."), title: z.string().min(1), body: z.string().default(""), labels: z.array(z.string()).default([]), dry_run: z.boolean().default(true) }, annotations: NETWORK_ACTION }, async (args) => withToolErrors(async () => { const result = await githubIssueCreate(args); return toolResult(formatGenericGithub("vnem_tools_github_issue_create", result), { github_issue_create: result }); }));
    mcpServer.registerTool("vnem_tools_github_issue_update", { title: "GitHub Issue Update", description: "Update issue title/body/state/labels via gh.", inputSchema: { root: z.string().default("."), issue: z.union([z.string(), z.number()]).optional(), number: z.union([z.string(), z.number()]).optional(), title: z.string().optional(), body: z.string().optional(), state: z.enum(["open", "closed"]).optional(), labels: z.array(z.string()).default([]), add_labels: z.array(z.string()).default([]), remove_labels: z.array(z.string()).default([]), dry_run: z.boolean().default(true) }, annotations: NETWORK_ACTION }, async (args) => withToolErrors(async () => { const result = await githubIssueUpdate(args); return toolResult(formatGenericGithub("vnem_tools_github_issue_update", result), { github_issue_update: result }); }));
    mcpServer.registerTool("vnem_tools_github_issue_comment", { title: "GitHub Issue/PR Comment", description: "Comment on issue or PR via gh.", inputSchema: { root: z.string().default("."), issue: z.union([z.string(), z.number()]).optional(), number: z.union([z.string(), z.number()]).optional(), body: z.string().default(""), comment: z.string().default(""), dry_run: z.boolean().default(true) }, annotations: NETWORK_ACTION }, async (args) => withToolErrors(async () => { const result = await githubIssueComment(args); return toolResult(formatGenericGithub("vnem_tools_github_issue_comment", result), { github_issue_comment: result }); }));
    mcpServer.registerTool("vnem_tools_github_labels_manage", { title: "GitHub Labels Manage", description: "Create/update labels via gh.", inputSchema: { root: z.string().default("."), name: z.string().min(1), color: z.string().optional(), description: z.string().optional(), exists: z.boolean().default(false), dry_run: z.boolean().default(true) }, annotations: NETWORK_ACTION }, async (args) => withToolErrors(async () => { const result = await githubLabelsManage(args); return toolResult(formatGenericGithub("vnem_tools_github_labels_manage", result), { github_labels_manage: result }); }));
    mcpServer.registerTool("vnem_tools_github_actions_status", { title: "GitHub Actions Status", description: "Read GitHub Actions status for current repo/branch/SHA.", inputSchema: { root: z.string().default("."), branch: z.string().optional(), sha: z.string().optional(), limit: z.number().int().min(1).max(30).default(10), simulate: z.boolean().default(false), max_bytes: z.number().int().min(1000).default(20000) }, annotations: NETWORK_ACTION }, async (args) => withToolErrors(async () => { const result = await githubActionsStatus(args); return toolResult(formatGenericGithub("vnem_tools_github_actions_status", result), { github_actions_status: result }); }));
    mcpServer.registerTool("vnem_tools_github_actions_rerun", { title: "GitHub Actions Rerun", description: "Rerun failed workflow/job when VNEM_TOOLS_GITHUB_ALLOW_ACTIONS_RERUN=1.", inputSchema: { root: z.string().default("."), run_id: z.union([z.string(), z.number()]), failed_only: z.boolean().default(true), dry_run: z.boolean().default(true) }, annotations: NETWORK_ACTION }, async (args) => withToolErrors(async () => { const result = await githubActionsRerun(args); return toolResult(formatGenericGithub("vnem_tools_github_actions_rerun", result), { github_actions_rerun: result }); }));
    mcpServer.registerTool("vnem_tools_github_ci_failure_triage", { title: "GitHub CI Failure Triage", description: "Fetch/summarize failing CI log information without huge dumps.", inputSchema: { root: z.string().default("."), run_id: z.union([z.string(), z.number()]).optional(), workflow: z.string().optional(), job: z.string().optional(), step: z.string().optional(), simulated_log: z.string().default(""), max_bytes: z.number().int().min(1000).default(24000) }, annotations: NETWORK_ACTION }, async (args) => withToolErrors(async () => { const result = await githubCiFailureTriage(args); return toolResult(`vnem_tools_github_ci_failure_triage: ${result.likely_cause}`, { ci_failure_triage: result }); }));
    mcpServer.registerTool("vnem_tools_pr_quality_gate", { title: "PR Quality Gate", description: "Pre-PR/final check for dirty tree, changed files, churn, secrets, tests, CI, and claim readiness.", inputSchema: { root: z.string().default("."), test_commands_run: z.array(z.string()).default([]), ci_status: z.string().default("not_checked"), pr_title: z.string().default(""), pr_body: z.string().default("") }, annotations: READ_ONLY_LOCAL }, async (args) => withToolErrors(async () => { const result = await prQualityGate(args); return toolResult(formatPrQualityGate(result), { pr_quality_gate: result }); }));
    mcpServer.registerTool("vnem_tools_task_progress_truth_check", { title: "Task Progress Truth Check", description: "Return done/partial/blocked/not-attempted/simulated-only status and what not to claim.", inputSchema: { goal: z.string().default(""), proven: z.array(z.string()).default([]), tested: z.array(z.string()).default([]), tests_run: z.array(z.string()).default([]), not_tested: z.array(z.string()).default([]), blockers: z.array(z.string()).default([]), blocked: z.array(z.string()).default([]), changed_files: z.array(z.string()).default([]), simulated_only: z.boolean().default(false), needs_user_action: z.boolean().default(false), claimed_done: z.boolean().default(false) }, annotations: READ_ONLY_LOCAL }, async (args) => withToolErrors(async () => { const result = taskProgressTruthCheck(args); return toolResult(formatTruthCheck(result), { task_progress_truth_check: result }); }));
    mcpServer.registerTool("vnem_tools_github_release_plan", { title: "GitHub Release Plan", description: "Plan draft release based on config.", inputSchema: { tag: z.string().default(""), title: z.string().default(""), notes: z.string().default(""), draft: z.boolean().default(true) }, annotations: READ_ONLY_LOCAL }, async (args) => withToolErrors(async () => { const result = await githubReleasePlan(args); return toolResult(formatGenericGithub("vnem_tools_github_release_plan", result), { github_release_plan: result }); }));
    mcpServer.registerTool("vnem_tools_github_release_create", { title: "GitHub Release Create", description: "Create draft release when releases are enabled.", inputSchema: { root: z.string().default("."), tag: z.string().min(1), title: z.string().default(""), notes: z.string().default(""), draft: z.boolean().default(true), dry_run: z.boolean().default(true) }, annotations: NETWORK_ACTION }, async (args) => withToolErrors(async () => { const result = await githubReleaseCreate(args); return toolResult(formatGenericGithub("vnem_tools_github_release_create", result), { github_release_create: result }); }));
    mcpServer.registerTool("vnem_tools_github_repo_settings_plan", { title: "GitHub Repo Settings Plan", description: "Plan repo settings mutation and show config knob.", inputSchema: { settings: z.record(z.any()).default({}) }, annotations: READ_ONLY_LOCAL }, async (args) => withToolErrors(async () => { const result = await githubRepoSettingsPlan(args); return toolResult(formatGenericGithub("vnem_tools_github_repo_settings_plan", result), { github_repo_settings_plan: result }); }));
    mcpServer.registerTool("vnem_tools_github_repo_settings_apply", { title: "GitHub Repo Settings Apply", description: "Apply limited settings mutation only when config-enabled.", inputSchema: { root: z.string().default("."), description: z.string().optional(), dry_run: z.boolean().default(true) }, annotations: NETWORK_ACTION }, async (args) => withToolErrors(async () => { const result = await githubRepoSettingsApply(args); return toolResult(formatGenericGithub("vnem_tools_github_repo_settings_apply", result), { github_repo_settings_apply: result }); }));
  }

  return {
    gitValue,
    githubAuthStatus,
    githubProfilePolicy,
    githubProfileStatus,
    githubSettings,
    parseGithubRepo,
    registerGithubTools
  };
}
