#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const rel = (value) => path.join(rootDir, value);
const json = async (file) => JSON.parse(await readFile(rel(file), "utf8"));
const text = async (file) => readFile(rel(file), "utf8");
const git = (...args) => {
  try {
    return execFileSync("git", args, { cwd: rootDir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "unknown";
  }
};

const library = await json("capabilities/super-library.json");
const serverSource = await text("scripts/vnem-mcp-server.mjs");
const readme = await text("README.md");
const installGuide = await text(".vnem/install-guide.md");
const packageJson = await json("package.json");
const toolInventory = parseDefaultTools(serverSource);
const forbiddenCoreTools = toolInventory.filter((tool) => /terminal|browser|filesystem|file_write|apply_diff|patch_file|github|exec|execute|shell|api_call|live_call|install_skill|run_skill/i.test(tool));
const apiCounts = countApis(library.apis || []);
const skillCounts = countSkills(library.skills || []);
const fixtureCoverage = {
  skills_html: existsSync(rel("fixtures/super-library/skills-sh-sample.html")),
  agent_skills_tree_json: existsSync(rel("fixtures/super-library/agent-skills-tree-sample.json")),
  public_apis_markdown: existsSync(rel("fixtures/super-library/public-apis-sample.md")),
  skill_md_sample: existsSync(rel("fixtures/super-library/skill-md-sample.md")),
  api_verification_sample_json: existsSync(rel("fixtures/super-library/api-verification-sample.json")),
  importer_test: existsSync(rel("scripts/test-super-library-importer.mjs"))
};
const docsGeneratedArtifacts = {
  readme_api_profile: readme.includes("vnem_api_safety_profile"),
  readme_skill_profile: readme.includes("vnem_skill_safety_profile"),
  readme_real_user_examples: /weather widget|Elden Ring|modding|final proof/i.test(readme),
  install_api_profile: installGuide.includes("vnem_api_safety_profile"),
  install_skill_profile: installGuide.includes("vnem_skill_safety_profile"),
  generated_install_tgz: existsSync(rel("public/install.tgz")) && statSync(rel("public/install.tgz")).size > 0,
  landing_install_tgz: existsSync(rel("landing/install.tgz")) && statSync(rel("landing/install.tgz")).size > 0
};
const proofAuditProtection = {
  vnem_completion_audit: toolInventory.includes("vnem_completion_audit"),
  vnem_protection_review: toolInventory.includes("vnem_protection_review"),
  vnem_proof_trail: toolInventory.includes("vnem_proof_trail")
};
const domainCoverage = {
  ui_backend_data_flow: /data flow|data-flow|Backend-to-UI/i.test(serverSource + readme),
  game_build_context: /PvE\/PvP|rune level|DLC|Shadow of the Erdtree/i.test(serverSource + readme),
  modding_pipeline: /file-format|file format|backup|restore|toolchain|modding/i.test(serverSource + readme),
  api_secret_cors_boundary: /CORS|secret|backend proxy|API-key/i.test(serverSource + readme)
};

assert.ok(toolInventory.includes("vnem_api_safety_profile"), "Core MCP API safety profile tool is missing");
assert.ok(toolInventory.includes("vnem_skill_safety_profile"), "Core MCP skill safety profile tool is missing");
assert.equal(forbiddenCoreTools.length, 0, `Default Core MCP exposes high-power-looking tool names: ${forbiddenCoreTools.join(", ")}`);
assert.ok((library.skills || []).length > 0, "skill library is empty");
assert.ok((library.apis || []).length > 0, "API library is empty");
assert.ok(Object.values(fixtureCoverage).every(Boolean), "fixture importer coverage is incomplete");
assert.ok(Object.values(proofAuditProtection).every(Boolean), "proof/audit/protection tool coverage is incomplete");
assert.ok(packageJson.scripts?.["core:readiness"], "package script core:readiness is missing");

const blockers = [];
if (apiCounts.docs_unknown_count > 0) blockers.push("some official API docs URLs remain unknown");
if (apiCounts.rate_limit_unknown_count > 0) blockers.push("some API rate limits remain unknown");
if (apiCounts.cors_unknown_count > 0) blockers.push("some API CORS values remain unknown");
if (skillCounts.unknown_client_compatibility_count > 0) blockers.push("some skill client compatibility remains unknown");
if (skillCounts.manual_review_required_count > 0) blockers.push("external skills still require manual review before install/execution");
if (!Object.values(docsGeneratedArtifacts).every(Boolean)) blockers.push("some docs/generated artifact consistency checks are missing");

const allTestsRunnable = Object.values(fixtureCoverage).every(Boolean) && Object.values(domainCoverage).every(Boolean) && Object.values(docsGeneratedArtifacts).filter(Boolean).length >= 5;
const readinessVerdict = !allTestsRunnable ? "blocked" : blockers.length ? "closer" : "not_ready";
assert.ok(["closer", "not_ready", "blocked"].includes(readinessVerdict), "readiness verdict must never be final");
assert.notEqual(readinessVerdict, "final", "Core MCP must not claim final readiness from this report");

const report = {
  readiness_verdict: readinessVerdict,
  branch: git("branch", "--show-current"),
  commit: git("rev-parse", "--short", "HEAD"),
  working_tree_status: git("status", "--short"),
  tool_inventory: {
    count: toolInventory.length,
    tools: toolInventory,
    read_only_status: forbiddenCoreTools.length === 0 ? "pass_default_core_has_no_high_power_tool_names" : "fail",
    forbidden_core_tool_names: forbiddenCoreTools
  },
  proof_trail_completion_audit_protection_review_status: proofAuditProtection,
  api_library_counts: apiCounts,
  skill_library_counts: skillCounts,
  fixture_importer_test_coverage: fixtureCoverage,
  domain_contract_test_coverage: domainCoverage,
  docs_generated_artifact_status: docsGeneratedArtifacts,
  ready: [
    "Default Core MCP tool inventory is read-only by tool name/annotations and does not expose terminal/browser/filesystem/GitHub mutation tools.",
    "Proof trail, completion audit, and protection review tools are present.",
    "Fixture importer coverage includes API verification and SKILL.md parsing cases.",
    "Curated API records carry explicit docs/rate-limit confidence instead of guessed certainty."
  ],
  not_ready: [
    "Most API docs, rate limits, CORS values, and freshness statuses remain metadata-level or unknown.",
    "Most skill/client compatibility remains unknown or likely, not verified for named clients.",
    "Core can summarize guidance only; install/execution and live API calls remain outside Core MCP."
  ],
  remaining_blockers_before_final_enough: blockers,
  next_technical_priorities: [
    "Verify another small high-value API slice from official docs with rate-limit/CORS evidence.",
    "Add source-reviewed SKILL.md summaries and client compatibility evidence for selected high-value skills.",
    "Keep readiness reporting strict: closer/not_ready/blocked only until unknowns are materially reduced.",
    "Keep Core MCP read-only; reserve installation, execution, browser, terminal, GitHub, and live API calls for future Precision/Tools MCP."
  ]
};

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(formatReport(report));
}

function parseDefaultTools(source) {
  const match = source.match(/const DEFAULT_MCP_TOOLS = \[([\s\S]*?)\];/);
  if (!match) return [];
  return [...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]);
}

function countApis(apis) {
  const docsVerified = apis.filter((api) => /official_docs_verified/.test(api.documentation_confidence || "") || (api.official_docs_url && api.official_docs_url !== "unknown" && Array.isArray(api.verification_source_urls) && api.verification_source_urls.includes(api.official_docs_url))).length;
  const rateLimitVerified = apis.filter((api) => api.rate_limit_confidence && !/^unknown/i.test(api.rate_limit_confidence)).length;
  return {
    total_apis: apis.length,
    docs_verified_count: docsVerified,
    docs_unknown_count: apis.filter((api) => !api.official_docs_url || api.official_docs_url === "unknown" || api.documentation_confidence === "unknown").length,
    freshness_verified_or_checked_count: apis.filter((api) => api.freshness_checked_at && !/^unknown/i.test(api.freshness_checked_at)).length,
    freshness_unknown_count: apis.filter((api) => /unknown|failed_to_verify/i.test(api.freshness_status || "")).length,
    rate_limit_verified_count: rateLimitVerified,
    rate_limit_unknown_count: apis.filter((api) => !api.rate_limit_confidence || /^unknown/i.test(api.rate_limit_confidence) || /unknown/i.test(api.rate_limit_notes || "")).length,
    cors_unknown_count: apis.filter((api) => api.cors === "unknown" || api.cors_confidence === "unknown").length,
    frontend_safe_count: apis.filter((api) => api.frontend_safe === true).length,
    backend_required_count: apis.filter((api) => api.backend_required === true).length,
    secret_risk_count: apis.filter((api) => api.secret_risk === true).length
  };
}

function countSkills(skills) {
  return {
    total_skills: skills.length,
    parsed_summaries_count: skills.filter((skill) => /skill_md|parsed|detected/i.test(`${skill.source_review_status} ${skill.verified_instruction_summary}`)).length,
    verified_client_compatibility_count: skills.filter((skill) => skill.agent_compatibility_confidence === "verified").length,
    likely_client_compatibility_count: skills.filter((skill) => skill.agent_compatibility_confidence === "likely").length,
    unknown_client_compatibility_count: skills.filter((skill) => !skill.agent_compatibility_confidence || skill.agent_compatibility_confidence === "unknown").length,
    manual_review_required_count: skills.filter((skill) => skill.manual_review_required !== false || /manual_review_required|prompt_injection_surface/i.test((skill.risk_flags || []).join(" "))).length,
    core_guidance_capable_count: skills.filter((skill) => skill.core_can_apply_guidance !== false).length,
    install_precision_required_count: skills.filter((skill) => skill.requires_install !== false || skill.precision_required_for_install !== false).length,
    supported_clients_verified_nonempty_count: skills.filter((skill) => Array.isArray(skill.supported_clients_verified) && skill.supported_clients_verified.length > 0).length
  };
}

function formatReport(report) {
  const lines = [];
  lines.push("VNEM Core MCP readiness report");
  lines.push(`readiness_verdict: ${report.readiness_verdict}`);
  lines.push(`branch: ${report.branch}`);
  lines.push(`commit: ${report.commit}`);
  lines.push(`working_tree_clean: ${report.working_tree_status ? "no" : "yes"}`);
  lines.push(`core_tools: ${report.tool_inventory.count}`);
  lines.push(`read_only_status: ${report.tool_inventory.read_only_status}`);
  lines.push(`proof_audit_protection: ${status(report.proof_trail_completion_audit_protection_review_status)}`);
  lines.push(`api_counts: total=${report.api_library_counts.total_apis}, docs_verified=${report.api_library_counts.docs_verified_count}, docs_unknown=${report.api_library_counts.docs_unknown_count}, rate_limit_verified=${report.api_library_counts.rate_limit_verified_count}, rate_limit_unknown=${report.api_library_counts.rate_limit_unknown_count}, cors_unknown=${report.api_library_counts.cors_unknown_count}, frontend_safe=${report.api_library_counts.frontend_safe_count}, backend_required=${report.api_library_counts.backend_required_count}`);
  lines.push(`skill_counts: total=${report.skill_library_counts.total_skills}, parsed_summaries=${report.skill_library_counts.parsed_summaries_count}, verified_client_compat=${report.skill_library_counts.verified_client_compatibility_count}, likely_client_compat=${report.skill_library_counts.likely_client_compatibility_count}, unknown_client_compat=${report.skill_library_counts.unknown_client_compatibility_count}, manual_review_required=${report.skill_library_counts.manual_review_required_count}, core_guidance_capable=${report.skill_library_counts.core_guidance_capable_count}, install_precision_required=${report.skill_library_counts.install_precision_required_count}`);
  lines.push(`fixture_coverage: ${status(report.fixture_importer_test_coverage)}`);
  lines.push(`domain_contracts: ${status(report.domain_contract_test_coverage)}`);
  lines.push(`docs_generated_artifacts: ${status(report.docs_generated_artifact_status)}`);
  lines.push("ready:");
  for (const item of report.ready) lines.push(`- ${item}`);
  lines.push("not_ready:");
  for (const item of report.not_ready) lines.push(`- ${item}`);
  lines.push("remaining_blockers_before_final_enough:");
  for (const blocker of report.remaining_blockers_before_final_enough) lines.push(`- ${blocker}`);
  lines.push("next_technical_priorities:");
  for (const priority of report.next_technical_priorities) lines.push(`- ${priority}`);
  return lines.join("\n");
}

function status(object) {
  return Object.entries(object).map(([key, value]) => `${key}=${value ? "yes" : "no"}`).join(", ");
}
