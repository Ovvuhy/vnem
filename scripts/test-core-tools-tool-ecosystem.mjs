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
const tmpRoot = await mkdtemp(path.join(rootDir, ".tmp", "core-tools-ecosystem-"));
const workspace = path.join(tmpRoot, "small-app");
await mkdir(path.join(workspace, "src"), { recursive: true });
await writeFile(path.join(workspace, "package.json"), JSON.stringify({
  type: "module",
  scripts: { test: "node src/app.test.js", build: "node --check src/app.js" },
  dependencies: { vite: "1.0.0" }
}, null, 2), "utf8");
await writeFile(path.join(workspace, "src", "app.js"), "export function message() { return 'old app'; }\n", "utf8");
await writeFile(path.join(workspace, "src", "app.test.js"), "import { message } from './app.js';\nif (!message().includes('improved')) throw new Error('not improved');\nconsole.log('ecosystem test ok');\n", "utf8");
await writeFile(path.join(workspace, "src", "index.html"), "<main>old app</main>\n", "utf8");

const core = createClient("vnem-core-ecosystem", path.join(scriptDir, "vnem-mcp-server.mjs"), { VNEM_ROOT: rootDir });
const tools = createClient("vnem-tools-ecosystem", path.join(scriptDir, "vnem-tools-mcp-server.mjs"), { VNEM_TOOLS_ALLOWED_ROOTS: workspace, VNEM_TOOLS_PERMISSION_PROFILE: "approved-writes", VNEM_TOOLS_EVIDENCE_ROOT: path.join(workspace, ".vnem", "tool-runs"), VNEM_TOOLS_BROWSER_COMMAND: "__vnem_missing_browser_for_deterministic_test__" });
try {
  await core.client.connect(core.transport);
  await tools.client.connect(tools.transport);

  const task = "Improve this small app and prove it works.";
  const planCall = await core.client.callTool({ name: "vnem_build_tools_plan", arguments: { task, known_context: "Small local Node/Vite-style app" } });
  assert.equal(planCall.isError, undefined);
  const plan = planCall.structuredContent?.tools_plan;
  for (const expected of ["vnem_tools_workspace_map", "vnem_tools_code_search", "vnem_tools_read_many_files", "vnem_tools_apply_patch_batch", "vnem_tools_run_project_task", "vnem_tools_finish_session"]) {
    assert.ok(plan.selected_tools.includes(expected), `Core plan missing ${expected}`);
  }
  assert.equal(plan.core_executes_tools, false);
  assert.ok(plan.must_not_claim.some((item) => /Core executed/i.test(item)));

  const session = await tools.client.callTool({ name: "vnem_tools_start_session", arguments: { task, actions_planned: plan.tool_sequence.map((step) => step.tool) } });
  assert.equal(session.isError, undefined);
  const sessionId = session.structuredContent?.session?.session_id;
  assert.ok(sessionId);

  const map = await tools.client.callTool({ name: "vnem_tools_workspace_map", arguments: { root: ".", max_depth: 3, max_files: 40, session_id: sessionId } });
  assert.equal(map.isError, undefined);
  assert.ok(map.structuredContent?.workspace_map?.likely_entrypoints?.includes("src/app.js"));

  const search = await tools.client.callTool({ name: "vnem_tools_code_search", arguments: { root: ".", query: "old app", file_globs: ["*.js", "*.html"], session_id: sessionId } });
  assert.equal(search.isError, undefined);
  assert.ok(search.structuredContent?.code_search?.result_count >= 1);

  const readMany = await tools.client.callTool({ name: "vnem_tools_read_many_files", arguments: { root: ".", paths: ["src/app.js", "src/app.test.js"], session_id: sessionId } });
  assert.equal(readMany.isError, undefined);
  assert.equal(readMany.structuredContent?.read_many_files?.files?.length, 2);

  const deps = await tools.client.callTool({ name: "vnem_tools_dependency_scan", arguments: { root: ".", session_id: sessionId } });
  assert.equal(deps.isError, undefined);
  assert.ok(deps.structuredContent?.dependency_scan?.likely_frameworks?.includes("Vite"));

  const patch = await tools.client.callTool({ name: "vnem_tools_apply_patch_batch", arguments: { target_root: ".", session_id: sessionId, operations: [{ op: "replace", path: "src/app.js", search: "old app", replace: "improved app" }, { op: "replace", path: "src/index.html", search: "old app", replace: "improved app" }], dry_run: false, approved: true, approval_note: "approve isolated ecosystem test patch" } });
  assert.equal(patch.isError, undefined);
  assert.equal(patch.structuredContent?.patch_batch?.applied, true);
  assert.match(await readFile(path.join(workspace, "src", "app.js"), "utf8"), /improved app/);

  const taskRun = await tools.client.callTool({ name: "vnem_tools_run_project_task", arguments: { task: "test", root: ".", dry_run: false, approved: true, approval_note: "approve isolated ecosystem test", session_id: sessionId } });
  assert.equal(taskRun.isError, undefined);
  assert.equal(taskRun.structuredContent?.project_task?.exit_code, 0);

  const browser = await tools.client.callTool({ name: "vnem_tools_browser_capture", arguments: { file_path: "src/index.html", dry_run: false, approved: true, approval_note: "approve deterministic browser unavailable path", session_id: sessionId } });
  assert.equal(browser.isError, undefined);
  assert.ok(["captured", "browser_unavailable"].includes(browser.structuredContent?.browser_capture?.status));

  const evidence = await tools.client.callTool({ name: "vnem_tools_finish_session", arguments: { session_id: sessionId, test_results: ["npm test passed"], notes: "ecosystem cooperation test" } });
  assert.equal(evidence.isError, undefined);
  const pack = evidence.structuredContent?.session_evidence;
  assert.ok(pack.patches_applied.length >= 1);
  assert.ok(pack.commands_run.length >= 1);
  assert.ok(pack.browser_captures.length >= 1);
  assert.ok(pack.safe_to_claim.some((item) => /evidence logged|Patch batch|Safe project/i.test(item)));
  assert.ok(pack.must_not_claim.some((item) => /GitHub|Package install|Secrets|Browser visual verification/i.test(item)));

  const researchPlan = await core.client.callTool({ name: "vnem_build_tools_plan", arguments: { task: "Research this provided source and decide which claims are supported" } });
  assert.equal(researchPlan.isError, undefined);
  const rp = researchPlan.structuredContent?.tools_plan;
  assert.ok(rp.selected_tools.includes("vnem_tools_source_quality_check"));
  assert.ok(rp.selected_tools.includes("vnem_tools_research_brief"));
  assert.ok(rp.must_not_claim.some((item) => /search happened|web search/i.test(item)));

  console.log("vnem Core+Tools tool ecosystem test passed");
} finally {
  await core.client.close().catch(() => {});
  await tools.client.close().catch(() => {});
  await rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
  if (core.stderr.trim()) process.stderr.write(core.stderr);
  if (tools.stderr.trim()) process.stderr.write(tools.stderr);
}

function createClient(name, serverPath, env) {
  const client = new Client({ name, version: "1.0.1" }, { capabilities: {} });
  const transport = new StdioClientTransport({ command: process.execPath, args: [serverPath], cwd: rootDir, env: { ...process.env, ...env }, stderr: "pipe" });
  const wrapper = { client, transport, stderr: "" };
  transport.stderr?.on("data", (chunk) => { wrapper.stderr += chunk.toString(); });
  return wrapper;
}
