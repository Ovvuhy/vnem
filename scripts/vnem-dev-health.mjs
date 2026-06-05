#!/usr/bin/env node
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
export const knownVnemPorts = [9099, 4174, 4175];

export function parseHealthArgs(argv = process.argv.slice(2)) {
  return {
    json: argv.includes("--json"),
    cleanupDashboard: argv.includes("--cleanup-dashboard")
  };
}

export async function inspectVnemDevHealth(options = {}) {
  const platform = options.platform ?? process.platform;
  const processRows = options.processRows ?? await discoverProcessRows({ platform, execCommand: options.execCommand });
  const rowsByPort = new Map(processRows.map((row) => [Number(row.port), row]));
  const ports = knownVnemPorts.map((port) => {
    const row = rowsByPort.get(port) ?? null;
    const command = row?.command ?? null;
    const entry = {
      port,
      service: port === 9099 ? "vnem-app-server/backend" : "dashboard-dev/preview",
      listening: Boolean(row),
      pid: row?.pid ?? null,
      command,
      commandDetection: command ? "available" : row ? "limited-or-unavailable" : "not-listening",
      looksLikeVnemAppServer: looksLikeVnemAppServer({ port, command }),
      looksLikeDashboardDevServer: looksLikeDashboardDevServer({ port, command }),
      recommendedAction: ""
    };
    entry.recommendedAction = deriveRecommendedAction(entry);
    return entry;
  });

  return {
    ok: true,
    checkedAt: new Date().toISOString(),
    platform,
    ports,
    cleanup: { requested: false, attempted: [], skipped: [] }
  };
}

export function deriveRecommendedAction(entry) {
  if (!entry.listening) return "Port is free; do not start a duplicate unless needed.";
  if (entry.port === 9099) {
    return entry.looksLikeVnemAppServer
      ? "Reuse the existing VNEM backend/app server; do not start a duplicate."
      : "Port 9099 is occupied by an unknown process. Do not kill it automatically.";
  }
  if (entry.looksLikeDashboardDevServer) return "Dashboard dev server is already running; reuse it or run --cleanup-dashboard after visual checks.";
  return "Do not kill automatically; listener is not clearly a VNEM dashboard dev server.";
}

export function shouldCleanupProcess(entry) {
  return Boolean(entry?.listening && [4174, 4175].includes(Number(entry.port)) && entry.looksLikeDashboardDevServer && entry.pid);
}

export async function cleanupDashboardServers(report, options = {}) {
  const platform = options.platform ?? process.platform;
  const killProcess = options.killProcess ?? defaultKillProcess;
  const attempted = [];
  const skipped = [];
  for (const entry of report.ports) {
    if (shouldCleanupProcess(entry)) {
      const result = await killProcess(entry.pid, { platform });
      attempted.push({ port: entry.port, pid: entry.pid, command: entry.command, ok: result.ok, message: result.message });
    } else if (entry.listening) {
      skipped.push({ port: entry.port, pid: entry.pid, reason: entry.port === 9099 ? "9099/backend is never killed by dashboard cleanup" : "process is not clearly dashboard Vite" });
    }
  }
  return { ...report, cleanup: { requested: true, attempted, skipped } };
}

export function formatHealthText(report) {
  const lines = [];
  lines.push(`VNEM Dev Health (${report.checkedAt})`);
  lines.push(`Platform: ${report.platform}`);
  for (const entry of report.ports) {
    lines.push(`- ${entry.port} ${entry.service}: ${entry.listening ? "LISTENING" : "free"}`);
    if (entry.pid) lines.push(`  PID: ${entry.pid}`);
    if (entry.command) lines.push(`  command: ${entry.command}`);
    if (entry.listening && !entry.command) lines.push("  command: unavailable from this environment");
    lines.push(`  app-server: ${entry.looksLikeVnemAppServer ? "yes" : "no"}; dashboard-dev: ${entry.looksLikeDashboardDevServer ? "yes" : "no"}`);
    lines.push(`  recommended: ${entry.recommendedAction}`);
  }
  if (report.cleanup?.requested) {
    lines.push("Cleanup dashboard result:");
    for (const action of report.cleanup.attempted) lines.push(`- killed? ${action.ok ? "yes" : "no"} port ${action.port} pid ${action.pid}: ${action.message}`);
    for (const skip of report.cleanup.skipped) lines.push(`- skipped port ${skip.port} pid ${skip.pid ?? "n/a"}: ${skip.reason}`);
    if (report.cleanup.attempted.length === 0) lines.push("- no dashboard dev servers were clearly safe to kill");
  }
  return `${lines.join("\n")}\n`;
}

async function discoverProcessRows({ platform, execCommand = defaultExecCommand }) {
  if (platform === "win32") return discoverWindowsRows(execCommand);
  return discoverUnixRows(execCommand);
}

async function discoverWindowsRows(execCommand) {
  const netstat = await execCommand("netstat", ["-ano"]);
  const rows = parseWindowsNetstat(netstat.stdout);
  for (const row of rows) row.command = await windowsCommandForPid(row.pid, execCommand);
  return rows;
}

async function discoverUnixRows(execCommand) {
  const rows = [];
  for (const port of knownVnemPorts) {
    let stdout = "";
    try {
      stdout = (await execCommand("sh", ["-lc", `lsof -nP -iTCP:${port} -sTCP:LISTEN -FpPc 2>/dev/null || true`])).stdout;
    } catch {
      stdout = "";
    }
    const pidMatch = stdout.match(/\np(\d+)/) ?? stdout.match(/^p(\d+)/);
    if (!pidMatch) continue;
    const pid = Number(pidMatch[1]);
    let command = stdout.match(/\nc(.+)/)?.[1] ?? null;
    if (pid && !command) {
      try { command = (await execCommand("ps", ["-p", String(pid), "-o", "command="])).stdout.trim() || null; } catch { command = null; }
    }
    rows.push({ port, pid, command });
  }
  return rows;
}

function parseWindowsNetstat(stdout = "") {
  const rows = [];
  for (const line of stdout.split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/);
    if (parts[0] !== "TCP") continue;
    if (!parts.includes("LISTENING")) continue;
    const local = parts[1] ?? "";
    const port = Number(local.match(/:(\d+)$/)?.[1]);
    if (!knownVnemPorts.includes(port)) continue;
    rows.push({ port, pid: Number(parts.at(-1)), command: null });
  }
  return rows;
}

async function windowsCommandForPid(pid, execCommand) {
  if (!pid) return null;
  try {
    const result = await execCommand("wmic", ["process", "where", `ProcessId=${pid}`, "get", "CommandLine", "/value"]);
    const command = result.stdout.match(/CommandLine=(.*)/s)?.[1]?.trim();
    if (command) return command.replace(/\r?\n/g, " ").trim();
  } catch {}
  try {
    const result = await execCommand("powershell.exe", ["-NoProfile", "-Command", `(Get-CimInstance Win32_Process -Filter \"ProcessId=${pid}\").CommandLine`]);
    const command = result.stdout.trim();
    if (command) return command.replace(/\r?\n/g, " ").trim();
  } catch {}
  try {
    const result = await execCommand("tasklist", ["/FI", `PID eq ${pid}`, "/V", "/FO", "LIST"]);
    return result.stdout.trim() || null;
  } catch {}
  return null;
}

function looksLikeVnemAppServer({ port, command }) {
  return Number(port) === 9099 && /vnem-app-server\.mjs/i.test(String(command ?? ""));
}

function looksLikeDashboardDevServer({ port, command }) {
  const text = String(command ?? "").toLowerCase();
  return [4174, 4175].includes(Number(port)) && text.includes("vite") && text.includes("dashboard");
}

async function defaultExecCommand(command, args) {
  try {
    const result = await execFileAsync(command, args, { windowsHide: true, maxBuffer: 2 * 1024 * 1024 });
    return { stdout: result.stdout, stderr: result.stderr, code: 0 };
  } catch (error) {
    return { stdout: error.stdout ?? "", stderr: error.stderr ?? error.message, code: error.code ?? 1 };
  }
}

async function defaultKillProcess(pid, { platform }) {
  if (!pid) return { ok: false, message: "missing pid" };
  if (platform === "win32") {
    const result = await defaultExecCommand("taskkill", ["/PID", String(pid), "/F"]);
    return { ok: result.code === 0, message: (result.stdout || result.stderr || "taskkill completed").trim() };
  }
  try {
    process.kill(Number(pid), "SIGTERM");
    return { ok: true, message: "SIGTERM sent" };
  } catch (error) {
    return { ok: false, message: error.message };
  }
}

async function main() {
  const args = parseHealthArgs();
  let report = await inspectVnemDevHealth();
  if (args.cleanupDashboard) report = await cleanupDashboardServers(report);
  process.stdout.write(args.json ? `${JSON.stringify(report, null, 2)}\n` : formatHealthText(report));
}

if (path.basename(process.argv[1] ?? "") === "vnem-dev-health.mjs") {
  await main();
}
