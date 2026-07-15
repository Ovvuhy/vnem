import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";

const CONTROL_PATTERN = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\u200E\u200F\u202A-\u202E\u2066-\u2069]/;
const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9_-]{12,}/i,
  /gh[pousr]_[A-Za-z0-9_]{12,}/i,
  /xox[baprs]-[A-Za-z0-9-]{12,}/i,
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/i
];
const LOCAL_PATH_PATTERNS = [
  /(?:^|[\s"'=(`])([A-Za-z]:[\\/](?:Users|VNEM|Temp)[\\/][^\s"'<>`)]+)/im,
  /(?:^|[\s"'=(`])(\/(?:Users|home)\/[^\s"'<>`)]+)/im,
  /file:\/{2,3}[^\s"'<>`)]+/im
];
const TEXT_EXTENSIONS = new Set([".json", ".md", ".txt", ".toml", ".yaml", ".yml", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".css", ".html"]);
const VOLATILE_JSON_KEYS = new Set(["generated_at", "release_date"]);

export function resolveGenerationClock({ sourceDateEpoch, semanticTimestamp }) {
  const raw = sourceDateEpoch || semanticTimestamp;
  const date = /^\d+$/.test(String(raw || ""))
    ? new Date(Number(raw) * 1000)
    : new Date(raw);
  if (!raw || Number.isNaN(date.valueOf())) {
    const source = sourceDateEpoch ? "SOURCE_DATE_EPOCH" : "generation metadata";
    throw new Error(`Invalid ${source}: ${raw}`);
  }
  return {
    date,
    iso: date.toISOString(),
    epoch_seconds: Math.floor(date.getTime() / 1000),
    source: sourceDateEpoch ? "SOURCE_DATE_EPOCH" : "generation/metadata.json"
  };
}

export function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function portableCompare(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function writeTarString(buffer, offset, length, value) {
  const encoded = Buffer.from(String(value));
  if (encoded.length > length) throw new Error(`Tar field exceeds ${length} bytes: ${value}`);
  encoded.copy(buffer, offset);
}

function writeTarOctal(buffer, offset, length, value) {
  const encoded = Number(value).toString(8).padStart(length - 1, "0").slice(-(length - 1));
  writeTarString(buffer, offset, length, `${encoded}\0`);
}

function tarEntry(name, content, epochSeconds) {
  const body = Buffer.isBuffer(content) ? content : Buffer.from(content);
  const header = Buffer.alloc(512, 0);
  writeTarString(header, 0, 100, name);
  writeTarOctal(header, 100, 8, 0o644);
  writeTarOctal(header, 108, 8, 0);
  writeTarOctal(header, 116, 8, 0);
  writeTarOctal(header, 124, 12, body.length);
  writeTarOctal(header, 136, 12, epochSeconds);
  header.fill(0x20, 148, 156);
  header[156] = 0x30;
  writeTarString(header, 257, 6, "ustar");
  writeTarString(header, 263, 2, "00");
  writeTarString(header, 265, 32, "vnem");
  writeTarString(header, 297, 32, "vnem");
  let checksum = 0;
  for (const byte of header) checksum += byte;
  writeTarString(header, 148, 8, `${checksum.toString(8).padStart(6, "0")}\0 `);
  const padding = Buffer.alloc((512 - (body.length % 512)) % 512, 0);
  return Buffer.concat([header, body, padding]);
}

export function createDeterministicTarGzip(files, { epochSeconds }) {
  const entries = [...(files instanceof Map ? files.entries() : Object.entries(files))]
    .sort(([left], [right]) => portableCompare(left, right))
    .map(([name, content]) => tarEntry(name, content, epochSeconds));
  const gzip = gzipSync(Buffer.concat([...entries, Buffer.alloc(1024, 0)]), { level: 9 });
  // RFC 1952 header metadata is not semantic. Normalize MTIME and OS explicitly.
  gzip.fill(0, 4, 8);
  gzip[9] = 255;
  return gzip;
}

export function readTarGzipEntries(bytes) {
  const tar = gunzipSync(bytes);
  const entries = new Map();
  let offset = 0;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const name = header.subarray(0, 100).toString("utf8").replace(/\0.*$/, "");
    const sizeText = header.subarray(124, 136).toString("ascii").replace(/\0.*$/, "").trim();
    const size = Number.parseInt(sizeText || "0", 8);
    if (!name || !Number.isFinite(size) || size < 0) throw new Error("Invalid tar entry header.");
    const bodyStart = offset + 512;
    const bodyEnd = bodyStart + size;
    if (bodyEnd > tar.length) throw new Error(`Truncated tar entry: ${name}`);
    entries.set(name, Buffer.from(tar.subarray(bodyStart, bodyEnd)));
    offset = bodyStart + Math.ceil(size / 512) * 512;
  }
  return entries;
}

function stableSemanticValue(value) {
  if (Array.isArray(value)) return value.map(stableSemanticValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort(portableCompare).map((key) => [
    key,
    VOLATILE_JSON_KEYS.has(key) ? "<volatile>" : stableSemanticValue(value[key])
  ]));
}

function semanticText(output, bytes) {
  const text = bytes.toString("utf8");
  if (path.extname(output).toLowerCase() === ".json") {
    try {
      return `${JSON.stringify(stableSemanticValue(JSON.parse(text)), null, 2)}\n`;
    } catch {
      return text;
    }
  }
  return text.replace(/^Generated: .+$/gm, "Generated: <volatile>");
}

export function semanticHash(output, bytes) {
  if (output.toLowerCase().endsWith(".tgz")) {
    const entries = [...readTarGzipEntries(bytes).entries()].sort(([left], [right]) => portableCompare(left, right));
    const semanticIndex = entries.map(([name, body]) => `${name}\0${sha256(Buffer.from(semanticText(name, body)))}\n`).join("");
    return sha256(Buffer.from(semanticIndex));
  }
  return sha256(Buffer.from(semanticText(output, bytes)));
}

function volatileFieldsFor(output, bytes) {
  if (output.toLowerCase().endsWith(".tgz")) return ["gzip.mtime", "gzip.os", "tar.entries[].mtime", "payload.generated_at", "payload.release_date"];
  const text = bytes.toString("utf8");
  const fields = [];
  if (/^Generated: /m.test(text)) fields.push("Generated");
  if (/"generated_at"\s*:/.test(text)) fields.push("generated_at");
  if (/"release_date"\s*:/.test(text)) fields.push("release_date");
  return fields;
}

function globBaseRegex(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`);
}

async function expandSourcePatterns(root, sourcePatterns) {
  const found = [];
  for (const pattern of sourcePatterns) {
    if (pattern.includes("**") || path.dirname(pattern).includes("*") || path.dirname(pattern).includes("?")) {
      throw new Error(`Unsupported generated-artifact source pattern: ${pattern}`);
    }
    const directory = path.dirname(pattern).split(path.sep).join("/");
    const matcher = globBaseRegex(path.basename(pattern));
    const entries = await readdir(path.join(root, directory), { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && matcher.test(entry.name)) found.push(`${directory}/${entry.name}`);
    }
  }
  return [...new Set(found)].sort(portableCompare);
}

async function sourceSnapshot(root, sourcePaths, sourcePatterns) {
  const explicitPaths = [...new Set(sourcePaths)].sort(portableCompare);
  const patternPaths = await expandSourcePatterns(root, sourcePatterns);
  const inputs = [];
  for (const relativePath of [...new Set([...explicitPaths, ...patternPaths])].sort(portableCompare)) {
    const bytes = await readFile(path.join(root, relativePath));
    inputs.push({ path: relativePath, content_hash: sha256(bytes) });
  }
  const aggregate = inputs.map((item) => `${item.path}\0${item.content_hash}\n`).join("");
  return { explicit_paths: explicitPaths, patterns: [...sourcePatterns].sort(portableCompare), inputs, aggregate_hash: sha256(Buffer.from(aggregate)) };
}

export async function buildGeneratedArtifactManifest({
  root,
  outputs,
  sourcePaths,
  sourcePatterns = [],
  semanticTimestamp,
  timestampSource,
  generationSettings = {},
  generator = "scripts/generate-artifacts.mjs",
  regenerationCommand = "npm run generate"
}) {
  const normalizedOutputs = outputs instanceof Map ? outputs : new Map(Object.entries(outputs));
  const sourceSet = await sourceSnapshot(root, sourcePaths, sourcePatterns);
  const artifacts = [...normalizedOutputs.entries()]
    .sort(([left], [right]) => portableCompare(left, right))
    .map(([output, value]) => {
      const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
      return {
        source_inputs: ["primary"],
        generator,
        output,
        kind: output.toLowerCase().endsWith(".tgz") ? "gzip_tar" : "text",
        content_hash: sha256(bytes),
        semantic_hash: semanticHash(output, bytes),
        volatile_fields: volatileFieldsFor(output, bytes),
        tracked: true,
        expected_regeneration_command: regenerationCommand
      };
    });
  return {
    schema_version: "1.0.0",
    generated_at: semanticTimestamp,
    timestamp_source: timestampSource,
    generation_settings: generationSettings,
    source_sets: { primary: sourceSet },
    artifacts,
    duplicate_artifact_contracts: [{ primary: "public/install.tgz", mirror: "landing/install.tgz", comparison: "byte_identical" }]
  };
}

function textScanIssues(text, displayPath) {
  const issues = [];
  const control = text.match(CONTROL_PATTERN);
  if (control) issues.push({ code: "hidden_or_control_character", path: displayPath, detail: `U+${control[0].codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}` });
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(text)) {
      issues.push({ code: "secret_like_content", path: displayPath, detail: "Known credential shape detected; value redacted." });
      break;
    }
  }
  for (const pattern of LOCAL_PATH_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      issues.push({ code: "unexpected_local_path", path: displayPath, detail: match[1] || "Local file URI detected." });
      break;
    }
  }
  return issues;
}

function scanArtifact(output, bytes, kind) {
  if (kind === "gzip_tar") {
    const issues = [];
    for (const [name, body] of readTarGzipEntries(bytes)) {
      if (TEXT_EXTENSIONS.has(path.extname(name).toLowerCase())) issues.push(...textScanIssues(body.toString("utf8"), `${output}!/${name}`));
    }
    return issues;
  }
  return textScanIssues(bytes.toString("utf8"), output);
}

function trackedPaths(root) {
  try {
    return new Set(execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean).map((item) => item.split(path.sep).join("/")));
  } catch {
    return new Set();
  }
}

export async function auditGeneratedArtifacts({ root, manifestPath = ".vnem/generated-artifacts.json", expectedSemanticTimestamp, expectedGenerationSettings }) {
  const absoluteManifest = path.join(root, manifestPath);
  const issues = [];
  if (!existsSync(absoluteManifest)) {
    return { status: "fail", issues: [{ code: "generated_artifact_manifest_missing", path: manifestPath, detail: "Run npm run generate." }], safe_next_step: "Run npm run generate, inspect the generated diff, then rerun npm run generate:check." };
  }
  const manifest = JSON.parse(await readFile(absoluteManifest, "utf8"));
  if (expectedSemanticTimestamp && manifest.generated_at !== expectedSemanticTimestamp) {
    issues.push({ code: "generation_settings_mismatch", path: manifestPath, detail: `Expected semantic timestamp ${expectedSemanticTimestamp}; manifest records ${manifest.generated_at}.` });
  }
  for (const [key, expected] of Object.entries(expectedGenerationSettings || {})) {
    if (manifest.generation_settings?.[key] !== expected) {
      issues.push({ code: "generation_settings_mismatch", path: manifestPath, detail: `Expected generation setting ${key}=${expected}; manifest records ${manifest.generation_settings?.[key]}.` });
    }
  }
  const sourceStates = new Map();
  for (const [id, sourceSet] of Object.entries(manifest.source_sets || {})) {
    const expectedInputs = new Map((sourceSet.inputs || []).map((input) => [input.path, input]));
    const currentPaths = [...new Set([
      ...(sourceSet.explicit_paths || (sourceSet.inputs || []).map((input) => input.path)),
      ...await expandSourcePatterns(root, sourceSet.patterns || [])
    ])].sort(portableCompare);
    const actualInputs = [];
    for (const relativePath of currentPaths) {
      const input = expectedInputs.get(relativePath);
      const absolutePath = path.join(root, relativePath);
      if (!existsSync(absolutePath)) {
        issues.push({ code: "source_input_missing", path: relativePath, detail: `Source set ${id}` });
        continue;
      }
      const actualHash = sha256(await readFile(absolutePath));
      actualInputs.push({ path: relativePath, content_hash: actualHash });
      if (!input || actualHash !== input.content_hash) issues.push({ code: "source_changed_without_regeneration", path: relativePath, detail: `Source set ${id} no longer matches the generated manifest.` });
    }
    for (const relativePath of expectedInputs.keys()) {
      if (!currentPaths.includes(relativePath)) issues.push({ code: "source_changed_without_regeneration", path: relativePath, detail: `Source input was removed from source set ${id}.` });
    }
    const aggregate = actualInputs.sort((a, b) => portableCompare(a.path, b.path)).map((item) => `${item.path}\0${item.content_hash}\n`).join("");
    const changed = actualInputs.length !== (sourceSet.inputs || []).length || sha256(Buffer.from(aggregate)) !== sourceSet.aggregate_hash;
    sourceStates.set(id, changed);
    if (changed) issues.push({ code: "stale_generated_output", path: manifestPath, detail: `Source set ${id} changed; generated outputs must be regenerated.` });
  }

  const tracked = trackedPaths(root);
  const bytesByOutput = new Map();
  for (const artifact of manifest.artifacts || []) {
    const absolutePath = path.join(root, artifact.output);
    if (!existsSync(absolutePath)) {
      issues.push({ code: "generated_output_missing", path: artifact.output, detail: artifact.expected_regeneration_command });
      continue;
    }
    const bytes = await readFile(absolutePath);
    bytesByOutput.set(artifact.output, bytes);
    const contentMatches = sha256(bytes) === artifact.content_hash;
    if (!contentMatches) {
      const sourcesChanged = (artifact.source_inputs || []).some((id) => sourceStates.get(id));
      issues.push({
        code: artifact.kind === "gzip_tar" ? "archive_mismatch" : sourcesChanged ? "stale_or_partial_generated_output" : "modified_generated_output",
        path: artifact.output,
        detail: `Expected ${artifact.content_hash}; actual ${sha256(bytes)}.`
      });
    }
    if (semanticHash(artifact.output, bytes) !== artifact.semantic_hash) {
      issues.push({ code: "semantic_hash_mismatch", path: artifact.output, detail: "Semantic content differs from the generated manifest." });
    }
    if (artifact.tracked && !tracked.has(artifact.output)) issues.push({ code: "generated_output_not_tracked", path: artifact.output, detail: "Manifest declares this output as tracked." });
    try {
      issues.push(...scanArtifact(artifact.output, bytes, artifact.kind));
    } catch (error) {
      issues.push({ code: "binary_artifact_invalid", path: artifact.output, detail: error.message });
    }
  }

  for (const contract of manifest.duplicate_artifact_contracts || []) {
    const primary = bytesByOutput.get(contract.primary);
    const mirror = bytesByOutput.get(contract.mirror);
    if (!primary || !mirror || !primary.equals(mirror)) {
      issues.push({ code: "public_landing_archive_mismatch", path: `${contract.primary} <> ${contract.mirror}`, detail: "Tracked archive copies are not byte-identical." });
    }
  }

  return {
    status: issues.length ? "fail" : "pass",
    manifest: manifestPath,
    artifact_count: manifest.artifacts?.length || 0,
    source_input_count: Object.values(manifest.source_sets || {}).reduce((sum, set) => sum + (set.inputs?.length || 0), 0),
    text_artifacts_scanned: (manifest.artifacts || []).filter((item) => item.kind === "text").length,
    binary_artifacts_scanned: (manifest.artifacts || []).filter((item) => item.kind === "gzip_tar").length,
    issues,
    safe_next_step: issues.length ? "Run npm run generate, inspect the semantic diff, then rerun npm run generate:check." : "Generated artifacts match their source inputs and ownership manifest."
  };
}
