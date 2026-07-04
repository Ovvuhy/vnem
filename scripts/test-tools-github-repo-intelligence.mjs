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

await withTools({ VNEM_TOOLS_GITHUB_ALLOWED_REPOS: "fixture/local" }, async (client, workspace) => {
  const repo = path.join(workspace, "repo");
  await initRepo(repo);
  await writeFile(path.join(repo, "src-test.js"), "console.log('test');\n");
  const inspect = await client.callTool({ name: "vnem_tools_github_repo_inspect", arguments: { root: repo, simulate_github: true } });
  const r = inspect.structuredContent.github_repo_inspect;
  assert.equal(r.branch, "main");
  assert.ok(r.important_files.includes("package.json"));
  assert.ok(r.detected_build_test_commands.test_commands.length >= 1);
  const intel = await client.callTool({ name: "vnem_tools_repo_intelligence_report", arguments: { root: repo, simulate_github: true } });
  const report = intel.structuredContent.repo_intelligence_report;
  assert.ok(report.likely_build_commands.length >= 1);
  assert.ok(report.likely_test_commands.length >= 1);
  assert.ok(report.risky_paths.includes(".env"));
  assert.ok(report.best_next_actions.length >= 1);
  assert.ok(report.useless_actions_to_avoid.some((x) => /random|blind|force/i.test(x)));
});
console.log("vnem Tools GitHub repo intelligence tests passed");
