import assert from "node:assert/strict";
import { assertCommand, assertNoCommand, commandLines, readCommands, withGithubMockTools } from "./test-tools-github-autonomy-2-helpers.mjs";

await withGithubMockTools({}, async ({ client, workspace, commandLog }) => {
  const branch = await client.callTool({ name: "vnem_tools_github_branch_create", arguments: { root: workspace, branch: "feat/autonomy-2", dry_run: false } });
  assert.equal(branch.structuredContent.github_branch_create.operation_result, "created");
  const pushed = await client.callTool({ name: "vnem_tools_github_commit_push", arguments: { root: workspace, files: ["README.md", "src/app.js"], message: "feat: selected files only", branch: "feat/autonomy-2", dry_run: false } });
  assert.equal(pushed.structuredContent.github_commit_push.operation_result, "pushed");
  assert.deepEqual(pushed.structuredContent.github_commit_push.files_staged, ["README.md", "src/app.js"]);
  const pr = await client.callTool({ name: "vnem_tools_github_pr_create", arguments: { root: workspace, title: "feat: selected files", body: "body", base: "main", head: "feat/autonomy-2", draft: true, dry_run: false } });
  assert.equal(pr.structuredContent.github_pr_create.operation_result, "completed");
  const issue = await client.callTool({ name: "vnem_tools_github_issue_create", arguments: { root: workspace, title: "bug: redaction", body: "Authorization: Bearer bearer-secret-value api_key=abc123 SECRET_TOKEN_VALUE github_pat_ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890", dry_run: false } });
  assert.equal(issue.structuredContent.github_issue_create.operation_result, "completed");
  const commands = await readCommands(commandLog);
  const lines = commandLines(commands);
  assertCommand(lines, /^git (switch -c|checkout -b) feat\/autonomy-2/, "branch creation uses git switch/checkout");
  assertCommand(lines, /^git add -- README\.md src\/app\.js$/, "commit push stages selected files only");
  assertNoCommand(lines, /^git add -- \.$|^git add -A|^git add \.($| )/, "commit push must not stage broad paths");
  assertCommand(lines, /^git commit -m feat: selected files only$/, "commit push commits with selected message");
  assertCommand(lines, /^git push origin feat\/autonomy-2$/, "commit push pushes feature branch");
  assertCommand(lines, /^gh pr create .*--base main --head feat\/autonomy-2 --draft$/, "PR create builds gh pr create command");
  for (const entry of commands) {
    assert.ok(entry.command_classification?.access_type, "mocked command log records read/mutation classification");
    assert.equal(entry.env_safety_summary?.secret_values_recorded, false);
    assert.equal(entry.simulated_result?.ok !== undefined, true, "mocked command log records compact simulated result");
  }
  const commandLogText = JSON.stringify(commands);
  assert.doesNotMatch(commandLogText, /bearer-secret-value|abc123|SECRET_TOKEN_VALUE|github_pat_ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890/);
  const asText = JSON.stringify(pushed.structuredContent.github_commit_push);
  assert.doesNotMatch(asText, /ghp_[A-Za-z0-9_]{20,}|SECRET_TOKEN_VALUE/);
});
console.log("vnem Tools GitHub command builder tests passed");
