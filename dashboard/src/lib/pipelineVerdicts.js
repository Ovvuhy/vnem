import { clampPercent, humanize } from "./dashboardFormat.js";

export const PIPELINE_VERDICTS = ["allow", "needs-review", "quarantine", "blocked"];

const REVIEW_FLAGS = new Set([
  "license-not-asserted",
  "missing-license",
  "unknown-license",
  "needs-primary-source",
  "social-signal",
  "weak-source",
  "incomplete-metadata",
  "unclear-permissions",
  "unknown-install-surface",
  "low-confidence"
]);

const QUARANTINE_FLAGS = new Set([
  "binary-download",
  "unknown-binary",
  "download-button",
  "sensitive-permissions",
  "privileged-command",
  "postinstall-script",
  "lifecycle-script",
  "installer-required",
  "shell-pipe-install",
  "obfuscated-code",
  "network-execution"
]);

const BLOCK_FLAGS = new Set([
  "malware",
  "virus",
  "credential-theft",
  "secret-collection",
  "token-exfiltration",
  "phishing",
  "scam",
  "exploit-chain",
  "destructive-command",
  "hidden-persistence",
  "ransomware",
  "keylogger",
  "unsafe-automation"
]);

const CONTRACT = {
  allow: {
    tone: "ok",
    label: "Allowed by current checks",
    shortLabel: "Allowed",
    nextAction: "Giving AI may stage a reviewable dispatch from this item.",
    givingEligible: true,
    userReviewRequired: false,
    riskKey: "low",
    riskLabel: "ALLOW / CURRENT CHECKS",
    stageKey: "giving"
  },
  "needs-review": {
    tone: "review",
    label: "Needs maintainer review",
    shortLabel: "Needs review",
    nextAction: "Maintainer should inspect source, license, permissions, and install surface before risky use.",
    givingEligible: true,
    userReviewRequired: true,
    riskKey: "review",
    riskLabel: "REVIEW / OPEN QUESTIONS",
    stageKey: "giving"
  },
  quarantine: {
    tone: "warning",
    label: "Quarantined from Giving AI",
    shortLabel: "Quarantined",
    nextAction: "Keep for audit/research only; do not use as an implementation source until reviewed.",
    givingEligible: false,
    userReviewRequired: true,
    riskKey: "quarantine",
    riskLabel: "QUARANTINE / ISOLATED",
    stageKey: "protection"
  },
  blocked: {
    tone: "critical",
    label: "Blocked from application",
    shortLabel: "Blocked",
    nextAction: "Do not apply, install, execute, or recommend this item as safe.",
    givingEligible: false,
    userReviewRequired: true,
    riskKey: "critical",
    riskLabel: "BLOCKED / DO NOT USE",
    stageKey: "protection"
  }
};

export function derivePipelineVerdict(item = {}) {
  const source = item.repository_review ?? item.protection_report ?? item.review ?? item;
  const explicit = normalizeExplicitVerdict(source.verdict ?? source.protection_verdict ?? item.verdict ?? item.recommended_action ?? item.status);
  const flags = normalizeFlags(source.flags ?? item.risk_flags ?? source.risk_flags ?? item.flags);
  const threatScore = clampPercent(source.threat_score ?? source.risk_score ?? item.threat_score ?? item.metrics?.repo_risk_score ?? riskScoreFromFlags(flags));
  const trustScore = clampPercent(source.trust_score ?? item.trust_score ?? item.metrics?.repo_trust_score ?? 50);
  const status = String(item.status ?? "").toLowerCase();
  const reasons = normalizeReasons(source.reasons ?? source.reason ?? item.reason ?? item.signal_summary);
  const hasBlockFlag = flags.some((flag) => BLOCK_FLAGS.has(flag));
  const hasQuarantineFlag = flags.some((flag) => QUARANTINE_FLAGS.has(flag));
  const hasReviewFlag = flags.some((flag) => REVIEW_FLAGS.has(flag));

  let verdict = explicit;
  if (!verdict) {
    if (status === "isolated_by_protection" || hasBlockFlag || threatScore >= 85) verdict = "blocked";
    else if (hasQuarantineFlag || threatScore >= 60) verdict = "quarantine";
    else if (hasReviewFlag || threatScore >= 30 || trustScore < 55) verdict = "needs-review";
    else verdict = "allow";
  }
  if (status === "isolated_by_protection" && verdict !== "blocked") {
    verdict = "blocked";
  }

  const base = CONTRACT[verdict] ?? CONTRACT["needs-review"];
  return {
    verdict,
    tone: base.tone,
    label: base.label,
    shortLabel: base.shortLabel,
    reason: buildReason({ verdict, explicit, flags, threatScore, trustScore, reasons, status }),
    nextAction: base.nextAction,
    givingEligible: base.givingEligible,
    userReviewRequired: base.userReviewRequired,
    riskKey: base.riskKey,
    riskLabel: base.riskLabel,
    stageKey: base.stageKey,
    threatScore,
    trustScore,
    flags
  };
}

export function verdictTone(verdict) {
  return CONTRACT[verdict]?.tone ?? "review";
}

export function verdictLabel(verdict) {
  return CONTRACT[verdict]?.shortLabel ?? humanize(verdict ?? "needs-review");
}

function normalizeExplicitVerdict(value) {
  const normalized = String(value ?? "").toLowerCase().replace(/_/g, "-");
  if (["allow", "allowed", "clean", "low", "promote", "approved", "staged-for-review"].includes(normalized)) return "allow";
  if (["review", "needs-review", "watchlist", "sandbox", "sandboxing", "pending-approval", "research-no-candidate"].includes(normalized)) return "needs-review";
  if (["quarantine", "quarantined", "isolate", "isolated", "suspicious", "high-risk"].includes(normalized)) return "quarantine";
  if (["blocked", "block", "critical", "isolated-by-protection", "do-not-use"].includes(normalized)) return "blocked";
  return null;
}

function normalizeFlags(flags) {
  return Array.isArray(flags)
    ? flags.map((flag) => String(flag ?? "").toLowerCase().replace(/_/g, "-").trim()).filter(Boolean)
    : [];
}

function normalizeReasons(value) {
  if (Array.isArray(value)) return value.map((item) => String(item ?? "").trim()).filter(Boolean);
  const text = String(value ?? "").trim();
  return text ? [text] : [];
}

function buildReason({ verdict, explicit, flags, threatScore, trustScore, reasons, status }) {
  if (reasons.length > 0) return reasons[0];
  if (status === "isolated_by_protection") return "Older isolated_by_protection status maps to blocked so Giving AI cannot use it.";
  if (flags.length > 0) return `Protection flags: ${flags.slice(0, 4).join(", ")}.`;
  if (explicit) return `${verdictLabel(verdict)} verdict was provided by the pipeline data.`;
  if (verdict === "allow") return "No blocking issue was found in the available metadata/checks; this is not a guarantee of complete safety.";
  if (verdict === "needs-review") return `Open questions remain from available metadata: threat ${threatScore}%, trust ${trustScore}%.`;
  if (verdict === "quarantine") return `Suspicious/high-risk signals reached ${threatScore}% threat and must stay out of Giving AI application paths.`;
  return `Blocking risk threshold reached: threat ${threatScore}%.`;
}

function riskScoreFromFlags(flags) {
  if (!flags.length) return 0;
  if (flags.some((flag) => BLOCK_FLAGS.has(flag))) return 90;
  if (flags.some((flag) => QUARANTINE_FLAGS.has(flag))) return 68;
  if (flags.some((flag) => REVIEW_FLAGS.has(flag))) return 38;
  return Math.min(100, flags.length * 18);
}
