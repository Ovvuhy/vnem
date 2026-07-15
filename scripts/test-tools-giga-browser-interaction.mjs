#!/usr/bin/env node
import assert from "node:assert/strict";
import http from "node:http";
import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const benchmarkOutputArg = process.argv.find((arg) => arg.startsWith("--benchmark-output="));
const benchmarkOutput = benchmarkOutputArg ? path.resolve(rootDir, benchmarkOutputArg.slice("--benchmark-output=".length)) : null;
const startedAt = performance.now();
const timings = [];
await mkdir(path.join(rootDir, ".tmp"), { recursive: true });
const tmpRoot = await mkdtemp(path.join(rootDir, ".tmp", "giga-browser-interaction-"));
const workspace = path.join(tmpRoot, "project");
await mkdir(workspace, { recursive: true });
const fixtureHtml = await readFile(path.join(rootDir, "fixtures", "browser-interaction", "index.html"));

const fixtureServer = http.createServer((request, response) => {
  if (request.url === "/favicon.ico") {
    response.writeHead(204, { "cache-control": "no-store" });
    response.end();
    return;
  }
  response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
  response.end(fixtureHtml);
});
await new Promise((resolve) => fixtureServer.listen(0, "127.0.0.1", resolve));
const baseUrl = `http://127.0.0.1:${fixtureServer.address().port}`;

const client = new Client({ name: "vnem-tools-giga-browser-interaction-test", version: "1.0.1" }, { capabilities: {} });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(scriptDir, "vnem-tools-mcp-server.mjs")],
  cwd: rootDir,
  env: {
    ...process.env,
    VNEM_TOOLS_ALLOWED_ROOTS: tmpRoot,
    VNEM_TOOLS_EVIDENCE_ROOT: path.join(tmpRoot, ".vnem", "tool-runs"),
    VNEM_TOOLS_PERMISSION_PROFILE: "safe-local-dev",
    VNEM_TOOLS_ALLOW_LOCALHOST: "1"
  },
  stderr: "pipe"
});
let stderr = "";
transport.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });

try {
  await client.connect(transport);
  const tools = new Set((await client.listTools()).tools.map((tool) => tool.name));
  for (const name of ["vnem_tools_browser_interaction_run", "vnem_tools_browser_evidence_compare", "vnem_tools_ui_evidence_audit"]) assert.equal(tools.has(name), true, `missing ${name}`);

  const scenarios = buildScenarios(baseUrl);
  const plan = await call("vnem_tools_browser_interaction_run", { root: workspace, scenarios });
  const planned = plan.structuredContent.browser_interaction;
  assert.equal(planned.operation_result, "planned");
  assert.equal(planned.executed, false);
  assert.equal(planned.browser_was_run, false);
  assert.equal(planned.scenario_count, 5);
  assert.deepEqual(new Set(planned.capabilities.structured_actions), new Set(["navigate", "click", "type", "select", "wait", "wait_for", "assert"]));
  assert.equal(planned.capabilities.console_and_network_events, true);
  assert.equal(planned.capabilities.pixel_level_png_comparison, true);
  assert.equal(planned.capabilities.exact_declared_origin_requests, true);
  assert.equal(planned.capabilities.cookie_headers_blocked, true);
  assert.deepEqual(planned.policy.declared_origins, [baseUrl]);
  assert.equal(planned.capabilities.cookie_extraction, false);
  assert.equal(planned.capabilities.login_automation, false);
  assert.equal(planned.capabilities.captcha_bypass, false);

  const unapproved = await literalCall("vnem_tools_browser_interaction_run", { root: workspace, scenarios, dry_run: false });
  assert.equal(unapproved.isError, true);
  assert.equal(unapproved.structuredContent.code, "approval_required");

  const externalPlan = await call("vnem_tools_browser_interaction_run", { root: workspace, app_url: "https://example.com/", allow_external: true, approved_origins: ["https://example.com"] });
  assert.equal(externalPlan.structuredContent.browser_interaction.operation_result, "blocked");
  assert.ok(externalPlan.structuredContent.browser_interaction.blockers.some((item) => item.code === "external_browser_policy_disabled"));

  const privatePlan = await call("vnem_tools_browser_interaction_run", { root: workspace, app_url: `${baseUrl}/login` });
  assert.ok(privatePlan.structuredContent.browser_interaction.blockers.some((item) => item.code === "private_flow_blocked"));

  const unsafeNavigationPlan = await call("vnem_tools_browser_interaction_run", { root: workspace, app_url: baseUrl, actions: [{ type: "navigate", url: "https://example.com/account" }, { type: "assert" }] });
  const unsafeCodes = unsafeNavigationPlan.structuredContent.browser_interaction.blockers.map((item) => item.code);
  assert.ok(unsafeCodes.includes("external_origin_not_approved"));
  assert.ok(unsafeCodes.includes("private_flow_blocked"));
  assert.ok(unsafeCodes.includes("browser_condition_required"));

  const oversizedViewportPlan = await call("vnem_tools_browser_interaction_run", { root: workspace, app_url: baseUrl, viewport: { width: 2560, height: 1600, device_scale_factor: 3 }, actions: [{ type: "assert", selector: "#state" }] });
  assert.ok(oversizedViewportPlan.structuredContent.browser_interaction.blockers.some((item) => item.code === "browser_viewport_pixel_limit"));

  const duplicateNames = await literalCall("vnem_tools_browser_interaction_run", { root: workspace, scenarios: [{ name: "duplicate", url: baseUrl }, { name: "duplicate", url: baseUrl }] });
  assert.equal(duplicateNames.isError, true);
  assert.equal(duplicateNames.structuredContent.code, "browser_scenario_name_duplicate");

  const runResponse = await call("vnem_tools_browser_interaction_run", {
    root: workspace,
    scenarios,
    dry_run: false,
    approved: true,
    approval_note: "approve isolated localhost browser interaction fixture proof"
  });
  const run = runResponse.structuredContent.browser_interaction;
  assert.equal(run.status, "passed", JSON.stringify(run.fatal_error || run.scenarios.map((scenario) => scenario.error)));
  assert.equal(run.operation_result, "completed");
  assert.equal(run.browser_was_run, true);
  assert.equal(run.safe_to_claim, true);
  assert.deepEqual(run.counts, { planned: 5, executed: 5, passed: 5, failed: 0 });
  assert.equal(run.scenarios.length, 5);
  assert.equal(run.screenshots.length, 10);
  assert.equal(run.console_summary.status, "clean");
  assert.equal(run.console_summary.error_count, 0);
  assert.equal(run.network_summary.status, "clean");
  assert.equal(run.network_summary.failures.length, 0);
  assert.ok(run.network_summary.response_count >= 5);
  assert.equal(run.accessibility_summary.status, "checked");
  assert.equal(run.accessibility_summary.snapshots, 10);
  assert.equal(run.accessibility_summary.issue_count, 0);
  assert.deepEqual(new Set(run.viewport_coverage.map((item) => item.viewport)), new Set(["desktop", "mobile"]));
  for (const state of ["loading", "empty", "error", "success"]) assert.equal(run.state_coverage.find((item) => item.state === state)?.status, "passed");
  assert.equal(run.before_after_comparison.status, "present");
  assert.equal(run.before_after_comparison.pairs.length, 5);
  const actionTypes = new Set(run.scenarios.flatMap((scenario) => scenario.action_results.map((action) => action.type)));
  assert.deepEqual(actionTypes, new Set(["navigate", "click", "type", "select", "wait", "wait_for", "assert"]));
  const success = run.scenarios.find((scenario) => scenario.name === "success-edit");
  assert.ok(success.before_after.visual.changed_pixels > 0);
  assert.equal(success.before_after.dom.changed, true);
  assert.equal(success.after.dom.horizontal_overflow, false);
  assert.match(success.after.dom.text, /Saved Browser verified task with high priority/);
  assert.equal(run.browser_runtime.dedicated_temporary_profile, true);
  assert.equal(run.browser_runtime.automation_disclosed, true);
  assert.equal(run.browser_runtime.stealth_mode, false);
  assert.equal(run.browser_runtime.browser_sandbox_disabled, true);
  assert.match(run.browser_runtime.limitation, /not a production-browser security claim/);
  assert.equal(run.browser_termination.process_exited, true);
  assert.equal(run.browser_termination.profile_removed, true);
  assert.ok(run.browser_termination.strategies.includes("Browser.close"));
  await assert.rejects(stat(path.join(run.evidence_directory, "browser-profile")));
  for (const screenshot of run.screenshots) {
    assert.ok((await stat(screenshot.path)).size > 1000);
    assert.equal(screenshot.render_integrity.status, "nonblank");
    assert.ok(screenshot.render_integrity.non_background_pixels > 100);
  }
  const persistedPack = JSON.parse(await readFile(run.evidence_path, "utf8"));
  assert.equal(persistedPack.evidence_path_relative, run.evidence_path_relative);
  assert.equal(persistedPack.summary_path_relative, run.summary_path_relative);

  const comparisonResponse = await call("vnem_tools_browser_evidence_compare", { root: workspace, before_pack_path: run.evidence_path, after_pack_path: run.evidence_path });
  const comparison = comparisonResponse.structuredContent.browser_evidence_compare;
  assert.equal(comparison.operation_result, "compared");
  assert.equal(comparison.matching_items, 10);
  assert.equal(comparison.unmatched_items, 0);
  assert.equal(comparison.visual_changes, 0);
  assert.equal(comparison.dom_changes, 0);
  assert.equal(comparison.accessibility_changes, 0);
  assert.ok(comparison.comparisons.every((item) => item.visual.status === "compared" && item.visual.changed_pixels === 0));

  const auditResponse = await call("vnem_tools_ui_evidence_audit", { claim: "Visual responsive accessibility form proof with loading empty error and success states", browser_evidence_run: run });
  const audit = auditResponse.structuredContent.ui_evidence_audit;
  assert.equal(audit.verdict, "accept_supported", JSON.stringify(audit.missing_evidence));
  assert.equal(audit.safe_to_claim, true);
  assert.equal(audit.evidence_strength, "strong_browser_evidence_run");

  const captchaResponse = await call("vnem_tools_browser_interaction_run", {
    root: workspace,
    scenarios: [
      { name: "captcha-stop", url: `${baseUrl}/?state=challenge`, state: "captcha", actions: [{ type: "assert", selector: "#state", text: "Human verification" }] },
      { name: "must-not-run", url: `${baseUrl}/?state=empty`, state: "empty", actions: [{ type: "assert", selector: "#state", text: "No records" }] }
    ],
    dry_run: false,
    approved: true,
    approval_note: "approve CAPTCHA detection-only fixture proof"
  });
  const captcha = captchaResponse.structuredContent.browser_interaction;
  assert.equal(captcha.status, "partial");
  assert.deepEqual(captcha.counts, { planned: 2, executed: 1, passed: 0, failed: 1 });
  assert.equal(captcha.scenarios[0].error.code, "captcha_detected");
  assert.equal(captcha.scenarios[0].action_results.length, 0);
  assert.equal(captcha.scenarios.length, 1);
  assert.equal(captcha.safe_to_claim, false);
  assert.equal(captcha.browser_termination.process_exited, true);
  assert.equal(captcha.browser_termination.profile_removed, true);

  const privateRuntimeResponse = await call("vnem_tools_browser_interaction_run", {
    root: workspace,
    scenarios: [
      { name: "private-field", url: `${baseUrl}/?state=protected`, actions: [{ type: "type", selector: "#task-title", value: "test" }] },
      { name: "private-click", url: `${baseUrl}/?state=success`, actions: [{ type: "click", selector: "#restricted-link" }] }
    ],
    dry_run: false,
    approved: true,
    approval_note: "approve private-flow refusal fixture proof"
  });
  const privateRuntime = privateRuntimeResponse.structuredContent.browser_interaction;
  assert.equal(privateRuntime.status, "partial");
  assert.equal(privateRuntime.scenarios.length, 2);
  assert.ok(privateRuntime.scenarios.every((scenario) => scenario.error.code === "private_flow_detected"));
  assert.ok(privateRuntime.scenarios.every((scenario) => scenario.action_results.length === 0));
  assert.equal(privateRuntime.browser_termination.process_exited, true);
  assert.equal(privateRuntime.browser_termination.profile_removed, true);

  if (benchmarkOutput) await writeBenchmark(benchmarkOutput, run, comparison, audit, captcha, privateRuntime);
  console.log("vnem Tools GIGA browser-interaction MCP tests passed");
} catch (error) {
  if (stderr.trim()) console.error(stderr.trim());
  throw error;
} finally {
  await client.close().catch(() => {});
  await new Promise((resolve) => fixtureServer.close(resolve));
  fixtureServer.closeAllConnections?.();
  await removeTempRoot(tmpRoot);
}

function buildScenarios(base) {
  return [
    { name: "loading-mobile", url: `${base}/?state=loading`, viewport: "mobile", state: "loading", actions: [{ type: "assert", selector: "#state", text: "Loading data" }] },
    { name: "empty-desktop", url: `${base}/?state=empty`, viewport: "desktop", state: "empty", actions: [{ type: "assert", selector: "#state", text: "No records" }] },
    { name: "error-mobile", url: `${base}/?state=error`, viewport: "mobile", state: "error", actions: [{ type: "assert", selector: "#state", text: "Could not load" }] },
    {
      name: "success-edit",
      url: `${base}/?state=success`,
      viewport: "desktop",
      state: "success",
      actions: [
        { type: "type", selector: "#task-title", value: "Browser verified task" },
        { type: "select", selector: "#priority", value: "high" },
        { type: "wait", timeout_ms: 125 },
        { type: "click", selector: "#save" },
        { type: "wait_for", selector: "#result", text: "Saved Browser verified task with high priority", timeout_ms: 3000 },
        { type: "assert", selector: "#result", text: "Saved Browser verified task with high priority" }
      ]
    },
    {
      name: "navigation-desktop",
      url: `${base}/?state=success`,
      viewport: "desktop",
      state: "success",
      actions: [
        { type: "navigate", url: `${base}/details?state=success` },
        { type: "wait_for", selector: "#details", text: "Details ready", timeout_ms: 3000 },
        { type: "assert", selector: "#details", text: "Details ready", url_contains: "/details" }
      ]
    }
  ];
}

async function call(name, args) {
  const callStartedAt = performance.now();
  const result = await literalCall(name, args);
  timings.push({ tool: name, duration_ms: Number((performance.now() - callStartedAt).toFixed(2)), status: result.isError ? "error" : "ok" });
  if (result.isError) throw new Error(`${name} failed: ${JSON.stringify(result.structuredContent || result.content)}`);
  return result;
}

async function literalCall(name, args) {
  if (name === "vnem_tools_browser_interaction_run") return await client.callTool({ name: "vnem_tools_browser_interaction_run", arguments: args });
  if (name === "vnem_tools_browser_evidence_compare") return await client.callTool({ name: "vnem_tools_browser_evidence_compare", arguments: args });
  if (name === "vnem_tools_ui_evidence_audit") return await client.callTool({ name: "vnem_tools_ui_evidence_audit", arguments: args });
  throw new Error(`Unexpected browser interaction tool ${name}`);
}

async function writeBenchmark(outputPath, run, comparison, audit, captcha, privateRuntime) {
  const outputDir = path.dirname(outputPath);
  const evidenceDir = path.join(outputDir, "browser-evidence");
  await mkdir(outputDir, { recursive: true });
  await rm(evidenceDir, { recursive: true, force: true });
  await cp(run.evidence_directory, evidenceDir, { recursive: true });
  const evidencePackPath = path.join(evidenceDir, "evidence-pack.json");
  const portableEvidenceDir = path.relative(rootDir, evidenceDir).replaceAll("\\", "/");
  const copiedEvidencePack = JSON.parse(await readFile(evidencePackPath, "utf8"));
  const portableEvidencePack = makeEvidencePortable(copiedEvidencePack, run.evidence_directory, portableEvidenceDir);
  const portableEvidenceText = `${JSON.stringify(portableEvidencePack, null, 2)}\n`;
  assert.equal(portableEvidenceText.includes(tmpRoot), false, "Persisted browser evidence must not reference its deleted temporary workspace");
  await writeFile(evidencePackPath, portableEvidenceText, "utf8");
  await Promise.all(portableEvidencePack.screenshots.map((item) => stat(path.join(rootDir, item.path))));
  const screenshots = run.screenshots.map((item) => ({ scenario: item.scenario, stage: item.stage, bytes: item.bytes, sha256: item.sha256, render_integrity: item.render_integrity, path: path.relative(outputDir, path.join(evidenceDir, path.basename(item.path))).replaceAll("\\", "/") }));
  await writeFile(outputPath, `${JSON.stringify({
    schema_version: 1,
    phase: 10,
    benchmark_type: "actual_mcp_chromium_interaction_execution",
    deterministic_routing_benchmark: false,
    generated_at: new Date().toISOString(),
    total_duration_ms: Number((performance.now() - startedAt).toFixed(2)),
    mcp_transport: "stdio",
    scenarios: run.counts,
    structured_actions_executed: [...new Set(run.scenarios.flatMap((scenario) => scenario.action_results.map((action) => action.type)))],
    screenshots,
    console_summary: run.console_summary,
    network_summary: run.network_summary,
    accessibility_summary: run.accessibility_summary,
    viewport_coverage: run.viewport_coverage,
    state_coverage: run.state_coverage,
    before_after_comparison: run.before_after_comparison,
    evidence_compare: { matching_items: comparison.matching_items, visual_changes: comparison.visual_changes, dom_changes: comparison.dom_changes, accessibility_changes: comparison.accessibility_changes },
    ui_evidence_audit: { verdict: audit.verdict, evidence_strength: audit.evidence_strength, safe_to_claim: audit.safe_to_claim },
    refusal_proof: { captcha_code: captcha.scenarios[0].error.code, halted_after_detection: captcha.counts.executed === 1, private_flow_codes: privateRuntime.scenarios.map((scenario) => scenario.error.code), private_actions_executed: privateRuntime.scenarios.reduce((sum, scenario) => sum + scenario.action_results.length, 0) },
    browser_termination: run.browser_termination,
    tool_calls: timings,
    limitations: ["Local deterministic fixture execution is not production or authenticated-flow proof.", "Chromium DevTools Protocol was exercised; Firefox and WebKit were not.", "Pixel difference detects change but does not decide aesthetic correctness.", "Accessibility tree inspection is bounded evidence, not certification.", "The browser sandbox is disabled for this isolated automation runtime and is not a production-browser security claim."]
  }, null, 2)}\n`, "utf8");
}

function makeEvidencePortable(value, sourceEvidenceDir, portableEvidenceDir) {
  if (Array.isArray(value)) return value.map((item) => makeEvidencePortable(item, sourceEvidenceDir, portableEvidenceDir));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, makeEvidencePortable(item, sourceEvidenceDir, portableEvidenceDir)]));
  }
  if (typeof value !== "string") return value;

  const resolvedEvidenceDir = path.resolve(sourceEvidenceDir);
  const lowerValue = value.toLowerCase();
  const lowerEvidenceDir = resolvedEvidenceDir.toLowerCase();
  const lowerWorkspace = path.resolve(workspace).toLowerCase();
  const lowerTempRoot = path.resolve(tmpRoot).toLowerCase();
  if (lowerValue === lowerEvidenceDir) return portableEvidenceDir;
  if (lowerValue.startsWith(`${lowerEvidenceDir}${path.sep}`)) {
    return path.posix.join(portableEvidenceDir, path.relative(resolvedEvidenceDir, value).replaceAll("\\", "/"));
  }
  if (lowerValue === lowerWorkspace) return "fixtures/browser-interaction";
  if (lowerValue.startsWith(`${lowerTempRoot}${path.sep}`)) {
    return path.posix.join("temporary-runtime", path.relative(tmpRoot, value).replaceAll("\\", "/"));
  }
  return value;
}

async function removeTempRoot(root) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try { await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); return; }
    catch (error) { if (!["EBUSY", "EPERM", "ENOTEMPTY"].includes(error.code)) throw error; await new Promise((resolve) => setTimeout(resolve, 250)); }
  }
}
