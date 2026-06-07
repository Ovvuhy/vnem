import assert from "node:assert/strict";
import { deriveArdStatus } from "../ardStatus.js";

const status = deriveArdStatus({
  demoSummary: {
    mode: "demo/local research source",
    research: { status: "completed", candidatesFound: 4 },
    protection: { allowed: 1, needsReview: 2, blocked: 1, dangerousFindings: 1 },
    giving: { branchName: "vnem-research/ard-demo-run", pushed: true, included: 1, excluded: 3 }
  }
});

assert.equal(status.title, "ARD — AI Research Dashboard");
assert.equal(status.mode, "demo/local research source");
assert.equal(status.researchStatus, "completed");
assert.equal(status.protectionStatus, "completed");
assert.equal(status.givingStatus, "pushed");
assert.equal(status.dangerousFindingsCount, 1);
assert.equal(status.safeCandidatesCount, 1);
assert.equal(status.needsReviewCount, 2);
assert.equal(status.researchBranch, "vnem-research/ard-demo-run");
assert.equal(status.branchPushed, true);
assert.equal(status.rawDetailsCollapsed, true);
assert.equal(status.primaryActionLabel, "Run ARD pipeline");

const empty = deriveArdStatus();
assert.equal(empty.branchPushed, false, "must not fake pushed state");
assert.equal(empty.rawDetailsCollapsed, true);

console.log("dashboard ARD status tests passed");
