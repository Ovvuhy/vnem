import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { connectMcp } from "./vnem/giga/mcp-client.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temp = await mkdtemp(path.join(os.tmpdir(), "vnem-client-mcp-"));
const workspace = path.join(temp, "workspace");
const home = path.join(temp, "home");
const stateDir = path.join(temp, "state");
await mkdir(workspace, { recursive: true });
await mkdir(home, { recursive: true });

const connection = await connectMcp({
  root,
  serverFile: "scripts/vnem-tools-mcp-server.mjs",
  name: "vnem-client-setup-mcp-test",
  env: {
    VNEM_TOOLS_ALLOWED_ROOTS: [root, temp].join(path.delimiter),
    VNEM_TOOLS_PERMISSION_PROFILE: "creator-power"
  }
});

try {
  const names = new Set((await connection.client.listTools()).tools.map((tool) => tool.name));
  for (const name of [
    "vnem_tools_client_detect",
    "vnem_tools_client_setup_plan",
    "vnem_tools_client_install",
    "vnem_tools_client_setup_status",
    "vnem_tools_client_verify",
    "vnem_tools_client_rollback"
  ]) assert.ok(names.has(name), `missing ${name}`);

  const shared = {
    root,
    workspace,
    home,
    state_dir: stateDir,
    clients: ["generic_stdio"],
    components: ["core", "tools"],
    verify_mcp: false
  };
  const profilePath = path.join(workspace, ".vnem", "client-profiles", "generic", "mcp.json");

  const detected = await call("vnem_tools_client_detect", { root, workspace, home }, "client_detect");
  assert.ok(detected.clients.some((client) => client.id === "generic_stdio" && client.installed));

  const plan = await call("vnem_tools_client_setup_plan", shared, "client_setup_plan");
  assert.ok(plan.change_count >= 1);
  assert.equal(plan.files.some((file) => Object.hasOwn(file, "_nextText")), false);

  const preview = await call("vnem_tools_client_install", shared, "client_install");
  assert.equal(preview.applied, false);
  assert.equal(existsSync(profilePath), false);

  const blocked = await connection.client.callTool({
    name: "vnem_tools_client_install",
    arguments: { ...shared, dry_run: false }
  });
  assert.equal(blocked.isError, true);
  assert.match(blocked.content?.[0]?.text || "", /approval/i);
  assert.equal(existsSync(profilePath), false);

  const applied = await call("vnem_tools_client_install", {
    ...shared,
    dry_run: false,
    approved: true,
    approval_note: "Apply isolated client setup fixture"
  }, "client_install");
  assert.equal(applied.applied, true);
  assert.equal(applied.ok, true);
  assert.equal(existsSync(profilePath), true);
  assert.ok(applied.transaction_id);
  assert.ok(applied.manifest_path);

  const status = await call("vnem_tools_client_setup_status", { root, workspace, home, state_dir: stateDir }, "client_setup_status");
  assert.equal(status.latest_transaction.transaction_id, applied.transaction_id);
  assert.match(status.latest_transaction.status, /applied-and-verified/);

  const verified = await call("vnem_tools_client_verify", shared, "client_verify");
  assert.equal(verified.ok, true);
  assert.equal(verified.mcp.attempted, false);

  const rollbackPreview = await call("vnem_tools_client_rollback", {
    root,
    workspace,
    home,
    state_dir: stateDir,
    transaction_id: applied.transaction_id
  }, "client_rollback");
  assert.equal(rollbackPreview.applied, false);
  assert.equal(existsSync(profilePath), true);

  const rolledBack = await call("vnem_tools_client_rollback", {
    root,
    workspace,
    home,
    state_dir: stateDir,
    transaction_id: applied.transaction_id,
    dry_run: false,
    approved: true,
    approval_note: "Restore isolated client setup fixture"
  }, "client_rollback");
  assert.equal(rolledBack.applied, true);
  assert.equal(rolledBack.ok, true);
  assert.equal(existsSync(profilePath), false);

  console.log("VNEM Tools client setup MCP tests passed: detect, plan, approval, apply, status, verify, and rollback");
} finally {
  await connection.close();
  await rm(temp, { recursive: true, force: true });
}

async function call(name, args, key) {
  const response = await connection.client.callTool({ name, arguments: args });
  assert.equal(response.isError, undefined, `${name} failed: ${response.content?.[0]?.text || ""}`);
  assert.ok(response.structuredContent?.[key], `${name} missing structuredContent.${key}`);
  return response.structuredContent[key];
}
