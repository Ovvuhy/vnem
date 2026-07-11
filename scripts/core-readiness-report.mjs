#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const rel = (value) => path.join(rootDir, value);
const json = async (file) => JSON.parse(await readFile(rel(file), "utf8"));
const text = async (file) => readFile(rel(file), "utf8");
const git = (...args) => {
  try {
    return execFileSync("git", args, { cwd: rootDir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "unknown";
  }
};

const library = await json("capabilities/super-library.json");
const usablePacks = await json("capabilities/usable-capability-packs.json");
const serverSource = await text("scripts/vnem-mcp-server.mjs");
const mcpTestSource = await text("scripts/test-mcp-server.mjs");
const coreToolSelectionTestSource = await text("scripts/test-core-tool-selection.mjs");
const coreToolsEcosystemTestSource = await text("scripts/test-core-tools-tool-ecosystem.mjs");
const coreBrowserPlanningTestSource = await text("scripts/test-core-browser-research-planning.mjs");
const coreSearchPlanningTestSource = await text("scripts/test-core-search-planning.mjs");
const coreRoutingMemoryOutputTestSource = await text("scripts/test-core-routing-memory-output.mjs");
const coreOutputQualityTestSource = await text("scripts/test-core-output-quality.mjs");
const coreAntiStagnationTestSource = await text("scripts/test-core-anti-stagnation.mjs");
const corePermissionPlanningTestSource = await text("scripts/test-core-permission-planning.mjs");
const coreResearchStrategyTestSource = await text("scripts/test-core-research-strategy.mjs");
const coreSourceIngestionPlanningTestSource = await text("scripts/test-core-source-ingestion-planning.mjs");
const researchEvidenceAuditTestSource = await text("scripts/test-research-evidence-audit.mjs");
const coreDebuggingPlanTestSource = await text("scripts/test-core-debugging-plan.mjs");
const coreEvidenceToFixTestSource = await text("scripts/test-core-evidence-to-fix.mjs");
const coreCodeQualityContractTestSource = await text("scripts/test-core-code-quality-contract.mjs");
const completionAuditCodeQualityTestSource = await text("scripts/test-completion-audit-code-quality.mjs");
const coreUiQualityPlanTestSource = await text("scripts/test-core-ui-quality-plan.mjs");
const coreVisualProofContractTestSource = await text("scripts/test-core-visual-proof-contract.mjs");
const uiCompletionAuditTestSource = await text("scripts/test-ui-completion-audit.mjs");
const coreAdaptiveEffortTestSource = await text("scripts/test-core-adaptive-effort.mjs");
const coreFastAnswerContractTestSource = await text("scripts/test-core-fast-answer-contract.mjs");
const coreAntiOverheadAuditTestSource = await text("scripts/test-core-anti-overhead-audit.mjs");
const coreDesignAmbitionTestSource = await text("scripts/test-core-design-ambition.mjs");
const coreVisualTasteAuditTestSource = await text("scripts/test-core-visual-taste-audit.mjs");
const coreRedesignComparisonScorecardTestSource = await text("scripts/test-core-redesign-comparison-scorecard.mjs");
const coreTotalImpactDesignPlanTestSource = await text("scripts/test-core-total-impact-design-plan.mjs");
const coreDesignDirectionSelectorTestSource = await text("scripts/test-core-design-direction-selector.mjs");
const coreCompactOutputContractTestSource = await text("scripts/test-core-compact-output-contract.mjs");
const coreSpeedDesign2AuditTestSource = await text("scripts/test-core-speed-design-2-audit.mjs");
const toolsSourceIngestionTestSource = await text("scripts/test-tools-source-ingestion.mjs");
const toolsSourceGraphTestSource = await text("scripts/test-tools-source-graph.mjs");
const mcpUserSmokeTestSource = await text("scripts/test-mcp-user-smoke.mjs");
const adoptionReliabilityTestSource = await text("scripts/test-vnem-adoption-reliability-1-regression.mjs");
const adoptionReliability2TestSource = await text("scripts/test-vnem-adoption-reliability-2-regression.mjs");
const installAdoptionTestSource = await text("scripts/test-vnem-install-adoption-1-regression.mjs");
const readme = await text("README.md");
const installGuide = await text(".vnem/install-guide.md");
const packageJson = await json("package.json");
const toolInventory = parseDefaultTools(serverSource);
const forbiddenCoreTools = toolInventory.filter((tool) => !(["vnem_build_browser_research_plan", "vnem_build_browsing_plan"].includes(tool)) && /terminal|browser|filesystem|file_write|apply_diff|patch_file|github|exec|execute|shell|api_call|live_call|install_skill|run_skill/i.test(tool));
const apiCounts = countApis(library.apis || []);
const skillCounts = countSkills(library.skills || []);
const fixtureCoverage = {
  skills_html: existsSync(rel("fixtures/super-library/skills-sh-sample.html")),
  agent_skills_tree_json: existsSync(rel("fixtures/super-library/agent-skills-tree-sample.json")),
  public_apis_markdown: existsSync(rel("fixtures/super-library/public-apis-sample.md")),
  skill_md_sample: existsSync(rel("fixtures/super-library/skill-md-sample.md")),
  api_verification_sample_json: existsSync(rel("fixtures/super-library/api-verification-sample.json")),
  importer_test: existsSync(rel("scripts/test-super-library-importer.mjs"))
};
const docsGeneratedArtifacts = {
  readme_api_profile: readme.includes("vnem_api_safety_profile"),
  readme_skill_profile: readme.includes("vnem_skill_safety_profile"),
  readme_real_user_examples: /weather widget|Elden Ring|modding|final proof/i.test(readme),
  install_api_profile: installGuide.includes("vnem_api_safety_profile"),
  install_skill_profile: installGuide.includes("vnem_skill_safety_profile"),
  generated_install_tgz: existsSync(rel("public/install.tgz")) && statSync(rel("public/install.tgz")).size > 0,
  install_usable_pack_handoff: /usable API\/skill packs|vnem_prepare_tools_handoff|future Tools MCP|currency converters|suspicious domain\/IP/i.test(installGuide),
  landing_install_tgz: existsSync(rel("landing/install.tgz")) && statSync(rel("landing/install.tgz")).size > 0
};
const proofAuditProtection = {
  vnem_completion_audit: toolInventory.includes("vnem_completion_audit"),
  vnem_protection_review: toolInventory.includes("vnem_protection_review"),
  vnem_proof_trail: toolInventory.includes("vnem_proof_trail")
};
const domainCoverage = {
  ui_backend_data_flow: /data flow|data-flow|Backend-to-UI/i.test(serverSource + readme),
  game_build_context: /PvE\/PvP|rune level|DLC|Shadow of the Erdtree/i.test(serverSource + readme),
  modding_pipeline: /file-format|file format|backup|restore|toolchain|modding/i.test(serverSource + readme),
  api_secret_cors_boundary: /CORS|secret|backend proxy|API-key/i.test(serverSource + readme)
};
const realTaskExamplesTested = [
  { id: "elden_ring_build", tested: /Give me the best overpowered Elden Ring build/i.test(mcpTestSource) },
  { id: "weather_widget_api", tested: /Build a weather widget for my web app/i.test(mcpTestSource) },
  { id: "currency_converter_api", tested: /Build a currency converter feature/i.test(mcpTestSource) },
  { id: "github_repo_helper", tested: /Build a repo issue triage helper/i.test(mcpTestSource) },
  { id: "suspicious_domain_ip", tested: /suspicious domain or IP/i.test(mcpTestSource) },
  { id: "ui_backend_visibility", tested: /backend feature is actually visible|dashboard UI and prove/i.test(mcpTestSource) },
  { id: "elden_ring_modding", tested: /Improve this Elden Ring mod and make real file changes/i.test(mcpTestSource) },
  { id: "gmail_pc_security", tested: /Gmail and PC as secure as possible/i.test(mcpTestSource) },
  { id: "repo_debugging", tested: /Fix this repo issue and prove it works/i.test(mcpTestSource) }
];
const taskBoostingStatus = {
  vnem_boost_task_exists: toolInventory.includes("vnem_boost_task"),
  uses_skill_guidance: /selected_skill_guidance|selected_usable_skill_packs|selectUsableSkillPacks/i.test(serverSource),
  uses_api_guidance_when_relevant: /selected_api_guidance|selected_usable_api_packs|selectUsableApiPacks/i.test(serverSource),
  includes_workflow_and_proof: /workflow_steps|proof_trail_inputs|completion_checklist/i.test(serverSource),
  real_task_examples_tested: realTaskExamplesTested.filter((item) => item.tested).map((item) => item.id),
  all_required_examples_tested: realTaskExamplesTested.every((item) => item.tested)
};
const toolSelectionStatus = {
  tool_selection_available: toolInventory.includes("vnem_select_tools_for_task") && /selectToolsForTask/.test(serverSource),
  tools_plan_available: toolInventory.includes("vnem_build_tools_plan") && /buildCoreToolsPlan/.test(serverSource),
  coding_task_tool_plan: /vnem_tools_workspace_map/.test(coreToolSelectionTestSource) && /vnem_tools_apply_patch_batch/.test(coreToolSelectionTestSource) && /vnem_tools_run_project_task/.test(coreToolSelectionTestSource),
  research_task_tool_plan: /vnem_tools_source_quality_check/.test(coreToolSelectionTestSource) && /vnem_tools_research_brief/.test(coreToolSelectionTestSource) && /does not fake web search|web search happened/i.test(coreToolSelectionTestSource),
  debugging_logs_first_plan: /logs first/i.test(coreToolSelectionTestSource + serverSource),
  must_not_claim_present: /must_not_claim/.test(serverSource) && /must_not_claim/.test(coreToolSelectionTestSource),
  core_does_not_execute_tools: /core_executes_tools:\s*false/.test(serverSource) && /Core must not expose Tools mutation tools directly/.test(coreToolSelectionTestSource) && /Core executed Tools MCP actions/.test(serverSource)
};
const browserResearchPlanningStatus = {
  browser_research_planning_available: toolInventory.includes("vnem_build_browser_research_plan") && toolInventory.includes("vnem_explain_tools_chain") && /buildBrowserResearchPlan/.test(serverSource),
  direct_url_plan_status: /vnem_tools_fetch_url_text/.test(coreBrowserPlanningTestSource) && /vnem_tools_browser_page_inspect/.test(coreBrowserPlanningTestSource) && /vnem_tools_browser_research_pack/.test(coreBrowserPlanningTestSource),
  website_understanding_plan_status: /vnem_tools_browser_readability_extract/.test(coreBrowserPlanningTestSource) && /vnem_tools_browser_link_map/.test(coreBrowserPlanningTestSource) && /vnem_tools_browser_dom_search/.test(coreBrowserPlanningTestSource),
  current_research_requires_external_search_status: /external current search|required/i.test(coreBrowserPlanningTestSource) && /currentResearchRequired/.test(serverSource),
  local_ui_browser_plan_status: /vnem_tools_browser_accessibility_audit/.test(coreBrowserPlanningTestSource) && /vnem_tools_browser_compare_snapshots/.test(coreBrowserPlanningTestSource) && /vnem_tools_browser_capture/.test(coreBrowserPlanningTestSource),
  core_browser_must_not_claim_status: /web search happened/i.test(coreBrowserPlanningTestSource) && /Core executed Tools/i.test(coreBrowserPlanningTestSource + serverSource),
  core_browser_plan_only_status: /Core must remain plan-only/.test(coreBrowserPlanningTestSource) && /core_executes_tools:\s*false/.test(serverSource)
};


const searchPlanningStatus = {
  research_need_assessment_status: toolInventory.includes("vnem_assess_research_need") && /assessResearchNeed/.test(serverSource) && /current_info_required/.test(coreSearchPlanningTestSource),
  search_plan_status: toolInventory.includes("vnem_build_search_plan") && /buildSearchPlan/.test(serverSource) && /vnem_tools_web_search/.test(coreSearchPlanningTestSource) && /provider evidence|provider status|provider-backed/i.test(serverSource + coreSearchPlanningTestSource),
  browsing_plan_status: toolInventory.includes("vnem_build_browsing_plan") && /buildBrowsingPlan/.test(serverSource) && /vnem_tools_redirect_chain_check/.test(coreSearchPlanningTestSource) && /vnem_tools_url_reputation_check/.test(coreSearchPlanningTestSource),
  captcha_handling_plan_status: /captchaHandlingPlan/.test(serverSource) && /No automatic CAPTCHA bypass was attempted or provided/.test(serverSource + coreSearchPlanningTestSource),
  download_safety_plan_status: /downloadSafetyPlan/.test(serverSource) && /Do not download or run installers automatically/.test(serverSource + coreSearchPlanningTestSource),
  freshness_detection_status: /freshness_requirement/.test(serverSource) && /latest current/.test(coreSearchPlanningTestSource + serverSource),
  core_plan_only_status: /core_executes_tools:\s*false/.test(serverSource) && /web_search_executed:\s*false/.test(serverSource) && /Core must not expose Tools directly/.test(coreSearchPlanningTestSource) && /Core executed Tools/.test(serverSource + coreSearchPlanningTestSource)
};

const routingMemoryOutputStatus = {
  route_task_status: toolInventory.includes("vnem_route_task") && /buildCoreRoutingRecord/.test(serverSource) && /routing_record/.test(coreRoutingMemoryOutputTestSource),
  task_categories_status: /CORE_TASK_CATEGORIES/.test(serverSource) && /dashboard\/control-surface work/.test(serverSource + coreRoutingMemoryOutputTestSource) && /coding\/debugging/.test(coreRoutingMemoryOutputTestSource),
  memory_relevance_status: /classifyMemoryForTask/.test(serverSource) && /relevant_memory_used/.test(coreRoutingMemoryOutputTestSource) && /memory_ignored/.test(coreRoutingMemoryOutputTestSource) && /outdated/.test(coreRoutingMemoryOutputTestSource),
  missing_context_decision_status: /buildMaterialMissingContext/.test(serverSource) && /must_ask_user/.test(coreRoutingMemoryOutputTestSource) && /simple documentation task should not over-ask/.test(coreRoutingMemoryOutputTestSource),
  output_quality_plan_status: toolInventory.includes("vnem_output_quality_plan") && /buildOutputQualityPlan/.test(serverSource) && /compact_first_order/.test(coreOutputQualityTestSource),
  anti_stagnation_status: toolInventory.includes("vnem_anti_stagnation_check") && /buildAntiStagnationCheck/.test(serverSource) && /repeating already-covered improvement area/.test(coreAntiStagnationTestSource),
  evidence_ledger_status: /evidence_ledger/.test(serverSource + await text("scripts/lib/quality-contracts.mjs")) && /proven/.test(coreOutputQualityTestSource) && /preparation_only/.test(coreOutputQualityTestSource),
  plan_only_status: /core_plan_only:\s*true/.test(serverSource) && /Core must remain plan-only/.test(coreRoutingMemoryOutputTestSource)
};

const corePermissionAwarenessStatus = {
  core_permission_awareness_status: /buildCorePermissionProfilePlan/.test(serverSource) && /tools_permission_planning/.test(serverSource) && /permission_profile_plan/.test(corePermissionPlanningTestSource),
  trust_boundary_planning_status: /trust_boundary_level/.test(serverSource) && /6_blocked_dangerous_action/.test(corePermissionPlanningTestSource + serverSource),
  approval_required_planning_status: /actions_requiring_approval/.test(serverSource) && /approved-writes|safe-local-dev/.test(corePermissionPlanningTestSource + serverSource),
  blocked_action_planning_status: /actions_blocked_by_current_profile/.test(serverSource) && /package_install|github_pr|secret_read/.test(corePermissionPlanningTestSource + serverSource),
  core_still_plan_only_status: /core_executes_tools:\s*false/.test(serverSource) && /Core must not expose Tools action\/status tool directly/.test(corePermissionPlanningTestSource)
};

const coreResearchSourceStatus = {
  research_strategy_status: toolInventory.includes("vnem_build_research_strategy") && /buildResearchStrategy/.test(serverSource) && /currentness_required/.test(coreResearchStrategyTestSource) && /web_search_executed:\s*false/.test(serverSource),
  source_ingestion_plan_status: toolInventory.includes("vnem_build_source_ingestion_plan") && /buildSourceIngestionPlan/.test(serverSource) && /source_targets/.test(coreSourceIngestionPlanningTestSource) && /broad_crawl_allowed:\s*false/.test(serverSource),
  research_evidence_audit_status: toolInventory.includes("vnem_research_evidence_audit") && /buildResearchEvidenceAudit/.test(serverSource) && /current-info claim without current source/.test(researchEvidenceAuditTestSource + serverSource),
  source_graph_planning_status: /vnem_tools_source_graph/.test(serverSource) && /source graph/i.test(coreResearchStrategyTestSource + coreSourceIngestionPlanningTestSource + serverSource),
  contradiction_detection_planning_status: /contradiction_check_needed/.test(serverSource) && /contradiction-free claim without multiple relevant sources/.test(researchEvidenceAuditTestSource + serverSource),
  freshness_confidence_status: /freshness_check_needed/.test(serverSource) && /confidence_limit/.test(serverSource) && /outdated/.test(researchEvidenceAuditTestSource + toolsSourceGraphTestSource),
  core_research_still_plan_only_status: /core_executes_tools:\s*false/.test(serverSource) && /Core searched the web or browsed pages/.test(serverSource + coreResearchStrategyTestSource) && /Core crawled\/read\/extracted sources/.test(serverSource + coreSourceIngestionPlanningTestSource)
};

const coreDebuggingCodeQualityStatus = {
  debugging_plan_status: toolInventory.includes("vnem_build_debugging_plan") && /buildDebuggingPlan/.test(serverSource) && /logs_or_output_to_check_first/.test(serverSource) && /failing command/.test(coreDebuggingPlanTestSource),
  evidence_to_fix_check_status: toolInventory.includes("vnem_evidence_to_fix_check") && /buildEvidenceToFixCheck/.test(serverSource) && /docs-only/.test(coreEvidenceToFixTestSource) && /skipped|disabled/.test(coreEvidenceToFixTestSource),
  architecture_map_status: toolInventory.includes("vnem_build_architecture_map") && /buildArchitectureMap/.test(serverSource) && /integration_points/.test(coreCodeQualityContractTestSource + serverSource),
  code_change_contract_status: toolInventory.includes("vnem_code_change_contract") && /buildCodeChangeContract/.test(serverSource) && /real_integration_point/.test(coreCodeQualityContractTestSource + serverSource),
  completion_audit_debugging_status: /Fixed claim lacks targeted verification/.test(await text("scripts/lib/quality-contracts.mjs")) && /mock-only/.test(completionAuditCodeQualityTestSource),
  completion_audit_integration_status: /unwired helper|real MCP registry|parallel fake system/i.test(await text("scripts/lib/quality-contracts.mjs") + completionAuditCodeQualityTestSource),
  core_debugging_still_plan_only_status: /core_plan_only:\s*true/.test(serverSource) && /Core inspected logs or ran tests/.test(serverSource + coreDebuggingPlanTestSource),
  targeted_verification_planning_status: /targeted_tests_or_checks/.test(serverSource) && /targeted_verification_required/.test(serverSource + coreEvidenceToFixTestSource)
};


const coreUiWebQualityStatus = {
  ui_quality_plan_status: toolInventory.includes("vnem_build_ui_quality_plan") && /buildUiQualityPlan/.test(serverSource) && /visual_evidence_required/.test(coreUiQualityPlanTestSource + serverSource),
  ui_browser_evidence_run_handoff_status: /vnem_tools_browser_evidence_run/.test(serverSource + coreUiQualityPlanTestSource + mcpUserSmokeTestSource) && /core_plan_only:\s*true/.test(serverSource) && /core_executes_browser:\s*false/.test(serverSource),
  visual_proof_contract_status: toolInventory.includes("vnem_visual_proof_contract") && /buildVisualProofContract/.test(serverSource) && /responsive_fix/.test(coreVisualProofContractTestSource + serverSource),
  ui_completion_audit_status: /UI improved\/visual claim lacks screenshot|Responsive claim lacks multiple viewport|Accessibility claim lacks accessibility audit/i.test(await text("scripts/lib/quality-contracts.mjs")) && /test:ui-completion-audit|ui_findings|missing_evidence/.test(JSON.stringify(packageJson.scripts) + uiCompletionAuditTestSource),
  ui_route_component_planning_status: /routes_or_components_to_check|route\/component render evidence|vnem_tools_ui_surface_review/.test(serverSource + coreUiQualityPlanTestSource),
  ui_state_coverage_planning_status: /empty_loading_error_states_required|loading.*empty.*error|state evidence/.test(serverSource + coreUiQualityPlanTestSource + coreVisualProofContractTestSource),
  core_ui_still_plan_only_status: /core_plan_only:\s*true/.test(serverSource) && /core_executes_browser:\s*false/.test(serverSource) && /Core opened a browser|Core captured screenshots/.test(serverSource + coreUiQualityPlanTestSource)
};

const coreAdaptiveSpeedDesignStatus = {
  adaptive_effort_status: toolInventory.includes("vnem_plan_effort_budget") && /buildEffortBudget/.test(serverSource) && /instant_answer/.test(coreAdaptiveEffortTestSource) && /max_verification/.test(coreAdaptiveEffortTestSource),
  fast_answer_contract_status: toolInventory.includes("vnem_fast_answer_contract") && /buildFastAnswerContract/.test(serverSource) && /forbidden_overhead/.test(coreFastAnswerContractTestSource + serverSource),
  harsh_truth_status: /truth_over_comfort_status|no_sugarcoating_status|uncertainty_must_be_labeled_status|harsh_truth_quality_status/.test(serverSource) && /uncertainty|fake certainty|false certainty/i.test(coreFastAnswerContractTestSource + serverSource),
  clarification_discipline_status: /clarification_question_needed|question_count_limit|assumption_must_be_labeled/.test(serverSource) && /pointless clarification|one precise question|materially/.test(serverSource + coreFastAnswerContractTestSource),
  wasted_tool_audit_status: /wasted_tool_usage_status|irrelevant_tool_calls|tool_use_missing_when_needed|tool_use_should_have_been_skipped/.test(await text("scripts/lib/quality-contracts.mjs")) && /wasted_tool_usage_status/.test(coreAntiOverheadAuditTestSource),
  anti_overhead_audit_status: /anti_overhead_findings|overused deep verification on simple stable task|proof section without proof/.test(await text("scripts/lib/quality-contracts.mjs") + coreAntiOverheadAuditTestSource),
  design_ambition_status: toolInventory.includes("vnem_design_ambition_plan") && /buildDesignAmbitionPlan/.test(serverSource) && /adapt to business|force_user_to_choose_design_directions|generic template/i.test(serverSource + coreDesignAmbitionTestSource),
  visual_taste_audit_status: toolInventory.includes("vnem_visual_taste_audit") && /buildVisualTasteAudit/.test(serverSource) && /boring_or_generic_risk|template_like_risk|mismatch_with_user_requested_style/.test(serverSource + coreVisualTasteAuditTestSource),
  redesign_comparison_scorecard_status: toolInventory.includes("vnem_redesign_comparison_scorecard") && /buildRedesignComparisonScorecard/.test(serverSource) && /inflated_design_score|unsupported_original_vs_new_score|visual_superiority_proven/.test(serverSource + coreRedesignComparisonScorecardTestSource),
  total_impact_design_plan_status: toolInventory.includes("vnem_total_impact_design_plan") && /buildTotalImpactDesignPlan/.test(serverSource) && /total_impact_required|avoid_one_axis_optimization|comparison_scorecard_required/.test(serverSource + coreTotalImpactDesignPlanTestSource),
  design_direction_selector_status: toolInventory.includes("vnem_design_direction_selector") && /buildDesignDirectionSelector/.test(serverSource) && /total_impact_not_one_axis|warm local delivery-first|rejected_directions/.test(serverSource + coreDesignDirectionSelectorTestSource),
  compact_output_contract_status: toolInventory.includes("vnem_compact_output_contract") && /buildCompactOutputContract/.test(serverSource) && /compact_output_too_vague|compact_output_hid_material_caveat|compact_output_removed_needed_proof/.test(serverSource + coreCompactOutputContractTestSource),
  speed_design_2_audit_status: /inflated_design_score|claimed_better_without_before_after|new_design_worse_or_mixed_but_claimed_success|compact_output_removed_needed_proof/.test(await text("scripts/lib/quality-contracts.mjs") + coreSpeedDesign2AuditTestSource),
  route_effort_categories_status: /simple_stable_question|prompt_improvement|ui_redesign|current_research|repo_modification|deployment_workflow/.test(serverSource + coreAdaptiveEffortTestSource),
  boost_adaptive_design_status: /adaptive_effort|design_behavior|visual_ambition_required|wasted_tool_risk|total_impact_required|comparison_scorecard_required/.test(serverSource)
};

const usablePackStatus = {
  usable_api_pack_count: Array.isArray(usablePacks.apis) ? usablePacks.apis.filter((pack) => pack.usable_status === "usable").length : 0,
  usable_skill_pack_count: Array.isArray(usablePacks.skills) ? usablePacks.skills.filter((pack) => pack.usable_status === "usable").length : 0,
  api_minimum_met: (usablePacks.apis || []).filter((pack) => pack.usable_status === "usable").length >= (usablePacks.minimums?.usable_api_packs || 20),
  skill_minimum_met: (usablePacks.skills || []).filter((pack) => pack.usable_status === "usable").length >= (usablePacks.minimums?.usable_skill_packs || 15),
  tools_handoff_status: toolInventory.includes("vnem_prepare_tools_handoff") && /required_tool_capabilities|blocked_until_tools_mcp|safe_core_actions/i.test(serverSource + mcpTestSource),
  boost_task_uses_usable_packs: /selected_usable_api_packs|selected_usable_skill_packs/i.test(serverSource + mcpTestSource),
  raw_records_not_counted_as_usable: (usablePacks.apis || []).length < (library.apis || []).length && (usablePacks.skills || []).length < (library.skills || []).length
};

const coreAdoptionReliabilityStatus = {
  core_entrypoint_status: toolInventory.includes("vnem_entrypoint") && /buildCoreEntrypoint/.test(serverSource) && /should_use_vnem/.test(serverSource) && /vnem_entrypoint/.test(adoptionReliabilityTestSource),
  core_usage_contract_status: toolInventory.includes("vnem_usage_contract") && /buildCoreUsageContract/.test(serverSource) && /core_role/.test(serverSource) && /vnem_usage_contract/.test(adoptionReliabilityTestSource),
  core_tools_handoff_status: /recommended_tools_calls/.test(serverSource) && /tools_handoff/.test(serverSource) && /core_runtime_dependency:\s*false/.test(serverSource) && /vnem_tools_repo_deep_map/.test(adoptionReliabilityTestSource),
  core_adoption_reliability_status: /when_tools_mcp_is_needed/.test(serverSource) && /what_core_cannot_do/.test(serverSource) && /no_placebo_risks/.test(serverSource) && /disconnected_agent_limit/.test(serverSource + adoptionReliabilityTestSource),
  core_visibility_doctor_status: toolInventory.includes("vnem_mcp_visibility_doctor") && /buildCoreVisibilityDoctor/.test(serverSource) && /core-visibility-doctor/.test(adoptionReliability2TestSource),
  core_underuse_detector_status: toolInventory.includes("vnem_underuse_detector") && /buildCoreUnderuseDetector/.test(serverSource) && /core-underuse-detector/.test(adoptionReliability2TestSource),
  core_adoption_description_status: /core-description-discovery/.test(adoptionReliability2TestSource) && /first-call/.test(serverSource) && /visibility doctor/.test(serverSource),
  core_adoption_reliability_2_status: /vnem_mcp_visibility_doctor/.test(serverSource) && /vnem_underuse_detector/.test(serverSource) && /vnem Tools ADOPTION-RELIABILITY-2/.test(adoptionReliability2TestSource)
};

const coreInstallAdoptionStatus = {
  core_install_adoption_guide_status: toolInventory.includes("vnem_install_adoption_guide") && /buildInstallAdoptionGuide/.test(serverSource) && /mcp-core-install-guide/.test(installAdoptionTestSource),
  core_install_profile_guidance_status: /Codex|Claude|Antigravity-style|generic MCP stdio/.test(serverSource) && /emit-codex-profile/.test(installAdoptionTestSource) && /emit-claude-profile/.test(installAdoptionTestSource),
  core_install_adoption_1_status: /vnem_install_adoption_guide/.test(serverSource) && /test:vnem-install-adoption-1-regression/.test(JSON.stringify(packageJson.scripts)) && /both-mcps-present/.test(installAdoptionTestSource)
};

assert.ok(toolInventory.includes("vnem_api_safety_profile"), "Core MCP API safety profile tool is missing");
assert.ok(toolInventory.includes("vnem_skill_safety_profile"), "Core MCP skill safety profile tool is missing");
assert.equal(forbiddenCoreTools.length, 0, `Default Core MCP exposes high-power-looking tool names: ${forbiddenCoreTools.join(", ")}`);
assert.ok((library.skills || []).length > 0, "skill library is empty");
assert.ok((library.apis || []).length > 0, "API library is empty");
assert.ok(Object.values(fixtureCoverage).every(Boolean), "fixture importer coverage is incomplete");
assert.ok(Object.values(proofAuditProtection).every(Boolean), "proof/audit/protection tool coverage is incomplete");
assert.ok(taskBoostingStatus.vnem_boost_task_exists, "task boosting tool is missing");
assert.ok(usablePackStatus.api_minimum_met, "usable API pack count is below minimum");
assert.ok(usablePackStatus.skill_minimum_met, "usable skill pack count is below minimum");
assert.ok(usablePackStatus.tools_handoff_status, "Tools handoff status is incomplete");
assert.ok(usablePackStatus.boost_task_uses_usable_packs, "boost task does not use usable packs");
assert.ok(usablePackStatus.raw_records_not_counted_as_usable, "raw discovered records appear to be counted as usable");
assert.ok(taskBoostingStatus.all_required_examples_tested, "real task boosting examples are not fully tested");
assert.ok(Object.values(toolSelectionStatus).every(Boolean), "Core tool-selection/tools-plan readiness is incomplete");
assert.ok(Object.values(browserResearchPlanningStatus).every(Boolean), "Core browser/research planning readiness is incomplete");
assert.ok(Object.values(searchPlanningStatus).every(Boolean), "Core search/browsing planner readiness is incomplete");
assert.ok(Object.values(routingMemoryOutputStatus).every(Boolean), "Core routing/memory/output-quality/anti-stagnation readiness is incomplete");
assert.ok(Object.values(corePermissionAwarenessStatus).every(Boolean), "Core permission-awareness/trust-boundary planning readiness is incomplete");
assert.ok(Object.values(coreResearchSourceStatus).every(Boolean), "Core research/source-ingestion readiness is incomplete");
assert.ok(Object.values(coreDebuggingCodeQualityStatus).every(Boolean), "Core debugging/code-quality readiness is incomplete");
assert.ok(Object.values(coreUiWebQualityStatus).every(Boolean), "Core UI/web quality readiness is incomplete");
assert.ok(Object.values(coreAdaptiveSpeedDesignStatus).every(Boolean), "Core adaptive effort / speed-design readiness is incomplete");
assert.ok(Object.values(coreAdoptionReliabilityStatus).every(Boolean), "Core adoption reliability readiness is incomplete");
assert.ok(Object.values(coreInstallAdoptionStatus).every(Boolean), "Core install adoption readiness is incomplete");
assert.ok(packageJson.scripts?.["test:core-adaptive-effort"] === "node scripts/test-core-adaptive-effort.mjs", "test:core-adaptive-effort package script is missing");
assert.ok(packageJson.scripts?.["test:core-fast-answer-contract"] === "node scripts/test-core-fast-answer-contract.mjs", "test:core-fast-answer-contract package script is missing");
assert.ok(packageJson.scripts?.["test:core-anti-overhead-audit"] === "node scripts/test-core-anti-overhead-audit.mjs", "test:core-anti-overhead-audit package script is missing");
assert.ok(packageJson.scripts?.["test:core-design-ambition"] === "node scripts/test-core-design-ambition.mjs", "test:core-design-ambition package script is missing");
assert.ok(packageJson.scripts?.["test:core-visual-taste-audit"] === "node scripts/test-core-visual-taste-audit.mjs", "test:core-visual-taste-audit package script is missing");
assert.ok(packageJson.scripts?.["test:core-ui-quality-plan"] === "node scripts/test-core-ui-quality-plan.mjs", "test:core-ui-quality-plan package script is missing");
assert.ok(packageJson.scripts?.["test:core-visual-proof-contract"] === "node scripts/test-core-visual-proof-contract.mjs", "test:core-visual-proof-contract package script is missing");
assert.ok(packageJson.scripts?.["test:ui-completion-audit"] === "node scripts/test-ui-completion-audit.mjs", "test:ui-completion-audit package script is missing");
assert.ok(packageJson.scripts?.["test:browser-evidence-completion-audit"] === "node scripts/test-browser-evidence-completion-audit.mjs", "test:browser-evidence-completion-audit package script is missing");
assert.ok(packageJson.scripts?.["test:core-research-strategy"] === "node scripts/test-core-research-strategy.mjs", "test:core-research-strategy package script is missing");
assert.ok(packageJson.scripts?.["test:core-source-ingestion-planning"] === "node scripts/test-core-source-ingestion-planning.mjs", "test:core-source-ingestion-planning package script is missing");
assert.ok(packageJson.scripts?.["test:research-evidence-audit"] === "node scripts/test-research-evidence-audit.mjs", "test:research-evidence-audit package script is missing");
assert.ok(packageJson.scripts?.["test:tools-source-ingestion"] === "node scripts/test-tools-source-ingestion.mjs", "test:tools-source-ingestion package script is missing");
assert.ok(packageJson.scripts?.["test:tools-source-graph"] === "node scripts/test-tools-source-graph.mjs", "test:tools-source-graph package script is missing");
assert.ok(packageJson.scripts?.["test:core-browser-research-planning"] === "node scripts/test-core-browser-research-planning.mjs", "test:core-browser-research-planning package script is missing");
assert.ok(packageJson.scripts?.["test:core-search-planning"] === "node scripts/test-core-search-planning.mjs", "test:core-search-planning package script is missing");
assert.ok(packageJson.scripts?.["test:core-debugging-plan"] === "node scripts/test-core-debugging-plan.mjs", "test:core-debugging-plan package script is missing");
assert.ok(packageJson.scripts?.["test:core-evidence-to-fix"] === "node scripts/test-core-evidence-to-fix.mjs", "test:core-evidence-to-fix package script is missing");
assert.ok(packageJson.scripts?.["test:core-code-quality-contract"] === "node scripts/test-core-code-quality-contract.mjs", "test:core-code-quality-contract package script is missing");
assert.ok(packageJson.scripts?.["test:completion-audit-code-quality"] === "node scripts/test-completion-audit-code-quality.mjs", "test:completion-audit-code-quality package script is missing");
assert.ok(packageJson.scripts?.["test:mcp-user-smoke"] === "node scripts/test-mcp-user-smoke.mjs", "test:mcp-user-smoke package script is missing");
assert.ok(packageJson.scripts?.["test:core-tool-selection"] === "node scripts/test-core-tool-selection.mjs", "test:core-tool-selection package script is missing");
assert.ok(packageJson.scripts?.["test:core-tools-ecosystem"] === "node scripts/test-core-tools-tool-ecosystem.mjs", "test:core-tools-ecosystem package script is missing");
assert.ok(packageJson.scripts?.["test:core-routing-memory-output"] === "node scripts/test-core-routing-memory-output.mjs", "test:core-routing-memory-output package script is missing");
assert.ok(packageJson.scripts?.["test:core-output-quality"] === "node scripts/test-core-output-quality.mjs", "test:core-output-quality package script is missing");
assert.ok(packageJson.scripts?.["test:core-anti-stagnation"] === "node scripts/test-core-anti-stagnation.mjs", "test:core-anti-stagnation package script is missing");
assert.ok(packageJson.scripts?.["test:core-permission-planning"] === "node scripts/test-core-permission-planning.mjs", "test:core-permission-planning package script is missing");
assert.ok(packageJson.scripts?.["test:core-adoption-entrypoint"] === "node scripts/test-vnem-adoption-reliability-1-regression.mjs --case=core-entrypoint", "test:core-adoption-entrypoint package script is missing");
assert.ok(packageJson.scripts?.["test:core-usage-contract"] === "node scripts/test-vnem-adoption-reliability-1-regression.mjs --case=core-usage-contract", "test:core-usage-contract package script is missing");
assert.ok(packageJson.scripts?.["test:vnem-adoption-reliability-1-regression"] === "node scripts/test-vnem-adoption-reliability-1-regression.mjs", "test:vnem-adoption-reliability-1-regression package script is missing");
assert.ok(packageJson.scripts?.["test:vnem-adoption-core-visibility"] === "node scripts/test-vnem-adoption-reliability-2-regression.mjs --case=core-visibility-doctor", "test:vnem-adoption-core-visibility package script is missing");
assert.ok(packageJson.scripts?.["test:vnem-adoption-core-underuse"] === "node scripts/test-vnem-adoption-reliability-2-regression.mjs --case=core-underuse-detector", "test:vnem-adoption-core-underuse package script is missing");
assert.ok(packageJson.scripts?.["test:vnem-adoption-cross-mcp"] === "node scripts/test-vnem-adoption-reliability-2-regression.mjs --case=cross-mcp-registered-names", "test:vnem-adoption-cross-mcp package script is missing");
assert.ok(packageJson.scripts?.["test:vnem-adoption-reliability-2-regression"] === "node scripts/test-vnem-adoption-reliability-2-regression.mjs", "test:vnem-adoption-reliability-2-regression package script is missing");
assert.ok(packageJson.scripts?.["core:readiness"], "package script core:readiness is missing");

const blockers = [];
if (!usablePackStatus.api_minimum_met) blockers.push("usable API pack count below minimum");
if (!usablePackStatus.skill_minimum_met) blockers.push("usable skill pack count below minimum");
if (!usablePackStatus.tools_handoff_status) blockers.push("Tools handoff status incomplete");
if (!usablePackStatus.boost_task_uses_usable_packs) blockers.push("boost task is not using usable packs");
if (apiCounts.docs_unknown_count > 0) blockers.push("some official API docs URLs remain unknown");
if (apiCounts.rate_limit_unknown_count > 0) blockers.push("some API rate limits remain unknown");
if (apiCounts.cors_unknown_count > 0) blockers.push("some API CORS values remain unknown");
if (skillCounts.unknown_client_compatibility_count > 0) blockers.push("some skill client compatibility remains unknown");
if (skillCounts.manual_review_required_count > 0) blockers.push("external skills still require manual review before install/execution");
if (!Object.values(docsGeneratedArtifacts).every(Boolean)) blockers.push("some docs/generated artifact consistency checks are missing");

const allTestsRunnable = Object.values(fixtureCoverage).every(Boolean) && Object.values(domainCoverage).every(Boolean) && Object.values(docsGeneratedArtifacts).filter(Boolean).length >= 5;
const readinessVerdict = !allTestsRunnable ? "blocked" : blockers.length ? "closer" : "not_ready";
assert.ok(["closer", "not_ready", "blocked"].includes(readinessVerdict), "readiness verdict must never be final");
assert.notEqual(readinessVerdict, "final", "Core MCP must not claim final readiness from this report");

const report = {
  readiness_verdict: readinessVerdict,
  branch: git("branch", "--show-current"),
  commit: git("rev-parse", "--short", "HEAD"),
  working_tree_status: git("status", "--short"),
  tool_inventory: {
    count: toolInventory.length,
    tools: toolInventory,
    read_only_status: forbiddenCoreTools.length === 0 ? "pass_default_core_has_no_high_power_tool_names" : "fail",
    forbidden_core_tool_names: forbiddenCoreTools
  },
  proof_trail_completion_audit_protection_review_status: proofAuditProtection,
  usable_pack_status: usablePackStatus,
  task_boosting_status: taskBoostingStatus,
  tool_selection_status: toolSelectionStatus,
  browser_research_planning_status: browserResearchPlanningStatus,
  search_planning_status: searchPlanningStatus,
  routing_memory_output_quality_status: routingMemoryOutputStatus,
  core_permission_awareness_status: corePermissionAwarenessStatus,
  core_research_source_status: coreResearchSourceStatus,
  core_debugging_code_quality_status: coreDebuggingCodeQualityStatus,
  core_ui_web_quality_status: coreUiWebQualityStatus,
  core_adaptive_speed_design_status: coreAdaptiveSpeedDesignStatus,
  core_adoption_reliability_status: coreAdoptionReliabilityStatus,
  core_install_adoption_status: coreInstallAdoptionStatus,
  core_adoption_reliability_2_test_exists: existsSync(rel("scripts/test-vnem-adoption-reliability-2-regression.mjs")),
  core_tools_ecosystem_test_status: /vnem_build_tools_plan/.test(coreToolsEcosystemTestSource) && /vnem_tools_finish_session/.test(coreToolsEcosystemTestSource),
  api_library_counts: apiCounts,
  skill_library_counts: skillCounts,
  fixture_importer_test_coverage: fixtureCoverage,
  domain_contract_test_coverage: domainCoverage,
  docs_generated_artifact_status: docsGeneratedArtifacts,
  ready: [
    "Default Core MCP tool inventory is read-only by tool name/annotations and does not expose terminal/browser/filesystem/GitHub mutation tools.",
    "Proof trail, completion audit, and protection review tools are present.",
    "Fixture importer coverage includes API verification and SKILL.md parsing cases.",
    "Curated API records carry explicit docs/rate-limit confidence instead of guessed certainty.",
    "Task boosting entry point exists and is covered by real-task examples across build advice, API features, UI, modding, security, and debugging.",
    "Usable API/skill pack minimums are enforced and Core-to-Tools handoff status is tested.",
    "Core tool selection and Core→Tools planning are available, tested, and explicitly plan-only.",
    "Core browser/research planning distinguishes local UI proof, direct-source analysis, website understanding, and current-search needs without executing Tools.",
    "Core search/browsing planning now assesses research need, builds provider-search plans, handles CAPTCHA/access-block and download risk, and remains plan-only.",
    "Core routing now returns structured task categories, memory relevance decisions, missing-context ask/no-ask decisions, output-quality contracts, anti-stagnation checks, and evidence-label audits while remaining plan-only.",
    "Core now plans Tools permission profiles, trust-boundary levels, approval-required actions, blocked/profile-limited actions, and safe alternatives while remaining plan-only.",
    "Core now builds research strategies, source-ingestion plans, source-graph planning, contradiction/freshness confidence limits, and research evidence audits while remaining plan-only.",
    "Core now builds log-first debugging plans, evidence-to-fix checks, architecture maps, code-change contracts, and completion-audit code-quality warnings while remaining plan-only.",
    "Core now builds UI quality plans and visual proof contracts, and completion audit flags UI/browser overclaims without visual, route/render, console/network, a11y, viewport, state, and before/after evidence while remaining plan-only.",
    "Core now classifies adaptive effort, enforces fast-answer/no-ceremony contracts, harsh-truth uncertainty labels, design ambition, visual taste audits, and wasted-tool/anti-overhead checks while remaining plan-only.",
    "Core now adds realistic redesign comparison scorecards, total-impact design planning, total-impact direction selection, compact output contracts, and SPEED-DESIGN-2 audit flags while remaining plan-only.",
    "Core now exposes a compact adoption entrypoint and usage contract that recommend exact Tools MCP handoff calls without claiming Core can execute them.",
    "Core now exposes visibility and underuse diagnostics that detect missing VNEM/Tools usage and return exact registered recovery calls.",
    "Core now exposes install adoption guidance for Codex, Claude, Antigravity-style, and generic MCP stdio clients while staying read-only."
  ],
  not_ready: [
    "Most API docs, rate limits, CORS values, and freshness statuses remain metadata-level or unknown.",
    "Most skill/client compatibility remains unknown or likely, not verified for named clients.",
    "Core can summarize guidance only; install/execution and live API calls remain outside Core MCP.",
    "Research/source ingestion plans do not imply live search, broad crawling, external account access, or complete repo/site understanding without Tools evidence."
  ],
  remaining_blockers_before_final_enough: blockers,
  next_technical_priorities: [
    "Verify another small high-value API slice from official docs with rate-limit/CORS evidence.",
    "Add source-reviewed SKILL.md summaries and client compatibility evidence for selected high-value skills.",
    "Keep readiness reporting strict: closer/not_ready/blocked only until unknowns are materially reduced.",
    "Keep Core MCP read-only; reserve installation, execution, browser, terminal, GitHub, and live API calls for future Precision/Tools MCP.",
    "Expand source graph/audit cases only with bounded source evidence and strict no-overclaim labels."
  ]
};

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(formatReport(report));
}

function parseDefaultTools(source) {
  const match = source.match(/const DEFAULT_MCP_TOOLS = \[([\s\S]*?)\];/);
  if (!match) return [];
  return [...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]);
}

function countApis(apis) {
  const docsVerified = apis.filter((api) => /official_docs_verified/.test(api.documentation_confidence || "") || (api.official_docs_url && api.official_docs_url !== "unknown" && Array.isArray(api.verification_source_urls) && api.verification_source_urls.includes(api.official_docs_url))).length;
  const rateLimitVerified = apis.filter((api) => api.rate_limit_confidence && !/^unknown/i.test(api.rate_limit_confidence)).length;
  return {
    total_apis: apis.length,
    docs_verified_count: docsVerified,
    docs_unknown_count: apis.filter((api) => !api.official_docs_url || api.official_docs_url === "unknown" || api.documentation_confidence === "unknown").length,
    freshness_verified_or_checked_count: apis.filter((api) => api.freshness_checked_at && !/^unknown/i.test(api.freshness_checked_at)).length,
    freshness_unknown_count: apis.filter((api) => /unknown|failed_to_verify/i.test(api.freshness_status || "")).length,
    rate_limit_verified_count: rateLimitVerified,
    rate_limit_unknown_count: apis.filter((api) => !api.rate_limit_confidence || /^unknown/i.test(api.rate_limit_confidence) || /unknown/i.test(api.rate_limit_notes || "")).length,
    cors_unknown_count: apis.filter((api) => api.cors === "unknown" || api.cors_confidence === "unknown").length,
    frontend_safe_count: apis.filter((api) => api.frontend_safe === true).length,
    backend_required_count: apis.filter((api) => api.backend_required === true).length,
    secret_risk_count: apis.filter((api) => api.secret_risk === true).length
  };
}

function countSkills(skills) {
  return {
    total_skills: skills.length,
    parsed_summaries_count: skills.filter((skill) => /skill_md|parsed|detected/i.test(`${skill.source_review_status} ${skill.verified_instruction_summary}`)).length,
    verified_client_compatibility_count: skills.filter((skill) => skill.agent_compatibility_confidence === "verified").length,
    likely_client_compatibility_count: skills.filter((skill) => skill.agent_compatibility_confidence === "likely").length,
    unknown_client_compatibility_count: skills.filter((skill) => !skill.agent_compatibility_confidence || skill.agent_compatibility_confidence === "unknown").length,
    manual_review_required_count: skills.filter((skill) => skill.manual_review_required !== false || /manual_review_required|prompt_injection_surface/i.test((skill.risk_flags || []).join(" "))).length,
    core_guidance_capable_count: skills.filter((skill) => skill.core_can_apply_guidance !== false).length,
    install_precision_required_count: skills.filter((skill) => skill.requires_install !== false || skill.precision_required_for_install !== false).length,
    supported_clients_verified_nonempty_count: skills.filter((skill) => Array.isArray(skill.supported_clients_verified) && skill.supported_clients_verified.length > 0).length
  };
}

function formatReport(report) {
  const lines = [];
  lines.push("VNEM Core MCP readiness report");
  lines.push(`readiness_verdict: ${report.readiness_verdict}`);
  lines.push(`branch: ${report.branch}`);
  lines.push(`commit: ${report.commit}`);
  lines.push(`working_tree_clean: ${report.working_tree_status ? "no" : "yes"}`);
  lines.push(`core_tools: ${report.tool_inventory.count}`);
  lines.push(`read_only_status: ${report.tool_inventory.read_only_status}`);
  lines.push(`proof_audit_protection: ${status(report.proof_trail_completion_audit_protection_review_status)}`);
  lines.push(`usable_packs: apis=${report.usable_pack_status.usable_api_pack_count}, skills=${report.usable_pack_status.usable_skill_pack_count}, api_minimum=${report.usable_pack_status.api_minimum_met ? "yes" : "no"}, skill_minimum=${report.usable_pack_status.skill_minimum_met ? "yes" : "no"}, tools_handoff=${report.usable_pack_status.tools_handoff_status ? "yes" : "no"}, boost_uses_packs=${report.usable_pack_status.boost_task_uses_usable_packs ? "yes" : "no"}`);
  lines.push(`task_boosting_status: exists=${report.task_boosting_status.vnem_boost_task_exists ? "yes" : "no"}, skill_guidance=${report.task_boosting_status.uses_skill_guidance ? "yes" : "no"}, api_guidance_when_relevant=${report.task_boosting_status.uses_api_guidance_when_relevant ? "yes" : "no"}, workflow_and_proof=${report.task_boosting_status.includes_workflow_and_proof ? "yes" : "no"}`);
  lines.push(`tool_selection_status: ${status(report.tool_selection_status)}`);
  lines.push(`browser_research_planning_status: ${status(report.browser_research_planning_status)}`);
  lines.push(`search_planning_status: ${status(report.search_planning_status)}`);
  lines.push(`routing_memory_output_quality_status: ${status(report.routing_memory_output_quality_status)}`);
  lines.push(`core_permission_awareness_status: ${status(report.core_permission_awareness_status)}`);
  lines.push(`core_research_source_status: ${status(report.core_research_source_status)}`);
  lines.push(`core_debugging_code_quality_status: ${status(report.core_debugging_code_quality_status)}`);
  lines.push(`core_ui_web_quality_status: ${status(report.core_ui_web_quality_status)}`);
  lines.push(`core_adaptive_speed_design_status: ${status(report.core_adaptive_speed_design_status)}`);
  lines.push(`core_adoption_reliability_status: ${status(report.core_adoption_reliability_status)}`);
  lines.push(`core_install_adoption_status: ${status(report.core_install_adoption_status)}`);
  lines.push(`core_tools_ecosystem_test_status: ${report.core_tools_ecosystem_test_status ? "yes" : "no"}`);
  lines.push(`real_task_examples_tested: ${report.task_boosting_status.real_task_examples_tested.join(", ")}`);
  lines.push(`api_counts: total=${report.api_library_counts.total_apis}, docs_verified=${report.api_library_counts.docs_verified_count}, docs_unknown=${report.api_library_counts.docs_unknown_count}, rate_limit_verified=${report.api_library_counts.rate_limit_verified_count}, rate_limit_unknown=${report.api_library_counts.rate_limit_unknown_count}, cors_unknown=${report.api_library_counts.cors_unknown_count}, frontend_safe=${report.api_library_counts.frontend_safe_count}, backend_required=${report.api_library_counts.backend_required_count}`);
  lines.push(`skill_counts: total=${report.skill_library_counts.total_skills}, parsed_summaries=${report.skill_library_counts.parsed_summaries_count}, verified_client_compat=${report.skill_library_counts.verified_client_compatibility_count}, likely_client_compat=${report.skill_library_counts.likely_client_compatibility_count}, unknown_client_compat=${report.skill_library_counts.unknown_client_compatibility_count}, manual_review_required=${report.skill_library_counts.manual_review_required_count}, core_guidance_capable=${report.skill_library_counts.core_guidance_capable_count}, install_precision_required=${report.skill_library_counts.install_precision_required_count}`);
  lines.push(`fixture_coverage: ${status(report.fixture_importer_test_coverage)}`);
  lines.push(`domain_contracts: ${status(report.domain_contract_test_coverage)}`);
  lines.push(`docs_generated_artifacts: ${status(report.docs_generated_artifact_status)}`);
  lines.push("ready:");
  for (const item of report.ready) lines.push(`- ${item}`);
  lines.push("not_ready:");
  for (const item of report.not_ready) lines.push(`- ${item}`);
  lines.push("remaining_blockers_before_final_enough:");
  for (const blocker of report.remaining_blockers_before_final_enough) lines.push(`- ${blocker}`);
  lines.push("next_technical_priorities:");
  for (const priority of report.next_technical_priorities) lines.push(`- ${priority}`);
  return lines.join("\n");
}

function status(object) {
  return Object.entries(object).map(([key, value]) => `${key}=${value ? "yes" : "no"}`).join(", ");
}
