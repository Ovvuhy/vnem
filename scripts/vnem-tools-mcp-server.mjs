#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
  "vnem_tools_collect_evidence"
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
      "Tools MCP is not Core MCP and is not Giga MCP. It can read, search, dry-run patches, apply approved patches, run approved allowlisted commands, prepare/perform approved limited API requests, and collect evidence.",
      "Dry-run is the default for mutation/execution/network actions. Real changes require dry_run=false, approved=true, and a non-empty approval_note.",
      "Browser screenshots, GitHub mutations, package installs, arbitrary shell, and broad automation are not implemented in this foundation batch."
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
        notes: z.string().default("")
      },
      annotations: ACTION_TOOL
    },
    async (args) => withToolErrors(async () => {
      const evidence = await collectEvidence(args);
      return toolResult(formatEvidence(evidence), { evidence });
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
      no_browser_github_or_installs: true
    },
    secret_policy: {
      secret_like_paths_blocked: true,
      raw_authorization_or_api_key_headers_blocked: true,
      secret_ref_only_for_future_auth: true,
      output_redaction_enabled: true
    },
    evidence_log_location: evidenceRoot,
    core_handoff_supported: true,
    unsupported_in_foundation_batch: ["browser_screenshot", "github_mutation", "package_install", "arbitrary_shell", "unrestricted_api_calls"]
  };
}

function formatStatus() {
  const status = statusObject();
  return [
    `VNEM Tools MCP ${status.version}`,
    "Tools MCP can perform actions only through safeguards.",
    `Allowed roots: ${status.allowed_roots.join(", ")}`,
    "Dry-run is default; real mutation/execution/live API requests require approved=true and an approval_note.",
    "Browser, GitHub mutation, package install, and unrestricted shell/API support are not implemented in this foundation batch. Future Tools/Giga MCP work."
  ].join("\n");
}

function buildActionPlan(args = {}) {
  const handoff = args.core_handoff || {};
  const requested = arrayify(args.requested_actions);
  const capabilities = arrayify(handoff.required_tool_capabilities).length ? arrayify(handoff.required_tool_capabilities) : requested;
  const actions = capabilities.filter((capability) => isSupportedCapability(capability)).map((capability) => ({
    action: capability,
    dry_run_first: true,
    requires_approval: ["file_edit", "test_runner", "command", "api_request"].some((term) => String(capability).includes(term)),
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
    safe_next_step: actions.length ? "Run the first action in dry-run mode, then ask for explicit approval before applying." : "Ask for a narrower supported Tools MCP action.",
    must_not_claim: [...arrayify(handoff.must_not_claim), "Tools MCP performed unsupported browser/GitHub/install work."].filter(Boolean)
  };
}

function isSupportedCapability(capability) {
  const text = String(capability || "").toLowerCase();
  return /file_edit|patch|test_runner|command|api_request|read_file|list_files|search_files|evidence/.test(text);
}

function unsupportedReason(capability) {
  const text = String(capability || "").toLowerCase();
  if (text.includes("browser") || text.includes("screenshot")) return "Browser/screenshot support is not in this foundation batch.";
  if (text.includes("github")) return "GitHub mutation support is not in this foundation batch.";
  if (text.includes("install") || text.includes("package")) return "Package install support is not in this foundation batch.";
  return "Unsupported by the safe Tools MCP foundation allowlist.";
}

function inferPermissions(actions) {
  const permissions = [];
  if (actions.some((item) => /file_edit|patch/.test(item.action))) permissions.push("approve file edits under allowed roots");
  if (actions.some((item) => /test_runner|command/.test(item.action))) permissions.push("approve allowlisted commands");
  if (actions.some((item) => /api_request/.test(item.action))) permissions.push("approve live API requests if not mocked");
  return permissions;
}

function inferRisk(actions, blocked) {
  if (blocked.length) return "medium";
  if (actions.some((item) => /file_edit|api_request|command/.test(item.action))) return "medium";
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
  const evidence = {
    evidence_id: logId("evidence"),
    generated_at: new Date().toISOString(),
    task: args.task,
    summary: `Evidence for ${args.task}: ${arrayify(args.changed_files).length} changed file(s), ${arrayify(args.commands_run).length} command(s), ${arrayify(args.api_requests).length} API request(s).`,
    tool_run_ids: arrayify(args.tool_run_ids),
    changed_files: arrayify(args.changed_files),
    commands_run: arrayify(args.commands_run),
    api_requests: arrayify(args.api_requests).map(redactSecrets),
    tests: arrayify(args.test_results),
    screenshots: arrayify(args.screenshots),
    blocked_actions: arrayify(args.screenshots).length ? [] : ["browser_screenshot_not_collected"],
    remaining_risks: ["Only claims backed by listed evidence should be made.", "Unsupported browser/GitHub/install actions remain future work."],
    safe_to_claim: ["Approved Tools MCP actions were run with evidence logs.", "Secrets were redacted from Tools MCP evidence output."],
    must_not_claim: ["Browser screenshots were captured.", "GitHub changes were pushed.", "Package installs were performed.", "Unlisted files were changed."],
    notes: redactSecrets(args.notes || "")
  };
  const log = await writeEvidenceLog("evidence", evidence, evidence.evidence_id);
  return { ...evidence, evidence_path: log.path };
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
