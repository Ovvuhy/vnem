#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const text = (value) => JSON.stringify(value);
const client = new Client({ name: "vnem-core-total-impact-design-plan-test", version: "1.0.1" }, { capabilities: {} });
const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(scriptDir, "vnem-mcp-server.mjs")], cwd: rootDir, env: { ...process.env, VNEM_ROOT: rootDir }, stderr: "pipe" });
let stderr = "";
transport.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });

try {
  await client.connect(transport);
  const toolNames = new Set((await client.listTools()).tools.map((tool) => tool.name));
  assert.equal(toolNames.has("vnem_total_impact_design_plan"), true, "Core should expose vnem_total_impact_design_plan");

  const planCall = await client.callTool({ name: "vnem_total_impact_design_plan", arguments: {
    user_goal: "Redesign a local pizza restaurant website",
    referenced_site_or_product: "pizzabomba.sk",
    business_goal: "increase online orders and phone calls",
    token_budget: "normal"
  } });
  const plan = planCall.structuredContent?.total_impact_design_plan;
  assert.equal(plan.total_impact_required, true);
  assert.equal(plan.avoid_one_axis_optimization, true);
  assert.equal(plan.comparison_scorecard_required, true);
  assert.equal(plan.before_after_evidence_required, true);
  assert.equal(plan.core_plan_only, true);
  assert.equal(plan.equal_mix_axes.length, 13);
  assert.ok(text(plan.total_impact_requirements).match(/visual beauty|brand fit|conversion|usability|content hierarchy|typography|spacing|mobile|animation|originality|performance|trust|overall user impact/i));
  assert.ok(text(plan.evidence_requirements).match(/screenshots|browser|before\/after|mobile|accessibility|performance/i));
  assert.ok(text(plan.must_not_do).match(/optimize only|one axis|merely different|unsupported score/i));

  const ambition = await client.callTool({ name: "vnem_design_ambition_plan", arguments: { user_goal: "Redesign pizzabomba.sk", referenced_site_or_product: "pizzabomba.sk" } });
  const designAmbition = ambition.structuredContent?.design_ambition_plan;
  assert.equal(designAmbition.total_impact_required, true);
  assert.equal(designAmbition.comparison_scorecard_required, true);
  assert.ok(text(designAmbition.total_impact_requirements).match(/conversion|usability|mobile|trust|overall user impact/i));

  console.log("vnem Core total-impact design plan tests passed");
} finally {
  await client.close().catch(() => {});
  if (stderr.trim()) process.stderr.write(stderr);
}
