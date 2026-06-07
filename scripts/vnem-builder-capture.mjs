#!/usr/bin/env node
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  finishBuilderRun,
  readActiveBuilderRun,
  updateBuilderRun
} from "./vnem-builder-run.mjs";

const execFileAsync = promisify(execFile);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultRootDir = path.resolve(scriptDir, "..");
const tailLimit = 4000;

export const defaultValidationCommands = [
  "npm run test:dev-health",
  "npm run test:builder-session",
  "npm run test:run-history",
  "npm run test:builder-run",
  "npm run test:builder-capture",
  "npm run test:candidate-pipeline",
  "npm run test:giving-branch",
  "npm run test:dashboard-branch",
  "npm run test:dashboard-work-status",
  "npm run test:dashboard-builder-health",
  "npm run test:dashboard-control-room",
  "npm run test:dashboard-missions",
  "npm run test:dashboard-verdicts",
  "npm run test:dashboard-system",
  "npm run test:dashboard-telemetry",
  "npm run test:dashboard-connector",
  "npm run test:app-server",
  "npm run dashboard:build",
  "npm run dashboard:check",
  "npm run validate",
  "npm run generate",
  "npm run test:install-pack"
].map((command) => ({ label: command, kind: command === "npm run generate" ? "generate" : "validation", command }));

export async function runCapturedCommand(options = {}) {
  const {
    rootDir = defaultRootDir,
    label = "captured command",
    kind = "command",
    command,
    sessionProvider,
    now = () => new Date().toISOString(),
    throwOnFailure = false,
    runner = defaultRunner
  } = options;
  const active = await requireActiveRun(rootDir);
  const commandParts = normalizeCommand(command);
  const startedAt = now();
  const startMs = Date.now();
  const result = await runner(commandParts, { cwd: rootDir });
  const finishedAt = now();
  const captured = {
    label,
    kind,
    command: commandToString(commandParts),
    startedAt,
    finishedAt,
    durationMs: Math.max(0, Date.now() - startMs),
    exitCode: Number(result.exitCode ?? 0),
    status: Number(result.exitCode ?? 0) === 0 ? "passed" : "failed",
    stdoutTail: tail(result.stdout),
    stderrTail: tail(result.stderr)
  };
  await appendCapture({ rootDir, active, captured, sessionProvider });
  if (captured.exitCode !== 0 && throwOnFailure) throw Object.assign(new Error(`captured command failed: ${captured.command}`), { captured });
  return captured;
}

export async function runCapturedValidation(options = {}) {
  const { rootDir = defaultRootDir, commands = defaultValidationCommands, continueOnFailure = false, sessionProvider, now } = options;
  await requireActiveRun(rootDir);
  await updateBuilderRun({ rootDir, status: "validating", validationRun: { status: "running", commands: commands.map((item) => commandToString(normalizeCommand(item.command))), commandCount: commands.length, notes: "Captured validation ladder running." }, sessionProvider });
  const results = [];
  for (const item of commands) {
    const captured = await runCapturedCommand({ rootDir, label: item.label, kind: item.kind ?? "validation", command: item.command, sessionProvider, now, runner: item.runner, throwOnFailure: false });
    results.push(captured);
    if (captured.exitCode !== 0 && !continueOnFailure) break;
  }
  const failed = results.find((item) => item.exitCode !== 0);
  const active = await readActiveBuilderRun({ rootDir });
  const validationRun = {
    status: failed ? "failed" : "passed",
    commandCount: results.length,
    commands: results.map((item) => item.command),
    failedCommand: failed ? failed.command : null,
    notes: failed ? `Validation failed at ${failed.command}.` : "Captured validation ladder passed."
  };
  const generatedArtifacts = results.some((item) => item.kind === "generate" && item.status === "passed")
    ? { ...(active.generatedArtifacts ?? {}), refreshed: true, status: "passed", command: "npm run generate", notes: "Generated artifacts refreshed by captured validation." }
    : active.generatedArtifacts;
  await updateBuilderRun({ rootDir, status: failed ? "failed" : "ready-to-commit", validationRun, generatedArtifacts, sessionProvider });
  return { status: validationRun.status, commandCount: results.length, failedCommand: failed?.command ?? null, commands: results };
}

export async function runCapturedSafety(options = {}) {
  const { rootDir = defaultRootDir, sessionProvider, now, runner = defaultShellRunner } = options;
  await requireActiveRun(rootDir);
  await updateBuilderRun({ rootDir, status: "validating", sessionProvider });
  const checks = [
    { label: "git status", command: "git status --short --untracked-files=all" },
    { label: "git diff stat", command: "git diff --stat" },
    { label: "git diff names", command: "git diff --name-only" },
    { label: "git diff check", command: "git diff --check" },
    { label: "safety grep", command: "git grep -n -i -E \"100% safe|fully safe|guaranteed safe|auto-merge|push origin main|merge main|npm install|curl .*\\| sh|eval\\(\" -- dashboard/src docs scripts package.json .vnem public/install llms-full.txt || true" }
  ];
  const outputs = [];
  for (const check of checks) {
    const result = await runner(check.command, { cwd: rootDir });
    outputs.push({ ...check, exitCode: Number(result.exitCode ?? 0), stdout: result.stdout ?? "", stderr: result.stderr ?? "" });
  }
  const diffCheck = outputs.find((item) => item.label === "git diff check");
  const grep = outputs.find((item) => item.label === "safety grep");
  const grepLines = String(grep?.stdout ?? "").split(/\r?\n/).filter(Boolean);
  const diffCheckPassed = diffCheck?.exitCode === 0;
  const safetyChecks = {
    status: diffCheckPassed ? "passed" : "failed",
    checkedAt: now ? now() : new Date().toISOString(),
    diffCheckPassed,
    grepHitsCount: grepLines.length,
    grepSummary: summarizeGrep(grepLines),
    statusOutputTail: tail(outputs.find((item) => item.label === "git status")?.stdout),
    diffStatTail: tail(outputs.find((item) => item.label === "git diff stat")?.stdout),
    changedFiles: String(outputs.find((item) => item.label === "git diff names")?.stdout ?? "").split(/\r?\n/).filter(Boolean),
    notes: diffCheckPassed ? "Safety capture passed diff check; grep hits still require human interpretation." : "Safety capture failed git diff --check."
  };
  const active = await readActiveBuilderRun({ rootDir });
  const capture = appendSyntheticCapture(active.capture, { label: "safety checks", kind: "safety", command: "builder:safety", status: safetyChecks.status, exitCode: diffCheckPassed ? 0 : 1, stdoutTail: safetyChecks.grepSummary, stderrTail: "", startedAt: safetyChecks.checkedAt, finishedAt: safetyChecks.checkedAt, durationMs: 0 });
  await updateBuilderRun({ rootDir, status: diffCheckPassed ? active.status : "failed", safetyChecks, capture, sessionProvider });
  return safetyChecks;
}

export async function commitCapturedBuilderRun(options = {}) {
  const { rootDir = defaultRootDir, message, sessionProvider } = options;
  if (!message) throw new Error("commit message required");
  const active = await requireActiveRun(rootDir);
  if (active.validationRun?.status !== "passed") throw new Error("builder:commit requires validation status passed");
  if (active.safetyChecks?.status !== "passed") throw new Error("builder:commit requires safety check passed");
  await execFileAsync("git", ["add", "."], { cwd: rootDir, windowsHide: true });
  await execFileAsync("git", ["commit", "-m", message], { cwd: rootDir, windowsHide: true, maxBuffer: 1024 * 1024 * 10 });
  const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: rootDir, windowsHide: true });
  const commit = stdout.trim();
  const capture = appendSyntheticCapture(active.capture, { label: "git commit", kind: "commit", command: `git commit -m ${JSON.stringify(message)}`, status: "passed", exitCode: 0, stdoutTail: commit, stderrTail: "", startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), durationMs: 0 });
  await updateBuilderRun({ rootDir, status: "committed", commit, pushed: false, pushStatus: "not-pushed", capture, sessionProvider });
  return { commit, status: "committed" };
}

export async function pushCapturedBuilderRun(options = {}) {
  const { rootDir = defaultRootDir, sessionProvider, dryRun = false } = options;
  const active = await requireActiveRun(rootDir);
  if (!active.commit) throw new Error("builder:push requires a recorded commit SHA");
  if (dryRun) {
    await updateBuilderRun({ rootDir, status: "committed", pushStatus: "dry-run", pushed: false, sessionProvider });
    return { pushStatus: "dry-run", pushed: false };
  }
  const branch = (await execFileAsync("git", ["branch", "--show-current"], { cwd: rootDir, windowsHide: true })).stdout.trim();
  await execFileAsync("git", ["push", "origin", branch], { cwd: rootDir, windowsHide: true, maxBuffer: 1024 * 1024 * 10 });
  const remoteRef = branch === "main" ? "refs/heads/main" : `refs/heads/${branch}`;
  const remoteOut = await execFileAsync("git", ["ls-remote", "origin", remoteRef], { cwd: rootDir, windowsHide: true });
  const remoteSha = remoteOut.stdout.trim().split(/\s+/)[0] ?? null;
  const finished = await finishBuilderRun({ rootDir, status: "pushed", commit: active.commit, pushed: true, pushStatus: remoteSha === active.commit ? "pushed-verified" : "pushed-unverified", sessionProvider, nextRecommendedImprovement: "Builder Run Auto-Capture v2 is complete. Next useful improvement: richer visual-check capture." });
  return { pushStatus: finished.pushStatus, pushed: true, remoteSha, commit: active.commit };
}

async function appendCapture({ rootDir, active, captured, sessionProvider }) {
  const capture = appendSyntheticCapture(active.capture, captured);
  const validationRun = captured.kind === "validation" || captured.kind === "generate"
    ? { ...(active.validationRun ?? {}), status: captured.status === "passed" ? "running" : "failed", lastCommand: captured.command, failedCommand: captured.status === "failed" ? captured.command : active.validationRun?.failedCommand ?? null }
    : active.validationRun;
  const generatedArtifacts = captured.kind === "generate" && captured.status === "passed"
    ? { ...(active.generatedArtifacts ?? {}), refreshed: true, status: "passed", command: captured.command, notes: "Generated artifacts refreshed by captured command." }
    : active.generatedArtifacts;
  await updateBuilderRun({ rootDir, status: captured.status === "failed" ? "failed" : active.status, capture, validationRun, generatedArtifacts, sessionProvider });
}

function appendSyntheticCapture(capture = {}, captured) {
  const commands = [...(capture.commands ?? []), captured];
  return { schema: "vnem.builderCapture.v1", ...capture, commands, lastCommand: captured, lastCommandStatus: captured.status };
}

async function requireActiveRun(rootDir) {
  const active = await readActiveBuilderRun({ rootDir });
  if (!active) throw new Error("active builder run required for capture commands");
  return active;
}

function normalizeCommand(command) {
  if (Array.isArray(command)) return command.map(String);
  if (typeof command === "string") return process.platform === "win32" ? ["bash", "-lc", command] : ["bash", "-lc", command];
  throw new Error("command required");
}

function commandToString(parts) {
  if (parts[0] === "bash" && parts[1] === "-lc") return parts.slice(2).join(" ");
  return parts.map((part) => /\s/.test(part) ? JSON.stringify(part) : part).join(" ");
}

function defaultRunner(parts, { cwd }) {
  return new Promise((resolve) => {
    const child = spawn(parts[0], parts.slice(1), { cwd, shell: false, windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => { stdout += chunk; process.stdout.write(chunk); });
    child.stderr?.on("data", (chunk) => { stderr += chunk; process.stderr.write(chunk); });
    child.on("error", (error) => resolve({ exitCode: 1, stdout, stderr: `${stderr}${error.message}` }));
    child.on("close", (code) => resolve({ exitCode: code ?? 0, stdout, stderr }));
  });
}

async function defaultShellRunner(command, { cwd }) {
  try {
    const { stdout, stderr } = await execFileAsync("bash", ["-lc", command], { cwd, windowsHide: true, maxBuffer: 1024 * 1024 * 10 });
    return { stdout, stderr, exitCode: 0 };
  } catch (error) {
    return { stdout: error.stdout ?? "", stderr: error.stderr ?? error.message, exitCode: error.code ?? 1 };
  }
}

function tail(value) {
  const text = String(value ?? "");
  return text.length > tailLimit ? text.slice(-tailLimit) : text;
}

function summarizeGrep(lines) {
  if (!lines.length) return "No grep hits.";
  return `${lines.length} grep hit(s). Review required; common contextual matches are docs/tests/install guide warnings.`;
}

function parseCli(argv = process.argv.slice(2)) {
  const json = argv.includes("--json");
  const filtered = argv.filter((arg) => arg !== "--json");
  const [mode = "run", ...rest] = filtered;
  return { mode, rest, json };
}

async function main() {
  const { mode, rest, json } = parseCli();
  let result;
  if (["run", "validation", "generate"].includes(mode)) {
    const delimiter = rest.indexOf("--");
    const before = delimiter >= 0 ? rest.slice(0, delimiter) : [];
    const command = delimiter >= 0 ? rest.slice(delimiter + 1) : rest;
    const labelIndex = before.indexOf("--label");
    const label = labelIndex >= 0 ? before[labelIndex + 1] : command.join(" ");
    result = await runCapturedCommand({ label, kind: mode === "run" ? "command" : mode, command, throwOnFailure: false });
    process.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : `Captured ${result.status}: ${result.command}\n`);
    process.exitCode = result.exitCode;
    return;
  }
  if (mode === "validate") result = await runCapturedValidation({ continueOnFailure: rest.includes("--continue-on-failure") });
  else if (mode === "safety") result = await runCapturedSafety();
  else if (mode === "commit") {
    const idx = rest.indexOf("--message");
    result = await commitCapturedBuilderRun({ message: idx >= 0 ? rest[idx + 1] : null });
  } else if (mode === "push") result = await pushCapturedBuilderRun({ dryRun: rest.includes("--dry-run") });
  else throw new Error(`unknown builder capture command: ${mode}`);
  process.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : `${JSON.stringify(result, null, 2)}\n`);
}

if (path.basename(process.argv[1] ?? "") === "vnem-builder-capture.mjs") {
  try {
    await main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = error.captured?.exitCode || 1;
  }
}
