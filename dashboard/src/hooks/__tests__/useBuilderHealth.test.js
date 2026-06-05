#!/usr/bin/env node
import assert from "node:assert/strict";
import { createBuilderHealthController } from "../useBuilderHealth.js";

const sessionPayload = {
  ok: true,
  timestamp: "2026-06-05T19:00:00.000Z",
  branch: "main",
  localHead: "452ff00e35231aaccd7e7fa39ff5ce651b908bcc",
  originMainSha: "452ff00e35231aaccd7e7fa39ff5ce651b908bcc",
  localMatchesOriginMain: true,
  worktree: { clean: true, changedFiles: [], untrackedFiles: [] },
  generatedDispatchFiles: [],
  accidentalPaths: [{ path: "/c/c/VNEM", exists: false }],
  devHealth: { ports: [{ port: 9099, listening: true, looksLikeVnemAppServer: true }, { port: 4174, listening: false }, { port: 4175, listening: false }] },
  nextSafeAction: "Clean start."
};

await testInitialLoadAndManualRefresh();
await testRefreshErrorDoesNotCrash();
console.log("useBuilderHealth tests passed");

async function testInitialLoadAndManualRefresh() {
  const states = [];
  const calls = [];
  const controller = createBuilderHealthController({
    apiClient: {
      builderSession: async () => {
        calls.push("builderSession");
        return sessionPayload;
      }
    },
    onStateChange: (state) => states.push(state),
    now: () => "2026-06-05T19:01:00.000Z"
  });

  assert.equal(controller.getState().status, "idle");
  const result = await controller.refresh();
  assert.equal(result.ok, true);
  assert.equal(controller.getState().status, "live");
  assert.equal(controller.getState().source, "backend");
  assert.equal(controller.getState().session.branch, "main");
  assert.equal(controller.getState().lastCheckedAt, "2026-06-05T19:01:00.000Z");
  assert.deepEqual(calls, ["builderSession"]);
  assert.ok(states.some((state) => state.status === "loading"));
  assert.ok(states.some((state) => state.status === "live"));
}

async function testRefreshErrorDoesNotCrash() {
  const controller = createBuilderHealthController({
    apiClient: {
      builderSession: async () => { throw new Error("ECONNREFUSED"); }
    },
    now: () => "2026-06-05T19:02:00.000Z"
  });
  const result = await controller.refresh();
  assert.equal(result.ok, false);
  assert.equal(controller.getState().status, "offline");
  assert.equal(controller.getState().source, "fallback");
  assert.equal(controller.getState().session, null);
  assert.equal(controller.getState().error.message, "ECONNREFUSED");
}
