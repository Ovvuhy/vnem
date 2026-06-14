#!/usr/bin/env node
import assert from "node:assert/strict";
import { runResearch, runProtection, runGiving } from "./ard-pipeline.mjs";

const research = await runResearch({ rootDir: process.cwd(), runId: "ard-test-giving", write: false });
const protection = await runProtection({ rootDir: process.cwd(), research, write: false });
const giving = await runGiving({ rootDir: process.cwd(), research, protection, write: false });
assert.equal(giving.ok, true);
assert.equal(giving.schema, "vnem.ardGivingPlan.v2");
assert.equal(giving.branchName.startsWith("vnem-research/"), true);
assert.equal(giving.baseBranch, "main");
assert.equal(giving.pushed, true);
assert.equal(giving.pushMode, "fixture-remote");
assert.ok(giving.workPackages.length >= 1, "Giving AI v2 should produce work packages");
assert.ok(giving.includedCandidates.length >= 1, "Giving AI v2 should include safe branchable candidates");
assert.ok(giving.includedCandidates.every((candidate) => candidate.workPackageId && candidate.filesLikelyAffected.length && candidate.testsToRun.length));
assert.ok(giving.workPackages.some((workPackage) => workPackage.safeAction === "review-artifact-only" && workPackage.filesToChange.some((file) => file.startsWith("docs/ard-reviews/"))), "Giving AI should create review artifact packages for unresolved external repos");
assert.ok(giving.excludedCandidates.some((candidate) => candidate.reason === "blocked" || candidate.verdict === "blocked"));
assert.ok(!giving.branchName.includes("main"));
assert.ok(giving.givingV2.lowSignalCollapsedCount >= 0);
console.log("ARD giving tests passed");
