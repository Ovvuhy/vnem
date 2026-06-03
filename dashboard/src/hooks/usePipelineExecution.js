import { useMemo } from "react";
import { clampPercent, formatMetric, vectorLabel, vectorRoute } from "../lib/dashboardFormat.js";

const terminalStatuses = new Set(["staged_for_review", "isolated_by_protection", "research_no_candidate"]);
const researchStatuses = new Set(["researching", "live_github_search", "live_npm_search"]);
const highlightTerms = ["luau", "agentic", "optimization", "architecture", "mcp", "workflow", "performance"];

export function usePipelineExecution(telemetry = {}, summary = null) {
  return useMemo(() => derivePipelineExecution(telemetry, summary), [telemetry, summary]);
}

export function derivePipelineExecution(telemetry = {}, summary = null) {
  const activeIngestions = telemetry.activeIngestions ?? [];
  const active = activeIngestions.find((item) => !terminalStatuses.has(item.status)) ?? activeIngestions[0] ?? null;
  const mission = normalizeMission(telemetry.mission ?? telemetry.pipeline?.mission, active);
  const phase = derivePhase(telemetry, active);
  const currentStage = phase.stage;
  const steps = buildSteps({ phase, mission, active });
  const profile = agentProfileForStage(currentStage);
  const events = (telemetry.events ?? [])
    .filter((event) => event.type?.startsWith("pipeline") || event.type === "mission_updated" || event.agent_stage)
    .slice(0, 8);

  return {
    mission,
    active,
    activeIngestions,
    phase,
    currentStage,
    steps,
    profile,
    agentProfiles: buildAgentProfiles(currentStage),
    events,
    sourceLineage: buildSourceLineage(active, mission),
    contextFeed: buildContextFeed(active),
    diagnostics: buildDiagnostics(active, mission),
    cruiseTicker: buildCruiseTicker({ telemetry, activeIngestions, mission, events }),
    consoleLocked: ["submitting", "awaiting_confirmation"].includes(telemetry.targetingStatus),
    consoleStateLabel: targetingStatusLabel(telemetry.targetingStatus),
    queueDepth: activeIngestions.length || summary?.aggregates?.today || 0
  };
}

function normalizeMission(mission, active) {
  const vector = mission?.vector ?? active?.repository?.vector ?? "github";
  return {
    query: mission?.query ?? active?.repository?.query ?? "luau architecture OR agentic workflow",
    vector,
    vectorLabel: mission?.vector_label ?? vectorLabel(vector),
    vectorRoute: vectorRoute(vector),
    threatTolerance: mission?.threat_tolerance ?? active?.protection_report?.threat_tolerance ?? 30,
    revision: mission?.revision ?? 0,
    updatedAt: mission?.updated_at ?? null,
    nextPollAt: mission?.next_poll_at ?? null
  };
}

function derivePhase(telemetry, active) {
  if (telemetry.targetingStatus === "submitting" || telemetry.targetingStatus === "awaiting_confirmation") {
    return {
      stage: "initialization",
      tone: "review",
      label: "Deploying Mission Telemetry Matrix...",
      detail: "The command has been accepted locally and the dashboard is waiting for SSE confirmation."
    };
  }

  if (telemetry.targetingStatus === "cache_standby" || telemetry.lastEvent?.type === "pipeline_research_noop") {
    return {
      stage: "cache",
      tone: "quiet",
      label: "Fresh Cache Standby",
      detail: "The backend confirmed a fresh cache window and skipped redundant source polling."
    };
  }

  if (researchStatuses.has(active?.status) || (active?.current_agent === "research" && !terminalStatuses.has(active?.status))) {
    return {
      stage: "research",
      tone: "ok",
      label: `Researching AI: Querying ${active.source_origin ?? "source"} Index...`,
      detail: "Analysing high-value candidates and computing trust evidence."
    };
  }

  if (active?.status === "sandboxing") {
    return {
      stage: "protection",
      tone: "review",
      label: "Protection AI: Cross-referencing threat signatures.",
      detail: "Scanning README surfaces, lifecycle hooks, metadata, and asset payloads."
    };
  }

  if (active?.status === "staged_for_review" || active?.status === "isolated_by_protection") {
    return {
      stage: "giving",
      tone: active.status === "isolated_by_protection" ? "critical" : "ok",
      label: "Giving AI: Assembling Markdown Intelligence Dispatch.",
      detail: "Operational matrix updated from the latest pipeline decision."
    };
  }

  return {
    stage: "idle",
    tone: "quiet",
    label: "Telemetry Standing By",
    detail: "No active ingestion is currently running."
  };
}

function buildSteps({ phase, mission, active }) {
  const stageOrder = ["initialization", "research", "protection", "giving"];
  const activeIndex = Math.max(0, stageOrder.indexOf(phase.stage));
  return [
    {
      key: "initialization",
      title: "Initialization",
      message: "Deploying Mission Telemetry Matrix...",
      metadata: [`${mission.query}`, mission.vectorLabel, `${mission.threatTolerance}% tolerance`]
    },
    {
      key: "research",
      title: "Active Researching AI",
      message: `Researching AI: Querying ${mission.vectorLabel} Index... Analysing high-value candidates.`,
      metadata: trustMetadata(active)
    },
    {
      key: "protection",
      title: "Active Protection AI",
      message: "Protection AI: Cross-referencing threat signatures. Scanning README surfaces, lifecycle hooks, and asset payloads...",
      metadata: protectionMetadata(active)
    },
    {
      key: "giving",
      title: "Active Giving AI",
      message: "Giving AI: Assembling Markdown Intelligence Dispatch at .vnem/staging/... Operational matrix updated.",
      metadata: givingMetadata(active)
    }
  ].map((step, index) => {
    let state = "queued";
    if (phase.stage === "cache" && step.key === "research") {
      state = "cache";
    } else if (phase.stage === "idle") {
      state = index === 0 ? "idle" : "queued";
    } else if (step.key === phase.stage) {
      state = phase.stage === "giving" && active?.status === "staged_for_review" ? "complete" : "active";
    } else if (index < activeIndex) {
      state = "complete";
    }
    return {
      ...step,
      state
    };
  });
}

function trustMetadata(active) {
  if (!active) return ["trust score: waiting", "candidate score: waiting"];
  const diagnostics = active.repository?.diagnostics?.score_components;
  if (active.repository?.kind === "npm_package" && diagnostics) {
    return [
      `search ${formatMetric(diagnostics.search_score)}`,
      `final ${formatMetric(diagnostics.final_score)}`,
      `quality ${formatMetric(diagnostics.quality)}`,
      `popularity ${formatMetric(diagnostics.popularity)}`,
      `recency ${formatMetric(diagnostics.recency_score, 0)}`
    ];
  }
  return [
    `${clampPercent(active.trust_score)}% trust`,
    active.repository?.language ?? "language unknown",
    active.repository?.updated_at ? `updated ${active.repository.updated_at.slice(0, 10)}` : "recency pending"
  ];
}

function protectionMetadata(active) {
  const report = active?.protection_report;
  if (!report) return ["scanned bytes: waiting", "flags: pending"];
  return [
    `${report.scanned_bytes ?? 0} bytes scanned`,
    `flags: ${(report.flags ?? []).join(", ") || "none"}`,
    `${active.threat_score ?? 0}% threat`
  ];
}

function givingMetadata(active) {
  if (!active) return [".vnem/staging/ pending"];
  if (active.status === "isolated_by_protection") return ["isolated by Protection AI", `${active.threat_score ?? 0}% threat`];
  return [active.staged_dispatch?.file_name ?? ".vnem/staging/ pending", active.action_dispatch ?? "Pending Approval"];
}

function buildAgentProfiles(currentStage) {
  return [
    {
      key: "research",
      name: "Research Core v1",
      role: "Vector discovery and source scoring",
      state: currentStage === "research" ? "active" : currentStage === "idle" ? "idle" : "standby"
    },
    {
      key: "protection",
      name: "Protection Guard v1",
      role: "Threat signatures, payload review, and isolation gates",
      state: currentStage === "protection" ? "active" : currentStage === "research" ? "queued" : "standby"
    },
    {
      key: "giving",
      name: "Giving Core v1",
      role: "Markdown dispatch staging and maintainer handoff",
      state: currentStage === "giving" ? "active" : ["idle", "research", "protection"].includes(currentStage) ? "queued" : "standby"
    }
  ];
}

function agentProfileForStage(stage) {
  const map = {
    initialization: "Mission Control v1",
    research: "Research Core v1",
    protection: "Protection Guard v1",
    giving: "Giving Core v1",
    cache: "Research Core v1",
    idle: "Mission Control v1"
  };
  return map[stage] ?? "Mission Control v1";
}

function buildSourceLineage(active, mission) {
  const repository = active?.repository ?? {};
  return {
    profile: agentProfileForStage(active?.current_agent ?? "idle"),
    vector: mission.vectorLabel,
    route: repository.source_route ?? active?.source_route ?? mission.vectorRoute,
    origin: active?.source_origin ?? mission.vectorLabel,
    sourceUrl: active?.source_url ?? repository.html_url ?? null,
    target: active?.title ?? repository.full_name ?? "No active target",
    trigger: active?.trigger ?? "manual-targeting"
  };
}

function buildContextFeed(active) {
  const repository = active?.repository ?? {};
  const rows = contextRows(active, repository);
  const raw = [
    repository.audit_text,
    repository.description,
    repository.package ? JSON.stringify(repository.package, null, 2) : null,
    repository.diagnostics ? JSON.stringify(repository.diagnostics, null, 2) : null,
    active?.latest_event?.message
  ].filter(Boolean).join("\n\n").slice(0, 1600);

  const text = raw || "No active context payload has been streamed yet.";
  const matchSource = `${text} ${rows.map((row) => `${row.label} ${row.value}`).join(" ")}`.toLowerCase();
  const matches = highlightTerms.filter((term) => matchSource.includes(term));
  return {
    text,
    rows: rows.length > 0 ? rows : [{ label: "status", value: "No active context payload has been streamed yet.", tone: "muted" }],
    matches,
    dispatchPath: active?.staged_dispatch?.path ?? ".vnem/staging/",
    serializedPreview: [
      `target: ${active?.title ?? "pending"}`,
      `route: ${active?.source_route ?? "pending"}`,
      `risk: ${active?.risk_tier ?? "pending"}`,
      `trust: ${active?.trust_score ?? "pending"}`
    ]
  };
}

function contextRows(active, repository) {
  if (!active && !repository?.full_name) return [];
  const diagnostics = repository.diagnostics?.score_components ?? {};
  const adapter = repository.adapter ?? repository.diagnostics ?? {};
  const packageData = repository.package ?? {};
  const rows = [
    ["target", active?.title ?? repository.full_name ?? repository.name, "primary"],
    ["route", active?.source_route ?? repository.source_route, "route"],
    ["origin", active?.source_origin ?? repository.vector, "route"],
    ["summary", repository.description, "wide"],
    ["latest event", active?.latest_event?.message, "wide"],
    ["trust score", active?.trust_score != null ? `${active.trust_score}%` : null, "metric"],
    ["threat score", active?.threat_score != null ? `${active.threat_score}%` : null, "metric"],
    ["scanned bytes", active?.protection_report?.scanned_bytes != null ? `${active.protection_report.scanned_bytes}` : null, "metric"],
    ["flags", active?.protection_report?.flags?.length ? active.protection_report.flags.join(", ") : null, "wide"],
    ["package", packageData.name, "route"],
    ["version", packageData.version, "metric"],
    ["maintainers", packageData.maintainers?.map((item) => item.name ?? item.email ?? item).join(", "), "wide"],
    ["keywords", packageData.keywords?.join(", "), "wide"],
    ["npm search score", diagnostics.search_score, "metric"],
    ["npm final score", diagnostics.final_score, "metric"],
    ["npm quality", diagnostics.quality, "metric"],
    ["npm popularity", diagnostics.popularity, "metric"],
    ["npm recency", diagnostics.recency_score, "metric"],
    ["mcp adapter", adapter.mode ?? adapter.adapter, "route"],
    ["mcp sync", adapter.sync_status, "wide"]
  ];
  return rows
    .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== "")
    .map(([label, value, tone]) => ({ label, value: String(value), tone }));
}

function buildCruiseTicker({ telemetry, activeIngestions, mission, events }) {
  const ingestionItems = activeIngestions.slice(0, 5).map((item) => ({
    label: item.source_origin ?? item.source_route ?? mission.vectorLabel,
    value: item.title ?? item.repository?.full_name ?? item.repository?.name ?? "source candidate"
  }));
  const eventItems = events.slice(0, 4).map((event) => ({
    label: event.agent_stage ?? event.type ?? "telemetry",
    value: event.message ?? "background signal"
  }));
  const missionItems = [
    { label: mission.vectorLabel, value: mission.query },
    { label: mission.vectorRoute, value: `${mission.threatTolerance}% Protection AI tolerance` },
    { label: telemetry.status === "connected" ? "SSE linked" : "SSE pending", value: "Hermes background cruise loop" }
  ];
  return [...ingestionItems, ...eventItems, ...missionItems].slice(0, 8);
}

function buildDiagnostics(active, mission) {
  const repository = active?.repository ?? {};
  if (repository.kind === "npm_package") {
    return {
      type: "npm",
      title: "NPM scoring diagnostics",
      description: "Exact registry scoring primitives carried from the Research AI package search adapter.",
      metrics: repository.diagnostics?.score_components ?? {},
      formula: repository.diagnostics?.trust_score_formula ?? "npmTrustScore"
    };
  }
  if (repository.kind === "mcp_tool" || mission.vector === "mcp") {
    return {
      type: "mcp",
      title: "MCP adapter diagnostics",
      description: "Local deterministic MCP catalog adapter. It evaluates catalog metadata locally until full federated registry sync goes live.",
      adapter: repository.adapter ?? repository.diagnostics ?? {
        mode: "deterministic-local",
        route: "mcp-registry",
        sync_status: "federated registry sync pending"
      }
    };
  }
  return {
    type: "github",
    title: "GitHub repository diagnostics",
    description: "Repository candidate ranking uses keyword relevance, stars, forks, and recency before Protection AI scans README/package surfaces.",
    metrics: {
      trust_score: active?.trust_score ?? 0,
      language: repository.language ?? "unknown",
      updated_at: repository.updated_at ?? "unknown"
    }
  };
}

function targetingStatusLabel(status) {
  const map = {
    idle: "Ready",
    submitting: "Deploying Mission Telemetry Matrix...",
    awaiting_confirmation: "Awaiting SSE Confirmation",
    confirmed: "Mission Confirmed",
    cache_standby: "Fresh Cache Standby",
    completed: "Dispatch Staged",
    isolated: "Isolated by Protection AI",
    error: "Targeting Error"
  };
  return map[status] ?? "Ready";
}
