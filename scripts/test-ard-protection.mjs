#!/usr/bin/env node
import assert from "node:assert/strict";
import { runResearch, runProtection } from "./ard-pipeline.mjs";

const research = await runResearch({ rootDir: process.cwd(), runId: "ard-test-protection", write: false });
const protection = await runProtection({ rootDir: process.cwd(), research, write: false });
assert.equal(protection.schema, "vnem.ardProtection.v2");
assert.ok(protection.allowed >= 1, "Protection AI v2 should allow safe repo-owned branchable work");
assert.ok(protection.needsReview >= 1, "Protection AI v2 should keep unresolved evidence in needs-review");
assert.ok(protection.blocked >= 1, "Protection AI v2 should block the dangerous local canary");
assert.ok(protection.branchEligible >= 1, "Protection AI v2 should produce branch eligibility");
assert.ok(protection.verdicts.every((item) => item.safeAction && Array.isArray(item.missingEvidence) && typeof item.branchEligible === "boolean"));
const dangerous = protection.verdicts.find((item) => item.verdict === "blocked");
assert.equal(dangerous.canFeedGiving, false);
assert.equal(dangerous.canFeedChangesByArd, false);
assert.ok(dangerous.dangerousSignals.length >= 1);
const review = protection.verdicts.find((item) => item.verdict === "needs-review");
assert.ok(review.missingEvidence.length >= 1);
assert.ok(review.whyNotBranchEligible);
const artifactOnly = protection.verdicts.find((item) => item.safeAction === "review-artifact-only");
assert.ok(artifactOnly, "missing-license external repo should be review-artifact-only");
assert.equal(artifactOnly.implementationEligible, false);
assert.equal(artifactOnly.allowedOutput, "review-artifact-only");
assert.ok(artifactOnly.missingEvidence.some((item) => /license|source/i.test(item)));
console.log("ARD protection tests passed");
