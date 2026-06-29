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
const tmpRoot = await mkdtemp(path.join(rootDir, ".tmp", "tools-architecture-review-"));
const workspace = path.join(tmpRoot, "workspace");
await mkdir(path.join(workspace, "scripts"), { recursive: true });
await mkdir(path.join(workspace, "src"), { recursive: true });
await mkdir(path.join(workspace, "tests"), { recursive: true });
await writeFile(path.join(workspace, "package.json"), JSON.stringify({ scripts: { test: "node tests/server.test.mjs", build: "node scripts/server.mjs" }, dependencies: { zod: "latest" } }, null, 2), "utf8");
await writeFile(path.join(workspace, "scripts", "server.mjs"), "mcpServer.registerTool('real_tool', { title: 'Real' }, async () => ({}));\nfunction helperUnused() { return 1; }\n", "utf8");
await writeFile(path.join(workspace, "src", "fake-tool.mjs"), "export function vnem_tools_fake_new_tool() { return 'not registered'; }\n", "utf8");
await writeFile(path.join(workspace, "src", "dead.js"), "export function unusedDeadCode() { return 42; }\n", "utf8");
await writeFile(path.join(workspace, "tests", "server.test.mjs"), "assert.ok('real_tool');\n", "utf8");
await writeFile(path.join(workspace, ".env"), "TOKEN=must-not-read\n", "utf8");

const client = new Client({ name: "vnem-tools-architecture-review-test", version: "1.0.1" }, { capabilities: {} });
const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(scriptDir, "vnem-tools-mcp-server.mjs")], cwd: rootDir, env: { ...process.env, VNEM_TOOLS_ALLOWED_ROOTS: workspace, VNEM_TOOLS_PERMISSION_PROFILE: "safe-readonly", VNEM_TOOLS_EVIDENCE_ROOT: path.join(workspace, ".vnem", "tool-runs") }, stderr: "pipe" });
let stderr = "";
transport.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });

try {
  await client.connect(transport);
  const toolNames = new Set((await client.listTools()).tools.map((tool) => tool.name));
  assert.equal(toolNames.has("vnem_tools_architecture_review"), true, "missing architecture review tool");

  const call = await client.callTool({ name: "vnem_tools_architecture_review", arguments: { workspace_root: workspace, max_files: 120 } });
  const review = call.structuredContent?.architecture_review;
  assert.equal(review.permission_profile, "safe-readonly");
  assert.equal(review.allowed_roots_check.inside_allowed_roots, true);
  assert.ok(review.entry_points_found.some((item) => /package\.json|server\.mjs/i.test(item.path || item)));
  assert.ok(review.tool_or_route_registries_found.some((item) => /registerTool|real_tool/i.test(JSON.stringify(item))));
  assert.ok(review.package_scripts_found.some((item) => item.name === "test"));
  assert.ok(review.tests_found.some((item) => /server\.test\.mjs/.test(item.path || item)));
  assert.ok(review.config_files_found.some((item) => /package\.json/.test(item.path || item)));
  assert.ok(review.likely_integration_points.some((item) => /MCP tool registry|package script|test/i.test(item)));
  assert.ok(review.possible_parallel_fake_systems.some((item) => /fake_new_tool|unregistered/i.test(JSON.stringify(item))));
  assert.ok(review.possible_dead_code.some((item) => /unusedDeadCode|helperUnused/i.test(JSON.stringify(item))));
  assert.ok(review.contract_change_risks.some((item) => /schema|registry|package script|contract/i.test(item)));
  assert.ok(review.security_or_secret_risks.some((item) => /\.env|secret/i.test(item)));
  assert.ok(!JSON.stringify(review).includes("must-not-read"));
  assert.ok(review.evidence_log_id);
  assert.ok(review.must_not_claim.some((item) => /fully wired|dead-code-free|secret/i.test(item)));

  console.log("vnem Tools architecture review tests passed");
} finally {
  await client.close().catch(() => {});
  await rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
  if (stderr.trim()) process.stderr.write(stderr);
}
