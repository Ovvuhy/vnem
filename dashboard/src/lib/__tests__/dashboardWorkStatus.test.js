import assert from "node:assert/strict";
import { deriveCandidateTriage, deriveDashboardWorkStatus } from "../dashboardWorkStatus.js";

function reviewCandidate(index, overrides = {}) {
  return {
    id: `candidate-${index}`,
    title: `Candidate ${index}`,
    source_route: index % 2 === 0 ? "hacker-news" : "github-search",
    generated_at: "2026-06-04T12:00:00.000Z",
    signal_summary: "Candidate needs source and license review.",
    risk_flags: index % 3 === 0 ? ["needs-primary-source"] : index % 5 === 0 ? ["license-not-asserted"] : ["weak-source"],
    repository_review: {
      verdict: "needs-review",
      risk_score: 34 + (index % 10),
      trust_score: 70 - (index % 15),
      flags: index % 3 === 0 ? ["needs-primary-source"] : index % 5 === 0 ? ["license-not-asserted"] : ["weak-source"]
    },
    ...overrides
  };
}

function test(name, fn) {
  try {
    fn();
  } catch (error) {
    error.message = `${name}: ${error.message}`;
    throw error;
  }
}

test("161 needs-review candidates produce clear stuck reason and top 5", () => {
  const activeIngestions = Array.from({ length: 161 }, (_, index) => reviewCandidate(index + 1));
  const status = deriveDashboardWorkStatus({
    telemetry: {
      status: "connected",
      mission: { query: "large review queue", vector: "github" },
      activeIngestions,
      events: [{ agent_stage: "research", message: "Research AI discovered candidates", timestamp: "2026-06-04T12:00:00.000Z" }]
    },
    now: Date.parse("2026-06-04T12:03:00.000Z")
  });
  assert.equal(status.status.key, "waiting-for-review");
  assert.equal(status.triage.total, 161);
  assert.equal(status.triage.branchEligible, 0);
  assert.equal(status.topCandidates.length, 5);
  assert.match(status.blocker.reason, /All 161 reviewable candidates/);
  assert.match(status.nextAction, /Review top 5 candidates/);
});

test("allowed candidates enable preview path", () => {
  const status = deriveDashboardWorkStatus({
    telemetry: {
      status: "connected",
      mission: { query: "branch ready mission", vector: "github" },
      activeIngestions: [reviewCandidate(1, {
        repository_review: { verdict: "allow", risk_score: 8, trust_score: 91, flags: [] },
        risk_flags: []
      })]
    }
  });
  assert.equal(status.status.key, "ready-for-branch-preview");
  assert.equal(status.triage.branchEligible, 1);
  assert.equal(status.giving.previewAvailable, true);
  assert.equal(status.blocker.key, "preview-not-run");
});

test("provider backoff becomes top blocker", () => {
  const status = deriveDashboardWorkStatus({
    telemetry: {
      status: "connected",
      intelligenceProvider: { status: "paused_for_backoff" },
      activeIngestions: [reviewCandidate(1, { repository_review: { verdict: "allow", risk_score: 5, trust_score: 90, flags: [] }, risk_flags: [] })]
    }
  });
  assert.equal(status.status.key, "provider-backoff");
  assert.equal(status.blocker.key, "provider-backoff");
  assert.match(status.research.state, /backoff/);
});

test("backend offline disables live actions and labels data honestly", () => {
  const status = deriveDashboardWorkStatus({
    telemetry: { status: "disconnected", activeIngestions: [] },
    summary: { findings: [reviewCandidate(1)] }
  });
  assert.equal(status.status.key, "backend-offline");
  assert.equal(status.backendLive, false);
  assert.equal(status.dataMode, "sample-or-summary");
  assert.equal(status.giving.previewAvailable, false);
});

test("preview result updates real work status", () => {
  const status = deriveDashboardWorkStatus({
    telemetry: {
      status: "connected",
      mission: { query: "branch ready mission", vector: "github" },
      activeIngestions: [reviewCandidate(1, {
        repository_review: { verdict: "allow", risk_score: 8, trust_score: 91, flags: [] },
        risk_flags: []
      })]
    },
    branchPreview: { ok: true, pushStatus: "not-pushed", reviewStatus: "waiting-for-manual-review", validationStatus: "not-run" }
  });
  assert.equal(status.status.key, "branch-preview-ready");
  assert.equal(status.giving.previewStatus, "ready");
  assert.equal(status.giving.pushStatus, "not-pushed");
});

test("candidate triage explains missing license and weak sources", () => {
  const triage = deriveCandidateTriage([
    reviewCandidate(1, { risk_flags: ["license-not-asserted"], repository_review: { verdict: "needs-review", risk_score: 36, trust_score: 62, flags: ["license-not-asserted"] } }),
    reviewCandidate(2, { source_route: "hacker-news", risk_flags: ["social-signal", "needs-primary-source"], repository_review: { verdict: "needs-review", risk_score: 34, trust_score: 66, flags: ["social-signal", "needs-primary-source"] } })
  ]);
  assert.equal(triage.missingLicense, 1);
  assert.equal(triage.weakSource, 1);
  assert.equal(triage.needsPrimarySource, 1);
  assert.equal(triage.topCandidates.length, 2);
});

console.log("dashboard work status tests passed");
