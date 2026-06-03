#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
await mkdir(path.join(rootDir, ".tmp"), { recursive: true });
const tmpRoot = await mkdtemp(path.join(rootDir, ".tmp", "connector-apply-"));
const originalEnv = snapshotEnv();

try {
  const appData = path.join(tmpRoot, "AppData", "Roaming");
  const localAppData = path.join(tmpRoot, "AppData", "Local");
  const home = path.join(tmpRoot, "Home");
  const programFiles = path.join(tmpRoot, "ProgramFiles");
  const programFilesX86 = path.join(tmpRoot, "ProgramFilesX86");
  Object.assign(process.env, {
    APPDATA: appData,
    LOCALAPPDATA: localAppData,
    HOME: home,
    USERPROFILE: home,
    XDG_CONFIG_HOME: path.join(home, ".config"),
    ProgramFiles: programFiles,
    "ProgramFiles(x86)": programFilesX86
  });

  const claudeConfigPath = path.join(appData, "Claude", "claude_desktop_config.json");
  await mkdir(path.dirname(claudeConfigPath), { recursive: true });
  const baseline = [
    "{",
    "  \"mcpServers\": {",
    "    \"existing-tool\": {",
    "      \"command\": \"node\",",
    "      \"args\": [",
    "        \"existing.js\"",
    "      ],",
    "      \"env\": {",
    "        \"EXISTING_TOKEN\": \"keep-this-secret-value\"",
    "      }",
    "    }",
    "  },",
    "  \"preferences\": {",
    "    \"theme\": \"dark\"",
    "  }",
    "}",
    ""
  ].join("\n");
  await writeFile(claudeConfigPath, baseline, "utf8");
  const windsurfExePath = path.join(localAppData, "Programs", "Windsurf", "Windsurf.exe");
  const windsurfConfigPath = path.join(appData, "Windsurf", "User", "mcp.json");
  await mkdir(path.dirname(windsurfExePath), { recursive: true });
  await writeFile(windsurfExePath, "mock windsurf executable", "utf8");

  const moduleUrl = `${pathToFileURL(path.join(rootDir, "scripts", "apply-connector-changes.mjs")).href}?test=${Date.now()}`;
  const { applyConnectorChanges } = await import(moduleUrl);

  const applyResult = await applyConnectorChanges("apply", { repositoryRoot: rootDir });
  const claudeApply = applyResult.results.claude_desktop;
  assert.equal(claudeApply.action, "applied");
  assert.equal(claudeApply.changed, true);
  assert.equal(claudeApply.config_existed_before, true);
  assert.equal(claudeApply.backup_kind, "file-copy");

  const backupPath = `${claudeConfigPath}.vnem.bak`;
  assert.equal(existsSync(backupPath), true, "backup must be created");
  assert.equal(await readFile(backupPath, "utf8"), baseline, "backup must match baseline byte-for-byte");

  const modifiedText = await readFile(claudeConfigPath, "utf8");
  const modifiedJson = JSON.parse(modifiedText);
  assert.equal(modifiedJson.mcpServers["existing-tool"].env.EXISTING_TOKEN, "keep-this-secret-value");
  assert.ok(modifiedJson.mcpServers.vnem, "vnem MCP server must be inserted");
  assert.ok(modifiedJson.mcpServers["vnem-precision"], "vnem precision MCP server must be inserted");
  assert.ok(path.isAbsolute(modifiedJson.mcpServers.vnem.args[0]));
  assert.ok(path.isAbsolute(modifiedJson.mcpServers["vnem-precision"].args[0]));

  const windsurfApply = applyResult.results.windsurf;
  assert.equal(windsurfApply.action, "applied");
  assert.equal(windsurfApply.changed, true);
  assert.equal(windsurfApply.config_existed_before, false);
  assert.equal(windsurfApply.backup_kind, "vnem-config-absent-v1");
  assert.equal(existsSync(windsurfConfigPath), true, "missing config should be created during apply");
  assert.equal(existsSync(`${windsurfConfigPath}.vnem.bak`), true, "absent-file rollback marker should be created");
  const windsurfJson = JSON.parse(await readFile(windsurfConfigPath, "utf8"));
  assert.ok(windsurfJson.mcpServers.vnem);
  assert.ok(windsurfJson.mcpServers["vnem-precision"]);

  const rollbackResult = await applyConnectorChanges("rollback", { repositoryRoot: rootDir });
  const claudeRollback = rollbackResult.results.claude_desktop;
  assert.equal(claudeRollback.action, "rolled-back");
  assert.equal(claudeRollback.changed, true);
  assert.equal(claudeRollback.backup_removed, true);
  assert.equal(await readFile(claudeConfigPath, "utf8"), baseline, "rollback must restore baseline byte-for-byte");
  assert.equal(existsSync(backupPath), false, "backup must be removed after rollback");

  const windsurfRollback = rollbackResult.results.windsurf;
  assert.equal(windsurfRollback.action, "rolled-back-created-file");
  assert.equal(windsurfRollback.changed, true);
  assert.equal(windsurfRollback.backup_removed, true);
  assert.equal(existsSync(windsurfConfigPath), false, "rollback should remove config files created by VNEM");
  assert.equal(existsSync(`${windsurfConfigPath}.vnem.bak`), false, "rollback should remove absent-file marker");

  console.log("apply connector change tests passed");
} finally {
  restoreEnv(originalEnv);
}

function snapshotEnv() {
  const keys = ["APPDATA", "LOCALAPPDATA", "HOME", "USERPROFILE", "XDG_CONFIG_HOME", "ProgramFiles", "ProgramFiles(x86)"];
  return Object.fromEntries(keys.map((key) => [key, process.env[key]]));
}

function restoreEnv(snapshot) {
  for (const [key, value] of Object.entries(snapshot)) {
    if (value == null) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}
