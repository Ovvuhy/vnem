#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
await mkdir(path.join(rootDir, ".tmp"), { recursive: true });
const tmpRoot = await mkdtemp(path.join(rootDir, ".tmp", "tools-browser-intel-"));
const workspace = path.join(tmpRoot, "workspace");
await mkdir(path.join(workspace, "public"), { recursive: true });
const html = `<!doctype html>
<html lang="en"><head><title>VNEM Demo Page</title><meta name="description" content="A safe VNEM browser intelligence fixture."></head>
<body><header><nav><a href="/docs">Docs</a><a href="#main">Jump</a><a href="mailto:team@example.com">Email us</a><a href="https://example.org/external">External source</a><a href="/files/report.pdf">Report PDF</a></nav></header>
<main id="main"><h1>VNEM Browser Intelligence</h1><h2>Readable Section</h2><p>Main content says Feature Alpha is stable and source-backed.</p><ul><li>First item</li></ul><table><tr><td>Data</td></tr></table><pre><code>const alpha = true;</code></pre>
<img src="missing-alt.png"><img src="with-alt.png" alt="Diagram with alt text"><form><input name="email"><button>Subscribe</button></form><a href="https://user:pass@example.com/private">Bad link</a></main><script>console.log('ignored')</script></body></html>`;
const changedHtml = html.replace("VNEM Browser Intelligence", "VNEM Browser Intelligence Updated").replace("/docs", "/guide").replace("Feature Alpha is stable", "Feature Alpha is stable and documented");
await writeFile(path.join(workspace, "public", "page.html"), html, "utf8");
await writeFile(path.join(workspace, "public", "page-after.html"), changedHtml, "utf8");
await writeFile(path.join(workspace, "secret-token.html"), "<title>secret</title> TOKEN=super-secret-token", "utf8");

const client = new Client({ name: "vnem-tools-browser-intelligence-test", version: "1.0.1" }, { capabilities: {} });
const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(scriptDir, "vnem-tools-mcp-server.mjs")], cwd: rootDir, env: { ...process.env, VNEM_TOOLS_ALLOWED_ROOTS: workspace, VNEM_TOOLS_EVIDENCE_ROOT: path.join(workspace, ".vnem", "tool-runs") }, stderr: "pipe" });
let stderr = "";
transport.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });

try {
  await client.connect(transport);
  const toolNames = new Set((await client.listTools()).tools.map((tool) => tool.name));
  for (const name of ["vnem_tools_browser_page_inspect", "vnem_tools_browser_readability_extract", "vnem_tools_browser_link_map", "vnem_tools_browser_dom_search", "vnem_tools_browser_accessibility_audit", "vnem_tools_browser_compare_snapshots"]) assert.equal(toolNames.has(name), true, `missing ${name}`);

  const inspect = await client.callTool({ name: "vnem_tools_browser_page_inspect", arguments: { file_path: "public/page.html" } });
  assert.equal(inspect.isError, undefined);
  const page = inspect.structuredContent?.browser_page_inspect;
  assert.equal(page.source_type, "file");
  assert.equal(page.title, "VNEM Demo Page");
  assert.match(page.meta_description, /safe VNEM/);
  assert.ok(page.headings.some((h) => h.text === "VNEM Browser Intelligence"));
  assert.match(page.main_text_excerpt, /Feature Alpha is stable/);
  assert.equal(page.links_count, 6);
  assert.equal(page.images_count, 2);
  assert.equal(page.forms_count, 1);
  assert.equal(page.buttons_count, 1);
  assert.equal(page.scripts_count, 1);
  assert.ok(page.structured_sections.length >= 2);
  assert.ok(page.safe_to_claim.some((item) => /inspected/i.test(item)));
  assert.ok(page.must_not_claim.some((item) => /visual|web search/i.test(item)));
  assert.ok(page.evidence_log_id);

  const readable = await client.callTool({ name: "vnem_tools_browser_readability_extract", arguments: { html } });
  assert.equal(readable.isError, undefined);
  const readability = readable.structuredContent?.browser_readability_extract;
  assert.match(readability.readable_text_excerpt, /Main content says Feature Alpha/);
  assert.equal(readability.code_blocks_count, 1);
  assert.equal(readability.lists_count, 1);
  assert.equal(readability.tables_count, 1);
  assert.ok(readability.content_quality_flags.some((item) => /heuristic/i.test(item)));

  const linkMap = await client.callTool({ name: "vnem_tools_browser_link_map", arguments: { file_path: "public/page.html", base_url: "https://example.com/root/page" } });
  assert.equal(linkMap.isError, undefined);
  const links = linkMap.structuredContent?.browser_link_map;
  assert.ok(links.internal_links.some((item) => item.href === "/docs"));
  assert.ok(links.external_links.some((item) => /example.org/.test(item.href)));
  assert.ok(links.anchor_links.some((item) => item.href === "#main"));
  assert.ok(links.mailto_links.some((item) => /mailto:/.test(item.href)));
  assert.ok(links.download_like_links.some((item) => /report\.pdf/.test(item.href)));
  assert.ok(links.blocked_or_suspicious_links.some((item) => /credentialed/.test(item.reason)));
  assert.ok(links.recommended_followup_urls.length > 0);
  assert.ok(links.must_not_claim.some((item) => /followed|crawl/i.test(item)));

  const headingSearch = await client.callTool({ name: "vnem_tools_browser_dom_search", arguments: { file_path: "public/page.html", mode: "heading", query: "Readable" } });
  assert.equal(headingSearch.isError, undefined);
  assert.equal(headingSearch.structuredContent?.browser_dom_search?.match_count, 1);
  const buttonSearch = await client.callTool({ name: "vnem_tools_browser_dom_search", arguments: { html, mode: "button", query: "Subscribe" } });
  assert.equal(buttonSearch.structuredContent?.browser_dom_search?.match_count, 1);
  const formSearch = await client.callTool({ name: "vnem_tools_browser_dom_search", arguments: { html, mode: "form", query: "email" } });
  assert.equal(formSearch.structuredContent?.browser_dom_search?.match_count, 1);
  const textSearch = await client.callTool({ name: "vnem_tools_browser_dom_search", arguments: { html, mode: "text", query: "Feature Alpha" } });
  assert.ok(textSearch.structuredContent?.browser_dom_search?.match_count >= 1);

  const audit = await client.callTool({ name: "vnem_tools_browser_accessibility_audit", arguments: { file_path: "public/page.html" } });
  assert.equal(audit.isError, undefined);
  const a11y = audit.structuredContent?.browser_accessibility_audit;
  assert.ok(a11y.issues.some((item) => /missing alt/i.test(item.message)));
  assert.ok(a11y.issues.some((item) => /label/i.test(item.message)));
  assert.ok(a11y.passes.some((item) => /title/i.test(item)));
  assert.ok(a11y.must_not_claim.some((item) => /certification|full accessibility/i.test(item)));

  const compare = await client.callTool({ name: "vnem_tools_browser_compare_snapshots", arguments: { before: { file_path: "public/page.html" }, after: { file_path: "public/page-after.html" } } });
  assert.equal(compare.isError, undefined);
  const diff = compare.structuredContent?.browser_compare_snapshots;
  assert.equal(diff.changed_title, false);
  assert.ok(diff.changed_headings.added.some((item) => /Updated/.test(item)));
  assert.ok(diff.added_links.some((item) => item.href === "/guide"));
  assert.ok(diff.removed_links.some((item) => item.href === "/docs"));
  assert.match(diff.summary, /changed/i);

  const secretBlocked = await client.callTool({ name: "vnem_tools_browser_page_inspect", arguments: { file_path: "secret-token.html" } });
  assert.equal(secretBlocked.isError, true);
  assert.equal(secretBlocked.structuredContent?.code, "secret_path_blocked");
  const externalDry = await client.callTool({ name: "vnem_tools_browser_page_inspect", arguments: { url: "https://example.com/docs" } });
  assert.equal(externalDry.isError, undefined);
  assert.equal(externalDry.structuredContent?.browser_page_inspect?.dry_run, true);
  assert.equal(externalDry.structuredContent?.browser_page_inspect?.executed, false);
  const searchBlocked = await client.callTool({ name: "vnem_tools_browser_link_map", arguments: { url: "https://www.google.com/search?q=vnem", dry_run: false, approved: true, approval_note: "test" } });
  assert.equal(searchBlocked.isError, true);
  assert.equal(searchBlocked.structuredContent?.code, "search_engine_scraping_blocked");

  console.log("vnem Tools browser intelligence tests passed");
} finally {
  await client.close().catch(() => {});
  await rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
  if (stderr.trim()) process.stderr.write(stderr);
}
