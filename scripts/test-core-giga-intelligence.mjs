#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const core = createClient("vnem-core-giga-intelligence", path.join(scriptDir, "vnem-mcp-server.mjs"), { VNEM_ROOT: rootDir });
const tools = createClient("vnem-tools-giga-intelligence", path.join(scriptDir, "vnem-tools-mcp-server.mjs"), {
  VNEM_TOOLS_ALLOWED_ROOTS: rootDir,
  VNEM_TOOLS_EVIDENCE_ROOT: path.join(rootDir, ".tmp", "core-giga-intelligence-tools"),
  VNEM_TOOLS_SKIP_WRANGLER_CHECK: "1"
});

try {
  await core.client.connect(core.transport);
  await tools.client.connect(tools.transport);
  const coreNames = new Set((await core.client.listTools()).tools.map((tool) => tool.name));
  const toolNames = new Set((await tools.client.listTools()).tools.map((tool) => tool.name));
  for (const name of ["vnem_entrypoint", "vnem_decision_details", "vnem_continue_from_tools_evidence", "vnem_compatibility_assess"]) {
    assert.equal(coreNames.has(name), true, `missing Core intelligence tool ${name}`);
  }

  const mixed = await call(core.client, "vnem_entrypoint", {
    user_goal: "Implement a responsive React dashboard feature and verify desktop, mobile, and accessibility states in a browser.",
    task_context: "Existing TypeScript app. Keep public API compatibility and run focused tests.",
    available_mcp_names: ["vnem", "vnem-tools"],
    available_tool_names: [...toolNames],
    allowed_tool_names: ["vnem_tools_repo_deep_map", "vnem_tools_code_symbol_map", "vnem_tools_ui_surface_review", "vnem_tools_browser_evidence_plan"],
    repo_signals: ["package.json: react", "src/App.tsx", "test:dashboard"],
    user_constraints: ["Do not publish", "Browser proof is required"],
    environment: { os: "win32", shell: "powershell", node_version: "24", framework: "React", browser_available: "Codex browser" }
  }, "entrypoint");
  const mixedDomains = mixed.task_classification.domains.map((item) => item.id);
  assert.equal(mixed.task_classification.mixed_domain, true);
  assert.ok(mixedDomains.includes("app_engineering"));
  assert.ok(mixedDomains.includes("browser_ui"));
  assert.ok(mixed.recommended_tools_calls.includes("vnem_tools_repo_deep_map"));
  assert.ok(mixed.recommended_tools_calls.includes("vnem_tools_ui_surface_review"));
  assert.ok(mixed.recommended_tools_calls.includes("vnem_tools_browser_evidence_plan"));
  assert.ok(mixed.recommended_tools_calls.length <= 6, "Core must select a smallest sufficient Tools set");
  assert.ok(mixed.relevant_capability_packs.every((pack) => pack.affects.tools && pack.affects.checks && pack.affects.output && pack.affects.completion));
  assert.equal(mixed.workflow_policy.fixed_pipeline, false);
  assert.equal(mixed.effort_mode, "adaptive_multi_domain");
  assert.ok(mixed.recommended_tools_call_sequence.every((step) => step.state.available === true));
  assert.equal(mixed.recommended_tools_call_sequence.find((step) => step.tool === "vnem_tools_repo_deep_map").state.allowed, true);
  assert.match(mixed.compact_next_step, /Tools MCP/);
  assert.ok(JSON.stringify(mixed).length < 16000, "default entrypoint decision should remain compact");
  for (const name of mixed.recommended_tools_calls) assert.equal(toolNames.has(name), true, `Core returned unregistered Tools call ${name}`);

  const details = await call(core.client, "vnem_decision_details", {
    decision_id: mixed.decision_id,
    sections: ["classification", "compatibility", "capability_packs", "unavailable_capabilities"]
  }, "decision_details");
  assert.equal(details.found, true);
  assert.ok(details.sections.compatibility.constraints.some((item) => item.dimension === "browser"));
  assert.ok(details.sections.capability_packs.some((pack) => pack.id === "core.browser_ui"));

  const packageCi = await call(core.client, "vnem_entrypoint", {
    user_goal: "Upgrade a Node dependency, repair its failing GitHub Actions test, preserve the lockfile, and prove CI without merging.",
    task_context: "npm package-lock.json on a feature branch",
    available_mcp_names: ["vnem", "vnem-tools"],
    available_tool_names: [...toolNames]
  }, "entrypoint");
  const packageDomains = packageCi.task_classification.domains.map((item) => item.id);
  for (const domain of ["package_dependency", "debugging", "github_publish"]) assert.ok(packageDomains.includes(domain), `missing ${domain} mixed-domain route`);
  for (const tool of ["vnem_tools_dependency_scan", "vnem_tools_failure_triage", "vnem_tools_github_actions_status"]) assert.ok(packageCi.recommended_tools_calls.includes(tool), `missing ${tool}`);

  const api = await call(core.client, "vnem_entrypoint", {
    user_goal: "Execute a live allowlisted GET API request and verify the redacted response.",
    task_context: "No authorization or credential reference has been supplied.",
    available_mcp_names: ["vnem", "vnem-tools"],
    available_tool_names: [...toolNames],
    environment: { os: "win32", api_auth: "credential reference required" }
  }, "entrypoint");
  assert.equal(api.task_classification.primary_domain, "api_integration");
  assert.ok(api.recommended_tools_calls.includes("vnem_tools_api_request"));
  assert.equal(api.adapter_selection[0].readiness, "execution_ready_if_configured_allowed_and_authorized");
  assert.equal(api.adapter_selection[0].unsupported_records_recommended, false);
  assert.equal(api.material_missing_context.some((item) => item.id === "api_authorization" && item.ask_user), true);
  assert.equal(api.permission_implications.network_approval_may_be_required, true);
  assert.match(api.compact_next_step, /Ask only/);

  const compatibility = await call(core.client, "vnem_compatibility_assess", {
    task: "Run a Codex MCP server over stdio on Windows PowerShell with Node.",
    environment: { os: "Windows 11", shell: "PowerShell 7", node_version: "24", client: "Codex", mcp_transport: "stdio" },
    compatibility_facts: [{ dimension: "mcp_transport", value: "stdio", status: "verified", evidence: "official client config and live MCP call", scope: "Codex on this machine" }]
  }, "compatibility");
  assert.equal(compatibility.scope, "task-specific; facts do not become universal rules");
  assert.equal(compatibility.constraints.find((item) => item.dimension === "mcp_transport").status, "verified");
  assert.ok(compatibility.unknowns.every((item) => item.status === "unknown"));

  const incomplete = await call(core.client, "vnem_continue_from_tools_evidence", {
    decision_id: mixed.decision_id,
    evidence_summary: {
      requirements: mixed.completion_criteria.filter((item) => item.id !== "browser_proof").map((item) => ({ id: item.id, status: "proven", evidence_ids: [`proof-${item.id}`] })),
      tool_calls: [{ tool: "vnem_tools_browser_evidence_run", status: "failed", evidence_ids: ["browser-run-1"] }],
      checks: [{ name: "mobile viewport", status: "failed", evidence_ids: ["browser-run-1"] }],
      claims: [{ text: "Implementation exists locally.", evidence_ids: ["proof-execution"] }],
      not_proven: ["mobile browser proof"]
    }
  }, "evidence_continuation");
  assert.equal(incomplete.completion_state, "incomplete");
  assert.equal(incomplete.rerun_needed, true);
  assert.ok(incomplete.remaining_requirements.some((item) => item.id === "browser_proof"));

  const complete = await call(core.client, "vnem_continue_from_tools_evidence", {
    decision_id: mixed.decision_id,
    evidence_summary: {
      requirements: mixed.completion_criteria.map((item) => ({ id: item.id, status: "proven", evidence_ids: [`proof-${item.id}`] })),
      tool_calls: [{ tool: "vnem_tools_browser_evidence_run", status: "succeeded", evidence_ids: ["browser-run-2"] }],
      checks: [{ name: "focused tests", status: "passed", evidence_ids: ["test-1"] }],
      claims: [{ text: "Required local checks and browser proof passed.", evidence_ids: ["test-1", "browser-run-2"] }]
    }
  }, "evidence_continuation");
  assert.equal(complete.completion_state, "complete");
  assert.equal(complete.complete, true);

  const overclaim = await call(core.client, "vnem_continue_from_tools_evidence", {
    completion_criteria: [{ id: "verification", criterion: "Required checks passed." }],
    evidence_summary: { requirements: [{ id: "verification", status: "proven", evidence_ids: ["test-2"] }], claims: ["Everything is complete and deployed."] }
  }, "evidence_continuation");
  assert.equal(overclaim.complete, false);
  assert.equal(overclaim.claim_overreach.length, 1);

  const blocked = await call(core.client, "vnem_continue_from_tools_evidence", {
    completion_criteria: [{ id: "remote_proof", criterion: "Remote proof is observed." }],
    evidence_summary: {
      requirements: [{ id: "remote_proof", status: "blocked", evidence_ids: [] }],
      blockers: [{ type: "auth", reason: "GitHub authorization is required", requires_user: true }]
    }
  }, "evidence_continuation");
  assert.equal(blocked.completion_state, "blocked");
  assert.equal(blocked.user_input_required, true);

  const casual = await call(core.client, "vnem_entrypoint", { user_goal: "What is 2 plus 2?", available_mcp_names: ["vnem", "vnem-tools"] }, "entrypoint");
  assert.equal(casual.should_use_vnem, "conditional");
  assert.deepEqual(casual.recommended_tools_calls, []);
  assert.equal(casual.material_missing_context.length, 0);

  console.log("VNEM Core GIGA intelligence tests passed: mixed routing, compact details, compatibility, tool states, and evidence continuation");
} finally {
  await core.client.close().catch(() => {});
  await tools.client.close().catch(() => {});
}

function createClient(name, serverPath, extraEnv = {}) {
  const client = new Client({ name, version: "1.0.1" }, { capabilities: {} });
  const transport = new StdioClientTransport({ command: process.execPath, args: [serverPath], cwd: rootDir, env: { ...process.env, ...extraEnv }, stderr: "pipe" });
  let stderr = "";
  transport.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });
  transport.stderr?.on("close", () => { if (stderr.trim()) process.stderr.write(stderr); });
  return { client, transport };
}

async function call(client, name, args, key) {
  const result = await client.callTool({ name, arguments: args });
  assert.equal(result.isError, undefined, `${name} returned error: ${result.content?.[0]?.text || ""}`);
  assert.ok(result.structuredContent?.[key], `${name} missing structuredContent.${key}`);
  return result.structuredContent[key];
}
