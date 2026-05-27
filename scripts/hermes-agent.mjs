#!/usr/bin/env node
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { spawnSync } from "node:child_process";
import yaml from "js-yaml";
import { ROOT, readEntries, readJson, writeJson, writeText } from "./lib/registry.mjs";

const args = process.argv.slice(2);
const argSet = new Set(args);

function argValue(name, fallback = null) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  return args[index + 1] ?? fallback;
}

const mode = argValue("--mode", process.env.HERMES_MODE ?? "hourly");
const dryRun = argSet.has("--dry-run") || process.env.HERMES_DRY_RUN === "1";
const createPr = !dryRun && process.env.HERMES_CREATE_PR !== "0";
const gitSync = !dryRun && process.env.HERMES_GIT_SYNC === "1";
const allowDirty = process.env.HERMES_ALLOW_DIRTY === "1";
const baseBranch = process.env.HERMES_BASE_BRANCH ?? "main";
const maxCandidates = Number(process.env.HERMES_MAX_CANDIDATES ?? (mode === "daily" ? 30 : 15));
const lookbackDays = Number(process.env.HERMES_LOOKBACK_DAYS ?? (mode === "daily" ? 7 : 2));
const githubToken = process.env.GITHUB_TOKEN ?? process.env.HERMES_GITHUB_TOKEN ?? null;
const githubRepo = process.env.HERMES_GITHUB_REPO ?? null;
const statePath = path.resolve(ROOT, process.env.HERMES_STATE_PATH ?? ".hermes/state.json");
const proposeRegistry = process.env.HERMES_PROPOSE_REGISTRY === "1";
const registryProposalLimit = Number(process.env.HERMES_REGISTRY_PROPOSAL_LIMIT ?? 3);
const generatedAt = new Date().toISOString();

const userAgent = "vnem-hermes-agent";

function isoDateDaysAgo(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function compact(values) {
  return [...new Set(values.filter(Boolean))];
}

function parseListEnv(name) {
  const raw = process.env[name];
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("[")) return JSON.parse(trimmed);
  return trimmed
    .split(/\r?\n|;/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function envFlag(name, fallback = false) {
  const raw = process.env[name];
  if (raw == null || raw === "") return fallback;
  return !["0", "false", "no", "off"].includes(String(raw).trim().toLowerCase());
}

function normalizeUrl(value) {
  if (!value) return null;
  return String(value).replace(/\/+$/, "").toLowerCase();
}

function repoApiUrl(repo) {
  return `https://api.github.com/repos/${repo}`;
}

function githubHeaders() {
  const headers = {
    accept: "application/vnd.github+json"
  };
  if (githubToken) headers.authorization = `Bearer ${githubToken}`;
  return headers;
}

function slugDate(value = generatedAt) {
  return value.replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
}

function slugify(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/^@/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 86)
    .replace(/-+$/g, "") || "entry";
}

function inferRiskFlags(text, license) {
  const haystack = String(text ?? "").toLowerCase();
  const flags = [];
  if (!license) flags.push("license-not-asserted");
  if (/\b(file|filesystem|browser|database|postgres|mysql|wallet|payment|stripe|repository|github|memory|secret|credential)\b/.test(haystack)) {
    flags.push("sensitive-permissions");
  }
  if (/\balpha|experimental|prototype|demo|hackathon\b/.test(haystack)) flags.push("early-stage");
  return compact(flags);
}

function inferBuilderValue(repo) {
  const text = `${repo.name} ${repo.description ?? ""} ${(repo.topics ?? []).join(" ")}`.toLowerCase();
  if (text.includes("eval") || text.includes("benchmark")) return "May help builders verify agent behavior, regressions, or model/tool quality.";
  if (text.includes("mcp") || text.includes("model context protocol")) return "May expose a useful permissioned tool surface for coding agents.";
  if (text.includes("memory") || text.includes("retrieval")) return "May improve agent context persistence, search, or retrieval workflows.";
  if (text.includes("safety") || text.includes("guardrail") || text.includes("security")) return "May improve review, safety, or permission boundaries for agent systems.";
  if (text.includes("framework") || text.includes("workflow")) return "May affect how builders compose, deploy, or observe agent workflows.";
  return "May be a useful new capability or signal for agent builders to review.";
}

function suggestedTierForRepo(repo, riskFlags) {
  if (riskFlags.includes("early-stage")) return "watchlist";
  if ((repo.stargazers_count ?? 0) >= 500 && repo.license?.spdx_id) return "promising";
  return "unreviewed";
}

function inferEntryType(candidate) {
  const text = `${candidate.name} ${candidate.description ?? ""} ${(candidate.metrics?.topics ?? []).join(" ")}`.toLowerCase();
  if (text.includes("mcp") || text.includes("model context protocol")) return "mcp-server";
  if (text.includes("eval") || text.includes("benchmark")) return "eval";
  if (text.includes("memory") || text.includes("context")) return "memory";
  if (text.includes("payment") || text.includes("wallet") || text.includes("stripe")) return "payments";
  if (text.includes("security") || text.includes("guardrail") || text.includes("safety")) return "security";
  if (text.includes("browser")) return "browser";
  if (text.includes("observability") || text.includes("trace") || text.includes("telemetry")) return "observability";
  if (text.includes("framework") || text.includes("orchestration")) return "agent-framework";
  if (text.includes("coding agent") || text.includes("code agent")) return "coding-agent";
  if (text.includes("database") || text.includes("data")) return "data";
  return "workflow";
}

function inferTags(candidate) {
  const text = `${candidate.name} ${candidate.description ?? ""} ${(candidate.metrics?.topics ?? []).join(" ")}`.toLowerCase();
  const tags = ["agent-tools"];
  const checks = [
    ["mcp", "mcp"],
    ["github", "github"],
    ["browser", "browser"],
    ["search", "search"],
    ["memory", "memory"],
    ["eval", "evals"],
    ["benchmark", "evals"],
    ["security", "security"],
    ["safety", "security"],
    ["payment", "payments"],
    ["wallet", "payments"],
    ["observability", "observability"],
    ["trace", "observability"],
    ["framework", "framework"],
    ["coding", "coding-agent"]
  ];

  for (const [needle, tag] of checks) {
    if (text.includes(needle)) tags.push(tag);
  }

  return compact(tags).slice(0, 8);
}

function inferUseCases(candidate) {
  const type = inferEntryType(candidate);
  const useCases = {
    "mcp-server": "Extend agents with external tools",
    "agent-framework": "Build and orchestrate agent workflows",
    "coding-agent": "Let agents inspect and change repositories",
    eval: "Evaluate agent and LLM behavior",
    memory: "Persist useful context between sessions",
    payments: "Support agent payments and commerce workflows",
    security: "Improve agent security review and guardrails",
    browser: "Let agents work with browser-based workflows",
    observability: "Trace, monitor, or debug agent behavior",
    data: "Connect agents to structured data",
    workflow: "Improve agent workflow design and execution"
  };
  return [useCases[type] ?? "Improve agent workflows"];
}

function inferPermissions(candidate) {
  const text = `${candidate.name} ${candidate.description ?? ""}`.toLowerCase();
  const permissions = ["network"];
  if (text.includes("file") || text.includes("filesystem")) permissions.push("filesystem");
  if (text.includes("database") || text.includes("postgres") || text.includes("mysql")) permissions.push("database");
  if (text.includes("browser")) permissions.push("browser");
  if (text.includes("github") || text.includes("repository")) permissions.push("repository");
  if (text.includes("payment") || text.includes("wallet") || text.includes("stripe")) permissions.push("payments");
  return compact(permissions);
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.HERMES_FETCH_TIMEOUT_MS ?? 15000));

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "user-agent": userAgent,
        accept: "application/json",
        ...(options.headers ?? {})
      }
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}: ${text.slice(0, 200)}`);
    }
    return JSON.parse(text);
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.HERMES_FETCH_TIMEOUT_MS ?? 15000));

  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": userAgent }
    });
    const text = await response.text();
    return { ok: response.ok, status: response.status, text };
  } finally {
    clearTimeout(timeout);
  }
}

async function githubSearchRepositories(query, perPage = 10) {
  const url = new URL("https://api.github.com/search/repositories");
  url.searchParams.set("q", query);
  url.searchParams.set("sort", "updated");
  url.searchParams.set("order", "desc");
  url.searchParams.set("per_page", String(perPage));

  const json = await fetchJson(url, { headers: githubHeaders() });
  return json.items ?? [];
}

async function discoverGitHub(existingKeys) {
  const since = isoDateDaysAgo(lookbackDays);
  const defaultQueries = [
    `topic:mcp pushed:>=${since}`,
    `topic:ai-agent pushed:>=${since}`,
    `topic:llm-agent pushed:>=${since}`,
    `topic:agent-framework pushed:>=${since}`,
    `"model context protocol" pushed:>=${since}`,
    `"agent eval" pushed:>=${since}`,
    `"coding agent" pushed:>=${since}`,
    `"agent memory" pushed:>=${since}`
  ];
  const queries = parseListEnv("HERMES_GITHUB_QUERIES") ?? defaultQueries;
  const perQuery = Math.max(3, Math.ceil(maxCandidates / Math.max(queries.length, 1)));
  const candidates = [];
  const errors = [];

  for (const query of queries) {
    try {
      const repos = await githubSearchRepositories(query, perQuery);
      for (const repo of repos) {
        const repoUrl = normalizeUrl(repo.html_url);
        const text = `${repo.full_name} ${repo.description ?? ""} ${(repo.topics ?? []).join(" ")}`;
        const riskFlags = inferRiskFlags(text, repo.license?.spdx_id);
        const duplicate = existingKeys.has(repo.full_name.toLowerCase()) || existingKeys.has(repoUrl);

        candidates.push({
          source_route: "github-search",
          name: repo.full_name,
          title: repo.name,
          description: repo.description ?? "No repository description supplied.",
          repo_url: repo.html_url,
          homepage_url: repo.homepage || null,
          source_url: repo.html_url,
          source_urls: compact([repo.html_url, repo.homepage]),
          signal_summary: `Matched GitHub search \`${query}\`; pushed ${repo.pushed_at}; stars ${repo.stargazers_count ?? 0}.`,
          why_builders_should_care: inferBuilderValue(repo),
          suggested_trust_tier: duplicate ? "promising" : suggestedTierForRepo(repo, riskFlags),
          risk_flags: riskFlags,
          recommended_action: duplicate ? "already-indexed" : riskFlags.length > 0 ? "watchlist" : "review",
          reason: duplicate ? "already-indexed" : "candidate",
          metrics: {
            stars: repo.stargazers_count ?? 0,
            forks: repo.forks_count ?? 0,
            open_issues: repo.open_issues_count ?? 0,
            language: repo.language ?? null,
            license: repo.license?.spdx_id ?? null,
            created_at: repo.created_at,
            pushed_at: repo.pushed_at,
            topics: repo.topics ?? []
          }
        });
      }
    } catch (error) {
      errors.push({ route: "github-search", query, error: error.message });
    }
  }

  return { candidates, errors };
}

async function discoverGitHubReleases(existingKeys) {
  if (!envFlag("HERMES_INCLUDE_GITHUB_RELEASES", true)) return { candidates: [], errors: [] };

  const defaultRepos = [
    "modelcontextprotocol/modelcontextprotocol",
    "github/github-mcp-server",
    "supabase-community/supabase-mcp",
    "qdrant/mcp-server-qdrant",
    "NousResearch/hermes-agent",
    "cline/cline",
    "RooVetGit/Roo-Code",
    "anthropics/claude-code",
    "microsoft/mcp-gateway",
    "TheLunarCompany/lunar"
  ];
  const repos = parseListEnv("HERMES_RELEASE_REPOS") ?? defaultRepos;
  const candidates = [];
  const errors = [];

  for (const repo of repos) {
    try {
      const repoJson = await fetchJson(repoApiUrl(repo), { headers: githubHeaders() });
      let releaseJson = null;
      try {
        releaseJson = await fetchJson(`${repoApiUrl(repo)}/releases/latest`, { headers: githubHeaders() });
      } catch (error) {
        if (!String(error.message).startsWith("404 ")) throw error;
      }
      const repoUrl = normalizeUrl(repoJson.html_url);
      const duplicate = existingKeys.has(repo.toLowerCase()) || existingKeys.has(repoUrl);
      const text = `${repoJson.full_name} ${repoJson.description ?? ""} ${releaseJson?.name ?? ""} ${releaseJson?.body ?? ""}`;
      const riskFlags = inferRiskFlags(text, repoJson.license?.spdx_id);

      candidates.push({
        source_route: "github-releases",
        name: repoJson.full_name,
        title: releaseJson?.name ? `${repoJson.name}: ${releaseJson.name}` : repoJson.name,
        description: repoJson.description ?? "No repository description supplied.",
        repo_url: repoJson.html_url,
        homepage_url: repoJson.homepage || null,
        source_url: releaseJson?.html_url ?? repoJson.html_url,
        source_urls: compact([releaseJson?.html_url, repoJson.html_url, repoJson.homepage]),
        signal_summary: releaseJson
          ? `Latest GitHub release for watched repository \`${repo}\`; published ${releaseJson.published_at ?? releaseJson.created_at}.`
          : `Watched GitHub repository \`${repo}\` has no latest-release endpoint; repository pushed ${repoJson.pushed_at}.`,
        why_builders_should_care: inferBuilderValue(repoJson),
        suggested_trust_tier: duplicate ? "promising" : "unreviewed",
        risk_flags: riskFlags,
        recommended_action: duplicate ? "already-indexed" : "review",
        reason: duplicate ? "already-indexed" : "candidate",
        allow_registry_proposal: false,
        metrics: {
          stars: repoJson.stargazers_count ?? 0,
          forks: repoJson.forks_count ?? 0,
          open_issues: repoJson.open_issues_count ?? 0,
          language: repoJson.language ?? null,
          license: repoJson.license?.spdx_id ?? null,
          created_at: repoJson.created_at,
          pushed_at: repoJson.pushed_at,
          release_tag: releaseJson?.tag_name ?? null,
          release_published_at: releaseJson?.published_at ?? null,
          topics: repoJson.topics ?? []
        }
      });
    } catch (error) {
      errors.push({ route: "github-releases", repo, error: error.message });
    }
  }

  return { candidates, errors };
}

function normalizeRepositoryLink(value) {
  if (!value) return null;
  if (typeof value === "string") return value.replace(/^git\+/, "").replace(/\.git$/, "");
  if (typeof value === "object" && typeof value.url === "string") {
    return value.url.replace(/^git\+/, "").replace(/\.git$/, "");
  }
  return null;
}

async function discoverNpmPackages(existingKeys) {
  if (!envFlag("HERMES_INCLUDE_NPM", true)) return { candidates: [], errors: [] };

  const defaultQueries = [
    "keywords:mcp server",
    "keywords:agent llm",
    "keywords:coding agent",
    "keywords:model context protocol",
    "mcp server",
    "agent memory",
    "agent eval"
  ];
  const queries = parseListEnv("HERMES_NPM_QUERIES") ?? defaultQueries;
  const perQuery = Number(process.env.HERMES_NPM_PER_QUERY ?? 4);
  const candidates = [];
  const errors = [];

  for (const query of queries) {
    try {
      const url = new URL("https://registry.npmjs.org/-/v1/search");
      url.searchParams.set("text", query);
      url.searchParams.set("size", String(perQuery));
      url.searchParams.set("popularity", "0.25");
      url.searchParams.set("quality", "0.45");
      url.searchParams.set("maintenance", "0.30");

      const json = await fetchJson(url);
      for (const item of json.objects ?? []) {
        const pkg = item.package ?? {};
        const links = pkg.links ?? {};
        const repoUrl = normalizeRepositoryLink(links.repository);
        const npmUrl = links.npm ?? `https://www.npmjs.com/package/${encodeURIComponent(pkg.name)}`;
        const duplicate = existingKeys.has(String(pkg.name ?? "").toLowerCase()) || existingKeys.has(normalizeUrl(repoUrl)) || existingKeys.has(normalizeUrl(npmUrl));
        const text = `${pkg.name ?? ""} ${pkg.description ?? ""} ${(pkg.keywords ?? []).join(" ")}`;
        const riskFlags = inferRiskFlags(text, pkg.license);

        candidates.push({
          source_route: "npm-search",
          name: pkg.name,
          title: pkg.name,
          description: pkg.description ?? "No npm package description supplied.",
          repo_url: repoUrl,
          homepage_url: links.homepage ?? repoUrl ?? npmUrl,
          package_url: npmUrl,
          source_url: npmUrl,
          source_urls: compact([npmUrl, repoUrl, links.homepage, links.bugs]),
          signal_summary: `Matched npm search \`${query}\`; package updated ${pkg.date ?? "unknown date"}.`,
          why_builders_should_care: inferBuilderValue({ name: pkg.name, description: pkg.description, topics: pkg.keywords ?? [] }),
          suggested_trust_tier: duplicate ? "promising" : "unreviewed",
          risk_flags: riskFlags,
          recommended_action: duplicate ? "already-indexed" : riskFlags.length > 0 ? "watchlist" : "review",
          reason: duplicate ? "already-indexed" : "candidate",
          metrics: {
            npm_score: item.score?.final ?? null,
            quality: item.score?.detail?.quality ?? null,
            popularity: item.score?.detail?.popularity ?? null,
            maintenance: item.score?.detail?.maintenance ?? null,
            license: pkg.license ?? null,
            version: pkg.version ?? null,
            updated_at: pkg.date ?? null,
            topics: pkg.keywords ?? []
          }
        });
      }
    } catch (error) {
      errors.push({ route: "npm-search", query, error: error.message });
    }
  }

  return { candidates, errors };
}

async function discoverHackerNews(existingKeys) {
  if (!envFlag("HERMES_INCLUDE_HACKER_NEWS", true)) return { candidates: [], errors: [] };

  const sinceSeconds = Math.floor((Date.now() - lookbackDays * 24 * 60 * 60 * 1000) / 1000);
  const defaultQueries = [
    "model context protocol",
    "coding agent",
    "AI agent framework",
    "agent memory",
    "agent eval",
    "Claude Code",
    "OpenAI Codex"
  ];
  const queries = parseListEnv("HERMES_HN_QUERIES") ?? defaultQueries;
  const perQuery = Number(process.env.HERMES_HN_PER_QUERY ?? 4);
  const candidates = [];
  const errors = [];

  for (const query of queries) {
    try {
      const url = new URL("https://hn.algolia.com/api/v1/search_by_date");
      url.searchParams.set("query", query);
      url.searchParams.set("tags", "story");
      url.searchParams.set("hitsPerPage", String(perQuery));
      url.searchParams.set("numericFilters", `created_at_i>=${sinceSeconds}`);

      const json = await fetchJson(url);
      for (const hit of json.hits ?? []) {
        const discussionUrl = `https://news.ycombinator.com/item?id=${hit.objectID}`;
        const linkedUrl = hit.url ?? null;
        const duplicate = existingKeys.has(normalizeUrl(linkedUrl)) || existingKeys.has(normalizeUrl(discussionUrl));

        candidates.push({
          source_route: "hacker-news",
          name: `hn-${hit.objectID}`,
          title: hit.title ?? hit.story_title ?? "Hacker News story",
          description: "Hacker News discussion surfaced this as an ecosystem lead. Verify against primary sources before promotion.",
          repo_url: linkedUrl?.includes("github.com") ? linkedUrl : null,
          homepage_url: linkedUrl,
          source_url: discussionUrl,
          source_urls: compact([discussionUrl, linkedUrl]),
          signal_summary: `Matched Hacker News query \`${query}\`; created ${hit.created_at}; points ${hit.points ?? 0}; comments ${hit.num_comments ?? 0}.`,
          why_builders_should_care: "May indicate fast-moving builder interest; treat as a lead until backed by an official repo, release, docs page, or paper.",
          suggested_trust_tier: "watchlist",
          risk_flags: compact(["social-signal", duplicate ? null : "needs-primary-source"]),
          recommended_action: duplicate ? "already-indexed" : "watchlist",
          reason: duplicate ? "already-indexed" : "candidate",
          allow_registry_proposal: false,
          metrics: {
            points: hit.points ?? 0,
            comments: hit.num_comments ?? 0,
            created_at: hit.created_at,
            query
          }
        });
      }
    } catch (error) {
      errors.push({ route: "hacker-news", query, error: error.message });
    }
  }

  return { candidates, errors };
}

async function discoverReddit(existingKeys) {
  if (!envFlag("HERMES_INCLUDE_REDDIT", false)) return { candidates: [], errors: [] };

  const defaultSubreddits = ["LocalLLaMA", "ClaudeAI", "ChatGPTCoding", "MachineLearning"];
  const defaultQueries = ["mcp", "coding agent", "agent framework", "agent memory", "agent eval"];
  const subreddits = parseListEnv("HERMES_REDDIT_SUBREDDITS") ?? defaultSubreddits;
  const queries = parseListEnv("HERMES_REDDIT_QUERIES") ?? defaultQueries;
  const perQuery = Number(process.env.HERMES_REDDIT_PER_QUERY ?? 3);
  const candidates = [];
  const errors = [];

  for (const subreddit of subreddits) {
    for (const query of queries) {
      try {
        const url = new URL(`https://www.reddit.com/r/${encodeURIComponent(subreddit)}/search.json`);
        url.searchParams.set("q", query);
        url.searchParams.set("restrict_sr", "1");
        url.searchParams.set("sort", "new");
        url.searchParams.set("t", mode === "daily" ? "week" : "day");
        url.searchParams.set("limit", String(perQuery));
        url.searchParams.set("raw_json", "1");

        const json = await fetchJson(url, { headers: { "user-agent": `${userAgent} reddit-signal-monitor` } });
        for (const child of json.data?.children ?? []) {
          const post = child.data ?? {};
          const discussionUrl = `https://www.reddit.com${post.permalink}`;
          const linkedUrl = post.url_overridden_by_dest ?? post.url ?? null;
          const duplicate = existingKeys.has(normalizeUrl(linkedUrl)) || existingKeys.has(normalizeUrl(discussionUrl));

          candidates.push({
            source_route: "reddit",
            name: `reddit-${post.id}`,
            title: post.title ?? "Reddit post",
            description: "Reddit discussion surfaced this as an ecosystem lead. Verify against primary sources before promotion.",
            repo_url: linkedUrl?.includes("github.com") ? linkedUrl : null,
            homepage_url: linkedUrl,
            source_url: discussionUrl,
            source_urls: compact([discussionUrl, linkedUrl]),
            signal_summary: `Matched Reddit r/${subreddit} query \`${query}\`; created ${post.created_utc ? new Date(post.created_utc * 1000).toISOString() : "unknown"}; score ${post.score ?? 0}; comments ${post.num_comments ?? 0}.`,
            why_builders_should_care: "May indicate practitioner interest, early pain points, or emerging tools; treat as a lead until backed by a primary source.",
            suggested_trust_tier: "watchlist",
            risk_flags: compact(["social-signal", duplicate ? null : "needs-primary-source"]),
            recommended_action: duplicate ? "already-indexed" : "watchlist",
            reason: duplicate ? "already-indexed" : "candidate",
            allow_registry_proposal: false,
            metrics: {
              score: post.score ?? 0,
              comments: post.num_comments ?? 0,
              subreddit,
              query,
              created_at: post.created_utc ? new Date(post.created_utc * 1000).toISOString() : null
            }
          });
        }
      } catch (error) {
        errors.push({ route: "reddit", subreddit, query, error: error.message });
      }
    }
  }

  return { candidates, errors };
}

function registrySourceUrl(serverName) {
  return `https://registry.modelcontextprotocol.io/v0.1/servers/${encodeURIComponent(serverName)}/versions/latest`;
}

function sourceUrlsForServer(server, sourceUrl) {
  const candidates = [
    sourceUrl,
    server.repo_url,
    server.repository_url,
    server.repository?.url,
    server.repo?.url,
    server.source?.url,
    server.homepage_url,
    server.homepage
  ];
  return compact(candidates.filter((value) => typeof value === "string" && value.startsWith("http")));
}

async function discoverMcpRegistry(existingKeys) {
  if (process.env.HERMES_INCLUDE_MCP_REGISTRY === "0") return { candidates: [], errors: [] };

  const endpoint = process.env.MCP_REGISTRY_URL ?? "https://registry.modelcontextprotocol.io/v0.1/servers";
  const limit = Number(process.env.HERMES_MCP_LIMIT ?? Math.max(maxCandidates, 40));
  const candidates = [];
  const errors = [];
  let cursor = null;

  try {
    while (candidates.length < limit) {
      const pageLimit = Math.min(100, limit - candidates.length);
      const url = new URL(endpoint);
      url.searchParams.set("limit", String(pageLimit));
      url.searchParams.set("version", "latest");
      if (cursor) url.searchParams.set("cursor", cursor);

      const json = await fetchJson(url);
      const page = json.servers ?? json.data ?? [];
      for (const item of page) {
        const server = item?.server ?? item;
        const name = server.name ?? server.id ?? "unknown-server";
        const sourceUrl = registrySourceUrl(name);
        const urls = sourceUrlsForServer(server, sourceUrl);
        const duplicate = existingKeys.has(name.toLowerCase()) || urls.some((url) => existingKeys.has(normalizeUrl(url)));

        candidates.push({
          source_route: "mcp-registry",
          name,
          title: server.title ?? name,
          description: server.description ?? server.summary ?? "No description supplied by the source registry.",
          version: server.version ?? server.latest_version ?? server.latest?.version ?? null,
          source_url: sourceUrl,
          source_urls: urls,
          signal_summary: "Listed in the official MCP Registry latest-version feed.",
          why_builders_should_care: "May expose a useful MCP capability that coding agents can review and permission.",
          suggested_trust_tier: "promising",
          risk_flags: inferRiskFlags(`${name} ${server.description ?? ""}`, null),
          recommended_action: duplicate ? "already-indexed" : "review",
          reason: duplicate ? "already-indexed" : "candidate",
          allow_registry_proposal: false
        });
      }

      cursor = json.metadata?.nextCursor ?? json.metadata?.next_cursor ?? json.nextCursor ?? null;
      if (!cursor || page.length === 0) break;
    }
  } catch (error) {
    errors.push({ route: "mcp-registry", source: endpoint, error: error.message });
  }

  return { candidates, errors };
}

async function loadState() {
  if (!existsSync(statePath)) return {};
  return JSON.parse(await readFile(statePath, "utf8"));
}

async function saveState(state) {
  await mkdir(path.dirname(statePath), { recursive: true });
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

function titleFromHtml(text) {
  const match = text.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match ? match[1].replace(/\s+/g, " ").trim() : null;
}

async function watchOfficialUrls(state) {
  const urls = parseListEnv("HERMES_WATCH_URLS") ?? [];
  const watched = [];
  const errors = [];

  for (const url of urls) {
    try {
      const result = await fetchText(url);
      const hash = createHash("sha256").update(result.text).digest("hex");
      const prior = state.watch_urls?.[url]?.hash ?? null;
      watched.push({
        url,
        status: result.status,
        ok: result.ok,
        title: titleFromHtml(result.text),
        changed: prior !== null && prior !== hash,
        first_seen: prior === null,
        hash
      });
      state.watch_urls ??= {};
      state.watch_urls[url] = { hash, checked_at: generatedAt };
    } catch (error) {
      errors.push({ route: "watch-url", url, error: error.message });
    }
  }

  return { watched, errors };
}

function routeRank(route) {
  const ranks = {
    "mcp-registry": 0,
    "github-releases": 1,
    "github-search": 2,
    "npm-search": 3,
    "hacker-news": 4,
    reddit: 5
  };
  return ranks[route] ?? 9;
}

function sortCandidates(candidates) {
  return [...candidates].sort((a, b) => {
    const reasonDelta = Number(a.reason === "already-indexed") - Number(b.reason === "already-indexed");
    if (reasonDelta !== 0) return reasonDelta;
    const routeDelta = routeRank(a.source_route) - routeRank(b.source_route);
    if (routeDelta !== 0) return routeDelta;
    return (b.metrics?.stars ?? b.metrics?.points ?? b.metrics?.score ?? b.metrics?.npm_score ?? 0) -
      (a.metrics?.stars ?? a.metrics?.points ?? a.metrics?.score ?? a.metrics?.npm_score ?? 0) ||
      a.name.localeCompare(b.name);
  });
}

function uniqueCandidates(candidates) {
  const seen = new Set();
  const unique = [];

  for (const candidate of candidates) {
    const key = normalizeUrl(candidate.repo_url ?? candidate.source_url ?? candidate.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(candidate);
  }

  return sortCandidates(unique);
}

function selectCandidates(candidates) {
  const unique = uniqueCandidates(candidates);
  const selected = [];
  const selectedKeys = new Set();
  const minPerRoute = Number(process.env.HERMES_MIN_PER_ROUTE ?? 2);
  const routeOrder = ["mcp-registry", "github-releases", "github-search", "npm-search", "hacker-news", "reddit"];

  for (const route of routeOrder) {
    for (const candidate of unique.filter((item) => item.source_route === route).slice(0, minPerRoute)) {
      const key = normalizeUrl(candidate.repo_url ?? candidate.source_url ?? candidate.name);
      if (!selectedKeys.has(key) && selected.length < maxCandidates) {
        selected.push(candidate);
        selectedKeys.add(key);
      }
    }
  }

  for (const candidate of unique) {
    if (selected.length >= maxCandidates) break;
    const key = normalizeUrl(candidate.repo_url ?? candidate.source_url ?? candidate.name);
    if (!selectedKeys.has(key)) {
      selected.push(candidate);
      selectedKeys.add(key);
    }
  }

  return sortCandidates(selected);
}

async function existingRegistryKeys() {
  const entries = await readEntries();
  return new Set(entries.flatMap((item) => [
    item.entry.name?.toLowerCase(),
    item.entry.slug?.toLowerCase(),
    normalizeUrl(item.entry.homepage_url),
    normalizeUrl(item.entry.repo_url),
    ...(item.entry.source_urls ?? []).map(normalizeUrl)
  ].filter(Boolean)));
}

function candidateSummary(candidate) {
  const summary = `${candidate.title ?? candidate.name} is a source-discovered agentic tooling candidate. ${candidate.description ?? ""}`.replace(/\s+/g, " ").trim();
  return summary.slice(0, 420);
}

function candidateProfile(candidate, entry) {
  return [
    `# ${entry.name}`,
    "",
    candidateSummary(candidate),
    "",
    "## Why Builders Should Care",
    "",
    candidate.why_builders_should_care ?? "Hermes surfaced this as a candidate for agent builders to review.",
    "",
    "## Review Notes",
    "",
    `- Trust tier: ${entry.trust_tier}`,
    "- Hermes generated this entry from source metadata. Maintainers should verify install docs, license posture, permissions, and behavior before raising trust.",
    `- Source: ${candidate.source_url ?? candidate.repo_url ?? candidate.source_urls?.[0]}`,
    ""
  ].join("\n");
}

async function proposeRegistryEntries(candidates, existingKeys) {
  if (!proposeRegistry) return 0;

  let proposed = 0;
  for (const candidate of candidates) {
    if (proposed >= registryProposalLimit) break;
    if (candidate.allow_registry_proposal === false) continue;
    if (candidate.reason === "already-indexed") continue;
    if (!["review", "watchlist"].includes(candidate.recommended_action)) continue;

    const slug = slugify(candidate.name);
    if (existingKeys.has(slug) || existsSync(path.join(ROOT, "registry", "entries", slug, "entry.yaml"))) continue;

    const type = inferEntryType(candidate);
    const sourceUrls = compact(candidate.source_urls ?? [candidate.source_url, candidate.repo_url]);
    const repoUrl = candidate.repo_url ?? sourceUrls.find((url) => url.includes("github.com")) ?? null;
    const homepageUrl = candidate.homepage_url ?? repoUrl ?? sourceUrls[0] ?? null;
    const owner = candidate.name.includes("/") ? candidate.name.split("/")[0] : "Unknown upstream";
    const license = candidate.metrics?.license ?? "NOASSERTION";
    const sourceKind = candidate.source_url?.includes("registry.modelcontextprotocol.io")
      ? "official_registry"
      : candidate.source_route === "npm-search" ? "package_registry" : "github";
    const trustTier = candidate.suggested_trust_tier === "promising" && sourceKind === "official_registry"
      ? "promising"
      : candidate.recommended_action === "watchlist" ? "watchlist" : "unreviewed";

    const entry = {
      schema_version: "1.0.0",
      slug,
      name: candidate.title ?? candidate.name,
      type,
      summary_llm: candidateSummary(candidate),
      homepage_url: homepageUrl,
      repo_url: repoUrl,
      package_urls: [],
      licenses: [license],
      copyright_owner: owner,
      source_urls: sourceUrls.length > 0 ? sourceUrls : [candidate.source_url ?? candidate.repo_url],
      source_kind: sourceKind,
      protocols: type === "mcp-server" ? ["mcp"] : [],
      clients: type === "mcp-server" ? ["Claude Desktop", "Cursor", "Windsurf", "VS Code", "OpenAI Agents SDK"] : [],
      install: {
        command: null,
        notes: "Hermes proposed this entry from source metadata. Review upstream install docs before use.",
        config_example: null
      },
      permissions: inferPermissions(candidate),
      env_vars: [],
      tags: inferTags(candidate),
      use_cases: inferUseCases(candidate),
      trust_tier: trustTier,
      review_status: "needs-review",
      last_checked: generatedAt.slice(0, 10)
    };

    const entryDir = path.join(ROOT, "registry", "entries", slug);
    await writeText(path.join(entryDir, "entry.yaml"), yaml.dump(entry, { lineWidth: 100, noRefs: true }));
    await writeText(path.join(entryDir, "profile.md"), candidateProfile(candidate, entry));
    existingKeys.add(slug);
    if (repoUrl) existingKeys.add(normalizeUrl(repoUrl));
    proposed += 1;
  }

  return proposed;
}

function reportPath() {
  if (mode === "daily") {
    return path.join(ROOT, "discovery", "candidates", `hermes-deep-${generatedAt.slice(0, 10)}.json`);
  }
  return path.join(ROOT, "discovery", "candidates", `hermes-${generatedAt.slice(0, 13)}.json`);
}

async function writeHermesDigest(report) {
  if (mode !== "daily") return;
  const publicIndexPath = path.join(ROOT, "public", "api", "index.json");
  const registry = existsSync(publicIndexPath) ? await readJson(publicIndexPath) : { entries: [] };
  const freshCandidates = report.candidates.filter((candidate) => candidate.reason !== "already-indexed").slice(0, 20);
  const changedSources = report.watched_sources.filter((source) => source.changed || source.first_seen).slice(0, 20);
  const watchlist = registry.entries
    .filter((entry) => entry.risk_flags?.length > 0 || entry.trust_tier === "watchlist" || entry.trust_tier === "deprecated")
    .slice(0, 20);

  const lines = [
    "# vnem Daily Signals",
    "",
    `Generated: ${report.generated_at}`,
    "",
    "Hermes summarizes source-backed agent and LLM ecosystem signals. This digest does not auto-promote entries into the registry.",
    "",
    "## New Candidate Signals",
    "",
    freshCandidates.length > 0
      ? freshCandidates.map((candidate) => `- ${candidate.title ?? candidate.name} | ${candidate.suggested_trust_tier} | ${candidate.recommended_action} | ${candidate.source_url}`).join("\n")
      : "- No new non-duplicate candidates surfaced in this run.",
    "",
    "## Watched Primary Sources",
    "",
    changedSources.length > 0
      ? changedSources.map((source) => `- ${source.title ?? source.url} | ${source.first_seen ? "first-seen" : "changed"} | ${source.url}`).join("\n")
      : "- No configured watched source changed, or no watched sources are configured.",
    "",
    "## Watchlist / Risk Flags",
    "",
    watchlist.length > 0
      ? watchlist.map((entry) => `- [${entry.name}](${entry.url_path}) | ${entry.type} | ${entry.trust_tier} | ${(entry.risk_flags ?? []).join(", ") || entry.review_status}`).join("\n")
      : "- No watchlist entries in the current generated index.",
    "",
    "## Maintainer Actions",
    "",
    "- Review Hermes candidate reports before merging.",
    "- Promote candidates only after checking source links, license posture, permissions, and install docs.",
    "- Keep social ingestion disabled unless official credentials and terms-compliant access are configured.",
    "- If generated pack files changed, verify `AGENTS.md`, `search-index.json`, `best-practices.md`, and `agent-workspace.md` still describe read-only behavior.",
    ""
  ];

  await writeText(path.join(ROOT, "discovery", "daily-digest.md"), lines.join("\n"));
}

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
    env: { ...process.env, ...(options.env ?? {}) }
  });

  if (result.status !== 0) {
    const detail = options.capture ? `${result.stdout ?? ""}${result.stderr ?? ""}`.trim() : "";
    throw new Error(`${command} ${commandArgs.join(" ")} failed${detail ? `:\n${detail}` : ""}`);
  }

  return result.stdout ?? "";
}

function git(commandArgs, options = {}) {
  return run("git", commandArgs, options);
}

function gitStatus() {
  return git(["status", "--porcelain"], { capture: true }).trim();
}

function currentBranch() {
  return git(["branch", "--show-current"], { capture: true }).trim();
}

function remoteRepoFromGit() {
  const remote = git(["remote", "get-url", "origin"], { capture: true }).trim();
  const https = remote.match(/github\.com[:/](.+?\/.+?)(?:\.git)?$/);
  return https ? https[1].replace(/\.git$/, "") : null;
}

function prepareGitBranch() {
  if (!createPr) return null;

  const dirty = gitStatus();
  if (dirty && !allowDirty) {
    throw new Error("Refusing to run with a dirty worktree. Set HERMES_ALLOW_DIRTY=1 only for a dedicated VPS clone.");
  }

  if (gitSync) {
    git(["fetch", "origin", baseBranch]);
    git(["checkout", baseBranch]);
    git(["pull", "--ff-only", "origin", baseBranch]);
  }

  const branch = `hermes/${mode}-${slugDate().toLowerCase()}`;
  git(["checkout", "-b", branch]);
  return branch;
}

async function createPullRequest(branch, report) {
  const repo = githubRepo ?? remoteRepoFromGit();
  if (!githubToken || !repo || !branch) {
    console.log("Skipping PR creation; set GITHUB_TOKEN and HERMES_GITHUB_REPO or a GitHub origin remote.");
    return null;
  }

  git(["push", "--set-upstream", "origin", branch]);

  const title = mode === "daily"
    ? `Hermes daily signals ${generatedAt.slice(0, 10)}`
    : `Hermes scout ${generatedAt.slice(0, 13)}Z`;
  const freshCount = report.candidates.filter((candidate) => candidate.reason !== "already-indexed").length;
  const body = [
    "Hermes automated discovery run.",
    "",
    `- Mode: ${mode}`,
    `- Generated: ${generatedAt}`,
    `- Candidate count: ${report.candidates.length}`,
    `- New non-duplicate candidates: ${freshCount}`,
    `- Registry proposal mode: ${proposeRegistry ? "enabled" : "disabled"}`,
    "",
    "Maintainers should review source links, license posture, permissions, and trust tier before promoting anything into `registry/entries`."
  ].join("\n");

  const response = await fetchJson(`https://api.github.com/repos/${repo}/pulls`, {
    method: "POST",
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${githubToken}`
    },
    body: JSON.stringify({
      title,
      head: branch,
      base: baseBranch,
      body,
      draft: true
    })
  });

  return response.html_url;
}

async function main() {
  if (!["hourly", "daily"].includes(mode)) {
    throw new Error(`Unsupported Hermes mode: ${mode}. Use --mode hourly or --mode daily.`);
  }

  const branch = prepareGitBranch();
  const existingKeys = await existingRegistryKeys();
  const state = await loadState();
  const [github, releases, npm, hn, reddit, mcp, watched] = await Promise.all([
    discoverGitHub(existingKeys),
    discoverGitHubReleases(existingKeys),
    discoverNpmPackages(existingKeys),
    discoverHackerNews(existingKeys),
    discoverReddit(existingKeys),
    discoverMcpRegistry(existingKeys),
    mode === "daily" ? watchOfficialUrls(state) : { watched: [], errors: [] }
  ]);

  const candidates = selectCandidates([...github.candidates, ...releases.candidates, ...npm.candidates, ...hn.candidates, ...reddit.candidates, ...mcp.candidates]);
  const report = {
    generated_at: generatedAt,
    mode,
    lookback_days: lookbackDays,
    source_routes: compact([
      "github-search",
      envFlag("HERMES_INCLUDE_GITHUB_RELEASES", true) ? "github-releases" : null,
      envFlag("HERMES_INCLUDE_NPM", true) ? "npm-search" : null,
      envFlag("HERMES_INCLUDE_HACKER_NEWS", true) ? "hacker-news" : null,
      envFlag("HERMES_INCLUDE_REDDIT", false) ? "reddit" : null,
      process.env.HERMES_INCLUDE_MCP_REGISTRY === "0" ? null : "mcp-registry",
      mode === "daily" ? "watch-urls" : null
    ]),
    candidates,
    watched_sources: watched.watched,
    errors: [...github.errors, ...releases.errors, ...npm.errors, ...hn.errors, ...reddit.errors, ...mcp.errors, ...watched.errors]
  };

  if (dryRun) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  await writeJson(reportPath(), report);
  const proposedEntries = await proposeRegistryEntries(candidates, existingKeys);
  if (mode === "daily") {
    await writeHermesDigest(report);
    await saveState(state);
  }

  run("npm", ["run", "validate"]);
  if (proposedEntries > 0) {
    run("npm", ["run", "generate"]);
    run("npm", ["run", "test:install-pack"]);
  }

  const changed = gitStatus();
  if (!changed) {
    console.log("Hermes found no repository changes to commit.");
    return;
  }

  if (createPr) {
    const addPaths = proposedEntries > 0
      ? ["discovery", "registry", "public", ".vnem", "llms.txt", "llms-full.txt"]
      : ["discovery"];
    git(["add", ...addPaths]);
    git(["-c", "user.name=Hermes", "-c", "user.email=hermes@vnem.ai", "commit", "-m", `Hermes ${mode} discovery ${generatedAt.slice(0, 10)}`]);
    const prUrl = await createPullRequest(branch ?? currentBranch(), report);
    if (prUrl) console.log(`Opened draft PR: ${prUrl}`);
  } else {
    console.log("Hermes wrote local changes. HERMES_CREATE_PR=0, so no branch, commit, push, or PR was created.");
  }
}

main().catch((error) => {
  console.error(error.stack ?? error.message);
  process.exit(1);
});
