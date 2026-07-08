import assert from "node:assert/strict";
import { assertCommand, commandLines, readCommands, withGithubMockTools } from "./test-tools-github-autonomy-2-helpers.mjs";

await withGithubMockTools({}, async ({ client, workspace, commandLog }) => {
  const status = await client.callTool({ name: "vnem_tools_github_status", arguments: { root: workspace } });
  assert.equal(status.structuredContent.github_status.operation_result, "reported");
  const inspect = await client.callTool({ name: "vnem_tools_github_repo_inspect", arguments: { root: workspace } });
  assert.equal(inspect.structuredContent.github_repo_inspect.operation_result, "reported");
  const pr = await client.callTool({ name: "vnem_tools_github_pr_create", arguments: { root: workspace, title: "feat: mock", body: "body", base: "main", head: "feat/mock", dry_run: false } });
  assert.equal(pr.structuredContent.github_pr_create.operation_result, "completed");
  const issue = await client.callTool({ name: "vnem_tools_github_issue_create", arguments: { root: workspace, title: "bug: mock", body: "body", dry_run: false } });
  assert.equal(issue.structuredContent.github_issue_create.operation_result, "completed");
  const label = await client.callTool({ name: "vnem_tools_github_labels_manage", arguments: { root: workspace, name: "autonomy-2", color: "0e8a16", dry_run: false } });
  assert.equal(label.structuredContent.github_labels_manage.operation_result, "completed");
  const actions = await client.callTool({ name: "vnem_tools_github_actions_status", arguments: { root: workspace, limit: 5 } });
  assert.equal(actions.structuredContent.github_actions_status.operation_result, "reported");
  const rerun = await client.callTool({ name: "vnem_tools_github_actions_rerun", arguments: { root: workspace, run_id: "101", dry_run: false } });
  assert.equal(rerun.structuredContent.github_actions_rerun.operation_result, "completed");
  const triage = await client.callTool({ name: "vnem_tools_github_ci_failure_triage", arguments: { root: workspace, run_id: "101" } });
  assert.match(triage.structuredContent.ci_failure_triage.likely_cause, /Cannot find module|Error/i);
  const release = await client.callTool({ name: "vnem_tools_github_release_create", arguments: { root: workspace, tag: "v0.0.0-autonomy2", title: "Autonomy 2", notes: "mock", dry_run: false } });
  assert.equal(release.structuredContent.github_release_create.operation_result, "completed");
  const lines = commandLines(await readCommands(commandLog));
  for (const [pattern, message] of [
    [/^gh --version$/, "status checks gh version"],
    [/^gh auth status$/, "status checks gh auth"],
    [/^git --version$/, "status checks git version"],
    [/^git remote -v$/, "status inspects remotes"],
    [/^git branch --show-current$/, "status inspects branch"],
    [/^git rev-parse HEAD$/, "status inspects HEAD"],
    [/^git status --short$/, "status inspects worktree"],
    [/^git log --oneline -10/, "status inspects recent commits"],
    [/^gh repo view/, "repo inspect uses gh repo view"],
    [/^gh pr list/, "repo inspect uses gh pr list"],
    [/^gh issue list/, "repo inspect uses gh issue list"],
    [/^gh run list/, "repo inspect/actions use gh run list"],
    [/^gh pr create/, "PR create uses gh pr create"],
    [/^gh issue create/, "issue create uses gh issue create"],
    [/^gh label create/, "label create uses gh label create"],
    [/^gh run rerun 101 --failed$/, "Actions rerun uses gh run rerun"],
    [/^gh run view 101 --log/, "CI triage uses gh run view logs"],
    [/^gh release create v0\.0\.0-autonomy2 .*--draft/, "release create uses draft gh release create"]
  ]) assertCommand(lines, pattern, message);
});
console.log("vnem Tools GitHub real execution path tests passed");
