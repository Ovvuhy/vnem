#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyApiVerificationRecords, applySkillCompatibilityProfiles, buildApiCapabilities, buildSkillCapabilities } from "./import-super-library.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const fixtureDir = path.join(rootDir, "fixtures", "super-library");

const skillsHtml = await readFile(path.join(fixtureDir, "skills-sh-sample.html"), "utf8");
const tree = JSON.parse(await readFile(path.join(fixtureDir, "agent-skills-tree-sample.json"), "utf8"));
const skillMarkdownSample = await readFile(path.join(fixtureDir, "skill-md-sample.md"), "utf8");
const publicApisMarkdown = await readFile(path.join(fixtureDir, "public-apis-sample.md"), "utf8");
const apiVerificationFixture = JSON.parse(await readFile(path.join(fixtureDir, "api-verification-sample.json"), "utf8"));
tree.skill_markdown_summaries = {
  ...(tree.skill_markdown_summaries || {}),
  "react-best-practices": skillMarkdownSample
};

const skills = applySkillCompatibilityProfiles(buildSkillCapabilities(skillsHtml, tree));
const apis = applyApiVerificationRecords(buildApiCapabilities(publicApisMarkdown, 20), apiVerificationFixture.records, apiVerificationFixture.generated_at);

assert.ok(skills.length >= 1, "fixture import should produce at least one skill record");
assert.ok(apis.length >= 1, "fixture import should produce at least one API record");

const reactSkill = skills.find((skill) => /react-best-practices/i.test(skill.id));
assert.ok(reactSkill, "fixture should import react skill");
assert.equal(reactSkill.source, "vercel-labs/agent-skills");
assert.ok(reactSkill.source_url.includes("skills.sh"), "skill should preserve source URL");
assert.ok(reactSkill.repository_url.includes("github.com"), "skill should preserve repository provenance");
assert.ok(reactSkill.task_types.includes("frontend_ui"), "skill should normalize task types");
assert.ok(reactSkill.risk_flags.includes("prompt_injection_surface"), "skill should carry risk flags");
assert.equal(reactSkill.manual_review_required, true, "skill should require manual review");
assert.equal(reactSkill.review_status, "metadata_only", "fixture must not falsely mark skills reviewed/safe");
assert.equal(reactSkill.source_review_status, "skill_md_summary_parsed_untrusted", "SKILL.md-derived summary should be marked parsed but untrusted");
assert.equal(reactSkill.skill_content_confidence, "medium", "parsed fixture summary should raise content confidence without becoming trusted");
assert.ok(reactSkill.verified_instruction_summary.includes("React") && reactSkill.verified_instruction_summary.includes("visual evidence"), "fixture summary should improve skill guidance");
assert.ok(reactSkill.required_evidence.some((item) => /visual|accessibility|test/i.test(item)), "skill should include required evidence from parsed summary/domain");
assert.equal(reactSkill.core_can_apply_guidance, true, "Core MCP can apply guidance from metadata");
assert.equal(reactSkill.precision_required_for_install, true, "install/execution stays Precision/Tools-only");
assert.equal(typeof reactSkill.verified_instruction_summary, "string");
assert.equal(reactSkill.agent_compatibility_confidence, "low");

const openMeteo = apis.find((api) => /open-meteo/i.test(api.name));
const abuseIpDb = apis.find((api) => api.id === "api:anti-malware:abuseipdb");
const cheapShark = apis.find((api) => api.id === "api:games-comics:cheapshark");
const failedFinance = apis.find((api) => api.id === "api:finance:iex-cloud");
const secretWeather = apis.find((api) => /secret-weather/i.test(api.id));
assert.ok(openMeteo, "fixture should import public API row");
assert.ok(secretWeather, "fixture should import API-key row");
for (const api of [openMeteo, secretWeather]) {
  assert.equal(api.source, "public-apis/public-apis");
  assert.ok(api.source_url, "API should preserve source URL");
  assert.ok(api.imported_from.includes("public-apis"), "API should preserve imported_from provenance");
  assert.ok(["none", "apiKey", "OAuth", "unknown"].includes(api.auth_type), "API auth normalized");
  assert.ok(["yes", "no", "unknown"].includes(api.https), "API HTTPS normalized");
  assert.ok(["yes", "no", "unknown"].includes(api.cors), "API CORS normalized");
  assert.ok(api.risk_flags.includes("requires_manual_review"), "API should carry manual review risk flag");
  assert.equal(api.review_status, "metadata_only", "fixture must not falsely mark APIs reviewed/safe");
  assert.equal(api.manual_review_required, true, "API should require manual review");
  assert.ok(api.task_types.includes("api_integration"), "API should normalize task types");
  assert.ok(api.official_docs_url === "unknown" || api.official_docs_url === api.source_url || apiVerificationFixture.records.some((record) => record.id === api.id && record.official_docs_url === api.official_docs_url), "official docs are only set from docs-like source URLs or verification fixture records");
  assert.ok(api.freshness_status.includes("unknown") || apiVerificationFixture.records.some((record) => record.id === api.id && record.freshness_status === api.freshness_status), "freshness should remain unknown unless supplied by verification fixture");
  assert.ok(api.integration_test_requirements.includes("error path"), "API should include integration test requirements");
  assert.notEqual(api.rate_limit_notes, "unlimited", "fixture importer must not invent unlimited rate limits");
  assert.ok(Array.isArray(api.verification_source_urls), "API should include verification source URL array");
  assert.ok(["source_url_is_docs_like", "official_docs_verified", "official_docs_verified_from_source_url", "verification_failed_or_provider_status_unclear", "unknown"].includes(api.documentation_confidence), "documentation confidence should be explicit");
}
assert.equal(openMeteo.official_docs_url, "https://open-meteo.com/en/docs", "docs-like source URL can populate official_docs_url");
assert.ok(openMeteo.verification_source_urls.includes("https://open-meteo.com/en/docs"), "Open-Meteo should preserve docs verification source");
assert.equal(openMeteo.documentation_confidence, "official_docs_verified", "fixture verification should upgrade docs confidence only from verification fixture");
assert.equal(openMeteo.rate_limit_confidence, "official_docs_numeric_limit_verified", "Open-Meteo fixture should carry sourced rate-limit confidence");
assert.ok(openMeteo.rate_limit_notes.includes("10,000"), "Open-Meteo fixture should use sourced numeric non-commercial limit");
assert.equal(openMeteo.frontend_safe, true, "no-auth HTTPS/CORS yes API can be a browser candidate after docs review");
assert.equal(secretWeather.cors, "unknown", "CORS unknown should remain unknown");
assert.equal(secretWeather.secret_risk, true, "apiKey row should have secret risk");
assert.equal(secretWeather.frontend_safe, false, "secret-bearing API cannot be frontend-safe");
assert.equal(secretWeather.backend_required, true, "secret-bearing API should require backend proxy");
assert.ok(secretWeather.risk_flags.includes("api_key_required"));
assert.ok(secretWeather.risk_flags.includes("secret_risk"));
assert.ok(secretWeather.secret_handling_pattern.includes("Server-side"));
assert.ok(abuseIpDb && cheapShark && failedFinance, "fixture should include verified, frontend-candidate, and failed-verification API cases");
assert.equal(abuseIpDb.frontend_safe, false, "API-key security API must stay backend-only after verification");
assert.equal(abuseIpDb.backend_required, true, "API-key security API must require backend after verification");
assert.equal(abuseIpDb.documentation_confidence, "official_docs_verified");
assert.equal(abuseIpDb.rate_limit_confidence, "unknown_exact_quota", "exact quota must remain unknown when fixture lacks numeric proof");
assert.equal(cheapShark.frontend_safe, true, "verified no-auth CORS-supported API may remain a frontend candidate");
assert.equal(cheapShark.rate_limit_confidence, "official_docs_limit_behavior_verified_no_numeric_quota");
assert.ok(cheapShark.rate_limit_notes.includes("429") && cheapShark.rate_limit_notes.includes("Retry-After"), "CheapShark fixture should preserve sourced 429/Retry-After behavior");
assert.equal(failedFinance.documentation_confidence, "verification_failed_or_provider_status_unclear", "failed docs verification should be explicit");
assert.ok(failedFinance.freshness_status.includes("failed_to_verify"), "failed verification must not become current/fresh");
assert.equal(failedFinance.frontend_safe, false, "failed verification must not be frontend-safe");

console.log("VNEM Super MCP fixture importer tests passed");
