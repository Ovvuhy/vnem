#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

const rootDir = await mkdtemp(path.join(os.tmpdir(), "vnem-ard-dogfood-test-"));
try {
  await mkdir(path.join(rootDir, "docs"), { recursive: true });
  await mkdir(path.join(rootDir, "scripts"), { recursive: true });
  await mkdir(path.join(rootDir, "dashboard", "src", "lib"), { recursive: true });
  await mkdir(path.join(rootDir, "discovery", "run-history"), { recursive: true });
  await writeFile(path.join(rootDir, "package.json"), JSON.stringify({ scripts: { "test:current": "node test.js" } }, null, 2));
  await writeFile(path.join(rootDir, "docs", "ARD_PRODUCT_BACKLOG.md"), "# Backlog\nReview queue, candidate lifecycle memory, Changes by ARD exact files.\n");
  await writeFile(path.join(rootDir, "docs", "ARD_ROADMAP.md"), "# Roadmap\nWork packages and branch eligibility.\n");
  await writeFile(path.join(rootDir, "docs", "BUILDING_AI_STATE.md"), "# State\nRepeated candidates and no work package loop.\n");
  await writeFile(path.join(rootDir, "docs", "ARD_DECISION_LOG.md"), "# Decisions\nMain protected.\n");
  await writeFile(path.join(rootDir, "docs", "current-system.md"), "# Current\nARD browser/local.\n");
  await writeFile(path.join(rootDir, "docs", "local-testing.md"), "# Local\nUse npm run dashboard.\n");
  await writeFile(path.join(rootDir, "scripts", "ard-pipeline.mjs"), "// TODO work package candidate memory\n");
  await writeFile(path.join(rootDir, "scripts", "ard-changes-branch.mjs"), "// Changes by ARD exists\n");
  await writeFile(path.join(rootDir, "dashboard", "src", "lib", "ardOperatorModel.js"), "export const lacks='work packages';\n");
  await writeFile(path.join(rootDir, "discovery", "run-history", "old.json"), JSON.stringify({ notes: "same stale candidate repeated" }, null, 2));

  const script = path.resolve("scripts/ard-dogfood.mjs");
  const { stdout } = await execFile("node", [script, "--run-id", "ard-dogfood-cli-test"], { cwd: rootDir, windowsHide: true, maxBuffer: 1024 * 1024 });
  const report = JSON.parse(stdout);
  assert.equal(report.ok, true);
  assert.ok(report.sourceLanesUsed.length >= 3, "dogfood should report at least three active lanes");
  assert.ok(report.candidatesFound >= 7, "dogfood should find multi-lane candidates");
  assert.ok(report.categories?.length >= 8, "dogfood should report diverse categories");
  assert.ok(report.categories.some((category) => category.key === "ai-mcp"), "dogfood should include MCP category");
  assert.ok(report.reviewArtifactOnly >= 1, "dogfood should count review-artifact-only candidates");
  assert.ok(report.workPackages.length >= 1, "dogfood should produce a work package");
  assert.ok(report.workPackages.some((workPackage) => workPackage.safeAction === "review-artifact-only"), "dogfood should include external review artifact work packages");
  assert.ok(report.changesByArd.exactFiles.length >= 1, "Changes by ARD preview must list exact files");
  assert.equal(report.changesByArd.preparedCommit, null, "default dogfood must not prepare git branches");
  const summary = JSON.parse(await readFile(path.join(rootDir, "discovery", "ard-runs", "ard-dogfood-cli-test", "dogfood-summary.json"), "utf8"));
  assert.equal(summary.schema, "vnem.ardDogfood.v1");
  assert.equal(summary.changesByArd.preview.mainProtected, true);
  const memory = JSON.parse(await readFile(path.join(rootDir, "discovery", "ard-memory", "candidate-memory.json"), "utf8"));
  assert.ok(Object.keys(memory.candidates).length >= 7, "candidate memory should be written intentionally");
  console.log("ARD dogfood tests passed");
} finally {
  await rm(rootDir, { recursive: true, force: true });
}
