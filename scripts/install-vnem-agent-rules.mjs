#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const START = '<!-- VNEM GLOBAL RULES START -->';
const END = '<!-- VNEM GLOBAL RULES END -->';

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), '..');
const argv = process.argv.slice(2);
const args = new Set(argv);

if (args.has('--help') || args.has('-h')) {
  console.log('Usage: node scripts/install-vnem-agent-rules.mjs [--dry-run] [--codex] [--codex --apply] [--print-hermes] [--all --dry-run]');
  process.exit(0);
}

const wantsAll = args.has('--all');
const noTargetArgs = argv.length === 0;
const wantsCodex = wantsAll || args.has('--codex') || args.has('--dry-run') || noTargetArgs;
const wantsHermes = wantsAll || args.has('--print-hermes') || args.has('--dry-run') || noTargetArgs;
const apply = args.has('--apply');
const dryRun = !apply || args.has('--dry-run');

function homeDir() {
  return process.env.VNEM_AGENT_RULES_HOME || os.homedir();
}

function displayPath(filePath) {
  const home = homeDir();
  if (filePath === home) return '~';
  if (filePath.startsWith(home + path.sep)) {
    return `~/${path.relative(home, filePath).replaceAll(path.sep, '/')}`;
  }
  return filePath;
}

function timestamp() {
  return new Date().toISOString().replaceAll(':', '').replaceAll('.', '-');
}

function vnemBlock() {
  return [
    START,
    '# VNEM Global Agent Rules',
    '',
    'VNEM is a general AI-improvement system. Apply VNEM principles to the current task/project, not only to the VNEM repo.',
    '',
    'Product mission: VNEM improves how AIs work on any user task, project, repo, app, mod, workflow, prompt, tool, system, research target, or idea.',
    '',
    'When working inside the VNEM repo, follow the repo root AGENTS.md first. The root rule file is the project-level source of truth for developing VNEM itself.',
    '',
    'Core mindset:',
    '- Understand what the user is trying to achieve.',
    '- Research what exists before claiming improvement.',
    '- Reason about what is weak in the current version.',
    '- Build real improvements, not placebo features.',
    '- Test the result and explain what remains.',
    '- Keep improving with evidence, not slogans.',
    '',
    'Safety and honesty:',
    '- Do not request private keys or seed phrases.',
    '- Do not silently edit Hermes global config or ~/.hermes.',
    '- Do not describe VNEM/ARD or Protection AI as antivirus-grade.',
    '- Preserve demo/local research and fixture remote proof labels.',
    '- Never push to main unless explicitly requested and validated.',
    '- Do not start ARD Browser Pipeline v1 unless the user explicitly asks for that product work.',
    '',
    'Hermes should be opened with the VNEM repo as cwd, for example:',
    '  cd C:\\VNEM\\vnem-src && hermes',
    '  cd C:\\VNEM\\vnem-src && hermes --tui',
    '  hermes desktop --cwd C:\\VNEM\\vnem-src',
    END,
  ].join('\n');
}

function upsertBlock(existing) {
  const block = vnemBlock();
  const startIndex = existing.indexOf(START);
  const endIndex = existing.indexOf(END);

  if ((startIndex === -1) !== (endIndex === -1)) {
    throw new Error('Found only one VNEM marker in existing Codex rules. Refusing to edit; repair the file manually.');
  }

  if (startIndex !== -1 && endIndex > startIndex) {
    return `${existing.slice(0, startIndex).trimEnd()}\n\n${block}\n\n${existing.slice(endIndex + END.length).trimStart()}`.trimEnd() + '\n';
  }

  if (!existing.trim()) return `${block}\n`;
  return `${existing.trimEnd()}\n\n${block}\n`;
}

function printHermes() {
  console.log('Hermes project rules are loaded by opening Hermes in the VNEM repo cwd.');
  console.log('Hermes global config is not modified automatically. No files are written to ~/.hermes by this installer.');
  console.log('');
  console.log('Recommended Hermes commands:');
  console.log(`cd ${repoRoot} && hermes`);
  console.log(`cd ${repoRoot} && hermes --tui`);
  console.log(`hermes desktop --cwd ${repoRoot}`);
  console.log('');
  console.log('Optional Hermes prompt: docs/agent-rules/HERMES_VNEM_START_PROMPT.md');
  console.log('Optional Hermes skill artifact: docs/agent-rules/hermes-vnem-rules/SKILL.md');
}

function installCodex() {
  const codexDir = path.join(homeDir(), '.codex');
  const agentsFile = path.join(codexDir, 'AGENTS.md');
  const existing = fs.existsSync(agentsFile) ? fs.readFileSync(agentsFile, 'utf8') : '';
  const next = upsertBlock(existing);

  console.log(`Codex global target: ${displayPath(agentsFile)}`);
  console.log('Codex global install modifies ~/.codex/AGENTS.md only with --apply.');
  console.log('Existing user rules are preserved; only the marked VNEM block is inserted or replaced.');
  console.log('A backup AGENTS.md.backup-<timestamp> is created before changing an existing Codex rules file.');
  console.log('');
  console.log('VNEM block markers:');
  console.log(START);
  console.log(END);

  if (dryRun) {
    console.log('');
    console.log('Dry-run only. No home directory files were changed.');
    console.log('');
    console.log(next);
    return;
  }

  fs.mkdirSync(codexDir, { recursive: true });

  if (existing === next) {
    console.log(`VNEM Codex block already current in ${displayPath(agentsFile)}; no write needed.`);
    return;
  }

  if (existing) {
    const backupFile = path.join(codexDir, `AGENTS.md.backup-${timestamp()}`);
    fs.writeFileSync(backupFile, existing, 'utf8');
    console.log(`Backup created: ${displayPath(backupFile)}`);
  }

  fs.writeFileSync(agentsFile, next, 'utf8');
  console.log(`Installed VNEM Codex block in ${displayPath(agentsFile)}`);
}

if (!wantsCodex && !wantsHermes) {
  console.error('No target selected. Use --dry-run, --codex, --print-hermes, or --all --dry-run.');
  process.exit(1);
}

if (wantsCodex) installCodex();
if (wantsCodex && wantsHermes) console.log('\n---\n');
if (wantsHermes) printHermes();
