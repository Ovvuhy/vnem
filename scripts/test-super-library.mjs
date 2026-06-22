#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import Ajv2020 from "ajv/dist/2020.js";

const library = JSON.parse(await readFile("capabilities/super-library.json", "utf8"));
const librarySchema = JSON.parse(await readFile("schemas/super-library.schema.json", "utf8"));
const agentProfiles = JSON.parse(await readFile("capabilities/agent-profiles.json", "utf8"));
const usablePacks = JSON.parse(await readFile("capabilities/usable-capability-packs.json", "utf8"));
const agentProfilesSchema = JSON.parse(await readFile("schemas/agent-profiles.schema.json", "utf8"));
const ajv = new Ajv2020({ allErrors: true });

assert.equal(ajv.validate(librarySchema, library), true, `super-library schema validation failed: ${ajv.errorsText()}`);
assert.equal(ajv.validate(agentProfilesSchema, agentProfiles), true, `agent-profiles schema validation failed: ${ajv.errorsText()}`);

assert.equal(library.schema_version, "vnem-super-library/v0.1");
assert.ok(library.sources.some((source) => source.url === "https://www.skills.sh/"));
assert.ok(library.sources.some((source) => source.url === "https://raw.githubusercontent.com/public-apis/public-apis/master/README.md"));
assert.ok(library.skills.length >= 30, "expected at least 30 skill capability records");
assert.ok(library.apis.length >= 100, "expected at least 100 API capability records");

for (const skill of library.skills) {
  assert.ok(skill.id.startsWith("skill:"), `skill id should be namespaced: ${skill.id}`);
  assert.ok(skill.source, `skill ${skill.id} missing source`);
  assert.ok(skill.source_url, `skill ${skill.id} missing source_url`);
  assert.ok(skill.imported_from, `skill ${skill.id} missing imported_from`);
  assert.ok(Array.isArray(skill.task_types), `skill ${skill.id} missing task_types`);
  assert.ok(Array.isArray(skill.supported_agents), `skill ${skill.id} missing supported_agents`);
  assert.equal(typeof skill.verified_instruction_summary, "string", `skill ${skill.id} missing verified_instruction_summary`);
  assert.equal(typeof skill.agent_compatibility_confidence, "string", `skill ${skill.id} missing agent_compatibility_confidence`);
  assert.equal(typeof skill.client_compatibility_notes, "string", `skill ${skill.id} missing client_compatibility_notes`);
  assert.ok(Array.isArray(skill.supported_clients_verified), `skill ${skill.id} missing supported_clients_verified`);
  assert.equal(typeof skill.requires_install, "boolean", `skill ${skill.id} missing requires_install`);
  assert.equal(typeof skill.core_can_apply_guidance, "boolean", `skill ${skill.id} missing core_can_apply_guidance`);
  assert.equal(typeof skill.precision_required_for_install, "boolean", `skill ${skill.id} missing precision_required_for_install`);
  assert.equal(typeof skill.source_review_status, "string", `skill ${skill.id} missing source_review_status`);
  assert.equal(typeof skill.skill_content_confidence, "string", `skill ${skill.id} missing skill_content_confidence`);
  assert.ok(Array.isArray(skill.required_evidence), `skill ${skill.id} missing required_evidence`);
  assert.ok(Array.isArray(skill.skill_safety_profile_fields), `skill ${skill.id} missing skill_safety_profile_fields`);
  assert.equal(skill.core_can_apply_guidance, true, `skill ${skill.id} should allow Core MCP guidance use`);
  assert.equal(skill.precision_required_for_install, true, `skill ${skill.id} install should require Precision/Tools`);
  assert.ok(Array.isArray(skill.compatible_with), `skill ${skill.id} missing compatible_with`);
  assert.ok(Array.isArray(skill.avoid_with), `skill ${skill.id} missing avoid_with`);
  assert.ok(Array.isArray(skill.when_to_use), `skill ${skill.id} missing when_to_use`);
  assert.ok(Array.isArray(skill.when_not_to_use), `skill ${skill.id} missing when_not_to_use`);
  assert.ok(skill.risk_flags.includes("requires_manual_review"), `skill ${skill.id} should require manual review`);
  assert.ok(skill.risk_flags.includes("prompt_injection_surface"), `skill ${skill.id} should be prompt-injection surface`);
  assert.notEqual(skill.review_status, "reviewed", `skill ${skill.id} should not be falsely reviewed`);
}

for (const api of library.apis) {
  assert.ok(api.id.startsWith("api:"), `api id should be namespaced: ${api.id}`);
  assert.ok(api.source, `api ${api.id} missing source`);
  assert.ok(api.source_url, `api ${api.id} missing source_url`);
  assert.ok(api.imported_from, `api ${api.id} missing imported_from`);
  assert.ok(["none", "apiKey", "OAuth", "unknown"].includes(api.auth_type), `api ${api.id} invalid auth_type`);
  assert.ok(["yes", "no", "unknown"].includes(api.https), `api ${api.id} invalid https`);
  assert.ok(["yes", "no", "unknown"].includes(api.cors), `api ${api.id} invalid cors`);
  assert.equal(typeof api.official_docs_url, "string", `api ${api.id} missing official_docs_url`);
  assert.equal(typeof api.freshness_checked_at, "string", `api ${api.id} missing freshness_checked_at`);
  assert.equal(typeof api.freshness_status, "string", `api ${api.id} missing freshness_status`);
  assert.equal(typeof api.rate_limit_confidence, "string", `api ${api.id} missing rate_limit_confidence`);
  assert.equal(typeof api.cors_confidence, "string", `api ${api.id} missing cors_confidence`);
  assert.equal(typeof api.frontend_safety_reason, "string", `api ${api.id} missing frontend_safety_reason`);
  assert.equal(typeof api.backend_proxy_reason, "string", `api ${api.id} missing backend_proxy_reason`);
  assert.equal(typeof api.secret_handling_pattern, "string", `api ${api.id} missing secret_handling_pattern`);
  assert.ok(Array.isArray(api.verification_source_urls), `api ${api.id} missing verification_source_urls`);
  assert.equal(typeof api.documentation_confidence, "string", `api ${api.id} missing documentation_confidence`);
  assert.ok(Array.isArray(api.recommended_combinations), `api ${api.id} missing recommended_combinations`);
  assert.ok(Array.isArray(api.api_safety_profile_fields), `api ${api.id} missing api_safety_profile_fields`);
  assert.ok(Array.isArray(api.integration_test_requirements), `api ${api.id} missing integration_test_requirements`);
  assert.ok(api.freshness_status.includes("unknown") || api.freshness_status.includes("current") || api.freshness_status.includes("verified"), `api ${api.id} freshness must be explicit`);
  assert.equal(typeof api.frontend_safe, "boolean", `api ${api.id} missing frontend_safe`);
  assert.equal(typeof api.backend_required, "boolean", `api ${api.id} missing backend_required`);
  assert.equal(typeof api.secret_risk, "boolean", `api ${api.id} missing secret_risk`);
  assert.ok(Array.isArray(api.compatible_with), `api ${api.id} missing compatible_with`);
  assert.ok(Array.isArray(api.avoid_with), `api ${api.id} missing avoid_with`);
  assert.ok(api.risk_flags.includes("requires_manual_review"), `api ${api.id} should require manual review`);
  assert.notEqual(api.review_status, "reviewed", `api ${api.id} should not be falsely reviewed`);
  if (api.auth_type === "apiKey" || api.auth_type === "OAuth") {
    assert.equal(api.secret_risk, true, `secret-bearing API ${api.id} must have secret_risk`);
    assert.equal(api.frontend_safe, false, `secret-bearing API ${api.id} cannot be frontend_safe`);
    assert.ok(api.backend_required, `secret-bearing API ${api.id} should require backend`);
  }
  if (api.cors === "unknown") assert.ok(api.risk_flags.includes("cors_unknown"), `api ${api.id} missing cors_unknown flag`);
  if (api.cors === "no") assert.ok(api.risk_flags.includes("cors_no"), `api ${api.id} missing cors_no flag`);
  if (api.https === "no") assert.ok(api.risk_flags.includes("https_no"), `api ${api.id} missing https_no flag`);
}

assert.ok(library.skills.some((skill) => /react|next|web-design|frontend/i.test(skill.name)), "expected React/Next/UI skill seed");
assert.ok(library.apis.some((api) => /weather|forecast/i.test(`${api.name} ${api.category} ${api.description}`)), "expected weather API seed");
assert.ok(library.apis.some((api) => /finance|currency|exchange/i.test(`${api.name} ${api.category} ${api.description}`)), "expected finance/currency API seed");
const openMeteoRecord = library.apis.find((api) => api.id === "api:weather:open-meteo");
assert.ok(openMeteoRecord, "expected Open-Meteo priority API record");
assert.ok(openMeteoRecord.official_docs_url === "https://open-meteo.com/en/docs" || openMeteoRecord.official_docs_url === "unknown", "official docs URL should be sourced or unknown");
assert.notEqual(openMeteoRecord.rate_limit_notes, "unlimited", "rate limits must not be invented");
const abuseIpDbRecord = library.apis.find((api) => api.id === "api:anti-malware:abuseipdb");
assert.ok(abuseIpDbRecord, "expected security priority API record");
assert.equal(abuseIpDbRecord.frontend_safe, false, "secret-bearing security API must not be frontend-safe");
assert.ok(abuseIpDbRecord.backend_proxy_reason.toLowerCase().includes("backend"), "secret-bearing API should explain backend proxy need");
assert.ok(library.skills.some((skill) => skill.source_review_status === "skill_md_detected_metadata_only" || skill.source_review_status === "skill_md_summary_parsed_untrusted"), "expected at least one SKILL.md-enriched skill record");
const verifiedApiRecords = library.apis.filter((api) => api.documentation_confidence === "official_docs_verified" || api.documentation_confidence === "official_docs_verified_from_source_url");
assert.ok(verifiedApiRecords.length >= 8, "expected curated verified API docs hardening records");
assert.ok(library.apis.filter((api) => !/unknown/i.test(api.rate_limit_confidence || "unknown")).length >= 3, "expected some rate-limit confidence records from official docs/fixtures");
const githubApi = library.apis.find((api) => api.id === "api:development:github");
assert.ok(githubApi, "expected GitHub API hardening record");
assert.ok(githubApi.rate_limit_notes.includes("5,000") && githubApi.rate_limit_notes.includes("60"), "GitHub rate limits should come from official docs fixture");
assert.equal(githubApi.frontend_safe, false, "OAuth/API-token API must not be frontend-safe");
const cheapSharkRecord = library.apis.find((api) => api.id === "api:games-comics:cheapshark");
assert.ok(cheapSharkRecord, "expected CheapShark API hardening record");
assert.equal(cheapSharkRecord.cors_confidence, "official_docs_cors_supported", "CheapShark CORS should be sourced from official docs fixture");
assert.ok(cheapSharkRecord.rate_limit_notes.includes("429"), "CheapShark rate-limit behavior should be sourced, not guessed unlimited");
const failedVerifiedApi = library.apis.find((api) => api.id === "api:finance:iex-cloud");
assert.ok(failedVerifiedApi?.freshness_status.includes("failed_to_verify"), "failed verification must stay explicit and not become current");
assert.equal(failedVerifiedApi.frontend_safe, false, "failed verification/secret API must not be frontend-safe");
const likelySkills = library.skills.filter((skill) => skill.agent_compatibility_confidence === "likely");
assert.ok(likelySkills.length >= 8, "expected selected important skills to have likely-but-not-verified compatibility notes");
assert.ok(likelySkills.every((skill) => skill.supported_clients_verified.length === 0), "likely compatibility must not be mislabeled as client-verified");
assert.ok(likelySkills.every((skill) => /not verified|manual review|SKILL\.md/i.test(skill.client_compatibility_notes)), "likely compatibility notes must preserve uncertainty/manual review");


assert.equal(usablePacks.schema_version, "vnem-usable-capability-packs/v0.1");
assert.ok(Array.isArray(usablePacks.apis), "usable API packs missing");
assert.ok(Array.isArray(usablePacks.skills), "usable skill packs missing");
assert.ok(usablePacks.apis.length >= 20, "expected at least 20 usable API packs");
assert.ok(usablePacks.skills.length >= 15, "expected at least 15 usable skill packs");
assert.notEqual(usablePacks.apis.length, library.apis.length, "raw discovered APIs must not be counted as usable packs");
assert.notEqual(usablePacks.skills.length, library.skills.length, "raw discovered skills must not be counted as usable packs");
const libraryApiIds = new Set(library.apis.map((api) => api.id));
const librarySkillIds = new Set(library.skills.map((skill) => skill.id));
for (const pack of usablePacks.apis) {
  assert.equal(pack.usable_status, "usable", `API pack ${pack.id} must be explicitly usable`);
  assert.ok(libraryApiIds.has(pack.id), `API pack ${pack.id} must map to a library API record`);
  assert.ok(pack.official_docs_url && pack.official_docs_url !== "unknown", `API pack ${pack.id} needs docs/source`);
  assert.ok(["none", "apiKey", "OAuth"].includes(pack.auth_type), `API pack ${pack.id} needs known auth mode`);
  assert.equal(typeof pack.frontend_safe, "boolean", `API pack ${pack.id} needs frontend decision`);
  assert.equal(typeof pack.backend_required, "boolean", `API pack ${pack.id} needs backend decision`);
  assert.equal(typeof pack.secret_risk, "boolean", `API pack ${pack.id} needs secret decision`);
  assert.ok(pack.cors_confidence, `API pack ${pack.id} needs CORS confidence`);
  assert.ok(pack.rate_limit_confidence, `API pack ${pack.id} needs rate-limit confidence`);
  assert.ok(Array.isArray(pack.verification_source_urls) && pack.verification_source_urls.length > 0, `API pack ${pack.id} needs verification source URLs`);
  assert.ok(Array.isArray(pack.safe_use_cases) && pack.safe_use_cases.length > 0, `API pack ${pack.id} needs safe use cases`);
  assert.ok(Array.isArray(pack.unsafe_use_cases) && pack.unsafe_use_cases.length > 0, `API pack ${pack.id} needs unsafe use cases`);
  assert.ok(Array.isArray(pack.recommended_task_triggers) && pack.recommended_task_triggers.length > 0, `API pack ${pack.id} needs task triggers`);
  assert.ok(Array.isArray(pack.integration_test_requirements) && pack.integration_test_requirements.length > 0, `API pack ${pack.id} needs integration tests`);
  assert.ok(Array.isArray(pack.error_handling_requirements) && pack.error_handling_requirements.length > 0, `API pack ${pack.id} needs error handling`);
  assert.ok(pack.mock_test_strategy, `API pack ${pack.id} needs mock strategy`);
  assert.ok(pack.tools_mcp_handoff?.required_tools?.length, `API pack ${pack.id} needs Tools handoff tools`);
  assert.ok(pack.tools_mcp_handoff?.permissions_needed?.length, `API pack ${pack.id} needs Tools handoff permissions`);
  assert.ok(pack.tools_mcp_handoff?.dry_run?.length, `API pack ${pack.id} needs dry run`);
  assert.ok(pack.tools_mcp_handoff?.rollback?.length, `API pack ${pack.id} needs rollback`);
  assert.ok(pack.tools_mcp_handoff?.logs_evidence?.length, `API pack ${pack.id} needs evidence`);
  assert.ok(Array.isArray(pack.must_not_claim) && pack.must_not_claim.some((claim) => /Core|called|live|verified/i.test(claim)), `API pack ${pack.id} needs must-not-claim limits`);
}
for (const pack of usablePacks.skills) {
  assert.equal(pack.usable_status, "usable", `skill pack ${pack.id} must be explicitly usable`);
  assert.ok(librarySkillIds.has(pack.id) || pack.id.startsWith("skill:vnem/core/"), `skill pack ${pack.id} must map to a library skill or Core-authored skill pack`);
  assert.ok(pack.source_review_status && pack.skill_content_confidence, `skill pack ${pack.id} needs review/confidence fields`);
  assert.equal(pack.core_can_apply_guidance, true, `skill pack ${pack.id} should be Core guidance-capable`);
  assert.equal(typeof pack.requires_install, "boolean", `skill pack ${pack.id} needs install boundary`);
  assert.equal(typeof pack.precision_required_for_install, "boolean", `skill pack ${pack.id} needs Precision boundary`);
  assert.ok(Array.isArray(pack.recommended_task_triggers) && pack.recommended_task_triggers.length > 0, `skill pack ${pack.id} needs triggers`);
  assert.ok(pack.safe_guidance_summary, `skill pack ${pack.id} needs safe guidance summary`);
  assert.ok(Array.isArray(pack.workflow_steps) && pack.workflow_steps.length > 0, `skill pack ${pack.id} needs workflow steps`);
  assert.ok(Array.isArray(pack.required_evidence) && pack.required_evidence.length > 0, `skill pack ${pack.id} needs evidence`);
  assert.ok(pack.tools_mcp_handoff?.required_tools?.length, `skill pack ${pack.id} needs Tools handoff tools`);
  assert.ok(pack.tools_mcp_handoff?.permissions_needed?.length, `skill pack ${pack.id} needs permissions`);
  assert.ok(Array.isArray(pack.must_not_claim) && pack.must_not_claim.some((claim) => /Core|installed|executed|proof/i.test(claim)), `skill pack ${pack.id} needs must-not-claim limits`);
  assert.ok(Array.isArray(pack.when_not_to_use) && pack.when_not_to_use.length > 0, `skill pack ${pack.id} needs when-not-to-use`);
}

console.log("VNEM Super MCP library data tests passed");
