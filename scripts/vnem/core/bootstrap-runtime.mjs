export function createCoreBootstrapRuntime({
  createHash,
  getRequiredCapabilities,
  getAgentProfile,
  detectMissingContext,
  buildDomainQualityContracts,
  buildLibraryStatus,
  searchIndex,
  superLibrary,
  agentProfiles,
  entries,
  searchDocuments,
  relevantPracticeDocs,
  buildStatus,
  buildTaskContract,
  inferTaskMode,
  selectTaskRubrics,
  resolveIntent,
  normalize,
  uniqueStrings
}) {
  function buildBootstrap(args = {}) {
    const task = String(args.task || "").trim();
    const status = buildStatus();
    const intent = resolveIntent(task);
    const mode = inferTaskMode(task);
    const route = intent?.route || searchIndex.intent_routes?.[normalize(task)] || null;
    const rubrics = selectTaskRubrics(task, intent, mode);
    const readFirst = relevantPracticeDocs(task, intent, 8);
    const matches = searchDocuments(task, { limit: 10, includeWatchlist: false });
    const registryEntries = matches.filter((match) => match.kind === "registry-entry").slice(0, 5);
    const taskContract = buildTaskContract(task, intent, route, readFirst, registryEntries);
    const taskAnalysis = analyzeBootstrapTask(task, args.project_context || "", intent, mode, rubrics);
    const requiredRules = args.include_resources === false
      ? []
      : buildBootstrapRules(taskAnalysis, taskContract, rubrics, route, readFirst);
    const recommendedCalls = args.include_next_calls === false
      ? []
      : buildBootstrapNextCalls(taskAnalysis, Boolean(route), registryEntries.length);
    const protectionNeeds = buildBootstrapProtectionNeeds(taskAnalysis, args.risk_tolerance || "normal");
    const verificationContract = buildBootstrapVerificationContract(taskAnalysis, taskContract, args.available_tools || []);
    const completionAuditExpectations = buildBootstrapCompletionAuditExpectations(taskAnalysis);
    const antiPlaceboChecks = buildBootstrapAntiPlacebo(taskAnalysis);
    const agentProfile = getAgentProfile(agentProfiles, {
      agent_client: args.agent_client || "unknown",
      task,
      token_budget: "compact"
    });
    const requiredCapabilities = getRequiredCapabilities(superLibrary, agentProfiles, {
      task,
      agent_client: args.agent_client || "unknown",
      project_context: args.project_context || "",
      max_modules: 5,
      token_budget: "compact"
    });
    const missingContext = detectMissingContext({ task, project_context: args.project_context || "", token_budget: "compact" });
    const domainQualityContracts = buildDomainQualityContracts({ task, project_context: args.project_context || "", token_budget: "compact" });
    const activationId = createHash("sha256")
      .update(JSON.stringify({
        tool: "vnem_bootstrap",
        task: normalize(task),
        agent_client: normalize(args.agent_client || "unknown"),
        version: status.version,
        generated_at: status.generated_at || null
      }))
      .digest("hex")
      .slice(0, 16);

    return {
      activation: {
        status: "active",
        tool: "vnem_bootstrap",
        activation_id: `vnem-${activationId}`,
        data_version: status.generated_at || status.release_date || "unknown",
        vnem_version: status.version || null,
        agent_client: args.agent_client || "unknown",
        desired_output: args.desired_output || null,
        read_only: true,
        precision_tools_exposed: false,
        precision_server_boundary:
          "Default vnem MCP remains read-only. Mutation, terminal execution, documentation fetching, semantic code search, verification loops, and ephemeral scripts remain in the separate opt-in vnem-precision server."
      },
      repo_or_core_status: {
        root_dir: status.root_dir,
        registry_entry_count: status.counts.registry_entries,
        search_document_count: status.counts.search_documents,
        source_radar_count: status.counts.source_radar_entries,
        available_mcp_tool_count: status.mcp.tools.length,
        available_mcp_tools: status.mcp.tools,
        rule_resource_availability: {
          operating_protocol: status.counts.install_guide && Boolean(searchIndex.operating_protocol),
          quality_contract: status.counts.quality_contract,
          orchestration_protocol: status.counts.orchestration_protocol,
          coding_protocol: Boolean(searchIndex.coding_protocol),
          coding_playbooks: status.counts.coding_playbooks > 0,
          task_rubrics: status.counts.task_rubrics > 0,
          source_radar: status.counts.source_radar_entries > 0,
          prompt_patterns: status.counts.prompt_patterns > 0
        },
        warnings: bootstrapStatusWarnings(status)
      },
      task_analysis: taskAnalysis,
      compact_startup_contract: {
        token_budget: "compact",
        self_focus_policy: requiredCapabilities.self_focus_policy,
        required_capability_module_count: requiredCapabilities.required_modules.length,
        required_capability_ids: requiredCapabilities.required_modules.map((module) => module.id),
        compact_required_instructions: requiredCapabilities.required_modules.flatMap((module) => module.compact_instructions || []).slice(0, 6),
        evidence_required: verificationContract.evidence_required?.slice(0, 5) || []
      },
      relevant_agent_profile: {
        profile_id: agentProfile.profile_id,
        display_name: agentProfile.display_name,
        known_mcp_support_status: agentProfile.known_mcp_support_status,
        confidence: agentProfile.confidence
      },
      required_rules: requiredRules,
      recommended_vnem_calls: recommendedCalls,
      missing_context: missingContext,
      domain_quality_contracts: domainQualityContracts,
      capability_slots: buildBootstrapCapabilitySlots(),
      protection_needs: protectionNeeds,
      verification_contract: verificationContract,
      completion_audit_expectations: completionAuditExpectations,
      anti_placebo_checks: antiPlaceboChecks,
      matched_context: {
        resolved_intent: intent,
        mode,
        rubrics: rubrics.map((rubric) => ({ id: rubric.id, title: rubric.title })),
        route_available: Boolean(route),
        top_registry_matches: registryEntries.map((entry) => ({
          id: entry.id,
          name: entry.name,
          type: entry.type,
          trust_tier: entry.trust_tier,
          risk_flags: entry.risk_flags || []
        }))
      },
      safety:
        "vnem_bootstrap is read-only activation guidance. It does not edit files, run commands, install packages, call upstream services, collect secrets, or expose precision tools."
    };
  }

  function analyzeBootstrapTask(task, projectContext, intent, mode, rubrics) {
    const text = normalize([task, projectContext].filter(Boolean).join(" "));
    const secondary = new Set();
    const reasons = [];
    let primary = "general_project_improvement";
    let confidence = "medium";
    let riskLevel = "normal";

    const has = (pattern) => pattern.test(text);

    if (has(/\b(weather|api integration|integrate api|external api|rest api|graphql|cors|oauth|api key|apikey|token)\b/)) {
      primary = "api_integration";
      secondary.add("external_service_integration");
      secondary.add("security_data");
      riskLevel = "elevated";
      confidence = "high";
      reasons.push("The task names an API/integration surface, so VNEM routes to API safety, backend/frontend boundary, auth, CORS, and secret-handling checks.");
    } else if (has(/\b(elden ring|modding|mod workflow|game mod|mods?|load order|save file|regulation.bin|dlc|fromsoftware)\b/)) {
      primary = "game_modding_workflow";
      secondary.add("game_workflow");
      secondary.add("compatibility_testing");
      riskLevel = "elevated";
      confidence = "high";
      reasons.push("The task is a game/modding workflow, so VNEM routes to backup, isolation, compatibility, local test evidence, and no-claim-without-runtime-proof checks.");
    } else if (has(/\b(debug|broken|bug|failing|failure|error|stack trace|regression|crash|root cause)\b/)) {
      primary = "debugging";
      secondary.add("root_cause_analysis");
      secondary.add("test_evidence");
      confidence = "high";
      reasons.push("The task asks to debug/fix a broken project, so VNEM routes to reproduce-first, inspect logs/tests before edits, and root-cause proof.");
    } else if (has(/\b(prompt|system prompt|developer prompt|instructions|coding ai|agent prompt|prompt engineering)\b/)) {
      primary = "prompt_improvement";
      secondary.add("agent_instruction_design");
      secondary.add("evaluation_needed");
      confidence = "high";
      reasons.push("The task asks to improve a prompt/instructions, so VNEM routes to prompt-pattern guidance and before/after behavior evidence instead of assuming code edits.");
    } else if (has(/\b(next.js|nextjs|website|landing page|frontend|ui|ux|interface|responsive|accessibility|visual|design)\b/)) {
      primary = "website_ui";
      secondary.add("frontend_ui");
      secondary.add("visual_qa");
      secondary.add("accessibility_responsiveness");
      confidence = "high";
      reasons.push("The task targets a website/UI surface, so VNEM routes to design architecture, visual QA, responsiveness, accessibility, and screenshot/browser evidence.");
    } else if (has(/\b(private|internal|habit tracker|dashboard|app|tool|saas|web app|build|create|ship)\b/)) {
      primary = has(/\b(private|internal|habit tracker)\b/) ? "private_app_internal_tool" : "app_build";
      secondary.add("app_build");
      secondary.add("private_internal_tool");
      secondary.add("security_data");
      confidence = has(/\b(app|habit tracker|private|internal)\b/) ? "high" : "medium";
      riskLevel = has(/\b(private|auth|user data|database|login|account)\b/) ? "elevated" : "normal";
      reasons.push("The task is an app/internal-tool build, so VNEM routes to repo sensing, app architecture, data/privacy boundaries, tests, and user-visible completion evidence.");
    }

    if (has(/\b(next.js|nextjs|react|vite|frontend|ui|website|responsive|accessibility)\b/)) secondary.add("frontend_ui");
    if (has(/\b(auth|login|secret|api key|token|private|user data|database|payment|wallet)\b/)) secondary.add("security_data");
    if (has(/\b(test|tests|verify|verification|evidence|prove)\b/)) secondary.add("verification_heavy");
    if (has(/\b(research|compare|choose|tool|mcp|library|framework)\b/)) secondary.add("tool_or_research_decision");

    if (primary === "general_project_improvement" && intent?.name) {
      reasons.push(`VNEM matched existing intent '${intent.name}' from the search index.`);
    }
    if (!reasons.length) {
      reasons.push("VNEM did not find a highly specific domain trigger, so it routes to the general project-improvement contract and requires evidence before success claims.");
    }

    return {
      original_task: task,
      inferred_mode: mode,
      primary_task_type: primary,
      secondary_task_types: [...secondary],
      confidence,
      risk_level: riskLevel,
      resolved_intent: intent?.name || null,
      rubric_ids: rubrics.map((rubric) => rubric.id),
      why: reasons
    };
  }

  function buildBootstrapRules(taskAnalysis, taskContract, rubrics, route, readFirst) {
    const rules = new Map();
    const addRule = (id, resourceUri, summary, priority, why) => {
      rules.set(id, { id, resource_uri: resourceUri, summary, priority, why });
    };

    addRule("operating-protocol:vnem-operating-protocol", "vnem://install/operating-protocol", "Universal VNEM loop: sense, route, choose, constrain, quality gate, verify, report.", "mandatory", "Every bootstrap needs the core operating contract before an agent chooses tools or edits code.");
    addRule("quality-contract:vnem-quality-contract", "vnem://install/quality-contract", "Holistic quality contract and Triple-Check Workflow.", "mandatory", "The agent must not satisfy one requirement by silently damaging another.");
    addRule("task-rubrics:vnem-task-rubrics", "vnem://install/task-rubrics", "Broad task rubrics for quality bars, approvals, verification, and output contracts.", "mandatory", "Bootstrap uses task rubrics to make the route task-specific.");

    if (["app_build", "private_app_internal_tool", "website_ui", "api_integration", "debugging"].includes(taskAnalysis.primary_task_type) || taskAnalysis.secondary_task_types.includes("app_build")) {
      addRule("coding-protocol:vnem-coding-protocol", "vnem://install/coding-protocol", "Coding execution protocol: repo sensing, smallest coherent diff, verification ladder, final report.", "mandatory", "Code/app work needs implementation discipline and evidence.");
      addRule("coding-playbooks:vnem-coding-playbooks", "vnem://install/coding-playbooks", "Mode-specific playbooks for features, debugging, refactors, rendered apps, API/data work, reviews, and failure recovery.", "recommended", "The agent should choose a task-specific playbook after routing.");
    }

    if (taskAnalysis.primary_task_type === "website_ui" || taskAnalysis.secondary_task_types.includes("visual_qa")) {
      addRule("design-architecture:vnem-design-architecture", "vnem://install/design-architecture", "Design intelligence for UI, dashboard, visual polish, motion, sound, and branded surfaces.", "mandatory", "UI work needs actual rendered quality, not just passing builds.");
      addRule("visual-qa-protocol:vnem-visual-qa-protocol", "vnem://install/visual-qa-protocol", "Rendered visual QA loop for desktop/mobile screenshots and interaction moments.", "mandatory", "Website/UI tasks require visual evidence and accessibility/responsiveness checks.");
    }

    if (taskAnalysis.primary_task_type === "prompt_improvement") {
      addRule("prompt-engineering:vnem-prompt-engineering", "vnem://install/prompt-engineering", "Prompt enhancement protocol and agent-instruction guidance.", "mandatory", "Prompt work should improve expected behavior and include evaluation criteria.");
      addRule("prompt-patterns:vnem-prompt-patterns", "vnem://install/prompt-patterns", "Machine-readable prompt patterns for common agent tasks.", "recommended", "Reusable patterns help avoid vague instruction rewrites.");
    }

    if (taskAnalysis.primary_task_type === "api_integration" || taskAnalysis.secondary_task_types.includes("tool_or_research_decision")) {
      addRule("source-radar:vnem-source-radar", "vnem://install/source-radar", "Source intake map for official docs, registries, benchmark evidence, and verification sources.", "mandatory", "API/tool decisions need primary sources before implementation claims.");
    }

    if (taskAnalysis.primary_task_type === "game_modding_workflow") {
      addRule("source-radar:vnem-source-radar", "vnem://install/source-radar", "Source intake map for primary sources and verification evidence.", "mandatory", "Modding workflow changes need primary source/version evidence and local user test proof.");
      addRule("operating-protocol:approval-gates", "vnem://install/operating-protocol", "Approval gates for risky operations, external tools, secrets, and irreversible writes.", "mandatory", "Modding can damage saves/files; backups and explicit approval are required before mutation.");
    }

    for (const id of uniqueStrings([...(route?.read_first || []), ...(taskContract.read_first || []), ...readFirst.map((doc) => doc.id)]).slice(0, 8)) {
      if (!rules.has(id)) {
        rules.set(id, {
          id,
          resource_uri: resourceUriForRuleId(id),
          summary: "Matched VNEM search-index/read-first item for this task.",
          priority: "recommended",
          why: "This item matched the task route, rubric, playbook, or best-practice search."
        });
      }
    }

    return [...rules.values()];
  }

  function buildBootstrapNextCalls(taskAnalysis, routeAvailable, registryMatchCount) {
    const calls = [
      {
        tool: "vnem_library_status",
        arguments: {},
        when: "Use once after bootstrap when the task may need external skills, APIs, MCP/tool choices, or capability-library status."
      },
      {
        tool: "vnem_compose_capability_contract",
        arguments: { task: taskAnalysis.original_task, token_budget: "compact", max_modules: 5 },
        when: "Use after bootstrap to convert routing and capability matches into a compact task-specific contract with evidence requirements."
      },
      {
        tool: "vnem_get_required_capabilities",
        arguments: { task: taskAnalysis.original_task, max_modules: 5, token_budget: "compact" },
        when: "Use when the agent needs only the selected capability modules and compact instructions, not full search results."
      },
      {
        tool: "vnem_route_intent",
        arguments: { intent: taskAnalysis.original_task, include_matches: true },
        when: "Immediately after bootstrap when the agent needs the exact route/read-first context and rubric details."
      },
      {
        tool: "vnem_quality_gate",
        arguments: { task: taskAnalysis.original_task },
        when: "Before implementation and before final response to catch silent trade-offs and evidence gaps."
      },
      {
        tool: "vnem_protection_review",
        arguments: { task: taskAnalysis.original_task, plan_or_action: "<proposed risky action or plan>", target_type: "general", token_budget: "compact" },
        when: "Before risky actions such as filesystem, terminal, browser, GitHub, package install, skill use, MCP server, API integration, or game/modding changes."
      },
      {
        tool: "vnem_completion_audit",
        arguments: { task: taskAnalysis.original_task, claimed_result: "<final answer or work summary>", token_budget: "compact" },
        when: "Before final response to audit claims, evidence, missing context, research quality, UI/API/modding proof, and anti-placebo completion."
      },
      {
        tool: "vnem_proof_trail",
        arguments: { task: taskAnalysis.original_task, bootstrap_activation_id: "<activation_id>", capability_ids_used: ["<capability_id>"], token_budget: "compact" },
        when: "Near the end of the workflow, after protection review and completion audit, to produce a compact proof that VNEM was actually used."
      }
    ];

    if (taskAnalysis.primary_task_type !== "prompt_improvement" || registryMatchCount > 0 || routeAvailable) {
      calls.push({
        tool: "vnem_recommend",
        arguments: { task: taskAnalysis.original_task, limit: 6 },
        when: "Use when choosing tools, patterns, MCPs, libraries, workflows, or a compact task contract."
      });
    }

    if (["app_build", "private_app_internal_tool", "website_ui", "game_modding_workflow"].includes(taskAnalysis.primary_task_type)) {
      calls.push({
        tool: "vnem_orchestrate",
        arguments: { task: taskAnalysis.original_task, max_workers: 5 },
        when: "Use for complex app/UI/modding workflow work where single-agent context is likely too broad."
      });
    }

    if (["api_integration", "game_modding_workflow", "prompt_improvement"].includes(taskAnalysis.primary_task_type) || taskAnalysis.secondary_task_types.includes("tool_or_research_decision")) {
      calls.push({
        tool: "vnem_sources",
        arguments: { intent: taskAnalysis.original_task, limit: 6 },
        when: "Use before broad web search or external integration to identify official/high-signal sources and risk checks."
      });
    }

    if (["app_build", "private_app_internal_tool", "website_ui", "prompt_improvement"].includes(taskAnalysis.primary_task_type) && taskAnalysis.primary_task_type !== "game_modding_workflow") {
      calls.push({
        tool: "vnem_recommend_skills",
        arguments: { task: taskAnalysis.original_task, limit: 6 },
        when: "Use when the task may benefit from reusable AI-agent skills/capability packs; review before install/use."
      });
      calls.push({
        tool: "vnem_search_skills",
        arguments: { query: taskAnalysis.original_task, limit: 8 },
        when: "Use to inspect skill candidates, compatibility, risk flags, and provenance before any skill activation."
      });
    }

    if (taskAnalysis.primary_task_type === "api_integration" || taskAnalysis.secondary_task_types.includes("security_data")) {
      calls.push({
        tool: "vnem_build_api_integration_plan",
        arguments: { task: taskAnalysis.original_task, app_type: "unknown", allow_api_keys: false, allow_oauth: false, token_budget: "compact" },
        when: "Use to create the safe API integration contract: auth, HTTPS, CORS, frontend/backend boundary, tests, and evidence."
      });
      calls.push({
        tool: "vnem_recommend_apis",
        arguments: { task: taskAnalysis.original_task, app_type: "unknown", allow_api_keys: false, allow_oauth: false, limit: 6 },
        when: "Use for API/integration tasks to compare auth, HTTPS, CORS, frontend/backend safety, and secret risk."
      });
      calls.push({
        tool: "vnem_search_apis",
        arguments: { query: taskAnalysis.original_task, require_https: true, include_secret_risk: false, limit: 8 },
        when: "Use to inspect API candidates and avoid frontend-secret or CORS/HTTPS mistakes."
      });
      calls.push({
        tool: "vnem_review_skill_or_api",
        arguments: { id: "<candidate-id>", kind: "api", task: taskAnalysis.original_task },
        when: "Use before implementing any selected API or exposing it to frontend code."
      });
    }

    calls.push({
      tool: "vnem_best_practices",
      arguments: { intent: taskAnalysis.original_task, limit: 6 },
      when: "Use to fetch compact implementation, prompt, or workflow guidance after the route is known."
    });

    if (registryMatchCount > 0) {
      calls.push({
        tool: "vnem_search",
        arguments: { query: taskAnalysis.original_task, limit: 8 },
        when: "Use when the agent needs more registry/source matches before selecting a capability."
      });
    }

    return calls;
  }

  function buildBootstrapCapabilitySlots() {
    const status = buildLibraryStatus(superLibrary);
    return {
      mcp_registry_available: entries.some((entry) => entry.type === "mcp-server"),
      skill_recommendations_available: superLibrary.skills.length > 0,
      skill_entry_count: superLibrary.skills.length,
      api_registry_available: superLibrary.apis.length > 0,
      api_entry_count: superLibrary.apis.length,
      source_names: status.source_names,
      schema_version: status.schema_version,
      generated_at: status.generated_at,
      metadata_enrichment_boundary:
        "Super MCP library records are VNEM-normalized metadata/enrichment only; default MCP does not install skills, execute scripts, call APIs, request keys, or guarantee safety.",
      skill_recommendations_status:
        "Available as a read-only skills.sh/agent-skill capability-library foundation with provenance, compatibility, risk flags, and manual-review requirements.",
      api_registry_status:
        "Available as a read-only public-apis-style integration catalog enriched with auth, HTTPS, CORS, frontend/backend safety, secret-risk, and manual-review fields.",
      future_skill_fields_reserved: [
        "skill_name",
        "description",
        "source",
        "source_url",
        "supported_agents",
        "task_types",
        "install_use_instructions",
        "activation_instructions",
        "files_added",
        "trust_level",
        "audit_status",
        "risk_flags",
        "when_to_use",
        "when_not_to_use",
        "example_queries",
        "related_skills"
      ],
      future_api_fields_reserved: [
        "api_name",
        "description",
        "category",
        "docs_url",
        "auth_type",
        "https_support",
        "cors_support",
        "frontend_safe",
        "backend_proxy_required",
        "secret_api_key_risk",
        "rate_limit_notes",
        "integration_notes",
        "example_use_cases",
        "trust_level",
        "risk_flags",
        "freshness_last_checked"
      ]
    };
  }

  function buildBootstrapProtectionNeeds(taskAnalysis, riskTolerance) {
    const isApi = taskAnalysis.primary_task_type === "api_integration";
    const isApp = ["app_build", "private_app_internal_tool", "website_ui", "api_integration"].includes(taskAnalysis.primary_task_type) || taskAnalysis.secondary_task_types.includes("security_data");
    const isModding = taskAnalysis.primary_task_type === "game_modding_workflow";
    const isPrompt = taskAnalysis.primary_task_type === "prompt_improvement";
    const isDebug = taskAnalysis.primary_task_type === "debugging";
    const needsPackages = ["app_build", "private_app_internal_tool", "website_ui", "api_integration"].includes(taskAnalysis.primary_task_type);
    const needsExternalSources = isApi || isModding || taskAnalysis.secondary_task_types.includes("tool_or_research_decision");
    const humanApprovalRequirements = [
      "Ask before installing packages, changing dependency managers, editing agent/MCP/CI/deployment/database/auth/secret config, using credentials, or touching production/external systems."
    ];

    if (isPrompt) {
      humanApprovalRequirements.push("Do not edit code or repo files for prompt-improvement work unless the user explicitly asks for repo changes.");
    }
    if (isModding) {
      humanApprovalRequirements.push("Ask before modifying game/mod files, saves, load order, global mod manager config, or active user mod folders.");
    }

    return {
      risk_tolerance: riskTolerance,
      risk_level: taskAnalysis.risk_level,
      secret_api_key_risk: isApi || taskAnalysis.secondary_task_types.includes("security_data"),
      package_install_risk: needsPackages,
      external_source_risk: needsExternalSources,
      modding_compatibility_required: isModding,
      debugging_safety_required: isDebug,
      api_safety_warnings: isApi
        ? [
            "Do not expose API keys in frontend code.",
            "Check auth type, HTTPS, CORS behavior, rate limits, terms, and freshness before integration.",
            "Use a backend proxy/server route for secret-bearing APIs unless official docs prove frontend usage is safe.",
            "Handle errors, unavailable upstreams, quotas, and mocked/offline states honestly."
          ]
        : [],
      frontend_backend_safety_warnings: isApp
        ? [
            "Do not expose API keys in frontend code or committed config.",
            "Separate frontend UI from backend secret handling, auth, database, and external-service calls.",
            "For private/internal tools, review data storage, logs, auth, export/delete behavior, and local/production boundaries."
          ]
        : [],
      package_install_warnings: needsPackages
        ? [
            "Prefer existing dependencies and project patterns first.",
            "New packages require explicit user approval plus license, maintenance, install-script, and permission review."
          ]
        : [],
      external_source_warnings: needsExternalSources
        ? [
            "Prefer primary/official sources before blogs, forums, or generated summaries.",
            "Treat source signals as leads, not approval to install, execute, copy, or recommend as safe."
          ]
        : [],
      modding_safety_warnings: isModding
        ? [
            "Create backups of saves, active mod folders, regulation files, profiles, and load-order state before mutation.",
            "Isolate experiments from the user's active setup unless explicitly approved.",
            "Check game version, DLC/version constraints, co-op/anti-cheat implications, dependency/load-order compatibility, and rollback path.",
            "Do not pretend game behavior is verified without user/local game test evidence."
          ]
        : [],
      human_approval_requirements: humanApprovalRequirements
    };
  }

  function buildBootstrapVerificationContract(taskAnalysis, taskContract, availableTools) {
    const primary = taskAnalysis.primary_task_type;
    const visual = primary === "website_ui" || taskAnalysis.secondary_task_types.includes("visual_qa");
    const code = ["app_build", "private_app_internal_tool", "website_ui", "api_integration", "debugging"].includes(primary);
    const security = primary === "api_integration" || taskAnalysis.secondary_task_types.includes("security_data");
    const evidence = [
      "State the exact files changed or explain why no files were changed.",
      "Report exact commands/checks run with pass/fail results, not paraphrased success claims.",
      "Name skipped checks and remaining risks."
    ];
    const suggestedCommands = [];

    if (code) {
      evidence.push("Run the narrowest relevant test/check first, then broader tests/builds when blast radius justifies it.");
      suggestedCommands.push("project-specific test command", "project-specific build/typecheck/lint command");
    }
    if (primary === "debugging") {
      evidence.push("First reproduce the failure with logs/tests/console output before editing.");
      evidence.push("Identify the root cause and show the command/log that goes red before fix and green after fix when possible.");
    }
    if (visual) {
      evidence.push("Capture or inspect desktop visual evidence.");
      evidence.push("Capture or inspect mobile/responsive visual evidence.");
      evidence.push("Check keyboard/focus/contrast/reduced-motion or equivalent accessibility concerns when applicable.");
    }
    if (primary === "api_integration") {
      evidence.push("Prove API integration handles auth absence, errors, loading states, and quota/rate-limit style failures without leaking secrets.");
      evidence.push("Document whether the call belongs in frontend code or a backend/server route and why.");
    }
    if (primary === "game_modding_workflow") {
      evidence.push("Provide local game/modding test evidence or explicitly say user-local verification is still required.");
      evidence.push("Show backup/isolation/rollback instructions before any destructive modding step.");
    }
    if (primary === "prompt_improvement") {
      evidence.push("Provide before/after prompt text, intended behavior changes, and evaluation examples or acceptance criteria.");
    }

    return {
      suggested_commands: uniqueStrings(suggestedCommands),
      available_tools_seen: availableTools,
      evidence_required: uniqueStrings(evidence),
      ui_visual_evidence_required: visual,
      test_evidence_required: code,
      security_review_required: security,
      api_secret_review_required: primary === "api_integration",
      modding_local_verification_required: primary === "game_modding_workflow",
      prompt_eval_required: primary === "prompt_improvement",
      do_not_claim_done_without_evidence: true,
      inherited_vnem_verification: taskContract.verification || []
    };
  }

  function buildBootstrapCompletionAuditExpectations(taskAnalysis) {
    return {
      changed_files: "List all changed files, or state that the task was guidance-only/no-file-change.",
      commands_run: "List exact commands/checks/tests/builds/visual checks run with pass/fail status.",
      pass_fail_results: "Include real output summaries, failing commands, and residual blockers.",
      mcp_tools_used: "List vnem_bootstrap activation_id plus subsequent VNEM MCP tools/resources used.",
      rules_used: "Name required_rules actually applied; do not claim rules were used if they were only returned and ignored.",
      skipped_checks: "List checks not run and why.",
      remaining_risks: "Name unverified behavior, external-service uncertainty, safety/privacy issues, and manual review needs.",
      user_visible_final_summary: [
        "What changed or was recommended.",
        "Why it matches the VNEM route.",
        "What evidence proves it.",
        "What remains unverified or needs user approval."
      ],
      task_specific: taskAnalysis.primary_task_type
    };
  }

  function buildBootstrapAntiPlacebo(taskAnalysis) {
    const fake = [
      "Returning generic 'AI booster' advice without task-specific routing.",
      "Claiming safety, quality, or completion without tests, logs, screenshots, citations, or changed-file evidence.",
      "Adding dashboard wording, docs, or feature labels without callable behavior."
    ];
    const proof = [
      "An MCP client can list and call vnem_bootstrap and receive structuredContent with activation, task_analysis, rules, next calls, protection, verification, completion audit, and anti-placebo sections.",
      "The output changes for app, UI, API, debugging, modding, and prompt tasks.",
      "Default MCP tool annotations stay read-only and precision/mutation tools remain absent from the default server."
    ];
    const claims = [
      "Do not claim VNEM edited files, ran tests, installed tools, fetched live web data, scanned malware, or completed implementation from bootstrap alone.",
      "Do not claim a full skills.sh-style skill registry or public-apis-style API catalog exists until dedicated registries and tests exist."
    ];

    if (taskAnalysis.primary_task_type === "debugging") {
      fake.push("Changing code before reproducing the broken behavior and calling it debugged.");
      proof.push("A reproduced failure plus a green check after the root-cause fix.");
      claims.push("Do not claim root cause was fixed without a reproduction/evidence loop.");
    }
    if (taskAnalysis.primary_task_type === "website_ui") {
      fake.push("Passing a build while the UI remains visually broken, inaccessible, or unverified in a browser.");
      proof.push("Desktop/mobile visual evidence plus accessibility/responsiveness checks.");
    }
    if (taskAnalysis.primary_task_type === "api_integration") {
      fake.push("Hardcoding/mock weather data or exposing an API key in frontend code while calling it integrated.");
      proof.push("Secret-safe frontend/backend boundary, error handling, and real or honestly mocked API evidence.");
    }
    if (taskAnalysis.primary_task_type === "game_modding_workflow") {
      fake.push("Changing mod workflow docs or files without backup/isolation/compatibility notes and pretending in-game behavior was verified.");
      proof.push("Backup/rollback path plus user/local game/modding test evidence.");
    }
    if (taskAnalysis.primary_task_type === "prompt_improvement") {
      fake.push("Rephrasing a prompt with more confident wording but no behavior target or evaluation examples.");
      proof.push("Before/after prompt plus expected behavior and evaluation examples.");
    }

    return {
      how_this_task_could_be_faked: uniqueStrings(fake),
      evidence_that_proves_not_fake: uniqueStrings(proof),
      claims_not_to_make_without_proof: uniqueStrings(claims)
    };
  }

  function bootstrapStatusWarnings(status) {
    const warnings = [];
    if (!status.generated_at) warnings.push("Generated data timestamp is unavailable.");
    if (!status.counts.registry_entries) warnings.push("Registry entries were not loaded.");
    if (!status.counts.search_documents) warnings.push("Search documents were not loaded.");
    if (!status.counts.quality_contract) warnings.push("Quality contract was not loaded.");
    if (!status.counts.source_radar_entries) warnings.push("Source radar entries were not loaded.");
    return warnings;
  }

  function resourceUriForRuleId(id) {
    const text = String(id || "");
    if (text.includes("quality-contract")) return "vnem://install/quality-contract";
    if (text.includes("operating-protocol")) return "vnem://install/operating-protocol";
    if (text.includes("orchestration-protocol")) return "vnem://install/orchestration-protocol";
    if (text.includes("precision-execution-protocol")) return "vnem://install/precision-execution-protocol";
    if (text.includes("omniscient-self-healing-protocol")) return "vnem://install/omniscient-self-healing-protocol";
    if (text.includes("coding-playbook") || text.includes("coding-playbooks")) return "vnem://install/coding-playbooks";
    if (text.includes("coding-protocol")) return "vnem://install/coding-protocol";
    if (text.includes("task-rubric") || text.includes("task-rubrics")) return "vnem://install/task-rubrics";
    if (text.includes("design-architecture")) return "vnem://install/design-architecture";
    if (text.includes("visual-qa-protocol")) return "vnem://install/visual-qa-protocol";
    if (text.includes("source-radar")) return "vnem://install/source-radar";
    if (text.includes("prompt-engineering")) return "vnem://install/prompt-engineering";
    if (text.includes("prompt-pattern")) return "vnem://install/prompt-patterns";
    if (text.startsWith("entry:")) return `vnem://entries/${text.slice("entry:".length)}`;
    return "vnem://install/search-index";
  }

  function formatBootstrap(bootstrap) {
    const lines = [
      `vnem bootstrap: ${bootstrap.activation.status}`,
      `Activation: ${bootstrap.activation.activation_id}`,
      `Task type: ${bootstrap.task_analysis.primary_task_type} (${bootstrap.task_analysis.confidence} confidence, ${bootstrap.task_analysis.risk_level} risk)`,
      `Read-only: ${bootstrap.activation.read_only}; precision tools exposed: ${bootstrap.activation.precision_tools_exposed}`,
      "",
      "Why:",
      ...bootstrap.task_analysis.why.map((item) => `- ${item}`)
    ];
    if (bootstrap.required_rules.length) {
      lines.push("", "Required/recommended rules:");
      for (const rule of bootstrap.required_rules.slice(0, 8)) {
        lines.push(`- ${rule.priority}: ${rule.id} -> ${rule.resource_uri}`);
      }
    }
    if (bootstrap.recommended_vnem_calls.length) {
      lines.push("", "Next VNEM calls:");
      for (const call of bootstrap.recommended_vnem_calls) {
        lines.push(`- ${call.tool}: ${call.when}`);
      }
    }
    lines.push(
      "",
      `Capability slots: MCP registry ${bootstrap.capability_slots.mcp_registry_available ? "available" : "unavailable"}; dedicated skills ${bootstrap.capability_slots.skill_recommendations_available ? "available" : "reserved/future"}; API registry ${bootstrap.capability_slots.api_registry_available ? "available" : "reserved/future"}.`,
      `Verification: ${bootstrap.verification_contract.evidence_required.slice(0, 3).join("; ")}`,
      `Safety: ${bootstrap.safety}`
    );
    return lines.join("\n");
  }

  return {
    buildBootstrap,
    formatBootstrap
  };
}
