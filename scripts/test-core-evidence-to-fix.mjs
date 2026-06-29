#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const client = new Client({ name: "vnem-core-evidence-to-fix-test", version: "1.0.1" }, { capabilities: {} });
const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(scriptDir, "vnem-mcp-server.mjs")], cwd: rootDir, env: { ...process.env, VNEM_ROOT: rootDir }, stderr: "pipe" });
let stderr = "";
transport.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });

try {
  await client.connect(transport);
  const toolNames = new Set((await client.listTools()).tools.map((tool) => tool.name));
  assert.equal(toolNames.has("vnem_evidence_to_fix_check"), true, "missing evidence-to-fix checker");

  const docsOnly = await client.callTool({ name: "vnem_evidence_to_fix_check", arguments: { task: "Fix runtime crash", claimed_fix: "Updated README wording and marked the crash fixed", changed_files: ["README.md"], evidence_items: [], commands_run: [] } });
  const docs = docsOnly.structuredContent?.evidence_to_fix_check;
  assert.match(docs.verdict, /reject|revise|blocked/i);
  assert.ok(docs.placebo_fix_risk.some((item) => /docs-only|wording/i.test(item)));
  assert.ok(docs.must_not_claim.some((item) => /bug fix|fixed/i.test(item)));

  const unrelated = await client.callTool({ name: "vnem_evidence_to_fix_check", arguments: { task: "Fix TypeError in src/app.js", claimed_fix: "Changed dashboard CSS", changed_files: ["dashboard/styles.css"], evidence_items: ["TypeError at src/app.js:42"], root_cause: "src/app.js passes undefined", commands_run: ["npm run test:app failed before"] } });
  const unrelatedCheck = unrelated.structuredContent?.evidence_to_fix_check;
  assert.equal(unrelatedCheck.fix_matches_evidence, false);
  assert.ok(unrelatedCheck.unrelated_change_risk.some((item) => /unrelated|does not match/i.test(item)));

  const skipped = await client.callTool({ name: "vnem_evidence_to_fix_check", arguments: { task: "Fix failing tests", claimed_fix: "Skipped the failing test with test.skip so suite passes", changed_files: ["tests/app.test.js"], evidence_items: ["failing test app renders data"], commands_run: ["npm test passed after test.skip"] } });
  const skippedCheck = skipped.structuredContent?.evidence_to_fix_check;
  assert.match(skippedCheck.verdict, /reject|blocked|revise/i);
  assert.ok(skippedCheck.placebo_fix_risk.some((item) => /disabled|skipped|suppressed/i.test(item)));
  assert.ok(skippedCheck.targeted_verification_required.some((item) => /rerun|targeted|failing/i.test(item)));

  console.log("vnem Core evidence-to-fix tests passed");
} finally {
  await client.close().catch(() => {});
  if (stderr.trim()) process.stderr.write(stderr);
}
