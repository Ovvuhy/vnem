#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { assertCommand, assertNoCommand, commandLines, readCommands, withGithubMockTools } from "./test-tools-github-autonomy-2-helpers.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const mockSha = "0123456789abcdef0123456789abcdef01234567";
const benchmarkArg = process.argv.find((arg) => arg.startsWith("--benchmark-output="));
const benchmarkOutput = benchmarkArg ? path.resolve(rootDir, benchmarkArg.slice("--benchmark-output=".length)) : null;

await withGithubMockTools({}, async ({ client, workspace, commandLog }) => {
  await mkdir(path.join(workspace, "public", "api"), { recursive: true });
  await writeFile(path.join(workspace, "public", "api", "index.json"), `${JSON.stringify({ schema_version: 1, version: "1.0.1", entries: [{ id: "fixture" }] }, null, 2)}\n`);

  const listed = await client.listTools();
  const names = new Set(listed.tools.map((tool) => tool.name));
  const required = [
    "vnem_tools_github_diff_review",
    "vnem_tools_github_review_threads",
    "vnem_tools_github_remote_proof",
    "vnem_tools_github_actions_run_inspect",
    "vnem_tools_github_release_verify",
    "vnem_tools_github_public_surface_audit"
  ];
  for (const name of required) assert.ok(names.has(name), `missing Phase 12 tool ${name}`);

  const diff = (await literalCall(client, "vnem_tools_github_diff_review", { root: workspace, pr: 7 })).structuredContent.github_diff_review;
  assert.equal(diff.operation_result, "reported");
  assert.equal(diff.source, "live_github_pr");
  assert.equal(diff.summary.changed_files, 3);
  assert.equal(diff.summary.listed_files, 3);
  assert.equal(diff.summary.file_list_truncated, false);
  assert.equal(diff.scans.hidden_or_bidi_unicode_findings, 1);
  assert.equal(diff.claim_status, "manual_review_required");
  assert.ok(diff.findings.some((item) => item.code === "hidden_or_bidi_unicode" && item.path === "src/app.js"));
  assert.ok(diff.must_not_claim.some((item) => /semantically correct/.test(item)));

  const threads = (await literalCall(client, "vnem_tools_github_review_threads", { root: workspace, pr: 7 })).structuredContent.github_review_threads;
  assert.equal(threads.operation_result, "reported");
  assert.equal(threads.summary.total_returned, 2);
  assert.equal(threads.summary.unresolved, 1);
  assert.equal(threads.threads.length, 1);
  assert.equal(threads.threads[0].comments[0].author, "reviewer");
  assert.equal(threads.mutation_performed, false);

  const remote = (await literalCall(client, "vnem_tools_github_remote_proof", { root: workspace, branch: "feat/autonomy-2", pr: 7, expected_sha: mockSha })).structuredContent.github_remote_proof;
  assert.equal(remote.operation_result, "reported");
  assert.equal(remote.verified, true, JSON.stringify(remote.blockers));
  assert.equal(remote.local_head_sha, mockSha);
  assert.equal(remote.remote_branch_sha, mockSha);
  assert.equal(remote.pr.head_sha, mockSha);
  assert.equal(remote.actions.exact_head_runs.length, 1);
  assert.equal(remote.branch_protection.configured_as_protected, true);
  assert.equal(remote.branch_protection.live.protected, true);
  assert.match(remote.repair_or_rollback_guidance, /corrective commit|force-push/i);

  const run = (await literalCall(client, "vnem_tools_github_actions_run_inspect", { root: workspace, run_id: 101, log_mode: "failed" })).structuredContent.github_actions_run;
  assert.equal(run.operation_result, "reported");
  assert.equal(run.run.head_sha, mockSha);
  assert.equal(run.summary.jobs, 1);
  assert.equal(run.summary.steps, 2);
  assert.equal(run.summary.failed_steps, 1);
  assert.ok(run.logs.important_lines.some((line) => /Cannot find module/.test(line)));

  const release = (await literalCall(client, "vnem_tools_github_release_verify", { root: workspace, tag: "v1.0.0", expected_sha: mockSha })).structuredContent.github_release_verification;
  assert.equal(release.operation_result, "reported");
  assert.equal(release.verified, true);
  assert.equal(release.remote_tag.sha, mockSha);
  assert.equal(release.release.draft, true);
  assert.equal(release.release.assets[0].name, "fixture.tgz");

  const publicAudit = (await literalCall(client, "vnem_tools_github_public_surface_audit", { root: workspace })).structuredContent.github_public_surface_audit;
  assert.equal(publicAudit.operation_result, "reported");
  assert.equal(publicAudit.content_modified, false);
  assert.equal(publicAudit.package.version, null);
  assert.ok(publicAudit.findings.some((item) => item.code === "core_product_missing"));
  assert.ok(publicAudit.findings.some((item) => item.code === "tools_product_missing"));
  assert.ok(publicAudit.simplification_suggestions.some((item) => /setup\/quick-start/.test(item)));

  const dirtyBranch = (await literalCall(client, "vnem_tools_github_branch_create", { root: workspace, branch: "feat/dirty-blocked", dry_run: false })).structuredContent.github_branch_create;
  assert.equal(dirtyBranch.operation_result, "blocked");
  assert.match(dirtyBranch.blocked_reason, /worktree is dirty/);

  const lines = commandLines(await readCommands(commandLog));
  for (const [pattern, message] of [
    [/^gh pr view 7 --json/, "diff review reads exact PR metadata"],
    [/^gh pr diff 7 --patch$/, "diff review reads bounded PR patch"],
    [/^gh api graphql /, "review-thread inspection uses GraphQL"],
    [/^git ls-remote --heads origin refs\/heads\/feat\/autonomy-2$/, "remote proof reads exact branch ref"],
    [/^gh run list --branch feat\/autonomy-2/, "remote proof reads branch Actions runs"],
    [/^gh api --method GET repos\/fixture\/local\/branches\/main\/protection$/, "remote proof checks base protection"],
    [/^gh run view 101 --json/, "Actions inspection reads jobs and steps"],
    [/^gh run view 101 --log-failed$/, "Actions inspection reads bounded failed logs"],
    [/^gh release view v1\.0\.0 --json/, "release proof reads exact release"],
    [/^git ls-remote origin refs\/tags\/v1\.0\.0/, "release proof reads exact remote tag"]
  ]) assertCommand(lines, pattern, message);
  assertNoCommand(lines, /^(git push|gh pr merge|gh run rerun|gh release create)/, "Phase 12 read/proof tools must not mutate GitHub");
});

await withGithubMockTools({ VNEM_TOOLS_MOCK_PR_DIFF_TOO_LARGE: "1", VNEM_TOOLS_MOCK_PR_FILES_TRUNCATED: "1" }, async ({ client, workspace, commandLog }) => {
  const diff = (await literalCall(client, "vnem_tools_github_diff_review", { root: workspace, pr: 7 })).structuredContent.github_diff_review;
  assert.equal(diff.operation_result, "reported");
  assert.equal(diff.source, "live_github_pr_exact_sha_local_patch_fallback");
  assert.equal(diff.patch_transport, "github_patch_too_large_exact_sha_local_git_fallback");
  assert.equal(diff.summary.changed_files, 5);
  assert.equal(diff.summary.listed_files, 3);
  assert.equal(diff.summary.file_list_truncated, true);
  assert.equal(diff.scans.git_diff_check, "clean");
  assert.ok(diff.must_not_claim.some((item) => /complete changed-file list/.test(item)));
  const lines = commandLines(await readCommands(commandLog));
  assertCommand(lines, /^git cat-file -e [0-9a-f]{40}\^\{commit\}$/, "large PR fallback verifies exact PR commit objects");
  assertCommand(lines, /^git diff --no-ext-diff --unified=3 [0-9a-f]{40}\.\.\.[0-9a-f]{40}$/, "large PR fallback scans the exact PR SHA range");
  assertNoCommand(lines, /^(git fetch|git push|gh pr merge)/, "large PR fallback remains read-only");
});

await withGithubMockTools({ VNEM_TOOLS_MOCK_STAGED_FILES: "unrelated.txt" }, async ({ client, workspace, commandLog }) => {
  const result = (await literalCall(client, "vnem_tools_github_commit_push", { root: workspace, files: ["README.md"], message: "docs: selected only", branch: "feat/autonomy-2", dry_run: false })).structuredContent.github_commit_push;
  assert.equal(result.operation_result, "blocked");
  assert.match(result.blocked_reason, /unrelated files are already staged/);
  assert.deepEqual(result.unrelated_pre_staged_files, ["unrelated.txt"]);
  const lines = commandLines(await readCommands(commandLog));
  assertNoCommand(lines, /^git (add|commit|push)/, "pre-staged isolation must block before index or remote mutation");
});

await withGithubMockTools({}, async ({ client, workspace, commandLog }) => {
  const secret = ["github", "pat", "A".repeat(24)].join("_");
  await writeFile(path.join(workspace, "src", "leak.txt"), `credential=${secret}\n`);
  const result = (await literalCall(client, "vnem_tools_github_commit_push", { root: workspace, files: ["src/leak.txt"], message: "test: secret refusal", branch: "feat/autonomy-2", dry_run: true })).structuredContent.github_commit_push;
  assert.equal(result.operation_result, "blocked");
  assert.match(result.blocked_reason, /Secret-like content blocked/);
  assert.equal(result.content_returned, false);
  const lines = commandLines(await readCommands(commandLog));
  assertNoCommand(lines, /^git (add|commit|push)/, "secret-content refusal must happen before Git mutation");
});

if (benchmarkOutput) await runLiveBenchmark(benchmarkOutput);
console.log("vnem Tools GIGA GitHub-development MCP tests passed");

async function literalCall(client, name, args) {
  if (name === "vnem_tools_github_diff_review") return await client.callTool({ name: "vnem_tools_github_diff_review", arguments: args });
  if (name === "vnem_tools_github_review_threads") return await client.callTool({ name: "vnem_tools_github_review_threads", arguments: args });
  if (name === "vnem_tools_github_remote_proof") return await client.callTool({ name: "vnem_tools_github_remote_proof", arguments: args });
  if (name === "vnem_tools_github_actions_run_inspect") return await client.callTool({ name: "vnem_tools_github_actions_run_inspect", arguments: args });
  if (name === "vnem_tools_github_release_verify") return await client.callTool({ name: "vnem_tools_github_release_verify", arguments: args });
  if (name === "vnem_tools_github_public_surface_audit") return await client.callTool({ name: "vnem_tools_github_public_surface_audit", arguments: args });
  if (name === "vnem_tools_github_branch_create") return await client.callTool({ name: "vnem_tools_github_branch_create", arguments: args });
  if (name === "vnem_tools_github_commit_push") return await client.callTool({ name: "vnem_tools_github_commit_push", arguments: args });
  throw new Error(`Unexpected Phase 12 tool ${name}`);
}

async function runLiveBenchmark(outputPath) {
  const client = new Client({ name: "vnem-tools-giga-github-live", version: "1.0.1" }, { capabilities: {} });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(scriptDir, "vnem-tools-mcp-server.mjs")],
    cwd: rootDir,
    env: { ...process.env, VNEM_TOOLS_ALLOWED_ROOTS: rootDir, VNEM_TOOLS_EVIDENCE_ROOT: path.join(rootDir, ".tmp", "github-development-live"), VNEM_TOOLS_GITHUB_PROFILE: "maintainer", VNEM_TOOLS_GITHUB_ALLOWED_REPOS: "Ovvuhy/vnem" }
  });
  const startedAt = performance.now();
  const timings = [];
  const call = async (name, args) => {
    const started = performance.now();
    const response = await literalCall(client, name, args);
    timings.push({ tool: name, duration_ms: Number((performance.now() - started).toFixed(2)), status: response.isError ? "error" : "ok" });
    if (response.isError) throw new Error(`${name} failed: ${JSON.stringify(response.structuredContent)}`);
    return response.structuredContent;
  };
  try {
    await client.connect(transport);
    const remote = (await call("vnem_tools_github_remote_proof", { root: rootDir, branch: "feat/vnem-giga-evolution-1", pr: 15 })).github_remote_proof;
    const diff = (await call("vnem_tools_github_diff_review", { root: rootDir, pr: 15, max_bytes: 1048576 })).github_diff_review;
    assert.equal(diff.operation_result, "reported", JSON.stringify(diff));
    const threads = (await call("vnem_tools_github_review_threads", { root: rootDir, pr: 15, limit: 50 })).github_review_threads;
    const runId = remote.actions.exact_head_runs[0]?.databaseId;
    assert.ok(runId, "live remote proof did not return an exact-head Actions run");
    const actions = (await call("vnem_tools_github_actions_run_inspect", { root: rootDir, run_id: runId, log_mode: "failed" })).github_actions_run;
    const release = (await call("vnem_tools_github_release_verify", { root: rootDir, tag: "vnem-phase12-no-release" })).github_release_verification;
    const publicAudit = (await call("vnem_tools_github_public_surface_audit", { root: rootDir })).github_public_surface_audit;
    const benchmark = {
      schema_version: 1,
      phase: 12,
      benchmark_type: "actual_stdio_mcp_live_github_read_proof",
      captured_at: new Date().toISOString(),
      total_duration_ms: Number((performance.now() - startedAt).toFixed(2)),
      repo: remote.repo,
      branch: remote.branch,
      local_head_sha: remote.local_head_sha,
      remote_branch_sha: remote.remote_branch_sha,
      pr_head_sha: remote.pr?.head_sha || null,
      exact_sha_verified: remote.verified,
      actions_run: { id: actions.run.id, url: actions.run.url, status: actions.run.status, conclusion: actions.run.conclusion, jobs: actions.summary.jobs, steps: actions.summary.steps },
      diff: { source: diff.source, patch_transport: diff.patch_transport, changed_files: diff.summary.changed_files, listed_files: diff.summary.listed_files, file_list_truncated: diff.summary.file_list_truncated, findings: diff.summary.findings, high_severity_findings: diff.summary.high_severity_findings, patch_truncated: diff.scans.patch_truncated, claim_status: diff.claim_status },
      review_threads: threads.summary,
      branch_protection: remote.branch_protection,
      release_absence_proof: { operation_result: release.operation_result, verified: release.verified, must_not_claim: release.must_not_claim },
      public_surface: { consistency_status: publicAudit.consistency_status, findings: publicAudit.findings.length, suggestions: publicAudit.simplification_suggestions.length },
      tool_calls: timings,
      mutation_performed: false,
      limitations: ["Live proof is bounded to one repository, PR, Actions run, review-thread page, and absent release tag.", "Diff scans do not prove semantic correctness and report truncation honestly.", "No branch, PR, review, Actions, release, settings, or repository mutation was performed."]
    };
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(benchmark, null, 2)}\n`);
  } finally {
    await client.close().catch(() => {});
  }
}
