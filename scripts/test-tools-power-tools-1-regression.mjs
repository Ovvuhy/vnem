import assert from "node:assert/strict";
import { execFile as execFileCb } from "node:child_process";
import { existsSync } from "node:fs";
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
const allCases = ["repo-deep-map", "next-action-ranker", "no-placebo-progress-audit", "change-impact-plan", "test-selection-plan", "failure-triage", "evidence-pack", "regression"];
const casesToRun = selectedCase ? [selectedCase] : allCases;
assert.ok(casesToRun.every((item) => allCases.includes(item)), `unknown case ${selectedCase}`);

await mkdir(path.join(rootDir, ".tmp"), { recursive: true });

async function withPowerTools(fn) {
  const tmpRoot = await mkdtemp(path.join(rootDir, ".tmp", "power-tools-1-"));
  const workspace = path.join(tmpRoot, "workspace");
  const repo = path.join(workspace, "repo");
  await setupFixtureRepo(repo);
  const client = new Client({ name: "power-tools-1-test", version: "1.0.1" }, { capabilities: {} });
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

async function setupFixtureRepo(repo) {
  await mkdir(path.join(repo, "src", "components"), { recursive: true });
  await mkdir(path.join(repo, "tests"), { recursive: true });
  await mkdir(path.join(repo, "docs"), { recursive: true });
  await mkdir(path.join(repo, "scripts"), { recursive: true });
  await mkdir(path.join(repo, "public", "install"), { recursive: true });
  await mkdir(path.join(repo, "node_modules", "ignored"), { recursive: true });
  await mkdir(path.join(repo, "dist"), { recursive: true });
  await writeFile(path.join(repo, "package.json"), JSON.stringify({
    type: "module",
    scripts: {
      test: "node tests/app.test.js",
      "test:tools-power-tools-1-regression": "node scripts/test-tools-power-tools-1-regression.mjs",
      validate: "node --check src/app.js",
      build: "vite build",
      generate: "node scripts/generate-artifacts.mjs",
      deploy: "git push origin main"
    },
    dependencies: { "@modelcontextprotocol/sdk": "1.0.0", react: "1.0.0", vite: "1.0.0" }
  }, null, 2));
  await writeFile(path.join(repo, "src", "app.js"), "export function realFeature() { return 'implemented'; }\n// TODO: replace fixture note\n");
  await writeFile(path.join(repo, "src", "components", "Widget.jsx"), "export function Widget(){ return 'widget'; }\n");
  await writeFile(path.join(repo, "scripts", "vnem-tools-mcp-server.mjs"), "export function registerTool(name, fn) { return { name, fn }; }\n");
  await writeFile(path.join(repo, "scripts", "generate-artifacts.mjs"), "console.log('generate');\n");
  await writeFile(path.join(repo, "tests", "app.test.js"), "import { realFeature } from '../src/app.js';\nif (realFeature() !== 'implemented') throw new Error('bad feature');\n");
  await writeFile(path.join(repo, "docs", "handoff.md"), "# Handoff\nClaims live GitHub proof only with URL.\n");
  await writeFile(path.join(repo, "public", "install", "index.json"), "{\"generated\":true}\n");
  await writeFile(path.join(repo, "node_modules", "ignored", "noise.js"), "throw new Error('must not scan');\n");
  await writeFile(path.join(repo, "dist", "bundle.js"), "generated bundle token=should-not-leak\n");
  await writeFile(path.join(repo, ".env"), "TOKEN=should-not-leak\n");
  await writeFile(path.join(repo, "large.bin"), Buffer.alloc(2048, 1));
  await execFile("git", ["init"], { cwd: repo });
  await execFile("git", ["config", "user.email", "vnem-test@example.local"], { cwd: repo });
  await execFile("git", ["config", "user.name", "VNEM Test"], { cwd: repo });
  await execFile("git", ["remote", "add", "origin", "https://github.com/fixture/power.git"], { cwd: repo });
  await execFile("git", ["add", "package.json", "src", "scripts", "tests", "docs"], { cwd: repo });
  await execFile("git", ["commit", "-m", "initial"], { cwd: repo });
  await execFile("git", ["branch", "-M", "main"], { cwd: repo });
  await writeFile(path.join(repo, "src", "app.js"), "export function realFeature() { return 'implemented better'; }\n// TODO: replace fixture note\n");
  await writeFile(path.join(repo, "docs", "claim.md"), "# Claim\nThis docs-only claim is suspicious.\n");
}

await withPowerTools(async ({ client, repo }) => {
  const tools = new Set((await client.listTools()).tools.map((tool) => tool.name));
  for (const name of ["vnem_tools_repo_deep_map", "vnem_tools_next_action_ranker", "vnem_tools_no_placebo_progress_audit", "vnem_tools_change_impact_plan", "vnem_tools_test_selection_plan", "vnem_tools_failure_triage", "vnem_tools_evidence_pack"]) {
    assert.equal(tools.has(name), true, `missing ${name}`);
  }

  if (casesToRun.includes("repo-deep-map")) {
    const map = (await client.callTool({ name: "vnem_tools_repo_deep_map", arguments: { root: repo, max_files: 220, max_depth: 6 } })).structuredContent.repo_deep_map;
    assert.equal(map.operation_result, "reported");
    assert.ok(map.package_scripts.test.includes("test"));
    assert.ok(map.source_dirs.some((dir) => dir.includes("src")));
    assert.ok(map.test_dirs.some((dir) => dir.includes("tests")));
    assert.ok(map.config_files.includes("package.json"));
    assert.ok(map.docs_handoff_files.some((file) => file.includes("docs/handoff.md")));
    assert.ok(map.generated_artifact_dirs.includes("dist") || map.generated_artifact_dirs.includes("public/install"));
    assert.ok(map.likely_entrypoints.includes("package.json"));
    assert.ok(map.likely_tool_or_server_registries.some((file) => file.includes("vnem-tools-mcp-server.mjs")));
    assert.ok(map.git.branch === "main");
    assert.ok(map.git.dirty);
    assert.ok(map.changed_or_untracked_files.some((file) => /src\/app\.js|docs\/claim\.md/.test(file)));
    assert.ok(map.large_files.some((file) => file.path === "large.bin"));
    assert.ok(map.ignored_or_noise_dirs.some((item) => item.includes("node_modules") || item.includes(".git")));
    assert.doesNotMatch(JSON.stringify(map), /should-not-leak/);
    assert.equal(map.output_compact, true);
  }

  if (casesToRun.includes("next-action-ranker")) {
    const ranking = (await client.callTool({ name: "vnem_tools_next_action_ranker", arguments: { root: repo, user_goal: "implement real repo power tools", max_actions: 5 } })).structuredContent.next_action_ranker;
    assert.ok(ranking.actions.length >= 3);
    assert.equal(ranking.actions[0].should_do_now, true);
    assert.match(ranking.actions[0].action, /Review changed files|Fix the first|Run the smallest/i);
    assert.ok(ranking.actions.every((action) => Array.isArray(action.expected_proof_checks)));
    assert.ok(ranking.penalties_applied.some((item) => /docs-only/.test(item)));
    assert.doesNotMatch(ranking.actions[0].action, /docs-only/i);
  }

  if (casesToRun.includes("no-placebo-progress-audit")) {
    const audit = (await client.callTool({ name: "vnem_tools_no_placebo_progress_audit", arguments: { root: repo, changed_files: ["docs/claim.md", "public/install.tgz"], completed_summary: "Implemented live GitHub proof using mocked tests and planned capability text.", mocked_proof: ["mocked gh pr create"], live_proof: [] } })).structuredContent.no_placebo_progress_audit;
    assert.ok(audit.real_progress_score < 55);
    assert.ok(audit.placebo_risks.some((risk) => /docs-only|mocked-only|planned/i.test(risk)));
    assert.ok(audit.missing_proof.some((proof) => /GitHub|generation|proof/i.test(proof)));
    assert.match(audit.exact_next_correction, /source behavior|proof|implementation|generate/i);
  }

  if (casesToRun.includes("change-impact-plan")) {
    const impact = (await client.callTool({ name: "vnem_tools_change_impact_plan", arguments: { root: repo, changed_files: ["scripts/vnem-tools-mcp-server.mjs", "scripts/tools-readiness-report.mjs", "scripts/generate-artifacts.mjs", "public/install.tgz"] } })).structuredContent.change_impact_plan;
    assert.ok(impact.changed_areas.includes("tools_mcp"));
    assert.ok(impact.changed_areas.includes("tools_readiness"));
    assert.ok(impact.changed_areas.includes("generator"));
    assert.equal(impact.generation_required, true);
    assert.ok(impact.minimum_targeted_tests.some((cmd) => /tools:readiness|generate|install-pack|vnem-tools-mcp-server/.test(cmd)));
    assert.equal(impact.full_npm_test_justified, true);
    assert.ok(impact.what_not_to_run_yet.some((item) => /live GitHub/.test(item)));
  }

  if (casesToRun.includes("test-selection-plan")) {
    const plan = (await client.callTool({ name: "vnem_tools_test_selection_plan", arguments: { root: repo, user_goal: "local repo intelligence", changed_files: ["scripts/vnem-tools-mcp-server.mjs", "scripts/test-tools-power-tools-1-regression.mjs"] } })).structuredContent.test_selection_plan;
    assert.ok(plan.targeted_tests.some((cmd) => /power-tools-1/.test(cmd)));
    assert.equal(plan.full_npm_test_recommended, false);
    assert.ok(plan.avoid_over_validation.some((line) => /browser proof/.test(line)));
    assert.ok(plan.avoid_over_validation.some((line) => /live GitHub/.test(line)));
  }

  if (casesToRun.includes("failure-triage")) {
    const product = (await client.callTool({ name: "vnem_tools_failure_triage", arguments: { root: repo, command: "npm.cmd run test", stderr: "TypeError: Cannot read properties of undefined\nsrc/app.js:4\nfailed with exit code 1" } })).structuredContent.failure_triage;
    assert.equal(product.classification, "product_bug");
    assert.match(product.exact_file_or_function_to_inspect, /src\/app\.js/);
    const auth = (await client.callTool({ name: "vnem_tools_failure_triage", arguments: { root: repo, command: "gh auth status", stderr: "gh auth status failed: not authenticated" } })).structuredContent.failure_triage;
    assert.equal(auth.classification, "auth_permission_issue");
    const generated = (await client.callTool({ name: "vnem_tools_failure_triage", arguments: { root: repo, command: "npm.cmd run test:install-pack", stderr: "public/install.tgz snapshot stale generated artifact mismatch" } })).structuredContent.failure_triage;
    assert.equal(generated.classification, "generated_artifact_staleness");
    const windows = (await client.callTool({ name: "vnem_tools_failure_triage", arguments: { root: repo, command: "npm.cmd run test:tools-project-actions", stderr: "EBUSY: resource busy or locked, rmdir '.tmp/project'" } })).structuredContent.failure_triage;
    assert.equal(windows.classification, "windows_path_process_cleanup_issue");
  }

  if (casesToRun.includes("evidence-pack")) {
    const pack = (await client.callTool({ name: "vnem_tools_evidence_pack", arguments: { root: repo, commands_run: ["npm.cmd run test:tools-power-tools-1-regression"], tests_passed: ["test:tools-power-tools-1-regression"], real_behavior_added: ["repo deep map and next action ranker"], mocked_proof: ["mocked gh command builder"], blocked_proof: ["live GitHub PR not attempted"], remaining_risk: ["heuristic ranking is local only"], commit_sha: "abc123", commit_message: "feat(tools): add power repo intelligence workflows" } })).structuredContent.evidence_pack;
    assert.equal(pack.proof.live.length, 0);
    assert.ok(pack.proof.mocked_or_local.length >= 1);
    assert.ok(pack.not_safe_to_claim.some((claim) => /Live external/.test(claim)));
    assert.ok(pack.safe_to_claim.some((claim) => /Real behavior added/.test(claim)));
    assert.equal(pack.output_compact, true);
    assert.ok(pack.evidence_log_id);
  }

  if (casesToRun.includes("regression")) {
    const manifest = (await client.callTool({ name: "vnem_tools_manifest", arguments: { capability_group: "repo_power" } })).structuredContent.manifest;
    assert.equal(manifest.tools.length, 9);
    assert.ok(manifest.tools.some((tool) => tool.name === "vnem_tools_local_session_recovery"));
    assert.ok(manifest.tools.some((tool) => tool.name === "vnem_tools_repo_workflow_orchestrator"));
    assert.ok(manifest.tools.every((tool) => tool.reliability_level === "local_tested"));
    const status = (await client.callTool({ name: "vnem_tools_status", arguments: {} })).structuredContent.tools_status;
    assert.ok(status.repo_power_policy.no_placebo_detection);
    const repoIntel = (await client.callTool({ name: "vnem_tools_repo_intelligence_report", arguments: { root: repo, simulate_github: true } })).structuredContent.repo_intelligence_report;
    assert.ok(repoIntel.deep_repo_map_summary);
    assert.ok(repoIntel.ranked_next_actions.length >= 1);
    const truth = (await client.callTool({ name: "vnem_tools_task_progress_truth_check", arguments: { changed_files: ["scripts/vnem-tools-mcp-server.mjs"], tested: ["npm test"] } })).structuredContent.task_progress_truth_check;
    assert.ok(truth.repo_power_followup_tools.includes("vnem_tools_no_placebo_progress_audit"));
  }
});

console.log(`vnem Tools POWER-TOOLS-1 ${selectedCase || "regression"} tests passed`);
