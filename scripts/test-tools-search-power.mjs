#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
await mkdir(path.join(rootDir, ".tmp"), { recursive: true });
const tmpRoot = await mkdtemp(path.join(rootDir, ".tmp", "tools-search-power-"));
const workspace = path.join(tmpRoot, "workspace");
await mkdir(workspace, { recursive: true });

const client = new Client({ name: "vnem-tools-search-power-test", version: "1.0.1" }, { capabilities: {} });
const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(scriptDir, "vnem-tools-mcp-server.mjs")], cwd: rootDir, env: { ...process.env, VNEM_TOOLS_ALLOWED_ROOTS: workspace, VNEM_TOOLS_PERMISSION_PROFILE: "safe-local-dev", VNEM_TOOLS_EVIDENCE_ROOT: path.join(workspace, ".vnem", "tool-runs") }, stderr: "pipe" });
let stderr = "";
transport.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });

try {
  await client.connect(transport);
  const toolNames = new Set((await client.listTools()).tools.map((tool) => tool.name));
  for (const name of ["vnem_tools_search_provider_manifest", "vnem_tools_search_query_builder", "vnem_tools_web_search", "vnem_tools_search_result_ranker", "vnem_tools_claim_source_matrix", "vnem_tools_research_gap_detector"]) assert.equal(toolNames.has(name), true, `missing ${name}`);

  const manifestCall = await client.callTool({ name: "vnem_tools_search_provider_manifest", arguments: {} });
  assert.equal(manifestCall.isError, undefined);
  const manifest = manifestCall.structuredContent?.search_provider_manifest;
  assert.ok(manifest.providers.some((p) => p.name === "local_fixture" && p.configured === true));
  assert.ok(manifest.providers.some((p) => p.name === "brave_search_api" && p.requires_api_key === true));
  assert.ok(manifest.configured_providers.includes("local_fixture"));
  assert.ok(manifest.unconfigured_providers.includes("brave_search_api"));
  assert.equal(JSON.stringify(manifest).includes(process.env.BRAVE_SEARCH_API_KEY || "__not_set__"), false, "manifest must not leak key values");
  assert.ok(manifest.unsupported_behaviors.some((item) => /CAPTCHA|scrap/i.test(item)));

  const queryCall = await client.callTool({ name: "vnem_tools_search_query_builder", arguments: { task: "Find current official docs and security notes for a JavaScript browser MCP tool", domain_hint: "software docs security", freshness_required: true, source_types_needed: ["official_docs", "security_advisory", "github_repo"], known_context: "avoid SEO farms" } });
  assert.equal(queryCall.isError, undefined);
  const queryPlan = queryCall.structuredContent?.search_query_builder;
  assert.ok(queryPlan.queries.length >= 4);
  assert.ok(queryPlan.queries.some((q) => /official|docs|site:/i.test(q)));
  assert.ok(queryPlan.queries.some((q) => /security|CVE|advisory/i.test(q)));
  assert.equal(queryPlan.freshness_requirement.required, true);
  assert.ok(queryPlan.must_have_source_types.includes("official_docs"));
  assert.ok(queryPlan.avoid_source_types.some((item) => /SEO|spam|fake/i.test(item)));
  assert.ok(queryPlan.must_not_claim.some((item) => /search happened/i.test(item)));

  const dryRun = await client.callTool({ name: "vnem_tools_web_search", arguments: { provider: "brave_search_api", query: "VNEM browser MCP", dry_run: true } });
  const dry = dryRun.structuredContent?.web_search;
  assert.equal(dry.executed, false);
  assert.equal(dry.dry_run, true);
  assert.match(dry.provider_status, /dry_run|unconfigured|planned/i);
  assert.ok(dry.must_not_claim.some((item) => /results were fetched|search happened/i.test(item)));

  const unavailable = await client.callTool({ name: "vnem_tools_web_search", arguments: { provider: "brave_search_api", query: "VNEM browser MCP", dry_run: false, approved: true, approval_note: "test approved but provider missing" } });
  const missing = unavailable.structuredContent?.web_search;
  assert.equal(missing.executed, false);
  assert.match(missing.provider_status, /unconfigured|unavailable/i);
  assert.ok(missing.blocked_or_unavailable_reason);

  const fixtureSearch = await client.callTool({ name: "vnem_tools_web_search", arguments: { provider: "local_fixture", query: "official docs browser MCP security", dry_run: false, approved: true, approval_note: "fixture provider is deterministic local test data", max_results: 5 } });
  const fixture = fixtureSearch.structuredContent?.web_search;
  assert.equal(fixture.executed, true);
  assert.equal(fixture.provider, "local_fixture");
  assert.ok(fixture.results.some((result) => /official/i.test(result.source_type)));
  assert.ok(fixture.evidence_log_id);
  assert.ok(fixture.safe_to_claim.some((item) => /local fixture/i.test(item)));

  const rankCall = await client.callTool({ name: "vnem_tools_search_result_ranker", arguments: { task: "Choose trusted sources for browser MCP security", freshness_required: true, preferred_source_types: ["official_docs", "security_advisory"], results: [
    { title: "Official Browser MCP Security Docs", url: "https://docs.example.com/browser-mcp/security", snippet: "Updated 2026 official security docs", source_type: "official_docs", date: "2026-06-01" },
    { title: "Download NOW free browser MCP installer!!!", url: "https://free-download-example.xyz/setup.exe", snippet: "fast download cracked installer", source_type: "download" },
    { title: "Forum discussion", url: "https://reddit.com/r/mcp/comments/abc", snippet: "community experience with browser tools", source_type: "community" },
    { title: "Official Browser MCP Security Docs copy", url: "https://docs.example.com/browser-mcp/security?utm=copy", snippet: "Updated 2026 official security docs", source_type: "official_docs", date: "2026-06-01" }
  ] } });
  const ranked = rankCall.structuredContent?.search_result_ranker;
  assert.match(ranked.ranked_results[0].title, /Official/);
  assert.ok(ranked.best_sources.some((item) => /Official/.test(item.title)));
  assert.ok(ranked.risky_sources.some((item) => /Download NOW/.test(item.title)));
  assert.ok(ranked.duplicate_clusters.length >= 1);
  assert.ok(ranked.recommended_next_queries.length > 0);
  assert.ok(ranked.evidence_log_id);

  const matrixCall = await client.callTool({ name: "vnem_tools_claim_source_matrix", arguments: { claims: ["Tool Alpha supports safe search", "Tool Beta bypasses CAPTCHA", "Tool Gamma requires Node 22"], sources: [
    { id: "docs", title: "Official Docs", source_quality_score: 95, text_excerpt: "Tool Alpha supports safe search. Tool Gamma requires Node 22." },
    { id: "blog", title: "Scam Blog", source_quality_score: 25, text_excerpt: "Tool Beta bypasses CAPTCHA automatically for everyone." },
    { id: "policy", title: "Public Policy", source_quality_score: 90, text_excerpt: "No automatic CAPTCHA bypass is provided." }
  ] } });
  const matrix = matrixCall.structuredContent?.claim_source_matrix;
  assert.ok(matrix.supported_claims.some((item) => /Alpha/.test(item.claim)));
  assert.ok(matrix.unsupported_claims.some((item) => /Beta/.test(item.claim)) || matrix.conflicting_claims.some((item) => /Beta/.test(item.claim)));
  assert.ok(matrix.citation_plan.length > 0);
  assert.ok(matrix.must_not_claim.some((item) => /unsupported|all claims/i.test(item)));

  const gapCall = await client.callTool({ name: "vnem_tools_research_gap_detector", arguments: { task: "Recommend the current best browser MCP for security testing", sources: [{ title: "Old Blog", source_type: "blog", text_excerpt: "A 2023 opinion post." }], claims: ["This is current best"], freshness_required: true, domain: "security" } });
  const gaps = gapCall.structuredContent?.research_gap_detector;
  assert.equal(gaps.missing_current_search, true);
  assert.ok(gaps.missing_primary_sources.length > 0);
  assert.ok(gaps.confidence_blockers.some((item) => /current|primary|security/i.test(item)));
  assert.ok(gaps.recommended_next_tools.includes("vnem_tools_web_search"));
  assert.ok(gaps.must_not_claim.some((item) => /confident|current/i.test(item)));
  assert.ok(gaps.evidence_log_id);

  console.log("vnem Tools search power tests passed");
} finally {
  await client.close().catch(() => {});
  await rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
  if (stderr.trim()) process.stderr.write(stderr);
}
