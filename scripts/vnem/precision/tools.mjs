import { z } from "zod";
import { PrecisionExecutionError } from "./execution.mjs";

const READ_ONLY_LOCAL = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const READ_ONLY_NETWORK = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
const PRECISE_MUTATION = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false };

const searchSchema = {
  query: z.string().min(1),
  limit: z.number().int().min(1).max(30).default(8),
  include_snippets: z.boolean().default(true),
  refresh: z.boolean().default(false)
};
const patchFields = {
  target_path: z.string().min(1),
  block: z.string().optional(),
  search: z.string().optional(),
  replace: z.string().optional(),
  unified_diff: z.string().optional(),
  dry_run: z.boolean().default(true),
  expected_occurrences: z.number().int().min(1).max(20).default(1),
  allow_multiple: z.boolean().default(false),
  expected_before_sha256: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
  transaction_id: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/).optional(),
  worker_id: z.string().default("default"),
  task_id: z.string().default("default"),
  required_documentation: z.array(z.string()).default([]),
  approved: z.boolean().default(false),
  approval_note: z.string().default("")
};
const terminalSchema = {
  command: z.string().min(1),
  session_id: z.string().default("default"),
  working_directory: z.string().optional(),
  timeout_ms: z.number().int().min(1000).max(120000).default(30000),
  approved: z.boolean().default(false),
  approval_note: z.string().default("")
};
const verificationSchema = {
  ...terminalSchema,
  task_id: z.string().default("default"),
  phase: z.enum(["red", "green", "check"]).default("green"),
  max_attempts: z.number().int().min(1).max(5).default(5),
  reset: z.boolean().default(false)
};
const documentationSchema = {
  library: z.string().min(1),
  topic: z.string().optional(),
  url: z.string().url().optional(),
  version: z.string().optional(),
  max_bytes: z.number().int().min(1024).max(512000).default(262144),
  worker_id: z.string().default("default"),
  task_id: z.string().default("default"),
  approved: z.boolean().default(false),
  approval_note: z.string().default("")
};
const ephemeralSchema = {
  language: z.enum(["node", "python", "shell"]).default("node"),
  script: z.string().min(1),
  args: z.array(z.string()).default([]),
  input_text: z.string().default(""),
  timeout_ms: z.number().int().min(1000).max(60000).default(15000),
  allow_shell: z.boolean().default(false),
  approved: z.boolean().default(false),
  approval_note: z.string().default("")
};

export function registerToolsPrecisionSubsystem(server, runtime, options = {}) {
  const testReference = options.testReference || "scripts/test-tools-precision-subsystem.mjs";
  register(server, options.registry, "vnem_tools_structural_code_search", {
    title: "Structural Code Search",
    description: "Lazily build and incrementally update a local private language-aware code index, then return ranked semantic and structural matches with file, line, symbol, and snippet evidence.",
    inputSchema: searchSchema,
    annotations: READ_ONLY_LOCAL
  }, async (args) => {
    const result = await runtime.semanticSearch(args);
    return resultEnvelope(formatSearch("vnem_tools_structural_code_search", result), { structural_code_search: result });
  }, testReference);

  register(server, options.registry, "vnem_tools_exact_patch", {
    title: "Exact Search Replace Patch",
    description: "Verify or atomically apply an exact search/replace patch with SHA-256 preconditions, task-scoped documentation gates, persisted evidence, and rollback support.",
    inputSchema: patchFields,
    annotations: PRECISE_MUTATION
  }, async (args) => {
    await options.mutationGuard?.(args, { action: "apply_patch", executes: args.dry_run === false });
    return patchResult("vnem_tools_exact_patch", await runtime.applyPatch({ ...args, mode: "search_replace" }));
  }, testReference);

  register(server, options.registry, "vnem_tools_unified_diff_apply", {
    title: "Unified Diff Apply",
    description: "Verify or atomically apply exact unified-diff hunks with SHA-256 preconditions, persisted evidence, and rollback support.",
    inputSchema: { ...patchFields, unified_diff: z.string().min(1) },
    annotations: PRECISE_MUTATION
  }, async (args) => {
    await options.mutationGuard?.(args, { action: "apply_patch", executes: args.dry_run === false });
    return patchResult("vnem_tools_unified_diff_apply", await runtime.applyPatch({ ...args, mode: "unified_diff" }));
  }, testReference);

  register(server, options.registry, "vnem_tools_patch_transaction", {
    title: "Atomic Multi-file Patch Transaction",
    description: "Verify or apply up to 25 exact patches as one atomic transaction; duplicate targets are rejected, partial failures roll back, and a local evidence manifest enables later rollback.",
    inputSchema: {
      patches: z.array(z.object({
        target_path: z.string().min(1),
        mode: z.enum(["search_replace", "unified_diff"]).default("search_replace"),
        block: z.string().optional(),
        search: z.string().optional(),
        replace: z.string().optional(),
        unified_diff: z.string().optional(),
        expected_occurrences: z.number().int().min(1).max(20).default(1),
        allow_multiple: z.boolean().default(false),
        expected_before_sha256: z.string().regex(/^[a-f0-9]{64}$/i).optional()
      })).min(1).max(25),
      dry_run: z.boolean().default(true),
      transaction_id: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/).optional(),
      worker_id: z.string().default("default"),
      task_id: z.string().default("default"),
      required_documentation: z.array(z.string()).default([]),
      approved: z.boolean().default(false),
      approval_note: z.string().default("")
    },
    annotations: PRECISE_MUTATION
  }, async (args) => {
    await options.mutationGuard?.(args, { action: "apply_patch", executes: args.dry_run === false });
    const result = await runtime.applyPatchTransaction(args);
    return resultEnvelope(formatTransaction("vnem_tools_patch_transaction", result.transaction), { patch_transaction: result.transaction });
  }, testReference);

  register(server, options.registry, "vnem_tools_patch_transaction_rollback", {
    title: "Patch Transaction Rollback",
    description: "Restore every file from a persisted patch-transaction backup after verifying current hashes; refuses to overwrite later edits unless force is explicitly true.",
    inputSchema: {
      transaction_id: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/),
      force: z.boolean().default(false),
      approved: z.boolean().default(false),
      approval_note: z.string().default("")
    },
    annotations: PRECISE_MUTATION
  }, async (args) => {
    await options.mutationGuard?.(args, { action: "restore_backup", executes: true, force: args.force });
    const result = await runtime.rollbackPatchTransaction(args);
    return resultEnvelope(`vnem_tools_patch_transaction_rollback: ${result.status}\nRestored: ${result.restored.length}`, { patch_rollback: result });
  }, testReference);

  register(server, options.registry, "vnem_tools_verification_loop", {
    title: "Persistent Verification Loop",
    description: "Run bounded red, green, or check verification commands in a workspace-scoped terminal and persist task attempt state across server restarts.",
    inputSchema: verificationSchema,
    annotations: PRECISE_MUTATION
  }, async (args) => {
    await options.mutationGuard?.(args, { action: "run_test", executes: true });
    const result = await runtime.runVerification(args);
    return resultEnvelope(formatVerification("vnem_tools_verification_loop", result), { verification: result });
  }, testReference);

  register(server, options.registry, "vnem_tools_terminal_session", {
    title: "Bounded Terminal Session",
    description: "Run one allowlisted build, test, check, or repository-inspection command in a stateful workspace-bounded session with captured output and explicit timeout evidence.",
    inputSchema: terminalSchema,
    annotations: PRECISE_MUTATION
  }, async (args) => {
    await options.mutationGuard?.(args, { action: "run_command", executes: true });
    const result = await runtime.executeTerminal(args);
    return resultEnvelope(formatExecution("vnem_tools_terminal_session", result), { terminal_session: result });
  }, testReference);

  register(server, options.registry, "vnem_tools_official_documentation_fetch", {
    title: "Official Documentation Fetch",
    description: "Fetch bounded HTTPS documentation from VNEM's known official source registry or a user-supplied URL and record compact task-scoped read-before-write context.",
    inputSchema: documentationSchema,
    annotations: READ_ONLY_NETWORK
  }, async (args) => {
    await options.networkGuard?.(args, { action: "external_fetch", executes: true });
    const result = await runtime.fetchDocumentation(args);
    return resultEnvelope(formatDocumentation("vnem_tools_official_documentation_fetch", result), result);
  }, testReference);

  register(server, options.registry, "vnem_tools_documentation_context", {
    title: "Task Documentation Context",
    description: "Read compact documentation context previously fetched for one worker and task without another network call.",
    inputSchema: {
      worker_id: z.string().optional(),
      task_id: z.string().optional(),
      library: z.string().optional()
    },
    annotations: READ_ONLY_LOCAL
  }, async (args) => {
    const result = runtime.documentationContext(args);
    return resultEnvelope(`vnem_tools_documentation_context: ${result.record_count} record(s)`, { documentation_context: result });
  }, testReference);

  register(server, options.registry, "vnem_tools_ephemeral_script", {
    title: "Ephemeral Local Script",
    description: "Run a bounded one-off Node or Python helper in a temporary local sandbox, block process/network/dangerous APIs, capture evidence, and verify cleanup.",
    inputSchema: ephemeralSchema,
    annotations: PRECISE_MUTATION
  }, async (args) => {
    await options.mutationGuard?.(args, { action: "execute_script", executes: true });
    const result = await runtime.executeEphemeral(args);
    return resultEnvelope(formatExecution("vnem_tools_ephemeral_script", result.execution), { ephemeral_script: result });
  }, testReference);

  register(server, options.registry, "vnem_tools_code_index_status", {
    title: "Code Index Status",
    description: "Report whether the structural index has been initialized, its size, dirty state, watcher state, pending incremental paths, and last redacted error without triggering a build.",
    inputSchema: {},
    annotations: READ_ONLY_LOCAL
  }, async () => {
    const result = runtime.indexStatus();
    return resultEnvelope(`vnem_tools_code_index_status: ${result.initialized ? `${result.files} files` : "lazy and not initialized"}`, { code_index_status: result });
  }, testReference);
}

export function registerPrecisionCompatibilityTools(server, runtime, options = {}) {
  const testReference = options.testReference || "scripts/test-precision-mcp-server.mjs";
  register(server, options.registry, "mcp_semantic_code_search", {
    title: "Semantic Code Search",
    description: "Compatibility name for the shared VNEM Tools structural code search implementation. Uses a lazy local private index and does not call external embedding APIs.",
    inputSchema: searchSchema,
    annotations: READ_ONLY_LOCAL
  }, async (args) => {
    const result = await runtime.semanticSearch(args);
    return resultEnvelope(formatSearch("mcp_semantic_code_search", result), { semantic_code_search: result });
  }, testReference);

  register(server, options.registry, "mcp_apply_diff_patch", {
    title: "Apply Exact Diff Patch",
    description: "Compatibility name for shared VNEM Tools exact and unified-diff patching with preconditions, atomic writes, evidence, and rollback.",
    inputSchema: { ...patchFields, mode: z.enum(["search_replace", "unified_diff"]).default("search_replace") },
    annotations: PRECISE_MUTATION
  }, async (args) => patchResult("mcp_apply_diff_patch", await runtime.applyPatch(args)), testReference);

  register(server, options.registry, "mcp_fetch_documentation", {
    title: "Fetch Current Documentation",
    description: "Compatibility name for shared VNEM Tools official documentation retrieval and task-scoped context recording.",
    inputSchema: documentationSchema,
    annotations: READ_ONLY_NETWORK
  }, async (args) => {
    const result = await runtime.fetchDocumentation(args);
    return resultEnvelope(formatDocumentation("mcp_fetch_documentation", result), result);
  }, testReference);

  register(server, options.registry, "mcp_execute_terminal_command", {
    title: "Execute Safe Stateful Terminal Command",
    description: "Compatibility name for the shared VNEM Tools bounded stateful terminal implementation.",
    inputSchema: terminalSchema,
    annotations: PRECISE_MUTATION
  }, async (args) => {
    const result = await runtime.executeTerminal(args);
    return resultEnvelope(formatExecution("mcp_execute_terminal_command", result), { execution: result });
  }, testReference);

  register(server, options.registry, "mcp_run_verification_tests", {
    title: "Run Verification Tests",
    description: "Compatibility name for the shared persistent VNEM Tools red, green, and check verification loop.",
    inputSchema: verificationSchema,
    annotations: PRECISE_MUTATION
  }, async (args) => {
    const result = await runtime.runVerification(args);
    return resultEnvelope(formatVerification("mcp_run_verification_tests", result), { verification: result });
  }, testReference);

  register(server, options.registry, "mcp_execute_ephemeral_script", {
    title: "Execute Ephemeral Script",
    description: "Compatibility name for the shared VNEM Tools bounded temporary-script implementation with cleanup evidence.",
    inputSchema: ephemeralSchema,
    annotations: PRECISE_MUTATION
  }, async (args) => {
    const result = await runtime.executeEphemeral(args);
    return resultEnvelope(formatExecution("mcp_execute_ephemeral_script", result.execution), { ephemeral_script: result });
  }, testReference);

  const migrations = {
    mcp_semantic_code_search: "Use vnem_tools_structural_code_search on VNEM Tools MCP.",
    mcp_apply_diff_patch: "Use vnem_tools_exact_patch, vnem_tools_unified_diff_apply, or vnem_tools_patch_transaction on VNEM Tools MCP.",
    mcp_fetch_documentation: "Use vnem_tools_official_documentation_fetch and vnem_tools_documentation_context on VNEM Tools MCP.",
    mcp_execute_terminal_command: "Use vnem_tools_terminal_session on VNEM Tools MCP.",
    mcp_run_verification_tests: "Use vnem_tools_verification_loop on VNEM Tools MCP.",
    mcp_execute_ephemeral_script: "Use vnem_tools_ephemeral_script on VNEM Tools MCP."
  };
  for (const [name, migrationGuidance] of Object.entries(migrations)) {
    options.registry?.annotate(name, {
      category: "precision_compatibility",
      deprecation_state: {
        deprecated: true,
        removal_target: "not_before_next_major_release",
        migration_guidance: migrationGuidance
      }
    });
  }
}

function register(server, registry, name, definition, handler, testReference) {
  server.registerTool(name, definition, async (args) => {
    try {
      return await handler(args);
    } catch (error) {
      return precisionErrorResult(error);
    }
  });
  registry?.annotate(name, {
    implementation_module: "scripts/vnem/precision/tools.mjs",
    behavior_test_references: [testReference],
    benchmark_scenarios: ["precision shared runtime MCP behavior"]
  });
}

function patchResult(name, result) {
  return resultEnvelope(formatPatch(name, result.patch, result.transaction), {
    patch: result.patch,
    transaction: result.transaction
  });
}

function resultEnvelope(text, structuredContent) {
  return { content: [{ type: "text", text }], structuredContent };
}

function precisionErrorResult(error) {
  const known = error instanceof PrecisionExecutionError;
  const code = known ? error.code : "unexpected_precision_error";
  const message = known ? error.message : "Precision operation failed unexpectedly. Internal details were redacted.";
  return {
    isError: true,
    content: [{ type: "text", text: `${code}: ${message}` }],
    structuredContent: {
      error: message,
      code,
      details: known ? error.details : { internal_error_hidden: true }
    }
  };
}

function formatSearch(name, result) {
  const matches = result.results.map((item) => `${item.target_path}:${item.start_line}-${item.end_line} score=${item.score}`).join("\n");
  return `${name}: ${result.results.length} result(s) for "${result.query}"\nIndex: ${result.indexed.files} files, ${result.indexed.chunks} chunks${matches ? `\n${matches}` : ""}`;
}

function formatPatch(name, patch, transaction) {
  return `${name}: ${patch.applied ? "applied" : "verified"} ${patch.target_path}\nMode: ${patch.mode}\nSHA-256: ${patch.before_sha256.slice(0, 12)} -> ${patch.after_sha256.slice(0, 12)}\nTransaction: ${transaction.transaction_id || "dry-run"}\nRollback: ${transaction.rollback_available}`;
}

function formatTransaction(name, result) {
  return `${name}: ${result.status}\nPatches: ${result.patches.length}\nTransaction: ${result.transaction_id || "dry-run"}\nRollback: ${result.rollback_available}`;
}

function formatExecution(name, result) {
  const status = result.timed_out ? "timed out" : result.ok ? "passed" : "failed";
  return `${name}: ${status}\nExit: ${result.exit_code ?? "none"}\nDuration: ${result.duration_ms}ms${result.stdout ? `\nstdout:\n${result.stdout.trimEnd()}` : ""}${result.stderr ? `\nstderr:\n${result.stderr.trimEnd()}` : ""}`;
}

function formatVerification(name, result) {
  return `${name}: ${result.verdict}\nTask: ${result.task_id}\nPhase: ${result.phase}\nAttempt: ${result.attempt}/${result.max_attempts}${result.execution ? `\n${formatExecution("execution", result.execution)}` : ""}`;
}

function formatDocumentation(name, result) {
  return `${name}: fetched ${result.documentation.library}\nURL: ${result.documentation.url}\nBytes: ${result.documentation.bytes}\nStored for: ${result.worker_id}/${result.task_id}`;
}
