#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  DocumentationContextStore,
  PrecisionExecutionError,
  StatefulTerminalSession,
  applyDiffPatch,
  fetchDocumentation
} from "./lib/precision-execution-layer.mjs";
import {
  CodebaseSemanticIndex,
  VerificationLoopStore,
  executeEphemeralScript,
  runVerificationTests
} from "./lib/omniscient-self-healing-layer.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(scriptDir, "..");
const workspaceRoot = path.resolve(process.env.VNEM_PRECISION_ROOT || process.env.VNEM_WORKSPACE_ROOT || process.cwd() || defaultRoot);

const READ_WRITE_PRECISE = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: false
};
const READ_ONLY_NETWORK = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true
};
const READ_ONLY_LOCAL = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false
};

const documentationStore = new DocumentationContextStore();
const terminalSessions = new Map();
const verificationLoops = new VerificationLoopStore();
const semanticIndex = new CodebaseSemanticIndex({ workspaceRoot });
semanticIndex.startBackgroundIndex().catch((error) => {
  console.error(`vnem semantic index background build failed: ${error.message}`);
});

const server = new McpServer(
  {
    name: "vnem-precision",
    version: "1.0.1"
  },
  {
    instructions: [
      "VNEM Precision Execution is an opt-in mutation-capable MCP server for projects that explicitly want surgical patching, dynamic documentation fetches, and safe verification commands.",
      "Use the default vnem MCP server first for read-only recommendation, quality gates, and orchestration. Use this server only after the task contract requires mutation or verification.",
      "Before writing framework-specific code, call mcp_fetch_documentation for the relevant library and inject the returned context_injection into the worker task.",
      "Before manually traversing a large repo, call mcp_semantic_code_search with the concept you need to locate.",
      "Before adding feature or logic code, write or identify the automated test first, run mcp_run_verification_tests with phase=red when the test should fail, patch with mcp_apply_diff_patch, then rerun with phase=green until pass or max attempts.",
      "Use mcp_execute_ephemeral_script only for short local data parsing or one-off transformation helpers; scripts run in a temporary sandbox, are deleted afterward, and are not a general shell.",
      "Never rewrite entire files for small edits. Use mcp_apply_diff_patch with dry_run first, then apply only after the exact context was verified.",
      "Use mcp_execute_terminal_command for bounded build/test/check feedback only. It is stateful by cwd but not a raw interactive shell."
    ].join(" ")
  }
);

registerPrecisionTools(server);
await server.connect(new StdioServerTransport());

function registerPrecisionTools(mcpServer) {
  mcpServer.registerTool(
    "mcp_semantic_code_search",
    {
      title: "Semantic Code Search",
      description:
        "Search the active workspace by concept using a local private hashed-vector code index. Returns file paths, line numbers, snippets, scores, matched terms, and index metadata without external embedding APIs.",
      inputSchema: {
        query: z.string().min(1).describe("Conceptual code question, such as where player collision physics is handled."),
        limit: z.number().int().min(1).max(30).default(8),
        include_snippets: z.boolean().default(true).describe("Include matching code snippets in the result."),
        refresh: z.boolean().default(false).describe("Force a fresh workspace index rebuild before searching.")
      },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => {
      try {
        const result = await semanticIndex.search(args.query, {
          limit: args.limit,
          includeSnippets: args.include_snippets,
          refresh: args.refresh
        });
        return toolResult(formatSemanticSearchResult(result), { semantic_code_search: result });
      } catch (error) {
        return precisionErrorResult(error);
      }
    }
  );

  mcpServer.registerTool(
    "mcp_apply_diff_patch",
    {
      title: "Apply Exact Diff Patch",
      description:
        "Apply a surgical text patch inside the configured workspace. Accepts a SEARCH/REPLACE block or unified diff, verifies exact context before writing, and rejects mismatches instead of rewriting whole files.",
      inputSchema: {
        target_path: z.string().min(1).describe("Workspace-relative file path to patch."),
        mode: z.enum(["search_replace", "unified_diff"]).default("search_replace"),
        block: z
          .string()
          .optional()
          .describe("SEARCH:/REPLACE: block for search_replace mode, or unified diff text for unified_diff mode."),
        search: z.string().optional().describe("Exact old code for search_replace mode."),
        replace: z.string().optional().describe("Replacement code for search_replace mode."),
        unified_diff: z.string().optional().describe("Unified diff hunk text for unified_diff mode."),
        dry_run: z
          .boolean()
          .default(true)
          .describe("Verify the patch without writing. Default true; set false only after review/approval."),
        expected_occurrences: z
          .number()
          .int()
          .min(1)
          .max(20)
          .default(1)
          .describe("Exact expected match count for SEARCH content."),
        allow_multiple: z.boolean().default(false).describe("Apply the replacement to all exact matches instead of one expected match."),
        worker_id: z.string().default("default").describe("Worker id used for documentation-readiness checks."),
        task_id: z.string().default("default").describe("Task id used for documentation-readiness checks."),
        required_documentation: z
          .array(z.string())
          .default([])
          .describe("Libraries that must have been fetched with mcp_fetch_documentation before this write is allowed.")
      },
      annotations: READ_WRITE_PRECISE
    },
    async (args) => {
      try {
        const missingDocs = (args.required_documentation || []).filter(
          (library) => !documentationStore.hasDocumentation({ workerId: args.worker_id, taskId: args.task_id, library })
        );
        if (missingDocs.length) {
          return errorResult("Patch blocked because required documentation has not been fetched for this worker/task.", {
            code: "required_documentation_missing",
            missing_documentation: missingDocs,
            next_action: "Call mcp_fetch_documentation for each missing library, then retry the patch."
          });
        }

        const result = await applyDiffPatch({
          workspaceRoot,
          targetPath: args.target_path,
          mode: args.mode,
          block: args.block,
          search: args.search,
          replace: args.replace,
          unifiedDiff: args.unified_diff,
          dryRun: args.dry_run,
          expectedOccurrences: args.expected_occurrences,
          allowMultiple: args.allow_multiple
        });
        return toolResult(formatPatchResult(result), { patch: result });
      } catch (error) {
        return precisionErrorResult(error);
      }
    }
  );

  mcpServer.registerTool(
    "mcp_fetch_documentation",
    {
      title: "Fetch Current Documentation",
      description:
        "Fetch HTTPS documentation for a framework/library, normalize it into compact worker context, and record it as read-before-write evidence for the current worker/task.",
      inputSchema: {
        library: z.string().min(1).describe("Library/framework name, such as React, Vite, Phaser, Three.js, Luau, or Playwright."),
        topic: z.string().optional().describe("Optional topic hint when a known source has topic-specific routes."),
        url: z.string().url().optional().describe("Optional specific HTTPS documentation URL when the built-in registry is not enough."),
        version: z.string().optional().describe("Optional version note to keep with the fetched context."),
        max_bytes: z.number().int().min(1024).max(512000).default(262144),
        worker_id: z.string().default("default"),
        task_id: z.string().default("default")
      },
      annotations: READ_ONLY_NETWORK
    },
    async (args) => {
      try {
        const result = await fetchDocumentation({
          library: args.library,
          topic: args.topic,
          url: args.url,
          version: args.version,
          maxBytes: args.max_bytes,
          fetchImpl: documentationFetchImpl()
        });
        const record = documentationStore.recordFetch({
          workerId: args.worker_id,
          taskId: args.task_id,
          documentation: result.documentation
        });
        return toolResult(formatDocumentationResult(result, record), {
          ...result,
          worker_id: args.worker_id,
          task_id: args.task_id,
          record
        });
      } catch (error) {
        return precisionErrorResult(error);
      }
    }
  );

  mcpServer.registerTool(
    "mcp_execute_terminal_command",
    {
      title: "Execute Safe Stateful Terminal Command",
      description:
        "Run one allowlisted build/test/check command in a persistent workspace-scoped session. Captures stdout/stderr, preserves cwd between calls, blocks shell operators/destructive commands, and reports timeouts instead of crashing.",
      inputSchema: {
        command: z.string().min(1).describe("One safe command, for example npm run build, npm test, node --check file.js, git status, cargo test, or go test ./..."),
        session_id: z.string().default("default").describe("Stateful terminal session id."),
        working_directory: z.string().optional().describe("Optional workspace-relative cwd for this command and future session commands."),
        timeout_ms: z.number().int().min(1000).max(120000).default(30000)
      },
      annotations: READ_WRITE_PRECISE
    },
    async (args) => {
      try {
        const session = getTerminalSession(args.session_id);
        const result = await session.execute(args.command, {
          workingDirectory: args.working_directory,
          timeoutMs: args.timeout_ms
        });
        return toolResult(formatTerminalResult(result), { execution: result });
      } catch (error) {
        return precisionErrorResult(error);
      }
    }
  );

  mcpServer.registerTool(
    "mcp_run_verification_tests",
    {
      title: "Run Verification Tests",
      description:
        "Run a bounded test/check command as part of VNEM's test-driven healing loop. Use phase=red to prove the test fails before implementation, then phase=green after mcp_apply_diff_patch until pass or max_attempts is reached.",
      inputSchema: {
        command: z.string().min(1).describe("One allowlisted verification command, for example npm test, npm run test, node --check src/file.js, or python -m pytest."),
        task_id: z.string().default("default").describe("Stable feature/bug task id used to track loop attempts."),
        phase: z.enum(["red", "green", "check"]).default("green").describe("red expects failure before implementation; green/check expects success."),
        session_id: z.string().default("default").describe("Stateful terminal session id."),
        working_directory: z.string().optional().describe("Optional workspace-relative cwd for this command and future session commands."),
        timeout_ms: z.number().int().min(1000).max(120000).default(30000),
        max_attempts: z.number().int().min(1).max(5).default(5),
        reset: z.boolean().default(false).describe("Reset this task_id's verification loop before running.")
      },
      annotations: READ_WRITE_PRECISE
    },
    async (args) => {
      try {
        const session = getTerminalSession(args.session_id);
        const result = await runVerificationTests({
          workspaceRoot,
          command: args.command,
          taskId: args.task_id,
          phase: args.phase,
          maxAttempts: args.max_attempts,
          reset: args.reset,
          store: verificationLoops,
          session,
          workingDirectory: args.working_directory,
          timeoutMs: args.timeout_ms
        });
        return toolResult(formatVerificationResult(result), { verification: result });
      } catch (error) {
        return precisionErrorResult(error);
      }
    }
  );

  mcpServer.registerTool(
    "mcp_execute_ephemeral_script",
    {
      title: "Execute Ephemeral Script",
      description:
        "Run a short one-off Node or Python helper in a temporary workspace-local sandbox, capture stdout/stderr, then delete the script and sandbox. Blocks dangerous APIs, process spawning, network APIs, and shell scripts unless explicitly allowed after review.",
      inputSchema: {
        language: z.enum(["node", "python", "shell"]).default("node"),
        script: z.string().min(1).describe("Temporary script body. Keep it narrow, deterministic, and local."),
        args: z.array(z.string()).default([]).describe("Optional plain string arguments passed to the temporary script."),
        input_text: z.string().default("").describe("Optional stdin text for the temporary script."),
        timeout_ms: z.number().int().min(1000).max(60000).default(15000),
        allow_shell: z.boolean().default(false).describe("Shell scripts are blocked by default; enable only after explicit review.")
      },
      annotations: READ_WRITE_PRECISE
    },
    async (args) => {
      try {
        const result = await executeEphemeralScript({
          workspaceRoot,
          language: args.language,
          script: args.script,
          args: args.args,
          inputText: args.input_text,
          timeoutMs: args.timeout_ms,
          allowShell: args.allow_shell
        });
        return toolResult(formatEphemeralScriptResult(result), { ephemeral_script: result });
      } catch (error) {
        return precisionErrorResult(error);
      }
    }
  );
}

function getTerminalSession(sessionId) {
  const key = sessionId || "default";
  if (!terminalSessions.has(key)) {
    terminalSessions.set(key, new StatefulTerminalSession({ workspaceRoot }));
  }
  return terminalSessions.get(key);
}

function documentationFetchImpl() {
  const fixture = process.env.VNEM_PRECISION_TEST_DOC_TEXT;
  if (!fixture) {
    return undefined;
  }
  return async () => ({
    ok: true,
    status: 200,
    headers: {
      get: () => process.env.VNEM_PRECISION_TEST_DOC_CONTENT_TYPE || "text/markdown"
    },
    text: async () => fixture
  });
}

function formatPatchResult(result) {
  return [
    `mcp_apply_diff_patch: ${result.applied ? "applied" : "verified"} ${result.target_path}`,
    `Mode: ${result.mode}`,
    `Dry run: ${result.dry_run}`,
    `SHA-256: ${result.before_sha256.slice(0, 12)} -> ${result.after_sha256.slice(0, 12)}`,
    `Changed ranges: ${result.changed_ranges.map((range) => `old ${range.old_start_line}+${range.old_line_count} / new ${range.new_start_line ?? range.old_start_line}+${range.new_line_count}`).join("; ")}`,
    result.message
  ].join("\n");
}

function formatSemanticSearchResult(result) {
  const lines = [
    `mcp_semantic_code_search: ${result.results.length} result(s) for "${result.query}"`,
    `Index: ${result.indexed.files} file(s), ${result.indexed.chunks} chunk(s), ${result.vector_store.engine}`,
    `Generated: ${result.vector_store.generated_at || "unknown"}`,
    ""
  ];
  for (const item of result.results) {
    lines.push(
      `- ${item.target_path}:${item.start_line}-${item.end_line} score ${item.score}${item.matched_terms?.length ? ` terms ${item.matched_terms.join(", ")}` : ""}`
    );
    if (item.snippet) {
      lines.push(indentSnippet(item.snippet, 4));
    }
  }
  if (!result.results.length) {
    lines.push("- No semantic matches found. Try a more concrete concept or refresh the index.");
  }
  lines.push("", result.policy);
  return lines.join("\n");
}

function formatDocumentationResult(result, record) {
  return [
    `mcp_fetch_documentation: fetched ${result.documentation.library}`,
    `URL: ${result.documentation.url}`,
    `Bytes: ${result.documentation.bytes}`,
    `SHA-256: ${result.documentation.sha256.slice(0, 16)}`,
    `Stored for worker/task: ${record.worker_id}/${record.task_id}`,
    "",
    "Context injection is available in structuredContent.context_injection and should be placed into the worker context before writing code."
  ].join("\n");
}

function formatTerminalResult(result) {
  const status = result.timed_out ? "timed out" : result.ok ? "passed" : "failed";
  return [
    `mcp_execute_terminal_command: ${status}`,
    `Command: ${result.command}`,
    `CWD: ${result.cwd}`,
    `Exit: ${result.exit_code ?? "none"}${result.signal ? ` signal ${result.signal}` : ""}`,
    `Duration: ${result.duration_ms}ms`,
    result.stdout ? `\nstdout:\n${result.stdout.trimEnd()}` : "",
    result.stderr ? `\nstderr:\n${result.stderr.trimEnd()}` : ""
  ].filter(Boolean).join("\n");
}

function formatVerificationResult(result) {
  const status = result.verdict;
  const lines = [
    `mcp_run_verification_tests: ${status}`,
    `Task: ${result.task_id}`,
    `Phase: ${result.phase}`,
    `Attempt: ${result.attempt}/${result.max_attempts}`
  ];
  if (result.execution) {
    lines.push(
      `Command: ${result.execution.command}`,
      `CWD: ${result.execution.cwd}`,
      `Exit: ${result.execution.exit_code ?? "none"}${result.execution.signal ? ` signal ${result.execution.signal}` : ""}`,
      `Duration: ${result.execution.duration_ms}ms`
    );
    if (result.execution.stdout) {
      lines.push(`\nstdout:\n${result.execution.stdout.trimEnd()}`);
    }
    if (result.execution.stderr) {
      lines.push(`\nstderr:\n${result.execution.stderr.trimEnd()}`);
    }
  } else if (result.reason) {
    lines.push(`Reason: ${result.reason}`);
  }
  if (result.healing_loop?.next_actions?.length) {
    lines.push("", `Healing loop: ${result.healing_loop.status}`);
    for (const action of result.healing_loop.next_actions) {
      lines.push(`- ${action}`);
    }
  }
  return lines.join("\n");
}

function formatEphemeralScriptResult(result) {
  const status = result.execution.timed_out ? "timed out" : result.execution.ok ? "passed" : "failed";
  return [
    `mcp_execute_ephemeral_script: ${status}`,
    `Language: ${result.language}`,
    `Run id: ${result.run_id}`,
    `Exit: ${result.execution.exit_code ?? "none"}${result.execution.signal ? ` signal ${result.execution.signal}` : ""}`,
    `Duration: ${result.execution.duration_ms}ms`,
    `Deleted: script=${result.sandbox.cleanup.script_deleted} sandbox=${result.sandbox.cleanup.sandbox_deleted}`,
    result.execution.stdout ? `\nstdout:\n${result.execution.stdout.trimEnd()}` : "",
    result.execution.stderr ? `\nstderr:\n${result.execution.stderr.trimEnd()}` : "",
    "",
    result.policy
  ].filter(Boolean).join("\n");
}

function indentSnippet(value, spaces) {
  const pad = " ".repeat(spaces);
  return String(value)
    .split("\n")
    .slice(0, 24)
    .map((line) => `${pad}${line}`)
    .join("\n");
}

function toolResult(text, structuredContent) {
  return {
    content: [{ type: "text", text }],
    structuredContent
  };
}

function precisionErrorResult(error) {
  if (error instanceof PrecisionExecutionError) {
    return errorResult(error.message, {
      code: error.code,
      details: error.details
    });
  }
  return errorResult(error?.message || String(error), {
    code: "unexpected_precision_error"
  });
}

function errorResult(text, structuredContent = {}) {
  return {
    isError: true,
    content: [{ type: "text", text }],
    structuredContent: {
      error: text,
      ...structuredContent
    }
  };
}
