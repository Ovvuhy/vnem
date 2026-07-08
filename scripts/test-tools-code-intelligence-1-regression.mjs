import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const selectedCase = (process.argv.find((arg) => arg.startsWith("--case=")) || "").slice("--case=".length);
const allCases = ["symbol-map", "mcp-surface-audit", "patch-target-finder", "tool-test-coverage-map", "source-impact-trace", "source-control-character-guard", "regression"];
const casesToRun = selectedCase ? [selectedCase] : allCases;
assert.ok(casesToRun.every((item) => allCases.includes(item)), `unknown case ${selectedCase}`);

await mkdir(path.join(rootDir, ".tmp"), { recursive: true });

async function withCodeIntelligenceTools(fn) {
  const tmpRoot = await mkdtemp(path.join(rootDir, ".tmp", "code-intelligence-1-"));
  const workspace = path.join(tmpRoot, "workspace");
  const repo = path.join(workspace, "repo");
  await setupFixtureRepo(repo);
  const client = new Client({ name: "code-intelligence-1-test", version: "1.0.1" }, { capabilities: {} });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(scriptDir, "vnem-tools-mcp-server.mjs")],
    cwd: rootDir,
    env: {
      ...process.env,
      VNEM_TOOLS_ALLOWED_ROOTS: workspace,
      VNEM_TOOLS_EVIDENCE_ROOT: path.join(workspace, ".vnem", "tool-runs"),
      VNEM_TOOLS_SKIP_WRANGLER_CHECK: "1",
      VNEM_TOOLS_GITHUB_ALLOWED_REPOS: "fixture/code-intelligence"
    },
    stderr: "pipe"
  });
  let stderr = "";
  transport.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });
  try {
    await client.connect(transport);
    return await fn({ client, repo });
  } finally {
    await client.close().catch(() => {});
    await rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
    if (stderr.trim()) process.stderr.write(stderr);
  }
}

async function setupFixtureRepo(repo) {
  await mkdir(path.join(repo, "src"), { recursive: true });
  await mkdir(path.join(repo, "scripts"), { recursive: true });
  await mkdir(path.join(repo, "tests"), { recursive: true });
  await mkdir(path.join(repo, "node_modules", "ignored"), { recursive: true });
  await mkdir(path.join(repo, "public"), { recursive: true });
  await writeFile(path.join(repo, "package.json"), JSON.stringify({
    type: "module",
    scripts: {
      "test:tools-real-feature": "node scripts/test-tools-real-feature.mjs",
      "test:tools-registration-only": "node scripts/test-tools-registration-only.mjs",
      "test:tools-code-intelligence-1-regression": "node scripts/test-tools-code-intelligence-1-regression.mjs",
      "tools:readiness": "node scripts/tools-readiness-report.mjs",
      validate: "node --check src/app.js"
    }
  }, null, 2));
  await writeFile(path.join(repo, "src", "app.js"), [
    "export async function loadUser() { return { id: 1 }; }",
    "export function renderWidget() { return 'widget'; }",
    "export class WidgetController { start() { return renderWidget(); } }",
    "const helperArrow = () => 'helper';",
    "const assignedHandler = async function assignedHandler() { return helperArrow(); };"
  ].join("\n"));
  await writeFile(path.join(repo, "scripts", "vnem-tools-mcp-server.mjs"), [
    "const mcpServer = { registerTool() {} };",
    "function toolResult(text, structuredContent) { return { text, structuredContent }; }",
    "mcpServer.registerTool(\"vnem_tools_real_feature\", {}, async (args) => {",
    "  const result = await realFeatureHandler(args);",
    "  return toolResult('ok', { real_feature: result });",
    "});",
    "mcpServer.registerTool(\"vnem_tools_registration_only\", {}, async () => toolResult('registered only', { registration_only: true }));",
    "export async function realFeatureHandler(args) { return { ok: true, args }; }",
    "function orphanHandler() { return true; }",
    "export function buildToolCatalog() { return ['vnem_tools_real_feature', 'vnem_tools_registration_only']; }"
  ].join("\n"));
  await writeFile(path.join(repo, "scripts", "tools-readiness-report.mjs"), "const requiredTools = ['vnem_tools_real_feature'];\nconsole.log(requiredTools.join(','));\n");
  await writeFile(path.join(repo, "scripts", "test-tools-real-feature.mjs"), [
    "const client = { callTool() {} };",
    "await client.callTool({ name: \"vnem_tools_real_feature\", arguments: { sample: true } });"
  ].join("\n"));
  await writeFile(path.join(repo, "scripts", "test-tools-registration-only.mjs"), [
    "const tools = new Set(['vnem_tools_registration_only']);",
    "if (!tools.has(\"vnem_tools_registration_only\")) throw new Error('missing tool');"
  ].join("\n"));
  await writeFile(path.join(repo, "tests", "app.test.js"), "import { loadUser } from '../src/app.js';\nif (!(await loadUser()).id) throw new Error('bad user');\n");
  await writeFile(path.join(repo, "node_modules", "ignored", "noise.js"), "function mustNotScan() { throw new Error('noise'); }\n");
  await writeFile(path.join(repo, "public", "install.tgz"), "generated placeholder\n");
}

async function call(client, name, args) {
  const result = await client.callTool({ name, arguments: args });
  const key = Object.keys(result.structuredContent).find((item) => item !== "error");
  return result.structuredContent[key];
}

function text(value) {
  return JSON.stringify(value);
}

await withCodeIntelligenceTools(async ({ client, repo }) => {
  const tools = new Set((await client.listTools()).tools.map((tool) => tool.name));
  for (const name of ["vnem_tools_code_symbol_map", "vnem_tools_mcp_surface_audit", "vnem_tools_patch_target_finder", "vnem_tools_tool_test_coverage_map", "vnem_tools_source_impact_trace", "vnem_tools_source_control_character_guard"]) {
    assert.equal(tools.has(name), true, `missing ${name}`);
  }

  if (casesToRun.includes("symbol-map")) {
    const map = await call(client, "vnem_tools_code_symbol_map", { root: repo, max_files: 80, max_symbols: 80 });
    assert.equal(map.operation_result, "reported");
    assert.equal(map.parser_type, "lightweight-regex-heuristic");
    assert.ok(map.files_scanned >= 3);
    assert.ok(map.top_symbols.some((symbol) => symbol.name === "loadUser" && symbol.exported));
    assert.ok(map.top_symbols.some((symbol) => symbol.name === "WidgetController" && symbol.kind === "class"));
    assert.ok(map.top_symbols.some((symbol) => symbol.name === "helperArrow" && symbol.kind === "arrow_function"));
    assert.ok(map.tool_related_symbols.some((symbol) => symbol.name === "vnem_tools_real_feature" || symbol.file.includes("vnem-tools-mcp-server")));
    assert.doesNotMatch(text(map), /mustNotScan/);
    assert.equal(map.output_compact, true);
  }

  if (casesToRun.includes("mcp-surface-audit")) {
    const audit = await call(client, "vnem_tools_mcp_surface_audit", { root: repo });
    assert.equal(audit.operation_result, "reported");
    const real = audit.tools.find((tool) => tool.name === "vnem_tools_real_feature");
    const registrationOnly = audit.tools.find((tool) => tool.name === "vnem_tools_registration_only");
    assert.ok(real.handler_candidates.includes("realFeatureHandler"));
    assert.equal(real.coverage_level, "behavior_test");
    assert.equal(real.readiness_referenced, true);
    assert.equal(registrationOnly.coverage_level, "registration_only");
    assert.ok(audit.registration_only_risks.includes("vnem_tools_registration_only"));
    assert.ok(audit.missing_tests.includes("vnem_tools_registration_only"));
  }

  if (casesToRun.includes("patch-target-finder")) {
    const byTool = await call(client, "vnem_tools_patch_target_finder", { root: repo, tool_name: "vnem_tools_real_feature" });
    assert.equal(byTool.confidence, "high");
    assert.ok(byTool.likely_source_files.some((item) => item.path === "scripts/vnem-tools-mcp-server.mjs"));
    assert.ok(byTool.likely_functions.some((item) => item.name === "realFeatureHandler"));
    assert.ok(byTool.likely_tests.some((item) => item.path === "scripts/test-tools-real-feature.mjs"));
    const byGoal = await call(client, "vnem_tools_patch_target_finder", { root: repo, user_goal: "make registration-only tool real with behavior proof" });
    assert.ok(byGoal.likely_source_files.some((item) => item.path === "scripts/vnem-tools-mcp-server.mjs"));
    assert.ok(byGoal.likely_tests.some((item) => item.path === "scripts/test-tools-registration-only.mjs"));
    assert.match(byGoal.what_not_to_edit.join(" "), /generated artifacts/);
  }

  if (casesToRun.includes("tool-test-coverage-map")) {
    const coverage = await call(client, "vnem_tools_tool_test_coverage_map", { root: repo });
    assert.equal(coverage.per_tool.vnem_tools_real_feature.coverage_level, "behavior_test");
    assert.equal(coverage.per_tool.vnem_tools_registration_only.coverage_level, "registration_only");
    assert.ok(coverage.strong_coverage_tools.includes("vnem_tools_real_feature"));
    assert.ok(coverage.registration_only_risks.includes("vnem_tools_registration_only"));
    assert.ok(coverage.recommended_test_additions.some((item) => /registration_only/.test(item)));
  }

  if (casesToRun.includes("source-impact-trace")) {
    const trace = await call(client, "vnem_tools_source_impact_trace", {
      root: repo,
      changed_files: ["scripts/vnem-tools-mcp-server.mjs"],
      target_symbol: "realFeatureHandler",
      user_goal: "patch real feature handler"
    });
    assert.ok(trace.impacted_tools.includes("vnem_tools_real_feature"));
    assert.ok(trace.impacted_tests.includes("scripts/test-tools-real-feature.mjs"));
    assert.equal(trace.readiness_needed, true);
    assert.ok(trace.exact_minimum_checks.some((cmd) => /tools:readiness|test:tools-real-feature|vnem-tools-mcp-server/.test(cmd)));
    assert.match(trace.why, /registered tool handlers|changed file areas/);
  }

  if (casesToRun.includes("source-control-character-guard")) {
    const clean = await call(client, "vnem_tools_source_control_character_guard", { root: repo, max_files: 80 });
    assert.equal(clean.source_clean, true);
    await writeFile(path.join(repo, "src", "bad-control.js"), `export const bad = "x";${String.fromCharCode(8)}\n`);
    const dirty = await call(client, "vnem_tools_source_control_character_guard", { root: repo, changed_files: ["src/bad-control.js", "public/install.tgz"] });
    assert.equal(dirty.source_clean, false);
    assert.ok(dirty.dangerous_source_findings.some((finding) => finding.code_point === "U+0008" && finding.name === "BACKSPACE"));
    assert.ok(dirty.skipped_binary_or_generated.includes("public/install.tgz"));
  }

  if (casesToRun.includes("regression")) {
    const manifest = await call(client, "vnem_tools_manifest", { capability_group: "repo_power" });
    assert.equal(manifest.tools.length, 15);
    assert.ok(manifest.tools.some((tool) => tool.name === "vnem_tools_code_symbol_map" && tool.reliability_level === "local_tested"));
    assert.ok(manifest.tools.some((tool) => tool.name === "vnem_tools_source_control_character_guard"));
    const status = await call(client, "vnem_tools_status", {});
    assert.equal(status.repo_power_policy.code_intelligence_supported, true);
    assert.equal(status.repo_power_policy.source_control_character_guard_supported, true);
    assert.ok(status.repo_power_policy.tools.includes("vnem_tools_tool_test_coverage_map"));
  }
});

console.log(`vnem Tools CODE-INTELLIGENCE-1 ${selectedCase || "regression"} tests passed`);
