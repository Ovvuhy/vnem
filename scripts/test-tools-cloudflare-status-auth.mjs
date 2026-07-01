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
const tmpRoot = await mkdtemp(path.join(rootDir, ".tmp", "cf-status-auth-"));

async function withClient(env, fn) {
  const client = new Client({ name: "cf-status-auth-test", version: "1.0.1" }, { capabilities: {} });
  const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(scriptDir, "vnem-tools-mcp-server.mjs")], cwd: rootDir, env: { ...process.env, VNEM_TOOLS_ALLOWED_ROOTS: tmpRoot, VNEM_TOOLS_EVIDENCE_ROOT: path.join(tmpRoot, ".vnem", "tool-runs"), CLOUDFLARE_API_TOKEN: "cfut_1234567890abcdefghijklmnopqrstuvwxyzTOKEN", CF_API_TOKEN: "cfut_abcdefabcdefabcdefabcdefabcdefabcdef", CLOUDFLARE_ACCOUNT_ID: "account_123", ...env }, stderr: "pipe" });
  await client.connect(transport);
  try { return await fn(client); } finally { await client.close().catch(() => {}); }
}

try {
  await withClient({}, async (client) => {
    const toolNames = new Set((await client.listTools()).tools.map((tool) => tool.name));
    for (const name of ["vnem_tools_cloudflare_status", "vnem_tools_cloudflare_auth_plan", "vnem_tools_cloudflare_accounts_list", "vnem_tools_cloudflare_projects_list"]) assert.ok(toolNames.has(name), `missing ${name}`);
    const status = await client.callTool({ name: "vnem_tools_cloudflare_status", arguments: {} });
    const cf = status.structuredContent?.cloudflare_status;
    assert.equal(cf.api_token_present, true);
    assert.equal(cf.api_token_redacted, "[REDACTED]");
    assert.equal(cf.account_id_present, true);
    assert.equal(cf.secrets_redacted, true);
    assert.equal(cf.permission_profile, "safe-readonly");
    assert.equal(cf.tools_can_mutate, false);
    assert.ok(cf.allowed_operations.includes("status"));
    assert.doesNotMatch(JSON.stringify(status), /cfut_1234567890|cfut_abcdefabcdef/);

    const auth = await client.callTool({ name: "vnem_tools_cloudflare_auth_plan", arguments: { access_goal: "full_authorized_access" } });
    const plan = auth.structuredContent?.cloudflare_auth_plan;
    assert.match(plan.recommended_auth_method, /Wrangler|API token/i);
    for (const forbidden of ["cookies", "browser sessions", "browser profile scraping", "CAPTCHA bypass", "committed tokens", "printed tokens"]) assert.ok(plan.forbidden_auth_methods.includes(forbidden), forbidden);
    assert.ok(plan.env_var_names.includes("CLOUDFLARE_API_TOKEN"));
    assert.match(JSON.stringify(plan.needed_permissions), /Account|Workers|Pages|DNS|Cache/i);
    assert.doesNotMatch(JSON.stringify(auth), /cfut_1234567890|cfut_abcdefabcdef/);

    const accounts = await client.callTool({ name: "vnem_tools_cloudflare_accounts_list", arguments: { simulate: true } });
    assert.equal(accounts.structuredContent?.cloudflare_accounts_list?.read_only, true);
    assert.equal(accounts.structuredContent?.cloudflare_accounts_list?.secrets_redacted, true);
    const projects = await client.callTool({ name: "vnem_tools_cloudflare_projects_list", arguments: { simulate: true } });
    assert.equal(projects.structuredContent?.cloudflare_projects_list?.read_only, true);
  });

  await withClient({ VNEM_TOOLS_PERMISSION_PROFILE: "dangerous-disabled" }, async (client) => {
    const status = await client.callTool({ name: "vnem_tools_cloudflare_status", arguments: {} });
    assert.equal(status.structuredContent?.cloudflare_status?.capability_status, "disabled_by_profile");
    assert.equal(status.structuredContent?.cloudflare_status?.tools_can_mutate, false);
  });

  console.log("vnem Tools Cloudflare status/auth tests passed");
} finally {
  await rm(tmpRoot, { recursive: true, force: true });
}
