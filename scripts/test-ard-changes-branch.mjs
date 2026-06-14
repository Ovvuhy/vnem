#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

import {
  CHANGES_BY_ARD_BRANCH,
  CHANGES_BY_ARD_CONFIRMATION,
  CHANGES_BY_ARD_DISPLAY_NAME,
  prepareArdChanges,
  previewArdChanges,
  pushArdChanges,
  validateChangesByArdBranch
} from "./ard-changes-branch.mjs";

const execFile = promisify(execFileCallback);

async function git(cwd, args) {
  const result = await execFile("git", args, { cwd, windowsHide: true, maxBuffer: 1024 * 1024 });
  return `${result.stdout ?? ""}${result.stderr ?? ""}`;
}

async function test(name, fn) {
  try {
    await fn();
  } catch (error) {
    error.message = `${name}: ${error.message}`;
    throw error;
  }
}

await test("constants use protected non-main branch", () => {
  assert.equal(CHANGES_BY_ARD_DISPLAY_NAME, "Changes by ARD");
  assert.equal(CHANGES_BY_ARD_BRANCH, "changes-by-ard");
  assert.equal(CHANGES_BY_ARD_CONFIRMATION, "I understand ARD will push changes to the Changes by ARD branch, not main.");
  assert.equal(validateChangesByArdBranch("changes-by-ard").ok, true);
  assert.equal(validateChangesByArdBranch("Changes by ARD").ok, false, "spaced display name must not be treated as the git branch");
  assert.equal(validateChangesByArdBranch("main").ok, false, "main must never be a Changes by ARD target");
});

await test("preview is dry-run and describes deterministic repo-owned artifact", async () => {
  const calls = [];
  const preview = await previewArdChanges({ runId: "demo-run" }, {
    repositoryRoot: "/tmp/vnem-preview",
    gitRunner: async (args) => {
      calls.push(args);
      if (args.join(" ") === "branch --show-current") return "main\n";
      if (args.join(" ") === "status --short") return "";
      if (args.join(" ") === "rev-parse HEAD") return "base123\n";
      return "";
    },
    now: "2026-06-13T12:00:00.000Z"
  });
  assert.equal(preview.ok, true);
  assert.equal(preview.mode, "dry-run");
  assert.equal(preview.displayName, "Changes by ARD");
  assert.equal(preview.branchName, "changes-by-ard");
  assert.equal(preview.mainProtected, true);
  assert.equal(preview.wouldCommit, false);
  assert.equal(preview.wouldPush, false);
  assert.equal(preview.changedFiles.includes("discovery/ard-changes/demo-run/summary.json"), true);
  assert.equal(calls.some((args) => args[0] === "commit" || args[0] === "push"), false, "preview must not commit or push");
});

await test("preview accepts an ARD work package and lists exact files", async () => {
  const preview = await previewArdChanges({
    runId: "dogfood-work-package",
    title: "Dogfood work package",
    workPackage: {
      workPackageId: "wp-dogfood",
      title: "Record ARD dogfood status",
      candidateId: "candidate-docs",
      safeAction: "docs-only",
      whyThisImprovesVNEM: "Shows dogfood proof to operators.",
      filesToChange: ["docs/ARD_DOGFOOD_STATUS.md"],
      testsToRun: ["npm run test:current"],
      riskNotes: ["repo-owned docs only"],
      blockedReasons: []
    }
  }, {
    repositoryRoot: "/tmp/vnem-preview",
    gitRunner: async (args) => {
      if (args.join(" ") === "branch --show-current") return "main\n";
      if (args.join(" ") === "status --short") return "";
      if (args.join(" ") === "rev-parse HEAD") return "base123\n";
      return "";
    },
    now: "2026-06-13T12:00:00.000Z"
  });
  assert.equal(preview.ok, true);
  assert.equal(preview.selectedWorkPackage.workPackageId, "wp-dogfood");
  assert.deepEqual(preview.exactFiles, ["docs/ARD_DOGFOOD_STATUS.md"]);
  assert.equal(preview.changedFiles.includes("docs/ARD_DOGFOOD_STATUS.md"), true);
  assert.equal(preview.testsToRun.includes("npm run test:current"), true);
});

await test("prepare creates a real local commit on changes-by-ard and returns to clean main", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vnem-ard-changes-"));
  try {
    await git(root, ["init", "-b", "main"]);
    await git(root, ["config", "user.name", "VNEM Test"]);
    await git(root, ["config", "user.email", "vnem-test@example.invalid"]);
    await git(root, ["remote", "add", "origin", "https://github.com/Ovvuhy/vnem.git"]);
    await git(root, ["commit", "--allow-empty", "-m", "seed main"]);
    const mainBefore = (await git(root, ["rev-parse", "HEAD"])).trim();

    const prepare = await prepareArdChanges({ runId: "demo-run", title: "Demo ARD change" }, {
      repositoryRoot: root,
      now: "2026-06-13T12:01:00.000Z"
    });

    assert.equal(prepare.ok, true);
    assert.equal(prepare.mode, "local commit");
    assert.equal(prepare.displayName, "Changes by ARD");
    assert.equal(prepare.branchName, "changes-by-ard");
    assert.equal(prepare.mainProtected, true);
    assert.match(prepare.commitHash, /^[0-9a-f]{40}$/);
    assert.equal(prepare.pushStatus, "not-pushed");
    assert.equal(prepare.changedFiles.includes("discovery/ard-changes/demo-run/summary.json"), true);

    assert.equal((await git(root, ["branch", "--show-current"])).trim(), "main", "prepare must return to main");
    assert.equal((await git(root, ["rev-parse", "HEAD"])).trim(), mainBefore, "main HEAD must remain unchanged");
    assert.equal((await git(root, ["status", "--short"])).trim(), "", "prepare must leave main worktree clean");
    assert.equal((await git(root, ["rev-parse", "changes-by-ard"])).trim(), prepare.commitHash);
    const artifact = await readFile(path.join(root, "discovery", "ard-changes", "demo-run", "summary.json"), "utf8").catch(() => null);
    assert.equal(artifact, null, "artifact should live on changes-by-ard branch, not dirty main");
    await git(root, ["checkout", "changes-by-ard"]);
    const summary = JSON.parse(await readFile(path.join(root, "discovery", "ard-changes", "demo-run", "summary.json"), "utf8"));
    assert.equal(summary.displayName, "Changes by ARD");
    assert.equal(summary.branchName, "changes-by-ard");
    assert.equal(summary.mainProtected, true);
    await git(root, ["checkout", "main"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

await test("prepare can commit safe work package generated files without touching main", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vnem-ard-work-package-"));
  try {
    await git(root, ["init", "-b", "main"]);
    await git(root, ["config", "user.name", "VNEM Test"]);
    await git(root, ["config", "user.email", "vnem-test@example.invalid"]);
    await git(root, ["remote", "add", "origin", "https://github.com/Ovvuhy/vnem.git"]);
    await git(root, ["commit", "--allow-empty", "-m", "seed main"]);
    const mainBefore = (await git(root, ["rev-parse", "HEAD"])).trim();
    const prepare = await prepareArdChanges({
      runId: "dogfood-work-package",
      title: "Dogfood work package",
      workPackage: {
        workPackageId: "wp-dogfood",
        title: "Record ARD dogfood status",
        candidateId: "candidate-docs",
        safeAction: "docs-only",
        whyThisImprovesVNEM: "Shows dogfood proof to operators.",
        filesToChange: ["docs/ARD_DOGFOOD_STATUS.md"],
        testsToRun: ["npm run test:current"],
        riskNotes: ["repo-owned docs only"],
        blockedReasons: []
      }
    }, { repositoryRoot: root, now: "2026-06-13T12:01:30.000Z" });
    assert.equal(prepare.ok, true);
    assert.equal((await git(root, ["branch", "--show-current"])).trim(), "main");
    assert.equal((await git(root, ["rev-parse", "HEAD"])).trim(), mainBefore);
    await git(root, ["checkout", "changes-by-ard"]);
    const dogfoodStatus = await readFile(path.join(root, "docs", "ARD_DOGFOOD_STATUS.md"), "utf8");
    assert.match(dogfoodStatus, /Record ARD dogfood status/);
    const summary = JSON.parse(await readFile(path.join(root, "discovery", "ard-changes", "dogfood-work-package", "summary.json"), "utf8"));
    assert.deepEqual(summary.exactFiles, ["docs/ARD_DOGFOOD_STATUS.md"]);
    await git(root, ["checkout", "main"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

await test("push refuses without exact confirmation and only targets changes-by-ard", async () => {
  const calls = [];
  const missing = await pushArdChanges({ confirmation: "push it" }, {
    repositoryRoot: "/tmp/vnem-push",
    gitRunner: async (args) => {
      calls.push(args);
      return "";
    }
  });
  assert.equal(missing.ok, false);
  assert.equal(missing.error_code, "ARD_CHANGES_CONFIRMATION_REQUIRED");
  assert.equal(calls.length, 0, "missing confirmation must not mutate git state");

  const pushed = await pushArdChanges({ confirmation: CHANGES_BY_ARD_CONFIRMATION }, {
    repositoryRoot: "/tmp/vnem-push",
    gitRunner: async (args) => {
      calls.push(args);
      const command = args.join(" ");
      if (command === "branch --show-current") return "main\n";
      if (command === "status --short") return "";
      if (command === "rev-parse changes-by-ard") return "abc123\n";
      return "";
    },
    now: "2026-06-13T12:02:00.000Z"
  });
  assert.equal(pushed.ok, true);
  assert.equal(pushed.pushStatus, "pushed");
  assert.equal(calls.some((args) => args.join(" ") === "push -u origin changes-by-ard"), true);
  assert.equal(calls.some((args) => args[0] === "push" && args.includes("main")), false, "push must never target main");
  assert.equal(calls.some((args) => args[0] === "merge"), false, "push must never merge");
  assert.equal(calls.some((args) => args.join(" ") === "checkout main"), true, "push must leave local branch on main");
});

console.log("ARD Changes branch tests passed");
