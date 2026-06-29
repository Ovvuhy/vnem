#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const client = new Client({ name: "vnem-completion-audit-code-quality-test", version: "1.0.1" }, { capabilities: {} });
const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(scriptDir, "vnem-mcp-server.mjs")], cwd: rootDir, env: { ...process.env, VNEM_ROOT: rootDir }, stderr: "pipe" });
let stderr = "";
transport.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });

try {
  await client.connect(transport);

  const unwired = await client.callTool({ name: "vnem_completion_audit", arguments: { task: "Implement a new MCP tool", claimed_result: "Implemented vnem_tools_unwired_magic helper and feature is complete", changed_files: ["scripts/helpers/unwired-magic.mjs"], evidence: ["helper function exists"], commands_run: ["node --check scripts/helpers/unwired-magic.mjs passed"], strictness: "strict" } });
  const unwiredAudit = unwired.structuredContent;
  assert.match(unwiredAudit.verdict, /revise|insufficient|blocked/i);
  assert.ok(unwiredAudit.code_quality_findings.some((item) => /unwired|registry|registered|integration/i.test(item)));
  assert.ok(unwiredAudit.what_must_not_be_claimed.some((item) => /implemented|wired|MCP tool/i.test(item)));

  const mockOnly = await client.callTool({ name: "vnem_completion_audit", arguments: { task: "Fix runtime bug", claimed_result: "Fixed the bug and tests prove it", changed_files: ["src/app.js", "tests/app.mock.test.js"], evidence: ["mock-only test covered fake service"], commands_run: ["npm run test:mock passed"], strictness: "strict" } });
  const mockAudit = mockOnly.structuredContent;
  assert.match(mockAudit.verdict, /revise|insufficient/i);
  assert.ok(mockAudit.code_quality_findings.some((item) => /mock-only|targeted|real behavior/i.test(item)));

  const docsBug = await client.callTool({ name: "vnem_completion_audit", arguments: { task: "Fix production crash", claimed_result: "Fixed the crash", changed_files: ["README.md"], evidence: ["updated troubleshooting section"], commands_run: ["npm run validate passed"], strictness: "strict" } });
  const docsAudit = docsBug.structuredContent;
  assert.match(docsAudit.verdict, /revise|insufficient|blocked/i);
  assert.ok(docsAudit.code_quality_findings.some((item) => /docs-only|bug fix|no targeted/i.test(item)));

  console.log("vnem completion audit code quality tests passed");
} finally {
  await client.close().catch(() => {});
  if (stderr.trim()) process.stderr.write(stderr);
}
