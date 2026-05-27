import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { ROOT, readJson, writeText } from "./lib/registry.mjs";

const generatedAt = new Date().toISOString();
const candidatesDir = path.join(ROOT, "discovery", "candidates");

async function latestCandidateReport() {
  if (!existsSync(candidatesDir)) return null;
  const files = (await readdir(candidatesDir))
    .filter((file) => file.endsWith(".json"))
    .sort();
  if (files.length === 0) return null;
  return readJson(path.join(candidatesDir, files.at(-1)));
}

function lineForCandidate(candidate) {
  return `- ${candidate.title ?? candidate.name} | ${candidate.suggested_trust_tier} | ${candidate.reason} | ${candidate.source_url}`;
}

function lineForEntry(entry) {
  const risks = entry.risk_flags?.length ? entry.risk_flags.join(", ") : entry.review_status;
  return `- [${entry.name}](${entry.url_path}) | ${entry.type} | ${entry.trust_tier} | ${risks}`;
}

const registry = await readJson(path.join(ROOT, "public", "api", "index.json"));
const searchIndex = await readJson(path.join(ROOT, "public", "install", "search-index.json"));
const candidateReport = await latestCandidateReport();
const candidates = candidateReport?.candidates ?? [];
const freshCandidates = candidates.filter((candidate) => candidate.reason !== "already-indexed").slice(0, 30);
const watchlist = registry.entries
  .filter((entry) => entry.risk_flags?.length > 0 || entry.trust_tier === "watchlist" || entry.trust_tier === "deprecated")
  .slice(0, 20);
const practiceDocs = searchIndex.documents
  .filter((document) => document.kind === "best-practice")
  .slice(0, 8);

const digest = [
  "# vnem Daily Signals",
  "",
  `Generated: ${generatedAt}`,
  "",
  "This digest is designed for maintainers. It summarizes source-backed candidates and stable best-practice signals; it does not auto-promote entries into the registry.",
  "",
  "## Discovery Candidates",
  "",
  freshCandidates.length > 0
    ? freshCandidates.map(lineForCandidate).join("\n")
    : "- No new candidate report found, or every candidate is already indexed.",
  "",
  "## Best-practice Signals",
  "",
  ...practiceDocs.map((document) => `- ${document.title}: ${document.summary}`),
  "",
  "## Watchlist / Risk Flags",
  "",
  watchlist.length > 0
    ? watchlist.map(lineForEntry).join("\n")
    : "- No watchlist entries in the current generated index.",
  "",
  "## Maintainer Actions",
  "",
  "- Review the discovery PR before merging.",
  "- Promote candidates only after checking source links, license posture, permissions, and install docs.",
  "- Keep X, Reddit, and social ingestion disabled unless official credentials and terms-compliant access are configured.",
  "- If the local pack changed, verify `AGENTS.md`, `search-index.json`, `best-practices.md`, and `agent-workspace.md` still describe read-only behavior.",
  ""
].join("\n");

await writeText(path.join(ROOT, "discovery", "daily-digest.md"), digest);
console.log(`Wrote discovery/daily-digest.md with ${freshCandidates.length} candidate signal(s).`);
