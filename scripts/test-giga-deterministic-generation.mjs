#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  auditGeneratedArtifacts,
  buildGeneratedArtifactManifest,
  createDeterministicTarGzip,
  readTarGzipEntries,
  resolveGenerationClock,
  sha256
} from "./vnem/generation/generated-artifacts.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const checks = [];
const check = (condition, name) => {
  assert.ok(condition, name);
  checks.push(name);
};

function runGenerator() {
  const started = performance.now();
  const result = spawnSync(process.execPath, ["scripts/generate-artifacts.mjs"], { cwd: root, env: process.env, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return Number((performance.now() - started).toFixed(3));
}

function runScript(script) {
  const result = spawnSync(process.execPath, [script], { cwd: root, env: process.env, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

async function generatedSnapshot() {
  const manifestBytes = await readFile(path.join(root, ".vnem", "generated-artifacts.json"));
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const hashes = {};
  for (const artifact of manifest.artifacts) hashes[artifact.output] = sha256(await readFile(path.join(root, artifact.output)));
  return { manifest, manifest_hash: sha256(manifestBytes), hashes };
}

async function writeFixture(fixtureRoot) {
  await rm(path.join(fixtureRoot, "inputs"), { recursive: true, force: true });
  await mkdir(path.join(fixtureRoot, ".vnem"), { recursive: true });
  await mkdir(path.join(fixtureRoot, "inputs"), { recursive: true });
  await mkdir(path.join(fixtureRoot, "public"), { recursive: true });
  await mkdir(path.join(fixtureRoot, "landing"), { recursive: true });
  await writeFile(path.join(fixtureRoot, "source.txt"), "source-v1\n");
  await writeFile(path.join(fixtureRoot, "inputs", "a.json"), "{\"source\":1}\n");
  const text = Buffer.from("Generated: 2026-07-08T21:12:40.970Z\nfixture\n");
  const archive = createDeterministicTarGzip({ "payload.json": "{\n  \"generated_at\": \"2026-07-08T21:12:40.970Z\",\n  \"ok\": true\n}\n" }, { epochSeconds: 1720463560 });
  const outputs = new Map([
    ["out.txt", text],
    ["public/install.tgz", archive],
    ["landing/install.tgz", archive]
  ]);
  for (const [relativePath, bytes] of outputs) {
    await mkdir(path.dirname(path.join(fixtureRoot, relativePath)), { recursive: true });
    await writeFile(path.join(fixtureRoot, relativePath), bytes);
  }
  const manifest = await buildGeneratedArtifactManifest({
    root: fixtureRoot,
    outputs,
    sourcePaths: ["source.txt"],
    sourcePatterns: ["inputs/*.json"],
    semanticTimestamp: "2026-07-08T21:12:40.970Z",
    timestampSource: "test-fixture",
    generator: "fixture-generator",
    regenerationCommand: "fixture:generate"
  });
  for (const artifact of manifest.artifacts) artifact.tracked = false;
  await writeFile(path.join(fixtureRoot, ".vnem", "generated-artifacts.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return { text, archive, manifest };
}

function issueCodes(report) {
  return new Set(report.issues.map((issue) => issue.code));
}

const generationMs = [];
generationMs.push(runGenerator());
const first = await generatedSnapshot();
generationMs.push(runGenerator());
const second = await generatedSnapshot();

check(first.manifest_hash === second.manifest_hash, "manifest is byte-identical across identical generation runs");
check(JSON.stringify(first.hashes) === JSON.stringify(second.hashes), "all generated artifact hashes are stable");
const textOutputs = first.manifest.artifacts.filter((artifact) => artifact.kind === "text").map((artifact) => artifact.output);
check(textOutputs.every((output) => first.hashes[output] === second.hashes[output]), "generated text is byte-identical");
check(first.hashes["public/install.tgz"] === second.hashes["public/install.tgz"], "install archive is byte-identical");
check(first.hashes["public/install.tgz"] === first.hashes["landing/install.tgz"], "public and landing archives are synchronized");
check(first.manifest.artifacts.every((artifact) => artifact.source_inputs && artifact.generator && artifact.output && artifact.content_hash && artifact.semantic_hash && Array.isArray(artifact.volatile_fields) && artifact.tracked === true && artifact.expected_regeneration_command), "manifest records required ownership fields");
check(first.manifest.source_sets.primary.inputs.length > 400, "manifest binds the full registry source set");
check(first.manifest.source_sets.primary.patterns.includes("discovery/candidates/hermes*.json"), "manifest scopes discovery inputs to committed Hermes reports");
check(!first.manifest.source_sets.primary.inputs.some((input) => input.path === "discovery/candidates/link-report.json"), "ignored discovery runtime reports cannot affect deterministic generation");
check(resolveGenerationClock({ sourceDateEpoch: "1700000000", semanticTimestamp: "invalid" }).iso === "2023-11-14T22:13:20.000Z", "SOURCE_DATE_EPOCH is supported");
runScript("scripts/generate-digest.mjs");
const firstDigestHash = sha256(await readFile(path.join(root, "discovery", "daily-digest.md")));
runScript("scripts/generate-digest.mjs");
const secondDigestHash = sha256(await readFile(path.join(root, "discovery", "daily-digest.md")));
check(firstDigestHash === secondDigestHash && firstDigestHash === first.hashes["discovery/daily-digest.md"], "standalone digest generator is byte-identical and manifest-owned");

const orderedArchive = createDeterministicTarGzip({ "b.txt": "b", "a.txt": "a" }, { epochSeconds: 1720463560 });
const reversedArchive = createDeterministicTarGzip({ "a.txt": "a", "b.txt": "b" }, { epochSeconds: 1720463560 });
check(orderedArchive.equals(reversedArchive), "archive input order cannot change bytes");
check([...orderedArchive.subarray(4, 8)].every((byte) => byte === 0) && orderedArchive[9] === 255, "gzip volatile header fields are normalized");
check([...readTarGzipEntries(orderedArchive).keys()].join(",") === "a.txt,b.txt", "tar entries use deterministic path order");

await mkdir(path.join(root, ".tmp"), { recursive: true });
const fixtureRoot = await mkdtemp(path.join(root, ".tmp", "phase21-artifacts-"));
try {
  let fixture = await writeFixture(fixtureRoot);
  let report = await auditGeneratedArtifacts({ root: fixtureRoot });
  check(report.status === "pass" && !issueCodes(report).has("hidden_or_control_character"), "valid gzip bytes are scanned as an archive, not source text");

  await writeFile(path.join(fixtureRoot, "source.txt"), "source-v2\n");
  report = await auditGeneratedArtifacts({ root: fixtureRoot });
  check(issueCodes(report).has("source_changed_without_regeneration") && issueCodes(report).has("stale_generated_output"), "source changes without regeneration are detected");

  fixture = await writeFixture(fixtureRoot);
  await writeFile(path.join(fixtureRoot, "inputs", "b.json"), "{\"source\":2}\n");
  report = await auditGeneratedArtifacts({ root: fixtureRoot });
  check(issueCodes(report).has("source_changed_without_regeneration"), "new source files matching a manifest pattern are detected");

  fixture = await writeFixture(fixtureRoot);
  await writeFile(path.join(fixtureRoot, "out.txt"), "manually modified\n");
  report = await auditGeneratedArtifacts({ root: fixtureRoot });
  check(issueCodes(report).has("modified_generated_output"), "modified generated text is detected");

  fixture = await writeFixture(fixtureRoot);
  const mismatchedArchive = createDeterministicTarGzip({ "payload.json": "{\"ok\":false}\n" }, { epochSeconds: 1720463560 });
  await writeFile(path.join(fixtureRoot, "public", "install.tgz"), mismatchedArchive);
  report = await auditGeneratedArtifacts({ root: fixtureRoot });
  check(issueCodes(report).has("archive_mismatch") && issueCodes(report).has("public_landing_archive_mismatch"), "archive and public/landing mismatches are detected");

  fixture = await writeFixture(fixtureRoot);
  await writeFile(path.join(fixtureRoot, "out.txt"), "C:\\Users\\person\\private\\file.txt\n");
  report = await auditGeneratedArtifacts({ root: fixtureRoot });
  check(issueCodes(report).has("unexpected_local_path"), "unexpected local paths are detected");

  fixture = await writeFixture(fixtureRoot);
  await writeFile(path.join(fixtureRoot, "out.txt"), "ghp_1234567890abcdefghijkl\n");
  report = await auditGeneratedArtifacts({ root: fixtureRoot });
  check(issueCodes(report).has("secret_like_content"), "secret-like content is detected without disclosure");

  fixture = await writeFixture(fixtureRoot);
  await writeFile(path.join(fixtureRoot, "out.txt"), `safe${String.fromCodePoint(0x202e)}hidden\n`);
  report = await auditGeneratedArtifacts({ root: fixtureRoot });
  check(issueCodes(report).has("hidden_or_control_character"), "hidden and bidirectional controls are detected in text");

  fixture = await writeFixture(fixtureRoot);
  report = await auditGeneratedArtifacts({ root: fixtureRoot, expectedSemanticTimestamp: "2030-01-01T00:00:00.000Z" });
  check(issueCodes(report).has("generation_settings_mismatch"), "generation setting drift is detected");
} finally {
  await rm(fixtureRoot, { recursive: true, force: true });
}

const liveAudit = await auditGeneratedArtifacts({ root });
check(liveAudit.status === "pass", "real repository generated-artifact audit passes");

const mcpClient = new Client({ name: "vnem-giga-phase21", version: "1.0.1" }, { capabilities: {} });
const mcpTransport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(root, "scripts", "vnem-tools-mcp-server.mjs")],
  cwd: root,
  env: { ...process.env, VNEM_TOOLS_ALLOWED_ROOTS: root, VNEM_TOOLS_PERMISSION_PROFILE: "safe-readonly" },
  stderr: "pipe"
});
let mcpClassification = "";
try {
  await mcpClient.connect(mcpTransport);
  const mcpResult = await mcpClient.callTool({
    name: "vnem_tools_ci_failure_diagnose",
    arguments: {
      root,
      workflow_path: ".github/workflows/ci.yml",
      job: "validate-and-build",
      step: "npm run generate:check",
      command: "npm run generate:check",
      run_id: "phase21-local-proof",
      log: "Generated artifact audit: FAIL\n- source_changed_without_regeneration: registry/entries/example/entry.yaml\n- stale_generated_output: .vnem/generated-artifacts.json",
      changed_files: ["scripts/generate-artifacts.mjs"]
    }
  });
  assert.notEqual(mcpResult.isError, true, JSON.stringify(mcpResult.structuredContent));
  mcpClassification = mcpResult.structuredContent.ci_failure_diagnosis.classification;
  check(mcpClassification === "generated_artifact_mismatch", "real Tools stdio MCP classifies generated-artifact CI failures");
} finally {
  await mcpTransport.close();
}

const benchmarkPath = valueAfter("--benchmark-output");
if (benchmarkPath) {
  const outputPath = path.resolve(root, benchmarkPath);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify({
    schema_version: "1.0.0",
    phase: 21,
    benchmark_type: "deterministic_generation_and_artifact_hygiene",
    generation_runs_ms: generationMs,
    artifact_count: liveAudit.artifact_count,
    source_input_count: liveAudit.source_input_count,
    text_artifacts_scanned: liveAudit.text_artifacts_scanned,
    binary_artifacts_scanned: liveAudit.binary_artifacts_scanned,
    real_stdio_mcp: true,
    mcp_ci_classification: mcpClassification,
    checks: checks.length,
    status: "pass"
  }, null, 2)}\n`);
}

console.log(`Phase 21 deterministic generation regression passed (${checks.length} checks; ${liveAudit.artifact_count} artifacts).`);

function valueAfter(flag) {
  const inline = process.argv.find((value) => value.startsWith(`${flag}=`));
  if (inline) return inline.slice(flag.length + 1);
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : null;
}
