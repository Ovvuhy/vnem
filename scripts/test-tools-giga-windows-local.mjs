#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const benchmarkArg = process.argv.find((arg) => arg.startsWith("--benchmark-output="));
const benchmarkOutput = benchmarkArg ? path.resolve(rootDir, benchmarkArg.slice("--benchmark-output=".length)) : null;
const timings = [];
const startedAt = performance.now();

const listener = net.createServer(() => {});
await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve));
const listenerPort = listener.address().port;

const client = new Client({ name: "vnem-tools-giga-windows-local-test", version: "1.0.1" }, { capabilities: {} });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(scriptDir, "vnem-tools-mcp-server.mjs")],
  cwd: rootDir,
  env: {
    ...process.env,
    VNEM_TOOLS_ALLOWED_ROOTS: rootDir,
    VNEM_TOOLS_EVIDENCE_ROOT: path.join(rootDir, ".tmp", "windows-local-evidence"),
    VNEM_TOOLS_PERMISSION_PROFILE: "safe-readonly"
  }
});

try {
  await client.connect(transport);
  const listed = await client.listTools();
  const names = new Set(listed.tools.map((tool) => tool.name));
  const required = [
    "vnem_tools_powershell_command_plan",
    "vnem_tools_windows_system_snapshot",
    "vnem_tools_windows_path_inspect",
    "vnem_tools_process_inspect",
    "vnem_tools_port_inspect",
    "vnem_tools_windows_service_status",
    "vnem_tools_windows_scheduled_task_status",
    "vnem_tools_windows_event_log_read",
    "vnem_tools_windows_app_config_detect",
    "vnem_tools_windows_change_plan"
  ];
  for (const name of required) assert.ok(names.has(name), `missing Phase 11 tool ${name}`);

  const commandPlan = (await call("vnem_tools_powershell_command_plan", {
    executable: "C:\\Program Files\\Acme Tool\\tool.exe",
    arguments: ["alpha beta", "O'Brien", "; Remove-Item C:\\never", "$env:PATH"]
  })).structuredContent.powershell_command_plan;
  assert.equal(commandPlan.operation_result, "planned");
  assert.equal(commandPlan.executed, false);
  assert.equal(commandPlan.invocation, "& 'C:\\Program Files\\Acme Tool\\tool.exe' 'alpha beta' 'O''Brien' '; Remove-Item C:\\never' '$env:PATH'");
  assert.equal(commandPlan.quoting_contract.shell_operators_remain_literal_arguments, true);

  const secretPlan = await literalCall("vnem_tools_powershell_command_plan", { executable: "tool.exe", arguments: ["token=VNEM_SECRET_CANARY_123456"] });
  assert.equal(secretPlan.isError, true);
  assert.equal(secretPlan.structuredContent.code, "powershell_secret_argument_blocked");

  const snapshot = (await call("vnem_tools_windows_system_snapshot", {})).structuredContent.windows_system_snapshot;
  assert.equal(snapshot.read_only, true);
  assert.equal(snapshot.path_status.value_returned, false);
  assert.equal(snapshot.limitations.some((item) => /Environment variable values/.test(item)), true);
  const commandNames = [...snapshot.shells, ...snapshot.developer_commands].map((item) => item.name);
  for (const name of ["node", "npm", "git", "gh", "powershell", "cmd"]) assert.ok(commandNames.includes(name));

  const fixtureRoot = path.join(rootDir, "fixtures", "windows-local");
  const longRelative = path.join("long-segment".repeat(18), "missing.txt");
  const pathInspection = (await call("vnem_tools_windows_path_inspect", { root: fixtureRoot, paths: [".", "path with spaces/sample.txt", longRelative] })).structuredContent.windows_path_inspection;
  assert.equal(pathInspection.operation_result, "reported");
  assert.equal(pathInspection.paths.length, 3);
  const sample = pathInspection.paths.find((item) => item.input.includes("sample.txt"));
  assert.equal(sample.exists, true);
  assert.equal(sample.type, "file");
  assert.equal(sample.permissions.readable, true);
  assert.equal(sample.lock_probe.signal, "no_exclusive_write_lock_observed");
  assert.equal(pathInspection.paths.find((item) => item.input === longRelative).long_path.risk, process.platform === "win32");

  const secretPath = await literalCall("vnem_tools_windows_path_inspect", { root: fixtureRoot, paths: [".env"] });
  assert.equal(secretPath.isError, true);
  assert.equal(secretPath.structuredContent.code, "windows_sensitive_path_blocked");

  const processInspection = (await call("vnem_tools_process_inspect", { pids: [process.pid], include_vnem_process: true })).structuredContent.process_inspection;
  const portInspection = (await call("vnem_tools_port_inspect", { ports: [listenerPort] })).structuredContent.port_inspection;
  const services = (await call("vnem_tools_windows_service_status", { names: ["EventLog", "Schedule", "VNEMDefinitelyMissing"] })).structuredContent.windows_service_status;
  const task = (await call("vnem_tools_windows_scheduled_task_status", { tasks: ["\\VNEM\\DefinitelyMissing"] })).structuredContent.windows_scheduled_task_status;
  const events = (await call("vnem_tools_windows_event_log_read", { log_name: "Application", lookback_minutes: 15, max_events: 3, levels: [1, 2, 3, 4] })).structuredContent.windows_event_log;

  if (process.platform === "win32") {
    assert.equal(snapshot.operation_result, "reported");
    assert.ok(snapshot.windows_status.operation_result === "reported" || snapshot.windows_status.operation_result === "probe_failed");
    assert.equal(processInspection.operation_result, "reported", JSON.stringify(processInspection.probe));
    assert.ok(processInspection.processes.some((item) => item.pid === processInspection.requested.vnem_process_pid), JSON.stringify({ requested: processInspection.requested, processes: processInspection.processes, not_found: processInspection.not_found }));
    assert.equal(processInspection.privacy.command_lines_returned, false);
    assert.equal(portInspection.operation_result, "reported", JSON.stringify(portInspection.probe));
    assert.equal(portInspection.ports[0].listening, true);
    assert.ok(portInspection.ports[0].listeners.some((item) => item.pid === process.pid));
    assert.equal(services.operation_result, "reported", JSON.stringify(services.probe));
    assert.equal(services.services.length, 3);
    assert.equal(services.services.find((item) => item.name === "EventLog").found, true);
    assert.equal(services.services.find((item) => item.name === "VNEMDefinitelyMissing").found, false);
    assert.equal(task.operation_result, "reported", JSON.stringify(task.probe));
    assert.equal(task.tasks[0].found, false);
    assert.ok(["reported", "access_denied"].includes(events.operation_result));
    assert.ok(events.events.length <= 3);
    assert.equal(events.export_performed, false);
  } else {
    for (const result of [processInspection, portInspection, services, task, events]) assert.equal(result.operation_result, "unsupported_platform");
  }

  const wildcardService = await literalCall("vnem_tools_windows_service_status", { names: ["Win*"] });
  assert.equal(wildcardService.isError, true);
  assert.equal(wildcardService.structuredContent.code, "windows_service_name_invalid");

  const clients = (await call("vnem_tools_windows_app_config_detect", { root: rootDir })).structuredContent.windows_app_config_detection;
  assert.equal(clients.operation_result, "reported");
  assert.equal(clients.clients.length, 11);
  assert.equal(clients.config_content_read, false);
  assert.equal(clients.config_content_modified, false);
  assert.ok(clients.clients.some((item) => item.id === "codex_app" && /Restart/.test(item.reload_guidance)));

  const changePlan = (await call("vnem_tools_windows_change_plan", {
    operation: "service_change",
    target: "ExampleService",
    desired_state: "running",
    rollback_steps: ["Restore the captured prior service state and start mode."]
  })).structuredContent.windows_change_plan;
  assert.equal(changePlan.operation_result, "plan_ready_for_permission_review");
  assert.equal(changePlan.execution_supported, false);
  assert.equal(changePlan.explicit_scoped_approval_required, true);
  assert.equal(changePlan.rollback_plan_required, true);
  assert.equal(changePlan.action_policy_preview.blocked, true);
  assert.equal(changePlan.action_policy_preview.requires_approval, false);

  const securityPlan = (await call("vnem_tools_windows_change_plan", {
    operation: "firewall_change",
    target: "Windows Firewall security protection",
    desired_state: "disable firewall",
    rollback_steps: ["Re-enable Windows Firewall."]
  })).structuredContent.windows_change_plan;
  assert.equal(securityPlan.operation_result, "hard_blocked");
  assert.equal(securityPlan.hard_blocked, true);
  assert.match(securityPlan.blockers[0], /does not disable Windows security/);

  const incompletePlan = (await call("vnem_tools_windows_change_plan", { operation: "system_path_change", target: "Machine PATH", desired_state: "append C:\\Tools", rollback_steps: [] })).structuredContent.windows_change_plan;
  assert.equal(incompletePlan.operation_result, "incomplete_plan");
  assert.ok(incompletePlan.blockers.some((item) => /rollback/.test(item)));

  if (benchmarkOutput) await writeBenchmark(benchmarkOutput, { snapshot, processInspection, portInspection, services, task, events, clients, commandPlan, changePlan, securityPlan });
  console.log("vnem Tools GIGA Windows/local-PC MCP tests passed");
} finally {
  await client.close().catch(() => {});
  await new Promise((resolve) => listener.close(resolve));
}

async function call(name, args) {
  const started = performance.now();
  const result = await literalCall(name, args);
  timings.push({ tool: name, duration_ms: Number((performance.now() - started).toFixed(2)), status: result.isError ? "error" : "ok" });
  if (result.isError) throw new Error(`${name} failed: ${JSON.stringify(result.structuredContent || result.content)}`);
  return result;
}

async function literalCall(name, args) {
  if (name === "vnem_tools_powershell_command_plan") return await client.callTool({ name: "vnem_tools_powershell_command_plan", arguments: args });
  if (name === "vnem_tools_windows_system_snapshot") return await client.callTool({ name: "vnem_tools_windows_system_snapshot", arguments: args });
  if (name === "vnem_tools_windows_path_inspect") return await client.callTool({ name: "vnem_tools_windows_path_inspect", arguments: args });
  if (name === "vnem_tools_process_inspect") return await client.callTool({ name: "vnem_tools_process_inspect", arguments: args });
  if (name === "vnem_tools_port_inspect") return await client.callTool({ name: "vnem_tools_port_inspect", arguments: args });
  if (name === "vnem_tools_windows_service_status") return await client.callTool({ name: "vnem_tools_windows_service_status", arguments: args });
  if (name === "vnem_tools_windows_scheduled_task_status") return await client.callTool({ name: "vnem_tools_windows_scheduled_task_status", arguments: args });
  if (name === "vnem_tools_windows_event_log_read") return await client.callTool({ name: "vnem_tools_windows_event_log_read", arguments: args });
  if (name === "vnem_tools_windows_app_config_detect") return await client.callTool({ name: "vnem_tools_windows_app_config_detect", arguments: args });
  if (name === "vnem_tools_windows_change_plan") return await client.callTool({ name: "vnem_tools_windows_change_plan", arguments: args });
  throw new Error(`Unexpected Windows/local-PC tool ${name}`);
}

async function writeBenchmark(outputPath, proof) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  const benchmark = {
    schema_version: 1,
    phase: 11,
    benchmark_type: "actual_stdio_mcp_windows_local_execution",
    generated_at: new Date().toISOString(),
    total_duration_ms: Number((performance.now() - startedAt).toFixed(2)),
    platform: process.platform,
    mcp_transport: "stdio",
    tools_exercised: [...new Set(timings.map((item) => item.tool))],
    tool_calls: timings,
    results: {
      powershell_quoting: { planned: proof.commandPlan.operation_result === "planned", embedded_quote_doubled: proof.commandPlan.invocation.includes("O''Brien"), shell_operator_literal: proof.commandPlan.invocation.includes("'; Remove-Item") },
      system_snapshot: { status: proof.snapshot.operation_result, path_entries: proof.snapshot.path_status.entry_count, path_missing: proof.snapshot.path_status.missing_entries.length, developer_commands_found: proof.snapshot.developer_commands.filter((item) => item.found).map((item) => item.name), long_paths: proof.snapshot.windows_status.long_paths || null, defender: proof.snapshot.windows_status.defender || null },
      process: { status: proof.processInspection.operation_result, owned_vnem_pid_found: proof.processInspection.processes?.some((item) => item.pid === proof.processInspection.requested?.vnem_process_pid) || false, externally_requested_pid_visible: proof.processInspection.processes?.some((item) => item.pid === process.pid) || false, command_lines_returned: false },
      port: { status: proof.portInspection.operation_result, requested_port_listening: proof.portInspection.ports?.[0]?.listening || false, listener_pid_correlated: proof.portInspection.ports?.[0]?.listeners?.some((item) => item.pid === process.pid) || false },
      services: { status: proof.services.operation_result, found: proof.services.services?.filter((item) => item.found).map((item) => item.name) || [], missing_exact_target_reported: proof.services.services?.some((item) => !item.found) || false },
      scheduled_task: { status: proof.task.operation_result, missing_exact_target_reported: proof.task.tasks?.[0]?.found === false },
      event_log: { status: proof.events.operation_result, bounded_event_count: proof.events.events?.length || 0, export_performed: false },
      clients: { detected: proof.clients.detected_count, catalog_count: proof.clients.clients.length, config_content_read: false },
      mutation_gate: { execution_supported: proof.changePlan.execution_supported, scoped_approval_required: proof.changePlan.explicit_scoped_approval_required, rollback_required: proof.changePlan.rollback_plan_required, safe_readonly_blocks_local_pc_action: proof.changePlan.action_policy_preview.blocked, security_disable_hard_blocked: proof.securityPlan.hard_blocked }
    },
    limitations: ["This is same-machine bounded Windows evidence, not universal machine compatibility proof.", "File-lock owner identity is not proven.", "Service, scheduled-task, registry, firewall, antivirus, PATH, and machine-setting mutation is not implemented.", "Event Viewer messages are bounded/redacted and may be unavailable due access policy.", "No environment values, process command lines, config contents, credentials, or security bypasses are collected."]
  };
  await writeFile(outputPath, `${JSON.stringify(benchmark, null, 2)}\n`, "utf8");
}
