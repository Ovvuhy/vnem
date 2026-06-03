import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const defaultEnvFiles = [".env", ".env.local"];

export function loadLocalEnv(rootDir = process.cwd(), options = {}) {
  const envFiles = options.envFiles ?? defaultEnvFiles;
  const applyToProcess = options.apply !== false;
  const loaded = [];
  const merged = {};

  for (const fileName of envFiles) {
    const filePath = path.join(rootDir, fileName);
    if (!existsSync(filePath)) {
      continue;
    }
    const parsed = parseEnvFile(readFileSync(filePath, "utf8"));
    Object.assign(merged, parsed);
    loaded.push(fileName);
  }

  if (applyToProcess) {
    for (const [key, value] of Object.entries(merged)) {
      if (process.env[key] == null) {
        process.env[key] = value;
      }
    }
  }

  return {
    loaded,
    keys: Object.keys(merged),
    values: { ...merged }
  };
}

export function parseEnvFile(text) {
  const parsed = {};
  for (const rawLine of String(text ?? "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const normalized = line.startsWith("export ") ? line.slice(7).trim() : line;
    const equalsIndex = normalized.indexOf("=");
    if (equalsIndex <= 0) {
      continue;
    }
    const key = normalized.slice(0, equalsIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      continue;
    }
    parsed[key] = stripEnvQuotes(normalized.slice(equalsIndex + 1).trim());
  }
  return parsed;
}

function stripEnvQuotes(value) {
  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}
