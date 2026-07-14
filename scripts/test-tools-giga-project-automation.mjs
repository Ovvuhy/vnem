#!/usr/bin/env node
import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const benchmarkArg = process.argv.find((arg) => arg.startsWith("--benchmark-output="));
const benchmarkOutput = benchmarkArg ? path.resolve(rootDir, benchmarkArg.slice("--benchmark-output=".length)) : null;
const startedAt = performance.now();
const timings = [];
await mkdir(path.join(rootDir, ".tmp"), { recursive: true });
const tmpRoot = await mkdtemp(path.join(rootDir, ".tmp", "giga-project-automation-"));
const projectRoot = path.join(tmpRoot, "project");
const evidenceRoot = path.join(tmpRoot, ".vnem", "tool-runs");
await cp(path.join(rootDir, "fixtures", "project-automation"), projectRoot, { recursive: true });

let safeConnection = null;
let powerConnection = null;
let devServerId = null;
try {
  safeConnection = await connect("safe-local-dev");
  const safeClient = safeConnection.client;
  const toolNames = new Set((await safeClient.listTools()).tools.map((tool) => tool.name));
  for (const name of [
    "vnem_tools_project_automation_inspect",
    "vnem_tools_project_command_run",
    "vnem_tools_project_task_graph_plan",
    "vnem_tools_project_task_graph_run",
    "vnem_tools_project_task_graph_status",
    "vnem_tools_project_task_graph_rollback",
    "vnem_tools_project_runtime_diagnose",
    "vnem_tools_project_temp_cleanup"
  ]) assert.equal(toolNames.has(name), true, `missing ${name}`);

  const inspection = await call(safeClient, "vnem_tools_project_automation_inspect", { root: projectRoot });
  const environment = inspection.structuredContent.project_automation_inspection;
  assert.equal(environment.selected_package_manager, "npm");
  assert.ok(environment.shells.some((shell) => shell.available));
  assert.ok(environment.task_runners.some((runner) => runner.runner === "package-scripts"));
  assert.deepEqual(environment.command_policy_layers, ["known_safe", "project_declared", "reviewed_custom", "blocked_dangerous"]);

  const knownPlan = await call(safeClient, "vnem_tools_project_command_run", { root: projectRoot, mode: "known_safe", argv: ["node", "--check", "scripts/task.mjs"] });
  const knownReview = knownPlan.structuredContent.project_command.review;
  assert.equal(knownReview.policy_layer, "known_safe");
  const knownRun = await call(safeClient, "vnem_tools_project_command_run", { root: projectRoot, mode: "known_safe", argv: ["node", "--check", "scripts/task.mjs"], review_id: knownReview.review_id, dry_run: false, approved: true, approval_note: "approve isolated syntax check" });
  assert.equal(knownRun.structuredContent.project_command.execution.exit_code, 0);

  const blockedCustomPlan = await call(safeClient, "vnem_tools_project_command_run", { root: projectRoot, mode: "reviewed_custom", argv: ["node", "scripts/task.mjs", "custom"] });
  const blockedCustomReview = blockedCustomPlan.structuredContent.project_command.review;
  assert.equal(blockedCustomReview.stronger_profile_required, true);
  const blockedCustomRun = await safeClient.callTool({ name: "vnem_tools_project_command_run", arguments: { root: projectRoot, mode: "reviewed_custom", argv: ["node", "scripts/task.mjs", "custom"], review_id: blockedCustomReview.review_id, dry_run: false, approved: true, approval_note: "attempt custom under safe-local" } });
  assert.equal(blockedCustomRun.isError, true);
  assert.equal(blockedCustomRun.structuredContent.code, "permission_profile_blocked");
  await safeConnection.close();
  safeConnection = null;

  powerConnection = await connect("creator-power");
  const client = powerConnection.client;

  const chainedPlan = await call(client, "vnem_tools_project_command_run", { root: projectRoot, mode: "project_script", script: "validate:chain" });
  const chainedReview = chainedPlan.structuredContent.project_command.review;
  assert.equal(chainedReview.project_script.policy.controlled_and_chain_segments, 2);
  const chainedRun = await call(client, "vnem_tools_project_command_run", { root: projectRoot, mode: "project_script", script: "validate:chain", review_id: chainedReview.review_id, dry_run: false, approved: true, approval_note: "approve reviewed declared validation chain" });
  assert.equal(chainedRun.structuredContent.project_command.execution.ok, true);

  const installNamedTest = await call(client, "vnem_tools_project_command_run", { root: projectRoot, mode: "project_script", script: "test:install-simulation" });
  assert.equal(installNamedTest.structuredContent.project_command.review.project_script.policy.allowed, true);
  const lifecycleInstallBlocked = await client.callTool({ name: "vnem_tools_project_command_run", arguments: { root: projectRoot, mode: "project_script", script: "install" } });
  assert.equal(lifecycleInstallBlocked.isError, true);
  assert.equal(lifecycleInstallBlocked.structuredContent.code, "project_script_policy_blocked");

  const dangerous = await client.callTool({ name: "vnem_tools_project_command_run", arguments: { root: projectRoot, mode: "project_script", script: "dangerous-push" } });
  assert.equal(dangerous.isError, true);
  assert.equal(dangerous.structuredContent.code, "project_script_policy_blocked");
  const lifecycleHookBlocked = await client.callTool({ name: "vnem_tools_project_command_run", arguments: { root: projectRoot, mode: "project_script", script: "hooked-test" } });
  assert.equal(lifecycleHookBlocked.isError, true);
  assert.equal(lifecycleHookBlocked.structuredContent.code, "project_script_lifecycle_hook_blocked");
  const operatorBlocked = await client.callTool({ name: "vnem_tools_project_command_run", arguments: { root: projectRoot, mode: "reviewed_custom", argv: ["node", "scripts/task.mjs", "&&", "custom"] } });
  assert.equal(operatorBlocked.isError, true);
  assert.equal(operatorBlocked.structuredContent.code, "shell_operator_blocked");
  const rawSecretBlocked = await client.callTool({ name: "vnem_tools_project_command_run", arguments: { root: projectRoot, mode: "reviewed_custom", argv: ["node", "scripts/task.mjs", "ghp_1234567890abcdefghijklmnop"] } });
  assert.equal(rawSecretBlocked.isError, true);
  assert.equal(rawSecretBlocked.structuredContent.code, "raw_secret_argument_blocked");

  const customPlan = await call(client, "vnem_tools_project_command_run", { root: projectRoot, mode: "reviewed_custom", argv: ["node", "scripts/task.mjs", "custom"] });
  const customRun = await call(client, "vnem_tools_project_command_run", { root: projectRoot, mode: "reviewed_custom", argv: ["node", "scripts/task.mjs", "custom"], review_id: customPlan.structuredContent.project_command.review.review_id, dry_run: false, approved: true, approval_note: "approve exact fixture custom command" });
  assert.equal(customRun.structuredContent.project_command.execution.stdout.trim(), "custom:ok");

  const envPlan = await call(client, "vnem_tools_project_command_run", { root: projectRoot, mode: "project_script", script: "env-safety" });
  const envRun = await call(client, "vnem_tools_project_command_run", { root: projectRoot, mode: "project_script", script: "env-safety", review_id: envPlan.structuredContent.project_command.review.review_id, dry_run: false, approved: true, approval_note: "approve sanitized child environment proof" });
  assert.equal(envRun.structuredContent.project_command.execution.stdout.trim().endsWith("env-safety:absent"), true);
  assert.ok(envRun.structuredContent.project_command.execution.environment_safety.removed_key_names.includes("VNEM_PHASE8_SECRET_CANARY"));

  const stalePlan = await call(client, "vnem_tools_project_command_run", { root: projectRoot, mode: "project_script", script: "test" });
  const packagePath = path.join(projectRoot, "package.json");
  const originalPackageText = await readFile(packagePath, "utf8");
  const changedPackage = JSON.parse(originalPackageText);
  changedPackage.scripts.test = "node scripts/task.mjs custom";
  await writeFile(packagePath, `${JSON.stringify(changedPackage, null, 2)}\n`, "utf8");
  const staleRun = await client.callTool({ name: "vnem_tools_project_command_run", arguments: { root: projectRoot, mode: "project_script", script: "test", review_id: stalePlan.structuredContent.project_command.review.review_id, dry_run: false, approved: true, approval_note: "prove stale review rejection" } });
  assert.equal(staleRun.isError, true);
  assert.equal(staleRun.structuredContent.code, "command_review_mismatch");
  await writeFile(packagePath, originalPackageText, "utf8");

  const longPlan = await call(client, "vnem_tools_project_command_run", { root: projectRoot, mode: "project_script", script: "long-output" });
  const longRun = await call(client, "vnem_tools_project_command_run", { root: projectRoot, mode: "project_script", script: "long-output", review_id: longPlan.structuredContent.project_command.review.review_id, dry_run: false, approved: true, approval_note: "approve bounded long output proof", max_output_bytes: 1024 });
  const longExecution = longRun.structuredContent.project_command.execution;
  assert.equal(longExecution.output_summary.output_truncated, true);
  assert.equal(longExecution.output_summary.response_strategy, "head_tail_summary_with_redacted_log");
  assert.ok((await stat(longExecution.stdout_log)).size > 1024);

  const failPlan = await call(client, "vnem_tools_project_command_run", { root: projectRoot, mode: "project_script", script: "fail-seven" });
  const failedRun = await call(client, "vnem_tools_project_command_run", { root: projectRoot, mode: "project_script", script: "fail-seven", review_id: failPlan.structuredContent.project_command.review.review_id, dry_run: false, approved: true, approval_note: "approve explicit exit code proof" });
  assert.equal(failedRun.structuredContent.project_command.operation_result, "failed");
  assert.equal(failedRun.structuredContent.project_command.execution.exit_code, 7);
  assert.equal(failedRun.structuredContent.project_command.execution.timed_out, false);

  const timeoutPlan = await call(client, "vnem_tools_project_command_run", { root: projectRoot, mode: "project_script", script: "orphan-timeout" });
  const timeoutRun = await call(client, "vnem_tools_project_command_run", { root: projectRoot, mode: "project_script", script: "orphan-timeout", review_id: timeoutPlan.structuredContent.project_command.review.review_id, dry_run: false, approved: true, approval_note: "approve bounded timeout and process-tree proof", timeout_ms: 1000 });
  assert.equal(timeoutRun.structuredContent.project_command.execution.timed_out, true);
  await sleep(3000);
  const terminationEvidence = timeoutRun.structuredContent.project_command.execution.process_tree_termination_evidence;
  assert.equal(await exists(path.join(projectRoot, "state", "orphan-survived.txt")), false, `timeout descendant survived process-tree cleanup: ${JSON.stringify(terminationEvidence)}`);
  assert.equal(terminationEvidence.ok, true, `process-tree cleanup was not verified: ${JSON.stringify(terminationEvidence)}`);
  if (process.platform === "win32") assert.deepEqual(terminationEvidence.cleanup_verification.surviving_after_cleanup, []);

  const graphPlan = await call(client, "vnem_tools_project_task_graph_plan", {
    root: projectRoot,
    name: "prepare verify finish with resume",
    nodes: [
      { id: "prepare", mode: "project_script", script: "prepare-state", rollback: { mode: "project_script", script: "rollback-prepare" } },
      { id: "already-satisfied", depends_on: ["prepare"], mode: "known_safe", argv: ["node", "--check", "scripts/task.mjs"], satisfaction: { type: "path_exists", path: "state/prepared.txt" } },
      { id: "finish", depends_on: ["prepare", "already-satisfied"], mode: "reviewed_custom", argv: ["node", "scripts/task.mjs", "finish"], rollback: { mode: "reviewed_custom", argv: ["node", "scripts/task.mjs", "rollback-finish"] } }
    ]
  });
  const graphId = graphPlan.structuredContent.project_task_graph.graph_id;
  assert.deepEqual(graphPlan.structuredContent.project_task_graph.order, ["prepare", "already-satisfied", "finish"]);
  const graphDry = await call(client, "vnem_tools_project_task_graph_run", { graph_id: graphId });
  assert.equal(graphDry.structuredContent.project_task_graph.executed, false);
  const pausedGraph = await call(client, "vnem_tools_project_task_graph_run", { graph_id: graphId, dry_run: false, approved: true, approval_note: "approve first graph checkpoint", max_nodes: 1 });
  assert.equal(pausedGraph.structuredContent.project_task_graph.status, "paused");
  assert.equal(pausedGraph.structuredContent.project_task_graph.counts.completed, 1);
  assert.equal(pausedGraph.structuredContent.project_task_graph.counts.satisfied, 1);
  const resumedGraph = await call(client, "vnem_tools_project_task_graph_run", { graph_id: graphId, dry_run: false, approved: true, approval_note: "approve exact graph resume" });
  assert.equal(resumedGraph.structuredContent.project_task_graph.status, "completed");
  assert.equal(resumedGraph.structuredContent.project_task_graph.run_count, 2);
  assert.equal(await exists(path.join(projectRoot, "state", "prepared.txt")), true);
  assert.equal(await exists(path.join(projectRoot, "state", "finished.txt")), true);
  const graphStatus = await call(client, "vnem_tools_project_task_graph_status", { graph_id: graphId });
  assert.equal(graphStatus.structuredContent.project_task_graph.resume_supported, false);
  const rolledBackGraph = await call(client, "vnem_tools_project_task_graph_rollback", { graph_id: graphId, dry_run: false, approved: true, approval_note: "approve reverse-order graph rollback" });
  assert.equal(rolledBackGraph.structuredContent.project_task_graph_rollback.status, "rolled_back");
  assert.equal(await exists(path.join(projectRoot, "state", "prepared.txt")), false);
  assert.equal(await exists(path.join(projectRoot, "state", "finished.txt")), false);

  const port = await reservePort();
  const startedServer = await call(client, "vnem_tools_start_dev_server", { root: projectRoot, script: "dev", port, dry_run: false, approved: true, approval_note: "approve isolated fixture server", wait_ms: 800 });
  devServerId = startedServer.structuredContent.dev_server.server_id;
  assert.equal(startedServer.structuredContent.dev_server.started, true);
  const diagnosis = await call(client, "vnem_tools_project_runtime_diagnose", { root: projectRoot, ports: [port], log_paths: ["logs/project.log"], lock_paths: ["logs/project.log"] });
  const runtime = diagnosis.structuredContent.project_runtime_diagnosis;
  assert.equal(runtime.diagnostic_order[0], "logs");
  assert.ok(runtime.logs.some((log) => log.path === "logs/project.log"));
  assert.equal(runtime.ports.find((item) => item.port === port).listening, true);
  assert.ok(runtime.known_dev_servers.some((server) => server.server_id === devServerId));
  const stoppedServer = await call(client, "vnem_tools_stop_dev_server", { server_id: devServerId, approved: true, approval_note: "stop isolated fixture server" });
  assert.equal(stoppedServer.structuredContent.dev_server_stop.stopped, true);
  assert.equal(stoppedServer.structuredContent.dev_server_stop.listener_stop_verified, true);
  devServerId = null;
  assert.equal(await canBindPort(port), true, "dev-server port remained occupied");

  const cleanupTarget = path.join(projectRoot, ".tmp", "cleanup-target");
  await mkdir(cleanupTarget, { recursive: true });
  await writeFile(path.join(cleanupTarget, "artifact.txt"), "temporary\n", "utf8");
  const cleanupPreview = await call(client, "vnem_tools_project_temp_cleanup", { root: projectRoot, operation: "preview", paths: [".tmp/cleanup-target"] });
  assert.equal(cleanupPreview.structuredContent.project_temp_cleanup.rollback_available, true);
  const cleanup = await call(client, "vnem_tools_project_temp_cleanup", { root: projectRoot, operation: "quarantine", paths: [".tmp/cleanup-target"], dry_run: false, approved: true, approval_note: "approve reversible temp quarantine" });
  const cleanupResult = cleanup.structuredContent.project_temp_cleanup;
  assert.equal(cleanupResult.operation_result, "quarantined");
  assert.equal(cleanupResult.rollback_available, true);
  assert.equal(cleanupResult.moved[0].retry.attempts >= 1, true);
  assert.equal(await exists(cleanupTarget), false);
  const restore = await call(client, "vnem_tools_project_temp_cleanup", { root: projectRoot, operation: "restore", cleanup_id: cleanupResult.cleanup_id, dry_run: false, approved: true, approval_note: "approve exact temp quarantine restore" });
  assert.equal(restore.structuredContent.project_temp_cleanup.operation_result, "restored");
  assert.equal(await exists(path.join(cleanupTarget, "artifact.txt")), true);

  if (benchmarkOutput) {
    await mkdir(path.dirname(benchmarkOutput), { recursive: true });
    await writeFile(benchmarkOutput, `${JSON.stringify({
      schema_version: 1,
      phase: 8,
      generated_at: new Date().toISOString(),
      benchmark_type: "actual_mcp_project_automation_execution",
      mcp_transport: "stdio",
      total_duration_ms: Number((performance.now() - startedAt).toFixed(2)),
      tool_calls: timings,
      proof: {
        shells_detected: environment.shells.filter((shell) => shell.available).map((shell) => shell.command),
        package_manager: environment.selected_package_manager,
        task_runners: environment.task_runners.map((runner) => runner.runner),
        known_safe_exit: knownRun.structuredContent.project_command.execution.exit_code,
        safe_profile_custom_block: blockedCustomRun.structuredContent.code,
        exact_review_stale_block: staleRun.structuredContent.code,
        dangerous_declared_script_block: dangerous.structuredContent.code,
        dangerous_lifecycle_hook_block: lifecycleHookBlocked.structuredContent.code,
        shell_operator_block: operatorBlocked.structuredContent.code,
        raw_secret_argument_block: rawSecretBlocked.structuredContent.code,
        child_secret_environment_removed: envRun.structuredContent.project_command.execution.stdout.trim().endsWith("env-safety:absent"),
        long_output_bytes: longExecution.output_summary.stdout_bytes,
        long_output_compacted: longExecution.output_summary.output_truncated,
        explicit_failure_exit: failedRun.structuredContent.project_command.execution.exit_code,
        timeout_observed: timeoutRun.structuredContent.project_command.execution.timed_out,
        timeout_descendant_survived: false,
        graph_pause_status: pausedGraph.structuredContent.project_task_graph.status,
        graph_resume_status: resumedGraph.structuredContent.project_task_graph.status,
        graph_satisfied_nodes: resumedGraph.structuredContent.project_task_graph.counts.satisfied,
        graph_rollback_status: rolledBackGraph.structuredContent.project_task_graph_rollback.status,
        localhost_port_detected: true,
        dev_server_stopped_and_port_released: true,
        log_first_diagnosis: runtime.diagnostic_order[0] === "logs",
        temp_quarantine_status: cleanupResult.operation_result,
        temp_restore_status: restore.structuredContent.project_temp_cleanup.operation_result
      },
      limitations: [
        "Custom executable review binds exact argv and policy, but cannot prove arbitrary executable internals are harmless.",
        "Lock-owner identification is not guaranteed without an approved OS-specific handle inspector.",
        "Standalone command side effects are not automatically reversible; task graphs require explicit rollback commands."
      ]
    }, null, 2)}\n`, "utf8");
  }

  console.log("vnem Tools GIGA project-automation MCP tests passed");
} finally {
  if (devServerId && powerConnection) {
    await powerConnection.client.callTool({ name: "vnem_tools_stop_dev_server", arguments: { server_id: devServerId, approved: true, approval_note: "test cleanup" } }).catch(() => {});
  }
  await safeConnection?.close().catch(() => {});
  await powerConnection?.close().catch(() => {});
  await removeTempRoot(tmpRoot);
}

async function connect(profile) {
  const client = new Client({ name: `vnem-tools-giga-project-automation-${profile}`, version: "1.0.1" }, { capabilities: {} });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(scriptDir, "vnem-tools-mcp-server.mjs")],
    cwd: rootDir,
    env: {
      ...process.env,
      VNEM_TOOLS_ALLOWED_ROOTS: tmpRoot,
      VNEM_TOOLS_PERMISSION_PROFILE: profile,
      VNEM_TOOLS_EVIDENCE_ROOT: evidenceRoot,
      VNEM_TOOLS_ALLOW_LOCALHOST: "1",
      VNEM_PHASE8_SECRET_CANARY: "phase8-should-not-reach-child"
    },
    stderr: "pipe"
  });
  let stderr = "";
  transport.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });
  await client.connect(transport);
  return { client, transport, stderr: () => stderr, close: () => client.close() };
}

async function call(client, name, args) {
  const callStartedAt = performance.now();
  const result = await literalProjectAutomationCall(client, name, args);
  timings.push({ tool: name, duration_ms: Number((performance.now() - callStartedAt).toFixed(2)), status: result.isError ? "error" : "ok" });
  if (result.isError) throw new Error(`${name} failed: ${JSON.stringify(result.structuredContent || result.content)}`);
  return result;
}

async function literalProjectAutomationCall(client, name, args) {
  if (name === "vnem_tools_project_automation_inspect") return client.callTool({ name: "vnem_tools_project_automation_inspect", arguments: args });
  if (name === "vnem_tools_project_command_run") return client.callTool({ name: "vnem_tools_project_command_run", arguments: args });
  if (name === "vnem_tools_project_task_graph_plan") return client.callTool({ name: "vnem_tools_project_task_graph_plan", arguments: args });
  if (name === "vnem_tools_project_task_graph_run") return client.callTool({ name: "vnem_tools_project_task_graph_run", arguments: args });
  if (name === "vnem_tools_project_task_graph_status") return client.callTool({ name: "vnem_tools_project_task_graph_status", arguments: args });
  if (name === "vnem_tools_project_task_graph_rollback") return client.callTool({ name: "vnem_tools_project_task_graph_rollback", arguments: args });
  if (name === "vnem_tools_project_runtime_diagnose") return client.callTool({ name: "vnem_tools_project_runtime_diagnose", arguments: args });
  if (name === "vnem_tools_project_temp_cleanup") return client.callTool({ name: "vnem_tools_project_temp_cleanup", arguments: args });
  if (name === "vnem_tools_start_dev_server") return client.callTool({ name: "vnem_tools_start_dev_server", arguments: args });
  if (name === "vnem_tools_stop_dev_server") return client.callTool({ name: "vnem_tools_stop_dev_server", arguments: args });
  throw new Error(`Unexpected project automation tool ${name}`);
}

async function reservePort() {
  const start = 4000 + (process.pid % 4000);
  for (let offset = 0; offset < 2000; offset += 1) {
    const port = 3000 + ((start - 3000 + offset) % 7000);
    if (await canBindPort(port)) return port;
  }
  throw new Error("Could not reserve a free fixture port in 3000-9999.");
}

async function canBindPort(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
  });
}

async function exists(file) {
  try { await stat(file); return true; } catch { return false; }
}

async function removeTempRoot(root) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try { await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); return; }
    catch (error) { if (!["EBUSY", "EPERM", "ENOTEMPTY"].includes(error.code)) throw error; await sleep(250); }
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
