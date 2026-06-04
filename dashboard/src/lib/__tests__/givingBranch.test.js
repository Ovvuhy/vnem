import assert from "node:assert/strict";
import { deriveImprovementMission } from "../improvementMissions.js";

const allowed = {
  id: "allowed-branch-candidate",
  title: "Allowed branch candidate",
  source_route: "github-search",
  status: "staged_for_review",
  repository_review: { verdict: "allow", risk_score: 8, trust_score: 90 }
};

const quarantined = {
  id: "quarantined-candidate",
  title: "Quarantined candidate",
  source_route: "npm-search",
  status: "under_protection_review",
  repository_review: { verdict: "quarantine", risk_score: 76, trust_score: 20 }
};

function test(name, fn) {
  try {
    fn();
  } catch (error) {
    error.message = `${name}: ${error.message}`;
    throw error;
  }
}

test("allowed candidates expose backend preview payload while main stays protected", () => {
  const mission = deriveImprovementMission({
    telemetry: {
      status: "connected",
      mission: { query: "dashboard branch workflow", vector: "github" },
      activeIngestions: [allowed]
    }
  });
  assert.equal(mission.givingBranch.name, "vnem-giving/dashboard-branch-workflow");
  assert.equal(mission.givingBranch.base, "main");
  assert.equal(mission.givingBranch.mainProtected, true);
  assert.equal(mission.givingBranch.requestPayload.baseBranch, "main");
  assert.equal(mission.givingBranch.requestPayload.includedCandidates[0].verdict, "allow");
  const preview = mission.controls.find((control) => control.key === "preview-branch");
  assert.equal(preview.enabled, true);
  assert.equal(preview.state, "backend-preview-available");
});

test("backend preview result updates branch lane without claiming push", () => {
  const mission = deriveImprovementMission({
    telemetry: {
      status: "connected",
      mission: { query: "dashboard branch workflow", vector: "github" },
      activeIngestions: [allowed]
    },
    branchPreview: {
      ok: true,
      validationStatus: "not-run",
      pushStatus: "not-pushed",
      reviewStatus: "waiting-for-manual-review",
      requiredChecks: ["current branch must be main"]
    }
  });
  assert.equal(mission.givingBranch.status, "preview-ready");
  assert.equal(mission.givingBranch.backendAction, "prepare-available");
  assert.equal(mission.givingBranch.pushStatus, "not-pushed");
  assert.equal(mission.givingBranch.requiredChecks[0], "current branch must be main");
  const prepare = mission.controls.find((control) => control.key === "prepare-branch");
  assert.equal(prepare.enabled, false);
  assert.equal(prepare.state, "requires-explicit-confirmation");
});

test("offline backend keeps preview disabled", () => {
  const mission = deriveImprovementMission({
    telemetry: { status: "disconnected", activeIngestions: [allowed] }
  });
  assert.equal(mission.controls.find((control) => control.key === "preview-branch").enabled, false);
});

test("quarantined candidates keep prepare blocked", () => {
  const mission = deriveImprovementMission({
    telemetry: {
      status: "connected",
      mission: { query: "unsafe package workflow", vector: "npm" },
      activeIngestions: [quarantined]
    }
  });
  assert.equal(mission.givingBranch.status, "blocked-by-protection");
  assert.equal(mission.givingBranch.includedCandidates.length, 0);
  assert.equal(mission.controls.find((control) => control.key === "preview-branch").enabled, false);
});

console.log("dashboard branch tests passed");
