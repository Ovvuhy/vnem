#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const serverPath = path.join(scriptDir, "vnem-precision-mcp-server.mjs");
await mkdir(path.join(rootDir, ".tmp"), { recursive: true });
const tmpRoot = await mkdtemp(path.join(rootDir, ".tmp", "precision-mcp-"));
const projectDir = path.join(tmpRoot, "project");
await mkdir(path.join(projectDir, "src"), { recursive: true });
await writeFile(path.join(projectDir, "src", "app.js"), "export const value = \"old\";\n", "utf8");
await writeFile(
  path.join(projectDir, "src", "playerPhysics.js"),
  "export function resolvePlayerCollision(player, collider) {\n  return collider.overlaps(player.hitbox);\n}\n",
  "utf8"
);
await writeFile(path.join(projectDir, "src", "bad.js"), "function broken( {\n", "utf8");

const client = new Client(
  {
    name: "vnem-precision-mcp-smoke-test",
    version: "1.0.1"
  },
  {
    capabilities: {}
  }
);
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [serverPath],
  cwd: rootDir,
  env: {
    ...process.env,
    VNEM_PRECISION_ROOT: projectDir,
    VNEM_PRECISION_TEST_DOC_TEXT: "# React docs\n\nUse current component APIs from fetched documentation."
  },
  stderr: "pipe"
});

let stderr = "";
transport.stderr?.on("data", (chunk) => {
  stderr += chunk.toString();
});

try {
  await client.connect(transport);

  const tools = await client.listTools();
  const toolNames = new Set(tools.tools.map((tool) => tool.name));
  for (const name of [
    "mcp_semantic_code_search",
    "mcp_apply_diff_patch",
    "mcp_fetch_documentation",
    "mcp_execute_terminal_command",
    "mcp_run_verification_tests",
    "mcp_execute_ephemeral_script"
  ]) {
    assert.equal(toolNames.has(name), true, `expected precision MCP tool ${name}`);
  }
  const semanticTool = tools.tools.find((tool) => tool.name === "mcp_semantic_code_search");
  const patchTool = tools.tools.find((tool) => tool.name === "mcp_apply_diff_patch");
  const docsTool = tools.tools.find((tool) => tool.name === "mcp_fetch_documentation");
  const terminalTool = tools.tools.find((tool) => tool.name === "mcp_execute_terminal_command");
  const verificationTool = tools.tools.find((tool) => tool.name === "mcp_run_verification_tests");
  const ephemeralTool = tools.tools.find((tool) => tool.name === "mcp_execute_ephemeral_script");
  assert.equal(semanticTool.annotations?.readOnlyHint, true);
  assert.equal(patchTool.annotations?.readOnlyHint, false);
  assert.equal(patchTool.annotations?.destructiveHint, true);
  assert.equal(docsTool.annotations?.readOnlyHint, true);
  assert.equal(docsTool.annotations?.openWorldHint, true);
  assert.equal(terminalTool.annotations?.readOnlyHint, false);
  assert.equal(verificationTool.annotations?.readOnlyHint, false);
  assert.equal(ephemeralTool.annotations?.destructiveHint, true);

  const semantic = await client.callTool({
    name: "mcp_semantic_code_search",
    arguments: {
      query: "player physics collision logic",
      limit: 3,
      refresh: true
    }
  });
  assert.equal(semantic.isError, undefined);
  assert.ok(
    semantic.structuredContent?.semantic_code_search?.results?.some((item) => item.target_path === "src/playerPhysics.js"),
    "expected semantic search to locate playerPhysics.js"
  );

  const dryRun = await client.callTool({
    name: "mcp_apply_diff_patch",
    arguments: {
      target_path: "src/app.js",
      search: "old",
      replace: "new",
      dry_run: true
    }
  });
  assert.equal(dryRun.isError, undefined);
  assert.equal(dryRun.structuredContent?.patch?.applied, false);
  assert.equal(await readFile(path.join(projectDir, "src", "app.js"), "utf8"), "export const value = \"old\";\n");

  const blocked = await client.callTool({
    name: "mcp_apply_diff_patch",
    arguments: {
      target_path: "src/app.js",
      search: "old",
      replace: "new",
      dry_run: false,
      worker_id: "ui",
      task_id: "task-1",
      required_documentation: ["React"]
    }
  });
  assert.equal(blocked.isError, true);
  assert.equal(blocked.structuredContent?.code, "required_documentation_missing");

  const docs = await client.callTool({
    name: "mcp_fetch_documentation",
    arguments: {
      library: "React",
      worker_id: "ui",
      task_id: "task-1"
    }
  });
  assert.equal(docs.isError, undefined);
  assert.equal(docs.structuredContent?.documentation?.library, "React");
  assert.ok(docs.structuredContent?.context_injection?.includes("React docs"));

  const applied = await client.callTool({
    name: "mcp_apply_diff_patch",
    arguments: {
      target_path: "src/app.js",
      search: "old",
      replace: "new",
      dry_run: false,
      worker_id: "ui",
      task_id: "task-1",
      required_documentation: ["React"]
    }
  });
  assert.equal(applied.isError, undefined);
  assert.equal(applied.structuredContent?.patch?.applied, true);
  assert.equal(await readFile(path.join(projectDir, "src", "app.js"), "utf8"), "export const value = \"new\";\n");

  const terminal = await client.callTool({
    name: "mcp_execute_terminal_command",
    arguments: {
      command: "node --check src/app.js",
      timeout_ms: 5000
    }
  });
  assert.equal(terminal.isError, undefined);
  assert.equal(terminal.structuredContent?.execution?.ok, true);

  const red = await client.callTool({
    name: "mcp_run_verification_tests",
    arguments: {
      command: "node --check src/bad.js",
      phase: "red",
      task_id: "bad-syntax-red",
      reset: true,
      timeout_ms: 5000
    }
  });
  assert.equal(red.isError, undefined);
  assert.equal(red.structuredContent?.verification?.verdict, "red_confirmed");

  const green = await client.callTool({
    name: "mcp_run_verification_tests",
    arguments: {
      command: "node --check src/app.js",
      phase: "green",
      task_id: "app-green",
      reset: true,
      timeout_ms: 5000
    }
  });
  assert.equal(green.isError, undefined);
  assert.equal(green.structuredContent?.verification?.verdict, "pass");

  const ephemeral = await client.callTool({
    name: "mcp_execute_ephemeral_script",
    arguments: {
      language: "node",
      script: "console.log(JSON.stringify({ ok: true, value: 42 }));",
      timeout_ms: 5000
    }
  });
  assert.equal(ephemeral.isError, undefined);
  assert.equal(ephemeral.structuredContent?.ephemeral_script?.ok, true);
  assert.equal(ephemeral.structuredContent?.ephemeral_script?.sandbox?.cleanup?.sandbox_deleted, true);

  const unsafeScript = await client.callTool({
    name: "mcp_execute_ephemeral_script",
    arguments: {
      language: "node",
      script: "import { exec } from 'node:child_process'; exec('echo bad');"
    }
  });
  assert.equal(unsafeScript.isError, true);
  assert.equal(unsafeScript.structuredContent?.code, "process_spawn_blocked");

  const unsafeTerminal = await client.callTool({
    name: "mcp_execute_terminal_command",
    arguments: {
      command: "npm install left-pad"
    }
  });
  assert.equal(unsafeTerminal.isError, true);
  assert.equal(unsafeTerminal.structuredContent?.code, "package_script_not_allowed");

  console.log("vnem precision MCP smoke test passed");
} catch (error) {
  if (stderr.trim()) {
    console.error(stderr.trim());
  }
  throw error;
} finally {
  await client.close().catch(() => {});
  await new Promise((resolve) => setTimeout(resolve, 150));
  await removeTreeWithRetry(tmpRoot);
}

async function removeTreeWithRetry(target) {
  let lastError;
  for (let attempt = 0; attempt < 6; attempt += 1) {
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
