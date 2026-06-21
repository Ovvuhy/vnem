#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import Ajv2020 from "ajv/dist/2020.js";

const library = JSON.parse(await readFile("capabilities/super-library.json", "utf8"));
const librarySchema = JSON.parse(await readFile("schemas/super-library.schema.json", "utf8"));
const agentProfiles = JSON.parse(await readFile("capabilities/agent-profiles.json", "utf8"));
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

console.log("VNEM Super MCP library data tests passed");
