#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { callTimed, connectMcp, metricSummary, parseArg } from "./mcp-client.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const label = parseArg("label", "baseline");
const runs = Math.max(3, Number(parseArg("runs", "5")) || 5);
const outputDir = path.join(root, ".vnem", "giga-evolution", label);
const generatedAt = JSON.parse(await readFile(path.join(root, "public", "api", "index.json"), "utf8")).generated_at;
const generationEnv = { ...process.env, SOURCE_DATE_EPOCH: process.env.SOURCE_DATE_EPOCH || generatedAt };
const servers = [
  { id: "core", file: "scripts/vnem-mcp-server.mjs", entrypoint: ["vnem_entrypoint", { user_goal: "Map this repository and choose a safe implementation path.", available_mcp_names: ["vnem", "vnem-tools"], task_mode: "repo_inspection" }] },
  { id: "tools", file: "scripts/vnem-tools-mcp-server.mjs", entrypoint: ["vnem_tools_entrypoint", { user_goal: "Map this repository and choose a safe implementation path.", root, task_mode: "repo_inspection" }] },
  { id: "precision", file: "scripts/vnem-precision-mcp-server.mjs", entrypoint: null }
];
const serverMetrics = {};

for (const server of servers) {
  const samples = [];
  for (let index = 0; index < runs; index += 1) {
    const started = performance.now();
    const connection = await connectMcp({ root, serverFile: server.file, name: `giga-perf-${server.id}-${index}` });
    const connectedMs = performance.now() - started;
    const manifestStart = performance.now();
    const manifest = await connection.client.listTools();
    const manifestMs = performance.now() - manifestStart;
    const entrypoint = server.entrypoint ? await callTimed(connection.client, server.entrypoint[0], server.entrypoint[1]) : null;
    const memoryBytes = readProcessMemory(connection.transport._process?.pid);
    samples.push({
      startup_ms: Number(connectedMs.toFixed(2)),
      manifest_ms: Number(manifestMs.toFixed(2)),
      entrypoint_ms: entrypoint?.latency_ms ?? null,
      entrypoint_output_bytes: entrypoint?.output_bytes ?? null,
      idle_working_set_bytes: memoryBytes,
      tool_count: manifest.tools.length,
      stderr: connection.stderr()
    });
    await connection.close();
  }
  serverMetrics[server.id] = {
    file: server.file,
    samples,
    startup: metricSummary(samples.map((item) => item.startup_ms)),
    manifest: metricSummary(samples.map((item) => item.manifest_ms)),
    entrypoint: metricSummary(samples.map((item) => item.entrypoint_ms)),
    entrypoint_output_bytes: numericSummary(samples.map((item) => item.entrypoint_output_bytes)),
    idle_working_set_bytes: numericSummary(samples.map((item) => item.idle_working_set_bytes)),
    tool_count: samples[0]?.tool_count || 0
  };
}

const tools = await connectMcp({ root, serverFile: "scripts/vnem-tools-mcp-server.mjs", name: "giga-perf-representative-tools" });
const representative = { code_search: [], workspace_map: [], install_doctor: [] };
let coverage = null;
try {
  for (let index = 0; index < runs; index += 1) {
    representative.code_search.push(await callTimed(tools.client, "vnem_tools_code_search", { root, query: "registerTool", file_globs: ["scripts/*.mjs"], max_results: 30 }));
    representative.workspace_map.push(await callTimed(tools.client, "vnem_tools_workspace_map", { root, max_depth: 4, max_files: 500 }));
    representative.install_doctor.push(await callTimed(tools.client, "vnem_tools_install_doctor", { root, emit: false }));
  }
  coverage = await callTimed(tools.client, "vnem_tools_tool_test_coverage_map", { root, max_tools: 160 });
} finally {
  await tools.close();
}

const focusedTest = runCommand(process.execPath, ["scripts/test-tools-mcp-server.mjs"]);
const firstGeneration = runCommand(process.execPath, ["scripts/generate-artifacts.mjs"], generationEnv);
const firstHashes = await generatedHashes();
const secondGeneration = runCommand(process.execPath, ["scripts/generate-artifacts.mjs"], generationEnv);
const secondHashes = await generatedHashes();
const tempEntries = await safeDirectoryEntries(path.join(root, ".tmp"));
const toolsSource = await readFile(path.join(root, "scripts", "vnem-tools-mcp-server.mjs"), "utf8");
const coverageSummary = coverage?.structured?.tool_test_coverage_map?.coverage_summary || coverage?.structured?.coverage_summary || null;

const report = {
  schema_version: "1.0.0",
  label,
  captured_at: new Date().toISOString(),
  branch: git(["branch", "--show-current"]),
  head_sha: git(["rev-parse", "HEAD"]),
  methodology: {
    runs,
    cold_process_per_startup_sample: true,
    same_machine_and_checkout: true,
    generation_clock: generationEnv.SOURCE_DATE_EPOCH,
    full_test_measurement_source: process.env.VNEM_GIGA_FULL_TEST_SOURCE || "not run by this sampler"
  },
  servers: serverMetrics,
  representative_calls: Object.fromEntries(Object.entries(representative).map(([name, samples]) => [name, {
    latency: metricSummary(samples.map((item) => item.latency_ms)),
    output_bytes: numericSummary(samples.map((item) => item.output_bytes)),
    errors: samples.filter((item) => item.is_error).length
  }])),
  suites: {
    full_test: {
      duration_ms: numberOrNull(process.env.VNEM_GIGA_FULL_TEST_MS),
      status: process.env.VNEM_GIGA_FULL_TEST_STATUS || "not_measured",
      warning_summary: process.env.VNEM_GIGA_FULL_TEST_WARNINGS || "not captured"
    },
    focused_tools_mcp: focusedTest
  },
  generation: {
    first: firstGeneration,
    second: secondGeneration,
    deterministic: JSON.stringify(firstHashes) === JSON.stringify(secondHashes),
    checksums: secondHashes
  },
  tool_surface: {
    registration_count: (toolsSource.match(/registerTool\(/g) || []).length,
    handler_count: (toolsSource.match(/registerTool\(/g) || []).length,
    behavior_tested_count: coverageSummary?.behavior_tested ?? 113,
    registration_only_or_weak_count: coverageSummary?.weak_or_missing ?? 18,
    count_source: coverageSummary ? "live MCP coverage map" : "last verified Phase 0 MCP audit fallback"
  },
  flaky_or_cleanup_observations: {
    temp_entry_count: tempEntries.length,
    temp_entries_sample: tempEntries.slice(0, 40),
    known_warning: process.env.VNEM_GIGA_FULL_TEST_WARNINGS || "Prior Phase 0 run observed EBUSY cleanup for .tmp/tools-project-actions-TX47JM; baseline full test must confirm current state."
  }
};

await mkdir(outputDir, { recursive: true });
await writeFile(path.join(outputDir, "performance.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(`VNEM GIGA ${label} performance baseline`);
for (const [name, value] of Object.entries(serverMetrics)) console.log(`${name}: startup median=${value.startup.median_ms}ms worst=${value.startup.worst_ms}ms tools=${value.tool_count}`);
console.log(`generation deterministic=${report.generation.deterministic}; focused_test=${focusedTest.status}`);
console.log(`output=${path.relative(root, path.join(outputDir, "performance.json"))}`);

function runCommand(command, args, env = process.env) {
  const started = performance.now();
  const result = spawnSync(command, args, { cwd: root, env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, windowsHide: true });
  return {
    status: result.status === 0 ? "pass" : "fail",
    exit_code: result.status,
    duration_ms: Number((performance.now() - started).toFixed(2)),
    warning_lines: `${result.stdout || ""}\n${result.stderr || ""}`.split(/\r?\n/).filter((line) => /warn|EBUSY|failed to remove|cleanup/i.test(line)).slice(0, 30)
  };
}

async function generatedHashes() {
  const files = ["public/install.tgz", "landing/install.tgz", "public/api/index.json", ".vnem/search-index.json", "llms.txt", "llms-full.txt"];
  return Object.fromEntries(await Promise.all(files.map(async (file) => [file, createHash("sha256").update(await readFile(path.join(root, file))).digest("hex")])));
}

function readProcessMemory(pid) {
  if (!pid) return null;
  try {
    if (process.platform === "win32") {
      const powershell = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
      return Number(execFileSync(powershell, ["-NoProfile", "-Command", `(Get-Process -Id ${pid}).WorkingSet64`], { encoding: "utf8", windowsHide: true }).trim()) || null;
    }
    return Number(execFileSync("ps", ["-o", "rss=", "-p", String(pid)], { encoding: "utf8" }).trim()) * 1024 || null;
  } catch {
    return null;
  }
}

function numericSummary(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return { runs: 0, median: null, worst: null, min: null };
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  return { runs: sorted.length, median: Math.round(median), worst: Math.round(sorted.at(-1)), min: Math.round(sorted[0]) };
}

function numberOrNull(value) { const number = Number(value); return Number.isFinite(number) && value !== "" ? number : null; }
async function safeDirectoryEntries(directory) { try { return await readdir(directory); } catch { return []; } }
function git(args) { return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim(); }
