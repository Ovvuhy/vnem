import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const ROOT = path.resolve(__dirname, "../..");
export const ENTRIES_DIR = path.join(ROOT, "registry", "entries");
export const SCHEMA_PATH = path.join(ROOT, "schemas", "entry.schema.json");

export async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

export async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export async function writeText(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, value);
}

export async function writeBytes(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, value);
}

export async function listEntryPaths(dir = ENTRIES_DIR) {
  if (!existsSync(dir)) {
    return [];
  }

  const found = [];
  const items = await readdir(dir, { withFileTypes: true });

  for (const item of items) {
    const itemPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      found.push(...await listEntryPaths(itemPath));
    } else if (item.name === "entry.yaml") {
      found.push(itemPath);
    }
  }

  return found.sort();
}

export async function readEntries() {
  const paths = await listEntryPaths();
  const entries = [];

  for (const entryPath of paths) {
    const raw = await readFile(entryPath, "utf8");
    const entry = yaml.load(raw);
    const dir = path.dirname(entryPath);
    const profilePath = path.join(dir, "profile.md");
    const profile = existsSync(profilePath) ? await readFile(profilePath, "utf8") : "";

    entries.push({
      entry,
      raw,
      profile,
      entryPath,
      profilePath,
      relativeEntryPath: toPortablePath(path.relative(ROOT, entryPath)),
      relativeProfilePath: toPortablePath(path.relative(ROOT, profilePath))
    });
  }

  return entries.sort((a, b) => a.entry.slug.localeCompare(b.entry.slug));
}

export function toPortablePath(filePath) {
  return filePath.split(path.sep).join("/");
}

export function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
}

export function summarizeProfile(profile) {
  return profile
    .replace(/^# .+$/m, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 320)
    .trimEnd();
}

export function publicEntry(entry, profile, relativeEntryPath, relativeProfilePath) {
  return {
    ...entry,
    profile_excerpt: summarizeProfile(profile),
    entry_path: relativeEntryPath,
    profile_path: relativeProfilePath,
    url_path: `/entries/${entry.slug}/`
  };
}
