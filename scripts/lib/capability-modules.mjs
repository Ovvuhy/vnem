import { createHash } from "node:crypto";
import { recommendApis, recommendSkills, reviewCapability } from "./super-library.mjs";
import { getAgentProfile } from "./agent-profiles.mjs";
import { buildDomainQualityContracts, classifyDomains, detectMissingContext } from "./quality-contracts.mjs";

const TOKEN_BUDGETS = new Set(["compact", "normal", "expanded"]);

export function getRequiredCapabilities(library, agentProfiles, options = {}) {
  const task = String(options.task || "").trim();
  const tokenBudget = normalizeBudget(options.token_budget);
  const maxModules = clampNumber(options.max_modules, 5, 1, 8);
  const taskTypes = inferCoreTaskTypes(task, options.project_context);
  const profile = getAgentProfile(agentProfiles, { agent_client: options.agent_client || "unknown", model_family: options.model_family, task, token_budget: "compact" });
  const workflowModules = selectWorkflowModules(taskTypes, task, tokenBudget);
  const skillModules = skillModulesForTask(library, options, taskTypes, tokenBudget);
  const apiModules = apiModulesForTask(library, options, taskTypes, tokenBudget);
  const selected = dedupeModules([...workflowModules, ...skillModules, ...apiModules]).slice(0, maxModules);
  const optional = options.include_optional ? dedupeModules([...skillModules, ...apiModules, ...workflowModules].slice(maxModules)).slice(0, 3) : [];
  return {
    task,
    task_types: taskTypes,
    agent_profile_id: profile.profile_id,
    token_budget: tokenBudget,
    required_modules: selected,
    optional_modules: optional,
    selection_policy: "Select the few modules needed for the user's real task; return IDs for deeper lookup instead of dumping the library.",
    self_focus_policy: selfFocusPolicy(task),
    estimated_token_impact: tokenBudget === "compact" ? "low: compact module contracts only" : tokenBudget === "normal" ? "moderate: selected details only" : "higher: expanded details requested",
    deeper_lookup_ids: selected.map((module) => module.full_detail_uri || module.id),
    library_dump_count: selected.filter((module) => module.kind === "skill").length,
    api_dump_count: selected.filter((module) => module.kind === "api").length,
    safety_boundaries: coreSafetyBoundaries()
  };
}

export function activateCapabilityPack(library, agentProfiles, options = {}) {
  const required = getRequiredCapabilities(library, agentProfiles, {
    ...options,
    max_modules: options.selected_capability_ids?.length ? Math.max(options.selected_capability_ids.length, 1) : options.max_modules || 5,
    include_optional: false
  });
  const selectedIds = Array.isArray(options.selected_capability_ids) && options.selected_capability_ids.length
    ? new Set(options.selected_capability_ids)
    : null;
  const selected = selectedIds ? required.required_modules.filter((module) => selectedIds.has(module.id)) : required.required_modules;
  const modules = selected.length ? selected : required.required_modules;
  return {
    activation_id: `vnem-cap-${shortHash([options.task, options.agent_client, modules.map((module) => module.id).join("|")].join("::"))}`,
    task: required.task,
    agent_profile_id: required.agent_profile_id,
    token_budget: required.token_budget,
    selected_capability_modules: modules,
    compact_required_instructions: modules.flatMap((module) => module.compact_instructions || []).slice(0, instructionLimit(required.token_budget)),
    required_checks: unique(modules.flatMap((module) => module.verification_requirements || [])).slice(0, 10),
    evidence_requirements: unique(modules.flatMap((module) => module.required_evidence || [])).slice(0, 10),
    forbidden_claims_actions: unique([
      "Do not claim completion without evidence from the selected modules.",
      "Do not install skills, execute scripts, call APIs, write files, or run terminal commands from VNEM Core MCP.",
      ...modules.flatMap((module) => module.what_not_to_do || [])
    ]).slice(0, 10),
    usage_proof_fields: ["activation_id", "capability_ids_used", "instructions_applied", "checks_run", "evidence", "skipped_modules_with_reason", "remaining_risks"],
    completion_audit_expectations: {
      capability_ids_used: "List every selected capability module used or explicitly skipped.",
      evidence: "Provide concrete test/build/review evidence for each required module.",
      skipped_modules: "If a required module was skipped, mark completion incomplete unless the user explicitly waived it."
    },
    if_skipped_mark_incomplete: modules.map((module) => `${module.id}: missing evidence should mark the task incomplete.`),
    next_vnem_calls: ["vnem_compose_capability_contract", "vnem_quality_gate", "vnem_review_skill_or_api"],
    safety_boundaries: coreSafetyBoundaries(),
    self_focus_policy: required.self_focus_policy
  };
}

export function applySkillGuidance(library, options = {}) {
  const skill = library.skills.find((entry) => entry.id === options.skill_id || entry.name === options.skill_id);
  if (!skill) {
    return {
      skill_id: options.skill_id,
      found: false,
      core_mcp_can_apply_guidance: false,
      precision_tools_required_for_install_or_execution: true,
      error: "No matching skill capability record found."
    };
  }
  const tokenBudget = normalizeBudget(options.token_budget);
  const module = skillToModule(skill, options.task || "", tokenBudget);
  const review = reviewCapability(library, { id: skill.id, kind: "skill", task: options.task, risk_tolerance: "low" });
  return {
    skill_id: skill.id,
    skill_name: skill.name,
    found: true,
    source: skill.source,
    source_url: skill.source_url,
    imported_from: skill.imported_from,
    compact_applicable_instructions: module.compact_instructions,
    incompatible_contexts: skill.avoid_with || [],
    required_evidence: module.required_evidence,
    manual_review_warning: "VNEM Core MCP applies compact guidance only; it does not install this skill, execute scripts, or trust external instructions without review.",
    core_mcp_can_apply_guidance: true,
    precision_tools_required_for_install_or_execution: true,
    risk_flags: skill.risk_flags || [],
    review_verdict: review.verdict,
    next_safety_checks: review.next_safety_checks,
    token_budget: tokenBudget,
    full_detail_uri: `vnem://capabilities/skills/${encodeURIComponent(skill.id)}`
  };
}

export function buildApiIntegrationPlan(library, options = {}) {
  const tokenBudget = normalizeBudget(options.token_budget);
  const candidate = options.api_id ? library.apis.find((entry) => entry.id === options.api_id || entry.name === options.api_id) : null;
  const candidates = candidate
    ? [candidate]
    : recommendApis(library, {
        task: options.task,
        app_type: options.app_type || "unknown",
        frontend_only: Boolean(options.frontend_only),
        allow_api_keys: Boolean(options.allow_api_keys),
        allow_oauth: Boolean(options.allow_oauth),
        risk_tolerance: "low",
        limit: tokenBudget === "expanded" ? 5 : 3
      });
  const selected = candidates.map((entry) => apiPlanCandidate(entry)).slice(0, tokenBudget === "expanded" ? 5 : 3);
  const anySecret = selected.some((entry) => entry.secret_risk);
  const backendRequired = selected.some((entry) => entry.backend_required || entry.frontend_safe !== true);
  return {
    task: options.task,
    app_type: options.app_type || "unknown",
    frontend_only: Boolean(options.frontend_only),
    selected_api_candidates: selected,
    frontend_backend_safety_decision: backendRequired
      ? "backend_or_server_route_required_for_at_least_one_candidate"
      : "frontend_candidate_possible_after_current_docs_review",
    backend_proxy_requirement: backendRequired,
    env_var_guidance: anySecret || backendRequired
      ? ["Store API keys only in server-side environment variables.", "Never expose secret-bearing values to bundled frontend code."]
      : ["Even no-auth APIs need docs/terms/rate-limit review before use."],
    secret_handling_rules: [
      "Do not expose API keys in frontend code.",
      "Use backend/server routes for apiKey/OAuth/CORS-unsafe APIs.",
      "Do not commit secrets, sample real keys, or logs containing credentials."
    ],
    error_loading_rate_limit_requirements: ["Handle loading, empty, error, timeout, and quota/rate-limit states.", "Show user-safe errors without leaking secrets or raw provider internals."],
    test_plan: ["Unit-test response parsing and error paths with mocked API responses.", "Verify no API keys appear in client bundles or public config.", "If live testing is needed, use approved tools outside Core MCP."],
    evidence_requirements: ["Selected API id(s), auth/HTTPS/CORS decision, and frontend/backend boundary.", "Secret-handling proof and tests for success/error/loading states."],
    forbidden_unsafe_patterns: ["No frontend API keys.", "No live API calls from VNEM Core MCP.", "No claiming integration works without tests/evidence."],
    core_mcp_calls_api: false,
    precision_tools_required_for_live_call_or_mutation: true,
    token_budget: tokenBudget
  };
}

export function composeCapabilityContract(library, agentProfiles, options = {}) {
  const tokenBudget = normalizeBudget(options.token_budget);
  const required = getRequiredCapabilities(library, agentProfiles, { ...options, token_budget: tokenBudget, max_modules: options.max_modules || 5 });
  const profile = getAgentProfile(agentProfiles, { agent_client: options.agent_client || "unknown", model_family: options.model_family, task: options.task, token_budget: "compact" });
  const needsApi = required.task_types.includes("api_integration") || /api|weather|oauth|cors|integration/i.test(options.task || "");
  const api_plan = needsApi ? buildApiIntegrationPlan(library, { task: options.task, app_type: inferAppType(options.project_context), frontend_only: /frontend|browser|next|react/i.test(`${options.task} ${options.project_context}`), token_budget: tokenBudget }) : null;
  const missing_context = detectMissingContext({ task: options.task, project_context: options.project_context, token_budget: tokenBudget });
  const domain_quality_contracts = buildDomainQualityContracts({ task: options.task, project_context: options.project_context, token_budget: tokenBudget });
  const completion_audit_expectations = {
    required_evidence: unique([
      ...required.required_modules.flatMap((module) => module.required_evidence || []),
      ...domain_quality_contracts.flatMap((contract) => contract.required_evidence || [])
    ]).slice(0, tokenBudget === "expanded" ? 10 : 6),
    audit_tool: "vnem_completion_audit",
    incomplete_if: ["required evidence is missing", "required capability modules are skipped without waiver", "claims exceed proof"]
  };
  const protection_review_triggers = unique([
    "before filesystem/terminal/browser/GitHub/package actions",
    "before skill installation or script execution",
    "before API integration involving secrets/auth/CORS/network",
    "before game/modding file changes or external tool use"
  ]).slice(0, 6);
  const proof_trail_expectation = {
    tool: "vnem_proof_trail",
    required_fields: ["bootstrap_activation_id", "capability_ids_used", "completion_audit", "evidence_summary"],
    use_when: "After completion audit, before final answer."
  };
  return {
    task_summary: String(options.task || "").slice(0, 240),
    agent_profile_summary: {
      profile_id: profile.profile_id,
      display_name: profile.display_name,
      known_mcp_support_status: profile.known_mcp_support_status,
      confidence: profile.confidence,
      token_efficiency_tips: profile.token_efficiency_tips
    },
    required_capability_modules: required.required_modules,
    compact_instructions: required.required_modules.flatMap((module) => module.compact_instructions || []).slice(0, instructionLimit(tokenBudget)),
    api_plan,
    missing_context,
    domain_quality_contracts,
    risks: unique(required.required_modules.flatMap((module) => module.risks || [])).slice(0, 8),
    verification: unique(required.required_modules.flatMap((module) => module.verification_requirements || [])).slice(0, 8),
    completion_audit_expectations,
    protection_review_triggers,
    proof_trail_expectation,
    final_report_requirements: ["bootstrap_activation_id", "capability_ids_used", "proof_trail_id", "evidence_per_module", "missing_context_or_assumptions", "checks_run", "remaining_risks"],
    token_budget: tokenBudget,
    token_budget_estimate: tokenBudget === "compact" ? "compact: selected modules only; no full library/profile dump" : "selected details only; fetch full records by id if needed",
    deeper_lookup_ids: required.deeper_lookup_ids,
    self_focus_policy: required.self_focus_policy,
    library_dump_count: required.library_dump_count,
    api_dump_count: required.api_dump_count,
    safety_boundaries: coreSafetyBoundaries()
  };
}

export function boostTask(library, agentProfiles, options = {}) {
  const task = String(options.task || "").trim();
  const knownContext = String(options.known_context || options.project_context || "").trim();
  const constraints = arrayify(options.constraints);
  const tokenBudget = normalizeBudget(options.token_budget);
  const taskTypes = inferCoreTaskTypes(task, knownContext);
  const domains = classifyDomains(task, knownContext);
  const contract = composeCapabilityContract(library, agentProfiles, {
    task,
    agent_client: options.agent_client,
    model_family: options.model_family,
    project_context: knownContext,
    token_budget: tokenBudget,
    max_modules: tokenBudget === "expanded" ? 7 : 5
  });
  const required = getRequiredCapabilities(library, agentProfiles, {
    task,
    agent_client: options.agent_client,
    model_family: options.model_family,
    project_context: knownContext,
    token_budget: tokenBudget,
    max_modules: tokenBudget === "expanded" ? 7 : 5
  });
  const needsApi = taskNeedsApi(task, knownContext, domains);
  const selectedUsableApis = needsApi ? selectUsableApiPacks(library, task, domains, tokenBudget) : [];
  const apiPlan = needsApi ? buildApiIntegrationPlan(library, {
    task,
    app_type: inferAppType(`${task} ${knownContext}`),
    frontend_only: /frontend|browser|web app|react|next|widget|dashboard/i.test(`${task} ${knownContext}`),
    allow_api_keys: false,
    allow_oauth: false,
    token_budget: tokenBudget
  }) : null;
  const selectedUsableSkills = selectUsableSkillPacks(library, task, domains, taskTypes, tokenBudget);
  const selectedSkills = selectedUsableSkills.map((pack) => usableSkillGuidance(pack));
  const selectedApis = selectedUsableApis.map((pack) => usableApiGuidance(pack));
  const domainContracts = buildDomainQualityContracts({ task, project_context: knownContext, token_budget: tokenBudget });
  const missingContext = detectMissingContext({ task, project_context: knownContext, token_budget: tokenBudget });
  const toolsHandoff = buildToolsHandoff({ task, domains, selectedUsableApis, selectedUsableSkills, tokenBudget });
  const workflowSteps = buildBoostWorkflowSteps({ task, domains, apiPlan, selectedSkills, constraints, selectedUsableApis, selectedUsableSkills });
  const safetyRules = buildBoostSafetyRules({ domains, apiPlan, selectedUsableApis });
  const verificationPlan = buildBoostVerificationPlan({ domains, apiPlan, selectedUsableApis });
  const completionChecklist = buildBoostCompletionChecklist({ domains, apiPlan, selectedUsableApis, selectedUsableSkills });
  const mustNotClaim = unique([...buildBoostMustNotClaim({ domains, apiPlan }), ...(toolsHandoff.must_not_claim || [])]).slice(0, 12);
  const precisionNeeded = unique([...buildBoostPrecisionNeeds({ domains }), ...(toolsHandoff.blocked_until_tools_mcp || [])]).slice(0, 12);
  const proofTrailInputs = {
    tool: "vnem_proof_trail",
    required_inputs: ["task", "capability_ids_used", "completion_audit", "commands_run_or_sources_used", "tests_or_checks", "assumptions", "remaining_risks"],
    completion_audit_tool: "vnem_completion_audit",
    include: ["selected skill/API ids", "domain contract ids", "missing context or assumptions", "safe-to-claim and must-not-claim limits"]
  };
  return {
    task_summary: task.slice(0, 240),
    task_type: taskTypes.join("+") || domains.join("+"),
    domains,
    missing_context_questions: missingContext.recommended_clarifying_questions || [],
    assumptions_if_user_does_not_answer: missingContext.assumptions_if_no_answer || [],
    selected_skill_guidance: selectedSkills,
    selected_api_guidance: selectedApis,
    selected_usable_skill_packs: selectedUsableSkills.map(compactUsableSkillPack),
    selected_usable_api_packs: selectedUsableApis.map(compactUsableApiPack),
    tools_handoff: compactToolsHandoff(toolsHandoff),
    tools_mcp_handoff: compactToolsHandoff(toolsHandoff),
    domain_contracts: domainContracts.map(compactDomainContract),
    workflow_steps: workflowSteps,
    safety_rules: safetyRules,
    verification_plan: verificationPlan,
    completion_checklist: completionChecklist,
    proof_trail_inputs: proofTrailInputs,
    must_not_claim: mustNotClaim,
    when_tools_or_precision_mcp_is_needed: precisionNeeded,
    final_answer_requirements: [
      "Answer the user's task directly, not VNEM self-improvement.",
      "State missing context, assumptions, evidence gathered, checks run, and remaining risks.",
      "Use vnem_completion_audit before final claims and include vnem_proof_trail evidence summary when work is complete."
    ],
    recommended_next_vnem_calls: unique([
      "vnem_completion_audit",
      "vnem_proof_trail",
      needsApi ? "vnem_api_safety_profile" : null,
      selectedSkills.length ? "vnem_skill_safety_profile" : null,
      "vnem_prepare_tools_handoff"
    ]),
    capability_ids_used: unique([
      ...(required.required_modules || []).map((module) => module.id),
      ...selectedSkills.map((skill) => skill.skill_id),
      ...selectedUsableSkills.map((skill) => skill.id),
      ...selectedApis.map((api) => api.id),
      ...selectedUsableApis.map((api) => api.id),
      ...domainContracts.map((contractItem) => contractItem.id)
    ]).slice(0, tokenBudget === "expanded" ? 18 : 12),
    core_mcp_calls_api: false,
    core_mcp_installs_skills: false,
    core_mcp_executes_skill_scripts: false,
    core_mcp_mutates_files: false,
    precision_tools_required_for_action: /file edits|commands|browser|install|live API|mutation/i.test(precisionNeeded.join(" ")),
    library_dump_count: selectedSkills.length,
    api_dump_count: selectedApis.length,
    source_contract_tool: "vnem_compose_capability_contract",
    source_contract_summary: {
      modules: (contract.required_capability_modules || []).map((module) => module.id).slice(0, 6),
      proof_trail_tool: contract.proof_trail_expectation?.tool,
      self_focus_policy: contract.self_focus_policy
    },
    token_budget: tokenBudget,
    safety_boundaries: coreSafetyBoundaries()
  };
}

export function prepareToolsHandoff(library, agentProfiles, options = {}) {
  const task = String(options.task || "").trim();
  const knownContext = String(options.known_context || options.project_context || "").trim();
  const tokenBudget = normalizeBudget(options.token_budget);
  const domains = classifyDomains(task, knownContext);
  const needsApi = taskNeedsApi(task, knownContext, domains);
  const selectedUsableApis = needsApi ? selectUsableApiPacks(library, task, domains, tokenBudget) : [];
  const selectedUsableSkills = selectUsableSkillPacks(library, task, domains, inferCoreTaskTypes(task, knownContext), tokenBudget);
  return buildToolsHandoff({ task, domains, selectedUsableApis, selectedUsableSkills, tokenBudget });
}

function taskNeedsApi(task, context, domains) {
  const text = normalize(`${task} ${context}`);
  if (domains.includes("api")) return true;
  return /\b(weather|forecast|currency|exchange|fx|github repo|issue triage|gitlab|oauth|cors|external service|integration|suspicious|domain|ip address|ip lookup|threat|breach|password exposure|geocod|map|country|countries|open data|nasa|wikipedia|stack overflow|notification|push)\b/.test(text);
}

function usableApiPacks(library) {
  return (library.usable_capability_packs?.apis || []).filter((pack) => pack.usable_status === "usable");
}

function usableSkillPacks(library) {
  return (library.usable_capability_packs?.skills || []).filter((pack) => pack.usable_status === "usable");
}

function selectUsableApiPacks(library, task, domains, tokenBudget) {
  const text = normalize(`${task} ${domains.join(" ")}`);
  const limit = tokenBudget === "expanded" ? 4 : tokenBudget === "normal" ? 3 : 2;
  const scored = usableApiPacks(library).map((pack) => {
    const haystack = normalize([pack.id, pack.name, pack.category, ...(pack.recommended_task_triggers || []), ...(pack.safe_use_cases || [])].join(" "));
    let score = 0;
    for (const term of normalize(task).split(" ").filter(Boolean)) {
      if (haystack.includes(term)) score += pack.name.toLowerCase().includes(term) ? 12 : 5;
    }
    if (/weather|forecast/.test(text) && /open-meteo|weather/.test(haystack)) score += 80;
    if (/currency|exchange|fx|converter/.test(text) && /exchange|currency/.test(haystack)) score += 80;
    if (/github|repo issue triage|issue triage/.test(text) && /github/.test(haystack)) score += 90;
    if (/gitlab|merge request/.test(text) && /gitlab/.test(haystack)) score += 80;
    if (/suspicious|threat|malware|domain|ip address|risky|risk/.test(text) && /abuseipdb|virustotal|urlhaus|safe browsing|ipinfo|haveibeenpwned|ip-api/.test(haystack)) score += 75;
    if (/geocod|map|address/.test(text) && /nominatim|geocoding/.test(haystack)) score += 70;
    if (/country|countries/.test(text) && /rest countries|country/.test(haystack)) score += 70;
    if (/game|price|deal/.test(text) && /cheapshark|game/.test(haystack)) score += 70;
    if (/wiki|reference|encyclopedic/.test(text) && /wikipedia|mediawiki/.test(haystack)) score += 70;
    if (/stack overflow|developer q/.test(text) && /stack exchange/.test(haystack)) score += 70;
    if (/nasa|space|asteroid/.test(text) && /nasa/.test(haystack)) score += 70;
    if (/air quality|pollution/.test(text) && /openaq/.test(haystack)) score += 70;
    return { pack, score };
  }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score || a.pack.name.localeCompare(b.pack.name));
  return scored.slice(0, limit).map((item) => item.pack);
}

function selectUsableSkillPacks(library, task, domains, taskTypes, tokenBudget) {
  const text = normalize(`${task} ${domains.join(" ")} ${taskTypes.join(" ")}`);
  const limit = tokenBudget === "expanded" ? 5 : tokenBudget === "normal" ? 3 : 2;
  const scored = usableSkillPacks(library).map((pack) => {
    const haystack = normalize([pack.id, pack.name, pack.category, pack.safe_guidance_summary, ...(pack.recommended_task_triggers || [])].join(" "));
    let score = 0;
    for (const term of normalize(task).split(" ").filter(Boolean)) if (haystack.includes(term)) score += 5;
    if (/weather|currency|api|integration|github helper|repo issue triage|external service/.test(text) && /api-integration-safety/.test(haystack)) score += 85;
    if (/ui|dashboard|frontend|visible|web app/.test(text) && /frontend|react|web design|ui-ux|shadcn|design/.test(haystack)) score += 75;
    if (/mod|elden ring|game file/.test(text) && /game-file-safety|modding/.test(haystack)) score += 95;
    if (/debug|fix failing|fix this repo|repo issue|prove/.test(text) && /diagnose|tdd|triage|github-actions|architecture/.test(haystack)) score += 80;
    if (/security|secure|gmail|pc|domain|ip|threat|hardening/.test(text) && /security|secure|openclaw/.test(haystack)) score += 80;
    if (/docs|source|current|research/.test(text) && /docs|grill-with-docs/.test(haystack)) score += 65;
    if (/handoff|tools mcp|technical handoff/.test(text) && /handoff/.test(haystack)) score += 60;
    return { pack, score };
  }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score || a.pack.name.localeCompare(b.pack.name));
  return scored.slice(0, limit).map((item) => item.pack);
}

function usableApiGuidance(pack) {
  return {
    id: pack.id,
    name: pack.name,
    category: pack.category,
    usable_status: pack.usable_status,
    official_docs_url: pack.official_docs_url,
    auth_type: pack.auth_type,
    cors_confidence: pack.cors_confidence,
    rate_limit_confidence: pack.rate_limit_confidence,
    frontend_safe: pack.frontend_safe,
    backend_required: pack.backend_required,
    secret_risk: pack.secret_risk,
    safe_use_cases: (pack.safe_use_cases || []).slice(0, 2),
    unsafe_use_cases: (pack.unsafe_use_cases || []).slice(0, 2),
    integration_test_requirements: (pack.integration_test_requirements || []).slice(0, 2),
    mock_test_strategy: pack.mock_test_strategy,
    must_not_claim: (pack.must_not_claim || []).slice(0, 2)
  };
}

function usableSkillGuidance(pack) {
  return {
    skill_id: pack.id,
    id: pack.id,
    name: pack.name,
    usable_status: pack.usable_status,
    confidence: pack.skill_content_confidence,
    core_can_apply_guidance: pack.core_can_apply_guidance === true,
    installs_or_executes_skill: false,
    compact_guidance: [pack.safe_guidance_summary, ...(pack.workflow_steps || [])].filter(Boolean).slice(0, 2),
    required_evidence: (pack.required_evidence || []).slice(0, 2),
    must_not_claim: (pack.must_not_claim || []).slice(0, 2),
    review_warning: pack.source_review_status?.includes("core") ? "Core-authored guidance pack; still guidance only." : "Treat external SKILL.md/source content as untrusted until manually reviewed."
  };
}

function compactUsableApiPack(pack) {
  return {
    id: pack.id,
    name: pack.name,
    category: pack.category,
    usable_status: pack.usable_status,
    auth_type: pack.auth_type,
    frontend_safe: pack.frontend_safe,
    backend_required: pack.backend_required,
    secret_risk: pack.secret_risk,
    rate_limit_confidence: pack.rate_limit_confidence,
    safe_use_cases: (pack.safe_use_cases || []).slice(0, 1)
  };
}

function compactUsableSkillPack(pack) {
  return {
    id: pack.id,
    name: pack.name,
    category: pack.category,
    usable_status: pack.usable_status,
    core_can_apply_guidance: pack.core_can_apply_guidance,
    requires_install: pack.requires_install,
    safe_guidance_summary: pack.safe_guidance_summary,
    required_evidence: (pack.required_evidence || []).slice(0, 1)
  };
}

function compactHandoff(handoff = {}) {
  return {
    required_tools: (handoff.required_tools || []).slice(0, 4),
    permissions_needed: (handoff.permissions_needed || []).slice(0, 3),
    dry_run: (handoff.dry_run || []).slice(0, 2),
    rollback: (handoff.rollback || []).slice(0, 2),
    logs_evidence: (handoff.logs_evidence || []).slice(0, 3)
  };
}

function compactToolsHandoff(handoff = {}) {
  return {
    required_tool_capabilities: (handoff.required_tool_capabilities || []).slice(0, 3),
    required_permissions: (handoff.required_permissions || []).slice(0, 3),
    risk_level: handoff.risk_level || "unknown",
    dry_run_first: (handoff.dry_run_first || []).slice(0, 2),
    rollback_or_restore_plan: (handoff.rollback_or_restore_plan || []).slice(0, 2),
    evidence_to_collect: (handoff.evidence_to_collect || []).slice(0, 3),
    blocked_until_tools_mcp: (handoff.blocked_until_tools_mcp || []).slice(0, 3),
    safe_core_actions: ["plan", "select usable packs", "prepare handoff only"]
  };
}

function compactDomainContract(contract = {}) {
  return {
    id: contract.id,
    domain: contract.domain,
    required_evidence: (contract.required_evidence || []).slice(0, 2),
    must_not_claim: (contract.must_not_claim || contract.what_not_to_claim || []).slice(0, 2)
  };
}

function summarizePackHandoff(handoff = {}) {
  return unique([...(handoff.required_tools || []), ...(handoff.permissions_needed || [])]).slice(0, 4);
}

function buildToolsHandoff({ task, domains, selectedUsableApis, selectedUsableSkills, tokenBudget }) {
  const apiHandoffs = selectedUsableApis.flatMap((pack) => pack.tools_mcp_handoff ? [pack.tools_mcp_handoff] : []);
  const skillHandoffs = selectedUsableSkills.flatMap((pack) => pack.tools_mcp_handoff ? [pack.tools_mcp_handoff] : []);
  const allHandoffs = [...apiHandoffs, ...skillHandoffs];
  const requiredToolCapabilities = unique([
    ...allHandoffs.flatMap((handoff) => handoff.required_tools || []),
    domains.includes("ui") ? "browser/screenshot proof" : null,
    domains.includes("debugging") ? "terminal test runner" : null,
    domains.includes("modding") ? "filesystem edits with backup/restore and modding toolchain" : null
  ]).slice(0, tokenBudget === "expanded" ? 12 : 8);
  const requiredPermissions = unique([
    ...allHandoffs.flatMap((handoff) => handoff.permissions_needed || []),
    selectedUsableApis.length ? "approval before live API calls" : null,
    selectedUsableApis.some((pack) => pack.secret_risk) ? "approval before handling secrets/API keys/OAuth/PAT tokens" : null,
    /github/i.test(task) ? "approval before GitHub mutations" : null,
    domains.includes("modding") ? "approval before game/mod file edits" : null,
    domains.includes("ui") || domains.includes("debugging") ? "approve file edits and command execution" : null
  ]).slice(0, 10);
  const blocked = unique([
    selectedUsableApis.length ? "live API calls and secret handling must wait for Tools/Precision MCP or project code with approval" : null,
    selectedUsableSkills.some((pack) => pack.requires_install) ? "skill installation or script execution must wait for Tools/Precision MCP and manual review" : null,
    domains.includes("ui") ? "file edits, browser actions, screenshots, and test commands must wait for Tools/Precision MCP" : null,
    domains.includes("debugging") ? "repo file edits, terminal commands, and test execution must wait for Tools/Precision MCP" : null,
    domains.includes("modding") ? "mod file edits, game-file conversion, backup/restore, and verification launches must wait for Tools/Precision MCP" : null,
    /github/i.test(task) ? "GitHub issue/PR mutations must wait for approved Tools MCP/GitHub tool actions" : null
  ]).slice(0, 10);
  const riskLevel = domains.includes("security") || domains.includes("modding") || selectedUsableApis.some((pack) => pack.secret_risk) ? "high" : blocked.length ? "medium" : "low";
  return {
    task_summary: String(task || "").slice(0, 240),
    selected_usable_api_packs: selectedUsableApis.map(compactUsableApiPack),
    selected_usable_skill_packs: selectedUsableSkills.map(compactUsableSkillPack),
    required_tool_capabilities: requiredToolCapabilities,
    required_permissions: requiredPermissions,
    risk_level: riskLevel,
    dry_run_first: unique([
      ...allHandoffs.flatMap((handoff) => handoff.dry_run || []),
      selectedUsableApis.length ? "mock API responses before approved live calls" : null,
      domains.includes("ui") ? "inspect affected files and produce UI proof plan before edits" : null,
      domains.includes("modding") ? "copy files into isolated backup workspace before patching" : null
    ]).slice(0, 8),
    rollback_or_restore_plan: unique([
      ...allHandoffs.flatMap((handoff) => handoff.rollback || []),
      domains.includes("ui") || domains.includes("debugging") ? "use git diff/checkout or feature flag rollback if verification fails" : null,
      domains.includes("modding") ? "restore original mod/game files from backup if verification fails" : null
    ]).slice(0, 8),
    evidence_to_collect: unique([
      ...allHandoffs.flatMap((handoff) => handoff.logs_evidence || []),
      selectedUsableApis.length ? "endpoint/docs used, mocked/live status codes, and no-secret-exposure proof" : null,
      domains.includes("ui") ? "screenshots/browser proof, responsive/accessibility/state proof" : null,
      domains.includes("debugging") ? "logs-first evidence, reproduction, root cause, tests, before/after proof" : null,
      domains.includes("modding") ? "game version, platform, toolchain, file formats, backup path, restore plan, compatibility check" : null
    ]).slice(0, 10),
    blocked_until_tools_mcp: blocked,
    safe_core_actions: [
      "select usable packs",
      "plan workflow and safety checks",
      "prepare permission/dry-run/rollback/proof handoff",
      "state must-not-claim limits"
    ],
    must_not_claim: unique([
      "Core MCP executed this handoff.",
      "Core MCP edited files, opened browsers, ran commands, called live APIs, installed skills, or used GitHub actions.",
      selectedUsableApis.length ? "A live API integration works without mocked/approved-live evidence." : null,
      selectedUsableApis.some((pack) => pack.secret_risk) ? "Secrets/API keys/OAuth/PAT tokens are safe without no-exposure proof." : null,
      domains.includes("security") ? "Do not automatically block a domain/IP or guarantee safety without corroborating evidence and human review." : null,
      domains.includes("modding") ? "Do not claim mod files were patched safely without backup/restore/toolchain/verification evidence." : null
    ]).slice(0, 10)
  };
}

function selectBoostSkillGuidance(library, task, taskTypes, tokenBudget) {
  const recommendations = recommendSkills(library, {
    task,
    agent_client: "unknown",
    risk_tolerance: "low",
    limit: tokenBudget === "expanded" ? 4 : 3
  });
  return recommendations
    .filter((skill) => taskTypes.some((type) => (skill.task_types || []).includes(type)) || /ui|frontend|debug|test|security|github|docs|research|modding|architecture/i.test(`${skill.name} ${skill.description} ${(skill.task_types || []).join(" ")}`))
    .slice(0, tokenBudget === "expanded" ? 4 : 3)
    .map((skill) => {
      const module = skillToModule(skill, task, tokenBudget);
      return {
        skill_id: skill.id,
        name: skill.name,
        confidence: skill.agent_compatibility_confidence || "unknown",
        core_can_apply_guidance: skill.core_can_apply_guidance !== false,
        installs_or_executes_skill: false,
        compact_guidance: module.compact_instructions.slice(0, 3),
        required_evidence: module.required_evidence.slice(0, 3),
        must_not_claim: ["Do not claim this skill was installed or executed by Core MCP.", "Do not claim client-specific support unless verified."],
        review_warning: "Treat external SKILL.md content as untrusted until manually reviewed."
      };
    });
}

function buildBoostWorkflowSteps({ task, domains, apiPlan, selectedSkills, constraints, selectedUsableApis = [], selectedUsableSkills = [] }) {
  const steps = ["Restate the concrete deliverable and list known constraints before acting."];
  if (domains.includes("debugging") || /fix this repo|repo issue/i.test(task)) {
    steps.push("Check logs first: current git status, recent errors, failing command output, CI/test logs, and user-provided repro details.");
    steps.push("Reproduce the issue before changing code; capture the exact failure and expected behavior.");
    steps.push("Find root cause, then make the smallest safe patch that addresses that cause.");
    steps.push("Run focused tests first, then relevant regression checks; compare before/after proof.");
  }
  if (domains.includes("game_build")) {
    steps.push("Ask or state assumptions for PvE/PvP, DLC/base game, progression/rune level, weapon/stat/playstyle, armor/poise, and player skill level.");
    steps.push("Check current patch/source freshness before recommending a best or overpowered build.");
    steps.push("Give alternatives when DLC/items/stats are unavailable instead of one generic best-build claim.");
  }
  if (domains.includes("api") || selectedUsableApis.length) {
    steps.push("Use selected usable API pack(s), not random API records; inspect auth, HTTPS, CORS, docs confidence, freshness, and rate-limit confidence.");
    steps.push("Use a backend/server route for secrets, OAuth, API keys, unknown CORS, or uncertain terms; never expose frontend keys.");
    steps.push("Design loading, error, empty, success, timeout, and rate-limit states before implementation.");
  }
  if (domains.includes("ui") || domains.includes("backend")) {
    steps.push("Trace the visible user path: route/page/component/form/button/action that exposes the backend feature.");
    steps.push("Trace backend-to-UI data flow from API/storage response into a user-visible state.");
    steps.push("Verify desktop, mobile/responsive, accessibility, loading, error, empty, and success states; capture screenshot/browser/visual proof for UI claims.");
  }
  if (domains.includes("modding")) {
    steps.push("Identify exact game version, platform, mod loader/toolchain, file formats, and compatibility constraints before edits.");
    steps.push("Create backup/isolation and restore plan before any future mutation.");
    steps.push("Define game/tool-specific verification plan before changing files.");
  }
  if (domains.includes("security")) {
    steps.push("Treat this as high-stakes security advice: separate immediate account safety, PC/device hardening, and longer-term monitoring.");
    steps.push("Prioritize Gmail MFA/2FA, recovery options, password manager/password reset hygiene, active sessions/devices, OAuth app access, OS/browser updates, malware scan, and backups.");
    steps.push("Use current official/vendor/source-quality guidance for changing security facts.");
    steps.push("Separate user actions from tool actions; do not take account or device actions from Core MCP.");
  }
  if (selectedUsableSkills.length) steps.push("Use selected usable skill pack(s) as guidance, not random skill names; do not install or execute skills.");
  if (selectedSkills.length) steps.push("Apply selected skill guidance as instructions only; do not install or execute skills.");
  if (apiPlan) steps.push("Use API plan candidates as design guidance only; Core MCP does not call the live API.");
  if (constraints.length) steps.push(`Respect explicit constraints: ${constraints.join("; ")}.`);
  return unique(steps).slice(0, 12);
}

function buildBoostSafetyRules({ domains, apiPlan, selectedUsableApis = [] }) {
  const rules = ["Core MCP is read-only: no file writes, terminal/browser/GitHub actions, skill installs, skill scripts, or live API calls."];
  if (apiPlan || selectedUsableApis.length) {
    rules.push("Check frontend vs backend boundary before implementation.");
    rules.push("Check CORS, HTTPS, auth, docs confidence, freshness, and rate-limit confidence.");
    rules.push("Use backend/server-side secrets for API keys, OAuth tokens, and secret-bearing providers.");
  }
  if (domains.includes("security")) rules.push("Do not promise perfect security; give risk-reduction steps and verification checks.");
  if (domains.includes("modding")) rules.push("Do not mutate game files without backup/isolation, restore plan, and toolchain verification.");
  if (domains.includes("ui")) rules.push("Do not claim UI is polished or visible without visual/browser proof.");
  return unique(rules).slice(0, 10);
}

function buildBoostVerificationPlan({ domains, apiPlan, selectedUsableApis = [] }) {
  const plan = [];
  if (domains.includes("research") || domains.includes("game_build") || domains.includes("security")) plan.push("Use current/source-quality checks; record source freshness, patch/version/vendor guidance, and assumptions.");
  if (domains.includes("debugging")) plan.push("Record logs first, reproduction steps, root cause, changed files, focused tests, regression tests, and before/after proof.");
  if (apiPlan || selectedUsableApis.length) plan.push("Use selected usable API pack test plan: mock API success/loading/error/empty/rate-limit paths; verify no secrets appear in frontend bundles or public config.");
  if (domains.includes("ui") || domains.includes("backend")) plan.push("Verify visible user path, backend-to-UI data flow, loading/error/empty/success states, responsive/mobile/desktop, accessibility, and screenshot/browser proof.");
  if (domains.includes("modding")) plan.push("Verify exact game version/platform/toolchain/file format compatibility, backup/restore plan, isolated output, and game/tool-specific smoke test.");
  if (domains.includes("security")) plan.push("Use a final safety checklist covering account recovery, MFA/2FA, active sessions, OAuth/app access, device updates, malware scan, backups, and monitoring.");
  if (!plan.length) plan.push("Define task-specific evidence before claiming the task is complete.");
  return unique(plan).slice(0, 8);
}

function buildBoostCompletionChecklist({ domains, apiPlan, selectedUsableApis = [], selectedUsableSkills = [] }) {
  const items = ["Completion audit run or manually applied before final answer.", "Proof trail inputs prepared with evidence, assumptions, and remaining risks."];
  if (apiPlan || selectedUsableApis.length) items.push("Usable API pack selected only if useful; auth/CORS/HTTPS/docs/freshness/rate-limit decision documented; loading/error/empty/success states tested or specified.");
  if (selectedUsableSkills.length) items.push("Usable skill packs applied as guidance only; required evidence captured and install/execution claims avoided.");
  if (domains.includes("ui") || domains.includes("backend")) items.push("Visible user path and backend-to-UI data flow proven; loading/error/empty/success states covered; responsive/accessibility/visual proof collected.");
  if (domains.includes("debugging")) items.push("Logs checked first; issue reproduced; root cause found; minimal patch and tests verified.");
  if (domains.includes("game_build")) items.push("PvE/PvP, DLC/base game, progression/rune level, weapon/stat preference, armor/poise, player skill, and source freshness handled.");
  if (domains.includes("modding")) items.push("Game version, platform, toolchain, file formats, backup, restore, compatibility, and verification plan handled before edits.");
  if (domains.includes("security")) items.push("Practical account/device security checklist provided with no impossible guarantees.");
  return unique(items).slice(0, 10);
}

function buildBoostMustNotClaim({ domains, apiPlan }) {
  const claims = ["Do not claim completion without evidence.", "Do not claim Core MCP installed skills, executed scripts, called APIs, edited files, opened browsers, ran commands, or pushed GitHub changes."];
  if (apiPlan) claims.push("Do not claim the live API was called by Core MCP or that rate limits/CORS are safe unless verified.");
  if (domains.includes("game_build")) claims.push("Do not claim one generic best OP build without PvE/PvP, DLC, progression, source freshness, and user context.");
  if (domains.includes("ui") || domains.includes("backend")) claims.push("Do not claim backend-only work is done for a UI task, or claim polished UI without visual/screenshot/browser proof.");
  if (domains.includes("modding")) claims.push("Do not claim files are safely changed without backup, restore, toolchain, file-format, and verification evidence.");
  if (domains.includes("security")) claims.push("Do not claim no hacker can ever get in, perfect safety, guaranteed protection, or impossible security certainty.");
  if (domains.includes("debugging")) claims.push("Do not claim fixed without logs/reproduction, root cause, tests, and before/after proof.");
  return unique(claims).slice(0, 10);
}

function buildBoostPrecisionNeeds({ domains }) {
  const needs = ["Core can plan, check, and produce guidance; it does not perform actions."];
  if (domains.includes("code") || domains.includes("debugging") || domains.includes("ui") || domains.includes("backend")) needs.push("Tools/Precision MCP is needed for real file edits, terminal commands, test execution, browser inspection, and screenshots.");
  if (domains.includes("modding")) needs.push("Tools/Precision MCP is needed for actual game/mod file edits, unpacking/repacking, backups, restore operations, and local verification.");
  if (domains.includes("api")) needs.push("Tools/Precision MCP or generated project code is needed for live API calls, secret handling, and integration tests.");
  if (domains.includes("security")) needs.push("User-approved tools or user actions are needed for account/device changes; Core only separates user action from tool action and provides the checklist.");
  if (domains.includes("game_build") && !domains.includes("modding")) needs.push("No file or tool execution is needed from Core for build advice; use current research outside Core before final claims.");
  return unique(needs).slice(0, 8);
}

function selectWorkflowModules(taskTypes, task, tokenBudget) {
  const modules = [];
  const add = (module) => modules.push(trimModule(module, tokenBudget));
  const isVnem = isVnemDevelopmentTask(task);
  if (taskTypes.includes("website_ui") || taskTypes.includes("frontend_ui")) {
    add({
      id: "module:workflow:frontend-ui-quality",
      kind: "workflow",
      name: "Frontend/UI quality workflow",
      task_types: ["website_ui", "frontend_ui", "visual_qa", "accessibility_testing"],
      supported_agents: ["all"],
      compact_instructions: ["Inspect existing UI patterns before changing design.", "Preserve responsive, accessible, loading, empty, and error states.", "Verify build plus at least one visual/responsive check."],
      when_to_use: ["Website, React, Next.js, UI/UX, visual polish, accessibility work."],
      when_not_to_use: ["Pure backend or non-visual tasks."],
      required_evidence: ["Build/test result plus visual/responsive/accessibility evidence."],
      compatibility: ["vnem_quality_gate", "design/visual QA rules"],
      avoid_with: ["blind redesign without inspecting current app"],
      risks: ["visual regression", "accessibility regression", "token waste from reading unrelated docs"],
      verification_requirements: ["Run available UI/build tests and inspect visual states."],
      token_budget_guidance: "compact",
      full_detail_uri: "vnem://install/visual-qa-protocol"
    });
  }
  if (taskTypes.includes("api_integration")) {
    add({
      id: "module:workflow:api-safety-integration",
      kind: "workflow",
      name: "API safety integration workflow",
      task_types: ["api_integration", "security_data"],
      supported_agents: ["all"],
      compact_instructions: ["Compare auth, HTTPS, CORS, frontend safety, and backend proxy needs before selecting an API.", "Never expose API keys in frontend code.", "Plan loading/error/rate-limit tests before implementation."],
      when_to_use: ["Any public/private API integration or data-provider task."],
      when_not_to_use: ["No external data/API is needed."],
      required_evidence: ["Auth/HTTPS/CORS decision, secret-handling boundary, and tests for success/error/loading."],
      compatibility: ["vnem_build_api_integration_plan", "vnem_review_skill_or_api"],
      avoid_with: ["frontend-only secret-bearing API use"],
      risks: ["secret leak", "CORS failure", "rate-limit or terms mismatch"],
      verification_requirements: ["Prove API keys are server-only; mock failure states."],
      token_budget_guidance: "compact",
      full_detail_uri: "vnem://capabilities/apis"
    });
  }
  if (taskTypes.includes("research_quality")) {
    add({
      id: "module:workflow:research-source-quality",
      kind: "workflow",
      name: "Research/source-quality workflow",
      task_types: ["research_quality", "claim_verification"],
      supported_agents: ["all"],
      compact_instructions: ["Use current/high-quality sources when claims can change.", "Prefer official/primary sources and separate verified facts from assumptions.", "Ask critical missing-context questions when the answer would otherwise be generic."],
      when_to_use: ["Research, recommendations, current facts, game/build advice, docs-dependent answers."],
      when_not_to_use: ["Purely local deterministic task with no external facts."],
      required_evidence: ["Sources used, freshness/version relevance, assumptions/limits."],
      compatibility: ["vnem_sources", "vnem_completion_audit"],
      avoid_with: ["fake certainty", "outdated generic advice"],
      risks: ["outdated facts", "weak source quality", "missing assumptions"],
      verification_requirements: ["Cite or list high-quality/current sources and state uncertainty."],
      token_budget_guidance: "compact",
      full_detail_uri: "vnem://install/source-radar"
    });
  }
  if (taskTypes.includes("game_build_research")) {
    add({
      id: "module:workflow:game-build-recommendation",
      kind: "workflow",
      name: "Game/build recommendation workflow",
      task_types: ["game_build_research", "research_quality"],
      supported_agents: ["all"],
      compact_instructions: ["Clarify PvE/PvP, DLC, progression, skill level, armor/poise, and item availability.", "Check patch/source freshness before best/OP claims.", "Give alternatives when items are unavailable."],
      when_to_use: ["Game builds/loadouts/recommendations such as Elden Ring builds."],
      when_not_to_use: ["Non-game research."],
      required_evidence: ["Clarifying answers or assumptions plus source/freshness check."],
      compatibility: ["vnem_completion_audit", "research-source-quality"],
      avoid_with: ["best build claims without context"],
      risks: ["PvE/PvP mismatch", "DLC unavailable", "outdated patch advice"],
      verification_requirements: ["State mode/DLC/progression assumptions and source-quality basis."],
      token_budget_guidance: "compact",
      full_detail_uri: "vnem://contracts/game-build"
    });
  }
  if (taskTypes.includes("game_modding_workflow")) {
    add({
      id: "module:workflow:modding-safety-research",
      kind: "workflow",
      name: "Game/modding safety workflow",
      task_types: ["game_modding_workflow", "research_quality"],
      supported_agents: ["all"],
      compact_instructions: ["Research the specific game, file formats, tools, and compatibility issues first.", "Require backups/isolation before mutation in future Tools/Precision work.", "Define local verification/restore plan."],
      when_to_use: ["Modding, game files, load orders, save/regulation/assets workflows."],
      when_not_to_use: ["General app work."],
      required_evidence: ["Game/tool/file-format research, backup/isolation plan, test/restore plan."],
      compatibility: ["vnem_protection_review", "vnem_completion_audit"],
      avoid_with: ["patching original files before understanding pipeline"],
      risks: ["save/file corruption", "tool incompatibility", "broken mod load order"],
      verification_requirements: ["Prove tool pipeline and backups before any mutation."],
      token_budget_guidance: "compact",
      full_detail_uri: "vnem://contracts/modding-safety"
    });
  }
  if (taskTypes.includes("debugging")) {
    add({
      id: "module:workflow:systematic-debugging-proof",
      kind: "workflow",
      name: "Systematic debugging proof workflow",
      task_types: ["debugging", "testing"],
      supported_agents: ["all"],
      compact_instructions: ["Reproduce the exact symptom before fixing.", "Trace root cause before patching.", "Add or run proof that goes red/green where feasible."],
      when_to_use: ["Bug, failing test, CI failure, regression, crash, unexpected behavior."],
      when_not_to_use: ["Pure greenfield work with no failure."],
      required_evidence: ["Failing command/log, root cause, fix, and passing proof command."],
      compatibility: ["test-driven-development", "systematic-debugging"],
      avoid_with: ["guess-and-check fixes"],
      risks: ["symptom fix", "unverified patch"],
      verification_requirements: ["Run the failing check again and broader regression tests."],
      token_budget_guidance: "compact",
      full_detail_uri: "vnem://install/coding-protocol"
    });
  }
  if (taskTypes.includes("prompt_improvement")) {
    add({
      id: "module:workflow:prompt-improvement-evidence",
      kind: "workflow",
      name: "Prompt improvement evidence workflow",
      task_types: ["prompt_improvement", "agent_instruction"],
      supported_agents: ["all"],
      compact_instructions: ["Identify the target behavior change before rewriting.", "Keep prompts specific, testable, and non-conflicting.", "Show before/after or evaluation examples."],
      when_to_use: ["Prompt, instruction, agent behavior, rubric, or system guidance improvements."],
      when_not_to_use: ["The user asks for implementation rather than prompt behavior."],
      required_evidence: ["Before/after prompt plus examples showing changed behavior."],
      compatibility: ["prompt-engineering", "prompt-patterns"],
      avoid_with: ["large generic prompt dumps"],
      risks: ["instruction conflict", "token bloat"],
      verification_requirements: ["Run or describe behavior checks for the revised prompt."],
      token_budget_guidance: "compact",
      full_detail_uri: "vnem://install/prompt-engineering"
    });
  }
  if (taskTypes.includes("security_review")) {
    add({
      id: "module:workflow:security-verification",
      kind: "workflow",
      name: "Security/protection verification workflow",
      task_types: ["security_review", "protection"],
      supported_agents: ["all"],
      compact_instructions: ["Identify secrets, auth boundaries, user data, dependency, and injection risks.", "Prefer least privilege and safe defaults.", "Report unresolved risks honestly."],
      when_to_use: ["Security, auth, secrets, data handling, untrusted input, dependency, or release-risk tasks."],
      when_not_to_use: ["No safety-sensitive context."],
      required_evidence: ["Risk list, mitigations, and checks proving secrets/sensitive paths are safe."],
      compatibility: ["vnem_quality_gate", "security review"],
      avoid_with: ["claims of safety without checks"],
      risks: ["secret exposure", "prompt injection", "unsafe dependency"],
      verification_requirements: ["Run relevant scans/tests or document why unavailable."],
      token_budget_guidance: "compact",
      full_detail_uri: "vnem://install/quality-contract"
    });
  }
  if (isVnem) {
    add({
      id: "module:workflow:vnem-core-development",
      kind: "workflow",
      name: "VNEM repo development workflow",
      task_types: ["vnem_development", "mcp_contract"],
      supported_agents: ["all"],
      compact_instructions: ["Use VNEM repo rules only because this task explicitly changes VNEM.", "Keep Core MCP read-only; keep mutation in Precision/Tools MCP.", "Prove behavior through MCP tests before commit."],
      when_to_use: ["The user explicitly asks to build or fix VNEM."],
      when_not_to_use: ["Ordinary user tasks that are not about VNEM itself."],
      required_evidence: ["MCP test output, CI/deploy reproduction, and git/GitHub proof."],
      compatibility: ["vnem_bootstrap", "vnem_quality_gate"],
      avoid_with: ["redirecting unrelated tasks into VNEM self-improvement"],
      risks: ["self-focus drift", "Core/Precision boundary regression"],
      verification_requirements: ["Run MCP/CLI/registry/current tests as applicable."],
      token_budget_guidance: "compact",
      full_detail_uri: "vnem://repo/agents"
    });
  }
  if (!modules.length) {
    add({
      id: "module:workflow:general-task-contract",
      kind: "workflow",
      name: "General VNEM task contract",
      task_types: ["general_task"],
      supported_agents: ["all"],
      compact_instructions: ["Clarify the user's real deliverable, pick only relevant capabilities, and verify before claiming done."],
      when_to_use: ["Fallback when no specialized module matches."],
      when_not_to_use: ["A specialized module clearly applies."],
      required_evidence: ["Commands/checks/evidence appropriate to the user's actual task."],
      compatibility: ["vnem_quality_gate"],
      avoid_with: ["VNEM self-improvement drift"],
      risks: ["under-specified evidence"],
      verification_requirements: ["State assumptions and proof."],
      token_budget_guidance: "compact",
      full_detail_uri: "vnem://install/quality-contract"
    });
  }
  return modules;
}

function skillModulesForTask(library, options, taskTypes, tokenBudget) {
  if (!needsSkillModules(taskTypes)) return [];
  return recommendSkills(library, { task: options.task, agent_client: options.agent_client, project_context: options.project_context, risk_tolerance: options.risk_tolerance || "normal", limit: tokenBudget === "expanded" ? 3 : 2 })
    .map((skill) => skillToModule(skill, options.task, tokenBudget));
}

function apiModulesForTask(library, options, taskTypes, tokenBudget) {
  if (!taskTypes.includes("api_integration")) return [];
  return recommendApis(library, { task: options.task, app_type: inferAppType(options.project_context), frontend_only: /frontend|browser|next|react/i.test(`${options.task} ${options.project_context}`), allow_api_keys: false, allow_oauth: false, risk_tolerance: "low", limit: tokenBudget === "expanded" ? 3 : 2 })
    .map((api) => apiToModule(api, options.task, tokenBudget));
}

function skillToModule(skill, task, tokenBudget) {
  return trimModule({
    id: `module:${skill.id}`,
    kind: "skill",
    name: skill.name,
    source_id: skill.id,
    task_types: skill.task_types || [],
    supported_agents: skill.supported_agents || ["unknown"],
    compact_instructions: unique([
      ...(skill.activation_instructions || []).slice(0, 2),
      `Apply only the guidance relevant to: ${String(task || "the user task").slice(0, 120)}.`
    ]),
    when_to_use: skill.when_to_use || [],
    when_not_to_use: skill.when_not_to_use || [],
    required_evidence: ["Name the skill/capability id used and summarize the specific guidance applied.", "If installation/execution would be needed, mark it as Precision/Tools MCP or user-approved work, not Core MCP."],
    compatibility: skill.compatible_with || [],
    avoid_with: skill.avoid_with || [],
    risks: skill.risk_flags || [],
    verification_requirements: ["Manual review before installation; proof that no skill script was executed by Core MCP."],
    token_budget_guidance: tokenBudget,
    full_detail_uri: `vnem://capabilities/skills/${encodeURIComponent(skill.id)}`,
    source_url: skill.source_url,
    review_status: skill.review_status
  }, tokenBudget);
}

function apiToModule(api, task, tokenBudget) {
  return trimModule({
    id: `module:${api.id}`,
    kind: "api",
    name: api.name,
    source_id: api.id,
    task_types: api.task_types || ["api_integration"],
    supported_agents: ["all"],
    compact_instructions: [
      `Compare ${api.name} auth=${api.auth_type}, https=${api.https}, cors=${api.cors} before implementation.`,
      api.backend_required ? "Use backend/server route; do not expose secrets or CORS-unsafe calls in frontend." : "Frontend use may be considered only after current docs/terms review.",
      "Plan success, loading, error, timeout, and rate-limit tests."
    ],
    when_to_use: api.example_use_cases || ["When this API directly fits the data/integration task."],
    when_not_to_use: api.avoid_with || ["When auth, CORS, HTTPS, terms, or rate limits are unresolved."],
    required_evidence: ["Auth/HTTPS/CORS decision and selected integration boundary.", "Tests/mocks for success and failure states."],
    compatibility: api.compatible_with || [],
    avoid_with: api.avoid_with || [],
    risks: api.risk_flags || [],
    verification_requirements: ["Verify no API key appears in frontend code; review official docs before live calls."],
    token_budget_guidance: tokenBudget,
    full_detail_uri: `vnem://capabilities/apis/${encodeURIComponent(api.id)}`,
    source_url: api.source_url,
    review_status: api.review_status
  }, tokenBudget);
}

function apiPlanCandidate(entry) {
  return {
    id: entry.id,
    name: entry.name,
    category: entry.category,
    auth_type: entry.auth_type,
    https: entry.https,
    cors: entry.cors,
    frontend_safe: entry.frontend_safe === true,
    backend_required: entry.backend_required === true,
    secret_risk: entry.secret_risk === true,
    risk_flags: entry.risk_flags || [],
    source_url: entry.source_url,
    imported_from: entry.imported_from,
    recommended_stack_usage: entry.recommended_stack_usage,
    official_docs_url: entry.official_docs_url || "unknown",
    freshness_status: entry.freshness_status || "unknown; verify current docs",
    rate_limit_notes: entry.rate_limit_notes || "unknown; verify official docs",
    rate_limit_confidence: entry.rate_limit_confidence || "unknown",
    documentation_confidence: entry.documentation_confidence || "unknown",
    verification_source_urls: entry.verification_source_urls || [],
    integration_test_requirements: entry.integration_test_requirements || [],
    integration_decision: entry.frontend_safe === true ? "frontend_possible_after_docs_review" : entry.secret_risk ? "backend_required_secret_risk" : "backend_or_review_required"
  };
}

function inferCoreTaskTypes(task, context = "") {
  const text = normalize(`${task} ${context}`);
  const types = new Set();
  if (/next|react|website|frontend|ui|ux|design|accessibility|css|visual/.test(text)) types.add("website_ui"), types.add("frontend_ui");
  if (/backend|database|server route|api route|storage|endpoint/.test(text)) types.add("backend_integration"), types.add("testing");
  if (/research|current|latest|best|recommend|source|citation|docs|patch|version/.test(text)) types.add("research_quality");
  if (/elden ring|game build|build recommendation|pve|pvp|dlc|rune level|talismans|armor/.test(text)) types.add("game_build_research"), types.add("research_quality");
  if (/modding|mod workflow|game mod|mods?|file format|regulation\.bin|bnd|dcx|pak|load order|save file/.test(text)) types.add("game_modding_workflow"), types.add("research_quality");
  if (/api|weather|forecast|currency|exchange|github|gitlab|oauth|cors|integration|endpoint|webhook|suspicious domain|domain or ip|ip lookup|threat api/.test(text)) types.add("api_integration");
  if (/debug|failing|failure|bug|regression|broken|fix|ci|test/.test(text)) types.add("debugging"), types.add("testing");
  if (/prompt|instruction|agent behavior|system prompt|rewrite/.test(text)) types.add("prompt_improvement");
  if (/security|secure|gmail|pc|device|account|malware|secret|auth|vulnerability|safe|risk|threat/.test(text)) types.add("security_review");
  if (isVnemDevelopmentTask(text)) types.add("vnem_development");
  if (!types.size) types.add("general_task");
  return [...types];
}

function needsSkillModules(taskTypes) {
  return taskTypes.some((type) => ["website_ui", "frontend_ui", "debugging", "prompt_improvement", "security_review", "vnem_development"].includes(type));
}

function trimModule(module, tokenBudget) {
  const limit = instructionLimit(tokenBudget);
  return {
    id: module.id,
    kind: module.kind,
    name: module.name,
    source_id: module.source_id,
    task_types: take(module.task_types, 6),
    supported_agents: take(module.supported_agents, 6),
    why_selected: inferWhySelected(module),
    compact_instructions: take(module.compact_instructions, limit),
    when_to_use: take(module.when_to_use, tokenBudget === "expanded" ? 4 : tokenBudget === "normal" ? 2 : 1),
    when_not_to_use: take(module.when_not_to_use, tokenBudget === "expanded" ? 4 : tokenBudget === "normal" ? 2 : 1),
    required_evidence: take(module.required_evidence, tokenBudget === "expanded" ? 4 : 2),
    compatibility: take(module.compatibility, tokenBudget === "compact" ? 2 : 5),
    avoid_with: take(module.avoid_with, tokenBudget === "compact" ? 2 : 5),
    risks: take(module.risks, tokenBudget === "compact" ? 3 : 6),
    verification_requirements: take(module.verification_requirements, tokenBudget === "expanded" ? 4 : 2),
    what_not_to_do: take(module.avoid_with, tokenBudget === "compact" ? 2 : 4),
    token_budget_guidance: module.token_budget_guidance || tokenBudget,
    full_detail_uri: module.full_detail_uri,
    source_url: tokenBudget === "expanded" ? module.source_url : undefined,
    review_status: tokenBudget === "compact" ? undefined : module.review_status
  };
}

function inferWhySelected(module) {
  if (module.kind === "workflow") return `Workflow applies to ${take(module.task_types, 3).join(", ")}.`;
  if (module.kind === "skill") return "Skill guidance matched the task; Core MCP applies guidance only, not installation.";
  if (module.kind === "api") return "API candidate matched the integration task; Core MCP plans safety, not live calls.";
  return "Selected by VNEM task routing.";
}

function selfFocusPolicy(task) {
  return isVnemDevelopmentTask(task)
    ? "This task explicitly targets VNEM development, so VNEM repo rules may apply."
    : "Focus on the user task and real deliverable; do not improve VNEM or redirect work into VNEM self-improvement unless explicitly asked.";
}

function isVnemDevelopmentTask(task) {
  return /\bvnem\b|core mcp|precision mcp|super mcp|capability library/i.test(String(task || ""));
}

function coreSafetyBoundaries() {
  return {
    core_mcp_read_only: true,
    core_mcp_installs_skills: false,
    core_mcp_executes_scripts: false,
    core_mcp_calls_apis: false,
    core_mcp_mutates_files: false,
    precision_or_tools_mcp_required_for_execution: true
  };
}

function inferAppType(context = "") {
  const text = normalize(context);
  if (/frontend|browser|react|next/.test(text)) return "frontend";
  if (/backend|server|api route/.test(text)) return "backend";
  if (/fullstack/.test(text)) return "fullstack";
  if (/cli/.test(text)) return "cli";
  return "unknown";
}

function instructionLimit(tokenBudget) {
  return tokenBudget === "expanded" ? 8 : tokenBudget === "normal" ? 6 : 4;
}

function normalizeBudget(value) {
  return TOKEN_BUDGETS.has(value) ? value : "compact";
}

function clampNumber(value, fallback, min, max) {
  const number = Number(value || fallback);
  return Math.max(min, Math.min(max, Number.isFinite(number) ? number : fallback));
}

function take(value, limit) {
  return Array.isArray(value) ? value.filter(Boolean).slice(0, limit) : [];
}

function unique(values) {
  return [...new Set((values || []).filter(Boolean).map((value) => String(value)))];
}

function arrayify(value) {
  if (Array.isArray(value)) return value.filter(Boolean).map((item) => typeof item === "string" ? item : JSON.stringify(item));
  if (!value) return [];
  if (typeof value === "string") return value.trim() ? [value.trim()] : [];
  return [JSON.stringify(value)];
}

function dedupeModules(modules) {
  const seen = new Set();
  const result = [];
  for (const module of modules) {
    if (!module?.id || seen.has(module.id)) continue;
    seen.add(module.id);
    result.push(module);
  }
  return result;
}

function shortHash(value) {
  return createHash("sha256").update(value).digest("hex").slice(0, 10);
}

function normalize(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9+#._/-]+/g, " ").replace(/\s+/g, " ").trim();
}
