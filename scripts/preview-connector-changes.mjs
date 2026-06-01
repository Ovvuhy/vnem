#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { clientDefinitions, detectAiClients } from "./detect-ai-clients.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");

export async function generateConnectorPreviews(options = {}) {
  const repositoryRoot = path.resolve(options.repositoryRoot || rootDir);
  const redact = options.redact !== false;
  const generatedAt = new Date().toISOString();
  const serverDefinitions = buildServerDefinitions(repositoryRoot);
  const detectorResult = await detectAiClients();
  const previews = {};
  for (const [clientId, client] of Object.entries(detectorResult.detected_clients || {})) {
    previews[clientId] = await previewClientConnector(clientId, client, {
      redact,
      repositoryRoot,
      serverDefinitions
    });
  }

  return {
    generated_at: generatedAt,
    preview_metadata: {
      tool: "vnem-preview-connector-changes",
      version: "1.0.0",
      mode: "read-only-preview",
      repository_root: repositoryRoot,
      writes_performed: false,
      clients_scanned: Object.keys(previews).length,
      detector_generated_at: detectorResult.generated_at
    },
    server_definitions: serverDefinitions,
    previews
  };
}

if (isCliEntry()) {
  const result = await generateConnectorPreviews({ redact: true });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

async function previewClientConnector(clientId, client, options) {
  try {
    const selected = selectConfigTarget(clientId, client, options.repositoryRoot);
    const current = await readCurrentConfig(selected.path, { redact: options.redact });
    const merge = buildTargetConfigState(current.state, client.vnem_connection_present, options.serverDefinitions);
    return {
      id: clientId,
      display_name: client.display_name,
      installed: Boolean(client.installed),
      selected_config_path: selected.path,
      selected_config_reason: selected.reason,
      current_config_state: current.state,
      current_config_readable: current.readable,
      current_config_exists: current.exists,
      current_config_error: current.error,
      proposed_addition: merge.proposed_addition,
      target_config_state: merge.target_config_state,
      preview_status: merge.status,
      would_change: merge.would_change,
      reversible: true,
      writes_performed: false,
      notes: [
        "This is a read-only preview. No external client configuration files were written.",
        "Future connector writes must show this diff, create a backup, and require explicit user confirmation."
      ]
    };
  } catch (error) {
    return {
      id: clientId,
      display_name: client?.display_name || clientId,
      installed: Boolean(client?.installed),
      preview_status: "preview-error",
      would_change: false,
      reversible: true,
      writes_performed: false,
      error: safeErrorMessage(error)
    };
  }
}

export function buildServerDefinitions(repositoryRoot) {
  const readOnlyServer = path.join(repositoryRoot, "scripts", "vnem-mcp-server.mjs");
  const precisionServer = path.join(repositoryRoot, "scripts", "vnem-precision-mcp-server.mjs");
  return {
    vnem: {
      command: "node",
      args: [readOnlyServer],
      env: {
        VNEM_ROOT: repositoryRoot
      }
    },
    "vnem-precision": {
      command: "node",
      args: [precisionServer],
      env: {
        VNEM_PRECISION_ROOT: repositoryRoot
      }
    }
  };
}

function selectConfigTarget(clientId, client, repositoryRoot) {
  const files = client?.config_files || [];
  const definitionPaths = clientDefinitions[clientId]?.config_paths || [];
  const existingVnem = files.find((file) => file.exists && file.readable && file.has_vnem_connection);
  if (existingVnem) {
    return { path: existingVnem.path, reason: "existing-vnem-connection" };
  }

  const existingMcp = files.find((file) => file.exists && file.readable && file.has_mcp_config);
  if (existingMcp) {
    return { path: existingMcp.path, reason: "existing-mcp-config" };
  }

  const preferredExisting = files.find((file) => file.exists && file.readable && isMcpConfigPath(file.path));
  if (preferredExisting) {
    return { path: preferredExisting.path, reason: "existing-readable-mcp-path" };
  }

  const preferredFuture = definitionPaths.find((candidate) => isMcpConfigPath(candidate));
  if (preferredFuture) {
    return { path: preferredFuture, reason: "preferred-mcp-config-path" };
  }

  const existingReadable = files.find((file) => file.exists && file.readable);
  if (existingReadable) {
    return { path: existingReadable.path, reason: "existing-readable-config" };
  }

  const fallback = definitionPaths[0] || path.join(repositoryRoot, ".vnem-runtime", "connector-previews", `${clientId}.json`);
  return { path: fallback, reason: "default-config-path" };
}

async function readCurrentConfig(configPath, options = {}) {
  if (!configPath) {
    return {
      exists: false,
      readable: false,
      state: {},
      error: "missing-config-path"
    };
  }

  let text = "";
  try {
    text = await readFile(configPath, "utf8");
  } catch (error) {
    if (["ENOENT", "ENOTDIR"].includes(error?.code)) {
      return {
        exists: false,
        readable: false,
        state: {},
        error: error.code
      };
    }
    return {
      exists: false,
      readable: false,
      state: null,
      error: safeErrorCode(error)
    };
  }

  try {
    return {
      exists: true,
      readable: true,
      state: options.redact === false ? JSON.parse(text) : redactConfig(JSON.parse(text)),
      error: null
    };
  } catch (error) {
    return {
      exists: true,
      readable: true,
      state: null,
      error: "invalid-json"
    };
  }
}

function buildTargetConfigState(currentConfigState, hasExistingVnem, serverDefinitions) {
  if (currentConfigState === null || Array.isArray(currentConfigState) || typeof currentConfigState !== "object") {
    return {
      status: "blocked-invalid-current-config",
      would_change: false,
      proposed_addition: null,
      target_config_state: null
    };
  }

  const currentMcpServers = currentConfigState.mcpServers;
  if (currentMcpServers != null && (Array.isArray(currentMcpServers) || typeof currentMcpServers !== "object")) {
    return {
      status: "blocked-non-object-mcpServers",
      would_change: false,
      proposed_addition: null,
      target_config_state: null
    };
  }

  const missingServers = {};
  for (const [serverName, serverDefinition] of Object.entries(serverDefinitions)) {
    if (!currentMcpServers?.[serverName]) {
      missingServers[serverName] = serverDefinition;
    }
  }

  const targetConfigState = {
    ...currentConfigState,
    mcpServers: {
      ...(currentMcpServers || {}),
      ...missingServers
    }
  };

  return {
    status: hasExistingVnem && !Object.keys(missingServers).length ? "already-connected" : "would-add-vnem-mcp",
    would_change: Object.keys(missingServers).length > 0,
    proposed_addition: Object.keys(missingServers).length
      ? {
          mcpServers: missingServers
        }
      : {},
    target_config_state: targetConfigState
  };
}

function isMcpConfigPath(candidatePath) {
  const normalized = String(candidatePath || "").replace(/\\/g, "/").toLowerCase();
  return normalized.endsWith("/mcp.json") || normalized.endsWith("/mcp_config.json") || normalized.includes("/claude_desktop_config.json");
}

function redactConfig(value) {
  return redactValue(value, "");
}

function redactValue(value, key) {
  if (typeof value === "string") {
    return isSensitiveKey(key) || looksSensitive(value) ? "[redacted]" : value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, key));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, childValue]) => [childKey, redactValue(childValue, childKey)])
    );
  }
  return value;
}

function isSensitiveKey(key) {
  return /token|secret|password|api[_-]?key|private[_-]?key|credential|bearer/i.test(String(key || ""));
}

function looksSensitive(value) {
  const text = String(value || "");
  return /sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{20,}/.test(text);
}

function safeErrorCode(error) {
  const code = error?.code || error?.name || "unavailable";
  if (["ENOENT", "ENOTDIR", "EACCES", "EPERM"].includes(code)) {
    return code;
  }
  return "unavailable";
}

function safeErrorMessage(error) {
  return `${safeErrorCode(error)}: ${String(error?.message || "preview failed").slice(0, 180)}`;
}

function isCliEntry() {
  return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}
