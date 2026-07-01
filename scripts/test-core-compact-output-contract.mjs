#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const text = (value) => JSON.stringify(value);
const client = new Client({ name: "vnem-core-compact-output-contract-test", version: "1.0.1" }, { capabilities: {} });
const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(scriptDir, "vnem-mcp-server.mjs")], cwd: rootDir, env: { ...process.env, VNEM_ROOT: rootDir }, stderr: "pipe" });
let stderr = "";
transport.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });

try {
  await client.connect(transport);
  const toolNames = new Set((await client.listTools()).tools.map((tool) => tool.name));
  assert.equal(toolNames.has("vnem_compact_output_contract"), true, "Core should expose vnem_compact_output_contract");

  const risky = await client.callTool({ name: "vnem_compact_output_contract", arguments: {
    task: "Implement and push a UI redesign in a repo",
    output_text: "Done. Looks better.",
    material_caveats: ["No browser screenshots were captured", "CI is still pending"],
    needed_proof: ["git SHA", "before/after screenshots", "test output", "GitHub Actions status"],
    token_budget: "compact"
  } });
  const contract = risky.structuredContent?.compact_output_contract;
  assert.equal(contract.compact_by_default, true);
  assert.equal(contract.compact_does_not_mean_vague, true);
  assert.equal(contract.expand_for_risky_current_ui_debug_security_repo_file_tasks, true);
  assert.equal(contract.compact_output_too_vague, true);
  assert.equal(contract.compact_output_hid_material_caveat, true);
  assert.equal(contract.compact_output_removed_needed_proof, true);
  assert.ok(text(contract.required_output_shape).match(/Result|Tests|Caveats|Proof|Next/i));

  const ok = await client.callTool({ name: "vnem_compact_output_contract", arguments: {
    task: "Answer a stable definition question",
    output_text: "Result: Ghosted means someone stopped responding without explanation. Assumption: casual gaming/chat context.",
    token_budget: "compact"
  } });
  const okContract = ok.structuredContent?.compact_output_contract;
  assert.equal(okContract.compact_output_too_vague, false);
  assert.equal(okContract.recommended_length, "short");

  console.log("vnem Core compact output contract tests passed");
} finally {
  await client.close().catch(() => {});
  if (stderr.trim()) process.stderr.write(stderr);
}
