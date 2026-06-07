#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { runResearch, runProtection, runGiving } from "./ard-pipeline.mjs";

const rootDir = await mkdtemp(path.join(os.tmpdir(), "vnem-ard-giving-test-"));
try {
  const research = await runResearch({ rootDir, runId: "ard-test-giving" });
  const protection = await runProtection({ rootDir, research });
  const giving = await runGiving({ rootDir, research, protection });
  assert.equal(giving.ok, true);
  assert.equal(giving.branchName.startsWith("vnem-research/"), true);
  assert.equal(giving.baseBranch, "main");
  assert.equal(giving.pushed, true);
  assert.equal(giving.pushMode, "fixture-remote");
  assert.equal(giving.includedCandidates.length, 1);
  assert.equal(giving.includedCandidates[0].id, "clean-dashboard-launcher");
  assert.ok(giving.excludedCandidates.some((candidate) => candidate.reason === "blocked"));
  assert.ok(!giving.branchName.includes("main"));
  const dir = path.join(rootDir, "discovery", "ard-runs", research.runId);
  for (const name of ["research.json", "protection.json", "dangerous-findings.md", "giving-plan.md", "branch-summary.md"]) {
    const text = await readFile(path.join(dir, name), "utf8");
    assert.ok(text.length > 10, `${name} should be written`);
  }
  console.log("ARD giving tests passed");
} finally {
  await rm(rootDir, { recursive: true, force: true });
}
