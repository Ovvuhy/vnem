import { assertSafeToolResult, runtimeErrorResult } from "../runtime/errors.mjs";

const MUTATION_WORDS = /(?:^|_)(apply|append|create|commit|deploy|emit|execute|install|purge|request|restore|rollback|run|start|stop|update|write)(?:_|$)/;
const NETWORK_WORDS = /(?:github|cloudflare|fetch_url|web_search|external|api_request|browser)/;
const HARD_BLOCK_WORDS = /(?:force_push|repo_delete|protected_branch|package_publish|credential_export)/;

export class ToolRegistry {
  constructor({ serverName, version, implementationModule, behaviorTestReferences = {} }) {
    this.serverName = serverName;
    this.version = version;
    this.implementationModule = implementationModule;
    this.behaviorTestReferences = behaviorTestReferences;
    this.entries = new Map();
    this.aliases = new Map();
  }

  attach(server) {
    if (server.__vnemRegistry) return this;
    const registerTool = server.registerTool.bind(server);
    server.registerTool = (name, definition, handler) => this.define({ name, definition, handler }, registerTool);
    Object.defineProperty(server, "__vnemRegistry", { value: this, enumerable: false });
    return this;
  }

  define({ name, definition = {}, handler, metadata = {} }, registerTool) {
    if (this.entries.has(name)) throw new Error(`Duplicate VNEM tool name: ${name}`);
    const entry = normalizeEntry({
      name,
      version: metadata.version || this.version,
      definition,
      handler,
      implementationModule: metadata.implementation_module || this.implementationModule,
      metadata
    });
    if (!entry.behavior_test_references.length && this.behaviorTestReferences[name]) entry.behavior_test_references = [...this.behaviorTestReferences[name]];
    this.entries.set(name, entry);
    for (const alias of entry.compatibility_aliases) this.aliases.set(alias, name);
    const wrapped = async (...args) => {
      try {
        return assertSafeToolResult(await handler(...args), name, { mutation_started: entry.side_effect_class !== "read_only" });
      } catch (error) {
        return runtimeErrorResult(error, { tool_name: name, mutation_started: entry.side_effect_class !== "read_only" });
      }
    };
    registerTool(name, definition, wrapped);
    return entry;
  }

  validate({ requireBehaviorTests = false } = {}) {
    const errors = [];
    const warnings = [];
    for (const entry of this.entries.values()) {
      if (!entry.name || typeof entry.handler !== "function") errors.push(issue(entry.name, "missing_handler"));
      if (!entry.title || !entry.description) errors.push(issue(entry.name, "missing_description"));
      if (!entry.input_schema || typeof entry.input_schema !== "object") errors.push(issue(entry.name, "invalid_input_schema"));
      if (!entry.output_contract) errors.push(issue(entry.name, "missing_output_contract"));
      if (!entry.category) errors.push(issue(entry.name, "missing_category"));
      if (!entry.side_effect_class || !entry.permission_requirements.length) errors.push(issue(entry.name, "missing_permission_metadata"));
      if (entry.annotations.readOnlyHint && entry.annotations.destructiveHint) errors.push(issue(entry.name, "incompatible_annotations"));
      if (entry.side_effect_class !== "read_only" && entry.evidence_behavior === "none") errors.push(issue(entry.name, "missing_mutation_evidence_contract"));
      if (entry.side_effect_class !== "read_only" && entry.rollback_behavior.mode === "none") errors.push(issue(entry.name, "missing_rollback_rule"));
      if (entry.deprecation_state.deprecated && !entry.deprecation_state.migration_guidance) errors.push(issue(entry.name, "deprecated_without_migration"));
      if (!entry.behavior_test_references.length) (requireBehaviorTests ? errors : warnings).push(issue(entry.name, "behavior_test_reference_missing"));
      for (const alias of entry.compatibility_aliases) if (!this.aliases.has(alias)) errors.push(issue(entry.name, `invalid_alias:${alias}`));
    }
    return {
      valid: errors.length === 0,
      server_name: this.serverName,
      version: this.version,
      tool_count: this.entries.size,
      alias_count: this.aliases.size,
      errors,
      warnings,
      checked_contracts: ["duplicate names", "handlers", "schemas", "annotations", "permissions", "evidence", "rollback", "aliases", "deprecation", "behavior-test references", "output contract"]
    };
  }

  annotate(name, metadata = {}) {
    const entry = this.entries.get(name);
    if (!entry) throw new Error(`Cannot annotate missing VNEM tool: ${name}`);
    for (const key of ["behavior_test_references", "benchmark_scenarios", "compatibility_aliases"]) {
      if (metadata[key]) entry[key] = [...new Set(metadata[key])];
    }
    if (metadata.implementation_module) entry.implementation_module = metadata.implementation_module;
    return entry;
  }

  manifest() {
    return [...this.entries.values()].map(publicEntry);
  }

  status() {
    const validation = this.validate();
    return {
      schema_version: "1.0.0",
      server_name: this.serverName,
      version: this.version,
      valid: validation.valid,
      tool_count: this.entries.size,
      alias_count: this.aliases.size,
      categories: counts(this.manifest().map((entry) => entry.category)),
      side_effect_classes: counts(this.manifest().map((entry) => entry.side_effect_class)),
      validation,
      tools: this.manifest()
    };
  }
}

export function attachToolRegistry(server, options) {
  const registry = new ToolRegistry(options);
  registry.attach(server);
  return registry;
}

function normalizeEntry({ name, version, definition, handler, implementationModule, metadata }) {
  const annotations = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, ...(definition.annotations || {}) };
  const sideEffect = metadata.side_effect_class || inferSideEffect(name, annotations);
  const network = metadata.network_behavior || (NETWORK_WORDS.test(name) ? "bounded_or_approved_network" : "none");
  const evidence = metadata.evidence_behavior || (sideEffect === "read_only" ? "optional" : "required_redacted_record");
  return {
    name,
    version,
    title: definition.title || name,
    description: definition.description || "VNEM tool",
    category: metadata.category || inferCategory(name),
    input_schema: definition.inputSchema || {},
    output_contract: metadata.output_contract || "MCP content array with optional structuredContent; runtime errors use VNEM structured error schema",
    handler,
    annotations,
    side_effect_class: sideEffect,
    permission_requirements: metadata.permission_requirements || inferPermissions(sideEffect, network),
    network_behavior: network,
    credential_behavior: metadata.credential_behavior || (network === "none" ? "none" : "credential references only; values never returned"),
    evidence_behavior: evidence,
    rollback_behavior: metadata.rollback_behavior || inferRollback(name, sideEffect),
    compatibility_aliases: metadata.compatibility_aliases || [],
    deprecation_state: metadata.deprecation_state || { deprecated: false, migration_guidance: null },
    implementation_module: implementationModule,
    behavior_test_references: metadata.behavior_test_references || [],
    benchmark_scenarios: metadata.benchmark_scenarios || []
  };
}

function inferSideEffect(name, annotations) {
  if (HARD_BLOCK_WORDS.test(name)) return "hard_blocked";
  if (annotations.readOnlyHint === true) return "read_only";
  if (annotations.destructiveHint === true) return "destructive_mutation";
  if (NETWORK_WORDS.test(name) && MUTATION_WORDS.test(name)) return "network_mutation";
  if (MUTATION_WORDS.test(name)) return "local_mutation";
  return "read_only";
}

function inferPermissions(sideEffect, network) {
  if (sideEffect === "hard_blocked") return ["action_specific_acknowledgment", "hard_block_exception_policy"];
  if (sideEffect === "read_only" && network === "none") return ["allowed_root_read"];
  if (sideEffect === "read_only") return ["approved_network_read"];
  if (sideEffect === "network_mutation") return ["approved_network_mutation", "scoped_credential_reference"];
  return ["approved_local_mutation"];
}

function inferRollback(name, sideEffect) {
  if (sideEffect === "read_only") return { mode: "not_required", guidance: "No mutation occurs." };
  if (sideEffect === "hard_blocked") return { mode: "blocked", guidance: "The action is blocked before mutation." };
  if (/rollback|restore/.test(name)) return { mode: "self", guidance: "The tool is itself a rollback operation and must verify the restored state." };
  return { mode: "required_or_explicitly_not_available", guidance: "Return backup, compensating action, or explicit rollback-unavailable state in evidence." };
}

function inferCategory(name) {
  const value = name.replace(/^vnem_tools_|^vnem_/, "");
  for (const category of ["github", "cloudflare", "browser", "research", "source", "install", "permission", "project", "git", "api", "skill", "database", "game", "roblox", "windows", "evidence", "precision"] ) {
    if (value.includes(category)) return category;
  }
  return value.split("_")[0] || "general";
}

function publicEntry(entry) {
  const { handler, input_schema, ...safe } = entry;
  return { ...safe, input_schema_present: Boolean(input_schema && typeof input_schema === "object") };
}

function counts(values) {
  return Object.fromEntries([...new Set(values)].sort().map((value) => [value, values.filter((item) => item === value).length]));
}

function issue(tool, code) { return { tool, code }; }
