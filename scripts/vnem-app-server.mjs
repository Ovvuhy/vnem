#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyConnectorChanges } from "./apply-connector-changes.mjs";
import { detectAiClients } from "./detect-ai-clients.mjs";
import { generateConnectorPreviews } from "./preview-connector-changes.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const loopbackHost = "127.0.0.1";
const defaultPort = 9099;
const telemetryConnections = new Set();
const activeIngestions = [];
const routeErrors = [];
let intelligenceTimer = null;
let intelligenceFirstCycle = null;
let pipelineSequence = 0;
const terminalStatuses = new Set(["staged_for_review", "isolated_by_protection", "research_no_candidate"]);
const researchCache = {
  etag: null,
  lastFetchAt: 0,
  nextPollAt: 0,
  seenRepositoryIds: new Set()
};
const defaultResearchQuery = "luau architecture OR agentic workflow";
const defaultResearchPollMinMs = 5 * 60 * 1000;
const defaultResearchPollMaxMs = 10 * 60 * 1000;
const endpoints = [
  "GET /api/connector/status",
  "GET /api/connector/preview",
  "POST /api/connector/apply",
  "POST /api/connector/rollback",
  "GET /api/telemetry/history",
  "GET /api/telemetry/stream"
];

export function getAppServerStatus(options = {}) {
  const port = normalizePort(options.port ?? defaultPort);
  return {
    service: "vnem-app-server",
    mode: "local-only-system-api",
    host: loopbackHost,
    port,
    repository_root: path.resolve(options.repositoryRoot || rootDir),
    endpoints,
    security: {
      bind: loopbackHost,
      external_interfaces_allowed: false,
      host_header_policy: "127.0.0.1, localhost, or [::1] only",
      origin_policy: "missing, null, localhost, 127.0.0.1, or [::1] only"
    }
  };
}

export async function startVnemAppServer(options = {}) {
  const config = getAppServerStatus(options);
  const server = createVnemAppServer({
    repositoryRoot: config.repository_root
  });

  await listenOnLoopback(server, config, {
    onRuntimeError: options.onServerError
  });
  if (options.enableLiveIntelligenceEngine !== false) {
    const engine = startLiveIntelligenceEngine({
      repositoryRoot: config.repository_root,
      fetchImpl: options.fetchImpl,
      pollIntervalMs: options.pollIntervalMs,
      minPollIntervalMs: options.minPollIntervalMs,
      maxPollIntervalMs: options.maxPollIntervalMs,
      stageDelayMs: options.stageDelayMs,
      force: options.forceInitialPoll
    });
    server.on("close", stopLiveIntelligenceEngine);
    if (options.awaitInitialIntelligenceCycle) {
      await engine.firstCycle;
    }
  }

  const address = server.address();
  const port = typeof address === "object" && address ? address.port : config.port;
  return {
    server,
    config: {
      ...config,
      port
    },
    url: `http://${loopbackHost}:${port}`
  };
}

export function createVnemAppServer(options = {}) {
  const repositoryRoot = path.resolve(options.repositoryRoot || rootDir);

  return http.createServer(async (request, response) => {
    setBaseHeaders(request, response);

    const localCheck = validateLocalRequest(request);
    if (!localCheck.ok) {
      writeJson(response, 403, {
        ok: false,
        error: "local-only-request-rejected",
        reason: localCheck.reason,
        host: sanitizeHeader(request.headers.host),
        origin: sanitizeHeader(request.headers.origin),
        remote_address: request.socket.remoteAddress || null
      });
      return;
    }

    if (request.method === "OPTIONS") {
      writeJson(response, 204, null);
      return;
    }

    try {
      const url = new URL(request.url || "/", `http://${request.headers.host}`);
      const route = `${request.method || "GET"} ${url.pathname}`;

      if (route === "GET /api/telemetry/stream") {
        openTelemetryStream(request, response);
        return;
      }

      if (route === "GET /api/telemetry/history") {
        writeJson(response, 200, telemetryHistoryPayload());
        return;
      }

      if (route === "GET /api/connector/status") {
        const payload = await detectAiClients();
        writeJson(response, 200, payload);
        broadcastTelemetry({
          type: "connector_status_refreshed",
          message: "Connector status refreshed",
          detected_clients: Object.keys(payload.detected_clients ?? {}).length
        });
        return;
      }

      if (route === "GET /api/connector/preview") {
        const payload = await generateConnectorPreviews({ repositoryRoot, redact: true });
        writeJson(response, 200, payload);
        broadcastTelemetry({
          type: "connector_preview_refreshed",
          message: "Connector preview refreshed",
          previews: Object.keys(payload.previews ?? {}).length
        });
        return;
      }

      if (route === "POST /api/connector/apply") {
        await drainRequestBody(request);
        const result = await applyConnectorChanges("apply", { repositoryRoot });
        writeJson(response, hasPermissionFailure(result) ? 500 : 200, result);
        broadcastTelemetry({
          type: "connector_apply_finished",
          message: "Connector apply finished",
          permission_failure: hasPermissionFailure(result)
        });
        return;
      }

      if (route === "POST /api/connector/rollback") {
        await drainRequestBody(request);
        const result = await applyConnectorChanges("rollback", { repositoryRoot });
        writeJson(response, hasPermissionFailure(result) ? 500 : 200, result);
        broadcastTelemetry({
          type: "connector_rollback_finished",
          message: "Connector rollback finished",
          permission_failure: hasPermissionFailure(result)
        });
        return;
      }

      if (url.pathname.startsWith("/api/connector/")) {
        writeJson(response, 405, {
          ok: false,
          error: "method-or-endpoint-not-supported",
          route
        });
        return;
      }

      writeJson(response, 404, {
        ok: false,
        error: "not-found",
        route
      });
    } catch (error) {
      const status = isPermissionError(error) ? 500 : 500;
      writeJson(response, status, {
        ok: false,
        error: isPermissionError(error) ? "permission-denied" : "vnem-app-server-error",
        error_code: safeErrorCode(error),
        target_path: error?.path || null,
        message: safeErrorMessage(error)
      });
    }
  });
}

export function broadcastTelemetry(payload) {
  const event = {
    timestamp: new Date().toISOString(),
    ...payload
  };

  for (const connection of [...telemetryConnections]) {
    try {
      writeTelemetryEvent(connection.response, event);
    } catch {
      closeTelemetryConnection(connection);
    }
  }

  return {
    delivered: telemetryConnections.size,
    event
  };
}

export function telemetryHistoryPayload() {
  return {
    ok: true,
    service: "vnem-app-server",
    generated_at: new Date().toISOString(),
    active_ingestions: activeIngestions.slice(0, 12),
    route_errors: routeErrors.slice(0, 12),
    pipeline: pipelineSnapshot()
  };
}

export function startLiveIntelligenceEngine(options = {}) {
  if (intelligenceTimer) {
    return {
      firstCycle: intelligenceFirstCycle ?? Promise.resolve(null)
    };
  }

  intelligenceFirstCycle = runLiveIntelligenceCycle({
    ...options,
    force: options.force ?? true
  }).catch((error) => broadcastRouteError(error, {
    message: "Live intelligence engine failed during initial cycle."
  }));

  const schedule = () => {
    const delayMs = nextPollDelayMs(options);
    intelligenceTimer = setTimeout(() => {
      intelligenceTimer = null;
      void runLiveIntelligenceCycle(options).catch((error) => broadcastRouteError(error, {
        message: "Live intelligence engine polling cycle failed."
      }));
      schedule();
    }, delayMs);
    intelligenceTimer.unref?.();
  };

  schedule();
  return {
    firstCycle: intelligenceFirstCycle
  };
}

export function stopLiveIntelligenceEngine() {
  if (intelligenceTimer) {
    clearTimeout(intelligenceTimer);
    intelligenceTimer = null;
  }
  intelligenceFirstCycle = null;
}

export async function runLiveIntelligenceCycle(options = {}) {
  const repositoryRoot = path.resolve(options.repositoryRoot || rootDir);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch?.bind(globalThis);
  if (typeof fetchImpl !== "function") {
    throw routeError("FETCH_UNAVAILABLE", "Global fetch is unavailable in this Node.js runtime.", {
      route: "github-search",
      stage: "research"
    });
  }

  const ingestion = await researchLiveRepositoryCandidate({
    fetchImpl,
    force: options.force,
    pollIntervalMs: options.pollIntervalMs,
    minPollIntervalMs: options.minPollIntervalMs,
    maxPollIntervalMs: options.maxPollIntervalMs,
    query: options.query
  });

  if (!ingestion) {
    const event = pipelineEvent({
      type: "pipeline_research_noop",
      message: "Research AI skipped GitHub polling because the live search cache is still fresh.",
      agent_stage: "research"
    });
    broadcastTelemetry(event);
    return event;
  }

  broadcastTelemetry(pipelineEvent({
    message: ingestion.latest_event.message,
    agent_stage: ingestion.current_agent,
    active_ingestion: ingestion
  }));

  if (ingestion.status === "research_no_candidate") {
    return pipelineEvent({
      message: ingestion.latest_event.message,
      agent_stage: ingestion.current_agent,
      active_ingestion: ingestion
    });
  }

  await waitForStageDelay(options.stageDelayMs);
  const protectedIngestion = await runProtectionScan(ingestion, { fetchImpl });
  broadcastTelemetry(pipelineEvent({
    message: protectedIngestion.latest_event.message,
    agent_stage: protectedIngestion.current_agent,
    active_ingestion: protectedIngestion
  }));

  if (protectedIngestion.threat_score >= 30) {
    return pipelineEvent({
      message: protectedIngestion.latest_event.message,
      agent_stage: protectedIngestion.current_agent,
      active_ingestion: protectedIngestion
    });
  }

  await waitForStageDelay(options.stageDelayMs);
  const staged = await runGivingStaging(protectedIngestion, { repositoryRoot });
  const event = pipelineEvent({
    message: staged.latest_event.message,
    agent_stage: staged.current_agent,
    active_ingestion: staged
  });
  broadcastTelemetry(event);
  return event;
}

export async function researchLiveRepositoryCandidate(options = {}) {
  const now = Date.now();
  if (!options.force && now < researchCache.nextPollAt) {
    return null;
  }

  const fetchImpl = options.fetchImpl;
  const query = options.query ?? defaultResearchQuery;
  const url = new URL("https://api.github.com/search/repositories");
  url.searchParams.set("q", query);
  url.searchParams.set("sort", "updated");
  url.searchParams.set("order", "desc");
  url.searchParams.set("per_page", "10");

  const headers = {
    accept: "application/vnd.github+json",
    "user-agent": "vnem-live-intelligence-engine"
  };
  if (researchCache.etag) {
    headers["if-none-match"] = researchCache.etag;
  }

  const response = await fetchImpl(url.href, { headers });
  researchCache.lastFetchAt = now;
  researchCache.nextPollAt = now + nextPollDelayMs(options);

  if (response.status === 304) {
    return null;
  }
  if (response.status === 403 || response.status === 429) {
    throw routeError("GITHUB_RATE_LIMITED", `GitHub Search API rate limited VNEM with HTTP ${response.status}.`, {
      route: "github-search",
      stage: "research",
      target_url: url.href
    });
  }
  if (!response.ok) {
    throw routeError(`GITHUB_HTTP_${response.status}`, `GitHub Search API returned HTTP ${response.status}.`, {
      route: "github-search",
      stage: "research",
      target_url: url.href
    });
  }

  const etag = readHeader(response, "etag");
  if (etag) {
    researchCache.etag = etag;
  }
  const body = await response.json();
  const candidate = selectHighValueRepository(body.items ?? []);
  if (!candidate) {
    return createResearchNoCandidateIngestion(query);
  }

  researchCache.seenRepositoryIds.add(candidate.id);
  return createRepositoryIngestion(candidate, {
    query,
    trigger: "live_github_search"
  });
}

function createRepositoryIngestion(repository, options = {}) {
  pipelineSequence += 1;
  const now = new Date().toISOString();
  const owner = repository.owner?.login ?? repository.full_name?.split("/")?.[0] ?? "unknown";
  const name = repository.name ?? repository.full_name?.split("/")?.[1] ?? "repository";
  const description = cleanSummary(repository.description || "No repository description provided.");
  const message = `Research AI discovered ${repository.full_name}: ${description}`;
  const ingestion = {
    id: `ingestion-${pipelineSequence}-${slugify(repository.full_name ?? name)}`,
    trigger: options.trigger ?? "live_github_search",
    title: repository.full_name ?? name,
    source_origin: "GitHub Scrape",
    source_route: "github-search",
    source_url: repository.html_url,
    repository_target: repository.html_url,
    repository: {
      id: repository.id,
      owner,
      name,
      full_name: repository.full_name ?? `${owner}/${name}`,
      html_url: repository.html_url,
      default_branch: repository.default_branch || "main",
      description,
      stargazers_count: repository.stargazers_count ?? 0,
      forks_count: repository.forks_count ?? 0,
      language: repository.language ?? null,
      updated_at: repository.updated_at ?? null,
      pushed_at: repository.pushed_at ?? null,
      query: options.query ?? defaultResearchQuery
    },
    current_agent: "research",
    status: "researching",
    trust_score: repositoryTrustScore(repository),
    threat_score: null,
    risk_tier: "unknown",
    action_dispatch: "Scanning",
    created_at: now,
    updated_at: now,
    latest_event: {
      agent: "research",
      message,
      timestamp: now
    },
    timeline: [
      {
        agent: "research",
        status: "researching",
        message,
        timestamp: now
      }
    ]
  };
  activeIngestions.unshift(ingestion);
  trimActiveIngestions();
  return ingestion;
}

function createResearchNoCandidateIngestion(query) {
  pipelineSequence += 1;
  const now = new Date().toISOString();
  const message = `Research AI polled GitHub Search for "${query}" but found no new high-value repository candidate.`;
  const ingestion = {
    id: `ingestion-${pipelineSequence}-no-candidate`,
    trigger: "live_github_search",
    title: "No high-value repository candidate",
    source_origin: "GitHub Scrape",
    source_route: "github-search",
    source_url: "https://api.github.com/search/repositories",
    repository_target: null,
    repository: { query },
    current_agent: "research",
    status: "research_no_candidate",
    trust_score: 0,
    threat_score: 0,
    risk_tier: "review",
    action_dispatch: "Scanning",
    created_at: now,
    updated_at: now,
    latest_event: {
      agent: "research",
      message,
      timestamp: now
    },
    timeline: [
      {
        agent: "research",
        status: "research_no_candidate",
        message,
        timestamp: now
      }
    ]
  };
  activeIngestions.unshift(ingestion);
  trimActiveIngestions();
  return ingestion;
}

export async function runProtectionScan(ingestion, options = {}) {
  const audit = await fetchRepositoryAuditText(ingestion.repository, { fetchImpl: options.fetchImpl });
  const scan = scanThreatSignatures(audit.combinedText);
  const now = new Date().toISOString();
  const blocked = scan.threat_score >= 30;

  Object.assign(ingestion, {
    current_agent: "protection",
    status: blocked ? "isolated_by_protection" : "sandboxing",
    threat_score: scan.threat_score,
    risk_tier: scan.risk_tier,
    action_dispatch: blocked ? "Isolated by Protection AI" : "Scanning",
    protection_report: {
      ...scan,
      fetched_assets: audit.fetchedAssets,
      unavailable_assets: audit.unavailableAssets
    },
    updated_at: now,
    latest_event: {
      agent: "protection",
      message: blocked
        ? `Protection AI isolated ${ingestion.repository.full_name}. Threat score: ${scan.threat_score}%. Flags: ${scan.flags.join(", ") || "none"}.`
        : `Protection AI scanned README/package surfaces for ${ingestion.repository.full_name}. Threat score: ${scan.threat_score}%. No blocking signatures found.`,
      timestamp: now
    }
  });

  ingestion.timeline.unshift({
    agent: "protection",
    status: ingestion.status,
    message: ingestion.latest_event.message,
    timestamp: now
  });
  ingestion.timeline = ingestion.timeline.slice(0, 8);
  return ingestion;
}

export async function runGivingStaging(ingestion, options = {}) {
  const repositoryRoot = path.resolve(options.repositoryRoot || rootDir);
  const stagingDir = path.join(repositoryRoot, ".vnem", "staging");
  await mkdir(stagingDir, { recursive: true });

  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, "-");
  const repository = ingestion.repository;
  const fileName = `dispatch-${slugify(repository.full_name)}-${timestamp}.md`;
  const filePath = path.join(stagingDir, fileName);
  const content = buildDispatchMarkdown(ingestion, {
    generatedAt: now.toISOString()
  });
  await writeFile(filePath, content, "utf8");

  Object.assign(ingestion, {
    current_agent: "complete",
    status: "staged_for_review",
    action_dispatch: "Pending Approval",
    staged_dispatch: {
      path: filePath,
      file_name: fileName,
      generated_at: now.toISOString()
    },
    updated_at: now.toISOString(),
    latest_event: {
      agent: "giving",
      message: `Giving AI staged a real review dispatch for ${repository.full_name} at ${filePath}.`,
      timestamp: now.toISOString()
    }
  });

  ingestion.timeline.unshift({
    agent: "giving",
    status: ingestion.status,
    message: ingestion.latest_event.message,
    timestamp: now.toISOString()
  });
  ingestion.timeline = ingestion.timeline.slice(0, 8);
  return ingestion;
}

async function fetchRepositoryAuditText(repository, options = {}) {
  const fetchImpl = options.fetchImpl;
  const owner = encodeURIComponent(repository.owner);
  const name = encodeURIComponent(repository.name);
  const branch = encodeURIComponent(repository.default_branch || "main");
  const targets = [
    {
      label: "README.md",
      url: `https://raw.githubusercontent.com/${owner}/${name}/${branch}/README.md`
    },
    {
      label: "package.json",
      url: `https://raw.githubusercontent.com/${owner}/${name}/${branch}/package.json`
    }
  ];
  const fetchedAssets = [];
  const unavailableAssets = [];
  const textParts = [];

  for (const target of targets) {
    try {
      const response = await fetchImpl(target.url, {
        headers: {
          accept: "text/plain",
          "user-agent": "vnem-live-intelligence-engine"
        }
      });
      if (!response.ok) {
        unavailableAssets.push({
          label: target.label,
          status: response.status
        });
        continue;
      }
      const text = await response.text();
      const bounded = text.slice(0, 160000);
      fetchedAssets.push({
        label: target.label,
        bytes_scanned: bounded.length
      });
      textParts.push(`\n\n--- ${target.label} ---\n${bounded}`);
    } catch (error) {
      unavailableAssets.push({
        label: target.label,
        error_code: safeErrorCode(error),
        message: safeErrorMessage(error)
      });
    }
  }

  if (textParts.length === 0) {
    textParts.push(repository.description ?? "");
  }

  return {
    combinedText: textParts.join("\n"),
    fetchedAssets,
    unavailableAssets
  };
}

export function scanThreatSignatures(text) {
  const input = String(text || "");
  const signatures = [
    { key: "shell-exec-node", pattern: /\bchild_process\b|\bexecSync\b|\bspawnSync\b|\brequire\(["']child_process["']\)/gi, weight: 22 },
    { key: "lua-os-execute", pattern: /\bos\.execute\s*\(/gi, weight: 24 },
    { key: "download-pipe-shell", pattern: /\b(curl|wget)\b[\s\S]{0,120}\|\s*(sh|bash|powershell|pwsh)/gi, weight: 32 },
    { key: "powershell-encoded", pattern: /\bpowershell(?:\.exe)?\b[\s\S]{0,120}-(?:enc|encodedcommand)\b/gi, weight: 32 },
    { key: "install-lifecycle-script", pattern: /"(?:(?:pre|post)?install|prepare)"\s*:\s*"[^"]*(?:curl|wget|powershell|child_process|node\s+-e|bash|sh\b)/gi, weight: 26 },
    { key: "dynamic-eval", pattern: /\beval\s*\(|\bFunction\s*\(|setTimeout\s*\(\s*["'`][\s\S]{0,120}\)/gi, weight: 14 },
    { key: "obfuscated-base64", pattern: /(?:[A-Za-z0-9+/]{120,}={0,2})|(?:atob\s*\()|(?:Buffer\.from\s*\([^)]*base64)/gi, weight: 16 },
    { key: "remote-code-fetch", pattern: /\bfetch\s*\([^)]*https?:\/\/[^)]*\)\s*\.then[\s\S]{0,160}(?:eval|Function|exec)/gi, weight: 24 },
    { key: "known-malicious-package", pattern: /\b(flatmap-stream|event-stream|coa|rc|ua-parser-js|colors\.js)\b/gi, weight: 20 },
    { key: "secret-exfiltration-language", pattern: /\b(webhook|discordapp|telegram)\b[\s\S]{0,120}\b(token|password|secret|private[_-]?key|seed phrase)\b/gi, weight: 24 }
  ];

  const flags = [];
  let threatScore = 0;
  for (const signature of signatures) {
    const matches = input.match(signature.pattern);
    if (!matches?.length) {
      continue;
    }
    flags.push(signature.key);
    threatScore += Math.min(signature.weight * matches.length, signature.weight + 12);
  }

  threatScore = Math.min(100, threatScore);
  const riskTier = threatScore >= 60 ? "critical" : threatScore >= 30 ? "review" : "low";
  return {
    threat_score: threatScore,
    risk_tier: riskTier,
    flags,
    scanned_bytes: input.length
  };
}

function pipelineEvent(payload) {
  return {
    type: payload.type ?? "pipeline_ingestion_updated",
    message: payload.message,
    agent_stage: payload.agent_stage,
    active_ingestion: payload.active_ingestion,
    active_ingestions: activeIngestions.slice(0, 12),
    route_errors: routeErrors.slice(0, 12),
    pipeline: pipelineSnapshot()
  };
}

function pipelineSnapshot() {
  const active = activeIngestions.find((item) => !terminalStatuses.has(item.status)) ?? activeIngestions[0] ?? null;
  return {
    active_agent: active?.current_agent ?? "idle",
    active_ingestion_id: active?.id ?? null,
    queue_depth: activeIngestions.filter((item) => !terminalStatuses.has(item.status)).length,
    completed_recently: activeIngestions.filter((item) => item.status === "staged_for_review").length,
    route_errors: routeErrors.length,
    stages: ["research", "protection", "giving"].map((agent) => ({
      agent,
      status: active?.current_agent === agent ? "active" : active ? "standby" : "idle"
    }))
  };
}

function trimActiveIngestions() {
  activeIngestions.splice(12);
}

function trimRouteErrors() {
  routeErrors.splice(12);
}

function openTelemetryStream(request, response) {
  request.socket.setTimeout(0);
  setTelemetryHeaders(response);
  response.writeHead(200);

  const connection = {
    response,
    heartbeat: null
  };
  telemetryConnections.add(connection);

  writeTelemetryEvent(response, {
    type: "connected",
    message: "Telemetry bridge active",
    timestamp: new Date().toISOString()
  });
  writeTelemetryEvent(response, {
    type: "pipeline_baseline",
    message: "Active ingestion history synchronized",
    timestamp: new Date().toISOString(),
    active_ingestions: activeIngestions.slice(0, 12),
    route_errors: routeErrors.slice(0, 12),
    pipeline: pipelineSnapshot()
  });

  connection.heartbeat = setInterval(() => {
    try {
      response.write(`: heartbeat ${new Date().toISOString()}\n\n`);
    } catch {
      closeTelemetryConnection(connection);
    }
  }, 25000);
  connection.heartbeat.unref?.();

  const cleanup = () => closeTelemetryConnection(connection);
  request.on("close", cleanup);
  response.on("error", cleanup);
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function nextPollDelayMs(options = {}) {
  if (Number.isFinite(options.pollIntervalMs)) {
    return Math.max(1000, Number(options.pollIntervalMs));
  }
  const min = Number.isFinite(options.minPollIntervalMs) ? Number(options.minPollIntervalMs) : defaultResearchPollMinMs;
  const max = Number.isFinite(options.maxPollIntervalMs) ? Number(options.maxPollIntervalMs) : defaultResearchPollMaxMs;
  return randomInt(Math.min(min, max), Math.max(min, max));
}

async function waitForStageDelay(delayMs) {
  const delay = Number(delayMs ?? 0);
  if (!Number.isFinite(delay) || delay <= 0) {
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, delay));
}

function selectHighValueRepository(items) {
  return [...items]
    .filter((item) => item?.id && item?.full_name && item?.html_url && !researchCache.seenRepositoryIds.has(item.id))
    .map((item) => ({
      item,
      score: repositoryCandidateScore(item)
    }))
    .sort((left, right) => right.score - left.score)[0]?.item ?? null;
}

function repositoryCandidateScore(repository) {
  const description = `${repository.full_name ?? ""} ${repository.description ?? ""}`.toLowerCase();
  const keywordBoost = [
    "agent",
    "agentic",
    "workflow",
    "architecture",
    "mcp",
    "llm",
    "prompt",
    "luau",
    "performance",
    "benchmark"
  ].reduce((score, keyword) => score + (description.includes(keyword) ? 8 : 0), 0);
  const stars = Math.min(40, Math.log10((repository.stargazers_count ?? 0) + 1) * 16);
  const forks = Math.min(12, Math.log10((repository.forks_count ?? 0) + 1) * 6);
  const recent = recencyScore(repository.updated_at ?? repository.pushed_at);
  return keywordBoost + stars + forks + recent;
}

function repositoryTrustScore(repository) {
  return Math.max(10, Math.min(98, Math.round(42 + repositoryCandidateScore(repository) * 0.62)));
}

function recencyScore(value) {
  const timestamp = Date.parse(value ?? "");
  if (!Number.isFinite(timestamp)) {
    return 0;
  }
  const ageDays = (Date.now() - timestamp) / 86400000;
  if (ageDays <= 7) return 16;
  if (ageDays <= 30) return 12;
  if (ageDays <= 180) return 6;
  return 0;
}

function cleanSummary(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 260);
}

function readHeader(response, name) {
  return response.headers?.get?.(name) ?? response.headers?.[name] ?? response.headers?.[name.toLowerCase()] ?? null;
}

function routeError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}

function broadcastRouteError(error, details = {}) {
  const now = new Date().toISOString();
  const routeErrorPayload = {
    timestamp: now,
    route: details.route ?? error?.details?.route ?? "unknown",
    stage: details.stage ?? error?.details?.stage ?? "unknown",
    error_code: safeErrorCode(error),
    message: details.message ?? safeErrorMessage(error),
    target_url: error?.details?.target_url ?? null
  };
  routeErrors.unshift(routeErrorPayload);
  trimRouteErrors();
  return broadcastTelemetry({
    type: "pipeline_route_error",
    message: routeErrorPayload.message,
    agent_stage: routeErrorPayload.stage,
    route_error: routeErrorPayload,
    route_errors: routeErrors.slice(0, 12),
    active_ingestions: activeIngestions.slice(0, 12),
    pipeline: pipelineSnapshot()
  });
}

function slugify(value) {
  return String(value || "repository")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "repository";
}

function buildDispatchMarkdown(ingestion, options = {}) {
  const repository = ingestion.repository;
  const report = ingestion.protection_report ?? {};
  return [
    `# VNEM Live Intelligence Dispatch: ${repository.full_name}`,
    "",
    `Generated: ${options.generatedAt}`,
    "",
    "## Source",
    "",
    `- Repository: ${repository.full_name}`,
    `- URL: ${repository.html_url}`,
    `- Default branch: ${repository.default_branch}`,
    `- Language: ${repository.language ?? "unknown"}`,
    `- Stars: ${repository.stargazers_count ?? 0}`,
    `- Forks: ${repository.forks_count ?? 0}`,
    `- Updated: ${repository.updated_at ?? "unknown"}`,
    `- Discovery query: ${repository.query ?? defaultResearchQuery}`,
    "",
    "## Research AI Summary",
    "",
    repository.description || "No repository description provided.",
    "",
    "## Protection AI Report",
    "",
    `- Threat score: ${ingestion.threat_score}%`,
    `- Risk tier: ${ingestion.risk_tier}`,
    `- Flags: ${(report.flags ?? []).join(", ") || "none"}`,
    `- Scanned bytes: ${report.scanned_bytes ?? 0}`,
    `- Fetched assets: ${(report.fetched_assets ?? []).map((asset) => `${asset.label} (${asset.bytes_scanned ?? 0} bytes)`).join(", ") || "none"}`,
    `- Unavailable assets: ${(report.unavailable_assets ?? []).map((asset) => `${asset.label}:${asset.status ?? asset.error_code}`).join(", ") || "none"}`,
    "",
    "## Giving AI Recommendation",
    "",
    "Review this repository manually before promoting any pattern into VNEM. The dispatch is staged locally only; it does not modify VNEM runtime behavior.",
    "",
    "## Pipeline Timeline",
    "",
    ...(ingestion.timeline ?? []).slice().reverse().map((entry) => `- ${entry.timestamp} / ${entry.agent} / ${entry.status}: ${entry.message}`),
    ""
  ].join("\n");
}

function setTelemetryHeaders(response) {
  response.setHeader("content-type", "text/event-stream");
  response.setHeader("cache-control", "no-cache");
  response.setHeader("connection", "keep-alive");
}

function writeTelemetryEvent(response, event) {
  response.write(`data: ${JSON.stringify(event)}\n\n`);
}

function closeTelemetryConnection(connection) {
  if (!telemetryConnections.has(connection)) {
    return;
  }
  telemetryConnections.delete(connection);
  if (connection.heartbeat) {
    clearInterval(connection.heartbeat);
  }
}

function parseCliArgs(args) {
  const parsed = {
    port: defaultPort,
    status: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--status") {
      parsed.status = true;
      continue;
    }
    if (arg === "--port") {
      const next = args[index + 1];
      if (next == null) {
        throw new Error("--port requires a number");
      }
      parsed.port = normalizePort(next);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return parsed;
}

function normalizePort(value) {
  const text = String(value ?? defaultPort).trim();
  if (!/^\d+$/.test(text)) {
    throw new Error(`Invalid port: ${value}`);
  }
  const port = Number.parseInt(text, 10);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid port: ${value}`);
  }
  return port;
}

function listenOnLoopback(server, config, options = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;

    const onStartupError = (error) => {
      if (settled) {
        return;
      }
      settled = true;
      server.off("listening", onListening);
      reject(error);
    };

    const onRuntimeError = (error) => {
      if (typeof options.onRuntimeError === "function") {
        options.onRuntimeError(error);
      }
    };

    const onListening = () => {
      if (settled) {
        return;
      }
      settled = true;
      server.off("error", onStartupError);
      server.on("error", onRuntimeError);
      resolve();
    };

    server.once("error", onStartupError);
    server.once("listening", onListening);
    server.listen({
      host: loopbackHost,
      port: config.port,
      exclusive: true
    });
  });
}

function setBaseHeaders(request, response) {
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.setHeader("x-content-type-options", "nosniff");

  const origin = request.headers.origin;
  if (isAllowedOrigin(origin)) {
    if (origin && origin !== "null") {
      response.setHeader("access-control-allow-origin", origin);
      response.setHeader("vary", "origin");
    }
    response.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
    response.setHeader("access-control-allow-headers", "content-type");
  }
}

function validateLocalRequest(request) {
  if (!isLoopbackRemoteAddress(request.socket.remoteAddress)) {
    return { ok: false, reason: "non-loopback-remote-address" };
  }
  if (!isAllowedHostHeader(request.headers.host)) {
    return { ok: false, reason: "non-local-host-header" };
  }
  if (!isAllowedOrigin(request.headers.origin)) {
    return { ok: false, reason: "non-local-origin-header" };
  }
  return { ok: true };
}

function isAllowedHostHeader(hostHeader) {
  const host = extractHostName(hostHeader);
  return ["127.0.0.1", "localhost", "::1"].includes(host);
}

function isAllowedOrigin(origin) {
  if (origin == null || origin === "" || origin === "null") {
    return true;
  }
  try {
    const url = new URL(origin);
    return ["127.0.0.1", "localhost", "::1"].includes(url.hostname);
  } catch {
    return false;
  }
}

function isLoopbackRemoteAddress(remoteAddress) {
  return ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(String(remoteAddress || ""));
}

function extractHostName(hostHeader) {
  const text = String(hostHeader || "").trim().toLowerCase();
  if (!text || text.includes(",")) {
    return "";
  }
  if (text.startsWith("[")) {
    const end = text.indexOf("]");
    return end > 0 ? text.slice(1, end) : "";
  }
  const [host] = text.split(":");
  return host;
}

function sanitizeHeader(value) {
  return value == null ? null : String(value).slice(0, 180);
}

async function drainRequestBody(request) {
  const maxBytes = 1024 * 1024;
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > maxBytes) {
      const error = new Error("Request body exceeded 1 MiB");
      error.code = "PAYLOAD_TOO_LARGE";
      throw error;
    }
  }
}

function hasPermissionFailure(value, seen = new Set()) {
  if (!value || typeof value !== "object") {
    return false;
  }
  if (seen.has(value)) {
    return false;
  }
  seen.add(value);

  if (["EACCES", "EPERM"].includes(value.error_code) || value.action === "permission-denied") {
    return true;
  }

  return Object.values(value).some((item) => hasPermissionFailure(item, seen));
}

function writeJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  if (statusCode === 204) {
    response.end();
    return;
  }
  response.end(`${JSON.stringify(payload, null, 2)}\n`);
}

function isPermissionError(error) {
  return ["EACCES", "EPERM"].includes(error?.code);
}

function safeErrorCode(error) {
  return error?.code || error?.name || "unavailable";
}

function safeErrorMessage(error) {
  return String(error?.message || "vnem app server failed").slice(0, 240);
}

function usageGuide(error) {
  return [
    error ? `Error: ${error.message}` : null,
    "Usage:",
    "  node scripts/vnem-app-server.mjs [--port <number>]",
    "  node scripts/vnem-app-server.mjs --status [--port <number>]",
    "",
    "The server always binds to 127.0.0.1 and exposes local connector status, preview, apply, and rollback APIs."
  ].filter(Boolean).join("\n") + "\n";
}

if (isCliEntry()) {
  try {
    const cli = parseCliArgs(process.argv.slice(2));
    if (cli.status) {
      process.stdout.write(`${JSON.stringify(getAppServerStatus({ port: cli.port }), null, 2)}\n`);
    } else {
      const started = await startVnemAppServer({
        port: cli.port,
        onServerError: (error) => {
          writeStartupDiagnostic(error, { port: cli.port });
          process.exitCode = 1;
        }
      });
      process.stdout.write(`[vnem-app-server] Active and listening at ${started.url}\n`);
    }
  } catch (error) {
    if (isStartupBindError(error)) {
      writeStartupDiagnostic(error, { port: safePortFromErrorContext(process.argv.slice(2)) });
    } else {
      process.stdout.write(usageGuide(error));
    }
    process.exitCode = 1;
  }
}

function isStartupBindError(error) {
  return ["EADDRINUSE", "EACCES", "EPERM"].includes(error?.code);
}

function safePortFromErrorContext(args) {
  try {
    return parseCliArgs(args).port;
  } catch {
    return defaultPort;
  }
}

function writeStartupDiagnostic(error, options = {}) {
  const port = normalizePort(options.port ?? defaultPort);
  const diagnostic = {
    ok: false,
    service: "vnem-app-server",
    event: "startup-bind-failed",
    host: loopbackHost,
    port,
    url: `http://${loopbackHost}:${port}`,
    error_code: safeErrorCode(error),
    message: safeErrorMessage(error),
    next_action: startupFailureNextAction(error)
  };
  process.stdout.write(`[vnem-app-server] Failed to bind ${diagnostic.url}\n`);
  process.stdout.write(`${JSON.stringify(diagnostic, null, 2)}\n`);
}

function startupFailureNextAction(error) {
  if (error?.code === "EADDRINUSE") {
    return "Port 9099 is already occupied. Stop the existing process or start VNEM with --port <free-port> and update the dashboard base URL.";
  }
  if (["EACCES", "EPERM"].includes(error?.code)) {
    return "The OS denied binding to the loopback socket. Run from a normal user shell, check local security software, or choose another unprivileged port.";
  }
  return "Inspect the startup error and retry after the blocking socket condition is removed.";
}

function isCliEntry() {
  if (!process.argv[1]) {
    return false;
  }
  const executedPath = path.resolve(process.argv[1]).toLowerCase();
  const modulePath = fileURLToPath(import.meta.url).toLowerCase();
  return executedPath === modulePath;
}
