#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { builderRunPaths, readActiveBuilderRun, recoverBuilderRun, startBuilderRun } from "./vnem-builder-run.mjs";
import {
  commitCapturedBuilderRun,
  pushCapturedBuilderRun,
  runCapturedCommand,
  runCapturedSafety,
  runCapturedValidation
} from "./vnem-builder-capture.mjs";

const execFileAsync = promisify(execFile);
const tempRoot = await mkdtemp(path.join(os.tmpdir(), "vnem-builder-capture-test-"));
const fakeSession = (overrides = {}) => ({
  branch: "main",
  localHead: overrides.localHead ?? "abc1234567890",
  originMainSha: overrides.originMainSha ?? "abc1234567890",
  localMatchesOriginMain: (overrides.localHead ?? "abc1234567890") === (overrides.originMainSha ?? "abc1234567890"),
  worktree: overrides.worktree ?? { clean: true, raw: [], changedFiles: [], untrackedFiles: [] },
  generatedDispatchFiles: [],
  devHealth: { ports: [] },
  nextSafeAction: "fixture"
});
const sessionProvider = async () => fakeSession();

try {
  await assert.rejects(
    () => runCapturedCommand({ rootDir: tempRoot, label: "no active", command: [process.execPath, "-e", "process.exit(0)"], sessionProvider }),
    /active builder run required/i,
    "wrapper requires active run"
  );

  await startBuilderRun({ rootDir: tempRoot, title: "Auto Capture", sessionProvider, now: () => "2026-06-05T21:30:00.000Z" });

  const passed = await runCapturedCommand({
    rootDir: tempRoot,
    label: "passing command",
    kind: "validation",
    command: [process.execPath, "-e", "console.log('pass')"],
    sessionProvider,
    now: () => "2026-06-05T21:31:00.000Z"
  });
  assert.equal(passed.exitCode, 0);
  assert.equal(passed.status, "passed");
  assert.match(passed.stdoutTail, /pass/);

  const failed = await runCapturedCommand({
    rootDir: tempRoot,
    label: "failing command",
    kind: "validation",
    command: [process.execPath, "-e", "console.error('fail'); process.exit(7)"],
    sessionProvider,
    throwOnFailure: false,
    now: () => "2026-06-05T21:32:00.000Z"
  });
  assert.equal(failed.exitCode, 7, "wrapper returns failing exit code");
  assert.equal(failed.status, "failed");
  let active = await readActiveBuilderRun({ rootDir: tempRoot });
  assert.equal(active.capture.commands.at(-1).label, "failing command", "failed command is recorded");
  assert.equal(active.validationRun.status, "failed", "failing validation updates run");

  await runCapturedValidation({
    rootDir: tempRoot,
    commands: [
      { label: "validation one", command: [process.execPath, "-e", "console.log('one')"] },
      { label: "generate artifacts", command: [process.execPath, "-e", "console.log('generated')"], kind: "generate" }
    ],
    sessionProvider,
    now: () => "2026-06-05T21:33:00.000Z"
  });
  active = await readActiveBuilderRun({ rootDir: tempRoot });
  assert.equal(active.validationRun.status, "passed", "successful ladder marks validation passed");
  assert.equal(active.validationRun.commandCount >= 2, true, "validation ladder records command count");
  assert.equal(active.generatedArtifacts.refreshed, true, "generate command marks generated artifacts refreshed");

  await runCapturedSafety({
    rootDir: tempRoot,
    runner: async (command) => ({ exitCode: command.includes("diff --check") ? 0 : 0, stdout: command.includes("grep") ? "docs/current-system.md: allow does not mean 100% safe\n" : "fixture\n", stderr: "" }),
    sessionProvider,
    now: () => "2026-06-05T21:34:00.000Z"
  });
  active = await readActiveBuilderRun({ rootDir: tempRoot });
  assert.equal(active.safetyChecks.status, "passed");
  assert.equal(active.safetyChecks.grepHitsCount, 1);

  const blockedRoot = await mkdtemp(path.join(os.tmpdir(), "vnem-builder-capture-blocked-"));
  await startBuilderRun({ rootDir: blockedRoot, title: "Blocked", sessionProvider, now: () => "2026-06-05T21:35:00.000Z" });
  await assert.rejects(() => commitCapturedBuilderRun({ rootDir: blockedRoot, message: "test: blocked", sessionProvider }), /validation status passed/i, "commit helper refuses without validation passed");
  await rm(blockedRoot, { recursive: true, force: true });

  const gitRoot = await mkdtemp(path.join(os.tmpdir(), "vnem-builder-capture-git-"));
  await execFileAsync("git", ["init"], { cwd: gitRoot });
  await execFileAsync("git", ["config", "user.email", "test@example.invalid"], { cwd: gitRoot });
  await execFileAsync("git", ["config", "user.name", "VNEM Test"], { cwd: gitRoot });
  await writeFile(path.join(gitRoot, "README.md"), "one\n");
  await execFileAsync("git", ["add", "."], { cwd: gitRoot });
  await execFileAsync("git", ["commit", "-m", "init"], { cwd: gitRoot });
  await startBuilderRun({ rootDir: gitRoot, title: "Commit Fixture", sessionProvider, now: () => "2026-06-05T21:36:00.000Z" });
  await runCapturedValidation({ rootDir: gitRoot, commands: [{ label: "ok", command: [process.execPath, "-e", "process.exit(0)"] }], sessionProvider });
  await runCapturedSafety({ rootDir: gitRoot, runner: async () => ({ exitCode: 0, stdout: "", stderr: "" }), sessionProvider });
  await writeFile(path.join(gitRoot, "README.md"), "two\n");
  const committed = await commitCapturedBuilderRun({ rootDir: gitRoot, message: "test: capture commit", sessionProvider });
  assert.match(committed.commit, /^[a-f0-9]{40}$/i, "commit helper records commit SHA");
  active = await readActiveBuilderRun({ rootDir: gitRoot });
  assert.equal(active.status, "committed");
  const pushedDryRun = await pushCapturedBuilderRun({ rootDir: gitRoot, dryRun: true, sessionProvider });
  assert.equal(pushedDryRun.pushStatus, "dry-run");
  await rm(gitRoot, { recursive: true, force: true });

  const recovery = await recoverBuilderRun({ rootDir: tempRoot, sessionProvider: async () => fakeSession({ worktree: { clean: false, raw: [" M x"], changedFiles: ["x"], untrackedFiles: [] } }) });
  assert.match(recovery.nextAction, /commit|failed|validation|safety/i, "recovery uses captured state");

  const paths = builderRunPaths({ rootDir: tempRoot });
  const activePointer = JSON.parse(await readFile(paths.activeRunPath, "utf8"));
  assert.equal(activePointer.path.includes(".."), false, "active pointer stays inside run-history");
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

console.log("vnem builder capture tests passed");
