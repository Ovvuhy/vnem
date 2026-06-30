#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const client = new Client({ name: "vnem-browser-evidence-completion-audit-test", version: "1.0.1" }, { capabilities: {} });
const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(scriptDir, "vnem-mcp-server.mjs")], cwd: rootDir, env: { ...process.env, VNEM_ROOT: rootDir }, stderr: "pipe" });
let stderr = "";
transport.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });

try {
  await client.connect(transport);

  const codeOnly = await client.callTool({ name: "vnem_completion_audit", arguments: {
    task: "Improve dashboard UI",
    claimed_result: "Dashboard visual UI improved, responsive layout fixed, and works in browser",
    changed_files: ["dashboard/src/App.jsx"],
    evidence: ["code changed"],
    commands_run: ["npm run dashboard:build passed"],
    strictness: "strict"
  } });
  const rejected = codeOnly.structuredContent;
  assert.ok([...rejected.ui_findings, ...rejected.missing_evidence].some((item) => /screenshot|browser visual/i.test(item)));
  assert.ok([...rejected.ui_findings, ...rejected.missing_evidence].some((item) => /console|network/i.test(item)));

  const browserEvidenceRun = {
    browser_was_run: true,
    routes_checked: [{ route: "/dashboard", url: "http://127.0.0.1:5173/dashboard", status: "checked" }],
    screenshots: [
      { label: "before desktop", screenshot_path: "before-desktop.png", screenshot_sha256: "a".repeat(64) },
      { label: "after desktop", screenshot_path: "after-desktop.png", screenshot_sha256: "b".repeat(64) },
      { label: "after mobile", screenshot_path: "after-mobile.png", screenshot_sha256: "c".repeat(64) }
    ],
    dom_or_page_inspection: [{ route: "/dashboard", title: "Dashboard", headings: ["Dashboard"], status: "checked", visible_text_assertions: ["Dashboard heading visible"] }],
    console_summary: { status: "clean", errors: [] },
    network_summary: { status: "clean", failures: [] },
    accessibility_summary: { status: "checked", issues: [] },
    viewport_coverage: [{ viewport: "desktop", status: "passed" }, { viewport: "mobile", status: "passed" }],
    state_coverage: [{ state: "loading", status: "passed" }, { state: "empty", status: "passed" }, { state: "error", status: "passed" }],
    before_after_comparison: { status: "present", before_label: "before", after_label: "after" },
    evidence_log_id: "browser-evidence-run-test",
    safe_to_claim: true
  };
  const accepted = await client.callTool({ name: "vnem_completion_audit", arguments: {
    task: "Improve dashboard UI responsive accessibility state coverage",
    claimed_result: "Dashboard visual UI improved, responsive browser flow works, and accessibility checked",
    screenshots_or_visual_evidence: [JSON.stringify({ browser_evidence_run: browserEvidenceRun })],
    evidence: ["browser_evidence_run: browser_was_run=true; route render evidence present; console_summary clean; network_summary clean; accessibility_summary checked; state_results loading empty error; viewport_results mobile desktop"],
    commands_run: ["npm run dashboard:build passed"],
    strictness: "strict"
  } });
  const acceptedAudit = accepted.structuredContent;
  assert.equal(acceptedAudit.ui_findings.some((item) => /screenshot.*missing|unknown console|network error status|multiple viewport evidence|accessibility audit evidence/i.test(item)), false);
  assert.equal(acceptedAudit.missing_evidence.some((item) => /Screenshot|Console\/network|Multiple viewport|Accessibility audit/i.test(item)), false);
  assert.ok(acceptedAudit.evidence_ledger.proven.some((item) => /browser_evidence_run|browser_was_run/i.test(item)));

  console.log("vnem browser evidence completion audit tests passed");
} finally {
  await client.close().catch(() => {});
  if (stderr.trim()) process.stderr.write(stderr);
}
