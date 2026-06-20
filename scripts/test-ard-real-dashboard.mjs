#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { loadLatestArdRunForDashboard } from "./vnem-app-server.mjs";

const root = await mkdtemp(path.join(os.tmpdir(), "vnem-real-dashboard-"));
try {
  const runId = "ard-real-dashboard-test";
  const runDir = path.join(root, "discovery", "ard-runs", runId);
  await mkdir(runDir, { recursive: true });
  await mkdir(path.join(root, "discovery", "ard-runs"), { recursive: true });
  const summary = {
    schema: "vnem.ardDogfood.v1",
    ok: true,
    runId,
    research: {
      sourceLanesUsed: ["repo-self", "external-metadata"],
      candidatesFound: 3,
      categories: [{ key: "repo-automation", count: 1 }, { key: "roblox-luau", count: 1 }],
      lowSignalCollapsed: 0,
      repeatedCandidates: 0
    },
    protection: {
      branchEligible: 2,
      reviewArtifactOnly: 1,
      dangerousFindings: 1,
      verdicts: []
    },
    giving: {
      included: 2,
      excluded: 1,
      workPackages: [
        {
          workPackageId: "wp-real-dashboard-1",
          title: "Real dashboard package",
          safeAction: "repo-owned-code",
          category: "repo-automation",
          sourceLane: "repo-self",
          state: "implementation-ready",
          branchability: "branch-ready",
          external: false,
          repoOwned: true,
          filesToChange: ["scripts/ard-capability-engine.mjs"],
          testsToRun: ["npm run test:ard-capability-engine"],
          whyThisImprovesVNEM: "Proves real local dashboard state can surface a real package.",
          blockedReasons: []
        }
      ]
    },
    changesByArd: {
      preview: {
        ok: true,
        selectedWorkPackage: {
          workPackageId: "wp-real-dashboard-1",
          title: "Real dashboard package",
          safeAction: "repo-owned-code",
          filesToChange: ["scripts/ard-capability-engine.mjs"],
          testsToRun: ["npm run test:ard-capability-engine"]
        },
        exactFiles: ["scripts/ard-capability-engine.mjs"],
        blockedReason: null
      },
      prepare: null,
      result: "preview-ready"
    }
  };
  await writeFile(path.join(runDir, "dogfood-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  await writeFile(path.join(root, "discovery", "ard-runs", "latest.json"), `${JSON.stringify({ run_id: runId, artifact: "dogfood-summary.json" }, null, 2)}\n`);

  const loaded = await loadLatestArdRunForDashboard(root);
  assert.equal(loaded.ok, true);
  assert.equal(loaded.pipeline.runId, runId, "real dashboard loader must expose the dogfood run id");
  assert.equal(loaded.pipeline.mode, "repo/local dogfood", "real dashboard loader must not require mock mode");
  assert.equal(loaded.pipeline.giving.workPackages.length, 1);
  assert.equal(loaded.pipeline.giving.workPackages[0].workPackageId, "wp-real-dashboard-1");
  assert.deepEqual(loaded.pipeline.changesByArd.preview.exactFiles, ["scripts/ard-capability-engine.mjs"]);
  assert.equal(loaded.pipeline.realLocalBackend, true);
  assert.equal(loaded.pipeline.mockMode, false);

  const fileText = await readFile(path.join(runDir, "dogfood-summary.json"), "utf8");
  assert.match(fileText, /wp-real-dashboard-1/);
} finally {
  await rm(root, { recursive: true, force: true });
}

console.log("ARD real dashboard loader tests passed");
