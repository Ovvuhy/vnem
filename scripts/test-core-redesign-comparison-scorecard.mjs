#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const text = (value) => JSON.stringify(value);
const client = new Client({ name: "vnem-core-redesign-comparison-scorecard-test", version: "1.0.1" }, { capabilities: {} });
const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(scriptDir, "vnem-mcp-server.mjs")], cwd: rootDir, env: { ...process.env, VNEM_ROOT: rootDir }, stderr: "pipe" });
let stderr = "";
transport.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });

try {
  await client.connect(transport);
  const toolNames = new Set((await client.listTools()).tools.map((tool) => tool.name));
  assert.equal(toolNames.has("vnem_redesign_comparison_scorecard"), true, "Core should expose vnem_redesign_comparison_scorecard");

  const unproven = await client.callTool({ name: "vnem_redesign_comparison_scorecard", arguments: {
    user_goal: "Redesign the restaurant homepage and make it better than the original",
    original_summary: "Local pizza restaurant with direct ordering, phone number, menu, delivery information, and familiar red/yellow brand cues.",
    new_design_summary: "Beautiful dark cinematic hero with huge photos and subtle animation, but menu, phone number, ordering CTA, delivery area, and mobile state are not evidenced.",
    claimed_original_score: 52,
    claimed_new_score: 95,
    claimed_result: "The redesign is dramatically better than the original.",
    screenshots_or_visual_evidence: [],
    before_after_evidence: []
  } });
  const scorecard = unproven.structuredContent?.redesign_comparison_scorecard;
  assert.equal(scorecard.core_plan_only, true);
  assert.equal(scorecard.evaluation_axes.length, 13, "must score all total-impact axes");
  assert.ok(text(scorecard.evaluation_axes).match(/visual beauty|brand fit|conversion|usability|content hierarchy|typography|spacing|mobile|animation|originality|performance|trust\/accessibility|overall user impact/i));
  assert.equal(scorecard.visual_superiority_proven, false, "no screenshots/browser proof means visual superiority is not proven");
  assert.equal(scorecard.before_after_comparison_present, false);
  assert.equal(scorecard.inflated_design_score, true, "95 without evidence should be flagged as inflated");
  assert.equal(scorecard.unsupported_original_vs_new_score, true);
  assert.ok(["not_proven", "mixed", "worse_or_mixed"].includes(scorecard.redesign_verdict));
  assert.equal(scorecard.user_might_rate_new_lower_risk, true);
  assert.ok(text(scorecard.must_not_claim).match(/better than original|visual superiority|screenshots|before\/after/i));

  const evidenced = await client.callTool({ name: "vnem_redesign_comparison_scorecard", arguments: {
    user_goal: "Improve checkout landing page total impact",
    original_summary: "Cluttered page with weak CTA and confusing plan comparison.",
    new_design_summary: "Clear visual hierarchy, brand-fit type and color, direct pricing CTA, accessible contrast, mobile screenshots, faster-feeling layout, and restrained interaction.",
    screenshots_or_visual_evidence: ["desktop screenshot", "mobile viewport screenshot", "browser visual evidence"],
    before_after_evidence: ["before/after desktop comparison", "before/after mobile comparison"],
    evidence: ["DOM assertion shows CTA above fold", "accessibility contrast checked"]
  } });
  const proven = evidenced.structuredContent?.redesign_comparison_scorecard;
  assert.equal(proven.visual_superiority_proven, true);
  assert.equal(proven.before_after_comparison_present, true);
  assert.equal(proven.comparison_scorecard_required, true);
  assert.equal(proven.one_axis_design_optimization, false);
  assert.ok(proven.new_total_impact_score > proven.original_total_impact_score);

  console.log("vnem Core redesign comparison scorecard tests passed");
} finally {
  await client.close().catch(() => {});
  if (stderr.trim()) process.stderr.write(stderr);
}
