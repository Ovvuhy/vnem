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
  const repo = path.join(workspace, "repo");
  await initRepo(repo);
  await writeFile(path.join(repo, "README.md"), "# Fixture\n\nchanged\n");
  const gate = await client.callTool({ name: "vnem_tools_pr_quality_gate", arguments: { root: repo, pr_title: "fix", pr_body: "tiny", test_commands_run: [] } });
  const g = gate.structuredContent.pr_quality_gate;
  assert.equal(g.claim_status, "not_ready");
  assert.ok(g.blocked_reason);
  assert.ok(g.unrelated_churn.length >= 0);
  const truth = await client.callTool({ name: "vnem_tools_task_progress_truth_check", arguments: { goal: "finish feature", changed_files: ["README.md"], tests_run: [], blockers: [], claimed_done: true } });
  const check = truth.structuredContent.task_progress_truth_check;
  assert.notEqual(check.status, "done");
  assert.ok(check.what_not_to_claim.some((x) => /done|complete/i.test(x)));
  const review = await client.callTool({ name: "vnem_tools_high_power_action_review", arguments: { tool_name: "vnem_tools_github_commit_push", operation: "push", target: "main", mutation_type: "github_push", expected_effect: "direct push" } });
  assert.equal(review.structuredContent.high_power_action_review.config_knob_to_change, "VNEM_TOOLS_GITHUB_ALLOW_DIRECT_PUSH");
  assert.ok(review.structuredContent.high_power_action_review.reasons_to_block.length >= 1);
});
console.log("vnem Tools autonomy efficiency tests passed");
