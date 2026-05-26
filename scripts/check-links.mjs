import path from "node:path";
import { ROOT, readEntries, writeJson } from "./lib/registry.mjs";

const strict = process.argv.includes("--strict");
const timeoutMs = Number(process.env.LINK_CHECK_TIMEOUT_MS ?? 8000);
const concurrency = Number(process.env.LINK_CHECK_CONCURRENCY ?? 8);
const entries = await readEntries();

async function checkUrl(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal
    });

    if (response.status === 405 || response.status === 403) {
      const getResponse = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal
      });
      return { ok: getResponse.ok, status: getResponse.status };
    }

    return { ok: response.ok, status: response.status };
  } catch (error) {
    return { ok: false, error: error.name === "AbortError" ? "timeout" : error.message };
  } finally {
    clearTimeout(timeout);
  }
}

const checks = [];
for (const item of entries) {
  const entry = item.entry;
  const urls = [...new Set([
    entry.homepage_url,
    entry.repo_url,
    ...entry.package_urls,
    ...entry.source_urls
  ].filter(Boolean))];

  for (const url of urls) {
    checks.push({ slug: entry.slug, url });
  }
}

const results = [];
let cursor = 0;

async function worker() {
  while (cursor < checks.length) {
    const current = checks[cursor];
    cursor += 1;
    const result = await checkUrl(current.url);
    const record = { ...current, ...result };
    results.push(record);
    const marker = result.ok ? "ok" : "warn";
    console.log(`${marker} ${current.slug} ${current.url} ${result.status ?? result.error ?? ""}`);
  }
}

await Promise.all(Array.from({ length: Math.min(concurrency, checks.length) }, worker));

const report = {
  generated_at: new Date().toISOString(),
  checked: results.length,
  failures: results.filter((result) => !result.ok),
  results
};

await writeJson(path.join(ROOT, "discovery", "candidates", "link-report.json"), report);

if (strict && report.failures.length > 0) {
  console.error(`Link check failed for ${report.failures.length} URL(s).`);
  process.exit(1);
}

console.log(`Link check completed with ${report.failures.length} warning(s).`);
