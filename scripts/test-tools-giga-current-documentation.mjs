#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const liveEnabled = process.argv.includes("--live");
const benchmarkArg = process.argv.find((arg) => arg.startsWith("--benchmark-output="));
const benchmarkOutput = benchmarkArg ? safeOutputPath(benchmarkArg.slice("--benchmark-output=".length)) : null;
await mkdir(path.join(repoRoot, ".tmp"), { recursive: true });
const tempRoot = await mkdtemp(path.join(repoRoot, ".tmp", "current-docs-phase18-"));
const phaseTools = [
  "vnem_tools_documentation_source_catalog",
  "vnem_tools_official_documentation_fetch",
  "vnem_tools_documentation_context",
  "vnem_tools_documentation_cache_status"
];
const timings = {};
let client;
let transport;
let liveClient;
let liveTransport;
let stderr = "";

const officialUrl = "https://react.dev/reference/react/components";
const communityUrl = "https://community.example.test/react-components";
const redirectUrl = "https://community.example.test/redirect";
const oversizedUrl = "https://react.dev/reference/react?large=1";
const officialBody = [
  "<!doctype html><html><head>",
  '<meta property="article:modified_time" content="2026-07-10T12:00:00Z">',
  "<script>API_TOKEN=fixture-secret-must-not-return</script></head><body>",
  "<h1>React Components</h1>",
  "<h2>Client rendering in React 19</h2>",
  "<p>React components must use createRoot for client rendering in version 19.</p>",
  "<p>The root API should be imported from react-dom/client.</p>",
  "<h2>Unrelated deployment appendix</h2>",
  `<p>${"UNRELATED_FULL_PAGE_SENTINEL ".repeat(180)}</p>`,
  "</body></html>"
].join("");
const communityBody = [
  "# Community React note",
  "",
  "React components must not use createRoot for client rendering in version 19.",
  "This community claim should never become authoritative merely because HTTP returned 200."
].join("\n");
const fixtureResponses = {
  [officialUrl]: [
    {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        etag: '"react-components-v19"',
        "last-modified": "Fri, 10 Jul 2026 12:00:00 GMT"
      },
      body: officialBody
    },
    {
      status: 304,
      headers: {
        etag: '"react-components-v19"',
        "last-modified": "Fri, 10 Jul 2026 12:00:00 GMT"
      },
      body: ""
    }
  ],
  [communityUrl]: {
    status: 200,
    headers: { "content-type": "text/markdown", etag: '"community-v1"' },
    body: communityBody
  },
  [redirectUrl]: {
    status: 302,
    headers: { location: "https://evil.example.invalid/redirected" },
    body: ""
  },
  [oversizedUrl]: {
    status: 200,
    headers: { "content-type": "text/plain", "content-length": "6000" },
    body: "x".repeat(6000)
  }
};

try {
  ({ client, transport } = await connectTools({
    ...process.env,
    VNEM_TOOLS_ROOT: tempRoot,
    VNEM_TOOLS_PRECISION_ROOT: tempRoot,
    VNEM_TOOLS_ALLOWED_ROOTS: [repoRoot, tempRoot].join(path.delimiter),
    VNEM_TOOLS_PERMISSION_PROFILE: "safe-local-dev",
    VNEM_TOOLS_SKIP_WRANGLER_CHECK: "1",
    VNEM_PRECISION_TEST_DOC_RESPONSES: JSON.stringify(fixtureResponses)
  }));

  const listed = await client.listTools();
  const toolNames = new Set(listed.tools.map((tool) => tool.name));
  for (const name of phaseTools) assert.ok(toolNames.has(name), `missing Phase 18 tool ${name}`);

  const catalog = await timed("catalog_ms", () => behaviorValue("vnem_tools_documentation_source_catalog", {}, "documentation_source_catalog"));
  assert.ok(catalog.source_count >= 20);
  for (const provider of ["React", "Next.js", "Vite", "Node.js", "TypeScript", "MDN Web Docs", "Cloudflare", "GitHub Docs", "Luau"]) {
    assert.ok(catalog.sources.some((source) => source.name === provider), `missing official provider ${provider}`);
  }
  assert.ok(catalog.provider_adapters.includes("react_docs"));
  assert.match(catalog.authority_policy, /not caller labels or HTTP success/);
  assert.match(catalog.currentness_policy, /HTTP success alone is never currentness proof/);

  const routed = await callValue(client, "vnem_tools_entrypoint", {
    user_goal: "Retrieve current official React documentation with cache freshness and contradiction proof.",
    root: tempRoot,
    task_mode: "documentation"
  }, "tools_entrypoint");
  assert.deepEqual(routed.exact_tool_call_sequence.slice(0, 4).map((step) => step.tool), phaseTools);

  const first = await timed("official_network_fetch_ms", () => behaviorValue("vnem_tools_official_documentation_fetch", {
    library: "React",
    topic: "components",
    query: "client rendering createRoot",
    version: "19",
    cache_mode: "refresh",
    max_sections: 1,
    context_chars: 2400,
    worker_id: "phase18",
    task_id: "current-docs",
    approved: true,
    approval_note: "Phase 18 bounded official documentation fixture retrieval."
  }, null));
  assert.equal(first.operation_result, "current_documentation_retrieved");
  assert.equal(first.documentation.source_classification.official, true);
  assert.equal(first.documentation.source_classification.provider_adapter, "react_docs");
  assert.equal(first.documentation.authority.http_success_alone_sufficient, false);
  assert.equal(first.documentation.authority.current_path_freshly_validated, true);
  assert.equal(first.documentation.version_relevance.status, "matched");
  assert.equal(first.documentation.implementation_readiness.ready, true);
  assert.equal(first.documentation.freshness.cache_status, "network_fetched");
  assert.equal(first.documentation.freshness.network_request_made, true);
  assert.equal(first.documentation.freshness.etag, '"react-components-v19"');
  assert.equal(first.documentation.source_date, "2026-07-10T12:00:00.000Z");
  assert.equal(first.documentation.full_page_returned, false);
  assert.equal(first.documentation.sections.length, 1);
  assert.match(first.documentation.excerpt, /createRoot/);
  assert.doesNotMatch(first.documentation.excerpt, /UNRELATED_FULL_PAGE_SENTINEL/);
  assert.doesNotMatch(JSON.stringify(first), /fixture-secret-must-not-return/);
  assert.ok(first.context_chars <= 2400);
  assert.equal(first.documentation.content_sha256.length, 64);

  const revalidated = await timed("official_conditional_304_ms", () => fetchDocs(client, {
    library: "React",
    topic: "components",
    query: "client rendering createRoot",
    version: "19",
    cache_mode: "refresh",
    worker_id: "phase18",
    task_id: "current-docs",
    approved: true,
    approval_note: "Phase 18 conditional cache revalidation fixture."
  }));
  assert.equal(revalidated.documentation.freshness.cache_status, "revalidated_not_modified");
  assert.equal(revalidated.documentation.freshness.conditional_request.if_none_match_sent, true);
  assert.equal(revalidated.documentation.freshness.conditional_request.if_modified_since_sent, true);
  assert.equal(revalidated.documentation.content_sha256, first.documentation.content_sha256);

  const blockedCommunity = await callRaw(client, "vnem_tools_official_documentation_fetch", {
    library: "React",
    url: communityUrl,
    cache_mode: "refresh",
    approved: true,
    approval_note: "Verify unknown-domain policy."
  });
  assertError(blockedCommunity, "documentation_community_approval_required");

  const community = await timed("community_fetch_ms", () => fetchDocs(client, {
    library: "React",
    topic: "community-components",
    query: "client rendering createRoot",
    version: "19",
    url: communityUrl,
    allow_community: true,
    cache_mode: "refresh",
    worker_id: "phase18",
    task_id: "current-docs",
    approved: true,
    approval_note: "Phase 18 explicitly approved community comparison fixture."
  }));
  assert.equal(community.documentation.source_classification.official, false);
  assert.equal(community.documentation.source_classification.provider_adapter, "generic_community_docs");
  assert.equal(community.documentation.authority.authoritative, false);
  assert.equal(community.documentation.authority.http_success_alone_sufficient, false);
  assert.equal(community.documentation.implementation_readiness.ready, false);
  assert.ok(community.documentation.implementation_readiness.blockers.includes("source_not_official"));

  const context = await timed("contradiction_context_ms", () => behaviorValue("vnem_tools_documentation_context", {
    worker_id: "phase18",
    task_id: "current-docs",
    library: "React",
    include_community: true,
    max_context_chars: 2400
  }, "documentation_context"));
  assert.equal(context.record_count, 2);
  assert.ok(context.contradiction_count >= 1);
  assert.equal(context.contradictions[0].preferred_source_url, officialUrl);
  assert.ok(context.context_chars <= 2400);
  assert.equal(context.context_sha256.length, 64);
  assert.equal(context.full_pages_injected, false);
  assert.match(context.context_injection, /Contradictions requiring review/);

  const unprovenVersion = await fetchDocs(client, {
    library: "React",
    topic: "components",
    query: "client rendering createRoot",
    version: "99",
    cache_mode: "cache_only",
    worker_id: "phase18",
    task_id: "unproven-version"
  });
  assert.equal(unprovenVersion.documentation.version_relevance.status, "not_observed");
  assert.equal(unprovenVersion.documentation.implementation_readiness.ready, false);
  assert.ok(unprovenVersion.documentation.implementation_readiness.blockers.includes("requested_version_not_observed"));
  assert.ok(unprovenVersion.must_not_claim.some((claim) => claim.includes("requested version 99")));

  const stale = await fetchDocs(client, {
    library: "React",
    topic: "components",
    query: "client rendering createRoot",
    version: "19",
    cache_mode: "cache_only",
    max_age_seconds: 0,
    worker_id: "phase18",
    task_id: "stale-cache"
  });
  assert.equal(stale.documentation.freshness.cache_status, "cache_only_stale");
  assert.equal(stale.documentation.freshness.network_request_made, false);
  assert.equal(stale.documentation.implementation_readiness.ready, false);
  assert.ok(stale.documentation.implementation_readiness.blockers.includes("cache_stale"));

  const cacheStatus = await behaviorValue("vnem_tools_documentation_cache_status", { max_age_seconds: 0 }, "documentation_cache_status");
  assert.equal(cacheStatus.persistent, true);
  assert.ok(cacheStatus.entry_count >= 2);
  assert.ok(cacheStatus.stale_count >= 2);
  assert.ok(cacheStatus.entries.every((entry) => entry.content_sha256?.length === 64));
  assert.equal(JSON.stringify(cacheStatus).includes("normalized_text"), false);
  assert.equal(existsSync(path.join(tempRoot, ".vnem-runtime", "precision", "documentation-cache.json")), true);

  await expectPolicyError("documentation_url_not_https", { library: "React", url: "http://react.dev/reference/react", approved: true, approval_note: "policy test" });
  await expectPolicyError("documentation_url_credentials_blocked", { library: "React", url: "https://user:pass@react.dev/reference/react", approved: true, approval_note: "policy test" });
  await expectPolicyError("documentation_url_sensitive_query_blocked", { library: "React", url: "https://react.dev/reference/react?token=secret", approved: true, approval_note: "policy test" });
  await expectPolicyError("documentation_redirect_origin_blocked", { library: "React", url: redirectUrl, allow_community: true, cache_mode: "refresh", approved: true, approval_note: "policy test" });
  await expectPolicyError("documentation_too_large", { library: "React", url: oversizedUrl, cache_mode: "refresh", max_bytes: 1024, approved: true, approval_note: "policy test" });

  const registry = await callValue(client, "vnem_tools_registry_status", {}, "registry_status");
  const registryEntries = new Map(registry.tools.filter((item) => phaseTools.includes(item.name)).map((item) => [item.name, item]));
  assert.equal(registryEntries.size, phaseTools.length);
  assert.equal(registryEntries.get("vnem_tools_official_documentation_fetch").network_behavior, "bounded_or_approved_network");
  for (const name of ["vnem_tools_documentation_source_catalog", "vnem_tools_documentation_context", "vnem_tools_documentation_cache_status"]) {
    assert.equal(registryEntries.get(name).side_effect_class, "read_only");
  }
  const manifest = await callValue(client, "vnem_tools_manifest", { capability_group: "current_documentation" }, "manifest");
  assert.deepEqual(manifest.tools.map((item) => item.name).sort(), [...phaseTools].sort());
  assert.equal(manifest.tools.every((item) => item.capability_group === "current_documentation"), true);
  for (const tool of phaseTools) {
    const coverage = await callValue(client, "vnem_tools_tool_test_coverage_map", { root: repoRoot, tool_name: tool, max_tools: 10 }, "tool_test_coverage_map");
    assert.equal(coverage.per_tool[tool].coverage_level, "behavior_test", `${tool} lacks behavior coverage proof`);
    assert.ok(coverage.per_tool[tool].behavior_test_files.includes("scripts/test-tools-giga-current-documentation.mjs"));
  }

  let liveProof = null;
  if (liveEnabled) {
    ({ client: liveClient, transport: liveTransport } = await connectTools({
      ...process.env,
      VNEM_TOOLS_ROOT: tempRoot,
      VNEM_TOOLS_PRECISION_ROOT: path.join(tempRoot, "live"),
      VNEM_TOOLS_ALLOWED_ROOTS: [repoRoot, tempRoot].join(path.delimiter),
      VNEM_TOOLS_PERMISSION_PROFILE: "safe-local-dev",
      VNEM_TOOLS_SKIP_WRANGLER_CHECK: "1",
      VNEM_PRECISION_TEST_DOC_RESPONSES: ""
    }));
    const results = [];
    for (const library of ["React", "Node.js", "Vite"]) {
      const result = await timed(`live_${library.toLowerCase().replace(/[^a-z]+/g, "_")}_ms`, () => fetchDocs(liveClient, {
        library,
        query: library === "React" ? "components" : "getting started",
        cache_mode: "refresh",
        max_sections: 2,
        context_chars: 3000,
        worker_id: "phase18-live",
        task_id: library,
        approved: true,
        approval_note: "Phase 18 approved bounded public official documentation proof."
      }));
      assert.equal(result.documentation.source_classification.official, true);
      assert.equal(result.documentation.freshness.network_request_made, true);
      assert.equal(result.documentation.full_page_returned, false);
      results.push(result.documentation);
    }
    liveProof = results.map((document) => ({
      library: document.library,
      url: document.url,
      validated_at: document.validated_at,
      source_date: document.source_date,
      content_sha256: document.content_sha256,
      extracted_sha256: document.extracted_sha256,
      cache_status: document.freshness.cache_status,
      official: document.source_classification.official,
      sections: document.sections.map((section) => section.heading),
      full_page_returned: document.full_page_returned
    }));
  }

  if (benchmarkOutput) {
    const benchmark = {
      phase: 18,
      generated_at: new Date().toISOString(),
      scope: liveEnabled ? "real_stdio_mcp_current_documentation_with_live_official_sources" : "real_stdio_mcp_current_documentation_with_deterministic_sources",
      tools_exercised: phaseTools,
      timings_ms: timings,
      fixture_proof: {
        official_source_classified_by_exact_domain: true,
        bounded_relevant_section_extraction: true,
        timestamp_and_content_hash_cache: true,
        etag_and_last_modified_revalidation: true,
        stale_cache_detected: true,
        source_url_and_date_preserved: true,
        official_community_distinction: true,
        contradiction_detected_and_official_source_preferred: true,
        url_redirect_and_size_policy_enforced: true,
        http_success_not_authority_or_currentness_proof: true,
        full_page_returned_or_injected: false,
        real_stdio_mcp: true
      },
      live_official_proof: liveProof,
      limitations: [
        "Relevance extraction and contradiction detection are bounded heuristics and do not prove semantic completeness.",
        "A fresh official path does not prove a content publication date or requested version unless the source exposes that evidence.",
        liveProof ? "The three official URLs responded in this run; future availability and content remain external." : "Live official retrieval was not requested in this invocation."
      ]
    };
    await mkdir(path.dirname(benchmarkOutput), { recursive: true });
    await writeFile(benchmarkOutput, `${JSON.stringify(benchmark, null, 2)}\n`, "utf8");
  }
} finally {
  await client?.close().catch(() => {});
  await liveClient?.close().catch(() => {});
  await new Promise((resolve) => setTimeout(resolve, 120));
  await rm(tempRoot, { recursive: true, force: true }).catch(() => {});
  if (stderr.trim()) process.stderr.write(stderr);
}

console.log(`VNEM GIGA Phase 18 current documentation tests passed${liveEnabled ? " with live official retrieval" : ""}`);

async function fetchDocs(targetClient, args) {
  return callValue(targetClient, "vnem_tools_official_documentation_fetch", args, null);
}

async function expectPolicyError(code, args) {
  const result = await callRaw(client, "vnem_tools_official_documentation_fetch", args);
  assertError(result, code);
}

function assertError(result, code) {
  assert.equal(result.isError, true, `expected ${code}`);
  assert.equal(result.structuredContent?.code, code);
  assert.equal(JSON.stringify(result).includes("fixture-secret-must-not-return"), false);
}

async function callValue(targetClient, name, args, key) {
  const result = await callRaw(targetClient, name, args);
  assert.notEqual(result.isError, true, `${name} failed: ${JSON.stringify(result.structuredContent)}`);
  if (!key) return result.structuredContent;
  assert.ok(result.structuredContent?.[key], `${name} omitted ${key}`);
  return result.structuredContent[key];
}

async function behaviorValue(name, args, key) {
  const result = await client.callTool({ name, arguments: args });
  assert.notEqual(result.isError, true, `${name} failed: ${JSON.stringify(result.structuredContent)}`);
  if (!key) return result.structuredContent;
  assert.ok(result.structuredContent?.[key], `${name} omitted ${key}`);
  return result.structuredContent[key];
}

async function callRaw(targetClient, name, args) {
  return targetClient.callTool({ name, arguments: args });
}

async function connectTools(env) {
  const connectedClient = new Client({ name: "vnem-tools-giga-current-docs-test", version: "1.0.1" }, { capabilities: {} });
  const connectedTransport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(scriptDir, "vnem-tools-mcp-server.mjs")],
    cwd: repoRoot,
    env,
    stderr: "pipe"
  });
  connectedTransport.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });
  await connectedClient.connect(connectedTransport);
  return { client: connectedClient, transport: connectedTransport };
}

async function timed(name, fn) {
  const started = performance.now();
  const result = await fn();
  timings[name] = Math.round((performance.now() - started) * 100) / 100;
  return result;
}

function safeOutputPath(value) {
  const resolved = path.resolve(repoRoot, value);
  const relative = path.relative(repoRoot, resolved).replace(/\\/g, "/");
  assert.ok(!relative.startsWith("..") && !path.isAbsolute(relative), "benchmark output must remain inside the repository");
  assert.ok(/^(?:\.tmp|\.vnem\/giga-evolution)\/.+\.json$/i.test(relative), "benchmark output must be JSON under .tmp or .vnem/giga-evolution");
  return resolved;
}
