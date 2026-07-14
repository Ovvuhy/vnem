import { createHash } from "node:crypto";

const MAX_DECISIONS = 64;
const decisionStore = new Map();

const DOMAIN_ADAPTERS = [
  adapter("testing_ci", "Testing, CI, coverage, and benchmarks", 10, [
    feature(/\b(test discovery|affected tests?|test graph|test runner|test tier|coverage|changed[- ]line coverage|benchmark history|performance regression)\b/, 6, "test-system, coverage, or benchmark requirement"),
    feature(/\b(ci|workflow|github actions|job|failing step|flaky|retry|runtime deprecation|ebusy|port collision|stale generated)\b/, 4, "CI or test-reliability signal")
  ], ["affected verification", "failure classification", "coverage honesty", "performance evidence"], ["vnem_tools_test_system_inspect", "vnem_tools_affected_test_graph", "vnem_tools_test_run", "vnem_tools_ci_failure_diagnose", "vnem_tools_coverage_benchmark_report"]),
  adapter("debugging", "Debugging and failure diagnosis", 10, [
    feature(/\b(debug|failing|failure|failed|error|stack trace|broken|root cause|repair)\b/, 5, "failure evidence or repair intent"),
    feature(/\b(ci fail|test fail|crash|exception|log)\b/, 4, "runtime or test failure signal")
  ], ["correctness", "diagnostic evidence", "regression safety"], ["vnem_tools_failure_triage", "vnem_tools_patch_target_finder", "vnem_tools_test_selection_plan"]),
  adapter("github_publish", "GitHub publishing and remote proof", 9, [
    feature(/\b(github|pull request|\bpr\b|push|remote sha|actions|release|branch|merge)\b/, 5, "remote repository intent"),
    feature(/\b(publish|remote proof|head sha|workflow run)\b/, 4, "publish or remote-proof requirement")
  ], ["remote truth", "branch safety", "diff and review quality", "CI evidence", "repair or rollback guidance"], ["vnem_tools_github_status", "vnem_tools_github_diff_review", "vnem_tools_github_remote_proof", "vnem_tools_github_actions_status", "vnem_tools_pr_quality_gate"]),
  adapter("browser_ui", "Browser and UI verification", 8, [
    feature(/\b(browser|localhost|screenshot|viewport|responsive|\bdom\b|accessibility|a11y|visual proof)\b/, 5, "browser or visual-proof requirement"),
    feature(/\b(ui|frontend|page|component|rendered states?)\b/, 3, "user-interface surface")
  ], ["visual correctness", "accessibility", "responsive behavior", "runtime interaction evidence"], ["vnem_tools_ui_surface_review", "vnem_tools_browser_evidence_plan", "vnem_tools_browser_interaction_run", "vnem_tools_browser_evidence_compare", "vnem_tools_ui_evidence_audit", "vnem_tools_browser_evidence_run"]),
  adapter("app_engineering", "Application engineering", 7, [
    feature(/\b(full[- ]?stack|frontend|backend|web app|application|api endpoint|react|vue|svelte|next\.?js|express)\b/, 5, "application stack or feature"),
    feature(/\b(build|implement|add|create)\b.*\b(endpoint|component|page|frontend|backend|api|service|app)\b/, 4, "application implementation deliverable")
  ], ["architecture", "correctness", "maintainability", "user experience"], ["vnem_tools_app_inspect", "vnem_tools_app_vertical_slice_plan", "vnem_tools_repo_deep_map", "vnem_tools_app_vertical_slice_apply", "vnem_tools_app_acceptance_run", "vnem_tools_app_transaction_rollback"]),
  adapter("project_automation", "Terminal and project automation", 7, [
    feature(/\b(terminal|shell command|package script|task runner|task graph|dev server|local server|listening port|orphan process|command timeout|file lock|temp cleanup)\b/, 6, "terminal, task, process, or project-runtime workflow"),
    feature(/\b(run|execute|resume|stop|diagnose)\b.*\b(task graph|package script|terminal command|dev server|local server)\b/, 4, "explicit project automation action")
  ], ["execution correctness", "process cleanup", "resumability", "rollback evidence"], ["vnem_tools_project_automation_inspect", "vnem_tools_project_command_run", "vnem_tools_project_task_graph_plan", "vnem_tools_project_task_graph_run", "vnem_tools_project_runtime_diagnose", "vnem_tools_project_temp_cleanup"]),
  adapter("repo_code", "Repository and code work", 6, [
    feature(/\b(repo|repository|source code|codebase|function|class|symbol|handler|patch|refactor|implementation)\b/, 4, "repository or code signal"),
    feature(/\b(edit|change|modify|test|registry|artifact|generated file)\b/, 2, "source-change or validation signal"),
    feature(/\b(test selection|tests? for changes|mcp registry|tools mcp)\b/, 4, "repository test or MCP contract signal")
  ], ["correctness", "maintainability", "contract preservation"], ["vnem_tools_repo_deep_map", "vnem_tools_patch_target_finder", "vnem_tools_test_selection_plan"]),
  adapter("evidence_validation", "Evidence and completion verification", 5, [
    feature(/\b(proof|evidence|verify|validation|readiness|no[- ]?placebo|audit|what is proven|completion)\b/, 5, "proof or completion requirement"),
    feature(/\b(real implementation|safe claim|not proven|truth check)\b/, 4, "claim-boundary requirement")
  ], ["proof quality", "claim precision", "completion integrity"], ["vnem_tools_evidence_pack", "vnem_tools_task_progress_truth_check", "vnem_tools_no_placebo_progress_audit"]),
  adapter("recovery", "Local session recovery", 4, [
    feature(/\b(recover|recovery|lost context|chat loss|working state|unpushed|dirty worktree|local stack)\b/, 6, "session or repository recovery")
  ], ["state accuracy", "worktree safety", "continuation quality"], ["vnem_tools_local_session_recovery", "vnem_tools_repo_workflow_orchestrator"]),
  adapter("research_docs", "Current research and documentation", 3, [
    feature(/\b(research|latest|current|official docs?|documentation|citation|source retrieval|provenance)\b/, 5, "current-source requirement"),
    feature(/\b(web|internet|freshness|changelog|release notes?)\b/, 3, "external freshness signal")
  ], ["source quality", "freshness", "citation accuracy"], ["vnem_tools_source_map", "vnem_tools_source_extract", "vnem_tools_claim_source_matrix"]),
  adapter("package_dependency", "Packages and dependency safety", 2, [
    feature(/\b(package|dependency|dependencies|npm|pnpm|yarn|lockfile|upgrade|install script|supply chain|sbom|advisori|vulnerability|license|typosquat)\b/, 5, "package or dependency work")
  ], ["compatibility", "supply-chain safety", "advisory freshness", "test selection", "rollback"], ["vnem_tools_dependency_inventory", "vnem_tools_dependency_risk_audit", "vnem_tools_dependency_advisory_audit", "vnem_tools_dependency_change_analyze", "vnem_tools_dependency_upgrade_plan", "vnem_tools_dependency_install_apply", "vnem_tools_dependency_transaction_rollback"]),
  adapter("api_integration", "API integration and credential safety", 1, [
    feature(/\b(api|openapi|endpoint|http request|rest|graphql|webhook|oauth|bearer|api key)\b/, 5, "API or authentication surface"),
    feature(/\b(live request|allowlisted|get request|call the api|execute.*request)\b/, 4, "live API execution")
  ], ["contract correctness", "credential safety", "provider compatibility"], ["vnem_tools_api_adapter_catalog", "vnem_tools_api_adapter_plan", "vnem_tools_api_adapter_execute", "vnem_tools_evidence_pack"]),
  adapter("windows_local", "Windows and local-PC work", 0, [
    feature(/\b(windows|powershell|event viewer|windows registry|registry key|regedit|scheduled task|defender)\b/, 5, "Windows platform signal"),
    feature(/\b(process|port|local pc|path failure|appdata)\b/, 4, "local system inspection")
  ], ["platform compatibility", "system safety", "diagnostic evidence", "permission and rollback boundaries"], ["vnem_tools_windows_system_snapshot", "vnem_tools_powershell_command_plan", "vnem_tools_windows_path_inspect", "vnem_tools_process_inspect", "vnem_tools_port_inspect", "vnem_tools_windows_event_log_read", "vnem_tools_windows_service_status", "vnem_tools_windows_scheduled_task_status", "vnem_tools_windows_app_config_detect", "vnem_tools_windows_change_plan"]),
  adapter("game_modding", "Game and modding work", -1, [
    feature(/\b(game|modding|mod loader|load order|save file|anti-cheat|roblox|luau)\b/, 5, "game or modding domain")
  ], ["version compatibility", "backup safety", "format/toolchain boundaries", "runtime proof"], ["vnem_tools_game_adapter_catalog", "vnem_tools_game_project_inspect", "vnem_tools_game_config_audit", "vnem_tools_mod_compatibility_analyze", "vnem_tools_game_project_validate", "vnem_tools_mod_backup_create", "vnem_tools_mod_backup_restore", "vnem_tools_roblox_project_inspect", "vnem_tools_luau_symbol_map"]),
  adapter("skills", "Vetted skill selection or execution", -2, [
    feature(/\b(skill|plugin|agent skill|skill catalog|execute.*skill|install.*skill)\b/, 5, "skill or plugin workflow")
  ], ["provenance", "execution readiness", "prompt-injection safety"], ["vnem_tools_trust_boundary_classify", "vnem_tools_capability_gap_report"]),
  adapter("database_data", "Database and structured data", -3, [
    feature(/\b(database|sqlite|postgres|mysql|schema|sql query|structured data|csv|spreadsheet)\b/, 5, "database or structured-data task")
  ], ["data integrity", "query safety", "schema compatibility"], ["vnem_tools_capability_gap_report", "vnem_tools_project_scan"]),
  adapter("cloudflare", "Cloudflare deployment control", -4, [
    feature(/\b(cloudflare|wrangler|pages deploy|workers deploy|dns zone|cache purge)\b/, 6, "Cloudflare surface")
  ], ["deployment safety", "remote proof", "rollback"], ["vnem_tools_cloudflare_status", "vnem_tools_cloudflare_deploy_verify", "vnem_tools_cloudflare_rollback_plan"]),
  adapter("client_setup", "VNEM client setup", -5, [
    feature(/\b(codex|claude code|claude desktop|cursor|windsurf|cline|gemini cli|mcp client|vnem client|client config)\b.*\b(install|setup|configure|config|rollback|roll back|verify)\b/, 6, "MCP client configuration")
  ], ["config preservation", "client compatibility", "rollback"], ["vnem_tools_install_doctor", "vnem_tools_install_profile_emit"])
];

const MODE_DOMAINS = {
  testing: "testing_ci",
  ci: "testing_ci",
  coverage: "testing_ci",
  benchmarks: "testing_ci",
  debugging: "debugging",
  publish: "github_publish",
  recovery: "recovery",
  research: "research_docs",
  ui_browser: "browser_ui",
  browser_ui: "browser_ui",
  validation: "evidence_validation",
  evidence_pack: "evidence_validation",
  no_placebo: "evidence_validation",
  implementation: "repo_code",
  refactor: "repo_code",
  terminal: "project_automation",
  project_automation: "project_automation",
  repo_inspection: "repo_code",
  patch_targeting: "repo_code",
  mcp_tool_audit: "repo_code",
  cloudflare: "cloudflare",
  windows: "windows_local",
  package: "package_dependency",
  api: "api_integration",
  skill: "skills",
  database: "database_data",
  game_modding: "game_modding",
  client_setup: "client_setup"
};

const DOMAIN_GAPS = {
  skills: ["a vetted skill execution runtime is not registered in Tools yet"],
  database_data: ["database schema and query tools are not registered in Tools yet"],
  client_setup: ["client setup currently executes through the VNEM CLI, not Tools MCP"]
};

const TOOL_PURPOSES = {
  vnem_tools_test_system_inspect: "detect frameworks, scripts, configs, coverage, workflows, generated implications, and shared resources",
  vnem_tools_affected_test_graph: "select tests from imports, references, package scripts, ownership, generated outputs, and integration boundaries",
  vnem_tools_test_run: "run an approved tier with resource-aware parallelism and bounded machine plus human evidence",
  vnem_tools_ci_failure_diagnose: "classify workflow, job, step, command, logs, branch versus infrastructure cause, smallest fix, and rerun eligibility",
  vnem_tools_coverage_benchmark_report: "ingest real coverage and compare benchmark history without inventing missing evidence",
  vnem_tools_repo_deep_map: "map repository state and ownership before changes",
  vnem_tools_structural_index_build: "build the incremental AST, lexical-binding, import, test, route, component, API, and package graph",
  vnem_tools_structural_graph_query: "query parser-backed code relationships with confidence and truncation boundaries",
  vnem_tools_exact_symbol_references: "resolve Babel lexical bindings and static ESM consumers without compiler-grade overclaiming",
  vnem_tools_refactor_rename_preview: "create a hash-bound binding-aware rename preview with collision, uncertainty, public API, and affected-test gates",
  vnem_tools_refactor_move_preview: "preview module and relative-import moves without unsupported automatic mutation",
  vnem_tools_refactor_extract_plan: "plan extraction inputs, outputs, calls, tests, and closure uncertainty",
  vnem_tools_dead_code_candidates: "report static cleanup candidates without claiming deletion safety",
  vnem_tools_refactor_impact_analyze: "trace reverse static-import impact into code, tests, routes, components, and packages",
  vnem_tools_structural_patch_validate: "reparse changed code and detect unresolved imports or duplicate exports before project checks",
  vnem_tools_refactor_apply_verify: "apply only a fresh high-confidence rename with reviewed tests, post-reference proof, and automatic rollback",
  vnem_tools_refactor_transaction_rollback: "restore exact pre-refactor bytes after stale and project-bound transaction checks",
  vnem_tools_code_symbol_map: "locate symbols and implementation boundaries",
  vnem_tools_patch_target_finder: "identify exact source and test targets",
  vnem_tools_source_impact_trace: "trace a change across callers, contracts, and regression tests",
  vnem_tools_test_selection_plan: "choose the smallest sufficient verification set",
  vnem_tools_failure_triage: "classify failure evidence before changing code",
  vnem_tools_github_status: "verify GitHub authentication and repository readiness",
  vnem_tools_github_diff_review: "review the bounded local or live PR diff, hidden controls, secret additions, generated churn, and high-risk surfaces",
  vnem_tools_github_review_threads: "inspect unresolved, resolved, outdated, and paginated review threads without mutating them",
  vnem_tools_github_remote_proof: "prove local, remote branch, PR head, and exact-head Actions SHA equality",
  vnem_tools_github_actions_status: "inspect actual workflow status and head SHA",
  vnem_tools_github_actions_run_inspect: "inspect exact Actions jobs, steps, and bounded redacted logs",
  vnem_tools_github_release_verify: "verify release metadata and the exact remote tag SHA",
  vnem_tools_github_public_surface_audit: "check README, package, and public repo-surface consistency without editing",
  vnem_tools_pr_quality_gate: "verify PR, CI, and proof requirements",
  vnem_tools_ui_surface_review: "inspect UI routes and states before browser proof",
  vnem_tools_browser_evidence_plan: "plan bounded browser and viewport evidence",
  vnem_tools_browser_evidence_run: "collect approved local browser evidence",
  vnem_tools_windows_system_snapshot: "inspect Windows, PowerShell, PATH, developer tools, temp directories, long paths, and Defender visibility",
  vnem_tools_powershell_command_plan: "construct a safely quoted non-executing PowerShell native-command invocation",
  vnem_tools_windows_path_inspect: "inspect allowed-root path normalization, access, link, lock, temp, and long-path evidence",
  vnem_tools_process_inspect: "inspect bounded exact Windows process metadata without command lines or termination",
  vnem_tools_port_inspect: "inspect exact Windows TCP ports and correlate listener PIDs",
  vnem_tools_windows_event_log_read: "read bounded redacted Application, System, or Setup event evidence",
  vnem_tools_windows_change_plan: "require exact scope, permission, rollback, and security-control hard blocks before system mutation",
  vnem_tools_game_adapter_catalog: "select a complete safe adapter contract and expose unsupported binary/toolchain boundaries",
  vnem_tools_game_project_inspect: "inventory bounded game/mod files, formats, manifests, load order, assets, hashes, duplicates, and guarded binaries",
  vnem_tools_game_config_audit: "parse or statically scan text, JSON, XML, YAML, TOML, Lua, and Luau configs without execution or secret values",
  vnem_tools_mod_compatibility_analyze: "analyze dependencies, conflicts, version evidence, cycles, load order, and a bounded compatibility matrix",
  vnem_tools_mod_profile_compare: "compare structural mod profile membership, versions, enabled state, and ordering",
  vnem_tools_game_project_validate: "run bounded static project checks and return isolated game-specific validation command plans",
  vnem_tools_mod_backup_create: "create an approval-gated isolated byte-preserving backup package with SHA-256 manifest",
  vnem_tools_mod_backup_restore: "restore an exact backup only with package and current-target hash preconditions plus a safety package",
  vnem_tools_roblox_project_inspect: "map Rojo services and paths, Luau contexts, toolchains, tests, and remote trust boundaries",
  vnem_tools_luau_symbol_map: "map Lua/Luau symbols, requires, services, remotes, and credible static risks with file/line evidence",
  vnem_tools_app_inspect: "inspect app frameworks, boundaries, routes, APIs, data flow, states, and completion gaps",
  vnem_tools_app_vertical_slice_plan: "preview a coherent frontend, API, and domain transaction",
  vnem_tools_app_vertical_slice_apply: "apply an approved marker-backed app transaction",
  vnem_tools_app_acceptance_run: "run focused checks and a real desktop/mobile browser user path",
  vnem_tools_app_transaction_rollback: "restore a failed app transaction with hash preconditions",
  vnem_tools_project_automation_inspect: "detect shells, package managers, scripts, task runners, and command policy",
  vnem_tools_project_command_run: "review and execute one exact bounded project command with exit, timeout, output, and process evidence",
  vnem_tools_project_task_graph_plan: "persist a dependency-ordered resumable graph with satisfaction and rollback contracts",
  vnem_tools_project_task_graph_run: "run or resume reviewed graph nodes and checkpoint every result",
  vnem_tools_project_task_graph_status: "recover persisted task graph progress after interruption",
  vnem_tools_project_task_graph_rollback: "execute declared compensating commands in reverse dependency order",
  vnem_tools_project_runtime_diagnose: "collect logs first and inspect project ports, processes, locks, temp state, and interrupted graphs",
  vnem_tools_project_temp_cleanup: "quarantine or restore explicit project temp paths with bounded lock retries",
  vnem_tools_evidence_pack: "assemble safe claims and not-proven boundaries",
  vnem_tools_task_progress_truth_check: "compare completion claims with evidence",
  vnem_tools_no_placebo_progress_audit: "detect registration-only or mocked-only progress",
  vnem_tools_local_session_recovery: "recover branch, HEAD, worktree, and local-only state",
  vnem_tools_repo_workflow_orchestrator: "select the smallest safe continuation workflow",
  vnem_tools_source_map: "map current documentation sources and provenance",
  vnem_tools_source_extract: "extract bounded source evidence",
  vnem_tools_claim_source_matrix: "map claims to supporting sources",
  vnem_tools_dependency_scan: "inspect dependencies without installing packages",
  vnem_tools_dependency_inventory: "build a direct/transitive lock graph and SBOM-style inventory without installing",
  vnem_tools_dependency_risk_audit: "audit lifecycle, provenance, typosquat, maintenance, and license indicators with uncertainty",
  vnem_tools_dependency_advisory_audit: "inspect fresh approved advisory evidence without lifecycle execution or registry credential exposure",
  vnem_tools_dependency_change_analyze: "compare direct and transitive upgrades, major-version indicators, and affected tests",
  vnem_tools_dependency_upgrade_plan: "bind exact package changes to current manifest and lock hashes",
  vnem_tools_dependency_install_apply: "apply an approved script-disabled npm transaction with verification and automatic rollback",
  vnem_tools_dependency_transaction_rollback: "restore exact pre-install dependency files and npm state after hash verification",
  vnem_tools_trust_boundary_classify: "classify external code, API, or skill trust boundaries",
  vnem_tools_api_adapter_catalog: "select a current reviewed API contract and its exact safety boundaries",
  vnem_tools_api_credential_reference_check: "verify a typed credential reference by presence without exposing its value",
  vnem_tools_api_adapter_plan: "validate the exact adapter request, permission scope, rate limits, and compensation before execution",
  vnem_tools_api_adapter_execute: "run one vetted bounded adapter with schema checks, redaction, and evidence",
  vnem_tools_api_adapter_compensate: "run one reviewed best-effort external compensation without claiming rollback",
  vnem_tools_api_adapter_generate: "propose an inactive adapter from OpenAPI or structured official documentation",
  vnem_tools_api_adapter_contract_test: "test adapter request, response, fixture, and path contracts without network",
  vnem_tools_api_adapter_review_activate: "activate only a tested and explicitly reviewed no-auth GET/HEAD adapter",
  vnem_tools_api_request: "execute an approved allowlisted API request with redaction",
  vnem_tools_capability_gap_report: "report missing execution capability honestly",
  vnem_tools_project_scan: "inspect a bounded local project as a fallback",
  vnem_tools_cloudflare_status: "read current Cloudflare state",
  vnem_tools_cloudflare_deploy_verify: "verify deployment state without inventing proof",
  vnem_tools_cloudflare_rollback_plan: "prepare an explicit rollback path",
  vnem_tools_install_doctor: "verify generated client profiles and setup readiness",
  vnem_tools_install_profile_emit: "emit a reviewed import profile"
};

export function buildCoreEntrypoint(args = {}) {
  const classification = classifyAdoptionTask(args.user_goal, args.task_context, args.task_mode, args);
  const recommendedToolsCalls = classification.execution_needed || classification.proof_needed
    ? coreRecommendedToolsCalls(classification, args)
    : [];
  const recommendedCoreCalls = coreRecommendedCoreCalls(classification);
  const compatibility = assessCoreCompatibility({
    task: args.user_goal,
    task_context: args.task_context,
    environment: args.environment,
    compatibility_facts: args.compatibility_facts
  });
  const missing = materialMissingContext(classification, args, compatibility);
  const assumptions = safeAssumptions(classification, args, missing);
  const capabilityPacks = capabilityPacksFor(classification, recommendedToolsCalls);
  const proofRequired = coreProofRequirements(classification);
  const completionCriteria = completionCriteriaFor(classification);
  const toolSequence = toolSequenceFor(recommendedToolsCalls, args);
  const shouldUseVnem = classification.primary === "simple_answer" ? "conditional" : "yes";
  const compactNextStep = nextActionFor(classification, toolSequence, missing);
  const decisionId = stableId("decision", {
    user_goal: args.user_goal || "",
    task_context: args.task_context || "",
    task_mode: args.task_mode || "auto",
    constraints: stringArray(args.user_constraints),
    repo_signals: stringArray(args.repo_signals),
    environment: args.environment || {}
  });
  const permissionImplications = permissionImplicationsFor(classification, toolSequence, args);
  const stopConditions = stopConditionsFor(classification, missing);
  const evidenceContinuation = args.tools_evidence_summary && Object.keys(args.tools_evidence_summary).length
    ? continueFromToolsEvidence({ decision_id: decisionId, task: args.user_goal, completion_criteria: completionCriteria, evidence_summary: args.tools_evidence_summary }, { remember: false })
    : null;

  const compact = {
    decision_id: decisionId,
    task_classification: classification,
    should_use_vnem: shouldUseVnem,
    use_vnem_decision: {
      decision: shouldUseVnem,
      reason: shouldUseVnem === "yes"
        ? "The task has material execution, compatibility, quality, or proof requirements that benefit from deterministic Core routing."
        : "No material execution or proof requirement was detected; keep the answer lightweight unless the task expands."
    },
    material_missing_context: missing.slice(0, 5),
    safe_assumptions: assumptions.slice(0, 5),
    quality_domains: unique(classification.domains.flatMap((domain) => domain.quality_domains)).slice(0, 7),
    relevant_capability_packs: capabilityPacks.map(compactCapabilityPack),
    adapter_selection: adapterSelectionFor(classification, recommendedToolsCalls),
    recommended_core_calls: recommendedCoreCalls,
    recommended_tools_calls: recommendedToolsCalls,
    recommended_tools_call_sequence: toolSequence,
    permission_implications: permissionImplications,
    compatibility_constraints: compatibility.constraints.slice(0, 6),
    evidence_requirements: proofRequired,
    stop_conditions: stopConditions,
    completion_criteria: completionCriteria,
    evidence_continuation: evidenceContinuation ? compactContinuation(evidenceContinuation) : null,
    effort_mode: classification.primary === "simple_answer" ? "direct_answer" : classification.mixed_domain ? "adaptive_multi_domain" : "compact_route",
    workflow_policy: { fixed_pipeline: false, plan_optional: true, effort_adapts_to_task: true },
    concise_next_action: compactNextStep,
    compact_next_step: compactNextStep,
    confidence: classification.confidence,
    details_ref: { tool: "vnem_decision_details", decision_id: decisionId },
    core_executes_tools: false,

    // Compatibility fields retained for existing clients and adoption tests.
    why_use_vnem: classification.why.slice(0, 4),
    when_tools_mcp_is_needed: ["repo inspection or code search", "edits, commands, tests, browser or remote actions", "runtime evidence and completion proof"],
    what_core_can_do: ["classify mixed tasks", "select compact capability and Tools routes", "reason from compatibility and evidence"],
    what_core_cannot_do: ["mutate files", "run terminal commands or tests", "push branches or call remote services"],
    proof_required: ["See proof_contract.required_before_claims."],
    proof_contract: {
      required_before_claims: proofRequired,
      fake_proof_blocked: true,
      remote_claims_require_remote_sha_pr_ci: Boolean(classification.matched_flags.github_or_publish),
      browser_claims_require_browser_or_screenshot_evidence: Boolean(classification.matched_flags.browser_or_ui)
    },
    no_placebo_risks: ["registration-only tool changes", "docs-only adoption claims", "mocked-only remote proof", "claiming execution from Core output"],
    output_contract: {
      compact_by_default: true,
      deeper_details_by_id: true,
      exact_tool_names_when_known: true,
      include_not_proven: true
    },
    tools_handoff: {
      use_tools_mcp: recommendedToolsCalls.length > 0,
      tools_mcp_detected_from_input: toolsMcpConfigured(args.available_mcp_names),
      task_type: classification.primary,
      exact_tool_call_sequence: toolSequence.map(({ step, tool }) => ({ step, tool })),
      proof_contract: ["See top-level proof_contract.required_before_claims."],
      core_runtime_dependency: false
    },
    reality_boundary: "Core reasons and routes. Tool execution, success, and proof remain distinct states and must come from Tools evidence."
  };

  rememberDecision(decisionId, {
    decision_id: decisionId,
    input_summary: redactedInputSummary(args),
    classification,
    compatibility,
    material_missing_context: missing,
    safe_assumptions: assumptions,
    capability_packs: capabilityPacks,
    adapter_selection: adapterSelectionFor(classification, recommendedToolsCalls),
    tool_sequence: toolSequence,
    permission_implications: permissionImplications,
    evidence_requirements: proofRequired,
    completion_criteria: completionCriteria,
    stop_conditions: stopConditions,
    unavailable_capabilities: unique(classification.domains.flatMap((domain) => DOMAIN_GAPS[domain.id] || [])),
    evidence_continuation: evidenceContinuation
  });
  return compact;
}

export function getCoreDecisionDetails(args = {}) {
  const decisionId = String(args.decision_id || "").trim();
  const stored = decisionStore.get(decisionId);
  if (!stored) {
    return {
      found: false,
      decision_id: decisionId,
      reason: "Decision details are session-scoped and this id is not present in the current Core process.",
      next_action: "Call vnem_entrypoint again, then request details with its returned decision_id."
    };
  }
  const sections = stringArray(args.sections);
  if (!sections.length) return { found: true, ...stored };
  const selected = Object.fromEntries(sections.filter((section) => Object.hasOwn(stored, section)).map((section) => [section, stored[section]]));
  return { found: true, decision_id: decisionId, sections: selected, unavailable_sections: sections.filter((section) => !Object.hasOwn(stored, section)) };
}

export function continueFromToolsEvidence(args = {}, options = {}) {
  const decisionId = String(args.decision_id || "").trim();
  const stored = decisionId ? decisionStore.get(decisionId) : null;
  const suppliedCriteria = normalizeCriteria(args.completion_criteria);
  const criteria = suppliedCriteria.length ? suppliedCriteria : stored?.completion_criteria || defaultContinuationCriteria();
  const summary = normalizeEvidenceSummary(args.evidence_summary);
  const requirementStatus = new Map(summary.requirements.map((item) => [item.id, item]));
  const remaining = criteria.filter((criterion) => requirementStatus.get(criterion.id)?.status !== "proven");
  const failedChecks = summary.checks.filter((check) => ["failed", "error"].includes(check.status));
  const blockedRequirements = summary.requirements.filter((item) => item.status === "blocked");
  const unsupportedClaims = summary.claims.filter((claim) => !claim.evidence_ids.length || (remaining.length && /\b(complete|done|passed|working|fixed|verified)\b/i.test(claim.text)));
  const blockers = [...summary.blockers, ...blockedRequirements.map((item) => ({ type: "requirement", reason: `${item.id} is blocked`, requires_user: false }))];
  const userInputRequired = blockers.some((item) => item.requires_user || /auth|approval|credential reference|irreversible|user decision/i.test(`${item.type} ${item.reason}`));
  const rerunNeeded = failedChecks.length > 0;
  const complete = criteria.length > 0 && remaining.length === 0 && failedChecks.length === 0 && blockers.length === 0 && unsupportedClaims.length === 0;
  const state = complete ? "complete" : blockers.length ? "blocked" : "incomplete";
  const smallestNextAction = rerunNeeded
    ? `Rerun the smallest failed check: ${failedChecks[0].name}.`
    : blockers.length
      ? userInputRequired ? `Request only the input needed for: ${blockers[0].reason}.` : `Resolve blocker: ${blockers[0].reason}.`
      : remaining.length
        ? `Collect proof for ${remaining[0].id}: ${remaining[0].criterion}`
        : unsupportedClaims.length
          ? "Narrow the unsupported claim or attach exact evidence ids."
          : "No further action is required.";
  const result = {
    continuation_id: stableId("continuation", { decisionId, task: args.task || "", summary }),
    decision_id: decisionId || null,
    decision_found: Boolean(stored),
    completion_state: state,
    complete,
    requirements_total: criteria.length,
    requirements_proven: criteria.length - remaining.length,
    remaining_requirements: remaining,
    rerun_needed: rerunNeeded,
    failed_checks: failedChecks,
    claim_overreach: unsupportedClaims,
    blockers,
    user_input_required: userInputRequired,
    smallest_next_action: smallestNextAction,
    what_is_not_proven: unique([...remaining.map((item) => item.criterion), ...summary.not_proven, ...unsupportedClaims.map((item) => item.text)]),
    safe_claims: summary.claims.filter((claim) => claim.evidence_ids.length && !unsupportedClaims.includes(claim)),
    core_executes_tools: false
  };
  if (options.remember !== false && decisionId && stored) stored.evidence_continuation = result;
  return result;
}

export function assessCoreCompatibility(args = {}) {
  const text = normalize([args.task, args.task_context].filter(Boolean).join(" "));
  const environment = objectValue(args.environment);
  const facts = arrayValue(args.compatibility_facts).map(normalizeCompatibilityFact).filter(Boolean);
  const requirements = compatibilityRequirements(text);
  const constraints = requirements.map((requirement) => {
    const fact = facts.find((item) => item.dimension === requirement.dimension);
    const observed = fact?.value ?? environment[requirement.field] ?? null;
    const status = fact?.status || (observed ? "observed_unverified" : "unknown");
    return {
      dimension: requirement.dimension,
      expected: requirement.expected,
      observed,
      status,
      scope: fact?.scope || requirement.scope,
      evidence: fact?.evidence || (observed ? "caller-provided context" : null),
      affects: requirement.affects
    };
  });
  const conflicts = constraints.filter((item) => item.status === "incompatible");
  const unknowns = constraints.filter((item) => item.status === "unknown");
  return {
    compatibility_id: stableId("compat", { text, environment, facts }),
    scope: "task-specific; facts do not become universal rules",
    constraints,
    conflicts,
    unknowns,
    safe_claims: constraints.filter((item) => ["verified", "supported"].includes(item.status)).map((item) => `${item.dimension} is ${item.status} for ${item.scope}.`),
    must_not_claim: unknowns.map((item) => `${item.dimension} compatibility is proven`),
    next_checks: unique([...conflicts, ...unknowns].map((item) => `Verify ${item.dimension} for ${item.scope} using task-local evidence.`))
  };
}

export function classifyAdoptionTask(userGoal, taskContext = "", taskMode = "auto", extra = {}) {
  const mode = String(taskMode || "auto").toLowerCase();
  const userConstraints = stringArray(extra.user_constraints);
  const repoSignals = stringArray(extra.repo_signals);
  const text = normalize([userGoal, taskContext, mode, ...userConstraints, ...repoSignals].filter(Boolean).join(" "));
  const modeDomain = MODE_DOMAINS[mode];
  const scored = DOMAIN_ADAPTERS.map((domain) => scoreDomain(domain, text, modeDomain, repoSignals, userConstraints))
    .filter((domain) => domain.score >= 4)
    .sort((a, b) => b.score - a.score || b.priority - a.priority)
    .slice(0, 4);
  const domains = scored.length ? scored : [];
  const primaryDomain = domains[0]?.id || "simple_answer";
  const primary = mode !== "auto" && mode !== "answer_only"
    ? mode
    : mode === "answer_only" ? "simple_answer" : legacyPrimary(primaryDomain);
  const ids = new Set(domains.map((domain) => domain.id));
  const flags = {
    repo_or_code: ["repo_code", "app_engineering", "testing_ci", "project_automation", "package_dependency", "api_integration", "database_data", "client_setup"].some((id) => ids.has(id)),
    debugging: ids.has("debugging"),
    github_or_publish: ids.has("github_publish"),
    cloudflare: ids.has("cloudflare"),
    browser_or_ui: ids.has("browser_ui"),
    recovery: ids.has("recovery"),
    research: ids.has("research_docs"),
    proof_or_validation: ids.has("evidence_validation") || ids.has("github_publish") || ids.has("browser_ui")
  };
  const executionNeeded = domains.some((domain) => domain.id !== "simple_answer");
  const why = domains.length
    ? domains.map((domain) => `${domain.label}: ${domain.reasons.join("; ")}.`).slice(0, 4)
    : ["No material execution, compatibility, or proof signal was detected."];
  return {
    primary,
    primary_domain: primaryDomain,
    domains,
    mixed_domain: domains.length > 1,
    scoring_method: "weighted domain adapters using goal, explicit mode, task context, repo signals, and user constraints",
    matched_flags: flags,
    execution_needed: executionNeeded,
    proof_needed: flags.proof_or_validation || domains.some((domain) => ["debugging", "testing_ci", "project_automation", "package_dependency", "api_integration", "cloudflare"].includes(domain.id)),
    github_or_publish: flags.github_or_publish,
    browser_or_ui: flags.browser_or_ui,
    confidence: !domains.length ? "medium" : domains[0].score >= 9 ? "high" : "normal",
    why
  };
}

export function coreRecommendedToolsCalls(classification, args = {}) {
  const domains = classification?.domains || [];
  const candidates = [];
  const routes = [];
  for (const domain of domains) {
    const adapterDef = DOMAIN_ADAPTERS.find((item) => item.id === domain.id);
    if (!adapterDef) continue;
    routes.push(domainTools(adapterDef, args));
  }
  const domainIds = new Set(domains.map((domain) => domain.id));
  const repoText = `${args.user_goal || ""} ${args.task_context || ""}`;
  const refactorIntent = domainIds.has("repo_code") && /\b(refactor|rename\b[^\n]{0,80}\b(?:symbol|function|class|variable)|move\b[^\n]{0,80}\b(?:module|file)|extract\b[^\n]{0,80}\b(?:function|module)|dead code|exact references|preserve public|without changing public)\b/i.test(repoText);
  // Keep implementation essentials ahead of evidence-only steps when the route is capped.
  if (refactorIntent) candidates.push(...domainTools(DOMAIN_ADAPTERS.find((item) => item.id === "repo_code"), args));
  if (domainIds.has("app_engineering")) candidates.push("vnem_tools_app_inspect", "vnem_tools_app_vertical_slice_plan", "vnem_tools_repo_deep_map");
  if (domainIds.has("project_automation")) candidates.push("vnem_tools_project_automation_inspect", "vnem_tools_project_command_run", "vnem_tools_project_task_graph_plan");
  if (domainIds.has("game_modding")) {
    const gameText = `${args.user_goal || ""} ${args.task_context || ""}`;
    candidates.push("vnem_tools_game_adapter_catalog");
    if (/roblox|rojo|luau/i.test(gameText)) candidates.push("vnem_tools_roblox_project_inspect", "vnem_tools_luau_symbol_map", "vnem_tools_game_project_validate");
    else candidates.push("vnem_tools_game_project_inspect", "vnem_tools_game_config_audit", "vnem_tools_mod_compatibility_analyze", "vnem_tools_game_project_validate");
  }
  if (domainIds.has("package_dependency") && String(args.task_mode || "").toLowerCase() === "package") {
    const dependencyText = `${args.user_goal || ""} ${args.task_context || ""}`;
    candidates.push("vnem_tools_dependency_inventory", "vnem_tools_dependency_risk_audit");
    if (/advisori|vulnerab|cve|audit|security/i.test(dependencyText)) candidates.push("vnem_tools_dependency_advisory_audit");
    if (/compare|diff|transitive|breaking|major|upgrade path/i.test(dependencyText)) candidates.push("vnem_tools_dependency_change_analyze");
    if (/install|add|update|upgrade/i.test(dependencyText)) candidates.push("vnem_tools_dependency_upgrade_plan", "vnem_tools_dependency_install_apply");
    if (/rollback|restore|revert/i.test(dependencyText)) candidates.push("vnem_tools_dependency_transaction_rollback");
  }
  if (domainIds.has("windows_local")) candidates.push("vnem_tools_windows_system_snapshot", "vnem_tools_powershell_command_plan", "vnem_tools_process_inspect", "vnem_tools_port_inspect");
  if (domainIds.has("github_publish")) {
    const githubText = `${args.user_goal || ""} ${args.task_context || ""}`;
    candidates.push("vnem_tools_github_actions_status");
    if (/review threads?|review comments?|unresolved review/i.test(githubText)) {
      candidates.push("vnem_tools_github_diff_review", "vnem_tools_github_review_threads", "vnem_tools_github_remote_proof", "vnem_tools_pr_quality_gate");
    }
    if (/job|step|logs?|workflow failure|actions run/i.test(githubText)) {
      candidates.push("vnem_tools_github_remote_proof", "vnem_tools_github_actions_run_inspect");
    }
  }
  if (domainIds.has("package_dependency") && String(args.task_mode || "").toLowerCase() !== "package") {
    const dependencyText = `${args.user_goal || ""} ${args.task_context || ""}`;
    if (/package|dependency|npm|pnpm|yarn|lockfile|sbom|supply.chain|advisori|vulnerab|typosquat|license|postinstall|preinstall/i.test(dependencyText)) {
      candidates.push("vnem_tools_dependency_inventory", "vnem_tools_dependency_risk_audit");
      if (/advisori|vulnerab|cve|audit|security/i.test(dependencyText)) candidates.push("vnem_tools_dependency_advisory_audit");
      if (/compare|diff|transitive|breaking|major|upgrade path/i.test(dependencyText)) candidates.push("vnem_tools_dependency_change_analyze");
      if (/install|add|update|upgrade/i.test(dependencyText)) candidates.push("vnem_tools_dependency_upgrade_plan", "vnem_tools_dependency_install_apply");
      if (/rollback|restore|revert/i.test(dependencyText)) candidates.push("vnem_tools_dependency_transaction_rollback");
    }
  }
  if (domainIds.has("repo_code") && !refactorIntent) candidates.push("vnem_tools_repo_deep_map", "vnem_tools_patch_target_finder");
  if (domainIds.has("repo_code") || domainIds.has("app_engineering")) candidates.push("vnem_tools_test_selection_plan");
  // Give every material domain execution influence before filling deeper steps.
  for (let index = 0; index < routes.length; index += 1) {
    const breadth = domains[index]?.id === "app_engineering" ? 3 : 2;
    for (const tool of routes[index].slice(0, breadth)) candidates.push(tool);
  }
  if (domainIds.has("repo_code") || domainIds.has("app_engineering")) candidates.push("vnem_tools_test_selection_plan");
  if (domainIds.has("github_publish")) candidates.push("vnem_tools_github_actions_status");
  if (domainIds.has("package_dependency")) candidates.push("vnem_tools_dependency_change_analyze", "vnem_tools_dependency_upgrade_plan");
  if (domainIds.has("browser_ui")) candidates.push("vnem_tools_browser_evidence_plan", "vnem_tools_browser_interaction_run");
  for (const route of routes) for (const tool of route.slice(2)) candidates.push(tool);
  if (!candidates.length && classification?.matched_flags?.repo_or_code) candidates.push(...DOMAIN_ADAPTERS.find((item) => item.id === "repo_code").tools);
  return unique(candidates).slice(0, 6);
}

export function coreRecommendedCoreCalls(classification) {
  if (classification.primary === "simple_answer") return ["vnem_usage_contract"];
  const ids = new Set((classification.domains || []).map((item) => item.id));
  return unique([
    "vnem_entrypoint",
    ids.has("api_integration") ? "vnem_search_apis" : null,
    ids.has("skills") ? "vnem_search_skills" : null,
    ids.has("research_docs") ? "vnem_build_research_strategy" : null,
    ids.has("browser_ui") ? "vnem_build_ui_quality_plan" : null,
    ids.has("debugging") ? "vnem_build_debugging_plan" : null,
    "vnem_select_tools_for_task",
    "vnem_build_tools_plan"
  ]).slice(0, 6);
}

export function coreProofRequirements(classification) {
  const ids = new Set((classification.domains || []).map((item) => item.id));
  const requirements = ["commands and Tools calls actually executed, or an explicit blocked state", "checks actually run with status", "what remains not proven"];
  if (ids.has("github_publish")) requirements.push("bounded diff and unresolved-review evidence as relevant; exact local HEAD, remote branch SHA, and PR head SHA equality; exact-head GitHub Actions URL/job/step status; protected-branch state; release tag proof when claimed; and normal corrective-commit or rollback guidance without force-push");
  if (ids.has("browser_ui")) requirements.push("structured interaction results, before/after screenshots and pixel comparison, DOM and accessibility snapshots, console errors, failed network requests, responsive viewport/state coverage, and owned-browser cleanup evidence");
  if (ids.has("windows_local")) requirements.push("exact Windows targets, PATH/tool/provider/access evidence, process/port/path/service/task/event results as relevant, no command-line/config/secret collection, and scoped permission plus rollback before any system mutation");
  if (ids.has("package_dependency")) requirements.push("parsed manifest/lock graph and SBOM inventory; lifecycle/source/typosquat/maintenance/license indicators; fresh approved advisory source or explicit absence; direct/transitive and breaking-major upgrade evidence; exact hash-bound plan; approved script-disabled install evidence; lockfile plus focused test/build verification; credential redaction; and automatic or explicit rollback proof");
  if (ids.has("project_automation")) requirements.push("exact reviewed command or graph id, exit/timeout state, process cleanup, bounded output evidence, and declared rollback status");
  if (ids.has("testing_ci")) requirements.push("affected-test graph reasons, tier result, exit/timing/failure groups, coverage source or explicit absence, and baseline/post benchmark evidence where claimed");
  if (ids.has("api_integration")) requirements.push("allowlist/auth reference, redacted response metadata, and provider/version scope");
  if (ids.has("evidence_validation")) requirements.push("handler, behavior-test, MCP-path, and no-placebo evidence where applicable");
  return unique(requirements);
}

export function buildCoreUsageContract(args = {}) {
  const classification = classifyAdoptionTask(args.user_goal, "", "auto", args);
  return {
    core_role: "Read-only task intelligence, compatibility, routing, quality, proof, and Tools-evidence continuation layer.",
    tools_role: "Safeguarded execution layer for repository inspection, patches, commands, browser proof, remote actions, and evidence.",
    first_call_recommendation: "Call vnem_entrypoint for material repo, implementation, debugging, compatibility, browser, research, remote, or proof work.",
    when_to_call_vnem: ["before selecting execution capabilities", "when a task spans domains", "before a completion claim", "after Tools returns evidence"],
    when_to_call_tools: ["repo inspection or edits are needed", "commands, tests, browser, API, or remote actions are needed", "runtime proof must be collected"],
    when_not_to_call_vnem: ["tiny stable answer-only work", "VNEM is disconnected", "the user prohibited tool use"],
    proof_packet_required: coreProofRequirements(classification),
    safety_boundaries: ["Core is read-only", "Tools permissions and approval remain authoritative", "no secrets, destructive shortcuts, or fake proof"],
    common_task_routes: coreCommonTaskRoutes(),
    recommended_core_calls: coreRecommendedCoreCalls(classification),
    recommended_tools_calls: classification.primary === "simple_answer" ? [] : coreRecommendedToolsCalls(classification, args),
    follow_up_tools: ["vnem_decision_details", "vnem_continue_from_tools_evidence", "vnem_compatibility_assess"],
    disconnected_agent_limit: "VNEM can influence only agents with VNEM MCPs connected/configured; it cannot guarantee use or execution from a disconnected client.",
    core_executes_tools: false,
    compact_next_step: args.user_goal ? "Call vnem_entrypoint with structured context and available tool state." : "Use vnem_entrypoint only when material routing or proof is needed."
  };
}

export function coreCommonTaskRoutes() {
  return [
    { task: "mixed app and UI", core_first: "vnem_entrypoint", tools_next: ["vnem_tools_repo_deep_map", "vnem_tools_ui_surface_review", "vnem_tools_browser_evidence_plan"] },
    { task: "package upgrade and CI repair", core_first: "vnem_entrypoint", tools_next: ["vnem_tools_dependency_inventory", "vnem_tools_dependency_risk_audit", "vnem_tools_dependency_advisory_audit", "vnem_tools_dependency_change_analyze", "vnem_tools_dependency_upgrade_plan", "vnem_tools_dependency_install_apply"] },
    { task: "GitHub publishing and proof", core_first: "vnem_entrypoint", tools_next: ["vnem_tools_github_status", "vnem_tools_github_diff_review", "vnem_tools_github_remote_proof", "vnem_tools_github_actions_run_inspect", "vnem_tools_pr_quality_gate"] },
    { task: "Game, modding, or Roblox project work", core_first: "vnem_entrypoint", tools_next: ["vnem_tools_game_adapter_catalog", "vnem_tools_game_project_inspect", "vnem_tools_game_config_audit", "vnem_tools_mod_compatibility_analyze", "vnem_tools_roblox_project_inspect", "vnem_tools_luau_symbol_map", "vnem_tools_game_project_validate", "vnem_tools_mod_backup_create"] },
    { task: "evidence continuation", core_first: "vnem_continue_from_tools_evidence", tools_next: ["vnem_tools_evidence_pack", "vnem_tools_task_progress_truth_check"] }
  ];
}

export function formatCoreEntrypoint(entrypoint) {
  const domains = entrypoint.task_classification.domains.map((item) => item.id).join("+") || "simple_answer";
  return [
    `vnem_entrypoint: ${entrypoint.task_classification.primary}`,
    `use_vnem=${entrypoint.should_use_vnem}; confidence=${entrypoint.confidence}`,
    `domains=${domains}`,
    `tools_next=${entrypoint.recommended_tools_calls.join(", ") || "none"}`,
    `missing=${entrypoint.material_missing_context.filter((item) => item.ask_user).length}; decision_id=${entrypoint.decision_id}`,
    `core_executes_tools=${entrypoint.core_executes_tools}`,
    `next=${entrypoint.compact_next_step}`
  ].join("\n");
}

function adapter(id, label, priority, features, qualityDomains, tools) {
  return { id, label, priority, features, qualityDomains, tools };
}

function feature(pattern, weight, reason) { return { pattern, weight, reason }; }

function scoreDomain(domain, text, modeDomain, repoSignals, userConstraints) {
  let score = domain.id === modeDomain ? 8 : 0;
  const reasons = domain.id === modeDomain ? ["explicit task mode"] : [];
  for (const item of domain.features) {
    if (!item.pattern.test(text)) continue;
    score += item.weight;
    reasons.push(item.reason);
  }
  const signalText = normalize(repoSignals.join(" "));
  if (signalText && domain.features.some((item) => item.pattern.test(signalText))) {
    score += 2;
    reasons.push("repository signal");
  }
  const constraintText = normalize(userConstraints.join(" "));
  if (constraintText && domain.features.some((item) => item.pattern.test(constraintText))) {
    score += 2;
    reasons.push("explicit user constraint");
  }
  return { id: domain.id, label: domain.label, score, priority: domain.priority, reasons: unique(reasons), quality_domains: domain.qualityDomains };
}

function legacyPrimary(domain) {
  const map = {
    repo_code: "repo_code_implementation",
    app_engineering: "repo_code_implementation",
    github_publish: "github_pr_ci_proof",
    browser_ui: "browser_ui_verification",
    cloudflare: "cloudflare_deploy_control",
    research_docs: "research",
    windows_local: "windows_local_diagnosis",
    package_dependency: "package_dependency_work",
    api_integration: "api_integration",
    game_modding: "game_modding",
    database_data: "database_data",
    client_setup: "client_setup",
    evidence_validation: "evidence_validation"
  };
  return map[domain] || domain;
}

function domainTools(domain, args) {
  if (domain.id === "github_publish") {
    const text = `${args.user_goal || ""} ${args.task_context || ""}`;
    if (/review threads?|review comments?|unresolved review/i.test(text)) return ["vnem_tools_github_status", "vnem_tools_github_diff_review", "vnem_tools_github_review_threads", "vnem_tools_github_remote_proof", "vnem_tools_github_actions_status", "vnem_tools_pr_quality_gate"];
    if (/job|step|logs?|workflow failure|actions run/i.test(text)) return ["vnem_tools_github_status", "vnem_tools_github_remote_proof", "vnem_tools_github_actions_status", "vnem_tools_github_actions_run_inspect", "vnem_tools_github_diff_review", "vnem_tools_pr_quality_gate"];
    if (/release|tag|asset/i.test(text)) return ["vnem_tools_github_status", "vnem_tools_github_release_verify", "vnem_tools_github_remote_proof", "vnem_tools_github_actions_status", "vnem_tools_pr_quality_gate"];
    if (/readme|repo page|public page|public surface/i.test(text)) return ["vnem_tools_github_status", "vnem_tools_github_public_surface_audit", "vnem_tools_github_diff_review", "vnem_tools_github_remote_proof", "vnem_tools_pr_quality_gate"];
  }
  if (domain.id === "repo_code" && /\brename\b[^\n]{0,80}\b(?:symbol|function|class|variable)\b/i.test(String(args.user_goal || ""))) {
    return ["vnem_tools_structural_index_build", "vnem_tools_exact_symbol_references", "vnem_tools_refactor_impact_analyze", "vnem_tools_refactor_rename_preview", "vnem_tools_refactor_apply_verify", "vnem_tools_refactor_transaction_rollback"];
  }
  if (domain.id === "repo_code" && /\bmove\b[^\n]{0,80}\b(?:module|file)\b/i.test(String(args.user_goal || ""))) {
    return ["vnem_tools_structural_index_build", "vnem_tools_refactor_impact_analyze", "vnem_tools_refactor_move_preview", "vnem_tools_structural_patch_validate", "vnem_tools_test_selection_plan"];
  }
  if (domain.id === "repo_code" && /\bextract\b[^\n]{0,80}\b(?:function|module)\b/i.test(String(args.user_goal || ""))) {
    return ["vnem_tools_structural_index_build", "vnem_tools_exact_symbol_references", "vnem_tools_refactor_extract_plan", "vnem_tools_refactor_impact_analyze", "vnem_tools_structural_patch_validate", "vnem_tools_test_selection_plan"];
  }
  if (domain.id === "repo_code" && /\bdead code\b/i.test(String(args.user_goal || ""))) {
    return ["vnem_tools_structural_index_build", "vnem_tools_dead_code_candidates", "vnem_tools_refactor_impact_analyze", "vnem_tools_test_selection_plan"];
  }
  if (domain.id === "repo_code" && /\b(refactor|duplicated|exact references|preserve public|without changing public)\b/i.test(String(args.user_goal || ""))) {
    return ["vnem_tools_structural_index_build", "vnem_tools_structural_graph_query", "vnem_tools_exact_symbol_references", "vnem_tools_refactor_impact_analyze", "vnem_tools_structural_patch_validate", "vnem_tools_test_selection_plan"];
  }
  if (domain.id === "game_modding") {
    const text = `${args.user_goal || ""} ${args.task_context || ""}`;
    if (/roblox|rojo|luau/i.test(text)) return ["vnem_tools_game_adapter_catalog", "vnem_tools_roblox_project_inspect", "vnem_tools_luau_symbol_map", "vnem_tools_game_project_validate", "vnem_tools_mod_backup_create", "vnem_tools_mod_backup_restore"];
    if (/profile|compare/i.test(text)) return ["vnem_tools_game_adapter_catalog", "vnem_tools_game_project_inspect", "vnem_tools_mod_profile_compare", "vnem_tools_mod_compatibility_analyze", "vnem_tools_game_project_validate"];
    if (/backup|restore|rollback/i.test(text)) return ["vnem_tools_game_adapter_catalog", "vnem_tools_game_project_inspect", "vnem_tools_mod_backup_create", "vnem_tools_mod_backup_restore", "vnem_tools_game_project_validate"];
    return ["vnem_tools_game_adapter_catalog", "vnem_tools_game_project_inspect", "vnem_tools_game_config_audit", "vnem_tools_mod_compatibility_analyze", "vnem_tools_game_project_validate", "vnem_tools_mod_backup_create"];
  }
  if (domain.id === "api_integration") {
    const text = `${args.user_goal || ""} ${args.task_context || ""}`;
    if (/\b(openapi|generate|create|add)\b[^\n]{0,80}\badapter\b|\badapter\b[^\n]{0,80}\b(openapi|generate|create|add)\b/i.test(text)) {
      return ["vnem_tools_api_adapter_catalog", "vnem_tools_api_adapter_generate", "vnem_tools_api_adapter_contract_test", "vnem_tools_api_adapter_review_activate", "vnem_tools_evidence_pack"];
    }
    if (/\b(live request|allowlisted|get request|call the api|execute.*request|post request|mutation)\b/i.test(text)) {
      return ["vnem_tools_api_adapter_catalog", "vnem_tools_api_credential_reference_check", "vnem_tools_api_adapter_plan", "vnem_tools_api_adapter_execute", "vnem_tools_api_adapter_compensate", "vnem_tools_evidence_pack"];
    }
    return ["vnem_tools_api_adapter_catalog", "vnem_tools_api_adapter_plan", "vnem_tools_source_map", "vnem_tools_evidence_pack"];
  }
  if (domain.id === "browser_ui" && !/\b(browser|screenshot|localhost|visual proof|viewport)\b/i.test(String(args.user_goal || ""))) {
    return ["vnem_tools_ui_surface_review", "vnem_tools_test_selection_plan"];
  }
  return domain.tools;
}

function toolSequenceFor(tools, args) {
  const available = new Set(stringArray(args.available_tool_names));
  const allowed = new Set(stringArray(args.allowed_tool_names));
  const evidence = normalizeEvidenceSummary(args.tools_evidence_summary);
  const callStatus = new Map(evidence.tool_calls.map((item) => [item.tool, item]));
  const configured = toolsMcpConfigured(args.available_mcp_names);
  return tools.map((tool, index) => {
    const observed = callStatus.get(tool);
    return {
      step: index + 1,
      tool,
      purpose: TOOL_PURPOSES[tool] || "execute the selected capability",
      state: {
        available: available.size ? available.has(tool) : "registered_contract_only",
        configured: available.size ? available.has(tool) : configured ? "mcp_surface_only" : "unknown",
        allowed: allowed.size ? allowed.has(tool) : "unknown_until_permission_evaluation",
        executed: Boolean(observed),
        succeeded: observed ? observed.status === "succeeded" : false,
        proof_collected: Boolean(observed?.evidence_ids?.length)
      }
    };
  });
}

function capabilityPacksFor(classification, tools) {
  return (classification.domains || []).slice(0, 4).map((domain) => ({
    id: `core.${domain.id}`,
    domain: domain.id,
    selected_guidance: domain.reasons,
    tools_calls: tools.filter((tool) => DOMAIN_ADAPTERS.find((item) => item.id === domain.id)?.tools.includes(tool)),
    required_checks: checksForDomain(domain.id),
    output_contract_effects: outputEffectsForDomain(domain.id),
    completion_effects: completionCriteriaFor({ domains: [domain], matched_flags: {} }).map((item) => item.id)
  }));
}

function compactCapabilityPack(pack) {
  return { id: pack.id, affects: { tools: pack.tools_calls, checks: pack.required_checks, output: pack.output_contract_effects, completion: pack.completion_effects } };
}

function adapterSelectionFor(classification, tools) {
  const ids = new Set((classification.domains || []).map((domain) => domain.id));
  const adapters = [];
  if (ids.has("api_integration")) {
    const executable = tools.includes("vnem_tools_api_adapter_execute");
    adapters.push({
      type: "api",
      core_discovery_calls: ["vnem_search_apis", "vnem_recommend_apis"],
      tools_adapter: executable ? "vnem_tools_api_adapter_execute" : null,
      catalog_tool: tools.includes("vnem_tools_api_adapter_catalog") ? "vnem_tools_api_adapter_catalog" : null,
      credential_broker_tool: tools.includes("vnem_tools_api_credential_reference_check") ? "vnem_tools_api_credential_reference_check" : null,
      readiness: executable ? "vetted_adapter_execution_ready_subject_to_exact_auth_and_permission_class" : "metadata_and_planning_only",
      compatibility_and_risk: ["provider version", "official docs freshness", "auth reference", "approved host/method", "rate/retry/cache", "schema", "redaction", "mutation compensation"],
      unsupported_records_recommended: false
    });
  }
  if (ids.has("skills")) {
    adapters.push({
      type: "skill",
      core_discovery_calls: ["vnem_search_skills", "vnem_recommend_skills"],
      tools_adapter: null,
      readiness: "metadata_only_until_vetted_execution_runtime_exists",
      compatibility_and_risk: ["client support", "provenance", "prompt injection", "install scripts", "permission scope"],
      unsupported_records_recommended: false
    });
  }
  return adapters;
}

function checksForDomain(domain) {
  const map = {
    debugging: ["reproduce or classify failure", "targeted regression rerun"],
    github_publish: ["bounded diff and unresolved review state", "remote SHA equality", "PR head equality", "exact-head Actions jobs/steps conclusion", "protected-branch state", "normal corrective-commit or rollback guidance"],
    browser_ui: ["desktop and mobile state", "structured interaction", "accessibility tree", "console and failed-network evidence", "before/after comparison", "owned-process cleanup"],
    windows_local: ["exact process/port/path/service/task targets", "provider and access status", "secret/privacy boundary", "scoped local_pc_action permission and rollback for any mutation", "security controls remain enabled"],
    package_dependency: ["dependency/install-script audit", "focused tests", "rollback"],
    api_integration: ["schema/auth review", "redaction", "bounded response proof"],
    evidence_validation: ["handler and behavior test", "MCP-path proof", "claim audit"]
  };
  return map[domain] || ["affected verification", "proof boundary review"];
}

function outputEffectsForDomain(domain) {
  if (domain === "github_publish") return ["diff/review findings", "remote and PR SHA equality", "PR URL", "exact-head CI jobs/steps URL/status", "release/tag proof when relevant", "repair or rollback guidance", "not proven"];
  if (domain === "browser_ui") return ["interaction and state evidence", "before/after screenshots and pixel delta", "DOM/a11y snapshots", "console/network status", "browser cleanup", "not proven"];
  if (domain === "windows_local") return ["bounded system/path/process/port/service/task/event evidence", "provider or access limits", "safe restart/reload guidance", "permission and rollback gate", "not proven"];
  if (domain === "debugging") return ["root-cause evidence", "smallest fix", "rerun result", "residual risk"];
  return ["result", "evidence", "not proven", "next action"];
}

function materialMissingContext(classification, args, compatibility) {
  const ids = new Set(classification.domains.map((item) => item.id));
  const missing = [];
  const add = (id, question, materialTo, resolution, askUser = false) => missing.push({ id, question, material_to: materialTo, resolution, ask_user: askUser });
  if (ids.has("github_publish") && !/\b(base|main|master|branch|pr\s*#?\d+)\b/i.test(`${args.task_context || ""} ${stringArray(args.repo_signals).join(" ")}`)) add("remote_target", "Which branch/PR is the intended target?", ["irreversible behavior", "correctness"], "discover from Git first; ask only if ambiguous");
  const apiContext = String(args.task_context || "");
  const apiAuthorizationConfirmed = /\b(authorization confirmed|user approved|approved endpoint|authorized\s*[:=]\s*(?:yes|true))\b/i.test(apiContext);
  const apiCredentialReferencePresent = /\b(credential|auth) reference\s*[:=]\s*\S+/i.test(apiContext);
  if (ids.has("api_integration") && /\b(live|execute|request|call|mutation|post|patch|delete)\b/i.test(String(args.user_goal || "")) && /\b(auth|oauth|bearer|token|api key|private|credential|mutation|post|patch|delete)\b/i.test(`${args.user_goal || ""} ${args.task_context || ""}`) && (!apiAuthorizationConfirmed || !apiCredentialReferencePresent)) add("api_authorization", "Is this endpoint authorized and which credential reference should be used?", ["safety", "cost"], "ask user for authorization and reference, never a secret value", true);
  if (ids.has("game_modding") && !compatibility.constraints.some((item) => ["game_version", "mod_loader"].includes(item.dimension) && item.observed)) add("game_runtime", "What exact game version and mod-loader scope applies?", ["compatibility", "correctness"], "inspect local metadata first, then ask if unavailable", false);
  if (ids.has("package_dependency") && !/\b(package-lock|pnpm-lock|yarn.lock|npm|pnpm|yarn)\b/i.test(`${args.task_context || ""} ${stringArray(args.repo_signals).join(" ")}`)) add("package_manager", "Which package manager and lockfile own the project?", ["compatibility", "correctness"], "discover from repository files", false);
  if (ids.has("browser_ui") && !compatibility.constraints.some((item) => item.dimension === "browser" && item.observed)) add("browser_runtime", "Is an approved local browser runtime available?", ["evidence"], "detect at verification time", false);
  return missing;
}

function safeAssumptions(classification, args, missing) {
  const values = ["Use read-only inspection before mutation.", "Treat execution, success, and proof as separate states."];
  if (!classification.matched_flags.github_or_publish) values.push("Keep work local unless remote publication is explicit.");
  if (!stringArray(args.allowed_tool_names).length) values.push("Do not assume mutation permission; evaluate the active profile before acting.");
  if (!missing.some((item) => item.ask_user)) values.push("Discover non-blocking context from the project and proceed without a clarifying question.");
  return values;
}

function permissionImplicationsFor(classification, sequence, args) {
  const tools = sequence.map((item) => item.tool);
  const network = tools.some((tool) => /github|cloudflare|api_request|api_adapter_(?:execute|compensate)|browser|web_search|source_extract/.test(tool));
  const mutation = tools.some((tool) => /apply|run_|push|create|deploy|rollback|api_request|api_adapter_(?:compensate|review_activate)/.test(tool));
  return {
    default_profile: mutation ? "safe-local-dev or stronger scoped grant" : "safe-readonly",
    network_approval_may_be_required: network,
    mutation_approval_required: mutation,
    hard_blocks_remain: ["secret export", "force push", "repository deletion", "unbounded destructive filesystem actions"],
    allowed_tool_names_supplied: stringArray(args.allowed_tool_names).length > 0
  };
}

function completionCriteriaFor(classification) {
  const ids = new Set((classification.domains || []).map((item) => item.id));
  const criteria = [
    { id: "route", criterion: "The selected capability route matches the material task domains." },
    { id: "execution", criterion: "Every claimed action has an executed Tools or command record." },
    { id: "verification", criterion: "Affected checks ran successfully or are explicitly blocked/not proven." },
    { id: "claim_boundary", criterion: "The final claim does not exceed collected evidence." }
  ];
  if (ids.has("github_publish")) {
    criteria.push({ id: "remote_proof", criterion: "Local HEAD, remote branch, PR head, and exact-head Actions evidence agree on the exact SHA." });
    criteria.push({ id: "remote_review", criterion: "The bounded diff, unresolved review threads, protected-branch state, and relevant job/step or release proof were inspected without overstating pagination or semantic correctness." });
    criteria.push({ id: "remote_repair", criterion: "A normal corrective-commit, PR update, rerun, or release repair path is stated; force-push is not treated as default rollback." });
  }
  if (ids.has("browser_ui")) criteria.push({ id: "browser_proof", criterion: "Required UI states have browser evidence or an honest unavailable boundary." });
  if (ids.has("package_dependency") || ids.has("client_setup") || ids.has("game_modding")) criteria.push({ id: "rollback", criterion: "The mutation has a verified rollback or an explicit rollback-unavailable warning." });
  return criteria;
}

function stopConditionsFor(classification, missing) {
  const values = ["Evidence does not support the intended final claim.", "A hard protection or active permission profile blocks the action."];
  if (classification.matched_flags.github_or_publish) values.push("Worktree, auth, remote, branch, or SHA does not match the publish contract.");
  if (classification.matched_flags.browser_or_ui) values.push("Visual success is required but no browser or equivalent evidence path is available.");
  if (missing.some((item) => item.ask_user)) values.push("Material authorization or irreversible-choice context requires user input.");
  return values;
}

function nextActionFor(classification, sequence, missing) {
  const userQuestion = missing.find((item) => item.ask_user);
  if (userQuestion) return `Ask only: ${userQuestion.question}`;
  if (sequence[0]) return `Call Tools MCP ${sequence[0].tool}; then return its status and evidence ids to Core.`;
  if (classification.primary === "simple_answer") return "Answer directly; activate VNEM only if material execution or proof appears.";
  return "Call vnem_decision_details for the compatibility and capability-gap sections.";
}

function compatibilityRequirements(text) {
  const requirements = [];
  const add = (dimension, field, expected, scope, affects) => { if (!requirements.some((item) => item.dimension === dimension)) requirements.push({ dimension, field, expected, scope, affects }); };
  if (/windows|powershell|appdata|event viewer|registry/.test(text)) add("os", "os", "Windows-compatible behavior", "this local task", ["paths", "commands", "permissions"]);
  if (/powershell|bash|shell|terminal|command/.test(text)) add("shell", "shell", "command syntax matching the active shell", "this command path", ["execution correctness"]);
  if (/node|npm|pnpm|yarn|package|javascript|typescript/.test(text)) add("runtime", "node_version", "project-supported Node/runtime version", "this project", ["dependency and test behavior"]);
  if (/npm|pnpm|yarn|package|lockfile/.test(text)) add("package_manager", "package_manager", "lockfile-owning package manager", "this project", ["determinism", "lockfile integrity"]);
  if (/react|vue|svelte|next\.?js|framework|frontend|backend/.test(text)) add("framework", "framework", "project framework and version", "this application", ["architecture", "API compatibility"]);
  if (/app|application|project type|frontend|backend|full[- ]?stack/.test(text)) add("project_type", "project_type", "actual project type and ownership boundaries", "this project", ["routing", "architecture"]);
  if (/codex|claude|cursor|windsurf|cline|gemini|mcp client/.test(text)) add("client", "client", "documented client config contract", "this client installation", ["config path", "reload behavior"]);
  if (/mcp|stdio|sse|streamable http/.test(text)) add("mcp_transport", "mcp_transport", "client/server supported transport", "this MCP connection", ["connectivity"]);
  if (/game|modding|mod loader|roblox|luau/.test(text)) {
    add("game_version", "game_version", "exact target game version", "this game install/project", ["runtime compatibility"]);
    add("mod_loader", "mod_loader", "exact loader/toolchain version", "this mod project", ["load behavior", "rollback"]);
    add("file_format", "file_format", "actual edited file format and parser/toolchain", "this mod or data file", ["parse safety", "rollback"]);
  }
  if (/api|oauth|bearer|api key|webhook/.test(text)) add("api_auth", "api_auth", "approved auth method and credential reference", "this API/provider", ["authorization", "secret safety"]);
  if (/api|provider|official docs|documentation|sdk/.test(text)) add("provider_version", "provider_version", "current provider or SDK version", "this integration", ["contract compatibility", "freshness"]);
  if (/github|pull request|actions|release/.test(text)) add("github_permissions", "github_permissions", "minimum required repository/workflow scopes", "this repository action", ["remote execution"]);
  if (/browser|screenshot|viewport|localhost|ui/.test(text)) add("browser", "browser_available", "approved browser runtime and target", "this UI proof run", ["visual evidence"]);
  return requirements;
}

function normalizeCompatibilityFact(value) {
  if (!value || typeof value !== "object" || !value.dimension) return null;
  return {
    dimension: String(value.dimension),
    value: value.value == null ? null : String(value.value),
    status: ["verified", "supported", "observed_unverified", "unknown", "incompatible"].includes(value.status) ? value.status : "observed_unverified",
    evidence: value.evidence ? String(value.evidence) : null,
    scope: value.scope ? String(value.scope) : "task-local"
  };
}

function normalizeEvidenceSummary(value) {
  const summary = objectValue(value);
  return {
    requirements: arrayValue(summary.requirements).map((item) => ({ id: String(item?.id || ""), status: String(item?.status || "not_proven"), evidence_ids: stringArray(item?.evidence_ids) })).filter((item) => item.id),
    tool_calls: arrayValue(summary.tool_calls).map((item) => ({ tool: String(item?.tool || ""), status: String(item?.status || "unknown"), evidence_ids: stringArray(item?.evidence_ids) })).filter((item) => item.tool),
    checks: arrayValue(summary.checks).map((item) => ({ name: String(item?.name || ""), status: String(item?.status || "unknown"), evidence_ids: stringArray(item?.evidence_ids) })).filter((item) => item.name),
    claims: arrayValue(summary.claims).map((item) => typeof item === "string" ? { text: item, evidence_ids: [] } : { text: String(item?.text || ""), evidence_ids: stringArray(item?.evidence_ids) }).filter((item) => item.text),
    blockers: arrayValue(summary.blockers).map((item) => typeof item === "string" ? { type: "unknown", reason: item, requires_user: false } : { type: String(item?.type || "unknown"), reason: String(item?.reason || "blocked"), requires_user: Boolean(item?.requires_user) }),
    not_proven: stringArray(summary.not_proven)
  };
}

function normalizeCriteria(value) {
  return arrayValue(value).map((item, index) => typeof item === "string"
    ? { id: `requirement_${index + 1}`, criterion: item }
    : { id: String(item?.id || `requirement_${index + 1}`), criterion: String(item?.criterion || item?.text || "Required evidence") });
}

function defaultContinuationCriteria() {
  return [
    { id: "execution", criterion: "Claimed actions have execution records." },
    { id: "verification", criterion: "Required checks passed or are explicitly not proven." },
    { id: "claim_boundary", criterion: "Claims cite exact evidence ids." }
  ];
}

function compactContinuation(value) {
  return {
    completion_state: value.completion_state,
    remaining_requirement_ids: value.remaining_requirements.map((item) => item.id),
    rerun_needed: value.rerun_needed,
    user_input_required: value.user_input_required,
    smallest_next_action: value.smallest_next_action
  };
}

function redactedInputSummary(args) {
  return {
    user_goal: String(args.user_goal || "").slice(0, 500),
    task_mode: args.task_mode || "auto",
    context_present: Boolean(args.task_context),
    repo_signal_count: stringArray(args.repo_signals).length,
    constraint_count: stringArray(args.user_constraints).length,
    environment_fields: Object.keys(objectValue(args.environment)),
    evidence_summary_present: Boolean(args.tools_evidence_summary && Object.keys(args.tools_evidence_summary).length)
  };
}

function rememberDecision(id, value) {
  if (decisionStore.has(id)) decisionStore.delete(id);
  decisionStore.set(id, value);
  while (decisionStore.size > MAX_DECISIONS) decisionStore.delete(decisionStore.keys().next().value);
}

function toolsMcpConfigured(names) { return stringArray(names).some((name) => /vnem[-_ ]?tools|tools/i.test(name)); }

function stableId(prefix, value) { return `${prefix}-${createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16)}`; }

function normalize(value) { return String(value || "").toLowerCase().replace(/[^a-z0-9+#./_-]+/g, " ").replace(/\s+/g, " ").trim(); }

function unique(values) { return [...new Set(values.filter(Boolean))]; }

function stringArray(value) { return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : []; }

function arrayValue(value) { return Array.isArray(value) ? value : []; }

function objectValue(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
