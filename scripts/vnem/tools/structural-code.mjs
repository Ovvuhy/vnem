import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { lstat, mkdir, readFile, readdir, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "@babel/parser";
import traverseModule from "@babel/traverse";

const traverse = traverseModule.default;
const INDEX_SCHEMA_VERSION = 2;
const MAX_FILE_BYTES = 1024 * 1024;
const MAX_FILES = 10000;
const MAX_GRAPH_EDGES = 50000;
const MAX_RESULTS = 500;
const CODE_EXTENSIONS = new Set([
  ".c", ".cc", ".cpp", ".cs", ".go", ".h", ".hpp", ".java", ".js", ".jsx", ".kt", ".lua", ".luau",
  ".mjs", ".cjs", ".php", ".py", ".rb", ".rs", ".svelte", ".ts", ".tsx", ".vue"
]);
const AST_EXTENSIONS = new Set([".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx"]);
const SKIPPED_DIRECTORIES = new Set([
  ".cache", ".git", ".next", ".nuxt", ".svelte-kit", ".tmp", ".turbo", ".vnem", ".vnem-runtime",
  "build", "coverage", "dist", "node_modules", "out", "output", "site"
]);
const SECRET_FILE_PATTERN = /(?:^|\/)(?:\.env(?:\..*)?|\.npmrc|\.pypirc|credentials?|secrets?|id_[rd]sa|.*\.(?:pem|p12|pfx|key))$/i;
const SAFE_VERIFY_SCRIPTS = new Set(["test", "validate", "typecheck", "lint", "check"]);
const LANGUAGE_BY_EXTENSION = new Map([
  [".c", "c"], [".h", "c"], [".cc", "cpp"], [".cpp", "cpp"], [".hpp", "cpp"], [".cs", "csharp"],
  [".go", "go"], [".java", "java"], [".js", "javascript"], [".jsx", "javascript"], [".mjs", "javascript"],
  [".cjs", "javascript"], [".kt", "kotlin"], [".lua", "lua"], [".luau", "luau"], [".php", "php"],
  [".py", "python"], [".rb", "ruby"], [".rs", "rust"], [".svelte", "svelte"], [".ts", "typescript"],
  [".tsx", "typescript"], [".vue", "vue"]
]);

export class StructuralCodeError extends Error {
  constructor(message, code = "structural_code_error", details = {}) {
    super(message);
    this.name = "StructuralCodeError";
    this.code = code;
    this.details = details;
  }
}

export class StructuralCodeRuntime {
  constructor({ allowedRoots, evidenceRoot, commandRuntime }) {
    this.allowedRoots = allowedRoots.map((item) => path.resolve(item));
    this.evidenceRoot = path.resolve(evidenceRoot);
    this.commandRuntime = commandRuntime;
    this.indexes = new Map();
    this.previews = new Map();
  }

  async buildIndex(args = {}) {
    const root = await this.#resolveRoot(args.root || ".");
    const { index, build } = await this.#refreshIndex(root, args);
    return {
      operation_result: "structural_index_ready",
      root,
      index_id: index.index_id,
      generated_at: index.generated_at,
      parser_architecture: index.parser_architecture,
      storage: index.storage,
      files: index.files.length,
      symbols: index.graph.symbols.length,
      graph_summary: graphSummary(index),
      build,
      inventory: index.inventory,
      language_confidence: index.language_confidence,
      limitations: index.limitations
    };
  }

  async query(args = {}) {
    const root = await this.#resolveRoot(args.root || ".");
    const index = await this.#ensureIndex(root, args);
    const limit = clamp(args.limit, 1, MAX_RESULTS, 100);
    const symbolNeedle = normalizeIdentifier(args.symbol || "");
    const kindNeedle = String(args.kind || "").toLowerCase();
    const languageNeedle = String(args.language || "").toLowerCase();
    const pathNeedle = normalizePath(args.path_contains || "").toLowerCase();
    const calleeNeedle = String(args.callee || "").toLowerCase();
    const routeNeedle = String(args.route || "").toLowerCase();
    const symbols = index.graph.symbols.filter((item) => {
      if (symbolNeedle && item.name.toLowerCase() !== symbolNeedle.toLowerCase()) return false;
      if (kindNeedle && item.kind !== kindNeedle) return false;
      if (languageNeedle && item.language !== languageNeedle) return false;
      if (pathNeedle && !item.file.toLowerCase().includes(pathNeedle)) return false;
      return true;
    }).slice(0, limit);
    const calls = index.graph.call_edges.filter((item) => !calleeNeedle || item.callee.toLowerCase().includes(calleeNeedle)).slice(0, limit);
    const routes = index.graph.route_edges.filter((item) => !routeNeedle || item.path.toLowerCase().includes(routeNeedle)).slice(0, limit);
    const imports = index.graph.import_edges.filter((item) => !pathNeedle || item.from.toLowerCase().includes(pathNeedle) || String(item.to || "").toLowerCase().includes(pathNeedle)).slice(0, limit);
    return {
      operation_result: "structural_query_complete",
      index_id: index.index_id,
      query: { symbol: args.symbol || null, kind: args.kind || null, language: args.language || null, path_contains: args.path_contains || null, callee: args.callee || null, route: args.route || null },
      symbols,
      calls,
      routes,
      imports,
      result_count: symbols.length + calls.length + routes.length + imports.length,
      parser_confidence_note: "AST-backed results are syntax-exact; cross-file call targets and non-JS/TS language results remain confidence-scored approximations."
    };
  }

  async exactReferences(args = {}) {
    const root = await this.#resolveRoot(args.root || ".");
    const index = await this.#ensureIndex(root, args);
    return findReferenceResult(index, args);
  }

  async renamePreview(args = {}) {
    const root = await this.#resolveRoot(args.root || ".");
    const index = await this.#ensureIndex(root, args);
    const symbolName = normalizeIdentifier(args.symbol);
    const newName = normalizeIdentifier(args.new_name);
    if (!symbolName || !newName) throw new StructuralCodeError("Both symbol and new_name are required.", "rename_symbol_required");
    if (!isSafeIdentifier(newName)) throw new StructuralCodeError("new_name must be a safe JavaScript/TypeScript identifier.", "rename_identifier_invalid", { new_name: args.new_name });
    if (symbolName === newName) throw new StructuralCodeError("The new symbol name must differ from the current name.", "rename_no_change");
    const requestedFile = args.file ? normalizePath(args.file) : null;
    const definitions = index.graph.symbols.filter((item) => item.name === symbolName && (!requestedFile || item.file === requestedFile));
    if (definitions.length !== 1) throw new StructuralCodeError("Rename preview requires exactly one matching definition. Supply file when names are ambiguous.", "rename_definition_ambiguous", { definitions: definitions.map(compactSymbol) });
    const target = definitions[0];
    if (target.parser_type !== "babel_ast") throw new StructuralCodeError("Automatic rename is supported only for AST-backed JavaScript/TypeScript symbols.", "rename_parser_not_exact", { parser_type: target.parser_type, confidence: target.confidence });
    if (!Number.isInteger(target.binding_start)) throw new StructuralCodeError("Automatic rename requires a resolved Babel lexical binding.", "rename_binding_not_resolved", { definition: compactSymbol(target) });
    const fileMap = new Map(index.files.map((item) => [item.path, item]));
    const edits = [];
    const impactedFiles = new Set([target.file]);
    const renamedBindings = new Map([[target.file, new Set([target.binding_start])]]);
    const uncertainties = [];
    const blockers = [];
    if (index.graph.truncation?.symbols || index.graph.truncation?.imports || index.graph.truncation?.exports) blockers.push({ code: "structural_graph_truncated", truncation: index.graph.truncation });
    if (target.exported && args.allow_public_api_change !== true) blockers.push({ code: "public_export_change_requires_acknowledgement", file: target.file, symbol: symbolName });
    addEdit(edits, target.file, target.name_start, target.name_end, newName, "definition");
    const targetFile = fileMap.get(target.file);
    for (const reference of targetFile.references.filter((item) => item.binding_start === target.binding_start)) {
      if (reference.context === "object_shorthand") blockers.push({ code: "object_shorthand_semantics_require_review", file: target.file, line: reference.line });
      addEdit(edits, target.file, reference.start, reference.end, newName, "same_file_bound_reference");
    }
    for (const exported of targetFile.exports.filter((item) => item.local === symbolName && !item.source)) {
      if (exported.local_start !== null) addEdit(edits, target.file, exported.local_start, exported.local_end, newName, "export_local");
      if (exported.exported === symbolName && exported.exported_start !== null) addEdit(edits, target.file, exported.exported_start, exported.exported_end, newName, "exported_name");
    }
    for (const edge of index.graph.import_edges.filter((item) => item.to === target.file)) {
      const analysis = fileMap.get(edge.from);
      if (["commonjs", "dynamic"].includes(edge.kind) || edge.specifiers.some((item) => item.imported === "*")) uncertainties.push({ code: "dynamic_or_namespace_consumer_not_rewritten", file: edge.from, line: edge.line, kind: edge.kind });
      for (const specifier of edge.specifiers.filter((item) => item.imported === symbolName)) {
        impactedFiles.add(edge.from);
        if (specifier.imported_start !== null) addEdit(edits, edge.from, specifier.imported_start, specifier.imported_end, newName, "imported_name");
        if (specifier.local === symbolName) {
          if (!Number.isInteger(specifier.local_start)) blockers.push({ code: "import_binding_not_resolved", file: edge.from, line: edge.line });
          if (!renamedBindings.has(edge.from)) renamedBindings.set(edge.from, new Set());
          renamedBindings.get(edge.from).add(specifier.local_start);
          if (specifier.local_start !== null) addEdit(edits, edge.from, specifier.local_start, specifier.local_end, newName, "import_binding");
          for (const reference of analysis.references.filter((item) => item.binding_start === specifier.local_start)) {
            if (reference.context === "object_shorthand") blockers.push({ code: "object_shorthand_semantics_require_review", file: edge.from, line: reference.line });
            addEdit(edits, edge.from, reference.start, reference.end, newName, "import_bound_reference");
          }
        }
      }
    }
    for (const edge of index.graph.export_edges.filter((item) => item.to === target.file && item.imported === symbolName)) {
      impactedFiles.add(edge.from);
      if (edge.imported_start !== null) addEdit(edits, edge.from, edge.imported_start, edge.imported_end, newName, "reexport_imported_name");
      if (edge.exported === symbolName && edge.exported_start !== null) addEdit(edits, edge.from, edge.exported_start, edge.exported_end, newName, "reexported_name");
    }
    for (const file of impactedFiles) {
      const analysis = fileMap.get(file);
      if (analysis.parse_errors.length) blockers.push({ code: "parse_error_in_impacted_file", file, errors: analysis.parse_errors });
      if (analysis.references_truncated) blockers.push({ code: "reference_index_truncated", file });
      const bindingStarts = renamedBindings.get(file) || new Set();
      const collisions = bindingStarts.size ? (analysis.bindings || []).filter((item) => item.name === newName && !bindingStarts.has(item.start)) : [];
      if (collisions.length) blockers.push({ code: "rename_collision", file, bindings: collisions.slice(0, 50) });
      const source = await readFile(path.join(root, file), "utf8");
      const covered = new Set(edits.filter((item) => item.file === file).map((item) => `${item.start}:${item.end}`));
      const intentionallyExcluded = new Set();
      for (const binding of (analysis.bindings || []).filter((item) => item.name === symbolName && !bindingStarts.has(item.start))) intentionallyExcluded.add(`${binding.start}:${binding.end}`);
      for (const reference of analysis.references.filter((item) => item.name === symbolName && !bindingStarts.has(item.binding_start))) intentionallyExcluded.add(`${reference.start}:${reference.end}`);
      for (const occurrence of identifierOccurrences(source, symbolName)) {
        const key = `${occurrence.start}:${occurrence.end}`;
        if (!covered.has(key) && !intentionallyExcluded.has(key)) uncertainties.push({ code: "unresolved_textual_occurrence", file, line: lineAt(source, occurrence.start) });
      }
    }
    const dedupedEdits = dedupeEdits(edits);
    if (!dedupedEdits.length) blockers.push({ code: "rename_has_no_edits", file: target.file });
    const inputHashes = {};
    for (const file of impactedFiles) inputHashes[file] = await sha256File(path.join(root, file));
    const verifyScripts = await selectVerificationScripts(root, args.verify_scripts || ["test"]);
    if (!verifyScripts.length) blockers.push({ code: "verification_script_required" });
    const affectedTests = impactedTestFiles(index, [...impactedFiles]);
    const previewId = `refactor-preview-${sha256(JSON.stringify({ root, target: target.id, newName, inputHashes, edits: dedupedEdits })).slice(0, 20)}`;
    const preview = {
      schema_version: 1,
      preview_id: previewId,
      root,
      operation: "rename",
      symbol: symbolName,
      new_name: newName,
      target,
      edits: dedupedEdits,
      impacted_files: [...impactedFiles].sort(),
      input_hashes: inputHashes,
      verify_scripts: verifyScripts,
      affected_tests: affectedTests,
      uncertainties: dedupeObjects(uncertainties).slice(0, 200),
      blockers,
      confidence: blockers.length ? "blocked" : uncertainties.length ? "medium" : "high"
    };
    this.previews.set(previewId, preview);
    return {
      operation_result: blockers.length ? "refactor_rename_blocked" : "refactor_rename_previewed",
      executed: false,
      preview_id: previewId,
      symbol: symbolName,
      new_name: newName,
      definition: compactSymbol(target),
      impacted_files: preview.impacted_files,
      edits: dedupedEdits.map(publicEdit),
      edit_count: dedupedEdits.length,
      affected_tests: affectedTests,
      verify_scripts: verifyScripts,
      uncertainties: preview.uncertainties,
      blockers,
      confidence: preview.confidence,
      public_api_change_acknowledged: !target.exported || args.allow_public_api_change === true,
      safe_to_apply: preview.confidence === "high",
      atomicity: "all files are staged before per-file atomic rename; any failure restores every original byte, but no filesystem offers cross-file atomicity"
    };
  }

  async movePreview(args = {}) {
    const root = await this.#resolveRoot(args.root || ".");
    const index = await this.#ensureIndex(root, args);
    const source = normalizePath(args.source_file);
    const target = normalizePath(args.target_file);
    const sourceAnalysis = index.files.find((item) => item.path === source);
    if (!sourceAnalysis) throw new StructuralCodeError("source_file is not in the structural index.", "move_source_not_found", { source_file: source });
    const targetAbsolute = path.resolve(root, target);
    if (!isInside(targetAbsolute, root)) throw new StructuralCodeError("target_file escapes the project root.", "move_target_outside_root");
    if (existsSync(targetAbsolute)) throw new StructuralCodeError("target_file already exists.", "move_target_exists", { target_file: target });
    if (!CODE_EXTENSIONS.has(path.extname(target).toLowerCase())) throw new StructuralCodeError("target_file must use a supported code extension.", "move_target_extension_unsupported");
    const importEdits = [];
    for (const edge of index.graph.import_edges.filter((item) => item.to === source)) {
      const replacement = relativeImportSpecifier(edge.from, target, edge.source);
      importEdits.push({ file: edge.from, line: edge.line, old_source: edge.source, new_source: replacement, confidence: "high" });
    }
    for (const imported of sourceAnalysis.imports.filter((item) => item.resolved)) {
      importEdits.push({ file: target, line: imported.line, old_source: imported.source, new_source: relativeImportSpecifier(target, imported.resolved, imported.source), confidence: "high", applies_after_move: true });
    }
    const packageBefore = packageForFile(index, source);
    const packageAfter = packageForFile(index, target);
    const boundaryChange = packageBefore?.name !== packageAfter?.name;
    return {
      operation_result: boundaryChange ? "refactor_move_review_required" : "refactor_move_previewed",
      executed: false,
      source_file: source,
      target_file: target,
      file_operation: { type: "move", from: source, to: target },
      import_edits: importEdits,
      incoming_imports: index.graph.import_edges.filter((item) => item.to === source).length,
      package_boundary: { before: packageBefore?.name || null, after: packageAfter?.name || null, changed: boundaryChange },
      affected_tests: impactedTestFiles(index, [source]),
      confidence: sourceAnalysis.parser_type === "babel_ast" && !boundaryChange ? "high" : "medium",
      uncertainties: [boundaryChange ? "The move crosses a package boundary and may require exports/dependency changes." : null, "Dynamic import strings, framework aliases, generated files, and external consumers require separate review."].filter(Boolean),
      apply_supported: false,
      safe_next_step: "Review this exact move and import plan; automatic move apply remains disabled until alias/package-export adapters are proven."
    };
  }

  async extractPlan(args = {}) {
    const root = await this.#resolveRoot(args.root || ".");
    const index = await this.#ensureIndex(root, args);
    const file = normalizePath(args.file);
    const analysis = index.files.find((item) => item.path === file);
    if (!analysis) throw new StructuralCodeError("file is not in the structural index.", "extract_file_not_found", { file });
    const startLine = clamp(args.start_line, 1, Number.MAX_SAFE_INTEGER, 1);
    const endLine = clamp(args.end_line, startLine, Number.MAX_SAFE_INTEGER, startLine);
    const selectedSymbols = analysis.symbols.filter((item) => item.start_line >= startLine && item.end_line <= endLine);
    const selectedNames = new Set(selectedSymbols.map((item) => item.name));
    const referencesInRange = analysis.references.filter((item) => item.line >= startLine && item.line <= endLine);
    const inputs = [...new Set(referencesInRange.map((item) => item.name).filter((name) => !selectedNames.has(name) && !isLanguageGlobal(name)))].sort();
    const outputs = selectedSymbols.filter((symbol) => analysis.references.some((item) => item.name === symbol.name && item.line > endLine)).map((item) => item.name);
    const newModule = normalizePath(args.new_module_path || `${file.replace(path.extname(file), "")}.extracted${path.extname(file)}`);
    if (!isInside(path.resolve(root, newModule), root) || !CODE_EXTENSIONS.has(path.extname(newModule).toLowerCase())) throw new StructuralCodeError("new_module_path must be a supported code file inside the project root.", "extract_target_invalid", { new_module_path: newModule });
    return {
      operation_result: "refactor_extract_planned",
      executed: false,
      file,
      range: { start_line: startLine, end_line: endLine },
      new_module_path: newModule,
      selected_symbols: selectedSymbols.map(compactSymbol),
      inferred_inputs: inputs,
      inferred_outputs: [...new Set(outputs)],
      call_sites: index.graph.call_edges.filter((item) => selectedNames.has(item.callee)).slice(0, 100),
      affected_tests: impactedTestFiles(index, [file]),
      confidence: analysis.parser_type === "babel_ast" && selectedSymbols.length ? "medium" : "low",
      apply_supported: false,
      uncertainties: ["Closure capture and mutation semantics require human review.", "Framework/compiler transforms and runtime reflection are not proven by syntax analysis."],
      safe_next_step: "Review inputs, outputs, call sites, and package boundary before creating a hash-bound patch transaction."
    };
  }

  async deadCodeCandidates(args = {}) {
    const root = await this.#resolveRoot(args.root || ".");
    const index = await this.#ensureIndex(root, args);
    const imported = new Set(index.graph.import_edges.flatMap((edge) => edge.specifiers.map((item) => `${edge.to || ""}#${item.imported}`)));
    const called = new Set(index.graph.call_edges.filter((item) => item.target_symbol_id).map((item) => item.target_symbol_id));
    const candidates = [];
    for (const symbol of index.graph.symbols) {
      const analysis = index.files.find((item) => item.path === symbol.file);
      if (!analysis || isTestFile(symbol.file) || symbol.kind === "method" || symbol.default_export || analysis.routes.length || analysis.components.some((item) => item.symbol === symbol.name)) continue;
      const sameFileRefs = analysis.references.filter((item) => Number.isInteger(symbol.binding_start) ? item.binding_start === symbol.binding_start : item.name === symbol.name).length;
      const externalImport = imported.has(`${symbol.file}#${symbol.name}`);
      const hasCall = called.has(symbol.id);
      if (externalImport || hasCall || sameFileRefs > 0) continue;
      candidates.push({ ...compactSymbol(symbol), exported: symbol.exported, confidence: symbol.exported ? "low" : symbol.parser_type === "babel_ast" ? "medium" : "low", reasons: ["no resolved imports", "no resolved call edge", "no same-file identifier reference"] });
    }
    return {
      operation_result: "dead_code_candidates_reported",
      candidates: candidates.slice(0, clamp(args.limit, 1, 1000, 200)),
      candidate_count: candidates.length,
      must_not_claim: ["A dead-code candidate is safe to delete.", "Dynamic imports, reflection, framework conventions, external consumers, templates, or generated code were fully resolved."],
      safe_next_step: "Review public exports, dynamic/runtime entrypoints, and affected tests before any deletion preview."
    };
  }

  async impactAnalyze(args = {}) {
    const root = await this.#resolveRoot(args.root || ".");
    const index = await this.#ensureIndex(root, args);
    const changed = new Set((args.changed_files || []).map(normalizePath));
    if (args.symbol) for (const item of index.graph.symbols.filter((symbol) => symbol.name === args.symbol)) changed.add(item.file);
    if (!changed.size) throw new StructuralCodeError("changed_files or symbol is required.", "impact_target_required");
    const impacted = reverseImportClosure(index.graph.import_edges, [...changed], clamp(args.max_depth, 1, 20, 6));
    const allFiles = [...new Set([...changed, ...impacted.files])].sort();
    const tests = impactedTestFiles(index, allFiles);
    const packages = [...new Set(allFiles.map((file) => packageForFile(index, file)?.name).filter(Boolean))];
    return {
      operation_result: "structural_impact_analyzed",
      changed_files: [...changed].sort(),
      impacted_files: allFiles,
      import_paths: impacted.paths.slice(0, 500),
      impacted_symbols: index.graph.symbols.filter((item) => allFiles.includes(item.file)).map(compactSymbol).slice(0, 500),
      impacted_routes: index.graph.route_edges.filter((item) => allFiles.includes(item.file)).slice(0, 200),
      impacted_components: index.graph.component_edges.filter((item) => allFiles.includes(item.file)).slice(0, 200),
      impacted_packages: packages,
      affected_tests: tests,
      confidence: index.files.filter((item) => allFiles.includes(item.path)).every((item) => item.parser_type === "babel_ast") ? "high_for_static_imports" : "mixed",
      limitations: ["Dynamic imports, reflection, runtime dependency injection, template references, and external package consumers may add impact not represented here."]
    };
  }

  async validatePatch(args = {}) {
    const root = await this.#resolveRoot(args.root || ".");
    const index = await this.#ensureIndex(root, { ...args, refresh: true });
    const changed = (args.changed_files || []).map(normalizePath);
    const files = index.files.filter((item) => !changed.length || changed.includes(item.path));
    const parseErrors = files.flatMap((item) => item.parse_errors.map((error) => ({ file: item.path, ...error })));
    const unresolvedRelative = index.graph.import_edges.filter((item) => (!changed.length || changed.includes(item.from)) && item.source.startsWith(".") && !item.to);
    const duplicateExports = [];
    for (const file of files) {
      const counts = new Map();
      for (const item of file.exports) counts.set(item.exported, (counts.get(item.exported) || 0) + 1);
      for (const [name, count] of counts) if (name && count > 1) duplicateExports.push({ file: file.path, name, count });
    }
    const checks = await selectVerificationScripts(root, args.verify_scripts || ["test"]);
    return {
      operation_result: parseErrors.length || unresolvedRelative.length || duplicateExports.length ? "structural_patch_invalid" : "structural_patch_valid",
      valid: !parseErrors.length && !unresolvedRelative.length && !duplicateExports.length,
      changed_files: changed,
      parse_errors: parseErrors,
      unresolved_relative_imports: unresolvedRelative.slice(0, 500),
      duplicate_exports: duplicateExports,
      affected_tests: impactedTestFiles(index, changed),
      verification_scripts: checks,
      tests_executed: false,
      limitations: ["Structural validation does not replace the project compiler, type checker, tests, build, or runtime acceptance proof."]
    };
  }

  async applyRefactor(args = {}) {
    const preview = this.previews.get(String(args.preview_id || ""));
    if (!preview) throw new StructuralCodeError("Refactor preview is missing or belongs to another server session.", "refactor_preview_not_found");
    if (preview.blockers.length) throw new StructuralCodeError("Refactor preview contains blocking findings.", "refactor_preview_blocked", { blockers: preview.blockers });
    if (preview.confidence !== "high" && !args.allow_uncertain) throw new StructuralCodeError("Refactor preview has unresolved uncertainty. Explicit allow_uncertain is required and remains unsupported for automatic apply.", "refactor_uncertainty_blocked", { uncertainties: preview.uncertainties });
    if (preview.confidence !== "high") throw new StructuralCodeError("Automatic refactor apply is limited to high-confidence AST previews.", "refactor_confidence_not_high");
    const root = await this.#resolveRoot(preview.root);
    const currentHashes = {};
    for (const file of preview.impacted_files) currentHashes[file] = await sha256File(path.join(root, file));
    if (!equalJson(currentHashes, preview.input_hashes)) throw new StructuralCodeError("Refactor inputs changed after preview.", "refactor_preview_stale", { expected: preview.input_hashes, current: currentHashes });
    if (args.dry_run !== false) return { operation_result: "refactor_apply_planned", executed: false, preview_id: preview.preview_id, files: preview.impacted_files, verification_scripts: preview.verify_scripts };
    const transactionId = `refactor-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
    const transactionRoot = path.join(this.evidenceRoot, "structural-code", "transactions", transactionId);
    const beforeRoot = path.join(transactionRoot, "before");
    await mkdir(beforeRoot, { recursive: true });
    const originals = {};
    const nextText = {};
    for (const file of preview.impacted_files) {
      const absolute = path.join(root, file);
      const text = await readFile(absolute, "utf8");
      const observedHash = sha256(text);
      if (observedHash !== preview.input_hashes[file]) throw new StructuralCodeError("A refactor input changed while the transaction backup was being prepared.", "refactor_preview_stale_during_backup", { file, expected: preview.input_hashes[file], current: observedHash });
      originals[file] = text;
      nextText[file] = applyTextEdits(text, preview.edits.filter((item) => item.file === file));
      const parsed = parseCodeFile(file, nextText[file]);
      if (parsed.parser_type !== "babel_ast" || parsed.parse_errors.length) throw new StructuralCodeError("A staged refactor file failed AST validation.", "refactor_staged_parse_failed", { file, errors: parsed.parse_errors });
      const backup = path.join(beforeRoot, file);
      await mkdir(path.dirname(backup), { recursive: true });
      await writeFile(backup, text, "utf8");
    }
    const record = { schema_version: 1, transaction_id: transactionId, preview_id: preview.preview_id, root, status: "staging", before_hashes: preview.input_hashes, after_hashes: null, files: preview.impacted_files, verify_scripts: preview.verify_scripts, verification: [], post_reference_check: null, rollback: null, created_at: new Date().toISOString() };
    await writeJson(path.join(transactionRoot, "transaction.json"), record);
    try {
      await atomicWriteMany(root, nextText, { expectedHashes: preview.input_hashes });
      record.status = "verifying";
      await writeJson(path.join(transactionRoot, "transaction.json"), record);
      record.verification = await this.#runVerification(root, preview.verify_scripts, args.timeout_ms);
      if (record.verification.some((item) => !item.execution?.ok)) throw new StructuralCodeError("An affected verification script failed.", "refactor_verification_failed", { verification: record.verification });
      if (record.verification.some((item) => item.execution?.worktree_delta_detected)) throw new StructuralCodeError("A verification script changed the Git worktree beyond the staged refactor.", "refactor_verification_mutated_worktree", { verification: record.verification });
      const { index } = await this.#refreshIndex(root, { refresh: true });
      const oldReferences = findReferenceResult(index, { symbol: preview.symbol, file: preview.target.file });
      const newReferences = findReferenceResult(index, { symbol: preview.new_name, file: preview.target.file });
      const oldStaticImports = index.graph.import_edges.filter((edge) => edge.to === preview.target.file && edge.specifiers.some((item) => item.imported === preview.symbol)).length;
      const oldStaticReexports = index.graph.export_edges.filter((edge) => edge.to === preview.target.file && edge.imported === preview.symbol).length;
      record.post_reference_check = { old_definition_count: oldReferences.definitions.length, old_high_confidence_references: oldReferences.references.filter((item) => item.confidence === "high").length, old_static_import_count: oldStaticImports, old_static_reexport_count: oldStaticReexports, new_definition_count: newReferences.definitions.length, new_reference_count: newReferences.references.length };
      if (record.post_reference_check.old_definition_count || record.post_reference_check.old_high_confidence_references || oldStaticImports || oldStaticReexports || record.post_reference_check.new_definition_count !== 1) throw new StructuralCodeError("Post-refactor reference checks did not prove the expected rename state.", "refactor_post_reference_failed", record.post_reference_check);
      record.after_hashes = {};
      for (const file of preview.impacted_files) record.after_hashes[file] = await sha256File(path.join(root, file));
      record.status = "completed";
      record.completed_at = new Date().toISOString();
      await writeJson(path.join(transactionRoot, "transaction.json"), record);
      return { operation_result: "refactor_completed", executed: true, transaction_id: transactionId, preview_id: preview.preview_id, changed_files: preview.impacted_files, verification: record.verification, post_reference_check: record.post_reference_check, rollback_available: true, transaction_manifest: normalizePath(path.relative(this.evidenceRoot, path.join(transactionRoot, "transaction.json"))), atomicity: "all staged files committed with automatic all-or-rollback semantics" };
    } catch (error) {
      const rollback = await restoreOriginals(root, originals);
      record.rollback = rollback;
      record.status = rollback.completed ? "failed_rolled_back" : "failed_rollback_incomplete";
      record.failure = serializeError(error);
      record.completed_at = new Date().toISOString();
      await writeJson(path.join(transactionRoot, "transaction.json"), record);
      await this.#refreshIndex(root, { refresh: true }).catch(() => {});
      throw new StructuralCodeError("Refactor apply or verification failed; rollback evidence is attached.", record.status, { transaction_id: transactionId, failure: record.failure, rollback });
    }
  }

  async rollback(args = {}) {
    const transactionId = String(args.transaction_id || "");
    if (!/^[A-Za-z0-9._-]+$/.test(transactionId)) throw new StructuralCodeError("Invalid refactor transaction id.", "refactor_transaction_id_invalid");
    const manifestPath = path.join(this.evidenceRoot, "structural-code", "transactions", transactionId, "transaction.json");
    if (!existsSync(manifestPath)) throw new StructuralCodeError("Refactor transaction was not found.", "refactor_transaction_not_found");
    const record = JSON.parse(await readFile(manifestPath, "utf8"));
    const requestedRoot = await this.#resolveRoot(args.root || ".");
    const root = await this.#resolveRoot(record.root);
    if (!sameResolvedPath(root, requestedRoot)) throw new StructuralCodeError("Refactor transaction belongs to another project root.", "refactor_transaction_root_mismatch", { requested_root: requestedRoot });
    if (!Array.isArray(record.files) || !record.files.length || record.files.some((file) => !isSafeRelativePath(file))) throw new StructuralCodeError("Refactor transaction contains an unsafe file path.", "refactor_transaction_files_invalid");
    if (record.status !== "completed" || !record.after_hashes) throw new StructuralCodeError("Only completed refactor transactions can be explicitly rolled back.", "refactor_transaction_not_rollbackable", { status: record.status });
    const current = {};
    for (const file of record.files) current[file] = await sha256File(path.join(root, file));
    if (!equalJson(current, record.after_hashes)) throw new StructuralCodeError("Refactor files changed after the transaction.", "refactor_rollback_stale", { expected: record.after_hashes, current });
    const preview = { operation_result: "refactor_rollback_planned", executed: false, transaction_id: transactionId, files: record.files, expected_current_hashes: record.after_hashes };
    if (args.dry_run !== false) return preview;
    const originals = {};
    const beforeRoot = path.join(path.dirname(manifestPath), "before");
    for (const file of record.files) {
      const backup = path.resolve(beforeRoot, file);
      if (!isInside(backup, beforeRoot)) throw new StructuralCodeError("Refactor backup path escapes its transaction.", "refactor_backup_path_invalid", { file });
      originals[file] = await readFile(backup, "utf8");
    }
    await atomicWriteMany(root, originals, { expectedHashes: record.after_hashes });
    const restoredHashes = {};
    for (const file of record.files) restoredHashes[file] = await sha256File(path.join(root, file));
    const hashesMatch = equalJson(restoredHashes, record.before_hashes);
    const verification = args.verify === false ? [] : await this.#runVerification(root, record.verify_scripts || [], args.timeout_ms);
    record.explicit_rollback = { completed_at: new Date().toISOString(), hashes_match: hashesMatch, verification };
    record.status = hashesMatch ? "rolled_back" : "rollback_incomplete";
    await writeJson(manifestPath, record);
    await this.#refreshIndex(root, { refresh: true });
    if (!hashesMatch) throw new StructuralCodeError("Refactor rollback hashes did not match original bytes.", "refactor_rollback_hash_mismatch", { expected: record.before_hashes, current: restoredHashes });
    return { ...preview, operation_result: verification.some((item) => !item.execution?.ok) ? "refactor_rollback_completed_verification_failed" : "refactor_rollback_completed", executed: true, hashes_match: true, verification };
  }

  async #runVerification(root, scripts, timeoutMs) {
    if (!this.commandRuntime) throw new StructuralCodeError("Project command runtime is unavailable.", "refactor_command_runtime_unavailable");
    const results = [];
    for (const script of scripts) {
      const review = await this.commandRuntime.reviewCommand({ root, mode: "project_script", script });
      const result = await this.commandRuntime.runCommand({ root, mode: "project_script", script, review_id: review.review_id, dry_run: false, approved: true, approval_note: "structural refactor affected verification", timeout_ms: clamp(timeoutMs, 1000, 300000, 120000) });
      results.push({ script, execution: result.execution, review: { review_id: review.review_id, policy_layer: review.policy_layer, exact_argv_bound: review.exact_argv_bound } });
    }
    return results;
  }

  async #ensureIndex(root, args = {}) {
    return (await this.#refreshIndex(root, { ...args, refresh: Boolean(args.refresh) })).index;
  }

  async #refreshIndex(root, args = {}) {
    let previous = this.indexes.get(root);
    if (!previous) {
      const stored = await loadJson(this.#indexPath(root));
      if (stored) previous = { ...stored, graph: stored.graph || buildGraph(stored.files || [], stored.packages || []) };
    }
    if (previous?.schema_version !== INDEX_SCHEMA_VERSION || previous.root !== root) previous = null;
    const started = performance.now();
    const inventory = await collectCodeFiles(root, { max_files: clamp(args.max_files, 1, MAX_FILES, 5000), max_file_bytes: clamp(args.max_file_bytes, 1024, 4 * MAX_FILE_BYTES, MAX_FILE_BYTES) });
    const previousFiles = new Map((previous?.files || []).map((item) => [item.path, item]));
    const analyses = [];
    let reused = 0;
    let reparsed = 0;
    for (const entry of inventory.files) {
      const old = previousFiles.get(entry.path);
      if (!args.refresh && old && old.size === entry.size && Math.trunc(old.mtime_ms) === Math.trunc(entry.mtime_ms)) {
        analyses.push(old);
        reused += 1;
        continue;
      }
      const absolute = path.join(root, entry.path);
      const buffer = await readFile(absolute);
      if (buffer.includes(0)) continue;
      const text = buffer.toString("utf8");
      if (isLikelyGeneratedCode(entry.path, text)) {
        inventory.skipped.push({ path: entry.path, reason: "generated_or_minified_bundle", confidence: "high" });
        continue;
      }
      analyses.push({ ...entry, sha256: sha256(buffer), ...parseCodeFile(entry.path, text) });
      reparsed += 1;
    }
    analyses.sort((a, b) => a.path.localeCompare(b.path));
    const packages = await collectPackageBoundaries(root, inventory.package_manifests);
    const graph = buildGraph(analyses, packages);
    const languageConfidence = {};
    for (const file of analyses) {
      const key = `${file.language}:${file.parser_type}:${file.confidence}`;
      languageConfidence[key] = (languageConfidence[key] || 0) + 1;
    }
    const index = {
      schema_version: INDEX_SCHEMA_VERSION,
      index_id: `structural-index-${sha256(`${root}:${analyses.map((item) => `${item.path}:${item.sha256}`).join("|")}`).slice(0, 20)}`,
      root,
      generated_at: new Date().toISOString(),
      parser_architecture: {
        selected: "adapter architecture with @babel/parser ASTs and @babel/traverse lexical bindings for JavaScript/TypeScript plus confidence-scored structural adapters for other languages",
        babel_parser_version: "7.29.7",
        babel_traverse_version: "7.29.7",
        tree_sitter_evaluation: "not selected for this phase because the JS/TS grammar packages require native install hooks and materially larger grammar/runtime artifacts; adapter boundary remains compatible with a future reviewed Tree-sitter backend",
        compiler_grade_claim: false
      },
      storage: { engine: "bounded_compact_json", path: normalizePath(path.relative(this.evidenceRoot, this.#indexPath(root))), graph_rebuilt_on_load: true, sqlite_evaluation: "not selected until repository-scale benchmarks show JSON rebuild/query latency or size is inadequate" },
      files: analyses,
      packages,
      graph,
      language_confidence: languageConfidence,
      limitations: ["Babel ASTs provide lexical bindings, not full compiler/type binding.", "Non-JS/TS adapters are heuristic and report lower confidence.", "Dynamic imports, reflection, templates, generated code, aliases, and external consumers may be absent from the graph.", Object.values(graph.truncation).some(Boolean) ? "One or more graph edge families reached the configured bound; exact refactor apply is blocked." : null].filter(Boolean),
      inventory: { skipped: inventory.skipped, truncated: inventory.truncated }
    };
    let persisted = persistableIndex(index);
    index.storage.persisted_bytes = Buffer.byteLength(JSON.stringify(persisted));
    persisted = persistableIndex(index);
    await writeJson(this.#indexPath(root), persisted, { compact: true });
    this.indexes.set(root, index);
    const removed = previous ? previous.files.filter((item) => !analyses.some((next) => next.path === item.path)).length : 0;
    return { index, build: { duration_ms: round(performance.now() - started), reused_files: reused, reparsed_files: reparsed, removed_files: removed, total_files: analyses.length, incremental: Boolean(previous) && !args.refresh, truncated: inventory.truncated } };
  }

  #indexPath(root) {
    return path.join(this.evidenceRoot, "structural-code", "indexes", `${sha256(root).slice(0, 20)}.json`);
  }

  async #resolveRoot(value) {
    const candidate = path.resolve(value);
    if (!existsSync(candidate)) throw new StructuralCodeError("Structural code root does not exist.", "structural_root_not_found", { root: candidate });
    const actual = await realpath(candidate);
    if (!this.allowedRoots.some((allowed) => isInside(actual, allowed))) throw new StructuralCodeError("Structural code root is outside allowed roots.", "structural_root_outside_allowed_roots");
    if (!(await stat(actual)).isDirectory()) throw new StructuralCodeError("Structural code root must be a directory.", "structural_root_not_directory");
    return actual;
  }
}

async function collectCodeFiles(root, options) {
  const files = [];
  const packageManifests = [];
  const skipped = [];
  let truncated = false;
  async function visit(directory) {
    if (files.length >= options.max_files) { truncated = true; return; }
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (files.length >= options.max_files) { truncated = true; break; }
      const absolute = path.join(directory, entry.name);
      const relative = normalizePath(path.relative(root, absolute));
      if (!relative || SECRET_FILE_PATTERN.test(relative)) { if (relative) skipped.push({ path: relative, reason: "secret_path" }); continue; }
      if (entry.isSymbolicLink()) { skipped.push({ path: relative, reason: "link" }); continue; }
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(entry.name.toLowerCase())) await visit(absolute);
        continue;
      }
      if (!entry.isFile()) continue;
      if (entry.name === "package.json") { packageManifests.push(relative); continue; }
      const extension = path.extname(entry.name).toLowerCase();
      if (!CODE_EXTENSIONS.has(extension)) continue;
      const info = await stat(absolute);
      if (info.size > options.max_file_bytes) { skipped.push({ path: relative, reason: "too_large", size: info.size }); continue; }
      const resolved = await realpath(absolute);
      if (!isInside(resolved, root) || !sameResolvedPath(absolute, resolved)) { skipped.push({ path: relative, reason: "link_or_escape" }); continue; }
      files.push({ path: relative, size: info.size, mtime_ms: info.mtimeMs });
    }
  }
  await visit(root);
  return { files: files.sort((a, b) => a.path.localeCompare(b.path)), package_manifests: packageManifests.sort(), skipped: skipped.slice(0, 500), truncated };
}

function parseCodeFile(file, text) {
  const extension = path.extname(file).toLowerCase();
  const language = LANGUAGE_BY_EXTENSION.get(extension) || "unknown";
  return AST_EXTENSIONS.has(extension) ? parseBabelFile(file, text, language, extension) : parseHeuristicFile(file, text, language);
}

function isLikelyGeneratedCode(file, text) {
  if (/(?:^|\/)assets\/(?:index|chunk|vendor)-[A-Za-z0-9_-]{6,}\.(?:[cm]?js|jsx)$/i.test(file)) return true;
  if (text.length < 100000) return false;
  const firstLines = text.split(/\r?\n/, 12);
  return firstLines.length <= 10 && firstLines.some((line) => line.length > 50000);
}

function parseBabelFile(file, text, language, extension) {
  let ast;
  try {
    const plugins = [];
    if ([".ts", ".tsx"].includes(extension)) plugins.push("typescript");
    if ([".jsx", ".tsx"].includes(extension)) plugins.push("jsx");
    plugins.push("decorators-legacy", "importAttributes");
    ast = parse(text, { sourceType: "unambiguous", errorRecovery: true, ranges: true, plugins, allowAwaitOutsideFunction: true, allowReturnOutsideFunction: true, attachComment: false });
  } catch (error) {
    return emptyAnalysis(language, "babel_ast_failed", "low", [{ message: truncate(error.message, 300), line: error.loc?.line || null, column: error.loc?.column || null }]);
  }
  const parseErrors = (ast.errors || []).map((error) => ({ message: truncate(error.message, 300), line: error.loc?.line || null, column: error.loc?.column || null }));
  const exportMeta = collectExportMetadata(ast.program);
  const symbols = [];
  const imports = collectBabelImports(ast.program);
  const exports = exportMeta.exports;
  const calls = [];
  const references = [];
  const routes = [];
  const apis = [];
  const components = [];
  const jsxOwners = new Set();
  const symbolByStart = new Map();
  walkAst(ast.program, null, null, (node, parent, activeSymbol) => {
    const symbol = babelSymbol(node, file, language, exportMeta);
    if (symbol && !symbolByStart.has(symbol.name_start)) {
      symbolByStart.set(symbol.name_start, symbol);
      symbols.push(symbol);
    }
    const nextActive = symbol || activeSymbol;
    if ((node.type === "JSXElement" || node.type === "JSXFragment") && nextActive) jsxOwners.add(nextActive.id);
    if (node.type === "CallExpression" || node.type === "OptionalCallExpression") {
      const callee = calleeName(node.callee);
      if (callee) calls.push({ caller_symbol_id: nextActive?.id || null, callee, file, line: node.loc?.start.line || null, confidence: callee.includes(".") ? "medium" : "syntax" });
      const source = stringValue(node.arguments?.[0]);
      if (callee === "require" && source) imports.push({ source, kind: "commonjs", line: node.loc?.start.line || null, specifiers: commonJsSpecifiers(parent), source_start: node.arguments[0].start, source_end: node.arguments[0].end });
      if (callee === "import" && source) imports.push({ source, kind: "dynamic", line: node.loc?.start.line || null, specifiers: [], source_start: node.arguments[0].start, source_end: node.arguments[0].end });
      const routeMatch = callee?.match(/^(?:app|router)\.(get|post|put|patch|delete|options|head|use)$/i);
      if (routeMatch && source) routes.push({ file, method: routeMatch[1].toUpperCase(), path: source, handler: calleeName(node.arguments?.[1]) || null, line: node.loc?.start.line || null, confidence: "high" });
      if (["fetch", "axios", "axios.get", "axios.post", "axios.put", "axios.patch", "axios.delete"].includes(callee) && source) apis.push({ file, client: callee, endpoint: source, line: node.loc?.start.line || null, confidence: "high_for_literal" });
    }
    return nextActive;
  });
  const bindingsByStart = new Map();
  const recordBinding = (binding) => {
    const bindingStart = Number.isInteger(binding?.identifier?.start) ? binding.identifier.start : null;
    if (bindingStart !== null && !bindingsByStart.has(bindingStart)) {
      bindingsByStart.set(bindingStart, {
        name: binding.identifier.name,
        start: bindingStart,
        end: binding.identifier.end,
        line: binding.identifier.loc?.start.line || null,
        kind: binding.kind || "unknown",
        scope_start: Number.isInteger(binding.scope?.block?.start) ? binding.scope.block.start : 0,
        constant: Boolean(binding.constant),
        reference_count: binding.referencePaths?.length || 0
      });
    }
    return bindingStart;
  };
  const recordReference = (node, binding, context) => {
    const bindingStart = recordBinding(binding);
    if (bindingStart === null) return;
    references.push({ name: node.name, file, line: node.loc?.start.line || null, start: node.start, end: node.end, context, binding_start: bindingStart, confidence: "high" });
  };
  try {
    traverse(ast, {
      Identifier(identifierPath) {
        const node = identifierPath.node;
        const binding = identifierPath.scope.getBinding(node.name);
        recordBinding(binding);
        if (identifierPath.isReferencedIdentifier()) recordReference(node, binding, referenceContext(identifierPath.parent));
      },
      JSXIdentifier(identifierPath) {
        const node = identifierPath.node;
        const parent = identifierPath.parent;
        if (!/^[A-Z]/.test(node.name) || (parent?.type === "JSXMemberExpression" && parent.property === node)) return;
        recordReference(node, identifierPath.scope.getBinding(node.name), "jsx_reference");
      }
    });
  } catch (error) {
    parseErrors.push({ message: `Lexical binding traversal failed: ${truncate(error.message, 240)}`, line: null, column: null });
  }
  const bindings = [...bindingsByStart.values()].sort((a, b) => a.start - b.start);
  for (const symbol of symbols) {
    const binding = bindingsByStart.get(symbol.name_start);
    symbol.binding_start = binding?.start ?? null;
    symbol.binding_kind = binding?.kind || null;
    symbol.scope_start = binding?.scope_start ?? null;
  }
  for (const symbol of symbols) if (jsxOwners.has(symbol.id) || (/^[A-Z]/.test(symbol.name) && ["class", "function", "arrow_function"].includes(symbol.kind))) components.push({ file, symbol: symbol.name, line: symbol.start_line, confidence: jsxOwners.has(symbol.id) ? "high" : "medium" });
  const dedupedReferences = dedupeObjects(references);
  return { language, parser_type: "babel_ast", confidence: parseErrors.length ? "ast_with_recovery" : "ast", parse_errors: parseErrors, symbols, bindings, imports, exports, calls, references: dedupedReferences.slice(0, 20000), references_truncated: dedupedReferences.length > 20000, routes, apis, components };
}

function parseHeuristicFile(file, text, language) {
  const definitions = heuristicPatterns(language);
  const symbols = [];
  const imports = [];
  const calls = [];
  const references = [];
  const routes = [];
  const apis = [];
  const components = [];
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let offset = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    for (const rule of definitions) {
      const match = line.match(rule.pattern);
      if (!match?.[1]) continue;
      const nameOffset = line.indexOf(match[1]);
      symbols.push({ id: symbolId(file, match[1], offset + nameOffset), name: match[1], kind: rule.kind, file, start_line: index + 1, end_line: index + 1, name_start: offset + nameOffset, name_end: offset + nameOffset + match[1].length, exported: false, default_export: false, language, parser_type: "heuristic", confidence: "medium" });
    }
    const importInfo = heuristicImport(language, line);
    if (importInfo) imports.push({ ...importInfo, line: index + 1, source_start: null, source_end: null, specifiers: importInfo.specifiers || [] });
    for (const match of line.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)) calls.push({ caller_symbol_id: null, callee: match[1], file, line: index + 1, confidence: "low" });
    offset += line.length + 1;
  }
  const symbolNames = new Set(symbols.map((item) => item.name));
  offset = 0;
  for (let index = 0; index < lines.length; index += 1) {
    for (const match of lines[index].matchAll(/\b([A-Za-z_$][\w$]*)\b/g)) if (symbolNames.has(match[1])) references.push({ name: match[1], file, line: index + 1, start: offset + match.index, end: offset + match.index + match[1].length, context: "heuristic_token", confidence: "low" });
    offset += lines[index].length + 1;
  }
  const bindings = symbols.map((item) => ({ name: item.name, start: item.name_start, end: item.name_end, line: item.start_line, kind: item.kind, scope_start: null, constant: false, reference_count: null }));
  return { language, parser_type: "heuristic", confidence: "medium", parse_errors: [], symbols, bindings, imports, exports: [], calls, references: references.slice(0, 10000), references_truncated: references.length > 10000, routes, apis, components };
}

function emptyAnalysis(language, parserType, confidence, errors = []) {
  return { language, parser_type: parserType, confidence, parse_errors: errors, symbols: [], bindings: [], imports: [], exports: [], calls: [], references: [], references_truncated: false, routes: [], apis: [], components: [] };
}

function collectExportMetadata(program) {
  const exportedNames = new Set();
  const defaultStarts = new Set();
  const exports = [];
  for (const statement of program.body || []) {
    if (statement.type === "ExportNamedDeclaration") {
      for (const identifier of declarationIdentifiers(statement.declaration)) {
        exportedNames.add(identifier.name);
        exports.push({ local: identifier.name, exported: identifier.name, source: null, line: identifier.loc?.start.line || statement.loc?.start.line || null, local_start: identifier.start ?? null, local_end: identifier.end ?? null, exported_start: identifier.start ?? null, exported_end: identifier.end ?? null });
      }
      for (const specifier of statement.specifiers || []) {
        const local = nodeName(specifier.local);
        const exported = nodeName(specifier.exported);
        if (local) exportedNames.add(local);
        exports.push({ local, exported, source: stringValue(statement.source), line: specifier.loc?.start.line || statement.loc?.start.line || null, local_start: specifier.local?.start ?? null, local_end: specifier.local?.end ?? null, exported_start: specifier.exported?.start ?? null, exported_end: specifier.exported?.end ?? null });
      }
    }
    if (statement.type === "ExportDefaultDeclaration") {
      if (statement.declaration?.start !== undefined) defaultStarts.add(statement.declaration.start);
      const name = nodeName(statement.declaration?.id) || nodeName(statement.declaration);
      if (name) exportedNames.add(name);
      exports.push({ local: name || "default", exported: "default", source: null, line: statement.loc?.start.line || null, local_start: statement.declaration?.id?.start ?? null, local_end: statement.declaration?.id?.end ?? null, exported_start: null, exported_end: null });
    }
  }
  return { exportedNames, defaultStarts, exports };
}

function collectBabelImports(program) {
  const imports = [];
  for (const statement of program.body || []) {
    if (statement.type !== "ImportDeclaration") continue;
    imports.push({
      source: stringValue(statement.source),
      kind: statement.importKind || "esm",
      line: statement.loc?.start.line || null,
      source_start: statement.source?.start ?? null,
      source_end: statement.source?.end ?? null,
      specifiers: (statement.specifiers || []).map((specifier) => ({
        imported: specifier.type === "ImportDefaultSpecifier" ? "default" : specifier.type === "ImportNamespaceSpecifier" ? "*" : nodeName(specifier.imported),
        local: nodeName(specifier.local),
        imported_start: specifier.imported?.start ?? specifier.local?.start ?? null,
        imported_end: specifier.imported?.end ?? specifier.local?.end ?? null,
        local_start: specifier.local?.start ?? null,
        local_end: specifier.local?.end ?? null
      }))
    });
  }
  return imports;
}

function babelSymbol(node, file, language, exportMeta) {
  let idNode = null;
  let kind = null;
  if (node.type === "FunctionDeclaration" && node.id) { idNode = node.id; kind = "function"; }
  else if (node.type === "ClassDeclaration" && node.id) { idNode = node.id; kind = "class"; }
  else if (node.type === "VariableDeclarator" && node.id?.type === "Identifier") { idNode = node.id; kind = ["ArrowFunctionExpression", "FunctionExpression"].includes(node.init?.type) ? "arrow_function" : "variable"; }
  else if (node.type === "TSInterfaceDeclaration" && node.id) { idNode = node.id; kind = "interface"; }
  else if (node.type === "TSTypeAliasDeclaration" && node.id) { idNode = node.id; kind = "type_alias"; }
  else if (node.type === "TSEnumDeclaration" && node.id) { idNode = node.id; kind = "enum"; }
  if (!idNode?.name) return null;
  return { id: symbolId(file, idNode.name, idNode.start), name: idNode.name, kind, file, start_line: node.loc?.start.line || idNode.loc?.start.line || null, end_line: node.loc?.end.line || idNode.loc?.end.line || null, name_start: idNode.start, name_end: idNode.end, exported: exportMeta.exportedNames.has(idNode.name), default_export: exportMeta.defaultStarts.has(node.start), language, parser_type: "babel_ast", confidence: "high" };
}

function walkAst(node, parent, activeSymbol, callback) {
  if (!node || typeof node !== "object" || typeof node.type !== "string") return;
  const nextActive = callback(node, parent, activeSymbol) || activeSymbol;
  for (const [key, value] of Object.entries(node)) {
    if (["loc", "start", "end", "extra", "errors", "comments", "tokens"].includes(key)) continue;
    if (Array.isArray(value)) for (const child of value) walkAst(child, node, nextActive, callback);
    else if (value && typeof value === "object" && typeof value.type === "string") walkAst(value, node, nextActive, callback);
  }
}

function buildGraph(files, packages) {
  const fileSet = new Set(files.map((item) => item.path));
  const allSymbols = files.flatMap((item) => item.symbols);
  const symbols = allSymbols.slice(0, MAX_GRAPH_EDGES);
  const definitions = new Map();
  for (const symbol of symbols) {
    if (!definitions.has(symbol.name)) definitions.set(symbol.name, []);
    definitions.get(symbol.name).push(symbol);
  }
  const importEdges = [];
  const exportEdges = [];
  const callEdges = [];
  const allRouteEdges = files.flatMap((item) => item.routes);
  const allComponentEdges = files.flatMap((item) => item.components);
  const allApiEdges = files.flatMap((item) => item.apis);
  for (const file of files) {
    for (const imported of file.imports) importEdges.push({ from: file.path, to: resolveImport(file.path, imported.source, fileSet), source: imported.source, kind: imported.kind, line: imported.line, specifiers: imported.specifiers, confidence: imported.source.startsWith(".") ? "high_if_resolved" : "external_package" });
    for (const exported of file.exports.filter((item) => item.source)) exportEdges.push({ from: file.path, to: resolveImport(file.path, exported.source, fileSet), source: exported.source, imported: exported.local, exported: exported.exported, line: exported.line, imported_start: exported.local_start, imported_end: exported.local_end, exported_start: exported.exported_start, exported_end: exported.exported_end, confidence: "high_if_resolved" });
    for (const call of file.calls) {
      const simple = call.callee.split(".").pop();
      const targets = definitions.get(simple) || [];
      callEdges.push({ ...call, target_symbol_id: targets.length === 1 ? targets[0].id : null, target_file: targets.length === 1 ? targets[0].file : null, confidence: targets.length === 1 && !call.callee.includes(".") ? "medium" : call.confidence });
    }
  }
  const testSourceEdges = importEdges.filter((item) => isTestFile(item.from) && item.to && !isTestFile(item.to)).map((item) => ({ test: item.from, source: item.to, confidence: item.confidence }));
  const packageEdges = [];
  const byName = new Map(packages.map((item) => [item.name, item]));
  for (const pkg of packages) for (const dependency of Object.keys(pkg.dependencies || {})) if (byName.has(dependency)) packageEdges.push({ from: pkg.name, to: dependency, kind: "workspace_dependency", confidence: "high" });
  return {
    symbols,
    import_edges: importEdges.slice(0, MAX_GRAPH_EDGES),
    export_edges: exportEdges.slice(0, MAX_GRAPH_EDGES),
    call_edges: callEdges.slice(0, MAX_GRAPH_EDGES),
    route_edges: allRouteEdges.slice(0, MAX_GRAPH_EDGES),
    component_edges: allComponentEdges.slice(0, MAX_GRAPH_EDGES),
    api_edges: allApiEdges.slice(0, MAX_GRAPH_EDGES),
    test_source_edges: testSourceEdges.slice(0, MAX_GRAPH_EDGES),
    package_edges: packageEdges.slice(0, MAX_GRAPH_EDGES),
    truncation: {
      symbols: allSymbols.length > MAX_GRAPH_EDGES,
      imports: importEdges.length > MAX_GRAPH_EDGES,
      exports: exportEdges.length > MAX_GRAPH_EDGES,
      calls: callEdges.length > MAX_GRAPH_EDGES,
      routes: allRouteEdges.length > MAX_GRAPH_EDGES,
      components: allComponentEdges.length > MAX_GRAPH_EDGES,
      apis: allApiEdges.length > MAX_GRAPH_EDGES,
      test_source: testSourceEdges.length > MAX_GRAPH_EDGES,
      package_edges: packageEdges.length > MAX_GRAPH_EDGES
    }
  };
}

async function collectPackageBoundaries(root, manifests) {
  const packages = [];
  for (const manifest of manifests) {
    try {
      const pkg = JSON.parse(await readFile(path.join(root, manifest), "utf8"));
      packages.push({ name: String(pkg.name || normalizePath(path.dirname(manifest)) || "<root>"), root: normalizePath(path.dirname(manifest)) === "." ? "" : normalizePath(path.dirname(manifest)), manifest, dependencies: { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}), ...(pkg.peerDependencies || {}), ...(pkg.optionalDependencies || {}) }, exports: pkg.exports ? Object.keys(typeof pkg.exports === "object" ? pkg.exports : { default: pkg.exports }) : [], main: pkg.main || null, type: pkg.type || null });
    } catch {}
  }
  return packages.sort((a, b) => a.root.length - b.root.length || a.name.localeCompare(b.name));
}

function findReferenceResult(index, args = {}) {
  const name = normalizeIdentifier(args.symbol);
  if (!name) throw new StructuralCodeError("symbol is required.", "reference_symbol_required");
  const requestedFile = args.file ? normalizePath(args.file) : null;
  const definitions = index.graph.symbols.filter((item) => item.name === name && (!requestedFile || item.file === requestedFile));
  const references = [];
  const uncertainties = [];
  const fileMap = new Map(index.files.map((item) => [item.path, item]));
  for (const definition of definitions) {
    const analysis = fileMap.get(definition.file);
    const sameFileReferences = Number.isInteger(definition.binding_start)
      ? analysis.references.filter((reference) => reference.binding_start === definition.binding_start)
      : analysis.references.filter((reference) => reference.name === name);
    for (const item of sameFileReferences) references.push({ ...item, binding: definition.id, confidence: definition.parser_type === "babel_ast" && Number.isInteger(definition.binding_start) ? "high" : "low" });
    for (const edge of index.graph.import_edges.filter((item) => item.to === definition.file)) {
      const importer = fileMap.get(edge.from);
      for (const specifier of edge.specifiers.filter((item) => item.imported === name)) {
        references.push({ name, file: edge.from, line: edge.line, start: specifier.imported_start, end: specifier.imported_end, context: "import_specifier", binding: definition.id, confidence: "high" });
        for (const item of importer.references.filter((reference) => reference.binding_start === specifier.local_start)) references.push({ ...item, imported_as: specifier.local, binding: definition.id, confidence: "high" });
      }
    }
  }
  if (definitions.length !== 1) uncertainties.push({ code: definitions.length ? "multiple_definitions" : "definition_not_found", definition_count: definitions.length });
  if (index.graph.truncation?.symbols || index.graph.truncation?.imports || index.graph.truncation?.exports) uncertainties.push({ code: "structural_graph_truncated", truncation: index.graph.truncation });
  const sameNameDefinitions = index.graph.symbols.filter((item) => item.name === name);
  if (sameNameDefinitions.length > definitions.length) uncertainties.push({ code: "same_name_definitions_outside_scope", count: sameNameDefinitions.length - definitions.length });
  const deduped = dedupeObjects(references);
  return { operation_result: "exact_symbol_references_reported", symbol: name, definitions: definitions.map(compactSymbol), references: deduped.slice(0, MAX_RESULTS), reference_count: deduped.length, confidence: definitions.length === 1 && definitions[0].parser_type === "babel_ast" && Number.isInteger(definitions[0].binding_start) && !uncertainties.length ? "high_for_babel_lexical_bindings_and_static_esm" : "mixed", uncertainties, must_not_claim: ["Babel lexical bindings are compiler-grade cross-language or type-system references.", "Dynamic imports, reflection, string/property references, generated code, or external consumers were fully resolved."] };
}

function graphSummary(index) {
  const graph = index.graph;
  return { symbols: graph.symbols.length, imports: graph.import_edges.length, exports: index.files.reduce((count, file) => count + file.exports.length, 0), reexports: graph.export_edges.length, calls: graph.call_edges.length, routes: graph.route_edges.length, components: graph.component_edges.length, apis: graph.api_edges.length, test_source: graph.test_source_edges.length, package_boundaries: index.packages.length, package_edges: graph.package_edges.length, truncation: graph.truncation };
}

function packageForFile(index, file) {
  return [...index.packages].sort((a, b) => b.root.length - a.root.length).find((pkg) => !pkg.root || file === pkg.root || file.startsWith(`${pkg.root}/`)) || null;
}

function impactedTestFiles(index, files) {
  const targets = new Set(files);
  const reverse = reverseImportClosure(index.graph.import_edges, files, 8).files;
  for (const item of reverse) targets.add(item);
  return [...new Set(index.graph.test_source_edges.filter((edge) => targets.has(edge.source) || targets.has(edge.test)).map((edge) => edge.test))].sort();
}

function reverseImportClosure(edges, seeds, maxDepth) {
  const seen = new Set(seeds);
  const queue = seeds.map((file) => ({ file, depth: 0, path: [file] }));
  const paths = [];
  while (queue.length) {
    const current = queue.shift();
    if (current.depth >= maxDepth) continue;
    for (const edge of edges.filter((item) => item.to === current.file)) {
      const nextPath = [edge.from, ...current.path];
      paths.push({ files: nextPath, confidence: edge.confidence });
      if (!seen.has(edge.from)) { seen.add(edge.from); queue.push({ file: edge.from, depth: current.depth + 1, path: nextPath }); }
    }
  }
  for (const seed of seeds) seen.delete(seed);
  return { files: [...seen], paths };
}

function resolveImport(from, source, fileSet) {
  if (!source?.startsWith(".")) return null;
  const base = normalizePath(path.posix.normalize(path.posix.join(path.posix.dirname(from), source)));
  const candidates = [base, ...[".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".py", ".go", ".rs"].map((ext) => `${base}${ext}`), ...[".js", ".jsx", ".mjs", ".ts", ".tsx", ".py"].map((ext) => `${base}/index${ext}`)];
  return candidates.find((candidate) => fileSet.has(candidate)) || null;
}

function relativeImportSpecifier(fromFile, targetFile, original) {
  let relative = normalizePath(path.posix.relative(path.posix.dirname(fromFile), targetFile));
  if (!relative.startsWith(".")) relative = `./${relative}`;
  const originalHasExtension = Boolean(path.extname(original));
  const targetExtension = path.extname(relative);
  if (!originalHasExtension && targetExtension) relative = relative.slice(0, -targetExtension.length);
  return relative;
}

function heuristicPatterns(language) {
  if (language === "python") return [{ kind: "class", pattern: /^\s*class\s+([A-Za-z_]\w*)/ }, { kind: "function", pattern: /^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)/ }];
  if (language === "go") return [{ kind: "function", pattern: /^\s*func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)/ }, { kind: "type", pattern: /^\s*type\s+([A-Za-z_]\w*)\s+(?:struct|interface)/ }];
  if (language === "rust") return [{ kind: "function", pattern: /^\s*(?:pub\s+)?(?:async\s+)?fn\s+([A-Za-z_]\w*)/ }, { kind: "type", pattern: /^\s*(?:pub\s+)?(?:struct|enum|trait)\s+([A-Za-z_]\w*)/ }];
  if (["java", "csharp", "kotlin", "c", "cpp"].includes(language)) return [{ kind: "class", pattern: /^\s*(?:public\s+|private\s+|protected\s+|internal\s+|abstract\s+|final\s+)*(?:class|interface|struct|enum)\s+([A-Za-z_]\w*)/ }, { kind: "function", pattern: /^\s*(?:public\s+|private\s+|protected\s+|static\s+|async\s+|virtual\s+|override\s+)*[\w<>,\[\]?*&:]+\s+([A-Za-z_]\w*)\s*\(/ }];
  if (["lua", "luau"].includes(language)) return [{ kind: "function", pattern: /^\s*(?:local\s+)?function\s+([A-Za-z_]\w*)/ }];
  if (language === "ruby") return [{ kind: "class", pattern: /^\s*class\s+([A-Za-z_]\w*)/ }, { kind: "function", pattern: /^\s*def\s+([A-Za-z_]\w*[!?=]?)/ }];
  if (language === "php") return [{ kind: "class", pattern: /^\s*(?:final\s+|abstract\s+)?class\s+([A-Za-z_]\w*)/ }, { kind: "function", pattern: /^\s*(?:public\s+|private\s+|protected\s+|static\s+)*function\s+([A-Za-z_]\w*)/ }];
  return [];
}

function heuristicImport(language, line) {
  let match;
  if (language === "python" && (match = line.match(/^\s*(?:from\s+([\w.]+)\s+import|import\s+([\w.]+))/))) return { source: match[1] || match[2], kind: "python", specifiers: [] };
  if (language === "go" && (match = line.match(/^\s*import\s+(?:\w+\s+)?["`]([^"`]+)["`]/))) return { source: match[1], kind: "go", specifiers: [] };
  if (language === "rust" && (match = line.match(/^\s*(?:use|mod)\s+([A-Za-z_][\w:]*)/))) return { source: match[1], kind: "rust", specifiers: [] };
  if (["java", "kotlin"].includes(language) && (match = line.match(/^\s*import\s+([\w.*]+)/))) return { source: match[1], kind: language, specifiers: [] };
  if (language === "csharp" && (match = line.match(/^\s*using\s+([\w.]+)/))) return { source: match[1], kind: "csharp", specifiers: [] };
  if (["lua", "luau"].includes(language) && (match = line.match(/require\s*\(?\s*["']([^"']+)["']/))) return { source: match[1], kind: language, specifiers: [] };
  if (language === "ruby" && (match = line.match(/^\s*require(?:_relative)?\s+["']([^"']+)["']/))) return { source: match[1], kind: "ruby", specifiers: [] };
  return null;
}

function declarationIdentifiers(node) {
  if (!node) return [];
  if (node.id?.type === "Identifier") return [node.id];
  if (node.type === "VariableDeclaration") return node.declarations.map((item) => item.id).filter((item) => item?.type === "Identifier");
  return [];
}

function commonJsSpecifiers(parent) {
  if (parent?.type === "VariableDeclarator" && parent.id?.type === "Identifier") return [{ imported: "default", local: parent.id.name, imported_start: null, imported_end: null, local_start: parent.id.start, local_end: parent.id.end }];
  return [];
}

function calleeName(node) {
  if (!node) return null;
  if (node.type === "Identifier") return node.name;
  if (node.type === "Import") return "import";
  if (node.type === "MemberExpression" || node.type === "OptionalMemberExpression") {
    const object = calleeName(node.object);
    const property = node.computed ? stringValue(node.property) : nodeName(node.property);
    return object && property ? `${object}.${property}` : property || object;
  }
  return null;
}

function nodeName(node) {
  return node?.name || node?.value || null;
}

function stringValue(node) {
  return typeof node?.value === "string" ? node.value : node?.type === "TemplateLiteral" && node.expressions?.length === 0 ? node.quasis?.[0]?.value?.cooked || null : null;
}

function referenceContext(parent) {
  if (!parent) return "identifier";
  if (parent.type === "ObjectProperty" && parent.shorthand) return "object_shorthand";
  if (parent.type === "CallExpression" || parent.type === "OptionalCallExpression") return parent.callee?.type === "Identifier" ? "call" : "call_argument";
  if (parent.type === "ReturnStatement") return "return";
  if (parent.type === "AssignmentExpression") return "assignment";
  return parent.type;
}

async function selectVerificationScripts(root, requested) {
  try {
    const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
    return [...new Set(requested.map(String))].filter((name) => SAFE_VERIFY_SCRIPTS.has(name) && Object.hasOwn(pkg.scripts || {}, name));
  } catch {
    return [];
  }
}

async function atomicWriteMany(root, textByFile, options = {}) {
  const stages = [];
  try {
    for (const [file, text] of Object.entries(textByFile)) {
      const target = path.resolve(root, file);
      if (!isInside(target, root)) throw new StructuralCodeError("Refactor target escapes the project root.", "refactor_target_outside_root", { file });
      const parent = await realpath(path.dirname(target));
      const actual = await realpath(target);
      const info = await lstat(target);
      if (!isInside(parent, root) || !isInside(actual, root) || info.isSymbolicLink() || !sameResolvedPath(actual, target)) {
        throw new StructuralCodeError("Refactor target resolves through a link or outside the project root.", "refactor_target_link_or_escape", { file });
      }
      if (!info.isFile()) throw new StructuralCodeError("Refactor target must remain a regular file.", "refactor_target_not_file", { file });
      const expectedHash = options.expectedHashes?.[file];
      if (expectedHash && await sha256File(actual) !== expectedHash) throw new StructuralCodeError("Refactor target changed while files were being staged.", "refactor_target_stale_during_stage", { file, expected: expectedHash });
      const stage = `${target}.vnem-stage-${randomUUID().slice(0, 8)}`;
      await writeFile(stage, text, "utf8");
      stages.push({ file, target, stage, expectedHash });
    }
    for (const item of stages) {
      if (item.expectedHash && await sha256File(item.target) !== item.expectedHash) throw new StructuralCodeError("Refactor target changed before staged commit.", "refactor_target_stale_before_commit", { file: item.file, expected: item.expectedHash });
    }
    for (const item of stages) await rename(item.stage, item.target);
  } finally {
    for (const item of stages) if (existsSync(item.stage)) await rm(item.stage, { force: true }).catch(() => {});
  }
}

async function restoreOriginals(root, originals) {
  const errors = [];
  try { await atomicWriteMany(root, originals); } catch (error) { errors.push({ message: truncate(error.message, 300) }); }
  const hashes = {};
  for (const file of Object.keys(originals)) hashes[file] = existsSync(path.join(root, file)) ? await sha256File(path.join(root, file)) : null;
  const expected = Object.fromEntries(Object.entries(originals).map(([file, text]) => [file, sha256(text)]));
  return { completed: !errors.length && equalJson(hashes, expected), hashes_match: equalJson(hashes, expected), errors };
}

function applyTextEdits(text, edits) {
  let output = text;
  for (const edit of [...edits].sort((a, b) => b.start - a.start || b.end - a.end)) {
    if (edit.start < 0 || edit.end < edit.start || edit.end > output.length) throw new StructuralCodeError("Refactor edit range is invalid.", "refactor_edit_range_invalid", publicEdit(edit));
    output = `${output.slice(0, edit.start)}${edit.replacement}${output.slice(edit.end)}`;
  }
  return output;
}

function addEdit(edits, file, start, end, replacement, reason) {
  if (!Number.isInteger(start) || !Number.isInteger(end)) return;
  edits.push({ file, start, end, replacement, reason });
}

function dedupeEdits(edits) {
  const map = new Map();
  for (const edit of edits) map.set(`${edit.file}:${edit.start}:${edit.end}`, edit);
  return [...map.values()].sort((a, b) => a.file.localeCompare(b.file) || a.start - b.start || a.end - b.end);
}

function publicEdit(edit) {
  return { file: edit.file, start: edit.start, end: edit.end, replacement: edit.replacement, reason: edit.reason };
}

function identifierOccurrences(text, name) {
  const results = [];
  const pattern = new RegExp(`\\b${escapeRegExp(name)}\\b`, "g");
  for (const match of text.matchAll(pattern)) results.push({ start: match.index, end: match.index + name.length });
  return results;
}

function lineAt(text, offset) {
  return text.slice(0, offset).split(/\r?\n/).length;
}

function compactSymbol(item) {
  return { id: item.id, name: item.name, kind: item.kind, file: item.file, start_line: item.start_line, end_line: item.end_line, exported: item.exported, default_export: item.default_export, language: item.language, parser_type: item.parser_type, confidence: item.confidence, binding_start: item.binding_start ?? null, binding_kind: item.binding_kind || null, scope_start: item.scope_start ?? null };
}

function symbolId(file, name, start) {
  return `${file}#${name}@${start}`;
}

function isTestFile(file) {
  return /(?:^|\/)(?:test|tests|__tests__)(?:\/|$)|(?:^|\/)test(?:[-_.][^/]*)?\.[^.]+$|\.(?:test|spec)\.[^.]+$/i.test(file);
}

function isLanguageGlobal(name) {
  return new Set(["console", "process", "require", "module", "exports", "Promise", "Array", "Object", "String", "Number", "Boolean", "Math", "JSON", "Date", "Error", "Set", "Map"]).has(name);
}

function isSafeIdentifier(value) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value) && !new Set(["break", "case", "catch", "class", "const", "continue", "debugger", "default", "delete", "do", "else", "export", "extends", "finally", "for", "function", "if", "import", "in", "instanceof", "let", "new", "return", "super", "switch", "this", "throw", "try", "typeof", "var", "void", "while", "with", "yield"]).has(value);
}

function normalizeIdentifier(value) {
  return String(value || "").trim();
}

function normalizePath(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function isSafeRelativePath(value) {
  if (typeof value !== "string" || !value) return false;
  const normalized = normalizePath(value);
  return normalized === value && !path.posix.isAbsolute(normalized) && !/^[A-Za-z]:/.test(normalized) && !normalized.split("/").includes("..");
}

function sameResolvedPath(left, right) {
  const a = path.resolve(left);
  const b = path.resolve(right);
  return process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function isInside(candidate, root) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function clamp(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.trunc(number))) : fallback;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function sha256File(file) {
  return sha256(await readFile(file));
}

function equalJson(left, right) {
  return JSON.stringify(canonicalJson(left)) === JSON.stringify(canonicalJson(right));
}

function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalJson(value[key])]));
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function truncate(value, max) {
  const text = String(value || "");
  return text.length <= max ? text : `${text.slice(0, max - 3)}...`;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function dedupeObjects(items) {
  const seen = new Set();
  return items.filter((item) => { const key = JSON.stringify(item); if (seen.has(key)) return false; seen.add(key); return true; });
}

function serializeError(error) {
  return { name: error.name || "Error", code: error.code || "error", message: truncate(error.message, 500), details: error.details || {} };
}

function persistableIndex(index) {
  const { graph: _graph, ...persisted } = index;
  return persisted;
}

async function writeJson(file, value, { compact = false } = {}) {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${randomUUID().slice(0, 8)}.tmp`;
  await writeFile(temp, `${compact ? JSON.stringify(value) : JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temp, file);
}

async function loadJson(file) {
  try { return JSON.parse(await readFile(file, "utf8")); } catch { return null; }
}
