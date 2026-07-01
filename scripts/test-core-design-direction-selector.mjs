#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const text = (value) => JSON.stringify(value);
const client = new Client({ name: "vnem-core-design-direction-selector-test", version: "1.0.1" }, { capabilities: {} });
const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(scriptDir, "vnem-mcp-server.mjs")], cwd: rootDir, env: { ...process.env, VNEM_ROOT: rootDir }, stderr: "pipe" });
let stderr = "";
transport.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });

try {
  await client.connect(transport);
  const toolNames = new Set((await client.listTools()).tools.map((tool) => tool.name));
  assert.equal(toolNames.has("vnem_design_direction_selector"), true, "Core should expose vnem_design_direction_selector");

  const result = await client.callTool({ name: "vnem_design_direction_selector", arguments: {
    user_goal: "Choose a redesign direction for a local restaurant homepage that should increase orders",
    referenced_site_or_product: "pizza restaurant",
    candidate_directions: [
      { name: "dark cinematic art piece", summary: "very beautiful, original, animated, but weak menu visibility, unclear ordering CTA, heavy feel, uncertain mobile usability" },
      { name: "warm local delivery-first", summary: "brand-fit warm food photography, clear order CTA, menu hierarchy, mobile call button, trust basics, restrained motion, fast-feeling layout" },
      { name: "minimal SaaS cards", summary: "clean card grid, lots of whitespace, generic blue CTA, low restaurant personality" }
    ]
  } });
  const selector = result.structuredContent?.design_direction_selector;
  assert.equal(selector.core_plan_only, true);
  assert.equal(selector.selection_basis, "total_impact_not_one_axis");
  assert.equal(selector.avoid_one_axis_optimization, true);
  assert.match(selector.selected_direction.name, /warm local delivery-first/i);
  assert.ok(text(selector.rejected_directions).match(/one-axis|conversion|usability|brand|generic/i));
  assert.ok(text(selector.required_next_evidence).match(/before\/after|screenshot|mobile|scorecard/i));
  assert.ok(!/dark cinematic art piece/i.test(selector.selected_direction.name), "visual-only option should not beat total-impact option");

  const explicit = await client.callTool({ name: "vnem_design_direction_selector", arguments: {
    user_goal: "Make the portfolio brutalist and editorial",
    user_requested_style: "brutalist editorial",
    candidate_directions: [
      { name: "safe corporate", summary: "generic corporate cards" },
      { name: "brutalist editorial", summary: "brutalist type scale, editorial hierarchy, usable navigation, mobile rhythm" }
    ]
  } });
  assert.match(explicit.structuredContent?.design_direction_selector?.selected_direction?.name, /brutalist editorial/i);

  console.log("vnem Core design direction selector tests passed");
} finally {
  await client.close().catch(() => {});
  if (stderr.trim()) process.stderr.write(stderr);
}
