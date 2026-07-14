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

  const appSlice = await call(core.client, "vnem_entrypoint", {
    user_goal: "Build a complete Vite React and Node API vertical slice, connect visible data, run test and build, and prove the localhost user path on desktop and mobile.",
    task_context: "Use approval-gated atomic apply and rollback on failed acceptance.",
    available_mcp_names: ["vnem", "vnem-tools"],
    available_tool_names: [...toolNames],
    allowed_tool_names: [...toolNames],
    repo_signals: ["package.json: vite react", "src/App.jsx", "Node API"]
  }, "entrypoint");
  for (const tool of ["vnem_tools_app_inspect", "vnem_tools_repo_deep_map", "vnem_tools_app_vertical_slice_plan"]) assert.ok(appSlice.recommended_tools_calls.includes(tool), `missing Phase 7 app route ${tool}`);
  assert.ok(appSlice.recommended_tools_call_sequence.every((step) => step.state.available && step.state.allowed));
  assert.ok(appSlice.recommended_tools_calls.length <= 6);

  const projectAutomation = await call(core.client, "vnem_entrypoint", {
    user_goal: "Inspect the package scripts, run one reviewed terminal command, resume a dependency task graph, diagnose a listening dev-server port, and prove timeout process cleanup.",
    task_context: "Windows Node project; no shell chaining or arbitrary process termination.",
    task_mode: "project_automation",
    available_mcp_names: ["vnem", "vnem-tools"],
    available_tool_names: [...toolNames],
    allowed_tool_names: [...toolNames],
    environment: { os: "win32", shell: "powershell", node_version: "24", package_manager: "npm" }
  }, "entrypoint");
  assert.ok(projectAutomation.task_classification.domains.some((domain) => domain.id === "project_automation"));
  for (const tool of ["vnem_tools_project_automation_inspect", "vnem_tools_project_command_run", "vnem_tools_project_task_graph_plan"]) assert.ok(projectAutomation.recommended_tools_calls.includes(tool), `missing Phase 8 project automation route ${tool}`);
  assert.ok(projectAutomation.evidence_requirements.some((requirement) => /exit\/timeout state/.test(requirement)));
  assert.ok(projectAutomation.recommended_tools_call_sequence.every((step) => step.state.available && step.state.allowed));

  const testingCi = await call(core.client, "vnem_entrypoint", {
    user_goal: "Build an import-based affected test graph, run the smallest safe tier, diagnose the failing CI job and step, report coverage gaps, and compare benchmark history.",
    task_context: "Do not retry product failures or call scheduling failures code regressions.",
    task_mode: "testing",
    available_mcp_names: ["vnem", "vnem-tools"],
    available_tool_names: [...toolNames],
    allowed_tool_names: [...toolNames]
  }, "entrypoint");
  assert.ok(testingCi.task_classification.domains.some((domain) => domain.id === "testing_ci"));
  for (const tool of ["vnem_tools_test_system_inspect", "vnem_tools_affected_test_graph", "vnem_tools_test_run"]) assert.ok(testingCi.recommended_tools_calls.includes(tool), `missing Phase 9 testing/CI route ${tool}`);
  assert.ok(testingCi.evidence_requirements.some((requirement) => /affected-test graph reasons/.test(requirement)));
  assert.ok(testingCi.recommended_tools_call_sequence.every((step) => step.state.available && step.state.allowed));

  const browserInteraction = await call(core.client, "vnem_entrypoint", {
    user_goal: "Launch an approved localhost browser, click and type safe test fields, navigate, prove loading empty error and success states on desktop and mobile, inspect console network DOM accessibility, compare before and after screenshots, and cleanly terminate the browser.",
    task_context: "No login, cookies, private account, CAPTCHA bypass, broad scraping, or hidden automation.",
    task_mode: "ui_browser",
    available_mcp_names: ["vnem", "vnem-tools"],
    available_tool_names: [...toolNames],
    allowed_tool_names: [...toolNames],
    environment: { os: "win32", browser_available: "Chromium CDP", app_url: "localhost" }
  }, "entrypoint");
  assert.ok(browserInteraction.task_classification.domains.some((domain) => domain.id === "browser_ui"));
  for (const tool of ["vnem_tools_browser_evidence_plan", "vnem_tools_browser_interaction_run"]) assert.ok(browserInteraction.recommended_tools_calls.includes(tool), `missing Phase 10 browser route ${tool}`);
  assert.ok(browserInteraction.evidence_requirements.some((requirement) => /structured interaction results/.test(requirement)));
  assert.ok(browserInteraction.evidence_requirements.some((requirement) => /owned-browser cleanup/.test(requirement)));
  assert.ok(browserInteraction.recommended_tools_call_sequence.every((step) => step.state.available && step.state.allowed));

  const windowsLocal = await call(core.client, "vnem_entrypoint", {
    user_goal: "Diagnose a Windows PowerShell path failure, inspect the exact Node process and TCP port, check Event Viewer and service status, and plan any system change with scoped permission and rollback.",
    task_context: "Do not return command lines, config contents, environment values, secrets, or disable Defender or firewall.",
    task_mode: "windows",
    available_mcp_names: ["vnem", "vnem-tools"],
    available_tool_names: [...toolNames],
    allowed_tool_names: [...toolNames],
    environment: { os: "Windows 11", shell: "PowerShell 7", node_version: "22", client: "Codex", mcp_transport: "stdio" }
  }, "entrypoint");
  assert.ok(windowsLocal.task_classification.domains.some((domain) => domain.id === "windows_local"));
  for (const tool of ["vnem_tools_windows_system_snapshot", "vnem_tools_powershell_command_plan", "vnem_tools_process_inspect", "vnem_tools_port_inspect"]) assert.ok(windowsLocal.recommended_tools_calls.includes(tool), `missing Phase 11 Windows route ${tool}`);
  assert.ok(windowsLocal.evidence_requirements.some((requirement) => /exact Windows targets/.test(requirement)));
  assert.ok(windowsLocal.evidence_requirements.some((requirement) => /scoped permission plus rollback/.test(requirement)));
  assert.ok(windowsLocal.recommended_tools_call_sequence.every((step) => step.state.available && step.state.allowed));

  const githubReview = await call(core.client, "vnem_entrypoint", {
    user_goal: "Review GitHub PR #15 diff and unresolved review threads, verify the remote and PR head SHA, inspect Actions, and do not merge.",
    task_context: "Base main, feature branch only; force-push and protected direct push stay blocked.",
    task_mode: "publish",
    available_mcp_names: ["vnem", "vnem-tools"],
    available_tool_names: [...toolNames],
    allowed_tool_names: [...toolNames]
  }, "entrypoint");
  for (const tool of ["vnem_tools_github_diff_review", "vnem_tools_github_review_threads", "vnem_tools_github_remote_proof", "vnem_tools_github_actions_status", "vnem_tools_pr_quality_gate"]) assert.ok(githubReview.recommended_tools_calls.includes(tool), `missing Phase 12 GitHub review route ${tool}`);
  assert.ok(githubReview.evidence_requirements.some((requirement) => /corrective-commit or rollback guidance/.test(requirement)));
  assert.ok(githubReview.completion_criteria.some((item) => item.id === "remote_review"));

  const githubRun = await call(core.client, "vnem_entrypoint", {
    user_goal: "Inspect an exact GitHub Actions run, its jobs, failed step, and bounded logs for the feature branch.",
    task_context: "Read-only diagnosis for PR #15 on main base.",
    task_mode: "publish",
    available_mcp_names: ["vnem", "vnem-tools"],
    available_tool_names: [...toolNames],
    allowed_tool_names: [...toolNames]
  }, "entrypoint");
  assert.ok(githubRun.recommended_tools_calls.includes("vnem_tools_github_actions_run_inspect"));

  const gameModding = await call(core.client, "vnem_entrypoint", {
    user_goal: "Inspect a local game mod project, parse configs and manifests, analyze load order and compatibility, validate assets, and create a reviewed backup before any changes.",
    task_context: "FixtureGame 1.2.3 on Windows with FixtureLoader 4.0; binary regulation and archive formats must not be generically patched or executed.",
    task_mode: "game_modding",
    available_mcp_names: ["vnem", "vnem-tools"],
    available_tool_names: [...toolNames],
    allowed_tool_names: [...toolNames],
    environment: { os: "Windows 11", game_version: "1.2.3", mod_loader: "FixtureLoader 4.0", file_format: "JSON/YAML plus guarded binary" }
  }, "entrypoint");
  assert.ok(gameModding.task_classification.domains.some((domain) => domain.id === "game_modding"));
  for (const tool of ["vnem_tools_game_adapter_catalog", "vnem_tools_game_project_inspect", "vnem_tools_game_config_audit", "vnem_tools_mod_compatibility_analyze"]) assert.ok(gameModding.recommended_tools_calls.includes(tool), `missing Phase 13 game/mod route ${tool}`);
  assert.ok(gameModding.recommended_tools_call_sequence.every((step) => step.state.available && step.state.allowed));
  assert.doesNotMatch(JSON.stringify(gameModding), /game-project, config, Roblox, and Luau tools are not registered/);
  assert.ok(gameModding.completion_criteria.some((item) => item.id === "rollback"));

  const robloxLuau = await call(core.client, "vnem_entrypoint", {
    user_goal: "Map this Roblox Rojo Luau project, services, remotes, modules, risky trust boundaries, static checks, tests, and an isolated build plan.",
    task_context: "Rojo 7 project on Windows; do not connect to Studio, publish a place, execute plugins, or run downloaded code.",
    task_mode: "game_modding",
    available_mcp_names: ["vnem", "vnem-tools"],
    available_tool_names: [...toolNames],
    allowed_tool_names: [...toolNames],
    environment: { os: "Windows 11", game_version: "Roblox current project", mod_loader: "Rojo 7", file_format: "Luau and project JSON" }
  }, "entrypoint");
  for (const tool of ["vnem_tools_game_adapter_catalog", "vnem_tools_roblox_project_inspect", "vnem_tools_luau_symbol_map", "vnem_tools_game_project_validate"]) assert.ok(robloxLuau.recommended_tools_calls.includes(tool), `missing Phase 13 Roblox/Luau route ${tool}`);
  assert.ok(robloxLuau.recommended_tools_calls.length <= 6);

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
  for (const tool of ["vnem_tools_dependency_inventory", "vnem_tools_failure_triage", "vnem_tools_github_actions_status"]) assert.ok(packageCi.recommended_tools_calls.includes(tool), `missing ${tool}`);

  const dependencySecurity = await call(core.client, "vnem_entrypoint", {
    user_goal: "Parse package manifests and lockfiles, build the direct and transitive graph and SBOM, inspect lifecycle and typosquat risk, check current approved advisories, compare the major upgrade, install the exact approved npm version, verify tests and build, and prove rollback.",
    task_context: "npm package-lock.json; approved-installs profile will gate mutation; never publish, run lifecycle hooks, read registry credentials, or execute an unreviewed downloaded binary.",
    task_mode: "package",
    available_mcp_names: ["vnem", "vnem-tools"],
    available_tool_names: [...toolNames],
    allowed_tool_names: [...toolNames],
    environment: { os: "Windows 11", node_version: "24", package_manager: "npm" }
  }, "entrypoint");
  assert.ok(dependencySecurity.task_classification.domains.some((domain) => domain.id === "package_dependency"));
  for (const tool of ["vnem_tools_dependency_inventory", "vnem_tools_dependency_risk_audit", "vnem_tools_dependency_advisory_audit", "vnem_tools_dependency_change_analyze", "vnem_tools_dependency_upgrade_plan", "vnem_tools_dependency_install_apply"]) assert.ok(dependencySecurity.recommended_tools_calls.includes(tool), `missing Phase 14 dependency route ${tool}`);
  assert.equal(dependencySecurity.recommended_tools_calls.length, 6);
  assert.ok(dependencySecurity.evidence_requirements.some((requirement) => /SBOM inventory/.test(requirement)));

  const api = await call(core.client, "vnem_entrypoint", {
    user_goal: "Execute a live allowlisted GET API request and verify the redacted response.",
    task_context: "No authorization or credential reference has been supplied.",
    available_mcp_names: ["vnem", "vnem-tools"],
    available_tool_names: [...toolNames],
    environment: { os: "win32", api_auth: "credential reference required" }
  }, "entrypoint");
  assert.equal(api.task_classification.primary_domain, "api_integration");
  for (const tool of ["vnem_tools_api_adapter_catalog", "vnem_tools_api_credential_reference_check", "vnem_tools_api_adapter_plan", "vnem_tools_api_adapter_execute"]) assert.ok(api.recommended_tools_calls.includes(tool), `missing Phase 16 API route ${tool}`);
  assert.equal(api.adapter_selection[0].readiness, "vetted_adapter_execution_ready_subject_to_exact_auth_and_permission_class");
  assert.equal(api.adapter_selection[0].tools_adapter, "vnem_tools_api_adapter_execute");
  assert.equal(api.adapter_selection[0].unsupported_records_recommended, false);
  assert.equal(api.material_missing_context.some((item) => item.id === "api_authorization" && item.ask_user), true);
  assert.equal(api.permission_implications.network_approval_may_be_required, true);
  assert.match(api.compact_next_step, /Ask only/);

  const apiSelection = await call(core.client, "vnem_entrypoint", {
    user_goal: "Select a suitable API, review trust and auth needs, then build an integration plan.",
    available_mcp_names: ["vnem", "vnem-tools"],
    available_tool_names: [...toolNames],
    allowed_tool_names: [...toolNames]
  }, "entrypoint");
  for (const tool of ["vnem_tools_api_adapter_catalog", "vnem_tools_api_adapter_plan"]) assert.ok(apiSelection.recommended_tools_calls.includes(tool), `missing Phase 16 API selection route ${tool}`);
  assert.ok(apiSelection.recommended_tools_calls.length <= 6);

  const skills = await call(core.client, "vnem_entrypoint", {
    user_goal: "Inspect and execute a vetted agent skill safely.",
    task_mode: "skill",
    available_mcp_names: ["vnem", "vnem-tools"],
    available_tool_names: [...toolNames],
    allowed_tool_names: [...toolNames]
  }, "entrypoint");
  assert.equal(skills.task_classification.primary_domain, "skills");
  for (const tool of ["vnem_tools_skill_adapter_catalog", "vnem_tools_skill_doctor", "vnem_tools_skill_adapter_plan", "vnem_tools_skill_adapter_execute", "vnem_tools_skill_package_inspect", "vnem_tools_skill_source_verify"]) assert.ok(skills.recommended_tools_calls.includes(tool), `missing Phase 17 skill route ${tool}`);
  assert.equal(skills.recommended_tools_calls.length, 6);
  assert.equal(skills.adapter_selection[0].readiness, "vetted_adapter_execution_ready_with_runtime_specific_permission_scope");
  assert.equal(skills.adapter_selection[0].tools_adapter, "vnem_tools_skill_adapter_execute");
  assert.equal((skills.unavailable_capabilities || []).some((item) => /skill execution runtime/i.test(item)), false);
  assert.match(skills.permission_implications.skill_execution_scope, /vetted_skill_execute/);

  const documentation = await call(core.client, "vnem_entrypoint", {
    user_goal: "Retrieve current official React documentation with bounded relevant sections, cache freshness, and contradiction evidence.",
    task_mode: "documentation",
    available_mcp_names: ["vnem", "vnem-tools"],
    available_tool_names: [...toolNames],
    allowed_tool_names: [...toolNames]
  }, "entrypoint");
  assert.equal(documentation.task_classification.primary_domain, "research_docs");
  for (const tool of ["vnem_tools_documentation_source_catalog", "vnem_tools_official_documentation_fetch", "vnem_tools_documentation_context", "vnem_tools_documentation_cache_status"]) {
    assert.ok(documentation.recommended_tools_calls.includes(tool), `missing Phase 18 current documentation route ${tool}`);
  }
  assert.equal(documentation.permission_implications.network_approval_may_be_required, true);

  const database = await call(core.client, "vnem_entrypoint", {
    user_goal: "Inspect and validate this SQLite database, inspect its schema, plan one bounded read-only query, and return redacted results.",
    task_context: "Local SQLite and structured JSON data; read-only by default with strict result limits.",
    task_mode: "database",
    available_mcp_names: ["vnem", "vnem-tools"],
    available_tool_names: [...toolNames],
    allowed_tool_names: [...toolNames],
    environment: { os: "Windows 11", database_engine: "SQLite", file_format: "SQLite and JSON" }
  }, "entrypoint");
  assert.equal(database.task_classification.primary_domain, "database_data");
  for (const tool of ["vnem_tools_database_connection_plan", "vnem_tools_data_source_inspect", "vnem_tools_data_source_validate", "vnem_tools_database_schema_inspect", "vnem_tools_database_query_plan", "vnem_tools_database_query"]) {
    assert.ok(database.recommended_tools_calls.includes(tool), `missing Phase 19 database route ${tool}`);
  }
  assert.equal(database.recommended_tools_calls.length, 6);
  assert.match(database.permission_implications.database_scope, /database_read/);
  assert.equal(database.adapter_selection[0].readiness, "bounded_local_read_ready");
  assert.ok(database.completion_criteria.some((item) => item.id === "database_safety"));

  const databaseMigration = await call(core.client, "vnem_entrypoint", {
    user_goal: "Preview and apply a reviewed SQLite schema migration, verify affected rows, and retain exact rollback proof.",
    task_context: "Local SQLite migration with approved database_write scope, transaction, backup, and post-write verification.",
    task_mode: "database",
    available_mcp_names: ["vnem", "vnem-tools"],
    available_tool_names: [...toolNames],
    allowed_tool_names: [...toolNames]
  }, "entrypoint");
  for (const tool of ["vnem_tools_database_connection_plan", "vnem_tools_database_schema_inspect", "vnem_tools_database_migration_preview", "vnem_tools_database_migration_apply", "vnem_tools_data_transaction_rollback", "vnem_tools_database_query"]) {
    assert.ok(databaseMigration.recommended_tools_calls.includes(tool), `missing Phase 19 migration route ${tool}`);
  }
  assert.match(databaseMigration.permission_implications.database_scope, /database_write/);
  assert.match(databaseMigration.adapter_selection[0].readiness, /fresh_preview_database_write_backup_and_rollback/);

  const cloudflare = await call(core.client, "vnem_entrypoint", {
    user_goal: "Inspect Cloudflare readiness and projects, plan and execute an approved Pages deployment, verify bounded remote state, and retain exact rollback guidance.",
    task_context: "Cloudflare Pages via local Wrangler with credential references, exact mutation approval, protected-resource gates, and no simulated success claims.",
    task_mode: "cloudflare",
    available_mcp_names: ["vnem", "vnem-tools"],
    available_tool_names: [...toolNames],
    allowed_tool_names: [...toolNames],
    environment: { os: "Windows 11", shell: "PowerShell", provider_version: "Cloudflare Wrangler 4" }
  }, "entrypoint");
  assert.equal(cloudflare.task_classification.primary_domain, "cloudflare");
  for (const tool of ["vnem_tools_cloudflare_status", "vnem_tools_cloudflare_projects_list", "vnem_tools_cloudflare_pages_deploy_plan", "vnem_tools_cloudflare_pages_deploy", "vnem_tools_cloudflare_deploy_verify", "vnem_tools_cloudflare_rollback_plan"]) {
    assert.ok(cloudflare.recommended_tools_calls.includes(tool), `missing Phase 20 Cloudflare route ${tool}`);
  }
  assert.equal(cloudflare.recommended_tools_calls.length, 6);
  assert.match(cloudflare.permission_implications.cloudflare_scope, /exact approval phrase/);
  assert.equal(cloudflare.adapter_selection[0].remote_execution_supported, true);
  assert.match(cloudflare.adapter_selection[0].readiness, /wrangler_and_bounded_api_execution_ready/);
  assert.ok(cloudflare.completion_criteria.some((item) => item.id === "cloudflare_remote_proof"));
  assert.ok(cloudflare.completion_criteria.some((item) => item.id === "cloudflare_rollback"));

  const cloudflareFailure = await call(core.client, "vnem_entrypoint", {
    user_goal: "Diagnose a failed Cloudflare Workers deploy without retrying mutation blindly.",
    task_context: "Wrangler provider error requires redacted diagnosis, bounded verification, and rollback guidance.",
    task_mode: "cloudflare",
    available_mcp_names: ["vnem", "vnem-tools"],
    available_tool_names: [...toolNames],
    allowed_tool_names: [...toolNames]
  }, "entrypoint");
  assert.ok(cloudflareFailure.recommended_tools_calls.includes("vnem_tools_cloudflare_error_diagnose"));
  assert.ok(cloudflareFailure.recommended_tools_calls.includes("vnem_tools_cloudflare_rollback"));

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
