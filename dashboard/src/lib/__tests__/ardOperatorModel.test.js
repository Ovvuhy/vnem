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
    research: {
      schema: "vnem.ardResearch.v2",
      sourceLanes: [
        { key: "repo-self", label: "Repo Self-Research Lane", status: "completed", candidatesFound: 2 },
        { key: "docs-drift", label: "Docs Drift Lane", status: "completed", candidatesFound: 1 }
      ],
      sourceLanesUsed: ["repo-self", "docs-drift"],
      categories: [{ key: "repo-automation", label: "Repo Automation", count: 2 }, { key: "roblox-luau", label: "Roblox/Luau", count: 1 }],
      memory: { total: 3, repeated: 1, lowSignalCollapsed: 1, branchReady: 1, waitingForEvidence: 1, dangerous: 1 },
      ranking: { topCandidates: [{ candidateId: "safe", title: "Safe candidate", score: 80 }] }
    },
    dangerousFindings: [{ id: "danger", title: "Dangerous candidate", dangerousSignals: ["token exfiltration pattern"] }],
    branch: { mode: "fixture-remote" },
    giving: {
      pushed: true,
      pushMode: "fixture-remote",
      included: 1,
      excluded: 2,
      workPackages: [{ workPackageId: "wp-safe", title: "Safe work package", safeAction: "docs-only", filesToChange: ["docs/ARD_DOGFOOD_STATUS.md"], testsToRun: ["npm run test:current"], blockedReasons: [] }]
    },
    protection: { reviewArtifactOnly: 1 }
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
assert.equal(model.researchState.sourceLanesUsed.length, 2, "operator model must expose active Research AI v2 source lanes");
assert.equal(model.researchState.categories.length, 2, "operator model must expose research categories");
assert.equal(model.researchState.reviewArtifactOnly, 1, "operator model must expose review-artifact-only candidates");
assert.equal(model.researchState.lifecycle.repeated, 1, "operator model must expose repeated candidate memory");
assert.equal(model.researchState.lifecycle.suppressed, 1, "operator model must expose suppressed/low-signal candidate count");
assert.equal(model.researchState.branchReadyWorkPackages, 1, "operator model must expose branch-ready work packages");
assert.equal(model.changesByArd.selectedWorkPackage.workPackageId, "wp-safe", "Changes by ARD must show selected work package");
assert.deepEqual(model.changesByArd.exactFiles, ["docs/ARD_DOGFOOD_STATUS.md"], "Changes by ARD must expose exact work package files");

const richWorkPackages = Array.from({ length: 24 }, (_, index) => ({
  workPackageId: `wp-${index + 1}`,
  title: index < 3 ? `Implementation package ${index + 1}` : index < 8 ? `Review artifact ${index - 2}` : index < 12 ? `Waiting evidence ${index - 7}` : `Docs/test package ${index + 1}`,
  safeAction: index < 3 ? "repo-owned-code" : index < 8 ? "review-artifact-only" : index < 12 ? "wait-for-evidence" : index % 2 ? "docs-only" : "test-only",
  category: index < 3 ? "repo-automation" : index < 8 ? "roblox-luau" : "documentation-systems",
  sourceLane: index < 12 ? "external-metadata" : "repo-self",
  state: index < 3 ? "implementation-ready" : index < 8 ? "review-artifact-ready" : index < 12 ? "waiting-for-evidence" : "implementation-ready",
  branchability: index < 8 || index >= 12 ? "branch-ready" : "waiting-for-evidence",
  external: index >= 3 && index < 12,
  repoOwned: index < 3 || index >= 12,
  filesToChange: index < 8 ? [`docs/ard-reviews/package-${index + 1}.md`] : ["docs/ARD_DOGFOOD_STATUS.md"],
  testsToRun: ["npm run test:ard-capability-engine"],
  whyThisImprovesVNEM: "Makes a concrete ARD review package inspectable.",
  blockedReasons: index >= 8 && index < 12 ? ["Missing license evidence"] : []
}));

const richModel = deriveArdOperatorModel({
  controlRoom: { run: { backendStatus: "live" }, reviewInbox: { summary: { found: 26, branchReady: 19, worthReviewingFirst: 5, blocked: 1, quarantined: 0, lowSignalHidden: 2 }, lanes: {} } },
  pipelineRun: {
    runId: "ard-real-ui",
    status: "completed",
    mode: "repo/local dogfood",
    research: {
      sourceLanes: [{ key: "repo-self", candidatesFound: 12 }, { key: "external-metadata", candidatesFound: 12 }],
      sourceLanesUsed: ["repo-self", "external-metadata"],
      categories: [{ key: "repo-automation", count: 3 }, { key: "roblox-luau", count: 5 }, { key: "documentation-systems", count: 16 }],
      memory: { total: 26, repeated: 0, lowSignalCollapsed: 2, branchReady: 19, waitingForEvidence: 4, dangerous: 1 }
    },
    protection: { reviewArtifactOnly: 5 },
    dangerousFindings: [{ id: "danger", title: "Dangerous candidate", dangerousSignals: ["token exfiltration pattern"] }],
    giving: { included: 19, excluded: 7, workPackages: richWorkPackages }
  },
  ardChangesCard: {
    displayName: "Changes by ARD",
    branchName: "changes-by-ard",
    mainProtected: true,
    statusLabel: "not prepared",
    requiredConfirmation: CHANGES_BY_ARD_CONFIRMATION,
    lastPreview: { selectedWorkPackage: richWorkPackages[5], exactFiles: richWorkPackages[5].filesToChange }
  }
});

assert.equal(richModel.researchState.workPackages.length, 24, "operator model must retain every work package, not only top three");
assert.equal(richModel.researchState.visibleWorkPackages.defaultItems.length, 5, "operator model must define a compact default work-package slice");
assert.equal(richModel.researchState.visibleWorkPackages.hiddenCount, 19, "operator model must expose the hidden work-package count");
assert.equal(richModel.researchState.workPackageGroups.implementationReady.items.length, 15, "implementation-ready must exclude review artifacts and waiting-for-evidence packages");
assert.equal(richModel.researchState.workPackageGroups.reviewArtifacts.items.length, 5, "review-artifact-only packages must be grouped separately");
assert.equal(richModel.researchState.workPackageGroups.waitingForEvidence.items.length, 4, "waiting-for-evidence packages must be grouped separately");
assert.equal(richModel.reviewQueue.branchReadyCount, 15, "branch-ready label must mean implementation-ready, not every work package");
assert.equal(richModel.reviewQueue.reviewArtifactCount, 5, "review artifacts must have their own count");
assert.equal(richModel.changesByArd.selectedWorkPackage.workPackageId, "wp-6", "Changes by ARD must keep the selected package from preview/status");
assert.deepEqual(richModel.changesByArd.exactFiles, ["docs/ard-reviews/package-6.md"], "selected package exact files must be visible");

console.log("dashboard operator model tests passed");
