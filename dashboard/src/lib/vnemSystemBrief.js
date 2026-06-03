import { humanize } from "./dashboardFormat.js";
import { derivePipelineVerdict } from "./pipelineVerdicts.js";

const STAGED_STATUS = "staged_for_review";
const APPROVED_STATUS = "completed";
const BLOCKED_STATUS = "isolated_by_protection";

export function deriveVnemSystemBrief({ telemetry = {}, execution = {}, summary = null, connector = null } = {}) {
  const activeIngestions = telemetry.activeIngestions ?? execution.activeIngestions ?? [];
  const staged = activeIngestions.filter((item) => item?.status === STAGED_STATUS);
  const approved = activeIngestions.filter((item) => item?.status === APPROVED_STATUS || item?.approved_dispatch);
  const blocked = activeIngestions.filter((item) => item?.status === BLOCKED_STATUS);
  const routeErrors = telemetry.routeErrors ?? summary?.errors ?? [];
  const provider = telemetry.intelligenceProvider ?? {};
  const linkedClients = (connector?.clients ?? []).filter((client) => client.vnem_connection_present).length;
  const detectedClients = connector?.clients?.length ?? 0;
  const appServerLive = telemetry.status === "connected";
  const active = execution.active ?? activeIngestions.find((item) => item?.status && item.status !== STAGED_STATUS) ?? activeIngestions[0] ?? null;

  const verdicts = activeIngestions.map((item) => derivePipelineVerdict(item));
  const quarantined = verdicts.filter((verdict) => verdict.verdict === "quarantine");
  const blockedVerdicts = verdicts.filter((verdict) => verdict.verdict === "blocked");
  const reviewVerdicts = verdicts.filter((verdict) => verdict.verdict === "needs-review");
  const allowedVerdicts = verdicts.filter((verdict) => verdict.verdict === "allow");

  return {
    headline: appServerLive
      ? "VNEM App is watching live pipeline telemetry."
      : "VNEM App is ready, but live telemetry is not connected.",
    summary: buildSummary({ appServerLive, active, staged, blocked, quarantined, blockedVerdicts, reviewVerdicts, routeErrors, provider }),
    health: buildHealth({ appServerLive, routeErrors, provider, staged, blocked, quarantined, blockedVerdicts }),
    nextActions: buildNextActions({ appServerLive, active, staged, blocked, quarantined, blockedVerdicts, reviewVerdicts, routeErrors, provider, connector }),
    surfaces: [
      {
        key: "core",
        label: "VNEM Core",
        status: "implemented",
        tone: "ok",
        detail: "Read-only install pack, source radar, rubrics, registry data, prompt patterns, and quality gates."
      },
      {
        key: "app",
        label: "VNEM App",
        status: appServerLive ? "live" : "local dashboard",
        tone: appServerLive ? "ok" : "review",
        detail: appServerLive
          ? "Dashboard is receiving local app-server telemetry and can show pipeline state."
          : "Dashboard UI is available; start the local app server for live pipeline state."
      },
      {
        key: "research",
        label: "Research AI",
        status: stageStatus(active, "research", activeIngestions.length),
        tone: stageTone(active, "research"),
        detail: "Finds source-backed AI improvement candidates from GitHub, NPM, MCP, and configured routes."
      },
      {
        key: "protection",
        label: "Protection AI",
        status: blockedVerdicts.length > 0 ? `${blockedVerdicts.length} blocked` : quarantined.length > 0 ? `${quarantined.length} quarantined` : reviewVerdicts.length > 0 ? `${reviewVerdicts.length} review` : stageStatus(active, "protection", activeIngestions.length),
        tone: blockedVerdicts.length > 0 ? "critical" : quarantined.length > 0 ? "warning" : reviewVerdicts.length > 0 ? "review" : stageTone(active, "protection"),
        detail: "Reviews provenance, package surface, permissions, and threat flags before Giving AI handoff."
      },
      {
        key: "giving",
        label: "Giving AI",
        status: staged.length > 0 ? `${staged.length} awaiting review` : approved.length > 0 ? `${approved.length} approved` : stageStatus(active, "giving", activeIngestions.length),
        tone: staged.length > 0 ? "review" : approved.length > 0 ? "ok" : stageTone(active, "giving"),
        detail: blockedVerdicts.length > 0 || quarantined.length > 0
          ? "Stages only allowed or reviewable dispatches; blocked/quarantined verdicts stay out of Giving AI paths."
          : "Stages markdown dispatches for maintainer review; approval does not execute code or commit changes."
      },
      {
        key: "connectors",
        label: "VNEM Connectors",
        status: detectedClients > 0 ? `${linkedClients}/${detectedClients} linked` : "foundation",
        tone: linkedClients > 0 ? "ok" : detectedClients > 0 ? "review" : "quiet",
        detail: "Detects local AI clients and supports explicit preview/apply/revert style configuration flows."
      },
      {
        key: "vnem-ai",
        label: "VNEM AI",
        status: "planned",
        tone: "quiet",
        detail: "Future customizable AI surface for modes, providers, tools, rules, and app-building workflows."
      }
    ]
  };
}

function buildSummary({ appServerLive, active, staged, blocked, quarantined, blockedVerdicts, reviewVerdicts, routeErrors, provider }) {
  if (blockedVerdicts.length > 0 || blocked.length > 0) {
    return "Protection AI returned a blocked verdict. Blocked items must not reach Giving AI, package installs, execution, or safe recommendations.";
  }
  if (quarantined.length > 0) {
    return "Protection AI quarantined a suspicious candidate. It can remain for audit/research, but Giving AI must not use it as an implementation source.";
  }
  if (reviewVerdicts.length > 0) {
    return "Protection AI found open questions. Maintainer review is required before risky Giving AI application.";
  }
  if (staged.length > 0) {
    return "Giving AI has staged reviewable markdown. Open the finding, inspect the source and risk notes, then approve or reject.";
  }
  if (provider?.status === "paused_for_backoff") {
    return "OpenRouter asked VNEM to wait. The active payload remains queued and the dashboard shows the resume window.";
  }
  if (active) {
    return `${agentLabel(active.current_agent)} is processing ${active.title ?? active.repository?.full_name ?? "a candidate"}.`;
  }
  if (routeErrors.length > 0) {
    return "The dashboard has source route errors to inspect before trusting the latest scan completely.";
  }
  return appServerLive
    ? "No active ingestion is running. Use Manual Override or wait for the next background cruise signal."
    : "Start the local app server to turn the dashboard from a static control surface into live telemetry.";
}

function buildHealth({ appServerLive, routeErrors, provider, staged, blocked, quarantined, blockedVerdicts }) {
  if (blockedVerdicts.length > 0 || blocked.length > 0) return { label: "blocked verdict", tone: "critical" };
  if (quarantined.length > 0) return { label: "quarantined", tone: "warning" };
  if (staged.length > 0) return { label: "review needed", tone: "review" };
  if (provider?.status === "paused_for_backoff") return { label: "provider backoff", tone: "review" };
  if (routeErrors.length > 0) return { label: "route warnings", tone: "review" };
  if (appServerLive) return { label: "live", tone: "ok" };
  return { label: "offline", tone: "quiet" };
}

function buildNextActions({ appServerLive, active, staged, blocked, quarantined, blockedVerdicts, reviewVerdicts, routeErrors, provider, connector }) {
  const actions = [];
  if (!appServerLive) {
    actions.push({ label: "Start local app server", detail: "Run npm run dev:all to connect live telemetry.", tone: "review" });
  }
  if (provider?.status === "missing_key") {
    actions.push({ label: "Optional provider setup", detail: "Set OPENROUTER_API_KEY only if you want cloud inference instead of local deterministic fallback.", tone: "quiet" });
  }
  if (provider?.status === "paused_for_backoff") {
    actions.push({ label: "Wait for provider resume", detail: "Do not redeploy the same target; VNEM kept it queued for retry.", tone: "review" });
  }
  if (blockedVerdicts.length > 0 || blocked.length > 0) {
    actions.push({ label: "Keep blocked item out of Giving AI", detail: "Blocked verdict means no apply, install, execute, or safe recommendation path.", tone: "critical" });
  }
  if (quarantined.length > 0) {
    actions.push({ label: "Audit quarantined candidate", detail: "Quarantined verdict stays isolated from Giving AI until a maintainer performs deeper review.", tone: "warning" });
  }
  if (reviewVerdicts.length > 0) {
    actions.push({ label: "Resolve review questions", detail: "Check source, license, permissions, install surface, and metadata confidence before risky use.", tone: "review" });
  }
  if (staged.length > 0) {
    actions.push({ label: "Review staged dispatch", detail: "Open the review modal from the findings matrix, then approve or reject the markdown.", tone: "ok" });
  }
  if (routeErrors.length > 0) {
    actions.push({ label: "Check source route errors", detail: `${routeErrors.length} route issue${routeErrors.length === 1 ? "" : "s"} may have reduced scan coverage.`, tone: "review" });
  }
  const unlinkedClients = (connector?.clients ?? []).filter((client) => !client.vnem_connection_present && (client.installed || client.config_profile_present));
  if (unlinkedClients.length > 0) {
    actions.push({ label: "Preview connector changes", detail: `${unlinkedClients.length} detected client${unlinkedClients.length === 1 ? "" : "s"} can be previewed before apply.`, tone: "quiet" });
  }
  if (actions.length === 0) {
    actions.push({ label: active ? "Monitor active mission" : "Deploy a target", detail: active ? "Watch the pipeline timeline until it reaches a reviewable decision." : "Use Manual Override when you want Research AI to inspect a specific target.", tone: active ? "ok" : "quiet" });
  }
  return actions.slice(0, 4);
}

function stageStatus(active, stage, count) {
  if (active?.current_agent === stage) return "active";
  if (count > 0) return "standby";
  return "ready";
}

function stageTone(active, stage) {
  if (active?.current_agent === stage) return "ok";
  if (stage === "protection" && active?.status === BLOCKED_STATUS) return "critical";
  return active ? "quiet" : "review";
}

function agentLabel(agent) {
  const map = {
    research: "Research AI",
    protection: "Protection AI",
    giving: "Giving AI",
    complete: "Giving AI"
  };
  return map[agent] ?? humanize(agent ?? "VNEM");
}
