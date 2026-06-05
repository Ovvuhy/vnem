#!/usr/bin/env node
import assert from "node:assert/strict";
import { buildBuilderSessionReport, summarizeWorktree, parseBuilderSessionArgs } from "./vnem-builder-session.mjs";

const report = await buildBuilderSessionReport({
  now: new Date("2026-06-05T12:00:00.000Z"),
  rootDir: process.cwd(),
  git: async (args) => {
    const key = args.join(" ");
    if (key === "branch --show-current") return "main\n";
    if (key === "rev-parse HEAD") return "abc123\n";
    if (key === "ls-remote origin refs/heads/main") return "abc123\trefs/heads/main\n";
    if (key === "status --short --untracked-files=all") return " M docs/current-system.md\n?? scratch.txt\n";
    if (key === "log --oneline -1") return "abc123 feat(test): sample\n";
    return "";
  },
  devHealth: async () => ({ ports: [
    { port: 9099, listening: true, pid: 111, service: "app-server", recommendedAction: "Reuse backend; do not start duplicate." },
    { port: 4174, listening: false, pid: null, service: "dashboard", recommendedAction: "Free." },
    { port: 4175, listening: false, pid: null, service: "dashboard", recommendedAction: "Free." }
  ]}),
  pathExists: async (target) => target.includes("/c/c/VNEM") ? false : false,
  listDispatchFiles: async () => [".vnem/approved/dispatch-test.md"]
});

assert.equal(report.branch, "main", "builder report must include branch");
assert.equal(report.localHead, "abc123", "builder report must include local HEAD");
assert.equal(report.originMainSha, "abc123", "builder report must include origin/main SHA");
assert.equal(report.localMatchesOriginMain, true, "builder report must compare local and remote");
assert.equal(report.worktree.clean, false, "dirty status should be reported");
assert.deepEqual(report.worktree.changedFiles, ["docs/current-system.md"], "changed files should be parsed");
assert.deepEqual(report.worktree.untrackedFiles, ["scratch.txt"], "untracked files should be parsed");
assert.equal(report.generatedDispatchFiles.length, 1, "dispatch files should be reported");
assert.equal(report.accidentalPaths.some((entry) => entry.exists), false, "accidental path checks should be present and false in fake report");
assert.equal(report.devHealth.ports.length, 3, "dev port health summary should be embedded");
assert.equal(report.activeRun, null, "builder report should include activeRun field");
assert.ok(report.latestRun === null || typeof report.latestRun === "object", "builder report should include latestRun field");
assert.ok(report.recoveryStatus, "builder report should include recoveryStatus");
assert.ok(report.runHistorySummary, "builder report should include runHistorySummary");
assert.equal(report.nextSafeAction.includes("Do not start new feature"), true, "dirty worktree should recommend stopping feature work");

const summary = summarizeWorktree(" M docs/current-system.md\n?? scratch.txt\n");
assert.equal(summary.clean, false);
assert.equal(parseBuilderSessionArgs(["--json"]).json, true, "--json should parse");

console.log("vnem builder session tests passed");
