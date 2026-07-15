#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const serverPath = path.join(scriptDir, "vnem-tools-mcp-server.mjs");
await mkdir(path.join(repoRoot, ".tmp"), { recursive: true });
const temporaryRoot = await mkdtemp(path.join(repoRoot, ".tmp", "tools-precision-"));
const projectRoot = path.join(temporaryRoot, "project");
await mkdir(path.join(projectRoot, "src"), { recursive: true });
await writeFile(path.join(projectRoot, "src", "app.js"), "export const value = \"old\";\n", "utf8");
await writeFile(path.join(projectRoot, "src", "config.js"), "export const enabled = false;\n", "utf8");
await writeFile(path.join(projectRoot, ".env"), "API_TOKEN=fixture-secret\n", "utf8");
await writeFile(
  path.join(projectRoot, "src", "player.js"),
  "export function resolvePlayerCollision(player, wall) {\n  return wall.overlaps(player.hitbox);\n}\n",
  "utf8"
);

const client = new Client({ name: "vnem-tools-precision-test", version: "1.0.0" }, { capabilities: {} });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [serverPath],
  cwd: repoRoot,
  env: {
    ...process.env,
    VNEM_TOOLS_ROOT: projectRoot,
    VNEM_TOOLS_PRECISION_ROOT: projectRoot,
    VNEM_TOOLS_ALLOWED_ROOTS: projectRoot,
    VNEM_TOOLS_PERMISSION_PROFILE: "approved-writes",
    VNEM_PRECISION_TEST_DOC_TEXT: "# React official fixture\n\nUse current component APIs."
  },
  stderr: "pipe"
});

let stderr = "";
transport.stderr?.on("data", (chunk) => {
  stderr += chunk.toString();
});

try {
  await client.connect(transport);
  const listed = await client.listTools();
  const names = new Set(listed.tools.map((tool) => tool.name));
  const required = [
    "vnem_tools_structural_code_search",
    "vnem_tools_exact_patch",
    "vnem_tools_unified_diff_apply",
    "vnem_tools_patch_transaction",
    "vnem_tools_patch_transaction_rollback",
    "vnem_tools_verification_loop",
    "vnem_tools_terminal_session",
    "vnem_tools_official_documentation_fetch",
    "vnem_tools_documentation_context",
    "vnem_tools_ephemeral_script",
    "vnem_tools_code_index_status"
  ];
  for (const name of required) assert.equal(names.has(name), true, `missing Tools precision capability ${name}`);

  const routed = await call("vnem_tools_entrypoint", {
    user_goal: "Find the implementation, apply an exact patch transaction, and run a green verification loop.",
    repo_path: projectRoot,
    task_mode: "implementation"
  });
  const routedNames = routed.structuredContent?.tools_entrypoint?.exact_tool_call_sequence?.map((step) => step.tool) || [];
  assert.ok(routedNames.includes("vnem_tools_structural_code_search"));
  assert.ok(routedNames.includes("vnem_tools_exact_patch"));
  assert.ok(routedNames.includes("vnem_tools_verification_loop"));

  const initialStatus = await call("vnem_tools_code_index_status", {});
  assert.equal(initialStatus.structuredContent?.code_index_status?.initialized, false, "index must remain lazy at startup");

  const firstSearch = await call("vnem_tools_structural_code_search", {
    query: "player collision function",
    refresh: true
  });
  const firstMatch = firstSearch.structuredContent?.structural_code_search?.results?.find((item) => item.target_path === "src/player.js");
  assert.ok(firstMatch, "structural search should find the player implementation");
  assert.equal(firstMatch.language, "javascript");
  assert.ok(firstMatch.symbols.some((symbol) => symbol.name === "resolvePlayerCollision"));

  await writeFile(
    path.join(projectRoot, "src", "player.js"),
    "export function calculateQuantumDashVelocity(player) {\n  return player.speed * 2;\n}\n",
    "utf8"
  );
  await new Promise((resolve) => setTimeout(resolve, 300));
  const incrementalSearch = await call("vnem_tools_structural_code_search", {
    query: "calculate quantum dash velocity",
    refresh: false
  });
  assert.ok(incrementalSearch.structuredContent?.structural_code_search?.results?.some((item) => item.target_path === "src/player.js"));
  assert.equal(incrementalSearch.structuredContent?.structural_code_search?.vector_store?.dirty, false);

  const appBefore = await readFile(path.join(projectRoot, "src", "app.js"), "utf8");
  const blockedApproval = await call("vnem_tools_exact_patch", {
    target_path: "src/app.js",
    search: "old",
    replace: "new",
    dry_run: false
  });
  assert.equal(blockedApproval.isError, true);
  assert.equal(blockedApproval.structuredContent?.code, "precision_explicit_approval_required");
  assert.equal(await readFile(path.join(projectRoot, "src", "app.js"), "utf8"), appBefore);

  const preconditionFailure = await call("vnem_tools_exact_patch", {
    target_path: "src/app.js",
    search: "old",
    replace: "new",
    expected_before_sha256: "0".repeat(64),
    dry_run: true
  });
  assert.equal(preconditionFailure.isError, true);
  assert.equal(preconditionFailure.structuredContent?.code, "patch_precondition_failed");

  const secretBlocked = await call("vnem_tools_exact_patch", {
    target_path: ".env",
    search: "fixture-secret",
    replace: "changed",
    dry_run: true
  });
  assert.equal(secretBlocked.isError, true);
  assert.equal(secretBlocked.structuredContent?.code, "secret_path_blocked");

  const unifiedDryRun = await call("vnem_tools_unified_diff_apply", {
    target_path: "src/app.js",
    unified_diff: "@@ -1,1 +1,1 @@\n-export const value = \"old\";\n+export const value = \"new\";",
    expected_before_sha256: hash(appBefore),
    dry_run: true
  });
  assert.equal(unifiedDryRun.structuredContent?.patch?.applied, false);

  const docs = await call("vnem_tools_official_documentation_fetch", {
    library: "React",
    worker_id: "frontend",
    task_id: "phase-3",
    approved: true,
    approval_note: "Use the bounded official-doc fixture for this test."
  });
  assert.equal(docs.structuredContent?.documentation?.library, "React");
  const context = await call("vnem_tools_documentation_context", {
    worker_id: "frontend",
    task_id: "phase-3",
    library: "React"
  });
  assert.equal(context.structuredContent?.documentation_context?.record_count, 1);
  assert.match(context.structuredContent?.documentation_context?.context_injection || "", /React official fixture/);

  const transaction = await call("vnem_tools_patch_transaction", {
    transaction_id: "phase3-atomic-proof",
    dry_run: false,
    approved: true,
    approval_note: "Apply the two exact fixture patches and retain rollback evidence.",
    worker_id: "frontend",
    task_id: "phase-3",
    required_documentation: ["React"],
    patches: [
      {
        target_path: "src/app.js",
        mode: "search_replace",
        search: "old",
        replace: "new",
        expected_before_sha256: hash(appBefore)
      },
      {
        target_path: "src/config.js",
        mode: "search_replace",
        search: "false",
        replace: "true"
      }
    ]
  });
  assert.equal(transaction.structuredContent?.patch_transaction?.status, "committed");
  assert.equal(transaction.structuredContent?.patch_transaction?.rollback_available, true);
  assert.match(await readFile(path.join(projectRoot, "src", "app.js"), "utf8"), /new/);
  assert.match(await readFile(path.join(projectRoot, "src", "config.js"), "utf8"), /true/);
  assert.equal(existsSync(path.join(projectRoot, ".vnem-runtime", "precision", "patch-transactions", "phase3-atomic-proof", "manifest.json")), true);

  const rollback = await call("vnem_tools_patch_transaction_rollback", {
    transaction_id: "phase3-atomic-proof",
    approved: true,
    approval_note: "Restore the exact transaction backups."
  });
  assert.equal(rollback.structuredContent?.patch_rollback?.status, "rolled_back");
  assert.equal(await readFile(path.join(projectRoot, "src", "app.js"), "utf8"), appBefore);
  assert.equal(await readFile(path.join(projectRoot, "src", "config.js"), "utf8"), "export const enabled = false;\n");

  const terminal = await call("vnem_tools_terminal_session", {
    command: "node --check src/app.js",
    approved: true,
    approval_note: "Run one bounded syntax check.",
    timeout_ms: 5000
  });
  assert.equal(terminal.structuredContent?.terminal_session?.ok, true);

  const verification = await call("vnem_tools_verification_loop", {
    command: "node --check src/app.js",
    phase: "green",
    task_id: "phase-3-green",
    reset: true,
    approved: true,
    approval_note: "Verify the restored fixture.",
    timeout_ms: 5000
  });
  assert.equal(verification.structuredContent?.verification?.verdict, "pass");
  const persisted = JSON.parse(await readFile(path.join(projectRoot, ".vnem-runtime", "precision", "verification-loops.json"), "utf8"));
  assert.ok(persisted.records.some((record) => record.task_id === "phase-3-green"));

  const ephemeral = await call("vnem_tools_ephemeral_script", {
    language: "node",
    script: "console.log(JSON.stringify({ phase: 3, shared: true }));",
    approved: true,
    approval_note: "Run a bounded local fixture script.",
    timeout_ms: 5000
  });
  assert.equal(ephemeral.structuredContent?.ephemeral_script?.ok, true);
  assert.equal(ephemeral.structuredContent?.ephemeral_script?.sandbox?.cleanup?.sandbox_deleted, true);

  console.log("VNEM Tools precision subsystem MCP tests passed");
} catch (error) {
  if (stderr.trim()) console.error(stderr.trim());
  throw error;
} finally {
  await client.close().catch(() => {});
  await new Promise((resolve) => setTimeout(resolve, 150));
  await removeTreeWithRetry(temporaryRoot);
}

async function call(name, args) {
  return await client.callTool({ name, arguments: args });
}

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function removeTreeWithRetry(target) {
  let lastError;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      await rm(target, { recursive: true, force: true });
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
    }
  }
  throw lastError;
}
