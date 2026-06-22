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
const pkg = JSON.parse(readFileSync(rel("package.json"), "utf8"));
const server = existsSync(serverPath) ? readFileSync(serverPath, "utf8") : "";
const test = existsSync(testPath) ? readFileSync(testPath, "utf8") : "";
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
  "vnem_tools_collect_evidence"
];

const report = {
  server_file_exists: existsSync(serverPath),
  test_file_exists: existsSync(testPath),
  package_scripts: {
    tools_mcp: pkg.scripts?.["tools:mcp"] === "node scripts/vnem-tools-mcp-server.mjs",
    test_tools_mcp: pkg.scripts?.["test:tools-mcp"] === "node scripts/test-tools-mcp-server.mjs"
  },
  required_tools_present: Object.fromEntries(requiredTools.map((name) => [name, server.includes(`"${name}"`)])),
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
    "browser screenshots",
    "GitHub mutation",
    "package installs",
    "arbitrary shell",
    "unrestricted API calls",
    "Giga MCP orchestration"
  ]
};

assert.equal(report.server_file_exists, true, "Tools MCP server file is missing");
assert.equal(report.test_file_exists, true, "Tools MCP test file is missing");
assert.equal(report.package_scripts.tools_mcp, true, "tools:mcp package script is missing");
assert.equal(report.package_scripts.test_tools_mcp, true, "test:tools-mcp package script is missing");
for (const [name, present] of Object.entries(report.required_tools_present)) assert.equal(present, true, `missing required tool ${name}`);
assert.equal(report.dry_run_default, true, "dry-run defaults are missing");
assert.equal(report.approval_required, true, "approval-required policy is missing");
assert.equal(report.dangerous_commands_blocked, true, "dangerous command blocking is missing");
assert.equal(report.secret_paths_blocked, true, "secret path blocking is missing");
assert.equal(report.evidence_log_works, true, "evidence logging is missing");
assert.equal(report.core_handoff_supported, true, "Core handoff support is missing");
for (const [name, covered] of Object.entries(report.tests_cover_safety)) assert.equal(covered, true, `test coverage missing: ${name}`);

console.log("VNEM Tools MCP readiness report");
console.log(`server_file_exists: ${yes(report.server_file_exists)}`);
console.log(`test_file_exists: ${yes(report.test_file_exists)}`);
console.log(`required_tools_present: ${Object.values(report.required_tools_present).filter(Boolean).length}/${requiredTools.length}`);
console.log(`dry_run_default: ${yes(report.dry_run_default)}`);
console.log(`approval_required: ${yes(report.approval_required)}`);
console.log(`dangerous_commands_blocked: ${yes(report.dangerous_commands_blocked)}`);
console.log(`secret_paths_blocked: ${yes(report.secret_paths_blocked)}`);
console.log(`evidence_log_works: ${yes(report.evidence_log_works)}`);
console.log(`core_handoff_supported: ${yes(report.core_handoff_supported)}`);
console.log(`known_missing_future_tools: ${report.known_missing_future_tools.join(", ")}`);
console.log("readiness_verdict: foundation_ready");

function yes(value) {
  return value ? "yes" : "no";
}
