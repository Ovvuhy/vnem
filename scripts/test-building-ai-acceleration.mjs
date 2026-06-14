#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
assert.equal(pkg.scripts.dashboard, "npm run ard:dev", "dashboard script must launch the ARD dev stack");
assert.equal(pkg.scripts["dev:all"], "node scripts/launch-dev.mjs", "dev:all must remain available");
assert.ok(pkg.scripts["test:current"]?.includes("test:dashboard-operator"), "test:current must include the dashboard operator/current-feature test");

const requiredDocs = [
  "docs/BUILDING_AI_STATE.md",
  "docs/ARD_ROADMAP.md",
  "docs/ARD_PRODUCT_BACKLOG.md",
  "docs/ARD_DECISION_LOG.md"
];
for (const file of requiredDocs) {
  assert.ok(existsSync(file), `${file} must exist as repo-native Building AI memory`);
}

const state = readFileSync("docs/BUILDING_AI_STATE.md", "utf8");
[
  "What VNEM is",
  "What ARD currently does",
  "Recently shipped",
  "Broken or weak",
  "Current priority",
  "Must not be repeated",
  "How future Building AI runs start",
  "How future Building AI runs end",
  "Ship a real improvement. Prove it. Commit it. Push it. Leave the next run easier than this one."
].forEach((needle) => assert.match(state, new RegExp(escapeRegExp(needle)), `state doc missing ${needle}`));

const backlog = readFileSync("docs/ARD_PRODUCT_BACKLOG.md", "utf8");
[
  "ARD dashboard productization",
  "Research → Protection → Giving visibility",
  "Changes by ARD review/branch clarity",
  "AI/provider/mode/status truthfulness",
  "Faster user testing",
  "Better review queue",
  "Better pipeline quality/efficiency",
  "Later VNEM MCP foundation"
].forEach((needle) => assert.match(backlog, new RegExp(escapeRegExp(needle)), `backlog missing ${needle}`));

const rules = readFileSync("docs/building-ai-operating-rules.md", "utf8");
for (const doc of requiredDocs) {
  assert.match(rules, new RegExp(escapeRegExp(doc)), `operating rules must point to ${doc}`);
}

const readme = readFileSync("README.md", "utf8");
assert.match(readme, /npm\.cmd run dashboard/, "README must include the simple PowerShell dashboard launch command");

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

console.log("Building AI acceleration workflow tests passed");
