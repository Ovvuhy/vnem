import assert from "node:assert/strict";
import { assertNoCommand, commandLines, readCommands, withGithubMockTools } from "./test-tools-github-autonomy-2-helpers.mjs";

const secretMarker = "ghp_1234567890abcdefghijklmnopqrstuvwxyz";

await withGithubMockTools({}, async ({ client, workspace, commandLog }) => {
  const pr = await client.callTool({
    name: "vnem_tools_github_pr_update",
    arguments: { root: workspace, pr: 17, title: "Focused dry run", comment: `proof ${secretMarker}`, dry_run: true }
  });
  assert.equal(pr.isError, undefined, JSON.stringify(pr));
  assert.equal(pr.structuredContent.github_pr_update.operation_result, "planned");
  assert.equal(pr.structuredContent.github_pr_update.claim_status, "planned");
  assert.match(pr.structuredContent.github_pr_update.proof_summary, /No GitHub mutation performed/);
  assert.doesNotMatch(JSON.stringify(pr.structuredContent), new RegExp(secretMarker));

  const issueUpdate = await client.callTool({
    name: "vnem_tools_github_issue_update",
    arguments: { root: workspace, issue: 23, title: "Bounded issue edit", state: "closed", add_labels: ["triaged"], dry_run: true }
  });
  assert.equal(issueUpdate.structuredContent.github_issue_update.operation_result, "planned");
  assert.ok(issueUpdate.structuredContent.github_issue_update.gh_args_redacted.includes("--close"));

  const issueComment = await client.callTool({
    name: "vnem_tools_github_issue_comment",
    arguments: { root: workspace, issue: 23, body: "Focused dry-run comment", dry_run: true }
  });
  assert.equal(issueComment.structuredContent.github_issue_comment.operation_result, "planned");
  assert.equal(issueComment.structuredContent.github_issue_comment.claim_status, "planned");

  const releasePlan = await client.callTool({
    name: "vnem_tools_github_release_plan",
    arguments: { tag: "v1.2.3", title: "Fixture release", draft: true }
  });
  assert.equal(releasePlan.structuredContent.github_release_plan.operation_result, "planned");
  assert.equal(releasePlan.structuredContent.github_release_plan.draft, true);

  const settingsPlan = await client.callTool({
    name: "vnem_tools_github_repo_settings_plan",
    arguments: { settings: { description: "fixture" } }
  });
  assert.equal(settingsPlan.structuredContent.github_repo_settings_plan.operation_result, "planned");
  assert.equal(settingsPlan.structuredContent.github_repo_settings_plan.allow_settings_mutation, false);
  assert.equal(settingsPlan.structuredContent.github_repo_settings_plan.config_knob_to_change, "VNEM_TOOLS_GITHUB_ALLOW_SETTINGS_MUTATION");

  const settingsApply = await client.callTool({
    name: "vnem_tools_github_repo_settings_apply",
    arguments: { root: workspace, description: "fixture", dry_run: true }
  });
  assert.equal(settingsApply.structuredContent.github_repo_settings_apply.operation_result, "blocked");
  assert.equal(settingsApply.structuredContent.github_repo_settings_apply.config_knob_to_change, "VNEM_TOOLS_GITHUB_ALLOW_SETTINGS_MUTATION");

  const lines = commandLines(await readCommands(commandLog));
  for (const pattern of [/^gh pr (edit|comment)/, /^gh issue (edit|comment)/, /^gh repo edit/]) {
    assertNoCommand(lines, pattern, `dry-run/config-blocked path must not cross remote mutation boundary: ${pattern}`);
  }
});

await withGithubMockTools({ VNEM_TOOLS_GITHUB_PROFILE: "read" }, async ({ client, workspace, commandLog }) => {
  const pr = await client.callTool({
    name: "vnem_tools_github_pr_update",
    arguments: { root: workspace, pr: 17, title: "Blocked by profile", dry_run: true }
  });
  assert.equal(pr.structuredContent.github_pr_update.operation_result, "blocked");
  assert.match(pr.structuredContent.github_pr_update.blocked_reason, /profile/i);
  assertNoCommand(commandLines(await readCommands(commandLog)), /^gh pr edit/, "read profile must block PR mutation before gh execution");
});

await withGithubMockTools({ VNEM_TOOLS_GITHUB_ALLOW_SETTINGS_MUTATION: "1", VNEM_TOOLS_GITHUB_PROFILE: "owner" }, async ({ client, workspace, commandLog }) => {
  const settingsApply = await client.callTool({
    name: "vnem_tools_github_repo_settings_apply",
    arguments: { root: workspace, description: "reviewed fixture", dry_run: true }
  });
  assert.equal(settingsApply.structuredContent.github_repo_settings_apply.operation_result, "planned");
  assert.equal(settingsApply.structuredContent.github_repo_settings_apply.claim_status, "planned");
  assertNoCommand(commandLines(await readCommands(commandLog)), /^gh repo edit/, "enabled settings dry-run must still not call gh repo edit");
});

console.log("VNEM Tools final GitHub behavior coverage passed: six exact tools, profile/config gates, redaction, dry-run evidence, and remote boundary");
