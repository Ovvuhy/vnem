import {
  Braces,
  GitBranch,
  Microscope,
  PackageCheck,
  Radio,
  ShieldAlert,
  ShieldCheck
} from "lucide-react";
import { formatMetric, formatTime } from "../lib/dashboardFormat.js";
import { Badge, SkeletonEmpty } from "./PipelinePrimitives.jsx";

export function AutonomousPipeline({ telemetry, execution }) {
  const active = execution.active;
  const stages = agentStages(active);

  return (
    <section className="pipeline-showcase" aria-label="Autonomous research and development pipeline">
      <div className="pipeline-hero">
        <div>
          <p className="eyebrow">autonomous r&amp;d pipeline</p>
          <h2>Research AI to Protection AI to Giving AI</h2>
          <p className="pipeline-copy">
            VNEM continuously converts external engineering signals into sandboxed, reviewable improvement dispatches.
          </p>
        </div>
        <div className="pipeline-live-card">
          <Radio size={18} />
          <span>{telemetry.status === "connected" ? "live telemetry linked" : `telemetry ${telemetry.status ?? "idle"}`}</span>
        </div>
      </div>

      <div className="pipeline-mission-strip">
        <span>active search query</span>
        <strong>{execution.mission.query}</strong>
        <Badge tone="quiet">{execution.mission.vectorLabel}</Badge>
        <Badge tone="review">{execution.mission.threatTolerance}% threat tolerance</Badge>
      </div>

      <PipelineStepper steps={execution.steps} />

      <div className="agent-flow" aria-label="Three-agent progression">
        {stages.map((stage, index) => (
          <div className={`agent-node ${stage.state}`} key={stage.key}>
            <div className="agent-node-top">
              <span className="agent-icon">{stage.icon}</span>
              <span className="agent-state">{stage.stateLabel}</span>
            </div>
            <h3>{stage.label}</h3>
            <p>{stage.description}</p>
            {index < stages.length - 1 ? <span className="agent-arrow" aria-hidden="true">-&gt;</span> : null}
          </div>
        ))}
      </div>

      <LineageManifest execution={execution} />

      <div className="pipeline-detail-grid">
        <ActiveIngestion active={active} />
        <TelemetryConsole events={execution.events} />
        <QueuePanel activeIngestions={execution.activeIngestions} queueDepth={execution.queueDepth} />
      </div>

      <div className="pipeline-intelligence-grid">
        <ContextFeed feed={execution.contextFeed} />
        <VectorDiagnostics diagnostics={execution.diagnostics} />
      </div>
    </section>
  );
}

function PipelineStepper({ steps }) {
  return (
    <div className="pipeline-stepper" aria-label="Mission execution stages">
      {steps.map((step, index) => (
        <div className={`pipeline-step ${step.state}`} key={step.key}>
          <div className="pipeline-step-index">{index + 1}</div>
          <div>
            <span>{step.title}</span>
            <strong>{step.message}</strong>
            <div className="pipeline-step-meta">
              {step.metadata.map((item) => <em key={item}>{item}</em>)}
            </div>
          </div>
          {index < steps.length - 1 ? <i className="pipeline-vector" aria-hidden="true" /> : null}
        </div>
      ))}
    </div>
  );
}

function LineageManifest({ execution }) {
  return (
    <div className="lineage-manifest" aria-label="Model and source lineage manifest">
      <div className="section-title-row">
        <span>model lineage manifest</span>
        <Badge tone="review">{execution.profile}</Badge>
      </div>
      <div className="lineage-grid">
        {execution.agentProfiles.map((profile) => (
          <div className={`lineage-profile ${profile.state}`} key={profile.key}>
            <strong>{profile.name}</strong>
            <span>{profile.role}</span>
            <Badge tone={profile.state === "active" ? "ok" : profile.state === "queued" ? "review" : "quiet"}>{profile.state}</Badge>
          </div>
        ))}
      </div>
      <div className="source-lineage">
        <span>source</span>
        <strong>{execution.sourceLineage.target}</strong>
        <em>{execution.sourceLineage.origin} / {execution.sourceLineage.route} / {execution.sourceLineage.trigger}</em>
      </div>
    </div>
  );
}

function ActiveIngestion({ active }) {
  return (
    <div className="pipeline-current">
      <div className="section-title-row">
        <span>active ingestion</span>
        <Badge tone={active ? riskTone(active.risk_tier) : "quiet"}>{active ? active.status : "idle"}</Badge>
      </div>
      {active ? (
        <>
          <h3>{active.title}</h3>
          <p>{active.latest_event?.message ?? "Pipeline event received."}</p>
          <div className="ingestion-meta">
            <span><GitBranch size={14} /> {active.source_origin}</span>
            <span><ShieldCheck size={14} /> {active.trust_score ?? "--"}% trust</span>
            <span><ShieldAlert size={14} /> {active.threat_score ?? 0}% threat</span>
          </div>
        </>
      ) : (
        <SkeletonEmpty title="Pipeline standing by" body="Telemetry is connected, but no active ingestion has been emitted yet." />
      )}
    </div>
  );
}

function TelemetryConsole({ events }) {
  return (
    <div className="pipeline-console" aria-label="Live telemetry events">
      <div className="section-title-row">
        <span>live event stream</span>
        <Badge tone={events.length > 0 ? "ok" : "quiet"}>{events.length} events</Badge>
      </div>
      {events.length > 0 ? events.map((event) => (
        <div className="console-line" key={`${event.timestamp}-${event.message}`}>
          <span>{formatTime(event.timestamp)}</span>
          <p>{event.message}</p>
        </div>
      )) : (
        <SkeletonEmpty title="Awaiting first event" body="The stream will populate as the local app server broadcasts pipeline updates." />
      )}
    </div>
  );
}

function QueuePanel({ activeIngestions, queueDepth }) {
  return (
    <div className="pipeline-queue">
      <div className="section-title-row">
        <span>queue depth</span>
        <Badge tone="review">{queueDepth} tracked</Badge>
      </div>
      <div className="queue-list">
        {activeIngestions.length > 0 ? activeIngestions.slice(0, 3).map((item) => (
          <div className="queue-row" key={item.id}>
            <strong>{item.title}</strong>
            <span>{item.action_dispatch} / {item.source_origin}</span>
          </div>
        )) : (
          <SkeletonEmpty title="No active queue" body="Baseline history will appear here after the app server reports active ingestions." />
        )}
      </div>
    </div>
  );
}

function ContextFeed({ feed }) {
  return (
    <div className="context-feed-panel">
      <div className="section-title-row">
        <span>context ingestion feed</span>
        <Badge tone={feed.matches.length > 0 ? "ok" : "quiet"}>{feed.matches.length} signal match</Badge>
      </div>
      <div className="context-highlights">
        {feed.matches.length > 0 ? feed.matches.map((match) => <span key={match}>{match}</span>) : <span>no highlighted signal yet</span>}
      </div>
      <div className="context-feed-lines">
        {feed.rows.map((row, index) => (
          <div className={`context-feed-line ${row.tone ?? ""}`} key={`${row.label}-${index}`}>
            <span>{row.label}</span>
            <strong>{row.value}</strong>
          </div>
        ))}
      </div>
      <div className="serialization-preview">
        <Braces size={16} />
        <div>
          <strong>serialized into {feed.dispatchPath}</strong>
          {feed.serializedPreview.map((line) => <span key={line}>{line}</span>)}
        </div>
      </div>
    </div>
  );
}

function VectorDiagnostics({ diagnostics }) {
  return (
    <div className={`vector-diagnostics ${diagnostics.type}`}>
      <div className="section-title-row">
        <span>ingestion diagnostics</span>
        <Badge tone={diagnostics.type === "github" ? "quiet" : "review"}>{diagnostics.type}</Badge>
      </div>
      <h3>{diagnostics.title}</h3>
      <p>{diagnostics.description}</p>
      {diagnostics.type === "npm" ? <NpmDiagnostics diagnostics={diagnostics} /> : null}
      {diagnostics.type === "mcp" ? <McpDiagnostics diagnostics={diagnostics} /> : null}
      {diagnostics.type === "github" ? <GithubDiagnostics diagnostics={diagnostics} /> : null}
    </div>
  );
}

function NpmDiagnostics({ diagnostics }) {
  const metrics = diagnostics.metrics ?? {};
  const rows = [
    ["Search Score", metrics.search_score],
    ["Final Score", metrics.final_score],
    ["Quality", metrics.quality],
    ["Popularity", metrics.popularity],
    ["Recency", metrics.recency_score],
    ["Keyword Boost", metrics.keyword_boost],
    ["Candidate Score", metrics.candidate_score]
  ];
  return (
    <>
      <div className="diagnostic-metric-grid">
        {rows.map(([label, value]) => (
          <div className="diagnostic-metric" key={label}>
            <span>{label}</span>
            <strong>{formatMetric(value)}</strong>
          </div>
        ))}
      </div>
      <code>{diagnostics.formula}</code>
    </>
  );
}

function McpDiagnostics({ diagnostics }) {
  const adapter = diagnostics.adapter ?? {};
  return (
    <div className="mcp-adapter-grid">
      <div><span>mode</span><strong>{adapter.mode ?? adapter.adapter ?? "deterministic-local"}</strong></div>
      <div><span>route</span><strong>{adapter.route ?? "mcp-registry"}</strong></div>
      <div><span>sync status</span><strong>{adapter.sync_status ?? "federated registry sync pending"}</strong></div>
      <div><span>execution</span><strong>{adapter.execution ?? "catalog metadata only"}</strong></div>
    </div>
  );
}

function GithubDiagnostics({ diagnostics }) {
  const metrics = diagnostics.metrics ?? {};
  return (
    <div className="mcp-adapter-grid">
      <div><span>trust score</span><strong>{metrics.trust_score ?? 0}%</strong></div>
      <div><span>language</span><strong>{metrics.language ?? "unknown"}</strong></div>
      <div><span>updated</span><strong>{metrics.updated_at ?? "unknown"}</strong></div>
    </div>
  );
}

function agentStages(active) {
  const activeAgent = active?.current_agent;
  return [
    {
      key: "research",
      label: "Research AI",
      description: "Scrapes GitHub, NPM, MCP routes, and optimization trails.",
      icon: <Microscope size={20} />,
      state: activeAgent === "research" ? "active" : active ? "standby" : "idle",
      stateLabel: activeAgent === "research" ? "compute cycle" : active ? "background watch" : "cruise watch"
    },
    {
      key: "protection",
      label: "Protection AI",
      description: "Sandboxes payloads, scores threat vectors, and isolates risky findings.",
      icon: <ShieldAlert size={20} />,
      state: activeAgent === "protection" ? "active" : activeAgent === "research" ? "queued" : active ? "standby" : "idle",
      stateLabel: activeAgent === "protection" ? "signature scan" : activeAgent === "research" ? "handoff queued" : "guard ready"
    },
    {
      key: "giving",
      label: "Giving AI",
      description: "Formats safe source dispatches and reviewable upgrade patches.",
      icon: <PackageCheck size={20} />,
      state: activeAgent === "giving" ? "active" : activeAgent === "complete" ? "complete" : active ? "standby" : "idle",
      stateLabel: activeAgent === "giving" ? "staging dispatch" : activeAgent === "complete" ? "dispatch sealed" : "handoff ready"
    }
  ];
}

function riskTone(riskTier) {
  if (riskTier === "critical") return "critical";
  if (riskTier === "review") return "review";
  if (riskTier === "low") return "ok";
  return "quiet";
}
