#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const fixtureRoot = path.join(rootDir, ".tmp", `game-domain-fixture-${process.pid}`);
const benchmarkArg = process.argv.find((arg) => arg.startsWith("--benchmark-output="));
const benchmarkOutput = benchmarkArg ? path.resolve(rootDir, benchmarkArg.slice("--benchmark-output=".length)) : null;
const timings = [];
const startedAt = performance.now();

await createFixture(fixtureRoot);

const client = new Client({ name: "vnem-tools-giga-game-domain-test", version: "1.0.1" }, { capabilities: {} });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(scriptDir, "vnem-tools-mcp-server.mjs")],
  cwd: rootDir,
  env: {
    ...process.env,
    VNEM_TOOLS_ALLOWED_ROOTS: fixtureRoot,
    VNEM_TOOLS_EVIDENCE_ROOT: path.join(fixtureRoot, ".vnem", "evidence"),
    VNEM_TOOLS_PERMISSION_PROFILE: "approved-writes"
  }
});

try {
  await client.connect(transport);
  const listed = await client.listTools();
  const names = new Set(listed.tools.map((tool) => tool.name));
  const required = [
    "vnem_tools_game_adapter_catalog",
    "vnem_tools_game_project_inspect",
    "vnem_tools_game_config_audit",
    "vnem_tools_mod_compatibility_analyze",
    "vnem_tools_mod_profile_compare",
    "vnem_tools_game_project_validate",
    "vnem_tools_mod_backup_create",
    "vnem_tools_mod_backup_restore",
    "vnem_tools_roblox_project_inspect",
    "vnem_tools_luau_symbol_map"
  ];
  for (const name of required) assert.ok(names.has(name), `missing Phase 13 tool ${name}`);

  const catalog = (await call("vnem_tools_game_adapter_catalog", { root: fixtureRoot })).structuredContent.game_adapter_catalog;
  assert.equal(catalog.adapters.length, 3);
  assert.ok(catalog.detected_adapter_ids.includes("roblox-rojo-luau"));
  assert.ok(catalog.detected_adapter_ids.includes("guarded-binary-game-format"));
  for (const field of catalog.adapter_contract_fields) assert.ok(catalog.adapters.every((adapter) => Object.hasOwn(adapter, field)), `adapter field missing: ${field}`);
  assert.ok(catalog.adapters.find((adapter) => adapter.id === "guarded-binary-game-format").unsupported_operations.includes("generic text patching"));

  const inspection = (await call("vnem_tools_game_project_inspect", { root: fixtureRoot, max_files: 500 })).structuredContent.game_project_inspection;
  assert.equal(inspection.operation_result, "reported");
  assert.ok(inspection.inventory.files_seen >= 15);
  assert.ok(inspection.inventory.guarded_binary_files.some((file) => file.path === "binary/regulation.bin"));
  assert.ok(inspection.hashing.duplicate_groups.some((group) => group.paths.includes("assets/icon-a.png") && group.paths.includes("assets/icon-b.png")));
  assert.equal(inspection.generated_output_isolation.source_tree_mutation, false);

  const config = (await call("vnem_tools_game_config_audit", {
    root: fixtureRoot,
    paths: ["config/settings.yaml", "config/risky.xml", "src/server/Main.server.luau", "binary/regulation.bin"]
  })).structuredContent.game_config_audit;
  assert.equal(config.files.find((file) => file.path === "config/settings.yaml").parse_status, "valid");
  assert.equal(config.files.find((file) => file.path === "config/risky.xml").parse_status, "blocked");
  assert.equal(config.files.find((file) => file.path === "binary/regulation.bin").parse_status, "unsupported");
  assert.ok(config.files.find((file) => file.path.endsWith("Main.server.luau")).findings.some((finding) => finding.code === "numeric_asset_require"));
  assert.equal(config.summary.secret_values_returned, false);

  const compatibility = (await call("vnem_tools_mod_compatibility_analyze", {
    root: fixtureRoot,
    manifest_paths: ["mods/manifest.json"],
    load_order_path: "loadorder.txt"
  })).structuredContent.mod_compatibility_analysis;
  assert.equal(compatibility.mods.length, 3);
  assert.ok(compatibility.issues.some((item) => item.code === "declared_conflict"));
  assert.ok(compatibility.issues.some((item) => item.code === "dependency_load_order_violation"));
  assert.ok(compatibility.issues.some((item) => item.code === "dependency_cycle"));
  assert.equal(compatibility.summary.compatible, false);

  const profiles = (await call("vnem_tools_mod_profile_compare", { root: fixtureRoot, left_path: "profiles/base.json", right_path: "profiles/experimental.json" })).structuredContent.mod_profile_comparison;
  assert.ok(profiles.added.some((mod) => mod.id === "bad"));
  assert.ok(profiles.version_changed.some((item) => item.id === "addon"));
  assert.ok(profiles.enabled_changed.some((item) => item.id === "addon"));
  assert.ok(profiles.order_changed.length > 0);

  const roblox = (await call("vnem_tools_roblox_project_inspect", { root: fixtureRoot })).structuredContent.roblox_project_inspection;
  assert.equal(roblox.project_files.length, 1);
  assert.equal(roblox.missing_mapped_paths.length, 0);
  assert.equal(roblox.escaping_mapped_paths.length, 0);
  assert.ok(roblox.source_context_counts.server >= 1);
  assert.ok(roblox.source_context_counts.client >= 1);
  assert.ok(roblox.remote_trust_boundaries.length >= 2);
  assert.ok(roblox.static_findings.some((finding) => finding.code === "numeric_asset_require"));

  const luau = (await call("vnem_tools_luau_symbol_map", { root: fixtureRoot, query: "Remote" })).structuredContent.luau_symbol_map;
  assert.ok(luau.files_scanned >= 3);
  assert.ok(luau.totals.remote_boundaries >= 2);
  assert.ok(luau.source_map.some((file) => file.symbols.some((symbol) => symbol.name === "validatePayload")));

  const validation = (await call("vnem_tools_game_project_validate", { root: fixtureRoot })).structuredContent.game_project_validation;
  assert.ok(["validation_warnings", "validation_passed"].includes(validation.operation_result));
  assert.equal(validation.command_execution.performed, false);
  assert.ok(validation.validation_commands.some((command) => command.purpose === "isolated_rojo_build" && command.arguments.includes(".vnem/game-domain/output/project.rbxlx")));
  assert.ok(validation.validation_commands.some((command) => command.purpose === "test"));
  assert.ok(validation.warnings.some((warning) => warning.code === "guarded_binary"));
  assert.ok(validation.must_not_claim.some((claim) => /launched/.test(claim)));

  const projectCheckPlan = (await call("vnem_tools_project_command_run", { root: fixtureRoot, mode: "project_script", script: "test" })).structuredContent.project_command;
  assert.equal(projectCheckPlan.review.project_script.policy.allowed, true);
  const projectCheck = (await call("vnem_tools_project_command_run", {
    root: fixtureRoot,
    mode: "project_script",
    script: "test",
    review_id: projectCheckPlan.review.review_id,
    dry_run: false,
    approved: true,
    approval_note: "Phase 13 fixture project test proof"
  })).structuredContent.project_command;
  assert.equal(projectCheck.execution.ok, true);
  assert.equal(projectCheck.execution.exit_code, 0);

  const backupPreview = (await call("vnem_tools_mod_backup_create", { root: fixtureRoot, paths: ["mods/manifest.json", "config/settings.yaml"] })).structuredContent.mod_backup;
  assert.equal(backupPreview.operation_result, "backup_planned");
  assert.equal(backupPreview.executed, false);
  assert.equal(backupPreview.file_count, 2);

  const backup = (await call("vnem_tools_mod_backup_create", {
    root: fixtureRoot,
    paths: ["mods/manifest.json", "config/settings.yaml"],
    dry_run: false,
    approved: true,
    approval_note: "Phase 13 fixture backup proof"
  })).structuredContent.mod_backup;
  assert.equal(backup.operation_result, "backup_created");
  assert.equal(backup.executed, true);
  const backupManifest = JSON.parse(await readFile(path.join(fixtureRoot, backup.manifest_path), "utf8"));
  assert.equal(backupManifest.entries.length, 2);

  const manifestPath = path.join(fixtureRoot, "mods", "manifest.json");
  const originalManifest = await readFile(manifestPath, "utf8");
  await writeFile(manifestPath, `${originalManifest.trim()}\n\n`, "utf8");
  const restorePreview = (await call("vnem_tools_mod_backup_restore", { root: fixtureRoot, manifest_path: backup.manifest_path })).structuredContent.mod_backup_restore;
  assert.equal(restorePreview.operation_result, "restore_planned");
  const expectedCurrent = Object.fromEntries(restorePreview.targets.filter((target) => target.current_exists).map((target) => [target.path, target.current_sha256]));

  const badHash = await literalCall("vnem_tools_mod_backup_restore", {
    root: fixtureRoot,
    manifest_path: backup.manifest_path,
    expected_current_sha256: { ...expectedCurrent, "mods/manifest.json": "0".repeat(64) },
    dry_run: false,
    approved: true,
    approval_note: "Phase 13 negative restore precondition proof"
  });
  assert.equal(badHash.isError, true);
  assert.equal(badHash.structuredContent.code, "game_restore_hash_precondition_failed");

  const restore = (await call("vnem_tools_mod_backup_restore", {
    root: fixtureRoot,
    manifest_path: backup.manifest_path,
    expected_current_sha256: expectedCurrent,
    dry_run: false,
    approved: true,
    approval_note: "Phase 13 fixture restore proof"
  })).structuredContent.mod_backup_restore;
  assert.equal(restore.operation_result, "restored");
  assert.equal(restore.rollback_available, true);
  assert.equal(await readFile(manifestPath, "utf8"), originalManifest);
  const safetyManifestPath = path.join(restore.pre_restore_safety_package, "manifest.json").replace(/\\/g, "/");
  const safetyPreview = (await call("vnem_tools_mod_backup_restore", { root: fixtureRoot, manifest_path: safetyManifestPath })).structuredContent.mod_backup_restore;
  assert.equal(safetyPreview.operation_result, "restore_planned");
  assert.equal(safetyPreview.targets.find((target) => target.path === "mods/manifest.json").backup_sha256, expectedCurrent["mods/manifest.json"]);

  const secretBackup = await literalCall("vnem_tools_mod_backup_create", { root: fixtureRoot, paths: [".env"] });
  assert.equal(secretBackup.isError, true);
  assert.equal(secretBackup.structuredContent.code, "game_domain_path_blocked");

  const outsidePath = await literalCall("vnem_tools_game_config_audit", { root: fixtureRoot, paths: ["../package.json"] });
  assert.equal(outsidePath.isError, true);
  assert.equal(outsidePath.structuredContent.code, "game_domain_path_blocked");

  if (benchmarkOutput) await writeBenchmark(benchmarkOutput, { catalog, inspection, config, compatibility, profiles, roblox, luau, validation, projectCheck, backup, restore, safetyPreview });
  console.log("vnem Tools GIGA game/modding/Roblox MCP tests passed");
} finally {
  await client.close().catch(() => {});
}

async function call(name, args) {
  const started = performance.now();
  const result = await literalCall(name, args);
  timings.push({ tool: name, duration_ms: Number((performance.now() - started).toFixed(2)), status: result.isError ? "error" : "ok" });
  if (result.isError) throw new Error(`${name} failed: ${JSON.stringify(result.structuredContent || result.content)}`);
  return result;
}

async function literalCall(name, args) {
  if (name === "vnem_tools_game_adapter_catalog") return await client.callTool({ name: "vnem_tools_game_adapter_catalog", arguments: args });
  if (name === "vnem_tools_game_project_inspect") return await client.callTool({ name: "vnem_tools_game_project_inspect", arguments: args });
  if (name === "vnem_tools_game_config_audit") return await client.callTool({ name: "vnem_tools_game_config_audit", arguments: args });
  if (name === "vnem_tools_mod_compatibility_analyze") return await client.callTool({ name: "vnem_tools_mod_compatibility_analyze", arguments: args });
  if (name === "vnem_tools_mod_profile_compare") return await client.callTool({ name: "vnem_tools_mod_profile_compare", arguments: args });
  if (name === "vnem_tools_game_project_validate") return await client.callTool({ name: "vnem_tools_game_project_validate", arguments: args });
  if (name === "vnem_tools_mod_backup_create") return await client.callTool({ name: "vnem_tools_mod_backup_create", arguments: args });
  if (name === "vnem_tools_mod_backup_restore") return await client.callTool({ name: "vnem_tools_mod_backup_restore", arguments: args });
  if (name === "vnem_tools_roblox_project_inspect") return await client.callTool({ name: "vnem_tools_roblox_project_inspect", arguments: args });
  if (name === "vnem_tools_luau_symbol_map") return await client.callTool({ name: "vnem_tools_luau_symbol_map", arguments: args });
  if (name === "vnem_tools_project_command_run") return await client.callTool({ name: "vnem_tools_project_command_run", arguments: args });
  throw new Error(`Unexpected game-domain tool ${name}`);
}

async function createFixture(root) {
  const files = {
    "package.json": JSON.stringify({ name: "phase-13-game-fixture", private: true, scripts: { test: "node verify.mjs", build: "node build.mjs", validate: "node verify.mjs" } }, null, 2) + "\n",
    "default.project.json": JSON.stringify({ name: "Phase13Fixture", tree: { $className: "DataModel", ReplicatedStorage: { $path: "src/shared" }, ServerScriptService: { $path: "src/server" }, StarterPlayer: { StarterPlayerScripts: { $path: "src/client" } } } }, null, 2) + "\n",
    ".luaurc": JSON.stringify({ languageMode: "strict", lint: { LocalUnused: true } }, null, 2) + "\n",
    "selene.toml": "std = \"roblox\"\n",
    "stylua.toml": "column_width = 100\n",
    "config/settings.yaml": "game: FixtureGame\ngame_version: '1.2.3'\nplatform: Windows\nloader: FixtureLoader\nasset: assets/icon-a.png\n",
    "config/risky.xml": "<?xml version=\"1.0\"?><!DOCTYPE config [<!ENTITY source SYSTEM \"file:///tmp/no\">]><config><name>fixture</name></config>\n",
    "mods/manifest.json": JSON.stringify({ mods: [
      { id: "core", version: "1.0.0", dependencies: { addon: "1.0.0" }, conflicts: ["bad"] },
      { id: "addon", version: "1.0.0", dependencies: { core: "1.0.0" } },
      { id: "bad", version: "2.0.0" }
    ] }, null, 2) + "\n",
    "loadorder.txt": "core\naddon\nbad\n",
    "profiles/base.json": JSON.stringify({ mods: [{ id: "core", version: "1.0.0", enabled: true }, { id: "addon", version: "1.0.0", enabled: true }], load_order: ["core", "addon"] }, null, 2) + "\n",
    "profiles/experimental.json": JSON.stringify({ mods: [{ id: "addon", version: "1.1.0", enabled: false }, { id: "core", version: "1.0.0", enabled: true }, { id: "bad", version: "2.0.0", enabled: true }], load_order: ["addon", "core", "bad"] }, null, 2) + "\n",
    "src/shared/Util.luau": "local Util = {}\nfunction Util.validatePayload(value)\n  return typeof(value) == \"string\"\nend\nreturn Util\n",
    "src/server/Main.server.luau": "local ReplicatedStorage = game:GetService(\"ReplicatedStorage\")\nlocal Remote = ReplicatedStorage:WaitForChild(\"FixtureRemote\")\nlocal External = require(123456)\nlocal function validatePayload(value)\n  return typeof(value) == \"string\"\nend\nRemote.OnServerEvent:Connect(function(player, payload)\n  if not validatePayload(payload) then return end\n  print(player, payload, External)\nend)\n",
    "src/client/Main.client.luau": "local ReplicatedStorage = game:GetService(\"ReplicatedStorage\")\nlocal Remote = ReplicatedStorage:WaitForChild(\"FixtureRemote\")\nRemote:FireServer(\"hello\")\n",
    "src/shared/Util.spec.luau": "return function()\n  describe(\"Util\", function() end)\nend\n",
    "assets/icon-a.png": "fixture-asset-bytes\n",
    "assets/icon-b.png": "fixture-asset-bytes\n",
    "verify.mjs": "console.log('fixture verified');\n",
    "build.mjs": "console.log('fixture built');\n"
  };
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(root, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content, "utf8");
  }
  const binary = path.join(root, "binary", "regulation.bin");
  await mkdir(path.dirname(binary), { recursive: true });
  await writeFile(binary, Buffer.from([0, 1, 2, 3, 4, 5]));
}

async function writeBenchmark(outputPath, proof) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  const benchmark = {
    schema_version: 1,
    phase: 13,
    benchmark_type: "actual_stdio_mcp_game_modding_roblox_execution",
    generated_at: new Date().toISOString(),
    total_duration_ms: Number((performance.now() - startedAt).toFixed(2)),
    mcp_transport: "stdio",
    tools_exercised: [...new Set(timings.map((item) => item.tool))],
    tool_calls: timings,
    fixture_sha256: createHash("sha256").update(fixtureRoot).digest("hex"),
    results: {
      adapter_contract: { adapters: proof.catalog.adapters.length, detected: proof.catalog.detected_adapter_ids, complete_fields: proof.catalog.adapter_contract_fields.length },
      inventory: { files: proof.inspection.inventory.files_seen, formats: Object.keys(proof.inspection.inventory.file_formats).length, guarded_binaries: proof.inspection.inventory.guarded_binary_files.length, duplicate_groups: proof.inspection.hashing.duplicate_groups.length },
      configs: { files: proof.config.files.length, invalid_or_blocked: proof.config.summary.invalid, static_findings: Object.values(proof.config.summary.findings_by_severity).reduce((sum, value) => sum + value, 0), secret_values_returned: false },
      compatibility: { mods: proof.compatibility.mods.length, matrix_rows: proof.compatibility.compatibility_matrix.length, issues: proof.compatibility.issues.length, cycles: proof.compatibility.dependency_cycles.length, compatible: proof.compatibility.summary.compatible },
      profiles: { changed: proof.profiles.summary.changed, changes: proof.profiles.summary.change_count },
      roblox_luau: { project_files: proof.roblox.project_files.length, source_files: proof.roblox.summary.source_files, service_mappings: proof.roblox.summary.mappings, remote_boundaries: proof.roblox.summary.remote_boundaries, symbols: proof.luau.totals.symbols },
      validation: { status: proof.validation.operation_result, command_plans: proof.validation.validation_commands.length, project_test_executed: proof.projectCheck.executed, project_test_exit_code: proof.projectCheck.execution.exit_code, guarded_binary_warnings: proof.validation.warnings.filter((item) => item.code === "guarded_binary").length },
      backup_restore: { backup_files: proof.backup.file_count, package_created: proof.backup.executed, restore_completed: proof.restore.executed, hash_preconditions: proof.restore.targets.every((target) => target.hash_precondition_ready), pre_restore_safety_package: proof.restore.rollback_available, safety_package_round_trip_planned: proof.safetyPreview.operation_result === "restore_planned" },
      mutation_boundaries: { game_launched: false, unknown_tools_executed: false, downloaded_mods_executed: false, binary_formats_patched: false }
    },
    limitations: ["Fixture proof covers local adapter behavior, not compatibility with every game or mod loader.", "Static Lua/Luau and XML checks do not replace configured analyzers, schemas, game runtime, or Roblox Studio tests.", "No game, Studio instance, installer, plugin, downloaded mod, or unknown external tool was executed.", "Backup packages preserve exact selected bytes but not OS ACLs or external mod-manager state."]
  };
  await writeFile(outputPath, `${JSON.stringify(benchmark, null, 2)}\n`, "utf8");
}
