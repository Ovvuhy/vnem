import assert from "node:assert/strict";
import { derivePipelineVerdict, verdictLabel, verdictTone } from "../pipelineVerdicts.js";

function test(name, fn) {
  try {
    fn();
  } catch (error) {
    console.error(`pipelineVerdicts test failed: ${name}`);
    throw error;
  }
}

test("low-risk item becomes allow without claiming absolute safety", () => {
  const verdict = derivePipelineVerdict({
    repository_review: { risk_score: 8, trust_score: 91, flags: [], reasons: [] },
    risk_flags: []
  });
  assert.equal(verdict.verdict, "allow");
  assert.equal(verdict.tone, "ok");
  assert.equal(verdict.givingEligible, true);
  assert.equal(verdict.userReviewRequired, false);
  assert.match(verdict.reason, /not a guarantee|No blocking issue/i);
});

test("missing license and weak source become needs-review", () => {
  const verdict = derivePipelineVerdict({
    risk_flags: ["missing-license", "weak-source"],
    repository_review: { trust_score: 58 }
  });
  assert.equal(verdict.verdict, "needs-review");
  assert.equal(verdict.tone, "review");
  assert.equal(verdict.givingEligible, true);
  assert.equal(verdict.userReviewRequired, true);
});

test("suspicious but not hard-blocked package becomes quarantine", () => {
  const verdict = derivePipelineVerdict({
    repository_review: {
      risk_score: 68,
      trust_score: 42,
      flags: ["binary-download", "privileged-command"]
    }
  });
  assert.equal(verdict.verdict, "quarantine");
  assert.equal(verdict.tone, "warning");
  assert.equal(verdict.givingEligible, false);
  assert.equal(verdict.userReviewRequired, true);
});

test("malware/scam/credential executable funnel becomes blocked", () => {
  const verdict = derivePipelineVerdict({
    repository_review: {
      risk_score: 72,
      trust_score: 12,
      flags: ["credential-theft", "binary-download"]
    }
  });
  assert.equal(verdict.verdict, "blocked");
  assert.equal(verdict.tone, "critical");
  assert.equal(verdict.givingEligible, false);
  assert.equal(verdict.userReviewRequired, true);
});

test("explicit quarantine and blocked verdicts keep Giving AI ineligible", () => {
  const quarantined = derivePipelineVerdict({ repository_review: { verdict: "quarantine", risk_score: 40, trust_score: 50 } });
  const blocked = derivePipelineVerdict({ repository_review: { verdict: "blocked", risk_score: 10, trust_score: 90 } });
  assert.equal(quarantined.givingEligible, false);
  assert.equal(blocked.givingEligible, false);
  assert.equal(verdictTone("quarantine"), "warning");
  assert.equal(verdictTone("blocked"), "critical");
  assert.equal(verdictLabel("needs-review"), "Needs review");
});

test("old isolated_by_protection status maps to blocked", () => {
  const verdict = derivePipelineVerdict({
    status: "isolated_by_protection",
    protection_report: { verdict: "review", threat_score: 20, trust_score: 80 }
  });
  assert.equal(verdict.verdict, "blocked");
  assert.equal(verdict.tone, "critical");
  assert.equal(verdict.givingEligible, false);
  assert.match(verdict.reason, /isolated_by_protection/i);
});

console.log("pipelineVerdicts tests passed");
