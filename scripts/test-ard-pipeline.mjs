#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { runArdDemo } from "./ard-pipeline.mjs";

const rootDir = await mkdtemp(path.join(os.tmpdir(), "vnem-ard-pipeline-test-"));
try {
  const demo = await runArdDemo({ rootDir, runId: "ard-test-pipeline" });
  assert.equal(demo.mode, "demo/local research source");
  assert.equal(demo.research.candidatesFound, 4);
  assert.equal(demo.protection.allowed, 1);
  assert.equal(demo.protection.dangerousFindings, 1);
  assert.equal(demo.giving.pushed, true);
  assert.equal(demo.giving.pushMode, "fixture-remote");
  assert.equal(demo.giving.included, 1);
  assert.equal(demo.giving.excluded, 3);
  const latest = JSON.parse(await readFile(path.join(rootDir, "discovery", "ard-runs", "latest.json"), "utf8"));
  assert.equal(latest.runId, "ard-test-pipeline");
  console.log("ARD pipeline tests passed");
} finally {
  await rm(rootDir, { recursive: true, force: true });
}
