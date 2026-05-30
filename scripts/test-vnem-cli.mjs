#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const cliPath = path.join(scriptDir, "vnem-cli.mjs");

const tmpParent = path.join(rootDir, ".tmp");
await mkdir(tmpParent, { recursive: true });
const tmpRoot = await mkdtemp(path.join(tmpParent, "vnem-cli-test-"));

try {
  const projectDir = path.join(tmpRoot, "clean-project");

  runCli(["install", projectDir]);

  for (const fileName of [
    "AGENTS.md",
    "install-guide.md",
    "operating-protocol.md",
    "quality-contract.md",
    "orchestration-protocol.md",
    "coding-protocol.md",
    "coding-playbooks.json",
    "task-rubrics.json",
    "search-index.json",
    "source-radar.json",
    "best-practices.md",
    "agent-workspace.md",
    "prompt-engineering.md",
    "prompt-patterns.json"
  ]) {
    assert.equal(existsSync(path.join(projectDir, ".vnem", fileName)), true, `expected .vnem/${fileName}`);
  }

  const agentsPath = path.join(projectDir, "AGENTS.md");
  let agents = await readFile(agentsPath, "utf8");
  assert.ok(agents.includes("<!-- vnem:start -->"));
  assert.ok(agents.includes("quality-contract.md"));
  assert.ok(agents.includes("orchestration-protocol.md"));
  assert.ok(agents.includes("The user should not need to say `use vnem`"));

  JSON.parse(await readFile(path.join(projectDir, ".vnem", "search-index.json"), "utf8"));
  JSON.parse(await readFile(path.join(projectDir, ".vnem", "source-radar.json"), "utf8"));
  JSON.parse(await readFile(path.join(projectDir, ".vnem", "prompt-patterns.json"), "utf8"));

  runCli(["install", projectDir]);
  agents = await readFile(agentsPath, "utf8");
  assert.equal(agents.match(/<!-- vnem:start -->/g)?.length, 1, "install should be idempotent");

  runCli(["doctor", projectDir]);

  const noAgentsDir = path.join(tmpRoot, "no-agents-project");
  runCli(["install", noAgentsDir, "--no-agents"]);
  assert.equal(existsSync(path.join(noAgentsDir, ".vnem", "AGENTS.md")), true);
  assert.equal(existsSync(path.join(noAgentsDir, ".vnem", "install-guide.md")), true);
  assert.equal(existsSync(path.join(noAgentsDir, "AGENTS.md")), false);

  const claudeDir = path.join(tmpRoot, "claude-project");
  runCli(["install", claudeDir, "--claude"]);
  assert.equal(existsSync(path.join(claudeDir, "AGENTS.md")), true);
  assert.equal(existsSync(path.join(claudeDir, "CLAUDE.md")), true);

  const skillTarget = path.join(tmpRoot, "skills", "vnem");
  runCli(["install-skill", skillTarget]);
  assert.equal(existsSync(path.join(skillTarget, "SKILL.md")), true);

  const mcpConfig = runCli(["mcp-config"]);
  const parsedMcpConfig = JSON.parse(mcpConfig.stdout);
  assert.equal(parsedMcpConfig.mcpServers?.vnem?.command, "node");
  assert.ok(parsedMcpConfig.mcpServers?.vnem?.args?.[0]?.endsWith("vnem-mcp-server.mjs"));
  assert.equal(parsedMcpConfig.mcpServers?.vnem?.env?.VNEM_ROOT, rootDir);

  const serverConfig = runCli(["mcp-config", "--server-json"]);
  const parsedServerConfig = JSON.parse(serverConfig.stdout);
  assert.equal(parsedServerConfig.command, "node");
  assert.ok(parsedServerConfig.args?.[0]?.endsWith("vnem-mcp-server.mjs"));
  assert.equal(parsedServerConfig.env?.VNEM_ROOT, rootDir);

  console.log("vnem CLI tests passed");
} finally {
  await rm(tmpRoot, { recursive: true, force: true });
}

function runCli(args) {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd: rootDir,
    encoding: "utf8"
  });
  if (result.status !== 0) {
    console.error(result.stdout);
    console.error(result.stderr);
  }
  assert.equal(result.status, 0, `vnem ${args.join(" ")} should succeed`);
  return result;
}
