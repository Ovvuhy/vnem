#!/usr/bin/env node
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArg } from "./mcp-client.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const label = parseArg("label", "baseline");
const reportPath = path.join(root, ".vnem", "giga-evolution", label, "performance.json");
const report = JSON.parse(await readFile(reportPath, "utf8"));
const tempEntries = await readdir(path.join(root, ".tmp")).catch(() => []);
report.suites.full_test = {
  duration_ms: numberOrNull(process.env.VNEM_GIGA_FULL_TEST_MS),
  status: process.env.VNEM_GIGA_FULL_TEST_STATUS || "not_measured",
  warning_summary: process.env.VNEM_GIGA_FULL_TEST_WARNINGS || "none observed",
  source: process.env.VNEM_GIGA_FULL_TEST_SOURCE || "local npm test"
};
report.flaky_or_cleanup_observations.temp_entry_count = tempEntries.length;
report.flaky_or_cleanup_observations.temp_entries_sample = tempEntries.slice(0, 40);
report.flaky_or_cleanup_observations.known_warning = process.env.VNEM_GIGA_FULL_TEST_WARNINGS || "none observed in captured output";
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Recorded ${label} full test: ${report.suites.full_test.status} in ${report.suites.full_test.duration_ms}ms`);

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) && value !== "" ? number : null;
}
