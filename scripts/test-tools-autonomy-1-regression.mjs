import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
const execFile = promisify(execFileCb);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
async function withTools(env, fn) {
  await mkdir(path.join(rootDir, ".tmp"), { recursive: true });
  const tmpRoot = await mkdtemp(path.join(rootDir, ".tmp", "autonomy1-"));
  const workspace = path.join(tmpRoot, "workspace");
  await mkdir(workspace, { recursive: true });
  const client = new Client({ name: "autonomy-test", version: "1.0.1" }, { capabilities: {} });
  const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(scriptDir, "vnem-tools-mcp-server.mjs")], cwd: rootDir, env: { ...process.env, VNEM_TOOLS_ALLOWED_ROOTS: workspace, VNEM_TOOLS_EVIDENCE_ROOT: path.join(workspace, ".vnem", "tool-runs"), ...env }, stderr: "pipe" });
  let stderr = "";
  transport.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });
  try { await client.connect(transport); return await fn(client, workspace, tmpRoot); }
  finally { await client.close().catch(() => {}); await rm(tmpRoot, { recursive: true, force: true }).catch(() => {}); if (stderr.trim()) process.stderr.write(stderr); }
}
async function initRepo(repo) {
  await mkdir(repo, { recursive: true });
  await execFile("git", ["init"], { cwd: repo });
  await execFile("git", ["config", "user.email", "vnem-test@example.local"], { cwd: repo });
  await execFile("git", ["config", "user.name", "VNEM Test"], { cwd: repo });
  await writeFile(path.join(repo, "package.json"), JSON.stringify({ scripts: { test: "node --check index.js", build: "node --check index.js" }, dependencies: { zod: "latest" } }, null, 2));
  await writeFile(path.join(repo, "index.js"), "console.log('ok');\n");
  await writeFile(path.join(repo, "README.md"), "# Fixture\n");
  await execFile("git", ["add", "package.json", "index.js", "README.md"], { cwd: repo });
  await execFile("git", ["commit", "-m", "initial"], { cwd: repo });
  await execFile("git", ["branch", "-M", "main"], { cwd: repo });
}

await withTools({ VNEM_TOOLS_GITHUB_PROFILE: "maintainer" }, async (client, workspace) => {
  const catalog = await client.callTool({ name: "vnem_tools_reliability_catalog", arguments: { capability_group: "github_autonomy" } });
  assert.ok(catalog.structuredContent.reliability_catalog.tools.some((t) => t.name === "vnem_tools_github_commit_push"));
  const gaps = await client.callTool({ name: "vnem_tools_capability_gap_report", arguments: {} });
  const caps = gaps.structuredContent.capability_gap_report.missing_or_limited_capabilities.map((g) => g.capability).join(" ");
  assert.doesNotMatch(caps, /GitHub mutation$/);
  assert.match(caps, /GitHub destructive admin operations/);
  const permission = await client.callTool({ name: "vnem_tools_permission_status", arguments: {} });
  assert.ok(permission.structuredContent.permission_status.github_autonomy_summary);
  assert.equal(permission.structuredContent.permission_status.github_autonomy_summary.active_github_profile, "maintainer");
  const status = await client.callTool({ name: "vnem_tools_github_status", arguments: { root: workspace } });
  assert.equal(status.structuredContent.github_status.config_switches.allow_force_push, false);
  assert.equal(status.structuredContent.github_status.config_switches.allow_repo_delete, false);
});
await withTools({ VNEM_TOOLS_GITHUB_PROFILE: "maintainer" }, async (client, workspace) => {
  const repo = path.join(workspace, "repo");
  await initRepo(repo);
  await writeFile(path.join(repo, ".env.local"), "TOKEN=secret\n");
  const blocked = await client.callTool({ name: "vnem_tools_github_commit_push", arguments: { root: repo, files: [".env.local"], message: "bad", branch: "feat/x", dry_run: true } });
  assert.equal(blocked.structuredContent.github_commit_push.operation_result, "blocked");
});
console.log("vnem Tools AUTONOMY-1 regression tests passed");
