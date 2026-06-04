import { useState } from "react";
import { AlertTriangle, CheckCircle2, FileText, Loader2, ShieldCheck, Trash2, X } from "lucide-react";

export function DispatchReviewModal({ finding, review, status, error, onClose, onApprove, onReject, onCandidateReview }) {
  const [candidateNotes, setCandidateNotes] = useState("");
  if (!finding) {
    return null;
  }

  const busy = status === "loading" || status === "approving" || status === "rejecting" || status === "candidate-reviewing";
  const canPromoteDispatch = Boolean(finding.dispatch?.id && review?.dispatch);
  const canReviewCandidate = Boolean(review?.candidateReview?.id && onCandidateReview);
  const markdown = review?.markdown ?? "";
  const sections = summarizeSections(markdown);

  return (
    <div className="dispatch-modal-backdrop" role="presentation" onMouseDown={onBackdropMouseDown(onClose)}>
      <section className="dispatch-modal" role="dialog" aria-modal="true" aria-labelledby="dispatch-review-title">
        <header className="dispatch-modal-header">
          <div>
            <p className="eyebrow">review & approve dispatch</p>
            <h2 id="dispatch-review-title">{finding.title}</h2>
            <p>{finding.summary}</p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close dispatch review">
            <X size={18} />
          </button>
        </header>

        <div className="dispatch-modal-meta" aria-label="Dispatch metadata">
          <span><FileText size={14} /> {review?.dispatch?.file_name ?? finding.dispatch?.fileName ?? "staged markdown"}</span>
          <span><ShieldCheck size={14} /> {finding.verdict?.shortLabel ?? finding.risk.label}</span>
          <span>{finding.origin.label}</span>
        </div>

        {finding.verdict ? (
          <div className={`dispatch-verdict ${finding.verdict.tone}`} aria-label="Protection AI verdict">
            <strong>{finding.verdict.label}</strong>
            <span>{finding.verdict.reason}</span>
            <em>{finding.verdict.nextAction}</em>
          </div>
        ) : null}

        {error ? (
          <div className="dispatch-modal-error"><AlertTriangle size={16} /> {humanizeError(error)}</div>
        ) : null}

        {status === "loading" ? (
          <div className="dispatch-modal-loading"><Loader2 size={18} /> Loading staged markdown from .vnem/staging...</div>
        ) : (
          <div className="dispatch-review-grid">
            <aside className="dispatch-notes" aria-label="Pipeline notes">
              <DispatchNote title="Research" body={sections.research} />
              <DispatchNote title="Protection" body={sections.protection} />
              <DispatchNote title="Giving" body={sections.giving} />
            </aside>
            <article className="dispatch-markdown" aria-label="Staged markdown preview">
              {renderMarkdown(markdown)}
            </article>
          </div>
        )}

        <footer className="dispatch-modal-actions">
          {canReviewCandidate ? (
            <div className="candidate-review-actions">
              <p>This candidate has no staged dispatch yet. These actions only write a local review record; they do not execute code, commit, push, or merge.</p>
              <label className="confirm-field">
                Review notes
                <textarea value={candidateNotes} onChange={(event) => setCandidateNotes(event.target.value)} placeholder="Source, license, permissions, install surface, and why this decision is safe." rows={3} />
              </label>
              <div>
                <button className="approve-action" type="button" onClick={() => onCandidateReview("approve-for-giving", candidateNotes)} disabled={busy}>
                  <CheckCircle2 size={16} /> Approve for Giving
                </button>
                <button className="secondary-action" type="button" onClick={() => onCandidateReview("keep-reviewing", candidateNotes)} disabled={busy}>
                  Keep reviewing
                </button>
                <button className="secondary-action" type="button" onClick={() => onCandidateReview("reject-low-signal", candidateNotes)} disabled={busy}>
                  Reject low signal
                </button>
                <button className="critical-action" type="button" onClick={() => onCandidateReview("quarantine", candidateNotes)} disabled={busy}>
                  Quarantine
                </button>
                <button className="critical-action" type="button" onClick={() => onCandidateReview("block", candidateNotes)} disabled={busy}>
                  Block
                </button>
              </div>
            </div>
          ) : (
            <>
              <p>{canPromoteDispatch ? "Approval only moves this markdown from .vnem/staging/ to .vnem/approved/. It does not commit to main or execute code." : "This is a candidate detail view only. No backend review dispatch exists yet, so approve/reject is disabled."}</p>
              <div>
                <button className="critical-action" type="button" onClick={onReject} disabled={busy || !canPromoteDispatch}>
                  <Trash2 size={16} /> {status === "rejecting" ? "discarding" : "Reject & Discard"}
                </button>
                <button className="approve-action" type="button" onClick={onApprove} disabled={busy || !canPromoteDispatch}>
                  <CheckCircle2 size={16} /> {status === "approving" ? "promoting" : "Promote to Approved"}
                </button>
              </div>
            </>
          )}
        </footer>
      </section>
    </div>
  );
}

function DispatchNote({ title, body }) {
  return (
    <section>
      <h3>{title}</h3>
      <p>{body || "No dedicated note detected in the staged markdown; inspect the full dispatch before approving."}</p>
    </section>
  );
}

function onBackdropMouseDown(onClose) {
  return (event) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };
}

function summarizeSections(markdown) {
  const text = String(markdown ?? "");
  return {
    research: extractSection(text, /research/i) || extractLines(text, [/discovery/i, /candidate/i, /source/i]),
    protection: extractSection(text, /protection|safety|threat/i) || extractLines(text, [/threat score/i, /flags/i, /risk/i]),
    giving: extractSection(text, /giving|integration|dispatch|plan/i) || extractLines(text, [/review/i, /approve/i, /integration/i])
  };
}

function extractSection(text, headingPattern) {
  const lines = text.split(/\r?\n/);
  let collecting = false;
  const out = [];
  for (const line of lines) {
    const isHeading = /^#{1,4}\s+/.test(line.trim());
    if (isHeading && collecting) {
      break;
    }
    if (isHeading && headingPattern.test(line)) {
      collecting = true;
      continue;
    }
    if (collecting && line.trim()) {
      out.push(line.replace(/^[-*]\s+/, "").trim());
    }
  }
  return out.join(" ").slice(0, 260);
}

function extractLines(text, patterns) {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*#\s]+/, "").trim())
    .filter((line) => line && patterns.some((pattern) => pattern.test(line)))
    .slice(0, 3)
    .join(" ")
    .slice(0, 260);
}

function renderMarkdown(markdown) {
  const blocks = parseMarkdownBlocks(markdown);
  if (!blocks.length) {
    return <p className="markdown-empty">No staged markdown was returned for this dispatch.</p>;
  }
  return blocks.map((block, index) => renderBlock(block, index));
}

function parseMarkdownBlocks(markdown) {
  const lines = String(markdown ?? "").replace(/\r/g, "").split("\n");
  const blocks = [];
  let paragraph = [];
  let list = [];
  let code = null;

  function flushParagraph() {
    if (paragraph.length) {
      blocks.push({ type: "paragraph", text: paragraph.join(" ") });
      paragraph = [];
    }
  }

  function flushList() {
    if (list.length) {
      blocks.push({ type: "list", items: list });
      list = [];
    }
  }

  for (const line of lines) {
    const fence = line.match(/^```\s*([\w-]*)\s*$/);
    if (fence) {
      if (code) {
        blocks.push(code);
        code = null;
      } else {
        flushParagraph();
        flushList();
        code = { type: "code", language: fence[1] || "text", text: "" };
      }
      continue;
    }
    if (code) {
      code.text += `${line}\n`;
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }
    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ type: "heading", depth: heading[1].length, text: heading[2] });
      continue;
    }
    if (/^---+$/.test(line.trim())) {
      flushParagraph();
      flushList();
      blocks.push({ type: "rule" });
      continue;
    }
    const listItem = line.match(/^\s*[-*]\s+(.+)$/);
    if (listItem) {
      flushParagraph();
      list.push(listItem[1]);
      continue;
    }
    paragraph.push(line.trim());
  }
  flushParagraph();
  flushList();
  if (code) {
    blocks.push(code);
  }
  return blocks;
}

function renderBlock(block, index) {
  if (block.type === "heading") {
    const Tag = block.depth === 1 ? "h1" : block.depth === 2 ? "h2" : "h3";
    return <Tag key={index}>{renderInline(block.text, `h-${index}`)}</Tag>;
  }
  if (block.type === "list") {
    return <ul key={index}>{block.items.map((item, itemIndex) => <li key={itemIndex}>{renderInline(item, `li-${index}-${itemIndex}`)}</li>)}</ul>;
  }
  if (block.type === "code") {
    return (
      <pre className="dispatch-code" data-language={block.language} key={index}>
        <code>{block.text.trimEnd()}</code>
      </pre>
    );
  }
  if (block.type === "rule") {
    return <hr key={index} />;
  }
  return <p key={index}>{renderInline(block.text, `p-${index}`)}</p>;
}

function renderInline(text, keyPrefix) {
  const parts = [];
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|https?:\/\/[^\s)]+|\b(?:Research AI|Protection AI|Giving AI|Threat score|OpenRouter|Hermes[- ]?3)\b)/g;
  let lastIndex = 0;
  let index = 0;
  for (const match of String(text ?? "").matchAll(pattern)) {
    if (match.index > lastIndex) {
      parts.push(String(text).slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith("`")) {
      parts.push(<code key={`${keyPrefix}-code-${index}`}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith("**")) {
      parts.push(<strong key={`${keyPrefix}-strong-${index}`}>{token.slice(2, -2)}</strong>);
    } else if (/^https?:\/\//.test(token)) {
      parts.push(<a key={`${keyPrefix}-link-${index}`} href={token} target="_blank" rel="noreferrer">{token}</a>);
    } else {
      parts.push(<mark key={`${keyPrefix}-mark-${index}`}>{token}</mark>);
    }
    lastIndex = match.index + token.length;
    index += 1;
  }
  if (lastIndex < String(text).length) {
    parts.push(String(text).slice(lastIndex));
  }
  return parts;
}

function humanizeError(error) {
  return String(error?.message ?? error?.error ?? error ?? "dispatch request failed").replace(/[-_]/g, " ");
}
