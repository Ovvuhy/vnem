#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { clientCatalog, supportedClientIds } from "./vnem/clients/catalog.mjs";
import { buildVnemServerConfigs, mergeCodexToml, validateToml } from "./vnem/clients/config-merge.mjs";
import { applyClientSetup, detectSupportedClients, planClientSetup, publicSetupPlan, rollbackClientSetup } from "./vnem/clients/setup.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = path.join(root, "scripts", "vnem-cli.mjs");
const tempParent = path.join(root, ".tmp");
await mkdir(tempParent, { recursive: true });
const temp = await mkdtemp(path.join(tempParent, "client-setup-"));
const home = path.join(temp, "home");
const workspace = path.join(temp, "workspace");
const stateDir = path.join(temp, "state");
const codexConfig = path.join(home, ".codex", "config.toml");
const cursorConfig = path.join(home, ".cursor", "mcp.json");
const originalCodex = `model = "fixture-model"

[features]
web_search = true

[mcp_servers.node_repl]
command = "node"
args = ["fixture-repl.mjs"]

[mcp_servers.vnem]
command = "old-node"
args = ["old-core.mjs"]
custom_server_setting = "preserve-me"

[mcp_servers.vnem.env]
EXISTING_CORE_SETTING = "preserve-me"

[mcp_servers."vnem-tools"]
command = "old-node"
args = ["old-tools.mjs"]

[mcp_servers."vnem-tools".env]
VNEM_TOOLS_GITHUB_ALLOWED_REPOS = "fixture/repo"
`;
const originalCursor = `${JSON.stringify({ theme: "fixture", mcpServers: { existing: { command: "existing-tool" } } }, null, 2)}\n`;

try {
  await mkdir(path.dirname(codexConfig), { recursive: true });
  await mkdir(path.dirname(cursorConfig), { recursive: true });
  await mkdir(workspace, { recursive: true });
  await writeFile(codexConfig, originalCodex, "utf8");
  await writeFile(cursorConfig, originalCursor, "utf8");

  const ids = supportedClientIds();
  assert.deepEqual(ids, ["codex_app", "codex_cli", "claude_code", "claude_desktop", "antigravity", "generic_stdio", "hermes", "cursor", "windsurf", "cline", "gemini_cli"]);
  for (const platform of ["win32", "linux", "darwin"]) {
    const catalog = clientCatalog({ platform, home, workspace });
    assert.equal(catalog.length, 11);
    assert.ok(catalog.every((client) => client.platforms.includes(platform)));
    assert.ok(catalog.find((client) => client.id === "codex_cli").configPath.endsWith(path.join(".codex", "config.toml")));
    assert.ok(catalog.find((client) => client.id === "gemini_cli").configPath.endsWith(path.join(".gemini", "settings.json")));
  }

  const detected = await detectSupportedClients({ home, workspace, pathValue: "" });
  assert.equal(detected.clients.length, 11);
  assert.equal(detected.clients.find((client) => client.id === "codex_app").config_detected, true);
  assert.equal(detected.clients.find((client) => client.id === "cursor").config_detected, true);
  assert.equal(detected.clients.find((client) => client.id === "generic_stdio").installed, true);

  const options = {
    root,
    home,
    workspace,
    stateDir,
    clients: ["codex_app", "codex_cli", "cursor", "generic_stdio"],
    components: ["core", "tools"],
    safetyProfile: "safe-local-dev",
    configOverrides: {
      codex_app: codexConfig,
      codex_cli: codexConfig,
      cursor: cursorConfig
    }
  };
  const plan = await planClientSetup(options);
  assert.equal(plan.files.length, 3, "Codex App and CLI must share one deduplicated config transaction");
  assert.equal(plan.change_count, 3);
  assert.equal(JSON.stringify(publicSetupPlan(plan)).includes("_nextText"), false, "public previews must not include config contents");
  assert.equal(plan.files.find((file) => file.path === codexConfig).clients.length, 2);
  assert.equal(validateToml(plan.files.find((file) => file.path === codexConfig)._nextText).validator, "@iarna/toml");
  assert.throws(
    () => mergeCodexToml("# vnem-managed:start\n[mcp_servers.vnem]\ncommand = \"node\"\n", buildVnemServerConfigs({ root, workspace })),
    /malformed VNEM managed markers/
  );

  const applied = await applyClientSetup({ ...options, plan, yes: true, verifyMcp: false });
  assert.equal(applied.applied, true);
  assert.equal(applied.ok, true);
  assert.equal(applied.proof.safety.active_profile, "safe-local-dev");
  assert.equal(existsSync(applied.manifest_path), true);
  assert.equal(existsSync(applied.proof_report_path), true);

  const nextCodex = await readFile(codexConfig, "utf8");
  assert.match(nextCodex, /model = "fixture-model"/);
  assert.match(nextCodex, /\[mcp_servers\.node_repl\]/);
  assert.equal(nextCodex.match(/\[mcp_servers\.vnem\]/g)?.length, 1);
  assert.equal(nextCodex.match(/\[mcp_servers\."vnem-tools"\]/g)?.length, 1);
  assert.match(nextCodex, /# vnem-managed:start/);
  assert.match(nextCodex, /custom_server_setting = "preserve-me"/);
  assert.match(nextCodex, /EXISTING_CORE_SETTING = "preserve-me"/);
  assert.match(nextCodex, /VNEM_TOOLS_GITHUB_ALLOWED_REPOS = "fixture\/repo"/);
  assert.doesNotMatch(nextCodex, /old-core|old-tools/);

  const nextCursor = JSON.parse(await readFile(cursorConfig, "utf8"));
  assert.equal(nextCursor.theme, "fixture");
  assert.equal(nextCursor.mcpServers.existing.command, "existing-tool");
  assert.equal(nextCursor.mcpServers.vnem.command, process.execPath.replace(/\\/g, "/"));
  assert.ok(nextCursor.mcpServers["vnem-tools"]);
  const genericPath = path.join(workspace, ".vnem", "client-profiles", "generic", "mcp.json");
  assert.equal(existsSync(genericPath), true);
  assert.equal(existsSync(path.join(workspace, ".vnem", "safety.json")), true);

  const rollbackPreview = await rollbackClientSetup({ stateDir });
  assert.equal(rollbackPreview.applied, false);
  assert.ok(rollbackPreview.files.length >= 4);
  const rolledBack = await rollbackClientSetup({ stateDir, yes: true });
  assert.equal(rolledBack.ok, true);
  assert.equal(await readFile(codexConfig, "utf8"), originalCodex);
  assert.equal(await readFile(cursorConfig, "utf8"), originalCursor);
  assert.equal(existsSync(genericPath), false);
  assert.equal(existsSync(path.join(workspace, ".vnem", "safety.json")), false);
  await assert.rejects(() => rollbackClientSetup({ stateDir, yes: true }), /No VNEM setup transaction exists/);

  const cliHome = path.join(temp, "cli-home");
  const cliWorkspace = path.join(temp, "cli-workspace");
  const cliState = path.join(temp, "cli-state");
  await mkdir(cliWorkspace, { recursive: true });
  const cliBase = ["--clients", "generic_stdio", "--workspace", cliWorkspace, "--home", cliHome, "--state-dir", cliState, "--json"];
  const cliPreview = runCli(["config", "preview", ...cliBase]);
  assert.equal(JSON.parse(cliPreview.stdout).applied, false);
  const cliApply = runCli(["setup", ...cliBase, "--yes", "--no-verify-mcp"]);
  assert.equal(JSON.parse(cliApply.stdout).applied, true);
  const cliRollback = runCli(["rollback", "--state-dir", cliState, "--yes", "--json"]);
  assert.equal(JSON.parse(cliRollback.stdout).ok, true);
  assert.equal(existsSync(path.join(cliWorkspace, ".vnem", "client-profiles", "generic", "mcp.json")), false);

  console.log("VNEM client setup tests passed: 11 profiles, merge, proof, backup, and rollback");
} finally {
  await rm(temp, { recursive: true, force: true });
}

function runCli(args) {
  const result = spawnSync(process.execPath, [cliPath, ...args], { cwd: root, encoding: "utf8", windowsHide: true });
  assert.equal(result.status, 0, `vnem ${args.join(" ")} failed: ${result.stderr}`);
  return result;
}
