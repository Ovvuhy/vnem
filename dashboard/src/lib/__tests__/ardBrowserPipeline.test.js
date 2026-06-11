import assert from "node:assert/strict";
import { deriveArdStatus } from "../ardStatus.js";

const empty = deriveArdStatus();
assert.equal(empty.branchPushed, false, "empty state must not fake a pushed branch");
assert.equal(empty.researchBranch, "not prepared");
assert.equal(empty.primaryActionLabel, "Run ARD pipeline");
assert.equal(empty.rawDetailsCollapsed, true);

const status = deriveArdStatus({
  pipelineRun: {
    mode: "browser/local pipeline",
    research: { status: "completed", candidatesFound: 4 },
    protection: {
      allowed: 1,
      needsReview: 2,
      dangerousFindings: [
        { candidateId: "danger-1", title: "blocked token stealer", excludedFromGiving: true },
        { candidateId: "danger-2", title: "postinstall exfiltration package", excludedFromGiving: true }
      ]
    },
    giving: {
      branchName: "vnem-research/ard-browser-test",
      pushed: true,
      pushMode: "fixture-remote",
      included: 1,
      excluded: 3
    },
    branch: { mode: "fixture-remote", pushed: true },
    nextAction: "Review the pushed research branch reports before implementing any code."
  }
});

assert.equal(status.mode, "browser/local pipeline");
assert.equal(status.researchStatus, "completed");
assert.equal(status.protectionStatus, "completed");
assert.equal(status.givingStatus, "pushed");
assert.equal(status.dangerousFindingsCount, 2, "dangerous finding arrays must count by length");
assert.equal(status.safeCandidatesCount, 1);
assert.equal(status.needsReviewCount, 2);
assert.equal(status.researchBranch, "vnem-research/ard-browser-test");
assert.equal(status.branchPushed, true);
assert.equal(status.branchMode, "fixture-remote");
assert.equal(status.primaryActionLabel, "Run ARD pipeline");
assert.equal(status.rawDetailsCollapsed, true);
assert.equal(status.nextAction, "Review the pushed research branch reports before implementing any code.");

console.log("dashboard ARD browser pipeline tests passed");
