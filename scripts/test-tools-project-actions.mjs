#!/usr/bin/env node
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
await mkdir(path.join(rootDir, ".tmp"), { recursive: true });
const tmpRoot = await mkdtemp(path.join(rootDir, ".tmp", "tools-project-actions-"));
const projectDir = path.join(tmpRoot, "project");
const outsideDir = path.join(tmpRoot, "outside");
await mkdir(path.join(projectDir, "src"), { recursive: true });
await mkdir(outsideDir, { recursive: true });
await writeFile(path.join(projectDir, "package.json"), JSON.stringify({
  type: "module",
  scripts: {
    test: "node src/test.js",
    build: "node src/build.js",
    validate: "node src/validate.js",
    lint: "node src/lint.js",
    typecheck: "node src/typecheck.js",
    dev: "node src/dev-server.mjs",
    deploy: "echo deploy",
    install: "echo install"
  },
  dependencies: { "@vitejs/plugin-react": "1.0.0", react: "1.0.0", vite: "1.0.0" },
  devDependencies: {}
}, null, 2), "utf8");
await writeFile(path.join(projectDir, "src", "app.txt"), "alpha\n", "utf8");
await writeFile(path.join(projectDir, "src", "old.txt"), "delete me\n", "utf8");
await writeFile(path.join(projectDir, "src", "test.js"), "console.log('test ok TOKEN=sample-sensitive-value');\n", "utf8");
await writeFile(path.join(projectDir, "src", "build.js"), "console.log('build ok');\n", "utf8");
await writeFile(path.join(projectDir, "src", "validate.js"), "console.log('validate ok');\n", "utf8");
await writeFile(path.join(projectDir, "src", "lint.js"), "console.log('lint ok');\n", "utf8");
await writeFile(path.join(projectDir, "src", "typecheck.js"), "console.log('typecheck ok');\n", "utf8");
await writeFile(path.join(projectDir, "src", "dev-server.mjs"), `import { createServer } from 'node:http';
const port = Number(process.argv[process.argv.indexOf('--port') + 1] || process.env.PORT || 4317);
const server = createServer((req, res) => { res.writeHead(200, {'content-type':'text/html'}); res.end('<main id="app">VNEM local dev server proof</main>'); });
server.listen(port, '127.0.0.1', () => console.log('READY http://127.0.0.1:' + port));
`, "utf8");
await writeFile(path.join(projectDir, ".env"), "TOKEN=example-placeholder\n", "utf8");
await writeFile(path.join(outsideDir, "outside.txt"), "outside\n", "utf8");

const client = new Client({ name: "vnem-tools-project-actions-test", version: "1.0.1" }, { capabilities: {} });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(scriptDir, "vnem-tools-mcp-server.mjs")],
  cwd: rootDir,
  env: {
    ...process.env,
    VNEM_TOOLS_ALLOWED_ROOTS: projectDir,
    VNEM_TOOLS_EVIDENCE_ROOT: path.join(projectDir, ".vnem", "tool-runs"),
    VNEM_TOOLS_ALLOW_LOCALHOST: "1",
    VNEM_TOOLS_BROWSER_COMMAND: "__vnem_missing_browser_for_deterministic_test__"
  },
  stderr: "pipe"
});
let stderr = "";
transport.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });

try {
  await client.connect(transport);
  const toolNames = new Set((await client.listTools()).tools.map((tool) => tool.name));
  for (const name of ["vnem_tools_apply_patch_batch", "vnem_tools_restore_batch", "vnem_tools_project_scan", "vnem_tools_run_project_task", "vnem_tools_start_dev_server", "vnem_tools_list_dev_servers", "vnem_tools_stop_dev_server"]) {
    assert.equal(toolNames.has(name), true, `missing ${name}`);
  }

  const scan = await client.callTool({ name: "vnem_tools_project_scan", arguments: { root: ".", max_files: 80, include_scripts: true } });
  assert.equal(scan.isError, undefined);
  assert.equal(scan.structuredContent?.project_scan?.package_json_present, true);
  assert.equal(scan.structuredContent?.project_scan?.detected_package_manager, "npm");
  assert.ok(scan.structuredContent?.project_scan?.likely_frameworks?.includes("Vite"));
  assert.ok(scan.structuredContent?.project_scan?.likely_frameworks?.includes("React"));
  assert.ok(scan.structuredContent?.project_scan?.safe_commands_suggested?.includes("npm test"));
  assert.ok(scan.structuredContent?.project_scan?.blocked_or_skipped_paths?.some((item) => item.includes(".env")));
  assert.doesNotMatch(JSON.stringify(scan.structuredContent), /example-placeholder/);

  const ops = [
    { op: "replace", path: "src/app.txt", search: "alpha\n", replace: "beta\n" },
    { op: "create", path: "src/new.txt", content: "new file\n" },
    { op: "append", path: "src/app.txt", content: "tail\n" },
    { op: "delete", path: "src/old.txt", explicit_delete: true }
  ];
  const dryBatch = await client.callTool({ name: "vnem_tools_apply_patch_batch", arguments: { target_root: ".", operations: ops } });
  assert.equal(dryBatch.isError, undefined);
  assert.equal(dryBatch.structuredContent?.patch_batch?.dry_run, true);
  assert.equal(await readFile(path.join(projectDir, "src", "app.txt"), "utf8"), "alpha\n");
  assert.equal(await stat(path.join(projectDir, "src", "old.txt")).then(() => true), true);

  const unapprovedBatch = await client.callTool({ name: "vnem_tools_apply_patch_batch", arguments: { target_root: ".", operations: ops, dry_run: false } });
  assert.equal(unapprovedBatch.isError, true);
  assert.equal(unapprovedBatch.structuredContent?.code, "approval_required");

  const secretBatch = await client.callTool({ name: "vnem_tools_apply_patch_batch", arguments: { target_root: ".", operations: [{ op: "append", path: ".env", content: "x\n" }] } });
  assert.equal(secretBatch.isError, true);
  assert.equal(secretBatch.structuredContent?.code, "secret_path_blocked");
  const outsideBatch = await client.callTool({ name: "vnem_tools_apply_patch_batch", arguments: { target_root: ".", operations: [{ op: "create", path: path.join(outsideDir, "x.txt"), content: "x" }] } });
  assert.equal(outsideBatch.isError, true);
  assert.equal(outsideBatch.structuredContent?.code, "path_outside_allowed_roots");
  const badDelete = await client.callTool({ name: "vnem_tools_apply_patch_batch", arguments: { target_root: ".", operations: [{ op: "delete", path: "src/old.txt" }] } });
  assert.equal(badDelete.isError, true);
  assert.equal(badDelete.structuredContent?.code, "explicit_delete_required");
  const partialFailure = await client.callTool({ name: "vnem_tools_apply_patch_batch", arguments: { target_root: ".", operations: [{ op: "replace", path: "src/app.txt", search: "alpha\n", replace: "gamma\n" }, { op: "replace", path: "src/app.txt", search: "missing", replace: "nope" }], dry_run: false, approved: true, approval_note: "test approved but should fail before applying" } });
  assert.equal(partialFailure.isError, true);
  assert.equal(await readFile(path.join(projectDir, "src", "app.txt"), "utf8"), "alpha\n");

  const appliedBatch = await client.callTool({ name: "vnem_tools_apply_patch_batch", arguments: { target_root: ".", operations: ops, dry_run: false, approved: true, approval_note: "approve isolated test batch patch" } });
  assert.equal(appliedBatch.isError, undefined);
  const batch = appliedBatch.structuredContent?.patch_batch;
  assert.equal(batch.applied, true);
  assert.deepEqual(batch.changed_files.sort(), ["src/app.txt", "src/new.txt", "src/old.txt"].sort());
  assert.ok(batch.created_files.includes("src/new.txt"));
  assert.ok(batch.deleted_files.includes("src/old.txt"));
  assert.ok(batch.backups.length >= 2);
  assert.ok(batch.restore_plan.length >= 2);
  assert.equal(await readFile(path.join(projectDir, "src", "app.txt"), "utf8"), "beta\ntail\n");
  await stat(path.join(projectDir, "src", "new.txt"));

  const restoreDry = await client.callTool({ name: "vnem_tools_restore_batch", arguments: { restore_plan: batch.restore_plan } });
  assert.equal(restoreDry.isError, undefined);
  assert.equal(restoreDry.structuredContent?.restore_batch?.dry_run, true);
  assert.equal(await readFile(path.join(projectDir, "src", "app.txt"), "utf8"), "beta\ntail\n");
  const restoreUnapproved = await client.callTool({ name: "vnem_tools_restore_batch", arguments: { restore_plan: batch.restore_plan, dry_run: false } });
  assert.equal(restoreUnapproved.isError, true);
  assert.equal(restoreUnapproved.structuredContent?.code, "approval_required");
  const restoreOutside = await client.callTool({ name: "vnem_tools_restore_batch", arguments: { restore_plan: [{ backup_path: path.join(outsideDir, "outside.txt"), target_path: "src/app.txt" }] } });
  assert.equal(restoreOutside.isError, true);
  assert.equal(restoreOutside.structuredContent?.code, "path_outside_allowed_roots");
  const restoreSecret = await client.callTool({ name: "vnem_tools_restore_batch", arguments: { restore_plan: [{ backup_path: batch.backups[0].backup_path, target_path: ".env" }] } });
  assert.equal(restoreSecret.isError, true);
  assert.equal(restoreSecret.structuredContent?.code, "secret_path_blocked");
  const restored = await client.callTool({ name: "vnem_tools_restore_batch", arguments: { restore_plan: batch.restore_plan, dry_run: false, approved: true, approval_note: "approve isolated test restore batch" } });
  assert.equal(restored.isError, undefined);
  assert.equal(restored.structuredContent?.restore_batch?.restored, true);
  assert.equal(await readFile(path.join(projectDir, "src", "app.txt"), "utf8"), "alpha\n");
  assert.equal(await stat(path.join(projectDir, "src", "old.txt")).then(() => true), true);

  const taskDry = await client.callTool({ name: "vnem_tools_run_project_task", arguments: { task: "test", root: "." } });
  assert.equal(taskDry.isError, undefined);
  assert.equal(taskDry.structuredContent?.project_task?.dry_run, true);
  const taskUnapproved = await client.callTool({ name: "vnem_tools_run_project_task", arguments: { task: "test", root: ".", dry_run: false } });
  assert.equal(taskUnapproved.isError, true);
  assert.equal(taskUnapproved.structuredContent?.code, "approval_required");
  const taskRun = await client.callTool({ name: "vnem_tools_run_project_task", arguments: { task: "test", root: ".", dry_run: false, approved: true, approval_note: "approve package test script", max_output_bytes: 300 } });
  if (taskRun.isError) throw new Error(`taskRun failed: ${JSON.stringify(taskRun)}`);
  assert.equal(taskRun.isError, undefined);
  assert.equal(taskRun.structuredContent?.project_task?.exit_code, 0);
  assert.doesNotMatch(JSON.stringify(taskRun.structuredContent), /sample-sensitive-value/);
  const deployBlocked = await client.callTool({ name: "vnem_tools_run_project_task", arguments: { task: "custom_script", script: "deploy", root: ".", dry_run: false, approved: true, approval_note: "try deploy" } });
  assert.equal(deployBlocked.isError, true);
  assert.equal(deployBlocked.structuredContent?.code, "unsafe_script_blocked");
  const installBlocked = await client.callTool({ name: "vnem_tools_run_project_task", arguments: { task: "custom_script", script: "install", root: "." } });
  assert.equal(installBlocked.isError, true);
  assert.equal(installBlocked.structuredContent?.code, "unsafe_script_blocked");
  const unknownBlocked = await client.callTool({ name: "vnem_tools_run_project_task", arguments: { task: "custom_script", script: "missing", root: "." } });
  assert.equal(unknownBlocked.isError, true);
  assert.equal(unknownBlocked.structuredContent?.code, "script_not_found");

  const serverDry = await client.callTool({ name: "vnem_tools_start_dev_server", arguments: { root: ".", script: "dev", port: 4317 } });
  assert.equal(serverDry.isError, undefined);
  assert.equal(serverDry.structuredContent?.dev_server?.dry_run, true);
  const serverUnapproved = await client.callTool({ name: "vnem_tools_start_dev_server", arguments: { root: ".", script: "dev", port: 4317, dry_run: false } });
  assert.equal(serverUnapproved.isError, true);
  assert.equal(serverUnapproved.structuredContent?.code, "approval_required");
  const unsafeServer = await client.callTool({ name: "vnem_tools_start_dev_server", arguments: { root: ".", script: "deploy", port: 4317 } });
  assert.equal(unsafeServer.isError, true);
  assert.equal(unsafeServer.structuredContent?.code, "unsafe_script_blocked");
  const startedServer = await client.callTool({ name: "vnem_tools_start_dev_server", arguments: { root: ".", script: "dev", port: 4317, dry_run: false, approved: true, approval_note: "approve local test dev server", wait_ms: 500 } });
  assert.equal(startedServer.isError, undefined);
  assert.equal(startedServer.structuredContent?.dev_server?.started, true);
  const serverId = startedServer.structuredContent?.dev_server?.server_id;
  const listedServers = await client.callTool({ name: "vnem_tools_list_dev_servers", arguments: {} });
  assert.ok(listedServers.structuredContent?.dev_servers?.servers?.some((item) => item.server_id === serverId));

  const proofServer = createServer((req, res) => { res.writeHead(200, { "content-type": "text/html" }); res.end("<main id='app'>proof</main>"); });
  await new Promise((resolve) => proofServer.listen(0, "127.0.0.1", resolve));
  const proofPort = proofServer.address().port;
  const browser = await client.callTool({ name: "vnem_tools_browser_capture", arguments: { url: `http://127.0.0.1:${proofPort}/`, dry_run: false, approved: true, approval_note: "approve localhost browser proof", wait_ms: 50 } });
  assert.equal(browser.isError, undefined);
  assert.ok(["browser_unavailable", "captured"].includes(browser.structuredContent?.browser_capture?.status));
  await new Promise((resolve) => proofServer.close(resolve));

  const stopped = await client.callTool({ name: "vnem_tools_stop_dev_server", arguments: { server_id: serverId, approved: true, approval_note: "approve stopping Tools-started dev server" } });
  assert.equal(stopped.isError, undefined);
  assert.equal(stopped.structuredContent?.dev_server_stop?.stopped, true);
  const arbitraryStop = await client.callTool({ name: "vnem_tools_stop_dev_server", arguments: { server_id: "not-tools-started", approved: true, approval_note: "try arbitrary stop" } });
  assert.equal(arbitraryStop.isError, true);
  assert.equal(arbitraryStop.structuredContent?.code, "dev_server_not_found");

  console.log("vnem Tools project action tests passed");
} catch (error) {
  if (stderr.trim()) console.error(stderr.trim());
  throw error;
} finally {
  await client.close().catch(() => {});
  await rm(tmpRoot, { recursive: true, force: true });
}
