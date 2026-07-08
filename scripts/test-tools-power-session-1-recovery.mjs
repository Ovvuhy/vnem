import assert from "node:assert/strict";
import { execFile as execFileCb } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const execFile = promisify(execFileCb);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");

await mkdir(path.join(rootDir, ".tmp"), { recursive: true });

async function withRecoveryTools(fn) {
  const tmpRoot = await mkdtemp(path.join(rootDir, ".tmp", "power-session-1-"));
  const workspace = path.join(tmpRoot, "workspace");
  const repo = path.join(workspace, "repo");
  await setupRecoveryRepo(repo);
  const client = new Client({ name: "power-session-1-test", version: "1.0.1" }, { capabilities: {} });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(scriptDir, "vnem-tools-mcp-server.mjs")],
    cwd: rootDir,
    env: {
      ...process.env,
      VNEM_TOOLS_ALLOWED_ROOTS: workspace,
      VNEM_TOOLS_EVIDENCE_ROOT: path.join(workspace, ".vnem", "tool-runs"),
      VNEM_TOOLS_SKIP_WRANGLER_CHECK: "1",
      VNEM_TOOLS_GITHUB_ALLOWED_REPOS: "fixture/recovery"
    },
    stderr: "pipe"
  });
  let stderr = "";
  transport.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });
  try {
    await client.connect(transport);
    return await fn({ client, repo });
  } finally {
    await client.close().catch(() => {});
    await rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
    if (stderr.trim()) process.stderr.write(stderr);
  }
}

async function setupRecoveryRepo(repo) {
  await mkdir(path.join(repo, "src"), { recursive: true });
  await mkdir(path.join(repo, "scripts"), { recursive: true });
  await mkdir(path.join(repo, "docs"), { recursive: true });
  await mkdir(path.join(repo, "public"), { recursive: true });
  await writeFile(path.join(repo, "package.json"), JSON.stringify({
    type: "module",
    scripts: {
      "test:tools-power-session-1-recovery": "node scripts/test-tools-power-session-1-recovery.mjs",
      "tools:readiness": "node scripts/tools-readiness-report.mjs"
    }
  }, null, 2));
  await writeFile(path.join(repo, "src", "app.js"), "export const base = true;\n");
  await writeFile(path.join(repo, "scripts", "vnem-tools-mcp-server.mjs"), "export const tool = 'base';\n");
  await writeFile(path.join(repo, "scripts", "tools-readiness-report.mjs"), "console.log('ready');\n");
  await writeFile(path.join(repo, "docs", "handoff.md"), "# Handoff\n");
  await writeFile(path.join(repo, "public", "index.json"), "{\"ok\":true}\n");
  await execFile("git", ["init"], { cwd: repo });
  await execFile("git", ["config", "user.email", "vnem-test@example.local"], { cwd: repo });
  await execFile("git", ["config", "user.name", "VNEM Test"], { cwd: repo });
  await execFile("git", ["remote", "add", "origin", "https://github.com/fixture/recovery.git"], { cwd: repo });
  await execFile("git", ["add", "."], { cwd: repo });
  await execFile("git", ["commit", "-m", "initial"], { cwd: repo });
  await execFile("git", ["branch", "-M", "main"], { cwd: repo });
  await execFile("git", ["update-ref", "refs/remotes/origin/main", "HEAD"], { cwd: repo });

  await execFile("git", ["switch", "-c", "feat/tools-real-github-execution-paths"], { cwd: repo });
  await writeFile(path.join(repo, "scripts", "vnem-tools-mcp-server.mjs"), "export const tool = 'autonomy real github execution paths';\n");
  await execFile("git", ["add", "scripts/vnem-tools-mcp-server.mjs"], { cwd: repo });
  await execFile("git", ["commit", "-m", "feat(tools): add real GitHub execution paths"], { cwd: repo });

  await execFile("git", ["switch", "-c", "feat/vnem-power-tools-1"], { cwd: repo });
  await writeFile(path.join(repo, "src", "app.js"), "export const powerTools1 = true;\n");
  await execFile("git", ["add", "src/app.js"], { cwd: repo });
  await execFile("git", ["commit", "-m", "feat(tools): add power repo intelligence workflows"], { cwd: repo });

  await execFile("git", ["switch", "-c", "feat/vnem-power-tools-2"], { cwd: repo });
  await writeFile(path.join(repo, "scripts", "tools-readiness-report.mjs"), "console.log('power tools 2 ready');\n");
  await execFile("git", ["add", "scripts/tools-readiness-report.mjs"], { cwd: repo });
  await execFile("git", ["commit", "-m", "feat(tools): tune repo power intelligence from dogfood"], { cwd: repo });

  await execFile("git", ["switch", "-c", "feat/vnem-power-session-1"], { cwd: repo });
}

async function call(client, name, args) {
  const result = await client.callTool({ name, arguments: args });
  const key = Object.keys(result.structuredContent).find((item) => item !== "error");
  return result.structuredContent[key];
}

await withRecoveryTools(async ({ client, repo }) => {
  const tools = new Set((await client.listTools()).tools.map((tool) => tool.name));
  assert.equal(tools.has("vnem_tools_local_session_recovery"), true, "missing recovery tool");

  const clean = await call(client, "vnem_tools_local_session_recovery", {
    root: repo,
    base_ref: "origin/main",
    task_goal: "POWER-SESSION-1 recover the local stack",
    max_commits: 10
  });
  assert.equal(clean.operation_result, "reported");
  assert.equal(clean.current_branch, "feat/vnem-power-session-1");
  assert.equal(clean.base_ref.selected, "origin/main");
  assert.equal(clean.base_ref.found, true);
  assert.equal(clean.worktree.dirty, false);
  assert.ok(clean.local_stack.ahead_count >= 3);
  assert.ok(clean.local_stack.commits.some((commit) => /real GitHub execution paths/.test(commit.subject)));
  assert.ok(clean.local_stack.commits.some((commit) => /power repo intelligence workflows/.test(commit.subject)));
  assert.ok(clean.local_stack.commits.some((commit) => /repo power intelligence from dogfood/.test(commit.subject)));
  assert.equal(clean.live_proof_attempted, false);
  assert.equal(clean.secret_values_exposed, false);
  assert.ok(clean.not_proven.some((item) => /Remote GitHub/.test(item)));
  assert.ok(clean.safe_to_claim.some((item) => /Local branch/.test(item)));
  assert.ok(clean.what_not_to_touch.some((item) => /force-push|PR/.test(item)));
  assert.equal(clean.output_compact, true);

  await writeFile(path.join(repo, "src", "app.js"), "export const powerSession1 = 'dirty source';\n");
  await writeFile(path.join(repo, "docs", "claim.md"), "# Local recovery claim\n");
  await writeFile(path.join(repo, "public", "install.tgz"), "generated tarball placeholder\n");
  await writeFile(path.join(repo, ".env"), "TOKEN=SECRET_TOKEN_VALUE\n");

  const dirty = await call(client, "vnem_tools_local_session_recovery", {
    root: repo,
    base_ref: "origin/main",
    task_goal: "POWER-SESSION-1 recover the local stack",
    max_commits: 10
  });
  assert.equal(dirty.worktree.dirty, true);
  assert.ok(dirty.worktree.dirty_categories.source.includes("src/app.js"));
  assert.ok(dirty.worktree.dirty_categories.docs.includes("docs/claim.md"));
  assert.ok(dirty.worktree.dirty_categories.generated.includes("public/install.tgz"));
  assert.ok(dirty.worktree.dirty_categories.risky_or_secret_like.includes(".env"));
  assert.match(dirty.safe_next_action, /Review dirty files/);
  assert.doesNotMatch(JSON.stringify(dirty), /SECRET_TOKEN_VALUE/);

  const manifest = await call(client, "vnem_tools_manifest", { capability_group: "repo_power" });
  assert.equal(manifest.tools.length, 8);
  assert.ok(manifest.tools.some((tool) => tool.name === "vnem_tools_local_session_recovery" && tool.reliability_level === "local_tested"));

  const status = await call(client, "vnem_tools_status", {});
  assert.ok(status.repo_power_policy.tools.includes("vnem_tools_local_session_recovery"));
  assert.equal(status.repo_power_policy.local_session_recovery_supported, true);
});

console.log("vnem Tools POWER-SESSION-1 local session recovery tests passed");
