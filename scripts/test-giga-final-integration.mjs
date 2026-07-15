#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scriptsForTier } from "./vnem/testing/suite-manifest.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readText = (relativePath) => readFile(path.join(root, relativePath), "utf8");
const readJson = async (relativePath) => JSON.parse(await readText(relativePath));

const [registry, browserProof, readme, landing, currentSystem, setup, dashboardBrief, dashboardComponent, dashboardApp] = await Promise.all([
  readJson(".vnem/runtime-tool-registry.json"),
  readJson(".vnem/giga-evolution/phase-24/browser-proof.json"),
  readText("README.md"),
  readText("landing/index.html"),
  readText("docs/current-system.md"),
  readText("docs/VNEM_SETUP.md"),
  readText("dashboard/src/lib/vnemSystemBrief.js"),
  readText("dashboard/src/components/VnemSystemBrief.jsx"),
  readText("dashboard/src/App.jsx")
]);

const counts = Object.fromEntries(Object.entries(registry.servers).map(([name, server]) => [name, server.tool_count]));
assert.equal(registry.total_tools, 323);
assert.equal(counts.core, 69);
assert.equal(counts.tools, 247);
assert.equal(counts.precision, 7);
assert.equal(Object.values(counts).reduce((total, count) => total + count, 0), registry.total_tools);
assert.ok(Object.values(registry.servers).every((server) => server.validation.valid));
assert.ok(registry.servers.core.tools.some((tool) => tool.name === "vnem_entrypoint"));
assert.ok(registry.servers.core.tools.some((tool) => tool.name === "vnem_usage_self_check"));
assert.ok(registry.servers.tools.tools.some((tool) => tool.name === "vnem_tools_entrypoint"));
assert.ok(registry.servers.precision.tools.filter((tool) => tool.category === "precision_compatibility").every((tool) => tool.deprecation_state.deprecated));

assert.match(readme, /two primary MCP servers/);
assert.match(readme, /Precision.+compatibility shim/i);
assert.match(readme, /node scripts\/vnem-cli\.mjs setup/);
assert.match(readme, /node scripts\/vnem-cli\.mjs safety --status --json/);

assert.match(landing, /Core decides\. Tools proves\./);
assert.match(landing, /seven-tool Precision.+compatibility shim/i);
assert.match(landing, /Profiles report what is proven\./);
assert.match(landing, /reproducible local samples, not universal hardware guarantees/);
assert.doesNotMatch(landing, /Use vnem as a read-only tool server/);

assert.match(currentSystem, /\| VNEM Tools \| Implemented with bounded providers \|/);
assert.match(currentSystem, /\| Precision MCP \| Compatibility \|/);
assert.match(setup, /managed-instruction syntax/);
assert.match(setup, /vnem_usage_self_check/);
assert.match(setup, /uses no hidden telemetry/);

assert.match(dashboardBrief, /key: "tools"/);
assert.match(dashboardBrief, /key: "precision"/);
assert.match(dashboardBrief, /generated profile as proof that the client reloaded or used VNEM/);
assert.match(dashboardComponent, /VNEM Core, Tools, App, and AI pipeline/);
assert.match(dashboardApp, /<VnemSystemBrief telemetry=\{telemetry\} execution=\{pipelineExecution\} summary=\{summary\} connector=\{connector\} \/>/);

assert.equal(browserProof.status, "pass_with_expected_hard_privacy_block");
assert.equal(browserProof.desktop.horizontal_overflow, false);
assert.equal(browserProof.mobile.horizontal_overflow, false);
assert.match(browserProof.desktop.sha256, /^[a-f0-9]{64}$/);
assert.match(browserProof.mobile.sha256, /^[a-f0-9]{64}$/);
assert.equal(browserProof.shared_results.console_errors, 0);
assert.equal(browserProof.shared_results.bad_responses, 0);
assert.equal(browserProof.expected_hard_privacy_block.endpoint, "/api/builder/session");
assert.equal(browserProof.expected_hard_privacy_block.policy_weakened, false);

const profileClients = ["codex", "claude", "antigravity", "hermes", "generic"];
for (const client of profileClients) {
  const profilePath = client === "codex" ? `.vnem/install-adoption/${client}/config-snippet.toml` : `.vnem/install-adoption/${client}/mcp.json`;
  assert.ok((await readText(profilePath)).length > 0, `${client} generated profile is missing`);
}

const ciChecks = scriptsForTier("ci");
assert.ok(ciChecks.includes("test:giga-final-integration"));

const proof = {
  schema_version: "1.0.0",
  status: "pass",
  architecture: {
    primary_mcp_servers: ["vnem", "vnem-tools"],
    core_read_only: true,
    tools_permission_aware: true,
    precision_role: "seven_tool_compatibility_shim"
  },
  registry: {
    total_tools: registry.total_tools,
    core_tools: counts.core,
    tools_tools: counts.tools,
    precision_tools: counts.precision,
    validation_passed: Object.values(registry.servers).every((server) => server.validation.valid)
  },
  integration: {
    generated_client_profiles: profileClients,
    managed_setup_documented: true,
    usage_self_check_documented: true,
    dashboard_core_tools_precision_truth: true,
    browser_local_proof: browserProof,
    website_setup_safety_profiles_and_benchmark_truth: true,
    ci_runner_check_count: ciChecks.length
  },
  anti_overclaim: {
    profile_does_not_prove_client_install_reload_or_use: true,
    provider_actions_require_configuration_and_approval: true,
    benchmark_is_local_not_universal: true,
    hidden_telemetry_claimed: false
  },
  remaining_unproven: [
    "current Codex task entrypoint visibility and autonomous VNEM selection",
    "installed Claude or Antigravity client execution",
    "Hermes global import, reload, and agent use",
    "live provider/account mutations outside bounded fixture proof"
  ]
};

const outputArg = process.argv.find((arg) => arg.startsWith("--output="));
if (outputArg) {
  const outputPath = path.resolve(root, outputArg.slice("--output=".length));
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(proof, null, 2)}\n`, "utf8");
}

console.log(`VNEM final integration surfaces passed: ${registry.total_tools} registry tools; ${ciChecks.length} CI checks`);
