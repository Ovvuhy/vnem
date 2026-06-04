#!/usr/bin/env node
import assert from "node:assert/strict";
import { prepareGivingBranch, previewGivingBranchPlan } from "./giving-branch.mjs";

const allowedCandidate = {
  id: "candidate-dashboard-mission",
  title: "Dashboard mission branch plan",
  verdict: "allow",
  sourceRoute: "github-search",
  sourceUrl: "https://github.com/Ovvuhy/vnem"
};

const reviewedCandidate = {
  id: "candidate-reviewed",
  title: "Reviewed needs-review candidate",
  verdict: "needs-review",
  reviewSatisfied: true,
  sourceRoute: "github-search"
};

function basePayload(overrides = {}) {
  return {
    sourceMissionId: "mission-dashboard-ai-engine",
    missionTitle: "Improve dashboard AI mission engine",
    branchName: "vnem-giving/dashboard-ai-mission-engine",
    baseBranch: "main",
    includedCandidates: [allowedCandidate],
    excludedCandidates: [],
    validationCommands: ["npm run test:dashboard-missions"],
    ...overrides
  };
}

async function test(name, fn) {
  try {
    await fn();
  } catch (error) {
    error.message = `${name}: ${error.message}`;
    throw error;
  }
}

const queued = [];
function enqueue(name, fn) {
  queued.push({ name, fn });
}

enqueue("preview succeeds for allowed candidates", () => {
  const preview = previewGivingBranchPlan(basePayload());
  assert.equal(preview.ok, true);
  assert.equal(preview.mode, "preview");
  assert.equal(preview.branchName, "vnem-giving/dashboard-ai-mission-engine");
  assert.equal(preview.baseBranch, "main");
  assert.equal(preview.includedCandidates.length, 1);
  assert.equal(preview.pushStatus, "not-pushed");
  assert.equal(preview.reviewStatus, "waiting-for-manual-review");
  assert.equal(preview.requiredChecks.includes("current branch must be main"), true);
});

enqueue("preview rejects invalid branch prefix", () => {
  const preview = previewGivingBranchPlan(basePayload({ branchName: "feature/bad-prefix" }));
  assert.equal(preview.ok, false);
  assert.equal(preview.error_code, "GIVING_BRANCH_PLAN_INVALID");
  assert.equal(preview.violations.some((violation) => violation.includes("vnem-giving/")), true);
});

enqueue("preview rejects quarantine candidate", () => {
  const preview = previewGivingBranchPlan(basePayload({
    includedCandidates: [{ ...allowedCandidate, id: "quarantined", verdict: "quarantine" }]
  }));
  assert.equal(preview.ok, false);
  assert.equal(preview.violations.some((violation) => violation.includes("quarantine")), true);
});

enqueue("preview rejects blocked candidate", () => {
  const preview = previewGivingBranchPlan(basePayload({
    includedCandidates: [{ ...allowedCandidate, id: "blocked", verdict: "blocked" }]
  }));
  assert.equal(preview.ok, false);
  assert.equal(preview.violations.some((violation) => violation.includes("blocked")), true);
});

enqueue("preview rejects unreviewed needs-review candidate", () => {
  const preview = previewGivingBranchPlan(basePayload({
    includedCandidates: [{ ...allowedCandidate, id: "needs-review", verdict: "needs-review", reviewSatisfied: false }]
  }));
  assert.equal(preview.ok, false);
  assert.equal(preview.violations.some((violation) => violation.includes("needs explicit maintainer review")), true);
});

enqueue("prepare refuses if current branch is not main", async () => {
  const prepare = await prepareGivingBranch({ ...basePayload(), confirm: "prepare-giving-branch" }, {
    repositoryRoot: "/tmp/vnem-test",
    gitRunner: async (args) => args.join(" ") === "branch --show-current" ? "develop\n" : "",
    commandRunner: async () => ({ exitCode: 0, output: "ok" })
  });
  assert.equal(prepare.ok, false);
  assert.equal(prepare.error_code, "GIVING_BRANCH_NOT_ON_MAIN");
  assert.equal(prepare.pushStatus, "not-pushed");
});

enqueue("prepare refuses dirty worktree", async () => {
  const prepare = await prepareGivingBranch({ ...basePayload(), confirm: "prepare-giving-branch" }, {
    repositoryRoot: "/tmp/vnem-test",
    gitRunner: async (args) => {
      if (args.join(" ") === "branch --show-current") return "main\n";
      if (args.join(" ") === "status --short") return " M dashboard/src/App.jsx\n";
      return "";
    },
    commandRunner: async () => ({ exitCode: 0, output: "ok" })
  });
  assert.equal(prepare.ok, false);
  assert.equal(prepare.error_code, "GIVING_BRANCH_DIRTY_WORKTREE");
  assert.equal(prepare.worktreeStatus[0], "M dashboard/src/App.jsx");
});

enqueue("prepare never pushes to main and records manual review plan", async () => {
  const gitCalls = [];
  const prepare = await prepareGivingBranch({
    ...basePayload({ includedCandidates: [allowedCandidate, reviewedCandidate] }),
    confirm: "prepare-giving-branch"
  }, {
    repositoryRoot: "/tmp/vnem-test",
    now: "2026-06-04T12:00:00.000Z",
    gitRunner: async (args) => {
      gitCalls.push(args);
      const command = args.join(" ");
      if (command === "branch --show-current") return "main\n";
      if (command === "status --short") return "";
      if (command === "rev-parse HEAD") return "abc123\n";
      return "";
    },
    commandRunner: async () => ({ exitCode: 0, output: "ok" })
  });
  assert.equal(prepare.ok, true);
  assert.equal(prepare.branchStatus, "pushed");
  assert.equal(prepare.commitHash, "abc123");
  assert.equal(prepare.reviewStatus, "waiting-for-manual-review");
  assert.equal(gitCalls.some((args) => args[0] === "push" && args.includes("main")), false, "prepare must not push main");
  assert.equal(gitCalls.some((args) => args.join(" ") === "push -u origin vnem-giving/dashboard-ai-mission-engine"), true);
  assert.equal(gitCalls.some((args) => args.join(" ") === "checkout main"), true);
});

for (const { name, fn } of queued) {
  await test(name, fn);
}

console.log("giving branch tests passed");
