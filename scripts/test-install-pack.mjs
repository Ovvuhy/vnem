import { readFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { ROOT, readJson } from "./lib/registry.mjs";

const failures = [];
const stopWords = new Set([
  "and",
  "are",
  "before",
  "can",
  "code",
  "for",
  "from",
  "has",
  "have",
  "into",
  "needs",
  "official",
  "project",
  "projects",
  "recorded",
  "registry",
  "review",
  "reviewed",
  "source",
  "sources",
  "that",
  "the",
  "this",
  "tier",
  "treat",
  "upstream",
  "url",
  "use",
  "when",
  "with"
]);

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function tokenize(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9+#./-]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 2 && !stopWords.has(token));
}

function dangerousPatternFound(text) {
  const patterns = [
    /curl\s+[^|]+?\|\s*(sh|bash|zsh)/i,
    /\bnpm\s+install\b/i,
    /\bpnpm\s+add\b/i,
    /\byarn\s+add\b/i,
    /\bpip\s+install\b/i,
    /\bcargo\s+install\b/i,
    /\bsudo\b/i,
    /\bchmod\s+\+x\b/i,
    /\bexport\s+[A-Z0-9_]+=/i
  ];
  return patterns.find((pattern) => pattern.test(text));
}

function safeHttpsUrl(value, expectedPathSuffix) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  return url.protocol === "https:" &&
    !url.username &&
    !url.password &&
    url.pathname.endsWith(expectedPathSuffix);
}

function safeInstallCommand(command) {
  const archiveMatch = command.match(/^curl -fsSL (\S+) \| tar -xz$/);
  if (archiveMatch) {
    return safeHttpsUrl(archiveMatch[1], "/install.tgz") &&
      !dangerousPatternFound(command);
  }

  const expectedFiles = new Set([
    "AGENTS.md",
    "search-index.json",
    "best-practices.md",
    "prompt-engineering.md",
    "prompt-patterns.json"
  ]);
  const segments = command.split(/\s+&&\s+/);
  if (segments.length !== expectedFiles.size) {
    return false;
  }

  const seenFiles = new Set();
  for (const segment of segments) {
    const match = segment.match(/^curl -fsSL --create-dirs (\S+) -o \.vnem\/([A-Za-z0-9.-]+)$/);
    if (!match || dangerousPatternFound(segment)) {
      return false;
    }

    const [, url, fileName] = match;
    if (!expectedFiles.has(fileName) || seenFiles.has(fileName) || !safeHttpsUrl(url, `/install/${fileName}`)) {
      return false;
    }

    seenFiles.add(fileName);
  }

  return true;
}

function safeInstallArchiveUrl(value) {
  return !value || (safeHttpsUrl(value, "/install.tgz") && !dangerousPatternFound(value));
}

function tarNames(archive) {
  const data = gunzipSync(archive);
  const names = [];
  let offset = 0;

  while (offset < data.length) {
    const name = data.toString("utf8", offset, offset + 100).replace(/\0.*$/, "");
    if (!name) break;
    const sizeText = data.toString("utf8", offset + 124, offset + 136).replace(/\0.*$/, "").trim();
    const size = Number.parseInt(sizeText || "0", 8);
    names.push(name);
    offset += 512 + Math.ceil(size / 512) * 512;
  }

  return names;
}

function search(index, query) {
  const aliasTerms = index.intent_aliases?.[query] ?? [];
  const terms = [...new Set([...tokenize(query), ...aliasTerms.flatMap(tokenize)])];
  const ids = new Set();

  for (const term of terms) {
    for (const id of index.inverted_index?.[term] ?? []) {
      ids.add(id);
    }
  }

  return index.documents
    .filter((document) => ids.has(document.id))
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
}

const installDir = path.join(ROOT, "public", "install");
const localPackDir = path.join(ROOT, ".vnem");
const agents = await readFile(path.join(installDir, "AGENTS.md"), "utf8");
const bestPractices = await readFile(path.join(installDir, "best-practices.md"), "utf8");
const promptEngineering = await readFile(path.join(installDir, "prompt-engineering.md"), "utf8");
const promptPatterns = await readJson(path.join(installDir, "prompt-patterns.json"));
const searchIndex = await readJson(path.join(installDir, "search-index.json"));
const localSearchIndex = await readJson(path.join(localPackDir, "search-index.json"));
const localPromptPatterns = await readJson(path.join(localPackDir, "prompt-patterns.json"));
const apiIndex = await readJson(path.join(ROOT, "public", "api", "index.json"));
const installArchive = await readFile(path.join(ROOT, "public", "install.tgz"));

assert(agents.includes("Project Review Protocol"), "AGENTS.md must include the project review protocol.");
assert(agents.includes("Current stack"), "AGENTS.md must include the required output sections.");
assert(agents.includes("Ask before changing"), "AGENTS.md must tell agents to ask before changing.");
assert(agents.includes("Decision Rubric"), "AGENTS.md must include the decision rubric.");
assert(agents.includes("Decision Playbooks"), "AGENTS.md must include decision playbooks.");
assert(agents.includes("Coding Agent Selection"), "AGENTS.md must include coding-agent selection guidance.");
assert(!dangerousPatternFound(agents), `AGENTS.md contains a dangerous install/execution pattern: ${dangerousPatternFound(agents)}`);
assert(safeInstallCommand(apiIndex.install_command), "install command must only download or extract the read-only pack files.");
assert(safeInstallArchiveUrl(apiIndex.install_archive_url), "install archive URL must be an HTTPS install.tgz URL when present.");
assert(
  JSON.stringify(tarNames(installArchive)) === JSON.stringify([
    ".vnem/AGENTS.md",
    ".vnem/search-index.json",
    ".vnem/best-practices.md",
    ".vnem/prompt-engineering.md",
    ".vnem/prompt-patterns.json"
  ]),
  "install archive must extract only the five read-only pack files."
);
assert(bestPractices.includes("Frontend And UI"), "best-practices.md must include frontend guidance.");
assert(bestPractices.includes("Payments And Commerce"), "best-practices.md must include payments guidance.");
assert(agents.includes("Prompt Enhancement Protocol"), "AGENTS.md must include the prompt enhancement protocol.");
assert(agents.includes("Auto-activate the same protocol"), "AGENTS.md must include prompt auto-activation instructions.");
assert(agents.includes("use vnem to enhance this prompt"), "AGENTS.md must include the vnem prompt trigger phrase.");
assert(promptEngineering.includes("Prompt Enhancement Protocol"), "prompt-engineering.md must include the enhancement protocol.");
assert(promptEngineering.includes("Auto-Activation Rules"), "prompt-engineering.md must include auto-activation rules.");
assert(promptEngineering.includes("Codex Implementation Prompt"), "prompt-engineering.md must include Codex-oriented prompting.");
assert(promptPatterns.safety?.mode === "read-only-prompt-patterns", "prompt-patterns safety mode must be read-only-prompt-patterns.");
assert(promptPatterns.automatic_activation?.enabled === true, "prompt-patterns must enable automatic prompt enhancement.");
assert(promptPatterns.patterns?.some((pattern) => pattern.id === "codex-implementation"), "prompt-patterns must include a Codex implementation pattern.");
assert(promptPatterns.patterns?.some((pattern) => pattern.id === "provider-selection"), "prompt-patterns must include a provider selection pattern.");
assert(promptPatterns.patterns?.some((pattern) => pattern.id === "agent-upgrade-plan"), "prompt-patterns must include an agent upgrade planning pattern.");
assert(localPromptPatterns.patterns?.length === promptPatterns.patterns.length, "local .vnem prompt patterns must match the hosted install pack.");
assert(searchIndex.safety?.mode === "read-only-files", "search-index safety mode must be read-only-files.");
assert(searchIndex.safety?.executes_code === false, "search-index must declare that it does not execute code.");
assert(searchIndex.safety?.installs_packages === false, "search-index must declare that it does not install packages.");
assert(searchIndex.documents?.length > 0, "search-index must include documents.");
assert(searchIndex.decision_rubric?.length >= 6, "search-index must include the decision rubric.");
assert(searchIndex.decision_playbooks?.some((playbook) => playbook.id === "coding-agent-selection"), "search-index must include the coding-agent selection playbook.");
assert(searchIndex.documents?.some((document) => document.kind === "decision-playbook"), "search-index must index decision playbooks.");
assert(localSearchIndex.documents?.length === searchIndex.documents.length, "local .vnem search index must match the hosted install pack.");
assert(localSearchIndex.decision_playbooks?.length === searchIndex.decision_playbooks.length, "local .vnem decision playbooks must match the hosted install pack.");

for (const entry of apiIndex.entries ?? []) {
  assert(!entry.entry_path?.includes("\\"), `${entry.slug} entry_path must use portable forward slashes.`);
  assert(!entry.profile_path?.includes("\\"), `${entry.slug} profile_path must use portable forward slashes.`);
  assert(entry.entry_path?.startsWith("registry/entries/"), `${entry.slug} entry_path must point at registry/entries.`);
  assert(entry.profile_path?.startsWith("registry/entries/"), `${entry.slug} profile_path must point at registry/entries.`);
}

for (const query of ["better ui", "faster search", "agent payments", "code review", "memory", "evals", "prompt engineering", "codex prompt", "codex vs claude", "gemini agent", "ai model selection", "agent upgrade"]) {
  const results = search(searchIndex, query);
  assert(results.length > 0, `search-index must return at least one result for "${query}".`);
  assert(results[0].score >= results.at(-1).score, `search results for "${query}" must be rank sorted.`);
}

if (failures.length > 0) {
  console.error(`Install pack tests failed with ${failures.length} issue(s):`);
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`Install pack tests passed for ${searchIndex.documents.length} search documents.`);
