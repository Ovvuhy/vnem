#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { spawnSync } from "node:child_process";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
await mkdir(path.join(rootDir, ".tmp"), { recursive: true });
const tmpRoot = await mkdtemp(path.join(rootDir, ".tmp", "tools-git-session-"));
const projectDir = path.join(tmpRoot, "project");
await mkdir(path.join(projectDir, "src"), { recursive: true });
await writeFile(path.join(projectDir, "package.json"), JSON.stringify({ scripts: { test: "node src/test.js" } }, null, 2), "utf8");
await writeFile(path.join(projectDir, "src", "app.js"), "console.log('old');\n", "utf8");
await writeFile(path.join(projectDir, "src", "test.js"), "console.log('ok');\n", "utf8");
await writeFile(path.join(projectDir, ".env"), "TOKEN=example-placeholder\n", "utf8");
spawnSync("git", ["init"], { cwd: projectDir, stdio: "ignore" });
spawnSync("git", ["config", "user.name", "VNEM Test"], { cwd: projectDir, stdio: "ignore" });
spawnSync("git", ["config", "user.email", "vnem-test@example.invalid"], { cwd: projectDir, stdio: "ignore" });
spawnSync("git", ["add", "package.json", "src/app.js", "src/test.js"], { cwd: projectDir, stdio: "ignore" });
spawnSync("git", ["commit", "-m", "initial"], { cwd: projectDir, stdio: "ignore" });

const client = new Client({ name: "vnem-tools-git-session-test", version: "1.0.1" }, { capabilities: {} });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(scriptDir, "vnem-tools-mcp-server.mjs")],
  cwd: rootDir,
  env: {
    ...process.env,
    VNEM_TOOLS_ALLOWED_ROOTS: projectDir,
    VNEM_TOOLS_PERMISSION_PROFILE: "approved-writes",
    VNEM_TOOLS_EVIDENCE_ROOT: path.join(projectDir, ".vnem", "tool-runs"),
    VNEM_TOOLS_BROWSER_COMMAND: "__vnem_missing_browser_for_deterministic_test__"
  },
  stderr: "pipe"
});
let stderr = "";
transport.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });

try {
  await client.connect(transport);
  const toolNames = new Set((await client.listTools()).tools.map((tool) => tool.name));
  for (const name of ["vnem_tools_start_session", "vnem_tools_finish_session", "vnem_tools_git_status", "vnem_tools_git_diff_summary", "vnem_tools_git_commit"]) {
    assert.equal(toolNames.has(name), true, `missing ${name}`);
  }

  const session = await client.callTool({ name: "vnem_tools_start_session", arguments: { task: "Improve local app", actions_planned: ["patch", "test", "browser", "git"] } });
  assert.equal(session.isError, undefined);
  const sessionId = session.structuredContent?.session?.session_id;
  assert.ok(sessionId);

  const patch = await client.callTool({ name: "vnem_tools_apply_patch_batch", arguments: { session_id: sessionId, operations: [{ op: "replace", path: "src/app.js", search: "old", replace: "new" }], dry_run: false, approved: true, approval_note: "approve app patch" } });
  assert.equal(patch.isError, undefined);
  const command = await client.callTool({ name: "vnem_tools_run_project_task", arguments: { session_id: sessionId, task: "test", dry_run: false, approved: true, approval_note: "approve test task" } });
  assert.equal(command.isError, undefined);
  const browser = await client.callTool({ name: "vnem_tools_browser_capture", arguments: { session_id: sessionId, file_path: "src/app.js", dry_run: false, approved: true, approval_note: "approve deterministic browser unavailable" } });
  assert.equal(browser.isError, undefined);
  const blocked = await client.callTool({ name: "vnem_tools_run_project_task", arguments: { session_id: sessionId, task: "custom_script", script: "deploy" } });
  assert.equal(blocked.isError, true);

  const status = await client.callTool({ name: "vnem_tools_git_status", arguments: { root: "." } });
  assert.equal(status.isError, undefined);
  assert.ok(status.structuredContent?.git_status?.changed_files?.some((item) => item.path === "src/app.js"));
  const diff = await client.callTool({ name: "vnem_tools_git_diff_summary", arguments: { root: ".", max_bytes: 8000 } });
  assert.equal(diff.isError, undefined);
  assert.match(diff.structuredContent?.git_diff?.summary || "", /src\/app\.js/);

  const dryCommit = await client.callTool({ name: "vnem_tools_git_commit", arguments: { root: ".", files: ["src/app.js"], message: "test: update app" } });
  assert.equal(dryCommit.isError, undefined);
  assert.equal(dryCommit.structuredContent?.git_commit?.dry_run, true);
  const headBefore = spawnSync("git", ["rev-parse", "HEAD"], { cwd: projectDir, encoding: "utf8" }).stdout.trim();
  const unapprovedCommit = await client.callTool({ name: "vnem_tools_git_commit", arguments: { root: ".", files: ["src/app.js"], message: "test: update app", dry_run: false } });
  assert.equal(unapprovedCommit.isError, true);
  assert.equal(unapprovedCommit.structuredContent?.code, "approval_required");
  const secretCommit = await client.callTool({ name: "vnem_tools_git_commit", arguments: { root: ".", files: [".env"], message: "test: bad", dry_run: false, approved: true, approval_note: "try secret stage" } });
  assert.equal(secretCommit.isError, true);
  assert.equal(secretCommit.structuredContent?.code, "secret_path_blocked");
  const pushCommit = await client.callTool({ name: "vnem_tools_run_command", arguments: { command: "git push", cwd: ".", dry_run: false, approved: true, approval_note: "try push" } });
  assert.equal(pushCommit.isError, true);
  assert.equal(pushCommit.structuredContent?.code, "dangerous_command_blocked");
  const approvedCommit = await client.callTool({ name: "vnem_tools_git_commit", arguments: { root: ".", files: ["src/app.js"], message: "test: update app", dry_run: false, approved: true, approval_note: "approve local commit of explicit test file", session_id: sessionId } });
  assert.equal(approvedCommit.isError, undefined);
  assert.equal(approvedCommit.structuredContent?.git_commit?.committed, true);
  assert.notEqual(approvedCommit.structuredContent?.git_commit?.commit_sha, headBefore);
  assert.doesNotMatch(spawnSync("git", ["status", "--short"], { cwd: projectDir, encoding: "utf8" }).stdout, /^A  \.env/m);

  const finished = await client.callTool({ name: "vnem_tools_finish_session", arguments: { session_id: sessionId, test_results: ["project test passed"], notes: "TOKEN=sample-sensitive-value should be redacted" } });
  assert.equal(finished.isError, undefined);
  const pack = finished.structuredContent?.session_evidence;
  assert.equal(pack.session_id, sessionId);
  assert.ok(pack.patches_applied.length >= 1);
  assert.ok(pack.commands_run.length >= 1);
  assert.ok(pack.browser_captures.length >= 1);
  assert.ok(pack.blocked_actions.length >= 1);
  assert.ok(pack.git_commits.length >= 1);
  assert.ok(pack.recommended_final_report_lines.length >= 1);
  assert.doesNotMatch(JSON.stringify(pack), /sample-sensitive-value/);
  assert.ok((await stat(pack.evidence_path)).isFile());
  assert.doesNotMatch(await readFile(pack.evidence_path, "utf8"), /sample-sensitive-value/);

  console.log("vnem Tools git/session tests passed");
} catch (error) {
  if (stderr.trim()) console.error(stderr.trim());
  throw error;
} finally {
  await client.close().catch(() => {});
  await rm(tmpRoot, { recursive: true, force: true });
}
