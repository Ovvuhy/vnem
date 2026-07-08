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
const selectedCase = (process.argv.find((arg) => arg.startsWith("--case=")) || "").slice("--case=".length);
const allCases = ["local", "publish", "ci-failure", "recovery", "no-placebo", "validation", "regression"];
const casesToRun = selectedCase ? [selectedCase] : allCases;
assert.ok(casesToRun.every((item) => allCases.includes(item)), `unknown case ${selectedCase}`);

await mkdir(path.join(rootDir, ".tmp"), { recursive: true });

async function withOrchestratorTools(fn) {
  const tmpRoot = await mkdtemp(path.join(rootDir, ".tmp", "orchestrator-1-"));
  const workspace = path.join(tmpRoot, "workspace");
  const repo = path.join(workspace, "repo");
  await setupFixtureRepo(repo);
  const client = new Client({ name: "orchestrator-1-test", version: "1.0.1" }, { capabilities: {} });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(scriptDir, "vnem-tools-mcp-server.mjs")],
    cwd: rootDir,
    env: {
      ...process.env,
      VNEM_TOOLS_ALLOWED_ROOTS: workspace,
      VNEM_TOOLS_EVIDENCE_ROOT: path.join(workspace, ".vnem", "tool-runs"),
      VNEM_TOOLS_SKIP_WRANGLER_CHECK: "1",
      VNEM_TOOLS_GITHUB_ALLOWED_REPOS: "fixture/orchestrator"
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

async function setupFixtureRepo(repo) {
  await mkdir(path.join(repo, "src"), { recursive: true });
  await mkdir(path.join(repo, "scripts"), { recursive: true });
  await mkdir(path.join(repo, "docs"), { recursive: true });
  await mkdir(path.join(repo, "tests"), { recursive: true });
  await writeFile(path.join(repo, "package.json"), JSON.stringify({
    type: "module",
    scripts: {
      validate: "node --check src/app.js",
      "tools:readiness": "node scripts/tools-readiness-report.mjs",
      "test:tools-orchestrator-1-regression": "node scripts/test-tools-orchestrator-1-regression.mjs",
      "test:tools-power-tools-2-regression": "node scripts/test-tools-power-tools-2-regression.mjs",
      "test:tools-power-tools-1-regression": "node scripts/test-tools-power-tools-1-regression.mjs",
      "test:tools-power-session-1-recovery": "node scripts/test-tools-power-session-1-recovery.mjs",
      "test:tools-quality-general": "node scripts/test-tools-quality-general.mjs",
      test: "node tests/app.test.js"
    }
  }, null, 2));
  await writeFile(path.join(repo, "src", "app.js"), "export function feature() { return 'base'; }\n");
  await writeFile(path.join(repo, "tests", "app.test.js"), "import { feature } from '../src/app.js';\nif (feature() !== 'base') throw new Error('bad fixture');\n");
  await writeFile(path.join(repo, "scripts", "vnem-tools-mcp-server.mjs"), "export const registry = ['vnem_tools_repo_workflow_orchestrator'];\n");
  await writeFile(path.join(repo, "scripts", "tools-readiness-report.mjs"), "console.log('ready');\n");
  await writeFile(path.join(repo, "scripts", "test-tools-orchestrator-1-regression.mjs"), "console.log('fixture orchestrator test');\n");
  await writeFile(path.join(repo, "scripts", "test-tools-power-tools-2-regression.mjs"), "console.log('fixture power tools 2');\n");
  await writeFile(path.join(repo, "scripts", "test-tools-power-tools-1-regression.mjs"), "console.log('fixture power tools 1');\n");
  await writeFile(path.join(repo, "scripts", "test-tools-power-session-1-recovery.mjs"), "console.log('fixture recovery');\n");
  await writeFile(path.join(repo, "scripts", "test-tools-quality-general.mjs"), "console.log('fixture quality');\n");
  await writeFile(path.join(repo, "docs", "handoff.md"), "# Handoff\n");
  await execFile("git", ["init"], { cwd: repo });
  await execFile("git", ["config", "user.email", "vnem-test@example.local"], { cwd: repo });
  await execFile("git", ["config", "user.name", "VNEM Test"], { cwd: repo });
  await execFile("git", ["remote", "add", "origin", "https://github.com/fixture/orchestrator.git"], { cwd: repo });
  await execFile("git", ["add", "."], { cwd: repo });
  await execFile("git", ["commit", "-m", "initial"], { cwd: repo });
  await execFile("git", ["branch", "-M", "main"], { cwd: repo });
  await execFile("git", ["update-ref", "refs/remotes/origin/main", "HEAD"], { cwd: repo });
  await execFile("git", ["switch", "-c", "feat/vnem-orchestrator-fixture"], { cwd: repo });
  await writeFile(path.join(repo, "src", "app.js"), "export function feature() { return 'orchestrated'; }\n");
  await execFile("git", ["add", "src/app.js"], { cwd: repo });
  await execFile("git", ["commit", "-m", "feat(tools): add source behavior"], { cwd: repo });
  await writeFile(path.join(repo, "scripts", "vnem-tools-mcp-server.mjs"), "export const registry = ['vnem_tools_repo_workflow_orchestrator'];\nexport function repoWorkflowOrchestrator(){ return 'real synthesis'; }\n");
  await execFile("git", ["add", "scripts/vnem-tools-mcp-server.mjs"], { cwd: repo });
  await execFile("git", ["commit", "-m", "feat(tools): add repo workflow orchestrator"], { cwd: repo });
}

async function call(client, name, args) {
  const result = await client.callTool({ name, arguments: args });
  const key = Object.keys(result.structuredContent).find((item) => item !== "error");
  return result.structuredContent[key];
}

function text(value) {
  return JSON.stringify(value);
}

await withOrchestratorTools(async ({ client, repo }) => {
  const tools = new Set((await client.listTools()).tools.map((tool) => tool.name));
  assert.equal(tools.has("vnem_tools_repo_workflow_orchestrator"), true, "missing orchestrator tool");

  if (casesToRun.includes("local")) {
    const local = await call(client, "vnem_tools_repo_workflow_orchestrator", {
      root: repo,
      task_mode: "local_only",
      user_goal: "Implement repo workflow orchestrator locally, no push and no PR.",
      changed_files: ["scripts/vnem-tools-mcp-server.mjs", "scripts/test-tools-orchestrator-1-regression.mjs"],
      proof_level: "targeted"
    });
    assert.equal(local.operation_result, "reported");
    assert.equal(local.task_mode, "local_only");
    assert.equal(local.remote_proof_required, false);
    assert.equal(local.selected_action.phase, "local_only");
    assert.match(local.selected_action.action, /local behavior|local behavior slice|local/i);
    assert.doesNotMatch(text(local.exact_checks), /\bgit push\b|gh pr|gh run|ls-remote/i);
    assert.match(text(local.exact_checks), /test:tools-orchestrator-1-regression|node --check scripts\/vnem-tools-mcp-server\.mjs/);
    assert.equal(local.evidence_contract.proof_packet_required, true);
    assert.ok(local.what_is_not_proven.some((item) => /Remote GitHub/.test(item)));
    assert.ok(local.connected_tools.next_action_ranker.length >= 1);
  }

  if (casesToRun.includes("publish")) {
    const publish = await call(client, "vnem_tools_repo_workflow_orchestrator", {
      root: repo,
      task_mode: "publish",
      user_goal: "Push the existing feature branch, open a PR, verify remote SHA, and check Actions.",
      changed_files: ["scripts/vnem-tools-mcp-server.mjs", "scripts/test-tools-orchestrator-1-regression.mjs"],
      proof_level: "remote",
      allow_live_remote: true
    });
    assert.equal(publish.task_mode, "publish");
    assert.equal(publish.remote_proof_required, true);
    assert.equal(publish.evidence_contract.live_remote_allowed, true);
    assert.match(text(publish.exact_checks), /git push -u origin|git ls-remote origin|gh pr|gh run list|gh run view/);
    assert.ok(publish.rejected_actions.some((item) => /force push|push to main|new implementation/i.test(item)));
    assert.match(publish.selected_action.action, /remote SHA|PR head SHA|GitHub Actions/i);
  }

  if (casesToRun.includes("ci-failure")) {
    const ci = await call(client, "vnem_tools_repo_workflow_orchestrator", {
      root: repo,
      task_mode: "ci_failure",
      user_goal: "Fix a branch-caused CI failure only after log triage.",
      changed_files: ["scripts/vnem-tools-mcp-server.mjs"],
      failing_output: "AssertionError: expected true to equal false\nscripts/vnem-tools-mcp-server.mjs:123\nfailed with exit code 1"
    });
    assert.equal(ci.task_mode, "ci_failure");
    assert.equal(ci.failure_triage_plan.classification, "real_assertion_failure");
    assert.match(text(ci.exact_checks), /gh run view <run-id> --log|vnem-tools-mcp-server\.mjs/);
    assert.ok(ci.rejected_actions.some((item) => /broad refactor|environment/i.test(item)));
    assert.match(ci.selected_action.next_best_step, /Inspect|Patch|assertion|same focused test/i);
  }

  if (casesToRun.includes("recovery")) {
    await writeFile(path.join(repo, "src", "app.js"), "export function feature() { return 'dirty recovery'; }\n");
    await writeFile(path.join(repo, "docs", "claim.md"), "# Recovery claim\n");
    await writeFile(path.join(repo, ".env"), "TOKEN=SECRET_TOKEN_VALUE\n");
    const recovery = await call(client, "vnem_tools_repo_workflow_orchestrator", {
      root: repo,
      task_mode: "recovery",
      user_goal: "Recover local session state after lost chat context."
    });
    assert.equal(recovery.task_mode, "recovery");
    assert.equal(recovery.repo_state_summary.dirty_worktree, true);
    assert.ok(recovery.repo_state_summary.dirty_categories.risky_or_secret_like.includes(".env"));
    assert.match(recovery.selected_action.action, /Recover branch, HEAD, dirty files/i);
    assert.ok(recovery.rejected_actions.some((item) => /reset --hard|force push|recovery output alone/i.test(item)));
    assert.doesNotMatch(text(recovery.exact_checks), /\bgit push\b|gh pr|gh run/i);
    assert.ok(recovery.what_is_not_proven.some((item) => /Remote GitHub/.test(item)));
  }

  if (casesToRun.includes("no-placebo")) {
    const noPlacebo = await call(client, "vnem_tools_repo_workflow_orchestrator", {
      root: repo,
      task_mode: "no_placebo",
      user_goal: "Complete orchestrator with a docs-only claim.",
      changed_files: ["docs/claim.md"]
    });
    assert.equal(noPlacebo.task_mode, "no_placebo");
    assert.equal(noPlacebo.selected_action.source_behavior_required, true);
    assert.ok(noPlacebo.no_placebo_gate.placebo_risks.some((risk) => /docs-only/i.test(risk)));
    assert.ok(noPlacebo.rejected_actions.some((item) => /docs-only|registration-only|generated-only/i.test(item)));
    assert.match(noPlacebo.safe_next_step, /source behavior|behavior test|implementation/i);
  }

  if (casesToRun.includes("validation")) {
    const validation = await call(client, "vnem_tools_repo_workflow_orchestrator", {
      root: repo,
      task_mode: "validation",
      user_goal: "Proof already exists: npm.cmd run test:tools-orchestrator-1-regression passed and npm.cmd run tools:readiness passed.",
      proof_level: "targeted"
    });
    assert.equal(validation.task_mode, "validation");
    assert.equal(validation.selected_action.avoid_full_suite_without_trigger, true);
    assert.ok(validation.rejected_actions.some((item) => /full npm test/i.test(item)));
    assert.ok(!validation.exact_checks.some((cmd) => cmd === "npm.cmd run test"));
    assert.match(text(validation.exact_checks), /tools:readiness|evidence_pack/);
  }

  if (casesToRun.includes("regression")) {
    const manifest = await call(client, "vnem_tools_manifest", { capability_group: "repo_power" });
    assert.equal(manifest.tools.length, 9);
    assert.ok(manifest.tools.some((tool) => tool.name === "vnem_tools_repo_workflow_orchestrator" && tool.reliability_level === "local_tested"));
    const status = await call(client, "vnem_tools_status", {});
    assert.ok(status.repo_power_policy.tools.includes("vnem_tools_repo_workflow_orchestrator"));
    assert.equal(status.repo_power_policy.workflow_orchestrator_supported, true);
  }
});

console.log(`vnem Tools ORCHESTRATOR-1 ${selectedCase || "regression"} tests passed`);
