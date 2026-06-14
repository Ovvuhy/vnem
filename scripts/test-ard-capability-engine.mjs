#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import {
  ARD_RESEARCH_CATEGORIES,
  ARD_RESEARCH_LANES,
  classifyWithProtectionV2,
  createGivingWorkPackages,
  mergeCandidateMemory,
  rankArdCandidates,
  runArdDogfood,
  runResearchV2,
  stableCandidateId
} from "./ard-capability-engine.mjs";

const rootDir = await mkdtemp(path.join(os.tmpdir(), "vnem-ard-capability-test-"));
try {
  await mkdir(path.join(rootDir, "docs"), { recursive: true });
  await mkdir(path.join(rootDir, "scripts"), { recursive: true });
  await mkdir(path.join(rootDir, "dashboard", "src", "lib"), { recursive: true });
  await mkdir(path.join(rootDir, "discovery", "run-history"), { recursive: true });
  await writeFile(path.join(rootDir, "package.json"), JSON.stringify({ scripts: { "test:current": "node test.js", dashboard: "npm run ard:dev" } }, null, 2));
  await writeFile(path.join(rootDir, "docs", "ARD_PRODUCT_BACKLOG.md"), "# Backlog\n\n## P0 — Better review queue\n\nReduce repeated candidate cards and show branch eligibility.\n\n## P0 — Changes by ARD review/branch clarity\n\nShow exact files and validation proof before pushing protected branch.\n");
  await writeFile(path.join(rootDir, "docs", "ARD_ROADMAP.md"), "# Roadmap\n\n## Next\nCandidate lifecycle memory and work packages.\n");
  await writeFile(path.join(rootDir, "docs", "BUILDING_AI_STATE.md"), "# State\n\nWeak: repeated candidates and no work package loop.\n");
  await writeFile(path.join(rootDir, "docs", "ARD_DECISION_LOG.md"), "# Decisions\n\nChanges by ARD remains protected.\n");
  await writeFile(path.join(rootDir, "docs", "current-system.md"), "# Current\n\nARD is browser/local deterministic and not antivirus-grade.\n");
  await writeFile(path.join(rootDir, "docs", "local-testing.md"), "# Local\n\nUse npm run dashboard.\n");
  await writeFile(path.join(rootDir, "scripts", "ard-pipeline.mjs"), "// TODO: candidate memory needs branch eligibility proof\n");
  await writeFile(path.join(rootDir, "dashboard", "src", "lib", "ardOperatorModel.js"), "export const x = 'review queue lacks source lanes';\n");
  await writeFile(path.join(rootDir, "discovery", "run-history", "old.json"), JSON.stringify({ remainingLimitations: ["same missing license candidate repeated"], status: "ready-to-commit" }, null, 2));

  assert.equal(stableCandidateId("Repo Self-Research Lane", "scripts/ard-pipeline.mjs", "Candidate Memory"), stableCandidateId("repo self-research lane", "scripts/ard-pipeline.mjs", "candidate memory"));

  const research = await runResearchV2({ rootDir, runId: "ard-v2-test", now: () => "2026-06-14T00:00:00.000Z", write: false });
  assert.equal(research.schema, "vnem.ardResearch.v2");
  assert.equal(ARD_RESEARCH_LANES.length >= 7, true);
  assert.equal(new Set(research.sourceLanes.map((lane) => lane.key)).size >= 7, true, "multiple source lanes must be active");
  for (const lane of ["repo-self", "backlog-roadmap", "run-history-failure", "dashboard-product-weakness", "test-validation-gap", "docs-drift", "changes-by-ard-opportunity"]) {
    assert.equal(research.sourceLanes.some((item) => item.key === lane && item.candidatesFound >= 1), true, `${lane} should produce candidates`);
  }
  assert.ok(research.candidates.every((candidate) => candidate.candidateId && candidate.sourceLane && candidate.sourceKey && candidate.productImpact && Array.isArray(candidate.evidence)));
  const categories = new Set(research.candidates.map((candidate) => candidate.category));
  assert.ok(ARD_RESEARCH_CATEGORIES.length >= 14, "taxonomy must include broad ARD research categories");
  for (const category of ["ai-skills", "ai-mcp", "ai-agent-frameworks", "ai-evals-benchmarks", "ai-safety-security", "repo-automation", "roblox-luau"]) {
    assert.ok(categories.has(category), `${category} should be represented by repo/local research or observed metadata`);
  }
  assert.ok(research.categories.length >= 8, "research output should expose category distribution");
  const robloxCount = research.candidates.filter((candidate) => candidate.category === "roblox-luau").length;
  assert.ok(robloxCount < research.candidates.length / 2, "Roblox/Luau must not dominate ARD research output");
  assert.ok(research.candidates.some((candidate) => candidate.external && candidate.licenseStatus === "missing" && candidate.allowedOutput === "review-artifact-only"), "missing-license external repos should become review-artifact-only candidates");

  const first = mergeCandidateMemory(research.candidates, { candidates: {} }, { runId: "run-1", now: "2026-06-14T00:00:00.000Z" });
  const second = mergeCandidateMemory(research.candidates, first.memory, { runId: "run-2", now: "2026-06-14T01:00:00.000Z" });
  const repeated = Object.values(second.memory.candidates).find((record) => record.timesSeen >= 2);
  assert.ok(repeated, "repeated candidates should increment timesSeen");
  assert.ok(Object.values(second.memory.candidates).some((record) => ["low-signal-collapsed", "branch-ready", "waiting-for-evidence", "needs-review"].includes(record.status)));

  const ranked = rankArdCandidates(research.candidates, { memory: second.memory });
  assert.ok(ranked.groups.branchReady.length >= 1, "repo-owned branchable candidates should be branch-ready");
  assert.ok(ranked.groups.blocked.length >= 1, "dangerous safety canary must remain visible as blocked");
  assert.ok(ranked.groups.lowSignalCollapsed.length >= 1, "repeated low-signal candidates should collapse");
  assert.ok(ranked.candidates.every((candidate) => candidate.scoring && Number.isFinite(candidate.scoring.totalScore)));

  const protection = classifyWithProtectionV2(ranked.candidates);
  assert.equal(protection.verdicts.every((verdict) => verdict.safeAction && Array.isArray(verdict.missingEvidence) && typeof verdict.canFeedChangesByArd === "boolean"), true);
  assert.equal(protection.verdicts.filter((verdict) => verdict.dangerousSignals.length).every((verdict) => !verdict.canFeedGiving && !verdict.canFeedChangesByArd), true);
  assert.ok(protection.verdicts.some((verdict) => verdict.branchEligible && verdict.safeAction === "repo-owned-code"));
  const externalReview = protection.verdicts.find((verdict) => verdict.safeAction === "review-artifact-only");
  assert.ok(externalReview, "Protection AI should create review-artifact-only handling for unresolved external repos");
  assert.equal(externalReview.implementationEligible, false, "missing-license external repos must not become implementable code");
  assert.equal(externalReview.canCreateReviewArtifact, true, "metadata-only review artifact should be allowed");
  assert.ok(protection.verdicts.some((verdict) => verdict.verdict === "needs-review" && verdict.whatWouldMakeItBranchEligible.length));

  const giving = createGivingWorkPackages(ranked.candidates, protection);
  assert.ok(giving.workPackages.length >= 1, "Giving AI v2 should produce at least one safe work package");
  assert.equal(giving.workPackages.every((workPackage) => workPackage.filesToChange.length && workPackage.testsToRun.length && workPackage.safeAction), true);
  assert.ok(giving.workPackages.some((workPackage) => workPackage.safeAction === "review-artifact-only" && workPackage.filesToChange.some((file) => file.startsWith("docs/ard-reviews/"))), "Giving AI should produce safe external review artifacts");
  assert.equal(giving.excludedCandidates.some((candidate) => candidate.dangerous === true), true, "dangerous candidates must be excluded from work packages");

  const dogfood = await runArdDogfood({ rootDir, runId: "ard-dogfood-test", now: () => "2026-06-14T02:00:00.000Z", write: true, prepareChanges: false });
  assert.equal(dogfood.ok, true);
  assert.ok(dogfood.research.sourceLanesUsed.length >= 3);
  assert.ok(dogfood.giving.workPackages.length >= 1);
  assert.ok(dogfood.changesByArd.preview.exactFiles.length >= 1);
  assert.equal(dogfood.changesByArd.preview.mainProtected, true);
  const artifact = JSON.parse(await readFile(path.join(rootDir, "discovery", "ard-runs", "ard-dogfood-test", "dogfood-summary.json"), "utf8"));
  assert.equal(artifact.schema, "vnem.ardDogfood.v1");

  console.log("ARD capability engine tests passed");
} finally {
  await rm(rootDir, { recursive: true, force: true });
}
