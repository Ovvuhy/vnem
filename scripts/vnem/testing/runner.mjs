#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TestingCiError, TestingCiRuntime } from "./runtime.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..", "..", "..");
const args = parseArgs(process.argv.slice(2));
const tier = String(args.tier || "affected");
const runtime = new TestingCiRuntime({ allowedRoots: [root], evidenceRoot: path.join(root, ".vnem", "test-runs") });

try {
  const report = await runtime.run({
    root,
    tier,
    base: args.base || process.env.VNEM_TEST_BASE_SHA,
    changed_files: listArg(args.changed),
    max_parallel: numberArg(args["max-parallel"] || process.env.VNEM_TEST_MAX_PARALLEL),
    timeout_ms: numberArg(args.timeout),
    max_output_bytes: numberArg(args["max-output-bytes"]),
    continue_on_failure: args["continue-on-failure"] === true,
    dry_run: args.plan === true,
    approved: true,
    approval_note: "repository-owned tiered test runner",
    report_path: args.report,
    summary_path: args.summary
  }, progress);

  if (report.executed === false) {
    console.log(`VNEM test plan: tier=${report.tier} tasks=${report.task_count} max_parallel=${report.max_parallel}`);
    for (const task of report.tasks) console.log(`- stage ${task.stage} ${task.script} resources=${task.resources.join(",") || "isolated"}`);
  } else {
    console.log(`VNEM test ${report.status}: ${report.counts.passed}/${report.counts.planned} passed in ${(report.duration_ms / 1000).toFixed(2)}s`);
    console.log(`Machine report: ${report.report_path}`);
    console.log(`Human summary: ${report.summary_path}`);
    if (report.slowest_tests.length) console.log(`Slowest: ${report.slowest_tests.slice(0, 5).map((item) => `${item.script} ${(item.duration_ms / 1000).toFixed(2)}s`).join("; ")}`);
    if (report.failure_groups.length) console.error(`Failures: ${report.failure_groups.map((group) => `${group.classification}=[${group.scripts.join(",")}]`).join("; ")}`);
    if (report.status !== "passed") process.exitCode = 1;
  }
} catch (error) {
  const code = error instanceof TestingCiError ? error.code : "test_runner_unexpected_error";
  console.error(`VNEM test runner failed (${code}): ${error.message || String(error)}`);
  if (error.details && Object.keys(error.details).length) console.error(JSON.stringify(error.details));
  process.exitCode = 1;
}

function progress(event) {
  if (event.type === "run_start") console.log(`[0/${event.total}] ${event.tier} started with max_parallel=${event.max_parallel}`);
  if (event.type === "task_start") console.log(`[${event.completed}/${event.total}] START ${event.script}`);
  if (event.type === "task_finish") console.log(`[${event.completed}/${event.total}] ${event.status.toUpperCase()} ${event.script} ${(event.duration_ms / 1000).toFixed(2)}s`);
}

function parseArgs(values) {
  const result = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) continue;
    const [rawKey, inline] = value.slice(2).split(/=(.*)/s, 2);
    if (inline !== undefined) result[rawKey] = inline;
    else if (values[index + 1] && !values[index + 1].startsWith("--")) result[rawKey] = values[++index];
    else result[rawKey] = true;
  }
  return result;
}

function listArg(value) {
  if (!value) return [];
  return String(value).split(",").map((item) => item.trim()).filter(Boolean);
}

function numberArg(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}
