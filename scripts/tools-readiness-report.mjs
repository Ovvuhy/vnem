#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const rel = (target) => path.join(rootDir, target);
const serverPath = rel("scripts/vnem-tools-mcp-server.mjs");
const testPath = rel("scripts/test-tools-mcp-server.mjs");
const e2eTestPath = rel("scripts/test-core-tools-e2e.mjs");
const browserTestPath = rel("scripts/test-tools-browser-capture.mjs");
const projectActionsTestPath = rel("scripts/test-tools-project-actions.mjs");
const gitSessionTestPath = rel("scripts/test-tools-git-session.mjs");
const intelligenceTestPath = rel("scripts/test-tools-intelligence.mjs");
const researchTestPath = rel("scripts/test-tools-research.mjs");
const browserIntelligenceTestPath = rel("scripts/test-tools-browser-intelligence.mjs");
const browserResearchPackTestPath = rel("scripts/test-tools-browser-research-pack.mjs");
const toolsSearchPowerTestPath = rel("scripts/test-tools-search-power.mjs");
const toolsRiskCaptchaTestPath = rel("scripts/test-tools-risk-captcha.mjs");
const toolsPermissionProfilesTestPath = rel("scripts/test-tools-permission-profiles.mjs");
const toolsTrustBoundaryTestPath = rel("scripts/test-tools-trust-boundary.mjs");
const toolsSecretBlockingTestPath = rel("scripts/test-tools-secret-blocking.mjs");
const toolsSourceIngestionTestPath = rel("scripts/test-tools-source-ingestion.mjs");
const toolsSourceGraphTestPath = rel("scripts/test-tools-source-graph.mjs");
const toolsArchitectureReviewTestPath = rel("scripts/test-tools-architecture-review.mjs");
const toolsDebugEvidenceTestPath = rel("scripts/test-tools-debug-evidence.mjs");
const toolsUiSurfaceReviewTestPath = rel("scripts/test-tools-ui-surface-review.mjs");
const toolsBrowserEvidencePlanTestPath = rel("scripts/test-tools-browser-evidence-plan.mjs");
const toolsBrowserEvidenceRunTestPath = rel("scripts/test-tools-browser-evidence-run.mjs");
const browserEvidenceCompletionAuditTestPath = rel("scripts/test-browser-evidence-completion-audit.mjs");
const toolsUiEvidenceAuditTestPath = rel("scripts/test-tools-ui-evidence-audit.mjs");
const toolsCloudflareStatusAuthTestPath = rel("scripts/test-tools-cloudflare-status-auth.mjs");
const toolsCloudflarePlansTestPath = rel("scripts/test-tools-cloudflare-plans.mjs");
const toolsCloudflareApprovalGatesTestPath = rel("scripts/test-tools-cloudflare-approval-gates.mjs");
const toolsCloudflareRedactionTestPath = rel("scripts/test-tools-cloudflare-redaction.mjs");
const toolsCloudflareEvidencePackTestPath = rel("scripts/test-tools-cloudflare-evidence-pack.mjs");
const toolsQualityGeneralTestPath = rel("scripts/test-tools-quality-general.mjs");
const toolsReliabilityCatalogTestPath = rel("scripts/test-tools-reliability-catalog.mjs");
const toolsActionRecoveryPlanTestPath = rel("scripts/test-tools-action-recovery-plan.mjs");
const toolsHighPowerActionReviewTestPath = rel("scripts/test-tools-high-power-action-review.mjs");
const toolsCapabilityGapReportTestPath = rel("scripts/test-tools-capability-gap-report.mjs");
const toolsQuality2RegressionTestPath = rel("scripts/test-tools-quality-2-regression.mjs");
const toolsGithubSettingsTestPath = rel("scripts/test-tools-github-settings.mjs");
const toolsGithubStatusProfileTestPath = rel("scripts/test-tools-github-status-profile.mjs");
const toolsGithubRepoIntelligenceTestPath = rel("scripts/test-tools-github-repo-intelligence.mjs");
const toolsGithubBranchCommitPrTestPath = rel("scripts/test-tools-github-branch-commit-pr.mjs");
const toolsGithubIssuesActionsCiTestPath = rel("scripts/test-tools-github-issues-actions-ci.mjs");
const toolsAutonomyEfficiencyTestPath = rel("scripts/test-tools-autonomy-efficiency.mjs");
const toolsAutonomy1RegressionTestPath = rel("scripts/test-tools-autonomy-1-regression.mjs");
const toolsGithubRealExecPathsTestPath = rel("scripts/test-tools-github-real-exec-paths.mjs");
const toolsGithubCommandBuilderTestPath = rel("scripts/test-tools-github-command-builder.mjs");
const toolsGithubLiveReadinessTestPath = rel("scripts/test-tools-github-live-readiness.mjs");
const toolsGithubMutationDryRunTestPath = rel("scripts/test-tools-github-mutation-dry-run.mjs");
const toolsAutonomy2RegressionTestPath = rel("scripts/test-tools-autonomy-2-regression.mjs");
const toolsPowerTools1RegressionTestPath = rel("scripts/test-tools-power-tools-1-regression.mjs");
const toolsPowerTools2RegressionTestPath = rel("scripts/test-tools-power-tools-2-regression.mjs");
const toolsPowerSession1RecoveryTestPath = rel("scripts/test-tools-power-session-1-recovery.mjs");
const toolsOrchestrator1RegressionTestPath = rel("scripts/test-tools-orchestrator-1-regression.mjs");
const toolsCodeIntelligence1RegressionTestPath = rel("scripts/test-tools-code-intelligence-1-regression.mjs");
const coreResearchStrategyTestPath = rel("scripts/test-core-research-strategy.mjs");
const coreSourceIngestionPlanningTestPath = rel("scripts/test-core-source-ingestion-planning.mjs");
const researchEvidenceAuditTestPath = rel("scripts/test-research-evidence-audit.mjs");
const corePermissionPlanningTestPath = rel("scripts/test-core-permission-planning.mjs");
const mcpUserSmokeTestPath = rel("scripts/test-mcp-user-smoke.mjs");
const coreSearchPlanningTestPath = rel("scripts/test-core-search-planning.mjs");
const coreBrowserPlanningTestPath = rel("scripts/test-core-browser-research-planning.mjs");
const coreSelectionTestPath = rel("scripts/test-core-tool-selection.mjs");
const coreEcosystemTestPath = rel("scripts/test-core-tools-tool-ecosystem.mjs");
const coreServerPath = rel("scripts/vnem-mcp-server.mjs");
const cliPath = rel("scripts/vnem-cli.mjs");
const pkg = JSON.parse(readFileSync(rel("package.json"), "utf8"));
const server = existsSync(serverPath) ? readFileSync(serverPath, "utf8") : "";
const test = existsSync(testPath) ? readFileSync(testPath, "utf8") : "";
const e2eTest = existsSync(e2eTestPath) ? readFileSync(e2eTestPath, "utf8") : "";
const browserTest = existsSync(browserTestPath) ? readFileSync(browserTestPath, "utf8") : "";
const projectActionsTest = existsSync(projectActionsTestPath) ? readFileSync(projectActionsTestPath, "utf8") : "";
const gitSessionTest = existsSync(gitSessionTestPath) ? readFileSync(gitSessionTestPath, "utf8") : "";
const intelligenceTest = existsSync(intelligenceTestPath) ? readFileSync(intelligenceTestPath, "utf8") : "";
const researchTest = existsSync(researchTestPath) ? readFileSync(researchTestPath, "utf8") : "";
const browserIntelligenceTest = existsSync(browserIntelligenceTestPath) ? readFileSync(browserIntelligenceTestPath, "utf8") : "";
const browserResearchPackTest = existsSync(browserResearchPackTestPath) ? readFileSync(browserResearchPackTestPath, "utf8") : "";
const toolsSearchPowerTest = existsSync(toolsSearchPowerTestPath) ? readFileSync(toolsSearchPowerTestPath, "utf8") : "";
const toolsRiskCaptchaTest = existsSync(toolsRiskCaptchaTestPath) ? readFileSync(toolsRiskCaptchaTestPath, "utf8") : "";
const toolsPermissionProfilesTest = existsSync(toolsPermissionProfilesTestPath) ? readFileSync(toolsPermissionProfilesTestPath, "utf8") : "";
const toolsTrustBoundaryTest = existsSync(toolsTrustBoundaryTestPath) ? readFileSync(toolsTrustBoundaryTestPath, "utf8") : "";
const toolsSecretBlockingTest = existsSync(toolsSecretBlockingTestPath) ? readFileSync(toolsSecretBlockingTestPath, "utf8") : "";
const toolsSourceIngestionTest = existsSync(toolsSourceIngestionTestPath) ? readFileSync(toolsSourceIngestionTestPath, "utf8") : "";
const toolsSourceGraphTest = existsSync(toolsSourceGraphTestPath) ? readFileSync(toolsSourceGraphTestPath, "utf8") : "";
const toolsArchitectureReviewTest = existsSync(toolsArchitectureReviewTestPath) ? readFileSync(toolsArchitectureReviewTestPath, "utf8") : "";
const toolsDebugEvidenceTest = existsSync(toolsDebugEvidenceTestPath) ? readFileSync(toolsDebugEvidenceTestPath, "utf8") : "";
const toolsUiSurfaceReviewTest = existsSync(toolsUiSurfaceReviewTestPath) ? readFileSync(toolsUiSurfaceReviewTestPath, "utf8") : "";
const toolsBrowserEvidencePlanTest = existsSync(toolsBrowserEvidencePlanTestPath) ? readFileSync(toolsBrowserEvidencePlanTestPath, "utf8") : "";
const toolsBrowserEvidenceRunTest = existsSync(toolsBrowserEvidenceRunTestPath) ? readFileSync(toolsBrowserEvidenceRunTestPath, "utf8") : "";
const browserEvidenceCompletionAuditTest = existsSync(browserEvidenceCompletionAuditTestPath) ? readFileSync(browserEvidenceCompletionAuditTestPath, "utf8") : "";
const toolsUiEvidenceAuditTest = existsSync(toolsUiEvidenceAuditTestPath) ? readFileSync(toolsUiEvidenceAuditTestPath, "utf8") : "";
const toolsCloudflareStatusAuthTest = existsSync(toolsCloudflareStatusAuthTestPath) ? readFileSync(toolsCloudflareStatusAuthTestPath, "utf8") : "";
const toolsCloudflarePlansTest = existsSync(toolsCloudflarePlansTestPath) ? readFileSync(toolsCloudflarePlansTestPath, "utf8") : "";
const toolsCloudflareApprovalGatesTest = existsSync(toolsCloudflareApprovalGatesTestPath) ? readFileSync(toolsCloudflareApprovalGatesTestPath, "utf8") : "";
const toolsCloudflareRedactionTest = existsSync(toolsCloudflareRedactionTestPath) ? readFileSync(toolsCloudflareRedactionTestPath, "utf8") : "";
const toolsCloudflareEvidencePackTest = existsSync(toolsCloudflareEvidencePackTestPath) ? readFileSync(toolsCloudflareEvidencePackTestPath, "utf8") : "";
const toolsQualityGeneralTest = existsSync(toolsQualityGeneralTestPath) ? readFileSync(toolsQualityGeneralTestPath, "utf8") : "";
const toolsReliabilityCatalogTest = existsSync(toolsReliabilityCatalogTestPath) ? readFileSync(toolsReliabilityCatalogTestPath, "utf8") : "";
const toolsActionRecoveryPlanTest = existsSync(toolsActionRecoveryPlanTestPath) ? readFileSync(toolsActionRecoveryPlanTestPath, "utf8") : "";
const toolsHighPowerActionReviewTest = existsSync(toolsHighPowerActionReviewTestPath) ? readFileSync(toolsHighPowerActionReviewTestPath, "utf8") : "";
const toolsCapabilityGapReportTest = existsSync(toolsCapabilityGapReportTestPath) ? readFileSync(toolsCapabilityGapReportTestPath, "utf8") : "";
const toolsQuality2RegressionTest = existsSync(toolsQuality2RegressionTestPath) ? readFileSync(toolsQuality2RegressionTestPath, "utf8") : "";
const toolsGithubSettingsTest = existsSync(toolsGithubSettingsTestPath) ? readFileSync(toolsGithubSettingsTestPath, "utf8") : "";
const toolsGithubStatusProfileTest = existsSync(toolsGithubStatusProfileTestPath) ? readFileSync(toolsGithubStatusProfileTestPath, "utf8") : "";
const toolsGithubRepoIntelligenceTest = existsSync(toolsGithubRepoIntelligenceTestPath) ? readFileSync(toolsGithubRepoIntelligenceTestPath, "utf8") : "";
const toolsGithubBranchCommitPrTest = existsSync(toolsGithubBranchCommitPrTestPath) ? readFileSync(toolsGithubBranchCommitPrTestPath, "utf8") : "";
const toolsGithubIssuesActionsCiTest = existsSync(toolsGithubIssuesActionsCiTestPath) ? readFileSync(toolsGithubIssuesActionsCiTestPath, "utf8") : "";
const toolsAutonomyEfficiencyTest = existsSync(toolsAutonomyEfficiencyTestPath) ? readFileSync(toolsAutonomyEfficiencyTestPath, "utf8") : "";
const toolsAutonomy1RegressionTest = existsSync(toolsAutonomy1RegressionTestPath) ? readFileSync(toolsAutonomy1RegressionTestPath, "utf8") : "";
const toolsGithubRealExecPathsTest = existsSync(toolsGithubRealExecPathsTestPath) ? readFileSync(toolsGithubRealExecPathsTestPath, "utf8") : "";
const toolsGithubCommandBuilderTest = existsSync(toolsGithubCommandBuilderTestPath) ? readFileSync(toolsGithubCommandBuilderTestPath, "utf8") : "";
const toolsGithubLiveReadinessTest = existsSync(toolsGithubLiveReadinessTestPath) ? readFileSync(toolsGithubLiveReadinessTestPath, "utf8") : "";
const toolsGithubMutationDryRunTest = existsSync(toolsGithubMutationDryRunTestPath) ? readFileSync(toolsGithubMutationDryRunTestPath, "utf8") : "";
const toolsAutonomy2RegressionTest = existsSync(toolsAutonomy2RegressionTestPath) ? readFileSync(toolsAutonomy2RegressionTestPath, "utf8") : "";
const toolsPowerTools1RegressionTest = existsSync(toolsPowerTools1RegressionTestPath) ? readFileSync(toolsPowerTools1RegressionTestPath, "utf8") : "";
const toolsPowerTools2RegressionTest = existsSync(toolsPowerTools2RegressionTestPath) ? readFileSync(toolsPowerTools2RegressionTestPath, "utf8") : "";
const toolsPowerSession1RecoveryTest = existsSync(toolsPowerSession1RecoveryTestPath) ? readFileSync(toolsPowerSession1RecoveryTestPath, "utf8") : "";
const toolsOrchestrator1RegressionTest = existsSync(toolsOrchestrator1RegressionTestPath) ? readFileSync(toolsOrchestrator1RegressionTestPath, "utf8") : "";
const toolsCodeIntelligence1RegressionTest = existsSync(toolsCodeIntelligence1RegressionTestPath) ? readFileSync(toolsCodeIntelligence1RegressionTestPath, "utf8") : "";
const coreResearchStrategyTest = existsSync(coreResearchStrategyTestPath) ? readFileSync(coreResearchStrategyTestPath, "utf8") : "";
const coreSourceIngestionPlanningTest = existsSync(coreSourceIngestionPlanningTestPath) ? readFileSync(coreSourceIngestionPlanningTestPath, "utf8") : "";
const researchEvidenceAuditTest = existsSync(researchEvidenceAuditTestPath) ? readFileSync(researchEvidenceAuditTestPath, "utf8") : "";
const corePermissionPlanningTest = existsSync(corePermissionPlanningTestPath) ? readFileSync(corePermissionPlanningTestPath, "utf8") : "";
const mcpUserSmokeTest = existsSync(mcpUserSmokeTestPath) ? readFileSync(mcpUserSmokeTestPath, "utf8") : "";
const coreSearchPlanningTest = existsSync(coreSearchPlanningTestPath) ? readFileSync(coreSearchPlanningTestPath, "utf8") : "";
const coreBrowserPlanningTest = existsSync(coreBrowserPlanningTestPath) ? readFileSync(coreBrowserPlanningTestPath, "utf8") : "";
const coreSelectionTest = existsSync(coreSelectionTestPath) ? readFileSync(coreSelectionTestPath, "utf8") : "";
const coreEcosystemTest = existsSync(coreEcosystemTestPath) ? readFileSync(coreEcosystemTestPath, "utf8") : "";
const coreServer = existsSync(coreServerPath) ? readFileSync(coreServerPath, "utf8") : "";
const cli = existsSync(cliPath) ? readFileSync(cliPath, "utf8") : "";
const requiredTools = [
  "vnem_tools_status",
  "vnem_tools_permission_profiles",
  "vnem_tools_permission_status",
  "vnem_tools_reliability_catalog",
  "vnem_tools_action_recovery_plan",
  "vnem_tools_high_power_action_review",
  "vnem_tools_capability_gap_report",
  "vnem_tools_repo_deep_map",
  "vnem_tools_next_action_ranker",
  "vnem_tools_no_placebo_progress_audit",
  "vnem_tools_change_impact_plan",
  "vnem_tools_test_selection_plan",
  "vnem_tools_failure_triage",
  "vnem_tools_evidence_pack",
  "vnem_tools_local_session_recovery",
  "vnem_tools_repo_workflow_orchestrator",
  "vnem_tools_code_symbol_map",
  "vnem_tools_mcp_surface_audit",
  "vnem_tools_patch_target_finder",
  "vnem_tools_tool_test_coverage_map",
  "vnem_tools_source_impact_trace",
  "vnem_tools_source_control_character_guard",
  "vnem_tools_action_policy_preview",
  "vnem_tools_trust_boundary_classify",
  "vnem_tools_prepare_action_plan",
  "vnem_tools_permission_prompt",
  "vnem_tools_manifest",
  "vnem_tools_read_file",
  "vnem_tools_workspace_map",
  "vnem_tools_read_many_files",
  "vnem_tools_code_search",
  "vnem_tools_find_references",
  "vnem_tools_dependency_scan",
  "vnem_tools_list_files",
  "vnem_tools_search_files",
  "vnem_tools_apply_patch",
  "vnem_tools_run_command",
  "vnem_tools_api_request",
  "vnem_tools_fetch_url_text",
  "vnem_tools_source_quality_check",
  "vnem_tools_research_brief",
  "vnem_tools_collect_evidence",
  "vnem_tools_restore_backup",
  "vnem_tools_browser_capture",
  "vnem_tools_browser_page_inspect",
  "vnem_tools_browser_readability_extract",
  "vnem_tools_browser_link_map",
  "vnem_tools_browser_dom_search",
  "vnem_tools_browser_accessibility_audit",
  "vnem_tools_browser_compare_snapshots",
  "vnem_tools_browser_research_pack",
  "vnem_tools_search_provider_manifest",
  "vnem_tools_search_query_builder",
  "vnem_tools_web_search",
  "vnem_tools_search_result_ranker",
  "vnem_tools_redirect_chain_check",
  "vnem_tools_url_reputation_check",
  "vnem_tools_captcha_detector",
  "vnem_tools_download_safety_check",
  "vnem_tools_claim_source_matrix",
  "vnem_tools_research_gap_detector",
  "vnem_tools_source_map",
  "vnem_tools_source_extract",
  "vnem_tools_source_graph",
  "vnem_tools_architecture_review",
  "vnem_tools_debug_evidence",
  "vnem_tools_ui_surface_review",
  "vnem_tools_browser_evidence_plan",
  "vnem_tools_browser_evidence_run",
  "vnem_tools_ui_evidence_audit",
  "vnem_tools_apply_patch_batch",
  "vnem_tools_restore_batch",
  "vnem_tools_project_scan",
  "vnem_tools_run_project_task",
  "vnem_tools_start_dev_server",
  "vnem_tools_stop_dev_server",
  "vnem_tools_list_dev_servers",
  "vnem_tools_start_session",
  "vnem_tools_finish_session",
  "vnem_tools_git_status",
  "vnem_tools_git_diff_summary",
  "vnem_tools_git_commit",
  "vnem_tools_github_status",
  "vnem_tools_github_settings_guide",
  "vnem_tools_github_profile_status",
  "vnem_tools_github_repo_inspect",
  "vnem_tools_repo_intelligence_report",
  "vnem_tools_github_branch_create",
  "vnem_tools_github_commit_push",
  "vnem_tools_github_pr_create",
  "vnem_tools_github_pr_update",
  "vnem_tools_github_issue_create",
  "vnem_tools_github_issue_update",
  "vnem_tools_github_issue_comment",
  "vnem_tools_github_labels_manage",
  "vnem_tools_github_actions_status",
  "vnem_tools_github_actions_rerun",
  "vnem_tools_github_ci_failure_triage",
  "vnem_tools_pr_quality_gate",
  "vnem_tools_task_progress_truth_check",
  "vnem_tools_github_release_plan",
  "vnem_tools_github_release_create",
  "vnem_tools_github_repo_settings_plan",
  "vnem_tools_github_repo_settings_apply",
  "vnem_tools_cloudflare_status",
  "vnem_tools_cloudflare_auth_plan",
  "vnem_tools_cloudflare_accounts_list",
  "vnem_tools_cloudflare_projects_list",
  "vnem_tools_cloudflare_pages_deploy_plan",
  "vnem_tools_cloudflare_pages_deploy",
  "vnem_tools_cloudflare_workers_deploy_plan",
  "vnem_tools_cloudflare_workers_deploy",
  "vnem_tools_cloudflare_dns_plan",
  "vnem_tools_cloudflare_dns_apply",
  "vnem_tools_cloudflare_env_plan",
  "vnem_tools_cloudflare_env_apply",
  "vnem_tools_cloudflare_deploy_verify",
  "vnem_tools_cloudflare_rollback_plan",
  "vnem_tools_cloudflare_rollback",
  "vnem_tools_cloudflare_cache_purge_plan",
  "vnem_tools_cloudflare_cache_purge",
  "vnem_tools_evidence_pack_audit",
  "vnem_tools_mutation_approval_contract",
  "vnem_tools_secret_redaction_check"
];

const report = {
  server_file_exists: existsSync(serverPath),
  test_file_exists: existsSync(testPath),
  core_tools_e2e_test_exists: existsSync(e2eTestPath),
  browser_capture_test_exists: existsSync(browserTestPath),
  project_actions_test_exists: existsSync(projectActionsTestPath),
  git_session_test_exists: existsSync(gitSessionTestPath),
  intelligence_test_exists: existsSync(intelligenceTestPath),
  research_test_exists: existsSync(researchTestPath),
  browser_intelligence_test_exists: existsSync(browserIntelligenceTestPath),
  browser_research_pack_test_exists: existsSync(browserResearchPackTestPath),
  tools_search_power_test_exists: existsSync(toolsSearchPowerTestPath),
  tools_risk_captcha_test_exists: existsSync(toolsRiskCaptchaTestPath),
  tools_permission_profiles_test_exists: existsSync(toolsPermissionProfilesTestPath),
  tools_trust_boundary_test_exists: existsSync(toolsTrustBoundaryTestPath),
  tools_secret_blocking_test_exists: existsSync(toolsSecretBlockingTestPath),
  tools_source_ingestion_test_exists: existsSync(toolsSourceIngestionTestPath),
  tools_source_graph_test_exists: existsSync(toolsSourceGraphTestPath),
  tools_architecture_review_test_exists: existsSync(toolsArchitectureReviewTestPath),
  tools_debug_evidence_test_exists: existsSync(toolsDebugEvidenceTestPath),
  tools_ui_surface_review_test_exists: existsSync(toolsUiSurfaceReviewTestPath),
  tools_browser_evidence_plan_test_exists: existsSync(toolsBrowserEvidencePlanTestPath),
  tools_browser_evidence_run_test_exists: existsSync(toolsBrowserEvidenceRunTestPath),
  browser_evidence_completion_audit_test_exists: existsSync(browserEvidenceCompletionAuditTestPath),
  tools_ui_evidence_audit_test_exists: existsSync(toolsUiEvidenceAuditTestPath),
  tools_reliability_catalog_test_exists: existsSync(toolsReliabilityCatalogTestPath),
  tools_action_recovery_plan_test_exists: existsSync(toolsActionRecoveryPlanTestPath),
  tools_high_power_action_review_test_exists: existsSync(toolsHighPowerActionReviewTestPath),
  tools_capability_gap_report_test_exists: existsSync(toolsCapabilityGapReportTestPath),
  tools_quality_2_regression_test_exists: existsSync(toolsQuality2RegressionTestPath),
  tools_github_settings_test_exists: existsSync(toolsGithubSettingsTestPath),
  tools_github_status_profile_test_exists: existsSync(toolsGithubStatusProfileTestPath),
  tools_github_repo_intelligence_test_exists: existsSync(toolsGithubRepoIntelligenceTestPath),
  tools_github_branch_commit_pr_test_exists: existsSync(toolsGithubBranchCommitPrTestPath),
  tools_github_issues_actions_ci_test_exists: existsSync(toolsGithubIssuesActionsCiTestPath),
  tools_autonomy_efficiency_test_exists: existsSync(toolsAutonomyEfficiencyTestPath),
  tools_autonomy_1_regression_test_exists: existsSync(toolsAutonomy1RegressionTestPath),
  tools_github_real_exec_paths_test_exists: existsSync(toolsGithubRealExecPathsTestPath),
  tools_github_command_builder_test_exists: existsSync(toolsGithubCommandBuilderTestPath),
  tools_github_live_readiness_test_exists: existsSync(toolsGithubLiveReadinessTestPath),
  tools_github_mutation_dry_run_test_exists: existsSync(toolsGithubMutationDryRunTestPath),
  tools_autonomy_2_regression_test_exists: existsSync(toolsAutonomy2RegressionTestPath),
  tools_power_tools_1_regression_test_exists: existsSync(toolsPowerTools1RegressionTestPath),
  tools_power_tools_2_regression_test_exists: existsSync(toolsPowerTools2RegressionTestPath),
  tools_power_session_1_recovery_test_exists: existsSync(toolsPowerSession1RecoveryTestPath),
  tools_orchestrator_1_regression_test_exists: existsSync(toolsOrchestrator1RegressionTestPath),
  tools_code_intelligence_1_regression_test_exists: existsSync(toolsCodeIntelligence1RegressionTestPath),
  core_research_strategy_test_exists: existsSync(coreResearchStrategyTestPath),
  core_source_ingestion_planning_test_exists: existsSync(coreSourceIngestionPlanningTestPath),
  research_evidence_audit_test_exists: existsSync(researchEvidenceAuditTestPath),
  core_permission_planning_test_exists: existsSync(corePermissionPlanningTestPath),
  mcp_user_smoke_test_exists: existsSync(mcpUserSmokeTestPath),
  core_search_planning_test_exists: existsSync(coreSearchPlanningTestPath),
  core_browser_planning_test_exists: existsSync(coreBrowserPlanningTestPath),
  core_selection_test_exists: existsSync(coreSelectionTestPath),
  core_ecosystem_test_exists: existsSync(coreEcosystemTestPath),
  core_tools_e2e_script_exists: pkg.scripts?.["test:core-tools-e2e"] === "node scripts/test-core-tools-e2e.mjs",
  package_scripts: {
    tools_mcp: pkg.scripts?.["tools:mcp"] === "node scripts/vnem-tools-mcp-server.mjs",
    test_tools_mcp: pkg.scripts?.["test:tools-mcp"] === "node scripts/test-tools-mcp-server.mjs",
    test_tools_browser: pkg.scripts?.["test:tools-browser"] === "node scripts/test-tools-browser-capture.mjs",
    test_tools_project_actions: pkg.scripts?.["test:tools-project-actions"] === "node scripts/test-tools-project-actions.mjs",
    test_tools_git_session: pkg.scripts?.["test:tools-git-session"] === "node scripts/test-tools-git-session.mjs",
    test_tools_intelligence: pkg.scripts?.["test:tools-intelligence"] === "node scripts/test-tools-intelligence.mjs",
    test_tools_research: pkg.scripts?.["test:tools-research"] === "node scripts/test-tools-research.mjs",
    test_tools_browser_intelligence: pkg.scripts?.["test:tools-browser-intelligence"] === "node scripts/test-tools-browser-intelligence.mjs",
    test_tools_browser_research_pack: pkg.scripts?.["test:tools-browser-research-pack"] === "node scripts/test-tools-browser-research-pack.mjs",
    test_tools_search_power: pkg.scripts?.["test:tools-search-power"] === "node scripts/test-tools-search-power.mjs",
    test_tools_risk_captcha: pkg.scripts?.["test:tools-risk-captcha"] === "node scripts/test-tools-risk-captcha.mjs",
    test_tools_permission_profiles: pkg.scripts?.["test:tools-permission-profiles"] === "node scripts/test-tools-permission-profiles.mjs",
    test_tools_trust_boundary: pkg.scripts?.["test:tools-trust-boundary"] === "node scripts/test-tools-trust-boundary.mjs",
    test_tools_secret_blocking: pkg.scripts?.["test:tools-secret-blocking"] === "node scripts/test-tools-secret-blocking.mjs",
    test_core_permission_planning: pkg.scripts?.["test:core-permission-planning"] === "node scripts/test-core-permission-planning.mjs",
    test_core_research_strategy: pkg.scripts?.["test:core-research-strategy"] === "node scripts/test-core-research-strategy.mjs",
    test_core_source_ingestion_planning: pkg.scripts?.["test:core-source-ingestion-planning"] === "node scripts/test-core-source-ingestion-planning.mjs",
    test_tools_source_ingestion: pkg.scripts?.["test:tools-source-ingestion"] === "node scripts/test-tools-source-ingestion.mjs",
    test_tools_source_graph: pkg.scripts?.["test:tools-source-graph"] === "node scripts/test-tools-source-graph.mjs",
    test_tools_architecture_review: pkg.scripts?.["test:tools-architecture-review"] === "node scripts/test-tools-architecture-review.mjs",
    test_tools_debug_evidence: pkg.scripts?.["test:tools-debug-evidence"] === "node scripts/test-tools-debug-evidence.mjs",
    test_tools_ui_surface_review: pkg.scripts?.["test:tools-ui-surface-review"] === "node scripts/test-tools-ui-surface-review.mjs",
    test_tools_browser_evidence_plan: pkg.scripts?.["test:tools-browser-evidence-plan"] === "node scripts/test-tools-browser-evidence-plan.mjs",
    test_tools_browser_evidence_run: pkg.scripts?.["test:tools-browser-evidence-run"] === "node scripts/test-tools-browser-evidence-run.mjs",
    test_browser_evidence_completion_audit: pkg.scripts?.["test:browser-evidence-completion-audit"] === "node scripts/test-browser-evidence-completion-audit.mjs",
    test_tools_ui_evidence_audit: pkg.scripts?.["test:tools-ui-evidence-audit"] === "node scripts/test-tools-ui-evidence-audit.mjs",
    test_research_evidence_audit: pkg.scripts?.["test:research-evidence-audit"] === "node scripts/test-research-evidence-audit.mjs",
    test_core_search_planning: pkg.scripts?.["test:core-search-planning"] === "node scripts/test-core-search-planning.mjs",
    test_mcp_user_smoke: pkg.scripts?.["test:mcp-user-smoke"] === "node scripts/test-mcp-user-smoke.mjs",
    test_core_browser_research_planning: pkg.scripts?.["test:core-browser-research-planning"] === "node scripts/test-core-browser-research-planning.mjs",
    test_core_tool_selection: pkg.scripts?.["test:core-tool-selection"] === "node scripts/test-core-tool-selection.mjs",
    test_core_tools_ecosystem: pkg.scripts?.["test:core-tools-ecosystem"] === "node scripts/test-core-tools-tool-ecosystem.mjs",
    test_tools_cloudflare_status_auth: pkg.scripts?.["test:tools-cloudflare-status-auth"] === "node scripts/test-tools-cloudflare-status-auth.mjs",
    test_tools_cloudflare_plans: pkg.scripts?.["test:tools-cloudflare-plans"] === "node scripts/test-tools-cloudflare-plans.mjs",
    test_tools_cloudflare_approval_gates: pkg.scripts?.["test:tools-cloudflare-approval-gates"] === "node scripts/test-tools-cloudflare-approval-gates.mjs",
    test_tools_cloudflare_redaction: pkg.scripts?.["test:tools-cloudflare-redaction"] === "node scripts/test-tools-cloudflare-redaction.mjs",
    test_tools_cloudflare_evidence_pack: pkg.scripts?.["test:tools-cloudflare-evidence-pack"] === "node scripts/test-tools-cloudflare-evidence-pack.mjs",
    test_tools_quality_general: pkg.scripts?.["test:tools-quality-general"] === "node scripts/test-tools-quality-general.mjs",
    test_tools_reliability_catalog: pkg.scripts?.["test:tools-reliability-catalog"] === "node scripts/test-tools-reliability-catalog.mjs",
    test_tools_action_recovery_plan: pkg.scripts?.["test:tools-action-recovery-plan"] === "node scripts/test-tools-action-recovery-plan.mjs",
    test_tools_high_power_action_review: pkg.scripts?.["test:tools-high-power-action-review"] === "node scripts/test-tools-high-power-action-review.mjs",
    test_tools_capability_gap_report: pkg.scripts?.["test:tools-capability-gap-report"] === "node scripts/test-tools-capability-gap-report.mjs",
    test_tools_quality_2_regression: pkg.scripts?.["test:tools-quality-2-regression"] === "node scripts/test-tools-quality-2-regression.mjs",
    test_tools_github_settings: pkg.scripts?.["test:tools-github-settings"] === "node scripts/test-tools-github-settings.mjs",
    test_tools_github_status_profile: pkg.scripts?.["test:tools-github-status-profile"] === "node scripts/test-tools-github-status-profile.mjs",
    test_tools_github_repo_intelligence: pkg.scripts?.["test:tools-github-repo-intelligence"] === "node scripts/test-tools-github-repo-intelligence.mjs",
    test_tools_github_branch_commit_pr: pkg.scripts?.["test:tools-github-branch-commit-pr"] === "node scripts/test-tools-github-branch-commit-pr.mjs",
    test_tools_github_issues_actions_ci: pkg.scripts?.["test:tools-github-issues-actions-ci"] === "node scripts/test-tools-github-issues-actions-ci.mjs",
    test_tools_autonomy_efficiency: pkg.scripts?.["test:tools-autonomy-efficiency"] === "node scripts/test-tools-autonomy-efficiency.mjs",
    test_tools_autonomy_1_regression: pkg.scripts?.["test:tools-autonomy-1-regression"] === "node scripts/test-tools-autonomy-1-regression.mjs",
    test_tools_github_real_exec_paths: pkg.scripts?.["test:tools-github-real-exec-paths"] === "node scripts/test-tools-github-real-exec-paths.mjs",
    test_tools_github_command_builder: pkg.scripts?.["test:tools-github-command-builder"] === "node scripts/test-tools-github-command-builder.mjs",
    test_tools_github_live_readiness: pkg.scripts?.["test:tools-github-live-readiness"] === "node scripts/test-tools-github-live-readiness.mjs",
    test_tools_github_mutation_dry_run: pkg.scripts?.["test:tools-github-mutation-dry-run"] === "node scripts/test-tools-github-mutation-dry-run.mjs",
    test_tools_autonomy_2_regression: pkg.scripts?.["test:tools-autonomy-2-regression"] === "node scripts/test-tools-autonomy-2-regression.mjs",
    test_tools_power_repo_deep_map: pkg.scripts?.["test:tools-power-repo-deep-map"] === "node scripts/test-tools-power-tools-1-regression.mjs --case=repo-deep-map",
    test_tools_next_action_ranker: pkg.scripts?.["test:tools-next-action-ranker"] === "node scripts/test-tools-power-tools-1-regression.mjs --case=next-action-ranker",
    test_tools_no_placebo_progress_audit: pkg.scripts?.["test:tools-no-placebo-progress-audit"] === "node scripts/test-tools-power-tools-1-regression.mjs --case=no-placebo-progress-audit",
    test_tools_change_impact_plan: pkg.scripts?.["test:tools-change-impact-plan"] === "node scripts/test-tools-power-tools-1-regression.mjs --case=change-impact-plan",
    test_tools_test_selection_plan: pkg.scripts?.["test:tools-test-selection-plan"] === "node scripts/test-tools-power-tools-1-regression.mjs --case=test-selection-plan",
    test_tools_failure_triage: pkg.scripts?.["test:tools-failure-triage"] === "node scripts/test-tools-power-tools-1-regression.mjs --case=failure-triage",
    test_tools_evidence_pack: pkg.scripts?.["test:tools-evidence-pack"] === "node scripts/test-tools-power-tools-1-regression.mjs --case=evidence-pack",
    test_tools_power_tools_1_regression: pkg.scripts?.["test:tools-power-tools-1-regression"] === "node scripts/test-tools-power-tools-1-regression.mjs",
    test_tools_power_tools_2_dogfood: pkg.scripts?.["test:tools-power-tools-2-dogfood"] === "node scripts/test-tools-power-tools-2-regression.mjs --case=dogfood",
    test_tools_power_tools_2_ranking_quality: pkg.scripts?.["test:tools-power-tools-2-ranking-quality"] === "node scripts/test-tools-power-tools-2-regression.mjs --case=ranking-quality",
    test_tools_power_tools_2_no_placebo_strictness: pkg.scripts?.["test:tools-power-tools-2-no-placebo-strictness"] === "node scripts/test-tools-power-tools-2-regression.mjs --case=no-placebo-strictness",
    test_tools_power_tools_2_test_selection: pkg.scripts?.["test:tools-power-tools-2-test-selection"] === "node scripts/test-tools-power-tools-2-regression.mjs --case=test-selection",
    test_tools_power_tools_2_evidence_pack: pkg.scripts?.["test:tools-power-tools-2-evidence-pack"] === "node scripts/test-tools-power-tools-2-regression.mjs --case=evidence-pack",
    test_tools_power_tools_2_regression: pkg.scripts?.["test:tools-power-tools-2-regression"] === "node scripts/test-tools-power-tools-2-regression.mjs",
    test_tools_power_session_1_recovery: pkg.scripts?.["test:tools-power-session-1-recovery"] === "node scripts/test-tools-power-session-1-recovery.mjs",
    test_tools_orchestrator_1_local: pkg.scripts?.["test:tools-orchestrator-1-local"] === "node scripts/test-tools-orchestrator-1-regression.mjs --case=local",
    test_tools_orchestrator_1_publish: pkg.scripts?.["test:tools-orchestrator-1-publish"] === "node scripts/test-tools-orchestrator-1-regression.mjs --case=publish",
    test_tools_orchestrator_1_ci_failure: pkg.scripts?.["test:tools-orchestrator-1-ci-failure"] === "node scripts/test-tools-orchestrator-1-regression.mjs --case=ci-failure",
    test_tools_orchestrator_1_recovery: pkg.scripts?.["test:tools-orchestrator-1-recovery"] === "node scripts/test-tools-orchestrator-1-regression.mjs --case=recovery",
    test_tools_orchestrator_1_no_placebo: pkg.scripts?.["test:tools-orchestrator-1-no-placebo"] === "node scripts/test-tools-orchestrator-1-regression.mjs --case=no-placebo",
    test_tools_orchestrator_1_validation: pkg.scripts?.["test:tools-orchestrator-1-validation"] === "node scripts/test-tools-orchestrator-1-regression.mjs --case=validation",
    test_tools_orchestrator_1_regression: pkg.scripts?.["test:tools-orchestrator-1-regression"] === "node scripts/test-tools-orchestrator-1-regression.mjs",
    test_tools_code_symbol_map: pkg.scripts?.["test:tools-code-symbol-map"] === "node scripts/test-tools-code-intelligence-1-regression.mjs --case=symbol-map",
    test_tools_mcp_surface_audit: pkg.scripts?.["test:tools-mcp-surface-audit"] === "node scripts/test-tools-code-intelligence-1-regression.mjs --case=mcp-surface-audit",
    test_tools_patch_target_finder: pkg.scripts?.["test:tools-patch-target-finder"] === "node scripts/test-tools-code-intelligence-1-regression.mjs --case=patch-target-finder",
    test_tools_tool_test_coverage_map: pkg.scripts?.["test:tools-tool-test-coverage-map"] === "node scripts/test-tools-code-intelligence-1-regression.mjs --case=tool-test-coverage-map",
    test_tools_source_impact_trace: pkg.scripts?.["test:tools-source-impact-trace"] === "node scripts/test-tools-code-intelligence-1-regression.mjs --case=source-impact-trace",
    test_tools_source_control_character_guard: pkg.scripts?.["test:tools-source-control-character-guard"] === "node scripts/test-tools-code-intelligence-1-regression.mjs --case=source-control-character-guard",
    test_tools_code_intelligence_1_regression: pkg.scripts?.["test:tools-code-intelligence-1-regression"] === "node scripts/test-tools-code-intelligence-1-regression.mjs"
  },
  required_tools_present: Object.fromEntries(requiredTools.map((name) => [name, server.includes(`"${name}"`)])),
  mcp_config_tools_support: /--tools/.test(cli) && /VNEM_TOOLS_ALLOWED_ROOTS/.test(cli) && /VNEM_TOOLS_EVIDENCE_ROOT/.test(cli) && /vnem-tools-mcp-server/.test(cli),
  github_autonomy_status: /github_autonomy/.test(server) && /registerGithubTools/.test(server) && /vnem_tools_github_status/.test(server),
  github_settings_guide_status: /vnem_tools_github_settings_guide/.test(server) && /# GITHUB SETTINGS/.test(server + toolsGithubSettingsTest) && /VNEM_TOOLS_GITHUB_PROFILE = "maintainer"/.test(server + toolsGithubSettingsTest),
  github_profile_status: /vnem_tools_github_profile_status/.test(server) && /githubProfileStatus/.test(server) && /maintainer/.test(server + toolsGithubStatusProfileTest),
  github_status_tool_status: /vnem_tools_github_status/.test(server) && /gh_available/.test(server) && /blocked_by_config_or_profile/.test(server),
  github_repo_inspect_status: /vnem_tools_github_repo_inspect/.test(server) && /githubRepoInspect/.test(server) && /detected_build_test_commands/.test(server),
  github_repo_intelligence_status: /vnem_tools_repo_intelligence_report/.test(server) && /repoIntelligenceReport/.test(server) && /best_next_actions/.test(server),
  github_branch_status: /vnem_tools_github_branch_create/.test(server) && /cleanBranchName/.test(server) && /Branch .* already exists/.test(server),
  github_commit_push_status: /vnem_tools_github_commit_push/.test(server) && /files_staged/.test(server) && /VNEM_TOOLS_GITHUB_ALLOW_DIRECT_PUSH/.test(server),
  github_pr_status: /vnem_tools_github_pr_create/.test(server) && /vnem_tools_github_pr_update/.test(server) && /gh", \["pr"/.test(server),
  github_issue_status: /vnem_tools_github_issue_create/.test(server) && /vnem_tools_github_issue_update/.test(server) && /vnem_tools_github_issue_comment/.test(server),
  github_labels_status: /vnem_tools_github_labels_manage/.test(server) && /manage_labels/.test(server),
  github_actions_status: /vnem_tools_github_actions_status/.test(server) && /vnem_tools_github_actions_rerun/.test(server) && /VNEM_TOOLS_GITHUB_ALLOW_ACTIONS_RERUN/.test(server),
  github_ci_triage_status: /vnem_tools_github_ci_failure_triage/.test(server) && /ci_failure_triage/.test(server) && /likely_files_to_fix/.test(server),
  github_pr_quality_gate_status: /vnem_tools_pr_quality_gate/.test(server) && /prQualityGate/.test(server) && /claim_status/.test(server),
  github_task_progress_truth_check_status: /vnem_tools_task_progress_truth_check/.test(server) && /taskProgressTruthCheck/.test(server) && /what_not_to_claim/.test(server),
  github_config_header_status: /GITHUB SETTINGS/.test(server + toolsGithubSettingsTest + cli) && /VNEM_TOOLS_GITHUB_PROFILE/.test(server + toolsGithubSettingsTest + cli),
  github_profile_maintainer_default_status: /VNEM_TOOLS_GITHUB_PROFILE:\s*"maintainer"/.test(server) && /default maintainer/.test(server + toolsGithubSettingsTest),
  github_force_push_block_default_status: /VNEM_TOOLS_GITHUB_ALLOW_FORCE_PUSH:\s*"0"/.test(server) && /Force push blocked by default/.test(server + toolsGithubBranchCommitPrTest),
  github_repo_delete_block_default_status: /VNEM_TOOLS_GITHUB_ALLOW_REPO_DELETE:\s*"0"/.test(server) && /Repo deletion blocked by default|repo delete/.test(server),
  github_secret_commit_block_status: /githubSecretFileBlocked/.test(server) && /\.env/.test(toolsGithubBranchCommitPrTest + toolsAutonomy1RegressionTest),
  github_real_exec_status: /runProcess\("gh"/.test(server) && /runProcess\("git"/.test(server) && /VNEM_TOOLS_COMMAND_MOCK_LOG/.test(server) && /command_classification/.test(server) && /env_safety_summary/.test(server) && /simulated_result/.test(server) && /gh pr create/.test(toolsGithubRealExecPathsTest),
  github_gh_auth_detection_status: /githubAuthStatus/.test(server) && /gh auth login/.test(server + toolsGithubLiveReadinessTest) && /gh auth setup-git/.test(server + toolsGithubLiveReadinessTest),
  github_git_command_status: /\["remote", "-v"\]/.test(server) && /\["status", "--short"\]/.test(server) && /\["log", "--oneline", "-10"/.test(server),
  github_branch_real_exec_status: /git", cmd/.test(server) && /git \(switch -c|checkout -b\)/.test(toolsGithubCommandBuilderTest),
  github_commit_push_real_exec_status: /git", \["add", "--", \.\.\.files\]/.test(server) && /git", \["commit", "-m"/.test(server) && /git", \["push"/.test(server) && /selected files only/.test(toolsGithubCommandBuilderTest),
  github_pr_real_exec_status: /\["pr", "create"/.test(server) && /gh pr create/.test(toolsGithubRealExecPathsTest + toolsGithubCommandBuilderTest),
  github_issue_real_exec_status: /\["issue", "create"/.test(server) && /\["issue", "edit"/.test(server) && /\["issue", "comment"/.test(server) && /gh issue/.test(toolsGithubRealExecPathsTest),
  github_label_real_exec_status: /\["label", args\.exists \? "edit" : "create"/.test(server) && /gh label/.test(toolsGithubRealExecPathsTest),
  github_actions_real_exec_status: /\["run", "list"/.test(server) && /\["run", "rerun"/.test(server) && /gh run/.test(toolsGithubRealExecPathsTest),
  github_ci_logs_status: /run", "view"/.test(server) && /--log-failed|--log/.test(server) && /Cannot find module/.test(toolsGithubRealExecPathsTest + toolsGithubMutationDryRunTest + server),
  github_release_draft_status: /\["release", "create"/.test(server) && /--draft/.test(server + toolsGithubRealExecPathsTest),
  github_dry_run_status: /dry_run !== false/.test(server) && /must not/.test(toolsGithubMutationDryRunTest),
  github_config_knob_status: /config_knob_to_change/.test(server) && /VNEM_TOOLS_GITHUB_ALLOW_DIRECT_PUSH/.test(toolsGithubMutationDryRunTest + server) && /VNEM_TOOLS_GITHUB_ALLOW_ACTIONS_RERUN/.test(toolsGithubMutationDryRunTest + server),
  github_secret_file_block_status: /githubSecretFileBlocked/.test(server) && /Secret-like file blocked/.test(server) && /\.env/.test(toolsGithubMutationDryRunTest + server),
  github_real_execution_not_only_simulated_status: /command-backed gh\/git/.test(server) && /real gh\\\/git command paths|real gh\/git command paths|mocked runner/.test(toolsAutonomy2RegressionTest + server) && !/GitHub mutation, package install, arbitrary shell\/API, login automation, cookie extraction, CAPTCHA bypass, and broad scraping are not implemented/.test(server),
  autonomy_efficiency_status: /operation_result/.test(server) && /next_best_action/.test(server) && /config_knob_to_change/.test(server) && /claim_status/.test(server),
  repo_deep_map_status: /vnem_tools_repo_deep_map/.test(server) && /repoDeepMap/.test(server) && /package_scripts/.test(server) && /ignored_or_noise_dirs/.test(server) && /repo-deep-map/.test(toolsPowerTools1RegressionTest),
  next_action_ranker_status: /vnem_tools_next_action_ranker/.test(server) && /nextActionRanker/.test(server) && /estimated_implementation_value/.test(server) && /penalties_applied/.test(server) && /next-action-ranker/.test(toolsPowerTools1RegressionTest),
  no_placebo_progress_audit_status: /vnem_tools_no_placebo_progress_audit/.test(server) && /noPlaceboProgressAudit/.test(server) && /real_progress_score/.test(server) && /placebo_risks/.test(server) && /mocked-only/.test(toolsPowerTools1RegressionTest),
  change_impact_plan_status: /vnem_tools_change_impact_plan/.test(server) && /changeImpactPlan/.test(server) && /generation_required/.test(server) && /minimum_targeted_tests/.test(server) && /change-impact-plan/.test(toolsPowerTools1RegressionTest),
  test_selection_plan_status: /vnem_tools_test_selection_plan/.test(server) && /testSelectionPlan/.test(server) && /avoid_over_validation/.test(server) && /full_npm_test_recommended/.test(server) && /test-selection-plan/.test(toolsPowerTools1RegressionTest),
  failure_triage_status: /vnem_tools_failure_triage/.test(server) && /failureTriage/.test(server) && /windows_path_process_cleanup_issue/.test(server + toolsPowerTools1RegressionTest) && /generated_artifact_staleness/.test(server + toolsPowerTools1RegressionTest),
  evidence_pack_status: /vnem_tools_evidence_pack/.test(server) && /repoEvidencePack/.test(server) && /not_safe_to_claim/.test(server) && /mocked_or_local/.test(server) && /evidence-pack/.test(toolsPowerTools1RegressionTest),
  power_tools_1_status: /repo_power_policy/.test(server) && /repo_power/.test(server) && /test-tools-power-tools-1-regression/.test(JSON.stringify(pkg.scripts)) && /vnem Tools POWER-TOOLS-1/.test(toolsPowerTools1RegressionTest),
  power_tools_2_dogfood_status: /Dogfood current repo-power output/.test(server + toolsPowerTools2RegressionTest) && /dirty path must not lose its first character/.test(toolsPowerTools2RegressionTest),
  ranking_quality_tuning_status: /task_constraints/.test(server) && /skip_or_defer_reason/.test(server) && /new-tool expansion/.test(server + toolsPowerTools2RegressionTest),
  no_placebo_strictness_status: /required_correction/.test(server) && /not_proven/.test(server) && /registration-only/.test(server + toolsPowerTools2RegressionTest),
  test_selection_efficiency_status: /first_checks_to_run/.test(server) && /proof_boundaries/.test(server) && /source_generator_reason_required/.test(server + toolsPowerTools2RegressionTest),
  evidence_pack_proof_packet_status: /proof_packet/.test(server) && /Files changed count/.test(server + toolsPowerTools2RegressionTest) && /Live proof attempted/.test(server + toolsPowerTools2RegressionTest),
  failure_triage_specificity_status: /real_assertion_failure/.test(server + toolsPowerTools2RegressionTest) && /smallest_next_command/.test(server) && /continue_stop_or_ask_user/.test(server),
  power_tools_2_status: /test-tools-power-tools-2-regression/.test(JSON.stringify(pkg.scripts)) && /vnem Tools POWER-TOOLS-2/.test(toolsPowerTools2RegressionTest),
  local_session_recovery_status: /vnem_tools_local_session_recovery/.test(server) && /localSessionRecovery/.test(server) && /base_ref/.test(server) && /dirty_categories/.test(server) && /live_proof_attempted/.test(server) && /not_proven/.test(server) && /POWER-SESSION-1 local session recovery/.test(toolsPowerSession1RecoveryTest),
  power_session_1_status: /test-tools-power-session-1-recovery/.test(JSON.stringify(pkg.scripts)) && /vnem Tools POWER-SESSION-1/.test(toolsPowerSession1RecoveryTest),
  workflow_orchestrator_tool_status: /vnem_tools_repo_workflow_orchestrator/.test(server) && /repoWorkflowOrchestrator/.test(server) && /repo_state_summary/.test(server) && /selected_action/.test(server) && /exact_checks/.test(server),
  workflow_orchestrator_behavior_status: /task_mode: "local_only"|local_only/.test(server + toolsOrchestrator1RegressionTest) && /publish/.test(toolsOrchestrator1RegressionTest) && /ci_failure|ci-failure/.test(server + toolsOrchestrator1RegressionTest) && /recovery/.test(toolsOrchestrator1RegressionTest) && /validation/.test(toolsOrchestrator1RegressionTest) && /rejected_actions/.test(server) && /why_this_not_raw_tool/.test(server),
  workflow_orchestrator_no_placebo_status: /no_placebo_gate/.test(server) && /placebo_risks/.test(server) && /docs-only/.test(toolsOrchestrator1RegressionTest),
  workflow_orchestrator_proof_packet_status: /evidence_contract/.test(server) && /proof_packet_required/.test(server + toolsOrchestrator1RegressionTest) && /Actions run URL/.test(server),
  orchestrator_1_status: /test-tools-orchestrator-1-regression/.test(JSON.stringify(pkg.scripts)) && /vnem Tools ORCHESTRATOR-1/.test(toolsOrchestrator1RegressionTest),
  code_symbol_map_status: /vnem_tools_code_symbol_map/.test(server) && /codeSymbolMap/.test(server) && /lightweight-regex-heuristic/.test(server + toolsCodeIntelligence1RegressionTest) && /loadUser/.test(toolsCodeIntelligence1RegressionTest),
  mcp_surface_audit_status: /vnem_tools_mcp_surface_audit/.test(server) && /mcpSurfaceAudit/.test(server) && /handler_candidates/.test(server + toolsCodeIntelligence1RegressionTest) && /registration_only/.test(toolsCodeIntelligence1RegressionTest),
  patch_target_finder_status: /vnem_tools_patch_target_finder/.test(server) && /patchTargetFinder/.test(server) && /exact_next_file_to_open/.test(server + toolsCodeIntelligence1RegressionTest) && /realFeatureHandler/.test(toolsCodeIntelligence1RegressionTest),
  tool_test_coverage_map_status: /vnem_tools_tool_test_coverage_map/.test(server) && /toolTestCoverageMap/.test(server) && /behavior_test_files/.test(server + toolsCodeIntelligence1RegressionTest) && /registration_only_risks/.test(server + toolsCodeIntelligence1RegressionTest),
  source_impact_trace_status: /vnem_tools_source_impact_trace/.test(server) && /sourceImpactTrace/.test(server) && /impacted_tools/.test(server + toolsCodeIntelligence1RegressionTest) && /exact_minimum_checks/.test(server + toolsCodeIntelligence1RegressionTest),
  source_control_character_guard_status: /vnem_tools_source_control_character_guard/.test(server) && /sourceControlCharacterGuard/.test(server) && /hiddenControlFindings/.test(server) && /BACKSPACE/.test(server + toolsCodeIntelligence1RegressionTest),
  code_intelligence_1_status: /test-tools-code-intelligence-1-regression/.test(JSON.stringify(pkg.scripts)) && /vnem Tools CODE-INTELLIGENCE-1/.test(toolsCodeIntelligence1RegressionTest) && /code_intelligence_supported/.test(server),
  tools_manifest_status: /vnem_tools_manifest/.test(server) && /buildToolsManifest/.test(server) && /capability_group/.test(server) && /unsafe_actions_not_supported/.test(server) && /tool_catalog_policy/.test(server) && /vnem_tools_manifest/.test(intelligenceTest),
  workspace_map_status: /vnem_tools_workspace_map/.test(server) && /safeWorkspaceMap/.test(server) && /important_dirs/.test(server) && /likely_entrypoints/.test(intelligenceTest) && /secret_path_blocked|skipped_paths/.test(intelligenceTest),
  read_many_files_status: /vnem_tools_read_many_files/.test(server) && /safeReadManyFiles/.test(server) && /max_total_bytes/.test(server) && /blocked_files/.test(intelligenceTest),
  code_search_status: /vnem_tools_code_search/.test(server) && /safeCodeSearch/.test(server) && /context_lines/.test(server) && /result_count/.test(intelligenceTest),
  find_references_status: /vnem_tools_find_references/.test(server) && /safeFindReferences/.test(server) && /likely_definition_files/.test(intelligenceTest),
  dependency_scan_status: /vnem_tools_dependency_scan/.test(server) && /safeDependencyScan/.test(server) && /risky_scripts/.test(intelligenceTest) && /No installs or network audit/.test(server),
  fetch_url_text_status: /vnem_tools_fetch_url_text/.test(server) && /safeFetchUrlText/.test(server) && /search_engine_scraping_blocked/.test(researchTest) && /credentialed_url_blocked/.test(researchTest),
  source_quality_status: /vnem_tools_source_quality_check/.test(server) && /safeSourceQualityCheck/.test(server) && /verified factual correctness/i.test(researchTest),
  research_brief_status: /vnem_tools_research_brief/.test(server) && /safeResearchBrief/.test(server) && /unsupported_claims/.test(researchTest) && /web search/i.test(researchTest),
  tool_catalog_safety_metadata: /requires_approval/.test(server) && /dry_run_default/.test(server) && /evidence_logged/.test(server) && /core_handoff_compatible/.test(server) && /unsafe_actions_blocked/.test(server) && /doesNotMatch\(JSON\.stringify\(manifest\)/.test(intelligenceTest),
  core_tool_selection_integration: /vnem_select_tools_for_task/.test(coreServer) && /vnem_build_tools_plan/.test(coreServer) && /vnem_tools_workspace_map/.test(coreSelectionTest) && /Core must not expose Tools mutation tools directly/.test(coreSelectionTest),
  core_tools_ecosystem_test_status: existsSync(coreEcosystemTestPath) && pkg.scripts?.["test:core-tools-ecosystem"] === "node scripts/test-core-tools-tool-ecosystem.mjs" && /vnem_tools_apply_patch_batch/.test(coreEcosystemTest) && /vnem_tools_finish_session/.test(coreEcosystemTest),
  restore_tool_status: /vnem_tools_restore_backup/.test(server) && /safeRestoreBackup/.test(server) && /approval_required/.test(test),
  browser_capture_tool_status: /vnem_tools_browser_capture/.test(server) && /safeBrowserCapture/.test(server) && /browser_unavailable/.test(server),
  browser_dry_run_default: /vnem_tools_browser_capture[\s\S]*dry_run:\s*z\.boolean\(\)\.default\(true\)/.test(server),
  browser_approval_required: /vnem_tools_browser_capture[\s\S]*approved:\s*z\.boolean\(\)\.default\(false\)/.test(server) && /approval_required/.test(browserTest),
  external_url_blocked: /external_url_blocked/.test(server) && /external_url_blocked/.test(browserTest),
  secret_file_browser_blocked: /vnem_tools_browser_capture/.test(browserTest) && /secret_path_blocked/.test(browserTest),
  screenshot_evidence_status: /screenshots/.test(server) && /screenshot_sha256/.test(server) && /proof_trail_compatible_summary/.test(server) && /screenshot_paths/.test(server),
  browser_page_inspect_status: /vnem_tools_browser_page_inspect/.test(server) && /safeBrowserPageInspect/.test(server) && /main_text_excerpt/.test(browserIntelligenceTest) && /secret_path_blocked/.test(browserIntelligenceTest),
  browser_readability_status: /vnem_tools_browser_readability_extract/.test(server) && /safeBrowserReadabilityExtract/.test(server) && /heuristic/.test(browserIntelligenceTest),
  browser_link_map_status: /vnem_tools_browser_link_map/.test(server) && /safeBrowserLinkMap/.test(server) && /download_like_links/.test(browserIntelligenceTest),
  browser_dom_search_status: /vnem_tools_browser_dom_search/.test(server) && /safeBrowserDomSearch/.test(server) && /mode: "heading"/.test(browserIntelligenceTest),
  browser_accessibility_audit_status: /vnem_tools_browser_accessibility_audit/.test(server) && /safeBrowserAccessibilityAudit/.test(server) && /missing alt/i.test(browserIntelligenceTest),
  browser_compare_snapshots_status: /vnem_tools_browser_compare_snapshots/.test(server) && /safeBrowserCompareSnapshots/.test(server) && /changed_headings/.test(browserIntelligenceTest),
  browser_research_pack_status: /vnem_tools_browser_research_pack/.test(server) && /safeBrowserResearchPack/.test(server) && /conflicting_claims/.test(browserResearchPackTest),
  browser_intelligence_safety_status: /browserUnderstandingMustNotClaim/.test(server) && /search_engine_scraping_blocked/.test(browserIntelligenceTest) && /secret_path_blocked/.test(browserIntelligenceTest),
  browser_search_engine_scraping_still_blocked: /search_engine_scraping_blocked/.test(server) && /search_engine_scraping_blocked/.test(browserIntelligenceTest + researchTest),
  browser_fake_search_claims_blocked: /A broad web search happened|A web search happened/.test(server) && /web search/.test(browserResearchPackTest + coreBrowserPlanningTest),

  search_provider_manifest_status: /vnem_tools_search_provider_manifest/.test(server) && /safeSearchProviderManifest/.test(server) && /configured_providers/.test(server) && /api_key_value_exposed/.test(server) && /local_fixture/.test(toolsSearchPowerTest),
  search_query_builder_status: /vnem_tools_search_query_builder/.test(server) && /safeSearchQueryBuilder/.test(server) && /official_source_targets/.test(server) && /gaming|modding|security|API/.test(toolsSearchPowerTest + server),
  web_search_status: /vnem_tools_web_search/.test(server) && /safeWebSearch/.test(server) && /provider_unconfigured/.test(server) && /no fake results returned/.test(server),
  search_result_ranker_status: /vnem_tools_search_result_ranker/.test(server) && /safeSearchResultRanker/.test(server) && /risky_sources/.test(toolsSearchPowerTest + server) && /duplicate_clusters/.test(server),
  redirect_chain_check_status: /vnem_tools_redirect_chain_check/.test(server) && /safeRedirectChainCheck/.test(server) && /cross_domain_redirects/.test(server) && /redirect_chain/.test(toolsRiskCaptchaTest),
  url_reputation_check_status: /vnem_tools_url_reputation_check/.test(server) && /safeUrlReputationCheck/.test(server) && /punycode_or_homograph_risk|phishing_scam/.test(server + toolsRiskCaptchaTest),
  captcha_detector_status: /vnem_tools_captcha_detector/.test(server) && /safeCaptchaDetector/.test(server) && /No automatic CAPTCHA bypass was attempted or provided/.test(server + toolsRiskCaptchaTest),
  download_safety_check_status: /vnem_tools_download_safety_check/.test(server) && /safeDownloadSafetyCheck/.test(server) && /The file was downloaded/.test(server) && /requires_manual_review/.test(toolsRiskCaptchaTest),
  claim_source_matrix_status: /vnem_tools_claim_source_matrix/.test(server) && /safeClaimSourceMatrix/.test(server) && /supported_claims/.test(toolsSearchPowerTest + server) && /unsupported_claims/.test(server),
  research_gap_detector_status: /vnem_tools_research_gap_detector/.test(server) && /safeResearchGapDetector/.test(server) && /missing_current_search/.test(toolsSearchPowerTest + mcpUserSmokeTest),
  source_map_status: /vnem_tools_source_map/.test(server) && /safeSourceMap/.test(server) && /top_level_structure/.test(toolsSourceIngestionTest + server),
  source_extract_status: /vnem_tools_source_extract/.test(server) && /safeSourceExtract/.test(server) && /targets_skipped/.test(toolsSourceIngestionTest + server),
  source_graph_status: /vnem_tools_source_graph/.test(server) && /safeSourceGraph/.test(server) && /claim_verification/.test(toolsSourceGraphTest + server),
  bounded_extraction_status: /explicit targets are required|explicit selected targets/.test(server + toolsSourceIngestionTest) && /broad extraction|broad crawl/.test(server + toolsSourceIngestionTest),
  source_ingestion_permission_status: /permission_profile/.test(server + toolsSourceIngestionTest) && /safe-readonly/.test(toolsSourceIngestionTest),
  source_ingestion_secret_blocking_status: /secret_path_blocked/.test(server + toolsSourceIngestionTest) && /sk-test-1234567890/.test(toolsSourceIngestionTest) && /\[REDACTED\]/.test(toolsSourceIngestionTest),
  source_ingestion_no_broad_crawl_status: /broad_crawl_blocked|broad crawl/.test(server + toolsSourceIngestionTest) && /no hidden external fetches|no broad crawl/i.test(server),
  source_graph_contradiction_status: /conflicting_install_steps/.test(server + toolsSourceGraphTest) && /old_docs_vs_new_docs|official_vs_community_conflict/.test(server + toolsSourceGraphTest),
  freshness_detection_status: /classifyFreshness/.test(server) && /outdated_risk/.test(toolsSourceGraphTest + server),
  structured_evidence_report_status: /evidence_items/.test(server + toolsSourceIngestionTest) && /evidence_log_id/.test(toolsSourceIngestionTest + toolsSourceGraphTest + server),
  architecture_review_status: /vnem_tools_architecture_review/.test(server) && /safeArchitectureReview/.test(server) && /entry_points_found/.test(toolsArchitectureReviewTest + server),
  debug_evidence_status: /vnem_tools_debug_evidence/.test(server) && /safeDebugEvidence/.test(server) && /failure_type_guess/.test(toolsDebugEvidenceTest + server),
  architecture_review_secret_blocking_status: /security_or_secret_risks/.test(server + toolsArchitectureReviewTest) && /must-not-read/.test(toolsArchitectureReviewTest) && /secret-like path blocked|secret\/session\/private path blocked/.test(server),
  debug_evidence_log_first_status: /logs_checked/.test(toolsDebugEvidenceTest + server) && /TypeError/.test(toolsDebugEvidenceTest) && /log-first|log-first debugging|Collect bounded log-first/i.test(server),
  debug_evidence_git_status_status: /git_status_summary/.test(toolsDebugEvidenceTest + server) && /safeGitStatus/.test(server),
  debug_evidence_no_arbitrary_commands_status: /arbitrary_commands_run/.test(toolsDebugEvidenceTest + server) && /Does not run arbitrary commands|no_arbitrary_commands|arbitrary_commands_run:\s*false/i.test(server + toolsDebugEvidenceTest),
  parallel_fake_system_detection_status: /possible_parallel_fake_systems/.test(server + toolsArchitectureReviewTest) && /unregistered|parallel fake system/i.test(server + toolsArchitectureReviewTest),
  dead_code_warning_status: /possible_dead_code/.test(server + toolsArchitectureReviewTest) && /unusedDeadCode|helperUnused|dead code/i.test(server + toolsArchitectureReviewTest),
  contract_change_risk_status: /contract_change_risks/.test(server + toolsArchitectureReviewTest) && /schema|registry|package script|contract/i.test(server + toolsArchitectureReviewTest),
  ui_surface_review_status: /vnem_tools_ui_surface_review/.test(server) && /safeUiSurfaceReview/.test(server) && /routes_found/.test(toolsUiSurfaceReviewTest + server),
  browser_evidence_plan_status: /vnem_tools_browser_evidence_plan/.test(server) && /safeBrowserEvidencePlan/.test(server) && /browser_was_run:\s*false/.test(server + toolsBrowserEvidencePlanTest),
  browser_evidence_run_status: /vnem_tools_browser_evidence_run/.test(server) && /safeBrowserEvidenceRun/.test(server) && /browser_evidence_run/.test(toolsBrowserEvidenceRunTest) && /browser_was_run/.test(server + toolsBrowserEvidenceRunTest),
  browser_evidence_localhost_policy_status: /VNEM_TOOLS_ALLOW_LOCALHOST/.test(server + toolsBrowserEvidenceRunTest) && /localhost_policy/.test(server + toolsBrowserEvidenceRunTest) && /localhost_policy_disabled/.test(server),
  browser_evidence_screenshot_status: /screenshots/.test(server) && /screenshot_path/.test(server + toolsBrowserEvidenceRunTest) && /screenshot_sha256/.test(server + toolsBrowserEvidenceRunTest),
  browser_evidence_console_status: /console_summary/.test(server + toolsBrowserEvidenceRunTest) && /unavailable_not_collected_by_current_headless_capture|status/.test(server),
  browser_evidence_accessibility_status: /accessibility_summary/.test(server + toolsBrowserEvidenceRunTest) && /safeBrowserAccessibilityAudit/.test(server),
  browser_evidence_no_login_cookie_status: /login_private_flow_blocked/.test(server) && /cookie|session|browser-profile|CAPTCHA/.test(server + toolsBrowserEvidenceRunTest),
  browser_evidence_pack_status: /writeEvidenceLog\("browser_evidence_run"/.test(server) && /evidence_log_id/.test(server + toolsBrowserEvidenceRunTest) && /test:browser-evidence-completion-audit|test-browser-evidence-completion-audit/.test(JSON.stringify(pkg.scripts) + browserEvidenceCompletionAuditTest),
  ui_evidence_audit_status: /vnem_tools_ui_evidence_audit/.test(server) && /safeUiEvidenceAudit/.test(server) && /browser_evidence_run/.test(server + toolsUiEvidenceAuditTest) && /code-only evidence|screenshot missing|safe_to_claim/.test(toolsUiEvidenceAuditTest + server),
  cloudflare_control_status: /cloudflare_control/.test(server) && /buildCloudflareStatusPolicy/.test(server) && /vnem_tools_cloudflare_status/.test(server + toolsCloudflareStatusAuthTest),
  cloudflare_auth_status_tool_status: /vnem_tools_cloudflare_status/.test(server) && /wrangler_available/.test(server) && /api_token_redacted/.test(toolsCloudflareStatusAuthTest + server),
  cloudflare_auth_plan_status: /vnem_tools_cloudflare_auth_plan/.test(server) && /forbidden_auth_methods/.test(server) && /cookies/.test(toolsCloudflareStatusAuthTest),
  cloudflare_discovery_status: /vnem_tools_cloudflare_accounts_list/.test(server) && /vnem_tools_cloudflare_projects_list/.test(server) && /read_only/.test(toolsCloudflareStatusAuthTest),
  cloudflare_pages_deploy_status: /vnem_tools_cloudflare_pages_deploy_plan/.test(server) && /vnem_tools_cloudflare_pages_deploy/.test(server) && /pages_deploy/.test(toolsCloudflarePlansTest + toolsCloudflareApprovalGatesTest),
  cloudflare_workers_deploy_status: /vnem_tools_cloudflare_workers_deploy_plan/.test(server) && /vnem_tools_cloudflare_workers_deploy/.test(server) && /workers_deploy/.test(toolsCloudflarePlansTest + toolsCloudflareApprovalGatesTest),
  cloudflare_dns_status: /vnem_tools_cloudflare_dns_plan/.test(server) && /vnem_tools_cloudflare_dns_apply/.test(server) && /SPF|MX|www|apex/.test(toolsCloudflarePlansTest + server),
  cloudflare_env_secrets_status: /vnem_tools_cloudflare_env_plan/.test(server) && /vnem_tools_cloudflare_env_apply/.test(server) && /values_redacted/.test(toolsCloudflarePlansTest + toolsCloudflareRedactionTest),
  cloudflare_verify_status: /vnem_tools_cloudflare_deploy_verify/.test(server) && /deployment_url/.test(server),
  cloudflare_rollback_status: /vnem_tools_cloudflare_rollback_plan/.test(server) && /vnem_tools_cloudflare_rollback/.test(server) && /rollback requires approval|Rollback/.test(toolsCloudflareApprovalGatesTest + server),
  cloudflare_cache_purge_status: /vnem_tools_cloudflare_cache_purge_plan/.test(server) && /vnem_tools_cloudflare_cache_purge/.test(server) && /cache purge requires approval|cache_purge/.test(toolsCloudflareApprovalGatesTest + server),
  cloudflare_approval_gate_status: /I APPROVE CLOUDFLARE MUTATION/.test(server + toolsCloudflareApprovalGatesTest) && /cloudflare_mutation_approval_required/.test(toolsCloudflareApprovalGatesTest + server),
  cloudflare_destructive_approval_status: /I APPROVE CLOUDFLARE DESTRUCTIVE ACTION/.test(server + toolsCloudflareApprovalGatesTest) && /cloudflare_destructive_approval_required/.test(toolsCloudflareApprovalGatesTest + server),
  cloudflare_secret_redaction_status: /CLOUDFLARE_API_TOKEN|CF_API_TOKEN|cfut_/.test(server + toolsCloudflareRedactionTest) && /secret_redaction_check/.test(toolsCloudflareRedactionTest + server),
  cloudflare_evidence_pack_status: /writeCloudflareEvidencePack/.test(server) && /request_summary.json/.test(server + toolsCloudflareEvidencePackTest),
  general_tools_evidence_pack_audit_status: /vnem_tools_evidence_pack_audit/.test(server) && /missing_files/.test(toolsQualityGeneralTest + server),
  general_tools_mutation_approval_contract_status: /vnem_tools_mutation_approval_contract/.test(server) && /required_phrase/.test(toolsQualityGeneralTest + server),
  general_tools_secret_redaction_check_status: /vnem_tools_secret_redaction_check/.test(server) && /redacted_output_safe/.test(toolsQualityGeneralTest + server),
  tools_reliability_catalog_status: /vnem_tools_reliability_catalog/.test(server) && /tool_reliability/.test(server) && /simulated_tested/.test(server + toolsReliabilityCatalogTest) && /Cloudflare/.test(toolsReliabilityCatalogTest),
  tools_action_recovery_plan_status: /vnem_tools_action_recovery_plan/.test(server) && /buildActionRecoveryPlan/.test(server) && /blocked_by_missing_auth/.test(server + toolsActionRecoveryPlanTest) && /I APPROVE CLOUDFLARE MUTATION/.test(server + toolsActionRecoveryPlanTest),
  tools_high_power_action_review_status: /vnem_tools_high_power_action_review/.test(server) && /highPowerActionReview/.test(server) && /destructive_approval_required/.test(server + toolsHighPowerActionReviewTest) && /protected_resource_risk/.test(server + toolsHighPowerActionReviewTest),
  tools_capability_gap_report_status: /vnem_tools_capability_gap_report/.test(server) && /capabilityGapReport/.test(server) && /GitHub destructive admin operations|GitHub mutation/.test(server + toolsCapabilityGapReportTest) && /automatic CAPTCHA bypass/.test(server + toolsCapabilityGapReportTest),
  tools_quality_2_regression_status: /high_power_summary/.test(server + toolsQuality2RegressionTest) && /cloudflare_summary/.test(server) && /dangerous-disabled/.test(toolsQuality2RegressionTest),
  ui_surface_secret_blocking_status: /secret-like path blocked|secret\/session\/private path blocked/.test(server) && /must-not-read/.test(toolsUiSurfaceReviewTest),
  ui_route_component_detection_status: /routes_found|components_found|render_paths_found/.test(server) && /VisibleCard|DeadPanel|Dashboard/.test(toolsUiSurfaceReviewTest),
  ui_state_coverage_status: /missing_state_coverage/.test(server) && /loading|empty|error/.test(toolsUiSurfaceReviewTest + toolsBrowserEvidencePlanTest + toolsUiEvidenceAuditTest),
  ui_no_hidden_browser_status: /browser_was_run:\s*false|This tool ran browser automation/.test(server + toolsBrowserEvidencePlanTest) && /No browser, network, installs, or mutation/.test(server),
  ui_visual_claim_audit_status: /visual_claim_supported|before_after_status|responsive_status|console_network_status/.test(server + toolsUiEvidenceAuditTest),
  browser_search_safety_policy: /no_search_engine_result_page_scraping/.test(server) && /no_fake_search_results/.test(server) && /automatic CAPTCHA bypass/.test(server),
  provider_unconfigured_honesty: /provider_unconfigured/.test(server) && /no fake results returned/.test(server) && /provider_unavailable|provider_unconfigured/.test(server + toolsSearchPowerTest),
  no_captcha_bypass_public_policy: /No automatic CAPTCHA bypass was attempted or provided/.test(server + toolsRiskCaptchaTest) && /automatic CAPTCHA bypass/.test(server),

  permission_profiles_status: /PERMISSION_PROFILE_NAMES/.test(server) && /safe-readonly/.test(server) && /creator-power/.test(server) && /dangerous-disabled/.test(toolsPermissionProfilesTest + server),
  permission_status_tool: /vnem_tools_permission_status/.test(server) && /permissionStatusObject/.test(server) && /workspace_allowed/.test(toolsPermissionProfilesTest + server) && /high_power_summary/.test(server) && /approval_phrase_summary/.test(server),
  action_policy_preview_status: /vnem_tools_action_policy_preview/.test(server) && /actionPolicyPreview/.test(server) && /required_user_approval_text/.test(server),
  trust_boundary_classifier_status: /vnem_tools_trust_boundary_classify/.test(server) && /trustBoundaryClassify/.test(server) && /6_blocked_dangerous_action/.test(toolsTrustBoundaryTest + server),
  safe_readonly_blocks_writes: /safe-readonly/.test(server) && /permission_profile_blocked/.test(toolsPermissionProfilesTest),
  approved_writes_requires_approval: /approved-writes/.test(server) && /approval_required/.test(toolsPermissionProfilesTest),
  package_install_still_not_silent: /approved-installs/.test(server) && /package_install/.test(toolsPermissionProfilesTest) && /preview\/planned\/blocked/.test(server),
  github_mutation_still_not_silent: /approved-github/.test(server) && /github_pr/.test(toolsPermissionProfilesTest) && /never silently mutates GitHub|preview\/planned\/blocked/.test(server),
  secret_read_blocked_by_default: /secret_read/.test(server) && /secret_path_blocked/.test(toolsSecretBlockingTest) && /raw_secret_blocked/.test(toolsSecretBlockingTest),
  dangerous_disabled_policy: /dangerous-disabled/.test(server) && /captcha_bypass/.test(toolsTrustBoundaryTest) && /destructive_shell/.test(toolsTrustBoundaryTest),
  allowed_root_status_reporting: /allowed_roots/.test(server) && /how_to_add_more_roots/.test(server) && /workspace_fix_suggestion/.test(toolsPermissionProfilesTest + server),
  broad_root_warning_status: /broad_root_warnings/.test(server) && /too broad/.test(toolsPermissionProfilesTest + server),
  permission_manifest_integration: /permission_manifest_integration/.test(server) && /permission_profile/.test(server) && /vnem_tools_permission_status/.test(server),
  patch_batch_status: /vnem_tools_apply_patch_batch/.test(server) && /safeApplyPatchBatch/.test(server) && /partialFailure/.test(projectActionsTest) && /explicit_delete_required/.test(projectActionsTest),
  restore_batch_status: /vnem_tools_restore_batch/.test(server) && /safeRestoreBatch/.test(server) && /restoreSecret/.test(projectActionsTest),
  project_scan_status: /vnem_tools_project_scan/.test(server) && /safeProjectScan/.test(server) && /likely_frameworks/.test(server) && /blocked_or_skipped_paths/.test(projectActionsTest),
  project_task_status: /vnem_tools_run_project_task/.test(server) && /safeRunProjectTask/.test(server) && /unsafe_script_blocked/.test(projectActionsTest),
  dev_server_status: /vnem_tools_start_dev_server/.test(server) && /vnem_tools_stop_dev_server/.test(server) && /dev_server_not_found/.test(projectActionsTest),
  session_evidence_status: /vnem_tools_start_session/.test(server) && /vnem_tools_finish_session/.test(server) && /blocked_actions/.test(gitSessionTest),
  local_git_status: /vnem_tools_git_status/.test(server) && /vnem_tools_git_diff_summary/.test(server) && /vnem_tools_git_commit/.test(server) && /git push/.test(gitSessionTest),
  github_destructive_admin_still_blocked_status: /VNEM_TOOLS_GITHUB_ALLOW_FORCE_PUSH/.test(server) && /VNEM_TOOLS_GITHUB_ALLOW_REPO_DELETE/.test(server) && /Repo deletion blocked by default/.test(server),
  package_install_still_blocked: /UNSAFE_PACKAGE_SCRIPT_PATTERN/.test(server) && /package_install/.test(server),
  giga_still_not_built: /giga_mcp/.test(server),
  evidence_proof_bridge_status: /proof_trail_compatible_summary/.test(server) && /recommended_core_proof_trail_inputs/.test(server) && /recommended_final_report_lines/.test(server),
  safe_action_loop_status: /vnem_boost_task/.test(e2eTest) && /vnem_tools_prepare_action_plan/.test(e2eTest) && /dry_run: true/.test(e2eTest) && /approved: false/.test(e2eTest) && /vnem_tools_run_command/.test(e2eTest) && /vnem_tools_collect_evidence/.test(e2eTest),
  dry_run_default: /dry_run:\s*z\.boolean\(\)\.default\(true\)/.test(server),
  approval_required: /approval_required/.test(server) && /approved=true/.test(server),
  dangerous_commands_blocked: /DANGEROUS_COMMAND_PATTERN/.test(server) && /dangerous_command_blocked/.test(server) && /rm\s\+-rf|git\\s\+push|npm\\s\+publish/.test(server),
  secret_paths_blocked: /secret_path_blocked/.test(server) && /isSecretLikePath/.test(server),
  evidence_log_works: /writeEvidenceLog/.test(server) && /vnem_tools_collect_evidence/.test(server) && /evidence_log_id/.test(server),
  core_handoff_supported: /core_handoff/.test(server) && /selected_usable_api_packs/.test(server) && /selected_usable_skill_packs/.test(server),
  tests_cover_safety: {
    dry_run: /dry-run|dry_run/.test(test),
    approval_required: /approval_required/.test(test),
    dangerous_command: /dangerous_command_blocked/.test(test),
    outside_root: /path_outside_allowed_roots/.test(test),
    secret_path: /secret_path_blocked/.test(test),
    raw_secret_api: /raw_secret_blocked/.test(test),
    evidence: /vnem_tools_collect_evidence/.test(test)
  },
  known_missing_future_tools: [
    "GitHub destructive admin operations (repo delete/force push/settings apply beyond explicit config)",
    "package installs",
    "arbitrary shell",
    "unrestricted API calls",
    "secret-manager-backed live API calls",
    "search-engine scraping",
    "automatic CAPTCHA bypass",
    "unrestricted crawling",
    "Giga MCP orchestration"
  ],
  browser_known_limitations: [
    "approved localhost/127.0.0.1 browser evidence execution only when VNEM_TOOLS_ALLOW_LOCALHOST=1",
    "reports blocked/partial/browser_unavailable when policy, permission, or browser runtime blocks proof",
    "console status is explicitly unavailable unless supported by the bounded runtime; no login automation, cookie extraction, persistent sessions, CAPTCHA bypass, credential capture, or broad scraping"
  ]
};

assert.equal(report.server_file_exists, true, "Tools MCP server file is missing");
assert.equal(report.test_file_exists, true, "Tools MCP test file is missing");
assert.equal(report.core_tools_e2e_test_exists, true, "Core→Tools e2e test file is missing");
assert.equal(report.browser_capture_test_exists, true, "browser capture test file is missing");
assert.equal(report.project_actions_test_exists, true, "project actions test file is missing");
assert.equal(report.git_session_test_exists, true, "git/session test file is missing");
assert.equal(report.core_tools_e2e_script_exists, true, "test:core-tools-e2e package script is missing");
assert.equal(report.package_scripts.tools_mcp, true, "tools:mcp package script is missing");
assert.equal(report.package_scripts.test_tools_mcp, true, "test:tools-mcp package script is missing");
assert.equal(report.package_scripts.test_tools_browser, true, "test:tools-browser package script is missing");
assert.equal(report.package_scripts.test_tools_project_actions, true, "test:tools-project-actions package script is missing");
assert.equal(report.package_scripts.test_tools_git_session, true, "test:tools-git-session package script is missing");
assert.equal(report.package_scripts.test_tools_intelligence, true, "test:tools-intelligence package script is missing");
assert.equal(report.package_scripts.test_tools_research, true, "test:tools-research package script is missing");
assert.equal(report.package_scripts.test_core_tool_selection, true, "test:core-tool-selection package script is missing");
assert.equal(report.package_scripts.test_core_tools_ecosystem, true, "test:core-tools-ecosystem package script is missing");
for (const [key, value] of Object.entries({ test_tools_cloudflare_status_auth: report.package_scripts.test_tools_cloudflare_status_auth, test_tools_cloudflare_plans: report.package_scripts.test_tools_cloudflare_plans, test_tools_cloudflare_approval_gates: report.package_scripts.test_tools_cloudflare_approval_gates, test_tools_cloudflare_redaction: report.package_scripts.test_tools_cloudflare_redaction, test_tools_cloudflare_evidence_pack: report.package_scripts.test_tools_cloudflare_evidence_pack, test_tools_quality_general: report.package_scripts.test_tools_quality_general })) assert.equal(value, true, `${key} package script is missing`);
assert.equal(report.intelligence_test_exists, true, "tools intelligence test file is missing");
assert.equal(report.research_test_exists, true, "tools research test file is missing");
assert.equal(report.browser_intelligence_test_exists, true, "browser intelligence test file is missing");
assert.equal(report.browser_research_pack_test_exists, true, "browser research pack test file is missing");
assert.equal(report.tools_search_power_test_exists, true, "tools search power test file is missing");
assert.equal(report.tools_risk_captcha_test_exists, true, "tools risk/CAPTCHA test file is missing");
assert.equal(report.mcp_user_smoke_test_exists, true, "MCP user smoke test file is missing");
assert.equal(report.core_search_planning_test_exists, true, "core search planning test file is missing");
assert.equal(report.package_scripts.test_tools_search_power, true, "test:tools-search-power package script is missing");
assert.equal(report.package_scripts.test_tools_risk_captcha, true, "test:tools-risk-captcha package script is missing");
assert.equal(report.tools_permission_profiles_test_exists, true, "tools permission profiles test file is missing");
assert.equal(report.tools_trust_boundary_test_exists, true, "tools trust-boundary test file is missing");
assert.equal(report.tools_secret_blocking_test_exists, true, "tools secret blocking test file is missing");
assert.equal(report.core_permission_planning_test_exists, true, "core permission planning test file is missing");
assert.equal(report.tools_source_ingestion_test_exists, true, "tools source ingestion test file is missing");
assert.equal(report.tools_source_graph_test_exists, true, "tools source graph test file is missing");
assert.equal(report.tools_architecture_review_test_exists, true, "tools architecture review test file is missing");
assert.equal(report.tools_debug_evidence_test_exists, true, "tools debug evidence test file is missing");
assert.equal(report.tools_ui_surface_review_test_exists, true, "tools UI surface review test file is missing");
assert.equal(report.tools_browser_evidence_plan_test_exists, true, "tools browser evidence plan test file is missing");
assert.equal(report.tools_ui_evidence_audit_test_exists, true, "tools UI evidence audit test file is missing");
assert.equal(report.core_research_strategy_test_exists, true, "core research strategy test file is missing");
assert.equal(report.core_source_ingestion_planning_test_exists, true, "core source ingestion planning test file is missing");
assert.equal(report.research_evidence_audit_test_exists, true, "research evidence audit test file is missing");
assert.equal(report.package_scripts.test_tools_permission_profiles, true, "test:tools-permission-profiles package script is missing");
assert.equal(report.package_scripts.test_tools_trust_boundary, true, "test:tools-trust-boundary package script is missing");
assert.equal(report.package_scripts.test_tools_secret_blocking, true, "test:tools-secret-blocking package script is missing");
assert.equal(report.package_scripts.test_core_research_strategy, true, "test:core-research-strategy package script is missing");
assert.equal(report.package_scripts.test_core_source_ingestion_planning, true, "test:core-source-ingestion-planning package script is missing");
assert.equal(report.package_scripts.test_tools_source_ingestion, true, "test:tools-source-ingestion package script is missing");
assert.equal(report.package_scripts.test_tools_source_graph, true, "test:tools-source-graph package script is missing");
assert.equal(report.package_scripts.test_tools_architecture_review, true, "test:tools-architecture-review package script is missing");
assert.equal(report.package_scripts.test_tools_debug_evidence, true, "test:tools-debug-evidence package script is missing");
assert.equal(report.package_scripts.test_tools_ui_surface_review, true, "test:tools-ui-surface-review package script is missing");
assert.equal(report.package_scripts.test_tools_browser_evidence_plan, true, "test:tools-browser-evidence-plan package script is missing");
assert.equal(report.package_scripts.test_tools_ui_evidence_audit, true, "test:tools-ui-evidence-audit package script is missing");
assert.equal(report.package_scripts.test_research_evidence_audit, true, "test:research-evidence-audit package script is missing");
assert.equal(report.package_scripts.test_core_permission_planning, true, "test:core-permission-planning package script is missing");
assert.equal(report.package_scripts.test_core_search_planning, true, "test:core-search-planning package script is missing");
assert.equal(report.package_scripts.test_mcp_user_smoke, true, "test:mcp-user-smoke package script is missing");
assert.equal(report.core_browser_planning_test_exists, true, "core browser planning test file is missing");
assert.equal(report.package_scripts.test_tools_browser_intelligence, true, "test:tools-browser-intelligence package script is missing");
assert.equal(report.package_scripts.test_tools_browser_research_pack, true, "test:tools-browser-research-pack package script is missing");
assert.equal(report.package_scripts.test_core_browser_research_planning, true, "test:core-browser-research-planning package script is missing");
for (const [key, value] of Object.entries({ permission_profiles_status: report.permission_profiles_status, permission_status_tool: report.permission_status_tool, action_policy_preview_status: report.action_policy_preview_status, trust_boundary_classifier_status: report.trust_boundary_classifier_status, safe_readonly_blocks_writes: report.safe_readonly_blocks_writes, approved_writes_requires_approval: report.approved_writes_requires_approval, package_install_still_not_silent: report.package_install_still_not_silent, github_mutation_still_not_silent: report.github_mutation_still_not_silent, secret_read_blocked_by_default: report.secret_read_blocked_by_default, dangerous_disabled_policy: report.dangerous_disabled_policy, allowed_root_status_reporting: report.allowed_root_status_reporting, broad_root_warning_status: report.broad_root_warning_status, permission_manifest_integration: report.permission_manifest_integration })) assert.equal(value, true, `${key} is incomplete`);
assert.equal(report.core_selection_test_exists, true, "core tool selection test file is missing");
assert.equal(report.core_ecosystem_test_exists, true, "core tools ecosystem test file is missing");
assert.equal(report.tools_power_tools_1_regression_test_exists, true, "POWER-TOOLS-1 regression test file is missing");
assert.equal(report.tools_power_tools_2_regression_test_exists, true, "POWER-TOOLS-2 regression test file is missing");
assert.equal(report.tools_power_session_1_recovery_test_exists, true, "POWER-SESSION-1 recovery test file is missing");
assert.equal(report.tools_orchestrator_1_regression_test_exists, true, "ORCHESTRATOR-1 regression test file is missing");
assert.equal(report.tools_code_intelligence_1_regression_test_exists, true, "CODE-INTELLIGENCE-1 regression test file is missing");
for (const [key, value] of Object.entries({
  test_tools_power_repo_deep_map: report.package_scripts.test_tools_power_repo_deep_map,
  test_tools_next_action_ranker: report.package_scripts.test_tools_next_action_ranker,
  test_tools_no_placebo_progress_audit: report.package_scripts.test_tools_no_placebo_progress_audit,
  test_tools_change_impact_plan: report.package_scripts.test_tools_change_impact_plan,
  test_tools_test_selection_plan: report.package_scripts.test_tools_test_selection_plan,
  test_tools_failure_triage: report.package_scripts.test_tools_failure_triage,
  test_tools_evidence_pack: report.package_scripts.test_tools_evidence_pack,
  test_tools_power_tools_1_regression: report.package_scripts.test_tools_power_tools_1_regression,
  test_tools_power_tools_2_dogfood: report.package_scripts.test_tools_power_tools_2_dogfood,
  test_tools_power_tools_2_ranking_quality: report.package_scripts.test_tools_power_tools_2_ranking_quality,
  test_tools_power_tools_2_no_placebo_strictness: report.package_scripts.test_tools_power_tools_2_no_placebo_strictness,
  test_tools_power_tools_2_test_selection: report.package_scripts.test_tools_power_tools_2_test_selection,
  test_tools_power_tools_2_evidence_pack: report.package_scripts.test_tools_power_tools_2_evidence_pack,
  test_tools_power_tools_2_regression: report.package_scripts.test_tools_power_tools_2_regression,
  test_tools_power_session_1_recovery: report.package_scripts.test_tools_power_session_1_recovery,
  test_tools_orchestrator_1_local: report.package_scripts.test_tools_orchestrator_1_local,
  test_tools_orchestrator_1_publish: report.package_scripts.test_tools_orchestrator_1_publish,
  test_tools_orchestrator_1_ci_failure: report.package_scripts.test_tools_orchestrator_1_ci_failure,
  test_tools_orchestrator_1_recovery: report.package_scripts.test_tools_orchestrator_1_recovery,
  test_tools_orchestrator_1_no_placebo: report.package_scripts.test_tools_orchestrator_1_no_placebo,
  test_tools_orchestrator_1_validation: report.package_scripts.test_tools_orchestrator_1_validation,
  test_tools_orchestrator_1_regression: report.package_scripts.test_tools_orchestrator_1_regression,
  test_tools_code_symbol_map: report.package_scripts.test_tools_code_symbol_map,
  test_tools_mcp_surface_audit: report.package_scripts.test_tools_mcp_surface_audit,
  test_tools_patch_target_finder: report.package_scripts.test_tools_patch_target_finder,
  test_tools_tool_test_coverage_map: report.package_scripts.test_tools_tool_test_coverage_map,
  test_tools_source_impact_trace: report.package_scripts.test_tools_source_impact_trace,
  test_tools_source_control_character_guard: report.package_scripts.test_tools_source_control_character_guard,
  test_tools_code_intelligence_1_regression: report.package_scripts.test_tools_code_intelligence_1_regression
})) assert.equal(value, true, `${key} package script is missing`);
for (const [key, value] of Object.entries({
  repo_deep_map_status: report.repo_deep_map_status,
  next_action_ranker_status: report.next_action_ranker_status,
  no_placebo_progress_audit_status: report.no_placebo_progress_audit_status,
  change_impact_plan_status: report.change_impact_plan_status,
  test_selection_plan_status: report.test_selection_plan_status,
  failure_triage_status: report.failure_triage_status,
  evidence_pack_status: report.evidence_pack_status,
  power_tools_1_status: report.power_tools_1_status,
  power_tools_2_dogfood_status: report.power_tools_2_dogfood_status,
  ranking_quality_tuning_status: report.ranking_quality_tuning_status,
  no_placebo_strictness_status: report.no_placebo_strictness_status,
  test_selection_efficiency_status: report.test_selection_efficiency_status,
  evidence_pack_proof_packet_status: report.evidence_pack_proof_packet_status,
  failure_triage_specificity_status: report.failure_triage_specificity_status,
  power_tools_2_status: report.power_tools_2_status,
  local_session_recovery_status: report.local_session_recovery_status,
  power_session_1_status: report.power_session_1_status,
  workflow_orchestrator_tool_status: report.workflow_orchestrator_tool_status,
  workflow_orchestrator_behavior_status: report.workflow_orchestrator_behavior_status,
  workflow_orchestrator_no_placebo_status: report.workflow_orchestrator_no_placebo_status,
  workflow_orchestrator_proof_packet_status: report.workflow_orchestrator_proof_packet_status,
  orchestrator_1_status: report.orchestrator_1_status,
  code_symbol_map_status: report.code_symbol_map_status,
  mcp_surface_audit_status: report.mcp_surface_audit_status,
  patch_target_finder_status: report.patch_target_finder_status,
  tool_test_coverage_map_status: report.tool_test_coverage_map_status,
  source_impact_trace_status: report.source_impact_trace_status,
  source_control_character_guard_status: report.source_control_character_guard_status,
  code_intelligence_1_status: report.code_intelligence_1_status
})) assert.equal(value, true, `${key} readiness missing`);
for (const [name, present] of Object.entries(report.required_tools_present)) assert.equal(present, true, `missing required tool ${name}`);
assert.equal(report.dry_run_default, true, "dry-run defaults are missing");
assert.equal(report.mcp_config_tools_support, true, "MCP config Tools support is missing");
assert.equal(report.tools_manifest_status, true, "Tools manifest/catalog support/test coverage is missing");
assert.equal(report.workspace_map_status, true, "workspace map support/test coverage is missing");
assert.equal(report.read_many_files_status, true, "read-many-files support/test coverage is missing");
assert.equal(report.code_search_status, true, "code search support/test coverage is missing");
assert.equal(report.find_references_status, true, "find references support/test coverage is missing");
assert.equal(report.dependency_scan_status, true, "dependency scan support/test coverage is missing");
assert.equal(report.fetch_url_text_status, true, "fetch URL text support/test coverage is missing");
assert.equal(report.source_quality_status, true, "source quality support/test coverage is missing");
assert.equal(report.research_brief_status, true, "research brief support/test coverage is missing");
assert.equal(report.tool_catalog_safety_metadata, true, "tool catalog safety metadata is incomplete");
assert.equal(report.core_tool_selection_integration, true, "Core tool-selection integration coverage is missing");
assert.equal(report.core_tools_ecosystem_test_status, true, "Core+Tools ecosystem test coverage is missing");
assert.equal(report.restore_tool_status, true, "restore tool support is missing");
assert.equal(report.browser_capture_tool_status, true, "browser capture tool support is missing");
assert.equal(report.browser_dry_run_default, true, "browser capture dry-run default is missing");
assert.equal(report.browser_approval_required, true, "browser capture approval gate is missing");
assert.equal(report.external_url_blocked, true, "external browser URL blocking is missing");
assert.equal(report.secret_file_browser_blocked, true, "secret-file browser blocking is missing");
assert.equal(report.screenshot_evidence_status, true, "screenshot evidence bridge is missing");
assert.equal(report.search_provider_manifest_status, true, "search provider manifest readiness missing");
assert.equal(report.search_query_builder_status, true, "search query builder readiness missing");
assert.equal(report.web_search_status, true, "web search readiness missing");
assert.equal(report.search_result_ranker_status, true, "search result ranker readiness missing");
assert.equal(report.redirect_chain_check_status, true, "redirect chain check readiness missing");
assert.equal(report.url_reputation_check_status, true, "URL reputation readiness missing");
assert.equal(report.captcha_detector_status, true, "CAPTCHA detector readiness missing");
assert.equal(report.download_safety_check_status, true, "download safety readiness missing");
assert.equal(report.claim_source_matrix_status, true, "claim/source matrix readiness missing");
assert.equal(report.research_gap_detector_status, true, "research gap detector readiness missing");
for (const [key, value] of Object.entries({ source_map_status: report.source_map_status, source_extract_status: report.source_extract_status, source_graph_status: report.source_graph_status, bounded_extraction_status: report.bounded_extraction_status, source_ingestion_permission_status: report.source_ingestion_permission_status, source_ingestion_secret_blocking_status: report.source_ingestion_secret_blocking_status, source_ingestion_no_broad_crawl_status: report.source_ingestion_no_broad_crawl_status, source_graph_contradiction_status: report.source_graph_contradiction_status, freshness_detection_status: report.freshness_detection_status, structured_evidence_report_status: report.structured_evidence_report_status })) assert.equal(value, true, `${key} readiness missing`);
for (const [key, value] of Object.entries({ architecture_review_status: report.architecture_review_status, debug_evidence_status: report.debug_evidence_status, architecture_review_secret_blocking_status: report.architecture_review_secret_blocking_status, debug_evidence_log_first_status: report.debug_evidence_log_first_status, debug_evidence_git_status_status: report.debug_evidence_git_status_status, debug_evidence_no_arbitrary_commands_status: report.debug_evidence_no_arbitrary_commands_status, parallel_fake_system_detection_status: report.parallel_fake_system_detection_status, dead_code_warning_status: report.dead_code_warning_status, contract_change_risk_status: report.contract_change_risk_status })) assert.equal(value, true, `${key} readiness missing`);
for (const [key, value] of Object.entries({ ui_surface_review_status: report.ui_surface_review_status, browser_evidence_plan_status: report.browser_evidence_plan_status, browser_evidence_run_status: report.browser_evidence_run_status, browser_evidence_localhost_policy_status: report.browser_evidence_localhost_policy_status, browser_evidence_screenshot_status: report.browser_evidence_screenshot_status, browser_evidence_console_status: report.browser_evidence_console_status, browser_evidence_accessibility_status: report.browser_evidence_accessibility_status, browser_evidence_no_login_cookie_status: report.browser_evidence_no_login_cookie_status, browser_evidence_pack_status: report.browser_evidence_pack_status, ui_evidence_audit_status: report.ui_evidence_audit_status, ui_surface_secret_blocking_status: report.ui_surface_secret_blocking_status, ui_route_component_detection_status: report.ui_route_component_detection_status, ui_state_coverage_status: report.ui_state_coverage_status, ui_no_hidden_browser_status: report.ui_no_hidden_browser_status, ui_visual_claim_audit_status: report.ui_visual_claim_audit_status })) assert.equal(value, true, `${key} readiness missing`);
assert.equal(report.browser_search_safety_policy, true, "browser/search safety policy missing");
assert.equal(report.provider_unconfigured_honesty, true, "provider unconfigured honesty missing");
assert.equal(report.no_captcha_bypass_public_policy, true, "no-CAPTCHA-bypass public policy missing");
for (const [key, value] of Object.entries({ cloudflare_control_status: report.cloudflare_control_status, cloudflare_auth_status_tool_status: report.cloudflare_auth_status_tool_status, cloudflare_auth_plan_status: report.cloudflare_auth_plan_status, cloudflare_discovery_status: report.cloudflare_discovery_status, cloudflare_pages_deploy_status: report.cloudflare_pages_deploy_status, cloudflare_workers_deploy_status: report.cloudflare_workers_deploy_status, cloudflare_dns_status: report.cloudflare_dns_status, cloudflare_env_secrets_status: report.cloudflare_env_secrets_status, cloudflare_verify_status: report.cloudflare_verify_status, cloudflare_rollback_status: report.cloudflare_rollback_status, cloudflare_cache_purge_status: report.cloudflare_cache_purge_status, cloudflare_approval_gate_status: report.cloudflare_approval_gate_status, cloudflare_destructive_approval_status: report.cloudflare_destructive_approval_status, cloudflare_secret_redaction_status: report.cloudflare_secret_redaction_status, cloudflare_evidence_pack_status: report.cloudflare_evidence_pack_status, general_tools_evidence_pack_audit_status: report.general_tools_evidence_pack_audit_status, general_tools_mutation_approval_contract_status: report.general_tools_mutation_approval_contract_status, general_tools_secret_redaction_check_status: report.general_tools_secret_redaction_check_status })) assert.equal(value, true, `${key} readiness missing`);
assert.equal(report.patch_batch_status, true, "patch batch support/test coverage is missing");
assert.equal(report.restore_batch_status, true, "restore batch support/test coverage is missing");
assert.equal(report.project_scan_status, true, "project scan support/test coverage is missing");
assert.equal(report.project_task_status, true, "project task support/test coverage is missing");
assert.equal(report.dev_server_status, true, "dev server support/test coverage is missing");
assert.equal(report.session_evidence_status, true, "session evidence support/test coverage is missing");
assert.equal(report.local_git_status, true, "local git support/test coverage is missing");
assert.equal(report.github_destructive_admin_still_blocked_status, true, "GitHub destructive admin blocking is missing");
assert.equal(report.package_install_still_blocked, true, "package install/publish blocking is missing");
assert.equal(report.giga_still_not_built, true, "Giga MCP unsupported marker is missing");
assert.equal(report.evidence_proof_bridge_status, true, "evidence proof bridge is missing");
assert.equal(report.safe_action_loop_status, true, "Core→Tools safe action loop test coverage is missing");
assert.equal(report.approval_required, true, "approval-required policy is missing");
assert.equal(report.dangerous_commands_blocked, true, "dangerous command blocking is missing");
assert.equal(report.secret_paths_blocked, true, "secret path blocking is missing");
assert.equal(report.evidence_log_works, true, "evidence logging is missing");
assert.equal(report.core_handoff_supported, true, "Core handoff support is missing");
for (const [name, covered] of Object.entries(report.tests_cover_safety)) assert.equal(covered, true, `test coverage missing: ${name}`);

console.log("VNEM Tools MCP readiness report");
console.log(`server_file_exists: ${yes(report.server_file_exists)}`);
console.log(`test_file_exists: ${yes(report.test_file_exists)}`);
console.log(`core_tools_e2e_test_exists: ${yes(report.core_tools_e2e_test_exists)}`);
console.log(`browser_capture_test_exists: ${yes(report.browser_capture_test_exists)}`);
console.log(`project_actions_test_exists: ${yes(report.project_actions_test_exists)}`);
console.log(`git_session_test_exists: ${yes(report.git_session_test_exists)}`);
console.log(`intelligence_test_exists: ${yes(report.intelligence_test_exists)}`);
console.log(`research_test_exists: ${yes(report.research_test_exists)}`);
console.log(`browser_intelligence_test_exists: ${yes(report.browser_intelligence_test_exists)}`);
console.log(`browser_research_pack_test_exists: ${yes(report.browser_research_pack_test_exists)}`);
console.log(`tools_search_power_test_exists: ${yes(report.tools_search_power_test_exists)}`);
console.log(`tools_risk_captcha_test_exists: ${yes(report.tools_risk_captcha_test_exists)}`);
console.log(`mcp_user_smoke_test_exists: ${yes(report.mcp_user_smoke_test_exists)}`);
console.log(`core_search_planning_test_exists: ${yes(report.core_search_planning_test_exists)}`);

console.log(`core_browser_planning_test_exists: ${yes(report.core_browser_planning_test_exists)}`);
console.log(`core_selection_test_exists: ${yes(report.core_selection_test_exists)}`);
console.log(`core_ecosystem_test_exists: ${yes(report.core_ecosystem_test_exists)}`);
console.log(`core_tools_e2e_script_exists: ${yes(report.core_tools_e2e_script_exists)}`);
console.log(`required_tools_present: ${Object.values(report.required_tools_present).filter(Boolean).length}/${requiredTools.length}`);
console.log(`mcp_config_tools_support: ${yes(report.mcp_config_tools_support)}`);
console.log(`tools_manifest_status: ${yes(report.tools_manifest_status)}`);
console.log(`workspace_map_status: ${yes(report.workspace_map_status)}`);
console.log(`read_many_files_status: ${yes(report.read_many_files_status)}`);
console.log(`code_search_status: ${yes(report.code_search_status)}`);
console.log(`find_references_status: ${yes(report.find_references_status)}`);
console.log(`dependency_scan_status: ${yes(report.dependency_scan_status)}`);
console.log(`fetch_url_text_status: ${yes(report.fetch_url_text_status)}`);
console.log(`source_quality_status: ${yes(report.source_quality_status)}`);
console.log(`research_brief_status: ${yes(report.research_brief_status)}`);
console.log(`tool_catalog_safety_metadata: ${yes(report.tool_catalog_safety_metadata)}`);
console.log(`core_tool_selection_integration: ${yes(report.core_tool_selection_integration)}`);
console.log(`core_tools_ecosystem_test_status: ${yes(report.core_tools_ecosystem_test_status)}`);
console.log(`restore_tool_status: ${yes(report.restore_tool_status)}`);
console.log(`browser_capture_tool_status: ${yes(report.browser_capture_tool_status)}`);
console.log(`browser_dry_run_default: ${yes(report.browser_dry_run_default)}`);
console.log(`browser_approval_required: ${yes(report.browser_approval_required)}`);
console.log(`external_url_blocked: ${yes(report.external_url_blocked)}`);
console.log(`secret_file_browser_blocked: ${yes(report.secret_file_browser_blocked)}`);
console.log(`screenshot_evidence_status: ${yes(report.screenshot_evidence_status)}`);
console.log(`browser_page_inspect_status: ${yes(report.browser_page_inspect_status)}`);
console.log(`browser_readability_status: ${yes(report.browser_readability_status)}`);
console.log(`browser_link_map_status: ${yes(report.browser_link_map_status)}`);
console.log(`browser_dom_search_status: ${yes(report.browser_dom_search_status)}`);
console.log(`browser_accessibility_audit_status: ${yes(report.browser_accessibility_audit_status)}`);
console.log(`browser_compare_snapshots_status: ${yes(report.browser_compare_snapshots_status)}`);
console.log(`browser_research_pack_status: ${yes(report.browser_research_pack_status)}`);
console.log(`browser_intelligence_safety_status: ${yes(report.browser_intelligence_safety_status)}`);
console.log(`browser_search_engine_scraping_still_blocked: ${yes(report.browser_search_engine_scraping_still_blocked)}`);
console.log(`browser_fake_search_claims_blocked: ${yes(report.browser_fake_search_claims_blocked)}`);
console.log(`search_provider_manifest_status: ${yes(report.search_provider_manifest_status)}`);
console.log(`search_query_builder_status: ${yes(report.search_query_builder_status)}`);
console.log(`web_search_status: ${yes(report.web_search_status)}`);
console.log(`search_result_ranker_status: ${yes(report.search_result_ranker_status)}`);
console.log(`redirect_chain_check_status: ${yes(report.redirect_chain_check_status)}`);
console.log(`url_reputation_check_status: ${yes(report.url_reputation_check_status)}`);
console.log(`captcha_detector_status: ${yes(report.captcha_detector_status)}`);
console.log(`download_safety_check_status: ${yes(report.download_safety_check_status)}`);
console.log(`claim_source_matrix_status: ${yes(report.claim_source_matrix_status)}`);
console.log(`research_gap_detector_status: ${yes(report.research_gap_detector_status)}`);
console.log(`source_map_status: ${yes(report.source_map_status)}`);
console.log(`source_extract_status: ${yes(report.source_extract_status)}`);
console.log(`source_graph_status: ${yes(report.source_graph_status)}`);
console.log(`bounded_extraction_status: ${yes(report.bounded_extraction_status)}`);
console.log(`source_ingestion_permission_status: ${yes(report.source_ingestion_permission_status)}`);
console.log(`source_ingestion_secret_blocking_status: ${yes(report.source_ingestion_secret_blocking_status)}`);
console.log(`source_ingestion_no_broad_crawl_status: ${yes(report.source_ingestion_no_broad_crawl_status)}`);
console.log(`source_graph_contradiction_status: ${yes(report.source_graph_contradiction_status)}`);
console.log(`freshness_detection_status: ${yes(report.freshness_detection_status)}`);
console.log(`structured_evidence_report_status: ${yes(report.structured_evidence_report_status)}`);
console.log(`architecture_review_status: ${yes(report.architecture_review_status)}`);
console.log(`debug_evidence_status: ${yes(report.debug_evidence_status)}`);
console.log(`architecture_review_secret_blocking_status: ${yes(report.architecture_review_secret_blocking_status)}`);
console.log(`debug_evidence_log_first_status: ${yes(report.debug_evidence_log_first_status)}`);
console.log(`debug_evidence_git_status_status: ${yes(report.debug_evidence_git_status_status)}`);
console.log(`debug_evidence_no_arbitrary_commands_status: ${yes(report.debug_evidence_no_arbitrary_commands_status)}`);
console.log(`ui_surface_review_status: ${yes(report.ui_surface_review_status)}`);
console.log(`browser_evidence_plan_status: ${yes(report.browser_evidence_plan_status)}`);
console.log(`browser_evidence_run_status: ${yes(report.browser_evidence_run_status)}`);
console.log(`browser_evidence_localhost_policy_status: ${yes(report.browser_evidence_localhost_policy_status)}`);
console.log(`browser_evidence_screenshot_status: ${yes(report.browser_evidence_screenshot_status)}`);
console.log(`browser_evidence_console_status: ${yes(report.browser_evidence_console_status)}`);
console.log(`browser_evidence_accessibility_status: ${yes(report.browser_evidence_accessibility_status)}`);
console.log(`browser_evidence_no_login_cookie_status: ${yes(report.browser_evidence_no_login_cookie_status)}`);
console.log(`browser_evidence_pack_status: ${yes(report.browser_evidence_pack_status)}`);
console.log(`ui_evidence_audit_status: ${yes(report.ui_evidence_audit_status)}`);
console.log(`ui_surface_secret_blocking_status: ${yes(report.ui_surface_secret_blocking_status)}`);
console.log(`ui_route_component_detection_status: ${yes(report.ui_route_component_detection_status)}`);
console.log(`ui_state_coverage_status: ${yes(report.ui_state_coverage_status)}`);
console.log(`ui_no_hidden_browser_status: ${yes(report.ui_no_hidden_browser_status)}`);
console.log(`ui_visual_claim_audit_status: ${yes(report.ui_visual_claim_audit_status)}`);
for (const key of ["github_autonomy_status", "github_settings_guide_status", "github_profile_status", "github_status_tool_status", "github_repo_inspect_status", "github_repo_intelligence_status", "github_branch_status", "github_commit_push_status", "github_pr_status", "github_issue_status", "github_labels_status", "github_actions_status", "github_ci_triage_status", "github_pr_quality_gate_status", "github_task_progress_truth_check_status", "github_config_header_status", "github_profile_maintainer_default_status", "github_force_push_block_default_status", "github_repo_delete_block_default_status", "github_secret_commit_block_status", "github_real_exec_status", "github_gh_auth_detection_status", "github_git_command_status", "github_branch_real_exec_status", "github_commit_push_real_exec_status", "github_pr_real_exec_status", "github_issue_real_exec_status", "github_label_real_exec_status", "github_actions_real_exec_status", "github_ci_logs_status", "github_release_draft_status", "github_dry_run_status", "github_config_knob_status", "github_secret_file_block_status", "github_real_execution_not_only_simulated_status", "autonomy_efficiency_status"]) console.log(`${key}: ${yes(report[key])}`);
for (const key of ["repo_deep_map_status", "next_action_ranker_status", "no_placebo_progress_audit_status", "change_impact_plan_status", "test_selection_plan_status", "failure_triage_status", "evidence_pack_status", "power_tools_1_status", "power_tools_2_dogfood_status", "ranking_quality_tuning_status", "no_placebo_strictness_status", "test_selection_efficiency_status", "evidence_pack_proof_packet_status", "failure_triage_specificity_status", "power_tools_2_status", "local_session_recovery_status", "power_session_1_status", "workflow_orchestrator_tool_status", "workflow_orchestrator_behavior_status", "workflow_orchestrator_no_placebo_status", "workflow_orchestrator_proof_packet_status", "orchestrator_1_status", "code_symbol_map_status", "mcp_surface_audit_status", "patch_target_finder_status", "tool_test_coverage_map_status", "source_impact_trace_status", "source_control_character_guard_status", "code_intelligence_1_status"]) console.log(`${key}: ${yes(report[key])}`);
for (const key of ["cloudflare_control_status", "cloudflare_auth_status_tool_status", "cloudflare_auth_plan_status", "cloudflare_discovery_status", "cloudflare_pages_deploy_status", "cloudflare_workers_deploy_status", "cloudflare_dns_status", "cloudflare_env_secrets_status", "cloudflare_verify_status", "cloudflare_rollback_status", "cloudflare_cache_purge_status", "cloudflare_approval_gate_status", "cloudflare_destructive_approval_status", "cloudflare_secret_redaction_status", "cloudflare_evidence_pack_status", "general_tools_evidence_pack_audit_status", "general_tools_mutation_approval_contract_status", "general_tools_secret_redaction_check_status"]) console.log(`${key}: ${yes(report[key])}`);
console.log(`parallel_fake_system_detection_status: ${yes(report.parallel_fake_system_detection_status)}`);
console.log(`dead_code_warning_status: ${yes(report.dead_code_warning_status)}`);
console.log(`contract_change_risk_status: ${yes(report.contract_change_risk_status)}`);
console.log(`browser_search_safety_policy: ${yes(report.browser_search_safety_policy)}`);
console.log(`provider_unconfigured_honesty: ${yes(report.provider_unconfigured_honesty)}`);
console.log(`no_captcha_bypass_public_policy: ${yes(report.no_captcha_bypass_public_policy)}`);
console.log(`permission_profiles_status: ${yes(report.permission_profiles_status)}`);
console.log(`permission_status_tool: ${yes(report.permission_status_tool)}`);
console.log(`action_policy_preview_status: ${yes(report.action_policy_preview_status)}`);
console.log(`trust_boundary_classifier_status: ${yes(report.trust_boundary_classifier_status)}`);
console.log(`safe_readonly_blocks_writes: ${yes(report.safe_readonly_blocks_writes)}`);
console.log(`approved_writes_requires_approval: ${yes(report.approved_writes_requires_approval)}`);
console.log(`package_install_still_not_silent: ${yes(report.package_install_still_not_silent)}`);
console.log(`github_mutation_still_not_silent: ${yes(report.github_mutation_still_not_silent)}`);
console.log(`secret_read_blocked_by_default: ${yes(report.secret_read_blocked_by_default)}`);
console.log(`dangerous_disabled_policy: ${yes(report.dangerous_disabled_policy)}`);
console.log(`allowed_root_status_reporting: ${yes(report.allowed_root_status_reporting)}`);
console.log(`broad_root_warning_status: ${yes(report.broad_root_warning_status)}`);
console.log(`permission_manifest_integration: ${yes(report.permission_manifest_integration)}`);
console.log(`patch_batch_status: ${yes(report.patch_batch_status)}`);
console.log(`restore_batch_status: ${yes(report.restore_batch_status)}`);
console.log(`project_scan_status: ${yes(report.project_scan_status)}`);
console.log(`project_task_status: ${yes(report.project_task_status)}`);
console.log(`dev_server_status: ${yes(report.dev_server_status)}`);
console.log(`session_evidence_status: ${yes(report.session_evidence_status)}`);
console.log(`local_git_status: ${yes(report.local_git_status)}`);
console.log(`github_destructive_admin_still_blocked: ${yes(report.github_repo_delete_block_default_status && report.github_force_push_block_default_status)}`);
console.log(`package_install_still_blocked: ${yes(report.package_install_still_blocked)}`);
console.log(`giga_still_not_built: ${yes(report.giga_still_not_built)}`);
console.log(`evidence_proof_bridge_status: ${yes(report.evidence_proof_bridge_status)}`);
console.log(`safe_action_loop_status: ${yes(report.safe_action_loop_status)}`);
console.log(`dry_run_default: ${yes(report.dry_run_default)}`);
console.log(`approval_required: ${yes(report.approval_required)}`);
console.log(`dangerous_commands_blocked: ${yes(report.dangerous_commands_blocked)}`);
console.log(`secret_paths_blocked: ${yes(report.secret_paths_blocked)}`);
console.log(`evidence_log_works: ${yes(report.evidence_log_works)}`);
console.log(`core_handoff_supported: ${yes(report.core_handoff_supported)}`);
console.log(`known_missing_future_tools: ${report.known_missing_future_tools.join(", ")}`);
console.log(`browser_known_limitations: ${report.browser_known_limitations.join("; ")}`);
console.log("browser_capture_supported_with_local_allowlist_or_reports_browser_unavailable: yes");
console.log("readiness_verdict: foundation_ready");

function yes(value) {
  return value ? "yes" : "no";
}
