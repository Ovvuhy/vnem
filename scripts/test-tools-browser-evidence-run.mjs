#!/usr/bin/env node
import assert from "node:assert/strict";
import http from "node:http";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
await mkdir(path.join(rootDir, ".tmp"), { recursive: true });
const tmpRoot = await mkdtemp(path.join(rootDir, ".tmp", "tools-browser-evidence-run-"));
const workspace = path.join(tmpRoot, "project");
await mkdir(workspace, { recursive: true });
await writeFile(path.join(workspace, ".env"), "TOKEN=example-placeholder\n", "utf8");

const pageHtml = `<!doctype html><html><head><title>Evidence Run Fixture</title></head><body><main><h1>Dashboard Ready</h1><p id="empty">No projects yet</p><button>Refresh</button></main></body></html>`;
const server = http.createServer((req, res) => {
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.end(pageHtml);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const baseUrl = `http://127.0.0.1:${server.address().port}`;

async function withClient(env, fn) {
  const client = new Client({ name: "vnem-tools-browser-evidence-run-test", version: "1.0.1" }, { capabilities: {} });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(scriptDir, "vnem-tools-mcp-server.mjs")],
    cwd: rootDir,
    env: {
      ...process.env,
      VNEM_TOOLS_ALLOWED_ROOTS: workspace,
      VNEM_TOOLS_EVIDENCE_ROOT: path.join(workspace, ".vnem", "tool-runs"),
      ...env
    },
    stderr: "pipe"
  });
  let stderr = "";
  transport.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });
  try {
    await client.connect(transport);
    return await fn(client);
  } finally {
    await client.close().catch(() => {});
    if (stderr.trim()) process.stderr.write(stderr);
  }
}

try {
  await withClient({ VNEM_TOOLS_PERMISSION_PROFILE: "safe-readonly", VNEM_TOOLS_ALLOW_LOCALHOST: "1" }, async (client) => {
    const tools = new Set((await client.listTools()).tools.map((tool) => tool.name));
    assert.equal(tools.has("vnem_tools_browser_evidence_run"), true, "browser evidence run tool should be registered");
    const blocked = await client.callTool({ name: "vnem_tools_browser_evidence_run", arguments: { app_url: baseUrl, routes: ["/"], dry_run: false, approved: true, approval_note: "approved local fixture proof" } });
    assert.equal(blocked.isError, undefined);
    const run = blocked.structuredContent?.browser_evidence_run;
    assert.equal(run.status, "blocked");
    assert.equal(run.browser_was_run, false);
    assert.equal(run.failures_or_blockers.some((item) => /permission_profile_blocked|safe-readonly/i.test(JSON.stringify(item))), true);
    assert.equal(run.safe_to_claim, false);
    assert.ok(run.must_not_claim.some((item) => /browser proof|screenshot|visual/i.test(item)));
  });

  await withClient({ VNEM_TOOLS_PERMISSION_PROFILE: "safe-local-dev", VNEM_TOOLS_BROWSER_COMMAND: "__vnem_missing_browser_for_deterministic_test__" }, async (client) => {
    const blocked = await client.callTool({ name: "vnem_tools_browser_evidence_run", arguments: { app_url: baseUrl, routes: ["/"], dry_run: false, approved: true, approval_note: "approved local fixture proof" } });
    const run = blocked.structuredContent?.browser_evidence_run;
    assert.equal(run.status, "blocked");
    assert.equal(run.browser_was_run, false);
    assert.match(run.localhost_policy.reason, /VNEM_TOOLS_ALLOW_LOCALHOST=1/i);
  });

  await withClient({ VNEM_TOOLS_PERMISSION_PROFILE: "safe-local-dev", VNEM_TOOLS_ALLOW_LOCALHOST: "1", VNEM_TOOLS_BROWSER_COMMAND: "__vnem_missing_browser_for_deterministic_test__" }, async (client) => {
    const external = await client.callTool({ name: "vnem_tools_browser_evidence_run", arguments: { app_url: "https://example.com/private", routes: ["/"], dry_run: false, approved: true, approval_note: "approved external fixture check" } });
    const externalRun = external.structuredContent?.browser_evidence_run;
    assert.equal(externalRun.status, "blocked");
    assert.equal(externalRun.browser_was_run, false);
    assert.ok(externalRun.failures_or_blockers.some((item) => /external|approved safe URL|localhost/i.test(JSON.stringify(item))));

    const runCall = await client.callTool({ name: "vnem_tools_browser_evidence_run", arguments: {
      browser_evidence_plan: {
        app_url: baseUrl,
        routes_to_visit: ["/", "/empty"],
        user_flow_steps: ["load dashboard", "verify empty state"],
        viewports: [{ label: "mobile", width: 390, height: 844 }, { label: "desktop", width: 1440, height: 900 }],
        states_to_force_or_verify: ["empty", "error", "loading"]
      },
      claim_type: "responsive_fix",
      before_label: "before",
      after_label: "after",
      dry_run: false,
      approved: true,
      approval_note: "Approved deterministic local fixture browser evidence run."
    } });
    assert.equal(runCall.isError, undefined);
    const run = runCall.structuredContent?.browser_evidence_run;
    assert.ok(["completed", "blocked", "partial"].includes(run.status), `unexpected status ${run.status}`);
    assert.equal(run.app_url, baseUrl);
    assert.equal(run.routes_checked.length, 2);
    assert.equal(run.viewports_checked.length, 2);
    assert.equal(run.user_flow_steps_attempted.length, 2);
    assert.ok(run.dom_or_page_inspection.length >= 1);
    assert.ok(run.console_summary.status);
    assert.ok(run.network_summary.status);
    assert.ok(run.accessibility_summary.status);
    assert.ok(run.before_after_comparison.status);
    assert.ok(run.evidence_log_id);
    assert.doesNotMatch(JSON.stringify(run), /TOKEN=|example-placeholder/);
    if (run.browser_was_run) {
      assert.ok(run.screenshots.some((item) => item.screenshot_path && item.screenshot_sha256), "completed browser run should include screenshot metadata");
      assert.equal(run.safe_to_claim, true);
    } else {
      assert.ok(run.failures_or_blockers.length > 0, "incomplete run should report blockers");
      assert.equal(run.safe_to_claim, false);
      assert.ok(run.must_not_claim.some((item) => /browser proof|visual proof|screenshot/i.test(item)));
    }

    const audit = await client.callTool({ name: "vnem_tools_ui_evidence_audit", arguments: { claim: "Dashboard responsive visual improvement verified", browser_evidence_run: run } });
    const auditResult = audit.structuredContent?.ui_evidence_audit;
    assert.ok(auditResult.missing_evidence.length >= 1 || auditResult.safe_to_claim === true);
    assert.ok(/browser_evidence_run/i.test(auditResult.evidence_strength) || auditResult.browser_evidence_run_status);

    const completedEvidence = {
      browser_was_run: true,
      routes_checked: [{ route: "/", url: baseUrl, status: "checked" }],
      screenshots: [{ label: "before desktop", screenshot_path: "before-desktop.png", screenshot_sha256: "a".repeat(64) }, { label: "after desktop", screenshot_path: "after-desktop.png", screenshot_sha256: "b".repeat(64) }, { label: "after mobile", screenshot_path: "after-mobile.png", screenshot_sha256: "c".repeat(64) }],
      dom_or_page_inspection: [{ route: "/", title: "Evidence Run Fixture", headings: ["Dashboard Ready"], status: "checked" }],
      console_summary: { status: "clean", errors: [] },
      network_summary: { status: "clean", failures: [] },
      accessibility_summary: { status: "checked", issues: [] },
      viewport_coverage: [{ viewport: "desktop", status: "passed" }, { viewport: "mobile", status: "passed" }],
      state_coverage: [{ state: "loading", status: "passed" }, { state: "empty", status: "passed" }, { state: "error", status: "passed" }],
      before_after_comparison: { status: "present", before_label: "before", after_label: "after" },
      safe_to_claim: true
    };
    const accepted = await client.callTool({ name: "vnem_tools_ui_evidence_audit", arguments: { claim: "Dashboard visual improvement verified responsive and accessibility", browser_evidence_run: completedEvidence } });
    const acceptedAudit = accepted.structuredContent?.ui_evidence_audit;
    assert.equal(acceptedAudit.safe_to_claim, true);
    assert.equal(acceptedAudit.visual_claim_supported, true);
    assert.equal(acceptedAudit.route_or_component_wired, true);
  });

  console.log("vnem Tools browser evidence run tests passed");
} finally {
  server.close();
  await rm(tmpRoot, { recursive: true, force: true });
}
