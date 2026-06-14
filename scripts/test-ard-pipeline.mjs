#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { runArdDemo } from "./ard-pipeline.mjs";

const rootDir = await mkdtemp(path.join(os.tmpdir(), "vnem-ard-pipeline-test-"));
try {
  await mkdir(path.join(rootDir, "docs"), { recursive: true });
  await mkdir(path.join(rootDir, "scripts"), { recursive: true });
  await mkdir(path.join(rootDir, "dashboard", "src", "lib"), { recursive: true });
  await mkdir(path.join(rootDir, "discovery", "run-history"), { recursive: true });
  await writeFile(path.join(rootDir, "package.json"), JSON.stringify({ scripts: { "test:current": "node test.js" } }, null, 2));
  await writeFile(path.join(rootDir, "docs", "ARD_PRODUCT_BACKLOG.md"), "# Backlog\nReview queue, candidate memory, Changes by ARD exact files.\n");
  await writeFile(path.join(rootDir, "docs", "ARD_ROADMAP.md"), "# Roadmap\nWork packages and branch eligibility.\n");
  await writeFile(path.join(rootDir, "docs", "BUILDING_AI_STATE.md"), "# State\nRepeated candidates and no work package loop.\n");
  await writeFile(path.join(rootDir, "docs", "ARD_DECISION_LOG.md"), "# Decisions\nMain protected.\n");
  await writeFile(path.join(rootDir, "docs", "current-system.md"), "# Current\nARD browser/local.\n");
  await writeFile(path.join(rootDir, "docs", "local-testing.md"), "# Local\nUse npm run dashboard.\n");
  await writeFile(path.join(rootDir, "scripts", "ard-pipeline.mjs"), "// TODO work package candidate memory\n");
  await writeFile(path.join(rootDir, "scripts", "ard-changes-branch.mjs"), "// Changes by ARD exists\n");
  await writeFile(path.join(rootDir, "dashboard", "src", "lib", "ardOperatorModel.js"), "export const lacks='work packages';\n");
  await writeFile(path.join(rootDir, "discovery", "run-history", "old.json"), JSON.stringify({ notes: "same stale candidate repeated" }, null, 2));

  const demo = await runArdDemo({ rootDir, runId: "ard-test-pipeline" });
  assert.equal(demo.mode, "repo/local multi-lane research");
  assert.ok(demo.research.candidatesFound >= 7);
  assert.ok(demo.protection.allowed >= 1);
  assert.ok(demo.protection.dangerousFindings >= 1);
  assert.equal(demo.giving.pushed, true);
  assert.equal(demo.giving.pushMode, "fixture-remote");
  assert.ok(demo.giving.included >= 1);
  const latest = JSON.parse(await readFile(path.join(rootDir, "discovery", "ard-runs", "latest.json"), "utf8"));
  assert.equal(latest.runId, "ard-test-pipeline");
  console.log("ARD pipeline tests passed");
} finally {
  await rm(rootDir, { recursive: true, force: true });
}
