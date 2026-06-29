#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const client = new Client({ name: "vnem-tools-ui-evidence-audit-test", version: "1.0.1" }, { capabilities: {} });
const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(scriptDir, "vnem-tools-mcp-server.mjs")], cwd: rootDir, env: { ...process.env, VNEM_TOOLS_ALLOWED_ROOTS: rootDir, VNEM_TOOLS_PERMISSION_PROFILE: "safe-readonly", VNEM_TOOLS_EVIDENCE_ROOT: path.join(rootDir, ".vnem", "tool-runs") }, stderr: "pipe" });
let stderr = "";
transport.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });

try {
  await client.connect(transport);
  const toolNames = new Set((await client.listTools()).tools.map((tool) => tool.name));
  assert.equal(toolNames.has("vnem_tools_ui_evidence_audit"), true, "missing UI evidence audit tool");

  const codeOnly = await client.callTool({ name: "vnem_tools_ui_evidence_audit", arguments: {
    claim: "Dashboard UI improved and responsive layout fixed",
    screenshots: [],
    dom_assertions: [],
    console_summary: { status: "unknown" },
    network_summary: { status: "unknown" },
    viewport_results: [{ viewport: "desktop", status: "checked" }],
    state_results: [],
    route_render_evidence: []
  } });
  const rejected = codeOnly.structuredContent?.ui_evidence_audit;
  assert.match(rejected.verdict, /reject|revise/i);
  assert.equal(rejected.visual_claim_supported, false);
  assert.equal(rejected.safe_to_claim, false);
  assert.ok(rejected.missing_evidence.some((item) => /screenshot/i.test(item)));
  assert.ok(rejected.missing_evidence.some((item) => /console|network/i.test(item)));
  assert.ok(rejected.responsive_status.includes("insufficient"));

  const bounded = await client.callTool({ name: "vnem_tools_ui_evidence_audit", arguments: {
    claim: "Dashboard visual improvement verified across responsive viewports",
    screenshots: ["before-desktop.png", "after-desktop.png", "after-mobile.png", "after-tablet.png"],
    dom_assertions: ["/dashboard renders Dashboard heading", "ProjectCards visible"],
    console_summary: { status: "clean", errors: [] },
    network_summary: { status: "clean", failures: [] },
    accessibility_summary: { status: "checked", issues: [] },
    viewport_results: [{ viewport: "desktop", status: "passed" }, { viewport: "tablet", status: "passed" }, { viewport: "mobile", status: "passed" }],
    state_results: [{ state: "loading", status: "passed" }, { state: "empty", status: "passed" }, { state: "error", status: "passed" }],
    before_after: { before: "before-desktop.png", after: "after-desktop.png", summary: "layout spacing improved" },
    route_render_evidence: ["/dashboard route renders ProjectCards"]
  } });
  const accepted = bounded.structuredContent?.ui_evidence_audit;
  assert.match(accepted.verdict, /accept|supported/i);
  assert.equal(accepted.visual_claim_supported, true);
  assert.equal(accepted.route_or_component_wired, true);
  assert.equal(accepted.safe_to_claim, true);
  assert.ok(accepted.console_network_status.includes("clean"));
  assert.ok(accepted.accessibility_status.includes("checked"));
  assert.ok(accepted.responsive_status.includes("covered"));
  assert.ok(accepted.state_coverage_status.includes("covered"));
  assert.ok(accepted.before_after_status.includes("present"));

  console.log("vnem Tools UI evidence audit tests passed");
} finally {
  await client.close().catch(() => {});
  if (stderr.trim()) process.stderr.write(stderr);
}
