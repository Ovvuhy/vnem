#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { runResearch } from "./ard-pipeline.mjs";

const rootDir = await mkdtemp(path.join(os.tmpdir(), "vnem-ard-research-test-"));
try {
  const research = await runResearch({ rootDir, runId: "ard-test-research", now: () => "2026-06-07T00:00:00.000Z" });
  assert.equal(research.status, "completed");
  assert.equal(research.mode, "demo/local research source");
  assert.equal(research.candidatesFound, 4);
  assert.ok(research.candidates.every((candidate) => candidate.sourceUrl && candidate.rawEvidence?.length));
  const dangerous = research.candidates.find((candidate) => candidate.id === "token-stealing-postinstall-kit");
  assert.equal(dangerous.initialSafetyVerdict, "dangerous");
  assert.ok(dangerous.riskHints.includes("token stealing"));
  assert.ok(research.sourcesChecked.includes("demo/local research source"));
  console.log("ARD research tests passed");
} finally {
  await rm(rootDir, { recursive: true, force: true });
}
