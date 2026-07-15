#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..", "..", "..");
const baseline = await readJson(".vnem/giga-evolution/baseline/performance.json");
const affected = await readJson(".vnem/giga-evolution/phase-9/affected-suite-report.json");
const full = await readJson(".vnem/giga-evolution/phase-9/full-suite-report.json");

assertPassed("affected", affected);
assertPassed("full", full);

const baselineMs = Number(baseline.suites?.full_test?.duration_ms);
const fullMs = Number(full.duration_ms);
const affectedMs = Number(affected.duration_ms);
if (![baselineMs, fullMs, affectedMs].every(Number.isFinite)) throw new Error("Benchmark reports are missing numeric duration evidence.");

const fullReductionPercent = percent((baselineMs - fullMs) / baselineMs);
const affectedOfFullPercent = percent(affectedMs / fullMs);
const report = {
  schema_version: "1.0.0",
  label: "phase-9",
  phase: 9,
  captured_at: full.finished_at,
  benchmark_type: "tiered_test_runner_real_execution",
  methodology: {
    baseline_source: ".vnem/giga-evolution/baseline/performance.json",
    full_source: ".vnem/giga-evolution/phase-9/full-suite-report.json",
    affected_source: ".vnem/giga-evolution/phase-9/affected-suite-report.json",
    same_machine_and_checkout_family: true,
    fixed_generation_epoch: "2026-07-08T21:12:40.970Z",
    retries_used: full.retries?.attempted || affected.retries?.attempted || 0
  },
  suites: {
    full_test: suiteEvidence(full),
    affected_test: suiteEvidence(affected)
  },
  baseline_comparison: {
    baseline_full_duration_ms: baselineMs,
    phase_9_full_duration_ms: fullMs,
    full_duration_reduction_percent: fullReductionPercent,
    full_speedup_factor: Number((baselineMs / fullMs).toFixed(2)),
    affected_duration_ms: affectedMs,
    affected_as_percent_of_phase_9_full: affectedOfFullPercent,
    full_at_least_30_percent_faster: fullReductionPercent >= 30,
    affected_below_25_percent_of_full: affectedOfFullPercent < 25
  },
  reliability: {
    full_failure_groups: full.failure_groups,
    full_flaky_indicators: full.flaky_indicators,
    affected_flaky_indicators: affected.flaky_indicators,
    full_cleanup_warnings: full.reliability?.cleanup_warnings || [],
    shared_resource_conflicts_prevented: full.reliability?.resource_conflicts_prevented === true
  },
  limitations: [
    "The baseline and Phase 9 runs are from the same machine and checkout family but not the same commit or day.",
    "VNEM repository line coverage is not claimed because no top-level coverage report exists.",
    "Static affected selection cannot prove runtime-only framework resolution without an integration boundary."
  ]
};

await writeFile(path.join(root, ".vnem", "giga-evolution", "phase-9", "performance.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`Phase 9 performance: full ${fullMs} ms (${fullReductionPercent}% faster); affected ${affectedMs} ms (${affectedOfFullPercent}% of full).`);

async function readJson(relative) {
  return JSON.parse(await readFile(path.join(root, relative), "utf8"));
}

function assertPassed(label, report) {
  if (report.status !== "passed" || report.counts?.failed !== 0 || report.counts?.skipped !== 0) {
    throw new Error(`${label} test report is not a complete pass.`);
  }
}

function suiteEvidence(report) {
  return {
    duration_ms: report.duration_ms,
    status: report.status,
    planned: report.counts.planned,
    passed: report.counts.passed,
    failed: report.counts.failed,
    skipped: report.counts.skipped,
    retries: report.retries?.attempted || 0,
    flaky_indicators: report.flaky_indicators?.length || 0
  };
}

function percent(value) {
  return Number((value * 100).toFixed(2));
}
