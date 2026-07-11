import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, realpath, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

export class PrecisionExecutionError extends Error {
  constructor(message, code = "precision_execution_error", details = {}) {
    super(message);
    this.name = "PrecisionExecutionError";
    this.code = code;
    this.details = details;
  }
}

export const DOCUMENTATION_SOURCE_REGISTRY = {
  react: {
    name: "React",
    url: "https://react.dev/reference/react",
    topics: {
      hooks: "https://react.dev/reference/react/hooks",
      components: "https://react.dev/reference/react/components",
      performance: "https://react.dev/learn/render-and-commit"
    }
  },
  next: {
    name: "Next.js",
    url: "https://nextjs.org/docs",
    aliases: ["nextjs", "next.js"]
  },
  vite: {
    name: "Vite",
    url: "https://vite.dev/guide/"
  },
  tailwind: {
    name: "Tailwind CSS",
    url: "https://tailwindcss.com/docs/installation/using-vite",
    aliases: ["tailwindcss"]
  },
  shadcn: {
    name: "shadcn/ui",
    url: "https://ui.shadcn.com/docs",
    aliases: ["shadcn-ui", "shadcn ui"]
  },
  playwright: {
    name: "Playwright",
    url: "https://playwright.dev/docs/intro"
  },
  phaser: {
    name: "Phaser",
    url: "https://docs.phaser.io/phaser/getting-started/what-is-phaser"
  },
  pixi: {
    name: "PixiJS",
    url: "https://pixijs.com/8.x/guides",
    aliases: ["pixijs", "pixi.js"]
  },
  three: {
    name: "Three.js",
    url: "https://threejs.org/docs/index.html#manual/en/introduction/Creating-a-scene",
    aliases: ["threejs", "three.js"]
  },
  babylon: {
    name: "Babylon.js",
    url: "https://doc.babylonjs.com/",
    aliases: ["babylonjs", "babylon.js"]
  },
  excalibur: {
    name: "Excalibur",
    url: "https://excaliburjs.com/docs/"
  },
  matter: {
    name: "Matter.js",
    url: "https://brm.io/matter-js/docs/",
    aliases: ["matterjs", "matter.js"]
  },
  rapier: {
    name: "Rapier",
    url: "https://rapier.rs/docs/user_guides/javascript/getting_started_js"
  },
  luau: {
    name: "Luau",
    url: "https://luau.org/getting-started",
    aliases: ["roblox luau"]
  }
};

const DEFAULT_MAX_FILE_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_DOC_BYTES = 256 * 1024;
const DEFAULT_CONTEXT_CHARS = 12000;
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_MAX_TIMEOUT_MS = 120000;
const DEFAULT_MAX_OUTPUT_BYTES = 96 * 1024;
const CONTROL_OPERATOR_PATTERN = /(\|\||&&|[|;<>`])/;
const DANGEROUS_TOKEN_PATTERN =
  /^(rm|rmdir|del|erase|remove-item|move-item|copy-item|set-content|add-content|git-clean|shutdown|reboot|format|mkfs|diskpart|bcdedit|reg|regedit|powershell|pwsh|cmd|bash|sh|curl|wget|sudo|su|chmod|chown|start-process|invoke-expression|iex)$/i;
const DANGEROUS_SCRIPT_PATTERN = /\b(clean|delete|destroy|deploy|publish|release|install|postinstall|prepare|prepublish|prune|reset|format|wipe|remove)\b/i;
const SAFE_SCRIPT_PATTERN = /^(build|check|lint|test|typecheck|validate|verify|generate|benchmark|bench|dashboard:build|dashboard:check|discover:dry-run|digest)(:|$)/i;

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export async function resolveWorkspaceFile(workspaceRoot, targetPath, options = {}) {
  const root = await realpath(path.resolve(workspaceRoot || process.cwd()));
  const rawTarget = String(targetPath || "").trim();
  if (!rawTarget) {
    throw new PrecisionExecutionError("target_path is required.", "missing_target_path");
  }
  if (path.isAbsolute(rawTarget) && !isInsidePath(root, path.resolve(rawTarget))) {
    throw new PrecisionExecutionError("Absolute target_path is outside the workspace.", "path_outside_workspace", {
      target_path: rawTarget,
      workspace_root: root
    });
  }

  const candidate = path.resolve(root, rawTarget);
  if (!isInsidePath(root, candidate)) {
    throw new PrecisionExecutionError("Resolved target_path is outside the workspace.", "path_outside_workspace", {
      target_path: rawTarget,
      resolved_path: candidate,
      workspace_root: root
    });
  }
  if (path.relative(root, candidate).split(path.sep).includes(".git")) {
    throw new PrecisionExecutionError("Refusing to operate on .git internals.", "git_path_blocked", {
      target_path: rawTarget
    });
  }
  if (options.blockSecrets !== false && isSecretLikePath(candidate)) {
    throw new PrecisionExecutionError("Refusing to patch a secret or credential-like file.", "secret_path_blocked", {
      target_path: rawTarget
    });
  }

  if (options.mustExist !== false && !existsSync(candidate)) {
    throw new PrecisionExecutionError("Target file does not exist.", "target_missing", {
      target_path: rawTarget,
      resolved_path: candidate
    });
  }

  const resolved = options.mustExist === false ? candidate : await realpath(candidate);
  if (!isInsidePath(root, resolved)) {
    throw new PrecisionExecutionError("Resolved target file escapes the workspace, likely through a symlink.", "path_outside_workspace", {
      target_path: rawTarget,
      resolved_path: resolved,
      workspace_root: root
    });
  }

  return {
    workspaceRoot: root,
    absolutePath: resolved,
    relativePath: normalizeRelative(path.relative(root, resolved))
  };
}

export function parseSearchReplaceBlock(block) {
  const normalized = String(block ?? "").replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const searchIndex = lines.findIndex((line) => line.trim() === "SEARCH:");
  const replaceIndex = lines.findIndex((line, index) => index > searchIndex && line.trim() === "REPLACE:");

  if (searchIndex === -1 || replaceIndex === -1 || replaceIndex <= searchIndex) {
    throw new PrecisionExecutionError("SEARCH/REPLACE block must contain separate SEARCH: and REPLACE: marker lines.", "invalid_search_replace_block");
  }

  return {
    search: lines.slice(searchIndex + 1, replaceIndex).join("\n"),
    replace: lines.slice(replaceIndex + 1).join("\n")
  };
}

export async function applyDiffPatch(options) {
  const {
    workspaceRoot = process.cwd(),
    targetPath,
    mode,
    block,
    search,
    replace,
    unifiedDiff,
    dryRun = true,
    expectedOccurrences = 1,
    allowMultiple = false,
    expectedBeforeSha256,
    maxFileBytes = DEFAULT_MAX_FILE_BYTES
  } = options || {};

  const target = await resolveWorkspaceFile(workspaceRoot, targetPath);
  const info = await stat(target.absolutePath);
  if (!info.isFile()) {
    throw new PrecisionExecutionError("Target path must be a regular file.", "target_not_file", {
      target_path: target.relativePath
    });
  }
  if (info.size > maxFileBytes) {
    throw new PrecisionExecutionError("Target file is larger than the configured safe patch limit.", "target_too_large", {
      target_path: target.relativePath,
      bytes: info.size,
      max_file_bytes: maxFileBytes
    });
  }

  const buffer = await readFile(target.absolutePath);
  if (buffer.includes(0)) {
    throw new PrecisionExecutionError("Target appears to be binary. Surgical text patching is blocked.", "binary_file_blocked", {
      target_path: target.relativePath
    });
  }
  const original = buffer.toString("utf8");
  const patchMode = mode || (unifiedDiff ? "unified_diff" : "search_replace");
  const beforeHash = sha256(original);
  if (expectedBeforeSha256 && beforeHash.toLowerCase() !== String(expectedBeforeSha256).toLowerCase()) {
    throw new PrecisionExecutionError("Target file no longer matches the required patch precondition.", "patch_precondition_failed", {
      target_path: target.relativePath,
      expected_before_sha256: String(expectedBeforeSha256),
      actual_before_sha256: beforeHash
    });
  }
  let patchResult;

  if (patchMode === "search_replace") {
    const parsed = block ? parseSearchReplaceBlock(block) : { search, replace };
    patchResult = applyExactSearchReplace(original, parsed.search, parsed.replace, {
      expectedOccurrences,
      allowMultiple
    });
  } else if (patchMode === "unified_diff") {
    patchResult = applyUnifiedDiff(original, unifiedDiff || block);
  } else {
    throw new PrecisionExecutionError(`Unsupported patch mode: ${patchMode}`, "unsupported_patch_mode", {
      mode: patchMode
    });
  }

  const afterHash = sha256(patchResult.nextText);
  const changed = beforeHash !== afterHash;
  if (!changed) {
    throw new PrecisionExecutionError("Patch would not change the target file.", "no_effect_patch", {
      target_path: target.relativePath
    });
  }

  if (!dryRun) {
    await atomicWriteText(target.absolutePath, patchResult.nextText, info.mode);
  }

  return {
    ok: true,
    applied: !dryRun,
    dry_run: Boolean(dryRun),
    mode: patchMode,
    target_path: target.relativePath,
    workspace_root: target.workspaceRoot,
    before_sha256: beforeHash,
    after_sha256: afterHash,
    bytes_before: Buffer.byteLength(original, "utf8"),
    bytes_after: Buffer.byteLength(patchResult.nextText, "utf8"),
    line_ending: patchResult.lineEnding || detectLineEnding(original),
    match_count: patchResult.matchCount,
    changed_ranges: patchResult.changedRanges,
    message: dryRun
      ? "Patch verified exactly. No file was written because dry_run is true."
      : "Patch verified exactly and was written atomically."
  };
}

export class PatchTransactionStore {
  constructor(options = {}) {
    this.workspaceRoot = path.resolve(options.workspaceRoot || process.cwd());
    this.stateRoot = options.stateRoot || path.join(this.workspaceRoot, ".vnem-runtime", "precision", "patch-transactions");
    this.maxPatches = options.maxPatches || 25;
  }

  async apply(options = {}) {
    const root = await realpath(this.workspaceRoot);
    const patches = Array.isArray(options.patches) ? options.patches : [];
    const dryRun = options.dryRun !== false;
    if (!patches.length || patches.length > this.maxPatches) {
      throw new PrecisionExecutionError(`Patch transaction requires 1-${this.maxPatches} patches.`, "invalid_patch_transaction_size", {
        patch_count: patches.length,
        max_patches: this.maxPatches
      });
    }

    const seen = new Set();
    const prepared = [];
    for (const [index, patch] of patches.entries()) {
      const targetPath = patch.targetPath || patch.target_path;
      const target = await resolveWorkspaceFile(root, targetPath);
      const key = process.platform === "win32" ? target.absolutePath.toLowerCase() : target.absolutePath;
      if (seen.has(key)) {
        throw new PrecisionExecutionError("A patch transaction cannot target the same file more than once.", "duplicate_patch_target", {
          target_path: target.relativePath
        });
      }
      seen.add(key);
      const info = await stat(target.absolutePath);
      const original = await readFile(target.absolutePath, "utf8");
      const beforeSha256 = sha256(original);
      const result = await applyDiffPatch({
        workspaceRoot: root,
        targetPath: target.relativePath,
        mode: patch.mode,
        block: patch.block,
        search: patch.search,
        replace: patch.replace,
        unifiedDiff: patch.unifiedDiff || patch.unified_diff,
        dryRun: true,
        expectedOccurrences: patch.expectedOccurrences ?? patch.expected_occurrences ?? 1,
        allowMultiple: patch.allowMultiple ?? patch.allow_multiple ?? false,
        expectedBeforeSha256: patch.expectedBeforeSha256 || patch.expected_before_sha256,
        maxFileBytes: patch.maxFileBytes
      });
      prepared.push({ index, target, info, original, beforeSha256, patch, result });
    }

    if (dryRun) {
      return {
        ok: true,
        applied: false,
        dry_run: true,
        transaction_id: null,
        status: "verified",
        atomic: true,
        patches: prepared.map((item) => item.result),
        evidence_path: null,
        rollback_available: false
      };
    }

    const transactionId = normalizeTransactionId(options.transactionId || randomUUID());
    const transactionRoot = this.transactionPath(transactionId);
    await mkdir(this.stateRoot, { recursive: true });
    await mkdir(transactionRoot, { recursive: false });
    const manifest = {
      schema_version: "1.0.0",
      transaction_id: transactionId,
      status: "prepared",
      workspace_root: root,
      created_at: new Date().toISOString(),
      patches: []
    };
    for (const item of prepared) {
      const backupFile = `${String(item.index + 1).padStart(3, "0")}-${sha256(item.target.relativePath).slice(0, 12)}.backup`;
      await writeFile(path.join(transactionRoot, backupFile), item.original, "utf8");
      manifest.patches.push({
        target_path: item.target.relativePath,
        backup_file: backupFile,
        mode: item.result.mode,
        file_mode: item.info.mode,
        before_sha256: item.beforeSha256,
        after_sha256: item.result.after_sha256,
        changed_ranges: item.result.changed_ranges,
        applied: false
      });
    }
    await this.writeManifest(transactionRoot, manifest);

    try {
      for (const item of prepared) {
        const result = await applyDiffPatch({
          workspaceRoot: root,
          targetPath: item.target.relativePath,
          mode: item.patch.mode,
          block: item.patch.block,
          search: item.patch.search,
          replace: item.patch.replace,
          unifiedDiff: item.patch.unifiedDiff || item.patch.unified_diff,
          dryRun: false,
          expectedOccurrences: item.patch.expectedOccurrences ?? item.patch.expected_occurrences ?? 1,
          allowMultiple: item.patch.allowMultiple ?? item.patch.allow_multiple ?? false,
          expectedBeforeSha256: item.beforeSha256,
          maxFileBytes: item.patch.maxFileBytes
        });
        prepared[item.index].result = result;
        manifest.patches[item.index].applied = true;
        await this.writeManifest(transactionRoot, manifest);
      }
    } catch (error) {
      const rollback = await this.restorePrepared(prepared.filter((item) => manifest.patches[item.index].applied));
      manifest.status = rollback.ok ? "rolled_back_after_failure" : "rollback_incomplete";
      manifest.failure = { code: error.code || "patch_transaction_failed", message: error.message };
      manifest.rollback = rollback;
      manifest.updated_at = new Date().toISOString();
      await this.writeManifest(transactionRoot, manifest);
      throw new PrecisionExecutionError("Atomic patch transaction failed and rollback was attempted.", "patch_transaction_failed", {
        transaction_id: transactionId,
        cause_code: error.code || "unexpected_error",
        rollback
      });
    }

    manifest.status = "committed";
    manifest.committed_at = new Date().toISOString();
    await this.writeManifest(transactionRoot, manifest);
    return {
      ok: true,
      applied: true,
      dry_run: false,
      transaction_id: transactionId,
      status: manifest.status,
      atomic: true,
      patches: prepared.map((item) => item.result),
      evidence_path: normalizeRelative(path.relative(root, path.join(transactionRoot, "manifest.json"))),
      rollback_available: true
    };
  }

  async rollback(options = {}) {
    const root = await realpath(this.workspaceRoot);
    const transactionId = normalizeTransactionId(options.transactionId || options.transaction_id);
    const transactionRoot = this.transactionPath(transactionId);
    let manifest;
    try {
      manifest = JSON.parse(await readFile(path.join(transactionRoot, "manifest.json"), "utf8"));
    } catch (error) {
      throw new PrecisionExecutionError("Patch transaction evidence was not found.", "patch_transaction_not_found", {
        transaction_id: transactionId,
        cause: error.code
      });
    }
    if (!samePath(manifest.workspace_root, root)) {
      throw new PrecisionExecutionError("Patch transaction belongs to a different workspace.", "patch_transaction_workspace_mismatch", {
        transaction_id: transactionId
      });
    }

    const restored = [];
    for (const patch of [...manifest.patches].reverse()) {
      if (!patch.applied) continue;
      const target = await resolveWorkspaceFile(root, patch.target_path);
      const current = await readFile(target.absolutePath, "utf8");
      const currentSha256 = sha256(current);
      if (!options.force && currentSha256 !== patch.after_sha256) {
        throw new PrecisionExecutionError("Rollback precondition failed because a patched file changed afterward.", "rollback_precondition_failed", {
          transaction_id: transactionId,
          target_path: patch.target_path,
          expected_sha256: patch.after_sha256,
          actual_sha256: currentSha256
        });
      }
      const backup = await readFile(path.join(transactionRoot, patch.backup_file), "utf8");
      if (sha256(backup) !== patch.before_sha256) {
        throw new PrecisionExecutionError("Rollback backup hash does not match the evidence manifest.", "rollback_backup_corrupt", {
          transaction_id: transactionId,
          target_path: patch.target_path
        });
      }
      await atomicWriteText(target.absolutePath, backup, patch.file_mode);
      restored.push({ target_path: patch.target_path, restored_sha256: patch.before_sha256 });
    }
    manifest.status = "rolled_back";
    manifest.rolled_back_at = new Date().toISOString();
    manifest.rollback = { ok: true, restored };
    await this.writeManifest(transactionRoot, manifest);
    return {
      ok: true,
      transaction_id: transactionId,
      status: manifest.status,
      restored,
      evidence_path: normalizeRelative(path.relative(root, path.join(transactionRoot, "manifest.json")))
    };
  }

  transactionPath(transactionId) {
    return path.join(this.stateRoot, normalizeTransactionId(transactionId));
  }

  async writeManifest(transactionRoot, manifest) {
    const target = path.join(transactionRoot, "manifest.json");
    const temporary = `${target}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify(manifest, null, 2), "utf8");
    await rename(temporary, target);
  }

  async restorePrepared(items) {
    const restored = [];
    const failed = [];
    for (const item of [...items].reverse()) {
      try {
        await atomicWriteText(item.target.absolutePath, item.original, item.info.mode);
        restored.push(item.target.relativePath);
      } catch (error) {
        failed.push({ target_path: item.target.relativePath, message: error.message });
      }
    }
    return { ok: failed.length === 0, restored, failed };
  }
}

export function applyExactSearchReplace(original, search, replace, options = {}) {
  const oldCode = String(search ?? "");
  const newCode = String(replace ?? "");
  if (!oldCode) {
    throw new PrecisionExecutionError("SEARCH content cannot be empty.", "empty_search");
  }

  const occurrences = findOccurrences(original, oldCode);
  const expected = Number.isInteger(options.expectedOccurrences) ? options.expectedOccurrences : 1;
  if (!options.allowMultiple && occurrences.length !== expected) {
    throw new PrecisionExecutionError("SEARCH content did not match the expected occurrence count.", "search_match_count_mismatch", {
      expected_occurrences: expected,
      actual_occurrences: occurrences.length
    });
  }
  if (options.allowMultiple && occurrences.length === 0) {
    throw new PrecisionExecutionError("SEARCH content did not match the target file exactly.", "search_not_found");
  }

  const ranges = [];
  let nextText = "";
  let lastIndex = 0;
  const indexes = options.allowMultiple ? occurrences : occurrences.slice(0, expected);
  for (const index of indexes) {
    nextText += original.slice(lastIndex, index);
    nextText += newCode;
    ranges.push({
      old_start_line: lineNumberAt(original, index),
      old_line_count: countLines(oldCode),
      new_line_count: countLines(newCode)
    });
    lastIndex = index + oldCode.length;
  }
  nextText += original.slice(lastIndex);

  return {
    nextText,
    matchCount: occurrences.length,
    changedRanges: ranges,
    lineEnding: detectLineEnding(original)
  };
}

export function applyUnifiedDiff(original, diffText) {
  const diff = String(diffText ?? "");
  if (!diff.trim()) {
    throw new PrecisionExecutionError("Unified diff content is required.", "missing_unified_diff");
  }

  const hunks = parseUnifiedDiff(diff);
  if (!hunks.length) {
    throw new PrecisionExecutionError("Unified diff did not contain any hunks.", "no_diff_hunks");
  }

  const split = splitLinesPreserveFinalNewline(original);
  const lines = [...split.lines];
  let offset = 0;
  const changedRanges = [];

  for (const hunk of hunks) {
    const index = hunk.oldStart - 1 + offset;
    if (index < 0 || index > lines.length) {
      throw new PrecisionExecutionError("Unified diff hunk start is outside the file.", "diff_hunk_out_of_range", {
        old_start: hunk.oldStart
      });
    }

    const actual = lines.slice(index, index + hunk.oldLines.length);
    if (!arraysEqual(actual, hunk.oldLines)) {
      throw new PrecisionExecutionError("Unified diff hunk context/removal lines do not match the target file exactly.", "diff_hunk_mismatch", {
        old_start: hunk.oldStart,
        expected: hunk.oldLines.join("\n").slice(0, 500),
        actual: actual.join("\n").slice(0, 500)
      });
    }

    lines.splice(index, hunk.oldLines.length, ...hunk.newLines);
    changedRanges.push({
      old_start_line: hunk.oldStart,
      old_line_count: hunk.oldLines.length,
      new_start_line: hunk.newStart,
      new_line_count: hunk.newLines.length
    });
    offset += hunk.newLines.length - hunk.oldLines.length;
  }

  return {
    nextText: joinLinesPreserveFinalNewline(lines, split),
    matchCount: hunks.length,
    changedRanges,
    lineEnding: split.eol
  };
}

export async function fetchDocumentation(options) {
  const {
    library,
    topic = "",
    url,
    version = "",
    maxBytes = DEFAULT_MAX_DOC_BYTES,
    contextChars = DEFAULT_CONTEXT_CHARS,
    fetchImpl = globalThis.fetch,
    timeoutMs = 15000
  } = options || {};

  if (typeof fetchImpl !== "function") {
    throw new PrecisionExecutionError("No fetch implementation is available in this runtime.", "fetch_unavailable");
  }

  const source = resolveDocumentationSource(library, topic, url);
  assertSafeDocumentationUrl(source.url);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetchImpl(source.url, {
      signal: controller.signal,
      headers: {
        "accept": "text/markdown,text/plain,text/html;q=0.9,*/*;q=0.5",
        "user-agent": "vnem-precision-doc-fetch/1.0"
      }
    });
  } catch (error) {
    throw new PrecisionExecutionError(`Documentation fetch failed: ${error.message}`, "documentation_fetch_failed", {
      url: source.url
    });
  } finally {
    clearTimeout(timer);
  }

  if (!response?.ok) {
    throw new PrecisionExecutionError(`Documentation fetch returned HTTP ${response?.status || "unknown"}.`, "documentation_fetch_http_error", {
      url: source.url,
      status: response?.status || null
    });
  }

  const contentType = headerValue(response.headers, "content-type");
  const rawText = await response.text();
  const rawBytes = Buffer.byteLength(rawText, "utf8");
  if (rawBytes > maxBytes) {
    throw new PrecisionExecutionError("Documentation response exceeds the configured byte limit.", "documentation_too_large", {
      url: source.url,
      bytes: rawBytes,
      max_bytes: maxBytes
    });
  }

  const text = normalizeDocumentationText(rawText, contentType);
  const excerpt = text.slice(0, contextChars).trim();
  const document = {
    library: source.library,
    requested_library: library || null,
    topic: topic || null,
    version: version || null,
    url: source.url,
    fetched_at: new Date().toISOString(),
    content_type: contentType || "unknown",
    bytes: rawBytes,
    sha256: sha256(text),
    excerpt,
    source_trust: url ? "user_supplied_https" : "vnem_registry_known_docs"
  };

  return {
    ok: true,
    documentation: document,
    context_injection: buildDocumentationInjection([document]),
    policy:
      "Inject this documentation into the worker context before framework-specific code is written. If the client cannot inject context automatically, paste or attach the context_injection block to the worker task."
  };
}

export class DocumentationContextStore {
  constructor(options = {}) {
    this.maxEntries = options.maxEntries || 50;
    this.records = new Map();
  }

  recordFetch({ workerId = "default", taskId = "default", documentation }) {
    if (!documentation) {
      throw new PrecisionExecutionError("documentation is required.", "missing_documentation");
    }
    const key = this.key(workerId, taskId, documentation.library, documentation.topic || documentation.url);
    const record = {
      worker_id: workerId,
      task_id: taskId,
      recorded_at: new Date().toISOString(),
      documentation
    };
    this.records.set(key, record);
    while (this.records.size > this.maxEntries) {
      this.records.delete(this.records.keys().next().value);
    }
    return record;
  }

  list({ workerId, taskId, library } = {}) {
    return [...this.records.values()].filter((record) => {
      if (workerId && record.worker_id !== workerId) return false;
      if (taskId && record.task_id !== taskId) return false;
      if (library && normalizeKey(record.documentation.library) !== normalizeKey(library)) return false;
      return true;
    });
  }

  hasDocumentation({ workerId, taskId, library } = {}) {
    return this.list({ workerId, taskId, library }).length > 0;
  }

  buildContextInjection({ workerId, taskId, library } = {}) {
    const records = this.list({ workerId, taskId, library });
    return buildDocumentationInjection(records.map((record) => record.documentation));
  }

  key(workerId, taskId, library, topic) {
    return [workerId, taskId, normalizeKey(library), normalizeKey(topic || "")].join("::");
  }
}

export class StatefulTerminalSession {
  constructor(options = {}) {
    this.workspaceRoot = path.resolve(options.workspaceRoot || process.cwd());
    this.cwd = this.workspaceRoot;
    this.defaultTimeoutMs = options.defaultTimeoutMs || DEFAULT_TIMEOUT_MS;
    this.maxTimeoutMs = options.maxTimeoutMs || DEFAULT_MAX_TIMEOUT_MS;
    this.maxOutputBytes = options.maxOutputBytes || DEFAULT_MAX_OUTPUT_BYTES;
    this.additionalAllowedPrefixes = options.additionalAllowedPrefixes || [];
  }

  async setWorkingDirectory(requestedCwd) {
    const next = await resolveWorkspaceDirectory(this.workspaceRoot, requestedCwd || this.cwd);
    this.cwd = next.absolutePath;
    return {
      ok: true,
      cwd: normalizeRelative(path.relative(next.workspaceRoot, next.absolutePath)) || "."
    };
  }

  async execute(command, options = {}) {
    const commandText = String(command ?? "").trim();
    if (!commandText) {
      throw new PrecisionExecutionError("command is required.", "missing_command");
    }
    if (CONTROL_OPERATOR_PATTERN.test(commandText)) {
      throw new PrecisionExecutionError("Shell control operators are blocked. Run one safe command at a time.", "shell_control_operator_blocked");
    }

    if (options.workingDirectory) {
      await this.setWorkingDirectory(options.workingDirectory);
    }

    const tokens = parseCommandLine(commandText);
    if (!tokens.length) {
      throw new PrecisionExecutionError("command did not contain an executable token.", "missing_command");
    }
    if (tokens[0].toLowerCase() === "cd") {
      if (tokens.length !== 2) {
        throw new PrecisionExecutionError("cd requires exactly one workspace-relative path.", "invalid_cd");
      }
      return {
        ok: true,
        command: commandText,
        action: "cd",
        ...(await this.setWorkingDirectory(tokens[1]))
      };
    }

    validateSafeTerminalCommand(tokens, this.additionalAllowedPrefixes);
    const timeoutMs = clampTimeout(options.timeoutMs || this.defaultTimeoutMs, this.maxTimeoutMs);
    const startedAt = Date.now();
    const executable = resolveExecutable(tokens[0]);
    const args = tokens.slice(1);

    return await new Promise((resolve) => {
      const child = spawn(executable, args, {
        cwd: this.cwd,
        env: {
          ...process.env,
          CI: process.env.CI || "1",
          NO_COLOR: process.env.NO_COLOR || "1"
        },
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
        }, 1500).unref();
      }, timeoutMs);

      child.stdin.end();
      child.stdout.on("data", (chunk) => {
        stdout = appendLimited(stdout, chunk.toString(), this.maxOutputBytes);
      });
      child.stderr.on("data", (chunk) => {
        stderr = appendLimited(stderr, chunk.toString(), this.maxOutputBytes);
      });
      child.on("error", (error) => {
        clearTimeout(timer);
        resolve({
          ok: false,
          command: commandText,
          cwd: normalizeRelative(path.relative(this.workspaceRoot, this.cwd)) || ".",
          exit_code: null,
          signal: null,
          timed_out: false,
          duration_ms: Date.now() - startedAt,
          stdout,
          stderr: appendLimited(stderr, error.message, this.maxOutputBytes),
          error: error.message
        });
      });
      child.on("close", (code, signal) => {
        clearTimeout(timer);
        resolve({
          ok: code === 0 && !timedOut,
          command: commandText,
          cwd: normalizeRelative(path.relative(this.workspaceRoot, this.cwd)) || ".",
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
}

export function parseCommandLine(command) {
  const tokens = [];
  let current = "";
  let quote = null;
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }
    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (quote) {
    throw new PrecisionExecutionError("Unclosed quote in command.", "unclosed_quote");
  }
  if (current) {
    tokens.push(current);
  }
  return tokens;
}

export function buildDocumentationInjection(documents) {
  const docs = (documents || []).filter(Boolean);
  if (!docs.length) {
    return "";
  }
  return [
    "# VNEM Dynamic Documentation Injection",
    "",
    "Use this fetched documentation as active worker context before writing framework-specific code. Prefer the cited source over memory when syntax conflicts.",
    "",
    ...docs.flatMap((doc, index) => [
      `## ${index + 1}. ${doc.library}${doc.topic ? ` - ${doc.topic}` : ""}`,
      "",
      `URL: ${doc.url}`,
      `Fetched: ${doc.fetched_at}`,
      `SHA-256: ${doc.sha256}`,
      "",
      doc.excerpt,
      ""
    ])
  ].join("\n").trim();
}

function applyTempSuffix(filePath) {
  const dir = path.dirname(filePath);
  const name = path.basename(filePath);
  const suffix = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return path.join(dir, `${name}.vnem-${suffix}.tmp`);
}

async function atomicWriteText(filePath, text, mode) {
  const tempPath = applyTempSuffix(filePath);
  const backupPath = `${tempPath}.bak`;
  try {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(tempPath, text, { encoding: "utf8", mode });
    if (process.platform === "win32") {
      await rename(filePath, backupPath);
      try {
        await rename(tempPath, filePath);
        await unlink(backupPath).catch(() => {});
      } catch (error) {
        await rename(backupPath, filePath).catch(() => {});
        throw error;
      }
    } else {
      await rename(tempPath, filePath);
    }
  } catch (error) {
    try {
      await unlink(tempPath);
    } catch {
      // Best-effort temp cleanup.
    }
    throw error;
  }
}

function findOccurrences(text, needle) {
  const indexes = [];
  let index = text.indexOf(needle);
  while (index !== -1) {
    indexes.push(index);
    index = text.indexOf(needle, index + needle.length);
  }
  return indexes;
}

function lineNumberAt(text, index) {
  return text.slice(0, index).split(/\n/).length;
}

function countLines(text) {
  if (!text) return 0;
  return text.split(/\n/).length;
}

function parseUnifiedDiff(diff) {
  const lines = diff.replace(/\r\n/g, "\n").split("\n");
  const hunks = [];
  let current = null;

  for (const line of lines) {
    const header = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
    if (header) {
      current = {
        oldStart: Number.parseInt(header[1], 10),
        oldCount: header[2] ? Number.parseInt(header[2], 10) : 1,
        newStart: Number.parseInt(header[3], 10),
        newCount: header[4] ? Number.parseInt(header[4], 10) : 1,
        oldLines: [],
        newLines: []
      };
      hunks.push(current);
      continue;
    }

    if (!current) {
      continue;
    }
    if (line.startsWith("\\ No newline at end of file")) {
      continue;
    }
    if (!line) {
      continue;
    }

    const prefix = line[0];
    const body = line.slice(1);
    if (prefix === " ") {
      current.oldLines.push(body);
      current.newLines.push(body);
    } else if (prefix === "-") {
      current.oldLines.push(body);
    } else if (prefix === "+") {
      current.newLines.push(body);
    } else {
      throw new PrecisionExecutionError("Invalid unified diff line inside hunk.", "invalid_unified_diff_line", {
        line: line.slice(0, 120)
      });
    }
  }

  for (const hunk of hunks) {
    if (hunk.oldLines.length !== hunk.oldCount || hunk.newLines.length !== hunk.newCount) {
      throw new PrecisionExecutionError("Unified diff hunk line counts do not match the hunk header.", "diff_hunk_count_mismatch", {
        old_start: hunk.oldStart,
        expected_old_count: hunk.oldCount,
        actual_old_count: hunk.oldLines.length,
        expected_new_count: hunk.newCount,
        actual_new_count: hunk.newLines.length
      });
    }
  }

  return hunks;
}

function splitLinesPreserveFinalNewline(text) {
  const eol = detectLineEnding(text);
  const normalized = text.replace(/\r\n/g, "\n");
  const hasFinalNewline = normalized.endsWith("\n");
  const body = hasFinalNewline ? normalized.slice(0, -1) : normalized;
  return {
    lines: body ? body.split("\n") : [],
    eol,
    hasFinalNewline
  };
}

function joinLinesPreserveFinalNewline(lines, split) {
  const text = lines.join(split.eol);
  return split.hasFinalNewline ? `${text}${split.eol}` : text;
}

function detectLineEnding(text) {
  return text.includes("\r\n") ? "\r\n" : "\n";
}

function arraysEqual(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function resolveDocumentationSource(library, topic, url) {
  if (url) {
    let host = "custom documentation";
    try {
      host = new URL(url).hostname;
    } catch {
      // The later URL safety check returns the precise validation error.
    }
    return {
      library: library || host,
      url
    };
  }
  const key = normalizeKey(library);
  if (!key) {
    throw new PrecisionExecutionError("library or url is required.", "missing_documentation_source");
  }

  const match = Object.entries(DOCUMENTATION_SOURCE_REGISTRY).find(([entryKey, entry]) => {
    const names = [entryKey, entry.name, ...(entry.aliases || [])].map(normalizeKey);
    return names.includes(key);
  });
  if (!match) {
    throw new PrecisionExecutionError("Unknown documentation source. Provide a specific HTTPS documentation URL.", "unknown_documentation_source", {
      library
    });
  }

  const [, entry] = match;
  const topicKey = normalizeKey(topic);
  const topicUrl = topicKey && entry.topics
    ? Object.entries(entry.topics).find(([name]) => normalizeKey(name) === topicKey)?.[1]
    : null;
  return {
    library: entry.name,
    url: topicUrl || entry.url
  };
}

function assertSafeDocumentationUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new PrecisionExecutionError("Documentation URL is invalid.", "invalid_documentation_url", {
      url: value
    });
  }
  if (url.protocol !== "https:") {
    throw new PrecisionExecutionError("Documentation URL must use HTTPS.", "documentation_url_not_https", {
      url: value
    });
  }
  if (url.username || url.password) {
    throw new PrecisionExecutionError("Documentation URL must not contain credentials.", "documentation_url_credentials_blocked");
  }
  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".local") ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host.startsWith("127.") ||
    host.startsWith("10.") ||
    host.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
  ) {
    throw new PrecisionExecutionError("Documentation URL points at a local/private host and is blocked.", "private_host_blocked", {
      host
    });
  }
}

function normalizeDocumentationText(rawText, contentType) {
  if (/html/i.test(contentType) || /<html|<!doctype html/i.test(rawText)) {
    return decodeHtmlEntities(rawText)
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|section|article|main|aside|header|footer|nav|li|h[1-6]|pre|code|tr)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  return rawText
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function decodeHtmlEntities(text) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function headerValue(headers, name) {
  if (!headers) return "";
  if (typeof headers.get === "function") {
    return headers.get(name) || "";
  }
  return headers[name] || headers[name.toLowerCase()] || "";
}

async function resolveWorkspaceDirectory(workspaceRoot, requestedPath) {
  const root = await realpath(path.resolve(workspaceRoot || process.cwd()));
  const candidate = path.resolve(root, requestedPath || ".");
  if (!isInsidePath(root, candidate)) {
    throw new PrecisionExecutionError("Working directory is outside the workspace.", "working_directory_outside_workspace", {
      requested_path: requestedPath,
      workspace_root: root
    });
  }
  const resolved = await realpath(candidate);
  const info = await stat(resolved);
  if (!info.isDirectory()) {
    throw new PrecisionExecutionError("Working directory must be a directory.", "working_directory_not_directory", {
      requested_path: requestedPath
    });
  }
  if (!isInsidePath(root, resolved)) {
    throw new PrecisionExecutionError("Working directory escapes the workspace, likely through a symlink.", "working_directory_outside_workspace", {
      requested_path: requestedPath,
      workspace_root: root
    });
  }
  return {
    workspaceRoot: root,
    absolutePath: resolved
  };
}

function validateSafeTerminalCommand(tokens, additionalAllowedPrefixes = []) {
  const normalized = tokens.map((token) => token.toLowerCase());
  for (const token of normalized) {
    if (DANGEROUS_TOKEN_PATTERN.test(token) || hasPathTraversal(token)) {
      throw new PrecisionExecutionError("Command contains a blocked token.", "terminal_command_blocked", {
        token
      });
    }
  }

  if (additionalAllowedPrefixes.some((prefix) => matchesPrefix(normalized, prefix.map((item) => item.toLowerCase())))) {
    return;
  }

  const executable = normalized[0];
  if (["npm", "pnpm", "yarn", "bun"].includes(executable)) {
    const verb = normalized[1];
    if (verb === "test") return;
    if (verb === "run" && isSafePackageScript(normalized[2] || "")) return;
    throw new PrecisionExecutionError("Only safe package-manager test/build/check scripts are allowed.", "package_script_not_allowed", {
      script: normalized[2] || verb || ""
    });
  }

  if (executable === "node" && normalized[1] === "--check" && normalized.length >= 3) return;
  if (executable === "git" && ["status", "diff", "log", "show"].includes(normalized[1])) return;
  if (executable === "cargo" && ["test", "check", "build"].includes(normalized[1])) return;
  if (executable === "go" && normalized[1] === "test") return;
  if (executable === "python" && normalized[1] === "-m" && ["pytest", "unittest"].includes(normalized[2])) return;
  if (executable === "pytest") return;

  throw new PrecisionExecutionError("Command is not in the safe terminal allowlist.", "terminal_command_not_allowed", {
    command: tokens.join(" ")
  });
}

function hasPathTraversal(token) {
  return token === ".." || token.includes("../") || token.includes("..\\");
}

function isSafePackageScript(scriptName) {
  if (!scriptName || DANGEROUS_SCRIPT_PATTERN.test(scriptName)) {
    return false;
  }
  return SAFE_SCRIPT_PATTERN.test(scriptName);
}

function matchesPrefix(tokens, prefix) {
  return prefix.length > 0 && prefix.every((value, index) => tokens[index] === value);
}

function resolveExecutable(executable) {
  if (process.platform !== "win32") return executable;
  if (["npm", "pnpm", "yarn", "bun"].includes(executable.toLowerCase())) {
    return `${executable}.cmd`;
  }
  return executable;
}

function clampTimeout(value, maxTimeoutMs) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_TIMEOUT_MS;
  return Math.min(parsed, maxTimeoutMs);
}

function appendLimited(existing, incoming, maxBytes) {
  const combined = `${existing}${incoming}`;
  if (Buffer.byteLength(combined, "utf8") <= maxBytes) {
    return combined;
  }
  const marker = "\n[vnem output truncated]\n";
  const keepBytes = Math.max(maxBytes - Buffer.byteLength(marker, "utf8"), 0);
  return `${combined.slice(-keepBytes)}${marker}`;
}

function normalizeKey(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeRelative(value) {
  return String(value || "").replace(/\\/g, "/");
}

function isInsidePath(root, candidate) {
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(candidate);
  if (samePath(resolvedRoot, resolvedCandidate)) return true;
  const relative = path.relative(resolvedRoot, resolvedCandidate);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function samePath(left, right) {
  const leftPath = path.resolve(left);
  const rightPath = path.resolve(right);
  return process.platform === "win32" ? leftPath.toLowerCase() === rightPath.toLowerCase() : leftPath === rightPath;
}

function normalizeTransactionId(value) {
  const transactionId = String(value || "").trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(transactionId)) {
    throw new PrecisionExecutionError("Invalid patch transaction id.", "invalid_patch_transaction_id");
  }
  return transactionId;
}

function isSecretLikePath(filePath) {
  const normalized = normalizeRelative(path.resolve(filePath)).toLowerCase();
  const name = path.basename(normalized);
  return /^\.env(?:\..+)?$/.test(name)
    || /^(?:credentials?|secrets?)(?:\.[a-z0-9_-]+)?$/.test(name)
    || /^(?:id_rsa|id_ed25519)(?:\.pub)?$/.test(name)
    || /\.(?:pem|p12|pfx|key|keystore)$/.test(name);
}
