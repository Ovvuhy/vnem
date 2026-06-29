#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
await mkdir(path.join(rootDir, ".tmp"), { recursive: true });
const tmpRoot = await mkdtemp(path.join(rootDir, ".tmp", "tools-debug-evidence-"));
const workspace = path.join(tmpRoot, "workspace");
await mkdir(path.join(workspace, "logs"), { recursive: true });
await writeFile(path.join(workspace, "package.json"), JSON.stringify({ scripts: { "test:unit": "node tests/unit.test.mjs", build: "vite build", deploy: "wrangler deploy" } }, null, 2), "utf8");
await writeFile(path.join(workspace, "logs", "app.log"), "INFO boot\nERROR TypeError: cannot read properties of undefined at src/app.js:42\nAPI_KEY=sk-this-must-redact\n", "utf8");
await writeFile(path.join(workspace, ".env"), "SECRET_TOKEN=must-not-read\n", "utf8");

const client = new Client({ name: "vnem-tools-debug-evidence-test", version: "1.0.1" }, { capabilities: {} });
const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(scriptDir, "vnem-tools-mcp-server.mjs")], cwd: rootDir, env: { ...process.env, VNEM_TOOLS_ALLOWED_ROOTS: workspace, VNEM_TOOLS_PERMISSION_PROFILE: "safe-readonly", VNEM_TOOLS_EVIDENCE_ROOT: path.join(workspace, ".vnem", "tool-runs") }, stderr: "pipe" });
let stderr = "";
transport.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });

try {
  await client.connect(transport);
  const toolNames = new Set((await client.listTools()).tools.map((tool) => tool.name));
  assert.equal(toolNames.has("vnem_tools_debug_evidence"), true, "missing debug evidence tool");

  const call = await client.callTool({ name: "vnem_tools_debug_evidence", arguments: { workspace_root: workspace, problem_description: "App crashes with TypeError", failing_command: "npm run test:unit", log_paths: ["logs/app.log", ".env"], changed_files: ["src/app.js"], include_git_status: true, include_package_scripts: true, include_config_summary: true, include_recent_test_output: true } });
  const evidence = call.structuredContent?.debug_evidence;
  assert.match(evidence.failure_type_guess, /runtime|test/i);
  assert.ok(evidence.logs_checked.some((item) => /logs\/app\.log/.test(item.path) && /TypeError/.test(item.summary)));
  assert.ok(evidence.logs_missing.some((item) => item.path === ".env" && /secret|blocked/i.test(item.reason)));
  assert.ok(evidence.commands_or_outputs_summarized.some((item) => /not run|provided|failing_command/i.test(JSON.stringify(item))));
  assert.equal(evidence.arbitrary_commands_run, false);
  assert.ok(evidence.git_status_summary);
  assert.ok(evidence.package_scripts_relevant.some((item) => item.name === "test:unit"));
  assert.ok(!evidence.package_scripts_relevant.some((item) => item.name === "deploy"));
  assert.ok(evidence.config_files_relevant.some((item) => /package\.json/.test(item.path)));
  assert.ok(evidence.likely_root_cause_areas.some((item) => /src\/app\.js|TypeError|undefined/i.test(item)));
  assert.ok(evidence.targeted_checks_suggested.some((item) => /npm run test:unit|node --check|targeted/i.test(item)));
  assert.ok(!JSON.stringify(evidence).includes("must-not-read"));
  assert.ok(!JSON.stringify(evidence).includes("sk-this-must-redact"));
  assert.ok(JSON.stringify(evidence).includes("[REDACTED]"));
  assert.ok(evidence.evidence_log_id);
  assert.ok(evidence.must_not_claim.some((item) => /ran arbitrary|fixed|read secrets/i.test(item)));

  console.log("vnem Tools debug evidence tests passed");
} finally {
  await client.close().catch(() => {});
  await rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
  if (stderr.trim()) process.stderr.write(stderr);
}
