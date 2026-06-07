#!/usr/bin/env node
import { execFile } from "node:child_process";
import { access, readdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { inspectVnemDevHealth } from "./vnem-dev-health.mjs";

const execFileAsync = promisify(execFile);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultRootDir = path.resolve(scriptDir, "..");

export function parseBuilderSessionArgs(argv = process.argv.slice(2)) {
  return { json: argv.includes("--json") };
}

export async function buildBuilderSessionReport(options = {}) {
  const rootDir = path.resolve(options.rootDir ?? defaultRootDir);
  const now = options.now ?? new Date();
  const git = options.git ?? ((args) => runGit(rootDir, args));
  const pathExists = options.pathExists ?? exists;
  const listDispatchFiles = options.listDispatchFiles ?? (() => findGeneratedDispatchFiles(rootDir));
  const devHealth = options.devHealth ?? (() => inspectVnemDevHealth());

  const [branch, localHead, originMainRaw, statusRaw, latestLog, dispatchFiles, devHealthReport] = await Promise.all([
    git(["branch", "--show-current"]).catch((error) => unavailable(error)),
    git(["rev-parse", "HEAD"]).catch((error) => unavailable(error)),
    git(["ls-remote", "origin", "refs/heads/main"]).catch((error) => unavailable(error)),
    git(["status", "--short", "--untracked-files=all"]).catch((error) => `!! unavailable: ${error.message}`),
    git(["log", "--oneline", "-1"]).catch((error) => unavailable(error)),
    listDispatchFiles().catch(() => []),
    devHealth().catch((error) => ({ ok: false, error: error.message, ports: [] }))
  ]);

  const originMainSha = parseOriginSha(originMainRaw);
  const cleanHead = clean(localHead);
  const worktree = summarizeWorktree(statusRaw);
  const accidentalPaths = await Promise.all(accidentalPathTargets(rootDir).map(async (target) => ({ path: target, exists: await pathExists(target).catch(() => false) })));

  const report = {
    ok: true,
    timestamp: now.toISOString(),
    rootDir,
    branch: clean(branch),
    localHead: cleanHead,
    originMainSha,
    localMatchesOriginMain: Boolean(cleanHead && originMainSha && cleanHead === originMainSha),
    latestCommit: clean(latestLog),
    worktree,
    generatedDispatchFiles: dispatchFiles,
    accidentalPaths,
    devHealth: summarizeDevHealth(devHealthReport),
    activeRun: null,
    latestRun: null,
    recoveryStatus: null,
    runHistorySummary: null,
    nextSafeAction: ""
  };
  const runState = await loadBuilderRunState({ rootDir, report }).catch(() => ({ activeRun: null, latestRun: null, recoveryStatus: { state: "unavailable", nextAction: "Builder run state unavailable; inspect discovery/run-history manually." }, runHistorySummary: { count: 0 } }));
  report.activeRun = runState.activeRun;
  report.latestRun = runState.latestRun;
  report.recoveryStatus = runState.recoveryStatus;
  report.runHistorySummary = runState.runHistorySummary;
  report.nextSafeAction = recommendNextAction(report);
  return report;
}

export function summarizeWorktree(statusRaw = "") {
  const lines = String(statusRaw).split(/\r?\n/).filter(Boolean);
  const changedFiles = [];
  const untrackedFiles = [];
  for (const line of lines) {
    const status = line.slice(0, 2);
    const file = line.slice(3).trim();
    if (!file) continue;
    if (status === "??") untrackedFiles.push(file);
    else changedFiles.push(file);
  }
  return { clean: lines.length === 0, raw: lines, changedFiles, untrackedFiles };
}

export function formatBuilderSessionText(report) {
  const lines = [];
  lines.push(`VNEM Builder Session (${report.timestamp})`);
  lines.push(`Root: ${report.rootDir}`);
  lines.push(`Branch: ${report.branch}`);
  lines.push(`HEAD: ${report.localHead}`);
  lines.push(`origin/main: ${report.originMainSha ?? "unavailable"}`);
  lines.push(`local matches origin/main: ${report.localMatchesOriginMain ? "yes" : "no"}`);
  lines.push(`worktree: ${report.worktree.clean ? "clean" : "dirty"}`);
  if (report.worktree.changedFiles.length) lines.push(`changed files: ${report.worktree.changedFiles.join(", ")}`);
  if (report.worktree.untrackedFiles.length) lines.push(`untracked files: ${report.worktree.untrackedFiles.join(", ")}`);
  lines.push(`generated dispatch files: ${report.generatedDispatchFiles.length ? report.generatedDispatchFiles.join(", ") : "none"}`);
  for (const entry of report.accidentalPaths) lines.push(`${entry.path}: ${entry.exists ? "exists" : "absent"}`);
  lines.push("Dev ports:");
  for (const port of report.devHealth.ports) lines.push(`- ${port.port}: ${port.listening ? "listening" : "free"}${port.pid ? ` pid ${port.pid}` : ""} — ${port.recommendedAction}`);
  lines.push(`active builder run: ${report.activeRun ? `${report.activeRun.title} (${report.activeRun.status})` : "none"}`);
  lines.push(`latest builder run: ${report.latestRun ? `${report.latestRun.title} (${report.latestRun.status})` : "none"}`);
  if (report.recoveryStatus?.nextAction) lines.push(`recovery: ${report.recoveryStatus.nextAction}`);
  lines.push(`Next safe action: ${report.nextSafeAction}`);
  return `${lines.join("\n")}\n`;
}

function summarizeDevHealth(devHealthReport) {
  return {
    ok: devHealthReport.ok !== false,
    checkedAt: devHealthReport.checkedAt ?? null,
    ports: (devHealthReport.ports ?? []).map((port) => ({
      port: port.port,
      listening: port.listening,
      pid: port.pid,
      service: port.service,
      looksLikeVnemAppServer: port.looksLikeVnemAppServer,
      looksLikeDashboardDevServer: port.looksLikeDashboardDevServer,
      recommendedAction: port.recommendedAction
    }))
  };
}

function recommendNextAction(report) {
  if (report.activeRun) return "Active builder run exists. Do not start a new feature; recover, update, finish, or mark the active run blocked first.";
  if (report.recoveryStatus?.state === "active-run-interrupted") return report.recoveryStatus.nextAction;
  if (!report.worktree.clean) return "Do not start new feature work. Resolve, validate, commit/push, or explicitly discard the dirty worktree first.";
  if (report.generatedDispatchFiles.length) return "Review or remove generated dispatch files before continuing self-improvement work.";
  if (report.accidentalPaths.some((entry) => entry.exists)) return "Stop and remove accidental duplicate VNEM path before editing.";
  if (!report.localMatchesOriginMain) return "Synchronize local main with origin/main before stacking a new update.";
  const dashboardPorts = report.devHealth.ports.filter((entry) => [4174, 4175].includes(entry.port) && entry.listening);
  if (dashboardPorts.length > 1) return "Multiple dashboard dev servers are listening; reuse one or run npm run dev:cleanup-dashboard after visual checks.";
  return "Clean start. It is safe to begin a focused VNEM update after reading the target files.";
}

async function loadBuilderRunState({ rootDir, report }) {
  const [{ latestBuilderRun, readActiveBuilderRun, recoverBuilderRun }] = await Promise.all([import("./vnem-builder-run.mjs")]);
  const [activeRun, latestRun, recovery] = await Promise.all([readActiveBuilderRun({ rootDir }), latestBuilderRun({ rootDir }), recoverBuilderRun({ rootDir, sessionProvider: async () => report })]);
  const recoveryStatus = { state: recovery.state, nextAction: recovery.nextAction };
  const summarizeCapture = (capture) => {
    const commands = capture?.commands ?? [];
    const laterPassed = new Set();
    let lastFailedCommand = null;
    for (const command of [...commands].reverse()) {
      const key = command.command ?? command.label;
      if (command.status === "passed") laterPassed.add(key);
      if (command.status === "failed" && !laterPassed.has(key)) {
        lastFailedCommand = command;
        break;
      }
    }
    return { commandCount: commands.length, lastCommand: capture?.lastCommand ?? commands.at(-1) ?? null, lastFailedCommand };
  };
  const summarize = (run) => run ? {
    id: run.id,
    title: run.title,
    status: run.status,
    startedAt: run.startedAt,
    updatedAt: run.updatedAt,
    finishedAt: run.finishedAt,
    commit: run.commit,
    pushed: run.pushed,
    pushStatus: run.pushStatus,
    validationRun: run.validationRun,
    generatedArtifacts: run.generatedArtifacts,
    visualCheck: run.visualCheck,
    safetyChecks: run.safetyChecks,
    capture: summarizeCapture(run.capture),
    nextRecommendedImprovement: run.nextRecommendedImprovement
  } : null;
  return {
    activeRun: summarize(activeRun),
    latestRun: summarize(latestRun),
    recoveryStatus,
    runHistorySummary: { hasActiveRun: Boolean(activeRun), latestRunId: latestRun?.id ?? null }
  };
}

async function runGit(rootDir, args) {
  const result = await execFileAsync("git", args, { cwd: rootDir, windowsHide: true, maxBuffer: 2 * 1024 * 1024 });
  return result.stdout;
}

async function exists(target) {
  try { await access(target); return true; } catch { return false; }
}

async function findGeneratedDispatchFiles(rootDir) {
  const dir = path.join(rootDir, ".vnem", "approved");
  try {
    const names = await readdir(dir);
    return names.filter((name) => /^dispatch-.*\.md$/i.test(name)).map((name) => path.join(".vnem", "approved", name).replace(/\\/g, "/"));
  } catch {
    return [];
  }
}

function accidentalPathTargets(rootDir) {
  const targets = ["/c/c/VNEM"];
  if (process.platform === "win32") targets.push("C:/c/VNEM");
  const driveMatch = rootDir.match(/^([A-Za-z]):/);
  if (driveMatch) targets.push(`${driveMatch[1]}:/c/VNEM`);
  return [...new Set(targets)];
}

function parseOriginSha(raw = "") {
  const text = clean(raw);
  if (!text || text.startsWith("unavailable:")) return null;
  return text.split(/\s+/)[0] || null;
}

function clean(value = "") {
  return String(value).trim();
}

function unavailable(error) {
  return `unavailable: ${error.message}`;
}

async function main() {
  const args = parseBuilderSessionArgs();
  const report = await buildBuilderSessionReport();
  process.stdout.write(args.json ? `${JSON.stringify(report, null, 2)}\n` : formatBuilderSessionText(report));
}

if (path.basename(process.argv[1] ?? "") === "vnem-builder-session.mjs") {
  await main();
}
