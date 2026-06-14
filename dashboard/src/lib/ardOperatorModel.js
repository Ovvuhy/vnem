export const ARD_OPERATOR_SECTION_ORDER = [
  "mission-header",
  "control-center",
  "pipeline-timeline",
  "changes-by-ard",
  "review-queue",
  "ai-status-public-decision-log",
  "findings-evidence",
  "system-health",
  "advanced-raw-details",
  "planned-features"
];

export function deriveArdOperatorModel({
  controlRoom = {},
  pipelineRun = null,
  pipelineStatus = "idle",
  pipelineError = null,
  ardChangesCard = {},
  ardChangesAction = {},
  telemetry = {},
  workStatus = {},
  summary = null,
  builderHealth = null,
  branchPreview = null
} = {}) {
  const run = controlRoom.run ?? {};
  const overview = controlRoom.overview ?? {};
  const inbox = controlRoom.reviewInbox ?? { summary: {}, lanes: {} };
  const branchWorkbench = controlRoom.branchWorkbench ?? {};
  const provider = telemetry.intelligenceProvider ?? {};
  const stageRows = normalizeTimelineStages({ pipelineRun, run, ardChangesCard, branchWorkbench, inbox });
  const reviewQueue = normalizeReviewQueue(inbox, { pipelineRun });
  const researchState = normalizeResearchState({ pipelineRun, reviewQueue });
  const findings = normalizeFindings({ pipelineRun, inbox, summary });
  const aiStatus = normalizeAiStatus({ provider, run, pipelineRun, telemetry, workStatus });
  const publicDecisionLog = normalizeDecisionLog({ telemetry, pipelineRun, controlRoom, ardChangesCard, findings });
  const systemHealth = normalizeSystemHealth({ telemetry, run, builderHealth: controlRoom.builderHealth ?? builderHealth, summary });
  const changesByArd = {
    displayName: ardChangesCard.displayName ?? "Changes by ARD",
    branchName: ardChangesCard.branchName ?? "changes-by-ard",
    mainProtected: ardChangesCard.mainProtected !== false,
    mode: ardChangesCard.mode ?? "dry-run",
    statusLabel: ardChangesCard.statusLabel ?? "not prepared",
    warningCopy: ardChangesCard.warningCopy ?? "Main stays protected. Review changes before merging.",
    requiredConfirmation: ardChangesCard.requiredConfirmation ?? "I understand ARD will push changes to the Changes by ARD branch, not main.",
    buttonLabels: ardChangesCard.buttonLabels ?? {
      preview: "Preview ARD changes",
      prepare: "Prepare Changes by ARD commit",
      push: "Push Changes by ARD branch"
    },
    lastPreview: ardChangesCard.lastPreview ?? null,
    lastPrepared: ardChangesCard.lastPrepared ?? null,
    lastPushed: ardChangesCard.lastPushed ?? null,
    selectedWorkPackage: ardChangesCard.lastPreview?.selectedWorkPackage ?? pipelineRun?.giving?.workPackages?.[0] ?? null,
    exactFiles: ardChangesCard.lastPreview?.exactFiles ?? pipelineRun?.giving?.workPackages?.[0]?.filesToChange ?? [],
    preparedCommit: ardChangesCard.lastPrepared?.commitHash ?? null,
    pushedCommit: ardChangesCard.lastPushed?.commitHash ?? null,
    blockedReason: ardChangesCard.lastPreview?.blockedReason ?? null,
    actionLabel: ardChangesAction?.label ?? "Changes by ARD ready",
    mainPushAllowed: false,
    autoMergeAllowed: false
  };
  const included = Number(pipelineRun?.giving?.included ?? overview.branchReady ?? reviewQueue.branchReadyCount ?? 0);
  const excluded = Number(pipelineRun?.giving?.excluded ?? reviewQueue.excludedCount ?? findings.dangerous.length);
  const controlCenter = {
    title: "ARD Control Center",
    status: pipelineRun?.status ?? pipelineStatus ?? run.status ?? "idle",
    currentStage: run.currentStage ?? workStatus.activeStage ?? "idle",
    nextAction: controlRoom.nextAction?.label ?? overview.nextSafeAction ?? "Run ARD pipeline",
    nextActionDetail: controlRoom.nextAction?.detail ?? overview.topBlocker ?? "Run a browser/local Research → Protection → Giving cycle, then review the protected branch output.",
    backendStatus: run.backendStatus ?? (telemetry.status === "connected" ? "live" : "offline"),
    candidatesFound: Number(overview.candidatesFound ?? reviewQueue.total ?? 0),
    branchReady: Number(overview.branchReady ?? reviewQueue.branchReadyCount ?? 0),
    needsReview: Number(overview.needsReview ?? reviewQueue.needsReviewCount ?? 0),
    dangerous: findings.dangerous.length || Number(overview.isolated ?? 0),
    included,
    excluded,
    mainProtected: true,
    changesBranch: changesByArd.branchName,
    primaryActionLabel: "Run ARD pipeline",
    runButtonEnabled: true
  };

  return {
    schema: "vnem.ardOperatorModel.v1",
    sections: ARD_OPERATOR_SECTION_ORDER,
    missionHeader: {
      eyebrow: "ARD — AI Research Dashboard",
      title: "Clean operator console for Research → Protection → Giving",
      summary: "ARD shows what is real now, what is protected, what needs review, and what is planned without hiding dangerous findings or implying a main push.",
      scope: "browser/local deterministic pipeline + protected Changes by ARD branch lane",
      proofLevel: pipelineRun?.branch?.mode ?? pipelineRun?.giving?.pushMode ?? changesByArd.mode ?? "local/dry-run",
      realVsPlanned: "Live external research and VNEM MCP foundation are planned/future, not active in this sprint."
    },
    controlCenter,
    pipelineTimeline: stageRows,
    changesByArd,
    reviewQueue,
    researchState,
    aiStatus,
    publicDecisionLog,
    findings,
    systemHealth,
    advanced: {
      rawDetailsCollapsed: true,
      telemetryNoiseReduced: true,
      oldRunsCollapsed: true,
      rawTelemetrySecondary: controlRoom.rawTelemetrySecondary !== false,
      latestMeaningfulEvent: publicDecisionLog[0]?.summary ?? "No public decision event yet."
    },
    plannedFeatures: [
      { title: "Live external source research", status: "planned/future", summary: "Requires explicit future design and validation before it can be labeled live." },
      { title: "Operator-confirmed remote research branch push", status: "planned/future", summary: "A future lane may push a protected branch after explicit confirmation; ARD still cannot push main." },
      { title: "VNEM MCP foundation", status: "planned/future", summary: "Intentionally not started in this sprint." }
    ],
    safety: {
      mainPushByArdAllowed: false,
      autoMergeAllowed: false,
      discoveredRepoExecutionAllowed: false,
      packageInstallFromCandidatesAllowed: false,
      hiddenChainOfThoughtExposed: false,
      liveResearchClaimAllowed: false
    },
    pipelineError: pipelineError ? String(pipelineError.message ?? pipelineError.error ?? pipelineError) : null,
    branchPreview
  };
}

function normalizeTimelineStages({ pipelineRun, run, ardChangesCard, branchWorkbench, inbox }) {
  const stages = pipelineRun?.stages ?? [];
  const byKey = new Map(stages.map((stage) => [stage.key, stage]));
  const statusFor = (key, fallback) => byKey.get(key)?.status ?? fallback;
  const branchPushed = Boolean(ardChangesCard?.lastPushed || branchWorkbench?.pushStatus === "pushed");
  const reviewCount = Number(inbox?.summary?.worthReviewingFirst ?? inbox?.lanes?.needsReview?.count ?? 0);
  return [
    { key: "research", label: "Research AI", status: statusFor("research", run?.currentStage === "research" ? "running" : "idle"), summary: "Finds candidates and records public source/evidence metadata." },
    { key: "protection", label: "Protection AI", status: statusFor("protection", run?.currentStage === "protection" ? "running" : "idle"), summary: "Blocks, quarantines, or marks candidates for review without claiming antivirus-grade coverage." },
    { key: "giving", label: "Giving AI", status: statusFor("giving", pipelineRun?.giving ? "complete" : "idle"), summary: "Prepares only allowed/reviewed candidates; blocked findings stay report-only." },
    { key: "changes-by-ard", label: "Changes by ARD", status: branchPushed ? "pushed" : ardChangesCard?.statusLabel ?? "not prepared", summary: "Protected branch lane; pushes changes-by-ard only after exact confirmation." },
    { key: "manual-review", label: "Manual Review", status: branchPushed ? "required" : reviewCount > 0 ? "needed" : "waiting", summary: "Human review remains required before any merge to main." }
  ];
}

function normalizeReviewQueue(inbox = {}, { pipelineRun } = {}) {
  const lanes = inbox.lanes ?? {};
  const candidates = [
    ...(lanes.branchReady?.items ?? []),
    ...(lanes.needsReview?.items ?? []),
    ...(lanes.missingLicense?.items ?? []),
    ...(lanes.needsPrimarySource?.items ?? []),
    ...(lanes.weakSource?.items ?? [])
  ];
  const workPackageTitles = new Set((pipelineRun?.giving?.workPackages ?? []).map((workPackage) => String(workPackage.title ?? "").toLowerCase()));
  const reviewable = candidates.filter((candidate) => !["blocked", "quarantine", "quarantined"].includes(candidate.verdict ?? candidate.action) && !workPackageTitles.has(String(candidate.title ?? "").toLowerCase()));
  const deduped = dedupeBy(reviewable, (candidate) => candidate.id ?? candidate.title).slice(0, 6).map((candidate) => ({
    id: String(candidate.id ?? candidate.title),
    title: candidate.title ?? "Untitled candidate",
    verdict: candidate.verdict ?? "needs-review",
    summary: candidate.summary ?? candidate.whyNotBranchEligible ?? candidate.verdictReason ?? "Needs review.",
    nextAction: candidate.nextAction ?? candidate.whyNotBranchEligible ?? "Review before Giving AI can proceed."
  }));
  const summary = inbox.summary ?? {};
  const workPackageCount = Number(pipelineRun?.giving?.workPackages?.length ?? 0);
  return {
    total: Number(summary.found ?? deduped.length),
    branchReadyCount: Math.max(Number(summary.branchReady ?? lanes.branchReady?.count ?? 0), workPackageCount),
    needsReviewCount: Number(summary.worthReviewingFirst ?? lanes.needsReview?.count ?? 0),
    blockedCount: Number(summary.blocked ?? lanes.blocked?.count ?? 0),
    quarantinedCount: Number(summary.quarantined ?? lanes.quarantined?.count ?? 0),
    lowSignalHidden: Number(summary.lowSignalHidden ?? 0),
    excludedCount: Number(summary.blocked ?? 0) + Number(summary.quarantined ?? 0) + Number(summary.lowSignalHidden ?? 0),
    items: deduped
  };
}

function normalizeResearchState({ pipelineRun, reviewQueue }) {
  const research = pipelineRun?.research ?? {};
  const giving = pipelineRun?.giving ?? {};
  const sourceLanes = (research.sourceLanes ?? []).map((lane) => ({
    key: lane.key,
    label: lane.label ?? lane.key,
    status: lane.status ?? "unknown",
    candidatesFound: Number(lane.candidatesFound ?? 0)
  }));
  const workPackages = (giving.workPackages ?? []).map((workPackage) => ({
    workPackageId: workPackage.workPackageId,
    title: workPackage.title,
    safeAction: workPackage.safeAction,
    filesToChange: workPackage.filesToChange ?? [],
    testsToRun: workPackage.testsToRun ?? [],
    blockedReasons: workPackage.blockedReasons ?? []
  }));
  const memory = research.memory ?? {};
  const categories = research.categories ?? research.categoryDistribution ?? [];
  return {
    schema: research.schema ?? "unknown",
    sourceLanes,
    sourceLanesUsed: research.sourceLanesUsed ?? sourceLanes.filter((lane) => lane.candidatesFound > 0).map((lane) => lane.key),
    categories,
    reviewArtifactOnly: Number(pipelineRun?.protection?.reviewArtifactOnly ?? workPackages.filter((workPackage) => workPackage.safeAction === "review-artifact-only").length),
    lifecycle: {
      total: Number(memory.total ?? reviewQueue.total ?? 0),
      repeated: Number(memory.repeated ?? 0),
      suppressed: Number(memory.lowSignalCollapsed ?? reviewQueue.lowSignalHidden ?? 0),
      branchReady: Number(memory.branchReady ?? reviewQueue.branchReadyCount ?? 0),
      waitingForEvidence: Number(memory.waitingForEvidence ?? 0),
      dangerous: Number(memory.dangerous ?? reviewQueue.blockedCount ?? 0)
    },
    workPackages,
    branchReadyWorkPackages: workPackages.filter((workPackage) => !workPackage.blockedReasons?.length).length,
    topRankedCandidates: research.ranking?.topCandidates ?? []
  };
}

function normalizeFindings({ pipelineRun, inbox, summary }) {
  const browserDangerous = (pipelineRun?.dangerousFindings ?? pipelineRun?.protection?.dangerousFindings ?? []).map((finding) => ({
    id: String(finding.id ?? finding.candidateId ?? finding.title),
    title: finding.title ?? finding.candidateId ?? "Dangerous browser finding",
    summary: (finding.dangerousSignals ?? []).join(", ") || "Blocked by Protection AI and excluded from Giving AI."
  }));
  const laneDangerous = [ ...(inbox?.lanes?.blocked?.items ?? []), ...(inbox?.lanes?.quarantined?.items ?? []) ].map((finding) => ({
    id: String(finding.id ?? finding.title),
    title: finding.title ?? "Dangerous finding",
    summary: finding.whyNotBranchEligible ?? finding.verdictReason ?? "Blocked/quarantined and excluded from Giving AI."
  }));
  const summaryDangerous = (summary?.findings ?? []).filter((finding) => ["blocked", "quarantine"].includes(finding.verdict ?? finding.action)).map((finding) => ({
    id: String(finding.id ?? finding.title),
    title: finding.title ?? "Blocked finding",
    summary: finding.summary ?? finding.reason ?? "Blocked/quarantined finding."
  }));
  const dangerous = dedupeBy([...browserDangerous, ...laneDangerous, ...summaryDangerous], (finding) => finding.title || finding.id).slice(0, 5);
  return {
    dangerous,
    visibleDangerousCount: dangerous.length,
    safeSummary: `${Number(pipelineRun?.giving?.included ?? 0)} included, ${Number(pipelineRun?.giving?.excluded ?? 0)} excluded in the latest browser/local run.`,
    evidenceCollapsed: false
  };
}

function normalizeAiStatus({ provider, run, pipelineRun, telemetry, workStatus }) {
  const status = provider?.status ?? "missing_key";
  const model = provider?.model ?? "local-fallback";
  const apiKeyConfigured = Boolean(provider?.api_key_configured ?? (status === "active" || status === "paused_for_backoff" || status === "rate_limited"));
  const fallbackActive = status !== "active";
  return {
    provider: "OpenRouter/local fallback",
    model,
    mode: pipelineRun?.mode ?? run?.dataMode ?? workStatus?.dataMode ?? "browser/local deterministic",
    apiKeyConfigured,
    localDeterministicFallbackActive: fallbackActive,
    liveExternalResearchActive: telemetry?.liveExternalResearchActive === true ? "yes" : "planned",
    currentStage: run?.currentStage ?? workStatus?.activeStage ?? "unknown",
    lastStageUpdate: run?.updatedAt ?? null,
    statusLabel: status,
    publicOnly: true
  };
}

function normalizeDecisionLog({ telemetry, pipelineRun, controlRoom, ardChangesCard, findings }) {
  const entries = [];
  if (pipelineRun) entries.push({ stage: "browser/local pipeline", summary: `${pipelineRun.runId ?? "latest run"} is ${pipelineRun.status ?? "available"}; dangerous findings remain visible and excluded.` });
  if (controlRoom?.nextAction) entries.push({ stage: "next action", summary: `${controlRoom.nextAction.label}: ${controlRoom.nextAction.detail}` });
  if (ardChangesCard) entries.push({ stage: "Changes by ARD", summary: `${ardChangesCard.displayName ?? "Changes by ARD"} targets ${ardChangesCard.branchName ?? "changes-by-ard"}; main protected is ${ardChangesCard.mainProtected !== false ? "yes" : "no"}.` });
  if (findings.dangerous.length) entries.push({ stage: "Protection AI", summary: `${findings.dangerous.length} dangerous/blocked finding(s) are visible and report-only.` });
  for (const event of (telemetry?.events ?? []).slice(0, 3)) {
    entries.push({ stage: event.agent_stage ?? event.type ?? "telemetry", summary: event.message ?? "Public telemetry event." });
  }
  return dedupeBy(entries, (entry) => `${entry.stage}:${entry.summary}`).map((entry) => ({
    ...entry,
    summary: sanitizePublicSummary(entry.summary)
  })).slice(0, 6);
}

function normalizeSystemHealth({ telemetry, run, builderHealth, summary }) {
  return {
    backend: run?.backendStatus ?? (telemetry?.status === "connected" ? "live" : "offline"),
    telemetry: telemetry?.status ?? "unknown",
    routeErrors: Number(summary?.errors?.length ?? 0),
    builder: builderHealth?.syncStatus ?? builderHealth?.status ?? "unknown",
    worktree: builderHealth?.worktreeClean === true ? "clean" : builderHealth?.worktreeClean === false ? "dirty" : "unknown",
    mainProtected: true,
    changesBranch: "changes-by-ard"
  };
}

function sanitizePublicSummary(value) {
  return String(value ?? "")
    .replace(/chain-of-thought|hidden reasoning|private reasoning|full internal thoughts/gi, "public summary")
    .slice(0, 240);
}

function dedupeBy(items, keyFn) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const key = String(keyFn(item) ?? "").trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}
