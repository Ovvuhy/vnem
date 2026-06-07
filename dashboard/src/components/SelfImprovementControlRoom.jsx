import { useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, ExternalLink, GitBranch, ListChecks, Radio, RefreshCcw, Search, ShieldCheck, X } from "lucide-react";
import { Badge } from "./PipelinePrimitives.jsx";

export function SelfImprovementControlRoom({ controlRoom, onAdvance, onReviewCandidate, onCandidateReviewDecision, onPreviewBranch, onOpenPrepare, onRefreshBuilderHealth, busy = false }) {
  const [activeCandidate, setActiveCandidate] = useState(null);
  const { overview, run, reviewInbox, branchWorkbench, builderHealth, timeline, nextAction } = controlRoom;
  const openCandidateDrawer = (candidate) => {
    if (candidate) setActiveCandidate(candidate);
  };
  const actionHandler = nextAction.key === "review-candidate"
    ? () => openCandidateDrawer(nextAction.candidate ?? reviewInbox.topReviewCandidates[0])
    : nextAction.key === "preview-branch"
      ? onPreviewBranch
      : nextAction.key === "open-prepare"
        ? onOpenPrepare
        : onAdvance;

  return (
    <section className="control-room" aria-label="VNEM Self-Improvement Control Room">
      <div className="control-room-hero">
        <div>
          <p className="eyebrow">self-improvement control room v1</p>
          <h2>{overview.statusLabel}</h2>
          <p>{overview.nextSafeAction}. {overview.topBlocker}</p>
        </div>
        <div className="control-room-actions">
          <Badge tone={run.backendStatus === "live" ? "ok" : "review"}>{run.backendStatus === "live" ? "backend live" : "backend offline"}</Badge>
          <Badge tone={run.dataMode === "live" ? "ok" : "review"}>{run.dataMode}</Badge>
          <button type="button" className="primary-action" onClick={actionHandler} disabled={!nextAction.enabled || busy}>
            {busy ? <RefreshCcw size={17} /> : <ShieldCheck size={17} />}
            {busy ? "Working..." : "Advance pipeline safely"}
          </button>
        </div>
      </div>

      <div className="control-room-kpis">
        <Kpi label="Candidates found" value={overview.candidatesFound} />
        <Kpi label="Branch-ready" value={overview.branchReady} tone={overview.branchReady > 0 ? "ok" : ""} />
        <Kpi label="Needs review" value={overview.needsReview} tone={overview.needsReview > 0 ? "review" : ""} />
        <Kpi label="Blocked / quarantined" value={overview.isolated} tone={overview.isolated > 0 ? "critical" : "ok"} />
        <Kpi label="Safe branch" value={overview.safeBranchStatus} />
      </div>

      <div className="control-room-grid">
        <ActiveMissionRun run={run} />
        <NextSafeAction nextAction={nextAction} />
      </div>

      <ReviewInbox inbox={reviewInbox} onReviewCandidate={openCandidateDrawer} onCandidateReviewDecision={onCandidateReviewDecision} />
      <GivingBranchWorkbench workbench={branchWorkbench} onPreviewBranch={onPreviewBranch} onOpenPrepare={onOpenPrepare} />
      <SelfImprovementTimeline timeline={timeline} />
      <BuilderHealthCard health={builderHealth} onRefresh={onRefreshBuilderHealth} />
      {activeCandidate ? (
        <CandidateReviewDrawer
          candidate={activeCandidate}
          busy={busy}
          onClose={() => setActiveCandidate(null)}
          onOpenLegacyReview={() => onReviewCandidate?.(activeCandidate)}
          onDecision={async (decision, notes) => {
            await onCandidateReviewDecision?.(activeCandidate, decision, notes);
            setActiveCandidate(null);
          }}
        />
      ) : null}
    </section>
  );
}

function Kpi({ label, value, tone = "" }) {
  return <div className={`control-kpi ${tone}`}><span>{label}</span><strong>{value}</strong></div>;
}

function ActiveMissionRun({ run }) {
  return (
    <article className="control-card active-run-card">
      <div className="section-title-row"><span>active mission run</span><Badge tone={run.backendStatus === "live" ? "ok" : "review"}>{run.backendStatus}</Badge></div>
      <h3>{run.missionTitle}</h3>
      <p>{run.goal}</p>
      <dl className="control-facts">
        <div><dt>stage</dt><dd>{run.currentStage}</dd></div>
        <div><dt>provider</dt><dd>{run.providerStatus}</dd></div>
        <div><dt>data</dt><dd>{run.dataMode}</dd></div>
        <div><dt>updated</dt><dd>{formatMaybeTime(run.updatedAt)}</dd></div>
      </dl>
      {run.backendStatus !== "live" ? <div className="inline-warning">Backend offline. Start the local VNEM app server to run live self-improvement.</div> : null}
    </article>
  );
}

function NextSafeAction({ nextAction }) {
  return (
    <article className="control-card next-action-card">
      <div className="section-title-row"><span>next safe action</span><Badge tone={nextAction.enabled ? "ok" : "review"}>{nextAction.key}</Badge></div>
      <h3>{nextAction.label}</h3>
      <p>{nextAction.detail}</p>
      <ul className="safety-boundaries">
        <li>No discovered repo execution.</li>
        <li>No package install from candidates.</li>
        <li>No commit, merge, or push to main.</li>
        <li>Candidate decisions write local review records only.</li>
      </ul>
    </article>
  );
}

export function ReviewInbox({ inbox, onReviewCandidate, onCandidateReviewDecision }) {
  const lanes = inbox.lanes;
  const visibleLaneKeys = ["branchReady", "needsReview", "missingLicense", "needsPrimarySource", "weakSource"];
  const collapsedLaneKeys = ["duplicateLowSignal", "alreadyIndexed", "rejected", "quarantined", "blocked"];
  return (
    <section className="control-panel review-inbox" aria-label="Review Inbox">
      <div className="panel-head compact"><div><p className="eyebrow">review inbox</p><h2>Best candidates first, grouped noise later</h2></div><Badge tone={inbox.summary.branchReady > 0 ? "ok" : "review"}>{inbox.summary.branchReady} branch-ready</Badge></div>
      <div className="inbox-summary">
        <span><strong>{inbox.summary.found}</strong> found</span>
        <span><strong>{inbox.summary.branchReady}</strong> branch-ready</span>
        <span><strong>{inbox.summary.worthReviewingFirst}</strong> worth reviewing first</span>
        <span><strong>{inbox.summary.alreadyIndexed}</strong> already indexed</span>
        <span><strong>{inbox.summary.lowSignalHidden}</strong> low signal hidden</span>
        <span><strong>{inbox.summary.quarantined}</strong> quarantined</span>
        <span><strong>{inbox.summary.blocked}</strong> blocked</span>
      </div>
      <div className="review-lanes primary-lanes">
        {visibleLaneKeys.map((key) => <ReviewLane key={key} lane={lanes[key]} onReviewCandidate={onReviewCandidate} onCandidateReviewDecision={onCandidateReviewDecision} />)}
      </div>
      <details className="collapsed-lanes">
        <summary>Grouped / lower-priority candidates and isolated findings</summary>
        <div className="review-lanes compact-lanes">
          {collapsedLaneKeys.map((key) => <ReviewLane key={key} lane={lanes[key]} onReviewCandidate={onReviewCandidate} onCandidateReviewDecision={onCandidateReviewDecision} compact />)}
        </div>
      </details>
    </section>
  );
}

function ReviewLane({ lane, onReviewCandidate, onCandidateReviewDecision, compact = false }) {
  return (
    <article className={`review-lane ${compact ? "compact" : ""}`}>
      <div className="lane-head"><strong>{lane.label}</strong><Badge tone={laneTone(lane.key)}>{lane.count}</Badge></div>
      {lane.items.length > 0 ? lane.items.map((candidate) => <CandidateMiniCard key={`${lane.key}-${candidate.id}`} candidate={candidate} onReviewCandidate={onReviewCandidate} onCandidateReviewDecision={onCandidateReviewDecision} />) : <p className="lane-empty">No visible candidate in this lane.</p>}
      {lane.count > lane.items.length ? <em>{lane.count - lane.items.length} more grouped below raw details.</em> : null}
    </article>
  );
}

function CandidateMiniCard({ candidate, onReviewCandidate, onCandidateReviewDecision }) {
  return (
    <div className="candidate-mini-card">
      <div className="candidate-mini-title"><strong>{candidate.title}</strong><Badge tone={candidate.verdictTone}>{candidate.verdictLabel}</Badge></div>
      <p>{candidate.summary}</p>
      <div className="candidate-meta-row">
        <span>{candidate.sourceRoute}</span>
        <span>trust {candidate.trustScore}%</span>
        <span>risk {candidate.threatScore}%</span>
      </div>
      <div className="candidate-reasons"><span>{candidate.branchEligible ? "branch eligible" : candidate.whyNotBranchEligible}</span>{candidate.license ? <span>license {candidate.license}</span> : <span>license unknown</span>}</div>
      <div className="mini-actions">
        {candidate.sourceUrl ? <a href={candidate.sourceUrl} target="_blank" rel="noreferrer"><ExternalLink size={13} /> source</a> : null}
        <button type="button" className="secondary-action" onClick={() => onReviewCandidate?.(candidate)}>Review modal</button>
      </div>
      <details className="candidate-inline-review">
        <summary>Review candidate details</summary>
        <p>{candidate.summary}</p>
        <dl className="candidate-review-detail-grid">
          <dt>ID</dt><dd><code>{candidate.id}</code></dd>
          <dt>Verdict</dt><dd>{candidate.verdictLabel}</dd>
          <dt>License</dt><dd>{candidate.licenseLabel ?? (candidate.license ? `license ${candidate.license}` : "license unknown")}</dd>
          <dt>Reason</dt><dd>{candidate.whyNotBranchEligible}</dd>
        </dl>
        <p className="inline-warning">Review decisions only write local records; they do not execute code, install packages, commit, push, or merge.</p>
        <div className="modal-actions left-actions">
          <button type="button" className="approve-action" onClick={() => onCandidateReviewDecision?.(candidate, "approve-for-giving", "Reviewed from Control Room inline detail.")}>Approve for Giving</button>
          <button type="button" className="secondary-action" onClick={() => onCandidateReviewDecision?.(candidate, "keep-reviewing", "Kept for more review from Control Room inline detail.")}>Keep reviewing</button>
          <button type="button" className="secondary-action" onClick={() => onCandidateReviewDecision?.(candidate, "reject-low-signal", "Rejected low signal from Control Room inline detail.")}>Reject low signal</button>
          <button type="button" className="danger-action" onClick={() => onCandidateReviewDecision?.(candidate, "quarantine", "Quarantined from Control Room inline detail.")}>Quarantine</button>
          <button type="button" className="danger-action" onClick={() => onCandidateReviewDecision?.(candidate, "block", "Blocked from Control Room inline detail.")}>Block</button>
        </div>
      </details>
    </div>
  );
}

function CandidateReviewDrawer({ candidate, busy, onClose, onOpenLegacyReview, onDecision }) {
  const [notes, setNotes] = useState("");
  const decisionButtons = [
    ["approve-for-giving", "Approve for Giving", "approve-action"],
    ["keep-reviewing", "Keep reviewing", "secondary-action"],
    ["reject-low-signal", "Reject low signal", "secondary-action"],
    ["quarantine", "Quarantine", "danger-action"],
    ["block", "Block", "danger-action"]
  ];
  const reviewReasons = (candidate.triageReasons ?? []).map((reason) => reason.label ?? reason).join("; ") || "No triage reasons provided.";

  return (
    <div className="dispatch-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.(); }}>
      <section className="dispatch-modal control-room-review-drawer" role="dialog" aria-modal="true" aria-labelledby="control-room-review-title">
        <header className="dispatch-modal-header">
          <div>
            <p className="eyebrow">review inbox candidate</p>
            <h2 id="control-room-review-title">{candidate.title}</h2>
            <p>{candidate.summary}</p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close candidate review"><X size={18} /></button>
        </header>

        <div className="dispatch-modal-meta" aria-label="Candidate metadata">
          <span>{candidate.sourceRoute}</span>
          <span>{candidate.verdictLabel}</span>
          <span>trust {candidate.trustScore}%</span>
          <span>risk {candidate.threatScore}%</span>
          <span>{candidate.licenseLabel ?? (candidate.license ? `license ${candidate.license}` : "license unknown")}</span>
        </div>

        <div className={`dispatch-verdict ${candidate.verdictTone}`} aria-label="Protection AI verdict">
          <strong>{candidate.verdictLabel}</strong>
          <span>{candidate.whyNotBranchEligible}</span>
          <em>{candidate.nextAction}</em>
        </div>

        <div className="dispatch-review-grid">
          <aside className="dispatch-notes" aria-label="Candidate safety notes">
            <DrawerNote title="Source" body={candidate.sourceUrl ?? "No source URL available."} />
            <DrawerNote title="Review reasons" body={reviewReasons} />
            <DrawerNote title="Safety boundary" body="These decisions only write a local review record. They do not execute code, install packages, commit, push, or merge." />
          </aside>
          <article className="dispatch-markdown" aria-label="Candidate review detail">
            <h3>Candidate detail</h3>
            <p>{candidate.summary}</p>
            <dl className="candidate-review-detail-grid">
              <dt>ID</dt><dd><code>{candidate.id}</code></dd>
              <dt>Source route</dt><dd>{candidate.sourceRoute}</dd>
              <dt>Trust</dt><dd>{candidate.trustScore}%</dd>
              <dt>Risk</dt><dd>{candidate.threatScore}%</dd>
              <dt>License</dt><dd>{candidate.licenseLabel ?? (candidate.license ? `license ${candidate.license}` : "license unknown")}</dd>
              <dt>Branch eligibility</dt><dd>{candidate.whyNotBranchEligible}</dd>
            </dl>
            {candidate.sourceUrl ? <a href={candidate.sourceUrl} target="_blank" rel="noreferrer">Open source</a> : null}
          </article>
        </div>

        <footer className="dispatch-modal-actions">
          <div className="candidate-review-actions">
            <p>This candidate has no staged dispatch yet. Approve only after checking source, license, permissions, and install/execution surface.</p>
            <label className="confirm-field">
              Review notes
              <textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Source, license, permissions, install surface, and why this decision is safe." rows={3} />
            </label>
            <div>
              {decisionButtons.map(([decision, label, className]) => (
                <button key={decision} className={className} type="button" onClick={() => onDecision?.(decision, notes)} disabled={busy}>{label}</button>
              ))}
              <button className="secondary-action" type="button" onClick={onOpenLegacyReview} disabled={busy}>Open legacy review modal</button>
            </div>
          </div>
        </footer>
      </section>
    </div>
  );
}

function DrawerNote({ title, body }) {
  return <div className="dispatch-note"><strong>{title}</strong><p>{body}</p></div>;
}

export function GivingBranchWorkbench({ workbench, onPreviewBranch, onOpenPrepare }) {
  return (
    <section className="control-panel branch-workbench" aria-label="Giving Branch Workbench">
      <div className="panel-head compact"><div><p className="eyebrow">giving branch workbench</p><h2>Preview, confirm, prepare, validate, then manual review</h2></div><Badge tone={workbench.canPreview ? "ok" : "review"}>{workbench.status}</Badge></div>
      <div className="branch-workbench-grid">
        <article className="branch-plan-card">
          <div className="branch-name"><GitBranch size={16} /><code>{workbench.branchName}</code></div>
          <dl className="control-facts">
            <div><dt>base</dt><dd>{workbench.baseBranch}</dd></div>
            <div><dt>preview</dt><dd>{workbench.previewStatus}</dd></div>
            <div><dt>prepare</dt><dd>{workbench.prepareConfirmationStatus}</dd></div>
            <div><dt>push</dt><dd>{workbench.pushStatus}</dd></div>
            <div><dt>commit</dt><dd>{workbench.commitHash ?? "not prepared"}</dd></div>
            <div><dt>review</dt><dd>{workbench.manualReviewStatus}</dd></div>
          </dl>
          <div className="modal-actions left-actions">
            <button type="button" className="secondary-action" disabled={!workbench.canPreview} onClick={onPreviewBranch}>Preview branch</button>
            <button type="button" className="primary-action" disabled={!workbench.canPrepare} onClick={onOpenPrepare}>Prepare branch</button>
          </div>
          {!workbench.canPreview ? <p className="inline-warning">No Giving branch can be prepared yet. {workbench.reason}</p> : null}
        </article>
        <article className="branch-plan-card">
          <h3>Validation commands</h3>
          <div className="command-list">{workbench.validationCommands.map((command) => <code key={command}>{command}</code>)}</div>
          <h3>Safety guards</h3>
          <ul className="guard-list">
            {Object.entries(workbench.guards).map(([key, value]) => <li className={value ? "ok" : "bad"} key={key}>{value ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />} {humanizeKey(key)}</li>)}
          </ul>
        </article>
        <article className="branch-plan-card checklist-card">
          <h3>Manual review checklist</h3>
          <ul>{workbench.checklist.map((item) => <li key={item.key} className={item.done ? "done" : ""}>{item.done ? <CheckCircle2 size={14} /> : <ListChecks size={14} />} {item.label}</li>)}</ul>
        </article>
      </div>
    </section>
  );
}

export function SelfImprovementTimeline({ timeline }) {
  return (
    <section className="control-panel improvement-timeline" aria-label="Self-improvement timeline">
      <div className="panel-head compact"><div><p className="eyebrow">timeline / evidence</p><h2>Readable run events before raw logs</h2></div><Badge tone="quiet">{timeline.length} events</Badge></div>
      <div className="timeline-list control-timeline-list">
        {timeline.map((event, index) => (
          <div className={`timeline-event ${event.severity}`} key={`${event.stage}-${event.title}-${index}`}>
            <span className="timeline-dot" />
            <div><strong>{event.title}</strong><p>{event.message}</p><em>{event.stage}{event.candidateId ? ` / ${event.candidateId}` : ""}{event.branchName ? ` / ${event.branchName}` : ""} · {formatMaybeTime(event.timestamp)}</em></div>
          </div>
        ))}
      </div>
    </section>
  );
}

function BuilderHealthCard({ health, onRefresh }) {
  if (!health) return null;
  return (
    <section className="control-panel builder-health-card" aria-label="Builder Health">
      <div className="panel-head compact">
        <div><p className="eyebrow">builder health</p><h2>Live session hygiene and run history</h2></div>
        <div className="builder-health-actions">
          <Badge tone={health.source === "backend" ? "ok" : "review"}>{health.source === "backend" ? "live backend" : "fallback"}</Badge>
          <button type="button" className="secondary-action" onClick={() => onRefresh?.()}><RefreshCcw size={14} /> Refresh builder health</button>
        </div>
      </div>
      <p className={health.source === "backend" ? "inline-success" : "inline-warning"}>{health.liveMessage}</p>
      <div className="builder-health-grid live-builder-grid">
        <span><strong>repo sync</strong>{health.repoSync.label}<small>branch {health.branch}</small></span>
        <span><strong>local / origin</strong><code>{health.localHeadShort}</code><small>origin {health.remoteHeadShort}</small></span>
        <span><strong>worktree</strong>{health.worktree.label}<small>{health.worktree.changedCount} changed · {health.worktree.untrackedCount} untracked</small></span>
        <span><strong>dispatch files</strong>{health.generatedDispatch.label}<small>{health.accidentalPaths.label}</small></span>
        <span><strong>backend 9099</strong>{health.backendPort.label}<small>read-only status</small></span>
        <span><strong>dashboard ports</strong>{health.dashboardPorts.label}<small>{health.dashboardPorts.runningPorts.length ? `running: ${health.dashboardPorts.runningPorts.join(", ")}` : "4174/4175 clean"}</small></span>
      </div>
      <div className="builder-run-summary builder-run-snapshot">
        <strong>{health.runSnapshot.label}: {health.runSnapshot.title}</strong>
        <p>status: {health.runSnapshot.status} · validation: {health.runSnapshot.validationStatus} ({health.runSnapshot.validationCommandCount} commands) · safety: {health.runSnapshot.safetyStatus} · generated: {health.runSnapshot.generatedStatus} · visual: {health.runSnapshot.visualStatus} · push: {health.runSnapshot.pushStatus}</p>
        <p>last capture: {health.runSnapshot.lastCapturedCommand} · {health.runSnapshot.lastCapturedStatus}{health.runSnapshot.failedCommand ? ` · failed: ${health.runSnapshot.failedCommand}` : ""}</p>
        <em>{health.runSnapshot.nextAction}</em>
      </div>
      {health.lastRun ? (
        <div className="builder-run-summary">
          <strong>{health.lastRun.title}</strong>
          <p>{health.lastRun.status} · commit {health.lastRun.commitShort} · validation: {health.lastRun.validationStatus} · visual: {health.lastRun.visualStatus}</p>
          <em>{health.lastRun.nextRecommendedImprovement}</em>
        </div>
      ) : <p>Self-improvement run history has no recorded runs yet.</p>}
      <p className="inline-warning">{health.staleOutputGuidance}</p>
      <p className="builder-cli-hint"><code>npm run builder:session</code> <code>npm run dev:health</code> CLI owns cleanup; the dashboard does not kill processes.</p>
      <p><strong>Next safe action:</strong> {health.nextSafeAction}</p>
    </section>
  );
}

function laneTone(key) {
  if (key === "branchReady") return "ok";
  if (["blocked", "quarantined"].includes(key)) return key === "blocked" ? "critical" : "warning";
  if (["duplicateLowSignal", "alreadyIndexed", "rejected"].includes(key)) return "quiet";
  return "review";
}
function humanizeKey(key) { return key.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase()); }
function shortCommit(value) { return value ? String(value).slice(0, 7) : "unknown"; }
function formatMaybeTime(value) { if (!value) return "not reported"; const date = new Date(value); return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString(); }
