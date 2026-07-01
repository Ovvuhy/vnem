#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const text = (value) => JSON.stringify(value);
const client = new Client({ name: "vnem-core-design-ambition-test", version: "1.0.1" }, { capabilities: {} });
const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(scriptDir, "vnem-mcp-server.mjs")], cwd: rootDir, env: { ...process.env, VNEM_ROOT: rootDir }, stderr: "pipe" });
let stderr = "";
transport.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });

async function plan(args) {
  const result = await client.callTool({ name: "vnem_design_ambition_plan", arguments: args });
  return result.structuredContent?.design_ambition_plan;
}

try {
  await client.connect(transport);
  const toolNames = new Set((await client.listTools()).tools.map((tool) => tool.name));
  assert.equal(toolNames.has("vnem_design_ambition_plan"), true, "Core should expose vnem_design_ambition_plan");

  const adaptive = await plan({ user_goal: "Redesign pizzabomba.sk and make it look better", referenced_site_or_product: "pizzabomba.sk" });
  assert.equal(adaptive.user_specified_style, false, "no explicit style should be detected");
  assert.equal(adaptive.should_adapt_to_existing_brand, true, "should adapt to business/brand/purpose when style is unspecified");
  assert.match(adaptive.inferred_brand_direction, /pizza|restaurant|delivery|local|food|conversion/i);
  assert.equal(adaptive.design_reference_needed, true, "comparable references are useful for website redesign");
  assert.ok(text(adaptive.design_reference_plan).match(/comparable|competitor|restaurant|delivery|source/i));
  assert.ok(adaptive.directions_considered_internally.length >= 2, "directions can be considered internally without forcing user choice");
  assert.ok(!/always premium|force premium/i.test(`${adaptive.inferred_brand_direction} ${adaptive.selected_direction}`), "selected direction must not force one default style");
  assert.ok(text(adaptive.how_new_design_must_be_better).match(/stronger|better|clearer|conversion|hierarchy|mobile/i));
  assert.ok(text(adaptive.must_not_do).match(/generic template|copy weak|force premium|ignore brand/i));
  assert.equal(adaptive.core_plan_only, true);

  const luxury = await plan({ user_goal: "Make pizzabomba.sk luxury/premium and dark", referenced_site_or_product: "pizzabomba.sk" });
  assert.equal(luxury.user_specified_style, true, "explicit luxury/dark style should be detected");
  assert.equal(luxury.should_adapt_to_existing_brand, false, "user style should override old brand direction");
  assert.match(luxury.selected_direction, /luxury|premium|dark/i);
  assert.match(luxury.why_selected_direction, /user specified|explicit/i);
  assert.ok(text(luxury.must_not_do).match(/ignore user-specified style|copy weak original/i));

  const quickBetter = await plan({ user_goal: "Just make this landing page look good and work well", referenced_site_or_product: "unknown local landing page" });
  assert.equal(quickBetter.should_adapt_to_existing_brand, true);
  assert.equal(quickBetter.force_user_to_choose_design_directions, false, "should not force direction-choice ceremony");

  console.log("vnem Core design ambition tests passed");
} finally {
  await client.close().catch(() => {});
  if (stderr.trim()) process.stderr.write(stderr);
}
