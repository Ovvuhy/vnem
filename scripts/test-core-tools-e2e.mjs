#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const tmpParent = path.join(rootDir, ".tmp");
await mkdir(tmpParent, { recursive: true });
const tmpRoot = await mkdtemp(path.join(tmpParent, "core-tools-e2e-"));
const workspace = path.join(tmpRoot, "weather-widget-project");
await mkdir(path.join(workspace, "src"), { recursive: true });
await writeFile(path.join(workspace, "package.json"), JSON.stringify({
  name: "weather-widget-placeholder",
  type: "module",
  scripts: { test: "node --check src/widget.js" }
}, null, 2), "utf8");
await writeFile(path.join(workspace, "src", "widget.js"), "export function weatherWidget() {\n  return 'old placeholder';\n}\n", "utf8");
await writeFile(path.join(workspace, "src", "widget.test.js"), "import { weatherWidget } from './widget.js';\nif (!weatherWidget().includes('placeholder')) throw new Error('missing placeholder');\n", "utf8");
await writeFile(path.join(workspace, "src", "widget.html"), "<!doctype html><html><body><main id=\"widget\"><h1>Weather widget placeholder ready</h1><p>Local visual proof target.</p></main></body></html>\n", "utf8");

const core = createClient("vnem-core-e2e", path.join(scriptDir, "vnem-mcp-server.mjs"), { VNEM_ROOT: rootDir });
const tools = createClient("vnem-tools-e2e", path.join(scriptDir, "vnem-tools-mcp-server.mjs"), {
  VNEM_TOOLS_ALLOWED_ROOTS: workspace,
  VNEM_TOOLS_PERMISSION_PROFILE: "creator-power",
  VNEM_TOOLS_EVIDENCE_ROOT: path.join(workspace, ".vnem", "tool-runs"),
  VNEM_TOOLS_ALLOW_LOCALHOST: "1",
  VNEM_TOOLS_BROWSER_COMMAND: "__vnem_missing_browser_for_deterministic_test__"
});

try {
  await core.client.connect(core.transport);
  await tools.client.connect(tools.transport);

  const coreTools = new Set((await core.client.listTools()).tools.map((tool) => tool.name));
  const toolsTools = new Set((await tools.client.listTools()).tools.map((tool) => tool.name));
  assert.equal(coreTools.has("vnem_boost_task"), true, "Core MCP should expose vnem_boost_task");
  assert.equal(coreTools.has("vnem_tools_apply_patch"), false, "Core MCP must not expose Tools mutation tools");
  assert.equal(toolsTools.has("vnem_tools_apply_patch"), true, "Tools MCP should expose patch tool");
  assert.equal(toolsTools.has("vnem_tools_restore_backup"), true, "Tools MCP should expose restore tool");
  assert.equal(toolsTools.has("vnem_tools_browser_capture"), true, "Tools MCP should expose browser capture tool");
  assert.equal(toolsTools.has("vnem_boost_task"), false, "Tools MCP must stay separate from Core MCP");

  const task = "Build a weather widget placeholder and prove it works.";
  const boost = await core.client.callTool({ name: "vnem_boost_task", arguments: { task, token_budget: "normal" } });
  assert.equal(boost.isError, undefined);
  const boosted = boost.structuredContent || {};
  assert.ok(JSON.stringify(boosted.workflow_steps || boosted.workflow || []).length > 20, "Core boost should include task-specific workflow steps");
  assert.ok(JSON.stringify(boosted.selected_usable_api_packs || boosted.selected_api_guidance || []).match(/open-meteo|weather/i), "Core boost should select weather API guidance or packs");
  assert.ok(JSON.stringify(boosted.selected_usable_skill_packs || boosted.selected_skill_guidance || []).length > 10, "Core boost should select usable skill guidance or packs");
  assert.ok(JSON.stringify(boosted.verification_plan || []).match(/mock|test|evidence|loading|error|success/i), "Core boost should include proof/evidence requirements");
  assert.ok(JSON.stringify(boosted.tools_mcp_handoff || boosted.tools_handoff || {}).match(/blocked_until_tools_mcp|safe_core_actions/i), "Core should describe Tools boundary instead of execution");
  assert.doesNotMatch(JSON.stringify(boosted), /\"applied\"\s*:\s*true|\"executed\"\s*:\s*true|\"status\"\s*:\s*200/i, "Core must not report applied/executed/live status results");
  const handoff = boosted.tools_mcp_handoff || boosted.tools_handoff;
  assert.ok(handoff && typeof handoff === "object", "Core boost should return a Tools MCP handoff object");
  assert.ok(JSON.stringify(handoff).match(/dry_run|rollback|evidence|permissions|required_tool/i), "Core handoff should include dry-run, rollback, permissions, and evidence needs");

  const plan = await tools.client.callTool({ name: "vnem_tools_prepare_action_plan", arguments: { task, core_handoff: handoff, requested_actions: ["file_edit", "test_runner", "evidence", "browser_screenshot"] } });
  assert.equal(plan.isError, undefined);
  const actionPlan = plan.structuredContent?.action_plan;
  assert.ok(actionPlan?.actions?.some((item) => /file_edit|patch/.test(item.action)), "Tools plan should include file edit capability");
  assert.ok(actionPlan?.actions?.some((item) => /test_runner|command/.test(item.action)), "Tools plan should include test command capability");
  assert.ok(actionPlan?.actions?.some((item) => /evidence/.test(item.action)), "Tools plan should include evidence collection capability");
  assert.equal(actionPlan?.dry_run_first, true, "Tools plan should require dry-run first");
  assert.ok(actionPlan?.rollback_or_restore_plan?.length > 0, "Tools plan should include rollback/restore plan");
  assert.ok(actionPlan?.actions?.some((item) => /browser_screenshot/.test(item.action)), "Tools plan should include browser screenshot capability");
  assert.equal(actionPlan?.blocked_actions?.some((item) => /browser_screenshot/.test(item.action)), false, "browser screenshot should be supported by Tools browser proof tool");

  const permission = await tools.client.callTool({
    name: "vnem_tools_permission_prompt",
    arguments: {
      action_type: "file_edit",
      target_paths: ["src/widget.js"],
      risk_level: "medium",
      reason: "Apply approved placeholder update from Core handoff.",
      dry_run_available: true,
      rollback_or_restore_plan: actionPlan.rollback_or_restore_plan
    }
  });
  assert.equal(permission.isError, undefined);
  for (const expected of [/exact action/i, /risk level/i, /scope/i, /dry-run/i, /rollback|restore/i, /evidence/i, /if approved/i, /if denied/i]) {
    assert.match(permission.content[0].text, expected, `permission prompt missing ${expected}`);
  }

  const patchText = [
    "*** Begin Patch",
    "*** Update File: src/widget.js",
    "@@",
    "-  return 'old placeholder';",
    "+  return 'weather widget placeholder ready';",
    "*** End Patch"
  ].join("\n");
  const beforePatch = await readFile(path.join(workspace, "src", "widget.js"), "utf8");
  const dryPatch = await tools.client.callTool({ name: "vnem_tools_apply_patch", arguments: { patch: patchText, target_root: ".", dry_run: true, backup: true } });
  assert.equal(dryPatch.isError, undefined);
  assert.equal(dryPatch.structuredContent?.patch?.dry_run, true);
  assert.equal(await readFile(path.join(workspace, "src", "widget.js"), "utf8"), beforePatch, "dry-run patch must not change file");

  const blockedPatch = await tools.client.callTool({ name: "vnem_tools_apply_patch", arguments: { patch: patchText, target_root: ".", dry_run: false, approved: false } });
  assert.equal(blockedPatch.isError, true, "real patch without approval must be blocked");
  assert.equal(blockedPatch.structuredContent?.code, "approval_required");

  const appliedPatch = await tools.client.callTool({ name: "vnem_tools_apply_patch", arguments: { patch: patchText, target_root: ".", dry_run: false, approved: true, approval_note: "E2E test approval: patch only temp workspace src/widget.js", backup: true } });
  assert.equal(appliedPatch.isError, undefined);
  assert.equal(appliedPatch.structuredContent?.patch?.applied, true);
  assert.ok(appliedPatch.structuredContent?.patch?.backup_path, "approved patch should create backup");
  const patchedContent = await readFile(path.join(workspace, "src", "widget.js"), "utf8");
  assert.match(patchedContent, /weather widget placeholder ready/);

  const command = await tools.client.callTool({ name: "vnem_tools_run_command", arguments: { command: "node --check src/widget.js", cwd: ".", dry_run: false, approved: true, approval_note: "E2E test approval: run syntax check in temp workspace", timeout_ms: 5000, max_output_bytes: 4000 } });
  assert.equal(command.isError, undefined);
  assert.equal(command.structuredContent?.command?.executed, true);
  assert.equal(command.structuredContent?.command?.exit_code, 0);

  const dryBrowser = await tools.client.callTool({ name: "vnem_tools_browser_capture", arguments: { file_path: "src/widget.html" } });
  assert.equal(dryBrowser.isError, undefined);
  assert.equal(dryBrowser.structuredContent?.browser_capture?.dry_run, true);
  assert.equal(dryBrowser.structuredContent?.browser_capture?.screenshot_path, null);
  const blockedBrowser = await tools.client.callTool({ name: "vnem_tools_browser_capture", arguments: { file_path: "src/widget.html", dry_run: false } });
  assert.equal(blockedBrowser.isError, true);
  assert.equal(blockedBrowser.structuredContent?.code, "approval_required");
  const externalBrowser = await tools.client.callTool({ name: "vnem_tools_browser_capture", arguments: { url: "https://example.com", dry_run: false, approved: true, approval_note: "E2E should not browse external sites" } });
  assert.equal(externalBrowser.isError, true);
  assert.equal(externalBrowser.structuredContent?.code, "external_url_blocked");
  const browserCaptureResult = await tools.client.callTool({
    name: "vnem_tools_browser_capture",
    arguments: { file_path: "src/widget.html", dry_run: false, approved: true, approval_note: "E2E test approval: capture only local temp workspace HTML screenshot", selector: "#widget", wait_ms: 50, max_screenshot_bytes: 2_000_000 }
  });
  assert.equal(browserCaptureResult.isError, undefined);
  const browserCapture = browserCaptureResult.structuredContent?.browser_capture;
  assert.ok(["captured", "browser_unavailable"].includes(browserCapture?.status));
  if (browserCapture.status === "captured") {
    assert.ok((await stat(browserCapture.screenshot_path)).isFile());
    assert.match(browserCapture.screenshot_sha256, /^[a-f0-9]{64}$/);
  } else {
    assert.ok(browserCapture.must_not_claim?.some((item) => /Visual proof|screenshot/i.test(item)));
  }

  const evidence = await tools.client.callTool({
    name: "vnem_tools_collect_evidence",
    arguments: {
      task,
      tool_run_ids: [appliedPatch.structuredContent?.patch?.evidence_log_id, command.structuredContent?.command?.evidence_log_id],
      changed_files: appliedPatch.structuredContent?.patch?.changed_files,
      commands_run: ["node --check src/widget.js"],
      api_requests: [],
      test_results: ["node --check src/widget.js passed"],
      screenshots: browserCapture.screenshot_path ? [browserCapture.screenshot_path] : [],
      browser_captures: [browserCapture],
      visual_checks: [browserCapture.status === "captured" ? "local browser screenshot captured" : "browser unavailable; screenshot not collected"],
      notes: "No live API call was performed. TOKEN=sample-sensitive-value must be redacted."
    }
  });
  assert.equal(evidence.isError, undefined);
  const evidenceBody = evidence.structuredContent?.evidence;
  assert.ok(evidenceBody?.evidence_id, "evidence should have id");
  assert.ok((await stat(evidenceBody.evidence_path)).isFile(), "evidence should be written to disk");
  assert.doesNotMatch(JSON.stringify(evidenceBody), /sample-sensitive-value/);
  assert.ok(evidenceBody.safe_to_claim?.some((item) => /patch|changed|approved|Tools/i.test(item)), "evidence should say patch/action can be claimed");
  assert.ok(evidenceBody.safe_to_claim?.some((item) => /command|check|passed/i.test(item)), "evidence should say verification command passed");
  if (browserCapture.status === "captured") {
    assert.ok(evidenceBody.safe_to_claim?.some((item) => /browser screenshot evidence/i.test(item)), "evidence should allow visual proof claim only when screenshot exists");
    assert.equal(evidenceBody.must_not_claim?.some((item) => /Visual\/browser verification was performed/i.test(item)), false);
    assert.ok(evidenceBody.proof_trail_compatible_summary?.screenshot_paths?.includes(browserCapture.screenshot_path));
  } else {
    assert.ok(evidenceBody.must_not_claim?.some((item) => /browser|visual|screenshot/i.test(item)), "evidence should forbid visual proof overclaim when unavailable");
    assert.ok(evidenceBody.proof_trail_compatible_summary?.recommended_final_report_lines?.some((line) => /browser proof.*unavailable|No browser visual proof/i.test(line)), "proof bridge should recommend honest visual limitation line");
  }
  assert.ok(evidenceBody.must_not_claim?.some((item) => /live API|API call/i.test(item)), "evidence should forbid live API overclaim");
  assert.ok(evidenceBody.proof_trail_compatible_summary?.recommended_core_proof_trail_inputs?.tests_or_checks?.includes("node --check src/widget.js passed"));

  const audit = await core.client.callTool({
    name: "vnem_completion_audit",
    arguments: {
      task,
      claimed_result: evidenceBody.proof_trail_compatible_summary.recommended_final_report_lines.join(" "),
      evidence: evidenceBody.proof_trail_compatible_summary.recommended_final_report_lines,
      commands_run: evidenceBody.commands_run,
      changed_files: evidenceBody.changed_files,
      token_budget: "compact"
    }
  });
  assert.equal(audit.isError, undefined);
  assert.notEqual(audit.structuredContent?.verdict, "blocked", "proof-compatible evidence summary should not be blocked");

  const proof = await core.client.callTool({
    name: "vnem_proof_trail",
    arguments: {
      task,
      capability_ids_used: ["vnem_boost_task", "vnem_tools_apply_patch", "vnem_tools_run_command", "vnem_tools_collect_evidence"],
      completion_audit: audit.structuredContent,
      commands_run: evidenceBody.commands_run,
      tests_or_checks: evidenceBody.tests,
      changed_files: evidenceBody.changed_files,
      remaining_risks: evidenceBody.remaining_risks,
      final_claim: evidenceBody.proof_trail_compatible_summary.recommended_final_report_lines.join(" "),
      token_budget: "compact"
    }
  });
  assert.equal(proof.isError, undefined);
  const proofText = JSON.stringify(proof.structuredContent);
  assert.match(proofText, /proof|evidence|VNEM/i);
  if (browserCapture.status === "captured") {
    assert.match(evidenceBody.proof_trail_compatible_summary.recommended_final_report_lines.join("\n"), /Browser screenshot evidence captured/i);
  } else {
    assert.doesNotMatch(evidenceBody.proof_trail_compatible_summary.recommended_final_report_lines.join("\n"), /browser screenshot evidence captured|live API call succeeded/i);
  }

  console.log("VNEM Core→Tools end-to-end workflow test passed");
} finally {
  await core.client.close().catch(() => {});
  await tools.client.close().catch(() => {});
  await rm(tmpRoot, { recursive: true, force: true });
}

function createClient(name, serverPath, extraEnv = {}) {
  const client = new Client({ name, version: "1.0.1" }, { capabilities: {} });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
    cwd: rootDir,
    env: { ...process.env, ...extraEnv },
    stderr: "pipe"
  });
  transport.stderr?.on("data", (chunk) => process.stderr.write(chunk));
  return { client, transport };
}
