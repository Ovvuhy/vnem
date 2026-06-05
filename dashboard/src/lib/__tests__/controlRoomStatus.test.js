import assert from "node:assert/strict";
import { deriveControlRoomStatus } from "../controlRoomStatus.js";

function candidate(id, overrides = {}) {
  return {
    id,
    title: `Candidate ${id}`,
    source_route: "github-search",
    signal_summary: "Candidate summary.",
    risk_flags: [],
    repository_review: { verdict: "needs-review", risk_score: 34, trust_score: 70, flags: [] },
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

test("backend offline disables live actions", () => {
  const room = deriveControlRoomStatus({ telemetry: { status: "disconnected" }, summary: { findings: [candidate("offline")] } });
  assert.equal(room.run.backendStatus, "offline");
  assert.equal(room.nextAction.key, "start-backend");
  assert.equal(room.nextAction.enabled, false);
  assert.equal(room.branchWorkbench.canPreview, false);
});

test("branch-ready candidates make branch preview the next action", () => {
  const room = deriveControlRoomStatus({
    telemetry: { status: "connected", activeIngestions: [candidate("allow", { repository_review: { verdict: "allow", risk_score: 5, trust_score: 92, flags: [] } })] }
  });
  assert.equal(room.reviewInbox.summary.branchReady, 1);
  assert.equal(room.nextAction.key, "preview-branch");
  assert.equal(room.branchWorkbench.canPreview, true);
});

test("unreviewed needs-review candidates make review the next action", () => {
  const room = deriveControlRoomStatus({ telemetry: { status: "connected", activeIngestions: [candidate("review")] } });
  assert.equal(room.nextAction.key, "review-candidate");
  assert.equal(room.reviewInbox.lanes.needsReview.count, 1);
});

test("blocked and quarantine candidates never become branch-ready", () => {
  const room = deriveControlRoomStatus({ telemetry: { status: "connected", activeIngestions: [
    candidate("blocked", { repository_review: { verdict: "blocked", risk_score: 99, trust_score: 5, flags: ["malware-signal"] } }),
    candidate("quarantine", { repository_review: { verdict: "quarantine", risk_score: 75, trust_score: 20, flags: ["suspicious-package"] } })
  ] } });
  assert.equal(room.reviewInbox.lanes.branchReady.count, 0);
  assert.equal(room.branchWorkbench.guards.noBlockedCandidates, true);
  assert.equal(room.nextAction.key, "blocked-only");
});

test("prepared branch shows manual review checklist", () => {
  const room = deriveControlRoomStatus({
    telemetry: { status: "connected", activeIngestions: [candidate("allow", { repository_review: { verdict: "allow", risk_score: 5, trust_score: 92, flags: [] } })] },
    branchPreview: { ok: true, branchName: "vnem-giving/demo", baseBranch: "main", commitHash: "abc123", pushStatus: "not-pushed", reviewStatus: "waiting-for-manual-review" }
  });
  assert.equal(room.nextAction.key, "manual-review");
  assert.ok(room.branchWorkbench.checklist.some((item) => item.label === "inspect changed files"));
});

test("pushed branch shows manual review required", () => {
  const room = deriveControlRoomStatus({
    telemetry: { status: "connected", activeIngestions: [candidate("allow", { repository_review: { verdict: "allow", risk_score: 5, trust_score: 92, flags: [] } })] },
    branchPreview: { ok: true, branchName: "vnem-giving/demo", baseBranch: "main", commitHash: "abc123", pushStatus: "pushed", reviewStatus: "manual-review-required" }
  });
  assert.equal(room.run.status, "Branch pushed");
  assert.equal(room.nextAction.label, "Manual review required");
});

test("low-signal candidates are collapsed/grouped", () => {
  const room = deriveControlRoomStatus({ telemetry: { status: "connected", reviewQueue: {
    ok: true,
    totalFound: 161,
    branchEligible: 0,
    duplicateCandidates: 12,
    hiddenLowSignal: 88,
    topReviewCandidates: [{ id: "top", title: "Top", verdict: "needs-review", queueReasons: ["missing license"], enrichment: { sourceRoute: "github-search", trustScore: 60, riskScore: 20 } }]
  } } });
  assert.equal(room.reviewInbox.lanes.duplicateLowSignal.count, 100);
  assert.ok(room.reviewInbox.collapsedGroupCount >= 100);
});

test("review success changes next action when candidate becomes branch-ready", () => {
  const before = deriveControlRoomStatus({ telemetry: { status: "connected", activeIngestions: [candidate("review")] } });
  const after = deriveControlRoomStatus({ telemetry: { status: "connected", activeIngestions: [candidate("review", { review_satisfied: true, repository_review: { verdict: "needs-review", risk_score: 20, trust_score: 80, flags: [] } })] } });
  assert.equal(before.nextAction.key, "review-candidate");
  assert.equal(after.nextAction.key, "preview-branch");
});

test("prepare requires exact confirmation", () => {
  const room = deriveControlRoomStatus({ telemetry: { status: "connected", activeIngestions: [candidate("allow", { repository_review: { verdict: "allow", risk_score: 5, trust_score: 92, flags: [] } })] } });
  assert.equal(room.branchWorkbench.prepareConfirmationStatus, "locked");
  assert.equal(room.branchWorkbench.branchName.startsWith("vnem-giving/"), true);
  assert.equal(room.branchWorkbench.baseBranch, "main");
});

test("raw telemetry is secondary, not primary", () => {
  const room = deriveControlRoomStatus({ telemetry: { status: "connected", activeIngestions: [] } });
  assert.equal(room.rawTelemetrySecondary, true);
  assert.ok(room.overview);
  assert.ok(room.reviewInbox);
  assert.ok(room.timeline.length > 0);
});

test("builder health exposes latest run history without fake live status", () => {
  const room = deriveControlRoomStatus({ telemetry: { status: "connected", activeIngestions: [] } });
  assert.equal(room.builderHealth.title, "Builder Health");
  assert.equal(room.builderHealth.source, "run-history-static-fallback");
  assert.equal(room.builderHealth.latestCommit, "291c647525a07c0c730edf1f107afc8eac904bee");
  assert.equal(room.builderHealth.lastRun.validationStatus, "passed according to completed run output");
  assert.match(room.builderHealth.nextSafeAction, /npm run builder:session/);
});

console.log("dashboard control room tests passed");
