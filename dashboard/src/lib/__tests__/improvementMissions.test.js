import assert from "node:assert/strict";
import { deriveImprovementMission } from "../improvementMissions.js";

function test(name, fn) {
  try {
    fn();
  } catch (error) {
    error.message = `${name}: ${error.message}`;
    throw error;
  }
}

const stagedAllowed = {
  id: "ingestion-allowed",
  title: "Improve dashboard telemetry clarity",
  source_route: "github-search",
  source_url: "https://github.com/Ovvuhy/vnem/issues/telemetry",
  status: "staged_for_review",
  current_agent: "complete",
  repository_review: {
    verdict: "allow",
    risk_score: 8,
    trust_score: 91,
    reasons: ["Repo-owned issue and current checks found no blocking issue."]
  },
  staged_dispatch: {
    file_name: "2026-06-04-dashboard-telemetry.md",
    generated_at: "2026-06-04T10:00:00.000Z"
  },
  latest_event: {
    agent: "giving",
    message: "Giving AI staged branch-ready markdown for dashboard telemetry clarity.",
    timestamp: "2026-06-04T10:02:00.000Z"
  },
  timeline: [
    { agent: "research", message: "Research AI checked github-search for dashboard telemetry improvements.", timestamp: "2026-06-04T10:00:00.000Z" },
    { agent: "protection", message: "Protection AI assigned allow verdict.", timestamp: "2026-06-04T10:01:00.000Z" },
    { agent: "giving", message: "Giving AI staged markdown dispatch.", timestamp: "2026-06-04T10:02:00.000Z" }
  ]
};

const quarantined = {
  id: "ingestion-quarantine",
  title: "Use unknown binary installer",
  source_route: "npm-search",
  status: "under_protection_review",
  current_agent: "protection",
  repository_review: {
    verdict: "quarantine",
    risk_score: 72,
    trust_score: 33,
    flags: ["binary-download", "privileged-command"],
    reasons: ["Unknown binary installer is quarantined from Giving AI."]
  },
  latest_event: {
    agent: "protection",
    message: "Protection AI quarantined unknown installer.",
    timestamp: "2026-06-04T10:03:00.000Z"
  }
};

test("derives a focused mission from live telemetry with safe branch contract", () => {
  const mission = deriveImprovementMission({
    telemetry: {
      status: "connected",
      mission: {
        query: "dashboard telemetry clarity",
        vector: "github",
        vector_label: "GitHub Repositories",
        threat_tolerance: 30
      },
      activeIngestions: [stagedAllowed, quarantined]
    },
    summary: {
      findings: []
    }
  });

  assert.equal(mission.id, "mission-dashboard-telemetry-clarity");
  assert.equal(mission.title, "Improve dashboard telemetry clarity");
  assert.equal(mission.status, "ready-for-giving");
  assert.equal(mission.currentStage, "giving");
  assert.equal(mission.verdictSummary.allow, 1);
  assert.equal(mission.verdictSummary.quarantine, 1);
  assert.equal(mission.candidates.length, 2);
  assert.equal(mission.givingBranch.name, "vnem-giving/dashboard-telemetry-clarity");
  assert.equal(mission.givingBranch.base, "main");
  assert.equal(mission.givingBranch.status, "planned");
  assert.equal(mission.givingBranch.reviewStatus, "waiting-for-manual-review");
  assert.deepEqual(mission.givingBranch.includedCandidates, ["ingestion-allowed"]);
  assert.equal(mission.givingBranch.blockedCandidateIds.includes("ingestion-quarantine"), true);
  assert.equal(mission.givingBranch.pushStatus, "not-pushed");
  assert.equal(mission.controls.find((control) => control.key === "prepare-branch").enabled, false);
  assert.equal(mission.controls.find((control) => control.key === "prepare-branch").state, "planned-safe-branch");
  assert.match(mission.nextAction, /planned safe branch/i);
});

test("keeps Giving AI branch blocked when only quarantined or blocked candidates exist", () => {
  const mission = deriveImprovementMission({
    telemetry: {
      status: "connected",
      mission: { query: "unknown installer", vector: "npm" },
      activeIngestions: [quarantined]
    }
  });

  assert.equal(mission.status, "blocked");
  assert.equal(mission.currentStage, "protection");
  assert.equal(mission.verdictSummary.quarantine, 1);
  assert.equal(mission.givingBranch.status, "blocked-by-protection");
  assert.deepEqual(mission.givingBranch.includedCandidates, []);
  assert.equal(mission.nextAction, "Protection AI isolated every candidate; do not prepare a Giving AI branch.");
});

test("offline mission state is honest and marks branch actions as planned", () => {
  const mission = deriveImprovementMission({
    telemetry: { status: "disconnected", activeIngestions: [] },
    summary: {
      findings: [
        {
          id: "finding-1",
          title: "Protection verdict detail panel",
          source_route: "github-search",
          signal_summary: "Potential dashboard improvement from local summary.",
          repository_review: { verdict: "needs-review", risk_score: 34, trust_score: 65 }
        }
      ]
    }
  });

  assert.equal(mission.telemetryMode, "offline-or-sample");
  assert.equal(mission.status, "protecting");
  assert.equal(mission.verdictSummary.needsReview, 1);
  assert.equal(mission.givingBranch.status, "not-created");
  assert.equal(mission.controls.find((control) => control.key === "start-research").enabled, false);
  assert.match(mission.controls.find((control) => control.key === "start-research").detail, /Manual Override/i);
});

console.log("improvementMissions tests passed");
