#!/usr/bin/env node
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultRootDir = path.resolve(scriptDir, "..");

export const ARD_RESEARCH_LANES = [
  { key: "repo-self", label: "Repo Self-Research Lane" },
  { key: "backlog-roadmap", label: "Backlog/Roadmap Lane" },
  { key: "run-history-failure", label: "Run-History/Failure Lane" },
  { key: "dashboard-product-weakness", label: "Dashboard/Product Weakness Lane" },
  { key: "test-validation-gap", label: "Test/Validation Gap Lane" },
  { key: "docs-drift", label: "Docs Drift Lane" },
  { key: "changes-by-ard-opportunity", label: "Changes by ARD Opportunity Lane" },
  { key: "external-metadata", label: "Optional External Metadata Lane" }
];

export const ARD_RESEARCH_CATEGORIES = [
  { key: "ai-skills", label: "AI Skills" },
  { key: "ai-mcp", label: "MCP Servers" },
  { key: "ai-agent-frameworks", label: "Agent Frameworks" },
  { key: "ai-coding-tools", label: "AI Coding Tools" },
  { key: "ai-research-methods", label: "AI Research Methods" },
  { key: "ai-evals-benchmarks", label: "AI Evals & Benchmarks" },
  { key: "ai-safety-security", label: "AI Safety & Security" },
  { key: "prompting-playbooks", label: "Prompting Playbooks" },
  { key: "repo-automation", label: "Repo Automation" },
  { key: "documentation-systems", label: "Documentation Systems" },
  { key: "browser-automation", label: "Browser Automation" },
  { key: "data-memory-retrieval", label: "Data, Memory & Retrieval" },
  { key: "roblox-luau", label: "Roblox/Luau" },
  { key: "general-devtools", label: "General Devtools" }
];

const categoryLabels = new Map(ARD_RESEARCH_CATEGORIES.map((category) => [category.key, category.label]));
const reviewArtifactSafeActions = new Set(["review-artifact-only", "metadata-only-work-package", "docs-only-summary"]);

const branchableSafeActions = new Set(["docs-only", "test-only", "repo-owned-code", "dashboard-model-only", "pipeline-helper-only", "research-memory improvement", "repo-memory update"]);
const implementableSafeActions = new Set(["docs-only", "test-only", "repo-owned-code", "dashboard-model-only", "pipeline-helper-only", "research-memory", "candidate-scoring", "changes-by-ard-evidence", "local-testing", "repo-memory-update", "review-artifact-only", "metadata-only-work-package", "docs-only-summary"]);
const safeActionAliases = new Map([
  ["research-memory improvement", "research-memory"],
  ["repo-memory update", "repo-memory-update"],
  ["Changes by ARD evidence improvement", "changes-by-ard-evidence"],
  ["local-testing improvement", "local-testing"],
  ["candidate-scoring improvement", "candidate-scoring"],
  ["review artifact only", "review-artifact-only"],
  ["review-artifact-only", "review-artifact-only"],
  ["metadata-only work package", "metadata-only-work-package"]
]);

export function stableCandidateId(sourceLane, sourceKey, title) {
  const normalized = [sourceLane, sourceKey, title].map((value) => String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")).join("|");
  const digest = createHash("sha1").update(normalized).digest("hex").slice(0, 10);
  const slug = String(title ?? sourceKey ?? sourceLane ?? "candidate").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 52) || "candidate";
  return `ard-${slug}-${digest}`;
}

export async function runResearchV2(options = {}) {
  const { rootDir = defaultRootDir, runId = createRunId("ard-v2"), now = () => new Date().toISOString(), write = true, includeExternal = false } = options;
  const previousMemory = await readCandidateMemory(rootDir).catch(() => ({ schema: "vnem.ardCandidateMemory.v1", candidates: {} }));
  const startedAt = now();
  const laneOutputs = await Promise.all([
    repoSelfResearchLane(rootDir),
    backlogRoadmapLane(rootDir),
    runHistoryFailureLane(rootDir),
    dashboardProductWeaknessLane(rootDir),
    testValidationGapLane(rootDir),
    docsDriftLane(rootDir),
    changesByArdOpportunityLane(rootDir),
    externalMetadataLane(rootDir, { includeExternal })
  ]);
  const byLane = new Map(laneOutputs.map((lane) => [lane.key, lane]));
  const candidates = laneOutputs.flatMap((lane) => lane.candidates).map((candidate) => normalizeResearchCandidate(candidate, { now: startedAt, previousMemory }));
  const memoryResult = mergeCandidateMemory(candidates, previousMemory, { runId, now: startedAt });
  const ranked = rankArdCandidates(candidates, { memory: memoryResult.memory });
  const output = {
    schema: "vnem.ardResearch.v2",
    runId,
    mode: "repo/local multi-lane research",
    startedAt,
    finishedAt: now(),
    status: "completed",
    mission: options.mission ?? "Expand ARD into branchable repo improvements",
    sourceLanes: ARD_RESEARCH_LANES.map((lane) => ({
      ...lane,
      status: byLane.get(lane.key)?.status ?? "not-run",
      candidatesFound: byLane.get(lane.key)?.candidates?.length ?? 0,
      notes: byLane.get(lane.key)?.notes ?? []
    })),
    sourcesChecked: ARD_RESEARCH_LANES.map((lane) => lane.label),
    candidatesFound: candidates.length,
    categories: summarizeCategories(candidates),
    categoryPolicy: {
      primaryQueueRule: "Branch-ready repo-owned and review-artifact-only work ranks above repeated external missing-license repos.",
      robloxLuauCap: "Roblox/Luau is one category and is demoted when repeated or missing license."
    },
    candidates,
    memory: summarizeMemory(memoryResult.memory),
    ranking: summarizeRanking(ranked)
  };
  if (write) {
    const dir = runDir(rootDir, runId);
    await writeJson(path.join(dir, "research.json"), output);
    await writeCandidateMemory(rootDir, memoryResult.memory);
  }
  return output;
}

export function mergeCandidateMemory(candidates = [], previousMemory = { candidates: {} }, context = {}) {
  const now = context.now ?? new Date().toISOString();
  const runId = context.runId ?? "unknown-run";
  const previous = previousMemory?.candidates ?? {};
  const next = { schema: "vnem.ardCandidateMemory.v1", updatedAt: now, candidates: { ...previous } };
  for (const candidate of candidates) {
    const id = candidate.candidateId;
    const old = previous[id] ?? {};
    const timesSeen = Number(old.timesSeen ?? 0) + 1;
    const status = lifecycleStatusFor(candidate, old, timesSeen);
    next.candidates[id] = {
      candidateId: id,
      title: candidate.title,
      sourceLane: candidate.sourceLane,
      sourceKey: candidate.sourceKey,
      firstSeen: old.firstSeen ?? now,
      lastSeen: now,
      timesSeen,
      status,
      verdict: candidate.initialVerdict ?? candidate.verdict ?? "needs-review",
      whyStuck: candidate.whyStuck ?? (status === "waiting-for-evidence" ? "Missing evidence blocks branchable work." : null),
      missingEvidence: candidate.missingEvidence ?? [],
      branchEligible: candidate.branchability === "branch-ready" && !candidate.dangerous,
      safeAction: normalizeSafeAction(candidate.suggestedSafeAction),
      lastAction: candidate.lastAction ?? null,
      lastRunId: runId,
      suppressedUntil: status === "low-signal-collapsed" ? old.suppressedUntil ?? addDays(now, 7) : null,
      supersededBy: candidate.supersededBy ?? null,
      dismissedReason: candidate.dismissedReason ?? null,
      dangerous: Boolean(candidate.dangerous)
    };
  }
  return { memory: next, records: next.candidates };
}

export function rankArdCandidates(candidates = [], options = {}) {
  const memory = options.memory?.candidates ? options.memory : { candidates: options.memory ?? {} };
  const scored = candidates.map((candidate) => {
    const record = memory.candidates?.[candidate.candidateId] ?? {};
    const scoring = scoreCandidate(candidate, record);
    const lifecycleStatus = record.status ?? lifecycleStatusFor(candidate, record, Number(record.timesSeen ?? 1));
    return {
      ...candidate,
      lifecycleStatus,
      timesSeen: Number(record.timesSeen ?? candidate.timesSeen ?? 1),
      scoring,
      branchReady: scoring.branchReady,
      lowSignalCollapsed: lifecycleStatus === "low-signal-collapsed",
      waitingForEvidence: lifecycleStatus === "waiting-for-evidence"
    };
  }).sort((a, b) => b.scoring.totalScore - a.scoring.totalScore);
  return {
    candidates: scored,
    groups: {
      branchReady: scored.filter((candidate) => candidate.branchReady && !candidate.dangerous),
      needsReview: scored.filter((candidate) => candidate.lifecycleStatus === "needs-review" || candidate.initialVerdict === "needs-review"),
      blocked: scored.filter((candidate) => candidate.dangerous || candidate.initialVerdict === "blocked" || candidate.initialVerdict === "quarantined"),
      lowSignalCollapsed: scored.filter((candidate) => candidate.lowSignalCollapsed),
      waitingForEvidence: scored.filter((candidate) => candidate.waitingForEvidence),
      alreadyHandled: scored.filter((candidate) => candidate.lifecycleStatus === "already-handled"),
      superseded: scored.filter((candidate) => candidate.lifecycleStatus === "superseded")
    }
  };
}

export function classifyWithProtectionV2(candidates = []) {
  const verdicts = candidates.map((candidate) => protectionVerdict(candidate));
  return {
    schema: "vnem.ardProtection.v2",
    reviewMode: "repo-local branch eligibility and safe-action classification",
    candidatesReviewed: verdicts.length,
    allowed: verdicts.filter((verdict) => verdict.verdict === "allow").length,
    needsReview: verdicts.filter((verdict) => verdict.verdict === "needs-review").length,
    blocked: verdicts.filter((verdict) => verdict.verdict === "blocked").length,
    quarantined: verdicts.filter((verdict) => verdict.verdict === "quarantined").length,
    branchEligible: verdicts.filter((verdict) => verdict.branchEligible).length,
    dangerousFindings: verdicts.filter((verdict) => verdict.dangerousSignals.length || ["blocked", "quarantined"].includes(verdict.verdict)),
    verdicts
  };
}

export function createGivingWorkPackages(candidates = [], protection = classifyWithProtectionV2(candidates)) {
  const verdictMap = new Map(protection.verdicts.map((verdict) => [verdict.candidateId, verdict]));
  const included = [];
  const excludedCandidates = [];
  for (const candidate of candidates) {
    const verdict = verdictMap.get(candidate.candidateId) ?? protectionVerdict(candidate);
    if (verdict.canFeedGiving && verdict.canFeedChangesByArd && (verdict.branchEligible || verdict.canCreateReviewArtifact)) {
      included.push(toWorkPackage(candidate, verdict));
    } else {
      excludedCandidates.push({
        candidateId: candidate.candidateId,
        title: candidate.title,
        dangerous: Boolean(candidate.dangerous || verdict.dangerousSignals.length),
        verdict: verdict.verdict,
        reason: verdict.whyNotBranchEligible || verdict.safeAction || "not branch-eligible",
        blockedReasons: verdict.missingEvidence
      });
    }
  }
  return {
    schema: "vnem.ardGiving.v2",
    includedWorkPackages: included,
    workPackages: included,
    excludedCandidates,
    branchReadyCount: included.length,
    blockedCount: protection.blocked + protection.quarantined,
    needsReviewCount: protection.needsReview,
    lowSignalCollapsedCount: candidates.filter((candidate) => candidate.lowSignalCollapsed).length,
    nextAction: included.length ? "Preview the top safe work package through Changes by ARD." : "Blocked: no safe repo-owned work package is branch-ready."
  };
}

export function previewWorkPackageForChangesByArd(workPackage = {}) {
  const exactFiles = [...new Set(workPackage.filesToChange ?? [])];
  return {
    ok: exactFiles.length > 0 && !workPackage.blockedReasons?.length,
    schema: "vnem.ardChangesWorkPackagePreview.v1",
    workPackageId: workPackage.workPackageId ?? null,
    title: workPackage.title ?? "Untitled work package",
    safeAction: workPackage.safeAction ?? "review-only",
    selectedWorkPackage: workPackage,
    exactFiles,
    whySafe: workPackage.riskNotes ?? ["Repo-owned work package; no external package install or discovered repo execution."],
    testsToRun: workPackage.testsToRun ?? [],
    mainProtected: true,
    branchName: "changes-by-ard",
    pushRequiresExactConfirmation: true,
    blockedReason: workPackage.blockedReasons?.join("; ") || null
  };
}

export async function runArdDogfood(options = {}) {
  const { rootDir = defaultRootDir, runId = createRunId("ard-dogfood"), now = () => new Date().toISOString(), write = true, prepareChanges = false, changesAdapter = null } = options;
  const research = await runResearchV2({ rootDir, runId, now, write: write && !prepareChanges });
  const fullMemory = await readCandidateMemory(rootDir).catch(() => ({ candidates: {} }));
  const ranked = rankArdCandidates(research.candidates, { memory: fullMemory });
  const protection = classifyWithProtectionV2(ranked.candidates);
  const giving = createGivingWorkPackages(ranked.candidates, protection);
  const selectedWorkPackage = giving.workPackages.find((workPackage) => workPackage.filesToChange.includes("docs/ARD_DOGFOOD_STATUS.md")) ?? giving.workPackages[0] ?? null;
  const preview = selectedWorkPackage ? previewWorkPackageForChangesByArd(selectedWorkPackage) : { ok: false, exactFiles: [], blockedReason: "No branch-ready work package." };
  let prepare = null;
  if (prepareChanges && selectedWorkPackage && changesAdapter) {
    prepare = await changesAdapter(selectedWorkPackage, preview);
  }
  const summary = {
    schema: "vnem.ardDogfood.v1",
    ok: Boolean(giving.workPackages.length),
    runId,
    generatedAt: now(),
    research: {
      sourceLanesUsed: research.sourceLanes.filter((lane) => lane.candidatesFound > 0).map((lane) => lane.key),
      candidatesFound: research.candidatesFound,
      categories: research.categories,
      newCandidates: Object.values(fullMemory.candidates ?? {}).filter((record) => record.lastRunId === runId && record.timesSeen === 1).length,
      repeatedCandidates: Object.values(fullMemory.candidates ?? {}).filter((record) => record.lastRunId === runId && record.timesSeen > 1).length,
      lowSignalCollapsed: ranked.groups.lowSignalCollapsed.length
    },
    protection: {
      branchEligible: protection.branchEligible,
      needsReview: protection.needsReview,
      blocked: protection.blocked,
      quarantined: protection.quarantined,
      dangerousFindings: protection.dangerousFindings.length,
      reviewArtifactOnly: protection.verdicts.filter((verdict) => verdict.allowedOutput === "review-artifact-only" || verdict.safeAction === "review-artifact-only").length,
      verdicts: protection.verdicts
    },
    giving,
    changesByArd: {
      preview,
      prepare,
      result: prepare ? (prepare.ok ? "prepared" : "blocked") : preview.ok ? "preview-ready" : "blocked"
    },
    limitations: [
      "Dogfood research is repo/local multi-lane analysis unless an external lane is explicitly enabled.",
      "Protection AI v2 is branch-eligibility and metadata/static text classification, not antivirus-grade scanning.",
      "Changes by ARD remains protected and requires exact confirmation before any push."
    ]
  };
  if (write) {
    const dir = runDir(rootDir, runId);
    await writeJson(path.join(dir, "dogfood-summary.json"), summary);
    await writeFile(path.join(dir, "dogfood-summary.md"), renderDogfoodMarkdown(summary), "utf8");
    await writeLatestRun(rootDir, runId, "dogfood-summary.json", "repo/local dogfood");
  }
  return summary;
}

function normalizeResearchCandidate(candidate, { now, previousMemory }) {
  const candidateId = candidate.candidateId ?? stableCandidateId(candidate.sourceLane, candidate.sourceKey, candidate.title);
  const previous = previousMemory?.candidates?.[candidateId];
  return {
    candidateId,
    title: candidate.title,
    sourceLane: candidate.sourceLane,
    sourceKey: candidate.sourceKey,
    category: candidate.category ?? categoryForCandidate(candidate),
    categoryLabel: categoryLabels.get(candidate.category ?? categoryForCandidate(candidate)) ?? "General Devtools",
    sourceType: candidate.sourceType ?? (candidate.external ? "external-github-metadata" : "repo-local"),
    repoFullName: candidate.repoFullName ?? null,
    sourceUrl: candidate.sourceUrl ?? null,
    summary: candidate.summary,
    whyItMatters: candidate.whyItMatters,
    productImpact: candidate.productImpact ?? "better future Building AI productivity",
    integrationPotential: candidate.integrationPotential ?? candidate.productImpact ?? "improves VNEM if evidence supports it",
    evidence: candidate.evidence ?? [],
    filesLikelyAffected: candidate.filesLikelyAffected ?? [],
    riskNotes: candidate.riskNotes ?? [],
    suggestedSafeAction: candidate.suggestedSafeAction ?? "review-only",
    missingEvidence: candidate.missingEvidence ?? [],
    licenseStatus: candidate.licenseStatus ?? (candidate.external ? "unknown" : "repo-owned"),
    riskLevel: candidate.riskLevel ?? (candidate.dangerous ? "high" : candidate.external ? "medium" : "low"),
    reviewState: candidate.reviewState ?? (candidate.external ? "needs-source-review" : candidate.branchability === "branch-ready" ? "branch-ready" : "needs-review"),
    allowedOutput: candidate.allowedOutput ?? (candidate.external ? "review-artifact-only" : "repo-owned-work-package"),
    branchability: candidate.branchability ?? "needs-review",
    firstSeen: previous?.firstSeen ?? now,
    lastSeen: now,
    timesSeen: Number(previous?.timesSeen ?? 0) + 1,
    dangerous: Boolean(candidate.dangerous),
    initialVerdict: candidate.initialVerdict ?? (candidate.dangerous ? "blocked" : candidate.branchability === "branch-ready" ? "allow" : "needs-review"),
    noveltyHint: candidate.noveltyHint ?? "new",
    external: Boolean(candidate.external),
    repoOwned: candidate.repoOwned !== false,
    testable: candidate.testable !== false
  };
}

function lifecycleStatusFor(candidate, old = {}, timesSeen = 1) {
  if (candidate.dangerous || candidate.initialVerdict === "blocked") return "blocked";
  if (candidate.initialVerdict === "quarantined") return "quarantined";
  if (candidate.supersededBy) return "superseded";
  if (candidate.dismissedReason) return "dismissed";
  if (old.status === "implemented-on-changes-branch") return "implemented-on-changes-branch";
  if (candidate.external && /missing|unknown|incompatible/.test(String(candidate.licenseStatus ?? "")) && timesSeen >= 2) return "waiting-for-evidence";
  if (candidate.branchability === "branch-ready" && !candidate.missingEvidence?.length) return "branch-ready";
  if (timesSeen >= 2 && isLowSignal(candidate)) return "low-signal-collapsed";
  if (candidate.missingEvidence?.length) return "waiting-for-evidence";
  return "needs-review";
}

function scoreCandidate(candidate, record = {}) {
  const normalizedSafeAction = normalizeSafeAction(candidate.suggestedSafeAction);
  const safetyRisk = candidate.dangerous ? 100 : candidate.riskNotes?.some((note) => /external|license|install|secret|danger/i.test(note)) ? 45 : 10;
  const licenseRisk = candidate.missingEvidence?.some((item) => /license/i.test(item)) ? 45 : 5;
  const stalenessPenalty = Number(record.timesSeen ?? candidate.timesSeen ?? 1) > 1 && isLowSignal(candidate) ? 35 : 0;
  const novelty = Number(record.timesSeen ?? candidate.timesSeen ?? 1) === 1 ? 18 : 6;
  const reviewArtifactReady = reviewArtifactSafeActions.has(normalizedSafeAction) && candidate.external && !candidate.dangerous;
  const branchReady = (candidate.branchability === "branch-ready" && !candidate.dangerous && implementableSafeActions.has(normalizedSafeAction)) || reviewArtifactReady;
  const values = {
    productImpact: candidate.productImpact ? 18 : 8,
    userVisibleImpact: /dashboard|operator|local-testing|changes/i.test([candidate.title, candidate.productImpact, candidate.summary].join(" ")) ? 14 : 8,
    actionability: candidate.filesLikelyAffected?.length ? 18 : 6,
    branchability: branchReady ? 20 : candidate.branchability === "waiting-for-evidence" ? 5 : 10,
    evidenceQuality: candidate.evidence?.length ? Math.min(15, 5 + candidate.evidence.length * 3) : 3,
    sourceFreshness: 8,
    sourceReliability: candidate.repoOwned ? 15 : 7,
    categoryDiversity: candidate.category && candidate.category !== "roblox-luau" ? 8 : 2,
    safetyRisk,
    licenseRisk,
    implementationComplexity: candidate.filesLikelyAffected?.length > 4 ? 12 : 4,
    testability: candidate.testable ? 14 : 4,
    novelty,
    staleness: stalenessPenalty
  };
  const totalScore = values.productImpact + values.userVisibleImpact + values.actionability + values.branchability + values.evidenceQuality + values.sourceFreshness + values.sourceReliability + values.categoryDiversity + values.testability + values.novelty - values.safetyRisk - values.licenseRisk - values.implementationComplexity - values.staleness;
  return { ...values, totalScore, branchReady, normalizedSafeAction };
}

function protectionVerdict(candidate) {
  const safeAction = candidate.scoring?.normalizedSafeAction ?? normalizeSafeAction(candidate.suggestedSafeAction);
  const dangerousSignals = [];
  const text = [candidate.title, candidate.summary, ...(candidate.evidence ?? []), ...(candidate.riskNotes ?? [])].join("\n").toLowerCase();
  if (/credential theft|token access|private key|seed phrase|reads process\.env|exfiltrat/.test(text)) dangerousSignals.push("secret/credential risk");
  if (/postinstall|shell pipe|curl .*\|/.test(text)) dangerousSignals.push("unsafe install/execution risk");
  if (/dangerous|malware|exfiltrat/.test(text)) dangerousSignals.push("dangerous safety canary");
  const isReviewArtifact = reviewArtifactSafeActions.has(safeAction) || candidate.allowedOutput === "review-artifact-only";
  let verdict = "needs-review";
  if (candidate.dangerous || dangerousSignals.length) verdict = "blocked";
  else if (!candidate.external && candidate.branchability === "branch-ready" && implementableSafeActions.has(safeAction)) verdict = "allow";
  const missingEvidence = [...(candidate.missingEvidence ?? [])];
  if (candidate.external && /missing|unknown|incompatible/.test(String(candidate.licenseStatus ?? "")) && !missingEvidence.some((item) => /license/i.test(item))) missingEvidence.push("Missing or unresolved license blocks implementation code.");
  if (verdict === "needs-review" && !missingEvidence.length && !isReviewArtifact) missingEvidence.push("Need a narrower file list, test path, or maintainer evidence before branch work.");
  const canCreateReviewArtifact = verdict !== "blocked" && candidate.external && isReviewArtifact;
  const branchEligible = verdict === "allow" && !dangerousSignals.length && candidate.filesLikelyAffected?.length > 0 && implementableSafeActions.has(safeAction);
  const whyNotBranchEligible = branchEligible ? null : dangerousSignals.length ? "Dangerous or unsafe signals block Giving and Changes by ARD." : canCreateReviewArtifact ? "External candidate can only create a review artifact until license/source evidence is resolved." : missingEvidence.join("; ") || "Candidate is not repo-owned or not actionable enough.";
  return {
    candidateId: candidate.candidateId,
    title: candidate.title,
    verdict,
    riskScore: candidate.scoring?.safetyRisk ?? (dangerousSignals.length ? 90 : 30),
    trustScore: branchEligible ? 86 : verdict === "blocked" ? 12 : 55,
    licenseStatus: candidate.licenseStatus ?? (candidate.external ? "review-required" : "repo-owned"),
    sourceTrust: candidate.sourceTrust ?? (candidate.external ? "unknown" : "repo-owned"),
    reviewState: candidate.reviewState ?? (canCreateReviewArtifact ? "needs-license-review" : branchEligible ? "branch-ready" : verdict === "blocked" ? "blocked" : "needs-review"),
    allowedOutput: candidate.allowedOutput ?? (canCreateReviewArtifact ? "review-artifact-only" : branchEligible ? "work-package" : verdict === "blocked" ? "blocked-report" : "wait-for-evidence"),
    installRisk: dangerousSignals.some((signal) => /install/.test(signal)) ? "high" : "none-for-repo-owned-work",
    executionRisk: dangerousSignals.some((signal) => /execution/.test(signal)) ? "high" : "none-planned",
    secretRisk: dangerousSignals.some((signal) => /secret|credential/.test(signal)) ? "high" : "none-detected",
    authRisk: "no-auth-change-planned",
    dangerousSignals,
    missingEvidence,
    whyNotBranchEligible,
    whatWouldMakeItBranchEligible: branchEligible ? [] : branchEligibilityNeeds(candidate, safeAction, missingEvidence, dangerousSignals),
    safeAction: branchEligible || canCreateReviewArtifact ? safeAction : dangerousSignals.length ? "blocked-report" : safeAction === "review-only" ? "review-only" : "wait-for-evidence",
    branchEligible,
    canCreateReviewArtifact,
    canFeedGiving: branchEligible || canCreateReviewArtifact,
    canFeedChangesByArd: branchEligible || canCreateReviewArtifact,
    implementationEligible: branchEligible && !candidate.external,
    humanReviewRequired: verdict !== "allow" || candidate.external === true,
    sourceLane: candidate.sourceLane,
    filesLikelyAffected: candidate.filesLikelyAffected ?? []
  };
}

function toWorkPackage(candidate, verdict) {
  const safeAction = verdict.safeAction;
  const changeType = changeTypeFor(safeAction);
  const filesToChange = [...new Set(candidate.filesLikelyAffected?.length ? candidate.filesLikelyAffected : (reviewArtifactSafeActions.has(safeAction) ? [`docs/ard-reviews/${slugForPath(candidate.repoFullName ?? candidate.title)}.md`] : ["docs/ARD_DOGFOOD_STATUS.md"]) )];
  const testsToRun = testsForSafeAction(safeAction);
  return {
    workPackageId: stableCandidateId("work-package", candidate.candidateId, safeAction),
    title: candidate.title,
    candidateId: candidate.candidateId,
    safeAction,
    category: candidate.category,
    categoryLabel: candidate.categoryLabel,
    sourceLane: candidate.sourceLane,
    state: reviewArtifactSafeActions.has(safeAction) ? "review-artifact-ready" : safeAction === "wait-for-evidence" ? "waiting-for-evidence" : "implementation-ready",
    branchability: candidate.branchability,
    external: Boolean(candidate.external),
    repoOwned: !candidate.external,
    reviewArtifactOnly: reviewArtifactSafeActions.has(safeAction),
    whyThisImprovesVNEM: candidate.whyItMatters ?? candidate.productImpact,
    filesToChange,
    changeType,
    expectedDiffSummary: `Apply a ${changeType} change for ${candidate.title} using repo-owned files only.`,
    testsToRun,
    userVisibleResult: candidate.productImpact,
    rollbackNotes: ["Revert the protected changes-by-ard commit if review rejects it.", "Main is unchanged by work package preview/prepare."],
    riskNotes: reviewArtifactSafeActions.has(safeAction) ? ["External metadata review artifact only; no code import; no package install; no discovered repo execution."] : ["Repo-owned work package; no external package install; no discovered repo execution; no auth weakening."],
    blockedReasons: []
  };
}

async function repoSelfResearchLane(rootDir) {
  const candidates = [];
  const files = ["scripts/ard-pipeline.mjs", "scripts/candidate-pipeline.mjs", "scripts/ard-changes-branch.mjs", "dashboard/src/lib/ardOperatorModel.js"];
  for (const relative of files) {
    const text = await readOptional(path.join(rootDir, relative));
    if (!text) continue;
    if (/TODO|FIXME|candidate memory|branch eligibility|review queue|work package/i.test(text)) {
      candidates.push(candidate({
        sourceLane: "repo-self",
        sourceKey: relative,
        title: relative.includes("ard-pipeline") ? "Add ARD candidate lifecycle memory and branch eligibility proof" : `Tighten ARD behavior in ${relative}`,
        summary: `Repo self-research found ARD behavior markers in ${relative}.`,
        whyItMatters: "Repo-owned improvements are safer and can feed Changes by ARD without external code.",
        productImpact: "better research quality and better Changes by ARD branch workflow",
        evidence: snippetEvidence(text, relative, /TODO|FIXME|candidate memory|branch eligibility|review queue|work package/i),
        filesLikelyAffected: [relative, "scripts/test-ard-capability-engine.mjs"],
        suggestedSafeAction: relative.includes("dashboard") ? "dashboard-model-only" : "repo-owned-code",
        branchability: "branch-ready"
      }));
    }
  }
  if (!candidates.length) {
    candidates.push(candidate({
      sourceLane: "repo-self",
      sourceKey: "scripts/ard-pipeline.mjs",
      title: "Keep ARD research behavior covered by repo-owned tests",
      summary: "Repo self-research found the ARD pipeline as a central product file that should stay under focused test coverage.",
      whyItMatters: "The ARD loop is product-critical and safe to improve through repo-owned tests/helpers.",
      productImpact: "better verification/proof",
      evidence: ["scripts/ard-pipeline.mjs exists"],
      filesLikelyAffected: ["scripts/ard-pipeline.mjs", "scripts/test-ard-capability-engine.mjs"],
      suggestedSafeAction: "test-only",
      branchability: "branch-ready"
    }));
  }
  candidates.push(candidate({
    sourceLane: "repo-self",
    sourceKey: "safety-canary/dangerous-package",
    title: "Dangerous package canary stays blocked and visible",
    summary: "A local safety canary carries token/postinstall/shell-pipe signals so Protection AI proves dangerous findings remain report-only.",
    whyItMatters: "ARD must never hide or implement dangerous findings.",
    productImpact: "better protection/safety",
    evidence: ["token access signal", "postinstall signal", "shell-pipe install signal"],
    filesLikelyAffected: [],
    riskNotes: ["dangerous local canary", "secret/credential risk", "unsafe install/execution risk"],
    suggestedSafeAction: "blocked-report",
    branchability: "blocked",
    dangerous: true,
    initialVerdict: "blocked"
  }));
  return laneResult("repo-self", candidates);
}

async function backlogRoadmapLane(rootDir) {
  const sources = ["docs/ARD_PRODUCT_BACKLOG.md", "docs/ARD_ROADMAP.md", "docs/BUILDING_AI_STATE.md", "docs/ARD_DECISION_LOG.md", "docs/product-direction.md", "docs/current-system.md"];
  const text = (await Promise.all(sources.map(async (file) => `${file}\n${await readOptional(path.join(rootDir, file))}`))).join("\n");
  const candidates = [];
  if (/review queue|low-signal|branch eligibility/i.test(text)) candidates.push(candidate({
    sourceLane: "backlog-roadmap",
    sourceKey: "review-queue-branch-eligibility",
    title: "Add candidate memory and suppress repeated low-signal review candidates",
    summary: "Backlog/roadmap asks for fewer repeated review cards and clearer branch eligibility.",
    whyItMatters: "The review queue should stop resurfacing stale low-value items without hiding dangerous findings.",
    productImpact: "better research quality and better dashboard/operator clarity",
    evidence: ["docs/ARD_PRODUCT_BACKLOG.md: Better review queue", "docs/ARD_ROADMAP.md: branch eligibility and exclusion reasons"],
    filesLikelyAffected: ["scripts/ard-capability-engine.mjs", "scripts/test-ard-capability-engine.mjs", "dashboard/src/lib/ardOperatorModel.js"],
    suggestedSafeAction: "repo-owned-code",
    branchability: "branch-ready"
  }));
  if (/Changes by ARD|validation evidence|exact files/i.test(text)) candidates.push(candidate({
    sourceLane: "backlog-roadmap",
    sourceKey: "changes-by-ard-validation-evidence",
    title: "Show Changes by ARD validation evidence and exact files before branch actions",
    summary: "Roadmap requests clearer diff preview, validation evidence, and protected branch explanations.",
    whyItMatters: "Operators need proof before preparing or pushing protected branch work.",
    productImpact: "better Changes by ARD branch workflow and better verification/proof",
    evidence: ["docs/ARD_ROADMAP.md: validation evidence next to branch action", "docs/ARD_PRODUCT_BACKLOG.md: preview dry-run and no main push"],
    filesLikelyAffected: ["scripts/ard-changes-branch.mjs", "dashboard/src/lib/ardOperatorModel.js", "dashboard/src/components/ArdOperatorConsole.jsx"],
    suggestedSafeAction: "changes-by-ard-evidence",
    category: "repo-automation",
    branchability: "branch-ready"
  }));
  candidates.push(...categoryDiversityCandidates());
  return laneResult("backlog-roadmap", candidates);
}

async function runHistoryFailureLane(rootDir) {
  const dir = path.join(rootDir, "discovery", "run-history");
  const candidates = [];
  let combined = "";
  try {
    const names = (await readdir(dir)).filter((name) => name.endsWith(".json") && name !== "index.json" && name !== "active-run.json").sort().slice(-8);
    for (const name of names) combined += await readOptional(path.join(dir, name));
  } catch {}
  if (/same|repeated|stale|dirty|artifact|blocked|limitation|candidate/i.test(combined)) {
    candidates.push(candidate({
      sourceLane: "run-history-failure",
      sourceKey: "recent-run-limitations",
      title: "Turn repeated ARD blockers into lifecycle states instead of repeated review spam",
      summary: "Recent run history contains recurring limitation/blocker language that should become candidate memory state.",
      whyItMatters: "ARD should learn that an unchanged blocker needs missing evidence, suppression, or branch-ready conversion.",
      productImpact: "better future Building AI productivity",
      evidence: ["discovery/run-history recent records mention limitations/blockers/candidates"],
      filesLikelyAffected: ["scripts/ard-capability-engine.mjs", "docs/BUILDING_AI_STATE.md"],
      suggestedSafeAction: "research-memory",
      branchability: "branch-ready"
    }));
  } else {
    candidates.push(candidate({
      sourceLane: "run-history-failure",
      sourceKey: "no-recent-failure-artifact",
      title: "Record ARD dogfood run summary for future failure mining",
      summary: "No actionable recent blocker was found, so ARD should produce dogfood artifacts that future runs can mine.",
      whyItMatters: "Future Research AI needs structured run output to avoid repeating weak searches.",
      productImpact: "better future Building AI productivity",
      evidence: ["discovery/run-history inspected"],
      filesLikelyAffected: ["discovery/ard-runs/<run-id>/dogfood-summary.json"],
      suggestedSafeAction: "research-memory",
      branchability: "branch-ready"
    }));
  }
  return laneResult("run-history-failure", candidates);
}

async function dashboardProductWeaknessLane(rootDir) {
  const model = await readOptional(path.join(rootDir, "dashboard", "src", "lib", "ardOperatorModel.js"));
  const component = await readOptional(path.join(rootDir, "dashboard", "src", "components", "ArdOperatorConsole.jsx"));
  const text = `${model}\n${component}`;
  const missing = [];
  if (!/source lanes|sourceLanes|sourceLanesUsed/i.test(text)) missing.push("source lanes");
  if (!/work package|workPackages/i.test(text)) missing.push("work packages");
  if (!/suppressed|low-signal collapsed/i.test(text)) missing.push("suppressed candidates");
  return laneResult("dashboard-product-weakness", [candidate({
    sourceLane: "dashboard-product-weakness",
    sourceKey: "operator-model-real-ard-v2-states",
    title: "Expose source lanes, lifecycle state, and work packages in the operator model",
    summary: missing.length ? `Dashboard model is missing or weak on: ${missing.join(", ")}.` : "Dashboard model should keep ARD v2 real states visible as the product expands.",
    whyItMatters: "The operator should see whether ARD actually produced branchable work, not only a generic pipeline status.",
    productImpact: "better dashboard/operator clarity",
    evidence: missing.length ? missing.map((item) => `Missing/weak dashboard state: ${item}`) : ["dashboard model inspected"],
    filesLikelyAffected: ["dashboard/src/lib/ardOperatorModel.js", "dashboard/src/components/ArdOperatorConsole.jsx", "dashboard/src/lib/__tests__/ardOperatorModel.test.js"],
    suggestedSafeAction: "dashboard-model-only",
    branchability: "branch-ready"
  })]);
}

async function testValidationGapLane(rootDir) {
  const pkg = JSON.parse(await readOptional(path.join(rootDir, "package.json")) || "{}");
  const scripts = pkg.scripts ?? {};
  const missing = [];
  for (const script of ["test:ard-capability-engine", "test:ard-dogfood", "ard:dogfood"]) if (!scripts[script]) missing.push(script);
  return laneResult("test-validation-gap", [candidate({
    sourceLane: "test-validation-gap",
    sourceKey: "ard-v2-test-scripts",
    title: "Add focused ARD v2 dogfood and capability tests",
    summary: missing.length ? `Missing scripts: ${missing.join(", ")}.` : "ARD v2 tests exist and should remain in the current test chain.",
    whyItMatters: "The ARD loop needs automated proof that research, memory, protection, giving, and dogfood behavior works.",
    productImpact: "better verification/proof",
    evidence: missing.length ? missing.map((item) => `package.json lacks ${item}`) : ["package.json includes ARD v2 focused scripts"],
    filesLikelyAffected: ["package.json", "scripts/test-ard-capability-engine.mjs", "scripts/test-ard-dogfood.mjs"],
    suggestedSafeAction: "test-only",
    branchability: "branch-ready"
  })]);
}

async function docsDriftLane(rootDir) {
  const docs = ["README.md", "docs/local-testing.md", "docs/current-system.md", "docs/BUILDING_AI_STATE.md"].join("\n");
  const text = await Promise.all(docs.split("\n").map(async (file) => `${file}\n${await readOptional(path.join(rootDir, file))}`));
  const all = text.join("\n");
  const lacksDogfood = !/ard:dogfood/i.test(all);
  const staleBrowserOnly = /ARD Browser Pipeline v1/i.test(all) && lacksDogfood;
  return laneResult("docs-drift", [candidate({
    sourceLane: "docs-drift",
    sourceKey: "ard-dogfood-docs",
    title: "Document ARD dogfood command and v2 capability limits",
    summary: lacksDogfood ? "Docs do not yet show a one-command ARD dogfood path." : "Docs include dogfood path and should be kept aligned with ARD v2 behavior.",
    whyItMatters: "Users need one command that proves source lanes, lifecycle memory, work packages, and Changes by ARD readiness.",
    productImpact: "better future Building AI productivity and better operator clarity",
    evidence: [lacksDogfood ? "ard:dogfood not found in local docs" : "ard:dogfood found in docs", staleBrowserOnly ? "docs emphasize Browser Pipeline v1" : "docs mention newer ARD paths"],
    filesLikelyAffected: ["docs/ARD_DOGFOOD_STATUS.md", "README.md", "docs/local-testing.md", "docs/current-system.md", "docs/BUILDING_AI_STATE.md"],
    suggestedSafeAction: "docs-only",
    branchability: "branch-ready"
  })]);
}

async function changesByArdOpportunityLane(rootDir) {
  const exists = existsSync(path.join(rootDir, "scripts", "ard-changes-branch.mjs"));
  return laneResult("changes-by-ard-opportunity", [candidate({
    sourceLane: "changes-by-ard-opportunity",
    sourceKey: "work-package-preview-exact-files",
    title: "Feed a safe ARD work package into Changes by ARD preview",
    summary: "Changes by ARD should preview selected work packages with exact files, safety reason, and test path.",
    whyItMatters: "This closes the loop from Research AI to Protection AI to Giving AI to protected branch work.",
    productImpact: "better Changes by ARD branch workflow",
    evidence: [exists ? "scripts/ard-changes-branch.mjs exists" : "Changes by ARD script missing"],
    filesLikelyAffected: ["scripts/ard-changes-branch.mjs", "scripts/test-ard-changes-branch.mjs", "scripts/ard-capability-engine.mjs"],
    suggestedSafeAction: "changes-by-ard-evidence",
    branchability: exists ? "branch-ready" : "waiting-for-evidence",
    missingEvidence: exists ? [] : ["Changes by ARD script missing"]
  })]);
}

async function externalMetadataLane(rootDir, { includeExternal }) {
  const observedExternal = [
    ["luau-lang/benchmark-data", "https://github.com/luau-lang/benchmark-data", "roblox-luau", "missing", "Observed repeated Roblox/Luau benchmark-data candidate with missing license metadata."],
    ["schmusch/roblox-ai-workflow", "https://github.com/schmusch/roblox-ai-workflow", "roblox-luau", "missing", "Observed repeated Roblox AI workflow candidate with missing license metadata."],
    ["frostproject/roblox-library-template", "https://github.com/frostproject/roblox-library-template", "roblox-luau", "unknown", "Observed Roblox library template candidate requiring manual source review."],
    ["kinetik-gg/kinetik-engine", "https://github.com/kinetik-gg/kinetik-engine", "general-devtools", "missing", "Observed engine candidate with missing license metadata."],
    ["robIswift/swift", "https://github.com/robIswift/swift", "ai-coding-tools", "missing", "Observed coding-tool-looking repository with unresolved license/source evidence."]
  ];
  const candidates = observedExternal.map(([repoFullName, sourceUrl, category, licenseStatus, summary]) => externalGithubCandidate({ repoFullName, sourceUrl, category, licenseStatus, summary }));
  candidates.push(candidate({
    sourceLane: "external-metadata",
    sourceKey: includeExternal ? "external-metadata-enabled" : "external-metadata-disabled",
    title: includeExternal ? "External metadata lane enabled for safe metadata only" : "External metadata lane is unavailable in this dogfood run",
    summary: includeExternal ? "External metadata lane may use safe metadata lookup only." : "No live external metadata lookup is used unless explicitly enabled; observed external repos are triaged from local/dashboard metadata only.",
    whyItMatters: "ARD must not fake live external research or install/execute discovered packages.",
    productImpact: "better research quality and better safety",
    category: "ai-research-methods",
    sourceType: "external-metadata-status",
    evidence: [includeExternal ? "external metadata flag enabled" : "external metadata flag disabled"],
    filesLikelyAffected: [],
    riskNotes: includeExternal ? ["metadata-only; no install or execution"] : ["external unavailable/not requested"],
    suggestedSafeAction: includeExternal ? "review-only" : "wait-for-evidence",
    branchability: "waiting-for-evidence",
    missingEvidence: includeExternal ? ["Need fetched metadata evidence before branch work"] : ["External metadata lane not enabled for this run"],
    external: true,
    repoOwned: false,
    testable: true,
    licenseStatus: "not-needed-for-metadata-only",
    allowedOutput: "no-output",
    reviewState: "waiting-for-evidence"
  }));
  return laneResult("external-metadata", candidates, ["Live external lookup not claimed; observed missing-license repos are metadata-only triage inputs."]);
}

function externalGithubCandidate({ repoFullName, sourceUrl, category, licenseStatus, summary }) {
  const slug = slugForPath(repoFullName);
  return candidate({
    sourceLane: "external-metadata",
    sourceKey: repoFullName,
    sourceType: "observed-dashboard-external-github-metadata",
    sourceUrl,
    repoFullName,
    category,
    title: repoFullName,
    summary,
    whyItMatters: "External repository signals can inform VNEM research, but missing license/source evidence blocks code import.",
    productImpact: category === "roblox-luau" ? "better research quality without Roblox/Luau dominating the review queue" : "better research diversity and safer external review",
    integrationPotential: "metadata-only review artifact until license/source evidence is resolved",
    evidence: [`Observed unresolved external repository candidate: ${repoFullName}`, `License status: ${licenseStatus}`],
    filesLikelyAffected: [`docs/ard-reviews/${slug}.md`],
    riskNotes: ["external GitHub metadata only", "do not install", "do not execute", "do not copy code"],
    suggestedSafeAction: "review-artifact-only",
    missingEvidence: licenseStatus === "missing" ? ["Missing license metadata", "Need primary source/license review before any implementation use"] : ["Need maintainer/source review before any implementation use"],
    licenseStatus,
    sourceTrust: repoFullName.startsWith("luau-lang/") ? "known-community" : "unknown",
    reviewState: licenseStatus === "missing" ? "needs-license-review" : "needs-source-review",
    allowedOutput: "review-artifact-only",
    riskLevel: "medium",
    branchability: "waiting-for-evidence",
    external: true,
    repoOwned: false,
    testable: true
  });
}

function categoryDiversityCandidates() {
  const items = [
    ["ai-skills", "Add AI skill intake rubric to ARD research categories", "AI skills should be reviewed as reusable procedures, not random repo cleanup."],
    ["ai-mcp", "Add MCP server metadata review lane to ARD research categories", "MCP servers are high-value integration candidates but require permissions and source review."],
    ["ai-agent-frameworks", "Track agent framework candidates separately from coding tools", "Agent frameworks have different risks and evaluation criteria than one-off repos."],
    ["ai-evals-benchmarks", "Track eval and benchmark candidates as review artifacts", "Evals improve proof quality without requiring external code execution."],
    ["ai-safety-security", "Keep safety and permission-risk candidates visible but report-only", "Protection quality is product value and must not be hidden."],
    ["prompting-playbooks", "Track prompt and playbook improvements as docs-only work", "Prompt systems improve task understanding and future Building AI productivity."],
    ["documentation-systems", "Track docs drift as a first-class research category", "Docs drift creates fake product confidence and weakens user testing."],
    ["browser-automation", "Track browser automation proof separately from live external research", "Browser automation is useful but must not be mislabeled as live research."],
    ["data-memory-retrieval", "Track candidate memory and retrieval improvements", "ARD needs memory to stop repeated stale review loops."],
    ["general-devtools", "Track general devtool improvements without crowding AI-specific lanes", "General devtools can help but should not dominate ARD research."]
  ];
  return items.map(([category, title, whyItMatters]) => candidate({
    sourceLane: "backlog-roadmap",
    sourceKey: `category-taxonomy/${category}`,
    sourceType: "repo-local-category-taxonomy",
    category,
    title,
    summary: `Repo-local taxonomy candidate for ${category}.`,
    whyItMatters,
    productImpact: "better research quality and better future portability toward VNEM MCP",
    integrationPotential: "category-level research/reporting improvement",
    evidence: ["docs/ARD_PRODUCT_BACKLOG.md: ARD must improve research quality", "AGENTS.md: research as understanding"],
    filesLikelyAffected: ["scripts/ard-capability-engine.mjs", "docs/ARD_DOGFOOD_STATUS.md"],
    suggestedSafeAction: "docs-only",
    licenseStatus: "repo-owned",
    riskLevel: "low",
    branchability: "branch-ready"
  }));
}

function candidate(data) { return data; }
function laneResult(key, candidates, notes = []) { return { key, status: "completed", candidates, notes }; }
function isLowSignal(candidate) { return /external metadata lane is unavailable|generic|low-signal|waiting/i.test([candidate.title, candidate.summary, candidate.sourceKey].join(" ")) || candidate.filesLikelyAffected?.length === 0 && !candidate.dangerous; }
function normalizeSafeAction(action) { const raw = String(action ?? "review-only").trim(); return safeActionAliases.get(raw) ?? raw; }
function addDays(iso, days) { const date = new Date(iso); date.setUTCDate(date.getUTCDate() + days); return date.toISOString(); }
function branchEligibilityNeeds(candidate, safeAction, missingEvidence, dangerousSignals) { const needs = [...missingEvidence]; if (dangerousSignals.length) needs.push("Remove dangerous/unsafe signals; keep report-only."); if (!candidate.filesLikelyAffected?.length) needs.push("Add exact repo-owned files to change."); if (!implementableSafeActions.has(safeAction)) needs.push("Choose a repo-owned safe action such as docs-only, test-only, dashboard-model-only, or pipeline-helper-only."); return [...new Set(needs)]; }
function changeTypeFor(safeAction) { if (reviewArtifactSafeActions.has(safeAction)) return "external review artifact"; if (safeAction === "docs-only" || safeAction === "repo-memory-update" || safeAction === "local-testing") return "docs-only improvement"; if (safeAction === "test-only") return "test-only improvement"; if (safeAction === "dashboard-model-only") return "dashboard-model improvement"; if (safeAction === "pipeline-helper-only" || safeAction === "repo-owned-code") return "pipeline-helper improvement"; if (safeAction === "changes-by-ard-evidence") return "Changes by ARD evidence improvement"; if (safeAction === "research-memory") return "research-memory improvement"; if (safeAction === "candidate-scoring") return "candidate-scoring improvement"; return "repo-memory update"; }
function testsForSafeAction(safeAction) { const base = ["npm run test:ard-capability-engine"]; if (reviewArtifactSafeActions.has(safeAction)) base.push("npm run test:public-repo-hygiene"); if (["dashboard-model-only", "changes-by-ard-evidence"].includes(safeAction)) base.push("npm run test:dashboard-operator"); if (["repo-owned-code", "pipeline-helper-only", "candidate-scoring", "research-memory"].includes(safeAction)) base.push("npm run test:ard-dogfood"); if (safeAction === "test-only") base.push("npm run test:current"); return [...new Set(base)]; }
function summarizeCategories(candidates) {
  const counts = new Map();
  for (const candidate of candidates) counts.set(candidate.category, (counts.get(candidate.category) ?? 0) + 1);
  return [...counts.entries()].map(([key, count]) => ({ key, label: categoryLabels.get(key) ?? key, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}
function categoryForCandidate(candidate) {
  const text = [candidate.title, candidate.summary, candidate.sourceKey, candidate.sourceLane].join(" ").toLowerCase();
  if (/mcp/.test(text)) return "ai-mcp";
  if (/skill/.test(text)) return "ai-skills";
  if (/agent framework|framework/.test(text)) return "ai-agent-frameworks";
  if (/coding|code/.test(text)) return "ai-coding-tools";
  if (/eval|benchmark/.test(text)) return "ai-evals-benchmarks";
  if (/safety|security|protection|danger/.test(text)) return "ai-safety-security";
  if (/prompt/.test(text)) return "prompting-playbooks";
  if (/repo|branch|github|changes by ard/.test(text)) return "repo-automation";
  if (/doc|readme|local-testing/.test(text)) return "documentation-systems";
  if (/browser|dashboard/.test(text)) return "browser-automation";
  if (/memory|retrieval|candidate memory/.test(text)) return "data-memory-retrieval";
  if (/roblox|luau/.test(text)) return "roblox-luau";
  if (/research/.test(text)) return "ai-research-methods";
  return "general-devtools";
}
function slugForPath(value) { return String(value ?? "candidate").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "candidate"; }

function summarizeMemory(memory) { const records = Object.values(memory.candidates ?? {}); return { total: records.length, repeated: records.filter((record) => record.timesSeen > 1).length, lowSignalCollapsed: records.filter((record) => record.status === "low-signal-collapsed").length, branchReady: records.filter((record) => record.status === "branch-ready").length, waitingForEvidence: records.filter((record) => record.status === "waiting-for-evidence").length, dangerous: records.filter((record) => record.dangerous).length }; }
function summarizeRanking(ranked) { return { branchReady: ranked.groups.branchReady.length, needsReview: ranked.groups.needsReview.length, blocked: ranked.groups.blocked.length, lowSignalCollapsed: ranked.groups.lowSignalCollapsed.length, waitingForEvidence: ranked.groups.waitingForEvidence.length, topCandidates: ranked.candidates.slice(0, 5).map((candidate) => ({ candidateId: candidate.candidateId, title: candidate.title, score: candidate.scoring.totalScore, lifecycleStatus: candidate.lifecycleStatus, sourceLane: candidate.sourceLane })) }; }
function snippetEvidence(text, file, pattern) { const lines = String(text ?? "").split(/\r?\n/); const found = []; lines.forEach((line, index) => { if (pattern.test(line) && found.length < 3) found.push(`${file}:${index + 1}: ${line.trim().slice(0, 160)}`); }); return found.length ? found : [`${file} inspected`]; }
async function readOptional(file) { try { return await readFile(file, "utf8"); } catch { return ""; } }
async function readCandidateMemory(rootDir) { const file = path.join(rootDir, "discovery", "ard-memory", "candidate-memory.json"); return JSON.parse(await readFile(file, "utf8")); }
async function writeCandidateMemory(rootDir, memory) { await writeJson(path.join(rootDir, "discovery", "ard-memory", "candidate-memory.json"), memory); }
async function writeJson(file, data) { await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, `${JSON.stringify(data, null, 2)}\n`, "utf8"); }
async function writeLatestRun(rootDir, runId, summaryPath, mode) { await writeJson(path.join(rootDir, "discovery", "ard-runs", "latest.json"), { schema: "vnem.ardLatestRun.v1", runId, path: `${runId}/${summaryPath}`, mode, updatedAt: new Date().toISOString() }); }
function runDir(rootDir, runId) { return path.join(rootDir, "discovery", "ard-runs", runId); }
function createRunId(prefix) { return `${prefix}-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "")}`.toLowerCase(); }
function renderDogfoodMarkdown(summary) { return [`# ARD Dogfood Summary`, ``, `Run: ${summary.runId}`, ``, `Source lanes used: ${summary.research.sourceLanesUsed.join(", ")}`, `Candidates found: ${summary.research.candidatesFound}`, `Repeated candidates: ${summary.research.repeatedCandidates}`, `Low-signal collapsed: ${summary.research.lowSignalCollapsed}`, `Branch eligible: ${summary.protection.branchEligible}`, `Work packages: ${summary.giving.workPackages.length}`, `Changes by ARD: ${summary.changesByArd.result}`, ``, `Main remains protected. Dangerous findings are visible and excluded from Giving AI.`].join("\n") + "\n"; }

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}`) {
  const result = await runArdDogfood({ rootDir: defaultRootDir });
  console.log(JSON.stringify({
    ok: result.ok,
    runId: result.runId,
    sourceLanesUsed: result.research.sourceLanesUsed,
    candidatesFound: result.research.candidatesFound,
    repeatedCandidates: result.research.repeatedCandidates,
    lowSignalCollapsed: result.research.lowSignalCollapsed,
    categories: result.research.categories,
    branchEligible: result.protection.branchEligible,
    reviewArtifactOnly: result.protection.reviewArtifactOnly,
    workPackages: result.giving.workPackages.map((workPackage) => ({ workPackageId: workPackage.workPackageId, title: workPackage.title, filesToChange: workPackage.filesToChange, testsToRun: workPackage.testsToRun })),
    changesByArd: result.changesByArd.result,
    exactFiles: result.changesByArd.preview.exactFiles,
    limitations: result.limitations
  }, null, 2));
}
