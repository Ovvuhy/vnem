#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readdir, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const SERVER_VERSION = "1.0.1";
const REQUIRED_TOOL_NAMES = [
  "vnem_tools_status",
  "vnem_tools_permission_profiles",
  "vnem_tools_permission_status",
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
const READ_ONLY_LOCAL = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const ACTION_TOOL = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false };
const NETWORK_ACTION = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true };
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
const CLOUDFLARE_MUTATION_APPROVAL_PHRASE = "I APPROVE CLOUDFLARE MUTATION";
const CLOUDFLARE_DESTRUCTIVE_APPROVAL_PHRASE = "I APPROVE CLOUDFLARE DESTRUCTIVE ACTION";
const CLOUDFLARE_EVIDENCE_FILES = ["request_summary.json", "approval_record.json", "commands_run.txt", "stdout_redacted.txt", "stderr_redacted.txt", "cloudflare_result_redacted.json", "verification_result.json", "changed_resources.json", "rollback_hint.json", "final_summary.md"];
const LARGE_FILE_BYTES = 1024 * 1024;
const MAX_READ_MANY_TOTAL_BYTES = 128 * 1024;
const MAX_FETCH_TEXT_BYTES = 64 * 1024;
const devServers = new Map();
const sessions = new Map();

const allowedRoots = await computeAllowedRoots();
const evidenceRoot = await computeEvidenceRoot();
const activePermissionProfile = getActivePermissionProfile();
const usablePacks = await loadUsablePacks();

const server = new McpServer(
  { name: "vnem-tools", version: SERVER_VERSION },
  {
    instructions: [
      "VNEM Tools MCP is a safeguard-first action server for approved project work after VNEM Core has planned the task.",
      "Tools MCP is not Core MCP and is not Giga MCP. It can read, search, dry-run patches, apply approved patches, run approved allowlisted commands, prepare/perform approved limited API requests, capture approved local browser screenshots, and collect evidence.",
      "Dry-run is the default for mutation/execution/network/browser actions. Real changes require dry_run=false, approved=true, and a non-empty approval_note.",
      "The active Tools permission profile gates real actions. Default is safe-readonly; mutation/network/dev-server/git actions require an explicit stronger profile plus approval, evidence, and rollback where applicable. GitHub mutations, package installs, arbitrary shell, broad browser automation, account login automation, cookie extraction, CAPTCHA bypass, and broad web scraping are not implemented."
    ].join(" ")
  }
);

registerTools(server);
await server.connect(new StdioServerTransport());

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

class ToolsError extends Error {
  constructor(message, code = "tools_error", details = {}) {
    super(message);
    this.name = "ToolsError";
    this.code = code;
    this.details = details;
  }
}


const PERMISSION_PROFILE_NAMES = ["safe-readonly", "safe-local-dev", "approved-writes", "approved-installs", "approved-github", "creator-power", "dangerous-disabled"];
const HARD_BLOCKED_ACTION_TYPES = new Set(["secret_read", "cookie_session_access", "captcha_bypass", "destructive_shell", "unrestricted_crawl"]);
const ACTION_ALIASES = {
  write_file: "apply_patch",
  patch: "apply_patch",
  commit: "local_commit",
  git_commit: "local_commit",
  run_command: "run_test",
  run_project_task: "run_test",
  fetch_url_text: "external_fetch",
  web_search: "external_fetch",
  download_safety_check: "download_check",
  cloudflare_status: "cloudflare_read",
  cloudflare_discovery: "cloudflare_read",
  cloudflare_deploy: "cloudflare_mutation",
  cloudflare_pages_deploy: "cloudflare_mutation",
  cloudflare_workers_deploy: "cloudflare_mutation",
  cloudflare_dns: "cloudflare_mutation",
  cloudflare_dns_delete: "cloudflare_destructive",
  cloudflare_env: "cloudflare_mutation",
  cloudflare_secret: "cloudflare_mutation",
  cloudflare_rollback: "cloudflare_destructive",
  cloudflare_cache_purge: "cloudflare_mutation",
  evidence_pack_audit: "evidence_pack_audit",
  mutation_approval_contract: "mutation_approval_contract",
  secret_redaction_check: "secret_redaction_check"
};

function buildPermissionProfiles() {
  const mk = (profile_name, description, opts = {}) => ({
    profile_name,
    description,
    allowed_actions: opts.allowed_actions || [],
    blocked_actions: opts.blocked_actions || [],
    requires_approval_actions: opts.requires_approval_actions || [],
    network_policy: opts.network_policy || "No live network by default except explicit approved safe flows.",
    filesystem_policy: opts.filesystem_policy || "Allowed roots only; secret-like paths blocked.",
    secret_policy: opts.secret_policy || "Secret paths and raw secret-like values are blocked/redacted; no cookie/session extraction.",
    command_policy: opts.command_policy || "No arbitrary shell; only allowlisted diagnostics/tasks where profile permits.",
    package_policy: opts.package_policy || "Package install/publish/audit-fix mutation is preview/planned only unless a future implementation explicitly supports it.",
    git_policy: opts.git_policy || "Local status/diff read-only; local commit requires approved-writes or creator-power plus approval; no push/reset-hard.",
    github_policy: opts.github_policy || "GitHub mutation is preview/planned only; no silent issue/PR/release mutation.",
    browser_policy: opts.browser_policy || "Local file/localhost proof only where permitted; no login/cookie/session/CAPTCHA automation.",
    evidence_policy: opts.evidence_policy || "Real actions require bounded output and redacted evidence logs.",
    rollback_policy: opts.rollback_policy || "Writes require backup/restore plan where possible.",
    risk_notes: opts.risk_notes || [],
    public_default_safe: opts.public_default_safe === true,
    creator_only: opts.creator_only === true
  });
  const dangerous = ["secret_read", "cookie_session_access", "captcha_bypass", "destructive_shell", "unrestricted_crawl", "credential_theft", "malware_like_behavior", "hidden_persistence", "unrestricted_filesystem_crawl", "silent_account_mutation"];
  const profiles = [
    mk("safe-readonly", "Default public profile: inspect metadata/files/code only; no real writes, commands, network fetches, browser captures, dev servers, commits, installs, GitHub mutation, or account actions.", {
      allowed_actions: ["read_file", "search_code", "inspect_workspace", "dependency_scan", "permission_status", "trust_boundary_classify", "action_policy_preview", "cloudflare_read", "evidence_pack_audit", "mutation_approval_contract", "secret_redaction_check"],
      blocked_actions: ["apply_patch", "restore_backup", "run_test", "run_build", "start_dev_server", "browser_capture", "local_commit", "package_install", "github_issue", "github_pr", "github_release", "api_call", "external_fetch", "cloudflare_mutation", "cloudflare_destructive", ...dangerous],
      public_default_safe: true,
      network_policy: "No live external network or browser capture by default; dry-run planning only.",
      command_policy: "No real project tasks/commands in safe-readonly; inspect package scripts only."
    }),
    mk("safe-local-dev", "Local development profile: read-only plus approved allowlisted diagnostics/tests/builds/dev-server/localhost proof; no file writes or local commits.", {
      allowed_actions: ["read_file", "search_code", "inspect_workspace", "dependency_scan", "run_test", "run_build", "start_dev_server", "browser_capture", "download_check", "external_fetch", "cloudflare_read", "evidence_pack_audit", "mutation_approval_contract", "secret_redaction_check"],
      blocked_actions: ["apply_patch", "restore_backup", "local_commit", "package_install", "github_issue", "github_pr", "github_release", "cloudflare_mutation", "cloudflare_destructive", ...dangerous],
      requires_approval_actions: ["run_test", "run_build", "start_dev_server", "browser_capture", "download_check", "external_fetch"],
      network_policy: "Approved localhost proof and direct-source GET/HEAD/search-provider flows only; no broad crawling or login/session use."
    }),
    mk("approved-writes", "Approved local write profile: allows patch/file writes, restores, allowlisted tests/builds/dev-server/browser localhost proof, and local commits only with explicit approval/evidence/rollback.", {
      allowed_actions: ["read_file", "search_code", "inspect_workspace", "dependency_scan", "run_test", "run_build", "start_dev_server", "browser_capture", "apply_patch", "restore_backup", "local_commit", "download_check", "external_fetch", "cloudflare_read", "cloudflare_mutation", "evidence_pack_audit", "mutation_approval_contract", "secret_redaction_check"],
      blocked_actions: ["package_install", "github_issue", "github_pr", "github_release", "cloudflare_destructive", ...dangerous],
      requires_approval_actions: ["run_test", "run_build", "start_dev_server", "browser_capture", "apply_patch", "restore_backup", "local_commit", "download_check", "external_fetch", "cloudflare_mutation"],
      rollback_policy: "Patch batch writes create backups/restore plans; local commits use explicit file lists only."
    }),
    mk("approved-installs", "Preview profile for future package-install workflows. This build classifies installs as planned/blocked and never silently installs.", {
      allowed_actions: ["read_file", "search_code", "inspect_workspace", "dependency_scan", "run_test", "run_build", "start_dev_server", "browser_capture", "apply_patch", "restore_backup", "local_commit"],
      blocked_actions: ["package_install", "github_issue", "github_pr", "github_release", ...dangerous],
      requires_approval_actions: ["package_install", "run_test", "run_build", "start_dev_server", "browser_capture", "apply_patch", "restore_backup", "local_commit"],
      package_policy: "Package installs/audit fixes are preview/planned/blocked in this build; no install command is executed."
    }),
    mk("approved-github", "Preview profile for future GitHub workflows. This build classifies GitHub mutation as planned/blocked and never silently mutates GitHub.", {
      allowed_actions: ["read_file", "search_code", "inspect_workspace", "dependency_scan", "run_test", "run_build", "start_dev_server", "browser_capture", "apply_patch", "restore_backup", "local_commit"],
      blocked_actions: ["package_install", "github_issue", "github_pr", "github_release", ...dangerous],
      requires_approval_actions: ["github_issue", "github_pr", "github_release", "run_test", "run_build", "start_dev_server", "browser_capture", "apply_patch", "restore_backup", "local_commit"],
      github_policy: "GitHub issue/PR/comment/release workflows are preview/planned/blocked in this build; no gh/API mutation is executed."
    }),
    mk("creator-power", "Creator/developer experimental profile with broader local scope while still blocking secrets, system paths, hidden destructive actions, unrestricted crawling, account mutation, package installs, and GitHub mutation unless explicitly implemented later.", {
      allowed_actions: ["read_file", "search_code", "inspect_workspace", "dependency_scan", "run_test", "run_build", "start_dev_server", "browser_capture", "apply_patch", "restore_backup", "local_commit", "api_call", "download_check", "external_fetch", "cloudflare_read", "cloudflare_mutation", "cloudflare_destructive", "evidence_pack_audit", "mutation_approval_contract", "secret_redaction_check"],
      blocked_actions: ["package_install", "github_issue", "github_pr", "github_release", ...dangerous],
      requires_approval_actions: ["run_test", "run_build", "start_dev_server", "browser_capture", "apply_patch", "restore_backup", "local_commit", "api_call", "download_check", "external_fetch", "cloudflare_mutation", "cloudflare_destructive"],
      creator_only: true
    }),
    mk("dangerous-disabled", "Hard-block policy profile documenting actions VNEM Tools MCP will not perform in public builds.", {
      allowed_actions: [],
      blocked_actions: dangerous,
      risk_notes: ["Hard-blocks credential theft, cookie/session extraction, malware-like behavior, destructive system commands, broad private scraping, CAPTCHA bypass, hidden persistence, unrestricted filesystem crawling, and silent account mutation."]
    })
  ];
  return profiles;
}

function permissionProfilesObject() {
  const profiles = buildPermissionProfiles();
  return { default_profile: "safe-readonly", selected_profile: activePermissionProfile.profile_name, profiles, dangerous_disabled_policy: profiles.find((p) => p.profile_name === "dangerous-disabled") };
}

function getActivePermissionProfile() {
  const requested = String(process.env.VNEM_TOOLS_PERMISSION_PROFILE || "safe-readonly").trim() || "safe-readonly";
  const profiles = buildPermissionProfiles();
  return profiles.find((p) => p.profile_name === requested) || profiles.find((p) => p.profile_name === "safe-readonly");
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
  const plannedBlocked = ["package_install", "github_issue", "github_pr", "github_release"].includes(actionType);
  const allowedByProfile = profile.allowed_actions.includes(actionType) || (["read_file", "search_code", "inspect_workspace", "dependency_scan"].includes(actionType) && profile.profile_name !== "dangerous-disabled");
  const blockedByProfile = profile.blocked_actions.includes(actionType) || profile.profile_name === "dangerous-disabled";
  const allowed = !hardBlocked && !plannedBlocked && allowedByProfile && !blockedByProfile;
  const requiresApproval = allowed && (profile.requires_approval_actions.includes(actionType) || !["read_file", "search_code", "inspect_workspace", "dependency_scan"].includes(actionType));
  const reason = hardBlocked ? `Action ${actionType} is hard-blocked as dangerous.` : plannedBlocked ? `Action ${actionType} is preview/planned/blocked in this build; it is not implemented for silent execution.` : allowed ? `Allowed by ${profile.profile_name}${requiresApproval ? " only with explicit approval" : ""}.` : `Blocked by active permission profile ${profile.profile_name}.`;
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
    rollback_expected: ["apply_patch", "restore_backup", "local_commit"].includes(actionType) && allowed,
    evidence_expected: allowed || requiresApproval,
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
  const preview = actionPolicyPreview({ action_type: normalized, proposed_action: normalized });
  if (!dryRun && !preview.allowed) throw new ToolsError(preview.reason, "permission_profile_blocked", { action_policy_preview: preview });
  if (!dryRun && preview.requires_approval) enforceApproval(args);
  return preview;
}

function permissionStatusObject() {
  const manifest = safeSearchProviderManifest();
  const workspace = path.resolve(process.env.VNEM_WORKSPACE_ROOT || process.cwd() || repoRoot);
  const workspaceAllowed = isInsideAny(workspace, allowedRoots);
  return {
    active_profile: activePermissionProfile,
    configured_by: process.env.VNEM_TOOLS_PERMISSION_PROFILE ? "VNEM_TOOLS_PERMISSION_PROFILE" : "default_safe_readonly",
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
    configured_search_providers_by_presence_only: manifest.providers.map((p) => ({ name: p.name, configured: p.configured, env_var_name: p.env_var_name, configured_by: p.configured_by, api_key_value_exposed: false })),
    blocked_categories: ["secret files", "raw secret values", "cookies", "sessions", "browser profiles", "password manager data", "CAPTCHA bypass", "destructive shell", "unrestricted filesystem crawling", "silent package install", "silent GitHub/account mutation"],
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
function formatPermissionStatus(status) { return [`vnem_tools_permission_status: ${status.active_profile.profile_name}`, `allowed_roots=${status.allowed_roots.join(", ")}`, `workspace_allowed=${status.workspace_allowed}`, `evidence_root=${status.evidence_root}`, status.broad_root_warnings.length ? `warnings=${status.broad_root_warnings.join("; ")}` : "warnings=none"].join("\n"); }
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

function unsupportedActions() {
  return ["remote_github_mutation", "git_push", "package_install", "package_publish", "deployment", "arbitrary_shell", "unrestricted_api_calls", "secret_manager_backed_live_api", "search_engine_scraping", "automatic_captcha_bypass", "broad_crawling", "external_browser_browsing_by_default", "login_automation", "cookie_extraction", "session_extraction", "captcha_bypass", "giga_mcp"];
}

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
    filesystem_intelligence_policy: { tools: ["vnem_tools_workspace_map", "vnem_tools_read_many_files", "vnem_tools_code_search", "vnem_tools_find_references", "vnem_tools_dependency_scan"], allowed_roots_only: true, secret_paths_blocked: true, generated_build_cache_skipped: true, evidence_logged: true },
    research_sources_policy: { tools: ["vnem_tools_fetch_url_text", "vnem_tools_source_quality_check", "vnem_tools_research_brief", "vnem_tools_browser_research_pack", "vnem_tools_claim_source_matrix", "vnem_tools_research_gap_detector", "vnem_tools_source_map", "vnem_tools_source_extract", "vnem_tools_source_graph"], no_search_engine_scraping: true, external_fetch_dry_run_default: true, approval_required_for_real_external_fetch: true, no_login_cookie_session_use: true },
    source_ingestion_policy: { tools: ["vnem_tools_source_map", "vnem_tools_source_extract", "vnem_tools_source_graph"], allowed_roots_only_for_local_sources: true, explicit_targets_only_for_extraction: true, secret_paths_blocked: true, broad_crawl_blocked: true, evidence_logged: true, source_graph_uses_provided_or_bounded_sources_only: true },
    debugging_code_quality_policy: { tools: ["vnem_tools_architecture_review", "vnem_tools_debug_evidence"], allowed_roots_only: true, secret_paths_blocked: true, no_arbitrary_commands: true, log_first_debugging: true, detects_parallel_fake_systems: true, flags_possible_dead_code: true, evidence_logged: true },
    search_provider_policy: { tools: ["vnem_tools_search_provider_manifest", "vnem_tools_search_query_builder", "vnem_tools_web_search", "vnem_tools_search_result_ranker"], local_fixture_available_for_tests: true, provider_keys_detected_by_presence_only: true, provider_unavailable_returns_structured_status: true, no_search_engine_result_page_scraping: true, no_fake_search_results: true },
    browser_risk_policy: { tools: ["vnem_tools_redirect_chain_check", "vnem_tools_url_reputation_check", "vnem_tools_captcha_detector", "vnem_tools_download_safety_check"], no_captcha_bypass: true, user_assisted_captcha_handoff: true, suspicious_redirect_download_phishing_detection: true, no_auto_download_or_installer_execution: true },
    patch_batch_policy: { tool: "vnem_tools_apply_patch_batch", dry_run_default: true, approval_required: true, operations: ["replace", "create", "delete", "append"], no_partial_apply_by_default: true, backups_per_changed_file: true },
    project_scan_policy: { tool: "vnem_tools_project_scan", allowed_roots_only: true, skips_secrets: true, reads_package_json_only_for_scripts_and_frameworks: true },
    project_task_policy: { tool: "vnem_tools_run_project_task", dry_run_default: true, approval_required: true, package_json_scripts_only: true, package_install_publish_deploy_blocked: true },
    dev_server_policy: { tools: ["vnem_tools_start_dev_server", "vnem_tools_stop_dev_server", "vnem_tools_list_dev_servers"], dry_run_default: true, approval_required: true, local_host_only: true, port_range: "3000-9999", registry: "in-memory per MCP process" },
    session_evidence_policy: { tools: ["vnem_tools_start_session", "vnem_tools_finish_session"], writes_single_json_proof_pack: true, secrets_redacted: true },
    local_git_policy: { tools: ["vnem_tools_git_status", "vnem_tools_git_diff_summary", "vnem_tools_git_commit"], status_and_diff_read_only: true, commit_requires_approval_and_explicit_files: true, git_push_blocked: true, destructive_git_blocked: true },
    network_policy: {
      dry_run_default: true,
      methods: ["GET", "HEAD"],
      live_requests_require_approval: true,
      localhost_allowed_when_env_enabled: process.env.VNEM_TOOLS_ALLOW_LOCALHOST === "1",
      unknown_untrusted_urls_blocked: true,
      no_github_or_installs: true
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
    unsupported_in_foundation_batch: ["remote_github_mutation", "git_push", "package_install", "package_publish", "deployment", "arbitrary_shell", "unrestricted_api_calls", "secret_manager_backed_live_api", "login_automation", "cookie_extraction", "captcha_bypass", "giga_mcp"]
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
    "Local project actions include a manifest/catalog, workspace map, read-many, code search, references, dependency scan, project scan, patch batch, restore batch, safe package tasks, local dev servers, session proof packs, research/source helpers, and approved local git commits.",
    `Browser proof: local files/localhost only, screenshots under ${status.browser_policy.screenshot_evidence_location}, runtime ${status.browser_policy.browser_runtime_status}.`,
    "GitHub mutation, package install, arbitrary shell/API, login automation, cookie extraction, CAPTCHA bypass, and broad scraping are not implemented."
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
  if (text.includes("github")) return "GitHub mutation support is not in this foundation batch.";
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

const TOOL_CAPABILITY_GROUPS = ["permissions", "filesystem", "project_intelligence", "patching", "rollback", "commands", "project_tasks", "dev_server", "browser_proof", "browser_intelligence", "ui_web_quality", "api_request", "search", "research_sources", "source_quality", "browsing_risk", "research_matrix", "source_ingestion", "debugging_code_quality", "session_evidence", "local_git", "status_readiness", "cloudflare_control", "tools_quality"];

function buildToolCatalog() {
  const commonUnsafe = ["secret reading/dumping", "outside-root access", "arbitrary shell", "package installs", "git push", "deployment", "Giga MCP"];
  const mk = (name, group, opts = {}) => ({
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
    related_tools: opts.related_tools || []
  });
  return [
    mk("vnem_tools_status", "status_readiness", { description: "Report Tools MCP policy/readiness including active permission profile and allowed-root status.", evidence_logged: false, typical_use_cases: ["preflight safety status"] }),
    mk("vnem_tools_permission_profiles", "permissions", { description: "List all first-class Tools MCP permission profiles and allow/block/approval policies.", evidence_logged: false, allowed_roots_required: false, typical_use_cases: ["permission planning", "profile discovery"] }),
    mk("vnem_tools_permission_status", "permissions", { description: "Report active profile, allowed roots, evidence root, localhost policy, provider presence, blocked categories, and root warnings.", evidence_logged: false, allowed_roots_required: false, typical_use_cases: ["permission preflight", "allowed-root debugging"] }),
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
    mk("vnem_tools_ui_evidence_audit", "ui_web_quality", { description: "Audit provided UI evidence and reject unsupported visual/browser claims.", allowed_roots_required: false, evidence_logged: true, typical_use_cases: ["final UI claim audit", "responsive/a11y/state proof review"], unsafe_actions_blocked: [...commonUnsafe, "inventing browser results", "accepting code-only visual proof"] }),
    mk("vnem_tools_start_session", "session_evidence", { read_only: false, mutation: true, description: "Start session proof pack.", typical_use_cases: ["group local workflow evidence"] }),
    mk("vnem_tools_finish_session", "session_evidence", { read_only: false, mutation: true, description: "Write session proof pack.", typical_use_cases: ["final evidence summary"] }),
    mk("vnem_tools_collect_evidence", "session_evidence", { read_only: false, mutation: true, description: "Write proof-trail-compatible evidence summary.", typical_use_cases: ["final report support"] }),
    mk("vnem_tools_git_status", "local_git", { description: "Read local git status.", typical_use_cases: ["pre/post change report"] }),
    mk("vnem_tools_git_diff_summary", "local_git", { description: "Read capped local git diff summary.", typical_use_cases: ["change summary"] }),
    mk("vnem_tools_git_commit", "local_git", { read_only: false, mutation: true, requires_approval: true, dry_run_default: true, description: "Create approved local commit of explicit safe files only; no push.", typical_use_cases: ["local handoff commit"], unsafe_actions_blocked: [...commonUnsafe, "git push", "git reset --hard", "remote GitHub mutation"] }),
    mk("vnem_tools_cloudflare_status", "cloudflare_control", { read_only: true, mutation: false, network: true, requires_approval: false, dry_run_default: false, allowed_roots_required: false, description: "Cloudflare Tools MCP control workflow with approval gates, redaction, and evidence packs.", typical_use_cases: ["Cloudflare control"] }),
    mk("vnem_tools_cloudflare_auth_plan", "cloudflare_control", { read_only: true, mutation: false, network: true, requires_approval: false, dry_run_default: false, allowed_roots_required: false, description: "Cloudflare Tools MCP control workflow with approval gates, redaction, and evidence packs.", typical_use_cases: ["Cloudflare control"] }),
    mk("vnem_tools_cloudflare_accounts_list", "cloudflare_control", { read_only: true, mutation: false, network: true, requires_approval: false, dry_run_default: false, allowed_roots_required: false, description: "Cloudflare Tools MCP control workflow with approval gates, redaction, and evidence packs.", typical_use_cases: ["Cloudflare control"] }),
    mk("vnem_tools_cloudflare_projects_list", "cloudflare_control", { read_only: true, mutation: false, network: true, requires_approval: false, dry_run_default: false, allowed_roots_required: false, description: "Cloudflare Tools MCP control workflow with approval gates, redaction, and evidence packs.", typical_use_cases: ["Cloudflare control"] }),
    mk("vnem_tools_cloudflare_pages_deploy_plan", "cloudflare_control", { read_only: true, mutation: false, network: true, requires_approval: false, dry_run_default: true, allowed_roots_required: false, description: "Cloudflare Tools MCP control workflow with approval gates, redaction, and evidence packs.", typical_use_cases: ["Cloudflare control"] }),
    mk("vnem_tools_cloudflare_pages_deploy", "cloudflare_control", { read_only: false, mutation: true, network: true, requires_approval: true, dry_run_default: true, allowed_roots_required: false, description: "Cloudflare Tools MCP control workflow with approval gates, redaction, and evidence packs.", typical_use_cases: ["Cloudflare control"] }),
    mk("vnem_tools_cloudflare_workers_deploy_plan", "cloudflare_control", { read_only: true, mutation: false, network: true, requires_approval: false, dry_run_default: true, allowed_roots_required: false, description: "Cloudflare Tools MCP control workflow with approval gates, redaction, and evidence packs.", typical_use_cases: ["Cloudflare control"] }),
    mk("vnem_tools_cloudflare_workers_deploy", "cloudflare_control", { read_only: false, mutation: true, network: true, requires_approval: true, dry_run_default: true, allowed_roots_required: false, description: "Cloudflare Tools MCP control workflow with approval gates, redaction, and evidence packs.", typical_use_cases: ["Cloudflare control"] }),
    mk("vnem_tools_cloudflare_dns_plan", "cloudflare_control", { read_only: true, mutation: false, network: true, requires_approval: false, dry_run_default: true, allowed_roots_required: false, description: "Cloudflare Tools MCP control workflow with approval gates, redaction, and evidence packs.", typical_use_cases: ["Cloudflare control"] }),
    mk("vnem_tools_cloudflare_dns_apply", "cloudflare_control", { read_only: false, mutation: true, network: true, requires_approval: true, dry_run_default: true, allowed_roots_required: false, description: "Cloudflare Tools MCP control workflow with approval gates, redaction, and evidence packs.", typical_use_cases: ["Cloudflare control"] }),
    mk("vnem_tools_cloudflare_env_plan", "cloudflare_control", { read_only: true, mutation: false, network: true, requires_approval: false, dry_run_default: true, allowed_roots_required: false, description: "Cloudflare Tools MCP control workflow with approval gates, redaction, and evidence packs.", typical_use_cases: ["Cloudflare control"] }),
    mk("vnem_tools_cloudflare_env_apply", "cloudflare_control", { read_only: false, mutation: true, network: true, requires_approval: true, dry_run_default: true, allowed_roots_required: false, description: "Cloudflare Tools MCP control workflow with approval gates, redaction, and evidence packs.", typical_use_cases: ["Cloudflare control"] }),
    mk("vnem_tools_cloudflare_deploy_verify", "cloudflare_control", { read_only: true, mutation: false, network: true, requires_approval: false, dry_run_default: false, allowed_roots_required: false, description: "Cloudflare Tools MCP control workflow with approval gates, redaction, and evidence packs.", typical_use_cases: ["Cloudflare control"] }),
    mk("vnem_tools_cloudflare_rollback_plan", "cloudflare_control", { read_only: true, mutation: false, network: true, requires_approval: false, dry_run_default: true, allowed_roots_required: false, description: "Cloudflare Tools MCP control workflow with approval gates, redaction, and evidence packs.", typical_use_cases: ["Cloudflare control"] }),
    mk("vnem_tools_cloudflare_rollback", "cloudflare_control", { read_only: false, mutation: true, network: true, requires_approval: true, dry_run_default: true, allowed_roots_required: false, description: "Cloudflare Tools MCP control workflow with approval gates, redaction, and evidence packs.", typical_use_cases: ["Cloudflare control"] }),
    mk("vnem_tools_cloudflare_cache_purge_plan", "cloudflare_control", { read_only: true, mutation: false, network: true, requires_approval: false, dry_run_default: true, allowed_roots_required: false, description: "Cloudflare Tools MCP control workflow with approval gates, redaction, and evidence packs.", typical_use_cases: ["Cloudflare control"] }),
    mk("vnem_tools_cloudflare_cache_purge", "cloudflare_control", { read_only: false, mutation: true, network: true, requires_approval: true, dry_run_default: true, allowed_roots_required: false, description: "Cloudflare Tools MCP control workflow with approval gates, redaction, and evidence packs.", typical_use_cases: ["Cloudflare control"] }),
    mk("vnem_tools_evidence_pack_audit", "tools_quality", { description: "Audit mutation evidence pack completeness and anti-fake-success proof.", allowed_roots_required: false, evidence_logged: false }),
    mk("vnem_tools_mutation_approval_contract", "tools_quality", { description: "Check exact approval phrase requirements for high-power mutation/destructive workflows.", allowed_roots_required: false, evidence_logged: false }),
    mk("vnem_tools_secret_redaction_check", "tools_quality", { description: "Detect and prove redaction for secret/token leak patterns including Cloudflare tokens.", allowed_roots_required: false, evidence_logged: false })
  ];
}

function buildToolsManifest(group) {
  const tools = buildToolCatalog().filter((tool) => !group || tool.capability_group === group);
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

const SEARCH_PROVIDER_DEFINITIONS = [
  { name: "local_fixture", env: null, supports_current_web: false, supports_news: false, supports_code_search: false, supports_docs_search: true, supports_safe_search: true, requires_api_key: false, requires_approval: false, rate_limit_notes: "deterministic local CI/test fixture", privacy_notes: "no external network" },
  { name: "direct_url", env: null, supports_current_web: false, supports_news: false, supports_code_search: false, supports_docs_search: true, supports_safe_search: true, requires_api_key: false, requires_approval: true, rate_limit_notes: "not search; inspect provided direct URLs only", privacy_notes: "direct source URLs may be logged in redacted evidence" },
  { name: "brave_search_api", env: "BRAVE_SEARCH_API_KEY", supports_current_web: true, supports_news: true, supports_code_search: false, supports_docs_search: true, supports_safe_search: true, requires_api_key: true, requires_approval: true, rate_limit_notes: "provider rate limits apply", privacy_notes: "query sent to Brave if configured and approved" },
  { name: "serpapi", env: "SERPAPI_API_KEY", supports_current_web: true, supports_news: true, supports_code_search: false, supports_docs_search: true, supports_safe_search: true, requires_api_key: true, requires_approval: true, rate_limit_notes: "provider rate limits apply", privacy_notes: "query sent to SerpAPI if configured and approved" },
  { name: "tavily", env: "TAVILY_API_KEY", supports_current_web: true, supports_news: true, supports_code_search: false, supports_docs_search: true, supports_safe_search: true, requires_api_key: true, requires_approval: true, rate_limit_notes: "provider rate limits apply", privacy_notes: "query sent to Tavily if configured and approved" },
  { name: "exa", env: "EXA_API_KEY", supports_current_web: true, supports_news: false, supports_code_search: false, supports_docs_search: true, supports_safe_search: true, requires_api_key: true, requires_approval: true, rate_limit_notes: "provider rate limits apply", privacy_notes: "query sent to Exa if configured and approved" },
  { name: "github_search_api", env: "GITHUB_TOKEN", supports_current_web: true, supports_news: false, supports_code_search: true, supports_docs_search: false, supports_safe_search: true, requires_api_key: true, requires_approval: true, rate_limit_notes: "GitHub API rate limits apply", privacy_notes: "query sent to GitHub if configured and approved" },
  { name: "npm_registry", env: null, supports_current_web: true, supports_news: false, supports_code_search: false, supports_docs_search: false, supports_safe_search: true, requires_api_key: false, requires_approval: true, rate_limit_notes: "npm registry fair-use applies", privacy_notes: "query sent to npm registry if implemented/approved" },
  { name: "docs_site_search", env: "VNEM_DOCS_SEARCH_ENDPOINT", supports_current_web: false, supports_news: false, supports_code_search: false, supports_docs_search: true, supports_safe_search: true, requires_api_key: false, requires_approval: true, rate_limit_notes: "custom endpoint rate limits apply", privacy_notes: "query sent to configured docs endpoint" },
  { name: "custom_provider", env: "VNEM_SEARCH_PROVIDER_ENDPOINT", supports_current_web: true, supports_news: true, supports_code_search: false, supports_docs_search: true, supports_safe_search: true, requires_api_key: false, requires_approval: true, rate_limit_notes: "custom provider limits apply", privacy_notes: "query sent to configured provider endpoint" }
];

function safeSearchProviderManifest() {
  const providers = SEARCH_PROVIDER_DEFINITIONS.map((provider) => ({
    ...provider,
    configured: provider.env ? Boolean(process.env[provider.env]) : provider.name === "local_fixture" || provider.name === "direct_url" || provider.name === "npm_registry",
    configured_by: provider.env ? (process.env[provider.env] ? `${provider.env}_present` : `${provider.env}_missing`) : "no_key_required",
    env_var_name: provider.env,
    api_key_value_exposed: false
  }));
  return {
    providers,
    configured_providers: providers.filter((p) => p.configured).map((p) => p.name),
    unconfigured_providers: providers.filter((p) => !p.configured).map((p) => p.name),
    supports_current_web: providers.some((p) => p.configured && p.supports_current_web),
    supports_news: providers.some((p) => p.configured && p.supports_news),
    supports_code_search: providers.some((p) => p.configured && p.supports_code_search),
    supports_docs_search: providers.some((p) => p.configured && p.supports_docs_search),
    supports_safe_search: providers.some((p) => p.configured && p.supports_safe_search),
    requires_api_key: providers.filter((p) => p.requires_api_key).map((p) => p.name),
    requires_approval: providers.filter((p) => p.requires_approval).map((p) => p.name),
    rate_limit_notes: Object.fromEntries(providers.map((p) => [p.name, p.rate_limit_notes])),
    privacy_notes: Object.fromEntries(providers.map((p) => [p.name, p.privacy_notes])),
    unsupported_behaviors: ["search-engine result page scraping by default", "automatic CAPTCHA bypass", "login/cookie/session use", "private/account page scraping without approval", "fake current-search claims when provider is unavailable", "broad crawling"],
    evidence_log_id: null
  };
}

async function safeSearchQueryBuilder(args) {
  const task = String(args.task || "");
  const hay = `${task} ${args.domain_hint || ""} ${args.known_context || ""}`.toLowerCase();
  const sourceTypes = [...new Set(arrayify(args.source_types_needed).map(String))];
  const queries = [];
  const intents = [];
  const add = (query, intent) => { if (query && !queries.includes(query)) { queries.push(query); intents.push({ query, intent }); } };
  const base = task.replace(/https?:\/\/\S+/g, "").replace(/["']/g, "").trim();
  if (/security|malware|phishing|download|scam|cve|advisory/.test(hay)) {
    add(`${base} official security advisory`, "primary security/advisory source");
    add(`${base} CVE advisory vulnerability`, "vulnerability/current security source");
    add(`${base} phishing scam malware download risk`, "risk corroboration");
  }
  if (/docs|library|api|software|javascript|mcp|package|npm/.test(hay)) {
    add(`${base} official docs`, "official documentation");
    add(`${base} site:github.com`, "repository/source code");
    add(`${base} changelog release notes`, "version/freshness evidence");
  }
  if (/github|repo|code|issue|pull request/.test(hay)) add(`${base} site:github.com issues OR discussions`, "GitHub issue/repo research");
  if (/game|gaming|elden ring|meta|build|pvp|pve/.test(hay)) {
    add(`${base} official patch notes`, "official game version source");
    add(`${base} current meta community discussion`, "community meta source");
  }
  if (/mod|modding|nexus|toolchain/.test(hay)) {
    add(`${base} official modding docs toolchain`, "modding documentation");
    add(`${base} compatibility version changelog`, "mod/version compatibility");
  }
  if (/compare|best|alternative|product|tool/.test(hay)) {
    add(`${base} official pricing docs comparison`, "primary product details");
    add(`${base} independent review limitations`, "secondary comparison/counter-source");
  }
  if (args.freshness_required || /latest|current|today|2026|recent|this week|now/.test(hay)) {
    add(`${base} latest current ${new Date().getUTCFullYear()}`, "fresh/current source discovery");
    add(`${base} after:${new Date().getUTCFullYear() - 1}-01-01`, "freshness-filtered search");
  }
  add(`${base} official source`, "primary/official source fallback");
  add(`${base} source quality`, "quality/corroboration fallback");
  const result = {
    task: redactSecrets(task),
    queries: queries.slice(0, 12),
    query_intents: intents.slice(0, 12),
    must_have_source_types: [...new Set([...(sourceTypes.length ? sourceTypes : inferNeededSourceTypes(hay)), args.freshness_required ? "fresh_current_source" : null].filter(Boolean))],
    avoid_source_types: ["SEO farms", "AI-generated listicles", "fake download pages", "credential-harvesting pages", "private/account pages without approval", "search result pages scraped as sources"],
    freshness_requirement: { required: Boolean(args.freshness_required || /latest|current|today|recent|this week|now/.test(hay)), reason: args.freshness_required ? "freshness_required input" : "inferred from task wording" },
    official_source_targets: inferOfficialSourceTargets(hay),
    secondary_source_targets: inferSecondarySourceTargets(hay),
    risk_notes: ["Search query planning does not execute a search.", "Use source quality, CAPTCHA detection, URL reputation, and claim/source matrix before final claims."],
    must_not_claim: ["A search happened.", "Search results were fetched.", "Sources were read or verified.", "Currentness was established."]
  };
  return result;
}

async function safeWebSearch(args) {
  const provider = String(args.provider || "local_fixture");
  const query = redactSecrets(String(args.query || ""));
  const max = Math.min(args.max_results || 10, 20);
  const manifest = safeSearchProviderManifest();
  const providerInfo = manifest.providers.find((p) => p.name === provider);
  const dryRun = args.dry_run !== false;
  const base = { provider, query, executed: false, dry_run: dryRun, results: [], result_count: 0, provider_status: "unknown", blocked_or_unavailable_reason: "", freshness_notes: [], safe_to_claim: [], must_not_claim: ["A web search happened.", "Search results were fetched.", "Search result pages were scraped.", "CAPTCHA was bypassed.", "Sources were read beyond search result snippets."], evidence_log_id: null };
  if (!providerInfo) return { ...base, provider_status: "provider_unknown", blocked_or_unavailable_reason: "Provider is not in VNEM search provider manifest." };
  if (dryRun) return { ...base, provider_status: providerInfo.configured ? "dry_run_planned_configured_provider" : "dry_run_planned_provider_unconfigured", blocked_or_unavailable_reason: providerInfo.configured ? "Dry-run only; no provider was contacted." : "Provider is not configured.", safe_to_claim: ["Search was planned only; no provider was contacted."], action_policy_preview: actionPolicyPreview({ action_type: "external_fetch", proposed_action: query }) };
  if (providerInfo.requires_approval) enforceActionPolicy("external_fetch", args);
  if (!providerInfo.configured) {
    const result = { ...base, dry_run: false, provider_status: "provider_unconfigured", blocked_or_unavailable_reason: `${provider} is not configured; no fake results returned.`, must_not_claim: ["Provider search executed.", "Search results were fetched.", "Current web research is complete."] };
    const log = await writeEvidenceLog("web_search", result);
    return { ...result, evidence_log_id: log.evidence_log_id };
  }
  let results = [];
  let providerStatus = "executed_local_fixture";
  let freshness = [];
  if (provider === "local_fixture") {
    results = localFixtureSearch(query).slice(0, max);
    freshness = ["Deterministic local fixture results; not current live web."];
  } else if (provider === "direct_url") {
    results = extractUrlsFromText(query).map((url, i) => ({ title: `Direct URL ${i + 1}`, url: redactUrlString(url), snippet: "Direct URL supplied in query/task; not a search result.", source_type: "direct_url", date: null, provider: "direct_url" })).slice(0, max);
    providerStatus = results.length ? "executed_direct_url_extraction" : "no_direct_url_found";
  } else {
    providerStatus = "provider_configured_but_not_implemented";
    const result = { ...base, dry_run: false, provider_status: providerStatus, blocked_or_unavailable_reason: `${provider} architecture exists but live adapter is not implemented/tested in this build; no fake results returned.`, must_not_claim: ["Provider search executed.", "Search results were fetched.", "Current web research is complete."] };
    const log = await writeEvidenceLog("web_search", result);
    return { ...result, evidence_log_id: log.evidence_log_id };
  }
  const result = { ...base, dry_run: false, executed: results.length > 0, results: results.map(normalizeSearchResult), result_count: results.length, provider_status: providerStatus, freshness_notes: freshness, safe_to_claim: [`${provider} returned ${results.length} result(s).`, provider === "local_fixture" ? "Search results came from deterministic local fixture data, not live web." : "Provider-backed result metadata was returned."], must_not_claim: [provider === "local_fixture" ? "Live/current web search happened." : "Search result pages were scraped.", "Sources were fully read beyond result snippets.", "CAPTCHA was bypassed."] };
  const log = await writeEvidenceLog("web_search", result);
  const withLog = { ...result, evidence_log_id: log.evidence_log_id };
  recordSession(args.session_id, "web_searches", withLog);
  return withLog;
}

async function safeSearchResultRanker(args) {
  const preferred = arrayify(args.preferred_source_types).map((x) => String(x).toLowerCase());
  const normalized = arrayify(args.results).map(normalizeSearchResult);
  const scored = normalized.map((result) => ({ ...result, score: scoreSearchResult(result, String(args.task || ""), preferred, args.freshness_required), risk_flags: urlRiskFlags(result.url, `${result.title} ${result.snippet}`), trust_flags: urlTrustFlags(result.url, result.source_type) }));
  scored.sort((a, b) => b.score - a.score);
  const duplicates = duplicateClusters(scored);
  const risky = scored.filter((r) => r.risk_flags.length || r.score < 30);
  const best = scored.filter((r) => r.score >= 65 && !r.risk_flags.some((f) => /download|credential|malware|phishing/i.test(f))).slice(0, 5);
  const weak = scored.filter((r) => r.score < 50 && !risky.includes(r)).slice(0, 5);
  const missing = preferred.filter((type) => !scored.some((r) => String(r.source_type).toLowerCase().includes(type)));
  const result = { task: redactSecrets(args.task || ""), ranked_results: scored, best_sources: best, weak_sources: weak, risky_sources: risky, duplicate_clusters: duplicates, missing_source_types: missing, recommended_next_queries: missing.map((type) => `${args.task} ${type} official`).slice(0, 5), must_not_claim: ["Ranking proves factual correctness.", "Risky sources are safe to visit/download.", "Fresh/current evidence exists unless dates/providers show it."], evidence_log_id: null };
  const log = await writeEvidenceLog("search_result_ranker", result);
  result.evidence_log_id = log.evidence_log_id;
  recordSession(args.session_id, "search_result_rankings", result);
  return result;
}

async function safeRedirectChainCheck(args) {
  const url = parseSafeResearchUrl(args.url);
  const dryRun = args.dry_run !== false;
  const planned = { url: redactUrl(url), redirect_chain: [], final_url: redactUrl(url), same_domain: true, cross_domain_redirects: [], suspicious_redirects: [], blocked_reason: "", dry_run: dryRun, executed: false, safe_to_claim: [], must_not_claim: ["A redirect chain was checked.", "The final page was visited/read.", "Cookies/session/login were used."], evidence_log_id: null };
  if (dryRun) return planned;
  enforceApproval(args);
  const chain = [];
  let current = url;
  let blocked = "";
  for (let i = 0; i < Math.min(args.max_redirects || 5, 10); i++) {
    let response;
    try { response = await fetch(current, { method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(Math.min(args.timeout_ms || 8000, MAX_API_TIMEOUT_MS)) }); }
    catch (error) { blocked = `request_failed: ${error.message}`; break; }
    const location = response.headers.get("location");
    const item = { url: redactUrl(current), status: response.status, method: "HEAD", location: location ? redactUrlString(new URL(location, current).toString()) : null };
    chain.push(item);
    if (![301, 302, 303, 307, 308].includes(response.status) || !location) break;
    const next = new URL(location, current);
    if (next.username || next.password || containsRawSecret(next.toString())) { blocked = "credentialed_or_secret_redirect_blocked"; break; }
    if (!["http:", "https:"].includes(next.protocol)) { blocked = "unsafe_redirect_scheme_blocked"; break; }
    current = next;
    if (current.protocol === "http:" && !isLocalHostname(current.hostname)) { chain.push({ url: redactUrl(current), status: null, method: "not_fetched", location: null }); break; }
  }
  const hosts = chain.map((c) => { try { return new URL(c.url).hostname.replace(/^www\./, ""); } catch { return ""; } }).filter(Boolean);
  const startHost = hosts[0] || url.hostname;
  const cross = chain.filter((c) => { try { return new URL(c.url).hostname.replace(/^www\./, "") !== startHost; } catch { return false; } });
  const suspicious = chain.map((c) => ({ ...c, reason: redirectSuspicionReason(c, startHost) })).filter((c) => c.reason);
  const result = { ...planned, redirect_chain: chain, final_url: chain.at(-1)?.url || redactUrl(current), same_domain: cross.length === 0, cross_domain_redirects: cross, suspicious_redirects: suspicious, blocked_reason: blocked, dry_run: false, executed: true, safe_to_claim: ["Redirect metadata was checked with Tools MCP safeguards."], must_not_claim: ["Final page content was read.", "The URL is safe or trustworthy.", "Cookies/session/login were used."] };
  const log = await writeEvidenceLog("redirect_chain_check", result);
  const withLog = { ...result, evidence_log_id: log.evidence_log_id };
  recordSession(args.session_id, "redirect_chain_checks", withLog);
  return withLog;
}

async function safeUrlReputationCheck(args) {
  const flags = urlRiskFlags(args.url, args.url);
  const trust = urlTrustFlags(args.url, "");
  for (const item of arrayify(args.redirect_chain)) {
    const reason = redirectSuspicionReason(item, safeOptionalUrl(args.url).hostname.replace(/^www\./, ""));
    if (reason) flags.push(`redirect_${reason}`);
  }
  for (const domain of arrayify(args.known_official_domains)) if (String(args.url).includes(String(domain))) trust.push("matches_known_official_domain");
  const uniqueFlags = [...new Set(flags)];
  const risk = uniqueFlags.some((f) => /credential|executable|phishing|malware|scam|shortener|redirect/.test(f)) ? "high" : uniqueFlags.length >= 2 ? "medium" : "low";
  const result = { risk_level: risk, risk_flags: uniqueFlags, trust_flags: [...new Set(trust)], recommended_action: risk === "high" ? "Do not enter credentials, do not download, inspect source via safe tools and ask user before visiting." : risk === "medium" ? "Proceed only with source-quality checks and user confirmation." : "Low heuristic risk; still verify source quality before trusting.", safe_to_visit: risk !== "high", safe_to_download: false, requires_user_confirmation: risk !== "low", must_not_claim: ["This is an antivirus verdict.", "The URL is definitely safe.", "Downloads from this URL are safe to run."], evidence_log_id: null };
  const log = await writeEvidenceLog("url_reputation_check", result);
  result.evidence_log_id = log.evidence_log_id;
  recordSession(args.session_id, "url_reputation_checks", result);
  return result;
}

async function safeCaptchaDetector(args) {
  const text = `${args.url || ""} ${args.html || ""} ${args.text || ""} ${JSON.stringify(args.screenshot_metadata || {})} ${JSON.stringify(args.page_inspection || {})}`;
  const signals = [];
  if (/captcha|g-recaptcha|hcaptcha|cf-turnstile|data-sitekey|challenge/i.test(text)) signals.push("captcha_challenge_marker");
  if (/verify you are human|are you a robot|unusual traffic|bot detection|automated access/i.test(text)) signals.push("human_verification_text");
  if (/cloudflare ray id|access denied|akamai|perimeterx|datadome|incapsula|blocked/i.test(text)) signals.push("anti_bot_or_access_block_vendor_text");
  const detected = signals.length > 0;
  const result = { captcha_or_block_detected: detected, block_type: detected ? (signals.some((s) => /captcha/.test(s)) ? "captcha_or_anti_bot_challenge" : "access_block_or_anti_bot") : "none_detected", signals, recommended_safe_next_steps: detected ? ["Ask the user to solve the CAPTCHA manually only if they own or are allowed to access the page.", "Ask the user to paste page text after access instead of bypassing anti-bot systems.", "Use official API/docs/source or another official mirror/source when available.", "Stop and report that access is blocked if no allowed path exists."] : ["No CAPTCHA/block signals detected in provided content; continue with normal source quality checks."], user_assisted_handoff_required: detected, alternative_research_paths: ["official docs/API", "provider search through configured approved provider", "direct source URL supplied by user", "cached local docs or repository source"], must_not_claim: ["No automatic CAPTCHA bypass was attempted or provided.", "CAPTCHA/access block was solved automatically.", "Blocked/private content was accessed."], evidence_log_id: null };
  const log = await writeEvidenceLog("captcha_detector", result);
  result.evidence_log_id = log.evidence_log_id;
  recordSession(args.session_id, "captcha_detections", result);
  return result;
}

async function safeDownloadSafetyCheck(args) {
  const url = parseSafeResearchUrl(args.download_url);
  const flags = urlRiskFlags(url.toString(), `${args.download_url} ${args.source_page_url || ""}`);
  const ext = fileTypeGuess(url.pathname);
  if (/executable|archive|script/.test(ext)) flags.push(`${ext}_download_type`);
  if (Number(args.source_quality_score ?? 60) < 40) flags.push("low_source_quality_score");
  const dryRun = args.dry_run !== false;
  let executedHead = false;
  let contentType = null;
  let length = null;
  if (!dryRun) {
    enforceActionPolicy("download_check", args);
    try {
      const response = await fetch(url, { method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(8000) });
      executedHead = true;
      contentType = response.headers.get("content-type");
      length = response.headers.get("content-length");
    } catch (error) { flags.push(`head_request_failed:${error.message}`); }
  }
  const unique = [...new Set(flags)];
  const risk = unique.some((f) => /executable|script|fake|phishing|credential|low_source|suspicious|shortener/.test(f)) ? "high" : unique.some((f) => /archive|download/.test(f)) ? "medium" : "low";
  const result = { download_url: redactUrl(url), file_type_guess: ext, source_domain: safeOptionalUrl(args.source_page_url || url.toString()).hostname, risk_level: risk, risk_flags: unique, recommended_action: risk === "high" ? "Do not download or run. Use official source, checksums/signatures, and manual review." : "Do not auto-download; verify official source, checksum/signature, and user approval first.", requires_manual_review: true, executed_head_request: executedHead, content_type: contentType, content_length: length, must_not_claim: ["The file was downloaded.", "The file is safe to run.", "Antivirus scanning was performed.", "Installer/download authenticity was proven."], evidence_log_id: null };
  const log = await writeEvidenceLog("download_safety_check", result);
  result.evidence_log_id = log.evidence_log_id;
  recordSession(args.session_id, "download_safety_checks", result);
  return result;
}

async function safeSourceMap(args) {
  const sourceType = String(args.source_type || "local_repo");
  const source = String(args.source || ".");
  const isExternal = /^https?:\/\//i.test(source);
  if (isExternal) {
    const result = {
      source: redactSecrets(source),
      source_type: sourceType,
      top_level_structure: [],
      important_files_or_pages: [],
      docs_locations: [],
      code_locations: [],
      config_locations: [],
      test_or_example_locations: [],
      changelog_or_release_locations: [],
      issue_or_pr_locations_if_available_or_blocked: ["external issue/PR/release extraction requires explicit selected URLs and approval; no broad crawl performed"],
      likely_irrelevant_areas: [],
      missing_or_blocked_areas: ["external_source_mapping_requires_selected_fetch_or_link_map", "broad_crawl_blocked"],
      allowed_roots_check: { inside_allowed_roots: false, external_source: true },
      permission_profile: activePermissionProfile.profile_name,
      trust_boundary: "0_public_information",
      evidence_log_id: null,
      safe_to_claim: ["External source map was planned/blocked only; no hidden external fetch or crawl occurred."],
      must_not_claim: sourceIngestionMustNotClaim()
    };
    const log = await writeEvidenceLog("source_map", result);
    result.evidence_log_id = log.evidence_log_id;
    recordSession(args.session_id, "source_maps", result);
    return result;
  }
  const root = await resolveAllowedRoot(source);
  const files = [];
  await walkFiles(root.absolutePath, root.absolutePath, files, { maxResults: args.max_files || 150 });
  const topEntries = await readdir(root.absolutePath, { withFileTypes: true });
  const top = topEntries.slice(0, 120).map((entry) => ({ path: entry.name, type: entry.isDirectory() ? "directory" : "file", skipped: SKIPPED_DIRS.has(entry.name) || isSecretLikePath(path.join(root.absolutePath, entry.name)) }));
  const rels = files.map((file) => file.path);
  const pick = (re, max = 40) => rels.filter((rel) => re.test(rel)).slice(0, max);
  const blocked = top.filter((entry) => entry.skipped).map((entry) => `${entry.path}: skipped by source-map safety policy`);
  for (const name of [".env", ".env.local", "sessions.db", "cookies.txt", "secrets", "tokens", "credentials", ".ssh", "browser-profile", "password-manager"]) {
    if (existsSync(path.join(root.absolutePath, name))) blocked.push(`${name}: secret/session/private path blocked`);
  }
  const result = {
    source: root.absolutePath,
    source_type: sourceType,
    top_level_structure: top,
    important_files_or_pages: pick(/(^|\/)(README|AGENTS|package|pyproject|Cargo|go\.mod|requirements|CHANGELOG|SECURITY|LICENSE)(\.|$)/i, 60),
    docs_locations: pick(/(^|\/)(docs?|documentation|guides?)(\/|$)|README|quickstart|install/i),
    code_locations: pick(/(^|\/)(src|lib|app|pages|server|client|api|components|routes)(\/|$)|\.(js|mjs|ts|tsx|jsx|py|go|rs|java|cs)$/i),
    config_locations: pick(/(^|\/)(package\.json|tsconfig|vite|next|astro|eslint|prettier|docker|compose|config|\.github\/workflows)/i),
    test_or_example_locations: pick(/(^|\/)(tests?|__tests__|spec|examples?|fixtures?)(\/|$)|\.(test|spec)\./i),
    changelog_or_release_locations: pick(/CHANGELOG|RELEASE|HISTORY|MIGRATION|versions?/i),
    issue_or_pr_locations_if_available_or_blocked: ["Local source map does not read remote GitHub issues/PRs; use explicit public issue/release URLs if needed."],
    likely_irrelevant_areas: ["node_modules", ".git", "build outputs", "coverage", "cache directories"].filter((name) => top.some((entry) => entry.path === name || entry.path.includes(name))),
    missing_or_blocked_areas: [...new Set(blocked)],
    allowed_roots_check: { inside_allowed_roots: true, matched_root: root.root, allowed_roots: allowedRoots },
    permission_profile: activePermissionProfile.profile_name,
    trust_boundary: "2_local_project_information",
    evidence_log_id: null,
    safe_to_claim: [`Mapped ${files.length} non-secret file(s) under the allowed source root.`, "Only structure/path metadata was inspected; secret-like paths and skipped directories were not read."],
    must_not_claim: sourceIngestionMustNotClaim()
  };
  const log = await writeEvidenceLog("source_map", result);
  result.evidence_log_id = log.evidence_log_id;
  recordSession(args.session_id, "source_maps", result);
  return result;
}

async function safeSourceExtract(args) {
  const root = await resolveAllowedRoot(args.source_root || ".");
  const targets = arrayify(args.targets).map(String).filter(Boolean).slice(0, Math.min(args.max_targets || 12, 30));
  const read = [];
  const skipped = [];
  const evidenceItems = [];
  if (!targets.length) skipped.push({ path: "<none>", reason: "explicit targets are required; broad extraction/crawling is blocked" });
  for (const targetName of targets) {
    try {
      const target = await resolveAllowedFile(path.isAbsolute(targetName) ? targetName : path.join(root.absolutePath, targetName), { mustExist: true, blockSecrets: true });
      const info = await stat(target.absolutePath);
      if (!info.isFile()) { skipped.push({ path: target.relativePath, reason: "not_a_regular_file" }); continue; }
      const bytes = await readFile(target.absolutePath);
      if (bytes.includes(0) || looksBinary(bytes)) { skipped.push({ path: target.relativePath, reason: "binary_file_blocked" }); continue; }
      const capped = bytes.subarray(0, Math.min(args.max_bytes_per_target || 4000, 16000)).toString("utf8");
      const text = redactSecrets(capped);
      read.push({ path: target.relativePath, bytes_read: Math.min(bytes.length, Buffer.byteLength(capped)), truncated: bytes.length > Buffer.byteLength(capped) });
      evidenceItems.push({ path: target.relativePath, source_type: inferSourceTypeFromPath(target.relativePath), excerpt: truncate(text, 1200), relevance: inferExtractionRelevance(target.relativePath, args.extraction_goal), officialness: inferOfficialness({ path: target.relativePath, text }) });
    } catch (error) {
      skipped.push({ path: targetName, reason: error?.code === "secret_path_blocked" ? "secret_path_blocked" : error?.message || "blocked_or_missing" });
    }
  }
  const combined = evidenceItems.map((item) => `${item.path}\n${item.excerpt}`).join("\n");
  const result = {
    extraction_goal: args.extraction_goal,
    targets_read: read,
    targets_skipped: skipped,
    evidence_items: evidenceItems,
    claim_candidates: extractClaimCandidates(combined),
    dates_or_versions_found: extractDatesAndVersions(combined),
    officialness: summarizeOfficialness(evidenceItems),
    source_quality_notes: evidenceItems.map((item) => ({ path: item.path, source_type: item.source_type, note: item.officialness === "likely_official_project_source" ? "project-local/official repo evidence" : "bounded local source evidence" })),
    freshness_notes: freshnessNotesForText(combined),
    contradictions_found: detectSimpleContradictions(evidenceItems.map((item) => ({ title: item.path, text_excerpt: item.excerpt, source_type: item.source_type, official: item.officialness === "likely_official_project_source" }))),
    gaps: [read.length ? null : "No explicit targets were read.", "Extraction was bounded to selected targets; unselected repo/site areas remain uninspected."].filter(Boolean),
    permission_profile: activePermissionProfile.profile_name,
    trust_boundary_level: "2_local_project_information",
    allowed_roots_check: { inside_allowed_roots: true, matched_root: root.root },
    evidence_log_id: null,
    safe_to_claim: ["Only explicit selected targets were read under allowed roots.", "Secret-like paths were blocked and text excerpts were redacted."],
    must_not_claim: sourceIngestionMustNotClaim()
  };
  const log = await writeEvidenceLog("source_extract", result);
  result.evidence_log_id = log.evidence_log_id;
  recordSession(args.session_id, "source_extracts", result);
  return result;
}

async function safeSourceGraph(args) {
  const rawSources = arrayify(args.sources).map(normalizeGraphSource);
  const claims = arrayify(args.claims).map(String).filter(Boolean);
  const sources = rawSources.map((source) => ({
    ...source,
    freshness: classifyFreshness(source),
    trust_level: classifySourceTrust(source),
    claims_supported: claims.filter((claim) => sourceSupportsClaim(source, claim)),
    claims_contradicted: claims.filter((claim) => sourceContradictsClaim(source, claim)),
    outdated_risk: classifyFreshness(source).includes("outdated") || classifyFreshness(source).includes("old"),
    links_to_stronger_evidence: source.official ? [] : rawSources.filter((other) => other.official).map((other) => other.title).slice(0, 3),
    confidence: source.official ? "medium_high" : "low_to_medium",
    notes: source.official ? "Official or primary-like source." : "Community/secondary source; corroborate before confident claims."
  }));
  const contradictions = detectGraphContradictions(sources, claims);
  const verification = claims.map((claim) => {
    const supporting = sources.filter((source) => source.claims_supported.includes(claim));
    const contradicting = sources.filter((source) => source.claims_contradicted.includes(claim));
    const status = contradicting.length ? "contradicted" : supporting.some((s) => s.official) ? "well_supported" : supporting.length ? "likely" : "unknown";
    return { claim, status, supporting_sources: supporting.map((s) => s.title), contradicting_sources: contradicting.map((s) => s.title), confidence: status === "well_supported" ? "medium_high" : status === "contradicted" ? "low_until_resolved" : "low" };
  });
  const result = {
    task: args.task || "",
    sources,
    source_type: [...new Set(sources.map((s) => s.source_type))],
    contradictions_found: contradictions,
    claim_verification: verification,
    freshness_summary: { outdated_risk_count: sources.filter((s) => s.outdated_risk).length, freshness_required_unknown_unless_current_sources: /current|latest|today|recent|now/i.test(args.task || "") },
    permission_profile: activePermissionProfile.profile_name,
    trust_boundary_level: sources.some((s) => /^https?:/i.test(s.url || "")) ? "0_public_information" : "2_local_project_information",
    allowed_roots_check: { provided_sources_only: true, local_file_reads: false },
    confidence: contradictions.length ? "medium_with_conflicts" : sources.length > 1 ? "medium" : "low_single_source",
    notes: [sources.length < 2 ? "Single-source graph cannot prove contradiction-free status." : "Multiple provided sources compared.", contradictions.length ? "Resolve contradictions before confident final claims." : "No contradiction detected in provided sources only."],
    evidence_log_id: null,
    safe_to_claim: ["Source graph compared only provided sources / bounded source evidence.", "Contradiction and freshness notes are limited to supplied source text/metadata."],
    must_not_claim: ["A broad search or crawl happened.", "The topic is contradiction-free when fewer than two relevant sources were checked.", "Outdated/community sources override stronger official evidence.", "Missing sources were checked."]
  };
  const log = await writeEvidenceLog("source_graph", result);
  result.evidence_log_id = log.evidence_log_id;
  recordSession(args.session_id, "source_graphs", result);
  return result;
}

function sourceIngestionMustNotClaim() {
  return ["A broad crawl or scrape was performed.", "Secret/cookie/session/browser-profile files were read.", "External pages were fetched without explicit approved fetch evidence.", "The full repo/site is understood when only a bounded map/extract was performed.", "GitHub issues/PRs/releases were extracted unless explicit source evidence says so."];
}

function inferSourceTypeFromPath(rel) {
  if (/README/i.test(rel)) return "readme";
  if (/docs?|guide|quickstart|install/i.test(rel)) return "docs";
  if (/CHANGELOG|RELEASE|HISTORY|MIGRATION/i.test(rel)) return "changelog_or_release_notes";
  if (/(^|\/)(tests?|__tests__|spec|examples?)(\/|$)|\.(test|spec)\./i.test(rel)) return "test_or_example";
  if (/package\.json|pyproject|Cargo|go\.mod|requirements|config|tsconfig|vite|next|astro/i.test(rel)) return "config_or_manifest";
  if (/\.(js|mjs|ts|tsx|jsx|py|go|rs|java|cs)$/i.test(rel)) return "code";
  return "local_file";
}

function inferExtractionRelevance(rel, goal) {
  const text = `${rel} ${goal}`.toLowerCase();
  if (/readme|docs|guide|install|changelog|release|package|src|test/.test(text)) return "high";
  return "medium";
}

function inferOfficialness(item = {}) {
  const text = `${item.path || ""} ${item.url || ""} ${item.source_type || ""} ${item.title || ""}`.toLowerCase();
  if (item.official === true || /official|docs|readme|changelog|release|repo|package/.test(text)) return "likely_official_project_source";
  if (/blog|forum|reddit|community/.test(text)) return "community_or_secondary";
  return "unknown";
}

function summarizeOfficialness(items) {
  return { likely_official_count: items.filter((item) => item.officialness === "likely_official_project_source").length, unknown_count: items.filter((item) => item.officialness === "unknown").length };
}

function extractClaimCandidates(text) {
  const sentences = String(text || "").split(/(?<=[.!?])\s+|\n+/).map((line) => line.trim()).filter(Boolean);
  return sentences.filter((line) => /install|setup|version|current|requires?|supports?|deprecated|API|breaking|release/i.test(line)).slice(0, 20).map((claim) => ({ claim: truncate(redactSecrets(claim), 240), status: "candidate_needs_source_graph_or_audit" }));
}

function extractDatesAndVersions(text) {
  const out = [];
  for (const match of String(text || "").matchAll(/\b(?:v?\d+\.\d+(?:\.\d+)?|20\d{2}-\d{2}-\d{2}|20\d{2})\b/g)) out.push({ value: match[0], context: "date_or_version_candidate" });
  return [...new Map(out.map((item) => [item.value, item])).values()].slice(0, 30);
}

function freshnessNotesForText(text) {
  const notes = [];
  if (/20\d{2}-\d{2}-\d{2}|20\d{2}/.test(text)) notes.push("Date-like evidence found; compare with current task requirements before claiming freshness.");
  else notes.push("No clear date found; freshness unknown.");
  if (/deprecated|removed|breaking|migration|release/i.test(text)) notes.push("Version/change wording found; release/changelog evidence may be needed.");
  return notes;
}

function normalizeGraphSource(source = {}, index = 0) {
  return {
    id: source.id || `S${index + 1}`,
    title: redactSecrets(source.title || source.path || source.url || `source_${index + 1}`),
    url: source.url ? redactSecrets(source.url) : null,
    source_type: String(source.source_type || inferSourceTypeFromPath(source.path || "") || "unknown"),
    owner_or_author: redactSecrets(source.owner_or_author || source.author || source.owner || "unknown"),
    official: Boolean(source.official) || inferOfficialness(source) === "likely_official_project_source",
    published_at: source.published_at || source.date || source.retrieved_at || null,
    text_excerpt: redactSecrets(source.text_excerpt || source.excerpt || source.summary || source.text || "")
  };
}

function classifyFreshness(source) {
  const d = String(source.published_at || "");
  const year = Number((d.match(/20\d{2}/) || [])[0] || 0);
  if (!year) return "unknown";
  if (year <= new Date().getFullYear() - 3) return "outdated_risk";
  if (year < new Date().getFullYear()) return "probably_current_or_version_specific";
  return "current_or_recent";
}

function classifySourceTrust(source) {
  if (source.official) return "high";
  if (/release|changelog|repo|package/.test(source.source_type)) return "medium_high";
  if (/community|blog|forum|reddit/.test(source.source_type)) return "medium_low";
  return "medium";
}

function sourceSupportsClaim(source, claim) {
  const terms = significantTerms(claim);
  const hay = source.text_excerpt.toLowerCase();
  return terms.length > 0 && terms.every((term) => hay.includes(term)) && !sourceContradictsClaim(source, claim);
}

function sourceContradictsClaim(source, claim) {
  const hay = source.text_excerpt.toLowerCase();
  const c = String(claim || "").toLowerCase();
  if (/npm install/.test(c) && /npm install.*(removed|deprecated|no longer|not supported)|removed.*npm install|deprecated.*npm install/.test(hay)) return true;
  if (/yarn add/.test(c) && ((/yarn/.test(hay) && /removed|deprecated|no longer|not supported|not/.test(hay)) || (/npm install/.test(hay) && /removed|deprecated|no longer|not/.test(hay)))) return true;
  if (/current|latest|version 2/.test(c) && /version 1 is current|v1 is current/.test(hay)) return true;
  if (/stable|supported|required|deprecated/.test(c) && /not stable|unsupported|not supported|no longer required|not deprecated/.test(hay)) return true;
  return false;
}

function detectSimpleContradictions(items) {
  return detectGraphContradictions(items.map(normalizeGraphSource), []);
}

function detectGraphContradictions(sources, claims) {
  const contradictions = [];
  const all = sources.map((s) => `${s.title} ${s.text_excerpt}`).join("\n").toLowerCase();
  const installCommands = [...new Set([...all.matchAll(/\b(npm install|npm create|yarn add|pnpm add|pip install|uv add)\b/g)].map((m) => m[1]))];
  if (installCommands.length > 1) contradictions.push({ type: "conflicting_install_steps", details: installCommands, resolution_hint: "Prefer official current docs/release notes, then test in target runtime." });
  const versions = [...new Set([...all.matchAll(/\bversion\s+([0-9]+(?:\.[0-9]+)*)\s+is\s+current/g)].map((m) => m[1]))];
  if (versions.length > 1) contradictions.push({ type: "version_conflict", details: versions, resolution_hint: "Check release notes/package registry/current official docs." });
  if (sources.some((s) => s.outdated_risk || classifyFreshness(s).includes("outdated")) && sources.some((s) => s.official && /release|docs|official/i.test(`${s.source_type} ${s.title}`))) contradictions.push({ type: "old_docs_vs_new_docs", details: ["Older source conflicts or may conflict with current official/release evidence."], resolution_hint: "Use current official/release evidence first." });
  if (sources.some((s) => !s.official) && sources.some((s) => s.official) && /not deprecated|version 1 is current|yarn add/.test(all) && /deprecated|version 2 is current|npm install/.test(all)) contradictions.push({ type: "official_vs_community_conflict", details: ["Community/secondary wording appears to conflict with official/current source wording."], resolution_hint: "Prefer official source unless runtime evidence disproves it." });
  if (!sources.length) contradictions.push({ type: "unknown_due_to_missing_source", details: ["No sources supplied."], resolution_hint: "Supply at least one bounded source." });
  return contradictions;
}

function formatSourceMap(result) { return `vnem_tools_source_map: ${result.source_type} ${result.top_level_structure.length} top-level item(s); blocked ${result.missing_or_blocked_areas.length}\nevidence: ${result.evidence_log_id || "not written"}`; }
function formatSourceExtract(result) { return `vnem_tools_source_extract: read ${result.targets_read.length}; skipped ${result.targets_skipped.length}; claims ${result.claim_candidates.length}\nevidence: ${result.evidence_log_id || "not written"}`; }
function formatSourceGraph(result) { return `vnem_tools_source_graph: ${result.sources.length} source(s); contradictions ${result.contradictions_found.length}; confidence ${result.confidence}\nevidence: ${result.evidence_log_id || "not written"}`; }

async function safeClaimSourceMatrix(args) {
  const sources = arrayify(args.sources).map((s, i) => normalizeMatrixSource(s, i));
  const claims = arrayify(args.claims).map(String);
  const matrix = [];
  const supported = [];
  const unsupported = [];
  const conflicting = [];
  for (const claim of claims) {
    const rows = sources.map((source) => assessClaimAgainstSource(claim, source));
    matrix.push({ claim, source_results: rows });
    const supportRows = rows.filter((r) => r.support === "supports");
    const conflictRows = rows.filter((r) => r.support === "conflicts");
    if (conflictRows.length || (/captcha.*bypass|bypass.*captcha/i.test(claim) && !supportRows.some((r) => r.source_quality_score >= 80))) conflicting.push({ claim, supporting_sources: supportRows.map((r) => r.source_id), conflicting_sources: conflictRows.map((r) => r.source_id), reason: "Conflicting or safety-critical claim requires high-quality corroboration." });
    else if (supportRows.length) supported.push({ claim, supporting_sources: supportRows.map((r) => r.source_id), confidence: supportRows.some((r) => r.source_quality_score >= 80) ? "medium_high" : "low" });
    else unsupported.push({ claim, reason: "No provided source clearly supports this claim." });
  }
  const result = { claims, sources, matrix, supported_claims: supported, unsupported_claims: unsupported, conflicting_claims: conflicting, source_quality_notes: sources.map((s) => ({ source_id: s.id, title: s.title, quality_score: s.source_quality_score, notes: s.source_quality_score >= 80 ? "strong source" : s.source_quality_score < 50 ? "weak source" : "medium source" })), citation_plan: supported.map((s) => `${s.claim}: cite ${s.supporting_sources.join(", ")}`).slice(0, 12), must_not_claim: ["All claims are supported.", "Unsupported/conflicting claims are proven.", "Source quality was externally verified beyond provided metadata."], evidence_log_id: null };
  const log = await writeEvidenceLog("claim_source_matrix", result);
  result.evidence_log_id = log.evidence_log_id;
  recordSession(args.session_id, "claim_source_matrices", result);
  return result;
}

async function safeResearchGapDetector(args) {
  const task = String(args.task || "");
  const hay = `${task} ${args.domain || ""}`.toLowerCase();
  const sources = arrayify(args.sources).map((s, i) => normalizeMatrixSource(s, i));
  const hasOfficial = sources.some((s) => /official|docs|primary|vendor|github/.test(`${s.source_type} ${s.title}`.toLowerCase()) || s.source_quality_score >= 85);
  const hasCommunity = sources.some((s) => /community|forum|reddit|discussion/.test(`${s.source_type} ${s.title}`.toLowerCase()));
  const hasCounter = sources.length > 1 && arrayify(args.claims).length > 0;
  const freshness = Boolean(args.freshness_required || /latest|current|today|recent|now|this week|meta/.test(hay));
  const missing = [];
  if (!hasOfficial) missing.push("official_or_primary_source");
  if (/game|meta|community|mod/.test(hay) && !hasCommunity) missing.push("community_source");
  if (/security|malware|phishing|download|cve/.test(hay)) missing.push("security_advisory_or_reputation_source");
  const blockers = [];
  if (freshness) blockers.push("current/fresh search evidence is missing");
  if (!hasOfficial) blockers.push("primary/official source is missing");
  if (!hasCounter) blockers.push("counter-source/conflict check is missing");
  if (sources.some((s) => !s.published_at)) blockers.push("dates or versions are missing for at least one source");
  const result = { missing_source_types: [...new Set(missing)], missing_current_search: freshness, missing_primary_sources: hasOfficial ? [] : ["official docs/API/vendor/source repository/patch notes"], missing_counter_sources: hasCounter ? [] : ["independent corroborating or counter-source"], missing_dates_or_versions: sources.filter((s) => !s.published_at).map((s) => s.id || s.title), confidence_blockers: blockers, recommended_next_queries: (await safeSearchQueryBuilder({ task, freshness_required: freshness, source_types_needed: missing })).queries.slice(0, 6), recommended_next_tools: ["vnem_tools_search_provider_manifest", "vnem_tools_search_query_builder", "vnem_tools_web_search", "vnem_tools_search_result_ranker", "vnem_tools_source_quality_check", "vnem_tools_claim_source_matrix"], must_not_claim: ["A confident final answer is justified before gaps are closed.", "Current/latest facts are verified without current search evidence.", "Primary sources were checked if they are missing."], evidence_log_id: null };
  const log = await writeEvidenceLog("research_gap_detector", result);
  result.evidence_log_id = log.evidence_log_id;
  recordSession(args.session_id, "research_gap_detections", result);
  return result;
}

function inferNeededSourceTypes(text) {
  const out = ["official_docs"];
  if (/current|latest|news|today|recent/.test(text)) out.push("current_web");
  if (/security|malware|phishing|cve/.test(text)) out.push("security_advisory");
  if (/github|repo|code/.test(text)) out.push("github_repo");
  if (/game|meta|mod/.test(text)) out.push("community_source");
  return out;
}
function inferOfficialSourceTargets(text) { return [/github|repo|code/.test(text) ? "GitHub repository/releases/issues" : null, /npm|javascript|library/.test(text) ? "official docs/npm package/changelog" : null, /security|cve/.test(text) ? "vendor advisory/CVE/NVD" : null, /game|elden|meta/.test(text) ? "official patch notes" : null, "vendor/project official documentation"].filter(Boolean); }
function inferSecondarySourceTargets(text) { return [/game|meta|mod/.test(text) ? "community forums/reddit/wiki with lower authority" : null, /product|compare|best/.test(text) ? "independent reviews and limitation reports" : null, /security|malware|phishing/.test(text) ? "reputation/security databases" : null, "credible secondary analysis"].filter(Boolean); }
function localFixtureSearch(query) {
  const q = String(query || "");
  return [
    { title: "Official Browser MCP Security Docs", url: "https://docs.example.com/browser-mcp/security", snippet: `Official docs matching ${q}. Updated 2026.`, source_type: "official_docs", date: "2026-06-01", provider: "local_fixture" },
    { title: "GitHub browser MCP repository", url: "https://github.com/example/browser-mcp", snippet: "Repository, releases, and issues for source verification.", source_type: "github_repo", date: "2026-05-20", provider: "local_fixture" },
    { title: "Security advisory for browser automation tools", url: "https://security.example.org/advisories/browser-mcp", snippet: "Advisory-style fixture for phishing/download risk.", source_type: "security_advisory", date: "2026-04-10", provider: "local_fixture" },
    { title: "Community discussion of browser MCP tools", url: "https://reddit.com/r/mcp/comments/browser-tools", snippet: "Community discussion; useful but lower authority.", source_type: "community", date: "2026-03-01", provider: "local_fixture" },
    { title: "Download NOW free browser MCP installer!!!", url: "https://free-download-example.xyz/setup.exe", snippet: "Spammy fake download result fixture.", source_type: "download", date: null, provider: "local_fixture" }
  ];
}
function normalizeSearchResult(result) { return { title: truncate(redactSecrets(result.title || "Untitled"), 200), url: redactUrlString(result.url || ""), snippet: truncate(redactSecrets(result.snippet || result.description || ""), 500), source_type: String(result.source_type || inferSourceTypeFromUrl(result.url || "", result.title || "")).toLowerCase(), date: result.date || result.published_at || null, provider: result.provider || null }; }
function inferSourceTypeFromUrl(url, title = "") { const hay = `${url} ${title}`.toLowerCase(); if (/github\.com/.test(hay)) return "github_repo"; if (/docs|documentation|developer|api/.test(hay)) return "official_docs"; if (/reddit|forum|discussion/.test(hay)) return "community"; if (/download|\.exe|\.msi|\.zip/.test(hay)) return "download"; if (/security|advisory|cve/.test(hay)) return "security_advisory"; return "web"; }
function scoreSearchResult(result, task, preferred, freshnessRequired) { let score = 35; const hay = `${result.title} ${result.snippet} ${result.url}`.toLowerCase(); const terms = significantTerms(task); score += Math.min(25, terms.filter((term) => hay.includes(term)).length * 4); if (/official|docs|documentation|vendor|github\.com/.test(hay) || /official_docs|github_repo|security_advisory/.test(result.source_type)) score += 25; if (preferred.includes(String(result.source_type).toLowerCase())) score += 15; if (result.date) score += freshnessRequired ? 15 : 5; if (/reddit|forum|community/.test(result.source_type)) score -= preferred.includes("community") ? 0 : 8; for (const flag of urlRiskFlags(result.url, hay)) score -= /download|credential|phishing|malware/.test(flag) ? 35 : 12; return Math.max(0, Math.min(100, score)); }
function duplicateClusters(results) { const map = new Map(); for (const r of results) { const key = `${r.title}`.toLowerCase().replace(/\butm\b|copy|\W+/g, " ").trim().slice(0, 60); if (!map.has(key)) map.set(key, []); map.get(key).push(r); } return [...map.values()].filter((items) => items.length > 1).map((items) => items.map((item) => item.url)); }
function urlRiskFlags(urlValue, text = "") { const flags = []; const raw = String(urlValue || ""); const hay = `${raw} ${text}`.toLowerCase(); let url; try { url = new URL(raw, "https://local.invalid/"); } catch { flags.push("invalid_url"); return flags; } if (url.username || url.password || /:\/\/[^/\s]+:[^@/\s]+@/.test(raw)) flags.push("credentialed_url"); if (containsRawSecret(raw)) flags.push("secret_like_url_parameter"); if (/xn--/.test(url.hostname)) flags.push("punycode_or_homograph_risk"); if (/\.(xyz|top|click|zip|mov|tk|ru)$/i.test(url.hostname)) flags.push("suspicious_tld_or_domain_pattern"); if (/bit\.ly|tinyurl|t\.co|goo\.gl|ow\.ly|is\.gd/.test(url.hostname)) flags.push("url_shortener"); if (/free|download now|crack|keygen|urgent|verify|wallet|airdrop|login|password|phishing|malware|scam/.test(hay)) flags.push("phishing_scam_or_download_bait_words"); if (/\.(exe|msi|dmg|pkg|scr|bat|cmd|ps1|sh)(\?|#|$)/i.test(url.pathname)) flags.push("executable_or_script_download"); if (/\.(zip|7z|rar|tar|gz)(\?|#|$)/i.test(url.pathname)) flags.push("archive_download"); return [...new Set(flags)]; }
function urlTrustFlags(urlValue, sourceType = "") { const flags = []; let url; try { url = new URL(String(urlValue || ""), "https://local.invalid/"); } catch { return flags; } if (/official|docs|security_advisory|github_repo/.test(String(sourceType))) flags.push("source_type_claims_higher_authority"); if (/github\.com|docs\.|developer\.|mozilla\.org|microsoft\.com|google\.com|npmjs\.com|nvd\.nist\.gov/.test(url.hostname)) flags.push("known_official_or_developer_domain_pattern"); if (url.protocol === "https:") flags.push("https_url"); return flags; }
function extractUrlsFromText(text) { return [...String(text || "").matchAll(/https?:\/\/[^\s)]+/g)].map((m) => m[0]); }
function isLocalHostname(hostname) { return ["127.0.0.1", "localhost", "::1"].includes(String(hostname).toLowerCase()); }
function redirectSuspicionReason(item, startHost) { const url = String(item.url || ""); const hay = `${url} ${item.location || ""}`.toLowerCase(); try { const host = new URL(url).hostname.replace(/^www\./, ""); if (host && startHost && host !== startHost) return "cross-domain redirect"; } catch {} if (/\.(exe|msi|dmg|pkg|scr|bat|cmd|ps1|zip|rar|7z)(\?|#|$)/i.test(hay)) return "download or executable redirect"; if (/login|verify|password|wallet|free|download/.test(hay)) return "suspicious redirect wording"; return ""; }
function fileTypeGuess(pathname) { if (/\.(exe|msi|dmg|pkg|scr)$/i.test(pathname)) return "executable_installer"; if (/\.(bat|cmd|ps1|sh)$/i.test(pathname)) return "script"; if (/\.(zip|7z|rar|tar|gz)$/i.test(pathname)) return "archive"; if (/\.(pdf)$/i.test(pathname)) return "document"; return "unknown"; }
function normalizeMatrixSource(source, index) { return { id: String(source.id || `source_${index + 1}`), title: redactSecrets(source.title || `Source ${index + 1}`), url: source.url ? redactUrlString(source.url) : null, source_type: String(source.source_type || "unknown"), source_quality_score: Number(source.source_quality_score ?? source.quality_score ?? 50), text_excerpt: redactSecrets(String(source.text_excerpt || source.snippet || source.text || "")), published_at: source.published_at || source.date || null }; }
function assessClaimAgainstSource(claim, source) { const claimTerms = significantTerms(claim); const text = source.text_excerpt.toLowerCase(); const hits = claimTerms.filter((term) => text.includes(term)); const support = hits.length >= Math.max(1, Math.ceil(claimTerms.length * 0.6)); const negates = /\b(no|not|never|without|blocked|unsupported|does not|cannot)\b/i.test(text) && hits.length >= 1; const dangerousCaptcha = /captcha.*bypass|bypass.*captcha/i.test(claim); return { source_id: source.id, title: source.title, source_quality_score: source.source_quality_score, support: support && !(negates && !dangerousCaptcha) ? "supports" : negates || (dangerousCaptcha && /no automatic captcha bypass|captcha bypass.*not|not.*captcha bypass/i.test(text)) ? "conflicts" : "not_found", matched_terms: hits.slice(0, 10), note: support ? "claim terms found in source excerpt" : "claim terms not sufficiently present" }; }
function formatSearchProviderManifest(result) { return `vnem_tools_search_provider_manifest: configured=${result.configured_providers.join(", ")} unconfigured=${result.unconfigured_providers.join(", ")}`; }
function formatSearchQueryBuilder(result) { return [`vnem_tools_search_query_builder: ${result.queries.length} queries`, ...result.queries.slice(0, 5).map((q) => `- ${q}`)].join("\n"); }
function formatWebSearch(result) { return `vnem_tools_web_search: ${result.provider_status} executed=${result.executed} results=${result.result_count}`; }
function formatSearchResultRanker(result) { return `vnem_tools_search_result_ranker: ranked=${result.ranked_results.length} best=${result.best_sources.length} risky=${result.risky_sources.length}`; }
function formatRedirectChain(result) { return `vnem_tools_redirect_chain_check: redirects=${result.redirect_chain.length} final=${result.final_url}`; }
function formatUrlReputation(result) { return `vnem_tools_url_reputation_check: ${result.risk_level} flags=${result.risk_flags.join(",")}`; }
function formatCaptchaDetector(result) { return `vnem_tools_captcha_detector: detected=${result.captcha_or_block_detected} type=${result.block_type}`; }
function formatDownloadSafety(result) { return `vnem_tools_download_safety_check: ${result.risk_level} type=${result.file_type_guess}`; }
function formatClaimSourceMatrix(result) { return `vnem_tools_claim_source_matrix: claims=${result.claims.length} supported=${result.supported_claims.length} unsupported=${result.unsupported_claims.length} conflicting=${result.conflicting_claims.length}`; }
function formatResearchGapDetector(result) { return `vnem_tools_research_gap_detector: blockers=${result.confidence_blockers.length} missing_current_search=${result.missing_current_search}`; }




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
    existing_tools_to_use: ["vnem_tools_start_dev_server", "vnem_tools_browser_capture", "vnem_tools_browser_page_inspect", "vnem_tools_browser_accessibility_audit", "vnem_tools_browser_compare_snapshots", "vnem_tools_ui_evidence_audit", "vnem_tools_collect_evidence"],
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
    return result;
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
  return result;
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
  const screenshots = arrayify(run.screenshots).filter((item) => item && (item.screenshot_path || item.captured || item.status === "captured"));
  const dom = arrayify(run.dom_or_page_inspection).map((item) => typeof item === "string" ? item : `${item.route || "route"} ${item.title || ""} ${(item.headings || []).join?.(" ") || ""} ${item.main_text_excerpt || ""}`.trim()).filter(Boolean);
  const routes = arrayify(run.routes_checked).filter((item) => item && !/not_checked/i.test(String(item.status || "")));
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

function parseSafeResearchUrl(input) {
  if (containsRawSecret(input)) throw new ToolsError("Raw secret-like values are blocked in URLs.", "raw_secret_blocked");
  let url;
  try { url = new URL(String(input)); } catch { throw new ToolsError("Invalid URL.", "invalid_url"); }
  if (url.username || url.password) throw new ToolsError("Credentialed URLs are blocked.", "credentialed_url_blocked");
  if (["data:", "javascript:"].includes(url.protocol)) throw new ToolsError("Unsafe URL scheme blocked.", "unsafe_url_scheme_blocked");
  if (isSearchEngineUrl(url)) throw new ToolsError("Search-engine scraping is blocked by default.", "search_engine_scraping_blocked", { host: url.hostname });
  if (url.protocol === "file:") return url;
  if (!["http:", "https:"].includes(url.protocol)) throw new ToolsError("Only http(s) and safe file URLs are allowed.", "unsafe_url_scheme_blocked");
  if (url.protocol === "http:" && !["127.0.0.1", "localhost", "::1"].includes(url.hostname)) throw new ToolsError("External plaintext HTTP is blocked; use HTTPS or localhost.", "insecure_external_http_blocked");
  return url;
}

function isSearchEngineUrl(url) {
  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  return ["google.com", "bing.com", "duckduckgo.com", "search.yahoo.com", "yandex.com", "baidu.com"].some((domain) => host === domain || host.endsWith(`.${domain}`)) && /(^|\/)search|q=/.test(`${url.pathname}${url.search}`);
}

async function safeSourceQualityCheck(args) {
  const text = String(args.text_excerpt || "");
  const sourceType = String(args.source_type || "unknown").toLowerCase();
  let score = 40;
  const qualityFlags = [];
  const riskFlags = [];
  if (args.url) { score += 10; qualityFlags.push("direct_url_provided"); }
  if (/official|docs|primary|spec|standard/.test(sourceType) || /official|docs|documentation|specification/i.test(args.title || "")) { score += 25; qualityFlags.push("likely_primary_or_official_source"); }
  if (args.published_at || args.retrieved_at) { score += 10; qualityFlags.push("date_metadata_present"); }
  if (text.length > 80) { score += 10; qualityFlags.push("substantive_excerpt_present"); }
  if (!args.url) riskFlags.push("no_url_provided");
  if (!args.published_at) riskFlags.push("published_date_unknown");
  if (text.length < 80) riskFlags.push("thin_excerpt");
  score = Math.max(0, Math.min(100, score));
  return {
    url: args.url || null,
    title: redactSecrets(args.title || ""),
    source_quality_score: score,
    quality_flags: qualityFlags,
    risk_flags: riskFlags,
    recency_notes: args.published_at || args.retrieved_at ? `published_at=${args.published_at || "unknown"}; retrieved_at=${args.retrieved_at || "unknown"}` : "No date metadata supplied; recency unknown.",
    primary_source_likelihood: qualityFlags.includes("likely_primary_or_official_source") ? "medium_high" : "unknown",
    citation_recommendation: score >= 70 ? "usable_with_citation_and_scope_limits" : "use_only_with_corroboration",
    must_not_claim: ["Verified factual correctness beyond the provided source text.", "No better or conflicting sources exist.", "Current web search was performed by this tool."]
  };
}

async function safeResearchBrief(args) {
  const sources = arrayify(args.sources).map((source) => ({ url: source.url || null, title: redactSecrets(source.title || "untitled"), text_excerpt: redactSecrets(source.text_excerpt || source.summary || ""), source_quality_score: source.source_quality_score || source.quality_score || null }));
  const supported = [];
  const unsupported = [];
  for (const claim of arrayify(args.claims_to_check)) {
    const claimText = String(claim);
    const terms = claimText.toLowerCase().split(/\W+/).filter((term) => term.length > 3);
    const hits = sources.filter((source) => terms.length ? terms.every((term) => source.text_excerpt.toLowerCase().includes(term)) : false);
    if (hits.length) supported.push({ claim: claimText, supporting_sources: hits.map((source) => source.title).slice(0, 3), support_level: "mentioned_by_provided_sources" });
    else unsupported.push({ claim: claimText, reason: "Not supported by provided source excerpts." });
  }
  const brief = {
    task: args.task,
    research_brief: sources.length ? `Reviewed ${sources.length} provided/direct source summary item(s) for: ${args.task}.` : `No sources supplied for: ${args.task}.`,
    supported_claims: supported,
    unsupported_claims: unsupported,
    conflicts: [],
    missing_sources: sources.length ? [] : ["At least one direct source or source summary is needed."],
    recommended_next_sources: ["Use current external search outside Tools MCP if the task requires broad discovery.", "Prefer official docs/specs/primary sources and corroborating independent sources."],
    must_not_claim: ["A broad web search happened.", "Search-engine results were scraped.", "Unsupported claims are verified.", "Provided source excerpts prove facts beyond their text."],
    evidence_log_id: null
  };
  const log = await writeEvidenceLog("research_brief", brief);
  brief.evidence_log_id = log.evidence_log_id;
  recordSession(args.session_id, "research_briefs", brief);
  return brief;
}

async function loadPageLikeSource(args, options = {}) {
  const keys = ["url", "file_path", "html", "text"].filter((key) => typeof args[key] === "string" && args[key].trim());
  if (keys.length !== 1) throw new ToolsError("Provide exactly one of url, file_path, html, or text.", "page_source_required");
  const maxBytes = Math.min(args.max_bytes || options.max_bytes || MAX_FETCH_TEXT_BYTES, MAX_FETCH_TEXT_BYTES);
  if (args.url) {
    const url = parseSafeResearchUrl(args.url);
    const dryRun = args.dry_run !== false;
    const planned = { source_type: "url", url_or_file: redactUrl(url), dry_run: true, executed: false, evidence_log_id: null, safe_to_claim: [], must_not_claim: browserUnderstandingMustNotClaim() };
    if (dryRun) return { ...planned, source_text: "", html: "", text: "" };
    enforceApproval(args);
    const fetched = await safeFetchUrlText({ ...args, dry_run: false, approved: true, approval_note: args.approval_note || "approved nested page source fetch", max_response_bytes: maxBytes });
    return { source_type: "url", url_or_file: fetched.url, dry_run: false, executed: true, html: fetched.text_excerpt || "", text: fetched.text_excerpt || "", fetched, evidence_log_id: fetched.evidence_log_id };
  }
  if (args.file_path) {
    const workspaceRoot = await resolveAllowedRoot(args.workspace_root || args.root || ".");
    const raw = String(args.file_path).trim();
    const target = await resolveAllowedFile(path.isAbsolute(raw) ? raw : path.join(workspaceRoot.absolutePath, raw), { mustExist: true, blockSecrets: true });
    const bytes = await readFile(target.absolutePath);
    if (bytes.includes(0) || looksBinary(bytes)) throw new ToolsError("Binary page-like files are blocked.", "binary_file_blocked", { path: target.relativePath });
    const content = redactSecrets(bytes.subarray(0, maxBytes).toString("utf8"));
    return { source_type: "file", url_or_file: target.relativePath, dry_run: false, executed: true, html: content, text: extractText(content), truncated: bytes.length > maxBytes };
  }
  if (args.html) {
    const html = redactSecrets(String(args.html).slice(0, maxBytes));
    return { source_type: "provided_html", url_or_file: "provided_html", dry_run: false, executed: true, html, text: extractText(html), truncated: String(args.html).length > maxBytes };
  }
  const text = redactSecrets(String(args.text).slice(0, maxBytes));
  return { source_type: "provided_text", url_or_file: "provided_text", dry_run: false, executed: true, html: text, text: extractText(text), truncated: String(args.text).length > maxBytes };
}

async function safeBrowserPageInspect(args) {
  const source = await loadPageLikeSource(args);
  if (source.dry_run) return { ...emptyPageInspection(), ...source };
  const html = source.html || source.text || "";
  const text = extractText(html);
  const headings = extractHeadings(html);
  const links = extractLinks(html);
  const images = extractTagAttrs(html, "img");
  const forms = extractTagBlocks(html, "form");
  const buttons = extractButtons(html);
  const scripts = (html.match(/<script\b/gi) || []).length;
  const sections = buildStructuredSections(html, headings, text);
  const result = {
    source_type: source.source_type,
    url_or_file: source.url_or_file,
    dry_run: false,
    executed: true,
    title: extractTitle(html),
    meta_description: extractMetaDescription(html),
    headings,
    main_text_excerpt: truncate(text, 2200),
    detected_language_hint: detectLanguageHint(html, text),
    links_count: links.length,
    images_count: images.length,
    forms_count: forms.length,
    buttons_count: buttons.length,
    scripts_count: scripts,
    structured_sections: sections,
    possible_page_purpose: inferPagePurpose({ title: extractTitle(html), headings, text, forms_count: forms.length }),
    risk_flags: pageRiskFlags(html, links),
    quality_flags: pageQualityFlags(html, text, headings),
    safe_to_claim: ["Page/source content was inspected with static Tools MCP parsing safeguards."],
    must_not_claim: browserUnderstandingMustNotClaim(),
    evidence_log_id: null
  };
  const log = await writeEvidenceLog("browser_page_inspect", result);
  result.evidence_log_id = log.evidence_log_id;
  recordSession(args.session_id, "browser_page_inspections", result);
  return result;
}

function emptyPageInspection() {
  return { title: "", meta_description: "", headings: [], main_text_excerpt: "", detected_language_hint: "unknown", links_count: 0, images_count: 0, forms_count: 0, buttons_count: 0, scripts_count: 0, structured_sections: [], possible_page_purpose: "unknown", risk_flags: [], quality_flags: [], safe_to_claim: [], must_not_claim: browserUnderstandingMustNotClaim() };
}

async function safeBrowserReadabilityExtract(args) {
  const source = await loadPageLikeSource(args);
  if (source.dry_run) return { title: "", readable_text_excerpt: "", headings: [], code_blocks_count: 0, lists_count: 0, tables_count: 0, content_quality_flags: ["dry_run_only_no_content_extracted"], truncated: false, evidence_log_id: null, ...source };
  const html = source.html || "";
  const main = extractMainLikeHtml(html);
  const readable = extractText(main || html);
  const codeBlockCount = (html.match(/<pre\b/gi) || []).length || (html.match(/<code\b/gi) || []).length;
  const result = { title: extractTitle(html), readable_text_excerpt: truncate(readable, 2600), headings: extractHeadings(main || html), code_blocks_count: codeBlockCount, lists_count: (html.match(/<[ou]l\b/gi) || []).length, tables_count: (html.match(/<table\b/gi) || []).length, content_quality_flags: ["heuristic_readability_extract_not_perfect", readable.length < 120 ? "thin_readable_text" : "substantive_readable_text"], truncated: Boolean(source.truncated || readable.length > 2600), evidence_log_id: null };
  const log = await writeEvidenceLog("browser_readability_extract", result);
  result.evidence_log_id = log.evidence_log_id;
  recordSession(args.session_id, "browser_readability_extracts", result);
  return result;
}

async function safeBrowserLinkMap(args) {
  const source = await loadPageLikeSource(args);
  if (source.dry_run) return { internal_links: [], external_links: [], same_domain_links: [], anchor_links: [], mailto_links: [], download_like_links: [], blocked_or_suspicious_links: [], domain_summary: {}, recommended_followup_urls: [], must_not_claim: linkMapMustNotClaim(), evidence_log_id: null, ...source };
  const baseUrl = safeOptionalUrl(args.base_url || (source.source_type === "url" ? source.url_or_file : "https://local.invalid/"));
  const all = extractLinks(source.html || "").slice(0, Math.min(args.max_links || 80, 200));
  const mapped = all.map((link) => classifyLink(link, baseUrl));
  const result = {
    internal_links: mapped.filter((l) => l.category === "internal"),
    external_links: mapped.filter((l) => l.category === "external"),
    same_domain_links: mapped.filter((l) => l.category === "same_domain"),
    anchor_links: mapped.filter((l) => l.category === "anchor"),
    mailto_links: mapped.filter((l) => l.category === "mailto"),
    download_like_links: mapped.filter((l) => l.download_like),
    blocked_or_suspicious_links: mapped.filter((l) => l.suspicious || l.blocked).map((l) => ({ href: l.href, text: l.text, reason: l.reason })),
    domain_summary: domainSummary(mapped),
    recommended_followup_urls: mapped.filter((l) => !l.suspicious && !l.blocked && ["same_domain", "external"].includes(l.category)).map((l) => l.absolute || l.href).slice(0, 10),
    must_not_claim: linkMapMustNotClaim(),
    evidence_log_id: null
  };
  const log = await writeEvidenceLog("browser_link_map", result);
  result.evidence_log_id = log.evidence_log_id;
  recordSession(args.session_id, "browser_link_maps", result);
  return result;
}

async function safeBrowserDomSearch(args) {
  const source = await loadPageLikeSource(args);
  if (source.dry_run) return { matches: [], match_count: 0, truncated: false, evidence_log_id: null, ...source };
  const query = String(args.query || "").toLowerCase();
  const max = Math.min(args.max_results || 50, 100);
  const candidates = domSearchCandidates(source.html || "", args.mode || "text");
  const matches = candidates.filter((item) => `${item.text} ${item.href || ""} ${item.selector || ""}`.toLowerCase().includes(query)).slice(0, max);
  const result = { mode: args.mode || "text", query: args.query, matches, match_count: matches.length, truncated: candidates.length > max && matches.length >= max, evidence_log_id: null };
  const log = await writeEvidenceLog("browser_dom_search", result);
  result.evidence_log_id = log.evidence_log_id;
  recordSession(args.session_id, "browser_dom_searches", result);
  return result;
}

async function safeBrowserAccessibilityAudit(args) {
  const source = await loadPageLikeSource(args);
  if (source.dry_run) return { score: null, issues: [], warnings: ["dry_run_only_no_static_accessibility_audit"], passes: [], must_not_claim: accessibilityMustNotClaim(), recommended_fixes: [], evidence_log_id: null, ...source };
  const html = source.html || "";
  const issues = [];
  const warnings = ["Static heuristic audit only; color contrast is not verified unless explicit color data exists."];
  const passes = [];
  const images = extractTagAttrs(html, "img");
  images.forEach((img, index) => { if (!attrValue(img.attrs, "alt")) issues.push({ type: "missing_image_alt", message: `Image ${index + 1} is missing alt text.` }); });
  if (images.some((img) => attrValue(img.attrs, "alt"))) passes.push("At least one image has alt text.");
  const buttons = extractButtons(html);
  buttons.forEach((button, index) => { if (!button.text.trim()) issues.push({ type: "button_text", message: `Button ${index + 1} has no accessible text.` }); });
  if (buttons.some((button) => button.text.trim())) passes.push("Buttons include visible text.");
  const inputs = extractTagAttrs(html, "input");
  const labels = extractLabels(html);
  inputs.forEach((input, index) => { const id = attrValue(input.attrs, "id"); const name = attrValue(input.attrs, "name"); if (!id || !labels.forIds.has(id)) issues.push({ type: "form_label", message: `Input ${name || index + 1} may be missing an associated label.` }); });
  if (labels.count > 0) passes.push("Form labels are present.");
  const headings = extractHeadings(html);
  if (!extractTitle(html)) issues.push({ type: "title_present", message: "Page title is missing." }); else passes.push("Page title is present.");
  if (!/<main\b|role=["']main["']/i.test(html)) warnings.push("No main landmark detected."); else passes.push("Main landmark is present.");
  headingOrderIssues(headings).forEach((message) => issues.push({ type: "heading_order", message }));
  extractLinks(html).forEach((link, index) => { if (!link.text || /^(click here|here|more|read more)$/i.test(link.text.trim())) issues.push({ type: "link_text_quality", message: `Link ${index + 1} has weak or missing link text.` }); });
  const score = Math.max(0, Math.min(100, 100 - issues.length * 12 - warnings.length * 3));
  const result = { score, issues, warnings, passes, must_not_claim: accessibilityMustNotClaim(), recommended_fixes: recommendedA11yFixes(issues), evidence_log_id: null };
  const log = await writeEvidenceLog("browser_accessibility_audit", result);
  result.evidence_log_id = log.evidence_log_id;
  recordSession(args.session_id, "browser_accessibility_audits", result);
  return result;
}

async function safeBrowserCompareSnapshots(args) {
  const before = await loadPageLikeSource({ ...(args.before || {}), max_bytes: args.max_bytes, dry_run: false, approved: true, approval_note: "compare local/provided snapshot" });
  const after = await loadPageLikeSource({ ...(args.after || {}), max_bytes: args.max_bytes, dry_run: false, approved: true, approval_note: "compare local/provided snapshot" });
  const beforeLinks = extractLinks(before.html || "");
  const afterLinks = extractLinks(after.html || "");
  const beforeHeadings = extractHeadings(before.html || "").map((h) => h.text);
  const afterHeadings = extractHeadings(after.html || "").map((h) => h.text);
  const beforeText = extractText(before.html || "");
  const afterText = extractText(after.html || "");
  const result = {
    changed_title: extractTitle(before.html) !== extractTitle(after.html),
    changed_headings: { added: arrayDiff(afterHeadings, beforeHeadings), removed: arrayDiff(beforeHeadings, afterHeadings) },
    changed_text_summary: summarizeTextChange(beforeText, afterText),
    added_links: linkDiff(afterLinks, beforeLinks),
    removed_links: linkDiff(beforeLinks, afterLinks),
    added_forms_or_buttons: countFormsButtons(after.html) - countFormsButtons(before.html) > 0,
    removed_forms_or_buttons: countFormsButtons(before.html) - countFormsButtons(after.html) > 0,
    risk_flags: [...pageRiskFlags(before.html, beforeLinks), ...pageRiskFlags(after.html, afterLinks)].filter((v, i, a) => a.indexOf(v) === i),
    summary: "Static snapshot comparison completed; changed content was summarized without screenshots or full visual understanding claims.",
    evidence_log_id: null
  };
  const log = await writeEvidenceLog("browser_compare_snapshots", result);
  result.evidence_log_id = log.evidence_log_id;
  recordSession(args.session_id, "browser_snapshot_compares", result);
  return result;
}

async function safeBrowserResearchPack(args) {
  const sources = arrayify(args.sources).slice(0, Math.min(args.max_sources || 8, 20)).map(normalizeResearchPackSource);
  const claims = arrayify(args.claims_to_check).map(String);
  const supported = [];
  const unsupported = [];
  const conflicting = [];
  for (const claim of claims) {
    const terms = significantTerms(claim);
    const hits = sources.filter((source) => terms.length && terms.every((term) => source.text_excerpt.toLowerCase().includes(term)));
    const weakHits = sources.filter((source) => terms.length && terms.some((term) => source.text_excerpt.toLowerCase().includes(term)) && !hits.includes(source));
    const relevant = [...hits, ...weakHits];
    const hasNegated = relevant.some((source) => /\b(not|no longer|never)\s+(supported|deprecated|stable|required|requires)\b/i.test(source.text_excerpt));
    const hasPositive = relevant.some((source) => /\b(supported|deprecated|stable|required|requires)\b/i.test(source.text_excerpt) && !/\b(not|no longer|never)\s+(supported|deprecated|stable|required|requires)\b/i.test(source.text_excerpt));
    if (hits.length) supported.push({ claim, support_level: "supported_by_provided_sources", supporting_sources: hits.map((s) => s.title).slice(0, 4) });
    else unsupported.push({ claim, reason: "Not supported by provided source text/summaries." });
    if ((weakHits.length && hits.length && /\b(not|deprecated|unsupported|false|removed)\b/i.test(weakHits.map((s) => s.text_excerpt).join(" "))) || (hasNegated && hasPositive)) conflicting.push({ claim, conflict_summary: "Provided sources appear to contain partial or opposing wording; review manually.", sources: relevant.map((s) => s.title).slice(0, 4) });
  }
  const best = sources.filter((s) => s.source_quality_score >= 70 && s.has_read_content).slice(0, 5);
  const weak = sources.filter((s) => s.source_quality_score < 50 || !s.has_read_content).slice(0, 5);
  const missing = [];
  if (!sources.length) missing.push("No sources supplied.");
  for (const source of sources) if (!source.has_read_content) missing.push(`Source ${source.title} is metadata-only; do not claim it was read.`);
  for (const item of unsupported) missing.push(`Claim not supported by provided sources: ${item.claim}`);
  const pack = {
    task: args.task,
    source_summaries: sources.map((source) => ({ title: source.title, url: source.url, source_quality_score: source.source_quality_score, has_read_content: source.has_read_content, summary: truncate(source.text_excerpt, 300) })),
    source_quality_summary: { source_count: sources.length, best_count: best.length, weak_count: weak.length, average_score: sources.length ? Math.round(sources.reduce((sum, source) => sum + source.source_quality_score, 0) / sources.length) : null },
    supported_claims: supported,
    unsupported_claims: unsupported,
    conflicting_claims: conflicting,
    missing_evidence: missing.slice(0, 12),
    best_sources: best.map(pickResearchSourceForOutput),
    weak_sources: weak.map(pickResearchSourceForOutput),
    recommended_next_sources: ["Use external current search outside Tools MCP when broad/latest discovery is required.", "Prefer official docs/specs/primary sources and corroborating independent sources.", "Fetch direct approved URLs before claiming source text was read."],
    citation_plan: best.map((source, index) => ({ citation_id: `S${index + 1}`, title: source.title, url: source.url, use_for: "claims directly supported by the excerpt/inspection evidence" })),
    must_not_claim: ["A broad web search happened.", "Search-engine results were scraped.", "A source was read when only metadata was supplied.", "Unsupported or conflicting claims are verified.", "Current/latest coverage is complete without external current search evidence."],
    safe_to_claim: ["This pack evaluated only provided/direct/local source summaries supplied to Tools MCP.", "Supported claims are limited to the provided source text/summaries."],
    evidence_log_id: null
  };
  const log = await writeEvidenceLog("browser_research_pack", pack);
  pack.evidence_log_id = log.evidence_log_id;
  recordSession(args.session_id, "browser_research_packs", pack);
  return pack;
}

function browserUnderstandingMustNotClaim() {
  return ["Full visual/browser verification was performed.", "A web search happened.", "Links were followed or pages were crawled.", "JavaScript runtime behavior was fully evaluated.", "Login/session/cookie/CAPTCHA automation was used."];
}

function linkMapMustNotClaim() {
  return ["Links were followed.", "A crawl was performed.", "External pages were fetched or verified.", "Credentialed/private pages were accessed."];
}

function accessibilityMustNotClaim() {
  return ["Full accessibility certification was completed.", "Color contrast was verified without explicit color data.", "Keyboard/screen-reader behavior was fully tested.", "Browser/assistive-technology runtime testing happened."];
}

function extractMetaDescription(html) {
  const match = String(html || "").match(/<meta\s+[^>]*(?:name=["']description["'][^>]*content=["']([^"']*)["']|content=["']([^"']*)["'][^>]*name=["']description["'])[^>]*>/i);
  return truncate(redactSecrets(extractText(match?.[1] || match?.[2] || "")), 300);
}

function extractHeadings(html) {
  const out = [];
  for (const match of String(html || "").matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)) out.push({ level: Number(match[1]), text: truncate(redactSecrets(extractText(match[2])), 240) });
  return out.slice(0, 50);
}

function extractLinks(html) {
  const out = [];
  for (const match of String(html || "").matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = attrValue(match[1], "href") || "";
    out.push({ href: redactCredentialHref(href), text: truncate(redactSecrets(extractText(match[2])), 160) });
  }
  return out.slice(0, 300);
}

function extractTagAttrs(html, tag) {
  const out = [];
  const re = new RegExp(`<${tag}\\b([^>]*)>`, "gi");
  for (const match of String(html || "").matchAll(re)) out.push({ attrs: match[1] || "" });
  return out.slice(0, 200);
}

function extractTagBlocks(html, tag) {
  const out = [];
  const re = new RegExp(`<${tag}\\b([^>]*)>([\\s\\S]*?)<\\/${tag}>`, "gi");
  for (const match of String(html || "").matchAll(re)) out.push({ attrs: match[1] || "", inner_html: match[2] || "", text: truncate(extractText(match[2]), 300) });
  return out.slice(0, 100);
}

function extractButtons(html) {
  const buttons = extractTagBlocks(html, "button").map((button) => ({ text: button.text, attrs: button.attrs }));
  for (const input of extractTagAttrs(html, "input")) if (/type=["']?(button|submit|reset)/i.test(input.attrs)) buttons.push({ text: attrValue(input.attrs, "value") || attrValue(input.attrs, "aria-label") || "", attrs: input.attrs });
  return buttons.slice(0, 100);
}

function attrValue(attrs, name) {
  const re = new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
  const match = String(attrs || "").match(re);
  return match ? redactSecrets(match[1] || match[2] || match[3] || "") : "";
}

function redactCredentialHref(value) {
  return redactSecrets(String(value || "")).replace(/(https?:\/\/)[^\s/@:]+:[^\s/@]+@/i, "$1[REDACTED]@");
}

function redactUrlString(value) {
  try { return redactUrl(new URL(value, "https://local.invalid/")); } catch { return redactSecrets(String(value || "")); }
}

function extractMainLikeHtml(html) {
  return String(html || "").match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1]
    || String(html || "").match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1]
    || String(html || "").match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1]
    || String(html || "");
}

function buildStructuredSections(html, headings, text) {
  if (headings.length) return headings.slice(0, 12).map((heading) => ({ heading: heading.text, level: heading.level }));
  return text ? [{ heading: "content", level: 0, excerpt: truncate(text, 500) }] : [];
}

function detectLanguageHint(html, text) {
  const lang = String(html || "").match(/<html\b[^>]*lang=["']?([a-z-]+)/i)?.[1];
  if (lang) return lang.toLowerCase();
  return /\b(the|and|is|are|with)\b/i.test(text || "") ? "en" : "unknown";
}

function inferPagePurpose({ title, headings, text, forms_count }) {
  const hay = `${title} ${headings.map((h) => h.text).join(" ")} ${text}`.toLowerCase();
  if (/docs|documentation|guide|api|reference/.test(hay)) return "documentation_or_reference";
  if (/pricing|buy|checkout|cart/.test(hay)) return "commerce";
  if (forms_count && /subscribe|contact|email|sign/.test(hay)) return "lead_capture_or_form_page";
  if (/blog|article|news/.test(hay)) return "article_or_blog";
  return "general_web_page";
}

function pageRiskFlags(html, links = extractLinks(html)) {
  const flags = [];
  if ((String(html || "").match(/<script\b/gi) || []).length) flags.push("scripts_present_static_only_not_executed");
  for (const link of links) if (/^javascript:|^data:/i.test(link.href)) flags.push("unsafe_link_scheme_present");
  for (const link of links) if (/:\/\/[^/\s]+:[^@/\s]+@/.test(link.href)) flags.push("credentialed_link_present");
  if (/password|token|api[_-]?key/i.test(String(html || ""))) flags.push("secret_like_terms_redacted_or_flagged");
  return [...new Set(flags)];
}

function pageQualityFlags(html, text, headings) {
  const flags = [];
  if (extractTitle(html)) flags.push("title_present"); else flags.push("title_missing");
  if (extractMetaDescription(html)) flags.push("meta_description_present");
  if (headings.length) flags.push("headings_present");
  if (text.length > 200) flags.push("substantive_text_present"); else flags.push("thin_text");
  return flags;
}

function safeOptionalUrl(value) {
  try { return new URL(String(value || "https://local.invalid/")); } catch { return new URL("https://local.invalid/"); }
}

function classifyLink(link, baseUrl) {
  const href = link.href || "";
  const item = { ...link, category: "internal", absolute: null, download_like: /\.(zip|tar|gz|pdf|exe|dmg|msi|7z)(\?|#|$)/i.test(href), suspicious: false, blocked: false, reason: "" };
  if (!href) { item.suspicious = true; item.reason = "empty_href"; return item; }
  if (href.startsWith("#")) { item.category = "anchor"; return item; }
  if (/^mailto:/i.test(href)) { item.category = "mailto"; return item; }
  if (/^javascript:|^data:/i.test(href)) { item.suspicious = true; item.blocked = true; item.reason = "unsafe_scheme"; return item; }
  if (/:\/\/(?:\[REDACTED\]|[^/\s]+:[^@/\s]+)@/.test(href)) { item.suspicious = true; item.blocked = true; item.reason = "credentialed_url"; return item; }
  try {
    const absolute = new URL(href, baseUrl);
    item.absolute = redactUrl(absolute);
    item.category = absolute.hostname.replace(/^www\./, "") === baseUrl.hostname.replace(/^www\./, "") ? "same_domain" : "external";
    if (href.startsWith("/")) item.category = "internal";
  } catch { item.suspicious = true; item.reason = "invalid_url"; }
  return item;
}

function domainSummary(mapped) {
  const counts = {};
  for (const link of mapped) {
    try { const host = new URL(link.absolute || link.href, "https://local.invalid/").hostname; counts[host] = (counts[host] || 0) + 1; } catch {}
  }
  return counts;
}

function domSearchCandidates(html, mode) {
  if (mode === "heading") return extractHeadings(html).map((h) => ({ type: "heading", text: h.text, level: h.level }));
  if (mode === "link") return extractLinks(html).map((l) => ({ type: "link", text: l.text, href: l.href }));
  if (mode === "image") return extractTagAttrs(html, "img").map((img) => ({ type: "image", text: `${attrValue(img.attrs, "alt")} ${attrValue(img.attrs, "src")}`.trim() }));
  if (mode === "form") return extractTagBlocks(html, "form").map((form) => ({ type: "form", text: `${form.text} ${form.attrs} ${form.inner_html}`.trim() }));
  if (mode === "button") return extractButtons(html).map((button) => ({ type: "button", text: button.text, selector: button.attrs }));
  if (mode === "selector_like") return [...String(html || "").matchAll(/<([a-z0-9-]+)\b([^>]*)>/gi)].map((m) => ({ type: "element", text: m[0].slice(0, 240), selector: `${m[1]}${attrValue(m[2], "id") ? `#${attrValue(m[2], "id")}` : ""}` }));
  return extractText(html).split(/(?<=[.!?])\s+/).filter(Boolean).slice(0, 200).map((text) => ({ type: "text", text: truncate(text, 300) }));
}

function extractLabels(html) {
  const forIds = new Set();
  let count = 0;
  for (const label of extractTagBlocks(html, "label")) { count++; const id = attrValue(label.attrs, "for"); if (id) forIds.add(id); }
  return { count, forIds };
}

function headingOrderIssues(headings) {
  const issues = [];
  let last = 0;
  for (const heading of headings) {
    if (last && heading.level > last + 1) issues.push(`Heading jumps from h${last} to h${heading.level}.`);
    last = heading.level;
  }
  return issues;
}

function recommendedA11yFixes(issues) {
  const fixes = [];
  if (issues.some((i) => i.type === "missing_image_alt")) fixes.push("Add meaningful alt text or empty alt for decorative images.");
  if (issues.some((i) => i.type === "form_label")) fixes.push("Associate each input with a visible label or aria-label/aria-labelledby.");
  if (issues.some((i) => i.type === "button_text")) fixes.push("Give buttons visible or aria-label text.");
  if (issues.some((i) => i.type === "heading_order")) fixes.push("Use heading levels in order without skipping levels.");
  if (issues.some((i) => i.type === "link_text_quality")) fixes.push("Use descriptive link text rather than generic 'click here' labels.");
  return fixes;
}

function arrayDiff(left, right) {
  return left.filter((item) => !right.includes(item));
}

function linkDiff(left, right) {
  const keys = new Set(right.map((link) => `${link.href}|${link.text}`));
  return left.filter((link) => !keys.has(`${link.href}|${link.text}`));
}

function summarizeTextChange(before, after) {
  if (before === after) return "No text change detected by static extraction.";
  return `Text changed: before ${before.length} chars, after ${after.length} chars.`;
}

function countFormsButtons(html) {
  return (String(html || "").match(/<form\b|<button\b/gi) || []).length;
}

function significantTerms(text) {
  return String(text || "").toLowerCase().split(/\W+/).filter((term) => term.length > 3 && !["feature", "requires", "about", "with", "this", "that"].includes(term));
}

function normalizeResearchPackSource(source) {
  const text = redactSecrets(source.text_excerpt || source.summary || source.main_text_excerpt || source.readable_text_excerpt || "");
  const score = Number(source.source_quality_score || source.quality_score || (source.source_type === "official_docs" ? 75 : text ? 55 : 25));
  return { url: source.url || source.url_or_file || null, title: redactSecrets(source.title || source.name || "untitled source"), source_type: source.source_type || "provided_source", text_excerpt: text, source_quality_score: Math.max(0, Math.min(100, score)), has_read_content: Boolean(text.trim() || source.fetched || source.inspected) };
}

function pickResearchSourceForOutput(source) {
  return { title: source.title, url: source.url, source_quality_score: source.source_quality_score, has_read_content: source.has_read_content };
}

function formatBrowserPageInspect(result) { return `vnem_tools_browser_page_inspect: ${result.title || result.source_type}\nsource: ${result.url_or_file}\nevidence: ${result.evidence_log_id || "not written"}`; }
function formatBrowserReadability(result) { return `vnem_tools_browser_readability_extract: ${result.title || "untitled"}\nchars: ${result.readable_text_excerpt?.length || 0}\nevidence: ${result.evidence_log_id || "not written"}`; }
function formatBrowserLinkMap(result) { return `vnem_tools_browser_link_map: ${(result.internal_links?.length || 0) + (result.external_links?.length || 0)} mapped link(s)\nevidence: ${result.evidence_log_id || "not written"}`; }
function formatBrowserDomSearch(result) { return `vnem_tools_browser_dom_search: ${result.match_count} match(es) for ${JSON.stringify(result.query)}\nevidence: ${result.evidence_log_id || "not written"}`; }
function formatBrowserAccessibilityAudit(result) { return `vnem_tools_browser_accessibility_audit: score ${result.score ?? "dry-run"}; issues ${result.issues?.length || 0}\nevidence: ${result.evidence_log_id || "not written"}`; }
function formatBrowserCompare(result) { return `vnem_tools_browser_compare_snapshots: ${result.summary}\nevidence: ${result.evidence_log_id || "not written"}`; }
function formatBrowserResearchPack(result) { return `vnem_tools_browser_research_pack: ${result.source_summaries.length} source(s); supported ${result.supported_claims.length}; unsupported ${result.unsupported_claims.length}\nevidence: ${result.evidence_log_id || "not written"}`; }

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
  return withLog;
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
  return withLog;
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
  if (dryRun) return { ...planned, action_policy_preview: actionPolicyPreview({ action_type: scriptName === "build" ? "run_build" : "run_test", proposed_action: planned.command }) };
  enforceActionPolicy(scriptName === "build" ? "run_build" : "run_test", args);
  const execution = await runProcess("npm", ["run", scriptName], { cwd: root.absolutePath, timeoutMs, maxOutputBytes });
  const result = { ...planned, dry_run: false, executed: true, ...execution };
  const log = await writeEvidenceLog("project_task", result);
  const withLog = { ...result, evidence_log_id: log.evidence_log_id };
  recordSession(args.session_id, "commands_run", withLog);
  return withLog;
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
  if (dryRun) return { ...planned, action_policy_preview: actionPolicyPreview({ action_type: "start_dev_server", proposed_action: planned.command }) };
  enforceActionPolicy("start_dev_server", args);
  const child = spawn(spawnCommandName("npm"), ["run", script, "--", "--host", host, "--port", String(port)], { cwd: root.absolutePath, shell: shouldUseShellForCommand("npm"), windowsHide: true });
  const serverId = logId("dev-server");
  const record = { ...planned, dry_run: false, started: true, server_id: serverId, pid: child.pid, stdout: "", stderr: "", started_at: new Date().toISOString() };
  const collect = (field, chunk) => { record[field] = truncate(redactSecrets(record[field] + chunk.toString()), args.max_output_bytes || 8000); };
  child.stdout.on("data", (chunk) => collect("stdout", chunk));
  child.stderr.on("data", (chunk) => collect("stderr", chunk));
  child.on("exit", (code, signal) => { record.exit_code = code; record.signal = signal; record.running = false; });
  record.running = true;
  devServers.set(serverId, { child, record });
  await new Promise((resolve) => setTimeout(resolve, Math.min(args.wait_ms || 1000, 5000)));
  const log = await writeEvidenceLog("dev_server_start", record, serverId);
  const withLog = { ...record, evidence_log_id: log.evidence_log_id };
  recordSession(args.session_id, "dev_servers_started", withLog);
  return withLog;
}

async function safeStopDevServer(args) {
  const entry = devServers.get(args.server_id);
  if (!entry) throw new ToolsError("Dev server id was not started by this Tools MCP process.", "dev_server_not_found", { server_id: args.server_id });
  enforceApproval(args);
  if (process.platform === "win32") await runProcess("taskkill", ["/PID", String(entry.record.pid), "/T", "/F"], { cwd: allowedRoots[0], timeoutMs: 5000, maxOutputBytes: 4000 });
  else entry.child.kill("SIGTERM");
  await new Promise((resolve) => setTimeout(resolve, 250));
  if (process.platform !== "win32" && !entry.child.killed) entry.child.kill("SIGKILL");
  devServers.delete(args.server_id);
  const result = { server_id: args.server_id, stopped: true, pid: entry.record.pid, url: entry.record.url };
  const log = await writeEvidenceLog("dev_server_stop", result);
  const withLog = { ...result, evidence_log_id: log.evidence_log_id };
  recordSession(args.session_id, "dev_servers_stopped", withLog);
  return withLog;
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
  if (dryRun) return { ...planned, action_policy_preview: actionPolicyPreview({ action_type: "local_commit", proposed_action: args.message }) };
  enforceActionPolicy("local_commit", args);
  await runProcess("git", ["add", "--", ...files], { cwd: root.absolutePath, timeoutMs: 10000, maxOutputBytes: 12000 });
  const commitExec = await runProcess("git", ["commit", "-m", args.message], { cwd: root.absolutePath, timeoutMs: 20000, maxOutputBytes: 20000 });
  if (!commitExec.ok) throw new ToolsError("git commit failed.", "git_commit_failed", { stderr: commitExec.stderr, stdout: commitExec.stdout });
  const shaExec = await runProcess("git", ["rev-parse", "HEAD"], { cwd: root.absolutePath, timeoutMs: 10000, maxOutputBytes: 2000 });
  const result = { ...planned, dry_run: false, committed: true, commit_sha: shaExec.stdout.trim(), stdout: commitExec.stdout, stderr: commitExec.stderr };
  const log = await writeEvidenceLog("git_commit", result);
  const withLog = { ...result, evidence_log_id: log.evidence_log_id };
  recordSession(args.session_id, "git_commits", withLog);
  return withLog;
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
  if (dryRun) return { ...planned, action_policy_preview: actionPolicyPreview({ action_type: "api_call", proposed_action: `${method} ${planned.url}` }) };
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
  mcpServer.registerTool("vnem_tools_cloudflare_status", { title: "Cloudflare Status", description: "Detect Wrangler/API token/account/profile Cloudflare readiness without printing secrets.", inputSchema: {}, annotations: READ_ONLY_LOCAL }, async () => withToolErrors(async () => { const result = await cloudflareStatus(); return toolResult(formatCloudflare("cloudflare_status", result), { cloudflare_status: result }); }));
  mcpServer.registerTool("vnem_tools_cloudflare_auth_plan", { title: "Cloudflare Auth Plan", description: "Plan safe Wrangler/API-token authentication without cookies, sessions, scraping, or token leaks.", inputSchema: { access_goal: z.string().default("least_privilege") }, annotations: READ_ONLY_LOCAL }, async (args) => withToolErrors(async () => { const result = cloudflareAuthPlan(args); return toolResult(formatCloudflare("cloudflare_auth_plan", result), { cloudflare_auth_plan: result }); }));
  mcpServer.registerTool("vnem_tools_cloudflare_accounts_list", { title: "Cloudflare Accounts List", description: "List accessible Cloudflare accounts read-only using API when authenticated.", inputSchema: { simulate: z.boolean().default(false) }, annotations: NETWORK_ACTION }, async (args) => withToolErrors(async () => { const result = await cloudflareAccountsList(args); return toolResult(formatCloudflare("cloudflare_accounts_list", result), { cloudflare_accounts_list: result }); }));
  mcpServer.registerTool("vnem_tools_cloudflare_projects_list", { title: "Cloudflare Projects List", description: "List Cloudflare Pages projects and Workers scripts read-only.", inputSchema: { account_id: z.string().optional(), simulate: z.boolean().default(false) }, annotations: NETWORK_ACTION }, async (args) => withToolErrors(async () => { const result = await cloudflareProjectsList(args); return toolResult(formatCloudflare("cloudflare_projects_list", result), { cloudflare_projects_list: result }); }));
  mcpServer.registerTool("vnem_tools_cloudflare_pages_deploy_plan", { title: "Cloudflare Pages Deploy Plan", description: "Plan Cloudflare Pages deploy without executing.", inputSchema: { project_dir: z.string().default("."), project_name: z.string().min(1), branch: z.string().default(""), build_command: z.string().default(""), output_dir: z.string().default("dist"), environment: z.string().default("preview"), protected_resources: z.array(z.string()).default([]) }, annotations: READ_ONLY_LOCAL }, async (args) => withToolErrors(async () => { const result = await cloudflarePagesDeployPlan(args); return toolResult(formatCloudflare("pages_deploy_plan", result), { pages_deploy_plan: result }); }));
  mcpServer.registerTool("vnem_tools_cloudflare_pages_deploy", { title: "Cloudflare Pages Deploy", description: "Execute approved Cloudflare Pages deploy via Wrangler/API and write evidence pack.", inputSchema: { project_dir: z.string().default("."), project_name: z.string().min(1), branch: z.string().default(""), build_command: z.string().default(""), output_dir: z.string().default("dist"), environment: z.string().default("preview"), ...commonMutation }, annotations: NETWORK_ACTION }, async (args) => withToolErrors(async () => { const result = await cloudflarePagesDeploy(args); return toolResult(formatCloudflare("pages_deploy", result), { pages_deploy: result }); }));
  mcpServer.registerTool("vnem_tools_cloudflare_workers_deploy_plan", { title: "Cloudflare Workers Deploy Plan", description: "Plan Cloudflare Worker deploy and inspect Wrangler config when present.", inputSchema: { project_dir: z.string().default("."), script_name: z.string().default(""), entrypoint: z.string().default(""), environment: z.string().default("preview"), build_command: z.string().default(""), protected_resources: z.array(z.string()).default([]) }, annotations: READ_ONLY_LOCAL }, async (args) => withToolErrors(async () => { const result = await cloudflareWorkersDeployPlan(args); return toolResult(formatCloudflare("workers_deploy_plan", result), { workers_deploy_plan: result }); }));
  mcpServer.registerTool("vnem_tools_cloudflare_workers_deploy", { title: "Cloudflare Workers Deploy", description: "Execute approved Cloudflare Worker deploy via Wrangler and write evidence pack.", inputSchema: { project_dir: z.string().default("."), script_name: z.string().default(""), entrypoint: z.string().default(""), environment: z.string().default("preview"), build_command: z.string().default(""), ...commonMutation }, annotations: NETWORK_ACTION }, async (args) => withToolErrors(async () => { const result = await cloudflareWorkersDeploy(args); return toolResult(formatCloudflare("workers_deploy", result), { workers_deploy: result }); }));
  mcpServer.registerTool("vnem_tools_cloudflare_dns_plan", { title: "Cloudflare DNS Plan", description: "Plan DNS create/update/delete and flag protected resources.", inputSchema: { zone_name: z.string().min(1), record_name: z.string().min(1), record_type: z.string().min(1), record_value: z.string().default(""), proxied: z.boolean().optional(), ttl: z.number().int().optional(), operation: z.string().default("create"), protected_resources: z.array(z.string()).default([]), simulate: z.boolean().default(false) }, annotations: READ_ONLY_LOCAL }, async (args) => withToolErrors(async () => { const result = await cloudflareDnsPlan(args); return toolResult(formatCloudflare("dns_plan", result), { dns_plan: result }); }));
  mcpServer.registerTool("vnem_tools_cloudflare_dns_apply", { title: "Cloudflare DNS Apply", description: "Apply approved DNS create/update/delete with before/after evidence and protected-resource gates.", inputSchema: { zone_name: z.string().min(1), record_name: z.string().min(1), record_type: z.string().min(1), record_value: z.string().default(""), proxied: z.boolean().optional(), ttl: z.number().int().optional(), operation: z.string().default("create"), ...commonMutation }, annotations: NETWORK_ACTION }, async (args) => withToolErrors(async () => { const result = await cloudflareDnsApply(args); return toolResult(formatCloudflare("dns_apply", result), { dns_apply: result }); }));
  mcpServer.registerTool("vnem_tools_cloudflare_env_plan", { title: "Cloudflare Env/Secrets Plan", description: "Plan Cloudflare Pages/Workers env var and secret changes with values redacted.", inputSchema: { target_type: z.enum(["pages", "workers"]).default("workers"), target_name: z.string().min(1), environment: z.string().default("production"), variables: z.array(z.record(z.any())).default([]), protected_resources: z.array(z.string()).default([]) }, annotations: READ_ONLY_LOCAL }, async (args) => withToolErrors(async () => { const result = cloudflareEnvPlan(args); return toolResult(formatCloudflare("env_plan", result), { env_plan: result }); }));
  mcpServer.registerTool("vnem_tools_cloudflare_env_apply", { title: "Cloudflare Env/Secrets Apply", description: "Apply approved env/secret changes without printing values and with evidence pack.", inputSchema: { target_type: z.enum(["pages", "workers"]).default("workers"), target_name: z.string().min(1), environment: z.string().default("production"), variables: z.array(z.record(z.any())).default([]), ...commonMutation }, annotations: NETWORK_ACTION }, async (args) => withToolErrors(async () => { const result = await cloudflareEnvApply(args); return toolResult(formatCloudflare("env_apply", result), { env_apply: result }); }));
  mcpServer.registerTool("vnem_tools_cloudflare_deploy_verify", { title: "Cloudflare Deploy Verify", description: "Verify deployment URL reachability and optional marker/title evidence.", inputSchema: { deployment_url: z.string().default(""), expected_status: z.number().int().default(200), expected_body_marker: z.string().default(""), expected_title: z.string().default(""), simulate: z.boolean().default(false), account_id: z.string().optional(), project_name: z.string().optional(), script_name: z.string().optional() }, annotations: NETWORK_ACTION }, async (args) => withToolErrors(async () => { const result = await cloudflareDeployVerify(args); return toolResult(formatCloudflare("deploy_verify", result), { deploy_verify: result }); }));
  mcpServer.registerTool("vnem_tools_cloudflare_rollback_plan", { title: "Cloudflare Rollback Plan", description: "Plan Cloudflare Pages/Workers rollback and identify previous deployment/version when possible.", inputSchema: { target_type: z.enum(["pages", "workers"]).default("pages"), project_name: z.string().default(""), script_name: z.string().default(""), deployment_id: z.string().default(""), version_id: z.string().default(""), simulate: z.boolean().default(false), protected_resources: z.array(z.string()).default([]) }, annotations: READ_ONLY_LOCAL }, async (args) => withToolErrors(async () => { const result = await cloudflareRollbackPlan(args); return toolResult(formatCloudflare("rollback_plan", result), { rollback_plan: result }); }));
  mcpServer.registerTool("vnem_tools_cloudflare_rollback", { title: "Cloudflare Rollback", description: "Execute approved high-impact Cloudflare rollback with evidence pack.", inputSchema: { target_type: z.enum(["pages", "workers"]).default("pages"), project_name: z.string().default(""), script_name: z.string().default(""), deployment_id: z.string().default(""), version_id: z.string().default(""), ...commonMutation }, annotations: NETWORK_ACTION }, async (args) => withToolErrors(async () => { const result = await cloudflareRollback(args); return toolResult(formatCloudflare("rollback", result), { rollback: result }); }));
  mcpServer.registerTool("vnem_tools_cloudflare_cache_purge_plan", { title: "Cloudflare Cache Purge Plan", description: "Plan Cloudflare cache purge.", inputSchema: { zone_name: z.string().min(1), files: z.array(z.string()).default([]), purge_everything: z.boolean().default(false), protected_resources: z.array(z.string()).default([]) }, annotations: READ_ONLY_LOCAL }, async (args) => withToolErrors(async () => { const result = await cloudflareCachePurgePlan(args); return toolResult(formatCloudflare("cache_purge_plan", result), { cache_purge_plan: result }); }));
  mcpServer.registerTool("vnem_tools_cloudflare_cache_purge", { title: "Cloudflare Cache Purge", description: "Execute approved Cloudflare cache purge with evidence pack.", inputSchema: { zone_name: z.string().min(1), files: z.array(z.string()).default([]), purge_everything: z.boolean().default(false), ...commonMutation }, annotations: NETWORK_ACTION }, async (args) => withToolErrors(async () => { const result = await cloudflareCachePurge(args); return toolResult(formatCloudflare("cache_purge", result), { cache_purge: result }); }));
  mcpServer.registerTool("vnem_tools_evidence_pack_audit", { title: "Tools Evidence Pack Audit", description: "Audit mutation evidence pack completeness and fake-success prevention.", inputSchema: { evidence_pack_path: z.string().min(1) }, annotations: READ_ONLY_LOCAL }, async (args) => withToolErrors(async () => { const result = await evidencePackAudit(args); return toolResult(formatCloudflare("evidence_pack_audit", result), { evidence_pack_audit: result }); }));
  mcpServer.registerTool("vnem_tools_mutation_approval_contract", { title: "Tools Mutation Approval Contract", description: "Check exact approval phrase for mutation/destructive operations.", inputSchema: { operation: z.string().min(1), destructive: z.boolean().default(false), approval_phrase: z.string().default(""), protected_resource_risk: z.array(z.string()).default([]) }, annotations: READ_ONLY_LOCAL }, async (args) => withToolErrors(async () => { const result = mutationApprovalContract(args); return toolResult(formatCloudflare("mutation_approval_contract", result), { mutation_approval_contract: result }); }));
  mcpServer.registerTool("vnem_tools_secret_redaction_check", { title: "Tools Secret Redaction Check", description: "Detect and redact secret/token patterns including Cloudflare tokens.", inputSchema: { text: z.string().default(""), secret_values: z.array(z.string()).default([]) }, annotations: READ_ONLY_LOCAL }, async (args) => withToolErrors(async () => { const result = secretRedactionCheck(args); return toolResult(formatCloudflare("secret_redaction_check", result), { secret_redaction_check: result }); }));
}

function buildCloudflareStatusPolicy() {
  const allowed = cloudflareAllowedOperations(activePermissionProfile.profile_name);
  return {
    capability_group: "cloudflare_control",
    preferred_strategy: ["Wrangler first for local Pages/Workers deploy flows", "Cloudflare API for discovery, DNS, env/secrets metadata, verification, rollback/cache APIs where Wrangler is insufficient", "Never cookies/sessions/browser profiles"],
    permission_profile: activePermissionProfile.profile_name,
    capability_status: activePermissionProfile.profile_name === "dangerous-disabled" ? "disabled_by_profile" : activePermissionProfile.profile_name === "safe-readonly" ? "read_only" : activePermissionProfile.profile_name === "safe-local-dev" ? "dry_run_only" : "approval_gated_mutation_enabled",
    allowed_operations: allowed,
    mutation_approval_phrase: CLOUDFLARE_MUTATION_APPROVAL_PHRASE,
    destructive_approval_phrase: CLOUDFLARE_DESTRUCTIVE_APPROVAL_PHRASE,
    protected_resource_defaults: defaultCloudflareProtectedResources(),
    secrets_redacted: true,
    no_cookie_session_auth: true
  };
}

function cloudflareAllowedOperations(profile) {
  if (profile === "dangerous-disabled") return [];
  const read = ["status", "auth_plan", "accounts_list", "projects_list", "deploy_verify", "evidence_pack_audit", "mutation_approval_contract", "secret_redaction_check"];
  const plan = ["pages_deploy_plan", "workers_deploy_plan", "dns_plan", "env_plan", "rollback_plan", "cache_purge_plan"];
  if (profile === "safe-readonly") return read;
  if (profile === "safe-local-dev") return [...read, ...plan];
  const mutation = ["pages_deploy", "workers_deploy", "dns_create", "dns_update", "env_apply", "cache_purge"];
  if (profile === "approved-writes") return [...read, ...plan, ...mutation];
  if (profile === "creator-power") return [...read, ...plan, ...mutation, "dns_delete", "rollback", "destructive_delete_with_exact_phrase"];
  return read;
}

function defaultCloudflareProtectedResources() {
  return ["production environments", "root/apex DNS records", "www DNS records", "MX records", "TXT records containing SPF/DKIM/DMARC", "active Pages production project", "active Worker production script", "account-level settings", "billing/account/user/token management", "anything marked protected by the user"];
}

async function cloudflareStatus() {
  const version = await getWranglerVersion();
  const policy = buildCloudflareStatusPolicy();
  const tokenPresent = Boolean(process.env.CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN || process.env.CF_TOKEN);
  const accountPresent = Boolean(process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CF_ACCOUNT_ID);
  const authState = tokenPresent ? "api_token_present" : version.wrangler_available ? "wrangler_available_login_unknown" : "not_authenticated_detected";
  const missing = [];
  if (!version.wrangler_available) missing.push("Install Wrangler locally or use npx wrangler.");
  if (!tokenPresent) missing.push("Set CLOUDFLARE_API_TOKEN or login with Wrangler; do not store tokens in repo.");
  return {
    wrangler_available: version.wrangler_available,
    wrangler_version: version.wrangler_version,
    node_available: true,
    npm_or_npx_available: true,
    api_token_present: tokenPresent,
    api_token_redacted: tokenPresent ? "[REDACTED]" : null,
    account_id_present: accountPresent,
    auth_state: authState,
    permission_profile: activePermissionProfile.profile_name,
    capability_status: policy.capability_status,
    allowed_operations: policy.allowed_operations,
    blocked_operations: ["cookies", "browser_sessions", "browser_profile_scraping", "CAPTCHA_bypass", "account_billing_user_token_mutation", "printing_or_committing_tokens"],
    missing_setup: missing,
    recommended_next_step: missing.length ? missing[0] : "Use read-only discovery first, then plan mutation and require exact approval phrase.",
    secrets_redacted: true,
    tools_can_mutate: ["approved-writes", "creator-power"].includes(activePermissionProfile.profile_name),
    no_cookie_session_auth: true
  };
}

async function getWranglerVersion() {
  if (process.env.VNEM_TOOLS_SKIP_WRANGLER_CHECK === "1") return { wrangler_available: false, wrangler_version: null };
  const result = await runProcess("npx", ["--yes", "wrangler", "--version"], { cwd: repoRoot, timeoutMs: 5000, maxOutputBytes: 2000 });
  const text = `${result.stdout || ""}\n${result.stderr || ""}`.trim();
  const match = text.match(/(\d+\.\d+\.\d+)/);
  return { wrangler_available: result.ok || Boolean(match), wrangler_version: match ? match[1] : null };
}

function cloudflareAuthPlan(args = {}) {
  const full = /full|broad|authorized/i.test(args.access_goal || "");
  return {
    recommended_auth_method: full ? "Wrangler login plus scoped Cloudflare API token for full user-authorized account/project/DNS/env/deploy operations." : "Least-privilege Cloudflare API token plus Wrangler login when local deploy flow needs it.",
    wrangler_login_steps: ["Install/use local Wrangler: npx wrangler --version", "Run npx wrangler login in a real terminal/browser", "Verify with npx wrangler whoami", "Use npx wrangler pages deploy or npx wrangler deploy only after approval."],
    api_token_steps: ["Create a Cloudflare API token in dashboard", "Grant only needed Account/Workers/Pages/Zone DNS/Cache permissions", "Store in environment variable, never in repo", "Verify with /user/tokens/verify using Authorization: Bearer <token>"],
    needed_permissions: full ? ["Account Read", "Workers Scripts Edit", "Workers Tail/Routes Read if verifying", "Cloudflare Pages Edit", "Zone Read", "DNS Read/Edit", "Cache Purge"] : ["Account Read", "Cloudflare Pages Read/Edit only for selected account", "Workers Scripts Read/Edit only for selected account", "Zone DNS Read/Edit only for selected zones"],
    least_privilege_recommendation: "Create separate tokens per task/scope where practical: Pages deploy, Worker deploy, DNS edit, cache purge. Limit resources to specific account/zone/project.",
    env_var_names: ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID", "CF_API_TOKEN", "CF_ACCOUNT_ID"],
    secret_storage_warning: "Do not commit tokens, print tokens, put them in evidence packs, or paste them into prompts/logs. Use environment variables or a secret manager.",
    forbidden_auth_methods: ["cookies", "browser sessions", "browser profile scraping", "CAPTCHA bypass", "committed tokens", "printed tokens"],
    verification_command: "npx wrangler whoami && curl -H 'Authorization: Bearer <redacted>' https://api.cloudflare.com/client/v4/user/tokens/verify",
    official_docs_grounding: ["Wrangler commands: npx wrangler <COMMAND>; pages deploy; wrangler deploy; wrangler secret put/delete/list", "API token verification uses Authorization: Bearer <API_TOKEN>; DNS Write required for DNS record writes", "Workers secrets are hidden after definition and can be set with wrangler secret put"]
  };
}

async function cloudflareAccountsList(args = {}) {
  enforceCloudflareRead();
  if (args.simulate) return { read_only: true, source: "simulated", accounts: [{ id_redacted: "acct…test", name: "simulated-account", type: "standard" }], secrets_redacted: true };
  const json = await cloudflareApi("GET", "/accounts");
  return { read_only: true, source: "api", accounts: arrayify(json.result).map((a) => ({ id_redacted: redactId(a.id), name: a.name || "unknown", type: a.type || null })), success: json.success === true, secrets_redacted: true };
}

async function cloudflareProjectsList(args = {}) {
  enforceCloudflareRead();
  const accountId = args.account_id || process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CF_ACCOUNT_ID;
  if (args.simulate) return { read_only: true, source: "simulated", pages_projects: [{ name: "simulated-pages", production_branch: "main", production_indicator: true }], workers_scripts: [{ id: "simulated-worker", production_indicator: true }], secrets_redacted: true };
  if (!accountId) throw new ToolsError("CLOUDFLARE_ACCOUNT_ID is required for project discovery.", "cloudflare_account_id_required");
  const pages = await cloudflareApi("GET", `/accounts/${encodeURIComponent(accountId)}/pages/projects`).catch((error) => ({ success: false, error: error.message, result: [] }));
  const workers = await cloudflareApi("GET", `/accounts/${encodeURIComponent(accountId)}/workers/scripts`).catch((error) => ({ success: false, error: error.message, result: [] }));
  return { read_only: true, source: "api", pages_projects: arrayify(pages.result).map((p) => ({ name: p.name, production_branch: p.production_branch || null, production_indicator: Boolean(p.production_branch), latest_deployment: p.latest_deployment ? { id: redactId(p.latest_deployment.id), environment: p.latest_deployment.environment } : null })), workers_scripts: arrayify(workers.result).map((w) => ({ id: w.id || w.name, production_indicator: true })), pages_success: pages.success === true, workers_success: workers.success === true, secrets_redacted: true };
}

async function cloudflarePagesDeployPlan(args) {
  const root = await resolveAllowedRoot(args.project_dir || ".");
  const risks = cloudflareProtectedRisks({ ...args, resource_name: args.project_name, resource_type: "pages_project" });
  return { command_plan: buildPagesDeployCommand(args), detected_framework: await detectCloudflareFramework(root.absolutePath), build_command: args.build_command || "", output_dir: args.output_dir || "dist", project_name: args.project_name, environment: args.environment || "preview", approval_required: true, mutation_type: "cloudflare_pages_deploy", protected_resource_risk: risks, evidence_to_collect: ["build command output", "Wrangler/API deploy output", "deployment URL from Wrangler/API output", "HTTP verification result", "rollback hint"], dry_run_only: true, must_not_claim: ["Pages was deployed", "Deployment URL is live", "Production changed"] };
}

async function cloudflareWorkersDeployPlan(args) {
  const root = await resolveAllowedRoot(args.project_dir || ".");
  const configPath = path.join(root.absolutePath, "wrangler.toml");
  const configDetected = existsSync(configPath) || existsSync(path.join(root.absolutePath, "wrangler.json")) || existsSync(path.join(root.absolutePath, "wrangler.jsonc"));
  return { command_plan: buildWorkersDeployCommand(args), wrangler_config_detected: configDetected, script_name: args.script_name || null, entrypoint: args.entrypoint || null, environment: args.environment || "preview", approval_required: true, mutation_type: "cloudflare_workers_deploy", protected_resource_risk: cloudflareProtectedRisks({ ...args, resource_name: args.script_name, resource_type: "worker" }), evidence_to_collect: ["build output", "Wrangler deploy output", "Worker route/version metadata", "verification result", "rollback hint"], dry_run_only: true, must_not_claim: ["Worker was deployed", "Production Worker changed"] };
}

function buildPagesDeployCommand(args) {
  const out = args.output_dir || "dist";
  const cmd = ["npx", "wrangler", "pages", "deploy", out];
  if (args.project_name) cmd.push("--project-name", args.project_name);
  if (args.branch) cmd.push("--branch", args.branch);
  return [cmd.join(" ")];
}

function buildWorkersDeployCommand(args) {
  const cmd = ["npx", "wrangler", "deploy"];
  if (args.entrypoint) cmd.push(args.entrypoint);
  if (args.script_name) cmd.push("--name", args.script_name);
  if (args.environment && args.environment !== "production") cmd.push("--env", args.environment);
  return [cmd.join(" ")];
}

async function detectCloudflareFramework(root) {
  try {
    const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
    const text = JSON.stringify({ dependencies: pkg.dependencies || {}, devDependencies: pkg.devDependencies || {}, scripts: pkg.scripts || {} }).toLowerCase();
    if (text.includes("vite")) return "vite/react-vite-like";
    if (text.includes("next")) return "next";
    if (text.includes("astro")) return "astro";
  } catch {}
  return "unknown_or_static";
}

async function cloudflarePagesDeploy(args) {
  const plan = await cloudflarePagesDeployPlan(args);
  enforceCloudflareMutation("cloudflare_mutation", args, plan);
  return await executeCloudflareMutation("pages_deploy", args, plan, async (root) => {
    const commands = [];
    let build = null;
    if (args.build_command) {
      validateSafeBuildCommand(args.build_command);
      commands.push(args.build_command);
      if (!args.simulate) {
        const t = splitCommand(args.build_command);
        build = await runProcess(t[0], t.slice(1), { cwd: root.absolutePath, timeoutMs: MAX_COMMAND_TIMEOUT_MS, maxOutputBytes: MAX_COMMAND_OUTPUT_BYTES });
        if (!build.ok) throw new ToolsError("Build failed; deploy was not attempted.", "cloudflare_build_failed", { build: redactObject(build) });
      }
    }
    const commandText = buildPagesDeployCommand(args)[0]; commands.push(commandText);
    let deploy = simulatedCloudflareResult("pages_deploy", { deployment_url: `https://${args.project_name || "project"}.pages.dev`, project_name: args.project_name });
    if (!args.simulate) {
      const tokens = splitCommand(commandText);
      deploy = await runProcess(tokens[0], tokens.slice(1), { cwd: root.absolutePath, timeoutMs: MAX_COMMAND_TIMEOUT_MS, maxOutputBytes: MAX_COMMAND_OUTPUT_BYTES });
    }
    const url = extractDeploymentUrl(`${deploy.stdout || ""}\n${deploy.stderr || ""}`) || deploy.deployment_url || null;
    const verification = await cloudflareDeployVerify({ deployment_url: url || "", simulate: args.simulate || !url });
    return { commands, stdout: `${build?.stdout || ""}\n${deploy.stdout || ""}`, stderr: `${build?.stderr || ""}\n${deploy.stderr || ""}`, result: deploy, verification, changed: [{ type: "pages_project", name: args.project_name, environment: args.environment || "preview", deployment_url: url }], rollback: { hint: "Use vnem_tools_cloudflare_rollback_plan with the previous Pages deployment id from Cloudflare deployment list." } };
  });
}

async function cloudflareWorkersDeploy(args) {
  const plan = await cloudflareWorkersDeployPlan(args);
  enforceCloudflareMutation("cloudflare_mutation", args, plan);
  return await executeCloudflareMutation("workers_deploy", args, plan, async (root) => {
    const commands = [];
    if (args.build_command) { validateSafeBuildCommand(args.build_command); commands.push(args.build_command); if (!args.simulate) { const t = splitCommand(args.build_command); const b = await runProcess(t[0], t.slice(1), { cwd: root.absolutePath, timeoutMs: MAX_COMMAND_TIMEOUT_MS, maxOutputBytes: MAX_COMMAND_OUTPUT_BYTES }); if (!b.ok) throw new ToolsError("Build failed; deploy was not attempted.", "cloudflare_build_failed", { build: redactObject(b) }); } }
    const commandText = buildWorkersDeployCommand(args)[0]; commands.push(commandText);
    let deploy = simulatedCloudflareResult("workers_deploy", { script_name: args.script_name || "worker" });
    if (!args.simulate) { const tokens = splitCommand(commandText); deploy = await runProcess(tokens[0], tokens.slice(1), { cwd: root.absolutePath, timeoutMs: MAX_COMMAND_TIMEOUT_MS, maxOutputBytes: MAX_COMMAND_OUTPUT_BYTES }); }
    return { commands, stdout: deploy.stdout || "", stderr: deploy.stderr || "", result: deploy, verification: { status: args.simulate ? "simulated" : "metadata_only" }, changed: [{ type: "worker_script", name: args.script_name || null, environment: args.environment || "preview" }], rollback: { hint: "Use wrangler rollback <version-id> or vnem_tools_cloudflare_rollback_plan after listing deployments." } };
  });
}

async function cloudflareDnsPlan(args) {
  const risks = cloudflareProtectedRisks({ ...args, resource_type: "dns_record", resource_name: args.record_name });
  const op = String(args.operation || "create").toLowerCase();
  return { zone_name: args.zone_name, record_name: args.record_name, record_type: String(args.record_type || "").toUpperCase(), operation: op, proxied: args.proxied ?? null, ttl: args.ttl ?? null, approval_required: true, destructive_approval_required: op === "delete", mutation_type: op === "delete" ? "cloudflare_dns_delete" : "cloudflare_dns_mutation", protected_resource_risk: risks, existing_record_conflict: args.simulate ? "not_checked_in_simulation" : "checked_during_apply_when_authenticated", production_traffic_risk: risks.some((r) => /root|apex|www|production/i.test(r)), dry_run_only: true, values_redacted: true, must_not_claim: ["DNS was changed", "No production traffic risk", "Existing records were checked"] };
}

async function cloudflareDnsApply(args) {
  const plan = await cloudflareDnsPlan(args);
  const destructive = plan.destructive_approval_required;
  enforceCloudflareMutation(destructive ? "cloudflare_destructive" : "cloudflare_mutation", args, plan);
  return await executeCloudflareMutation("dns_apply", args, plan, async () => {
    let result = simulatedCloudflareResult("dns_apply", { operation: args.operation, record_name: args.record_name });
    if (!args.simulate) result = await applyDnsViaApi(args);
    return { commands: [`Cloudflare API DNS ${args.operation || "create"} ${args.record_type} ${args.record_name}`], stdout: JSON.stringify(result, null, 2), stderr: "", result, verification: { status: args.simulate ? "simulated" : "api_result", success: result.success !== false }, changed: [{ type: "dns_record", zone_name: args.zone_name, name: args.record_name, record_type: args.record_type, operation: args.operation || "create", value_redacted: redactDnsValue(args.record_type, args.record_value) }], rollback: { hint: destructive ? "Recreate deleted record from before evidence if deletion was wrong." : "Revert DNS record to before evidence or delete created record." } };
  }, { destructive });
}

function cloudflareEnvPlan(args) {
  const risks = cloudflareProtectedRisks({ ...args, resource_type: `${args.target_type}_env`, resource_name: args.target_name });
  return { target_type: args.target_type, target_name: args.target_name, environment: args.environment, variables: arrayify(args.variables).map((v) => ({ name: v.name, secret: v.secret !== false, operation: v.operation || "put", value: "[REDACTED]" })), approval_required: true, mutation_type: "cloudflare_env_secrets_mutation", protected_resource_risk: risks, values_redacted: true, before_after_evidence_policy: "names/status only; no values", dry_run_only: true, must_not_claim: ["Secret values were printed", "Env/secrets were changed"] };
}

async function cloudflareEnvApply(args) {
  const plan = cloudflareEnvPlan(args);
  enforceCloudflareMutation("cloudflare_mutation", args, plan);
  return await executeCloudflareMutation("env_apply", args, plan, async (root) => {
    const commands = [];
    const commandResults = [];
    const extraSecrets = secretValuesFromArgs(args);
    for (const v of arrayify(args.variables)) {
      const op = String(v.operation || "put").toLowerCase();
      const isSecret = v.secret !== false;
      if (!isSecret && !args.simulate) throw new ToolsError("Plain Cloudflare vars are planned/redacted but real apply is limited to Wrangler secret put/delete in this batch.", "cloudflare_plain_var_real_apply_not_implemented", { variable_name: v.name });
      let tokens;
      if (args.target_type === "pages") tokens = ["npx", "wrangler", "pages", "secret", op === "delete" ? "delete" : "put", v.name, "--project-name", args.target_name];
      else tokens = ["npx", "wrangler", "secret", op === "delete" ? "delete" : "put", v.name, "--name", args.target_name];
      if (args.environment && args.environment !== "production" && args.target_type === "workers") tokens.push("--env", args.environment);
      commands.push(tokens.join(" "));
      if (!args.simulate) {
        const result = op === "delete"
          ? await runProcess(tokens[0], tokens.slice(1), { cwd: root.absolutePath, timeoutMs: MAX_COMMAND_TIMEOUT_MS, maxOutputBytes: MAX_COMMAND_OUTPUT_BYTES })
          : await runProcessWithInput(tokens[0], tokens.slice(1), { cwd: root.absolutePath, timeoutMs: MAX_COMMAND_TIMEOUT_MS, maxOutputBytes: MAX_COMMAND_OUTPUT_BYTES, input: `${v.value || ""}\n`, extraSecrets });
        if (!result.ok) throw new ToolsError("Cloudflare secret operation failed.", "cloudflare_env_apply_failed", { variable_name: v.name, result: redactObject(result) });
        commandResults.push(result);
      }
    }
    const result = args.simulate ? simulatedCloudflareResult("env_apply", { variables: plan.variables }) : { success: true, results: commandResults };
    return { commands, stdout: JSON.stringify(result), stderr: "", result, verification: { status: args.simulate ? "simulated" : "wrangler_completed", values_redacted: true }, changed: plan.variables.map((v) => ({ ...v, value: "[REDACTED]" })), rollback: { hint: "Restore previous variable/secret names from before evidence; secret values are never stored in evidence." } };
  });
}

async function cloudflareDeployVerify(args) {
  if (args.simulate || !args.deployment_url) return { deployment_url: args.deployment_url || null, reachable: args.simulate ? true : false, http_status: args.simulate ? args.expected_status || 200 : null, metadata_checked: false, marker_matched: args.expected_body_marker ? true : null, browser_evidence_handoff_recommended: true, safe_to_claim: args.simulate ? ["Simulated deployment verification only."] : [], must_not_claim: args.simulate ? ["Real deployment URL was reached."] : ["Deployment URL is reachable."] };
  const response = await fetch(args.deployment_url, { method: "GET" });
  const text = await response.text();
  return { deployment_url: redactUrl(new URL(args.deployment_url)), reachable: response.ok, http_status: response.status, metadata_checked: false, marker_matched: args.expected_body_marker ? text.includes(args.expected_body_marker) : null, title_matched: args.expected_title ? text.includes(`<title>${args.expected_title}`) || text.includes(args.expected_title) : null, browser_evidence_handoff_recommended: true, safe_to_claim: response.ok ? ["Deployment URL returned an HTTP response."] : [], must_not_claim: ["Full UI visual proof was collected unless browser evidence is provided."] };
}

async function cloudflareRollbackPlan(args) {
  return { target_type: args.target_type, project_name: args.project_name || null, script_name: args.script_name || null, deployment_id: redactId(args.deployment_id), version_id: redactId(args.version_id), approval_required: true, destructive_approval_required: true, protected_resource_risk: cloudflareProtectedRisks({ ...args, resource_type: "rollback", resource_name: args.project_name || args.script_name }), previous_deployment_identification: args.simulate ? "simulated_previous_version" : "requires Cloudflare deployment/version list", dry_run_only: true, must_not_claim: ["Rollback was applied", "Previous version was identified with certainty without API/Wrangler evidence"] };
}

async function cloudflareRollback(args) {
  const plan = await cloudflareRollbackPlan(args);
  enforceCloudflareMutation("cloudflare_destructive", args, plan);
  return await executeCloudflareMutation("rollback", args, plan, async (root) => {
    let result = simulatedCloudflareResult("rollback", { target_type: args.target_type });
    const commands = [args.target_type === "workers" ? `npx wrangler rollback ${args.version_id || "<version-id>"}` : `Cloudflare API Pages rollback ${args.deployment_id || "<deployment-id>"}`];
    if (!args.simulate) {
      if (args.target_type === "workers") {
        if (!args.version_id) throw new ToolsError("Workers rollback requires version_id.", "cloudflare_worker_version_id_required");
        const tokens = ["npx", "wrangler", "rollback", args.version_id, "--yes"];
        if (args.script_name) tokens.push("--name", args.script_name);
        result = await runProcess(tokens[0], tokens.slice(1), { cwd: root.absolutePath, timeoutMs: MAX_COMMAND_TIMEOUT_MS, maxOutputBytes: MAX_COMMAND_OUTPUT_BYTES });
        if (!result.ok) throw new ToolsError("Workers rollback command failed.", "cloudflare_rollback_failed", { result: redactObject(result) });
      } else {
        throw new ToolsError("Real Pages rollback API shape was not confirmed in this batch; use rollback plan plus Cloudflare dashboard/API-specific verified endpoint.", "cloudflare_pages_rollback_not_implemented", { rollback_plan: plan });
      }
    }
    return { commands, stdout: JSON.stringify(result), stderr: "", result, verification: { status: args.simulate ? "simulated" : "wrangler_completed" }, changed: [{ type: "rollback", target_type: args.target_type, target: args.project_name || args.script_name }], rollback: { hint: "Rollback of rollback requires redeploying the newer version." } };
  }, { destructive: true });
}

async function cloudflareCachePurgePlan(args) {
  const risks = cloudflareProtectedRisks({ ...args, resource_type: "cache", resource_name: args.zone_name });
  if (args.purge_everything) risks.push("purge_everything may affect the whole production zone cache");
  return { zone_name: args.zone_name, files: arrayify(args.files).map(redactSecrets), purge_everything: args.purge_everything === true, approval_required: true, mutation_type: "cloudflare_cache_purge", protected_resource_risk: risks, dry_run_only: true, must_not_claim: ["Cache was purged", "No user impact"] };
}

async function cloudflareCachePurge(args) {
  const plan = await cloudflareCachePurgePlan(args);
  enforceCloudflareMutation("cloudflare_mutation", args, plan);
  return await executeCloudflareMutation("cache_purge", args, plan, async () => {
    let result = simulatedCloudflareResult("cache_purge", { purge_everything: args.purge_everything === true });
    if (!args.simulate) {
      const zoneId = await cloudflareZoneId(args.zone_name);
      const body = args.purge_everything ? { purge_everything: true } : { files: arrayify(args.files) };
      result = await cloudflareApi("POST", `/zones/${encodeURIComponent(zoneId)}/purge_cache`, body);
    }
    return { commands: [`Cloudflare API cache purge ${args.zone_name}`], stdout: JSON.stringify(result), stderr: "", result, verification: { status: args.simulate ? "simulated" : "api_result", success: result.success !== false }, changed: [{ type: "cache_purge", zone_name: args.zone_name, purge_everything: args.purge_everything === true, files: arrayify(args.files).map(redactSecrets) }], rollback: { hint: "Cache purge is not directly reversible; verify origin and wait for recache." } };
  });
}

async function executeCloudflareMutation(operation, args, plan, executor, opts = {}) {
  const root = args.project_dir ? await resolveAllowedRoot(args.project_dir) : { absolutePath: allowedRoots[0] };
  const details = await executor(root);
  const pack = await writeCloudflareEvidencePack(operation, args, plan, details, opts);
  return { operation, dry_run: false, mutated: true, simulated: args.simulate === true, approval_verified: true, destructive_approval_verified: opts.destructive === true || false, protected_resource_acknowledged: Boolean(args.protected_acknowledgment || !arrayify(plan.protected_resource_risk).length), evidence_pack_path: pack.path, evidence_pack_id: pack.id, commands_run: details.commands || [], result_summary: redactObject(details.result), verification_result: details.verification, changed_resources: details.changed || [], rollback_hint: details.rollback, safe_to_claim: args.simulate ? ["Simulated Cloudflare mutation path wrote a redacted evidence pack."] : ["Cloudflare mutation command/API path completed; verify result details."], must_not_claim: args.simulate ? ["Real Cloudflare resources changed.", "Deployment is live."] : [] };
}

async function writeCloudflareEvidencePack(operation, args, plan, details, opts = {}) {
  const id = `${new Date().toISOString().replace(/[:.]/g, "-")}-${operation}-${randomUUID().slice(0, 8)}`;
  const root = path.join(evidenceRoot, "cloudflare", id);
  await mkdir(root, { recursive: true });
  const approval = mutationApprovalContract({ operation, destructive: opts.destructive === true, approval_phrase: args.approval_phrase || "", protected_resource_risk: arrayify(plan.protected_resource_risk) });
  const files = {
    "request_summary.json": { operation, plan: redactObject(plan), simulate: args.simulate === true, permission_profile: activePermissionProfile.profile_name },
    "approval_record.json": approval,
    "commands_run.txt": arrayify(details.commands).join("\n"),
    "stdout_redacted.txt": details.stdout || "",
    "stderr_redacted.txt": details.stderr || "",
    "cloudflare_result_redacted.json": redactObject(details.result || {}),
    "verification_result.json": redactObject(details.verification || {}),
    "changed_resources.json": redactObject(details.changed || []),
    "rollback_hint.json": redactObject(details.rollback || {}),
    "final_summary.md": [`# Cloudflare ${operation}`, `simulated: ${args.simulate === true}`, `approval_verified: ${approval.approved}`, `changed_resources: ${arrayify(details.changed).length}`, "secrets_redacted: true"].join("\n")
  };
  for (const [name, value] of Object.entries(files)) await writeFile(path.join(root, name), redactSecrets(typeof value === "string" ? value : JSON.stringify(value, null, 2), secretValuesFromArgs(args)), "utf8");
  return { id, path: root };
}

async function evidencePackAudit(args) {
  const dir = path.resolve(args.evidence_pack_path);
  const missing = [];
  for (const file of CLOUDFLARE_EVIDENCE_FILES) if (!existsSync(path.join(dir, file))) missing.push(file);
  let leaks = [];
  for (const file of CLOUDFLARE_EVIDENCE_FILES) {
    const fp = path.join(dir, file);
    if (existsSync(fp)) {
      const text = await readFile(fp, "utf8");
      const check = secretRedactionCheck({ text });
      if (check.leak_detected) leaks.push(file);
    }
  }
  return { evidence_pack_path: dir, required_files: CLOUDFLARE_EVIDENCE_FILES, missing_files: missing, complete: missing.length === 0 && leaks.length === 0, secret_leak_files: leaks, prevents_fake_mutation_success_claims: missing.length === 0 && existsSync(path.join(dir, "verification_result.json")) && existsSync(path.join(dir, "changed_resources.json")) };
}

function mutationApprovalContract(args) {
  const destructive = args.destructive === true;
  const required = destructive ? CLOUDFLARE_DESTRUCTIVE_APPROVAL_PHRASE : CLOUDFLARE_MUTATION_APPROVAL_PHRASE;
  const approved = String(args.approval_phrase || "") === required;
  return { operation: args.operation, destructive, required_phrase: required, provided_phrase_exact_match: approved, approved, protected_resource_risk: arrayify(args.protected_resource_risk), approval_missing_or_invalid: !approved, must_not_claim: approved ? [] : ["Mutation was approved", "Mutation was executed"] };
}

function secretRedactionCheck(args) {
  const text = String(args.text || "");
  const patterns = [];
  if (/cfut_[A-Za-z0-9_-]{10,}/.test(text)) patterns.push("cfut_token");
  if (/authorization\s*[:=]\s*bearer\s+[^\s"'{}]+/i.test(text) || /bearer\s+[a-z0-9._~+/-]+/i.test(text)) patterns.push("authorization_bearer");
  if (/(CLOUDFLARE_API_TOKEN|CF_API_TOKEN|CF_TOKEN)\s*[:=]/i.test(text)) patterns.push("cloudflare_env_token");
  if (/X-Auth-Email\s*[:=]|X-Auth-Key\s*[:=]/i.test(text)) patterns.push("email_api_key_pair");
  if (containsRawSecret(text)) patterns.push("generic_secret_value");
  const redacted = redactSecrets(text, args.secret_values || []);
  const sanitized = redacted.replace(/\[REDACTED\]/g, "").replace(/Bearer\s*\*\*\*/gi, "Bearer");
  const extraLeaks = arrayify(args.secret_values).filter((v) => v && redacted.includes(v));
  return { leak_detected: patterns.length > 0 || extraLeaks.length > 0, detected_patterns: [...new Set(patterns)], redacted_output: redacted, redacted_output_safe: extraLeaks.length === 0 && !/cfut_[A-Za-z0-9_-]{10,}/.test(redacted) && !/Bearer\s+(?!\[REDACTED\]|$)[A-Za-z0-9._~+/-]{6,}/i.test(redacted), secrets_redacted: true, must_not_claim: patterns.length ? ["Original text was safe to log without redaction"] : [] };
}

function enforceCloudflareRead() {
  const preview = actionPolicyPreview({ action_type: "cloudflare_read", proposed_action: "cloudflare read/status" });
  if (!preview.allowed) throw new ToolsError(preview.reason, "permission_profile_blocked", { action_policy_preview: preview });
}

function enforceCloudflareMutation(actionType, args, plan = {}) {
  const profileName = activePermissionProfile.profile_name;
  const destructive = actionType === "cloudflare_destructive";
  const mutationAllowed = profileName === "approved-writes" || profileName === "creator-power";
  const destructiveAllowed = profileName === "creator-power";
  if ((destructive && !destructiveAllowed) || (!destructive && !mutationAllowed)) {
    throw new ToolsError(`Cloudflare ${destructive ? "destructive" : "mutation"} action blocked by active permission profile ${profileName}.`, "permission_profile_blocked", { permission_profile: profileName, dry_run_plan: redactObject(plan) });
  }
  const contract = mutationApprovalContract({ operation: actionType, destructive, approval_phrase: args.approval_phrase || "", protected_resource_risk: arrayify(plan.protected_resource_risk) });
  if (!contract.approved) throw new ToolsError(destructive ? "Cloudflare destructive action requires exact destructive approval phrase." : "Cloudflare mutation requires exact mutation approval phrase.", destructive ? "cloudflare_destructive_approval_required" : "cloudflare_mutation_approval_required", { approval_contract: contract, dry_run_plan: redactObject(plan) });
  if (arrayify(plan.protected_resource_risk).length && !String(args.protected_acknowledgment || "").trim()) throw new ToolsError("Protected Cloudflare resource action requires protected_acknowledgment.", "cloudflare_protected_resource_ack_required", { protected_resource_risk: plan.protected_resource_risk, dry_run_plan: redactObject(plan) });
}

function cloudflareProtectedRisks(args = {}) {
  const list = [...defaultCloudflareProtectedResources(), ...arrayify(args.protected_resources)];
  const risks = [];
  const name = String(args.record_name || args.resource_name || args.project_name || args.script_name || "").toLowerCase();
  const type = String(args.record_type || "").toUpperCase();
  const value = String(args.record_value || "").toLowerCase();
  const env = String(args.environment || "").toLowerCase();
  if (env === "production") risks.push("production environment protected by default");
  if (name === "@" || (args.zone_name && name === String(args.zone_name).toLowerCase())) risks.push("root/apex DNS record protected by default");
  if (name === "www" || name.startsWith("www.")) risks.push("www DNS record protected by default");
  if (type === "MX") risks.push("MX mail record protected by default");
  if (type === "TXT" && /(spf|dkim|dmarc|v=spf1|_dmarc|domainkey)/i.test(`${name} ${value}`)) risks.push("TXT SPF/DKIM/DMARC mail record protected by default");
  for (const item of list) if (item && name && String(item).toLowerCase().includes(name) && !risks.includes(`user protected resource match: ${item}`)) risks.push(`user protected resource match: ${item}`);
  return [...new Set(risks)];
}

function validateSafeBuildCommand(command) {
  if (DANGEROUS_COMMAND_PATTERN.test(command) || CONTROL_OPERATOR_PATTERN.test(command)) throw new ToolsError("Unsafe build command blocked.", "cloudflare_build_command_blocked", { command: redactSecrets(command) });
  const t = splitCommand(command);
  if (t[0] === "npm" && t[1] === "run" && t[2] && !UNSAFE_PACKAGE_SCRIPT_PATTERN.test(t[2])) return;
  if (t[0] === "npm" && ["test", "run"].includes(t[1])) return;
  if (t[0] === "npx" || t[0] === "node") return;
  throw new ToolsError("Build command is not allowlisted for Cloudflare deploy flow.", "cloudflare_build_command_not_allowlisted", { command: redactSecrets(command) });
}

function simulatedCloudflareResult(kind, extra = {}) { return { success: true, simulated: true, kind, id: `${kind}-simulated`, stdout: `${kind} simulated ok`, stderr: "", ...extra }; }
function extractDeploymentUrl(text) { const m = String(text || "").match(/https:\/\/[^\s)]+/); return m ? m[0] : null; }
function redactId(id) { const text = String(id || ""); return text ? `${text.slice(0, 4)}…${text.slice(-4)}` : null; }
function redactDnsValue(type, value) { return /TXT|MX/i.test(type || "") ? "[REDACTED]" : redactSecrets(value || ""); }
function secretValuesFromArgs(args) { return arrayify(args.variables).map((v) => v.value).filter(Boolean); }
function redactObject(obj) { return safeRedactJsonValue(obj ?? null); }
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

async function cloudflareApi(method, apiPath, body) {
  const token = process.env.CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN || process.env.CF_TOKEN;
  if (!token) throw new ToolsError("Cloudflare API token missing.", "cloudflare_auth_missing");
  const response = await fetch(`https://api.cloudflare.com/client/v4${apiPath}`, { method, headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || json.success === false) throw new ToolsError("Cloudflare API request failed.", "cloudflare_api_failed", { status: response.status, result: redactObject(json) });
  return json;
}

async function applyDnsViaApi(args) {
  const zoneId = await cloudflareZoneId(args.zone_name);
  const existing = await cloudflareApi("GET", `/zones/${encodeURIComponent(zoneId)}/dns_records?type=${encodeURIComponent(args.record_type)}&name=${encodeURIComponent(normalizeDnsRecordName(args.record_name, args.zone_name))}`).catch(() => ({ result: [] }));
  const current = arrayify(existing.result)[0];
  const op = String(args.operation || "create").toLowerCase();
  if (op === "delete") {
    if (!current?.id) throw new ToolsError("DNS delete requested but matching record was not found.", "cloudflare_dns_record_not_found");
    return await cloudflareApi("DELETE", `/zones/${encodeURIComponent(zoneId)}/dns_records/${encodeURIComponent(current.id)}`);
  }
  const body = { type: String(args.record_type || "").toUpperCase(), name: normalizeDnsRecordName(args.record_name, args.zone_name), content: args.record_value, ttl: args.ttl || 1, proxied: args.proxied === true };
  if (op === "update") {
    if (!current?.id) throw new ToolsError("DNS update requested but matching record was not found.", "cloudflare_dns_record_not_found");
    return await cloudflareApi("PUT", `/zones/${encodeURIComponent(zoneId)}/dns_records/${encodeURIComponent(current.id)}`, body);
  }
  return await cloudflareApi("POST", `/zones/${encodeURIComponent(zoneId)}/dns_records`, body);
}

async function cloudflareZoneId(zoneName) {
  const json = await cloudflareApi("GET", `/zones?name=${encodeURIComponent(zoneName)}`);
  const zone = arrayify(json.result)[0];
  if (!zone?.id) throw new ToolsError("Cloudflare zone not found or token lacks Zone Read.", "cloudflare_zone_not_found", { zone_name: zoneName });
  return zone.id;
}

function normalizeDnsRecordName(recordName, zoneName) {
  const name = String(recordName || "").trim();
  if (name === "@") return zoneName;
  if (name.endsWith(`.${zoneName}`) || name === zoneName) return name;
  return `${name}.${zoneName}`;
}


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
    .replace(/gh[pousr]_[A-Za-z0-9_]{20,}/g, "[REDACTED]")
    .replace(/sk-[A-Za-z0-9_-]{10,}/g, "[REDACTED]");
}

function containsRawSecret(value) {
  if (isSecretRef(value)) return false;
  const text = typeof value === "string" ? value : JSON.stringify(value || "");
  return /bearer\s+|api[_-]?key\s*[:=]|token\s*[:=]|secret\s*[:=]|password\s*[:=]|CLOUDFLARE_API_TOKEN\s*[:=]|CF_API_TOKEN\s*[:=]|CF_TOKEN\s*[:=]|cfut_[A-Za-z0-9_-]{10,}|gh[pousr]_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{10,}/i.test(text);
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

async function withToolErrors(fn) {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof ToolsError) return errorResult(error.message, error.code, error.details);
    return errorResult(error.message || String(error), "tools_unexpected_error");
  }
}

function toolResult(text, structuredContent) {
  return { content: [{ type: "text", text: redactSecrets(text) }], structuredContent };
}

function errorResult(text, code = "tools_error", details = {}) {
  return { isError: true, content: [{ type: "text", text: redactSecrets(text) }], structuredContent: { error: redactSecrets(text), code, ...details } };
}

export { REQUIRED_TOOL_NAMES, statusObject };
