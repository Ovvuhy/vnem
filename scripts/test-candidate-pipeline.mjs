#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  applyCandidateClassification,
  applyReviewDecision,
  buildBranchCandidateSet,
  buildReviewQueue,
  classifyCandidate,
  enrichCandidate,
  writeReviewRecord
} from "./candidate-pipeline.mjs";
import { prepareGivingBranch } from "./giving-branch.mjs";

const cleanCandidate = {
  id: "clean-source",
  title: "Clean source-backed repo",
  source_route: "github-search",
  repository: {
    id: "clean-source",
    full_name: "ovvuh/clean-source",
    html_url: "https://github.com/ovvuh/clean-source",
    description: "README backed VNEM improvement helper.",
    stargazers_count: 1200,
    forks_count: 80,
    language: "JavaScript",
    license: { spdx_id: "MIT" },
    updated_at: "2026-06-01T00:00:00.000Z",
    has_readme: true
  },
  trust_score: 95
};

const clean = applyCandidateClassification(cleanCandidate);
assert.equal(clean.pipeline_verdict, "allow", "clean source-backed candidate should be allowed by current metadata checks");
assert.equal(clean.enrichment.primarySourceFound, true);
assert.equal(clean.enrichment.license, "mit");

const missingLicense = applyCandidateClassification({
  ...cleanCandidate,
  id: "missing-license",
  title: "Missing license candidate",
  repository: { ...cleanCandidate.repository, id: "missing-license", license: null, html_url: "https://github.com/ovvuh/missing-license" }
});
assert.equal(missingLicense.pipeline_verdict, "needs-review", "missing license must require review");

const weakSource = applyCandidateClassification({
  id: "weak-social",
  title: "Forum mention only",
  source_route: "hacker-news",
  source_url: "https://news.ycombinator.com/item?id=1",
  trust_score: 42,
  repository: { description: "Interesting but needs primary source." }
});
assert.equal(weakSource.pipeline_verdict, "needs-review", "weak/social source must not auto-allow");

const suspicious = applyCandidateClassification({
  ...cleanCandidate,
  id: "postinstall",
  repository: {
    ...cleanCandidate.repository,
    id: "postinstall",
    html_url: "https://github.com/ovvuh/postinstall",
    audit_text: '{"scripts":{"postinstall":"node install.js"}}'
  }
});
assert.equal(suspicious.pipeline_verdict, "quarantine", "postinstall/lifecycle script concern must quarantine");

const blocked = applyCandidateClassification({
  ...cleanCandidate,
  id: "credential-theft",
  risk_flags: ["credential-theft"],
  repository: { ...cleanCandidate.repository, id: "credential-theft", html_url: "https://github.com/evil/credential-theft" }
});
assert.equal(blocked.pipeline_verdict, "blocked", "credential theft indicator must block");

const duplicateQueue = buildReviewQueue([
  { ...cleanCandidate, id: "dup-a", repository: { ...cleanCandidate.repository, id: "dup-a", html_url: "https://github.com/ovvuh/dup" } },
  { ...cleanCandidate, id: "dup-b", repository: { ...cleanCandidate.repository, id: "dup-b", html_url: "https://github.com/ovvuh/dup" } }
]);
assert.equal(duplicateQueue.duplicateCandidates, 1, "duplicate candidate should be grouped/hidden");

const indexedQueue = buildReviewQueue([{ ...cleanCandidate, id: "indexed", already_indexed: true }]);
assert.equal(indexedQueue.alreadyIndexed, 1, "already indexed candidate should be grouped");
assert.equal(indexedQueue.branchEligible, 0, "already indexed candidate should not be branch-eligible");

const reviewPile = Array.from({ length: 161 }, (_, index) => ({
  id: `review-${index}`,
  title: `Review candidate ${index}`,
  source_route: index % 2 === 0 ? "hacker-news" : "github-search",
  source_url: index % 2 === 0 ? `https://news.ycombinator.com/item?id=${index}` : `https://github.com/ovvuh/review-${index}`,
  risk_flags: [index % 3 === 0 ? "missing-license" : "needs-primary-source"],
  trust_score: 55,
  repository: { id: `review-${index}`, description: "Needs human review." }
}));
const reviewQueue = buildReviewQueue(reviewPile);
assert.equal(reviewQueue.totalFound, 161);
assert.equal(reviewQueue.topReviewCandidates.length, 5, "large review piles must surface only top five actionable candidates");
assert.equal(reviewQueue.recommendedAction, "review-top-candidates");

const reviewed = applyReviewDecision(missingLicense, {
  decision: "approve-for-giving",
  notes: "Maintainer checked source and license context manually.",
  reviewedBy: "manual-owner"
});
const reviewedQueue = buildReviewQueue([reviewed]);
assert.equal(reviewedQueue.branchEligible, 1, "review-satisfied needs-review candidate should become branch-eligible");

const unsafeSet = buildBranchCandidateSet([reviewed, blocked, suspicious]);
assert.equal(unsafeSet.branchEligibleCandidates.length, 1, "branch set should include only branch-eligible candidates");
assert.equal(unsafeSet.excludedCandidates.some((candidate) => candidate.verdict === "blocked"), true);
assert.equal(unsafeSet.excludedCandidates.some((candidate) => candidate.verdict === "quarantine"), true);

assert.throws(() => applyReviewDecision(missingLicense, { decision: "ship-it" }), /Invalid review decision/);

const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "vnem-review-record-"));
try {
  const write = await writeReviewRecord(tmpRoot, missingLicense, {
    decision: "approve-for-giving",
    notes: "Safe local JSON review record only.",
    reviewedBy: "manual-owner"
  });
  assert.equal(write.ok, true);
  assert.equal(existsSync(write.filePath), true);
  const stored = JSON.parse(await readFile(write.filePath, "utf8"));
  assert.equal(stored.reviewSatisfied, true);
  assert.equal(stored.notes, "Safe local JSON review record only.");
} finally {
  await rm(tmpRoot, { recursive: true, force: true });
}

const unconfirmedPrepare = await prepareGivingBranch({
  sourceMissionId: "mission-pipeline-v2",
  branchName: "vnem-giving/pipeline-v2",
  baseBranch: "main",
  includedCandidates: [{ id: "clean-source", title: "Clean", verdict: "allow" }]
}, {
  repositoryRoot: process.cwd(),
  gitRunner: async () => "main",
  commandRunner: async () => ({ exitCode: 0, output: "not run" })
});
assert.equal(unconfirmedPrepare.ok, false);
assert.equal(unconfirmedPrepare.error_code, "GIVING_BRANCH_CONFIRMATION_REQUIRED", "prepare requires exact confirmation");

let pushed = false;
const confirmedPrepare = await prepareGivingBranch({
  sourceMissionId: "mission-pipeline-v2",
  branchName: "vnem-giving/pipeline-v2",
  baseBranch: "main",
  includedCandidates: [{ id: "clean-source", title: "Clean", verdict: "allow" }],
  confirm: "prepare-giving-branch"
}, {
  repositoryRoot: process.cwd(),
  gitRunner: async (args) => {
    if (args[0] === "branch") return "main";
    if (args[0] === "status") return " M local-change";
    if (args[0] === "push") pushed = true;
    return "";
  },
  commandRunner: async () => ({ exitCode: 0, output: "not run" })
});
assert.equal(confirmedPrepare.ok, false);
assert.equal(confirmedPrepare.error_code, "GIVING_BRANCH_DIRTY_WORKTREE");
assert.equal(pushed, false, "dirty worktree must not push or merge main");

const enrichment = enrichCandidate(cleanCandidate);
const classification = classifyCandidate(cleanCandidate, enrichment);
assert.equal(classification.verdict, "allow");

console.log("candidate pipeline tests passed");
