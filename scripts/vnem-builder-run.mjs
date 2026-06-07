#!/usr/bin/env node
import { access, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { refreshRunHistoryIndex } from "./vnem-run-history.mjs";
import { inspectVnemDevHealth } from "./vnem-dev-health.mjs";

const execFileAsync = promisify(execFile);

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultRootDir = path.resolve(scriptDir, "..");

export const builderRunStatuses = new Set([
  "started",
  "inspecting",
  "editing",
  "validating",
  "visual-checking",
  "ready-to-commit",
  "committed",
  "pushed",
  "blocked",
  "failed",
  "interrupted",
  "recovered"
]);

export function builderRunPaths({ rootDir = defaultRootDir } = {}) {
  const resolvedRoot = path.resolve(rootDir);
  const historyDir = path.join(resolvedRoot, "discovery", "run-history");
  return {
    rootDir: resolvedRoot,
    historyDir,
    activeRunPath: path.join(historyDir, "active-run.json"),
    indexPath: path.join(historyDir, "index.json")
  };
}

export function parseBuilderRunArgs(argv = process.argv.slice(2)) {
  const [command = "latest", ...rest] = argv;
  if (!["start", "update", "finish", "recover", "latest"].includes(command)) throw new Error(`unknown builder-run command: ${command}`);
  const args = { command };
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    args[key] = rest[index + 1] && !rest[index + 1].startsWith("--") ? rest[++index] : true;
  }
  return args;
}

export async function startBuilderRun(options = {}) {
  const { rootDir = defaultRootDir, force = false, sessionProvider = () => defaultBuilderSession(rootDir), now = () => new Date().toISOString() } = options;
  const title = String(options.title ?? "Untitled VNEM builder run");
  assertSafeTitle(title);
  const paths = builderRunPaths({ rootDir });
  const existing = await readActiveBuilderRun({ rootDir });
  if (existing && !force) throw new Error(`active builder run exists: ${existing.id}. Use --force only after recovery review.`);
  const session = await sessionProvider();
  const timestamp = now();
  const id = options.id ?? `${timestamp.slice(0, 10)}-${slug(title)}-${timestamp.slice(11, 19).replace(/:/g, "")}`;
  assertSafeId(id);
  const record = {
    schema: "vnem.builderRun.v1",
    id,
    title,
    status: "started",
    startedAt: timestamp,
    updatedAt: timestamp,
    finishedAt: null,
    branch: session.branch ?? "unknown",
    startHead: session.localHead ?? null,
    endHead: null,
    originMainAtStart: session.originMainSha ?? null,
    originMainAtEnd: null,
    worktreeAtStart: cloneWorktree(session.worktree),
    worktreeAtEnd: null,
    changedFiles: session.worktree?.changedFiles ?? [],
    untrackedFiles: session.worktree?.untrackedFiles ?? [],
    changedSurfaces: options.changedSurfaces ?? [],
    validationRun: options.validationRun ?? { status: "not-run", commands: [], notes: "Validation has not run yet." },
    generatedArtifacts: options.generatedArtifacts ?? { refreshed: false, status: "not-run", notes: "Generated artifacts not checked yet." },
    visualCheck: options.visualCheck ?? { status: "not-run", notes: "Visual check has not run yet." },
    safetyChecks: options.safetyChecks ?? { status: "not-run", notes: "Diff/safety checks have not run yet." },
    capture: options.capture ?? { schema: "vnem.builderCapture.v1", commands: [], lastCommand: null },
    commit: null,
    pushed: false,
    pushStatus: "not-pushed",
    devHealthStart: session.devHealth ?? null,
    devHealthEnd: null,
    staleOutputNotes: options.staleOutputNotes ?? [],
    remainingLimitations: options.remainingLimitations ?? [],
    nextRecommendedImprovement: options.nextRecommendedImprovement ?? "Complete this builder run with validation, visual check, commit, push, and recovery notes."
  };
  await writeRunRecord({ rootDir, record });
  await writeActivePointer({ rootDir, record });
  await refreshRunHistoryIndex({ rootDir });
  return withFilePath(record, rootDir);
}

export async function updateBuilderRun(options = {}) {
  const { rootDir = defaultRootDir, sessionProvider = () => defaultBuilderSession(rootDir), now = () => new Date().toISOString() } = options;
  const active = options.id ? await readBuilderRunById({ rootDir, id: options.id }) : await readActiveBuilderRun({ rootDir });
  if (!active) throw new Error("no active builder run to update");
  const status = options.status ?? active.status;
  assertStatus(status);
  const session = await sessionProvider();
  const updated = {
    ...active,
    status,
    updatedAt: now(),
    branch: session.branch ?? active.branch,
    endHead: session.localHead ?? active.endHead,
    originMainAtEnd: session.originMainSha ?? active.originMainAtEnd,
    worktreeAtEnd: cloneWorktree(session.worktree),
    changedFiles: session.worktree?.changedFiles ?? active.changedFiles ?? [],
    untrackedFiles: session.worktree?.untrackedFiles ?? active.untrackedFiles ?? [],
    changedSurfaces: options.changedSurfaces ?? active.changedSurfaces ?? [],
    validationRun: options.validationRun ?? active.validationRun,
    generatedArtifacts: options.generatedArtifacts ?? active.generatedArtifacts,
    visualCheck: options.visualCheck ?? active.visualCheck,
    safetyChecks: options.safetyChecks ?? active.safetyChecks,
    capture: options.capture ?? active.capture ?? { schema: "vnem.builderCapture.v1", commands: [], lastCommand: null },
    commit: options.commit ?? active.commit ?? null,
    pushed: options.pushed ?? active.pushed ?? false,
    pushStatus: options.pushStatus ?? active.pushStatus ?? "not-pushed",
    staleOutputNotes: options.staleOutputNotes ?? active.staleOutputNotes ?? [],
    remainingLimitations: options.remainingLimitations ?? active.remainingLimitations ?? [],
    nextRecommendedImprovement: options.nextRecommendedImprovement ?? active.nextRecommendedImprovement,
    devHealthEnd: session.devHealth ?? active.devHealthEnd
  };
  await writeRunRecord({ rootDir, record: updated });
  if (!options.id) await writeActivePointer({ rootDir, record: updated });
  await refreshRunHistoryIndex({ rootDir });
  return withFilePath(updated, rootDir);
}

export async function finishBuilderRun(options = {}) {
  const { rootDir = defaultRootDir, sessionProvider = () => defaultBuilderSession(rootDir), now = () => new Date().toISOString() } = options;
  const active = options.id ? await readBuilderRunById({ rootDir, id: options.id }) : await readActiveBuilderRun({ rootDir });
  if (!active) throw new Error("no active builder run to finish");
  const status = options.status ?? "pushed";
  assertStatus(status);
  const session = await sessionProvider();
  const timestamp = now();
  const finished = {
    ...active,
    status,
    updatedAt: timestamp,
    finishedAt: timestamp,
    branch: session.branch ?? active.branch,
    endHead: session.localHead ?? options.commit ?? active.endHead,
    originMainAtEnd: session.originMainSha ?? active.originMainAtEnd,
    worktreeAtEnd: cloneWorktree(session.worktree),
    changedFiles: session.worktree?.changedFiles ?? active.changedFiles ?? [],
    untrackedFiles: session.worktree?.untrackedFiles ?? active.untrackedFiles ?? [],
    changedSurfaces: options.changedSurfaces ?? active.changedSurfaces ?? [],
    validationRun: options.validationRun ?? active.validationRun,
    generatedArtifacts: options.generatedArtifacts ?? active.generatedArtifacts,
    visualCheck: options.visualCheck ?? active.visualCheck,
    safetyChecks: options.safetyChecks ?? active.safetyChecks,
    capture: options.capture ?? active.capture ?? { schema: "vnem.builderCapture.v1", commands: [], lastCommand: null },
    commit: options.commit ?? active.commit ?? session.localHead ?? null,
    pushed: options.pushed ?? status === "pushed",
    pushStatus: options.pushStatus ?? (options.pushed || status === "pushed" ? "pushed" : "not-pushed"),
    devHealthEnd: session.devHealth ?? active.devHealthEnd,
    staleOutputNotes: options.staleOutputNotes ?? active.staleOutputNotes ?? [],
    remainingLimitations: options.remainingLimitations ?? active.remainingLimitations ?? [],
    nextRecommendedImprovement: options.nextRecommendedImprovement ?? active.nextRecommendedImprovement
  };
  await writeRunRecord({ rootDir, record: finished });
  if (!options.id) await clearActiveBuilderRun({ rootDir });
  await refreshRunHistoryIndex({ rootDir });
  return withFilePath(finished, rootDir);
}

export async function recoverBuilderRun(options = {}) {
  const { rootDir = defaultRootDir, sessionProvider = () => defaultBuilderSession(rootDir) } = options;
  const [active, latest, session] = await Promise.all([readActiveBuilderRun({ rootDir }), latestBuilderRun({ rootDir }), sessionProvider()]);
  const dashboardRunning = (session.devHealth?.ports ?? []).filter((port) => [4174, 4175].includes(Number(port.port)) && port.listening);
  if (active) {
    return {
      state: "active-run-interrupted",
      activeRun: summarizeRun(active),
      latestRun: latest ? summarizeRun(latest) : null,
      session,
      nextAction: recoveryNextAction({ active, session, dashboardRunning })
    };
  }
  if (session.worktree?.clean && session.localMatchesOriginMain) {
    return {
      state: "clean-no-active-run",
      activeRun: null,
      latestRun: latest ? summarizeRun(latest) : null,
      session,
      nextAction: "Worktree clean and HEAD matches origin/main. Next action: safe to start a new run."
    };
  }
  return {
    state: "attention-needed-no-active-run",
    activeRun: null,
    latestRun: latest ? summarizeRun(latest) : null,
    session,
    nextAction: session.nextSafeAction ?? "Review builder session before starting new work."
  };
}

export async function latestBuilderRun({ rootDir = defaultRootDir } = {}) {
  const paths = builderRunPaths({ rootDir });
  try {
    const names = (await readdir(paths.historyDir)).filter((name) => name.endsWith(".json") && !["index.json", "active-run.json"].includes(name)).sort();
    const records = [];
    for (const name of names) records.push(JSON.parse(await readFile(path.join(paths.historyDir, name), "utf8")));
    return records.sort((a, b) => String(a.finishedAt ?? a.updatedAt ?? a.startedAt).localeCompare(String(b.finishedAt ?? b.updatedAt ?? b.startedAt))).at(-1) ?? null;
  } catch {
    return null;
  }
}

export async function readActiveBuilderRun({ rootDir = defaultRootDir } = {}) {
  const paths = builderRunPaths({ rootDir });
  try {
    const pointer = JSON.parse(await readFile(paths.activeRunPath, "utf8"));
    if (!pointer?.id) return null;
    return await readBuilderRunById({ rootDir, id: pointer.id });
  } catch {
    return null;
  }
}

export async function clearActiveBuilderRun({ rootDir = defaultRootDir } = {}) {
  const paths = builderRunPaths({ rootDir });
  await rm(paths.activeRunPath, { force: true });
}

export async function readBuilderRunById({ rootDir, id }) {
  assertSafeId(id);
  const filePath = recordPath({ rootDir, id });
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function writeRunRecord({ rootDir, record }) {
  assertSafeId(record.id);
  const paths = builderRunPaths({ rootDir });
  const filePath = recordPath({ rootDir, id: record.id });
  await mkdir(paths.historyDir, { recursive: true });
  await writeFile(filePath, `${JSON.stringify(record, null, 2)}\n`);
}

async function writeActivePointer({ rootDir, record }) {
  const paths = builderRunPaths({ rootDir });
  await mkdir(paths.historyDir, { recursive: true });
  await writeFile(paths.activeRunPath, `${JSON.stringify({ schema: "vnem.activeBuilderRun.v1", id: record.id, title: record.title, status: record.status, updatedAt: record.updatedAt, path: `${record.id}.json` }, null, 2)}\n`);
}

function recordPath({ rootDir, id }) {
  assertSafeId(id);
  const paths = builderRunPaths({ rootDir });
  const filePath = path.resolve(paths.historyDir, `${id}.json`);
  const base = path.resolve(paths.historyDir);
  if (!filePath.startsWith(base + path.sep)) throw new Error("refusing to write outside run-history directory");
  return filePath;
}

function withFilePath(record, rootDir) {
  return { ...record, filePath: recordPath({ rootDir, id: record.id }) };
}

function summarizeRun(run) {
  return run ? {
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
}

function summarizeCapture(capture) {
  if (!capture) return { commandCount: 0, lastCommand: null, lastFailedCommand: null };
  const commands = capture.commands ?? [];
  const lastFailedCommand = [...commands].reverse().find((command) => command.status === "failed") ?? null;
  return { commandCount: commands.length, lastCommand: capture.lastCommand ?? commands.at(-1) ?? null, lastFailedCommand };
}

function recoveryNextAction({ active, session, dashboardRunning }) {
  const capture = summarizeCapture(active.capture);
  if (capture.lastFailedCommand) return `Validation failed at ${capture.lastFailedCommand.command}. Next action: fix that failure, then rerun builder:validate.`;
  if (active.validationRun?.status === "passed" && active.safetyChecks?.status === "passed" && !active.commit) return "Validation passed and safety passed, but no commit exists. Next action: run builder:commit or commit manually.";
  if (active.commit && !active.pushed) return "Commit exists locally but push is not recorded. Next action: verify remote, then run builder:push or push manually.";
  if (active.pushed && active.pushStatus && String(active.pushStatus).includes("verified")) return "Pushed and remote verified. Next action: finish run if active pointer remains.";
  if (dashboardRunning.length) return `Dashboard dev server still running on ${dashboardRunning.map((port) => port.port).join(", ")}. Next action: run npm run dev:cleanup-dashboard if visual check is done.`;
  if (!active.validationRun || ["not-run", "running"].includes(active.validationRun.status)) return "Active run interrupted before validation. Next action: run builder:validate before commit.";
  if (!session.worktree?.clean) return "Active run has dirty worktree. Next action: inspect diff, run builder:validate and builder:safety, then commit or discard intentionally.";
  return "Active run needs operator review. Next action: finish or mark blocked with explicit notes.";
}

function cloneWorktree(worktree = {}) {
  return { clean: Boolean(worktree.clean), raw: worktree.raw ?? [], changedFiles: worktree.changedFiles ?? [], untrackedFiles: worktree.untrackedFiles ?? [] };
}

function assertSafeTitle(title) {
  if (/[\\/]/.test(title) || title.includes("..")) throw new Error("invalid title: path-like values are not allowed");
}

function assertSafeId(id) {
  if (!/^[a-z0-9][a-z0-9._-]{0,120}$/i.test(String(id))) throw new Error("invalid builder run id");
}

function assertStatus(status) {
  if (!builderRunStatuses.has(status)) throw new Error(`invalid builder run status: ${status}`);
}

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70) || "run";
}

async function defaultBuilderSession(rootDir) {
  const [branch, localHead, originMainSha, statusRaw, devHealth] = await Promise.all([
    runGit(rootDir, ["branch", "--show-current"]),
    runGit(rootDir, ["rev-parse", "HEAD"]),
    runGit(rootDir, ["rev-parse", "origin/main"]),
    runGit(rootDir, ["status", "--short", "--untracked-files=all"]),
    inspectVnemDevHealth({ rootDir })
  ]);
  const worktree = summarizeWorktree(statusRaw);
  return {
    branch: branch.trim(),
    localHead: localHead.trim(),
    originMainSha: originMainSha.trim(),
    localMatchesOriginMain: localHead.trim() === originMainSha.trim(),
    worktree,
    generatedDispatchFiles: worktree.raw.filter((line) => line.includes(".vnem/approved/dispatch-")).map((line) => line.slice(3).trim()),
    devHealth,
    nextSafeAction: worktree.clean ? "Clean start." : "Do not start new feature work. Resolve, validate, commit/push, or explicitly discard the dirty worktree first."
  };
}

async function runGit(rootDir, args) {
  const { stdout } = await execFileAsync("git", args, { cwd: rootDir, windowsHide: true });
  return stdout;
}

function summarizeWorktree(statusRaw) {
  const raw = String(statusRaw ?? "").split(/\r?\n/).filter(Boolean);
  const changedFiles = [];
  const untrackedFiles = [];
  for (const line of raw) {
    const file = line.slice(3).trim();
    if (line.startsWith("??")) untrackedFiles.push(file);
    else changedFiles.push(file);
  }
  return { clean: raw.length === 0, raw, changedFiles, untrackedFiles };
}

function formatRecovery(recovery) {
  const activeLine = recovery.activeRun ? `${recovery.activeRun.title} (${recovery.activeRun.status})` : "none";
  return [`Builder Run Recovery: ${recovery.state}`, `Active run: ${activeLine}`, `Next action: ${recovery.nextAction}`].join("\n") + "\n";
}

function formatRun(run) {
  if (!run) return "No builder runs recorded.\n";
  return [`Builder Run: ${run.title}`, `id: ${run.id}`, `status: ${run.status}`, `started: ${run.startedAt}`, `updated: ${run.updatedAt}`, `finished: ${run.finishedAt ?? "not finished"}`, `commit: ${run.commit ?? "none"}`, `pushed: ${run.pushed ? "yes" : "no"}`, `next: ${run.nextRecommendedImprovement ?? "not recorded"}`].join("\n") + "\n";
}

async function main() {
  const args = parseBuilderRunArgs();
  if (args.command === "start") {
    const record = await startBuilderRun({ title: args.title, force: args.force === true || args.force === "true" });
    process.stdout.write(`${JSON.stringify(record, null, 2)}\n`);
    return;
  }
  if (args.command === "update") {
    const record = await updateBuilderRun({ id: args.id, status: args.status ?? "editing" });
    process.stdout.write(`${JSON.stringify(record, null, 2)}\n`);
    return;
  }
  if (args.command === "finish") {
    const record = await finishBuilderRun({ id: args.id, status: args.status ?? "pushed", commit: args.commit, pushed: args.pushed === true || args.pushed === "true" || args.status === "pushed", pushStatus: args.pushStatus });
    process.stdout.write(`${JSON.stringify(record, null, 2)}\n`);
    return;
  }
  if (args.command === "recover") {
    process.stdout.write(formatRecovery(await recoverBuilderRun()));
    return;
  }
  process.stdout.write(formatRun(await latestBuilderRun()));
}

if (path.basename(process.argv[1] ?? "") === "vnem-builder-run.mjs") {
  await main();
}
