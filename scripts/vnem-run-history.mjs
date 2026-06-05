#!/usr/bin/env node
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultRootDir = path.resolve(scriptDir, "..");
const allowedStatuses = new Set(["planned", "in-progress", "validated", "pushed", "blocked", "failed"]);

export function runHistoryPaths({ rootDir = defaultRootDir } = {}) {
  const resolvedRoot = path.resolve(rootDir);
  const historyDir = path.join(resolvedRoot, "discovery", "run-history");
  return { rootDir: resolvedRoot, historyDir, indexPath: path.join(historyDir, "index.json") };
}

export function parseRunHistoryArgs(argv = process.argv.slice(2)) {
  const [command = "list", ...rest] = argv;
  if (!["list", "latest", "record"].includes(command)) throw new Error(`unknown run-history command: ${command}`);
  const parsed = { command };
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    parsed[key] = rest[index + 1] && !rest[index + 1].startsWith("--") ? rest[++index] : true;
  }
  if (command === "record") {
    if (!parsed.title) throw new Error("record requires --title");
    if (/[\\/]/.test(parsed.title) || parsed.title.includes("..")) throw new Error("invalid title: path-like values are not allowed");
    if (!parsed.commit) throw new Error("record requires --commit");
    if (parsed.status && !allowedStatuses.has(parsed.status)) throw new Error(`invalid status: ${parsed.status}`);
  }
  return parsed;
}

export async function listRunHistory({ rootDir = defaultRootDir } = {}) {
  const { historyDir } = runHistoryPaths({ rootDir });
  try {
    const names = (await readdir(historyDir)).filter((name) => name.endsWith(".json") && name !== "index.json").sort();
    const records = [];
    for (const name of names) {
      const record = JSON.parse(await readFile(path.join(historyDir, name), "utf8"));
      records.push(record);
    }
    return records.sort((a, b) => String(a.finishedAt ?? a.startedAt).localeCompare(String(b.finishedAt ?? b.startedAt)));
  } catch {
    return [];
  }
}

export async function latestRunHistory({ rootDir = defaultRootDir } = {}) {
  const records = await listRunHistory({ rootDir });
  return records.at(-1) ?? null;
}

export async function recordRunHistory(input = {}) {
  const { rootDir = defaultRootDir } = input;
  const paths = runHistoryPaths({ rootDir });
  const now = new Date().toISOString();
  const title = String(input.title ?? "Untitled VNEM self-improvement run");
  if (/[\\/]/.test(title) || title.includes("..")) throw new Error("invalid title: path-like values are not allowed");
  const status = input.status ?? "validated";
  if (!allowedStatuses.has(status)) throw new Error(`invalid status: ${status}`);
  const id = input.id ?? `${now.slice(0, 10)}-${slug(title)}`;
  const fileName = `${id}.json`;
  const filePath = path.resolve(paths.historyDir, fileName);
  if (!filePath.startsWith(path.resolve(paths.historyDir) + path.sep)) throw new Error("refusing to write outside run-history directory");
  const record = {
    id,
    title,
    startedAt: input.startedAt ?? now,
    finishedAt: input.finishedAt ?? now,
    status,
    branch: input.branch ?? "main",
    commit: input.commit ?? null,
    pushed: Boolean(input.pushed),
    changedSurfaces: input.changedSurfaces ?? [],
    validationRun: input.validationRun ?? { status: "not-recorded", commands: [], notes: "No validation details were provided." },
    visualCheck: input.visualCheck ?? { status: "not-recorded", notes: "No visual check details were provided." },
    generatedArtifacts: input.generatedArtifacts ?? { refreshed: false, notes: "Not recorded." },
    safetyNotes: input.safetyNotes ?? [],
    remainingLimitations: input.remainingLimitations ?? [],
    nextRecommendedImprovement: input.nextRecommendedImprovement ?? "Record the next focused VNEM improvement after validation."
  };
  await mkdir(paths.historyDir, { recursive: true });
  await writeFile(filePath, `${JSON.stringify(record, null, 2)}\n`);
  await refreshRunHistoryIndex({ rootDir });
  return { ...record, filePath };
}

export async function refreshRunHistoryIndex({ rootDir = defaultRootDir } = {}) {
  const paths = runHistoryPaths({ rootDir });
  const records = await listRunHistory({ rootDir });
  const latest = records.at(-1) ?? null;
  const index = {
    schema: "vnem.selfImprovementRunHistory.v1",
    updatedAt: new Date().toISOString(),
    count: records.length,
    latest,
    records: records.map((record) => ({ id: record.id, title: record.title, status: record.status, commit: record.commit, pushed: record.pushed, finishedAt: record.finishedAt }))
  };
  await mkdir(paths.historyDir, { recursive: true });
  await writeFile(paths.indexPath, `${JSON.stringify(index, null, 2)}\n`);
  return index;
}

export function formatRunHistory(records) {
  if (!records || (Array.isArray(records) && records.length === 0)) return "No VNEM self-improvement runs recorded.\n";
  const list = Array.isArray(records) ? records : [records];
  return `${list.map((record) => [`${record.finishedAt ?? record.startedAt} — ${record.status} — ${record.title}`, `  commit: ${record.commit ?? "none"}`, `  pushed: ${record.pushed ? "yes" : "no"}`, `  next: ${record.nextRecommendedImprovement ?? "not recorded"}`].join("\n")).join("\n")}\n`;
}

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "run";
}

async function main() {
  const args = parseRunHistoryArgs();
  if (args.command === "record") {
    const record = await recordRunHistory({ title: args.title, commit: args.commit, status: args.status ?? "validated", branch: args.branch ?? "main", pushed: args.status === "pushed" || args.pushed === "true" });
    process.stdout.write(`${JSON.stringify(record, null, 2)}\n`);
    return;
  }
  if (args.command === "latest") {
    const latest = await latestRunHistory();
    process.stdout.write(formatRunHistory(latest));
    return;
  }
  process.stdout.write(formatRunHistory(await listRunHistory()));
}

if (path.basename(process.argv[1] ?? "") === "vnem-run-history.mjs") {
  await main();
}
