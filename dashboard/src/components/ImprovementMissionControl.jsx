import { useState } from "react";
import { CheckCircle2, GitBranch, GitCommitHorizontal, LockKeyhole, PlayCircle, Radio, Route, ShieldAlert, Sparkles } from "lucide-react";
import { deriveImprovementMission } from "../lib/improvementMissions.js";
import { Badge } from "./PipelinePrimitives.jsx";

const stageOrder = [
  { key: "research", label: "Research AI" },
  { key: "protection", label: "Protection AI" },
  { key: "giving", label: "Giving AI" },
  { key: "branch", label: "Safe Branch" },
  { key: "review", label: "Manual Review" },
  { key: "main", label: "Main" }
];

export function ImprovementMissionControl({ telemetry, summary, apiClient = null, branchPreview = null, onBranchPreview = null }) {
  const [branchActionStatus, setBranchActionStatus] = useState("idle");
  const [branchActionError, setBranchActionError] = useState(null);
  const mission = deriveImprovementMission({ telemetry, summary, branchPreview });
  const stageStates = missionStageStates(mission);

  async function handlePreviewBranch() {
    if (!apiClient?.previewGivingBranch || !mission.givingBranch.requestPayload) return;
    setBranchActionStatus("previewing");
    setBranchActionError(null);
    try {
      const result = await apiClient.previewGivingBranch(mission.givingBranch.requestPayload);
      onBranchPreview?.(result);
      setBranchActionStatus("preview-ready");
    } catch (error) {
      const payload = error?.payload ?? { ok: false, message: error?.message ?? "Branch preview failed" };
      onBranchPreview?.(payload);
      setBranchActionError(payload.message ?? payload.error_code ?? "Branch preview failed");
      setBranchActionStatus("preview-error");
    }
  }

  return (
    <section className="mission-control" aria-label="VNEM improvement mission control">
      <div className="mission-header">
        <div>
          <p className="eyebrow">improvement mission engine v1</p>
          <div className="mission-title-row">
            <h2>{mission.title}</h2>
            <Badge tone={mission.status === "blocked" ? "critical" : mission.status === "ready-for-giving" ? "ok" : "review"}>{mission.status}</Badge>
            <Badge tone={mission.telemetryMode === "live" ? "ok" : "quiet"}>{mission.telemetryMode === "live" ? "live telemetry" : "offline / sample"}</Badge>
          </div>
          <p>{mission.goal}</p>
          <strong>{mission.nextAction}</strong>
        </div>
        <div className="mission-live-card">
          <Radio size={18} />
          <span>{mission.currentStage}</span>
          <em>main protected</em>
        </div>
      </div>

      <div className="mission-flow" aria-label="Research to branch pipeline">
        {stageOrder.map((stage) => (
          <div className={`mission-stage ${stageStates[stage.key]}`} key={stage.key}>
            <span>{stageIcon(stage.key)}</span>
            <strong>{stage.label}</strong>
            <em>{stageCopy(stage.key, mission)}</em>
          </div>
        ))}
      </div>

      <div className="mission-grid">
        <MissionVerdicts mission={mission} />
        <MissionBranchLane branch={mission.givingBranch} />
        <MissionTargets mission={mission} />
      </div>

      <div className="mission-lower-grid">
        <MissionActivity logs={mission.logs} />
        <MissionControls controls={mission.controls} status={branchActionStatus} error={branchActionError} onPreviewBranch={handlePreviewBranch} />
      </div>
    </section>
  );
}

function MissionVerdicts({ mission }) {
  const counts = [
    ["allow", "Allowed", mission.verdictSummary.allow, "ok"],
    ["needsReview", "Needs review", mission.verdictSummary.needsReview, "review"],
    ["quarantine", "Quarantined", mission.verdictSummary.quarantine, "warning"],
    ["blocked", "Blocked", mission.verdictSummary.blocked, "critical"]
  ];
  return (
    <article className="mission-card">
      <div className="section-title-row">
        <span>candidate verdicts</span>
        <Badge tone="quiet">{mission.candidates.length} candidates</Badge>
      </div>
      <div className="mission-verdict-counts">
        {counts.map(([key, label, count, tone]) => (
          <div className={`mission-verdict ${tone}`} key={key}>
            <strong>{count}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <div className="mission-candidate-list">
        {mission.candidates.slice(0, 4).map((candidate) => (
          <div className={`mission-candidate ${candidate.verdictTone}`} key={candidate.id}>
            <strong>{candidate.title}</strong>
            <span>{candidate.verdictLabel} / {candidate.sourceRoute}</span>
            <em>{candidate.givingEligible ? "Giving candidate" : "Isolated from Giving AI"}</em>
          </div>
        ))}
        {mission.candidates.length === 0 ? <p>No candidate has been emitted yet. Start a target to make Research AI work.</p> : null}
      </div>
    </article>
  );
}

function MissionBranchLane({ branch }) {
  return (
    <article className="mission-card branch-lane">
      <div className="section-title-row">
        <span>safe branch lane</span>
        <Badge tone={branch.status === "planned" ? "review" : branch.status === "blocked-by-protection" ? "critical" : "quiet"}>{branch.status}</Badge>
      </div>
      <div className="branch-name"><GitBranch size={16} /><code>{branch.name}</code></div>
      <dl className="branch-facts">
        <div><dt>base</dt><dd>{branch.base}</dd></div>
        <div><dt>commit</dt><dd>{branch.commit ?? "not created"}</dd></div>
        <div><dt>validation</dt><dd>{branch.validation}</dd></div>
        <div><dt>push</dt><dd>{branch.pushStatus}</dd></div>
        <div><dt>review</dt><dd>{branch.reviewStatus}</dd></div>
      </dl>
      <p><LockKeyhole size={14} /> Main stays protected. Preview validates the branch plan without mutating git; prepare requires explicit confirmation and backend checks.</p>
      {branch.error ? <p><ShieldAlert size={14} /> {branch.error}</p> : null}
      <div className="branch-inclusions">
        <span>{branch.includedCandidates.length} included</span>
        <span>{branch.blockedCandidateIds.length} isolated</span>
      </div>
    </article>
  );
}

function MissionTargets({ mission }) {
  return (
    <article className="mission-card">
      <div className="section-title-row">
        <span>research routes</span>
        <Badge tone="quiet">{mission.researchTargets.length} active/planned</Badge>
      </div>
      <div className="mission-targets">
        {mission.researchTargets.map((target) => (
          <div className="mission-target" key={target.route}>
            <Route size={15} />
            <strong>{target.label}</strong>
            <span>{target.status}</span>
          </div>
        ))}
      </div>
    </article>
  );
}

function MissionActivity({ logs }) {
  return (
    <article className="mission-card mission-activity">
      <div className="section-title-row">
        <span>mission activity</span>
        <Badge tone="quiet">latest {logs.length}</Badge>
      </div>
      {logs.map((log, index) => (
        <div className={`mission-log ${log.tone}`} key={`${log.stage}-${log.message}-${index}`}>
          <span>{log.stage}</span>
          <p>{log.message}</p>
        </div>
      ))}
    </article>
  );
}

function MissionControls({ controls, status, error, onPreviewBranch }) {
  return (
    <article className="mission-card mission-controls">
      <div className="section-title-row">
        <span>honest controls</span>
        <Badge tone={status === "preview-ready" ? "ok" : status === "preview-error" ? "critical" : "review"}>{status === "idle" ? "preview / protected" : status}</Badge>
      </div>
      {error ? <div className="inline-error">{error}</div> : null}
      {controls.map((control) => (
        <button
          type="button"
          className="mission-control-button"
          disabled={!control.enabled || status === "previewing"}
          key={control.key}
          onClick={control.key === "preview-branch" ? onPreviewBranch : undefined}
        >
          <PlayCircle size={15} />
          <span>
            <strong>{control.label}</strong>
            <em>{control.detail}</em>
          </span>
        </button>
      ))}
    </article>
  );
}

function missionStageStates(mission) {
  const active = mission.currentStage;
  return {
    research: active === "research" ? "active" : mission.candidates.length > 0 ? "complete" : "waiting",
    protection: active === "protection" ? "active" : mission.candidates.length > 0 ? "complete" : "waiting",
    giving: active === "giving" ? "active" : mission.givingBranch.includedCandidates.length > 0 ? "complete" : "waiting",
    branch: mission.givingBranch.status === "planned" ? "active" : mission.givingBranch.status === "blocked-by-protection" ? "blocked" : "waiting",
    review: mission.givingBranch.status === "planned" ? "waiting-review" : "waiting",
    main: "protected"
  };
}

function stageIcon(key) {
  const icons = {
    research: <Sparkles size={16} />,
    protection: <ShieldAlert size={16} />,
    giving: <CheckCircle2 size={16} />,
    branch: <GitBranch size={16} />,
    review: <GitCommitHorizontal size={16} />,
    main: <LockKeyhole size={16} />
  };
  return icons[key] ?? null;
}

function stageCopy(key, mission) {
  if (key === "research") return mission.researchTargets.map((target) => target.route).join(", ");
  if (key === "protection") return `${mission.verdictSummary.allow} allow / ${mission.verdictSummary.needsReview} review / ${mission.verdictSummary.quarantine + mission.verdictSummary.blocked} isolated`;
  if (key === "giving") return `${mission.givingBranch.includedCandidates.length} branch-eligible`;
  if (key === "branch") return mission.givingBranch.status;
  if (key === "review") return mission.givingBranch.reviewStatus;
  return "manual merge only";
}
