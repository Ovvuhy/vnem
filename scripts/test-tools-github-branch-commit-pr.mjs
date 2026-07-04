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

await withTools({ VNEM_TOOLS_GITHUB_PROFILE: "maintainer", VNEM_TOOLS_GITHUB_ALLOWED_REPOS: "fixture/local" }, async (client, workspace) => {
  const repo = path.join(workspace, "repo");
  await initRepo(repo);
  const direct = await client.callTool({ name: "vnem_tools_github_commit_push", arguments: { root: repo, files: ["README.md"], message: "docs: blocked", branch: "main", dry_run: true } });
  assert.equal(direct.structuredContent.github_commit_push.operation_result, "blocked");
  assert.equal(direct.structuredContent.github_commit_push.config_knob_to_change, "VNEM_TOOLS_GITHUB_ALLOW_DIRECT_PUSH");
  const force = await client.callTool({ name: "vnem_tools_github_commit_push", arguments: { root: repo, files: ["README.md"], message: "docs: blocked", branch: "feat/demo", force: true, dry_run: true } });
  assert.equal(force.structuredContent.github_commit_push.config_knob_to_change, "VNEM_TOOLS_GITHUB_ALLOW_FORCE_PUSH");
  const secret = await client.callTool({ name: "vnem_tools_github_commit_push", arguments: { root: repo, files: [".env"], message: "bad", branch: "feat/demo", dry_run: true } });
  assert.equal(secret.structuredContent.github_commit_push.operation_result, "blocked");
  assert.match(secret.structuredContent.github_commit_push.blocked_reason, /secret|\.env/i);
  const branch = await client.callTool({ name: "vnem_tools_github_branch_create", arguments: { root: repo, branch: "feat/demo", dry_run: false } });
  assert.equal(branch.structuredContent.github_branch_create.operation_result, "created");
  const pr = await client.callTool({ name: "vnem_tools_github_pr_create", arguments: { root: repo, title: "feat: demo", body: "## Summary\n- Demo", base: "main", head: "feat/demo", draft: true, dry_run: true } });
  assert.equal(pr.structuredContent.github_pr_create.operation_result, "planned");
  assert.ok(pr.structuredContent.github_pr_create.next_best_action);
});
console.log("vnem Tools GitHub branch/commit/PR tests passed");
