#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const client = new Client({ name: "vnem-tools-browser-evidence-plan-test", version: "1.0.1" }, { capabilities: {} });
const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(scriptDir, "vnem-tools-mcp-server.mjs")], cwd: rootDir, env: { ...process.env, VNEM_TOOLS_ALLOWED_ROOTS: rootDir, VNEM_TOOLS_PERMISSION_PROFILE: "safe-readonly", VNEM_TOOLS_EVIDENCE_ROOT: path.join(rootDir, ".vnem", "tool-runs") }, stderr: "pipe" });
let stderr = "";
transport.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });

try {
  await client.connect(transport);
  const toolNames = new Set((await client.listTools()).tools.map((tool) => tool.name));
  assert.equal(toolNames.has("vnem_tools_browser_evidence_plan"), true, "missing browser evidence plan tool");

  const call = await client.callTool({ name: "vnem_tools_browser_evidence_plan", arguments: {
    app_url: "http://localhost:5173/dashboard",
    routes: ["/dashboard", "/dashboard/projects"],
    user_flow: ["open dashboard", "click Projects", "verify empty state"],
    claim_type: "responsive_fix",
    viewports: ["mobile", "tablet", "desktop"],
    states_to_check: ["loading", "empty", "error"]
  } });
  const plan = call.structuredContent?.browser_evidence_plan;
  assert.equal(plan.requires_localhost_or_approved_url, true);
  assert.equal(plan.browser_was_run, false);
  assert.deepEqual(plan.routes_to_visit, ["/dashboard", "/dashboard/projects"]);
  assert.ok(plan.screenshots_needed.some((item) => /before|after|mobile|desktop/i.test(item)));
  assert.ok(plan.dom_checks_needed.some((item) => /visible text|DOM|route/i.test(item)));
  assert.ok(plan.console_checks_needed.some((item) => /console/i.test(item)));
  assert.ok(plan.network_checks_needed.some((item) => /network/i.test(item)));
  assert.ok(plan.accessibility_checks_needed.some((item) => /accessibility|a11y/i.test(item)));
  assert.ok(plan.viewports.length >= 3);
  assert.ok(plan.states_to_force_or_verify.some((item) => /loading|empty|error/i.test(item)));
  assert.ok(plan.before_after_plan.some((item) => /before|after/i.test(item)));
  for (const expected of ["vnem_tools_browser_capture", "vnem_tools_browser_page_inspect", "vnem_tools_browser_accessibility_audit", "vnem_tools_browser_compare_snapshots"]) assert.ok(plan.existing_tools_to_use.includes(expected), `missing ${expected}`);
  assert.ok(plan.must_not_claim.some((item) => /ran browser|captured screenshot/i.test(item)));

  const external = await client.callTool({ name: "vnem_tools_browser_evidence_plan", arguments: { app_url: "https://example.com/private", routes: ["/"], user_flow: ["login"], claim_type: "form_flow" } });
  const externalPlan = external.structuredContent?.browser_evidence_plan;
  assert.ok(externalPlan.risk_notes.some((item) => /approved URL|localhost|login|private/i.test(item)));

  console.log("vnem Tools browser evidence plan tests passed");
} finally {
  await client.close().catch(() => {});
  if (stderr.trim()) process.stderr.write(stderr);
}
