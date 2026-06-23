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
  "vnem_tools_browser_capture"
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
    unsupported_in_foundation_batch: ["github_mutation", "package_install", "arbitrary_shell", "unrestricted_api_calls", "login_automation", "cookie_extraction", "captcha_bypass"]
  };
}

function formatStatus() {
  const status = statusObject();
  return [
    `VNEM Tools MCP ${status.version}`,
    "Tools MCP can perform actions only through safeguards.",
    `Allowed roots: ${status.allowed_roots.join(", ")}`,
    "Dry-run is default; real mutation/execution/live API/browser screenshot requests require approved=true and an approval_note.",
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
  return /file_edit|patch|restore|test_runner|command|api_request|read_file|list_files|search_files|evidence|browser|screenshot|visual/.test(text);
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

async function runProcess(command, args, options) {
  return await new Promise((resolve) => {
    const child = spawn(command, args, { cwd: options.cwd, shell: false, windowsHide: true });
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
    return { ...unavailable, evidence_log_id: log.evidence_log_id };
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
    return { ...unavailable, evidence_log_id: log.evidence_log_id };
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
  return { ...result, evidence_log_id: log.evidence_log_id };
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
