#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
await mkdir(path.join(repoRoot, ".tmp"), { recursive: true });
const temporaryRoot = await mkdtemp(path.join(repoRoot, ".tmp", "scoped-permissions-"));
const projectRoot = path.join(temporaryRoot, "project");
await mkdir(path.join(projectRoot, "src"), { recursive: true });
await writeFile(path.join(projectRoot, "src", "app.js"), "export const value = \"old\";\n", "utf8");

const client = new Client({ name: "vnem-tools-scoped-permissions", version: "1.0.0" }, { capabilities: {} });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(scriptDir, "vnem-tools-mcp-server.mjs")],
  cwd: repoRoot,
  env: {
    ...process.env,
    VNEM_WORKSPACE_ROOT: projectRoot,
    VNEM_TOOLS_ALLOWED_ROOTS: projectRoot,
    VNEM_TOOLS_PRECISION_ROOT: projectRoot,
    VNEM_TOOLS_PERMISSION_PROFILE: "safe-readonly"
  },
  stderr: "pipe"
});

let stderr = "";
transport.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });

try {
  await client.connect(transport);
  const names = new Set((await client.listTools()).tools.map((tool) => tool.name));
  for (const name of ["vnem_tools_permission_request", "vnem_tools_permission_grant", "vnem_tools_permission_revoke", "vnem_tools_permission_evaluate", "vnem_tools_permission_doctor"]) {
    assert.equal(names.has(name), true, `missing scoped permission tool ${name}`);
  }
  const routed = await call("vnem_tools_capability_router", {
    user_goal: "Request one scoped grant under a safety profile and keep hard blocks intact.",
    task_type: "auto",
    available_context: {}
  });
  const routedNames = routed.structuredContent?.capability_router?.exact_call_sequence?.map((step) => step.tool) || [];
  assert.ok(routedNames.includes("vnem_tools_permission_request"));
  assert.ok(routedNames.includes("vnem_tools_permission_evaluate"));

  const profiles = await call("vnem_tools_permission_profiles", {});
  const profileNames = profiles.structuredContent?.permission_profiles?.profiles?.map((profile) => profile.profile_name) || [];
  for (const name of ["maintainer", "expert", "custom"]) assert.ok(profileNames.includes(name));

  const before = await call("vnem_tools_permission_evaluate", { action: "apply_patch", target_path: "src/app.js" });
  assert.equal(before.structuredContent?.permission_decision?.allowed, false);

  const hardBlocked = await call("vnem_tools_permission_request", {
    actions: ["force_push"],
    reason: "This must never be grantable."
  });
  assert.equal(hardBlocked.isError, true);
  assert.equal(hardBlocked.structuredContent?.code, "permission_hard_blocked");

  const requested = await call("vnem_tools_permission_request", {
    actions: ["apply_patch", "run_test"],
    scope: { path_prefixes: ["src"] },
    duration_minutes: 30,
    persistence: "session",
    reason: "Apply and verify one bounded source edit."
  });
  const request = requested.structuredContent?.permission_request;
  assert.ok(request.request_id);
  assert.match(request.exact_acknowledgment, new RegExp(request.request_id));
  assert.equal(request.persistence, "session");
  assert.ok(request.material_risks.length > 0);

  const wrongAck = await call("vnem_tools_permission_grant", {
    request_id: request.request_id,
    acknowledgment: "I approve"
  });
  assert.equal(wrongAck.isError, true);
  assert.equal(wrongAck.structuredContent?.code, "permission_acknowledgment_mismatch");

  const granted = await call("vnem_tools_permission_grant", {
    request_id: request.request_id,
    acknowledgment: request.exact_acknowledgment
  });
  const grant = granted.structuredContent?.permission_grant?.grant;
  assert.equal(grant.persistence, "session");

  const decision = await call("vnem_tools_permission_evaluate", { action: "apply_patch", target_path: "src/app.js" });
  assert.equal(decision.structuredContent?.permission_decision?.allowed, true);
  assert.equal(decision.structuredContent?.permission_decision?.approval_required, false);
  assert.equal(decision.structuredContent?.permission_decision?.decision_source, "scoped_grant");

  const applied = await call("vnem_tools_exact_patch", {
    target_path: "src/app.js",
    search: "old",
    replace: "new",
    dry_run: false
  });
  assert.equal(applied.isError, undefined, "active scoped grant should avoid repeated per-call approval");
  assert.match(await readFile(path.join(projectRoot, "src", "app.js"), "utf8"), /new/);

  const outOfScope = await call("vnem_tools_permission_evaluate", { action: "apply_patch", target_path: "README.md" });
  assert.equal(outOfScope.structuredContent?.permission_decision?.allowed, false);
  const secretStillBlocked = await call("vnem_tools_permission_evaluate", { action: "secret_output" });
  assert.equal(secretStillBlocked.structuredContent?.permission_decision?.hard_blocked, true);

  const revoked = await call("vnem_tools_permission_revoke", { grant_id: grant.grant_id });
  assert.equal(revoked.structuredContent?.permission_revoke?.session_removed, true);
  const after = await call("vnem_tools_permission_evaluate", { action: "apply_patch", target_path: "src/app.js" });
  assert.equal(after.structuredContent?.permission_decision?.allowed, false);
  const doctor = await call("vnem_tools_permission_doctor", {});
  assert.equal(doctor.structuredContent?.permission_doctor?.ok, true);
  assert.equal(doctor.structuredContent?.permission_doctor?.hard_blocks_intact, true);

  console.log("VNEM Tools scoped permission MCP tests passed");
} catch (error) {
  if (stderr.trim()) console.error(stderr.trim());
  throw error;
} finally {
  await client.close().catch(() => {});
  await rm(temporaryRoot, { recursive: true, force: true });
}

async function call(name, arguments_) {
  return await client.callTool({ name, arguments: arguments_ });
}
