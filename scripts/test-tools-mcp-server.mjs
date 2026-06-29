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
const serverPath = path.join(scriptDir, "vnem-tools-mcp-server.mjs");
await mkdir(path.join(rootDir, ".tmp"), { recursive: true });
const tmpRoot = await mkdtemp(path.join(rootDir, ".tmp", "tools-mcp-"));
const projectDir = path.join(tmpRoot, "project");
const outsideDir = path.join(tmpRoot, "outside");
await mkdir(path.join(projectDir, "src"), { recursive: true });
await mkdir(path.join(projectDir, "node_modules", "ignored"), { recursive: true });
await mkdir(path.join(projectDir, ".git"), { recursive: true });
await mkdir(path.join(projectDir, "dist"), { recursive: true });
await mkdir(outsideDir, { recursive: true });
await writeFile(path.join(projectDir, "src", "app.txt"), "weather widget says old\n", "utf8");
await writeFile(path.join(projectDir, "src", "test-ok.js"), "const value = 1;\n", "utf8");
await writeFile(path.join(projectDir, "src", "config.txt"), "API_KEY=sample-sensitive-value\npublic=true\n", "utf8");
await writeFile(path.join(projectDir, ".env"), "TOKEN=example-placeholder\n", "utf8");
await writeFile(path.join(projectDir, "node_modules", "ignored", "pkg.js"), "weather hidden\n", "utf8");
await writeFile(path.join(projectDir, ".git", "config"), "weather hidden\n", "utf8");
await writeFile(path.join(projectDir, "dist", "bundle.js"), "weather hidden\n", "utf8");
await writeFile(path.join(outsideDir, "outside.txt"), "outside old\n", "utf8");

const apiServer = createServer((request, response) => {
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify({ ok: true, path: request.url, secret: "sample-redact-12345" }));
});
await new Promise((resolve) => apiServer.listen(0, "127.0.0.1", resolve));
const apiPort = apiServer.address().port;

const client = new Client(
  { name: "vnem-tools-mcp-smoke-test", version: "1.0.1" },
  { capabilities: {} }
);
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [serverPath],
  cwd: rootDir,
  env: {
    ...process.env,
    VNEM_TOOLS_ALLOWED_ROOTS: projectDir,
    VNEM_TOOLS_PERMISSION_PROFILE: "creator-power",
    VNEM_TOOLS_EVIDENCE_ROOT: path.join(projectDir, ".vnem", "tool-runs"),
    VNEM_TOOLS_ALLOW_LOCALHOST: "1"
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
  const toolNames = new Set(listed.tools.map((tool) => tool.name));
  const requiredTools = [
    "vnem_tools_status",
    "vnem_tools_prepare_action_plan",
    "vnem_tools_permission_prompt",
    "vnem_tools_read_file",
    "vnem_tools_list_files",
    "vnem_tools_search_files",
    "vnem_tools_apply_patch",
    "vnem_tools_run_command",
    "vnem_tools_api_request",
    "vnem_tools_collect_evidence",
    "vnem_tools_restore_backup",
    "vnem_tools_browser_capture",
    "vnem_tools_browser_page_inspect",
    "vnem_tools_browser_readability_extract",
    "vnem_tools_browser_link_map",
    "vnem_tools_browser_dom_search",
    "vnem_tools_browser_accessibility_audit",
    "vnem_tools_browser_compare_snapshots",
    "vnem_tools_browser_research_pack",
    "vnem_tools_search_provider_manifest",
    "vnem_tools_search_query_builder",
    "vnem_tools_web_search",
    "vnem_tools_search_result_ranker",
    "vnem_tools_redirect_chain_check",
    "vnem_tools_url_reputation_check",
    "vnem_tools_captcha_detector",
    "vnem_tools_download_safety_check",
    "vnem_tools_claim_source_matrix",
    "vnem_tools_research_gap_detector",
    "vnem_tools_apply_patch_batch",
    "vnem_tools_restore_batch",
    "vnem_tools_project_scan",
    "vnem_tools_run_project_task",
    "vnem_tools_start_dev_server",
    "vnem_tools_stop_dev_server",
    "vnem_tools_list_dev_servers",
    "vnem_tools_start_session",
    "vnem_tools_finish_session",
    "vnem_tools_git_status",
    "vnem_tools_git_diff_summary",
    "vnem_tools_git_commit"
  ];
  for (const name of requiredTools) assert.equal(toolNames.has(name), true, `missing ${name}`);
  assert.equal(toolNames.has("vnem_boost_task"), false, "Tools MCP must stay separate from Core MCP tools");
  assert.equal(toolNames.has("mcp_apply_diff_patch"), false, "Tools MCP must not duplicate Precision MCP tool names");

  const status = await client.callTool({ name: "vnem_tools_status", arguments: {} });
  assert.equal(status.isError, undefined);
  assert.equal(status.structuredContent?.tools_status?.server_name, "vnem-tools");
  assert.equal(status.structuredContent?.tools_status?.read_only, false);
  assert.equal(status.structuredContent?.tools_status?.dry_run_default, true);
  assert.equal(status.structuredContent?.tools_status?.approval_required_for_mutation, true);
  assert.ok(status.structuredContent?.tools_status?.allowed_roots?.includes(projectDir));
  assert.ok(status.structuredContent?.tools_status?.command_allowlist?.some((item) => item.includes("node --check")));
  assert.equal(status.structuredContent?.tools_status?.browser_policy?.local_url_only, true);
  assert.equal(status.structuredContent?.tools_status?.browser_policy?.external_url_default_block, true);
  assert.equal(status.structuredContent?.tools_status?.browser_policy?.approval_required, true);
  assert.equal(status.structuredContent?.tools_status?.patch_batch_policy?.no_partial_apply_by_default, true);
  assert.equal(status.structuredContent?.tools_status?.project_scan_policy?.skips_secrets, true);
  assert.equal(status.structuredContent?.tools_status?.project_task_policy?.package_install_publish_deploy_blocked, true);
  assert.equal(status.structuredContent?.tools_status?.dev_server_policy?.local_host_only, true);
  assert.equal(status.structuredContent?.tools_status?.session_evidence_policy?.writes_single_json_proof_pack, true);
  assert.equal(status.structuredContent?.tools_status?.local_git_policy?.git_push_blocked, true);

  const coreHandoff = {
    task_summary: "Build a weather widget for my web app.",
    selected_usable_api_packs: ["api:weather:open-meteo"],
    selected_usable_skill_packs: ["skill:ui-frontend-quality"],
    required_tool_capabilities: ["file_edit", "test_runner", "api_request", "browser_screenshot"],
    required_permissions: ["approve file edits", "approve tests", "approve live API call if not mocked"],
    risk_level: "medium",
    dry_run_first: true,
    rollback_or_restore_plan: ["make file backup", "keep diff patch", "disable API integration if tests fail"],
    evidence_to_collect: ["changed files", "test output", "mocked API result", "UI screenshot"],
    blocked_until_tools_mcp: ["file edits", "test execution", "live API calls"],
    safe_core_actions: ["plan", "choose packs", "define proof"],
    must_not_claim: ["Core executed the API", "changes were applied without tests"]
  };
  const plan = await client.callTool({
    name: "vnem_tools_prepare_action_plan",
    arguments: { task: "Build a weather widget", core_handoff: coreHandoff, requested_actions: ["file_edit", "api_request", "browser_screenshot"] }
  });
  assert.equal(plan.isError, undefined);
  assert.deepEqual(plan.structuredContent?.action_plan?.selected_usable_api_packs, ["api:weather:open-meteo"]);
  assert.deepEqual(plan.structuredContent?.action_plan?.selected_usable_skill_packs, ["skill:ui-frontend-quality"]);
  assert.equal(plan.structuredContent?.action_plan?.dry_run_first, true);
  assert.ok(plan.structuredContent?.action_plan?.required_permissions?.includes("approve file edits"));
  assert.ok(plan.structuredContent?.action_plan?.actions?.some((item) => /browser_screenshot/.test(item.action)));
  assert.equal(plan.structuredContent?.action_plan?.blocked_actions?.some((item) => /browser_screenshot/.test(item.action)), false);

  const prompt = await client.callTool({
    name: "vnem_tools_permission_prompt",
    arguments: {
      action_type: "file_edit",
      target_paths: ["src/app.txt"],
      risk_level: "medium",
      reason: "Apply approved weather widget change.",
      dry_run_available: true,
      rollback_or_restore_plan: ["restore backup file"]
    }
  });
  assert.equal(prompt.isError, undefined);
  assert.match(prompt.content[0].text, /What permission is requested/i);
  assert.match(prompt.content[0].text, /risk level/i);
  assert.match(prompt.content[0].text, /rollback/i);
  assert.match(prompt.content[0].text, /if approved/i);
  assert.match(prompt.content[0].text, /if denied/i);

  const readOk = await client.callTool({ name: "vnem_tools_read_file", arguments: { path: "src/config.txt", max_bytes: 2000 } });
  assert.equal(readOk.isError, undefined);
  assert.match(readOk.structuredContent?.file?.content, /\[REDACTED\]/);
  assert.doesNotMatch(readOk.structuredContent?.file?.content, /sample-sensitive-value/);
  const readSecret = await client.callTool({ name: "vnem_tools_read_file", arguments: { path: ".env" } });
  assert.equal(readSecret.isError, true);
  assert.equal(readSecret.structuredContent?.code, "secret_path_blocked");
  const readOutside = await client.callTool({ name: "vnem_tools_read_file", arguments: { path: path.join(outsideDir, "outside.txt") } });
  assert.equal(readOutside.isError, true);
  assert.equal(readOutside.structuredContent?.code, "path_outside_allowed_roots");

  const list = await client.callTool({ name: "vnem_tools_list_files", arguments: { root: ".", max_results: 20 } });
  assert.equal(list.isError, undefined);
  const listedPaths = list.structuredContent?.files?.results?.map((item) => item.path).join("\n");
  assert.match(listedPaths, /src\/app\.txt/);
  assert.doesNotMatch(listedPaths, /node_modules|\.git|dist|\.env/);

  const search = await client.callTool({ name: "vnem_tools_search_files", arguments: { root: ".", query: "weather", max_results: 10 } });
  assert.equal(search.isError, undefined);
  assert.ok(search.structuredContent?.search?.results?.some((item) => item.path === "src/app.txt" && item.line_number === 1));
  assert.equal(search.structuredContent?.search?.results?.some((item) => /node_modules|\.git|dist|\.env/.test(item.path)), false);

  const patchText = [
    "*** Begin Patch",
    "*** Update File: src/app.txt",
    "@@",
    "-weather widget says old",
    "+weather widget says new",
    "*** End Patch"
  ].join("\n");
  const dryPatch = await client.callTool({ name: "vnem_tools_apply_patch", arguments: { patch: patchText, target_root: "." } });
  assert.equal(dryPatch.isError, undefined);
  assert.equal(dryPatch.structuredContent?.patch?.dry_run, true);
  assert.equal(dryPatch.structuredContent?.patch?.applied, false);
  assert.equal(await readFile(path.join(projectDir, "src", "app.txt"), "utf8"), "weather widget says old\n");
  const unapprovedPatch = await client.callTool({ name: "vnem_tools_apply_patch", arguments: { patch: patchText, target_root: ".", dry_run: false } });
  assert.equal(unapprovedPatch.isError, true);
  assert.equal(unapprovedPatch.structuredContent?.code, "approval_required");
  const outsidePatch = await client.callTool({
    name: "vnem_tools_apply_patch",
    arguments: { patch: patchText.replace("src/app.txt", "../outside/outside.txt"), target_root: "." }
  });
  assert.equal(outsidePatch.isError, true);
  assert.equal(outsidePatch.structuredContent?.code, "path_outside_allowed_roots");
  const secretPatch = await client.callTool({
    name: "vnem_tools_apply_patch",
    arguments: { patch: patchText.replace("src/app.txt", ".env"), target_root: "." }
  });
  assert.equal(secretPatch.isError, true);
  assert.equal(secretPatch.structuredContent?.code, "secret_path_blocked");
  const appliedPatch = await client.callTool({
    name: "vnem_tools_apply_patch",
    arguments: { patch: patchText, target_root: ".", dry_run: false, approved: true, approval_note: "User approved test file patch", backup: true }
  });
  assert.equal(appliedPatch.isError, undefined);
  assert.equal(appliedPatch.structuredContent?.patch?.applied, true);
  assert.ok(appliedPatch.structuredContent?.patch?.backup_path);
  assert.ok(appliedPatch.structuredContent?.patch?.evidence_log_id);
  assert.equal(await readFile(path.join(projectDir, "src", "app.txt"), "utf8"), "weather widget says new\n");

  const restoreDryRun = await client.callTool({
    name: "vnem_tools_restore_backup",
    arguments: { backup_path: appliedPatch.structuredContent?.patch?.backup_path, target_path: "src/app.txt" }
  });
  assert.equal(restoreDryRun.isError, undefined);
  assert.equal(restoreDryRun.structuredContent?.restore?.dry_run, true);
  assert.equal(await readFile(path.join(projectDir, "src", "app.txt"), "utf8"), "weather widget says new\n");
  const unapprovedRestore = await client.callTool({
    name: "vnem_tools_restore_backup",
    arguments: { backup_path: appliedPatch.structuredContent?.patch?.backup_path, target_path: "src/app.txt", dry_run: false }
  });
  assert.equal(unapprovedRestore.isError, true);
  assert.equal(unapprovedRestore.structuredContent?.code, "approval_required");
  const outsideRestore = await client.callTool({
    name: "vnem_tools_restore_backup",
    arguments: { backup_path: path.join(outsideDir, "outside.txt"), target_path: "src/app.txt" }
  });
  assert.equal(outsideRestore.isError, true);
  assert.equal(outsideRestore.structuredContent?.code, "path_outside_allowed_roots");
  const secretRestore = await client.callTool({
    name: "vnem_tools_restore_backup",
    arguments: { backup_path: appliedPatch.structuredContent?.patch?.backup_path, target_path: ".env" }
  });
  assert.equal(secretRestore.isError, true);
  assert.equal(secretRestore.structuredContent?.code, "secret_path_blocked");
  const approvedRestore = await client.callTool({
    name: "vnem_tools_restore_backup",
    arguments: { backup_path: appliedPatch.structuredContent?.patch?.backup_path, target_path: "src/app.txt", dry_run: false, approved: true, approval_note: "User approved test restore" }
  });
  assert.equal(approvedRestore.isError, undefined);
  assert.equal(approvedRestore.structuredContent?.restore?.restored, true);
  assert.ok(approvedRestore.structuredContent?.restore?.evidence_log_id);
  assert.equal(await readFile(path.join(projectDir, "src", "app.txt"), "utf8"), "weather widget says old\n");

  const reappliedPatch = await client.callTool({
    name: "vnem_tools_apply_patch",
    arguments: { patch: patchText, target_root: ".", dry_run: false, approved: true, approval_note: "User approved reapply after restore", backup: true }
  });
  assert.equal(reappliedPatch.isError, undefined);
  assert.equal(await readFile(path.join(projectDir, "src", "app.txt"), "utf8"), "weather widget says new\n");

  const dryCommand = await client.callTool({ name: "vnem_tools_run_command", arguments: { command: "node --check src/test-ok.js", cwd: "." } });
  assert.equal(dryCommand.isError, undefined);
  assert.equal(dryCommand.structuredContent?.command?.dry_run, true);
  assert.equal(dryCommand.structuredContent?.command?.executed, false);
  const blockedCommand = await client.callTool({ name: "vnem_tools_run_command", arguments: { command: "rm -rf src", cwd: ".", dry_run: false, approved: true, approval_note: "try dangerous" } });
  assert.equal(blockedCommand.isError, true);
  assert.equal(blockedCommand.structuredContent?.code, "dangerous_command_blocked");
  const unapprovedCommand = await client.callTool({ name: "vnem_tools_run_command", arguments: { command: "node --check src/test-ok.js", cwd: ".", dry_run: false } });
  assert.equal(unapprovedCommand.isError, true);
  assert.equal(unapprovedCommand.structuredContent?.code, "approval_required");
  const command = await client.callTool({
    name: "vnem_tools_run_command",
    arguments: { command: "node --check src/test-ok.js", cwd: ".", dry_run: false, approved: true, approval_note: "User approved safe syntax check", timeout_ms: 5000, max_output_bytes: 1000 }
  });
  assert.equal(command.isError, undefined);
  assert.equal(command.structuredContent?.command?.executed, true);
  assert.equal(command.structuredContent?.command?.exit_code, 0);
  const cappedDryCommand = await client.callTool({ name: "vnem_tools_run_command", arguments: { command: "node --check src/test-ok.js", timeout_ms: 999999, max_output_bytes: 999999 } });
  assert.ok(cappedDryCommand.structuredContent?.command?.timeout_ms <= 60000);
  assert.ok(cappedDryCommand.structuredContent?.command?.max_output_bytes <= 65536);

  const apiUrl = `http://127.0.0.1:${apiPort}/weather?city=test`;
  const dryApi = await client.callTool({ name: "vnem_tools_api_request", arguments: { api_pack_id: "api:weather:open-meteo", url: apiUrl } });
  assert.equal(dryApi.isError, undefined);
  assert.equal(dryApi.structuredContent?.api_request?.dry_run, true);
  assert.equal(dryApi.structuredContent?.api_request?.executed, false);
  const secretHeaderName = ["Author", "ization"].join("");
  const rawSecretHeaders = { [secretHeaderName]: ["Bearer", "example-token"].join(" ") };
  const rawSecretApi = await client.callTool({ name: "vnem_tools_api_request", arguments: { api_pack_id: "api:weather:open-meteo", url: apiUrl, headers: rawSecretHeaders } });
  assert.equal(rawSecretApi.isError, true);
  assert.equal(rawSecretApi.structuredContent?.code, "raw_secret_blocked");
  const unapprovedApi = await client.callTool({ name: "vnem_tools_api_request", arguments: { api_pack_id: "api:weather:open-meteo", url: apiUrl, dry_run: false } });
  assert.equal(unapprovedApi.isError, true);
  assert.equal(unapprovedApi.structuredContent?.code, "approval_required");
  const liveApi = await client.callTool({
    name: "vnem_tools_api_request",
    arguments: { api_pack_id: "api:weather:open-meteo", url: apiUrl, dry_run: false, approved: true, approval_note: "User approved localhost mock API request", max_response_bytes: 2000 }
  });
  assert.equal(liveApi.isError, undefined);
  assert.equal(liveApi.structuredContent?.api_request?.status, 200);
  assert.doesNotMatch(JSON.stringify(liveApi.structuredContent), /sample-redact-12345/);

  const evidence = await client.callTool({
    name: "vnem_tools_collect_evidence",
    arguments: {
      task: "Build a weather widget",
      tool_run_ids: [appliedPatch.structuredContent?.patch?.evidence_log_id, command.structuredContent?.command?.evidence_log_id, liveApi.structuredContent?.api_request?.evidence_log_id],
      changed_files: ["src/app.txt"],
      commands_run: ["node --check src/test-ok.js"],
      api_requests: [apiUrl],
      test_results: ["syntax check passed"],
      notes: "TOKEN=sample-sensitive-value should be redacted"
    }
  });
  assert.equal(evidence.isError, undefined);
  assert.ok(evidence.structuredContent?.evidence?.evidence_id);
  assert.equal(evidence.structuredContent?.evidence?.safe_to_claim?.includes("Approved Tools MCP actions were run with evidence logs."), true);
  assert.equal(evidence.structuredContent?.evidence?.must_not_claim?.includes("Browser screenshots were captured."), true);
  assert.ok(evidence.structuredContent?.evidence?.proof_trail_compatible_summary?.recommended_final_report_lines?.length > 0);
  assert.ok(evidence.structuredContent?.evidence?.proof_trail_compatible_summary?.recommended_core_proof_trail_inputs?.tests_or_checks?.includes("syntax check passed"));
  assert.doesNotMatch(JSON.stringify(evidence.structuredContent), /sample-sensitive-value/);
  const evidencePath = evidence.structuredContent?.evidence?.evidence_path;
  assert.ok((await stat(evidencePath)).isFile());
  const evidenceText = await readFile(evidencePath, "utf8");
  assert.doesNotMatch(evidenceText, /sample-sensitive-value/);

  console.log("vnem Tools MCP smoke test passed");
} catch (error) {
  if (stderr.trim()) console.error(stderr.trim());
  throw error;
} finally {
  await client.close().catch(() => {});
  await new Promise((resolve) => apiServer.close(resolve));
  await new Promise((resolve) => setTimeout(resolve, 150));
  await rm(tmpRoot, { recursive: true, force: true });
}
