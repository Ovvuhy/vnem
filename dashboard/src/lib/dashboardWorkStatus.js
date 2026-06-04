import { deriveImprovementMission } from "./improvementMissions.js";

const staleAfterMs = 10 * 60 * 1000;

export function deriveDashboardWorkStatus({ telemetry = {}, summary = null, execution = {}, connector = null, branchPreview = null, now = Date.now() } = {}) {
  const mission = deriveImprovementMission({ telemetry, summary, branchPreview });
  const candidates = mission.candidates ?? [];
  const provider = telemetry.intelligenceProvider ?? {};
  const backendLive = telemetry.status === "connected";
  const dataMode = backendLive ? "live" : summary ? "sample-or-summary" : "offline";
  const routeErrors = telemetry.routeErrors ?? summary?.errors ?? [];
  const lastResearch = lastResearchEvent({ telemetry, candidates, summary });
  const lastResearchAgeMs = lastResearch?.timestamp ? Math.max(0, now - Date.parse(lastResearch.timestamp)) : null;
  const staleTelemetry = Boolean(lastResearchAgeMs && lastResearchAgeMs > staleAfterMs);
  const triage = mergeBackendReviewQueue(deriveCandidateTriage(candidates), telemetry.reviewQueue);
  const blocker = deriveBlocker({ backendLive, provider, routeErrors, mission, triage, branchPreview, staleTelemetry, dataMode });
  const status = deriveRealStatus({ backendLive, provider, mission, triage, branchPreview, blocker, dataMode });

  return {
    mission,
    status,
    dataMode,
    backendLive,
    providerStatus: provider.status ?? "missing_key",
    providerLabel: providerLabel(provider),
    routeErrors: routeErrors.length,
    activeStage: status.stage,
    blocker,
    nextAction: blocker.nextAction,
    triage,
    topCandidates: triage.topCandidates,
    research: {
      state: researchState({ backendLive, provider, execution, candidates, routeErrors, staleTelemetry, dataMode }),
      currentRoute: mission.researchTargets?.[0]?.label ?? "No route selected",
      lastEvent: lastResearch,
      lastEventAgeLabel: formatAge(lastResearchAgeMs),
      stale: staleTelemetry,
      routeErrors: routeErrors.length
    },
    protection: {
      state: protectionState({ candidates, triage }),
      reviewed: candidates.length,
      waiting: triage.counts.needsReview,
      metadataOnly: true,
      summary: protectionSummary(triage)
    },
    giving: {
      branchEligible: triage.branchEligible,
      branchName: mission.givingBranch.name,
      branchStatus: mission.givingBranch.status,
      previewAvailable: backendLive && triage.branchEligible > 0,
      previewStatus: mission.givingBranch.previewStatus ?? "not-requested",
      prepareEndpoint: true,
      prepareEnabled: backendLive && branchPreview?.ok !== false && branchPreview?.branchName && triage.branchEligible > 0,
      prepareDisabledReason: !backendLive
        ? "Backend offline; branch writes disabled."
        : triage.branchEligible === 0
          ? "No branch-eligible candidates have passed Protection/review gates."
          : branchPreview?.ok === false
            ? "Latest branch preview failed; fix the rejection first."
            : branchPreview?.branchName
              ? "Exact branch-name confirmation is required before preparing the Giving branch."
              : "Run backend preview before preparing a branch.",
      pushStatus: mission.givingBranch.pushStatus,
      reviewStatus: mission.givingBranch.reviewStatus
    }
  };
}

export function deriveCandidateTriage(candidates = []) {
  const buckets = {
    alreadyIndexed: 0,
    missingLicense: 0,
    weakSource: 0,
    duplicateOrLowSignal: 0,
    needsPrimarySource: 0,
    suspiciousPackage: 0,
    blocked: 0,
    quarantined: 0
  };
  const seenTitles = new Set();
  const annotated = candidates.map((candidate) => {
    const reasons = triageReasons(candidate, seenTitles);
    for (const reason of reasons) {
      if (reason.key && Object.hasOwn(buckets, reason.key)) buckets[reason.key] += 1;
    }
    return {
      ...candidate,
      triageReasons: reasons,
      branchEligible: Boolean(candidate.branchReady),
      score: candidateScore(candidate, reasons),
      whyNotBranchEligible: candidate.branchReady ? "Ready for branch preview." : whyNotEligible(candidate, reasons),
      nextAction: candidate.branchReady ? "Preview a Giving branch plan." : candidateNextAction(candidate, reasons)
    };
  });
  const counts = annotated.reduce((acc, candidate) => {
    acc.total += 1;
    if (candidate.verdict === "allow") acc.allow += 1;
    if (candidate.verdict === "needs-review") acc.needsReview += 1;
    if (candidate.verdict === "quarantine") acc.quarantine += 1;
    if (candidate.verdict === "blocked") acc.blocked += 1;
    if (candidate.branchEligible) acc.branchEligible += 1;
    return acc;
  }, { total: 0, allow: 0, needsReview: 0, quarantine: 0, blocked: 0, branchEligible: 0 });

  const topCandidates = annotated
    .slice()
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return {
    total: counts.total,
    branchEligible: counts.branchEligible,
    topReviewCandidates: topCandidates.length,
    counts,
    ...buckets,
    topCandidates,
    branchReadyCandidates: topCandidates.filter((candidate) => candidate.branchEligible),
    nextAction: counts.branchEligible > 0
      ? "Preview a Giving branch with the branch-eligible candidates."
      : topCandidates.length > 0
        ? `Review top ${topCandidates.length} candidates instead of all ${counts.total}.`
        : "Start a focused research mission to produce candidates."
  };
}

function mergeBackendReviewQueue(localTriage, reviewQueue) {
  if (!reviewQueue?.ok) return localTriage;
  const topReview = normalizeQueueCandidates(reviewQueue.topReviewCandidates ?? []);
  const topBranch = normalizeQueueCandidates(reviewQueue.topBranchCandidates ?? [], true);
  const topCandidates = [...topBranch, ...topReview].slice(0, 5);
  const counts = {
    total: reviewQueue.totalFound ?? localTriage.counts.total,
    allow: reviewQueue.branchEligible ?? localTriage.counts.allow,
    needsReview: Math.max(0, (reviewQueue.totalFound ?? 0) - (reviewQueue.branchEligible ?? 0) - (reviewQueue.blocked ?? 0) - (reviewQueue.quarantined ?? 0) - (reviewQueue.alreadyIndexed ?? 0) - (reviewQueue.duplicateCandidates ?? 0) - (reviewQueue.hiddenLowSignal ?? 0)),
    quarantine: reviewQueue.quarantined ?? localTriage.counts.quarantine,
    blocked: reviewQueue.blocked ?? localTriage.counts.blocked,
    branchEligible: reviewQueue.branchEligible ?? localTriage.counts.branchEligible
  };
  return {
    ...localTriage,
    total: reviewQueue.totalFound ?? localTriage.total,
    branchEligible: reviewQueue.branchEligible ?? localTriage.branchEligible,
    topReviewCandidates: topReview.length,
    counts,
    alreadyIndexed: reviewQueue.alreadyIndexed ?? localTriage.alreadyIndexed,
    missingLicense: reviewQueue.missingLicense ?? localTriage.missingLicense,
    weakSource: reviewQueue.needsPrimarySource ?? localTriage.weakSource,
    duplicateOrLowSignal: (reviewQueue.duplicateCandidates ?? 0) + (reviewQueue.hiddenLowSignal ?? 0) + (reviewQueue.rejected ?? 0),
    needsPrimarySource: reviewQueue.needsPrimarySource ?? localTriage.needsPrimarySource,
    suspiciousPackage: reviewQueue.suspicious ?? localTriage.suspiciousPackage,
    blocked: reviewQueue.blocked ?? localTriage.blocked,
    quarantined: reviewQueue.quarantined ?? localTriage.quarantined,
    hiddenLowSignal: reviewQueue.hiddenLowSignal ?? 0,
    duplicateCandidates: reviewQueue.duplicateCandidates ?? 0,
    rejected: reviewQueue.rejected ?? 0,
    topCandidates,
    branchReadyCandidates: topBranch,
    recommendedAction: reviewQueue.recommendedAction,
    reason: reviewQueue.reason,
    nextAction: reviewQueue.recommendedAction === "preview-branch"
      ? "Preview the Giving branch with branch-ready candidates."
      : reviewQueue.recommendedAction === "review-top-candidates"
        ? `${reviewQueue.totalFound} candidates exist; review the top ${topReview.length || 5} first while VNEM groups the rest.`
        : reviewQueue.reason ?? localTriage.nextAction
  };
}

function normalizeQueueCandidates(candidates = [], branchReady = false) {
  return candidates.map((candidate) => {
    const enrichment = candidate.enrichment ?? {};
    const reasons = (candidate.queueReasons ?? []).map((reason) => ({ key: String(reason).replace(/[^a-z0-9]+/gi, "-"), label: String(reason) }));
    const summary = reasons.map((reason) => reason.label).join("; ") || (enrichment.enrichmentReasons ?? []).map(String).join("; ") || "Backend-enriched pipeline candidate.";
    return {
      id: candidate.id,
      title: candidate.title,
      summary,
      verdict: candidate.verdict,
      verdictLabel: candidate.verdict === "allow" ? "Allowed" : candidate.verdict === "needs-review" ? "Needs review" : candidate.verdict,
      verdictTone: candidate.verdict === "allow" ? "ok" : candidate.verdict === "blocked" ? "critical" : "review",
      sourceRoute: candidate.sourceRoute ?? enrichment.sourceRoute ?? "backend-review-queue",
      trustScore: enrichment.trustScore ?? 0,
      threatScore: enrichment.riskScore ?? 0,
      branchEligible: Boolean(candidate.branchEligible || branchReady),
      branchReady: Boolean(candidate.branchEligible || branchReady),
      reviewRequiredForGiving: candidate.verdict === "needs-review" && !candidate.reviewSatisfied,
      userReviewSatisfied: Boolean(candidate.reviewSatisfied),
      whyNotBranchEligible: candidate.branchEligible || branchReady ? "Ready for branch preview." : reasons[0]?.label ?? "Manual review required.",
      nextAction: candidate.branchEligible || branchReady ? "Preview a Giving branch plan." : "Review source, license, permissions, and install surface.",
      triageReasons: reasons,
      raw: candidate
    };
  });
}

function deriveRealStatus({ backendLive, provider, mission, triage, branchPreview, blocker, dataMode }) {
  if (!backendLive) return { key: "backend-offline", label: "Backend offline", tone: "review", stage: "idle" };
  if (provider?.status === "paused_for_backoff") return { key: "provider-backoff", label: "Provider backoff", tone: "critical", stage: "research" };
  if (branchPreview?.pushStatus === "pushed") return { key: "branch-pushed", label: "Branch pushed", tone: "ok", stage: "review" };
  if (branchPreview?.commitHash) return { key: "branch-prepared", label: "Branch prepared", tone: "ok", stage: "branch" };
  if (mission.givingBranch.previewStatus === "ready") return { key: "branch-preview-ready", label: "Branch preview ready", tone: "ok", stage: "branch" };
  if (triage.branchEligible > 0) return { key: "ready-for-branch-preview", label: "Ready for branch preview", tone: "ok", stage: "giving" };
  if (blocker.key === "all-need-review") return { key: "waiting-for-review", label: "Waiting for review", tone: "review", stage: "protection" };
  if (mission.status === "protecting") return { key: "protection-reviewing", label: "Protection reviewing", tone: "review", stage: "protection" };
  if (mission.status === "researching") return { key: "researching", label: dataMode === "live" ? "Researching" : "Idle", tone: dataMode === "live" ? "ok" : "quiet", stage: "research" };
  if (mission.status === "blocked") return { key: "blocked", label: "Blocked", tone: "critical", stage: "protection" };
  return { key: "idle", label: "Idle", tone: "quiet", stage: "idle" };
}

function deriveBlocker({ backendLive, provider, routeErrors, mission, triage, branchPreview, staleTelemetry, dataMode }) {
  if (!backendLive) {
    return { key: "backend-offline", reason: "The local VNEM app server is not connected, so live AI actions are disabled.", nextAction: "Start the local app server, then redeploy the mission." };
  }
  if (provider?.status === "paused_for_backoff") {
    return { key: "provider-backoff", reason: "OpenRouter is in backoff; VNEM is waiting before another provider request.", nextAction: "Wait for the backoff window or use deterministic fallback results honestly." };
  }
  if (routeErrors.length > 0) {
    return { key: "route-errors", reason: `${routeErrors.length} source route issue${routeErrors.length === 1 ? "" : "s"} reduced current research coverage.`, nextAction: "Inspect route errors before trusting the latest scan completely." };
  }
  if (staleTelemetry && dataMode === "live") {
    return { key: "stale-telemetry", reason: "Live telemetry is connected, but the last real research event is stale.", nextAction: "Redeploy the current mission or wait for the next cruise cycle." };
  }
  if (branchPreview?.ok === false) {
    return { key: "preview-rejected", reason: branchPreview.message ?? "Backend branch preview rejected the current plan.", nextAction: "Fix the preview rejection before preparing a branch." };
  }
  if (triage.branchEligible === 0 && triage.counts.needsReview > 0) {
    return { key: "all-need-review", reason: `All ${triage.counts.needsReview} reviewable candidates still need source/license/install-surface confidence before branch work.`, nextAction: triage.nextAction };
  }
  if (triage.counts.quarantine + triage.counts.blocked > 0 && triage.branchEligible === 0) {
    return { key: "isolated-by-protection", reason: "Protection AI isolated the available candidates from Giving AI.", nextAction: "Do not prepare a branch; audit or discard isolated candidates." };
  }
  if (triage.branchEligible > 0 && mission.givingBranch.previewStatus !== "ready") {
    return { key: "preview-not-run", reason: `${triage.branchEligible} candidate${triage.branchEligible === 1 ? " is" : "s are"} branch-eligible, but no backend preview has run yet.`, nextAction: "Preview branch plan." };
  }
  if (mission.givingBranch.previewStatus === "ready") {
    return { key: "prepare-confirmation-required", reason: "Branch preview is ready; branch writes still need exact owner confirmation.", nextAction: "Type the exact branch name or prepare-giving-branch in the prepare modal, then run backend validation and push only the review branch." };
  }
  return { key: "no-blocker", reason: "No hard blocker is visible in current state.", nextAction: mission.nextAction };
}

function triageReasons(candidate, seenTitles) {
  const reasons = [];
  const titleKey = String(candidate.title ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const raw = candidate.raw ?? candidate;
  const flags = raw.risk_flags ?? raw.repository_review?.flags ?? raw.protection_report?.flags ?? candidate.flags ?? [];
  const flagText = flags.map((flag) => String(flag).toLowerCase());
  const sourceRoute = candidate.sourceRoute ?? candidate.source_route;
  if (candidate.status === "already-indexed" || raw.reason === "already-indexed") reasons.push({ key: "alreadyIndexed", label: "Already indexed" });
  if (seenTitles.has(titleKey) && titleKey) reasons.push({ key: "duplicateOrLowSignal", label: "Likely duplicate" });
  else if (titleKey) seenTitles.add(titleKey);
  if (flagText.includes("missing-license") || flagText.includes("license-not-asserted") || raw.metrics?.license === null) reasons.push({ key: "missingLicense", label: "Missing license" });
  if (flagText.includes("weak-source") || flagText.includes("social-signal") || sourceRoute === "hacker-news") reasons.push({ key: "weakSource", label: "Weak/source-social signal" });
  if (flagText.includes("needs-primary-source")) reasons.push({ key: "needsPrimarySource", label: "Needs primary source" });
  if (flagText.some((flag) => ["binary-download", "privileged-command", "unknown-install-surface", "postinstall-script", "lifecycle-script"].includes(flag))) reasons.push({ key: "suspiciousPackage", label: "Suspicious package/install surface" });
  if (candidate.verdict === "quarantine") reasons.push({ key: "quarantined", label: "Quarantined" });
  if (candidate.verdict === "blocked") reasons.push({ key: "blocked", label: "Blocked" });
  if (candidate.verdict === "needs-review" && reasons.length === 0) reasons.push({ key: "weakSource", label: "Metadata confidence incomplete" });
  return reasons;
}

function candidateScore(candidate, reasons) {
  let score = 0;
  if (candidate.branchReady) score += 1000;
  if (candidate.verdict === "allow") score += 600;
  if (candidate.verdict === "needs-review") score += 300;
  score += Number(candidate.trustScore ?? 0) * 2;
  score -= Number(candidate.threatScore ?? 0) * 3;
  score -= reasons.length * 12;
  if (candidate.sourceRoute === "github-search" || candidate.sourceRoute === "github-releases") score += 40;
  if (candidate.stagedDispatch) score += 80;
  if (candidate.verdict === "quarantine") score -= 500;
  if (candidate.verdict === "blocked") score -= 1000;
  return score;
}

function whyNotEligible(candidate, reasons) {
  if (candidate.verdict === "blocked") return "Blocked by Protection AI.";
  if (candidate.verdict === "quarantine") return "Quarantined from Giving AI.";
  if (candidate.reviewRequiredForGiving && !candidate.userReviewSatisfied) return reasons.map((reason) => reason.label).slice(0, 2).join("; ") || "Maintainer review required.";
  return "Not branch-ready yet.";
}

function candidateNextAction(candidate, reasons) {
  if (candidate.verdict === "blocked") return "Do not use.";
  if (candidate.verdict === "quarantine") return "Keep isolated for audit.";
  if (reasons.some((reason) => reason.key === "needsPrimarySource")) return "Find and review the primary source.";
  if (reasons.some((reason) => reason.key === "missingLicense")) return "Check license and provenance.";
  if (reasons.some((reason) => reason.key === "suspiciousPackage")) return "Audit install surface before use.";
  return "Review source, license, permissions, and install surface.";
}

function lastResearchEvent({ telemetry, candidates, summary }) {
  const events = [
    ...(telemetry.events ?? []).filter((event) => event.agent_stage === "research" || /research|discovered|source/i.test(event.message ?? "")),
    ...candidates.map((candidate) => ({ timestamp: candidate.raw?.latest_event?.timestamp ?? candidate.raw?.generated_at, message: candidate.summary, route: candidate.sourceRoute })),
    ...(summary?.runs ?? []).map((run) => ({ timestamp: run.generated_at, message: `${run.candidates} candidates from ${run.source_routes?.join(", ") ?? "routes"}` }))
  ].filter((event) => event.timestamp);
  events.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
  const event = events[0];
  if (!event) return null;
  return {
    timestamp: event.timestamp,
    message: event.message ?? "Research event received.",
    route: event.route ?? event.source_route ?? "unknown-route"
  };
}

function researchState({ backendLive, provider, execution, candidates, routeErrors, staleTelemetry, dataMode }) {
  if (!backendLive) return "offline";
  if (provider?.status === "paused_for_backoff") return "waiting for provider backoff";
  if (routeErrors.length > 0) return "source routes need attention";
  if (execution?.active?.current_agent === "research") return "actively searching";
  if (staleTelemetry) return "stale; redeploy recommended";
  if (candidates.length > 0) return "done with current mission";
  return dataMode === "live" ? "ready to research" : "sample/fallback only";
}

function protectionState({ candidates, triage }) {
  if (candidates.length === 0) return "waiting for candidates";
  if (triage.counts.blocked > 0 || triage.counts.quarantine > 0) return "isolating risky candidates";
  if (triage.counts.needsReview > 0 && triage.branchEligible === 0) return "metadata review found open questions";
  if (triage.branchEligible > 0) return "branch candidates available";
  return "reviewing metadata";
}

function protectionSummary(triage) {
  if (triage.total === 0) return "No candidates have reached Protection AI yet.";
  if (triage.branchEligible === 0 && triage.counts.needsReview > 0) {
    return `Protection is metadata-level only. ${triage.counts.needsReview} candidates need review; focus on the top ${triage.topReviewCandidates}.`;
  }
  return `Reviewed ${triage.total}; ${triage.branchEligible} are branch-eligible under current checks.`;
}

function providerLabel(provider) {
  if (provider?.status === "active") return `OpenRouter active (${provider.model ?? "model unknown"})`;
  if (provider?.status === "paused_for_backoff") return "OpenRouter backoff; fallback/queue active";
  if (provider?.status === "rate_limited") return "OpenRouter rate-limited; fallback active";
  if (provider?.status === "missing_key") return "Local deterministic fallback";
  return provider?.status ?? "unknown provider state";
}

function formatAge(ms) {
  if (ms === null || !Number.isFinite(ms)) return "no real research event yet";
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`;
  return `${Math.round(ms / 86_400_000)}d ago`;
}
