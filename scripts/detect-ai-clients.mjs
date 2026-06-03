#!/usr/bin/env node
import { access, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const startedAt = new Date();
const env = process.env;
const homeDir = resolveHomeDir();
const appData = env.APPDATA || (process.platform === "win32" ? path.join(homeDir, "AppData", "Roaming") : null);
const localAppData = env.LOCALAPPDATA || (process.platform === "win32" ? path.join(homeDir, "AppData", "Local") : null);
const xdgConfigHome = env.XDG_CONFIG_HOME || (homeDir ? path.join(homeDir, ".config") : null);
const darwinApplicationSupport = homeDir ? path.join(homeDir, "Library", "Application Support") : null;
const programFiles = env.ProgramFiles || "C:\\Program Files";
const programFilesX86 = env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";

const clients = {
  claude_desktop: {
    display_name: "Claude Desktop",
    config_paths: compact([
      appData && path.join(appData, "Claude", "claude_desktop_config.json"),
      darwinApplicationSupport && path.join(darwinApplicationSupport, "Claude", "claude_desktop_config.json"),
      xdgConfigHome && path.join(xdgConfigHome, "Claude", "claude_desktop_config.json"),
      xdgConfigHome && path.join(xdgConfigHome, "claude", "claude_desktop_config.json")
    ]),
    install_paths: compact([
      localAppData && path.join(localAppData, "Programs", "Claude", "Claude.exe"),
      path.join(programFiles, "Claude", "Claude.exe"),
      "/Applications/Claude.app",
      "/usr/bin/claude",
      "/usr/local/bin/claude"
    ])
  },
  cursor: {
    display_name: "Cursor",
    config_paths: compact([
      appData && path.join(appData, "Cursor", "User", "settings.json"),
      appData && path.join(appData, "Cursor", "User", "mcp.json"),
      homeDir && path.join(homeDir, ".cursor", "mcp.json"),
      darwinApplicationSupport && path.join(darwinApplicationSupport, "Cursor", "User", "settings.json"),
      darwinApplicationSupport && path.join(darwinApplicationSupport, "Cursor", "User", "mcp.json"),
      xdgConfigHome && path.join(xdgConfigHome, "Cursor", "User", "settings.json"),
      xdgConfigHome && path.join(xdgConfigHome, "Cursor", "User", "mcp.json")
    ]),
    install_paths: compact([
      localAppData && path.join(localAppData, "Programs", "cursor", "Cursor.exe"),
      path.join(programFiles, "Cursor", "Cursor.exe"),
      path.join(programFilesX86, "Cursor", "Cursor.exe"),
      "/Applications/Cursor.app",
      "/usr/bin/cursor",
      "/usr/local/bin/cursor",
      "/opt/Cursor"
    ])
  },
  windsurf: {
    display_name: "Windsurf",
    config_paths: compact([
      appData && path.join(appData, "Windsurf", "User", "settings.json"),
      appData && path.join(appData, "Windsurf", "User", "mcp.json"),
      appData && path.join(appData, "Codeium", "Windsurf", "mcp_config.json"),
      homeDir && path.join(homeDir, ".codeium", "windsurf", "mcp_config.json"),
      darwinApplicationSupport && path.join(darwinApplicationSupport, "Windsurf", "User", "settings.json"),
      darwinApplicationSupport && path.join(darwinApplicationSupport, "Windsurf", "User", "mcp.json"),
      xdgConfigHome && path.join(xdgConfigHome, "Windsurf", "User", "settings.json"),
      xdgConfigHome && path.join(xdgConfigHome, "Windsurf", "User", "mcp.json")
    ]),
    install_paths: compact([
      localAppData && path.join(localAppData, "Programs", "Windsurf", "Windsurf.exe"),
      path.join(programFiles, "Windsurf", "Windsurf.exe"),
      path.join(programFilesX86, "Windsurf", "Windsurf.exe"),
      "/Applications/Windsurf.app",
      "/usr/bin/windsurf",
      "/usr/local/bin/windsurf",
      "/opt/Windsurf"
    ])
  },
  antigravity: {
    display_name: "Antigravity",
    config_paths: compact([
      appData && path.join(appData, "Antigravity", "User", "settings.json"),
      appData && path.join(appData, "Antigravity", "User", "mcp.json"),
      appData && path.join(appData, "Google", "Antigravity", "User", "settings.json"),
      appData && path.join(appData, "Google", "Antigravity", "User", "mcp.json"),
      homeDir && path.join(homeDir, ".antigravity", "mcp.json"),
      darwinApplicationSupport && path.join(darwinApplicationSupport, "Antigravity", "User", "settings.json"),
      darwinApplicationSupport && path.join(darwinApplicationSupport, "Google", "Antigravity", "User", "settings.json"),
      xdgConfigHome && path.join(xdgConfigHome, "Antigravity", "User", "settings.json"),
      xdgConfigHome && path.join(xdgConfigHome, "Google", "Antigravity", "User", "settings.json")
    ]),
    install_paths: compact([
      localAppData && path.join(localAppData, "Programs", "Antigravity", "Antigravity.exe"),
      localAppData && path.join(localAppData, "Google", "Antigravity", "Antigravity.exe"),
      path.join(programFiles, "Antigravity", "Antigravity.exe"),
      path.join(programFiles, "Google", "Antigravity", "Antigravity.exe"),
      "/Applications/Antigravity.app",
      "/Applications/Google Antigravity.app",
      "/usr/bin/antigravity",
      "/usr/local/bin/antigravity",
      "/opt/Antigravity"
    ])
  }
};

export { clients as clientDefinitions };

export async function detectAiClients() {
  const detectedClients = {};
  for (const [clientId, definition] of Object.entries(clients)) {
    detectedClients[clientId] = await inspectClient(clientId, definition);
  }

  return {
    generated_at: startedAt.toISOString(),
    scan_metadata: {
      tool: "vnem-detect-ai-clients",
      version: "1.0.0",
      mode: "read-only",
      platform: process.platform,
      arch: process.arch,
      node: process.version,
      home_resolved: Boolean(homeDir),
      env_available: {
        APPDATA: Boolean(env.APPDATA),
        LOCALAPPDATA: Boolean(env.LOCALAPPDATA),
        HOME: Boolean(env.HOME),
        USERPROFILE: Boolean(env.USERPROFILE),
        XDG_CONFIG_HOME: Boolean(env.XDG_CONFIG_HOME)
      },
      clients_scanned: Object.keys(clients).length
    },
    detected_clients: detectedClients
  };
}

if (isCliEntry()) {
  const result = await detectAiClients();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

async function inspectClient(clientId, definition) {
  const installSignals = [];
  for (const installPath of unique(definition.install_paths)) {
    installSignals.push(await inspectPath(installPath));
  }

  const configFiles = [];
  for (const configPath of unique(definition.config_paths)) {
    configFiles.push(await inspectConfigFile(configPath));
  }

  const installed = installSignals.some((item) => item.exists) || configFiles.some((item) => item.exists);
  const configProfilePresent = configFiles.some((item) => item.exists);
  const customMcpHookPresent = configFiles.some((item) => item.has_mcp_config);
  const vnemConnectionPresent = configFiles.some((item) => item.has_vnem_connection);

  return {
    id: clientId,
    display_name: definition.display_name,
    installed,
    config_profile_present: configProfilePresent,
    custom_mcp_hook_present: customMcpHookPresent,
    vnem_connection_present: vnemConnectionPresent,
    install_signals: installSignals,
    config_files: configFiles,
    next_action: nextAction({ installed, configProfilePresent, customMcpHookPresent, vnemConnectionPresent })
  };
}

async function inspectPath(candidatePath) {
  const record = {
    path: candidatePath,
    exists: false,
    type: "missing"
  };
  try {
    const info = await stat(candidatePath);
    record.exists = true;
    record.type = info.isDirectory() ? "directory" : info.isFile() ? "file" : "other";
    record.size_bytes = info.isFile() ? info.size : undefined;
    record.modified_at = Number.isFinite(info.mtimeMs) ? info.mtime.toISOString() : undefined;
  } catch (error) {
    record.error = safeErrorCode(error);
  }
  return record;
}

async function inspectConfigFile(configPath) {
  const base = await inspectPath(configPath);
  const record = {
    ...base,
    readable: false,
    parseable_json: false,
    has_mcp_config: false,
    has_vnem_connection: false
  };

  if (!base.exists || base.type !== "file") {
    return record;
  }

  let text = "";
  try {
    await access(configPath);
    text = await readFile(configPath, "utf8");
    record.readable = true;
  } catch (error) {
    record.read_error = safeErrorCode(error);
    return record;
  }

  record.has_vnem_connection = hasVnemConnection(text);
  record.has_mcp_config = hasMcpSignal(text);

  try {
    const parsed = JSON.parse(text);
    record.parseable_json = true;
    record.has_vnem_connection = record.has_vnem_connection || deepContainsVnem(parsed);
    record.has_mcp_config = record.has_mcp_config || deepContainsMcpConfig(parsed);
  } catch (error) {
    record.parse_error = "invalid-json";
  }

  return record;
}

function resolveHomeDir() {
  return env.HOME || env.USERPROFILE || os.homedir?.() || "";
}

function hasVnemConnection(text) {
  return /\bvnem\b|vnem-mcp|vnem-precision|vnem-mcp-server|vnem-precision-mcp-server/i.test(String(text || ""));
}

function hasMcpSignal(text) {
  return /mcpServers|modelContextProtocol|model_context_protocol|mcp\.json|mcp_config|mcp-server|mcp_server/i.test(String(text || ""));
}

function deepContainsVnem(value) {
  return deepSearch(value, (_key, item) => typeof item === "string" && hasVnemConnection(item));
}

function deepContainsMcpConfig(value) {
  return deepSearch(value, (key, item) => {
    const normalizedKey = String(key || "").toLowerCase();
    if (["mcpservers", "mcp", "modelcontextprotocol", "model_context_protocol"].includes(normalizedKey)) {
      return true;
    }
    return typeof item === "string" && hasMcpSignal(item);
  });
}

function deepSearch(value, predicate, key = "", seen = new Set()) {
  if (predicate(key, value)) {
    return true;
  }
  if (!value || typeof value !== "object") {
    return false;
  }
  if (seen.has(value)) {
    return false;
  }
  seen.add(value);
  if (Array.isArray(value)) {
    return value.some((item, index) => deepSearch(item, predicate, String(index), seen));
  }
  return Object.entries(value).some(([childKey, childValue]) => deepSearch(childValue, predicate, childKey, seen));
}

function nextAction({ installed, configProfilePresent, customMcpHookPresent, vnemConnectionPresent }) {
  if (vnemConnectionPresent) {
    return "vnem connection appears present; verify with the client before modifying anything.";
  }
  if (customMcpHookPresent) {
    return "MCP configuration appears present; offer a preview before adding vnem.";
  }
  if (configProfilePresent || installed) {
    return "client appears installed; a future GUI may offer a reversible vnem connector preview.";
  }
  return "client not detected; no action needed.";
}

function compact(values) {
  return values.filter(Boolean);
}

function unique(values) {
  return [...new Set(compact(values))];
}

function safeErrorCode(error) {
  const code = error?.code || error?.name || "unavailable";
  if (["ENOENT", "ENOTDIR", "EACCES", "EPERM"].includes(code)) {
    return code;
  }
  return "unavailable";
}

function isCliEntry() {
  return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}
