#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const text = (value) => JSON.stringify(value);
const client = new Client({ name: "vnem-core-routing-memory-output-test", version: "1.0.1" }, { capabilities: {} });
const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(scriptDir, "vnem-mcp-server.mjs")], cwd: rootDir, env: { ...process.env, VNEM_ROOT: rootDir }, stderr: "pipe" });
let stderr = "";
transport.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });

try {
  await client.connect(transport);
  const toolNames = new Set((await client.listTools()).tools.map((tool) => tool.name));
  assert.equal(toolNames.has("vnem_route_task"), true, "Core should expose vnem_route_task");
  assert.equal(toolNames.has("vnem_output_quality_plan"), true, "Core should expose vnem_output_quality_plan");
  for (const mutationTool of ["vnem_tools_run_project_task", "vnem_tools_apply_patch_batch", "vnem_tools_web_search"]) {
    assert.equal(toolNames.has(mutationTool), false, "Core must remain plan-only and not expose Tools action tools");
  }

  const route = await client.callTool({
    name: "vnem_route_task",
    arguments: {
      task: "Improve the VNEM dashboard UI and prove the rendered page works on localhost",
      known_context: "Repo path C:/VNEM/vnem-src. Tools MCP can inspect workspace safely.",
      memory_items: [
        { id: "vnem-root", content: "VNEM real Git checkout is at C:/VNEM/vnem-src", scope_tags: ["project-specific", "workspace-specific", "verified"] },
        { id: "elden", content: "RNG Lands Elden Ring randomizer workspace is under Documents", scope_tags: ["game-specific", "mod-specific", "workspace-specific", "verified"] },
        { id: "old", content: "Old dashboard task from 2024 used a draft folder", scope_tags: ["outdated", "workspace-specific"] }
      ]
    }
  });
  const record = route.structuredContent?.routing_record;
  assert.ok(record, "route task should return routing_record");
  assert.equal(record.user_goal.includes("dashboard UI"), true);
  assert.ok(record.task_categories.includes("UI/web/app improvement"));
  assert.ok(record.task_categories.includes("dashboard/control-surface work"));
  assert.equal(record.need_tools_mcp, true);
  assert.equal(record.must_ask_user, false, "safe workspace inspection should proceed without over-asking");
  assert.ok(record.relevant_memory_used.some((item) => item.id === "vnem-root"));
  assert.ok(record.memory_ignored.some((item) => item.id === "elden" && item.classification === "ignored"));
  assert.ok(record.memory_ignored.some((item) => item.id === "old" && item.classification === "outdated"));
  assert.ok(record.required_evidence.some((item) => /browser|visual|localhost|screenshot/i.test(item)));
  assert.ok(record.must_not_claim.some((item) => /Core executed Tools|visual/i.test(item)));

  const debugRoute = await client.callTool({ name: "vnem_route_task", arguments: { task: "Fix this failing local test", known_context: "No logs or failing command supplied yet." } });
  const debug = debugRoute.structuredContent?.routing_record;
  assert.ok(debug.task_categories.includes("coding/debugging"));
  assert.equal(debug.must_ask_user, true, "debugging should ask for logs/failing command when unavailable");
  assert.ok(debug.missing_context.some((item) => /log|failing command|repro/i.test(item.question || item)));

  const docsRoute = await client.callTool({ name: "vnem_route_task", arguments: { task: "Write a short README section explaining how to run the local smoke test", known_context: "Command is npm run test:mcp-user-smoke." } });
  const docs = docsRoute.structuredContent?.routing_record;
  assert.ok(docs.task_categories.includes("documentation-only"));
  assert.equal(docs.must_ask_user, false, "simple documentation task should not over-ask");
  assert.equal(docs.need_tools_mcp, false, "simple docs wording with enough context does not require Tools MCP");

  const securityRoute = await client.callTool({ name: "vnem_route_task", arguments: { task: "Check if this suspicious login link is safe", known_context: "The URL was sent by a stranger and may ask for credentials." } });
  const sec = securityRoute.structuredContent?.routing_record;
  assert.ok(sec.task_categories.includes("security/safety review"));
  assert.equal(sec.must_ask_user, true, "security task should flag trust-boundary context");
  assert.ok(text(sec.safety_risks).match(/credential|phishing|trust/i));

  console.log("vnem Core routing/memory/output tests passed");
} finally {
  await client.close().catch(() => {});
  if (stderr.trim()) process.stderr.write(stderr);
}
