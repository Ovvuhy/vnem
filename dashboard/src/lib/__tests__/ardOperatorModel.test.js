import assert from "node:assert/strict";
import { deriveArdOperatorModel } from "../ardOperatorModel.js";
import { CHANGES_BY_ARD_CONFIRMATION } from "../ardChangesBranch.js";

const model = deriveArdOperatorModel({
  controlRoom: {
    run: {
      currentStage: "protection",
      providerStatus: "Local Fallback Active",
      dataMode: "browser/local pipeline",
      backendStatus: "live",
      updatedAt: "2026-06-14T10:00:00.000Z"
    },
    overview: {
      candidatesFound: 3,
      branchReady: 1,
      needsReview: 1,
      isolated: 1,
      nextSafeAction: "Review top candidate",
      topBlocker: "manual review required"
    },
    reviewInbox: {
      summary: { found: 3, branchReady: 1, worthReviewingFirst: 1, blocked: 1, quarantined: 0, lowSignalHidden: 8 },
      lanes: {
        branchReady: { count: 1, items: [{ id: "safe", title: "Safe candidate", verdict: "allow", whyNotBranchEligible: "Ready for branch preview." }] },
        needsReview: { count: 1, items: [{ id: "review", title: "Review candidate", verdict: "needs-review", whyNotBranchEligible: "Missing license." }] },
        needsPrimarySource: { count: 1, items: [{ id: "danger-review-copy", title: "Dangerous candidate", verdict: "blocked", whyNotBranchEligible: "Duplicate blocked queue copy." }] },
        blocked: { count: 1, items: [{ id: "danger", title: "Dangerous candidate", verdict: "blocked", whyNotBranchEligible: "Token exfiltration pattern." }] },
        quarantined: { count: 0, items: [] }
      }
    },
    branchWorkbench: {
      branchName: "vnem-giving/demo",
      baseBranch: "main",
      pushStatus: "not-pushed",
      manualReviewStatus: "waiting-for-manual-review"
    },
    builderHealth: {
      title: "Builder Health",
      branch: "main",
      syncStatus: "in-sync",
      worktreeClean: true,
      nextSafeAction: "safe to start"
    },
    timeline: [{ stage: "protection", title: "Protection verdict", message: "Candidate needs review." }],
    nextAction: { key: "review-candidate", label: "Review top candidate", detail: "Review source and license.", enabled: true }
  },
  pipelineRun: {
    runId: "ard-browser-run-demo",
    status: "completed",
    mode: "browser/local pipeline",
    stages: [
      { key: "research", label: "Research AI", status: "complete" },
      { key: "protection", label: "Protection AI", status: "complete" },
      { key: "giving", label: "Giving AI", status: "complete" }
    ],
    dangerousFindings: [{ id: "danger", title: "Dangerous candidate", dangerousSignals: ["token exfiltration pattern"] }],
    branch: { mode: "fixture-remote" },
    giving: { pushed: true, pushMode: "fixture-remote", included: 1, excluded: 2 }
  },
  ardChangesCard: {
    displayName: "Changes by ARD",
    branchName: "changes-by-ard",
    mainProtected: true,
    mode: "dry-run",
    statusLabel: "not prepared",
    requiredConfirmation: CHANGES_BY_ARD_CONFIRMATION,
    buttonLabels: { preview: "Preview ARD changes", prepare: "Prepare Changes by ARD commit", push: "Push Changes by ARD branch" },
    warningCopy: "Main stays protected."
  },
  telemetry: {
    status: "connected",
    intelligenceProvider: { status: "missing_key", model: "local-fallback", api_key_configured: false },
    events: [{ type: "research", message: "Research AI found a candidate.", agent_stage: "research" }]
  }
});

assert.equal(model.sections.length, 10, "operator model must expose one ordered dashboard hierarchy");
assert.deepEqual(model.pipelineTimeline.map((stage) => stage.label), ["Research AI", "Protection AI", "Giving AI", "Changes by ARD", "Manual Review"]);
const changesStage = model.pipelineTimeline.find((stage) => stage.key === "changes-by-ard");
assert.notEqual(changesStage.status, "pushed", "browser pipeline research branch proof must not make Changes by ARD look pushed");
assert.equal(model.changesByArd.mainProtected, true, "Changes by ARD must keep main protected");
assert.equal(model.changesByArd.requiredConfirmation, CHANGES_BY_ARD_CONFIRMATION, "push confirmation must remain exact");
assert.equal(model.aiStatus.provider, "OpenRouter/local fallback");
assert.equal(model.aiStatus.model, "local-fallback");
assert.equal(model.aiStatus.mode, "browser/local pipeline");
assert.equal(model.aiStatus.apiKeyConfigured, false);
assert.equal(model.aiStatus.liveExternalResearchActive, "planned");
assert.equal(model.publicDecisionLog.some((entry) => /chain-of-thought|hidden reasoning|private reasoning/i.test(entry.summary)), false, "public decision log must avoid hidden reasoning claims");
assert.equal(model.advanced.rawDetailsCollapsed, true);
assert.ok(model.findings.dangerous.length >= 1, "dangerous findings must remain represented");
assert.equal(model.safety.mainPushByArdAllowed, false);
assert.equal(model.safety.autoMergeAllowed, false);
assert.ok(model.plannedFeatures.every((feature) => /planned|future/i.test(feature.status)), "planned features must be labeled planned/future");
assert.equal(new Set(model.reviewQueue.items.map((item) => item.id)).size, model.reviewQueue.items.length, "review queue must be deduped");
assert.equal(model.reviewQueue.items.some((item) => item.verdict === "blocked"), false, "blocked dangerous findings stay visible in findings, not the primary review queue");
assert.equal(model.findings.dangerous.length, 1, "dangerous findings must dedupe by visible title across sources");

console.log("dashboard operator model tests passed");
