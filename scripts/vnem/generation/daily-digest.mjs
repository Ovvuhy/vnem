import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export async function latestCandidateReport(root) {
  const candidatesDir = path.join(root, "discovery", "candidates");
  if (!existsSync(candidatesDir)) return null;
  const files = (await readdir(candidatesDir)).filter((file) => file.endsWith(".json")).sort();
  if (!files.length) return null;
  return JSON.parse(await readFile(path.join(candidatesDir, files.at(-1)), "utf8"));
}

export function buildDailyDigest({ generatedAt, registry, searchIndex, candidateReport }) {
  const candidates = candidateReport?.candidates ?? [];
  const freshCandidates = candidates.filter((candidate) => candidate.reason !== "already-indexed").slice(0, 30);
  const watchlist = registry.entries
    .filter((entry) => entry.risk_flags?.length > 0 || entry.trust_tier === "watchlist" || entry.trust_tier === "deprecated")
    .slice(0, 20);
  const practiceDocs = searchIndex.documents.filter((document) => document.kind === "best-practice").slice(0, 8);
  const lineForCandidate = (candidate) => `- ${candidate.title ?? candidate.name} | ${candidate.suggested_trust_tier} | ${candidate.reason} | ${candidate.source_url}`;
  const lineForEntry = (entry) => `- [${entry.name}](${entry.url_path}) | ${entry.type} | ${entry.trust_tier} | ${entry.risk_flags?.length ? entry.risk_flags.join(", ") : entry.review_status}`;

  return [
    "# vnem Daily Signals",
    "",
    `Generated: ${generatedAt}`,
    "",
    "This digest is designed for maintainers. It summarizes source-backed candidates and stable best-practice signals; it does not auto-promote entries into the registry.",
    "",
    "## Discovery Candidates",
    "",
    freshCandidates.length ? freshCandidates.map(lineForCandidate).join("\n") : "- No new candidate report found, or every candidate is already indexed.",
    "",
    "## Best-practice Signals",
    "",
    ...practiceDocs.map((document) => `- ${document.title}: ${document.summary}`),
    "",
    "## Watchlist / Risk Flags",
    "",
    watchlist.length ? watchlist.map(lineForEntry).join("\n") : "- No watchlist entries in the current generated index.",
    "",
    "## Maintainer Actions",
    "",
    "- Review the discovery PR before merging.",
    "- Promote candidates only after checking source links, license posture, permissions, and install docs.",
    "- Keep X, Reddit, and social ingestion disabled unless official credentials and terms-compliant access are configured.",
    "- If the local pack changed, verify `AGENTS.md`, `search-index.json`, `best-practices.md`, and `agent-workspace.md` still describe read-only behavior.",
    ""
  ].join("\n");
}
