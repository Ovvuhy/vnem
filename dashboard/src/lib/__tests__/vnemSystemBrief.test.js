#!/usr/bin/env node
import assert from "node:assert/strict";
import { deriveVnemSystemBrief } from "../vnemSystemBrief.js";

const stagedBrief = deriveVnemSystemBrief({
  telemetry: {
    status: "connected",
    activeIngestions: [
      {
        id: "dispatch-1",
        title: "Better app builder workflow",
        current_agent: "giving",
        status: "staged_for_review",
        staged_dispatch: { file_name: "dispatch-1.md" },
        trust_score: 88,
        threat_score: 12
      }
    ],
    intelligenceProvider: { status: "active", model: "nousresearch/hermes-3" },
    routeErrors: []
  },
  execution: {
    active: {
      id: "dispatch-1",
      title: "Better app builder workflow",
      current_agent: "giving",
      status: "staged_for_review"
    }
  },
  connector: {
    clients: [
      { id: "codex", installed: true, config_profile_present: true, vnem_connection_present: false }
    ]
  }
});

assert.equal(stagedBrief.health.label, "review needed");
assert.equal(stagedBrief.health.tone, "review");
assert.equal(stagedBrief.surfaces.find((surface) => surface.key === "app").status, "live");
assert.equal(stagedBrief.surfaces.find((surface) => surface.key === "giving").status, "1 awaiting review");
assert.equal(stagedBrief.nextActions[0].label, "Review staged dispatch");
assert.ok(stagedBrief.nextActions.some((action) => action.label === "Preview connector changes"));
assert.match(stagedBrief.summary, /Giving AI has staged reviewable markdown/);

const blockedBrief = deriveVnemSystemBrief({
  telemetry: {
    status: "connected",
    activeIngestions: [
      {
        id: "blocked-1",
        title: "Suspicious package",
        current_agent: "protection",
        status: "isolated_by_protection",
        protection_report: { flags: ["binary-download"] },
        threat_score: 91
      }
    ],
    routeErrors: [{ route: "npm-search", error_code: "PACKAGE_REVIEW_BLOCKED" }]
  }
});

assert.equal(blockedBrief.health.label, "blocked verdict");
assert.equal(blockedBrief.health.tone, "critical");
assert.equal(blockedBrief.surfaces.find((surface) => surface.key === "protection").status, "1 blocked");
assert.equal(blockedBrief.nextActions[0].label, "Keep blocked item out of Giving AI");
assert.match(blockedBrief.summary, /blocked verdict/);

const offlineBrief = deriveVnemSystemBrief({
  telemetry: {
    status: "error",
    activeIngestions: [],
    intelligenceProvider: { status: "missing_key" },
    routeErrors: []
  },
  connector: { clients: [] }
});

assert.equal(offlineBrief.health.label, "offline");
assert.equal(offlineBrief.surfaces.find((surface) => surface.key === "core").status, "implemented");
assert.equal(offlineBrief.surfaces.find((surface) => surface.key === "vnem-ai").status, "planned");
assert.equal(offlineBrief.nextActions[0].label, "Start local app server");
assert.ok(offlineBrief.nextActions.some((action) => action.label === "Optional provider setup"));

const backoffBrief = deriveVnemSystemBrief({
  telemetry: {
    status: "connected",
    activeIngestions: [],
    intelligenceProvider: {
      status: "paused_for_backoff",
      retry_after_ms: 12000,
      retry_until: "2026-06-03T00:00:12.000Z"
    },
    routeErrors: []
  }
});

assert.equal(backoffBrief.health.label, "provider backoff");
assert.equal(backoffBrief.nextActions[0].label, "Wait for provider resume");
assert.match(backoffBrief.summary, /active payload remains queued/);

console.log("vnemSystemBrief tests passed");
