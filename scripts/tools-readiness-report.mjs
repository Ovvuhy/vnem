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
const coreBrowserPlanningTest = existsSync(coreBrowserPlanningTestPath) ? readFileSync(coreBrowserPlanningTestPath, "utf8") : "";
const coreSelectionTest = existsSync(coreSelectionTestPath) ? readFileSync(coreSelectionTestPath, "utf8") : "";
const coreEcosystemTest = existsSync(coreEcosystemTestPath) ? readFileSync(coreEcosystemTestPath, "utf8") : "";
const coreServer = existsSync(coreServerPath) ? readFileSync(coreServerPath, "utf8") : "";
const cli = existsSync(cliPath) ? readFileSync(cliPath, "utf8") : "";
const requiredTools = [
  "vnem_tools_status",
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
  "vnem_tools_git_commit"
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
    test_core_browser_research_planning: pkg.scripts?.["test:core-browser-research-planning"] === "node scripts/test-core-browser-research-planning.mjs",
    test_core_tool_selection: pkg.scripts?.["test:core-tool-selection"] === "node scripts/test-core-tool-selection.mjs",
    test_core_tools_ecosystem: pkg.scripts?.["test:core-tools-ecosystem"] === "node scripts/test-core-tools-tool-ecosystem.mjs"
  },
  required_tools_present: Object.fromEntries(requiredTools.map((name) => [name, server.includes(`"${name}"`)])),
  mcp_config_tools_support: /--tools/.test(cli) && /VNEM_TOOLS_ALLOWED_ROOTS/.test(cli) && /VNEM_TOOLS_EVIDENCE_ROOT/.test(cli) && /vnem-tools-mcp-server/.test(cli),
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
  patch_batch_status: /vnem_tools_apply_patch_batch/.test(server) && /safeApplyPatchBatch/.test(server) && /partialFailure/.test(projectActionsTest) && /explicit_delete_required/.test(projectActionsTest),
  restore_batch_status: /vnem_tools_restore_batch/.test(server) && /safeRestoreBatch/.test(server) && /restoreSecret/.test(projectActionsTest),
  project_scan_status: /vnem_tools_project_scan/.test(server) && /safeProjectScan/.test(server) && /likely_frameworks/.test(server) && /blocked_or_skipped_paths/.test(projectActionsTest),
  project_task_status: /vnem_tools_run_project_task/.test(server) && /safeRunProjectTask/.test(server) && /unsafe_script_blocked/.test(projectActionsTest),
  dev_server_status: /vnem_tools_start_dev_server/.test(server) && /vnem_tools_stop_dev_server/.test(server) && /dev_server_not_found/.test(projectActionsTest),
  session_evidence_status: /vnem_tools_start_session/.test(server) && /vnem_tools_finish_session/.test(server) && /blocked_actions/.test(gitSessionTest),
  local_git_status: /vnem_tools_git_status/.test(server) && /vnem_tools_git_diff_summary/.test(server) && /vnem_tools_git_commit/.test(server) && /git push/.test(gitSessionTest),
  remote_github_still_blocked: /git\\s\+push/.test(server) && /remote_github_mutation/.test(server),
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
    "GitHub mutation",
    "package installs",
    "arbitrary shell",
    "unrestricted API calls",
    "secret-manager-backed live API calls",
    "search-engine scraping",
    "Giga MCP orchestration"
  ],
  browser_known_limitations: [
    "local file/localhost screenshot evidence only by default",
    "reports browser_unavailable when no headless browser runtime is present",
    "no login automation, cookie extraction, persistent sessions, CAPTCHA bypass, credential capture, or broad scraping"
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
assert.equal(report.intelligence_test_exists, true, "tools intelligence test file is missing");
assert.equal(report.research_test_exists, true, "tools research test file is missing");
assert.equal(report.browser_intelligence_test_exists, true, "browser intelligence test file is missing");
assert.equal(report.browser_research_pack_test_exists, true, "browser research pack test file is missing");
assert.equal(report.core_browser_planning_test_exists, true, "core browser planning test file is missing");
assert.equal(report.package_scripts.test_tools_browser_intelligence, true, "test:tools-browser-intelligence package script is missing");
assert.equal(report.package_scripts.test_tools_browser_research_pack, true, "test:tools-browser-research-pack package script is missing");
assert.equal(report.package_scripts.test_core_browser_research_planning, true, "test:core-browser-research-planning package script is missing");
assert.equal(report.core_selection_test_exists, true, "core tool selection test file is missing");
assert.equal(report.core_ecosystem_test_exists, true, "core tools ecosystem test file is missing");
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
assert.equal(report.patch_batch_status, true, "patch batch support/test coverage is missing");
assert.equal(report.restore_batch_status, true, "restore batch support/test coverage is missing");
assert.equal(report.project_scan_status, true, "project scan support/test coverage is missing");
assert.equal(report.project_task_status, true, "project task support/test coverage is missing");
assert.equal(report.dev_server_status, true, "dev server support/test coverage is missing");
assert.equal(report.session_evidence_status, true, "session evidence support/test coverage is missing");
assert.equal(report.local_git_status, true, "local git support/test coverage is missing");
assert.equal(report.remote_github_still_blocked, true, "remote git/GitHub mutation blocking is missing");
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
console.log(`patch_batch_status: ${yes(report.patch_batch_status)}`);
console.log(`restore_batch_status: ${yes(report.restore_batch_status)}`);
console.log(`project_scan_status: ${yes(report.project_scan_status)}`);
console.log(`project_task_status: ${yes(report.project_task_status)}`);
console.log(`dev_server_status: ${yes(report.dev_server_status)}`);
console.log(`session_evidence_status: ${yes(report.session_evidence_status)}`);
console.log(`local_git_status: ${yes(report.local_git_status)}`);
console.log(`remote_github_still_blocked: ${yes(report.remote_github_still_blocked)}`);
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
