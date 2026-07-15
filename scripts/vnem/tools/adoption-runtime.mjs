export function createToolsAdoptionRuntime({
  toolsRegistry,
  statusObject,
  resolveAllowedRoot,
  runtimeToolCatalog,
  githubSettings,
  githubProfileStatus,
  arrayify,
  projectRoutingStatus
}) {
  function toolsVisibilityDoctor(args = {}) {
    const catalog = runtimeToolCatalog();
    const names = new Set(catalog.map((tool) => tool.name));
    const availableToolNames = new Set(arrayify(args.available_tool_names).map((name) => String(name)));
    const entrypoints = ["vnem_tools_entrypoint", "vnem_tools_capability_router", "vnem_tools_adoption_readiness", "vnem_tools_visibility_doctor", "vnem_tools_underuse_detector", "vnem_tools_install_profile_emit", "vnem_tools_install_doctor"];
    const powerLayers = {
      repo_power: ["vnem_tools_repo_deep_map", "vnem_tools_failure_triage", "vnem_tools_evidence_pack"].every((tool) => names.has(tool)),
      code_intelligence: ["vnem_tools_code_symbol_map", "vnem_tools_patch_target_finder", "vnem_tools_source_impact_trace"].every((tool) => names.has(tool)),
      github_ci_proof: ["vnem_tools_github_status", "vnem_tools_github_diff_review", "vnem_tools_github_review_threads", "vnem_tools_github_remote_proof", "vnem_tools_github_actions_run_inspect", "vnem_tools_github_release_verify", "vnem_tools_github_public_surface_audit", "vnem_tools_github_actions_status", "vnem_tools_pr_quality_gate"].every((tool) => names.has(tool)),
      browser_ui_proof: ["vnem_tools_browser_evidence_plan", "vnem_tools_browser_interaction_run", "vnem_tools_browser_evidence_compare", "vnem_tools_ui_evidence_audit"].every((tool) => names.has(tool)),
      windows_local_proof: ["vnem_tools_windows_system_snapshot", "vnem_tools_powershell_command_plan", "vnem_tools_windows_path_inspect", "vnem_tools_process_inspect", "vnem_tools_port_inspect", "vnem_tools_windows_event_log_read", "vnem_tools_windows_change_plan"].every((tool) => names.has(tool)),
      game_domain_proof: ["vnem_tools_game_adapter_catalog", "vnem_tools_game_project_inspect", "vnem_tools_game_config_audit", "vnem_tools_mod_compatibility_analyze", "vnem_tools_mod_profile_compare", "vnem_tools_game_project_validate", "vnem_tools_mod_backup_create", "vnem_tools_mod_backup_restore", "vnem_tools_roblox_project_inspect", "vnem_tools_luau_symbol_map"].every((tool) => names.has(tool)),
      dependency_security_proof: ["vnem_tools_dependency_inventory", "vnem_tools_dependency_risk_audit", "vnem_tools_dependency_advisory_audit", "vnem_tools_dependency_change_analyze", "vnem_tools_dependency_upgrade_plan", "vnem_tools_dependency_install_apply", "vnem_tools_dependency_transaction_rollback"].every((tool) => names.has(tool)),
      structural_refactoring_proof: ["vnem_tools_structural_index_build", "vnem_tools_structural_graph_query", "vnem_tools_exact_symbol_references", "vnem_tools_refactor_rename_preview", "vnem_tools_refactor_move_preview", "vnem_tools_refactor_extract_plan", "vnem_tools_dead_code_candidates", "vnem_tools_refactor_impact_analyze", "vnem_tools_structural_patch_validate", "vnem_tools_refactor_apply_verify", "vnem_tools_refactor_transaction_rollback"].every((tool) => names.has(tool)),
      adoption_diagnostics: entrypoints.every((tool) => names.has(tool))
    };
    const weak = toolsWeakAdoptionDescriptions(catalog);
    const entrypointToolsPresent = Object.fromEntries(entrypoints.map((tool) => [tool, {
      registered: names.has(tool),
      visible_from_client_list: availableToolNames.size ? availableToolNames.has(tool) : "unknown"
    }]));
    const missingPower = Object.entries(powerLayers).filter(([, present]) => !present).map(([layer]) => layer);
    const adoptionReadinessScore = Math.max(0, 100 - (weak.length * 8) - (missingPower.length * 15) - (entrypoints.filter((tool) => !names.has(tool)).length * 20));
    const goal = String(args.user_goal || "");
    const router = goal ? toolsCapabilityRouter({ user_goal: goal, task_type: "auto", available_context: {} }) : null;
    return {
      tools_mcp_visible: true,
      registered_tool_count: names.size,
      entrypoint_tools_present: entrypointToolsPresent,
      core_handoff_compatible: Boolean(statusObject().adoption_reliability_policy?.core_handoff_compatible),
      required_power_layers_present: powerLayers,
      missing_or_weak_descriptions: weak,
      recommended_first_tools_call: router?.exact_call_sequence?.[0]?.tool || "vnem_tools_entrypoint",
      adoption_readiness_score: adoptionReadinessScore,
      next_step: router?.exact_call_sequence?.[0]?.tool
        ? `Call ${router.exact_call_sequence[0].tool} with root/repo context.`
        : "Call vnem_tools_entrypoint with user_goal and root.",
      exact_registered_name_validation: true,
      confidence: weak.length || missingPower.length ? "medium" : "high",
      output_compact: true
    };
  }

  function toolsUnderuseDetector(args = {}) {
    const goal = String(args.user_goal || "").trim();
    const context = {
      repo_path: args.repo_path || "",
      root: args.repo_path || "",
      changed_files: arrayify(args.changed_files)
    };
    const router = toolsCapabilityRouter({ user_goal: goal, task_type: args.task_type || "auto", available_context: context });
    const actionText = normalizeTextForTools(arrayify(args.recent_actions).join(" "));
    const categories = router.matched_task_categories || [];
    const casual = isCasualToolsTask(goal, args.task_type || "auto");
    const usedAnyTools = /\bvnem_tools_/.test(actionText);
    const missing = casual ? [] : router.exact_call_sequence
      .filter((step) => !actionText.includes(step.tool.toLowerCase()))
      .slice(0, 6)
      .map((step) => step.tool);
    const shouldHaveUsedTools = !casual && !usedAnyTools && missing.length > 0;
    return {
      task_categories: categories,
      should_have_used_tools: shouldHaveUsedTools,
      missing_tools_calls: missing,
      exact_recovery_sequence: missing.map((tool, index) => ({
        step: index + 1,
        tool,
        arguments: toolsRecoveryArgs(tool, goal, args)
      })),
      severity: shouldHaveUsedTools
        ? categories.includes("github_pr_ci_proof") || categories.includes("debugging_failing_tests") ? "high" : "medium"
        : "none",
      reason: shouldHaveUsedTools
        ? "Tools MCP should be used for this repo/code/debug/test/proof/GitHub/patch task, but recent actions show no VNEM Tools call."
        : casual
          ? "Casual/simple text task does not need Tools MCP."
          : "Recent actions already include Tools MCP or no missing call is detected.",
      not_needed_reason: casual ? "No repo/code/debug/test/proof/GitHub/CI/patch/MCP signals were detected." : "",
      confidence: shouldHaveUsedTools || casual ? "high" : "medium",
      diagnostic_only: true,
      output_compact: true
    };
  }

  function toolsWeakAdoptionDescriptions(catalog) {
    const important = new Set([
      "vnem_tools_entrypoint",
      "vnem_tools_capability_router",
      "vnem_tools_adoption_readiness",
      "vnem_tools_visibility_doctor",
      "vnem_tools_underuse_detector",
      "vnem_tools_install_profile_emit",
      "vnem_tools_install_doctor",
      "vnem_tools_repo_deep_map",
      "vnem_tools_code_symbol_map",
      "vnem_tools_mcp_surface_audit",
      "vnem_tools_patch_target_finder",
      "vnem_tools_tool_test_coverage_map",
      "vnem_tools_source_impact_trace",
      "vnem_tools_source_control_character_guard",
      "vnem_tools_failure_triage",
      "vnem_tools_evidence_pack",
      "vnem_tools_github_status",
      "vnem_tools_github_actions_status",
      "vnem_tools_pr_quality_gate"
    ]);
    return catalog
      .filter((tool) => important.has(tool.name))
      .filter((tool) => {
        const contract = tool.registry_contract || {};
        return String(contract.description || "").trim().length < 40
          || contract.input_schema_present !== true
          || !contract.output_contract
          || !contract.implementation_module
          || !Array.isArray(contract.permission_requirements)
          || contract.permission_requirements.length === 0;
      })
      .map((tool) => ({ tool: tool.name, reason: "authoritative runtime registry contract is incomplete" }));
  }

  function isCasualToolsTask(goal, taskType = "auto") {
    const text = normalizeTextForTools([goal, taskType].join(" "));
    return !/\b(repo|repository|code|debug|test|failing|failure|github|ci|pr|push|patch|mcp|tool|proof|evidence|browser|ui|cloudflare|deploy|session|recovery|artifact)\b/.test(text);
  }

  function toolsRecoveryArgs(tool, goal, args = {}) {
    const base = { root: args.repo_path || ".", user_goal: goal };
    if (tool.includes("failure_triage")) return { root: args.repo_path || ".", context: goal };
    if (tool.includes("github") || tool.includes("pr_quality_gate")) return { root: args.repo_path || ".", dry_run: true };
    if (tool.includes("source_impact") || tool.includes("test_selection")) return { ...base, changed_files: arrayify(args.changed_files) };
    return base;
  }

  function formatToolsVisibilityDoctor(doctor) {
    return [
      `vnem_tools_visibility_doctor: score=${doctor.adoption_readiness_score}`,
      `visible=${doctor.tools_mcp_visible}; registered=${doctor.registered_tool_count}`,
      `first=${doctor.recommended_first_tools_call}`,
      `weak=${doctor.missing_or_weak_descriptions.length}`,
      `next=${doctor.next_step}`
    ].join("\n");
  }

  function formatToolsUnderuseDetector(detector) {
    return [
      `vnem_tools_underuse_detector: should_have_used=${detector.should_have_used_tools}`,
      `severity=${detector.severity}; categories=${detector.task_categories.slice(0, 3).join(", ")}`,
      `missing=${detector.missing_tools_calls.slice(0, 6).join(", ") || "none"}`,
      `next=${detector.exact_recovery_sequence[0]?.tool || "none"}`
    ].join("\n");
  }

  async function toolsEntrypoint(args = {}) {
    let root = null;
    let routingStatus = null;
    try {
      root = await resolveAllowedRoot(args.repo_path || args.root || ".");
    } catch (error) {
      if (error?.code !== "project_not_selected" || typeof projectRoutingStatus !== "function") throw error;
      routingStatus = await projectRoutingStatus();
    }
    const availableContext = {
      repo_path: root ? root.relativePath || root.absolutePath : "",
      task_mode: args.task_mode || "auto",
      changed_files: arrayify(args.changed_files),
      failing_output: args.failing_output || ""
    };
    const router = toolsCapabilityRouter({
      user_goal: args.user_goal,
      task_type: args.task_mode || "auto",
      available_context: availableContext
    });
    const publishMode = router.matched_task_categories.includes("github_pr_ci_proof") && !router.local_only;
    const debugMode = router.matched_task_categories.includes("debugging_failing_tests");
    const browserMode = router.matched_task_categories.includes("browser_ui_verification");
    const selectionRequired = !root;
    const projectSelectionCalls = selectionRequired ? [
      { step: 1, tool: "vnem_tools_codex_trusted_projects", arguments: {}, purpose: "List canonical Codex-trusted roots without exposing unrelated configuration." },
      { step: 2, tool: "vnem_tools_project_select", arguments: { root: "<exact trusted or explicitly approved project root>" }, purpose: "Select one exact authorized project before project-sensitive work." }
    ] : [];
    return {
      root: root ? root.relativePath || root.absolutePath : null,
      project_selection_required: selectionRequired,
      project_routing: selectionRequired ? {
        mode: routingStatus?.mode || "codex-global",
        trusted_project_count: routingStatus?.codex_trusted_projects?.length || 0,
        persistent_approval_count: routingStatus?.explicit_persistent_approvals?.length || 0,
        session_approval_count: routingStatus?.explicit_session_approvals?.length || 0,
        selection_does_not_broaden_authorization: true
      } : null,
      available_power_layers: [
        "repo_power",
        "code_intelligence",
        "precision_execution",
        "permission_control",
        "skill_adapters",
        "data_systems",
        "tool_intelligence",
        "github_autonomy",
        "cloudflare_control",
        "browser_ui_proof",
        "session_recovery",
        "evidence_pack"
      ],
      best_tools_for_task: selectionRequired
        ? ["vnem_tools_codex_trusted_projects", "vnem_tools_project_select", ...router.ranked_tools].slice(0, 8)
        : router.ranked_tools.slice(0, 8),
      exact_tool_call_sequence: [...projectSelectionCalls, ...router.exact_call_sequence.map((step, index) => ({ ...step, step: index + projectSelectionCalls.length + 1 }))].slice(0, 10),
      required_inputs: selectionRequired ? ["exact trusted or explicitly approved project root"] : router.missing_inputs.length ? router.missing_inputs : ["user_goal", "root or repo_path"],
      optional_inputs: ["changed_files", "failing_output", "branch", "commit_sha", "pr_number", "app_url"],
      local_only_plan: [
        "inspect repo/code only inside allowed roots",
        "choose patch targets and focused checks",
        debugMode ? "triage failing output before edits" : "run targeted validation after changes",
        "finish with evidence pack and not-proven boundaries"
      ],
      remote_proof_plan: publishMode
        ? ["check gh/auth/repo status", "push feature branch only when approved", "verify remote branch SHA", "verify PR head SHA", "check GitHub Actions URL/status"]
        : ["not required for local-only tasks; do not claim remote proof"],
      checks_to_run: toolsChecksForCategories(router.matched_task_categories, arrayify(args.changed_files)),
      evidence_packet_shape: toolsEvidencePacketShape(publishMode, browserMode),
      proof_packet_shape: toolsEvidencePacketShape(publishMode, browserMode),
      safety_boundaries: [
        "allowed roots only",
        "dry-run and approval for mutation/network/browser/git actions",
        "secret-like paths blocked and secret-like output redacted",
        "no fake remote/browser/test proof",
        "no hidden/control source characters"
      ],
      unavailable_capabilities: router.unavailable_capabilities,
      fallback_if_tool_missing: router.fallback_plan,
      confidence: router.confidence,
      compact_next_step: selectionRequired
        ? "Call vnem_tools_codex_trusted_projects, then vnem_tools_project_select with one exact authorized root."
        : router.exact_call_sequence[0]
        ? `Call ${router.exact_call_sequence[0].tool} with root=${root.relativePath || "."}.`
        : "Call vnem_tools_manifest, then retry routing with more context.",
      output_compact: true
    };
  }

  function toolsCapabilityRouter(args = {}) {
    const goal = String(args.user_goal || "").trim();
    const taskType = String(args.task_type || "auto").trim().toLowerCase();
    const availableContext = args.available_context && typeof args.available_context === "object" ? args.available_context : {};
    const text = normalizeTextForTools([goal, taskType, JSON.stringify(availableContext)].filter(Boolean).join(" "));
    const localOnly = taskType === "local_only" || String(availableContext.task_mode || "").toLowerCase() === "local_only" || /\b(local only|local-only|no push|do not push|dont push|no pr|do not create pr|no remote)\b/.test(text);
    const categories = toolsTaskCategories(text, taskType, localOnly);
    const registeredNames = toolsRegisteredNames();
    const catalogByName = new Map(runtimeToolCatalog().map((tool) => [tool.name, tool]));
    const routeDefs = toolsRouteDefinitions();
    const rawTools = [];
    const unavailableCapabilities = [];

    if (categories.includes("data_systems")) {
      if (/\b(transform|convert|map columns?|rename columns?|filter rows?)\b/.test(text)) rawTools.push("vnem_tools_data_source_inspect", "vnem_tools_data_source_validate", "vnem_tools_data_transform_plan", "vnem_tools_data_transform_apply", "vnem_tools_data_transaction_rollback", "vnem_tools_data_source_diff");
      else if (/\b(migration|migrate|alter table|create index|schema change|database write|rollback)\b/.test(text)) rawTools.push("vnem_tools_database_connection_plan", "vnem_tools_database_schema_inspect", "vnem_tools_database_migration_preview", "vnem_tools_database_migration_apply", "vnem_tools_data_transaction_rollback", "vnem_tools_database_query");
      else rawTools.push("vnem_tools_database_connection_plan", "vnem_tools_data_source_inspect", "vnem_tools_data_source_validate", "vnem_tools_database_schema_inspect", "vnem_tools_database_query_plan", "vnem_tools_database_query");
    }

    const orderedCategories = taskType.includes("database") && categories.includes("data_systems")
      ? ["data_systems", ...categories.filter((category) => category !== "data_systems")]
      : categories.includes("structural_refactoring")
      ? ["structural_refactoring", ...categories.filter((category) => category !== "structural_refactoring")]
      : (localOnly || taskType.includes("implementation")) && categories.includes("coding_implementation")
        ? ["coding_implementation", ...categories.filter((category) => category !== "coding_implementation")]
        : categories;
    for (const category of orderedCategories) {
      for (const tool of routeDefs[category]?.tools || []) rawTools.push(tool);
    }
    if (!rawTools.length) rawTools.push("vnem_tools_manifest", "vnem_tools_status");

    const rankedNames = uniqueToolNames(rawTools).filter((tool) => {
      if (registeredNames.has(tool)) return true;
      unavailableCapabilities.push({ tool, reason: "not registered in current Tools MCP catalog" });
      return false;
    });
    const rankedTools = rankedNames.map((name, index) => ({
      rank: index + 1,
      name,
      capability_group: catalogByName.get(name)?.capability_group || "unknown",
      reason: toolsToolReason(name, categories),
      exact_registered_tool: true
    }));
    const missingInputs = toolsMissingInputs(categories, availableContext, localOnly);
    return {
      user_goal: goal,
      task_type: taskType,
      matched_task_categories: categories,
      local_only: localOnly,
      ranked_tools: rankedTools,
      exact_call_sequence: rankedTools.slice(0, 10).map((tool, index) => ({
        step: index + 1,
        tool: tool.name,
        purpose: tool.reason,
        required_inputs: toolsRequiredInputsForTool(tool.name, categories)
      })),
      missing_inputs: missingInputs,
      fallback_plan: [
        "call vnem_tools_manifest to inspect registered tools",
        "use vnem_tools_repo_deep_map for local repo orientation when unsure",
        "use vnem_tools_evidence_pack to report what was and was not proven"
      ],
      not_recommended_tools: localOnly
        ? ["live GitHub mutation/proof tools are not recommended for local-only tasks"]
        : ["mutation tools without dry-run/approval", "unsupported destructive admin actions", "fake or unregistered tool names"],
      why: categories.map((category) => routeDefs[category]?.why || `Matched ${category}.`),
      registered_tools_checked: true,
      registered_tool_count: registeredNames.size,
      fake_tool_names_removed: true,
      unavailable_capabilities: unavailableCapabilities,
      confidence: categories.length ? "high" : "medium",
      compact_next_step: rankedTools[0] ? `Call ${rankedTools[0].name}.` : "Call vnem_tools_manifest.",
      output_compact: true
    };
  }

  async function toolsAdoptionReadiness(args = {}) {
    const root = await resolveAllowedRoot(args.root || ".");
    const catalog = runtimeToolCatalog();
    const names = new Set(catalog.map((tool) => tool.name));
    const entrypointTools = ["vnem_tools_entrypoint", "vnem_tools_capability_router", "vnem_tools_adoption_readiness", "vnem_tools_visibility_doctor", "vnem_tools_underuse_detector"];
    const keyPowerTools = [
      "vnem_tools_repo_deep_map",
      "vnem_tools_code_symbol_map",
      "vnem_tools_mcp_surface_audit",
      "vnem_tools_patch_target_finder",
      "vnem_tools_tool_test_coverage_map",
      "vnem_tools_source_impact_trace",
      "vnem_tools_source_control_character_guard",
      "vnem_tools_local_session_recovery",
      "vnem_tools_github_status",
      "vnem_tools_github_actions_status",
      "vnem_tools_pr_quality_gate",
      "vnem_tools_evidence_pack",
      "vnem_tools_no_placebo_progress_audit",
      "vnem_tools_test_selection_plan",
      "vnem_tools_failure_triage"
    ];
    const discoveryWords = ["vnem", "entrypoint", "recommend", "route", "tools", "code", "repo", "proof", "mcp", "next action"];
    const weakDescriptions = catalog
      .filter((tool) => entrypointTools.includes(tool.name))
      .filter((tool) => {
        const description = normalizeTextForTools(tool.description || "");
        return !discoveryWords.every((word) => description.includes(word));
      })
      .map((tool) => tool.name);
    const status = statusObject();
    const missingAdoptionHooks = [
      ...entrypointTools.filter((tool) => !names.has(tool)),
      ...keyPowerTools.filter((tool) => !names.has(tool))
    ];
    const routeDescriptionsPresent = weakDescriptions.length === 0;
    return {
      root: root.relativePath || root.absolutePath,
      entrypoint_tools_present: entrypointTools.every((tool) => names.has(tool)),
      key_power_tools_present: Object.fromEntries(keyPowerTools.map((tool) => [tool, names.has(tool)])),
      route_descriptions_present: routeDescriptionsPresent,
      readiness_markers_present: Boolean(status.adoption_reliability_policy?.exact_registered_tool_names_only && status.adoption_reliability_policy?.core_handoff_compatible),
      missing_adoption_hooks: missingAdoptionHooks,
      weak_descriptions: weakDescriptions,
      recommended_repairs: missingAdoptionHooks.length || weakDescriptions.length
        ? ["register missing entrypoint/router/readiness tools", "make descriptions include VNEM entrypoint recommend route tools code repo proof MCP next action", "validate exact tool names against manifest"]
        : ["none"],
      exact_registered_tool_validation: true,
      compact_output_default: true,
      no_placebo_hooks: ["behavior tests", "manifest catalog entries", "readiness report markers", "source control character guard recommendation"],
      output_compact: true
    };
  }

  function toolsTaskCategories(text, taskType, localOnly) {
    const categories = [];
    const add = (category) => { if (!categories.includes(category)) categories.push(category); };
    if (taskType.includes("debug") || /\b(debug|failing|failure|failed|error|stack trace|ci failure|regression)\b/.test(text)) add("debugging_failing_tests");
    if (taskType.includes("skill") || /\b(vetted skill|agent skill|skill adapter|skill runtime|skill doctor|skill package)\b/.test(text)) add("skill_adapters");
    if (taskType.includes("database") || /\b(database|sqlite|postgres|mysql|mariadb|sqlserver|sql query|schema inspect|structured data|jsonl?|csv|yaml|tabular|migration)\b/.test(text)) add("data_systems");
    if (taskType.includes("repo") || /\b(repo|repository|inspect|map|state|branch|worktree)\b/.test(text)) add("repo_inspection");
    if (taskType.includes("patch") || /\b(patch|target|edit|change file|fix source|implementation site)\b/.test(text)) add("patch_targeting");
    if (/\b(semantic search|structural search|search code|find symbol|locate implementation)\b/.test(text)) add("structural_code_search");
    if (/\b(exact patch|search replace|unified diff|atomic patch|multi.file patch|patch transaction|rollback patch)\b/.test(text)) add("precision_patching");
    if (taskType.includes("documentation") || /\b(current docs|official docs|official documentation|framework documentation|library documentation|documentation retrieval)\b/.test(text)) add("official_documentation");
    if (/\b(red green|verification loop|run verification|bounded terminal|terminal session|syntax check)\b/.test(text)) add("precision_verification");
    if (/\b(permission profile|safety profile|scoped grant|grant access|power level|hard block)\b/.test(text)) add("permission_control");
    if (taskType.includes("mcp") || /\b(mcp|tool audit|surface audit|registration|handler|catalog|manifest|readiness)\b/.test(text)) add("mcp_tool_audit");
    if (taskType.includes("code_intelligence") || /\b(symbol|function|class|handler|coverage|impact trace|source impact|code intelligence)\b/.test(text)) add("code_intelligence");
    if (taskType.includes("refactor") || /\b(refactor|rename symbol|move module|extract function|extract module|dead code|exact references|structural graph|blast radius)\b/.test(text)) add("structural_refactoring");
    if (!localOnly && (taskType.includes("publish") || /\b(github|gh|pr|pull request|push|remote sha|actions|ci|merge|publish|review threads?|release proof|repo page)\b/.test(text))) add("github_pr_ci_proof");
    if (taskType.includes("cloudflare") || /\b(cloudflare|pages|workers|dns|zone|wrangler|deploy)\b/.test(text)) add("cloudflare_deploy_control");
    if (taskType.includes("browser") || /\b(browser|localhost|screenshot|ui|visual|viewport|responsive|dom|a11y)\b/.test(text)) add("browser_ui_verification");
    if (taskType.includes("windows") || /\b(windows|powershell|event viewer|defender|scheduled task|service status|path issue|file lock|local pc|tcp port)\b/.test(text)) add("windows_local_diagnosis");
    if (taskType.includes("game") || /\b(game|modding|mod loader|load order|mod profile|roblox|rojo|luau|game config|game asset)\b/.test(text)) add("game_modding_toolchain");
    if (taskType.includes("dependency") || /\b(package|dependency|dependencies|lockfile|sbom|supply chain|typosquat|license compatibility|advisory|vulnerability|npm audit|package upgrade|npm install|postinstall|preinstall)\b/.test(text)) add("dependency_security");
    if (taskType.includes("recovery") || /\b(recover|recovery|lost context|session|local stack|resume)\b/.test(text)) add("local_session_recovery");
    if (taskType.includes("no_placebo") || /\b(no placebo|placebo|fake proof|real implementation|not placebo|docs only|registration only)\b/.test(text)) add("no_placebo_progress_audit");
    if (taskType.includes("evidence") || /\b(evidence|proof pack|proof packet|handoff|final report|what is proven)\b/.test(text)) add("evidence_proof_pack");
    if (taskType.includes("generated") || /\b(generate|generated artifact|install.tgz|dashboard build|artifact mismatch)\b/.test(text)) add("generated_artifact_checks");
    if (taskType.includes("implementation") || /\b(implement|build|code|fix|feature|test)\b/.test(text)) add("coding_implementation");
    if (!categories.length) add("repo_inspection");
    return categories;
  }

  function toolsRouteDefinitions() {
    return {
      coding_implementation: { why: "Implementation needs repo orientation, structural search, exact patching, focused verification, and evidence.", tools: ["vnem_tools_repo_deep_map", "vnem_tools_structural_graph_query", "vnem_tools_structural_code_search", "vnem_tools_patch_target_finder", "vnem_tools_exact_patch", "vnem_tools_test_selection_plan", "vnem_tools_verification_loop", "vnem_tools_evidence_pack"] },
      debugging_failing_tests: { why: "Failing checks need failure triage, exact target evidence, structural search, focused test selection, bounded reruns, and evidence before any patch is chosen.", tools: ["vnem_tools_failure_triage", "vnem_tools_patch_target_finder", "vnem_tools_structural_code_search", "vnem_tools_test_selection_plan", "vnem_tools_verification_loop", "vnem_tools_evidence_pack"] },
      repo_inspection: { why: "Repo inspection needs a bounded repo map and ranked next actions.", tools: ["vnem_tools_repo_deep_map", "vnem_tools_next_action_ranker", "vnem_tools_code_symbol_map"] },
      patch_targeting: { why: "Patch targeting needs structural and symbol evidence plus impact tracing.", tools: ["vnem_tools_structural_code_search", "vnem_tools_patch_target_finder", "vnem_tools_code_symbol_map", "vnem_tools_source_impact_trace"] },
      structural_code_search: { why: "Conceptual code discovery benefits from the lazy language-aware local structural index.", tools: ["vnem_tools_code_index_status", "vnem_tools_structural_code_search"] },
      precision_patching: { why: "Surgical changes need exact preconditions, dry-run verification, atomic evidence, and rollback.", tools: ["vnem_tools_exact_patch", "vnem_tools_unified_diff_apply", "vnem_tools_patch_transaction", "vnem_tools_patch_transaction_rollback"] },
      official_documentation: { why: "Framework work needs a known source boundary, bounded current retrieval, task-scoped context, and cache freshness evidence before writes.", tools: ["vnem_tools_documentation_source_catalog", "vnem_tools_official_documentation_fetch", "vnem_tools_documentation_context", "vnem_tools_documentation_cache_status"] },
      precision_verification: { why: "Implementation proof needs bounded stateful commands and persistent red, green, or check loops.", tools: ["vnem_tools_verification_loop", "vnem_tools_terminal_session", "vnem_tools_ephemeral_script"] },
      permission_control: { why: "Permission changes need a narrow request, exact acknowledgment, scope evaluation, doctor proof, and revocation path.", tools: ["vnem_tools_permission_evaluate", "vnem_tools_permission_request", "vnem_tools_permission_grant", "vnem_tools_permission_doctor", "vnem_tools_permission_revoke"] },
      skill_adapters: { why: "Skill work needs a vetted catalog, package trust inspection, doctor readiness, exact runtime and permission planning, VNEM-owned execution, and optional pinned-source identity proof without executing Markdown.", tools: ["vnem_tools_skill_adapter_catalog", "vnem_tools_skill_package_inspect", "vnem_tools_skill_doctor", "vnem_tools_skill_adapter_plan", "vnem_tools_skill_adapter_execute", "vnem_tools_skill_source_verify"] },
      data_systems: { why: "Database and structured-data work needs exact parser/engine and source hashes, schema and query plans, bounded redacted results, read-only defaults, and preview-bound backup/rollback evidence for writes.", tools: ["vnem_tools_database_connection_plan", "vnem_tools_data_source_inspect", "vnem_tools_data_source_validate", "vnem_tools_database_schema_inspect", "vnem_tools_database_query_plan", "vnem_tools_database_query", "vnem_tools_data_source_diff", "vnem_tools_data_transform_plan", "vnem_tools_data_transform_apply", "vnem_tools_database_migration_preview", "vnem_tools_database_migration_apply", "vnem_tools_data_transaction_rollback"] },
      mcp_tool_audit: { why: "MCP tool audit needs surface, coverage, catalog/readiness, and control-character checks.", tools: ["vnem_tools_mcp_surface_audit", "vnem_tools_tool_test_coverage_map", "vnem_tools_source_control_character_guard"] },
      code_intelligence: { why: "Code intelligence needs an incremental structural graph, exact bindings, symbols, MCP surface, patch targets, coverage, and source impact.", tools: ["vnem_tools_structural_index_build", "vnem_tools_structural_graph_query", "vnem_tools_exact_symbol_references", "vnem_tools_code_symbol_map", "vnem_tools_mcp_surface_audit", "vnem_tools_patch_target_finder", "vnem_tools_tool_test_coverage_map", "vnem_tools_source_impact_trace"] },
      structural_refactoring: { why: "Refactoring needs AST/binding evidence, hash-bound previews, collision and impact analysis, focused verification, post-reference proof, and exact rollback.", tools: ["vnem_tools_structural_index_build", "vnem_tools_exact_symbol_references", "vnem_tools_refactor_impact_analyze", "vnem_tools_refactor_rename_preview", "vnem_tools_refactor_move_preview", "vnem_tools_refactor_extract_plan", "vnem_tools_structural_patch_validate", "vnem_tools_refactor_apply_verify", "vnem_tools_refactor_transaction_rollback"] },
      github_pr_ci_proof: { why: "Remote work needs bounded diff/review evidence, exact local/remote/PR/Actions SHA proof, job/step visibility, a PR gate, and repair guidance.", tools: ["vnem_tools_github_status", "vnem_tools_github_diff_review", "vnem_tools_github_remote_proof", "vnem_tools_github_actions_status", "vnem_tools_github_actions_run_inspect", "vnem_tools_pr_quality_gate", "vnem_tools_evidence_pack"] },
      cloudflare_deploy_control: { why: "Cloudflare work needs auth/status, deploy planning, verification, and guarded mutation tools only when approved.", tools: ["vnem_tools_cloudflare_status", "vnem_tools_cloudflare_auth_plan", "vnem_tools_cloudflare_pages_deploy_plan", "vnem_tools_cloudflare_workers_deploy_plan", "vnem_tools_cloudflare_deploy_verify"] },
      browser_ui_verification: { why: "UI/browser claims need planned local interaction proof, runtime evidence, before/after comparison, and an audit of evidence limits.", tools: ["vnem_tools_browser_evidence_plan", "vnem_tools_browser_interaction_run", "vnem_tools_browser_evidence_compare", "vnem_tools_ui_surface_review", "vnem_tools_ui_evidence_audit", "vnem_tools_browser_evidence_run"] },
      windows_local_diagnosis: { why: "Windows/local-PC work needs safe quoting, bounded exact-target system evidence, provider/access honesty, and a permission plus rollback gate before mutation.", tools: ["vnem_tools_windows_system_snapshot", "vnem_tools_powershell_command_plan", "vnem_tools_windows_path_inspect", "vnem_tools_process_inspect", "vnem_tools_port_inspect", "vnem_tools_windows_service_status", "vnem_tools_windows_scheduled_task_status", "vnem_tools_windows_event_log_read", "vnem_tools_windows_app_config_detect", "vnem_tools_windows_change_plan"] },
      game_modding_toolchain: { why: "Game/mod/Roblox work needs an explicit adapter contract, bounded configs/manifests/load order, compatibility and hash evidence, isolated backup/restore, and game-specific validation without unknown tool execution.", tools: ["vnem_tools_game_adapter_catalog", "vnem_tools_game_project_inspect", "vnem_tools_game_config_audit", "vnem_tools_mod_compatibility_analyze", "vnem_tools_roblox_project_inspect", "vnem_tools_luau_symbol_map", "vnem_tools_game_project_validate", "vnem_tools_mod_backup_create"] },
      dependency_security: { why: "Dependency work needs normalized manifest/lock graph and SBOM evidence, lifecycle/source/license risk, fresh approved advisories, exact upgrade comparison, focused verification, and a hash-bound approval-gated rollback transaction for real npm installs.", tools: ["vnem_tools_dependency_inventory", "vnem_tools_dependency_risk_audit", "vnem_tools_dependency_advisory_audit", "vnem_tools_dependency_change_analyze", "vnem_tools_dependency_upgrade_plan", "vnem_tools_dependency_install_apply", "vnem_tools_dependency_transaction_rollback"] },
      local_session_recovery: { why: "Recovery needs branch/head/worktree/session state before further work.", tools: ["vnem_tools_local_session_recovery", "vnem_tools_repo_workflow_orchestrator"] },
      no_placebo_progress_audit: { why: "No-placebo review needs proof that behavior changed beyond docs/registration/generated churn.", tools: ["vnem_tools_no_placebo_progress_audit", "vnem_tools_task_progress_truth_check", "vnem_tools_evidence_pack"] },
      evidence_proof_pack: { why: "Evidence tasks need a compact proof packet and safe/must-not-claim boundaries.", tools: ["vnem_tools_evidence_pack", "vnem_tools_task_progress_truth_check"] },
      generated_artifact_checks: { why: "Generated artifacts need impact planning, focused checks, source impact, and evidence.", tools: ["vnem_tools_change_impact_plan", "vnem_tools_test_selection_plan", "vnem_tools_source_impact_trace", "vnem_tools_evidence_pack"] }
    };
  }

  function toolsRegisteredNames() {
    return new Set(toolsRegistry.manifest().map((tool) => tool.name));
  }

  function uniqueToolNames(values) {
    return [...new Set(values.filter(Boolean).map((value) => String(value)))];
  }

  function normalizeTextForTools(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9._:/#-]+/g, " ").replace(/\s+/g, " ").trim();
  }

  function toolsToolReason(toolName, categories) {
    if (toolName.includes("failure_triage")) return "classify failure and choose smallest rerun";
    if (toolName.includes("repo_deep_map")) return "orient on repo state and scripts";
    if (toolName.includes("code_symbol_map")) return "find symbols, handlers, exports, and code shape";
    if (toolName.includes("structural_index") || toolName.includes("structural_graph")) return "build or query parser-backed structural relationships";
    if (toolName.includes("exact_symbol_references")) return "resolve Babel lexical bindings and static ESM consumers";
    if (toolName.includes("refactor_")) return "preview, analyze, verify, or rollback one confidence-gated structural refactor";
    if (toolName.includes("patch_target_finder")) return "find exact source/test/readiness patch targets";
    if (toolName.includes("structural_code_search")) return "find conceptually relevant code and language-level symbols";
    if (toolName.includes("exact_patch") || toolName.includes("unified_diff") || toolName.includes("patch_transaction")) return "verify and apply surgical changes with preconditions and rollback evidence";
    if (toolName.includes("verification_loop") || toolName.includes("terminal_session")) return "run bounded checks with explicit timeout and persisted evidence";
    if (toolName.includes("documentation_")) return "catalog, retrieve, reuse, or inspect bounded current documentation evidence";
    if (toolName.includes("permission_")) return "evaluate or grant one bounded capability without weakening hard blocks";
    if (toolName.includes("skill_adapter_catalog")) return "select a vetted skill adapter from complete runtime and provenance contracts";
    if (toolName.includes("skill_package_inspect")) return "inspect local skill files as inert untrusted data";
    if (toolName.includes("skill_doctor")) return "verify source, license, runtime, permission, test, freshness, and evidence readiness";
    if (toolName.includes("skill_adapter_plan")) return "validate bounded adapter input and exact runtime permission scope";
    if (toolName.includes("skill_adapter_execute")) return "run one VNEM-owned vetted handler under runtime-specific permission gates";
    if (toolName.includes("skill_source_verify")) return "compare pinned source identities without returning or executing source content";
    if (toolName.includes("data_source_inspect")) return "inspect bounded structured data with schema inference and redacted samples";
    if (toolName.includes("data_source_validate")) return "validate structured rows or SQLite schema against an explicit contract";
    if (toolName.includes("data_source_diff")) return "compare schema and bounded row-key hashes without dumping changed values";
    if (toolName.includes("data_transform_plan")) return "bind a declarative transform preview to exact source bytes";
    if (toolName.includes("data_transform_apply")) return "apply a reviewed transform with transaction, backup, verification, and rollback evidence";
    if (toolName.includes("database_connection_plan")) return "validate local scope or reference-only remote connection scope without exposing credentials";
    if (toolName.includes("database_schema_inspect")) return "inspect bounded SQLite schema, indexes, foreign keys, views, and triggers";
    if (toolName.includes("database_query_plan")) return "prove a single read-only query shape with SQLite EXPLAIN QUERY PLAN";
    if (toolName.includes("database_query")) return "execute one bounded redacted query under SQLite query-only enforcement";
    if (toolName.includes("database_migration_preview")) return "preview schema and affected-row changes in an in-memory transaction";
    if (toolName.includes("database_migration_apply")) return "apply an exact fresh migration preview with backup and post-write verification";
    if (toolName.includes("data_transaction_rollback")) return "restore exact pre-transaction bytes after stale-hash checks";
    if (toolName.includes("source_impact_trace")) return "trace impact to tests and readiness";
    if (toolName.includes("test_selection_plan")) return "choose focused checks";
    if (toolName.includes("github_actions_status")) return "verify Actions status";
    if (toolName.includes("pr_quality_gate")) return "gate PR proof before claims";
    if (toolName.includes("evidence_pack")) return "build final proof packet";
    if (toolName.includes("source_control_character_guard")) return "scan hidden/control characters";
    if (toolName.includes("browser_evidence")) return "plan or run browser proof";
    if (toolName.includes("dependency_inventory")) return "build the direct/transitive lock graph and SBOM inventory";
    if (toolName.includes("dependency_risk")) return "inspect lifecycle, source, maintenance, typosquat, and license indicators";
    if (toolName.includes("dependency_advisory")) return "inspect fresh approved advisory evidence without lifecycle execution or credential exposure";
    if (toolName.includes("dependency_change")) return "compare direct/transitive upgrades and affected tests";
    if (toolName.includes("dependency_upgrade_plan")) return "bind exact package changes to current manifest and lock hashes";
    if (toolName.includes("dependency_install") || toolName.includes("dependency_transaction")) return "apply or roll back an exact approval-gated npm transaction";
    return `recommended for ${categories.slice(0, 2).join(", ")}`;
  }

  function toolsRequiredInputsForTool(toolName, categories) {
    const inputs = ["root"];
    if (toolName.includes("failure_triage")) inputs.push("failing_output or command stdout/stderr");
    if (toolName.includes("patch_target_finder")) inputs.push("user_goal or tool_name");
    if (toolName.includes("source_impact_trace") || toolName.includes("test_selection")) inputs.push("changed_files when known");
    if (toolName.includes("github") || toolName.includes("pr_quality_gate")) inputs.push("owner/repo, branch, PR, or SHA context");
    if (toolName.includes("browser")) inputs.push("app_url, file_path, or route");
    if (toolName.includes("game") || toolName.includes("mod_") || toolName.includes("roblox") || toolName.includes("luau")) inputs.push("exact game/tool version, platform, loader, and project root when known");
    if (toolName.includes("dependency")) inputs.push("package manager, owning manifest/lockfile, exact package/version, and approval scope when mutation is requested");
    if (toolName.includes("skill_")) inputs.push("adapter_id or local skill_path plus bounded adapter input");
    if (toolName.includes("data_source") || toolName.includes("data_transform")) inputs.push("source path, exact format when ambiguous, and expected schema or declarative operations when relevant");
    if (toolName.includes("database_")) inputs.push("local SQLite path or typed credential reference plus explicit remote scope; SQL or migration statements when relevant");
    if (toolName.includes("transaction_rollback")) inputs.push("exact in-session transaction_id");
    if (toolName.includes("refactor") || toolName.includes("structural_")) inputs.push("project root plus exact file/symbol/change scope");
    if (categories.includes("evidence_proof_pack")) inputs.push("commands_run, tests_passed, tests_failed");
    return uniqueToolNames(inputs);
  }

  function toolsMissingInputs(categories, context, localOnly) {
    const missing = [];
    if (!context.repo_path && !context.root) missing.push("root or repo_path");
    if (categories.includes("debugging_failing_tests") && !context.failing_output) missing.push("failing_output");
    if (categories.includes("github_pr_ci_proof") && !localOnly) missing.push("branch/commit_sha/pr_number when known");
    if (categories.includes("browser_ui_verification") && !context.app_url && !context.file_path) missing.push("app_url, file_path, or route");
    if (categories.includes("game_modding_toolchain") && !context.game_version) missing.push("game/tool version and loader/toolchain version when runtime compatibility matters");
    if (categories.includes("dependency_security") && !context.package_manager) missing.push("package manager and owning lockfile when mutation or exact resolution matters");
    if (categories.includes("skill_adapters") && !context.adapter_id && !context.skill_path) missing.push("adapter_id or local skill_path");
    if (categories.includes("data_systems") && !context.path && !context.database_path && !context.connection) missing.push("structured-data path, SQLite path, or typed remote connection reference");
    if (categories.includes("structural_refactoring") && !context.changed_files && !context.symbol) missing.push("exact symbol or changed_files for refactor scope");
    return uniqueToolNames(missing);
  }

  function toolsChecksForCategories(categories, changedFiles = []) {
    const checks = ["git diff --check", "node --check scripts/vnem-tools-mcp-server.mjs"];
    if (categories.includes("mcp_tool_audit") || categories.includes("code_intelligence")) checks.push("npm.cmd run test:tools-code-intelligence-1-regression", "npm.cmd run tools:readiness");
    if (categories.includes("debugging_failing_tests")) checks.push("rerun the failing command after the smallest fix");
    if (categories.includes("github_pr_ci_proof")) checks.push("verify remote branch SHA", "check GitHub Actions run status");
    if (categories.includes("browser_ui_verification")) checks.push("collect local browser evidence or report browser unavailable");
    if (categories.includes("game_modding_toolchain")) checks.push("run vnem_tools_game_project_validate", "run the exact game/loader project check or report it unproven");
    if (categories.includes("dependency_security")) checks.push("run vnem_tools_dependency_inventory", "verify lockfile plus focused test/build scripts", "prove rollback or report mutation unperformed");
    if (categories.includes("skill_adapters")) checks.push("npm.cmd run test:tools-giga-skill-runtime", "npm.cmd run tools:readiness", "verify no upstream Markdown or untrusted scripts executed");
    if (categories.includes("data_systems")) checks.push("npm.cmd run test:tools-giga-data-systems", "verify query/result bounds and redaction", "prove backup/rollback for any applied write");
    if (categories.includes("structural_refactoring")) checks.push("run vnem_tools_structural_patch_validate", "run focused refactor regression", "prove post-reference state and rollback hashes");
    if (changedFiles.some((file) => /package\.json|scripts\//.test(String(file)))) checks.push("npm.cmd run validate");
    return uniqueToolNames(checks).slice(0, 8);
  }

  function toolsEvidencePacketShape(remoteProof, browserProof) {
    const shape = ["branch", "head_sha", "worktree_status", "files_changed", "tests_checks_run", "safe_claims", "must_not_claim", "what_is_not_proven"];
    if (remoteProof) shape.push("remote_branch_sha", "pr_url", "pr_head_sha", "actions_run_url", "actions_status_conclusion");
    if (browserProof) shape.push("browser_evidence_url_or_path", "visual_claim_limits");
    return shape;
  }

  function formatToolsEntrypoint(entrypoint) {
    return [
      `vnem_tools_entrypoint: ${entrypoint.best_tools_for_task[0]?.name || "none"}`,
      `tools=${entrypoint.exact_tool_call_sequence.slice(0, 6).map((step) => step.tool).join(", ") || "none"}`,
      `checks=${entrypoint.checks_to_run.slice(0, 4).join("; ") || "none"}`,
      `next=${entrypoint.compact_next_step}`
    ].join("\n");
  }

  function formatToolsCapabilityRouter(router) {
    return [
      `vnem_tools_capability_router: ${router.matched_task_categories.join(", ")}`,
      `tools=${router.ranked_tools.slice(0, 6).map((tool) => tool.name).join(", ") || "none"}`,
      `fake_tool_names_removed=${router.fake_tool_names_removed}`,
      `next=${router.compact_next_step}`
    ].join("\n");
  }

  function formatToolsAdoptionReadiness(readiness) {
    return [
      `vnem_tools_adoption_readiness: entrypoints=${readiness.entrypoint_tools_present}`,
      `descriptions=${readiness.route_descriptions_present}`,
      `markers=${readiness.readiness_markers_present}`,
      `missing=${readiness.missing_adoption_hooks.join(", ") || "none"}`
    ].join("\n");
  }

  function buildGithubAutonomySummary() {
    const settings = githubSettings();
    const profile = githubProfileStatus({});
    return { capability_group: "github_autonomy", execution_model: "command-backed gh/git workflows with mocked-runner tests and live gh/git auth detection", feature_branch_push_supported: true, active_github_profile: settings.profile, autonomy_mode: settings.autonomy_mode, allowed_repos: settings.allowed_repos, protected_branches: settings.protected_branches, allowed_actions: profile.allowed_actions, blocked_actions: profile.blocked_actions, config_knobs: { direct_push: "VNEM_TOOLS_GITHUB_ALLOW_DIRECT_PUSH", force_push: "VNEM_TOOLS_GITHUB_ALLOW_FORCE_PUSH", repo_delete: "VNEM_TOOLS_GITHUB_ALLOW_REPO_DELETE", settings_mutation: "VNEM_TOOLS_GITHUB_ALLOW_SETTINGS_MUTATION", releases: "VNEM_TOOLS_GITHUB_ALLOW_RELEASES", actions_rerun: "VNEM_TOOLS_GITHUB_ALLOW_ACTIONS_RERUN" } };
  }

  return {
    buildGithubAutonomySummary,
    formatToolsAdoptionReadiness,
    formatToolsCapabilityRouter,
    formatToolsEntrypoint,
    formatToolsUnderuseDetector,
    formatToolsVisibilityDoctor,
    toolsAdoptionReadiness,
    toolsCapabilityRouter,
    toolsEntrypoint,
    toolsUnderuseDetector,
    toolsVisibilityDoctor,
    uniqueToolNames
  };
}
