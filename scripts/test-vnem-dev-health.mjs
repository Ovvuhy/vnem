#!/usr/bin/env node
import assert from "node:assert/strict";
import { deriveRecommendedAction, inspectVnemDevHealth, parseHealthArgs, shouldCleanupProcess } from "./vnem-dev-health.mjs";

const fakePorts = await inspectVnemDevHealth({
  platform: "test",
  execCommand: async () => ({ stdout: "", stderr: "", code: 0 }),
  processRows: [
    { port: 9099, pid: 111, command: "node scripts/vnem-app-server.mjs" },
    { port: 4174, pid: 222, command: "node ./node_modules/vite/bin/vite.js --config dashboard/vite.config.js --host 127.0.0.1" },
    { port: 4175, pid: 333, command: "C:/Windows/System32/unknown.exe" }
  ]
});

assert.deepEqual(fakePorts.ports.map((entry) => entry.port), [9099, 4174, 4175], "dev health must always report known VNEM ports");
assert.equal(fakePorts.ports[0].listening, true, "9099 should be detected as listening from fake rows");
assert.equal(fakePorts.ports[0].looksLikeVnemAppServer, true, "9099 app-server command should be recognized");
assert.equal(fakePorts.ports[1].looksLikeDashboardDevServer, true, "Vite dashboard command should be recognized");
assert.equal(fakePorts.ports[2].looksLikeDashboardDevServer, false, "unknown process must not be classified as dashboard dev server");
assert.equal(shouldCleanupProcess(fakePorts.ports[0]), false, "cleanup must never target 9099");
assert.equal(shouldCleanupProcess(fakePorts.ports[1]), true, "cleanup may target a clear dashboard Vite server on 4174/4175");
assert.equal(shouldCleanupProcess(fakePorts.ports[2]), false, "cleanup must not target unknown processes");
assert.equal(deriveRecommendedAction(fakePorts.ports[2]).includes("Do not kill"), true, "unknown listeners need an explicit no-kill recommendation");

const jsonArgs = parseHealthArgs(["--json"]);
assert.equal(jsonArgs.json, true, "--json should enable JSON output");
assert.equal(jsonArgs.cleanupDashboard, false, "--json should not imply cleanup");

const cleanupArgs = parseHealthArgs(["--cleanup-dashboard"]);
assert.equal(cleanupArgs.cleanupDashboard, true, "cleanup flag should parse");
assert.equal(cleanupArgs.json, false, "cleanup flag should not force JSON");

console.log("vnem dev health tests passed");
