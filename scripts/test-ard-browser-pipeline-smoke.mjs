#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runArdBrowserPipelineSmoke } from "./ard-browser-pipeline-smoke.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
await mkdir(path.join(rootDir, ".tmp"), { recursive: true });
const tmpRoot = await mkdtemp(path.join(rootDir, ".tmp", "ard-browser-smoke-"));

try {
  const result = await runArdBrowserPipelineSmoke({
    repositoryRoot: tmpRoot,
    runId: "ard-browser-smoke-test",
    json: true
  });

  assert.equal(result.ok, true, "smoke path must receive a successful backend response");
  assert.equal(result.status, "completed");
  assert.equal(result.runId, "ard-browser-smoke-test");
  assert.equal(result.branch.mode, "fixture-remote");
  assert.equal(result.branch.pushed, true, "browser path must produce fixture remote branch proof, not a fake push");
  assert.ok(result.research.sourceLanesUsed?.length >= 3, "Research AI v2 should report multiple source lanes through the browser path");
  assert.ok(result.giving.included >= 1, "Giving AI should include at least one safe branchable work package/candidate");
  assert.ok(result.giving.workPackages?.length >= 1, "Giving AI v2 should expose work packages through the browser path");
  assert.equal(result.dangerousFindings.length, 1, "dangerous findings must remain visible");
  assert.equal(result.protection.blocked, 1, "Protection AI must block the dangerous browser candidate");
  assert.ok(existsSync(path.join(tmpRoot, "discovery", "ard-runs", "ard-browser-smoke-test", "demo-summary.json")), "smoke path should write inspectable local run artifacts");
} finally {
  await rm(tmpRoot, { recursive: true, force: true });
}

console.log("ARD browser pipeline smoke path tests passed");
