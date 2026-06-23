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
  "vnem_tools_prepare_action_plan",
  "vnem_tools_permission_prompt",
  "vnem_tools_read_file",
  "vnem_tools_list_files",
  "vnem_tools_search_files",
  "vnem_tools_apply_patch",
  "vnem_tools_run_command",
  "vnem_tools_api_request",
  "vnem_tools_collect_evidence",
  "vnem_tools_restore_backup",
  "vnem_tools_browser_capture",
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
const SKIPPED_DIRS = new Set([".git", "node_modules", "dist", "build", "coverage", ".next", ".turbo", ".cache"]);
const SAFE_PACKAGE_SCRIPT_PATTERN = /^(test|test:[a-z0-9:_-]+|validate|build|generate|check:links|dashboard:build|dashboard:check|core:readiness|tools:readiness|discover:dry-run|digest)$/i;
const SECRET_HEADER_PATTERN = /^(authorization|x-api-key|api-key|x-auth-token|cookie|set-cookie)$/i;
const DANGEROUS_COMMAND_PATTERN = /\b(rm\s+-rf|del\s+\/s|format\b|mkfs\b|diskpart\b|curl\b.*\|\s*(sh|bash)|wget\b.*\|\s*(sh|bash)|invoke-webrequest\b.*\|\s*iex|powershell\b.*-encodedcommand|pwsh\b.*-encodedcommand|npm\s+publish|git\s+push|git\s+reset\s+--hard|sudo\b|su\b|chmod\s+-R|chown\s+-R)\b/i;
const CONTROL_OPERATOR_PATTERN = /(\|\||&&|;|`|\$\(|>|<|\|)/;
const UNSAFE_PACKAGE_SCRIPT_PATTERN = /(^|[\s:_-])(install|publish|deploy|release|push|reset|clean:all|postinstall|preinstall)([\s:_-]|$)|git\s+push|npm\s+publish|pnpm\s+publish|yarn\s+publish|rm\s+-rf/i;
const DEV_SERVER_SCRIPT_PATTERN = /^(dev|start|preview)$/;
const PROJECT_TASKS = new Set(["test", "build", "validate", "lint", "typecheck", "doctor", "custom_script"]);
const devServers = new Map();
const sessions = new Map();

const allowedRoots = await computeAllowedRoots();
const evidenceRoot = await computeEvidenceRoot();
const usablePacks = await loadUsablePacks();

const server = new McpServer(
  { name: "vnem-tools", version: SERVER_VERSION },
  {
    instructions: [
      "VNEM Tools MCP is a safeguard-first action server for approved project work after VNEM Core has planned the task.",
      "Tools MCP is not Core MCP and is not Giga MCP. It can read, search, dry-run patches, apply approved patches, run approved allowlisted commands, prepare/perform approved limited API requests, capture approved local browser screenshots, and collect evidence.",
      "Dry-run is the default for mutation/execution/network/browser actions. Real changes require dry_run=false, approved=true, and a non-empty approval_note.",
      "GitHub mutations, package installs, arbitrary shell, broad browser automation, account login automation, cookie extraction, CAPTCHA bypass, and broad web scraping are not implemented."
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

function statusObject() {
  return {
    server_name: "vnem-tools",
    version: SERVER_VERSION,
    read_only: false,
    action_tools_enabled: true,
    dry_run_default: true,
    approval_required_for_mutation: true,
    allowed_roots: allowedRoots,
    blocked_paths: [".env*", "*secret*", "*token*", "*credential*", "*key*", ".git", "node_modules", "dist", "build"],
    command_allowlist: ["node --check <file>", "npm test", "npm run <safe-script>", "git status", "git diff", "git log", "git ls-files"],
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
    remaining_unsupported_actions: ["remote_github_mutation", "git_push", "package_install", "package_publish", "deployment", "arbitrary_shell", "unrestricted_api_calls", "secret_manager_backed_live_api", "external_browser_browsing_by_default", "login_automation", "cookie_extraction", "session_extraction", "captcha_bypass", "giga_mcp"],
    unsupported_in_foundation_batch: ["remote_github_mutation", "git_push", "package_install", "package_publish", "deployment", "arbitrary_shell", "unrestricted_api_calls", "secret_manager_backed_live_api", "login_automation", "cookie_extraction", "captcha_bypass", "giga_mcp"]
  };
}

function formatStatus() {
  const status = statusObject();
  return [
    `VNEM Tools MCP ${status.version}`,
    "Tools MCP can perform actions only through safeguards.",
    `Allowed roots: ${status.allowed_roots.join(", ")}`,
    "Dry-run is default; real mutation/execution/live API/browser screenshot/project task/dev server/git commit requests require approved=true and an approval_note.",
    "Local project actions include project scan, patch batch, restore batch, safe package tasks, local dev servers, session proof packs, and approved local git commits.",
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
  return /file_edit|patch|restore|test_runner|command|api_request|read_file|list_files|search_files|evidence|browser|screenshot|visual|project_scan|project_task|dev_server|local_git|git_status|git_diff|git_commit|session/.test(text);
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

async function safeApplyPatch(args) {
  const dryRun = args.dry_run !== false;
  const parsed = parseVnemPatch(args.patch);
  const root = await resolveAllowedRoot(args.target_root || ".");
  const target = await resolveAllowedFile(path.resolve(root.absolutePath, parsed.path), { mustExist: true, blockSecrets: true });
  if (!dryRun) enforceApproval(args);
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
  if (!dryRun) enforceApproval(args);
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
  if (!dryRun) enforceApproval(args);
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
  if (!dryRun) enforceApproval(args);
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
  for (const name of [".env", ".env.local", "secrets", "tokens", "credentials"]) if (existsSync(path.join(root, name))) out.push(name);
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
  if (dryRun) return planned;
  enforceApproval(args);
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
  if (dryRun) return planned;
  enforceApproval(args);
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
  if (dryRun) return planned;
  enforceApproval(args);
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
  if (dryRun) return planned;
  enforceApproval(args);
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
  if (dryRun) return planned;
  enforceApproval(args);
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
  const commandsRun = arrayify(args.commands_run);
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

async function writeEvidenceLog(kind, payload, existingId) {
  const evidenceLogId = existingId || logId(kind);
  const file = path.join(evidenceRoot, `${evidenceLogId}.json`);
  await mkdir(path.dirname(file), { recursive: true });
  const redactedPayload = JSON.parse(redactSecrets(JSON.stringify({ kind, evidence_log_id: evidenceLogId, generated_at: new Date().toISOString(), payload }, null, 2)));
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
  return parts.some((part) => part === ".env" || part.startsWith(".env.") || /(^|[._-])(secret|token|credential|password|passwd|api[_-]?key|private[_-]?key|id_rsa|id_ed25519)([._-]|$)/i.test(part));
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

function redactSecrets(value) {
  return String(value ?? "")
    .replace(/(authorization\s*[:=]\s*)(bearer\s+)?[^\s"'{}]+/gi, "$1[REDACTED]")
    .replace(/((api[_-]?key|token|secret|password|credential)["']?\s*[:=]\s*["']?)[^\s"'{}]+/gi, "$1[REDACTED]")
    .replace(/bearer\s+[a-z0-9._~+/-]+/gi, "Bearer [REDACTED]")
    .replace(/(should|sample)-redact-[a-z0-9-]+/gi, "[REDACTED]");
}

function containsRawSecret(value) {
  if (isSecretRef(value)) return false;
  const text = typeof value === "string" ? value : JSON.stringify(value || "");
  return /bearer\s+|api[_-]?key\s*[:=]|token\s*[:=]|secret\s*[:=]|password\s*[:=]/i.test(text);
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
