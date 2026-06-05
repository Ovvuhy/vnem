#!/usr/bin/env node
import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  builderRunPaths,
  clearActiveBuilderRun,
  finishBuilderRun,
  latestBuilderRun,
  recoverBuilderRun,
  startBuilderRun,
  updateBuilderRun
} from "./vnem-builder-run.mjs";

const tempRoot = await mkdtemp(path.join(os.tmpdir(), "vnem-builder-run-test-"));
const fakeSession = (overrides = {}) => ({
  ok: true,
  timestamp: "2026-06-05T20:00:00.000Z",
  branch: "main",
  localHead: "abc1234567890",
  originMainSha: "abc1234567890",
  localMatchesOriginMain: true,
  worktree: { clean: true, raw: [], changedFiles: [], untrackedFiles: [], ...(overrides.worktree ?? {}) },
  generatedDispatchFiles: overrides.generatedDispatchFiles ?? [],
  accidentalPaths: [{ path: "/c/c/VNEM", exists: false }],
  devHealth: { ports: [
    { port: 9099, listening: true, looksLikeVnemAppServer: true, recommendedAction: "Reuse backend." },
    { port: 4174, listening: false, looksLikeDashboardDevServer: false, recommendedAction: "Free." },
    { port: 4175, listening: false, looksLikeDashboardDevServer: false, recommendedAction: "Free." }
  ] },
  nextSafeAction: "Clean start.",
  ...overrides
});
const sessionProvider = async () => fakeSession();

try {
  const paths = builderRunPaths({ rootDir: tempRoot });
  assert.equal(paths.historyDir.endsWith(path.join("discovery", "run-history")), true);

  const started = await startBuilderRun({ rootDir: tempRoot, title: "Automatic Builder Run Snapshots", sessionProvider, now: () => "2026-06-05T20:00:00.000Z" });
  assert.equal(started.status, "started", "start creates started run");
  assert.equal(started.startHead, "abc1234567890", "start snapshots HEAD");
  assert.equal(started.worktreeAtStart.clean, true, "start snapshots worktree");
  assert.equal(started.filePath.startsWith(paths.historyDir + path.sep), true, "run record must stay inside run-history");

  const activeRaw = JSON.parse(await readFile(paths.activeRunPath, "utf8"));
  assert.equal(activeRaw.id, started.id, "start sets active-run pointer");

  await assert.rejects(() => startBuilderRun({ rootDir: tempRoot, title: "Stacked", sessionProvider }), /active builder run exists/i, "start refuses active run without force");

  const updated = await updateBuilderRun({ rootDir: tempRoot, status: "validating", validationRun: { status: "running", commands: ["npm run test:builder-run"] }, sessionProvider, now: () => "2026-06-05T20:01:00.000Z" });
  assert.equal(updated.status, "validating", "update modifies active run status");
  assert.equal(updated.validationRun.status, "running", "update records validation state");

  const recovery = await recoverBuilderRun({ rootDir: tempRoot, sessionProvider });
  assert.equal(recovery.state, "active-run-interrupted", "recover detects interrupted active run");
  assert.match(recovery.nextAction, /validation|finish|commit/i, "recover returns next action");

  const finished = await finishBuilderRun({
    rootDir: tempRoot,
    status: "pushed",
    commit: "def4567890",
    pushed: true,
    validationRun: { status: "passed", commands: ["npm run test:builder-run"] },
    visualCheck: { status: "passed", notes: "fixture" },
    generatedArtifacts: { refreshed: true, notes: "fixture" },
    safetyChecks: { status: "passed", notes: "no unsafe behavior" },
    sessionProvider: async () => fakeSession({ localHead: "def4567890", originMainSha: "def4567890" }),
    now: () => "2026-06-05T20:02:00.000Z"
  });
  assert.equal(finished.finishedAt, "2026-06-05T20:02:00.000Z");
  assert.equal(finished.commit, "def4567890");
  assert.equal(finished.pushed, true);
  assert.equal(finished.validationRun.status, "passed");
  await assert.rejects(() => access(paths.activeRunPath), /ENOENT/, "finish clears active-run pointer");

  const cleanRecovery = await recoverBuilderRun({ rootDir: tempRoot, sessionProvider: async () => fakeSession({ localHead: "def4567890", originMainSha: "def4567890" }) });
  assert.equal(cleanRecovery.state, "clean-no-active-run");
  assert.match(cleanRecovery.nextAction, /safe to start/i);

  const latest = await latestBuilderRun({ rootDir: tempRoot });
  assert.equal(latest.id, started.id, "latest returns finished run");

  await clearActiveBuilderRun({ rootDir: tempRoot });
  await assert.rejects(() => startBuilderRun({ rootDir: tempRoot, title: "../bad", sessionProvider }), /invalid title/i, "path-like titles rejected");
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

console.log("vnem builder run tests passed");
