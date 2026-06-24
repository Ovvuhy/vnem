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
const tmpRoot = await mkdtemp(path.join(rootDir, ".tmp", "tools-browser-research-"));
const workspace = path.join(tmpRoot, "workspace");
await mkdir(workspace, { recursive: true });

const client = new Client({ name: "vnem-tools-browser-research-pack-test", version: "1.0.1" }, { capabilities: {} });
const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(scriptDir, "vnem-tools-mcp-server.mjs")], cwd: rootDir, env: { ...process.env, VNEM_TOOLS_ALLOWED_ROOTS: workspace, VNEM_TOOLS_EVIDENCE_ROOT: path.join(workspace, ".vnem", "tool-runs") }, stderr: "pipe" });
let stderr = "";
transport.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });

try {
  await client.connect(transport);
  const toolNames = new Set((await client.listTools()).tools.map((tool) => tool.name));
  assert.equal(toolNames.has("vnem_tools_browser_research_pack"), true);

  const packCall = await client.callTool({
    name: "vnem_tools_browser_research_pack",
    arguments: {
      task: "Check claims about VNEM browser tools",
      claims_to_check: ["Feature Alpha is stable", "Feature Beta is deprecated", "Feature Gamma requires login"],
      sources: [
        { url: "https://docs.example.test/alpha", title: "Official Alpha Docs", source_type: "official_docs", source_quality_score: 92, text_excerpt: "Feature Alpha is stable. Feature Beta is deprecated in version 2.", fetched: true },
        { url: "https://blog.example.test/beta", title: "Old Blog", source_quality_score: 35, text_excerpt: "Feature Beta is not deprecated and still experimental.", fetched: true },
        { title: "Metadata Only Source", url: "https://example.test/meta" }
      ]
    }
  });
  assert.equal(packCall.isError, undefined);
  const pack = packCall.structuredContent?.browser_research_pack;
  assert.equal(pack.task, "Check claims about VNEM browser tools");
  assert.equal(pack.source_summaries.length, 3);
  assert.ok(pack.supported_claims.some((item) => /Feature Alpha/.test(item.claim)));
  assert.ok(pack.supported_claims.some((item) => /Feature Beta/.test(item.claim)));
  assert.ok(pack.unsupported_claims.some((item) => /Feature Gamma/.test(item.claim)));
  assert.ok(pack.conflicting_claims.some((item) => /Feature Beta/.test(item.claim)));
  assert.ok(pack.best_sources.some((item) => /Official Alpha Docs/.test(item.title)));
  assert.ok(pack.weak_sources.some((item) => /Old Blog|Metadata Only/.test(item.title)));
  assert.ok(pack.missing_evidence.some((item) => /metadata-only|not supported|provided/i.test(item)));
  assert.ok(pack.recommended_next_sources.some((item) => /external current search|required|official/i.test(item)));
  assert.ok(pack.citation_plan.length > 0);
  assert.ok(pack.safe_to_claim.some((item) => /provided/i.test(item)));
  assert.ok(pack.must_not_claim.some((item) => /web search|source was read/i.test(item)));
  assert.ok(pack.evidence_log_id);

  console.log("vnem Tools browser research pack tests passed");
} finally {
  await client.close().catch(() => {});
  await rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
  if (stderr.trim()) process.stderr.write(stderr);
}
