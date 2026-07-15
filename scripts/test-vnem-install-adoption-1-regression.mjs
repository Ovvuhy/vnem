#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  buildInstallAdoptionFiles,
  buildInstallAdoptionGuide,
  emitInstallAdoptionProfile,
  formatInstallAdoptionGuide,
  installAdoptionDoctor
} from "./vnem-install-adoption.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const profileSnapshots = Object.keys(buildInstallAdoptionFiles(rootDir, { portable: true })).map((relativePath) => ({
  path: path.join(rootDir, relativePath),
  content: readFileSync(path.join(rootDir, relativePath))
}));
process.on("exit", () => {
  for (const snapshot of profileSnapshots) writeFileSync(snapshot.path, snapshot.content);
});
const selectedCase = (process.argv.find((arg) => arg.startsWith("--case=")) || "").slice("--case=".length);
const cases = [
  "emit-generic-profile",
  "emit-codex-profile",
  "emit-claude-profile",
  "emit-antigravity-profile",
  "emit-hermes-profile",
  "install-doctor",
  "mcp-core-install-guide",
  "mcp-tools-profile-emit",
  "mcp-tools-install-doctor",
  "no-secret-leak",
  "no-hidden-control-chars",
  "config-parseability",
  "both-mcps-present",
  "portable-public-templates"
];
const casesToRun = selectedCase ? [selectedCase] : cases;
assert.ok(casesToRun.every((name) => cases.includes(name)), `unknown case ${selectedCase}`);

if (casesToRun.includes("emit-generic-profile")) {
  const result = await emitInstallAdoptionProfile({ client: "generic", root: rootDir });
  assert.equal(result.outside_repo_writes, false);
  assert.ok(result.written_files.every((file) => file.startsWith(".vnem")));
  const profile = readJson(".vnem/install-adoption/generic/mcp.json");
  assertBothServers(profile);
  assert.equal(profile.mcpServers.vnem.transport, "stdio");
  assert.equal(profile.mcpServers["vnem-tools"].transport, "stdio");
}

if (casesToRun.includes("emit-codex-profile")) {
  const result = await emitInstallAdoptionProfile({ client: "codex", root: rootDir });
  assert.equal(result.client, "codex");
  const snippet = readText(".vnem/install-adoption/codex/config-snippet.toml");
  const readme = readText(".vnem/install-adoption/codex/README.md");
  assert.match(snippet, /\[mcp_servers\.vnem\]/);
  assert.match(snippet, /\[mcp_servers\.vnem-tools\]/);
  assert.match(snippet + readme, /Merge/i);
  assert.match(readme, /Do not replace the whole Codex config/i);
  assert.match(readme, /codex mcp --help/);
  assert.match(readme, /Rollback/);
}

if (casesToRun.includes("emit-claude-profile")) {
  await emitInstallAdoptionProfile({ client: "claude", root: rootDir });
  const profile = readJson(".vnem/install-adoption/claude/mcp.json");
  assertBothServers(profile);
  const readme = readText(".vnem/install-adoption/claude/README.md");
  assert.match(readme, /mcpServers/);
  assert.match(readme, /does not claim a universal Claude/i);
}

if (casesToRun.includes("emit-antigravity-profile")) {
  await emitInstallAdoptionProfile({ client: "antigravity", root: rootDir });
  const profile = readJson(".vnem/install-adoption/antigravity/mcp.json");
  assertBothServers(profile);
  const readme = readText(".vnem/install-adoption/antigravity/README.md");
  assert.match(readme, /generic\/importable MCP stdio JSON/i);
  assert.match(readme, /does not claim an Antigravity universal config path/i);
}

if (casesToRun.includes("emit-hermes-profile")) {
  await emitInstallAdoptionProfile({ client: "hermes", root: rootDir });
  const profile = readJson(".vnem/install-adoption/hermes/mcp.json");
  assertBothServers(profile);
  const readme = readText(".vnem/install-adoption/hermes/README.md");
  assert.match(readme, /isolated\/importable MCP stdio profile/i);
  assert.match(readme, /No global Hermes config is changed/i);
}

if (casesToRun.includes("install-doctor")) {
  const report = await installAdoptionDoctor({ root: rootDir, emit: true, writeReport: true });
  assert.equal(report.status, "pass");
  assert.ok(report.checks.some((check) => check.id === "core_entrypoint_tools_registered" && check.ok));
  assert.ok(report.checks.some((check) => check.id === "tools_entrypoint_tools_registered" && check.ok));
  assert.ok(report.checks.some((check) => check.id === "outside_repo_writes_default_blocked" && check.ok));
  assert.ok(report.checks.some((check) => check.id === "managed_agent_instruction_present" && check.ok));
  const instruction = readText(".vnem/install-adoption/prompts/vnem-agent-use-instruction.md");
  assert.match(instruction, /VNEM is the default improvement layer/);
  assert.match(instruction, /skip unnecessary VNEM overhead for trivial tasks/i);
  assert.match(instruction, /preserve freedom to use the best workflow/i);
  assert.ok(report.what_is_not_proven.some((item) => /actually imported/i.test(item)));
  assert.equal(readJson(".vnem/install-adoption/verify/install-doctor-report.json").status, "pass");
}

if (casesToRun.includes("mcp-core-install-guide")) {
  const core = createClient("vnem-install-adoption-core", path.join(scriptDir, "vnem-mcp-server.mjs"), { VNEM_ROOT: rootDir });
  try {
    await core.client.connect(core.transport);
    const tools = await core.client.listTools();
    assert.ok(tools.tools.some((tool) => tool.name === "vnem_install_adoption_guide"));
    const guide = await call(core.client, "vnem_install_adoption_guide", { client: "codex", root: rootDir }, "install_adoption_guide");
    assert.equal(guide.client, "codex");
    assert.ok(guide.required_servers.some((server) => server.name === "vnem"));
    assert.ok(guide.required_servers.some((server) => server.name === "vnem-tools"));
    assert.match(formatInstallAdoptionGuide(buildInstallAdoptionGuide({ client: "generic", root: rootDir })), /vnem-tools/);
  } finally {
    await core.client.close();
  }
}

if (casesToRun.includes("mcp-tools-profile-emit")) {
  const tools = createClient("vnem-install-adoption-tools-emit", path.join(scriptDir, "vnem-tools-mcp-server.mjs"), toolsEnv());
  try {
    await tools.client.connect(tools.transport);
    const listed = await tools.client.listTools();
    assert.ok(listed.tools.some((tool) => tool.name === "vnem_tools_install_profile_emit"));
    const result = await call(tools.client, "vnem_tools_install_profile_emit", { client: "generic", root: rootDir }, "install_profile_emit");
    assert.equal(result.outside_repo_writes, false);
    assert.ok(result.written_files.includes(".vnem/install-adoption/generic/mcp.json") || result.written_files.includes(".vnem\\install-adoption\\generic\\mcp.json"));
  } finally {
    await tools.client.close();
  }
}

if (casesToRun.includes("mcp-tools-install-doctor")) {
  const tools = createClient("vnem-install-adoption-tools-doctor", path.join(scriptDir, "vnem-tools-mcp-server.mjs"), toolsEnv());
  try {
    await tools.client.connect(tools.transport);
    const listed = await tools.client.listTools();
    assert.ok(listed.tools.some((tool) => tool.name === "vnem_tools_install_doctor"));
    const report = await call(tools.client, "vnem_tools_install_doctor", { root: rootDir, emit: true }, "install_doctor");
    assert.equal(report.status, "pass");
    assert.ok(report.checks.some((check) => check.id === "no_secret_values_in_profiles" && check.ok));
  } finally {
    await tools.client.close();
  }
}

if (casesToRun.includes("no-secret-leak")) {
  await installAdoptionDoctor({ root: rootDir, emit: true, writeReport: true });
  const text = allProfileText();
  assert.doesNotMatch(text, /(sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{12,}|AKIA[0-9A-Z]{16})/i);
  assert.doesNotMatch(text, /Authorization:\s*Bearer\s+\S+/i);
}

if (casesToRun.includes("no-hidden-control-chars")) {
  await installAdoptionDoctor({ root: rootDir, emit: true, writeReport: true });
  const text = allProfileText();
  assert.doesNotMatch(text, /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\u200E\u200F\u202A-\u202E\u2066-\u2069]/);
}

if (casesToRun.includes("config-parseability")) {
  await installAdoptionDoctor({ root: rootDir, emit: true, writeReport: true });
  for (const client of ["generic", "claude", "antigravity", "hermes"]) {
    assertBothServers(readJson(`.vnem/install-adoption/${client}/mcp.json`));
  }
  const snippet = readText(".vnem/install-adoption/codex/config-snippet.toml");
  assert.match(snippet, /command = ".+"/);
  assert.match(snippet, /args = \[".+"]/s);
}

if (casesToRun.includes("both-mcps-present")) {
  await installAdoptionDoctor({ root: rootDir, emit: true, writeReport: true });
  for (const client of ["generic", "claude", "antigravity", "hermes"]) {
    assertBothServers(readJson(`.vnem/install-adoption/${client}/mcp.json`));
  }
  const codex = readText(".vnem/install-adoption/codex/config-snippet.toml");
  assert.match(codex, /\[mcp_servers\.vnem\]/);
  assert.match(codex, /\[mcp_servers\.vnem-tools\]/);
}

if (casesToRun.includes("portable-public-templates")) {
  const portableFiles = buildInstallAdoptionFiles(rootDir, { portable: true });
  const portableText = Object.values(portableFiles).join("\n");
  assert.match(portableText, /\$\{VNEM_CHECKOUT\}/);
  assert.doesNotMatch(portableText, /[A-Za-z]:\\Users\\/i);
  assert.doesNotMatch(portableText, /C:\\VNEM/i);
  assert.doesNotMatch(portableText, new RegExp(escapeRegExp(rootDir), "i"));
  assert.doesNotMatch(portableText, new RegExp(escapeRegExp(process.execPath), "i"));
  for (const client of ["generic", "claude", "antigravity", "hermes"]) {
    const profile = JSON.parse(portableFiles[path.join(".vnem", "install-adoption", client, "mcp.json")]);
    assertBothPortableServers(profile);
  }
}

console.log(`vnem install adoption regression passed: ${casesToRun.join(", ")}`);

function toolsEnv() {
  return {
    VNEM_TOOLS_ALLOWED_ROOTS: rootDir,
    VNEM_TOOLS_EVIDENCE_ROOT: path.join(rootDir, ".tmp", "install-adoption-tools"),
    VNEM_TOOLS_SKIP_WRANGLER_CHECK: "1"
  };
}

function createClient(name, serverPath, env = {}) {
  const client = new Client({ name, version: "1.0.0" }, { capabilities: {} });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
    cwd: rootDir,
    env: { ...process.env, ...env },
    stderr: "pipe"
  });
  return { client, transport };
}

async function call(client, name, args, structuredKey) {
  const response = await client.callTool({ name, arguments: args });
  assert.equal(response.isError, undefined, `${name} returned an MCP error`);
  assert.ok(response.structuredContent?.[structuredKey], `${name} missing ${structuredKey}`);
  return response.structuredContent[structuredKey];
}

function assertBothServers(profile) {
  assert.ok(profile.mcpServers?.vnem, "profile missing vnem Core MCP");
  assert.ok(profile.mcpServers?.["vnem-tools"], "profile missing vnem-tools MCP");
  assert.ok(profile.mcpServers.vnem.args?.[0]?.endsWith("vnem-mcp-server.mjs"));
  assert.ok(profile.mcpServers["vnem-tools"].args?.[0]?.endsWith("vnem-tools-mcp-server.mjs"));
  assert.equal(profile.mcpServers.vnem.cwd, rootDir);
  assert.equal(profile.mcpServers["vnem-tools"].cwd, rootDir);
}

function assertBothPortableServers(profile) {
  assert.ok(profile.mcpServers?.vnem);
  assert.ok(profile.mcpServers?.["vnem-tools"]);
  assert.equal(profile.mcpServers.vnem.command, "node");
  assert.equal(profile.mcpServers.vnem.cwd, "${VNEM_CHECKOUT}");
  assert.equal(profile.mcpServers["vnem-tools"].cwd, "${VNEM_CHECKOUT}");
  assert.match(profile.mcpServers.vnem.args[0], /^\$\{VNEM_CHECKOUT\}\//);
  assert.match(profile.mcpServers["vnem-tools"].args[0], /^\$\{VNEM_CHECKOUT\}\//);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function readText(relativePath) {
  return readFileSync(path.join(rootDir, relativePath), "utf8");
}

function allProfileText() {
  const files = [
    ".vnem/install-adoption/codex/config-snippet.toml",
    ".vnem/install-adoption/codex/README.md",
    ".vnem/install-adoption/claude/mcp.json",
    ".vnem/install-adoption/claude/README.md",
    ".vnem/install-adoption/antigravity/mcp.json",
    ".vnem/install-adoption/antigravity/README.md",
    ".vnem/install-adoption/hermes/mcp.json",
    ".vnem/install-adoption/hermes/README.md",
    ".vnem/install-adoption/generic/mcp.json",
    ".vnem/install-adoption/generic/README.md",
    ".vnem/install-adoption/prompts/vnem-agent-use-instruction.md",
    ".vnem/install-adoption/verify/install-doctor-report.json"
  ];
  return files.filter((file) => existsSync(path.join(rootDir, file))).map(readText).join("\n");
}
