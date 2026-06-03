import { ExternalLink } from "lucide-react";
import { SkeletonEmpty } from "./PipelinePrimitives.jsx";

export function FindingsMatrix({ findings, loading, onReviewFinding }) {
  if (loading) {
    return <SkeletonEmpty title="Loading intelligence matrix" body="Hermes is preparing source-backed findings and scanner output." />;
  }
  if (findings.length === 0) {
    return <SkeletonEmpty title="No findings match this control block" body="Adjust the stage, risk, origin, or search query to widen the operational view." />;
  }

  return (
    <div className="findings-matrix">
      <div className="matrix-head" aria-hidden="true">
        <span>signal</span>
        <span>route / trust score / protection verdict / Giving AI gate</span>
      </div>
      {findings.map((finding) => (
        <FindingRow finding={finding} key={finding.id} onReviewFinding={onReviewFinding} />
      ))}
    </div>
  );
}

function FindingRow({ finding, onReviewFinding }) {
  const reviewable = finding.dispatch?.status === "staged_for_review" && typeof onReviewFinding === "function";
  const openReview = () => {
    if (reviewable) {
      onReviewFinding(finding);
    }
  };
  return (
    <article
      className={`finding-row ${reviewable ? "reviewable" : ""}`}
      onClick={openReview}
      role={reviewable ? "button" : undefined}
      tabIndex={reviewable ? 0 : undefined}
      onKeyDown={(event) => {
        if (reviewable && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          openReview();
        }
      }}
      aria-label={reviewable ? `Review staged dispatch for ${finding.title}` : undefined}
    >
      <div className="finding-signal">
        <span className="stage-chip">{finding.stage.label}</span>
        <a className="finding-link" href={finding.sourceUrl ?? "#"} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>
          {finding.title}
          {finding.sourceUrl ? <ExternalLink size={13} /> : null}
        </a>
        <p>{finding.summary}</p>
      </div>
      <div className="finding-metrics">
        <div className="matrix-cell route-cell">
          <span className="cell-label">route</span>
          <strong>{finding.origin.label}</strong>
          <small>{finding.origin.description}</small>
        </div>
        <div className="matrix-cell trust-cell">
          <span className="cell-label">trust score</span>
          <div className="trust-bar" style={{ "--trust": `${finding.trustScore}%` }}>
            <span />
          </div>
          <strong>{finding.trustScore}% Trust</strong>
          <small>{finding.trustLabel}</small>
        </div>
        <div className="matrix-cell verdict-cell">
          <span className="cell-label">protection verdict</span>
          <span className={`verdict-badge ${finding.verdict.tone}`}>{finding.verdict.shortLabel}</span>
          <small>{finding.verdict.reason}</small>
        </div>
        <div className="matrix-cell dispatch-cell">
          <span className="cell-label">Giving AI gate</span>
          <strong>{finding.action.label}</strong>
          <small>{finding.verdict.givingEligible ? finding.action.detail : finding.verdict.nextAction}</small>
          <div className="gate-flags" aria-label="Verdict gate flags">
            <span className={finding.verdict.givingEligible ? "ok" : "blocked"}>{finding.verdict.givingEligible ? "Giving eligible" : "Giving blocked"}</span>
            <span className={finding.verdict.userReviewRequired ? "review" : "ok"}>{finding.verdict.userReviewRequired ? "Review required" : "No extra review flag"}</span>
          </div>
          {reviewable ? <button type="button" onClick={(event) => { event.stopPropagation(); openReview(); }}>Review dispatch</button> : null}
        </div>
      </div>
    </article>
  );
}
