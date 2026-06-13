#!/usr/bin/env node
import { execFile as execFileCallback } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

export const CHANGES_BY_ARD_DISPLAY_NAME = "Changes by ARD";
export const CHANGES_BY_ARD_BRANCH = "changes-by-ard";
export const CHANGES_BY_ARD_CONFIRMATION = "I understand ARD will push changes to the Changes by ARD branch, not main.";

const baseBranch = "main";
const artifactRoot = "discovery/ard-changes";
const unsafeTextPattern = /(BEGIN [A-Z ]*PRIVATE KEY|OPENROUTER_API_KEY|api[_-]?key\s*[:=]|secret\s*[:=]|token\s*[:=]|password\s*[:=]|curl\b[\s\S]{0,120}\|\s*(?:sh|bash)|\bnpm\s+install\b|\bpnpm\s+add\b|\byarn\s+add\b|\beval\s*\(|\bFunction\s*\()/i;

let latestPreview = null;
let latestPrepared = null;
let latestPushed = null;

export function validateChangesByArdBranch(branchName = CHANGES_BY_ARD_BRANCH) {
  const value = String(branchName ?? "").trim();
  const violations = [];
  if (value !== CHANGES_BY_ARD_BRANCH) violations.push(`Git branch must be ${CHANGES_BY_ARD_BRANCH}.`);
  if (value === baseBranch) violations.push("Changes by ARD must never target main.");
  if (!/^[a-z0-9][a-z0-9-]{1,80}$/.test(value)) violations.push("Branch name must be a slug-safe git branch without spaces.");
  if (/[~^:?*[\\\s]|\.\.|\.$|\/$|@\{/.test(value)) violations.push("Branch name contains a git-ref unsafe sequence.");
  return {
    ok: violations.length === 0,
    branchName: value,
    displayName: CHANGES_BY_ARD_DISPLAY_NAME,
    violations
  };
}

export async function getArdChangesStatus(options = {}) {
  const repositoryRoot = path.resolve(options.repositoryRoot ?? process.cwd());
  const gitRunner = options.gitRunner ?? runGit;
  const branchValidation = validateChangesByArdBranch(CHANGES_BY_ARD_BRANCH);
  let currentBranch = null;
  let worktreeClean = null;
  try {
    currentBranch = (await gitRunner(["branch", "--show-current"], { cwd: repositoryRoot })).trim() || null;
    worktreeClean = !(await gitRunner(["status", "--short"], { cwd: repositoryRoot })).trim();
  } catch {
    // Status should still be renderable if git is unavailable; operations will reject later.
  }
  return {
    ok: true,
    displayName: CHANGES_BY_ARD_DISPLAY_NAME,
    branchName: CHANGES_BY_ARD_BRANCH,
    branchValid: branchValidation.ok,
    branchValidation,
    mainProtected: true,
    lastPreview: latestPreview,
    lastPrepared: latestPrepared,
    lastPushed: latestPushed,
    needsConfirmation: true,
    requiredConfirmation: CHANGES_BY_ARD_CONFIRMATION,
    mode: latestPushed ? "pushed branch" : latestPrepared ? "local commit" : latestPreview ? "dry-run" : "dry-run",
    currentBranch,
    worktreeClean
  };
}

export async function previewArdChanges(payload = {}, options = {}) {
  const repositoryRoot = path.resolve(options.repositoryRoot ?? process.cwd());
  const gitRunner = options.gitRunner ?? runGit;
  const now = options.now ?? new Date().toISOString();
  const plan = buildPlan(payload, now);
  const branchValidation = validateChangesByArdBranch(plan.branchName);
  if (!branchValidation.ok) return failure("ARD_CHANGES_INVALID_BRANCH", branchValidation.violations[0], plan, { mode: "dry-run", branchValidation });
  const repoState = await readRepoState(gitRunner, repositoryRoot).catch((error) => ({ ok: false, error }));
  if (!repoState.ok) return failure("ARD_CHANGES_GIT_UNAVAILABLE", safeErrorMessage(repoState.error), plan, { mode: "dry-run" });
  if (repoState.currentBranch !== baseBranch) return failure("ARD_CHANGES_NOT_ON_MAIN", `Current branch must be main. Found: ${repoState.currentBranch || "unknown"}.`, plan, { mode: "dry-run" });
  if (!repoState.worktreeClean) return failure("ARD_CHANGES_DIRTY_WORKTREE", "Worktree must be clean before previewing Changes by ARD.", plan, { mode: "dry-run", worktreeStatus: repoState.worktreeStatus });

  latestPreview = {
    ...plan,
    ok: true,
    mode: "dry-run",
    branchValid: true,
    mainProtected: true,
    wouldCommit: false,
    wouldPush: false,
    baseCommit: repoState.head,
    nextAction: "Review the dry-run plan, then prepare a local Changes by ARD branch commit if it is still safe."
  };
  return latestPreview;
}

export async function prepareArdChanges(payload = {}, options = {}) {
  const repositoryRoot = path.resolve(options.repositoryRoot ?? process.cwd());
  const gitRunner = options.gitRunner ?? runGit;
  const now = options.now ?? new Date().toISOString();
  const preview = await previewArdChanges(payload, { ...options, repositoryRoot, gitRunner, now });
  if (!preview.ok) return { ...preview, mode: "local commit" };
  const files = artifactFiles(preview.runId);
  const summary = buildSummary(preview, now, "local commit");
  const changesMarkdown = buildChangesMarkdown(preview, summary);
  const latest = { ...summary, latest: true };

  for (const [relative, content] of [
    [files.summary, `${JSON.stringify(summary, null, 2)}\n`],
    [files.changes, changesMarkdown],
    [files.latest, `${JSON.stringify(latest, null, 2)}\n`]
  ]) {
    if (unsafeTextPattern.test(content)) {
      return failure("ARD_CHANGES_UNSAFE_ARTIFACT", "Generated artifact contained secret-like or unsafe execution text and was not written.", preview, { mode: "local commit" });
    }
  }

  try {
    await gitRunner(["checkout", "-B", CHANGES_BY_ARD_BRANCH, baseBranch], { cwd: repositoryRoot });
    for (const [relative, content] of [
      [files.summary, `${JSON.stringify(summary, null, 2)}\n`],
      [files.changes, changesMarkdown],
      [files.latest, `${JSON.stringify(latest, null, 2)}\n`]
    ]) {
      const absolute = path.join(repositoryRoot, relative);
      await mkdir(path.dirname(absolute), { recursive: true });
      await writeFile(absolute, content, "utf8");
    }
    await gitRunner(["add", ...preview.changedFiles], { cwd: repositoryRoot });
    await gitRunner(["commit", "-m", `chore(ard): prepare ${preview.runId}`], { cwd: repositoryRoot });
    const commitHash = (await gitRunner(["rev-parse", "HEAD"], { cwd: repositoryRoot })).trim();
    latestPrepared = {
      ...preview,
      mode: "local commit",
      commitHash,
      branchStatus: "committed",
      pushStatus: "not-pushed",
      reviewStatus: "waiting-for-manual-review",
      nextAction: "Review the local changes-by-ard branch. Push requires exact confirmation and still does not touch main."
    };
    return latestPrepared;
  } catch (error) {
    return failure("ARD_CHANGES_PREPARE_FAILED", safeErrorMessage(error), preview, { mode: "local commit" });
  } finally {
    await gitRunner(["checkout", baseBranch], { cwd: repositoryRoot }).catch?.(() => null);
  }
}

export async function pushArdChanges(payload = {}, options = {}) {
  if (payload.confirmation !== CHANGES_BY_ARD_CONFIRMATION) {
    return {
      ok: false,
      mode: "push",
      displayName: CHANGES_BY_ARD_DISPLAY_NAME,
      branchName: CHANGES_BY_ARD_BRANCH,
      mainProtected: true,
      error: "confirmation-required",
      error_code: "ARD_CHANGES_CONFIRMATION_REQUIRED",
      message: "Push requires exact confirmation so ARD cannot push a review branch accidentally.",
      requiredConfirmation: CHANGES_BY_ARD_CONFIRMATION,
      pushStatus: "not-pushed"
    };
  }
  const repositoryRoot = path.resolve(options.repositoryRoot ?? process.cwd());
  const gitRunner = options.gitRunner ?? runGit;
  const now = options.now ?? new Date().toISOString();
  const branchValidation = validateChangesByArdBranch(CHANGES_BY_ARD_BRANCH);
  if (!branchValidation.ok) return failure("ARD_CHANGES_INVALID_BRANCH", branchValidation.violations[0], { runId: "push" }, { mode: "push", branchValidation });
  const repoState = await readRepoState(gitRunner, repositoryRoot).catch((error) => ({ ok: false, error }));
  if (!repoState.ok) return failure("ARD_CHANGES_GIT_UNAVAILABLE", safeErrorMessage(repoState.error), { runId: "push" }, { mode: "push" });
  if (!repoState.worktreeClean) return failure("ARD_CHANGES_DIRTY_WORKTREE", "Worktree must be clean before pushing Changes by ARD.", { runId: "push" }, { mode: "push", worktreeStatus: repoState.worktreeStatus });
  try {
    const commitHash = (await gitRunner(["rev-parse", CHANGES_BY_ARD_BRANCH], { cwd: repositoryRoot })).trim();
    await gitRunner(["push", "-u", "origin", CHANGES_BY_ARD_BRANCH], { cwd: repositoryRoot });
    await gitRunner(["checkout", baseBranch], { cwd: repositoryRoot });
    latestPushed = {
      ok: true,
      mode: "pushed branch",
      displayName: CHANGES_BY_ARD_DISPLAY_NAME,
      branchName: CHANGES_BY_ARD_BRANCH,
      branchValid: true,
      mainProtected: true,
      commitHash,
      pushedAt: now,
      pushStatus: "pushed",
      remote: `origin ${CHANGES_BY_ARD_BRANCH}`,
      reviewStatus: "manual-review-required",
      nextAction: "Review the pushed Changes by ARD branch before any separate manual merge. Main was not pushed by ARD."
    };
    return latestPushed;
  } catch (error) {
    return failure("ARD_CHANGES_PUSH_FAILED", safeErrorMessage(error), { runId: "push" }, { mode: "push" });
  } finally {
    await gitRunner(["checkout", baseBranch], { cwd: repositoryRoot }).catch?.(() => null);
  }
}

function buildPlan(payload, now) {
  const runId = normalizeRunId(payload.runId ?? payload.run_id ?? payload.id ?? `ard-change-${now}`);
  const files = artifactFiles(runId);
  const title = sanitizeText(payload.title ?? payload.mission ?? "Changes by ARD v1: safe repo-owned branch commit proof", 160);
  return {
    ok: true,
    displayName: CHANGES_BY_ARD_DISPLAY_NAME,
    branchName: CHANGES_BY_ARD_BRANCH,
    branchValid: true,
    mainProtected: true,
    runId,
    title,
    generatedAt: now,
    source: "repo-owned deterministic improvement artifact",
    allowedSources: [
      "repo-owned deterministic improvement artifact",
      "approved/staged .vnem dispatch already inside repo",
      "safe local template generated by this repo",
      "docs/test/config updates generated locally"
    ],
    forbiddenActions: [
      "execute discovered repositories",
      "install candidate packages",
      "copy external code without license review",
      "modify secrets",
      "weaken auth",
      "delete unrelated files",
      "push main",
      "auto-merge"
    ],
    changedFiles: [files.summary, files.changes, files.latest],
    artifactDirectory: `${artifactRoot}/${runId}`,
    needsConfirmation: true,
    requiredConfirmation: CHANGES_BY_ARD_CONFIRMATION
  };
}

function artifactFiles(runId) {
  return {
    summary: `${artifactRoot}/${runId}/summary.json`,
    changes: `${artifactRoot}/${runId}/changes.md`,
    latest: `${artifactRoot}/latest.json`
  };
}

function buildSummary(plan, now, mode) {
  return {
    schema: "vnem.ardChanges.v1",
    generatedAt: now,
    displayName: CHANGES_BY_ARD_DISPLAY_NAME,
    branchName: CHANGES_BY_ARD_BRANCH,
    runId: plan.runId,
    title: plan.title,
    mode,
    mainProtected: true,
    pushStatus: "not-pushed",
    mergeStatus: "not-merged",
    allowedSources: plan.allowedSources,
    forbiddenActions: plan.forbiddenActions,
    changedFiles: plan.changedFiles,
    reviewRequired: true,
    confirmationRequired: true
  };
}

function buildChangesMarkdown(plan, summary) {
  return [
    "# Changes by ARD v1",
    "",
    `Display name: ${CHANGES_BY_ARD_DISPLAY_NAME}`,
    `Git branch: ${CHANGES_BY_ARD_BRANCH}`,
    "Main protected: yes",
    "",
    "This is a safe repo-owned branch commit proof. It does not execute discovered repositories, install candidate packages, copy external code, weaken auth, push main, or auto-merge.",
    "",
    "## Artifact",
    "",
    `- Run id: ${plan.runId}`,
    `- Title: ${plan.title}`,
    `- Mode: ${summary.mode}`,
    "- Review before merging.",
    ""
  ].join("\n");
}

async function readRepoState(gitRunner, repositoryRoot) {
  const currentBranch = (await gitRunner(["branch", "--show-current"], { cwd: repositoryRoot })).trim();
  const status = (await gitRunner(["status", "--short"], { cwd: repositoryRoot })).trim();
  let head = null;
  try {
    head = (await gitRunner(["rev-parse", "HEAD"], { cwd: repositoryRoot })).trim();
  } catch {
    head = null;
  }
  return {
    ok: true,
    currentBranch,
    worktreeStatus: status ? status.split(/\r?\n/) : [],
    worktreeClean: !status,
    head
  };
}

function failure(errorCode, message, plan, extra = {}) {
  return {
    ok: false,
    displayName: CHANGES_BY_ARD_DISPLAY_NAME,
    branchName: CHANGES_BY_ARD_BRANCH,
    branchValid: validateChangesByArdBranch(CHANGES_BY_ARD_BRANCH).ok,
    mainProtected: true,
    runId: plan?.runId ?? null,
    error: "ard-changes-rejected",
    error_code: errorCode,
    message,
    pushStatus: "not-pushed",
    ...extra
  };
}

function normalizeRunId(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, 80) || "ard-change";
}

function sanitizeText(value, maxLength) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

async function runGit(args, options) {
  const result = await execFile("git", args, { cwd: options.cwd, windowsHide: true, maxBuffer: 1024 * 1024 });
  return `${result.stdout ?? ""}${result.stderr ?? ""}`;
}

function safeErrorMessage(error) {
  return String(error?.message ?? error ?? "Changes by ARD operation failed").replace(/(Bearer\s+)[^\s]+/gi, "$1[REDACTED]").slice(0, 600);
}
