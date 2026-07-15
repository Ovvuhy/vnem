#!/usr/bin/env node
import assert from "node:assert/strict";
import { attachToolRegistry } from "./vnem/registry/tool-registry.mjs";
import { inspectRuntimeRegistries } from "./vnem/testing/runtime-readiness.mjs";

const readiness = await inspectRuntimeRegistries();
assert.equal(readiness.ready, true);
assert.deepEqual(Object.keys(readiness.servers), ["core", "tools", "precision"]);
for (const item of Object.values(readiness.servers)) {
  assert.equal(item.registry_valid, true);
  assert.equal(item.counts_match, true);
  assert.equal(item.fields_complete, true);
  assert.deepEqual(item.validation_errors, []);
}
assert.equal(readiness.servers.core.validation_warnings.length, 0);
assert.equal(readiness.servers.precision.validation_warnings.length, 0);
assert.deepEqual(readiness.servers.tools.validation_warnings, [], "every public Tools entry must have an exact behavior-test reference");

const fake = { handlers: new Map(), registerTool(name, definition, handler) { this.handlers.set(name, handler); } };
const registry = attachToolRegistry(fake, { serverName: "test", version: "1", implementationModule: "test" });
fake.registerTool("vnem_tools_test_write", {
  title: "Test write",
  description: "Exercise runtime error redaction.",
  inputSchema: {},
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false }
}, async () => { throw new Error("authorization Bearer top-secret-value and stack must stay hidden"); });
const failure = await fake.handlers.get("vnem_tools_test_write")({});
assert.equal(failure.isError, true);
assert.equal(failure.structuredContent.error.code, "VNEM_UNEXPECTED_ERROR");
assert.equal(failure.structuredContent.error.category, "unexpected_runtime");
assert.equal(failure.structuredContent.error.rollback_state, "unknown_check_evidence");
assert.doesNotMatch(JSON.stringify(failure), /top-secret-value|stack must stay hidden/);
assert.equal(registry.validate().valid, true);

for (const name of ["vnem_tools_api_adapter_execute", "vnem_tools_api_adapter_compensate"]) {
  fake.registerTool(name, {
    title: `Test ${name}`,
    description: "Exercise conservative network-mutation registry inference.",
    inputSchema: {},
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }
  }, async () => ({ content: [{ type: "text", text: "ok" }] }));
  const entry = registry.manifest().find((item) => item.name === name);
  assert.equal(entry.side_effect_class, "network_mutation", `${name} must never be documented as local or read-only`);
  assert.deepEqual(entry.permission_requirements, ["approved_network_mutation", "scoped_credential_reference"]);
  assert.equal(entry.evidence_behavior, "required_redacted_record");
  assert.equal(entry.rollback_behavior.mode, "required_or_explicitly_not_available");
}

fake.registerTool("vnem_tools_legacy_error", {
  title: "Legacy error",
  description: "Exercise backwards-compatible structured error enrichment.",
  inputSchema: {},
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
}, async () => ({ isError: true, content: [{ type: "text", text: "approval required" }], structuredContent: { code: "approval_required" } }));
const legacy = await fake.handlers.get("vnem_tools_legacy_error")({});
assert.equal(legacy.structuredContent.code, "approval_required");
assert.equal(legacy.structuredContent.runtime_error.code, "approval_required");
assert.equal(legacy.structuredContent.runtime_error.blocked_by_permission, true);

fake.registerTool("vnem_tools_invalid_output", {
  title: "Invalid output",
  description: "Exercise output contract validation.",
  inputSchema: {},
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
}, async () => ({ nope: true }));
const invalid = await fake.handlers.get("vnem_tools_invalid_output")({});
assert.equal(invalid.structuredContent.error.code, "VNEM_INVALID_TOOL_RESULT");

console.log("VNEM modular runtime registry tests passed");
