#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { listRunHistory, latestRunHistory, parseRunHistoryArgs, recordRunHistory, runHistoryPaths } from "./vnem-run-history.mjs";

const tempRoot = await mkdtemp(path.join(os.tmpdir(), "vnem-run-history-test-"));
try {
  const paths = runHistoryPaths({ rootDir: tempRoot });
  assert.equal(paths.historyDir.endsWith(path.join("discovery", "run-history")), true, "history should live under discovery/run-history");
  assert.equal(paths.historyDir.includes(".vnem"), false, "history source must not be generated .vnem output");

  const created = await recordRunHistory({
    rootDir: tempRoot,
    title: "Test Builder Run",
    commit: "abc123",
    status: "pushed",
    branch: "main",
    pushed: true,
    changedSurfaces: ["scripts"],
    validationRun: { status: "passed", commands: ["npm test"] },
    visualCheck: { status: "not-run", notes: "unit test fixture" },
    generatedArtifacts: { refreshed: false },
    safetyNotes: ["no auto-merge"],
    remainingLimitations: ["fixture only"],
    nextRecommendedImprovement: "Add more fixtures."
  });

  assert.equal(created.status, "pushed");
  assert.equal(created.commit, "abc123");
  assert.equal(created.pushed, true);
  assert.equal(created.validationRun.status, "passed");
  assert.equal(created.filePath.startsWith(paths.historyDir), true, "record path must stay inside run-history directory");

  const records = await listRunHistory({ rootDir: tempRoot });
  assert.equal(records.length, 1, "list should return created records");
  assert.equal(records[0].title, "Test Builder Run");

  const latest = await latestRunHistory({ rootDir: tempRoot });
  assert.equal(latest.id, created.id, "latest should return created record");

  assert.throws(() => parseRunHistoryArgs(["record", "--title", "../bad", "--commit", "abc", "--status", "pushed"]), /invalid title/i, "record titles must reject path-like values");
  assert.equal(parseRunHistoryArgs(["list"]).command, "list");
  assert.equal(parseRunHistoryArgs(["latest"]).command, "latest");
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

console.log("vnem run history tests passed");
