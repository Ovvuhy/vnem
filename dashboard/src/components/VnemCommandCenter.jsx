import { useState } from "react";
import { AlertTriangle, GitBranch, Play, Radio, RefreshCcw, Search, ShieldCheck, X } from "lucide-react";
import { normalizeRequestError } from "../lib/vnemApiClient.js";
import { Badge } from "./PipelinePrimitives.jsx";

export function VnemCommandCenter({ workStatus, telemetry, apiClient, onBranchPreview, onBranchPrepared, onReviewCandidate }) {
  const [actionState, setActionState] = useState("idle");
  const [actionError, setActionError] = useState(null);
  const [prepareOpen, setPrepareOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [prepareResult, setPrepareResult] = useState(null);
  const mission = workStatus.mission;
  const topCandidate = workStatus.topCandidates[0] ?? null;
  const previewPlan = mission.givingBranch.requestPayload;

  async function redeployMission() {
    if (!workStatus.backendLive || !telemetry.deployTarget) return;
    setActionState("deploying");
    setActionError(null);
    const result = await telemetry.deployTarget({
      query: mission.query ?? mission.title ?? mission.id,
      vector: telemetry.mission?.vector ?? "github",
      threatTolerance: telemetry.mission?.threat_tolerance ?? telemetry.mission?.threatTolerance ?? 30
    });
    if (result?.ok === false) {
      setActionError(result.error ?? { message: "Mission deployment failed." });
      setActionState("idle");
      return;
    }
    setActionState("deployed");
  }

  async function previewBranch() {
    if (!workStatus.giving.previewAvailable || actionState === "previewing") return;
    setActionState("previewing");
    setActionError(null);
    try {
      const result = await apiClient.previewGivingBranch(previewPlan);
      onBranchPreview?.(result);
      setActionState("previewed");
    } catch (error) {
      setActionError(normalizeRequestError(error));
      setActionState("idle");
    }
  }

  async function prepareBranch() {
    if (confirmText !== previewPlan.branchName && confirmText !== "prepare-giving-branch") return;
    setActionState("preparing");
    setActionError(null);
    setPrepareResult(null);
    try {
      const result = await apiClient.prepareGivingBranch({ ...previewPlan, confirm: "prepare-giving-branch" });
      setPrepareResult(result);
      onBranchPrepared?.(result);
      setActionState(result?.ok ? "prepared" : "idle");
      if (result?.ok) setPrepareOpen(false);
      if (result?.ok === false) setActionError(result);
    } catch (error) {
      setActionError(normalizeRequestError(error));
      setActionState("idle");
    }
  }

  const primary = primaryAction({ workStatus, topCandidate, redeployMission, previewBranch, openPrepare: () => setPrepareOpen(true), onReviewCandidate });

  return (
    <section className="command-center" aria-label="VNEM AI command center">
      <div className="command-hero">
        <div className="command-title">
          <p className="eyebrow">command center</p>
          <h2>{workStatus.status.label}</h2>
          <p>{statusSentence(workStatus)}</p>
        </div>
        <div className="command-badges">
          <Badge tone={workStatus.status.tone}>{workStatus.status.label}</Badge>
          <Badge tone={workStatus.backendLive ? "ok" : "review"}>{workStatus.backendLive ? "backend live" : "backend offline"}</Badge>
          <Badge tone={workStatus.dataMode === "live" ? "ok" : "review"}>{workStatus.dataMode}</Badge>
        </div>
      </div>

      <div className="command-grid">
        <div className="command-card mission-card">
          <span className="command-icon"><Radio size={17} /></span>
          <div>
            <span>Current mission</span>
            <strong>{mission.title}</strong>
            <p>{mission.goal}</p>
          </div>
        </div>
        <div className="command-card blocker-card">
          <span className="command-icon"><AlertTriangle size={17} /></span>
          <div>
            <span>Blocker / next action</span>
            <strong>{workStatus.blocker.reason}</strong>
            <p>{workStatus.nextAction}</p>
          </div>
        </div>
        <div className="command-card branch-card">
          <span className="command-icon"><GitBranch size={17} /></span>
          <div>
            <span>Safe branch</span>
            <strong>{workStatus.giving.branchStatus} · {workStatus.giving.branchName}</strong>
            <p>{workStatus.giving.branchEligible} branch-eligible · preview {workStatus.giving.previewStatus} · push {workStatus.giving.pushStatus}</p>
          </div>
        </div>
      </div>

      <div className="stage-rail" aria-label="AI workflow stages">
        <Stage icon={Search} label="Research" state={workStatus.research.state} active={workStatus.activeStage === "research"} />
        <Stage icon={ShieldCheck} label="Protection" state={workStatus.protection.state} active={workStatus.activeStage === "protection"} />
        <Stage icon={Play} label="Giving" state={`${workStatus.giving.branchEligible} eligible`} active={workStatus.activeStage === "giving"} />
        <Stage icon={GitBranch} label="Branch" state={workStatus.giving.branchStatus} active={workStatus.activeStage === "branch"} />
      </div>

      <div className="command-action-row">
        <button type="button" className="primary-action" onClick={primary.onClick} disabled={!primary.enabled || ["deploying", "previewing", "preparing"].includes(actionState)}>
          {["deploying", "previewing", "preparing"].includes(actionState) ? <RefreshCcw size={17} /> : primary.icon}
          {actionState === "deploying" ? "Redeploying..." : actionState === "previewing" ? "Previewing..." : actionState === "preparing" ? "Preparing..." : primary.label}
        </button>
        <button type="button" className="secondary-action" onClick={redeployMission} disabled={!workStatus.backendLive || actionState === "deploying"}>
          <Radio size={16} /> Start / redeploy mission
        </button>
        <button type="button" className="secondary-action" onClick={() => setPrepareOpen(true)} disabled={!workStatus.giving.prepareEnabled} title={workStatus.giving.prepareDisabledReason}>
          <GitBranch size={16} /> Prepare Giving branch
        </button>
        <div className="action-explain">
          <strong>{primary.detail}</strong>
          <span>{workStatus.giving.prepareDisabledReason}</span>
        </div>
      </div>
      {actionError ? <div className="inline-error">{actionError.message ?? actionError.error ?? "Action failed"}</div> : null}
      {actionState === "deployed" ? <div className="inline-success">Mission redeploy request accepted. Waiting for telemetry confirmation.</div> : null}
      {actionState === "previewed" ? <div className="inline-success">Branch preview returned from backend. No git mutation was performed.</div> : null}

      <div className="reality-strip">
        <span>Last real research event: <strong>{workStatus.research.lastEventAgeLabel}</strong></span>
        <span>Current route: <strong>{workStatus.research.currentRoute}</strong></span>
        <span>Provider: <strong>{workStatus.providerLabel}</strong></span>
        <span>Protection: <strong>metadata-level only, not full malware scanning</strong></span>
      </div>

      {prepareOpen ? (
        <div className="modal-backdrop" role="presentation">
          <div className="review-modal prepare-modal" role="dialog" aria-modal="true" aria-label="Prepare Giving branch confirmation">
            <button className="icon-button modal-close" type="button" onClick={() => setPrepareOpen(false)} aria-label="Close prepare confirmation"><X size={18} /></button>
            <p className="eyebrow">Giving AI branch confirmation</p>
            <h2>Prepare Giving branch</h2>
            <p>This will create/push a review branch only. It will not merge to main.</p>
            <div className="prepare-plan-grid">
              <span>Branch</span><strong>{previewPlan.branchName}</strong>
              <span>Base</span><strong>{previewPlan.baseBranch}</strong>
              <span>Included</span><strong>{previewPlan.includedCandidates?.length ?? 0} candidates</strong>
              <span>Excluded</span><strong>{previewPlan.excludedCandidates?.length ?? 0} candidates</strong>
            </div>
            <div className="candidate-reasons">
              {(previewPlan.validationCommands ?? []).map((command) => <span key={command}>{command}</span>)}
            </div>
            <p className="inline-warning">Manual review is still required. Quarantine/blocked candidates and unreviewed needs-review candidates must not be included.</p>
            <label className="confirm-field">
              Type exact branch name or prepare-giving-branch
              <input value={confirmText} onChange={(event) => setConfirmText(event.target.value)} placeholder={previewPlan.branchName} />
            </label>
            <div className="modal-actions">
              <button type="button" className="secondary-action" onClick={() => setPrepareOpen(false)}>Cancel</button>
              <button type="button" className="primary-action" onClick={prepareBranch} disabled={actionState === "preparing" || (confirmText !== previewPlan.branchName && confirmText !== "prepare-giving-branch")}>
                {actionState === "preparing" ? "Preparing and validating..." : "Prepare Giving branch"}
              </button>
            </div>
            {prepareResult ? <div className={prepareResult.ok ? "inline-success" : "inline-error"}>{prepareResult.message ?? prepareResult.nextAction ?? "Prepare result received."}</div> : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Stage({ icon: Icon, label, state, active }) {
  return (
    <div className={`stage-chip ${active ? "active" : ""}`}>
      <Icon size={16} />
      <span>{label}</span>
      <strong>{state}</strong>
    </div>
  );
}

function primaryAction({ workStatus, topCandidate, redeployMission, previewBranch, openPrepare, onReviewCandidate }) {
  if (!workStatus.backendLive) {
    return { label: "Start backend first", detail: "Live actions need the local app server.", enabled: false, icon: <AlertTriangle size={17} /> };
  }
  if (workStatus.giving.prepareEnabled) {
    return { label: "Advance pipeline safely", detail: "Preview passed; open exact branch-name confirmation before any branch write.", enabled: true, icon: <GitBranch size={17} />, onClick: openPrepare };
  }
  if (workStatus.giving.previewAvailable && workStatus.giving.previewStatus !== "ready") {
    return { label: "Advance pipeline safely", detail: "Next safe step: preview branch plan only; it does not mutate git.", enabled: true, icon: <GitBranch size={17} />, onClick: previewBranch };
  }
  if (topCandidate) {
    return { label: "Advance pipeline safely", detail: "Next safe step: review the best candidate first instead of scanning every raw finding.", enabled: true, icon: <ShieldCheck size={17} />, onClick: () => onReviewCandidate?.(topCandidate) };
  }
  return { label: "Advance pipeline safely", detail: "Next safe step: redeploy a focused intelligence mission and wait for real telemetry.", enabled: true, icon: <Radio size={17} />, onClick: redeployMission };
}

function statusSentence(workStatus) {
  if (workStatus.status.key === "waiting-for-review") {
    return `VNEM is stuck at Protection review. ${workStatus.triage.total} candidates need triage and ${workStatus.triage.branchEligible} are branch-eligible.`;
  }
  if (workStatus.status.key === "ready-for-branch-preview") {
    return `VNEM can preview a Giving branch. ${workStatus.triage.branchEligible} candidate${workStatus.triage.branchEligible === 1 ? " is" : "s are"} allowed by current checks.`;
  }
  if (workStatus.status.key === "branch-preview-ready") {
    return "VNEM has a backend branch preview. Prepare still requires exact branch-name confirmation and backend validation before any review-branch write.";
  }
  if (workStatus.status.key === "backend-offline") {
    return "VNEM is showing sample/summary data only; live AI actions are disabled until the app server connects.";
  }
  return workStatus.blocker.reason;
}
