#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const rel = (value) => path.join(rootDir, value);
const json = async (file) => JSON.parse(await readFile(rel(file), "utf8"));
const text = async (file) => readFile(rel(file), "utf8");

const library = await json("capabilities/super-library.json");
const serverSource = await text("scripts/vnem-mcp-server.mjs");
const readme = await text("README.md");
const installGuide = await text(".vnem/install-guide.md");
const packageJson = await json("package.json");

const toolInventory = parseDefaultTools(serverSource);
const forbiddenCoreTools = toolInventory.filter((tool) => /terminal|browser|filesystem|file_write|apply_diff|patch_file|github|exec|execute|shell|api_call|live_call|install_skill|run_skill/i.test(tool));
const apiUnknownCounts = countApiUnknowns(library.apis || []);
const skillUnknownCounts = countSkillUnknowns(library.skills || []);
const fixtureCoverage = {
  skills_html: existsSync(rel("fixtures/super-library/skills-sh-sample.html")),
  agent_skills_tree_json: existsSync(rel("fixtures/super-library/agent-skills-tree-sample.json")),
  public_apis_markdown: existsSync(rel("fixtures/super-library/public-apis-sample.md")),
  skill_md_sample: existsSync(rel("fixtures/super-library/skill-md-sample.md")),
  importer_test: existsSync(rel("scripts/test-super-library-importer.mjs"))
};
const docsConsistency = {
  readme_api_profile: readme.includes("vnem_api_safety_profile"),
  readme_skill_profile: readme.includes("vnem_skill_safety_profile"),
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
if (apiUnknownCounts.official_docs_unknown > 0) blockers.push("some official API docs URLs remain unknown");
if (apiUnknownCounts.rate_limit_unknown > 0) blockers.push("some API rate limits remain unknown");
if (skillUnknownCounts.supported_agents_unknown > 0) blockers.push("some skill supported-client compatibility remains unknown");
if (skillUnknownCounts.content_confidence_unknown > 0) blockers.push("some skill content confidence remains unknown");
if (!Object.values(docsConsistency).every(Boolean)) blockers.push("some docs/generated artifact consistency checks are missing");

const report = {
  readiness_status: blockers.length ? "closer_not_final" : "ready_for_final_review",
  tool_inventory: {
    count: toolInventory.length,
    tools: toolInventory,
    read_only_boundary: forbiddenCoreTools.length === 0 ? "pass_default_core_has_no_high_power_tool_names" : "fail",
    forbidden_core_tool_names: forbiddenCoreTools
  },
  library_quality_metrics: {
    skills: (library.skills || []).length,
    apis: (library.apis || []).length,
    api_priority_enriched: (library.apis || []).filter((api) => api.priority_enrichment_category === true).length,
    api_with_verification_source_urls: (library.apis || []).filter((api) => Array.isArray(api.verification_source_urls) && api.verification_source_urls.length).length,
    skills_with_detected_or_parsed_skill_md: (library.skills || []).filter((skill) => /skill_md/.test(skill.source_review_status || "")).length
  },
  api_unknown_counts: apiUnknownCounts,
  skill_unknown_counts: skillUnknownCounts,
  fixture_test_coverage_status: fixtureCoverage,
  proof_trail_audit_protection_status: proofAuditProtection,
  domain_contract_coverage_status: domainCoverage,
  docs_generated_artifact_consistency_status: docsConsistency,
  remaining_blockers_before_final_enough: blockers,
  next_technical_priorities: [
    "verify official docs and rate limits for a curated subset of high-use APIs",
    "parse more SKILL.md content with untrusted-summary boundaries and source-review status",
    "add richer client compatibility evidence for Codex, Claude Code, Cursor, Windsurf, Hermes, and Gemini",
    "keep Core MCP read-only; reserve installation, execution, browser, terminal, GitHub, and live API calls for future Precision/Tools MCP"
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

function countApiUnknowns(apis) {
  return {
    total: apis.length,
    official_docs_unknown: apis.filter((api) => !api.official_docs_url || api.official_docs_url === "unknown").length,
    freshness_unknown: apis.filter((api) => /unknown/i.test(api.freshness_status || "")).length,
    rate_limit_unknown: apis.filter((api) => /unknown/i.test(api.rate_limit_notes || "")).length,
    cors_unknown: apis.filter((api) => api.cors === "unknown").length,
    documentation_confidence_unknown: apis.filter((api) => !api.documentation_confidence || api.documentation_confidence === "unknown").length,
    frontend_safe: apis.filter((api) => api.frontend_safe === true).length,
    backend_required: apis.filter((api) => api.backend_required === true).length,
    secret_risk: apis.filter((api) => api.secret_risk === true).length
  };
}

function countSkillUnknowns(skills) {
  return {
    total: skills.length,
    supported_agents_unknown: skills.filter((skill) => (skill.supported_agents || []).includes("unknown")).length,
    agent_compatibility_unknown: skills.filter((skill) => skill.agent_compatibility_confidence === "unknown").length,
    content_confidence_unknown: skills.filter((skill) => skill.skill_content_confidence === "unknown").length,
    source_metadata_only_or_untrusted: skills.filter((skill) => /metadata|untrusted/i.test(skill.source_review_status || skill.review_status || "")).length,
    prompt_injection_surface: skills.filter((skill) => (skill.risk_flags || []).includes("prompt_injection_surface")).length,
    precision_required_for_install: skills.filter((skill) => skill.precision_required_for_install === true).length
  };
}

function formatReport(report) {
  const lines = [];
  lines.push("VNEM Core MCP finalization-readiness report");
  lines.push(`readiness_status: ${report.readiness_status}`);
  lines.push(`tool_inventory: ${report.tool_inventory.count} default Core MCP tools`);
  lines.push(`read_only_boundary: ${report.tool_inventory.read_only_boundary}`);
  lines.push(`skills: ${report.library_quality_metrics.skills}; apis: ${report.library_quality_metrics.apis}`);
  lines.push(`priority_api_records: ${report.library_quality_metrics.api_priority_enriched}`);
  lines.push(`api_unknowns: docs=${report.api_unknown_counts.official_docs_unknown}, freshness=${report.api_unknown_counts.freshness_unknown}, rate_limits=${report.api_unknown_counts.rate_limit_unknown}, cors=${report.api_unknown_counts.cors_unknown}`);
  lines.push(`skill_unknowns: supported_agents=${report.skill_unknown_counts.supported_agents_unknown}, compatibility=${report.skill_unknown_counts.agent_compatibility_unknown}, content=${report.skill_unknown_counts.content_confidence_unknown}`);
  lines.push(`fixture_coverage: ${status(report.fixture_test_coverage_status)}`);
  lines.push(`proof_audit_protection: ${status(report.proof_trail_audit_protection_status)}`);
  lines.push(`domain_contracts: ${status(report.domain_contract_coverage_status)}`);
  lines.push(`docs_generated_artifacts: ${status(report.docs_generated_artifact_consistency_status)}`);
  lines.push("remaining_blockers_before_final_enough:");
  for (const blocker of report.remaining_blockers_before_final_enough) lines.push(`- ${blocker}`);
  lines.push("next_technical_priorities:");
  for (const priority of report.next_technical_priorities) lines.push(`- ${priority}`);
  return lines.join("\n");
}

function status(object) {
  return Object.entries(object).map(([key, value]) => `${key}=${value ? "yes" : "no"}`).join(", ");
}
