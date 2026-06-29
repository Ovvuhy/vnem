#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
await mkdir(path.join(rootDir, ".tmp"), { recursive: true });
const tmpRoot = await mkdtemp(path.join(rootDir, ".tmp", "tools-permission-profiles-"));
const projectDir = path.join(tmpRoot, "project");
const outsideDir = path.join(tmpRoot, "outside");
await mkdir(path.join(projectDir, "src"), { recursive: true });
await mkdir(outsideDir, { recursive: true });
await writeFile(path.join(projectDir, "package.json"), JSON.stringify({ type: "module", scripts: { test: "node src/test.js", build: "node src/build.js", dev: "node src/dev.js", install: "echo install" } }, null, 2));
await writeFile(path.join(projectDir, "src", "app.txt"), "old\n", "utf8");
await writeFile(path.join(projectDir, "src", "test.js"), "console.log('ok')\n", "utf8");
await writeFile(path.join(projectDir, "src", "build.js"), "console.log('build')\n", "utf8");
await writeFile(path.join(projectDir, "src", "dev.js"), "console.log('dev')\n", "utf8");

async function withClient(env, fn) {
  const client = new Client({ name: "tools-permission-profiles-test", version: "1.0.1" }, { capabilities: {} });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(scriptDir, "vnem-tools-mcp-server.mjs")],
    cwd: rootDir,
    env: { ...process.env, VNEM_WORKSPACE_ROOT: projectDir, VNEM_TOOLS_ALLOWED_ROOTS: projectDir, VNEM_TOOLS_EVIDENCE_ROOT: path.join(projectDir, ".vnem", "tool-runs"), VNEM_TOOLS_ALLOW_LOCALHOST: "1", ...env },
    stderr: "pipe"
  });
  await client.connect(transport);
  try { return await fn(client); }
  finally { await client.close().catch(() => {}); }
}

const requiredProfiles = ["safe-readonly", "safe-local-dev", "approved-writes", "approved-installs", "approved-github", "creator-power", "dangerous-disabled"];

try {
  await withClient({}, async (client) => {
    const toolNames = new Set((await client.listTools()).tools.map((tool) => tool.name));
    for (const name of ["vnem_tools_permission_profiles", "vnem_tools_permission_status", "vnem_tools_action_policy_preview", "vnem_tools_trust_boundary_classify"]) assert.equal(toolNames.has(name), true, `missing ${name}`);

    const profiles = await client.callTool({ name: "vnem_tools_permission_profiles", arguments: {} });
    assert.equal(profiles.isError, undefined);
    const profileNames = profiles.structuredContent?.permission_profiles?.profiles?.map((p) => p.profile_name) || [];
    for (const name of requiredProfiles) assert.ok(profileNames.includes(name), `profile missing ${name}`);
    assert.equal(profiles.structuredContent?.permission_profiles?.default_profile, "safe-readonly");

    const status = await client.callTool({ name: "vnem_tools_permission_status", arguments: {} });
    assert.equal(status.isError, undefined);
    assert.equal(status.structuredContent?.permission_status?.active_profile?.profile_name, "safe-readonly");
    assert.equal(status.structuredContent?.permission_status?.workspace_allowed, true);
    assert.ok(status.structuredContent?.permission_status?.allowed_roots?.includes(projectDir));
    assert.ok(status.structuredContent?.permission_status?.how_to_add_more_roots?.includes("VNEM_TOOLS_ALLOWED_ROOTS"));

    const preview = await client.callTool({ name: "vnem_tools_action_policy_preview", arguments: { proposed_action: "apply a patch to src/app.txt", action_type: "apply_patch", target_path: "src/app.txt" } });
    assert.equal(preview.isError, undefined);
    assert.equal(preview.structuredContent?.action_policy_preview?.permission_profile, "safe-readonly");
    assert.equal(preview.structuredContent?.action_policy_preview?.allowed, false);
    assert.equal(preview.structuredContent?.action_policy_preview?.blocked, true);
    assert.match(preview.structuredContent?.action_policy_preview?.reason || "", /safe-readonly|blocked/i);

    const patchText = "*** Begin Patch\n*** Update File: src/app.txt\n@@\n-old\n+new\n*** End Patch\n";
    const blockedPatch = await client.callTool({ name: "vnem_tools_apply_patch_batch", arguments: { target_root: ".", operations: [{ op: "replace", path: "src/app.txt", search: "old\n", replace: "new\n" }], dry_run: false, approved: true, approval_note: "try default write" } });
    assert.equal(blockedPatch.isError, true);
    assert.equal(blockedPatch.structuredContent?.code, "permission_profile_blocked");
    const singleBlockedPatch = await client.callTool({ name: "vnem_tools_apply_patch", arguments: { target_root: ".", patch: patchText, dry_run: false, approved: true, approval_note: "try default single write" } });
    assert.equal(singleBlockedPatch.isError, true);
    assert.equal(singleBlockedPatch.structuredContent?.code, "permission_profile_blocked");

    const commitBlocked = await client.callTool({ name: "vnem_tools_git_commit", arguments: { root: ".", files: ["src/app.txt"], message: "test: blocked", dry_run: false, approved: true, approval_note: "try commit" } });
    assert.equal(commitBlocked.isError, true);
    assert.equal(commitBlocked.structuredContent?.code, "permission_profile_blocked");
  });

  await withClient({ VNEM_TOOLS_PERMISSION_PROFILE: "approved-writes" }, async (client) => {
    const approvedPreview = await client.callTool({ name: "vnem_tools_action_policy_preview", arguments: { proposed_action: "apply patch", action_type: "apply_patch", target_path: "src/app.txt" } });
    assert.equal(approvedPreview.structuredContent?.action_policy_preview?.allowed, true);
    assert.equal(approvedPreview.structuredContent?.action_policy_preview?.requires_approval, true);
    assert.match(approvedPreview.structuredContent?.action_policy_preview?.required_user_approval_text || "", /Approve VNEM Tools MCP/i);
    assert.equal(approvedPreview.structuredContent?.action_policy_preview?.rollback_expected, true);

    const unapproved = await client.callTool({ name: "vnem_tools_apply_patch_batch", arguments: { target_root: ".", operations: [{ op: "replace", path: "src/app.txt", search: "old\n", replace: "new\n" }], dry_run: false } });
    assert.equal(unapproved.isError, true);
    assert.equal(unapproved.structuredContent?.code, "approval_required");
    const applied = await client.callTool({ name: "vnem_tools_apply_patch_batch", arguments: { target_root: ".", operations: [{ op: "replace", path: "src/app.txt", search: "old\n", replace: "new\n" }], dry_run: false, approved: true, approval_note: "approve isolated write" } });
    assert.equal(applied.isError, undefined);
    assert.equal(await readFile(path.join(projectDir, "src", "app.txt"), "utf8"), "new\n");
  });

  await withClient({ VNEM_TOOLS_PERMISSION_PROFILE: "approved-installs" }, async (client) => {
    const installPreview = await client.callTool({ name: "vnem_tools_action_policy_preview", arguments: { proposed_action: "npm install left-pad", action_type: "package_install" } });
    assert.equal(installPreview.structuredContent?.action_policy_preview?.allowed, false);
    assert.equal(installPreview.structuredContent?.action_policy_preview?.blocked, true);
    assert.match(installPreview.structuredContent?.action_policy_preview?.reason || "", /preview|not implemented|blocked/i);
  });

  await withClient({ VNEM_TOOLS_PERMISSION_PROFILE: "approved-github" }, async (client) => {
    const ghPreview = await client.callTool({ name: "vnem_tools_action_policy_preview", arguments: { proposed_action: "create GitHub PR", action_type: "github_pr" } });
    assert.equal(ghPreview.structuredContent?.action_policy_preview?.allowed, false);
    assert.equal(ghPreview.structuredContent?.action_policy_preview?.blocked, true);
    assert.match(ghPreview.structuredContent?.action_policy_preview?.reason || "", /preview|not implemented|blocked/i);
  });

  await withClient({ VNEM_TOOLS_ALLOWED_ROOTS: path.parse(projectDir).root, VNEM_TOOLS_EVIDENCE_ROOT: path.join(projectDir, ".vnem", "broad-root-evidence") }, async (client) => {
    const status = await client.callTool({ name: "vnem_tools_permission_status", arguments: {} });
    assert.ok(status.structuredContent?.permission_status?.broad_root_warnings?.some((w) => /too broad|drive root|filesystem root/i.test(w)));
  });

  await withClient({ VNEM_TOOLS_ALLOWED_ROOTS: outsideDir, VNEM_TOOLS_EVIDENCE_ROOT: path.join(outsideDir, ".vnem", "tool-runs") }, async (client) => {
    const status = await client.callTool({ name: "vnem_tools_permission_status", arguments: {} });
    assert.equal(status.structuredContent?.permission_status?.workspace_allowed, false);
    assert.match(status.structuredContent?.permission_status?.workspace_fix_suggestion || "", /VNEM_TOOLS_ALLOWED_ROOTS|allowed root/i);
  });

  console.log("vnem Tools permission profile tests passed");
} finally {
  await rm(tmpRoot, { recursive: true, force: true });
}
