import { AlertTriangle, CheckCircle2, Clock3, GitBranch, ListChecks, LockKeyhole, Radio, RefreshCcw, Search, ShieldCheck, Sparkles } from "lucide-react";
import { Badge } from "./PipelinePrimitives.jsx";

export function ArdOperatorConsole({
  model,
  onRunPipeline,
  pipelineBusy = false,
  pipelineError = null,
  onReviewCandidate,
  onPreviewChanges,
  onPrepareChanges,
  onPushChanges,
  changesBusy = "idle",
  changesError = null,
  changesConfirmation = "",
  onChangesConfirmationChange,
  advancedChildren = null
}) {
  const pushUnlocked = changesConfirmation === model.changesByArd.requiredConfirmation;
  return (
    <section className="ard-operator-console" aria-label="ARD operator console">
      <header className="ard-mission-header">
        <div>
          <p className="eyebrow">{model.missionHeader.eyebrow}</p>
          <h2>{model.missionHeader.title}</h2>
          <p>{model.missionHeader.summary}</p>
        </div>
        <div className="operator-proof-stack">
          <Badge tone="ok">real: local dashboard</Badge>
          <Badge tone="review">proof: {model.missionHeader.proofLevel}</Badge>
          <Badge tone="quiet">planned features labeled</Badge>
        </div>
      </header>

      <section className="operator-control-center" aria-label="ARD Control Center">
        <div className="operator-control-copy">
          <p className="eyebrow">ARD Control Center</p>
          <h3>{model.controlCenter.nextAction}</h3>
          <p>{model.controlCenter.nextActionDetail}</p>
          {pipelineError || model.pipelineError ? <p className="inline-error">{pipelineError?.message ?? model.pipelineError}</p> : null}
        </div>
        <div className="operator-actions">
          <button type="button" className="primary-action" onClick={onRunPipeline} disabled={pipelineBusy}>
            {pipelineBusy ? <RefreshCcw size={17} /> : <ShieldCheck size={17} />}
            {pipelineBusy ? "Running ARD pipeline..." : model.controlCenter.primaryActionLabel}
          </button>
          <Badge tone={model.controlCenter.backendStatus === "live" ? "ok" : "review"}>backend {model.controlCenter.backendStatus}</Badge>
          <Badge tone="ok">main protected</Badge>
        </div>
        <div className="operator-kpi-grid">
          <OperatorKpi label="Candidates" value={model.controlCenter.candidatesFound} />
          <OperatorKpi label="Needs review" value={model.controlCenter.needsReview} tone={model.controlCenter.needsReview ? "review" : "ok"} />
          <OperatorKpi label="Dangerous" value={model.controlCenter.dangerous} tone={model.controlCenter.dangerous ? "critical" : "ok"} />
          <OperatorKpi label="Changes branch" value={model.controlCenter.changesBranch} />
        </div>
      </section>

      <section className="operator-panel" aria-label="Pipeline Timeline">
        <div className="operator-section-head">
          <div><p className="eyebrow">pipeline timeline</p><h3>Research → Protection → Giving → Changes by ARD → Manual Review</h3></div>
          <Badge tone="review">public state only</Badge>
        </div>
        <div className="operator-timeline">
          {model.pipelineTimeline.map((stage) => (
            <article key={stage.key} className={`operator-stage ${toneForStatus(stage.status)}`}>
              <span>{iconForStage(stage.key)}</span>
              <strong>{stage.label}</strong>
              <em>{stage.status}</em>
              <p>{stage.summary}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="operator-two-column">
        <article className="operator-panel changes-operator-card" aria-label="Changes by ARD protected branch">
          <div className="operator-section-head">
            <div><p className="eyebrow">protected branch</p><h3>{model.changesByArd.displayName}</h3></div>
            <Badge tone={model.changesByArd.statusLabel === "pushed" ? "ok" : "review"}>{model.changesByArd.statusLabel}</Badge>
          </div>
          <p>{model.changesByArd.warningCopy}</p>
          <dl className="operator-facts">
            <div><dt>Git branch</dt><dd>{model.changesByArd.branchName}</dd></div>
            <div><dt>Main protected</dt><dd>{model.changesByArd.mainProtected ? "yes" : "no"}</dd></div>
            <div><dt>Mode</dt><dd>{model.changesByArd.mode}</dd></div>
            <div><dt>Auto-merge</dt><dd>{model.safety.autoMergeAllowed ? "allowed" : "not allowed"}</dd></div>
          </dl>
          <div className="control-actions compact-actions">
            <button type="button" className="secondary-action" onClick={onPreviewChanges} disabled={changesBusy === "previewing"}>{changesBusy === "previewing" ? "Previewing..." : model.changesByArd.buttonLabels.preview}</button>
            <button type="button" className="secondary-action" onClick={onPrepareChanges} disabled={changesBusy === "preparing"}>{changesBusy === "preparing" ? "Preparing..." : model.changesByArd.buttonLabels.prepare}</button>
          </div>
          <label className="field-label" htmlFor="operator-ard-changes-confirmation">Exact push confirmation</label>
          <textarea
            id="operator-ard-changes-confirmation"
            className="review-notes operator-confirmation"
            rows={3}
            value={changesConfirmation}
            onChange={(event) => onChangesConfirmationChange?.(event.target.value)}
            placeholder={model.changesByArd.requiredConfirmation}
          />
          <div className="control-actions compact-actions">
            <button type="button" className="primary-action" onClick={onPushChanges} disabled={!pushUnlocked || changesBusy === "pushing"}>{changesBusy === "pushing" ? "Pushing..." : model.changesByArd.buttonLabels.push}</button>
            <span className={pushUnlocked ? "ok" : "muted-text"}>{pushUnlocked ? "confirmation matched" : "disabled until exact confirmation"}</span>
          </div>
          {changesError ? <div className="inline-error">{changesError.message ?? changesError.error ?? "Changes by ARD action failed"}</div> : null}
        </article>

        <article className="operator-panel" aria-label="Review Queue">
          <div className="operator-section-head">
            <div><p className="eyebrow">review queue</p><h3>Best next reviews</h3></div>
            <Badge tone={model.reviewQueue.branchReadyCount ? "ok" : "review"}>{model.reviewQueue.branchReadyCount} branch-ready</Badge>
          </div>
          <div className="review-metrics-row">
            <span>{model.reviewQueue.total} total</span>
            <span>{model.reviewQueue.needsReviewCount} needs review</span>
            <span>{model.reviewQueue.lowSignalHidden} low-signal collapsed</span>
          </div>
          <div className="operator-review-list">
            {model.reviewQueue.items.length ? model.reviewQueue.items.map((item) => (
              <article key={item.id} className="operator-review-item">
                <strong>{item.title}</strong>
                <Badge tone={item.verdict === "allow" ? "ok" : item.verdict === "blocked" ? "critical" : "review"}>{item.verdict}</Badge>
                <p>{item.summary}</p>
                <button type="button" className="secondary-action" onClick={() => onReviewCandidate?.(item)}>Review</button>
              </article>
            )) : <p className="muted-text">No reviewable candidate is visible yet. Run the local ARD pipeline to populate this queue.</p>}
          </div>
        </article>
      </section>

      <section className="operator-two-column">
        <article className="operator-panel" aria-label="AI Status and Public Decision Log">
          <div className="operator-section-head">
            <div><p className="eyebrow">AI status & public decision log</p><h3>Provider, mode, model, and public summaries</h3></div>
            <Badge tone={model.aiStatus.localDeterministicFallbackActive ? "review" : "ok"}>{model.aiStatus.statusLabel}</Badge>
          </div>
          <dl className="operator-facts dense">
            <div><dt>Provider</dt><dd>{model.aiStatus.provider}</dd></div>
            <div><dt>Model</dt><dd>{model.aiStatus.model}</dd></div>
            <div><dt>Mode</dt><dd>{model.aiStatus.mode}</dd></div>
            <div><dt>API key configured</dt><dd>{model.aiStatus.apiKeyConfigured ? "yes" : "no"}</dd></div>
            <div><dt>Local fallback active</dt><dd>{model.aiStatus.localDeterministicFallbackActive ? "yes" : "no"}</dd></div>
            <div><dt>Live external research</dt><dd>{model.aiStatus.liveExternalResearchActive}</dd></div>
            <div><dt>Current stage</dt><dd>{model.aiStatus.currentStage}</dd></div>
            <div><dt>Last stage update</dt><dd>{model.aiStatus.lastStageUpdate ?? "unknown"}</dd></div>
          </dl>
          <div className="operator-decision-log">
            {model.publicDecisionLog.map((entry, index) => <p key={`${entry.stage}-${index}`}><strong>{entry.stage}</strong>: {entry.summary}</p>)}
          </div>
          <p className="muted-text">Public summaries only. Internal reasoning is not shown.</p>
        </article>

        <article className="operator-panel" aria-label="Findings and Evidence Explorer">
          <div className="operator-section-head">
            <div><p className="eyebrow">findings / evidence</p><h3>Dangerous findings stay visible</h3></div>
            <Badge tone={model.findings.visibleDangerousCount ? "critical" : "ok"}>{model.findings.visibleDangerousCount} dangerous</Badge>
          </div>
          {model.findings.dangerous.length ? model.findings.dangerous.map((finding) => (
            <p className="inline-warning" key={finding.id}><strong>{finding.title}</strong>: {finding.summary}</p>
          )) : <p className="inline-success">No dangerous finding is visible in the current dashboard state.</p>}
          <p className="muted-text">{model.findings.safeSummary}</p>
        </article>
      </section>

      <section className="operator-two-column">
        <article className="operator-panel" aria-label="System Health">
          <div className="operator-section-head">
            <div><p className="eyebrow">system health</p><h3>Local backend, telemetry, builder, and branch state</h3></div>
            <Badge tone={model.systemHealth.backend === "live" ? "ok" : "review"}>{model.systemHealth.backend}</Badge>
          </div>
          <dl className="operator-facts dense">
            <div><dt>Telemetry</dt><dd>{model.systemHealth.telemetry}</dd></div>
            <div><dt>Route errors</dt><dd>{model.systemHealth.routeErrors}</dd></div>
            <div><dt>Builder</dt><dd>{model.systemHealth.builder}</dd></div>
            <div><dt>Worktree</dt><dd>{model.systemHealth.worktree}</dd></div>
            <div><dt>Changes branch</dt><dd>{model.systemHealth.changesBranch}</dd></div>
            <div><dt>Main protected</dt><dd>{model.systemHealth.mainProtected ? "yes" : "no"}</dd></div>
          </dl>
        </article>

        <article className="operator-panel" aria-label="Planned Features">
          <div className="operator-section-head">
            <div><p className="eyebrow">planned features</p><h3>Future work is labeled future</h3></div>
            <Badge tone="review">planned/future</Badge>
          </div>
          {model.plannedFeatures.map((feature) => <p key={feature.title}><strong>{feature.title}</strong> — <em>{feature.status}</em>. {feature.summary}</p>)}
        </article>
      </section>

      <details className="details-panel operator-advanced">
        <summary>Advanced / raw details, legacy panels, old runs, telemetry, and logs</summary>
        <p className="muted-text">Raw details are intentionally secondary by default. Latest meaningful event: {model.advanced.latestMeaningfulEvent}</p>
        {advancedChildren}
      </details>
    </section>
  );
}

function OperatorKpi({ label, value, tone = "" }) {
  return <div className={`control-kpi ${tone}`}><span>{label}</span><strong>{value}</strong></div>;
}

function toneForStatus(status) {
  if (["complete", "completed", "pushed", "required"].includes(status)) return "ok";
  if (["blocked", "error", "failed"].includes(status)) return "critical";
  if (["running", "needed", "preview ready", "prepared"].includes(status)) return "review";
  return "quiet";
}

function iconForStage(key) {
  if (key === "research") return <Search size={16} />;
  if (key === "protection") return <ShieldCheck size={16} />;
  if (key === "giving") return <CheckCircle2 size={16} />;
  if (key === "changes-by-ard") return <GitBranch size={16} />;
  if (key === "manual-review") return <ListChecks size={16} />;
  if (key === "system") return <Radio size={16} />;
  if (key === "planned") return <Sparkles size={16} />;
  if (key === "safety") return <LockKeyhole size={16} />;
  return <Clock3 size={16} />;
}
