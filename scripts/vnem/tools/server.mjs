#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { appendFile, copyFile, mkdir, readdir, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { createConnection } from "node:net";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  emitAllInstallAdoptionProfiles,
  emitInstallAdoptionProfile,
  formatInstallDoctor,
  formatInstallProfileEmit,
  installAdoptionDoctor
} from "../../vnem-install-adoption.mjs";
import { attachToolRegistry } from "../registry/tool-registry.mjs";
import { loadBehaviorTestReferences } from "../registry/behavior-contracts.mjs";
import { registerRegistryStatusTool } from "../runtime/registry-tool.mjs";
import {
  ACTION_ALIASES as SHARED_ACTION_ALIASES,
  HARD_BLOCKED_ACTIONS as SHARED_HARD_BLOCKED_ACTIONS,
  buildPermissionProfiles as buildSharedPermissionProfiles
} from "../permissions/profiles.mjs";
import { PermissionRuntime } from "../permissions/runtime.mjs";
import { registerPermissionRuntimeTools } from "../permissions/tools.mjs";
import { PrecisionExecutionError } from "../precision/execution.mjs";
import { PrecisionRuntime } from "../precision/runtime.mjs";
import { registerToolsPrecisionSubsystem } from "../precision/tools.mjs";
import {
  applyVerticalSlicePlan,
  buildVerticalSlicePlan,
  inspectAppProject,
  rollbackVerticalSliceTransaction,
  runChromiumUserPath,
  updateTransactionAcceptance
} from "./app-engineering.mjs";
import { ProjectAutomationError, ProjectAutomationRuntime } from "./project-automation.mjs";
import { TestingCiError, TestingCiRuntime } from "../testing/runtime.mjs";
import { BrowserInteractionError, BrowserInteractionRuntime } from "./browser-interaction.mjs";
import { WindowsLocalError, WindowsLocalRuntime } from "./windows-local.mjs";
import { GithubDevelopmentError, GithubDevelopmentRuntime } from "./github-development.mjs";
import { GameDomainError, GameDomainRuntime } from "./game-domain.mjs";
import { DependencySecurityError, DependencySecurityRuntime } from "./dependency-security.mjs";
import { StructuralCodeError, StructuralCodeRuntime, structuralRuntimeLoadStatus } from "./structural-code.mjs";
import { ApiConnectorError, ApiConnectorRuntime } from "./api-connectors.mjs";
import { SkillAdapterError, SkillAdapterRuntime } from "./skill-runtime.mjs";
import { DataSystemsError, DataSystemsRuntime, dataSystemsRuntimeLoadStatus } from "./data-systems.mjs";
import {
  CLOUDFLARE_DESTRUCTIVE_APPROVAL_PHRASE,
  CLOUDFLARE_MUTATION_APPROVAL_PHRASE,
  CloudflareControlError,
  CloudflareControlRuntime
} from "./cloudflare-control.mjs";
import { CLIENT_SETUP_TOOL_NAMES, registerClientSetupTools } from "./client-setup.mjs";

import { createRepoIntelligenceRuntime } from "./repo-intelligence-runtime.mjs";
import { createSourceResearchRuntime } from "./source-research-runtime.mjs";
import { createBrowserResearchRuntime } from "./browser-research-runtime.mjs";
import { createToolsReliabilityRuntime } from "./reliability-runtime.mjs";
import { createToolsAdoptionRuntime } from "./adoption-runtime.mjs";
import { createGithubOperationsRuntime } from "./github-operations-runtime.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..", "..");
const SERVER_VERSION = "1.0.1";
const REQUIRED_TOOL_NAMES = [
  "vnem_tools_status",
  "vnem_tools_entrypoint",
  "vnem_tools_capability_router",
  "vnem_tools_adoption_readiness",
  "vnem_tools_visibility_doctor",
  "vnem_tools_underuse_detector",
  "vnem_tools_install_profile_emit",
  "vnem_tools_install_doctor",
  ...CLIENT_SETUP_TOOL_NAMES,
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
  "vnem_tools_list_files",
  "vnem_tools_search_files",
  "vnem_tools_workspace_map",
  "vnem_tools_read_many_files",
  "vnem_tools_code_search",
  "vnem_tools_find_references",
  "vnem_tools_dependency_scan",
  "vnem_tools_apply_patch",
  "vnem_tools_run_command",
  "vnem_tools_api_adapter_catalog",
  "vnem_tools_api_credential_reference_check",
  "vnem_tools_api_adapter_plan",
  "vnem_tools_api_adapter_execute",
  "vnem_tools_api_adapter_compensate",
  "vnem_tools_api_adapter_generate",
  "vnem_tools_api_adapter_contract_test",
  "vnem_tools_api_adapter_review_activate",
  "vnem_tools_skill_adapter_catalog",
  "vnem_tools_skill_package_inspect",
  "vnem_tools_skill_doctor",
  "vnem_tools_skill_adapter_plan",
  "vnem_tools_skill_adapter_execute",
  "vnem_tools_skill_source_verify",
  "vnem_tools_data_source_inspect",
  "vnem_tools_data_source_validate",
  "vnem_tools_data_source_diff",
  "vnem_tools_data_transform_plan",
  "vnem_tools_data_transform_apply",
  "vnem_tools_database_connection_plan",
  "vnem_tools_database_schema_inspect",
  "vnem_tools_database_query_plan",
  "vnem_tools_database_query",
  "vnem_tools_database_migration_preview",
  "vnem_tools_database_migration_apply",
  "vnem_tools_data_transaction_rollback",
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
  "vnem_tools_browser_interaction_run",
  "vnem_tools_browser_evidence_compare",
  "vnem_tools_ui_evidence_audit",
  "vnem_tools_apply_patch_batch",
  "vnem_tools_restore_batch",
  "vnem_tools_project_scan",
  "vnem_tools_project_automation_inspect",
  "vnem_tools_project_command_run",
  "vnem_tools_project_task_graph_plan",
  "vnem_tools_project_task_graph_run",
  "vnem_tools_project_task_graph_status",
  "vnem_tools_project_task_graph_rollback",
  "vnem_tools_project_runtime_diagnose",
  "vnem_tools_project_temp_cleanup",
  "vnem_tools_powershell_command_plan",
  "vnem_tools_windows_system_snapshot",
  "vnem_tools_windows_path_inspect",
  "vnem_tools_process_inspect",
  "vnem_tools_port_inspect",
  "vnem_tools_windows_service_status",
  "vnem_tools_windows_scheduled_task_status",
  "vnem_tools_windows_event_log_read",
  "vnem_tools_windows_app_config_detect",
  "vnem_tools_windows_change_plan",
  "vnem_tools_game_adapter_catalog",
  "vnem_tools_game_project_inspect",
  "vnem_tools_game_config_audit",
  "vnem_tools_mod_compatibility_analyze",
  "vnem_tools_mod_profile_compare",
  "vnem_tools_game_project_validate",
  "vnem_tools_mod_backup_create",
  "vnem_tools_mod_backup_restore",
  "vnem_tools_roblox_project_inspect",
  "vnem_tools_luau_symbol_map",
  "vnem_tools_dependency_inventory",
  "vnem_tools_dependency_risk_audit",
  "vnem_tools_dependency_advisory_audit",
  "vnem_tools_dependency_change_analyze",
  "vnem_tools_dependency_upgrade_plan",
  "vnem_tools_dependency_install_apply",
  "vnem_tools_dependency_transaction_rollback",
  "vnem_tools_structural_index_build",
  "vnem_tools_structural_graph_query",
  "vnem_tools_exact_symbol_references",
  "vnem_tools_refactor_rename_preview",
  "vnem_tools_refactor_move_preview",
  "vnem_tools_refactor_extract_plan",
  "vnem_tools_dead_code_candidates",
  "vnem_tools_refactor_impact_analyze",
  "vnem_tools_structural_patch_validate",
  "vnem_tools_refactor_apply_verify",
  "vnem_tools_refactor_transaction_rollback",
  "vnem_tools_test_system_inspect",
  "vnem_tools_affected_test_graph",
  "vnem_tools_test_run",
  "vnem_tools_ci_failure_diagnose",
  "vnem_tools_coverage_benchmark_report",
  "vnem_tools_app_inspect",
  "vnem_tools_app_vertical_slice_plan",
  "vnem_tools_app_vertical_slice_apply",
  "vnem_tools_app_acceptance_run",
  "vnem_tools_app_transaction_rollback",
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
  "vnem_tools_github_diff_review",
  "vnem_tools_github_review_threads",
  "vnem_tools_github_remote_proof",
  "vnem_tools_github_actions_run_inspect",
  "vnem_tools_github_release_verify",
  "vnem_tools_github_public_surface_audit",
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
  "vnem_tools_cloudflare_error_diagnose",
  "vnem_tools_evidence_pack_audit",
  "vnem_tools_mutation_approval_contract",
  "vnem_tools_secret_redaction_check",
  "vnem_tools_structural_code_search",
  "vnem_tools_exact_patch",
  "vnem_tools_unified_diff_apply",
  "vnem_tools_patch_transaction",
  "vnem_tools_patch_transaction_rollback",
  "vnem_tools_verification_loop",
  "vnem_tools_terminal_session",
  "vnem_tools_documentation_source_catalog",
  "vnem_tools_official_documentation_fetch",
  "vnem_tools_documentation_context",
  "vnem_tools_documentation_cache_status",
  "vnem_tools_ephemeral_script",
  "vnem_tools_code_index_status",
  "vnem_tools_permission_request",
  "vnem_tools_permission_grant",
  "vnem_tools_permission_revoke",
  "vnem_tools_permission_evaluate",
  "vnem_tools_permission_doctor"
];
const READ_ONLY_LOCAL = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const NETWORK_READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
const ACTION_TOOL = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false };
const NETWORK_ACTION = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true };
const API_CREDENTIAL_REFERENCE_SCHEMA = z.object({
  type: z.enum(["environment", "client_secret_reference", "os_credential_store", "provider_profile"]),
  name: z.string().min(1).max(160)
}).strict();
const DATA_FORMAT_SCHEMA = z.enum(["json", "jsonl", "ndjson", "csv", "yaml", "yml", "sqlite", "sqlite3", "db"]);
const DATABASE_CONNECTION_SCHEMA = z.object({
  type: z.enum(["local_sqlite", "remote_postgres", "remote_mysql", "remote_mariadb", "remote_sqlserver"]).default("local_sqlite"),
  path: z.string().optional(),
  provider: z.string().max(120).optional(),
  access: z.enum(["read_only", "read_write"]).default("read_only"),
  credential_reference: API_CREDENTIAL_REFERENCE_SCHEMA.optional(),
  scope: z.object({
    host: z.string().max(253),
    port: z.number().int().min(1).max(65535).optional(),
    database: z.string().max(128),
    schemas: z.array(z.string().max(128)).max(50).default([]),
    access: z.enum(["read_only", "read_write"]).default("read_only"),
    max_rows: z.number().int().min(1).max(500).default(100)
  }).strict().optional()
}).strict();
const GITHUB_SETTINGS_HEADER = "# ============================================================\n# GITHUB SETTINGS\n# ============================================================";
const DEFAULT_GITHUB_ENV_SETTINGS = {
  VNEM_TOOLS_AUTONOMY_MODE: "fast",
  VNEM_TOOLS_GITHUB_PROFILE: "maintainer",
  VNEM_TOOLS_GITHUB_ALLOWED_REPOS: "Ovvuhy/vnem;Ovvuhy/ME3-By-my-AI-and-Me",
  VNEM_TOOLS_GITHUB_PROTECTED_BRANCHES: "main;master;production",
  VNEM_TOOLS_GITHUB_ALLOW_DIRECT_PUSH: "0",
  VNEM_TOOLS_GITHUB_ALLOW_FORCE_PUSH: "0",
  VNEM_TOOLS_GITHUB_ALLOW_REPO_DELETE: "0",
  VNEM_TOOLS_GITHUB_ALLOW_SETTINGS_MUTATION: "0",
  VNEM_TOOLS_GITHUB_ALLOW_RELEASES: "1",
  VNEM_TOOLS_GITHUB_ALLOW_ACTIONS_RERUN: "1",
  VNEM_TOOLS_MALWARE_DOWNLOAD_BLOCK: "1"
};
const GITHUB_PROFILES = ["off", "read", "work", "maintainer", "admin", "owner", "custom"];
const DEFAULT_MAX_READ_BYTES = 64 * 1024;
const DEFAULT_MAX_RESULTS = 100;
const MAX_COMMAND_TIMEOUT_MS = 60000;
const MAX_COMMAND_OUTPUT_BYTES = 64 * 1024;
const MAX_API_TIMEOUT_MS = 30000;
const MAX_API_RESPONSE_BYTES = 64 * 1024;
const MAX_BROWSER_WAIT_MS = 5000;
const MAX_BROWSER_SCREENSHOT_BYTES = 10 * 1024 * 1024;
const MAX_VIEWPORT_WIDTH = 3840;
const MAX_VIEWPORT_HEIGHT = 2160;
const BROWSER_CANDIDATES = process.env.VNEM_TOOLS_BROWSER_COMMAND
  ? [process.env.VNEM_TOOLS_BROWSER_COMMAND]
  : ["chromium", "chromium-browser", "google-chrome", "google-chrome-stable", "chrome", "msedge", "microsoft-edge"];
const SKIPPED_DIRS = new Set([".git", ".vnem", "node_modules", "dist", "build", "coverage", ".next", ".turbo", ".cache"]);
const SAFE_PACKAGE_SCRIPT_PATTERN = /^(test|test:[a-z0-9:_-]+|validate|build|generate|check:links|dashboard:build|dashboard:check|core:readiness|tools:readiness|discover:dry-run|digest)$/i;
const SECRET_HEADER_PATTERN = /^(authorization|x-api-key|api-key|x-auth-token|cookie|set-cookie)$/i;
const DANGEROUS_COMMAND_PATTERN = /\b(rm\s+-rf|del\s+\/s|format\b|mkfs\b|diskpart\b|curl\b.*\|\s*(sh|bash)|wget\b.*\|\s*(sh|bash)|invoke-webrequest\b.*\|\s*iex|powershell\b.*-encodedcommand|pwsh\b.*-encodedcommand|npm\s+publish|git\s+push|git\s+reset\s+--hard|sudo\b|su\b|chmod\s+-R|chown\s+-R)\b/i;
const CONTROL_OPERATOR_PATTERN = /(\|\||&&|;|`|\$\(|>|<|\|)/;
const UNSAFE_PACKAGE_SCRIPT_PATTERN = /(^|[\s:_-])(install|publish|deploy|release|push|reset|clean:all|postinstall|preinstall)([\s:_-]|$)|git\s+push|npm\s+publish|pnpm\s+publish|yarn\s+publish|rm\s+-rf/i;
const DEV_SERVER_SCRIPT_PATTERN = /^(dev|start|preview)$/;
const PROJECT_TASKS = new Set(["test", "build", "validate", "lint", "typecheck", "doctor", "custom_script"]);
const LARGE_FILE_BYTES = 1024 * 1024;
const MAX_READ_MANY_TOTAL_BYTES = 128 * 1024;
const MAX_FETCH_TEXT_BYTES = 64 * 1024;
const devServers = new Map();
const sessions = new Map();
const appEngineeringPlans = new Map();

class ToolsError extends Error {
  constructor(message, code = "tools_error", details = {}) {
    super(message);
    this.name = "ToolsError";
    this.code = code;
    this.details = details;
  }
}

const allowedRoots = await computeAllowedRoots();
const evidenceRoot = await computeEvidenceRoot();
const permissionRuntime = await PermissionRuntime.create({
  workspaceRoot: allowedRoots[0],
  allowedRoots,
  profileName: process.env.VNEM_TOOLS_PERMISSION_PROFILE || null
});
const projectAutomationRuntime = new ProjectAutomationRuntime({ allowedRoots, evidenceRoot });
const testingCiRuntime = new TestingCiRuntime({ allowedRoots, evidenceRoot });
const browserInteractionRuntime = new BrowserInteractionRuntime({ allowedRoots, evidenceRoot });
const windowsLocalRuntime = new WindowsLocalRuntime({ allowedRoots });
const githubDevelopmentRuntime = new GithubDevelopmentRuntime({
  runProcess,
  resolveRoot: resolveGithubRoot,
  redact: redactSecrets,
  protectedBranches: () => githubSettings().protected_branches
});
const gameDomainRuntime = new GameDomainRuntime({ allowedRoots, evidenceRoot });
const dependencySecurityRuntime = new DependencySecurityRuntime({ allowedRoots, evidenceRoot });
const structuralCodeRuntime = new StructuralCodeRuntime({ allowedRoots, evidenceRoot, commandRuntime: projectAutomationRuntime });
const apiConnectorRuntime = new ApiConnectorRuntime({ allowedRoots, evidenceRoot });
const skillAdapterRuntime = new SkillAdapterRuntime({ allowedRoots, evidenceRoot, commandRuntime: projectAutomationRuntime });
const dataSystemsRuntime = new DataSystemsRuntime({ allowedRoots, evidenceRoot });
const activePermissionProfile = permissionRuntime.activeProfile();
const cloudflareControlRuntime = new CloudflareControlRuntime({
  allowedRoots,
  evidenceRoot,
  repoRoot,
  runProcess,
  runProcessWithInput,
  permissionProfile: () => activePermissionProfile.profile_name
});
const usablePacks = await loadUsablePacks();
const requestedPrecisionWorkspaceCandidate = path.resolve(
  process.env.VNEM_TOOLS_PRECISION_ROOT || process.env.VNEM_TOOLS_ROOT || process.env.VNEM_WORKSPACE_ROOT || process.cwd()
);
const requestedPrecisionWorkspaceRoot = existsSync(requestedPrecisionWorkspaceCandidate)
  ? await realpath(requestedPrecisionWorkspaceCandidate)
  : requestedPrecisionWorkspaceCandidate;
if (process.env.VNEM_TOOLS_PRECISION_ROOT && !isInsideAny(requestedPrecisionWorkspaceRoot, allowedRoots)) {
  throw new Error("VNEM Tools precision workspace must be inside VNEM_TOOLS_ALLOWED_ROOTS.");
}
const precisionWorkspaceRoot = isInsideAny(requestedPrecisionWorkspaceRoot, allowedRoots)
  ? requestedPrecisionWorkspaceRoot
  : allowedRoots[0];
const precisionRuntime = new PrecisionRuntime({
  workspaceRoot: precisionWorkspaceRoot
});

const server = new McpServer(
  { name: "vnem-tools", version: SERVER_VERSION },
  {
    instructions: [
      "VNEM Tools MCP is a safeguard-first action server for approved project work after VNEM Core has planned the task.",
      "Tools MCP is not Core MCP and is not Giga MCP. It can read, search, dry-run patches, apply approved patches, run approved allowlisted commands, prepare/perform approved limited API requests, capture approved local browser screenshots, and collect evidence.",
      "For code work, prefer vnem_tools_structural_code_search before broad traversal, vnem_tools_exact_patch or vnem_tools_patch_transaction for surgical writes, and vnem_tools_verification_loop for bounded red/green/check proof. Fetch official documentation into task-scoped context when framework behavior may have changed.",
      "Dry-run is the default for mutation, credential-bearing, command, broad-network, and browser actions. Vetted no-auth GET/HEAD adapters and VNEM-owned pure/read skill adapters may run as bounded safe reads; credentials are reference-only and external mutation remains scoped and approval-gated.",
      "The active Tools permission profile gates real actions. Default safe-readonly permits reviewed no-auth adapter reads and vetted local skill handlers in addition to local inspection; skill Markdown is always data and never executed. Credential use, commands, mutation, dependency installation, dev-server, Git, and broader network actions require an appropriate profile or exact scoped grant. GitHub autonomy uses command-backed gh/git paths for allowed profile-gated repo work; destructive GitHub admin, arbitrary shell, broad browser automation, account login automation, cookie extraction, CAPTCHA bypass, and broad web scraping remain blocked by default."
    ].join(" ")
  }
);
const toolsRegistry = attachToolRegistry(server, {
  serverName: "vnem-tools",
  version: SERVER_VERSION,
  implementationModule: "scripts/vnem/tools/server.mjs",
  behaviorTestReferences: loadBehaviorTestReferences(repoRoot, "vnem-tools")
});

const {
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
} = createToolsReliabilityRuntime({
  CLOUDFLARE_DESTRUCTIVE_APPROVAL_PHRASE,
  CLOUDFLARE_MUTATION_APPROVAL_PHRASE,
  activePermissionProfile,
  runtimeToolCatalog,
  githubSettings: (...args) => githubSettings(...args),
  githubProfilePolicy: (...args) => githubProfilePolicy(...args),
  arrayify
});

const {
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
} = createToolsAdoptionRuntime({
  toolsRegistry,
  statusObject,
  resolveAllowedRoot,
  runtimeToolCatalog,
  githubSettings: (...args) => githubSettings(...args),
  githubProfileStatus: (...args) => githubProfileStatus(...args),
  arrayify
});

const {
  formatBrowserAccessibilityAudit,
  formatBrowserCompare,
  formatBrowserDomSearch,
  formatBrowserLinkMap,
  formatBrowserPageInspect,
  formatBrowserReadability,
  formatBrowserResearchPack,
  parseSafeResearchUrl,
  redactUrlString,
  safeBrowserAccessibilityAudit,
  safeBrowserCompareSnapshots,
  safeBrowserDomSearch,
  safeBrowserLinkMap,
  safeBrowserPageInspect,
  safeBrowserReadabilityExtract,
  safeBrowserResearchPack,
  safeOptionalUrl,
  safeResearchBrief,
  safeSourceQualityCheck,
  significantTerms
} = createBrowserResearchRuntime({
  readFile,
  path,
  MAX_FETCH_TEXT_BYTES,
  ToolsError,
  resolveAllowedRoot,
  resolveAllowedFile,
  safeFetchUrlText,
  looksBinary,
  extractText,
  extractTitle,
  recordSession,
  writeEvidenceLog,
  enforceApproval,
  redactSecrets,
  containsRawSecret,
  redactUrl,
  truncate,
  arrayify
});

const {
  formatCaptchaDetector,
  formatClaimSourceMatrix,
  formatDownloadSafety,
  formatRedirectChain,
  formatResearchGapDetector,
  formatSearchProviderManifest,
  formatSearchQueryBuilder,
  formatSearchResultRanker,
  formatSourceExtract,
  formatSourceGraph,
  formatSourceMap,
  formatUrlReputation,
  formatWebSearch,
  safeCaptchaDetector,
  safeClaimSourceMatrix,
  safeDownloadSafetyCheck,
  safeRedirectChainCheck,
  safeResearchGapDetector,
  safeSearchProviderManifest,
  safeSearchQueryBuilder,
  safeSearchResultRanker,
  safeSourceExtract,
  safeSourceGraph,
  safeSourceMap,
  safeUrlReputationCheck,
  safeWebSearch
} = createSourceResearchRuntime({
  existsSync,
  readdir,
  stat,
  readFile,
  path,
  MAX_API_TIMEOUT_MS,
  SKIPPED_DIRS,
  allowedRoots,
  activePermissionProfile,
  actionPolicyPreview,
  enforceActionPolicy,
  decorateToolResult,
  resolveAllowedRoot,
  resolveAllowedFile,
  walkFiles,
  parseSafeResearchUrl,
  redactUrlString,
  safeOptionalUrl,
  significantTerms,
  looksBinary,
  recordSession,
  writeEvidenceLog,
  enforceApproval,
  isSecretLikePath,
  redactSecrets,
  containsRawSecret,
  redactUrl,
  truncate,
  arrayify
});

const {
  changeImpactPlan,
  codeSymbolMap,
  failureTriage,
  formatChangeImpactPlan,
  formatCodeSymbolMap,
  formatFailureTriage,
  formatLocalSessionRecovery,
  formatMcpSurfaceAudit,
  formatNextActionRanker,
  formatNoPlaceboAudit,
  formatPatchTargetFinder,
  formatRepoDeepMap,
  formatRepoEvidencePack,
  formatRepoWorkflowOrchestrator,
  formatSourceControlCharacterGuard,
  formatSourceImpactTrace,
  formatTestSelectionPlan,
  formatToolTestCoverageMap,
  localSessionRecovery,
  mcpSurfaceAudit,
  nextActionRanker,
  noPlaceboProgressAudit,
  patchTargetFinder,
  repoDeepMap,
  repoEvidencePack,
  repoWorkflowOrchestrator,
  sourceControlCharacterGuard,
  sourceImpactTrace,
  testSelectionPlan,
  toolTestCoverageMap
} = createRepoIntelligenceRuntime({
  existsSync,
  readFile,
  stat,
  path,
  CONTROL_OPERATOR_PATTERN,
  UNSAFE_PACKAGE_SCRIPT_PATTERN,
  LARGE_FILE_BYTES,
  testingCiRuntime,
  toolsRegistry,
  ToolsError,
  buildActionRecoveryPlan,
  highPowerActionReview,
  capabilityGapReport,
  uniqueToolNames,
  resolveAllowedRoot,
  resolveAllowedFile,
  walkWorkspace,
  looksBinary,
  detectFrameworks,
  gitValue: (...args) => gitValue(...args),
  taskProgressTruthCheck,
  writeEvidenceLog,
  isSecretLikePath,
  shouldSkipRelative,
  normalizePath,
  redactSecrets,
  truncate,
  arrayify
});

const {
  gitValue,
  githubAuthStatus,
  githubProfilePolicy,
  githubProfileStatus,
  githubSettings,
  parseGithubRepo,
  registerGithubTools
} = createGithubOperationsRuntime({
  existsSync,
  readFile,
  readdir,
  stat,
  path,
  z,
  READ_ONLY_LOCAL,
  NETWORK_READ,
  ACTION_TOOL,
  NETWORK_ACTION,
  GITHUB_SETTINGS_HEADER,
  DEFAULT_GITHUB_ENV_SETTINGS,
  GITHUB_PROFILES,
  githubDevelopmentRuntime,
  ToolsError,
  actionPolicyPreview,
  enforceActionPolicy,
  decorateToolResult,
  resolveGithubRoot,
  resolveAllowedFile,
  repoDeepMap,
  nextActionRanker,
  runProcess,
  recordSession,
  writeEvidenceLog,
  isSecretLikePath,
  normalizePath,
  redactSecrets,
  containsRawSecret,
  truncate,
  arrayify,
  taskProgressTruthCheck,
  withToolErrors,
  toolResult
});

registerTools(server);
for (const [implementationModule, toolNames] of [
  ["scripts/vnem/tools/reliability-runtime.mjs", [
    "vnem_tools_reliability_catalog", "vnem_tools_action_recovery_plan", "vnem_tools_high_power_action_review", "vnem_tools_capability_gap_report"
  ]],
  ["scripts/vnem/tools/adoption-runtime.mjs", [
    "vnem_tools_entrypoint", "vnem_tools_capability_router", "vnem_tools_adoption_readiness",
    "vnem_tools_visibility_doctor", "vnem_tools_underuse_detector"
  ]],
  ["scripts/vnem/tools/client-setup.mjs", CLIENT_SETUP_TOOL_NAMES],
  ["scripts/vnem/tools/repo-intelligence-runtime.mjs", [
    "vnem_tools_repo_deep_map", "vnem_tools_next_action_ranker", "vnem_tools_no_placebo_progress_audit",
    "vnem_tools_change_impact_plan", "vnem_tools_test_selection_plan", "vnem_tools_failure_triage", "vnem_tools_evidence_pack",
    "vnem_tools_local_session_recovery", "vnem_tools_repo_workflow_orchestrator", "vnem_tools_code_symbol_map",
    "vnem_tools_mcp_surface_audit", "vnem_tools_patch_target_finder", "vnem_tools_tool_test_coverage_map",
    "vnem_tools_source_impact_trace", "vnem_tools_source_control_character_guard"
  ]],
  ["scripts/vnem/tools/source-research-runtime.mjs", [
    "vnem_tools_search_provider_manifest", "vnem_tools_search_query_builder", "vnem_tools_web_search",
    "vnem_tools_search_result_ranker", "vnem_tools_redirect_chain_check", "vnem_tools_url_reputation_check",
    "vnem_tools_captcha_detector", "vnem_tools_download_safety_check", "vnem_tools_claim_source_matrix",
    "vnem_tools_research_gap_detector", "vnem_tools_source_map", "vnem_tools_source_extract", "vnem_tools_source_graph"
  ]],
  ["scripts/vnem/tools/browser-research-runtime.mjs", [
    "vnem_tools_source_quality_check", "vnem_tools_research_brief", "vnem_tools_browser_page_inspect",
    "vnem_tools_browser_readability_extract", "vnem_tools_browser_link_map", "vnem_tools_browser_dom_search",
    "vnem_tools_browser_accessibility_audit", "vnem_tools_browser_compare_snapshots", "vnem_tools_browser_research_pack"
  ]],
  ["scripts/vnem/tools/github-operations-runtime.mjs", [
    "vnem_tools_github_repo_inspect", "vnem_tools_github_diff_review", "vnem_tools_github_review_threads",
    "vnem_tools_github_remote_proof", "vnem_tools_github_actions_run_inspect", "vnem_tools_github_release_verify",
    "vnem_tools_github_public_surface_audit", "vnem_tools_repo_intelligence_report", "vnem_tools_github_branch_create",
    "vnem_tools_github_commit_push", "vnem_tools_github_pr_create", "vnem_tools_github_pr_update",
    "vnem_tools_github_issue_create", "vnem_tools_github_issue_update", "vnem_tools_github_issue_comment",
    "vnem_tools_github_labels_manage", "vnem_tools_github_actions_status", "vnem_tools_github_actions_rerun",
    "vnem_tools_github_ci_failure_triage", "vnem_tools_pr_quality_gate", "vnem_tools_github_release_plan",
    "vnem_tools_github_release_create", "vnem_tools_github_repo_settings_plan", "vnem_tools_github_repo_settings_apply"
  ]]
]) {
  for (const name of toolNames) toolsRegistry.annotate(name, { implementation_module: implementationModule });
}
registerPermissionRuntimeTools(server, permissionRuntime, { registry: toolsRegistry });
registerToolsPrecisionSubsystem(server, precisionRuntime, {
  registry: toolsRegistry,
  mutationGuard: assertPrecisionMutationPermission,
  networkGuard: assertPrecisionNetworkPermission
});
registerRegistryStatusTool(server, toolsRegistry, { name: "vnem_tools_registry_status", title: "VNEM Tools Registry Status" });
const toolsRegistryValidation = toolsRegistry.validate();
if (!toolsRegistryValidation.valid) throw new Error(`VNEM Tools registry validation failed: ${JSON.stringify(toolsRegistryValidation.errors)}`);
export async function startToolsServer() {
  await server.connect(new StdioServerTransport());
}

function registerTools(mcpServer) {
  mcpServer.registerTool(
    "vnem_tools_status",
    {
      title: "VNEM Tools Status",
      description: "Report the Tools MCP safety policy, allowed roots, command/network/secret policy, evidence location, and unsupported future tool classes.",
      inputSchema: {},
      annotations: READ_ONLY_LOCAL
    },
    async () => toolResult(formatStatus(), { tools_status: statusObject() })
  );

  mcpServer.registerTool(
    "vnem_tools_entrypoint",
    {
      title: "VNEM Tools Entrypoint",
      description: "VNEM Tools MCP first-call entrypoint to recommend and route exact next action calls for repo, code, debug, test, proof, GitHub, CI, patch, MCP, vetted skills, browser, recovery, and tooling tasks.",
      inputSchema: {
        user_goal: z.string().min(1),
        repo_path: z.string().optional(),
        root: z.string().default("."),
        task_mode: z.enum(["auto", "local_only", "implementation", "debugging", "repo_inspection", "patch_targeting", "mcp_tool_audit", "code_intelligence", "documentation", "skill", "database", "publish", "cloudflare", "browser_ui", "windows", "game_modding", "recovery", "no_placebo", "evidence_pack", "generated_artifact"]).default("auto"),
        changed_files: z.array(z.string()).default([]),
        failing_output: z.string().default("")
      },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => {
      const entrypoint = await toolsEntrypoint(args);
      return toolResult(formatToolsEntrypoint(entrypoint), { tools_entrypoint: entrypoint });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_capability_router",
    {
      title: "VNEM Tools Capability Router",
      description: "VNEM Tools MCP first-call entrypoint router that recommends and routes exact registered tools for repo, code, debug, test, proof, GitHub, CI, patch, MCP, and next action execution planning.",
      inputSchema: {
        user_goal: z.string().min(1),
        task_type: z.string().default("auto"),
        available_context: z.record(z.any()).default({})
      },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => {
      const router = toolsCapabilityRouter(args);
      return toolResult(formatToolsCapabilityRouter(router), { capability_router: router });
    }
  );

  mcpServer.registerTool(
    "vnem_tools_adoption_readiness",
    {
      title: "VNEM Tools Adoption Readiness",
      description: "VNEM Tools MCP adoption readiness check for first-call entrypoint recommend and route discoverability across registered tools, code, repo, debug, test, proof, GitHub, CI, patch, MCP, and next action contracts with no-placebo hooks.",
      inputSchema: { root: z.string().default(".") },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => {
      const readiness = await toolsAdoptionReadiness(args);
      return toolResult(formatToolsAdoptionReadiness(readiness), { adoption_readiness: readiness });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_visibility_doctor",
    {
      title: "VNEM Tools Visibility Doctor",
      description: "VNEM Tools MCP first-call visibility doctor and entrypoint check to recommend and route the next action across Tools repo/code/debug/test/proof/GitHub/CI/patch/MCP power paths with registered-name validation.",
      inputSchema: { user_goal: z.string().default(""), available_tool_names: z.array(z.string()).default([]) },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => {
      const doctor = toolsVisibilityDoctor(args);
      return toolResult(formatToolsVisibilityDoctor(doctor), { tools_visibility_doctor: doctor });
    }
  );

  mcpServer.registerTool(
    "vnem_tools_underuse_detector",
    {
      title: "VNEM Tools Underuse Detector",
      description: "VNEM Tools MCP first-call underuse detector and entrypoint pressure check to recommend and route the next action for repo, code, debug, test, proof, GitHub, CI, patch, MCP, browser, recovery, and evidence tasks with exact registered recovery calls.",
      inputSchema: {
        user_goal: z.string().min(1),
        recent_actions: z.array(z.string()).default([]),
        task_type: z.string().default("auto"),
        repo_path: z.string().optional(),
        changed_files: z.array(z.string()).default([])
      },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => {
      const detector = toolsUnderuseDetector(args);
      return toolResult(formatToolsUnderuseDetector(detector), { tools_underuse_detector: detector });
    }
  );

  mcpServer.registerTool(
    "vnem_tools_install_profile_emit",
    {
      title: "VNEM Tools Install Profile Emit",
      description: "VNEM Tools MCP first-call install adoption route: emit repo-local Core+Tools MCP profiles for Codex, Claude, Antigravity-style, Hermes, or generic clients, with repo/code/proof next action guidance and no external config writes.",
      inputSchema: {
        root: z.string().default(repoRoot),
        client: z.enum(["codex", "claude", "antigravity", "hermes", "generic", "all"]).default("generic")
      },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => {
      const result = args.client === "all"
        ? await emitAllInstallAdoptionProfiles({ root: args.root || repoRoot })
        : await emitInstallAdoptionProfile({ client: args.client, root: args.root || repoRoot });
      return toolResult(formatInstallProfileEmit(result), { install_profile_emit: result });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_install_doctor",
    {
      title: "VNEM Tools Install Doctor",
      description: "VNEM Tools MCP first-call install doctor route: validate Core+Tools MCP profile setup, repo/code/proof next action readiness, tool entrypoints, no secrets, no hidden control chars, and safe repo-local behavior.",
      inputSchema: {
        root: z.string().default(repoRoot),
        emit: z.boolean().default(true)
      },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => {
      const report = await installAdoptionDoctor({ root: args.root || repoRoot, emit: args.emit !== false, writeReport: true });
      return toolResult(formatInstallDoctor(report), { install_doctor: report });
    })
  );

  registerClientSetupTools(mcpServer, {
    repoRoot,
    enforceActionPolicy,
    toolResult,
    withToolErrors
  });

  mcpServer.registerTool(
    "vnem_tools_permission_profiles",
    {
      title: "VNEM Tools Permission Profiles",
      description: "Read-only list of Tools MCP permission profiles and their allow/block/approval policies.",
      inputSchema: {},
      annotations: READ_ONLY_LOCAL
    },
    async () => {
      const profiles = permissionProfilesObject();
      return toolResult(formatPermissionProfiles(profiles), { permission_profiles: profiles });
    }
  );

  mcpServer.registerTool(
    "vnem_tools_permission_status",
    {
      title: "VNEM Tools Permission Status",
      description: "Report active Tools permission profile, allowed roots, evidence root, localhost/search-provider status by presence only, and blocked categories without exposing secrets.",
      inputSchema: {},
      annotations: READ_ONLY_LOCAL
    },
    async () => {
      const status = permissionStatusObject();
      return toolResult(formatPermissionStatus(status), { permission_status: status });
    }
  );

  mcpServer.registerTool(
    "vnem_tools_reliability_catalog",
    {
      title: "Tools Reliability Catalog",
      description: "List major Tools MCP tools with honest reliability labels, safe claims, unsafe claims, known limits, and next validation steps.",
      inputSchema: { capability_group: z.string().optional() },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => {
      const catalog = buildReliabilityCatalog(args);
      return toolResult(formatReliabilityCatalog(catalog), { reliability_catalog: catalog });
    }
  );

  mcpServer.registerTool(
    "vnem_tools_action_recovery_plan",
    {
      title: "Tools Action Recovery Plan",
      description: "Turn a failed tool/action result into exact safe next steps, retry rules, and must-not-claim boundaries.",
      inputSchema: { tool_name: z.string().default(""), operation: z.string().default(""), error_code: z.string().default(""), stderr: z.string().default(""), stdout: z.string().default(""), context: z.string().default(""), permission_profile: z.string().optional() },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => {
      const plan = buildActionRecoveryPlan(args);
      return toolResult(formatActionRecoveryPlan(plan), { action_recovery_plan: plan });
    }
  );

  mcpServer.registerTool(
    "vnem_tools_high_power_action_review",
    {
      title: "High-power Action Review",
      description: "Review proposed high-power mutations before execution and return allow/block reasons, approval phrases, protected/secret/production risk, and safest path.",
      inputSchema: { tool_name: z.string().default(""), operation: z.string().default(""), target: z.string().default(""), mutation_type: z.string().default(""), destructive: z.boolean().default(false), approval_phrase: z.string().default(""), protected_resources: z.array(z.string()).default([]), expected_effect: z.string().default("") },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => {
      const review = highPowerActionReview(args);
      return toolResult(formatHighPowerActionReview(review), { high_power_action_review: review });
    }
  );

  mcpServer.registerTool(
    "vnem_tools_capability_gap_report",
    {
      title: "Tools Capability Gap Report",
      description: "Report known Tools MCP limitations honestly with safe alternatives and what would be needed to add them.",
      inputSchema: {},
      annotations: READ_ONLY_LOCAL
    },
    async () => {
      const report = capabilityGapReport();
      return toolResult(formatCapabilityGapReport(report), { capability_gap_report: report });
    }
  );

  mcpServer.registerTool(
    "vnem_tools_repo_deep_map",
    {
      title: "Repo Deep Map",
      description: "Build a compact deep repository map with scripts, languages, frameworks, entrypoints, registries, git state, changed files, generated/noise/risky paths, and bounded evidence.",
      inputSchema: { root: z.string().default("."), max_files: z.number().int().min(20).max(1200).default(500), max_depth: z.number().int().min(1).max(10).default(6), include_git: z.boolean().default(true) },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => {
      const map = await repoDeepMap(args);
      return toolResult(formatRepoDeepMap(map), { repo_deep_map: map });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_next_action_ranker",
    {
      title: "Next Action Ranker",
      description: "Rank the highest-value next repo actions using git state, scripts, changed files, TODO/FIXME markers, proof gaps, generated staleness, user goal, and placebo penalties.",
      inputSchema: { root: z.string().default("."), user_goal: z.string().default(""), known_failures: z.array(z.string()).default([]), max_actions: z.number().int().min(3).max(7).default(5) },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => {
      const ranking = await nextActionRanker(args);
      return toolResult(formatNextActionRanker(ranking), { next_action_ranker: ranking });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_no_placebo_progress_audit",
    {
      title: "No-placebo Progress Audit",
      description: "Check whether a proposed or completed batch is real implementation progress or likely placebo work such as registration-only tools, docs-only claims, mocked-only overclaims, or generated-only churn.",
      inputSchema: { root: z.string().default("."), proposed_summary: z.string().default(""), completed_summary: z.string().default(""), changed_files: z.array(z.string()).default([]), tests_run: z.array(z.string()).default([]), mocked_proof: z.array(z.string()).default([]), live_proof: z.array(z.string()).default([]) },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => {
      const audit = await noPlaceboProgressAudit(args);
      return toolResult(formatNoPlaceboAudit(audit), { no_placebo_progress_audit: audit });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_change_impact_plan",
    {
      title: "Change Impact Plan",
      description: "Map changed files to likely impact, affected VNEM areas/tools/features, generation needs, targeted checks, final checks, and full-suite trigger conditions.",
      inputSchema: { root: z.string().default("."), changed_files: z.array(z.string()).default([]), include_staged: z.boolean().default(false) },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => {
      const impact = await changeImpactPlan(args);
      return toolResult(formatChangeImpactPlan(impact), { change_impact_plan: impact });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_test_selection_plan",
    {
      title: "Test Selection Plan",
      description: "Choose the smallest useful verification set for a change and escalate only when risk/impact warrants it.",
      inputSchema: { root: z.string().default("."), user_goal: z.string().default(""), changed_files: z.array(z.string()).default([]), failure_context: z.string().default("") },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => {
      const plan = await testSelectionPlan(args);
      return toolResult(formatTestSelectionPlan(plan), { test_selection_plan: plan });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_failure_triage",
    {
      title: "Failure Triage",
      description: "Turn failing command/test output into a compact root-cause class, file/function to inspect, smallest fix, rerun command, and continue/stop/ask decision.",
      inputSchema: { root: z.string().default("."), command: z.string().default(""), stdout: z.string().default(""), stderr: z.string().default(""), exit_code: z.union([z.number(), z.string()]).optional(), context: z.string().default("") },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => {
      const triage = await failureTriage(args);
      return toolResult(formatFailureTriage(triage), { failure_triage: triage });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_evidence_pack",
    {
      title: "Repo Evidence Pack",
      description: "Build a compact final-handoff evidence summary with commands, tests, files, real behavior, mocked/live/blocked proof, remaining risk, commit status, safe claims, and must-not-claim lines.",
      inputSchema: { root: z.string().default("."), commands_run: z.array(z.string()).default([]), tests_passed: z.array(z.string()).default([]), tests_failed: z.array(z.string()).default([]), real_behavior_added: z.array(z.string()).default([]), mocked_proof: z.array(z.string()).default([]), live_proof: z.array(z.string()).default([]), blocked_proof: z.array(z.string()).default([]), remaining_risk: z.array(z.string()).default([]), commit_sha: z.string().default(""), commit_message: z.string().default("") },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => {
      const pack = await repoEvidencePack(args);
      return toolResult(formatRepoEvidencePack(pack), { evidence_pack: pack });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_local_session_recovery",
    {
      title: "Local Session Recovery",
      description: "Reconstruct compact local Git session state after chat/tool context loss: branch, head, stack, dirty files, unpushed commits, safe next step, and what is not proven.",
      inputSchema: { root: z.string().default("."), base_ref: z.string().default("origin/main"), task_goal: z.string().default(""), expected_branch_prefix: z.string().default("feat/"), max_commits: z.number().int().min(3).max(30).default(12) },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => {
      const recovery = await localSessionRecovery(args);
      return toolResult(formatLocalSessionRecovery(recovery), { local_session_recovery: recovery });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_repo_workflow_orchestrator",
    {
      title: "Repo Workflow Orchestrator",
      description: "Synthesize repo-power tools into one compact next-workflow plan for local implementation, publish, CI failure, recovery, validation, and no-placebo decisions.",
      inputSchema: {
        root: z.string().default("."),
        repo_path: z.string().optional(),
        user_goal: z.string().default(""),
        task_mode: z.enum(["local_only", "publish", "ci_failure", "ci_fix", "recovery", "implementation", "validation", "no_placebo"]).default("implementation"),
        changed_files: z.array(z.string()).default([]),
        failing_output: z.string().default(""),
        proof_level: z.enum(["targeted", "full_local", "remote"]).default("targeted"),
        allow_live_remote: z.boolean().default(false)
      },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => {
      const orchestration = await repoWorkflowOrchestrator(args);
      return toolResult(formatRepoWorkflowOrchestrator(orchestration), { repo_workflow_orchestrator: orchestration });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_code_symbol_map",
    {
      title: "Code Symbol Map",
      description: "Build a compact lightweight source symbol map with functions, classes, exports, handler-like symbols, imports/exports, file categories, and honest parser limits.",
      inputSchema: { root: z.string().default("."), max_files: z.number().int().min(20).max(1000).default(260), max_symbols: z.number().int().min(20).max(1000).default(220), include_tests: z.boolean().default(true) },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => {
      const map = await codeSymbolMap(args);
      return toolResult(formatCodeSymbolMap(map), { code_symbol_map: map });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_mcp_surface_audit",
    {
      title: "MCP Surface Audit",
      description: "Audit MCP tool registrations against handler candidates, catalog/manifest/readiness references, package scripts, behavior tests, registration-only risks, and exact repair targets.",
      inputSchema: { root: z.string().default("."), server_file: z.string().default("scripts/vnem-tools-mcp-server.mjs"), max_tools: z.number().int().min(10).max(250).default(160) },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => {
      const audit = await mcpSurfaceAudit(args);
      return toolResult(formatMcpSurfaceAudit(audit), { mcp_surface_audit: audit });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_patch_target_finder",
    {
      title: "Patch Target Finder",
      description: "Find exact likely source functions/files/tests/readiness/generated targets for a tool name, keyword, or natural-language goal using symbol and repo search evidence.",
      inputSchema: { root: z.string().default("."), user_goal: z.string().default(""), tool_name: z.string().default(""), keyword: z.string().default(""), max_results: z.number().int().min(3).max(30).default(12) },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => {
      const targets = await patchTargetFinder(args);
      return toolResult(formatPatchTargetFinder(targets), { patch_target_finder: targets });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_tool_test_coverage_map",
    {
      title: "Tool Test Coverage Map",
      description: "Map MCP tools to behavior tests, registration-only tests, readiness-only coverage, package-script mentions, weak coverage, and recommended test additions.",
      inputSchema: { root: z.string().default("."), tool_name: z.string().default(""), max_tools: z.number().int().min(10).max(250).default(160) },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => {
      const coverage = await toolTestCoverageMap(args);
      return toolResult(formatToolTestCoverageMap(coverage), { tool_test_coverage_map: coverage });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_source_impact_trace",
    {
      title: "Source Impact Trace",
      description: "Trace changed files or a target file/symbol to impacted MCP tools, features, tests, readiness/generation needs, minimum checks, and risk level.",
      inputSchema: { root: z.string().default("."), changed_files: z.array(z.string()).default([]), target_file: z.string().default(""), target_symbol: z.string().default(""), user_goal: z.string().default("") },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => {
      const trace = await sourceImpactTrace(args);
      return toolResult(formatSourceImpactTrace(trace), { source_impact_trace: trace });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_source_control_character_guard",
    {
      title: "Source Control Character Guard",
      description: "Scan source/test/config text files for hidden bidi Unicode and dangerous control characters while skipping binary/generated artifacts.",
      inputSchema: { root: z.string().default("."), changed_files: z.array(z.string()).default([]), max_files: z.number().int().min(10).max(1000).default(500) },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => {
      const guard = await sourceControlCharacterGuard(args);
      return toolResult(formatSourceControlCharacterGuard(guard), { source_control_character_guard: guard });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_action_policy_preview",
    {
      title: "VNEM Tools Action Policy Preview",
      description: "Classify a proposed Tools action against the active permission profile before any execution.",
      inputSchema: {
        proposed_action: z.string().min(1),
        action_type: z.string().optional(),
        target_path: z.string().optional(),
        source_description: z.string().optional()
      },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => {
      const preview = actionPolicyPreview(args);
      return toolResult(formatActionPolicyPreview(preview), { action_policy_preview: preview });
    }
  );

  mcpServer.registerTool(
    "vnem_tools_trust_boundary_classify",
    {
      title: "VNEM Tools Trust Boundary Classifier",
      description: "Classify data/action/source descriptions into trust-boundary levels and safe next actions.",
      inputSchema: { description: z.string().min(1) },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => {
      const trust = trustBoundaryClassify(args.description);
      return toolResult(formatTrustBoundary(trust), { trust_boundary: trust });
    }
  );

  mcpServer.registerTool(
    "vnem_tools_manifest",
    {
      title: "VNEM Tools Manifest",
      description: "Return a structured catalog of Tools MCP tools, capability groups, safety metadata, evidence behavior, Core handoff compatibility, and blocked unsafe actions.",
      inputSchema: { capability_group: z.string().optional() },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => {
      const manifest = buildToolsManifest(args.capability_group);
      return toolResult(formatManifest(manifest), { manifest });
    }
  );

  mcpServer.registerTool(
    "vnem_tools_prepare_action_plan",
    {
      title: "Prepare Tools Action Plan",
      description: "Turn a VNEM Core handoff or task into a cautious executable plan without doing any action.",
      inputSchema: {
        task: z.string().min(1),
        core_handoff: z.record(z.any()).optional(),
        known_context: z.record(z.any()).optional(),
        requested_actions: z.array(z.string()).default([]),
        risk_tolerance: z.string().optional()
      },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => {
      const plan = buildActionPlan(args);
      return toolResult(formatActionPlan(plan), { action_plan: plan });
    }
  );

  mcpServer.registerTool(
    "vnem_tools_permission_prompt",
    {
      title: "Prepare Permission Prompt",
      description: "Create clear normal-user approval text before risky Tools MCP actions.",
      inputSchema: {
        action_type: z.string().min(1),
        target_paths: z.array(z.string()).default([]),
        command: z.string().optional(),
        api_request: z.record(z.any()).optional(),
        risk_level: z.string().default("medium"),
        reason: z.string().default("Requested task requires an approved Tools MCP action."),
        dry_run_available: z.boolean().default(true),
        rollback_or_restore_plan: z.array(z.string()).default([])
      },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => {
      const prompt = buildPermissionPrompt(args);
      return toolResult(prompt.text, { permission_prompt: prompt });
    }
  );

  mcpServer.registerTool(
    "vnem_tools_read_file",
    {
      title: "Read Allowed File",
      description: "Safely read a text file under an allowed root with secret-path blocking, byte limits, and secret redaction.",
      inputSchema: {
        path: z.string().min(1),
        max_bytes: z.number().int().min(1).max(DEFAULT_MAX_READ_BYTES).default(16000)
      },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => {
      const target = await resolveAllowedFile(args.path, { mustExist: true, blockSecrets: true });
      const info = await stat(target.absolutePath);
      if (!info.isFile()) throw new ToolsError("Target is not a regular file.", "not_a_file", { path: target.relativePath });
      const maxBytes = Math.min(args.max_bytes || 16000, DEFAULT_MAX_READ_BYTES);
      const buffer = await readFile(target.absolutePath);
      if (buffer.includes(0)) throw new ToolsError("Binary files are blocked.", "binary_file_blocked", { path: target.relativePath });
      const truncated = buffer.length > maxBytes;
      const content = redactSecrets(buffer.subarray(0, maxBytes).toString("utf8"));
      const result = { path: target.relativePath, bytes_read: Math.min(buffer.length, maxBytes), bytes_total: buffer.length, truncated, content };
      return toolResult(`vnem_tools_read_file: read ${result.path}${truncated ? " (truncated)" : ""}`, { file: result });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_list_files",
    {
      title: "List Allowed Files",
      description: "List files under an allowed root while skipping build outputs, .git, node_modules, and secret-like files.",
      inputSchema: {
        root: z.string().default("."),
        glob_or_filter: z.string().optional(),
        max_results: z.number().int().min(1).max(500).default(DEFAULT_MAX_RESULTS)
      },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => {
      const root = await resolveAllowedRoot(args.root || ".");
      const results = [];
      await walkFiles(root.absolutePath, root.absolutePath, results, { filter: args.glob_or_filter, maxResults: args.max_results || DEFAULT_MAX_RESULTS });
      const output = { root: root.relativePath || ".", results, skipped_policy: skippedPolicy() };
      return toolResult(`vnem_tools_list_files: ${results.length} file(s)`, { files: output });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_search_files",
    {
      title: "Search Allowed Files",
      description: "Search text in allowed files with path/secret/binary/size/result limits and redacted snippets.",
      inputSchema: {
        root: z.string().default("."),
        query: z.string().min(1),
        file_glob: z.string().optional(),
        max_results: z.number().int().min(1).max(200).default(50),
        max_file_bytes: z.number().int().min(1).max(512000).default(128000)
      },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => {
      const result = await searchAllowedFiles(args);
      return toolResult(`vnem_tools_search_files: ${result.results.length} match(es) for ${JSON.stringify(args.query)}`, { search: result });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_workspace_map",
    {
      title: "Map Workspace Safely",
      description: "Create a bounded allowed-root workspace map with important dirs, entrypoints, config/docs/test files, large files, skipped paths, and evidence.",
      inputSchema: { root: z.string().default("."), max_depth: z.number().int().min(1).max(8).default(4), max_files: z.number().int().min(1).max(2000).default(300), include_hidden: z.boolean().default(false), session_id: z.string().optional() },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => { const map = await safeWorkspaceMap(args); return toolResult(formatWorkspaceMap(map), { workspace_map: map }); })
  );

  mcpServer.registerTool(
    "vnem_tools_read_many_files",
    {
      title: "Read Many Safe Files",
      description: "Read a bounded set of allowed text files for AI context with secret, binary, generated-output, per-file, total-byte, redaction, and evidence controls.",
      inputSchema: { root: z.string().default("."), paths: z.array(z.string()).min(1).max(40), max_file_bytes: z.number().int().min(1).max(DEFAULT_MAX_READ_BYTES).default(16000), max_total_bytes: z.number().int().min(1).max(MAX_READ_MANY_TOTAL_BYTES).default(64000), session_id: z.string().optional() },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => { const result = await safeReadManyFiles(args); return toolResult(formatReadManyFiles(result), { read_many_files: result }); })
  );

  mcpServer.registerTool(
    "vnem_tools_code_search",
    {
      title: "VNEM Code Search",
      description: "Search allowed project files with secret/generated skips, context lines, capped redacted snippets, and evidence logging.",
      inputSchema: { root: z.string().default("."), query: z.string().min(1), file_globs: z.array(z.string()).default([]), max_results: z.number().int().min(1).max(300).default(50), context_lines: z.number().int().min(0).max(5).default(0), case_sensitive: z.boolean().default(false), session_id: z.string().optional() },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => { const result = await safeCodeSearch(args); return toolResult(formatCodeSearch(result), { code_search: result }); })
  );

  mcpServer.registerTool(
    "vnem_tools_find_references",
    {
      title: "Find Symbol References",
      description: "Find likely references/definitions for a symbol across allowed project text files with boundary-aware snippets and evidence.",
      inputSchema: { root: z.string().default("."), symbol: z.string().min(1), max_results: z.number().int().min(1).max(300).default(50), session_id: z.string().optional() },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => { const result = await safeFindReferences(args); return toolResult(formatFindReferences(result), { references: result }); })
  );

  mcpServer.registerTool(
    "vnem_tools_dependency_scan",
    {
      title: "Dependency And Script Risk Scan",
      description: "Analyze package manifests, scripts, lockfiles, likely frameworks, and suspicious package scripts without installing or using network audit.",
      inputSchema: { root: z.string().default("."), include_scripts: z.boolean().default(true), include_lockfiles: z.boolean().default(true), session_id: z.string().optional() },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => { const result = await safeDependencyScan(args); return toolResult(formatDependencyScan(result), { dependency_scan: result }); })
  );

  mcpServer.registerTool(
    "vnem_tools_apply_patch",
    {
      title: "Apply Safe Patch",
      description: "Verify or apply one surgical text patch under an allowed root. Dry-run default; real writes require explicit approval and an approval note.",
      inputSchema: {
        patch: z.string().min(1),
        target_root: z.string().default("."),
        dry_run: z.boolean().default(true),
        approved: z.boolean().default(false),
        approval_note: z.string().default(""),
        backup: z.boolean().default(true)
      },
      annotations: ACTION_TOOL
    },
    async (args) => withToolErrors(async () => {
      const patchResult = await safeApplyPatch(args);
      return toolResult(formatPatch(patchResult), { patch: patchResult });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_apply_patch_batch",
    {
      title: "Apply Safe Multi-file Patch Batch",
      description: "Dry-run or apply approved multi-file text operations under allowed roots with backups, no partial apply by default, restore plan, and evidence logging.",
      inputSchema: {
        operations: z.array(z.record(z.any())).min(1),
        target_root: z.string().default("."),
        dry_run: z.boolean().default(true),
        approved: z.boolean().default(false),
        approval_note: z.string().default(""),
        allow_partial: z.boolean().default(false),
        session_id: z.string().optional()
      },
      annotations: ACTION_TOOL
    },
    async (args) => withToolErrors(async () => {
      const patchBatch = await safeApplyPatchBatch(args);
      return toolResult(formatPatchBatch(patchBatch), { patch_batch: patchBatch });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_restore_batch",
    {
      title: "Restore Batch From Tools Backups",
      description: "Dry-run or restore multiple backed-up files from a Tools MCP restore plan. Approval required for real restore.",
      inputSchema: {
        restore_plan: z.array(z.record(z.any())).min(1),
        dry_run: z.boolean().default(true),
        approved: z.boolean().default(false),
        approval_note: z.string().default(""),
        session_id: z.string().optional()
      },
      annotations: ACTION_TOOL
    },
    async (args) => withToolErrors(async () => {
      const restoreBatch = await safeRestoreBatch(args);
      return toolResult(formatRestoreBatch(restoreBatch), { restore_batch: restoreBatch });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_project_scan",
    {
      title: "Scan Local Project Safely",
      description: "Summarize allowed local project structure, package scripts, likely frameworks, and safe commands without reading secrets.",
      inputSchema: { root: z.string().default("."), max_files: z.number().int().min(1).max(1000).default(200), include_scripts: z.boolean().default(true), session_id: z.string().optional() },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => {
      const scan = await safeProjectScan(args);
      return toolResult(formatProjectScan(scan), { project_scan: scan });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_app_inspect",
    {
      title: "Inspect App Architecture And Data Flow",
      description: "Inspect an allowed web project for framework support, frontend/backend boundaries, routes, components, APIs, data flow, state, completion gaps, validation, accessibility, responsive behavior, and focused test/build scripts.",
      inputSchema: { root: z.string().default("."), max_files: z.number().int().min(1).max(2000).default(500), session_id: z.string().optional() },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => {
      const inspection = await safeAppInspect(args);
      return toolResult(formatAppInspect(inspection), { app_inspection: inspection });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_app_vertical_slice_plan",
    {
      title: "Plan Coherent App Vertical Slice",
      description: "Generate a deterministic file-by-file preview for a complete frontend/API/domain vertical slice. Automatic apply is limited to reviewed marker-backed Vite React Node or static Node adapters; other projects remain inspection/plan only.",
      inputSchema: { root: z.string().default("."), feature_name: z.string().default("Task board"), adapter: z.enum(["vite-react-node", "static-node", ""]).default(""), max_files: z.number().int().min(1).max(2000).default(500), session_id: z.string().optional() },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => {
      const plan = await safeAppVerticalSlicePlan(args);
      return toolResult(formatAppPlan(plan), { app_vertical_slice_plan: plan });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_app_vertical_slice_apply",
    {
      title: "Apply App Vertical Slice Transaction",
      description: "Dry-run or apply a previously previewed app plan with hash preconditions, staged writes, per-file rename commits, automatic rollback on failure, and a retained transaction manifest. Real apply requires explicit approval.",
      inputSchema: { plan_id: z.string().min(1), dry_run: z.boolean().default(true), approved: z.boolean().default(false), approval_note: z.string().default(""), session_id: z.string().optional() },
      annotations: ACTION_TOOL
    },
    async (args) => withToolErrors(async () => {
      const transaction = await safeAppVerticalSliceApply(args);
      return toolResult(formatAppApply(transaction), { app_vertical_slice_transaction: transaction });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_app_acceptance_run",
    {
      title: "Run App Vertical Slice Acceptance",
      description: "Dry-run or execute focused test/build scripts, a localhost dev server, a real Chromium user path, desktop/mobile screenshots, console/network capture, and a completion report. Can restore the transaction automatically when acceptance fails.",
      inputSchema: {
        root: z.string().default("."),
        manifest_path: z.string().optional(),
        scripts: z.array(z.enum(["test", "build", "validate", "lint", "typecheck"])).default(["test", "build"]),
        dev_script: z.enum(["dev", "start", "preview"]).default("dev"),
        port: z.number().int().min(3000).max(9999).default(4319),
        dry_run: z.boolean().default(true),
        approved: z.boolean().default(false),
        approval_note: z.string().default(""),
        restore_on_failure: z.boolean().default(true),
        wait_ms: z.number().int().min(100).max(5000).default(1200),
        timeout_ms: z.number().int().min(1000).max(60000).default(30000),
        session_id: z.string().optional()
      },
      annotations: ACTION_TOOL
    },
    async (args) => withToolErrors(async () => {
      const acceptance = await safeAppAcceptanceRun(args);
      return toolResult(formatAppAcceptance(acceptance), { app_acceptance: acceptance });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_app_transaction_rollback",
    {
      title: "Rollback App Vertical Slice Transaction",
      description: "Dry-run or restore every file in an app transaction after checking current-content hashes. Real rollback requires explicit approval and cannot overwrite later edits.",
      inputSchema: { root: z.string().default("."), manifest_path: z.string().min(1), dry_run: z.boolean().default(true), approved: z.boolean().default(false), approval_note: z.string().default(""), session_id: z.string().optional() },
      annotations: ACTION_TOOL
    },
    async (args) => withToolErrors(async () => {
      const rollback = await safeAppTransactionRollback(args);
      return toolResult(formatAppRollback(rollback), { app_transaction_rollback: rollback });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_project_automation_inspect",
    {
      title: "Inspect Project Automation Environment",
      description: "Detect real shell environments, package managers, package scripts, task runners, and the layered command policy without executing project tasks.",
      inputSchema: { root: z.string().default("."), session_id: z.string().optional() },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => {
      const root = await resolveAllowedRoot(args.root || ".");
      const report = await projectAutomationRuntime.inspectEnvironment({ ...args, root: root.absolutePath });
      recordSession(args.session_id, "project_scans", report);
      return toolResult(formatProjectAutomationInspect(report), { project_automation_inspection: report });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_project_command_run",
    {
      title: "Review and Run Exact Project Command",
      description: "Dry-run exact argv review or execute one known-safe, project-declared, or stronger-profile reviewed custom command without request-provided shell operators or hidden chaining. Binds execution to a review id and records timeout, exit, process-tree, output, and Git-state evidence.",
      inputSchema: {
        root: z.string().default("."),
        cwd: z.string().default("."),
        mode: z.enum(["known_safe", "project_script", "reviewed_custom"]).default("known_safe"),
        script: z.string().default(""),
        argv: z.array(z.string()).max(64).default([]),
        review_id: z.string().default(""),
        dry_run: z.boolean().default(true),
        approved: z.boolean().default(false),
        approval_note: z.string().default(""),
        timeout_ms: z.number().int().min(1000).max(120000).default(30000),
        max_output_bytes: z.number().int().min(512).max(65536).default(16000),
        session_id: z.string().optional()
      },
      annotations: ACTION_TOOL
    },
    async (args) => withToolErrors(async () => {
      const root = await resolveAllowedRoot(args.root || ".");
      const commandArgs = { ...args, root: root.absolutePath };
      const review = await projectAutomationRuntime.reviewCommand(commandArgs);
      enforceActionPolicy(review.permission_action, { ...args, proposed_action: review.display_command });
      const result = await projectAutomationRuntime.runCommand(commandArgs);
      if (result.executed) recordSession(args.session_id, "commands_run", result.execution);
      return toolResult(formatProjectCommand(result), { project_command: result });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_project_task_graph_plan",
    {
      title: "Plan Persistent Project Task Graph",
      description: "Review and persist a dependency-ordered project task graph with satisfaction checks, exact command bindings, declared compensating commands, and resumable state.",
      inputSchema: {
        root: z.string().default("."),
        name: z.string().default("project automation graph"),
        nodes: z.array(z.object({
          id: z.string().min(1).max(64),
          depends_on: z.array(z.string()).default([]),
          mode: z.enum(["known_safe", "project_script", "reviewed_custom"]),
          script: z.string().default(""),
          argv: z.array(z.string()).max(64).default([]),
          cwd: z.string().default("."),
          timeout_ms: z.number().int().min(1000).max(120000).default(30000),
          max_output_bytes: z.number().int().min(512).max(65536).default(16000),
          satisfaction: z.object({
            type: z.enum(["path_exists", "path_missing", "file_sha256", "port_listening"]),
            path: z.string().default(""),
            sha256: z.string().default(""),
            port: z.number().int().min(1).max(65535).optional()
          }).optional(),
          rollback: z.object({
            mode: z.enum(["known_safe", "project_script", "reviewed_custom"]),
            script: z.string().default(""),
            argv: z.array(z.string()).max(64).default([]),
            cwd: z.string().default(".")
          }).optional()
        })).min(1).max(100),
        session_id: z.string().optional()
      },
      annotations: ACTION_TOOL
    },
    async (args) => withToolErrors(async () => {
      const root = await resolveAllowedRoot(args.root || ".");
      const graph = await projectAutomationRuntime.planTaskGraph({ ...args, root: root.absolutePath });
      recordSession(args.session_id, "task_graphs", graph);
      return toolResult(formatTaskGraph("plan", graph), { project_task_graph: graph });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_project_task_graph_run",
    {
      title: "Run or Resume Project Task Graph",
      description: "Dry-run permission review or execute/resume a persisted task graph in dependency order, skip satisfied nodes, checkpoint every node, stop on failure, and preserve exact output/process evidence.",
      inputSchema: {
        graph_id: z.string().min(1),
        dry_run: z.boolean().default(true),
        approved: z.boolean().default(false),
        approval_note: z.string().default(""),
        max_nodes: z.number().int().min(1).max(100).default(100),
        continue_on_failure: z.boolean().default(false),
        ports: z.array(z.number().int().min(1).max(65535)).max(50).default([]),
        session_id: z.string().optional()
      },
      annotations: ACTION_TOOL
    },
    async (args) => withToolErrors(async () => {
      const status = await projectAutomationRuntime.taskGraphStatus({ graph_id: args.graph_id, include_nodes: true });
      if (args.dry_run !== false) {
        const previews = [...new Map(status.nodes.map((node) => [node.review.permission_action, actionPolicyPreview({ action_type: node.review.permission_action, proposed_action: node.review.display_command })])).values()];
        const planned = { ...status, operation_result: "planned", executed: false, action_policy_previews: previews };
        return toolResult(formatTaskGraph("run", planned), { project_task_graph: planned });
      }
      const result = await projectAutomationRuntime.runTaskGraph(args, {
        authorize: async (review) => enforceActionPolicy(review.permission_action, { ...args, dry_run: false, proposed_action: review.display_command })
      });
      recordSession(args.session_id, "task_graphs", result);
      return toolResult(formatTaskGraph("run", result), { project_task_graph: result });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_project_task_graph_status",
    {
      title: "Inspect Project Task Graph Status",
      description: "Read persisted graph state, node attempts/results, interruption count, resume availability, rollback coverage, and evidence paths after context or process loss.",
      inputSchema: { graph_id: z.string().min(1), include_nodes: z.boolean().default(true) },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => {
      const result = await projectAutomationRuntime.taskGraphStatus(args);
      return toolResult(formatTaskGraph("status", result), { project_task_graph: result });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_project_task_graph_rollback",
    {
      title: "Rollback Project Task Graph",
      description: "Dry-run or execute exact declared compensating commands in reverse dependency order. Reports nodes without rollback instead of claiming unknown side effects were restored.",
      inputSchema: { graph_id: z.string().min(1), dry_run: z.boolean().default(true), approved: z.boolean().default(false), approval_note: z.string().default(""), continue_on_failure: z.boolean().default(false), session_id: z.string().optional() },
      annotations: ACTION_TOOL
    },
    async (args) => withToolErrors(async () => {
      const status = await projectAutomationRuntime.taskGraphStatus({ graph_id: args.graph_id, include_nodes: true });
      if (args.dry_run !== false) {
        const planned = { ...status, operation_result: "planned", executed: false, rollback_order: [...status.order].reverse(), unresolved_without_declared_rollback: status.rollback_contract.nodes_without_rollback };
        return toolResult(formatTaskGraph("rollback", planned), { project_task_graph_rollback: planned });
      }
      const result = await projectAutomationRuntime.rollbackTaskGraph(args, {
        authorize: async (review) => enforceActionPolicy(review.permission_action, { ...args, dry_run: false, proposed_action: review.display_command })
      });
      recordSession(args.session_id, "restores", result);
      return toolResult(formatTaskGraph("rollback", result), { project_task_graph_rollback: result });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_project_runtime_diagnose",
    {
      title: "Diagnose Project Runtime Logs Ports and Locks",
      description: "Collect bounded logs first, inspect requested listening ports, known VNEM dev servers, file-lock signals, temp paths, and interrupted task graphs without killing unknown processes.",
      inputSchema: { root: z.string().default("."), ports: z.array(z.number().int().min(1).max(65535)).max(50).default([]), log_paths: z.array(z.string()).max(30).default([]), lock_paths: z.array(z.string()).max(20).default([]), max_log_files: z.number().int().min(1).max(30).default(10), session_id: z.string().optional() },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => {
      const root = await resolveAllowedRoot(args.root || ".");
      const result = await projectAutomationRuntime.diagnoseRuntime({ ...args, root: root.absolutePath }, { devServers: listDevServers().servers });
      recordSession(args.session_id, "runtime_diagnostics", result);
      return toolResult(formatRuntimeDiagnosis(result), { project_runtime_diagnosis: result });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_project_temp_cleanup",
    {
      title: "Quarantine or Restore Project Temp Paths",
      description: "Preview, approval-gated quarantine, or restore explicit project-local temp/cache paths with symlink blocking, bounded Windows lock retries, a manifest, and no irreversible delete.",
      inputSchema: { root: z.string().default("."), operation: z.enum(["preview", "quarantine", "restore"]).default("preview"), paths: z.array(z.string()).max(30).default([]), cleanup_id: z.string().default(""), dry_run: z.boolean().default(true), approved: z.boolean().default(false), approval_note: z.string().default(""), retry_count: z.number().int().min(0).max(10).default(5), retry_delay_ms: z.number().int().min(25).max(2000).default(150), session_id: z.string().optional() },
      annotations: ACTION_TOOL
    },
    async (args) => withToolErrors(async () => {
      const root = await resolveAllowedRoot(args.root || ".");
      enforceActionPolicy("temp_cleanup", { ...args, proposed_action: `${args.operation} project temp paths` });
      const result = await projectAutomationRuntime.tempCleanup({ ...args, root: root.absolutePath });
      if (result.executed) recordSession(args.session_id, args.operation === "restore" ? "restores" : "temp_cleanups", result);
      return toolResult(formatTempCleanup(result), { project_temp_cleanup: result });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_powershell_command_plan",
    {
      title: "Plan Safely Quoted PowerShell Command",
      description: "Construct a non-executing PowerShell native-command invocation using the call operator, single-quoted literal tokens, doubled embedded quotes, bounded arguments, and secret/control-character blocking. Native argv execution remains preferred.",
      inputSchema: { executable: z.string().default("powershell.exe"), arguments: z.array(z.string()).max(50).default([]) },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => {
      const result = windowsLocalRuntime.planPowerShellCommand(args);
      return toolResult(formatWindowsLocal("vnem_tools_powershell_command_plan", result), { powershell_command_plan: result });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_windows_system_snapshot",
    {
      title: "Inspect Windows Development Environment",
      description: "Read a bounded Windows/local-PC snapshot: OS and PowerShell status, PATH health, Node/npm/git/gh and shell discovery, temp accessibility, long-path visibility, and Windows Defender status where accessible. Does not return environment values or change the machine.",
      inputSchema: {},
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => {
      const permission = enforceActionPolicy("local_pc_read", { ...args, dry_run: false, proposed_action: "bounded Windows development environment snapshot" });
      const result = { ...(await windowsLocalRuntime.systemSnapshot()), permission };
      return toolResult(formatWindowsLocal("vnem_tools_windows_system_snapshot", result), { windows_system_snapshot: result });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_windows_path_inspect",
    {
      title: "Inspect Windows Paths Permissions Links and Locks",
      description: "Normalize and inspect up to 25 allowed-root paths for existence, current-token read/write/traverse access, symlink or junction escape, writable-open lock signal, temp location, and long-path risk without reading file contents or changing paths.",
      inputSchema: { root: z.string().default("."), paths: z.array(z.string()).max(25).default(["."]) },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => {
      const permission = enforceActionPolicy("local_pc_read", { ...args, dry_run: false, proposed_action: "bounded allowed-root path metadata inspection" });
      const result = { ...(await windowsLocalRuntime.inspectPaths(args)), permission };
      return toolResult(formatWindowsLocal("vnem_tools_windows_path_inspect", result), { windows_path_inspection: result });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_process_inspect",
    {
      title: "Inspect Exact Windows Processes",
      description: "Read bounded metadata for exact PIDs or executable names using Win32_Process. Returns PID, parent PID, executable path, and creation time; never returns command lines, environments, owner tokens, or performs termination.",
      inputSchema: { pids: z.array(z.number().int().positive()).max(25).default([]), names: z.array(z.string()).max(25).default([]), include_vnem_process: z.boolean().default(false) },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => {
      const permission = enforceActionPolicy("local_pc_read", { ...args, dry_run: false, proposed_action: "exact Windows process metadata inspection" });
      const result = { ...(await windowsLocalRuntime.inspectProcesses(args)), permission };
      return toolResult(formatWindowsLocal("vnem_tools_process_inspect", result), { process_inspection: result });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_port_inspect",
    {
      title: "Inspect Exact Windows TCP Ports",
      description: "Inspect up to 50 exact TCP ports using bounded netstat evidence and correlate listener PIDs without stopping processes or changing firewall/security settings.",
      inputSchema: { ports: z.array(z.number().int().min(1).max(65535)).min(1).max(50) },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => {
      const permission = enforceActionPolicy("local_pc_read", { ...args, dry_run: false, proposed_action: "exact Windows TCP port inspection" });
      const result = { ...(await windowsLocalRuntime.inspectPorts(args)), permission };
      return toolResult(formatWindowsLocal("vnem_tools_port_inspect", result), { port_inspection: result });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_windows_service_status",
    {
      title: "Inspect Exact Windows Service Status",
      description: "Read state, start mode, PID, and exit code for up to 20 exact Windows service names. No wildcard enumeration and no start, stop, or configuration mutation.",
      inputSchema: { names: z.array(z.string()).max(20).default(["EventLog", "Schedule", "WinDefend"]) },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => {
      const permission = enforceActionPolicy("local_pc_read", { ...args, dry_run: false, proposed_action: "exact Windows service status inspection" });
      const result = { ...(await windowsLocalRuntime.serviceStatus(args)), permission };
      return toolResult(formatWindowsLocal("vnem_tools_windows_service_status", result), { windows_service_status: result });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_windows_scheduled_task_status",
    {
      title: "Inspect Exact Windows Scheduled Tasks",
      description: "Read state and bounded run metadata for up to 20 exact scheduled-task paths. Task actions/arguments are not returned and create/change/delete operations are not implemented.",
      inputSchema: { tasks: z.array(z.string()).min(1).max(20) },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => {
      const permission = enforceActionPolicy("local_pc_read", { ...args, dry_run: false, proposed_action: "exact Windows scheduled-task status inspection" });
      const result = { ...(await windowsLocalRuntime.scheduledTaskStatus(args)), permission };
      return toolResult(formatWindowsLocal("vnem_tools_windows_scheduled_task_status", result), { windows_scheduled_task_status: result });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_windows_event_log_read",
    {
      title: "Read Bounded Windows Event Log Evidence",
      description: "Read up to 50 redacted recent events from Application, System, or Setup over at most 24 hours. Reports access denial honestly and performs no broad export, log clearing, or provider bypass.",
      inputSchema: { log_name: z.enum(["Application", "System", "Setup"]).default("Application"), lookback_minutes: z.number().int().min(1).max(1440).default(60), max_events: z.number().int().min(1).max(50).default(20), levels: z.array(z.number().int().min(1).max(4)).max(4).default([]) },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => {
      const permission = enforceActionPolicy("local_pc_read", { ...args, dry_run: false, proposed_action: "bounded Windows Event Viewer read" });
      const result = { ...(await windowsLocalRuntime.eventLogRead(args)), permission };
      return toolResult(formatWindowsLocal("vnem_tools_windows_event_log_read", result), { windows_event_log: result });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_windows_app_config_detect",
    {
      title: "Detect Installed Clients and Config Locations",
      description: "Reuse VNEM's client catalog to detect known command/install/config/profile locations and return reload guidance without reading or modifying config contents or guessing unverified global paths.",
      inputSchema: { root: z.string().default(".") },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => {
      const permission = enforceActionPolicy("local_pc_read", { ...args, dry_run: false, proposed_action: "known app and config location detection" });
      const result = { ...(await windowsLocalRuntime.detectAppConfigs(args)), permission };
      return toolResult(formatWindowsLocal("vnem_tools_windows_app_config_detect", result), { windows_app_config_detection: result });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_windows_change_plan",
    {
      title: "Plan Scoped Windows System Change",
      description: "Build a non-executing permission/rollback gate for an exact service, registry, scheduled-task, firewall, antivirus-exclusion, system-PATH, or machine-configuration request. Security disabling is hard-blocked and this tool never mutates the machine.",
      inputSchema: {
        operation: z.enum(["service_change", "registry_change", "scheduled_task_change", "firewall_change", "antivirus_exclusion", "system_path_change", "machine_configuration"]),
        target: z.string().default(""),
        desired_state: z.string().default(""),
        rollback_steps: z.array(z.string()).max(20).default([])
      },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => {
      const result = windowsLocalRuntime.planSystemChange(args);
      const actionPolicy = actionPolicyPreview({ action_type: "local_pc_action", proposed_action: `${args.operation} ${args.target}`.trim(), target_path: args.target });
      const output = { ...result, action_policy_preview: actionPolicy };
      return toolResult(formatWindowsLocal("vnem_tools_windows_change_plan", output), { windows_change_plan: output });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_game_adapter_catalog",
    {
      title: "Inspect Game Mod and Roblox Adapter Contracts",
      description: "Return the bounded game-domain adapter contract and detect applicable generic text/mod, Roblox/Rojo/Luau, and guarded-binary policies without launching games or tools.",
      inputSchema: { root: z.string().optional() },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => {
      const permission = enforceActionPolicy("game_inspect", { ...args, dry_run: false, proposed_action: "bounded game-domain adapter detection" });
      const result = { ...(await gameDomainRuntime.adapterCatalog(args)), permission };
      return toolResult(formatGameDomain("vnem_tools_game_adapter_catalog", result), { game_adapter_catalog: result });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_game_project_inspect",
    {
      title: "Inspect Game or Mod Project Inventory",
      description: "Inventory a bounded allowed-root game/mod project, detect manifests/load orders/configs/assets/guarded binaries, hash regular files, find duplicates, and require isolated generated output without executing anything.",
      inputSchema: { root: z.string().default("."), max_files: z.number().int().min(10).max(3000).default(1000), max_depth: z.number().int().min(1).max(20).default(12), session_id: z.string().optional() },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => {
      const permission = enforceActionPolicy("game_inspect", { ...args, dry_run: false, proposed_action: "bounded game/mod project inventory" });
      const result = { ...(await gameDomainRuntime.inspectProject(args)), permission };
      recordSession(args.session_id, "game_domain_inspections", result);
      return toolResult(formatGameDomain("vnem_tools_game_project_inspect", result), { game_project_inspection: result });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_game_config_audit",
    {
      title: "Audit Game Mod Lua and Luau Configs",
      description: "Parse or statically scan bounded text, JSON, XML, YAML, TOML, Lua, and Luau configs without returning values, executing code, or pretending lexical checks prove game semantics.",
      inputSchema: { root: z.string().default("."), paths: z.array(z.string()).max(100).default([]), max_files: z.number().int().min(1).max(100).default(50), session_id: z.string().optional() },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => {
      const permission = enforceActionPolicy("game_inspect", { ...args, dry_run: false, proposed_action: "bounded structured game config audit" });
      const result = { ...(await gameDomainRuntime.auditConfigs(args)), permission };
      recordSession(args.session_id, "game_domain_inspections", result);
      return toolResult(formatGameDomain("vnem_tools_game_config_audit", result), { game_config_audit: result });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_mod_compatibility_analyze",
    {
      title: "Analyze Mod Manifests Load Order and Compatibility",
      description: "Parse bounded manifests and load order into dependency, conflict, cycle, exact-version, ordering, and compatibility-matrix evidence. Does not activate a profile or claim runtime compatibility.",
      inputSchema: { root: z.string().default("."), manifest_paths: z.array(z.string()).max(60).default([]), load_order_path: z.string().optional(), max_manifests: z.number().int().min(1).max(60).default(30), session_id: z.string().optional() },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => {
      const permission = enforceActionPolicy("game_inspect", { ...args, dry_run: false, proposed_action: "mod manifest and load-order compatibility analysis" });
      const result = { ...(await gameDomainRuntime.analyzeCompatibility(args)), permission };
      recordSession(args.session_id, "game_domain_inspections", result);
      return toolResult(formatGameDomain("vnem_tools_mod_compatibility_analyze", result), { mod_compatibility_analysis: result });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_mod_profile_compare",
    {
      title: "Compare Two Mod Profiles",
      description: "Compare two bounded JSON/YAML/TOML/text mod profiles for added, removed, version, enabled, and order changes without changing a mod manager or active game files.",
      inputSchema: { root: z.string().default("."), left_path: z.string().min(1), right_path: z.string().min(1), session_id: z.string().optional() },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => {
      const permission = enforceActionPolicy("game_inspect", { ...args, dry_run: false, proposed_action: "bounded mod profile comparison" });
      const result = { ...(await gameDomainRuntime.compareProfiles(args)), permission };
      recordSession(args.session_id, "game_domain_inspections", result);
      return toolResult(formatGameDomain("vnem_tools_mod_profile_compare", result), { mod_profile_comparison: result });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_game_project_validate",
    {
      title: "Validate Game Mod or Roblox Project Statically",
      description: "Run bounded parser, path, case-collision, hash, guarded-binary, Roblox mapping, asset/config, and static script checks; return exact isolated project command plans without executing unknown tools or launching a game.",
      inputSchema: { root: z.string().default("."), max_files: z.number().int().min(10).max(2000).default(800), session_id: z.string().optional() },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => {
      const permission = enforceActionPolicy("game_inspect", { ...args, dry_run: false, proposed_action: "bounded game/mod project static validation" });
      const result = { ...(await gameDomainRuntime.validateProject(args)), permission };
      recordSession(args.session_id, "game_domain_validations", result);
      return toolResult(formatGameDomain("vnem_tools_game_project_validate", result), { game_project_validation: result });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_mod_backup_create",
    {
      title: "Create Isolated Mod Project Backup Package",
      description: "Dry-run or create an approval-gated bounded directory package for exact regular files with SHA-256 manifest under isolated .vnem output. Secret-like paths, links, installers, and execution are blocked.",
      inputSchema: { root: z.string().default("."), paths: z.array(z.string()).min(1).max(100), adapter_id: z.enum(["generic-text-mod-project", "roblox-rojo-luau", "guarded-binary-game-format"]).default("generic-text-mod-project"), output_root: z.string().default(".vnem/game-domain"), max_files: z.number().int().min(1).max(1000).default(500), max_total_bytes: z.number().int().min(1024).max(134217728).default(67108864), dry_run: z.boolean().default(true), approved: z.boolean().default(false), approval_note: z.string().default(""), session_id: z.string().optional() },
      annotations: ACTION_TOOL
    },
    async (args) => withToolErrors(async () => {
      const permission = enforceActionPolicy("game_config_write", { ...args, proposed_action: `create isolated game/mod backup for ${args.paths.join(", ")}` });
      const result = { ...(await gameDomainRuntime.createBackup(args)), permission };
      if (result.executed) recordSession(args.session_id, "game_domain_backups", result);
      return toolResult(formatGameDomain("vnem_tools_mod_backup_create", result), { mod_backup: result });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_mod_backup_restore",
    {
      title: "Restore Isolated Mod Project Backup Package",
      description: "Dry-run or restore a VNEM game-domain package after manifest hash verification and exact current-target hash preconditions; creates a pre-restore safety package and never launches a game.",
      inputSchema: { root: z.string().default("."), manifest_path: z.string().min(1), expected_current_sha256: z.record(z.any()).default({}), dry_run: z.boolean().default(true), approved: z.boolean().default(false), approval_note: z.string().default(""), session_id: z.string().optional() },
      annotations: ACTION_TOOL
    },
    async (args) => withToolErrors(async () => {
      const permission = enforceActionPolicy("game_config_write", { ...args, proposed_action: `restore exact game/mod backup ${args.manifest_path}` });
      const result = { ...(await gameDomainRuntime.restoreBackup(args)), permission };
      if (result.executed) recordSession(args.session_id, "restores", result);
      return toolResult(formatGameDomain("vnem_tools_mod_backup_restore", result), { mod_backup_restore: result });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_roblox_project_inspect",
    {
      title: "Inspect Roblox Rojo and Luau Project Structure",
      description: "Map bounded Rojo projects, service paths, missing/escaping mappings, Lua/Luau contexts, configured toolchains/tests, remote trust boundaries, and static risks without Studio, account, plugin, or place mutation.",
      inputSchema: { root: z.string().default("."), max_files: z.number().int().min(10).max(2500).default(1200), session_id: z.string().optional() },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => {
      const permission = enforceActionPolicy("game_inspect", { ...args, dry_run: false, proposed_action: "bounded Roblox Rojo and Luau project inspection" });
      const result = { ...(await gameDomainRuntime.inspectRoblox(args)), permission };
      recordSession(args.session_id, "game_domain_inspections", result);
      return toolResult(formatGameDomain("vnem_tools_roblox_project_inspect", result), { roblox_project_inspection: result });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_luau_symbol_map",
    {
      title: "Map Luau Symbols Requires Services and Remotes",
      description: "Build a bounded file/line map of Lua/Luau functions, table members, requires, Roblox services, remote trust boundaries, and credible static-risk markers without executing source.",
      inputSchema: { root: z.string().default("."), query: z.string().default(""), max_files: z.number().int().min(1).max(2000).default(800), session_id: z.string().optional() },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => {
      const permission = enforceActionPolicy("game_inspect", { ...args, dry_run: false, proposed_action: "bounded Luau source and trust-boundary mapping" });
      const result = { ...(await gameDomainRuntime.mapLuauSymbols(args)), permission };
      recordSession(args.session_id, "game_domain_inspections", result);
      return toolResult(formatGameDomain("vnem_tools_luau_symbol_map", result), { luau_symbol_map: result });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_dependency_inventory",
    {
      title: "Build Dependency Graph and SBOM Inventory",
      description: "Parse bounded npm package-lock v1/v2/v3, pnpm/Yarn, Python, Cargo, and Go manifests or lockfiles into normalized direct/transitive packages, root and transitive graph edges, lifecycle flags, lock integrity, credential-safe sources, and an SBOM-style inventory without installing anything.",
      inputSchema: { root: z.string().default("."), max_packages: z.number().int().min(1).max(10000).default(5000), max_edges: z.number().int().min(1).max(30000).default(15000), session_id: z.string().optional() },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => {
      const permission = enforceActionPolicy("dependency_scan", { ...args, dry_run: false, proposed_action: "bounded dependency manifest, lockfile, graph, and SBOM inventory" });
      const result = { ...(await dependencySecurityRuntime.inventory(args)), permission };
      recordSession(args.session_id, "dependency_security_inspections", result);
      return toolResult(formatDependencySecurity("vnem_tools_dependency_inventory", result), { dependency_inventory: result });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_dependency_risk_audit",
    {
      title: "Audit Dependency Lifecycle Supply Chain and License Risk",
      description: "Inspect lifecycle hooks, suspicious commands, package sources/integrity, typosquatting indicators, supplied maintenance metadata, and license families while preserving uncertainty and returning no registry credentials.",
      inputSchema: {
        root: z.string().default("."),
        project_license: z.string().default(""),
        trusted_package_names: z.array(z.string()).max(500).default([]),
        package_metadata: z.array(z.object({ name: z.string(), last_published_at: z.string().optional(), maintainer_count: z.number().int().min(0).optional(), deprecated: z.string().optional(), repository: z.string().optional() })).max(1000).default([]),
        session_id: z.string().optional()
      },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => {
      const permission = enforceActionPolicy("dependency_scan", { ...args, dry_run: false, proposed_action: "bounded dependency lifecycle, provenance, maintenance, typosquat, and license audit" });
      const result = { ...(await dependencySecurityRuntime.riskAudit(args)), permission };
      recordSession(args.session_id, "dependency_security_inspections", result);
      return toolResult(formatDependencySecurity("vnem_tools_dependency_risk_audit", result), { dependency_risk_audit: result });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_dependency_advisory_audit",
    {
      title: "Inspect Approved Dependency Advisory Evidence",
      description: "Parse a bounded report with allowlisted npm/OSV/GitHub Advisory/NVD source attribution, clearly marking caller-supplied provenance, or with explicit network approval run npm audit against the public npm registry in an isolated credential-free manifest copy. Lifecycle scripts never run.",
      inputSchema: {
        root: z.string().default("."),
        source: z.enum(["approved_report", "npm_registry"]).default("approved_report"),
        report_path: z.string().default(""),
        source_url: z.string().default(""),
        captured_at: z.string().default(""),
        timeout_ms: z.number().int().min(5000).max(300000).default(120000),
        dry_run: z.boolean().default(true),
        approved: z.boolean().default(false),
        approval_note: z.string().default(""),
        session_id: z.string().optional()
      },
      annotations: NETWORK_READ
    },
    async (args) => withToolErrors(async () => {
      let permission = enforceActionPolicy("dependency_scan", { ...args, dry_run: false, proposed_action: "inspect approved dependency advisory report" });
      if (args.source === "npm_registry") {
        permission = args.dry_run !== false
          ? actionPolicyPreview({ action_type: "external_fetch", proposed_action: "run isolated credential-free npm advisory audit" })
          : enforceActionPolicy("external_fetch", { ...args, proposed_action: "run isolated credential-free npm advisory audit" });
      }
      const result = { ...(await dependencySecurityRuntime.advisoryAudit(args)), permission };
      recordSession(args.session_id, "dependency_advisory_audits", result);
      return toolResult(formatDependencySecurity("vnem_tools_dependency_advisory_audit", result), { dependency_advisory_audit: result });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_dependency_change_analyze",
    {
      title: "Compare Direct and Transitive Dependency Changes",
      description: "Compare two allowed project snapshots by normalized dependency graph, identify added/removed/direct/transitive/version changes, flag major-version indicators, trace impacted direct packages, and select existing focused verification scripts.",
      inputSchema: { baseline_root: z.string().min(1), candidate_root: z.string().min(1), max_packages: z.number().int().min(1).max(10000).default(5000), max_edges: z.number().int().min(1).max(30000).default(15000), session_id: z.string().optional() },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => {
      const permission = enforceActionPolicy("dependency_scan", { ...args, dry_run: false, proposed_action: "compare bounded direct and transitive dependency snapshots" });
      const result = { ...(await dependencySecurityRuntime.compare(args)), permission };
      recordSession(args.session_id, "dependency_security_inspections", result);
      return toolResult(formatDependencySecurity("vnem_tools_dependency_change_analyze", result), { dependency_change_analysis: result });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_dependency_upgrade_plan",
    {
      title: "Create Hash Bound Dependency Upgrade Plan",
      description: "Create a hash-bound exact-version npm add/update plan only when an existing parsed package-lock.json or npm-shrinkwrap.json provides a deterministic rollback baseline; includes direct dependency type, breaking-major indicators, script-disabled commands, affected tests, and credential boundaries. Does not install.",
      inputSchema: {
        root: z.string().default("."),
        packages: z.array(z.object({ name: z.string().min(1), target_version: z.string().default(""), dependency_type: z.enum(["dependency", "devDependency", "optionalDependency"]).default("dependency"), source_type: z.enum(["registry", "local"]).default("registry"), source_path: z.string().default("") })).min(1).max(50),
        verify_scripts: z.array(z.enum(["test", "validate", "build", "lint", "typecheck", "check"])).max(6).default(["test", "build"]),
        session_id: z.string().optional()
      },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => {
      const permission = enforceActionPolicy("dependency_scan", { ...args, dry_run: false, proposed_action: "create exact hash-bound dependency upgrade plan" });
      const result = { ...(await dependencySecurityRuntime.createUpgradePlan(args)), permission };
      recordSession(args.session_id, "dependency_upgrade_plans", result);
      return toolResult(formatDependencySecurity("vnem_tools_dependency_upgrade_plan", result), { dependency_upgrade_plan: result });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_dependency_install_apply",
    {
      title: "Apply Approved Dependency Install with Verification and Rollback",
      description: "Dry-run or apply a fresh hash-bound npm plan under approved-installs or a scoped package_install grant. Uses unique ephemeral npm configs and an allowlisted environment, disables lifecycle scripts, recursively reviews nested npm verification scripts, terminates timed-out process trees, verifies the lockfile/build, and automatically restores files plus npm state on failure.",
      inputSchema: {
        plan_id: z.string().min(1),
        dry_run: z.boolean().default(true),
        approved: z.boolean().default(false),
        approval_note: z.string().default(""),
        allow_dependency_binary_execution: z.boolean().default(false),
        binary_approval_note: z.string().default(""),
        timeout_ms: z.number().int().min(5000).max(300000).default(180000),
        session_id: z.string().optional()
      },
      annotations: ACTION_TOOL
    },
    async (args) => withToolErrors(async () => {
      const permission = args.dry_run !== false
        ? actionPolicyPreview({ action_type: "package_install", proposed_action: `apply reviewed dependency plan ${args.plan_id}` })
        : enforceActionPolicy("package_install", { ...args, proposed_action: `apply reviewed dependency plan ${args.plan_id}` });
      const result = { ...(await dependencySecurityRuntime.applyInstall(args)), permission };
      if (result.executed) recordSession(args.session_id, "dependency_install_transactions", result);
      return toolResult(formatDependencySecurity("vnem_tools_dependency_install_apply", result), { dependency_install: result });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_dependency_transaction_rollback",
    {
      title: "Rollback Verified Dependency Transaction",
      description: "Dry-run or restore exact pre-install package manifest and lockfile bytes after current-hash verification, then restore npm state with lifecycle scripts disabled. Refuses stale or cross-project transactions.",
      inputSchema: { root: z.string().default("."), transaction_id: z.string().min(1), dry_run: z.boolean().default(true), approved: z.boolean().default(false), approval_note: z.string().default(""), timeout_ms: z.number().int().min(5000).max(300000).default(180000), session_id: z.string().optional() },
      annotations: ACTION_TOOL
    },
    async (args) => withToolErrors(async () => {
      const permission = args.dry_run !== false
        ? actionPolicyPreview({ action_type: "package_install", proposed_action: `rollback dependency transaction ${args.transaction_id}` })
        : enforceActionPolicy("package_install", { ...args, proposed_action: `rollback dependency transaction ${args.transaction_id}` });
      const result = { ...(await dependencySecurityRuntime.rollback(args)), permission };
      if (result.executed) recordSession(args.session_id, "dependency_install_transactions", result);
      return toolResult(formatDependencySecurity("vnem_tools_dependency_transaction_rollback", result), { dependency_transaction_rollback: result });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_structural_index_build",
    {
      title: "Build Incremental Structural Code Index",
      description: "Build or incrementally refresh a bounded persisted code graph. JavaScript/TypeScript use Babel ASTs plus lexical bindings; Python, Go, Rust, Java, C#, Kotlin, C/C++, Lua/Luau, Ruby, and PHP use explicitly lower-confidence adapters. Generated/minified code and secret paths are skipped.",
      inputSchema: { root: z.string().default("."), refresh: z.boolean().default(false), max_files: z.number().int().min(1).max(10000).default(5000), max_file_bytes: z.number().int().min(1024).max(4194304).default(1048576), session_id: z.string().optional() },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => {
      const permission = enforceActionPolicy("search_code", { ...args, dry_run: false, proposed_action: "build bounded AST and heuristic structural code index" });
      const result = { ...(await structuralCodeRuntime.buildIndex(args)), permission };
      recordSession(args.session_id, "structural_code_inspections", result);
      return toolResult(formatStructuralCode("vnem_tools_structural_index_build", result), { structural_index: result });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_structural_graph_query",
    {
      title: "Query Structural Code Graph",
      description: "Query indexed symbols, static imports, calls, literal routes, components, APIs, tests, and package boundaries with parser-confidence limits preserved.",
      inputSchema: { root: z.string().default("."), symbol: z.string().default(""), kind: z.string().default(""), language: z.string().default(""), path_contains: z.string().default(""), callee: z.string().default(""), route: z.string().default(""), limit: z.number().int().min(1).max(500).default(100), refresh: z.boolean().default(false), session_id: z.string().optional() },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => {
      const permission = enforceActionPolicy("search_code", { ...args, dry_run: false, proposed_action: "query bounded structural code graph" });
      const result = { ...(await structuralCodeRuntime.query(args)), permission };
      recordSession(args.session_id, "structural_code_inspections", result);
      return toolResult(formatStructuralCode("vnem_tools_structural_graph_query", result), { structural_graph_query: result });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_exact_symbol_references",
    {
      title: "Resolve Exact Symbol References",
      description: "Resolve one symbol through Babel lexical bindings and static ESM imports when available, while marking heuristic, dynamic, reflective, generated, and external-consumer limits instead of claiming compiler-grade certainty.",
      inputSchema: { root: z.string().default("."), symbol: z.string().min(1), file: z.string().optional(), refresh: z.boolean().default(false), session_id: z.string().optional() },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => {
      const permission = enforceActionPolicy("search_code", { ...args, dry_run: false, proposed_action: `resolve lexical references for ${args.symbol}` });
      const result = { ...(await structuralCodeRuntime.exactReferences(args)), permission };
      recordSession(args.session_id, "structural_code_inspections", result);
      return toolResult(formatStructuralCode("vnem_tools_exact_symbol_references", result), { exact_symbol_references: result });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_refactor_rename_preview",
    {
      title: "Preview Binding Aware Symbol Rename",
      description: "Create a hash-bound non-mutating rename preview for exactly one Babel-resolved binding, including static ESM consumers, collisions, textual uncertainty, affected tests, public-export acknowledgement, and apply blockers.",
      inputSchema: { root: z.string().default("."), symbol: z.string().min(1), new_name: z.string().min(1), file: z.string().optional(), allow_public_api_change: z.boolean().default(false), verify_scripts: z.array(z.enum(["test", "validate", "typecheck", "lint", "check"])).min(1).max(5).default(["test"]), refresh: z.boolean().default(false), session_id: z.string().optional() },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => {
      const permission = enforceActionPolicy("search_code", { ...args, dry_run: false, proposed_action: `preview binding-aware rename ${args.symbol} to ${args.new_name}` });
      const result = { ...(await structuralCodeRuntime.renamePreview(args)), permission };
      recordSession(args.session_id, "structural_refactor_previews", result);
      return toolResult(formatStructuralCode("vnem_tools_refactor_rename_preview", result), { refactor_rename_preview: result });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_refactor_move_preview",
    {
      title: "Preview Module Move and Import Rewrites",
      description: "Preview a module move, incoming and outgoing relative-import rewrites, package-boundary changes, affected tests, and unresolved alias/dynamic-consumer risk. Automatic move apply remains intentionally disabled.",
      inputSchema: { root: z.string().default("."), source_file: z.string().min(1), target_file: z.string().min(1), refresh: z.boolean().default(false), session_id: z.string().optional() },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => {
      const permission = enforceActionPolicy("search_code", { ...args, dry_run: false, proposed_action: `preview module move ${args.source_file} to ${args.target_file}` });
      const result = { ...(await structuralCodeRuntime.movePreview(args)), permission };
      recordSession(args.session_id, "structural_refactor_previews", result);
      return toolResult(formatStructuralCode("vnem_tools_refactor_move_preview", result), { refactor_move_preview: result });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_refactor_extract_plan",
    {
      title: "Plan Function or Module Extraction",
      description: "Plan a non-mutating extraction from an exact line range with selected symbols, inferred inputs/outputs, call sites, affected tests, confidence, and closure/runtime uncertainties.",
      inputSchema: { root: z.string().default("."), file: z.string().min(1), start_line: z.number().int().min(1), end_line: z.number().int().min(1), new_module_path: z.string().default(""), refresh: z.boolean().default(false), session_id: z.string().optional() },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => {
      const permission = enforceActionPolicy("search_code", { ...args, dry_run: false, proposed_action: `plan structural extraction from ${args.file}` });
      const result = { ...(await structuralCodeRuntime.extractPlan(args)), permission };
      recordSession(args.session_id, "structural_refactor_previews", result);
      return toolResult(formatStructuralCode("vnem_tools_refactor_extract_plan", result), { refactor_extract_plan: result });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_dead_code_candidates",
    {
      title: "Find Evidence Bounded Dead Code Candidates",
      description: "Find static dead-code candidates with confidence and explicit must-not-delete claims. Dynamic imports, reflection, conventions, templates, generated code, and external consumers remain unproven.",
      inputSchema: { root: z.string().default("."), limit: z.number().int().min(1).max(1000).default(200), refresh: z.boolean().default(false), session_id: z.string().optional() },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => {
      const permission = enforceActionPolicy("search_code", { ...args, dry_run: false, proposed_action: "inspect static dead-code candidates without deletion" });
      const result = { ...(await structuralCodeRuntime.deadCodeCandidates(args)), permission };
      recordSession(args.session_id, "structural_code_inspections", result);
      return toolResult(formatStructuralCode("vnem_tools_dead_code_candidates", result), { dead_code_candidates: result });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_refactor_impact_analyze",
    {
      title: "Analyze Structural Refactor Impact",
      description: "Trace reverse static-import impact from changed files or a symbol into files, import paths, symbols, routes, components, package boundaries, and affected tests with dynamic/runtime limits.",
      inputSchema: { root: z.string().default("."), changed_files: z.array(z.string()).max(500).default([]), symbol: z.string().default(""), max_depth: z.number().int().min(1).max(20).default(6), refresh: z.boolean().default(false), session_id: z.string().optional() },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => {
      const permission = enforceActionPolicy("search_code", { ...args, dry_run: false, proposed_action: "analyze static structural refactor impact" });
      const result = { ...(await structuralCodeRuntime.impactAnalyze(args)), permission };
      recordSession(args.session_id, "structural_code_inspections", result);
      return toolResult(formatStructuralCode("vnem_tools_refactor_impact_analyze", result), { refactor_impact_analysis: result });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_structural_patch_validate",
    {
      title: "Validate Structural Patch State",
      description: "Reparse changed code and report syntax errors, unresolved relative imports, duplicate explicit exports, affected tests, and available verification scripts without executing project code.",
      inputSchema: { root: z.string().default("."), changed_files: z.array(z.string()).max(500).default([]), verify_scripts: z.array(z.enum(["test", "validate", "typecheck", "lint", "check"])).max(5).default(["test"]), session_id: z.string().optional() },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => {
      const permission = enforceActionPolicy("search_code", { ...args, dry_run: false, proposed_action: "validate structural patch state without executing tests" });
      const result = { ...(await structuralCodeRuntime.validatePatch(args)), permission };
      recordSession(args.session_id, "structural_code_inspections", result);
      return toolResult(formatStructuralCode("vnem_tools_structural_patch_validate", result), { structural_patch_validation: result });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_refactor_apply_verify",
    {
      title: "Apply Verify and Auto Rollback Refactor",
      description: "Dry-run or apply one fresh high-confidence rename preview with staged regular-file writes, stale-hash checks, reviewed project tests, verification worktree-delta detection, post-reference proof, transaction evidence, and automatic all-or-rollback behavior.",
      inputSchema: { preview_id: z.string().min(1), dry_run: z.boolean().default(true), approved: z.boolean().default(false), approval_note: z.string().default(""), allow_uncertain: z.boolean().default(false), timeout_ms: z.number().int().min(5000).max(300000).default(120000), session_id: z.string().optional() },
      annotations: ACTION_TOOL
    },
    async (args) => withToolErrors(async () => {
      const patchPermission = args.dry_run !== false ? actionPolicyPreview({ action_type: "apply_patch", proposed_action: `apply refactor preview ${args.preview_id}` }) : enforceActionPolicy("apply_patch", { ...args, proposed_action: `apply refactor preview ${args.preview_id}` });
      const testPermission = args.dry_run !== false ? actionPolicyPreview({ action_type: "run_test", proposed_action: `verify refactor preview ${args.preview_id}` }) : enforceActionPolicy("run_test", { ...args, proposed_action: `verify refactor preview ${args.preview_id}` });
      const result = { ...(await structuralCodeRuntime.applyRefactor(args)), permission: { patch: patchPermission, verification: testPermission } };
      if (result.executed) recordSession(args.session_id, "structural_refactor_transactions", result);
      return toolResult(formatStructuralCode("vnem_tools_refactor_apply_verify", result), { refactor_apply: result });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_refactor_transaction_rollback",
    {
      title: "Rollback Verified Structural Refactor Transaction",
      description: "Dry-run or restore exact pre-refactor bytes for one completed project-bound transaction after current-hash and backup-path validation, then optionally rerun its reviewed verification scripts.",
      inputSchema: { root: z.string().default("."), transaction_id: z.string().min(1), dry_run: z.boolean().default(true), approved: z.boolean().default(false), approval_note: z.string().default(""), verify: z.boolean().default(true), timeout_ms: z.number().int().min(5000).max(300000).default(120000), session_id: z.string().optional() },
      annotations: ACTION_TOOL
    },
    async (args) => withToolErrors(async () => {
      const patchPermission = args.dry_run !== false ? actionPolicyPreview({ action_type: "apply_patch", proposed_action: `rollback refactor transaction ${args.transaction_id}` }) : enforceActionPolicy("apply_patch", { ...args, proposed_action: `rollback refactor transaction ${args.transaction_id}` });
      const testPermission = !args.verify || args.dry_run !== false ? actionPolicyPreview({ action_type: "run_test", proposed_action: `verify rollback ${args.transaction_id}` }) : enforceActionPolicy("run_test", { ...args, proposed_action: `verify rollback ${args.transaction_id}` });
      const result = { ...(await structuralCodeRuntime.rollback(args)), permission: { patch: patchPermission, verification: testPermission } };
      if (result.executed) recordSession(args.session_id, "structural_refactor_transactions", result);
      return toolResult(formatStructuralCode("vnem_tools_refactor_transaction_rollback", result), { refactor_rollback: result });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_test_system_inspect",
    {
      title: "Inspect Project Test and CI System",
      description: "Detect test frameworks, package scripts, configs, test locations, coverage producers/reports, lint/type/build commands, parsed CI workflows, generated implications, and shared test resources without executing checks.",
      inputSchema: { root: z.string().default("."), session_id: z.string().optional() },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => {
      const root = await resolveAllowedRoot(args.root || ".");
      const result = await testingCiRuntime.inspect({ ...args, root: root.absolutePath });
      recordSession(args.session_id, "test_system_inspections", result);
      return toolResult(formatTestSystemInspect(result), { test_system_inspection: result });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_affected_test_graph",
    {
      title: "Build Affected Test Graph",
      description: "Select tests from changed files using static import/reference edges, package-script sources, tool ownership, benchmark/generated ownership, and known integration boundaries. Never claims filename-substring-only selection.",
      inputSchema: { root: z.string().default("."), changed_files: z.array(z.string()).max(200).default([]), base: z.string().default(""), session_id: z.string().optional() },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => {
      const root = await resolveAllowedRoot(args.root || ".");
      const result = await testingCiRuntime.affectedGraph({ ...args, root: root.absolutePath, base: args.base || undefined });
      recordSession(args.session_id, "affected_test_graphs", result);
      return toolResult(formatAffectedTestGraph(result), { affected_test_graph: result });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_test_run",
    {
      title: "Plan or Run Tiered Project Tests",
      description: "Dry-run by default or execute a package-script-only test tier with stage barriers, resource-aware parallelism, bounded logs, exit/timeout/process evidence, failure grouping, slowest tests, and JSON plus Markdown reports. Retries remain disabled unless explicitly proven infrastructure-only.",
      inputSchema: {
        root: z.string().default("."),
        tier: z.enum(["smoke", "affected", "core", "tools", "precision-compat", "clients", "integration", "benchmarks", "full", "ci"]).default("affected"),
        changed_files: z.array(z.string()).max(200).default([]),
        base: z.string().default(""),
        max_parallel: z.number().int().min(1).max(8).default(3),
        timeout_ms: z.number().int().min(5000).max(120000).default(120000),
        max_output_bytes: z.number().int().min(1024).max(65536).default(12000),
        continue_on_failure: z.boolean().default(false),
        dry_run: z.boolean().default(true),
        approved: z.boolean().default(false),
        approval_note: z.string().default(""),
        session_id: z.string().optional()
      },
      annotations: ACTION_TOOL
    },
    async (args) => withToolErrors(async () => {
      const root = await resolveAllowedRoot(args.root || ".");
      const runArgs = { ...args, root: root.absolutePath, base: args.base || undefined };
      if (args.dry_run !== false) {
        const result = await testingCiRuntime.plan(runArgs);
        return toolResult(formatTestRun({ ...result, executed: false, status: "planned" }), { test_run: { ...result, executed: false, status: "planned" } });
      }
      enforceActionPolicy("run_test", { ...args, proposed_action: `run ${args.tier} project test tier` });
      const result = await testingCiRuntime.run({ ...runArgs, dry_run: false });
      recordSession(args.session_id, "test_runs", result);
      return toolResult(formatTestRun(result), { test_run: result });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_ci_failure_diagnose",
    {
      title: "Diagnose CI Failure Evidence",
      description: "Parse a workflow and bounded run evidence into job, step, command, scheduling versus branch versus infrastructure classification, relevant changed files/tests, likely root cause, smallest fix, rerun eligibility, final status, and runtime deprecations.",
      inputSchema: {
        root: z.string().default("."),
        workflow_path: z.string().default(".github/workflows/ci.yml"),
        job: z.string().default(""),
        step: z.string().default(""),
        command: z.string().default(""),
        status: z.string().default("completed"),
        conclusion: z.string().default("failure"),
        run_id: z.string().default(""),
        log: z.string().max(120000).default(""),
        context: z.string().max(10000).default(""),
        changed_files: z.array(z.string()).max(200).default([]),
        fix_applied: z.boolean().default(false),
        final_status: z.string().default(""),
        session_id: z.string().optional()
      },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => {
      const root = await resolveAllowedRoot(args.root || ".");
      const result = await testingCiRuntime.diagnoseCi({ ...args, root: root.absolutePath });
      recordSession(args.session_id, "ci_diagnoses", result);
      return toolResult(formatCiDiagnosis(result), { ci_failure_diagnosis: result });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_coverage_benchmark_report",
    {
      title: "Report Coverage and Benchmark History",
      description: "Ingest real coverage-summary.json or lcov.info, identify uncovered critical paths, report changed-file line evidence when available, and compare machine-readable benchmark baseline/history/post metrics without inventing coverage.",
      inputSchema: { root: z.string().default("."), changed_files: z.array(z.string()).max(200).default([]), critical_paths: z.array(z.string()).max(100).default([]), baseline_label: z.string().default("baseline"), post_label: z.string().default(""), regression_threshold_percent: z.number().min(0).max(100).default(10), session_id: z.string().optional() },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => {
      const root = await resolveAllowedRoot(args.root || ".");
      const result = await testingCiRuntime.coverageBenchmarks({ ...args, root: root.absolutePath, post_label: args.post_label || undefined });
      recordSession(args.session_id, "coverage_benchmark_reports", result);
      return toolResult(formatCoverageBenchmark(result), { coverage_benchmark_report: result });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_run_project_task",
    {
      title: "Run Safe Project Task",
      description: "Dry-run or run a project-known safe package task from package.json. No install/publish/deploy/arbitrary shell.",
      inputSchema: { task: z.enum(["test", "build", "validate", "lint", "typecheck", "doctor", "custom_script"]), script: z.string().optional(), root: z.string().default("."), dry_run: z.boolean().default(true), approved: z.boolean().default(false), approval_note: z.string().default(""), timeout_ms: z.number().int().min(1000).default(30000), max_output_bytes: z.number().int().min(256).default(16000), session_id: z.string().optional() },
      annotations: ACTION_TOOL
    },
    async (args) => {
      try {
        const task = await safeRunProjectTask(args);
        return toolResult(formatProjectTask(task), { project_task: task });
      } catch (error) {
        recordToolError(args.session_id, "vnem_tools_run_project_task", error);
        if (error instanceof ToolsError) return errorResult(error.message, error.code, error.details);
        return errorResult(error.message || String(error), "tools_unexpected_error");
      }
    }
  );

  mcpServer.registerTool(
    "vnem_tools_start_dev_server",
    {
      title: "Start Safe Local Dev Server",
      description: "Dry-run or start an approved local dev/start/preview package script on localhost for proof. In-memory session registry only.",
      inputSchema: { root: z.string().default("."), script: z.string().default("dev"), port: z.number().int().min(3000).max(9999).default(3000), host: z.string().default("127.0.0.1"), dry_run: z.boolean().default(true), approved: z.boolean().default(false), approval_note: z.string().default(""), wait_ms: z.number().int().min(0).max(5000).default(1000), timeout_ms: z.number().int().min(1000).default(60000), max_output_bytes: z.number().int().min(256).default(8000), session_id: z.string().optional() },
      annotations: ACTION_TOOL
    },
    async (args) => withToolErrors(async () => {
      const devServer = await safeStartDevServer(args);
      return toolResult(formatDevServer(devServer), { dev_server: devServer });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_stop_dev_server",
    {
      title: "Stop Tools-started Dev Server",
      description: "Stop a local dev server previously started by this Tools MCP process. Does not stop arbitrary processes.",
      inputSchema: { server_id: z.string().min(1), approved: z.boolean().default(false), approval_note: z.string().default(""), session_id: z.string().optional() },
      annotations: ACTION_TOOL
    },
    async (args) => withToolErrors(async () => {
      const stopped = await safeStopDevServer(args);
      return toolResult(formatDevServerStop(stopped), { dev_server_stop: stopped });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_list_dev_servers",
    { title: "List Tools-started Dev Servers", description: "List local dev servers started by this Tools MCP process.", inputSchema: {}, annotations: READ_ONLY_LOCAL },
    async () => toolResult(formatDevServerList(), { dev_servers: listDevServers() })
  );

  mcpServer.registerTool(
    "vnem_tools_start_session",
    {
      title: "Start Tools Evidence Session",
      description: "Start a session-level evidence pack for a local project workflow.",
      inputSchema: { task: z.string().min(1), actions_planned: z.array(z.string()).default([]) },
      annotations: ACTION_TOOL
    },
    async (args) => withToolErrors(async () => {
      const session = await startEvidenceSession(args);
      return toolResult(`vnem_tools_start_session: ${session.session_id}`, { session });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_finish_session",
    {
      title: "Finish Tools Evidence Session",
      description: "Write one coherent redacted proof pack for a Tools MCP session.",
      inputSchema: { session_id: z.string().min(1), test_results: z.array(z.string()).default([]), notes: z.string().default("") },
      annotations: ACTION_TOOL
    },
    async (args) => withToolErrors(async () => {
      const pack = await finishEvidenceSession(args);
      return toolResult(formatSessionEvidence(pack), { session_evidence: pack });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_git_status",
    { title: "Local Git Status", description: "Read-only git status for an allowed local repo.", inputSchema: { root: z.string().default("."), max_output_bytes: z.number().int().min(256).default(12000) }, annotations: READ_ONLY_LOCAL },
    async (args) => withToolErrors(async () => { const status = await safeGitStatus(args); return toolResult(formatGitStatus(status), { git_status: status }); })
  );

  mcpServer.registerTool(
    "vnem_tools_git_diff_summary",
    { title: "Local Git Diff Summary", description: "Read-only capped git diff summary for an allowed local repo.", inputSchema: { root: z.string().default("."), max_bytes: z.number().int().min(256).default(16000) }, annotations: READ_ONLY_LOCAL },
    async (args) => withToolErrors(async () => { const diff = await safeGitDiffSummary(args); return toolResult(formatGitDiff(diff), { git_diff: diff }); })
  );

  mcpServer.registerTool(
    "vnem_tools_git_commit",
    {
      title: "Approved Local Git Commit",
      description: "Dry-run or create a local git commit from an explicit safe file list. No push/reset/remote mutation.",
      inputSchema: { root: z.string().default("."), files: z.array(z.string()).min(1), message: z.string().min(1), dry_run: z.boolean().default(true), approved: z.boolean().default(false), approval_note: z.string().default(""), session_id: z.string().optional() },
      annotations: ACTION_TOOL
    },
    async (args) => withToolErrors(async () => { const commit = await safeGitCommit(args); return toolResult(formatGitCommit(commit), { git_commit: commit }); })
  );

  mcpServer.registerTool(
    "vnem_tools_run_command",
    {
      title: "Run Safe Command",
      description: "Dry-run or run one allowlisted command under an allowed root. Real execution requires approval, timeout/output limits, and evidence logging.",
      inputSchema: {
        command: z.string().min(1),
        cwd: z.string().default("."),
        dry_run: z.boolean().default(true),
        approved: z.boolean().default(false),
        approval_note: z.string().default(""),
        timeout_ms: z.number().int().min(1000).default(30000),
        max_output_bytes: z.number().int().min(256).default(16000)
      },
      annotations: ACTION_TOOL
    },
    async (args) => withToolErrors(async () => {
      const commandResult = await safeRunCommand(args);
      return toolResult(formatCommand(commandResult), { command: commandResult });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_api_adapter_catalog",
    {
      title: "List Vetted API Execution Adapters",
      description: "List substantive reviewed API adapter contracts, including official sources, exact hosts/methods/schemas, auth-reference rules, local rate/retry/cache bounds, fixtures, live-test status, redaction, mutation class, compensation, freshness, and compatibility.",
      inputSchema: { provider: z.string().default(""), category: z.string().default(""), include_generated: z.boolean().default(true), session_id: z.string().optional() },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => {
      const result = await apiConnectorRuntime.catalog(args);
      recordSession(args.session_id, "api_connector_inspections", result);
      return toolResult(formatApiConnector("vnem_tools_api_adapter_catalog", result), { api_adapter_catalog: result });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_api_credential_reference_check",
    {
      title: "Check API Credential Reference",
      description: "Validate an environment, client-secret, OS-store, or provider-profile credential reference by name and availability only. Never accepts or emits raw values and does not contact the provider.",
      inputSchema: { adapter_id: z.string().min(1), credential_reference: API_CREDENTIAL_REFERENCE_SCHEMA, session_id: z.string().optional() },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => {
      const planned = await apiConnectorRuntime.credentialPlan(args);
      const permission = enforceActionPolicy("credential_api_read", {
        ...args,
        provider: planned.provider,
        domain: planned.domain,
        dry_run: false,
        proposed_action: `resolve credential-reference presence for adapter ${planned.adapter_id}`
      });
      const result = await apiConnectorRuntime.credentialStatus({ ...args, permission_decision: permission });
      recordSession(args.session_id, "api_connector_inspections", result);
      return toolResult(formatApiConnector("vnem_tools_api_credential_reference_check", { ...result, permission }), { api_credential_reference: { ...result, permission } });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_api_adapter_plan",
    {
      title: "Plan Vetted API Adapter Request",
      description: "Build an exact non-executing request plan from one active adapter. Validates input schema, host/method/auth class, rate/retry/cache/timeout bounds, credential-reference shape, and compensation behavior without resolving credentials or contacting a provider.",
      inputSchema: { adapter_id: z.string().min(1), parameters: z.record(z.any()).default({}), credential_reference: API_CREDENTIAL_REFERENCE_SCHEMA.optional(), timeout_ms: z.number().int().min(1000).max(30000).optional(), max_response_bytes: z.number().int().min(256).max(262144).default(65536), session_id: z.string().optional() },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => {
      const planned = await apiConnectorRuntime.plan(args);
      const permission = actionPolicyPreview({ action_type: planned.permission_action, proposed_action: `${planned.method} through adapter ${planned.adapter_id}`, provider: planned.provider, domain: planned.domain, url: planned.url });
      const result = { ...planned, permission };
      recordSession(args.session_id, "api_connector_inspections", result);
      return toolResult(formatApiConnector("vnem_tools_api_adapter_plan", result), { api_adapter_plan: result });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_api_adapter_execute",
    {
      title: "Execute Vetted API Adapter",
      description: "Dry-run by default or execute one active adapter with exact shared permission scope, credential-reference brokering, approved host/method, bounded rate/retry/timeout/output, safe caching, schema validation, recursive redaction, and persisted evidence.",
      inputSchema: {
        adapter_id: z.string().min(1),
        parameters: z.record(z.any()).default({}),
        credential_reference: API_CREDENTIAL_REFERENCE_SCHEMA.optional(),
        dry_run: z.boolean().default(true),
        approved: z.boolean().default(false),
        approval_note: z.string().default(""),
        timeout_ms: z.number().int().min(1000).max(30000).optional(),
        max_response_bytes: z.number().int().min(256).max(262144).default(65536),
        allow_cache: z.boolean().default(true),
        session_id: z.string().optional()
      },
      annotations: NETWORK_ACTION
    },
    async (args) => withToolErrors(async () => {
      const planned = await apiConnectorRuntime.plan(args);
      const policyArgs = { ...args, provider: planned.provider, domain: planned.domain, url: planned.url, proposed_action: `${planned.method} through adapter ${planned.adapter_id}` };
      if (args.dry_run !== false) {
        const result = { ...planned, dry_run: true, permission: actionPolicyPreview({ ...policyArgs, action_type: planned.permission_action }) };
        return toolResult(formatApiConnector("vnem_tools_api_adapter_execute", result), { api_adapter_execution: result });
      }
      const permission = enforceActionPolicy(planned.permission_action, { ...policyArgs, dry_run: false });
      const result = await apiConnectorRuntime.execute({ ...args, permission_decision: permission });
      recordSession(args.session_id, "api_connector_executions", result);
      return toolResult(formatApiConnector("vnem_tools_api_adapter_execute", result), { api_adapter_execution: result });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_api_adapter_compensate",
    {
      title: "Compensate API Adapter Mutation",
      description: "Dry-run or execute the reviewed best-effort compensating action for one exact in-session API mutation transaction. Requires external-mutation permission and preserves residual audit/notification limits instead of claiming rollback.",
      inputSchema: { transaction_id: z.string().min(1), dry_run: z.boolean().default(true), approved: z.boolean().default(false), approval_note: z.string().default(""), timeout_ms: z.number().int().min(1000).max(30000).optional(), max_response_bytes: z.number().int().min(256).max(262144).default(65536), session_id: z.string().optional() },
      annotations: NETWORK_ACTION
    },
    async (args) => withToolErrors(async () => {
      const planned = await apiConnectorRuntime.compensationPlan(args);
      const policyArgs = { ...args, provider: planned.provider, domain: planned.domain, proposed_action: `compensate API transaction ${args.transaction_id}` };
      if (args.dry_run !== false) {
        const result = { ...planned, dry_run: true, permission: actionPolicyPreview({ ...policyArgs, action_type: "external_api_mutation" }) };
        return toolResult(formatApiConnector("vnem_tools_api_adapter_compensate", result), { api_adapter_compensation: result });
      }
      const permission = enforceActionPolicy("external_api_mutation", { ...policyArgs, dry_run: false });
      const result = await apiConnectorRuntime.compensate({ ...args, permission_decision: permission });
      recordSession(args.session_id, "api_connector_executions", result);
      return toolResult(formatApiConnector("vnem_tools_api_adapter_compensate", result), { api_adapter_compensation: result });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_api_adapter_generate",
    {
      title: "Generate Reviewed API Adapter Proposal",
      description: "Ingest bounded OpenAPI JSON or structured official documentation, select one exact operation, propose a declarative adapter, identify unknowns/blockers, create mock fixtures and contract-test requirements, and keep it inactive pending tests and explicit review.",
      inputSchema: {
        root: z.string().default("."),
        spec_path: z.string().optional(),
        openapi_document: z.record(z.any()).optional(),
        structured_document: z.record(z.any()).optional(),
        operation_id: z.string().optional(),
        adapter_id: z.string().min(1),
        provider: z.string().min(1),
        official_documentation: z.string().url(),
        freshness_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        session_id: z.string().optional()
      },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => {
      const permission = enforceActionPolicy("read_file", { ...args, dry_run: false, target_path: args.spec_path || args.root, proposed_action: "inspect bounded OpenAPI or structured official adapter source" });
      const result = { ...(await apiConnectorRuntime.generateProposal(args)), permission };
      recordSession(args.session_id, "api_connector_proposals", result);
      return toolResult(formatApiConnector("vnem_tools_api_adapter_generate", result), { api_adapter_proposal: result });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_api_adapter_contract_test",
    {
      title: "Test API Adapter Contract",
      description: "Run local declarative request/response fixture and path-mapping contract checks for one active adapter, all active adapters, or a generated proposal. Does not contact providers or activate generated output.",
      inputSchema: { adapter_id: z.string().optional(), proposal_id: z.string().optional(), session_id: z.string().optional() },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => {
      if (args.adapter_id && args.proposal_id) throw new ToolsError("Provide adapter_id or proposal_id, not both.", "api_contract_target_ambiguous");
      const result = await apiConnectorRuntime.contractTest(args);
      recordSession(args.session_id, "api_connector_inspections", result);
      return toolResult(formatApiConnector("vnem_tools_api_adapter_contract_test", result), { api_adapter_contract_test: result });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_api_adapter_review_activate",
    {
      title: "Review and Activate Generated API Adapter",
      description: "Dry-run by default or atomically add a generated no-auth GET/HEAD adapter to the local registry only after its contract test passes, every unknown is acknowledged, exact review text matches, and local-write permission is granted.",
      inputSchema: {
        root: z.string().default("."),
        proposal_id: z.string().min(1),
        reviewed: z.boolean().default(false),
        activation_acknowledgement: z.string().default(""),
        acknowledged_unknowns: z.array(z.string()).max(50).default([]),
        dry_run: z.boolean().default(true),
        approved: z.boolean().default(false),
        approval_note: z.string().default(""),
        session_id: z.string().optional()
      },
      annotations: ACTION_TOOL
    },
    async (args) => withToolErrors(async () => {
      const planned = await apiConnectorRuntime.activationPlan(args);
      if (args.dry_run !== false) {
        const result = { ...planned, dry_run: true, permission: actionPolicyPreview({ action_type: "apply_patch", target_path: planned.registry_path, proposed_action: `activate reviewed adapter ${planned.adapter_id}` }) };
        return toolResult(formatApiConnector("vnem_tools_api_adapter_review_activate", result), { api_adapter_activation: result });
      }
      const permission = enforceActionPolicy("apply_patch", { ...args, dry_run: false, target_path: planned.registry_path, proposed_action: `activate reviewed adapter ${planned.adapter_id}` });
      const result = await apiConnectorRuntime.reviewActivate({ ...args, permission_decision: permission });
      recordSession(args.session_id, "api_connector_proposals", result);
      return toolResult(formatApiConnector("vnem_tools_api_adapter_review_activate", result), { api_adapter_activation: result });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_skill_adapter_catalog",
    {
      title: "List Vetted Skill Adapters",
      description: "List reviewed skill adapter contracts, pinned provenance, runtime categories, permission boundaries, tests, risks, compatibility, and evidence rules. Upstream Markdown remains data and is never executed.",
      inputSchema: { runtime_type: z.string().default(""), task_type: z.string().default(""), session_id: z.string().optional() },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => {
      const result = skillAdapterRuntime.catalog(args);
      recordSession(args.session_id, "skill_adapter_inspections", result);
      return toolResult(formatSkillAdapter("vnem_tools_skill_adapter_catalog", result), { skill_adapter_catalog: result });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_skill_package_inspect",
    {
      title: "Inspect Skill Package Safely",
      description: "Parse a bounded local skill package as inert data, inspect provenance-relevant metadata, scripts, dependencies, requested permissions, and risk indicators, and keep unreviewed packages non-executable.",
      inputSchema: { root: z.string().default("."), skill_path: z.string().default("skills/vnem"), session_id: z.string().optional() },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => {
      const permission = enforceActionPolicy("skill_inspect", { ...args, dry_run: false, target_path: args.root, proposed_action: `inspect inert skill package ${args.skill_path}` });
      const result = { ...(await skillAdapterRuntime.inspectPackage(args)), permission };
      recordSession(args.session_id, "skill_adapter_inspections", result);
      return toolResult(formatSkillAdapter("vnem_tools_skill_package_inspect", result), { skill_package_inspection: result });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_skill_doctor",
    {
      title: "Run Vetted Skill Doctor",
      description: "Check adapter source/version/license/manifest/runtime/permissions/dependencies/tests/risks/freshness/compatibility/evidence and verify the exact local VNEM skill hash without executing skill instructions.",
      inputSchema: { adapter_id: z.string().optional(), session_id: z.string().optional() },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => {
      const permission = enforceActionPolicy("skill_inspect", { ...args, dry_run: false, target_path: allowedRoots[0], proposed_action: "run vetted skill adapter doctor" });
      const result = { ...(await skillAdapterRuntime.doctor(args)), permission };
      recordSession(args.session_id, "skill_adapter_inspections", result);
      return toolResult(formatSkillAdapter("vnem_tools_skill_doctor", result), { skill_doctor: result });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_skill_adapter_plan",
    {
      title: "Plan Vetted Skill Adapter",
      description: "Validate one adapter input and return its exact filesystem, network, command, dependency, permission, risk, and evidence contract without executing the adapter.",
      inputSchema: { adapter_id: z.string().min(1), root: z.string().default("."), input: z.record(z.any()).default({}), session_id: z.string().optional() },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => {
      const planned = await skillAdapterRuntime.plan(args);
      const permissions = Object.fromEntries(planned.permission_actions.map((action) => [action, actionPolicyPreview({ action_type: action, target_path: planned.root, proposed_action: `execute vetted skill adapter ${planned.adapter_id}` })]));
      const result = { ...planned, permissions };
      recordSession(args.session_id, "skill_adapter_inspections", result);
      return toolResult(formatSkillAdapter("vnem_tools_skill_adapter_plan", result), { skill_adapter_plan: result });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_skill_adapter_execute",
    {
      title: "Execute Vetted Skill Adapter",
      description: "Run one VNEM-owned vetted adapter under exact permission scope. Pure/read adapters are safe-readonly; command-backed adapters default to plan-only and require separate skill/process approval plus a current hash-bound review id.",
      inputSchema: { adapter_id: z.string().min(1), root: z.string().default("."), input: z.record(z.any()).default({}), dry_run: z.boolean().optional(), approved: z.boolean().default(false), approval_note: z.string().default(""), session_id: z.string().optional() },
      annotations: ACTION_TOOL
    },
    async (args) => withToolErrors(async () => {
      const planned = await skillAdapterRuntime.plan(args);
      const planOnly = args.dry_run === true || (planned.runtime_type === "command_backed_adapter" && args.dry_run !== false);
      if (planOnly) {
        const permissions = Object.fromEntries(planned.permission_actions.map((action) => [action, actionPolicyPreview({ action_type: action, target_path: planned.root, proposed_action: `execute vetted skill adapter ${planned.adapter_id}` })]));
        const result = { ...planned, dry_run: true, permissions, safe_next_step: planned.runtime_type === "command_backed_adapter" ? "Grant exact skill_execute and run_test scope, then submit dry_run=false with command_review.review_id." : "Submit dry_run=false to execute this vetted bounded adapter." };
        return toolResult(formatSkillAdapter("vnem_tools_skill_adapter_execute", result), { skill_adapter_execution: result });
      }
      const permissionDecisions = Object.fromEntries(planned.permission_actions.map((action) => [action, enforceActionPolicy(action, { ...args, dry_run: false, target_path: planned.root, proposed_action: `execute vetted skill adapter ${planned.adapter_id}` })]));
      const result = await skillAdapterRuntime.execute({ ...args, dry_run: false, permission_decisions: permissionDecisions });
      recordSession(args.session_id, "skill_adapter_executions", result);
      return toolResult(formatSkillAdapter("vnem_tools_skill_adapter_execute", result), { skill_adapter_execution: result });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_skill_source_verify",
    {
      title: "Verify Pinned Skill Source",
      description: "Dry-run or fetch only the adapter's pinned raw GitHub files, enforce exact external-fetch permission, compare Git blob identities under strict bounds, and never return or execute source content.",
      inputSchema: { adapter_id: z.string().min(1), dry_run: z.boolean().default(true), approved: z.boolean().default(false), approval_note: z.string().default(""), session_id: z.string().optional() },
      annotations: NETWORK_ACTION
    },
    async (args) => withToolErrors(async () => {
      const planned = skillAdapterRuntime.sourceVerificationPlan(args);
      const policyArgs = { ...args, provider: "github-skill-source", domain: "raw.githubusercontent.com", url: planned.files[0]?.url, proposed_action: `verify pinned source bytes for skill adapter ${planned.adapter_id}` };
      if (args.dry_run !== false) {
        const result = { ...planned, dry_run: true, permission: actionPolicyPreview({ ...policyArgs, action_type: "external_fetch" }) };
        return toolResult(formatSkillAdapter("vnem_tools_skill_source_verify", result), { skill_source_verification: result });
      }
      const permission = enforceActionPolicy("external_fetch", { ...policyArgs, dry_run: false });
      const result = await skillAdapterRuntime.verifySource({ ...args, permission_decisions: { external_fetch: permission } });
      recordSession(args.session_id, "skill_adapter_source_verifications", result);
      return toolResult(formatSkillAdapter("vnem_tools_skill_source_verify", result), { skill_source_verification: result });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_data_source_inspect",
    {
      title: "Inspect Local Structured Data",
      description: "Parse a bounded allowed-root SQLite, JSON, JSONL, CSV, or YAML source with real format-specific parsers, infer tabular schema, return a capped redacted preview, and preserve exact source hash and parser limits.",
      inputSchema: { root: z.string().default("."), path: z.string().min(1), format: DATA_FORMAT_SCHEMA.optional(), max_rows: z.number().int().min(1).max(500).default(50), max_columns: z.number().int().min(1).max(200).default(80), max_bytes: z.number().int().min(1024).max(16777216).default(16777216), session_id: z.string().optional() },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => {
      const permission = enforceActionPolicy("database_read", { ...args, dry_run: false, target_path: args.path, proposed_action: `inspect bounded local data ${args.path}` });
      const result = { ...(await dataSystemsRuntime.sourceInspect(args)), permission };
      recordSession(args.session_id, "data_system_inspections", result);
      return toolResult(formatDataSystems("vnem_tools_data_source_inspect", result), { data_source_inspection: result });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_data_source_validate",
    {
      title: "Validate Local Structured Data",
      description: "Validate bounded SQLite schema or JSON/JSONL/CSV/YAML rows against an explicit expected schema, reporting capped path/type/nullability issues without returning source values or secrets.",
      inputSchema: { root: z.string().default("."), path: z.string().min(1), format: DATA_FORMAT_SCHEMA.optional(), expected_schema: z.record(z.any()).default({}), max_issues: z.number().int().min(1).max(500).default(100), max_bytes: z.number().int().min(1024).max(16777216).default(16777216), session_id: z.string().optional() },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => {
      const permission = enforceActionPolicy("database_read", { ...args, dry_run: false, target_path: args.path, proposed_action: `validate bounded local data ${args.path}` });
      const result = { ...(await dataSystemsRuntime.sourceValidate(args)), permission };
      recordSession(args.session_id, "data_system_inspections", result);
      return toolResult(formatDataSystems("vnem_tools_data_source_validate", result), { data_source_validation: result });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_data_source_diff",
    {
      title: "Diff Local Structured Data",
      description: "Compare two bounded JSON, JSONL, CSV, or YAML sources by explicit keys or row hashes, including inferred schema changes and capped key samples without dumping changed values.",
      inputSchema: { root: z.string().default("."), left_path: z.string().min(1), right_path: z.string().min(1), left_format: DATA_FORMAT_SCHEMA.optional(), right_format: DATA_FORMAT_SCHEMA.optional(), key_columns: z.array(z.string()).max(8).default([]), max_changes: z.number().int().min(1).max(500).default(100), max_bytes: z.number().int().min(1024).max(16777216).default(16777216), session_id: z.string().optional() },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => {
      const permission = enforceActionPolicy("database_read", { ...args, dry_run: false, target_path: args.root, proposed_action: `diff bounded local data ${args.left_path} and ${args.right_path}` });
      const result = { ...(await dataSystemsRuntime.sourceDiff(args)), permission };
      recordSession(args.session_id, "data_system_inspections", result);
      return toolResult(formatDataSystems("vnem_tools_data_source_diff", result), { data_source_diff: result });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_data_transform_plan",
    {
      title: "Plan Structured Data Transformation",
      description: "Build an in-session source-hash-bound JSON/JSONL/CSV/YAML transformation preview with select/drop/rename/filter/constant/sort/limit operations, redacted samples, exact output hash, and no write.",
      inputSchema: { root: z.string().default("."), path: z.string().min(1), format: DATA_FORMAT_SCHEMA.optional(), output_path: z.string().min(1), output_format: z.enum(["json", "jsonl", "csv", "yaml"]), operations: z.record(z.any()).default({}), max_rows: z.number().int().min(1).max(200).default(25), max_bytes: z.number().int().min(1024).max(16777216).default(16777216), session_id: z.string().optional() },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => {
      const permission = enforceActionPolicy("database_read", { ...args, dry_run: false, target_path: args.path, proposed_action: `preview bounded data mapping from ${args.path} to ${args.output_path}` });
      const result = { ...(await dataSystemsRuntime.transformPlan(args)), permission };
      recordSession(args.session_id, "data_system_plans", result);
      return toolResult(formatDataSystems("vnem_tools_data_transform_plan", result), { data_transform_plan: result });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_data_transform_apply",
    {
      title: "Apply Approved Data Transformation",
      description: "Dry-run by default or apply one fresh in-session structured-data transform with exact source/output hashes, approved database-write scope, retained original backup, verification, transaction evidence, and rollback.",
      inputSchema: { plan_id: z.string().min(1), dry_run: z.boolean().default(true), approved: z.boolean().default(false), approval_note: z.string().default(""), session_id: z.string().optional() },
      annotations: ACTION_TOOL
    },
    async (args) => withToolErrors(async () => {
      const planned = dataSystemsRuntime.transformApplyPlan(args);
      if (args.dry_run !== false) {
        const result = { ...planned, permission: actionPolicyPreview({ action_type: "database_write", target_path: planned.output_path, proposed_action: `apply data transform ${args.plan_id}` }) };
        return toolResult(formatDataSystems("vnem_tools_data_transform_apply", result), { data_transform_application: result });
      }
      const permission = enforceActionPolicy("database_write", { ...args, dry_run: false, target_path: planned.output_path, proposed_action: `apply data transform ${args.plan_id}` });
      const result = await dataSystemsRuntime.transformApply({ ...args, permission_decision: permission });
      recordSession(args.session_id, "data_system_transactions", result);
      return toolResult(formatDataSystems("vnem_tools_data_transform_apply", result), { data_transform_application: result });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_database_connection_plan",
    {
      title: "Plan Database Connection Scope",
      description: "Plan a local SQLite or remote provider connection without connecting. Remote plans require a typed credential reference and exact host/database/access scope, reject raw credentials, and remain unsupported until a reviewed provider adapter exists.",
      inputSchema: { root: z.string().default("."), path: z.string().optional(), connection: DATABASE_CONNECTION_SCHEMA, allow_remote_write: z.boolean().default(false), session_id: z.string().optional() },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => {
      const planned = await dataSystemsRuntime.connectionPlan(args);
      const permission = actionPolicyPreview({ action_type: planned.permission_action, target_path: planned.local_path || args.root, provider: planned.provider, domain: planned.scope?.host, proposed_action: `use ${planned.connection_type} database scope` });
      const result = { ...planned, permission };
      recordSession(args.session_id, "data_system_plans", result);
      return toolResult(formatDataSystems("vnem_tools_database_connection_plan", result), { database_connection_plan: result });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_database_schema_inspect",
    {
      title: "Inspect SQLite Schema",
      description: "Open one bounded allowed-root SQLite file through sql.js, inspect tables/columns/indexes/foreign keys/views/triggers under database-read scope, and return no row values by default.",
      inputSchema: { root: z.string().default("."), path: z.string().min(1), format: z.enum(["sqlite", "sqlite3", "db"]).optional(), max_tables: z.number().int().min(1).max(200).default(80), max_columns: z.number().int().min(1).max(200).default(120), include_row_counts: z.boolean().default(false), session_id: z.string().optional() },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => {
      const permission = enforceActionPolicy("database_read", { ...args, dry_run: false, target_path: args.path, proposed_action: `inspect SQLite schema ${args.path}` });
      const result = { ...(await dataSystemsRuntime.schemaInspect(args)), permission };
      recordSession(args.session_id, "data_system_inspections", result);
      return toolResult(formatDataSystems("vnem_tools_database_schema_inspect", result), { database_schema_inspection: result });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_database_query_plan",
    {
      title: "Plan Read-Only SQLite Query",
      description: "Validate one SELECT/WITH statement, reject mutation/transaction/PRAGMA/attachment/extension paths, bind scalar parameters without exposing values, enable query-only mode, and return SQLite EXPLAIN QUERY PLAN evidence.",
      inputSchema: { root: z.string().default("."), path: z.string().min(1), sql: z.string().min(1).max(32768), parameters: z.union([z.array(z.any()), z.record(z.any())]).optional(), max_rows: z.number().int().min(1).max(500).default(100), max_columns: z.number().int().min(1).max(200).default(80), max_bytes: z.number().int().min(1024).max(262144).default(65536), session_id: z.string().optional() },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => {
      const permission = enforceActionPolicy("database_read", { ...args, dry_run: false, target_path: args.path, proposed_action: `plan read-only SQLite query for ${args.path}` });
      const result = { ...(await dataSystemsRuntime.queryPlan(args)), permission };
      recordSession(args.session_id, "data_system_plans", result);
      return toolResult(formatDataSystems("vnem_tools_database_query_plan", result), { database_query_plan: result });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_database_query",
    {
      title: "Run Bounded Read-Only SQLite Query",
      description: "Execute one SELECT/WITH statement against a bounded local SQLite file with lexical mutation blocking, SQLite query-only enforcement, scalar parameter binding, row/column/byte limits, recursive secret redaction, and persisted evidence.",
      inputSchema: { root: z.string().default("."), path: z.string().min(1), sql: z.string().min(1).max(32768), parameters: z.union([z.array(z.any()), z.record(z.any())]).optional(), max_rows: z.number().int().min(1).max(500).default(100), max_columns: z.number().int().min(1).max(200).default(80), max_bytes: z.number().int().min(1024).max(262144).default(65536), session_id: z.string().optional() },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => {
      const permission = enforceActionPolicy("database_read", { ...args, dry_run: false, target_path: args.path, proposed_action: `execute read-only SQLite query for ${args.path}` });
      const result = { ...(await dataSystemsRuntime.queryExecute(args)), permission };
      recordSession(args.session_id, "data_system_queries", result);
      return toolResult(formatDataSystems("vnem_tools_database_query", result), { database_query: result });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_database_migration_preview",
    {
      title: "Preview SQLite Migration Transaction",
      description: "Run a bounded reviewed SQLite DDL/DML subset only inside an in-memory transaction, return exact per-statement affected rows and schema diff, detect WAL/journal sidecars, and create a hash-bound apply preview without changing the file.",
      inputSchema: { root: z.string().default("."), path: z.string().min(1), statements: z.array(z.string().min(1).max(32768)).min(1).max(20), session_id: z.string().optional() },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => {
      const permission = enforceActionPolicy("database_read", { ...args, dry_run: false, target_path: args.path, proposed_action: `preview SQLite migration for ${args.path}` });
      const result = { ...(await dataSystemsRuntime.migrationPreview(args)), permission };
      recordSession(args.session_id, "data_system_plans", result);
      return toolResult(formatDataSystems("vnem_tools_database_migration_preview", result), { database_migration_preview: result });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_database_migration_apply",
    {
      title: "Apply Approved SQLite Migration",
      description: "Dry-run by default or apply one fresh hash-bound migration preview with database-write approval, no active WAL/journal sidecars, in-memory SQLite transaction, exact affected-row/schema verification, retained backup, and automatic restore on failed verification.",
      inputSchema: { preview_id: z.string().min(1), acknowledge_destructive: z.boolean().default(false), dry_run: z.boolean().default(true), approved: z.boolean().default(false), approval_note: z.string().default(""), session_id: z.string().optional() },
      annotations: ACTION_TOOL
    },
    async (args) => withToolErrors(async () => {
      const planned = dataSystemsRuntime.migrationApplyPlan(args);
      if (args.dry_run !== false) {
        const result = { ...planned, permission: actionPolicyPreview({ action_type: "database_write", target_path: planned.database_path, proposed_action: `apply SQLite migration ${args.preview_id}` }) };
        return toolResult(formatDataSystems("vnem_tools_database_migration_apply", result), { database_migration_application: result });
      }
      const permission = enforceActionPolicy("database_write", { ...args, dry_run: false, target_path: planned.database_path, proposed_action: `apply SQLite migration ${args.preview_id}` });
      const result = await dataSystemsRuntime.migrationApply({ ...args, permission_decision: permission });
      recordSession(args.session_id, "data_system_transactions", result);
      return toolResult(formatDataSystems("vnem_tools_database_migration_apply", result), { database_migration_application: result });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_data_transaction_rollback",
    {
      title: "Rollback Data Transaction",
      description: "Dry-run or restore the exact retained pre-transform/pre-migration bytes after current-hash verification. Refuses stale, missing, cross-session, or already rolled-back transactions.",
      inputSchema: { transaction_id: z.string().min(1), dry_run: z.boolean().default(true), approved: z.boolean().default(false), approval_note: z.string().default(""), session_id: z.string().optional() },
      annotations: ACTION_TOOL
    },
    async (args) => withToolErrors(async () => {
      const planned = dataSystemsRuntime.rollbackPlan(args);
      if (args.dry_run !== false) {
        const result = { ...planned, permission: actionPolicyPreview({ action_type: "database_write", target_path: planned.target_path, proposed_action: `rollback data transaction ${args.transaction_id}` }) };
        return toolResult(formatDataSystems("vnem_tools_data_transaction_rollback", result), { data_transaction_rollback: result });
      }
      const permission = enforceActionPolicy("database_write", { ...args, dry_run: false, target_path: planned.target_path, proposed_action: `rollback data transaction ${args.transaction_id}` });
      const result = await dataSystemsRuntime.rollbackTransaction({ ...args, permission_decision: permission });
      recordSession(args.session_id, "data_system_transactions", result);
      return toolResult(formatDataSystems("vnem_tools_data_transaction_rollback", result), { data_transaction_rollback: result });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_api_request",
    {
      title: "Prepare or Run Safe API Request",
      description: "Dry-run or run an approved limited GET/HEAD API request using usable API pack context. Blocks raw secrets and untrusted URLs by default.",
      inputSchema: {
        api_pack_id: z.string().min(1),
        url: z.string().url(),
        method: z.enum(["GET", "HEAD"]).default("GET"),
        headers: z.record(z.any()).default({}),
        body: z.any().optional(),
        dry_run: z.boolean().default(true),
        approved: z.boolean().default(false),
        approval_note: z.string().default(""),
        timeout_ms: z.number().int().min(1000).default(10000),
        max_response_bytes: z.number().int().min(256).default(16000)
      },
      annotations: NETWORK_ACTION
    },
    async (args) => withToolErrors(async () => {
      const apiResult = await safeApiRequest(args);
      return toolResult(formatApiRequest(apiResult), { api_request: apiResult });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_browser_capture",
    {
      title: "Capture Local Browser Screenshot Evidence",
      description: "Dry-run or capture an approved local browser screenshot for visual proof. Localhost/file-under-allowed-roots only; no login, cookies, CAPTCHA, credential capture, scraping, or external browsing by default.",
      inputSchema: {
        url: z.string().optional(),
        file_path: z.string().optional(),
        workspace_root: z.string().default("."),
        session_id: z.string().optional(),
        dry_run: z.boolean().default(true),
        approved: z.boolean().default(false),
        approval_note: z.string().default(""),
        viewport_width: z.number().int().min(320).max(MAX_VIEWPORT_WIDTH).default(1280),
        viewport_height: z.number().int().min(240).max(MAX_VIEWPORT_HEIGHT).default(720),
        wait_ms: z.number().int().min(0).max(MAX_BROWSER_WAIT_MS).default(500),
        selector: z.string().optional(),
        full_page: z.boolean().default(true),
        max_screenshot_bytes: z.number().int().min(1024).max(MAX_BROWSER_SCREENSHOT_BYTES).default(2 * 1024 * 1024)
      },
      annotations: NETWORK_ACTION
    },
    async (args) => withToolErrors(async () => {
      const capture = await safeBrowserCapture(args);
      return toolResult(formatBrowserCapture(capture), { browser_capture: capture });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_browser_page_inspect",
    {
      title: "Inspect Browser Page Source Safely",
      description: "Turn a direct/local/provided page into structured page understanding without interactive browser automation. URL fetches are dry-run first and approved.",
      inputSchema: { url: z.string().optional(), file_path: z.string().optional(), html: z.string().optional(), text: z.string().optional(), dry_run: z.boolean().default(true), approved: z.boolean().default(false), approval_note: z.string().default(""), max_bytes: z.number().int().min(256).max(MAX_FETCH_TEXT_BYTES).default(16000), session_id: z.string().optional() },
      annotations: NETWORK_ACTION
    },
    async (args) => withToolErrors(async () => { const result = await safeBrowserPageInspect(args); return toolResult(formatBrowserPageInspect(result), { browser_page_inspect: result }); })
  );

  mcpServer.registerTool(
    "vnem_tools_browser_readability_extract",
    {
      title: "Extract Readable Page Content",
      description: "Heuristically extract useful article/docs/main content from allowed/provided page content. Does not claim perfect extraction.",
      inputSchema: { url: z.string().optional(), file_path: z.string().optional(), html: z.string().optional(), text: z.string().optional(), dry_run: z.boolean().default(true), approved: z.boolean().default(false), approval_note: z.string().default(""), max_bytes: z.number().int().min(256).max(MAX_FETCH_TEXT_BYTES).default(16000), session_id: z.string().optional() },
      annotations: NETWORK_ACTION
    },
    async (args) => withToolErrors(async () => { const result = await safeBrowserReadabilityExtract(args); return toolResult(formatBrowserReadability(result), { browser_readability_extract: result }); })
  );

  mcpServer.registerTool(
    "vnem_tools_browser_link_map",
    {
      title: "Map Page Links Without Crawling",
      description: "Analyze links found in one provided/direct/local page without following links or crawling.",
      inputSchema: { url: z.string().optional(), file_path: z.string().optional(), html: z.string().optional(), text: z.string().optional(), base_url: z.string().optional(), dry_run: z.boolean().default(true), approved: z.boolean().default(false), approval_note: z.string().default(""), max_bytes: z.number().int().min(256).max(MAX_FETCH_TEXT_BYTES).default(16000), max_links: z.number().int().min(1).max(200).default(80), session_id: z.string().optional() },
      annotations: NETWORK_ACTION
    },
    async (args) => withToolErrors(async () => { const result = await safeBrowserLinkMap(args); return toolResult(formatBrowserLinkMap(result), { browser_link_map: result }); })
  );

  mcpServer.registerTool(
    "vnem_tools_browser_dom_search",
    {
      title: "Search Page DOM-like Content",
      description: "Static search over page text/headings/links/images/forms/buttons/selector-like snippets without JavaScript execution.",
      inputSchema: { url: z.string().optional(), file_path: z.string().optional(), html: z.string().optional(), text: z.string().optional(), query: z.string().min(1), mode: z.enum(["text", "heading", "link", "image", "form", "button", "selector_like"]).default("text"), dry_run: z.boolean().default(true), approved: z.boolean().default(false), approval_note: z.string().default(""), max_bytes: z.number().int().min(256).max(MAX_FETCH_TEXT_BYTES).default(16000), max_results: z.number().int().min(1).max(100).default(50), session_id: z.string().optional() },
      annotations: NETWORK_ACTION
    },
    async (args) => withToolErrors(async () => { const result = await safeBrowserDomSearch(args); return toolResult(formatBrowserDomSearch(result), { browser_dom_search: result }); })
  );

  mcpServer.registerTool(
    "vnem_tools_browser_accessibility_audit",
    {
      title: "Static Browser Accessibility Audit",
      description: "Static heuristic accessibility/UI audit for allowed/provided HTML. Not a full accessibility certification.",
      inputSchema: { url: z.string().optional(), file_path: z.string().optional(), html: z.string().optional(), text: z.string().optional(), dry_run: z.boolean().default(true), approved: z.boolean().default(false), approval_note: z.string().default(""), max_bytes: z.number().int().min(256).max(MAX_FETCH_TEXT_BYTES).default(16000), session_id: z.string().optional() },
      annotations: NETWORK_ACTION
    },
    async (args) => withToolErrors(async () => { const result = await safeBrowserAccessibilityAudit(args); return toolResult(formatBrowserAccessibilityAudit(result), { browser_accessibility_audit: result }); })
  );

  mcpServer.registerTool(
    "vnem_tools_browser_compare_snapshots",
    {
      title: "Compare Page Snapshots",
      description: "Compare two local/provided/direct page snapshots or HTML files without screenshots or visual overclaims.",
      inputSchema: { before: z.record(z.any()), after: z.record(z.any()), max_bytes: z.number().int().min(256).max(MAX_FETCH_TEXT_BYTES).default(16000), session_id: z.string().optional() },
      annotations: NETWORK_ACTION
    },
    async (args) => withToolErrors(async () => { const result = await safeBrowserCompareSnapshots(args); return toolResult(formatBrowserCompare(result), { browser_compare_snapshots: result }); })
  );

  mcpServer.registerTool(
    "vnem_tools_browser_research_pack",
    {
      title: "Build Browser Research Pack",
      description: "Build one evidence-bounded research/page-understanding pack from multiple provided/direct/local source summaries. Does not pretend search happened.",
      inputSchema: { task: z.string().min(1), sources: z.array(z.record(z.any())).default([]), claims_to_check: z.array(z.string()).default([]), max_sources: z.number().int().min(1).max(20).default(8), session_id: z.string().optional() },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => { const result = await safeBrowserResearchPack(args); return toolResult(formatBrowserResearchPack(result), { browser_research_pack: result }); })
  );

  mcpServer.registerTool(
    "vnem_tools_search_provider_manifest",
    {
      title: "VNEM Search Provider Manifest",
      description: "Read-only manifest of configured/unconfigured search providers without exposing API key values.",
      inputSchema: {},
      annotations: READ_ONLY_LOCAL
    },
    async () => withToolErrors(async () => { const result = safeSearchProviderManifest(); return toolResult(formatSearchProviderManifest(result), { search_provider_manifest: result }); })
  );

  mcpServer.registerTool(
    "vnem_tools_search_query_builder",
    {
      title: "VNEM Search Query Builder",
      description: "Build strong search queries for current facts, docs, code, gaming/modding, security, product/API research, and source discovery.",
      inputSchema: {
        task: z.string().min(1),
        domain_hint: z.string().default(""),
        freshness_required: z.boolean().default(false),
        source_types_needed: z.array(z.string()).default([]),
        known_context: z.string().default("")
      },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => { const result = await safeSearchQueryBuilder(args); return toolResult(formatSearchQueryBuilder(result), { search_query_builder: result }); })
  );

  mcpServer.registerTool(
    "vnem_tools_web_search",
    {
      title: "VNEM Provider Web Search",
      description: "Dry-run-first provider-backed search. Executes only configured providers or deterministic local_fixture; no search-engine scraping or CAPTCHA bypass.",
      inputSchema: {
        provider: z.string().default("local_fixture"),
        query: z.string().min(1),
        dry_run: z.boolean().default(true),
        approved: z.boolean().default(false),
        approval_note: z.string().default(""),
        max_results: z.number().int().min(1).max(20).default(10),
        safe_search: z.boolean().default(true),
        session_id: z.string().optional()
      },
      annotations: NETWORK_ACTION
    },
    async (args) => withToolErrors(async () => { const result = await safeWebSearch(args); return toolResult(formatWebSearch(result), { web_search: result }); })
  );

  mcpServer.registerTool(
    "vnem_tools_search_result_ranker",
    {
      title: "VNEM Search Result Ranker",
      description: "Rank search results by credibility, relevance, freshness, duplicates, and risk.",
      inputSchema: { task: z.string().min(1), results: z.array(z.record(z.any())).default([]), freshness_required: z.boolean().default(false), preferred_source_types: z.array(z.string()).default([]), session_id: z.string().optional() },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => { const result = await safeSearchResultRanker(args); return toolResult(formatSearchResultRanker(result), { search_result_ranker: result }); })
  );

  mcpServer.registerTool(
    "vnem_tools_redirect_chain_check",
    {
      title: "VNEM Redirect Chain Check",
      description: "Dry-run-first safe redirect chain check using HEAD/manual redirects where possible; no cookies, login, or blind following.",
      inputSchema: { url: z.string().min(1), dry_run: z.boolean().default(true), approved: z.boolean().default(false), approval_note: z.string().default(""), max_redirects: z.number().int().min(1).max(10).default(5), session_id: z.string().optional() },
      annotations: NETWORK_ACTION
    },
    async (args) => withToolErrors(async () => { const result = await safeRedirectChainCheck(args); return toolResult(formatRedirectChain(result), { redirect_chain_check: result }); })
  );

  mcpServer.registerTool(
    "vnem_tools_url_reputation_check",
    {
      title: "VNEM URL Reputation Check",
      description: "Heuristic URL/domain risk assessment. Not antivirus and not a browsing verdict.",
      inputSchema: { url: z.string().min(1), redirect_chain: z.array(z.record(z.any())).default([]), known_official_domains: z.array(z.string()).default([]), session_id: z.string().optional() },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => { const result = await safeUrlReputationCheck(args); return toolResult(formatUrlReputation(result), { url_reputation_check: result }); })
  );

  mcpServer.registerTool(
    "vnem_tools_captcha_detector",
    {
      title: "VNEM CAPTCHA / Access Block Detector",
      description: "Detect CAPTCHA/anti-bot/access-block pages from provided URL, HTML, text, screenshot metadata, or page inspection. No bypass.",
      inputSchema: { url: z.string().optional(), html: z.string().optional(), text: z.string().optional(), screenshot_metadata: z.record(z.any()).optional(), page_inspection: z.record(z.any()).optional(), session_id: z.string().optional() },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => { const result = await safeCaptchaDetector(args); return toolResult(formatCaptchaDetector(result), { captcha_detector: result }); })
  );

  mcpServer.registerTool(
    "vnem_tools_download_safety_check",
    {
      title: "VNEM Download Safety Check",
      description: "Assess a download link before following/downloading. No actual download; optional approved HEAD metadata only.",
      inputSchema: { download_url: z.string().min(1), source_page_url: z.string().optional(), source_quality_score: z.number().optional(), dry_run: z.boolean().default(true), approved: z.boolean().default(false), approval_note: z.string().default(""), session_id: z.string().optional() },
      annotations: NETWORK_ACTION
    },
    async (args) => withToolErrors(async () => { const result = await safeDownloadSafetyCheck(args); return toolResult(formatDownloadSafety(result), { download_safety_check: result }); })
  );

  mcpServer.registerTool(
    "vnem_tools_claim_source_matrix",
    {
      title: "VNEM Claim Source Matrix",
      description: "Build claim-by-source support/conflict matrix to prevent fake confidence.",
      inputSchema: { claims: z.array(z.string()).default([]), sources: z.array(z.record(z.any())).default([]), task: z.string().default(""), session_id: z.string().optional() },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => { const result = await safeClaimSourceMatrix(args); return toolResult(formatClaimSourceMatrix(result), { claim_source_matrix: result }); })
  );

  mcpServer.registerTool(
    "vnem_tools_research_gap_detector",
    {
      title: "VNEM Research Gap Detector",
      description: "Identify missing source types, current search, primary/counter sources, dates/versions, and confidence blockers.",
      inputSchema: { task: z.string().min(1), sources: z.array(z.record(z.any())).default([]), claims: z.array(z.string()).default([]), freshness_required: z.boolean().default(false), domain: z.string().default(""), session_id: z.string().optional() },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => { const result = await safeResearchGapDetector(args); return toolResult(formatResearchGapDetector(result), { research_gap_detector: result }); })
  );

  mcpServer.registerTool(
    "vnem_tools_source_map",
    {
      title: "VNEM Source Map",
      description: "Safely map a local repo/docs folder or explicit source target before bounded extraction. Allowed roots only for local sources; no broad crawling or hidden external fetches.",
      inputSchema: { source: z.string().min(1), source_type: z.string().default("local_repo"), max_files: z.number().int().min(1).max(500).default(150), session_id: z.string().optional() },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => { const result = await safeSourceMap(args); return toolResult(formatSourceMap(result), { source_map: result }); })
  );

  mcpServer.registerTool(
    "vnem_tools_source_extract",
    {
      title: "VNEM Source Extract",
      description: "Extract bounded evidence from explicit local source targets only. Blocks secret paths, caps/redacts output, and returns structured evidence for Core audit.",
      inputSchema: { extraction_goal: z.string().min(1), source_root: z.string().default("."), targets: z.array(z.string()).default([]), max_targets: z.number().int().min(1).max(30).default(12), max_bytes_per_target: z.number().int().min(128).max(16000).default(4000), session_id: z.string().optional() },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => { const result = await safeSourceExtract(args); return toolResult(formatSourceExtract(result), { source_extract: result }); })
  );

  mcpServer.registerTool(
    "vnem_tools_source_graph",
    {
      title: "VNEM Source Graph",
      description: "Build source graph, claim verification, contradiction, freshness, and confidence notes from provided/bounded source evidence. Does not search or crawl.",
      inputSchema: { task: z.string().default(""), sources: z.array(z.record(z.any())).default([]), claims: z.array(z.string()).default([]), session_id: z.string().optional() },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => { const result = await safeSourceGraph(args); return toolResult(formatSourceGraph(result), { source_graph: result }); })
  );


  mcpServer.registerTool(
    "vnem_tools_architecture_review",
    {
      title: "VNEM Architecture Review",
      description: "Safely inspect an allowed local project for entry points, registries/routes, package scripts, tests, configs, integration points, parallel fake systems, dead code, duplicate logic, contract risks, and secret risks. No network or commands.",
      inputSchema: { workspace_root: z.string().default("."), max_files: z.number().int().min(20).max(500).default(220), max_bytes_per_file: z.number().int().min(256).max(12000).default(5000), session_id: z.string().optional() },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => { const result = await safeArchitectureReview(args); return toolResult(formatArchitectureReview(result), { architecture_review: result }); })
  );

  mcpServer.registerTool(
    "vnem_tools_debug_evidence",
    {
      title: "VNEM Debug Evidence",
      description: "Collect bounded log-first debugging evidence from explicit logs, package scripts, config summaries, git status, and changed files under allowed roots. Does not run arbitrary commands or tests.",
      inputSchema: { workspace_root: z.string().default("."), problem_description: z.string().default(""), failing_command: z.string().optional(), log_paths: z.array(z.string()).default([]), changed_files: z.array(z.string()).default([]), include_git_status: z.boolean().default(true), include_package_scripts: z.boolean().default(true), include_recent_test_output: z.boolean().default(false), include_config_summary: z.boolean().default(true), max_log_bytes: z.number().int().min(256).max(16000).default(5000), session_id: z.string().optional() },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => { const result = await safeDebugEvidence(args); return toolResult(formatDebugEvidence(result), { debug_evidence: result }); })
  );

  mcpServer.registerTool(
    "vnem_tools_ui_surface_review",
    {
      title: "VNEM UI Surface Review",
      description: "Safely inspect allowed local project UI files for frameworks, routes, components, entry points, render paths, styles, tests, preview/storybook, unrendered components, missing state coverage, and a11y risks. No browser, network, installs, or mutation.",
      inputSchema: { workspace_root: z.string().default("."), max_files: z.number().int().min(20).max(500).default(220), max_bytes_per_file: z.number().int().min(256).max(12000).default(5000), session_id: z.string().optional() },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => { const result = await safeUiSurfaceReview(args); return toolResult(formatUiSurfaceReview(result), { ui_surface_review: result }); })
  );

  mcpServer.registerTool(
    "vnem_tools_browser_evidence_plan",
    {
      title: "VNEM Browser Evidence Plan",
      description: "Plan bounded browser/visual proof for a local route/user flow without running a browser. Lists screenshot, DOM, console, network, accessibility, viewport, state, and before/after evidence to gather with existing tools.",
      inputSchema: { app_url: z.string().default(""), routes: z.array(z.string()).default([]), user_flow: z.array(z.string()).default([]), claim_type: z.string().default("visual_improvement"), viewports: z.array(z.any()).default([]), states_to_check: z.array(z.string()).default([]), session_id: z.string().optional() },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => { const result = await safeBrowserEvidencePlan(args); return toolResult(formatBrowserEvidencePlan(result), { browser_evidence_plan: result }); })
  );

  mcpServer.registerTool(
    "vnem_tools_browser_evidence_run",
    {
      title: "VNEM Browser Evidence Run",
      description: "Execute a bounded approved localhost browser evidence run from a browser evidence plan. Coordinates existing capture/page-inspect/a11y tools, stores a structured proof pack, and returns blocked/partial results honestly when execution cannot prove the UI.",
      inputSchema: { browser_evidence_plan: z.record(z.any()).optional(), app_url: z.string().default(""), routes: z.array(z.string()).default([]), user_flow: z.array(z.string()).default([]), claim_type: z.string().default("visual_improvement"), viewports: z.array(z.any()).default([]), states_to_check: z.array(z.string()).default([]), before_label: z.string().default(""), after_label: z.string().default(""), dry_run: z.boolean().default(true), approved: z.boolean().default(false), approval_note: z.string().default(""), wait_ms: z.number().int().min(0).max(MAX_BROWSER_WAIT_MS).default(500), session_id: z.string().optional() },
      annotations: NETWORK_ACTION
    },
    async (args) => withToolErrors(async () => { const result = await safeBrowserEvidenceRun(args); return toolResult(formatBrowserEvidenceRun(result), { browser_evidence_run: result }); })
  );

  mcpServer.registerTool(
    "vnem_tools_browser_interaction_run",
    {
      title: "VNEM Browser Interaction Run",
      description: "Plan or run bounded approved Chromium interaction scenarios against localhost or exact approved external origins. Executes structured navigate/click/type/select/wait/assert actions, captures screenshots plus DOM/accessibility/console/network evidence, compares before/after pixels and snapshots, detects CAPTCHA/private flows, and cleans up its owned browser profile and process.",
      inputSchema: {
        root: z.string().default("."),
        app_url: z.string().default(""),
        scenarios: z.array(z.record(z.any())).max(20).default([]),
        actions: z.array(z.record(z.any())).max(40).default([]),
        viewport: z.any().optional(),
        state: z.string().default("unspecified"),
        allow_external: z.boolean().default(false),
        approved_origins: z.array(z.string()).max(20).default([]),
        browser_command: z.string().optional(),
        dry_run: z.boolean().default(true),
        approved: z.boolean().default(false),
        approval_note: z.string().default(""),
        session_id: z.string().optional()
      },
      annotations: NETWORK_ACTION
    },
    async (args) => withToolErrors(async () => {
      const result = args.dry_run === false
        ? (enforceActionPolicy("browser_capture", args), await browserInteractionRuntime.run(args))
        : await browserInteractionRuntime.plan(args);
      recordSession(args.session_id, "browser_captures", { status: result.status || result.operation_result, run_id: result.run_id || null, evidence_path: result.evidence_path || null, browser_was_run: result.browser_was_run === true });
      return toolResult(formatBrowserInteraction(result), { browser_interaction: result });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_browser_evidence_compare",
    {
      title: "VNEM Browser Evidence Compare",
      description: "Read and compare two allowed browser interaction evidence packs by matching scenario, viewport, and stage, then report PNG pixel, bounded DOM, and accessibility snapshot changes without deciding aesthetic correctness.",
      inputSchema: { root: z.string().default("."), before_pack_path: z.string().min(1), after_pack_path: z.string().min(1) },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => {
      const result = await browserInteractionRuntime.compare(args);
      return toolResult(formatBrowserEvidenceCompare(result), { browser_evidence_compare: result });
    })
  );

  mcpServer.registerTool(
    "vnem_tools_ui_evidence_audit",
    {
      title: "VNEM UI Evidence Audit",
      description: "Audit provided UI evidence objects. Rejects code-only visual claims, missing screenshots, unknown console/network, single-viewport responsive claims, missing a11y/state/render/before-after evidence. Does not invent browser results.",
      inputSchema: { claim: z.string().default(""), screenshots: z.array(z.any()).default([]), dom_assertions: z.array(z.any()).default([]), console_summary: z.any().optional(), network_summary: z.any().optional(), accessibility_summary: z.any().optional(), viewport_results: z.array(z.any()).default([]), state_results: z.array(z.any()).default([]), before_after: z.any().optional(), route_render_evidence: z.array(z.any()).default([]), browser_evidence_run: z.any().optional(), session_id: z.string().optional() },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => { const result = await safeUiEvidenceAudit(args); return toolResult(formatUiEvidenceAudit(result), { ui_evidence_audit: result }); })
  );

  mcpServer.registerTool(
    "vnem_tools_fetch_url_text",
    {
      title: "Fetch Direct URL Text Safely",
      description: "Dry-run or approved GET/HEAD text extraction from a direct URL. Blocks search-engine scraping, credentialed/raw-secret URLs, unsafe schemes, login/cookies, and caps/redacts output.",
      inputSchema: { url: z.string().min(1), method: z.enum(["GET", "HEAD"]).default("GET"), headers: z.record(z.any()).default({}), dry_run: z.boolean().default(true), approved: z.boolean().default(false), approval_note: z.string().default(""), timeout_ms: z.number().int().min(1000).max(MAX_API_TIMEOUT_MS).default(10000), max_response_bytes: z.number().int().min(256).max(MAX_FETCH_TEXT_BYTES).default(16000), session_id: z.string().optional() },
      annotations: NETWORK_ACTION
    },
    async (args) => withToolErrors(async () => { const fetched = await safeFetchUrlText(args); return toolResult(formatFetchUrlText(fetched), { fetch_url_text: fetched }); })
  );

  mcpServer.registerTool(
    "vnem_tools_source_quality_check",
    {
      title: "Check Source Quality",
      description: "Evaluate quality, risk, recency, primary-source likelihood, citation recommendation, and must-not-claim limits from provided/fetched source metadata.",
      inputSchema: { url: z.string().optional(), title: z.string().default(""), text_excerpt: z.string().default(""), source_type: z.string().default("unknown"), published_at: z.string().optional(), retrieved_at: z.string().optional(), session_id: z.string().optional() },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => { const quality = await safeSourceQualityCheck(args); return toolResult(formatSourceQuality(quality), { source_quality: quality }); })
  );

  mcpServer.registerTool(
    "vnem_tools_research_brief",
    {
      title: "Build Research Brief From Sources",
      description: "Create a compact, evidence-bounded research brief from provided source summaries and claims; does not pretend web search happened.",
      inputSchema: { task: z.string().min(1), sources: z.array(z.record(z.any())).default([]), claims_to_check: z.array(z.string()).default([]), session_id: z.string().optional() },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => { const brief = await safeResearchBrief(args); return toolResult(formatResearchBrief(brief), { research_brief: brief }); })
  );

  mcpServer.registerTool(
    "vnem_tools_collect_evidence",
    {
      title: "Collect Tools Evidence",
      description: "Write and return a structured evidence summary from Tools MCP runs for honest final reports and Core proof-trail alignment.",
      inputSchema: {
        task: z.string().min(1),
        tool_run_ids: z.array(z.string()).default([]),
        changed_files: z.array(z.string()).default([]),
        commands_run: z.array(z.string()).default([]),
        api_requests: z.array(z.string()).default([]),
        test_results: z.array(z.string()).default([]),
        screenshots: z.array(z.string()).default([]),
        visual_checks: z.array(z.string()).default([]),
        browser_captures: z.array(z.any()).default([]),
        notes: z.string().default("")
      },
      annotations: ACTION_TOOL
    },
    async (args) => withToolErrors(async () => {
      const evidence = await collectEvidence(args);
      return toolResult(formatEvidence(evidence), { evidence });
    })
  );


  registerGithubTools(mcpServer);

  registerCloudflareTools(mcpServer);

  mcpServer.registerTool(
    "vnem_tools_restore_backup",
    {
      title: "Restore Tools Backup",
      description: "Dry-run or restore a previous Tools MCP backup to an allowed target path. Real restore requires explicit approval and evidence logging.",
      inputSchema: {
        backup_path: z.string().min(1),
        target_path: z.string().min(1),
        dry_run: z.boolean().default(true),
        approved: z.boolean().default(false),
        approval_note: z.string().default("")
      },
      annotations: ACTION_TOOL
    },
    async (args) => withToolErrors(async () => {
      const restore = await safeRestoreBackup(args);
      return toolResult(formatRestore(restore), { restore });
    })
  );
}

const PERMISSION_PROFILE_NAMES = buildSharedPermissionProfiles().map((profile) => profile.profile_name);
const HARD_BLOCKED_ACTION_TYPES = SHARED_HARD_BLOCKED_ACTIONS;
const ACTION_ALIASES = SHARED_ACTION_ALIASES;

function buildPermissionProfiles() {
  return permissionRuntime.profiles();
}

function permissionProfilesObject() {
  const profiles = buildPermissionProfiles();
  return { default_profile: "safe-readonly", selected_profile: activePermissionProfile.profile_name, profiles, dangerous_disabled_policy: profiles.find((p) => p.profile_name === "dangerous-disabled") };
}

function getActivePermissionProfile() {
  return permissionRuntime.activeProfile();
}

function assertPrecisionMutationPermission(args = {}, context = {}) {
  if (!context.executes) return;
  const decision = permissionRuntime.evaluate({ action: context.action, target_path: args.target_path });
  if (!decision.allowed) {
    throw new PrecisionExecutionError(decision.reason, "precision_permission_profile_blocked", {
      permission_profile: decision.profile,
      action: context.action,
      permission_decision: decision,
      safe_next_action: decision.safe_next_action
    });
  }
  if (context.force && !["creator-power", "expert"].includes(decision.profile)) {
    throw new PrecisionExecutionError("Forced patch rollback requires the creator-power profile.", "precision_force_rollback_blocked", {
      permission_profile: decision.profile,
      safe_next_action: "Retry without force so rollback preconditions remain enforced."
    });
  }
  if (decision.approval_required && (args.approved !== true || !String(args.approval_note || "").trim())) {
    throw new PrecisionExecutionError("Real precision execution requires approved=true and a non-empty approval_note.", "precision_explicit_approval_required", {
      permission_profile: decision.profile,
      action: context.action,
      safe_next_action: "Review the exact bounded action, then retry with explicit approval and a concise approval note."
    });
  }
}

function assertPrecisionNetworkPermission(args = {}, context = {}) {
  const decision = permissionRuntime.evaluate({ action: context.action, url: args.url });
  if (!decision.allowed) {
    throw new PrecisionExecutionError(decision.reason, "precision_network_permission_blocked", {
      permission_profile: decision.profile,
      action: context.action,
      permission_decision: decision,
      safe_next_action: decision.safe_next_action
    });
  }
  if (decision.approval_required && (args.approved !== true || !String(args.approval_note || "").trim())) {
    throw new PrecisionExecutionError("External documentation fetch requires approved=true and a non-empty approval_note.", "precision_network_approval_required", {
      permission_profile: decision.profile,
      action: context.action
    });
  }
}

function normalizeActionType(actionType, text = "") {
  const raw = String(actionType || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  let type = ACTION_ALIASES[raw] || raw;
  const hay = `${type} ${text}`.toLowerCase();
  if (!type || type === "unknown") {
    if (/patch|write|edit|create file|delete file/.test(hay)) type = "apply_patch";
    else if (/commit/.test(hay)) type = "local_commit";
    else if (/install|audit fix|package/.test(hay)) type = "package_install";
    else if (/github|pull request|\bpr\b|issue|release/.test(hay)) type = /release/.test(hay) ? "github_release" : /issue/.test(hay) ? "github_issue" : "github_pr";
    else if (/captcha/.test(hay)) type = "captcha_bypass";
    else if (/cookie|session/.test(hay)) type = "cookie_session_access";
    else if (/secret|credential|\.env|id_rsa|pem|private key/.test(hay)) type = "secret_read";
    else if (/rm -rf|reset --hard|format|destructive/.test(hay)) type = "destructive_shell";
    else if (/crawl|scrap(e|ing) all|whole web|whole pc/.test(hay)) type = "unrestricted_crawl";
    else if (/build/.test(hay)) type = "run_build";
    else if (/test|check|validate|lint/.test(hay)) type = "run_test";
    else if (/browser|screenshot|capture/.test(hay)) type = "browser_capture";
    else if (/cloudflare/.test(hay)) type = /delete|rollback|destructive/.test(hay) ? "cloudflare_destructive" : /deploy|dns|env|secret|purge|mutation|cache/.test(hay) ? "cloudflare_mutation" : "cloudflare_read";
    else if (/fetch|url|api|network|search/.test(hay)) type = /api/.test(hay) ? "api_call" : "external_fetch";
    else type = "inspect_workspace";
  }
  return ACTION_ALIASES[type] || type;
}

function trustBoundaryClassify(description) {
  const text = String(description || "");
  const t = text.toLowerCase();
  let level = "2_local_project_information";
  let why = "Local project information/action under configured allowed roots.";
  if (/captcha|cookie|session|credential theft|malware|destructive|rm -rf|reset --hard|format|unrestricted crawl|whole pc|password manager|browser profile/.test(t)) { level = "6_blocked_dangerous_action"; why = "The description matches hard-blocked dangerous behavior."; }
  else if (/creator|developer risky|experimental|broad repo automation|system path/.test(t)) { level = "5_creator_developer_risky_action"; why = "Creator/developer risky action requires elevated profile and explicit approval."; }
  else if (/github|account|issue|pull request|\bpr\b|release|publish|deploy|external account/.test(t)) { level = "4_external_account_action"; why = "External account or remote mutation action."; }
  else if (/\.env|secret|token|credential|password|id_rsa|id_ed25519|\.pem|\.key|cookies|sessions|browser profile|private key/.test(t)) { level = "3_sensitive_local_information"; why = "Sensitive local information or secret-like path/value."; }
  else if (/user provided|pasted|input from user|log snippet|uploaded/.test(t)) { level = "1_user_provided_information"; why = "Information supplied by the user for this task."; }
  else if (/public|official docs|https?:\/\/|web page|source url|docs/.test(t) && !/local project|repo|package\.json/.test(t)) { level = "0_public_information"; why = "Public/source information without local or account mutation."; }
  const blocked = level === "6_blocked_dangerous_action" || (level === "3_sensitive_local_information" && /secret|token|credential|password|id_rsa|cookie|session|browser profile|password manager/.test(t));
  const requires = blocked || ["3_sensitive_local_information", "4_external_account_action", "5_creator_developer_risky_action"].includes(level);
  return {
    level,
    classification: level.replace(/^\d_/, ""),
    why,
    allowed_by_default: ["0_public_information", "1_user_provided_information", "2_local_project_information"].includes(level) && !blocked,
    requires_approval: requires,
    blocked_by_default: blocked,
    redaction_required: blocked || level === "3_sensitive_local_information",
    evidence_required: requires || level === "2_local_project_information",
    safe_next_action: blocked ? "Do not access this data/action; use redacted user-provided excerpts, public docs, or a safer bounded preview instead." : requires ? "Run a dry-run/policy preview and ask for explicit approval before any real action." : "Proceed with bounded read-only inspection and evidence notes.",
    must_not_claim: ["Accessed secrets/cookies/sessions or bypassed CAPTCHA.", "Performed account mutation or risky action without explicit approval.", "A blocked/dangerous action is safe or supported."]
  };
}

function actionPolicyPreview(args = {}) {
  const actionType = normalizeActionType(args.action_type, `${args.proposed_action || ""} ${args.target_path || ""} ${args.source_description || ""}`);
  const profile = activePermissionProfile;
  const trust = trustBoundaryClassify(`${actionType} ${args.proposed_action || ""} ${args.target_path || ""} ${args.source_description || ""}`);
  const hardBlocked = HARD_BLOCKED_ACTION_TYPES.has(actionType) || trust.level === "6_blocked_dangerous_action";
  const trustBoundaryLevel = hardBlocked ? "6_blocked_dangerous_action" : trust.level;
  const plannedBlocked = false;
  const runtimeDecision = permissionRuntime.evaluate({
    action: actionType,
    target_path: args.target_path || args.path || args.root,
    repository: args.repository || args.repo,
    branch: args.branch,
    provider: args.provider,
    domain: args.domain,
    url: args.url
  });
  const allowed = !hardBlocked && !plannedBlocked && runtimeDecision.allowed;
  const requiresApproval = allowed && runtimeDecision.approval_required;
  const reason = hardBlocked
    ? `Action ${actionType} is hard-blocked as dangerous.`
    : plannedBlocked
      ? `Action ${actionType} is preview/planned/blocked until the vetted dependency runtime is implemented.`
      : runtimeDecision.reason;
  return {
    action_type: actionType,
    trust_boundary_level: trustBoundaryLevel,
    permission_profile: profile.profile_name,
    allowed,
    requires_approval: requiresApproval,
    blocked: !allowed,
    reason,
    required_user_approval_text: requiresApproval ? buildPermissionPrompt({ action_type: actionType, target_paths: [args.target_path].filter(Boolean), reason }).text : "",
    risk_notes: [...profile.risk_notes, trust.why].filter(Boolean),
    rollback_expected: ["apply_patch", "restore_backup", "local_commit", "package_install"].includes(actionType) && allowed,
    evidence_expected: allowed || requiresApproval,
    decision_source: runtimeDecision.decision_source,
    scoped_grant: runtimeDecision.grant,
    safer_alternative: allowed ? "Run dry-run first, then execute only the exact approved scoped action." : trust.safe_next_action,
    must_not_claim: [
      "Tools MCP performed this action before evidence exists.",
      plannedBlocked ? `${actionType} is implemented or executed in this build.` : null,
      hardBlocked ? `${actionType} is allowed or safe.` : null,
      requiresApproval ? `${actionType} was approved without explicit user approval text.` : null
    ].filter(Boolean)
  };
}

function enforceActionPolicy(actionType, args = {}) {
  const normalized = normalizeActionType(actionType);
  const dryRun = args.dry_run !== false;
  const preview = actionPolicyPreview({ ...args, action_type: normalized, proposed_action: args.proposed_action || normalized });
  if (!dryRun && !preview.allowed) throw new ToolsError(preview.reason, "permission_profile_blocked", { action_policy_preview: preview });
  if (!dryRun && preview.requires_approval) enforceApproval(args);
  return preview;
}

function permissionStatusObject() {
  const manifest = safeSearchProviderManifest();
  const sharedStatus = permissionRuntime.status();
  const workspace = path.resolve(process.env.VNEM_WORKSPACE_ROOT || process.cwd() || repoRoot);
  const workspaceAllowed = isInsideAny(workspace, allowedRoots);
  return {
    active_profile: activePermissionProfile,
    configured_by: sharedStatus.configured_by,
    allowed_roots: allowedRoots,
    current_working_directory: process.cwd(),
    workspace_root: workspace,
    workspace_allowed: workspaceAllowed,
    workspace_fix_suggestion: workspaceAllowed ? "Current workspace is inside an allowed root." : `Add the workspace to VNEM_TOOLS_ALLOWED_ROOTS or start Tools MCP from an allowed root. Current allowed roots: ${allowedRoots.join(path.delimiter)}`,
    evidence_root: evidenceRoot,
    evidence_root_inside_allowed_roots: isInsideAny(evidenceRoot, allowedRoots),
    how_to_add_more_roots: `Set VNEM_TOOLS_ALLOWED_ROOTS to one or more project roots separated by ${JSON.stringify(path.delimiter)}; keep roots narrow, not drive/home roots.`,
    broad_root_warnings: allowedRoots.flatMap(rootBroadnessWarnings),
    localhost_policy: { enabled: process.env.VNEM_TOOLS_ALLOW_LOCALHOST === "1", host_policy: "localhost/127.0.0.1 only for approved local proof" },
    high_power_summary: { principle: "High power, honest confidence, strict boundaries.", reliability_catalog_tool: "vnem_tools_reliability_catalog", action_recovery_tool: "vnem_tools_action_recovery_plan", high_power_review_tool: "vnem_tools_high_power_action_review" },
    github_autonomy_summary: buildGithubAutonomySummary(),
    cloudflare_summary: buildCloudflareStatusPolicy(),
    scoped_grants: { session: sharedStatus.session_grants, persistent: sharedStatus.persistent_grants, request_tool: "vnem_tools_permission_request", grant_tool: "vnem_tools_permission_grant", revoke_tool: "vnem_tools_permission_revoke" },
    mutation_allowed_summary: { profile: activePermissionProfile.profile_name, safe_readonly_can_mutate: false, non_destructive_mutation_allowed_with_approval: permissionRuntime.evaluate({ action: "apply_patch" }).allowed, github_maintainer_feature_branch_work_allowed_by_github_profile: githubProfilePolicy(githubSettings().profile).allowed_actions.includes("push_feature_branch"), high_impact_operations_remain_approval_gated: true, package_installs_require_approved_installs_or_scoped_grant: true, package_publish_and_arbitrary_shell_still_blocked: true },
    destructive_allowed_summary: { allowed: false, hard_blocked_actions: sharedStatus.hard_blocked_actions, exact_destructive_approval_required: true, destructive_phrase: CLOUDFLARE_DESTRUCTIVE_APPROVAL_PHRASE, protected_resource_acknowledgment_required: true },
    approval_phrase_summary: { generic_tools: "approved=true plus a specific approval_note", cloudflare_mutation: CLOUDFLARE_MUTATION_APPROVAL_PHRASE, cloudflare_destructive: CLOUDFLARE_DESTRUCTIVE_APPROVAL_PHRASE },
    known_blocked_actions: unsupportedActions(),
    recommended_profile_for_goal: { inspect: "safe-readonly", local_dry_run_or_plan: "safe-local-dev", approved_local_writes: "approved-writes", destructive_or_creator_work: "creator-power with exact approval", cloudflare_disabled: "dangerous-disabled" },
    configured_search_providers_by_presence_only: manifest.providers.map((p) => ({ name: p.name, configured: p.configured, env_var_name: p.env_var_name, configured_by: p.configured_by, api_key_value_exposed: false })),
    blocked_categories: ["secret files", "raw secret values", "cookies", "sessions", "browser profiles", "password manager data", "CAPTCHA bypass", "destructive shell", "unrestricted filesystem crawling", "silent package install", "blind account mutation"],
    remaining_unsupported_actions: unsupportedActions()
  };
}

function rootBroadnessWarnings(root) {
  const parsed = path.parse(path.resolve(root));
  const normalized = normalizePath(path.resolve(root)).toLowerCase();
  const warnings = [];
  if (path.resolve(root) === parsed.root) warnings.push(`Allowed root ${root} is too broad (drive/filesystem root). Use a project-specific directory.`);
  const home = process.env.HOME || process.env.USERPROFILE;
  if (home && path.resolve(root).toLowerCase() === path.resolve(home).toLowerCase()) warnings.push(`Allowed root ${root} is a whole user home directory; prefer a project-specific root.`);
  if (/^([a-z]:\/)?$/i.test(normalized)) warnings.push(`Allowed root ${root} looks like a drive root and is too broad.`);
  return [...new Set(warnings)];
}

function formatPermissionProfiles(profiles) { return [`vnem_tools_permission_profiles: ${profiles.profiles.length} profile(s)`, `default=${profiles.default_profile}`, `active=${profiles.selected_profile}`, `profiles=${profiles.profiles.map((p) => p.profile_name).join(", ")}`].join("\n"); }
function formatPermissionStatus(status) { return [`vnem_tools_permission_status: ${status.active_profile.profile_name}`, `allowed_roots=${status.allowed_roots.join(", ")}`, `workspace_allowed=${status.workspace_allowed}`, `mutations=${status.mutation_allowed_summary.non_destructive_mutation_allowed_with_approval ? "approval_gated" : "blocked_or_plan_only"}`, `cloudflare=${status.cloudflare_summary.capability_status}`, `evidence_root=${status.evidence_root}`, status.broad_root_warnings.length ? `warnings=${status.broad_root_warnings.join("; ")}` : "warnings=none"].join("\n"); }
function formatActionPolicyPreview(preview) { return [`vnem_tools_action_policy_preview: ${preview.action_type}`, `profile=${preview.permission_profile}`, `trust=${preview.trust_boundary_level}`, `allowed=${preview.allowed}`, `requires_approval=${preview.requires_approval}`, `blocked=${preview.blocked}`, `reason=${preview.reason}`].join("\n"); }
function formatTrustBoundary(trust) { return [`vnem_tools_trust_boundary_classify: ${trust.level}`, `requires_approval=${trust.requires_approval}`, `blocked_by_default=${trust.blocked_by_default}`, `safe_next_action=${trust.safe_next_action}`].join("\n"); }

async function computeAllowedRoots() {
  const raw = process.env.VNEM_TOOLS_ALLOWED_ROOTS;
  const roots = raw
    ? raw.split(path.delimiter).map((item) => item.trim()).filter(Boolean)
    : [process.env.VNEM_WORKSPACE_ROOT || process.cwd() || repoRoot];
  const resolved = [];
  for (const root of roots) {
    const abs = path.resolve(root);
    if (existsSync(abs)) resolved.push(await realpath(abs));
  }
  if (!resolved.length) resolved.push(await realpath(repoRoot));
  return [...new Set(resolved)];
}

async function computeEvidenceRoot() {
  const candidate = path.resolve(process.env.VNEM_TOOLS_EVIDENCE_ROOT || path.join(allowedRoots[0], ".vnem", "tool-runs"));
  if (!isInsideAny(candidate, allowedRoots)) {
    throw new ToolsError("Evidence root must be inside an allowed root.", "evidence_root_outside_allowed_roots", { evidence_root: candidate });
  }
  await mkdir(candidate, { recursive: true });
  return candidate;
}

async function loadUsablePacks() {
  const file = path.join(repoRoot, "capabilities", "usable-capability-packs.json");
  try {
    const data = JSON.parse(await readFile(file, "utf8"));
    return data;
  } catch {
    return { apis: [], skills: [] };
  }
}

function formatHighPowerActionReview(review) { return [`vnem_tools_high_power_action_review: allowed=${review.action_allowed}`, `profile=${review.permission_profile}`, `approval_required=${review.approval_required}`, `destructive=${review.destructive_approval_required}`, `blocks=${review.reasons_to_block.join("; ") || "none"}`].join("\n"); }
function formatCapabilityGapReport(report) { return [`vnem_tools_capability_gap_report: ${report.missing_or_limited_capabilities.length} gap(s)`, `top=${report.missing_or_limited_capabilities.slice(0, 3).map((g) => g.capability).join(", ")}`].join("\n"); }


function statusObject() {
  return {
    server_name: "vnem-tools",
    version: SERVER_VERSION,
    read_only: false,
    action_tools_enabled: true,
    dry_run_default: true,
    approval_required_for_mutation: true,
    permission_profile: activePermissionProfile.profile_name,
    permission_profile_description: activePermissionProfile.description,
    lazy_runtime_status: {
      structural_code: structuralRuntimeLoadStatus(),
      data_systems: dataSystemsRuntimeLoadStatus()
    },
    permission_profiles_available: PERMISSION_PROFILE_NAMES,
    permission_status_tool: "vnem_tools_permission_status",
    action_policy_preview_tool: "vnem_tools_action_policy_preview",
    trust_boundary_classifier_tool: "vnem_tools_trust_boundary_classify",
    allowed_roots: allowedRoots,
    current_working_directory: process.cwd(),
    workspace_allowed: permissionStatusObject().workspace_allowed,
    allowed_root_warnings: permissionStatusObject().broad_root_warnings,
    how_to_add_more_roots: permissionStatusObject().how_to_add_more_roots,
    blocked_paths: [".env*", "*secret*", "*token*", "*credential*", "*key*", ".git", "node_modules", "dist", "build"],
    command_allowlist: ["node --check <file>", "npm test", "npm run <safe-script>", "git status", "git diff", "git log", "git ls-files"],
    tool_catalog_policy: { tool: "vnem_tools_manifest", capability_groups: TOOL_CAPABILITY_GROUPS, safety_metadata_required: true, core_handoff_compatible: true },
    adoption_reliability_policy: { tools: ["vnem_tools_entrypoint", "vnem_tools_capability_router", "vnem_tools_adoption_readiness", "vnem_tools_visibility_doctor", "vnem_tools_underuse_detector", "vnem_tools_install_profile_emit", "vnem_tools_install_doctor"], core_handoff_compatible: true, exact_registered_tool_names_only: true, compact_default: true, no_fake_vnem_control: true, underuse_detection_supported: true, source_control_guard_recommended: true, install_profile_emit_supported: true, install_doctor_supported: true },
    filesystem_intelligence_policy: { tools: ["vnem_tools_workspace_map", "vnem_tools_read_many_files", "vnem_tools_code_search", "vnem_tools_find_references", "vnem_tools_dependency_scan"], allowed_roots_only: true, secret_paths_blocked: true, generated_build_cache_skipped: true, evidence_logged: true },
    repo_power_policy: { tools: ["vnem_tools_repo_deep_map", "vnem_tools_next_action_ranker", "vnem_tools_no_placebo_progress_audit", "vnem_tools_change_impact_plan", "vnem_tools_test_selection_plan", "vnem_tools_failure_triage", "vnem_tools_evidence_pack", "vnem_tools_local_session_recovery", "vnem_tools_repo_workflow_orchestrator", "vnem_tools_code_symbol_map", "vnem_tools_mcp_surface_audit", "vnem_tools_patch_target_finder", "vnem_tools_tool_test_coverage_map", "vnem_tools_source_impact_trace", "vnem_tools_source_control_character_guard"], allowed_roots_only: true, secret_paths_blocked: true, compact_structured_output: true, no_live_github_required: true, no_placebo_detection: true, test_selection_avoids_overvalidation: true, local_session_recovery_supported: true, workflow_orchestrator_supported: true, code_intelligence_supported: true, source_control_character_guard_supported: true },
    research_sources_policy: { tools: ["vnem_tools_fetch_url_text", "vnem_tools_source_quality_check", "vnem_tools_research_brief", "vnem_tools_browser_research_pack", "vnem_tools_claim_source_matrix", "vnem_tools_research_gap_detector", "vnem_tools_source_map", "vnem_tools_source_extract", "vnem_tools_source_graph"], no_search_engine_scraping: true, external_fetch_dry_run_default: true, approval_required_for_real_external_fetch: true, no_login_cookie_session_use: true },
    current_documentation_policy: { tools: ["vnem_tools_documentation_source_catalog", "vnem_tools_official_documentation_fetch", "vnem_tools_documentation_context", "vnem_tools_documentation_cache_status"], official_domains_from_registry_only: true, unknown_domains_require_explicit_community_opt_in: true, conditional_cache_revalidation: true, stale_cache_reported: true, bounded_relevant_sections_only: true, contradictions_reported: true, http_success_alone_proves_authority_or_currentness: false },
    data_systems_policy: { tools: ["vnem_tools_data_source_inspect", "vnem_tools_data_source_validate", "vnem_tools_data_source_diff", "vnem_tools_data_transform_plan", "vnem_tools_data_transform_apply", "vnem_tools_database_connection_plan", "vnem_tools_database_schema_inspect", "vnem_tools_database_query_plan", "vnem_tools_database_query", "vnem_tools_database_migration_preview", "vnem_tools_database_migration_apply", "vnem_tools_data_transaction_rollback"], structured_formats: ["SQLite", "JSON", "JSONL", "CSV", "YAML"], sqlite_engine: "sql.js 1.14.1 WebAssembly", read_only_default: true, max_sqlite_bytes: 33554432, max_structured_bytes: 16777216, max_result_rows: 500, max_result_bytes: 262144, secret_redaction: true, raw_remote_credentials_accepted_or_emitted: false, remote_execution_supported: false, approved_database_write_required_for_mutation: true, fresh_preview_required: true, transaction_backup_verification_rollback: true, active_sqlite_sidecars_block_mutation: true, cross_file_filesystem_atomicity_claimed: false },
    source_ingestion_policy: { tools: ["vnem_tools_source_map", "vnem_tools_source_extract", "vnem_tools_source_graph"], allowed_roots_only_for_local_sources: true, explicit_targets_only_for_extraction: true, secret_paths_blocked: true, broad_crawl_blocked: true, evidence_logged: true, source_graph_uses_provided_or_bounded_sources_only: true },
    debugging_code_quality_policy: { tools: ["vnem_tools_architecture_review", "vnem_tools_debug_evidence"], allowed_roots_only: true, secret_paths_blocked: true, no_arbitrary_commands: true, log_first_debugging: true, detects_parallel_fake_systems: true, flags_possible_dead_code: true, evidence_logged: true },
    search_provider_policy: { tools: ["vnem_tools_search_provider_manifest", "vnem_tools_search_query_builder", "vnem_tools_web_search", "vnem_tools_search_result_ranker"], local_fixture_available_for_tests: true, provider_keys_detected_by_presence_only: true, provider_unavailable_returns_structured_status: true, no_search_engine_result_page_scraping: true, no_fake_search_results: true },
    browser_risk_policy: { tools: ["vnem_tools_redirect_chain_check", "vnem_tools_url_reputation_check", "vnem_tools_captcha_detector", "vnem_tools_download_safety_check"], no_captcha_bypass: true, user_assisted_captcha_handoff: true, suspicious_redirect_download_phishing_detection: true, no_auto_download_or_installer_execution: true },
    patch_batch_policy: { tool: "vnem_tools_apply_patch_batch", dry_run_default: true, approval_required: true, operations: ["replace", "create", "delete", "append"], no_partial_apply_by_default: true, backups_per_changed_file: true },
    project_scan_policy: { tool: "vnem_tools_project_scan", allowed_roots_only: true, skips_secrets: true, reads_package_json_only_for_scripts_and_frameworks: true },
    app_engineering_policy: { tools: ["vnem_tools_app_inspect", "vnem_tools_app_vertical_slice_plan", "vnem_tools_app_vertical_slice_apply", "vnem_tools_app_acceptance_run", "vnem_tools_app_transaction_rollback"], adapters: { "vite-react-node": "verified_generation_and_execution", "static-node": "verified_generation_and_execution", "next-style": "inspection_and_plan_only", generic: "inspection_only" }, marker_required_for_automatic_mutation: true, dry_run_default: true, approval_required_for_apply_acceptance_rollback: true, hash_preconditions: true, automatic_failure_rollback: true, cross_file_filesystem_atomicity_claimed: false, browser_scope: "dedicated-profile localhost Chromium only; no login/cookies/CAPTCHA", proof: ["focused tests", "build", "localhost server", "desktop user path", "mobile render", "console", "network", "screenshots"] },
    dependency_security_policy: { tools: ["vnem_tools_dependency_inventory", "vnem_tools_dependency_risk_audit", "vnem_tools_dependency_advisory_audit", "vnem_tools_dependency_change_analyze", "vnem_tools_dependency_upgrade_plan", "vnem_tools_dependency_install_apply", "vnem_tools_dependency_transaction_rollback"], inspection_ecosystems: ["npm", "pnpm", "yarn", "python", "cargo", "go"], npm_lockfile_versions: [1, 2, 3], mutation_adapter: "npm only", dry_run_default: true, approved_installs_or_scoped_grant_required: true, existing_npm_lock_required_for_mutation: true, exact_registry_versions_only: true, lifecycle_scripts_disabled: true, recursive_verification_script_review: true, ephemeral_user_and_global_npm_configs: true, allowlisted_non_secret_environment_only: true, project_npmrc_blocks_live_commands: true, publishing_and_global_installs_blocked: true, timeout_process_tree_termination: true, automatic_failure_rollback: true, explicit_rollback_hash_preconditions: true, downloaded_binary_execution_requires_separate_review_and_approval: true },
    structural_code_policy: { tools: ["vnem_tools_structural_index_build", "vnem_tools_structural_graph_query", "vnem_tools_exact_symbol_references", "vnem_tools_refactor_rename_preview", "vnem_tools_refactor_move_preview", "vnem_tools_refactor_extract_plan", "vnem_tools_dead_code_candidates", "vnem_tools_refactor_impact_analyze", "vnem_tools_structural_patch_validate", "vnem_tools_refactor_apply_verify", "vnem_tools_refactor_transaction_rollback"], ast_languages: ["javascript", "typescript", "jsx", "tsx"], ast_engine: "@babel/parser plus @babel/traverse 7.29.7", heuristic_languages: ["python", "go", "rust", "java", "csharp", "kotlin", "c", "cpp", "lua", "luau", "ruby", "php"], persisted_incremental_index: true, generated_and_secret_paths_skipped: true, graph_bounds_reported: true, automatic_apply_scope: "high-confidence lexical-binding rename only", move_and_extract_apply_supported: false, public_export_acknowledgement_required: true, stale_hash_preconditions: true, regular_file_and_link_checks: true, reviewed_project_verification_required: true, verification_worktree_delta_blocked: true, post_reference_proof: true, automatic_failure_rollback: true, explicit_rollback_hash_preconditions: true, cross_file_filesystem_atomicity_claimed: false },
    api_connector_policy: { tools: ["vnem_tools_api_adapter_catalog", "vnem_tools_api_credential_reference_check", "vnem_tools_api_adapter_plan", "vnem_tools_api_adapter_execute", "vnem_tools_api_adapter_compensate", "vnem_tools_api_adapter_generate", "vnem_tools_api_adapter_contract_test", "vnem_tools_api_adapter_review_activate"], initial_adapters: 7, substantive_categories: ["no-auth public data", "backend/authenticated service", "developer tooling", "app/product content data", "structured public data", "user-relevant game data", "external mutation"], safe_default: "vetted no-auth GET/HEAD only", credential_reference_types: ["environment", "client_secret_reference", "os_credential_store", "provider_profile"], raw_credentials_accepted_or_emitted: false, credential_reads_require_profile_or_exact_scoped_grant: true, external_mutation_requires_profile_or_exact_scoped_grant: true, repeated_approval_inside_exact_grant: false, bounded_rate_retry_timeout_output: true, recursive_redaction_and_evidence: true, mock_integrations: true, approved_live_no_auth_tests: ["open_meteo_forecast", "world_bank_indicator"], generated_adapters_require_contract_test_and_review: true, generated_activation_scope: "no-auth GET/HEAD only", compensation_is_not_rollback: true },
    skill_adapter_policy: { tools: ["vnem_tools_skill_adapter_catalog", "vnem_tools_skill_package_inspect", "vnem_tools_skill_doctor", "vnem_tools_skill_adapter_plan", "vnem_tools_skill_adapter_execute", "vnem_tools_skill_source_verify"], initial_adapters: 9, runtime_categories: ["declarative_guidance", "local_pure_transformation", "repo_analyzer", "test_verification_adapter", "browser_adapter", "api_backed_adapter", "command_backed_adapter", "unsupported_untrusted_skill"], safe_default: "vetted VNEM-owned pure/read handlers under vetted_skill_execute", arbitrary_markdown_execution: false, untrusted_package_execution: false, automatic_dependency_installation: false, stronger_scopes: { command: ["skill_execute", "run_test"], network: ["external_fetch"], dependency_install: ["package_install"], credentials: ["credential_api_read"], mutation: ["external_api_mutation"], outside_root_write: ["apply_patch"] }, pinned_source_identity_verification: true, raw_credentials_accepted_or_emitted: false, persisted_redacted_evidence: true },
    project_task_policy: { tool: "vnem_tools_run_project_task", dry_run_default: true, approval_required: true, package_json_scripts_only: true, package_install_publish_deploy_blocked: true },
    dev_server_policy: { tools: ["vnem_tools_start_dev_server", "vnem_tools_stop_dev_server", "vnem_tools_list_dev_servers"], dry_run_default: true, approval_required: true, local_host_only: true, port_range: "3000-9999", registry: "in-memory per MCP process" },
    session_evidence_policy: { tools: ["vnem_tools_start_session", "vnem_tools_finish_session"], writes_single_json_proof_pack: true, secrets_redacted: true },
    local_git_policy: { tools: ["vnem_tools_git_status", "vnem_tools_git_diff_summary", "vnem_tools_git_commit"], status_and_diff_read_only: true, commit_requires_approval_and_explicit_files: true, git_push_blocked: true, destructive_git_blocked: true },
    github_autonomy_policy: { tools: ["vnem_tools_github_status", "vnem_tools_github_settings_guide", "vnem_tools_github_profile_status", "vnem_tools_github_repo_inspect", "vnem_tools_github_diff_review", "vnem_tools_github_review_threads", "vnem_tools_github_remote_proof", "vnem_tools_github_actions_run_inspect", "vnem_tools_github_release_verify", "vnem_tools_github_public_surface_audit", "vnem_tools_repo_intelligence_report", "vnem_tools_github_branch_create", "vnem_tools_github_commit_push", "vnem_tools_github_pr_create", "vnem_tools_github_pr_update", "vnem_tools_github_issue_create", "vnem_tools_github_issue_update", "vnem_tools_github_issue_comment", "vnem_tools_github_labels_manage", "vnem_tools_github_actions_status", "vnem_tools_github_actions_rerun", "vnem_tools_github_ci_failure_triage", "vnem_tools_pr_quality_gate", "vnem_tools_task_progress_truth_check", "vnem_tools_github_release_plan", "vnem_tools_github_release_create"], execution_model: "command-backed gh/git with dry-run, mocked-runner coverage, bounded live-read proof, and exact-SHA verification", default_profile: "maintainer", feature_branch_push_supported: true, protected_direct_push_blocked_by_default: true, force_push_blocked_by_default: true, repo_delete_blocked_by_default: true, settings_mutation_blocked_by_default: true },
    network_policy: {
      dry_run_default: true,
      methods: ["GET", "HEAD"],
      live_requests_require_approval: "credential-bearing, broad, or mutating requests; reviewed no-auth adapters are safe-readonly",
      localhost_allowed_when_env_enabled: process.env.VNEM_TOOLS_ALLOW_LOCALHOST === "1",
      unknown_untrusted_urls_blocked: true,
      github_uses_scoped_command_backed_tools: true,
      package_install_scope: "only exact reviewed npm transactions through vnem_tools_dependency_install_apply; all other network tools remain non-installing"
    },
    browser_policy: {
      tool: "vnem_tools_browser_capture",
      local_url_only: true,
      local_file_under_allowed_roots_only: true,
      external_url_default_block: true,
      approval_required: true,
      dry_run_default: true,
      screenshot_evidence_location: path.join(evidenceRoot, "screenshots"),
      browser_runtime_status: "checked_on_capture",
      no_persistent_browser_profile: true,
      unsupported_browser_actions: ["login automation", "cookie extraction", "session persistence", "external browsing by default", "CAPTCHA bypass", "web scraping", "credential capture"]
    },
    cloudflare_control_policy: buildCloudflareStatusPolicy(),
    secret_policy: {
      secret_like_paths_blocked: true,
      raw_authorization_or_api_key_headers_blocked: true,
      secret_ref_only_for_future_auth: true,
      output_redaction_enabled: true
    },
    restore_support: {
      executable_restore_tool: "vnem_tools_restore_backup",
      dry_run_default: true,
      approval_required: true,
      allowed_roots_only: true,
      secret_paths_blocked: true
    },
    evidence_log_location: evidenceRoot,
    core_handoff_supported: true,
    remaining_unsupported_actions: unsupportedActions(),
    unsupported_in_foundation_batch: ["github_destructive_admin_without_config", "package_publish", "global_package_install", "unreviewed_package_lifecycle_execution", "non_npm_dependency_mutation", "deployment", "arbitrary_shell", "unrestricted_api_calls", "secret_manager_backed_live_api", "login_automation", "cookie_extraction", "captcha_bypass", "giga_mcp"]
  };
}

function formatStatus() {
  const status = statusObject();
  return [
    `VNEM Tools MCP ${status.version}`,
    "Tools MCP can perform actions only through safeguards.",
    `Permission profile: ${status.permission_profile}`,
    `Allowed roots: ${status.allowed_roots.join(", ")}`,
    `Workspace allowed: ${status.workspace_allowed}`,
    status.allowed_root_warnings.length ? `Allowed-root warnings: ${status.allowed_root_warnings.join("; ")}` : "Allowed-root warnings: none",
    "Dry-run is default; real mutation/execution/live API/browser screenshot/project task/dev server/git commit requests require approved=true and an approval_note.",
    "Local project actions include a manifest/catalog, workspace map, read-many, code search, references, dependency graph/risk/advisory inspection, exact approval-gated npm transactions, project scan, patch/restore batches, safe package tasks, local dev servers, session proof packs, research/source helpers, and approved local git commits.",
    `Browser proof: local files/localhost only, screenshots under ${status.browser_policy.screenshot_evidence_location}, runtime ${status.browser_policy.browser_runtime_status}.`,
    "GitHub autonomy supports scoped command-backed gh/git workflows when dry_run=false, auth exists, and config allows; exact npm installs are limited to the reviewed approval-gated dependency transaction tool, while publishing, global installs, lifecycle execution, arbitrary shell/API, login automation, cookie extraction, CAPTCHA bypass, broad scraping, and destructive GitHub admin remain blocked."
  ].join("\n");
}

function buildActionPlan(args = {}) {
  const handoff = args.core_handoff || {};
  const requested = arrayify(args.requested_actions);
  const handoffCapabilities = arrayify(handoff.required_tool_capabilities);
  const capabilities = [...new Set([...(handoffCapabilities.length ? handoffCapabilities : []), ...requested])];
  const actions = capabilities.filter((capability) => isSupportedCapability(capability)).map((capability) => ({
    action: capability,
    dry_run_first: true,
    requires_approval: ["file_edit", "test_runner", "command", "api_request", "restore", "browser", "screenshot"].some((term) => String(capability).includes(term)),
    status: "available_with_safeguards"
  }));
  const blocked = [...new Set([...capabilities, ...requested])]
    .filter((capability) => !isSupportedCapability(capability))
    .map((capability) => ({ action: capability, reason: unsupportedReason(capability) }));
  return {
    task_summary: handoff.task_summary || args.task || "Unspecified Tools MCP task",
    selected_usable_api_packs: arrayify(handoff.selected_usable_api_packs),
    selected_usable_skill_packs: arrayify(handoff.selected_usable_skill_packs),
    actions,
    required_permissions: arrayify(handoff.required_permissions).length ? arrayify(handoff.required_permissions) : inferPermissions(actions),
    risk_level: handoff.risk_level || args.risk_tolerance || inferRisk(actions, blocked),
    dry_run_first: handoff.dry_run_first !== false,
    rollback_or_restore_plan: arrayify(handoff.rollback_or_restore_plan).length ? arrayify(handoff.rollback_or_restore_plan) : ["keep patch diff", "create backups before file writes", "stop if tests fail"],
    evidence_to_collect: arrayify(handoff.evidence_to_collect).length ? arrayify(handoff.evidence_to_collect) : ["changed files", "commands run", "test output", "tool run ids"],
    blocked_actions: blocked,
    safe_next_step: actions.length ? "Run the first action in dry-run mode, then ask for explicit approval before applying/capturing." : "Ask for a narrower supported Tools MCP action.",
    must_not_claim: [...arrayify(handoff.must_not_claim), "Tools MCP performed unsupported GitHub/install/login/CAPTCHA work."].filter(Boolean)
  };
}

function isSupportedCapability(capability) {
  const text = String(capability || "").toLowerCase();
  return /file_edit|patch|restore|test_runner|command|api_request|read_file|list_files|search_files|evidence|debug_evidence|architecture_review|browser|screenshot|visual|project_scan|project_task|dev_server|local_git|git_status|git_diff|git_commit|session/.test(text);
}

function unsupportedReason(capability) {
  const text = String(capability || "").toLowerCase();
  if (text.includes("github")) return "Only destructive/admin GitHub operations are unsupported or config-blocked by default; normal repo/PR/issue/Actions/release draft work uses scoped gh/git tools.";
  if (text.includes("install") || text.includes("package")) return "Package install support is not in this foundation batch.";
  return "Unsupported by the safe Tools MCP foundation allowlist.";
}

function inferPermissions(actions) {
  const permissions = [];
  if (actions.some((item) => /file_edit|patch|restore/.test(item.action))) permissions.push("approve file edits/restores under allowed roots");
  if (actions.some((item) => /test_runner|command/.test(item.action))) permissions.push("approve allowlisted commands");
  if (actions.some((item) => /api_request/.test(item.action))) permissions.push("approve live API requests if not mocked");
  if (actions.some((item) => /browser|screenshot|visual/.test(item.action))) permissions.push("approve local browser screenshot capture");
  return permissions;
}

function inferRisk(actions, blocked) {
  if (blocked.length) return "medium";
  if (actions.some((item) => /file_edit|api_request|command|browser|screenshot/.test(item.action))) return "medium";
  return "low";
}

function formatActionPlan(plan) {
  return [
    `Task: ${plan.task_summary}`,
    `Risk: ${plan.risk_level}`,
    `Dry-run first: ${plan.dry_run_first}`,
    `Actions: ${plan.actions.map((item) => item.action).join(", ") || "none"}`,
    `Blocked: ${plan.blocked_actions.map((item) => `${item.action} (${item.reason})`).join("; ") || "none"}`,
    `Safe next step: ${plan.safe_next_step}`
  ].join("\n");
}

function buildPermissionPrompt(args) {
  const action = args.action_type;
  const exactAction = args.command || (args.api_request ? JSON.stringify(args.api_request) : arrayify(args.target_paths).join(", ") || action);
  const rollback = arrayify(args.rollback_or_restore_plan).length ? arrayify(args.rollback_or_restore_plan) : ["Keep dry-run output and do not apply without a backup/restore path."];
  const text = [
    "What permission is requested:",
    `Approve VNEM Tools MCP to perform: ${action}`,
    "",
    `Exact action: ${exactAction}`,
    `Risk level: ${args.risk_level || "medium"}`,
    `Why it is needed: ${args.reason || "The requested task needs an approved Tools MCP action."}`,
    `Scope: ${arrayify(args.target_paths).length ? arrayify(args.target_paths).join(", ") : "Only the exact command/API/action shown above."}`,
    `Dry-run option: ${args.dry_run_available !== false ? "available and should be run first" : "not available for this requested action"}`,
    `Rollback/restore plan: ${rollback.join("; ")}`,
    "What could go wrong: files may be changed incorrectly, commands may fail, API calls may expose metadata, or evidence may be incomplete.",
    `Logs/evidence collected: evidence JSON under ${evidenceRoot} with secrets redacted.`,
    "What happens if approved: Tools MCP may run only the exact approved action within allowlists and limits.",
    "What happens if denied: Tools MCP will stop after planning/dry-run and make no real change."
  ].join("\n");
  return { action_type: action, exact_action: exactAction, risk_level: args.risk_level || "medium", scope: arrayify(args.target_paths), rollback_or_restore_plan: rollback, evidence_log_location: evidenceRoot, text };
}

async function resolveAllowedRoot(input = ".") {
  const raw = String(input || ".").trim();
  const candidate = path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(allowedRoots[0], raw);
  const resolved = await realpath(candidate);
  if (!isInsideAny(resolved, allowedRoots)) {
    throw new ToolsError("Path is outside allowed roots.", "path_outside_allowed_roots", { path: raw, allowed_roots: allowedRoots });
  }
  return { absolutePath: resolved, relativePath: relativeToAllowed(resolved), root: findContainingRoot(resolved) };
}

async function resolveAllowedFile(input, options = {}) {
  const raw = String(input || "").trim();
  if (!raw) throw new ToolsError("Path is required.", "path_required");
  const base = allowedRoots[0];
  const candidate = path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(base, raw);
  if (!isInsideAny(candidate, allowedRoots)) {
    throw new ToolsError("Path is outside allowed roots.", "path_outside_allowed_roots", { path: raw, allowed_roots: allowedRoots });
  }
  if (options.blockSecrets !== false && isSecretLikePath(candidate)) {
    throw new ToolsError("Secret-like file paths are blocked.", "secret_path_blocked", { path: relativeToAllowed(candidate) });
  }
  if (options.mustExist !== false && !existsSync(candidate)) {
    throw new ToolsError("Target path does not exist.", "path_missing", { path: raw });
  }
  const resolved = options.mustExist === false ? candidate : await realpath(candidate);
  if (!isInsideAny(resolved, allowedRoots)) {
    throw new ToolsError("Resolved path escapes allowed roots.", "path_outside_allowed_roots", { path: raw, resolved_path: resolved });
  }
  return { absolutePath: resolved, relativePath: relativeToAllowed(resolved), root: findContainingRoot(resolved) };
}

async function walkFiles(current, base, results, options = {}) {
  if (results.length >= (options.maxResults || DEFAULT_MAX_RESULTS)) return;
  const entries = await readdir(current, { withFileTypes: true });
  for (const entry of entries) {
    if (results.length >= (options.maxResults || DEFAULT_MAX_RESULTS)) return;
    const absolute = path.join(current, entry.name);
    const rel = normalizePath(path.relative(base, absolute));
    if (entry.isDirectory()) {
      if (SKIPPED_DIRS.has(entry.name) || isSecretLikePath(absolute)) continue;
      await walkFiles(absolute, base, results, options);
    } else if (entry.isFile()) {
      if (isSecretLikePath(absolute) || shouldSkipRelative(rel)) continue;
      if (options.filter && !matchesSimpleFilter(rel, options.filter)) continue;
      const info = await stat(absolute);
      results.push({ path: normalizePath(path.relative(findContainingRoot(absolute), absolute)), bytes: info.size, modified_at: info.mtime.toISOString() });
    }
  }
}

async function searchAllowedFiles(args) {
  const root = await resolveAllowedRoot(args.root || ".");
  const files = [];
  await walkFiles(root.absolutePath, root.absolutePath, files, { filter: args.file_glob, maxResults: 1000 });
  const results = [];
  const needle = String(args.query).toLowerCase();
  for (const file of files) {
    if (results.length >= (args.max_results || 50)) break;
    const target = await resolveAllowedFile(path.join(root.absolutePath, file.path), { mustExist: true, blockSecrets: true });
    const info = await stat(target.absolutePath);
    if (info.size > (args.max_file_bytes || 128000)) continue;
    const buffer = await readFile(target.absolutePath);
    if (buffer.includes(0)) continue;
    const lines = buffer.toString("utf8").split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      if (results.length >= (args.max_results || 50)) break;
      if (lines[index].toLowerCase().includes(needle)) {
        results.push({ path: target.relativePath, line_number: index + 1, snippet: truncate(redactSecrets(lines[index].trim()), 240) });
      }
    }
  }
  return { root: root.relativePath || ".", query: args.query, results, skipped_policy: skippedPolicy() };
}

const TOOL_CAPABILITY_GROUPS = ["permissions", "filesystem", "project_intelligence", "app_engineering", "repo_power", "adoption_reliability", "structural_code", "structural_refactoring", "patching", "rollback", "commands", "project_tasks", "dev_server", "browser_proof", "browser_intelligence", "ui_web_quality", "windows_local", "game_domain", "dependency_security", "api_connectors", "skill_adapters", "current_documentation", "data_systems", "api_request", "search", "research_sources", "source_quality", "browsing_risk", "research_matrix", "source_ingestion", "debugging_code_quality", "session_evidence", "local_git", "github_autonomy", "status_readiness", "cloudflare_control", "tools_quality", "tool_intelligence"];

function buildToolCatalog() {
  const commonUnsafe = ["secret reading/dumping", "outside-root access", "arbitrary shell", "package installs", "git push", "deployment", "Giga MCP"];
  const mk = (name, group, opts = {}) => {
    const base = {
      tool_name: name,
      name,
      capability_group: group,
      description: opts.description || `${name} VNEM-improved safe tool`,
      read_only: opts.read_only ?? true,
      mutation: opts.mutation ?? false,
      network: opts.network ?? false,
      requires_approval: opts.requires_approval ?? false,
      dry_run_default: opts.dry_run_default ?? false,
      allowed_roots_required: opts.allowed_roots_required ?? true,
      secret_policy: opts.secret_policy || "Blocks secret-like paths and redacts secret-like output.",
      evidence_logged: opts.evidence_logged ?? true,
      core_handoff_compatible: true,
      typical_use_cases: opts.typical_use_cases || [],
      unsafe_actions_blocked: opts.unsafe_actions_blocked || commonUnsafe,
      related_tools: opts.related_tools || [],
      high_power: opts.high_power
    };
    return addReliabilityFields(base);
  };
  return [
    mk("vnem_tools_status", "status_readiness", { description: "Report Tools MCP policy/readiness including active permission profile and allowed-root status.", evidence_logged: false, typical_use_cases: ["preflight safety status"] }),
    mk("vnem_tools_entrypoint", "adoption_reliability", { description: "VNEM Tools MCP first-call entrypoint to recommend and route exact next action calls for repo, code, debug, test, proof, GitHub, CI, patch, MCP, browser, recovery, and tooling tasks.", evidence_logged: false, allowed_roots_required: true, typical_use_cases: ["first call for repo/code/tooling work", "Core handoff execution route", "compact proof-aware next action"] }),
    mk("vnem_tools_capability_router", "adoption_reliability", { description: "VNEM Tools MCP first-call entrypoint router to recommend and route exact registered tools for repo, code, debug, test, proof, GitHub, CI, patch, MCP, next action, browser, recovery, and no-placebo tasks.", evidence_logged: false, allowed_roots_required: false, typical_use_cases: ["map task to exact Tools calls", "avoid fake tool names", "choose compact next action"] }),
    mk("vnem_tools_adoption_readiness", "adoption_reliability", { description: "VNEM Tools MCP adoption readiness check for first-call entrypoint recommend route tools repo code debug test proof GitHub CI patch MCP next action discoverability, contracts, and no-placebo markers.", evidence_logged: false, allowed_roots_required: true, typical_use_cases: ["verify Tools discoverability", "check Core handoff compatibility", "audit adoption hooks"] }),
    mk("vnem_tools_visibility_doctor", "adoption_reliability", { description: "VNEM Tools MCP first-call entrypoint visibility doctor to recommend and route next action across repo, code, debug, test, proof, GitHub, CI, patch, MCP routes with registered tool count and adoption score.", evidence_logged: false, allowed_roots_required: false, typical_use_cases: ["prove Tools MCP is alive", "diagnose weak discoverability", "choose first Tools call"] }),
    mk("vnem_tools_underuse_detector", "adoption_reliability", { description: "VNEM Tools MCP first-call entrypoint underuse detector to recommend and route next action for repo, code, debug, test, proof, GitHub, CI, patch, MCP, browser, recovery, and evidence tasks with exact registered recovery calls.", evidence_logged: false, allowed_roots_required: false, typical_use_cases: ["detect missing Tools calls", "recover from underuse", "pressure AI clients to use VNEM Tools"] }),
    mk("vnem_tools_install_profile_emit", "adoption_reliability", { description: "VNEM Tools MCP first-call install adoption route: emit repo-local Core and Tools MCP profiles for Codex, Claude, Antigravity-style IDE agents, Hermes, and generic clients with repo code proof next action guidance and no external config writes.", evidence_logged: false, allowed_roots_required: false, typical_use_cases: ["generate MCP client config snippets", "adopt VNEM in AI clients", "avoid overwriting user config"] }),
    mk("vnem_tools_install_doctor", "adoption_reliability", { description: "VNEM Tools MCP first-call install doctor route: validate Core and Tools MCP profile setup, repo code proof next action readiness, tool entrypoints, no secrets, no hidden control characters, parseability, and safe next steps.", evidence_logged: false, allowed_roots_required: false, typical_use_cases: ["verify MCP install profiles", "prove install kit is not placebo", "diagnose missing profile files"] }),
    mk("vnem_tools_permission_profiles", "permissions", { description: "List all first-class Tools MCP permission profiles and allow/block/approval policies.", evidence_logged: false, allowed_roots_required: false, typical_use_cases: ["permission planning", "profile discovery"] }),
    mk("vnem_tools_permission_status", "permissions", { description: "Report active profile, allowed roots, evidence root, localhost policy, provider presence, blocked categories, root warnings, high-power summary, Cloudflare summary, approval phrases, and known blocked actions.", evidence_logged: false, allowed_roots_required: false, typical_use_cases: ["permission preflight", "allowed-root debugging"] }),
    mk("vnem_tools_reliability_catalog", "tool_intelligence", { description: "List major Tools MCP tools with reliability levels, tested_with, safe/unsafe claims, known limits, and next validation step.", evidence_logged: false, allowed_roots_required: false, typical_use_cases: ["avoid fake confidence", "choose proven tools"] }),
    mk("vnem_tools_action_recovery_plan", "tool_intelligence", { description: "Turn failed/blocked tool output into exact next steps, retry rules, and must-not-claim boundaries.", evidence_logged: false, allowed_roots_required: false, typical_use_cases: ["recover from tool failure", "explain blockers"] }),
    mk("vnem_tools_high_power_action_review", "tool_intelligence", { description: "Review proposed high-power action before execution for permission, approval, protected-resource, secret, production, and rollback risk.", evidence_logged: false, allowed_roots_required: false, typical_use_cases: ["preflight mutation", "creator-power guardrail"] }),
    mk("vnem_tools_capability_gap_report", "tool_intelligence", { description: "Report known Tools MCP gaps honestly with safe alternatives and add-requirements.", evidence_logged: false, allowed_roots_required: false, typical_use_cases: ["avoid pretending unsupported tools exist"] }),
    mk("vnem_tools_repo_deep_map", "repo_power", { description: "First-call repo route for code/debug/test/proof work: build a compact repository map with scripts, frameworks, entrypoints, git state, changed files, generated/noise/risky paths, and bounded evidence.", typical_use_cases: ["fast repo orientation", "avoid repeated rediscovery"] }),
    mk("vnem_tools_next_action_ranker", "repo_power", { description: "Rank the top useful implementation/validation/cleanup/publish/docs actions with value, risk, placebo penalty, expected files, and proof checks.", typical_use_cases: ["choose next Building AI action", "avoid useless validation loops"] }),
    mk("vnem_tools_no_placebo_progress_audit", "repo_power", { description: "Audit a batch for real behavior versus docs-only, test-only, registration-only, mocked-only, generated-only, or safety-text-only placebo progress.", typical_use_cases: ["prevent fake success", "review implementation depth"] }),
    mk("vnem_tools_change_impact_plan", "repo_power", { description: "Map changed files to affected areas/features, targeted checks, generation needs, full-suite triggers, and what not to run yet.", typical_use_cases: ["verification planning", "change risk review"] }),
    mk("vnem_tools_test_selection_plan", "repo_power", { description: "Select the smallest useful check set and escalate only for high-risk/shared/generated/UI surfaces.", typical_use_cases: ["choose tests efficiently", "avoid over-validation"] }),
    mk("vnem_tools_failure_triage", "repo_power", { description: "First-call debug/test route: classify failing output into bug, fixture, environment/network/auth/dependency/generated/Windows cleanup/regression and produce a compact fix plan.", typical_use_cases: ["fix failing checks fast", "avoid chasing environment noise"] }),
    mk("vnem_tools_evidence_pack", "repo_power", { description: "Proof route for repo/code/GitHub/CI/test work: build a compact evidence pack with commands, tests, files, real behavior, mocked/live/blocked proof, risks, commit status, safe and unsafe claims.", typical_use_cases: ["final handoff evidence", "truthful batch summary"] }),
    mk("vnem_tools_local_session_recovery", "repo_power", { description: "Recover local Git working state after lost chat context, including branch/head, dirty categories, local stack, unpushed commits, safe next step, and not-proven boundaries without network.", typical_use_cases: ["resume after chat loss", "recover local stack safely", "avoid touching main or secrets"] }),
    mk("vnem_tools_repo_workflow_orchestrator", "repo_power", { description: "Coordinate repo-power helpers into a mode-aware workflow decision with selected action, rejected actions, exact checks, proof packet, stop conditions, and not-proven boundaries.", typical_use_cases: ["choose local vs publish workflow", "recover after lost context", "triage CI failure", "avoid no-placebo traps"] }),
    mk("vnem_tools_code_symbol_map", "repo_power", { description: "First-call code route: build a compact symbol map across source/test/config files with functions, classes, exports, handler-like symbols, imports/exports, repo categories, and parser limits.", typical_use_cases: ["find functions/classes", "map tool handlers", "avoid blind repo inspection"] }),
    mk("vnem_tools_mcp_surface_audit", "repo_power", { description: "MCP/code proof route: audit MCP tool registrations, handler candidates, catalog/readiness/package/test evidence, weak coverage, and registration-only risks.", typical_use_cases: ["find weak MCP tools", "review real vs placebo tool surface", "plan MCP repairs"] }),
    mk("vnem_tools_patch_target_finder", "repo_power", { description: "First-call patch route: map a repo/code goal, tool name, or keyword to exact likely source functions/files/tests/readiness targets using real search and symbol evidence.", typical_use_cases: ["find exact patch target", "map user goal to files", "avoid generic inspect repo advice"] }),
    mk("vnem_tools_tool_test_coverage_map", "repo_power", { description: "MCP/test proof route: map MCP tools to behavior tests, registration-only checks, readiness-only coverage, package-script mentions, and recommended test additions.", typical_use_cases: ["find weak test coverage", "separate behavior proof from registration proof"] }),
    mk("vnem_tools_source_impact_trace", "repo_power", { description: "Repo/code/test proof route: trace changed files or target symbols to impacted tools/features/tests/readiness/generation needs, exact minimum checks, and risk.", typical_use_cases: ["choose precise checks", "trace source impact", "avoid over-validation"] }),
    mk("vnem_tools_source_control_character_guard", "repo_power", { description: "Proof/safety route: scan source/test/config text for hidden bidi Unicode and dangerous control characters while skipping binary/generated artifacts.", typical_use_cases: ["prevent hidden source control characters", "review Unicode warnings safely"] }),
    mk("vnem_tools_action_policy_preview", "permissions", { description: "Preview whether a proposed action is allowed, blocked, or approval-gated under the active profile.", evidence_logged: false, allowed_roots_required: false, typical_use_cases: ["approval preview", "risk classification"] }),
    mk("vnem_tools_trust_boundary_classify", "permissions", { description: "Classify data/action/source descriptions into VNEM trust-boundary levels.", evidence_logged: false, allowed_roots_required: false, typical_use_cases: ["security boundary planning"] }),
    mk("vnem_tools_manifest", "status_readiness", { description: "Structured catalog of Tools MCP tools and safety metadata.", evidence_logged: false, typical_use_cases: ["AI tool discovery", "Core handoff planning"] }),
    mk("vnem_tools_prepare_action_plan", "status_readiness", { description: "Convert Core handoff into a dry-run-first Tools plan.", evidence_logged: false, typical_use_cases: ["Core→Tools planning"] }),
    mk("vnem_tools_permission_prompt", "status_readiness", { description: "Generate approval prompt for a risky action.", evidence_logged: false, typical_use_cases: ["human approval wording"] }),
    mk("vnem_tools_read_file", "filesystem", { description: "Read one allowed text file safely.", typical_use_cases: ["inspect a small source/config/doc file"] }),
    mk("vnem_tools_list_files", "filesystem", { description: "List allowed files while skipping secrets/build outputs.", typical_use_cases: ["quick workspace inventory"] }),
    mk("vnem_tools_search_files", "filesystem", { description: "Basic safe text search across allowed files.", typical_use_cases: ["small grep-like search"] }),
    mk("vnem_tools_workspace_map", "project_intelligence", { description: "Build a bounded workspace map with entrypoints/config/docs/tests/large/skipped paths.", typical_use_cases: ["understand project structure before editing"] }),
    mk("vnem_tools_read_many_files", "filesystem", { description: "Read a bounded set of safe text files for AI context.", typical_use_cases: ["load relevant source files after search"] }),
    mk("vnem_tools_code_search", "project_intelligence", { description: "VNEM-improved code search with context, caps, skips, and evidence.", typical_use_cases: ["find implementation sites"] }),
    mk("vnem_tools_find_references", "project_intelligence", { description: "Find likely references/definitions for a symbol.", typical_use_cases: ["trace components/functions/config names"] }),
    mk("vnem_tools_dependency_scan", "project_intelligence", { description: "Analyze package manifests/scripts/lockfiles without installing.", typical_use_cases: ["understand dependencies and script risk"] }),
    mk("vnem_tools_app_inspect", "app_engineering", { description: "Inspect frameworks, frontend/backend boundaries, routes, components, APIs, data flow, states, validation, accessibility, responsiveness, and completion gaps.", typical_use_cases: ["understand an app before a vertical-slice change", "detect UI-only or backend-only work"] }),
    mk("vnem_tools_app_vertical_slice_plan", "app_engineering", { description: "Preview a coherent marker-backed Vite React Node or static Node vertical slice with explicit support limits and hash preconditions.", typical_use_cases: ["plan frontend plus API plus domain work", "preview all transaction files"] }),
    mk("vnem_tools_app_vertical_slice_apply", "app_engineering", { read_only: false, mutation: true, requires_approval: true, dry_run_default: true, description: "Apply one stored vertical-slice plan through staged writes, rename commits, failure rollback, and a retained manifest.", typical_use_cases: ["approved coherent app generation"], related_tools: ["vnem_tools_app_vertical_slice_plan", "vnem_tools_app_transaction_rollback"] }),
    mk("vnem_tools_app_acceptance_run", "app_engineering", { read_only: false, mutation: true, network: true, requires_approval: true, dry_run_default: true, description: "Run focused scripts, localhost server, real Chromium user path, console/network capture, and desktop/mobile screenshots with optional failure restore.", typical_use_cases: ["prove a complete app slice through its user path"], related_tools: ["vnem_tools_app_vertical_slice_apply", "vnem_tools_app_transaction_rollback"], unsafe_actions_blocked: [...commonUnsafe, "external browser automation", "login/cookie/session/CAPTCHA automation"] }),
    mk("vnem_tools_app_transaction_rollback", "app_engineering", { read_only: false, mutation: true, requires_approval: true, dry_run_default: true, description: "Restore an app transaction only when current hashes still match the applied plan.", typical_use_cases: ["rollback failed app acceptance", "explicit transaction restore"] }),
    mk("vnem_tools_apply_patch", "patching", { read_only: false, mutation: true, requires_approval: true, dry_run_default: true, description: "Apply one approved surgical patch with backup/evidence.", typical_use_cases: ["single-file fix"] }),
    mk("vnem_tools_apply_patch_batch", "patching", { read_only: false, mutation: true, requires_approval: true, dry_run_default: true, description: "Apply approved multi-file replace/create/append/delete batch with restore plan.", typical_use_cases: ["coherent local project change"] }),
    mk("vnem_tools_restore_backup", "rollback", { read_only: false, mutation: true, requires_approval: true, dry_run_default: true, description: "Restore one backup file.", typical_use_cases: ["rollback one changed file"] }),
    mk("vnem_tools_restore_batch", "rollback", { read_only: false, mutation: true, requires_approval: true, dry_run_default: true, description: "Restore multiple files from a restore plan.", typical_use_cases: ["rollback patch batch"] }),
    mk("vnem_tools_run_command", "commands", { read_only: false, mutation: true, requires_approval: true, dry_run_default: true, description: "Run one allowlisted verification command.", typical_use_cases: ["node --check", "npm test"], unsafe_actions_blocked: [...commonUnsafe, "shell chains", "destructive git", "publish/deploy"] }),
    mk("vnem_tools_run_project_task", "project_tasks", { read_only: false, mutation: true, requires_approval: true, dry_run_default: true, description: "Run known safe package.json tasks only.", typical_use_cases: ["test/build/validate/lint/typecheck"] }),
    mk("vnem_tools_start_dev_server", "dev_server", { read_only: false, mutation: true, network: true, requires_approval: true, dry_run_default: true, description: "Start approved local dev/start/preview server.", typical_use_cases: ["local browser proof target"] }),
    mk("vnem_tools_stop_dev_server", "dev_server", { read_only: false, mutation: true, requires_approval: true, description: "Stop only Tools-started dev servers.", typical_use_cases: ["cleanup dev proof server"] }),
    mk("vnem_tools_list_dev_servers", "dev_server", { description: "List Tools-started dev servers.", typical_use_cases: ["check local proof server registry"] }),
    mk("vnem_tools_api_request", "api_request", { read_only: false, network: true, requires_approval: true, dry_run_default: true, description: "Approved GET/HEAD usable-pack/localhost API request only.", typical_use_cases: ["limited API proof"] }),
    mk("vnem_tools_fetch_url_text", "research_sources", { read_only: false, network: true, requires_approval: true, dry_run_default: true, description: "Approved direct URL text extraction, no search scraping/login/cookies.", typical_use_cases: ["analyze a provided docs/source URL"], unsafe_actions_blocked: [...commonUnsafe, "search-engine scraping", "credentialed URLs", "login/session/cookie use"] }),
    mk("vnem_tools_source_quality_check", "research_sources", { description: "Score and flag source quality from provided/fetched metadata.", typical_use_cases: ["citation quality review"] }),
    mk("vnem_tools_research_brief", "research_sources", { description: "Build evidence-bounded brief from supplied source summaries.", typical_use_cases: ["claim support summary"] }),
    mk("vnem_tools_browser_capture", "browser_proof", { read_only: false, network: true, requires_approval: true, dry_run_default: true, description: "Approved local file/localhost screenshot proof only.", typical_use_cases: ["UI proof"], unsafe_actions_blocked: [...commonUnsafe, "external browsing by default", "login/cookie/session/CAPTCHA automation", "credential capture"] }),
    mk("vnem_tools_browser_page_inspect", "browser_intelligence", { read_only: false, network: true, requires_approval: true, dry_run_default: true, description: "Static page/source understanding from direct URL, allowed file, or provided HTML/text.", typical_use_cases: ["understand page purpose/headings/forms/links"], related_tools: ["vnem_tools_fetch_url_text", "vnem_tools_source_quality_check"], unsafe_actions_blocked: [...commonUnsafe, "search-engine scraping", "broad crawling", "login/session/cookie/CAPTCHA automation"] }),
    mk("vnem_tools_browser_readability_extract", "browser_intelligence", { read_only: false, network: true, requires_approval: true, dry_run_default: true, description: "Heuristic readable article/docs/main content extraction.", typical_use_cases: ["extract useful main content from docs/article pages"], related_tools: ["vnem_tools_browser_page_inspect"] }),
    mk("vnem_tools_browser_link_map", "browser_intelligence", { read_only: false, network: true, requires_approval: true, dry_run_default: true, description: "Analyze links found on one page without following or crawling.", typical_use_cases: ["map internal/external/anchor/download/suspicious links"], related_tools: ["vnem_tools_browser_page_inspect"], unsafe_actions_blocked: [...commonUnsafe, "link following", "broad crawling", "credentialed URLs"] }),
    mk("vnem_tools_browser_dom_search", "browser_intelligence", { read_only: false, network: true, requires_approval: true, dry_run_default: true, description: "Static search over DOM-like HTML/text content without JavaScript execution.", typical_use_cases: ["find headings/buttons/forms/links/text in a page"], related_tools: ["vnem_tools_browser_page_inspect"] }),
    mk("vnem_tools_browser_accessibility_audit", "browser_intelligence", { read_only: false, network: true, requires_approval: true, dry_run_default: true, description: "Static heuristic accessibility/UI audit, not certification.", typical_use_cases: ["flag missing alt text/forms/link text/heading issues"], related_tools: ["vnem_tools_browser_page_inspect"] }),
    mk("vnem_tools_browser_compare_snapshots", "browser_intelligence", { read_only: false, network: true, requires_approval: true, dry_run_default: true, description: "Compare two page/source snapshots without claiming full visual proof.", typical_use_cases: ["before/after UI content comparison"], related_tools: ["vnem_tools_browser_page_inspect", "vnem_tools_browser_capture"] }),
    mk("vnem_tools_browser_research_pack", "research_sources", { description: "Evidence-bounded multi-source page/source research pack.", typical_use_cases: ["supported/unsupported/conflicting claims across sources"], related_tools: ["vnem_tools_source_quality_check", "vnem_tools_research_brief", "vnem_tools_browser_page_inspect"], unsafe_actions_blocked: [...commonUnsafe, "fake web search claims", "search-engine scraping", "broad crawling"] }),

    mk("vnem_tools_search_provider_manifest", "search", { description: "Describe available/configured search providers without leaking API key values.", evidence_logged: false, allowed_roots_required: false, typical_use_cases: ["search provider discovery", "provider capability planning"], unsafe_actions_blocked: [...commonUnsafe, "API key disclosure", "fake provider availability claims"] }),
    mk("vnem_tools_search_query_builder", "search", { description: "Build high-quality search queries for current facts, docs, code, gaming/modding, security, product, and API/library research.", allowed_roots_required: false, typical_use_cases: ["research query planning", "source discovery planning"], related_tools: ["vnem_tools_search_provider_manifest", "vnem_tools_web_search"] }),
    mk("vnem_tools_web_search", "search", { read_only: false, network: true, requires_approval: true, dry_run_default: true, allowed_roots_required: false, description: "Run approved provider-backed search when configured, or return honest unavailable/unconfigured status.", typical_use_cases: ["current source discovery", "configured provider search"], related_tools: ["vnem_tools_search_result_ranker", "vnem_tools_source_quality_check"], unsafe_actions_blocked: [...commonUnsafe, "search-engine scraping", "automatic CAPTCHA bypass", "login/cookie/session use", "fake results"] }),
    mk("vnem_tools_search_result_ranker", "search", { description: "Rank search results by credibility, relevance, freshness, duplicates, and risk.", allowed_roots_required: false, typical_use_cases: ["choose best sources", "filter risky/spammy results"], related_tools: ["vnem_tools_url_reputation_check", "vnem_tools_claim_source_matrix"] }),
    mk("vnem_tools_redirect_chain_check", "browsing_risk", { read_only: false, network: true, requires_approval: true, dry_run_default: true, allowed_roots_required: false, description: "Check redirect chain safely with capped HEAD/manual redirects and no cookies/session/login.", typical_use_cases: ["detect suspicious redirects", "preflight URL risk"], unsafe_actions_blocked: [...commonUnsafe, "blind redirect following", "cookies/session/login", "private page scraping"] }),
    mk("vnem_tools_url_reputation_check", "browsing_risk", { description: "Heuristic URL/domain risk assessment, not antivirus verdict.", allowed_roots_required: false, typical_use_cases: ["phishing/scam/download risk triage"] }),
    mk("vnem_tools_captcha_detector", "browsing_risk", { description: "Detect CAPTCHA/anti-bot/access-block signals and produce safe user-assisted handoff; no bypass.", allowed_roots_required: false, typical_use_cases: ["detect access blocks", "safe CAPTCHA handoff"], unsafe_actions_blocked: [...commonUnsafe, "automatic CAPTCHA bypass", "anti-bot evasion"] }),
    mk("vnem_tools_download_safety_check", "browsing_risk", { read_only: false, network: true, requires_approval: true, dry_run_default: true, allowed_roots_required: false, description: "Assess download link risk before following/downloading; optional approved HEAD only, no download.", typical_use_cases: ["fake download/installer risk", "pre-download review"], unsafe_actions_blocked: [...commonUnsafe, "automatic downloads", "installer execution", "malware scanning overclaim"] }),
    mk("vnem_tools_claim_source_matrix", "research_matrix", { description: "Build claim/source support matrix with supported, unsupported, conflicting claims and citation plan.", allowed_roots_required: false, typical_use_cases: ["citation planning", "avoid fake confidence"], related_tools: ["vnem_tools_research_gap_detector", "vnem_tools_browser_research_pack"] }),
    mk("vnem_tools_research_gap_detector", "research_matrix", { description: "Detect missing current search, primary/counter sources, dates/versions, and confidence blockers.", allowed_roots_required: false, typical_use_cases: ["research completeness review", "next query/tool planning"], related_tools: ["vnem_tools_search_query_builder", "vnem_tools_web_search", "vnem_tools_claim_source_matrix"] }),
    mk("vnem_tools_source_map", "source_ingestion", { description: "Safely map a local repo/docs folder or explicit source target before bounded extraction; no broad crawling or hidden external fetch.", allowed_roots_required: true, evidence_logged: true, typical_use_cases: ["repo/docs source map", "find docs/code/config/test/release areas"], unsafe_actions_blocked: [...commonUnsafe, "broad crawling", "secret/session/browser-profile reads"], related_tools: ["vnem_tools_source_extract", "vnem_tools_source_graph"] }),
    mk("vnem_tools_source_extract", "source_ingestion", { description: "Extract bounded evidence from explicit selected local source targets only with secret blocking, redaction, skipped-target accounting, and structured evidence items.", allowed_roots_required: true, evidence_logged: true, typical_use_cases: ["bounded README/docs/changelog extraction", "claim candidate and version/date extraction"], unsafe_actions_blocked: [...commonUnsafe, "unbounded repo/site extraction", "secret reads"], related_tools: ["vnem_tools_source_map", "vnem_tools_source_graph", "vnem_tools_claim_source_matrix"] }),
    mk("vnem_tools_source_graph", "source_ingestion", { description: "Compare provided/bounded source evidence for officialness, freshness, claim support, contradictions, and confidence limits. Does not search or crawl.", allowed_roots_required: false, evidence_logged: true, typical_use_cases: ["official vs community conflict", "outdated source risk", "claim verification graph"], unsafe_actions_blocked: [...commonUnsafe, "claiming contradiction-free from one source", "broad search/crawl claims"], related_tools: ["vnem_tools_source_map", "vnem_tools_source_extract", "vnem_tools_claim_source_matrix"] }),
    mk("vnem_tools_architecture_review", "debugging_code_quality", { description: "Inspect allowed project structure for real entry points, tool/route registries, scripts, tests, configs, integration points, fake parallel systems, possible dead code, duplicate logic, contract risks, and secret risks.", allowed_roots_required: true, evidence_logged: true, typical_use_cases: ["architecture map before edits", "unwired MCP tool detection", "dead-code warning"], unsafe_actions_blocked: [...commonUnsafe, "broad crawling", "secret reads", "network access"], related_tools: ["vnem_tools_workspace_map", "vnem_tools_debug_evidence", "vnem_tools_code_search"] }),
    mk("vnem_tools_debug_evidence", "debugging_code_quality", { description: "Collect bounded log-first debugging evidence from explicit logs, package scripts, config metadata, git status, changed files, and targeted-check suggestions. Does not run arbitrary commands/tests.", allowed_roots_required: true, evidence_logged: true, typical_use_cases: ["log-first triage", "pre-fix root-cause evidence", "targeted test selection"], unsafe_actions_blocked: [...commonUnsafe, "arbitrary command execution", "secret reads", "error suppression"], related_tools: ["vnem_tools_architecture_review", "vnem_tools_run_project_task", "vnem_tools_git_status"] }),
    mk("vnem_tools_ui_surface_review", "ui_web_quality", { description: "Inspect local UI routes/components/entrypoints/render paths/state/a11y gaps under allowed roots; no browser/network/install.", allowed_roots_required: true, evidence_logged: true, typical_use_cases: ["prove component is wired", "find dead UI", "route/component review"], unsafe_actions_blocked: [...commonUnsafe, "hidden browser automation", "broad crawling", "secret reads"], related_tools: ["vnem_tools_architecture_review", "vnem_tools_browser_evidence_plan", "vnem_tools_ui_evidence_audit"] }),
    mk("vnem_tools_browser_evidence_plan", "ui_web_quality", { description: "Plan visual/browser proof checklist without running a browser.", allowed_roots_required: false, evidence_logged: false, typical_use_cases: ["UI proof planning", "localhost route evidence checklist"], unsafe_actions_blocked: [...commonUnsafe, "hidden browser automation", "login/session/cookie/CAPTCHA automation"] }),
    mk("vnem_tools_browser_evidence_run", "ui_web_quality", { read_only: false, network: true, requires_approval: true, dry_run_default: true, description: "Run bounded approved localhost browser proof collection and store structured screenshot/DOM/a11y evidence packs.", allowed_roots_required: true, evidence_logged: true, typical_use_cases: ["approved localhost UI proof run", "before/after screenshot evidence pack"], related_tools: ["vnem_tools_browser_evidence_plan", "vnem_tools_browser_capture", "vnem_tools_browser_page_inspect", "vnem_tools_browser_accessibility_audit", "vnem_tools_ui_evidence_audit"], unsafe_actions_blocked: [...commonUnsafe, "external browsing by default", "hidden browser automation", "login/session/cookie/CAPTCHA automation", "broad crawling"] }),
    mk("vnem_tools_browser_interaction_run", "browser_interaction", { read_only: false, network: true, requires_approval: true, dry_run_default: true, description: "Run bounded disclosed Chromium scenarios with structured interaction, runtime console/network evidence, screenshots, DOM/accessibility snapshots, state/viewport coverage, pixel comparison, and owned-process cleanup.", allowed_roots_required: true, evidence_logged: true, typical_use_cases: ["localhost user-flow proof", "loading/empty/error/success state proof", "responsive before/after evidence"], related_tools: ["vnem_tools_browser_evidence_plan", "vnem_tools_browser_evidence_compare", "vnem_tools_ui_evidence_audit"], unsafe_actions_blocked: [...commonUnsafe, "persistent/shared profiles", "cookie access", "login/private/session automation", "CAPTCHA bypass", "search-engine scraping", "unapproved external origins", "hidden or stealth automation"] }),
    mk("vnem_tools_browser_evidence_compare", "browser_interaction", { description: "Compare matching screenshots plus bounded DOM and accessibility snapshots from two browser interaction evidence packs.", allowed_roots_required: true, evidence_logged: false, typical_use_cases: ["before/after evidence comparison", "deterministic UI regression inspection"], related_tools: ["vnem_tools_browser_interaction_run"], unsafe_actions_blocked: [...commonUnsafe, "aesthetic-correctness claims from pixel difference alone", "reading evidence outside allowed roots"] }),
    mk("vnem_tools_powershell_command_plan", "windows_local", { description: "Plan a safely literal-quoted PowerShell native command without executing it.", allowed_roots_required: false, evidence_logged: false, typical_use_cases: ["PowerShell quoting", "path-with-spaces command planning"], unsafe_actions_blocked: [...commonUnsafe, "command execution", "secret-shaped arguments", "unquoted shell operators"] }),
    mk("vnem_tools_windows_system_snapshot", "windows_local", { description: "Inspect bounded Windows, PowerShell, PATH, tool, temp, long-path, and Defender visibility without returning environment values.", allowed_roots_required: false, evidence_logged: false, typical_use_cases: ["Windows environment diagnosis", "Node/npm/gh/git discovery", "PATH issue triage"], unsafe_actions_blocked: [...commonUnsafe, "environment value collection", "security-setting mutation"] }),
    mk("vnem_tools_windows_path_inspect", "windows_local", { description: "Inspect allowed-root path normalization, current-token access, links/junctions, lock signals, temp status, and long-path risk.", evidence_logged: false, typical_use_cases: ["path failure", "permission diagnosis", "file-lock signal", "long-path and junction inspection"], unsafe_actions_blocked: [...commonUnsafe, "file content reads", "outside-root links", "lock-owner claims"] }),
    mk("vnem_tools_process_inspect", "windows_local", { description: "Inspect exact Windows PIDs or names without command lines, environments, owner tokens, or termination.", allowed_roots_required: false, evidence_logged: false, typical_use_cases: ["process diagnosis", "parent/PID evidence"], unsafe_actions_blocked: [...commonUnsafe, "broad process crawling", "command-line collection", "process termination"] }),
    mk("vnem_tools_port_inspect", "windows_local", { description: "Inspect exact Windows TCP ports and correlate listener PIDs without firewall or process mutation.", allowed_roots_required: false, evidence_logged: false, typical_use_cases: ["port conflict", "listener ownership evidence"], unsafe_actions_blocked: [...commonUnsafe, "firewall mutation", "listener termination"] }),
    mk("vnem_tools_windows_service_status", "windows_local", { description: "Read exact Windows service state/start mode/PID evidence without wildcard enumeration or mutation.", allowed_roots_required: false, evidence_logged: false, typical_use_cases: ["service status", "startup diagnosis"], unsafe_actions_blocked: [...commonUnsafe, "service start/stop/configuration"] }),
    mk("vnem_tools_windows_scheduled_task_status", "windows_local", { description: "Read exact scheduled-task state and bounded run metadata without exposing actions or changing tasks.", allowed_roots_required: false, evidence_logged: false, typical_use_cases: ["scheduled-task status", "last/next run diagnosis"], unsafe_actions_blocked: [...commonUnsafe, "task action/argument collection", "task create/change/delete"] }),
    mk("vnem_tools_windows_event_log_read", "windows_local", { description: "Read up to 50 redacted recent Application/System/Setup events over at most 24 hours.", allowed_roots_required: false, evidence_logged: false, typical_use_cases: ["Event Viewer diagnosis", "app startup failure evidence"], unsafe_actions_blocked: [...commonUnsafe, "broad log export", "log clearing", "access-policy bypass"] }),
    mk("vnem_tools_windows_app_config_detect", "windows_local", { description: "Detect known client commands/install/config/profile locations and reload guidance using the shared client catalog.", evidence_logged: false, typical_use_cases: ["installed-client detection", "config location recovery", "reload guidance"], unsafe_actions_blocked: [...commonUnsafe, "config-content reads", "config mutation", "guessing unverified global paths"] }),
    mk("vnem_tools_windows_change_plan", "windows_local", { description: "Build a non-executing exact-scope permission and rollback gate for Windows system changes; security disabling is hard-blocked.", allowed_roots_required: false, evidence_logged: false, typical_use_cases: ["system mutation preflight", "rollback planning"], unsafe_actions_blocked: [...commonUnsafe, "system mutation", "security-control disabling", "approval inference"] }),
    mk("vnem_tools_game_adapter_catalog", "game_domain", { description: "Detect and report complete adapter contracts for generic text/mod projects, Roblox/Rojo/Luau, and guarded binary formats.", evidence_logged: false, typical_use_cases: ["choose a safe game/mod adapter", "prove unsupported binary boundaries"], unsafe_actions_blocked: [...commonUnsafe, "game launch", "unknown tool execution", "generic binary patching"] }),
    mk("vnem_tools_game_project_inspect", "game_domain", { description: "Inventory bounded game/mod files, manifests, load order, configs, assets, guarded binaries, hashes, duplicates, and isolated output requirements.", typical_use_cases: ["game/mod project inventory", "duplicate and binary-format guard"], unsafe_actions_blocked: [...commonUnsafe, "game launch", "installer execution", "unbounded game-folder crawl"] }),
    mk("vnem_tools_game_config_audit", "game_domain", { description: "Parse or statically scan bounded text, JSON, XML, YAML, TOML, Lua, and Luau configs without values or execution.", typical_use_cases: ["config validation", "Lua/Luau static risk scan"], unsafe_actions_blocked: [...commonUnsafe, "source execution", "secret value output", "claiming lexical XML or Lua checks prove semantics"] }),
    mk("vnem_tools_mod_compatibility_analyze", "game_domain", { description: "Analyze manifests and load order for dependencies, conflicts, cycles, exact versions, ordering, and a bounded compatibility matrix.", typical_use_cases: ["mod load-order analysis", "compatibility matrix"], unsafe_actions_blocked: [...commonUnsafe, "profile activation", "runtime compatibility certification", "invented version-range resolution"] }),
    mk("vnem_tools_mod_profile_compare", "game_domain", { description: "Compare two bounded mod profiles for added, removed, version, enabled, and ordering changes.", typical_use_cases: ["profile drift review", "mod profile migration"], unsafe_actions_blocked: [...commonUnsafe, "mod-manager mutation", "profile activation"] }),
    mk("vnem_tools_game_project_validate", "game_domain", { description: "Run bounded static config/path/hash/asset/Roblox checks and return exact isolated validation command plans without executing unknown tools.", typical_use_cases: ["pre-build project validation", "game-specific check planning"], unsafe_actions_blocked: [...commonUnsafe, "unknown tool execution", "game launch", "runtime-success claims"] }),
    mk("vnem_tools_mod_backup_create", "game_domain", { read_only: false, mutation: true, requires_approval: true, dry_run_default: true, description: "Create an isolated bounded directory backup package for exact regular files with SHA-256 manifest.", typical_use_cases: ["pre-mutation mod backup", "byte-preserving project package"], unsafe_actions_blocked: [...commonUnsafe, "secret-path backup", "link traversal", "unbounded archives"] }),
    mk("vnem_tools_mod_backup_restore", "game_domain", { read_only: false, mutation: true, requires_approval: true, dry_run_default: true, description: "Restore a VNEM game-domain package only after package and exact current-target hash checks, with a pre-restore safety package.", typical_use_cases: ["rollback game/mod files", "verified package restore"], unsafe_actions_blocked: [...commonUnsafe, "unreviewed overwrite", "cross-project restore", "game launch"] }),
    mk("vnem_tools_roblox_project_inspect", "game_domain", { description: "Map Rojo project/service paths, Luau contexts, toolchains/tests, remote trust boundaries, and missing/escaping mappings.", typical_use_cases: ["Roblox project structure", "Rojo mapping and remote review"], unsafe_actions_blocked: [...commonUnsafe, "Studio automation", "account/session access", "place publishing", "plugin execution"] }),
    mk("vnem_tools_luau_symbol_map", "game_domain", { description: "Map bounded Lua/Luau symbols, requires, Roblox services, remote boundaries, and static risks with file/line evidence.", typical_use_cases: ["Luau source search", "remote and module mapping"], unsafe_actions_blocked: [...commonUnsafe, "source execution", "full semantic/type-analysis claims"] }),
    mk("vnem_tools_dependency_inventory", "dependency_security", { description: "Parse bounded manifests and npm package-lock v1/v2/v3, pnpm/Yarn, Python, Cargo, and Go lockfiles into normalized direct/transitive graphs, lifecycle flags, lock integrity, credential-safe sources, and an SBOM-style inventory.", typical_use_cases: ["dependency graph and lock review", "SBOM-style component inventory"], unsafe_actions_blocked: [...commonUnsafe, "install execution", "registry credential reads", "vulnerability-free claims"] }),
    mk("vnem_tools_dependency_risk_audit", "dependency_security", { description: "Audit lifecycle hooks, suspicious commands, source/integrity signals, typosquat indicators, supplied maintenance metadata, and license families with explicit uncertainty.", typical_use_cases: ["supply-chain preflight", "install-hook and license review"], unsafe_actions_blocked: [...commonUnsafe, "malware certification", "legal advice", "abandonment claims without metadata"] }),
    mk("vnem_tools_dependency_advisory_audit", "dependency_security", { network: true, description: "Parse approved advisory reports or run an explicitly approved isolated credential-free npm audit with lifecycle scripts disabled.", typical_use_cases: ["current npm advisory evidence", "offline approved advisory ingestion"], unsafe_actions_blocked: [...commonUnsafe, "private registry credential use", "stale report presented as current", "install or audit fix"] }),
    mk("vnem_tools_dependency_change_analyze", "dependency_security", { description: "Compare two dependency snapshots for direct/transitive/add/remove/version changes, major-version indicators, impacted direct packages, and focused scripts.", typical_use_cases: ["upgrade diff review", "affected dependency and test selection"], unsafe_actions_blocked: [...commonUnsafe, "semantic compatibility certification", "automatic upgrade"] }),
    mk("vnem_tools_dependency_upgrade_plan", "dependency_security", { description: "Create a hash-bound exact-version npm install/update plan from an existing parsed npm lock baseline with affected tests, script-disabled commands, credential boundaries, and rollback requirements.", typical_use_cases: ["review npm upgrade", "prepare approved install transaction"], unsafe_actions_blocked: [...commonUnsafe, "lockfile-less mutation", "floating tags/ranges", "global install", "publishing"] }),
    mk("vnem_tools_dependency_install_apply", "dependency_security", { read_only: false, mutation: true, requires_approval: true, dry_run_default: true, description: "Apply a fresh reviewed npm plan with lifecycle scripts disabled, ephemeral credential-free npm configs, an allowlisted environment, recursive verification-script review, process-tree timeout cleanup, lock/build verification, and automatic failure rollback.", typical_use_cases: ["approved exact npm install", "verified dependency upgrade"], unsafe_actions_blocked: [...commonUnsafe.filter((item) => item !== "package installs"), "package publishing", "global install", "lifecycle scripts", "nested unsafe npm scripts", "unreviewed downloaded binary execution", "project .npmrc credential use"] }),
    mk("vnem_tools_dependency_transaction_rollback", "dependency_security", { read_only: false, mutation: true, requires_approval: true, dry_run_default: true, description: "Restore exact pre-install manifest/lock bytes after current-hash checks and restore npm state with lifecycle scripts disabled.", typical_use_cases: ["rollback dependency transaction", "verify install reversibility"], unsafe_actions_blocked: [...commonUnsafe.filter((item) => item !== "package installs"), "stale overwrite", "cross-project transaction", "lifecycle scripts"] }),
    mk("vnem_tools_structural_index_build", "structural_code", { description: "Build a persisted incremental Babel AST/binding graph with explicit lower-confidence adapters and generated/secret skips.", typical_use_cases: ["structural repo map", "incremental code graph refresh"], unsafe_actions_blocked: [...commonUnsafe, "source execution", "compiler-grade claims for heuristic languages"] }),
    mk("vnem_tools_structural_graph_query", "structural_code", { description: "Query bounded symbols, imports, calls, routes, components, APIs, tests, and package boundaries with confidence metadata.", typical_use_cases: ["find structural relationships", "inspect route/component/package graph"] }),
    mk("vnem_tools_exact_symbol_references", "structural_code", { description: "Resolve Babel lexical-binding and static-ESM references while preserving dynamic, reflection, generated, type-system, and external-consumer limits.", typical_use_cases: ["exact JS/TS references", "rename risk review"] }),
    mk("vnem_tools_refactor_rename_preview", "structural_refactoring", { description: "Create a hash-bound binding-aware rename preview with collisions, public API acknowledgement, affected tests, and uncertainty gates.", typical_use_cases: ["safe symbol rename plan", "review exact cross-file edits"], related_tools: ["vnem_tools_refactor_apply_verify"] }),
    mk("vnem_tools_refactor_move_preview", "structural_refactoring", { description: "Preview module move and relative-import rewrites with package-boundary and unresolved-consumer risk; no automatic apply.", typical_use_cases: ["module move plan", "package-boundary review"] }),
    mk("vnem_tools_refactor_extract_plan", "structural_refactoring", { description: "Plan line-range extraction with symbols, inputs, outputs, calls, tests, and closure/runtime uncertainty; no automatic apply.", typical_use_cases: ["function extraction plan", "module extraction review"] }),
    mk("vnem_tools_dead_code_candidates", "structural_code", { description: "Report static dead-code candidates with confidence and explicit must-not-delete boundaries.", typical_use_cases: ["dead-code review", "cleanup candidate discovery"], unsafe_actions_blocked: [...commonUnsafe, "automatic deletion", "runtime reachability claims"] }),
    mk("vnem_tools_refactor_impact_analyze", "structural_refactoring", { description: "Trace reverse static-import impact into files, symbols, routes, components, packages, and affected tests.", typical_use_cases: ["refactor blast-radius analysis", "focused test selection"] }),
    mk("vnem_tools_structural_patch_validate", "structural_refactoring", { description: "Reparse patch state and detect syntax, unresolved relative import, and duplicate export failures without executing project code.", typical_use_cases: ["post-patch structural check", "pre-test validation"] }),
    mk("vnem_tools_refactor_apply_verify", "structural_refactoring", { read_only: false, mutation: true, requires_approval: true, dry_run_default: true, description: "Apply one high-confidence rename with stale hashes, staged writes, reviewed tests, post-reference proof, evidence, and automatic rollback.", typical_use_cases: ["approved verified rename"], related_tools: ["vnem_tools_refactor_rename_preview", "vnem_tools_refactor_transaction_rollback"], unsafe_actions_blocked: [...commonUnsafe, "medium-confidence apply", "stale preview", "move/extract apply", "unverified partial write"] }),
    mk("vnem_tools_refactor_transaction_rollback", "structural_refactoring", { read_only: false, mutation: true, requires_approval: true, dry_run_default: true, description: "Restore exact pre-refactor bytes for a project-bound transaction after current-hash and backup-path checks, with optional reviewed tests.", typical_use_cases: ["rollback verified rename"], unsafe_actions_blocked: [...commonUnsafe, "stale overwrite", "cross-project rollback", "unsafe backup path"] }),
    mk("vnem_tools_api_adapter_catalog", "api_connectors", { description: "List full reviewed adapter contracts and official-source freshness without contacting providers.", typical_use_cases: ["choose a safe API adapter", "inspect auth/rate/cache/mutation boundaries"], unsafe_actions_blocked: [...commonUnsafe, "provider execution", "raw credential output", "compatibility permanence claims"] }),
    mk("vnem_tools_api_credential_reference_check", "api_connectors", { description: "Validate typed credential-reference shape, allowlist, and availability by presence only; values remain internal and hidden.", typical_use_cases: ["credential preflight", "provider profile selection"], unsafe_actions_blocked: [...commonUnsafe, "raw credential input or output", "provider auth-validity claims"] }),
    mk("vnem_tools_api_adapter_plan", "api_connectors", { description: "Build an exact schema-checked request and permission plan without resolving credentials or contacting a provider.", typical_use_cases: ["API request preflight", "permission and compensation review"] }),
    mk("vnem_tools_api_adapter_execute", "api_connectors", { network: true, dry_run_default: true, description: "Execute one reviewed adapter with shared permission scope, credential brokering, host/method bounds, local rate/retry/cache limits, output caps, schema checks, redaction, and evidence.", typical_use_cases: ["bounded public API read", "scoped credential-bearing API read", "approved adapter mutation"], unsafe_actions_blocked: [...commonUnsafe, "unregistered hosts or methods", "raw credential input/output", "unbounded response", "implicit mutation approval"] }),
    mk("vnem_tools_api_adapter_compensate", "api_connectors", { read_only: false, mutation: true, network: true, requires_approval: true, dry_run_default: true, description: "Run one exact reviewed best-effort compensating action for an in-session adapter mutation while preserving residual effects.", typical_use_cases: ["close fixture-created issue", "external mutation recovery"], unsafe_actions_blocked: [...commonUnsafe, "rollback guarantee", "cross-transaction compensation", "unapproved external mutation"] }),
    mk("vnem_tools_api_adapter_generate", "api_connectors", { description: "Ingest bounded OpenAPI JSON or structured official docs and generate an inactive declarative proposal, unknowns, mock fixture, and contract tests.", typical_use_cases: ["propose reusable API adapter", "OpenAPI operation review"], unsafe_actions_blocked: [...commonUnsafe, "automatic activation", "YAML ad hoc parsing", "generated auth or mutation execution"] }),
    mk("vnem_tools_api_adapter_contract_test", "api_connectors", { description: "Run local request/response/path contract checks against adapter mock fixtures without network or activation.", typical_use_cases: ["adapter fixture verification", "generated proposal gate"] }),
    mk("vnem_tools_api_adapter_review_activate", "api_connectors", { read_only: false, mutation: true, requires_approval: true, dry_run_default: true, description: "Atomically activate only a contract-tested, explicitly reviewed, unknown-acknowledged generated no-auth GET/HEAD adapter.", typical_use_cases: ["reviewed adapter registry update"], unsafe_actions_blocked: [...commonUnsafe, "untested generated activation", "generated credentials or mutation", "unacknowledged unknowns"] }),
    mk("vnem_tools_skill_adapter_catalog", "skill_adapters", { description: "List nine vetted VNEM-owned skill adapters with pinned provenance, complete contracts, runtime categories, permissions, risks, tests, compatibility, and evidence rules.", typical_use_cases: ["choose a safe skill adapter", "inspect skill runtime boundaries"], unsafe_actions_blocked: [...commonUnsafe, "Markdown execution", "marketplace popularity as trust", "automatic skill installation"] }),
    mk("vnem_tools_skill_package_inspect", "skill_adapters", { description: "Inspect bounded local SKILL.md packages, scripts, requested permissions, and risk indicators as inert data while leaving untrusted packages non-executable.", typical_use_cases: ["skill security review", "local package provenance check"], unsafe_actions_blocked: [...commonUnsafe, "skill script execution", "prompt instruction execution", "trust from parse success"] }),
    mk("vnem_tools_skill_doctor", "skill_adapters", { description: "Check source/version/license/manifest/runtime/permissions/dependencies/tests/risks/freshness/compatibility/evidence and exact local source identity.", typical_use_cases: ["skill readiness diagnosis", "stale or incomplete adapter check"] }),
    mk("vnem_tools_skill_adapter_plan", "skill_adapters", { description: "Validate exact adapter input and return filesystem, network, command, dependency, permission, risk, and evidence scope without execution.", typical_use_cases: ["skill execution preflight", "permission review"] }),
    mk("vnem_tools_skill_adapter_execute", "skill_adapters", { read_only: false, dry_run_default: false, description: "Execute a VNEM-owned vetted pure/read adapter, or plan/execute one hash-bound reviewed package test under separate skill and process gates.", typical_use_cases: ["frontend brief", "React or Windows static audit", "TDD plan", "browser evidence audit", "mod profile audit", "reviewed test verification"], unsafe_actions_blocked: [...commonUnsafe, "arbitrary Markdown or script execution", "unreviewed package execution", "implicit command approval"] }),
    mk("vnem_tools_skill_source_verify", "skill_adapters", { network: true, dry_run_default: true, description: "Fetch only pinned raw GitHub source files under exact external-fetch scope and compare Git blob identities without returning or executing content.", typical_use_cases: ["refresh source pin proof", "detect upstream source mismatch"], unsafe_actions_blocked: [...commonUnsafe, "arbitrary URL fetch", "source content execution", "permanent safety claim"] }),
    mk("vnem_tools_documentation_source_catalog", "current_documentation", { description: "List reviewed official documentation providers, exact domains, adapters, topic routes, and authority/currentness policy without network access.", typical_use_cases: ["choose an official docs source", "inspect provider and domain policy"], unsafe_actions_blocked: [...commonUnsafe, "caller-labeled officialness", "network access"] }),
    mk("vnem_tools_official_documentation_fetch", "current_documentation", { network: true, requires_approval: true, description: "Retrieve bounded relevant documentation with exact domain authority, conditional cache, source date/version evidence, stale status, redaction, and no full-page output.", typical_use_cases: ["current framework API lookup", "version-aware implementation context"], unsafe_actions_blocked: [...commonUnsafe, "unknown-domain authority", "cross-origin redirects", "full-page context dumps", "HTTP-success currentness claims"] }),
    mk("vnem_tools_documentation_context", "current_documentation", { description: "Build bounded task-scoped documentation context, prefer stronger sources, and expose heuristic contradiction evidence without another request.", typical_use_cases: ["read before write", "official/community claim comparison"], unsafe_actions_blocked: [...commonUnsafe, "full-page injection", "semantic completeness claims"] }),
    mk("vnem_tools_documentation_cache_status", "current_documentation", { description: "Inspect persisted cache timestamps, hashes, validators, and stale state without returning cached page bodies.", typical_use_cases: ["cache freshness audit", "revalidation planning"], unsafe_actions_blocked: [...commonUnsafe, "cached body output", "freshness claims outside the selected age bound"] }),
    mk("vnem_tools_data_source_inspect", "data_systems", { description: "Inspect bounded SQLite, JSON, JSONL, CSV, or YAML with exact source hash, parser identity, inferred schema, redacted preview, and explicit limits.", typical_use_cases: ["tabular inspection", "structured-data schema inference"], unsafe_actions_blocked: [...commonUnsafe, "secret value output", "unbounded file loading"] }),
    mk("vnem_tools_data_source_validate", "data_systems", { description: "Validate bounded structured rows or SQLite schema against an explicit expected contract with issue limits and source-hash evidence.", typical_use_cases: ["schema validation", "data quality preflight"], unsafe_actions_blocked: [...commonUnsafe, "silent coercion", "validation completeness beyond configured bounds"] }),
    mk("vnem_tools_data_source_diff", "data_systems", { description: "Compare bounded structured sources by inferred schema and row-key hashes while redacting changed values.", typical_use_cases: ["dataset change review", "schema drift evidence"], unsafe_actions_blocked: [...commonUnsafe, "raw changed-value dumps", "unbounded diffing"] }),
    mk("vnem_tools_data_transform_plan", "data_systems", { description: "Preview a declarative select, rename, filter, constant, sort, or limit transform bound to exact source bytes and output scope.", typical_use_cases: ["CSV to JSON planning", "bounded column mapping"], unsafe_actions_blocked: [...commonUnsafe, "arbitrary code execution", "unreviewed output writes"] }),
    mk("vnem_tools_data_transform_apply", "data_systems", { read_only: false, mutation: true, requires_approval: true, dry_run_default: true, description: "Apply an exact in-session structured-data transform with approved database-write scope, backup, hash verification, retained evidence, and rollback.", typical_use_cases: ["approved data conversion", "verified local structured-data write"], unsafe_actions_blocked: [...commonUnsafe, "stale plan apply", "unapproved write", "outside-root output"] }),
    mk("vnem_tools_database_connection_plan", "data_systems", { description: "Validate a bounded local SQLite connection or a typed reference-only remote database scope without opening remote traffic or accepting raw credentials.", typical_use_cases: ["database scope preflight", "remote credential-reference planning"], unsafe_actions_blocked: [...commonUnsafe, "raw credentials", "remote connection execution", "implicit write access"] }),
    mk("vnem_tools_database_schema_inspect", "data_systems", { description: "Inspect bounded local SQLite tables, columns, indexes, foreign keys, views, triggers, and optional row counts without returning table values.", typical_use_cases: ["SQLite schema map", "migration preflight"], unsafe_actions_blocked: [...commonUnsafe, "remote database access", "row value output"] }),
    mk("vnem_tools_database_query_plan", "data_systems", { description: "Validate one parameterized read-only SQLite statement and return EXPLAIN QUERY PLAN under bounded query-only enforcement.", typical_use_cases: ["query safety review", "SQLite access-plan evidence"], unsafe_actions_blocked: [...commonUnsafe, "DML or DDL", "multiple statements", "raw parameter values"] }),
    mk("vnem_tools_database_query", "data_systems", { description: "Execute one parameterized read-only local SQLite query with query-only pragma, row/column/byte limits, recursive redaction, and evidence.", typical_use_cases: ["bounded data lookup", "read-only query verification"], unsafe_actions_blocked: [...commonUnsafe, "DML or DDL", "unbounded result output", "secret value output"] }),
    mk("vnem_tools_database_migration_preview", "data_systems", { description: "Preview a reviewed subset of SQLite schema or row mutations inside an in-memory transaction with affected-row and schema-diff evidence.", typical_use_cases: ["migration review", "affected-row preview"], unsafe_actions_blocked: [...commonUnsafe, "disk mutation", "UPDATE or DELETE without WHERE", "ATTACH, PRAGMA, VACUUM, or REINDEX"] }),
    mk("vnem_tools_database_migration_apply", "data_systems", { read_only: false, mutation: true, requires_approval: true, dry_run_default: true, description: "Apply an exact fresh SQLite migration preview under approved database-write scope with backup, transaction, integrity/schema verification, automatic failure restore, and rollback evidence.", typical_use_cases: ["approved local SQLite migration", "verified schema update"], unsafe_actions_blocked: [...commonUnsafe, "active WAL or concurrent-writer mutation", "stale preview", "remote database mutation"] }),
    mk("vnem_tools_data_transaction_rollback", "data_systems", { read_only: false, mutation: true, requires_approval: true, dry_run_default: true, description: "Restore exact pre-transform or pre-migration bytes from an in-session retained backup after current-target hash checks.", typical_use_cases: ["structured-data rollback", "SQLite migration rollback"], unsafe_actions_blocked: [...commonUnsafe, "stale overwrite", "cross-session or cross-target restore"] }),
    mk("vnem_tools_ui_evidence_audit", "ui_web_quality", { description: "Audit provided UI evidence and reject unsupported visual/browser claims.", allowed_roots_required: false, evidence_logged: true, typical_use_cases: ["final UI claim audit", "responsive/a11y/state proof review"], unsafe_actions_blocked: [...commonUnsafe, "inventing browser results", "accepting code-only visual proof"] }),
    mk("vnem_tools_start_session", "session_evidence", { read_only: false, mutation: true, description: "Start session proof pack.", typical_use_cases: ["group local workflow evidence"] }),
    mk("vnem_tools_finish_session", "session_evidence", { read_only: false, mutation: true, description: "Write session proof pack.", typical_use_cases: ["final evidence summary"] }),
    mk("vnem_tools_collect_evidence", "session_evidence", { read_only: false, mutation: true, description: "Write proof-trail-compatible evidence summary.", typical_use_cases: ["final report support"] }),
    mk("vnem_tools_git_status", "local_git", { description: "Read local git status.", typical_use_cases: ["pre/post change report"] }),
    mk("vnem_tools_git_diff_summary", "local_git", { description: "Read capped local git diff summary.", typical_use_cases: ["change summary"] }),
    mk("vnem_tools_git_commit", "local_git", { read_only: false, mutation: true, requires_approval: true, dry_run_default: true, description: "Create approved local commit of explicit safe files only; no push.", typical_use_cases: ["local handoff commit"], unsafe_actions_blocked: [...commonUnsafe, "git push", "git reset --hard", "remote GitHub mutation"] }),
    mk("vnem_tools_github_status", "github_autonomy", { description: "First-call GitHub/CI proof route: detect gh/git/auth/repo/profile/config readiness for repo PR, push, Actions, remote SHA, and proof work.", network: true, allowed_roots_required: false, evidence_logged: true, typical_use_cases: ["GitHub preflight", "auth/config status"] }),
    mk("vnem_tools_github_settings_guide", "github_autonomy", { description: "Return copy-pasteable GitHub settings config block and compact knob explanations.", allowed_roots_required: false, evidence_logged: false, typical_use_cases: ["configure GitHub power"] }),
    mk("vnem_tools_github_profile_status", "github_autonomy", { description: "Show active GitHub profile, autonomy mode, allowed/blocked actions, and config knobs.", allowed_roots_required: false, evidence_logged: false, typical_use_cases: ["profile inspection"] }),
    mk("vnem_tools_github_repo_inspect", "github_autonomy", { description: "Inspect local/reachable GitHub repo identity, branch, commits, PRs/issues/CI when available, and build/test commands.", network: true, typical_use_cases: ["repo understanding before work"] }),
    mk("vnem_tools_github_diff_review", "github_autonomy", { description: "Review a bounded local range or live PR diff with file/risk classification plus hidden-control, secret-addition, generated-churn, and semantic-review boundaries.", network: true, typical_use_cases: ["PR diff review", "hidden/bidi warning investigation", "generated churn review"], related_tools: ["vnem_tools_github_review_threads", "vnem_tools_github_remote_proof", "vnem_tools_pr_quality_gate"], unsafe_actions_blocked: [...commonUnsafe, "claiming semantic correctness from structural scans", "returning unbounded patches"] }),
    mk("vnem_tools_github_review_threads", "github_autonomy", { description: "Read bounded PR review threads and unresolved/resolved/outdated state through GitHub GraphQL without replying or resolving.", network: true, typical_use_cases: ["review-thread inspection", "unresolved review audit"], related_tools: ["vnem_tools_github_diff_review", "vnem_tools_github_pr_update"], unsafe_actions_blocked: [...commonUnsafe, "replying to or resolving review threads", "claiming all pages were read when pagination remains"] }),
    mk("vnem_tools_github_remote_proof", "github_autonomy", { description: "Verify local, exact remote branch, PR head, and exact-head Actions SHA equality plus configured/live base-branch protection state.", network: true, typical_use_cases: ["remote SHA proof", "PR handoff proof", "protected-branch awareness"], related_tools: ["vnem_tools_github_actions_run_inspect", "vnem_tools_pr_quality_gate"], unsafe_actions_blocked: [...commonUnsafe, "fetching or mutating refs", "merge claims", "force-push repair"] }),
    mk("vnem_tools_github_actions_run_inspect", "github_autonomy", { description: "Inspect one exact Actions run with jobs, steps, and bounded redacted failed or job logs without rerunning CI.", network: true, typical_use_cases: ["job and step inspection", "bounded Actions log evidence"], related_tools: ["vnem_tools_github_ci_failure_triage", "vnem_tools_github_actions_rerun", "vnem_tools_github_remote_proof"], unsafe_actions_blocked: [...commonUnsafe, "CI rerun", "unbounded log dump", "green claim for a different SHA"] }),
    mk("vnem_tools_github_release_verify", "github_autonomy", { description: "Verify an exact GitHub release, remote tag/peeled SHA, draft/prerelease state, and asset metadata without release mutation.", network: true, typical_use_cases: ["release proof", "remote tag SHA verification"], related_tools: ["vnem_tools_github_release_plan", "vnem_tools_github_release_create"], unsafe_actions_blocked: [...commonUnsafe, "creating or publishing a release", "claiming a missing tag or release exists"] }),
    mk("vnem_tools_github_public_surface_audit", "github_autonomy", { description: "Audit bounded README, package, and public API consistency plus repo-page simplification opportunities without editing or crawling links.", typical_use_cases: ["README/public-page consistency", "repo-page simplification"], related_tools: ["vnem_tools_github_diff_review"], unsafe_actions_blocked: [...commonUnsafe, "editing public content", "external link crawling", "writing-quality certification"] }),
    mk("vnem_tools_repo_intelligence_report", "github_autonomy", { description: "Repo intelligence report with build/test/risky paths/CI/work risk/next actions.", network: true, typical_use_cases: ["fast next-action decisions"] }),
    mk("vnem_tools_github_branch_create", "github_autonomy", { read_only: false, mutation: true, requires_approval: false, dry_run_default: true, description: "Create clean local feature branches for repo work.", typical_use_cases: ["start feature branch"] }),
    mk("vnem_tools_github_commit_push", "github_autonomy", { read_only: false, mutation: true, network: true, requires_approval: false, dry_run_default: true, description: "Commit selected safe files and push feature branches with protected-branch/secret checks.", typical_use_cases: ["handoff commit/push"] }),
    mk("vnem_tools_github_pr_create", "github_autonomy", { read_only: false, mutation: true, network: true, dry_run_default: true, description: "Create or plan GitHub PR via gh.", typical_use_cases: ["open PR"] }),
    mk("vnem_tools_github_pr_update", "github_autonomy", { read_only: false, mutation: true, network: true, dry_run_default: true, description: "Update PR title/body/labels/comment via gh when authenticated.", typical_use_cases: ["update PR"] }),
    mk("vnem_tools_github_issue_create", "github_autonomy", { read_only: false, mutation: true, network: true, dry_run_default: true, description: "Create or plan GitHub issue via gh.", typical_use_cases: ["create issue"] }),
    mk("vnem_tools_github_issue_update", "github_autonomy", { read_only: false, mutation: true, network: true, dry_run_default: true, description: "Update GitHub issue title/body/state/labels via gh.", typical_use_cases: ["triage/update issue"] }),
    mk("vnem_tools_github_issue_comment", "github_autonomy", { read_only: false, mutation: true, network: true, dry_run_default: true, description: "Comment on issue/PR via gh.", typical_use_cases: ["post compact update"] }),
    mk("vnem_tools_github_labels_manage", "github_autonomy", { read_only: false, mutation: true, network: true, dry_run_default: true, description: "Create/update labels via gh where profile/config allows.", typical_use_cases: ["label hygiene"] }),
    mk("vnem_tools_github_actions_status", "github_autonomy", { read_only: true, network: true, description: "GitHub CI proof route: read Actions status for repo/branch/SHA before PR, merge, or remote proof claims.", typical_use_cases: ["CI status"] }),
    mk("vnem_tools_github_actions_rerun", "github_autonomy", { read_only: false, mutation: true, network: true, dry_run_default: true, description: "Rerun failed GitHub Actions runs/jobs when enabled.", typical_use_cases: ["rerun failed CI"] }),
    mk("vnem_tools_github_ci_failure_triage", "github_autonomy", { read_only: true, network: true, description: "Summarize CI failure cause, log excerpt, likely files, and next commands.", typical_use_cases: ["fix CI fast"] }),
    mk("vnem_tools_pr_quality_gate", "github_autonomy", { description: "PR/GitHub/CI proof route: compact final quality gate over worktree, churn, secrets, tests, CI, remote proof, and claim status.", typical_use_cases: ["pre-PR quality check"] }),
    mk("vnem_tools_task_progress_truth_check", "github_autonomy", { description: "Truth-check done/partial/blocked status to prevent fake done claims.", typical_use_cases: ["final handoff honesty"] }),
    mk("vnem_tools_github_release_plan", "github_autonomy", { description: "Plan GitHub release/draft release based on config.", network: true, evidence_logged: true, typical_use_cases: ["release planning"] }),
    mk("vnem_tools_github_release_create", "github_autonomy", { read_only: false, mutation: true, network: true, dry_run_default: true, description: "Create draft release via gh when releases are enabled.", typical_use_cases: ["draft release"] }),
    mk("vnem_tools_github_repo_settings_plan", "github_autonomy", { description: "Plan repo settings mutation and show required config knob.", network: true, evidence_logged: true, typical_use_cases: ["settings planning"] }),
    mk("vnem_tools_github_repo_settings_apply", "github_autonomy", { read_only: false, mutation: true, network: true, dry_run_default: true, description: "Apply limited repo settings mutation only when explicitly config-enabled.", typical_use_cases: ["repo settings apply"] }),
    mk("vnem_tools_cloudflare_status", "cloudflare_control", { read_only: true, mutation: false, network: true, requires_approval: false, dry_run_default: false, allowed_roots_required: false, description: "Diagnose local Wrangler, credential-reference, account, permission-profile, and optional live token readiness without exposing values.", typical_use_cases: ["Cloudflare auth preflight", "deployment readiness"] }),
    mk("vnem_tools_cloudflare_auth_plan", "cloudflare_control", { read_only: true, mutation: false, network: false, requires_approval: false, dry_run_default: false, allowed_roots_required: false, description: "Plan least-privilege Wrangler and API-token setup using named environment references.", typical_use_cases: ["Cloudflare auth planning"] }),
    mk("vnem_tools_cloudflare_accounts_list", "cloudflare_control", { read_only: true, mutation: false, network: true, requires_approval: false, dry_run_default: false, allowed_roots_required: false, description: "List accessible Cloudflare accounts through the bounded paginated API client with redacted identifiers.", typical_use_cases: ["account discovery"] }),
    mk("vnem_tools_cloudflare_projects_list", "cloudflare_control", { read_only: true, mutation: false, network: true, requires_approval: false, dry_run_default: false, allowed_roots_required: false, description: "Discover Pages projects and Worker scripts independently, preserving partial-failure evidence.", typical_use_cases: ["project discovery", "deployment targeting"] }),
    mk("vnem_tools_cloudflare_pages_deploy_plan", "cloudflare_control", { read_only: true, mutation: false, network: false, requires_approval: false, dry_run_default: true, description: "Inspect framework, build script, Wrangler config, and bounded artifact output before a Pages deploy.", typical_use_cases: ["Pages deploy planning", "build output diagnosis"] }),
    mk("vnem_tools_cloudflare_pages_deploy", "cloudflare_control", { read_only: false, mutation: true, network: true, requires_approval: true, dry_run_default: true, description: "Build, deploy with local Wrangler, require command success and URL verification, and write a redacted evidence pack.", typical_use_cases: ["approved Pages deploy"] }),
    mk("vnem_tools_cloudflare_workers_deploy_plan", "cloudflare_control", { read_only: true, mutation: false, network: false, requires_approval: false, dry_run_default: true, description: "Inspect Worker entrypoint/config and produce a reusable local-Wrangler deployment command.", typical_use_cases: ["Workers deploy planning"] }),
    mk("vnem_tools_cloudflare_workers_deploy", "cloudflare_control", { read_only: false, mutation: true, network: true, requires_approval: true, dry_run_default: true, description: "Execute an approved local-Wrangler Worker deploy with exit, URL/version, verification, and rollback evidence.", typical_use_cases: ["approved Workers deploy"] }),
    mk("vnem_tools_cloudflare_dns_plan", "cloudflare_control", { read_only: true, mutation: false, network: false, requires_approval: false, dry_run_default: true, allowed_roots_required: false, description: "Plan one DNS create, update, or delete and identify apex, www, and mail-record risk.", typical_use_cases: ["DNS change review"] }),
    mk("vnem_tools_cloudflare_dns_apply", "cloudflare_control", { read_only: false, mutation: true, network: true, requires_approval: true, dry_run_default: true, allowed_roots_required: false, description: "Apply one approved DNS mutation with conflict checks and read-after-write evidence.", typical_use_cases: ["approved DNS mutation"] }),
    mk("vnem_tools_cloudflare_env_plan", "cloudflare_control", { read_only: true, mutation: false, network: false, requires_approval: false, dry_run_default: true, allowed_roots_required: false, description: "Plan Pages or Workers secret names and environment references while redacting every value.", typical_use_cases: ["secret reference planning"] }),
    mk("vnem_tools_cloudflare_env_apply", "cloudflare_control", { read_only: false, mutation: true, network: true, requires_approval: true, dry_run_default: true, description: "Apply approved secrets from named environment references over stdin without logging raw values.", typical_use_cases: ["approved secret apply"] }),
    mk("vnem_tools_cloudflare_deploy_verify", "cloudflare_control", { read_only: true, mutation: false, network: true, requires_approval: false, dry_run_default: false, allowed_roots_required: false, description: "Verify bounded HTTP status, marker/title, redirects, and optional exact Pages deployment metadata.", typical_use_cases: ["deployment proof"] }),
    mk("vnem_tools_cloudflare_rollback_plan", "cloudflare_control", { read_only: true, mutation: false, network: true, requires_approval: false, dry_run_default: true, allowed_roots_required: false, description: "Identify an exact prior Pages deployment or Worker version before any rollback approval.", typical_use_cases: ["rollback target discovery"] }),
    mk("vnem_tools_cloudflare_rollback", "cloudflare_control", { read_only: false, mutation: true, network: true, requires_approval: true, dry_run_default: true, description: "Roll back Pages through the documented deployment API or Workers through an exact Wrangler version target.", typical_use_cases: ["approved rollback"] }),
    mk("vnem_tools_cloudflare_cache_purge_plan", "cloudflare_control", { read_only: true, mutation: false, network: false, requires_approval: false, dry_run_default: true, allowed_roots_required: false, description: "Plan a URL-scoped or whole-zone cache purge and expose its irreversibility.", typical_use_cases: ["cache purge review"] }),
    mk("vnem_tools_cloudflare_cache_purge", "cloudflare_control", { read_only: false, mutation: true, network: true, requires_approval: true, dry_run_default: true, allowed_roots_required: false, description: "Execute an approved bounded cache purge and record provider evidence plus non-reversibility.", typical_use_cases: ["approved cache purge"] }),
    mk("vnem_tools_cloudflare_error_diagnose", "cloudflare_control", { read_only: true, mutation: false, network: false, requires_approval: false, dry_run_default: false, allowed_roots_required: false, description: "Classify redacted Cloudflare or Wrangler failures and return the narrowest safe recovery path.", typical_use_cases: ["Cloudflare failure triage"] }),
    mk("vnem_tools_evidence_pack_audit", "tools_quality", { description: "Audit mutation evidence pack completeness and anti-fake-success proof.", allowed_roots_required: false, evidence_logged: false }),
    mk("vnem_tools_mutation_approval_contract", "tools_quality", { description: "Check exact approval phrase requirements for high-power mutation/destructive workflows.", allowed_roots_required: false, evidence_logged: false }),
    mk("vnem_tools_secret_redaction_check", "tools_quality", { description: "Detect and prove redaction for secret/token leak patterns including Cloudflare tokens.", allowed_roots_required: false, evidence_logged: false })
  ];
}

function buildToolsManifest(group) {
  const tools = runtimeToolCatalog().filter((tool) => !group || tool.capability_group === group);
  return {
    server_name: "vnem-tools",
    version: SERVER_VERSION,
    capability_groups: TOOL_CAPABILITY_GROUPS,
    tools,
    unsafe_actions_not_supported: statusObject().remaining_unsupported_actions,
    permission_profile: activePermissionProfile.profile_name,
    permission_profiles: PERMISSION_PROFILE_NAMES,
    permission_manifest_integration: true,
    action_policy_preview_tool: "vnem_tools_action_policy_preview",
    trust_boundary_classifier_tool: "vnem_tools_trust_boundary_classify",
    catalog_safety_summary: "Every action/mutation/network tool declares approval behavior, dry-run status where applicable, evidence behavior, secret policy, and Core handoff compatibility."
  };
}

function runtimeToolCatalog() {
  const legacyByName = new Map(buildToolCatalog().map((tool) => [tool.name, tool]));
  return toolsRegistry.manifest().map((entry) => {
    const legacy = legacyByName.get(entry.name) || addReliabilityFields({
      tool_name: entry.name,
      name: entry.name,
      capability_group: entry.category,
      description: entry.description,
      read_only: entry.side_effect_class === "read_only",
      mutation: entry.side_effect_class !== "read_only",
      network: entry.network_behavior !== "none",
      requires_approval: entry.permission_requirements.some((permission) => /approved|acknowledgment/.test(permission)),
      dry_run_default: entry.side_effect_class !== "read_only",
      allowed_roots_required: entry.permission_requirements.includes("allowed_root_read") || entry.permission_requirements.includes("approved_local_mutation"),
      secret_policy: "Secret values are redacted by the shared runtime result contract.",
      evidence_logged: entry.evidence_behavior !== "none",
      core_handoff_compatible: true,
      typical_use_cases: ["runtime registry inspection"],
      unsafe_actions_blocked: ["secret output", "unapproved mutation", "force push", "repo deletion"],
      related_tools: []
    });
    return {
      ...legacy,
      name: entry.name,
      description: entry.description,
      capability_group: legacy.capability_group || entry.category,
      category: entry.category,
      read_only: entry.side_effect_class === "read_only",
      mutation: entry.side_effect_class !== "read_only",
      network: entry.network_behavior !== "none",
      requires_approval: entry.permission_requirements.some((permission) => /approved|acknowledgment/.test(permission)),
      evidence_logged: entry.evidence_behavior !== "none",
      registry_contract: entry
    };
  });
}

async function safeWorkspaceMap(args) {
  const root = await resolveAllowedRoot(args.root || ".");
  const entries = [];
  const skipped = [];
  await walkWorkspace(root.absolutePath, root.absolutePath, entries, skipped, { maxDepth: args.max_depth || 4, maxFiles: args.max_files || 300, includeHidden: args.include_hidden === true });
  const files = entries.filter((item) => item.type === "file");
  const dirs = entries.filter((item) => item.type === "directory");
  const importantDirs = {
    source: dirs.map((d) => d.path).filter((p) => /(^|\/)(src|app|pages|lib|components)$/.test(p)).slice(0, 40),
    tests: dirs.map((d) => d.path).filter((p) => /(^|\/)(test|tests|__tests__|spec)$/.test(p)).slice(0, 40),
    config: dirs.map((d) => d.path).filter((p) => /(^|\/)(config|configs)$/.test(p)).slice(0, 20),
    docs: dirs.map((d) => d.path).filter((p) => /(^|\/)(docs|doc)$/.test(p)).slice(0, 20),
    public: dirs.map((d) => d.path).filter((p) => /(^|\/)(public|static|assets)$/.test(p)).slice(0, 20)
  };
  const result = {
    workspace_root: root.absolutePath,
    tree_summary: entries.slice(0, args.max_files || 300).map((item) => `${item.type === "directory" ? "[dir]" : "[file]"} ${item.path}${item.bytes ? ` (${item.bytes} bytes)` : ""}`),
    important_dirs: importantDirs,
    likely_entrypoints: files.map((f) => f.path).filter((p) => /(^|\/)(index|main|app|server|cli)\.(js|mjs|ts|tsx|jsx|html)$|package\.json$/.test(p)).slice(0, 40),
    config_files: files.map((f) => f.path).filter((p) => /(^|\/)(package\.json|vite\.config\.[cm]?[jt]s|next\.config\.[cm]?[jt]s|astro\.config\.[cm]?[jt]s|tsconfig\.json|eslint\.config\.[cm]?[jt]s)$/.test(p)).slice(0, 50),
    test_files: files.map((f) => f.path).filter((p) => /(^|\/)(test|tests|__tests__)\/|\.(test|spec)\.[cm]?[jt]sx?$/.test(p)).slice(0, 80),
    docs_files: files.map((f) => f.path).filter((p) => /(^|\/)(README|CHANGELOG|CONTRIBUTING|LICENSE)\.md$|(^|\/)docs\//i.test(p)).slice(0, 80),
    large_files: files.filter((f) => f.bytes >= 1024).map((f) => ({ path: f.path, bytes: f.bytes })).slice(0, 40),
    skipped_paths: skipped,
    warnings: entries.length >= (args.max_files || 300) ? ["workspace map truncated by max_files"] : [],
    evidence_log_id: null
  };
  const log = await writeEvidenceLog("workspace_map", result);
  result.evidence_log_id = log.evidence_log_id;
  recordSession(args.session_id, "workspace_maps", result);
  return result;
}

async function walkWorkspace(current, base, entries, skipped, options, depth = 0) {
  if (entries.length >= options.maxFiles || depth > options.maxDepth) return;
  const list = await readdir(current, { withFileTypes: true });
  for (const entry of list) {
    if (entries.length >= options.maxFiles) return;
    if (!options.includeHidden && entry.name.startsWith(".") && entry.name !== ".vnem") { skipped.push(normalizePath(path.relative(base, path.join(current, entry.name)))); continue; }
    const absolute = path.join(current, entry.name);
    const rel = normalizePath(path.relative(base, absolute));
    if (isSecretLikePath(absolute)) { skipped.push(rel); continue; }
    if (entry.isDirectory()) {
      if (SKIPPED_DIRS.has(entry.name)) { skipped.push(rel); continue; }
      entries.push({ type: "directory", path: rel });
      await walkWorkspace(absolute, base, entries, skipped, options, depth + 1);
    } else if (entry.isFile()) {
      const info = await stat(absolute);
      entries.push({ type: "file", path: rel, bytes: info.size, large: info.size >= LARGE_FILE_BYTES });
    }
  }
}

async function safeReadManyFiles(args) {
  const root = await resolveAllowedRoot(args.root || ".");
  const files = [];
  const blocked = [];
  const truncated = [];
  let total = 0;
  const maxTotal = Math.min(args.max_total_bytes || 64000, MAX_READ_MANY_TOTAL_BYTES);
  const maxFile = Math.min(args.max_file_bytes || 16000, DEFAULT_MAX_READ_BYTES);
  for (const raw of arrayify(args.paths)) {
    const relInput = normalizePath(raw);
    try {
      const target = await resolveAllowedFile(path.isAbsolute(raw) ? raw : path.join(root.absolutePath, raw), { mustExist: true, blockSecrets: true });
      if (shouldSkipRelative(target.relativePath)) throw new ToolsError("Generated/build/cache paths are skipped by default.", "generated_path_skipped", { path: target.relativePath });
      const info = await stat(target.absolutePath);
      if (!info.isFile()) throw new ToolsError("Target is not a regular file.", "not_a_file", { path: target.relativePath });
      const bytes = await readFile(target.absolutePath);
      if (bytes.includes(0) || looksBinary(bytes)) throw new ToolsError("Binary files are blocked.", "binary_file_blocked", { path: target.relativePath });
      const remaining = maxTotal - total;
      if (remaining <= 0) { blocked.push({ path: target.relativePath, code: "total_bytes_exceeded" }); continue; }
      const take = Math.min(bytes.length, maxFile, remaining);
      const content = redactSecrets(bytes.subarray(0, take).toString("utf8"));
      if (take < bytes.length) truncated.push(target.relativePath);
      files.push({ path: target.relativePath, bytes_total: bytes.length, bytes_read: take, truncated: take < bytes.length, content });
      total += take;
    } catch (error) {
      blocked.push({ path: relInput, code: error instanceof ToolsError ? error.code : "read_failed", reason: error.message });
    }
  }
  const result = { files, blocked_files: blocked, truncated_files: truncated, total_bytes: total, evidence_log_id: null };
  const log = await writeEvidenceLog("read_many_files", result);
  result.evidence_log_id = log.evidence_log_id;
  recordSession(args.session_id, "files_read", result);
  return result;
}

async function safeCodeSearch(args) {
  const root = await resolveAllowedRoot(args.root || ".");
  const allFiles = [];
  const skipped = [];
  await walkWorkspace(root.absolutePath, root.absolutePath, allFiles, skipped, { maxDepth: 12, maxFiles: 2000, includeHidden: false });
  const files = allFiles.filter((item) => item.type === "file" && !shouldSkipRelative(item.path) && globsMatch(item.path, args.file_globs));
  const matches = [];
  const query = String(args.query || "");
  const needle = args.case_sensitive ? query : query.toLowerCase();
  for (const file of files) {
    if (matches.length >= (args.max_results || 50)) break;
    try {
      const target = await resolveAllowedFile(path.join(root.absolutePath, file.path), { mustExist: true, blockSecrets: true });
      const info = await stat(target.absolutePath);
      if (info.size > 512000) { skipped.push(target.relativePath); continue; }
      const buffer = await readFile(target.absolutePath);
      if (buffer.includes(0) || looksBinary(buffer)) { skipped.push(target.relativePath); continue; }
      const lines = buffer.toString("utf8").split(/\r?\n/);
      for (let i = 0; i < lines.length && matches.length < (args.max_results || 50); i++) {
        const hay = args.case_sensitive ? lines[i] : lines[i].toLowerCase();
        if (hay.includes(needle)) {
          const start = Math.max(0, i - (args.context_lines || 0));
          const end = Math.min(lines.length, i + (args.context_lines || 0) + 1);
          matches.push({ path: target.relativePath, line_number: i + 1, snippet: truncate(redactSecrets(lines.slice(start, end).join("\n")), 500) });
        }
      }
    } catch (error) { skipped.push(`${file.path}:${error.code || "search_failed"}`); }
  }
  const result = { root: root.absolutePath, query, matches, result_count: matches.length, truncated: matches.length >= (args.max_results || 50), skipped_paths: [...new Set(skipped)].slice(0, 80), evidence_log_id: null };
  const log = await writeEvidenceLog("code_search", result);
  result.evidence_log_id = log.evidence_log_id;
  recordSession(args.session_id, "code_searches", result);
  return result;
}

async function safeFindReferences(args) {
  const symbol = String(args.symbol || "").trim();
  const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const search = await safeCodeSearch({ root: args.root || ".", query: symbol, max_results: args.max_results || 50, context_lines: 0, case_sensitive: true, file_globs: [], session_id: args.session_id });
  const boundary = new RegExp(`(^|[^A-Za-z0-9_$])${escaped}([^A-Za-z0-9_$]|$)`);
  const references = search.matches.filter((match) => boundary.test(match.snippet));
  let likely = references.filter((match) => [`function ${symbol}`, `const ${symbol}`, `class ${symbol}`, `let ${symbol}`, `var ${symbol}`, `export function ${symbol}`, `export const ${symbol}`].some((needle) => match.snippet.includes(needle))).map((match) => match.path);
  if (!likely.length && references.length) likely = references.map((match) => match.path).filter((file) => /(^|\/)(src|lib|app|components)\//.test(file)).slice(0, 3);
  const result = { symbol, references, result_count: references.length, likely_definition_files: [...new Set(likely)], evidence_log_id: null };
  const log = await writeEvidenceLog("find_references", result);
  result.evidence_log_id = log.evidence_log_id;
  return result;
}

async function safeDependencyScan(args) {
  const root = await resolveAllowedRoot(args.root || ".");
  const manifests = [];
  const packageFile = path.join(root.absolutePath, "package.json");
  let pkg = null;
  if (existsSync(packageFile)) { pkg = JSON.parse(await readFile(packageFile, "utf8")); manifests.push("package.json"); }
  const scripts = pkg?.scripts || {};
  const safeScripts = [];
  const riskyScripts = [];
  for (const [name, body] of Object.entries(scripts)) {
    const item = { name, command: redactSecrets(String(body)) };
    if (UNSAFE_PACKAGE_SCRIPT_PATTERN.test(name) || UNSAFE_PACKAGE_SCRIPT_PATTERN.test(String(body)) || CONTROL_OPERATOR_PATTERN.test(String(body))) riskyScripts.push({ ...item, risk: "unsafe package/deploy/install/publish/shell-control pattern" });
    else if (SAFE_PACKAGE_SCRIPT_PATTERN.test(name) || DEV_SERVER_SCRIPT_PATTERN.test(name)) safeScripts.push(item);
  }
  const deps = Object.keys(pkg?.dependencies || {});
  const devDeps = Object.keys(pkg?.devDependencies || {});
  const lockfiles = args.include_lockfiles === false ? [] : ["package-lock.json", "npm-shrinkwrap.json", "pnpm-lock.yaml", "yarn.lock", "bun.lockb"].filter((name) => existsSync(path.join(root.absolutePath, name)));
  const result = {
    package_manager: lockfiles.includes("pnpm-lock.yaml") ? "pnpm" : lockfiles.includes("yarn.lock") ? "yarn" : lockfiles.includes("bun.lockb") ? "bun" : pkg ? "npm" : "unknown",
    manifest_files: manifests,
    dependencies_summary: { dependencies: deps, devDependencies: devDeps, dependency_count: deps.length, dev_dependency_count: devDeps.length },
    scripts_summary: args.include_scripts === false ? {} : Object.fromEntries(Object.entries(scripts).map(([k, v]) => [k, redactSecrets(v)])),
    safe_scripts: safeScripts,
    risky_scripts: riskyScripts,
    lockfiles,
    likely_frameworks: detectFrameworks(pkg, []),
    warnings: [pkg ? null : "package.json not found", "No installs or network audit were performed."].filter(Boolean),
    evidence_log_id: null
  };
  const log = await writeEvidenceLog("dependency_scan", result);
  result.evidence_log_id = log.evidence_log_id;
  recordSession(args.session_id, "dependency_scans", result);
  return result;
}






async function safeUiSurfaceReview(args) {
  const root = await resolveAllowedRoot(args.workspace_root || ".");
  const files = [];
  await walkFiles(root.absolutePath, root.absolutePath, files, { maxResults: args.max_files || 220 });
  const maxBytes = Math.min(args.max_bytes_per_file || 5000, 12000);
  const textFiles = [];
  const secretRisks = [];
  for (const file of files) {
    if (isSecretLikePath(file.path) || isSecretLikePath(file.absolutePath || "")) { secretRisks.push(`${file.path}: secret-like path blocked`); continue; }
    if (!/\.(mjs|js|ts|tsx|jsx|json|html|css|scss|sass|vue|svelte|mdx|md)$/i.test(file.path) && !/(^|\/)package\.json$/.test(file.path)) continue;
    try {
      const buf = await readFile(path.join(root.absolutePath, file.path));
      if (buf.includes(0) || looksBinary(buf)) continue;
      textFiles.push({ path: file.path, text: redactSecrets(buf.subarray(0, maxBytes).toString("utf8")) });
    } catch {}
  }
  for (const name of [".env", ".env.local", "secrets", "tokens", "credentials", "cookies", "sessions", ".ssh"]) {
    if (existsSync(path.join(root.absolutePath, name))) secretRisks.push(`${name}: secret/session/private path blocked`);
  }
  const pkgFile = textFiles.find((f) => /(^|\/)package\.json$/.test(f.path));
  const frameworks = new Set();
  if (pkgFile) {
    try {
      const pkg = JSON.parse(pkgFile.text);
      const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
      for (const name of Object.keys(deps)) {
        if (/react|next|vue|svelte|vite|astro|remix|angular|solid|storybook/i.test(name)) frameworks.add(name.replace(/^@[^/]+\//, ""));
      }
    } catch {}
  }
  for (const f of textFiles) {
    if (/vite\.config/i.test(f.path)) frameworks.add("vite");
    if (/next\.config|(^|\/)app\//i.test(f.path)) frameworks.add("next");
  }
  const entryPoints = textFiles.filter((f) => /(^|\/)(index\.html|main|index|app|root)\.(html|[cm]?[jt]sx?)$|(^|\/)package\.json$/.test(f.path)).map((f) => ({ path: f.path })).slice(0, 80);
  const routes = [];
  const components = [];
  const imports = [];
  const jsxUses = [];
  for (const f of textFiles) {
    if (/(^|\/)(routes|pages|app)\//i.test(f.path) || /(?:createBrowserRouter|Route\s+path=|path:\s*["'`/]|router\.(get|post)|href=["'`/])/.test(f.text)) routes.push({ path: f.path, route_hint: routeHintForFile(f.path, f.text) });
    for (const m of f.text.matchAll(/(?:export\s+)?(?:default\s+)?function\s+([A-Z][A-Za-z0-9_]*)\s*\(|(?:export\s+)?const\s+([A-Z][A-Za-z0-9_]*)\s*=\s*(?:\([^)]*\)|[^=;]+)=>|class\s+([A-Z][A-Za-z0-9_]*)\s+extends/g)) components.push({ path: f.path, name: m[1] || m[2] || m[3] });
    for (const m of f.text.matchAll(/import\s+(?:\{\s*([^}]+)\s*\}|([A-Z][A-Za-z0-9_]*))\s+from\s+["'`]([^"'`]+)["'`]/g)) {
      const names = (m[1] ? m[1].split(",").map((x) => x.trim().split(/\s+as\s+/i).pop()) : [m[2]]).filter(Boolean);
      for (const name of names) imports.push({ path: f.path, name, from: m[3] });
    }
    for (const m of f.text.matchAll(/<([A-Z][A-Za-z0-9_]*)\b/g)) jsxUses.push({ path: f.path, name: m[1] });
  }
  const styleFiles = textFiles.filter((f) => /\.(css|scss|sass)$/i.test(f.path)).map((f) => ({ path: f.path })).slice(0, 80);
  const testFiles = textFiles.filter((f) => /(^|\/)(test|tests|__tests__)\/|\.(test|spec)\.[cm]?[jt]sx?$/i.test(f.path)).map((f) => ({ path: f.path })).slice(0, 80);
  const storybook = textFiles.filter((f) => /\.stories\.[cm]?[jt]sx?$|storybook|preview\.[cm]?[jt]s$/i.test(f.path)).map((f) => ({ path: f.path })).slice(0, 40);
  const allText = textFiles.map((f) => f.text).join("\n");
  const usedNames = new Set([...imports.map((i) => i.name), ...jsxUses.map((u) => u.name)]);
  const possibleUnrendered = components.filter((c) => !usedNames.has(c.name) && !/App|Root|Layout|Page/.test(c.name)).map((c) => ({ ...c, reason: "component export not found in bounded import/JSX render path review" })).slice(0, 60);
  const result = {
    workspace_root: root.absolutePath,
    permission_profile: activePermissionProfile.profile_name,
    allowed_roots_check: { inside_allowed_roots: true, matched_root: root.root, allowed_roots: allowedRoots },
    detected_frameworks: [...frameworks].slice(0, 20),
    routes_found: routes.slice(0, 80),
    components_found: components.slice(0, 120),
    entry_points_found: entryPoints,
    render_paths_found: [...jsxUses.map((u) => ({ path: u.path, renders: u.name })), ...imports.map((i) => ({ path: i.path, imports: i.name, from: i.from }))].slice(0, 160),
    style_files_found: styleFiles,
    test_files_found: testFiles,
    storybook_or_preview_found: storybook,
    possible_unrendered_components: possibleUnrendered,
    possible_dead_ui: possibleUnrendered.map((c) => ({ ...c, reason: "possible dead UI: no obvious route/caller renders this component" })).slice(0, 60),
    missing_state_coverage: [!/loading|spinner|pending/i.test(allText) ? "loading/pending state coverage not found in bounded UI review" : null, !/error|failure|invalid/i.test(allText) ? "error/failure state coverage not found in bounded UI review" : null, !/empty|no data|zero state/i.test(allText) ? "empty/no-data state coverage not found in bounded UI review" : null].filter(Boolean),
    accessibility_risk_hints: buildUiA11yHints(allText),
    security_or_secret_risks: secretRisks,
    evidence_log_id: null,
    safe_to_claim: ["Bounded local UI source review ran under allowed roots with secret-like paths skipped.", "Framework/route/component/render-path findings are static hints, not browser visual proof."],
    must_not_claim: ["Real browser visual proof was captured.", "The UI is fully visually verified.", "Every component is rendered or dead-code-free.", "Secret paths were read.", "Network/package/install/GitHub/deploy actions occurred."]
  };
  const log = await writeEvidenceLog("ui_surface_review", result);
  result.evidence_log_id = log.evidence_log_id;
  recordSession(args.session_id, "ui_surface_reviews", result);
  return result;
}

function routeHintForFile(filePath, text) {
  const match = String(text).match(/(?:path\s*[:=]\s*|href=)["'`]([^"'`]+)["'`]/);
  if (match) return match[1];
  return filePath.replace(/\\/g, "/").replace(/.*\/(routes|pages|app)\/?/, "/").replace(/\.(jsx|tsx|js|ts|mjs|mdx)$/, "").replace(/index$/, "") || "/";
}

function buildUiA11yHints(text) {
  const hints = [];
  if (/<button\b/i.test(text) && !/(aria-label|>\s*[^<\s])/.test(text)) hints.push("button accessibility label/text may need review");
  if (/<img\b/i.test(text) && !/alt=/.test(text)) hints.push("image alt text may be missing");
  if (/<input\b/i.test(text) && !/(<label|aria-label|aria-labelledby)/i.test(text)) hints.push("form labels may be missing");
  if (!/(aria-|role=|<label|alt=|tabIndex|onKeyDown|keyboard|focus)/i.test(text)) hints.push("accessibility/ARIA/keyboard/focus evidence not obvious in bounded UI review");
  return hints.length ? hints : ["No obvious static accessibility issue found, but browser/a11y audit evidence is still required for accessibility claims."];
}

function safeBrowserEvidencePlan(args) {
  const appUrl = String(args.app_url || "");
  const routes = arrayify(args.routes).map(String).filter(Boolean);
  const flow = arrayify(args.user_flow).map(String).filter(Boolean);
  const claimType = String(args.claim_type || "visual_improvement");
  const viewportInputs = arrayify(args.viewports);
  const viewports = normalizeViewports(viewportInputs.length ? viewportInputs : ["mobile", "tablet", "desktop"]);
  const states = arrayify(args.states_to_check).map(String).filter(Boolean);
  const isLocal = !appUrl || /^(https?:\/\/)?(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?\b/i.test(appUrl) || /^file:/i.test(appUrl);
  const riskNotes = [];
  if (!isLocal) riskNotes.push("Non-localhost/non-file app_url requires approved URL policy; do not use private/login/account flows by default.");
  if (/login|account|private|cookie|session|token/i.test(`${appUrl} ${routes.join(" ")} ${flow.join(" ")}`)) riskNotes.push("Login/private/session/cookie flows are out of scope for automatic browser evidence.");
  return {
    app_url: redactUrlString(appUrl),
    routes_to_visit: routes.length ? routes : ["provide exact local route(s) before capture"],
    user_flow_steps: flow.length ? flow : ["load route", "verify target visible text/DOM", "exercise one user-visible action if relevant"],
    screenshots_needed: ["before screenshot for visual/layout/regression claims", "after screenshot for each changed route", ...viewports.map((v) => `after screenshot at ${v.label || v.viewport || JSON.stringify(v)} viewport`)],
    dom_checks_needed: ["route title/heading visible", "target component visible text/selector present", "primary button/form/action present", "state-specific text for loading/empty/error/success when relevant"],
    console_checks_needed: ["capture console errors/warnings after route load", "capture console after user-flow steps", "unknown console status blocks browser-works claims"],
    network_checks_needed: ["capture failed API/asset requests after route load", "capture network after user-flow steps", "unknown network status blocks browser-works claims"],
    accessibility_checks_needed: ["run vnem_tools_browser_accessibility_audit or equivalent", "check labels/alt/headings/keyboard/focus risks"],
    viewports,
    states_to_force_or_verify: states.length ? states : ["loading", "empty", "error", "success/normal"],
    before_after_plan: ["capture/store before evidence before UI changes when possible", "capture after evidence on same route/viewports", "compare before/after snapshots and avoid claiming pixel-perfect visual regression unless screenshot evidence supports it"],
    risk_notes: riskNotes,
    existing_tools_to_use: ["vnem_tools_start_dev_server", "vnem_tools_browser_interaction_run", "vnem_tools_browser_evidence_compare", "vnem_tools_browser_capture", "vnem_tools_browser_page_inspect", "vnem_tools_browser_accessibility_audit", "vnem_tools_browser_compare_snapshots", "vnem_tools_ui_evidence_audit", "vnem_tools_collect_evidence"],
    permission_profile: activePermissionProfile.profile_name,
    requires_localhost_or_approved_url: true,
    browser_was_run: false,
    must_not_claim: ["This tool ran browser automation.", "This tool captured screenshots.", "The UI works in browser before existing browser tools collect evidence.", "Private/login/session/cookie/CAPTCHA flows were automated."]
  };
}

function normalizeViewports(values) {
  const presets = { mobile: { label: "mobile", width: 390, height: 844 }, tablet: { label: "tablet", width: 768, height: 1024 }, desktop: { label: "desktop", width: 1440, height: 900 } };
  return values.map((value) => {
    if (typeof value === "string") return presets[value.toLowerCase()] || { label: value, note: "custom viewport label; provide dimensions before capture" };
    return value && typeof value === "object" ? value : { label: String(value) };
  });
}

async function safeBrowserEvidenceRun(args) {
  const plan = args.browser_evidence_plan && typeof args.browser_evidence_plan === "object" ? args.browser_evidence_plan : {};
  const appUrl = String(args.app_url || plan.app_url || "").trim();
  const routes = normalizeEvidenceRoutes(appUrl, arrayify(args.routes).length ? args.routes : plan.routes_to_visit || plan.routes || []);
  const flow = arrayify(args.user_flow).length ? arrayify(args.user_flow).map(String) : arrayify(plan.user_flow_steps || plan.user_flow).map(String);
  const viewports = normalizeViewports(arrayify(args.viewports).length ? args.viewports : plan.viewports || ["desktop"]);
  const states = [...new Set([...(arrayify(args.states_to_check).map(String)), ...(arrayify(plan.states_to_force_or_verify).map(String))].filter(Boolean))];
  const claimType = String(args.claim_type || plan.claim_type || "visual_improvement");
  const dryRun = args.dry_run !== false;
  const base = makeBrowserEvidenceRunBase({ appUrl, routes, flow, viewports, states, claimType, args, dryRun });
  const blocked = [];
  const privateText = `${appUrl} ${routes.join(" ")} ${flow.join(" ")}`;
  if (!appUrl) blocked.push({ code: "app_url_required", reason: "Provide app_url for bounded browser evidence execution." });
  if (/login|sign[ -]?in|account|private|cookie|session|browser profile|password|credential/i.test(privateText)) blocked.push({ code: "login_private_flow_blocked", reason: "Login/private/account/cookie/session/browser-profile flows are not automated." });
  for (const urlText of routes.length ? routes : [appUrl]) {
    try {
      const url = new URL(urlText);
      if (containsRawSecret(url.toString())) blocked.push({ code: "raw_secret_blocked", url: redactUrlString(url.toString()) });
      if (url.username || url.password) blocked.push({ code: "credentialed_url_blocked", url: redactUrlString(url.toString()) });
      if (!isLocalBrowserEvidenceUrl(url)) blocked.push({ code: "external_url_blocked", url: redactUrlString(url.toString()), reason: "Browser evidence run is limited to localhost/127.0.0.1/[::1] URLs in this build; use direct page tools for explicitly approved sources." });
    } catch { blocked.push({ code: "invalid_url", url: redactSecrets(urlText) }); }
  }
  if (routes.some((route) => { try { return isLocalBrowserEvidenceUrl(new URL(route)); } catch { return false; } }) && process.env.VNEM_TOOLS_ALLOW_LOCALHOST !== "1") {
    blocked.push({ code: "localhost_policy_disabled", reason: "Set VNEM_TOOLS_ALLOW_LOCALHOST=1 to allow approved localhost browser evidence execution." });
  }
  const preview = actionPolicyPreview({ action_type: "browser_capture", proposed_action: routes.join(" ") || appUrl });
  if (!dryRun && !preview.allowed) blocked.push({ code: "permission_profile_blocked", reason: preview.reason, action_policy_preview: preview });
  if (!dryRun && preview.requires_approval && (args.approved !== true || !String(args.approval_note || "").trim())) blocked.push({ code: "approval_required", reason: "Browser evidence execution requires dry_run=false, approved=true, and non-empty approval_note." });
  if (dryRun || blocked.length) {
    const result = { ...base, status: blocked.length ? "blocked" : "dry_run", failures_or_blockers: blocked, action_policy_preview: preview, localhost_policy: localhostEvidencePolicy(blocked), safe_to_claim: false, must_not_claim: browserEvidenceRunMustNotClaim(false, blocked) };
    if (blocked.length) {
      const log = await writeEvidenceLog("browser_evidence_run", result);
      result.evidence_log_id = log.evidence_log_id;
      recordSession(args.session_id, "browser_evidence_runs", result);
    }
    return decorateToolResult("vnem_tools_browser_evidence_run", result, { capability_group: "ui_web_quality", network: true, requires_approval: true });
  }

  const screenshots = [];
  const inspections = [];
  const a11yAudits = [];
  const blockers = [];
  for (const routeUrl of routes) {
    try {
      const inspection = await safeBrowserPageInspect({ url: routeUrl, dry_run: false, approved: true, approval_note: args.approval_note || "approved browser evidence route inspection", max_bytes: 16000, session_id: args.session_id });
      inspections.push(summarizePageInspectionForEvidence(routeUrl, inspection));
    } catch (error) {
      blockers.push({ route: redactSecrets(routeUrl), code: error.code || "page_inspect_failed", reason: error.message });
    }
    try {
      const audit = await safeBrowserAccessibilityAudit({ url: routeUrl, dry_run: false, approved: true, approval_note: args.approval_note || "approved browser evidence accessibility audit", max_bytes: 16000, session_id: args.session_id });
      a11yAudits.push({ route: redactSecrets(routeUrl), status: "checked", score: audit.score, issues: audit.issues || [], warnings: audit.warnings || [], evidence_log_id: audit.evidence_log_id });
    } catch (error) {
      blockers.push({ route: redactSecrets(routeUrl), code: error.code || "accessibility_audit_failed", reason: error.message });
    }
    for (const viewport of viewports) {
      try {
        const capture = await safeBrowserCapture({ url: routeUrl, dry_run: false, approved: true, approval_note: args.approval_note || "approved browser evidence screenshot capture", viewport_width: Number(viewport.width || 1280), viewport_height: Number(viewport.height || 720), wait_ms: args.wait_ms ?? 500, full_page: true, session_id: args.session_id });
        screenshots.push({ route: redactSecrets(routeUrl), viewport: viewport.label || viewport.viewport || `${viewport.width}x${viewport.height}`, status: capture.status, captured: capture.captured === true, screenshot_path: capture.screenshot_path, screenshot_sha256: capture.screenshot_sha256, screenshot_bytes: capture.screenshot_bytes, evidence_log_id: capture.evidence_log_id, browser_runtime_status: capture.browser_runtime_status, must_not_claim: capture.must_not_claim || [] });
        if (capture.status !== "captured") blockers.push({ route: redactSecrets(routeUrl), viewport: viewport.label || viewport.viewport || `${viewport.width}x${viewport.height}`, code: capture.status || "browser_capture_failed", reason: capture.browser_runtime_status || "screenshot not captured" });
      } catch (error) {
        blockers.push({ route: redactSecrets(routeUrl), viewport: viewport.label || viewport.viewport || `${viewport.width}x${viewport.height}`, code: error.code || "browser_capture_failed", reason: error.message });
      }
    }
  }
  const capturedScreenshots = screenshots.filter((item) => item.captured && item.screenshot_path);
  const expectedScreenshotCount = routes.length * viewports.length;
  const browserWasRun = capturedScreenshots.length > 0;
  const allScreenshotsCaptured = expectedScreenshotCount > 0 && capturedScreenshots.length === expectedScreenshotCount;
  const networkFailures = inspections.filter((item) => item.fetch_status && (item.fetch_status < 200 || item.fetch_status >= 400)).map((item) => ({ route: item.route, status: item.fetch_status }));
  const consoleSummary = { status: "unavailable_not_collected_by_current_headless_capture", errors: null, warnings: null, available: false, note: "Current browser capture path uses a bounded headless screenshot command and does not expose runtime console events." };
  const networkSummary = inspections.length && !networkFailures.length ? { status: "clean", failures: [], checked_routes: inspections.map((item) => ({ route: item.route, status: item.fetch_status || "unknown" })), note: "Route HTML fetches completed; subresource waterfall is not captured by current runtime." } : { status: inspections.length ? "failed_or_partial" : "unavailable", failures: networkFailures, checked_routes: inspections.map((item) => ({ route: item.route, status: item.fetch_status || "unknown" })) };
  const accessibilitySummary = a11yAudits.length ? { status: "checked", routes_checked: a11yAudits.length, issue_count: a11yAudits.reduce((sum, item) => sum + item.issues.length, 0), audits: a11yAudits } : { status: "unavailable", routes_checked: 0, issue_count: null, audits: [] };
  const viewportCoverage = viewports.map((viewport) => {
    const label = viewport.label || viewport.viewport || `${viewport.width}x${viewport.height}`;
    const captures = screenshots.filter((item) => item.viewport === label);
    return { viewport: label, width: viewport.width || null, height: viewport.height || null, status: captures.length && captures.every((item) => item.captured) ? "passed" : captures.some((item) => item.captured) ? "partial" : "not_captured", routes_checked: captures.map((item) => item.route) };
  });
  const stateCoverage = states.map((state) => ({ state, status: inspections.some((item) => JSON.stringify(item).toLowerCase().includes(String(state).toLowerCase())) ? "observed_in_page_text_or_metadata" : "not_forced_or_not_observed" }));
  const beforeAfter = { status: args.before_label && args.after_label ? "metadata_recorded_requires_matching_before_after_screenshots" : "not_provided", before_label: args.before_label || null, after_label: args.after_label || null, comparison_note: "This evidence run records before/after labels and screenshot metadata; it does not invent a prior baseline if no before screenshot exists." };
  const safe = allScreenshotsCaptured && inspections.length === routes.length && networkSummary.status === "clean" && accessibilitySummary.status === "checked" && consoleSummary.status === "clean";
  const result = {
    ...base,
    status: blockers.length ? (browserWasRun ? "partial" : "blocked") : "completed",
    browser_was_run: browserWasRun,
    routes_checked: routes.map((route) => ({ route: routePathForEvidence(route), url: redactSecrets(route), status: inspections.some((item) => item.url === redactSecrets(route)) ? "checked" : "not_checked" })),
    user_flow_steps_attempted: flow,
    viewports_checked: viewportCoverage,
    states_checked: stateCoverage,
    screenshots,
    dom_or_page_inspection: inspections,
    console_summary: consoleSummary,
    network_summary: networkSummary,
    accessibility_summary: accessibilitySummary,
    before_after_comparison: beforeAfter,
    viewport_coverage: viewportCoverage,
    state_coverage: stateCoverage,
    failures_or_blockers: blockers,
    localhost_policy: localhostEvidencePolicy(blockers),
    safe_to_claim: safe,
    must_not_claim: browserEvidenceRunMustNotClaim(safe, blockers, { consoleSummary, allScreenshotsCaptured })
  };
  const log = await writeEvidenceLog("browser_evidence_run", result);
  result.evidence_log_id = log.evidence_log_id;
  recordSession(args.session_id, "browser_evidence_runs", result);
  return decorateToolResult("vnem_tools_browser_evidence_run", result, { capability_group: "ui_web_quality", network: true, requires_approval: true });
}

function makeBrowserEvidenceRunBase({ appUrl, routes, flow, viewports, states, claimType, args, dryRun }) {
  return {
    browser_was_run: false,
    app_url: redactSecrets(appUrl),
    claim_type: claimType,
    routes_checked: routes.map((route) => ({ route: routePathForEvidence(route), url: redactSecrets(route), status: dryRun ? "planned" : "pending" })),
    user_flow_steps_attempted: flow,
    viewports_checked: viewports.map((viewport) => ({ viewport: viewport.label || viewport.viewport || `${viewport.width || "?"}x${viewport.height || "?"}`, width: viewport.width || null, height: viewport.height || null, status: dryRun ? "planned" : "pending" })),
    states_checked: states.map((state) => ({ state, status: dryRun ? "planned" : "pending" })),
    screenshots: [],
    dom_or_page_inspection: [],
    console_summary: { status: dryRun ? "planned" : "unknown" },
    network_summary: { status: dryRun ? "planned" : "unknown" },
    accessibility_summary: { status: dryRun ? "planned" : "unknown" },
    before_after_comparison: { status: args.before_label || args.after_label ? "planned" : "not_provided", before_label: args.before_label || null, after_label: args.after_label || null },
    failures_or_blockers: [],
    permission_profile: activePermissionProfile.profile_name,
    localhost_policy: localhostEvidencePolicy([]),
    evidence_log_id: null,
    safe_to_claim: false,
    must_not_claim: browserEvidenceRunMustNotClaim(false, [])
  };
}

function normalizeEvidenceRoutes(appUrl, rawRoutes) {
  const base = appUrl ? new URL(appUrl) : null;
  const inputs = arrayify(rawRoutes).map(String).filter((route) => route && !/provide exact/i.test(route));
  if (!inputs.length && appUrl) return [base.toString()];
  return inputs.map((route) => {
    try {
      if (/^https?:\/\//i.test(route)) return new URL(route).toString();
      if (!base) return route;
      if (route.startsWith("/")) return new URL(route, `${base.protocol}//${base.host}`).toString();
      return new URL(route, base).toString();
    } catch { return route; }
  }).slice(0, 8);
}

function isLocalBrowserEvidenceUrl(url) {
  return ["localhost", "127.0.0.1", "::1"].includes(url.hostname) && ["http:", "https:"].includes(url.protocol);
}

function localhostEvidencePolicy(blockers) {
  const enabled = process.env.VNEM_TOOLS_ALLOW_LOCALHOST === "1";
  const localBlocked = blockers.some((item) => item.code === "localhost_policy_disabled");
  return { enabled, required_for_localhost: true, host_policy: "localhost/127.0.0.1/[::1] only; no login/cookie/session/CAPTCHA automation", reason: localBlocked ? "VNEM_TOOLS_ALLOW_LOCALHOST=1 is required for localhost browser evidence execution." : enabled ? "localhost browser evidence execution enabled for approved bounded routes" : "localhost execution disabled unless dry-run or non-executing plan" };
}

function summarizePageInspectionForEvidence(routeUrl, inspection) {
  return { route: routePathForEvidence(routeUrl), url: redactSecrets(routeUrl), status: inspection.executed ? "checked" : "not_executed", source_type: inspection.source_type, title: inspection.title || "", headings: (inspection.headings || []).map((h) => h.text || h).slice(0, 8), main_text_excerpt: inspection.main_text_excerpt || "", links_count: inspection.links_count || 0, forms_count: inspection.forms_count || 0, buttons_count: inspection.buttons_count || 0, risk_flags: inspection.risk_flags || [], quality_flags: inspection.quality_flags || [], fetch_status: inspection.fetched?.status || null, evidence_log_id: inspection.evidence_log_id };
}

function routePathForEvidence(routeUrl) {
  try { const url = new URL(routeUrl); return `${url.pathname}${url.search}` || "/"; } catch { return routeUrl; }
}

function browserEvidenceRunMustNotClaim(safe, blockers = [], details = {}) {
  if (safe) return ["Do not generalize browser proof beyond the exact routes, user-flow steps, viewports, and states in this evidence run."];
  return [
    "Complete browser proof was collected.",
    "Visual proof is complete for the UI claim.",
    "The UI works in browser with clean console/network status.",
    details.consoleSummary?.status !== "clean" ? "Console status is clean." : null,
    details.allScreenshotsCaptured === false ? "Every required screenshot was captured." : null,
    blockers.some((item) => /login|cookie|session|captcha/i.test(JSON.stringify(item))) ? "Login/private/cookie/session/CAPTCHA flow was automated." : null
  ].filter(Boolean);
}

function formatBrowserEvidenceRun(result) {
  return [`vnem_tools_browser_evidence_run: ${result.status}`, `Browser was run: ${result.browser_was_run}`, `Routes: ${result.routes_checked.length}`, `Screenshots: ${result.screenshots.filter((item) => item.captured).length}/${result.screenshots.length}`, `Safe to claim: ${result.safe_to_claim}`, `Evidence: ${result.evidence_log_id || "not written"}`].join("\n");
}

function formatBrowserInteraction(result) {
  return [
    `vnem_tools_browser_interaction_run: ${result.status || result.operation_result}`,
    `Browser was run: ${result.browser_was_run === true}`,
    `Scenarios: ${result.counts ? `${result.counts.passed}/${result.counts.planned}` : `0/${result.scenario_count || 0}`}`,
    `Screenshots: ${result.screenshots?.length || 0}`,
    `Console/network: ${result.console_summary?.status || "not run"}/${result.network_summary?.status || "not run"}`,
    `Safe to claim: ${result.safe_to_claim === true}`,
    `Evidence: ${result.evidence_path || "not written"}`
  ].join("\n");
}

function formatBrowserEvidenceCompare(result) {
  return [
    `vnem_tools_browser_evidence_compare: ${result.operation_result}`,
    `Matching/unmatched: ${result.matching_items}/${result.unmatched_items}`,
    `Visual changes: ${result.visual_changes}`,
    `DOM/accessibility changes: ${result.dom_changes}/${result.accessibility_changes}`
  ].join("\n");
}

function safeUiEvidenceAudit(args) {
  const claim = String(args.claim || "");
  const hay = claim.toLowerCase();
  const run = normalizeBrowserEvidenceRunForAudit(args.browser_evidence_run);
  const screenshots = [...arrayify(args.screenshots), ...run.screenshots];
  const dom = [...arrayify(args.dom_assertions), ...run.dom_assertions];
  const viewportResults = [...arrayify(args.viewport_results), ...run.viewport_results];
  const stateResults = [...arrayify(args.state_results), ...run.state_results];
  const routeEvidence = [...arrayify(args.route_render_evidence), ...run.route_render_evidence];
  const consoleSummary = args.console_summary ?? run.console_summary;
  const networkSummary = args.network_summary ?? run.network_summary;
  const accessibilitySummary = args.accessibility_summary ?? run.accessibility_summary;
  const beforeAfter = args.before_after ?? run.before_after;
  const consoleClean = summaryClean(consoleSummary);
  const networkClean = summaryClean(networkSummary);
  const a11yChecked = summaryChecked(accessibilitySummary);
  const beforeAfterPresent = Boolean(beforeAfter && Object.keys(beforeAfter || {}).length && !/not_provided|missing/.test(String(beforeAfter.status || ""))) || screenshots.some((s) => /before/i.test(JSON.stringify(s))) && screenshots.some((s) => /after/i.test(JSON.stringify(s)));
  const viewportLabels = new Set(viewportResults.map((v) => String(v?.viewport || v?.label || v).toLowerCase()));
  const responsiveCovered = viewportResults.length >= 2 && (viewportLabels.has("mobile") || [...viewportLabels].some((v) => /390|375|mobile/.test(v))) && (viewportLabels.has("desktop") || [...viewportLabels].some((v) => /1280|1440|desktop/.test(v)));
  const stateNames = stateResults.map((s) => String(s?.state || s?.name || s).toLowerCase()).join(" ");
  const stateCovered = ["loading", "empty", "error"].every((name) => stateNames.includes(name));
  const needsResponsive = /responsive|mobile|tablet|viewport/.test(hay);
  const needsA11y = /accessibility|a11y|aria|keyboard|contrast/.test(hay);
  const needsBeforeAfter = /visual|layout|improved|fix|before|after|responsive/.test(hay);
  const missing = [];
  if (!screenshots.length) missing.push("screenshot missing for visual/browser UI claim");
  if (!dom.length) missing.push("DOM/visible text assertion missing");
  if (!routeEvidence.length) missing.push("route/component render evidence missing");
  if (!consoleClean) missing.push("console clean/error status missing or not clean");
  if (!networkClean) missing.push("network clean/error status missing or not clean");
  if (needsA11y && !a11yChecked) missing.push("accessibility audit evidence missing");
  if (needsResponsive && !responsiveCovered) missing.push("responsive claim needs multiple viewport evidence including mobile and desktop");
  if (needsBeforeAfter && !beforeAfterPresent) missing.push("before/after proof missing for visual/layout claim");
  if (/loading|empty|error|state|dashboard|form/.test(hay) && !stateCovered) missing.push("loading/empty/error state coverage missing or incomplete");
  const visualSupported = screenshots.length > 0 && dom.length > 0 && consoleClean && networkClean;
  const routeWired = routeEvidence.length > 0;
  const safe = missing.length === 0;
  let verdict = safe ? "accept_supported" : missing.some((m) => /screenshot missing|console|network|route/.test(m)) ? "reject" : "revise";
  return {
    verdict,
    evidence_strength: run.present ? (safe ? "strong_browser_evidence_run" : run.browser_was_run ? "browser_evidence_run_with_gaps" : "browser_evidence_run_blocked_or_incomplete") : safe ? "strong" : visualSupported ? "medium_with_gaps" : screenshots.length || dom.length ? "low" : "none",
    browser_evidence_run_status: run.present ? (run.browser_was_run ? "completed_or_partial_browser_execution" : "blocked_or_not_run") : "not_provided",
    missing_evidence: missing,
    visual_claim_supported: visualSupported,
    route_or_component_wired: routeWired,
    console_network_status: consoleClean && networkClean ? "clean" : "unknown_or_failed",
    accessibility_status: a11yChecked ? "checked" : "unknown_or_missing",
    responsive_status: responsiveCovered ? "covered_multiple_viewports" : viewportResults.length ? "insufficient_viewport_coverage" : "unknown_no_viewport_evidence",
    state_coverage_status: stateCovered ? "covered_loading_empty_error" : stateResults.length ? "partial_state_coverage" : "unknown_no_state_evidence",
    before_after_status: beforeAfterPresent ? "present" : "missing",
    safe_to_claim: safe,
    must_not_claim: safe ? ["Do not generalize beyond the provided routes/viewports/states."] : ["UI improved/works visually.", "Responsive across devices.", "Accessibility improved.", "Browser works with clean console/network.", "Component is rendered by a route."],
    next_best_check: missing[0] || "Attach evidence to final report and run relevant broader check near final."
  };
}

function normalizeBrowserEvidenceRunForAudit(run) {
  if (!run || typeof run !== "object") return { present: false, browser_was_run: false, screenshots: [], dom_assertions: [], viewport_results: [], state_results: [], route_render_evidence: [], console_summary: undefined, network_summary: undefined, accessibility_summary: undefined, before_after: undefined };
  const interactionScenarios = arrayify(run.scenarios);
  const screenshots = arrayify(run.screenshots).filter((item) => item && (item.path || item.screenshot_path || item.captured || item.status === "captured"));
  const interactionDom = interactionScenarios.flatMap((scenario) => [scenario.before?.dom, scenario.after?.dom].filter(Boolean).map((snapshot) => `${scenario.url || scenario.name || "route"} ${snapshot.title || ""} ${arrayify(snapshot.headings).map((heading) => heading.text || "").join(" ")} ${snapshot.text || ""}`.trim()));
  const dom = [...arrayify(run.dom_or_page_inspection).map((item) => typeof item === "string" ? item : `${item.route || "route"} ${item.title || ""} ${(item.headings || []).join?.(" ") || ""} ${item.main_text_excerpt || ""}`.trim()), ...interactionDom].filter(Boolean);
  const routes = [...arrayify(run.routes_checked).filter((item) => item && !/not_checked|failed|blocked/i.test(String(item.status || ""))), ...interactionScenarios.filter((scenario) => scenario.status === "passed").map((scenario) => ({ route: scenario.url || scenario.name, status: scenario.status }))];
  return {
    present: true,
    browser_was_run: run.browser_was_run === true,
    screenshots,
    dom_assertions: dom,
    viewport_results: arrayify(run.viewport_coverage || run.viewports_checked),
    state_results: arrayify(run.state_coverage || run.states_checked),
    route_render_evidence: routes.length ? routes : dom.map((item) => ({ route: "unknown", status: "checked", evidence: item })),
    console_summary: run.console_summary,
    network_summary: run.network_summary,
    accessibility_summary: run.accessibility_summary,
    before_after: run.before_after_comparison || run.before_after
  };
}

function summaryClean(summary) {
  if (!summary) return false;
  if (typeof summary === "object") {
    const status = String(summary.status || summary.verdict || "").toLowerCase();
    const errors = Array.isArray(summary.errors) ? summary.errors : [];
    const failures = Array.isArray(summary.failures) ? summary.failures : [];
    if (/clean|passed|ok|success/.test(status) && errors.length === 0 && failures.length === 0) return true;
  }
  const text = JSON.stringify(summary).toLowerCase();
  const sanitized = text.replace(/"errors"\s*:\s*\[\]/g, "").replace(/"failures"\s*:\s*\[\]/g, "");
  return /clean|passed|no errors|no failures|0 errors|ok/.test(sanitized) && !/unknown|failed|failure|error\b/.test(sanitized);
}
function summaryChecked(summary) {
  if (!summary) return false;
  const text = JSON.stringify(summary).toLowerCase();
  return /checked|audit|passed|clean|issues/.test(text) && !/unknown|not run|missing/.test(text);
}

function formatUiSurfaceReview(result) {
  return [`Workspace: ${result.workspace_root}`, `Frameworks: ${result.detected_frameworks.join(", ") || "unknown"}`, `Routes: ${result.routes_found.length}`, `Components: ${result.components_found.length}`, `Possible unrendered: ${result.possible_unrendered_components.length}`].join("\n");
}
function formatBrowserEvidencePlan(result) {
  return [`Browser evidence plan for ${result.app_url || "local app"}`, `Routes: ${result.routes_to_visit.join("; ")}`, `Viewports: ${result.viewports.map((v) => v.label || v.viewport || JSON.stringify(v)).join(", ")}`, `Browser was run: ${result.browser_was_run}`].join("\n");
}
function formatUiEvidenceAudit(result) {
  return [`Verdict: ${result.verdict}`, `Evidence strength: ${result.evidence_strength}`, `Safe to claim: ${result.safe_to_claim}`, `Next: ${result.next_best_check}`].join("\n");
}

async function safeArchitectureReview(args) {
  const root = await resolveAllowedRoot(args.workspace_root || ".");
  const files = [];
  await walkFiles(root.absolutePath, root.absolutePath, files, { maxResults: args.max_files || 220 });
  const maxBytes = Math.min(args.max_bytes_per_file || 5000, 12000);
  const textFiles = [];
  const secretRisks = [];
  for (const file of files) {
    if (isSecretLikePath(file.path) || isSecretLikePath(file.absolutePath || "")) { secretRisks.push(`${file.path}: secret-like path blocked`); continue; }
    if (!/\.(mjs|js|ts|tsx|jsx|json|md|yaml|yml|toml|html|css)$/i.test(file.path) && !/(^|\/)package\.json$/.test(file.path)) continue;
    try {
      const buf = await readFile(path.join(root.absolutePath, file.path));
      if (buf.includes(0) || looksBinary(buf)) continue;
      textFiles.push({ path: file.path, text: redactSecrets(buf.subarray(0, maxBytes).toString("utf8")) });
    } catch {}
  }
  for (const name of [".env", ".env.local", "secrets", "tokens", "credentials", "cookies", "sessions", ".ssh"]) {
    if (existsSync(path.join(root.absolutePath, name))) secretRisks.push(`${name}: secret/session/private path blocked`);
  }
  const byPath = (re) => textFiles.filter((f) => re.test(f.path)).map((f) => ({ path: f.path })).slice(0, 80);
  const packageScripts = [];
  const pkg = textFiles.find((f) => /(^|\/)package\.json$/.test(f.path));
  if (pkg) {
    try {
      const parsed = JSON.parse(pkg.text);
      for (const [name, command] of Object.entries(parsed.scripts || {})) packageScripts.push({ name, command: redactSecrets(String(command)), risk: /deploy|publish|install|wrangler|netlify|vercel|rm -rf/i.test(String(command)) ? "mutation_or_deploy_script" : "local_script" });
    } catch {}
  }
  const registries = [];
  for (const f of textFiles) {
    const matches = [...f.text.matchAll(/registerTool\(["'`]([^"'`]+)["'`]|app\.(get|post|put|delete)\(["'`]([^"'`]+)["'`]|router\.(get|post|put|delete)\(["'`]([^"'`]+)["'`]/g)].slice(0, 20);
    for (const m of matches) registries.push({ path: f.path, registry: m[1] || m[3] || "route", snippet: truncate(m[0], 180) });
  }
  const exportedToolLikes = [];
  for (const f of textFiles) {
    const matches = [...f.text.matchAll(/(?:export\s+)?function\s+(vnem_tools_[A-Za-z0-9_]+|[A-Za-z0-9_]*tool[A-Za-z0-9_]*)|const\s+(vnem_tools_[A-Za-z0-9_]+)\s*=/gi)].slice(0, 40);
    for (const m of matches) exportedToolLikes.push({ path: f.path, name: m[1] || m[2] });
  }
  const registeredNames = new Set(registries.map((r) => r.registry));
  const possibleParallel = exportedToolLikes.filter((item) => !registeredNames.has(item.name) && !textFiles.some((f) => f.path !== item.path && f.text.includes(item.name))).map((item) => ({ ...item, reason: "tool-like implementation not found in registry/callers; possible unregistered parallel fake system" })).slice(0, 40);
  const possibleDead = [];
  for (const f of textFiles) {
    const defs = [...f.text.matchAll(/(?:export\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(|const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:\([^)]*\)|async\s*\([^)]*\))\s*=>/g)].slice(0, 80);
    for (const m of defs) {
      const name = m[1] || m[2];
      if (!name || name.length < 5) continue;
      const refs = textFiles.reduce((n, other) => n + (other.text.match(new RegExp(`\\b${escapeRegex(name)}\\b`, "g")) || []).length, 0);
      if (refs <= 1 || /^unused|.*Unused|helperUnused|.*DeadCode/.test(name)) possibleDead.push({ path: f.path, symbol: name, reason: "defined with no obvious cross-file/caller reference in bounded review" });
    }
  }
  const configFiles = byPath(/(^|\/)(package\.json|tsconfig\.json|vite\.config|next\.config|eslint|\.github|wrangler|netlify|vercel|docker|compose)/i);
  const testsFound = byPath(/(^|\/)(test|tests|__tests__)\/|\.(test|spec)\.[cm]?[jt]sx?$/i);
  const entryPoints = byPath(/(^|\/)(package\.json|index|main|app|server|cli)\.(json|mjs|js|ts|tsx|jsx)$/i);
  const result = {
    workspace_root: root.absolutePath,
    permission_profile: activePermissionProfile.profile_name,
    allowed_roots_check: { inside_allowed_roots: true, matched_root: root.root, allowed_roots: allowedRoots },
    entry_points_found: entryPoints,
    tool_or_route_registries_found: registries,
    package_scripts_found: packageScripts,
    tests_found: testsFound,
    config_files_found: configFiles,
    likely_integration_points: [registries.length ? "MCP tool registry / route registry entries" : null, packageScripts.length ? "package script entrypoints" : null, testsFound.length ? "existing targeted tests" : null, entryPoints.length ? "application/server entrypoints" : null].filter(Boolean),
    possible_parallel_fake_systems: possibleParallel,
    possible_dead_code: possibleDead.slice(0, 60),
    possible_duplicate_logic: detectDuplicateLogicHints(textFiles),
    contract_change_risks: ["MCP tool schema/structuredContent contract", "package script command contract", "route/API JSON contract", "caller/test update required for output shape changes"],
    security_or_secret_risks: secretRisks,
    evidence_log_id: null,
    safe_to_claim: ["Reviewed bounded local project metadata and capped source snippets under allowed roots.", "Findings are warnings for integration/dead-code risk, not a full static-analysis proof."],
    must_not_claim: ["Project is fully wired or dead-code-free.", "All contracts are safe without caller/test evidence.", "Secret paths were read.", "Network/package/GitHub/deploy actions occurred."]
  };
  const log = await writeEvidenceLog("architecture_review", result);
  result.evidence_log_id = log.evidence_log_id;
  recordSession(args.session_id, "architecture_reviews", result);
  return result;
}

async function safeDebugEvidence(args) {
  const root = await resolveAllowedRoot(args.workspace_root || ".");
  const logsChecked = [];
  const logsMissing = [];
  const maxBytes = Math.min(args.max_log_bytes || 5000, 16000);
  for (const raw of arrayify(args.log_paths).map(String)) {
    try {
      const target = await resolveAllowedFile(path.isAbsolute(raw) ? raw : path.join(root.absolutePath, raw), { mustExist: true, blockSecrets: true });
      const buf = await readFile(target.absolutePath);
      if (buf.includes(0) || looksBinary(buf)) throw new ToolsError("Binary log blocked.", "binary_file_blocked", { path: target.relativePath });
      const text = redactSecrets(buf.subarray(0, maxBytes).toString("utf8"));
      logsChecked.push({ path: target.relativePath, bytes_read: Math.min(buf.length, maxBytes), summary: summarizeLogText(text), error_lines: extractErrorLines(text), redaction_marker: text.includes("[REDACTED]") ? "[REDACTED]" : null });
    } catch (error) {
      logsMissing.push({ path: raw, reason: error instanceof ToolsError ? error.code : error.message || "missing_or_blocked" });
    }
  }
  let gitSummary = null;
  if (args.include_git_status !== false) gitSummary = await safeGitStatus({ root: root.absolutePath, max_output_bytes: 8000 }).catch((error) => ({ ok: false, error: error.message }));
  const pkgScripts = [];
  const configs = [];
  const pkgPath = path.join(root.absolutePath, "package.json");
  if (args.include_package_scripts !== false && existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(redactSecrets(await readFile(pkgPath, "utf8")));
      for (const [name, command] of Object.entries(pkg.scripts || {})) {
        if (/test|check|lint|build|type|validate|dev|start/i.test(name + " " + command) && !/deploy|publish|install|release/i.test(name + " " + command)) pkgScripts.push({ name, command: String(command) });
      }
    } catch {}
  }
  if (args.include_config_summary !== false) {
    for (const rel of ["package.json", "tsconfig.json", "vite.config.js", "vite.config.mjs", "next.config.js", "eslint.config.js"]) if (existsSync(path.join(root.absolutePath, rel)) && !isSecretLikePath(rel)) configs.push({ path: rel, kind: rel.includes("package") ? "package_manifest" : "config" });
  }
  const combinedLogs = logsChecked.map((l) => `${l.summary} ${l.error_lines.join(" ")}`).join(" ");
  const type = inferDebugEvidenceFailureType(`${args.problem_description || ""} ${args.failing_command || ""} ${combinedLogs}`);
  const likelyAreas = [...new Set([
    ...arrayify(args.changed_files).map(String).filter(Boolean),
    ...extractPathsFromText(combinedLogs),
    /typeerror|undefined/i.test(combinedLogs) ? "undefined/null caller or data-shape mismatch" : null,
    type === "build" ? "build/config/module resolution" : null,
    type === "test" ? "failing test assertion path" : null
  ].filter(Boolean))].slice(0, 20);
  const suggested = [];
  if (args.failing_command) suggested.push(`rerun targeted failing command after fix: ${args.failing_command}`);
  for (const file of arrayify(args.changed_files).map(String).filter((f) => /\.[cm]?[jt]sx?$/.test(f))) suggested.push(`node --check ${file}`);
  if (!suggested.length) suggested.push("create/run the smallest targeted failing check before editing");
  const result = {
    failure_type_guess: type,
    logs_checked: logsChecked,
    logs_missing: logsMissing,
    commands_or_outputs_summarized: [{ failing_command: args.failing_command || null, status: "not run by vnem_tools_debug_evidence; captured as provided context only" }],
    arbitrary_commands_run: false,
    git_status_summary: gitSummary,
    changed_files_summary: arrayify(args.changed_files).map(String).filter((f) => !isSecretLikePath(f)).map((file) => ({ path: file, mentioned_in_logs: combinedLogs.includes(file) || combinedLogs.includes(path.basename(file)) })),
    package_scripts_relevant: pkgScripts,
    config_files_relevant: configs,
    likely_root_cause_areas: likelyAreas,
    targeted_checks_suggested: suggested,
    permission_profile: activePermissionProfile.profile_name,
    allowed_roots_check: { inside_allowed_roots: true, matched_root: root.root },
    evidence_log_id: null,
    safe_to_claim: ["Collected bounded log/config/git-status evidence only.", "No arbitrary commands, tests, package installs, network, GitHub, or deploy actions were run."],
    must_not_claim: ["vnem_tools_debug_evidence ran arbitrary commands or tests.", "The issue is fixed.", "Secret files were read.", "Root cause is proven beyond the collected evidence."]
  };
  const log = await writeEvidenceLog("debug_evidence", result);
  result.evidence_log_id = log.evidence_log_id;
  recordSession(args.session_id, "debug_evidence", result);
  return result;
}

function summarizeLogText(text) {
  const lines = String(text).split(/\r?\n/).filter(Boolean);
  const interesting = lines.filter((line) => /error|fail|exception|typeerror|referenceerror|fatal|warn|stack|at \S+:/i.test(line)).slice(0, 8);
  return truncate((interesting.length ? interesting : lines.slice(0, 5)).join("\n"), 1200);
}

function extractErrorLines(text) {
  return String(text).split(/\r?\n/).filter((line) => /error|fail|exception|typeerror|referenceerror|fatal|at \S+:/i.test(line)).map((line) => truncate(redactSecrets(line.trim()), 240)).slice(0, 12);
}

function extractPathsFromText(text) {
  return [...String(text).matchAll(/(?:^|\s)((?:src|scripts|tests?|dashboard|lib)\/[A-Za-z0-9_./-]+\.[A-Za-z0-9]+)/g)].map((m) => m[1]);
}

function inferDebugEvidenceFailureType(text) {
  const hay = String(text).toLowerCase();
  if (/npm run test|assert|test failed|failing test/.test(hay)) return "test";
  if (/build|compile|vite|tsc|webpack/.test(hay)) return "build";
  if (/startup|boot|server start/.test(hay)) return "startup";
  if (/ui|browser|dashboard|blank|click/.test(hay)) return "UI";
  if (/mcp|registertool|stdio/.test(hay)) return "MCP";
  if (/typeerror|referenceerror|exception|undefined|runtime/.test(hay)) return "runtime";
  if (/crash|fatal|panic/.test(hay)) return "crash";
  if (/package|dependency|peer/.test(hay)) return "package";
  return "unknown";
}

function detectDuplicateLogicHints(files) {
  const buckets = new Map();
  for (const f of files) {
    for (const m of f.text.matchAll(/function\s+([A-Za-z_$][\w$]*)|const\s+([A-Za-z_$][\w$]*)\s*=/g)) {
      const name = (m[1] || m[2] || "").toLowerCase();
      if (!name) continue;
      buckets.set(name, [...(buckets.get(name) || []), f.path]);
    }
  }
  return [...buckets.entries()].filter(([, paths]) => new Set(paths).size > 1).map(([symbol, paths]) => ({ symbol, paths: [...new Set(paths)].slice(0, 8), reason: "same symbol appears in multiple files; review for duplicate logic or legitimate boundary" })).slice(0, 20);
}

function formatArchitectureReview(result) {
  return [`Workspace: ${result.workspace_root}`, `Entry points: ${result.entry_points_found.length}`, `Registries/routes: ${result.tool_or_route_registries_found.length}`, `Possible fake systems: ${result.possible_parallel_fake_systems.length}`, `Possible dead code: ${result.possible_dead_code.length}`].join("\n");
}

function formatDebugEvidence(result) {
  return [`Failure type guess: ${result.failure_type_guess}`, `Logs checked: ${result.logs_checked.length}`, `Logs missing/blocked: ${result.logs_missing.length}`, `Arbitrary commands run: ${result.arbitrary_commands_run}`, `Targeted checks: ${result.targeted_checks_suggested.join("; ")}`].join("\n");
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function safeFetchUrlText(args) {
  if (!["GET", "HEAD"].includes(args.method || "GET")) throw new ToolsError("Only GET/HEAD are allowed.", "method_blocked");
  for (const [key, value] of Object.entries(args.headers || {})) {
    if (SECRET_HEADER_PATTERN.test(key) || containsRawSecret(value)) throw new ToolsError("Raw secret headers are blocked.", "raw_secret_blocked", { header: key });
  }
  const url = parseSafeResearchUrl(args.url);
  const dryRun = args.dry_run !== false;
  const planned = { url: redactUrl(url), method: args.method || "GET", dry_run: dryRun, executed: false, status: null, content_type: null, text_excerpt: "", title_if_found: "", links_count: 0, sha256: null, truncated: false, evidence_log_id: null, safe_to_claim: [], must_not_claim: ["Direct URL content was fetched.", "A web search happened.", "Search engine results were scraped."] };
  if (dryRun) return { ...planned, action_policy_preview: actionPolicyPreview({ action_type: "external_fetch", proposed_action: planned.url }) };
  enforceActionPolicy("external_fetch", args);
  let raw;
  let status = 200;
  let contentType = "text/plain";
  if (url.protocol === "file:") {
    const target = await resolveAllowedFile(fileURLToPath(url), { mustExist: true, blockSecrets: true });
    raw = await readFile(target.absolutePath);
  } else {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(args.timeout_ms || 10000, MAX_API_TIMEOUT_MS));
    try {
      const response = await fetch(url, { method: args.method || "GET", headers: scrubHeadersForRequest(args.headers || {}), signal: controller.signal });
      status = response.status;
      contentType = response.headers.get("content-type") || "unknown";
      raw = Buffer.from(await response.arrayBuffer());
    } finally { clearTimeout(timer); }
  }
  const maxBytes = Math.min(args.max_response_bytes || 16000, MAX_FETCH_TEXT_BYTES);
  const text = redactSecrets(extractText(raw.subarray(0, maxBytes).toString("utf8")));
  const result = { ...planned, dry_run: false, executed: true, status, content_type: contentType, text_excerpt: truncate(text, 2000), title_if_found: extractTitle(raw.toString("utf8")), links_count: countLinks(raw.toString("utf8")), sha256: sha256(raw), truncated: raw.length > maxBytes, safe_to_claim: ["Text was fetched from a direct URL with Tools MCP safeguards."], must_not_claim: ["A web search happened.", "Search engine result pages were scraped.", "Login/session/cookie/CAPTCHA automation was used.", "The source's factual claims were independently verified by this fetch alone."] };
  const log = await writeEvidenceLog("fetch_url_text", result);
  const withLog = { ...result, evidence_log_id: log.evidence_log_id };
  recordSession(args.session_id, "research_sources", withLog);
  return withLog;
}

function globsMatch(rel, globs = []) {
  const list = arrayify(globs).filter(Boolean);
  if (!list.length) return true;
  return list.some((glob) => matchesSimpleFilter(rel, glob));
}

function looksBinary(buffer) {
  if (!buffer?.length) return false;
  let suspicious = 0;
  const sample = buffer.subarray(0, Math.min(buffer.length, 512));
  for (const byte of sample) if (byte === 0 || (byte < 7 && ![9, 10, 13].includes(byte))) suspicious += 1;
  return suspicious > 0;
}

function extractText(html) {
  return String(html || "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function extractTitle(textOrHtml) {
  const raw = String(textOrHtml || "");
  const htmlTitle = raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  if (htmlTitle) return truncate(redactSecrets(extractText(htmlTitle)), 200);
  return truncate(raw.split(/[\n.]/).find(Boolean) || "", 120);
}

function countLinks(html) {
  return (String(html || "").match(/<a\s+/gi) || []).length;
}

async function safeApplyPatch(args) {
  const dryRun = args.dry_run !== false;
  const parsed = parseVnemPatch(args.patch);
  const root = await resolveAllowedRoot(args.target_root || ".");
  const target = await resolveAllowedFile(path.resolve(root.absolutePath, parsed.path), { mustExist: true, blockSecrets: true });
  if (containsRawSecret(parsed.replace)) throw new ToolsError("Raw secret-like values are blocked in patch content.", "raw_secret_blocked", { path: target.relativePath });
  enforceActionPolicy("apply_patch", args);
  const info = await stat(target.absolutePath);
  if (!info.isFile()) throw new ToolsError("Patch target must be a regular file.", "not_a_file", { path: target.relativePath });
  const buffer = await readFile(target.absolutePath);
  if (buffer.includes(0)) throw new ToolsError("Binary patch targets are blocked.", "binary_file_blocked", { path: target.relativePath });
  const original = buffer.toString("utf8");
  if (!original.includes(parsed.search)) throw new ToolsError("Patch search content was not found exactly once.", "patch_search_not_found", { path: target.relativePath });
  if (countOccurrences(original, parsed.search) !== 1) throw new ToolsError("Patch search content must match exactly once.", "patch_search_not_unique", { path: target.relativePath });
  const nextText = original.replace(parsed.search, parsed.replace);
  if (nextText === original) throw new ToolsError("Patch would not change the file.", "no_effect_patch", { path: target.relativePath });
  let backupPath = null;
  if (!dryRun) {
    if (args.backup !== false) {
      const backupDir = path.join(evidenceRoot, "backups", logId("backup"));
      const rel = target.relativePath;
      backupPath = path.join(backupDir, rel);
      await mkdir(path.dirname(backupPath), { recursive: true });
      await copyFile(target.absolutePath, backupPath);
    }
    await writeFile(target.absolutePath, nextText, "utf8");
  }
  const result = {
    dry_run: dryRun,
    applied: !dryRun,
    changed_files: [target.relativePath],
    diff_summary: [`${target.relativePath}: ${parsed.removed.length} removed / ${parsed.added.length} added line(s)`],
    backup_path: backupPath,
    restore_plan: backupPath ? [`copy ${backupPath} back to ${target.absolutePath}`] : ["use the returned diff summary and git checkout to restore"],
    before_sha256: sha256(original),
    after_sha256: sha256(nextText)
  };
  const log = await writeEvidenceLog("patch", result);
  return { ...result, evidence_log_id: log.evidence_log_id };
}

async function safeRestoreBackup(args) {
  const dryRun = args.dry_run !== false;
  const backup = await resolveAllowedFile(args.backup_path, { mustExist: true, blockSecrets: true });
  const target = await resolveAllowedFile(args.target_path, { mustExist: true, blockSecrets: true });
  enforceActionPolicy("restore_backup", args);
  const backupInfo = await stat(backup.absolutePath);
  const targetInfo = await stat(target.absolutePath);
  if (!backupInfo.isFile() || !targetInfo.isFile()) throw new ToolsError("Backup and target must be regular files.", "not_a_file", { backup_path: backup.relativePath, target_path: target.relativePath });
  const backupBytes = await readFile(backup.absolutePath);
  const targetBytes = await readFile(target.absolutePath);
  if (backupBytes.includes(0) || targetBytes.includes(0)) throw new ToolsError("Binary restore targets are blocked.", "binary_file_blocked", { backup_path: backup.relativePath, target_path: target.relativePath });
  const before = targetBytes.toString("utf8");
  const restoreText = backupBytes.toString("utf8");
  if (!dryRun) await writeFile(target.absolutePath, restoreText, "utf8");
  const result = {
    dry_run: dryRun,
    restored: !dryRun,
    backup_path: backup.absolutePath,
    target_path: target.relativePath,
    changed_files: [target.relativePath],
    before_sha256: sha256(before),
    restored_sha256: sha256(restoreText),
    restore_summary: dryRun ? `Dry-run restore ${backup.relativePath} -> ${target.relativePath}` : `Restored ${target.relativePath} from ${backup.relativePath}`
  };
  const log = await writeEvidenceLog("restore", result);
  return { ...result, evidence_log_id: log.evidence_log_id };
}

function formatRestore(restore) {
  return [
    `vnem_tools_restore_backup: ${restore.dry_run ? "dry-run" : "restored"}`,
    `target: ${restore.target_path}`,
    `backup: ${restore.backup_path}`,
    `evidence: ${restore.evidence_log_id}`
  ].join("\n");
}

function parseVnemPatch(patchText) {
  const lines = String(patchText || "").replace(/\r\n/g, "\n").split("\n");
  const update = lines.find((line) => line.startsWith("*** Update File: "));
  if (!update) throw new ToolsError("Patch must include *** Update File: <path>.", "invalid_patch_format");
  const targetPath = update.replace("*** Update File: ", "").trim();
  const removed = [];
  const added = [];
  for (const line of lines) {
    if (line.startsWith("-") && !line.startsWith("---")) removed.push(line.slice(1));
    if (line.startsWith("+") && !line.startsWith("+++")) added.push(line.slice(1));
  }
  if (!removed.length && !added.length) throw new ToolsError("Patch must include removed and added lines.", "invalid_patch_format");
  return { path: targetPath, removed, added, search: removed.join("\n"), replace: added.join("\n") };
}

async function safeRunCommand(args) {
  const dryRun = args.dry_run !== false;
  const cwd = await resolveAllowedRoot(args.cwd || ".");
  const timeoutMs = Math.min(args.timeout_ms || 30000, MAX_COMMAND_TIMEOUT_MS);
  const maxOutputBytes = Math.min(args.max_output_bytes || 16000, MAX_COMMAND_OUTPUT_BYTES);
  const command = String(args.command || "").trim();
  validateSafeCommand(command);
  enforceActionPolicy("run_test", args);
  const planned = { command, cwd: cwd.absolutePath, dry_run: dryRun, executed: false, timeout_ms: timeoutMs, max_output_bytes: maxOutputBytes, allowed: true };
  if (dryRun) return planned;
  enforceApproval(args);
  const tokens = splitCommand(command);
  const started = Date.now();
  const execution = await runProcess(tokens[0], tokens.slice(1), { cwd: cwd.absolutePath, timeoutMs, maxOutputBytes });
  const result = { ...planned, executed: true, dry_run: false, duration_ms: Date.now() - started, ...execution };
  const log = await writeEvidenceLog("command", result);
  return { ...result, evidence_log_id: log.evidence_log_id };
}

function validateSafeCommand(command) {
  if (!command) throw new ToolsError("Command is required.", "command_required");
  if (DANGEROUS_COMMAND_PATTERN.test(command)) throw new ToolsError("Dangerous command blocked.", "dangerous_command_blocked", { command: redactSecrets(command) });
  if (CONTROL_OPERATOR_PATTERN.test(command)) throw new ToolsError("Shell control operators are blocked.", "shell_operator_blocked", { command: redactSecrets(command) });
  const tokens = splitCommand(command);
  const [bin, sub, third] = tokens;
  if (bin === "node" && sub === "--check" && tokens.length >= 3) return;
  if (bin === "npm" && sub === "test" && tokens.length === 2) return;
  if (bin === "npm" && sub === "run" && third && SAFE_PACKAGE_SCRIPT_PATTERN.test(third) && tokens.length === 3) return;
  if (bin === "git" && ["status", "diff", "log", "ls-files"].includes(sub)) return;
  throw new ToolsError("Command is not in the Tools MCP allowlist.", "command_not_allowlisted", { command: redactSecrets(command), allowed: statusObject().command_allowlist });
}

function splitCommand(command) {
  const tokens = [];
  const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match;
  while ((match = pattern.exec(command))) tokens.push(match[1] ?? match[2] ?? match[3]);
  return tokens;
}

function spawnCommandName(command) {
  return command;
}

function shouldUseShellForCommand(command) {
  return process.platform === "win32" && /^(npm|npx|pnpm|yarn)$/.test(command);
}

async function runProcess(command, args, options) {
  if (process.env.VNEM_TOOLS_COMMAND_MOCK_LOG) return await runMockedProcess(command, args, options);
  return await new Promise((resolve) => {
    const child = spawn(spawnCommandName(command), args, { cwd: options.cwd, shell: shouldUseShellForCommand(command), windowsHide: true });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, options.timeoutMs);
    const collect = (target, chunk) => {
      const text = chunk.toString();
      if (target === "stdout") stdout = truncate(stdout + text, options.maxOutputBytes);
      else stderr = truncate(stderr + text, options.maxOutputBytes);
    };
    child.stdout.on("data", (chunk) => collect("stdout", chunk));
    child.stderr.on("data", (chunk) => collect("stderr", chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ ok: false, exit_code: null, timed_out: timedOut, stdout: redactSecrets(stdout), stderr: redactSecrets(`${stderr}\n${error.message}`.trim()) });
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolve({ ok: code === 0 && !timedOut, exit_code: code, signal, timed_out: timedOut, stdout: redactSecrets(stdout), stderr: redactSecrets(stderr) });
    });
  });
}

async function runMockedProcess(command, args = [], options = {}) {
  const line = `${command} ${args.join(" ")}`.trim();
  const entry = { command, args: args.map((arg) => redactSecrets(String(arg))), cwd: options.cwd || process.cwd(), command_classification: classifyMockedCommand(command, args), env_safety_summary: mockedEnvSafetySummary(options) };
  const recordAndReturn = async (result) => {
    entry.simulated_result = { ok: result.ok, exit_code: result.exit_code, stdout_bytes: result.stdout.length, stderr_bytes: result.stderr.length, stdout_preview: truncate(result.stdout, 300), stderr_preview: truncate(result.stderr, 300) };
    await appendFile(process.env.VNEM_TOOLS_COMMAND_MOCK_LOG, `${JSON.stringify(entry)}\n`, "utf8").catch(() => {});
    return result;
  };
  const ok = (stdout = "", stderr = "") => recordAndReturn({ ok: true, exit_code: 0, signal: null, timed_out: false, stdout: truncate(redactSecrets(stdout), options.maxOutputBytes || MAX_COMMAND_OUTPUT_BYTES), stderr: truncate(redactSecrets(stderr), options.maxOutputBytes || MAX_COMMAND_OUTPUT_BYTES) });
  const fail = (stderr = "mock command failed", stdout = "") => recordAndReturn({ ok: false, exit_code: 1, signal: null, timed_out: false, stdout: truncate(redactSecrets(stdout), options.maxOutputBytes || MAX_COMMAND_OUTPUT_BYTES), stderr: truncate(redactSecrets(stderr), options.maxOutputBytes || MAX_COMMAND_OUTPUT_BYTES) });
  if (command === "git") {
    const mockSha = "0123456789abcdef0123456789abcdef01234567";
    if (args[0] === "--version") return ok("git version 2.99.0\n");
    if (args[0] === "remote" && args[1] === "get-url") return ok("https://github.com/fixture/local.git\n");
    if (args[0] === "remote" && args[1] === "-v") return ok("origin\thttps://github.com/fixture/local.git (fetch)\norigin\thttps://github.com/fixture/local.git (push)\n");
    if (args[0] === "branch" && args[1] === "--show-current") return ok(process.env.VNEM_TOOLS_MOCK_BRANCH || "feat/autonomy-2\n");
    if (args[0] === "rev-parse" && args[1] === "--verify") return fail("fatal: Needed a single revision\n");
    if (args[0] === "rev-parse" && args[1] === "HEAD") return ok(`${mockSha}\n`);
    if (args[0] === "rev-parse" && args.includes("@{u}")) return ok("origin/feat/autonomy-2\n");
    if (args[0] === "status" && args[1] === "--short") return ok(" M README.md\n?? src/app.js\n");
    if (args[0] === "diff" && args.includes("--cached") && args.includes("--name-only")) return ok(String(process.env.VNEM_TOOLS_MOCK_STAGED_FILES || "").split(/[;,]/).filter(Boolean).join("\0"));
    if (args[0] === "diff" && args.includes("--name-status")) return ok("M\tsrc/app.js\nA\ttests/app.test.js\nM\tREADME.md\n");
    if (args[0] === "diff" && args.includes("--numstat")) return ok("4\t1\tsrc/app.js\n8\t0\ttests/app.test.js\n2\t1\tREADME.md\n");
    if (args[0] === "cat-file" && args[1] === "-e") return ok("");
    if (args[0] === "diff" && args.includes("--check")) return ok("");
    if (args[0] === "diff") return ok("diff --git a/src/app.js b/src/app.js\n--- a/src/app.js\n+++ b/src/app.js\n@@ -1,1 +1,2 @@\n console.log('fixture');\n+export const ready = true;\n");
    if (args[0] === "ls-remote" && args.includes("--heads")) return ok(`${mockSha}\trefs/heads/${process.env.VNEM_TOOLS_MOCK_BRANCH || "feat/autonomy-2"}\n`);
    if (args[0] === "ls-remote" && args.some((arg) => String(arg).startsWith("refs/tags/"))) return ok(`${mockSha}\trefs/tags/v1.0.0\n${mockSha}\trefs/tags/v1.0.0^{}\n`);
    if (args[0] === "rev-list") return ok("0\t0\n");
    if (args[0] === "log") return ok("0123456 (HEAD -> feat/autonomy-2) feat: mock\n89abcde main commit\n");
    if (["switch", "checkout", "add", "commit", "push"].includes(args[0])) return ok(`${line}\n`);
    return ok(`${line}\n`);
  }
  if (command === "gh") {
    const mockSha = "0123456789abcdef0123456789abcdef01234567";
    if (args[0] === "--version") return ok("gh version 2.63.0 (mock)\n");
    if (args[0] === "auth" && args[1] === "status") return process.env.VNEM_TOOLS_MOCK_GH_AUTH === "missing" ? fail("You are not logged into any GitHub hosts. Run gh auth login.\n") : ok("github.com\n  Logged in to github.com account fixture (keyring)\n");
    if (args[0] === "repo" && args[1] === "view") return ok(JSON.stringify({ nameWithOwner: "fixture/local", defaultBranchRef: { name: "main" }, isPrivate: false, url: "https://github.com/fixture/local" }) + "\n");
    if (args[0] === "pr" && args[1] === "list") return ok(JSON.stringify([{ number: 7, title: "Mock PR", state: "OPEN", headRefName: "feat/autonomy-2", baseRefName: "main" }]) + "\n");
    if (args[0] === "pr" && args[1] === "view") return ok(JSON.stringify({ url: "https://github.com/fixture/local/pull/7", number: 7, state: "OPEN", isDraft: true, baseRefName: "main", headRefName: "feat/autonomy-2", headRefOid: mockSha, baseRefOid: "89abcdef0123456789abcdef0123456789abcdef", mergeable: "MERGEABLE", reviewDecision: "", additions: 14, deletions: 2, changedFiles: process.env.VNEM_TOOLS_MOCK_PR_FILES_TRUNCATED === "1" ? 5 : 3, files: [{ path: "src/app.js", additions: 4, deletions: 1 }, { path: "tests/app.test.js", additions: 8, deletions: 0 }, { path: "README.md", additions: 2, deletions: 1 }], statusCheckRollup: [{ name: "validate", status: "COMPLETED", conclusion: "SUCCESS", detailsUrl: "https://github.com/fixture/local/actions/runs/101" }] }) + "\n");
    if (args[0] === "pr" && args[1] === "diff" && args.includes("--patch")) {
      if (process.env.VNEM_TOOLS_MOCK_PR_DIFF_TOO_LARGE === "1") return fail("HTTP 406: diff exceeded the maximum number of lines (20000)\nPullRequest.diff too_large\n");
      return ok(["diff --git a/src/app.js b/src/app.js", "--- a/src/app.js", "+++ b/src/app.js", "@@ -1,1 +1,2 @@", " console.log('fixture');", `+export const label = 'safe${String.fromCodePoint(0x202e)}text';`, "diff --git a/tests/app.test.js b/tests/app.test.js", "--- /dev/null", "+++ b/tests/app.test.js", "@@ -0,0 +1,1 @@", "+assert.equal(true, true);", ""].join("\n"));
    }
    if (args[0] === "issue" && args[1] === "list") return ok(JSON.stringify([{ number: 8, title: "Mock issue", state: "OPEN", labels: [{ name: "bug" }] }]) + "\n");
    if (args[0] === "run" && args[1] === "list") return ok(JSON.stringify([{ databaseId: 101, name: "CI", status: "completed", conclusion: "failure", headSha: "0123456789abcdef0123456789abcdef01234567", headBranch: "feat/autonomy-2", workflowName: "CI", url: "https://github.com/fixture/local/actions/runs/101" }]) + "\n");
    if (args[0] === "run" && args[1] === "view" && args.includes("--json")) return ok(JSON.stringify({ status: "completed", conclusion: "failure", url: "https://github.com/fixture/local/actions/runs/101", headSha: mockSha, headBranch: "feat/autonomy-2", name: "CI", event: "pull_request", createdAt: "2026-07-13T00:00:00Z", updatedAt: "2026-07-13T00:02:00Z", jobs: [{ databaseId: 201, name: "validate", status: "completed", conclusion: "failure", url: "https://github.com/fixture/local/actions/runs/101/job/201", steps: [{ number: 1, name: "checkout", status: "completed", conclusion: "success" }, { number: 2, name: "npm test", status: "completed", conclusion: "failure" }] }] }) + "\n");
    if (args[0] === "run" && args[1] === "view") return ok("Run npm test\nError: Cannot find module './src/app.js'\ntests/app.test.js:4\nfailed with exit code 1\n");
    if (args[0] === "api" && args[1] === "graphql") return ok(JSON.stringify({ data: { repository: { pullRequest: { url: "https://github.com/fixture/local/pull/7", reviewThreads: { nodes: [{ id: "PRRT_1", isResolved: false, isOutdated: false, path: "src/app.js", line: 2, originalLine: 2, diffSide: "RIGHT", comments: { nodes: [{ id: "PRRC_1", author: { login: "reviewer" }, body: "Please test the error path.", createdAt: "2026-07-13T00:01:00Z", url: "https://github.com/fixture/local/pull/7#discussion_r1" }] } }, { id: "PRRT_2", isResolved: true, isOutdated: true, path: "README.md", line: null, originalLine: 4, diffSide: "RIGHT", comments: { nodes: [] } }], pageInfo: { hasNextPage: false, endCursor: null } } } } } }) + "\n");
    if (args[0] === "api" && args[1] === "--method") return ok(JSON.stringify({ required_status_checks: { strict: true }, restrictions: null }) + "\n");
    if (args[0] === "pr" && args[1] === "create") return ok("https://github.com/fixture/local/pull/9\n");
    if (args[0] === "pr" && args[1] === "edit") return ok("https://github.com/fixture/local/pull/9\n");
    if (args[0] === "pr" && args[1] === "comment") return ok("https://github.com/fixture/local/pull/9#issuecomment-1\n");
    if (args[0] === "issue" && args[1] === "create") return ok("https://github.com/fixture/local/issues/10\n");
    if (args[0] === "issue" && args[1] === "edit") return ok("https://github.com/fixture/local/issues/10\n");
    if (args[0] === "issue" && args[1] === "comment") return ok("https://github.com/fixture/local/issues/10#issuecomment-2\n");
    if (args[0] === "label" && ["create", "edit"].includes(args[1])) return ok("label updated\n");
    if (args[0] === "run" && args[1] === "rerun") return ok("Requested rerun of run 101\n");
    if (args[0] === "release" && args[1] === "create") return ok("https://github.com/fixture/local/releases/tag/" + args[2] + "\n");
    if (args[0] === "release" && args[1] === "view") return ok(JSON.stringify({ tagName: args[2], name: "Fixture release", isDraft: true, isPrerelease: false, url: `https://github.com/fixture/local/releases/tag/${args[2]}`, targetCommitish: mockSha, publishedAt: null, createdAt: "2026-07-13T00:00:00Z", assets: [{ name: "fixture.tgz", size: 1234, state: "uploaded", downloadCount: 0, url: "https://github.com/fixture/local/releases/download/v1.0.0/fixture.tgz" }] }) + "\n");
    return ok(`${line}\n`);
  }
  return ok(`${line}\n`);
}

function classifyMockedCommand(command, args = []) {
  const first = String(args[0] || "");
  const second = String(args[1] || "");
  if (command === "git") {
    const mutation = ["switch", "checkout", "add", "commit", "push"].includes(first);
    return { tool_family: "git", access_type: mutation ? "mutation" : "read", mutates: mutation, network: first === "push", dry_run_safe_simulation: true };
  }
  if (command === "gh") {
    const mutation =
      (first === "pr" && ["create", "edit", "comment"].includes(second)) ||
      (first === "issue" && ["create", "edit", "comment"].includes(second)) ||
      (first === "label" && ["create", "edit"].includes(second)) ||
      (first === "run" && second === "rerun") ||
      (first === "release" && second === "create") ||
      (first === "repo" && second === "edit");
    return { tool_family: "gh", access_type: mutation ? "mutation" : "read", mutates: mutation, network: true, dry_run_safe_simulation: true };
  }
  return { tool_family: "other", access_type: "simulated_unknown", mutates: false, network: false, dry_run_safe_simulation: true };
}

function mockedEnvSafetySummary(options = {}) {
  const explicitKeys = Object.keys(options.env || {});
  const tokenPresence = ["GH_TOKEN", "GITHUB_TOKEN", "CLOUDFLARE_API_TOKEN", "CF_API_TOKEN", "CF_TOKEN"].filter((key) => Boolean(process.env[key] || options.env?.[key]));
  return {
    explicit_env_keys_count: explicitKeys.length,
    explicit_env_keys_redacted: explicitKeys.map(redactSecrets),
    token_like_env_presence_only: tokenPresence,
    secret_values_recorded: false,
    output_redaction_applied: true
  };
}

async function runProcessWithInput(command, args, options) {
  return await new Promise((resolve) => {
    const child = spawn(spawnCommandName(command), args, { cwd: options.cwd, shell: shouldUseShellForCommand(command), windowsHide: true });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGTERM"); }, options.timeoutMs);
    const collect = (target, chunk) => {
      const text = chunk.toString();
      if (target === "stdout") stdout = truncate(stdout + text, options.maxOutputBytes);
      else stderr = truncate(stderr + text, options.maxOutputBytes);
    };
    child.stdout.on("data", (chunk) => collect("stdout", chunk));
    child.stderr.on("data", (chunk) => collect("stderr", chunk));
    child.stdin?.write(options.input || "");
    child.stdin?.end();
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ ok: false, exit_code: null, timed_out: timedOut, stdout: redactSecrets(stdout, options.extraSecrets || []), stderr: redactSecrets(`${stderr}\n${error.message}`.trim(), options.extraSecrets || []) });
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolve({ ok: code === 0 && !timedOut, exit_code: code, signal, timed_out: timedOut, stdout: redactSecrets(stdout, options.extraSecrets || []), stderr: redactSecrets(stderr, options.extraSecrets || []) });
    });
  });
}

async function safeApplyPatchBatch(args) {
  const dryRun = args.dry_run !== false;
  const root = await resolveAllowedRoot(args.target_root || ".");
  const plans = [];
  const working = new Map();
  for (const [index, rawOp] of arrayify(args.operations).entries()) {
    const op = normalizePatchOperation(rawOp, index);
    const target = await resolveAllowedFile(path.isAbsolute(op.path) ? op.path : path.join(root.absolutePath, op.path), { mustExist: op.op === "create" ? false : true, blockSecrets: true });
    if (op.op === "create" && existsSync(target.absolutePath)) throw new ToolsError("Create operation target already exists.", "target_exists", { path: target.relativePath });
    let original = working.has(target.absolutePath) ? working.get(target.absolutePath) : null;
    if (op.op !== "create") original = original ?? await readTextFileForMutation(target.absolutePath, target.relativePath);
    let next;
    if (op.op === "replace") {
      if (!original.includes(op.search)) throw new ToolsError("Patch batch search content was not found.", "patch_search_not_found", { path: target.relativePath, operation_index: index });
      if (countOccurrences(original, op.search) !== 1) throw new ToolsError("Patch batch search content must match exactly once.", "patch_search_not_unique", { path: target.relativePath, operation_index: index });
      next = original.replace(op.search, op.replace);
    } else if (op.op === "append") next = original + op.content;
    else if (op.op === "create") next = op.content;
    else if (op.op === "delete") {
      if (op.explicit_delete !== true) throw new ToolsError("Delete operations require explicit_delete=true.", "explicit_delete_required", { path: target.relativePath });
      next = null;
    } else throw new ToolsError("Unsupported patch batch operation.", "unsupported_patch_operation", { op: op.op });
    plans.push({ ...op, target, before_text: original, after_text: next, operation_index: index });
    if (next === null) working.delete(target.absolutePath);
    else working.set(target.absolutePath, next);
  }
  enforceActionPolicy("apply_patch", args);
  const backups = [];
  const changedFiles = [...new Set(plans.map((plan) => plan.target.relativePath))];
  const createdFiles = [...new Set(plans.filter((plan) => plan.op === "create").map((plan) => plan.target.relativePath))];
  const deletedFiles = [...new Set(plans.filter((plan) => plan.op === "delete").map((plan) => plan.target.relativePath))];
  const backupRoot = path.join(evidenceRoot, "backups", logId("patch-batch"));
  if (!dryRun) {
    for (const plan of plans) {
      if (plan.op !== "create" && !backups.some((item) => item.target_path === plan.target.relativePath)) {
        const backupPath = path.join(backupRoot, plan.target.relativePath);
        await mkdir(path.dirname(backupPath), { recursive: true });
        await writeFile(backupPath, plan.before_text ?? "", "utf8");
        backups.push({ target_path: plan.target.relativePath, backup_path: backupPath, action: "restore_file" });
      }
    }
    for (const [absolute, text] of working.entries()) {
      await mkdir(path.dirname(absolute), { recursive: true });
      await writeFile(absolute, text, "utf8");
    }
    for (const plan of plans.filter((item) => item.op === "delete")) await rm(plan.target.absolutePath, { force: true });
  } else {
    for (const plan of plans.filter((item) => item.op !== "create")) backups.push({ target_path: plan.target.relativePath, backup_path: null, action: "would_backup" });
  }
  const restorePlan = backups.map((item) => ({ backup_path: item.backup_path, target_path: item.target_path, action: item.action === "would_backup" ? "would_restore_file" : "restore_file" }));
  for (const file of createdFiles) restorePlan.push({ target_path: file, action: "delete_created_file" });
  const result = {
    dry_run: dryRun,
    applied: !dryRun,
    partial_apply_allowed: args.allow_partial === true,
    changed_files: changedFiles,
    created_files: createdFiles,
    deleted_files: deletedFiles,
    backups,
    restore_plan: restorePlan,
    diff_summary: plans.map((plan) => `${plan.target.relativePath}: ${plan.op}`),
    operations: plans.map((plan) => ({ op: plan.op, path: plan.target.relativePath, before_sha256: plan.before_text === null ? null : sha256(plan.before_text ?? ""), after_sha256: plan.after_text === null ? null : sha256(plan.after_text) }))
  };
  const log = await writeEvidenceLog("patch_batch", result);
  const withLog = { ...result, evidence_log_id: log.evidence_log_id };
  recordSession(args.session_id, "patches_applied", withLog);
  return decorateToolResult("vnem_tools_apply_patch_batch", withLog, { capability_group: "patching", mutation: true, requires_approval: true });
}

function normalizePatchOperation(raw, index) {
  const op = String(raw.op || raw.type || "").trim().toLowerCase();
  const filePath = String(raw.path || raw.file_path || "").trim();
  if (!filePath) throw new ToolsError("Patch batch operation path is required.", "path_required", { operation_index: index });
  if (["replace", "append", "create"].includes(op) && containsRawSecret(raw.content || raw.replace || "")) throw new ToolsError("Raw secret-like values are blocked in patch batch content.", "raw_secret_blocked", { path: filePath });
  return { op, path: filePath, search: String(raw.search ?? raw.old_text ?? ""), replace: String(raw.replace ?? raw.new_text ?? ""), content: String(raw.content ?? ""), explicit_delete: raw.explicit_delete === true };
}

async function readTextFileForMutation(absolutePath, relativePath) {
  const info = await stat(absolutePath);
  if (!info.isFile()) throw new ToolsError("Mutation target must be a regular file.", "not_a_file", { path: relativePath });
  const bytes = await readFile(absolutePath);
  if (bytes.includes(0)) throw new ToolsError("Binary mutation targets are blocked.", "binary_file_blocked", { path: relativePath });
  return bytes.toString("utf8");
}

async function safeRestoreBatch(args) {
  const dryRun = args.dry_run !== false;
  const items = [];
  for (const [index, raw] of arrayify(args.restore_plan).entries()) {
    const action = String(raw.action || "restore_file");
    const target = await resolveAllowedFile(raw.target_path, { mustExist: action === "delete_created_file", blockSecrets: true });
    if (action === "delete_created_file") {
      items.push({ action, target_path: target.relativePath, target });
      continue;
    }
    if (!raw.backup_path) throw new ToolsError("Restore plan entry requires backup_path.", "backup_path_required", { operation_index: index });
    const backup = await resolveAllowedFile(raw.backup_path, { mustExist: true, blockSecrets: true });
    const text = await readTextFileForMutation(backup.absolutePath, backup.relativePath);
    items.push({ action: "restore_file", backup_path: backup.absolutePath, target_path: target.relativePath, target, restore_text: text });
  }
  enforceActionPolicy("restore_backup", args);
  if (!dryRun) {
    for (const item of items) {
      if (item.action === "delete_created_file") await rm(item.target.absolutePath, { force: true });
      else await writeFile(item.target.absolutePath, item.restore_text, "utf8");
    }
  }
  const result = { dry_run: dryRun, restored: !dryRun, restored_files: items.filter((item) => item.action === "restore_file").map((item) => item.target_path), deleted_created_files: items.filter((item) => item.action === "delete_created_file").map((item) => item.target_path), restore_count: items.length };
  const log = await writeEvidenceLog("restore_batch", result);
  const withLog = { ...result, evidence_log_id: log.evidence_log_id };
  recordSession(args.session_id, "restores", withLog);
  return decorateToolResult("vnem_tools_restore_batch", withLog, { capability_group: "rollback", mutation: true, requires_approval: true });
}

async function safeProjectScan(args) {
  const root = await resolveAllowedRoot(args.root || ".");
  const files = [];
  await walkFiles(root.absolutePath, root.absolutePath, files, { maxResults: args.max_files || 200 });
  const packageJsonPath = path.join(root.absolutePath, "package.json");
  let pkg = null;
  if (existsSync(packageJsonPath)) pkg = JSON.parse(await readFile(packageJsonPath, "utf8"));
  const scripts = args.include_scripts === false ? {} : Object.fromEntries(Object.entries(pkg?.scripts || {}).map(([k, v]) => [k, redactSecrets(v)]));
  const likelyFrameworks = detectFrameworks(pkg, files);
  const safeCommands = suggestSafeCommands(scripts);
  const result = {
    project_root: root.absolutePath,
    detected_package_manager: existsSync(path.join(root.absolutePath, "pnpm-lock.yaml")) ? "pnpm" : existsSync(path.join(root.absolutePath, "yarn.lock")) ? "yarn" : pkg ? "npm" : "unknown",
    package_json_present: Boolean(pkg),
    scripts,
    likely_frameworks: likelyFrameworks,
    source_dirs: commonDirs(files, ["src", "app", "pages", "lib"]),
    test_dirs: commonDirs(files, ["test", "tests", "__tests__", "spec"]),
    config_files: files.map((f) => f.path).filter((f) => /(^|\/)(vite|next|astro|tsconfig|eslint|package)\.(config\.)?(json|js|mjs|ts)$|package\.json$/.test(f)).slice(0, 50),
    build_outputs: ["dist", "build", ".next", "coverage"].filter((dir) => existsSync(path.join(root.absolutePath, dir))),
    safe_commands_suggested: safeCommands,
    blocked_or_skipped_paths: [".git", "node_modules", "dist/build outputs", ...findImmediateSecretPaths(root.absolutePath)],
    warnings: [pkg ? null : "package.json not found", safeCommands.length ? null : "No safe package scripts detected"].filter(Boolean),
    evidence_log_id: null
  };
  const log = await writeEvidenceLog("project_scan", result);
  result.evidence_log_id = log.evidence_log_id;
  recordSession(args.session_id, "project_scans", result);
  return result;
}

async function safeAppInspect(args) {
  const root = await resolveAllowedRoot(args.root || ".");
  try {
    const inspection = await inspectAppProject(root.absolutePath, { max_files: args.max_files });
    const result = decorateToolResult("vnem_tools_app_inspect", inspection, { capability_group: "app_engineering" });
    recordSession(args.session_id, "app_inspections", result);
    return result;
  } catch (error) {
    throw appEngineeringToolsError(error);
  }
}

async function safeAppVerticalSlicePlan(args) {
  const root = await resolveAllowedRoot(args.root || ".");
  try {
    const plan = await buildVerticalSlicePlan(root.absolutePath, {
      feature_name: args.feature_name,
      adapter: args.adapter,
      max_files: args.max_files
    });
    if (plan.plan_id) appEngineeringPlans.set(plan.plan_id, { root: root.absolutePath, plan });
    const result = decorateToolResult("vnem_tools_app_vertical_slice_plan", {
      ...plan,
      mutation_state: "planned_or_dry_run_no_mutation",
      approval_required: true
    }, { capability_group: "app_engineering", requires_approval: true });
    recordSession(args.session_id, "app_plans", { ...result, operations: result.operations?.map(({ content, ...operation }) => operation) });
    return result;
  } catch (error) {
    throw appEngineeringToolsError(error);
  }
}

async function safeAppVerticalSliceApply(args) {
  const entry = appEngineeringPlans.get(args.plan_id);
  if (!entry) throw new ToolsError("App plan id was not created by this Tools MCP process.", "app_plan_not_found", { plan_id: args.plan_id });
  const dryRun = args.dry_run !== false;
  const preview = {
    status: dryRun ? "dry_run_planned" : "ready_to_apply",
    dry_run: dryRun,
    applied: false,
    plan_id: args.plan_id,
    project_root: entry.root,
    files: entry.plan.files_previewed,
    transaction: entry.plan.transaction,
    approval_required: true,
    action_policy_preview: actionPolicyPreview({ action_type: "apply_patch", proposed_action: `Apply app plan ${args.plan_id}` })
  };
  if (dryRun) return decorateToolResult("vnem_tools_app_vertical_slice_apply", preview, { capability_group: "app_engineering", mutation: true, requires_approval: true });
  enforceActionPolicy("apply_patch", args);
  try {
    const transaction = await applyVerticalSlicePlan(entry.root, entry.plan);
    const log = await writeEvidenceLog("app_vertical_slice_apply", { ...transaction, approval_note: args.approval_note });
    const result = decorateToolResult("vnem_tools_app_vertical_slice_apply", {
      ...transaction,
      dry_run: false,
      applied: true,
      evidence_log_id: log.evidence_log_id,
      safe_to_claim: true,
      unsafe_to_claim: ["Acceptance passed before vnem_tools_app_acceptance_run produces evidence."]
    }, { capability_group: "app_engineering", mutation: true, requires_approval: true });
    recordSession(args.session_id, "app_transactions", result);
    return result;
  } catch (error) {
    throw appEngineeringToolsError(error);
  }
}

async function safeAppTransactionRollback(args) {
  const root = await resolveAllowedRoot(args.root || ".");
  const manifest = await resolveAllowedFile(args.manifest_path, { mustExist: true });
  if (!isInsidePath(root.absolutePath, manifest.absolutePath)) throw new ToolsError("Transaction manifest is outside the selected project root.", "app_transaction_root_mismatch");
  const dryRun = args.dry_run !== false;
  if (dryRun) {
    return decorateToolResult("vnem_tools_app_transaction_rollback", {
      status: "dry_run_planned",
      dry_run: true,
      rolled_back: false,
      manifest_path: manifest.absolutePath,
      approval_required: true,
      precondition_hashes_required: true,
      action_policy_preview: actionPolicyPreview({ action_type: "restore_backup", proposed_action: `Rollback app transaction ${manifest.absolutePath}` })
    }, { capability_group: "app_engineering", mutation: true, requires_approval: true });
  }
  enforceActionPolicy("restore_backup", args);
  try {
    const rollback = await rollbackVerticalSliceTransaction(root.absolutePath, manifest.absolutePath);
    const log = await writeEvidenceLog("app_transaction_rollback", rollback);
    const result = decorateToolResult("vnem_tools_app_transaction_rollback", { ...rollback, dry_run: false, rolled_back: true, manifest_path: manifest.absolutePath, evidence_log_id: log.evidence_log_id }, { capability_group: "app_engineering", mutation: true, requires_approval: true });
    recordSession(args.session_id, "app_rollbacks", result);
    return result;
  } catch (error) {
    throw appEngineeringToolsError(error);
  }
}

async function safeAppAcceptanceRun(args) {
  const root = await resolveAllowedRoot(args.root || ".");
  const dryRun = args.dry_run !== false;
  const scripts = arrayify(args.scripts).length ? arrayify(args.scripts) : ["test", "build"];
  const planned = {
    status: "dry_run_planned",
    dry_run: true,
    project_root: root.absolutePath,
    scripts,
    dev_script: args.dev_script || "dev",
    url: `http://127.0.0.1:${args.port || 4319}/`,
    checks: ["focused package scripts", "localhost server readiness", "Chromium desktop user path", "Chromium mobile render", "console errors", "network failures and HTTP errors", "screenshot evidence"],
    restore_on_failure: args.restore_on_failure !== false,
    approval_required: true,
    action_policy_previews: [
      actionPolicyPreview({ action_type: "run_test", proposed_action: scripts.map((script) => `npm run ${script}`).join(", ") }),
      actionPolicyPreview({ action_type: "start_dev_server", proposed_action: `npm run ${args.dev_script || "dev"}` }),
      actionPolicyPreview({ action_type: "browser_capture", proposed_action: "bounded localhost Chromium user-path proof" })
    ]
  };
  if (dryRun) return decorateToolResult("vnem_tools_app_acceptance_run", planned, { capability_group: "app_engineering", mutation: true, network: true, requires_approval: true });
  enforceApproval(args);
  let acceptanceManifest = null;
  if (args.manifest_path) {
    acceptanceManifest = await resolveAllowedFile(args.manifest_path, { mustExist: true });
    if (!isInsidePath(root.absolutePath, acceptanceManifest.absolutePath)) throw new ToolsError("Transaction manifest is outside the selected project root.", "app_transaction_root_mismatch");
  }
  const taskResults = [];
  let serverResult = null;
  let browserResult = null;
  let rollbackResult = null;
  let acceptanceError = null;
  const acceptanceId = logId("app-acceptance");
  const outputDir = path.join(evidenceRoot, acceptanceId);
  await mkdir(outputDir, { recursive: true });
  try {
    for (const script of scripts) {
      const task = await safeRunProjectTask({ ...args, root: root.absolutePath, task: script, dry_run: false, max_output_bytes: 24000 });
      taskResults.push(task);
      if (task.exit_code !== 0) break;
    }
    if (taskResults.every((task) => task.exit_code === 0)) {
      serverResult = await safeStartDevServer({ ...args, root: root.absolutePath, script: args.dev_script || "dev", host: "127.0.0.1", dry_run: false, max_output_bytes: 12000 });
      await waitForLocalUrl(serverResult.url, Math.min(args.timeout_ms || 30000, 30000));
      enforceActionPolicy("browser_capture", args);
      browserResult = await runChromiumUserPath(serverResult.url, outputDir, { launch_timeout_ms: Math.min(args.timeout_ms || 30000, 30000) });
    }
  } catch (error) {
    acceptanceError = { code: error.code || "app_acceptance_error", message: error.message || String(error), details: error.details || {} };
  } finally {
    if (serverResult?.server_id) {
      await safeStopDevServer({ ...args, server_id: serverResult.server_id, approved: true, approval_note: args.approval_note }).catch((error) => {
        acceptanceError ||= { code: error.code || "app_server_stop_failed", message: error.message || String(error) };
      });
    }
  }
  const scriptsPassed = taskResults.length === scripts.length && taskResults.every((task) => task.exit_code === 0);
  const browserPassed = browserResult?.status === "passed" && browserResult.safe_to_claim === true;
  const passed = scriptsPassed && browserPassed && !acceptanceError;
  if (!passed && args.restore_on_failure !== false && acceptanceManifest) {
    try {
      enforceActionPolicy("restore_backup", args);
      rollbackResult = await rollbackVerticalSliceTransaction(root.absolutePath, acceptanceManifest.absolutePath);
    } catch (error) {
      rollbackResult = { status: "rollback_failed", code: error.code || "app_rollback_failed", message: error.message || String(error) };
    }
  }
  const result = {
    status: passed ? "passed" : "failed",
    dry_run: false,
    acceptance_id: acceptanceId,
    project_root: root.absolutePath,
    scripts: taskResults.map((task) => ({ script: task.script, exit_code: task.exit_code, ok: task.ok, duration_ms: task.duration_ms, stdout: task.stdout, stderr: task.stderr, evidence_log_id: task.evidence_log_id })),
    server: serverResult ? { url: serverResult.url, started: serverResult.started, server_id: serverResult.server_id, stdout: serverResult.stdout, stderr: serverResult.stderr } : null,
    browser: browserResult,
    error: acceptanceError,
    rollback: rollbackResult,
    restored_after_failure: rollbackResult?.status === "rolled_back",
    evidence_path: path.join(outputDir, "acceptance.json"),
    safe_to_claim: passed,
    proven: passed ? ["focused scripts passed", "localhost server responded", "desktop user path passed", "mobile page loaded without overflow", "no captured console errors", "no captured network failures or HTTP errors", "desktop/mobile screenshots written"] : [scriptsPassed ? "focused scripts passed" : "focused scripts did not all pass"],
    what_is_not_proven: ["production deployment behavior", "authenticated flows", "all browsers and devices", "arbitrary frameworks outside the selected adapter"]
  };
  await writeFile(result.evidence_path, JSON.stringify(safeRedactJsonValue(result), null, 2), "utf8");
  const log = await writeEvidenceLog("app_acceptance", result, acceptanceId);
  result.evidence_log_id = log.evidence_log_id;
  if (acceptanceManifest) await updateTransactionAcceptance(acceptanceManifest.absolutePath, result).catch(() => {});
  recordSession(args.session_id, "app_acceptance_runs", result);
  return decorateToolResult("vnem_tools_app_acceptance_run", result, { capability_group: "app_engineering", mutation: true, network: true, requires_approval: true });
}

async function waitForLocalUrl(url, timeoutMs) {
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status >= 200 && response.status < 500) return response.status;
    } catch (error) { lastError = error; }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new ToolsError("Local app server did not become ready before timeout.", "app_server_readiness_timeout", { url, last_error: lastError?.message || null });
}

function appEngineeringToolsError(error) {
  if (error instanceof ToolsError) return error;
  return new ToolsError(error.message || String(error), error.code || "app_engineering_error", error.details || {});
}

function detectFrameworks(pkg, files) {
  const text = JSON.stringify({ scripts: pkg?.scripts || {}, deps: { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) }, files: files.map((f) => f.path).slice(0, 200) }).toLowerCase();
  const found = [];
  if (/vite/.test(text)) found.push("Vite");
  if (/react/.test(text)) found.push("React");
  if (/next/.test(text)) found.push("Next");
  if (/astro/.test(text)) found.push("Astro");
  if (/express/.test(text)) found.push("Express");
  if (/bin|node --check|node /.test(text) || pkg?.bin) found.push("Node CLI");
  if (!found.length && files.some((f) => /\.html$/.test(f.path))) found.push("plain static");
  return [...new Set(found)];
}

function suggestSafeCommands(scripts) {
  const out = [];
  for (const name of Object.keys(scripts || {})) {
    if (name === "test") out.push("npm test");
    else if (/^test:[a-z0-9:_-]+$/i.test(name)) out.push(`npm run ${name}`);
    else if (["build", "validate"].includes(name)) out.push(`npm run ${name}`);
    else if (name === "dev") out.push("npm run dev (via vnem_tools_start_dev_server only)");
  }
  return out;
}

function commonDirs(files, names) {
  const set = new Set();
  for (const file of files) {
    const parts = file.path.split("/");
    if (names.includes(parts[0])) set.add(parts[0]);
    const nested = parts.find((part) => names.includes(part));
    if (nested) set.add(nested);
  }
  return [...set].filter(Boolean).sort();
}

function findImmediateSecretPaths(root) {
  const out = [];
  for (const name of [".env", ".env.local", "secrets", "tokens", "credentials", "cookies", "sessions", ".ssh", "browser", "password-manager"]) if (existsSync(path.join(root, name))) out.push(name);
  return out;
}

async function safeRunProjectTask(args) {
  const dryRun = args.dry_run !== false;
  const root = await resolveAllowedRoot(args.root || ".");
  const { scripts } = await readPackageScripts(root.absolutePath);
  const scriptName = selectProjectScript(args, scripts);
  validateSafePackageScript(scriptName, scripts[scriptName]);
  const timeoutMs = Math.min(args.timeout_ms || 30000, MAX_COMMAND_TIMEOUT_MS);
  const maxOutputBytes = Math.min(args.max_output_bytes || 16000, MAX_COMMAND_OUTPUT_BYTES);
  const planned = { task: args.task, script: scriptName, command: `npm run ${scriptName}`, cwd: root.absolutePath, dry_run: dryRun, executed: false, timeout_ms: timeoutMs, max_output_bytes: maxOutputBytes };
  if (dryRun) return decorateToolResult("vnem_tools_run_project_task", { ...planned, action_policy_preview: actionPolicyPreview({ action_type: scriptName === "build" ? "run_build" : "run_test", proposed_action: planned.command }) }, { capability_group: "project_tasks", mutation: true, requires_approval: true });
  enforceActionPolicy(scriptName === "build" ? "run_build" : "run_test", args);
  const execution = await runProcess("npm", ["run", scriptName], { cwd: root.absolutePath, timeoutMs, maxOutputBytes });
  const result = { ...planned, dry_run: false, executed: true, ...execution };
  const log = await writeEvidenceLog("project_task", result);
  const withLog = { ...result, evidence_log_id: log.evidence_log_id };
  recordSession(args.session_id, "commands_run", withLog);
  return decorateToolResult("vnem_tools_run_project_task", withLog, { capability_group: "project_tasks", mutation: true, requires_approval: true });
}

async function readPackageScripts(root) {
  const packageJson = path.join(root, "package.json");
  if (!existsSync(packageJson)) throw new ToolsError("package.json not found for project task.", "package_json_missing");
  const pkg = JSON.parse(await readFile(packageJson, "utf8"));
  return { pkg, scripts: pkg.scripts || {} };
}

function selectProjectScript(args, scripts) {
  if (!PROJECT_TASKS.has(args.task)) throw new ToolsError("Unknown project task.", "unknown_project_task");
  const script = args.task === "custom_script" ? String(args.script || "") : args.task;
  if (!script || !Object.hasOwn(scripts, script)) throw new ToolsError("Requested package script was not found.", "script_not_found", { script });
  return script;
}

function validateSafePackageScript(name, body) {
  if (UNSAFE_PACKAGE_SCRIPT_PATTERN.test(name) || UNSAFE_PACKAGE_SCRIPT_PATTERN.test(String(body || ""))) throw new ToolsError("Unsafe package script blocked.", "unsafe_script_blocked", { script: name });
  if (CONTROL_OPERATOR_PATTERN.test(String(body || ""))) throw new ToolsError("Package script shell control operators are blocked.", "shell_operator_blocked", { script: name });
}

async function safeStartDevServer(args) {
  const dryRun = args.dry_run !== false;
  const root = await resolveAllowedRoot(args.root || ".");
  const script = String(args.script || "dev");
  if (!DEV_SERVER_SCRIPT_PATTERN.test(script)) throw new ToolsError("Only dev/start/preview scripts may be used for dev servers.", "unsafe_script_blocked", { script });
  const { scripts } = await readPackageScripts(root.absolutePath);
  if (!Object.hasOwn(scripts, script)) throw new ToolsError("Requested dev server script was not found.", "script_not_found", { script });
  validateSafePackageScript(script, scripts[script]);
  const port = Number(args.port || 3000);
  if (port < 3000 || port > 9999) throw new ToolsError("Dev server port must be in 3000-9999.", "port_blocked", { port });
  const host = String(args.host || "127.0.0.1");
  if (!["127.0.0.1", "localhost"].includes(host)) throw new ToolsError("Dev servers must bind/check localhost only.", "host_blocked", { host });
  const planned = { dry_run: dryRun, started: false, script, command: `npm run ${script} -- --host ${host} --port ${port}`, cwd: root.absolutePath, host, port, url: `http://${host}:${port}/`, registry: "in-memory per MCP process" };
  if (dryRun) return decorateToolResult("vnem_tools_start_dev_server", { ...planned, action_policy_preview: actionPolicyPreview({ action_type: "start_dev_server", proposed_action: planned.command }) }, { capability_group: "dev_server", mutation: true, network: true, requires_approval: true });
  enforceActionPolicy("start_dev_server", args);
  const child = spawn(spawnCommandName("npm"), ["run", script, "--", "--host", host, "--port", String(port)], {
    cwd: root.absolutePath,
    shell: shouldUseShellForCommand("npm"),
    windowsHide: true,
    detached: process.platform !== "win32"
  });
  const serverId = logId("dev-server");
  const record = { ...planned, dry_run: false, started: true, server_id: serverId, pid: child.pid, stdout: "", stderr: "", started_at: new Date().toISOString() };
  const collect = (field, chunk) => { record[field] = truncate(redactSecrets(record[field] + chunk.toString()), args.max_output_bytes || 8000); };
  child.stdout.on("data", (chunk) => collect("stdout", chunk));
  child.stderr.on("data", (chunk) => collect("stderr", chunk));
  child.on("exit", (code, signal) => { record.exit_code = code; record.signal = signal; record.running = false; });
  record.running = true;
  devServers.set(serverId, { child, record });
  await new Promise((resolve) => setTimeout(resolve, Math.min(args.wait_ms || 1000, 5000)));
  record.listener_pid = process.platform === "win32" ? await findWindowsListeningPid(port) : child.pid;
  const log = await writeEvidenceLog("dev_server_start", record, serverId);
  const withLog = { ...record, evidence_log_id: log.evidence_log_id };
  recordSession(args.session_id, "dev_servers_started", withLog);
  return decorateToolResult("vnem_tools_start_dev_server", withLog, { capability_group: "dev_server", mutation: true, network: true, requires_approval: true });
}

async function safeStopDevServer(args) {
  const entry = devServers.get(args.server_id);
  if (!entry) throw new ToolsError("Dev server id was not started by this Tools MCP process.", "dev_server_not_found", { server_id: args.server_id });
  enforceApproval(args);
  let stopCommand = null;
  let fallbackKillSent = false;
  let processGroupKillSent = false;
  const stopPid = entry.record.listener_pid || entry.record.pid;
  if (process.platform === "win32") {
    stopCommand = await runProcess(windowsTaskkillCommand(), ["/PID", String(stopPid), "/T", "/F"], { cwd: allowedRoots[0], timeoutMs: 5000, maxOutputBytes: 4000 });
    if (!stopCommand.ok) {
      try {
        fallbackKillSent = entry.child.kill("SIGKILL");
      } catch {}
    }
  } else {
    try {
      process.kill(-entry.child.pid, "SIGTERM");
      processGroupKillSent = true;
    } catch {
      fallbackKillSent = entry.child.kill("SIGTERM");
    }
  }
  const exited = await waitForChildExit(entry.child, 2000);
  const benignStopMiss = /not found|no running instance|not running/i.test(`${stopCommand?.stdout || ""}\n${stopCommand?.stderr || ""}`);
  if (stopCommand && !stopCommand.ok && !fallbackKillSent && !exited && !benignStopMiss) throw new ToolsError("Failed to stop Tools-started dev server process tree.", "dev_server_stop_failed", { stdout: stopCommand.stdout, stderr: stopCommand.stderr });
  if (!exited && process.platform !== "win32") {
    try {
      process.kill(-entry.child.pid, "SIGKILL");
      processGroupKillSent = true;
    } catch {
      fallbackKillSent = entry.child.kill("SIGKILL") || fallbackKillSent;
    }
    await waitForChildExit(entry.child, 1000);
  }
  devServers.delete(args.server_id);
  let listenerStopped = process.platform === "win32"
    ? (!entry.record.listener_pid || await waitForWindowsListenerStop(entry.record.listener_pid, entry.record.port, 1500))
    : await waitForLocalPortRelease(entry.record.host, entry.record.port, 5000);
  if (!listenerStopped && entry.record.listener_pid && process.platform === "win32") {
    try { process.kill(entry.record.listener_pid, "SIGKILL"); fallbackKillSent = true; } catch {}
    listenerStopped = await waitForWindowsListenerStop(entry.record.listener_pid, entry.record.port, 5000);
  }
  if (!listenerStopped && process.platform !== "win32") {
    try { process.kill(-entry.child.pid, "SIGKILL"); processGroupKillSent = true; } catch {}
    listenerStopped = await waitForLocalPortRelease(entry.record.host, entry.record.port, 3000);
  }
  if (!listenerStopped) throw new ToolsError("Tools-started localhost listener remained active after stop.", "dev_server_stop_failed", { server_id: args.server_id, listener_pid: entry.record.listener_pid, port: entry.record.port, stop_stdout: stopCommand?.stdout || "", stop_stderr: stopCommand?.stderr || "" });
  const result = { server_id: args.server_id, stopped: true, pid: entry.record.pid, listener_pid: entry.record.listener_pid || null, stop_pid: stopPid, url: entry.record.url, process_exit_observed: exited || entry.child.exitCode !== null || entry.child.signalCode !== null || listenerStopped, listener_stop_verified: listenerStopped, process_group_kill_sent: processGroupKillSent, fallback_kill_sent: fallbackKillSent, stop_stdout: stopCommand?.stdout || "", stop_stderr: stopCommand?.stderr || "" };
  const log = await writeEvidenceLog("dev_server_stop", result);
  const withLog = { ...result, evidence_log_id: log.evidence_log_id };
  recordSession(args.session_id, "dev_servers_stopped", withLog);
  return decorateToolResult("vnem_tools_stop_dev_server", withLog, { capability_group: "dev_server", mutation: true, requires_approval: true });
}

function windowsTaskkillCommand() {
  const systemRoot = process.env.SystemRoot || process.env.SYSTEMROOT;
  return systemRoot ? path.join(systemRoot, "System32", "taskkill.exe") : "taskkill";
}

async function findWindowsListeningPid(port) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const result = await runProcess(windowsNetstatCommand(), ["-ano", "-p", "tcp"], { cwd: allowedRoots[0], timeoutMs: 5000, maxOutputBytes: 64000 });
    const match = result.stdout.split(/\r?\n/).map((line) => line.trim().split(/\s+/)).find((parts) => parts.length >= 5 && /LISTENING/i.test(parts[3]) && parts[1]?.endsWith(`:${port}`));
    if (match) return Number(match[4]);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return null;
}

async function isWindowsPidListening(pid, port) {
  const result = await runProcess(windowsNetstatCommand(), ["-ano", "-p", "tcp"], { cwd: allowedRoots[0], timeoutMs: 5000, maxOutputBytes: 64000 });
  return result.stdout.split(/\r?\n/).map((line) => line.trim().split(/\s+/)).some((parts) => parts.length >= 5 && /LISTENING/i.test(parts[3]) && parts[1]?.endsWith(`:${port}`) && Number(parts[4]) === Number(pid));
}

async function waitForWindowsListenerStop(pid, port, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (!isPidRunning(pid)) return true;
    if (!(await isWindowsPidListening(pid, port))) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return !isPidRunning(pid) || !(await isWindowsPidListening(pid, port));
}

function isPidRunning(pid) {
  try { process.kill(Number(pid), 0); return true; }
  catch (error) { return error?.code !== "ESRCH"; }
}

function windowsNetstatCommand() {
  const systemRoot = process.env.SystemRoot || process.env.SYSTEMROOT;
  return systemRoot ? path.join(systemRoot, "System32", "netstat.exe") : "netstat";
}

async function waitForLocalPortRelease(host, port, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (!(await isLocalPortListening(host, port))) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return !(await isLocalPortListening(host, port));
}

async function isLocalPortListening(host, port) {
  return await new Promise((resolve) => {
    const socket = createConnection({ host, port });
    let settled = false;
    const finish = (listening) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(listening);
    };
    socket.setTimeout(250);
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.once("timeout", () => finish(false));
  });
}

async function waitForChildExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return true;
  return await new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.off("exit", onExit);
      resolve(false);
    }, timeoutMs);
    const onExit = () => {
      clearTimeout(timer);
      resolve(true);
    };
    child.once("exit", onExit);
  });
}

function listDevServers() {
  return { servers: [...devServers.values()].map(({ record }) => ({ server_id: record.server_id, pid: record.pid, script: record.script, url: record.url, running: record.running !== false, started_at: record.started_at })) };
}

async function startEvidenceSession(args) {
  const session = { session_id: logId("session"), task: args.task, started_at: new Date().toISOString(), actions_planned: arrayify(args.actions_planned), project_scans: [], patches_applied: [], commands_run: [], dev_servers_started: [], dev_servers_stopped: [], browser_captures: [], api_requests: [], restores: [], blocked_actions: [], git_commits: [] };
  sessions.set(session.session_id, session);
  const log = await writeEvidenceLog("session_start", session, session.session_id);
  return { ...session, evidence_log_id: log.evidence_log_id };
}

async function finishEvidenceSession(args) {
  const session = sessions.get(args.session_id);
  if (!session) throw new ToolsError("Session id not found.", "session_not_found", { session_id: args.session_id });
  const browserBlocked = session.browser_captures.some((item) => item.status && item.status !== "captured");
  const pack = {
    ...session,
    finished_at: new Date().toISOString(),
    test_results: arrayify(args.test_results).map(redactSecrets),
    safe_to_claim: ["Tools MCP session actions were evidence logged with secret redaction.", session.patches_applied.length ? "Patch batch changes were applied under allowed roots." : null, session.commands_run.length ? "Safe project task(s) were run." : null, session.git_commits.length ? "Approved local git commit(s) were created." : null].filter(Boolean),
    must_not_claim: [browserBlocked ? "Browser visual verification succeeded when capture was unavailable." : null, "Remote GitHub mutation or git push was performed.", "Package install/publish/deploy was performed.", "Secrets were read or exposed."].filter(Boolean),
    remaining_risks: ["Review generated diff and evidence before making final claims.", browserBlocked ? "Browser proof unavailable/blocked; do not claim visual proof." : null].filter(Boolean),
    recommended_final_report_lines: [
      `Tools session ${session.session_id} completed for: ${session.task}.`,
      session.patches_applied.length ? `Patch batches: ${session.patches_applied.length}.` : "No patch batch recorded.",
      session.commands_run.length ? `Project tasks run: ${session.commands_run.map((item) => item.command || item.script).join(", ")}.` : "No project task recorded.",
      session.browser_captures.length ? `Browser captures: ${session.browser_captures.map((item) => item.status).join(", ")}.` : "No browser capture recorded.",
      session.git_commits.length ? `Local git commits: ${session.git_commits.map((item) => item.commit_sha).filter(Boolean).join(", ")}.` : "No local git commit recorded."
    ],
    notes: redactSecrets(args.notes || "")
  };
  const log = await writeEvidenceLog("session_evidence", pack, session.session_id);
  return { ...pack, evidence_path: log.path, evidence_log_id: log.evidence_log_id };
}

function recordSession(sessionId, bucket, payload) {
  if (!sessionId || !sessions.has(sessionId)) return;
  const session = sessions.get(sessionId);
  if (!Array.isArray(session[bucket])) session[bucket] = [];
  session[bucket].push(JSON.parse(redactSecrets(JSON.stringify(payload))));
}

function recordToolError(sessionId, tool, error) {
  if (!sessionId || !sessions.has(sessionId)) return;
  recordSession(sessionId, "blocked_actions", { tool, code: error instanceof ToolsError ? error.code : "tools_unexpected_error", error: error.message || String(error) });
}


async function resolveGithubRoot(rootArg) { return await resolveAllowedRoot(rootArg || "."); }
function taskProgressTruthCheck(args = {}) {
  const proven = arrayify(args.proven);
  const tested = arrayify(args.tests_run || args.tested);
  const blocked = arrayify(args.blockers || args.blocked);
  const changed = arrayify(args.changed_files);
  let status = "not_attempted";
  if (blocked.length) status = "blocked";
  else if (args.simulated_only) status = "simulated_only";
  else if (changed.length && tested.length) status = "done";
  else if (changed.length || proven.length) status = "partially_done";
  else if (args.needs_user_action) status = "needs_user_action";
  const whatNot = [];
  if (status !== "done") whatNot.push("Do not claim done/complete.");
  if (!tested.length) whatNot.push("Do not claim tests passed.");
  if (blocked.length) whatNot.push("Do not claim blockers are resolved.");
  return { status, proven, tested, not_tested: tested.length ? [] : ["No verification command evidence provided."], blocked, github_live_proof_requirement: "For GitHub mutation claims, include exact GitHub URL, pushed SHA, PR/issue/comment/release URL, or live validation blocked reason.", repo_power_followup_tools: ["vnem_tools_no_placebo_progress_audit", "vnem_tools_evidence_pack"], next_action: blocked[0] || (tested.length ? "Verify CI/PR state and exact GitHub URL/live validation when GitHub mutation is claimed." : "Run targeted verification and record exact command output."), what_not_to_claim: whatNot, claim_status: status === "done" ? "claim_done_with_evidence" : "not_ready" };
}

async function safeGitStatus(args) {
  const root = await resolveAllowedRoot(args.root || ".");
  const execution = await runProcess("git", ["status", "--short"], { cwd: root.absolutePath, timeoutMs: 10000, maxOutputBytes: args.max_output_bytes || 12000 });
  const changed = execution.stdout.split(/\r?\n/).filter(Boolean).map((line) => ({ status: line.slice(0, 2).trim(), path: line.slice(3).trim() })).filter((item) => !isSecretLikePath(item.path));
  return { root: root.absolutePath, ok: execution.ok, changed_files: changed, raw_status: redactSecrets(execution.stdout), stderr: execution.stderr };
}

async function safeGitDiffSummary(args) {
  const root = await resolveAllowedRoot(args.root || ".");
  const maxBytes = Math.min(args.max_bytes || 16000, MAX_COMMAND_OUTPUT_BYTES);
  const statExec = await runProcess("git", ["diff", "--stat"], { cwd: root.absolutePath, timeoutMs: 10000, maxOutputBytes: maxBytes });
  const nameExec = await runProcess("git", ["diff", "--name-only"], { cwd: root.absolutePath, timeoutMs: 10000, maxOutputBytes: maxBytes });
  const files = nameExec.stdout.split(/\r?\n/).filter(Boolean).filter((file) => !isSecretLikePath(file));
  return { root: root.absolutePath, ok: statExec.ok && nameExec.ok, changed_files: files, summary: redactSecrets(statExec.stdout), truncated: statExec.stdout.length >= maxBytes };
}

async function safeGitCommit(args) {
  const dryRun = args.dry_run !== false;
  const root = await resolveAllowedRoot(args.root || ".");
  const files = [];
  for (const file of arrayify(args.files)) {
    const target = await resolveAllowedFile(path.join(root.absolutePath, file), { mustExist: true, blockSecrets: true });
    if (shouldSkipRelative(target.relativePath) || /(^|\/)\.tmp(\/|$)|\.log$/i.test(target.relativePath)) throw new ToolsError("Unsafe file blocked from git staging.", "unsafe_git_stage_path", { path: target.relativePath });
    files.push(target.relativePath);
  }
  if (/\b(push|reset --hard|deploy|publish)\b/i.test(args.message)) throw new ToolsError("Unsafe git commit message/action blocked.", "unsafe_git_action_blocked");
  const planned = { dry_run: dryRun, committed: false, root: root.absolutePath, files, message: redactSecrets(args.message), remote_mutation: false };
  if (dryRun) return decorateToolResult("vnem_tools_git_commit", { ...planned, action_policy_preview: actionPolicyPreview({ action_type: "local_commit", proposed_action: args.message }) }, { capability_group: "local_git", mutation: true, requires_approval: true });
  enforceActionPolicy("local_commit", args);
  await runProcess("git", ["add", "--", ...files], { cwd: root.absolutePath, timeoutMs: 10000, maxOutputBytes: 12000 });
  const commitExec = await runProcess("git", ["commit", "-m", args.message], { cwd: root.absolutePath, timeoutMs: 20000, maxOutputBytes: 20000 });
  if (!commitExec.ok) throw new ToolsError("git commit failed.", "git_commit_failed", { stderr: commitExec.stderr, stdout: commitExec.stdout });
  const shaExec = await runProcess("git", ["rev-parse", "HEAD"], { cwd: root.absolutePath, timeoutMs: 10000, maxOutputBytes: 2000 });
  const result = { ...planned, dry_run: false, committed: true, commit_sha: shaExec.stdout.trim(), stdout: commitExec.stdout, stderr: commitExec.stderr };
  const log = await writeEvidenceLog("git_commit", result);
  const withLog = { ...result, evidence_log_id: log.evidence_log_id };
  recordSession(args.session_id, "git_commits", withLog);
  return decorateToolResult("vnem_tools_git_commit", withLog, { capability_group: "local_git", mutation: true, requires_approval: true });
}

async function safeApiRequest(args) {
  const dryRun = args.dry_run !== false;
  const method = args.method || "GET";
  const timeoutMs = Math.min(args.timeout_ms || 10000, MAX_API_TIMEOUT_MS);
  const maxResponseBytes = Math.min(args.max_response_bytes || 16000, MAX_API_RESPONSE_BYTES);
  validateApiRequest(args);
  const url = new URL(args.url);
  const pack = findApiPack(args.api_pack_id);
  const planned = {
    api_pack_id: args.api_pack_id,
    api_pack_name: pack?.name || "unknown usable pack",
    url: redactUrl(url),
    method,
    dry_run: dryRun,
    executed: false,
    timeout_ms: timeoutMs,
    max_response_bytes: maxResponseBytes,
    policy: "GET/HEAD only; raw secrets blocked; live requests require approval; unknown URLs blocked unless trusted/localhost-test."
  };
  if (dryRun) return decorateToolResult("vnem_tools_api_request", { ...planned, action_policy_preview: actionPolicyPreview({ action_type: "api_call", proposed_action: `${method} ${planned.url}` }) }, { capability_group: "api_request", network: true, requires_approval: true });
  enforceActionPolicy("api_call", args);
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { method, headers: scrubHeadersForRequest(args.headers || {}), signal: controller.signal });
    const raw = Buffer.from(await response.arrayBuffer());
    const body = redactSecrets(raw.subarray(0, maxResponseBytes).toString("utf8"));
    const result = {
      ...planned,
      dry_run: false,
      executed: true,
      status: response.status,
      ok: response.ok,
      duration_ms: Date.now() - started,
      response_bytes: raw.length,
      response_truncated: raw.length > maxResponseBytes,
      response_summary: truncate(body, Math.min(1000, maxResponseBytes))
    };
    const log = await writeEvidenceLog("api_request", result);
    return { ...result, evidence_log_id: log.evidence_log_id };
  } finally {
    clearTimeout(timer);
  }
}

function validateApiRequest(args) {
  if (!["GET", "HEAD"].includes(args.method || "GET")) throw new ToolsError("Only GET/HEAD API methods are allowed in this foundation batch.", "method_blocked");
  if (args.body !== undefined && args.body !== null && JSON.stringify(args.body) !== "{}") throw new ToolsError("Request bodies are blocked in this foundation batch.", "request_body_blocked");
  const headers = args.headers || {};
  for (const [key, value] of Object.entries(headers)) {
    if (SECRET_HEADER_PATTERN.test(key) && !isSecretRef(value)) throw new ToolsError("Raw authorization/API-key headers are blocked. Use secret_ref in a future approved tool flow.", "raw_secret_blocked", { header: key });
    if (containsRawSecret(value)) throw new ToolsError("Raw secret-like values are blocked in API headers/body.", "raw_secret_blocked", { header: key });
  }
  const url = new URL(args.url);
  if (!isTrustedApiUrl(url, args.api_pack_id)) throw new ToolsError("Unknown or untrusted API URL blocked by default.", "untrusted_url_blocked", { host: url.host, api_pack_id: args.api_pack_id });
}

function findApiPack(id) {
  return arrayify(usablePacks.apis).find((pack) => pack.id === id || pack.id === String(id).replace(/^api:/, "") || `api:${pack.category}:${pack.id}` === id);
}

function isTrustedApiUrl(url, apiPackId) {
  if (["127.0.0.1", "localhost", "::1"].includes(url.hostname) && process.env.VNEM_TOOLS_ALLOW_LOCALHOST === "1") return true;
  if (url.protocol !== "https:") return false;
  const pack = findApiPack(apiPackId);
  if (!pack) return false;
  const sourceHosts = [pack.official_docs_url, ...arrayify(pack.verification_source_urls)]
    .map((item) => {
      try { return new URL(item).hostname.replace(/^www\./, ""); } catch { return null; }
    })
    .filter(Boolean);
  const host = url.hostname.replace(/^www\./, "");
  return sourceHosts.some((sourceHost) => host === sourceHost || host.endsWith(`.${sourceHost}`));
}

async function safeBrowserCapture(args) {
  const dryRun = args.dry_run !== false;
  const target = await buildBrowserTarget(args);
  const viewport = {
    width: Math.min(args.viewport_width || 1280, MAX_VIEWPORT_WIDTH),
    height: Math.min(args.viewport_height || 720, MAX_VIEWPORT_HEIGHT)
  };
  const waitMs = Math.min(args.wait_ms || 500, MAX_BROWSER_WAIT_MS);
  const maxBytes = Math.min(args.max_screenshot_bytes || 2 * 1024 * 1024, MAX_BROWSER_SCREENSHOT_BYTES);
  const planned = {
    status: dryRun ? "dry_run" : "planned",
    dry_run: dryRun,
    approved: args.approved === true,
    captured: false,
    url: redactUrl(target.url),
    source_type: target.source_type,
    file_path: target.file_path || null,
    viewport,
    wait_ms: waitMs,
    selector: args.selector || null,
    full_page: args.full_page !== false,
    screenshot_path: null,
    screenshot_sha256: null,
    screenshot_bytes: 0,
    browser_runtime_status: "not_checked_in_dry_run",
    safe_to_claim: [],
    must_not_claim: ["Browser screenshot evidence was captured.", "Visual proof was collected."]
  };
  if (dryRun) return { ...planned, action_policy_preview: actionPolicyPreview({ action_type: "browser_capture", proposed_action: target.url.toString() }) };
  enforceActionPolicy("browser_capture", args);
  const browser = await discoverBrowserRuntime();
  if (!browser) {
    const unavailable = {
      ...planned,
      status: "browser_unavailable",
      dry_run: false,
      browser_runtime_status: "unavailable",
      safe_to_claim: ["Browser screenshot capture was requested with approval but no browser runtime was available."],
      must_not_claim: ["Browser screenshot evidence was captured.", "Visual proof was collected.", "The page was visually verified in a browser."]
    };
    const log = await writeEvidenceLog("browser_capture", unavailable);
    const withLog = { ...unavailable, evidence_log_id: log.evidence_log_id };
    recordSession(args.session_id, "browser_captures", withLog);
    return withLog;
  }
  const screenshotsDir = path.join(evidenceRoot, "screenshots");
  await mkdir(screenshotsDir, { recursive: true });
  const captureId = logId("browser-capture");
  const screenshotPath = path.join(screenshotsDir, `${captureId}.png`);
  const profileDir = path.join(evidenceRoot, "browser-profiles", captureId);
  await mkdir(profileDir, { recursive: true });
  const browserArgs = [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--hide-scrollbars",
    `--user-data-dir=${profileDir}`,
    `--window-size=${viewport.width},${viewport.height}`,
    `--screenshot=${screenshotPath}`,
    `--virtual-time-budget=${Math.max(waitMs, 1)}`,
    target.url.toString()
  ];
  const execution = await runProcess(browser.command, browserArgs, { cwd: target.root || allowedRoots[0], timeoutMs: Math.min(waitMs + 15000, 20000), maxOutputBytes: 4000 });
  await rm(profileDir, { recursive: true, force: true }).catch(() => {});
  if (!execution.ok || !existsSync(screenshotPath)) {
    const unavailable = {
      ...planned,
      status: "browser_unavailable",
      dry_run: false,
      browser_runtime_status: "command_failed_or_no_screenshot",
      browser_command: browser.command,
      browser_error_summary: truncate(`${execution.stderr || ""}\n${execution.stdout || ""}`.trim(), 500),
      safe_to_claim: ["Browser screenshot capture was attempted but no screenshot evidence was produced."],
      must_not_claim: ["Browser screenshot evidence was captured.", "Visual proof was collected.", "The page was visually verified in a browser."]
    };
    const log = await writeEvidenceLog("browser_capture", unavailable);
    const withLog = { ...unavailable, evidence_log_id: log.evidence_log_id };
    recordSession(args.session_id, "browser_captures", withLog);
    return withLog;
  }
  const info = await stat(screenshotPath);
  if (info.size > maxBytes) {
    await rm(screenshotPath, { force: true }).catch(() => {});
    throw new ToolsError("Screenshot exceeded max_screenshot_bytes.", "screenshot_too_large", { bytes: info.size, max_screenshot_bytes: maxBytes });
  }
  const bytes = await readFile(screenshotPath);
  const result = {
    ...planned,
    status: "captured",
    dry_run: false,
    captured: true,
    screenshot_path: screenshotPath,
    screenshot_sha256: sha256(bytes),
    screenshot_bytes: info.size,
    browser_runtime_status: "available",
    browser_command: browser.command,
    safe_to_claim: ["Approved local browser screenshot evidence was captured.", `Screenshot saved to ${screenshotPath}.`],
    must_not_claim: ["External browsing was performed.", "Login/session/cookie/CAPTCHA automation was performed.", "Unlisted pages were visually verified."]
  };
  const log = await writeEvidenceLog("browser_capture", result, captureId);
  const withLog = { ...result, evidence_log_id: log.evidence_log_id };
  recordSession(args.session_id, "browser_captures", withLog);
  return withLog;
}

async function buildBrowserTarget(args) {
  const hasUrl = typeof args.url === "string" && args.url.trim();
  const hasFile = typeof args.file_path === "string" && args.file_path.trim();
  if ((hasUrl && hasFile) || (!hasUrl && !hasFile)) throw new ToolsError("Provide exactly one of url or file_path.", "browser_target_required");
  if (hasFile) {
    const workspaceRoot = await resolveAllowedRoot(args.workspace_root || ".");
    const raw = String(args.file_path).trim();
    const target = await resolveAllowedFile(path.isAbsolute(raw) ? raw : path.join(workspaceRoot.absolutePath, raw), { mustExist: true, blockSecrets: true });
    return { url: pathToFileURL(target.absolutePath), source_type: "file", file_path: target.relativePath, root: target.root };
  }
  const rawUrl = String(args.url).trim();
  if (containsRawSecret(rawUrl)) throw new ToolsError("Raw token/secret-like values are blocked in browser URLs.", "raw_secret_blocked");
  let url;
  try { url = new URL(rawUrl); } catch { throw new ToolsError("Invalid browser URL.", "invalid_url"); }
  if (["data:", "javascript:"].includes(url.protocol)) throw new ToolsError("data: and javascript: browser URLs are blocked.", "unsafe_browser_url_blocked");
  if (url.username || url.password) throw new ToolsError("Credentialed browser URLs are blocked.", "credentialed_url_blocked");
  if (url.protocol === "file:") {
    const target = await resolveAllowedFile(fileURLToPath(url), { mustExist: true, blockSecrets: true });
    return { url: pathToFileURL(target.absolutePath), source_type: "file", file_path: target.relativePath, root: target.root };
  }
  if (!["http:", "https:"].includes(url.protocol)) throw new ToolsError("Only local http(s) and file URLs are allowed.", "unsafe_browser_url_blocked");
  if (!["127.0.0.1", "localhost", "::1"].includes(url.hostname)) throw new ToolsError("External browser URLs are blocked by default.", "external_url_blocked", { host: url.host });
  return { url, source_type: "local_url", file_path: null, root: allowedRoots[0] };
}

async function discoverBrowserRuntime() {
  for (const command of BROWSER_CANDIDATES) {
    const version = await runProcess(command, ["--version"], { cwd: allowedRoots[0], timeoutMs: 3000, maxOutputBytes: 2000 });
    if (version.ok) return { command, version: truncate(version.stdout || version.stderr, 200) };
  }
  return null;
}

function formatBrowserCapture(capture) {
  return [
    `vnem_tools_browser_capture: ${capture.status}`,
    `target: ${capture.url}`,
    `viewport: ${capture.viewport.width}x${capture.viewport.height}`,
    capture.screenshot_path ? `screenshot: ${capture.screenshot_path}` : "screenshot: none",
    capture.screenshot_sha256 ? `sha256: ${capture.screenshot_sha256}` : "",
    `evidence: ${capture.evidence_log_id || "not written"}`
  ].filter(Boolean).join("\n");
}

function isSecretRef(value) {
  if (value && typeof value === "object" && typeof value.secret_ref === "string" && value.secret_ref.trim()) return true;
  return typeof value === "string" && /^secret_ref:[a-z0-9_.:/-]+$/i.test(value.trim());
}

function scrubHeadersForRequest(headers) {
  const clean = {};
  for (const [key, value] of Object.entries(headers || {})) {
    if (isSecretRef(value)) continue;
    clean[key] = String(value);
  }
  return clean;
}

async function collectEvidence(args) {
  const changedFiles = arrayify(args.changed_files);
  const commandsRun = arrayify(args.commands_run).map(redactSecrets);
  const apiRequests = arrayify(args.api_requests).map(redactSecrets);
  const tests = arrayify(args.test_results);
  const screenshots = arrayify(args.screenshots).map(redactSecrets);
  const visualChecks = arrayify(args.visual_checks).map(redactSecrets);
  const browserCaptures = arrayify(args.browser_captures).map(normalizeBrowserEvidence);
  const capturedBrowser = browserCaptures.filter((item) => item.status === "captured" && item.screenshot_path);
  const blockedBrowser = browserCaptures.filter((item) => item.status && item.status !== "captured");
  const screenshotPaths = [...new Set([...screenshots, ...capturedBrowser.map((item) => item.screenshot_path)].filter(Boolean))];
  const screenshotHashes = [...new Set(capturedBrowser.map((item) => item.screenshot_sha256).filter(Boolean))];
  const visualEvidencePresent = screenshotPaths.length > 0 || capturedBrowser.length > 0;
  const evidenceId = logId("evidence");
  const safeToClaim = [
    "Approved Tools MCP actions were run with evidence logs.",
    changedFiles.length ? `Patch/file changes were applied only to listed file(s): ${changedFiles.join(", ")}.` : null,
    commandsRun.length ? `Verification command(s) were run: ${commandsRun.join(", ")}.` : null,
    tests.length ? `Verification result(s) were recorded: ${tests.join("; ")}.` : null,
    apiRequests.length ? `Approved API request evidence was collected for: ${apiRequests.join(", ")}.` : null,
    visualEvidencePresent ? "Approved local browser screenshot evidence was captured." : null,
    visualChecks.length ? `Visual check note(s) were recorded: ${visualChecks.join("; ")}.` : null,
    "Secrets were redacted from Tools MCP evidence output."
  ].filter(Boolean);
  const mustNotClaim = [
    visualEvidencePresent ? null : "Browser screenshots were captured.",
    visualEvidencePresent ? null : "Visual/browser verification was performed.",
    blockedBrowser.length ? "Browser screenshot capture succeeded when it was unavailable or blocked." : null,
    apiRequests.length ? null : "Live API calls were performed.",
    "GitHub changes were pushed.",
    "Package installs were performed.",
    "Unlisted files were changed."
  ].filter(Boolean);
  const remainingRisks = [
    "Only claims backed by listed evidence should be made.",
    visualEvidencePresent ? null : blockedBrowser.length ? "Browser screenshot proof was requested but unavailable/blocked; do not claim visual proof." : "No browser visual proof was collected in this Tools MCP run.",
    apiRequests.length ? null : "No live API call evidence was collected in this run.",
    "Unsupported GitHub/install/secret-backed API/Giga actions remain future work."
  ].filter(Boolean);
  const recommendedLines = [
    changedFiles.length ? `Patch applied to: ${changedFiles.join(", ")}.` : "No file changes were recorded.",
    commandsRun.length ? `Verification command passed/recorded: ${commandsRun.join(", ")}.` : "No verification command was recorded.",
    `Evidence collected: ${evidenceId}.`,
    visualEvidencePresent ? `Browser screenshot evidence captured: ${screenshotPaths.join(", ")}.` : blockedBrowser.length ? "Browser proof was requested but browser capture was unavailable or blocked; do not claim visual verification." : "No browser visual proof was performed; do not claim visual verification.",
    apiRequests.length ? `API request evidence recorded: ${apiRequests.join(", ")}.` : "No live API call was performed; do not claim live API verification."
  ];
  const proofBridge = {
    evidence_id: evidenceId,
    task: args.task,
    safe_to_claim: safeToClaim,
    must_not_claim: mustNotClaim,
    changed_files: changedFiles,
    commands_run: commandsRun,
    api_requests: apiRequests,
    tests,
    visual_evidence: visualChecks,
    browser_evidence: browserCaptures,
    screenshot_paths: screenshotPaths,
    screenshot_hashes: screenshotHashes,
    blocked_actions: visualEvidencePresent ? [] : ["browser_screenshot_not_collected"],
    remaining_risks: remainingRisks,
    recommended_final_report_lines: recommendedLines,
    recommended_core_proof_trail_inputs: {
      task: args.task,
      capability_ids_used: ["vnem_tools_collect_evidence"],
      changed_files: changedFiles,
      commands_run: commandsRun,
      tests_or_checks: tests,
      visual_evidence: screenshotPaths.length ? screenshotPaths : visualChecks,
      remaining_risks: remainingRisks,
      final_claim: recommendedLines.join(" ")
    }
  };
  const evidence = {
    evidence_id: evidenceId,
    generated_at: new Date().toISOString(),
    task: args.task,
    summary: `Evidence for ${args.task}: ${changedFiles.length} changed file(s), ${commandsRun.length} command(s), ${apiRequests.length} API request(s).`,
    tool_run_ids: arrayify(args.tool_run_ids),
    changed_files: changedFiles,
    commands_run: commandsRun,
    api_requests: apiRequests,
    tests,
    screenshots: screenshotPaths,
    visual_checks: visualChecks,
    browser_captures: browserCaptures,
    screenshot_hashes: screenshotHashes,
    blocked_actions: proofBridge.blocked_actions,
    remaining_risks: remainingRisks,
    safe_to_claim: safeToClaim,
    must_not_claim: mustNotClaim,
    proof_trail_compatible_summary: proofBridge,
    notes: redactSecrets(args.notes || "")
  };
  const log = await writeEvidenceLog("evidence", evidence, evidence.evidence_id);
  return { ...evidence, evidence_path: log.path };
}

function normalizeBrowserEvidence(item) {
  if (typeof item === "string") {
    return { status: "captured", screenshot_path: redactSecrets(item), screenshot_sha256: null, source: "screenshot_path" };
  }
  const raw = item && typeof item === "object" ? item : {};
  return {
    status: raw.status || (raw.screenshot_path ? "captured" : "unknown"),
    captured: raw.captured === true,
    screenshot_path: raw.screenshot_path ? redactSecrets(raw.screenshot_path) : null,
    screenshot_sha256: raw.screenshot_sha256 || null,
    screenshot_bytes: raw.screenshot_bytes || 0,
    url: raw.url ? redactSecrets(raw.url) : null,
    file_path: raw.file_path ? redactSecrets(raw.file_path) : null,
    selector: raw.selector || null,
    viewport: raw.viewport || null,
    evidence_log_id: raw.evidence_log_id || null,
    browser_runtime_status: raw.browser_runtime_status || null
  };
}




function registerCloudflareTools(mcpServer) {
  const commonMutation = { dry_run: z.boolean().default(true), approval_phrase: z.string().default(""), protected_resources: z.array(z.string()).default([]), protected_acknowledgment: z.string().default(""), simulate: z.boolean().default(false), session_id: z.string().optional() };
  mcpServer.registerTool("vnem_tools_cloudflare_status", { title: "Cloudflare Status", description: "Detect Wrangler, credential references, account/profile readiness, and optional live token status without printing secrets.", inputSchema: { live_check: z.boolean().default(false) }, annotations: NETWORK_ACTION }, async (args) => withToolErrors(async () => { const result = decorateCloudflareResult("status", await cloudflareStatus(args), args); return toolResult(formatCloudflare("cloudflare_status", result), { cloudflare_status: result }); }));
  mcpServer.registerTool("vnem_tools_cloudflare_auth_plan", { title: "Cloudflare Auth Plan", description: "Plan safe Wrangler/API-token authentication without cookies, sessions, scraping, or token leaks.", inputSchema: { access_goal: z.string().default("least_privilege") }, annotations: READ_ONLY_LOCAL }, async (args) => withToolErrors(async () => { const result = decorateCloudflareResult("auth_plan", cloudflareAuthPlan(args), args); return toolResult(formatCloudflare("cloudflare_auth_plan", result), { cloudflare_auth_plan: result }); }));
  mcpServer.registerTool("vnem_tools_cloudflare_accounts_list", { title: "Cloudflare Accounts List", description: "List accessible Cloudflare accounts read-only using API when authenticated.", inputSchema: { simulate: z.boolean().default(false) }, annotations: NETWORK_ACTION }, async (args) => withToolErrors(async () => { const result = decorateCloudflareResult("accounts_list", await cloudflareAccountsList(args), args); return toolResult(formatCloudflare("cloudflare_accounts_list", result), { cloudflare_accounts_list: result }); }));
  mcpServer.registerTool("vnem_tools_cloudflare_projects_list", { title: "Cloudflare Projects List", description: "List Cloudflare Pages projects and Workers scripts read-only.", inputSchema: { account_id: z.string().optional(), simulate: z.boolean().default(false) }, annotations: NETWORK_ACTION }, async (args) => withToolErrors(async () => { const result = decorateCloudflareResult("projects_list", await cloudflareProjectsList(args), args); return toolResult(formatCloudflare("cloudflare_projects_list", result), { cloudflare_projects_list: result }); }));
  mcpServer.registerTool("vnem_tools_cloudflare_pages_deploy_plan", { title: "Cloudflare Pages Deploy Plan", description: "Inspect framework, build script, Wrangler config, and output artifact before a Pages deploy.", inputSchema: { project_dir: z.string().default("."), project_name: z.string().min(1), branch: z.string().default(""), build_command: z.string().default(""), output_dir: z.string().default(""), environment: z.string().default("preview"), protected_resources: z.array(z.string()).default([]) }, annotations: READ_ONLY_LOCAL }, async (args) => withToolErrors(async () => { const result = decorateCloudflareResult("pages_deploy_plan", await cloudflarePagesDeployPlan(args), args); return toolResult(formatCloudflare("pages_deploy_plan", result), { pages_deploy_plan: result }); }));
  mcpServer.registerTool("vnem_tools_cloudflare_pages_deploy", { title: "Cloudflare Pages Deploy", description: "Execute an approved local-Wrangler Pages deploy and require command plus bounded URL evidence.", inputSchema: { project_dir: z.string().default("."), project_name: z.string().min(1), branch: z.string().default(""), build_command: z.string().default(""), output_dir: z.string().default(""), environment: z.string().default("preview"), expected_body_marker: z.string().default(""), ...commonMutation }, annotations: NETWORK_ACTION }, async (args) => withToolErrors(async () => { const result = decorateCloudflareResult("pages_deploy", await cloudflarePagesDeploy(args), args); return toolResult(formatCloudflare("pages_deploy", result), { pages_deploy: result }); }));
  mcpServer.registerTool("vnem_tools_cloudflare_workers_deploy_plan", { title: "Cloudflare Workers Deploy Plan", description: "Plan Cloudflare Worker deploy and inspect Wrangler config when present.", inputSchema: { project_dir: z.string().default("."), script_name: z.string().default(""), entrypoint: z.string().default(""), environment: z.string().default("preview"), build_command: z.string().default(""), protected_resources: z.array(z.string()).default([]) }, annotations: READ_ONLY_LOCAL }, async (args) => withToolErrors(async () => { const result = decorateCloudflareResult("workers_deploy_plan", await cloudflareWorkersDeployPlan(args), args); return toolResult(formatCloudflare("workers_deploy_plan", result), { workers_deploy_plan: result }); }));
  mcpServer.registerTool("vnem_tools_cloudflare_workers_deploy", { title: "Cloudflare Workers Deploy", description: "Execute approved Cloudflare Worker deploy via Wrangler and write evidence pack.", inputSchema: { project_dir: z.string().default("."), script_name: z.string().default(""), entrypoint: z.string().default(""), environment: z.string().default("preview"), build_command: z.string().default(""), ...commonMutation }, annotations: NETWORK_ACTION }, async (args) => withToolErrors(async () => { const result = decorateCloudflareResult("workers_deploy", await cloudflareWorkersDeploy(args), args); return toolResult(formatCloudflare("workers_deploy", result), { workers_deploy: result }); }));
  mcpServer.registerTool("vnem_tools_cloudflare_dns_plan", { title: "Cloudflare DNS Plan", description: "Plan DNS create/update/delete and flag protected resources.", inputSchema: { zone_name: z.string().min(1), record_name: z.string().min(1), record_type: z.string().min(1), record_value: z.string().default(""), proxied: z.boolean().optional(), ttl: z.number().int().optional(), operation: z.string().default("create"), protected_resources: z.array(z.string()).default([]), simulate: z.boolean().default(false) }, annotations: READ_ONLY_LOCAL }, async (args) => withToolErrors(async () => { const result = decorateCloudflareResult("dns_plan", await cloudflareDnsPlan(args), args); return toolResult(formatCloudflare("dns_plan", result), { dns_plan: result }); }));
  mcpServer.registerTool("vnem_tools_cloudflare_dns_apply", { title: "Cloudflare DNS Apply", description: "Apply approved DNS create/update/delete with before/after evidence and protected-resource gates.", inputSchema: { zone_name: z.string().min(1), record_name: z.string().min(1), record_type: z.string().min(1), record_value: z.string().default(""), proxied: z.boolean().optional(), ttl: z.number().int().optional(), operation: z.string().default("create"), ...commonMutation }, annotations: NETWORK_ACTION }, async (args) => withToolErrors(async () => { const result = decorateCloudflareResult("dns_apply", await cloudflareDnsApply(args), args); return toolResult(formatCloudflare("dns_apply", result), { dns_apply: result }); }));
  mcpServer.registerTool("vnem_tools_cloudflare_env_plan", { title: "Cloudflare Env/Secrets Plan", description: "Plan Cloudflare Pages/Workers env var and secret changes with values redacted.", inputSchema: { target_type: z.enum(["pages", "workers"]).default("workers"), target_name: z.string().min(1), environment: z.string().default("production"), variables: z.array(z.record(z.any())).default([]), protected_resources: z.array(z.string()).default([]) }, annotations: READ_ONLY_LOCAL }, async (args) => withToolErrors(async () => { const result = decorateCloudflareResult("env_plan", cloudflareEnvPlan(args), args); return toolResult(formatCloudflare("env_plan", result), { env_plan: result }); }));
  mcpServer.registerTool("vnem_tools_cloudflare_env_apply", { title: "Cloudflare Env/Secrets Apply", description: "Apply approved env/secret changes without printing values and with evidence pack.", inputSchema: { target_type: z.enum(["pages", "workers"]).default("workers"), target_name: z.string().min(1), environment: z.string().default("production"), variables: z.array(z.record(z.any())).default([]), ...commonMutation }, annotations: NETWORK_ACTION }, async (args) => withToolErrors(async () => { const result = decorateCloudflareResult("env_apply", await cloudflareEnvApply(args), args); return toolResult(formatCloudflare("env_apply", result), { env_apply: result }); }));
  mcpServer.registerTool("vnem_tools_cloudflare_deploy_verify", { title: "Cloudflare Deploy Verify", description: "Verify bounded HTTP status, markers, redirects, and optional exact Pages deployment metadata.", inputSchema: { deployment_url: z.string().default(""), expected_status: z.number().int().default(200), expected_body_marker: z.string().default(""), expected_title: z.string().default(""), simulate: z.boolean().default(false), account_id: z.string().optional(), project_name: z.string().optional(), deployment_id: z.string().optional(), script_name: z.string().optional() }, annotations: NETWORK_ACTION }, async (args) => withToolErrors(async () => { const result = decorateCloudflareResult("deploy_verify", await cloudflareDeployVerify(args), args); return toolResult(formatCloudflare("deploy_verify", result), { deploy_verify: result }); }));
  mcpServer.registerTool("vnem_tools_cloudflare_rollback_plan", { title: "Cloudflare Rollback Plan", description: "Identify an exact prior Pages deployment or Worker version before rollback.", inputSchema: { target_type: z.enum(["pages", "workers"]).default("pages"), project_dir: z.string().default("."), account_id: z.string().optional(), project_name: z.string().default(""), script_name: z.string().default(""), deployment_id: z.string().default(""), version_id: z.string().default(""), discover: z.boolean().default(true), simulate: z.boolean().default(false), protected_resources: z.array(z.string()).default([]) }, annotations: NETWORK_ACTION }, async (args) => withToolErrors(async () => { const result = decorateCloudflareResult("rollback_plan", await cloudflareRollbackPlan(args), args); return toolResult(formatCloudflare("rollback_plan", result), { rollback_plan: result }); }));
  mcpServer.registerTool("vnem_tools_cloudflare_rollback", { title: "Cloudflare Rollback", description: "Execute approved Pages API or exact Worker-version rollback with evidence.", inputSchema: { target_type: z.enum(["pages", "workers"]).default("pages"), project_dir: z.string().default("."), account_id: z.string().optional(), project_name: z.string().default(""), script_name: z.string().default(""), deployment_id: z.string().default(""), version_id: z.string().default(""), discover: z.boolean().default(true), rollback_message: z.string().default("VNEM approved rollback"), ...commonMutation }, annotations: NETWORK_ACTION }, async (args) => withToolErrors(async () => { const result = decorateCloudflareResult("rollback", await cloudflareRollback(args), args); return toolResult(formatCloudflare("rollback", result), { rollback: result }); }));
  mcpServer.registerTool("vnem_tools_cloudflare_cache_purge_plan", { title: "Cloudflare Cache Purge Plan", description: "Plan Cloudflare cache purge.", inputSchema: { zone_name: z.string().min(1), files: z.array(z.string()).default([]), purge_everything: z.boolean().default(false), protected_resources: z.array(z.string()).default([]) }, annotations: READ_ONLY_LOCAL }, async (args) => withToolErrors(async () => { const result = decorateCloudflareResult("cache_purge_plan", await cloudflareCachePurgePlan(args), args); return toolResult(formatCloudflare("cache_purge_plan", result), { cache_purge_plan: result }); }));
  mcpServer.registerTool("vnem_tools_cloudflare_cache_purge", { title: "Cloudflare Cache Purge", description: "Execute approved Cloudflare cache purge with evidence pack.", inputSchema: { zone_name: z.string().min(1), files: z.array(z.string()).default([]), purge_everything: z.boolean().default(false), ...commonMutation }, annotations: NETWORK_ACTION }, async (args) => withToolErrors(async () => { const result = decorateCloudflareResult("cache_purge", await cloudflareCachePurge(args), args); return toolResult(formatCloudflare("cache_purge", result), { cache_purge: result }); }));
  mcpServer.registerTool("vnem_tools_cloudflare_error_diagnose", { title: "Cloudflare Error Diagnose", description: "Classify a redacted Wrangler or Cloudflare API failure and return the narrowest safe recovery.", inputSchema: { operation: z.string().default(""), code: z.string().default(""), message: z.string().default(""), status: z.number().int().optional(), stdout: z.string().default(""), stderr: z.string().default("") }, annotations: READ_ONLY_LOCAL }, async (args) => withToolErrors(async () => { const result = decorateCloudflareResult("error_diagnose", cloudflareErrorDiagnose(args), args); return toolResult(formatCloudflare("cloudflare_error_diagnose", result), { cloudflare_error_diagnosis: result }); }));
  mcpServer.registerTool("vnem_tools_evidence_pack_audit", { title: "Tools Evidence Pack Audit", description: "Audit mutation evidence pack completeness and fake-success prevention.", inputSchema: { evidence_pack_path: z.string().min(1) }, annotations: READ_ONLY_LOCAL }, async (args) => withToolErrors(async () => { const result = await evidencePackAudit(args); return toolResult(formatCloudflare("evidence_pack_audit", result), { evidence_pack_audit: result }); }));
  mcpServer.registerTool("vnem_tools_mutation_approval_contract", { title: "Tools Mutation Approval Contract", description: "Check exact approval phrase for mutation/destructive operations.", inputSchema: { operation: z.string().min(1), destructive: z.boolean().default(false), approval_phrase: z.string().default(""), protected_resource_risk: z.array(z.string()).default([]) }, annotations: READ_ONLY_LOCAL }, async (args) => withToolErrors(async () => { const result = mutationApprovalContract(args); return toolResult(formatCloudflare("mutation_approval_contract", result), { mutation_approval_contract: result }); }));
  mcpServer.registerTool("vnem_tools_secret_redaction_check", { title: "Tools Secret Redaction Check", description: "Detect and redact secret/token patterns including Cloudflare tokens.", inputSchema: { text: z.string().default(""), secret_values: z.array(z.string()).default([]) }, annotations: READ_ONLY_LOCAL }, async (args) => withToolErrors(async () => { const result = secretRedactionCheck(args); return toolResult(formatCloudflare("secret_redaction_check", result), { secret_redaction_check: result }); }));
}

function buildCloudflareStatusPolicy() {
  return cloudflareControlRuntime.policy();
}

async function cloudflareStatus(args = {}) {
  return await cloudflareControlRuntime.status(args);
}

function cloudflareAuthPlan(args = {}) {
  return cloudflareControlRuntime.authPlan(args);
}

async function cloudflareAccountsList(args = {}) {
  return await cloudflareControlRuntime.accountsList(args);
}

async function cloudflareProjectsList(args = {}) {
  return await cloudflareControlRuntime.projectsList(args);
}

async function cloudflarePagesDeployPlan(args) {
  return await cloudflareControlRuntime.pagesDeployPlan(args);
}

async function cloudflareWorkersDeployPlan(args) {
  return await cloudflareControlRuntime.workersDeployPlan(args);
}

async function cloudflarePagesDeploy(args) {
  return await cloudflareControlRuntime.pagesDeploy(args);
}

async function cloudflareWorkersDeploy(args) {
  return await cloudflareControlRuntime.workersDeploy(args);
}

async function cloudflareDnsPlan(args) {
  return await cloudflareControlRuntime.dnsPlan(args);
}

async function cloudflareDnsApply(args) {
  return await cloudflareControlRuntime.dnsApply(args);
}

function cloudflareEnvPlan(args) {
  return cloudflareControlRuntime.envPlan(args);
}

async function cloudflareEnvApply(args) {
  return await cloudflareControlRuntime.envApply(args);
}

async function cloudflareDeployVerify(args) {
  return await cloudflareControlRuntime.deployVerify(args);
}

async function cloudflareRollbackPlan(args) {
  return await cloudflareControlRuntime.rollbackPlan(args);
}

async function cloudflareRollback(args) {
  return await cloudflareControlRuntime.rollback(args);
}

async function cloudflareCachePurgePlan(args) {
  return await cloudflareControlRuntime.cachePurgePlan(args);
}

async function cloudflareCachePurge(args) {
  return await cloudflareControlRuntime.cachePurge(args);
}

async function evidencePackAudit(args) {
  return await cloudflareControlRuntime.evidencePackAudit(args);
}

function mutationApprovalContract(args) {
  return cloudflareControlRuntime.mutationApprovalContract(args);
}

function secretRedactionCheck(args) {
  return cloudflareControlRuntime.secretRedactionCheck(args);
}

function cloudflareErrorDiagnose(args) {
  return cloudflareControlRuntime.errorDiagnose(args);
}

function safeRedactJsonValue(value, extraSecrets = []) {
  if (Array.isArray(value)) return value.map((item) => safeRedactJsonValue(item, extraSecrets));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, val]) => {
    if (/value|token|secret|password|credential|api[_-]?key/i.test(key) && typeof val === "string") return [key, "[REDACTED]"];
    return [key, safeRedactJsonValue(val, extraSecrets)];
  }));
  if (typeof value === "string") return redactSecrets(value, extraSecrets);
  return value;
}
function formatCloudflare(label, result) { return [`vnem_tools_${label}: ${result?.operation || result?.capability_status || result?.source || "ok"}`, `permission_profile: ${activePermissionProfile.profile_name}`, `secrets_redacted: true`].join("\n"); }

async function writeEvidenceLog(kind, payload, existingId) {
  const evidenceLogId = existingId || logId(kind);
  const file = path.join(evidenceRoot, `${evidenceLogId}.json`);
  await mkdir(path.dirname(file), { recursive: true });
  const redactedPayload = safeRedactJsonValue({ kind, evidence_log_id: evidenceLogId, generated_at: new Date().toISOString(), payload });
  await writeFile(file, JSON.stringify(redactedPayload, null, 2), "utf8");
  return { evidence_log_id: evidenceLogId, path: file };
}

function enforceApproval(args) {
  if (args.approved !== true || !String(args.approval_note || "").trim()) {
    throw new ToolsError("Real Tools MCP actions require dry_run=false, approved=true, and a non-empty approval_note.", "approval_required");
  }
}

function isSecretLikePath(targetPath) {
  const parts = normalizePath(targetPath).toLowerCase().split("/");
  return parts.some((part) => part === ".env" || part.startsWith(".env.") || /(^|[._-])(secret|token|tokens|credential|credentials|password|passwd|api[_-]?key|private[_-]?key|id_rsa|id_ed25519|cookies?|sessions|browser[_-]?profile|password[_-]?manager)([._-]|$)/i.test(part) || /\.(pem|key|p12|pfx)$/i.test(part));
}

function shouldSkipRelative(rel) {
  return normalizePath(rel).split("/").some((part) => SKIPPED_DIRS.has(part));
}

function skippedPolicy() {
  return ["secret-like files", ".git", "node_modules", "dist/build outputs", "binary/large files where applicable"];
}

function isInsideAny(candidate, roots) {
  return roots.some((root) => isInsidePath(root, candidate));
}

function findContainingRoot(candidate) {
  const absolute = path.resolve(candidate);
  return allowedRoots.find((root) => isInsidePath(root, absolute)) || allowedRoots[0];
}

function isInsidePath(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function relativeToAllowed(candidate) {
  return normalizePath(path.relative(findContainingRoot(candidate), path.resolve(candidate)));
}

function normalizePath(value) {
  return String(value || "").replace(/\\/g, "/");
}

function matchesSimpleFilter(rel, filter) {
  const value = normalizePath(rel).toLowerCase();
  const pattern = String(filter || "").toLowerCase().trim();
  if (!pattern || pattern === "*") return true;
  if (pattern.startsWith("*.")) return value.endsWith(pattern.slice(1));
  return value.includes(pattern.replace(/\*/g, ""));
}

function redactSecrets(value, extraSecrets = []) {
  let text = String(value ?? "");
  for (const secret of arrayify(extraSecrets)) {
    const raw = String(secret || "");
    if (raw) text = text.split(raw).join("[REDACTED]");
  }
  return text
    .replace(/(authorization\s*[:=]\s*)(bearer\s+)?[^\s"'{}]+/gi, "$1[REDACTED]")
    .replace(/((api[_-]?key|token|secret|password|credential)["']?\s*[:=]\s*["']?)[^\s"'{}]+/gi, "$1[REDACTED]")
    .replace(/(CLOUDFLARE_API_TOKEN|CF_API_TOKEN|CF_TOKEN)\s*[:=]\s*[^\s"'{}]+/gi, "$1=[REDACTED]")
    .replace(/(X-Auth-Email\s*[:=]\s*)[^\s"'{}]+/gi, "$1[REDACTED]")
    .replace(/(X-Auth-Key\s*[:=]\s*)[^\s"'{}]+/gi, "$1[REDACTED]")
    .replace(/cfut_[A-Za-z0-9_-]{10,}/g, "[REDACTED]")
    .replace(/bearer\s+[a-z0-9._~+/-]+/gi, "Bearer [REDACTED]")
    .replace(/(should|sample)-redact-[a-z0-9-]+/gi, "[REDACTED]")
    .replace(/github_pat_[A-Za-z0-9_]{20,}/g, "[REDACTED]")
    .replace(/gh[pousr]_[A-Za-z0-9_]{20,}/g, "[REDACTED]")
    .replace(/\bSECRET_TOKEN_VALUE\b/g, "[REDACTED]")
    .replace(/sk-[A-Za-z0-9_-]{10,}/g, "[REDACTED]");
}

function containsRawSecret(value) {
  if (isSecretRef(value)) return false;
  const text = typeof value === "string" ? value : JSON.stringify(value || "");
  return /bearer\s+|api[_-]?key\s*[:=]|token\s*[:=]|secret\s*[:=]|password\s*[:=]|CLOUDFLARE_API_TOKEN\s*[:=]|CF_API_TOKEN\s*[:=]|CF_TOKEN\s*[:=]|cfut_[A-Za-z0-9_-]{10,}|github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{10,}|SECRET_TOKEN_VALUE/i.test(text);
}

function redactUrl(url) {
  const copy = new URL(url.toString());
  for (const key of [...copy.searchParams.keys()]) {
    if (/token|secret|key|password|credential/i.test(key)) copy.searchParams.set(key, "[REDACTED]");
  }
  return copy.toString();
}

function truncate(value, max = 1000) {
  const text = String(value ?? "");
  return text.length > max ? `${text.slice(0, max)}\n[truncated ${text.length - max} chars]` : text;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function countOccurrences(text, search) {
  if (!search) return 0;
  let count = 0;
  let index = 0;
  while ((index = text.indexOf(search, index)) !== -1) {
    count += 1;
    index += search.length;
  }
  return count;
}

function arrayify(value) {
  return Array.isArray(value) ? value.filter((item) => item !== undefined && item !== null) : value === undefined || value === null ? [] : [value];
}

function logId(prefix) {
  return `${prefix}-${Date.now()}-${randomUUID().slice(0, 8)}`;
}

function formatManifest(manifest) {
  return [`vnem_tools_manifest: ${manifest.tools.length} tool(s)`, `Groups: ${manifest.capability_groups.join(", ")}`, `Unsafe unsupported: ${manifest.unsafe_actions_not_supported.join(", ")}`].join("\n");
}

function formatWorkspaceMap(map) {
  return [`vnem_tools_workspace_map: ${map.workspace_root}`, `Entries: ${map.tree_summary.length}`, `Entrypoints: ${map.likely_entrypoints.join(", ") || "none"}`, `Evidence: ${map.evidence_log_id}`].join("\n");
}

function formatReadManyFiles(result) {
  return [`vnem_tools_read_many_files: ${result.files.length} file(s) read`, `Blocked: ${result.blocked_files.length}`, `Bytes: ${result.total_bytes}`, `Evidence: ${result.evidence_log_id}`].join("\n");
}

function formatCodeSearch(result) {
  return [`vnem_tools_code_search: ${result.result_count} match(es)`, `Query: ${result.query}`, `Evidence: ${result.evidence_log_id}`].join("\n");
}

function formatFindReferences(result) {
  return [`vnem_tools_find_references: ${result.symbol}`, `References: ${result.result_count}`, `Likely definitions: ${result.likely_definition_files.join(", ") || "none"}`].join("\n");
}

function formatDependencyScan(result) {
  return [`vnem_tools_dependency_scan: ${result.package_manager}`, `Manifests: ${result.manifest_files.join(", ") || "none"}`, `Safe scripts: ${result.safe_scripts.map((item) => item.name).join(", ") || "none"}`, `Risky scripts: ${result.risky_scripts.map((item) => item.name).join(", ") || "none"}`].join("\n");
}

function formatFetchUrlText(result) {
  return [`vnem_tools_fetch_url_text: ${result.executed ? result.status : "dry-run"}`, `URL: ${result.url}`, result.title_if_found ? `Title: ${result.title_if_found}` : "", `Evidence: ${result.evidence_log_id || "not written"}`].filter(Boolean).join("\n");
}

function formatSourceQuality(result) {
  return [`vnem_tools_source_quality_check: ${result.source_quality_score}/100`, `Flags: ${result.quality_flags.join(", ") || "none"}`, `Risks: ${result.risk_flags.join(", ") || "none"}`].join("\n");
}

function formatResearchBrief(result) {
  return [`vnem_tools_research_brief: ${result.task}`, `Supported: ${result.supported_claims.length}`, `Unsupported: ${result.unsupported_claims.length}`, `Evidence: ${result.evidence_log_id || "not written"}`].join("\n");
}

function formatPatch(result) {
  return [`vnem_tools_apply_patch: ${result.applied ? "applied" : "dry-run verified"}`, `Changed files: ${result.changed_files.join(", ")}`, `Backup: ${result.backup_path || "not written"}`, `Evidence: ${result.evidence_log_id}`].join("\n");
}

function formatCommand(result) {
  return [`vnem_tools_run_command: ${result.executed ? "executed" : "dry-run planned"}`, `Command: ${result.command}`, `CWD: ${result.cwd}`, result.executed ? `Exit: ${result.exit_code}` : "No command executed because dry_run=true.", result.stdout ? `stdout:\n${result.stdout}` : "", result.stderr ? `stderr:\n${result.stderr}` : ""].filter(Boolean).join("\n");
}

function formatApiRequest(result) {
  return [`vnem_tools_api_request: ${result.executed ? "executed" : "dry-run planned"}`, `${result.method} ${result.url}`, result.executed ? `Status: ${result.status}` : "No request sent because dry_run=true.", `Evidence: ${result.evidence_log_id || "not written"}`].join("\n");
}

function formatEvidence(evidence) {
  return [`vnem_tools_collect_evidence: ${evidence.evidence_id}`, evidence.summary, `Changed files: ${evidence.changed_files.join(", ") || "none"}`, `Commands: ${evidence.commands_run.join(", ") || "none"}`, `API requests: ${evidence.api_requests.length}`, `Must not claim: ${evidence.must_not_claim.join("; ")}`].join("\n");
}

function formatPatchBatch(result) {
  return [`vnem_tools_apply_patch_batch: ${result.applied ? "applied" : "dry-run planned"}`, `Changed files: ${result.changed_files.join(", ") || "none"}`, `Created: ${result.created_files.join(", ") || "none"}`, `Deleted: ${result.deleted_files.join(", ") || "none"}`, `Evidence: ${result.evidence_log_id || "not written"}`].join("\n");
}

function formatRestoreBatch(result) {
  return [`vnem_tools_restore_batch: ${result.restored ? "restored" : "dry-run planned"}`, `Restored files: ${result.restored_files.join(", ") || "none"}`, `Deleted created files: ${result.deleted_created_files.join(", ") || "none"}`, `Evidence: ${result.evidence_log_id || "not written"}`].join("\n");
}

function formatProjectScan(scan) {
  return [`vnem_tools_project_scan: ${scan.project_root}`, `Package manager: ${scan.detected_package_manager}`, `Frameworks: ${scan.likely_frameworks.join(", ") || "unknown"}`, `Safe commands: ${scan.safe_commands_suggested.join(", ") || "none"}`].join("\n");
}

function formatAppInspect(inspection) {
  return [`vnem_tools_app_inspect: ${inspection.adapter}`, `Support: ${inspection.support?.support_level || "unknown"}`, `Frameworks: ${inspection.frameworks?.join(", ") || "unknown"}`, `Frontend/backend/shared: ${inspection.boundaries?.frontend?.length || 0}/${inspection.boundaries?.backend?.length || 0}/${inspection.boundaries?.shared?.length || 0}`, `Completion gaps: ${inspection.incomplete_vertical_slice_signals?.join(", ") || "none detected"}`].join("\n");
}

function formatAppPlan(plan) {
  return [`vnem_tools_app_vertical_slice_plan: ${plan.status}`, `Adapter: ${plan.adapter}`, `Plan id: ${plan.plan_id || "none"}`, `Files previewed: ${plan.files_previewed?.length || 0}`, `Safe to apply: ${plan.safe_to_apply === true}`, plan.blocked_reason ? `Blocked: ${plan.blocked_reason}` : "No files changed by planning."].join("\n");
}

function formatAppApply(transaction) {
  return [`vnem_tools_app_vertical_slice_apply: ${transaction.applied ? "applied" : transaction.status}`, `Plan id: ${transaction.plan_id}`, `Transaction id: ${transaction.transaction_id || "not created"}`, `Files: ${transaction.files?.length || 0}`, `Manifest: ${transaction.manifest_path || "not written"}`].join("\n");
}

function formatAppAcceptance(result) {
  return [`vnem_tools_app_acceptance_run: ${result.status}`, `Scripts: ${result.scripts?.length || 0}`, `Browser: ${result.browser?.status || "not run"}`, `Desktop/mobile screenshots: ${result.browser?.screenshots?.length || 0}`, `Restored after failure: ${result.restored_after_failure === true}`, `Safe to claim: ${result.safe_to_claim === true}`, `Evidence: ${result.evidence_path || "not written"}`].join("\n");
}

function formatAppRollback(result) {
  return [`vnem_tools_app_transaction_rollback: ${result.status}`, `Transaction id: ${result.transaction_id || "unknown"}`, `Files restored: ${result.restored_files?.length || 0}`, `Evidence: ${result.evidence_log_id || "not written"}`].join("\n");
}

function formatProjectAutomationInspect(report) {
  return [`vnem_tools_project_automation_inspect: ${report.root}`, `Shells: ${report.shells.filter((item) => item.available).map((item) => item.command).join(", ") || "none detected"}`, `Package manager: ${report.selected_package_manager}`, `Task runners: ${report.task_runners.map((item) => item.runner).join(", ") || "none"}`, `Scripts: ${report.package_scripts.length}`].join("\n");
}

function formatProjectCommand(result) {
  const execution = result.execution;
  return [`vnem_tools_project_command_run: ${result.operation_result}`, `Policy: ${result.review.policy_layer}`, `Command: ${result.review.display_command}`, `Review id: ${result.review.review_id}`, execution ? `Exit/timeout: ${execution.exit_code}/${execution.timed_out}` : "No command executed.", execution ? `Output: ${execution.output_summary.response_strategy}` : null, execution ? `Evidence: ${execution.evidence_dir}` : null].filter(Boolean).join("\n");
}

function formatTaskGraph(action, graph) {
  return [`vnem_tools_project_task_graph_${action}: ${graph.status || graph.operation_result}`, `Graph id: ${graph.graph_id}`, `Order: ${(graph.order || []).join(" -> ")}`, graph.counts ? `Completed/satisfied/pending/failed: ${graph.counts.completed}/${graph.counts.satisfied}/${graph.counts.pending}/${graph.counts.failed}` : null, `Resume supported: ${graph.resume_supported === true}`, `Evidence items: ${graph.evidence?.length || 0}`].filter(Boolean).join("\n");
}

function formatRuntimeDiagnosis(result) {
  return [`vnem_tools_project_runtime_diagnose: ${result.operation_result}`, `Logs: ${result.logs.length}`, `Listening ports: ${result.ports.filter((item) => item.listening).map((item) => item.port).join(", ") || "none requested/listening"}`, `Lock signals: ${result.lock_checks.filter((item) => item.lock_signal === "possible_file_lock_or_permission").length}`, `Interrupted graphs: ${result.interrupted_graphs.length}`, `Next: ${result.safe_next_step}`, `Evidence: ${result.evidence_path}`].join("\n");
}

function formatTempCleanup(result) {
  return [`vnem_tools_project_temp_cleanup: ${result.operation_result}`, `Operation: ${result.operation}`, `Executed: ${result.executed === true}`, result.cleanup_id ? `Cleanup id: ${result.cleanup_id}` : null, `Moved/restored: ${result.moved?.length || result.restored?.length || 0}`, `Unresolved: ${result.unresolved?.length || 0}`, `Rollback available: ${result.rollback_available === true}`].filter(Boolean).join("\n");
}

function formatWindowsLocal(tool, result) {
  const count = result.processes?.length ?? result.ports?.length ?? result.paths?.length ?? result.services?.length ?? result.tasks?.length ?? result.events?.length ?? result.clients?.length;
  return [
    `${tool}: ${result.operation_result}`,
    count === undefined ? null : `Items: ${count}`,
    `Read-only/executed: ${result.read_only !== false}/${result.executed === true}`,
    result.safe_next_step ? `Next: ${result.safe_next_step}` : null
  ].filter(Boolean).join("\n");
}

function formatGameDomain(tool, result) {
  const count = result.inventory?.files_seen ?? result.files?.length ?? result.mods?.length ?? result.source_map?.length ?? result.file_count ?? result.targets?.length;
  return [
    `${tool}: ${result.operation_result}`,
    count === undefined ? null : `Items: ${count}`,
    `Read-only/executed: ${result.read_only !== false}/${result.executed === true}`,
    result.safe_to_claim === undefined ? null : `Static validation safe to claim: ${result.safe_to_claim}`,
    result.safe_next_step ? `Next: ${result.safe_next_step}` : null
  ].filter(Boolean).join("\n");
}

function formatDependencySecurity(tool, result) {
  const count = result.packages?.length ?? result.vulnerabilities?.length ?? result.changes?.length ?? result.direct_changes?.length ?? result.targets?.length;
  return [
    `${tool}: ${result.operation_result}`,
    count === undefined ? null : `Items: ${count}`,
    `Executed: ${result.executed === true}`,
    result.plan_id ? `Plan: ${result.plan_id}` : null,
    result.transaction_id ? `Transaction: ${result.transaction_id}` : null,
    result.rollback_available === undefined ? null : `Rollback available: ${result.rollback_available}`
  ].filter(Boolean).join("\n");
}

function formatTestSystemInspect(result) {
  return [`vnem_tools_test_system_inspect: ${result.operation_result}`, `Frameworks: ${result.test_frameworks.join(", ") || "none detected"}`, `Tests/configs/workflows: ${result.test_files.length}/${result.config_files.length}/${result.ci_workflows.length}`, `Coverage: ${result.coverage.tools.join(", ") || "no producer detected"}`, `Resource-mapped scripts: ${result.resource_isolation.length}`].join("\n");
}

function formatAffectedTestGraph(result) {
  return [`vnem_tools_affected_test_graph: ${result.selected_scripts.length} selected`, `Changed: ${result.changed_files.length}`, `Import/script edges: ${result.graph_summary.import_edges}/${result.graph_summary.package_script_edges}`, `Full recommended: ${result.full_suite_recommended}`, `First tests: ${result.selected_scripts.slice(0, 6).join(", ") || "none"}`].join("\n");
}

function formatTestRun(result) {
  return [`vnem_tools_test_run: ${result.status || result.operation_result}`, `Tier/tasks: ${result.tier}/${result.task_count || result.counts?.planned || 0}`, `Executed: ${result.executed !== false}`, result.counts ? `Passed/failed/skipped: ${result.counts.passed}/${result.counts.failed}/${result.counts.skipped}` : null, result.duration_ms !== undefined ? `Duration: ${result.duration_ms}ms` : null, result.report_path ? `Report: ${result.report_path}` : null].filter(Boolean).join("\n");
}

function formatCiDiagnosis(result) {
  return [`vnem_tools_ci_failure_diagnose: ${result.classification}`, `Workflow/job/step: ${result.workflow.name}/${result.job || "unknown"}/${result.step || "unknown"}`, `Branch/infrastructure/scheduling: ${result.branch_caused}/${result.infrastructure_caused}/${result.scheduling_failure}`, `Command: ${result.failing_command || "unknown"}`, `Next: ${result.smallest_safe_fix}`].join("\n");
}

function formatCoverageBenchmark(result) {
  return [`vnem_tools_coverage_benchmark_report: ${result.coverage.available ? "coverage available" : "coverage unavailable"}`, `Coverage sources: ${result.coverage.sources.join(", ") || "none"}`, `Uncovered critical: ${result.coverage.uncovered_critical_paths.length}`, `Benchmark history: ${result.benchmarks.history.length}`, `Regressions: ${result.benchmarks.regressions.length}`].join("\n");
}

function formatProjectTask(task) {
  return [`vnem_tools_run_project_task: ${task.executed ? "executed" : "dry-run planned"}`, `Command: ${task.command}`, task.executed ? `Exit: ${task.exit_code}` : "No task executed because dry_run=true.", task.stdout ? `stdout:\n${task.stdout}` : "", task.stderr ? `stderr:\n${task.stderr}` : ""].filter(Boolean).join("\n");
}

function formatDevServer(server) {
  return [`vnem_tools_start_dev_server: ${server.started ? "started" : "dry-run planned"}`, `URL: ${server.url}`, `Server id: ${server.server_id || "not started"}`].join("\n");
}

function formatDevServerStop(stop) {
  return [`vnem_tools_stop_dev_server: ${stop.stopped ? "stopped" : "not stopped"}`, `Server id: ${stop.server_id}`, `Evidence: ${stop.evidence_log_id || "not written"}`].join("\n");
}

function formatDevServerList() {
  const list = listDevServers();
  return `vnem_tools_list_dev_servers: ${list.servers.length} server(s)`;
}

function formatSessionEvidence(pack) {
  return [`vnem_tools_finish_session: ${pack.session_id}`, `Patches: ${pack.patches_applied.length}`, `Commands: ${pack.commands_run.length}`, `Browser captures: ${pack.browser_captures.length}`, `Evidence: ${pack.evidence_path}`].join("\n");
}

function formatGitStatus(status) {
  return [`vnem_tools_git_status: ${status.changed_files.length} changed file(s)`, ...status.changed_files.map((item) => `${item.status} ${item.path}`)].join("\n");
}

function formatGitDiff(diff) {
  return [`vnem_tools_git_diff_summary: ${diff.changed_files.length} file(s)`, diff.summary || "No diff."].join("\n");
}

function formatGitCommit(commit) {
  return [`vnem_tools_git_commit: ${commit.committed ? "committed" : "dry-run planned"}`, `Files: ${commit.files.join(", ")}`, commit.commit_sha ? `Commit: ${commit.commit_sha}` : "No commit created."].join("\n");
}

function formatStructuralCode(name, result) {
  return [
    `${name}: ${result.operation_result || "completed"}`,
    result.index_id ? `Index: ${result.index_id}` : null,
    Number.isInteger(result.result_count) ? `Results: ${result.result_count}` : null,
    Number.isInteger(result.reference_count) ? `References: ${result.reference_count}` : null,
    Number.isInteger(result.edit_count) ? `Edits: ${result.edit_count}` : null,
    result.confidence ? `Confidence: ${result.confidence}` : null,
    result.executed === true ? "Executed: yes" : result.executed === false ? "Executed: no" : null,
    result.transaction_id ? `Transaction: ${result.transaction_id}` : null,
    Array.isArray(result.blockers) && result.blockers.length ? `Blockers: ${result.blockers.length}` : null,
    Array.isArray(result.uncertainties) && result.uncertainties.length ? `Uncertainties: ${result.uncertainties.length}` : null
  ].filter(Boolean).join("\n");
}

function formatApiConnector(name, result) {
  return [
    `${name}: ${result.operation_result || "completed"}`,
    result.adapter_id ? `Adapter: ${result.adapter_id}` : null,
    Number.isInteger(result.adapter_count) ? `Adapters: ${result.adapter_count}` : null,
    result.provider ? `Provider: ${result.provider}` : null,
    result.method && result.url ? `${result.method} ${result.url}` : null,
    Number.isInteger(result.status) ? `HTTP: ${result.status}` : null,
    result.executed === true ? "Executed: yes" : result.executed === false ? "Executed: no" : null,
    result.transaction_id ? `Transaction: ${result.transaction_id}` : null,
    result.proposal_id ? `Proposal: ${result.proposal_id}` : null,
    result.credential_value_exposed === false || result.raw_credential_values_exposed === false ? "Credential values exposed: no" : null
  ].filter(Boolean).join("\n");
}

function formatSkillAdapter(name, result) {
  return [
    `${name}: ${result.operation_result || "completed"}`,
    result.adapter_id ? `Adapter: ${result.adapter_id}` : null,
    Number.isInteger(result.adapter_count) ? `Adapters: ${result.adapter_count}` : null,
    Number.isInteger(result.ready_count) ? `Ready: ${result.ready_count}/${result.adapter_count}` : null,
    result.runtime_type ? `Runtime: ${result.runtime_type}` : null,
    result.trust_status ? `Trust: ${result.trust_status}` : null,
    result.executed === true ? "Executed: yes" : result.executed === false ? "Executed: no" : null,
    result.exact_match === true ? "Pinned source match: yes" : result.exact_match === false ? "Pinned source match: no" : null,
    result.instructions_executed_as_code === false || result.content_executed === false ? "Upstream instructions executed as code: no" : null
  ].filter(Boolean).join("\n");
}

function formatDataSystems(name, result) {
  return [
    `${name}: ${result.operation_result || "completed"}`,
    result.source?.relative_path ? `Source: ${result.source.relative_path}` : null,
    result.connection_type ? `Connection: ${result.connection_type}` : null,
    Number.isInteger(result.row_count) ? `Rows: ${result.row_count}` : null,
    Number.isInteger(result.rows_returned) ? `Rows returned: ${result.rows_returned}` : null,
    result.read_only === true ? "Read only: yes" : null,
    result.plan_id ? `Plan: ${result.plan_id}` : null,
    result.preview_id ? `Preview: ${result.preview_id}` : null,
    result.transaction_id ? `Transaction: ${result.transaction_id}` : null,
    result.executed === true ? "Executed: yes" : result.executed === false ? "Executed: no" : null,
    result.rollback_available === true ? "Rollback: available" : null,
    result.secret_parameter_values_exposed === false || result.raw_credentials_accepted === false ? "Secret values exposed: no" : null
  ].filter(Boolean).join("\n");
}

async function withToolErrors(fn) {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof ToolsError) return errorResult(error.message, error.code, error.details);
    if (error instanceof ProjectAutomationError) return errorResult(error.message, error.code, error.details);
    if (error instanceof TestingCiError) return errorResult(error.message, error.code, error.details);
    if (error instanceof BrowserInteractionError) return errorResult(error.message, error.code, error.details);
    if (error instanceof WindowsLocalError) return errorResult(error.message, error.code, error.details);
    if (error instanceof GithubDevelopmentError) return errorResult(error.message, error.code, error.details);
    if (error instanceof GameDomainError) return errorResult(error.message, error.code, error.details);
    if (error instanceof DependencySecurityError) return errorResult(error.message, error.code, error.details);
    if (error instanceof StructuralCodeError) return errorResult(error.message, error.code, error.details);
    if (error instanceof ApiConnectorError) return errorResult(error.message, error.code, error.details);
    if (error instanceof SkillAdapterError) return errorResult(error.message, error.code, error.details);
    if (error instanceof DataSystemsError) return errorResult(error.message, error.code, error.details);
    if (error instanceof CloudflareControlError) return errorResult(error.message, error.code, error.details);
    return errorResult(error.message || String(error), "tools_unexpected_error");
  }
}

function toolResult(text, structuredContent) {
  return { content: [{ type: "text", text: redactSecrets(text) }], structuredContent };
}

function errorResult(text, code = "tools_error", details = {}) {
  const action_recovery_plan = buildActionRecoveryPlan({ error_code: code, stderr: typeof details?.stderr === "string" ? details.stderr : "", stdout: typeof details?.stdout === "string" ? details.stdout : "", context: JSON.stringify(details || {}) });
  return { isError: true, content: [{ type: "text", text: redactSecrets(text) }], structuredContent: { error: redactSecrets(text), code, ...details, action_recovery_plan } };
}

export { REQUIRED_TOOL_NAMES, statusObject };
