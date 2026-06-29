#!/usr/bin/env node
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
await mkdir(path.join(rootDir, ".tmp"), { recursive: true });
const tmpRoot = await mkdtemp(path.join(rootDir, ".tmp", "tools-research-"));
const workspace = path.join(tmpRoot, "workspace");
await mkdir(workspace, { recursive: true });
await writeFile(path.join(workspace, "safe-source.html"), "<title>Local VNEM Source</title><main>Primary project source says Feature A is stable as of 2026. TOKEN=sample-redact-token</main>", "utf8");

const server = createServer((req, res) => {
  if (req.url === "/source") {
    res.writeHead(200, { "content-type": "text/html" });
    res.end("<html><head><title>Official Local Docs</title></head><body><h1>Official Docs</h1><p>Feature A is supported. Updated 2026.</p><a href='/more'>More</a></body></html>");
  } else {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("missing");
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
const sourceUrl = `http://127.0.0.1:${port}/source`;

const client = new Client({ name: "vnem-tools-research-test", version: "1.0.1" }, { capabilities: {} });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(scriptDir, "vnem-tools-mcp-server.mjs")],
  cwd: rootDir,
  env: { ...process.env, VNEM_TOOLS_ALLOWED_ROOTS: workspace, VNEM_TOOLS_PERMISSION_PROFILE: "safe-local-dev", VNEM_TOOLS_EVIDENCE_ROOT: path.join(workspace, ".vnem", "tool-runs"), VNEM_TOOLS_ALLOW_LOCALHOST: "1" },
  stderr: "pipe"
});
let stderr = "";
transport.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });

try {
  await client.connect(transport);
  const toolNames = new Set((await client.listTools()).tools.map((tool) => tool.name));
  for (const name of ["vnem_tools_fetch_url_text", "vnem_tools_source_quality_check", "vnem_tools_research_brief"]) assert.equal(toolNames.has(name), true, `missing ${name}`);

  const externalDry = await client.callTool({ name: "vnem_tools_fetch_url_text", arguments: { url: "https://example.com/page?q=search" } });
  assert.equal(externalDry.isError, undefined);
  assert.equal(externalDry.structuredContent?.fetch_url_text?.dry_run, true);
  assert.equal(externalDry.structuredContent?.fetch_url_text?.executed, false);
  assert.ok(externalDry.structuredContent?.fetch_url_text?.must_not_claim?.some((item) => /fetched/i.test(item)));

  const searchBlocked = await client.callTool({ name: "vnem_tools_fetch_url_text", arguments: { url: "https://www.google.com/search?q=vnem", dry_run: false, approved: true, approval_note: "test" } });
  assert.equal(searchBlocked.isError, true);
  assert.equal(searchBlocked.structuredContent?.code, "search_engine_scraping_blocked");

  const credentialed = await client.callTool({ name: "vnem_tools_fetch_url_text", arguments: { url: "https://user:pass@example.com/" } });
  assert.equal(credentialed.isError, true);
  assert.equal(credentialed.structuredContent?.code, "credentialed_url_blocked");

  const localFetch = await client.callTool({ name: "vnem_tools_fetch_url_text", arguments: { url: sourceUrl, dry_run: false, approved: true, approval_note: "approve localhost source fetch", max_response_bytes: 5000 } });
  assert.equal(localFetch.isError, undefined);
  const fetched = localFetch.structuredContent?.fetch_url_text;
  assert.equal(fetched.status, 200);
  assert.match(fetched.title_if_found, /Official Local Docs/);
  assert.match(fetched.text_excerpt, /Feature A is supported/);
  assert.equal(fetched.links_count, 1);
  assert.ok(fetched.sha256);
  assert.ok(fetched.safe_to_claim.some((item) => /direct URL/i.test(item)));
  assert.ok(fetched.must_not_claim.some((item) => /search engine/i.test(item)));

  const fileFetch = await client.callTool({ name: "vnem_tools_fetch_url_text", arguments: { url: `file://${path.join(workspace, "safe-source.html").replace(/\\/g, "/")}`, dry_run: false, approved: true, approval_note: "approve local file source" } });
  assert.equal(fileFetch.isError, undefined);
  assert.doesNotMatch(fileFetch.structuredContent?.fetch_url_text?.text_excerpt, /sample-redact-token/);

  const quality = await client.callTool({ name: "vnem_tools_source_quality_check", arguments: { url: sourceUrl, title: fetched.title_if_found, text_excerpt: fetched.text_excerpt, source_type: "official_docs", published_at: "2026-01-10", retrieved_at: "2026-06-23" } });
  assert.equal(quality.isError, undefined);
  const sourceQuality = quality.structuredContent?.source_quality;
  assert.ok(sourceQuality.source_quality_score >= 70);
  assert.ok(sourceQuality.quality_flags.includes("direct_url_provided"));
  assert.ok(sourceQuality.primary_source_likelihood !== "unknown");
  assert.ok(sourceQuality.must_not_claim.some((item) => /verified factual correctness/i.test(item)));

  const brief = await client.callTool({ name: "vnem_tools_research_brief", arguments: { task: "Check whether Feature A is supported", claims_to_check: ["Feature A is supported", "Feature B is deprecated"], sources: [{ url: sourceUrl, title: fetched.title_if_found, text_excerpt: fetched.text_excerpt, source_quality_score: sourceQuality.source_quality_score }] } });
  assert.equal(brief.isError, undefined);
  const researchBrief = brief.structuredContent?.research_brief;
  assert.ok(researchBrief.supported_claims.some((item) => /Feature A/.test(item.claim)));
  assert.ok(researchBrief.unsupported_claims.some((item) => /Feature B/.test(item.claim)));
  assert.ok(researchBrief.must_not_claim.some((item) => /web search/i.test(item)));

  console.log("vnem Tools research tests passed");
} finally {
  await client.close().catch(() => {});
  await new Promise((resolve) => server.close(resolve));
  await rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
  if (stderr.trim()) process.stderr.write(stderr);
}
