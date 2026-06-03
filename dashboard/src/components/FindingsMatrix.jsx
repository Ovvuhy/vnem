import { ExternalLink } from "lucide-react";
import { SkeletonEmpty } from "./PipelinePrimitives.jsx";

export function FindingsMatrix({ findings, loading }) {
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
        <span>route / trust score / risk tier / action dispatch</span>
      </div>
      {findings.map((finding) => (
        <FindingRow finding={finding} key={finding.id} />
      ))}
    </div>
  );
}

function FindingRow({ finding }) {
  return (
    <article className="finding-row">
      <div className="finding-signal">
        <span className="stage-chip">{finding.stage.label}</span>
        <a className="finding-link" href={finding.sourceUrl ?? "#"} target="_blank" rel="noreferrer">
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
        <div className="matrix-cell">
          <span className="cell-label">risk tier</span>
          <span className={`security-badge ${finding.risk.key}`}>{finding.risk.label}</span>
          <small>{finding.risk.detail}</small>
        </div>
        <div className="matrix-cell dispatch-cell">
          <span className="cell-label">action dispatch</span>
          <strong>{finding.action.label}</strong>
          <small>{finding.action.detail}</small>
        </div>
      </div>
    </article>
  );
}
