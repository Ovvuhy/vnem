#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
await mkdir(path.join(rootDir, ".tmp"), { recursive: true });
const tmpRoot = await mkdtemp(path.join(rootDir, ".tmp", "tools-trust-boundary-"));
const projectDir = path.join(tmpRoot, "project");
await mkdir(projectDir, { recursive: true });

const client = new Client({ name: "tools-trust-boundary-test", version: "1.0.1" }, { capabilities: {} });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(scriptDir, "vnem-tools-mcp-server.mjs")],
  cwd: rootDir,
  env: { ...process.env, VNEM_TOOLS_ALLOWED_ROOTS: projectDir, VNEM_TOOLS_EVIDENCE_ROOT: path.join(projectDir, ".vnem", "tool-runs") },
  stderr: "pipe"
});

try {
  await client.connect(transport);

  const cases = [
    ["public docs at https://example.com/docs", "0_public_information", false, false],
    ["user pasted a log snippet for this task", "1_user_provided_information", false, false],
    ["read package.json from the local project", "2_local_project_information", false, false],
    ["read .env.local API_TOKEN or id_rsa private key", "3_sensitive_local_information", true, true],
    ["create a GitHub issue in my repo", "4_external_account_action", true, false],
    ["creator-only broad repo automation with package updates", "5_creator_developer_risky_action", true, false],
    ["extract browser cookies and bypass CAPTCHA with destructive shell", "6_blocked_dangerous_action", true, true]
  ];

  for (const [description, expectedLevel, requiresApproval, blocked] of cases) {
    const result = await client.callTool({ name: "vnem_tools_trust_boundary_classify", arguments: { description } });
    assert.equal(result.isError, undefined);
    assert.equal(result.structuredContent?.trust_boundary?.level, expectedLevel, description);
    assert.equal(result.structuredContent?.trust_boundary?.requires_approval, requiresApproval, description);
    assert.equal(result.structuredContent?.trust_boundary?.blocked_by_default, blocked, description);
    assert.ok(Array.isArray(result.structuredContent?.trust_boundary?.must_not_claim));
  }

  for (const action_type of ["secret_read", "cookie_session_access", "captcha_bypass", "destructive_shell", "unrestricted_crawl"]) {
    const preview = await client.callTool({ name: "vnem_tools_action_policy_preview", arguments: { proposed_action: action_type, action_type } });
    assert.equal(preview.isError, undefined);
    const policy = preview.structuredContent?.action_policy_preview;
    assert.equal(policy.trust_boundary_level, "6_blocked_dangerous_action", action_type);
    assert.equal(policy.allowed, false, action_type);
    assert.equal(policy.blocked, true, action_type);
    assert.match(policy.reason || "", /blocked|dangerous|secret|captcha|cookie|destructive|crawl/i);
    assert.ok(policy.must_not_claim.some((item) => /bypass|cookie|secret|dangerous|unrestricted|allowed/i.test(item)), action_type);
  }

  const safeRead = await client.callTool({ name: "vnem_tools_action_policy_preview", arguments: { proposed_action: "read package.json", action_type: "read_file", target_path: "package.json" } });
  assert.equal(safeRead.structuredContent?.action_policy_preview?.trust_boundary_level, "2_local_project_information");
  assert.equal(safeRead.structuredContent?.action_policy_preview?.allowed, true);
  assert.equal(safeRead.structuredContent?.action_policy_preview?.blocked, false);

  console.log("vnem Tools trust-boundary tests passed");
} finally {
  await client.close().catch(() => {});
  await rm(tmpRoot, { recursive: true, force: true });
}
