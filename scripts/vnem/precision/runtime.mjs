import path from "node:path";
import {
  PatchTransactionStore,
  PrecisionExecutionError,
  StatefulTerminalSession,
  sha256
} from "./execution.mjs";
import {
  DocumentationCache,
  DocumentationContextStore,
  documentationSourceCatalog,
  fetchDocumentation
} from "./documentation-intelligence.mjs";
import {
  CodebaseSemanticIndex,
  VerificationLoopStore,
  executeEphemeralScript,
  runVerificationTests
} from "./intelligence.mjs";

export class PrecisionRuntime {
  constructor(options = {}) {
    this.workspaceRoot = path.resolve(options.workspaceRoot || process.cwd());
    this.runtimeRoot = options.runtimeRoot || path.join(this.workspaceRoot, ".vnem-runtime", "precision");
    this.fetchImpl = options.fetchImpl || documentationFetchImpl();
    this.documentationCache = new DocumentationCache({
      ...options.documentationCache,
      cachePath: options.documentationCache?.cachePath || path.join(this.runtimeRoot, "documentation-cache.json")
    });
    this.documentationStore = new DocumentationContextStore(options.documentationStore);
    this.terminalSessions = new Map();
    this.verificationLoops = new VerificationLoopStore({
      ...options.verificationStore,
      statePath: options.verificationStore?.statePath || path.join(this.runtimeRoot, "verification-loops.json")
    });
    this.patchTransactions = new PatchTransactionStore({
      workspaceRoot: this.workspaceRoot,
      stateRoot: path.join(this.runtimeRoot, "patch-transactions")
    });
    this.semanticIndex = null;
  }

  getSemanticIndex() {
    if (!this.semanticIndex) {
      this.semanticIndex = new CodebaseSemanticIndex({
        workspaceRoot: this.workspaceRoot,
        indexPath: path.join(this.runtimeRoot, "code-index.json")
      });
    }
    return this.semanticIndex;
  }

  async semanticSearch(args = {}) {
    return await this.getSemanticIndex().search(args.query, {
      limit: args.limit,
      includeSnippets: args.include_snippets,
      refresh: args.refresh
    });
  }

  indexStatus() {
    return this.semanticIndex
      ? this.semanticIndex.status()
      : {
          initialized: false,
          workspace_root: this.workspaceRoot,
          index_path: ".vnem-runtime/precision/code-index.json",
          files: 0,
          chunks: 0,
          generated_at: null,
          watch_enabled: false,
          dirty: true,
          pending_incremental_paths: 0,
          last_error: null
        };
  }

  async applyPatch(args = {}) {
    this.assertDocumentationReady(args);
    const transaction = await this.patchTransactions.apply({
      dryRun: args.dry_run !== false,
      transactionId: args.transaction_id,
      patches: [normalizePatch(args)]
    });
    return { patch: transaction.patches[0], transaction };
  }

  async applyPatchTransaction(args = {}) {
    this.assertDocumentationReady(args);
    const transaction = await this.patchTransactions.apply({
      dryRun: args.dry_run !== false,
      transactionId: args.transaction_id,
      patches: (args.patches || []).map(normalizePatch)
    });
    return { transaction };
  }

  async rollbackPatchTransaction(args = {}) {
    return await this.patchTransactions.rollback({
      transactionId: args.transaction_id,
      force: args.force === true
    });
  }

  async fetchDocumentation(args = {}) {
    const result = await fetchDocumentation({
      library: args.library,
      topic: args.topic,
      query: args.query,
      url: args.url,
      version: args.version,
      maxBytes: args.max_bytes,
      contextChars: args.context_chars,
      maxSections: args.max_sections,
      maxAgeSeconds: args.max_age_seconds,
      cacheMode: args.cache_mode,
      allowCommunity: args.allow_community,
      timeoutMs: args.timeout_ms,
      cache: this.documentationCache,
      fetchImpl: this.fetchImpl
    });
    const record = this.documentationStore.recordFetch({
      workerId: args.worker_id,
      taskId: args.task_id,
      documentation: result.documentation
    });
    return { ...result, worker_id: args.worker_id, task_id: args.task_id, record };
  }

  documentationContext(args = {}) {
    const records = this.documentationStore.list({
      workerId: args.worker_id,
      taskId: args.task_id,
      library: args.library,
      includeCommunity: args.include_community !== false
    });
    const contradictions = this.documentationStore.contradictions({
      workerId: args.worker_id,
      taskId: args.task_id,
      library: args.library,
      includeCommunity: args.include_community !== false
    });
    const contextInjection = this.documentationStore.buildContextInjection({
      workerId: args.worker_id,
      taskId: args.task_id,
      library: args.library,
      includeCommunity: args.include_community !== false,
      maxContextChars: args.max_context_chars
    });
    return {
      ok: true,
      operation_result: "documentation_context_built",
      worker_id: args.worker_id || null,
      task_id: args.task_id || null,
      library: args.library || null,
      record_count: records.length,
      records,
      contradiction_count: contradictions.length,
      contradictions,
      context_injection: contextInjection,
      context_chars: contextInjection.length,
      context_sha256: sha256(contextInjection),
      full_pages_injected: false
    };
  }

  async documentationCacheStatus(args = {}) {
    return await this.documentationCache.status({
      library: args.library,
      url: args.url,
      max_age_seconds: args.max_age_seconds
    });
  }

  documentationSourceCatalog(args = {}) {
    return documentationSourceCatalog({ library: args.library });
  }

  async executeTerminal(args = {}) {
    return await this.getTerminalSession(args.session_id).execute(args.command, {
      workingDirectory: args.working_directory,
      timeoutMs: args.timeout_ms
    });
  }

  async runVerification(args = {}) {
    return await runVerificationTests({
      workspaceRoot: this.workspaceRoot,
      command: args.command,
      taskId: args.task_id,
      phase: args.phase,
      maxAttempts: args.max_attempts,
      reset: args.reset,
      store: this.verificationLoops,
      session: this.getTerminalSession(args.session_id),
      workingDirectory: args.working_directory,
      timeoutMs: args.timeout_ms
    });
  }

  async executeEphemeral(args = {}) {
    return await executeEphemeralScript({
      workspaceRoot: this.workspaceRoot,
      language: args.language,
      script: args.script,
      args: args.args,
      inputText: args.input_text,
      timeoutMs: args.timeout_ms,
      allowShell: args.allow_shell
    });
  }

  getTerminalSession(sessionId = "default") {
    const key = String(sessionId || "default");
    if (!this.terminalSessions.has(key)) {
      this.terminalSessions.set(key, new StatefulTerminalSession({ workspaceRoot: this.workspaceRoot }));
    }
    return this.terminalSessions.get(key);
  }

  assertDocumentationReady(args = {}) {
    const missing = (args.required_documentation || []).filter(
      (library) => !this.documentationStore.hasDocumentation({ workerId: args.worker_id, taskId: args.task_id, library })
    );
    if (missing.length) {
      throw new PrecisionExecutionError(
        "Patch blocked because required documentation has not been fetched for this worker/task.",
        "required_documentation_missing",
        {
          missing_documentation: missing,
          next_action: "Fetch each missing library for this worker/task, then retry the patch."
        }
      );
    }
  }

  close() {
    this.semanticIndex?.close();
  }
}

function normalizePatch(patch = {}) {
  return {
    targetPath: patch.target_path,
    mode: patch.mode,
    block: patch.block,
    search: patch.search,
    replace: patch.replace,
    unifiedDiff: patch.unified_diff,
    expectedOccurrences: patch.expected_occurrences,
    allowMultiple: patch.allow_multiple,
    expectedBeforeSha256: patch.expected_before_sha256
  };
}

function documentationFetchImpl() {
  const responseFixtures = parseResponseFixtures(process.env.VNEM_PRECISION_TEST_DOC_RESPONSES);
  const fixture = process.env.VNEM_PRECISION_TEST_DOC_TEXT;
  if (!responseFixtures && !fixture) return undefined;
  const callCounts = new Map();
  return async (url) => {
    let responseFixture;
    if (responseFixtures) {
      const candidate = responseFixtures[url] ?? responseFixtures["*"];
      const sequence = Array.isArray(candidate) ? candidate : [candidate];
      const callIndex = callCounts.get(url) || 0;
      responseFixture = sequence[Math.min(callIndex, sequence.length - 1)];
      callCounts.set(url, callIndex + 1);
    }
    const body = String(responseFixture?.body ?? fixture ?? "");
    const status = Number(responseFixture?.status ?? 200);
    const responseHeaders = Object.fromEntries(Object.entries(responseFixture?.headers || {
      "content-type": process.env.VNEM_PRECISION_TEST_DOC_CONTENT_TYPE || "text/markdown"
    }).map(([name, value]) => [name.toLowerCase(), String(value)]));
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (name) => responseHeaders[String(name).toLowerCase()] || null },
      text: async () => body,
      arrayBuffer: async () => Buffer.from(body, "utf8")
    };
  };
}

function parseResponseFixtures(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}
