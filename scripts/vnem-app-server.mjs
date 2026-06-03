#!/usr/bin/env node
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyConnectorChanges } from "./apply-connector-changes.mjs";
import { detectAiClients } from "./detect-ai-clients.mjs";
import { loadLocalEnv } from "./local-env.mjs";
import { generateConnectorPreviews } from "./preview-connector-changes.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
loadLocalEnv(rootDir);
const loopbackHost = "127.0.0.1";
const defaultPort = 9099;
const telemetryConnections = new Set();
const activeIngestions = [];
const routeErrors = [];
const openRouterProviderErrors = [];
let openRouterProviderState = {
  status: "missing_key",
  model: "local-fallback",
  last_error_at: null,
  retry_after: null
};
let intelligenceTimer = null;
let intelligenceFirstCycle = null;
let openRouterQueue = Promise.resolve();
let liveIntelligenceRuntime = {
  repositoryRoot: rootDir,
  fetchImpl: null,
  pollIntervalMs: null,
  minPollIntervalMs: null,
  maxPollIntervalMs: null,
  stageDelayMs: null
};
let pipelineSequence = 0;
const terminalStatuses = new Set(["staged_for_review", "isolated_by_protection", "research_no_candidate"]);
const researchCache = {
  etag: null,
  lastFetchAt: 0,
  nextPollAt: 0,
  lastQuery: null,
  lastVector: null,
  seenRepositoryIds: new Set()
};
const defaultResearchQuery = "luau architecture OR agentic workflow";
const defaultThreatTolerance = 30;
const defaultIntelligenceVector = "github";
const intelligenceVectors = new Set(["github", "npm", "mcp"]);
const defaultResearchPollMinMs = 5 * 60 * 1000;
const defaultResearchPollMaxMs = 10 * 60 * 1000;
const openRouterChatCompletionsUrl = "https://openrouter.ai/api/v1/chat/completions";
const openRouterHermesModel = "nousresearch/hermes-3-llama-3.1-405b:free";
const intelligenceMission = {
  query: defaultResearchQuery,
  vector: defaultIntelligenceVector,
  threatTolerance: defaultThreatTolerance,
  updatedAt: null,
  revision: 0,
  source: "default"
};
const endpoints = [
  "GET /api/connector/status",
  "GET /api/connector/preview",
  "POST /api/connector/apply",
  "POST /api/connector/rollback",
  "GET /api/telemetry/history",
  "GET /api/telemetry/stream",
  "POST /api/intelligence/target",
  "GET /api/intelligence/dispatch/:id",
  "POST /api/intelligence/dispatch/:id/approve",
  "POST /api/intelligence/dispatch/:id/reject"
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
    },
    intelligence_mission: missionSnapshot(),
    intelligence_provider: intelligenceProviderSnapshot()
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

      if (route === "POST /api/intelligence/target") {
        const payload = await readJsonRequest(request, { maxBytes: 16 * 1024 });
        const result = retargetLiveIntelligence(payload, {
          repositoryRoot
        });
        writeJson(response, 202, result);
        return;
      }

      const dispatchRoute = matchDispatchRoute(request.method, url.pathname);
      if (dispatchRoute) {
        if (dispatchRoute.action === "read") {
          const result = await readDispatchForReview(dispatchRoute.id, { repositoryRoot });
          writeJson(response, 200, result);
          return;
        }
        await drainRequestBody(request);
        const result = await resolveDispatchReview(dispatchRoute.id, dispatchRoute.action, { repositoryRoot });
        writeJson(response, 200, result);
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

      if (url.pathname.startsWith("/api/intelligence/")) {
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
      const status = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
      writeJson(response, status, {
        ok: false,
        error: error?.publicError ?? (isPermissionError(error) ? "permission-denied" : "vnem-app-server-error"),
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
    mission: missionSnapshot(),
    pipeline: pipelineSnapshot(),
    intelligence_provider: intelligenceProviderSnapshot()
  };
}

export async function readDispatchForReview(id, options = {}) {
  const ingestion = findDispatchIngestion(id);
  const staged = dispatchStagedFile(ingestion);
  const stagingDir = path.join(path.resolve(options.repositoryRoot || rootDir), ".vnem", "staging");
  const filePath = safeChildPath(stagingDir, staged.file_name);
  const markdown = await readFile(filePath, "utf8");
  return {
    ok: true,
    dispatch: {
      id: ingestion.id,
      title: ingestion.title,
      status: ingestion.status,
      file_name: staged.file_name,
      generated_at: staged.generated_at ?? null,
      source_route: ingestion.source_route,
      source_url: ingestion.source_url ?? ingestion.repository?.html_url ?? null,
      protection_report: ingestion.protection_report ?? null
    },
    markdown
  };
}

export async function resolveDispatchReview(id, action, options = {}) {
  if (!["approve", "reject"].includes(action)) {
    throw httpError(405, "INVALID_DISPATCH_ACTION", "Dispatch action must be approve or reject.");
  }

  const repositoryRoot = path.resolve(options.repositoryRoot || rootDir);
  const ingestion = findDispatchIngestion(id);
  const staged = dispatchStagedFile(ingestion);
  const stagingDir = path.join(repositoryRoot, ".vnem", "staging");
  const sourcePath = safeChildPath(stagingDir, staged.file_name);
  const now = new Date().toISOString();

  if (action === "approve") {
    const approvedDir = path.join(repositoryRoot, ".vnem", "approved");
    await mkdir(approvedDir, { recursive: true });
    const approvedPath = safeChildPath(approvedDir, staged.file_name);
    await rename(sourcePath, approvedPath);
    Object.assign(ingestion, {
      current_agent: "complete",
      status: "completed",
      action_dispatch: "Approved",
      approved_dispatch: {
        path: approvedPath,
        file_name: staged.file_name,
        approved_at: now
      },
      staged_dispatch: null,
      updated_at: now,
      latest_event: {
        agent: "review",
        message: `Maintainer approved ${staged.file_name}; dispatch moved to ${approvedPath}.`,
        timestamp: now
      }
    });
    ingestion.timeline.unshift({
      agent: "review",
      status: ingestion.status,
      message: ingestion.latest_event.message,
      timestamp: now
    });
    ingestion.timeline = ingestion.timeline.slice(0, 8);
    const event = pipelineEvent({
      type: "dispatch_approved",
      message: ingestion.latest_event.message,
      agent_stage: "review",
      active_ingestion: ingestion
    });
    broadcastTelemetry(event);
    return {
      ok: true,
      status: "completed",
      dispatch: {
        id: ingestion.id,
        approved_file_name: staged.file_name,
        approved_path: approvedPath
      }
    };
  }

  await rm(sourcePath, { force: true });
  const index = activeIngestions.findIndex((item) => item.id === ingestion.id);
  if (index >= 0) {
    activeIngestions.splice(index, 1);
  }
  const event = pipelineEvent({
    type: "dispatch_rejected",
    message: `Maintainer rejected ${staged.file_name}; staged dispatch discarded without applying code.`,
    agent_stage: "review"
  });
  broadcastTelemetry(event);
  return {
    ok: true,
    status: "rejected",
    dispatch: {
      id: ingestion.id,
      rejected_file_name: staged.file_name,
      rejected_at: now
    }
  };
}

export function retargetLiveIntelligence(payload, options = {}) {
  const normalized = normalizeIntelligenceTarget(payload);
  const mission = updateIntelligenceMission({
    query: normalized.query,
    vector: normalized.vector,
    threatTolerance: normalized.threatTolerance,
    source: "dashboard"
  });
  updateLiveIntelligenceRuntime({
    repositoryRoot: options.repositoryRoot
  });

  const event = pipelineEvent({
    type: "mission_updated",
    message: `Research AI retargeted to: ${mission.query}`,
    agent_stage: "research"
  });
  broadcastTelemetry(event);

  const cycleOptions = {
    ...liveIntelligenceRuntime,
    query: mission.query,
    vector: mission.vector,
    threatTolerance: mission.threat_tolerance,
    force: true
  };
  intelligenceFirstCycle = runLiveIntelligenceCycle(cycleOptions).catch((error) => broadcastRouteError(error, {
    message: `Forced intelligence cycle failed for "${mission.query}".`,
    route: "github-search",
    stage: "research"
  }));

  return {
    ok: true,
    status: "retargeted",
    cycle_status: "started",
    mission
  };
}

export function startLiveIntelligenceEngine(options = {}) {
  updateLiveIntelligenceRuntime(options);
  if (intelligenceTimer) {
    return {
      firstCycle: intelligenceFirstCycle ?? Promise.resolve(null)
    };
  }

  intelligenceFirstCycle = runLiveIntelligenceCycle({
    ...liveIntelligenceRuntime,
    force: options.force ?? true
  }).catch((error) => broadcastRouteError(error, {
    message: "Live intelligence engine failed during initial cycle."
  }));

  const schedule = () => {
    const delayMs = nextPollDelayMs(liveIntelligenceRuntime);
    intelligenceTimer = setTimeout(() => {
      intelligenceTimer = null;
      void runLiveIntelligenceCycle(liveIntelligenceRuntime).catch((error) => broadcastRouteError(error, {
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
  const query = normalizeResearchQuery(options.query ?? intelligenceMission.query);
  const vector = normalizeIntelligenceVector(options.vector ?? intelligenceMission.vector);
  const threatTolerance = normalizeThreatTolerance(options.threatTolerance ?? intelligenceMission.threatTolerance);
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
    query,
    vector
  });

  if (!ingestion) {
    const descriptor = vectorDescriptor(vector);
    const event = pipelineEvent({
      type: "pipeline_research_noop",
      message: `Research AI skipped ${descriptor.origin} polling because the live search cache is still fresh.`,
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
  const protectedIngestion = await runProtectionScan(ingestion, { fetchImpl, threatTolerance });
  broadcastTelemetry(pipelineEvent({
    message: protectedIngestion.latest_event.message,
    agent_stage: protectedIngestion.current_agent,
    active_ingestion: protectedIngestion
  }));

  if (protectedIngestion.threat_score >= threatTolerance) {
    return pipelineEvent({
      message: protectedIngestion.latest_event.message,
      agent_stage: protectedIngestion.current_agent,
      active_ingestion: protectedIngestion
    });
  }

  await waitForStageDelay(options.stageDelayMs);
  const staged = await runGivingStaging(protectedIngestion, { repositoryRoot, fetchImpl });
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
  const query = normalizeResearchQuery(options.query ?? intelligenceMission.query);
  const vector = normalizeIntelligenceVector(options.vector ?? intelligenceMission.vector);
  if (researchCache.lastQuery !== query || researchCache.lastVector !== vector) {
    researchCache.etag = null;
    researchCache.nextPollAt = 0;
    researchCache.lastQuery = query;
    researchCache.lastVector = vector;
    researchCache.seenRepositoryIds.clear();
  }

  if (vector === "npm") {
    const ingestion = await researchNpmPackageCandidate({
      ...options,
      fetchImpl,
      query
    });
    return applyResearchCoreInference(ingestion, {
      fetchImpl,
      query,
      vector,
      sourceContext: ingestion?.repository
    });
  }

  if (vector === "mcp") {
    researchCache.lastFetchAt = now;
    researchCache.nextPollAt = now + nextPollDelayMs(options);
    const ingestion = createMcpRegistryIngestion(query);
    return applyResearchCoreInference(ingestion, {
      fetchImpl,
      query,
      vector,
      sourceContext: ingestion.repository
    });
  }

  const ingestion = await researchGithubRepositoryCandidate({
    ...options,
    fetchImpl,
    query
  });
  return applyResearchCoreInference(ingestion, {
    fetchImpl,
    query,
    vector,
    sourceContext: ingestion?.repository
  });
}

async function applyResearchCoreInference(ingestion, options = {}) {
  if (!ingestion || ingestion.status === "research_no_candidate" || !isOpenRouterConfigured()) {
    return ingestion;
  }

  const result = await callOpenRouterJson({
    fetchImpl: options.fetchImpl,
    stage: "research",
    maxTokens: 420,
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content: [
          "You are VNEM Research Core.",
          "Evaluate the user's research query and the provided source candidate.",
          "Return only JSON with keys: title, description, source_route, candidate_score.",
          "title must be concise. description must be realistic and implementation-focused.",
          "source_route must be one of github-search, npm-search, or mcp-registry.",
          "candidate_score must be an integer from 1 to 100."
        ].join(" ")
      },
      {
        role: "user",
        content: JSON.stringify({
          query: options.query,
          vector: options.vector,
          source_candidate: compactForModel(options.sourceContext ?? ingestion.repository)
        })
      }
    ]
  });

  if (!result.ok) {
    recordOpenRouterFallback(result, "research");
    return ingestion;
  }

  const payload = result.json;
  const title = cleanSummary(payload.title).slice(0, 120);
  const description = cleanSummary(payload.description);
  const sourceRoute = normalizeLlmSourceRoute(payload.source_route, ingestion.source_route);
  const candidateScore = clampScore(payload.candidate_score, 1, 100, ingestion.trust_score ?? 50);
  if (!title || !description) {
    return ingestion;
  }

  const now = new Date().toISOString();
  ingestion.title = title;
  ingestion.source_route = sourceRoute;
  ingestion.trust_score = candidateScore;
  ingestion.repository.full_name = title;
  ingestion.repository.name = title;
  ingestion.repository.description = description;
  ingestion.repository.source_route = sourceRoute;
  ingestion.repository.llm_research = {
    provider: "openrouter",
    model: openRouterHermesModel,
    candidate_score: candidateScore,
    generated_at: now
  };
  ingestion.latest_event = {
    agent: "research",
    message: `Research AI evaluated ${title}: ${description}`,
    timestamp: now
  };
  ingestion.timeline.unshift({
    agent: "research",
    status: ingestion.status,
    message: ingestion.latest_event.message,
    timestamp: now
  });
  ingestion.timeline = ingestion.timeline.slice(0, 8);
  return ingestion;
}

async function researchGithubRepositoryCandidate(options = {}) {
  const now = Date.now();
  const fetchImpl = options.fetchImpl;
  const query = options.query;
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
    return createResearchNoCandidateIngestion(query, "github");
  }

  researchCache.seenRepositoryIds.add(candidate.id);
  return createRepositoryIngestion(candidate, {
    query,
    vector: "github",
    trigger: "live_github_search"
  });
}

async function researchNpmPackageCandidate(options = {}) {
  const now = Date.now();
  const fetchImpl = options.fetchImpl;
  const query = options.query;
  const url = new URL("https://registry.npmjs.org/-/v1/search");
  url.searchParams.set("text", query);
  url.searchParams.set("size", "5");

  const response = await fetchImpl(url.href, {
    headers: {
      accept: "application/json",
      "user-agent": "vnem-live-intelligence-engine"
    }
  });
  researchCache.lastFetchAt = now;
  researchCache.nextPollAt = now + nextPollDelayMs(options);

  if (response.status === 403 || response.status === 429) {
    throw routeError("NPM_RATE_LIMITED", `NPM Registry search rate limited VNEM with HTTP ${response.status}.`, {
      route: "npm-search",
      stage: "research",
      target_url: url.href
    });
  }
  if (!response.ok) {
    throw routeError(`NPM_HTTP_${response.status}`, `NPM Registry search returned HTTP ${response.status}.`, {
      route: "npm-search",
      stage: "research",
      target_url: url.href
    });
  }

  const body = await response.json();
  const candidate = selectHighValueNpmPackage(body.objects ?? []);
  if (!candidate) {
    return createResearchNoCandidateIngestion(query, "npm");
  }

  const packageName = candidate.package?.name;
  if (packageName) {
    researchCache.seenRepositoryIds.add(`npm:${packageName}`);
  }
  return createNpmPackageIngestion(candidate, {
    query,
    trigger: "live_npm_search"
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
      kind: "github_repository",
      vector: options.vector ?? "github",
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
      query: options.query ?? defaultResearchQuery,
      source_route: "github-search"
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

function createNpmPackageIngestion(candidate, options = {}) {
  pipelineSequence += 1;
  const now = new Date().toISOString();
  const packageData = candidate.package ?? {};
  const packageName = packageData.name ?? "unknown-package";
  const description = cleanSummary(packageData.description || "No package description provided.");
  const npmUrl = packageData.links?.npm ?? `https://www.npmjs.com/package/${encodeURIComponent(packageName)}`;
  const keywords = Array.isArray(packageData.keywords) ? packageData.keywords.filter(Boolean) : [];
  const maintainers = Array.isArray(packageData.maintainers) ? packageData.maintainers.filter(Boolean) : [];
  const publisher = packageData.publisher ?? null;
  const scoreComponents = npmScoreComponents(candidate);
  const message = `Research AI discovered NPM package ${packageName}: ${description}`;
  const ingestion = {
    id: `ingestion-${pipelineSequence}-npm-${slugify(packageName)}`,
    trigger: options.trigger ?? "live_npm_search",
    title: packageName,
    source_origin: "NPM Package Registry",
    source_route: "npm-search",
    source_url: npmUrl,
    repository_target: npmUrl,
    repository: {
      kind: "npm_package",
      vector: "npm",
      id: `npm:${packageName}`,
      owner: publisher?.username ?? maintainers[0]?.username ?? "npm",
      name: packageName,
      full_name: packageName,
      html_url: npmUrl,
      default_branch: null,
      description,
      language: "JavaScript",
      updated_at: packageData.date ?? null,
      pushed_at: packageData.date ?? null,
      query: options.query ?? defaultResearchQuery,
      source_route: "npm-search",
      package: {
        name: packageName,
        version: packageData.version ?? null,
        keywords,
        publisher,
        maintainers,
        links: packageData.links ?? {},
        score: candidate.score ?? null,
        search_score: candidate.searchScore ?? null
      },
      diagnostics: {
        vector: "npm",
        score_components: scoreComponents,
        trust_score_formula: "clamp(12, 96, round(40 + candidate_score * 0.58))",
        metadata_source: "NPM Registry /-/v1/search"
      },
      audit_text: buildNpmAuditText(packageData, candidate)
    },
    current_agent: "research",
    status: "researching",
    trust_score: npmTrustScore(candidate),
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

function createMcpRegistryIngestion(query) {
  pipelineSequence += 1;
  const now = new Date().toISOString();
  const toolName = `${query} MCP server`;
  const description = cleanSummary(`Deterministic MCP registry lead for ${query}. This local V1 adapter models the MCP catalog route until live registry federation is wired into the app server.`);
  const url = `vnem://mcp-registry/${slugify(query)}`;
  const message = `Research AI discovered MCP catalog lead ${toolName}: ${description}`;
  const ingestion = {
    id: `ingestion-${pipelineSequence}-mcp-${slugify(query)}`,
    trigger: "local_mcp_registry_adapter",
    title: toolName,
    source_origin: "MCP Tool Catalog",
    source_route: "mcp-registry",
    source_url: url,
    repository_target: url,
    repository: {
      kind: "mcp_tool",
      vector: "mcp",
      id: `mcp:${slugify(query)}`,
      owner: "vnem",
      name: toolName,
      full_name: toolName,
      html_url: url,
      default_branch: null,
      description,
      language: "MCP",
      updated_at: now,
      pushed_at: now,
      query,
      source_route: "mcp-registry",
      package: {
        name: toolName,
        version: "catalog-preview",
        keywords: ["mcp", "tool", "agent", ...query.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 5)],
        publisher: { username: "vnem" },
        maintainers: [{ username: "vnem" }],
        links: { npm: null },
        score: { final: 0.78 },
        search_score: 0.78
      },
      adapter: {
        mode: "deterministic-local",
        route: "mcp-registry",
        sync_status: "local-preview-until-federated-registry-sync",
        execution: "catalog metadata only; no remote install or mutation"
      },
      diagnostics: {
        vector: "mcp",
        adapter: "local deterministic MCP registry adapter",
        route: "mcp-registry",
        sync_status: "federated registry sync pending",
        metadata_source: "local catalog simulation"
      },
      audit_text: [
        `name: ${toolName}`,
        `description: ${description}`,
        `keywords: mcp, tool, agent, ${query}`,
        "source: local deterministic MCP registry adapter",
        "execution: read-only catalog signal, no package install command"
      ].join("\n")
    },
    current_agent: "research",
    status: "researching",
    trust_score: 72,
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

function createResearchNoCandidateIngestion(query, vector = "github") {
  pipelineSequence += 1;
  const now = new Date().toISOString();
  const descriptor = vectorDescriptor(vector);
  const message = `Research AI polled ${descriptor.origin} for "${query}" but found no new high-value candidate.`;
  const ingestion = {
    id: `ingestion-${pipelineSequence}-no-candidate`,
    trigger: `live_${vector}_search`,
    title: "No high-value candidate",
    source_origin: descriptor.origin,
    source_route: descriptor.route,
    source_url: descriptor.url,
    repository_target: null,
    repository: {
      kind: `${vector}_no_candidate`,
      vector,
      query,
      full_name: "No high-value candidate",
      html_url: descriptor.url,
      description: message,
      source_route: descriptor.route
    },
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
  const localScan = scanThreatSignatures(audit.combinedText);
  const scan = await runProtectionGuardInference(ingestion, audit, localScan, {
    fetchImpl: options.fetchImpl
  });
  const threatTolerance = normalizeThreatTolerance(options.threatTolerance ?? intelligenceMission.threatTolerance);
  const now = new Date().toISOString();
  const blocked = scan.threat_score >= threatTolerance;

  Object.assign(ingestion, {
    current_agent: "protection",
    status: blocked ? "isolated_by_protection" : "sandboxing",
    threat_score: scan.threat_score,
    risk_tier: scan.risk_tier,
    action_dispatch: blocked ? "Isolated by Protection AI" : "Scanning",
    protection_report: {
      ...scan,
      block_threshold: threatTolerance,
      threat_tolerance: threatTolerance,
      fetched_assets: audit.fetchedAssets,
      unavailable_assets: audit.unavailableAssets
    },
    updated_at: now,
    latest_event: {
      agent: "protection",
      message: blocked
        ? `Protection AI isolated ${ingestion.repository.full_name}. Threat score: ${scan.threat_score}% exceeded the ${threatTolerance}% tolerance. Flags: ${scan.flags.join(", ") || "none"}.`
        : `Protection AI scanned README/package surfaces for ${ingestion.repository.full_name}. Threat score: ${scan.threat_score}% below the ${threatTolerance}% tolerance. No blocking signatures found.`,
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

async function runProtectionGuardInference(ingestion, audit, localScan, options = {}) {
  if (!isOpenRouterConfigured()) {
    return localScan;
  }

  const result = await callOpenRouterJson({
    fetchImpl: options.fetchImpl,
    stage: "protection",
    maxTokens: 460,
    temperature: 0.1,
    messages: [
      {
        role: "system",
        content: [
          "You are VNEM Protection Guard.",
          "Analyze the source description, metadata, and code/documentation context for vulnerabilities, malware, destructive lifecycle scripts, and suspicious automation.",
          "Return only JSON with keys: threat_score, flags.",
          "threat_score must be an integer from 0 to 100.",
          "flags must be an array of short kebab-case strings.",
          "Do not invent flags if the context is clean."
        ].join(" ")
      },
      {
        role: "user",
        content: JSON.stringify({
          candidate: compactForModel(ingestion.repository),
          local_regex_scan: localScan,
          fetched_assets: audit.fetchedAssets,
          unavailable_assets: audit.unavailableAssets,
          audit_context: String(audit.combinedText ?? "").slice(0, 12000)
        })
      }
    ]
  });

  if (!result.ok) {
    recordOpenRouterFallback(result, "protection");
    return localScan;
  }

  const flags = Array.isArray(result.json.flags)
    ? result.json.flags.map((flag) => slugify(flag)).filter(Boolean).slice(0, 12)
    : [];
  const threatScore = clampScore(result.json.threat_score, 0, 100, localScan.threat_score);
  return {
    threat_score: threatScore,
    risk_tier: threatScore >= 60 ? "critical" : threatScore >= 30 ? "review" : "low",
    flags,
    scanned_bytes: audit.combinedText.length,
    model_provider: "openrouter",
    model: openRouterHermesModel,
    local_regex_scan: localScan
  };
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
  const content = await buildGivingDispatchMarkdown(ingestion, {
    fetchImpl: options.fetchImpl,
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

async function buildGivingDispatchMarkdown(ingestion, options = {}) {
  if (!isOpenRouterConfigured()) {
    return buildDispatchMarkdown(ingestion, options);
  }

  const result = await callOpenRouterJson({
    fetchImpl: options.fetchImpl,
    stage: "giving",
    maxTokens: 900,
    temperature: 0.25,
    messages: [
      {
        role: "system",
        content: [
          "You are VNEM Giving Core.",
          "Write reviewable Markdown deployment notes for a maintainer.",
          "Return only JSON with key markdown.",
          "The markdown must summarize the discovery, safety checks, and a theoretical integration plan.",
          "Do not claim that code was merged or installed. The dispatch is staged locally for review only."
        ].join(" ")
      },
      {
        role: "user",
        content: JSON.stringify({
          generated_at: options.generatedAt,
          ingestion: compactForModel(ingestion),
          protection_report: ingestion.protection_report
        })
      }
    ]
  });

  if (!result.ok) {
    recordOpenRouterFallback(result, "giving");
    return buildDispatchMarkdown(ingestion, options);
  }

  const markdown = String(result.json.markdown ?? "").trim();
  if (!markdown || markdown.length < 80) {
    return buildDispatchMarkdown(ingestion, options);
  }
  return [
    markdown,
    "",
    "---",
    "",
    `Generated by: OpenRouter / ${openRouterHermesModel}`,
    `Generated at: ${options.generatedAt}`
  ].join("\n");
}

async function fetchRepositoryAuditText(repository, options = {}) {
  const fetchImpl = options.fetchImpl;
  if (repository.kind !== "github_repository" || !repository.owner || !repository.name || !repository.default_branch) {
    const text = [
      repository.audit_text,
      repository.description,
      JSON.stringify(repository.package ?? {}, null, 2)
    ].filter(Boolean).join("\n\n").slice(0, 160000);
    return {
      combinedText: text,
      fetchedAssets: [
        {
          label: repository.kind === "npm_package" ? "npm-search-metadata" : "catalog-metadata",
          bytes_scanned: text.length
        }
      ],
      unavailableAssets: []
    };
  }

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

export async function callOpenRouterJson(options = {}) {
  const runQueued = () => executeOpenRouterJsonRequest(options);
  const queued = openRouterQueue.then(runQueued, runQueued);
  openRouterQueue = queued.catch(() => null);
  return queued;
}

async function executeOpenRouterJsonRequest(options = {}) {
  const apiKey = String(process.env.OPENROUTER_API_KEY ?? "").trim();
  if (!apiKey) {
    setOpenRouterProviderState("missing_key", {
      message: "OPENROUTER_API_KEY is not configured.",
      stage: options.stage ?? "unknown"
    });
    return {
      ok: false,
      code: "OPENROUTER_API_KEY_MISSING",
      error: routeError("OPENROUTER_API_KEY_MISSING", "OPENROUTER_API_KEY is not configured.", {
        route: "openrouter",
        stage: options.stage ?? "unknown"
      })
    };
  }

  const fetchImpl = options.fetchImpl ?? globalThis.fetch?.bind(globalThis);
  if (typeof fetchImpl !== "function") {
    setOpenRouterProviderState("local_fallback", {
      code: "OPENROUTER_FETCH_UNAVAILABLE",
      message: "No fetch implementation is available for OpenRouter.",
      stage: options.stage ?? "unknown"
    });
    return {
      ok: false,
      code: "OPENROUTER_FETCH_UNAVAILABLE",
      error: routeError("OPENROUTER_FETCH_UNAVAILABLE", "No fetch implementation is available for OpenRouter.", {
        route: "openrouter",
        stage: options.stage ?? "unknown"
      })
    };
  }

  const requestBody = {
    model: options.model ?? openRouterHermesModel,
    messages: options.messages ?? [],
    response_format: { type: "json_object" },
    temperature: Number.isFinite(options.temperature) ? options.temperature : 0.2,
    max_tokens: Number.isFinite(options.maxTokens) ? options.maxTokens : 600
  };
  const maxRateLimitRetries = Number.isInteger(options.maxRateLimitRetries) ? options.maxRateLimitRetries : 1;
  const sleepImpl = typeof options.sleepImpl === "function" ? options.sleepImpl : sleep;

  for (let attempt = 0; attempt <= maxRateLimitRetries; attempt += 1) {
    try {
      const response = await fetchImpl(openRouterChatCompletionsUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "X-Title": "VNEM Hermes"
        },
        body: JSON.stringify(requestBody)
      });

      if (response.status === 429) {
        const retryAfter = readHeader(response, "retry-after");
        const backoffMs = parseRetryAfterMs(retryAfter);
        const retryUntil = new Date(Date.now() + backoffMs).toISOString();
        const errorContext = {
          code: "OPENROUTER_RATE_LIMITED",
          message: `OpenRouter rate limited VNEM; pausing ${options.stage ?? "unknown"} stage for ${Math.ceil(backoffMs / 1000)}s before requeue.`,
          retry_after: retryAfter,
          retry_after_ms: backoffMs,
          retry_until: retryUntil,
          stage: options.stage ?? "unknown"
        };
        setOpenRouterProviderState("paused_for_backoff", errorContext);
        broadcastTelemetry({
          type: "intelligence_provider",
          message: errorContext.message,
          status: "paused_for_backoff",
          agent_stage: options.stage ?? "unknown",
          retry_after: retryAfter,
          retry_after_ms: backoffMs,
          retry_until: retryUntil,
          intelligence_provider: intelligenceProviderSnapshot(),
          active_ingestions: activeIngestions.slice(0, 12),
          mission: missionSnapshot(),
          pipeline: pipelineSnapshot()
        });
        if (attempt < maxRateLimitRetries) {
          await sleepImpl(backoffMs);
          continue;
        }
        return {
          ok: false,
          code: "OPENROUTER_RATE_LIMITED",
          retryAfter,
          retryAfterMs: backoffMs,
          retryUntil,
          error: routeError("OPENROUTER_RATE_LIMITED", errorContext.message, {
            route: "openrouter",
            stage: options.stage ?? "unknown",
            target_url: openRouterChatCompletionsUrl,
            retry_after: retryAfter,
            retry_after_ms: backoffMs,
            retry_until: retryUntil
          })
        };
      }

      if (!response.ok) {
        const bodyText = await safeReadText(response);
        setOpenRouterProviderState("local_fallback", {
          code: `OPENROUTER_HTTP_${response.status}`,
          message: `OpenRouter returned HTTP ${response.status}.`,
          response_excerpt: bodyText.slice(0, 500),
          stage: options.stage ?? "unknown"
        });
        return {
          ok: false,
          code: `OPENROUTER_HTTP_${response.status}`,
          error: routeError(`OPENROUTER_HTTP_${response.status}`, `OpenRouter returned HTTP ${response.status}.`, {
            route: "openrouter",
            stage: options.stage ?? "unknown",
            target_url: openRouterChatCompletionsUrl,
            response_excerpt: bodyText.slice(0, 500)
          })
        };
      }

      const responseBody = await response.json();
      const content = responseBody?.choices?.[0]?.message?.content;
      const json = parseJsonObjectContent(content);
      setOpenRouterProviderState("active");
      return {
        ok: true,
        json,
        raw: responseBody
      };
    } catch (cause) {
      setOpenRouterProviderState("local_fallback", {
        code: "OPENROUTER_REQUEST_FAILED",
        message: `OpenRouter request failed: ${safeErrorMessage(cause)}`,
        stage: options.stage ?? "unknown"
      });
      return {
        ok: false,
        code: "OPENROUTER_REQUEST_FAILED",
        error: routeError("OPENROUTER_REQUEST_FAILED", `OpenRouter request failed: ${safeErrorMessage(cause)}`, {
          route: "openrouter",
          stage: options.stage ?? "unknown",
          target_url: openRouterChatCompletionsUrl
        })
      };
    }
  }

  return {
    ok: false,
    code: "OPENROUTER_QUEUE_EXHAUSTED",
    error: routeError("OPENROUTER_QUEUE_EXHAUSTED", "OpenRouter queue exhausted without a response.", {
      route: "openrouter",
      stage: options.stage ?? "unknown"
    })
  };
}

function intelligenceProviderSnapshot() {
  const hasKey = isOpenRouterConfigured();
  const status = hasKey ? openRouterProviderState.status === "missing_key" ? "active" : openRouterProviderState.status : "missing_key";
  const model = ["active", "paused_for_backoff"].includes(status) ? openRouterHermesModel : "local-fallback";
  return {
    status,
    model,
    configured: hasKey,
    retry_after: openRouterProviderState.retry_after ?? null,
    retry_after_ms: openRouterProviderState.retry_after_ms ?? null,
    retry_until: openRouterProviderState.retry_until ?? null,
    last_error_at: openRouterProviderState.last_error_at ?? null,
    errors: openRouterProviderErrors.slice(0, 6)
  };
}

function setOpenRouterProviderState(status, error = null) {
  const normalized = status === "local_fallback" ? "local_fallback" : status;
  openRouterProviderState = {
    status: normalized,
    model: ["active", "paused_for_backoff"].includes(normalized) ? openRouterHermesModel : "local-fallback",
    last_error_at: error ? new Date().toISOString() : openRouterProviderState.last_error_at,
    retry_after: error?.retry_after ?? null,
    retry_after_ms: error?.retry_after_ms ?? null,
    retry_until: error?.retry_until ?? null
  };

  if (error) {
    openRouterProviderErrors.unshift({
      timestamp: openRouterProviderState.last_error_at,
      status: normalized,
      code: error.code ?? normalized,
      message: error.message ?? "OpenRouter provider fallback activated.",
      stage: error.stage ?? "unknown",
      retry_after: error.retry_after ?? null,
      retry_after_ms: error.retry_after_ms ?? null,
      retry_until: error.retry_until ?? null,
      response_excerpt: error.response_excerpt ?? null
    });
    openRouterProviderErrors.splice(6);
  }

  return intelligenceProviderSnapshot();
}

function isOpenRouterConfigured() {
  return Boolean(String(process.env.OPENROUTER_API_KEY ?? "").trim());
}

function parseJsonObjectContent(content) {
  if (content && typeof content === "object" && !Array.isArray(content)) {
    return content;
  }
  const text = String(content ?? "").trim();
  if (!text) {
    throw new Error("OpenRouter returned an empty message content.");
  }
  try {
    return JSON.parse(text);
  } catch {
    const objectMatch = text.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      return JSON.parse(objectMatch[0]);
    }
    throw new Error("OpenRouter response content was not valid JSON.");
  }
}

function parseRetryAfterMs(value) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return 1000;
  }
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.max(0, Math.round(seconds * 1000));
  }
  const retryAt = Date.parse(raw);
  if (Number.isFinite(retryAt)) {
    return Math.max(0, retryAt - Date.now());
  }
  return 1000;
}

function sleep(delayMs) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, Math.max(0, delayMs));
    timer.unref?.();
  });
}

async function safeReadText(response) {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

function recordOpenRouterFallback(result, stage) {
  if (!result?.error || result.code === "OPENROUTER_API_KEY_MISSING") {
    return;
  }
  broadcastRouteError(result.error, {
    route: "openrouter",
    stage,
    message: `${safeErrorMessage(result.error)} VNEM fell back to deterministic ${stage} logic.`
  });
}

function compactForModel(value) {
  return JSON.parse(JSON.stringify(value ?? {}, (_key, nestedValue) => {
    if (typeof nestedValue === "string") {
      return nestedValue.slice(0, 4000);
    }
    return nestedValue;
  }));
}

function normalizeLlmSourceRoute(value, fallback) {
  const route = String(value ?? "").trim().toLowerCase();
  if (["github-search", "npm-search", "mcp-registry"].includes(route)) {
    return route;
  }
  return fallback ?? "github-search";
}

function clampScore(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return Math.max(min, Math.min(max, Math.round(Number(fallback ?? min))));
  }
  return Math.max(min, Math.min(max, Math.round(number)));
}

function pipelineEvent(payload) {
  return {
    type: payload.type ?? "pipeline_ingestion_updated",
    message: payload.message,
    agent_stage: payload.agent_stage,
    active_ingestion: payload.active_ingestion,
    active_ingestions: activeIngestions.slice(0, 12),
    route_errors: routeErrors.slice(0, 12),
    mission: missionSnapshot(),
    pipeline: pipelineSnapshot(),
    intelligence_provider: intelligenceProviderSnapshot()
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
    mission: missionSnapshot(),
    intelligence_provider: intelligenceProviderSnapshot(),
    stages: ["research", "protection", "giving"].map((agent) => ({
      agent,
      status: active?.current_agent === agent ? "active" : active ? "standby" : "idle"
    }))
  };
}

function missionSnapshot() {
  const descriptor = vectorDescriptor(intelligenceMission.vector);
  return {
    query: intelligenceMission.query,
    vector: intelligenceMission.vector,
    vector_label: descriptor.label,
    threat_tolerance: intelligenceMission.threatTolerance,
    block_threshold: intelligenceMission.threatTolerance,
    revision: intelligenceMission.revision,
    source: intelligenceMission.source,
    updated_at: intelligenceMission.updatedAt,
    next_poll_at: researchCache.nextPollAt ? new Date(researchCache.nextPollAt).toISOString() : null
  };
}

function updateIntelligenceMission(nextMission) {
  const query = normalizeResearchQuery(nextMission.query);
  const vector = normalizeIntelligenceVector(nextMission.vector ?? intelligenceMission.vector);
  const threatTolerance = normalizeThreatTolerance(nextMission.threatTolerance);
  if (query !== intelligenceMission.query || vector !== intelligenceMission.vector) {
    researchCache.etag = null;
    researchCache.nextPollAt = 0;
    researchCache.lastQuery = null;
    researchCache.lastVector = null;
    researchCache.seenRepositoryIds.clear();
  }

  intelligenceMission.query = query;
  intelligenceMission.vector = vector;
  intelligenceMission.threatTolerance = threatTolerance;
  intelligenceMission.updatedAt = new Date().toISOString();
  intelligenceMission.revision += 1;
  intelligenceMission.source = nextMission.source ?? "dashboard";
  return missionSnapshot();
}

function updateLiveIntelligenceRuntime(options = {}) {
  liveIntelligenceRuntime = {
    repositoryRoot: path.resolve(options.repositoryRoot || liveIntelligenceRuntime.repositoryRoot || rootDir),
    fetchImpl: Object.hasOwn(options, "fetchImpl") ? options.fetchImpl : liveIntelligenceRuntime.fetchImpl,
    pollIntervalMs: Object.hasOwn(options, "pollIntervalMs") ? options.pollIntervalMs : liveIntelligenceRuntime.pollIntervalMs,
    minPollIntervalMs: Object.hasOwn(options, "minPollIntervalMs") ? options.minPollIntervalMs : liveIntelligenceRuntime.minPollIntervalMs,
    maxPollIntervalMs: Object.hasOwn(options, "maxPollIntervalMs") ? options.maxPollIntervalMs : liveIntelligenceRuntime.maxPollIntervalMs,
    stageDelayMs: Object.hasOwn(options, "stageDelayMs") ? options.stageDelayMs : liveIntelligenceRuntime.stageDelayMs
  };
  return liveIntelligenceRuntime;
}

function normalizeIntelligenceTarget(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw httpError(400, "INVALID_TARGET_PAYLOAD", "Expected JSON object with query and threat_tolerance.");
  }
  return {
    query: normalizeResearchQuery(payload.query),
    vector: normalizeIntelligenceVector(payload.vector ?? defaultIntelligenceVector),
    threatTolerance: normalizeThreatTolerance(payload.threat_tolerance)
  };
}

function normalizeResearchQuery(value) {
  const query = String(value ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  if (query.length < 3) {
    throw httpError(400, "QUERY_TOO_SHORT", "Research target must contain at least 3 characters.");
  }
  if (query.length > 180) {
    throw httpError(400, "QUERY_TOO_LONG", "Research target must be 180 characters or less.");
  }
  return query;
}

function normalizeThreatTolerance(value) {
  const threatTolerance = Number(value);
  if (!Number.isFinite(threatTolerance)) {
    throw httpError(400, "INVALID_THREAT_TOLERANCE", "threat_tolerance must be a finite number.");
  }
  const rounded = Math.round(threatTolerance);
  if (rounded < 1 || rounded > 100) {
    throw httpError(400, "INVALID_THREAT_TOLERANCE", "threat_tolerance must be between 1 and 100.");
  }
  return rounded;
}

function normalizeIntelligenceVector(value) {
  const vector = String(value ?? defaultIntelligenceVector).trim().toLowerCase();
  if (!intelligenceVectors.has(vector)) {
    throw httpError(400, "INVALID_INTELLIGENCE_VECTOR", "vector must be one of: github, npm, mcp.");
  }
  return vector;
}

function trimActiveIngestions() {
  activeIngestions.splice(12);
}

function matchDispatchRoute(method, pathname) {
  const match = String(pathname ?? "").match(/^\/api\/intelligence\/dispatch\/([^/]+)(?:\/(approve|reject))?$/);
  if (!match) {
    return null;
  }
  if (method === "GET" && !match[2]) {
    return {
      id: decodeURIComponent(match[1]),
      action: "read"
    };
  }
  if (method === "POST" && ["approve", "reject"].includes(match[2])) {
    return {
      id: decodeURIComponent(match[1]),
      action: match[2]
    };
  }
  throw httpError(405, "DISPATCH_METHOD_NOT_ALLOWED", "Dispatch review supports GET /dispatch/:id, POST /dispatch/:id/approve, and POST /dispatch/:id/reject.");
}

function findDispatchIngestion(id) {
  const safeId = String(id ?? "").trim();
  const ingestion = activeIngestions.find((item) => item.id === safeId);
  if (!ingestion) {
    throw httpError(404, "DISPATCH_NOT_FOUND", "No active staged dispatch matched the requested id.");
  }
  return ingestion;
}

function dispatchStagedFile(ingestion) {
  const staged = ingestion?.staged_dispatch;
  const fileName = String(staged?.file_name ?? "").trim();
  if (!staged || !fileName) {
    throw httpError(409, "DISPATCH_NOT_STAGED", "The requested ingestion is not staged for review.");
  }
  if (path.basename(fileName) !== fileName || !fileName.endsWith(".md")) {
    throw httpError(400, "INVALID_DISPATCH_FILE", "The staged dispatch file name is invalid.");
  }
  return staged;
}

function safeChildPath(parentDir, childName) {
  const parent = path.resolve(parentDir);
  const target = path.resolve(parent, childName);
  const relative = path.relative(parent, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw httpError(400, "DISPATCH_PATH_OUTSIDE_REVIEW_ROOT", "Dispatch path escaped the review directory.");
  }
  return target;
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
    mission: missionSnapshot(),
    pipeline: pipelineSnapshot(),
    intelligence_provider: intelligenceProviderSnapshot()
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

function selectHighValueNpmPackage(objects) {
  return [...objects]
    .filter((item) => item?.package?.name && !researchCache.seenRepositoryIds.has(`npm:${item.package.name}`))
    .map((item) => ({
      item,
      score: npmCandidateScore(item)
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

function npmCandidateScore(candidate) {
  return npmScoreComponents(candidate).candidate_score;
}

function npmScoreComponents(candidate) {
  const packageData = candidate.package ?? {};
  const text = `${packageData.name ?? ""} ${packageData.description ?? ""} ${(packageData.keywords ?? []).join(" ")}`.toLowerCase();
  const keywordBoost = [
    "agent",
    "agentic",
    "workflow",
    "mcp",
    "llm",
    "prompt",
    "performance",
    "architecture",
    "eslint",
    "vite",
    "react",
    "typescript"
  ].reduce((score, keyword) => score + (text.includes(keyword) ? 8 : 0), 0);
  const search = Number(candidate.searchScore ?? 0) * 20;
  const final = Number(candidate.score?.final ?? 0) * 40;
  const quality = Number(candidate.score?.detail?.quality ?? 0) * 16;
  const popularity = Number(candidate.score?.detail?.popularity ?? 0) * 12;
  const recent = recencyScore(packageData.date);
  const candidateScore = keywordBoost + search + final + quality + popularity + recent;
  return {
    search_score: Number(candidate.searchScore ?? 0),
    weighted_search_score: roundMetric(search),
    final_score: Number(candidate.score?.final ?? 0),
    weighted_final_score: roundMetric(final),
    quality: Number(candidate.score?.detail?.quality ?? 0),
    weighted_quality: roundMetric(quality),
    popularity: Number(candidate.score?.detail?.popularity ?? 0),
    weighted_popularity: roundMetric(popularity),
    recency_score: roundMetric(recent),
    keyword_boost: roundMetric(keywordBoost),
    candidate_score: roundMetric(candidateScore)
  };
}

function repositoryTrustScore(repository) {
  return Math.max(10, Math.min(98, Math.round(42 + repositoryCandidateScore(repository) * 0.62)));
}

function npmTrustScore(candidate) {
  return Math.max(12, Math.min(96, Math.round(40 + npmCandidateScore(candidate) * 0.58)));
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

function roundMetric(value) {
  return Math.round(Number(value ?? 0) * 100) / 100;
}

function buildNpmAuditText(packageData, candidate) {
  const maintainers = Array.isArray(packageData.maintainers)
    ? packageData.maintainers.map((item) => item.username || item.email || item.name).filter(Boolean)
    : [];
  const publisher = packageData.publisher?.username || packageData.publisher?.email || packageData.publisher?.name || "";
  const keywords = Array.isArray(packageData.keywords) ? packageData.keywords.filter(Boolean) : [];
  return [
    `name: ${packageData.name ?? "unknown"}`,
    `version: ${packageData.version ?? "unknown"}`,
    `description: ${packageData.description ?? ""}`,
    `keywords: ${keywords.join(", ")}`,
    `publisher: ${publisher}`,
    `maintainers: ${maintainers.join(", ")}`,
    `npm_url: ${packageData.links?.npm ?? ""}`,
    `repository_url: ${packageData.links?.repository ?? ""}`,
    `homepage_url: ${packageData.links?.homepage ?? ""}`,
    `score: ${JSON.stringify(candidate.score ?? {})}`
  ].join("\n");
}

function vectorDescriptor(vector) {
  const normalized = normalizeIntelligenceVector(vector);
  const map = {
    github: {
      label: "GitHub Repositories",
      origin: "GitHub Scrape",
      route: "github-search",
      url: "https://api.github.com/search/repositories"
    },
    npm: {
      label: "NPM Package Registry",
      origin: "NPM Package Registry",
      route: "npm-search",
      url: "https://registry.npmjs.org/-/v1/search"
    },
    mcp: {
      label: "MCP Tool Catalog",
      origin: "MCP Tool Catalog",
      route: "mcp-registry",
      url: "vnem://mcp-registry"
    }
  };
  return map[normalized];
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

function httpError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  error.publicError = statusCode >= 400 && statusCode < 500 ? "bad-request" : "vnem-app-server-error";
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
    mission: missionSnapshot(),
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
  const descriptor = vectorDescriptor(repository.vector ?? intelligenceMission.vector);
  return [
    `# VNEM Live Intelligence Dispatch: ${repository.full_name}`,
    "",
    `Generated: ${options.generatedAt}`,
    "",
    "## Source",
    "",
    `- Target: ${repository.full_name}`,
    `- Intelligence vector: ${descriptor.label}`,
    `- Source route: ${repository.source_route ?? ingestion.source_route ?? descriptor.route}`,
    `- URL: ${repository.html_url}`,
    `- Default branch: ${repository.default_branch ?? "not applicable"}`,
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
    `- Block threshold: ${report.block_threshold ?? intelligenceMission.threatTolerance}%`,
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
  await readRequestBody(request, { maxBytes: 1024 * 1024 });
}

async function readJsonRequest(request, options = {}) {
  const text = await readRequestBody(request, {
    maxBytes: options.maxBytes ?? 16 * 1024
  });
  if (!text.trim()) {
    throw httpError(400, "EMPTY_JSON_BODY", "Request body must contain a JSON object.");
  }
  try {
    return JSON.parse(text);
  } catch {
    throw httpError(400, "INVALID_JSON_BODY", "Request body must be valid JSON.");
  }
}

async function readRequestBody(request, options = {}) {
  const maxBytes = options.maxBytes ?? 1024 * 1024;
  let total = 0;
  const chunks = [];
  for await (const chunk of request) {
    total += chunk.length;
    if (total > maxBytes) {
      throw httpError(413, "PAYLOAD_TOO_LARGE", `Request body exceeded ${maxBytes} bytes.`);
    }
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
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
