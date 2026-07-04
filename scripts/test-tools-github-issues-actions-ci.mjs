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

await withTools({ VNEM_TOOLS_GITHUB_PROFILE: "maintainer", VNEM_TOOLS_GITHUB_ALLOWED_REPOS: "fixture/local", VNEM_TOOLS_GITHUB_ALLOW_ACTIONS_RERUN: "1" }, async (client, workspace) => {
  const repo = path.join(workspace, "repo");
  await initRepo(repo);
  for (const name of ["vnem_tools_github_issue_create", "vnem_tools_github_issue_update", "vnem_tools_github_issue_comment", "vnem_tools_github_labels_manage", "vnem_tools_github_actions_status", "vnem_tools_github_actions_rerun", "vnem_tools_github_ci_failure_triage"]) {
    const manifest = await client.callTool({ name: "vnem_tools_manifest", arguments: {} });
    assert.ok(manifest.structuredContent.manifest.tools.some((t) => t.name === name), `missing ${name}`);
  }
  const issue = await client.callTool({ name: "vnem_tools_github_issue_create", arguments: { root: repo, title: "bug: fixture", body: "details", labels: ["bug"], dry_run: true } });
  assert.equal(issue.structuredContent.github_issue_create.operation_result, "planned");
  const label = await client.callTool({ name: "vnem_tools_github_labels_manage", arguments: { root: repo, name: "bug", color: "d73a4a", dry_run: true } });
  assert.equal(label.structuredContent.github_labels_manage.operation_result, "planned");
  const actions = await client.callTool({ name: "vnem_tools_github_actions_status", arguments: { root: repo, simulate: true } });
  assert.ok(actions.structuredContent.github_actions_status.runs.length >= 1);
  const rerun = await client.callTool({ name: "vnem_tools_github_actions_rerun", arguments: { root: repo, run_id: "123", dry_run: true } });
  assert.equal(rerun.structuredContent.github_actions_rerun.operation_result, "planned");
  const triage = await client.callTool({ name: "vnem_tools_github_ci_failure_triage", arguments: { root: repo, simulated_log: "Run npm test\nError: Cannot find module './src/app.js'\n    at tests/app.test.js:4\nfailed with exit code 1" } });
  const t = triage.structuredContent.ci_failure_triage;
  assert.match(t.likely_cause, /Cannot find module|test/i);
  assert.ok(t.exact_next_commands.length >= 1);
  assert.ok(t.must_not_claim.includes("CI is green."));
});
await withTools({ VNEM_TOOLS_GITHUB_PROFILE: "maintainer", VNEM_TOOLS_GITHUB_ALLOW_ACTIONS_RERUN: "0" }, async (client, workspace) => {
  const rerun = await client.callTool({ name: "vnem_tools_github_actions_rerun", arguments: { root: workspace, run_id: "123", dry_run: true } });
  assert.equal(rerun.structuredContent.github_actions_rerun.operation_result, "blocked");
  assert.equal(rerun.structuredContent.github_actions_rerun.config_knob_to_change, "VNEM_TOOLS_GITHUB_ALLOW_ACTIONS_RERUN");
});
console.log("vnem Tools GitHub issues/actions/CI tests passed");
