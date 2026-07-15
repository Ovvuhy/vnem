export function createCoreAdoptionRuntime({
  classifyIntelligentCoreTask,
  recommendIntelligentTools,
  DEFAULT_MCP_TOOLS,
  normalize,
  arrayStrings,
  uniqueStrings
}) {
  const CORE_ADOPTION_ENTRYPOINTS = ["vnem_entrypoint", "vnem_usage_contract", "vnem_mcp_visibility_doctor", "vnem_underuse_detector", "vnem_usage_self_check", "vnem_install_adoption_guide"];
  const TOOLS_ADOPTION_ENTRYPOINTS = ["vnem_tools_entrypoint", "vnem_tools_capability_router", "vnem_tools_adoption_readiness", "vnem_tools_visibility_doctor", "vnem_tools_underuse_detector"];

  function buildCoreVisibilityDoctor(args = {}) {
    const availableMcpNames = arrayStrings(args.available_mcp_names).map((name) => name.toLowerCase());
    const availableToolNames = new Set(arrayStrings(args.available_tool_names));
    const userGoal = String(args.user_goal || "").trim();
    const classification = classifyIntelligentCoreTask(userGoal || "Inspect VNEM MCP visibility.", "", "auto");
    const toolsNeeded = classification.execution_needed || classification.proof_needed;
    const coreVisibleFromClient = availableMcpNames.some((name) => /\bvnem\b|vnem[-_ ]?core/.test(name)) || availableToolNames.has("vnem_entrypoint");
    const toolsVisible = availableMcpNames.some((name) => /vnem[-_ ]?tools|tools/.test(name)) || [...availableToolNames].some((name) => name.startsWith("vnem_tools_"));
    const coreEntryStatus = Object.fromEntries(CORE_ADOPTION_ENTRYPOINTS.map((tool) => [tool, {
      registered_by_core: DEFAULT_MCP_TOOLS.includes(tool),
      visible_from_client_list: availableToolNames.size ? availableToolNames.has(tool) : "unknown"
    }]));
    const toolsEntryStatus = Object.fromEntries(TOOLS_ADOPTION_ENTRYPOINTS.map((tool) => [tool, {
      visible_from_client_list: availableToolNames.size ? availableToolNames.has(tool) : "unknown"
    }]));
    const recommendedTools = toolsNeeded ? recommendIntelligentTools(classification) : [];
    const missingSurfaces = [];
    if (!coreVisibleFromClient && availableMcpNames.length) missingSurfaces.push("VNEM Core MCP name not listed by client");
    if (toolsNeeded && !toolsVisible) missingSurfaces.push("VNEM Tools MCP not visible for execution/proof task");
    if (availableToolNames.size) {
      for (const tool of CORE_ADOPTION_ENTRYPOINTS) if (!availableToolNames.has(tool)) missingSurfaces.push(`missing Core entrypoint ${tool}`);
      for (const tool of TOOLS_ADOPTION_ENTRYPOINTS.slice(0, 3)) if (toolsVisible && !availableToolNames.has(tool)) missingSurfaces.push(`missing Tools entrypoint ${tool}`);
    }
    const degradedMode = toolsNeeded && !toolsVisible
      ? "core_only_tools_needed"
      : toolsVisible
        ? "core_and_tools_visible"
        : "core_only_or_tools_unknown";
    const adoptionReadiness = toolsVisible && missingSurfaces.length === 0
      ? "full"
      : toolsNeeded && !toolsVisible
        ? "degraded"
        : "partial";
    return {
      client_name: args.client_name || "unknown",
      core_visible: true,
      tools_visible: toolsVisible,
      core_entrypoints_present: coreEntryStatus,
      tools_entrypoints_present: toolsEntryStatus,
      adoption_readiness: adoptionReadiness,
      recommended_first_call: userGoal ? "vnem_entrypoint" : "vnem_mcp_visibility_doctor",
      recommended_tools_handoff: {
        needed: toolsNeeded,
        tools_visible: toolsVisible,
        exact_tools_calls: toolsVisible ? recommendedTools.slice(0, 12) : [],
        unavailable_tools_calls: toolsVisible ? [] : recommendedTools.slice(0, 12),
        fallback: toolsVisible
          ? "Call vnem_tools_entrypoint or vnem_tools_capability_router with user_goal."
          : "Use Core plan-only guidance and ask/connect VNEM Tools MCP before claiming execution proof."
      },
      missing_surfaces: missingSurfaces,
      degraded_mode: degradedMode,
      next_step: toolsNeeded && toolsVisible
        ? `Call ${recommendedTools[0] || "vnem_tools_entrypoint"} next.`
        : toolsNeeded
          ? "Call vnem_entrypoint, then connect/use VNEM Tools MCP for execution proof."
          : "Call vnem_entrypoint only if the task becomes repo/code/tooling work.",
      confidence: availableMcpNames.length || availableToolNames.size ? "high" : "medium",
      reality_boundary: "This doctor can diagnose MCP visibility only from the connected client's reported MCP/tool names."
    };
  }

  function buildCoreUnderuseDetector(args = {}) {
    const userGoal = String(args.user_goal || "").trim();
    const recentActions = arrayStrings(args.recent_actions);
    const availableMcpNames = arrayStrings(args.available_mcp_names).map((name) => name.toLowerCase());
    const taskMode = args.task_type && args.task_type !== "auto" ? args.task_type : "auto";
    const classification = classifyIntelligentCoreTask(userGoal, "", taskMode);
    const actionText = normalize([recentActions.join(" "), availableMcpNames.join(" ")].join(" "));
    const vnemAvailable = availableMcpNames.length === 0 || availableMcpNames.some((name) => /vnem/.test(name));
    const toolsAvailable = availableMcpNames.some((name) => /vnem[-_ ]?tools|tools/.test(name));
    const simple = classification.primary === "simple_answer";
    const usedCore = /\bvnem_(entrypoint|recommend|usage_contract|mcp_visibility_doctor|underuse_detector|select_tools_for_task|build_tools_plan)\b/.test(actionText);
    const usedTools = /\bvnem_tools_/.test(actionText);
    const missing = [];
    if (!simple && vnemAvailable && !usedCore) missing.push("vnem_entrypoint");
    const recommendedTools = recommendIntelligentTools(classification);
    const priorityTools = uniqueStrings([
      classification.matched_flags?.debugging ? "vnem_tools_failure_triage" : null,
      classification.matched_flags?.github_or_publish ? "vnem_tools_github_status" : null,
      classification.matched_flags?.github_or_publish ? "vnem_tools_github_actions_status" : null,
      classification.matched_flags?.github_or_publish ? "vnem_tools_pr_quality_gate" : null,
      classification.matched_flags?.repo_or_code ? "vnem_tools_repo_deep_map" : null,
      classification.matched_flags?.repo_or_code ? "vnem_tools_patch_target_finder" : null,
      ...recommendedTools
    ]);
    if (!simple && classification.execution_needed && toolsAvailable && !usedTools) missing.push(...priorityTools.slice(0, 7));
    const shouldHaveUsed = !simple && vnemAvailable && missing.length > 0;
    const exactNext = missing[0] || (simple ? null : "vnem_entrypoint");
    return {
      task_classification: classification.primary,
      should_have_used_vnem: shouldHaveUsed,
      missing_vnem_calls: uniqueStrings(missing),
      recommended_recovery_call: exactNext,
      reason: shouldHaveUsed
        ? "VNEM is available and this repo/code/debug/GitHub/tooling/proof task benefits from Core routing and Tools proof."
        : simple
          ? "Simple/casual task does not need VNEM routing."
          : "Recent actions already show VNEM usage or availability is unclear.",
      severity: shouldHaveUsed
        ? classification.github_or_publish || classification.matched_flags.debugging ? "high" : "medium"
        : "none",
      exact_next_vnem_call: exactNext ? {
        tool: exactNext,
        arguments: exactNext.startsWith("vnem_tools_") ? { user_goal: userGoal, root: "." } : { user_goal: userGoal, available_mcp_names: availableMcpNames }
      } : null,
      not_needed_reason: simple ? "No repo/code/tooling/proof signals were detected." : "",
      confidence: shouldHaveUsed || simple ? "high" : "medium",
      diagnostic_only: true
    };
  }

  function buildUsageSelfCheck(args = {}) {
    const configuredNames = arrayStrings(args.configured_mcp_names).map((name) => name.toLowerCase());
    const visibleNames = new Set(arrayStrings(args.visible_tool_names));
    const instructions = String(args.client_instructions || "");
    const userGoal = String(args.user_goal || "").trim();
    const actions = arrayStrings(args.recent_session_actions);
    const evidence = arrayStrings(args.recent_session_evidence);
    const observedText = normalize([...actions, ...evidence].join(" "));
    const classification = classifyIntelligentCoreTask(userGoal || "Simple task", "", "auto");
    const materiallyUseful = Boolean(userGoal) && classification.primary !== "simple_answer";
    const toolsMateriallyUseful = materiallyUseful && (classification.execution_needed || classification.proof_needed);
    const coreConfigured = args.configuration_observed
      ? configuredNames.some((name) => /^(?:vnem|vnem[-_ ]?core)$/.test(name))
      : null;
    const toolsConfigured = args.configuration_observed
      ? configuredNames.some((name) => /vnem[-_ ]?tools/.test(name))
      : null;
    const coreVisible = args.tool_list_observed ? visibleNames.has("vnem_entrypoint") : null;
    const toolsVisible = args.tool_list_observed ? visibleNames.has("vnem_tools_entrypoint") : null;
    const instructionsMentionVnem = args.instructions_observed
      ? /\bVNEM\b/i.test(instructions) && /\bCore\b/i.test(instructions) && /\bTools\b/i.test(instructions)
      : null;
    const usedCore = args.session_evidence_observed
      ? /\bvnem_(?:entrypoint|usage_contract|mcp_visibility_doctor|underuse_detector|usage_self_check|install_adoption_guide)\b/.test(observedText)
      : null;
    const usedTools = args.session_evidence_observed ? /\bvnem_tools_/.test(observedText) : null;
    const skippedCore = materiallyUseful && args.session_evidence_observed && !usedCore;
    const skippedTools = toolsMateriallyUseful && args.session_evidence_observed && !usedTools;
    const correction = usageCorrection({
      userGoal,
      coreConfigured,
      toolsConfigured,
      coreVisible,
      toolsVisible,
      instructionsMentionVnem,
      materiallyUseful,
      toolsMateriallyUseful,
      usedCore,
      usedTools,
      sessionEvidenceObserved: args.session_evidence_observed
    });
    const notProven = [];
    if (!args.configuration_observed) notProven.push("Active client MCP configuration was not supplied.");
    if (!args.tool_list_observed) notProven.push("The client's current tool list was not supplied.");
    if (!args.instructions_observed) notProven.push("The client's active instruction text was not supplied.");
    if (!args.session_evidence_observed) notProven.push("Current-session actions and evidence were not supplied, so skipped useful use cannot be assessed.");
    return {
      client_name: args.client_name || "unknown",
      core_configured: coreConfigured,
      tools_configured: toolsConfigured,
      entrypoints_visible: { core: coreVisible, tools: toolsVisible },
      instructions_mention_vnem: instructionsMentionVnem,
      recent_session_usage: { core_used: usedCore, tools_used: usedTools, action_count: actions.length, evidence_count: evidence.length },
      task_classification: classification.primary,
      vnem_materially_useful: materiallyUseful,
      tools_materially_useful: toolsMateriallyUseful,
      skipped_materially_useful_vnem: skippedCore || skippedTools,
      skipped_surfaces: [skippedCore ? "core" : null, skippedTools ? "tools" : null].filter(Boolean),
      exact_corrective_action: correction,
      evidence_scope: "explicit local configuration and current-session data supplied by the caller only",
      hidden_telemetry_used: false,
      what_is_not_proven: notProven
    };
  }

  function usageCorrection(status) {
    if (!status.materiallyUseful) return { action: "none", instruction: "No VNEM call is needed for this trivial task." };
    if (status.coreConfigured === false) return { action: "configure_core", instruction: "Merge/import the generated VNEM profile so the `vnem` server is configured." };
    if (status.coreVisible === false) return { action: "reload_core", instruction: "Reload the client, confirm `vnem_entrypoint` is visible, then call it for the current task." };
    if (status.toolsMateriallyUseful && status.toolsConfigured === false) return { action: "configure_tools", instruction: "Merge/import the generated VNEM profile so the `vnem-tools` server is configured." };
    if (status.toolsMateriallyUseful && status.toolsVisible === false) return { action: "reload_tools", instruction: "Reload the client, confirm `vnem_tools_entrypoint` is visible, then call it for the current task." };
    if (status.instructionsMentionVnem === false) return { action: "merge_managed_instructions", instruction: "Merge the marked VNEM block from `.vnem/install-adoption/prompts/vnem-agent-use-instruction.md` without replacing unrelated instructions." };
    if (!status.sessionEvidenceObserved) return { action: "supply_session_evidence", instruction: "Provide explicit current-session actions/evidence before judging whether VNEM was skipped." };
    if (!status.usedCore) return { action: "call_core", tool: "vnem_entrypoint", arguments: { user_goal: status.userGoal, available_mcp_names: ["vnem", "vnem-tools"] } };
    if (status.toolsMateriallyUseful && !status.usedTools) return { action: "call_tools", tool: "vnem_tools_entrypoint", arguments: { user_goal: status.userGoal, root: ".", task_mode: "repo_inspection" } };
    return { action: "none", instruction: "Current explicit evidence shows appropriate VNEM use." };
  }

  function formatCoreUsageContract(contract) {
    return [
      "vnem_usage_contract",
      `core_role=${contract.core_role}`,
      `tools_role=${contract.tools_role}`,
      `core_executes_tools=${contract.core_executes_tools}`,
      `next=${contract.compact_next_step}`
    ].join("\n");
  }

  function formatCoreVisibilityDoctor(doctor) {
    return [
      `vnem_mcp_visibility_doctor: readiness=${doctor.adoption_readiness}`,
      `core_visible=${doctor.core_visible}; tools_visible=${doctor.tools_visible}`,
      `degraded_mode=${doctor.degraded_mode}`,
      `first_call=${doctor.recommended_first_call}`,
      `next=${doctor.next_step}`
    ].join("\n");
  }

  function formatCoreUnderuseDetector(detector) {
    return [
      `vnem_underuse_detector: should_have_used=${detector.should_have_used_vnem}`,
      `severity=${detector.severity}; task=${detector.task_classification}`,
      `missing=${detector.missing_vnem_calls.slice(0, 6).join(", ") || "none"}`,
      `next=${detector.recommended_recovery_call || "none"}`
    ].join("\n");
  }

  function formatUsageSelfCheck(audit) {
    return [
      `vnem_usage_self_check: skipped_use=${audit.skipped_materially_useful_vnem}`,
      `configured=core:${audit.core_configured},tools:${audit.tools_configured}; visible=core:${audit.entrypoints_visible.core},tools:${audit.entrypoints_visible.tools}`,
      `used=core:${audit.recent_session_usage.core_used},tools:${audit.recent_session_usage.tools}; instructions=${audit.instructions_mention_vnem}`,
      `correction=${audit.exact_corrective_action.action}; hidden_telemetry=false`
    ].join("\n");
  }

  return {
    buildCoreUnderuseDetector,
    buildCoreVisibilityDoctor,
    buildUsageSelfCheck,
    formatCoreUnderuseDetector,
    formatCoreUsageContract,
    formatCoreVisibilityDoctor,
    formatUsageSelfCheck
  };
}
