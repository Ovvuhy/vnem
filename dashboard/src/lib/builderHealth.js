import runHistoryIndex from "../../../discovery/run-history/index.json" with { type: "json" };

export function deriveBuilderHealth({ builderSession = null, runHistory = runHistoryIndex, source = null, status = null, error = null, lastCheckedAt = null } = {}) {
  const latest = runHistory?.latest ?? null;
  const session = builderSession?.ok === false ? null : builderSession;
  const ports = session?.devHealth?.ports ?? [];
  const dashboardPorts = ports.filter((entry) => [4174, 4175].includes(Number(entry.port)));
  const backendPort = ports.find((entry) => Number(entry.port) === 9099) ?? null;
  const resolvedSource = session ? (source ?? "backend") : "fallback";
  const changedFiles = session?.worktree?.changedFiles ?? [];
  const untrackedFiles = session?.worktree?.untrackedFiles ?? [];
  const worktreeClean = session?.worktree?.clean === true;
  const generatedDispatchFiles = session?.generatedDispatchFiles ?? [];
  const accidentalPaths = session?.accidentalPaths ?? [];
  const activeRun = normalizeActiveRun(session?.activeRun ?? null);
  const latestBuilderRun = normalizeActiveRun(session?.latestRun ?? latest ?? null);
  const recoveryStatus = session?.recoveryStatus ?? (session
    ? (worktreeClean
        ? { state: "clean-no-active-run", nextAction: "No active builder run. Worktree is clean and ready." }
        : { state: "attention-needed-no-active-run", nextAction: "No active builder run, but the worktree is dirty. Inspect, validate, commit/push, or discard intentionally before starting another run." })
    : { state: "offline", nextAction: "Builder health backend offline. Run npm run builder:run:recover for live recovery facts." });

  return {
    ok: true,
    title: "Builder Health",
    source: resolvedSource,
    status: session ? (status === "loading" ? "loading" : "live") : (status ?? "offline"),
    errorMessage: error?.message ?? error?.error ?? null,
    lastCheckedAt,
    branch: session?.branch ?? "unknown",
    localHead: session?.localHead ?? latest?.commit ?? null,
    remoteHead: session?.originMainSha ?? null,
    localHeadShort: shortCommit(session?.localHead ?? latest?.commit),
    remoteHeadShort: shortCommit(session?.originMainSha),
    matchesRemote: session?.localMatchesOriginMain ?? null,
    repoSync: summarizeRepoSync(session),
    worktree: summarizeWorktree({ worktreeClean, changedFiles, untrackedFiles, hasSession: Boolean(session) }),
    changedFiles,
    untrackedFiles,
    generatedDispatch: summarizeGeneratedDispatch(generatedDispatchFiles),
    generatedDispatchFiles,
    accidentalPaths: summarizeAccidentalPaths(accidentalPaths, Boolean(session)),
    ports: summarizePorts({ ports, backendPort, dashboardPorts, hasSession: Boolean(session) }),
    backendPort: summarizeBackendPort(backendPort, Boolean(session)),
    dashboardPorts: summarizeDashboardPorts(dashboardPorts, Boolean(session)),
    activeRun,
    latestBuilderRun,
    recoveryStatus,
    runSnapshot: summarizeRunSnapshot({ activeRun, latestBuilderRun, recoveryStatus, session }),
    lastRun: latest ? {
      id: latest.id,
      title: latest.title,
      status: latest.status,
      commit: latest.commit,
      commitShort: shortCommit(latest.commit),
      pushed: latest.pushed,
      validationStatus: latest.validationRun?.status ?? "not recorded",
      visualStatus: latest.visualCheck?.status ?? "not recorded",
      finishedAt: latest.finishedAt,
      nextRecommendedImprovement: latest.nextRecommendedImprovement
    } : null,
    nextSafeAction: session?.nextSafeAction ?? "Builder health backend offline. Run npm run builder:session and npm run dev:health in the repo for live facts.",
    liveMessage: session
      ? "Live builder session loaded from local app server."
      : "Builder health backend offline. Run npm run builder:session and npm run dev:health in the repo for live facts.",
    staleOutputGuidance: "Stale Vite output does not mean new repo work exists. Trust git status + builder session over old background logs. Use dev:health to confirm ports.",
    actions: [
      { key: "refresh", label: "Refresh builder health", type: "refresh" },
      { key: "builder-session", label: "Use npm run builder:session", type: "instruction" },
      { key: "dev-health", label: "Use npm run dev:health", type: "instruction" }
    ]
  };
}

function summarizeRepoSync(session) {
  if (!session) return { label: "Builder session unavailable", tone: "review" };
  if (session.localMatchesOriginMain === true) return { label: session.worktree?.clean === true ? "Clean and synced" : "Local matches origin/main", tone: session.worktree?.clean === true ? "ok" : "review" };
  if (session.localMatchesOriginMain === false) return { label: "Local/remote mismatch", tone: "review" };
  return { label: "Repo sync unknown", tone: "review" };
}

function summarizeWorktree({ worktreeClean, changedFiles, untrackedFiles, hasSession }) {
  if (!hasSession) return { label: "Builder session unavailable", tone: "review", changedCount: 0, untrackedCount: 0 };
  const changedCount = changedFiles.length;
  const untrackedCount = untrackedFiles.length;
  if (worktreeClean) return { label: "Clean worktree", tone: "ok", changedCount, untrackedCount };
  return { label: "Dirty worktree", tone: "review", changedCount, untrackedCount };
}

function summarizeGeneratedDispatch(files) {
  if (files.length === 0) return { label: "no generated dispatch files", tone: "ok", count: 0 };
  return { label: `${files.length} generated dispatch ${files.length === 1 ? "file" : "files"}`, tone: "review", count: files.length };
}

function summarizeAccidentalPaths(paths, hasSession) {
  if (!hasSession) return { label: "check unavailable", tone: "review", found: [] };
  const found = paths.filter((entry) => entry.exists);
  if (found.length === 0) return { label: "no accidental VNEM path", tone: "ok", found };
  return { label: "Accidental VNEM path found", tone: "critical", found };
}

function summarizePorts({ ports, backendPort, dashboardPorts, hasSession }) {
  return {
    all: ports,
    backend: summarizeBackendPort(backendPort, hasSession),
    dashboard: summarizeDashboardPorts(dashboardPorts, hasSession)
  };
}

function summarizeBackendPort(backendPort, hasSession) {
  if (!hasSession) return { label: "backend status unavailable", tone: "review", running: false };
  if (!backendPort) return { label: "backend port not reported", tone: "review", running: false };
  if (backendPort.listening && backendPort.looksLikeVnemAppServer) return { label: "Backend app server running", tone: "ok", running: true, port: 9099 };
  if (backendPort.listening) return { label: "Backend port occupied", tone: "review", running: true, port: 9099 };
  return { label: "Backend port free", tone: "quiet", running: false, port: 9099 };
}

function summarizeDashboardPorts(dashboardPorts, hasSession) {
  if (!hasSession) return { label: "dashboard ports unavailable", tone: "review", runningPorts: [] };
  const running = dashboardPorts.filter((entry) => entry.listening);
  const runningPorts = running.map((entry) => Number(entry.port));
  if (running.length === 0) return { label: "Dashboard ports free", tone: "ok", runningPorts };
  if (running.some((entry) => entry.looksLikeDashboardDevServer)) return { label: "Dashboard dev server running", tone: "review", runningPorts };
  return { label: "Dashboard port occupied", tone: "review", runningPorts };
}

function normalizeActiveRun(run) {
  if (!run) return null;
  return {
    id: run.id,
    title: run.title ?? "Untitled builder run",
    status: run.status ?? "unknown",
    startedAt: run.startedAt ?? null,
    updatedAt: run.updatedAt ?? null,
    finishedAt: run.finishedAt ?? null,
    commit: run.commit ?? null,
    commitShort: shortCommit(run.commit),
    pushed: Boolean(run.pushed),
    pushStatus: run.pushStatus ?? (run.pushed ? "pushed" : "not-pushed"),
    validationStatus: run.validationRun?.status ?? "not-run",
    validationCommandCount: run.validationRun?.commandCount ?? run.capture?.commandCount ?? 0,
    failedCommand: run.validationRun?.failedCommand ?? run.capture?.lastFailedCommand?.command ?? null,
    visualStatus: run.visualCheck?.status ?? "not-run",
    safetyStatus: run.safetyChecks?.status ?? "not-run",
    generatedStatus: run.generatedArtifacts?.refreshed ? "refreshed" : (run.generatedArtifacts?.status ?? "not-run"),
    lastCapturedCommand: run.capture?.lastCommand?.command ?? run.capture?.lastCommand?.label ?? null,
    lastCapturedStatus: run.capture?.lastCommand?.status ?? null,
    nextRecommendedImprovement: run.nextRecommendedImprovement ?? "Run recovery before starting new work."
  };
}

function summarizeRunSnapshot({ activeRun, latestBuilderRun, recoveryStatus, session }) {
  if (activeRun) {
    return {
      label: "Active Builder Run",
      tone: activeRun.status === "interrupted" ? "critical" : "review",
      title: activeRun.title,
      status: activeRun.status,
      validationStatus: activeRun.validationStatus,
      validationCommandCount: activeRun.validationCommandCount,
      failedCommand: activeRun.failedCommand,
      visualStatus: activeRun.visualStatus,
      safetyStatus: activeRun.safetyStatus,
      generatedStatus: activeRun.generatedStatus,
      lastCapturedCommand: activeRun.lastCapturedCommand ?? "none captured yet",
      lastCapturedStatus: activeRun.lastCapturedStatus ?? "not-run",
      pushStatus: activeRun.pushStatus,
      nextAction: recoveryStatus?.nextAction ?? "Run npm run builder:run:recover before starting new work."
    };
  }
  if (!session) {
    return {
      label: "Builder run state unavailable",
      tone: "review",
      title: latestBuilderRun?.title ?? "No live builder session",
      status: "offline",
      validationStatus: latestBuilderRun?.validationStatus ?? "unknown",
      validationCommandCount: latestBuilderRun?.validationCommandCount ?? 0,
      failedCommand: latestBuilderRun?.failedCommand ?? null,
      visualStatus: latestBuilderRun?.visualStatus ?? "unknown",
      safetyStatus: latestBuilderRun?.safetyStatus ?? "unknown",
      generatedStatus: latestBuilderRun?.generatedStatus ?? "unknown",
      lastCapturedCommand: latestBuilderRun?.lastCapturedCommand ?? "unavailable",
      lastCapturedStatus: latestBuilderRun?.lastCapturedStatus ?? "unknown",
      pushStatus: latestBuilderRun?.pushStatus ?? (latestBuilderRun?.pushed ? "pushed" : "unknown"),
      nextAction: "Builder health backend offline. Run npm run builder:run:recover for live recovery facts."
    };
  }
  return {
    label: "No active builder run",
    tone: "ok",
    title: latestBuilderRun?.title ?? "No active builder run. Worktree is clean and ready.",
    status: recoveryStatus?.state ?? "clean-no-active-run",
    validationStatus: latestBuilderRun?.validationStatus ?? "not recorded",
    validationCommandCount: latestBuilderRun?.validationCommandCount ?? 0,
    failedCommand: latestBuilderRun?.failedCommand ?? null,
    visualStatus: latestBuilderRun?.visualStatus ?? "not recorded",
    safetyStatus: latestBuilderRun?.safetyStatus ?? "not recorded",
    generatedStatus: latestBuilderRun?.generatedStatus ?? "not recorded",
    lastCapturedCommand: latestBuilderRun?.lastCapturedCommand ?? "none recorded",
    lastCapturedStatus: latestBuilderRun?.lastCapturedStatus ?? "not recorded",
    pushStatus: latestBuilderRun?.pushStatus ?? (latestBuilderRun?.pushed ? "pushed" : "not-pushed"),
    nextAction: recoveryStatus?.nextAction ?? "Safe to start a new run."
  };
}

function shortCommit(value) {
  return value ? String(value).slice(0, 7) : "unknown";
}
