import { createHash } from "node:crypto";
import TOML from "@iarna/toml";

const MANAGED_NAMES = ["vnem", "vnem-tools", "vnem-precision"];
const MANAGED_MARKER_START = "# vnem-managed:start";
const MANAGED_MARKER_END = "# vnem-managed:end";
const MANAGED_INSTRUCTION_START = "<!-- vnem-managed-instructions:start -->";
const MANAGED_INSTRUCTION_END = "<!-- vnem-managed-instructions:end -->";
const MANAGED_TOOLS_ENV_KEYS = new Set([
  "VNEM_TOOLS_ALLOWED_ROOTS",
  "VNEM_TOOLS_EVIDENCE_ROOT",
  "VNEM_TOOLS_GLOBAL_MODE",
  "VNEM_TOOLS_STATE_ROOT",
  "VNEM_TOOLS_CODEX_CONFIG",
  "VNEM_TOOLS_PERMISSION_PROFILE"
]);

export function buildVnemServerConfigs({ root, workspace, components = ["core", "tools"], scope = "project", stateRoot, codexConfigPath, safetyProfile = "safe-local-dev" }) {
  const selected = new Set(components);
  const globalCodex = scope === "global";
  const servers = {};
  if (selected.has("core")) {
    servers.vnem = {
      command: process.execPath,
      args: [`${root}/scripts/vnem-mcp-server.mjs`],
      cwd: root,
      env: { VNEM_ROOT: root }
    };
  }
  if (selected.has("tools")) {
    servers["vnem-tools"] = {
      command: process.execPath,
      args: [`${root}/scripts/vnem-tools-mcp-server.mjs`],
      cwd: root,
      env: {
        ...(globalCodex ? {
          VNEM_TOOLS_GLOBAL_MODE: "codex",
          VNEM_TOOLS_STATE_ROOT: stateRoot,
          VNEM_TOOLS_CODEX_CONFIG: codexConfigPath,
          VNEM_TOOLS_PERMISSION_PROFILE: safetyProfile
        } : {
          VNEM_TOOLS_ALLOWED_ROOTS: workspace,
          VNEM_TOOLS_EVIDENCE_ROOT: `${workspace}/.vnem/tool-runs`
        }),
        VNEM_TOOLS_AUTONOMY_MODE: "fast",
        VNEM_TOOLS_GITHUB_PROFILE: "maintainer",
        VNEM_TOOLS_GITHUB_PROTECTED_BRANCHES: "main;master;production",
        VNEM_TOOLS_GITHUB_ALLOW_DIRECT_PUSH: "0",
        VNEM_TOOLS_GITHUB_ALLOW_FORCE_PUSH: "0",
        VNEM_TOOLS_GITHUB_ALLOW_REPO_DELETE: "0",
        VNEM_TOOLS_GITHUB_ALLOW_SETTINGS_MUTATION: "0",
        VNEM_TOOLS_MALWARE_DOWNLOAD_BLOCK: "1"
      }
    };
  }
  if (selected.has("precision")) {
    servers["vnem-precision"] = {
      command: process.execPath,
      args: [`${root}/scripts/vnem-precision-mcp-server.mjs`],
      cwd: workspace,
      env: { VNEM_PRECISION_ROOT: workspace }
    };
  }
  return normalizePaths(servers);
}

export function mergeJsonMcpConfig(existingText, servers) {
  let parsed = {};
  if (String(existingText || "").trim()) {
    try {
      parsed = JSON.parse(existingText);
    } catch {
      throw new Error("Existing client config is not valid JSON; no changes were made.");
    }
  }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error("Existing client config must be a JSON object; no changes were made.");
  }
  const currentServers = parsed.mcpServers;
  if (currentServers !== undefined && (!currentServers || Array.isArray(currentServers) || typeof currentServers !== "object")) {
    throw new Error("Existing mcpServers value must be a JSON object; no changes were made.");
  }
  const next = {
    ...parsed,
    mcpServers: {
      ...(currentServers || {}),
      ...Object.fromEntries(Object.entries(servers).map(([name, config]) => {
        const existingServer = currentServers?.[name];
        const preserved = existingServer && !Array.isArray(existingServer) && typeof existingServer === "object" ? existingServer : {};
        return [name, {
          ...preserved,
          ...config,
          env: { ...(preserved.env || {}), ...(config.env || {}) }
        }];
      }))
    }
  };
  const text = `${JSON.stringify(next, null, 2)}\n`;
  JSON.parse(text);
  return { text, changed: normalizeNewlines(existingText) !== normalizeNewlines(text), preservedTopLevelKeys: Object.keys(parsed).filter((key) => key !== "mcpServers") };
}

export function mergeCodexToml(existingText, servers) {
  const source = normalizeNewlines(existingText || "");
  const markerStarts = countOccurrences(source, MANAGED_MARKER_START);
  const markerEnds = countOccurrences(source, MANAGED_MARKER_END);
  if (markerStarts !== markerEnds || markerStarts > 1) {
    throw new Error("Existing Codex config has malformed VNEM managed markers; no changes were made.");
  }
  const preservedManagedAssignments = collectManagedAssignments(source);
  const stripped = stripManagedCodexSections(source);
  const block = renderCodexTomlServers(servers, preservedManagedAssignments);
  const text = `${stripped.trimEnd()}${stripped.trim() ? "\n\n" : ""}${block}`;
  const validation = validateToml(text);
  if (!validation.ok) throw new Error(`Generated Codex TOML is invalid: ${validation.error}`);
  return {
    text,
    changed: source !== text,
    removedManagedSections: validation.managedSections,
    validation
  };
}

export function renderManagedClientInstructions() {
  return [
    MANAGED_INSTRUCTION_START,
    "## VNEM Use",
    "",
    "- VNEM is the default improvement layer for eligible nontrivial tasks.",
    "- Call Core first when task understanding, research, routing, quality, or proof would materially benefit.",
    "- Use Tools for real inspection and execution, and never invent tool results.",
    "- Skip unnecessary VNEM overhead for trivial tasks and preserve freedom to use the best workflow.",
    "- Report what was proven, what was not proven, and the next safe action.",
    MANAGED_INSTRUCTION_END
  ].join("\n");
}

export function mergeManagedClientInstructions(existingText) {
  const source = normalizeNewlines(existingText || "");
  const starts = countOccurrences(source, MANAGED_INSTRUCTION_START);
  const ends = countOccurrences(source, MANAGED_INSTRUCTION_END);
  if (starts !== ends || starts > 1 || (starts === 1 && source.indexOf(MANAGED_INSTRUCTION_START) > source.indexOf(MANAGED_INSTRUCTION_END))) {
    throw new Error("Existing client instructions have malformed VNEM managed markers; no changes were made.");
  }
  const lines = source.split("\n");
  const preserved = [];
  let managed = false;
  for (const line of lines) {
    if (line.trim() === MANAGED_INSTRUCTION_START) {
      managed = true;
      continue;
    }
    if (managed) {
      if (line.trim() === MANAGED_INSTRUCTION_END) managed = false;
      continue;
    }
    preserved.push(line);
  }
  const base = preserved.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
  const text = `${base}${base ? "\n\n" : ""}${renderManagedClientInstructions()}\n`;
  return {
    text,
    changed: source !== text,
    preserved_unrelated_instructions: true,
    managed_block_present: true
  };
}

export function managedClientInstructionsPresent(text) {
  const source = normalizeNewlines(text || "");
  return countOccurrences(source, MANAGED_INSTRUCTION_START) === 1
    && countOccurrences(source, MANAGED_INSTRUCTION_END) === 1
    && source.indexOf(MANAGED_INSTRUCTION_START) < source.indexOf(MANAGED_INSTRUCTION_END)
    && /VNEM is the default improvement layer/i.test(source)
    && /Call Core first/i.test(source)
    && /Use Tools for real inspection and execution/i.test(source);
}

export function stripManagedCodexSections(text) {
  const lines = normalizeNewlines(text).split("\n");
  const output = [];
  let skipManagedBlock = false;
  let skipManagedTable = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === MANAGED_MARKER_START) {
      skipManagedBlock = true;
      skipManagedTable = false;
      continue;
    }
    if (skipManagedBlock) {
      if (trimmed === MANAGED_MARKER_END) skipManagedBlock = false;
      continue;
    }
    const table = tableName(trimmed);
    if (table) {
      skipManagedTable = isManagedTable(table);
      if (skipManagedTable) continue;
    }
    if (!skipManagedTable) output.push(line);
  }
  return output.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
}

export function renderCodexTomlServers(servers, preservedAssignments = new Map()) {
  const lines = [MANAGED_MARKER_START, "# Managed by `vnem setup`; use `vnem rollback` to restore the prior file."];
  for (const [name, config] of Object.entries(servers)) {
    const quotedName = name.includes("-") ? JSON.stringify(name) : name;
    lines.push(
      "",
      `[mcp_servers.${quotedName}]`,
      `command = ${tomlString(config.command)}`,
      `args = ${tomlArray(config.args || [])}`,
      `cwd = ${tomlString(config.cwd || config.env?.VNEM_ROOT || config.env?.VNEM_TOOLS_ALLOWED_ROOTS || config.env?.VNEM_PRECISION_ROOT)}`,
      "enabled = true",
      "required = false",
      "startup_timeout_sec = 20",
      "tool_timeout_sec = 120",
      "default_tools_approval_mode = \"prompt\""
    );
    appendPreservedAssignments(lines, preservedAssignments.get(`mcp_servers.${name}`), new Set([
      "command", "args", "cwd", "enabled", "required", "startup_timeout_sec", "startup_timeout_ms", "tool_timeout_sec", "default_tools_approval_mode"
    ]));
    const env = config.env || {};
    if (Object.keys(env).length) {
      lines.push("", `[mcp_servers.${quotedName}.env]`);
      for (const [key, value] of Object.entries(env)) lines.push(`${key} = ${tomlString(value)}`);
      const ownedEnvKeys = new Set(Object.keys(env));
      if (name === "vnem-tools") for (const key of MANAGED_TOOLS_ENV_KEYS) ownedEnvKeys.add(key);
      appendPreservedAssignments(lines, preservedAssignments.get(`mcp_servers.${name}.env`), ownedEnvKeys);
    }
  }
  lines.push("", MANAGED_MARKER_END, "");
  return lines.join("\n");
}

function collectManagedAssignments(text) {
  const assignments = new Map();
  let current = null;
  for (const rawLine of normalizeNewlines(text).split("\n")) {
    const table = tableName(stripTomlComment(rawLine).trim());
    if (table) {
      current = canonicalManagedTable(table);
      continue;
    }
    if (!current) continue;
    const match = /^\s*([A-Za-z0-9_.-]+)\s*=/.exec(rawLine);
    if (!match) continue;
    const currentAssignments = assignments.get(current) || [];
    currentAssignments.push({ key: match[1], line: rawLine.trim() });
    assignments.set(current, currentAssignments);
  }
  return assignments;
}

function appendPreservedAssignments(lines, assignments = [], ownedKeys = new Set()) {
  for (const assignment of assignments) {
    if (!ownedKeys.has(assignment.key)) lines.push(assignment.line);
  }
}

function canonicalManagedTable(table) {
  for (const name of MANAGED_NAMES) {
    const quoted = JSON.stringify(name);
    if (table === `mcp_servers.${name}` || table === `mcp_servers.${quoted}`) return `mcp_servers.${name}`;
    if (table === `mcp_servers.${name}.env` || table === `mcp_servers.${quoted}.env`) return `mcp_servers.${name}.env`;
  }
  return null;
}

export function validateToml(text, options = {}) {
  const source = normalizeNewlines(text);
  const tables = new Set();
  const keys = new Map();
  let current = "<root>";
  let managedSections = 0;
  for (const [index, rawLine] of source.split("\n").entries()) {
    const line = stripTomlComment(rawLine).trim();
    if (!line) continue;
    const table = tableName(line);
    if (table) {
      if (tables.has(table)) return { ok: false, error: `duplicate table [${table}] at line ${index + 1}`, validator: "structural" };
      tables.add(table);
      current = table;
      keys.set(current, new Set());
      if (isManagedTable(table)) managedSections += 1;
      continue;
    }
    const assignment = /^([A-Za-z0-9_.-]+)\s*=\s*(.+)$/.exec(line);
    if (!assignment) continue;
    const tableKeys = keys.get(current) || new Set();
    if (tableKeys.has(assignment[1])) return { ok: false, error: `duplicate key ${assignment[1]} in [${current}] at line ${index + 1}`, validator: "structural" };
    tableKeys.add(assignment[1]);
    keys.set(current, tableKeys);
  }
  const external = options.external === false ? null : validateWithTomlParser(source);
  if (external && !external.ok) return external;
  return { ok: true, validator: external?.validator || "structural", managedSections };
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function validateWithTomlParser(text) {
  try {
    TOML.parse(text);
    return { ok: true, validator: "@iarna/toml" };
  } catch (error) {
    const location = Number.isInteger(error?.line) ? ` at line ${error.line + 1}` : "";
    return { ok: false, error: `TOML parser rejected the file${location}`, validator: "@iarna/toml" };
  }
}

function isManagedTable(name) {
  return MANAGED_NAMES.some((managed) => name === `mcp_servers.${managed}` || name === `mcp_servers.${JSON.stringify(managed)}` || name === `mcp_servers.${managed}.env` || name === `mcp_servers.${JSON.stringify(managed)}.env`);
}

function tableName(line) {
  const match = /^\[([^\[\]]+)\]$/.exec(line);
  return match?.[1]?.trim() || null;
}

function stripTomlComment(line) {
  let quote = false;
  let escaped = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\" && quote) {
      escaped = true;
      continue;
    }
    if (char === '"') quote = !quote;
    if (char === "#" && !quote) return line.slice(0, index);
  }
  return line;
}

function tomlString(value) {
  return JSON.stringify(String(value || ""));
}

function tomlArray(values) {
  return `[${values.map(tomlString).join(", ")}]`;
}

function normalizePaths(value) {
  if (typeof value === "string") return value.replace(/\\/g, "/");
  if (Array.isArray(value)) return value.map(normalizePaths);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, normalizePaths(child)]));
}

function normalizeNewlines(value) {
  return String(value || "").replace(/\r\n?/g, "\n");
}

function countOccurrences(value, needle) {
  return value.split(needle).length - 1;
}
