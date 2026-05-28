import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ROOT } from "./registry.mjs";

const DEFAULT_ROUTES = ["github-search", "github-releases", "npm-search", "hacker-news", "mcp-registry", "watch-urls", "reddit"];
const TIMER_UNITS = [
  { id: "hourly", timer: "hermes-hourly.timer", service: "hermes-hourly.service" },
  { id: "daily", timer: "hermes-daily.timer", service: "hermes-daily.service" },
  { id: "brain", timer: "hermes-brain.timer", service: "hermes-brain.service" }
];

export async function buildHermesDashboardSummary(options = {}) {
  const rootDir = options.rootDir ?? process.env.VNEM_REPO_DIR ?? ROOT;
  const now = options.now ?? new Date();
  const reports = await readCandidateReports(rootDir);
  const latestReport = reports.at(-1) ?? null;
  const findings = latestFindings(reports, now);
  const errors = latestErrors(reports);
  const sourceHealth = buildSourceHealth(reports);

  return redactDeep({
    generated_at: now.toISOString(),
    repo_status: repoStatus(rootDir, options.runCommand),
    timers: await timerStatus(options.systemctlShow),
    runs: reports.slice(-12).reverse().map(runSummary),
    findings,
    aggregates: buildAggregates(findings, now),
    errors,
    source_health: sourceHealth,
    digest: await digestSummary(rootDir, latestReport)
  });
}

export async function readCandidateReports(rootDir) {
  const candidatesDir = path.join(rootDir, "discovery", "candidates");
  if (!existsSync(candidatesDir)) return [];

  const files = (await readdir(candidatesDir))
    .filter((file) => file.endsWith(".json"))
    .sort();
  const reports = [];

  for (const file of files) {
    try {
      const report = JSON.parse(await readFile(path.join(candidatesDir, file), "utf8"));
      if (!Array.isArray(report.candidates)) continue;
      reports.push({
        file,
        generated_at: report.generated_at ?? null,
        mode: report.mode ?? inferModeFromFile(file),
        source_routes: report.source_routes ?? [],
        candidates: report.candidates ?? [],
        watched_sources: report.watched_sources ?? [],
        errors: report.errors ?? []
      });
    } catch {
      reports.push({
        file,
        generated_at: null,
        mode: inferModeFromFile(file),
        source_routes: [],
        candidates: [],
        watched_sources: [],
        errors: [{ route: "candidate-report", file, error: "invalid-json" }]
      });
    }
  }

  return reports.sort((a, b) => String(a.generated_at ?? a.file).localeCompare(String(b.generated_at ?? b.file)));
}

export function redactDeep(value) {
  if (Array.isArray(value)) return value.map(redactDeep);
  if (!value || typeof value !== "object") return redactScalar(value);

  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      /token|secret|password|api[_-]?key|authorization/i.test(key) ? "[redacted]" : redactDeep(child)
    ])
  );
}

function redactScalar(value) {
  if (typeof value !== "string") return value;
  return value
    .replace(/\b(sk-or-v1-[a-z0-9_-]{12,})\b/gi, "[redacted-openrouter-key]")
    .replace(/\b(gh[pousr]_[A-Za-z0-9_]{24,})\b/g, "[redacted-github-token]")
    .replace(/\b([A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|API_KEY)[A-Z0-9_]*=)[^\s]+/gi, "$1[redacted]")
    .slice(0, 1200);
}

function latestFindings(reports, now) {
  return reports
    .slice(-8)
    .flatMap((report) => report.candidates.map((candidate) => findingRow(candidate, report, now)))
    .filter(Boolean)
    .sort((a, b) => String(b.generated_at ?? "").localeCompare(String(a.generated_at ?? "")) || a.title.localeCompare(b.title))
    .slice(0, 200);
}

function findingRow(candidate, report, now) {
  const generatedAt = candidate.generated_at ?? report.generated_at ?? null;
  return {
    id: stableId(candidate, report),
    generated_at: generatedAt,
    age_hours: generatedAt ? Math.max(0, Math.round((now.getTime() - new Date(generatedAt).getTime()) / 36_000) / 100) : null,
    report_mode: report.mode,
    source_route: candidate.source_route ?? "unknown",
    title: candidate.title ?? candidate.name ?? "Untitled finding",
    name: candidate.name ?? null,
    description: candidate.description ?? null,
    source_url: candidate.source_url ?? candidate.repo_url ?? candidate.homepage_url ?? null,
    suggested_trust_tier: candidate.suggested_trust_tier ?? "unreviewed",
    risk_flags: candidate.risk_flags ?? [],
    repository_review: safeRepositoryReview(candidate.repository_review),
    recommended_action: candidate.recommended_action ?? candidate.reason ?? "review",
    reason: candidate.reason ?? "candidate",
    signal_summary: candidate.signal_summary ?? null,
    metrics: safeMetrics(candidate.metrics ?? {})
  };
}

function safeMetrics(metrics) {
  return {
    stars: numberOrNull(metrics.stars),
    forks: numberOrNull(metrics.forks),
    points: numberOrNull(metrics.points),
    comments: numberOrNull(metrics.comments),
    score: numberOrNull(metrics.score),
    npm_score: numberOrNull(metrics.npm_score),
    license: metrics.license ?? null,
    version: metrics.version ?? metrics.release_tag ?? null,
    updated_at: metrics.updated_at ?? metrics.pushed_at ?? metrics.release_published_at ?? metrics.created_at ?? null,
    language: metrics.language ?? null,
    repo_risk_score: numberOrNull(metrics.repo_risk_score),
    repo_trust_score: numberOrNull(metrics.repo_trust_score),
    repo_verdict: metrics.repo_verdict ?? null
  };
}

function safeRepositoryReview(review) {
  if (!review || typeof review !== "object") return null;
  return {
    verdict: review.verdict ?? "unknown",
    risk_score: numberOrNull(review.risk_score),
    trust_score: numberOrNull(review.trust_score),
    flags: Array.isArray(review.flags) ? review.flags.slice(0, 20) : [],
    reasons: Array.isArray(review.reasons) ? review.reasons.slice(0, 6) : [],
    reviewed_at: review.reviewed_at ?? null
  };
}

function buildAggregates(findings, now) {
  const route = countBy(findings, "source_route");
  const trust_tier = countBy(findings, "suggested_trust_tier");
  const action = countBy(findings, "recommended_action");
  const risk_flag = {};
  for (const finding of findings) {
    for (const flag of finding.risk_flags ?? []) {
      risk_flag[flag] = (risk_flag[flag] ?? 0) + 1;
    }
  }

  return {
    total_findings: findings.length,
    today: findings.filter((finding) => withinDays(finding.generated_at, now, 1)).length,
    seven_days: findings.filter((finding) => withinDays(finding.generated_at, now, 7)).length,
    by_route: route,
    by_trust_tier: trust_tier,
    by_action: action,
    by_risk_flag: risk_flag
  };
}

function buildSourceHealth(reports) {
  const latest = reports.at(-1);
  const routes = new Set([...DEFAULT_ROUTES, ...(latest?.source_routes ?? [])]);
  const latestErrors = latest?.errors ?? [];
  return [...routes].map((route) => {
    const routeErrors = latestErrors.filter((error) => error.route === route);
    const candidateCount = latest?.candidates?.filter((candidate) => candidate.source_route === route).length ?? 0;
    const watchedCount = route === "watch-urls" ? latest?.watched_sources?.length ?? 0 : 0;
    return {
      route,
      status: routeErrors.length > 0 ? "degraded" : candidateCount > 0 || watchedCount > 0 ? "active" : "quiet",
      candidates: candidateCount,
      watched_sources: watchedCount,
      errors: routeErrors.length
    };
  });
}

function latestErrors(reports) {
  return reports
    .slice(-8)
    .flatMap((report) => (report.errors ?? []).map((error) => ({
      generated_at: report.generated_at,
      report_mode: report.mode,
      route: error.route ?? "unknown",
      source: error.source ?? error.repo ?? error.query ?? error.url ?? error.file ?? null,
      error: error.error ?? "unknown-error"
    })))
    .slice(-80)
    .reverse();
}

function runSummary(report) {
  const fresh = report.candidates.filter((candidate) => candidate.reason !== "already-indexed").length;
  return {
    file: report.file,
    generated_at: report.generated_at,
    mode: report.mode,
    candidates: report.candidates.length,
    fresh_candidates: fresh,
    source_routes: report.source_routes,
    errors: report.errors.length,
    watched_sources: report.watched_sources.length,
    changed_watched_sources: report.watched_sources.filter((source) => source.changed || source.first_seen).length
  };
}

async function digestSummary(rootDir, latestReport) {
  const digestPath = path.join(rootDir, "discovery", "daily-digest.md");
  if (!existsSync(digestPath)) {
    return {
      available: false,
      generated_at: latestReport?.generated_at ?? null,
      excerpt: null,
      maintainer_actions: [],
      brain_pass: "No daily digest found."
    };
  }

  const digest = await readFile(digestPath, "utf8");
  return {
    available: true,
    generated_at: digest.match(/^Generated:\s*(.+)$/m)?.[1] ?? latestReport?.generated_at ?? null,
    excerpt: digest
      .split("\n")
      .filter((line) => line && !line.startsWith("#"))
      .slice(0, 8)
      .join("\n")
      .slice(0, 1200),
    maintainer_actions: sectionLines(digest, "Maintainer Actions").slice(0, 8),
    brain_pass: latestReport?.mode === "daily"
      ? "Latest daily run produced the current digest."
      : "Brain pass status is tracked by the hermes-brain timer."
  };
}

async function timerStatus(systemctlShow = defaultSystemctlShow) {
  const timers = {};

  for (const unit of TIMER_UNITS) {
    const timer = parseSystemctlProperties(await safeSystemctlShow(systemctlShow, unit.timer));
    const service = parseSystemctlProperties(await safeSystemctlShow(systemctlShow, unit.service));
    timers[unit.id] = {
      timer_unit: unit.timer,
      service_unit: unit.service,
      active_state: timer.ActiveState ?? "unknown",
      sub_state: timer.SubState ?? "unknown",
      next: timer.NextElapseUSecRealtime ?? null,
      last_trigger: timer.LastTriggerUSecRealtime ?? service.InactiveExitTimestamp ?? null,
      service_state: service.ActiveState ?? "unknown",
      service_result: service.Result ?? "unknown",
      last_exit_status: service.ExecMainStatus ?? null
    };
  }

  return timers;
}

async function safeSystemctlShow(systemctlShow, unit) {
  try {
    return await systemctlShow(unit);
  } catch {
    return "";
  }
}

function defaultSystemctlShow(unit) {
  const result = spawnSync("systemctl", [
    "show",
    unit,
    "--property=ActiveState,SubState,NextElapseUSecRealtime,LastTriggerUSecRealtime,Result,ExecMainStatus,InactiveExitTimestamp"
  ], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"]
  });
  return result.status === 0 ? result.stdout : "";
}

function repoStatus(rootDir, runCommand = defaultRunCommand) {
  const status = runCommand("git", ["status", "--porcelain"], rootDir);
  const branch = runCommand("git", ["branch", "--show-current"], rootDir).trim();
  const revision = runCommand("git", ["rev-parse", "--short", "HEAD"], rootDir).trim();
  return {
    branch: branch || null,
    revision: revision || null,
    dirty_files: status ? status.split(/\r?\n/).filter(Boolean).length : 0,
    clean: !status
  };
}

function defaultRunCommand(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"]
  });
  return result.status === 0 ? result.stdout : "";
}

function parseSystemctlProperties(text) {
  return Object.fromEntries(
    String(text ?? "")
      .split(/\r?\n/)
      .filter((line) => line.includes("="))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1)];
      })
  );
}

function sectionLines(markdown, heading) {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (start === -1) return [];
  const collected = [];
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith("## ")) break;
    const cleaned = line.replace(/^-\s*/, "").trim();
    if (cleaned) collected.push(cleaned);
  }
  return collected;
}

function countBy(items, field) {
  const counts = {};
  for (const item of items) {
    const key = item[field] ?? "unknown";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function withinDays(value, now, days) {
  if (!value) return false;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return false;
  return now.getTime() - time <= days * 24 * 60 * 60 * 1000;
}

function stableId(candidate, report) {
  return [
    report.file,
    candidate.source_route,
    candidate.name,
    candidate.source_url ?? candidate.repo_url
  ].filter(Boolean).join("::");
}

function inferModeFromFile(file) {
  return file.includes("deep") ? "daily" : "hourly";
}

function numberOrNull(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}
