#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const architecturePath = path.join(rootDir, "docs", "100x-architecture.md");
const text = await readFile(architecturePath, "utf8");

const requiredZones = [
  "vnem-core",
  "vnem-precision",
  "vnem-hermes",
  "vnem-protection",
  "vnem-giving",
  "vnem-desktop",
  "vnem-local-ai",
  "vnem-clarity"
];

for (const zone of requiredZones) {
  assert.match(text, new RegExp(`### \`${zone}\``), `${zone} section is required`);
}

const requiredPhrases = [
  "read-only install pack must remain safe",
  "must never be hidden inside read-only guidance",
  "Must not auto-merge changes",
  "Must not claim that arbitrary code is \"100% safe\"",
  "Must never commit directly to `main`",
  "Must not modify external app configuration without a preview and user confirmation",
  "Must not download models without user approval",
  "Must operate from diffs and verified metadata"
];

for (const phrase of requiredPhrases) {
  assert.ok(text.includes(phrase), `architecture contract missing phrase: ${phrase}`);
}

console.log("100x architecture contract tests passed");

