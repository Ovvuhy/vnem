import { useEffect, useState } from "react";
import { AlertTriangle, Radio } from "lucide-react";
import { vectorLabel } from "../lib/dashboardFormat.js";
import { Badge } from "./PipelinePrimitives.jsx";

const toleranceValues = [15, 30, 50];

export function TargetingConsole({ telemetry, execution }) {
  const activeMission = execution?.mission ?? telemetry.mission ?? telemetry.pipeline?.mission ?? null;
  const [systemMode, setSystemMode] = useState("cruise");
  const [researchTarget, setResearchTarget] = useState("");
  const [selectedVector, setSelectedVector] = useState("github");
  const [threatTolerance, setThreatTolerance] = useState("30");
  const manualOverride = systemMode === "manual";
  const busy = execution?.consoleLocked ?? ["submitting", "awaiting_confirmation"].includes(telemetry.targetingStatus);
  const controlsLocked = busy || !manualOverride;
  const missionQuery = activeMission?.query ?? "luau architecture OR agentic workflow";
  const missionVector = activeMission?.vectorLabel ?? activeMission?.vector_label ?? vectorLabel(activeMission?.vector ?? "github");
  const missionTolerance = activeMission?.threatTolerance ?? activeMission?.threat_tolerance ?? 30;
  const sliderIndex = Math.max(0, toleranceValues.indexOf(Number(threatTolerance)));
  const tickerItems = execution?.cruiseTicker?.length ? execution.cruiseTicker : [
    { label: "GitHub Repositories", value: missionQuery },
    { label: "NPM Package Registry", value: "package metadata and trust scoring standby" },
    { label: "MCP Tool Catalog", value: "local catalog adapter metadata watch" }
  ];

  useEffect(() => {
    const nextTolerance = activeMission?.threatTolerance ?? activeMission?.threat_tolerance;
    if (nextTolerance) {
      setThreatTolerance(String(nextTolerance));
    }
  }, [activeMission?.threatTolerance, activeMission?.threat_tolerance]);

  useEffect(() => {
    if (activeMission?.vector) {
      setSelectedVector(activeMission.vector);
    }
  }, [activeMission?.vector]);

  async function submitTarget(event) {
    event.preventDefault();
    const query = researchTarget.trim();
    if (!manualOverride || !query || busy) {
      return;
    }
    await telemetry.deployTarget?.({
      query,
      vector: selectedVector,
      threatTolerance: Number(threatTolerance)
    });
  }

  return (
    <section className={`targeting-console ${manualOverride ? "manual-mode" : "cruise-mode"}`} aria-label="Dynamic targeting console">
      <div className="targeting-copy">
        <p className="eyebrow">dynamic targeting console</p>
        <h2>{manualOverride ? "Manual Override armed" : "Autonomous Cruise active"}</h2>
        <p>
          {manualOverride
            ? "Force a source-specific mission into the live intelligence engine while the background cruise lane yields control."
            : "Hermes keeps indexing source routes in the background. Switch to Manual Override only when you need to force a specific target."}
        </p>
        <div className="system-mode-toggle" role="group" aria-label="System mode">
          <button type="button" className={systemMode === "cruise" ? "active" : ""} onClick={() => setSystemMode("cruise")} aria-pressed={systemMode === "cruise"}>
            Autonomous Cruise
          </button>
          <button type="button" className={systemMode === "manual" ? "active" : ""} onClick={() => setSystemMode("manual")} aria-pressed={systemMode === "manual"}>
            Manual Override
          </button>
        </div>
      </div>
      <form className={`targeting-form ${controlsLocked ? "controls-dimmed" : ""}`} onSubmit={submitTarget}>
        <label className="target-input">
          <span>research target</span>
          <input
            value={researchTarget}
            onChange={(event) => setResearchTarget(event.target.value)}
            placeholder="high-performance luau architecture"
            minLength={3}
            maxLength={180}
            readOnly={!manualOverride}
            disabled={busy}
          />
        </label>
        <label className="vector-select">
          <span>intelligence vector</span>
          <select value={selectedVector} onChange={(event) => setSelectedVector(event.target.value)} disabled={controlsLocked}>
            <option value="github">GitHub Repositories</option>
            <option value="npm">NPM Package Registry</option>
            <option value="mcp">MCP Tool Catalog</option>
          </select>
        </label>
        <label className="tolerance-slider">
          <span>threat tolerance</span>
          <input
            type="range"
            min="0"
            max="2"
            step="1"
            value={sliderIndex < 0 ? 1 : sliderIndex}
            onChange={(event) => setThreatTolerance(String(toleranceValues[Number(event.target.value)]))}
            disabled={controlsLocked}
          />
          <strong>{threatTolerance}% {toleranceLabel(threatTolerance)}</strong>
        </label>
        <button type="submit" className="primary-action targeting-submit" disabled={!manualOverride || busy || researchTarget.trim().length < 3}>
          <Radio size={17} />
          {busy ? "Deploying..." : manualOverride ? "Deploy Intelligence" : "Cruise Locked"}
        </button>
      </form>
      <div className="cruise-ticker" aria-label="Autonomous cruise telemetry ticker">
        <span className="ticker-status">{manualOverride ? "background cruise suspended" : "background cruise scanning"}</span>
        <div className="ticker-track">
          {tickerItems.map((item, index) => (
            <div className="ticker-item" key={`${item.label}-${item.value}-${index}`}>
              <em>{item.label}</em>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>
      </div>
      <div className="targeting-readout">
        <div>
          <span>active mission</span>
          <strong>{missionQuery}</strong>
        </div>
        <Badge tone="quiet">{missionVector}</Badge>
        <Badge tone={telemetry.targetingStatus === "confirmed" ? "ok" : "review"}>
          {missionTolerance}% tolerance
        </Badge>
        <Badge tone={telemetry.targetingStatus === "cache_standby" ? "quiet" : telemetry.status === "connected" ? "ok" : "watchlist"}>
          {execution?.consoleStateLabel ?? targetingStatusLabel(telemetry.targetingStatus)}
        </Badge>
      </div>
      <div className="targeting-step-readout">
        <span>{execution?.phase?.label ?? "Telemetry Standing By"}</span>
        <p>{execution?.phase?.detail ?? "No active mission is running."}</p>
      </div>
      {telemetry.targetingError ? (
        <div className="targeting-error" role="status">
          <AlertTriangle size={16} />
          <span>{telemetry.targetingError.error_code ?? telemetry.targetingError.error}</span>
          {telemetry.targetingError.message ? <small>{telemetry.targetingError.message}</small> : null}
        </div>
      ) : null}
    </section>
  );
}

function toleranceLabel(value) {
  const number = Number(value);
  if (number <= 15) return "strict";
  if (number >= 50) return "experimental";
  return "standard";
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
