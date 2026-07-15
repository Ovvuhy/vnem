export function createCorePlanningDomains({
  createHash,
  path,
  tokenize,
  normalize,
  uniqueStrings
}) {
  const CORE_TASK_CATEGORIES = [
    "simple_stable_question",
    "simple_explanation",
    "prompt_improvement",
    "summarization_of_user_text",
    "local_debugging",
    "repo_modification",
    "ui_web_change",
    "ui_redesign",
    "current_research",
    "security_safety",
    "file_analysis",
    "high_stakes_advice",
    "public_facing_claim",
    "deployment_workflow",
    "coding/debugging",
    "UI/web/app improvement",
    "research/current information",
    "security/safety review",
    "compatibility investigation",
    "API/tool integration",
    "local project action",
    "dependency/package maintenance",
    "Git/GitHub workflow",
    "dashboard/control-surface work",
    "benchmark/evaluation",
    "documentation-only",
    "user troubleshooting"
  ];
  const MEMORY_SCOPE_TAGS = ["user-specific", "project-specific", "workspace-specific", "tool-specific", "mcp-client-specific", "os-specific", "shell-specific", "package-specific", "api-specific", "game-specific", "mod-specific", "domain-pattern", "universal-pattern", "temporary", "outdated", "unverified", "verified"];
  const EVIDENCE_LABELS = ["proven", "tested", "supported", "likely", "assumed", "unknown", "blocked", "failed", "not_attempted", "preparation_only"];

  function buildCoreRoutingRecord(args = {}) {
    const task = String(args.task || "").trim();
    const known = String(args.known_context || "").trim();
    const hay = normalize(`${task} ${known}`);
    const categories = inferCoreTaskCategories(task, known);
    const memory = classifyMemoryForTask(task, known, args.memory_items || []);
    const missing = buildMaterialMissingContext(task, known, categories);
    const anti = buildAntiStagnationCheck({ task, completed_areas: args.completed_areas || [], proposed_next_step: task, recent_actions: [] });
    const selection = selectToolsForTask({ task, known_context: known, available_tools: args.available_tools || [] });
    const toolsPermissionPlanning = buildCorePermissionProfilePlan(task, known, selection.selected_tools);
    const research = assessResearchNeed({ task, known_context: known });
    const effortBudget = buildEffortBudget({ user_goal: task, known_context: known, token_budget: args.token_budget || "normal" });
    const criticalQuestions = missing.filter((item) => item.ask_now);
    const needTools = categories.includes("documentation-only") && !/inspect|workspace|repo|local files|browser|source|security|fix|implement|debug|dashboard|git|package/.test(hay)
      ? false
      : (!categories.includes("documentation-only") || /inspect|workspace|repo|local|test|prove|browser|source|security|fix|implement|debug|dashboard|git|package/.test(hay));
    const compatRisks = inferCompatibilityRisks(task, known, categories, memory.relevant_memory_used);
    const safetyRisks = inferSafetyRisks(task, known, categories);
    const requiredEvidence = inferRequiredEvidence(categories, selection.selected_tools, research);
    const nextBestAction = anti.should_continue_same_area === false
      ? anti.recommended_next_action
      : criticalQuestions.length
        ? `Ask the minimum blocking question(s): ${criticalQuestions.map((q) => q.question).slice(0, 2).join(" | ")}`
        : needTools
          ? "Proceed with Core plan-only handoff, then use Tools MCP for targeted inspection/evidence with dry-run/approval where required."
          : "Proceed with compact answer using provided context; no extra question needed.";
    return {
      user_goal: task,
      task_categories: categories,
      relevant_memory_found: memory.relevant_memory_used.length > 0,
      relevant_memory_used: memory.relevant_memory_used,
      memory_ignored: memory.memory_ignored,
      memory_scope_tags_supported: MEMORY_SCOPE_TAGS,
      missing_context: missing,
      must_ask_user: criticalQuestions.length > 0,
      reason_for_asking_or_not_asking: criticalQuestions.length
        ? "Missing context materially affects correctness, compatibility, safety, or usefulness."
        : "No blocking missing context detected; safe defaults or Tools MCP inspection can cover remaining low-impact gaps.",
      needed_capabilities: selection.selected_tools,
      need_tools_mcp: needTools,
      effort_mode: effortBudget.effort_mode,
      task_type: effortBudget.task_type,
      clarification_question_needed: effortBudget.clarification_question_needed,
      clarification_question_reason: effortBudget.clarification_question_reason,
      question_count_limit: effortBudget.clarification_question_needed ? 1 : 0,
      assumption_allowed: !effortBudget.clarification_question_needed,
      assumption_must_be_labeled: true,
      need_current_research: Boolean(research.current_info_required || research.external_search_required || effortBudget.research_needed),
      tools_permission_planning: toolsPermissionPlanning,
      compatibility_risks: compatRisks,
      safety_risks: safetyRisks,
      required_evidence: requiredEvidence,
      next_best_action: nextBestAction,
      anti_stagnation: anti,
      must_not_claim: [
        "Core executed Tools MCP actions.",
        "Current/live research, files, tests, browser proof, or visual verification happened without evidence.",
        "Relevant memory was used if it was ignored as irrelevant, outdated, conflicting, or unverified.",
        "The task is done/compatible/safe without required evidence.",
        "Tools MCP actions were allowed by the active permission profile, approved, or executed without Tools permission/evidence output."
      ],
      core_executes_tools: false,
      core_plan_only: true
    };
  }

  function inferCoreTaskCategories(task, known = "") {
    const text = normalize(`${task} ${known}`);
    const out = new Set();
    const classified = classifyAdaptiveTaskType(task, known);
    if (classified) out.add(classified);
    if (classified === "ui_redesign" || classified === "ui_web_change") out.add("UI/web/app improvement");
    if (classified === "local_debugging") out.add("coding/debugging");
    if (classified === "repo_modification") out.add("local project action");
    if (classified === "current_research") out.add("research/current information");
    if (classified === "security_safety") out.add("security/safety review");
    if (classified === "deployment_workflow") out.add("Git/GitHub workflow");
    if (/debug|bug|failing|failure|error|stack trace|fix|implement|code|test|build|refactor/.test(text)) out.add("coding/debugging");
    if (/ui|ux|frontend|web app|website|browser|visual|responsive|accessibility|dashboard/.test(text)) out.add("UI/web/app improvement");
    if (/research|current|latest|today|news|source|citation|docs|compare|recommend|best|patch/.test(text)) out.add("research/current information");
    if (/security|safety review|safe\?|risk|malware|phishing|credential|secret|trust boundary|suspicious|login link/.test(text)) out.add("security/safety review");
    if (/compatib|version|os|shell|windows|linux|mac|node|npm|browser|mcp client|mod|loader|dependency/.test(text)) out.add("compatibility investigation");
    if (/api|tool integration|mcp|provider|webhook|oauth|sdk|plugin/.test(text)) out.add("API/tool integration");
    if (/local|workspace|repo|project|file|patch|edit|run|inspect|prove/.test(text)) out.add("local project action");
    if (/dependency|package|npm|pnpm|yarn|lockfile|audit|install|upgrade/.test(text)) out.add("dependency/package maintenance");
    if (/git|github|branch|commit|push|pull request|pr|ci|actions/.test(text)) out.add("Git/GitHub workflow");
    if (/dashboard|control surface|control-surface|telemetry|builder|ard/.test(text)) out.add("dashboard/control-surface work");
    if (/benchmark|eval|evaluation|measure|score|regression suite/.test(text)) out.add("benchmark/evaluation");
    if (/readme|docs?|documentation|explain|write a short|guide|instructions/.test(text) && !/implement|fix|code change|patch|dashboard ui|app feature/.test(text)) out.add("documentation-only");
    if (/troubleshoot|help me|user problem|support|setup|install issue|not working/.test(text)) out.add("user troubleshooting");
    if (!out.size) out.add("user troubleshooting");
    return CORE_TASK_CATEGORIES.filter((cat) => out.has(cat));
  }

  function classifyMemoryForTask(task, known, items) {
    const taskText = normalize(`${task} ${known}`);
    const taskTerms = new Set(tokenize(taskText));
    const relevant_memory_used = [];
    const memory_ignored = [];
    for (const raw of Array.isArray(items) ? items : []) {
      const item = typeof raw === "string" ? { content: raw } : (raw || {});
      const content = String(item.content || item.text || item.note || "");
      const scope_tags = uniqueStrings(routeArrayify(item.scope_tags || item.tags || item.scope).map((tag) => String(tag).trim()).filter(Boolean));
      const id = item.id || stableMemoryId(content);
      const memoryText = normalize(`${content} ${scope_tags.join(" ")}`);
      const outdated = scope_tags.includes("outdated") || /\boutdated\b|old draft|deprecated/.test(memoryText);
      const unverified = scope_tags.includes("unverified") || /\bunverified\b|guess|maybe/.test(memoryText);
      const verified = scope_tags.includes("verified") || /\bverified\b|real git checkout|passed|confirmed/.test(memoryText);
      const conflict = /conflict|contradict|wrong path|different workspace/.test(memoryText) && sharesAnyTerm(taskTerms, tokenize(memoryText));
      const relevance = memoryRelevanceScore(taskText, taskTerms, memoryText, scope_tags);
      const domainMismatch = scope_tags.some((tag) => /game-specific|mod-specific/.test(tag)) && !/elden ring|rng lands|mod|modding|game|build|loadout|dlc|pve|pvp/.test(taskText);
      const base = { id, content, scope_tags, relevance_score: relevance };
      if (domainMismatch) memory_ignored.push({ ...base, classification: "ignored", reason: "Game/mod-specific memory does not materially apply to this non-game task." });
      else if (outdated) memory_ignored.push({ ...base, classification: "outdated", reason: "Memory is tagged or detected as outdated for this task." });
      else if (conflict) memory_ignored.push({ ...base, classification: "conflicting", reason: "Memory conflicts with current task/context and needs fresh evidence before use." });
      else if (relevance >= 3 && !unverified) relevant_memory_used.push({ ...base, classification: "used", verification_status: verified ? "verified" : "unverified" });
      else if (relevance >= 3 && unverified) memory_ignored.push({ ...base, classification: "unverified", reason: "Potentially relevant but unverified; use only as a search/check hint, not as fact." });
      else memory_ignored.push({ ...base, classification: "ignored", reason: "No material relevance to the current task." });
    }
    return { relevant_memory_used, memory_ignored };
  }

  function memoryRelevanceScore(taskText, taskTerms, memoryText, tags) {
    let score = 0;
    for (const term of tokenize(memoryText)) if (taskTerms.has(term)) score += 1;
    if (/\bvnem\b/.test(taskText) && /\bvnem\b|vnem-src/.test(memoryText)) score += 4;
    if (/dashboard|ui|frontend/.test(taskText) && /dashboard|ui|frontend/.test(memoryText)) score += 3;
    if (/windows|powershell|bash|shell|cmd/.test(taskText) && tags.some((tag) => /os-specific|shell-specific/.test(tag))) score += 3;
    if (/api|oauth|cors|sdk/.test(taskText) && tags.some((tag) => /api-specific|tool-specific|package-specific/.test(tag))) score += 3;
    if (/elden ring|mod|game|build/.test(taskText) && tags.some((tag) => /game-specific|mod-specific/.test(tag))) score += 3;
    if (/workspace|repo|project|local/.test(taskText) && tags.some((tag) => /workspace-specific|project-specific/.test(tag))) score += 2;
    if (/security|safe|phishing|credential/.test(taskText) && /security|credential|phishing|secret|safe/.test(memoryText)) score += 3;
    return score;
  }

  function buildMaterialMissingContext(task, known, categories) {
    const text = normalize(`${task} ${known}`);
    const missing = [];
    const add = (id, question, reason, ask_now = true) => missing.push({ id, question, reason, ask_now });
    if (categories.includes("research/current information") && /elden ring|build|loadout|best|op|meta/.test(text)) {
      if (!/(pve|pvp|duel|invasion|arena)/.test(text)) add("game_mode", "Is this for PvE, PvP, co-op, or mixed play?", "Build recommendations change materially by mode.", true);
      if (/elden ring/.test(text) && !/(base game|dlc|shadow of the erdtree|sote)/.test(text)) add("dlc_ownership", "Should DLC/Shadow of the Erdtree items be included or base-game only?", "Availability and current build advice depend on DLC scope.", true);
    }
    if (categories.includes("coding/debugging") && /debug|bug|failing|failure|fix/.test(text) && (!/(error|log|stack trace|failing command|repro|test output|command output)/.test(text) || /no logs?|without logs?|no failing command|not supplied|missing/.test(text))) {
      add("debug_repro", "What exact error, log, failing command, or repro steps show the failure?", "Root-cause debugging needs a red-capable loop before fixes.", true);
    }
    if (categories.includes("local project action") && !/(repo path|workspace|project root|c:\/vnem|c:\\vnem|tools mcp can inspect|allowed root)/.test(text)) {
      add("workspace_scope", "Which workspace/project root should Tools MCP inspect?", "Workspace scope affects safe file reads and evidence.", false);
    }
    if (categories.includes("security/safety review")) {
      if (!/(https?:\/\/|file hash|sha256|attachment id|source artifact|url:\s*https?:\/\/)/.test(text)) add("security_artifact", "What exact link/file/source should be reviewed?", "Security/safety review needs the exact artifact/source boundary, not just a generic link description.", true);
      if (!/(stranger|trusted|official|own account|permission|authorized|phishing|credential|login)/.test(text)) add("trust_boundary", "Who provided it and what trust/account boundary applies?", "Trust boundary changes safe handling and what must not be clicked or entered.", true);
    }
    if (categories.includes("API/tool integration") && /\b(api|oauth|sdk|webhook|cors|api key|external service)\b/.test(text) && !/(auth|cors|https|server|backend|frontend|api key|oauth|docs)/.test(text)) {
      add("api_boundary", "What auth/CORS/HTTPS/frontend-backend boundary applies?", "API/tool integrations can expose secrets or fail in browsers without boundary evidence.", true);
    }
    return uniqueBy(missing, (item) => item.id);
  }

  function inferCompatibilityRisks(task, known, categories, usedMemory) {
    const text = normalize(`${task} ${known} ${JSON.stringify(usedMemory)}`);
    const risks = [];
    if (/windows|powershell|bash|cmd|shell/.test(text)) risks.push("OS/shell command syntax may differ; use the current host shell evidence before command handoff.");
    if (categories.includes("dependency/package maintenance")) risks.push("Package manager, lockfile, install scripts, and Node/npm versions affect compatibility.");
    if (categories.includes("UI/web/app improvement")) risks.push("Browser/runtime and localhost availability affect UI/browser proof.");
    if (/mcp client|claude|cursor|codex|hermes/.test(text)) risks.push("MCP client support and tool schema handling may differ by client.");
    if (/elden ring|mod|game/.test(text)) risks.push("Game version, DLC, mod loader, save safety, and file formats affect compatibility.");
    if (!risks.length) risks.push("No blocking compatibility risk detected yet; verify with task-appropriate evidence before final claims.");
    return uniqueStrings(risks);
  }

  function inferSafetyRisks(task, known, categories) {
    const text = normalize(`${task} ${known}`);
    const risks = [];
    if (/credential|secret|token|api key|login|auth/.test(text)) risks.push("Credential/auth boundary: do not collect, print, enter, or store secrets.");
    if (/phishing|malware|suspicious|download|installer|captcha|redirect/.test(text)) risks.push("Suspicious browser/source risk: do not bypass CAPTCHA, follow risky redirects, or run downloads/installers automatically.");
    if (/push|deploy|publish|delete|overwrite|global|install/.test(text)) risks.push("External/persistent side effects need explicit approval, evidence, and rollback plan.");
    if (categories.includes("local project action")) risks.push("Local project actions must be scoped to allowed roots, dry-run first for mutation, and evidence logged.");
    return uniqueStrings(risks.length ? risks : ["No high-risk action detected from the task text; Core remains plan-only."]);
  }

  function inferRequiredEvidence(categories, selectedTools, research) {
    const evidence = ["routing record with task categories, missing-context decision, risks, and must-not-claim limits"];
    if (categories.includes("coding/debugging")) evidence.push("failing command/log/repro first for debugging; targeted test/build output after changes");
    if (categories.includes("UI/web/app improvement")) evidence.push("browser/visual/localhost or honest browser_unavailable evidence plus accessibility/responsive state checks");
    if (categories.includes("research/current information") || research.current_info_required) evidence.push("current/official/provider-backed source evidence, source quality, claim/source matrix, and research gap list");
    if (categories.includes("security/safety review")) evidence.push("artifact/source boundary, URL/reputation/redirect/CAPTCHA/download risk classification, and safe handoff");
    if (categories.includes("compatibility investigation")) evidence.push("compatibility status label with exact evidence: tested/supported/likely/unknown/blocked");
    if (selectedTools.includes("vnem_tools_finish_session")) evidence.push("Tools session evidence pack before final done/safe/compatible claims");
    return uniqueStrings(evidence);
  }


  function classifyAdaptiveTaskType(task, known = "") {
    const text = normalize(`${task} ${known}`);
    if (/\b(deploy|deployment|release|publish|cloudflare|wrangler)\b/.test(text)) return "deployment_workflow";
    if (/\b(commit|push|pull request|pr|patch this repo|edit this repo|make code changes|repo changes|git\b|ci\b)\b/.test(text)) return "repo_modification";
    if (/\b(debug|stack trace|failing|failure|error log|root cause|crash|regression)\b/.test(text)) return "local_debugging";
    if (/\b(redesign|make.*look better|website.*better|landing page.*better|visual redesign|ui redesign)\b/.test(text)) return "ui_redesign";
    if (/\b(ui|ux|frontend|website|web app|browser proof|visual|responsive|accessibility|component|dashboard)\b/.test(text)) return "ui_web_change";
    if (/\b(current|latest|right now|today|policy|requirements|price|version|patch notes|refund|news)\b/.test(text)) return "current_research";
    if (/\b(security|safe to use|phishing|malware|suspicious|account|login link|credential|token|cookie|session|medical|legal|financial)\b/.test(text)) return "security_safety";
    if (/\b(file|log|source file|analyze this file|read this|attachment)\b/.test(text)) return "file_analysis";
    if (/\b(public-facing|public claim|announcement|press|production claim)\b/.test(text)) return "public_facing_claim";
    if (/\b(prompt|system prompt|instructions|improve this prompt)\b/.test(text)) return "prompt_improvement";
    if (/\b(summarize|summary|tldr|tl;dr)\b/.test(text) && /\b(pasted|provided|above|this text|user provided)\b/.test(text)) return "summarization_of_user_text";
    if (/\b(what does|what is|explain|meaning of|define|how do you say)\b/.test(text) && !/\b(current|latest|right now|policy|price|security|safe|file|repo|debug|website|redesign)\b/.test(text)) return "simple_stable_question";
    if (/\b(explain|how does|why does)\b/.test(text) && !/\b(current|latest|right now|security|file|repo|debug)\b/.test(text)) return "simple_explanation";
    if (/\b(doctor|law|medical|financial|tax|investment|legal)\b/.test(text)) return "high_stakes_advice";
    return null;
  }

  function effortModeForTaskType(type, text) {
    if (["repo_modification", "deployment_workflow", "public_facing_claim"].includes(type)) return "max_verification";
    if (["local_debugging", "ui_redesign", "ui_web_change", "security_safety", "file_analysis", "high_stakes_advice"].includes(type)) return "deep_proof";
    if (type === "current_research") return /security|safe|legal|medical|financial|download/.test(text) ? "deep_proof" : "standard";
    if (["prompt_improvement", "summarization_of_user_text"].includes(type)) return "quick_plan";
    if (["simple_stable_question", "simple_explanation"].includes(type)) return "instant_answer";
    return "standard";
  }

  function buildEffortBudget(args = {}) {
    const userGoal = String(args.user_goal || args.task || "").trim();
    const known = String(args.known_context || "").trim();
    const text = normalize(`${userGoal} ${known}`);
    const taskType = classifyAdaptiveTaskType(userGoal, known) || "standard";
    const mode = effortModeForTaskType(taskType, text);
    const researchNeeded = needsExternalResearchForAdaptive(taskType, text);
    const toolsNeeded = !["instant_answer", "quick_plan"].includes(mode) || ["ui_redesign", "ui_web_change", "local_debugging", "repo_modification", "security_safety", "file_analysis", "deployment_workflow"].includes(taskType);
    const recommendedTools = recommendedCoreToolsForEffort(taskType, mode, researchNeeded);
    const recommendedMcpTools = recommendedToolsMcpForEffort(taskType, mode, researchNeeded);
    const clarify = clarificationDecisionForTask(taskType, text, userGoal, known);
    const evidenceRequired = evidenceForEffort(taskType, mode, researchNeeded);
    const evidenceNotRequired = evidenceNotRequiredForEffort(taskType, mode);
    return {
      user_goal: userGoal,
      task_type: taskType,
      effort_mode: mode,
      reason_for_mode: reasonForEffortMode(taskType, mode, researchNeeded),
      speed_priority: ["instant_answer", "quick_plan"].includes(mode) ? "high" : mode === "standard" ? "medium" : "lower_than_truth_quality",
      quality_priority: ["deep_proof", "max_verification"].includes(mode) ? "very_high" : "quality_floor_enforced",
      truth_over_comfort_status: "enforced",
      no_sugarcoating_status: "enforced",
      uncertainty_must_be_labeled_status: "enforced",
      harsh_truth_quality_status: "enforced",
      research_decision: researchNeeded ? "research_or_source_verification_required" : "no_external_research_required_for_stable_or_user_provided_context",
      research_needed: researchNeeded,
      why_research_is_or_is_not_needed: researchReason(taskType, text, researchNeeded),
      tool_budget: { tools_needed: toolsNeeded, budget: toolBudgetForMode(mode), rule: toolsNeeded ? "Use only tools that materially improve truth, quality, safety, evidence, design, or result." : "Avoid Tools; direct answer is enough after Core classification." },
      token_budget_guidance: tokenBudgetGuidance(mode),
      evidence_required: evidenceRequired,
      evidence_not_required: evidenceNotRequired,
      recommended_core_tools: recommendedTools,
      recommended_tools_mcp_tools: recommendedMcpTools,
      tools_to_avoid: toolsToAvoidForEffort(mode, taskType),
      wasted_tool_risk: wastedToolRisk(mode, taskType),
      clarification_question_needed: clarify.needed,
      clarification_question_reason: clarify.reason,
      question_count_limit: clarify.needed ? 1 : 0,
      assumption_allowed: !clarify.needed,
      assumption_must_be_labeled: true,
      escalation_triggers: escalationTriggersForEffort(),
      answer_shape: answerShapeForMode(mode),
      must_not_claim: mustNotClaimForEffort(mode, taskType, researchNeeded),
      core_plan_only: true
    };
  }

  function buildFastAnswerContract(args = {}) {
    const task = String(args.task_summary || args.task || "").trim();
    const known = String(args.known_context || "").trim();
    const budget = buildEffortBudget({ user_goal: task, known_context: known, token_budget: args.token_budget || "compact" });
    const direct = ["instant_answer", "quick_plan"].includes(budget.effort_mode) && !budget.research_needed && !budget.clarification_question_needed;
    return {
      task_summary: task,
      should_answer_directly: direct,
      core_used_for_classification: true,
      max_sections: direct ? 1 : budget.effort_mode === "quick_plan" ? 3 : 5,
      max_bullets: direct ? 5 : budget.effort_mode === "quick_plan" ? 7 : 10,
      tools_needed: budget.tool_budget.tools_needed,
      research_needed: budget.research_needed,
      why_research_is_or_is_not_needed: budget.why_research_is_or_is_not_needed,
      ask_clarifying_question: budget.clarification_question_needed,
      clarification_question_required_reason: budget.clarification_question_reason,
      answer_first_rule: true,
      harsh_truth_rule: true,
      uncertainty_style: "Label unknown/assumed/current-source-needed plainly; do not comfort with false certainty.",
      forbidden_overhead: ["long audit report", "unnecessary tool plan", "generic safety boilerplate", "fake certainty", "pointless clarification", "proof section without proof"],
      escalation_triggers: budget.escalation_triggers,
      core_plan_only: true
    };
  }

  const DESIGN_TOTAL_IMPACT_AXES = [
    "visual beauty",
    "brand fit",
    "conversion/sales clarity",
    "usability",
    "content hierarchy",
    "typography",
    "spacing/layout",
    "mobile polish",
    "animation/interactivity",
    "originality",
    "performance/feel",
    "trust/accessibility basics",
    "overall user impact"
  ];

  function buildDesignAmbitionPlan(args = {}) {
    const userGoal = String(args.user_goal || "").trim();
    const site = String(args.referenced_site_or_product || "").trim();
    const known = String(args.known_context || "").trim();
    const explicitStyle = detectUserDesignStyle(`${args.user_requested_style || ""} ${userGoal}`);
    const text = normalize(`${userGoal} ${site} ${known}`);
    const business = inferBusinessDesignContext(text, site);
    const shouldAdapt = !explicitStyle;
    const direction = explicitStyle || business.defaultDirection;
    return {
      user_goal: userGoal,
      referenced_site_or_product: site || null,
      user_specified_style: Boolean(explicitStyle),
      should_adapt_to_existing_brand: shouldAdapt,
      inferred_brand_direction: explicitStyle ? `Follow explicit ${explicitStyle} direction while preserving conversion clarity.` : business.defaultDirection,
      audience_and_conversion_goal: business.audience,
      design_reference_needed: /website|site|landing|redesign|restaurant|pizza|delivery|unknown/.test(text),
      design_reference_plan: ["Inspect the original/reference when available.", `Compare against 2-3 comparable ${business.referenceClass} sites only when it materially improves direction.`, "Use references to beat the original, not to copy it."],
      force_user_to_choose_design_directions: false,
      visual_ambition_level: explicitStyle ? "high_user_directed" : "high_adaptive_brand_fit",
      design_quality_targets: ["first screen must have a strong opinion", "not a generic template", "visible hierarchy and conversion clarity", "better than original/reference, not merely different"],
      total_impact_required: true,
      total_impact_requirements: DESIGN_TOTAL_IMPACT_AXES.map((axis) => `Improve ${axis} without sacrificing the other redesign axes.`),
      avoid_one_axis_optimization: true,
      comparison_scorecard_required: true,
      before_after_evidence_required: true,
      before_after_evidence_requirements: ["desktop and mobile before/after screenshots or browser evidence", "original/reference vs new comparison across all total-impact axes", "label mixed/worse/not-proven honestly"],
      typography_targets: ["distinct type scale", "strong headline rhythm", "readable body copy", "brand-fit weight/spacing"],
      layout_targets: ["clear hero", "strong CTA path", "scannable sections", "mobile-first responsive composition"],
      animation_interaction_targets: ["purposeful microinteractions when useful", "no distracting motion", "respect reduced-motion", "animation supports the requested style if specified"],
      mobile_quality_targets: ["thumb-safe CTA", "no cramped hero", "fast menu/contact/conversion path", "desktop and mobile proof before claims"],
      content_hierarchy_targets: ["offer/value first", "proof/social/menu/features next", "CTA repeated at decision points", "avoid equal-weight card soup"],
      brand_personality_targets: explicitStyle ? [`user-specified ${explicitStyle}`, "do not dilute the requested tone"] : business.personality,
      what_original_site_does_poorly: ["unknown until inspected; do not copy weak original styling", "likely risks: weak hero, generic typography, poor CTA hierarchy, weak mobile polish"],
      how_new_design_must_be_better: ["stronger first impression", "clearer conversion path", "better typography/spacing", "better mobile layout", "browser/visual proof before visual claims"],
      directions_considered_internally: designDirectionsForBusiness(business, explicitStyle),
      selected_direction: direction,
      why_selected_direction: explicitStyle ? "The user specified this style, so it overrides the old brand unless it conflicts with safety/usability." : "No style was specified, so VNEM adapts to the business, audience, content, and conversion goal instead of forcing a preset style.",
      must_not_do: ["ask user to pick 3 design directions by default", "force premium/modern/minimal/fun/corporate by default", "copy weak original design choices", "ship a generic template", "ignore user-specified style", "claim visual improvement without visual/browser proof"],
      must_not_claim: ["visually better without screenshots/before-after proof", "brand fit without inspecting/adapting to business/audience", "responsive without multiple viewport evidence", "accessibility improved without audit evidence"],
      core_plan_only: true
    };
  }

  function buildVisualTasteAudit(args = {}) {
    const goal = String(args.user_goal || "");
    const summary = String(args.design_summary || "");
    const userStyle = String(args.user_requested_style || "");
    const evidence = [...routeArrayify(args.evidence), ...routeArrayify(args.screenshots_or_visual_evidence)];
    const beforeAfter = routeArrayify(args.before_after_evidence);
    const text = normalize(`${goal} ${summary} ${userStyle} ${evidence.join(" ")}`);
    const generic = /generic|template|plain cards|blue button|corporate|minimal homepage|stock|card grid|centered hero/.test(text);
    const weakVisual = /weak|boring|plain|bad spacing|poor hierarchy|no brand|no animation|no mobile|muted blue/.test(text) || generic;
    const requested = detectUserDesignStyle(userStyle || goal);
    const requestedWords = requested ? normalize(requested).split(" ").filter(Boolean) : [];
    const summaryNorm = normalize(summary);
    const styleMismatch = Boolean(requested && requestedWords.length && !requestedWords.every((word) => summaryNorm.includes(word)) && !summaryNorm.includes(requestedWords[0]));
    const missingVisualProof = !hasVisualEvidence(evidence);
    const missingBeforeAfter = /better|improved|redesign|original|reference/.test(text) && !beforeAfter.length && !/before.*after|after.*before|comparison/.test(text);
    const oneAxis = detectOneAxisOptimization(text);
    const inflated = detectInflatedDesignScore(text, evidence, beforeAfter);
    const actuallyBetterRisk = /better|improved|redesign|original|reference|new version/.test(text) && (missingVisualProof || missingBeforeAfter || oneAxis || /unknown|not evidenced|uncertain|worse|mixed/.test(text));
    const issues = [];
    if (generic) issues.push("generic/template-like look; not enough brand-specific taste");
    if (/hero/.test(text) || generic) issues.push("hero/CTA/hierarchy needs stronger visual direction");
    if (/typography|plain|generic|boring/.test(text)) issues.push("typography/spacing/hierarchy are weak or unproven");
    if (/mobile|responsive|redesign|website/.test(text) && !/mobile screenshot|viewport|390|responsive evidence/.test(text)) issues.push("mobile polish is missing or unproven");
    if (styleMismatch) issues.push(`design ignores user-specified style: ${requested}`);
    if (inflated) issues.push("inflated_design_score: design score appears too high for the evidence supplied");
    if (oneAxis) issues.push("one_axis_design_optimization: design optimizes one visible axis while total impact is unknown or weak");
    if (actuallyBetterRisk) issues.push("actually_better_than_original_risk: new design may be mixed, worse, or not proven better than original/reference");
    if (missingVisualProof) issues.push("missing visual/browser proof");
    if (missingBeforeAfter) issues.push("missing before/after comparison for better-than-original claim");
    const scorePenalty = (generic ? 25 : 0) + (weakVisual ? 15 : 0) + (styleMismatch ? 25 : 0) + (missingVisualProof ? 20 : 0) + (missingBeforeAfter ? 10 : 0) + (inflated ? 12 : 0) + (oneAxis ? 16 : 0);
    const visualScore = Math.max(0, 90 - scorePenalty);
    return {
      verdict: issues.length ? (missingVisualProof || styleMismatch || inflated || actuallyBetterRisk ? "blocked" : "revise") : "pass_with_evidence",
      visual_quality_score: visualScore,
      brand_fit_score: styleMismatch ? 35 : generic ? 50 : 80,
      ambition_score: generic ? 35 : weakVisual ? 55 : 82,
      usability_score: /unclear|cramped|bad|weak.*usability|usability.*unknown/.test(text) ? 45 : 75,
      mobile_score: /mobile screenshot|viewport|responsive evidence|390/.test(text) ? 80 : 45,
      animation_interaction_score: /animation|motion|interaction|microinteraction/.test(text) && !/no animation/.test(text) ? 75 : 45,
      originality_score: generic ? 30 : 72,
      conversion_clarity_score: /cta|conversion|order|book|buy|contact/.test(text) && !/unclear ordering|weak.*cta/.test(text) ? 75 : 50,
      total_impact_axes: DESIGN_TOTAL_IMPACT_AXES,
      inflated_design_score: inflated,
      one_axis_design_optimization: oneAxis,
      actually_better_than_original_risk: actuallyBetterRisk,
      boring_or_generic_risk: generic || weakVisual ? "high" : "medium",
      template_like_risk: generic ? "high" : "medium",
      over_safe_design_risk: generic || /corporate|muted|minimal/.test(text) ? "high" : "medium",
      mismatch_with_user_requested_style: styleMismatch,
      mismatch_with_business_brand: /restaurant|pizza|delivery/.test(text) && /corporate|saas|generic/.test(text),
      missing_visual_proof: missingVisualProof,
      missing_before_after_comparison: missingBeforeAfter,
      strongest_visual_issues: uniqueStrings(issues),
      highest_value_improvements: ["make the hero/CTA unmistakably stronger", "tighten typography, spacing, and visual hierarchy", "add brand-specific imagery/color/motion choices", "prove desktop/mobile before-after with browser evidence", "score the redesign across all total-impact axes"],
      safe_to_claim: !issues.length,
      must_not_claim: ["visually better without screenshots", "better than original/reference without before/after comparison", "95/100 or superior design scores without evidence-based scorecard", "brand-fit design while style/business mismatch remains", "mobile polish without viewport evidence"]
    };
  }

  function hasVisualEvidence(items = []) {
    return routeArrayify(items).some((item) => /screenshot|browser|visual|viewport|image|dom|browser_was_run/i.test(String(item)));
  }

  function hasBeforeAfterEvidence(items = []) {
    return routeArrayify(items).some((item) => /before.?after|after.?before|comparison|compare|diff/i.test(String(item)));
  }

  function detectInflatedDesignScore(text, evidence = [], beforeAfter = []) {
    const scores = [...String(text).matchAll(/\b(9[0-9]|100)\s*(?:\/\s*100|%|score)?\b/g)].map((m) => Number(m[1]));
    const highScore = scores.some((score) => score >= 90) || /perfect|dramatically better|clearly better|best[- ]in[- ]class|10\/10/.test(text);
    return Boolean(highScore && (!hasVisualEvidence(evidence) || !hasBeforeAfterEvidence(beforeAfter)));
  }

  function detectOneAxisOptimization(text) {
    const visualOnly = /(only|just|because).*\b(hero|beautiful|pretty|visual|photo|animation|motion|minimal|dark|premium)\b|\b(hero|beautiful|pretty|visual|photo|animation|motion)\b.*\bonly\b/.test(text);
    const missingImpact = /(conversion|usability|mobile|content|hierarchy|trust|accessibility|performance|cta).*\b(unknown|not evidenced|uncertain|weak|missing|unclear)\b|\bunknown\b.*(conversion|usability|mobile|content|trust|performance)/.test(text);
    return Boolean(visualOnly || missingImpact || (/beautiful|prettier|cinematic|animated/.test(text) && /unclear|weak|unknown|not evidenced/.test(text)));
  }

  function axisScoreForSummary(summary, axis, side) {
    const text = normalize(summary);
    let score = side === "new" ? 62 : 58;
    const positive = {
      "visual beauty": /beautiful|polished|strong visual|photography|cinematic|premium|distinct|warm/.test(text),
      "brand fit": /brand|brand-fit|restaurant|pizza|local|warm|food|portfolio|editorial|user-specified/.test(text) && !/generic|saas|corporate/.test(text),
      "conversion/sales clarity": /cta|order|buy|book|pricing|phone|contact|conversion|sales|above fold/.test(text) && !/unclear|weak/.test(text),
      usability: /usable|navigation|clear|simple|menu|flow|thumb|readable/.test(text) && !/confusing|unclear/.test(text),
      "content hierarchy": /hierarchy|menu|offer|value|section|scannable|above fold/.test(text),
      typography: /typography|type scale|headline|readable|font/.test(text),
      "spacing/layout": /spacing|layout|rhythm|grid|composition|fast-feeling/.test(text),
      "mobile polish": /mobile|responsive|viewport|thumb|call button/.test(text),
      "animation/interactivity": /animation|motion|interaction|microinteraction|hover|restrained/.test(text),
      originality: /original|distinct|opinionated|brutalist|editorial|cinematic/.test(text) && !/generic|template/.test(text),
      "performance/feel": /fast|lightweight|performance|fast-feeling|snappy|restrained/.test(text) && !/heavy/.test(text),
      "trust/accessibility basics": /trust|accessibility|a11y|contrast|phone|address|reviews|proof|accessible/.test(text),
      "overall user impact": /impact|better|clear|conversion|usable|orders|sales|user/.test(text) && !/unknown|not evidenced/.test(text)
    };
    const negative = {
      "visual beauty": /ugly|plain|boring|weak visual/.test(text),
      "brand fit": /generic|saas|corporate|no brand|low.*personality/.test(text),
      "conversion/sales clarity": /weak.*cta|unclear.*cta|unclear ordering|missing.*order|menu.*not|phone.*not/.test(text),
      usability: /confusing|unclear|cramped|uncertain mobile|weak.*usability/.test(text),
      "content hierarchy": /clutter|equal-weight|unclear|menu.*not|content.*unknown/.test(text),
      typography: /plain|generic typography|weak typography/.test(text),
      "spacing/layout": /cramped|bad spacing|layout.*unknown|heavy/.test(text),
      "mobile polish": /no mobile|mobile.*unknown|uncertain mobile|not evidenced/.test(text),
      "animation/interactivity": /no animation|distracting|heavy/.test(text),
      originality: /generic|template|stock|cards/.test(text),
      "performance/feel": /heavy|slow|bloated/.test(text),
      "trust/accessibility basics": /trust.*unknown|accessibility.*unknown|contrast.*unknown|not evidenced/.test(text),
      "overall user impact": /unknown|not evidenced|mixed|worse|uncertain|weak/.test(text)
    };
    if (positive[axis]) score += 18;
    if (negative[axis]) score -= 20;
    if (text.includes("unknown") || text.includes("not evidenced")) score -= 6;
    return clampDesignScore(score, 20, 88);
  }

  function averageScore(rows, key) {
    return Math.round(rows.reduce((sum, row) => sum + Number(row[key] || 0), 0) / Math.max(1, rows.length));
  }

  function clampDesignScore(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function buildRedesignComparisonScorecard(args = {}) {
    const userGoal = String(args.user_goal || "");
    const original = String(args.original_summary || "");
    const next = String(args.new_design_summary || "");
    const claimed = String(args.claimed_result || "");
    const evidence = routeArrayify(args.evidence);
    const visuals = routeArrayify(args.screenshots_or_visual_evidence);
    const beforeAfter = routeArrayify(args.before_after_evidence);
    const allEvidence = [...evidence, ...visuals];
    const combined = normalize(`${userGoal} ${original} ${next} ${claimed} ${allEvidence.join(" ")} ${beforeAfter.join(" ")}`);
    const visualProof = hasVisualEvidence(visuals) || hasVisualEvidence(evidence);
    const beforeAfterPresent = hasBeforeAfterEvidence(beforeAfter) || hasBeforeAfterEvidence(evidence);
    const axis_scores = DESIGN_TOTAL_IMPACT_AXES.map((axis) => {
      const originalScore = axisScoreForSummary(original, axis, "original");
      let newScore = axisScoreForSummary(next, axis, "new");
      if (!visualProof && ["visual beauty", "spacing/layout", "mobile polish", "animation/interactivity"].includes(axis)) newScore = Math.min(newScore, 62);
      if (!beforeAfterPresent && axis === "overall user impact") newScore = Math.min(newScore, 58);
      return { axis, original_score: originalScore, new_score: newScore, delta: newScore - originalScore, evidence_status: visualProof || !/visual|mobile|spacing|animation/.test(axis) ? "supported_or_plannable" : "not_proven_without_visual_evidence" };
    });
    const originalTotal = averageScore(axis_scores, "original_score");
    const newTotal = averageScore(axis_scores, "new_score");
    const oneAxis = detectOneAxisOptimization(combined);
    const claimedOriginal = Number.isFinite(args.claimed_original_score) ? args.claimed_original_score : null;
    const claimedNew = Number.isFinite(args.claimed_new_score) ? args.claimed_new_score : null;
    const inflated = (claimedNew !== null && claimedNew >= 90 && (!visualProof || !beforeAfterPresent)) || detectInflatedDesignScore(`${claimed} ${next}`, allEvidence, beforeAfter);
    const unsupportedScore = (claimedOriginal !== null || claimedNew !== null || /\b\d{2,3}\s*\/\s*100\b|versus original|vs original/.test(combined)) && (!beforeAfterPresent || !visualProof);
    const betterClaim = /better|improved|superior|success|dramatically|clearly/.test(combined);
    const worseOrMixedRisk = oneAxis || /weak|unclear|unknown|not evidenced|missing|mixed|worse|heavy/.test(normalize(next));
    const verdict = !visualProof || !beforeAfterPresent ? "not_proven" : worseOrMixedRisk ? "mixed" : newTotal > originalTotal + 4 ? "better_with_evidence" : "mixed";
    return {
      user_goal: userGoal,
      evaluation_axes: DESIGN_TOTAL_IMPACT_AXES,
      equal_axis_weighting: true,
      axis_scores,
      original_total_impact_score: originalTotal,
      new_total_impact_score: newTotal,
      total_impact_delta: newTotal - originalTotal,
      claimed_original_score: claimedOriginal,
      claimed_new_score: claimedNew,
      realistic_score_policy: "conservative_evidence_based_scores_no_visual_superiority_without_browser_or_screenshot_evidence",
      visual_superiority_proven: Boolean(visualProof && beforeAfterPresent),
      before_after_comparison_present: beforeAfterPresent,
      comparison_scorecard_required: true,
      total_impact_required: true,
      avoid_one_axis_optimization: true,
      one_axis_design_optimization: oneAxis,
      inflated_design_score: inflated,
      unsupported_original_vs_new_score: unsupportedScore,
      user_might_rate_new_lower_risk: Boolean(!visualProof || !beforeAfterPresent || worseOrMixedRisk || newTotal <= originalTotal + 4),
      redesign_verdict: verdict,
      safe_to_claim_better_than_original: verdict === "better_with_evidence",
      strongest_risks: uniqueStrings([
        inflated ? "inflated_design_score" : null,
        unsupportedScore ? "unsupported_original_vs_new_score" : null,
        oneAxis ? "one_axis_design_optimization" : null,
        !visualProof ? "claimed_better_without_visual_evidence" : null,
        !beforeAfterPresent ? "claimed_better_without_before_after" : null,
        worseOrMixedRisk && betterClaim ? "new_design_worse_or_mixed_but_claimed_success" : null
      ].filter(Boolean)),
      must_not_claim: uniqueStrings([
        !visualProof ? "visual superiority or visually better than original without screenshots/browser evidence" : null,
        !beforeAfterPresent ? "better than original/reference without before/after comparison" : null,
        unsupportedScore ? "original-vs-new numeric score without evidence-backed scorecard" : null,
        worseOrMixedRisk ? "success if new design is mixed, worse, or could realistically be rated lower" : null
      ].filter(Boolean)),
      core_plan_only: true
    };
  }

  function buildTotalImpactDesignPlan(args = {}) {
    const goal = String(args.user_goal || "");
    const site = String(args.referenced_site_or_product || "");
    const businessGoal = String(args.business_goal || args.known_context || "");
    return {
      user_goal: goal,
      referenced_site_or_product: site || null,
      business_goal: businessGoal || "infer from business/audience/reference before scoring",
      total_impact_required: true,
      avoid_one_axis_optimization: true,
      comparison_scorecard_required: true,
      before_after_evidence_required: true,
      equal_mix_axes: DESIGN_TOTAL_IMPACT_AXES,
      total_impact_requirements: DESIGN_TOTAL_IMPACT_AXES.map((axis) => `${axis}: improve or preserve this axis; do not sacrifice it for one prettier surface.`),
      planning_sequence: ["inspect original/reference and business goal", "select direction by total impact", "design across all equal axes", "capture desktop/mobile before-after evidence", "score conservatively and label mixed/worse/not-proven when appropriate"],
      evidence_requirements: ["screenshots/browser visual evidence", "desktop and mobile before/after comparison", "CTA/content hierarchy proof", "accessibility/trust basics check", "performance/feel check or caveat", "comparison scorecard across all axes"],
      must_not_do: ["optimize only visual beauty, animation, minimalism, or novelty", "claim better when merely different", "use unsupported score inflation", "hide caveats in compact output", "claim visual superiority without screenshots/browser evidence"],
      must_not_claim: ["better than original without before/after evidence", "total-impact win if conversion/usability/mobile/trust are unknown", "95/100 design score without evidence"],
      core_plan_only: true
    };
  }

  function normalizeDirection(raw, index) {
    if (typeof raw === "string") return { name: raw, summary: raw, index };
    return { name: String(raw?.name || raw?.title || `direction_${index + 1}`), summary: String(raw?.summary || raw?.description || raw?.rationale || raw?.name || ""), index };
  }

  function scoreDesignDirection(direction, userGoal, explicitStyle) {
    const text = normalize(`${direction.name} ${direction.summary} ${userGoal}`);
    let score = 50;
    if (explicitStyle && text.includes(normalize(explicitStyle).split(" ")[0])) score += 18;
    for (const axis of DESIGN_TOTAL_IMPACT_AXES) score += axisScoreForSummary(text, axis, "new") >= 70 ? 2 : -1;
    if (detectOneAxisOptimization(text)) score -= 25;
    if (/generic|template|saas cards|corporate/.test(text)) score -= 18;
    if (/cta|order|conversion|menu|phone|mobile|trust|accessible|fast/.test(text)) score += 14;
    return clampDesignScore(score, 0, 100);
  }

  function buildDesignDirectionSelector(args = {}) {
    const goal = String(args.user_goal || "");
    const explicit = detectUserDesignStyle(`${args.user_requested_style || ""} ${goal}`);
    const candidates = routeArrayify(args.candidate_directions).map(normalizeDirection);
    const fallback = candidates.length ? candidates : designDirectionsForBusiness(inferBusinessDesignContext(normalize(`${goal} ${args.referenced_site_or_product || ""}`), args.referenced_site_or_product || ""), explicit).map((name, index) => ({ name, summary: name, index }));
    const scored = fallback.map((direction) => ({ ...direction, total_impact_score: scoreDesignDirection(direction, goal, explicit), one_axis_design_optimization: detectOneAxisOptimization(normalize(`${direction.name} ${direction.summary}`)) }));
    scored.sort((a, b) => b.total_impact_score - a.total_impact_score || a.index - b.index);
    const selected = scored[0];
    return {
      user_goal: goal,
      selection_basis: "total_impact_not_one_axis",
      avoid_one_axis_optimization: true,
      total_impact_axes: DESIGN_TOTAL_IMPACT_AXES,
      selected_direction: selected,
      why_selected: explicit ? "Selected direction best preserves the user-specified style while maintaining total-impact basics." : "Selected direction has the strongest total-impact balance, not just the prettiest single axis.",
      rejected_directions: scored.slice(1).map((item) => ({ name: item.name, total_impact_score: item.total_impact_score, reason: item.one_axis_design_optimization ? "rejected for one-axis optimization risk: visual/novelty without enough conversion, usability, brand, mobile, trust, or performance impact" : /generic|corporate|saas/i.test(`${item.name} ${item.summary}`) ? "rejected as generic/weak brand fit" : "lower total-impact score" })),
      required_next_evidence: ["before/after screenshots", "mobile viewport evidence", "redesign comparison scorecard", "accessibility/trust basics check", "claim caveats if mixed or not proven"],
      must_not_claim: ["selected direction is better until implemented and proven with before/after evidence", "visual-only direction is best if total impact is weaker"],
      core_plan_only: true
    };
  }

  function buildCompactOutputContract(args = {}) {
    const task = String(args.task || "");
    const out = String(args.output_text || "");
    const caveats = routeArrayify(args.material_caveats);
    const proof = routeArrayify(args.needed_proof);
    const evidence = routeArrayify(args.evidence_available);
    const text = normalize(`${task} ${out}`);
    const risky = /current|latest|ui|redesign|debug|security|safe|repo|file|commit|push|deploy|browser|visual|proof|ci|test/.test(text);
    const vague = !out.trim() || /^(done|fixed|complete|looks good|success)[.!\s]*(it works|looks better)?$/i.test(out.trim()) || (/\bdone\b|\blooks (good|great|better)\b/.test(normalize(out)) && !/(tested|proven|blocked|unknown|caveat|sha|screenshot|command|evidence|assum)/.test(normalize(out)));
    const hidCaveat = caveats.length > 0 && !caveats.some((item) => normalize(out).includes(normalize(item).slice(0, 18))) && !/(caveat|blocked|unknown|pending|not captured|not verified|not proven)/.test(normalize(out));
    const removedProof = proof.length > 0 && evidence.length === 0 && !/(test|screenshot|sha|ci|source|evidence|proof|command|browser|before|after)/.test(normalize(out));
    return {
      compact_by_default: true,
      compact_does_not_mean_vague: true,
      compact_does_not_remove_material_caveats: true,
      compact_does_not_remove_needed_proof: true,
      expand_for_risky_current_ui_debug_security_repo_file_tasks: risky,
      compact_output_too_vague: vague,
      compact_output_hid_material_caveat: hidCaveat,
      compact_output_removed_needed_proof: removedProof,
      recommended_length: risky ? "compact_with_required_evidence" : "short",
      required_output_shape: risky ? ["Result", "What changed", "Tests/proof", "Caveats/unknowns", "Next best task"] : ["Result", "Assumption/caveat if any"],
      material_caveats_required: caveats,
      needed_proof_required: proof,
      audit_flags: uniqueStrings([vague ? "compact_output_too_vague" : null, hidCaveat ? "compact_output_hid_material_caveat" : null, removedProof ? "compact_output_removed_needed_proof" : null].filter(Boolean)),
      core_plan_only: true
    };
  }

  function formatRedesignComparisonScorecard(s) { return [`vnem_redesign_comparison_scorecard: ${s.redesign_verdict}`, `original=${s.original_total_impact_score}`, `new=${s.new_total_impact_score}`, `visual_proven=${s.visual_superiority_proven}`].join("\n"); }
  function formatTotalImpactDesignPlan(p) { return [`vnem_total_impact_design_plan: total_impact_required=${p.total_impact_required}`, `axes=${p.equal_mix_axes.length}`, `scorecard_required=${p.comparison_scorecard_required}`].join("\n"); }
  function formatDesignDirectionSelector(s) { return [`vnem_design_direction_selector: ${s.selected_direction?.name || "none"}`, `basis=${s.selection_basis}`, `score=${s.selected_direction?.total_impact_score ?? "n/a"}`].join("\n"); }
  function formatCompactOutputContract(c) { return [`vnem_compact_output_contract: compact_by_default=${c.compact_by_default}`, `vague=${c.compact_output_too_vague}`, `expand=${c.expand_for_risky_current_ui_debug_security_repo_file_tasks}`].join("\n"); }

  function needsExternalResearchForAdaptive(type, text) {
    if (["current_research", "security_safety", "high_stakes_advice"].includes(type)) return true;
    if (/\b(current|latest|right now|today|policy|price|law|legal|medical|financial|security|safe|version|patch|meta|requirements|refund)\b/.test(text)) return true;
    if (["ui_redesign", "ui_web_change"].includes(type) && /\b(original|reference|website|site|compare|better than)\b/.test(text)) return true;
    return false;
  }

  function reasonForEffortMode(type, mode, researchNeeded) {
    if (mode === "instant_answer") return "The task appears simple, stable, low-stakes, and answerable directly after Core classification.";
    if (mode === "quick_plan") return "The task needs concise shaping but not heavy proof unless escalation triggers appear.";
    if (mode === "standard") return researchNeeded ? "Facts may change, so source verification is required without full repo/browser proof by default." : "Normal task: targeted checks and relevant tools only.";
    if (mode === "deep_proof") return "Failure would matter or evidence is required: debugging, UI, security, files, current sources, or visual proof.";
    return "Repo changes, releases, deploys, public claims, or irreversible actions require max verification.";
  }
  function researchReason(type, text, needed) { return needed ? "Research/source verification is needed because the task may involve current facts, policy/security/high-stakes risk, or redesign reference quality." : "No external research is needed because the task is stable enough or uses user-provided text; answer from stable knowledge with labeled uncertainty if needed."; }
  function toolBudgetForMode(mode) { return ({ instant_answer: "none_by_default", quick_plan: "minimal_only_if_useful", standard: "targeted", deep_proof: "evidence_driven", max_verification: "full_verification_ladder" })[mode] || "targeted"; }
  function tokenBudgetGuidance(mode) { return ({ instant_answer: "1 short answer; no report", quick_plan: "short structure; answer/action first", standard: "targeted detail only", deep_proof: "evidence sections allowed but only with actual evidence", max_verification: "complete evidence ladder and compact final report" })[mode] || "targeted detail only"; }
  function recommendedCoreToolsForEffort(type, mode, researchNeeded) { const out = ["vnem_plan_effort_budget"]; if (mode !== "instant_answer") out.push("vnem_route_task"); if (researchNeeded) out.push("vnem_assess_research_need", "vnem_build_search_plan"); if (/ui/.test(type)) out.push("vnem_design_ambition_plan", "vnem_build_ui_quality_plan", "vnem_visual_taste_audit"); if (type === "local_debugging") out.push("vnem_build_debugging_plan"); if (mode === "max_verification") out.push("vnem_completion_audit"); return uniqueStrings(out); }
  function recommendedToolsMcpForEffort(type, mode, researchNeeded) { const out = []; if (researchNeeded) out.push("vnem_tools_search_query_builder", "vnem_tools_web_search", "vnem_tools_claim_source_matrix"); if (/ui/.test(type)) out.push("vnem_tools_ui_surface_review", "vnem_tools_browser_evidence_plan", "vnem_tools_browser_interaction_run", "vnem_tools_browser_evidence_compare", "vnem_tools_ui_evidence_audit"); if (type === "local_debugging") out.push("vnem_tools_debug_evidence", "vnem_tools_run_project_task"); if (["repo_modification", "deployment_workflow"].includes(type)) out.push("vnem_tools_workspace_map", "vnem_tools_apply_patch_batch", "vnem_tools_run_project_task", "vnem_tools_git_status", "vnem_tools_finish_session"); return uniqueStrings(out); }
  function evidenceForEffort(type, mode, researchNeeded) { const out = ["Core classification output"]; if (researchNeeded) out.push("current/official source verification or explicit unavailable/unknown status"); if (/ui/.test(type)) out.push("browser/visual proof, screenshots or browser_unavailable, responsive/a11y/state evidence, before/after for visual claims"); if (type === "local_debugging") out.push("failing log/command/repro, root cause, targeted verification"); if (["repo_modification", "deployment_workflow"].includes(type)) out.push("changed files, tests/checks, commit SHA, exact CI/deploy status when pushed"); if (type === "security_safety") out.push("artifact boundary, source/reputation/risk checks, no credential/session handling"); return uniqueStrings(out); }
  function evidenceNotRequiredForEffort(type, mode) { if (mode === "instant_answer") return ["browser proof", "file inspection", "source matrix", "long audit report", "proof section without proof"]; if (mode === "quick_plan") return ["full verification ladder unless escalation triggers appear", "broad tool sweep"]; return ["decorative tools that do not improve truth/result"]; }
  function toolsToAvoidForEffort(mode, type) { if (mode === "instant_answer") return ["browser/file/source/research tools for stable Q&A", "many Tools MCP calls just to look advanced", "long planning tools before answer"]; if (mode === "quick_plan") return ["broad scans", "full test suite", "browser proof unless UI/current evidence matters"]; return ["unrelated tools", "decorative evidence sections", "broad crawling or scraping"]; }
  function wastedToolRisk(mode, type) { return ["instant_answer", "quick_plan"].includes(mode) ? "high_if_tools_used_without_new_truth" : "medium_if_tools_do_not_map_to required evidence"; }
  function clarificationDecisionForTask(type, text, goal, known) { if (type === "local_debugging" && !/(error|log|stack trace|failing command|repro|provided)/.test(text)) return { needed: true, reason: "A precise log/failing command materially changes debugging correctness." }; if (type === "security_safety" && !/(url|link|file|hash|artifact|provided by|stranger|trusted)/.test(text)) return { needed: true, reason: "Security/safety review needs exact artifact and trust boundary." }; if (type === "ui_redesign" && /\b(choose|which direction|options)\b/.test(text)) return { needed: true, reason: "The user explicitly asked for design direction choice." }; return { needed: false, reason: "No blocking ambiguity; proceed with labeled assumptions and adapt if needed." }; }
  function escalationTriggersForEffort() { return ["latest/current requested", "facts may be stale", "medical/legal/financial/security risk", "code changes requested", "files/logs involved", "UI/browser proof involved", "public-facing claim", "destructive/irreversible action", "secrets/tokens/cookies/accounts", "user explicitly asks to verify/research/prove", "model uncertainty", "redesign quality depends on original/reference site"]; }
  function answerShapeForMode(mode) { return ({ instant_answer: "direct answer first; no long report", quick_plan: "concise structure; action first; important caveats only", standard: "targeted checks and evidence labels", deep_proof: "evidence-driven with must-not-claim boundaries", max_verification: "verification ladder, changed files, tests, commit/CI proof when relevant" })[mode] || "targeted answer"; }
  function mustNotClaimForEffort(mode, type, researchNeeded) { const out = ["Do not claim a file, browser, repo, UI, source, test, or deployment was checked unless it was actually checked.", "Do not present guesses as facts.", "Do not comfort with false certainty."]; if (researchNeeded) out.push("Do not claim current/latest/source-verified facts without current source evidence."); if (/ui/.test(type)) out.push("Do not claim visual improvement without browser/visual proof."); if (mode === "instant_answer") out.push("Do not claim research/tools/proof were used for a direct answer."); return out; }

  function detectUserDesignStyle(text) { const t = normalize(text); const styles = ["dark cyberpunk", "cyberpunk", "luxury premium", "premium", "playful", "high-conversion", "modern", "minimal", "corporate", "brutalist", "retro", "elegant", "bold", "fun"]; return styles.find((style) => t.includes(style)) || null; }
  function inferBusinessDesignContext(text, site) { if (/pizza|pizzabomba|restaurant|food|delivery|menu/.test(text)) return { referenceClass: "pizza/restaurant/delivery", defaultDirection: "energetic pizza restaurant/delivery experience with appetizing visuals, clear menu/order path, local trust, and mobile-first conversion", audience: "hungry local customers choosing quickly on mobile; conversion goal is order/call/reservation", personality: ["appetizing", "energetic", "local", "clear", "confident"] }; return { referenceClass: "same-category product/business", defaultDirection: "adaptive brand-fit direction based on business, audience, content, and conversion goal", audience: "target users inferred from the business and user request", personality: ["specific", "memorable", "usable", "not generic"] }; }
  function designDirectionsForBusiness(business, explicitStyle) { if (explicitStyle) return [`explicit ${explicitStyle}`, "brand-compatible variant", "conversion-focused variant"]; if (/pizza|restaurant/.test(business.referenceClass)) return ["high-conversion delivery-focused", "warm local restaurant", "bold appetizing pizza brand"]; return ["brand-fit conversion direction", "content-led editorial direction", "bold memorable product direction"]; }
  function formatEffortBudget(b) { return [`vnem_plan_effort_budget: ${b.effort_mode}`, `task_type=${b.task_type}`, `research_needed=${b.research_needed}`, `tools_needed=${b.tool_budget.tools_needed}`].join("\n"); }
  function formatFastAnswerContract(c) { return [`vnem_fast_answer_contract: direct=${c.should_answer_directly}`, `research_needed=${c.research_needed}`, `tools_needed=${c.tools_needed}`].join("\n"); }
  function formatDesignAmbitionPlan(p) { return [`vnem_design_ambition_plan: ${p.selected_direction}`, `user_style=${p.user_specified_style}`, `adapt=${p.should_adapt_to_existing_brand}`].join("\n"); }
  function formatVisualTasteAudit(a) { return [`vnem_visual_taste_audit: ${a.verdict}`, `visual_score=${a.visual_quality_score}`, `safe_to_claim=${a.safe_to_claim}`].join("\n"); }
  function compactAdaptiveEffort(b) { return { effort_mode: b.effort_mode, why_not_deeper: "no_trigger", why_not_lighter: "truth_risk", minimum_quality_checks: ["classify"], truth_over_comfort_rule: "on", research_decision: b.research_needed ? "required" : "not_required", tool_budget: b.tool_budget.budget, wasted_tool_risk: ["instant_answer", "quick_plan"].includes(b.effort_mode) ? "high_if_decorative" : "avoid_decorative", escalation_triggers: ["current", "risk"], output_length_guidance: b.effort_mode === "instant_answer" ? "direct" : "compact" }; }
  function compactDesignBehavior(plan) { if (!plan) return { applies: false }; return { applies: true, user_style_specified: plan.user_specified_style, adapt_to_brand: plan.should_adapt_to_existing_brand, design_reference_needed: plan.design_reference_needed, visual_ambition_required: true, avoid_generic_template: true, total_impact_required: true, avoid_one_axis_optimization: true, comparison_scorecard_required: true, before_after_evidence_required: true }; }

  function buildAntiStagnationCheck(args = {}) {
    const task = String(args.task || "");
    const next = String(args.proposed_next_step || task || "");
    const completed = routeArrayify(args.completed_areas).map((item) => normalize(item));
    const recent = routeArrayify(args.recent_actions).map((item) => normalize(item));
    const hay = normalize(`${task} ${next} ${recent.join(" ")}`);
    const flags = [];
    const coveredBrowserSearch = completed.some((item) => /browser|search|captcha|claim.source|research gap/.test(item));
    if (coveredBrowserSearch && /browser|search|captcha|claim.source|research gap/.test(hay)) flags.push("repeating already-covered improvement area");
    if (/docs|readme|wording|documentation/.test(hay) && /major|implementation|improvement|done|complete|polish/.test(hay)) flags.push("docs-only fake progress risk");
    if (/broad scan|scan everything|full repo|all files|re-run discovery|rerun discovery/.test(hay)) flags.push("rerunning broad scans when targeted inspection is enough");
    if (/full test|npm test|entire suite|all tests/.test(hay) && /again|loop|repeat|rerun/.test(hay)) flags.push("full test suite loop risk");
    if (sameNormalizedMeaning(task, next) && /next|step|again|another/.test(hay)) flags.push("same next step under a different name");
    if (/polish|tweak|wording|cleanup/.test(hay) && completed.length) flags.push("polishing finished areas while higher-value work waits");
    const shouldContinue = !flags.some((flag) => /repeating|docs-only|full test suite|same next step|polishing/.test(flag));
    return {
      task,
      completed_areas: args.completed_areas || [],
      stagnation_risk_flags: uniqueStrings(flags),
      should_continue_same_area: shouldContinue,
      recommended_next_action: shouldContinue
        ? "Continue with focused test-first implementation and targeted verification."
        : "Move to a different weakness or next useful batch; prefer routing, memory relevance, output-quality, compatibility, or evaluation work unless new browser/search behavior and tests are clearly added.",
      avoid: ["docs-only fake progress", "broad scans without a specific question", "full test suite loops during development", "renaming the same next step", "polishing completed areas without new behavior"],
      must_not_claim: ["Do not claim new behavior from docs-only or repeated work.", "Do not claim a repeated completed area is a major new improvement without new tests/evidence.", "Do not claim full validation was necessary if targeted checks were enough."],
      core_plan_only: true
    };
  }

  function buildOutputQualityPlan(args = {}) {
    const task = String(args.task || "");
    const type = normalizeOutputType(args.output_type || "technical_final_report");
    const evidence = routeArrayify(args.evidence_available);
    const blockers = routeArrayify(args.blockers);
    const commands = routeArrayify(args.commands_to_handoff);
    const outputText = String(args.output_text || "");
    const contract = outputTemplateForType(type, commands);
    const auditFlags = auditOutputText(outputText, type, evidence, blockers, commands);
    return {
      task,
      output_type: type,
      audience: args.audience || "unknown",
      compact_first_order: ["status/result first", "what matters", "evidence/proof", "blocked/unknown", "next action", "details only if useful"],
      required_sections: contract.required_sections,
      template_contract: contract.template,
      evidence_labels: EVIDENCE_LABELS,
      detail_policy: detailPolicyForOutput(type, args.audience, blockers),
      audit_flags: auditFlags,
      missing_output_requirements: auditFlags,
      must_not_claim: ["Do not claim done/safe/compatible without evidence.", "Do not bury blockers after long background.", "Do not present preparation-only work as implementation.", "Do not omit the next action."],
      final_report_contract: ["Separate proven/tested/supported/likely/assumed/unknown/blocked/failed/not_attempted/preparation_only.", "List exact tests/evidence before claims.", "Keep result compact first; details only when useful."],
      core_plan_only: true
    };
  }

  function normalizeOutputType(type) {
    const t = normalize(type).replace(/[\s-]+/g, "_");
    if (/ai_work|work_review|review/.test(t)) return "ai_work_review";
    if (/blocker/.test(t)) return "blocker_report";
    if (/command|handoff.*command|user_command/.test(t)) return "user_command_handoff";
    if (/building|prompt_handoff|implementation_handoff/.test(t)) return "building_ai_prompt_handoff";
    if (/technical|final/.test(t)) return "technical_final_report";
    return t || "technical_final_report";
  }

  function outputTemplateForType(type, commands = []) {
    if (type === "ai_work_review") return { required_sections: ["Result", "What it actually did", "What matters", "What is proven", "What is blocked or unknown", "Next best step"], template: "## Result\n-\n\n## What it actually did\n-\n\n## What matters\n-\n\n## What is proven\n-\n\n## What is blocked or unknown\n-\n\n## Next best step\n-" };
    if (type === "blocker_report") return { required_sections: ["Blocked by", "Why it matters", "Evidence missing", "Safe next step", "Do not claim yet"], template: "## Blocked by\n-\n\n## Why it matters\n-\n\n## Evidence missing\n-\n\n## Safe next step\n-\n\n## Do not claim yet\n-" };
    if (type === "user_command_handoff") return { required_sections: ["Run this", "Success looks like", "If it fails, send back"], template: `## Run this\n\n\`\`\`bash\n${commands.join("\n") || "# command here"}\n\`\`\`\n\n## Success looks like\n-\n\n## If it fails, send back\n- first error block\n- final summary` };
    if (type === "building_ai_prompt_handoff") return { required_sections: ["Result", "Goal", "Must read first", "Current known state", "Do not repeat", "Required first checks", "Implementation targets", "Files/areas likely involved", "Tests/checks required", "Evidence required", "What counts as done", "What must be marked blocked/unverified"], template: "## Result\n-\n\n## Goal\n-\n\n## Must read first\n-\n\n## Current known state\n-\n\n## Do not repeat\n-\n\n## Required first checks\n-\n\n## Implementation targets\n-\n\n## Files/areas likely involved\n-\n\n## Tests/checks required\n-\n\n## Evidence required\n-\n\n## What counts as done\n-\n\n## What must be marked blocked/unverified\n-" };
    return { required_sections: ["Result", "What changed", "Evidence", "What is proven", "What remains blocked/unknown", "What was not attempted", "Commit/GitHub status", "Exact next best task"], template: "## Result\n-\n\n## What changed\n-\n\n## Evidence\n-\n\n## What is proven\n-\n\n## What remains blocked/unknown\n-\n\n## What was not attempted\n-\n\n## Commit/GitHub status\n-\n\n## Exact next best task\n-" };
  }

  function detailPolicyForOutput(type, audience, blockers) {
    if (blockers.length) return "Use blocker-first detail: state blocker, why it matters, missing evidence, safe next step, and do-not-claim line.";
    if (type === "user_command_handoff") return "Give exact commands, where to run them, success signal, and failure output to send back.";
    if (audience === "developer") return "Technical detail is allowed, but keep result/evidence/next action first.";
    return "Plain language, compact first, no internal jargon unless needed.";
  }

  function auditOutputText(outputText, type, evidence, blockers, commands) {
    if (!outputText) return [];
    const text = normalize(outputText);
    const flags = [];
    if (!/^(result|status|blocked|done|passed|failed|implemented|not attempted|unknown|## result|## status|## blocked)/.test(text)) flags.push("not compact-first: status/result/blocker should come first");
    if (!/(next action|next step|safe next step|exact next|if it fails|what remains)/.test(text)) flags.push("missing next action");
    if (/\bsafe\b|secure|compatible|works|done|complete|major improvement/.test(text) && evidence.length === 0) flags.push("fake confidence risk: strong claim without evidence");
    if (/\bsafe\b|secure/.test(text) && !evidence.some((item) => /safety|review|test|scan|evidence|approval/i.test(String(item)))) flags.push("safe without evidence");
    if (/compatible|supported/.test(text) && !evidence.some((item) => /compat|test|docs|version|runtime|official/i.test(String(item)))) flags.push("compatible/supported without compatibility proof");
    if (type === "user_command_handoff" && commands.length && !/(cd |where to run|run this|success looks like|if it fails)/.test(text)) flags.push("command handoff missing where to run or success/failure instructions; command may be too broad");
    if (blockers.length && !/(blocked by|why it matters|safe next step|do not claim)/.test(text)) flags.push("blocker report hides or under-specifies blocker");
    return uniqueStrings(flags);
  }

  function formatCoreRoutingRecord(record) { return [`vnem_route_task: ${record.task_categories.join(", ")}`, `must_ask_user=${record.must_ask_user}`, `need_tools_mcp=${record.need_tools_mcp}`, `next=${record.next_best_action}`].join("\n"); }
  function compactRoutingRecord(record) { const permission = record.tools_permission_planning || {}; return { task_categories: record.task_categories.slice(0, 5), must_ask_user: record.must_ask_user, need_tools_mcp: record.need_tools_mcp, need_current_research: record.need_current_research, tools_permission_planning: { required_profile: permission.required_permission_profile, trust_boundary: permission.trust_boundary_level, approval_count: (permission.actions_requiring_approval || []).length, blocked_count: (permission.blocked_or_preview_only_actions || []).length }, core_plan_only: true }; }
  function compactOutputQualityPlan(plan) { return { output_type: plan.output_type, core_plan_only: true }; }
  function formatOutputQualityPlan(plan) { return [`vnem_output_quality_plan: ${plan.output_type}`, `sections=${plan.required_sections.join(", ")}`, `audit_flags=${plan.audit_flags.length}`].join("\n"); }
  function formatAntiStagnationCheck(check) { return [`vnem_anti_stagnation_check: flags=${check.stagnation_risk_flags.join(", ") || "none"}`, `continue=${check.should_continue_same_area}`, `next=${check.recommended_next_action}`].join("\n"); }

  function uniqueBy(items, keyFn) { const seen = new Set(); const out = []; for (const item of items) { const key = keyFn(item); if (!seen.has(key)) { seen.add(key); out.push(item); } } return out; }
  function routeArrayify(value) { if (value === undefined || value === null) return []; return Array.isArray(value) ? value : [value]; }
  function stableMemoryId(content) { return `memory-${createHash("sha256").update(String(content || "")).digest("hex").slice(0, 8)}`; }
  function sharesAnyTerm(a, b) { const setB = new Set(b); return [...a].some((term) => setB.has(term)); }
  function sameNormalizedMeaning(a, b) { const left = tokenize(normalize(a)).filter((term) => !["another", "again", "more", "next", "step", "make", "improve"].includes(term)).sort().join(" "); const right = tokenize(normalize(b)).filter((term) => !["another", "again", "more", "next", "step", "make", "improve"].includes(term)).sort().join(" "); return left && right && (left === right || left.includes(right) || right.includes(left)); }

  function selectToolsForTask(args = {}) {
    const task = String(args.task || "");
    const context = String(args.known_context || "");
    const hint = String(args.task_type_hint || "");
    const type = inferCoreToolTaskType(`${hint} ${task} ${context}`);
    const documentationTask = /\b(current docs|official docs?|official documentation|framework documentation|library documentation|api reference|documentation retrieval)\b/i.test(`${hint} ${task} ${context}`);
    const selected = new Set(["vnem_tools_manifest", "vnem_tools_permission_status", "vnem_tools_action_policy_preview", "vnem_tools_trust_boundary_classify", "vnem_tools_start_session", "vnem_tools_finish_session"]);
    const add = (...tools) => tools.filter(Boolean).forEach((tool) => selected.add(tool));
    if (["coding", "ui_web", "debugging", "file_investigation", "local_project_modification", "security_sensitive"].includes(type)) {
      add("vnem_tools_workspace_map", "vnem_tools_architecture_review", "vnem_tools_code_search", "vnem_tools_read_many_files", "vnem_tools_project_scan", "vnem_tools_dependency_scan");
    }
    if (["coding", "ui_web", "debugging", "local_project_modification"].includes(type)) add("vnem_tools_apply_patch_batch", "vnem_tools_run_project_task", "vnem_tools_collect_evidence", "vnem_tools_git_status", "vnem_tools_git_diff_summary");
    if (type === "ui_web") add("vnem_tools_app_inspect", "vnem_tools_app_vertical_slice_plan", "vnem_tools_app_vertical_slice_apply", "vnem_tools_app_acceptance_run", "vnem_tools_app_transaction_rollback", "vnem_tools_ui_surface_review", "vnem_tools_browser_evidence_plan", "vnem_tools_browser_interaction_run", "vnem_tools_browser_evidence_compare", "vnem_tools_browser_evidence_run", "vnem_tools_ui_evidence_audit", "vnem_tools_start_dev_server", "vnem_tools_browser_capture", "vnem_tools_browser_page_inspect", "vnem_tools_browser_accessibility_audit", "vnem_tools_browser_compare_snapshots", "vnem_tools_stop_dev_server");
    if (type === "debugging") add("vnem_tools_debug_evidence", "vnem_tools_architecture_review", "vnem_tools_code_search", "vnem_tools_read_many_files", "vnem_tools_run_project_task", "vnem_tools_apply_patch_batch");
    if (["research", "direct_url_source", "current_research", "website_understanding"].includes(type)) add("vnem_tools_source_quality_check", "vnem_tools_research_brief", "vnem_tools_browser_research_pack", "vnem_tools_claim_source_matrix", "vnem_tools_research_gap_detector", "vnem_tools_source_map", "vnem_tools_source_extract", "vnem_tools_source_graph");
    if (["research", "current_research"].includes(type)) add("vnem_tools_search_provider_manifest", "vnem_tools_search_query_builder", "vnem_tools_web_search", "vnem_tools_search_result_ranker");
    if (documentationTask) add("vnem_tools_documentation_source_catalog", "vnem_tools_official_documentation_fetch", "vnem_tools_documentation_context", "vnem_tools_documentation_cache_status");
    if (["direct_url_source", "website_understanding"].includes(type)) add("vnem_tools_fetch_url_text", "vnem_tools_browser_page_inspect", "vnem_tools_url_reputation_check", "vnem_tools_captcha_detector");
    if (type === "website_understanding") add("vnem_tools_browser_readability_extract", "vnem_tools_browser_link_map", "vnem_tools_browser_dom_search");
    if (type === "direct_url_source") add("vnem_tools_browser_readability_extract", "vnem_tools_browser_link_map");
    if (type === "research" && directUrlPresent(task + " " + context)) add("vnem_tools_fetch_url_text", "vnem_tools_browser_page_inspect", "vnem_tools_browser_research_pack");
    if (type === "file_investigation") add("vnem_tools_find_references");
    if (type === "security_sensitive") add("vnem_tools_dependency_scan", "vnem_tools_source_quality_check", "vnem_tools_redirect_chain_check", "vnem_tools_url_reputation_check", "vnem_tools_captcha_detector", "vnem_tools_download_safety_check", "vnem_tools_claim_source_matrix", "vnem_tools_research_gap_detector");
    if (/download|installer|redirect|captcha|phishing|malware|scam|credential|suspicious/i.test(task + " " + context)) add("vnem_tools_redirect_chain_check", "vnem_tools_url_reputation_check", "vnem_tools_captcha_detector", "vnem_tools_download_safety_check");
    const selectedTools = [...selected];
    const dryRunSteps = selectedTools.filter((tool) => /apply_patch|vertical_slice_apply|app_acceptance|app_transaction_rollback|run_project_task|start_dev_server|browser_interaction|browser_capture|browser_page|browser_readability|browser_link|browser_dom|browser_accessibility|browser_compare|web_search|redirect_chain|download_safety|fetch_url_text|git_commit|api_request|restore/.test(tool)).map((tool) => `${tool}: dry-run first before approval or real action when network/mutation/source fetching is involved`);
    const approvalSteps = selectedTools.filter((tool) => /apply_patch|vertical_slice_apply|app_acceptance|app_transaction_rollback|run_project_task|start_dev_server|stop_dev_server|browser_interaction|browser_capture|browser_page|browser_readability|browser_link|browser_dom|browser_accessibility|browser_compare|web_search|redirect_chain|download_safety|fetch_url_text|official_documentation_fetch|git_commit|api_request|restore/.test(tool)).map((tool) => `${tool}: requires explicit approval for real external/network/mutation action`);
    const currentSearchRequired = currentResearchRequired(type, `${task} ${context}`);
    return {
      task,
      task_type: type,
      missing_context_questions: missingToolPlanQuestions(type, task),
      selected_tools: selectedTools,
      permission_profile_plan: buildCorePermissionProfilePlan(task, context, selectedTools),
      tool_sequence_preview: selectedTools.map((tool) => ({ tool, what_for: purposeForTool(tool, type) })),
      what_each_tool_is_for: Object.fromEntries(selectedTools.map((tool) => [tool, purposeForTool(tool, type)])),
      dry_run_steps: dryRunSteps,
      approval_required_steps: approvalSteps,
      evidence_to_collect: ["workspace/project map", "files/code searched or read", "patch diff/backup/restore plan", "commands/tasks and exit codes", type === "ui_web" ? "browser screenshot or honest browser_unavailable plus static page/a11y/snapshot evidence" : null, ["research", "direct_url_source", "current_research", "website_understanding"].includes(type) ? "source/page quality flags, inspected source excerpts, and supported/unsupported/conflicting claims" : null, "session evidence pack", "must-not-claim list"].filter(Boolean),
      source_quality_requirements: sourceQualityRequirements(type),
      browser_understanding_limits: browserUnderstandingLimits(type),
      when_external_web_search_is_required: currentSearchRequired,
      verification_plan: verificationForType(type),
      fallbacks_if_tool_unavailable: ["If Tools MCP is unavailable, Core should produce a plan only and ask the agent to use equivalent local tools with the same safety/evidence rules.", "If active Tools profile is safe-readonly, use permission preview and ask for the exact stronger profile/approval instead of attempting mutation.", "If browser proof is unavailable, report browser_unavailable and do not claim visual proof.", "If direct URL fetch is blocked/unavailable, use provided text summaries or ask for a source; do not fake search.", "For latest/current research, use an approved external search path outside Tools MCP until a safe search provider exists."],
      must_not_claim: ["Core executed Tools MCP actions.", "The active Tools permission profile allowed a risky action without vnem_tools_permission_status/action_policy_preview evidence.", "Files were edited, commands ran, browser proof was captured, commits were made, or URLs were fetched before Tools evidence exists.", "A web search happened inside Tools MCP.", "Current/latest web research is complete without external current search evidence.", "Unsupported git push/package install/deployment/Giga MCP work was done."],
      done_definition: doneDefinitionForType(type),
      efficiency_guidance: efficiencyForType(type),
      core_executes_tools: false,
      core_mcp_mutates_files: false,
      core_mcp_runs_commands: false,
      core_mcp_uses_browser: false,
      web_search_executed: false
    };
  }

  function buildCoreToolsPlan(args = {}) {
    const selection = selectToolsForTask(args);
    const sequence = [];
    const push = (tool, purpose, requiresApproval = false, dryRunFirst = false) => {
      if (selection.selected_tools.includes(tool)) sequence.push({ tool, purpose, dry_run_first: dryRunFirst, requires_approval: requiresApproval, expected_evidence: expectedEvidenceForTool(tool) });
    };
    if (selection.task_type === "debugging") sequence.push({ tool: "external/input", purpose: "logs first: collect failing command output, stack trace, reproduction, or error message before changing files", dry_run_first: false, requires_approval: false, expected_evidence: ["failure output"] });
    push("vnem_tools_manifest", "inspect Tools catalog and safety metadata");
    push("vnem_tools_permission_status", "inspect active Tools permission profile and allowed-root status");
    push("vnem_tools_action_policy_preview", "preview risky actions against active Tools permission profile before approval");
    push("vnem_tools_trust_boundary_classify", "classify trust boundary for sources/actions/data before risky handling");
    push("vnem_tools_start_session", "start one coherent evidence pack");
    push("vnem_tools_workspace_map", "map project structure safely");
    push("vnem_tools_project_scan", "detect package scripts/frameworks/safe commands");
    push("vnem_tools_app_inspect", "inspect app framework support, frontend/backend boundaries, routes, components, APIs, data flow, states, validation, accessibility, and responsive signals");
    push("vnem_tools_app_vertical_slice_plan", "preview a coherent marker-backed frontend/API/domain transaction with explicit adapter limits");
    push("vnem_tools_app_vertical_slice_apply", "dry-run then apply the approved hash-bound app transaction with automatic failure rollback", true, true);
    push("vnem_tools_app_acceptance_run", "run focused checks, localhost server, real Chromium user path, console/network capture, and desktop/mobile screenshots", true, true);
    push("vnem_tools_app_transaction_rollback", "restore an app transaction only when current hashes still match", true, true);
    push("vnem_tools_dependency_scan", "inspect dependencies/scripts without installing");
    push("vnem_tools_code_search", "find relevant implementation sites");
    push("vnem_tools_find_references", "trace symbols/config names");
    push("vnem_tools_read_many_files", "load bounded relevant context");
    push("vnem_tools_search_provider_manifest", "inspect configured/unconfigured provider capabilities without exposing keys");
    push("vnem_tools_search_query_builder", "build strong source-discovery queries without executing search");
    push("vnem_tools_web_search", "dry-run then run approved configured provider search or return honest unavailable status", true, true);
    push("vnem_tools_search_result_ranker", "rank provider/search results by credibility, freshness, duplicates, and risk");
    push("vnem_tools_fetch_url_text", "dry-run then fetch direct approved URL text only; no search scraping", true, true);
    push("vnem_tools_browser_page_inspect", "inspect direct/local/provided page structure statically", true, true);
    push("vnem_tools_browser_readability_extract", "extract heuristic readable main content", true, true);
    push("vnem_tools_browser_link_map", "map links found in a page without following/crawling", true, true);
    push("vnem_tools_browser_dom_search", "search headings/links/forms/buttons/text statically", true, true);
    push("vnem_tools_browser_accessibility_audit", "run static heuristic accessibility audit", true, true);
    push("vnem_tools_browser_compare_snapshots", "compare before/after page snapshots without visual overclaims", true, true);
    push("vnem_tools_source_quality_check", "evaluate provided/direct source quality");
    push("vnem_tools_research_brief", "summarize supported/unsupported claims from provided sources");
    push("vnem_tools_browser_research_pack", "combine source/page evidence into supported/unsupported/conflicting claim pack");
    push("vnem_tools_redirect_chain_check", "dry-run then check redirect chain safely with no cookies/session/login", true, true);
    push("vnem_tools_url_reputation_check", "heuristically flag phishing/scam/download/credential URL risks");
    push("vnem_tools_captcha_detector", "detect CAPTCHA/access-block pages and propose safe user-assisted handoff; no bypass");
    push("vnem_tools_download_safety_check", "preflight download link risk; no actual download or installer execution", true, true);
    push("vnem_tools_claim_source_matrix", "build claim/source support matrix");
    push("vnem_tools_research_gap_detector", "identify missing current/primary/counter/date/version evidence");
    push("vnem_tools_source_map", "map repo/docs/source structure before extraction; no broad crawl");
    push("vnem_tools_source_extract", "extract bounded selected targets with redaction and skipped/blocked accounting");
    push("vnem_tools_source_graph", "compare sources for officialness, freshness, claim support, and contradictions");
    push("vnem_tools_documentation_source_catalog", "identify exact official documentation domains and provider adapters before retrieval");
    push("vnem_tools_official_documentation_fetch", "retrieve bounded relevant documentation with source authority, cache, date, version, and stale evidence", true, false);
    push("vnem_tools_documentation_context", "build compact task-scoped documentation context and report contradictions");
    push("vnem_tools_documentation_cache_status", "inspect cached documentation hashes, validators, timestamps, and stale status without page bodies");
    push("vnem_tools_architecture_review", "inspect real entry points/registries/tests/configs and flag fake parallel systems/dead code");
    push("vnem_tools_ui_surface_review", "inspect real UI routes/components/render paths/state coverage without browser automation");
    push("vnem_tools_browser_evidence_plan", "plan bounded localhost/file browser proof checklist before any capture");
    push("vnem_tools_browser_evidence_run", "execute approved bounded localhost browser evidence plans and store structured screenshot/DOM/a11y proof packs", true, true);
    push("vnem_tools_browser_interaction_run", "execute approved structured Chromium actions with screenshot/DOM/a11y/console/network/state/viewport evidence and owned-session cleanup", true, true);
    push("vnem_tools_browser_evidence_compare", "compare browser interaction packs by pixels, DOM snapshots, and accessibility snapshots");
    push("vnem_tools_ui_evidence_audit", "audit screenshots/DOM/console/network/a11y/viewport/state evidence before UI claims");
    push("vnem_tools_debug_evidence", "collect bounded log-first evidence, git status, package scripts, and targeted debug checks without arbitrary commands");
    push("vnem_tools_apply_patch_batch", "dry-run then apply approved coherent multi-file patch", true, true);
    push("vnem_tools_run_project_task", "dry-run then run approved safe project task/check", true, true);
    push("vnem_tools_start_dev_server", "dry-run then start approved localhost dev server for UI proof", true, true);
    push("vnem_tools_browser_capture", "dry-run then capture approved local browser proof if useful", true, true);
    push("vnem_tools_stop_dev_server", "stop only Tools-started server", true, false);
    push("vnem_tools_git_status", "summarize local git state");
    push("vnem_tools_git_diff_summary", "summarize final diff");
    push("vnem_tools_finish_session", "write final session evidence pack");
    const plan = {
      ...selection,
      tool_sequence: sequence,
      permission_profile_plan: selection.permission_profile_plan,
      core_tools_handoff: {
        task_summary: selection.task.slice(0, 240),
        required_tool_capabilities: selection.selected_tools,
        required_permissions: selection.approval_required_steps,
        permission_profile_plan: selection.permission_profile_plan,
        active_or_required_permission_profile: selection.permission_profile_plan.required_permission_profile,
        actions_requiring_approval: selection.permission_profile_plan.actions_requiring_approval,
        actions_blocked_by_current_profile: selection.permission_profile_plan.actions_blocked_by_current_profile,
        trust_boundary_level: selection.permission_profile_plan.trust_boundary_level,
        safe_alternative: selection.permission_profile_plan.safe_alternative,
        dry_run_first: selection.dry_run_steps,
        evidence_to_collect: selection.evidence_to_collect,
        source_quality_requirements: selection.source_quality_requirements,
        browser_understanding_limits: selection.browser_understanding_limits,
        when_external_web_search_is_required: selection.when_external_web_search_is_required,
        rollback_or_restore_plan: ["patch_batch returns backups and restore_plan", "use restore_batch for rollback when needed", "commit only after evidence and explicit approval"],
        must_not_claim: selection.must_not_claim,
        safe_core_actions: ["plan", "select tools", "prepare handoff only"]
      },
      core_executes_tools: false,
      core_claims_actions_happened: false,
      web_search_executed: false
    };
    return plan;
  }

  function buildBrowserResearchPlan(args = {}) {
    const plan = buildCoreToolsPlan(args);
    return {
      task: plan.task,
      task_type: plan.task_type,
      selected_tools: [...new Set([...plan.selected_tools, ...researchPlanningToolsForText(`${plan.task} ${plan.task_type}`)])],
      tool_sequence: [...plan.tool_sequence, ...researchPlanningToolsForText(`${plan.task} ${plan.task_type}`).filter((tool) => !plan.tool_sequence.some((step) => step.tool === tool)).map((tool) => ({ tool, purpose: purposeForTool(tool, plan.task_type), dry_run_first: /web_search|redirect|download/.test(tool), requires_approval: /web_search|redirect|download/.test(tool), expected_evidence: expectedEvidenceForTool(tool) }))],
      what_each_tool_is_for: plan.what_each_tool_is_for,
      dry_run_steps: plan.dry_run_steps,
      approval_required_steps: plan.approval_required_steps,
      evidence_to_collect: plan.evidence_to_collect,
      source_quality_requirements: plan.source_quality_requirements,
      browser_understanding_limits: plan.browser_understanding_limits,
      must_not_claim: plan.must_not_claim,
      when_external_web_search_is_required: plan.when_external_web_search_is_required,
      fallbacks_if_browser_unavailable: plan.fallbacks_if_tool_unavailable,
      done_definition: plan.done_definition,
      efficiency_guidance: plan.efficiency_guidance,
      core_executes_tools: false,
      web_search_executed: false
    };
  }

  function explainToolsChain(args = {}) {
    const plan = buildCoreToolsPlan({ task: args.task, task_type_hint: args.task_type_hint, known_context: args.known_context, token_budget: args.token_budget });
    const selectedList = Array.isArray(args.selected_tools) ? args.selected_tools : [];
    const chosen = selectedList.length ? selectedList : plan.selected_tools;
    return {
      task: args.task,
      task_type: plan.task_type,
      chain: chosen.map((tool) => ({ tool, what_for: purposeForTool(tool, plan.task_type), evidence_expected: expectedEvidenceForTool(tool), requires_approval_if_real_action: /apply_patch|run_project_task|start_dev_server|browser|fetch_url_text|git_commit|api_request|restore/.test(tool) })),
      must_not_claim: plan.must_not_claim,
      core_executes_tools: false,
      web_search_executed: false
    };
  }



  function truncateText(value, max = 240) {
    const text = String(value ?? "");
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
  }


  function buildUiQualityPlan(args = {}) {
    const userGoal = String(args.user_goal || args.task || "");
    const uiSurface = String(args.ui_surface || "unknown UI surface");
    const expectedFlow = String(args.expected_user_flow || "");
    const routesOrComponents = uniqueStrings(arrayify(args.routes_or_components).map(String).filter(Boolean));
    const hay = normalize(`${userGoal} ${uiSurface} ${expectedFlow} ${routesOrComponents.join(" ")} ${args.known_context || ""}`);
    const visualContract = buildVisualProofContract({ claim_type: args.claim_type || inferUiClaimType(hay), claim: userGoal, route_or_component: routesOrComponents[0] || uiSurface, token_budget: args.token_budget || "normal" });
    const stateRequired = /loading|spinner|pending|empty|zero state|no data|error|failure|invalid|form|dashboard|data|api|async/.test(hay);
    const beforeAfter = /improve|visual|layout|fix|changed|polish|dashboard|before|after|regression/.test(hay);
    return {
      user_goal: userGoal,
      ui_surface: uiSurface,
      expected_user_flow: expectedFlow || "Open the relevant local route, exercise the user-visible path, and verify visible result/state.",
      routes_or_components_to_check: routesOrComponents.length ? routesOrComponents : ["identify actual route/page entry", "identify rendered component", "identify caller/data-flow path"],
      visual_evidence_required: visualContract.minimum_required_evidence.filter((item) => /screenshot|visual|before|after|route|DOM/i.test(item)),
      browser_evidence_required: ["approved localhost/file route visit evidence", "DOM/visible text assertion for the target route/component", "browser screenshot evidence or honest browser_unavailable status", "user-flow step evidence for visible action/result"],
      console_checks_required: ["browser console checked after route load and user-flow steps", "runtime errors/warnings summarized; unknown console status blocks 'works in browser' claims"],
      network_checks_required: ["network requests checked for failed API/assets on route and flow", "unknown network status blocks browser-works claims"],
      accessibility_checks_required: ["run heuristic accessibility audit or equivalent a11y evidence", "keyboard/focus/labels/ARIA/contrast risks noted when relevant"],
      responsive_viewports_required: [
        { label: "mobile", width: 390, height: 844 },
        { label: "tablet", width: 768, height: 1024 },
        { label: "desktop", width: 1440, height: 900 }
      ],
      empty_loading_error_states_required: stateRequired ? ["loading/pending state", "empty/no-data state", "error/failure state", "success/normal populated state"] : ["state coverage still considered if data/form/API behavior appears"],
      before_after_required: beforeAfter,
      Tools_MCP_actions_needed: ["vnem_tools_ui_surface_review", "vnem_tools_browser_evidence_plan", "vnem_tools_start_dev_server", "vnem_tools_browser_interaction_run", "vnem_tools_browser_evidence_compare", "vnem_tools_browser_evidence_run", "vnem_tools_browser_capture", "vnem_tools_browser_page_inspect", "vnem_tools_browser_accessibility_audit", "vnem_tools_browser_compare_snapshots", "vnem_tools_ui_evidence_audit", "vnem_tools_collect_evidence"],
      permission_profile_expected: "safe-readonly for source review; safe-local-dev or approved-writes only for approved localhost browser proof after dry-run",
      local_dev_server_needed: true,
      risk_flags: ["component file may exist but not be rendered", "route may not point at changed component", "responsive claim may be desktop-only", "console/network errors can invalidate browser-works claims", "visual fix needs before/after proof", "state coverage can be missing for async/data UI"],
      targeted_checks: ["source review confirms route/component/caller path", "browser plan lists exact route and viewports before capture", "DOM text/selector proves component renders", "console and network are clean or failures are reported", "accessibility audit evidence exists for a11y claims", "empty/loading/error states are forced or verified when relevant"],
      full_verification_near_final: ["After targeted UI evidence is clean, run affected build/test once.", "Near final, run broader smoke/readiness once; do not loop full suite during small edits."],
      must_not_claim: ["Core opened a browser.", "Core captured screenshots.", "Core ran a dev server.", "UI improved without screenshot/DOM/browser evidence.", "Responsive without multiple viewport evidence.", "Browser works while console/network status is unknown.", "Component is user-visible without route/caller/render evidence."],
      core_plan_only: true,
      core_executes_tools: false,
      core_executes_browser: false,
      core_captures_screenshots: false
    };
  }

  function buildVisualProofContract(args = {}) {
    const claimType = String(args.claim_type || "visual_improvement");
    const claim = String(args.claim || "");
    const routeOrComponent = String(args.route_or_component || "target route/component");
    const isResponsive = claimType === "responsive_fix" || /responsive|mobile|tablet|desktop|viewport/.test(normalize(claim));
    const isA11y = claimType === "accessibility_improvement" || /accessibility|a11y|aria|keyboard|contrast/.test(normalize(claim));
    const isState = /loading_state|error_state|empty_state/.test(claimType) || /loading|error|empty|state/.test(normalize(claim));
    const isBeforeAfter = claimType === "before_after_comparison" || ["visual_improvement", "layout_fix", "responsive_fix", "dashboard_change"].includes(claimType);
    const routeRequired = ["route_added", "component_added", "dashboard_change", "form_flow", "visual_improvement", "layout_fix", "responsive_fix"].includes(claimType);
    const min = [
      "at least one screenshot or equivalent visual/browser evidence for the affected UI",
      routeRequired ? `route/component render evidence for ${routeOrComponent}` : null,
      "DOM or visible-text assertion proving the target UI rendered",
      "console error check result after load/user flow",
      "network failure check result after load/user flow",
      isA11y ? "accessibility audit evidence for the claimed improvement" : "accessibility risk check when UI quality is claimed",
      isResponsive ? "multiple viewport results, not desktop-only" : null,
      isState ? "state evidence for loading/error/empty/success as applicable" : null,
      isBeforeAfter ? "before/after screenshot or snapshot comparison for visual/layout claims" : null
    ].filter(Boolean);
    const preferred = [
      "before and after screenshots with route, viewport, timestamp/path/hash metadata",
      "mobile, tablet, and desktop viewport evidence",
      "DOM/visible text assertions for important headings/buttons/forms",
      "clean console and network summaries, or explicit known failures",
      "static/automated accessibility audit plus manual keyboard/focus notes for important flows",
      "empty/loading/error/success state screenshots or DOM assertions"
    ];
    return {
      claim_type: claimType,
      minimum_required_evidence: min,
      preferred_evidence: preferred,
      route_or_component_integration_required: routeRequired,
      screenshots_required: ["visual_improvement", "layout_fix", "responsive_fix", "dashboard_change", "before_after_comparison", "form_flow"].includes(claimType),
      dom_or_text_assertions_required: true,
      console_error_check_required: true,
      network_error_check_required: true,
      accessibility_check_required: isA11y || /visual|layout|dashboard|form|component|route/.test(claimType),
      viewport_check_required: isResponsive || /visual|layout|dashboard/.test(claimType),
      state_coverage_required: isState || /dashboard|form|route|component/.test(claimType),
      what_counts_as_done: ["The target route/component is proven rendered in the browser or DOM evidence.", "Visual/browser evidence supports the claim and is attached/listed.", "Console/network status is clean or limitations are explicit.", "Responsive/a11y/state evidence exists when claimed.", "Final report separates proven/tested/unknown and avoids visual overclaims."],
      must_not_claim: ["UI improved without screenshot or browser/DOM evidence.", "Visual fix is done without before/after proof when appearance changed.", "Responsive from a single viewport.", "Accessibility improved without accessibility audit evidence.", "Browser works while console/network errors are unknown.", "Route/component is user-visible without render/caller evidence."]
    };
  }

  function inferUiClaimType(text) {
    if (/responsive|mobile|tablet|viewport/.test(text)) return "responsive_fix";
    if (/accessibility|a11y|aria|keyboard|contrast/.test(text)) return "accessibility_improvement";
    if (/loading|spinner|pending/.test(text)) return "loading_state";
    if (/error|failure|invalid/.test(text)) return "error_state";
    if (/empty|no data|zero state/.test(text)) return "empty_state";
    if (/route/.test(text)) return "route_added";
    if (/component/.test(text)) return "component_added";
    if (/dashboard/.test(text)) return "dashboard_change";
    return "visual_improvement";
  }

  function formatUiQualityPlan(plan) {
    return [`vnem_build_ui_quality_plan: ${plan.ui_surface}`, `Routes/components: ${plan.routes_or_components_to_check.join("; ")}`, `Visual evidence required: ${plan.visual_evidence_required.join("; ")}`, `Core plan-only: ${plan.core_plan_only}`].join("\n");
  }

  function formatVisualProofContract(contract) {
    return [`vnem_visual_proof_contract: ${contract.claim_type}`, `Minimum evidence: ${contract.minimum_required_evidence.join("; ")}`, `Screenshots required: ${contract.screenshots_required}`, `Route/component required: ${contract.route_or_component_integration_required}`].join("\n");
  }

  function buildDebuggingPlan(args = {}) {
    const task = String(args.task || "");
    const expected = String(args.expected_behavior || "");
    const actual = String(args.actual_behavior || "");
    const output = String(args.error_or_output || "");
    const failingCommand = String(args.failing_command || "");
    const context = String(args.known_context || "");
    const hay = normalize(`${task} ${expected} ${actual} ${output} ${failingCommand} ${context}`);
    const failureType = inferFailureType({ task, output, failingCommand, actual });
    const hasEvidence = Boolean(output || failingCommand || /error|log|stack|trace|failed|failing|crash/i.test(context));
    const uiLike = failureType === "UI" || /ui|dashboard|page|browser|click|blank|screen|component|visual/.test(hay);
    const evidenceAvailable = [
      output ? `provided error/output: ${truncateText(output, 220)}` : null,
      failingCommand ? `failing command: ${failingCommand}` : null,
      expected ? `expected behavior: ${expected}` : null,
      actual ? `actual behavior: ${actual}` : null,
      context && /error|log|stack|trace|failed|failing|crash/i.test(context) ? `known context evidence: ${truncateText(context, 220)}` : null
    ].filter(Boolean);
    const evidenceMissing = [
      !output ? "exact error/log/stack trace or recent test/build output" : null,
      !failingCommand ? "failing command or reproduction command" : null,
      !expected ? "expected behavior" : null,
      !actual ? "actual behavior" : null,
      uiLike ? "browser console/network output and focused screenshots for the failing UI state" : null
    ].filter(Boolean);
    const firstEvidence = [];
    if (output || failingCommand) firstEvidence.push("provided error/output and failing command are the first evidence to inspect");
    if (failureType === "startup" || failureType === "crash") firstEvidence.push("startup/crash logs and terminal lines above the first red error");
    if (failureType === "test") firstEvidence.push("the one failing test output before any code change");
    if (failureType === "build") firstEvidence.push("build output and config/runtime version evidence");
    if (failureType === "UI") firstEvidence.push("browser console errors, network failures, DOM/page state, and exact clicked action");
    if (failureType === "MCP") firstEvidence.push("MCP server startup logs, tool list, allowed roots, permission profile, and client error");
    if (!firstEvidence.length) firstEvidence.push("terminal output, logs, git status/diff, config files, and the tightest reproducible command");
    const targeted = targetedChecksForFailure(failureType, failingCommand, task);
    return {
      problem_summary: task,
      expected_behavior: expected || "not provided; clarify or infer cautiously from task",
      actual_behavior: actual || output || "not provided; gather logs/repro before fixing",
      failure_type: failureType,
      evidence_available: evidenceAvailable,
      evidence_missing: evidenceMissing,
      user_input_or_screenshots_useful: uiLike || !hasEvidence,
      specific_user_evidence_request: specificEvidenceRequest(failureType, uiLike, hasEvidence),
      logs_or_output_to_check_first: firstEvidence,
      likely_root_cause_areas: likelyRootCauseAreas(failureType, hay),
      compatibility_risks: compatibilityRisksForDebugging(failureType, hay),
      safety_risks: ["Do not read secrets or private session/cookie/browser-profile files.", "Do not suppress errors or skip tests to create a green run.", "Do not run package installs, GitHub mutation, deployment, or broad filesystem scans."],
      Tools_MCP_actions_needed: ["vnem_tools_debug_evidence", "vnem_tools_architecture_review", "vnem_tools_code_search", "vnem_tools_read_many_files", "vnem_tools_run_project_task", "vnem_tools_git_status", "vnem_tools_git_diff_summary"],
      targeted_tests_or_checks: targeted,
      full_verification_near_final: ["After targeted checks pass, run the relevant broader suite/build/readiness once near final, not after every tiny edit.", "For VNEM changes, run npm test and readiness/check-links near final if the targeted ladder is green."],
      permission_profile_expected: "safe-readonly for evidence/architecture; approved-writes or creator-power only for approved patch/test execution steps",
      must_not_claim: ["Core inspected logs or ran tests.", "The bug is fixed before targeted verification passes.", "Root cause is proven when evidence is missing or only guessed.", "Unrelated passing tests prove the failing path."],
      core_plan_only: true
    };
  }

  function buildEvidenceToFixCheck(args = {}) {
    const task = String(args.task || "");
    const fix = String(args.claimed_fix || "");
    const root = String(args.root_cause || "");
    const files = arrayify(args.changed_files).map(String);
    const evidence = arrayify(args.evidence_items).map((item) => typeof item === "string" ? item : JSON.stringify(item));
    const commands = arrayify(args.commands_run).map(String);
    const hay = normalize(`${task} ${fix} ${root} ${files.join(" ")} ${evidence.join(" ")} ${commands.join(" ")}`);
    const docsOnly = files.length > 0 && files.every((file) => /(^|\/)(readme|docs?|changelog|contributing)|\.(md|mdx|txt)$/i.test(file));
    const risks = [];
    const unrelated = [];
    const missingVerification = [];
    const evidenceText = normalize(evidence.join(" "));
    const fileMatches = !files.length || files.some((file) => evidenceText.includes(normalize(file)) || evidenceText.includes(normalize(path.basename(file))) || normalize(task).includes(normalize(file)) || normalize(task).includes(normalize(path.basename(file))));
    if (!evidence.length) risks.push("fix with no log/error/test evidence");
    if (!root) risks.push("root cause missing or uncertain");
    if (docsOnly && /fix|fixed|bug|crash|runtime|test|error/.test(normalize(`${task} ${fix}`))) risks.push("docs-only or wording-only change claimed as bug fix");
    if (/test\.skip|skip\(|\.only\(|disabled|commented out|swallow|suppress|ignore error|catch \(.*\).*empty/.test(hay)) risks.push("disabled/skipped/suppressed failure claimed as fix");
    if (!fileMatches) unrelated.push("unrelated changed files do not match the implicated file/function/config evidence");
    if (!commands.some((cmd) => /test|check|build|lint|node --check|npm run/i.test(cmd) && /pass|passed|exit 0|success|green|ok/i.test(cmd))) missingVerification.push("rerun the targeted failing command/check and capture passing output");
    if (commands.some((cmd) => /validate|readiness|lint/.test(cmd) && !/test|failing|targeted|specific/.test(cmd)) && /fix|fixed|bug|crash|runtime/.test(hay)) missingVerification.push("unrelated passing checks are not proof of the failing path");
    const fixMatches = !unrelated.length && !docsOnly && evidence.length > 0 && Boolean(root || /same file|because|root cause|caused by/i.test(fix));
    let verdict = "accept_with_limits";
    if (risks.length || unrelated.length || missingVerification.length) verdict = risks.some((r) => /docs-only|disabled|no log|suppressed|skipped/.test(r)) || unrelated.length ? "reject" : "revise";
    return {
      verdict,
      evidence_strength: evidence.length && commands.length ? "medium" : evidence.length ? "low_to_medium" : "none",
      root_cause_status: root ? "stated" : "missing_or_uncertain",
      fix_matches_evidence: fixMatches,
      targeted_verification_required: missingVerification.length ? missingVerification : ["Keep the targeted failing check in the evidence ledger."],
      unrelated_change_risk: unrelated,
      placebo_fix_risk: risks,
      safe_to_claim: verdict === "accept_with_limits" ? ["Claim only the verified targeted behavior and remaining risk."] : ["Partial investigation only; do not claim fixed."],
      must_not_claim: ["bug fix is complete without targeted verification", "docs-only/wording change fixed runtime behavior", "disabled or skipped tests prove a fix", "unrelated passing tests prove the failing path"],
      next_best_check: missingVerification[0] || "Run the smallest targeted regression check, then the relevant broader check near final."
    };
  }

  function buildArchitectureMap(args = {}) {
    const task = String(args.task || "");
    const context = String(args.known_context || "");
    const hay = normalize(`${task} ${context} ${args.project_type_hint || ""}`);
    const isMcp = /mcp|tool|server|registry|registertool/.test(hay);
    const isDashboard = /dashboard|component|route|ui|frontend|react/.test(hay);
    const isApi = /api|endpoint|route|backend|server/.test(hay);
    const entry = [
      isMcp ? "scripts/vnem-mcp-server.mjs or scripts/vnem-tools-mcp-server.mjs registerTool blocks" : null,
      isMcp ? "package.json MCP/test scripts and test-mcp-user-smoke coverage" : null,
      isDashboard ? "dashboard route/component entry points and real rendering path" : null,
      isApi ? "server/API route handler and caller/client path" : null,
      "package.json scripts and existing targeted tests"
    ].filter(Boolean);
    return {
      user_goal: task,
      relevant_entry_points: entry,
      current_implementation_path: ["Use Tools architecture/source map evidence before editing; Core has not read files.", isMcp ? "Find existing MCP registry/tool manifest/test pattern before adding a tool." : "Trace existing caller/route/component path before adding new code."],
      existing_patterns_to_follow: ["modify the active registry/caller/route instead of creating a side system", "add a focused test that fails when the real integration is missing", "keep output contracts backward compatible unless callers/tests are updated"],
      files_likely_involved: likelyFilesForArchitecture(hay),
      tests_likely_involved: ["new targeted behavior test", "test:mcp or test:mcp-user-smoke for MCP tool surfaces", "caller/contract/integration test for route/component/API changes"],
      contracts_or_interfaces_affected: [isMcp ? "MCP tool name/schema/structuredContent manifest" : null, isDashboard ? "dashboard route/component props/data shape" : null, isApi ? "API JSON output/caller expectations" : null, "package script/test command names if changed"].filter(Boolean),
      integration_points: [isMcp ? "MCP tool registry, Tools manifest catalog, smoke tests, readiness report" : null, isDashboard ? "actual route renders component and data flows from real caller/API" : null, isApi ? "handler, client/caller, output schema, tests" : null, "package script and targeted test entry"].filter(Boolean),
      risks: ["parallel fake system or unwired helper", "dead code/unreferenced new module", "contract/schema change without caller/test update", "mock-only test that never hits real routing path", "secret or permission boundary regression"],
      what_must_not_be_broken: ["existing tests/readiness", "Batch B permission/secret blocking", "Batch C source evidence boundaries", "real entry points and public output contracts"],
      core_plan_only: true
    };
  }

  function buildCodeChangeContract(args = {}) {
    const goal = String(args.goal || "");
    const arch = args.architecture_evidence || {};
    const files = arrayify(args.files_to_change).map(String);
    const avoid = arrayify(args.files_to_avoid).map(String);
    const contracts = arrayify(args.contracts_affected).map(String);
    return {
      goal,
      existing_architecture_summary: args.existing_architecture_summary || arch.current_implementation_path?.join("; ") || "Architecture evidence required before serious edits; Core itself has not inspected files.",
      real_integration_point: arrayify(arch.integration_points).length ? arrayify(arch.integration_points) : ["Identify and modify the real route/caller/entry/registry that executes or renders the feature."],
      files_to_change: files,
      files_to_avoid: avoid.length ? avoid : ["unrelated docs/config/lockfiles", "parallel helper modules not imported by real callers", "secret/session/cookie/browser-profile paths"],
      contracts_affected: contracts.length ? contracts : ["caller expectations", "test command names", "structured output / API / UI data shape if touched"],
      compatibility_risks: ["runtime/client/version mismatch", "changed schema without caller migration", "platform/path/shell differences"],
      safety_risks: ["secret leakage", "permission bypass", "broad filesystem or network access", "error suppression to pass tests"],
      tests_to_update_or_add: ["targeted failing test at the real integration point", "caller/contract test for changed output shape", "regression test proving old behavior still works", "avoid mock-only proof unless paired with a real path test"],
      verification_required: ["run the targeted test/check first", "run syntax checks for touched scripts", "run relevant readiness/smoke tests", "run broader suite/build near final"],
      rollback_considerations: ["keep diff small and coherent", "record git status/diff before commit", "avoid irreversible generated/user data changes"],
      what_counts_as_done: ["new behavior is wired into the real entry point", "targeted test fails without the wiring and passes with it", "callers/contracts/docs generated surfaces are updated where needed", "final report separates proven/tested/unknown"],
      must_not_claim: ["implemented when code is unwired", "full fix from mock-only tests", "contract compatibility without caller/test evidence", "safe or complete while verification is missing"]
    };
  }

  function inferFailureType({ task, output, failingCommand, actual }) {
    const text = normalize(`${task} ${output} ${failingCommand} ${actual}`);
    if (/test|assert|jest|vitest|pytest|npm run test|failing test/.test(text)) return "test";
    if (/startup|start dev|server starts|boot/.test(text)) return "startup";
    if (/build|compile|vite build|tsc|webpack|rollup/.test(text)) return "build";
    if (/dashboard|ui|browser|page|blank|click|component|visual|dom/.test(text)) return "UI";
    if (/mcp|stdio|tool list|registertool|allowed root/.test(text)) return "MCP";
    if (/npm install|dependency|peer|package|lockfile|module not found/.test(text)) return "package";
    if (/config|env|setting|yaml|json parse/.test(text)) return "config";
    if (/crash|segfault|fatal|panic|uncaught/.test(text)) return "crash";
    if (/typeerror|referenceerror|runtime|exception|undefined/.test(text)) return "runtime";
    return "unknown";
  }

  function targetedChecksForFailure(type, failingCommand, task) {
    const checks = [];
    if (failingCommand) checks.push(`rerun targeted failing command: ${failingCommand}`);
    if (type === "test") checks.push("run one failing test or one affected test file before the full suite");
    if (type === "build") checks.push("run the single failing build/check step before full validation");
    if (type === "startup" || type === "MCP") checks.push("run node --check on touched MCP/server scripts and the exact startup/smoke test");
    if (type === "UI") checks.push("run the affected route/page check plus browser console/network inspection before full UI suite");
    if (!checks.length) checks.push("create the tightest targeted repro/check before changing code");
    checks.push("only after targeted green, run the relevant broader regression check near final");
    return checks;
  }

  function specificEvidenceRequest(type, uiLike, hasEvidence) {
    const req = [];
    if (!hasEvidence) req.push("Paste the exact failing command and the terminal output from the first red error through the stack trace.");
    if (uiLike) req.push("Provide one screenshot of the visible error/blank state, one screenshot or copy of browser console errors, and the exact action clicked before failure.");
    if (type === "MCP") req.push("Provide MCP startup command, stderr/stdout, client error, tool list/allowed-root context if available.");
    if (type === "package") req.push("Provide package manager output including peer/version/audit conflict lines and package manager/runtime version.");
    if (!req.length) req.push("Existing evidence is enough to start; gather more only if the targeted repro is unclear.");
    return req;
  }

  function likelyRootCauseAreas(type, text) {
    const map = {
      startup: ["entrypoint initialization", "runtime/config/env mismatch", "dependency import failure", "port or path setup"],
      crash: ["uncaught exception site", "invalid input/state before crash", "runtime dependency/config"],
      runtime: ["function receiving undefined/null", "caller data contract", "state initialization", "error boundary/handling"],
      test: ["failing assertion path", "recent code diff", "fixture/data contract", "mock vs real behavior gap"],
      build: ["syntax/type/module resolution", "config/lockfile/runtime version", "generated artifact contract"],
      UI: ["route/component rendering path", "frontend/backend data flow", "browser console/network errors", "loading/error/empty/success states"],
      MCP: ["server startup", "tool registry/schema", "allowed roots/permission profile", "client transport/runtime version"],
      package: ["dependency version conflict", "package script/lockfile", "peer/runtime mismatch", "install script policy"],
      config: ["config schema/path/env", "runtime reads different file than edited", "caller contract mismatch"],
      unknown: ["tight reproduction path", "logs/output", "recent diff", "integration boundary"]
    };
    return map[type] || map.unknown;
  }

  function compatibilityRisksForDebugging(type, text) {
    return [
      /node|npm|package|mcp|vite|react|browser/.test(text) ? "runtime/package/client version compatibility" : null,
      type === "MCP" ? "MCP client/server SDK and stdio transport compatibility" : null,
      type === "UI" ? "browser/device/responsive/frontend-backend compatibility" : null,
      /windows|path|shell|powershell|bash/.test(text) ? "OS/shell/path compatibility" : null,
      "unknown until version/config evidence is gathered"
    ].filter(Boolean);
  }

  function likelyFilesForArchitecture(text) {
    const files = ["package.json", "existing targeted tests under scripts/test-*.mjs or project test directory"];
    if (/mcp|tool|registertool/.test(text)) files.push("scripts/vnem-mcp-server.mjs", "scripts/vnem-tools-mcp-server.mjs", "scripts/test-mcp-server.mjs", "scripts/test-mcp-user-smoke.mjs", "readiness report scripts");
    if (/dashboard|ui|react|component/.test(text)) files.push("dashboard/src routes/components", "dashboard tests", "dashboard build config");
    if (/api|server|route|backend/.test(text)) files.push("server/API handler", "client/caller using API output", "API contract tests");
    return [...new Set(files)];
  }

  function formatDebuggingPlan(plan) {
    return [`Problem: ${plan.problem_summary}`, `Failure type: ${plan.failure_type}`, `Evidence missing: ${plan.evidence_missing.join("; ") || "none"}`, `Check first: ${plan.logs_or_output_to_check_first.join("; ")}`, `Core plan-only: ${plan.core_plan_only}`].join("\n");
  }

  function formatEvidenceToFixCheck(check) {
    return [`Verdict: ${check.verdict}`, `Evidence strength: ${check.evidence_strength}`, `Fix matches evidence: ${check.fix_matches_evidence}`, `Next: ${check.next_best_check}`].join("\n");
  }

  function formatArchitectureMap(map) {
    return [`Goal: ${map.user_goal}`, `Entry points: ${map.relevant_entry_points.join("; ")}`, `Integration points: ${map.integration_points.join("; ")}`, `Core plan-only: ${map.core_plan_only}`].join("\n");
  }

  function formatCodeChangeContract(contract) {
    return [`Goal: ${contract.goal}`, `Integration: ${contract.real_integration_point.join("; ")}`, `Verification: ${contract.verification_required.join("; ")}`, `Done: ${contract.what_counts_as_done.join("; ")}`].join("\n");
  }

  function buildResearchStrategy(args = {}) {
    const task = String(args.task || "");
    const known = String(args.known_context || "");
    const hay = normalize(`${task} ${known} ${args.domain_hint || ""}`);
    const assessment = assessResearchNeed(args);
    const currentness = Boolean(args.freshness_required || assessment.freshness_requirement.required || /latest|current|today|recent|now|this week|security|pricing|version|api|package|docs|release/.test(hay));
    const officialRequired = /api|sdk|official|docs|package|install|setup|security|download|release|changelog|version|compatib|mcp|client|library|framework/.test(hay);
    const localBrowser = /local app|dashboard|browser proof|ui state|frontend|web app|visual|page state|backend data/.test(hay);
    const securityRisk = /security|download|redirect|phishing|malware|credential|captcha|installer|token|secret|scam/.test(hay);
    const sourceTypes = new Set([...(assessment.source_types_needed || [])]);
    if (officialRequired) sourceTypes.add("official_docs");
    if (currentness) { sourceTypes.add("release_notes"); sourceTypes.add("package_registry_or_current_index"); }
    if (/repo|github|source code|architecture|readme/.test(hay)) sourceTypes.add("source_repo");
    if (localBrowser) sourceTypes.add("local_browser_page");
    if (securityRisk) sourceTypes.add("security_advisory_or_reputation_source");
    const claims = inferResearchClaims(task, known, { currentness, officialRequired, localBrowser, securityRisk });
    const queries = buildCoreSearchQueries(task, args.domain_hint || "", currentness, [...sourceTypes], known).queries.slice(0, args.token_budget === "compact" ? 5 : 10);
    const strategy = {
      user_question_or_task: task,
      research_goal: inferResearchGoal(task, known),
      currentness_required: currentness,
      official_docs_required: officialRequired,
      local_browser_or_app_inspection_required: localBrowser,
      security_or_download_risk: securityRisk,
      source_types_to_check: [...sourceTypes],
      claims_to_verify: claims,
      likely_weak_source_risks: weakSourceRisksForResearch({ currentness, officialRequired, localBrowser, securityRisk }),
      queries_to_try: queries,
      source_ingestion_needed: /repo|docs|website|source|extract|understand|architecture|current|api|install|setup/.test(hay),
      contradiction_check_needed: currentness || officialRequired || /compare|conflict|contradict|old|outdated|community|blog|versus|vs/.test(hay),
      freshness_check_needed: currentness,
      stop_condition: ["A bounded source map/extract exists for each large source before any source-understanding claim.", "Important claims are tied to source graph or claim matrix evidence.", "Official/current source gaps are either closed or marked unknown/blocked.", "Contradictions and freshness limits are reported instead of hidden."],
      confidence_limit: currentness || officialRequired ? "medium until official/current source evidence and contradiction check exist" : "low_to_medium until bounded source evidence exists",
      must_not_claim: researchPlanMustNotClaim(),
      selected_tools_to_request_from_Tools_MCP: ["vnem_tools_source_map", "vnem_tools_source_extract", "vnem_tools_source_graph", "vnem_tools_claim_source_matrix", "vnem_tools_research_gap_detector"],
      core_executes_tools: false,
      web_search_executed: false
    };
    return strategy;
  }

  function arrayify(value) {
    if (Array.isArray(value)) return value;
    if (value === undefined || value === null) return [];
    return [value];
  }

  function buildSourceIngestionPlan(args = {}) {
    const task = String(args.task || "");
    const sourceType = args.source_type || inferSourceIngestionType(`${task} ${args.known_context || ""} ${arrayify(args.source_targets).join(" ")}`);
    const targets = arrayify(args.source_targets).map(String);
    const local = sourceType === "local_repo";
    const external = ["website", "documentation_site", "GitHub_repo", "API_docs", "package_registry", "issue_tracker", "release_notes", "mixed"].includes(sourceType) && !local;
    const required = requiredSourceAreas(sourceType, task);
    const plan = {
      user_goal: task,
      source_type: sourceType,
      source_targets: targets,
      extraction_goal: args.extraction_goal || inferResearchGoal(task, args.known_context || ""),
      required_source_areas: required,
      optional_source_areas: optionalSourceAreas(sourceType, task),
      exclusions: ["secret-like paths (.env, tokens, credentials, cookies, sessions, private keys)", ".git internals", "node_modules/build/cache output", "irrelevant generated files", "broad uncontrolled crawling", "login/paywall/CAPTCHA/private-account data"],
      safety_boundaries: ["Map first, extract selected targets second.", "Do not ask Tools MCP to crawl blindly or follow links broadly.", external ? "Live external fetching requires explicit direct URLs, dry-run/approval where applicable, and provider/fetch evidence." : "Local inspection must stay inside allowed roots.", "Secret path blocking and output redaction remain mandatory."],
      access_level: local ? "user-approved local" : targets.some((t) => /^https?:/i.test(t)) ? "public_or_user_provided" : "unknown_or_user_provided",
      extraction_depth: /architecture|full-stack|repo|understand|debug|compat/i.test(task) ? "medium" : "shallow_to_medium",
      token_or_rate_limit_budget: args.token_budget === "expanded" ? "expanded but bounded; summarize/chunk large sources" : "bounded; prefer map and selected high-value targets",
      structured_output_required: ["source map", "source extraction report", "source graph", "claim verification matrix", "freshness/contradiction/gap notes"],
      stop_condition: ["Required source areas are mapped or explicitly marked blocked/missing.", "Selected extraction targets cover the claims being made.", "Source graph/audit can classify claims without pretending full-source understanding."],
      Tools_MCP_actions_needed: ["vnem_tools_source_map", "vnem_tools_source_extract", "vnem_tools_source_graph", "vnem_tools_claim_source_matrix", "vnem_tools_research_gap_detector"],
      permission_profile_expected: external ? "safe-local-dev for approved live fetches; safe-readonly for local/provided planning" : "safe-readonly",
      must_not_claim: ["Core crawled/read/extracted sources.", "Tools should crawl the whole site/repo blindly.", "Secret/private/account data is needed or allowed by default.", "Repo/site is fully understood from a shallow map only."],
      core_executes_tools: false,
      broad_crawl_allowed: false
    };
    return plan;
  }

  function buildResearchEvidenceAudit(args = {}) {
    const task = String(args.task || "");
    const conclusion = String(args.conclusion || "");
    const text = normalize(`${task} ${conclusion}`);
    const evidence = arrayify(args.evidence_items);
    const hasCurrent = evidence.some((item) => /current|recent|probably_current|version_specific/i.test(`${item.freshness || ""} ${item.published_at || ""} ${item.retrieved_at || ""}`) || /20\d{2}/.test(`${item.published_at || ""} ${item.retrieved_at || ""}`));
    const hasOfficial = evidence.some((item) => item.official === true || /official|docs|release|changelog|vendor|repo|package_registry/.test(`${item.source_type || ""} ${item.title || ""}`.toLowerCase()));
    const hasDownload = evidence.some((item) => /redirect|reputation|download|checksum|signature|head/i.test(`${item.source_type || ""} ${item.evidence_type || ""} ${item.title || ""}`));
    const hasWebsiteMap = evidence.some((item) => item.source_map_present === true || /source_map|page_inspect|link_map|browser_research_pack/.test(`${item.evidence_type || ""} ${item.source_type || ""}`));
    const hasRepoMap = evidence.some((item) => item.source_map_present === true || /source_map|repo_map|workspace_map|source_extract/.test(`${item.evidence_type || ""} ${item.source_type || ""}`));
    const hasVersionRuntime = evidence.some((item) => /version|runtime|package|lockfile|release|compat/i.test(`${item.source_type || ""} ${item.title || ""} ${item.text_excerpt || ""}`));
    const hasMultiple = evidence.length >= 2;
    const hasContradictionCheck = evidence.some((item) => item.contradiction_checked === true || /source_graph|claim_source_matrix|contradiction/i.test(`${item.evidence_type || ""} ${item.source_type || ""}`));
    const rejections = [];
    if ((args.freshness_required || /latest|current|today|recent|now|this week/.test(text)) && !hasCurrent) rejections.push("current-info claim without current source evidence");
    if (/official docs|official documentation|docs confirm|api behavior|official/.test(text) && !hasOfficial) rejections.push("official-docs claim without official docs or primary source evidence");
    if (/download safe|safe to download|redirect|installer|malware|phishing/.test(text) && !hasDownload) rejections.push("download safety claim without redirect/reputation/download evidence");
    if (/website|page|browser|ui|local app/.test(text) && !hasWebsiteMap) rejections.push("website-understanding claim without source map/page evidence");
    if (/repo|repository|codebase|architecture|fully understood/.test(text) && !hasRepoMap) rejections.push("repo-understanding claim without repo map/files evidence");
    if (/compatible|compatibility|works with|runtime|version/.test(text) && !hasVersionRuntime) rejections.push("compatibility claim without version/runtime evidence");
    if (/no contradiction|contradiction-free|no conflicts/.test(text) && (!hasMultiple || !hasContradictionCheck)) rejections.push("contradiction-free claim without multiple relevant sources and contradiction check");
    let classification = "unknown";
    if (rejections.some((r) => /current|official|repo|download|website|compatibility|contradiction/.test(r))) classification = evidence.length ? "weakly_supported" : "unknown";
    if (evidence.length && !rejections.length) classification = hasOfficial && hasMultiple ? "well_supported" : "likely";
    if (evidence.some((item) => /contradicted/i.test(`${item.status || ""} ${item.claim_status || ""}`))) classification = "contradicted";
    if (evidence.some((item) => /outdated/i.test(`${item.freshness || ""} ${item.status || ""}`)) && /current|latest|now|today/.test(text)) classification = "outdated";
    return {
      task,
      conclusion,
      classification,
      evidence_count: evidence.length,
      evidence_summary: evidence.map((item, index) => ({ id: item.id || `E${index + 1}`, title: item.title || item.path || "untitled", source_type: item.source_type || item.evidence_type || "unknown", official: Boolean(item.official), freshness: item.freshness || "unknown" })).slice(0, 20),
      rejections,
      missing_evidence: rejections,
      allowed_labels: ["proven", "well_supported", "likely", "weakly_supported", "contradicted", "outdated", "unknown", "blocked", "not_attempted"],
      must_not_claim: ["current-info claim without current source", "official-docs claim without official docs", "download safety claim without redirect/reputation/download evidence", "website-understanding claim without source map/page evidence", "repo-understanding claim without repo map/files evidence", "compatibility claim without version/runtime evidence", "contradiction-free claim without multiple relevant sources"],
      core_executes_tools: false,
      safe_next_action: rejections.length ? "Collect bounded source map/extract/source graph evidence or downgrade the claim to unknown/blocked." : "Use the classification and cite the evidence scope; do not exceed it."
    };
  }

  function inferResearchGoal(task, known) {
    if (/verify|confirm|claim|prove/i.test(task)) return "verify claims with bounded evidence and source graph";
    if (/current|latest|today|recent/i.test(task)) return "find current evidence and freshness limits";
    if (/repo|architecture|source|codebase/i.test(task)) return "map and extract source evidence before repo-understanding claims";
    return `answer the task with evidence boundaries: ${String(task || known).slice(0, 180)}`;
  }

  function inferResearchClaims(task, known, flags) {
    const claims = [];
    if (flags.currentness) claims.push("The answer reflects current/latest source evidence.");
    if (flags.officialRequired) claims.push("Official docs or primary sources support the key recommendation.");
    if (flags.localBrowser) claims.push("Local browser/app evidence supports any UI/page understanding claim.");
    if (flags.securityRisk) claims.push("Security/download risk was checked with redirect/reputation/download evidence.");
    const sentences = `${task}. ${known}`.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
    claims.push(...sentences.slice(0, 4));
    return [...new Set(claims)].slice(0, 10);
  }

  function weakSourceRisksForResearch(flags) {
    return [
      flags.officialRequired ? "random blog/video used where official docs or source repo are required" : null,
      flags.currentness ? "outdated docs, old forum posts, cached AI pages, or missing release dates" : null,
      flags.securityRisk ? "download mirrors, fake buttons, phishing pages, unverified checksums" : null,
      flags.localBrowser ? "claiming UI behavior without page/source-map/browser evidence" : null,
      "single-source confidence without contradiction/counter-source check"
    ].filter(Boolean);
  }

  function researchPlanMustNotClaim() {
    return ["Core searched the web or browsed pages.", "Core executed Tools MCP actions.", "Current/latest facts are verified before source evidence exists.", "Official docs confirm a claim before official source evidence exists.", "No contradictions exist before multiple relevant sources are compared."];
  }

  function inferSourceIngestionType(text) {
    const t = normalize(text);
    if (/local repo|local project|workspace|c:\\|\/home|repo path/.test(t)) return "local_repo";
    if (/github/.test(t)) return "GitHub_repo";
    if (/api docs|official docs|sdk docs/.test(t)) return "API_docs";
    if (/package|npm|pypi|registry/.test(t)) return "package_registry";
    if (/issue|pull request|\bpr\b/.test(t)) return "issue_tracker";
    if (/release|changelog/.test(t)) return "release_notes";
    if (/docs|documentation/.test(t)) return "documentation_site";
    if (/website|web page|site/.test(t)) return "website";
    return "mixed";
  }

  function requiredSourceAreas(sourceType, task) {
    const base = {
      local_repo: ["README/install docs", "package or dependency manifests", "source directories", "tests/examples", "changelog/release notes", "config/CI files"],
      GitHub_repo: ["README", "default branch metadata", "source tree", "package manifests", "docs/examples", "issues/PRs only if relevant", "releases/changelog"],
      API_docs: ["official quickstart/install", "API reference", "auth/security docs", "version/deprecation notes", "changelog/migration guide"],
      documentation_site: ["docs hierarchy", "quickstart/install", "API/reference pages", "version selector", "changelog/troubleshooting"],
      website: ["homepage purpose", "navigation/link map", "important pages", "download/pricing/support if relevant", "risk/access-block notes"],
      package_registry: ["latest version", "published date", "repository/docs links", "dependencies/peer deps", "license/security notes"],
      issue_tracker: ["issue title/status", "maintainer comments", "affected versions", "linked PR/release", "workaround"],
      release_notes: ["latest version", "release date", "breaking changes", "migration/security fixes", "known issues"],
      mixed: ["source map", "high-value docs/pages/files", "release/currentness evidence", "claim-source evidence"]
    };
    const areas = base[sourceType] || base.mixed;
    if (/frontend|backend|full-stack|ui/i.test(task)) return [...areas, "frontend/backend flow map where relevant"];
    return areas;
  }

  function optionalSourceAreas(sourceType, task) {
    const out = ["examples/tutorials", "troubleshooting", "security policy", "license/contributing notes"];
    if (/issue|bug|compat|current/i.test(task)) out.push("issues/PRs/maintainer comments");
    if (/download|security|installer/i.test(task)) out.push("redirect/reputation/checksum/signature evidence");
    return out;
  }

  function formatResearchStrategy(plan) { return `vnem_build_research_strategy: current=${plan.currentness_required} official=${plan.official_docs_required} claims=${plan.claims_to_verify.length} core_executes_tools=false`; }
  function formatSourceIngestionPlan(plan) { return `vnem_build_source_ingestion_plan: ${plan.source_type} targets=${plan.source_targets.length} actions=${plan.Tools_MCP_actions_needed.length} core_executes_tools=false`; }
  function formatResearchEvidenceAudit(audit) { return `vnem_research_evidence_audit: ${audit.classification}; rejections=${audit.rejections.length} core_executes_tools=false`; }


  function buildCorePermissionProfilePlan(task, known = "", selectedTools = []) {
    const text = normalize(`${task} ${known} ${selectedTools.join(" ")}`);
    const actionMap = [
      [/apply_patch|patch|edit|write|create file|delete file/, "apply_patch"],
      [/restore/, "restore_backup"],
      [/run_project_task|\btest\b|validate|lint|typecheck|command/, "run_test"],
      [/\bbuild\b|dashboard:build/, "run_build"],
      [/start_dev_server|dev server|localhost|preview/, "start_dev_server"],
      [/browser_capture|screenshot|visual proof|browser proof/, "browser_capture"],
      [/git_commit|commit/, "local_commit"],
      [/install|audit fix|package install|npm install|pnpm add|yarn add/, "package_install"],
      [/github|pull request|\bpr\b|issue|release/, "github_pr"],
      [/api_request|api call|external service/, "api_call"],
      [/fetch_url_text|web_search|external fetch|current search|url text/, "external_fetch"],
      [/download_safety|download/, "download_check"],
      [/secret|credential|\.env|api key|token/, "secret_read"],
      [/cookie|session|browser profile/, "cookie_session_access"],
      [/captcha|anti-bot bypass/, "captcha_bypass"],
      [/rm -rf|reset --hard|format|destructive shell/, "destructive_shell"],
      [/crawl|scrape all|whole pc/, "unrestricted_crawl"]
    ];
    const actions = [...new Set(actionMap.filter(([re]) => re.test(text)).map(([, action]) => action))];
    if (!actions.length && selectedTools.some((tool) => /workspace|read_many|code_search|dependency_scan/.test(tool))) actions.push("inspect_workspace");
    const blockedDangerous = actions.filter((a) => ["secret_read", "cookie_session_access", "captcha_bypass", "destructive_shell", "unrestricted_crawl"].includes(a));
    const writeActions = actions.filter((a) => ["apply_patch", "restore_backup", "local_commit"].includes(a));
    const devActions = actions.filter((a) => ["run_test", "run_build", "start_dev_server", "browser_capture", "api_call", "external_fetch", "download_check"].includes(a));
    const previewOnly = actions.filter((a) => ["package_install", "github_pr", "github_issue", "github_release"].includes(a));
    const requiredProfiles = new Set(["safe-readonly"]);
    if (devActions.length) requiredProfiles.add("safe-local-dev");
    if (writeActions.length) requiredProfiles.add("approved-writes");
    if (previewOnly.includes("package_install")) requiredProfiles.add("approved-installs");
    if (previewOnly.some((a) => a.startsWith("github"))) requiredProfiles.add("approved-github");
    const trustBoundaryLevel = blockedDangerous.length ? "6_blocked_dangerous_action" : previewOnly.some((a) => a.startsWith("github")) ? "4_external_account_action" : /secret|credential|token|\.env/.test(text) ? "3_sensitive_local_information" : writeActions.length || devActions.length ? "2_local_project_information" : "0_public_information";
    const approval = [...writeActions, ...devActions].map((action) => ({ action, approval_required: true, permission_profile_needed: writeActions.includes(action) ? "approved-writes" : "safe-local-dev or stronger" }));
    const blockedByDefault = [
      ...writeActions.map((action) => ({ action, blocked_under_default_profile: "safe-readonly", safe_alternative: "run dry-run/action-policy preview, then ask for approved-writes with explicit approval" })),
      ...devActions.map((action) => ({ action, blocked_under_default_profile: "safe-readonly", safe_alternative: "run permission preview, then ask for safe-local-dev or stronger with explicit approval" })),
      ...previewOnly.map((action) => ({ action, blocked_under_current_build: true, safe_alternative: "preview/planned only; do not claim package install or GitHub mutation occurred" })),
      ...blockedDangerous.map((action) => ({ action, hard_blocked: true, safe_alternative: "do not perform; use redacted user-provided excerpts or public/source-safe alternatives" }))
    ];
    return {
      active_profile_expected_default: "safe-readonly",
      required_permission_profile: requiredProfiles.has("approved-writes") ? "approved-writes" : requiredProfiles.has("safe-local-dev") ? "safe-local-dev" : "safe-readonly",
      required_profiles: [...requiredProfiles],
      trust_boundary_level: trustBoundaryLevel,
      actions_requiring_approval: approval,
      actions_blocked_by_current_profile: blockedByDefault,
      blocked_or_preview_only_actions: [...previewOnly, ...blockedDangerous],
      safe_alternative: blockedByDefault.length ? "Use vnem_tools_permission_status and vnem_tools_action_policy_preview first; ask for exact profile/approval; keep package/GitHub/destructive/secret actions blocked or preview-only." : "Use safe-readonly inspection first and collect evidence before claiming action results.",
      must_not_claim: ["Tools actions were allowed or executed without permission status/policy preview evidence.", "Package installs or GitHub mutation happened unless an implemented Tools tool proves it.", "Secrets/cookies/sessions/CAPTCHA/destructive shell were accessed or bypassed."]
    };
  }

  function augmentCompletionAuditForPermissions(result, args = {}) {
    const text = normalize(`${args.task || ""} ${args.claimed_result || ""} ${JSON.stringify(args.evidence || "")}`);
    const plan = buildCorePermissionProfilePlan(args.task || "", `${args.claimed_result || ""} ${JSON.stringify(args.evidence || "")}`, []);
    const flags = [];
    if (/install|npm install|pnpm add|yarn add/.test(text) && !/(npm install|pnpm add|yarn add).*(exit|passed|evidence)|installed.*evidence/.test(text)) flags.push("package install claim needs implemented Tools/evidence; current Tools support is preview/blocked only");
    if (/github|pull request|\bpr\b|issue|release/.test(text) && !/(gh |github api|pull request url|issue url|run id|evidence)/.test(text)) flags.push("GitHub mutation claim needs explicit external evidence; Tools MCP does not silently mutate GitHub");
    if (/permission|approved|safe|allowed/.test(text) && !/(permission_status|action_policy_preview|approval_note|approved=true)/.test(text)) flags.push("permission/approval claim lacks Tools permission-status or action-policy-preview evidence");
    if (!flags.length && plan.blocked_or_preview_only_actions.length) flags.push("review blocked/preview-only permission actions before final claim");
    return {
      ...result,
      permission_audit: { permission_profile_plan: plan, audit_flags: flags, core_still_plan_only: true },
      must_not_claim: [...new Set([...(result.must_not_claim || []), ...plan.must_not_claim])],
      missing_evidence: [...new Set([...(result.missing_evidence || []), ...flags])]
    };
  }

  function augmentCompletionAuditForResearch(result, args = {}) {
    const audit = buildResearchEvidenceAudit({ task: args.task || "", conclusion: args.claimed_result || "", evidence_items: Array.isArray(args.evidence) ? args.evidence : [] });
    const flags = audit.rejections.map((item) => `research/source evidence audit: ${item}`);
    return {
      ...result,
      research_evidence_audit: audit,
      must_not_claim: [...new Set([...(result.must_not_claim || []), ...audit.must_not_claim])],
      missing_evidence: [...new Set([...(result.missing_evidence || []), ...flags])]
    };
  }


  function inferCoreToolTaskType(text) {
    const t = String(text || "").toLowerCase();
    if (/\b(latest|current|today|this week|news|recent|now)\b.*\b(research|find|compare|what|which|source|browser|mcp)\b|\b(research|find)\b.*\b(latest|current|today|this week|news|recent|now)\b/.test(t)) return "current_research";
    if (/https?:\/\/[^\s]+/.test(t) && /research|source|claim|citation|analy[sz]e|summarize|docs|url|page/.test(t)) return "direct_url_source";
    if (/website|web page|page structure|browser tools|understand.+page|links|forms|headings|dom|readability/.test(t) && !/local|dashboard|ui|frontend|improve|fix/.test(t)) return "website_understanding";
    if (/research|source|claim|citation|paper|docs url|provided source|summarize.+source/.test(t)) return "research";
    if (/debug|bug|failing|stack trace|error|root cause|regression/.test(t)) return "debugging";
    if (/ui|frontend|browser|visual|page|dashboard|rendered|web app|accessibility|snapshot/.test(t)) return "ui_web";
    if (/investigate|inspect|find references|where is|file investigation|understand/.test(t)) return "file_investigation";
    if (/security|secret|credential|risk|safety|audit/.test(t)) return "security_sensitive";
    if (/modify|patch|edit|local project|repo|code|test|build|implement|improve|fix/.test(t)) return "coding";
    return "coding";
  }

  function directUrlPresent(text) {
    return /https?:\/\/[^\s]+/i.test(text);
  }

  function missingToolPlanQuestions(type, task) {
    if (["research", "direct_url_source", "website_understanding"].includes(type)) return ["Which direct source URLs, local files, or source excerpts should be evaluated?", "Does the answer require broad current web search outside Tools MCP?"];
    if (type === "current_research") return ["Which approved external current-search path should be used outside Tools MCP?", "Which direct sources should be inspected after discovery?"];
    if (type === "ui_web") return ["Which local dev command and URL should be used for visual/static page proof?", "Which page/state proves the change?"];
    if (type === "debugging") return ["What exact command/log/error reproduces the failure?", "What is the smallest targeted check for the fix?"];
    return ["What is the project root?", "Which checks define done?", "Should Tools create a local commit after approval?"];
  }

  function verificationForType(type) {
    if (["research", "direct_url_source", "website_understanding", "current_research"].includes(type)) return ["Evaluate source quality for each source.", "Separate supported, unsupported, and conflicting claims.", "State missing sources and do not claim a web search happened unless done outside Tools MCP with evidence."];
    if (type === "debugging") return ["Capture failing output first.", "Run targeted failing check after patch.", "Run only broader checks near final."];
    if (type === "ui_web") return ["Run safe project tests/build.", "Start local dev server if needed.", "Use page inspect/a11y/snapshot comparison and capture localhost/file browser proof or report browser_unavailable honestly."];
    return ["Run safe project task checks from package.json.", "Review git diff summary.", "Finish session evidence with safe-to-claim/must-not-claim."];
  }

  function doneDefinitionForType(type) {
    if (["research", "direct_url_source", "website_understanding", "current_research"].includes(type)) return ["Brief cites provided/direct sources", "unsupported/conflicting claims are listed", "must-not-claim prevents fake search/currentness", "external current search need is explicit when latest/current info is required"];
    if (type === "ui_web") return ["Relevant UI route/component files inspected", "component is proven rendered by a route/caller", "console/network/a11y and responsive viewport evidence collected", "empty/loading/error states checked when relevant", "before/after screenshot proof captured for visual fixes or browser_unavailable stated honestly", "targeted checks pass"];
    return ["Relevant files inspected", "approved patch/evidence exists if mutation happened", "targeted checks pass", "session evidence supports final claims"];
  }

  function efficiencyForType(type) {
    const base = ["Use workspace_map/project_scan before broad file reads.", "Search first, then read bounded relevant files.", "Run targeted checks during development; broad checks only near final."];
    if (["research", "direct_url_source", "website_understanding"].includes(type)) base.push("Use direct approved URLs/provided HTML/text first; build source packs instead of dumping entire pages.");
    if (type === "current_research") base.push("Do not burn tokens on stale provided sources for latest/current questions; use approved external current search outside Tools MCP, then inspect direct sources.");
    if (type === "ui_web") base.push("Use static page inspect/a11y/snapshot comparison before optional screenshot proof to reduce browser/runtime cost without losing evidence.");
    return base;
  }

  function sourceQualityRequirements(type) {
    if (!["research", "direct_url_source", "website_understanding", "current_research"].includes(type)) return [];
    return ["Prefer official/primary sources when available.", "Track whether each source was actually fetched/read or only provided as metadata.", "Separate supported, unsupported, and conflicting claims.", "Do not claim currentness without current search evidence."];
  }

  function browserUnderstandingLimits(type) {
    if (!["ui_web", "direct_url_source", "website_understanding", "current_research", "research"].includes(type)) return [];
    return ["Static page intelligence is not full unrestricted browser automation.", "DOM/search/readability/link/a11y tools do not execute JavaScript or certify visual behavior.", "Link map does not follow links or crawl.", "Browser capture is local file/localhost proof only by default and may return browser_unavailable."];
  }

  function currentResearchRequired(type, text) {
    if (type === "current_research") return ["The task asks for latest/current/recent information; external current web search is required outside Tools MCP until a safe approved search provider exists."];
    if (/\b(latest|current|today|this week|news|recent|now)\b/i.test(text) && ["research", "direct_url_source", "website_understanding"].includes(type)) return ["Currentness is requested; use external current search outside Tools MCP before final claims."];
    return [];
  }

  function purposeForTool(tool, type) {
    const map = {
      vnem_tools_manifest: "discover available Tools MCP capabilities and safety metadata",
      vnem_tools_start_session: "start one evidence pack",
      vnem_tools_finish_session: "finish one evidence pack with safe-to-claim and must-not-claim lines",
      vnem_tools_workspace_map: "understand local project structure safely",
      vnem_tools_code_search: "find relevant code without broad file reads",
      vnem_tools_read_many_files: "load bounded relevant file context",
      vnem_tools_project_scan: "inspect scripts/frameworks/safe commands",
      vnem_tools_app_inspect: "inspect app boundaries, routes, APIs, data flow, states, and adapter support",
      vnem_tools_app_vertical_slice_plan: "preview a coherent marker-backed frontend/API/domain transaction",
      vnem_tools_app_vertical_slice_apply: "apply an approved hash-bound app transaction with rollback evidence",
      vnem_tools_app_acceptance_run: "prove focused checks and a real desktop/mobile localhost user path",
      vnem_tools_app_transaction_rollback: "restore an app transaction without overwriting later edits",
      vnem_tools_dependency_scan: "inspect dependencies and risky scripts without installs",
      vnem_tools_fetch_url_text: "fetch one approved direct URL text/source, not search results",
      vnem_tools_browser_page_inspect: "browser/page source intelligence: turn direct/local/provided page content into structured understanding",
      vnem_tools_browser_readability_extract: "browser/page readability: extract heuristic readable article/docs/main content",
      vnem_tools_browser_link_map: "browser/page link mapping: map links without following or crawling",
      vnem_tools_browser_dom_search: "browser/page DOM search: search page headings/forms/buttons/links/text statically",
      vnem_tools_browser_accessibility_audit: "run static heuristic accessibility/UI audit",
      vnem_tools_browser_compare_snapshots: "compare before/after page snapshots without visual overclaims",
      vnem_tools_source_quality_check: "score/flag source quality and citation limits",
      vnem_tools_research_brief: "summarize supported and unsupported claims from source excerpts",
      vnem_tools_browser_research_pack: "combine multiple source/page summaries into a claim evidence pack",
      vnem_tools_search_provider_manifest: "show available/configured search providers without exposing API keys",
      vnem_tools_search_query_builder: "build strong search queries before approved provider search",
      vnem_tools_web_search: "run approved provider search if configured, or return honest unavailable status",
      vnem_tools_search_result_ranker: "rank result usefulness, freshness, credibility, duplicate clusters, and risk",
      vnem_tools_redirect_chain_check: "check redirects safely without cookies/session/login or blind following",
      vnem_tools_url_reputation_check: "detect phishing/scam/download/credential URL risk heuristically",
      vnem_tools_captcha_detector: "detect CAPTCHA/access-block pages and require safe user-assisted handoff; no bypass",
      vnem_tools_download_safety_check: "assess download link risk before following/downloading; no installer execution",
      vnem_tools_claim_source_matrix: "map claims to supporting/conflicting/missing source evidence",
      vnem_tools_research_gap_detector: "find missing current/primary/counter/date/version evidence before confident answer",
      vnem_tools_apply_patch_batch: "dry-run/apply approved local file changes",
      vnem_tools_run_project_task: "run approved safe project checks",
      vnem_tools_start_dev_server: "start approved localhost dev server for proof",
      vnem_tools_browser_capture: "capture approved local/localhost screenshot proof when available",
      vnem_tools_browser_interaction_run: "execute bounded approved browser actions and collect runtime UI evidence",
      vnem_tools_browser_evidence_compare: "compare matching visual, DOM, and accessibility evidence-pack snapshots",
      vnem_tools_stop_dev_server: "stop only Tools-started dev servers",
      vnem_tools_git_status: "read local git status",
      vnem_tools_git_diff_summary: "summarize final local diff"
    };
    return map[tool] || `support ${type} workflow`;
  }

  function expectedEvidenceForTool(tool) {
    if (/workspace_map/.test(tool)) return ["tree summary", "skipped secret/build paths"];
    if (/read_many|code_search|find_references/.test(tool)) return ["file paths", "redacted snippets", "caps/skips"];
    if (/dependency_scan/.test(tool)) return ["manifest scripts", "risky script flags", "no install"];
    if (/browser_page_inspect/.test(tool)) return ["title/headings/counts", "main text excerpt", "risk/quality flags", "evidence log"];
    if (/browser_readability/.test(tool)) return ["heuristic readable excerpt", "content counts", "truncation flag"];
    if (/browser_link_map/.test(tool)) return ["internal/external/anchor/download/suspicious links", "must-not-claim no crawling"];
    if (/browser_dom_search/.test(tool)) return ["matches", "mode", "truncation flag"];
    if (/browser_accessibility/.test(tool)) return ["static a11y score", "issues/warnings/passes", "not certification"];
    if (/browser_compare/.test(tool)) return ["changed headings/text/links/forms", "no visual overclaim"];
    if (/browser_research_pack/.test(tool)) return ["source summaries", "supported/unsupported/conflicting claims", "citation plan"];
    if (/search_provider_manifest/.test(tool)) return ["configured/unconfigured providers", "no key values exposed"];
    if (/search_query_builder/.test(tool)) return ["queries", "source type targets", "must-not-claim no search executed"];
    if (/web_search/.test(tool)) return ["provider status", "executed flag", "results or unavailable reason", "evidence log"];
    if (/search_result_ranker/.test(tool)) return ["ranked/best/weak/risky sources", "duplicate clusters", "next queries"];
    if (/redirect_chain/.test(tool)) return ["redirect chain", "cross-domain/suspicious redirects", "blocked reason"];
    if (/url_reputation/.test(tool)) return ["risk flags", "trust flags", "recommended action"];
    if (/captcha_detector/.test(tool)) return ["captcha/block signals", "safe user-assisted handoff", "no-bypass statement"];
    if (/download_safety/.test(tool)) return ["file type guess", "download risk flags", "manual review recommendation"];
    if (/claim_source_matrix/.test(tool)) return ["claim/source matrix", "supported/unsupported/conflicting claims", "citation plan"];
    if (/research_gap/.test(tool)) return ["missing source types", "current/primary/counter/date blockers", "next tools/queries"];
    if (/patch/.test(tool)) return ["changed files", "diff summary", "backups", "restore plan"];
    if (/run_project_task/.test(tool)) return ["command", "exit code", "redacted output"];
    if (/browser_capture/.test(tool)) return ["screenshot path/hash or browser_unavailable"];
    if (/browser_interaction/.test(tool)) return ["structured action results", "before/after screenshot hashes and pixel delta", "DOM/accessibility snapshots", "console/network status", "viewport/state coverage", "browser process/profile cleanup"];
    if (/browser_evidence_compare/.test(tool)) return ["matching/unmatched scenario evidence", "pixel changes", "DOM/accessibility snapshot changes", "aesthetic correctness limitation"];
    if (/research|source|fetch/.test(tool)) return ["source quality", "text hash/excerpt", "must-not-claim"];
    if (/session/.test(tool)) return ["session evidence pack"];
    return ["structured result"];
  }


  function assessResearchNeed(args = {}) {
    const task = String(args.task || "");
    const context = String(args.known_context || "");
    const domain = String(args.domain_hint || "");
    const hay = `${task} ${context} ${domain}`.toLowerCase();
    const freshness = Boolean(args.freshness_required || /\b(latest|current|today|this week|recent|now|news|meta|2026)\b/.test(hay));
    const directSourceEnough = /https?:\/\/\S+/.test(hay) && !freshness && !/compare|best|latest|current|news/.test(hay);
    const securityRisk = /security|malware|phishing|download|installer|scam|credential|cve|advisory/.test(hay);
    const captchaLikely = /captcha|cloudflare|access block|verify human|anti-bot|blocked/.test(hay);
    const uiVisual = /ui|visual|screenshot|browser proof|localhost|rendered|dashboard/.test(hay);
    const sourceTypes = [];
    if (/docs|library|api|software|mcp|package/.test(hay)) sourceTypes.push("official_source", "official_docs", "github_repo", "changelog_or_release_notes");
    if (/game|meta|build|pvp|pve|modding|mod/.test(hay)) sourceTypes.push("official_source", "community_source", "version_or_patch_notes");
    if (securityRisk) sourceTypes.push("official_source", "security_advisory", "url_reputation_or_malware_context");
    if (/compare|best|product|recommend/.test(hay)) sourceTypes.push("official_source", "independent_secondary_source", "counter_source");
    if (!sourceTypes.length) sourceTypes.push("official_source", "credible_secondary_source");
    const level = freshness || securityRisk ? "high" : directSourceEnough ? "medium" : "medium";
    return {
      task,
      research_need_level: level,
      freshness_requirement: { required: freshness, reason: freshness ? "Task asks for latest/current/recent or explicit freshness." : "No explicit currentness detected." },
      current_info_required: freshness,
      direct_source_enough: directSourceEnough,
      external_search_required: freshness || /find|research|compare|best|recommend|discover/.test(hay),
      official_source_required: true,
      community_source_useful: /game|meta|mod|community|reddit|forum/.test(hay),
      source_quality_risk: /medical|legal|financial|security|malware|download|best|current/.test(hay),
      malware_phishing_download_risk: securityRisk,
      captcha_access_block_likely: captchaLikely,
      ui_visual_proof_required: uiVisual,
      source_types_needed: [...new Set(sourceTypes)],
      selected_tools: researchPlanningToolsForText(hay),
      evidence_to_collect: ["provider manifest/configured provider status", "search query plan", freshness ? "provider-backed search evidence or unavailable reason" : null, "ranked sources", "source quality checks", "claim/source matrix", "research gaps", securityRisk ? "URL/reputation/download/redirect risk checks" : null, captchaLikely ? "CAPTCHA/access-block detection and user-assisted handoff" : null].filter(Boolean),
      must_not_claim: ["Core executed Tools.", "A web search happened before provider evidence exists.", "Current/latest facts are verified without current provider/search evidence.", "CAPTCHA was bypassed automatically.", "Downloads/installers were run or proven safe."],
      core_executes_tools: false,
      web_search_executed: false
    };
  }

  function buildSearchPlan(args = {}) {
    const assessment = assessResearchNeed(args);
    const queryPlan = buildCoreSearchQueries(args.task || "", args.domain_hint || "", assessment.freshness_requirement.required, assessment.source_types_needed, args.known_context || "");
    const selected = [...new Set(["vnem_tools_search_provider_manifest", "vnem_tools_search_query_builder", "vnem_tools_web_search", "vnem_tools_search_result_ranker", "vnem_tools_source_quality_check", "vnem_tools_claim_source_matrix", "vnem_tools_research_gap_detector", ...(assessment.malware_phishing_download_risk ? ["vnem_tools_url_reputation_check", "vnem_tools_redirect_chain_check", "vnem_tools_download_safety_check", "vnem_tools_captcha_detector"] : [])])];
    return {
      task: args.task,
      research_need_level: assessment.research_need_level,
      freshness_requirement: assessment.freshness_requirement,
      selected_tools: selected,
      tool_sequence: selected.map((tool) => ({ tool, purpose: purposeForTool(tool, "research"), dry_run_first: /web_search|redirect|download/.test(tool), requires_approval: /web_search|redirect|download/.test(tool), expected_evidence: expectedEvidenceForTool(tool) })),
      search_queries: queryPlan.queries,
      query_intents: queryPlan.query_intents,
      source_types_needed: assessment.source_types_needed,
      approval_required_steps: ["vnem_tools_web_search: real provider search requires configured provider plus explicit approval.", "vnem_tools_redirect_chain_check/vnem_tools_download_safety_check: real HEAD/network preflight requires approval."],
      captcha_handling_plan: captchaHandlingPlan(),
      download_safety_plan: downloadSafetyPlan(),
      evidence_to_collect: assessment.evidence_to_collect,
      must_not_claim: assessment.must_not_claim,
      done_definition: ["Provider status is known; unavailable providers are reported honestly.", "Search results are ranked before source reading.", "Claims are mapped to sources with unsupported/conflicting claims listed.", "Research gaps are closed or explicitly reported."],
      fallbacks_if_search_or_browser_unavailable: ["Use direct URLs/provided source text from the user.", "Use official docs/API/repository supplied by user.", "Say provider_unconfigured/provider_unavailable; do not invent results."],
      core_executes_tools: false,
      web_search_executed: false
    };
  }

  function buildBrowsingPlan(args = {}) {
    const assessment = assessResearchNeed({ ...args, domain_hint: `${args.known_context || ""} browsing risk` });
    const selected = [...new Set(["vnem_tools_redirect_chain_check", "vnem_tools_url_reputation_check", "vnem_tools_captcha_detector", "vnem_tools_download_safety_check", "vnem_tools_fetch_url_text", "vnem_tools_browser_page_inspect", "vnem_tools_browser_readability_extract", "vnem_tools_browser_link_map", "vnem_tools_source_quality_check", "vnem_tools_claim_source_matrix", "vnem_tools_research_gap_detector"] )];
    return {
      task: args.task,
      research_need_level: assessment.research_need_level,
      freshness_requirement: assessment.freshness_requirement,
      selected_tools: selected,
      tool_sequence: selected.map((tool) => ({ tool, purpose: purposeForTool(tool, "browsing_risk"), dry_run_first: /redirect|download|fetch|browser_page|browser_readability|browser_link/.test(tool), requires_approval: /redirect|download|fetch|browser_page|browser_readability|browser_link/.test(tool), expected_evidence: expectedEvidenceForTool(tool) })),
      search_queries: buildCoreSearchQueries(args.task || "", "browsing safety", assessment.freshness_requirement.required, assessment.source_types_needed, args.known_context || "").queries,
      source_types_needed: assessment.source_types_needed,
      approval_required_steps: ["Direct external fetch/page inspection/redirect/download HEAD requires explicit approval.", "Do not access private/account pages unless the user confirms authorization and provides safe content/access path."],
      captcha_handling_plan: captchaHandlingPlan(),
      download_safety_plan: downloadSafetyPlan(),
      evidence_to_collect: ["redirect chain/blocked reason", "URL reputation flags", "CAPTCHA/access-block signals", "download safety risk flags", "page/source inspection evidence", "source quality and claim/source matrix"],
      must_not_claim: ["Core executed Tools.", "A page was visually verified when only static HTML/source was inspected.", "A web search happened before provider evidence exists.", "CAPTCHA was bypassed automatically.", "A file was downloaded or installer was run.", "A suspicious URL/download is safe without review."],
      done_definition: ["Redirect/download/CAPTCHA risks are explicitly classified.", "Suspicious pages are not treated as normal trustworthy sources.", "If blocked by CAPTCHA/access control, safe user-assisted handoff or alternate sources are listed."],
      fallbacks_if_search_or_browser_unavailable: ["Ask the user to paste page text after access.", "Use official docs/API/repository mirrors.", "Stop and report access blocked; do not bypass CAPTCHA."],
      core_executes_tools: false,
      web_search_executed: false
    };
  }

  function buildCoreSearchQueries(task, domainHint, freshnessRequired, sourceTypes, context) {
    const hay = `${task} ${domainHint} ${context}`.toLowerCase();
    const base = String(task || "research task").replace(/https?:\/\/\S+/g, "").trim();
    const queries = [];
    const intents = [];
    const add = (q, intent) => { if (q && !queries.includes(q)) { queries.push(q); intents.push({ query: q, intent }); } };
    add(`${base} official docs`, "official source");
    if (freshnessRequired) add(`${base} latest current ${new Date().getUTCFullYear()}`, "fresh/current source");
    if (/security|malware|phishing|download|cve|advisory/.test(hay)) add(`${base} security advisory CVE phishing malware`, "security/reputation source");
    if (/github|repo|code|mcp|library|api/.test(hay)) add(`${base} site:github.com releases issues`, "repository/release source");
    if (/game|meta|mod/.test(hay)) add(`${base} official patch notes current meta community`, "game/modding current source");
    add(`${base} limitations risks`, "counter-source / limitations");
    return { queries: queries.slice(0, 8), query_intents: intents.slice(0, 8), source_types_needed: sourceTypes };
  }

  function researchPlanningToolsForText(hay) {
    const tools = ["vnem_tools_search_provider_manifest", "vnem_tools_search_query_builder", "vnem_tools_web_search", "vnem_tools_search_result_ranker", "vnem_tools_source_quality_check", "vnem_tools_claim_source_matrix", "vnem_tools_research_gap_detector"];
    if (/download|installer|redirect|captcha|phishing|malware|scam|credential|security/.test(hay)) tools.push("vnem_tools_redirect_chain_check", "vnem_tools_url_reputation_check", "vnem_tools_captcha_detector", "vnem_tools_download_safety_check");
    if (/page|url|website|source|docs/.test(hay)) tools.push("vnem_tools_fetch_url_text", "vnem_tools_browser_page_inspect", "vnem_tools_browser_research_pack");
    return [...new Set(tools)];
  }
  function captchaHandlingPlan() { return ["Detect CAPTCHA/access-block pages with vnem_tools_captcha_detector.", "No automatic CAPTCHA bypass was attempted or provided.", "Ask user to solve CAPTCHA manually only if authorized, then paste page text/source or provide allowed access evidence.", "Use official API/docs/source or alternate official mirror when available.", "Stop and report blocked access when no allowed path exists."]; }
  function downloadSafetyPlan() { return ["Do not download or run installers automatically.", "Use vnem_tools_download_safety_check before following download links.", "Use approved HEAD metadata only when needed.", "Require manual review, official source, checksum/signature, and user confirmation for risky downloads."]; }
  function formatResearchNeedAssessment(a) { return `vnem_assess_research_need: ${a.research_need_level} current=${a.current_info_required} external_search=${a.external_search_required}`; }
  function formatSearchPlan(plan) { return `vnem_build_search_plan: tools=${plan.selected_tools.join(", ")} queries=${plan.search_queries.length} core_executes_tools=false`; }
  function formatBrowsingPlan(plan) { return `vnem_build_browsing_plan: tools=${plan.selected_tools.join(", ")} core_executes_tools=false`; }

  function formatBrowserResearchPlan(plan) {
    return [`vnem_build_browser_research_plan: ${plan.task_type}`, `Tools: ${plan.selected_tools.join(", ")}`, `External current search required: ${plan.when_external_web_search_is_required.length ? "yes" : "no"}`, "Core executes tools: false"].join("\n");
  }

  function formatToolsChain(chain) {
    return [`vnem_explain_tools_chain: ${chain.task_type}`, `Steps: ${chain.chain.map((step) => step.tool).join(" -> ")}`, "Core executes tools: false"].join("\n");
  }

  function compactCoreToolsPlan(plan) {
    return {
      task_type: plan.task_type,
      selected_tools: plan.selected_tools.slice(0, 12),
      tool_sequence: plan.tool_sequence.slice(0, 8).map((step) => ({ tool: step.tool, purpose: step.purpose, dry_run_first: step.dry_run_first, requires_approval: step.requires_approval })),
      dry_run_steps: plan.dry_run_steps.slice(0, 6),
      approval_required_steps: plan.approval_required_steps.slice(0, 6),
      evidence_to_collect: plan.evidence_to_collect.slice(0, 8),
      verification_plan: plan.verification_plan.slice(0, 5),
      must_not_claim: plan.must_not_claim.slice(0, 6),
      done_definition: plan.done_definition.slice(0, 5),
      efficiency_guidance: plan.efficiency_guidance.slice(0, 5),
      core_tools_handoff: plan.core_tools_handoff,
      core_executes_tools: false
    };
  }

  function formatCoreToolSelection(selection) {
    return [`vnem_select_tools_for_task: ${selection.task_type}`, `Tools: ${selection.selected_tools.join(", ")}`, `Core executes tools: ${selection.core_executes_tools}`].join("\n");
  }

  function formatCoreToolsPlan(plan) {
    return [`vnem_build_tools_plan: ${plan.task_type}`, `Steps: ${plan.tool_sequence.map((step) => step.tool).join(" -> ")}`, "Core executes tools: false"].join("\n");
  }

  return {
    assessResearchNeed,
    augmentCompletionAuditForPermissions,
    augmentCompletionAuditForResearch,
    buildAntiStagnationCheck,
    buildArchitectureMap,
    buildBrowserResearchPlan,
    buildBrowsingPlan,
    buildCodeChangeContract,
    buildCompactOutputContract,
    buildCoreRoutingRecord,
    buildCoreToolsPlan,
    buildDebuggingPlan,
    buildDesignAmbitionPlan,
    buildDesignDirectionSelector,
    buildEffortBudget,
    buildEvidenceToFixCheck,
    buildFastAnswerContract,
    buildOutputQualityPlan,
    buildRedesignComparisonScorecard,
    buildResearchEvidenceAudit,
    buildResearchStrategy,
    buildSearchPlan,
    buildSourceIngestionPlan,
    buildTotalImpactDesignPlan,
    buildUiQualityPlan,
    buildVisualProofContract,
    buildVisualTasteAudit,
    compactAdaptiveEffort,
    compactCoreToolsPlan,
    compactDesignBehavior,
    compactOutputQualityPlan,
    compactRoutingRecord,
    explainToolsChain,
    formatAntiStagnationCheck,
    formatArchitectureMap,
    formatBrowserResearchPlan,
    formatBrowsingPlan,
    formatCodeChangeContract,
    formatCompactOutputContract,
    formatCoreRoutingRecord,
    formatCoreToolSelection,
    formatCoreToolsPlan,
    formatDebuggingPlan,
    formatDesignAmbitionPlan,
    formatDesignDirectionSelector,
    formatEffortBudget,
    formatEvidenceToFixCheck,
    formatFastAnswerContract,
    formatOutputQualityPlan,
    formatRedesignComparisonScorecard,
    formatResearchEvidenceAudit,
    formatResearchNeedAssessment,
    formatResearchStrategy,
    formatSearchPlan,
    formatSourceIngestionPlan,
    formatToolsChain,
    formatTotalImpactDesignPlan,
    formatUiQualityPlan,
    formatVisualProofContract,
    formatVisualTasteAudit,
    selectToolsForTask
  };
}
