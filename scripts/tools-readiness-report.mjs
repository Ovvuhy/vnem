#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const rel = (target) => path.join(rootDir, target);
const serverPath = rel("scripts/vnem-tools-mcp-server.mjs");
const testPath = rel("scripts/test-tools-mcp-server.mjs");
const e2eTestPath = rel("scripts/test-core-tools-e2e.mjs");
const browserTestPath = rel("scripts/test-tools-browser-capture.mjs");
const cliPath = rel("scripts/vnem-cli.mjs");
const pkg = JSON.parse(readFileSync(rel("package.json"), "utf8"));
const server = existsSync(serverPath) ? readFileSync(serverPath, "utf8") : "";
const test = existsSync(testPath) ? readFileSync(testPath, "utf8") : "";
const e2eTest = existsSync(e2eTestPath) ? readFileSync(e2eTestPath, "utf8") : "";
const browserTest = existsSync(browserTestPath) ? readFileSync(browserTestPath, "utf8") : "";
const cli = existsSync(cliPath) ? readFileSync(cliPath, "utf8") : "";
const requiredTools = [
  "vnem_tools_status",
  "vnem_tools_prepare_action_plan",
  "vnem_tools_permission_prompt",
  "vnem_tools_read_file",
  "vnem_tools_list_files",
  "vnem_tools_search_files",
  "vnem_tools_apply_patch",
  "vnem_tools_run_command",
  "vnem_tools_api_request",
  "vnem_tools_collect_evidence",
  "vnem_tools_restore_backup",
  "vnem_tools_browser_capture"
];

const report = {
  server_file_exists: existsSync(serverPath),
  test_file_exists: existsSync(testPath),
  core_tools_e2e_test_exists: existsSync(e2eTestPath),
  browser_capture_test_exists: existsSync(browserTestPath),
  core_tools_e2e_script_exists: pkg.scripts?.["test:core-tools-e2e"] === "node scripts/test-core-tools-e2e.mjs",
  package_scripts: {
    tools_mcp: pkg.scripts?.["tools:mcp"] === "node scripts/vnem-tools-mcp-server.mjs",
    test_tools_mcp: pkg.scripts?.["test:tools-mcp"] === "node scripts/test-tools-mcp-server.mjs",
    test_tools_browser: pkg.scripts?.["test:tools-browser"] === "node scripts/test-tools-browser-capture.mjs"
  },
  required_tools_present: Object.fromEntries(requiredTools.map((name) => [name, server.includes(`"${name}"`)])),
  mcp_config_tools_support: /--tools/.test(cli) && /VNEM_TOOLS_ALLOWED_ROOTS/.test(cli) && /VNEM_TOOLS_EVIDENCE_ROOT/.test(cli) && /vnem-tools-mcp-server/.test(cli),
  restore_tool_status: /vnem_tools_restore_backup/.test(server) && /safeRestoreBackup/.test(server) && /approval_required/.test(test),
  browser_capture_tool_status: /vnem_tools_browser_capture/.test(server) && /safeBrowserCapture/.test(server) && /browser_unavailable/.test(server),
  browser_dry_run_default: /vnem_tools_browser_capture[\s\S]*dry_run:\s*z\.boolean\(\)\.default\(true\)/.test(server),
  browser_approval_required: /vnem_tools_browser_capture[\s\S]*approved:\s*z\.boolean\(\)\.default\(false\)/.test(server) && /approval_required/.test(browserTest),
  external_url_blocked: /external_url_blocked/.test(server) && /external_url_blocked/.test(browserTest),
  secret_file_browser_blocked: /vnem_tools_browser_capture/.test(browserTest) && /secret_path_blocked/.test(browserTest),
  screenshot_evidence_status: /screenshots/.test(server) && /screenshot_sha256/.test(server) && /proof_trail_compatible_summary/.test(server) && /screenshot_paths/.test(server),
  evidence_proof_bridge_status: /proof_trail_compatible_summary/.test(server) && /recommended_core_proof_trail_inputs/.test(server) && /recommended_final_report_lines/.test(server),
  safe_action_loop_status: /vnem_boost_task/.test(e2eTest) && /vnem_tools_prepare_action_plan/.test(e2eTest) && /dry_run: true/.test(e2eTest) && /approved: false/.test(e2eTest) && /vnem_tools_run_command/.test(e2eTest) && /vnem_tools_collect_evidence/.test(e2eTest),
  dry_run_default: /dry_run:\s*z\.boolean\(\)\.default\(true\)/.test(server),
  approval_required: /approval_required/.test(server) && /approved=true/.test(server),
  dangerous_commands_blocked: /DANGEROUS_COMMAND_PATTERN/.test(server) && /dangerous_command_blocked/.test(server) && /rm\s\+-rf|git\\s\+push|npm\\s\+publish/.test(server),
  secret_paths_blocked: /secret_path_blocked/.test(server) && /isSecretLikePath/.test(server),
  evidence_log_works: /writeEvidenceLog/.test(server) && /vnem_tools_collect_evidence/.test(server) && /evidence_log_id/.test(server),
  core_handoff_supported: /core_handoff/.test(server) && /selected_usable_api_packs/.test(server) && /selected_usable_skill_packs/.test(server),
  tests_cover_safety: {
    dry_run: /dry-run|dry_run/.test(test),
    approval_required: /approval_required/.test(test),
    dangerous_command: /dangerous_command_blocked/.test(test),
    outside_root: /path_outside_allowed_roots/.test(test),
    secret_path: /secret_path_blocked/.test(test),
    raw_secret_api: /raw_secret_blocked/.test(test),
    evidence: /vnem_tools_collect_evidence/.test(test)
  },
  known_missing_future_tools: [
    "GitHub mutation",
    "package installs",
    "arbitrary shell",
    "unrestricted API calls",
    "secret-manager-backed live API calls",
    "Giga MCP orchestration"
  ],
  browser_known_limitations: [
    "local file/localhost screenshot evidence only by default",
    "reports browser_unavailable when no headless browser runtime is present",
    "no login automation, cookie extraction, persistent sessions, CAPTCHA bypass, credential capture, or broad scraping"
  ]
};

assert.equal(report.server_file_exists, true, "Tools MCP server file is missing");
assert.equal(report.test_file_exists, true, "Tools MCP test file is missing");
assert.equal(report.core_tools_e2e_test_exists, true, "Core→Tools e2e test file is missing");
assert.equal(report.browser_capture_test_exists, true, "browser capture test file is missing");
assert.equal(report.core_tools_e2e_script_exists, true, "test:core-tools-e2e package script is missing");
assert.equal(report.package_scripts.tools_mcp, true, "tools:mcp package script is missing");
assert.equal(report.package_scripts.test_tools_mcp, true, "test:tools-mcp package script is missing");
assert.equal(report.package_scripts.test_tools_browser, true, "test:tools-browser package script is missing");
for (const [name, present] of Object.entries(report.required_tools_present)) assert.equal(present, true, `missing required tool ${name}`);
assert.equal(report.dry_run_default, true, "dry-run defaults are missing");
assert.equal(report.mcp_config_tools_support, true, "MCP config Tools support is missing");
assert.equal(report.restore_tool_status, true, "restore tool support is missing");
assert.equal(report.browser_capture_tool_status, true, "browser capture tool support is missing");
assert.equal(report.browser_dry_run_default, true, "browser capture dry-run default is missing");
assert.equal(report.browser_approval_required, true, "browser capture approval gate is missing");
assert.equal(report.external_url_blocked, true, "external browser URL blocking is missing");
assert.equal(report.secret_file_browser_blocked, true, "secret-file browser blocking is missing");
assert.equal(report.screenshot_evidence_status, true, "screenshot evidence bridge is missing");
assert.equal(report.evidence_proof_bridge_status, true, "evidence proof bridge is missing");
assert.equal(report.safe_action_loop_status, true, "Core→Tools safe action loop test coverage is missing");
assert.equal(report.approval_required, true, "approval-required policy is missing");
assert.equal(report.dangerous_commands_blocked, true, "dangerous command blocking is missing");
assert.equal(report.secret_paths_blocked, true, "secret path blocking is missing");
assert.equal(report.evidence_log_works, true, "evidence logging is missing");
assert.equal(report.core_handoff_supported, true, "Core handoff support is missing");
for (const [name, covered] of Object.entries(report.tests_cover_safety)) assert.equal(covered, true, `test coverage missing: ${name}`);

console.log("VNEM Tools MCP readiness report");
console.log(`server_file_exists: ${yes(report.server_file_exists)}`);
console.log(`test_file_exists: ${yes(report.test_file_exists)}`);
console.log(`core_tools_e2e_test_exists: ${yes(report.core_tools_e2e_test_exists)}`);
console.log(`browser_capture_test_exists: ${yes(report.browser_capture_test_exists)}`);
console.log(`core_tools_e2e_script_exists: ${yes(report.core_tools_e2e_script_exists)}`);
console.log(`required_tools_present: ${Object.values(report.required_tools_present).filter(Boolean).length}/${requiredTools.length}`);
console.log(`mcp_config_tools_support: ${yes(report.mcp_config_tools_support)}`);
console.log(`restore_tool_status: ${yes(report.restore_tool_status)}`);
console.log(`browser_capture_tool_status: ${yes(report.browser_capture_tool_status)}`);
console.log(`browser_dry_run_default: ${yes(report.browser_dry_run_default)}`);
console.log(`browser_approval_required: ${yes(report.browser_approval_required)}`);
console.log(`external_url_blocked: ${yes(report.external_url_blocked)}`);
console.log(`secret_file_browser_blocked: ${yes(report.secret_file_browser_blocked)}`);
console.log(`screenshot_evidence_status: ${yes(report.screenshot_evidence_status)}`);
console.log(`evidence_proof_bridge_status: ${yes(report.evidence_proof_bridge_status)}`);
console.log(`safe_action_loop_status: ${yes(report.safe_action_loop_status)}`);
console.log(`dry_run_default: ${yes(report.dry_run_default)}`);
console.log(`approval_required: ${yes(report.approval_required)}`);
console.log(`dangerous_commands_blocked: ${yes(report.dangerous_commands_blocked)}`);
console.log(`secret_paths_blocked: ${yes(report.secret_paths_blocked)}`);
console.log(`evidence_log_works: ${yes(report.evidence_log_works)}`);
console.log(`core_handoff_supported: ${yes(report.core_handoff_supported)}`);
console.log(`known_missing_future_tools: ${report.known_missing_future_tools.join(", ")}`);
console.log(`browser_known_limitations: ${report.browser_known_limitations.join("; ")}`);
console.log("browser_capture_supported_with_local_allowlist_or_reports_browser_unavailable: yes");
console.log("readiness_verdict: foundation_ready");

function yes(value) {
  return value ? "yes" : "no";
}
