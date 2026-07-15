export function createToolsReliabilityRuntime({
  CLOUDFLARE_DESTRUCTIVE_APPROVAL_PHRASE,
  CLOUDFLARE_MUTATION_APPROVAL_PHRASE,
  activePermissionProfile,
  runtimeToolCatalog,
  githubSettings,
  githubProfilePolicy,
  arrayify
}) {
  function unsupportedActions() {
    return ["github_destructive_admin_without_config", "package_publish", "global_package_install", "unreviewed_package_lifecycle_execution", "deployment", "windows_system_mutation", "game_launch", "downloaded_mod_or_unknown_tool_execution", "generic_binary_game_format_patch", "arbitrary_shell", "unrestricted_api_calls", "secret_manager_backed_live_api", "search_engine_scraping", "automatic_captcha_bypass", "broad_crawling", "external_browser_browsing_by_default", "login_automation", "cookie_extraction", "session_extraction", "captcha_bypass", "giga_mcp"];
  }


  const RELIABILITY_LEVELS = {
    declared_only: "Tool exists but has no meaningful tests. Do not trust for serious work.",
    simulated_tested: "Tool passed mocked/simulated tests. Useful, but do not claim real external-world success.",
    command_path_tested: "Tool passed real command-construction and mocked-runner behavior tests; live external state still requires exact URL/SHA proof.",
    dry_run_tested: "Tool can plan safely without mutating anything.",
    local_tested: "Tool was tested locally against files/processes/local environment.",
    live_read_tested: "Tool completed bounded read-only proof against a real external service without mutating it.",
    live_tested_disposable: "Tool was tested against disposable real external resources.",
    production_safe_with_approval: "Tool is safe for production only with explicit approval, evidence, and rollback/repair plan."
  };
  function reliabilityDefinition(level) { return RELIABILITY_LEVELS[level] || RELIABILITY_LEVELS.declared_only; }
  function toolReliabilityFor(name, descriptor = {}) {
    const group = descriptor.capability_group || descriptor.group || "unknown";
    let level = "local_tested";
    let testedWith = ["deterministic local unit/smoke tests"];
    let safe = ["Tool shape and safety policy are available."];
    let unsafe = ["Do not claim production or external-world success without matching evidence."];
    let next = "Run the focused tool test plus an approved task-specific verification.";
    let known = [];
    if (/cloudflare_/.test(name)) {
      if (/_plan$|_status$|_auth_plan$|_accounts_list$|_projects_list$|_deploy_verify$/.test(name)) {
        level = name.includes("deploy_verify") ? "dry_run_tested" : "simulated_tested";
        safe = ["Cloudflare workflow policy, auth presence, planning, or simulated/read-only behavior is available with secret redaction."];
        unsafe = ["Real Cloudflare mutation succeeded", "Live production DNS/deploy/env/cache changed", "Cloudflare tokens or secrets are safe to print"];
        next = "Validate against a disposable Cloudflare account/project/zone with least-privilege auth before claiming live external success.";
      } else {
        level = "simulated_tested";
        safe = ["Approval gates, protected-resource checks, redaction, and simulated mutation evidence are tested."];
        unsafe = ["Real Cloudflare mutation succeeded", "Production-safe without explicit approval", "Live DNS/deploy/env/cache/rollback worked in the external world"];
        next = "Run one approved mutation on disposable Cloudflare resources and inspect the evidence pack before upgrading reliability.";
      }
      known = ["No cookies/sessions/browser-profile auth", "Live mutation requires user auth and exact approval", "Production claims require real evidence"];
    } else if (group === "github_autonomy") {
      level = name.includes("_diff_review") || name.includes("_review_threads") || name.includes("_remote_proof") || name.includes("_actions_run_inspect") || name.includes("_release_verify") ? "live_read_tested" : "command_path_tested";
      safe = ["GitHub settings/profile policy, bounded diff and review-thread reads, exact remote/PR/Actions SHA proof, structured job/step logs, release/tag verification, local repo intelligence, real gh/git command paths, dry-run non-mutation, selective-commit isolation, secret blocking, protected-branch checks, and config blockers are tested."];
      unsafe = ["Live GitHub remote mutation succeeded without an exact URL/SHA/run proof", "Force push/direct protected-branch push/repo delete/settings mutation are allowed by default", "Tokens are safe to print"];
      next = "Use bounded live reads on the exact repo/PR/run/tag, then verify exact SHA and URL before claiming remote state or mutation.";
      known = ["Command-backed gh/git execution requires auth for live remote reads and mutation", "Review-thread reads are page-bounded", "Diff scans do not replace semantic review", "Hard blocks remain for secret commits, default force push, default protected-branch direct push, repo delete/settings mutation unless configured"];
    } else if (group === "repo_power") {
      level = "local_tested";
      safe = ["Repo map, next-action ranking, no-placebo audit, impact/test planning, failure triage, compact evidence, and local session recovery are deterministic intelligence over allowed roots."];
      unsafe = ["Live GitHub/Cloudflare/deploy proof happened", "The whole repo was exhaustively understood", "All risks were eliminated"];
      next = "Run the focused POWER-TOOLS regression against the target repo and pair outputs with real command/test evidence before final claims.";
      known = ["No internet or GitHub auth required", "Secret paths blocked/redacted", "Outputs are compact heuristics, not omniscient proof"];
    } else if (["patching", "rollback", "project_tasks", "dev_server", "local_git", "commands"].includes(group)) {
      level = "local_tested";
      safe = ["Local dry-run and bounded approved local execution behavior is tested under allowed roots."];
      unsafe = ["Remote GitHub mutation", "Package install/publish/deploy", "Arbitrary shell execution", "Production deployment"];
      next = "Run the focused local tool test in the target repo and verify changed files/evidence before final claims.";
      known = ["Allowed roots only", "Secrets blocked/redacted", "Real mutation requires profile and approval"];
    } else if (["browser_proof", "ui_web_quality", "browser_intelligence"].includes(group)) {
      level = name.includes("browser_interaction_run") || name.includes("browser_evidence_compare") || name.includes("browser_evidence_run") || name.includes("browser_capture") ? "local_tested" : "dry_run_tested";
      safe = ["Localhost/file-under-allowed-root browser evidence planning or bounded local proof behavior is tested."];
      unsafe = ["Screenshot proof exists when browser was unavailable or blocked", "External browsing/login/session/CAPTCHA proof succeeded", "Accessibility or visual quality certification"];
      next = "Run bounded localhost browser evidence with VNEM_TOOLS_ALLOW_LOCALHOST=1 and inspect screenshot/DOM/a11y metadata.";
      known = ["No login/cookie/session/CAPTCHA automation", "External browser automation blocked by default", "Unavailable browser runtime must be reported honestly"];
    } else if (group === "windows_local") {
      level = name.endsWith("_change_plan") || name.endsWith("_command_plan") ? "dry_run_tested" : "local_tested";
      safe = ["Bounded exact-target Windows reads, safe PowerShell quoting, provider fallbacks, redaction, and non-executing mutation gates are tested through real local stdio MCP."];
      unsafe = ["Any service/registry/task/firewall/antivirus/PATH/machine setting changed", "Security controls were disabled", "Command lines, config contents, credentials, or environment values were collected", "Universal Windows compatibility"];
      next = "Run only the exact read-only probe needed; for mutation, require a separately implemented executor plus scoped local_pc_action approval and rollback evidence.";
      known = ["Windows provider access can be unavailable", "CIM falls back to exact Get-Process/Get-Service reads", "File-lock owner identity remains unproven", "System mutation is not implemented"];
    } else if (group === "game_domain") {
      level = "local_tested";
      safe = ["Bounded allowed-root inventory, structured config/manifest checks, hashes, compatibility, Roblox/Luau mapping, and approval-gated package backup/restore behavior are tested through real local stdio MCP."];
      unsafe = ["A game or Roblox Studio was launched", "Static checks prove runtime compatibility", "Unknown tools or downloaded mods executed", "Guarded binary formats were generically parsed, patched, or repacked"];
      next = "Confirm exact game/version/platform/loader/toolchain, create an isolated backup before mutation, then run the project and game-specific validator.";
      known = ["XML and Lua/Luau checks have explicit parser/static limits", "Semantic version ranges need a loader-specific resolver", "Backup packages preserve bytes but not external mod-manager state"];
    } else if (group === "dependency_security") {
      level = name.includes("install_apply") || name.includes("transaction_rollback") ? "local_tested" : name.includes("advisory_audit") ? "live_read_tested" : "local_tested";
      safe = ["Bounded manifest/lock graph inspection, SBOM inventory, lifecycle/source/license indicators, approved advisory evidence, exact upgrade plans, and approval-gated script-disabled npm transactions are tested through real local stdio MCP."];
      unsafe = ["A static risk indicator proves malware or legal incompatibility", "A stale or single-source advisory report proves no vulnerabilities", "Package lifecycle scripts, global installs, publishing, or unreviewed downloaded binaries executed", "Non-npm mutation has rollback support"];
      next = "Inspect graph/risk/advisory evidence, create an exact hash-bound plan, use approved-installs with explicit approval, and verify the transaction plus rollback evidence.";
      known = ["Automatic mutation is npm-only", "Lifecycle scripts and registry credentials are disabled", "Current advisories require an approved fresh source", "Binary-running verification scripts need separate explicit approval"];
    } else if (["structural_code", "structural_refactoring"].includes(group)) {
      level = "local_tested";
      safe = ["Babel AST and lexical-binding analysis, explicit heuristic confidence, incremental persistence, hash-bound rename previews, focused verification, post-reference checks, and transaction rollback are tested through real local stdio MCP."];
      unsafe = ["Heuristic-language results are compiler-grade", "Dynamic/reflection/generated/external consumers were exhaustively resolved", "Move or extract automatic apply is supported", "A dead-code candidate is safe to delete", "Cross-file filesystem atomicity exists"];
      next = "Build the index, inspect exact references and impact, preview the refactor, then use approved apply only when confidence is high and verify the transaction plus rollback evidence.";
      known = ["Automatic apply is limited to Babel-resolved rename", "Public exports require acknowledgement", "Graph and reference bounds block exact apply when reached", "Tests and type/compiler checks remain project-specific"];
    } else if (["api_connectors", "api_request", "search", "research_sources", "source_ingestion", "browsing_risk", "research_matrix"].includes(group)) {
      level = descriptor.network ? "dry_run_tested" : "local_tested";
      safe = ["Planning, bounded local/source evidence, or configured-provider behavior is tested without fake current/live claims."];
      unsafe = ["Unrestricted crawling or API access", "Search/current facts were fetched when provider was unconfigured", "Secret-backed live API success without proof"];
      next = "Use configured provider credentials or explicit approved URL/API call and capture source/evidence IDs.";
      known = ["No search-engine scraping by default", "No login/cookie/session/CAPTCHA bypass", "Secret headers are blocked/redacted"];
    } else if (group === "tool_intelligence" || group === "tools_quality" || group === "permissions" || group === "status_readiness") {
      level = "local_tested";
      safe = ["Local policy/intelligence output is tested against deterministic cases."];
      unsafe = ["A reviewed action executed", "External mutation succeeded", "All future gaps are implemented"];
      next = "Use the review/recovery/gap output before the specific high-power tool executes.";
    }
    return { level, meaning: reliabilityDefinition(level), tested_with: testedWith, safe_to_claim: safe, unsafe_to_claim: unsafe, next_validation_step: next, known_limits: known };
  }
  function addReliabilityFields(tool) {
    const reliability = toolReliabilityFor(tool.name, tool);
    return { ...tool, high_power: tool.high_power ?? Boolean(tool.mutation || tool.network || tool.requires_approval || ["cloudflare_control", "github_autonomy", "structural_refactoring", "patching", "rollback", "project_tasks", "dev_server", "browser_proof", "ui_web_quality", "dependency_security", "api_connectors", "api_request", "local_git", "commands"].includes(tool.capability_group)), mutation_capable: Boolean(tool.mutation), reliability_level: reliability.level, tested_with: reliability.tested_with, safe_to_claim: reliability.safe_to_claim, unsafe_to_claim: reliability.unsafe_to_claim, next_validation_step: reliability.next_validation_step, known_limits: reliability.known_limits, tool_reliability: reliability };
  }
  function buildReliabilityCatalog(args = {}) { const tools = runtimeToolCatalog().filter((tool) => !args.capability_group || tool.capability_group === args.capability_group); return { generated_at: new Date().toISOString(), permission_profile: activePermissionProfile.profile_name, tools }; }
  function formatReliabilityCatalog(catalog) { return [`vnem_tools_reliability_catalog: ${catalog.tools.length} tool(s)`, `profile=${catalog.permission_profile}`, `levels=${[...new Set(catalog.tools.map((tool) => tool.reliability_level))].join(",")}`].join("\n"); }
  function operationStateFor(result = {}) { if (result.blocked_reason || result.blocked) return "blocked"; if (result.dry_run === true || result.dry_run_only === true) return "dry_run_or_plan"; if (result.source === "simulated" || result.simulated === true || result.verification?.status === "simulated") return "simulated"; if (result.applied || result.executed || result.started || result.committed || result.evidence_pack_path) return "executed_with_evidence"; if (result.ok === false || result.success === false) return "failed"; return "reported"; }
  function decorateToolResult(toolName, result = {}, extras = {}) {
    const reliability = toolReliabilityFor(toolName, { capability_group: extras.capability_group, mutation: extras.mutation, network: extras.network, requires_approval: extras.requires_approval });
    const opState = operationStateFor(result);
    const approvalRequired = extras.requires_approval || result.approval_required || result.destructive_approval_required || result.action_policy_preview?.requires_approval;
    const approvalState = result.dry_run === true || result.dry_run_only === true ? "not_needed_for_dry_run" : approvalRequired ? (result.approval_state || "approval_required_for_real_action") : "not_required";
    return { ...result, operation_state: result.operation_state || opState, permission_state: result.permission_state || activePermissionProfile.profile_name, approval_state: result.approval_state || approvalState, evidence_state: result.evidence_state || (result.evidence_log_id || result.evidence_pack_path ? "evidence_logged" : opState === "dry_run_or_plan" ? "plan_only_no_mutation_evidence" : "evidence_not_required_or_unavailable"), reliability_level: result.reliability_level || reliability.level, tool_reliability: result.tool_reliability || reliability, safe_to_claim: Object.hasOwn(result, "safe_to_claim") ? result.safe_to_claim : reliability.safe_to_claim, unsafe_to_claim: Object.hasOwn(result, "unsafe_to_claim") ? result.unsafe_to_claim : reliability.unsafe_to_claim, next_best_action: result.next_best_action || reliability.next_validation_step, blocked_reason: result.blocked_reason || null };
  }
  function decorateCloudflareResult(operation, result = {}, args = {}) {
    const toolName = operation.startsWith("vnem_tools_") ? operation : `vnem_tools_cloudflare_${operation}`;
    const reliability = toolReliabilityFor(toolName, { capability_group: "cloudflare_control", mutation: /deploy|apply|rollback|purge/.test(operation) && !/plan|verify|status|auth|list/.test(operation), network: true, requires_approval: true });
    const mutationCapable = /deploy$|apply$|rollback$|purge$/.test(operation);
    const dryOrPlan = result.dry_run === true || result.dry_run_only === true || /plan|status|auth|list|verify/.test(operation);
    const mutationState = result.simulated === true
      ? "simulated_no_mutation"
      : result.mutated === true && result.provider_success === true
        ? "real_mutation_provider_success_with_evidence"
        : result.evidence_pack_path
          ? "mutation_attempted_outcome_requires_evidence_review"
          : dryOrPlan
            ? "planned_or_dry_run_no_mutation"
            : "mutation_state_unknown";
    const approvalState = result.approval_verified === true
      ? (result.destructive_approval_verified === true ? "destructive_approval_verified" : "mutation_approval_verified")
      : mutationCapable
        ? (args.approval_phrase ? "approval_phrase_supplied_unverified_here" : "approval_required_for_real_mutation")
        : "not_required_for_read_or_plan";
    return { ...result, tool_reliability: result.tool_reliability || reliability, auth_state: result.auth_state || (process.env.CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN || process.env.CF_TOKEN ? "api_token_present_value_redacted" : "not_authenticated_or_wrangler_login_unknown"), mutation_state: result.mutation_state || (mutationCapable ? mutationState : "read_or_plan_only"), approval_state: result.approval_state || approvalState, evidence_state: result.evidence_state || (result.evidence_pack_path ? "evidence_pack_written" : dryOrPlan ? "plan_or_read_only_no_mutation_evidence" : "evidence_unavailable"), safe_to_claim: Object.hasOwn(result, "safe_to_claim") ? result.safe_to_claim : reliability.safe_to_claim, unsafe_to_claim: Object.hasOwn(result, "unsafe_to_claim") ? result.unsafe_to_claim : reliability.unsafe_to_claim, next_validation_step: result.next_validation_step || reliability.next_validation_step };
  }
  function buildActionRecoveryPlan(args = {}) {
    const text = `${args.tool_name || ""} ${args.operation || ""} ${args.error_code || ""} ${args.stderr || ""} ${args.stdout || ""} ${args.context || ""}`;
    const lower = text.toLowerCase();
    const profile = args.permission_profile || activePermissionProfile.profile_name;
    const plan = { likely_cause: "Tool failed or was blocked; inspect code/stdout/stderr and recover with the narrowest safe retry.", blocked_by_permission: false, blocked_by_missing_auth: false, blocked_by_missing_dependency: false, blocked_by_path_or_allowed_root: false, blocked_by_approval: false, blocked_by_network_or_provider: false, exact_next_steps: [], safe_retry_allowed: false, retry_requires_approval: false, what_not_to_do: ["Do not fake success.", "Do not bypass permission profiles.", "Do not expose secrets."], must_not_claim: ["The action succeeded", "External-world state changed", "Evidence exists when it was not produced"] };
    if (/cloudflare|wrangler/.test(lower) && /(auth|token|login|unauthorized|forbidden|account_id|required|api_token|not authenticated)/.test(lower)) { plan.likely_cause = "Cloudflare authentication or account/project context is missing."; plan.blocked_by_missing_auth = true; plan.exact_next_steps.push("Run `npx wrangler login` and verify with `npx wrangler whoami`, or set CLOUDFLARE_API_TOKEN/CLOUDFLARE_ACCOUNT_ID (or CF_API_TOKEN/CF_ACCOUNT_ID) outside the repo."); plan.exact_next_steps.push("Retry read-only discovery first; only attempt mutation after plan output and exact approval phrase."); }
    if (/approval|approved|mutation_approval|destructive_approval/.test(lower)) { plan.likely_cause = "Required approval phrase or approval note was missing or did not match exactly."; plan.blocked_by_approval = true; const destructive = /destructive|delete|rollback|purge_everything/.test(lower); plan.exact_next_steps.push(`If the user intends this action, provide exact phrase: ${destructive ? CLOUDFLARE_DESTRUCTIVE_APPROVAL_PHRASE : CLOUDFLARE_MUTATION_APPROVAL_PHRASE}.`); plan.retry_requires_approval = true; }
    if (/outside_allowed|allowed root|allowed_roots|path_outside|not inside|evidence_root_outside|root/.test(lower) && /path|root|allowed/.test(lower)) { plan.likely_cause = "Requested path is outside VNEM Tools allowed roots or evidence root policy."; plan.blocked_by_path_or_allowed_root = true; plan.exact_next_steps.push("Move the target under an allowed project root or start Tools MCP with VNEM_TOOLS_ALLOWED_ROOTS set to the narrow project root."); plan.exact_next_steps.push("Run vnem_tools_permission_status to see current allowed_roots and workspace_fix_suggestion."); }
    if (/browser_unavailable|chromium|chrome|browser.*not found|playwright|screenshot/.test(lower)) { plan.likely_cause = "Browser runtime was unavailable or blocked by policy, so visual proof was not collected."; plan.blocked_by_missing_dependency = true; plan.exact_next_steps.push("Install/configure a local Chromium/Chrome command or set VNEM_TOOLS_BROWSER_COMMAND, then retry only against localhost/allowed file targets with approval."); plan.exact_next_steps.push("If a browser cannot run, use static UI evidence only and do not claim screenshot/browser proof."); plan.must_not_claim.push("Screenshot proof was captured", "Browser console/network/a11y proof was clean"); }
    if (/network|provider|timeout|fetch|dns|econn|enotfound|429|rate limit|unconfigured/.test(lower)) { plan.blocked_by_network_or_provider = true; plan.exact_next_steps.push("Check provider configuration and network availability; retry read-only/dry-run first with capped output."); }
    if (/github|\bgh\b|pull request|\bpr\b|issue|actions|workflow|ci|push|force-push|protected branch/.test(lower)) {
      if (/gh.*not found|gh unavailable|not authenticated|auth|token/.test(lower)) { plan.likely_cause = "GitHub CLI/auth is unavailable for remote GitHub work."; plan.blocked_by_missing_auth = true; plan.exact_next_steps.push("Authenticate gh with `gh auth login`; never print token values."); plan.exact_next_steps.push("Run `gh auth setup-git` so git push can use GitHub credentials."); }
      if (/protected branch|direct push/.test(lower)) { plan.blocked_by_permission = true; plan.exact_next_steps.push("Use a feature branch + PR, or set VNEM_TOOLS_GITHUB_ALLOW_DIRECT_PUSH = \"1\" if direct protected-branch push is intentionally allowed."); }
      if (/force push|force-push/.test(lower)) { plan.blocked_by_permission = true; plan.exact_next_steps.push("Avoid force push, or set VNEM_TOOLS_GITHUB_ALLOW_FORCE_PUSH = \"1\" if force push is intentionally allowed."); }
      if (/repo delete|delete repo/.test(lower)) { plan.blocked_by_permission = true; plan.exact_next_steps.push("Repo deletion is blocked by default; set VNEM_TOOLS_GITHUB_ALLOW_REPO_DELETE = \"1\" only for explicit owner-approved deletion tooling."); }
    }
    if (/permission profile|safe-readonly|dangerous-disabled|profile_blocked/.test(lower)) { plan.blocked_by_permission = true; plan.exact_next_steps.push(`Current/selected profile (${profile}) blocks this action; switch only intentionally to the narrow profile needed and rerun policy preview first.`); }
    if (/build failed|test failed|exit code|non-zero|npm/.test(lower)) { plan.likely_cause = "Local build/test/project task failed before the next action."; plan.exact_next_steps.push("Fix the first build/test error, rerun the same local check, and do not deploy or claim success until it passes."); plan.must_not_claim.push("Build passed", "Deploy was attempted after failed build"); }
    if (!plan.exact_next_steps.length) plan.exact_next_steps.push("Run the tool's dry-run/plan mode, inspect structured error details, then retry only after the blocker is removed.");
    plan.safe_retry_allowed = !plan.blocked_by_approval && !plan.blocked_by_permission && !plan.blocked_by_missing_auth && !plan.blocked_by_missing_dependency;
    plan.repo_power_next_tool = /build failed|test failed|exit code|non-zero|npm|assert|cannot find|generated|stale|ebusy|eperm|auth|network/.test(lower) ? "vnem_tools_failure_triage" : "vnem_tools_next_action_ranker";
    plan.no_placebo_followup = "Use vnem_tools_no_placebo_progress_audit before claiming a batch is complete when proof is weak, mocked-only, docs-only, tests-only, or generated-only.";
    return plan;
  }
  function highPowerActionReview(args = {}) {
    const profile = activePermissionProfile.profile_name;
    const tool = String(args.tool_name || "");
    const mutationType = String(args.mutation_type || args.operation || "").toLowerCase();
    const combined = `${tool} ${args.operation || ""} ${args.target || ""} ${mutationType} ${args.expected_effect || ""}`;
    const destructive = args.destructive === true || /delete|destroy|rollback|purge_everything|reset|remove/.test(combined.toLowerCase());
    const mutation = destructive || /deploy|apply|commit|patch|restore|server|api_request|env|secret|dns|purge|rollback|mutation/.test(combined.toLowerCase());
    const protectedRisk = [...new Set([...arrayify(args.protected_resources), ...(/root|apex|www|mx|spf|dkim|dmarc|production|prod/i.test(combined) ? ["protected_or_production_resource_signal"] : [])])];
    const secretRisk = /secret|token|api[_-]?key|authorization|bearer|password|credential|\.env/i.test(combined);
    const productionRisk = /production|prod|apex|root|www|mx|dns|deploy|rollback|cache/i.test(combined);
    const approvalRequired = mutation;
    const destructiveApprovalRequired = destructive;
    let approvalPhraseNeeded = approvalRequired ? "Set approved=true with a specific human approval_note for local Tools actions." : "";
    if (/cloudflare/.test(combined.toLowerCase())) approvalPhraseNeeded = destructive ? CLOUDFLARE_DESTRUCTIVE_APPROVAL_PHRASE : CLOUDFLARE_MUTATION_APPROVAL_PHRASE;
    const reasons = [];
    if (profile === "dangerous-disabled") reasons.push("Current permission profile dangerous-disabled blocks high-power and Cloudflare actions.");
    if (profile === "safe-readonly" && mutation) reasons.push("Current permission profile safe-readonly blocks mutation/execution.");
    if (profile === "safe-local-dev" && mutation && !/plan|dry/i.test(combined)) reasons.push("safe-local-dev allows planning/dry-run only, not real mutation.");
    if (approvalRequired && !args.approval_phrase) reasons.push("Approval is required before execution.");
    if (destructiveApprovalRequired && args.approval_phrase !== CLOUDFLARE_DESTRUCTIVE_APPROVAL_PHRASE) reasons.push("Destructive/high-impact action needs the exact destructive approval phrase.");
    else if (/cloudflare/.test(combined.toLowerCase()) && approvalRequired && !destructive && args.approval_phrase !== CLOUDFLARE_MUTATION_APPROVAL_PHRASE) reasons.push("Cloudflare mutation needs the exact mutation approval phrase.");
    if (protectedRisk.length && destructive && !String(args.approval_phrase || "").includes("DESTRUCTIVE")) reasons.push("Protected resource risk requires explicit protected-resource review before mutation.");
    const githubReview = githubReviewFor(combined);
    for (const reason of githubReview.reasons_to_block) reasons.push(reason);
    return { action_allowed: reasons.length === 0, permission_profile: profile, github_profile: githubSettings().profile, approval_required: approvalRequired, destructive_approval_required: destructiveApprovalRequired, protected_resource_risk: protectedRisk, secret_risk: secretRisk, production_risk: productionRisk, rollback_or_repair_needed: mutation || productionRisk || destructive, safest_execution_path: safestExecutionPathFor(combined, destructive, secretRisk), reasons_to_block: [...new Set(reasons)], approval_phrase_needed: approvalPhraseNeeded, config_knob_to_change: githubReview.config_knob_to_change, github_allowed_actions: githubReview.allowed_actions, must_not_do: ["Do not bypass permission profiles.", "Do not print or commit secrets.", "Do not claim success without evidence.", destructive ? "Do not run destructive action without exact destructive approval and repair plan." : null].filter(Boolean) };
  }
  function githubReviewFor(text) {
    const lower = String(text || "").toLowerCase();
    if (!/github|\bgh\b|pull request|\bpr\b|issue|actions|workflow|git push|force push|repo settings|release/.test(lower)) return { reasons_to_block: [], config_knob_to_change: null, allowed_actions: [] };
    const settings = githubSettings();
    const policy = githubProfilePolicy(settings.profile);
    const reasons = [];
    let knob = null;
    if (!policy.github_enabled) { reasons.push("GitHub tools disabled by VNEM_TOOLS_GITHUB_PROFILE=off."); knob = "VNEM_TOOLS_GITHUB_PROFILE"; }
    if (/force push|force-push/.test(lower) && !settings.allow_force_push) { reasons.push("Force push blocked by default."); knob = "VNEM_TOOLS_GITHUB_ALLOW_FORCE_PUSH"; }
    if (/main|master|production|protected branch|direct push/.test(lower) && /push/.test(lower) && !settings.allow_direct_push) { reasons.push("Direct push to protected branch blocked by default; use feature branch + PR."); knob = knob || "VNEM_TOOLS_GITHUB_ALLOW_DIRECT_PUSH"; }
    if (/delete repo|repo delete/.test(lower) && !settings.allow_repo_delete) { reasons.push("Repo deletion blocked by default."); knob = knob || "VNEM_TOOLS_GITHUB_ALLOW_REPO_DELETE"; }
    if (/settings/.test(lower) && !settings.allow_settings_mutation) { reasons.push("Repo settings mutation blocked by default."); knob = knob || "VNEM_TOOLS_GITHUB_ALLOW_SETTINGS_MUTATION"; }
    if (/rerun|actions/.test(lower) && !settings.allow_actions_rerun) { reasons.push("Actions rerun disabled by config."); knob = knob || "VNEM_TOOLS_GITHUB_ALLOW_ACTIONS_RERUN"; }
    return { reasons_to_block: reasons, config_knob_to_change: knob, allowed_actions: policy.allowed_actions };
  }
  function safestExecutionPathFor(text, destructive, secretRisk) {
    const lower = text.toLowerCase();
    if (lower.includes("github") || lower.includes("pull request") || lower.includes(" pr ") || lower.includes("issue") || lower.includes("actions") || lower.includes("git push")) return ["Run GitHub status/profile status first.", "Use feature branch + PR for protected branches.", "Use explicit file lists; block .env/secrets; verify exact PR/issue/CI URL or run before claiming."];
    if (lower.includes("git")) return ["Run git status/diff first.", "Use explicit file list only.", "Create local commit or GitHub feature-branch push only through scoped GitHub autonomy tools."];
    if (lower.includes("api")) return ["Dry-run the request plan.", "Use GET/HEAD only unless a future scoped mutator exists.", "Keep auth as secret refs and redact outputs."];
    if (lower.includes("cloudflare")) return ["Run status/read-only discovery first.", "Run plan tool and inspect protected-resource risks.", "Use Wrangler first for deploys and API where needed.", destructive ? "Prepare repair/rollback plan before exact destructive approval." : "Provide exact mutation approval only after plan review."];
    if (lower.includes("patch") || lower.includes("restore")) return ["Dry-run batch first.", "Review changed files and restore plan.", "Apply only under allowed roots with approval."];
    if (lower.includes("server")) return ["Dry-run dev server command.", "Bind localhost only.", "Stop only Tools-started server IDs."];
    return ["Dry-run/plan first.", "Use the narrowest permission profile.", secretRisk ? "Use secret references/redaction only." : "Collect evidence before claiming success."];
  }
  function capabilityGapReport() {
    const gaps = [
      ["GitHub destructive admin operations", "GitHub autonomy now covers profile-gated repo inspection, feature branches, commits, feature pushes, PRs, issues, labels, CI status/rerun, triage, and draft releases; repo delete, force push, protected direct push, and settings mutation remain config-blocked by default.", "Use maintainer profile for normal repo work; change exact VNEM_TOOLS_GITHUB_* knobs only when intentionally needed.", "More granular owner/admin tools with audited repo settings/delete flows and live disposable validation.", "Could delete repos, force-push away history, mutate protected branches, or leak tokens if added badly.", "medium"],
      ["non-npm dependency mutation", "Bounded inspection supports several ecosystems, but automatic install/rollback mutation is npm-only.", "Use inventory/risk/advisory/change tools for any supported ecosystem and the exact npm transaction tools only for npm projects.", "Equivalent lock-aware transaction and rollback adapters for pnpm, Yarn, Python, Cargo, and Go.", "Lifecycle execution, credential leakage, or unrecoverable lockfile churn if added without ecosystem-specific contracts.", "medium"],
      ["arbitrary shell", "Tools MCP only runs allowlisted commands/tasks, not arbitrary shell.", "Use vnem_tools_run_project_task or allowed verification commands.", "A bounded shell executor with policy parser, no secret env exposure, approval, and evidence.", "Destructive commands or credential exfiltration.", "high"],
      ["unrestricted crawling", "Broad crawling is blocked; extraction requires explicit bounded targets.", "Use source_map/source_extract/browser page tools on explicit URLs/files.", "Crawl budget, robots/rate policy, auth/session prohibition, and evidence caps.", "Legal/abuse risk, CAPTCHA traps, fake completeness claims.", "medium"],
      ["automatic CAPTCHA bypass", "CAPTCHA bypass and anti-bot evasion are blocked.", "Use user-assisted handoff and alternate official sources/APIs.", "Nothing automatic should be added; only safe human handoff patterns.", "Abuse, policy violations, account risk.", "blocked"],
      ["secret-manager-backed live API calls", "Secret-manager integration and live external API auth are limited/unknown.", "Use env presence checks and dry-run request planning without printing values.", "Secret-ref resolver with scoped providers, audit logs, redaction, and tests against disposable accounts.", "Secret leakage or accidental real-world mutation.", "medium"],
      ["broad external browser automation", "External browser automation/login/cookies/sessions are blocked by default.", "Use localhost/file proof or static browser-intelligence tools.", "A scoped browser sandbox with no persistent profile, explicit approvals, and strict URL allowlists.", "Credential capture, session misuse, scraping/anti-bot violations.", "high"]
    ];
    return { generated_at: new Date().toISOString(), missing_or_limited_capabilities: gaps.map(([capability, why_limited, current_safe_alternative, what_would_be_needed_to_add, risk_if_added_badly, priority]) => ({ capability, why_limited, current_safe_alternative, what_would_be_needed_to_add, risk_if_added_badly, priority })) };
  }
  function formatActionRecoveryPlan(plan) { return [`vnem_tools_action_recovery_plan: ${plan.likely_cause}`, `safe_retry_allowed=${plan.safe_retry_allowed}`, `retry_requires_approval=${plan.retry_requires_approval}`, `next=${plan.exact_next_steps[0] || "none"}`].join("\n"); }

  return {
    addReliabilityFields,
    buildActionRecoveryPlan,
    buildReliabilityCatalog,
    capabilityGapReport,
    decorateCloudflareResult,
    decorateToolResult,
    formatActionRecoveryPlan,
    formatReliabilityCatalog,
    highPowerActionReview,
    unsupportedActions
  };
}
