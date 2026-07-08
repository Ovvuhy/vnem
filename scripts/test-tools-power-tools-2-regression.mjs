import assert from "node:assert/strict";
import { execFile as execFileCb } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const execFile = promisify(execFileCb);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const selectedCase = (process.argv.find((arg) => arg.startsWith("--case=")) || "").slice("--case=".length);
const allCases = ["dogfood", "ranking-quality", "no-placebo-strictness", "test-selection", "evidence-pack", "regression"];
const casesToRun = selectedCase ? [selectedCase] : allCases;
assert.ok(casesToRun.every((item) => allCases.includes(item)), `unknown case ${selectedCase}`);

await mkdir(path.join(rootDir, ".tmp"), { recursive: true });

async function withPowerTools(fn, setupOptions = {}) {
  const tmpRoot = await mkdtemp(path.join(rootDir, ".tmp", "power-tools-2-"));
  const workspace = path.join(tmpRoot, "workspace");
  const repo = path.join(workspace, "repo");
  await setupFixtureRepo(repo, setupOptions);
  const client = new Client({ name: "power-tools-2-test", version: "1.0.1" }, { capabilities: {} });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(scriptDir, "vnem-tools-mcp-server.mjs")],
    cwd: rootDir,
    env: {
      ...process.env,
      VNEM_TOOLS_ALLOWED_ROOTS: workspace,
      VNEM_TOOLS_EVIDENCE_ROOT: path.join(workspace, ".vnem", "tool-runs"),
      VNEM_TOOLS_SKIP_WRANGLER_CHECK: "1",
      VNEM_TOOLS_GITHUB_ALLOWED_REPOS: "fixture/power"
    },
    stderr: "pipe"
  });
  let stderr = "";
  transport.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });
  try {
    await client.connect(transport);
    return await fn({ client, repo, tmpRoot });
  } finally {
    await client.close().catch(() => {});
    await rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
    if (stderr.trim()) process.stderr.write(stderr);
  }
}

async function setupFixtureRepo(repo, options = {}) {
  await mkdir(path.join(repo, "src"), { recursive: true });
  await mkdir(path.join(repo, "tests"), { recursive: true });
  await mkdir(path.join(repo, "docs"), { recursive: true });
  await mkdir(path.join(repo, "scripts"), { recursive: true });
  await mkdir(path.join(repo, "public", "install"), { recursive: true });
  await mkdir(path.join(repo, "node_modules", "ignored"), { recursive: true });
  await writeFile(path.join(repo, "package.json"), JSON.stringify({
    type: "module",
    scripts: {
      test: "node tests/app.test.js",
      "test:tools-power-tools-1-regression": "node scripts/test-tools-power-tools-1-regression.mjs",
      "test:tools-power-tools-2-regression": "node scripts/test-tools-power-tools-2-regression.mjs",
      "test:tools-quality-general": "node scripts/test-tools-quality-general.mjs",
      validate: "node --check src/app.js",
      generate: "node scripts/generate-artifacts.mjs",
      "tools:readiness": "node scripts/tools-readiness-report.mjs",
      "check:links": "node scripts/check-links.mjs"
    }
  }, null, 2));
  await writeFile(path.join(repo, "src", "app.js"), "export function realFeature() { return 'implemented'; }\n");
  await writeFile(path.join(repo, "scripts", "vnem-tools-mcp-server.mjs"), "export function registerTool(name, fn) { return { name, fn }; }\n");
  await writeFile(path.join(repo, "scripts", "generate-artifacts.mjs"), "console.log('generate');\n");
  await writeFile(path.join(repo, "scripts", "tools-readiness-report.mjs"), "console.log('ready');\n");
  await writeFile(path.join(repo, "scripts", "test-tools-power-tools-2-regression.mjs"), "console.log('test');\n");
  await writeFile(path.join(repo, "tests", "app.test.js"), "import { realFeature } from '../src/app.js';\nif (realFeature() !== 'implemented') throw new Error('bad feature');\n");
  await writeFile(path.join(repo, "docs", "handoff.md"), "# Handoff\n");
  await writeFile(path.join(repo, "public", "install", "index.json"), "{\"generated\":true}\n");
  await writeFile(path.join(repo, "node_modules", "ignored", "noise.js"), "throw new Error('must not scan');\n");
  await execFile("git", ["init"], { cwd: repo });
  await execFile("git", ["config", "user.email", "vnem-test@example.local"], { cwd: repo });
  await execFile("git", ["config", "user.name", "VNEM Test"], { cwd: repo });
  await execFile("git", ["remote", "add", "origin", "https://github.com/fixture/power.git"], { cwd: repo });
  await execFile("git", ["add", "."], { cwd: repo });
  await execFile("git", ["commit", "-m", "initial"], { cwd: repo });
  await execFile("git", ["branch", "-M", "main"], { cwd: repo });
  for (const [relative, content] of Object.entries(options.afterCommitFiles || {})) {
    await mkdir(path.dirname(path.join(repo, relative)), { recursive: true });
    await writeFile(path.join(repo, relative), content);
  }
}

async function call(client, name, args) {
  const result = await client.callTool({ name, arguments: args });
  const key = Object.keys(result.structuredContent).find((item) => item !== "error");
  return result.structuredContent[key];
}

if (casesToRun.includes("dogfood") || casesToRun.includes("ranking-quality")) {
  await withPowerTools(async ({ client, repo }) => {
    const ranking = await call(client, "vnem_tools_next_action_ranker", {
      root: repo,
      user_goal: "POWER-TOOLS-2 local-only dogfood: tune existing repo-power tools, no push, no PR, no broad new tool names",
      max_actions: 5
    });
    assert.match(ranking.actions[0].action, /Dogfood current repo-power output, then tune/i);
    assert.equal(ranking.actions[0].should_do_now, true);
    assert.ok(ranking.actions[0].score > ranking.actions[1].score + 20, "top action should be decisively top");
    assert.ok(ranking.actions[0].expected_files_to_touch.some((file) => /vnem-tools-mcp-server/.test(file)));
    assert.ok(ranking.actions[0].expected_proof_checks.some((cmd) => /power-tools-2/.test(cmd)));
    assert.ok(ranking.actions.every((action) => !/push|pull request|open PR|publish/i.test(action.action)));
    assert.equal(ranking.task_constraints.local_only, true);
    assert.ok(ranking.penalties_applied.some((item) => /new-tool expansion/i.test(item)));
  });
}

if (casesToRun.includes("dogfood") || casesToRun.includes("regression")) {
  await withPowerTools(async ({ client, repo }) => {
    await writeFile(path.join(repo, "src", "app.js"), "export function realFeature() { return 'better'; }\n");
    await writeFile(path.join(repo, "docs", "claim.md"), "# Claim\nImplementation claim.\n");
    const map = await call(client, "vnem_tools_repo_deep_map", { root: repo, max_files: 200, max_depth: 6 });
    assert.ok(map.source_dirs.some((dir) => dir === "scripts" || dir.startsWith("scripts/")));
    assert.ok(map.changed_or_untracked_files.includes("src/app.js"), "dirty path must not lose its first character");
    assert.ok(map.changed_or_untracked_files.includes("docs/claim.md"));
    assert.ok(map.file_groups.source.changed.includes("src/app.js"));
    assert.ok(map.likely_important_files.some((file) => /vnem-tools-mcp-server/.test(file)));
    assert.equal(map.output_compact, true);
  });
}

if (casesToRun.includes("no-placebo-strictness")) {
  await withPowerTools(async ({ client, repo }) => {
    const docs = await call(client, "vnem_tools_no_placebo_progress_audit", {
      root: repo,
      changed_files: ["docs/claim.md"],
      completed_summary: "Implemented live GitHub proof using docs and mocked output.",
      mocked_proof: ["mocked gh pr create"],
      live_proof: []
    });
    assert.ok(docs.real_progress_score < 35);
    assert.ok(docs.placebo_risks.some((risk) => /docs-only|mocked-only/i.test(risk)));
    assert.ok(docs.not_proven.some((item) => /source behavior|live external/i.test(item)));

    const generated = await call(client, "vnem_tools_no_placebo_progress_audit", {
      root: repo,
      changed_files: ["public/install.tgz", "public/install/index.json"],
      completed_summary: "Generated artifacts updated and the feature is done.",
      tests_run: []
    });
    assert.ok(generated.real_progress_score < 35);
    assert.ok(generated.placebo_risks.some((risk) => /generated artifact churn/i.test(risk)));
    assert.ok(generated.missing_proof.some((proof) => /generation|install-pack/i.test(proof)));

    const registration = await call(client, "vnem_tools_no_placebo_progress_audit", {
      root: repo,
      changed_files: ["scripts/vnem-tools-mcp-server.mjs"],
      completed_summary: "Registered a new tool name in the manifest/catalog.",
      tests_run: []
    });
    assert.ok(registration.real_progress_score < 55);
    assert.ok(registration.placebo_risks.some((risk) => /registration-only/i.test(risk)));

    const real = await call(client, "vnem_tools_no_placebo_progress_audit", {
      root: repo,
      changed_files: ["scripts/vnem-tools-mcp-server.mjs", "scripts/test-tools-power-tools-2-regression.mjs"],
      completed_summary: "Tuned existing repo-power source behavior and added targeted proof.",
      tests_run: ["npm.cmd run test:tools-power-tools-2-regression"]
    });
    assert.ok(real.real_progress_score >= 80);
    assert.deepEqual(real.placebo_risks, []);
    assert.ok(real.safe_to_claim.some((claim) => /Source behavior changed/i.test(claim)));
  });
}

if (casesToRun.includes("test-selection")) {
  await withPowerTools(async ({ client, repo }) => {
    const impact = await call(client, "vnem_tools_change_impact_plan", {
      root: repo,
      changed_files: [
        "scripts/vnem-tools-mcp-server.mjs",
        "scripts/test-tools-power-tools-2-regression.mjs",
        "scripts/tools-readiness-report.mjs",
        "scripts/generate-artifacts.mjs",
        "package.json",
        "docs/handoff.md",
        "public/install.tgz"
      ]
    });
    for (const area of ["tools_mcp", "tests", "tools_readiness", "generator", "package_scripts", "docs", "generated_artifacts"]) assert.ok(impact.changed_areas.includes(area), `missing area ${area}`);
    assert.equal(impact.source_generator_reason_required, false);
    assert.ok(impact.minimum_targeted_tests.some((cmd) => /power-tools-2/.test(cmd)));
    assert.ok(impact.minimum_targeted_tests.some((cmd) => /tools:readiness/.test(cmd)));
    assert.ok(impact.full_npm_test_justified);

    const generatedOnly = await call(client, "vnem_tools_change_impact_plan", { root: repo, changed_files: ["public/install.tgz"] });
    assert.equal(generatedOnly.generated_only, true);
    assert.equal(generatedOnly.source_generator_reason_required, true);

    const docsOnly = await call(client, "vnem_tools_change_impact_plan", { root: repo, changed_files: ["docs/handoff.md"] });
    assert.equal(docsOnly.docs_only, true);
    assert.ok(docsOnly.minimum_targeted_tests.some((cmd) => /check:links/.test(cmd)));

    const selection = await call(client, "vnem_tools_test_selection_plan", {
      root: repo,
      user_goal: "local-only Tools MCP tuning, no live GitHub proof",
      changed_files: ["scripts/vnem-tools-mcp-server.mjs", "scripts/test-tools-power-tools-2-regression.mjs"]
    });
    assert.ok(selection.first_checks_to_run[0] === "git diff --check");
    assert.ok(selection.targeted_tests.some((cmd) => /power-tools-2/.test(cmd)));
    assert.equal(selection.full_npm_test_recommended, false);
    assert.equal(selection.proof_boundaries.browser_proof_required, false);
    assert.equal(selection.proof_boundaries.live_github_proof_required, false);
    assert.ok(selection.avoid_over_validation.some((line) => /live GitHub/.test(line)));
  });
}

if (casesToRun.includes("regression")) {
  await withPowerTools(async ({ client, repo }) => {
    const cases = {
      auth: ["gh auth status", "gh auth status failed: not authenticated", "auth_permission_issue"],
      windows: ["npm.cmd run test:tools-project-actions", "EBUSY: resource busy or locked, rmdir '.tmp/project'", "windows_path_process_cleanup_issue"],
      generated: ["npm.cmd run test:install-pack", "public/install.tgz snapshot stale generated artifact mismatch", "generated_artifact_staleness"],
      assertion: ["npm.cmd run test:unit", "AssertionError [ERR_ASSERTION]: expected true\n    at tests/app.test.js:9:3", "real_assertion_failure"],
      network: ["npm.cmd run test:source", "TypeError: fetch failed ECONNRESET source unavailable", "environment_network_issue"]
    };
    for (const [name, [command, stderr, expected]] of Object.entries(cases)) {
      const triage = await call(client, "vnem_tools_failure_triage", { root: repo, command, stderr });
      assert.equal(triage.classification, expected, name);
      assert.ok(triage.smallest_next_command);
      assert.ok(triage.recommended_next_action);
      assert.equal(typeof triage.acceptance_blocker, "boolean");
      assert.ok(["continue_after_fix", "continue_with_caveat", "ask_user_or_report_blocked", "stop_or_retry_once_without_product_patch"].includes(triage.continue_stop_or_ask_user));
    }
  });
}

if (casesToRun.includes("evidence-pack")) {
  await withPowerTools(async ({ client, repo }) => {
    await writeFile(path.join(repo, "scripts", "vnem-tools-mcp-server.mjs"), "export function tuned(){ return true; }\n");
    await writeFile(path.join(repo, "scripts", "test-tools-power-tools-2-regression.mjs"), "console.log('new proof');\n");
    const pack = await call(client, "vnem_tools_evidence_pack", {
      root: repo,
      commands_run: ["npm.cmd run test:tools-power-tools-2-regression"],
      tests_passed: ["test:tools-power-tools-2-regression"],
      tests_failed: [],
      real_behavior_added: ["repo-power ranking and evidence pack tuning"],
      mocked_proof: ["fixture MCP calls"],
      live_proof: [],
      blocked_proof: ["live GitHub proof not attempted for local-only batch"],
      remaining_risk: ["no external live proof required"],
      commit_sha: "abc123",
      commit_message: "feat(tools): tune repo power intelligence from dogfood",
      next_best_task: "Run existing POWER-TOOLS-1 and AUTONOMY-2 regressions."
    });
    for (const field of ["Branch", "Commit SHA", "Commit message", "Worktree status", "Files changed count", "Main files changed", "New/changed tests", "Exact tests/checks passed", "Exact tests/checks failed", "Generated artifacts updated", "Live proof attempted", "What is not proven", "Next best task"]) {
      assert.ok(Object.hasOwn(pack.proof_packet, field), `missing proof packet field ${field}`);
    }
    assert.equal(pack.proof_packet["Live proof attempted"], "no");
    assert.ok(pack.main_files_changed.some((file) => /vnem-tools-mcp-server/.test(file)));
    assert.ok(pack.new_or_changed_tests.some((file) => /power-tools-2/.test(file)));
    assert.ok(pack.what_is_not_proven.some((item) => /Live proof/i.test(item)));
    assert.ok(pack.safe_to_claim.some((claim) => /Real behavior added/i.test(claim)));
  });
}

if (casesToRun.includes("regression")) {
  const pkg = JSON.parse(await readFile(path.join(rootDir, "package.json"), "utf8"));
  for (const script of [
    "test:tools-power-tools-2-dogfood",
    "test:tools-power-tools-2-ranking-quality",
    "test:tools-power-tools-2-no-placebo-strictness",
    "test:tools-power-tools-2-test-selection",
    "test:tools-power-tools-2-evidence-pack",
    "test:tools-power-tools-2-regression"
  ]) assert.ok(pkg.scripts?.[script], `missing package script ${script}`);
}

console.log(`vnem Tools POWER-TOOLS-2 ${selectedCase || "regression"} tests passed`);
