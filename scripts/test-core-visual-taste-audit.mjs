#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const text = (value) => JSON.stringify(value);
const client = new Client({ name: "vnem-core-visual-taste-audit-test", version: "1.0.1" }, { capabilities: {} });
const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(scriptDir, "vnem-mcp-server.mjs")], cwd: rootDir, env: { ...process.env, VNEM_ROOT: rootDir }, stderr: "pipe" });
let stderr = "";
transport.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });

async function taste(args) {
  const result = await client.callTool({ name: "vnem_visual_taste_audit", arguments: args });
  return result.structuredContent?.visual_taste_audit;
}

try {
  await client.connect(transport);
  const toolNames = new Set((await client.listTools()).tools.map((tool) => tool.name));
  assert.equal(toolNames.has("vnem_visual_taste_audit"), true, "Core should expose vnem_visual_taste_audit");

  const boring = await taste({
    user_goal: "Redesign this website and make it look better",
    design_summary: "Used a generic modern template: centered hero, blue button, plain cards, no brand-specific assets, no mobile screenshots.",
    evidence: []
  });
  assert.ok(["revise", "blocked"].includes(boring.verdict));
  assert.ok(boring.visual_quality_score < 70, "generic design should score poorly");
  assert.equal(boring.boring_or_generic_risk, "high");
  assert.equal(boring.template_like_risk, "high");
  assert.equal(boring.over_safe_design_risk, "high");
  assert.equal(boring.missing_visual_proof, true);
  assert.equal(boring.safe_to_claim, false);
  assert.ok(text(boring.strongest_visual_issues).match(/generic|template|hero|typography|spacing|mobile|proof/i));

  const ignoredStyle = await taste({
    user_goal: "Make the site dark cyberpunk with neon motion",
    user_requested_style: "dark cyberpunk neon motion",
    design_summary: "Built a clean corporate white minimal homepage with muted blue accents and no animation.",
    evidence: ["one desktop screenshot"]
  });
  assert.equal(ignoredStyle.mismatch_with_user_requested_style, true);
  assert.ok(text(ignoredStyle.strongest_visual_issues).match(/style|cyberpunk|animation|motion/i));
  assert.equal(ignoredStyle.safe_to_claim, false);

  const unprovenClaim = await taste({
    user_goal: "Make this restaurant website better than the original",
    design_summary: "Improved hero, typography, mobile flow, and conversion clarity.",
    evidence: []
  });
  assert.equal(unprovenClaim.missing_visual_proof, true);
  assert.equal(unprovenClaim.missing_before_after_comparison, true);
  assert.ok(text(unprovenClaim.must_not_claim).match(/visually better|before\/after|screenshots/i));

  console.log("vnem Core visual taste audit tests passed");
} finally {
  await client.close().catch(() => {});
  if (stderr.trim()) process.stderr.write(stderr);
}
