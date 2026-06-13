#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), '..');

const requiredFiles = [
  'AGENTS.md',
  'docs/agent-rules/VNEM_GLOBAL_RULES.md',
  'docs/hermes-codex-vnem-setup.md',
  'docs/product-direction.md',
  'README.md',
];

const repoAnchors = [
  'Real Improvement Doctrine',
  'Anti-Placebo Law',
  'Safety Boundaries',
  'ARD — AI Research Dashboard',
  'local testing',
  'test:current',
];

const missionPhrases = [
  'VNEM improves how AIs work',
  'any user task',
  'any project',
  'current implementation and testbed',
  'not only for improving VNEM',
];

const forbiddenMissionPatterns = [
  /(?<!not\s)only\s+for\s+improving\s+VNEM/i,
  /just\s+for\s+improving\s+VNEM/i,
  /VNEM\s+exists\s+only\s+to\s+improve\s+itself/i,
  /AIs\s+use\s+VNEM\s+only\s+to\s+improve\s+VNEM/i,
];

function repoPath(relativePath) {
  return path.join(repoRoot, relativePath);
}

function read(relativePath) {
  const filePath = repoPath(relativePath);
  assert.ok(fs.existsSync(filePath), `Expected ${relativePath} to exist`);
  return fs.readFileSync(filePath, 'utf8');
}

const fileTexts = new Map(requiredFiles.map((file) => [file, read(file)]));
const combined = [...fileTexts.values()].join('\n\n');
const lowerCombined = combined.toLowerCase();

for (const phrase of missionPhrases) {
  assert.ok(
    lowerCombined.includes(phrase.toLowerCase()),
    `Expected mission phrase across key docs: ${phrase}`,
  );
}

for (const anchor of repoAnchors) {
  assert.ok(
    lowerCombined.includes(anchor.toLowerCase()),
    `Expected repo anchor to remain documented: ${anchor}`,
  );
}

for (const [file, text] of fileTexts) {
  const normalized = text.replace(/```[\s\S]*?```/g, '');
  for (const pattern of forbiddenMissionPatterns) {
    assert.ok(!pattern.test(normalized), `Forbidden VNEM-only framing found in ${file}: ${pattern}`);
  }
}

const agents = fileTexts.get('AGENTS.md');
assert.match(agents, /Product Mission vs Repo Context/i, 'AGENTS.md must distinguish product mission from repo context');
assert.match(agents, /Product mission:[\s\S]*VNEM improves how AIs work/i, 'AGENTS.md must state the broad product mission');
assert.match(agents, /Repo context:[\s\S]*implementation and testbed/i, 'AGENTS.md must explain this repo as implementation/testbed');

const productDirection = fileTexts.get('docs/product-direction.md');
[
  'Lane 1 — ARD pipeline and branch safety',
  'Lane 2 — Using VNEM on other projects',
  'Lane 3 — Research and evidence quality',
  'Lane 4 — Protection and safety',
  'Lane 5 — AI workflow improvement',
  'Lane 6 — User-facing verification',
  'Lane 7 — Domain adapters',
  'one lane, not the whole product',
].forEach((needle) => {
  assert.ok(productDirection.includes(needle), `Expected product direction lane/guardrail: ${needle}`);
});

console.log('VNEM mission-language checks passed.');
