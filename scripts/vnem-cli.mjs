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
  "install-guide.md",
  "operating-protocol.md",
  "quality-contract.md",
  "orchestration-protocol.md",
  "precision-execution-protocol.md",
  "omniscient-self-healing-protocol.md",
  "coding-protocol.md",
  "coding-playbooks.json",
  "design-architecture.md",
  "visual-qa-protocol.md",
  "task-rubrics.json",
  "search-index.json",
  "source-radar.json",
  "best-practices.md",
  "agent-workspace.md",
  "prompt-engineering.md",
  "prompt-patterns.json"
];
const blockStart = "<!-- vnem:start -->";
const blockEnd = "<!-- vnem:end -->";
const rootAgentBlock = `${blockStart}
## vnem

This repo has a read-only vnem knowledge pack in \`.vnem/\`.

Before choosing tools, libraries, frameworks, MCP servers, skills, prompts, evals, search systems, UI approaches, performance strategies, architecture patterns, orchestration patterns, or upgrade paths, read \`.vnem/AGENTS.md\`, follow \`.vnem/operating-protocol.md\`, apply \`.vnem/quality-contract.md\`, read \`.vnem/orchestration-protocol.md\` for complex coding/research workflows, read \`.vnem/precision-execution-protocol.md\` before using mutation-capable precision tools, read \`.vnem/omniscient-self-healing-protocol.md\` before semantic search/healing-loop/ephemeral-script workflows, read \`.vnem/coding-protocol.md\` and \`.vnem/coding-playbooks.json\` for coding/app/web/feature/debug work, use \`.vnem/search-index.json\`, and consult \`.vnem/agent-workspace.md\` only for autonomous developer environment decisions.
For current docs, MCP discovery, benchmark evidence, or upstream source decisions, also use \`.vnem/source-radar.json\` before broad web search.

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
  } else if (command === "mcp-config") {
    await mcpConfigCommand(args);
  } else if (command === "precision-mcp") {
    await import(pathToFileURL(path.join(scriptDir, "vnem-precision-mcp-server.mjs")).href);
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
  const sourceRepoMode = await isVnemSourceRepo(targetDir);

  for (const fileName of packFiles) {
    const filePath = path.join(targetDir, ".vnem", fileName);
    checks.push({
      label: `.vnem/${fileName}`,
      ok: existsSync(filePath)
    });
  }

  checks.push({
    label: sourceRepoMode ? "AGENTS.md VNEM source repo rules" : "AGENTS.md vnem pointer",
    ok: sourceRepoMode || await fileContains(path.join(targetDir, "AGENTS.md"), blockStart)
  });

  const jsonChecks = packFiles
    .filter((fileName) => fileName.endsWith(".json"))
    .map((fileName) => path.join(targetDir, ".vnem", fileName));
  for (const filePath of jsonChecks) {
    checks.push({
      label: `${path.relative(targetDir, filePath)} parses`,
      ok: await parsesJson(filePath)
    });
  }

  for (const check of checks) {
    console.log(`${check.ok ? "ok" : "missing"} ${check.label}`);
  }
  if (sourceRepoMode) {
    console.log("ok VNEM source repo detected; managed install pointer not required");
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

async function mcpConfigCommand(rawArgs) {
  const precision = rawArgs.includes("--precision");
  const workspace = valueAfter(rawArgs, "--workspace") || process.cwd();
  const server = {
    command: "node",
    args: [path.join(scriptDir, precision ? "vnem-precision-mcp-server.mjs" : "vnem-mcp-server.mjs")],
    env: precision
      ? {
          VNEM_PRECISION_ROOT: path.resolve(workspace)
        }
      : {
          VNEM_ROOT: rootDir
        }
  };
  const output = rawArgs.includes("--server-json") || rawArgs.includes("--server")
    ? server
    : {
        mcpServers: {
          [precision ? "vnem-precision" : "vnem"]: server
        }
      };

  console.log(JSON.stringify(output, null, 2));
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

function valueAfter(rawArgs, flag) {
  const index = rawArgs.indexOf(flag);
  return index >= 0 ? rawArgs[index + 1] : null;
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

async function isVnemSourceRepo(targetDir) {
  if (path.resolve(targetDir) !== rootDir) {
    return false;
  }
  if (!existsSync(path.join(targetDir, "package.json")) || !existsSync(path.join(targetDir, "scripts", "vnem-cli.mjs"))) {
    return false;
  }
  const agentsPath = path.join(targetDir, "AGENTS.md");
  if (!existsSync(agentsPath)) {
    return false;
  }
  const agents = await readFile(agentsPath, "utf8");
  return agents.includes("VNEM Agent Operating Rules") && agents.includes("Product Mission vs Repo Context");
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
  vnem mcp-config [--server-json] [--precision --workspace /path/to/project]
  vnem mcp
  vnem precision-mcp

Examples:
  vnem install ~/code/my-app
  vnem install ~/code/my-app --claude
  vnem doctor ~/code/my-app
  vnem mcp-config
  vnem mcp-config --server-json
  vnem mcp-config --precision --workspace ~/code/my-app
  vnem mcp
  vnem precision-mcp
`);
}
