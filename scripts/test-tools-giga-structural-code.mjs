#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { classifyAdoptionTask, coreRecommendedToolsCalls } from "./vnem/core/intelligence.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const benchmarkArg = process.argv.find((arg) => arg.startsWith("--benchmark-output="));
const benchmarkOutput = benchmarkArg ? path.resolve(repoRoot, benchmarkArg.slice("--benchmark-output=".length)) : null;
const realRepoBenchmarkArg = process.argv.find((arg) => arg.startsWith("--real-repo-output="));
const realRepoBenchmarkOutput = realRepoBenchmarkArg ? path.resolve(repoRoot, realRepoBenchmarkArg.slice("--real-repo-output=".length)) : null;
const tempRoot = await mkdtemp(path.join(repoRoot, ".tmp", "structural-code-phase15-"));
const fixtureRoot = path.join(tempRoot, "workspace");
const evidenceRoot = path.join(fixtureRoot, ".vnem", "evidence");
const timings = {};
let stderr = "";

await createFixture(fixtureRoot);
await createLinkFixture(fixtureRoot).catch(() => {});

const client = new Client({ name: "vnem-tools-giga-structural-code-test", version: "1.0.1" }, { capabilities: {} });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(scriptDir, "vnem-tools-mcp-server.mjs")],
  cwd: repoRoot,
  env: {
    ...process.env,
    VNEM_TOOLS_ALLOWED_ROOTS: [fixtureRoot, repoRoot].join(path.delimiter),
    VNEM_TOOLS_EVIDENCE_ROOT: evidenceRoot,
    VNEM_TOOLS_PERMISSION_PROFILE: "approved-writes",
    VNEM_TOOLS_SKIP_WRANGLER_CHECK: "1"
  },
  stderr: "pipe"
});
transport.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });

try {
  await client.connect(transport);
  const listed = await client.listTools();
  const names = new Set(listed.tools.map((tool) => tool.name));
  const required = [
    "vnem_tools_structural_index_build",
    "vnem_tools_structural_graph_query",
    "vnem_tools_exact_symbol_references",
    "vnem_tools_refactor_rename_preview",
    "vnem_tools_refactor_move_preview",
    "vnem_tools_refactor_extract_plan",
    "vnem_tools_dead_code_candidates",
    "vnem_tools_refactor_impact_analyze",
    "vnem_tools_structural_patch_validate",
    "vnem_tools_refactor_apply_verify",
    "vnem_tools_refactor_transaction_rollback"
  ];
  for (const name of required) assert.ok(names.has(name), `missing Phase 15 tool ${name}`);
  const coverage = await ok("vnem_tools_tool_test_coverage_map", { root: repoRoot, max_tools: 250 });
  for (const name of required) {
    assert.equal(coverage.per_tool[name]?.coverage_level, "behavior_test", `${name} must map to real MCP behavior proof`);
    assert.ok(coverage.per_tool[name].behavior_test_files.includes("scripts/test-tools-giga-structural-code.mjs"));
  }

  const cold = await timed("cold_index_ms", () => ok("vnem_tools_structural_index_build", { root: fixtureRoot }));
  assert.equal(cold.operation_result, "structural_index_ready");
  assert.match(cold.parser_architecture.selected, /@babel\/parser ASTs and @babel\/traverse lexical bindings/);
  assert.equal(cold.parser_architecture.compiler_grade_claim, false);
  assert.equal(cold.storage.engine, "bounded_compact_json");
  assert.ok(cold.storage.persisted_bytes > 0);
  assert.ok(cold.graph_summary.package_boundaries >= 3);
  assert.equal(cold.graph_summary.package_edges, 1);
  assert.ok(cold.graph_summary.test_source >= 2);
  assert.ok(Object.keys(cold.language_confidence).some((key) => key.startsWith("javascript:babel_ast:ast")));
  assert.ok(Object.keys(cold.language_confidence).some((key) => key.startsWith("typescript:babel_ast:ast")));
  for (const language of ["python", "go", "rust"]) assert.ok(Object.keys(cold.language_confidence).some((key) => key.startsWith(`${language}:heuristic:medium`)));
  assert.ok(cold.inventory.skipped.some((item) => item.path === "public/assets/index-ABC12345.js" && item.reason === "generated_or_minified_bundle"));
  assert.ok(cold.inventory.skipped.some((item) => item.path === ".env.js" && item.reason === "secret_path"));
  assert.equal(Object.values(cold.graph_summary.truncation).some(Boolean), false);

  const incremental = await timed("incremental_index_ms", () => ok("vnem_tools_structural_index_build", { root: fixtureRoot }));
  assert.equal(incremental.build.incremental, true);
  assert.equal(incremental.build.reparsed_files, 0);
  assert.equal(incremental.build.reused_files, incremental.files);
  await writeFile(path.join(fixtureRoot, "go", "main.go"), "package fixture\n\nfunc RunTask() int { return 3 }\n", "utf8");
  const oneChanged = await ok("vnem_tools_structural_index_build", { root: fixtureRoot });
  assert.equal(oneChanged.build.reparsed_files, 1);
  assert.equal(oneChanged.build.reused_files, oneChanged.files - 1);

  const symbolQuery = await ok("vnem_tools_structural_graph_query", { root: fixtureRoot, symbol: "calculateTotal" });
  assert.ok(symbolQuery.symbols.some((item) => item.file === "src/math.mjs" && item.parser_type === "babel_ast"));
  const routeQuery = await ok("vnem_tools_structural_graph_query", { root: fixtureRoot, route: "/health" });
  assert.ok(routeQuery.routes.some((item) => item.path === "/health" && item.method === "GET"));
  const pythonQuery = await ok("vnem_tools_structural_graph_query", { root: fixtureRoot, language: "python" });
  assert.ok(pythonQuery.symbols.some((item) => item.name === "service_task" && item.parser_type === "heuristic"));
  const componentQuery = await ok("vnem_tools_structural_graph_query", { root: fixtureRoot, symbol: "Widget" });
  assert.ok(componentQuery.symbols.some((item) => item.file === "src/widget.jsx"));

  const references = await ok("vnem_tools_exact_symbol_references", { root: fixtureRoot, symbol: "calculateTotal", file: "src/math.mjs" });
  assert.equal(references.confidence, "high_for_babel_lexical_bindings_and_static_esm");
  assert.ok(references.reference_count >= 8);
  assert.ok(["src/math.mjs", "src/consumer.mjs", "src/noext.mjs", "test.mjs"].every((file) => references.references.some((item) => item.file === file)));
  assert.equal(references.references.some((item) => item.file === "src/consumer.mjs" && item.line === 9), false, "shadowed parameter reference was incorrectly bound to exported symbol");
  const jsxReferences = await ok("vnem_tools_exact_symbol_references", { root: fixtureRoot, symbol: "Widget", file: "src/widget.jsx" });
  assert.ok(jsxReferences.references.some((item) => item.context === "jsx_reference"));

  const publicBlocked = await ok("vnem_tools_refactor_rename_preview", { root: fixtureRoot, symbol: "calculateTotal", new_name: "computeTotal", file: "src/math.mjs", verify_scripts: ["test"] });
  assert.equal(publicBlocked.safe_to_apply, false);
  assert.ok(publicBlocked.blockers.some((item) => item.code === "public_export_change_requires_acknowledgement"));
  const collision = await ok("vnem_tools_refactor_rename_preview", { root: fixtureRoot, symbol: "calculateTotal", new_name: "baseline", file: "src/math.mjs", allow_public_api_change: true, verify_scripts: ["test"] });
  assert.ok(collision.blockers.some((item) => item.code === "rename_collision"));
  const shorthand = await ok("vnem_tools_refactor_rename_preview", { root: fixtureRoot, symbol: "shorthandValue", new_name: "renamedValue", file: "src/shorthand.mjs", verify_scripts: ["test"] });
  assert.ok(shorthand.blockers.some((item) => item.code === "object_shorthand_semantics_require_review"));
  const heuristicRename = await raw("vnem_tools_refactor_rename_preview", { root: fixtureRoot, symbol: "service_task", new_name: "renamed_task", file: "python/service.py", verify_scripts: ["test"] });
  assert.equal(heuristicRename.isError, true);
  assert.equal(heuristicRename.structuredContent.code, "rename_parser_not_exact");

  const move = await ok("vnem_tools_refactor_move_preview", { root: fixtureRoot, source_file: "src/math.mjs", target_file: "src/lib/math.mjs" });
  assert.equal(move.apply_supported, false);
  assert.ok(move.import_edits.some((item) => item.file === "src/noext.mjs" && item.new_source === "./lib/math"));
  const extract = await ok("vnem_tools_refactor_extract_plan", { root: fixtureRoot, file: "src/math.mjs", start_line: 1, end_line: 3, new_module_path: "src/lib/calculate.mjs" });
  assert.equal(extract.apply_supported, false);
  assert.ok(extract.selected_symbols.some((item) => item.name === "calculateTotal"));
  const deadCode = await ok("vnem_tools_dead_code_candidates", { root: fixtureRoot });
  assert.ok(deadCode.candidates.some((item) => item.name === "unusedHelper"));
  assert.ok(deadCode.must_not_claim.some((item) => /safe to delete/.test(item)));
  const impact = await ok("vnem_tools_refactor_impact_analyze", { root: fixtureRoot, changed_files: ["src/math.mjs"] });
  assert.ok(impact.impacted_files.includes("src/consumer.mjs"));
  assert.ok(impact.affected_tests.includes("test.mjs"));
  const valid = await ok("vnem_tools_structural_patch_validate", { root: fixtureRoot, changed_files: ["src/math.mjs", "src/consumer.mjs"] });
  assert.equal(valid.valid, true);
  await writeFile(path.join(fixtureRoot, "src", "broken.mjs"), "import './missing.mjs';\n", "utf8");
  const invalid = await ok("vnem_tools_structural_patch_validate", { root: fixtureRoot, changed_files: ["src/broken.mjs"] });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.unresolved_relative_imports.some((item) => item.from === "src/broken.mjs"));
  await rm(path.join(fixtureRoot, "src", "broken.mjs"), { force: true });

  const originals = await readFiles(fixtureRoot, ["src/math.mjs", "src/consumer.mjs", "src/noext.mjs", "test.mjs"]);
  const preview = await ok("vnem_tools_refactor_rename_preview", { root: fixtureRoot, symbol: "calculateTotal", new_name: "computeTotal", file: "src/math.mjs", allow_public_api_change: true, verify_scripts: ["test"] });
  assert.equal(preview.confidence, "high");
  assert.equal(preview.safe_to_apply, true);
  assert.ok(preview.affected_tests.includes("test.mjs"));
  assert.ok(preview.edits.some((item) => item.reason === "import_bound_reference"));

  const denied = await raw("vnem_tools_refactor_apply_verify", { preview_id: preview.preview_id, dry_run: false });
  assert.equal(denied.isError, true);
  assert.equal(denied.structuredContent.code, "approval_required");
  await writeFile(path.join(fixtureRoot, "src", "consumer.mjs"), `${originals["src/consumer.mjs"]}\n`, "utf8");
  const stale = await raw("vnem_tools_refactor_apply_verify", { preview_id: preview.preview_id, dry_run: false, approved: true, approval_note: "Phase 15 stale preview proof" });
  assert.equal(stale.isError, true);
  assert.equal(stale.structuredContent.code, "refactor_preview_stale");
  await writeFile(path.join(fixtureRoot, "src", "consumer.mjs"), originals["src/consumer.mjs"], "utf8");
  const dryApply = await ok("vnem_tools_refactor_apply_verify", { preview_id: preview.preview_id });
  assert.equal(dryApply.operation_result, "refactor_apply_planned");
  assert.equal(dryApply.executed, false);

  const applied = await timed("verified_apply_ms", () => ok("vnem_tools_refactor_apply_verify", { preview_id: preview.preview_id, dry_run: false, approved: true, approval_note: "Phase 15 binding-aware rename apply and verification proof", timeout_ms: 30000 }));
  assert.equal(applied.operation_result, "refactor_completed");
  assert.equal(applied.executed, true);
  assert.ok(applied.verification.every((item) => item.execution.ok && !item.execution.worktree_delta_detected));
  assert.equal(applied.post_reference_check.old_definition_count, 0);
  assert.equal(applied.post_reference_check.old_static_import_count, 0);
  assert.equal(applied.post_reference_check.old_static_reexport_count, 0);
  assert.equal(applied.post_reference_check.new_definition_count, 1);
  const afterApply = await readFiles(fixtureRoot, Object.keys(originals));
  assert.match(afterApply["src/math.mjs"], /function computeTotal/);
  assert.match(afterApply["src/consumer.mjs"], /computeTotal\(4, 5\)/);
  assert.match(afterApply["src/consumer.mjs"], /shadow\(calculateTotal\)/);
  assert.match(afterApply["src/consumer.mjs"], /return calculateTotal \+ 1/);
  assert.match(afterApply["test.mjs"], /computeTotal\(3, 4\)/);

  const rollbackPlan = await ok("vnem_tools_refactor_transaction_rollback", { root: fixtureRoot, transaction_id: applied.transaction_id });
  assert.equal(rollbackPlan.operation_result, "refactor_rollback_planned");
  await writeFile(path.join(fixtureRoot, "src", "math.mjs"), `${afterApply["src/math.mjs"]}\n`, "utf8");
  const staleRollback = await raw("vnem_tools_refactor_transaction_rollback", { root: fixtureRoot, transaction_id: applied.transaction_id, dry_run: false, approved: true, approval_note: "Phase 15 stale rollback rejection proof" });
  assert.equal(staleRollback.isError, true);
  assert.equal(staleRollback.structuredContent.code, "refactor_rollback_stale");
  await writeFile(path.join(fixtureRoot, "src", "math.mjs"), afterApply["src/math.mjs"], "utf8");
  const rolledBack = await timed("explicit_rollback_ms", () => ok("vnem_tools_refactor_transaction_rollback", { root: fixtureRoot, transaction_id: applied.transaction_id, dry_run: false, approved: true, approval_note: "Phase 15 exact transaction rollback proof", timeout_ms: 30000 }));
  assert.equal(rolledBack.operation_result, "refactor_rollback_completed");
  assert.equal(rolledBack.hashes_match, true);
  assert.ok(rolledBack.verification.every((item) => item.execution.ok));
  assert.deepEqual(await readFiles(fixtureRoot, Object.keys(originals)), originals);

  const packagePath = path.join(fixtureRoot, "package.json");
  const packageBefore = await readFile(packagePath, "utf8");
  const failureBefore = await readFile(path.join(fixtureRoot, "src", "failure.mjs"), "utf8");
  const failurePreview = await ok("vnem_tools_refactor_rename_preview", { root: fixtureRoot, symbol: "internalValue", new_name: "internalAmount", file: "src/failure.mjs", verify_scripts: ["test"] });
  assert.equal(failurePreview.safe_to_apply, true);
  const failingPackage = JSON.parse(packageBefore);
  failingPackage.scripts.test = "node fail.mjs";
  await writeFile(packagePath, `${JSON.stringify(failingPackage, null, 2)}\n`, "utf8");
  const failedApply = await raw("vnem_tools_refactor_apply_verify", { preview_id: failurePreview.preview_id, dry_run: false, approved: true, approval_note: "Phase 15 automatic verification failure rollback proof", timeout_ms: 30000 });
  assert.equal(failedApply.isError, true);
  assert.equal(failedApply.structuredContent.code, "failed_rolled_back");
  assert.equal(failedApply.structuredContent.rollback.completed, true);
  assert.equal(await readFile(path.join(fixtureRoot, "src", "failure.mjs"), "utf8"), failureBefore);
  await writeFile(packagePath, packageBefore, "utf8");

  const structuralManifest = await ok("vnem_tools_manifest", { capability_group: "structural_code" });
  const refactorManifest = await ok("vnem_tools_manifest", { capability_group: "structural_refactoring" });
  assert.equal(structuralManifest.tools.length, 4);
  assert.equal(refactorManifest.tools.length, 7);
  assert.ok([...structuralManifest.tools, ...refactorManifest.tools].every((item) => item.reliability_level === "local_tested"));
  const status = await ok("vnem_tools_status", {});
  assert.equal(status.structural_code_policy.automatic_apply_scope, "high-confidence lexical-binding rename only");
  assert.equal(status.structural_code_policy.move_and_extract_apply_supported, false);
  const router = await ok("vnem_tools_capability_router", { user_goal: "Rename the exported calculateTotal symbol safely and prove rollback", task_type: "refactor", available_context: { root: fixtureRoot, symbol: "calculateTotal" } });
  assert.equal(router.exact_call_sequence[0].tool, "vnem_tools_structural_index_build");
  assert.ok(router.exact_call_sequence.some((item) => item.tool === "vnem_tools_refactor_apply_verify"));
  assert.ok(router.exact_call_sequence.some((item) => item.tool === "vnem_tools_refactor_transaction_rollback"));

  const classification = classifyAdoptionTask("Rename the exported calculateTotal symbol safely and prove rollback", "", "refactor");
  const coreTools = coreRecommendedToolsCalls(classification, { user_goal: "Rename the exported calculateTotal symbol safely and prove rollback", task_mode: "refactor" });
  assert.deepEqual(coreTools, ["vnem_tools_structural_index_build", "vnem_tools_exact_symbol_references", "vnem_tools_refactor_impact_analyze", "vnem_tools_refactor_rename_preview", "vnem_tools_refactor_apply_verify", "vnem_tools_refactor_transaction_rollback"]);

  if (benchmarkOutput) {
    const benchmark = {
      phase: 15,
      generated_at: new Date().toISOString(),
      architecture: cold.parser_architecture,
      storage: cold.storage,
      graph_summary: cold.graph_summary,
      language_confidence: cold.language_confidence,
      timings_ms: timings,
      tools_exercised: required,
      proof: {
        real_stdio_mcp: true,
        lexical_binding_shadow_exclusion: true,
        jsx_reference_resolution: true,
        incremental_single_file_reparse: oneChanged.build.reparsed_files === 1,
        generated_bundle_skipped: true,
        public_api_collision_shorthand_and_heuristic_gates: true,
        successful_apply_test_post_reference_and_explicit_rollback: true,
        stale_apply_and_stale_rollback_rejected: true,
        failed_test_automatic_rollback: true,
        move_extract_apply_disabled: true,
        core_and_tools_routing: true
      }
    };
    await mkdir(path.dirname(benchmarkOutput), { recursive: true });
    await writeFile(benchmarkOutput, `${JSON.stringify(benchmark, null, 2)}\n`, "utf8");
  }

  if (realRepoBenchmarkOutput) {
    const realTimings = {};
    const measure = async (name, fn) => {
      const started = performance.now();
      const result = await fn();
      realTimings[name] = Math.round((performance.now() - started) * 100) / 100;
      return result;
    };
    const realCold = await measure("cold_index_ms", () => ok("vnem_tools_structural_index_build", { root: repoRoot, refresh: true }));
    const realIncremental = await measure("incremental_index_ms", () => ok("vnem_tools_structural_index_build", { root: repoRoot }));
    const realQuery = await measure("symbol_query_ms", () => ok("vnem_tools_structural_graph_query", { root: repoRoot, symbol: "StructuralCodeRuntime", limit: 25 }));
    const realImpact = await measure("impact_query_ms", () => ok("vnem_tools_refactor_impact_analyze", { root: repoRoot, changed_files: ["scripts/vnem/tools/structural-code.mjs"] }));
    assert.equal(realIncremental.build.reparsed_files, 0);
    assert.equal(realIncremental.build.reused_files, realIncremental.files);
    assert.ok(realQuery.symbols.some((item) => item.file === "scripts/vnem/tools/structural-code.mjs"));
    assert.ok(realImpact.impacted_files.includes("scripts/vnem/tools/server.mjs"));
    const benchmark = {
      phase: 15,
      generated_at: new Date().toISOString(),
      scope: "real_repository_read_only",
      repository: ".",
      architecture: realCold.parser_architecture,
      storage: realCold.storage,
      files: realCold.files,
      symbols: realCold.symbols,
      graph_summary: realCold.graph_summary,
      language_confidence: realCold.language_confidence,
      inventory: {
        skipped_count: realCold.inventory.skipped.length,
        skipped_generated_count: realCold.inventory.skipped.filter((item) => item.reason === "generated_or_minified_bundle").length,
        truncated: realCold.inventory.truncated
      },
      incremental: realIncremental.build,
      timings_ms: realTimings,
      query_sample: {
        symbol: "StructuralCodeRuntime",
        result_count: realQuery.result_count,
        files: [...new Set(realQuery.symbols.map((item) => item.file))]
      },
      impact_sample: {
        changed_files: realImpact.changed_files,
        impacted_file_count: realImpact.impacted_files.length,
        affected_tests: realImpact.affected_tests,
        confidence: realImpact.confidence
      },
      proof: {
        real_stdio_mcp: true,
        current_repository_indexed: true,
        persisted_index_reused_without_reparse: true,
        structural_symbol_query_returned_source: true,
        structural_impact_query_returned_server_importer: true,
        process_spawn_test_edge_inferred: false,
        repository_files_mutated: false,
        graph_truncated: Object.values(realCold.graph_summary.truncation).some(Boolean)
      },
      limitations: [...realCold.limitations, "The test-to-source graph does not infer a test edge when a test spawns the MCP server instead of statically importing the implementation."]
    };
    await mkdir(path.dirname(realRepoBenchmarkOutput), { recursive: true });
    await writeFile(realRepoBenchmarkOutput, `${JSON.stringify(benchmark, null, 2)}\n`, "utf8");
  }
} finally {
  await client.close().catch(() => {});
  await rm(tempRoot, { recursive: true, force: true }).catch(() => {});
  if (stderr.trim()) process.stderr.write(stderr);
}

console.log("VNEM GIGA Phase 15 structural code tests passed");

async function raw(name, args) {
  return client.callTool({ name, arguments: args });
}

async function ok(name, args) {
  const result = await raw(name, args);
  assert.notEqual(result.isError, true, `${name} failed: ${JSON.stringify(result.structuredContent)}`);
  const key = Object.keys(result.structuredContent || {}).find((item) => item !== "error");
  assert.ok(key, `${name} returned no structured content`);
  return result.structuredContent[key];
}

async function timed(name, fn) {
  const started = performance.now();
  const result = await fn();
  timings[name] = Math.round((performance.now() - started) * 100) / 100;
  return result;
}

async function readFiles(root, files) {
  return Object.fromEntries(await Promise.all(files.map(async (file) => [file, await readFile(path.join(root, file), "utf8")])));
}

async function write(root, relative, value) {
  const target = path.join(root, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, value, "utf8");
}

async function createFixture(root) {
  const packageJson = {
    name: "phase15-structural-fixture",
    private: true,
    type: "module",
    scripts: { test: "node test.mjs", validate: "node --check src/math.mjs" }
  };
  await write(root, "package.json", `${JSON.stringify(packageJson, null, 2)}\n`);
  await write(root, "src/math.mjs", [
    "export function calculateTotal(left, right) {",
    "  return left + right;",
    "}",
    "",
    "export const baseline = calculateTotal(2, 3);",
    ""
  ].join("\n"));
  await write(root, "src/consumer.mjs", [
    "import { calculateTotal } from './math.mjs';",
    "import { calculateTotal as total } from './math.mjs';",
    "",
    "export function run() {",
    "  return calculateTotal(4, 5) + total(1, 1);",
    "}",
    "",
    "export function shadow(calculateTotal) {",
    "  return calculateTotal + 1;",
    "}",
    ""
  ].join("\n"));
  await write(root, "src/noext.mjs", "import { calculateTotal } from './math';\nexport const noext = calculateTotal(1, 2);\n");
  await write(root, "src/widget.jsx", "export function Widget() { return <section>ready</section>; }\nexport function Screen() { return <Widget />; }\n");
  await write(root, "src/types.ts", "export interface User { id: number }\nexport function formatUser(user: User): string { return String(user.id); }\n");
  await write(root, "src/api.mjs", "const app = { get() {} };\nfunction health() { return 'ok'; }\napp.get('/health', health);\n");
  await write(root, "src/dead.mjs", "function unusedHelper() { return 17; }\nexport function liveHelper() { return 18; }\n");
  await write(root, "src/shorthand.mjs", "const shorthandValue = 4;\nexport const payload = { shorthandValue };\n");
  await write(root, "src/failure.mjs", "const internalValue = 2;\nexport function readInternal() { return internalValue; }\n");
  await write(root, "python/service.py", "def service_task(value):\n    return value + 1\n\nclass Worker:\n    pass\n");
  await write(root, "go/main.go", "package fixture\n\nfunc RunTask() int { return 2 }\n");
  await write(root, "rust/lib.rs", "pub fn rust_task() -> i32 { 3 }\n");
  await write(root, "packages/a/package.json", "{\"name\":\"@fixture/a\",\"type\":\"module\"}\n");
  await write(root, "packages/a/index.mjs", "export const packageValue = 1;\n");
  await write(root, "packages/b/package.json", "{\"name\":\"@fixture/b\",\"type\":\"module\",\"dependencies\":{\"@fixture/a\":\"workspace:*\"}}\n");
  await write(root, "packages/b/index.mjs", "import { packageValue } from '@fixture/a';\nexport const packageResult = packageValue + 1;\n");
  await write(root, "test.mjs", "import assert from 'node:assert/strict';\nimport { calculateTotal } from './src/math.mjs';\nimport { run, shadow } from './src/consumer.mjs';\nassert.equal(calculateTotal(3, 4), 7);\nassert.equal(run(), 11);\nassert.equal(shadow(8), 9);\n");
  await write(root, "fail.mjs", "process.exitCode = 1;\n");
  await write(root, "public/assets/index-ABC12345.js", "var generatedBundle = 1;\n");
  await write(root, ".env.js", "export const hiddenFixtureValue = 'must-not-index';\n");
}

async function createLinkFixture(root) {
  const outside = path.join(path.dirname(root), "outside");
  await write(outside, "escaped.js", "export function escapedSymbol() { return true; }\n");
  await symlink(outside, path.join(root, "linked-outside"), process.platform === "win32" ? "junction" : "dir");
}
