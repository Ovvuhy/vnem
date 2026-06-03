import { AlertTriangle, ArrowRight, Boxes, CheckCircle2, Clock3, Compass, Cpu, Link2, ShieldAlert, Sparkles } from "lucide-react";
import { deriveVnemSystemBrief } from "../lib/vnemSystemBrief.js";
import { Badge } from "./PipelinePrimitives.jsx";

const surfaceIcons = {
  core: Boxes,
  app: Compass,
  research: Sparkles,
  protection: ShieldAlert,
  giving: CheckCircle2,
  connectors: Link2,
  "vnem-ai": Cpu
};

export function VnemSystemBrief({ telemetry, execution, summary, connector }) {
  const brief = deriveVnemSystemBrief({ telemetry, execution, summary, connector });

  return (
    <section className="system-brief" aria-label="VNEM current system map">
      <div className="system-brief-main">
        <div className="system-brief-copy">
          <p className="eyebrow">current system map</p>
          <div className="system-brief-title-row">
            <h2>VNEM Core, App, and AI pipeline</h2>
            <Badge tone={brief.health.tone}>{brief.health.label}</Badge>
          </div>
          <p>{brief.headline}</p>
          <strong>{brief.summary}</strong>
        </div>
        <div className="system-next-actions" aria-label="Next actions">
          <div className="section-title-row">
            <span>next actions</span>
            <Badge tone="quiet">honest controls</Badge>
          </div>
          {brief.nextActions.map((action) => (
            <div className={`system-action ${action.tone}`} key={`${action.label}-${action.detail}`}>
              {action.tone === "critical" ? <AlertTriangle size={16} /> : action.tone === "review" ? <Clock3 size={16} /> : <ArrowRight size={16} />}
              <div>
                <strong>{action.label}</strong>
                <span>{action.detail}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="system-surface-grid" aria-label="Implemented and planned VNEM surfaces">
        {brief.surfaces.map((surface) => {
          const Icon = surfaceIcons[surface.key] ?? Boxes;
          return (
            <article className={`system-surface ${surface.tone}`} key={surface.key}>
              <div className="system-surface-top">
                <span className="system-surface-icon"><Icon size={17} /></span>
                <Badge tone={surface.tone}>{surface.status}</Badge>
              </div>
              <h3>{surface.label}</h3>
              <p>{surface.detail}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
