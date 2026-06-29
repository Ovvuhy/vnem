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
const tmpRoot = await mkdtemp(path.join(rootDir, ".tmp", "tools-source-ingestion-"));
const workspace = path.join(tmpRoot, "workspace");
await mkdir(path.join(workspace, "docs"), { recursive: true });
await mkdir(path.join(workspace, "src"), { recursive: true });
await mkdir(path.join(workspace, "tests"), { recursive: true });
await mkdir(path.join(workspace, "node_modules", "ignored"), { recursive: true });
await writeFile(path.join(workspace, "README.md"), "# Example Repo\n\nInstall with npm install example. API token sk-test-1234567890 should not appear.\n", "utf8");
await writeFile(path.join(workspace, "docs", "guide.md"), "# Guide\n\nVersion 2.0 setup uses npm create example.\n", "utf8");
await writeFile(path.join(workspace, "src", "index.js"), "export function run() { return 'ok'; }\n", "utf8");
await writeFile(path.join(workspace, "tests", "index.test.js"), "import { run } from '../src/index.js';\n", "utf8");
await writeFile(path.join(workspace, "CHANGELOG.md"), "# Changelog\n\n## 2.0.0 - 2026-01-15\nBreaking setup change.\n", "utf8");
await writeFile(path.join(workspace, ".env"), "SECRET_TOKEN=should-not-read\n", "utf8");
await writeFile(path.join(workspace, "sessions.db"), "cookie session content", "utf8");

const client = new Client({ name: "vnem-tools-source-ingestion-test", version: "1.0.1" }, { capabilities: {} });
const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(scriptDir, "vnem-tools-mcp-server.mjs")], cwd: rootDir, env: { ...process.env, VNEM_TOOLS_ALLOWED_ROOTS: workspace, VNEM_TOOLS_PERMISSION_PROFILE: "safe-readonly", VNEM_TOOLS_EVIDENCE_ROOT: path.join(workspace, ".vnem", "tool-runs") }, stderr: "pipe" });
let stderr = "";
transport.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });

try {
  await client.connect(transport);
  const toolNames = new Set((await client.listTools()).tools.map((tool) => tool.name));
  assert.equal(toolNames.has("vnem_tools_source_map"), true, "missing source map tool");
  assert.equal(toolNames.has("vnem_tools_source_extract"), true, "missing source extract tool");

  const mapCall = await client.callTool({ name: "vnem_tools_source_map", arguments: { source: workspace, source_type: "local_repo", max_files: 80 } });
  const map = mapCall.structuredContent?.source_map;
  assert.equal(map.source_type, "local_repo");
  assert.equal(map.permission_profile, "safe-readonly");
  assert.equal(map.allowed_roots_check.inside_allowed_roots, true);
  assert.equal(map.trust_boundary, "2_local_project_information");
  assert.ok(map.top_level_structure.some((item) => item.path === "README.md"));
  assert.ok(map.docs_locations.some((item) => /docs\/guide\.md/.test(item)));
  assert.ok(map.code_locations.some((item) => /src\/index\.js/.test(item)));
  assert.ok(map.test_or_example_locations.some((item) => /tests\/index\.test\.js/.test(item)));
  assert.ok(map.changelog_or_release_locations.some((item) => /CHANGELOG\.md/.test(item)));
  assert.ok(map.missing_or_blocked_areas.some((item) => /\.env|sessions\.db|secret/i.test(item)));
  assert.ok(!JSON.stringify(map).includes("should-not-read"));
  assert.ok(map.evidence_log_id);
  assert.ok(map.safe_to_claim.some((item) => /mapped/i.test(item)));
  assert.ok(map.must_not_claim.some((item) => /secret|crawl|full understanding/i.test(item)));

  const extractCall = await client.callTool({ name: "vnem_tools_source_extract", arguments: { extraction_goal: "bounded setup evidence", source_root: workspace, targets: ["README.md", "docs/guide.md", ".env", "sessions.db"], max_bytes_per_target: 800 } });
  const extract = extractCall.structuredContent?.source_extract;
  assert.equal(extract.extraction_goal, "bounded setup evidence");
  assert.equal(extract.permission_profile, "safe-readonly");
  assert.deepEqual(extract.targets_read.map((item) => item.path).sort(), ["README.md", "docs/guide.md"].sort());
  assert.ok(extract.targets_skipped.some((item) => item.path === ".env" && /secret|blocked/i.test(item.reason)));
  assert.ok(extract.targets_skipped.some((item) => item.path === "sessions.db" && /secret|blocked/i.test(item.reason)));
  assert.ok(extract.evidence_items.some((item) => item.path === "README.md"));
  assert.ok(extract.claim_candidates.some((item) => /Install|Version|setup/i.test(item.claim)));
  assert.ok(extract.dates_or_versions_found.some((item) => /2\.0|2026/.test(item.value)));
  assert.ok(!JSON.stringify(extract).includes("sk-test-1234567890"));
  assert.ok(JSON.stringify(extract).includes("[REDACTED]"));
  assert.ok(extract.freshness_notes.length > 0);
  assert.ok(extract.gaps.some((item) => /bounded|selected/i.test(item)));
  assert.ok(extract.evidence_log_id);
  assert.ok(extract.safe_to_claim.some((item) => /explicit/i.test(item)));

  console.log("vnem Tools source ingestion tests passed");
} finally {
  await client.close().catch(() => {});
  await rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
  if (stderr.trim()) process.stderr.write(stderr);
}
