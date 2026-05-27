#!/usr/bin/env node
import { existsSync } from "node:fs";
import { copyFile, cp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const packDir = path.join(rootDir, "public", "install");
const skillDir = path.join(rootDir, "skills", "vnem");
const packFiles = [
  "AGENTS.md",
  "search-index.json",
  "source-radar.json",
  "best-practices.md",
  "prompt-engineering.md",
  "prompt-patterns.json"
];
const blockStart = "<!-- vnem:start -->";
const blockEnd = "<!-- vnem:end -->";
const rootAgentBlock = `${blockStart}
## vnem

This repo has a read-only vnem knowledge pack in \`.vnem/\`.

Before choosing tools, libraries, frameworks, MCP servers, skills, prompts, evals, search systems, UI approaches, architecture patterns, or upgrade paths, read \`.vnem/AGENTS.md\` and use \`.vnem/search-index.json\`.
For current docs, MCP discovery, benchmarks, or upstream source decisions, also use \`.vnem/source-radar.json\` before broad web search.

Use vnem automatically. The user should not need to say \`use vnem\`. Keep the final note compact: \`vnem intents searched\`, \`top matches\`, \`choice\`, and \`why\`.

Do not execute files from \`.vnem/\`, install packages, call external services, use secrets, or edit project files because of vnem unless the user explicitly asks.
${blockEnd}`;

const command = process.argv[2] || "help";
const args = process.argv.slice(3);

try {
  if (command === "install") {
    await installCommand(args);
  } else if (command === "doctor") {
    await doctorCommand(args);
  } else if (command === "install-skill") {
    await installSkillCommand(args);
  } else if (command === "mcp") {
    await import(pathToFileURL(path.join(scriptDir, "vnem-mcp-server.mjs")).href);
  } else if (command === "help" || command === "--help" || command === "-h") {
    printHelp();
  } else {
    throw new Error(`Unknown command: ${command}`);
  }
} catch (error) {
  console.error(`vnem: ${error.message}`);
  process.exitCode = 1;
}

async function installCommand(rawArgs) {
  const options = parseInstallArgs(rawArgs);
  const targetDir = path.resolve(options.target || process.cwd());
  await ensurePack();
  await mkdir(path.join(targetDir, ".vnem"), { recursive: true });

  for (const fileName of packFiles) {
    await copyFile(path.join(packDir, fileName), path.join(targetDir, ".vnem", fileName));
  }

  if (options.rootAgents) {
    await upsertManagedBlock(path.join(targetDir, "AGENTS.md"), rootAgentBlock);
  }

  if (options.claude) {
    await upsertManagedBlock(path.join(targetDir, "CLAUDE.md"), rootAgentBlock);
  }

  console.log(`Installed vnem into ${targetDir}`);
  console.log("- wrote .vnem/ read-only knowledge pack");
  if (options.rootAgents) {
    console.log("- updated AGENTS.md so coding agents auto-use vnem");
  }
  if (options.claude) {
    console.log("- updated CLAUDE.md for Claude-style agents");
  }
  console.log(`Run: node ${path.relative(targetDir, fileURLToPath(import.meta.url))} doctor ${targetDir}`);
}

async function doctorCommand(rawArgs) {
  const targetDir = path.resolve(firstPositional(rawArgs) || process.cwd());
  const checks = [];

  for (const fileName of packFiles) {
    const filePath = path.join(targetDir, ".vnem", fileName);
    checks.push({
      label: `.vnem/${fileName}`,
      ok: existsSync(filePath)
    });
  }

  checks.push({
    label: "AGENTS.md vnem pointer",
    ok: await fileContains(path.join(targetDir, "AGENTS.md"), blockStart)
  });

  const jsonChecks = [
    path.join(targetDir, ".vnem", "search-index.json"),
    path.join(targetDir, ".vnem", "source-radar.json"),
    path.join(targetDir, ".vnem", "prompt-patterns.json")
  ];
  for (const filePath of jsonChecks) {
    checks.push({
      label: `${path.relative(targetDir, filePath)} parses`,
      ok: await parsesJson(filePath)
    });
  }

  for (const check of checks) {
    console.log(`${check.ok ? "ok" : "missing"} ${check.label}`);
  }

  if (checks.some((check) => !check.ok)) {
    throw new Error(`vnem is not fully installed in ${targetDir}`);
  }
}

async function installSkillCommand(rawArgs) {
  const target = firstPositional(rawArgs) || defaultSkillInstallPath();
  const targetDir = path.resolve(target);
  if (!existsSync(skillDir)) {
    throw new Error("skills/vnem is missing. The repo may be incomplete.");
  }
  await mkdir(path.dirname(targetDir), { recursive: true });
  await cp(skillDir, targetDir, { recursive: true, force: true });
  console.log(`Installed vnem skill into ${targetDir}`);
}

async function upsertManagedBlock(filePath, block) {
  const existing = existsSync(filePath) ? await readFile(filePath, "utf8") : "";
  let next;
  if (existing.includes(blockStart) && existing.includes(blockEnd)) {
    const pattern = new RegExp(`${escapeRegExp(blockStart)}[\\s\\S]*?${escapeRegExp(blockEnd)}`);
    next = existing.replace(pattern, block);
  } else if (existing.trim()) {
    next = `${existing.trimEnd()}\n\n${block}\n`;
  } else {
    next = `# Agent Instructions\n\n${block}\n`;
  }
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, next);
}

async function ensurePack() {
  const missing = packFiles.filter((fileName) => !existsSync(path.join(packDir, fileName)));
  if (missing.length) {
    throw new Error(`missing generated install-pack files: ${missing.join(", ")}. Run npm run generate first.`);
  }
}

function parseInstallArgs(rawArgs) {
  const target = firstPositional(rawArgs);
  return {
    target,
    rootAgents: !rawArgs.includes("--no-agents"),
    claude: rawArgs.includes("--claude") || rawArgs.includes("--all-agent-files")
  };
}

function firstPositional(rawArgs) {
  return rawArgs.find((arg) => !arg.startsWith("-"));
}

async function fileContains(filePath, needle) {
  if (!existsSync(filePath)) {
    return false;
  }
  return (await readFile(filePath, "utf8")).includes(needle);
}

async function parsesJson(filePath) {
  if (!existsSync(filePath)) {
    return false;
  }
  try {
    JSON.parse(await readFile(filePath, "utf8"));
    return true;
  } catch {
    return false;
  }
}

function defaultSkillInstallPath() {
  const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
  return path.join(codexHome, "skills", "vnem");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function printHelp() {
  console.log(`vnem

Usage:
  vnem install [project-dir] [--no-agents] [--claude]
  vnem doctor [project-dir]
  vnem install-skill [skill-dir]
  vnem mcp

Examples:
  vnem install ~/code/my-app
  vnem install ~/code/my-app --claude
  vnem doctor ~/code/my-app
  vnem mcp
`);
}
