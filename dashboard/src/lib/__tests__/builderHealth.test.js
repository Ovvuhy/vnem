#!/usr/bin/env node
import assert from "node:assert/strict";
import { deriveBuilderHealth } from "../builderHealth.js";

const cleanSession = {
  ok: true,
  timestamp: "2026-06-05T19:00:00.000Z",
  branch: "main",
  localHead: "452ff00e35231aaccd7e7fa39ff5ce651b908bcc",
  originMainSha: "452ff00e35231aaccd7e7fa39ff5ce651b908bcc",
  localMatchesOriginMain: true,
  worktree: { clean: true, changedFiles: [], untrackedFiles: [] },
  generatedDispatchFiles: [],
  accidentalPaths: [{ path: "/c/c/VNEM", exists: false }, { path: "C:/c/VNEM", exists: false }],
  devHealth: { ports: [
    { port: 9099, listening: true, looksLikeVnemAppServer: true, looksLikeDashboardDevServer: false, recommendedAction: "Backend already running." },
    { port: 4174, listening: false, looksLikeVnemAppServer: false, looksLikeDashboardDevServer: false, recommendedAction: "Port free." },
    { port: 4175, listening: false, looksLikeVnemAppServer: false, looksLikeDashboardDevServer: false, recommendedAction: "Port free." }
  ] },
  nextSafeAction: "Clean start."
};

const activeSession = {
  ...cleanSession,
  activeRun: {
    id: "active-1",
    title: "Automatic Builder Run Snapshots",
    status: "validating",
    startedAt: "2026-06-05T20:00:00.000Z",
    updatedAt: "2026-06-05T20:01:00.000Z",
    commit: null,
    pushed: false,
    validationRun: { status: "running", commandCount: 3 },
    generatedArtifacts: { refreshed: true, status: "passed" },
    safetyChecks: { status: "passed" },
    capture: { commandCount: 3, lastCommand: { command: "npm run dashboard:build", status: "passed" }, lastFailedCommand: null },
    visualCheck: { status: "not-run" },
    nextRecommendedImprovement: "Finish validation."
  },
  recoveryStatus: { state: "active-run-interrupted", nextAction: "Active run interrupted before validation. Next action: run validation ladder before commit." }
};

const latestRun = {
  latest: {
    id: "run-1",
    title: "feat(builder): add reliability and run history tools",
    status: "pushed",
    commit: "452ff00e35231aaccd7e7fa39ff5ce651b908bcc",
    pushed: true,
    validationRun: { status: "passed" },
    visualCheck: { status: "passed" },
    nextRecommendedImprovement: "Wire live builder health."
  }
};

test("live backend session normalizes to clean and synced", () => {
  const health = deriveBuilderHealth({ builderSession: cleanSession, runHistory: latestRun, source: "backend", lastCheckedAt: cleanSession.timestamp });
  assert.equal(health.source, "backend");
  assert.equal(health.repoSync.label, "Clean and synced");
  assert.equal(health.repoSync.tone, "ok");
  assert.equal(health.branch, "main");
  assert.equal(health.localHeadShort, "452ff00");
  assert.equal(health.remoteHeadShort, "452ff00");
  assert.equal(health.worktree.label, "Clean worktree");
  assert.equal(health.worktree.changedCount, 0);
  assert.equal(health.worktree.untrackedCount, 0);
  assert.match(health.liveMessage, /Live builder session loaded/);
});

test("dirty worktree normalizes to warning", () => {
  const session = { ...cleanSession, worktree: { clean: false, changedFiles: ["a.js", "b.js"], untrackedFiles: ["new.js"] } };
  const health = deriveBuilderHealth({ builderSession: session, runHistory: latestRun, source: "backend" });
  assert.equal(health.worktree.label, "Dirty worktree");
  assert.equal(health.worktree.tone, "review");
  assert.equal(health.worktree.changedCount, 2);
  assert.equal(health.worktree.untrackedCount, 1);
});

test("local remote mismatch normalizes to sync warning", () => {
  const session = { ...cleanSession, originMainSha: "16161af000000000000000000000000000000000", localMatchesOriginMain: false };
  const health = deriveBuilderHealth({ builderSession: session, runHistory: latestRun, source: "backend" });
  assert.equal(health.repoSync.label, "Local/remote mismatch");
  assert.equal(health.repoSync.tone, "review");
});

test("generated dispatch and accidental paths produce warnings", () => {
  const session = { ...cleanSession, generatedDispatchFiles: [".vnem/approved/dispatch-test.md"], accidentalPaths: [{ path: "/c/c/VNEM", exists: true }] };
  const health = deriveBuilderHealth({ builderSession: session, runHistory: latestRun, source: "backend" });
  assert.equal(health.generatedDispatch.label, "1 generated dispatch file");
  assert.equal(health.generatedDispatch.tone, "review");
  assert.equal(health.accidentalPaths.label, "Accidental VNEM path found");
  assert.equal(health.accidentalPaths.tone, "critical");
});

test("dashboard dev ports running are shown without cleanup actions", () => {
  const session = { ...cleanSession, devHealth: { ports: [
    ...cleanSession.devHealth.ports.slice(0, 1),
    { port: 4174, listening: true, looksLikeDashboardDevServer: true, recommendedAction: "Reuse it or cleanup after checks." },
    { port: 4175, listening: true, looksLikeDashboardDevServer: true, recommendedAction: "Reuse it or cleanup after checks." }
  ] } };
  const health = deriveBuilderHealth({ builderSession: session, runHistory: latestRun, source: "backend" });
  assert.equal(health.dashboardPorts.label, "Dashboard dev server running");
  assert.equal(health.dashboardPorts.runningPorts.join(","), "4174,4175");
  assert.equal(health.actions.some((action) => /cleanup|kill/i.test(action.label)), false);
});

test("backend offline uses stale fallback guidance", () => {
  const health = deriveBuilderHealth({ builderSession: null, runHistory: latestRun, source: "fallback" });
  assert.equal(health.source, "fallback");
  assert.equal(health.repoSync.label, "Builder session unavailable");
  assert.match(health.liveMessage, /backend offline/i);
  assert.match(health.staleOutputGuidance, /Stale Vite output does not mean new repo work exists/);
});

test("active builder run normalizes to recovery snapshot", () => {
  const health = deriveBuilderHealth({ builderSession: activeSession, runHistory: latestRun, source: "backend" });
  assert.equal(health.activeRun.title, "Automatic Builder Run Snapshots");
  assert.equal(health.activeRun.status, "validating");
  assert.equal(health.activeRun.validationStatus, "running");
  assert.equal(health.activeRun.visualStatus, "not-run");
  assert.equal(health.runSnapshot.lastCapturedCommand, "npm run dashboard:build");
  assert.equal(health.runSnapshot.validationCommandCount, 3);
  assert.equal(health.runSnapshot.safetyStatus, "passed");
  assert.equal(health.runSnapshot.generatedStatus, "refreshed");
  assert.match(health.recoveryStatus.nextAction, /validation ladder/);
});

test("dirty session with no active run does not claim clean ready", () => {
  const session = { ...cleanSession, worktree: { clean: false, changedFiles: ["scripts/a.mjs"], untrackedFiles: [] } };
  const health = deriveBuilderHealth({ builderSession: session, runHistory: latestRun, source: "backend" });
  assert.equal(health.runSnapshot.status, "attention-needed-no-active-run");
  assert.match(health.runSnapshot.nextAction, /worktree is dirty/i);
});

function test(name, fn) {
  try { fn(); } catch (error) { error.message = `${name}: ${error.message}`; throw error; }
}

console.log("dashboard builder health tests passed");
