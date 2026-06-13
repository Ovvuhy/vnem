import { deriveDashboardWorkStatus } from "./dashboardWorkStatus.js";
import { deriveBuilderHealth } from "./builderHealth.js";

const laneOrder = [
  ["branchReady", "Branch-ready"],
  ["needsReview", "Needs review"],
  ["missingLicense", "Missing license"],
  ["needsPrimarySource", "Needs primary source"],
  ["weakSource", "Weak source"],
  ["duplicateLowSignal", "Duplicate / low signal"],
  ["alreadyIndexed", "Already indexed"],
  ["rejected", "Rejected"],
  ["quarantined", "Quarantined"],
  ["blocked", "Blocked"]
];

export function deriveControlRoomStatus({ telemetry = {}, summary = null, execution = {}, connector = null, branchPreview = null, workStatus = null, builderHealthState = null, now = Date.now() } = {}) {
  const derivedWorkStatus = workStatus ?? deriveDashboardWorkStatus({ telemetry, summary, execution, connector, branchPreview, now });
  const reviewQueue = telemetry.reviewQueue?.ok ? telemetry.reviewQueue : null;
  const queueCandidates = normalizeQueueCandidates(reviewQueue?.candidates ?? []);
  const topBranch = normalizeQueueCandidates(reviewQueue?.topBranchCandidates ?? []).map((candidate) => ({ ...candidate, branchEligible: true }));
  const topReview = normalizeQueueCandidates(reviewQueue?.topReviewCandidates ?? []);
  const missionCandidates = (derivedWorkStatus.mission?.candidates ?? []).map(normalizeMissionCandidate);
  const sourceCandidates = reviewQueue ? [...queueCandidates, ...topBranch, ...topReview] : missionCandidates;
  const candidates = mergeCandidates(sourceCandidates);
  const lanes = buildReviewLanes(candidates, reviewQueue, derivedWorkStatus);
  const branchWorkbench = buildBranchWorkbench({ workStatus: derivedWorkStatus, branchPreview, telemetry, reviewQueue, candidates });
  const run = buildRun({ workStatus: derivedWorkStatus, reviewQueue, branchWorkbench, now });
  const nextAction = buildNextAction({ workStatus: derivedWorkStatus, lanes, branchWorkbench });
  const timeline = buildTimeline({ telemetry, candidates, branchWorkbench, run, branchPreview });

  return {
    ok: true,
    run,
    overview: {
      missionTitle: run.missionTitle,
      currentStage: run.currentStage,
      backendState: run.backendStatus,
      providerState: run.providerStatus,
      dataMode: run.dataMode,
      candidatesFound: run.candidatesFound,
      branchReady: run.branchReady,
      needsReview: run.reviewNeeded,
      isolated: run.blocked + run.quarantined,
      safeBranchStatus: branchWorkbench.status,
      topBlocker: derivedWorkStatus.blocker.reason,
      nextSafeAction: nextAction.label,
      statusLabel: run.status
    },
    reviewInbox: {
      summary: {
        found: run.candidatesFound,
        branchReady: lanes.branchReady.count,
        worthReviewingFirst: lanes.needsReview.items.length,
        alreadyIndexed: lanes.alreadyIndexed.count,
        lowSignalHidden: lanes.duplicateLowSignal.count,
        quarantined: lanes.quarantined.count,
        blocked: lanes.blocked.count,
        missingLicense: lanes.missingLicense.count,
        needsPrimarySource: lanes.needsPrimarySource.count,
        rejected: lanes.rejected.count
      },
      lanes,
      topReviewCandidates: lanes.needsReview.items,
      branchReadyCandidates: lanes.branchReady.items,
      collapsedGroupCount: lanes.duplicateLowSignal.count + lanes.alreadyIndexed.count + lanes.rejected.count
    },
    branchWorkbench,
    builderHealth: deriveBuilderHealth({
      builderSession: builderHealthState?.session ?? null,
      source: builderHealthState?.source,
      status: builderHealthState?.status,
      error: builderHealthState?.error,
      lastCheckedAt: builderHealthState?.lastCheckedAt
    }),
    timeline,
    nextAction,
    rawTelemetrySecondary: true,
    workStatus: derivedWorkStatus
  };
}

export function buildReviewLanes(candidates = [], reviewQueue = null, workStatus = {}) {
  const lanes = Object.fromEntries(laneOrder.map(([key, label]) => [key, { key, label, count: 0, items: [] }]));
  for (const candidate of candidates) {
    const laneKeys = laneKeysForCandidate(candidate);
    for (const key of laneKeys) {
      lanes[key].count += 1;
      if (lanes[key].items.length < (key === "branchReady" || key === "needsReview" ? 5 : 3)) {
        lanes[key].items.push(candidate);
      }
    }
  }
  if (reviewQueue?.ok) {
    lanes.branchReady.count = Math.max(lanes.branchReady.count, reviewQueue.branchEligible ?? 0);
    lanes.alreadyIndexed.count = Math.max(lanes.alreadyIndexed.count, reviewQueue.alreadyIndexed ?? 0);
    lanes.duplicateLowSignal.count = Math.max(lanes.duplicateLowSignal.count, (reviewQueue.duplicateCandidates ?? 0) + (reviewQueue.hiddenLowSignal ?? 0));
    lanes.rejected.count = Math.max(lanes.rejected.count, reviewQueue.rejected ?? 0);
    lanes.quarantined.count = Math.max(lanes.quarantined.count, reviewQueue.quarantined ?? 0);
    lanes.blocked.count = Math.max(lanes.blocked.count, reviewQueue.blocked ?? 0);
    lanes.missingLicense.count = Math.max(lanes.missingLicense.count, reviewQueue.missingLicense ?? 0);
    lanes.needsPrimarySource.count = Math.max(lanes.needsPrimarySource.count, reviewQueue.needsPrimarySource ?? 0);
  } else if (workStatus?.triage) {
    lanes.branchReady.count = Math.max(lanes.branchReady.count, workStatus.triage.branchEligible ?? 0);
    lanes.alreadyIndexed.count = Math.max(lanes.alreadyIndexed.count, workStatus.triage.alreadyIndexed ?? 0);
    lanes.duplicateLowSignal.count = Math.max(lanes.duplicateLowSignal.count, workStatus.triage.duplicateOrLowSignal ?? 0);
    lanes.quarantined.count = Math.max(lanes.quarantined.count, workStatus.triage.quarantined ?? 0);
    lanes.blocked.count = Math.max(lanes.blocked.count, workStatus.triage.blocked ?? 0);
    lanes.missingLicense.count = Math.max(lanes.missingLicense.count, workStatus.triage.missingLicense ?? 0);
    lanes.needsPrimarySource.count = Math.max(lanes.needsPrimarySource.count, workStatus.triage.needsPrimarySource ?? 0);
  }
  return lanes;
}

function buildRun({ workStatus, reviewQueue, branchWorkbench, now }) {
  const mission = workStatus.mission ?? {};
  const lastEvent = workStatus.research?.lastEvent;
  const updatedAt = lastEvent?.timestamp ?? new Date(now).toISOString();
  return {
    runId: mission.id ?? "implementation-improvement-run",
    missionTitle: mission.title ?? "VNEM implementation improvement mission",
    goal: mission.goal ?? "Improve this VNEM implementation safely through Research, Protection, Review, Giving, branch validation, and manual review.",
    status: controlRoomStatusLabel(workStatus, branchWorkbench),
    startedAt: mission.startedAt ?? null,
    updatedAt,
    currentStage: workStatus.activeStage ?? "idle",
    backendStatus: workStatus.backendLive ? "live" : "offline",
    providerStatus: workStatus.providerLabel ?? workStatus.providerStatus ?? "unknown",
    dataMode: workStatus.dataMode ?? "offline",
    candidatesFound: reviewQueue?.totalFound ?? workStatus.triage?.total ?? mission.candidates?.length ?? 0,
    branchReady: workStatus.triage?.branchEligible ?? 0,
    reviewNeeded: workStatus.triage?.counts?.needsReview ?? 0,
    blocked: workStatus.triage?.blocked ?? workStatus.triage?.counts?.blocked ?? 0,
    quarantined: workStatus.triage?.quarantined ?? workStatus.triage?.counts?.quarantine ?? 0,
    nextAction: workStatus.nextAction
  };
}

function buildBranchWorkbench({ workStatus, branchPreview, telemetry, reviewQueue, candidates }) {
  const branch = workStatus.giving ?? {};
  const missionBranch = workStatus.mission?.givingBranch ?? {};
  const includedCandidates = branchPreview?.includedCandidates ?? missionBranch.requestPayload?.includedCandidates ?? candidates.filter((candidate) => candidate.branchEligible).map(toBranchPayload);
  const excludedCandidates = branchPreview?.excludedCandidates ?? missionBranch.requestPayload?.excludedCandidates ?? candidates.filter((candidate) => !candidate.branchEligible).map(toBranchPayload);
  const blockedIncluded = includedCandidates.filter((candidate) => ["blocked", "quarantine"].includes(candidate.verdict));
  const unreviewedIncluded = includedCandidates.filter((candidate) => candidate.verdict === "needs-review" && !candidate.reviewSatisfied);
  const validationCommands = branchPreview?.validationCommands ?? missionBranch.validationCommands ?? missionBranch.requestPayload?.validationCommands ?? ["npm run test:dashboard-control-room", "npm run dashboard:build"];
  const baseBranch = branchPreview?.baseBranch ?? missionBranch.base ?? "main";
  const branchName = branchPreview?.branchName ?? branch.branchName ?? missionBranch.name ?? "vnem-giving/pending";
  return {
    branchName,
    baseBranch,
    validBranchName: String(branchName).startsWith("vnem-giving/"),
    validBaseBranch: baseBranch === "main",
    includedCandidates,
    excludedCandidates,
    exclusionReasons: Object.fromEntries(excludedCandidates.map((candidate) => [candidate.id, candidate.whyNotBranchEligible ?? candidate.reason ?? "not branch-eligible"])),
    validationCommands,
    previewStatus: branchPreview?.ok ? "ready" : branchPreview?.ok === false ? "failed" : branch.previewStatus ?? "not-requested",
    prepareConfirmationStatus: branch.prepareEnabled ? "exact-confirmation-required" : "locked",
    status: branchPreview?.pushStatus === "pushed" ? "branch pushed" : branchPreview?.commitHash ? "branch prepared" : branchPreview?.ok ? "preview ready" : branch.branchStatus ?? missionBranch.status ?? "not-created",
    commitHash: branchPreview?.commitHash ?? missionBranch.commit ?? null,
    pushStatus: branchPreview?.pushStatus ?? branch.pushStatus ?? "not-pushed",
    manualReviewStatus: branchPreview?.reviewStatus ?? branch.reviewStatus ?? "waiting-for-manual-review",
    canPreview: Boolean(workStatus.backendLive && (workStatus.triage?.branchEligible ?? 0) > 0),
    canPrepare: Boolean(workStatus.giving?.prepareEnabled && branchPreview?.ok !== false),
    reason: branch.prepareDisabledReason ?? "Run branch preview before preparing a Giving branch.",
    guards: {
      noBlockedCandidates: blockedIncluded.length === 0,
      noQuarantinedCandidates: blockedIncluded.every((candidate) => candidate.verdict !== "quarantine"),
      noUnreviewedNeedsReview: unreviewedIncluded.length === 0,
      previewBeforePrepare: Boolean(branchPreview?.ok || branch.previewStatus === "ready"),
      noMergeToMain: true
    },
    checklist: manualChecklist(branchPreview, telemetry)
  };
}

function buildNextAction({ workStatus, lanes, branchWorkbench }) {
  if (!workStatus.backendLive) return { key: "start-backend", label: "Start backend", detail: "Backend offline. Start the local VNEM app server to run live self-improvement.", enabled: false };
  if (workStatus.providerStatus === "paused_for_backoff") return { key: "wait-provider", label: "Wait for provider backoff", detail: "OpenRouter is paused; queued work should continue after retry.", enabled: false };
  if ((workStatus.triage?.total ?? 0) === 0) return { key: "start-research", label: "Start research mission", detail: "No candidates are available yet.", enabled: true };
  if (branchWorkbench.pushStatus === "pushed") return { key: "manual-review", label: "Manual review required", detail: "Inspect the pushed branch before any manual merge.", enabled: false };
  if (branchWorkbench.commitHash) return { key: "manual-review", label: "Run manual review checklist", detail: "Branch was prepared; manually inspect files, plan, candidates, and validation.", enabled: false };
  if (branchWorkbench.previewStatus === "ready" && branchWorkbench.canPrepare) return { key: "open-prepare", label: "Open prepare confirmation", detail: "Exact branch-name confirmation is required before backend prepare.", enabled: true };
  if ((workStatus.triage?.branchEligible ?? 0) > 0) return { key: "preview-branch", label: "Preview Giving branch", detail: "Preview the branch plan without mutating git.", enabled: true };
  if ((lanes.blocked.count + lanes.quarantined.count) > 0 && (workStatus.triage?.branchEligible ?? 0) === 0 && (lanes.needsReview.count === 0 || (lanes.blocked.count + lanes.quarantined.count) >= (workStatus.triage?.total ?? 0))) return { key: "blocked-only", label: "Nothing can move forward", detail: "Available candidates are blocked/quarantined or grouped as low-signal.", enabled: false };
  if (lanes.needsReview.items.length > 0 || lanes.missingLicense.items.length > 0) return { key: "review-candidate", label: "Review top candidate", detail: "Open the highest-value candidate and write a local review decision.", enabled: true, candidate: lanes.needsReview.items[0] ?? lanes.missingLicense.items[0] };
  if (lanes.blocked.count + lanes.quarantined.count > 0) return { key: "blocked-only", label: "Nothing can move forward", detail: "Available candidates are blocked/quarantined or grouped as low-signal.", enabled: false };
  return { key: "refresh-triage", label: "Refresh triage", detail: "Refresh the review queue and branch candidate set.", enabled: true };
}

function buildTimeline({ telemetry, candidates, branchWorkbench, run, branchPreview }) {
  const rows = [];
  rows.push({ timestamp: run.updatedAt, stage: "mission", title: "Mission state loaded", message: `${run.missionTitle} is at ${run.currentStage}.`, severity: run.backendStatus === "offline" ? "warning" : "info" });
  for (const event of (telemetry.events ?? []).slice(0, 8)) {
    rows.push({ timestamp: event.timestamp ?? null, stage: event.agent_stage ?? event.type ?? "telemetry", title: event.type ?? "Telemetry event", message: event.message ?? "Pipeline event received.", severity: severityForEvent(event), candidateId: event.active_ingestion?.id ?? null, branchName: event.branchName ?? null });
  }
  for (const candidate of candidates.slice(0, 6)) {
    rows.push({ timestamp: candidate.updatedAt ?? null, stage: "protection", title: `${candidate.verdictLabel} verdict`, message: `${candidate.title}: ${candidate.whyNotBranchEligible ?? candidate.verdictReason}`, severity: candidate.verdict === "blocked" ? "critical" : candidate.verdict === "quarantine" ? "warning" : candidate.branchEligible ? "success" : "info", candidateId: candidate.id });
  }
  if (branchPreview) rows.push({ timestamp: new Date().toISOString(), stage: "branch", title: branchPreview.ok ? "Branch preview ready" : "Branch preview failed", message: branchPreview.message ?? branchWorkbench.reason, severity: branchPreview.ok ? "success" : "critical", branchName: branchWorkbench.branchName });
  rows.push({ timestamp: null, stage: "review", title: "Manual review gate", message: "Main remains protected. Merge to main is manual only after checklist review.", severity: "info", branchName: branchWorkbench.branchName });
  return rows.slice(0, 14);
}

function normalizeQueueCandidates(candidates = []) {
  return candidates.map((candidate) => {
    const enrichment = candidate.enrichment ?? {};
    const queueReasons = (candidate.queueReasons ?? []).map(String);
    const verdict = candidate.verdict ?? candidate.pipeline_verdict ?? "needs-review";
    return {
      id: String(candidate.id),
      title: candidate.title ?? "Untitled candidate",
      sourceRoute: candidate.sourceRoute ?? enrichment.sourceRoute ?? "unknown-route",
      sourceUrl: candidate.sourceUrl ?? enrichment.sourceUrl ?? null,
      summary: queueReasons.join("; ") || (enrichment.enrichmentReasons ?? []).join("; ") || "Backend-enriched candidate.",
      verdict,
      verdictLabel: labelForVerdict(verdict),
      verdictTone: toneForVerdict(verdict),
      verdictReason: queueReasons.join("; ") || "Protection metadata requires review.",
      trustScore: numberOrZero(enrichment.trustScore),
      threatScore: numberOrZero(enrichment.riskScore),
      license: enrichment.license ?? null,
      primarySourceFound: Boolean(enrichment.primarySourceFound),
      riskFlags: enrichment.riskFlags ?? [],
      branchEligible: Boolean(candidate.branchEligible) && !["blocked", "quarantine"].includes(verdict),
      reviewSatisfied: Boolean(candidate.reviewSatisfied),
      whyNotBranchEligible: candidate.branchEligible ? "Ready for branch preview." : queueReasons[0] ?? "Manual review required.",
      nextAction: candidate.branchEligible ? "Preview a Giving branch plan." : "Review source, license, permissions, and install surface.",
      queueReasons,
      raw: candidate
    };
  });
}

function normalizeMissionCandidate(candidate = {}) {
  return {
    ...candidate,
    id: String(candidate.id),
    verdict: candidate.verdict ?? "needs-review",
    verdictLabel: candidate.verdictLabel ?? labelForVerdict(candidate.verdict),
    verdictTone: candidate.verdictTone ?? toneForVerdict(candidate.verdict),
    branchEligible: Boolean(candidate.branchReady || candidate.branchEligible) && !["blocked", "quarantine"].includes(candidate.verdict),
    reviewSatisfied: Boolean(candidate.userReviewSatisfied || candidate.reviewSatisfied),
    whyNotBranchEligible: candidate.branchReady ? "Ready for branch preview." : candidate.nextAction ?? "Manual review required.",
    queueReasons: [],
    riskFlags: candidate.raw?.risk_flags ?? candidate.raw?.protection_report?.flags ?? [],
    license: candidate.raw?.enrichment?.license ?? candidate.raw?.repository?.license?.spdx_id ?? candidate.raw?.repository?.license ?? null,
    primarySourceFound: Boolean(candidate.raw?.enrichment?.primarySourceFound || candidate.sourceUrl),
    raw: candidate.raw ?? candidate
  };
}

function mergeCandidates(candidates) {
  const byId = new Map();
  for (const candidate of candidates) {
    if (!candidate?.id) continue;
    byId.set(String(candidate.id), { ...(byId.get(String(candidate.id)) ?? {}), ...candidate });
  }
  return [...byId.values()];
}

function laneKeysForCandidate(candidate) {
  const reasons = (candidate.queueReasons ?? []).join(" ").toLowerCase();
  const keys = [];
  if (candidate.branchEligible) keys.push("branchReady");
  if (candidate.verdict === "needs-review" && !candidate.reviewSatisfied) keys.push("needsReview");
  if (!candidate.license || reasons.includes("missing license")) keys.push("missingLicense");
  if (!candidate.primarySourceFound || reasons.includes("primary source")) keys.push("needsPrimarySource");
  if (reasons.includes("weak") || candidate.sourceRoute === "hacker-news") keys.push("weakSource");
  if (reasons.includes("duplicate") || reasons.includes("low-signal") || reasons.includes("low signal")) keys.push("duplicateLowSignal");
  if (reasons.includes("already indexed")) keys.push("alreadyIndexed");
  if (reasons.includes("rejected") || candidate.rejectedLowSignal) keys.push("rejected");
  if (candidate.verdict === "quarantine") keys.push("quarantined");
  if (candidate.verdict === "blocked") keys.push("blocked");
  if (keys.length === 0 && !candidate.branchEligible) keys.push("needsReview");
  return [...new Set(keys)];
}

function controlRoomStatusLabel(workStatus, branchWorkbench) {
  if (branchWorkbench.pushStatus === "pushed") return "Branch pushed";
  if (branchWorkbench.commitHash) return "Manual review required";
  const map = {
    "backend-offline": "Backend offline",
    "provider-backoff": "Provider backoff",
    "ready-for-branch-preview": "Ready for branch preview",
    "branch-preview-ready": "Branch preview ready",
    "waiting-for-review": "Waiting for manual review",
    "protection-reviewing": "Protection reviewing",
    researching: "Researching",
    blocked: "Blocked",
    idle: "Idle"
  };
  return map[workStatus.status?.key] ?? workStatus.status?.label ?? "Idle";
}

function manualChecklist(branchPreview, telemetry) {
  const validationPassed = branchPreview?.validationStatus === "passed" || branchPreview?.validation?.status === "passed";
  return [
    { key: "inspect-files", label: "inspect changed files", done: false },
    { key: "inspect-plan", label: "inspect branch plan", done: false },
    { key: "included-candidates", label: "inspect included candidates", done: false },
    { key: "no-isolated", label: "confirm no blocked/quarantined candidates", done: false },
    { key: "no-unreviewed", label: "confirm no unreviewed needs-review candidates", done: false },
    { key: "validation", label: "confirm validation passed", done: validationPassed },
    { key: "generated", label: "confirm generated artifacts are expected", done: false },
    { key: "rollback", label: "confirm rollback notes exist", done: Boolean(branchPreview?.rollbackNotes?.length) },
    { key: "manual-main", label: "only then merge to main manually", done: false }
  ];
}

function toBranchPayload(candidate) {
  return { id: candidate.id, title: candidate.title, verdict: candidate.verdict, reviewSatisfied: Boolean(candidate.reviewSatisfied), sourceRoute: candidate.sourceRoute, sourceUrl: candidate.sourceUrl, whyNotBranchEligible: candidate.whyNotBranchEligible };
}
function labelForVerdict(verdict) { return verdict === "allow" ? "Allowed" : verdict === "needs-review" ? "Needs review" : verdict === "quarantine" ? "Quarantined" : verdict === "blocked" ? "Blocked" : "Needs review"; }
function toneForVerdict(verdict) { return verdict === "allow" ? "ok" : verdict === "blocked" ? "critical" : verdict === "quarantine" ? "warning" : "review"; }
function numberOrZero(value) { const number = Number(value); return Number.isFinite(number) ? number : 0; }
function severityForEvent(event) { const type = String(event.type ?? event.agent_stage ?? "").toLowerCase(); if (/error|failed|blocked/.test(type)) return "critical"; if (/quarantine|warning|backoff/.test(type)) return "warning"; if (/approved|prepared|pushed|passed/.test(type)) return "success"; return "info"; }
