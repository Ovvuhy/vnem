#!/usr/bin/env node
import { execFile as execFileCallback } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const branchPrefix = "vnem-giving/";
const baseBranch = "main";
const defaultValidationCommands = [
  "npm run test:dashboard-missions",
  "npm run test:dashboard-verdicts",
  "npm run test:dashboard-system",
  "npm run dashboard:build"
];
const requiredChecks = [
  "current branch must be main",
  "worktree must be clean",
  "branch name must start with vnem-giving/",
  "no quarantine or blocked candidates",
  "needs-review candidates require explicit maintainer review",
  "validation must pass before push",
  "manual review is required before main"
];
const unsafeTextPattern = /(BEGIN [A-Z ]*PRIVATE KEY|OPENROUTER_API_KEY|api[_-]?key\s*[:=]|secret\s*[:=]|token\s*[:=]|password\s*[:=]|curl\b[\s\S]{0,120}\|\s*(?:sh|bash)|\bnpm\s+install\b|\bpnpm\s+add\b|\byarn\s+add\b|\beval\s*\(|\bFunction\s*\()/i;

export function previewGivingBranchPlan(payload = {}) {
  const normalized = normalizeBranchPayload(payload);
  const safety = validateBranchPlan(normalized);
  const plan = buildBranchPlan(normalized, safety);
  if (!safety.ok) {
    return {
      ok: false,
      mode: "preview",
      error: "giving-branch-plan-rejected",
      error_code: safety.errorCode,
      message: safety.message,
      violations: safety.violations,
      ...plan
    };
  }
  return {
    ok: true,
    mode: "preview",
    ...plan,
    nextAction: "Approve branch preparation only after reviewing the plan."
  };
}

export async function prepareGivingBranch(payload = {}, options = {}) {
  const preview = previewGivingBranchPlan(payload);
  if (!preview.ok) return preview;
  if (payload.confirm !== "prepare-giving-branch") {
    return {
      ...preview,
      ok: false,
      mode: "prepare",
      error: "confirmation-required",
      error_code: "GIVING_BRANCH_CONFIRMATION_REQUIRED",
      message: "Prepare requires confirm: \"prepare-giving-branch\" so the dashboard cannot trigger branch writes accidentally."
    };
  }

  const repositoryRoot = path.resolve(options.repositoryRoot ?? process.cwd());
  const gitRunner = options.gitRunner ?? runGit;
  const commandRunner = options.commandRunner ?? runShellCommand;
  const now = options.now ?? new Date().toISOString();

  const currentBranch = await gitRunner(["branch", "--show-current"], { cwd: repositoryRoot });
  if (currentBranch.trim() !== baseBranch) {
    return prepareFailure("GIVING_BRANCH_NOT_ON_MAIN", `Current branch must be main before preparing Giving branch. Found: ${currentBranch.trim() || "unknown"}.`, preview);
  }

  const status = await gitRunner(["status", "--short"], { cwd: repositoryRoot });
  if (status.trim()) {
    return prepareFailure("GIVING_BRANCH_DIRTY_WORKTREE", "Worktree must be clean before preparing a Giving branch.", preview, { worktreeStatus: status.trim().split(/\r?\n/) });
  }

  const planPath = path.join(repositoryRoot, "discovery", "branch-plans", `${preview.sourceMissionId}.json`);
  const relativePlanPath = path.relative(repositoryRoot, planPath).replace(/\\/g, "/");
  const branchPlan = {
    ...preview,
    mode: "prepare",
    generatedAt: now,
    planPath: relativePlanPath,
    manualReviewRequired: true,
    mainProtected: true,
    pushTarget: `origin ${preview.branchName}`,
    mergeTarget: null
  };

  const serialized = `${JSON.stringify(branchPlan, null, 2)}\n`;
  if (unsafeTextPattern.test(serialized)) {
    return prepareFailure("GIVING_BRANCH_UNSAFE_PLAN_TEXT", "Branch plan contains secret-like or unsafe execution text and will not be written.", preview);
  }

  await gitRunner(["checkout", "-B", preview.branchName, baseBranch], { cwd: repositoryRoot });
  try {
    await mkdir(path.dirname(planPath), { recursive: true });
    await writeFile(planPath, serialized, "utf8");
    await gitRunner(["add", relativePlanPath], { cwd: repositoryRoot });
    await gitRunner(["commit", "-m", `chore(giving): prepare ${preview.sourceMissionId}`], { cwd: repositoryRoot });

    const validation = [];
    for (const command of preview.validationCommands) {
      const result = await commandRunner(command, { cwd: repositoryRoot });
      validation.push({ command, exitCode: result.exitCode, output: safeCommandOutput(result.output) });
      if (result.exitCode !== 0) {
        return {
          ...preview,
          ok: false,
          mode: "prepare",
          error: "validation-failed",
          error_code: "GIVING_BRANCH_VALIDATION_FAILED",
          message: `Validation failed before push: ${command}`,
          branchStatus: "committed-validation-failed",
          validationStatus: "failed",
          validation,
          pushStatus: "not-pushed",
          reviewStatus: "waiting-for-manual-review"
        };
      }
    }

    await gitRunner(["push", "-u", "origin", preview.branchName], { cwd: repositoryRoot });
    const commitHash = (await gitRunner(["rev-parse", "HEAD"], { cwd: repositoryRoot })).trim();
    return {
      ok: true,
      mode: "prepare",
      ...preview,
      branchStatus: "pushed",
      validationStatus: "passed",
      validation,
      pushStatus: "pushed",
      commitHash,
      planPath: relativePlanPath,
      reviewStatus: "waiting-for-manual-review",
      nextAction: "Open and review the pushed Giving branch. Main remains protected until manual merge."
    };
  } catch (error) {
    return prepareFailure("GIVING_BRANCH_PREPARE_FAILED", safeErrorMessage(error), preview);
  } finally {
    await gitRunner(["checkout", baseBranch], { cwd: repositoryRoot }).catch?.(() => null);
  }
}

function buildBranchPlan(normalized, safety) {
  return {
    branchName: normalized.branchName,
    baseBranch: normalized.baseBranch,
    sourceMissionId: normalized.sourceMissionId,
    missionTitle: normalized.missionTitle,
    includedCandidates: normalized.includedCandidates.map(toCandidatePlan),
    excludedCandidates: normalized.excludedCandidates.map(toCandidatePlan),
    blockedCandidateIds: normalized.excludedCandidates.filter((candidate) => ["quarantine", "blocked"].includes(candidate.verdict)).map((candidate) => candidate.id),
    protectionVerdicts: normalized.includedCandidates.map((candidate) => ({ id: candidate.id, verdict: candidate.verdict, reviewSatisfied: candidate.reviewSatisfied })),
    requiredChecks,
    validationCommands: normalized.validationCommands,
    validationStatus: "not-run",
    pushStatus: "not-pushed",
    reviewStatus: safety.ok ? "waiting-for-manual-review" : "blocked-by-protection",
    rollbackNotes: [
      "Delete the Giving branch if review rejects it.",
      "Main is not changed by branch preparation.",
      "Do not merge until a maintainer manually approves the branch."
    ],
    mainProtected: true
  };
}

function validateBranchPlan(plan) {
  const violations = [];
  if (!plan.sourceMissionId) violations.push("source mission id is required");
  if (plan.baseBranch !== baseBranch) violations.push("base branch must be main");
  if (!plan.branchName.startsWith(branchPrefix)) violations.push("branch name must start with vnem-giving/");
  if (!isSlugSafeBranch(plan.branchName)) violations.push("branch name must be slug-safe");
  if (plan.includedCandidates.length === 0) violations.push("at least one included candidate is required");
  for (const candidate of plan.includedCandidates) {
    if (["quarantine", "blocked"].includes(candidate.verdict)) violations.push(`${candidate.id} has forbidden verdict ${candidate.verdict}`);
    if (candidate.verdict === "needs-review" && !candidate.reviewSatisfied) violations.push(`${candidate.id} needs explicit maintainer review`);
    if (!candidate.verdict || !["allow", "needs-review", "quarantine", "blocked"].includes(candidate.verdict)) violations.push(`${candidate.id} has invalid verdict`);
  }
  const serialized = JSON.stringify(plan);
  if (unsafeTextPattern.test(serialized)) violations.push("plan contains secret-like or unsafe execution text");
  if (violations.length > 0) {
    return {
      ok: false,
      errorCode: "GIVING_BRANCH_PLAN_INVALID",
      message: violations[0],
      violations
    };
  }
  return { ok: true, violations: [] };
}

function normalizeBranchPayload(payload) {
  const sourceMissionId = normalizeSlugId(payload.sourceMissionId ?? payload.missionId ?? payload.id);
  const missionTitle = sanitizeText(payload.missionTitle ?? payload.title ?? "VNEM Giving branch plan", 160);
  const branchName = payload.branchName ? String(payload.branchName).trim() : `${branchPrefix}${sourceMissionId.replace(/^mission-/, "")}`;
  return {
    sourceMissionId,
    missionTitle,
    branchName,
    baseBranch: String(payload.baseBranch ?? payload.base ?? baseBranch).trim(),
    includedCandidates: normalizeCandidates(payload.includedCandidates ?? payload.candidates ?? []),
    excludedCandidates: normalizeCandidates(payload.excludedCandidates ?? []),
    validationCommands: normalizeValidationCommands(payload.validationCommands)
  };
}

function normalizeCandidates(candidates) {
  if (!Array.isArray(candidates)) return [];
  return candidates.map((candidate, index) => ({
    id: normalizeSlugId(candidate?.id ?? `candidate-${index + 1}`),
    title: sanitizeText(candidate?.title ?? candidate?.id ?? `Candidate ${index + 1}`, 160),
    verdict: String(candidate?.verdict ?? "").trim(),
    reviewSatisfied: Boolean(candidate?.reviewSatisfied ?? candidate?.userReviewSatisfied ?? candidate?.maintainer_review_satisfied ?? candidate?.review_satisfied),
    sourceRoute: sanitizeText(candidate?.sourceRoute ?? candidate?.source_route ?? "unknown-route", 80),
    sourceUrl: sanitizeUrl(candidate?.sourceUrl ?? candidate?.source_url ?? null)
  }));
}

function normalizeValidationCommands(commands) {
  const source = Array.isArray(commands) && commands.length > 0 ? commands : defaultValidationCommands;
  return source.map((command) => String(command).trim()).filter(Boolean).slice(0, 8);
}

function normalizeBranchName(value) {
  const text = String(value ?? "").trim();
  return text.startsWith(branchPrefix) ? text : `${branchPrefix}${slugify(text || "vnem-improvement")}`;
}

function normalizeSlugId(value) {
  return slugify(value || "mission-vnem-improvement");
}

function slugify(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9/_-]+/g, "-")
    .replace(/_{2,}/g, "_")
    .replace(/-{2,}/g, "-")
    .replace(/^[-_/]+|[-_/]+$/g, "")
    .slice(0, 80) || "vnem-improvement";
}

function isSlugSafeBranch(branchName) {
  return /^vnem-giving\/[a-z0-9][a-z0-9-]{1,70}$/.test(branchName);
}

function sanitizeText(value, maxLength) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function sanitizeUrl(value) {
  if (!value) return null;
  const text = String(value).trim();
  return /^https?:\/\//i.test(text) ? text.slice(0, 300) : null;
}

function toCandidatePlan(candidate) {
  return {
    id: candidate.id,
    title: candidate.title,
    verdict: candidate.verdict,
    reviewSatisfied: candidate.reviewSatisfied,
    sourceRoute: candidate.sourceRoute,
    sourceUrl: candidate.sourceUrl
  };
}

function prepareFailure(errorCode, message, preview, extra = {}) {
  return {
    ...preview,
    ok: false,
    mode: "prepare",
    error: "giving-branch-prepare-rejected",
    error_code: errorCode,
    message,
    branchStatus: "failed",
    validationStatus: "not-run",
    pushStatus: "not-pushed",
    reviewStatus: "waiting-for-manual-review",
    ...extra
  };
}

async function runGit(args, options) {
  const result = await execFile("git", args, { cwd: options.cwd, windowsHide: true, maxBuffer: 1024 * 1024 });
  return `${result.stdout ?? ""}${result.stderr ?? ""}`;
}

async function runShellCommand(command, options) {
  const result = await execFile("bash", ["-lc", command], { cwd: options.cwd, windowsHide: true, maxBuffer: 1024 * 1024 }).catch((error) => ({ stdout: error.stdout, stderr: error.stderr, exitCode: error.code ?? 1 }));
  return {
    exitCode: result.exitCode ?? 0,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`
  };
}

function safeCommandOutput(value) {
  return String(value ?? "").replace(/(Bearer\s+)[^\s]+/gi, "$1[REDACTED]").slice(0, 4000);
}

function safeErrorMessage(error) {
  return String(error?.message ?? error ?? "prepare failed").replace(/(Bearer\s+)[^\s]+/gi, "$1[REDACTED]").slice(0, 500);
}
