#!/usr/bin/env node
import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const benchmarkOutputArg = process.argv.find((arg) => arg.startsWith("--benchmark-output="));
const benchmarkOutput = benchmarkOutputArg ? path.resolve(rootDir, benchmarkOutputArg.slice("--benchmark-output=".length)) : null;
const runStartedAt = performance.now();
const toolTimings = [];
await mkdir(path.join(rootDir, ".tmp"), { recursive: true });
const tmpRoot = await mkdtemp(path.join(rootDir, ".tmp", "giga-app-engineering-"));
const viteProject = path.join(tmpRoot, "vite-react-node");
const staticProject = path.join(tmpRoot, "static-node");
const unmarkedProject = path.join(tmpRoot, "unmarked");
await cp(path.join(rootDir, "fixtures", "app-engineering", "vite-react-node"), viteProject, { recursive: true });
await cp(path.join(rootDir, "fixtures", "app-engineering", "static-node"), staticProject, { recursive: true });
await mkdir(unmarkedProject, { recursive: true });
await writeFile(path.join(unmarkedProject, "package.json"), JSON.stringify({ private: true, type: "module", dependencies: { next: "15.0.0", react: "19.0.0" } }), "utf8");

const client = new Client({ name: "vnem-tools-giga-app-engineering-test", version: "1.0.1" }, { capabilities: {} });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(scriptDir, "vnem-tools-mcp-server.mjs")],
  cwd: rootDir,
  env: {
    ...process.env,
    VNEM_TOOLS_ALLOWED_ROOTS: tmpRoot,
    VNEM_TOOLS_PERMISSION_PROFILE: "approved-writes",
    VNEM_TOOLS_EVIDENCE_ROOT: path.join(tmpRoot, ".vnem", "tool-runs"),
    VNEM_TOOLS_ALLOW_LOCALHOST: "1",
    VNEM_TOOLS_BROWSER_COMMAND: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
  },
  stderr: "pipe"
});
let stderr = "";
transport.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });

try {
  await client.connect(transport);
  const tools = new Set((await client.listTools()).tools.map((tool) => tool.name));
  for (const name of ["vnem_tools_app_inspect", "vnem_tools_app_vertical_slice_plan", "vnem_tools_app_vertical_slice_apply", "vnem_tools_app_acceptance_run", "vnem_tools_app_transaction_rollback"]) {
    assert.equal(tools.has(name), true, `missing ${name}`);
  }

  const before = await call("vnem_tools_app_inspect", { root: viteProject });
  const beforeInspection = before.structuredContent.app_inspection;
  assert.equal(beforeInspection.adapter, "vite-react-node");
  assert.equal(beforeInspection.marker_present, true);
  assert.ok(beforeInspection.incomplete_vertical_slice_signals.includes("frontend_without_detected_backend_boundary"));
  assert.equal(beforeInspection.support.support_level, "verified_generation_and_execution");

  const unmarked = await call("vnem_tools_app_vertical_slice_plan", { root: unmarkedProject, feature_name: "Unsafe rewrite" });
  assert.equal(unmarked.structuredContent.app_vertical_slice_plan.status, "blocked_unsupported_adapter");
  assert.equal(unmarked.structuredContent.app_vertical_slice_plan.safe_to_apply, false);

  const vitePlanResponse = await call("vnem_tools_app_vertical_slice_plan", { root: viteProject, feature_name: "Verified delivery board" });
  const vitePlan = vitePlanResponse.structuredContent.app_vertical_slice_plan;
  assert.equal(vitePlan.status, "ready");
  assert.ok(vitePlan.files_previewed.length >= 8);
  assert.equal(vitePlan.transaction.cross_file_filesystem_atomicity_claimed, false);
  assert.equal(vitePlan.transaction.automatic_all_or_rollback_semantics, true);

  const viteDry = await call("vnem_tools_app_vertical_slice_apply", { plan_id: vitePlan.plan_id });
  assert.equal(viteDry.structuredContent.app_vertical_slice_transaction.dry_run, true);
  assert.match(await readFile(path.join(viteProject, "index.html"), "utf8"), /UI-only fixture/);
  const viteUnapproved = await client.callTool({ name: "vnem_tools_app_vertical_slice_apply", arguments: { plan_id: vitePlan.plan_id, dry_run: false } });
  assert.equal(viteUnapproved.isError, true);
  assert.equal(viteUnapproved.structuredContent.code, "approval_required");

  const viteApply = await call("vnem_tools_app_vertical_slice_apply", { plan_id: vitePlan.plan_id, dry_run: false, approved: true, approval_note: "approve isolated Vite fixture generation" });
  const viteTransaction = viteApply.structuredContent.app_vertical_slice_transaction;
  assert.equal(viteTransaction.applied, true);
  assert.ok(viteTransaction.manifest_path);
  const after = await call("vnem_tools_app_inspect", { root: viteProject });
  const afterInspection = after.structuredContent.app_inspection;
  assert.ok(afterInspection.boundaries.backend.length > 0);
  assert.equal(afterInspection.quality_signals.validation, true);
  assert.equal(afterInspection.quality_signals.accessibility, true);
  assert.equal(afterInspection.quality_signals.responsive, true);
  assert.equal(afterInspection.experience_states.loading, true);
  assert.equal(afterInspection.experience_states.empty, true);
  assert.equal(afterInspection.experience_states.error, true);
  assert.equal(afterInspection.experience_states.success, true);

  const acceptanceDry = await call("vnem_tools_app_acceptance_run", { root: viteProject, manifest_path: viteTransaction.manifest_path, port: 4321 });
  assert.equal(acceptanceDry.structuredContent.app_acceptance.dry_run, true);
  const relativeViteManifest = path.relative(tmpRoot, viteTransaction.manifest_path);
  const viteAcceptance = await call("vnem_tools_app_acceptance_run", { root: viteProject, manifest_path: relativeViteManifest, port: 4321, dry_run: false, approved: true, approval_note: "approve isolated Vite app acceptance", restore_on_failure: true, wait_ms: 1200, timeout_ms: 30000 });
  const viteProof = viteAcceptance.structuredContent.app_acceptance;
  assert.equal(viteProof.status, "passed", JSON.stringify(viteProof.error || viteProof.browser));
  assert.equal(viteProof.safe_to_claim, true);
  assert.equal(viteProof.browser.browser_was_run, true);
  assert.equal(viteProof.browser.desktop.user_path_passed, true);
  assert.equal(viteProof.browser.mobile.page_loaded, true);
  assert.equal(viteProof.browser.mobile.horizontal_overflow, false);
  assert.equal(viteProof.browser.console_errors.length, 0);
  assert.equal(viteProof.browser.network_failures.length, 0);
  assert.equal(viteProof.browser.launch_policy.dedicated_temporary_profile, true);
  assert.equal(viteProof.browser.launch_policy.localhost_only, true);
  assert.equal(viteProof.browser.launch_policy.browser_sandbox_disabled, true);
  assert.equal(viteProof.browser.launch_policy.shared_memory_disabled, true);
  assert.match(viteProof.browser.launch_policy.limitation, /not a production browser security claim/);
  assert.ok(viteProof.browser.network.some((item) => item.url.includes("/api/tasks") && [200, 201].includes(item.status)));
  for (const screenshot of viteProof.browser.screenshots) assert.ok((await stat(screenshot.path)).size > 1000);
  const acceptedManifest = JSON.parse(await readFile(viteTransaction.manifest_path, "utf8"));
  assert.equal(acceptedManifest.acceptance_status, "passed");
  assert.equal(acceptedManifest.acceptance_evidence, viteProof.evidence_path);

  const failedAcceptance = await call("vnem_tools_app_acceptance_run", { root: viteProject, manifest_path: viteTransaction.manifest_path, scripts: ["lint"], port: 4321, dry_run: false, approved: true, approval_note: "approve failure and automatic restore proof", restore_on_failure: true });
  const failureProof = failedAcceptance.structuredContent.app_acceptance;
  assert.equal(failureProof.status, "failed");
  assert.equal(failureProof.restored_after_failure, true);
  assert.match(await readFile(path.join(viteProject, "index.html"), "utf8"), /UI-only fixture/);

  const staticPlanResponse = await call("vnem_tools_app_vertical_slice_plan", { root: staticProject, feature_name: "Static verification board" });
  const staticPlan = staticPlanResponse.structuredContent.app_vertical_slice_plan;
  assert.equal(staticPlan.adapter, "static-node");
  const staticApply = await call("vnem_tools_app_vertical_slice_apply", { plan_id: staticPlan.plan_id, dry_run: false, approved: true, approval_note: "approve isolated static fixture generation" });
  const staticTransaction = staticApply.structuredContent.app_vertical_slice_transaction;
  const staticAcceptance = await call("vnem_tools_app_acceptance_run", { root: staticProject, manifest_path: staticTransaction.manifest_path, port: 4322, dry_run: false, approved: true, approval_note: "approve isolated static app acceptance", restore_on_failure: false, wait_ms: 800, timeout_ms: 30000 });
  const staticProof = staticAcceptance.structuredContent.app_acceptance;
  assert.equal(staticProof.status, "passed", JSON.stringify(staticProof.error || staticProof.browser));

  const rollbackDry = await call("vnem_tools_app_transaction_rollback", { root: staticProject, manifest_path: staticTransaction.manifest_path });
  assert.equal(rollbackDry.structuredContent.app_transaction_rollback.dry_run, true);
  const rollback = await call("vnem_tools_app_transaction_rollback", { root: staticProject, manifest_path: staticTransaction.manifest_path, dry_run: false, approved: true, approval_note: "approve exact static fixture rollback" });
  assert.equal(rollback.structuredContent.app_transaction_rollback.status, "rolled_back");
  assert.match(await readFile(path.join(staticProject, "public", "index.html"), "utf8"), /Static-only fixture/);

  if (benchmarkOutput) {
    await mkdir(path.dirname(benchmarkOutput), { recursive: true });
    const browserEvidenceDir = path.join(path.dirname(benchmarkOutput), "browser-evidence");
    await mkdir(browserEvidenceDir, { recursive: true });
    const persistedScreenshots = [];
    for (const [prefix, proof] of [["vite", viteProof], ["static", staticProof]]) {
      for (const screenshot of proof.browser.screenshots) {
        const viewport = screenshot.viewport.mobile ? "mobile" : "desktop";
        const target = path.join(browserEvidenceDir, `${prefix}-${viewport}.png`);
        await cp(screenshot.path, target);
        persistedScreenshots.push({ adapter: prefix === "vite" ? "vite-react-node" : "static-node", viewport, path: path.relative(path.dirname(benchmarkOutput), target).replaceAll("\\", "/"), bytes: screenshot.bytes });
      }
    }
    await writeFile(benchmarkOutput, JSON.stringify({
      schema_version: 1,
      phase: 7,
      generated_at: new Date().toISOString(),
      benchmark_type: "actual_mcp_project_execution",
      deterministic_routing_benchmark: false,
      mcp_transport: "stdio",
      fixture_projects: ["vite-react-node", "static-node"],
      adapters_executed: [vitePlan.adapter, staticPlan.adapter],
      total_duration_ms: Number((performance.now() - runStartedAt).toFixed(2)),
      tool_calls: toolTimings,
      vite_react_node: benchmarkAcceptance(vitePlan, viteTransaction, viteProof),
      static_node: benchmarkAcceptance(staticPlan, staticTransaction, staticProof),
      persisted_screenshots: persistedScreenshots,
      rollback_proof: {
        failed_acceptance_auto_restore: failureProof.restored_after_failure,
        explicit_static_rollback: rollback.structuredContent.app_transaction_rollback.status,
        original_fixture_content_restored: true
      },
      safety_proof: {
        unmarked_project_blocked: unmarked.structuredContent.app_vertical_slice_plan.status,
        unapproved_apply_blocked: viteUnapproved.structuredContent.code,
        cross_file_filesystem_atomicity_claimed: vitePlan.transaction.cross_file_filesystem_atomicity_claimed,
        automatic_all_or_rollback_semantics: vitePlan.transaction.automatic_all_or_rollback_semantics
      },
      cleanup_proof: "verified separately after process exit by the calling validation step",
      limitations: ["Local fixture execution is not production deployment proof.", "Chromium-family Edge was exercised; other browser engines were not.", "Next-style and generic projects remain inspection/plan-only unless a reviewed adapter is added."]
    }, null, 2), "utf8");
  }

  console.log("vnem Tools GIGA app-engineering MCP tests passed");
} catch (error) {
  if (stderr.trim()) console.error(stderr.trim());
  throw error;
} finally {
  await client.close().catch(() => {});
  await removeTempRoot(tmpRoot);
}

async function call(name, args) {
  const startedAt = performance.now();
  const result = await literalAppToolCall(name, args);
  toolTimings.push({ tool: name, duration_ms: Number((performance.now() - startedAt).toFixed(2)), status: result.isError ? "error" : "ok" });
  if (result.isError) throw new Error(`${name} failed: ${JSON.stringify(result.structuredContent || result.content)}`);
  return result;
}

async function literalAppToolCall(name, args) {
  if (name === "vnem_tools_app_inspect") return client.callTool({ name: "vnem_tools_app_inspect", arguments: args });
  if (name === "vnem_tools_app_vertical_slice_plan") return client.callTool({ name: "vnem_tools_app_vertical_slice_plan", arguments: args });
  if (name === "vnem_tools_app_vertical_slice_apply") return client.callTool({ name: "vnem_tools_app_vertical_slice_apply", arguments: args });
  if (name === "vnem_tools_app_acceptance_run") return client.callTool({ name: "vnem_tools_app_acceptance_run", arguments: args });
  if (name === "vnem_tools_app_transaction_rollback") return client.callTool({ name: "vnem_tools_app_transaction_rollback", arguments: args });
  throw new Error(`Unexpected app tool ${name}`);
}

function benchmarkAcceptance(plan, transaction, proof) {
  return {
    files_previewed: plan.files_previewed.length,
    files_applied: transaction.files.length,
    transaction_duration_ms: transaction.duration_ms,
    scripts: proof.scripts.map((script) => ({ script: script.script, exit_code: script.exit_code, duration_ms: script.duration_ms })),
    browser_status: proof.browser.status,
    browser_duration_ms: proof.browser.duration_ms,
    desktop_user_path_passed: proof.browser.desktop.user_path_passed,
    mobile_page_loaded: proof.browser.mobile.page_loaded,
    mobile_horizontal_overflow: proof.browser.mobile.horizontal_overflow,
    console_error_count: proof.browser.console_errors.length,
    network_failure_count: proof.browser.network_failures.length,
    bad_response_count: proof.browser.bad_responses.length,
    browser_launch_policy: proof.browser.launch_policy,
    api_response_statuses: [...new Set(proof.browser.network.filter((item) => item.url.includes("/api/tasks")).map((item) => item.status))],
    screenshot_bytes: proof.browser.screenshots.map((item) => item.bytes),
    safe_to_claim: proof.safe_to_claim
  };
}

async function removeTempRoot(root) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try { await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); return; }
    catch (error) { if (!["EBUSY", "EPERM", "ENOTEMPTY"].includes(error.code)) throw error; await new Promise((resolve) => setTimeout(resolve, 250)); }
  }
}
