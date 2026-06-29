#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const client = new Client({ name: "vnem-ui-completion-audit-test", version: "1.0.1" }, { capabilities: {} });
const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(scriptDir, "vnem-mcp-server.mjs")], cwd: rootDir, env: { ...process.env, VNEM_ROOT: rootDir }, stderr: "pipe" });
let stderr = "";
transport.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });

try {
  await client.connect(transport);

  const noVisual = await client.callTool({ name: "vnem_completion_audit", arguments: {
    task: "Improve dashboard UI",
    claimed_result: "Updated the UI and dashboard is improved",
    changed_files: ["dashboard/src/App.jsx"],
    evidence: ["code changed"],
    commands_run: ["npm run dashboard:build passed"],
    strictness: "strict"
  } });
  const noVisualAudit = noVisual.structuredContent;
  assert.match(noVisualAudit.verdict, /revise|insufficient|blocked/i);
  assert.ok(noVisualAudit.ui_findings.some((item) => /screenshot|visual|browser/i.test(item)));
  assert.ok(noVisualAudit.what_must_not_be_claimed.some((item) => /UI improved|visual/i.test(item)));

  const responsive = await client.callTool({ name: "vnem_completion_audit", arguments: {
    task: "Fix responsive layout",
    claimed_result: "Responsive layout fixed",
    screenshots_or_visual_evidence: ["desktop screenshot path only"],
    evidence: ["desktop DOM assertion"],
    commands_run: ["npm run dashboard:build passed"],
    strictness: "strict"
  } });
  const responsiveAudit = responsive.structuredContent;
  assert.match(responsiveAudit.verdict, /revise|insufficient|blocked/i);
  assert.ok([...responsiveAudit.ui_findings, ...responsiveAudit.missing_evidence].some((item) => /multiple viewport|viewport|mobile/i.test(item)));

  const a11y = await client.callTool({ name: "vnem_completion_audit", arguments: {
    task: "Improve accessibility of the settings form",
    claimed_result: "Accessibility improved and form works",
    screenshots_or_visual_evidence: ["settings screenshot"],
    evidence: ["labels changed in code"],
    commands_run: ["npm run dashboard:build passed"],
    strictness: "strict"
  } });
  const a11yAudit = a11y.structuredContent;
  assert.match(a11yAudit.verdict, /revise|insufficient|blocked/i);
  assert.ok([...a11yAudit.ui_findings, ...a11yAudit.missing_evidence].some((item) => /accessibility audit|a11y/i.test(item)));

  const route = await client.callTool({ name: "vnem_completion_audit", arguments: {
    task: "Add a new reports component route",
    claimed_result: "Component added and reports UI works",
    changed_files: ["dashboard/src/Reports.jsx"],
    evidence: ["component file exists"],
    commands_run: ["npm run dashboard:build passed"],
    strictness: "strict"
  } });
  const routeAudit = route.structuredContent;
  assert.ok([...routeAudit.ui_findings, ...routeAudit.missing_evidence].some((item) => /route|component|render/i.test(item)));

  console.log("vnem UI completion audit tests passed");
} finally {
  await client.close().catch(() => {});
  if (stderr.trim()) process.stderr.write(stderr);
}
