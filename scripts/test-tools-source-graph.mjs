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
const tmpRoot = await mkdtemp(path.join(rootDir, ".tmp", "tools-source-graph-"));
const workspace = path.join(tmpRoot, "workspace");
await mkdir(workspace, { recursive: true });

const client = new Client({ name: "vnem-tools-source-graph-test", version: "1.0.1" }, { capabilities: {} });
const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(scriptDir, "vnem-tools-mcp-server.mjs")], cwd: rootDir, env: { ...process.env, VNEM_TOOLS_ALLOWED_ROOTS: workspace, VNEM_TOOLS_PERMISSION_PROFILE: "safe-readonly", VNEM_TOOLS_EVIDENCE_ROOT: path.join(workspace, ".vnem", "tool-runs") }, stderr: "pipe" });
let stderr = "";
transport.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });

try {
  await client.connect(transport);
  const toolNames = new Set((await client.listTools()).tools.map((tool) => tool.name));
  assert.equal(toolNames.has("vnem_tools_source_graph"), true, "missing source graph tool");

  const graphCall = await client.callTool({ name: "vnem_tools_source_graph", arguments: {
    task: "Verify current install steps and version support",
    claims: ["Install with npm install example", "Install with yarn add example", "Version 2 is current"],
    sources: [
      { title: "Official Docs", url: "https://example.test/docs", source_type: "official_docs", owner_or_author: "Example Maintainers", official: true, published_at: "2026-02-01", text_excerpt: "Install with npm install example. Version 2 is current." },
      { title: "Old Community Blog", url: "https://blog.example.test/old", source_type: "community_blog", official: false, published_at: "2021-04-01", text_excerpt: "Install with yarn add example. Version 1 is current." },
      { title: "Release Notes", url: "https://example.test/releases", source_type: "release_notes", official: true, published_at: "2026-03-01", text_excerpt: "Version 2 is current and yarn instructions were removed." }
    ]
  } });
  const graph = graphCall.structuredContent?.source_graph;
  assert.equal(graph.permission_profile, "safe-readonly");
  assert.equal(graph.trust_boundary_level, "0_public_information");
  assert.equal(graph.sources.length, 3);
  assert.ok(graph.sources.some((source) => source.official === true && source.trust_level === "high"));
  assert.ok(graph.sources.some((source) => source.official === false && /outdated|old|unknown/.test(source.freshness)));
  assert.ok(graph.contradictions_found.some((item) => item.type === "conflicting_install_steps"));
  assert.ok(graph.contradictions_found.some((item) => item.type === "old_docs_vs_new_docs" || item.type === "official_vs_community_conflict"));
  assert.ok(graph.claim_verification.some((item) => /npm install/.test(item.claim) && /proven|well_supported/.test(item.status)));
  assert.ok(graph.claim_verification.some((item) => /yarn add/.test(item.claim) && /contradicted|weakly_supported/.test(item.status)));
  assert.ok(graph.freshness_summary.outdated_risk_count >= 1);
  assert.ok(graph.sources.some((source) => source.links_to_stronger_evidence.length >= 0));
  assert.ok(graph.evidence_log_id);
  assert.ok(graph.safe_to_claim.some((item) => /provided sources/i.test(item)));
  assert.ok(graph.must_not_claim.some((item) => /contradiction-free|one source|broad search/i.test(item)));

  console.log("vnem Tools source graph tests passed");
} finally {
  await client.close().catch(() => {});
  await rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
  if (stderr.trim()) process.stderr.write(stderr);
}
