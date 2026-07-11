#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, stat, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArg } from "./mcp-client.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const label = parseArg("label", "baseline");
const outputDir = path.join(root, ".vnem", "giga-evolution", label);
const files = git(["ls-files", "-z"]).split("\0").filter(Boolean).sort();
const records = [];

for (const relativePath of files) {
  const absolutePath = path.join(root, relativePath);
  const info = await stat(absolutePath);
  const bytes = await readFile(absolutePath);
  const binary = isBinary(relativePath, bytes);
  const text = binary ? "" : bytes.toString("utf8");
  records.push({
    path: slash(relativePath),
    category: classify(relativePath),
    bytes: info.size,
    lines: binary ? null : text.split(/\r?\n/).length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    binary
  });
}

const sourceFiles = [
  "scripts/vnem-mcp-server.mjs",
  "scripts/vnem-tools-mcp-server.mjs",
  "scripts/vnem-precision-mcp-server.mjs",
  "scripts/generate-artifacts.mjs"
];
const sources = Object.fromEntries(await Promise.all(sourceFiles.map(async (file) => [file, await readFile(path.join(root, file), "utf8")])));
const sourceStats = Object.fromEntries(sourceFiles.map((file) => {
  const record = records.find((item) => item.path === file);
  const source = sources[file];
  return [file, {
    bytes: record.bytes,
    lines: record.lines,
    imports: [...source.matchAll(/^import\s.+?from\s+["'](.+?)["'];?$/gm)].map((match) => match[1]),
    registered_tools: [...source.matchAll(/registerTool\(\s*["']([^"']+)["']/g)].map((match) => match[1])
  }];
}));

const functionSets = Object.fromEntries(sourceFiles.slice(0, 3).map((file) => [file, new Set([...sources[file].matchAll(/(?:async\s+)?function\s+([A-Za-z0-9_$]+)/g)].map((match) => match[1]))]));
const duplicatedFunctions = intersections(functionSets);
const testRecords = records.filter((item) => item.category === "tests");
const brittleTextScanTests = [];
for (const record of testRecords) {
  const text = await readFile(path.join(root, record.path), "utf8");
  if (/readFileSync|readFile/.test(text) && /vnem-(?:tools-|precision-)?mcp-server/.test(text) && /\.test\(|\.match\(|includes\(/.test(text)) brittleTextScanTests.push(record.path);
}

const categoryCounts = Object.fromEntries([...new Set(records.map((item) => item.category))].sort().map((category) => {
  const selected = records.filter((item) => item.category === category);
  return [category, { files: selected.length, bytes: selected.reduce((sum, item) => sum + item.bytes, 0) }];
}));
const archives = records.filter((item) => item.category === "generated binary/archive").map((item) => ({
  ...item,
  origin: "scripts/generate-artifacts.mjs",
  reproducibility: "must be verified by fixed SOURCE_DATE_EPOCH generation",
  git_rationale: item.path === "public/install.tgz" ? "public downloadable install artifact" : "deployment mirror of public/install.tgz"
}));
const possibleDead = sourceFiles.slice(0, 3).flatMap((file) => candidateUnreferencedFunctions(file, sources[file])).slice(0, 80);

const audit = {
  schema_version: "1.0.0",
  label,
  captured_at: new Date().toISOString(),
  branch: git(["branch", "--show-current"]),
  head_sha: git(["rev-parse", "HEAD"]),
  tracked_inventory: {
    file_count: records.length,
    total_bytes: records.reduce((sum, item) => sum + item.bytes, 0),
    category_counts: categoryCounts,
    files: records
  },
  architecture: {
    current_shape: "Three stdio MCP server entry files contain transport composition and substantial domain behavior; shared helpers live under scripts/lib; generated install/API/search outputs are committed.",
    server_files: sourceStats,
    major_modules: majorModules(records),
    public_mcp_tools: Object.fromEntries(sourceFiles.slice(0, 3).map((file) => [file, sourceStats[file].registered_tools])),
    monoliths: Object.entries(sourceStats).filter(([, value]) => value.lines > 2500).map(([file, value]) => ({ file, lines: value.lines, bytes: value.bytes })),
    duplicated_function_names: duplicatedFunctions,
    duplicate_sources_of_truth: [
      { areas: [".vnem", "public/install"], status: "generated mirror", risk: "generation order or clock drift creates broad churn" },
      { areas: ["public/install.tgz", "landing/install.tgz"], status: "binary deployment mirror", risk: "manual copy can drift" },
      { areas: ["Tools registerTool blocks", "buildToolCatalog", "tools-readiness-report"], status: "parallel tool metadata", risk: "registration, catalog, and readiness markers can disagree" },
      { areas: ["Core", "Tools", "Precision"], status: "separate transport-local policy and formatting helpers", risk: "contracts and errors can drift" }
    ],
    startup_side_effects: [
      "Tools computes allowed roots and evidence root before transport connection.",
      "Tools loads usable capability packs before transport connection.",
      "Core eagerly imports registry, orchestration, quality, and install modules.",
      "All three servers define tool schemas and handlers in their entry modules."
    ],
    brittle_text_scan_tests: brittleTextScanTests,
    possible_dead_or_unreachable_candidates: {
      caveat: "Heuristic only: function name appears once in its defining server. Review before deletion.",
      candidates: possibleDead
    }
  },
  generated_artifacts: {
    archives,
    generator: "scripts/generate-artifacts.mjs",
    known_churn_trigger: "freshness ordering and generated timestamps depend on the generation clock unless SOURCE_DATE_EPOCH is fixed"
  },
  implementation_findings: [
    { priority: 0, finding: "Core and Tools entry files are 6k+ and 8k+ lines; registration, handlers, policy, and formatting are coupled.", action: "Introduce shared runtime contracts and authoritative registries before adding domain families." },
    { priority: 0, finding: "Tools metadata is represented in registration blocks, buildToolCatalog, statusObject, and readiness regexes.", action: "Make one registry authoritative and derive manifest/readiness from it." },
    { priority: 0, finding: "Precision is a separate server with overlapping patch, command, docs, and verification policy.", action: "Move implementation into Tools modules and retain a compatibility shim." },
    { priority: 1, finding: `${brittleTextScanTests.length} tests infer behavior partly by scanning server source text.`, action: "Keep source guards only for static invariants and move behavior proof through SDK calls." },
    { priority: 1, finding: "Generated mirrors and archives have multiple committed destinations.", action: "Add one deterministic generation manifest and verify all destinations in one command." },
    { priority: 1, finding: "Client adoption emits profiles but has no unified detect/setup/backup/rollback command.", action: "Build vnem setup with explicit preview, backup, validation, and rollback." },
    { priority: 1, finding: "Current entrypoint routing covers generic repo/code/browser/GitHub/Cloudflare work but lacks dedicated Windows, game, Roblox, package, database, API, and skill execution routes.", action: "Implement behavior-backed domain modules and add them to the authoritative registry." },
    { priority: 2, finding: "Repeated deep source scans parse the large Tools entry file and test corpus per call.", action: "Cache immutable indexes by file metadata and lazy-load heavy modules." }
  ],
  boundaries_and_gaps: {
    unsafe_or_unclear: ["environment-variable policy is distributed", "evidence writes occur from read-oriented intelligence tools", "runtime error shapes vary by handler"],
    behavior_not_fully_proven: ["18 Tools are weakly tested in the live MCP surface audit", "real client config mutation and rollback", "approved external API execution across providers", "database work", "Windows/game/Roblox structural intelligence"],
    high_value_refactor_targets: ["tool registry", "MCP result/error contract", "permission engine", "Core planner modules", "Tools domain modules", "Precision compatibility adapter"]
  }
};

await mkdir(outputDir, { recursive: true });
await writeFile(path.join(outputDir, "repository-audit.json"), `${JSON.stringify(audit, null, 2)}\n`);
await writeFile(path.join(outputDir, "repository-audit.md"), markdown(audit));
console.log(`VNEM GIGA ${label} repository audit`);
console.log(`tracked=${records.length}; bytes=${audit.tracked_inventory.total_bytes}; categories=${Object.keys(categoryCounts).length}`);
console.log(`monoliths=${audit.architecture.monoliths.length}; brittle_tests=${brittleTextScanTests.length}; tool_surfaces=${sourceFiles.slice(0, 3).map((file) => sourceStats[file].registered_tools.length).join("/")}`);
console.log(`output=${path.relative(root, outputDir)}`);

function classify(value) {
  const file = slash(value);
  const name = path.posix.basename(file);
  if (/\.tgz$|\.(?:png|jpe?g|gif|ico|woff2?)$/i.test(file)) return "generated binary/archive";
  if (/^(?:scripts\/test-|dashboard\/src\/.+\/__tests__\/|fixtures\/)|(?:^|\/)test[^/]*\.(?:mjs|js|ts|tsx)$/i.test(file)) return "tests";
  if (/^\.vnem\/install-adoption\/|^public\/install\/install-adoption\//.test(file)) return "client/install profiles";
  if (/^\.github\/workflows\/|wrangler|_headers|_redirects|functions\//i.test(file)) return "deployment";
  if (/^fixtures\//.test(file)) return "fixtures";
  if (/^docs\/|^README\.md$|^SECURITY|^LICENSE|\.md$/i.test(file)) return "documentation";
  if (/^dashboard\/|ARD/i.test(file)) return "dashboard/ARD";
  if (/^public\/install\/|^public\/api\/|^\.vnem\/|^llms(?:-full)?\.txt$|^AGENTS\.md$/i.test(file)) return "generated text";
  if (/^public\/|^landing\//.test(file)) return "website/public assets";
  if (/registry|catalog|capabilit|source-radar|search-index|coding-playbooks|prompt-patterns|task-rubrics/i.test(file)) return "registry/capability data";
  if (/^(?:package(?:-lock)?\.json|\.gitignore|\.npmrc|.*config\.(?:js|mjs|ts|json)|tsconfig.*\.json)$/i.test(name) || /^\.github\//.test(file)) return "configuration";
  if (/^\.(?:tmp|hermes|ard)\/|run-history|session.*\.json$/i.test(file)) return "runtime state that should not be tracked";
  if (/\.(?:mjs|js|jsx|ts|tsx|css|html|json)$/i.test(file)) return "primary source";
  return "obsolete or suspicious duplication";
}

function isBinary(file, bytes) {
  if (/\.tgz$|\.(?:png|jpe?g|gif|ico|woff2?)$/i.test(file)) return true;
  return bytes.subarray(0, 8_000).includes(0);
}

function majorModules(items) {
  const roots = new Map();
  for (const item of items) {
    const key = item.path.split("/").slice(0, item.path.startsWith("scripts/lib/") ? 2 : 1).join("/");
    const current = roots.get(key) || { files: 0, bytes: 0 };
    current.files += 1;
    current.bytes += item.bytes;
    roots.set(key, current);
  }
  return Object.fromEntries([...roots.entries()].sort((a, b) => b[1].bytes - a[1].bytes));
}

function intersections(sets) {
  const files = Object.keys(sets);
  const output = [];
  for (let left = 0; left < files.length; left += 1) {
    for (let right = left + 1; right < files.length; right += 1) {
      const names = [...sets[files[left]]].filter((name) => sets[files[right]].has(name));
      if (names.length) output.push({ files: [files[left], files[right]], functions: names.sort() });
    }
  }
  return output;
}

function candidateUnreferencedFunctions(file, source) {
  const names = [...source.matchAll(/(?:async\s+)?function\s+([A-Za-z0-9_$]+)/g)].map((match) => match[1]);
  return names.filter((name) => (source.match(new RegExp(`\\b${name}\\b`, "g")) || []).length === 1).map((name) => ({ file, function: name }));
}

function markdown(report) {
  const categories = Object.entries(report.tracked_inventory.category_counts).map(([name, value]) => `| ${name} | ${value.files} | ${value.bytes} |`).join("\n");
  const monoliths = report.architecture.monoliths.map((item) => `- \`${item.file}\`: ${item.lines} lines, ${item.bytes} bytes`).join("\n");
  const findings = report.implementation_findings.map((item) => `- P${item.priority}: ${item.finding} Next: ${item.action}`).join("\n");
  return `# VNEM GIGA Baseline Repository Audit\n\nCaptured from \`${report.head_sha}\` on \`${report.branch}\`.\n\n## Inventory\n\n| Category | Files | Bytes |\n| --- | ---: | ---: |\n${categories}\n\n## Current Architecture\n\n${report.architecture.current_shape}\n\n### Monoliths\n\n${monoliths}\n\n### Findings That Feed Implementation\n\n${findings}\n\n## Proof Boundaries\n\n- The JSON companion classifies every path returned by \`git ls-files\` and preserves checksums.\n- Dead-code entries are heuristic review candidates, not deletion proof.\n- Generated archives require the separate deterministic generation check.\n- Capability quality and latency are measured by the SDK benchmark and performance artifacts.\n`;
}

function slash(value) { return value.replace(/\\/g, "/"); }
function git(args) { return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim(); }
