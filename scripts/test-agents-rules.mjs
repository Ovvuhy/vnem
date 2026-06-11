#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), '..');

function repoPath(relativePath) {
  return path.join(repoRoot, relativePath);
}

function readRepoFile(relativePath) {
  return fs.readFileSync(repoPath(relativePath), 'utf8');
}

function assertExists(relativePath) {
  assert.ok(fs.existsSync(repoPath(relativePath)), `Expected ${relativePath} to exist`);
}

function assertIncludes(haystack, needle, label = needle) {
  assert.ok(haystack.includes(needle), `Expected ${label}`);
}

[
  'AGENTS.md',
  'docs/agent-rules/VNEM_GLOBAL_RULES.md',
  'docs/hermes-codex-vnem-setup.md',
  'docs/agent-rules/HERMES_VNEM_START_PROMPT.md',
  'docs/agent-rules/hermes-vnem-rules/SKILL.md',
  'scripts/install-vnem-agent-rules.mjs',
].forEach(assertExists);

const agents = readRepoFile('AGENTS.md');
[
  'VNEM Agent Operating Rules',
  'Real Improvement Doctrine',
  'Anti-Placebo Law',
  'Adaptive Goal Understanding',
  'Research As Understanding',
  'When To Stop The User Or The AI',
  'Safety Boundaries',
  'Definition Of Done',
  'Hermes + Codex Usage',
  'ARD — AI Research Dashboard',
  'Research AI',
  'Protection AI',
  'Giving AI',
  'demo/local research',
  'fixture remote proof',
  'not antivirus-grade',
  'never push to main',
  'Run ARD pipeline',
  '76ZuJidMzB32EQLLiCL8UPQATQFoY2mrqZa3Kvr8PZhp',
  'H62Ri1EExddxFKsLMn4nbmbxiCSxNRLtF8igPySLA23B',
].forEach((needle) => assertIncludes(agents, needle));

const globalRules = readRepoFile('docs/agent-rules/VNEM_GLOBAL_RULES.md');
[
  'self-improving AI booster system',
  'Broad Research Sources',
  'apps',
  'websites',
  'repos',
  'posts',
  'docs',
  'reviews',
  'comments',
  'forums',
  'mod pages',
  'issues',
  'pull requests',
  'tutorials',
  'competitors',
  'alternatives',
  'negative feedback',
  'positive feedback',
  'safety problems',
  'license problems',
  'ARD Browser Pipeline v1',
].forEach((needle) => assertIncludes(globalRules, needle, `global rules ${needle}`));

const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'vnem-agent-rules-'));
try {
  const result = spawnSync(process.execPath, ['scripts/install-vnem-agent-rules.mjs', '--all', '--dry-run'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      VNEM_AGENT_RULES_HOME: tempHome,
    },
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.ok(!fs.existsSync(path.join(tempHome, '.codex')), 'Dry-run must not write to home directories');

  const output = `${result.stdout}\n${result.stderr}`;
  [
    '~/.codex/AGENTS.md',
    'hermes desktop --cwd',
    'hermes --tui',
    'VNEM GLOBAL RULES START',
    'VNEM GLOBAL RULES END',
  ].forEach((needle) => assertIncludes(output, needle, `installer output ${needle}`));
} finally {
  fs.rmSync(tempHome, { recursive: true, force: true });
}

console.log('VNEM agent-rules checks passed.');
