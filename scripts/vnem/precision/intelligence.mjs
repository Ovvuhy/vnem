import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, watch, writeFileSync } from "node:fs";
import { mkdir, readdir, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrecisionExecutionError, StatefulTerminalSession } from "./execution.mjs";

const DEFAULT_DIMENSIONS = 384;
const DEFAULT_CHUNK_LINES = 80;
const DEFAULT_CHUNK_OVERLAP = 12;
const DEFAULT_MAX_FILE_BYTES = 512 * 1024;
const DEFAULT_MAX_SCRIPT_BYTES = 64 * 1024;
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_MAX_TIMEOUT_MS = 60000;
const DEFAULT_MAX_OUTPUT_BYTES = 96 * 1024;
const INDEX_SCHEMA_VERSION = "1.1.0";

const TEXT_EXTENSIONS = new Set([
  ".astro",
  ".c",
  ".cc",
  ".clj",
  ".cpp",
  ".cs",
  ".css",
  ".csv",
  ".go",
  ".graphql",
  ".h",
  ".hpp",
  ".html",
  ".java",
  ".js",
  ".json",
  ".jsx",
  ".kt",
  ".lua",
  ".luau",
  ".mjs",
  ".md",
  ".mdx",
  ".php",
  ".py",
  ".rb",
  ".rs",
  ".scss",
  ".svelte",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".vue",
  ".xml",
  ".yaml",
  ".yml"
]);

const EXCLUDED_DIRECTORIES = new Set([
  ".cache",
  ".git",
  ".next",
  ".nuxt",
  ".playwright-cli",
  ".svelte-kit",
  ".tmp",
  ".turbo",
  ".vnem-runtime",
  "build",
  "coverage",
  "dist",
  "landing-dist",
  "node_modules",
  "out",
  "output",
  "site"
]);

const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "how",
  "i",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "this",
  "to",
  "use",
  "using",
  "we",
  "with"
]);

const CONCEPT_SYNONYMS = new Map([
  ["physics", ["collision", "collider", "rigidbody", "velocity", "gravity", "movement"]],
  ["collision", ["physics", "collider", "hitbox", "intersect", "overlap"]],
  ["player", ["avatar", "character", "controlled", "hero"]],
  ["auth", ["authentication", "authorization", "token", "jwt", "session", "login"]],
  ["token", ["auth", "jwt", "secret", "credential", "bearer"]],
  ["component", ["ui", "view", "widget", "tsx", "jsx"]],
  ["deprecated", ["legacy", "old", "remove", "obsolete", "migration"]],
  ["settings", ["configuration", "preferences", "options", "profile", "toggle"]],
  ["performance", ["fast", "fps", "latency", "optimize", "memory", "render"]],
  ["test", ["spec", "assert", "verify", "verification", "expect"]],
  ["database", ["db", "sql", "query", "schema", "migration"]]
]);

const DANGEROUS_SCRIPT_RULES = [
  {
    code: "process_spawn_blocked",
    reason: "Process spawning is blocked for ephemeral scripts.",
    pattern: /\b(child_process|subprocess|popen|spawn\s*\(|exec\s*\(|execSync|spawnSync|os\.system|Start-Process|Invoke-Expression|iex\b)\b/i
  },
  {
    code: "destructive_filesystem_api_blocked",
    reason: "Destructive filesystem APIs are blocked for ephemeral scripts.",
    pattern: /\b(fs\.(rm|rmdir|unlink|rename|writeFile|appendFile|mkdir)|shutil\.rmtree|os\.(remove|unlink|rmdir|rename)|Path\([^)]*\)\.(unlink|rmdir|rename)|Remove-Item|Set-Content|Add-Content|del\s+|erase\s+|rmdir\s+|rm\s+-)/i
  },
  {
    code: "network_api_blocked",
    reason: "Network APIs are blocked for local ephemeral scripts.",
    pattern: /\b(fetch\s*\(|XMLHttpRequest|requests\.|urllib\.request|http\.|https\.|net\.|socket|curl\s+|wget\s+|Invoke-WebRequest)\b/i
  },
  {
    code: "eval_blocked",
    reason: "Dynamic evaluation is blocked for ephemeral scripts.",
    pattern: /\b(eval\s*\(|Function\s*\(|vm\.runIn|compile\s*\(|exec\s*\()/i
  },
  {
    code: "system_path_blocked",
    reason: "System and parent-directory paths are blocked for ephemeral scripts.",
    pattern: /(\.\.[/\\]|\bC:\\Windows\b|\bC:\\Users\b|\/etc\/|\/var\/|\/usr\/|\/bin\/|\/home\/)/i
  }
];

export class CodebaseSemanticIndex {
  constructor(options = {}) {
    this.workspaceRoot = path.resolve(options.workspaceRoot || process.cwd());
    this.dimensions = options.dimensions || DEFAULT_DIMENSIONS;
    this.chunkLines = options.chunkLines || DEFAULT_CHUNK_LINES;
    this.chunkOverlap = options.chunkOverlap || DEFAULT_CHUNK_OVERLAP;
    this.maxFileBytes = options.maxFileBytes || DEFAULT_MAX_FILE_BYTES;
    this.indexPath =
      options.indexPath || path.join(this.workspaceRoot, ".vnem-runtime", "code-index.json");
    this.state = null;
    this.indexPromise = null;
    this.dirty = true;
    this.lastError = null;
    this.watchers = [];
    this.watchEnabled = false;
    this.dirtyPaths = new Set();
    this.maxIncrementalFiles = options.maxIncrementalFiles || 200;
  }

  startBackgroundIndex(options = {}) {
    if (options.watch !== false && !this.watchEnabled) {
      this.startWatcher();
    }
    if (!this.indexPromise) {
      this.indexPromise = this.rebuild().finally(() => {
        this.indexPromise = null;
      });
    }
    return this.indexPromise;
  }

  startWatcher() {
    try {
      const watcher = watch(this.workspaceRoot, { recursive: true }, (_eventType, fileName) => {
        if (!fileName || shouldIgnoreRelativePath(String(fileName))) {
          return;
        }
        this.dirty = true;
        this.dirtyPaths.add(normalizeRelative(String(fileName)));
      });
      watcher.unref?.();
      this.watchers.push(watcher);
      this.watchEnabled = true;
      return true;
    } catch (error) {
      this.watchEnabled = false;
      this.lastError = {
        code: "watch_unavailable",
        message: error.message
      };
      return false;
    }
  }

  async search(query, options = {}) {
    const queryText = String(query || "").trim();
    if (!queryText) {
      throw new PrecisionExecutionError("query is required.", "missing_semantic_query");
    }

    await this.ensureFresh({ refresh: Boolean(options.refresh) });
    const limit = clampInteger(options.limit || 8, 1, 30);
    const includeSnippets = options.includeSnippets !== false;
    const queryTerms = expandConceptTerms(tokenizeSemantic(queryText));
    const queryVector = embedTerms(queryTerms, this.dimensions);

    const results = (this.state?.chunks || [])
      .map((chunk) => {
        const score = semanticScore({ chunk, queryVector, queryTerms });
        const matchedTerms = chunk.terms.filter((term) => queryTerms.includes(term)).slice(0, 12);
        return {
          target_path: chunk.path,
          start_line: chunk.start_line,
          end_line: chunk.end_line,
          score: Number(score.toFixed(4)),
          matched_terms: matchedTerms,
          snippet: includeSnippets ? chunk.snippet : undefined,
          language: chunk.language || "text",
          symbols: chunk.symbols || []
        };
      })
      .filter((result) => result.score > 0.08)
      .sort((a, b) => b.score - a.score || a.target_path.localeCompare(b.target_path))
      .slice(0, limit);

    return {
      ok: true,
      query: queryText,
      workspace_root: this.state?.workspace_root || this.workspaceRoot,
      vector_store: {
        engine: "vnem-local-hashed-vector-index",
        storage: normalizeRelative(path.relative(this.workspaceRoot, this.indexPath)),
        external_api: false,
        dimensions: this.dimensions,
        generated_at: this.state?.generated_at || null,
        watch_enabled: this.watchEnabled,
        dirty: this.dirty,
        last_error: this.lastError
      },
      indexed: {
        files: this.state?.files?.length || 0,
        chunks: this.state?.chunks?.length || 0
      },
      results,
      policy:
        "Use semantic search before manual file traversal on large repos. Results are local/private hashed vectors plus lexical reranking, not external embeddings."
    };
  }

  async ensureFresh(options = {}) {
    if (this.indexPromise) {
      await this.indexPromise;
    }
    if (!this.watchEnabled) this.startWatcher();
    if (!this.state) await this.loadPersistedState();
    if (!this.state || options.refresh) {
      await this.rebuild();
      return;
    }
    if (this.dirty) {
      if (this.dirtyPaths.size > 0 && this.dirtyPaths.size <= this.maxIncrementalFiles) await this.refreshChangedFiles();
      else await this.rebuild();
      return;
    }
    if (!this.watchEnabled && (await this.isStale())) {
      await this.rebuild();
    }
  }

  async loadPersistedState() {
    try {
      const parsed = JSON.parse(await readFile(this.indexPath, "utf8"));
      const root = await realpath(this.workspaceRoot);
      if (parsed.schema_version !== INDEX_SCHEMA_VERSION || !samePath(parsed.workspace_root, root)) return false;
      this.state = parsed;
      this.workspaceRoot = root;
      this.dirty = await this.isStale();
      return true;
    } catch {
      return false;
    }
  }

  async refreshChangedFiles() {
    const changedPaths = [...this.dirtyPaths];
    const root = await realpath(this.workspaceRoot);
    const filesByPath = new Map((this.state?.files || []).map((file) => [file.path, file]));
    const chunksByPath = new Map();
    for (const chunk of this.state?.chunks || []) {
      if (!chunksByPath.has(chunk.path)) chunksByPath.set(chunk.path, []);
      chunksByPath.get(chunk.path).push(chunk);
    }

    for (const relativePath of changedPaths) {
      const normalized = normalizeRelative(relativePath);
      if (!normalized || shouldIgnoreRelativePath(normalized)) continue;
      const absolutePath = path.resolve(root, normalized);
      if (!isInsidePath(root, absolutePath)) continue;
      filesByPath.delete(normalized);
      chunksByPath.delete(normalized);
      try {
        const resolved = await realpath(absolutePath);
        if (!samePath(resolved, absolutePath) || !isInsidePath(root, resolved) || !isTextPath(normalized)) continue;
        const info = await stat(resolved);
        if (!info.isFile() || info.size > this.maxFileBytes) continue;
        const buffer = await readFile(resolved);
        if (buffer.includes(0)) continue;
        const file = { path: normalized, size: info.size, mtime_ms: info.mtimeMs };
        filesByPath.set(normalized, file);
        chunksByPath.set(normalized, chunkFile(normalized, buffer.toString("utf8"), {
          chunkLines: this.chunkLines,
          chunkOverlap: this.chunkOverlap,
          dimensions: this.dimensions
        }));
      } catch (error) {
        if (error?.code !== "ENOENT") this.lastError = { code: "incremental_index_failed", path: normalized, message: error.message };
      }
    }

    const state = {
      schema_version: INDEX_SCHEMA_VERSION,
      generated_at: new Date().toISOString(),
      workspace_root: root,
      files: [...filesByPath.values()].sort((a, b) => a.path.localeCompare(b.path)),
      chunks: [...chunksByPath.values()].flat().sort((a, b) => a.path.localeCompare(b.path) || a.start_line - b.start_line)
    };
    await this.persistState(state);
    this.state = state;
    this.dirty = false;
    this.dirtyPaths.clear();
    return state;
  }

  async isStale() {
    if (!this.state?.files) {
      return true;
    }
    const current = await collectIndexableFiles(this.workspaceRoot, {
      maxFileBytes: this.maxFileBytes
    });
    if (current.length !== this.state.files.length) {
      return true;
    }
    const previous = new Map(this.state.files.map((file) => [file.path, file]));
    for (const file of current) {
      const old = previous.get(file.path);
      if (!old || old.size !== file.size || Math.trunc(old.mtime_ms) !== Math.trunc(file.mtime_ms)) {
        return true;
      }
    }
    return false;
  }

  async rebuild() {
    const root = await realpath(this.workspaceRoot);
    this.workspaceRoot = root;
    const files = await collectIndexableFiles(root, {
      maxFileBytes: this.maxFileBytes
    });
    const indexedFiles = await mapConcurrent(files, 8, async (file) => {
      let text;
      try {
        const buffer = await readFile(path.join(root, file.path));
        if (buffer.includes(0)) {
          return [];
        }
        text = buffer.toString("utf8");
      } catch (error) {
        this.lastError = {
          code: "index_read_failed",
          path: file.path,
          message: error.message
        };
        return [];
      }
      return chunkFile(file.path, text, {
        chunkLines: this.chunkLines,
        chunkOverlap: this.chunkOverlap,
        dimensions: this.dimensions
      });
    });
    const chunks = indexedFiles.flat();

    const state = {
      schema_version: INDEX_SCHEMA_VERSION,
      generated_at: new Date().toISOString(),
      workspace_root: root,
      files,
      chunks
    };

    await this.persistState(state);
    this.state = state;
    this.dirty = false;
    this.dirtyPaths.clear();
    return state;
  }

  async persistState(state) {
    await mkdir(path.dirname(this.indexPath), { recursive: true });
    const tmpPath = `${this.indexPath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmpPath, JSON.stringify(state, null, 2), "utf8");
    await rename(tmpPath, this.indexPath);
  }

  status() {
    return {
      initialized: Boolean(this.state),
      workspace_root: this.workspaceRoot,
      index_path: normalizeRelative(path.relative(this.workspaceRoot, this.indexPath)),
      files: this.state?.files?.length || 0,
      chunks: this.state?.chunks?.length || 0,
      generated_at: this.state?.generated_at || null,
      watch_enabled: this.watchEnabled,
      dirty: this.dirty,
      pending_incremental_paths: this.dirtyPaths.size,
      last_error: this.lastError
    };
  }

  close() {
    for (const watcher of this.watchers) watcher.close?.();
    this.watchers = [];
    this.watchEnabled = false;
  }
}

export class VerificationLoopStore {
  constructor(options = {}) {
    this.maxRecords = options.maxRecords || 100;
    this.statePath = options.statePath || null;
    this.records = new Map();
    this.load();
  }

  record({ taskId = "default", phase = "green", command, result, maxAttempts }) {
    const key = this.key(taskId);
    const record = this.records.get(key) || {
      task_id: taskId,
      started_at: new Date().toISOString(),
      attempts: []
    };
    record.updated_at = new Date().toISOString();
    record.max_attempts = maxAttempts;
    record.attempts.push({
      ordinal: record.attempts.length + 1,
      phase,
      command,
      verdict: result.verdict,
      exit_code: result.execution?.exit_code ?? null,
      timed_out: Boolean(result.execution?.timed_out),
      recorded_at: new Date().toISOString()
    });
    this.records.set(key, record);
    while (this.records.size > this.maxRecords) {
      this.records.delete(this.records.keys().next().value);
    }
    this.persist();
    return record;
  }

  get(taskId = "default") {
    return this.records.get(this.key(taskId)) || null;
  }

  reset(taskId = "default") {
    const removed = this.records.delete(this.key(taskId));
    if (removed) this.persist();
    return removed;
  }

  key(taskId) {
    return String(taskId || "default");
  }

  load() {
    if (!this.statePath) return;
    try {
      const parsed = JSON.parse(readFileSync(this.statePath, "utf8"));
      for (const record of parsed.records || []) if (record?.task_id) this.records.set(this.key(record.task_id), record);
    } catch (error) {
      if (error?.code !== "ENOENT") this.lastError = error.message;
    }
  }

  persist() {
    if (!this.statePath) return;
    try {
      mkdirSync(path.dirname(this.statePath), { recursive: true });
      const tmpPath = `${this.statePath}.${process.pid}.tmp`;
      writeFileSync(tmpPath, JSON.stringify({ schema_version: "1.0.0", records: [...this.records.values()] }, null, 2), "utf8");
      renameSync(tmpPath, this.statePath);
    } catch (error) {
      this.lastError = error.message;
    }
  }
}

export async function runVerificationTests(options = {}) {
  const {
    command,
    phase = "green",
    taskId = "default",
    maxAttempts = 5,
    reset = false,
    store = new VerificationLoopStore(),
    session = new StatefulTerminalSession({ workspaceRoot: options.workspaceRoot || process.cwd() }),
    workingDirectory,
    timeoutMs
  } = options;

  const commandText = String(command || "").trim();
  if (!commandText) {
    throw new PrecisionExecutionError("command is required.", "missing_verification_command");
  }
  const normalizedPhase = ["red", "green", "check"].includes(phase) ? phase : "green";
  const cappedMaxAttempts = clampInteger(maxAttempts, 1, 5);
  if (reset) {
    store.reset(taskId);
  }

  const previous = store.get(taskId);
  const attempt = (previous?.attempts?.length || 0) + 1;
  if (attempt > cappedMaxAttempts) {
    return {
      ok: false,
      verdict: "blocked",
      phase: normalizedPhase,
      task_id: taskId,
      attempt,
      max_attempts: cappedMaxAttempts,
      execution: null,
      healing_loop: buildHealingLoopAdvice("blocked", normalizedPhase, attempt, cappedMaxAttempts),
      reason: "Verification loop attempt limit was reached before running another command."
    };
  }

  const execution = await session.execute(commandText, {
    workingDirectory,
    timeoutMs
  });
  const verdict = verificationVerdict(execution, normalizedPhase, attempt, cappedMaxAttempts);
  const result = {
    ok: verdict === "pass" || verdict === "red_confirmed",
    verdict,
    phase: normalizedPhase,
    task_id: taskId,
    attempt,
    max_attempts: cappedMaxAttempts,
    execution,
    healing_loop: buildHealingLoopAdvice(verdict, normalizedPhase, attempt, cappedMaxAttempts)
  };
  result.state = store.record({
    taskId,
    phase: normalizedPhase,
    command: commandText,
    result,
    maxAttempts: cappedMaxAttempts
  });
  return result;
}

export async function executeEphemeralScript(options = {}) {
  const {
    workspaceRoot = process.cwd(),
    language = "node",
    script,
    args = [],
    inputText = "",
    timeoutMs = DEFAULT_TIMEOUT_MS,
    allowShell = false,
    maxScriptBytes = DEFAULT_MAX_SCRIPT_BYTES
  } = options;
  const root = await realpath(path.resolve(workspaceRoot));
  const normalizedLanguage = normalizeLanguage(language);
  const scriptText = String(script || "");
  const scriptBytes = Buffer.byteLength(scriptText, "utf8");
  if (!scriptText.trim()) {
    throw new PrecisionExecutionError("script is required.", "missing_ephemeral_script");
  }
  if (scriptBytes > maxScriptBytes) {
    throw new PrecisionExecutionError("Ephemeral script exceeds the configured byte limit.", "ephemeral_script_too_large", {
      bytes: scriptBytes,
      max_script_bytes: maxScriptBytes
    });
  }
  if (normalizedLanguage === "shell" && !allowShell) {
    throw new PrecisionExecutionError("Shell ephemeral scripts are disabled by default. Use node/python or set allow_shell only after review.", "shell_ephemeral_disabled");
  }
  validateEphemeralScript(scriptText, normalizedLanguage);

  const runtimeRoot = path.join(root, ".vnem-runtime", "ephemeral");
  const runId = randomUUID();
  const sandboxDir = path.join(runtimeRoot, runId);
  const fileName = `script.${extensionForLanguage(normalizedLanguage)}`;
  const scriptPath = path.join(sandboxDir, fileName);
  await mkdir(sandboxDir, { recursive: true });
  await writeFile(scriptPath, scriptText, "utf8");

  let execution;
  let cleanup = {
    script_deleted: false,
    sandbox_deleted: false
  };
  try {
    execution = await executeScriptProcess({
      language: normalizedLanguage,
      scriptPath,
      sandboxDir,
      args,
      inputText,
      timeoutMs: clampInteger(timeoutMs, 1000, DEFAULT_MAX_TIMEOUT_MS)
    });
  } finally {
    cleanup = await cleanupSandbox(sandboxDir);
  }

  return {
    ok: execution.ok,
    language: normalizedLanguage,
    run_id: runId,
    timeout_ms: clampInteger(timeoutMs, 1000, DEFAULT_MAX_TIMEOUT_MS),
    sandbox: {
      root: normalizeRelative(path.relative(root, sandboxDir)),
      cleanup
    },
    execution,
    policy:
      "Ephemeral scripts run from an isolated temporary cwd with sanitized environment, bounded timeout, blocked dangerous APIs, and cleanup after execution. This is not a VM boundary."
  };
}

function semanticScore({ chunk, queryVector, queryTerms }) {
  const cosine = dotProduct(queryVector, chunk.vector);
  const chunkTerms = new Set(chunk.terms);
  const pathTerms = new Set(tokenizeSemantic(chunk.path));
  let overlap = 0;
  let pathOverlap = 0;
  for (const term of queryTerms) {
    if (chunkTerms.has(term)) overlap += 1;
    if (pathTerms.has(term)) pathOverlap += 1;
  }
  const termScore = overlap / Math.sqrt(Math.max(queryTerms.length, 1) * Math.max(chunk.terms.length, 1));
  const pathScore = pathOverlap / Math.max(queryTerms.length, 1);
  return cosine * 0.7 + termScore * 0.24 + pathScore * 0.06;
}

async function collectIndexableFiles(root, options = {}) {
  const files = [];
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);
      const relativePath = normalizeRelative(path.relative(root, absolutePath));
      if (!relativePath || shouldIgnoreRelativePath(relativePath)) {
        continue;
      }
      if (entry.isDirectory()) {
        await visit(absolutePath);
        continue;
      }
      if (!entry.isFile() || !isTextPath(relativePath)) {
        continue;
      }
      const info = await stat(absolutePath);
      if (info.size > (options.maxFileBytes || DEFAULT_MAX_FILE_BYTES)) {
        continue;
      }
      files.push({
        path: relativePath,
        size: info.size,
        mtime_ms: info.mtimeMs
      });
    }
  }
  await visit(root);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

function chunkFile(filePath, text, options = {}) {
  const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
  const chunkLines = options.chunkLines || DEFAULT_CHUNK_LINES;
  const overlap = Math.min(options.chunkOverlap || DEFAULT_CHUNK_OVERLAP, chunkLines - 1);
  const step = Math.max(1, chunkLines - overlap);
  const chunks = [];
  for (let start = 0; start < lines.length; start += step) {
    const end = Math.min(lines.length, start + chunkLines);
    const snippet = lines.slice(start, end).join("\n").trimEnd();
    if (!snippet.trim()) {
      continue;
    }
    const terms = expandConceptTerms(tokenizeSemantic(`${filePath}\n${snippet}`));
    const structure = detectCodeStructure(filePath, snippet, start + 1);
    chunks.push({
      id: sha256(`${filePath}:${start + 1}:${end}:${snippet}`).slice(0, 24),
      path: filePath,
      start_line: start + 1,
      end_line: end,
      terms,
      vector: embedTerms(terms, options.dimensions || DEFAULT_DIMENSIONS),
      snippet,
      language: structure.language,
      symbols: structure.symbols
    });
    if (end === lines.length) {
      break;
    }
  }
  return chunks;
}

function detectCodeStructure(filePath, snippet, startLine) {
  const extension = path.extname(filePath).toLowerCase();
  const language = LANGUAGE_BY_EXTENSION.get(extension) || "text";
  const patterns = STRUCTURE_PATTERNS.get(language) || [];
  const symbols = [];
  const lines = snippet.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    for (const pattern of patterns) {
      const match = lines[index].match(pattern);
      if (match?.[1]) symbols.push({ name: match[1], line: startLine + index });
    }
  }
  return { language, symbols: symbols.slice(0, 24) };
}

function tokenizeSemantic(value) {
  const expanded = String(value || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_./\\-]+/g, " ")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9+#]+/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !STOPWORDS.has(token));
  return [...new Set(expanded.flatMap((token) => [token, singularize(token), ...tokenNgrams(token)]))];
}

function expandConceptTerms(terms) {
  const expanded = new Set();
  for (const term of terms || []) {
    if (!term || STOPWORDS.has(term)) {
      continue;
    }
    expanded.add(term);
    const synonyms = CONCEPT_SYNONYMS.get(term);
    if (synonyms) {
      for (const synonym of synonyms) {
        expanded.add(synonym);
      }
    }
  }
  return [...expanded];
}

function embedTerms(terms, dimensions) {
  const vector = new Array(dimensions).fill(0);
  for (const term of terms || []) {
    const hash = createHash("sha256").update(term).digest();
    const index = hash.readUInt32BE(0) % dimensions;
    const sign = hash[4] % 2 === 0 ? 1 : -1;
    const weight = term.length <= 3 ? 0.6 : term.includes(":") ? 0.4 : 1;
    vector[index] += sign * weight;
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => Number((value / norm).toFixed(6)));
}

function dotProduct(left, right) {
  let sum = 0;
  const length = Math.min(left?.length || 0, right?.length || 0);
  for (let index = 0; index < length; index += 1) {
    sum += left[index] * right[index];
  }
  return sum;
}

function tokenNgrams(token) {
  if (token.length < 5 || token.length > 32) {
    return [];
  }
  const grams = [];
  for (let index = 0; index <= token.length - 4; index += 1) {
    grams.push(`ng:${token.slice(index, index + 4)}`);
  }
  return grams.slice(0, 8);
}

function verificationVerdict(execution, phase, attempt, maxAttempts) {
  if (phase === "red") {
    return execution.ok ? "needs_revision" : "red_confirmed";
  }
  if (execution.ok) {
    return "pass";
  }
  if (execution.timed_out || attempt >= maxAttempts) {
    return "blocked";
  }
  return "needs_healing";
}

function buildHealingLoopAdvice(verdict, phase, attempt, maxAttempts) {
  const remaining = Math.max(maxAttempts - attempt, 0);
  if (verdict === "red_confirmed") {
    return {
      status: "ready_for_implementation",
      remaining_attempts: remaining,
      next_actions: [
        "Keep the failing test as proof of the missing behavior.",
        "Use mcp_semantic_code_search to find the smallest relevant code surface.",
        "Use mcp_apply_diff_patch dry_run=true, then apply the feature patch.",
        "Run mcp_run_verification_tests again with phase=green."
      ]
    };
  }
  if (verdict === "pass") {
    return {
      status: "verified",
      remaining_attempts: remaining,
      next_actions: ["Report the passing command and keep the test as regression coverage."]
    };
  }
  if (verdict === "blocked") {
    return {
      status: "human_intervention_required",
      remaining_attempts: 0,
      next_actions: [
        "Stop the autonomous healing loop.",
        "Report the failing command, stdout/stderr summary, and attempted fixes.",
        "Ask for human guidance or a narrower acceptance test."
      ]
    };
  }
  return {
    status: phase === "red" ? "test_not_assertive" : "needs_patch",
    remaining_attempts: remaining,
    next_actions: [
      "Inspect the failure output.",
      "Patch only the smallest relevant code using mcp_apply_diff_patch.",
      "Rerun this verification command before reporting success."
    ]
  };
}

async function executeScriptProcess({ language, scriptPath, sandboxDir, args, inputText, timeoutMs }) {
  const command = commandForLanguage(language, scriptPath);
  const safeArgs = (args || []).map((arg) => String(arg));
  const startedAt = Date.now();
  return await new Promise((resolve) => {
    const child = spawn(command.executable, [...command.args, ...safeArgs], {
      cwd: sandboxDir,
      env: safeEnvironment(sandboxDir),
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => {
        if (!child.killed) child.kill("SIGKILL");
      }, 1200).unref();
    }, timeoutMs);
    child.stdin.end(String(inputText || ""));
    child.stdout.on("data", (chunk) => {
      stdout = appendLimited(stdout, chunk.toString(), DEFAULT_MAX_OUTPUT_BYTES);
    });
    child.stderr.on("data", (chunk) => {
      stderr = appendLimited(stderr, chunk.toString(), DEFAULT_MAX_OUTPUT_BYTES);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({
        ok: false,
        exit_code: null,
        signal: null,
        timed_out: false,
        duration_ms: Date.now() - startedAt,
        stdout,
        stderr: appendLimited(stderr, error.message, DEFAULT_MAX_OUTPUT_BYTES),
        error: error.message
      });
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolve({
        ok: code === 0 && !timedOut,
        exit_code: code,
        signal,
        timed_out: timedOut,
        duration_ms: Date.now() - startedAt,
        stdout,
        stderr,
        output_truncated: stdout.includes("[vnem output truncated]") || stderr.includes("[vnem output truncated]")
      });
    });
  });
}

function validateEphemeralScript(scriptText, language) {
  for (const rule of DANGEROUS_SCRIPT_RULES) {
    if (rule.pattern.test(scriptText)) {
      throw new PrecisionExecutionError(rule.reason, rule.code, {
        language
      });
    }
  }
}

function commandForLanguage(language, scriptPath) {
  if (language === "node") {
    return {
      executable: process.execPath,
      args: ["--no-warnings", scriptPath]
    };
  }
  if (language === "python") {
    return {
      executable: process.env.PYTHON || "python",
      args: [scriptPath]
    };
  }
  if (language === "shell") {
    if (process.platform === "win32") {
      return {
        executable: "powershell.exe",
        args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath]
      };
    }
    return {
      executable: "sh",
      args: [scriptPath]
    };
  }
  throw new PrecisionExecutionError(`Unsupported ephemeral script language: ${language}`, "unsupported_ephemeral_language");
}

async function cleanupSandbox(sandboxDir) {
  try {
    await rm(sandboxDir, { recursive: true, force: true });
    return {
      script_deleted: true,
      sandbox_deleted: !existsSync(sandboxDir)
    };
  } catch (error) {
    return {
      script_deleted: false,
      sandbox_deleted: false,
      error: error.message
    };
  }
}

function safeEnvironment(sandboxDir) {
  const env = {
    CI: "1",
    NO_COLOR: "1",
    VNEM_EPHEMERAL: "1",
    TMP: sandboxDir,
    TEMP: sandboxDir,
    TMPDIR: sandboxDir
  };
  for (const key of ["PATH", "Path", "SystemRoot", "WINDIR", "ComSpec", "PATHEXT"]) {
    if (process.env[key]) {
      env[key] = process.env[key];
    }
  }
  return env;
}

function normalizeLanguage(language) {
  const value = String(language || "node").toLowerCase().trim();
  if (["js", "javascript", "nodejs"].includes(value)) return "node";
  if (["py", "python3"].includes(value)) return "python";
  if (["sh", "bash", "powershell", "pwsh", "shell"].includes(value)) return "shell";
  return value;
}

function extensionForLanguage(language) {
  if (language === "node") return "mjs";
  if (language === "python") return "py";
  if (language === "shell") return process.platform === "win32" ? "ps1" : "sh";
  return "txt";
}

function isTextPath(relativePath) {
  return TEXT_EXTENSIONS.has(path.extname(relativePath).toLowerCase());
}

function shouldIgnoreRelativePath(relativePath) {
  const parts = normalizeRelative(relativePath).split("/");
  return parts.some((part) => EXCLUDED_DIRECTORIES.has(part));
}

function singularize(token) {
  if (token.length > 4 && token.endsWith("ies")) {
    return `${token.slice(0, -3)}y`;
  }
  if (token.length > 3 && token.endsWith("s")) {
    return token.slice(0, -1);
  }
  return token;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function clampInteger(value, min, max) {
  const number = Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : min;
  return Math.min(max, Math.max(min, number));
}

function appendLimited(existing, addition, maxBytes) {
  const combined = `${existing}${addition}`;
  if (Buffer.byteLength(combined, "utf8") <= maxBytes) {
    return combined;
  }
  const marker = "\n[vnem output truncated]\n";
  return `${combined.slice(0, Math.max(0, maxBytes - marker.length))}${marker}`;
}

async function mapConcurrent(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

function normalizeRelative(relativePath) {
  return String(relativePath || "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function isInsidePath(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function samePath(left, right) {
  return process.platform === "win32"
    ? path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase()
    : path.resolve(left) === path.resolve(right);
}

const LANGUAGE_BY_EXTENSION = new Map([
  [".js", "javascript"], [".jsx", "javascript"], [".mjs", "javascript"], [".cjs", "javascript"],
  [".ts", "typescript"], [".tsx", "typescript"], [".py", "python"], [".rb", "ruby"],
  [".go", "go"], [".rs", "rust"], [".java", "java"], [".cs", "csharp"], [".lua", "lua"]
]);
const STRUCTURE_PATTERNS = new Map([
  ["javascript", [/\b(?:function|class)\s+([A-Za-z_$][\w$]*)/, /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(?[^=]*=>/]],
  ["typescript", [/\b(?:function|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/, /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(?[^=]*=>/]],
  ["python", [/^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)/, /^\s*class\s+([A-Za-z_]\w*)/]],
  ["ruby", [/^\s*def\s+([A-Za-z_]\w*[!?=]?)/, /^\s*class\s+([A-Za-z_:]\w*)/]],
  ["go", [/^\s*func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)/, /^\s*type\s+([A-Za-z_]\w*)/]],
  ["rust", [/^\s*(?:pub\s+)?(?:async\s+)?fn\s+([A-Za-z_]\w*)/, /^\s*(?:pub\s+)?(?:struct|enum|trait)\s+([A-Za-z_]\w*)/]],
  ["java", [/\b(?:class|interface|enum|record)\s+([A-Za-z_]\w*)/]],
  ["csharp", [/\b(?:class|interface|enum|record|struct)\s+([A-Za-z_]\w*)/]],
  ["lua", [/\bfunction\s+([A-Za-z_][\w.:]*)/]]
]);
