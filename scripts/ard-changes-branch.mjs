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
  if (!repoState.worktreeClean) {
    const worktreeDiagnostics = repoState.worktreeDiagnostics ?? classifyWorktreeStatus(repoState.worktreeStatus);
    return failure("ARD_CHANGES_DIRTY_WORKTREE", dirtyWorktreeMessage(worktreeDiagnostics, "preview"), plan, { mode: "dry-run", worktreeStatus: repoState.worktreeStatus, worktreeDiagnostics });
  }

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
    for (const relative of preview.workPackageGeneratedFiles ?? []) {
      const absolute = path.join(repositoryRoot, relative);
      const content = buildWorkPackageGeneratedFile(preview, summary, relative);
      if (unsafeTextPattern.test(content)) {
        return failure("ARD_CHANGES_UNSAFE_WORK_PACKAGE_TEXT", "Generated work package text contained secret-like or unsafe execution text and was not written.", preview, { mode: "local commit" });
      }
      await mkdir(path.dirname(absolute), { recursive: true });
      await writeFile(absolute, content, "utf8");
    }
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
  if (!repoState.worktreeClean) {
    const worktreeDiagnostics = repoState.worktreeDiagnostics ?? classifyWorktreeStatus(repoState.worktreeStatus);
    return failure("ARD_CHANGES_DIRTY_WORKTREE", dirtyWorktreeMessage(worktreeDiagnostics, "push"), { runId: "push" }, { mode: "push", worktreeStatus: repoState.worktreeStatus, worktreeDiagnostics });
  }
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
  const workPackage = normalizeWorkPackage(payload.workPackage ?? payload.work_package ?? null);
  const workPackageFiles = safeGeneratedWorkPackageFiles(workPackage);
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
    source: workPackage ? "repo-owned ARD work package" : "repo-owned deterministic improvement artifact",
    workPackage,
    selectedWorkPackage: workPackage,
    exactFiles: workPackage?.filesToChange ?? [],
    testsToRun: workPackage?.testsToRun ?? [],
    blockedReason: workPackage?.blockedReasons?.length ? workPackage.blockedReasons.join("; ") : null,
    whySafe: workPackage?.riskNotes ?? ["Repo-owned deterministic improvement artifact; no external package install or discovered repo execution."],
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
    changedFiles: [...workPackageFiles, files.summary, files.changes, files.latest],
    workPackageGeneratedFiles: workPackageFiles,
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
    selectedWorkPackage: plan.selectedWorkPackage,
    exactFiles: plan.exactFiles,
    testsToRun: plan.testsToRun,
    whySafe: plan.whySafe,
    blockedReason: plan.blockedReason,
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
    `- Selected work package: ${plan.selectedWorkPackage?.workPackageId ?? "none"}`,
    `- Exact files: ${(plan.exactFiles ?? []).join(", ") || "artifact-only"}`,
    `- Tests to run: ${(plan.testsToRun ?? []).join(", ") || "review artifact only"}`,
    "- Review before merging.",
    "",
    "## Why this is safe",
    "",
    ...((plan.whySafe ?? []).map((item) => `- ${item}`)),
    ""
  ].join("\n");
}

function normalizeWorkPackage(workPackage) {
  if (!workPackage || typeof workPackage !== "object") return null;
  return {
    workPackageId: sanitizeText(workPackage.workPackageId ?? workPackage.id ?? "ard-work-package", 120),
    title: sanitizeText(workPackage.title ?? "ARD work package", 180),
    candidateId: sanitizeText(workPackage.candidateId ?? "unknown-candidate", 120),
    safeAction: sanitizeText(workPackage.safeAction ?? "review-only", 80),
    whyThisImprovesVNEM: sanitizeText(workPackage.whyThisImprovesVNEM ?? "Improves VNEM through repo-owned evidence.", 400),
    filesToChange: sanitizeStringArray(workPackage.filesToChange).filter(isSafeRelativePath).slice(0, 12),
    changeType: sanitizeText(workPackage.changeType ?? "repo-owned improvement", 120),
    expectedDiffSummary: sanitizeText(workPackage.expectedDiffSummary ?? "Prepare repo-owned ARD work package evidence.", 400),
    testsToRun: sanitizeStringArray(workPackage.testsToRun).slice(0, 12),
    userVisibleResult: sanitizeText(workPackage.userVisibleResult ?? "Operator can review a concrete ARD work package.", 300),
    rollbackNotes: sanitizeStringArray(workPackage.rollbackNotes).slice(0, 8),
    riskNotes: sanitizeStringArray(workPackage.riskNotes).slice(0, 8),
    blockedReasons: sanitizeStringArray(workPackage.blockedReasons).slice(0, 8)
  };
}

function safeGeneratedWorkPackageFiles(workPackage) {
  if (!workPackage || workPackage.blockedReasons?.length) return [];
  return workPackage.filesToChange.filter((file) => file === "docs/ARD_DOGFOOD_STATUS.md" || file.startsWith("docs/ard-reviews/") || file.startsWith("discovery/ard-changes/"));
}

function buildWorkPackageGeneratedFile(preview, summary, relative) {
  const workPackage = preview.selectedWorkPackage;
  const title = relative.startsWith("docs/ard-reviews/") ? "# ARD Review Artifact" : "# ARD Dogfood Status";
  return [
    title,
    "",
    `Generated by: ${CHANGES_BY_ARD_DISPLAY_NAME}`,
    `Branch: ${CHANGES_BY_ARD_BRANCH}`,
    `Run: ${preview.runId}`,
    `Work package: ${workPackage?.workPackageId ?? "unknown"}`,
    `Title: ${workPackage?.title ?? preview.title}`,
    `Safe action: ${workPackage?.safeAction ?? "review-only"}`,
    `Change type: ${workPackage?.changeType ?? "repo-owned evidence"}`,
    "",
    "## Why this improves VNEM",
    "",
    workPackage?.whyThisImprovesVNEM ?? "Records ARD dogfood proof for maintainer review.",
    "",
    "## Exact files requested by the work package",
    "",
    ...((preview.exactFiles ?? []).length ? preview.exactFiles.map((file) => `- ${file}`) : ["- artifact-only"]),
    "",
    "## Tests to run before review",
    "",
    ...((preview.testsToRun ?? []).length ? preview.testsToRun.map((command) => `- ${command}`) : ["- npm run test:current"]),
    "",
    "## Safety",
    "",
    "- Main remains protected.",
    "- No auto-merge is performed.",
    "- No external candidate package is installed.",
    "- No discovered repository code is executed.",
    "- Dangerous findings remain report-only.",
    "",
    `Artifact summary: ${summary.runId}`,
    `Generated file: ${relative}`,
    ""
  ].join("\n");
}

function sanitizeStringArray(values) {
  return Array.isArray(values) ? values.map((value) => sanitizeText(value, 240)).filter(Boolean) : [];
}

function isSafeRelativePath(value) {
  const text = String(value ?? "");
  return Boolean(text && !path.isAbsolute(text) && !text.includes("..") && !/[\\\u0000-\u001f]/.test(text));
}


export function classifyWorktreeStatus(statusLines = []) {
  const lines = Array.isArray(statusLines) ? statusLines : String(statusLines ?? "").split(/\r?\n/);
  const dirtyFiles = lines
    .map(parseStatusLine)
    .filter(Boolean)
    .map((entry) => ({
      ...entry,
      type: classifyDirtyPath(entry.path),
      blockingLevel: classifyDirtyPath(entry.path) === "runtime" ? "safe-runtime-cleanup" : "blocks-prepare",
      recommendedFix: classifyDirtyPath(entry.path) === "runtime" ? "Safe runtime cleanup can remove or restore this ARD runtime artifact." : "Review, commit, or deliberately revert this non-runtime file before preparing Changes by ARD."
    }));
  const dirtySummary = {
    runtime: dirtyFiles.filter((file) => file.type === "runtime").map((file) => file.path),
    source: dirtyFiles.filter((file) => file.type === "source").map((file) => file.path),
    docs: dirtyFiles.filter((file) => file.type === "docs").map((file) => file.path),
    test: dirtyFiles.filter((file) => file.type === "test").map((file) => file.path),
    generated: dirtyFiles.filter((file) => file.type === "generated").map((file) => file.path),
    package: dirtyFiles.filter((file) => file.type === "package").map((file) => file.path),
    unknown: dirtyFiles.filter((file) => file.type === "unknown").map((file) => file.path)
  };
  const blockingFiles = dirtyFiles.filter((file) => file.type !== "runtime");
  const runtimeFiles = dirtyFiles.filter((file) => file.type === "runtime");
  const safeRuntimeCleanupCommands = runtimeFiles.length ? [
    "rm -rf discovery/ard-runs/ard-dogfood-* discovery/ard-runs/ard-browser-run-* discovery/ard-runs/ard-visual-* discovery/ard-runs/ard-test-*",
    "rm -f discovery/ard-memory/candidate-memory.json discovery/reviews/*.json",
    "git restore -- discovery/ard-runs/latest.json discovery/daily-digest.md"
  ] : [];
  const recommendedFix = dirtyFiles.length === 0
    ? "Worktree is clean."
    : blockingFiles.length && runtimeFiles.length
      ? "Run safe runtime cleanup for ARD runtime artifacts, then review source/docs/test/generated/package dirty files before prepare."
      : blockingFiles.length
        ? "Review, commit, or deliberately revert the listed non-runtime dirty files before prepare."
        : "Only known ARD runtime artifacts are dirty; safe runtime cleanup is available.";
  return {
    worktreeClean: dirtyFiles.length === 0,
    dirtyFiles,
    dirtySummary,
    dirtyFileTypes: [...new Set(dirtyFiles.map((file) => file.type))],
    safeRuntimeCleanupAvailable: runtimeFiles.length > 0,
    safeRuntimeCleanupCommands,
    blocksPrepare: blockingFiles.length > 0,
    blockingReason: blockingFiles.length ? "Non-runtime dirty files require user review before prepare." : runtimeFiles.length ? "Only runtime artifacts are dirty." : null,
    recommendedFix
  };
}

function parseStatusLine(line) {
  const text = String(line ?? "").trimEnd();
  if (!text.trim()) return null;
  const status = text.slice(0, 2).trim() || "changed";
  let file = text.slice(3).trim();
  if (file.includes(" -> ")) file = file.split(" -> ").pop().trim();
  return { status, path: file.replace(/^"|"$/g, "") };
}

function classifyDirtyPath(filePath) {
  const value = String(filePath ?? "").replace(/\\/g, "/");
  if (/^discovery\/ard-runs\/(ard-dogfood-|ard-browser-run-|ard-visual-|ard-test-)/.test(value)) return "runtime";
  if (value === "discovery/ard-memory/candidate-memory.json") return "runtime";
  if (/^discovery\/reviews\/[^/]+\.json$/.test(value)) return "runtime";
  if (value === "discovery/ard-runs/latest.json" || value === "discovery/daily-digest.md") return "runtime";
  if (/^(scripts|dashboard\/src|landing\/functions)\//.test(value)) return "source";
  if (/^docs\//.test(value) || value === "README.md" || value === "PRODUCT.md" || value === "AGENTS.md") return "docs";
  if (/test|__tests__/.test(value)) return "test";
  if (/^(public|\.vnem|llms-full\.txt|landing\/dashboard)\//.test(value) || value === "public/install.tgz" || value === "public/api/index.json") return "generated";
  if (/^(package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/.test(value)) return "package";
  return "unknown";
}

function dirtyWorktreeMessage(diagnostics, action) {
  const dirty = diagnostics?.dirtyFiles ?? [];
  if (!dirty.length) return "Worktree is clean.";
  const files = dirty.slice(0, 8).map((file) => `${file.path} (${file.type})`).join("; ");
  const more = dirty.length > 8 ? `; +${dirty.length - 8} more` : "";
  return `Cannot ${action} Changes by ARD because the worktree is dirty: ${files}${more}. ${diagnostics.recommendedFix}`;
}

async function readRepoState(gitRunner, repositoryRoot) {
  const currentBranch = (await gitRunner(["branch", "--show-current"], { cwd: repositoryRoot })).trim();
  const status = (await gitRunner(["status", "--short"], { cwd: repositoryRoot })).replace(/\s+$/, "");
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
