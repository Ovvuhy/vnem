import runHistoryIndex from "../../../discovery/run-history/index.json" with { type: "json" };

export function deriveBuilderHealth({ builderSession = null, runHistory = runHistoryIndex } = {}) {
  const latest = runHistory?.latest ?? null;
  const ports = builderSession?.devHealth?.ports ?? [];
  const dashboardPorts = ports.filter((entry) => [4174, 4175].includes(Number(entry.port)));
  const backendPort = ports.find((entry) => Number(entry.port) === 9099) ?? null;
  const dirty = builderSession?.worktree ? !builderSession.worktree.clean : null;
  return {
    ok: true,
    source: builderSession ? "live-builder-session" : "run-history-static-fallback",
    title: "Builder Health",
    localMatchesOriginMain: builderSession?.localMatchesOriginMain ?? null,
    worktreeState: dirty === null ? "available through npm run builder:session" : dirty ? "dirty" : "clean",
    latestCommit: builderSession?.localHead ?? latest?.commit ?? null,
    latestPushStatus: builderSession?.localMatchesOriginMain === true ? "local matches origin/main" : latest?.pushed ? "latest recorded run pushed" : "unknown",
    backendStatus: backendPort?.listening ? "backend port listening" : backendPort ? "backend port free" : "check with npm run dev:health",
    dashboardStatus: summarizeDashboardPorts(dashboardPorts),
    lastRun: latest ? {
      id: latest.id,
      title: latest.title,
      status: latest.status,
      commit: latest.commit,
      pushed: latest.pushed,
      validationStatus: latest.validationRun?.status ?? "not recorded",
      visualStatus: latest.visualCheck?.status ?? "not recorded",
      finishedAt: latest.finishedAt,
      nextRecommendedImprovement: latest.nextRecommendedImprovement
    } : null,
    nextSafeAction: builderSession?.nextSafeAction ?? "Builder health data is available through npm run builder:session. Live dashboard wiring planned."
  };
}

function summarizeDashboardPorts(dashboardPorts) {
  if (dashboardPorts.length === 0) return "check with npm run dev:health";
  const listening = dashboardPorts.filter((entry) => entry.listening);
  if (listening.length === 0) return "dashboard ports free";
  if (listening.length === 1) return `dashboard listening on ${listening[0].port}`;
  return `multiple dashboard ports listening: ${listening.map((entry) => entry.port).join(", ")}`;
}
