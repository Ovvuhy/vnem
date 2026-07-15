#!/usr/bin/env node
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const liveEnabled = process.argv.includes("--live");
const benchmarkArg = process.argv.find((arg) => arg.startsWith("--benchmark-output="));
const benchmarkOutput = benchmarkArg ? safeOutputPath(benchmarkArg.slice("--benchmark-output=".length)) : null;
const tempRoot = await mkdtemp(path.join(repoRoot, ".tmp", "api-connectors-phase16-"));
const fixtureRoot = path.join(tempRoot, "workspace");
const evidenceRoot = path.join(fixtureRoot, ".vnem", "evidence");
const credentialValue = "phase16-credential-do-not-emit-ABC123";
const timings = {};
const observed = { requests: [], authorization_headers: [], open_meteo_attempts: 0, apis_guru_attempts: 0, issue_created: false, issue_closed: false };
let stderr = "";
let mockClient;
let mockTransport;
let liveClient;
let liveTransport;

await mkdir(fixtureRoot, { recursive: true });
await writeOpenApiFixture(fixtureRoot);
const mockServer = createServer((request, response) => handleMockRequest(request, response, observed, credentialValue));
await new Promise((resolve, reject) => {
  mockServer.once("error", reject);
  mockServer.listen(0, "127.0.0.1", resolve);
});
const address = mockServer.address();
const origin = `http://127.0.0.1:${address.port}`;
const overrides = {
  open_meteo_forecast: `${origin}/open-meteo`,
  github_repository_get: `${origin}/github`,
  world_bank_indicator: `${origin}/world-bank`,
  apis_guru_metrics: `${origin}/apis-guru`,
  wikipedia_page_info: `${origin}/wikipedia`,
  cheapshark_deals: `${origin}/cheapshark`,
  github_issue_create: `${origin}/github`,
  fixture_widget_get: `${origin}/generated`
};

try {
  ({ client: mockClient, transport: mockTransport } = await connectTools({
    ...process.env,
    VNEM_TOOLS_ALLOWED_ROOTS: [fixtureRoot, repoRoot].join(path.delimiter),
    VNEM_TOOLS_EVIDENCE_ROOT: evidenceRoot,
    VNEM_TOOLS_PERMISSION_PROFILE: "safe-readonly",
    VNEM_TOOLS_API_TEST_MODE: "1",
    VNEM_TOOLS_ALLOW_LOCALHOST: "1",
    VNEM_TOOLS_API_TEST_BASE_URLS: JSON.stringify(overrides),
    VNEM_TOOLS_API_CREDENTIAL_REFERENCE_MAP: JSON.stringify({ "client_secret_reference:github-client": "GITHUB_TOKEN", "os_credential_store:github-os": "GITHUB_TOKEN" }),
    GITHUB_TOKEN: credentialValue,
    VNEM_TOOLS_SKIP_WRANGLER_CHECK: "1"
  }, (chunk) => { stderr += chunk.toString(); }));

  const listed = await mockClient.listTools();
  const names = new Set(listed.tools.map((tool) => tool.name));
  const required = [
    "vnem_tools_api_adapter_catalog",
    "vnem_tools_api_credential_reference_check",
    "vnem_tools_api_adapter_plan",
    "vnem_tools_api_adapter_execute",
    "vnem_tools_api_adapter_compensate",
    "vnem_tools_api_adapter_generate",
    "vnem_tools_api_adapter_contract_test",
    "vnem_tools_api_adapter_review_activate"
  ];
  for (const name of required) assert.ok(names.has(name), `missing Phase 16 tool ${name}`);

  const catalog = await timed("catalog_ms", () => behaviorOk("vnem_tools_api_adapter_catalog", {}));
  assert.equal(catalog.initial_adapter_count, 7);
  assert.equal(catalog.adapter_count, 7);
  assert.equal(catalog.raw_credential_values_exposed, false);
  assert.deepEqual(catalog.credential_reference_types, ["environment", "client_secret_reference", "os_credential_store", "provider_profile"]);
  assert.ok(catalog.adapters.every((item) => item.official_documentation.length && item.base_urls.length && item.request_schema && item.response_schema));
  assert.ok(catalog.adapters.every((item) => item.rate_limits && item.retry_policy && item.cache_policy && item.live_test && item.rollback_or_compensation));
  assert.equal(JSON.stringify(catalog).includes(credentialValue), false);

  const contracts = await timed("builtin_contract_tests_ms", () => behaviorOk("vnem_tools_api_adapter_contract_test", {}));
  assert.equal(contracts.passed, true);
  assert.equal(contracts.adapter_count, 7);
  assert.ok(contracts.fixture_count >= 7);

  const weatherPlan = await behaviorOk("vnem_tools_api_adapter_plan", {
    adapter_id: "open_meteo_forecast",
    parameters: { latitude: 48.1486, longitude: 17.1077, current: ["temperature_2m"], forecast_days: 1, timezone: "auto" }
  });
  assert.equal(weatherPlan.permission_action, "vetted_api_read");
  assert.equal(weatherPlan.permission.allowed, true);
  assert.equal(weatherPlan.permission.requires_approval, false);
  assert.equal(weatherPlan.executed, false);

  const weather = await timed("weather_mock_live_ms", () => behaviorOk("vnem_tools_api_adapter_execute", {
    adapter_id: "open_meteo_forecast",
    parameters: { latitude: 48.1486, longitude: 17.1077, current: ["temperature_2m"], forecast_days: 1, timezone: "auto" },
    dry_run: false
  }));
  assert.equal(weather.operation_result, "api_adapter_execution_succeeded");
  assert.equal(weather.status, 200);
  assert.equal(weather.live_provider, false);
  assert.equal(weather.test_override, true);
  assert.equal(weather.response_schema_valid, true);
  assert.equal(weather.attempts, 2, "safe GET retry path was not exercised");
  assert.equal(weather.permission.decision_source, "profile");
  assert.equal(weather.permission.requires_approval, false);
  assert.equal(weather.credential_value_exposed, false);
  const weatherCached = await ok(mockClient, "vnem_tools_api_adapter_execute", {
    adapter_id: "open_meteo_forecast",
    parameters: { latitude: 48.1486, longitude: 17.1077, current: ["temperature_2m"], forecast_days: 1, timezone: "auto" },
    dry_run: false
  });
  assert.equal(weatherCached.operation_result, "api_adapter_cache_hit");
  assert.equal(weatherCached.cache.hit, true);
  assert.equal(observed.open_meteo_attempts, 2);

  const worldBank = await ok(mockClient, "vnem_tools_api_adapter_execute", {
    adapter_id: "world_bank_indicator",
    parameters: { country: "SVK", indicator: "SP.POP.TOTL", date: "2023", per_page: 10 },
    dry_run: false
  });
  assert.equal(worldBank.ok, true);
  assert.equal(worldBank.response_schema_valid, true);
  const apisGuru = await ok(mockClient, "vnem_tools_api_adapter_execute", { adapter_id: "apis_guru_metrics", parameters: {}, dry_run: false });
  assert.equal(apisGuru.response.numAPIs, 2500);
  const capped = await ok(mockClient, "vnem_tools_api_adapter_execute", { adapter_id: "apis_guru_metrics", parameters: {}, max_response_bytes: 512, allow_cache: false, dry_run: false });
  assert.equal(capped.response_truncated, true);
  assert.equal(capped.response_schema_valid, false);
  assert.equal(capped.ok, false);
  const wikipedia = await ok(mockClient, "vnem_tools_api_adapter_execute", { adapter_id: "wikipedia_page_info", parameters: { title: "Model Context Protocol", language: "en" }, dry_run: false });
  assert.equal(wikipedia.response.query.pages[0].title, "Model Context Protocol");
  const deals = await ok(mockClient, "vnem_tools_api_adapter_execute", { adapter_id: "cheapshark_deals", parameters: { title: "Portal", page_size: 5, upper_price: 20, on_sale: true }, dry_run: false });
  assert.equal(deals.response[0].title, "Portal");

  const invalidSchema = await raw(mockClient, "vnem_tools_api_adapter_plan", { adapter_id: "open_meteo_forecast", parameters: { latitude: 200, longitude: 17 } });
  assert.equal(invalidSchema.isError, true);
  assert.equal(invalidSchema.structuredContent.code, "api_request_schema_invalid");
  const untrustedAdapter = await raw(mockClient, "vnem_tools_api_adapter_execute", { adapter_id: "unknown_external", parameters: {}, dry_run: false });
  assert.equal(untrustedAdapter.isError, true);
  assert.equal(untrustedAdapter.structuredContent.code, "api_adapter_not_found");
  const rawCredential = await raw(mockClient, "vnem_tools_api_adapter_plan", { adapter_id: "github_repository_get", parameters: { owner: "Ovvuhy", repo: "vnem" }, credential_reference: credentialValue });
  assert.equal(rawCredential.isError, true);
  assert.equal(JSON.stringify(rawCredential).includes(credentialValue), false);
  const credentialInBody = await raw(mockClient, "vnem_tools_api_adapter_plan", { adapter_id: "github_issue_create", parameters: { owner: "Ovvuhy", repo: "vnem", title: "Fixture", body: "Authorization: Bearer fixture-secret-do-not-use-12345" }, credential_reference: { type: "environment", name: "GITHUB_TOKEN" } });
  assert.equal(credentialInBody.isError, true);
  assert.equal(credentialInBody.structuredContent.code, "api_raw_credential_parameter_blocked");

  const credentialRef = { type: "provider_profile", name: "github:default" };
  const credentialStatusDenied = await raw(mockClient, "vnem_tools_api_credential_reference_check", { adapter_id: "github_repository_get", credential_reference: credentialRef });
  assert.equal(credentialStatusDenied.isError, true);
  assert.equal(credentialStatusDenied.structuredContent.code, "permission_profile_blocked");
  const credentialDenied = await raw(mockClient, "vnem_tools_api_adapter_execute", { adapter_id: "github_repository_get", parameters: { owner: "Ovvuhy", repo: "vnem" }, credential_reference: credentialRef, dry_run: false });
  assert.equal(credentialDenied.isError, true);
  assert.equal(credentialDenied.structuredContent.code, "permission_profile_blocked");

  const credentialGrant = await grant(mockClient, ["credential_api_read"], { providers: ["github"] }, "Phase 16 credential-reference read proof");
  assert.equal(credentialGrant.grant.persistence, "session");
  assert.equal(credentialGrant.repeated_approval_required, false);
  const credentialStatus = await behaviorOk("vnem_tools_api_credential_reference_check", { adapter_id: "github_repository_get", credential_reference: credentialRef });
  assert.equal(credentialStatus.operation_result, "credential_reference_available");
  assert.equal(credentialStatus.credential_reference.value_exposed, false);
  assert.equal(credentialStatus.permission.decision_source, "scoped_grant");
  assert.equal(JSON.stringify(credentialStatus).includes(credentialValue), false);
  for (const reference of [
    { type: "environment", name: "GITHUB_TOKEN" },
    { type: "client_secret_reference", name: "github-client" },
    { type: "os_credential_store", name: "github-os" }
  ]) {
    const status = await ok(mockClient, "vnem_tools_api_credential_reference_check", { adapter_id: "github_repository_get", credential_reference: reference });
    assert.equal(status.operation_result, "credential_reference_available");
    assert.equal(status.value_exposed, false);
    assert.equal(JSON.stringify(status).includes(credentialValue), false);
  }
  const githubReadOne = await timed("credential_read_ms", () => ok(mockClient, "vnem_tools_api_adapter_execute", {
    adapter_id: "github_repository_get",
    parameters: { owner: "Ovvuhy", repo: "vnem" },
    credential_reference: credentialRef,
    dry_run: false
  }));
  const githubReadTwo = await ok(mockClient, "vnem_tools_api_adapter_execute", {
    adapter_id: "github_repository_get",
    parameters: { owner: "Ovvuhy", repo: "vnem" },
    credential_reference: credentialRef,
    dry_run: false,
    allow_cache: false
  });
  for (const result of [githubReadOne, githubReadTwo]) {
    assert.equal(result.permission.decision_source, "scoped_grant");
    assert.equal(result.permission.requires_approval, false);
    assert.equal(result.response.token, "[REDACTED]");
    assert.equal(result.response.temp_clone_token, "[REDACTED]");
    assert.equal(JSON.stringify(result).includes(credentialValue), false);
  }
  assert.ok(observed.authorization_headers.filter((item) => item === `Bearer ${credentialValue}`).length >= 2);
  const credentialEvidence = await readFile(path.join(fixtureRoot, githubReadOne.evidence.path), "utf8");
  assert.equal(credentialEvidence.includes(credentialValue), false);
  assert.match(credentialEvidence, /\[REDACTED\]/);

  const mutationDenied = await raw(mockClient, "vnem_tools_api_adapter_execute", {
    adapter_id: "github_issue_create",
    parameters: { owner: "Ovvuhy", repo: "vnem", title: "Phase 16 fixture", body: "Mock only", labels: ["test"] },
    credential_reference: credentialRef,
    dry_run: false
  });
  assert.equal(mutationDenied.isError, true);
  assert.equal(mutationDenied.structuredContent.code, "permission_profile_blocked");
  await grant(mockClient, ["external_api_mutation"], { providers: ["github"] }, "Phase 16 mock-only mutation and compensation proof");
  const mutation = await timed("mock_mutation_ms", () => ok(mockClient, "vnem_tools_api_adapter_execute", {
    adapter_id: "github_issue_create",
    parameters: { owner: "Ovvuhy", repo: "vnem", title: "Phase 16 fixture", body: "Mock-only integration proof", labels: ["test"] },
    credential_reference: credentialRef,
    dry_run: false
  }));
  assert.equal(mutation.operation_result, "api_adapter_execution_succeeded");
  assert.equal(mutation.attempts, 1);
  assert.ok(mutation.transaction_id);
  assert.equal(mutation.live_provider, false);
  assert.equal(observed.issue_created, true);
  const compensationPlan = await behaviorOk("vnem_tools_api_adapter_compensate", { transaction_id: mutation.transaction_id });
  assert.equal(compensationPlan.operation_result, "api_compensation_planned");
  assert.equal(compensationPlan.compensation.guarantee, "best_effort_not_rollback");
  const compensated = await timed("mock_compensation_ms", () => ok(mockClient, "vnem_tools_api_adapter_compensate", { transaction_id: mutation.transaction_id, dry_run: false }));
  assert.equal(compensated.operation_result, "api_compensation_completed");
  assert.equal(compensated.completed, true);
  assert.equal(observed.issue_closed, true);
  assert.ok(compensated.residual_effects.some((item) => /not rollback/i.test(item)));
  const compensateAgain = await raw(mockClient, "vnem_tools_api_adapter_compensate", { transaction_id: mutation.transaction_id, dry_run: false });
  assert.equal(compensateAgain.isError, true);
  assert.equal(compensateAgain.structuredContent.code, "api_compensation_already_recorded");

  const generated = await timed("openapi_generation_ms", () => behaviorOk("vnem_tools_api_adapter_generate", {
    root: fixtureRoot,
    spec_path: "fixture-openapi.json",
    operation_id: "getWidget",
    adapter_id: "fixture_widget_get",
    provider: "fixture-provider",
    official_documentation: "https://example.com/docs/widgets",
    freshness_date: "2026-07-14"
  }));
  assert.equal(generated.operation_result, "api_adapter_proposal_generated");
  assert.equal(generated.review_required, true);
  assert.equal(generated.contract_test_passed, false);
  assert.ok(generated.unknowns.length >= 4);
  assert.equal(generated.activation_blockers.length, 0);

  const unsupportedSchemaProposal = await ok(mockClient, "vnem_tools_api_adapter_generate", {
    adapter_id: "fixture_ref_get",
    provider: "fixture-ref",
    official_documentation: "https://fixture.example.test/docs",
    freshness_date: "2026-07-14",
    operation_id: "getReferencedWidget",
    openapi_document: referencedSchemaOpenApi()
  });
  assert.ok(unsupportedSchemaProposal.activation_blockers.some((item) => item.includes("unsupported_schema_keyword:$ref")));
  const unsupportedSchemaContract = await ok(mockClient, "vnem_tools_api_adapter_contract_test", { proposal_id: unsupportedSchemaProposal.proposal_id });
  assert.equal(unsupportedSchemaContract.passed, false);
  assert.ok(unsupportedSchemaContract.errors.some((item) => item.includes("unsupported_schema_keyword:$ref")));

  const inactive = await raw(mockClient, "vnem_tools_api_adapter_plan", { adapter_id: "fixture_widget_get", parameters: { id: "fixture" } });
  assert.equal(inactive.isError, true);
  assert.equal(inactive.structuredContent.code, "api_adapter_not_found");
  const generatedContract = await ok(mockClient, "vnem_tools_api_adapter_contract_test", { proposal_id: generated.proposal_id });
  assert.equal(generatedContract.passed, true);
  const activationBeforeGrant = await raw(mockClient, "vnem_tools_api_adapter_review_activate", {
    proposal_id: generated.proposal_id,
    reviewed: true,
    activation_acknowledgement: generated.activation_acknowledgement,
    acknowledged_unknowns: generated.unknowns,
    dry_run: false
  });
  assert.equal(activationBeforeGrant.isError, true);
  assert.equal(activationBeforeGrant.structuredContent.code, "permission_profile_blocked");
  await grant(mockClient, ["apply_patch"], { path_prefixes: [".vnem/api-connectors"] }, "Phase 16 reviewed generated-adapter registry activation");
  const unknownNotAcknowledged = await raw(mockClient, "vnem_tools_api_adapter_review_activate", {
    proposal_id: generated.proposal_id,
    reviewed: true,
    activation_acknowledgement: generated.activation_acknowledgement,
    acknowledged_unknowns: [],
    dry_run: false
  });
  assert.equal(unknownNotAcknowledged.isError, true);
  assert.equal(unknownNotAcknowledged.structuredContent.code, "api_adapter_activation_blocked");
  const wrongReview = await raw(mockClient, "vnem_tools_api_adapter_review_activate", {
    proposal_id: generated.proposal_id,
    reviewed: true,
    activation_acknowledgement: "wrong",
    acknowledged_unknowns: generated.unknowns,
    dry_run: false
  });
  assert.equal(wrongReview.isError, true);
  assert.equal(wrongReview.structuredContent.code, "api_adapter_review_acknowledgement_mismatch");
  const activated = await timed("review_activation_ms", () => behaviorOk("vnem_tools_api_adapter_review_activate", {
    proposal_id: generated.proposal_id,
    reviewed: true,
    activation_acknowledgement: generated.activation_acknowledgement,
    acknowledged_unknowns: generated.unknowns,
    dry_run: false
  }));
  assert.equal(activated.operation_result, "api_adapter_activated");
  assert.equal(activated.contract_test_passed, true);
  const generatedCatalog = await ok(mockClient, "vnem_tools_api_adapter_catalog", {});
  assert.equal(generatedCatalog.adapter_count, 8);
  assert.ok(generatedCatalog.adapters.some((item) => item.id === "fixture_widget_get" && item.compatibility_status === "reviewed_active"));
  const generatedExecution = await ok(mockClient, "vnem_tools_api_adapter_execute", { adapter_id: "fixture_widget_get", parameters: { id: "fixture" }, dry_run: false });
  assert.equal(generatedExecution.ok, true);
  assert.equal(generatedExecution.response.name, "Generated fixture widget");

  for (const name of required) {
    const coverage = await ok(mockClient, "vnem_tools_tool_test_coverage_map", { root: repoRoot, tool_name: name, max_tools: 10 });
    assert.equal(coverage.per_tool[name]?.coverage_level, "behavior_test", `${name} must map to real MCP behavior proof`);
    assert.ok(coverage.per_tool[name].behavior_test_files.includes("scripts/test-tools-giga-api-connectors.mjs"));
  }
  const status = await ok(mockClient, "vnem_tools_status", {});
  assert.equal(status.api_connector_policy.initial_adapters, 7);
  assert.equal(status.api_connector_policy.raw_credentials_accepted_or_emitted, false);
  assert.equal(status.api_connector_policy.repeated_approval_inside_exact_grant, false);
  assert.equal(status.api_connector_policy.compensation_is_not_rollback, true);
  const manifest = await ok(mockClient, "vnem_tools_manifest", { capability_group: "api_connectors" });
  assert.equal(manifest.tools.length, 8);
  assert.ok(manifest.tools.every((item) => item.capability_group === "api_connectors" && item.description));

  let liveProof = null;
  if (liveEnabled) {
    ({ client: liveClient, transport: liveTransport } = await connectTools({
      ...process.env,
      VNEM_TOOLS_ALLOWED_ROOTS: [fixtureRoot, repoRoot].join(path.delimiter),
      VNEM_TOOLS_EVIDENCE_ROOT: path.join(fixtureRoot, ".vnem", "live-evidence"),
      VNEM_TOOLS_PERMISSION_PROFILE: "safe-readonly",
      VNEM_TOOLS_API_LIVE_TESTS: "1",
      VNEM_TOOLS_SKIP_WRANGLER_CHECK: "1"
    }, (chunk) => { stderr += chunk.toString(); }));
    const liveWeather = await timed("open_meteo_live_ms", () => ok(liveClient, "vnem_tools_api_adapter_execute", {
      adapter_id: "open_meteo_forecast",
      parameters: { latitude: 48.1486, longitude: 17.1077, current: ["temperature_2m"], forecast_days: 1, timezone: "auto" },
      max_response_bytes: 32768,
      dry_run: false
    }));
    const liveWorldBank = await timed("world_bank_live_ms", () => ok(liveClient, "vnem_tools_api_adapter_execute", {
      adapter_id: "world_bank_indicator",
      parameters: { country: "SVK", indicator: "SP.POP.TOTL", date: "2023", per_page: 5 },
      max_response_bytes: 32768,
      dry_run: false
    }));
    for (const result of [liveWeather, liveWorldBank]) {
      assert.equal(result.live_provider, true);
      assert.equal(result.test_override, false);
      assert.equal(result.status, 200);
      assert.equal(result.ok, true);
      assert.equal(result.response_schema_valid, true);
      assert.equal(result.permission.action_type, "vetted_api_read");
      assert.equal(result.permission.allowed, true);
      assert.equal(result.permission.requires_approval, false);
    }
    liveProof = {
      approved_by_cli_flag: liveEnabled,
      server_network_gate_enabled: true,
      adapters: [summarizeLive(liveWeather), summarizeLive(liveWorldBank)],
      external_mutations: 0,
      credentials_used: 0
    };
  }

  if (benchmarkOutput) {
    const benchmark = {
      phase: 16,
      generated_at: new Date().toISOString(),
      scope: liveEnabled ? "real_stdio_mcp_mock_and_approved_live_reads" : "real_stdio_mcp_mock_integrations",
      tools_exercised: required,
      initial_adapters: catalog.adapters.map((item) => ({ id: item.id, provider: item.provider, category: item.category, version: item.version, mutation_classification: item.mutation_classification, freshness_date: item.freshness_date })),
      timings_ms: timings,
      mock_request_count: observed.requests.length,
      live_proof: liveProof,
      proof: {
        real_stdio_mcp: true,
        seven_substantive_initial_adapters: true,
        seven_mocked_integrations: true,
        safe_default_no_auth_reads: true,
        credential_reference_without_value_exposure: true,
        exact_session_grant_avoids_repeated_approval: true,
        bounded_retry_and_cache: true,
        recursive_response_and_evidence_redaction: true,
        external_mutation_mock_only: true,
        best_effort_compensation_not_rollback: true,
        openapi_generation_contract_test_review_activation: true,
        two_approved_live_no_auth_reads: Boolean(liveProof)
      },
      limitations: [
        "Credential proof validates internal reference resolution and mock transport, not provider-side scope or validity.",
        "External mutation and compensation are mock-only; notifications and audit history are not reversible.",
        "Generated activation is intentionally restricted to reviewed no-auth GET/HEAD operations.",
        liveProof ? "Two current live reads passed on this host; future provider availability and schema drift remain external." : "Live provider proof was not requested in this invocation."
      ]
    };
    await mkdir(path.dirname(benchmarkOutput), { recursive: true });
    await writeFile(benchmarkOutput, `${JSON.stringify(benchmark, null, 2)}\n`, "utf8");
  }
} finally {
  await mockClient?.close().catch(() => {});
  await liveClient?.close().catch(() => {});
  await closeServer(mockServer);
  await rm(tempRoot, { recursive: true, force: true }).catch(() => {});
  if (stderr.trim()) process.stderr.write(stderr);
}

console.log(`VNEM GIGA Phase 16 API connector tests passed${liveEnabled ? " with two live no-auth reads" : ""}`);

async function connectTools(env, onStderr) {
  const client = new Client({ name: "vnem-tools-giga-api-connectors-test", version: "1.0.1" }, { capabilities: {} });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(scriptDir, "vnem-tools-mcp-server.mjs")],
    cwd: repoRoot,
    env,
    stderr: "pipe"
  });
  transport.stderr?.on("data", onStderr);
  await client.connect(transport);
  return { client, transport };
}

async function raw(client, name, args) {
  return client.callTool({ name, arguments: args });
}

async function behaviorRaw(name, args) {
  const client = mockClient;
  return client.callTool({ name, arguments: args });
}

async function behaviorOk(name, args) {
  const result = await behaviorRaw(name, args);
  assert.notEqual(result.isError, true, `${name} failed: ${JSON.stringify(result.structuredContent)}`);
  const key = Object.keys(result.structuredContent || {}).find((item) => item !== "error");
  assert.ok(key, `${name} returned no structured content`);
  return result.structuredContent[key];
}

async function ok(client, name, args) {
  const result = await raw(client, name, args);
  assert.notEqual(result.isError, true, `${name} failed: ${JSON.stringify(result.structuredContent)}`);
  const key = Object.keys(result.structuredContent || {}).find((item) => item !== "error");
  assert.ok(key, `${name} returned no structured content`);
  return result.structuredContent[key];
}

async function grant(client, actions, scope, reason) {
  const request = await ok(client, "vnem_tools_permission_request", { actions, scope, duration_minutes: 60, persistence: "session", reason });
  return ok(client, "vnem_tools_permission_grant", { request_id: request.request_id, acknowledgment: request.exact_acknowledgment });
}

async function timed(name, fn) {
  const started = performance.now();
  const result = await fn();
  timings[name] = Math.round((performance.now() - started) * 100) / 100;
  return result;
}

function summarizeLive(result) {
  return {
    adapter_id: result.adapter_id,
    provider: result.provider,
    status: result.status,
    ok: result.ok,
    response_schema_valid: result.response_schema_valid,
    duration_ms: result.duration_ms,
    response_bytes_observed: result.response_bytes_observed,
    response_truncated: result.response_truncated,
    evidence: result.evidence,
    raw_credentials_exposed: false
  };
}

function handleMockRequest(request, response, state, secret) {
  const url = new URL(request.url, "http://127.0.0.1");
  const chunks = [];
  request.on("data", (chunk) => chunks.push(chunk));
  request.on("end", () => {
    const bodyText = Buffer.concat(chunks).toString("utf8");
    let body = null;
    try { body = bodyText ? JSON.parse(bodyText) : null; } catch { body = null; }
    state.requests.push({ method: request.method, path: url.pathname, query: Object.fromEntries(url.searchParams), body });
    if (request.headers.authorization) state.authorization_headers.push(request.headers.authorization);
    const send = (status, value, headers = {}) => {
      response.writeHead(status, { "content-type": "application/json", ...headers });
      response.end(JSON.stringify(value));
    };
    if (url.pathname === "/open-meteo/v1/forecast") {
      state.open_meteo_attempts += 1;
      if (state.open_meteo_attempts === 1) return send(503, { reason: "fixture retry" }, { "retry-after": "0" });
      return send(200, { latitude: Number(url.searchParams.get("latitude")), longitude: Number(url.searchParams.get("longitude")), current: { time: "2026-07-14T14:00", temperature_2m: 25.1 } });
    }
    if (url.pathname === "/world-bank/v2/country/SVK/indicator/SP.POP.TOTL") return send(200, [{ page: 1, pages: 1, per_page: 10, total: 1 }, [{ countryiso3code: "SVK", date: "2023", value: 5426740 }]]);
    if (url.pathname === "/apis-guru/v2/metrics.json") {
      state.apis_guru_attempts += 1;
      return send(200, state.apis_guru_attempts === 1 ? { numSpecs: 3000, numAPIs: 2500, numEndpoints: 100000 } : { numSpecs: 3000, numAPIs: 2500, numEndpoints: 100000, padding: "x".repeat(20_000) });
    }
    if (url.pathname === "/wikipedia/w/api.php") return send(200, { batchcomplete: true, query: { pages: [{ pageid: 1, title: url.searchParams.get("titles") }] } });
    if (url.pathname === "/cheapshark/api/1.0/deals") return send(200, [{ gameID: "1", title: "Portal", salePrice: "1.99", dealID: "fixture-deal" }]);
    if (url.pathname === "/github/repos/Ovvuhy/vnem" && request.method === "GET") {
      if (request.headers.authorization !== `Bearer ${secret}`) return send(401, { message: "fixture credential missing" });
      return send(200, { id: 1, full_name: "Ovvuhy/vnem", html_url: "https://github.com/Ovvuhy/vnem", token: secret, temp_clone_token: "also-sensitive" }, { "x-ratelimit-limit": "5000", "x-ratelimit-remaining": "4999" });
    }
    if (url.pathname === "/github/repos/Ovvuhy/vnem/issues" && request.method === "POST") {
      if (request.headers.authorization !== `Bearer ${secret}` || body?.title !== "Phase 16 fixture") return send(401, { message: "fixture mutation rejected" });
      state.issue_created = true;
      return send(201, { number: 42, html_url: "https://github.com/Ovvuhy/vnem/issues/42", state: "open", token: secret });
    }
    if (url.pathname === "/github/repos/Ovvuhy/vnem/issues/42" && request.method === "PATCH") {
      if (request.headers.authorization !== `Bearer ${secret}` || body?.state !== "closed") return send(401, { message: "fixture compensation rejected" });
      state.issue_closed = true;
      return send(200, { number: 42, html_url: "https://github.com/Ovvuhy/vnem/issues/42", state: "closed", state_reason: "not_planned" });
    }
    if (url.pathname === "/generated/widgets/fixture") return send(200, { id: "fixture", name: "Generated fixture widget" });
    return send(404, { message: "fixture route not found", path: url.pathname });
  });
}

async function writeOpenApiFixture(root) {
  const document = {
    openapi: "3.1.0",
    info: { title: "Fixture Widgets", version: "1.0.0" },
    servers: [{ url: "https://fixture.example.test" }],
    paths: {
      "/widgets/{id}": {
        get: {
          operationId: "getWidget",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", pattern: "^[A-Za-z0-9._~-]+$", example: "fixture" } }],
          responses: {
            200: {
              description: "Widget",
              content: { "application/json": { schema: { type: "object", required: ["id", "name"], properties: { id: { type: "string" }, name: { type: "string" } } }, example: { id: "fixture", name: "Generated fixture widget" } } }
            }
          }
        }
      }
    }
  };
  await writeFile(path.join(root, "fixture-openapi.json"), `${JSON.stringify(document, null, 2)}\n`, "utf8");
}

function referencedSchemaOpenApi() {
  return {
    openapi: "3.1.0",
    info: { title: "Referenced Fixture", version: "1.0.0" },
    servers: [{ url: "https://fixture.example.test" }],
    paths: {
      "/referenced-widget": {
        get: {
          operationId: "getReferencedWidget",
          responses: {
            200: {
              description: "Referenced widget",
              content: { "application/json": { schema: { $ref: "#/components/schemas/Widget" }, example: { id: "fixture" } } }
            }
          }
        }
      }
    },
    components: { schemas: { Widget: { type: "object", required: ["id"], properties: { id: { type: "string" } } } } }
  };
}

async function closeServer(server) {
  if (!server.listening) return;
  await new Promise((resolve) => server.close(resolve));
}

function safeOutputPath(value) {
  const resolved = path.resolve(repoRoot, value);
  const relative = path.relative(repoRoot, resolved).replace(/\\/g, "/");
  assert.ok(!relative.startsWith("..") && !path.isAbsolute(relative), "benchmark output must remain inside the repository");
  assert.ok(/^(?:\.tmp|\.vnem\/giga-evolution)\/.+\.json$/i.test(relative), "benchmark output must be JSON under .tmp or .vnem/giga-evolution");
  return resolved;
}
