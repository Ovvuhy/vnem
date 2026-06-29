#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const text = (value) => JSON.stringify(value);
const client = new Client({ name: "vnem-core-anti-stagnation-test", version: "1.0.1" }, { capabilities: {} });
const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(scriptDir, "vnem-mcp-server.mjs")], cwd: rootDir, env: { ...process.env, VNEM_ROOT: rootDir }, stderr: "pipe" });
let stderr = "";
transport.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });

try {
  await client.connect(transport);
  const toolNames = new Set((await client.listTools()).tools.map((tool) => tool.name));
  assert.equal(toolNames.has("vnem_anti_stagnation_check"), true, "Core should expose anti-stagnation checker");
  assert.equal(toolNames.has("vnem_route_task"), true);

  const repeat = await client.callTool({
    name: "vnem_anti_stagnation_check",
    arguments: {
      task: "Make another browser/search safety improvement batch",
      completed_areas: ["browser intelligence", "search provider framework", "CAPTCHA detector", "claim/source matrix", "research gap detector"],
      recent_actions: ["npm test passed", "CI/deploy verified", "browser/search batch committed"],
      proposed_next_step: "Polish README wording and rerun the full test suite again for browser/search work"
    }
  });
  const check = repeat.structuredContent?.anti_stagnation_check;
  assert.ok(check.stagnation_risk_flags.includes("repeating already-covered improvement area"));
  assert.ok(check.stagnation_risk_flags.includes("docs-only fake progress risk"));
  assert.ok(check.stagnation_risk_flags.includes("full test suite loop risk"));
  assert.equal(check.should_continue_same_area, false);
  assert.ok(check.recommended_next_action.match(/different weakness|next useful batch|routing|memory|output/i));
  assert.ok(check.must_not_claim.some((item) => /new behavior|docs-only|repeated/i.test(item)));

  const route = await client.callTool({
    name: "vnem_route_task",
    arguments: {
      task: "Make another major VNEM browser/search improvement",
      known_context: "Recent completed areas: browser intelligence, search provider framework, CAPTCHA detector, claim/source matrix, research gap detector.",
      completed_areas: ["browser intelligence", "search provider framework", "CAPTCHA detector", "claim/source matrix", "research gap detector"]
    }
  });
  const record = route.structuredContent?.routing_record;
  assert.ok(text(record.anti_stagnation).match(/already-covered|repeating|move/i));
  assert.ok(record.next_best_action.match(/different weakness|routing|memory|output|anti-stagnation/i));

  const focused = await client.callTool({
    name: "vnem_anti_stagnation_check",
    arguments: {
      task: "Add Core routing and memory relevance tests that do not exist yet",
      completed_areas: ["browser intelligence", "search provider framework"],
      recent_actions: ["inspected vnem-mcp-server.mjs"],
      proposed_next_step: "Write focused Core routing tests first"
    }
  });
  const ok = focused.structuredContent?.anti_stagnation_check;
  assert.equal(ok.should_continue_same_area, true);
  assert.ok(ok.recommended_next_action.match(/focused|test|implementation/i));
  assert.doesNotMatch(text(ok.stagnation_risk_flags), /full test suite loop/i);

  console.log("vnem Core anti-stagnation tests passed");
} finally {
  await client.close().catch(() => {});
  if (stderr.trim()) process.stderr.write(stderr);
}
