#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const text = (value) => JSON.stringify(value);
const client = new Client({ name: "vnem-core-speed-design-2-audit-test", version: "1.0.1" }, { capabilities: {} });
const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(scriptDir, "vnem-mcp-server.mjs")], cwd: rootDir, env: { ...process.env, VNEM_ROOT: rootDir }, stderr: "pipe" });
let stderr = "";
transport.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });

try {
  await client.connect(transport);
  const toolNames = new Set((await client.listTools()).tools.map((tool) => tool.name));
  for (const name of ["vnem_redesign_comparison_scorecard", "vnem_total_impact_design_plan", "vnem_design_direction_selector", "vnem_compact_output_contract", "vnem_completion_audit", "vnem_boost_task", "vnem_visual_taste_audit"]) assert.equal(toolNames.has(name), true, `Core missing ${name}`);

  const auditCall = await client.callTool({ name: "vnem_completion_audit", arguments: {
    task: "Redesign a restaurant website UI and make it better than the original",
    claimed_result: "Success. New design is 95/100 versus original 45/100 and is clearly better. Compact: done, looks great.",
    changed_files: ["dashboard/src/Home.jsx"],
    commands_run: ["npm run dashboard:build passed"],
    evidence: ["code changed", "only hero visual direction improved", "no caveats included in compact output"],
    screenshots_or_visual_evidence: [],
    token_budget: "normal",
    strictness: "strict"
  } });
  const audit = auditCall.structuredContent;
  const auditText = text(audit);
  for (const expected of [
    "inflated_design_score",
    "unsupported_original_vs_new_score",
    "claimed_better_without_before_after",
    "claimed_better_without_visual_evidence",
    "new_design_worse_or_mixed_but_claimed_success",
    "one_axis_design_optimization",
    "compact_output_too_vague",
    "compact_output_hid_material_caveat",
    "compact_output_removed_needed_proof"
  ]) assert.ok(auditText.includes(expected), `completion audit should flag ${expected}`);
  assert.notEqual(audit.verdict, "pass");

  const taste = await client.callTool({ name: "vnem_visual_taste_audit", arguments: {
    user_goal: "Make this website better than the original",
    design_summary: "New version is 98/100 because the hero image is prettier; original was 40/100. Other conversion, usability, mobile, content, and trust details are unknown.",
    evidence: []
  } });
  const tasteAudit = taste.structuredContent?.visual_taste_audit;
  assert.equal(tasteAudit.inflated_design_score, true);
  assert.equal(tasteAudit.one_axis_design_optimization, true);
  assert.equal(tasteAudit.actually_better_than_original_risk, true);

  const boost = await client.callTool({ name: "vnem_boost_task", arguments: { task: "Redesign a local restaurant website", token_budget: "compact" } });
  const designBehavior = boost.structuredContent?.design_behavior;
  assert.equal(designBehavior.total_impact_required, true);
  assert.equal(designBehavior.avoid_one_axis_optimization, true);
  assert.equal(designBehavior.comparison_scorecard_required, true);
  assert.equal(designBehavior.before_after_evidence_required, true);

  console.log("vnem Core SPEED-DESIGN-2 audit tests passed");
} finally {
  await client.close().catch(() => {});
  if (stderr.trim()) process.stderr.write(stderr);
}
