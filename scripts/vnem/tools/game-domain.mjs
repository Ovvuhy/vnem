import { createHash, randomUUID } from "node:crypto";
import { copyFile, lstat, mkdir, readFile, readdir, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import TOML from "@iarna/toml";
import yaml from "js-yaml";

const TEXT_FORMATS = new Set([".txt", ".cfg", ".ini", ".json", ".xml", ".yaml", ".yml", ".toml", ".lua", ".luau"]);
const CONFIG_FORMATS = new Set([".txt", ".cfg", ".ini", ".json", ".xml", ".yaml", ".yml", ".toml", ".lua", ".luau"]);
const LUA_FORMATS = new Set([".lua", ".luau"]);
const ASSET_FORMATS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".ogg", ".mp3", ".wav", ".fbx", ".obj", ".mesh", ".rbxmx"]);
const GUARDED_BINARY_FORMATS = new Set([".bin", ".bnd", ".dcx", ".pak", ".archive", ".bundle", ".dll", ".exe", ".rbxl", ".rbxm"]);
const SKIPPED_DIRS = new Set([".git", ".hg", ".svn", "node_modules", ".cache"]);
const GENERATED_DIRS = new Set(["dist", "build", "out", "target", "coverage", ".next", ".vnem"]);
const SENSITIVE_PART = /^(?:\.env(?:\..*)?|\.ssh|\.aws|\.gnupg|credentials?|secrets?|tokens?|cookies?|sessions?|id_rsa|id_ed25519)$/i;
const CONTROL_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u202A-\u202E\u2066-\u2069\u200E\u200F]/u;
const CONTROL_REPLACE_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u202A-\u202E\u2066-\u2069\u200E\u200F]/gu;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_HASH_BYTES = 64 * 1024 * 1024;
const MAX_BACKUP_BYTES = 128 * 1024 * 1024;
const MAX_BACKUP_FILES = 1000;

const ADAPTERS = Object.freeze([
  Object.freeze({
    id: "generic-text-mod-project",
    game_tool_name: "Generic text-based game/mod project",
    version_scope: "Project metadata and text formats only; no game-runtime version is inferred.",
    platform: ["Windows", "macOS", "Linux"],
    supported_loaders: ["manifest-declared loaders", "text load-order files"],
    file_formats: ["text", "JSON", "XML lexical validation", "YAML", "TOML", "Lua", "Luau"],
    safe_read_operations: ["bounded inventory", "structured config audit", "manifest/load-order analysis", "hash and duplicate detection", "profile comparison"],
    safe_write_operations: ["isolated backup package", "hash-preconditioned restore from a VNEM package"],
    required_external_tools: [],
    backup_strategy: "Copy exact selected regular files into an isolated package with SHA-256 manifest before mutation.",
    restore_strategy: "Verify package hashes and caller-supplied current hashes, create a pre-restore safety package, then copy exact files back.",
    compatibility_fields: ["game", "game_version", "platform", "loader", "loader_version", "mod_id", "version", "dependencies", "conflicts", "load_after", "load_before"],
    validation_method: "Parser/static checks plus the exact game-specific test/build pipeline supplied by the project.",
    unsupported_operations: ["game launch", "installer execution", "downloaded tool execution", "binary archive editing", "save editing"],
    risk_level: "medium"
  }),
  Object.freeze({
    id: "roblox-rojo-luau",
    game_tool_name: "Roblox Rojo/Luau project",
    version_scope: "Rojo-style project JSON and local Lua/Luau source; live Roblox place state is not inspected.",
    platform: ["Windows", "macOS", "Linux"],
    supported_loaders: ["Rojo project mapping", "Wally package metadata", "Aftman/Rokit tool manifests"],
    file_formats: [".project.json", ".luaurc", "Lua", "Luau", "TOML", "JSON"],
    safe_read_operations: ["service/path mapping", "source classification", "symbol/require mapping", "remote trust-boundary heuristics", "asset/config validation"],
    safe_write_operations: ["isolated backup package", "hash-preconditioned restore from a VNEM package"],
    required_external_tools: ["Rojo for a real place build", "Selene or luau-analyze when configured", "project test runner when configured"],
    backup_strategy: "Back up project manifests, source, assets, and lockfiles before generated-place or source changes.",
    restore_strategy: "Restore only exact package entries after current-hash review; do not overwrite live Studio state.",
    compatibility_fields: ["rojo_project", "rojo_version", "luau_mode", "wally_dependencies", "toolchain_versions", "service_mapping"],
    validation_method: "Static mapping checks followed by project-declared lint/test and an isolated Rojo build when the toolchain is available.",
    unsupported_operations: ["Roblox Studio automation", "account/session access", "publishing places", "executing unreviewed plugins", "binary .rbxl/.rbxm editing"],
    risk_level: "medium"
  }),
  Object.freeze({
    id: "guarded-binary-game-format",
    game_tool_name: "Guard for binary game archives and regulation formats",
    version_scope: "Detection and hashing only without a named, version-compatible game adapter.",
    platform: ["Windows", "macOS", "Linux"],
    supported_loaders: [],
    file_formats: [".bin", ".bnd", ".dcx", ".pak", ".archive", ".bundle", ".rbxl", ".rbxm"],
    safe_read_operations: ["metadata", "size", "SHA-256 hashing within limits", "duplicate detection"],
    safe_write_operations: ["byte-for-byte isolated backup and verified restore only"],
    required_external_tools: ["known game-specific unpack/repack/validation toolchain"],
    backup_strategy: "Preserve an exact original hash and byte-for-byte backup before any external pipeline runs.",
    restore_strategy: "Restore exact bytes only after package and current-target hash verification.",
    compatibility_fields: ["game_version", "format_version", "tool_name", "tool_version", "loader_version", "expected_hash"],
    validation_method: "Game-specific unpack/repack and runtime pipeline; generic text validation is invalid.",
    unsupported_operations: ["generic parsing", "generic text patching", "archive repacking", "automatic external-tool execution"],
    risk_level: "high"
  })
]);

export class GameDomainError extends Error {
  constructor(message, code = "game_domain_error", details = {}) {
    super(message);
    this.name = "GameDomainError";
    this.code = code;
    this.details = details;
  }
}

export class GameDomainRuntime {
  constructor({ allowedRoots, evidenceRoot }) {
    this.allowedRoots = allowedRoots.map((root) => path.resolve(root));
    this.evidenceRoot = path.resolve(evidenceRoot);
  }

  async adapterCatalog(args = {}) {
    let detection = null;
    if (args.root) {
      const root = await this.resolveRoot(args.root);
      const scan = await scanProject(root, { maxFiles: 400, maxDepth: 8 });
      detection = detectAdapters(scan.files);
    }
    return {
      operation_result: "reported",
      read_only: true,
      executed: false,
      adapter_contract_fields: ["game_tool_name", "version_scope", "platform", "supported_loaders", "file_formats", "safe_read_operations", "safe_write_operations", "required_external_tools", "backup_strategy", "restore_strategy", "compatibility_fields", "validation_method", "unsupported_operations", "risk_level"],
      adapters: ADAPTERS,
      detected_adapter_ids: detection?.adapterIds || [],
      detection_reasons: detection?.reasons || [],
      safe_next_step: "Inspect the exact project, confirm game/version/loader/toolchain compatibility, then create an isolated backup before any approved mutation.",
      must_not_claim: ["A generic adapter can safely edit binary game formats.", "A detected manifest proves runtime compatibility."]
    };
  }

  async inspectProject(args = {}) {
    const root = await this.resolveRoot(args.root || ".");
    const scan = await scanProject(root, { maxFiles: clamp(args.max_files, 10, 3000, 1000), maxDepth: clamp(args.max_depth, 1, 20, 12) });
    const adapters = detectAdapters(scan.files);
    const manifests = scan.files.filter((file) => isManifestPath(file.path)).map(publicFile).slice(0, 100);
    const loadOrders = scan.files.filter((file) => isLoadOrderPath(file.path)).map(publicFile).slice(0, 30);
    const formats = countBy(scan.files.map((file) => file.extension || "[no extension]"));
    const unsupported = scan.files.filter((file) => GUARDED_BINARY_FORMATS.has(file.extension)).map((file) => ({ path: file.path, format: file.extension, size: file.size, sha256: file.sha256 || null, reason: "known adapter and version-compatible toolchain required before parsing or patching" }));
    const generated = scan.generatedDirectories.map((item) => ({ ...item, policy: "excluded from source traversal; use an isolated output path" }));
    return {
      operation_result: "reported",
      read_only: true,
      executed: false,
      project_root: root,
      selected_adapter_ids: adapters.adapterIds,
      adapter_detection_reasons: adapters.reasons,
      inventory: {
        files_seen: scan.files.length,
        directories_seen: scan.directoryCount,
        truncated: scan.truncated,
        skipped_sensitive_paths: scan.skippedSensitive,
        skipped_links: scan.skippedLinks,
        file_formats: formats,
        manifests,
        load_order_files: loadOrders,
        source_files: scan.files.filter((file) => LUA_FORMATS.has(file.extension)).map(publicFile).slice(0, 250),
        assets: scan.files.filter((file) => ASSET_FORMATS.has(file.extension)).map(publicFile).slice(0, 250),
        guarded_binary_files: unsupported,
        generated_directories: generated
      },
      hashing: {
        algorithm: "sha256",
        hashed_files: scan.files.filter((file) => file.sha256).length,
        hashed_bytes: scan.hashedBytes,
        skipped_large_or_budget_files: scan.files.filter((file) => !file.sha256).length,
        duplicate_groups: duplicateGroups(scan.files)
      },
      generated_output_isolation: {
        default_root: ".vnem/game-domain/output",
        source_tree_mutation: false,
        rule: "Generated builds and converted assets must target an isolated directory and must not overwrite originals."
      },
      compatibility_context_required: ["exact game/tool name", "game/tool version", "platform", "loader and loader version", "format/toolchain versions"],
      safe_next_step: unsupported.length ? "Select a known game-specific adapter/toolchain for guarded binary files; do not text-patch them." : "Audit configs and manifests, then validate the exact project before mutation.",
      limitations: ["Inventory is bounded and skips secret-like paths, links, caches, and generated directory contents.", "Hash equality proves byte equality only, not mod compatibility.", "No game, installer, plugin, or downloaded tool was executed."]
    };
  }

  async auditConfigs(args = {}) {
    const root = await this.resolveRoot(args.root || ".");
    const selected = await selectConfigFiles(root, args.paths, clamp(args.max_files, 1, 100, 50));
    const files = [];
    for (const item of selected) files.push(await analyzeConfigFile(root, item));
    const findings = files.flatMap((file) => file.findings.map((finding) => ({ file: file.path, ...finding })));
    return {
      operation_result: "reported",
      read_only: true,
      executed: false,
      parser_contract: {
        json: "JSON.parse",
        yaml: "js-yaml FAILSAFE_SCHEMA",
        toml: "@iarna/toml",
        xml: "bounded lexical well-formedness and external-entity guard, not schema validation",
        lua_luau: "bounded static token/line heuristics, not execution or a full parser",
        text_ini: "line-oriented duplicate/key/load-order checks"
      },
      files,
      summary: {
        requested_or_discovered: selected.length,
        parsed_or_scanned: files.filter((file) => file.parse_status !== "unsupported").length,
        invalid: files.filter((file) => file.parse_status === "invalid" || file.parse_status === "blocked").length,
        findings_by_severity: countBy(findings.map((item) => item.severity)),
        secret_values_returned: false
      },
      safe_next_step: findings.some((item) => item.severity === "high") ? "Resolve high-severity parser or dynamic-code findings before any build or restore." : "Use the project validator and game-specific toolchain for runtime proof.",
      limitations: ["Lua/Luau checks are structural heuristics and do not replace Selene, luau-analyze, tests, or runtime validation.", "XML schema and game-specific semantics are not proven."]
    };
  }

  async analyzeCompatibility(args = {}) {
    const root = await this.resolveRoot(args.root || ".");
    const manifestPaths = await selectManifestFiles(root, args.manifest_paths, clamp(args.max_manifests, 1, 60, 30));
    const manifests = [];
    for (const relativePath of manifestPaths) manifests.push(await readManifest(root, relativePath));
    const rawMods = manifests.flatMap((item) => item.mods);
    const duplicateIds = duplicateModIds(rawMods);
    const mods = dedupeMods(rawMods);
    const loadOrderPath = args.load_order_path ? cleanRelative(args.load_order_path) : await findDefaultLoadOrder(root);
    const loadOrder = loadOrderPath ? await readLoadOrder(root, loadOrderPath) : { path: null, ids: [], duplicates: [] };
    const analysis = buildCompatibility(mods, loadOrder.ids);
    analysis.issues.unshift(...duplicateIds.map((item) => issue("high", "duplicate_mod_id", item.id, null, `Mod id ${item.id} is declared ${item.count} times with versions ${item.versions.join(", ") || "unspecified"}.`)));
    return {
      operation_result: "reported",
      read_only: true,
      executed: false,
      manifests: manifests.map((item) => ({ path: item.path, parser: item.parser, mod_count: item.mods.length, parse_status: item.parseStatus, findings: item.findings })),
      mods,
      load_order: loadOrder,
      compatibility_matrix: analysis.matrix,
      issues: analysis.issues,
      dependency_cycles: analysis.cycles,
      summary: {
        mod_count: mods.length,
        manifest_count: manifests.length,
        matrix_rows: analysis.matrix.length,
        matrix_truncated: analysis.matrixTruncated,
        issue_count: analysis.issues.length,
        issue_severity: countBy(analysis.issues.map((item) => item.severity)),
        compatible: analysis.issues.every((item) => item.severity !== "high") && manifests.every((item) => item.parseStatus === "valid")
      },
      safe_next_step: analysis.issues.length ? "Resolve missing dependencies, declared conflicts, cycles, and load-order violations; then run the loader/game-specific validator." : "Run the exact loader/game-specific validation pipeline; static compatibility is not runtime proof.",
      limitations: ["Only exact dependency versions are compared; semantic version ranges are reported as requiring a loader-specific resolver.", "An empty static issue list does not prove game-runtime compatibility."]
    };
  }

  async compareProfiles(args = {}) {
    const root = await this.resolveRoot(args.root || ".");
    const left = await readProfile(root, args.left_path);
    const right = await readProfile(root, args.right_path);
    const leftMap = new Map(left.mods.map((mod) => [mod.id, mod]));
    const rightMap = new Map(right.mods.map((mod) => [mod.id, mod]));
    const added = right.mods.filter((mod) => !leftMap.has(mod.id));
    const removed = left.mods.filter((mod) => !rightMap.has(mod.id));
    const shared = [...leftMap.keys()].filter((id) => rightMap.has(id));
    const versionChanged = shared.filter((id) => leftMap.get(id).version !== rightMap.get(id).version).map((id) => ({ id, left: leftMap.get(id).version, right: rightMap.get(id).version }));
    const enabledChanged = shared.filter((id) => leftMap.get(id).enabled !== rightMap.get(id).enabled).map((id) => ({ id, left: leftMap.get(id).enabled, right: rightMap.get(id).enabled }));
    const orderChanged = shared.filter((id) => left.order.indexOf(id) !== right.order.indexOf(id)).map((id) => ({ id, left_index: left.order.indexOf(id), right_index: right.order.indexOf(id) }));
    return {
      operation_result: "reported",
      read_only: true,
      executed: false,
      left: { path: left.path, parser: left.parser, mod_count: left.mods.length },
      right: { path: right.path, parser: right.parser, mod_count: right.mods.length },
      added,
      removed,
      version_changed: versionChanged,
      enabled_changed: enabledChanged,
      order_changed: orderChanged,
      summary: { changed: Boolean(added.length || removed.length || versionChanged.length || enabledChanged.length || orderChanged.length), change_count: added.length + removed.length + versionChanged.length + enabledChanged.length + orderChanged.length },
      safe_next_step: "Run compatibility analysis on the intended profile and verify it with the exact loader/game version before activation.",
      limitations: ["Profile comparison is structural and does not activate a profile or modify a mod manager."]
    };
  }

  async validateProject(args = {}) {
    const root = await this.resolveRoot(args.root || ".");
    const scan = await scanProject(root, { maxFiles: clamp(args.max_files, 10, 2000, 800), maxDepth: 12 });
    const configPaths = scan.files.filter((file) => CONFIG_FORMATS.has(file.extension) && (isManifestPath(file.path) || isProjectConfigPath(file.path) || LUA_FORMATS.has(file.extension))).slice(0, 80).map((file) => file.path);
    const configFiles = [];
    for (const file of configPaths) configFiles.push(await analyzeConfigFile(root, file));
    const adapters = detectAdapters(scan.files);
    const roblox = adapters.adapterIds.includes("roblox-rojo-luau") ? await inspectRobloxProject(root, scan) : null;
    const caseCollisions = findCaseCollisions(scan.files.map((file) => file.path));
    const controlPaths = scan.files.filter((file) => CONTROL_PATTERN.test(file.path)).map((file) => file.path);
    const parseFailures = configFiles.filter((file) => ["invalid", "blocked"].includes(file.parse_status));
    const staticHigh = configFiles.flatMap((file) => file.findings.map((finding) => ({ file: file.path, ...finding }))).filter((finding) => finding.severity === "high");
    const errors = [
      ...parseFailures.map((file) => ({ code: "config_invalid", path: file.path, message: `${file.format} config did not pass its bounded parser/static contract.` })),
      ...controlPaths.map((file) => ({ code: "control_character_path", path: file, message: "Path contains a hidden or unsafe control character." })),
      ...(roblox?.missingMappedPaths || []).map((item) => ({ code: "missing_rojo_mapping", path: item.path, message: `Rojo mapping target does not exist: ${item.target}` }))
    ];
    const warnings = [
      ...staticHigh,
      ...caseCollisions.map((paths) => ({ severity: "medium", code: "case_collision", paths, message: "Paths collide on case-insensitive filesystems." })),
      ...scan.files.filter((file) => GUARDED_BINARY_FORMATS.has(file.extension)).map((file) => ({ severity: "high", code: "guarded_binary", file: file.path, message: "Binary file requires a known version-compatible adapter/toolchain; no generic parse or patch was attempted." }))
    ];
    const commands = await buildValidationCommands(root, scan.files, adapters.adapterIds);
    return {
      operation_result: errors.length ? "validation_failed" : warnings.length ? "validation_warnings" : "validation_passed",
      read_only: true,
      executed: false,
      static_validation: {
        files_seen: scan.files.length,
        config_files_checked: configFiles.length,
        parse_failures: parseFailures.length,
        case_collisions: caseCollisions,
        hidden_or_control_paths: controlPaths,
        duplicate_hash_groups: duplicateGroups(scan.files),
        roblox_mapping: roblox ? roblox.summary : null
      },
      errors,
      warnings,
      validation_commands: commands,
      command_execution: { performed: false, supported_via: "vnem_tools_project_command_run after exact script/tool review and approval", generated_output_root: ".vnem/game-domain/output" },
      safe_to_claim: errors.length === 0 && !warnings.some((item) => item.severity === "high"),
      safe_next_step: errors.length ? "Fix static validation errors before running project commands." : commands.length ? "Review and run the relevant project-declared checks, keeping generated output isolated." : "Provide the exact game-specific validation toolchain; no credible command was detected.",
      must_not_claim: ["The game or Roblox place was launched.", "Static checks prove runtime behavior.", "Guarded binary files were parsed or patched."]
    };
  }

  async createBackup(args = {}) {
    const root = await this.resolveRoot(args.root || ".");
    const selected = await collectBackupFiles(root, args.paths, clamp(args.max_files, 1, MAX_BACKUP_FILES, 500), clamp(args.max_total_bytes, 1024, MAX_BACKUP_BYTES, 64 * 1024 * 1024));
    const outputRoot = cleanOutputRoot(args.output_root || ".vnem/game-domain");
    const packageId = `backup-${safeTimestamp()}-${randomUUID().slice(0, 8)}`;
    const packageRelative = normalizePath(path.join(outputRoot, "backups", packageId));
    const packageAbsolute = path.resolve(root, packageRelative);
    if (!isInside(root, packageAbsolute)) throw new GameDomainError("Backup output must remain inside the project root.", "game_backup_output_outside_root");
    const entries = [];
    for (const file of selected.files) {
      const bytes = await readFile(file.absolute);
      entries.push({ path: file.path, package_path: normalizePath(path.join("files", file.path)), size: bytes.length, sha256: sha256(bytes) });
    }
    const manifest = {
      schema_version: 1,
      package_type: "vnem_game_domain_backup_directory",
      package_id: packageId,
      created_at: new Date().toISOString(),
      project_identity_sha256: sha256(normalizePath(root).toLowerCase()),
      adapter_id: String(args.adapter_id || "generic-text-mod-project"),
      archive_format: "directory_with_json_manifest",
      entries
    };
    const dryRun = args.dry_run !== false;
    if (!dryRun) {
      await mkdir(path.join(packageAbsolute, "files"), { recursive: true });
      for (const entry of entries) {
        const source = path.resolve(root, entry.path);
        const destination = path.resolve(packageAbsolute, entry.package_path);
        await mkdir(path.dirname(destination), { recursive: true });
        await copyFile(source, destination);
      }
      await writeFile(path.join(packageAbsolute, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    }
    return {
      operation_result: dryRun ? "backup_planned" : "backup_created",
      read_only: dryRun,
      executed: !dryRun,
      dry_run: dryRun,
      package_id: packageId,
      package_path: packageRelative,
      manifest_path: normalizePath(path.join(packageRelative, "manifest.json")),
      file_count: entries.length,
      total_bytes: entries.reduce((sum, entry) => sum + entry.size, 0),
      entries,
      restore_strategy: "Call vnem_tools_mod_backup_restore in dry-run mode, review current hashes, then supply those exact hashes for an approved restore.",
      generated_output_isolated: packageRelative.startsWith(".vnem/"),
      safe_next_step: dryRun ? "Review the exact file list and run again with explicit approval to create the package." : "Keep the manifest with its files and use a hash-preconditioned restore only when needed.",
      limitations: ["This is a directory package, not a compressed archive.", "The package preserves exact file bytes but not OS ACLs, alternate streams, or external mod-manager state."]
    };
  }

  async restoreBackup(args = {}) {
    const root = await this.resolveRoot(args.root || ".");
    const manifestRelative = cleanRelative(args.manifest_path);
    const manifestAbsolute = await resolveExistingFile(root, manifestRelative);
    const manifest = parseJson(await readFile(manifestAbsolute, "utf8"), "backup manifest");
    validateBackupManifest(manifest);
    if (manifest.project_identity_sha256 !== sha256(normalizePath(root).toLowerCase())) throw new GameDomainError("Backup package belongs to a different project root.", "game_backup_project_mismatch");
    const packageRoot = path.dirname(manifestAbsolute);
    const expected = args.expected_current_sha256 && typeof args.expected_current_sha256 === "object" ? args.expected_current_sha256 : {};
    const entries = [];
    for (const raw of manifest.entries) {
      const relativePath = cleanRelative(raw.path);
      const target = path.resolve(root, relativePath);
      if (!isInside(root, target)) throw new GameDomainError("Restore target escapes the project root.", "game_restore_target_outside_root", { path: relativePath });
      const packageFile = path.resolve(packageRoot, cleanRelative(raw.package_path));
      if (!isInside(packageRoot, packageFile)) throw new GameDomainError("Backup package entry escapes its package root.", "game_backup_entry_escape", { path: raw.package_path });
      const packageInfo = await stat(packageFile).catch(() => null);
      if (!packageInfo?.isFile() || packageInfo.size !== raw.size || packageInfo.size > MAX_BACKUP_BYTES) throw new GameDomainError("Backup package file size does not match its manifest.", "game_backup_size_mismatch", { path: relativePath });
      const packageBytes = await readFile(packageFile);
      if (packageBytes.length !== raw.size || sha256(packageBytes) !== raw.sha256) throw new GameDomainError("Backup package file hash does not match its manifest.", "game_backup_hash_mismatch", { path: relativePath });
      const current = await readOptionalRegularFile(target);
      entries.push({ path: relativePath, target, packageFile, size: raw.size, backup_sha256: raw.sha256, current_exists: Boolean(current), current_sha256: current ? sha256(current) : null, expected_current_sha256: expected[relativePath] || null });
    }
    const dryRun = args.dry_run !== false;
    if (!dryRun) {
      const missingPreconditions = entries.filter((entry) => entry.current_exists && !entry.expected_current_sha256);
      if (missingPreconditions.length) throw new GameDomainError("Approved restore requires an expected current SHA-256 for every existing target.", "game_restore_hash_precondition_required", { paths: missingPreconditions.map((entry) => entry.path) });
      const mismatches = entries.filter((entry) => entry.current_exists && entry.expected_current_sha256 !== entry.current_sha256);
      if (mismatches.length) throw new GameDomainError("A restore target changed after review; restore was stopped.", "game_restore_hash_precondition_failed", { paths: mismatches.map((entry) => entry.path) });
    }
    let safetyPackage = null;
    if (!dryRun) {
      safetyPackage = path.join(root, ".vnem", "game-domain", "pre-restore", `pre-restore-${safeTimestamp()}-${randomUUID().slice(0, 8)}`);
      await mkdir(path.join(safetyPackage, "files"), { recursive: true });
      const safetyEntries = [];
      for (const entry of entries) {
        if (entry.current_exists) {
          const destination = path.join(safetyPackage, "files", entry.path);
          await mkdir(path.dirname(destination), { recursive: true });
          await copyFile(entry.target, destination);
          safetyEntries.push({ path: entry.path, package_path: normalizePath(path.join("files", entry.path)), size: (await stat(entry.target)).size, sha256: entry.current_sha256 });
        }
      }
      await writeFile(path.join(safetyPackage, "manifest.json"), `${JSON.stringify({ schema_version: 1, package_type: "vnem_game_domain_backup_directory", package_id: `pre-restore-${manifest.package_id}`, created_at: new Date().toISOString(), project_identity_sha256: sha256(normalizePath(root).toLowerCase()), adapter_id: "pre-restore-safety", archive_format: "directory_with_json_manifest", source_package_id: manifest.package_id, entries: safetyEntries }, null, 2)}\n`, "utf8");
      for (const entry of entries) {
        await mkdir(path.dirname(entry.target), { recursive: true });
        await copyFile(entry.packageFile, entry.target);
      }
    }
    return {
      operation_result: dryRun ? "restore_planned" : "restored",
      read_only: dryRun,
      executed: !dryRun,
      dry_run: dryRun,
      package_id: manifest.package_id,
      manifest_path: manifestRelative,
      targets: entries.map(({ path: filePath, size, backup_sha256, current_exists, current_sha256, expected_current_sha256 }) => ({ path: filePath, size, backup_sha256, current_exists, current_sha256, expected_current_sha256, hash_precondition_ready: !current_exists || expected_current_sha256 === current_sha256 })),
      restored_files: dryRun ? [] : entries.map((entry) => entry.path),
      pre_restore_safety_package: safetyPackage ? normalizePath(path.relative(root, safetyPackage)) : null,
      rollback_available: !dryRun && Boolean(safetyPackage),
      safe_next_step: dryRun ? "Review current hashes and pass them unchanged as expected_current_sha256 with explicit approval." : "Run the game-specific validator; use the pre-restore safety package if the restore must be reversed.",
      limitations: ["Restore does not launch a game or prove runtime compatibility.", "Targets missing at preview time can be recreated; existing targets require exact current-hash preconditions."]
    };
  }

  async inspectRoblox(args = {}) {
    const root = await this.resolveRoot(args.root || ".");
    const scan = await scanProject(root, { maxFiles: clamp(args.max_files, 10, 2500, 1200), maxDepth: 16 });
    const result = await inspectRobloxProject(root, scan);
    return {
      operation_result: "reported",
      read_only: true,
      executed: false,
      ...result.public,
      safe_next_step: result.missingMappedPaths.length ? "Fix missing or escaping Rojo mappings, then run static checks and an isolated Rojo build." : "Run configured Luau lint/tests and an isolated Rojo build; inspect remote trust boundaries before runtime claims.",
      limitations: ["Static source inspection does not connect to Roblox Studio or inspect a live place.", "Remote usage is a trust-boundary heuristic, not proof of exploitable behavior.", "Binary Roblox model/place files are not parsed or edited."]
    };
  }

  async mapLuauSymbols(args = {}) {
    const root = await this.resolveRoot(args.root || ".");
    const scan = await scanProject(root, { maxFiles: clamp(args.max_files, 1, 2000, 800), maxDepth: 16 });
    const sourceFiles = scan.files.filter((file) => LUA_FORMATS.has(file.extension)).slice(0, clamp(args.max_files, 1, 2000, 800));
    const query = String(args.query || "").trim().toLowerCase();
    const mapped = [];
    for (const file of sourceFiles) {
      const text = await readTextBounded(path.resolve(root, file.path), MAX_FILE_BYTES);
      const map = mapLuauFile(file.path, text);
      if (!query || JSON.stringify(map).toLowerCase().includes(query)) mapped.push(map);
    }
    return {
      operation_result: "reported",
      read_only: true,
      executed: false,
      query: query || null,
      files_scanned: sourceFiles.length,
      files_matched: mapped.length,
      source_map: mapped,
      totals: {
        symbols: mapped.reduce((sum, file) => sum + file.symbols.length, 0),
        requires: mapped.reduce((sum, file) => sum + file.requires.length, 0),
        services: mapped.reduce((sum, file) => sum + file.services.length, 0),
        remote_boundaries: mapped.reduce((sum, file) => sum + file.remote_boundaries.length, 0),
        static_risks: mapped.reduce((sum, file) => sum + file.static_findings.length, 0)
      },
      safe_next_step: "Use exact file/line evidence for review, then run the project-configured Luau analyzer and tests.",
      limitations: ["Regex/line mapping is intentionally bounded and may miss dynamic or metaprogrammed symbols.", "No source code was executed."]
    };
  }

  async resolveRoot(candidate) {
    const absolute = path.resolve(candidate || ".");
    const resolved = await realpath(absolute).catch(() => { throw new GameDomainError("Game/mod project root does not exist.", "game_project_root_missing", { root: absolute }); });
    if (!this.allowedRoots.some((root) => isInside(root, resolved))) throw new GameDomainError("Game/mod project root is outside VNEM_TOOLS_ALLOWED_ROOTS.", "game_project_root_blocked", { root: resolved });
    const info = await stat(resolved);
    if (!info.isDirectory()) throw new GameDomainError("Game/mod project root must be a directory.", "game_project_root_not_directory");
    return resolved;
  }
}

async function scanProject(root, options = {}) {
  const maxFiles = options.maxFiles || 1000;
  const maxDepth = options.maxDepth || 12;
  const queue = [{ absolute: root, relative: "", depth: 0 }];
  const files = [];
  const skippedSensitive = [];
  const skippedLinks = [];
  const generatedDirectories = [];
  let directoryCount = 0;
  let hashedBytes = 0;
  let truncated = false;
  while (queue.length && files.length < maxFiles) {
    const current = queue.shift();
    directoryCount += 1;
    const entries = await readdir(current.absolute, { withFileTypes: true }).catch(() => []);
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const relative = normalizePath(path.join(current.relative, entry.name));
      if (isSensitivePath(relative)) { skippedSensitive.push(relative); continue; }
      const absolute = path.join(current.absolute, entry.name);
      if (entry.isSymbolicLink()) { skippedLinks.push(relative); continue; }
      if (entry.isDirectory()) {
        if (SKIPPED_DIRS.has(entry.name)) continue;
        if (GENERATED_DIRS.has(entry.name)) { generatedDirectories.push({ path: relative, reason: "generated_or_runtime_output" }); continue; }
        if (current.depth < maxDepth) queue.push({ absolute, relative, depth: current.depth + 1 });
        continue;
      }
      if (!entry.isFile()) continue;
      const info = await stat(absolute).catch(() => null);
      if (!info?.isFile()) continue;
      const extension = compoundExtension(relative);
      const file = { path: relative, absolute, extension, size: info.size, sha256: null };
      if (info.size <= MAX_FILE_BYTES && hashedBytes + info.size <= MAX_HASH_BYTES) {
        const bytes = await readFile(absolute);
        file.sha256 = sha256(bytes);
        hashedBytes += bytes.length;
      }
      files.push(file);
      if (files.length >= maxFiles) { truncated = Boolean(queue.length || entries.indexOf(entry) < entries.length - 1); break; }
    }
  }
  if (queue.length) truncated = true;
  return { files, directoryCount, skippedSensitive: skippedSensitive.slice(0, 100), skippedLinks: skippedLinks.slice(0, 100), generatedDirectories: generatedDirectories.slice(0, 100), hashedBytes, truncated };
}

function detectAdapters(files) {
  const paths = new Set(files.map((file) => file.path.toLowerCase()));
  const adapterIds = ["generic-text-mod-project"];
  const reasons = ["bounded local file inventory supports the generic text/mod safety contract"];
  if (files.some((file) => /(?:^|\/)(?:default\.)?[^/]*\.project\.json$/i.test(file.path)) || paths.has("default.project.json") || files.some((file) => LUA_FORMATS.has(file.extension))) {
    adapterIds.push("roblox-rojo-luau");
    reasons.push("Rojo project metadata or Lua/Luau source was detected");
  }
  if (files.some((file) => GUARDED_BINARY_FORMATS.has(file.extension))) {
    adapterIds.push("guarded-binary-game-format");
    reasons.push("binary game/archive formats were detected and remain hash/backup only");
  }
  return { adapterIds, reasons };
}

async function selectConfigFiles(root, requested, maxFiles) {
  if (Array.isArray(requested) && requested.length) return requested.slice(0, maxFiles).map(cleanRelative);
  const scan = await scanProject(root, { maxFiles: 1200, maxDepth: 12 });
  return scan.files.filter((file) => CONFIG_FORMATS.has(file.extension) && (isManifestPath(file.path) || isProjectConfigPath(file.path) || LUA_FORMATS.has(file.extension))).slice(0, maxFiles).map((file) => file.path);
}

async function analyzeConfigFile(root, relativePath) {
  const clean = cleanRelative(relativePath);
  const absolute = await resolveExistingFile(root, clean);
  const info = await stat(absolute);
  const extension = compoundExtension(clean);
  if (!CONFIG_FORMATS.has(extension)) return { path: clean, format: extension || "unknown", size: info.size, parser: null, parse_status: "unsupported", structure: null, findings: [{ severity: GUARDED_BINARY_FORMATS.has(extension) ? "high" : "medium", code: GUARDED_BINARY_FORMATS.has(extension) ? "guarded_binary_config_blocked" : "unsupported_config_format", message: "No generic text/config parser is allowed for this format." }], references: { count: 0, missing: [] } };
  if (info.size > MAX_FILE_BYTES) return { path: clean, format: extension, size: info.size, parser: null, parse_status: "unsupported", structure: null, findings: [{ severity: "medium", code: "config_too_large", message: "Config exceeds the bounded static-analysis limit." }], references: { count: 0, missing: [] } };
  const text = await readFile(absolute, "utf8");
  let parser = "line-oriented text scan";
  let parseStatus = "valid";
  let structure = null;
  const findings = [];
  let document = null;
  try {
    if (extension === ".json" || clean.toLowerCase().endsWith(".project.json") || clean.toLowerCase() === ".luaurc") {
      parser = "JSON.parse";
      document = JSON.parse(text);
      structure = summarizeDocument(document);
    } else if ([".yaml", ".yml"].includes(extension)) {
      parser = "js-yaml FAILSAFE_SCHEMA";
      document = yaml.load(text, { schema: yaml.FAILSAFE_SCHEMA, json: true });
      structure = summarizeDocument(document);
    } else if (extension === ".toml") {
      parser = "@iarna/toml";
      document = TOML.parse(text);
      structure = summarizeDocument(document);
    } else if (extension === ".xml") {
      parser = "bounded XML lexical checker";
      const xml = scanXml(text);
      structure = xml.structure;
      findings.push(...xml.findings);
      if (!xml.valid) parseStatus = xml.blocked ? "blocked" : "invalid";
    } else if (LUA_FORMATS.has(extension)) {
      parser = "bounded Lua/Luau static scanner";
      const mapped = mapLuauFile(clean, text);
      structure = { symbols: mapped.symbols.length, requires: mapped.requires.length, services: mapped.services.length, remote_boundaries: mapped.remote_boundaries.length };
      findings.push(...mapped.static_findings.map(({ line, ...finding }) => ({ ...finding, line })));
    } else {
      const lines = parseTextLines(text);
      structure = { non_comment_lines: lines.values.length, duplicate_entries: lines.duplicates.length };
      if (lines.duplicates.length) findings.push({ severity: "medium", code: "duplicate_text_entries", message: `Duplicate entries: ${lines.duplicates.slice(0, 10).join(", ")}` });
    }
  } catch (error) {
    parseStatus = "invalid";
    findings.push({ severity: "high", code: "parse_failed", message: safeParseError(error) });
  }
  if (document && typeof document === "object") findings.push(...findSensitiveKeys(document));
  const references = document && typeof document === "object" ? await validateDocumentReferences(root, document) : { count: 0, missing: [] };
  for (const missing of references.missing.slice(0, 30)) findings.push({ severity: "medium", code: "missing_local_reference", message: `Referenced local path was not found: ${missing}` });
  return { path: clean, format: extension || "text", size: info.size, parser, parse_status: parseStatus, structure, findings, references };
}

function scanXml(text) {
  const findings = [];
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) findings.push({ severity: "high", code: "xml_external_entity_surface", message: "DOCTYPE/ENTITY declarations are blocked from generic config trust." });
  const sanitized = text.replace(/<!--[\s\S]*?-->/g, "").replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "").replace(/<\?[\s\S]*?\?>/g, "");
  const tokens = [...sanitized.matchAll(/<\/?([A-Za-z_][\w:.-]*)(?:\s[^<>]*?)?\s*\/?>/g)];
  const stack = [];
  let valid = true;
  for (const token of tokens) {
    const raw = token[0];
    const name = token[1];
    if (raw.startsWith("</")) {
      if (stack.pop() !== name) { valid = false; break; }
    } else if (!raw.endsWith("/>") && !raw.startsWith("<!")) stack.push(name);
  }
  if (stack.length) valid = false;
  if (!valid) findings.push({ severity: "high", code: "xml_not_well_formed", message: "XML tags do not pass the bounded lexical nesting check." });
  return { valid: valid && !findings.some((item) => item.code === "xml_external_entity_surface"), blocked: findings.some((item) => item.code === "xml_external_entity_surface"), structure: { element_tokens: tokens.length, lexical_stack_balanced: valid, schema_validated: false }, findings };
}

function mapLuauFile(filePath, text) {
  const symbols = [];
  const requires = [];
  const services = [];
  const remoteBoundaries = [];
  const staticFindings = [];
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const line = lines[index];
    const code = line.replace(/--.*$/, "");
    let match = code.match(/\b(?:local\s+)?function\s+([A-Za-z_][\w.:]*)/);
    if (match) symbols.push({ name: match[1], kind: match[1].includes(":") ? "method" : "function", line: lineNumber });
    match = code.match(/\blocal\s+([A-Za-z_]\w*)\s*=\s*function\b/);
    if (match) symbols.push({ name: match[1], kind: "function_value", line: lineNumber });
    match = code.match(/\b([A-Za-z_]\w*)\.([A-Za-z_]\w*)\s*=\s*(?:function\b|[^=])/);
    if (match) symbols.push({ name: `${match[1]}.${match[2]}`, kind: "table_member", line: lineNumber });
    for (const req of code.matchAll(/\brequire\s*\(([^)]+)\)/g)) requires.push({ expression: req[1].trim().slice(0, 180), line: lineNumber, numeric_asset: /^\s*\d+\s*$/.test(req[1]) });
    for (const service of code.matchAll(/game\s*:\s*GetService\s*\(\s*["']([^"']+)["']\s*\)/g)) services.push({ name: service[1], line: lineNumber });
    const remoteMatch = code.match(/\b(FireServer|InvokeServer|FireClient|FireAllClients|OnServerEvent|OnServerInvoke|OnClientEvent|OnClientInvoke|RemoteEvent|RemoteFunction)\b/);
    if (remoteMatch) remoteBoundaries.push({ operation: remoteMatch[1], line: lineNumber, direction: /Server$|ServerEvent|ServerInvoke/.test(remoteMatch[1]) ? "client_to_server_or_server_handler" : /Client/.test(remoteMatch[1]) ? "server_to_client_or_client_handler" : "remote_definition" });
    if (/\bloadstring\s*\(/.test(code)) staticFindings.push({ severity: "high", code: "dynamic_code_execution", line: lineNumber, message: "loadstring creates a dynamic-code trust boundary." });
    if (/\b(getfenv|setfenv)\s*\(/.test(code)) staticFindings.push({ severity: "medium", code: "dynamic_environment_access", line: lineNumber, message: "Dynamic environment access weakens static reasoning." });
    if (/\brequire\s*\(\s*\d+\s*\)/.test(code)) staticFindings.push({ severity: "high", code: "numeric_asset_require", line: lineNumber, message: "Numeric asset require depends on external mutable code and needs explicit provenance review." });
    if (/HttpService\s*:\s*(GetAsync|PostAsync|RequestAsync)/.test(code)) staticFindings.push({ severity: "medium", code: "external_http_boundary", line: lineNumber, message: "External HTTP access needs endpoint, secret, and response-validation review." });
    if (/OnServerEvent|OnServerInvoke/.test(code) && !/(typeof|type\(|assert|validate|check|schema|sanitize|clamp)/i.test(code)) staticFindings.push({ severity: "medium", code: "remote_validation_not_visible_same_line", line: lineNumber, message: "Server remote handler is a trust boundary; validation is not visible on the registration line." });
  }
  return {
    path: filePath,
    script_context: classifyRobloxScript(filePath),
    symbols: uniqueObjects(symbols, (item) => `${item.name}:${item.line}`).slice(0, 300),
    requires: requires.slice(0, 300),
    services: uniqueObjects(services, (item) => `${item.name}:${item.line}`).slice(0, 200),
    remote_boundaries: remoteBoundaries.slice(0, 200),
    static_findings: staticFindings.slice(0, 200)
  };
}

async function inspectRobloxProject(root, scan) {
  const projectFiles = scan.files.filter((file) => file.path.toLowerCase().endsWith(".project.json"));
  const mappings = [];
  const missingMappedPaths = [];
  const escapingMappedPaths = [];
  for (const file of projectFiles.slice(0, 20)) {
    try {
      const document = JSON.parse(await readTextBounded(path.resolve(root, file.path), MAX_FILE_BYTES));
      walkRojoTree(document?.tree || document, [], (nodePath, node) => {
        for (const mappedPath of arrayify(node?.$path)) {
          const relative = normalizePath(path.join(path.dirname(file.path), String(mappedPath)));
          const absolute = path.resolve(root, relative);
          const entry = { project: file.path, service_path: nodePath.join("/"), target: relative, class_name: node?.$className || null };
          if (!isInside(root, absolute)) { escapingMappedPaths.push(entry); continue; }
          mappings.push(entry);
        }
      });
    } catch (error) {
      missingMappedPaths.push({ project: file.path, path: file.path, target: "[project JSON invalid]", error: String(error.message || error).slice(0, 180) });
    }
  }
  for (const mapping of mappings) {
    const target = path.resolve(root, mapping.target);
    const info = await lstat(target).catch(() => null);
    if (!info) { missingMappedPaths.push({ project: mapping.project, path: mapping.service_path, target: mapping.target }); continue; }
    const resolved = await realpath(target).catch(() => null);
    if (info.isSymbolicLink() || !resolved || !isInside(root, resolved)) escapingMappedPaths.push({ ...mapping, reason: "mapping resolves through a link or outside the project root" });
  }
  const sourceFiles = scan.files.filter((file) => LUA_FORMATS.has(file.extension));
  const sourceMaps = [];
  for (const file of sourceFiles.slice(0, 1000)) sourceMaps.push(mapLuauFile(file.path, await readTextBounded(path.resolve(root, file.path), MAX_FILE_BYTES)));
  const toolchainFiles = scan.files.filter((file) => /(?:^|\/)(?:aftman|rokit|wally|pesde|selene|stylua)\.(?:toml|json)$|(?:^|\/)wally\.lock$|(?:^|\/)\.luaurc$/i.test(file.path)).map(publicFile);
  const testFiles = sourceFiles.filter((file) => /(?:^|\/)(?:test|tests|spec)(?:\/|\.)|\.spec\.lua[u]?$/i.test(file.path)).map(publicFile);
  const remoteBoundaries = sourceMaps.flatMap((file) => file.remote_boundaries.map((item) => ({ file: file.path, context: file.script_context, ...item }))).slice(0, 500);
  const staticFindings = sourceMaps.flatMap((file) => file.static_findings.map((item) => ({ file: file.path, context: file.script_context, ...item }))).slice(0, 500);
  const publicResult = {
    project_files: projectFiles.map(publicFile),
    service_mappings: mappings.slice(0, 500),
    missing_mapped_paths: missingMappedPaths.slice(0, 200),
    escaping_mapped_paths: escapingMappedPaths.slice(0, 100),
    source_files: sourceFiles.map((file) => ({ ...publicFile(file), context: classifyRobloxScript(file.path) })).slice(0, 1000),
    source_context_counts: countBy(sourceFiles.map((file) => classifyRobloxScript(file.path))),
    toolchain_files: toolchainFiles,
    test_files: testFiles,
    remote_trust_boundaries: remoteBoundaries,
    static_findings: staticFindings,
    summary: { project_files: projectFiles.length, mappings: mappings.length, missing_mappings: missingMappedPaths.length, escaping_mappings: escapingMappedPaths.length, source_files: sourceFiles.length, remote_boundaries: remoteBoundaries.length, static_findings: staticFindings.length }
  };
  return { public: publicResult, summary: publicResult.summary, missingMappedPaths, escapingMappedPaths };
}

function walkRojoTree(node, nodePath, visit) {
  if (!node || typeof node !== "object" || Array.isArray(node)) return;
  visit(nodePath, node);
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith("$") || !value || typeof value !== "object" || Array.isArray(value)) continue;
    walkRojoTree(value, [...nodePath, key], visit);
  }
}

async function selectManifestFiles(root, requested, maxFiles) {
  if (Array.isArray(requested) && requested.length) return requested.slice(0, maxFiles).map(cleanRelative);
  const scan = await scanProject(root, { maxFiles: 1200, maxDepth: 12 });
  return scan.files.filter((file) => isManifestPath(file.path) && !file.path.toLowerCase().endsWith("package.json") && !file.path.toLowerCase().endsWith(".project.json")).slice(0, maxFiles).map((file) => file.path);
}

async function readManifest(root, relativePath) {
  const clean = cleanRelative(relativePath);
  try {
    const document = await readStructuredDocument(root, clean);
    return { path: clean, parser: document.parser, parseStatus: "valid", findings: [], mods: extractMods(document.value, path.basename(clean, path.extname(clean))) };
  } catch (error) {
    return { path: clean, parser: null, parseStatus: "invalid", findings: [{ severity: "high", code: "manifest_parse_failed", message: safeParseError(error) }], mods: [] };
  }
}

function extractMods(document, fallbackId) {
  if (!document || typeof document !== "object") return [];
  let values = [];
  if (Array.isArray(document)) values = document;
  else if (Array.isArray(document.mods)) values = document.mods;
  else if (document.mods && typeof document.mods === "object") values = Object.entries(document.mods).map(([id, value]) => typeof value === "object" ? { id, ...value } : { id, version: value });
  else if (Array.isArray(document.plugins)) values = document.plugins;
  else if (document.id || document.mod_id || document.modId || document.name) values = [document];
  else if (document.dependencies && typeof document.dependencies === "object") values = [{ id: fallbackId, version: document.version || null, dependencies: document.dependencies }];
  return values.map((value, index) => normalizeMod(value, `${fallbackId}-${index + 1}`)).filter(Boolean);
}

function normalizeMod(value, fallbackId) {
  if (typeof value === "string") return { id: value, version: null, enabled: true, dependencies: [], conflicts: [], load_after: [], load_before: [] };
  if (!value || typeof value !== "object") return null;
  const id = safeScalar(value.id || value.mod_id || value.modId || value.name || fallbackId, 160);
  if (!id) return null;
  return {
    id,
    version: value.version == null ? null : safeScalar(value.version, 80),
    enabled: value.enabled !== false,
    game: value.game ? safeScalar(value.game, 120) : null,
    game_version: value.game_version || value.gameVersion ? safeScalar(value.game_version || value.gameVersion, 80) : null,
    platform: value.platform ? safeScalar(value.platform, 80) : null,
    loader: value.loader ? safeScalar(value.loader, 120) : null,
    loader_version: value.loader_version || value.loaderVersion ? safeScalar(value.loader_version || value.loaderVersion, 80) : null,
    dependencies: normalizeRelations(value.dependencies || value.depends || value.requires),
    conflicts: normalizeRelations(value.conflicts || value.incompatible),
    load_after: normalizeRelations(value.load_after || value.loadAfter || value.after),
    load_before: normalizeRelations(value.load_before || value.loadBefore || value.before)
  };
}

function normalizeRelations(value) {
  if (!value) return [];
  if (typeof value === "string") return [{ id: safeScalar(value, 160), version: null }];
  if (Array.isArray(value)) return value.map((item) => typeof item === "string" ? { id: safeScalar(item, 160), version: null } : { id: safeScalar(item.id || item.name || "", 160), version: item.version == null ? null : safeScalar(item.version, 80) }).filter((item) => item.id);
  if (typeof value === "object") return Object.entries(value).map(([id, version]) => ({ id: safeScalar(id, 160), version: version == null || typeof version === "object" ? null : safeScalar(version, 80) }));
  return [];
}

function buildCompatibility(mods, loadOrder) {
  const byId = new Map(mods.map((mod) => [mod.id, mod]));
  const orderIndex = new Map(loadOrder.map((id, index) => [id, index]));
  const issues = [];
  for (const mod of mods) {
    for (const dependency of mod.dependencies) {
      const found = byId.get(dependency.id);
      if (!found) issues.push(issue("high", "missing_dependency", mod.id, dependency.id, `${mod.id} requires missing ${dependency.id}.`));
      else if (dependency.version && found.version && isExactVersion(dependency.version) && dependency.version !== found.version) issues.push(issue("high", "dependency_version_mismatch", mod.id, dependency.id, `${mod.id} requires ${dependency.id} ${dependency.version}, found ${found.version}.`));
      else if (dependency.version && !isExactVersion(dependency.version)) issues.push(issue("medium", "version_range_not_evaluated", mod.id, dependency.id, `${mod.id} uses loader-specific version range ${dependency.version}; exact resolver not available.`));
      if (orderIndex.has(mod.id) && orderIndex.has(dependency.id) && orderIndex.get(dependency.id) > orderIndex.get(mod.id)) issues.push(issue("high", "dependency_load_order_violation", mod.id, dependency.id, `${dependency.id} loads after dependent ${mod.id}.`));
    }
    for (const conflict of mod.conflicts) if (byId.has(conflict.id)) issues.push(issue("high", "declared_conflict", mod.id, conflict.id, `${mod.id} declares a conflict with ${conflict.id}.`));
    for (const after of mod.load_after) if (orderIndex.has(mod.id) && orderIndex.has(after.id) && orderIndex.get(after.id) > orderIndex.get(mod.id)) issues.push(issue("high", "load_after_violation", mod.id, after.id, `${mod.id} must load after ${after.id}.`));
    for (const before of mod.load_before) if (orderIndex.has(mod.id) && orderIndex.has(before.id) && orderIndex.get(before.id) < orderIndex.get(mod.id)) issues.push(issue("high", "load_before_violation", mod.id, before.id, `${mod.id} must load before ${before.id}.`));
  }
  for (const id of loadOrder) if (!byId.has(id)) issues.push(issue("medium", "unknown_load_order_entry", id, null, `Load-order entry ${id} has no parsed manifest.`));
  for (const mod of mods) if (loadOrder.length && !orderIndex.has(mod.id)) issues.push(issue("medium", "mod_missing_from_load_order", mod.id, null, `${mod.id} is not present in the load-order file.`));
  const cycles = dependencyCycles(mods);
  for (const cycle of cycles) issues.push(issue("high", "dependency_cycle", cycle[0], cycle[cycle.length - 1], `Dependency cycle: ${cycle.join(" -> ")}.`));
  const matrix = [];
  let matrixTruncated = false;
  for (let leftIndex = 0; leftIndex < mods.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < mods.length; rightIndex += 1) {
      if (matrix.length >= 300) { matrixTruncated = true; break; }
      const left = mods[leftIndex];
      const right = mods[rightIndex];
      const pairIssues = issues.filter((item) => [item.mod_id, item.related_id].includes(left.id) && [item.mod_id, item.related_id].includes(right.id));
      matrix.push({ left: left.id, right: right.id, status: pairIssues.some((item) => item.severity === "high") ? "incompatible_or_order_invalid" : "no_declared_conflict", reasons: pairIssues.map((item) => item.code) });
    }
    if (matrixTruncated) break;
  }
  return { matrix, matrixTruncated, issues: uniqueObjects(issues, (item) => `${item.code}:${item.mod_id}:${item.related_id || ""}`), cycles };
}

function dependencyCycles(mods) {
  const graph = new Map(mods.map((mod) => [mod.id, mod.dependencies.map((item) => item.id)]));
  const visiting = new Set();
  const visited = new Set();
  const cycles = [];
  function visit(id, trail) {
    if (visiting.has(id)) { const start = trail.indexOf(id); cycles.push([...trail.slice(start), id]); return; }
    if (visited.has(id) || !graph.has(id)) return;
    visiting.add(id);
    for (const next of graph.get(id)) visit(next, [...trail, id]);
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of graph.keys()) visit(id, []);
  return uniqueObjects(cycles, (cycle) => [...new Set(cycle)].sort().join("|"));
}

async function readProfile(root, relativePath) {
  const clean = cleanRelative(relativePath);
  const document = await readStructuredDocument(root, clean);
  const mods = extractMods(document.value, path.basename(clean, path.extname(clean)));
  const order = Array.isArray(document.value?.load_order) ? document.value.load_order.map(String) : Array.isArray(document.value?.order) ? document.value.order.map(String) : mods.map((mod) => mod.id);
  return { path: clean, parser: document.parser, mods, order };
}

async function readStructuredDocument(root, relativePath) {
  const absolute = await resolveExistingFile(root, relativePath);
  const text = await readTextBounded(absolute, MAX_FILE_BYTES);
  const extension = compoundExtension(relativePath);
  if (extension === ".json" || relativePath.toLowerCase().endsWith(".project.json")) return { parser: "JSON.parse", value: JSON.parse(text) };
  if ([".yaml", ".yml"].includes(extension)) return { parser: "js-yaml FAILSAFE_SCHEMA", value: yaml.load(text, { schema: yaml.FAILSAFE_SCHEMA, json: true }) };
  if (extension === ".toml") return { parser: "@iarna/toml", value: TOML.parse(text) };
  const lines = parseTextLines(text);
  return { parser: "line-oriented profile", value: { mods: lines.values.map((id) => ({ id })), load_order: lines.values } };
}

async function readLoadOrder(root, relativePath) {
  const absolute = await resolveExistingFile(root, relativePath);
  const lines = parseTextLines(await readTextBounded(absolute, MAX_FILE_BYTES));
  return { path: relativePath, ids: lines.values, duplicates: lines.duplicates };
}

async function findDefaultLoadOrder(root) {
  for (const candidate of ["loadorder.txt", "load-order.txt", "plugins.txt", "mods.txt"]) if (await lstat(path.resolve(root, candidate)).then(() => true, () => false)) return candidate;
  return null;
}

async function collectBackupFiles(root, requested, maxFiles, maxTotalBytes) {
  if (!Array.isArray(requested) || !requested.length) throw new GameDomainError("Backup requires one or more exact project-relative paths.", "game_backup_paths_required");
  const files = [];
  let totalBytes = 0;
  for (const requestedPath of requested) {
    const relative = cleanRelative(requestedPath);
    if (relative.startsWith(".vnem/game-domain/")) throw new GameDomainError("Backup inputs cannot include VNEM game-domain output.", "game_backup_recursive_output_blocked", { path: relative });
    const absolute = path.resolve(root, relative);
    if (!isInside(root, absolute)) throw new GameDomainError("Backup input escapes the project root.", "game_backup_path_outside_root", { path: relative });
    const info = await lstat(absolute).catch(() => null);
    if (!info) throw new GameDomainError("Backup input does not exist.", "game_backup_path_missing", { path: relative });
    if (info.isSymbolicLink()) throw new GameDomainError("Backup inputs cannot be links or junctions.", "game_backup_link_blocked", { path: relative });
    if (info.isFile()) addFile(relative, absolute, info.size);
    else if (info.isDirectory()) await walkDirectory(absolute, relative);
    else throw new GameDomainError("Backup inputs must be regular files or directories.", "game_backup_path_type_blocked", { path: relative });
  }
  return { files: uniqueObjects(files, (file) => file.path), totalBytes };

  function addFile(relative, absolute, size) {
    if (isSensitivePath(relative)) throw new GameDomainError("Secret-like paths cannot be placed in a game backup package.", "game_backup_sensitive_path_blocked", { path: relative });
    if (files.length >= maxFiles) throw new GameDomainError("Backup file limit exceeded.", "game_backup_file_limit", { max_files: maxFiles });
    if (totalBytes + size > maxTotalBytes) throw new GameDomainError("Backup byte limit exceeded.", "game_backup_byte_limit", { max_total_bytes: maxTotalBytes });
    files.push({ path: relative, absolute, size });
    totalBytes += size;
  }

  async function walkDirectory(absoluteDir, relativeDir) {
    for (const entry of await readdir(absoluteDir, { withFileTypes: true })) {
      const childRelative = normalizePath(path.join(relativeDir, entry.name));
      const childAbsolute = path.join(absoluteDir, entry.name);
      if (entry.isSymbolicLink()) throw new GameDomainError("Backup directory contains a link or junction.", "game_backup_link_blocked", { path: childRelative });
      if (entry.isDirectory() && (SKIPPED_DIRS.has(entry.name) || GENERATED_DIRS.has(entry.name))) continue;
      if (entry.isDirectory()) await walkDirectory(childAbsolute, childRelative);
      else if (entry.isFile()) addFile(childRelative, childAbsolute, (await stat(childAbsolute)).size);
    }
  }
}

function validateBackupManifest(manifest) {
  if (!manifest || manifest.schema_version !== 1 || manifest.package_type !== "vnem_game_domain_backup_directory" || !Array.isArray(manifest.entries)) throw new GameDomainError("File is not a supported VNEM game-domain backup manifest.", "game_backup_manifest_invalid");
  if (!manifest.entries.length || manifest.entries.length > MAX_BACKUP_FILES) throw new GameDomainError("Backup manifest entry count is invalid.", "game_backup_manifest_entry_count");
  const paths = new Set();
  let totalBytes = 0;
  for (const entry of manifest.entries) {
    if (!entry || typeof entry.path !== "string" || typeof entry.package_path !== "string" || !/^[0-9a-f]{64}$/i.test(entry.sha256 || "") || !Number.isInteger(entry.size) || entry.size < 0 || entry.size > MAX_BACKUP_BYTES) throw new GameDomainError("Backup manifest entry is invalid.", "game_backup_manifest_entry_invalid");
    const normalized = cleanRelative(entry.path);
    if (paths.has(normalized)) throw new GameDomainError("Backup manifest contains duplicate target paths.", "game_backup_manifest_duplicate_target", { path: normalized });
    paths.add(normalized);
    totalBytes += entry.size;
  }
  if (totalBytes > MAX_BACKUP_BYTES) throw new GameDomainError("Backup manifest exceeds the restore byte limit.", "game_backup_manifest_byte_limit", { max_total_bytes: MAX_BACKUP_BYTES });
}

async function buildValidationCommands(root, files, adapterIds) {
  const commands = [];
  const packageFile = files.find((file) => file.path.toLowerCase() === "package.json");
  if (packageFile) {
    try {
      const pkg = JSON.parse(await readTextBounded(path.resolve(root, packageFile.path), MAX_FILE_BYTES));
      for (const name of ["lint", "typecheck", "test", "build", "validate"]) if (pkg.scripts?.[name]) commands.push({ purpose: name, command: "npm", arguments: ["run", name], source: "package.json", execution_policy: "review project script, then use vnem_tools_project_command_run with approval" });
    } catch {}
  }
  if (adapterIds.includes("roblox-rojo-luau")) {
    const project = files.find((file) => file.path.toLowerCase().endsWith(".project.json"));
    if (files.some((file) => /(?:^|\/)selene\.toml$/i.test(file.path))) commands.push({ purpose: "luau_static_check", command: "selene", arguments: ["."], source: "selene.toml", execution_policy: "run only an installed, reviewed toolchain" });
    if (files.some((file) => /(?:^|\/)stylua\.toml$/i.test(file.path))) commands.push({ purpose: "luau_format_check", command: "stylua", arguments: ["--check", "."], source: "stylua.toml", execution_policy: "run only an installed, reviewed toolchain" });
    if (project) commands.push({ purpose: "isolated_rojo_build", command: "rojo", arguments: ["build", project.path, "--output", ".vnem/game-domain/output/project.rbxlx"], source: project.path, execution_policy: "run only an installed, version-compatible Rojo; output stays isolated" });
  }
  return commands.slice(0, 20);
}

function validateDocumentReferences(root, document) {
  const values = [];
  walkValues(document, [], (keyPath, value) => {
    const key = keyPath.at(-1) || "";
    if (typeof value === "string" && /(?:path|file|asset|source|output|manifest|config|icon|image|audio|model)$/i.test(key) && looksRelativeReference(value) && !isSensitivePath(value)) values.push(normalizePath(value));
  });
  return Promise.all(values.slice(0, 100).map(async (value) => ({ value, exists: isInside(root, path.resolve(root, value)) && await lstat(path.resolve(root, value)).then(() => true, () => false) }))).then((items) => ({ count: values.length, missing: items.filter((item) => !item.exists).map((item) => item.value) }));
}

function findSensitiveKeys(document) {
  const findings = [];
  walkValues(document, [], (keyPath, value) => {
    const key = keyPath.at(-1) || "";
    if (/(?:token|secret|password|credential|api[_-]?key|cookie|session)/i.test(key) && value != null && String(value).length) findings.push({ severity: "high", code: "secret_like_config_key", message: `Secret-like key ${safeScalar(keyPath.join("."), 180)} contains a value; move credentials outside mod/project files.` });
  });
  return findings.slice(0, 50);
}

function walkValues(value, keyPath, visit, seen = new Set()) {
  if (value && typeof value === "object") {
    if (seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) value.forEach((item, index) => walkValues(item, [...keyPath, String(index)], visit, seen));
    else Object.entries(value).forEach(([key, item]) => walkValues(item, [...keyPath, key], visit, seen));
    return;
  }
  visit(keyPath, value);
}

function summarizeDocument(value) {
  if (Array.isArray(value)) return { root_type: "array", item_count: value.length };
  if (value && typeof value === "object") return { root_type: "object", top_level_keys: Object.keys(value).slice(0, 80), top_level_key_count: Object.keys(value).length };
  return { root_type: value === null ? "null" : typeof value };
}

function duplicateGroups(files) {
  const groups = new Map();
  for (const file of files) if (file.sha256) groups.set(file.sha256, [...(groups.get(file.sha256) || []), file]);
  return [...groups.entries()].filter(([, items]) => items.length > 1).map(([hash, items]) => ({ sha256: hash, size: items[0].size, paths: items.map((item) => item.path) })).slice(0, 100);
}

function dedupeMods(mods) {
  const seen = new Map();
  for (const mod of mods) if (!seen.has(mod.id)) seen.set(mod.id, mod);
  return [...seen.values()].slice(0, 200);
}

function duplicateModIds(mods) {
  const groups = new Map();
  for (const mod of mods) groups.set(mod.id, [...(groups.get(mod.id) || []), mod]);
  return [...groups.entries()].filter(([, values]) => values.length > 1).map(([id, values]) => ({ id, count: values.length, versions: [...new Set(values.map((item) => item.version).filter(Boolean))] }));
}

function findCaseCollisions(paths) {
  const groups = new Map();
  for (const filePath of paths) groups.set(filePath.toLowerCase(), [...(groups.get(filePath.toLowerCase()) || []), filePath]);
  return [...groups.values()].filter((items) => new Set(items).size > 1).slice(0, 100);
}

function parseTextLines(text) {
  const values = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#") && !line.startsWith(";")).map((line) => line.replace(/^\*\s*/, "").split(/\s*[=,]\s*/)[0].trim()).filter(Boolean);
  const counts = countBy(values);
  return { values, duplicates: Object.entries(counts).filter(([, count]) => count > 1).map(([value]) => value) };
}

function classifyRobloxScript(filePath) {
  const value = normalizePath(filePath).toLowerCase();
  if (/\.server\.lua[u]?$/.test(value) || /(?:^|\/)serverscriptservice\//.test(value) || /(?:^|\/)server\//.test(value)) return "server";
  if (/\.client\.lua[u]?$/.test(value) || /(?:^|\/)(starterplayer|startergui|client)\//.test(value)) return "client";
  if (/(?:^|\/)(replicatedstorage|shared)\//.test(value) || /\.module\.lua[u]?$/.test(value)) return "shared_or_module";
  if (/\.spec\.lua[u]?$/.test(value) || /(?:^|\/)(tests?|spec)\//.test(value)) return "test";
  return "unclassified";
}

function isManifestPath(filePath) {
  return /(?:^|\/)(?:manifest|mods?|profile|loadout)(?:[-_.][^/]*)?\.(?:json|ya?ml|toml|txt)$|(?:^|\/)(?:wally|aftman|rokit|pesde)\.(?:toml|json)$|(?:^|\/)wally\.lock$/i.test(filePath);
}

function isLoadOrderPath(filePath) {
  return /(?:^|\/)(?:load[-_ ]?order|plugins|mods)\.txt$/i.test(filePath);
}

function isProjectConfigPath(filePath) {
  return /\.project\.json$|(?:^|\/)(?:\.luaurc|selene\.toml|stylua\.toml|package\.json)$/i.test(filePath);
}

function isSensitivePath(filePath) {
  return normalizePath(filePath).split("/").some((part) => SENSITIVE_PART.test(part) || /\.(?:pem|key|p12|pfx)$/i.test(part));
}

function looksRelativeReference(value) {
  return value.length <= 300 && !/^[a-z]+:\/\//i.test(value) && !path.isAbsolute(value) && !value.includes("${") && /[./\\]/.test(value);
}

function cleanRelative(value) {
  const raw = String(value || "").trim();
  if (!raw || path.isAbsolute(raw) || CONTROL_PATTERN.test(raw)) throw new GameDomainError("Expected a clean project-relative path.", "game_domain_path_invalid", { path: raw });
  const normalized = normalizePath(path.normalize(raw));
  if (normalized === ".." || normalized.startsWith("../") || isSensitivePath(normalized)) throw new GameDomainError("Path is outside the safe project/config scope.", "game_domain_path_blocked", { path: raw });
  return normalized.replace(/^\.\//, "");
}

function cleanOutputRoot(value) {
  const cleaned = cleanRelative(value);
  if (!cleaned.startsWith(".vnem/")) throw new GameDomainError("Game-domain generated output must be isolated under .vnem/.", "game_domain_output_not_isolated", { path: cleaned });
  return cleaned.replace(/\/$/, "");
}

async function resolveExistingFile(root, relativePath) {
  const clean = cleanRelative(relativePath);
  const absolute = path.resolve(root, clean);
  if (!isInside(root, absolute)) throw new GameDomainError("File escapes the project root.", "game_domain_path_outside_root", { path: clean });
  const resolved = await realpath(absolute).catch(() => { throw new GameDomainError("Requested project file does not exist.", "game_domain_file_missing", { path: clean }); });
  if (!isInside(root, resolved)) throw new GameDomainError("File resolves outside the project root.", "game_domain_link_escape", { path: clean });
  const info = await lstat(absolute);
  if (!info.isFile() || info.isSymbolicLink()) throw new GameDomainError("Requested path must be a regular non-link file.", "game_domain_file_type_blocked", { path: clean });
  return resolved;
}

async function readTextBounded(absolute, maxBytes) {
  const info = await stat(absolute);
  if (info.size > maxBytes) throw new GameDomainError("Text file exceeds the bounded read limit.", "game_domain_file_too_large", { max_bytes: maxBytes });
  const bytes = await readFile(absolute);
  if (bytes.includes(0)) throw new GameDomainError("Binary file cannot be read through a text/config adapter.", "game_domain_binary_text_blocked");
  return bytes.toString("utf8");
}

async function readOptionalRegularFile(absolute) {
  const info = await lstat(absolute).catch(() => null);
  if (!info) return null;
  if (!info.isFile() || info.isSymbolicLink()) throw new GameDomainError("Restore target is not a regular non-link file.", "game_restore_target_type_blocked");
  return await readFile(absolute);
}

function parseJson(value, label) {
  try { return JSON.parse(value); } catch (error) { throw new GameDomainError(`${label} is not valid JSON.`, "game_domain_json_invalid", { error: String(error.message || error).slice(0, 200) }); }
}

function compoundExtension(filePath) {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".project.json")) return ".json";
  if (path.basename(lower) === ".luaurc") return ".json";
  return path.extname(lower);
}

function publicFile(file) {
  return { path: file.path, extension: file.extension, size: file.size, sha256: file.sha256 || null };
}

function issue(severity, code, modId, relatedId, message) {
  return { severity, code, mod_id: modId, related_id: relatedId, message };
}

function isExactVersion(value) {
  return /^[vV]?\d+(?:\.\d+){0,3}(?:[-+][A-Za-z0-9.-]+)?$/.test(String(value));
}

function safeParseError(error) {
  const reason = error?.reason || error?.name || "Parser rejected the file";
  const line = Number.isInteger(error?.mark?.line) ? ` at line ${error.mark.line + 1}` : "";
  return `${safeScalar(reason, 160)}${line}`;
}

function safeScalar(value, limit) {
  return String(value ?? "").replace(/[\r\n\t]+/g, " ").replace(CONTROL_REPLACE_PATTERN, "").trim().slice(0, limit);
}

function uniqueObjects(values, keyFn) {
  const seen = new Set();
  return values.filter((value) => { const key = keyFn(value); if (seen.has(key)) return false; seen.add(key); return true; });
}

function countBy(values) {
  const counts = {};
  for (const value of values) counts[value] = (counts[value] || 0) + 1;
  return counts;
}

function arrayify(value) {
  return Array.isArray(value) ? value : value == null ? [] : [value];
}

function clamp(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.floor(number))) : fallback;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizePath(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function isInside(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function safeTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

export const GAME_DOMAIN_MARKERS = Object.freeze({
  adapter_contract: "game_tool_name version_scope supported_loaders safe_read_operations safe_write_operations backup_strategy restore_strategy compatibility_fields validation_method unsupported_operations risk_level",
  formats: "text JSON XML YAML TOML Lua Luau guarded binary",
  safety: "allowed roots bounded reads no unknown tools no game launch no generic binary patching isolated output hash preconditions",
  proof: "stdio MCP inventory config manifests load order hashes duplicates compatibility profiles backup restore Roblox Luau validation"
});
