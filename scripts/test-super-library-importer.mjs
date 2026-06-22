#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildApiCapabilities, buildSkillCapabilities } from "./import-super-library.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const fixtureDir = path.join(rootDir, "fixtures", "super-library");

const skillsHtml = await readFile(path.join(fixtureDir, "skills-sh-sample.html"), "utf8");
const tree = JSON.parse(await readFile(path.join(fixtureDir, "agent-skills-tree-sample.json"), "utf8"));
const publicApisMarkdown = await readFile(path.join(fixtureDir, "public-apis-sample.md"), "utf8");

const skills = buildSkillCapabilities(skillsHtml, tree);
const apis = buildApiCapabilities(publicApisMarkdown, 20);

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
assert.equal(reactSkill.core_can_apply_guidance, true, "Core MCP can apply guidance from metadata");
assert.equal(reactSkill.precision_required_for_install, true, "install/execution stays Precision/Tools-only");
assert.equal(typeof reactSkill.verified_instruction_summary, "string");
assert.equal(reactSkill.agent_compatibility_confidence, "unknown");

const openMeteo = apis.find((api) => /open-meteo/i.test(api.name));
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
  assert.equal(api.official_docs_url, "unknown", "official docs remain unknown unless verified");
  assert.ok(api.freshness_status.includes("unknown"), "freshness should remain unknown, not guessed current");
  assert.ok(api.integration_test_requirements.includes("error path"), "API should include integration test requirements");
}
assert.equal(openMeteo.frontend_safe, true, "no-auth HTTPS/CORS yes API can be a browser candidate after docs review");
assert.equal(secretWeather.secret_risk, true, "apiKey row should have secret risk");
assert.equal(secretWeather.frontend_safe, false, "secret-bearing API cannot be frontend-safe");
assert.equal(secretWeather.backend_required, true, "secret-bearing API should require backend proxy");
assert.ok(secretWeather.risk_flags.includes("api_key_required"));
assert.ok(secretWeather.risk_flags.includes("secret_risk"));
assert.ok(secretWeather.secret_handling_pattern.includes("Server-side"));

console.log("VNEM Super MCP fixture importer tests passed");
