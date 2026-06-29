#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const client = new Client({ name: "vnem-research-evidence-audit-test", version: "1.0.1" }, { capabilities: {} });
const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(scriptDir, "vnem-mcp-server.mjs")], cwd: rootDir, env: { ...process.env, VNEM_ROOT: rootDir }, stderr: "pipe" });
let stderr = "";
transport.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });

try {
  await client.connect(transport);
  const toolNames = new Set((await client.listTools()).tools.map((tool) => tool.name));
  assert.equal(toolNames.has("vnem_research_evidence_audit"), true, "missing research evidence audit tool");

  const current = await client.callTool({ name: "vnem_research_evidence_audit", arguments: { task: "Answer with latest current package setup", conclusion: "The latest version supports this today.", evidence_items: [] } });
  const currentAudit = current.structuredContent?.research_evidence_audit;
  assert.match(currentAudit.classification, /unknown|blocked|weakly_supported/);
  assert.ok(currentAudit.rejections.some((item) => /current source/i.test(item)));
  assert.ok(currentAudit.must_not_claim.some((item) => /current-info claim/i.test(item)));

  const official = await client.callTool({ name: "vnem_research_evidence_audit", arguments: { task: "Official docs confirm this API behavior", conclusion: "Official docs confirm the API option.", evidence_items: [{ title: "Community blog", source_type: "blog", text_excerpt: "This option might work", freshness: "unknown" }] } });
  const officialAudit = official.structuredContent?.research_evidence_audit;
  assert.ok(officialAudit.rejections.some((item) => /official docs/i.test(item)));
  assert.notEqual(officialAudit.classification, "proven");

  const repo = await client.callTool({ name: "vnem_research_evidence_audit", arguments: { task: "Explain repo architecture", conclusion: "The repo is fully understood.", evidence_items: [{ title: "README", source_type: "readme", text_excerpt: "Quickstart only", source_map_present: false }] } });
  const repoAudit = repo.structuredContent?.research_evidence_audit;
  assert.ok(repoAudit.rejections.some((item) => /repo.*map|source map|files evidence/i.test(item)));

  const contradiction = await client.callTool({ name: "vnem_research_evidence_audit", arguments: { task: "Say there are no contradictions", conclusion: "There are no contradictions.", evidence_items: [{ title: "Official docs", source_type: "official_docs", official: true, text_excerpt: "Install with npm." }] } });
  const contradictionAudit = contradiction.structuredContent?.research_evidence_audit;
  assert.ok(contradictionAudit.rejections.some((item) => /multiple relevant sources|contradiction/i.test(item)));

  console.log("vnem research evidence audit tests passed");
} finally {
  await client.close().catch(() => {});
  if (stderr.trim()) process.stderr.write(stderr);
}
