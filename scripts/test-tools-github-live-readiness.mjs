import assert from "node:assert/strict";
import { assertCommand, commandLines, readCommands, withGithubMockTools } from "./test-tools-github-autonomy-2-helpers.mjs";

await withGithubMockTools({ VNEM_TOOLS_MOCK_GH_AUTH: "missing" }, async ({ client, workspace, commandLog }) => {
  const status = await client.callTool({ name: "vnem_tools_github_status", arguments: { root: workspace } });
  const s = status.structuredContent.github_status;
  assert.equal(s.gh_available, true);
  assert.equal(s.gh_auth_status, "not_authenticated_or_unavailable");
  assert.ok(s.blocked_by_config_or_profile.includes("gh_not_authenticated_or_token_absent"));
  assert.deepEqual(s.auth_fix_commands, ["gh auth login", "gh auth setup-git"]);
  const pr = await client.callTool({ name: "vnem_tools_github_pr_create", arguments: { root: workspace, title: "feat: auth blocked", body: "body", base: "main", head: "feat/auth", dry_run: false } });
  const p = pr.structuredContent.github_pr_create;
  assert.equal(p.operation_result, "blocked");
  assert.match(p.blocked_reason, /gh auth/i);
  assert.deepEqual(p.auth_fix_commands, ["gh auth login", "gh auth setup-git"]);
  const lines = commandLines(await readCommands(commandLog));
  assertCommand(lines, /^gh auth status$/, "auth readiness runs gh auth status");
});
console.log("vnem Tools GitHub live readiness tests passed");
