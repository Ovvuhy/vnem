import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { lstat, mkdir, readFile, realpath, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const SCHEMA_VERSION = "1.0.0";
const MAX_SPEC_BYTES = 2 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 256 * 1024;
const MAX_TIMEOUT_MS = 30_000;
const MAX_RETRY_DELAY_MS = 2_000;
const CREDENTIAL_TYPES = ["environment", "client_secret_reference", "os_credential_store", "provider_profile"];
const SAFE_METHODS = new Set(["GET", "HEAD"]);
const SECRET_KEY_RE = /(?:authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|secret|password|credential|cookie|temp_clone_token)/i;
const SECRET_VALUE_RE = /(?:bearer\s+[a-z0-9._~+/-]{8,}|github_pat_[a-z0-9_]{20,}|gh[pousr]_[a-z0-9_]{20,}|sk-[a-z0-9_-]{10,})/i;
const SAFE_ID_RE = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
const SAFE_PATH_TOKEN_RE = /^[A-Za-z0-9._~-]+$/;

export class ApiConnectorError extends Error {
  constructor(message, code = "api_connector_error", details = {}) {
    super(message);
    this.name = "ApiConnectorError";
    this.code = code;
    this.details = redactDeep(details);
  }
}

export const INITIAL_API_ADAPTERS = Object.freeze([
  adapter({
    id: "open_meteo_forecast",
    provider: "open-meteo",
    category: "no-auth public data",
    version: "v1",
    source_capability_record_id: "api:weather:open-meteo",
    official_documentation: ["https://open-meteo.com/en/docs", "https://open-meteo.com/en/pricing"],
    base_urls: ["https://api.open-meteo.com"],
    allowed_methods: ["GET"],
    authentication: noAuth(),
    request_schema: objectSchema({
      latitude: numberSchema(-90, 90),
      longitude: numberSchema(-180, 180),
      current: arraySchema({ type: "string", enum: ["temperature_2m", "relative_humidity_2m", "apparent_temperature", "precipitation", "weather_code", "wind_speed_10m"] }, 1, 6),
      forecast_days: integerSchema(1, 16),
      timezone: stringSchema(1, 80)
    }, ["latitude", "longitude"]),
    response_schema: { ...objectSchema({ latitude: { type: "number" }, longitude: { type: "number" }, current: { type: "object" } }, ["latitude", "longitude"]), additionalProperties: true },
    request_mapping: {
      path_template: "/v1/forecast",
      query_parameters: ["latitude", "longitude", "current", "forecast_days", "timezone"],
      defaults: { current: ["temperature_2m"], forecast_days: 1, timezone: "auto" },
      fixed_headers: { Accept: "application/json" }
    },
    rate_limits: {
      provider_policy: "Free non-commercial service documents 600/minute, 5,000/hour, 10,000/day, and 300,000/month limits; commercial customer endpoints use API keys.",
      runtime_max_requests: 10,
      runtime_window_ms: 60_000
    },
    retry_policy: safeRetry(),
    timeout_ms: 10_000,
    cache_policy: memoryCache(60_000),
    mutation_classification: "vetted_no_auth_read",
    redaction_fields: [],
    mock_fixtures: [{
      name: "bratislava-current",
      request: { latitude: 48.1486, longitude: 17.1077, current: ["temperature_2m"], forecast_days: 1, timezone: "auto" },
      response: { latitude: 48.15, longitude: 17.1, generationtime_ms: 0.1, current: { time: "2026-07-14T14:00", temperature_2m: 25.1 } }
    }],
    live_test: { approved: true, mutation: false, fixture: "bratislava-current", network_env: "VNEM_TOOLS_API_LIVE_TESTS" },
    rollback_or_compensation: { type: "none", reason: "Read-only request has no external mutation to roll back." },
    freshness_date: "2026-07-14",
    compatibility_status: "verified_active"
  }),
  adapter({
    id: "github_repository_get",
    provider: "github",
    category: "backend/authenticated service and developer tooling",
    version: "2026-03-10",
    source_capability_record_id: "api:development:github",
    official_documentation: [
      "https://docs.github.com/en/rest/repos/repos",
      "https://docs.github.com/en/rest/authentication/authenticating-to-the-rest-api",
      "https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api"
    ],
    base_urls: ["https://api.github.com"],
    allowed_methods: ["GET"],
    authentication: optionalBearer(["GITHUB_TOKEN", "GH_TOKEN"], ["github:default"]),
    request_schema: objectSchema({ owner: identifierSchema(), repo: repoSchema() }, ["owner", "repo"]),
    response_schema: { ...objectSchema({ id: { type: "integer" }, full_name: { type: "string" }, html_url: { type: "string" } }, ["id", "full_name", "html_url"]), additionalProperties: true },
    request_mapping: {
      path_template: "/repos/{owner}/{repo}",
      path_parameters: ["owner", "repo"],
      fixed_headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2026-03-10", "User-Agent": "VNEM/1.0" }
    },
    rate_limits: {
      provider_policy: "GitHub documents 60 requests/hour for unauthenticated public reads and generally 5,000 requests/hour for authenticated users; secondary limits also apply.",
      runtime_max_requests: 10,
      runtime_window_ms: 60_000
    },
    retry_policy: safeRetry(),
    timeout_ms: 10_000,
    cache_policy: memoryCache(30_000, false),
    mutation_classification: "credential_optional_read",
    redaction_fields: ["temp_clone_token", "token", "authorization"],
    mock_fixtures: [{
      name: "public-repository",
      request: { owner: "Ovvuhy", repo: "vnem" },
      response: { id: 1, full_name: "Ovvuhy/vnem", html_url: "https://github.com/Ovvuhy/vnem", temp_clone_token: "must-not-leak" }
    }],
    live_test: { approved: false, mutation: false, reason: "Mocked credential-reference proof is sufficient for this phase; live authenticated use depends on user scope." },
    rollback_or_compensation: { type: "none", reason: "Read-only request has no external mutation to roll back." },
    freshness_date: "2026-07-14",
    compatibility_status: "verified_active"
  }),
  adapter({
    id: "world_bank_indicator",
    provider: "world-bank",
    category: "structured public data",
    version: "v2",
    source_capability_record_id: "api:science-math:world-bank",
    official_documentation: [
      "https://datahelpdesk.worldbank.org/knowledgebase/articles/889392-about-the-indicators-api-documentation",
      "https://datahelpdesk.worldbank.org/knowledgebase/articles/898581-api-basic-call-structures"
    ],
    base_urls: ["https://api.worldbank.org"],
    allowed_methods: ["GET"],
    authentication: noAuth(),
    request_schema: objectSchema({
      country: { type: "string", pattern: "^[A-Za-z0-9]{2,3}$", minLength: 2, maxLength: 3 },
      indicator: { type: "string", pattern: "^[A-Za-z0-9.]{3,40}$", minLength: 3, maxLength: 40 },
      date: { type: "string", pattern: "^[0-9]{4}(?::[0-9]{4})?$", maxLength: 9 },
      per_page: integerSchema(1, 100)
    }, ["country", "indicator"]),
    response_schema: { type: "array", minItems: 2, items: {} },
    request_mapping: {
      path_template: "/v2/country/{country}/indicator/{indicator}",
      path_parameters: ["country", "indicator"],
      query_parameters: ["date", "per_page"],
      defaults: { per_page: 10 },
      fixed_query: { format: "json" },
      fixed_headers: { Accept: "application/json", "User-Agent": "VNEM/1.0" }
    },
    rate_limits: { provider_policy: "Official documentation does not publish a numeric general limit; VNEM applies a conservative local cap.", runtime_max_requests: 10, runtime_window_ms: 60_000 },
    retry_policy: safeRetry(),
    timeout_ms: 12_000,
    cache_policy: memoryCache(300_000),
    mutation_classification: "vetted_no_auth_read",
    redaction_fields: [],
    mock_fixtures: [{
      name: "slovakia-population",
      request: { country: "SVK", indicator: "SP.POP.TOTL", date: "2023", per_page: 10 },
      response: [{ page: 1, pages: 1, per_page: 10, total: 1 }, [{ countryiso3code: "SVK", date: "2023", value: 5426740 }]]
    }],
    live_test: { approved: true, mutation: false, fixture: "slovakia-population", network_env: "VNEM_TOOLS_API_LIVE_TESTS" },
    rollback_or_compensation: { type: "none", reason: "Read-only request has no external mutation to roll back." },
    freshness_date: "2026-07-14",
    compatibility_status: "verified_active"
  }),
  adapter({
    id: "apis_guru_metrics",
    provider: "apis-guru",
    category: "developer tooling and structured API data",
    version: "2.2.0",
    source_capability_record_id: "api:development:apis-guru",
    official_documentation: [
      "https://api.apis.guru/v2/specs/apis.guru/2.2.0/openapi.json",
      "https://github.com/APIs-guru/openapi-directory/blob/main/API.md"
    ],
    base_urls: ["https://api.apis.guru"],
    allowed_methods: ["GET"],
    authentication: noAuth(),
    request_schema: objectSchema({}, []),
    response_schema: { ...objectSchema({ numSpecs: { type: "integer" }, numAPIs: { type: "integer" }, numEndpoints: { type: "integer" } }, ["numSpecs", "numAPIs", "numEndpoints"]), additionalProperties: true },
    request_mapping: { path_template: "/v2/metrics.json", fixed_headers: { Accept: "application/json", "User-Agent": "VNEM/1.0" } },
    rate_limits: { provider_policy: "The official API description does not publish a numeric limit; VNEM applies a conservative local cap.", runtime_max_requests: 6, runtime_window_ms: 60_000 },
    retry_policy: safeRetry(),
    timeout_ms: 10_000,
    cache_policy: memoryCache(300_000),
    mutation_classification: "vetted_no_auth_read",
    redaction_fields: [],
    mock_fixtures: [{ name: "directory-metrics", request: {}, response: { numSpecs: 3000, numAPIs: 2500, numEndpoints: 100000 } }],
    live_test: { approved: false, mutation: false, reason: "Mocked integration is enabled; live proof is optional because two other no-auth adapters are exercised live." },
    rollback_or_compensation: { type: "none", reason: "Read-only request has no external mutation to roll back." },
    freshness_date: "2026-07-14",
    compatibility_status: "verified_active"
  }),
  adapter({
    id: "wikipedia_page_info",
    provider: "wikimedia",
    category: "app/product content data",
    version: "Action API current",
    source_capability_record_id: "api:open-data:wikipedia",
    official_documentation: ["https://www.mediawiki.org/wiki/API:Main_page", "https://www.mediawiki.org/wiki/API:Etiquette"],
    base_urls: ["https://en.wikipedia.org"],
    allowed_methods: ["GET"],
    authentication: noAuth(),
    request_schema: objectSchema({ title: stringSchema(1, 200), language: { type: "string", enum: ["en"] } }, ["title"]),
    response_schema: { ...objectSchema({ query: { type: "object" } }, ["query"]), additionalProperties: true },
    request_mapping: {
      path_template: "/w/api.php",
      query_parameters: ["titles"],
      parameter_aliases: { titles: "title" },
      fixed_query: { action: "query", prop: "info", format: "json", formatversion: "2", origin: "*", maxlag: "5" },
      fixed_headers: { Accept: "application/json", "User-Agent": "VNEM/1.0 (https://github.com/Ovvuhy/vnem)" }
    },
    rate_limits: { provider_policy: "MediaWiki etiquette requires a descriptive User-Agent, request limits, maxlag handling, and no abusive parallelism; no single numeric public-read limit is assumed.", runtime_max_requests: 8, runtime_window_ms: 60_000 },
    retry_policy: safeRetry(),
    timeout_ms: 10_000,
    cache_policy: memoryCache(300_000),
    mutation_classification: "vetted_no_auth_read",
    redaction_fields: [],
    mock_fixtures: [{ name: "vnem-page-info", request: { title: "Model Context Protocol", language: "en" }, response: { batchcomplete: true, query: { pages: [{ pageid: 1, title: "Model Context Protocol" }] } } }],
    live_test: { approved: false, mutation: false, reason: "Mocked integration is enabled; live proof is optional because two other no-auth adapters are exercised live." },
    rollback_or_compensation: { type: "none", reason: "Read-only request has no external mutation to roll back." },
    freshness_date: "2026-07-14",
    compatibility_status: "verified_active"
  }),
  adapter({
    id: "cheapshark_deals",
    provider: "cheapshark",
    category: "user-relevant game pricing data",
    version: "1.0",
    source_capability_record_id: "api:games-comics:cheapshark",
    official_documentation: ["https://apidocs.cheapshark.com/"],
    base_urls: ["https://www.cheapshark.com"],
    allowed_methods: ["GET"],
    authentication: noAuth(),
    request_schema: objectSchema({
      title: stringSchema(1, 120),
      page_size: integerSchema(1, 20),
      upper_price: numberSchema(0, 1000),
      on_sale: { type: "boolean" }
    }, []),
    response_schema: { type: "array", items: { type: "object" } },
    request_mapping: {
      path_template: "/api/1.0/deals",
      query_parameters: ["title", "pageSize", "upperPrice", "onSale"],
      parameter_aliases: { pageSize: "page_size", upperPrice: "upper_price", onSale: "on_sale" },
      defaults: { page_size: 10 },
      fixed_headers: { Accept: "application/json", "User-Agent": "VNEM/1.0 (https://github.com/Ovvuhy/vnem)" }
    },
    rate_limits: { provider_policy: "CheapShark documents 429 plus Retry-After behavior without a numeric quota and warns against catalog scraping; VNEM applies a conservative local cap.", runtime_max_requests: 6, runtime_window_ms: 60_000 },
    retry_policy: safeRetry(),
    timeout_ms: 10_000,
    cache_policy: memoryCache(60_000),
    mutation_classification: "vetted_no_auth_read",
    redaction_fields: [],
    mock_fixtures: [{ name: "game-deals", request: { title: "Portal", page_size: 5, upper_price: 20, on_sale: true }, response: [{ gameID: "1", title: "Portal", salePrice: "1.99", dealID: "fixture-deal" }] }],
    live_test: { approved: false, mutation: false, reason: "Mocked integration avoids unnecessary load on a rate-limited community service." },
    rollback_or_compensation: { type: "none", reason: "Read-only request has no external mutation to roll back." },
    freshness_date: "2026-07-14",
    compatibility_status: "verified_active"
  }),
  adapter({
    id: "github_issue_create",
    provider: "github",
    category: "backend authenticated external mutation",
    version: "2026-03-10",
    source_capability_record_id: "api:development:github",
    official_documentation: [
      "https://docs.github.com/en/rest/issues/issues#create-an-issue",
      "https://docs.github.com/en/rest/issues/issues#update-an-issue",
      "https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api"
    ],
    base_urls: ["https://api.github.com"],
    allowed_methods: ["POST"],
    authentication: requiredBearer(["GITHUB_TOKEN", "GH_TOKEN"], ["github:default"]),
    request_schema: objectSchema({
      owner: identifierSchema(),
      repo: repoSchema(),
      title: stringSchema(1, 256),
      body: stringSchema(0, 16_000),
      labels: arraySchema(stringSchema(1, 100), 0, 20)
    }, ["owner", "repo", "title"]),
    response_schema: { ...objectSchema({ number: { type: "integer" }, html_url: { type: "string" }, state: { type: "string" } }, ["number", "html_url"]), additionalProperties: true },
    request_mapping: {
      path_template: "/repos/{owner}/{repo}/issues",
      path_parameters: ["owner", "repo"],
      body_parameters: ["title", "body", "labels"],
      fixed_headers: { Accept: "application/vnd.github+json", "Content-Type": "application/json", "X-GitHub-Api-Version": "2026-03-10", "User-Agent": "VNEM/1.0" }
    },
    rate_limits: { provider_policy: "GitHub content creation is subject to primary and secondary limits; mutation retries are disabled to prevent duplicate issues.", runtime_max_requests: 2, runtime_window_ms: 60_000 },
    retry_policy: { max_attempts: 1, retry_statuses: [], retry_network_errors: false, methods: [] },
    timeout_ms: 10_000,
    cache_policy: memoryCache(0, false),
    mutation_classification: "external_mutation",
    redaction_fields: ["temp_clone_token", "token", "authorization"],
    mock_fixtures: [{ name: "create-issue", request: { owner: "Ovvuhy", repo: "vnem", title: "Phase 16 fixture", body: "Mock-only integration proof", labels: ["test"] }, response: { number: 42, html_url: "https://github.com/Ovvuhy/vnem/issues/42", state: "open" } }],
    live_test: { approved: false, mutation: true, reason: "External mutation is mock-tested only; no disposable remote repository was authorized." },
    rollback_or_compensation: {
      type: "compensation",
      guarantee: "best_effort_not_rollback",
      description: "Close the created issue with state_reason=not_planned; notifications and audit history cannot be undone.",
      method: "PATCH",
      path_template: "/repos/{owner}/{repo}/issues/{issue_number}",
      fixed_body: { state: "closed", state_reason: "not_planned" }
    },
    freshness_date: "2026-07-14",
    compatibility_status: "verified_active"
  })
]);

export class ApiConnectorRuntime {
  constructor(options = {}) {
    this.allowedRoots = (options.allowedRoots || [process.cwd()]).map((item) => path.resolve(item));
    this.evidenceRoot = path.resolve(options.evidenceRoot || path.join(this.allowedRoots[0], ".vnem", "tool-runs"));
    this.environment = options.environment || process.env;
    this.fetchImpl = options.fetchImpl || globalThis.fetch;
    this.now = options.now || (() => Date.now());
    this.adapters = new Map(INITIAL_API_ADAPTERS.map((item) => [item.id, clone(item)]));
    this.rateWindows = new Map();
    this.cache = new Map();
    this.proposals = new Map();
    this.transactions = new Map();
    this.initialized = false;
    this.registryPath = path.join(this.allowedRoots[0], ".vnem", "api-connectors", "adapter-registry.json");
  }

  async catalog(args = {}) {
    await this.initialize();
    const provider = String(args.provider || "").toLowerCase();
    const category = String(args.category || "").toLowerCase();
    const includeGenerated = args.include_generated !== false;
    const adapters = [...this.adapters.values()]
      .filter((item) => !provider || item.provider.toLowerCase() === provider)
      .filter((item) => !category || item.category.toLowerCase().includes(category))
      .filter((item) => includeGenerated || item.origin !== "generated_reviewed")
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(publicAdapter);
    return {
      operation_result: "api_adapter_catalog_ready",
      schema_version: SCHEMA_VERSION,
      adapter_count: adapters.length,
      initial_adapter_count: INITIAL_API_ADAPTERS.length,
      generated_adapter_count: adapters.filter((item) => item.origin === "generated_reviewed").length,
      substantive_categories: [...new Set(adapters.map((item) => item.category))],
      credential_reference_types: CREDENTIAL_TYPES,
      adapters,
      safe_default: "Vetted no-auth GET/HEAD adapters may execute as bounded reads. Credential-bearing reads and external mutations require an exact profile or scoped grant.",
      raw_credential_values_exposed: false,
      must_not_claim: ["Every provider behavior or rate limit is permanently stable.", "A mocked adapter completed a live provider call.", "External compensation erases notifications or audit history."]
    };
  }

  async plan(args = {}) {
    await this.initialize();
    const adapterRecord = this.requireAdapter(args.adapter_id);
    const request = this.buildRequest(adapterRecord, args.parameters || {});
    const credential = normalizeCredentialReference(args.credential_reference);
    this.validateCredentialReference(adapterRecord, credential, { resolve: false });
    const action = actionFor(adapterRecord, credential);
    const domain = new URL(adapterRecord.base_urls[0]).hostname;
    return {
      operation_result: "api_adapter_request_planned",
      adapter_id: adapterRecord.id,
      provider: adapterRecord.provider,
      method: request.method,
      url: redactUrl(request.url),
      domain,
      permission_action: action,
      authentication: publicAuthentication(adapterRecord.authentication),
      credential_reference: publicCredentialReference(credential, false),
      timeout_ms: Math.min(Number(args.timeout_ms || adapterRecord.timeout_ms), MAX_TIMEOUT_MS),
      max_response_bytes: Math.min(Number(args.max_response_bytes || 64 * 1024), MAX_RESPONSE_BYTES),
      rate_limits: clone(adapterRecord.rate_limits),
      retry_policy: clone(adapterRecord.retry_policy),
      cache_policy: clone(adapterRecord.cache_policy),
      mutation_classification: adapterRecord.mutation_classification,
      rollback_or_compensation: clone(adapterRecord.rollback_or_compensation),
      executed: false,
      raw_credential_values_exposed: false,
      must_not_claim: ["The provider was contacted.", "The credential was resolved or accepted by the provider.", "The request succeeded."]
    };
  }

  async credentialStatus(args = {}) {
    await this.initialize();
    const adapterRecord = this.requireAdapter(args.adapter_id);
    const reference = normalizeCredentialReference(args.credential_reference);
    assertRuntimePermission(args.permission_decision, "credential_api_read");
    const checked = this.validateCredentialReference(adapterRecord, reference, { resolve: true });
    return {
      operation_result: checked.resolved ? "credential_reference_available" : "credential_reference_unresolved",
      adapter_id: adapterRecord.id,
      provider: adapterRecord.provider,
      credential_reference: publicCredentialReference(reference, checked.resolved),
      allowed_reference_types: clone(adapterRecord.authentication.credential_reference_types || []),
      value_exposed: false,
      safe_next_step: checked.resolved ? "Use the same reference with an exact credential_api_read or external_api_mutation permission scope." : checked.reason,
      must_not_claim: ["The credential value was returned.", "The credential is valid at the provider.", "The credential has sufficient provider scope."]
    };
  }

  async credentialPlan(args = {}) {
    await this.initialize();
    const adapterRecord = this.requireAdapter(args.adapter_id);
    const reference = normalizeCredentialReference(args.credential_reference);
    this.validateCredentialReference(adapterRecord, reference, { resolve: false });
    return {
      adapter_id: adapterRecord.id,
      provider: adapterRecord.provider,
      domain: new URL(adapterRecord.base_urls[0]).hostname,
      permission_action: "credential_api_read",
      credential_reference: publicCredentialReference(reference, false),
      value_read: false
    };
  }

  async execute(args = {}) {
    await this.initialize();
    const adapterRecord = this.requireAdapter(args.adapter_id);
    const request = this.buildRequest(adapterRecord, args.parameters || {});
    const reference = normalizeCredentialReference(args.credential_reference);
    const action = actionFor(adapterRecord, reference);
    assertRuntimePermission(args.permission_decision, action);
    const credential = this.validateCredentialReference(adapterRecord, reference, { resolve: true });
    const selected = this.selectBaseUrl(adapterRecord);
    const finalUrl = replaceBaseUrl(request.url, adapterRecord.base_urls[0], selected.url);
    validateRuntimeUrl(finalUrl, adapterRecord, selected.test_override);
    this.consumeRateBudget(adapterRecord);

    const cacheKey = sha256(`${adapterRecord.id}\n${finalUrl}\n${JSON.stringify(request.body || null)}`);
    const canCache = adapterRecord.cache_policy.enabled && action === "vetted_api_read" && args.allow_cache !== false;
    const cached = canCache ? this.cache.get(cacheKey) : null;
    if (cached && cached.expires_at > this.now()) {
      return {
        ...clone(cached.result),
        operation_result: "api_adapter_cache_hit",
        cache: { hit: true, stored_at: cached.stored_at, expires_at: cached.expires_at },
        permission: clone(args.permission_decision)
      };
    }

    const headers = { ...request.headers };
    if (credential.value) headers[adapterRecord.authentication.header] = `${adapterRecord.authentication.scheme} ${credential.value}`;
    const timeoutMs = clamp(Number(args.timeout_ms || adapterRecord.timeout_ms), 1000, MAX_TIMEOUT_MS);
    const maxBytes = clamp(Number(args.max_response_bytes || 64 * 1024), 256, MAX_RESPONSE_BYTES);
    const startedAt = this.now();
    const execution = await this.fetchWithPolicy(adapterRecord, finalUrl, {
      method: request.method,
      headers,
      body: request.body === undefined ? undefined : JSON.stringify(request.body)
    }, { timeoutMs, maxBytes });
    const parsed = parseResponse(execution.text, execution.content_type);
    const schemaErrors = validateJsonSchema(adapterRecord.response_schema, parsed, "$response");
    const redactedResponse = redactDeep(parsed, new Set(adapterRecord.redaction_fields.map((item) => item.toLowerCase())), credential.value ? [credential.value] : []);
    const ok = execution.status >= 200 && execution.status < 300 && schemaErrors.length === 0;
    const result = {
      operation_result: ok ? "api_adapter_execution_succeeded" : "api_adapter_execution_failed",
      adapter_id: adapterRecord.id,
      provider: adapterRecord.provider,
      method: request.method,
      url: redactUrl(finalUrl),
      executed: true,
      live_provider: !selected.test_override,
      test_override: selected.test_override,
      status: execution.status,
      ok,
      duration_ms: this.now() - startedAt,
      attempts: execution.attempts,
      response_bytes_observed: execution.bytes_observed,
      response_truncated: execution.truncated,
      response_content_type: execution.content_type,
      response: redactedResponse,
      response_schema_valid: schemaErrors.length === 0,
      response_schema_errors: schemaErrors.slice(0, 20),
      rate_limit_headers: publicRateLimitHeaders(execution.headers),
      credential_reference: publicCredentialReference(reference, credential.resolved),
      credential_value_exposed: false,
      cache: { hit: false, eligible: canCache },
      mutation_classification: adapterRecord.mutation_classification,
      rollback_or_compensation: clone(adapterRecord.rollback_or_compensation),
      permission: clone(args.permission_decision),
      safe_to_claim: [
        `The ${adapterRecord.id} adapter sent one bounded ${request.method} request and received HTTP ${execution.status}.`,
        schemaErrors.length ? null : "The bounded response matched the adapter's declared response schema."
      ].filter(Boolean),
      must_not_claim: [
        selected.test_override ? "A live external provider was contacted." : null,
        schemaErrors.length ? "The response satisfied the declared schema." : null,
        "The provider data is universally complete, current, or error-free.",
        adapterRecord.mutation_classification === "external_mutation" ? "The mutation can be erased without residual audit or notification effects." : null
      ].filter(Boolean)
    };

    if (adapterRecord.mutation_classification === "external_mutation" && execution.status >= 200 && execution.status < 300) {
      result.transaction_id = await this.recordMutationTransaction(adapterRecord, args, result, reference);
    }
    const evidence = await this.writeEvidence("execution", result, credential.value ? [credential.value] : []);
    result.evidence = evidence;
    if (canCache && ok) {
      this.cache.set(cacheKey, { result: clone(result), stored_at: new Date(this.now()).toISOString(), expires_at: this.now() + adapterRecord.cache_policy.ttl_ms });
    }
    return result;
  }

  async compensationPlan(args = {}) {
    await this.initialize();
    const transaction = this.requireTransaction(args.transaction_id);
    const adapterRecord = this.requireAdapter(transaction.adapter_id);
    const behavior = adapterRecord.rollback_or_compensation;
    if (behavior.type !== "compensation") throw new ApiConnectorError("This adapter has no external compensation action.", "api_compensation_unavailable", { adapter_id: adapterRecord.id });
    return {
      operation_result: "api_compensation_planned",
      transaction_id: transaction.transaction_id,
      adapter_id: adapterRecord.id,
      provider: adapterRecord.provider,
      domain: new URL(adapterRecord.base_urls[0]).hostname,
      permission_action: "external_api_mutation",
      compensation: clone(behavior),
      executed: false,
      residual_effects: ["Provider audit history may remain.", "Notifications already sent cannot be recalled.", "Compensation is best-effort and not transactional rollback."],
      must_not_claim: ["The original mutation never occurred.", "Compensation is guaranteed to succeed."]
    };
  }

  async compensate(args = {}) {
    await this.initialize();
    const transaction = this.requireTransaction(args.transaction_id);
    const adapterRecord = this.requireAdapter(transaction.adapter_id);
    const behavior = adapterRecord.rollback_or_compensation;
    assertRuntimePermission(args.permission_decision, "external_api_mutation");
    if (transaction.compensated_at) throw new ApiConnectorError("This transaction already has recorded compensation.", "api_compensation_already_recorded", { transaction_id: transaction.transaction_id, compensated_at: transaction.compensated_at });
    const issueNumber = Number(transaction.response?.number);
    if (!Number.isInteger(issueNumber) || issueNumber < 1) throw new ApiConnectorError("Mutation response did not contain the exact issue number required for compensation.", "api_compensation_identifier_missing");
    const selected = this.selectBaseUrl(adapterRecord);
    const pathValue = fillPath(behavior.path_template, { ...transaction.parameters, issue_number: issueNumber });
    const officialUrl = new URL(pathValue, `${adapterRecord.base_urls[0].replace(/\/$/, "")}/`).toString();
    const url = replaceBaseUrl(officialUrl, adapterRecord.base_urls[0], selected.url);
    validateRuntimeUrl(url, adapterRecord, selected.test_override);
    const credential = this.validateCredentialReference(adapterRecord, transaction.credential_reference, { resolve: true });
    const headers = { ...adapterRecord.request_mapping.fixed_headers, "Content-Type": "application/json" };
    headers[adapterRecord.authentication.header] = `${adapterRecord.authentication.scheme} ${credential.value}`;
    this.consumeRateBudget(adapterRecord);
    const execution = await this.fetchWithPolicy({ ...adapterRecord, retry_policy: { max_attempts: 1, retry_statuses: [], retry_network_errors: false, methods: [] } }, url, {
      method: behavior.method,
      headers,
      body: JSON.stringify(behavior.fixed_body)
    }, { timeoutMs: clamp(Number(args.timeout_ms || adapterRecord.timeout_ms), 1000, MAX_TIMEOUT_MS), maxBytes: clamp(Number(args.max_response_bytes || 64 * 1024), 256, MAX_RESPONSE_BYTES) });
    const parsed = redactDeep(parseResponse(execution.text, execution.content_type), new Set(adapterRecord.redaction_fields), credential.value ? [credential.value] : []);
    const completed = execution.status >= 200 && execution.status < 300;
    const result = {
      operation_result: completed ? "api_compensation_completed" : "api_compensation_failed",
      transaction_id: transaction.transaction_id,
      adapter_id: adapterRecord.id,
      provider: adapterRecord.provider,
      method: behavior.method,
      url: redactUrl(url),
      executed: true,
      completed,
      status: execution.status,
      response: parsed,
      credential_reference: publicCredentialReference(transaction.credential_reference, credential.resolved),
      credential_value_exposed: false,
      permission: clone(args.permission_decision),
      residual_effects: ["Provider audit history may remain.", "Notifications already sent cannot be recalled.", "This is best-effort compensation, not rollback."],
      safe_to_claim: completed ? ["The configured compensation request completed successfully."] : [],
      must_not_claim: ["The original mutation never occurred.", "All external side effects were reversed."]
    };
    result.evidence = await this.writeEvidence("compensation", result, credential.value ? [credential.value] : []);
    if (completed) {
      transaction.compensated_at = new Date(this.now()).toISOString();
      transaction.compensation_evidence = result.evidence;
      this.transactions.set(transaction.transaction_id, transaction);
    }
    return result;
  }

  async generateProposal(args = {}) {
    await this.initialize();
    const source = await this.loadAdapterSource(args);
    const proposal = proposeAdapter(source.document, args);
    proposal.proposal_id = `api-proposal-${randomUUID()}`;
    proposal.created_at = new Date(this.now()).toISOString();
    proposal.review_required = true;
    proposal.contract_test = { passed: false, tested_at: null, errors: [] };
    proposal.activation_acknowledgement = `I REVIEWED VNEM API ADAPTER ${proposal.proposal_id}`;
    proposal.source = source.public;
    proposal.raw_credential_values_exposed = false;
    this.proposals.set(proposal.proposal_id, proposal);
    const evidence = await this.writeEvidence("proposal", proposal);
    return {
      operation_result: "api_adapter_proposal_generated",
      proposal_id: proposal.proposal_id,
      adapter: publicAdapter(proposal.adapter),
      unknowns: proposal.unknowns,
      activation_blockers: proposal.activation_blockers,
      mock_fixtures: clone(proposal.adapter.mock_fixtures),
      generated_contract_tests: clone(proposal.generated_contract_tests),
      review_required: true,
      contract_test_passed: false,
      activation_acknowledgement: proposal.activation_acknowledgement,
      evidence,
      must_not_claim: ["The generated adapter is active.", "Generated code or metadata is trusted before contract tests and human review.", "Unknown auth, rate, terms, or mutation behavior was resolved automatically."]
    };
  }

  async contractTest(args = {}) {
    await this.initialize();
    if (args.proposal_id) {
      const proposal = this.requireProposal(args.proposal_id);
      const errors = testAdapterContract(proposal.adapter);
      proposal.contract_test = { passed: errors.length === 0, tested_at: new Date(this.now()).toISOString(), errors };
      this.proposals.set(proposal.proposal_id, proposal);
      return {
        operation_result: errors.length ? "api_adapter_contract_failed" : "api_adapter_contract_passed",
        proposal_id: proposal.proposal_id,
        adapter_id: proposal.adapter.id,
        passed: errors.length === 0,
        errors,
        fixture_count: proposal.adapter.mock_fixtures.length,
        activation_still_requires_review: true
      };
    }
    const selected = args.adapter_id ? [this.requireAdapter(args.adapter_id)] : [...this.adapters.values()];
    const results = selected.map((item) => ({ adapter_id: item.id, errors: testAdapterContract(item) })).map((item) => ({ ...item, passed: item.errors.length === 0 }));
    return {
      operation_result: results.every((item) => item.passed) ? "api_adapter_contracts_passed" : "api_adapter_contracts_failed",
      passed: results.every((item) => item.passed),
      adapter_count: results.length,
      fixture_count: selected.reduce((sum, item) => sum + item.mock_fixtures.length, 0),
      results
    };
  }

  async activationPlan(args = {}) {
    await this.initialize();
    const proposal = this.requireProposal(args.proposal_id);
    const missingUnknowns = proposal.unknowns.filter((item) => !(args.acknowledged_unknowns || []).includes(item));
    return {
      operation_result: "api_adapter_activation_planned",
      proposal_id: proposal.proposal_id,
      adapter_id: proposal.adapter.id,
      registry_path: relativeInside(this.allowedRoots[0], this.registryPath),
      contract_test_passed: proposal.contract_test.passed,
      review_required: true,
      required_acknowledgement: proposal.activation_acknowledgement,
      activation_blockers: [...proposal.activation_blockers, ...(!proposal.contract_test.passed ? ["contract_test_not_passed"] : []), ...missingUnknowns.map((item) => `unknown_not_acknowledged:${item}`)],
      executed: false
    };
  }

  async reviewActivate(args = {}) {
    await this.initialize();
    assertRuntimePermission(args.permission_decision, "apply_patch");
    const proposal = this.requireProposal(args.proposal_id);
    const plan = await this.activationPlan(args);
    if (args.reviewed !== true) throw new ApiConnectorError("Generated adapters require explicit reviewed=true before activation.", "api_adapter_review_required");
    if (String(args.activation_acknowledgement || "") !== proposal.activation_acknowledgement) throw new ApiConnectorError("Generated adapter review acknowledgement did not match.", "api_adapter_review_acknowledgement_mismatch", { required_acknowledgement: proposal.activation_acknowledgement });
    if (plan.activation_blockers.length) throw new ApiConnectorError("Generated adapter activation remains blocked.", "api_adapter_activation_blocked", { blockers: plan.activation_blockers });
    const activated = clone(proposal.adapter);
    activated.compatibility_status = "reviewed_active";
    activated.origin = "generated_reviewed";
    activated.review = { proposal_id: proposal.proposal_id, reviewed_at: new Date(this.now()).toISOString(), unknowns_acknowledged: [...new Set(args.acknowledged_unknowns || [])], contract_test: clone(proposal.contract_test) };
    const existing = await this.readGeneratedRegistry();
    const adapters = [...existing.adapters.filter((item) => item.id !== activated.id), activated].sort((a, b) => a.id.localeCompare(b.id));
    await this.writeGeneratedRegistry({ schema_version: SCHEMA_VERSION, updated_at: new Date(this.now()).toISOString(), adapters });
    this.adapters.set(activated.id, activated);
    const result = {
      operation_result: "api_adapter_activated",
      proposal_id: proposal.proposal_id,
      adapter_id: activated.id,
      registry_path: relativeInside(this.allowedRoots[0], this.registryPath),
      executed: true,
      review_recorded: true,
      contract_test_passed: true,
      unknowns_acknowledged: activated.review.unknowns_acknowledged,
      permission: clone(args.permission_decision),
      must_not_claim: ["Review proves the external provider will remain compatible forever.", "Activation authorizes credential use or external mutation."]
    };
    result.evidence = await this.writeEvidence("activation", result);
    return result;
  }

  async initialize() {
    if (this.initialized) return;
    const registry = await this.readGeneratedRegistry();
    for (const record of registry.adapters) {
      const errors = validateGeneratedAdapter(record);
      if (!errors.length) this.adapters.set(record.id, record);
    }
    this.initialized = true;
  }

  requireAdapter(id) {
    const normalized = String(id || "");
    const found = this.adapters.get(normalized);
    if (!found) throw new ApiConnectorError("API adapter was not found or is not active.", "api_adapter_not_found", { adapter_id: normalized });
    if (!["verified_active", "reviewed_active"].includes(found.compatibility_status)) throw new ApiConnectorError("API adapter is not compatibility-active.", "api_adapter_incompatible", { adapter_id: normalized, compatibility_status: found.compatibility_status });
    return found;
  }

  requireProposal(id) {
    const found = this.proposals.get(String(id || ""));
    if (!found) throw new ApiConnectorError("API adapter proposal was not found in this server session.", "api_adapter_proposal_not_found", { proposal_id: id });
    return found;
  }

  requireTransaction(id) {
    const found = this.transactions.get(String(id || ""));
    if (!found) throw new ApiConnectorError("API mutation transaction was not found in this server session.", "api_transaction_not_found", { transaction_id: id });
    return found;
  }

  buildRequest(adapterRecord, rawParameters) {
    const parameters = plainObject(rawParameters, "parameters");
    assertNoRawCredentials(parameters);
    const schemaErrors = validateJsonSchema(adapterRecord.request_schema, parameters, "$request");
    if (schemaErrors.length) throw new ApiConnectorError("API adapter request did not match its declared schema.", "api_request_schema_invalid", { errors: schemaErrors.slice(0, 20) });
    const mapping = adapterRecord.request_mapping;
    const values = { ...(mapping.defaults || {}), ...parameters };
    const pathname = fillPath(mapping.path_template, values);
    const url = new URL(pathname, `${adapterRecord.base_urls[0].replace(/\/$/, "")}/`);
    for (const [key, value] of Object.entries(mapping.fixed_query || {})) url.searchParams.set(key, String(value));
    for (const outputName of mapping.query_parameters || []) {
      const inputName = mapping.parameter_aliases?.[outputName] || outputName;
      const value = values[inputName];
      if (value === undefined || value === null || value === "") continue;
      if (SECRET_KEY_RE.test(outputName) || SECRET_KEY_RE.test(inputName)) throw new ApiConnectorError("Secret-bearing URL parameters are blocked; use the credential broker.", "api_secret_parameter_blocked", { parameter: inputName });
      url.searchParams.set(outputName, Array.isArray(value) ? value.join(",") : typeof value === "boolean" ? (value ? "1" : "0") : String(value));
    }
    const body = {};
    for (const outputName of mapping.body_parameters || []) {
      const inputName = mapping.parameter_aliases?.[outputName] || outputName;
      if (values[inputName] !== undefined) body[outputName] = values[inputName];
    }
    return {
      method: adapterRecord.allowed_methods[0],
      url: url.toString(),
      headers: { ...(mapping.fixed_headers || {}) },
      body: Object.keys(body).length ? body : undefined
    };
  }

  validateCredentialReference(adapterRecord, reference, options = {}) {
    const auth = adapterRecord.authentication;
    if (auth.type === "none") {
      if (reference) throw new ApiConnectorError("This no-auth adapter refuses credential references.", "api_credential_unexpected", { adapter_id: adapterRecord.id });
      return { resolved: false, value: null, reason: "No credential is required." };
    }
    if (!reference) {
      if (auth.required) throw new ApiConnectorError("This adapter requires a credential reference, never a raw value.", "api_credential_reference_required", { adapter_id: adapterRecord.id, accepted_types: auth.credential_reference_types });
      return { resolved: false, value: null, reason: "Optional credential reference was not supplied." };
    }
    if (!auth.credential_reference_types.includes(reference.type)) throw new ApiConnectorError("Credential reference type is not allowed for this adapter.", "api_credential_reference_type_blocked", { type: reference.type, accepted_types: auth.credential_reference_types });
    let envName = null;
    if (reference.type === "environment") envName = reference.name;
    if (reference.type === "provider_profile") envName = auth.provider_profiles?.[reference.name] || null;
    if (["client_secret_reference", "os_credential_store"].includes(reference.type)) {
      const mappings = parseCredentialReferenceMap(this.environment.VNEM_TOOLS_API_CREDENTIAL_REFERENCE_MAP);
      envName = mappings[`${reference.type}:${reference.name}`] || null;
    }
    if (envName && !auth.allowed_environment_names.includes(envName)) throw new ApiConnectorError("Credential reference resolves to an environment name outside this adapter allowlist.", "api_credential_environment_blocked", { environment_name: envName });
    if (!options.resolve) return { resolved: Boolean(envName), value: null, reason: envName ? "Reference shape and allowlist are valid; value was not read during planning." : "Reference has no configured broker mapping." };
    if (!envName) return { resolved: false, value: null, reason: "Configure a reference-to-environment-name mapping; raw values are never accepted." };
    const value = this.environment[envName];
    if (typeof value !== "string" || !value) throw new ApiConnectorError("Credential reference is configured but unavailable in the server environment.", "api_credential_reference_unavailable", { type: reference.type, name: reference.name, environment_name: envName, value_exposed: false });
    return { resolved: true, value, reason: "Credential reference resolved internally; value remains hidden." };
  }

  selectBaseUrl(adapterRecord) {
    if (this.environment.VNEM_TOOLS_API_TEST_MODE !== "1") return { url: adapterRecord.base_urls[0], test_override: false };
    let overrides = {};
    try { overrides = JSON.parse(this.environment.VNEM_TOOLS_API_TEST_BASE_URLS || "{}"); } catch { throw new ApiConnectorError("VNEM_TOOLS_API_TEST_BASE_URLS must be valid JSON.", "api_test_override_invalid"); }
    const candidate = overrides[adapterRecord.id] || overrides[adapterRecord.provider];
    if (!candidate) return { url: adapterRecord.base_urls[0], test_override: false };
    const parsed = new URL(candidate);
    if (!isLoopback(parsed.hostname) || this.environment.VNEM_TOOLS_ALLOW_LOCALHOST !== "1") throw new ApiConnectorError("API test overrides are restricted to explicitly enabled loopback hosts.", "api_test_override_blocked", { host: parsed.hostname });
    return { url: parsed.toString().replace(/\/$/, ""), test_override: true };
  }

  consumeRateBudget(adapterRecord) {
    const now = this.now();
    const key = adapterRecord.id;
    const windowMs = adapterRecord.rate_limits.runtime_window_ms;
    const retained = (this.rateWindows.get(key) || []).filter((time) => now - time < windowMs);
    if (retained.length >= adapterRecord.rate_limits.runtime_max_requests) throw new ApiConnectorError("VNEM local adapter rate limit reached before contacting the provider.", "api_local_rate_limit", { adapter_id: key, retry_after_ms: Math.max(1, windowMs - (now - retained[0])) });
    retained.push(now);
    this.rateWindows.set(key, retained);
  }

  async fetchWithPolicy(adapterRecord, url, request, limits) {
    const policy = adapterRecord.retry_policy;
    const method = request.method;
    const maxAttempts = policy.methods.includes(method) ? clamp(policy.max_attempts || 1, 1, 3) : 1;
    let lastError = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), limits.timeoutMs);
      try {
        const response = await this.fetchImpl(url, { ...request, signal: controller.signal, redirect: "error" });
        if (attempt < maxAttempts && policy.retry_statuses.includes(response.status)) {
          await response.body?.cancel().catch(() => {});
          const delayMs = retryDelay(response.headers, attempt, this.environment.VNEM_TOOLS_API_TEST_MODE === "1");
          await delay(delayMs);
          continue;
        }
        const body = await readResponseLimited(response, limits.maxBytes);
        return {
          status: response.status,
          headers: response.headers,
          content_type: response.headers.get("content-type") || "",
          text: body.text,
          bytes_observed: body.bytes_observed,
          truncated: body.truncated,
          attempts: attempt
        };
      } catch (error) {
        lastError = error;
        const retryable = policy.retry_network_errors && attempt < maxAttempts && error?.name !== "AbortError";
        if (!retryable) {
          const code = error?.name === "AbortError" ? "api_request_timeout" : "api_request_network_failed";
          throw new ApiConnectorError(error?.name === "AbortError" ? "API adapter request timed out." : "API adapter network request failed.", code, { adapter_id: adapterRecord.id, attempts: attempt });
        }
        await delay(this.environment.VNEM_TOOLS_API_TEST_MODE === "1" ? 1 : Math.min(100 * 2 ** (attempt - 1), MAX_RETRY_DELAY_MS));
      } finally {
        clearTimeout(timer);
      }
    }
    throw new ApiConnectorError("API adapter request failed after bounded retries.", "api_request_retries_exhausted", { adapter_id: adapterRecord.id, reason: lastError?.name || "unknown" });
  }

  async recordMutationTransaction(adapterRecord, args, result, credentialReference) {
    const transactionId = `api-tx-${randomUUID()}`;
    const record = {
      transaction_id: transactionId,
      adapter_id: adapterRecord.id,
      provider: adapterRecord.provider,
      created_at: new Date(this.now()).toISOString(),
      parameters: redactDeep(args.parameters || {}),
      credential_reference: normalizeCredentialReference(credentialReference),
      response: redactDeep(result.response, new Set(adapterRecord.redaction_fields)),
      compensation: clone(adapterRecord.rollback_or_compensation),
      compensated_at: null
    };
    this.transactions.set(transactionId, record);
    await this.writeEvidence("transaction", record);
    return transactionId;
  }

  async loadAdapterSource(args) {
    if (args.openapi_document && args.structured_document) throw new ApiConnectorError("Provide one OpenAPI document or one structured official document, not both.", "api_adapter_source_ambiguous");
    if (args.openapi_document) {
      enforceDocumentSize(args.openapi_document);
      return { document: clone(args.openapi_document), public: { type: "inline_openapi", bytes: Buffer.byteLength(JSON.stringify(args.openapi_document)) } };
    }
    if (args.structured_document) {
      enforceDocumentSize(args.structured_document);
      return { document: { __structured_official_document: true, ...clone(args.structured_document) }, public: { type: "inline_structured_official_document", bytes: Buffer.byteLength(JSON.stringify(args.structured_document)) } };
    }
    if (!args.spec_path) throw new ApiConnectorError("An OpenAPI JSON file or structured official document is required.", "api_adapter_source_required");
    const file = await this.resolveAllowedFile(args.root || ".", args.spec_path);
    const info = await stat(file);
    if (!info.isFile() || info.size > MAX_SPEC_BYTES) throw new ApiConnectorError("OpenAPI input must be a bounded regular JSON file.", "api_adapter_spec_invalid", { bytes: info.size, max_bytes: MAX_SPEC_BYTES });
    let parsed;
    try { parsed = JSON.parse(await readFile(file, "utf8")); } catch { throw new ApiConnectorError("OpenAPI input is not valid JSON.", "api_adapter_spec_json_invalid"); }
    return { document: parsed, public: { type: "local_openapi_json", path: relativeInside(this.allowedRoots[0], file), bytes: info.size, sha256: sha256(await readFile(file)) } };
  }

  async resolveAllowedFile(rootInput, fileInput) {
    const rootCandidate = path.isAbsolute(rootInput) ? path.resolve(rootInput) : path.resolve(this.allowedRoots[0], rootInput);
    const root = await realpath(rootCandidate);
    if (!insideAny(root, this.allowedRoots)) throw new ApiConnectorError("Adapter source root is outside allowed roots.", "api_adapter_root_outside_allowed");
    const candidate = path.isAbsolute(fileInput) ? path.resolve(fileInput) : path.resolve(root, fileInput);
    const lexicalInfo = await lstat(candidate);
    if (!lexicalInfo.isFile() || lexicalInfo.isSymbolicLink()) throw new ApiConnectorError("Adapter source must be a regular non-link file.", "api_adapter_spec_link_or_nonfile");
    const resolved = await realpath(candidate);
    if (!insidePath(root, resolved) || !insideAny(resolved, this.allowedRoots)) throw new ApiConnectorError("Adapter source file escapes its allowed root.", "api_adapter_spec_escape");
    if (/\.ya?ml$/i.test(resolved)) throw new ApiConnectorError("YAML OpenAPI input is not parsed in this runtime; provide JSON to avoid ambiguous ad hoc parsing.", "api_adapter_yaml_requires_conversion");
    return resolved;
  }

  async readGeneratedRegistry() {
    if (!existsSync(this.registryPath)) return { schema_version: SCHEMA_VERSION, adapters: [] };
    try {
      const info = await lstat(this.registryPath);
      const resolved = await realpath(this.registryPath);
      if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_SPEC_BYTES || !insidePath(this.allowedRoots[0], resolved)) throw new Error("invalid registry file");
      const parsed = JSON.parse(await readFile(this.registryPath, "utf8"));
      return { schema_version: String(parsed.schema_version || ""), adapters: Array.isArray(parsed.adapters) ? parsed.adapters : [] };
    } catch {
      throw new ApiConnectorError("Generated adapter registry is invalid or unreadable.", "api_adapter_registry_invalid", { registry_path: relativeInside(this.allowedRoots[0], this.registryPath) });
    }
  }

  async writeGeneratedRegistry(registry) {
    await ensureRegularDirectory(path.dirname(this.registryPath), this.allowedRoots[0]);
    const temporary = `${this.registryPath}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(redactDeep(registry), null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(temporary, this.registryPath);
  }

  async writeEvidence(kind, value, exactSecrets = []) {
    const directory = path.join(this.evidenceRoot, "api-connectors");
    await mkdir(directory, { recursive: true });
    const id = `api-${kind}-${new Date(this.now()).toISOString().replace(/[:.]/g, "-")}-${randomUUID()}`;
    const file = path.join(directory, `${id}.json`);
    const redacted = redactDeep(value, new Set(), exactSecrets);
    const serialized = `${JSON.stringify(redacted, null, 2)}\n`;
    for (const secret of exactSecrets.filter(Boolean)) {
      if (serialized.includes(secret)) throw new ApiConnectorError("Credential redaction invariant failed before evidence write.", "api_evidence_secret_invariant_failed");
    }
    await writeFile(file, serialized, { encoding: "utf8", mode: 0o600 });
    return { evidence_id: id, path: relativeInside(this.allowedRoots[0], file), sha256: sha256(serialized), raw_credential_values_exposed: false };
  }
}

function adapter(input, options = {}) {
  const normalized = {
    schema_version: SCHEMA_VERSION,
    origin: "vetted_builtin",
    id: input.id,
    provider: input.provider,
    category: input.category,
    version: input.version,
    source_capability_record_id: input.source_capability_record_id || null,
    official_documentation: input.official_documentation,
    base_urls: input.base_urls,
    allowed_methods: input.allowed_methods,
    authentication: input.authentication,
    credential_reference_requirements: {
      raw_values_allowed: false,
      accepted_types: input.authentication.credential_reference_types || [],
      allowed_environment_names: input.authentication.allowed_environment_names || []
    },
    request_schema: input.request_schema,
    response_schema: input.response_schema,
    request_mapping: input.request_mapping,
    rate_limits: input.rate_limits,
    retry_policy: input.retry_policy,
    timeout_ms: input.timeout_ms,
    cache_policy: input.cache_policy,
    mutation_classification: input.mutation_classification,
    redaction_fields: input.redaction_fields,
    mock_fixtures: input.mock_fixtures,
    live_test: input.live_test,
    rollback_or_compensation: input.rollback_or_compensation,
    freshness_date: input.freshness_date,
    compatibility_status: input.compatibility_status
  };
  const errors = validateAdapterContract(normalized);
  const blockingErrors = options.allowUnsupportedSchemaProposal ? errors.filter((item) => !item.includes("unsupported_schema_keyword")) : errors;
  if (blockingErrors.length) throw new Error(`Invalid built-in API adapter ${input.id}: ${blockingErrors.join("; ")}`);
  return deepFreeze(normalized);
}

function noAuth() {
  return { type: "none", required: false, header: null, scheme: null, credential_reference_types: [], allowed_environment_names: [], provider_profiles: {} };
}

function optionalBearer(environmentNames, profiles) {
  return bearer(false, environmentNames, profiles);
}

function requiredBearer(environmentNames, profiles) {
  return bearer(true, environmentNames, profiles);
}

function bearer(required, environmentNames, profiles) {
  return {
    type: required ? "bearer" : "optional_bearer",
    required,
    header: "Authorization",
    scheme: "Bearer",
    credential_reference_types: CREDENTIAL_TYPES,
    allowed_environment_names: environmentNames,
    provider_profiles: Object.fromEntries(profiles.map((item) => [item, environmentNames[0]]))
  };
}

function safeRetry() {
  return { max_attempts: 3, retry_statuses: [429, 500, 502, 503, 504], retry_network_errors: true, methods: ["GET", "HEAD"], backoff: "bounded_exponential_and_retry_after" };
}

function memoryCache(ttlMs, enabled = true) {
  return { enabled: enabled && ttlMs > 0, type: "process_memory", ttl_ms: ttlMs, credential_bearing_cache_allowed: false, mutation_cache_allowed: false };
}

function objectSchema(properties, required = []) {
  return { type: "object", properties, required, additionalProperties: false };
}

function stringSchema(minLength = 0, maxLength = 1000) {
  return { type: "string", minLength, maxLength };
}

function identifierSchema() {
  return { type: "string", pattern: "^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$", minLength: 1, maxLength: 39 };
}

function repoSchema() {
  return { type: "string", pattern: "^[A-Za-z0-9._-]{1,100}$", minLength: 1, maxLength: 100 };
}

function integerSchema(minimum, maximum) {
  return { type: "integer", minimum, maximum };
}

function numberSchema(minimum, maximum) {
  return { type: "number", minimum, maximum };
}

function arraySchema(items, minItems = 0, maxItems = 100) {
  return { type: "array", items, minItems, maxItems };
}

function publicAdapter(item) {
  const output = clone(item);
  output.authentication = publicAuthentication(item.authentication);
  output.raw_credential_values_exposed = false;
  return output;
}

function publicAuthentication(authentication) {
  return {
    type: authentication.type,
    required: authentication.required,
    header: authentication.header,
    scheme: authentication.scheme,
    credential_reference_types: clone(authentication.credential_reference_types || []),
    allowed_environment_names: clone(authentication.allowed_environment_names || []),
    provider_profile_names: Object.keys(authentication.provider_profiles || {}),
    raw_values_allowed: false
  };
}

function normalizeCredentialReference(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "object" || Array.isArray(value)) throw new ApiConnectorError("Credential must be supplied as a typed reference object, never a raw value.", "api_raw_credential_blocked");
  const type = String(value.type || "");
  const name = String(value.name || "");
  if (!CREDENTIAL_TYPES.includes(type) || !name || name.length > 160 || !/^[A-Za-z0-9_.:/-]+$/.test(name)) throw new ApiConnectorError("Credential reference type or name is invalid.", "api_credential_reference_invalid", { type });
  for (const key of Object.keys(value)) if (!new Set(["type", "name"]).has(key)) throw new ApiConnectorError("Credential reference contains unsupported fields; raw values are blocked.", "api_credential_reference_field_blocked", { field: key });
  return { type, name };
}

function publicCredentialReference(reference, resolved) {
  return reference ? { type: reference.type, name: reference.name, resolved: Boolean(resolved), value_exposed: false } : null;
}

function actionFor(adapterRecord, reference) {
  if (adapterRecord.mutation_classification === "external_mutation") return "external_api_mutation";
  if (reference || adapterRecord.authentication.required) return "credential_api_read";
  return "vetted_api_read";
}

function assertRuntimePermission(decision, expectedAction) {
  const action = decision?.action || decision?.action_type;
  if (!decision || action !== expectedAction || decision.allowed !== true || decision.blocked === true) throw new ApiConnectorError("API runtime execution requires an allowed exact permission decision from the shared permission runtime.", "api_permission_decision_missing", { expected_action: expectedAction });
}

function fillPath(template, values) {
  return String(template || "").replace(/\{([^}]+)\}/g, (_, key) => {
    const value = values[key];
    if (value === undefined || value === null || !SAFE_PATH_TOKEN_RE.test(String(value))) throw new ApiConnectorError("API path parameter is missing or unsafe.", "api_path_parameter_invalid", { parameter: key });
    return encodeURIComponent(String(value));
  });
}

function replaceBaseUrl(original, expectedBase, selectedBase) {
  const url = new URL(original);
  const expected = new URL(expectedBase);
  if (url.origin !== expected.origin) throw new ApiConnectorError("Built request escaped its adapter base URL.", "api_request_origin_escape");
  const selected = new URL(selectedBase);
  const basePath = selected.pathname.replace(/\/$/, "");
  selected.pathname = `${basePath}${url.pathname.startsWith("/") ? url.pathname : `/${url.pathname}`}`;
  selected.search = url.search;
  selected.hash = "";
  return selected.toString();
}

function validateRuntimeUrl(value, adapterRecord, testOverride) {
  const url = new URL(value);
  if (url.username || url.password) throw new ApiConnectorError("Credentials in API URLs are blocked.", "api_url_credentials_blocked");
  if (testOverride) {
    if (!isLoopback(url.hostname) || !["http:", "https:"].includes(url.protocol)) throw new ApiConnectorError("Test override escaped loopback.", "api_test_override_escape");
    return;
  }
  if (url.protocol !== "https:") throw new ApiConnectorError("Live API adapters require HTTPS.", "api_https_required");
  const allowed = adapterRecord.base_urls.some((base) => new URL(base).origin === url.origin);
  if (!allowed) throw new ApiConnectorError("API request host is outside the reviewed adapter base URLs.", "api_domain_not_approved", { host: url.hostname });
}

function publicRateLimitHeaders(headers) {
  const names = ["retry-after", "x-ratelimit-limit", "x-ratelimit-remaining", "x-ratelimit-reset", "x-ratelimit-resource"];
  return Object.fromEntries(names.map((name) => [name, headers.get(name)]).filter(([, value]) => value !== null));
}

async function readResponseLimited(response, maxBytes) {
  if (!response.body?.getReader) {
    const raw = Buffer.from(await response.arrayBuffer());
    return { text: raw.subarray(0, maxBytes).toString("utf8"), bytes_observed: raw.length, truncated: raw.length > maxBytes };
  }
  const reader = response.body.getReader();
  const chunks = [];
  let observed = 0;
  let retained = 0;
  let truncated = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      observed += value.byteLength;
      if (retained < maxBytes) {
        const remaining = maxBytes - retained;
        const chunk = Buffer.from(value).subarray(0, remaining);
        chunks.push(chunk);
        retained += chunk.length;
      }
      if (observed > maxBytes) {
        truncated = true;
        await reader.cancel().catch(() => {});
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }
  return { text: Buffer.concat(chunks).toString("utf8"), bytes_observed: observed, truncated };
}

function parseResponse(text, contentType) {
  if (/json/i.test(contentType) || /^[\s\r\n]*[\[{]/.test(text)) {
    try { return JSON.parse(text); } catch { return { parse_error: "invalid_json", text: text.slice(0, 2000) }; }
  }
  return { text: text.slice(0, 4000) };
}

function retryDelay(headers, attempt, testMode) {
  if (testMode) return 1;
  const retryAfter = Number(headers.get("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter >= 0) return Math.min(retryAfter * 1000, MAX_RETRY_DELAY_MS);
  return Math.min(100 * 2 ** (attempt - 1), MAX_RETRY_DELAY_MS);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function validateAdapterContract(record) {
  const errors = [];
  for (const key of ["id", "provider", "version", "official_documentation", "base_urls", "allowed_methods", "authentication", "credential_reference_requirements", "request_schema", "response_schema", "rate_limits", "retry_policy", "timeout_ms", "cache_policy", "mutation_classification", "redaction_fields", "mock_fixtures", "live_test", "rollback_or_compensation", "freshness_date", "compatibility_status", "request_mapping"]) {
    if (record[key] === undefined || record[key] === null) errors.push(`missing:${key}`);
  }
  if (!SAFE_ID_RE.test(String(record.id || ""))) errors.push("invalid:id");
  if (!Array.isArray(record.official_documentation) || !record.official_documentation.length || record.official_documentation.some((url) => !isHttpsUrl(url))) errors.push("invalid:official_documentation");
  if (!Array.isArray(record.base_urls) || !record.base_urls.length || record.base_urls.some((url) => !isHttpsUrl(url))) errors.push("invalid:base_urls");
  if (!Array.isArray(record.allowed_methods) || !record.allowed_methods.length || record.allowed_methods.some((method) => !["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"].includes(method))) errors.push("invalid:allowed_methods");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(record.freshness_date || ""))) errors.push("invalid:freshness_date");
  if (!Array.isArray(record.mock_fixtures) || !record.mock_fixtures.length) errors.push("missing:mock_fixtures");
  if (!record.rate_limits?.runtime_max_requests || !record.rate_limits?.runtime_window_ms) errors.push("invalid:rate_limits");
  if (!record.retry_policy?.max_attempts || !Array.isArray(record.retry_policy?.methods)) errors.push("invalid:retry_policy");
  if (!record.timeout_ms || record.timeout_ms > MAX_TIMEOUT_MS) errors.push("invalid:timeout_ms");
  if (record.authentication?.required && !(record.authentication?.credential_reference_types || []).length) errors.push("invalid:credential_reference_requirements");
  if (record.mutation_classification === "external_mutation" && record.rollback_or_compensation?.type === "none") errors.push("invalid:mutation_compensation");
  errors.push(...unsupportedSchemaErrors(record.request_schema, "$request_schema"));
  errors.push(...unsupportedSchemaErrors(record.response_schema, "$response_schema"));
  return errors;
}

function unsupportedSchemaErrors(schema, location) {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return [];
  const errors = [];
  const unsupported = ["$ref", "allOf", "anyOf", "oneOf", "not", "if", "then", "else", "contains", "dependentSchemas", "patternProperties", "unevaluatedProperties", "unevaluatedItems", "prefixItems", "const", "multipleOf", "exclusiveMinimum", "exclusiveMaximum", "minProperties", "maxProperties", "uniqueItems", "nullable"];
  for (const keyword of unsupported) if (Object.hasOwn(schema, keyword)) errors.push(`${location}:unsupported_schema_keyword:${keyword}`);
  if (schema.additionalProperties && typeof schema.additionalProperties === "object") errors.push(`${location}:unsupported_schema_keyword:additionalProperties_schema`);
  for (const [key, child] of Object.entries(schema.properties || {})) errors.push(...unsupportedSchemaErrors(child, `${location}.properties.${key}`));
  if (schema.items) errors.push(...unsupportedSchemaErrors(schema.items, `${location}.items`));
  return errors;
}

function testAdapterContract(record) {
  const errors = validateAdapterContract(record);
  for (const fixture of record.mock_fixtures || []) {
    const requestErrors = validateJsonSchema(record.request_schema, fixture.request, `$fixture.${fixture.name}.request`);
    const responseErrors = validateJsonSchema(record.response_schema, fixture.response, `$fixture.${fixture.name}.response`);
    errors.push(...requestErrors, ...responseErrors);
    try {
      const values = { ...(record.request_mapping.defaults || {}), ...fixture.request };
      fillPath(record.request_mapping.path_template, values);
    } catch (error) {
      errors.push(`fixture:${fixture.name}:request_mapping:${error.code || error.message}`);
    }
  }
  return [...new Set(errors)];
}

function validateJsonSchema(schema = {}, value, location = "$") {
  const errors = [];
  if (!schema || Object.keys(schema).length === 0) return errors;
  const type = schema.type;
  if (type === "object") {
    if (!isPlainObject(value)) return [`${location}:expected_object`];
    for (const key of schema.required || []) if (value[key] === undefined) errors.push(`${location}.${key}:required`);
    for (const [key, child] of Object.entries(value)) {
      if (["__proto__", "prototype", "constructor"].includes(key)) errors.push(`${location}.${key}:blocked_key`);
      else if (schema.properties?.[key]) errors.push(...validateJsonSchema(schema.properties[key], child, `${location}.${key}`));
      else if (schema.additionalProperties === false) errors.push(`${location}.${key}:additional_property`);
    }
    return errors;
  }
  if (type === "array") {
    if (!Array.isArray(value)) return [`${location}:expected_array`];
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${location}:min_items`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${location}:max_items`);
    value.forEach((item, index) => errors.push(...validateJsonSchema(schema.items || {}, item, `${location}[${index}]`)));
    return errors;
  }
  if (type === "string") {
    if (typeof value !== "string") return [`${location}:expected_string`];
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${location}:min_length`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push(`${location}:max_length`);
    if (schema.pattern) {
      try {
        if (!new RegExp(schema.pattern).test(value)) errors.push(`${location}:pattern`);
      } catch {
        errors.push(`${location}:pattern_invalid`);
      }
    }
    if (schema.enum && !schema.enum.includes(value)) errors.push(`${location}:enum`);
    return errors;
  }
  if (type === "integer" && !Number.isInteger(value)) return [`${location}:expected_integer`];
  if (type === "number" && (typeof value !== "number" || !Number.isFinite(value))) return [`${location}:expected_number`];
  if (type === "boolean" && typeof value !== "boolean") return [`${location}:expected_boolean`];
  if (["integer", "number"].includes(type)) {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${location}:minimum`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${location}:maximum`);
  }
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${location}:enum`);
  return errors;
}

function proposeAdapter(document, args) {
  if (document.__structured_official_document) return proposeFromStructured(document, args);
  const version = document.openapi || document.swagger;
  if (!version) throw new ApiConnectorError("Document is neither OpenAPI nor a supported structured official document.", "api_adapter_document_unsupported");
  const operations = [];
  for (const [pathName, pathItem] of Object.entries(document.paths || {})) {
    for (const method of ["get", "head", "post", "put", "patch", "delete"]) {
      if (pathItem?.[method]) operations.push({ pathName, method: method.toUpperCase(), operation: pathItem[method], pathItem });
    }
  }
  const selected = args.operation_id
    ? operations.find((item) => item.operation.operationId === args.operation_id)
    : operations.length === 1 ? operations[0] : null;
  if (!selected) throw new ApiConnectorError("Select one exact operation_id from the OpenAPI document.", "api_adapter_operation_required", { available_operation_ids: operations.map((item) => item.operation.operationId).filter(Boolean).slice(0, 100) });
  const baseUrl = openApiBaseUrl(document);
  const parameters = [...(selected.pathItem.parameters || []), ...(selected.operation.parameters || [])].filter((item) => !item.$ref);
  const properties = {};
  const required = [];
  const pathParameters = [];
  const queryParameters = [];
  for (const parameter of parameters) {
    const schema = parameter.schema || { type: parameter.type || "string" };
    properties[parameter.name] = clone(schema);
    if (parameter.required) required.push(parameter.name);
    if (parameter.in === "path") pathParameters.push(parameter.name);
    if (parameter.in === "query") queryParameters.push(parameter.name);
  }
  const response = selected.operation.responses?.["200"] || selected.operation.responses?.["201"] || selected.operation.responses?.default || {};
  const responseSchema = response.content?.["application/json"]?.schema || response.schema || {};
  const security = selected.operation.security ?? document.security ?? [];
  const securityUnknown = Array.isArray(security) && security.length > 0;
  const id = String(args.adapter_id || selected.operation.operationId || `${args.provider || document.info?.title || "generated"}-${selected.method.toLowerCase()}`).toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  const fixtureRequest = Object.fromEntries(Object.entries(properties).map(([key, schema]) => [key, exampleForSchema(schema)]).filter(([, value]) => value !== undefined));
  const fixtureResponse = response.content?.["application/json"]?.example || response.example || exampleForSchema(responseSchema) || {};
  return finalizeProposal({
    id,
    provider: String(args.provider || document.info?.title || "generated-provider").toLowerCase().replace(/[^a-z0-9._-]+/g, "-"),
    version: String(document.info?.version || version),
    officialDocumentation: args.official_documentation,
    baseUrl,
    method: selected.method,
    pathTemplate: selected.pathName,
    pathParameters,
    queryParameters,
    requestSchema: objectSchema(properties, required),
    responseSchema,
    fixtureRequest,
    fixtureResponse,
    operationId: selected.operation.operationId || null,
    freshnessDate: args.freshness_date,
    securityUnknown,
    sourceKind: `openapi_${version}`
  });
}

function proposeFromStructured(document, args) {
  const method = String(document.method || "GET").toUpperCase();
  return finalizeProposal({
    id: args.adapter_id || document.id,
    provider: args.provider || document.provider,
    version: document.version,
    officialDocumentation: args.official_documentation || document.official_documentation,
    baseUrl: document.base_url,
    method,
    pathTemplate: document.path,
    pathParameters: document.path_parameters || [],
    queryParameters: document.query_parameters || [],
    requestSchema: document.request_schema || objectSchema({}, []),
    responseSchema: document.response_schema || {},
    fixtureRequest: document.mock_request || {},
    fixtureResponse: document.mock_response || {},
    operationId: document.operation_id || null,
    freshnessDate: args.freshness_date || document.freshness_date,
    securityUnknown: document.authentication_type && document.authentication_type !== "none",
    sourceKind: "structured_official_document"
  });
}

function finalizeProposal(input) {
  if (!SAFE_ID_RE.test(String(input.id || ""))) throw new ApiConnectorError("Generated adapter id is invalid.", "api_adapter_generated_id_invalid");
  if (!input.provider || !input.version || !isHttpsUrl(input.officialDocumentation) || !isHttpsUrl(input.baseUrl) || !/^\d{4}-\d{2}-\d{2}$/.test(String(input.freshnessDate || ""))) throw new ApiConnectorError("Generated adapter requires provider, version, HTTPS official documentation/base URL, and an exact freshness date.", "api_adapter_generation_metadata_required");
  const unknowns = ["provider_numeric_rate_limit", "provider_terms_and_retention", "cache_freshness_semantics", "provider_error_schema"];
  const blockers = [];
  if (!SAFE_METHODS.has(input.method)) blockers.push("generated_external_mutation_requires_handwritten_reviewed_adapter");
  if (input.securityUnknown) blockers.push("generated_authentication_scheme_requires_manual_credential_contract");
  if ([...input.pathParameters, ...input.queryParameters].some((item) => SECRET_KEY_RE.test(item))) blockers.push("secret_bearing_parameter_requires_credential_broker_design");
  const unsupportedSchemas = [...unsupportedSchemaErrors(input.requestSchema, "$request_schema"), ...unsupportedSchemaErrors(input.responseSchema, "$response_schema")];
  if (unsupportedSchemas.length) blockers.push(...unsupportedSchemas.map((item) => `generated_${item}`));
  const generated = clone(adapter({
    id: input.id,
    provider: input.provider,
    category: "generated reviewed API adapter",
    version: input.version,
    source_capability_record_id: null,
    official_documentation: [input.officialDocumentation],
    base_urls: [input.baseUrl],
    allowed_methods: [input.method],
    authentication: noAuth(),
    request_schema: input.requestSchema,
    response_schema: input.responseSchema,
    request_mapping: { path_template: input.pathTemplate, path_parameters: input.pathParameters, query_parameters: input.queryParameters, fixed_headers: { Accept: "application/json", "User-Agent": "VNEM/1.0" } },
    rate_limits: { provider_policy: "Unknown in generated source; reviewer acknowledgement required.", runtime_max_requests: 3, runtime_window_ms: 60_000 },
    retry_policy: safeRetry(),
    timeout_ms: 10_000,
    cache_policy: memoryCache(30_000),
    mutation_classification: "vetted_no_auth_read",
    redaction_fields: [],
    mock_fixtures: [{ name: "generated-contract-fixture", request: input.fixtureRequest, response: input.fixtureResponse }],
    live_test: { approved: false, mutation: false, reason: "Generated adapters require review and activation before any live test." },
    rollback_or_compensation: { type: "none", reason: "Generated activation is restricted to no-auth GET/HEAD." },
    freshness_date: input.freshnessDate,
    compatibility_status: "verified_active"
  }, { allowUnsupportedSchemaProposal: true }));
  generated.compatibility_status = "generated_review_required";
  generated.origin = "generated_proposal";
  return {
    adapter: generated,
    unknowns,
    activation_blockers: blockers,
    generated_contract_tests: ["request fixture matches request schema", "response fixture matches response schema", "schema uses the supported bounded validator subset", "path template resolves from fixture", "HTTPS base URL remains fixed", "only GET/HEAD can activate"]
  };
}

function openApiBaseUrl(document) {
  if (document.openapi) {
    const value = document.servers?.[0]?.url;
    if (!value || /\{[^}]+\}/.test(value)) throw new ApiConnectorError("OpenAPI server URL is missing or contains unresolved variables.", "api_adapter_server_url_unknown");
    return value;
  }
  const scheme = document.schemes?.includes("https") ? "https" : document.schemes?.[0];
  if (!scheme || !document.host) throw new ApiConnectorError("Swagger host/scheme is missing.", "api_adapter_server_url_unknown");
  return `${scheme}://${document.host}${document.basePath || ""}`;
}

function exampleForSchema(schema = {}, depth = 0) {
  if (depth > 6) return null;
  if (schema.example !== undefined) return clone(schema.example);
  if (schema.default !== undefined) return clone(schema.default);
  if (schema.enum?.length) return clone(schema.enum[0]);
  if (schema.type === "object" || schema.properties) return Object.fromEntries(Object.entries(schema.properties || {}).map(([key, child]) => [key, exampleForSchema(child, depth + 1)]));
  if (schema.type === "array") return [exampleForSchema(schema.items || {}, depth + 1)];
  if (schema.type === "integer") return schema.minimum ?? 1;
  if (schema.type === "number") return schema.minimum ?? 1;
  if (schema.type === "boolean") return false;
  if (schema.type === "string") return schema.pattern ? safePatternExample(schema.pattern) : "example";
  return {};
}

function safePatternExample(pattern) {
  if (/A-Za-z0-9/.test(pattern)) return "example";
  return "value";
}

function validateGeneratedAdapter(record) {
  const errors = validateAdapterContract(record);
  if (record.origin !== "generated_reviewed" || record.compatibility_status !== "reviewed_active") errors.push("generated:not_reviewed_active");
  if (record.authentication?.type !== "none") errors.push("generated:auth_not_allowed");
  if (record.allowed_methods?.some((method) => !SAFE_METHODS.has(method))) errors.push("generated:mutation_not_allowed");
  if (record.review?.contract_test?.passed !== true || !record.review?.proposal_id || !Array.isArray(record.review?.unknowns_acknowledged)) errors.push("generated:review_or_contract_proof_missing");
  return errors;
}

function assertNoRawCredentials(value, location = "$request") {
  if (typeof value === "string") {
    if (SECRET_VALUE_RE.test(value)) throw new ApiConnectorError("Raw credential-shaped request content is blocked; use a typed credential reference.", "api_raw_credential_parameter_blocked", { location });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoRawCredentials(item, `${location}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (SECRET_KEY_RE.test(key)) throw new ApiConnectorError("Secret-bearing request fields are blocked; use the credential broker.", "api_secret_parameter_blocked", { location: `${location}.${key}` });
    assertNoRawCredentials(child, `${location}.${key}`);
  }
}

async function ensureRegularDirectory(directory, root) {
  const resolvedRoot = await realpath(root);
  const relative = path.relative(resolvedRoot, directory);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new ApiConnectorError("Generated adapter registry directory escapes the allowed root.", "api_adapter_registry_escape");
  let current = resolvedRoot;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    if (!existsSync(current)) await mkdir(current);
    const info = await lstat(current);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new ApiConnectorError("Generated adapter registry path contains a link or non-directory component.", "api_adapter_registry_link_or_non_directory", { path: relativeInside(resolvedRoot, current) });
    const resolved = await realpath(current);
    if (!insidePath(resolvedRoot, resolved)) throw new ApiConnectorError("Generated adapter registry path escapes the allowed root.", "api_adapter_registry_escape");
  }
}

function parseCredentialReferenceMap(raw) {
  if (!raw) return {};
  let parsed;
  try { parsed = JSON.parse(raw); } catch { throw new ApiConnectorError("Credential reference mapping must be valid JSON containing environment variable names only.", "api_credential_map_invalid"); }
  if (!isPlainObject(parsed)) throw new ApiConnectorError("Credential reference mapping must be an object.", "api_credential_map_invalid");
  const output = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (!/^(client_secret_reference|os_credential_store):[A-Za-z0-9_.:/-]+$/.test(key) || !/^[A-Z][A-Z0-9_]{1,127}$/.test(String(value))) throw new ApiConnectorError("Credential mapping may contain reference ids and environment variable names only.", "api_credential_map_entry_invalid", { key });
    output[key] = String(value);
  }
  return output;
}

function enforceDocumentSize(document) {
  const bytes = Buffer.byteLength(JSON.stringify(document));
  if (bytes > MAX_SPEC_BYTES) throw new ApiConnectorError("Inline adapter source exceeds the bounded document limit.", "api_adapter_document_too_large", { bytes, max_bytes: MAX_SPEC_BYTES });
}

function plainObject(value, label) {
  if (!isPlainObject(value)) throw new ApiConnectorError(`${label} must be a plain object.`, "api_plain_object_required");
  return value;
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function redactDeep(value, fieldNames = new Set(), exactSecrets = []) {
  const secrets = exactSecrets.filter((item) => typeof item === "string" && item.length > 0);
  if (typeof value === "string") {
    let output = value;
    for (const secret of secrets) output = output.split(secret).join("[REDACTED]");
    if (SECRET_VALUE_RE.test(output)) return output.replace(/bearer\s+[a-z0-9._~+/-]{8,}/gi, "Bearer [REDACTED]").replace(/github_pat_[a-z0-9_]{20,}|gh[pousr]_[a-z0-9_]{20,}|sk-[a-z0-9_-]{10,}/gi, "[REDACTED]");
    return output;
  }
  if (Array.isArray(value)) return value.map((item) => redactDeep(item, fieldNames, secrets));
  if (!value || typeof value !== "object") return value;
  const output = {};
  for (const [key, child] of Object.entries(value)) {
    output[key] = SECRET_KEY_RE.test(key) || fieldNames.has(key.toLowerCase()) ? "[REDACTED]" : redactDeep(child, fieldNames, secrets);
  }
  return output;
}

function redactUrl(value) {
  const url = new URL(value);
  if (url.username) url.username = "[REDACTED]";
  if (url.password) url.password = "[REDACTED]";
  for (const key of [...url.searchParams.keys()]) if (SECRET_KEY_RE.test(key)) url.searchParams.set(key, "[REDACTED]");
  return url.toString();
}

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : minimum));
}

function isHttpsUrl(value) {
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}

function isLoopback(hostname) {
  return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(String(hostname).toLowerCase());
}

function insideAny(candidate, roots) {
  return roots.some((root) => insidePath(root, candidate));
}

function insidePath(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function relativeInside(root, candidate) {
  return path.relative(root, candidate).replace(/\\/g, "/") || ".";
}
