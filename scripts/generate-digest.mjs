import { readFile } from "node:fs/promises";
import path from "node:path";
import { ROOT, readJson, writeText } from "./lib/registry.mjs";
import { buildDailyDigest, latestCandidateReport } from "./vnem/generation/daily-digest.mjs";
import { resolveGenerationClock } from "./vnem/generation/generated-artifacts.mjs";

const metadata = JSON.parse(await readFile(path.join(ROOT, "generation", "metadata.json"), "utf8"));
const clock = resolveGenerationClock({ sourceDateEpoch: process.env.SOURCE_DATE_EPOCH, semanticTimestamp: metadata.semantic_timestamp });
const registry = await readJson(path.join(ROOT, "public", "api", "index.json"));
const searchIndex = await readJson(path.join(ROOT, "public", "install", "search-index.json"));
const candidateReport = await latestCandidateReport(ROOT);
const digest = buildDailyDigest({ generatedAt: clock.iso, registry, searchIndex, candidateReport });

await writeText(path.join(ROOT, "discovery", "daily-digest.md"), digest);
console.log(`Wrote deterministic discovery/daily-digest.md with ${candidateReport?.candidates?.filter((candidate) => candidate.reason !== "already-indexed").slice(0, 30).length ?? 0} candidate signal(s).`);
