import assert from "node:assert/strict";
import { withGithubMockTools } from "./test-tools-github-autonomy-2-helpers.mjs";

await withGithubMockTools({ VNEM_TOOLS_PERMISSION_PROFILE: "approved-github" }, async ({ client, workspace }) => {
  const catalog = await client.callTool({ name: "vnem_tools_reliability_catalog", arguments: { capability_group: "github_autonomy" } });
  const catalogText = JSON.stringify(catalog.structuredContent.reliability_catalog);
  assert.match(catalogText, /real gh\/git command paths|command-backed/i);
  assert.doesNotMatch(catalogText, /GitHub mutation[^.]{0,80}not implemented/i);
  const recovery = await client.callTool({ name: "vnem_tools_action_recovery_plan", arguments: { tool_name: "vnem_tools_github_pr_create", stderr: "gh auth status failed: not authenticated" } });
  assert.ok(recovery.structuredContent.action_recovery_plan.exact_next_steps.some((step) => /gh auth login/.test(step)));
  assert.ok(recovery.structuredContent.action_recovery_plan.exact_next_steps.some((step) => /gh auth setup-git/.test(step)));
  const high = await client.callTool({ name: "vnem_tools_high_power_action_review", arguments: { tool_name: "vnem_tools_github_commit_push", operation: "feature branch push", target: "fixture/local", expected_effect: "push branch and open PR", approval_phrase: "approved" } });
  assert.equal(high.structuredContent.high_power_action_review.action_allowed, true);
  const gaps = await client.callTool({ name: "vnem_tools_capability_gap_report", arguments: {} });
  const gapsText = JSON.stringify(gaps.structuredContent.capability_gap_report);
  assert.match(gapsText, /profile-gated repo inspection, feature branches, commits, feature pushes, PRs, issues, labels, CI status\/rerun, triage, and draft releases/i);
  assert.doesNotMatch(gapsText, /GitHub mutation as fully missing|remote GitHub mutation.*not implemented/i);
  const permission = await client.callTool({ name: "vnem_tools_permission_status", arguments: {} });
  const permText = JSON.stringify(permission.structuredContent.permission_status);
  assert.match(permText, /github_autonomy|feature_branch_push_supported|command-backed/i);
  const quality = await client.callTool({ name: "vnem_tools_pr_quality_gate", arguments: { root: workspace, test_commands_run: ["npm test"], ci_status: "reported", pr_title: "feat: real github", pr_body: "Summary and testing evidence included." } });
  assert.ok(Object.hasOwn(quality.structuredContent.pr_quality_gate, "github_execution_expectation"));
  const truth = await client.callTool({ name: "vnem_tools_task_progress_truth_check", arguments: { goal: "real GitHub tools", proven: ["gh pr create command executed"], tested: ["mocked runner test"], changed_files: ["scripts/vnem-tools-mcp-server.mjs"] } });
  assert.match(JSON.stringify(truth.structuredContent.task_progress_truth_check), /exact GitHub URL|live validation/i);
});
console.log("vnem Tools AUTONOMY-2 regression tests passed");
