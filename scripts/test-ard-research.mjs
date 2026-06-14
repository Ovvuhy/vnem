#!/usr/bin/env node
import assert from "node:assert/strict";
import { runResearch } from "./ard-pipeline.mjs";

const research = await runResearch({ rootDir: process.cwd(), runId: "ard-test-research", now: () => "2026-06-07T00:00:00.000Z", write: false });
assert.equal(research.status, "completed");
assert.equal(research.schema, "vnem.ardResearch.v2");
assert.equal(research.mode, "repo/local multi-lane research");
assert.ok(research.candidatesFound >= 7, "Research AI v2 should produce multi-lane candidates");
for (const lane of ["repo-self", "backlog-roadmap", "run-history-failure", "dashboard-product-weakness", "test-validation-gap", "docs-drift", "changes-by-ard-opportunity"]) {
  assert.ok(research.sourceLanes.some((item) => item.key === lane), `${lane} lane should be present`);
}
assert.ok(research.candidates.every((candidate) => candidate.candidateId && candidate.sourceLane && candidate.sourceKey && candidate.productImpact && Array.isArray(candidate.evidence)));
assert.ok(research.candidates.some((candidate) => candidate.dangerous === true), "dangerous local canary must remain visible for Protection AI");
const categories = new Set(research.candidates.map((candidate) => candidate.category));
assert.ok(categories.size >= 8, "Research AI v2 should produce diverse categories");
assert.ok(categories.has("ai-mcp"), "MCP category should be represented");
assert.ok(categories.has("ai-safety-security"), "safety/security category should be represented");
assert.ok(categories.has("repo-automation"), "repo automation category should be represented");
assert.ok(categories.has("roblox-luau"), "Roblox/Luau should remain one category, not the only category");
assert.ok(research.candidates.filter((candidate) => candidate.category === "roblox-luau").length < research.candidates.length / 2, "Roblox/Luau must not dominate research");
assert.ok(research.candidates.some((candidate) => candidate.external && candidate.allowedOutput === "review-artifact-only"), "external GitHub repos should be auto-triaged to review artifacts");
assert.ok(research.ranking.branchReady >= 1, "Research AI v2 should find at least one branch-ready repo-owned candidate");
console.log("ARD research tests passed");
