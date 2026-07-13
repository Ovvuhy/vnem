#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { buildOrchestrationPlan } from "../../lib/orchestration-framework.mjs";
import {
  activateCapabilityPack,
  applySkillGuidance,
  buildApiIntegrationPlan,
  boostTask,
  composeCapabilityContract,
  getRequiredCapabilities,
  prepareToolsHandoff
} from "../../lib/capability-modules.mjs";
import { getAgentProfile, loadAgentProfiles } from "../../lib/agent-profiles.mjs";
import {
  buildDomainQualityContracts,
  completionAudit,
  detectMissingContext,
  proofTrail,
  protectionReview
} from "../../lib/quality-contracts.mjs";
import {
  apiSafetyProfile,
  buildLibraryStatus,
  loadSuperLibrary,
  recommendApis,
  recommendSkills,
  reviewCapability,
  searchApis,
  searchSkills,
  skillSafetyProfile
} from "../../lib/super-library.mjs";
import { buildInstallAdoptionGuide, formatInstallAdoptionGuide } from "../../vnem-install-adoption.mjs";
import { attachToolRegistry } from "../registry/tool-registry.mjs";
import { loadBehaviorTestReferences } from "../registry/behavior-contracts.mjs";
import { registerRegistryStatusTool } from "../runtime/registry-tool.mjs";
import {
  assessCoreCompatibility,
  buildCoreEntrypoint as buildIntelligentCoreEntrypoint,
  buildCoreUsageContract as buildIntelligentUsageContract,
  classifyAdoptionTask as classifyIntelligentCoreTask,
  continueFromToolsEvidence,
  coreRecommendedToolsCalls as recommendIntelligentTools,
  formatCoreEntrypoint as formatIntelligentCoreEntrypoint,
  getCoreDecisionDetails
} from "./intelligence.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = process.env.VNEM_ROOT
  ? path.resolve(process.env.VNEM_ROOT)
  : path.resolve(scriptDir, "..", "..", "..");

const TRUST_TIERS = ["verified", "promising", "unreviewed", "watchlist", "deprecated"];
const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false
};
const CORE_ENVIRONMENT_SCHEMA = z.object({
  os: z.string().optional(),
  shell: z.string().optional(),
  node_version: z.string().optional(),
  package_manager: z.string().optional(),
  framework: z.string().optional(),
  client: z.string().optional(),
  mcp_transport: z.string().optional(),
  project_type: z.string().optional(),
  game_version: z.string().optional(),
  mod_loader: z.string().optional(),
  file_format: z.string().optional(),
  api_auth: z.string().optional(),
  provider_version: z.string().optional(),
  github_permissions: z.string().optional(),
  browser_available: z.string().optional()
}).default({});
const CORE_COMPATIBILITY_FACT_SCHEMA = z.object({
  dimension: z.string().min(1),
  value: z.string().optional(),
  status: z.enum(["verified", "supported", "observed_unverified", "unknown", "incompatible"]).default("observed_unverified"),
  evidence: z.string().optional(),
  scope: z.string().optional()
});
const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "how",
  "i",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "this",
  "to",
  "use",
  "using",
  "we",
  "with"
]);

const DEFAULT_MCP_TOOLS = [
  "vnem_bootstrap",
  "vnem_entrypoint",
  "vnem_decision_details",
  "vnem_continue_from_tools_evidence",
  "vnem_compatibility_assess",
  "vnem_usage_contract",
  "vnem_mcp_visibility_doctor",
  "vnem_underuse_detector",
  "vnem_install_adoption_guide",
  "vnem_library_status",
  "vnem_search_skills",
  "vnem_recommend_skills",
  "vnem_search_apis",
  "vnem_recommend_apis",
  "vnem_review_skill_or_api",
  "vnem_api_safety_profile",
  "vnem_skill_safety_profile",
  "vnem_get_required_capabilities",
  "vnem_activate_capability_pack",
  "vnem_apply_skill_guidance",
  "vnem_boost_task",
  "vnem_route_task",
  "vnem_output_quality_plan",
  "vnem_anti_stagnation_check",
  "vnem_plan_effort_budget",
  "vnem_fast_answer_contract",
  "vnem_design_ambition_plan",
  "vnem_visual_taste_audit",
  "vnem_redesign_comparison_scorecard",
  "vnem_total_impact_design_plan",
  "vnem_design_direction_selector",
  "vnem_compact_output_contract",
  "vnem_build_debugging_plan",
  "vnem_evidence_to_fix_check",
  "vnem_build_architecture_map",
  "vnem_code_change_contract",
  "vnem_build_ui_quality_plan",
  "vnem_visual_proof_contract",
  "vnem_select_tools_for_task",
  "vnem_build_tools_plan",
  "vnem_build_browser_research_plan",
  "vnem_assess_research_need",
  "vnem_build_search_plan",
  "vnem_build_browsing_plan",
  "vnem_build_research_strategy",
  "vnem_build_source_ingestion_plan",
  "vnem_research_evidence_audit",
  "vnem_explain_tools_chain",
  "vnem_prepare_tools_handoff",
  "vnem_build_api_integration_plan",
  "vnem_get_agent_profile",
  "vnem_compose_capability_contract",
  "vnem_completion_audit",
  "vnem_protection_review",
  "vnem_proof_trail",
  "vnem_status",
  "vnem_overview",
  "vnem_route_intent",
  "vnem_get_source",
  "vnem_search",
  "vnem_recommend",
  "vnem_quality_gate",
  "vnem_orchestrate",
  "vnem_get_entry",
  "vnem_compare",
  "vnem_best_practices",
  "vnem_sources"
];
const DEFAULT_MCP_RESOURCES = [
  "vnem://install/search-index",
  "vnem://install/source-radar",
  "vnem://api/index",
  "vnem://install/operating-protocol",
  "vnem://install/install-guide",
  "vnem://install/quality-contract",
  "vnem://install/orchestration-protocol",
  "vnem://install/precision-execution-protocol",
  "vnem://install/omniscient-self-healing-protocol",
  "vnem://install/coding-protocol",
  "vnem://install/coding-playbooks",
  "vnem://install/task-rubrics",
  "vnem://install/design-architecture",
  "vnem://install/visual-qa-protocol",
  "vnem://install/best-practices",
  "vnem://install/agent-workspace",
  "vnem://install/prompt-engineering",
  "vnem://install/prompt-patterns",
  "vnem://discovery/daily-digest",
  "vnem://repo/readme",
  "vnem://repo/product",
  "vnem://repo/security-roadmap",
  "vnem://repo/hermes",
  "vnem://repo/contributing",
  "vnem://entries/{slug}"
];

const packageJson = await readJsonOptional("package.json");
const searchIndexPath = firstExisting([
  "public/install/search-index.json",
  ".vnem/search-index.json"
]);
const apiIndexPath = firstExisting(["public/api/index.json"]);
const searchIndex = await readJsonRequired(searchIndexPath, "search index");
const apiIndex = apiIndexPath ? await readJsonOptional(apiIndexPath) : null;
const superLibrary = await loadSuperLibrary(rootDir);
const agentProfiles = await loadAgentProfiles(rootDir);
const entries = Array.isArray(apiIndex?.entries) ? apiIndex.entries : [];
const documents = Array.isArray(searchIndex.documents) ? searchIndex.documents : [];
const sourceRadar = Array.isArray(searchIndex.source_radar) ? searchIndex.source_radar : [];
const entriesBySlug = new Map(entries.map((entry) => [entry.slug, entry]));
const documentsById = new Map(documents.map((document) => [document.id, document]));
const sourceRadarById = new Map(sourceRadar.map((source) => [source.id, source]));

const server = new McpServer(
  {
    name: "vnem",
    version: packageJson?.version || "0.1.0"
  },
  {
    instructions:
      "Use vnem as a read-only AI booster and perception layer before coding, recommending tools, or changing a stack. For coding tasks, call vnem_recommend and apply the Triple-Check Workflow: Analyze the user's true goal and hidden requirements, Architect performance and visuals/playability together, then Review that no important domain was sacrificed. For complex app, game, or research tasks, call vnem_orchestrate to choose a deterministic Single Agent, Orchestrator-Worker, or Split-and-Merge plan before burning context. If a separate opt-in precision server is available, read vnem://install/precision-execution-protocol before exact patching, current-doc fetches, or safe terminal checks, and read vnem://install/omniscient-self-healing-protocol before semantic code search, red/green healing loops, or ephemeral scripting. vnem returns provenance, trust tiers, deterministic quality gates, and orchestration schemas; this default server never installs packages, edits code, calls secrets, spawns model workers, or reaches the network."
  }
);
const coreRegistry = attachToolRegistry(server, {
  serverName: "vnem",
  version: packageJson?.version || "0.1.0",
  implementationModule: "scripts/vnem/core/server.mjs",
  behaviorTestReferences: loadBehaviorTestReferences(rootDir, "vnem")
});

registerResources(server);
registerPrompts(server);
registerTools(server);
for (const [name, benchmarkScenarios] of Object.entries({
  vnem_entrypoint: ["mixed app and UI", "package upgrade and CI repair", "API integration and credential safety", "Windows troubleshooting and project automation"],
  vnem_decision_details: ["compact default with detail retrieval by decision id"],
  vnem_continue_from_tools_evidence: ["complete evidence", "failed check rerun", "claim overreach", "user-input blocker"],
  vnem_compatibility_assess: ["Windows shell scope", "MCP client transport", "game version and mod-loader scope", "API auth scope"]
})) {
  coreRegistry.annotate(name, {
    implementation_module: "scripts/vnem/core/intelligence.mjs",
    benchmark_scenarios: benchmarkScenarios
  });
}
registerRegistryStatusTool(server, coreRegistry, { name: "vnem_registry_status", title: "VNEM Core Registry Status" });
const coreRegistryValidation = coreRegistry.validate();
if (!coreRegistryValidation.valid) throw new Error(`VNEM Core registry validation failed: ${JSON.stringify(coreRegistryValidation.errors)}`);

export async function startCoreServer() {
  await server.connect(new StdioServerTransport());
}

function registerTools(mcpServer) {
  mcpServer.registerTool(
    "vnem_bootstrap",
    {
      title: "Bootstrap vnem For A Task",
      description:
        "Activate VNEM's read-only task-aware handshake for an agent. Returns routing, rules, next MCP calls, protection needs, verification expectations, completion-audit fields, and anti-placebo proof without mutating files or exposing precision tools.",
      inputSchema: {
        task: z.string().min(1).describe("User task or project goal to activate VNEM for."),
        agent_client: z
          .string()
          .optional()
          .describe("Optional agent client name, such as codex, hermes, claude-code, cursor, windsurf, cline, gemini-cli, or unknown."),
        project_context: z.string().optional().describe("Optional local project context, constraints, stack, or known risks."),
        available_tools: z.array(z.string()).default([]).describe("Optional list of tools the calling agent can use."),
        risk_tolerance: z.enum(["low", "normal", "high"]).default("normal"),
        desired_output: z.string().optional().describe("Optional desired deliverable or final artifact shape."),
        include_resources: z.boolean().default(true).describe("Include rule/resource identifiers and URIs."),
        include_next_calls: z.boolean().default(true).describe("Include recommended next VNEM MCP calls.")
      },
      annotations: READ_ONLY
    },
    async (args) => {
      const bootstrap = buildBootstrap(args);
      return toolResult(formatBootstrap(bootstrap), bootstrap);
    }
  );

  mcpServer.registerTool(
    "vnem_entrypoint",
    {
      title: "VNEM Entrypoint",
      description:
        "VNEM first-call entrypoint: recommend, route, and choose the next action across Core MCP and Tools handoff for repo, code, proof, MCP, GitHub, browser, recovery, and tooling tasks.",
      inputSchema: {
        user_goal: z.string().min(1).describe("User goal or task to classify and route."),
        task_context: z.string().default("").describe("Optional compact project context, constraints, failures, or known state."),
        available_mcp_names: z.array(z.string()).default([]).describe("Known MCP server names available to the calling agent."),
        available_tool_names: z.array(z.string()).default([]).describe("Optional exact tool names visible to the calling client."),
        allowed_tool_names: z.array(z.string()).default([]).describe("Optional exact tool names allowed by the active permission state."),
        user_constraints: z.array(z.string()).default([]).describe("Explicit user constraints that must influence routing and stop conditions."),
        repo_signals: z.array(z.string()).default([]).describe("Compact repository signals such as frameworks, scripts, files, or failing checks."),
        environment: CORE_ENVIRONMENT_SCHEMA.describe("Task-scoped compatibility context. Values are caller-provided and not treated as universal facts."),
        compatibility_facts: z.array(CORE_COMPATIBILITY_FACT_SCHEMA).default([]),
        tools_evidence_summary: z.any().default({}).describe("Optional compact Tools evidence packet for completion-aware continuation."),
        task_mode: z
          .enum(["auto", "answer_only", "repo_inspection", "implementation", "project_automation", "terminal", "debugging", "validation", "publish", "recovery", "research", "ui_browser", "patch_targeting", "mcp_tool_audit", "evidence_pack", "no_placebo", "cloudflare", "windows", "package", "api", "skill", "database", "game_modding", "client_setup"])
          .default("auto")
      },
      annotations: READ_ONLY
    },
    async (args) => {
      const entrypoint = buildIntelligentCoreEntrypoint(args);
      return toolResult(formatIntelligentCoreEntrypoint(entrypoint), { entrypoint });
    }
  );

  mcpServer.registerTool(
    "vnem_decision_details",
    {
      title: "VNEM Decision Details",
      description: "Retrieve session-scoped scored domains, compatibility, capability effects, tool states, completion criteria, and gaps for a compact vnem_entrypoint decision id.",
      inputSchema: {
        decision_id: z.string().min(1),
        sections: z.array(z.enum(["input_summary", "classification", "compatibility", "material_missing_context", "safe_assumptions", "capability_packs", "tool_sequence", "permission_implications", "evidence_requirements", "completion_criteria", "stop_conditions", "unavailable_capabilities", "evidence_continuation"])).default([])
      },
      annotations: READ_ONLY
    },
    async (args) => {
      const details = getCoreDecisionDetails(args);
      return toolResult(`vnem_decision_details: found=${details.found}; decision_id=${details.decision_id}`, { decision_details: details });
    }
  );

  mcpServer.registerTool(
    "vnem_continue_from_tools_evidence",
    {
      title: "Continue From VNEM Tools Evidence",
      description: "Consume a compact Tools evidence summary and decide completion, remaining requirements, reruns, claim overreach, blockers, user-input need, and the smallest next action without executing Tools.",
      inputSchema: {
        decision_id: z.string().default(""),
        task: z.string().default(""),
        completion_criteria: z.array(z.any()).default([]),
        evidence_summary: z.any().default({})
      },
      annotations: READ_ONLY
    },
    async (args) => {
      const continuation = continueFromToolsEvidence(args);
      return toolResult(`vnem_continue_from_tools_evidence: ${continuation.completion_state}; next=${continuation.smallest_next_action}`, { evidence_continuation: continuation });
    }
  );

  mcpServer.registerTool(
    "vnem_compatibility_assess",
    {
      title: "Assess VNEM Compatibility",
      description: "Build a task-scoped compatibility assessment across OS, shell, runtime, package manager, framework, client, MCP transport, game/mod loader, API auth, GitHub permissions, and browser availability with evidence and unknown boundaries.",
      inputSchema: {
        task: z.string().min(1),
        task_context: z.string().default(""),
        environment: CORE_ENVIRONMENT_SCHEMA,
        compatibility_facts: z.array(CORE_COMPATIBILITY_FACT_SCHEMA).default([])
      },
      annotations: READ_ONLY
    },
    async (args) => {
      const compatibility = assessCoreCompatibility(args);
      return toolResult(`vnem_compatibility_assess: constraints=${compatibility.constraints.length}; conflicts=${compatibility.conflicts.length}; unknown=${compatibility.unknowns.length}`, { compatibility });
    }
  );

  mcpServer.registerTool(
    "vnem_usage_contract",
    {
      title: "VNEM Usage Contract",
      description:
        "Machine-readable VNEM first-call usage contract: when to use Core MCP, when to route to Tools handoff, exact next tool calls, proof requirements, and safety limits.",
      inputSchema: {
        user_goal: z.string().default("").describe("Optional user goal to bias the route examples."),
        available_mcp_names: z.array(z.string()).default([]).describe("Known MCP server names available to the calling agent.")
      },
      annotations: READ_ONLY
    },
    async (args) => {
      const usageContract = buildIntelligentUsageContract(args);
      return toolResult(formatCoreUsageContract(usageContract), { usage_contract: usageContract });
    }
  );

  mcpServer.registerTool(
    "vnem_mcp_visibility_doctor",
    {
      title: "VNEM MCP Visibility Doctor",
      description:
        "VNEM first-call visibility doctor for AI clients: verify Core MCP and Tools MCP discoverability, entrypoints, route readiness, repo/code/proof handoff, and exact next action.",
      inputSchema: {
        available_mcp_names: z.array(z.string()).default([]),
        available_tool_names: z.array(z.string()).default([]),
        user_goal: z.string().default(""),
        client_name: z.string().default("unknown")
      },
      annotations: READ_ONLY
    },
    async (args) => {
      const doctor = buildCoreVisibilityDoctor(args);
      return toolResult(formatCoreVisibilityDoctor(doctor), { visibility_doctor: doctor });
    }
  );

  mcpServer.registerTool(
    "vnem_underuse_detector",
    {
      title: "VNEM Underuse Detector",
      description:
        "VNEM diagnostic pressure tool: detects underuse for repo, code, debug, GitHub, tooling, MCP, and proof tasks, then recommends the exact next VNEM Core or Tools MCP call.",
      inputSchema: {
        user_goal: z.string().min(1),
        recent_actions: z.array(z.string()).default([]),
        available_mcp_names: z.array(z.string()).default([]),
        task_type: z.string().default("auto")
      },
      annotations: READ_ONLY
    },
    async (args) => {
      const detector = buildCoreUnderuseDetector(args);
      return toolResult(formatCoreUnderuseDetector(detector), { underuse_detector: detector });
    }
  );

  mcpServer.registerTool(
    "vnem_install_adoption_guide",
    {
      title: "VNEM Install Adoption Guide",
      description:
        "VNEM Core MCP install adoption guide for connecting both Core and Tools MCP to Codex, Claude, Antigravity-style IDE agents, and generic MCP stdio clients without guessing config paths or writing outside the repo.",
      inputSchema: {
        client: z.enum(["codex", "claude", "antigravity", "generic"]).default("generic"),
        root: z.string().default(rootDir).describe("VNEM checkout root used for generated MCP command paths.")
      },
      annotations: READ_ONLY
    },
    async (args) => {
      const guide = buildInstallAdoptionGuide({ client: args.client, root: args.root || rootDir });
      return toolResult(formatInstallAdoptionGuide(guide), { install_adoption_guide: guide });
    }
  );

  mcpServer.registerTool(
    "vnem_library_status",
    {
      title: "VNEM Super MCP Library Status",
      description:
        "Show VNEM's read-only Super MCP skill/API capability-library status, counts, sources, normalization boundary, and safety limits.",
      inputSchema: {},
      annotations: READ_ONLY
    },
    async () => {
      const status = buildLibraryStatus(superLibrary);
      return toolResult(formatLibraryStatus(status), status);
    }
  );

  mcpServer.registerTool(
    "vnem_search_skills",
    {
      title: "Search VNEM Skill Capabilities",
      description:
        "Search VNEM-normalized AI-agent skill/capability-pack records with provenance, compatibility, risk flags, and review warnings. Does not install skills.",
      inputSchema: {
        query: z.string().min(1),
        task_type: z.string().optional(),
        agent_client: z.string().optional(),
        category: z.string().optional(),
        trust_level: z.string().optional(),
        include_risky: z.boolean().default(false),
        limit: z.number().int().min(1).max(20).default(8)
      },
      annotations: READ_ONLY
    },
    async (args) => {
      const matches = searchSkills(superLibrary, args);
      const result = {
        query: args.query,
        matches,
        warning:
          "Skill records are provenance/enrichment metadata only. review SKILL.md, scripts, references, license, and repository provenance before install/use; do not install blindly.",
        safety: "Read-only search only; VNEM default MCP does not install or execute skills."
      };
      return toolResult(formatSkillResults("vnem skill search", result), result);
    }
  );

  mcpServer.registerTool(
    "vnem_recommend_skills",
    {
      title: "Recommend VNEM Skill Capabilities",
      description:
        "Recommend skill/capability-pack candidates for a user task with task-fit, compatibility, risk, and manual-review guidance. Does not install skills.",
      inputSchema: {
        task: z.string().min(1),
        agent_client: z.string().optional(),
        project_context: z.string().optional(),
        risk_tolerance: z.enum(["low", "normal", "high"]).default("normal"),
        limit: z.number().int().min(1).max(12).default(6)
      },
      annotations: READ_ONLY
    },
    async (args) => {
      const recommendations = recommendSkills(superLibrary, args);
      const result = {
        task: args.task,
        recommendations,
        suggested_next_vnem_call: "vnem_review_skill_or_api for any candidate before install/use",
        warning:
          "Do not install or activate recommended skills without manual source review and explicit user approval. Recommendations are metadata only, not safety guarantees.",
        safety: "Read-only recommendation only; VNEM default MCP does not install or execute skills."
      };
      return toolResult(formatSkillResults("vnem skill recommendations", { ...result, matches: recommendations }), result);
    }
  );

  mcpServer.registerTool(
    "vnem_search_apis",
    {
      title: "Search VNEM API Capabilities",
      description:
        "Search VNEM-normalized public API/integration records with auth, HTTPS, CORS, frontend/backend safety, provenance, and risk flags. Does not call APIs.",
      inputSchema: {
        query: z.string().min(1),
        category: z.string().optional(),
        auth_type: z.string().optional(),
        frontend_only: z.boolean().default(false),
        require_https: z.boolean().default(true),
        require_cors: z.boolean().default(false),
        include_secret_risk: z.boolean().default(false),
        limit: z.number().int().min(1).max(25).default(8)
      },
      annotations: READ_ONLY
    },
    async (args) => {
      const matches = searchApis(superLibrary, args);
      const result = {
        query: args.query,
        matches,
        warning:
          "API records are discovery/enrichment metadata only. Verify current official docs before integration. Do not expose API keys in frontend code.",
        safety: "Read-only search only; VNEM default MCP does not call APIs or request/store secrets."
      };
      return toolResult(formatApiResults("vnem API search", result), result);
    }
  );

  mcpServer.registerTool(
    "vnem_recommend_apis",
    {
      title: "Recommend VNEM API Capabilities",
      description:
        "Recommend API/integration candidates for a user task with auth, HTTPS, CORS, frontend/backend safety decisions, secret-risk warnings, and provenance. Does not call APIs.",
      inputSchema: {
        task: z.string().min(1),
        app_type: z.enum(["frontend", "backend", "fullstack", "cli", "unknown"]).default("unknown"),
        category: z.string().optional(),
        allow_api_keys: z.boolean().default(false),
        allow_oauth: z.boolean().default(false),
        frontend_only: z.boolean().default(false),
        risk_tolerance: z.enum(["low", "normal", "high"]).default("normal"),
        limit: z.number().int().min(1).max(15).default(6)
      },
      annotations: READ_ONLY
    },
    async (args) => {
      const recommendations = recommendApis(superLibrary, args);
      const result = {
        task: args.task,
        recommendations,
        suggested_next_vnem_call: "vnem_review_skill_or_api for any API before implementation",
        warning:
          "Do not expose API keys in frontend code. API recommendations are metadata only; verify official docs, terms, auth, HTTPS, CORS, and rate limits before implementation.",
        safety: "Read-only recommendation only; VNEM default MCP does not call APIs or request/store secrets."
      };
      return toolResult(formatApiResults("vnem API recommendations", { ...result, matches: recommendations }), result);
    }
  );

  mcpServer.registerTool(
    "vnem_review_skill_or_api",
    {
      title: "Review VNEM Skill Or API Capability",
      description:
        "Basic read-only safety/compatibility review for one skill/API capability record by id. Produces a metadata-reference verdict, risk flags, missing fields, and next safety checks.",
      inputSchema: {
        id: z.string().min(1),
        kind: z.enum(["skill", "api", "auto"]).default("auto"),
        task: z.string().optional(),
        project_context: z.string().optional(),
        frontend_only: z.boolean().default(false),
        risk_tolerance: z.enum(["low", "normal", "high"]).default("normal")
      },
      annotations: READ_ONLY
    },
    async (args) => {
      const review = reviewCapability(superLibrary, args);
      return toolResult(formatCapabilityReview(review), review);
    }
  );

  mcpServer.registerTool(
    "vnem_api_safety_profile",
    {
      title: "VNEM API Safety Profile",
      description:
        "Return a compact read-only frontend/backend/API safety profile for one API capability record: auth, CORS, HTTPS, secret risk, backend proxy need, docs/freshness confidence, tests, unsafe patterns, and unknowns. Does not call APIs.",
      inputSchema: {
        id: z.string().min(1),
        task: z.string().optional(),
        frontend_only: z.boolean().default(false),
        token_budget: z.enum(["compact", "normal", "expanded"]).default("compact")
      },
      annotations: READ_ONLY
    },
    async (args) => {
      const profile = apiSafetyProfile(superLibrary, args);
      return toolResult(formatApiSafetyProfile(profile), profile);
    }
  );

  mcpServer.registerTool(
    "vnem_skill_safety_profile",
    {
      title: "VNEM Skill Safety Profile",
      description:
        "Return a compact read-only skill safety/usefulness profile: purpose, Core guidance boundary, install/execution boundary, compatibility confidence, prompt-injection/manual-review risk, usage evidence, and must-not-claim limits. Does not install or execute skills.",
      inputSchema: {
        id: z.string().min(1),
        task: z.string().optional(),
        agent_client: z.string().optional(),
        token_budget: z.enum(["compact", "normal", "expanded"]).default("compact")
      },
      annotations: READ_ONLY
    },
    async (args) => {
      const profile = skillSafetyProfile(superLibrary, args);
      return toolResult(formatSkillSafetyProfile(profile), profile);
    }
  );

  mcpServer.registerTool(
    "vnem_get_required_capabilities",
    {
      title: "Get Required VNEM Capability Modules",
      description:
        "Select the few required/strongly recommended read-only VNEM capability modules for a real user task. Returns compact instructions, risks, and evidence requirements without dumping the whole library.",
      inputSchema: {
        task: z.string().min(1),
        agent_client: z.string().optional(),
        model_family: z.string().optional(),
        project_context: z.string().optional(),
        max_modules: z.number().int().min(1).max(8).default(5),
        token_budget: z.enum(["compact", "normal", "expanded"]).default("compact"),
        include_optional: z.boolean().default(false)
      },
      annotations: READ_ONLY
    },
    async (args) => {
      const result = getRequiredCapabilities(superLibrary, agentProfiles, args);
      return toolResult(formatCapabilityModules("VNEM required capabilities", result.required_modules), result);
    }
  );

  mcpServer.registerTool(
    "vnem_activate_capability_pack",
    {
      title: "Activate VNEM Capability Pack",
      description:
        "Create a compact task-specific Core MCP activation contract from selected capability modules. Forces instructions, evidence, and incomplete-if-skipped rules without installing skills or mutating files.",
      inputSchema: {
        task: z.string().min(1),
        agent_client: z.string().optional(),
        model_family: z.string().optional(),
        selected_capability_ids: z.array(z.string()).default([]),
        risk_tolerance: z.enum(["low", "normal", "high"]).default("normal"),
        token_budget: z.enum(["compact", "normal", "expanded"]).default("compact"),
        include_full_instructions: z.boolean().default(false)
      },
      annotations: READ_ONLY
    },
    async (args) => {
      const result = activateCapabilityPack(superLibrary, agentProfiles, args);
      return toolResult(formatActivationPack(result), result);
    }
  );

  mcpServer.registerTool(
    "vnem_apply_skill_guidance",
    {
      title: "Apply VNEM Skill Guidance",
      description:
        "Return compact task-specific guidance from one selected skill/capability record. Core MCP applies instructions only; it never installs skills or executes scripts.",
      inputSchema: {
        skill_id: z.string().min(1),
        task: z.string().min(1),
        agent_client: z.string().optional(),
        token_budget: z.enum(["compact", "normal", "expanded"]).default("compact")
      },
      annotations: READ_ONLY
    },
    async (args) => {
      const result = applySkillGuidance(superLibrary, args);
      return toolResult(formatSkillGuidance(result), result);
    }
  );

  mcpServer.registerTool(
    "vnem_boost_task",
    {
      title: "Boost A Real User Task With VNEM Core",
      description:
        "Return one concrete task-specific workflow using selected skill guidance, API guidance when useful, domain contracts, missing questions, verification, proof requirements, and Core/Precision boundaries. Core MCP stays read-only.",
      inputSchema: {
        task: z.string().min(1),
        agent_client: z.string().optional(),
        model_family: z.string().optional(),
        known_context: z.string().optional(),
        constraints: z.array(z.string()).default([]),
        token_budget: z.enum(["compact", "normal", "expanded"]).default("compact")
      },
      annotations: READ_ONLY
    },
    async (args) => {
      const result = boostTask(superLibrary, agentProfiles, args);
      const routingRecord = buildCoreRoutingRecord({ task: args.task, known_context: args.known_context, token_budget: args.token_budget });
      const outputQualityPlan = buildOutputQualityPlan({ task: args.task, output_type: "technical_final_report", audience: "developer" });
      const effortBudget = buildEffortBudget({ user_goal: args.task, known_context: args.known_context, token_budget: args.token_budget });
      const designPlan = /ui|ux|website|web app|redesign|design|visual|landing page/i.test(`${args.task} ${args.known_context || ""}`) ? buildDesignAmbitionPlan({ user_goal: args.task, known_context: args.known_context, token_budget: "compact" }) : null;
      const adaptiveEffort = compactAdaptiveEffort(effortBudget);
      const designBehavior = compactDesignBehavior(designPlan);
      const { tools_mcp_handoff: _compactDuplicateToolsHandoff, ...compactResult } = result;
      const baseResult = args.token_budget === "compact"
        ? { ...compactResult, routing_record: compactRoutingRecord(routingRecord), output_quality_plan: compactOutputQualityPlan(outputQualityPlan), adaptive_effort: adaptiveEffort, design_behavior: designBehavior }
        : { ...result, routing_record: routingRecord, output_quality_plan: outputQualityPlan, adaptive_effort: adaptiveEffort, design_behavior: designBehavior };
      if (args.token_budget === "compact") return toolResult(formatBoostTask(baseResult), baseResult);
      const toolSelectionPlan = compactCoreToolsPlan(buildCoreToolsPlan(args));
      const enhanced = {
        ...baseResult,
        tool_selection_plan: toolSelectionPlan,
        tools_plan: toolSelectionPlan,
        tools_mcp_handoff: { ...(result.tools_mcp_handoff || result.tools_handoff || {}), ...toolSelectionPlan.core_tools_handoff },
        core_executes_tools: false
      };
      return toolResult(formatBoostTask(enhanced), enhanced);
    }
  );

  mcpServer.registerTool(
    "vnem_route_task",
    {
      title: "Build VNEM Core Routing Record",
      description: "Read-only Core routing record for serious tasks: task categories, relevant/ignored memory, missing-context ask decision, capabilities, Tools/current-research needs, risks, evidence, next action, and must-not-claim limits.",
      inputSchema: {
        task: z.string().min(1),
        known_context: z.string().optional(),
        memory_items: z.array(z.any()).default([]),
        completed_areas: z.array(z.string()).default([]),
        available_tools: z.array(z.string()).default([]),
        token_budget: z.enum(["compact", "normal", "expanded"]).default("normal")
      },
      annotations: READ_ONLY
    },
    async (args) => {
      const record = buildCoreRoutingRecord(args);
      return toolResult(formatCoreRoutingRecord(record), { routing_record: record });
    }
  );

  mcpServer.registerTool(
    "vnem_output_quality_plan",
    {
      title: "Build VNEM Output Quality Plan",
      description: "Read-only compact-first output contract and audit for reports, blocker reports, user command handoffs, Building AI prompt handoffs, technical final reports, and AI work reviews.",
      inputSchema: {
        task: z.string().min(1),
        output_type: z.string().default("technical_final_report"),
        audience: z.enum(["public_user", "developer", "ai_worker", "unknown"]).default("unknown"),
        evidence_available: z.array(z.string()).default([]),
        blockers: z.array(z.string()).default([]),
        commands_to_handoff: z.array(z.string()).default([]),
        output_text: z.string().optional(),
        token_budget: z.enum(["compact", "normal", "expanded"]).default("normal")
      },
      annotations: READ_ONLY
    },
    async (args) => {
      const plan = buildOutputQualityPlan(args);
      return toolResult(formatOutputQualityPlan(plan), { output_quality_plan: plan });
    }
  );

  mcpServer.registerTool(
    "vnem_anti_stagnation_check",
    {
      title: "Check VNEM Anti-Stagnation Risk",
      description: "Read-only checker that flags repeated finished work, docs-only fake progress, broad-scan loops, full-test loops, same-next-step renames, and polishing finished areas while higher-value work waits.",
      inputSchema: {
        task: z.string().min(1),
        completed_areas: z.array(z.string()).default([]),
        recent_actions: z.array(z.string()).default([]),
        proposed_next_step: z.string().optional(),
        token_budget: z.enum(["compact", "normal", "expanded"]).default("normal")
      },
      annotations: READ_ONLY
    },
    async (args) => {
      const check = buildAntiStagnationCheck(args);
      return toolResult(formatAntiStagnationCheck(check), { anti_stagnation_check: check });
    }
  );

  mcpServer.registerTool(
    "vnem_plan_effort_budget",
    {
      title: "Plan VNEM Adaptive Effort Budget",
      description: "Read-only Core classifier for quality floor/adaptive effort ceiling: chooses instant/quick/standard/deep/max mode, truth rules, research decision, tool budget, clarification discipline, evidence, and must-not-claim limits. Core does not execute Tools.",
      inputSchema: { user_goal: z.string().min(1), known_context: z.string().optional(), user_requested_style: z.string().optional(), token_budget: z.enum(["compact", "normal", "expanded"]).default("normal") },
      annotations: READ_ONLY
    },
    async (args) => {
      const budget = buildEffortBudget(args);
      return toolResult(formatEffortBudget(budget), { effort_budget: budget });
    }
  );

  mcpServer.registerTool(
    "vnem_fast_answer_contract",
    {
      title: "Build VNEM Fast Answer Contract",
      description: "Read-only Core contract for direct answers: answer first, avoid fake proof/process, label uncertainty, use research/tools only when facts, risk, files, UI, or verification require them.",
      inputSchema: { task_summary: z.string().min(1), known_context: z.string().optional(), token_budget: z.enum(["compact", "normal", "expanded"]).default("compact") },
      annotations: READ_ONLY
    },
    async (args) => {
      const contract = buildFastAnswerContract(args);
      return toolResult(formatFastAnswerContract(contract), { fast_answer_contract: contract });
    }
  );

  mcpServer.registerTool(
    "vnem_design_ambition_plan",
    {
      title: "Build VNEM Design Ambition Plan",
      description: "Read-only Core design plan for UI/redesign tasks: adapt to business/brand/purpose when style is unspecified, follow explicit style when supplied, avoid generic safe templates, and require visibly better browser-proofed results.",
      inputSchema: { user_goal: z.string().min(1), referenced_site_or_product: z.string().default(""), user_requested_style: z.string().optional(), known_context: z.string().optional(), token_budget: z.enum(["compact", "normal", "expanded"]).default("normal") },
      annotations: READ_ONLY
    },
    async (args) => {
      const plan = buildDesignAmbitionPlan(args);
      return toolResult(formatDesignAmbitionPlan(plan), { design_ambition_plan: plan });
    }
  );

  mcpServer.registerTool(
    "vnem_visual_taste_audit",
    {
      title: "Audit VNEM Visual Taste",
      description: "Read-only Core audit for UI/design quality: flags boring/generic/template-like, weak brand fit, ignored user style, score inflation, one-axis optimization, actually-better-than-original risk, weak mobile/hero/typography/spacing, and missing visual/before-after proof.",
      inputSchema: { user_goal: z.string().min(1), design_summary: z.string().default(""), user_requested_style: z.string().optional(), referenced_site_or_product: z.string().optional(), evidence: z.array(z.any()).default([]), screenshots_or_visual_evidence: z.array(z.any()).default([]), before_after_evidence: z.array(z.any()).default([]), token_budget: z.enum(["compact", "normal", "expanded"]).default("normal") },
      annotations: READ_ONLY
    },
    async (args) => {
      const audit = buildVisualTasteAudit(args);
      return toolResult(formatVisualTasteAudit(audit), { visual_taste_audit: audit });
    }
  );

  mcpServer.registerTool(
    "vnem_redesign_comparison_scorecard",
    {
      title: "Build VNEM Redesign Comparison Scorecard",
      description: "Read-only Core scorecard for redesigns: compares original/reference vs new design across equal total-impact axes, flags inflated scores, one-axis optimization, and unsupported better-than-original claims. Core does not inspect screenshots or run a browser.",
      inputSchema: { user_goal: z.string().min(1), original_summary: z.string().default(""), new_design_summary: z.string().default(""), claimed_original_score: z.number().optional(), claimed_new_score: z.number().optional(), claimed_result: z.string().default(""), evidence: z.array(z.any()).default([]), screenshots_or_visual_evidence: z.array(z.any()).default([]), before_after_evidence: z.array(z.any()).default([]), token_budget: z.enum(["compact", "normal", "expanded"]).default("normal") },
      annotations: READ_ONLY
    },
    async (args) => {
      const scorecard = buildRedesignComparisonScorecard(args);
      return toolResult(formatRedesignComparisonScorecard(scorecard), { redesign_comparison_scorecard: scorecard });
    }
  );

  mcpServer.registerTool(
    "vnem_total_impact_design_plan",
    {
      title: "Build VNEM Total Impact Design Plan",
      description: "Read-only Core plan for redesign quality across visual beauty, brand, conversion, usability, hierarchy, typography, layout, mobile, motion, originality, performance/feel, trust/accessibility, and overall impact.",
      inputSchema: { user_goal: z.string().min(1), referenced_site_or_product: z.string().default(""), business_goal: z.string().optional(), user_requested_style: z.string().optional(), known_context: z.string().optional(), token_budget: z.enum(["compact", "normal", "expanded"]).default("normal") },
      annotations: READ_ONLY
    },
    async (args) => {
      const plan = buildTotalImpactDesignPlan(args);
      return toolResult(formatTotalImpactDesignPlan(plan), { total_impact_design_plan: plan });
    }
  );

  mcpServer.registerTool(
    "vnem_design_direction_selector",
    {
      title: "Select VNEM Design Direction",
      description: "Read-only Core selector for design/redesign directions using total impact rather than one-axis prettiness. It ranks candidate directions and preserves explicit user style while requiring before/after evidence later.",
      inputSchema: { user_goal: z.string().min(1), referenced_site_or_product: z.string().default(""), user_requested_style: z.string().optional(), candidate_directions: z.array(z.any()).default([]), known_context: z.string().optional(), token_budget: z.enum(["compact", "normal", "expanded"]).default("normal") },
      annotations: READ_ONLY
    },
    async (args) => {
      const selector = buildDesignDirectionSelector(args);
      return toolResult(formatDesignDirectionSelector(selector), { design_direction_selector: selector });
    }
  );

  mcpServer.registerTool(
    "vnem_compact_output_contract",
    {
      title: "Build VNEM Compact Output Contract",
      description: "Read-only Core compact-output contract: compact by default, not vague, never hiding material caveats or needed proof, and expands for risky/current/UI/debug/security/repo/file tasks.",
      inputSchema: { task: z.string().min(1), output_text: z.string().default(""), material_caveats: z.array(z.string()).default([]), needed_proof: z.array(z.string()).default([]), evidence_available: z.array(z.string()).default([]), token_budget: z.enum(["compact", "normal", "expanded"]).default("compact") },
      annotations: READ_ONLY
    },
    async (args) => {
      const contract = buildCompactOutputContract(args);
      return toolResult(formatCompactOutputContract(contract), { compact_output_contract: contract });
    }
  );

  mcpServer.registerTool(
    "vnem_build_debugging_plan",
    {
      title: "Build VNEM Debugging Plan",
      description: "Read-only Core log-first debugging plan with failure type, missing evidence, root-cause areas, targeted checks, and must-not-claim boundaries. Does not inspect logs or run tests.",
      inputSchema: { task: z.string().min(1), expected_behavior: z.string().optional(), actual_behavior: z.string().optional(), error_or_output: z.string().optional(), failing_command: z.string().optional(), known_context: z.string().optional(), token_budget: z.enum(["compact", "normal", "expanded"]).default("normal") },
      annotations: READ_ONLY
    },
    async (args) => {
      const plan = buildDebuggingPlan(args);
      return toolResult(formatDebuggingPlan(plan), { debugging_plan: plan });
    }
  );

  mcpServer.registerTool(
    "vnem_evidence_to_fix_check",
    {
      title: "VNEM Evidence To Fix Check",
      description: "Read-only checker that rejects placebo debugging fixes: no logs/tests, docs-only bug fixes, skipped tests, unrelated changes, suppression, and missing targeted verification.",
      inputSchema: { task: z.string().min(1), claimed_fix: z.string().min(1), root_cause: z.string().optional(), changed_files: z.array(z.string()).default([]), evidence_items: z.array(z.any()).default([]), commands_run: z.array(z.string()).default([]), token_budget: z.enum(["compact", "normal", "expanded"]).default("normal") },
      annotations: READ_ONLY
    },
    async (args) => {
      const check = buildEvidenceToFixCheck(args);
      return toolResult(formatEvidenceToFixCheck(check), { evidence_to_fix_check: check });
    }
  );

  mcpServer.registerTool(
    "vnem_build_architecture_map",
    {
      title: "Build VNEM Architecture Map",
      description: "Read-only Core architecture map for serious code edits: entry points, implementation path, patterns, files/tests, contracts, integration points, and risks. Does not read files.",
      inputSchema: { task: z.string().min(1), known_context: z.string().optional(), project_type_hint: z.string().optional(), token_budget: z.enum(["compact", "normal", "expanded"]).default("normal") },
      annotations: READ_ONLY
    },
    async (args) => {
      const map = buildArchitectureMap(args);
      return toolResult(formatArchitectureMap(map), { architecture_map: map });
    }
  );

  mcpServer.registerTool(
    "vnem_code_change_contract",
    {
      title: "Build VNEM Code Change Contract",
      description: "Read-only Core contract for real integrated code changes: files, callers, contracts, tests, verification, rollback, done definition, and must-not-claim rules.",
      inputSchema: { goal: z.string().min(1), existing_architecture_summary: z.string().optional(), architecture_evidence: z.any().optional(), files_to_change: z.array(z.string()).default([]), files_to_avoid: z.array(z.string()).default([]), contracts_affected: z.array(z.string()).default([]), token_budget: z.enum(["compact", "normal", "expanded"]).default("normal") },
      annotations: READ_ONLY
    },
    async (args) => {
      const contract = buildCodeChangeContract(args);
      return toolResult(formatCodeChangeContract(contract), { code_change_contract: contract });
    }
  );

  mcpServer.registerTool(
    "vnem_build_ui_quality_plan",
    {
      title: "Build VNEM UI Quality Plan",
      description: "Read-only Core plan for UI/web quality work: routes/components, visual proof, browser evidence, console/network/a11y, responsive/state coverage, and must-not-claim boundaries. Does not open a browser or capture screenshots.",
      inputSchema: { user_goal: z.string().min(1), ui_surface: z.string().default("unknown UI surface"), expected_user_flow: z.string().default(""), routes_or_components: z.array(z.string()).default([]), claim_type: z.string().default("visual_improvement"), known_context: z.string().optional(), token_budget: z.enum(["compact", "normal", "expanded"]).default("normal") },
      annotations: READ_ONLY
    },
    async (args) => {
      const plan = buildUiQualityPlan(args);
      return toolResult(formatUiQualityPlan(plan), { ui_quality_plan: plan });
    }
  );

  mcpServer.registerTool(
    "vnem_visual_proof_contract",
    {
      title: "Build VNEM Visual Proof Contract",
      description: "Read-only proof contract for UI/web claims. Defines evidence required before visual, responsive, route/component, state, accessibility, or dashboard claims can be made.",
      inputSchema: { claim_type: z.enum(["visual_improvement", "layout_fix", "responsive_fix", "route_added", "component_added", "dashboard_change", "accessibility_improvement", "loading_state", "error_state", "empty_state", "form_flow", "before_after_comparison"]).default("visual_improvement"), claim: z.string().default(""), route_or_component: z.string().optional(), token_budget: z.enum(["compact", "normal", "expanded"]).default("normal") },
      annotations: READ_ONLY
    },
    async (args) => {
      const contract = buildVisualProofContract(args);
      return toolResult(formatVisualProofContract(contract), { visual_proof_contract: contract });
    }
  );

  mcpServer.registerTool(
    "vnem_select_tools_for_task",
    {
      title: "Select VNEM Tools For Task",
      description: "Read-only Core brain tool that selects safe Tools MCP tools for coding, UI, research, file investigation, debugging, local modification, and safety-sensitive tasks. Does not execute Tools.",
      inputSchema: {
        task: z.string().min(1),
        task_type_hint: z.string().optional(),
        known_context: z.string().optional(),
        available_tools: z.array(z.string()).default([]),
        token_budget: z.enum(["compact", "normal", "expanded"]).default("normal")
      },
      annotations: READ_ONLY
    },
    async (args) => {
      const selection = selectToolsForTask(args);
      return toolResult(formatCoreToolSelection(selection), { tool_selection: selection });
    }
  );

  mcpServer.registerTool(
    "vnem_build_tools_plan",
    {
      title: "Build VNEM Core→Tools Plan",
      description: "Build a read-only Core→Tools execution plan with sequence, dry-runs, approvals, evidence, verification, fallbacks, must-not-claim, and done definition. Does not execute Tools.",
      inputSchema: {
        task: z.string().min(1),
        task_type_hint: z.string().optional(),
        known_context: z.string().optional(),
        available_tools: z.array(z.string()).default([]),
        token_budget: z.enum(["compact", "normal", "expanded"]).default("normal")
      },
      annotations: READ_ONLY
    },
    async (args) => {
      const plan = buildCoreToolsPlan(args);
      return toolResult(formatCoreToolsPlan(plan), { tools_plan: plan });
    }
  );

  mcpServer.registerTool(
    "vnem_build_browser_research_plan",
    {
      title: "Build VNEM Browser Research Plan",
      description: "Read-only Core plan for direct URL/source, website understanding, local UI browser proof, and current research tasks. Does not execute Tools or search the web.",
      inputSchema: {
        task: z.string().min(1),
        task_type_hint: z.string().optional(),
        known_context: z.string().optional(),
        available_tools: z.array(z.string()).default([]),
        token_budget: z.enum(["compact", "normal", "expanded"]).default("normal")
      },
      annotations: READ_ONLY
    },
    async (args) => {
      const plan = buildBrowserResearchPlan(args);
      return toolResult(formatBrowserResearchPlan(plan), { browser_research_plan: plan });
    }
  );

  mcpServer.registerTool(
    "vnem_assess_research_need",
    {
      title: "Assess VNEM Research Need",
      description: "Read-only assessment of whether a task needs current search, direct sources, official/community sources, risk checks, CAPTCHA/download handling, or UI proof. Does not execute Tools.",
      inputSchema: { task: z.string().min(1), known_context: z.string().optional(), domain_hint: z.string().optional(), freshness_required: z.boolean().optional() },
      annotations: READ_ONLY
    },
    async (args) => {
      const assessment = assessResearchNeed(args);
      return toolResult(formatResearchNeedAssessment(assessment), { research_need_assessment: assessment });
    }
  );

  mcpServer.registerTool(
    "vnem_build_search_plan",
    {
      title: "Build VNEM Search Plan",
      description: "Read-only Core plan for provider search, result ranking, source quality, claim/source matrix, research gaps, and risk checks. Does not search the web.",
      inputSchema: { task: z.string().min(1), domain_hint: z.string().optional(), known_context: z.string().optional(), freshness_required: z.boolean().optional(), token_budget: z.enum(["compact", "normal", "expanded"]).default("normal") },
      annotations: READ_ONLY
    },
    async (args) => {
      const plan = buildSearchPlan(args);
      return toolResult(formatSearchPlan(plan), { search_plan: plan });
    }
  );

  mcpServer.registerTool(
    "vnem_build_browsing_plan",
    {
      title: "Build VNEM Browsing Risk Plan",
      description: "Read-only Core plan for page/source inspection, redirect, URL reputation, CAPTCHA/access-block, download safety, and evidence collection. Does not browse.",
      inputSchema: { task: z.string().min(1), known_context: z.string().optional(), url: z.string().optional(), token_budget: z.enum(["compact", "normal", "expanded"]).default("normal") },
      annotations: READ_ONLY
    },
    async (args) => {
      const plan = buildBrowsingPlan(args);
      return toolResult(formatBrowsingPlan(plan), { browsing_plan: plan });
    }
  );

  mcpServer.registerTool(
    "vnem_build_research_strategy",
    {
      title: "Build VNEM Research Strategy",
      description: "Read-only Core research strategy for currentness, official docs, source ingestion, contradiction/freshness checks, claims to verify, and confidence limits. Does not search or browse.",
      inputSchema: { task: z.string().min(1), known_context: z.string().optional(), domain_hint: z.string().optional(), freshness_required: z.boolean().optional(), token_budget: z.enum(["compact", "normal", "expanded"]).default("normal") },
      annotations: READ_ONLY
    },
    async (args) => {
      const strategy = buildResearchStrategy(args);
      return toolResult(formatResearchStrategy(strategy), { research_strategy: strategy });
    }
  );

  mcpServer.registerTool(
    "vnem_build_source_ingestion_plan",
    {
      title: "Build VNEM Source Ingestion Plan",
      description: "Read-only Core plan for bounded website/docs/GitHub/local repo/package/API source ingestion. Does not crawl, browse, or read files.",
      inputSchema: { task: z.string().min(1), source_type: z.enum(["website", "documentation_site", "GitHub_repo", "local_repo", "package_registry", "API_docs", "issue_tracker", "release_notes", "mixed"]).default("mixed"), source_targets: z.array(z.string()).default([]), extraction_goal: z.string().default(""), known_context: z.string().optional(), token_budget: z.enum(["compact", "normal", "expanded"]).default("normal") },
      annotations: READ_ONLY
    },
    async (args) => {
      const plan = buildSourceIngestionPlan(args);
      return toolResult(formatSourceIngestionPlan(plan), { source_ingestion_plan: plan });
    }
  );

  mcpServer.registerTool(
    "vnem_research_evidence_audit",
    {
      title: "VNEM Research Evidence Audit",
      description: "Read-only audit of research/source conclusions against evidence, freshness, official-doc, download, website, repo, compatibility, and contradiction requirements.",
      inputSchema: { task: z.string().min(1), conclusion: z.string().default(""), evidence_items: z.array(z.record(z.any())).default([]), required_claims: z.array(z.string()).default([]), freshness_required: z.boolean().optional() },
      annotations: READ_ONLY
    },
    async (args) => {
      const audit = buildResearchEvidenceAudit(args);
      return toolResult(formatResearchEvidenceAudit(audit), { research_evidence_audit: audit });
    }
  );


  mcpServer.registerTool(
    "vnem_explain_tools_chain",
    {
      title: "Explain VNEM Tools Chain",
      description: "Explain what each selected Tools MCP tool is for, approval/evidence boundaries, and must-not-claim limits. Does not execute Tools.",
      inputSchema: {
        task: z.string().min(1),
        task_type_hint: z.string().optional(),
        known_context: z.string().optional(),
        selected_tools: z.array(z.string()).default([]),
        token_budget: z.enum(["compact", "normal", "expanded"]).default("normal")
      },
      annotations: READ_ONLY
    },
    async (args) => {
      const chain = explainToolsChain(args);
      return toolResult(formatToolsChain(chain), { tools_chain: chain });
    }
  );


  mcpServer.registerTool(
    "vnem_prepare_tools_handoff",
    {
      title: "Prepare VNEM Tools MCP Handoff",
      description:
        "Prepare a read-only Core-to-future-Tools handoff: selected usable packs, required tools, permissions, dry-run, rollback, evidence, blocked actions, and must-not-claim limits. Does not execute actions.",
      inputSchema: {
        task: z.string().min(1),
        agent_client: z.string().optional(),
        model_family: z.string().optional(),
        known_context: z.string().optional(),
        project_context: z.string().optional(),
        token_budget: z.enum(["compact", "normal", "expanded"]).default("compact")
      },
      annotations: READ_ONLY
    },
    async (args) => {
      const result = prepareToolsHandoff(superLibrary, agentProfiles, args);
      return toolResult(formatToolsHandoff(result), result);
    }
  );

  mcpServer.registerTool(
    "vnem_build_api_integration_plan",
    {
      title: "Build VNEM API Integration Plan",
      description:
        "Build a safe read-only API integration plan: candidates, auth/HTTPS/CORS, frontend/backend boundary, secret handling, tests, and evidence. Does not call APIs.",
      inputSchema: {
        task: z.string().min(1),
        api_id: z.string().optional(),
        app_type: z.enum(["frontend", "backend", "fullstack", "cli", "unknown"]).default("unknown"),
        frontend_only: z.boolean().default(false),
        allow_api_keys: z.boolean().default(false),
        allow_oauth: z.boolean().default(false),
        token_budget: z.enum(["compact", "normal", "expanded"]).default("compact")
      },
      annotations: READ_ONLY
    },
    async (args) => {
      const result = buildApiIntegrationPlan(superLibrary, args);
      return toolResult(formatApiPlan(result), result);
    }
  );

  mcpServer.registerTool(
    "vnem_get_agent_profile",
    {
      title: "Get VNEM Agent Profile",
      description:
        "Return one compact client/model profile for the current agent. Avoids dumping irrelevant Claude/Codex/Gemini/DeepSeek/Hermes/Qwen guidance into the wrong AI.",
      inputSchema: {
        agent_client: z.string().min(1),
        model_family: z.string().optional(),
        task: z.string().optional(),
        token_budget: z.enum(["compact", "normal", "expanded"]).default("compact")
      },
      annotations: READ_ONLY
    },
    async (args) => {
      const result = getAgentProfile(agentProfiles, args);
      return toolResult(formatAgentProfile(result), result);
    }
  );

  mcpServer.registerTool(
    "vnem_compose_capability_contract",
    {
      title: "Compose VNEM Capability Contract",
      description:
        "Compose task routing, required capabilities, one relevant agent profile, API/skill guidance, risks, verification, and final-report requirements into one compact Core MCP contract.",
      inputSchema: {
        task: z.string().min(1),
        agent_client: z.string().optional(),
        model_family: z.string().optional(),
        project_context: z.string().optional(),
        token_budget: z.enum(["compact", "normal", "expanded"]).default("compact"),
        max_modules: z.number().int().min(1).max(8).default(5)
      },
      annotations: READ_ONLY
    },
    async (args) => {
      const result = composeCapabilityContract(superLibrary, agentProfiles, args);
      return toolResult(formatComposedContract(result), result);
    }
  );

  mcpServer.registerTool(
    "vnem_completion_audit",
    {
      title: "Audit VNEM Completion Claim",
      description:
        "Read-only audit of an AI final answer/plan/work summary against the task and VNEM contract. Detects fake done claims, missing evidence, weak research, UI/API/modding gaps, and unsafe certainty.",
      inputSchema: {
        task: z.string().min(1),
        agent_client: z.string().optional(),
        model_family: z.string().optional(),
        capability_contract: z.any().optional(),
        activation_id: z.string().optional(),
        claimed_result: z.string().min(1),
        evidence: z.any().optional(),
        changed_files: z.array(z.string()).default([]),
        commands_run: z.array(z.string()).default([]),
        sources_used: z.array(z.any()).default([]),
        screenshots_or_visual_evidence: z.array(z.any()).default([]),
        risk_tolerance: z.enum(["low", "normal", "high"]).default("normal"),
        strictness: z.enum(["lenient", "normal", "strict"]).default("normal"),
        task_domain: z.string().optional(),
        token_budget: z.enum(["compact", "normal", "expanded"]).default("compact")
      },
      annotations: READ_ONLY
    },
    async (args) => {
      const result = augmentCompletionAuditForResearch(augmentCompletionAuditForPermissions(completionAudit(args), args), args);
      return toolResult(formatCompletionAudit(result), result);
    }
  );

  mcpServer.registerTool(
    "vnem_protection_review",
    {
      title: "Review VNEM Protection Risk",
      description:
        "Read-only preflight review for risky plans/actions: filesystem, terminal, browser, GitHub, package install, API, skill, MCP, research, UI, or game/modding. Core MCP reviews only and never performs the action.",
      inputSchema: {
        task: z.string().min(1),
        plan_or_action: z.string().min(1),
        target_type: z.enum(["general", "code_change", "api_integration", "skill_use", "mcp_server", "package_install", "filesystem_action", "terminal_command", "browser_automation", "github_action", "game_modding", "research_answer", "ui_change"]),
        agent_client: z.string().optional(),
        risk_tolerance: z.enum(["low", "normal", "high"]).default("low"),
        available_tools: z.array(z.string()).default([]),
        requires_secrets: z.boolean().default(false),
        touches_user_files: z.boolean().default(false),
        touches_network: z.boolean().default(false),
        touches_auth: z.boolean().default(false),
        token_budget: z.enum(["compact", "normal", "expanded"]).default("compact")
      },
      annotations: READ_ONLY
    },
    async (args) => {
      const result = protectionReview(args);
      return toolResult(formatProtectionReview(result), result);
    }
  );

  mcpServer.registerTool(
    "vnem_proof_trail",
    {
      title: "Build VNEM Proof Trail",
      description:
        "Create a compact read-only proof trail showing VNEM was actually used: bootstrap id, capability IDs, protection/audit summaries, evidence, safe claims, must-not-claim warnings, and final verdict.",
      inputSchema: {
        task: z.string().min(1),
        agent_client: z.string().optional(),
        model_family: z.string().optional(),
        bootstrap_activation_id: z.string().optional(),
        capability_contract: z.any().optional(),
        capability_ids_used: z.array(z.string()).default([]),
        protection_reviews: z.any().optional(),
        completion_audit: z.any().optional(),
        commands_run: z.array(z.string()).default([]),
        sources_used: z.array(z.any()).default([]),
        changed_files: z.array(z.string()).default([]),
        visual_evidence: z.array(z.any()).default([]),
        tests_or_checks: z.array(z.string()).default([]),
        assumptions: z.array(z.string()).default([]),
        skipped_items: z.array(z.string()).default([]),
        remaining_risks: z.array(z.string()).default([]),
        final_claim: z.string().optional(),
        token_budget: z.enum(["compact", "normal", "expanded"]).default("compact")
      },
      annotations: READ_ONLY
    },
    async (args) => {
      const result = proofTrail(args);
      return toolResult(formatProofTrail(result), result);
    }
  );

  mcpServer.registerTool(
    "vnem_status",
    {
      title: "vnem Status",
      description:
        "Explain what this vnem MCP server loaded, which read-only surfaces are available, and how fresh the generated data is.",
      inputSchema: {},
      annotations: READ_ONLY
    },
    async () => {
      const status = buildStatus();
      return toolResult(formatStatus(status), status);
    }
  );

  mcpServer.registerTool(
    "vnem_overview",
    {
      title: "vnem Overview",
      description:
        "Explain vnem's usable product surfaces: registry, install pack, MCP server, source radar, task rubrics, Hermes, dashboard, and safety model.",
      inputSchema: {
        audience: z
          .enum(["maintainer", "agent", "newcomer"])
          .default("newcomer")
          .describe("Who the explanation is for.")
      },
      annotations: READ_ONLY
    },
    async ({ audience }) => {
      const overview = buildOverview(audience);
      return toolResult(formatOverview(overview), overview);
    }
  );

  mcpServer.registerTool(
    "vnem_route_intent",
    {
      title: "Route vnem Intent",
      description:
        "Resolve a task or phrase into vnem's intent route, read-first guidance, comparison options, choice criteria, rubrics, and report contract.",
      inputSchema: {
        intent: z.string().min(1).describe("Task, decision, or phrase to route."),
        include_matches: z
          .boolean()
          .default(true)
          .describe("Include the resolved read-first documents when possible.")
      },
      annotations: READ_ONLY
    },
    async ({ intent, include_matches: includeMatches }) => {
      const resolvedIntent = resolveIntent(intent);
      const route = resolvedIntent?.route || searchIndex.intent_routes?.[normalize(intent)] || null;
      const rubrics = selectTaskRubrics(intent, resolvedIntent, inferTaskMode(intent));
      const readFirst = includeMatches ? relevantPracticeDocs(intent, resolvedIntent, 8) : [];
      const result = {
        intent,
        resolved_intent: resolvedIntent,
        route,
        mode: inferTaskMode(intent),
        rubrics: rubrics.map((rubric) => ({
          id: rubric.id,
          title: rubric.title,
          summary: rubric.summary,
          quality_bar: rubric.quality_bar || [],
          approval_gates: rubric.approval_gates || [],
          verification: rubric.verification || []
        })),
        read_first: readFirst,
        safety:
          "Read-only routing only. Use this to choose context and verification, not to install tools or mutate a repo."
      };
      return toolResult(formatRouteIntent(result), result);
    }
  );

  mcpServer.registerTool(
    "vnem_get_source",
    {
      title: "Get vnem Source Radar Entry",
      description:
        "Fetch one source-radar entry by id or title, including when to use it, what to monitor, risk checks, and source URLs.",
      inputSchema: {
        id: z.string().min(1).describe("Source-radar id or exact title.")
      },
      annotations: READ_ONLY
    },
    async ({ id }) => {
      const source = findSource(id);
      if (!source) {
        return errorResult(`No vnem source-radar entry found for "${id}". Try vnem_sources first.`);
      }
      return toolResult(formatSourceDetail(source), source);
    }
  );

  mcpServer.registerTool(
    "vnem_search",
    {
      title: "Search vnem",
      description:
        "Search vnem registry entries, best-practice notes, and prompt patterns with trust-tier and source context.",
      inputSchema: {
        query: z.string().min(1).describe("Search query or user intent."),
        limit: z.number().int().min(1).max(20).default(8).describe("Maximum results to return."),
        types: z.array(z.string()).optional().describe("Optional entry/document types to include."),
        trust_tiers: z
          .array(z.enum(TRUST_TIERS))
          .optional()
          .describe("Optional trust tiers to include."),
        include_watchlist: z
          .boolean()
          .default(false)
          .describe("Include watchlist and deprecated entries unless trust_tiers is explicit.")
      },
      annotations: READ_ONLY
    },
    async ({ query, limit, types, trust_tiers: trustTiers, include_watchlist: includeWatchlist }) => {
      const intent = resolveIntent(query);
      const results = searchDocuments(query, {
        limit,
        types,
        trustTiers,
        includeWatchlist
      });
      return toolResult(formatSearch(query, results, intent), {
        query,
        intent,
        results
      });
    }
  );

  mcpServer.registerTool(
    "vnem_recommend",
    {
      title: "Recommend From vnem",
      description:
        "Run a vnem recommendation pass for a task, combining matching registry entries with best practices and decision notes.",
      inputSchema: {
        task: z.string().min(1).describe("The task, stack decision, or agentic workflow to improve."),
        limit: z.number().int().min(1).max(12).default(6).describe("Maximum registry entries to return."),
        types: z.array(z.string()).optional().describe("Optional entry/document types to include."),
        trust_tiers: z
          .array(z.enum(TRUST_TIERS))
          .optional()
          .describe("Optional trust tiers to include."),
        include_watchlist: z.boolean().default(false).describe("Include watchlist and deprecated entries.")
      },
      annotations: READ_ONLY
    },
    async ({ task, limit, types, trust_tiers: trustTiers, include_watchlist: includeWatchlist }) => {
      const intent = resolveIntent(task);
      const matches = searchDocuments(task, {
        limit: Math.max(limit + 8, 12),
        types,
        trustTiers,
        includeWatchlist
      });
      const registryEntries = matches.filter((match) => match.kind === "registry-entry").slice(0, limit);
      const practices = relevantPracticeDocs(task, intent, 6);
      const route = intent?.route || null;
      const taskContract = buildTaskContract(task, intent, route, practices, registryEntries);
      const recommendation = {
        task,
        intent,
        route,
        task_contract: taskContract,
        registry_entries: registryEntries,
        read_first: practices,
        decision_protocol: searchIndex.decision_protocol || null,
        safety:
          "Read-only guidance only. Review upstream permissions, install behavior, licenses, and data handling before use."
      };

      return toolResult(formatRecommendation(recommendation), recommendation);
    }
  );

  mcpServer.registerTool(
    "vnem_quality_gate",
    {
      title: "Run vnem Quality Gate",
      description:
        "Apply VNEM's Triple-Check Workflow to a coding, app, UI, game, optimization, or production-readiness task and detect silent trade-off risks before code is written or finalized.",
      inputSchema: {
        task: z.string().min(1).describe("The task, feature, bug fix, UI/game build, optimization, or production-readiness request."),
        proposed_approach: z
          .string()
          .optional()
          .describe("Optional proposed implementation approach to review for silent quality trade-offs."),
        domains: z
          .array(z.enum(["performance", "visual", "playability", "accessibility", "maintainability", "security/data"]))
          .optional()
          .describe("Optional explicit quality domains to include in the gate.")
      },
      annotations: READ_ONLY
    },
    async ({ task, proposed_approach: proposedApproach, domains }) => {
      const intent = resolveIntent(task);
      const mode = inferTaskMode(task);
      const rubrics = selectTaskRubrics(task, intent, mode);
      const playbook = selectCodingPlaybooks(task, intent, mode, rubrics)[0] || null;
      const qualityGate = buildQualityGate(task, proposedApproach || "", intent, rubrics, playbook, domains || []);
      const result = {
        task,
        proposed_approach: proposedApproach || null,
        intent,
        mode,
        quality_gate: qualityGate || buildQualityGate(task, proposedApproach || "", intent, rubrics, playbook, domains || [], { force: true }),
        safety:
          "Read-only quality analysis only. This tool does not edit files, run commands, install packages, call upstream services, or enforce runtime policy."
      };
      return toolResult(formatQualityGate(result), result);
    }
  );

  mcpServer.registerTool(
    "vnem_orchestrate",
    {
      title: "Plan vnem Orchestration",
      description:
        "Route a prompt into VNEM's deterministic orchestration patterns: Single Agent for simple tasks, Orchestrator-Worker for coding/app/game work, and Split-and-Merge for complex research. Returns strict schemas, agent prompts, task claims, reflection-loop contracts, and shared-state guidance without executing models or mutating files.",
      inputSchema: {
        task: z.string().min(1).describe("User prompt, coding task, app/game build, or research request to route."),
        max_workers: z
          .number()
          .int()
          .min(1)
          .max(12)
          .default(5)
          .describe("Upper bound for recommended worker count. VNEM may choose fewer for determinism and cost control.")
      },
      annotations: READ_ONLY
    },
    async ({ task, max_workers: maxWorkers }) => {
      const plan = buildOrchestrationPlan(task, { maxWorkers });
      return toolResult(formatOrchestrationPlan(plan), plan);
    }
  );

  mcpServer.registerTool(
    "vnem_get_entry",
    {
      title: "Get vnem Entry",
      description:
        "Fetch one vnem registry entry by slug or exact name, including provenance, trust tier, install notes, permissions, and risk flags.",
      inputSchema: {
        slug: z.string().min(1).describe("Registry slug or exact entry name."),
        include_profile: z.boolean().default(false).describe("Include the local original profile markdown.")
      },
      annotations: READ_ONLY
    },
    async ({ slug, include_profile: includeProfile }) => {
      const entry = findEntry(slug);
      if (!entry) {
        return errorResult(`No vnem entry found for "${slug}". Try vnem_search first.`);
      }

      const profile = includeProfile ? await readProfile(entry) : null;
      const result = {
        ...entry,
        profile: profile || undefined
      };

      return toolResult(formatEntry(entry, profile), result);
    }
  );

  mcpServer.registerTool(
    "vnem_compare",
    {
      title: "Compare vnem Entries",
      description:
        "Compare registry entries by use cases, trust tier, install notes, permissions, risk flags, and alternatives.",
      inputSchema: {
        slugs: z.array(z.string().min(1)).min(2).max(8).describe("Registry slugs or exact names to compare.")
      },
      annotations: READ_ONLY
    },
    async ({ slugs }) => {
      const found = slugs.map((slug) => findEntry(slug)).filter(Boolean);
      const missing = slugs.filter((slug) => !findEntry(slug));
      if (found.length < 2) {
        return errorResult("Need at least two known vnem entries to compare. Try vnem_search first.");
      }

      const comparison = {
        entries: found.map(compareEntry),
        missing
      };

      return toolResult(formatComparison(comparison), comparison);
    }
  );

  mcpServer.registerTool(
    "vnem_best_practices",
    {
      title: "vnem Best Practices",
      description:
        "Find matching vnem best-practice and prompt-pattern notes for a build, review, prompt, agent, or tooling intent.",
      inputSchema: {
        intent: z.string().min(1).describe("Build/review/prompt/tooling intent to look up."),
        limit: z.number().int().min(1).max(12).default(6).describe("Maximum notes to return.")
      },
      annotations: READ_ONLY
    },
    async ({ intent, limit }) => {
      const resolvedIntent = resolveIntent(intent);
      const practices = relevantPracticeDocs(intent, resolvedIntent, limit);
      const result = {
        intent,
        resolved_intent: resolvedIntent,
        read_first: practices,
        route: resolvedIntent?.route || null
      };

      return toolResult(formatBestPractices(result), result);
    }
  );

  mcpServer.registerTool(
    "vnem_sources",
    {
      title: "vnem Source Radar",
      description:
        "Find upstream docs, registries, MCP sources, eval sources, and verification sources vnem should consult before recommending agentic tooling changes.",
      inputSchema: {
        intent: z.string().default("source radar").describe("Source, workflow, or decision intent to look up."),
        category: z
          .string()
          .optional()
          .describe("Optional source category filter such as protocol-registry, agent-client, current-docs, sensitive-connectors, or quality-evidence."),
        limit: z.number().int().min(1).max(12).default(8).describe("Maximum source radar entries to return.")
      },
      annotations: READ_ONLY
    },
    async ({ intent, category, limit }) => {
      const resolvedIntent = resolveIntent(intent);
      const results = sourceRadarResults(intent, category, limit);
      const result = {
        intent,
        category: category || null,
        resolved_intent: resolvedIntent,
        sources: results,
        safety:
          "Read-only source guidance only. Preserve source URLs and review permissions, licenses, and risk flags before promoting a source or installing any tool."
      };

      return toolResult(formatSourceRadar(result), result);
    }
  );
}

function registerResources(mcpServer) {
  registerFileResource(
    mcpServer,
    "vnem-search-index",
    "vnem://install/search-index",
    searchIndexPath,
    "vnem Search Index",
    "Generated search data used by the vnem MCP tools.",
    "application/json"
  );
  registerFileResource(
    mcpServer,
    "vnem-source-radar",
    "vnem://install/source-radar",
    firstExisting(["public/install/source-radar.json", ".vnem/source-radar.json"]),
    "vnem Source Radar",
    "Generated source intake map for official docs, registries, MCP sources, evals, and verification sources.",
    "application/json"
  );
  registerFileResource(
    mcpServer,
    "vnem-api-index",
    "vnem://api/index",
    apiIndexPath,
    "vnem API Index",
    "Generated static API index with full registry entry metadata.",
    "application/json"
  );
  registerFileResource(
    mcpServer,
    "vnem-operating-protocol",
    "vnem://install/operating-protocol",
    firstExisting(["public/install/operating-protocol.md", ".vnem/operating-protocol.md"]),
    "vnem Operating Protocol",
    "Generated universal operating loop for producing compact coding-agent task contracts.",
    "text/markdown"
  );
  registerFileResource(
    mcpServer,
    "vnem-install-guide",
    "vnem://install/install-guide",
    firstExisting(["public/install/install-guide.md", ".vnem/install-guide.md"]),
    "vnem Install And MCP Guide",
    "Generated setup guide for downloading the read-only pack, using the local installer, and connecting the stdio MCP server.",
    "text/markdown"
  );
  registerFileResource(
    mcpServer,
    "vnem-quality-contract",
    "vnem://install/quality-contract",
    firstExisting(["public/install/quality-contract.md", ".vnem/quality-contract.md"]),
    "vnem Quality Contract",
    "Generated holistic excellence contract, Triple-Check Workflow, quality floor, and intelligent trade-off policy.",
    "text/markdown"
  );
  registerFileResource(
    mcpServer,
    "vnem-orchestration-protocol",
    "vnem://install/orchestration-protocol",
    firstExisting(["public/install/orchestration-protocol.md", ".vnem/orchestration-protocol.md"]),
    "vnem Orchestration Protocol",
    "Generated deterministic routing, reflection, multi-agent coding, research split-and-merge, and shared-state protocol.",
    "text/markdown"
  );
  registerFileResource(
    mcpServer,
    "vnem-precision-execution-protocol",
    "vnem://install/precision-execution-protocol",
    firstExisting(["public/install/precision-execution-protocol.md", ".vnem/precision-execution-protocol.md"]),
    "vnem Precision Execution Protocol",
    "Generated opt-in precision execution protocol for exact patching, dynamic documentation, and safe terminal feedback.",
    "text/markdown"
  );
  registerFileResource(
    mcpServer,
    "vnem-omniscient-self-healing-protocol",
    "vnem://install/omniscient-self-healing-protocol",
    firstExisting(["public/install/omniscient-self-healing-protocol.md", ".vnem/omniscient-self-healing-protocol.md"]),
    "vnem Omniscient Context And Self-Healing Protocol",
    "Generated opt-in protocol for local semantic code search, red/green verification loops, and sandboxed ephemeral scripts.",
    "text/markdown"
  );
  registerFileResource(
    mcpServer,
    "vnem-coding-protocol",
    "vnem://install/coding-protocol",
    firstExisting(["public/install/coding-protocol.md", ".vnem/coding-protocol.md"]),
    "vnem Coding Protocol",
    "Generated coding execution protocol for repo sensing, plan-first work, small diffs, verification, and final reporting.",
    "text/markdown"
  );
  registerFileResource(
    mcpServer,
    "vnem-coding-playbooks",
    "vnem://install/coding-playbooks",
    firstExisting(["public/install/coding-playbooks.json", ".vnem/coding-playbooks.json"]),
    "vnem Coding Playbooks",
    "Generated mode-specific coding-agent playbooks for feature slices, root-cause bug fixes, tests, refactors, web apps, API/data work, reviews, large changes, and failure recovery.",
    "application/json"
  );
  registerFileResource(
    mcpServer,
    "vnem-task-rubrics",
    "vnem://install/task-rubrics",
    firstExisting(["public/install/task-rubrics.json", ".vnem/task-rubrics.json"]),
    "vnem Task Rubrics",
    "Generated broad task rubrics for agent quality bars, approval gates, verification, and reporting.",
    "application/json"
  );
  registerFileResource(
    mcpServer,
    "vnem-design-architecture",
    "vnem://install/design-architecture",
    firstExisting(["public/install/design-architecture.md", ".vnem/design-architecture.md"]),
    "vnem Design Architecture",
    "Generated source-backed design intelligence for UI, game, dashboard, visual polish, motion, sound, and conversational-agent surfaces.",
    "text/markdown"
  );
  registerFileResource(
    mcpServer,
    "vnem-visual-qa-protocol",
    "vnem://install/visual-qa-protocol",
    firstExisting(["public/install/visual-qa-protocol.md", ".vnem/visual-qa-protocol.md"]),
    "vnem Visual QA Protocol",
    "Generated rendered-quality loop for UI, game, dashboard, canvas, motion, sound, and brand-facing surfaces.",
    "text/markdown"
  );
  registerFileResource(
    mcpServer,
    "vnem-best-practices",
    "vnem://install/best-practices",
    firstExisting(["public/install/best-practices.md", ".vnem/best-practices.md"]),
    "vnem Best Practices",
    "Generated best-practice notes for agents.",
    "text/markdown"
  );
  registerFileResource(
    mcpServer,
    "vnem-agent-workspace",
    "vnem://install/agent-workspace",
    firstExisting(["public/install/agent-workspace.md", ".vnem/agent-workspace.md"]),
    "vnem Agent Workspace",
    "Generated guidance for autonomous developer environments, MCP gateways, memory files, and agent modes.",
    "text/markdown"
  );
  registerFileResource(
    mcpServer,
    "vnem-prompt-engineering",
    "vnem://install/prompt-engineering",
    firstExisting(["public/install/prompt-engineering.md", ".vnem/prompt-engineering.md"]),
    "vnem Prompt Engineering",
    "Generated prompt-engineering guidance for agents.",
    "text/markdown"
  );
  registerFileResource(
    mcpServer,
    "vnem-prompt-patterns",
    "vnem://install/prompt-patterns",
    firstExisting(["public/install/prompt-patterns.json", ".vnem/prompt-patterns.json"]),
    "vnem Prompt Patterns",
    "Generated prompt pattern data for agents.",
    "application/json"
  );
  registerFileResource(
    mcpServer,
    "vnem-daily-digest",
    "vnem://discovery/daily-digest",
    firstExisting(["discovery/daily-digest.md"]),
    "vnem Daily Digest",
    "Latest generated discovery digest.",
    "text/markdown"
  );
  registerFileResource(
    mcpServer,
    "vnem-readme",
    "vnem://repo/readme",
    firstExisting(["README.md"]),
    "vnem README",
    "Repository overview, install instructions, MCP usage, safety model, and local development commands.",
    "text/markdown"
  );
  registerFileResource(
    mcpServer,
    "vnem-product",
    "vnem://repo/product",
    firstExisting(["PRODUCT.md"]),
    "vnem Product Direction",
    "Product direction, public-site clarity goals, commercial boundaries, and non-regression bar.",
    "text/markdown"
  );
  registerFileResource(
    mcpServer,
    "vnem-security-roadmap",
    "vnem://repo/security-roadmap",
    firstExisting(["SECURITY-ROADMAP.md"]),
    "vnem Security Roadmap",
    "Advisory-first roadmap for zero-trust gateway, tool pinning, package firewall, AST indexing, and runtime-security ideas.",
    "text/markdown"
  );
  registerFileResource(
    mcpServer,
    "vnem-hermes",
    "vnem://repo/hermes",
    firstExisting(["HERMES.md"]),
    "vnem Hermes",
    "Discovery operating contract for recurring ecosystem scans and daily synthesis.",
    "text/markdown"
  );
  registerFileResource(
    mcpServer,
    "vnem-contributing",
    "vnem://repo/contributing",
    firstExisting(["CONTRIBUTING.md"]),
    "vnem Contributing",
    "Contribution requirements, branch workflow, trust tiers, and automation safety rules.",
    "text/markdown"
  );

  if (entries.length > 0) {
    mcpServer.registerResource(
      "vnem-entry",
      new ResourceTemplate("vnem://entries/{slug}", {
        list: async () => ({
          resources: entries.map((entry) => ({
            uri: `vnem://entries/${entry.slug}`,
            name: `entry:${entry.slug}`,
            title: entry.name,
            description: entry.summary_llm,
            mimeType: "application/json"
          }))
        }),
        complete: {
          slug: (value) =>
            entries
              .map((entry) => entry.slug)
              .filter((slug) => slug.startsWith(value))
              .slice(0, 30)
        }
      }),
      {
        title: "vnem Registry Entry",
        description: "A generated vnem registry entry as JSON.",
        mimeType: "application/json"
      },
      async (uri, variables) => {
        const slug = variableValue(variables.slug);
        const entry = findEntry(slug);
        if (!entry) {
          throw new Error(`Unknown vnem entry: ${slug}`);
        }
        return {
          contents: [
            {
              uri: uri.href,
              text: JSON.stringify(entry, null, 2),
              mimeType: "application/json"
            }
          ]
        };
      }
    );
  }
}

function registerPrompts(mcpServer) {
  mcpServer.registerPrompt(
    "vnem_research_task",
    {
      title: "Research with vnem",
      description:
        "Prompt an agent to use vnem before making an agentic tooling, MCP, memory, prompt, eval, or stack recommendation.",
      argsSchema: {
        task: z.string().min(1).describe("The task or tooling decision to research.")
      }
    },
    ({ task }) => ({
      description: "Use vnem as a read-only perception layer before recommending tools.",
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              `Use vnem for this task: ${task}`,
              "",
              "1. Call vnem_recommend with the task.",
              "2. For complex app, game, coding, or research tasks, call vnem_orchestrate and follow the selected orchestration pattern.",
              "3. For coding, UI, game, optimization, or production-readiness tasks, apply the returned quality_gate and Triple-Check Workflow.",
              "4. If mutation-capable precision tools are available, read vnem://install/precision-execution-protocol before exact patching, current-doc fetches, or safe terminal checks.",
              "5. If semantic code search, red/green verification loops, or ephemeral scripts are available, read vnem://install/omniscient-self-healing-protocol before using them.",
              "6. Read the returned best-practice notes and top registry entries.",
              "7. Report the vnem intent searched, top matches, orchestration pattern when used, quality gate verdict, recommendation, why, and any source-trust uncertainty.",
              "8. Do not install tools, edit files, or call external services unless I ask for that separately."
            ].join("\n")
          }
        }
      ]
    })
  );
}

function registerFileResource(mcpServer, name, uri, relativePath, title, description, mimeType) {
  if (!relativePath) {
    return;
  }

  const fullPath = safePath(relativePath);
  if (!fullPath || !existsSync(fullPath)) {
    return;
  }

  mcpServer.registerResource(
    name,
    uri,
    {
      title,
      description,
      mimeType
    },
    async () => ({
      contents: [
        {
          uri,
          text: await readFile(fullPath, "utf8"),
          mimeType
        }
      ]
    })
  );
}

function searchDocuments(query, options = {}) {
  const limit = options.limit || 8;
  const types = new Set((options.types || []).map(normalize));
  const trustTiers = new Set(options.trustTiers || []);
  const explicitTrust = trustTiers.size > 0;
  const intent = resolveIntent(query);
  const terms = tokenize(query);
  const queryText = normalize(query);

  return documents
    .map((document) => {
      const score = scoreDocument(document, terms, queryText, intent);
      return { document, score };
    })
    .filter(({ document, score }) => {
      if (score <= 0) {
        return false;
      }
      if (types.size && !types.has(normalize(document.type)) && !types.has(normalize(document.kind))) {
        return false;
      }
      if (explicitTrust && !trustTiers.has(document.trust_tier)) {
        return false;
      }
      if (!explicitTrust && !options.includeWatchlist) {
        return document.trust_tier !== "watchlist" && document.trust_tier !== "deprecated";
      }
      return true;
    })
    .sort((a, b) => b.score - a.score || String(a.document.title).localeCompare(String(b.document.title)))
    .slice(0, limit)
    .map(({ document, score }) => enrichDocument(document, score));
}

function relevantPracticeDocs(query, intent, limit) {
  const routedIds = new Set(intent?.route?.read_first || []);
  const routedDocs = [...routedIds]
    .map((id) => documentsById.get(id))
    .filter(Boolean)
    .map((document) => enrichDocument(document, 100));

  const searched = searchDocuments(query, {
    limit: limit + routedDocs.length + 8,
    includeWatchlist: true
  }).filter((match) => match.kind === "best-practice" || match.kind === "prompt-pattern");

  const merged = [];
  const seen = new Set();
  for (const match of [...routedDocs, ...searched]) {
    if (!seen.has(match.id)) {
      merged.push(match);
      seen.add(match.id);
    }
  }
  return merged.slice(0, limit);
}

function sourceRadarResults(intent, category, limit) {
  const query = [intent, category].filter(Boolean).join(" ");
  const queryText = normalize(query);
  const terms = tokenize(query);
  const categoryText = normalize(category);

  return sourceRadar
    .map((source) => {
      const haystack = normalize([
        source.id,
        source.title,
        source.category,
        source.priority,
        source.summary,
        ...(source.use_when || []),
        ...(source.monitor || []),
        ...(source.risk_checks || []),
        ...(source.source_urls || [])
      ].join(" "));

      let score = source.priority === "critical" ? 30 : source.priority === "high" ? 24 : 14;
      if (categoryText && normalize(source.category) === categoryText) {
        score += 30;
      }
      if (queryText && haystack.includes(queryText)) {
        score += 25;
      }
      for (const term of terms) {
        if (haystack.includes(term)) {
          score += 5;
        }
      }

      return {
        ...source,
        rank_score: score
      };
    })
    .filter((source) => source.rank_score > 0)
    .sort((a, b) => b.rank_score - a.rank_score || String(a.title).localeCompare(String(b.title)))
    .slice(0, limit);
}


const CORE_TASK_CATEGORIES = [
  "simple_stable_question",
  "simple_explanation",
  "prompt_improvement",
  "summarization_of_user_text",
  "local_debugging",
  "repo_modification",
  "ui_web_change",
  "ui_redesign",
  "current_research",
  "security_safety",
  "file_analysis",
  "high_stakes_advice",
  "public_facing_claim",
  "deployment_workflow",
  "coding/debugging",
  "UI/web/app improvement",
  "research/current information",
  "security/safety review",
  "compatibility investigation",
  "API/tool integration",
  "local project action",
  "dependency/package maintenance",
  "Git/GitHub workflow",
  "dashboard/control-surface work",
  "benchmark/evaluation",
  "documentation-only",
  "user troubleshooting"
];
const MEMORY_SCOPE_TAGS = ["user-specific", "project-specific", "workspace-specific", "tool-specific", "mcp-client-specific", "os-specific", "shell-specific", "package-specific", "api-specific", "game-specific", "mod-specific", "domain-pattern", "universal-pattern", "temporary", "outdated", "unverified", "verified"];
const EVIDENCE_LABELS = ["proven", "tested", "supported", "likely", "assumed", "unknown", "blocked", "failed", "not_attempted", "preparation_only"];

function buildCoreRoutingRecord(args = {}) {
  const task = String(args.task || "").trim();
  const known = String(args.known_context || "").trim();
  const hay = normalize(`${task} ${known}`);
  const categories = inferCoreTaskCategories(task, known);
  const memory = classifyMemoryForTask(task, known, args.memory_items || []);
  const missing = buildMaterialMissingContext(task, known, categories);
  const anti = buildAntiStagnationCheck({ task, completed_areas: args.completed_areas || [], proposed_next_step: task, recent_actions: [] });
  const selection = selectToolsForTask({ task, known_context: known, available_tools: args.available_tools || [] });
  const toolsPermissionPlanning = buildCorePermissionProfilePlan(task, known, selection.selected_tools);
  const research = assessResearchNeed({ task, known_context: known });
  const effortBudget = buildEffortBudget({ user_goal: task, known_context: known, token_budget: args.token_budget || "normal" });
  const criticalQuestions = missing.filter((item) => item.ask_now);
  const needTools = categories.includes("documentation-only") && !/inspect|workspace|repo|local files|browser|source|security|fix|implement|debug|dashboard|git|package/.test(hay)
    ? false
    : (!categories.includes("documentation-only") || /inspect|workspace|repo|local|test|prove|browser|source|security|fix|implement|debug|dashboard|git|package/.test(hay));
  const compatRisks = inferCompatibilityRisks(task, known, categories, memory.relevant_memory_used);
  const safetyRisks = inferSafetyRisks(task, known, categories);
  const requiredEvidence = inferRequiredEvidence(categories, selection.selected_tools, research);
  const nextBestAction = anti.should_continue_same_area === false
    ? anti.recommended_next_action
    : criticalQuestions.length
      ? `Ask the minimum blocking question(s): ${criticalQuestions.map((q) => q.question).slice(0, 2).join(" | ")}`
      : needTools
        ? "Proceed with Core plan-only handoff, then use Tools MCP for targeted inspection/evidence with dry-run/approval where required."
        : "Proceed with compact answer using provided context; no extra question needed.";
  return {
    user_goal: task,
    task_categories: categories,
    relevant_memory_found: memory.relevant_memory_used.length > 0,
    relevant_memory_used: memory.relevant_memory_used,
    memory_ignored: memory.memory_ignored,
    memory_scope_tags_supported: MEMORY_SCOPE_TAGS,
    missing_context: missing,
    must_ask_user: criticalQuestions.length > 0,
    reason_for_asking_or_not_asking: criticalQuestions.length
      ? "Missing context materially affects correctness, compatibility, safety, or usefulness."
      : "No blocking missing context detected; safe defaults or Tools MCP inspection can cover remaining low-impact gaps.",
    needed_capabilities: selection.selected_tools,
    need_tools_mcp: needTools,
    effort_mode: effortBudget.effort_mode,
    task_type: effortBudget.task_type,
    clarification_question_needed: effortBudget.clarification_question_needed,
    clarification_question_reason: effortBudget.clarification_question_reason,
    question_count_limit: effortBudget.clarification_question_needed ? 1 : 0,
    assumption_allowed: !effortBudget.clarification_question_needed,
    assumption_must_be_labeled: true,
    need_current_research: Boolean(research.current_info_required || research.external_search_required || effortBudget.research_needed),
    tools_permission_planning: toolsPermissionPlanning,
    compatibility_risks: compatRisks,
    safety_risks: safetyRisks,
    required_evidence: requiredEvidence,
    next_best_action: nextBestAction,
    anti_stagnation: anti,
    must_not_claim: [
      "Core executed Tools MCP actions.",
      "Current/live research, files, tests, browser proof, or visual verification happened without evidence.",
      "Relevant memory was used if it was ignored as irrelevant, outdated, conflicting, or unverified.",
      "The task is done/compatible/safe without required evidence.",
      "Tools MCP actions were allowed by the active permission profile, approved, or executed without Tools permission/evidence output."
    ],
    core_executes_tools: false,
    core_plan_only: true
  };
}

function inferCoreTaskCategories(task, known = "") {
  const text = normalize(`${task} ${known}`);
  const out = new Set();
  const classified = classifyAdaptiveTaskType(task, known);
  if (classified) out.add(classified);
  if (classified === "ui_redesign" || classified === "ui_web_change") out.add("UI/web/app improvement");
  if (classified === "local_debugging") out.add("coding/debugging");
  if (classified === "repo_modification") out.add("local project action");
  if (classified === "current_research") out.add("research/current information");
  if (classified === "security_safety") out.add("security/safety review");
  if (classified === "deployment_workflow") out.add("Git/GitHub workflow");
  if (/debug|bug|failing|failure|error|stack trace|fix|implement|code|test|build|refactor/.test(text)) out.add("coding/debugging");
  if (/ui|ux|frontend|web app|website|browser|visual|responsive|accessibility|dashboard/.test(text)) out.add("UI/web/app improvement");
  if (/research|current|latest|today|news|source|citation|docs|compare|recommend|best|patch/.test(text)) out.add("research/current information");
  if (/security|safety review|safe\?|risk|malware|phishing|credential|secret|trust boundary|suspicious|login link/.test(text)) out.add("security/safety review");
  if (/compatib|version|os|shell|windows|linux|mac|node|npm|browser|mcp client|mod|loader|dependency/.test(text)) out.add("compatibility investigation");
  if (/api|tool integration|mcp|provider|webhook|oauth|sdk|plugin/.test(text)) out.add("API/tool integration");
  if (/local|workspace|repo|project|file|patch|edit|run|inspect|prove/.test(text)) out.add("local project action");
  if (/dependency|package|npm|pnpm|yarn|lockfile|audit|install|upgrade/.test(text)) out.add("dependency/package maintenance");
  if (/git|github|branch|commit|push|pull request|pr|ci|actions/.test(text)) out.add("Git/GitHub workflow");
  if (/dashboard|control surface|control-surface|telemetry|builder|ard/.test(text)) out.add("dashboard/control-surface work");
  if (/benchmark|eval|evaluation|measure|score|regression suite/.test(text)) out.add("benchmark/evaluation");
  if (/readme|docs?|documentation|explain|write a short|guide|instructions/.test(text) && !/implement|fix|code change|patch|dashboard ui|app feature/.test(text)) out.add("documentation-only");
  if (/troubleshoot|help me|user problem|support|setup|install issue|not working/.test(text)) out.add("user troubleshooting");
  if (!out.size) out.add("user troubleshooting");
  return CORE_TASK_CATEGORIES.filter((cat) => out.has(cat));
}

function classifyMemoryForTask(task, known, items) {
  const taskText = normalize(`${task} ${known}`);
  const taskTerms = new Set(tokenize(taskText));
  const relevant_memory_used = [];
  const memory_ignored = [];
  for (const raw of Array.isArray(items) ? items : []) {
    const item = typeof raw === "string" ? { content: raw } : (raw || {});
    const content = String(item.content || item.text || item.note || "");
    const scope_tags = uniqueStrings(routeArrayify(item.scope_tags || item.tags || item.scope).map((tag) => String(tag).trim()).filter(Boolean));
    const id = item.id || stableMemoryId(content);
    const memoryText = normalize(`${content} ${scope_tags.join(" ")}`);
    const outdated = scope_tags.includes("outdated") || /\boutdated\b|old draft|deprecated/.test(memoryText);
    const unverified = scope_tags.includes("unverified") || /\bunverified\b|guess|maybe/.test(memoryText);
    const verified = scope_tags.includes("verified") || /\bverified\b|real git checkout|passed|confirmed/.test(memoryText);
    const conflict = /conflict|contradict|wrong path|different workspace/.test(memoryText) && sharesAnyTerm(taskTerms, tokenize(memoryText));
    const relevance = memoryRelevanceScore(taskText, taskTerms, memoryText, scope_tags);
    const domainMismatch = scope_tags.some((tag) => /game-specific|mod-specific/.test(tag)) && !/elden ring|rng lands|mod|modding|game|build|loadout|dlc|pve|pvp/.test(taskText);
    const base = { id, content, scope_tags, relevance_score: relevance };
    if (domainMismatch) memory_ignored.push({ ...base, classification: "ignored", reason: "Game/mod-specific memory does not materially apply to this non-game task." });
    else if (outdated) memory_ignored.push({ ...base, classification: "outdated", reason: "Memory is tagged or detected as outdated for this task." });
    else if (conflict) memory_ignored.push({ ...base, classification: "conflicting", reason: "Memory conflicts with current task/context and needs fresh evidence before use." });
    else if (relevance >= 3 && !unverified) relevant_memory_used.push({ ...base, classification: "used", verification_status: verified ? "verified" : "unverified" });
    else if (relevance >= 3 && unverified) memory_ignored.push({ ...base, classification: "unverified", reason: "Potentially relevant but unverified; use only as a search/check hint, not as fact." });
    else memory_ignored.push({ ...base, classification: "ignored", reason: "No material relevance to the current task." });
  }
  return { relevant_memory_used, memory_ignored };
}

function memoryRelevanceScore(taskText, taskTerms, memoryText, tags) {
  let score = 0;
  for (const term of tokenize(memoryText)) if (taskTerms.has(term)) score += 1;
  if (/\bvnem\b/.test(taskText) && /\bvnem\b|vnem-src/.test(memoryText)) score += 4;
  if (/dashboard|ui|frontend/.test(taskText) && /dashboard|ui|frontend/.test(memoryText)) score += 3;
  if (/windows|powershell|bash|shell|cmd/.test(taskText) && tags.some((tag) => /os-specific|shell-specific/.test(tag))) score += 3;
  if (/api|oauth|cors|sdk/.test(taskText) && tags.some((tag) => /api-specific|tool-specific|package-specific/.test(tag))) score += 3;
  if (/elden ring|mod|game|build/.test(taskText) && tags.some((tag) => /game-specific|mod-specific/.test(tag))) score += 3;
  if (/workspace|repo|project|local/.test(taskText) && tags.some((tag) => /workspace-specific|project-specific/.test(tag))) score += 2;
  if (/security|safe|phishing|credential/.test(taskText) && /security|credential|phishing|secret|safe/.test(memoryText)) score += 3;
  return score;
}

function buildMaterialMissingContext(task, known, categories) {
  const text = normalize(`${task} ${known}`);
  const missing = [];
  const add = (id, question, reason, ask_now = true) => missing.push({ id, question, reason, ask_now });
  if (categories.includes("research/current information") && /elden ring|build|loadout|best|op|meta/.test(text)) {
    if (!/(pve|pvp|duel|invasion|arena)/.test(text)) add("game_mode", "Is this for PvE, PvP, co-op, or mixed play?", "Build recommendations change materially by mode.", true);
    if (/elden ring/.test(text) && !/(base game|dlc|shadow of the erdtree|sote)/.test(text)) add("dlc_ownership", "Should DLC/Shadow of the Erdtree items be included or base-game only?", "Availability and current build advice depend on DLC scope.", true);
  }
  if (categories.includes("coding/debugging") && /debug|bug|failing|failure|fix/.test(text) && (!/(error|log|stack trace|failing command|repro|test output|command output)/.test(text) || /no logs?|without logs?|no failing command|not supplied|missing/.test(text))) {
    add("debug_repro", "What exact error, log, failing command, or repro steps show the failure?", "Root-cause debugging needs a red-capable loop before fixes.", true);
  }
  if (categories.includes("local project action") && !/(repo path|workspace|project root|c:\/vnem|c:\\vnem|tools mcp can inspect|allowed root)/.test(text)) {
    add("workspace_scope", "Which workspace/project root should Tools MCP inspect?", "Workspace scope affects safe file reads and evidence.", false);
  }
  if (categories.includes("security/safety review")) {
    if (!/(https?:\/\/|file hash|sha256|attachment id|source artifact|url:\s*https?:\/\/)/.test(text)) add("security_artifact", "What exact link/file/source should be reviewed?", "Security/safety review needs the exact artifact/source boundary, not just a generic link description.", true);
    if (!/(stranger|trusted|official|own account|permission|authorized|phishing|credential|login)/.test(text)) add("trust_boundary", "Who provided it and what trust/account boundary applies?", "Trust boundary changes safe handling and what must not be clicked or entered.", true);
  }
  if (categories.includes("API/tool integration") && /\b(api|oauth|sdk|webhook|cors|api key|external service)\b/.test(text) && !/(auth|cors|https|server|backend|frontend|api key|oauth|docs)/.test(text)) {
    add("api_boundary", "What auth/CORS/HTTPS/frontend-backend boundary applies?", "API/tool integrations can expose secrets or fail in browsers without boundary evidence.", true);
  }
  return uniqueBy(missing, (item) => item.id);
}

function inferCompatibilityRisks(task, known, categories, usedMemory) {
  const text = normalize(`${task} ${known} ${JSON.stringify(usedMemory)}`);
  const risks = [];
  if (/windows|powershell|bash|cmd|shell/.test(text)) risks.push("OS/shell command syntax may differ; use the current host shell evidence before command handoff.");
  if (categories.includes("dependency/package maintenance")) risks.push("Package manager, lockfile, install scripts, and Node/npm versions affect compatibility.");
  if (categories.includes("UI/web/app improvement")) risks.push("Browser/runtime and localhost availability affect UI/browser proof.");
  if (/mcp client|claude|cursor|codex|hermes/.test(text)) risks.push("MCP client support and tool schema handling may differ by client.");
  if (/elden ring|mod|game/.test(text)) risks.push("Game version, DLC, mod loader, save safety, and file formats affect compatibility.");
  if (!risks.length) risks.push("No blocking compatibility risk detected yet; verify with task-appropriate evidence before final claims.");
  return uniqueStrings(risks);
}

function inferSafetyRisks(task, known, categories) {
  const text = normalize(`${task} ${known}`);
  const risks = [];
  if (/credential|secret|token|api key|login|auth/.test(text)) risks.push("Credential/auth boundary: do not collect, print, enter, or store secrets.");
  if (/phishing|malware|suspicious|download|installer|captcha|redirect/.test(text)) risks.push("Suspicious browser/source risk: do not bypass CAPTCHA, follow risky redirects, or run downloads/installers automatically.");
  if (/push|deploy|publish|delete|overwrite|global|install/.test(text)) risks.push("External/persistent side effects need explicit approval, evidence, and rollback plan.");
  if (categories.includes("local project action")) risks.push("Local project actions must be scoped to allowed roots, dry-run first for mutation, and evidence logged.");
  return uniqueStrings(risks.length ? risks : ["No high-risk action detected from the task text; Core remains plan-only."]);
}

function inferRequiredEvidence(categories, selectedTools, research) {
  const evidence = ["routing record with task categories, missing-context decision, risks, and must-not-claim limits"];
  if (categories.includes("coding/debugging")) evidence.push("failing command/log/repro first for debugging; targeted test/build output after changes");
  if (categories.includes("UI/web/app improvement")) evidence.push("browser/visual/localhost or honest browser_unavailable evidence plus accessibility/responsive state checks");
  if (categories.includes("research/current information") || research.current_info_required) evidence.push("current/official/provider-backed source evidence, source quality, claim/source matrix, and research gap list");
  if (categories.includes("security/safety review")) evidence.push("artifact/source boundary, URL/reputation/redirect/CAPTCHA/download risk classification, and safe handoff");
  if (categories.includes("compatibility investigation")) evidence.push("compatibility status label with exact evidence: tested/supported/likely/unknown/blocked");
  if (selectedTools.includes("vnem_tools_finish_session")) evidence.push("Tools session evidence pack before final done/safe/compatible claims");
  return uniqueStrings(evidence);
}


function classifyAdaptiveTaskType(task, known = "") {
  const text = normalize(`${task} ${known}`);
  if (/\b(deploy|deployment|release|publish|cloudflare|wrangler)\b/.test(text)) return "deployment_workflow";
  if (/\b(commit|push|pull request|pr|patch this repo|edit this repo|make code changes|repo changes|git\b|ci\b)\b/.test(text)) return "repo_modification";
  if (/\b(debug|stack trace|failing|failure|error log|root cause|crash|regression)\b/.test(text)) return "local_debugging";
  if (/\b(redesign|make.*look better|website.*better|landing page.*better|visual redesign|ui redesign)\b/.test(text)) return "ui_redesign";
  if (/\b(ui|ux|frontend|website|web app|browser proof|visual|responsive|accessibility|component|dashboard)\b/.test(text)) return "ui_web_change";
  if (/\b(current|latest|right now|today|policy|requirements|price|version|patch notes|refund|news)\b/.test(text)) return "current_research";
  if (/\b(security|safe to use|phishing|malware|suspicious|account|login link|credential|token|cookie|session|medical|legal|financial)\b/.test(text)) return "security_safety";
  if (/\b(file|log|source file|analyze this file|read this|attachment)\b/.test(text)) return "file_analysis";
  if (/\b(public-facing|public claim|announcement|press|production claim)\b/.test(text)) return "public_facing_claim";
  if (/\b(prompt|system prompt|instructions|improve this prompt)\b/.test(text)) return "prompt_improvement";
  if (/\b(summarize|summary|tldr|tl;dr)\b/.test(text) && /\b(pasted|provided|above|this text|user provided)\b/.test(text)) return "summarization_of_user_text";
  if (/\b(what does|what is|explain|meaning of|define|how do you say)\b/.test(text) && !/\b(current|latest|right now|policy|price|security|safe|file|repo|debug|website|redesign)\b/.test(text)) return "simple_stable_question";
  if (/\b(explain|how does|why does)\b/.test(text) && !/\b(current|latest|right now|security|file|repo|debug)\b/.test(text)) return "simple_explanation";
  if (/\b(doctor|law|medical|financial|tax|investment|legal)\b/.test(text)) return "high_stakes_advice";
  return null;
}

function effortModeForTaskType(type, text) {
  if (["repo_modification", "deployment_workflow", "public_facing_claim"].includes(type)) return "max_verification";
  if (["local_debugging", "ui_redesign", "ui_web_change", "security_safety", "file_analysis", "high_stakes_advice"].includes(type)) return "deep_proof";
  if (type === "current_research") return /security|safe|legal|medical|financial|download/.test(text) ? "deep_proof" : "standard";
  if (["prompt_improvement", "summarization_of_user_text"].includes(type)) return "quick_plan";
  if (["simple_stable_question", "simple_explanation"].includes(type)) return "instant_answer";
  return "standard";
}

function buildEffortBudget(args = {}) {
  const userGoal = String(args.user_goal || args.task || "").trim();
  const known = String(args.known_context || "").trim();
  const text = normalize(`${userGoal} ${known}`);
  const taskType = classifyAdaptiveTaskType(userGoal, known) || "standard";
  const mode = effortModeForTaskType(taskType, text);
  const researchNeeded = needsExternalResearchForAdaptive(taskType, text);
  const toolsNeeded = !["instant_answer", "quick_plan"].includes(mode) || ["ui_redesign", "ui_web_change", "local_debugging", "repo_modification", "security_safety", "file_analysis", "deployment_workflow"].includes(taskType);
  const recommendedTools = recommendedCoreToolsForEffort(taskType, mode, researchNeeded);
  const recommendedMcpTools = recommendedToolsMcpForEffort(taskType, mode, researchNeeded);
  const clarify = clarificationDecisionForTask(taskType, text, userGoal, known);
  const evidenceRequired = evidenceForEffort(taskType, mode, researchNeeded);
  const evidenceNotRequired = evidenceNotRequiredForEffort(taskType, mode);
  return {
    user_goal: userGoal,
    task_type: taskType,
    effort_mode: mode,
    reason_for_mode: reasonForEffortMode(taskType, mode, researchNeeded),
    speed_priority: ["instant_answer", "quick_plan"].includes(mode) ? "high" : mode === "standard" ? "medium" : "lower_than_truth_quality",
    quality_priority: ["deep_proof", "max_verification"].includes(mode) ? "very_high" : "quality_floor_enforced",
    truth_over_comfort_status: "enforced",
    no_sugarcoating_status: "enforced",
    uncertainty_must_be_labeled_status: "enforced",
    harsh_truth_quality_status: "enforced",
    research_decision: researchNeeded ? "research_or_source_verification_required" : "no_external_research_required_for_stable_or_user_provided_context",
    research_needed: researchNeeded,
    why_research_is_or_is_not_needed: researchReason(taskType, text, researchNeeded),
    tool_budget: { tools_needed: toolsNeeded, budget: toolBudgetForMode(mode), rule: toolsNeeded ? "Use only tools that materially improve truth, quality, safety, evidence, design, or result." : "Avoid Tools; direct answer is enough after Core classification." },
    token_budget_guidance: tokenBudgetGuidance(mode),
    evidence_required: evidenceRequired,
    evidence_not_required: evidenceNotRequired,
    recommended_core_tools: recommendedTools,
    recommended_tools_mcp_tools: recommendedMcpTools,
    tools_to_avoid: toolsToAvoidForEffort(mode, taskType),
    wasted_tool_risk: wastedToolRisk(mode, taskType),
    clarification_question_needed: clarify.needed,
    clarification_question_reason: clarify.reason,
    question_count_limit: clarify.needed ? 1 : 0,
    assumption_allowed: !clarify.needed,
    assumption_must_be_labeled: true,
    escalation_triggers: escalationTriggersForEffort(),
    answer_shape: answerShapeForMode(mode),
    must_not_claim: mustNotClaimForEffort(mode, taskType, researchNeeded),
    core_plan_only: true
  };
}

function buildFastAnswerContract(args = {}) {
  const task = String(args.task_summary || args.task || "").trim();
  const known = String(args.known_context || "").trim();
  const budget = buildEffortBudget({ user_goal: task, known_context: known, token_budget: args.token_budget || "compact" });
  const direct = ["instant_answer", "quick_plan"].includes(budget.effort_mode) && !budget.research_needed && !budget.clarification_question_needed;
  return {
    task_summary: task,
    should_answer_directly: direct,
    core_used_for_classification: true,
    max_sections: direct ? 1 : budget.effort_mode === "quick_plan" ? 3 : 5,
    max_bullets: direct ? 5 : budget.effort_mode === "quick_plan" ? 7 : 10,
    tools_needed: budget.tool_budget.tools_needed,
    research_needed: budget.research_needed,
    why_research_is_or_is_not_needed: budget.why_research_is_or_is_not_needed,
    ask_clarifying_question: budget.clarification_question_needed,
    clarification_question_required_reason: budget.clarification_question_reason,
    answer_first_rule: true,
    harsh_truth_rule: true,
    uncertainty_style: "Label unknown/assumed/current-source-needed plainly; do not comfort with false certainty.",
    forbidden_overhead: ["long audit report", "unnecessary tool plan", "generic safety boilerplate", "fake certainty", "pointless clarification", "proof section without proof"],
    escalation_triggers: budget.escalation_triggers,
    core_plan_only: true
  };
}

const DESIGN_TOTAL_IMPACT_AXES = [
  "visual beauty",
  "brand fit",
  "conversion/sales clarity",
  "usability",
  "content hierarchy",
  "typography",
  "spacing/layout",
  "mobile polish",
  "animation/interactivity",
  "originality",
  "performance/feel",
  "trust/accessibility basics",
  "overall user impact"
];

function buildDesignAmbitionPlan(args = {}) {
  const userGoal = String(args.user_goal || "").trim();
  const site = String(args.referenced_site_or_product || "").trim();
  const known = String(args.known_context || "").trim();
  const explicitStyle = detectUserDesignStyle(`${args.user_requested_style || ""} ${userGoal}`);
  const text = normalize(`${userGoal} ${site} ${known}`);
  const business = inferBusinessDesignContext(text, site);
  const shouldAdapt = !explicitStyle;
  const direction = explicitStyle || business.defaultDirection;
  return {
    user_goal: userGoal,
    referenced_site_or_product: site || null,
    user_specified_style: Boolean(explicitStyle),
    should_adapt_to_existing_brand: shouldAdapt,
    inferred_brand_direction: explicitStyle ? `Follow explicit ${explicitStyle} direction while preserving conversion clarity.` : business.defaultDirection,
    audience_and_conversion_goal: business.audience,
    design_reference_needed: /website|site|landing|redesign|restaurant|pizza|delivery|unknown/.test(text),
    design_reference_plan: ["Inspect the original/reference when available.", `Compare against 2-3 comparable ${business.referenceClass} sites only when it materially improves direction.`, "Use references to beat the original, not to copy it."],
    force_user_to_choose_design_directions: false,
    visual_ambition_level: explicitStyle ? "high_user_directed" : "high_adaptive_brand_fit",
    design_quality_targets: ["first screen must have a strong opinion", "not a generic template", "visible hierarchy and conversion clarity", "better than original/reference, not merely different"],
    total_impact_required: true,
    total_impact_requirements: DESIGN_TOTAL_IMPACT_AXES.map((axis) => `Improve ${axis} without sacrificing the other redesign axes.`),
    avoid_one_axis_optimization: true,
    comparison_scorecard_required: true,
    before_after_evidence_required: true,
    before_after_evidence_requirements: ["desktop and mobile before/after screenshots or browser evidence", "original/reference vs new comparison across all total-impact axes", "label mixed/worse/not-proven honestly"],
    typography_targets: ["distinct type scale", "strong headline rhythm", "readable body copy", "brand-fit weight/spacing"],
    layout_targets: ["clear hero", "strong CTA path", "scannable sections", "mobile-first responsive composition"],
    animation_interaction_targets: ["purposeful microinteractions when useful", "no distracting motion", "respect reduced-motion", "animation supports the requested style if specified"],
    mobile_quality_targets: ["thumb-safe CTA", "no cramped hero", "fast menu/contact/conversion path", "desktop and mobile proof before claims"],
    content_hierarchy_targets: ["offer/value first", "proof/social/menu/features next", "CTA repeated at decision points", "avoid equal-weight card soup"],
    brand_personality_targets: explicitStyle ? [`user-specified ${explicitStyle}`, "do not dilute the requested tone"] : business.personality,
    what_original_site_does_poorly: ["unknown until inspected; do not copy weak original styling", "likely risks: weak hero, generic typography, poor CTA hierarchy, weak mobile polish"],
    how_new_design_must_be_better: ["stronger first impression", "clearer conversion path", "better typography/spacing", "better mobile layout", "browser/visual proof before visual claims"],
    directions_considered_internally: designDirectionsForBusiness(business, explicitStyle),
    selected_direction: direction,
    why_selected_direction: explicitStyle ? "The user specified this style, so it overrides the old brand unless it conflicts with safety/usability." : "No style was specified, so VNEM adapts to the business, audience, content, and conversion goal instead of forcing a preset style.",
    must_not_do: ["ask user to pick 3 design directions by default", "force premium/modern/minimal/fun/corporate by default", "copy weak original design choices", "ship a generic template", "ignore user-specified style", "claim visual improvement without visual/browser proof"],
    must_not_claim: ["visually better without screenshots/before-after proof", "brand fit without inspecting/adapting to business/audience", "responsive without multiple viewport evidence", "accessibility improved without audit evidence"],
    core_plan_only: true
  };
}

function buildVisualTasteAudit(args = {}) {
  const goal = String(args.user_goal || "");
  const summary = String(args.design_summary || "");
  const userStyle = String(args.user_requested_style || "");
  const evidence = [...routeArrayify(args.evidence), ...routeArrayify(args.screenshots_or_visual_evidence)];
  const beforeAfter = routeArrayify(args.before_after_evidence);
  const text = normalize(`${goal} ${summary} ${userStyle} ${evidence.join(" ")}`);
  const generic = /generic|template|plain cards|blue button|corporate|minimal homepage|stock|card grid|centered hero/.test(text);
  const weakVisual = /weak|boring|plain|bad spacing|poor hierarchy|no brand|no animation|no mobile|muted blue/.test(text) || generic;
  const requested = detectUserDesignStyle(userStyle || goal);
  const requestedWords = requested ? normalize(requested).split(" ").filter(Boolean) : [];
  const summaryNorm = normalize(summary);
  const styleMismatch = Boolean(requested && requestedWords.length && !requestedWords.every((word) => summaryNorm.includes(word)) && !summaryNorm.includes(requestedWords[0]));
  const missingVisualProof = !hasVisualEvidence(evidence);
  const missingBeforeAfter = /better|improved|redesign|original|reference/.test(text) && !beforeAfter.length && !/before.*after|after.*before|comparison/.test(text);
  const oneAxis = detectOneAxisOptimization(text);
  const inflated = detectInflatedDesignScore(text, evidence, beforeAfter);
  const actuallyBetterRisk = /better|improved|redesign|original|reference|new version/.test(text) && (missingVisualProof || missingBeforeAfter || oneAxis || /unknown|not evidenced|uncertain|worse|mixed/.test(text));
  const issues = [];
  if (generic) issues.push("generic/template-like look; not enough brand-specific taste");
  if (/hero/.test(text) || generic) issues.push("hero/CTA/hierarchy needs stronger visual direction");
  if (/typography|plain|generic|boring/.test(text)) issues.push("typography/spacing/hierarchy are weak or unproven");
  if (/mobile|responsive|redesign|website/.test(text) && !/mobile screenshot|viewport|390|responsive evidence/.test(text)) issues.push("mobile polish is missing or unproven");
  if (styleMismatch) issues.push(`design ignores user-specified style: ${requested}`);
  if (inflated) issues.push("inflated_design_score: design score appears too high for the evidence supplied");
  if (oneAxis) issues.push("one_axis_design_optimization: design optimizes one visible axis while total impact is unknown or weak");
  if (actuallyBetterRisk) issues.push("actually_better_than_original_risk: new design may be mixed, worse, or not proven better than original/reference");
  if (missingVisualProof) issues.push("missing visual/browser proof");
  if (missingBeforeAfter) issues.push("missing before/after comparison for better-than-original claim");
  const scorePenalty = (generic ? 25 : 0) + (weakVisual ? 15 : 0) + (styleMismatch ? 25 : 0) + (missingVisualProof ? 20 : 0) + (missingBeforeAfter ? 10 : 0) + (inflated ? 12 : 0) + (oneAxis ? 16 : 0);
  const visualScore = Math.max(0, 90 - scorePenalty);
  return {
    verdict: issues.length ? (missingVisualProof || styleMismatch || inflated || actuallyBetterRisk ? "blocked" : "revise") : "pass_with_evidence",
    visual_quality_score: visualScore,
    brand_fit_score: styleMismatch ? 35 : generic ? 50 : 80,
    ambition_score: generic ? 35 : weakVisual ? 55 : 82,
    usability_score: /unclear|cramped|bad|weak.*usability|usability.*unknown/.test(text) ? 45 : 75,
    mobile_score: /mobile screenshot|viewport|responsive evidence|390/.test(text) ? 80 : 45,
    animation_interaction_score: /animation|motion|interaction|microinteraction/.test(text) && !/no animation/.test(text) ? 75 : 45,
    originality_score: generic ? 30 : 72,
    conversion_clarity_score: /cta|conversion|order|book|buy|contact/.test(text) && !/unclear ordering|weak.*cta/.test(text) ? 75 : 50,
    total_impact_axes: DESIGN_TOTAL_IMPACT_AXES,
    inflated_design_score: inflated,
    one_axis_design_optimization: oneAxis,
    actually_better_than_original_risk: actuallyBetterRisk,
    boring_or_generic_risk: generic || weakVisual ? "high" : "medium",
    template_like_risk: generic ? "high" : "medium",
    over_safe_design_risk: generic || /corporate|muted|minimal/.test(text) ? "high" : "medium",
    mismatch_with_user_requested_style: styleMismatch,
    mismatch_with_business_brand: /restaurant|pizza|delivery/.test(text) && /corporate|saas|generic/.test(text),
    missing_visual_proof: missingVisualProof,
    missing_before_after_comparison: missingBeforeAfter,
    strongest_visual_issues: uniqueStrings(issues),
    highest_value_improvements: ["make the hero/CTA unmistakably stronger", "tighten typography, spacing, and visual hierarchy", "add brand-specific imagery/color/motion choices", "prove desktop/mobile before-after with browser evidence", "score the redesign across all total-impact axes"],
    safe_to_claim: !issues.length,
    must_not_claim: ["visually better without screenshots", "better than original/reference without before/after comparison", "95/100 or superior design scores without evidence-based scorecard", "brand-fit design while style/business mismatch remains", "mobile polish without viewport evidence"]
  };
}

function hasVisualEvidence(items = []) {
  return routeArrayify(items).some((item) => /screenshot|browser|visual|viewport|image|dom|browser_was_run/i.test(String(item)));
}

function hasBeforeAfterEvidence(items = []) {
  return routeArrayify(items).some((item) => /before.?after|after.?before|comparison|compare|diff/i.test(String(item)));
}

function detectInflatedDesignScore(text, evidence = [], beforeAfter = []) {
  const scores = [...String(text).matchAll(/\b(9[0-9]|100)\s*(?:\/\s*100|%|score)?\b/g)].map((m) => Number(m[1]));
  const highScore = scores.some((score) => score >= 90) || /perfect|dramatically better|clearly better|best[- ]in[- ]class|10\/10/.test(text);
  return Boolean(highScore && (!hasVisualEvidence(evidence) || !hasBeforeAfterEvidence(beforeAfter)));
}

function detectOneAxisOptimization(text) {
  const visualOnly = /(only|just|because).*\b(hero|beautiful|pretty|visual|photo|animation|motion|minimal|dark|premium)\b|\b(hero|beautiful|pretty|visual|photo|animation|motion)\b.*\bonly\b/.test(text);
  const missingImpact = /(conversion|usability|mobile|content|hierarchy|trust|accessibility|performance|cta).*\b(unknown|not evidenced|uncertain|weak|missing|unclear)\b|\bunknown\b.*(conversion|usability|mobile|content|trust|performance)/.test(text);
  return Boolean(visualOnly || missingImpact || (/beautiful|prettier|cinematic|animated/.test(text) && /unclear|weak|unknown|not evidenced/.test(text)));
}

function axisScoreForSummary(summary, axis, side) {
  const text = normalize(summary);
  let score = side === "new" ? 62 : 58;
  const positive = {
    "visual beauty": /beautiful|polished|strong visual|photography|cinematic|premium|distinct|warm/.test(text),
    "brand fit": /brand|brand-fit|restaurant|pizza|local|warm|food|portfolio|editorial|user-specified/.test(text) && !/generic|saas|corporate/.test(text),
    "conversion/sales clarity": /cta|order|buy|book|pricing|phone|contact|conversion|sales|above fold/.test(text) && !/unclear|weak/.test(text),
    usability: /usable|navigation|clear|simple|menu|flow|thumb|readable/.test(text) && !/confusing|unclear/.test(text),
    "content hierarchy": /hierarchy|menu|offer|value|section|scannable|above fold/.test(text),
    typography: /typography|type scale|headline|readable|font/.test(text),
    "spacing/layout": /spacing|layout|rhythm|grid|composition|fast-feeling/.test(text),
    "mobile polish": /mobile|responsive|viewport|thumb|call button/.test(text),
    "animation/interactivity": /animation|motion|interaction|microinteraction|hover|restrained/.test(text),
    originality: /original|distinct|opinionated|brutalist|editorial|cinematic/.test(text) && !/generic|template/.test(text),
    "performance/feel": /fast|lightweight|performance|fast-feeling|snappy|restrained/.test(text) && !/heavy/.test(text),
    "trust/accessibility basics": /trust|accessibility|a11y|contrast|phone|address|reviews|proof|accessible/.test(text),
    "overall user impact": /impact|better|clear|conversion|usable|orders|sales|user/.test(text) && !/unknown|not evidenced/.test(text)
  };
  const negative = {
    "visual beauty": /ugly|plain|boring|weak visual/.test(text),
    "brand fit": /generic|saas|corporate|no brand|low.*personality/.test(text),
    "conversion/sales clarity": /weak.*cta|unclear.*cta|unclear ordering|missing.*order|menu.*not|phone.*not/.test(text),
    usability: /confusing|unclear|cramped|uncertain mobile|weak.*usability/.test(text),
    "content hierarchy": /clutter|equal-weight|unclear|menu.*not|content.*unknown/.test(text),
    typography: /plain|generic typography|weak typography/.test(text),
    "spacing/layout": /cramped|bad spacing|layout.*unknown|heavy/.test(text),
    "mobile polish": /no mobile|mobile.*unknown|uncertain mobile|not evidenced/.test(text),
    "animation/interactivity": /no animation|distracting|heavy/.test(text),
    originality: /generic|template|stock|cards/.test(text),
    "performance/feel": /heavy|slow|bloated/.test(text),
    "trust/accessibility basics": /trust.*unknown|accessibility.*unknown|contrast.*unknown|not evidenced/.test(text),
    "overall user impact": /unknown|not evidenced|mixed|worse|uncertain|weak/.test(text)
  };
  if (positive[axis]) score += 18;
  if (negative[axis]) score -= 20;
  if (text.includes("unknown") || text.includes("not evidenced")) score -= 6;
  return clampDesignScore(score, 20, 88);
}

function averageScore(rows, key) {
  return Math.round(rows.reduce((sum, row) => sum + Number(row[key] || 0), 0) / Math.max(1, rows.length));
}

function clampDesignScore(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function buildRedesignComparisonScorecard(args = {}) {
  const userGoal = String(args.user_goal || "");
  const original = String(args.original_summary || "");
  const next = String(args.new_design_summary || "");
  const claimed = String(args.claimed_result || "");
  const evidence = routeArrayify(args.evidence);
  const visuals = routeArrayify(args.screenshots_or_visual_evidence);
  const beforeAfter = routeArrayify(args.before_after_evidence);
  const allEvidence = [...evidence, ...visuals];
  const combined = normalize(`${userGoal} ${original} ${next} ${claimed} ${allEvidence.join(" ")} ${beforeAfter.join(" ")}`);
  const visualProof = hasVisualEvidence(visuals) || hasVisualEvidence(evidence);
  const beforeAfterPresent = hasBeforeAfterEvidence(beforeAfter) || hasBeforeAfterEvidence(evidence);
  const axis_scores = DESIGN_TOTAL_IMPACT_AXES.map((axis) => {
    const originalScore = axisScoreForSummary(original, axis, "original");
    let newScore = axisScoreForSummary(next, axis, "new");
    if (!visualProof && ["visual beauty", "spacing/layout", "mobile polish", "animation/interactivity"].includes(axis)) newScore = Math.min(newScore, 62);
    if (!beforeAfterPresent && axis === "overall user impact") newScore = Math.min(newScore, 58);
    return { axis, original_score: originalScore, new_score: newScore, delta: newScore - originalScore, evidence_status: visualProof || !/visual|mobile|spacing|animation/.test(axis) ? "supported_or_plannable" : "not_proven_without_visual_evidence" };
  });
  const originalTotal = averageScore(axis_scores, "original_score");
  const newTotal = averageScore(axis_scores, "new_score");
  const oneAxis = detectOneAxisOptimization(combined);
  const claimedOriginal = Number.isFinite(args.claimed_original_score) ? args.claimed_original_score : null;
  const claimedNew = Number.isFinite(args.claimed_new_score) ? args.claimed_new_score : null;
  const inflated = (claimedNew !== null && claimedNew >= 90 && (!visualProof || !beforeAfterPresent)) || detectInflatedDesignScore(`${claimed} ${next}`, allEvidence, beforeAfter);
  const unsupportedScore = (claimedOriginal !== null || claimedNew !== null || /\b\d{2,3}\s*\/\s*100\b|versus original|vs original/.test(combined)) && (!beforeAfterPresent || !visualProof);
  const betterClaim = /better|improved|superior|success|dramatically|clearly/.test(combined);
  const worseOrMixedRisk = oneAxis || /weak|unclear|unknown|not evidenced|missing|mixed|worse|heavy/.test(normalize(next));
  const verdict = !visualProof || !beforeAfterPresent ? "not_proven" : worseOrMixedRisk ? "mixed" : newTotal > originalTotal + 4 ? "better_with_evidence" : "mixed";
  return {
    user_goal: userGoal,
    evaluation_axes: DESIGN_TOTAL_IMPACT_AXES,
    equal_axis_weighting: true,
    axis_scores,
    original_total_impact_score: originalTotal,
    new_total_impact_score: newTotal,
    total_impact_delta: newTotal - originalTotal,
    claimed_original_score: claimedOriginal,
    claimed_new_score: claimedNew,
    realistic_score_policy: "conservative_evidence_based_scores_no_visual_superiority_without_browser_or_screenshot_evidence",
    visual_superiority_proven: Boolean(visualProof && beforeAfterPresent),
    before_after_comparison_present: beforeAfterPresent,
    comparison_scorecard_required: true,
    total_impact_required: true,
    avoid_one_axis_optimization: true,
    one_axis_design_optimization: oneAxis,
    inflated_design_score: inflated,
    unsupported_original_vs_new_score: unsupportedScore,
    user_might_rate_new_lower_risk: Boolean(!visualProof || !beforeAfterPresent || worseOrMixedRisk || newTotal <= originalTotal + 4),
    redesign_verdict: verdict,
    safe_to_claim_better_than_original: verdict === "better_with_evidence",
    strongest_risks: uniqueStrings([
      inflated ? "inflated_design_score" : null,
      unsupportedScore ? "unsupported_original_vs_new_score" : null,
      oneAxis ? "one_axis_design_optimization" : null,
      !visualProof ? "claimed_better_without_visual_evidence" : null,
      !beforeAfterPresent ? "claimed_better_without_before_after" : null,
      worseOrMixedRisk && betterClaim ? "new_design_worse_or_mixed_but_claimed_success" : null
    ].filter(Boolean)),
    must_not_claim: uniqueStrings([
      !visualProof ? "visual superiority or visually better than original without screenshots/browser evidence" : null,
      !beforeAfterPresent ? "better than original/reference without before/after comparison" : null,
      unsupportedScore ? "original-vs-new numeric score without evidence-backed scorecard" : null,
      worseOrMixedRisk ? "success if new design is mixed, worse, or could realistically be rated lower" : null
    ].filter(Boolean)),
    core_plan_only: true
  };
}

function buildTotalImpactDesignPlan(args = {}) {
  const goal = String(args.user_goal || "");
  const site = String(args.referenced_site_or_product || "");
  const businessGoal = String(args.business_goal || args.known_context || "");
  return {
    user_goal: goal,
    referenced_site_or_product: site || null,
    business_goal: businessGoal || "infer from business/audience/reference before scoring",
    total_impact_required: true,
    avoid_one_axis_optimization: true,
    comparison_scorecard_required: true,
    before_after_evidence_required: true,
    equal_mix_axes: DESIGN_TOTAL_IMPACT_AXES,
    total_impact_requirements: DESIGN_TOTAL_IMPACT_AXES.map((axis) => `${axis}: improve or preserve this axis; do not sacrifice it for one prettier surface.`),
    planning_sequence: ["inspect original/reference and business goal", "select direction by total impact", "design across all equal axes", "capture desktop/mobile before-after evidence", "score conservatively and label mixed/worse/not-proven when appropriate"],
    evidence_requirements: ["screenshots/browser visual evidence", "desktop and mobile before/after comparison", "CTA/content hierarchy proof", "accessibility/trust basics check", "performance/feel check or caveat", "comparison scorecard across all axes"],
    must_not_do: ["optimize only visual beauty, animation, minimalism, or novelty", "claim better when merely different", "use unsupported score inflation", "hide caveats in compact output", "claim visual superiority without screenshots/browser evidence"],
    must_not_claim: ["better than original without before/after evidence", "total-impact win if conversion/usability/mobile/trust are unknown", "95/100 design score without evidence"],
    core_plan_only: true
  };
}

function normalizeDirection(raw, index) {
  if (typeof raw === "string") return { name: raw, summary: raw, index };
  return { name: String(raw?.name || raw?.title || `direction_${index + 1}`), summary: String(raw?.summary || raw?.description || raw?.rationale || raw?.name || ""), index };
}

function scoreDesignDirection(direction, userGoal, explicitStyle) {
  const text = normalize(`${direction.name} ${direction.summary} ${userGoal}`);
  let score = 50;
  if (explicitStyle && text.includes(normalize(explicitStyle).split(" ")[0])) score += 18;
  for (const axis of DESIGN_TOTAL_IMPACT_AXES) score += axisScoreForSummary(text, axis, "new") >= 70 ? 2 : -1;
  if (detectOneAxisOptimization(text)) score -= 25;
  if (/generic|template|saas cards|corporate/.test(text)) score -= 18;
  if (/cta|order|conversion|menu|phone|mobile|trust|accessible|fast/.test(text)) score += 14;
  return clampDesignScore(score, 0, 100);
}

function buildDesignDirectionSelector(args = {}) {
  const goal = String(args.user_goal || "");
  const explicit = detectUserDesignStyle(`${args.user_requested_style || ""} ${goal}`);
  const candidates = routeArrayify(args.candidate_directions).map(normalizeDirection);
  const fallback = candidates.length ? candidates : designDirectionsForBusiness(inferBusinessDesignContext(normalize(`${goal} ${args.referenced_site_or_product || ""}`), args.referenced_site_or_product || ""), explicit).map((name, index) => ({ name, summary: name, index }));
  const scored = fallback.map((direction) => ({ ...direction, total_impact_score: scoreDesignDirection(direction, goal, explicit), one_axis_design_optimization: detectOneAxisOptimization(normalize(`${direction.name} ${direction.summary}`)) }));
  scored.sort((a, b) => b.total_impact_score - a.total_impact_score || a.index - b.index);
  const selected = scored[0];
  return {
    user_goal: goal,
    selection_basis: "total_impact_not_one_axis",
    avoid_one_axis_optimization: true,
    total_impact_axes: DESIGN_TOTAL_IMPACT_AXES,
    selected_direction: selected,
    why_selected: explicit ? "Selected direction best preserves the user-specified style while maintaining total-impact basics." : "Selected direction has the strongest total-impact balance, not just the prettiest single axis.",
    rejected_directions: scored.slice(1).map((item) => ({ name: item.name, total_impact_score: item.total_impact_score, reason: item.one_axis_design_optimization ? "rejected for one-axis optimization risk: visual/novelty without enough conversion, usability, brand, mobile, trust, or performance impact" : /generic|corporate|saas/i.test(`${item.name} ${item.summary}`) ? "rejected as generic/weak brand fit" : "lower total-impact score" })),
    required_next_evidence: ["before/after screenshots", "mobile viewport evidence", "redesign comparison scorecard", "accessibility/trust basics check", "claim caveats if mixed or not proven"],
    must_not_claim: ["selected direction is better until implemented and proven with before/after evidence", "visual-only direction is best if total impact is weaker"],
    core_plan_only: true
  };
}

function buildCompactOutputContract(args = {}) {
  const task = String(args.task || "");
  const out = String(args.output_text || "");
  const caveats = routeArrayify(args.material_caveats);
  const proof = routeArrayify(args.needed_proof);
  const evidence = routeArrayify(args.evidence_available);
  const text = normalize(`${task} ${out}`);
  const risky = /current|latest|ui|redesign|debug|security|safe|repo|file|commit|push|deploy|browser|visual|proof|ci|test/.test(text);
  const vague = !out.trim() || /^(done|fixed|complete|looks good|success)[.!\s]*(it works|looks better)?$/i.test(out.trim()) || (/\bdone\b|\blooks (good|great|better)\b/.test(normalize(out)) && !/(tested|proven|blocked|unknown|caveat|sha|screenshot|command|evidence|assum)/.test(normalize(out)));
  const hidCaveat = caveats.length > 0 && !caveats.some((item) => normalize(out).includes(normalize(item).slice(0, 18))) && !/(caveat|blocked|unknown|pending|not captured|not verified|not proven)/.test(normalize(out));
  const removedProof = proof.length > 0 && evidence.length === 0 && !/(test|screenshot|sha|ci|source|evidence|proof|command|browser|before|after)/.test(normalize(out));
  return {
    compact_by_default: true,
    compact_does_not_mean_vague: true,
    compact_does_not_remove_material_caveats: true,
    compact_does_not_remove_needed_proof: true,
    expand_for_risky_current_ui_debug_security_repo_file_tasks: risky,
    compact_output_too_vague: vague,
    compact_output_hid_material_caveat: hidCaveat,
    compact_output_removed_needed_proof: removedProof,
    recommended_length: risky ? "compact_with_required_evidence" : "short",
    required_output_shape: risky ? ["Result", "What changed", "Tests/proof", "Caveats/unknowns", "Next best task"] : ["Result", "Assumption/caveat if any"],
    material_caveats_required: caveats,
    needed_proof_required: proof,
    audit_flags: uniqueStrings([vague ? "compact_output_too_vague" : null, hidCaveat ? "compact_output_hid_material_caveat" : null, removedProof ? "compact_output_removed_needed_proof" : null].filter(Boolean)),
    core_plan_only: true
  };
}

function formatRedesignComparisonScorecard(s) { return [`vnem_redesign_comparison_scorecard: ${s.redesign_verdict}`, `original=${s.original_total_impact_score}`, `new=${s.new_total_impact_score}`, `visual_proven=${s.visual_superiority_proven}`].join("\n"); }
function formatTotalImpactDesignPlan(p) { return [`vnem_total_impact_design_plan: total_impact_required=${p.total_impact_required}`, `axes=${p.equal_mix_axes.length}`, `scorecard_required=${p.comparison_scorecard_required}`].join("\n"); }
function formatDesignDirectionSelector(s) { return [`vnem_design_direction_selector: ${s.selected_direction?.name || "none"}`, `basis=${s.selection_basis}`, `score=${s.selected_direction?.total_impact_score ?? "n/a"}`].join("\n"); }
function formatCompactOutputContract(c) { return [`vnem_compact_output_contract: compact_by_default=${c.compact_by_default}`, `vague=${c.compact_output_too_vague}`, `expand=${c.expand_for_risky_current_ui_debug_security_repo_file_tasks}`].join("\n"); }

function needsExternalResearchForAdaptive(type, text) {
  if (["current_research", "security_safety", "high_stakes_advice"].includes(type)) return true;
  if (/\b(current|latest|right now|today|policy|price|law|legal|medical|financial|security|safe|version|patch|meta|requirements|refund)\b/.test(text)) return true;
  if (["ui_redesign", "ui_web_change"].includes(type) && /\b(original|reference|website|site|compare|better than)\b/.test(text)) return true;
  return false;
}

function reasonForEffortMode(type, mode, researchNeeded) {
  if (mode === "instant_answer") return "The task appears simple, stable, low-stakes, and answerable directly after Core classification.";
  if (mode === "quick_plan") return "The task needs concise shaping but not heavy proof unless escalation triggers appear.";
  if (mode === "standard") return researchNeeded ? "Facts may change, so source verification is required without full repo/browser proof by default." : "Normal task: targeted checks and relevant tools only.";
  if (mode === "deep_proof") return "Failure would matter or evidence is required: debugging, UI, security, files, current sources, or visual proof.";
  return "Repo changes, releases, deploys, public claims, or irreversible actions require max verification.";
}
function researchReason(type, text, needed) { return needed ? "Research/source verification is needed because the task may involve current facts, policy/security/high-stakes risk, or redesign reference quality." : "No external research is needed because the task is stable enough or uses user-provided text; answer from stable knowledge with labeled uncertainty if needed."; }
function toolBudgetForMode(mode) { return ({ instant_answer: "none_by_default", quick_plan: "minimal_only_if_useful", standard: "targeted", deep_proof: "evidence_driven", max_verification: "full_verification_ladder" })[mode] || "targeted"; }
function tokenBudgetGuidance(mode) { return ({ instant_answer: "1 short answer; no report", quick_plan: "short structure; answer/action first", standard: "targeted detail only", deep_proof: "evidence sections allowed but only with actual evidence", max_verification: "complete evidence ladder and compact final report" })[mode] || "targeted detail only"; }
function recommendedCoreToolsForEffort(type, mode, researchNeeded) { const out = ["vnem_plan_effort_budget"]; if (mode !== "instant_answer") out.push("vnem_route_task"); if (researchNeeded) out.push("vnem_assess_research_need", "vnem_build_search_plan"); if (/ui/.test(type)) out.push("vnem_design_ambition_plan", "vnem_build_ui_quality_plan", "vnem_visual_taste_audit"); if (type === "local_debugging") out.push("vnem_build_debugging_plan"); if (mode === "max_verification") out.push("vnem_completion_audit"); return uniqueStrings(out); }
function recommendedToolsMcpForEffort(type, mode, researchNeeded) { const out = []; if (researchNeeded) out.push("vnem_tools_search_query_builder", "vnem_tools_web_search", "vnem_tools_claim_source_matrix"); if (/ui/.test(type)) out.push("vnem_tools_ui_surface_review", "vnem_tools_browser_evidence_plan", "vnem_tools_browser_evidence_run", "vnem_tools_ui_evidence_audit"); if (type === "local_debugging") out.push("vnem_tools_debug_evidence", "vnem_tools_run_project_task"); if (["repo_modification", "deployment_workflow"].includes(type)) out.push("vnem_tools_workspace_map", "vnem_tools_apply_patch_batch", "vnem_tools_run_project_task", "vnem_tools_git_status", "vnem_tools_finish_session"); return uniqueStrings(out); }
function evidenceForEffort(type, mode, researchNeeded) { const out = ["Core classification output"]; if (researchNeeded) out.push("current/official source verification or explicit unavailable/unknown status"); if (/ui/.test(type)) out.push("browser/visual proof, screenshots or browser_unavailable, responsive/a11y/state evidence, before/after for visual claims"); if (type === "local_debugging") out.push("failing log/command/repro, root cause, targeted verification"); if (["repo_modification", "deployment_workflow"].includes(type)) out.push("changed files, tests/checks, commit SHA, exact CI/deploy status when pushed"); if (type === "security_safety") out.push("artifact boundary, source/reputation/risk checks, no credential/session handling"); return uniqueStrings(out); }
function evidenceNotRequiredForEffort(type, mode) { if (mode === "instant_answer") return ["browser proof", "file inspection", "source matrix", "long audit report", "proof section without proof"]; if (mode === "quick_plan") return ["full verification ladder unless escalation triggers appear", "broad tool sweep"]; return ["decorative tools that do not improve truth/result"]; }
function toolsToAvoidForEffort(mode, type) { if (mode === "instant_answer") return ["browser/file/source/research tools for stable Q&A", "many Tools MCP calls just to look advanced", "long planning tools before answer"]; if (mode === "quick_plan") return ["broad scans", "full test suite", "browser proof unless UI/current evidence matters"]; return ["unrelated tools", "decorative evidence sections", "broad crawling or scraping"]; }
function wastedToolRisk(mode, type) { return ["instant_answer", "quick_plan"].includes(mode) ? "high_if_tools_used_without_new_truth" : "medium_if_tools_do_not_map_to required evidence"; }
function clarificationDecisionForTask(type, text, goal, known) { if (type === "local_debugging" && !/(error|log|stack trace|failing command|repro|provided)/.test(text)) return { needed: true, reason: "A precise log/failing command materially changes debugging correctness." }; if (type === "security_safety" && !/(url|link|file|hash|artifact|provided by|stranger|trusted)/.test(text)) return { needed: true, reason: "Security/safety review needs exact artifact and trust boundary." }; if (type === "ui_redesign" && /\b(choose|which direction|options)\b/.test(text)) return { needed: true, reason: "The user explicitly asked for design direction choice." }; return { needed: false, reason: "No blocking ambiguity; proceed with labeled assumptions and adapt if needed." }; }
function escalationTriggersForEffort() { return ["latest/current requested", "facts may be stale", "medical/legal/financial/security risk", "code changes requested", "files/logs involved", "UI/browser proof involved", "public-facing claim", "destructive/irreversible action", "secrets/tokens/cookies/accounts", "user explicitly asks to verify/research/prove", "model uncertainty", "redesign quality depends on original/reference site"]; }
function answerShapeForMode(mode) { return ({ instant_answer: "direct answer first; no long report", quick_plan: "concise structure; action first; important caveats only", standard: "targeted checks and evidence labels", deep_proof: "evidence-driven with must-not-claim boundaries", max_verification: "verification ladder, changed files, tests, commit/CI proof when relevant" })[mode] || "targeted answer"; }
function mustNotClaimForEffort(mode, type, researchNeeded) { const out = ["Do not claim a file, browser, repo, UI, source, test, or deployment was checked unless it was actually checked.", "Do not present guesses as facts.", "Do not comfort with false certainty."]; if (researchNeeded) out.push("Do not claim current/latest/source-verified facts without current source evidence."); if (/ui/.test(type)) out.push("Do not claim visual improvement without browser/visual proof."); if (mode === "instant_answer") out.push("Do not claim research/tools/proof were used for a direct answer."); return out; }

function detectUserDesignStyle(text) { const t = normalize(text); const styles = ["dark cyberpunk", "cyberpunk", "luxury premium", "premium", "playful", "high-conversion", "modern", "minimal", "corporate", "brutalist", "retro", "elegant", "bold", "fun"]; return styles.find((style) => t.includes(style)) || null; }
function inferBusinessDesignContext(text, site) { if (/pizza|pizzabomba|restaurant|food|delivery|menu/.test(text)) return { referenceClass: "pizza/restaurant/delivery", defaultDirection: "energetic pizza restaurant/delivery experience with appetizing visuals, clear menu/order path, local trust, and mobile-first conversion", audience: "hungry local customers choosing quickly on mobile; conversion goal is order/call/reservation", personality: ["appetizing", "energetic", "local", "clear", "confident"] }; return { referenceClass: "same-category product/business", defaultDirection: "adaptive brand-fit direction based on business, audience, content, and conversion goal", audience: "target users inferred from the business and user request", personality: ["specific", "memorable", "usable", "not generic"] }; }
function designDirectionsForBusiness(business, explicitStyle) { if (explicitStyle) return [`explicit ${explicitStyle}`, "brand-compatible variant", "conversion-focused variant"]; if (/pizza|restaurant/.test(business.referenceClass)) return ["high-conversion delivery-focused", "warm local restaurant", "bold appetizing pizza brand"]; return ["brand-fit conversion direction", "content-led editorial direction", "bold memorable product direction"]; }
function formatEffortBudget(b) { return [`vnem_plan_effort_budget: ${b.effort_mode}`, `task_type=${b.task_type}`, `research_needed=${b.research_needed}`, `tools_needed=${b.tool_budget.tools_needed}`].join("\n"); }
function formatFastAnswerContract(c) { return [`vnem_fast_answer_contract: direct=${c.should_answer_directly}`, `research_needed=${c.research_needed}`, `tools_needed=${c.tools_needed}`].join("\n"); }
function formatDesignAmbitionPlan(p) { return [`vnem_design_ambition_plan: ${p.selected_direction}`, `user_style=${p.user_specified_style}`, `adapt=${p.should_adapt_to_existing_brand}`].join("\n"); }
function formatVisualTasteAudit(a) { return [`vnem_visual_taste_audit: ${a.verdict}`, `visual_score=${a.visual_quality_score}`, `safe_to_claim=${a.safe_to_claim}`].join("\n"); }
function compactAdaptiveEffort(b) { return { effort_mode: b.effort_mode, why_not_deeper: "no_trigger", why_not_lighter: "truth_risk", minimum_quality_checks: ["classify"], truth_over_comfort_rule: "on", research_decision: b.research_needed ? "required" : "not_required", tool_budget: b.tool_budget.budget, wasted_tool_risk: ["instant_answer", "quick_plan"].includes(b.effort_mode) ? "high_if_decorative" : "avoid_decorative", escalation_triggers: ["current", "risk"], output_length_guidance: b.effort_mode === "instant_answer" ? "direct" : "compact" }; }
function compactDesignBehavior(plan) { if (!plan) return { applies: false }; return { applies: true, user_style_specified: plan.user_specified_style, adapt_to_brand: plan.should_adapt_to_existing_brand, design_reference_needed: plan.design_reference_needed, visual_ambition_required: true, avoid_generic_template: true, total_impact_required: true, avoid_one_axis_optimization: true, comparison_scorecard_required: true, before_after_evidence_required: true }; }

function buildAntiStagnationCheck(args = {}) {
  const task = String(args.task || "");
  const next = String(args.proposed_next_step || task || "");
  const completed = routeArrayify(args.completed_areas).map((item) => normalize(item));
  const recent = routeArrayify(args.recent_actions).map((item) => normalize(item));
  const hay = normalize(`${task} ${next} ${recent.join(" ")}`);
  const flags = [];
  const coveredBrowserSearch = completed.some((item) => /browser|search|captcha|claim.source|research gap/.test(item));
  if (coveredBrowserSearch && /browser|search|captcha|claim.source|research gap/.test(hay)) flags.push("repeating already-covered improvement area");
  if (/docs|readme|wording|documentation/.test(hay) && /major|implementation|improvement|done|complete|polish/.test(hay)) flags.push("docs-only fake progress risk");
  if (/broad scan|scan everything|full repo|all files|re-run discovery|rerun discovery/.test(hay)) flags.push("rerunning broad scans when targeted inspection is enough");
  if (/full test|npm test|entire suite|all tests/.test(hay) && /again|loop|repeat|rerun/.test(hay)) flags.push("full test suite loop risk");
  if (sameNormalizedMeaning(task, next) && /next|step|again|another/.test(hay)) flags.push("same next step under a different name");
  if (/polish|tweak|wording|cleanup/.test(hay) && completed.length) flags.push("polishing finished areas while higher-value work waits");
  const shouldContinue = !flags.some((flag) => /repeating|docs-only|full test suite|same next step|polishing/.test(flag));
  return {
    task,
    completed_areas: args.completed_areas || [],
    stagnation_risk_flags: uniqueStrings(flags),
    should_continue_same_area: shouldContinue,
    recommended_next_action: shouldContinue
      ? "Continue with focused test-first implementation and targeted verification."
      : "Move to a different weakness or next useful batch; prefer routing, memory relevance, output-quality, compatibility, or evaluation work unless new browser/search behavior and tests are clearly added.",
    avoid: ["docs-only fake progress", "broad scans without a specific question", "full test suite loops during development", "renaming the same next step", "polishing completed areas without new behavior"],
    must_not_claim: ["Do not claim new behavior from docs-only or repeated work.", "Do not claim a repeated completed area is a major new improvement without new tests/evidence.", "Do not claim full validation was necessary if targeted checks were enough."],
    core_plan_only: true
  };
}

function buildOutputQualityPlan(args = {}) {
  const task = String(args.task || "");
  const type = normalizeOutputType(args.output_type || "technical_final_report");
  const evidence = routeArrayify(args.evidence_available);
  const blockers = routeArrayify(args.blockers);
  const commands = routeArrayify(args.commands_to_handoff);
  const outputText = String(args.output_text || "");
  const contract = outputTemplateForType(type, commands);
  const auditFlags = auditOutputText(outputText, type, evidence, blockers, commands);
  return {
    task,
    output_type: type,
    audience: args.audience || "unknown",
    compact_first_order: ["status/result first", "what matters", "evidence/proof", "blocked/unknown", "next action", "details only if useful"],
    required_sections: contract.required_sections,
    template_contract: contract.template,
    evidence_labels: EVIDENCE_LABELS,
    detail_policy: detailPolicyForOutput(type, args.audience, blockers),
    audit_flags: auditFlags,
    missing_output_requirements: auditFlags,
    must_not_claim: ["Do not claim done/safe/compatible without evidence.", "Do not bury blockers after long background.", "Do not present preparation-only work as implementation.", "Do not omit the next action."],
    final_report_contract: ["Separate proven/tested/supported/likely/assumed/unknown/blocked/failed/not_attempted/preparation_only.", "List exact tests/evidence before claims.", "Keep result compact first; details only when useful."],
    core_plan_only: true
  };
}

function normalizeOutputType(type) {
  const t = normalize(type).replace(/[\s-]+/g, "_");
  if (/ai_work|work_review|review/.test(t)) return "ai_work_review";
  if (/blocker/.test(t)) return "blocker_report";
  if (/command|handoff.*command|user_command/.test(t)) return "user_command_handoff";
  if (/building|prompt_handoff|implementation_handoff/.test(t)) return "building_ai_prompt_handoff";
  if (/technical|final/.test(t)) return "technical_final_report";
  return t || "technical_final_report";
}

function outputTemplateForType(type, commands = []) {
  if (type === "ai_work_review") return { required_sections: ["Result", "What it actually did", "What matters", "What is proven", "What is blocked or unknown", "Next best step"], template: "## Result\n-\n\n## What it actually did\n-\n\n## What matters\n-\n\n## What is proven\n-\n\n## What is blocked or unknown\n-\n\n## Next best step\n-" };
  if (type === "blocker_report") return { required_sections: ["Blocked by", "Why it matters", "Evidence missing", "Safe next step", "Do not claim yet"], template: "## Blocked by\n-\n\n## Why it matters\n-\n\n## Evidence missing\n-\n\n## Safe next step\n-\n\n## Do not claim yet\n-" };
  if (type === "user_command_handoff") return { required_sections: ["Run this", "Success looks like", "If it fails, send back"], template: `## Run this\n\n\`\`\`bash\n${commands.join("\n") || "# command here"}\n\`\`\`\n\n## Success looks like\n-\n\n## If it fails, send back\n- first error block\n- final summary` };
  if (type === "building_ai_prompt_handoff") return { required_sections: ["Result", "Goal", "Must read first", "Current known state", "Do not repeat", "Required first checks", "Implementation targets", "Files/areas likely involved", "Tests/checks required", "Evidence required", "What counts as done", "What must be marked blocked/unverified"], template: "## Result\n-\n\n## Goal\n-\n\n## Must read first\n-\n\n## Current known state\n-\n\n## Do not repeat\n-\n\n## Required first checks\n-\n\n## Implementation targets\n-\n\n## Files/areas likely involved\n-\n\n## Tests/checks required\n-\n\n## Evidence required\n-\n\n## What counts as done\n-\n\n## What must be marked blocked/unverified\n-" };
  return { required_sections: ["Result", "What changed", "Evidence", "What is proven", "What remains blocked/unknown", "What was not attempted", "Commit/GitHub status", "Exact next best task"], template: "## Result\n-\n\n## What changed\n-\n\n## Evidence\n-\n\n## What is proven\n-\n\n## What remains blocked/unknown\n-\n\n## What was not attempted\n-\n\n## Commit/GitHub status\n-\n\n## Exact next best task\n-" };
}

function detailPolicyForOutput(type, audience, blockers) {
  if (blockers.length) return "Use blocker-first detail: state blocker, why it matters, missing evidence, safe next step, and do-not-claim line.";
  if (type === "user_command_handoff") return "Give exact commands, where to run them, success signal, and failure output to send back.";
  if (audience === "developer") return "Technical detail is allowed, but keep result/evidence/next action first.";
  return "Plain language, compact first, no internal jargon unless needed.";
}

function auditOutputText(outputText, type, evidence, blockers, commands) {
  if (!outputText) return [];
  const text = normalize(outputText);
  const flags = [];
  if (!/^(result|status|blocked|done|passed|failed|implemented|not attempted|unknown|## result|## status|## blocked)/.test(text)) flags.push("not compact-first: status/result/blocker should come first");
  if (!/(next action|next step|safe next step|exact next|if it fails|what remains)/.test(text)) flags.push("missing next action");
  if (/\bsafe\b|secure|compatible|works|done|complete|major improvement/.test(text) && evidence.length === 0) flags.push("fake confidence risk: strong claim without evidence");
  if (/\bsafe\b|secure/.test(text) && !evidence.some((item) => /safety|review|test|scan|evidence|approval/i.test(String(item)))) flags.push("safe without evidence");
  if (/compatible|supported/.test(text) && !evidence.some((item) => /compat|test|docs|version|runtime|official/i.test(String(item)))) flags.push("compatible/supported without compatibility proof");
  if (type === "user_command_handoff" && commands.length && !/(cd |where to run|run this|success looks like|if it fails)/.test(text)) flags.push("command handoff missing where to run or success/failure instructions; command may be too broad");
  if (blockers.length && !/(blocked by|why it matters|safe next step|do not claim)/.test(text)) flags.push("blocker report hides or under-specifies blocker");
  return uniqueStrings(flags);
}

function formatCoreRoutingRecord(record) { return [`vnem_route_task: ${record.task_categories.join(", ")}`, `must_ask_user=${record.must_ask_user}`, `need_tools_mcp=${record.need_tools_mcp}`, `next=${record.next_best_action}`].join("\n"); }
function compactRoutingRecord(record) { const permission = record.tools_permission_planning || {}; return { task_categories: record.task_categories.slice(0, 5), must_ask_user: record.must_ask_user, need_tools_mcp: record.need_tools_mcp, need_current_research: record.need_current_research, tools_permission_planning: { required_profile: permission.required_permission_profile, trust_boundary: permission.trust_boundary_level, approval_count: (permission.actions_requiring_approval || []).length, blocked_count: (permission.blocked_or_preview_only_actions || []).length }, core_plan_only: true }; }
function compactOutputQualityPlan(plan) { return { output_type: plan.output_type, core_plan_only: true }; }
function formatOutputQualityPlan(plan) { return [`vnem_output_quality_plan: ${plan.output_type}`, `sections=${plan.required_sections.join(", ")}`, `audit_flags=${plan.audit_flags.length}`].join("\n"); }
function formatAntiStagnationCheck(check) { return [`vnem_anti_stagnation_check: flags=${check.stagnation_risk_flags.join(", ") || "none"}`, `continue=${check.should_continue_same_area}`, `next=${check.recommended_next_action}`].join("\n"); }

function uniqueBy(items, keyFn) { const seen = new Set(); const out = []; for (const item of items) { const key = keyFn(item); if (!seen.has(key)) { seen.add(key); out.push(item); } } return out; }
function routeArrayify(value) { if (value === undefined || value === null) return []; return Array.isArray(value) ? value : [value]; }
function stableMemoryId(content) { return `memory-${createHash("sha256").update(String(content || "")).digest("hex").slice(0, 8)}`; }
function sharesAnyTerm(a, b) { const setB = new Set(b); return [...a].some((term) => setB.has(term)); }
function sameNormalizedMeaning(a, b) { const left = tokenize(normalize(a)).filter((term) => !["another", "again", "more", "next", "step", "make", "improve"].includes(term)).sort().join(" "); const right = tokenize(normalize(b)).filter((term) => !["another", "again", "more", "next", "step", "make", "improve"].includes(term)).sort().join(" "); return left && right && (left === right || left.includes(right) || right.includes(left)); }

function selectToolsForTask(args = {}) {
  const task = String(args.task || "");
  const context = String(args.known_context || "");
  const hint = String(args.task_type_hint || "");
  const type = inferCoreToolTaskType(`${hint} ${task} ${context}`);
  const selected = new Set(["vnem_tools_manifest", "vnem_tools_permission_status", "vnem_tools_action_policy_preview", "vnem_tools_trust_boundary_classify", "vnem_tools_start_session", "vnem_tools_finish_session"]);
  const add = (...tools) => tools.filter(Boolean).forEach((tool) => selected.add(tool));
  if (["coding", "ui_web", "debugging", "file_investigation", "local_project_modification", "security_sensitive"].includes(type)) {
    add("vnem_tools_workspace_map", "vnem_tools_architecture_review", "vnem_tools_code_search", "vnem_tools_read_many_files", "vnem_tools_project_scan", "vnem_tools_dependency_scan");
  }
  if (["coding", "ui_web", "debugging", "local_project_modification"].includes(type)) add("vnem_tools_apply_patch_batch", "vnem_tools_run_project_task", "vnem_tools_collect_evidence", "vnem_tools_git_status", "vnem_tools_git_diff_summary");
  if (type === "ui_web") add("vnem_tools_app_inspect", "vnem_tools_app_vertical_slice_plan", "vnem_tools_app_vertical_slice_apply", "vnem_tools_app_acceptance_run", "vnem_tools_app_transaction_rollback", "vnem_tools_ui_surface_review", "vnem_tools_browser_evidence_plan", "vnem_tools_browser_evidence_run", "vnem_tools_ui_evidence_audit", "vnem_tools_start_dev_server", "vnem_tools_browser_capture", "vnem_tools_browser_page_inspect", "vnem_tools_browser_accessibility_audit", "vnem_tools_browser_compare_snapshots", "vnem_tools_stop_dev_server");
  if (type === "debugging") add("vnem_tools_debug_evidence", "vnem_tools_architecture_review", "vnem_tools_code_search", "vnem_tools_read_many_files", "vnem_tools_run_project_task", "vnem_tools_apply_patch_batch");
  if (["research", "direct_url_source", "current_research", "website_understanding"].includes(type)) add("vnem_tools_source_quality_check", "vnem_tools_research_brief", "vnem_tools_browser_research_pack", "vnem_tools_claim_source_matrix", "vnem_tools_research_gap_detector", "vnem_tools_source_map", "vnem_tools_source_extract", "vnem_tools_source_graph");
  if (["research", "current_research"].includes(type)) add("vnem_tools_search_provider_manifest", "vnem_tools_search_query_builder", "vnem_tools_web_search", "vnem_tools_search_result_ranker");
  if (["direct_url_source", "website_understanding"].includes(type)) add("vnem_tools_fetch_url_text", "vnem_tools_browser_page_inspect", "vnem_tools_url_reputation_check", "vnem_tools_captcha_detector");
  if (type === "website_understanding") add("vnem_tools_browser_readability_extract", "vnem_tools_browser_link_map", "vnem_tools_browser_dom_search");
  if (type === "direct_url_source") add("vnem_tools_browser_readability_extract", "vnem_tools_browser_link_map");
  if (type === "research" && directUrlPresent(task + " " + context)) add("vnem_tools_fetch_url_text", "vnem_tools_browser_page_inspect", "vnem_tools_browser_research_pack");
  if (type === "file_investigation") add("vnem_tools_find_references");
  if (type === "security_sensitive") add("vnem_tools_dependency_scan", "vnem_tools_source_quality_check", "vnem_tools_redirect_chain_check", "vnem_tools_url_reputation_check", "vnem_tools_captcha_detector", "vnem_tools_download_safety_check", "vnem_tools_claim_source_matrix", "vnem_tools_research_gap_detector");
  if (/download|installer|redirect|captcha|phishing|malware|scam|credential|suspicious/i.test(task + " " + context)) add("vnem_tools_redirect_chain_check", "vnem_tools_url_reputation_check", "vnem_tools_captcha_detector", "vnem_tools_download_safety_check");
  const selectedTools = [...selected];
  const dryRunSteps = selectedTools.filter((tool) => /apply_patch|vertical_slice_apply|app_acceptance|app_transaction_rollback|run_project_task|start_dev_server|browser_capture|browser_page|browser_readability|browser_link|browser_dom|browser_accessibility|browser_compare|web_search|redirect_chain|download_safety|fetch_url_text|git_commit|api_request|restore/.test(tool)).map((tool) => `${tool}: dry-run first before approval or real action when network/mutation/source fetching is involved`);
  const approvalSteps = selectedTools.filter((tool) => /apply_patch|vertical_slice_apply|app_acceptance|app_transaction_rollback|run_project_task|start_dev_server|stop_dev_server|browser_capture|browser_page|browser_readability|browser_link|browser_dom|browser_accessibility|browser_compare|web_search|redirect_chain|download_safety|fetch_url_text|git_commit|api_request|restore/.test(tool)).map((tool) => `${tool}: requires explicit approval for real external/network/mutation action`);
  const currentSearchRequired = currentResearchRequired(type, `${task} ${context}`);
  return {
    task,
    task_type: type,
    missing_context_questions: missingToolPlanQuestions(type, task),
    selected_tools: selectedTools,
    permission_profile_plan: buildCorePermissionProfilePlan(task, context, selectedTools),
    tool_sequence_preview: selectedTools.map((tool) => ({ tool, what_for: purposeForTool(tool, type) })),
    what_each_tool_is_for: Object.fromEntries(selectedTools.map((tool) => [tool, purposeForTool(tool, type)])),
    dry_run_steps: dryRunSteps,
    approval_required_steps: approvalSteps,
    evidence_to_collect: ["workspace/project map", "files/code searched or read", "patch diff/backup/restore plan", "commands/tasks and exit codes", type === "ui_web" ? "browser screenshot or honest browser_unavailable plus static page/a11y/snapshot evidence" : null, ["research", "direct_url_source", "current_research", "website_understanding"].includes(type) ? "source/page quality flags, inspected source excerpts, and supported/unsupported/conflicting claims" : null, "session evidence pack", "must-not-claim list"].filter(Boolean),
    source_quality_requirements: sourceQualityRequirements(type),
    browser_understanding_limits: browserUnderstandingLimits(type),
    when_external_web_search_is_required: currentSearchRequired,
    verification_plan: verificationForType(type),
    fallbacks_if_tool_unavailable: ["If Tools MCP is unavailable, Core should produce a plan only and ask the agent to use equivalent local tools with the same safety/evidence rules.", "If active Tools profile is safe-readonly, use permission preview and ask for the exact stronger profile/approval instead of attempting mutation.", "If browser proof is unavailable, report browser_unavailable and do not claim visual proof.", "If direct URL fetch is blocked/unavailable, use provided text summaries or ask for a source; do not fake search.", "For latest/current research, use an approved external search path outside Tools MCP until a safe search provider exists."],
    must_not_claim: ["Core executed Tools MCP actions.", "The active Tools permission profile allowed a risky action without vnem_tools_permission_status/action_policy_preview evidence.", "Files were edited, commands ran, browser proof was captured, commits were made, or URLs were fetched before Tools evidence exists.", "A web search happened inside Tools MCP.", "Current/latest web research is complete without external current search evidence.", "Unsupported git push/package install/deployment/Giga MCP work was done."],
    done_definition: doneDefinitionForType(type),
    efficiency_guidance: efficiencyForType(type),
    core_executes_tools: false,
    core_mcp_mutates_files: false,
    core_mcp_runs_commands: false,
    core_mcp_uses_browser: false,
    web_search_executed: false
  };
}

function buildCoreToolsPlan(args = {}) {
  const selection = selectToolsForTask(args);
  const sequence = [];
  const push = (tool, purpose, requiresApproval = false, dryRunFirst = false) => {
    if (selection.selected_tools.includes(tool)) sequence.push({ tool, purpose, dry_run_first: dryRunFirst, requires_approval: requiresApproval, expected_evidence: expectedEvidenceForTool(tool) });
  };
  if (selection.task_type === "debugging") sequence.push({ tool: "external/input", purpose: "logs first: collect failing command output, stack trace, reproduction, or error message before changing files", dry_run_first: false, requires_approval: false, expected_evidence: ["failure output"] });
  push("vnem_tools_manifest", "inspect Tools catalog and safety metadata");
  push("vnem_tools_permission_status", "inspect active Tools permission profile and allowed-root status");
  push("vnem_tools_action_policy_preview", "preview risky actions against active Tools permission profile before approval");
  push("vnem_tools_trust_boundary_classify", "classify trust boundary for sources/actions/data before risky handling");
  push("vnem_tools_start_session", "start one coherent evidence pack");
  push("vnem_tools_workspace_map", "map project structure safely");
  push("vnem_tools_project_scan", "detect package scripts/frameworks/safe commands");
  push("vnem_tools_app_inspect", "inspect app framework support, frontend/backend boundaries, routes, components, APIs, data flow, states, validation, accessibility, and responsive signals");
  push("vnem_tools_app_vertical_slice_plan", "preview a coherent marker-backed frontend/API/domain transaction with explicit adapter limits");
  push("vnem_tools_app_vertical_slice_apply", "dry-run then apply the approved hash-bound app transaction with automatic failure rollback", true, true);
  push("vnem_tools_app_acceptance_run", "run focused checks, localhost server, real Chromium user path, console/network capture, and desktop/mobile screenshots", true, true);
  push("vnem_tools_app_transaction_rollback", "restore an app transaction only when current hashes still match", true, true);
  push("vnem_tools_dependency_scan", "inspect dependencies/scripts without installing");
  push("vnem_tools_code_search", "find relevant implementation sites");
  push("vnem_tools_find_references", "trace symbols/config names");
  push("vnem_tools_read_many_files", "load bounded relevant context");
  push("vnem_tools_search_provider_manifest", "inspect configured/unconfigured provider capabilities without exposing keys");
  push("vnem_tools_search_query_builder", "build strong source-discovery queries without executing search");
  push("vnem_tools_web_search", "dry-run then run approved configured provider search or return honest unavailable status", true, true);
  push("vnem_tools_search_result_ranker", "rank provider/search results by credibility, freshness, duplicates, and risk");
  push("vnem_tools_fetch_url_text", "dry-run then fetch direct approved URL text only; no search scraping", true, true);
  push("vnem_tools_browser_page_inspect", "inspect direct/local/provided page structure statically", true, true);
  push("vnem_tools_browser_readability_extract", "extract heuristic readable main content", true, true);
  push("vnem_tools_browser_link_map", "map links found in a page without following/crawling", true, true);
  push("vnem_tools_browser_dom_search", "search headings/links/forms/buttons/text statically", true, true);
  push("vnem_tools_browser_accessibility_audit", "run static heuristic accessibility audit", true, true);
  push("vnem_tools_browser_compare_snapshots", "compare before/after page snapshots without visual overclaims", true, true);
  push("vnem_tools_source_quality_check", "evaluate provided/direct source quality");
  push("vnem_tools_research_brief", "summarize supported/unsupported claims from provided sources");
  push("vnem_tools_browser_research_pack", "combine source/page evidence into supported/unsupported/conflicting claim pack");
  push("vnem_tools_redirect_chain_check", "dry-run then check redirect chain safely with no cookies/session/login", true, true);
  push("vnem_tools_url_reputation_check", "heuristically flag phishing/scam/download/credential URL risks");
  push("vnem_tools_captcha_detector", "detect CAPTCHA/access-block pages and propose safe user-assisted handoff; no bypass");
  push("vnem_tools_download_safety_check", "preflight download link risk; no actual download or installer execution", true, true);
  push("vnem_tools_claim_source_matrix", "build claim/source support matrix");
  push("vnem_tools_research_gap_detector", "identify missing current/primary/counter/date/version evidence");
  push("vnem_tools_source_map", "map repo/docs/source structure before extraction; no broad crawl");
  push("vnem_tools_source_extract", "extract bounded selected targets with redaction and skipped/blocked accounting");
  push("vnem_tools_source_graph", "compare sources for officialness, freshness, claim support, and contradictions");
  push("vnem_tools_architecture_review", "inspect real entry points/registries/tests/configs and flag fake parallel systems/dead code");
  push("vnem_tools_ui_surface_review", "inspect real UI routes/components/render paths/state coverage without browser automation");
  push("vnem_tools_browser_evidence_plan", "plan bounded localhost/file browser proof checklist before any capture");
  push("vnem_tools_browser_evidence_run", "execute approved bounded localhost browser evidence plans and store structured screenshot/DOM/a11y proof packs", true, true);
  push("vnem_tools_ui_evidence_audit", "audit screenshots/DOM/console/network/a11y/viewport/state evidence before UI claims");
  push("vnem_tools_debug_evidence", "collect bounded log-first evidence, git status, package scripts, and targeted debug checks without arbitrary commands");
  push("vnem_tools_apply_patch_batch", "dry-run then apply approved coherent multi-file patch", true, true);
  push("vnem_tools_run_project_task", "dry-run then run approved safe project task/check", true, true);
  push("vnem_tools_start_dev_server", "dry-run then start approved localhost dev server for UI proof", true, true);
  push("vnem_tools_browser_capture", "dry-run then capture approved local browser proof if useful", true, true);
  push("vnem_tools_stop_dev_server", "stop only Tools-started server", true, false);
  push("vnem_tools_git_status", "summarize local git state");
  push("vnem_tools_git_diff_summary", "summarize final diff");
  push("vnem_tools_finish_session", "write final session evidence pack");
  const plan = {
    ...selection,
    tool_sequence: sequence,
    permission_profile_plan: selection.permission_profile_plan,
    core_tools_handoff: {
      task_summary: selection.task.slice(0, 240),
      required_tool_capabilities: selection.selected_tools,
      required_permissions: selection.approval_required_steps,
      permission_profile_plan: selection.permission_profile_plan,
      active_or_required_permission_profile: selection.permission_profile_plan.required_permission_profile,
      actions_requiring_approval: selection.permission_profile_plan.actions_requiring_approval,
      actions_blocked_by_current_profile: selection.permission_profile_plan.actions_blocked_by_current_profile,
      trust_boundary_level: selection.permission_profile_plan.trust_boundary_level,
      safe_alternative: selection.permission_profile_plan.safe_alternative,
      dry_run_first: selection.dry_run_steps,
      evidence_to_collect: selection.evidence_to_collect,
      source_quality_requirements: selection.source_quality_requirements,
      browser_understanding_limits: selection.browser_understanding_limits,
      when_external_web_search_is_required: selection.when_external_web_search_is_required,
      rollback_or_restore_plan: ["patch_batch returns backups and restore_plan", "use restore_batch for rollback when needed", "commit only after evidence and explicit approval"],
      must_not_claim: selection.must_not_claim,
      safe_core_actions: ["plan", "select tools", "prepare handoff only"]
    },
    core_executes_tools: false,
    core_claims_actions_happened: false,
    web_search_executed: false
  };
  return plan;
}

function buildBrowserResearchPlan(args = {}) {
  const plan = buildCoreToolsPlan(args);
  return {
    task: plan.task,
    task_type: plan.task_type,
    selected_tools: [...new Set([...plan.selected_tools, ...researchPlanningToolsForText(`${plan.task} ${plan.task_type}`)])],
    tool_sequence: [...plan.tool_sequence, ...researchPlanningToolsForText(`${plan.task} ${plan.task_type}`).filter((tool) => !plan.tool_sequence.some((step) => step.tool === tool)).map((tool) => ({ tool, purpose: purposeForTool(tool, plan.task_type), dry_run_first: /web_search|redirect|download/.test(tool), requires_approval: /web_search|redirect|download/.test(tool), expected_evidence: expectedEvidenceForTool(tool) }))],
    what_each_tool_is_for: plan.what_each_tool_is_for,
    dry_run_steps: plan.dry_run_steps,
    approval_required_steps: plan.approval_required_steps,
    evidence_to_collect: plan.evidence_to_collect,
    source_quality_requirements: plan.source_quality_requirements,
    browser_understanding_limits: plan.browser_understanding_limits,
    must_not_claim: plan.must_not_claim,
    when_external_web_search_is_required: plan.when_external_web_search_is_required,
    fallbacks_if_browser_unavailable: plan.fallbacks_if_tool_unavailable,
    done_definition: plan.done_definition,
    efficiency_guidance: plan.efficiency_guidance,
    core_executes_tools: false,
    web_search_executed: false
  };
}

function explainToolsChain(args = {}) {
  const plan = buildCoreToolsPlan({ task: args.task, task_type_hint: args.task_type_hint, known_context: args.known_context, token_budget: args.token_budget });
  const selectedList = Array.isArray(args.selected_tools) ? args.selected_tools : [];
  const chosen = selectedList.length ? selectedList : plan.selected_tools;
  return {
    task: args.task,
    task_type: plan.task_type,
    chain: chosen.map((tool) => ({ tool, what_for: purposeForTool(tool, plan.task_type), evidence_expected: expectedEvidenceForTool(tool), requires_approval_if_real_action: /apply_patch|run_project_task|start_dev_server|browser|fetch_url_text|git_commit|api_request|restore/.test(tool) })),
    must_not_claim: plan.must_not_claim,
    core_executes_tools: false,
    web_search_executed: false
  };
}



function truncateText(value, max = 240) {
  const text = String(value ?? "");
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}


function buildUiQualityPlan(args = {}) {
  const userGoal = String(args.user_goal || args.task || "");
  const uiSurface = String(args.ui_surface || "unknown UI surface");
  const expectedFlow = String(args.expected_user_flow || "");
  const routesOrComponents = uniqueStrings(arrayify(args.routes_or_components).map(String).filter(Boolean));
  const hay = normalize(`${userGoal} ${uiSurface} ${expectedFlow} ${routesOrComponents.join(" ")} ${args.known_context || ""}`);
  const visualContract = buildVisualProofContract({ claim_type: args.claim_type || inferUiClaimType(hay), claim: userGoal, route_or_component: routesOrComponents[0] || uiSurface, token_budget: args.token_budget || "normal" });
  const stateRequired = /loading|spinner|pending|empty|zero state|no data|error|failure|invalid|form|dashboard|data|api|async/.test(hay);
  const beforeAfter = /improve|visual|layout|fix|changed|polish|dashboard|before|after|regression/.test(hay);
  return {
    user_goal: userGoal,
    ui_surface: uiSurface,
    expected_user_flow: expectedFlow || "Open the relevant local route, exercise the user-visible path, and verify visible result/state.",
    routes_or_components_to_check: routesOrComponents.length ? routesOrComponents : ["identify actual route/page entry", "identify rendered component", "identify caller/data-flow path"],
    visual_evidence_required: visualContract.minimum_required_evidence.filter((item) => /screenshot|visual|before|after|route|DOM/i.test(item)),
    browser_evidence_required: ["approved localhost/file route visit evidence", "DOM/visible text assertion for the target route/component", "browser screenshot evidence or honest browser_unavailable status", "user-flow step evidence for visible action/result"],
    console_checks_required: ["browser console checked after route load and user-flow steps", "runtime errors/warnings summarized; unknown console status blocks 'works in browser' claims"],
    network_checks_required: ["network requests checked for failed API/assets on route and flow", "unknown network status blocks browser-works claims"],
    accessibility_checks_required: ["run heuristic accessibility audit or equivalent a11y evidence", "keyboard/focus/labels/ARIA/contrast risks noted when relevant"],
    responsive_viewports_required: [
      { label: "mobile", width: 390, height: 844 },
      { label: "tablet", width: 768, height: 1024 },
      { label: "desktop", width: 1440, height: 900 }
    ],
    empty_loading_error_states_required: stateRequired ? ["loading/pending state", "empty/no-data state", "error/failure state", "success/normal populated state"] : ["state coverage still considered if data/form/API behavior appears"],
    before_after_required: beforeAfter,
    Tools_MCP_actions_needed: ["vnem_tools_ui_surface_review", "vnem_tools_browser_evidence_plan", "vnem_tools_start_dev_server", "vnem_tools_browser_evidence_run", "vnem_tools_browser_capture", "vnem_tools_browser_page_inspect", "vnem_tools_browser_accessibility_audit", "vnem_tools_browser_compare_snapshots", "vnem_tools_ui_evidence_audit", "vnem_tools_collect_evidence"],
    permission_profile_expected: "safe-readonly for source review; safe-local-dev or approved-writes only for approved localhost browser proof after dry-run",
    local_dev_server_needed: true,
    risk_flags: ["component file may exist but not be rendered", "route may not point at changed component", "responsive claim may be desktop-only", "console/network errors can invalidate browser-works claims", "visual fix needs before/after proof", "state coverage can be missing for async/data UI"],
    targeted_checks: ["source review confirms route/component/caller path", "browser plan lists exact route and viewports before capture", "DOM text/selector proves component renders", "console and network are clean or failures are reported", "accessibility audit evidence exists for a11y claims", "empty/loading/error states are forced or verified when relevant"],
    full_verification_near_final: ["After targeted UI evidence is clean, run affected build/test once.", "Near final, run broader smoke/readiness once; do not loop full suite during small edits."],
    must_not_claim: ["Core opened a browser.", "Core captured screenshots.", "Core ran a dev server.", "UI improved without screenshot/DOM/browser evidence.", "Responsive without multiple viewport evidence.", "Browser works while console/network status is unknown.", "Component is user-visible without route/caller/render evidence."],
    core_plan_only: true,
    core_executes_tools: false,
    core_executes_browser: false,
    core_captures_screenshots: false
  };
}

function buildVisualProofContract(args = {}) {
  const claimType = String(args.claim_type || "visual_improvement");
  const claim = String(args.claim || "");
  const routeOrComponent = String(args.route_or_component || "target route/component");
  const isResponsive = claimType === "responsive_fix" || /responsive|mobile|tablet|desktop|viewport/.test(normalize(claim));
  const isA11y = claimType === "accessibility_improvement" || /accessibility|a11y|aria|keyboard|contrast/.test(normalize(claim));
  const isState = /loading_state|error_state|empty_state/.test(claimType) || /loading|error|empty|state/.test(normalize(claim));
  const isBeforeAfter = claimType === "before_after_comparison" || ["visual_improvement", "layout_fix", "responsive_fix", "dashboard_change"].includes(claimType);
  const routeRequired = ["route_added", "component_added", "dashboard_change", "form_flow", "visual_improvement", "layout_fix", "responsive_fix"].includes(claimType);
  const min = [
    "at least one screenshot or equivalent visual/browser evidence for the affected UI",
    routeRequired ? `route/component render evidence for ${routeOrComponent}` : null,
    "DOM or visible-text assertion proving the target UI rendered",
    "console error check result after load/user flow",
    "network failure check result after load/user flow",
    isA11y ? "accessibility audit evidence for the claimed improvement" : "accessibility risk check when UI quality is claimed",
    isResponsive ? "multiple viewport results, not desktop-only" : null,
    isState ? "state evidence for loading/error/empty/success as applicable" : null,
    isBeforeAfter ? "before/after screenshot or snapshot comparison for visual/layout claims" : null
  ].filter(Boolean);
  const preferred = [
    "before and after screenshots with route, viewport, timestamp/path/hash metadata",
    "mobile, tablet, and desktop viewport evidence",
    "DOM/visible text assertions for important headings/buttons/forms",
    "clean console and network summaries, or explicit known failures",
    "static/automated accessibility audit plus manual keyboard/focus notes for important flows",
    "empty/loading/error/success state screenshots or DOM assertions"
  ];
  return {
    claim_type: claimType,
    minimum_required_evidence: min,
    preferred_evidence: preferred,
    route_or_component_integration_required: routeRequired,
    screenshots_required: ["visual_improvement", "layout_fix", "responsive_fix", "dashboard_change", "before_after_comparison", "form_flow"].includes(claimType),
    dom_or_text_assertions_required: true,
    console_error_check_required: true,
    network_error_check_required: true,
    accessibility_check_required: isA11y || /visual|layout|dashboard|form|component|route/.test(claimType),
    viewport_check_required: isResponsive || /visual|layout|dashboard/.test(claimType),
    state_coverage_required: isState || /dashboard|form|route|component/.test(claimType),
    what_counts_as_done: ["The target route/component is proven rendered in the browser or DOM evidence.", "Visual/browser evidence supports the claim and is attached/listed.", "Console/network status is clean or limitations are explicit.", "Responsive/a11y/state evidence exists when claimed.", "Final report separates proven/tested/unknown and avoids visual overclaims."],
    must_not_claim: ["UI improved without screenshot or browser/DOM evidence.", "Visual fix is done without before/after proof when appearance changed.", "Responsive from a single viewport.", "Accessibility improved without accessibility audit evidence.", "Browser works while console/network errors are unknown.", "Route/component is user-visible without render/caller evidence."]
  };
}

function inferUiClaimType(text) {
  if (/responsive|mobile|tablet|viewport/.test(text)) return "responsive_fix";
  if (/accessibility|a11y|aria|keyboard|contrast/.test(text)) return "accessibility_improvement";
  if (/loading|spinner|pending/.test(text)) return "loading_state";
  if (/error|failure|invalid/.test(text)) return "error_state";
  if (/empty|no data|zero state/.test(text)) return "empty_state";
  if (/route/.test(text)) return "route_added";
  if (/component/.test(text)) return "component_added";
  if (/dashboard/.test(text)) return "dashboard_change";
  return "visual_improvement";
}

function formatUiQualityPlan(plan) {
  return [`vnem_build_ui_quality_plan: ${plan.ui_surface}`, `Routes/components: ${plan.routes_or_components_to_check.join("; ")}`, `Visual evidence required: ${plan.visual_evidence_required.join("; ")}`, `Core plan-only: ${plan.core_plan_only}`].join("\n");
}

function formatVisualProofContract(contract) {
  return [`vnem_visual_proof_contract: ${contract.claim_type}`, `Minimum evidence: ${contract.minimum_required_evidence.join("; ")}`, `Screenshots required: ${contract.screenshots_required}`, `Route/component required: ${contract.route_or_component_integration_required}`].join("\n");
}

function buildDebuggingPlan(args = {}) {
  const task = String(args.task || "");
  const expected = String(args.expected_behavior || "");
  const actual = String(args.actual_behavior || "");
  const output = String(args.error_or_output || "");
  const failingCommand = String(args.failing_command || "");
  const context = String(args.known_context || "");
  const hay = normalize(`${task} ${expected} ${actual} ${output} ${failingCommand} ${context}`);
  const failureType = inferFailureType({ task, output, failingCommand, actual });
  const hasEvidence = Boolean(output || failingCommand || /error|log|stack|trace|failed|failing|crash/i.test(context));
  const uiLike = failureType === "UI" || /ui|dashboard|page|browser|click|blank|screen|component|visual/.test(hay);
  const evidenceAvailable = [
    output ? `provided error/output: ${truncateText(output, 220)}` : null,
    failingCommand ? `failing command: ${failingCommand}` : null,
    expected ? `expected behavior: ${expected}` : null,
    actual ? `actual behavior: ${actual}` : null,
    context && /error|log|stack|trace|failed|failing|crash/i.test(context) ? `known context evidence: ${truncateText(context, 220)}` : null
  ].filter(Boolean);
  const evidenceMissing = [
    !output ? "exact error/log/stack trace or recent test/build output" : null,
    !failingCommand ? "failing command or reproduction command" : null,
    !expected ? "expected behavior" : null,
    !actual ? "actual behavior" : null,
    uiLike ? "browser console/network output and focused screenshots for the failing UI state" : null
  ].filter(Boolean);
  const firstEvidence = [];
  if (output || failingCommand) firstEvidence.push("provided error/output and failing command are the first evidence to inspect");
  if (failureType === "startup" || failureType === "crash") firstEvidence.push("startup/crash logs and terminal lines above the first red error");
  if (failureType === "test") firstEvidence.push("the one failing test output before any code change");
  if (failureType === "build") firstEvidence.push("build output and config/runtime version evidence");
  if (failureType === "UI") firstEvidence.push("browser console errors, network failures, DOM/page state, and exact clicked action");
  if (failureType === "MCP") firstEvidence.push("MCP server startup logs, tool list, allowed roots, permission profile, and client error");
  if (!firstEvidence.length) firstEvidence.push("terminal output, logs, git status/diff, config files, and the tightest reproducible command");
  const targeted = targetedChecksForFailure(failureType, failingCommand, task);
  return {
    problem_summary: task,
    expected_behavior: expected || "not provided; clarify or infer cautiously from task",
    actual_behavior: actual || output || "not provided; gather logs/repro before fixing",
    failure_type: failureType,
    evidence_available: evidenceAvailable,
    evidence_missing: evidenceMissing,
    user_input_or_screenshots_useful: uiLike || !hasEvidence,
    specific_user_evidence_request: specificEvidenceRequest(failureType, uiLike, hasEvidence),
    logs_or_output_to_check_first: firstEvidence,
    likely_root_cause_areas: likelyRootCauseAreas(failureType, hay),
    compatibility_risks: compatibilityRisksForDebugging(failureType, hay),
    safety_risks: ["Do not read secrets or private session/cookie/browser-profile files.", "Do not suppress errors or skip tests to create a green run.", "Do not run package installs, GitHub mutation, deployment, or broad filesystem scans."],
    Tools_MCP_actions_needed: ["vnem_tools_debug_evidence", "vnem_tools_architecture_review", "vnem_tools_code_search", "vnem_tools_read_many_files", "vnem_tools_run_project_task", "vnem_tools_git_status", "vnem_tools_git_diff_summary"],
    targeted_tests_or_checks: targeted,
    full_verification_near_final: ["After targeted checks pass, run the relevant broader suite/build/readiness once near final, not after every tiny edit.", "For VNEM changes, run npm test and readiness/check-links near final if the targeted ladder is green."],
    permission_profile_expected: "safe-readonly for evidence/architecture; approved-writes or creator-power only for approved patch/test execution steps",
    must_not_claim: ["Core inspected logs or ran tests.", "The bug is fixed before targeted verification passes.", "Root cause is proven when evidence is missing or only guessed.", "Unrelated passing tests prove the failing path."],
    core_plan_only: true
  };
}

function buildEvidenceToFixCheck(args = {}) {
  const task = String(args.task || "");
  const fix = String(args.claimed_fix || "");
  const root = String(args.root_cause || "");
  const files = arrayify(args.changed_files).map(String);
  const evidence = arrayify(args.evidence_items).map((item) => typeof item === "string" ? item : JSON.stringify(item));
  const commands = arrayify(args.commands_run).map(String);
  const hay = normalize(`${task} ${fix} ${root} ${files.join(" ")} ${evidence.join(" ")} ${commands.join(" ")}`);
  const docsOnly = files.length > 0 && files.every((file) => /(^|\/)(readme|docs?|changelog|contributing)|\.(md|mdx|txt)$/i.test(file));
  const risks = [];
  const unrelated = [];
  const missingVerification = [];
  const evidenceText = normalize(evidence.join(" "));
  const fileMatches = !files.length || files.some((file) => evidenceText.includes(normalize(file)) || evidenceText.includes(normalize(path.basename(file))) || normalize(task).includes(normalize(file)) || normalize(task).includes(normalize(path.basename(file))));
  if (!evidence.length) risks.push("fix with no log/error/test evidence");
  if (!root) risks.push("root cause missing or uncertain");
  if (docsOnly && /fix|fixed|bug|crash|runtime|test|error/.test(normalize(`${task} ${fix}`))) risks.push("docs-only or wording-only change claimed as bug fix");
  if (/test\.skip|skip\(|\.only\(|disabled|commented out|swallow|suppress|ignore error|catch \(.*\).*empty/.test(hay)) risks.push("disabled/skipped/suppressed failure claimed as fix");
  if (!fileMatches) unrelated.push("unrelated changed files do not match the implicated file/function/config evidence");
  if (!commands.some((cmd) => /test|check|build|lint|node --check|npm run/i.test(cmd) && /pass|passed|exit 0|success|green|ok/i.test(cmd))) missingVerification.push("rerun the targeted failing command/check and capture passing output");
  if (commands.some((cmd) => /validate|readiness|lint/.test(cmd) && !/test|failing|targeted|specific/.test(cmd)) && /fix|fixed|bug|crash|runtime/.test(hay)) missingVerification.push("unrelated passing checks are not proof of the failing path");
  const fixMatches = !unrelated.length && !docsOnly && evidence.length > 0 && Boolean(root || /same file|because|root cause|caused by/i.test(fix));
  let verdict = "accept_with_limits";
  if (risks.length || unrelated.length || missingVerification.length) verdict = risks.some((r) => /docs-only|disabled|no log|suppressed|skipped/.test(r)) || unrelated.length ? "reject" : "revise";
  return {
    verdict,
    evidence_strength: evidence.length && commands.length ? "medium" : evidence.length ? "low_to_medium" : "none",
    root_cause_status: root ? "stated" : "missing_or_uncertain",
    fix_matches_evidence: fixMatches,
    targeted_verification_required: missingVerification.length ? missingVerification : ["Keep the targeted failing check in the evidence ledger."],
    unrelated_change_risk: unrelated,
    placebo_fix_risk: risks,
    safe_to_claim: verdict === "accept_with_limits" ? ["Claim only the verified targeted behavior and remaining risk."] : ["Partial investigation only; do not claim fixed."],
    must_not_claim: ["bug fix is complete without targeted verification", "docs-only/wording change fixed runtime behavior", "disabled or skipped tests prove a fix", "unrelated passing tests prove the failing path"],
    next_best_check: missingVerification[0] || "Run the smallest targeted regression check, then the relevant broader check near final."
  };
}

function buildArchitectureMap(args = {}) {
  const task = String(args.task || "");
  const context = String(args.known_context || "");
  const hay = normalize(`${task} ${context} ${args.project_type_hint || ""}`);
  const isMcp = /mcp|tool|server|registry|registertool/.test(hay);
  const isDashboard = /dashboard|component|route|ui|frontend|react/.test(hay);
  const isApi = /api|endpoint|route|backend|server/.test(hay);
  const entry = [
    isMcp ? "scripts/vnem-mcp-server.mjs or scripts/vnem-tools-mcp-server.mjs registerTool blocks" : null,
    isMcp ? "package.json MCP/test scripts and test-mcp-user-smoke coverage" : null,
    isDashboard ? "dashboard route/component entry points and real rendering path" : null,
    isApi ? "server/API route handler and caller/client path" : null,
    "package.json scripts and existing targeted tests"
  ].filter(Boolean);
  return {
    user_goal: task,
    relevant_entry_points: entry,
    current_implementation_path: ["Use Tools architecture/source map evidence before editing; Core has not read files.", isMcp ? "Find existing MCP registry/tool manifest/test pattern before adding a tool." : "Trace existing caller/route/component path before adding new code."],
    existing_patterns_to_follow: ["modify the active registry/caller/route instead of creating a side system", "add a focused test that fails when the real integration is missing", "keep output contracts backward compatible unless callers/tests are updated"],
    files_likely_involved: likelyFilesForArchitecture(hay),
    tests_likely_involved: ["new targeted behavior test", "test:mcp or test:mcp-user-smoke for MCP tool surfaces", "caller/contract/integration test for route/component/API changes"],
    contracts_or_interfaces_affected: [isMcp ? "MCP tool name/schema/structuredContent manifest" : null, isDashboard ? "dashboard route/component props/data shape" : null, isApi ? "API JSON output/caller expectations" : null, "package script/test command names if changed"].filter(Boolean),
    integration_points: [isMcp ? "MCP tool registry, Tools manifest catalog, smoke tests, readiness report" : null, isDashboard ? "actual route renders component and data flows from real caller/API" : null, isApi ? "handler, client/caller, output schema, tests" : null, "package script and targeted test entry"].filter(Boolean),
    risks: ["parallel fake system or unwired helper", "dead code/unreferenced new module", "contract/schema change without caller/test update", "mock-only test that never hits real routing path", "secret or permission boundary regression"],
    what_must_not_be_broken: ["existing tests/readiness", "Batch B permission/secret blocking", "Batch C source evidence boundaries", "real entry points and public output contracts"],
    core_plan_only: true
  };
}

function buildCodeChangeContract(args = {}) {
  const goal = String(args.goal || "");
  const arch = args.architecture_evidence || {};
  const files = arrayify(args.files_to_change).map(String);
  const avoid = arrayify(args.files_to_avoid).map(String);
  const contracts = arrayify(args.contracts_affected).map(String);
  return {
    goal,
    existing_architecture_summary: args.existing_architecture_summary || arch.current_implementation_path?.join("; ") || "Architecture evidence required before serious edits; Core itself has not inspected files.",
    real_integration_point: arrayify(arch.integration_points).length ? arrayify(arch.integration_points) : ["Identify and modify the real route/caller/entry/registry that executes or renders the feature."],
    files_to_change: files,
    files_to_avoid: avoid.length ? avoid : ["unrelated docs/config/lockfiles", "parallel helper modules not imported by real callers", "secret/session/cookie/browser-profile paths"],
    contracts_affected: contracts.length ? contracts : ["caller expectations", "test command names", "structured output / API / UI data shape if touched"],
    compatibility_risks: ["runtime/client/version mismatch", "changed schema without caller migration", "platform/path/shell differences"],
    safety_risks: ["secret leakage", "permission bypass", "broad filesystem or network access", "error suppression to pass tests"],
    tests_to_update_or_add: ["targeted failing test at the real integration point", "caller/contract test for changed output shape", "regression test proving old behavior still works", "avoid mock-only proof unless paired with a real path test"],
    verification_required: ["run the targeted test/check first", "run syntax checks for touched scripts", "run relevant readiness/smoke tests", "run broader suite/build near final"],
    rollback_considerations: ["keep diff small and coherent", "record git status/diff before commit", "avoid irreversible generated/user data changes"],
    what_counts_as_done: ["new behavior is wired into the real entry point", "targeted test fails without the wiring and passes with it", "callers/contracts/docs generated surfaces are updated where needed", "final report separates proven/tested/unknown"],
    must_not_claim: ["implemented when code is unwired", "full fix from mock-only tests", "contract compatibility without caller/test evidence", "safe or complete while verification is missing"]
  };
}

function inferFailureType({ task, output, failingCommand, actual }) {
  const text = normalize(`${task} ${output} ${failingCommand} ${actual}`);
  if (/test|assert|jest|vitest|pytest|npm run test|failing test/.test(text)) return "test";
  if (/startup|start dev|server starts|boot/.test(text)) return "startup";
  if (/build|compile|vite build|tsc|webpack|rollup/.test(text)) return "build";
  if (/dashboard|ui|browser|page|blank|click|component|visual|dom/.test(text)) return "UI";
  if (/mcp|stdio|tool list|registertool|allowed root/.test(text)) return "MCP";
  if (/npm install|dependency|peer|package|lockfile|module not found/.test(text)) return "package";
  if (/config|env|setting|yaml|json parse/.test(text)) return "config";
  if (/crash|segfault|fatal|panic|uncaught/.test(text)) return "crash";
  if (/typeerror|referenceerror|runtime|exception|undefined/.test(text)) return "runtime";
  return "unknown";
}

function targetedChecksForFailure(type, failingCommand, task) {
  const checks = [];
  if (failingCommand) checks.push(`rerun targeted failing command: ${failingCommand}`);
  if (type === "test") checks.push("run one failing test or one affected test file before the full suite");
  if (type === "build") checks.push("run the single failing build/check step before full validation");
  if (type === "startup" || type === "MCP") checks.push("run node --check on touched MCP/server scripts and the exact startup/smoke test");
  if (type === "UI") checks.push("run the affected route/page check plus browser console/network inspection before full UI suite");
  if (!checks.length) checks.push("create the tightest targeted repro/check before changing code");
  checks.push("only after targeted green, run the relevant broader regression check near final");
  return checks;
}

function specificEvidenceRequest(type, uiLike, hasEvidence) {
  const req = [];
  if (!hasEvidence) req.push("Paste the exact failing command and the terminal output from the first red error through the stack trace.");
  if (uiLike) req.push("Provide one screenshot of the visible error/blank state, one screenshot or copy of browser console errors, and the exact action clicked before failure.");
  if (type === "MCP") req.push("Provide MCP startup command, stderr/stdout, client error, tool list/allowed-root context if available.");
  if (type === "package") req.push("Provide package manager output including peer/version/audit conflict lines and package manager/runtime version.");
  if (!req.length) req.push("Existing evidence is enough to start; gather more only if the targeted repro is unclear.");
  return req;
}

function likelyRootCauseAreas(type, text) {
  const map = {
    startup: ["entrypoint initialization", "runtime/config/env mismatch", "dependency import failure", "port or path setup"],
    crash: ["uncaught exception site", "invalid input/state before crash", "runtime dependency/config"],
    runtime: ["function receiving undefined/null", "caller data contract", "state initialization", "error boundary/handling"],
    test: ["failing assertion path", "recent code diff", "fixture/data contract", "mock vs real behavior gap"],
    build: ["syntax/type/module resolution", "config/lockfile/runtime version", "generated artifact contract"],
    UI: ["route/component rendering path", "frontend/backend data flow", "browser console/network errors", "loading/error/empty/success states"],
    MCP: ["server startup", "tool registry/schema", "allowed roots/permission profile", "client transport/runtime version"],
    package: ["dependency version conflict", "package script/lockfile", "peer/runtime mismatch", "install script policy"],
    config: ["config schema/path/env", "runtime reads different file than edited", "caller contract mismatch"],
    unknown: ["tight reproduction path", "logs/output", "recent diff", "integration boundary"]
  };
  return map[type] || map.unknown;
}

function compatibilityRisksForDebugging(type, text) {
  return [
    /node|npm|package|mcp|vite|react|browser/.test(text) ? "runtime/package/client version compatibility" : null,
    type === "MCP" ? "MCP client/server SDK and stdio transport compatibility" : null,
    type === "UI" ? "browser/device/responsive/frontend-backend compatibility" : null,
    /windows|path|shell|powershell|bash/.test(text) ? "OS/shell/path compatibility" : null,
    "unknown until version/config evidence is gathered"
  ].filter(Boolean);
}

function likelyFilesForArchitecture(text) {
  const files = ["package.json", "existing targeted tests under scripts/test-*.mjs or project test directory"];
  if (/mcp|tool|registertool/.test(text)) files.push("scripts/vnem-mcp-server.mjs", "scripts/vnem-tools-mcp-server.mjs", "scripts/test-mcp-server.mjs", "scripts/test-mcp-user-smoke.mjs", "readiness report scripts");
  if (/dashboard|ui|react|component/.test(text)) files.push("dashboard/src routes/components", "dashboard tests", "dashboard build config");
  if (/api|server|route|backend/.test(text)) files.push("server/API handler", "client/caller using API output", "API contract tests");
  return [...new Set(files)];
}

function formatDebuggingPlan(plan) {
  return [`Problem: ${plan.problem_summary}`, `Failure type: ${plan.failure_type}`, `Evidence missing: ${plan.evidence_missing.join("; ") || "none"}`, `Check first: ${plan.logs_or_output_to_check_first.join("; ")}`, `Core plan-only: ${plan.core_plan_only}`].join("\n");
}

function formatEvidenceToFixCheck(check) {
  return [`Verdict: ${check.verdict}`, `Evidence strength: ${check.evidence_strength}`, `Fix matches evidence: ${check.fix_matches_evidence}`, `Next: ${check.next_best_check}`].join("\n");
}

function formatArchitectureMap(map) {
  return [`Goal: ${map.user_goal}`, `Entry points: ${map.relevant_entry_points.join("; ")}`, `Integration points: ${map.integration_points.join("; ")}`, `Core plan-only: ${map.core_plan_only}`].join("\n");
}

function formatCodeChangeContract(contract) {
  return [`Goal: ${contract.goal}`, `Integration: ${contract.real_integration_point.join("; ")}`, `Verification: ${contract.verification_required.join("; ")}`, `Done: ${contract.what_counts_as_done.join("; ")}`].join("\n");
}

function buildResearchStrategy(args = {}) {
  const task = String(args.task || "");
  const known = String(args.known_context || "");
  const hay = normalize(`${task} ${known} ${args.domain_hint || ""}`);
  const assessment = assessResearchNeed(args);
  const currentness = Boolean(args.freshness_required || assessment.freshness_requirement.required || /latest|current|today|recent|now|this week|security|pricing|version|api|package|docs|release/.test(hay));
  const officialRequired = /api|sdk|official|docs|package|install|setup|security|download|release|changelog|version|compatib|mcp|client|library|framework/.test(hay);
  const localBrowser = /local app|dashboard|browser proof|ui state|frontend|web app|visual|page state|backend data/.test(hay);
  const securityRisk = /security|download|redirect|phishing|malware|credential|captcha|installer|token|secret|scam/.test(hay);
  const sourceTypes = new Set([...(assessment.source_types_needed || [])]);
  if (officialRequired) sourceTypes.add("official_docs");
  if (currentness) { sourceTypes.add("release_notes"); sourceTypes.add("package_registry_or_current_index"); }
  if (/repo|github|source code|architecture|readme/.test(hay)) sourceTypes.add("source_repo");
  if (localBrowser) sourceTypes.add("local_browser_page");
  if (securityRisk) sourceTypes.add("security_advisory_or_reputation_source");
  const claims = inferResearchClaims(task, known, { currentness, officialRequired, localBrowser, securityRisk });
  const queries = buildCoreSearchQueries(task, args.domain_hint || "", currentness, [...sourceTypes], known).queries.slice(0, args.token_budget === "compact" ? 5 : 10);
  const strategy = {
    user_question_or_task: task,
    research_goal: inferResearchGoal(task, known),
    currentness_required: currentness,
    official_docs_required: officialRequired,
    local_browser_or_app_inspection_required: localBrowser,
    security_or_download_risk: securityRisk,
    source_types_to_check: [...sourceTypes],
    claims_to_verify: claims,
    likely_weak_source_risks: weakSourceRisksForResearch({ currentness, officialRequired, localBrowser, securityRisk }),
    queries_to_try: queries,
    source_ingestion_needed: /repo|docs|website|source|extract|understand|architecture|current|api|install|setup/.test(hay),
    contradiction_check_needed: currentness || officialRequired || /compare|conflict|contradict|old|outdated|community|blog|versus|vs/.test(hay),
    freshness_check_needed: currentness,
    stop_condition: ["A bounded source map/extract exists for each large source before any source-understanding claim.", "Important claims are tied to source graph or claim matrix evidence.", "Official/current source gaps are either closed or marked unknown/blocked.", "Contradictions and freshness limits are reported instead of hidden."],
    confidence_limit: currentness || officialRequired ? "medium until official/current source evidence and contradiction check exist" : "low_to_medium until bounded source evidence exists",
    must_not_claim: researchPlanMustNotClaim(),
    selected_tools_to_request_from_Tools_MCP: ["vnem_tools_source_map", "vnem_tools_source_extract", "vnem_tools_source_graph", "vnem_tools_claim_source_matrix", "vnem_tools_research_gap_detector"],
    core_executes_tools: false,
    web_search_executed: false
  };
  return strategy;
}

function arrayify(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];
  return [value];
}

function buildSourceIngestionPlan(args = {}) {
  const task = String(args.task || "");
  const sourceType = args.source_type || inferSourceIngestionType(`${task} ${args.known_context || ""} ${arrayify(args.source_targets).join(" ")}`);
  const targets = arrayify(args.source_targets).map(String);
  const local = sourceType === "local_repo";
  const external = ["website", "documentation_site", "GitHub_repo", "API_docs", "package_registry", "issue_tracker", "release_notes", "mixed"].includes(sourceType) && !local;
  const required = requiredSourceAreas(sourceType, task);
  const plan = {
    user_goal: task,
    source_type: sourceType,
    source_targets: targets,
    extraction_goal: args.extraction_goal || inferResearchGoal(task, args.known_context || ""),
    required_source_areas: required,
    optional_source_areas: optionalSourceAreas(sourceType, task),
    exclusions: ["secret-like paths (.env, tokens, credentials, cookies, sessions, private keys)", ".git internals", "node_modules/build/cache output", "irrelevant generated files", "broad uncontrolled crawling", "login/paywall/CAPTCHA/private-account data"],
    safety_boundaries: ["Map first, extract selected targets second.", "Do not ask Tools MCP to crawl blindly or follow links broadly.", external ? "Live external fetching requires explicit direct URLs, dry-run/approval where applicable, and provider/fetch evidence." : "Local inspection must stay inside allowed roots.", "Secret path blocking and output redaction remain mandatory."],
    access_level: local ? "user-approved local" : targets.some((t) => /^https?:/i.test(t)) ? "public_or_user_provided" : "unknown_or_user_provided",
    extraction_depth: /architecture|full-stack|repo|understand|debug|compat/i.test(task) ? "medium" : "shallow_to_medium",
    token_or_rate_limit_budget: args.token_budget === "expanded" ? "expanded but bounded; summarize/chunk large sources" : "bounded; prefer map and selected high-value targets",
    structured_output_required: ["source map", "source extraction report", "source graph", "claim verification matrix", "freshness/contradiction/gap notes"],
    stop_condition: ["Required source areas are mapped or explicitly marked blocked/missing.", "Selected extraction targets cover the claims being made.", "Source graph/audit can classify claims without pretending full-source understanding."],
    Tools_MCP_actions_needed: ["vnem_tools_source_map", "vnem_tools_source_extract", "vnem_tools_source_graph", "vnem_tools_claim_source_matrix", "vnem_tools_research_gap_detector"],
    permission_profile_expected: external ? "safe-local-dev for approved live fetches; safe-readonly for local/provided planning" : "safe-readonly",
    must_not_claim: ["Core crawled/read/extracted sources.", "Tools should crawl the whole site/repo blindly.", "Secret/private/account data is needed or allowed by default.", "Repo/site is fully understood from a shallow map only."],
    core_executes_tools: false,
    broad_crawl_allowed: false
  };
  return plan;
}

function buildResearchEvidenceAudit(args = {}) {
  const task = String(args.task || "");
  const conclusion = String(args.conclusion || "");
  const text = normalize(`${task} ${conclusion}`);
  const evidence = arrayify(args.evidence_items);
  const hasCurrent = evidence.some((item) => /current|recent|probably_current|version_specific/i.test(`${item.freshness || ""} ${item.published_at || ""} ${item.retrieved_at || ""}`) || /20\d{2}/.test(`${item.published_at || ""} ${item.retrieved_at || ""}`));
  const hasOfficial = evidence.some((item) => item.official === true || /official|docs|release|changelog|vendor|repo|package_registry/.test(`${item.source_type || ""} ${item.title || ""}`.toLowerCase()));
  const hasDownload = evidence.some((item) => /redirect|reputation|download|checksum|signature|head/i.test(`${item.source_type || ""} ${item.evidence_type || ""} ${item.title || ""}`));
  const hasWebsiteMap = evidence.some((item) => item.source_map_present === true || /source_map|page_inspect|link_map|browser_research_pack/.test(`${item.evidence_type || ""} ${item.source_type || ""}`));
  const hasRepoMap = evidence.some((item) => item.source_map_present === true || /source_map|repo_map|workspace_map|source_extract/.test(`${item.evidence_type || ""} ${item.source_type || ""}`));
  const hasVersionRuntime = evidence.some((item) => /version|runtime|package|lockfile|release|compat/i.test(`${item.source_type || ""} ${item.title || ""} ${item.text_excerpt || ""}`));
  const hasMultiple = evidence.length >= 2;
  const hasContradictionCheck = evidence.some((item) => item.contradiction_checked === true || /source_graph|claim_source_matrix|contradiction/i.test(`${item.evidence_type || ""} ${item.source_type || ""}`));
  const rejections = [];
  if ((args.freshness_required || /latest|current|today|recent|now|this week/.test(text)) && !hasCurrent) rejections.push("current-info claim without current source evidence");
  if (/official docs|official documentation|docs confirm|api behavior|official/.test(text) && !hasOfficial) rejections.push("official-docs claim without official docs or primary source evidence");
  if (/download safe|safe to download|redirect|installer|malware|phishing/.test(text) && !hasDownload) rejections.push("download safety claim without redirect/reputation/download evidence");
  if (/website|page|browser|ui|local app/.test(text) && !hasWebsiteMap) rejections.push("website-understanding claim without source map/page evidence");
  if (/repo|repository|codebase|architecture|fully understood/.test(text) && !hasRepoMap) rejections.push("repo-understanding claim without repo map/files evidence");
  if (/compatible|compatibility|works with|runtime|version/.test(text) && !hasVersionRuntime) rejections.push("compatibility claim without version/runtime evidence");
  if (/no contradiction|contradiction-free|no conflicts/.test(text) && (!hasMultiple || !hasContradictionCheck)) rejections.push("contradiction-free claim without multiple relevant sources and contradiction check");
  let classification = "unknown";
  if (rejections.some((r) => /current|official|repo|download|website|compatibility|contradiction/.test(r))) classification = evidence.length ? "weakly_supported" : "unknown";
  if (evidence.length && !rejections.length) classification = hasOfficial && hasMultiple ? "well_supported" : "likely";
  if (evidence.some((item) => /contradicted/i.test(`${item.status || ""} ${item.claim_status || ""}`))) classification = "contradicted";
  if (evidence.some((item) => /outdated/i.test(`${item.freshness || ""} ${item.status || ""}`)) && /current|latest|now|today/.test(text)) classification = "outdated";
  return {
    task,
    conclusion,
    classification,
    evidence_count: evidence.length,
    evidence_summary: evidence.map((item, index) => ({ id: item.id || `E${index + 1}`, title: item.title || item.path || "untitled", source_type: item.source_type || item.evidence_type || "unknown", official: Boolean(item.official), freshness: item.freshness || "unknown" })).slice(0, 20),
    rejections,
    missing_evidence: rejections,
    allowed_labels: ["proven", "well_supported", "likely", "weakly_supported", "contradicted", "outdated", "unknown", "blocked", "not_attempted"],
    must_not_claim: ["current-info claim without current source", "official-docs claim without official docs", "download safety claim without redirect/reputation/download evidence", "website-understanding claim without source map/page evidence", "repo-understanding claim without repo map/files evidence", "compatibility claim without version/runtime evidence", "contradiction-free claim without multiple relevant sources"],
    core_executes_tools: false,
    safe_next_action: rejections.length ? "Collect bounded source map/extract/source graph evidence or downgrade the claim to unknown/blocked." : "Use the classification and cite the evidence scope; do not exceed it."
  };
}

function inferResearchGoal(task, known) {
  if (/verify|confirm|claim|prove/i.test(task)) return "verify claims with bounded evidence and source graph";
  if (/current|latest|today|recent/i.test(task)) return "find current evidence and freshness limits";
  if (/repo|architecture|source|codebase/i.test(task)) return "map and extract source evidence before repo-understanding claims";
  return `answer the task with evidence boundaries: ${String(task || known).slice(0, 180)}`;
}

function inferResearchClaims(task, known, flags) {
  const claims = [];
  if (flags.currentness) claims.push("The answer reflects current/latest source evidence.");
  if (flags.officialRequired) claims.push("Official docs or primary sources support the key recommendation.");
  if (flags.localBrowser) claims.push("Local browser/app evidence supports any UI/page understanding claim.");
  if (flags.securityRisk) claims.push("Security/download risk was checked with redirect/reputation/download evidence.");
  const sentences = `${task}. ${known}`.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  claims.push(...sentences.slice(0, 4));
  return [...new Set(claims)].slice(0, 10);
}

function weakSourceRisksForResearch(flags) {
  return [
    flags.officialRequired ? "random blog/video used where official docs or source repo are required" : null,
    flags.currentness ? "outdated docs, old forum posts, cached AI pages, or missing release dates" : null,
    flags.securityRisk ? "download mirrors, fake buttons, phishing pages, unverified checksums" : null,
    flags.localBrowser ? "claiming UI behavior without page/source-map/browser evidence" : null,
    "single-source confidence without contradiction/counter-source check"
  ].filter(Boolean);
}

function researchPlanMustNotClaim() {
  return ["Core searched the web or browsed pages.", "Core executed Tools MCP actions.", "Current/latest facts are verified before source evidence exists.", "Official docs confirm a claim before official source evidence exists.", "No contradictions exist before multiple relevant sources are compared."];
}

function inferSourceIngestionType(text) {
  const t = normalize(text);
  if (/local repo|local project|workspace|c:\\|\/home|repo path/.test(t)) return "local_repo";
  if (/github/.test(t)) return "GitHub_repo";
  if (/api docs|official docs|sdk docs/.test(t)) return "API_docs";
  if (/package|npm|pypi|registry/.test(t)) return "package_registry";
  if (/issue|pull request|\bpr\b/.test(t)) return "issue_tracker";
  if (/release|changelog/.test(t)) return "release_notes";
  if (/docs|documentation/.test(t)) return "documentation_site";
  if (/website|web page|site/.test(t)) return "website";
  return "mixed";
}

function requiredSourceAreas(sourceType, task) {
  const base = {
    local_repo: ["README/install docs", "package or dependency manifests", "source directories", "tests/examples", "changelog/release notes", "config/CI files"],
    GitHub_repo: ["README", "default branch metadata", "source tree", "package manifests", "docs/examples", "issues/PRs only if relevant", "releases/changelog"],
    API_docs: ["official quickstart/install", "API reference", "auth/security docs", "version/deprecation notes", "changelog/migration guide"],
    documentation_site: ["docs hierarchy", "quickstart/install", "API/reference pages", "version selector", "changelog/troubleshooting"],
    website: ["homepage purpose", "navigation/link map", "important pages", "download/pricing/support if relevant", "risk/access-block notes"],
    package_registry: ["latest version", "published date", "repository/docs links", "dependencies/peer deps", "license/security notes"],
    issue_tracker: ["issue title/status", "maintainer comments", "affected versions", "linked PR/release", "workaround"],
    release_notes: ["latest version", "release date", "breaking changes", "migration/security fixes", "known issues"],
    mixed: ["source map", "high-value docs/pages/files", "release/currentness evidence", "claim-source evidence"]
  };
  const areas = base[sourceType] || base.mixed;
  if (/frontend|backend|full-stack|ui/i.test(task)) return [...areas, "frontend/backend flow map where relevant"];
  return areas;
}

function optionalSourceAreas(sourceType, task) {
  const out = ["examples/tutorials", "troubleshooting", "security policy", "license/contributing notes"];
  if (/issue|bug|compat|current/i.test(task)) out.push("issues/PRs/maintainer comments");
  if (/download|security|installer/i.test(task)) out.push("redirect/reputation/checksum/signature evidence");
  return out;
}

function formatResearchStrategy(plan) { return `vnem_build_research_strategy: current=${plan.currentness_required} official=${plan.official_docs_required} claims=${plan.claims_to_verify.length} core_executes_tools=false`; }
function formatSourceIngestionPlan(plan) { return `vnem_build_source_ingestion_plan: ${plan.source_type} targets=${plan.source_targets.length} actions=${plan.Tools_MCP_actions_needed.length} core_executes_tools=false`; }
function formatResearchEvidenceAudit(audit) { return `vnem_research_evidence_audit: ${audit.classification}; rejections=${audit.rejections.length} core_executes_tools=false`; }


function buildCorePermissionProfilePlan(task, known = "", selectedTools = []) {
  const text = normalize(`${task} ${known} ${selectedTools.join(" ")}`);
  const actionMap = [
    [/apply_patch|patch|edit|write|create file|delete file/, "apply_patch"],
    [/restore/, "restore_backup"],
    [/run_project_task|\btest\b|validate|lint|typecheck|command/, "run_test"],
    [/\bbuild\b|dashboard:build/, "run_build"],
    [/start_dev_server|dev server|localhost|preview/, "start_dev_server"],
    [/browser_capture|screenshot|visual proof|browser proof/, "browser_capture"],
    [/git_commit|commit/, "local_commit"],
    [/install|audit fix|package install|npm install|pnpm add|yarn add/, "package_install"],
    [/github|pull request|\bpr\b|issue|release/, "github_pr"],
    [/api_request|api call|external service/, "api_call"],
    [/fetch_url_text|web_search|external fetch|current search|url text/, "external_fetch"],
    [/download_safety|download/, "download_check"],
    [/secret|credential|\.env|api key|token/, "secret_read"],
    [/cookie|session|browser profile/, "cookie_session_access"],
    [/captcha|anti-bot bypass/, "captcha_bypass"],
    [/rm -rf|reset --hard|format|destructive shell/, "destructive_shell"],
    [/crawl|scrape all|whole pc/, "unrestricted_crawl"]
  ];
  const actions = [...new Set(actionMap.filter(([re]) => re.test(text)).map(([, action]) => action))];
  if (!actions.length && selectedTools.some((tool) => /workspace|read_many|code_search|dependency_scan/.test(tool))) actions.push("inspect_workspace");
  const blockedDangerous = actions.filter((a) => ["secret_read", "cookie_session_access", "captcha_bypass", "destructive_shell", "unrestricted_crawl"].includes(a));
  const writeActions = actions.filter((a) => ["apply_patch", "restore_backup", "local_commit"].includes(a));
  const devActions = actions.filter((a) => ["run_test", "run_build", "start_dev_server", "browser_capture", "api_call", "external_fetch", "download_check"].includes(a));
  const previewOnly = actions.filter((a) => ["package_install", "github_pr", "github_issue", "github_release"].includes(a));
  const requiredProfiles = new Set(["safe-readonly"]);
  if (devActions.length) requiredProfiles.add("safe-local-dev");
  if (writeActions.length) requiredProfiles.add("approved-writes");
  if (previewOnly.includes("package_install")) requiredProfiles.add("approved-installs");
  if (previewOnly.some((a) => a.startsWith("github"))) requiredProfiles.add("approved-github");
  const trustBoundaryLevel = blockedDangerous.length ? "6_blocked_dangerous_action" : previewOnly.some((a) => a.startsWith("github")) ? "4_external_account_action" : /secret|credential|token|\.env/.test(text) ? "3_sensitive_local_information" : writeActions.length || devActions.length ? "2_local_project_information" : "0_public_information";
  const approval = [...writeActions, ...devActions].map((action) => ({ action, approval_required: true, permission_profile_needed: writeActions.includes(action) ? "approved-writes" : "safe-local-dev or stronger" }));
  const blockedByDefault = [
    ...writeActions.map((action) => ({ action, blocked_under_default_profile: "safe-readonly", safe_alternative: "run dry-run/action-policy preview, then ask for approved-writes with explicit approval" })),
    ...devActions.map((action) => ({ action, blocked_under_default_profile: "safe-readonly", safe_alternative: "run permission preview, then ask for safe-local-dev or stronger with explicit approval" })),
    ...previewOnly.map((action) => ({ action, blocked_under_current_build: true, safe_alternative: "preview/planned only; do not claim package install or GitHub mutation occurred" })),
    ...blockedDangerous.map((action) => ({ action, hard_blocked: true, safe_alternative: "do not perform; use redacted user-provided excerpts or public/source-safe alternatives" }))
  ];
  return {
    active_profile_expected_default: "safe-readonly",
    required_permission_profile: requiredProfiles.has("approved-writes") ? "approved-writes" : requiredProfiles.has("safe-local-dev") ? "safe-local-dev" : "safe-readonly",
    required_profiles: [...requiredProfiles],
    trust_boundary_level: trustBoundaryLevel,
    actions_requiring_approval: approval,
    actions_blocked_by_current_profile: blockedByDefault,
    blocked_or_preview_only_actions: [...previewOnly, ...blockedDangerous],
    safe_alternative: blockedByDefault.length ? "Use vnem_tools_permission_status and vnem_tools_action_policy_preview first; ask for exact profile/approval; keep package/GitHub/destructive/secret actions blocked or preview-only." : "Use safe-readonly inspection first and collect evidence before claiming action results.",
    must_not_claim: ["Tools actions were allowed or executed without permission status/policy preview evidence.", "Package installs or GitHub mutation happened unless an implemented Tools tool proves it.", "Secrets/cookies/sessions/CAPTCHA/destructive shell were accessed or bypassed."]
  };
}

function augmentCompletionAuditForPermissions(result, args = {}) {
  const text = normalize(`${args.task || ""} ${args.claimed_result || ""} ${JSON.stringify(args.evidence || "")}`);
  const plan = buildCorePermissionProfilePlan(args.task || "", `${args.claimed_result || ""} ${JSON.stringify(args.evidence || "")}`, []);
  const flags = [];
  if (/install|npm install|pnpm add|yarn add/.test(text) && !/(npm install|pnpm add|yarn add).*(exit|passed|evidence)|installed.*evidence/.test(text)) flags.push("package install claim needs implemented Tools/evidence; current Tools support is preview/blocked only");
  if (/github|pull request|\bpr\b|issue|release/.test(text) && !/(gh |github api|pull request url|issue url|run id|evidence)/.test(text)) flags.push("GitHub mutation claim needs explicit external evidence; Tools MCP does not silently mutate GitHub");
  if (/permission|approved|safe|allowed/.test(text) && !/(permission_status|action_policy_preview|approval_note|approved=true)/.test(text)) flags.push("permission/approval claim lacks Tools permission-status or action-policy-preview evidence");
  if (!flags.length && plan.blocked_or_preview_only_actions.length) flags.push("review blocked/preview-only permission actions before final claim");
  return {
    ...result,
    permission_audit: { permission_profile_plan: plan, audit_flags: flags, core_still_plan_only: true },
    must_not_claim: [...new Set([...(result.must_not_claim || []), ...plan.must_not_claim])],
    missing_evidence: [...new Set([...(result.missing_evidence || []), ...flags])]
  };
}

function augmentCompletionAuditForResearch(result, args = {}) {
  const audit = buildResearchEvidenceAudit({ task: args.task || "", conclusion: args.claimed_result || "", evidence_items: Array.isArray(args.evidence) ? args.evidence : [] });
  const flags = audit.rejections.map((item) => `research/source evidence audit: ${item}`);
  return {
    ...result,
    research_evidence_audit: audit,
    must_not_claim: [...new Set([...(result.must_not_claim || []), ...audit.must_not_claim])],
    missing_evidence: [...new Set([...(result.missing_evidence || []), ...flags])]
  };
}


function inferCoreToolTaskType(text) {
  const t = String(text || "").toLowerCase();
  if (/\b(latest|current|today|this week|news|recent|now)\b.*\b(research|find|compare|what|which|source|browser|mcp)\b|\b(research|find)\b.*\b(latest|current|today|this week|news|recent|now)\b/.test(t)) return "current_research";
  if (/https?:\/\/[^\s]+/.test(t) && /research|source|claim|citation|analy[sz]e|summarize|docs|url|page/.test(t)) return "direct_url_source";
  if (/website|web page|page structure|browser tools|understand.+page|links|forms|headings|dom|readability/.test(t) && !/local|dashboard|ui|frontend|improve|fix/.test(t)) return "website_understanding";
  if (/research|source|claim|citation|paper|docs url|provided source|summarize.+source/.test(t)) return "research";
  if (/debug|bug|failing|stack trace|error|root cause|regression/.test(t)) return "debugging";
  if (/ui|frontend|browser|visual|page|dashboard|rendered|web app|accessibility|snapshot/.test(t)) return "ui_web";
  if (/investigate|inspect|find references|where is|file investigation|understand/.test(t)) return "file_investigation";
  if (/security|secret|credential|risk|safety|audit/.test(t)) return "security_sensitive";
  if (/modify|patch|edit|local project|repo|code|test|build|implement|improve|fix/.test(t)) return "coding";
  return "coding";
}

function directUrlPresent(text) {
  return /https?:\/\/[^\s]+/i.test(text);
}

function missingToolPlanQuestions(type, task) {
  if (["research", "direct_url_source", "website_understanding"].includes(type)) return ["Which direct source URLs, local files, or source excerpts should be evaluated?", "Does the answer require broad current web search outside Tools MCP?"];
  if (type === "current_research") return ["Which approved external current-search path should be used outside Tools MCP?", "Which direct sources should be inspected after discovery?"];
  if (type === "ui_web") return ["Which local dev command and URL should be used for visual/static page proof?", "Which page/state proves the change?"];
  if (type === "debugging") return ["What exact command/log/error reproduces the failure?", "What is the smallest targeted check for the fix?"];
  return ["What is the project root?", "Which checks define done?", "Should Tools create a local commit after approval?"];
}

function verificationForType(type) {
  if (["research", "direct_url_source", "website_understanding", "current_research"].includes(type)) return ["Evaluate source quality for each source.", "Separate supported, unsupported, and conflicting claims.", "State missing sources and do not claim a web search happened unless done outside Tools MCP with evidence."];
  if (type === "debugging") return ["Capture failing output first.", "Run targeted failing check after patch.", "Run only broader checks near final."];
  if (type === "ui_web") return ["Run safe project tests/build.", "Start local dev server if needed.", "Use page inspect/a11y/snapshot comparison and capture localhost/file browser proof or report browser_unavailable honestly."];
  return ["Run safe project task checks from package.json.", "Review git diff summary.", "Finish session evidence with safe-to-claim/must-not-claim."];
}

function doneDefinitionForType(type) {
  if (["research", "direct_url_source", "website_understanding", "current_research"].includes(type)) return ["Brief cites provided/direct sources", "unsupported/conflicting claims are listed", "must-not-claim prevents fake search/currentness", "external current search need is explicit when latest/current info is required"];
  if (type === "ui_web") return ["Relevant UI route/component files inspected", "component is proven rendered by a route/caller", "console/network/a11y and responsive viewport evidence collected", "empty/loading/error states checked when relevant", "before/after screenshot proof captured for visual fixes or browser_unavailable stated honestly", "targeted checks pass"];
  return ["Relevant files inspected", "approved patch/evidence exists if mutation happened", "targeted checks pass", "session evidence supports final claims"];
}

function efficiencyForType(type) {
  const base = ["Use workspace_map/project_scan before broad file reads.", "Search first, then read bounded relevant files.", "Run targeted checks during development; broad checks only near final."];
  if (["research", "direct_url_source", "website_understanding"].includes(type)) base.push("Use direct approved URLs/provided HTML/text first; build source packs instead of dumping entire pages.");
  if (type === "current_research") base.push("Do not burn tokens on stale provided sources for latest/current questions; use approved external current search outside Tools MCP, then inspect direct sources.");
  if (type === "ui_web") base.push("Use static page inspect/a11y/snapshot comparison before optional screenshot proof to reduce browser/runtime cost without losing evidence.");
  return base;
}

function sourceQualityRequirements(type) {
  if (!["research", "direct_url_source", "website_understanding", "current_research"].includes(type)) return [];
  return ["Prefer official/primary sources when available.", "Track whether each source was actually fetched/read or only provided as metadata.", "Separate supported, unsupported, and conflicting claims.", "Do not claim currentness without current search evidence."];
}

function browserUnderstandingLimits(type) {
  if (!["ui_web", "direct_url_source", "website_understanding", "current_research", "research"].includes(type)) return [];
  return ["Static page intelligence is not full unrestricted browser automation.", "DOM/search/readability/link/a11y tools do not execute JavaScript or certify visual behavior.", "Link map does not follow links or crawl.", "Browser capture is local file/localhost proof only by default and may return browser_unavailable."];
}

function currentResearchRequired(type, text) {
  if (type === "current_research") return ["The task asks for latest/current/recent information; external current web search is required outside Tools MCP until a safe approved search provider exists."];
  if (/\b(latest|current|today|this week|news|recent|now)\b/i.test(text) && ["research", "direct_url_source", "website_understanding"].includes(type)) return ["Currentness is requested; use external current search outside Tools MCP before final claims."];
  return [];
}

function purposeForTool(tool, type) {
  const map = {
    vnem_tools_manifest: "discover available Tools MCP capabilities and safety metadata",
    vnem_tools_start_session: "start one evidence pack",
    vnem_tools_finish_session: "finish one evidence pack with safe-to-claim and must-not-claim lines",
    vnem_tools_workspace_map: "understand local project structure safely",
    vnem_tools_code_search: "find relevant code without broad file reads",
    vnem_tools_read_many_files: "load bounded relevant file context",
    vnem_tools_project_scan: "inspect scripts/frameworks/safe commands",
    vnem_tools_app_inspect: "inspect app boundaries, routes, APIs, data flow, states, and adapter support",
    vnem_tools_app_vertical_slice_plan: "preview a coherent marker-backed frontend/API/domain transaction",
    vnem_tools_app_vertical_slice_apply: "apply an approved hash-bound app transaction with rollback evidence",
    vnem_tools_app_acceptance_run: "prove focused checks and a real desktop/mobile localhost user path",
    vnem_tools_app_transaction_rollback: "restore an app transaction without overwriting later edits",
    vnem_tools_dependency_scan: "inspect dependencies and risky scripts without installs",
    vnem_tools_fetch_url_text: "fetch one approved direct URL text/source, not search results",
    vnem_tools_browser_page_inspect: "browser/page source intelligence: turn direct/local/provided page content into structured understanding",
    vnem_tools_browser_readability_extract: "browser/page readability: extract heuristic readable article/docs/main content",
    vnem_tools_browser_link_map: "browser/page link mapping: map links without following or crawling",
    vnem_tools_browser_dom_search: "browser/page DOM search: search page headings/forms/buttons/links/text statically",
    vnem_tools_browser_accessibility_audit: "run static heuristic accessibility/UI audit",
    vnem_tools_browser_compare_snapshots: "compare before/after page snapshots without visual overclaims",
    vnem_tools_source_quality_check: "score/flag source quality and citation limits",
    vnem_tools_research_brief: "summarize supported and unsupported claims from source excerpts",
    vnem_tools_browser_research_pack: "combine multiple source/page summaries into a claim evidence pack",
    vnem_tools_search_provider_manifest: "show available/configured search providers without exposing API keys",
    vnem_tools_search_query_builder: "build strong search queries before approved provider search",
    vnem_tools_web_search: "run approved provider search if configured, or return honest unavailable status",
    vnem_tools_search_result_ranker: "rank result usefulness, freshness, credibility, duplicate clusters, and risk",
    vnem_tools_redirect_chain_check: "check redirects safely without cookies/session/login or blind following",
    vnem_tools_url_reputation_check: "detect phishing/scam/download/credential URL risk heuristically",
    vnem_tools_captcha_detector: "detect CAPTCHA/access-block pages and require safe user-assisted handoff; no bypass",
    vnem_tools_download_safety_check: "assess download link risk before following/downloading; no installer execution",
    vnem_tools_claim_source_matrix: "map claims to supporting/conflicting/missing source evidence",
    vnem_tools_research_gap_detector: "find missing current/primary/counter/date/version evidence before confident answer",
    vnem_tools_apply_patch_batch: "dry-run/apply approved local file changes",
    vnem_tools_run_project_task: "run approved safe project checks",
    vnem_tools_start_dev_server: "start approved localhost dev server for proof",
    vnem_tools_browser_capture: "capture approved local/localhost screenshot proof when available",
    vnem_tools_stop_dev_server: "stop only Tools-started dev servers",
    vnem_tools_git_status: "read local git status",
    vnem_tools_git_diff_summary: "summarize final local diff"
  };
  return map[tool] || `support ${type} workflow`;
}

function expectedEvidenceForTool(tool) {
  if (/workspace_map/.test(tool)) return ["tree summary", "skipped secret/build paths"];
  if (/read_many|code_search|find_references/.test(tool)) return ["file paths", "redacted snippets", "caps/skips"];
  if (/dependency_scan/.test(tool)) return ["manifest scripts", "risky script flags", "no install"];
  if (/browser_page_inspect/.test(tool)) return ["title/headings/counts", "main text excerpt", "risk/quality flags", "evidence log"];
  if (/browser_readability/.test(tool)) return ["heuristic readable excerpt", "content counts", "truncation flag"];
  if (/browser_link_map/.test(tool)) return ["internal/external/anchor/download/suspicious links", "must-not-claim no crawling"];
  if (/browser_dom_search/.test(tool)) return ["matches", "mode", "truncation flag"];
  if (/browser_accessibility/.test(tool)) return ["static a11y score", "issues/warnings/passes", "not certification"];
  if (/browser_compare/.test(tool)) return ["changed headings/text/links/forms", "no visual overclaim"];
  if (/browser_research_pack/.test(tool)) return ["source summaries", "supported/unsupported/conflicting claims", "citation plan"];
  if (/search_provider_manifest/.test(tool)) return ["configured/unconfigured providers", "no key values exposed"];
  if (/search_query_builder/.test(tool)) return ["queries", "source type targets", "must-not-claim no search executed"];
  if (/web_search/.test(tool)) return ["provider status", "executed flag", "results or unavailable reason", "evidence log"];
  if (/search_result_ranker/.test(tool)) return ["ranked/best/weak/risky sources", "duplicate clusters", "next queries"];
  if (/redirect_chain/.test(tool)) return ["redirect chain", "cross-domain/suspicious redirects", "blocked reason"];
  if (/url_reputation/.test(tool)) return ["risk flags", "trust flags", "recommended action"];
  if (/captcha_detector/.test(tool)) return ["captcha/block signals", "safe user-assisted handoff", "no-bypass statement"];
  if (/download_safety/.test(tool)) return ["file type guess", "download risk flags", "manual review recommendation"];
  if (/claim_source_matrix/.test(tool)) return ["claim/source matrix", "supported/unsupported/conflicting claims", "citation plan"];
  if (/research_gap/.test(tool)) return ["missing source types", "current/primary/counter/date blockers", "next tools/queries"];
  if (/patch/.test(tool)) return ["changed files", "diff summary", "backups", "restore plan"];
  if (/run_project_task/.test(tool)) return ["command", "exit code", "redacted output"];
  if (/browser_capture/.test(tool)) return ["screenshot path/hash or browser_unavailable"];
  if (/research|source|fetch/.test(tool)) return ["source quality", "text hash/excerpt", "must-not-claim"];
  if (/session/.test(tool)) return ["session evidence pack"];
  return ["structured result"];
}


function assessResearchNeed(args = {}) {
  const task = String(args.task || "");
  const context = String(args.known_context || "");
  const domain = String(args.domain_hint || "");
  const hay = `${task} ${context} ${domain}`.toLowerCase();
  const freshness = Boolean(args.freshness_required || /\b(latest|current|today|this week|recent|now|news|meta|2026)\b/.test(hay));
  const directSourceEnough = /https?:\/\/\S+/.test(hay) && !freshness && !/compare|best|latest|current|news/.test(hay);
  const securityRisk = /security|malware|phishing|download|installer|scam|credential|cve|advisory/.test(hay);
  const captchaLikely = /captcha|cloudflare|access block|verify human|anti-bot|blocked/.test(hay);
  const uiVisual = /ui|visual|screenshot|browser proof|localhost|rendered|dashboard/.test(hay);
  const sourceTypes = [];
  if (/docs|library|api|software|mcp|package/.test(hay)) sourceTypes.push("official_source", "official_docs", "github_repo", "changelog_or_release_notes");
  if (/game|meta|build|pvp|pve|modding|mod/.test(hay)) sourceTypes.push("official_source", "community_source", "version_or_patch_notes");
  if (securityRisk) sourceTypes.push("official_source", "security_advisory", "url_reputation_or_malware_context");
  if (/compare|best|product|recommend/.test(hay)) sourceTypes.push("official_source", "independent_secondary_source", "counter_source");
  if (!sourceTypes.length) sourceTypes.push("official_source", "credible_secondary_source");
  const level = freshness || securityRisk ? "high" : directSourceEnough ? "medium" : "medium";
  return {
    task,
    research_need_level: level,
    freshness_requirement: { required: freshness, reason: freshness ? "Task asks for latest/current/recent or explicit freshness." : "No explicit currentness detected." },
    current_info_required: freshness,
    direct_source_enough: directSourceEnough,
    external_search_required: freshness || /find|research|compare|best|recommend|discover/.test(hay),
    official_source_required: true,
    community_source_useful: /game|meta|mod|community|reddit|forum/.test(hay),
    source_quality_risk: /medical|legal|financial|security|malware|download|best|current/.test(hay),
    malware_phishing_download_risk: securityRisk,
    captcha_access_block_likely: captchaLikely,
    ui_visual_proof_required: uiVisual,
    source_types_needed: [...new Set(sourceTypes)],
    selected_tools: researchPlanningToolsForText(hay),
    evidence_to_collect: ["provider manifest/configured provider status", "search query plan", freshness ? "provider-backed search evidence or unavailable reason" : null, "ranked sources", "source quality checks", "claim/source matrix", "research gaps", securityRisk ? "URL/reputation/download/redirect risk checks" : null, captchaLikely ? "CAPTCHA/access-block detection and user-assisted handoff" : null].filter(Boolean),
    must_not_claim: ["Core executed Tools.", "A web search happened before provider evidence exists.", "Current/latest facts are verified without current provider/search evidence.", "CAPTCHA was bypassed automatically.", "Downloads/installers were run or proven safe."],
    core_executes_tools: false,
    web_search_executed: false
  };
}

function buildSearchPlan(args = {}) {
  const assessment = assessResearchNeed(args);
  const queryPlan = buildCoreSearchQueries(args.task || "", args.domain_hint || "", assessment.freshness_requirement.required, assessment.source_types_needed, args.known_context || "");
  const selected = [...new Set(["vnem_tools_search_provider_manifest", "vnem_tools_search_query_builder", "vnem_tools_web_search", "vnem_tools_search_result_ranker", "vnem_tools_source_quality_check", "vnem_tools_claim_source_matrix", "vnem_tools_research_gap_detector", ...(assessment.malware_phishing_download_risk ? ["vnem_tools_url_reputation_check", "vnem_tools_redirect_chain_check", "vnem_tools_download_safety_check", "vnem_tools_captcha_detector"] : [])])];
  return {
    task: args.task,
    research_need_level: assessment.research_need_level,
    freshness_requirement: assessment.freshness_requirement,
    selected_tools: selected,
    tool_sequence: selected.map((tool) => ({ tool, purpose: purposeForTool(tool, "research"), dry_run_first: /web_search|redirect|download/.test(tool), requires_approval: /web_search|redirect|download/.test(tool), expected_evidence: expectedEvidenceForTool(tool) })),
    search_queries: queryPlan.queries,
    query_intents: queryPlan.query_intents,
    source_types_needed: assessment.source_types_needed,
    approval_required_steps: ["vnem_tools_web_search: real provider search requires configured provider plus explicit approval.", "vnem_tools_redirect_chain_check/vnem_tools_download_safety_check: real HEAD/network preflight requires approval."],
    captcha_handling_plan: captchaHandlingPlan(),
    download_safety_plan: downloadSafetyPlan(),
    evidence_to_collect: assessment.evidence_to_collect,
    must_not_claim: assessment.must_not_claim,
    done_definition: ["Provider status is known; unavailable providers are reported honestly.", "Search results are ranked before source reading.", "Claims are mapped to sources with unsupported/conflicting claims listed.", "Research gaps are closed or explicitly reported."],
    fallbacks_if_search_or_browser_unavailable: ["Use direct URLs/provided source text from the user.", "Use official docs/API/repository supplied by user.", "Say provider_unconfigured/provider_unavailable; do not invent results."],
    core_executes_tools: false,
    web_search_executed: false
  };
}

function buildBrowsingPlan(args = {}) {
  const assessment = assessResearchNeed({ ...args, domain_hint: `${args.known_context || ""} browsing risk` });
  const selected = [...new Set(["vnem_tools_redirect_chain_check", "vnem_tools_url_reputation_check", "vnem_tools_captcha_detector", "vnem_tools_download_safety_check", "vnem_tools_fetch_url_text", "vnem_tools_browser_page_inspect", "vnem_tools_browser_readability_extract", "vnem_tools_browser_link_map", "vnem_tools_source_quality_check", "vnem_tools_claim_source_matrix", "vnem_tools_research_gap_detector"] )];
  return {
    task: args.task,
    research_need_level: assessment.research_need_level,
    freshness_requirement: assessment.freshness_requirement,
    selected_tools: selected,
    tool_sequence: selected.map((tool) => ({ tool, purpose: purposeForTool(tool, "browsing_risk"), dry_run_first: /redirect|download|fetch|browser_page|browser_readability|browser_link/.test(tool), requires_approval: /redirect|download|fetch|browser_page|browser_readability|browser_link/.test(tool), expected_evidence: expectedEvidenceForTool(tool) })),
    search_queries: buildCoreSearchQueries(args.task || "", "browsing safety", assessment.freshness_requirement.required, assessment.source_types_needed, args.known_context || "").queries,
    source_types_needed: assessment.source_types_needed,
    approval_required_steps: ["Direct external fetch/page inspection/redirect/download HEAD requires explicit approval.", "Do not access private/account pages unless the user confirms authorization and provides safe content/access path."],
    captcha_handling_plan: captchaHandlingPlan(),
    download_safety_plan: downloadSafetyPlan(),
    evidence_to_collect: ["redirect chain/blocked reason", "URL reputation flags", "CAPTCHA/access-block signals", "download safety risk flags", "page/source inspection evidence", "source quality and claim/source matrix"],
    must_not_claim: ["Core executed Tools.", "A page was visually verified when only static HTML/source was inspected.", "A web search happened before provider evidence exists.", "CAPTCHA was bypassed automatically.", "A file was downloaded or installer was run.", "A suspicious URL/download is safe without review."],
    done_definition: ["Redirect/download/CAPTCHA risks are explicitly classified.", "Suspicious pages are not treated as normal trustworthy sources.", "If blocked by CAPTCHA/access control, safe user-assisted handoff or alternate sources are listed."],
    fallbacks_if_search_or_browser_unavailable: ["Ask the user to paste page text after access.", "Use official docs/API/repository mirrors.", "Stop and report access blocked; do not bypass CAPTCHA."],
    core_executes_tools: false,
    web_search_executed: false
  };
}

function buildCoreSearchQueries(task, domainHint, freshnessRequired, sourceTypes, context) {
  const hay = `${task} ${domainHint} ${context}`.toLowerCase();
  const base = String(task || "research task").replace(/https?:\/\/\S+/g, "").trim();
  const queries = [];
  const intents = [];
  const add = (q, intent) => { if (q && !queries.includes(q)) { queries.push(q); intents.push({ query: q, intent }); } };
  add(`${base} official docs`, "official source");
  if (freshnessRequired) add(`${base} latest current ${new Date().getUTCFullYear()}`, "fresh/current source");
  if (/security|malware|phishing|download|cve|advisory/.test(hay)) add(`${base} security advisory CVE phishing malware`, "security/reputation source");
  if (/github|repo|code|mcp|library|api/.test(hay)) add(`${base} site:github.com releases issues`, "repository/release source");
  if (/game|meta|mod/.test(hay)) add(`${base} official patch notes current meta community`, "game/modding current source");
  add(`${base} limitations risks`, "counter-source / limitations");
  return { queries: queries.slice(0, 8), query_intents: intents.slice(0, 8), source_types_needed: sourceTypes };
}

function researchPlanningToolsForText(hay) {
  const tools = ["vnem_tools_search_provider_manifest", "vnem_tools_search_query_builder", "vnem_tools_web_search", "vnem_tools_search_result_ranker", "vnem_tools_source_quality_check", "vnem_tools_claim_source_matrix", "vnem_tools_research_gap_detector"];
  if (/download|installer|redirect|captcha|phishing|malware|scam|credential|security/.test(hay)) tools.push("vnem_tools_redirect_chain_check", "vnem_tools_url_reputation_check", "vnem_tools_captcha_detector", "vnem_tools_download_safety_check");
  if (/page|url|website|source|docs/.test(hay)) tools.push("vnem_tools_fetch_url_text", "vnem_tools_browser_page_inspect", "vnem_tools_browser_research_pack");
  return [...new Set(tools)];
}
function captchaHandlingPlan() { return ["Detect CAPTCHA/access-block pages with vnem_tools_captcha_detector.", "No automatic CAPTCHA bypass was attempted or provided.", "Ask user to solve CAPTCHA manually only if authorized, then paste page text/source or provide allowed access evidence.", "Use official API/docs/source or alternate official mirror when available.", "Stop and report blocked access when no allowed path exists."]; }
function downloadSafetyPlan() { return ["Do not download or run installers automatically.", "Use vnem_tools_download_safety_check before following download links.", "Use approved HEAD metadata only when needed.", "Require manual review, official source, checksum/signature, and user confirmation for risky downloads."]; }
function formatResearchNeedAssessment(a) { return `vnem_assess_research_need: ${a.research_need_level} current=${a.current_info_required} external_search=${a.external_search_required}`; }
function formatSearchPlan(plan) { return `vnem_build_search_plan: tools=${plan.selected_tools.join(", ")} queries=${plan.search_queries.length} core_executes_tools=false`; }
function formatBrowsingPlan(plan) { return `vnem_build_browsing_plan: tools=${plan.selected_tools.join(", ")} core_executes_tools=false`; }

function formatBrowserResearchPlan(plan) {
  return [`vnem_build_browser_research_plan: ${plan.task_type}`, `Tools: ${plan.selected_tools.join(", ")}`, `External current search required: ${plan.when_external_web_search_is_required.length ? "yes" : "no"}`, "Core executes tools: false"].join("\n");
}

function formatToolsChain(chain) {
  return [`vnem_explain_tools_chain: ${chain.task_type}`, `Steps: ${chain.chain.map((step) => step.tool).join(" -> ")}`, "Core executes tools: false"].join("\n");
}

function compactCoreToolsPlan(plan) {
  return {
    task_type: plan.task_type,
    selected_tools: plan.selected_tools.slice(0, 12),
    tool_sequence: plan.tool_sequence.slice(0, 8).map((step) => ({ tool: step.tool, purpose: step.purpose, dry_run_first: step.dry_run_first, requires_approval: step.requires_approval })),
    dry_run_steps: plan.dry_run_steps.slice(0, 6),
    approval_required_steps: plan.approval_required_steps.slice(0, 6),
    evidence_to_collect: plan.evidence_to_collect.slice(0, 8),
    verification_plan: plan.verification_plan.slice(0, 5),
    must_not_claim: plan.must_not_claim.slice(0, 6),
    done_definition: plan.done_definition.slice(0, 5),
    efficiency_guidance: plan.efficiency_guidance.slice(0, 5),
    core_tools_handoff: plan.core_tools_handoff,
    core_executes_tools: false
  };
}

function formatCoreToolSelection(selection) {
  return [`vnem_select_tools_for_task: ${selection.task_type}`, `Tools: ${selection.selected_tools.join(", ")}`, `Core executes tools: ${selection.core_executes_tools}`].join("\n");
}

function formatCoreToolsPlan(plan) {
  return [`vnem_build_tools_plan: ${plan.task_type}`, `Steps: ${plan.tool_sequence.map((step) => step.tool).join(" -> ")}`, "Core executes tools: false"].join("\n");
}

const CORE_ADOPTION_ENTRYPOINTS = ["vnem_entrypoint", "vnem_usage_contract", "vnem_mcp_visibility_doctor", "vnem_underuse_detector", "vnem_install_adoption_guide"];
const TOOLS_ADOPTION_ENTRYPOINTS = ["vnem_tools_entrypoint", "vnem_tools_capability_router", "vnem_tools_adoption_readiness", "vnem_tools_visibility_doctor", "vnem_tools_underuse_detector"];

function buildCoreVisibilityDoctor(args = {}) {
  const availableMcpNames = arrayStrings(args.available_mcp_names).map((name) => name.toLowerCase());
  const availableToolNames = new Set(arrayStrings(args.available_tool_names));
  const userGoal = String(args.user_goal || "").trim();
  const classification = classifyIntelligentCoreTask(userGoal || "Inspect VNEM MCP visibility.", "", "auto");
  const toolsNeeded = classification.execution_needed || classification.proof_needed;
  const coreVisibleFromClient = availableMcpNames.some((name) => /\bvnem\b|vnem[-_ ]?core/.test(name)) || availableToolNames.has("vnem_entrypoint");
  const toolsVisible = availableMcpNames.some((name) => /vnem[-_ ]?tools|tools/.test(name)) || [...availableToolNames].some((name) => name.startsWith("vnem_tools_"));
  const coreEntryStatus = Object.fromEntries(CORE_ADOPTION_ENTRYPOINTS.map((tool) => [tool, {
    registered_by_core: DEFAULT_MCP_TOOLS.includes(tool),
    visible_from_client_list: availableToolNames.size ? availableToolNames.has(tool) : "unknown"
  }]));
  const toolsEntryStatus = Object.fromEntries(TOOLS_ADOPTION_ENTRYPOINTS.map((tool) => [tool, {
    visible_from_client_list: availableToolNames.size ? availableToolNames.has(tool) : "unknown"
  }]));
  const recommendedTools = toolsNeeded ? recommendIntelligentTools(classification) : [];
  const missingSurfaces = [];
  if (!coreVisibleFromClient && availableMcpNames.length) missingSurfaces.push("VNEM Core MCP name not listed by client");
  if (toolsNeeded && !toolsVisible) missingSurfaces.push("VNEM Tools MCP not visible for execution/proof task");
  if (availableToolNames.size) {
    for (const tool of CORE_ADOPTION_ENTRYPOINTS) if (!availableToolNames.has(tool)) missingSurfaces.push(`missing Core entrypoint ${tool}`);
    for (const tool of TOOLS_ADOPTION_ENTRYPOINTS.slice(0, 3)) if (toolsVisible && !availableToolNames.has(tool)) missingSurfaces.push(`missing Tools entrypoint ${tool}`);
  }
  const degradedMode = toolsNeeded && !toolsVisible
    ? "core_only_tools_needed"
    : toolsVisible
      ? "core_and_tools_visible"
      : "core_only_or_tools_unknown";
  const adoptionReadiness = toolsVisible && missingSurfaces.length === 0
    ? "full"
    : toolsNeeded && !toolsVisible
      ? "degraded"
      : "partial";
  return {
    client_name: args.client_name || "unknown",
    core_visible: true,
    tools_visible: toolsVisible,
    core_entrypoints_present: coreEntryStatus,
    tools_entrypoints_present: toolsEntryStatus,
    adoption_readiness: adoptionReadiness,
    recommended_first_call: userGoal ? "vnem_entrypoint" : "vnem_mcp_visibility_doctor",
    recommended_tools_handoff: {
      needed: toolsNeeded,
      tools_visible: toolsVisible,
      exact_tools_calls: toolsVisible ? recommendedTools.slice(0, 12) : [],
      unavailable_tools_calls: toolsVisible ? [] : recommendedTools.slice(0, 12),
      fallback: toolsVisible
        ? "Call vnem_tools_entrypoint or vnem_tools_capability_router with user_goal."
        : "Use Core plan-only guidance and ask/connect VNEM Tools MCP before claiming execution proof."
    },
    missing_surfaces: missingSurfaces,
    degraded_mode: degradedMode,
    next_step: toolsNeeded && toolsVisible
      ? `Call ${recommendedTools[0] || "vnem_tools_entrypoint"} next.`
      : toolsNeeded
        ? "Call vnem_entrypoint, then connect/use VNEM Tools MCP for execution proof."
        : "Call vnem_entrypoint only if the task becomes repo/code/tooling work.",
    confidence: availableMcpNames.length || availableToolNames.size ? "high" : "medium",
    reality_boundary: "This doctor can diagnose MCP visibility only from the connected client's reported MCP/tool names."
  };
}

function buildCoreUnderuseDetector(args = {}) {
  const userGoal = String(args.user_goal || "").trim();
  const recentActions = arrayStrings(args.recent_actions);
  const availableMcpNames = arrayStrings(args.available_mcp_names).map((name) => name.toLowerCase());
  const taskMode = args.task_type && args.task_type !== "auto" ? args.task_type : "auto";
  const classification = classifyIntelligentCoreTask(userGoal, "", taskMode);
  const actionText = normalize([recentActions.join(" "), availableMcpNames.join(" ")].join(" "));
  const vnemAvailable = availableMcpNames.length === 0 || availableMcpNames.some((name) => /vnem/.test(name));
  const toolsAvailable = availableMcpNames.some((name) => /vnem[-_ ]?tools|tools/.test(name));
  const simple = classification.primary === "simple_answer";
  const usedCore = /\bvnem_(entrypoint|recommend|usage_contract|mcp_visibility_doctor|underuse_detector|select_tools_for_task|build_tools_plan)\b/.test(actionText);
  const usedTools = /\bvnem_tools_/.test(actionText);
  const missing = [];
  if (!simple && vnemAvailable && !usedCore) missing.push("vnem_entrypoint");
  const recommendedTools = recommendIntelligentTools(classification);
  const priorityTools = uniqueStrings([
    classification.matched_flags?.debugging ? "vnem_tools_failure_triage" : null,
    classification.matched_flags?.github_or_publish ? "vnem_tools_github_status" : null,
    classification.matched_flags?.github_or_publish ? "vnem_tools_github_actions_status" : null,
    classification.matched_flags?.github_or_publish ? "vnem_tools_pr_quality_gate" : null,
    classification.matched_flags?.repo_or_code ? "vnem_tools_repo_deep_map" : null,
    classification.matched_flags?.repo_or_code ? "vnem_tools_patch_target_finder" : null,
    ...recommendedTools
  ]);
  if (!simple && classification.execution_needed && toolsAvailable && !usedTools) missing.push(...priorityTools.slice(0, 7));
  const shouldHaveUsed = !simple && vnemAvailable && missing.length > 0;
  const exactNext = missing[0] || (simple ? null : "vnem_entrypoint");
  return {
    task_classification: classification.primary,
    should_have_used_vnem: shouldHaveUsed,
    missing_vnem_calls: uniqueStrings(missing),
    recommended_recovery_call: exactNext,
    reason: shouldHaveUsed
      ? "VNEM is available and this repo/code/debug/GitHub/tooling/proof task benefits from Core routing and Tools proof."
      : simple
        ? "Simple/casual task does not need VNEM routing."
        : "Recent actions already show VNEM usage or availability is unclear.",
    severity: shouldHaveUsed
      ? classification.github_or_publish || classification.matched_flags.debugging ? "high" : "medium"
      : "none",
    exact_next_vnem_call: exactNext ? {
      tool: exactNext,
      arguments: exactNext.startsWith("vnem_tools_") ? { user_goal: userGoal, root: "." } : { user_goal: userGoal, available_mcp_names: availableMcpNames }
    } : null,
    not_needed_reason: simple ? "No repo/code/tooling/proof signals were detected." : "",
    confidence: shouldHaveUsed || simple ? "high" : "medium",
    diagnostic_only: true
  };
}

function formatCoreUsageContract(contract) {
  return [
    "vnem_usage_contract",
    `core_role=${contract.core_role}`,
    `tools_role=${contract.tools_role}`,
    `core_executes_tools=${contract.core_executes_tools}`,
    `next=${contract.compact_next_step}`
  ].join("\n");
}

function formatCoreVisibilityDoctor(doctor) {
  return [
    `vnem_mcp_visibility_doctor: readiness=${doctor.adoption_readiness}`,
    `core_visible=${doctor.core_visible}; tools_visible=${doctor.tools_visible}`,
    `degraded_mode=${doctor.degraded_mode}`,
    `first_call=${doctor.recommended_first_call}`,
    `next=${doctor.next_step}`
  ].join("\n");
}

function formatCoreUnderuseDetector(detector) {
  return [
    `vnem_underuse_detector: should_have_used=${detector.should_have_used_vnem}`,
    `severity=${detector.severity}; task=${detector.task_classification}`,
    `missing=${detector.missing_vnem_calls.slice(0, 6).join(", ") || "none"}`,
    `next=${detector.recommended_recovery_call || "none"}`
  ].join("\n");
}

function buildBootstrap(args = {}) {
  const task = String(args.task || "").trim();
  const status = buildStatus();
  const intent = resolveIntent(task);
  const mode = inferTaskMode(task);
  const route = intent?.route || searchIndex.intent_routes?.[normalize(task)] || null;
  const rubrics = selectTaskRubrics(task, intent, mode);
  const readFirst = relevantPracticeDocs(task, intent, 8);
  const matches = searchDocuments(task, { limit: 10, includeWatchlist: false });
  const registryEntries = matches.filter((match) => match.kind === "registry-entry").slice(0, 5);
  const taskContract = buildTaskContract(task, intent, route, readFirst, registryEntries);
  const taskAnalysis = analyzeBootstrapTask(task, args.project_context || "", intent, mode, rubrics);
  const requiredRules = args.include_resources === false
    ? []
    : buildBootstrapRules(taskAnalysis, taskContract, rubrics, route, readFirst);
  const recommendedCalls = args.include_next_calls === false
    ? []
    : buildBootstrapNextCalls(taskAnalysis, Boolean(route), registryEntries.length);
  const protectionNeeds = buildBootstrapProtectionNeeds(taskAnalysis, args.risk_tolerance || "normal");
  const verificationContract = buildBootstrapVerificationContract(taskAnalysis, taskContract, args.available_tools || []);
  const completionAuditExpectations = buildBootstrapCompletionAuditExpectations(taskAnalysis);
  const antiPlaceboChecks = buildBootstrapAntiPlacebo(taskAnalysis);
  const agentProfile = getAgentProfile(agentProfiles, {
    agent_client: args.agent_client || "unknown",
    task,
    token_budget: "compact"
  });
  const requiredCapabilities = getRequiredCapabilities(superLibrary, agentProfiles, {
    task,
    agent_client: args.agent_client || "unknown",
    project_context: args.project_context || "",
    max_modules: 5,
    token_budget: "compact"
  });
  const missingContext = detectMissingContext({ task, project_context: args.project_context || "", token_budget: "compact" });
  const domainQualityContracts = buildDomainQualityContracts({ task, project_context: args.project_context || "", token_budget: "compact" });
  const activationId = createHash("sha256")
    .update(JSON.stringify({
      tool: "vnem_bootstrap",
      task: normalize(task),
      agent_client: normalize(args.agent_client || "unknown"),
      version: status.version,
      generated_at: status.generated_at || null
    }))
    .digest("hex")
    .slice(0, 16);

  return {
    activation: {
      status: "active",
      tool: "vnem_bootstrap",
      activation_id: `vnem-${activationId}`,
      data_version: status.generated_at || status.release_date || "unknown",
      vnem_version: status.version || null,
      agent_client: args.agent_client || "unknown",
      desired_output: args.desired_output || null,
      read_only: true,
      precision_tools_exposed: false,
      precision_server_boundary:
        "Default vnem MCP remains read-only. Mutation, terminal execution, documentation fetching, semantic code search, verification loops, and ephemeral scripts remain in the separate opt-in vnem-precision server."
    },
    repo_or_core_status: {
      root_dir: status.root_dir,
      registry_entry_count: status.counts.registry_entries,
      search_document_count: status.counts.search_documents,
      source_radar_count: status.counts.source_radar_entries,
      available_mcp_tool_count: status.mcp.tools.length,
      available_mcp_tools: status.mcp.tools,
      rule_resource_availability: {
        operating_protocol: status.counts.install_guide && Boolean(searchIndex.operating_protocol),
        quality_contract: status.counts.quality_contract,
        orchestration_protocol: status.counts.orchestration_protocol,
        coding_protocol: Boolean(searchIndex.coding_protocol),
        coding_playbooks: status.counts.coding_playbooks > 0,
        task_rubrics: status.counts.task_rubrics > 0,
        source_radar: status.counts.source_radar_entries > 0,
        prompt_patterns: status.counts.prompt_patterns > 0
      },
      warnings: bootstrapStatusWarnings(status)
    },
    task_analysis: taskAnalysis,
    compact_startup_contract: {
      token_budget: "compact",
      self_focus_policy: requiredCapabilities.self_focus_policy,
      required_capability_module_count: requiredCapabilities.required_modules.length,
      required_capability_ids: requiredCapabilities.required_modules.map((module) => module.id),
      compact_required_instructions: requiredCapabilities.required_modules.flatMap((module) => module.compact_instructions || []).slice(0, 6),
      evidence_required: verificationContract.evidence_required?.slice(0, 5) || []
    },
    relevant_agent_profile: {
      profile_id: agentProfile.profile_id,
      display_name: agentProfile.display_name,
      known_mcp_support_status: agentProfile.known_mcp_support_status,
      confidence: agentProfile.confidence
    },
    required_rules: requiredRules,
    recommended_vnem_calls: recommendedCalls,
    missing_context: missingContext,
    domain_quality_contracts: domainQualityContracts,
    capability_slots: buildBootstrapCapabilitySlots(),
    protection_needs: protectionNeeds,
    verification_contract: verificationContract,
    completion_audit_expectations: completionAuditExpectations,
    anti_placebo_checks: antiPlaceboChecks,
    matched_context: {
      resolved_intent: intent,
      mode,
      rubrics: rubrics.map((rubric) => ({ id: rubric.id, title: rubric.title })),
      route_available: Boolean(route),
      top_registry_matches: registryEntries.map((entry) => ({
        id: entry.id,
        name: entry.name,
        type: entry.type,
        trust_tier: entry.trust_tier,
        risk_flags: entry.risk_flags || []
      }))
    },
    safety:
      "vnem_bootstrap is read-only activation guidance. It does not edit files, run commands, install packages, call upstream services, collect secrets, or expose precision tools."
  };
}

function analyzeBootstrapTask(task, projectContext, intent, mode, rubrics) {
  const text = normalize([task, projectContext].filter(Boolean).join(" "));
  const secondary = new Set();
  const reasons = [];
  let primary = "general_project_improvement";
  let confidence = "medium";
  let riskLevel = "normal";

  const has = (pattern) => pattern.test(text);

  if (has(/\b(weather|api integration|integrate api|external api|rest api|graphql|cors|oauth|api key|apikey|token)\b/)) {
    primary = "api_integration";
    secondary.add("external_service_integration");
    secondary.add("security_data");
    riskLevel = "elevated";
    confidence = "high";
    reasons.push("The task names an API/integration surface, so VNEM routes to API safety, backend/frontend boundary, auth, CORS, and secret-handling checks.");
  } else if (has(/\b(elden ring|modding|mod workflow|game mod|mods?|load order|save file|regulation.bin|dlc|fromsoftware)\b/)) {
    primary = "game_modding_workflow";
    secondary.add("game_workflow");
    secondary.add("compatibility_testing");
    riskLevel = "elevated";
    confidence = "high";
    reasons.push("The task is a game/modding workflow, so VNEM routes to backup, isolation, compatibility, local test evidence, and no-claim-without-runtime-proof checks.");
  } else if (has(/\b(debug|broken|bug|failing|failure|error|stack trace|regression|crash|root cause)\b/)) {
    primary = "debugging";
    secondary.add("root_cause_analysis");
    secondary.add("test_evidence");
    confidence = "high";
    reasons.push("The task asks to debug/fix a broken project, so VNEM routes to reproduce-first, inspect logs/tests before edits, and root-cause proof.");
  } else if (has(/\b(prompt|system prompt|developer prompt|instructions|coding ai|agent prompt|prompt engineering)\b/)) {
    primary = "prompt_improvement";
    secondary.add("agent_instruction_design");
    secondary.add("evaluation_needed");
    confidence = "high";
    reasons.push("The task asks to improve a prompt/instructions, so VNEM routes to prompt-pattern guidance and before/after behavior evidence instead of assuming code edits.");
  } else if (has(/\b(next.js|nextjs|website|landing page|frontend|ui|ux|interface|responsive|accessibility|visual|design)\b/)) {
    primary = "website_ui";
    secondary.add("frontend_ui");
    secondary.add("visual_qa");
    secondary.add("accessibility_responsiveness");
    confidence = "high";
    reasons.push("The task targets a website/UI surface, so VNEM routes to design architecture, visual QA, responsiveness, accessibility, and screenshot/browser evidence.");
  } else if (has(/\b(private|internal|habit tracker|dashboard|app|tool|saas|web app|build|create|ship)\b/)) {
    primary = has(/\b(private|internal|habit tracker)\b/) ? "private_app_internal_tool" : "app_build";
    secondary.add("app_build");
    secondary.add("private_internal_tool");
    secondary.add("security_data");
    confidence = has(/\b(app|habit tracker|private|internal)\b/) ? "high" : "medium";
    riskLevel = has(/\b(private|auth|user data|database|login|account)\b/) ? "elevated" : "normal";
    reasons.push("The task is an app/internal-tool build, so VNEM routes to repo sensing, app architecture, data/privacy boundaries, tests, and user-visible completion evidence.");
  }

  if (has(/\b(next.js|nextjs|react|vite|frontend|ui|website|responsive|accessibility)\b/)) secondary.add("frontend_ui");
  if (has(/\b(auth|login|secret|api key|token|private|user data|database|payment|wallet)\b/)) secondary.add("security_data");
  if (has(/\b(test|tests|verify|verification|evidence|prove)\b/)) secondary.add("verification_heavy");
  if (has(/\b(research|compare|choose|tool|mcp|library|framework)\b/)) secondary.add("tool_or_research_decision");

  if (primary === "general_project_improvement" && intent?.name) {
    reasons.push(`VNEM matched existing intent '${intent.name}' from the search index.`);
  }
  if (!reasons.length) {
    reasons.push("VNEM did not find a highly specific domain trigger, so it routes to the general project-improvement contract and requires evidence before success claims.");
  }

  return {
    original_task: task,
    inferred_mode: mode,
    primary_task_type: primary,
    secondary_task_types: [...secondary],
    confidence,
    risk_level: riskLevel,
    resolved_intent: intent?.name || null,
    rubric_ids: rubrics.map((rubric) => rubric.id),
    why: reasons
  };
}

function buildBootstrapRules(taskAnalysis, taskContract, rubrics, route, readFirst) {
  const rules = new Map();
  const addRule = (id, resourceUri, summary, priority, why) => {
    rules.set(id, { id, resource_uri: resourceUri, summary, priority, why });
  };

  addRule("operating-protocol:vnem-operating-protocol", "vnem://install/operating-protocol", "Universal VNEM loop: sense, route, choose, constrain, quality gate, verify, report.", "mandatory", "Every bootstrap needs the core operating contract before an agent chooses tools or edits code.");
  addRule("quality-contract:vnem-quality-contract", "vnem://install/quality-contract", "Holistic quality contract and Triple-Check Workflow.", "mandatory", "The agent must not satisfy one requirement by silently damaging another.");
  addRule("task-rubrics:vnem-task-rubrics", "vnem://install/task-rubrics", "Broad task rubrics for quality bars, approvals, verification, and output contracts.", "mandatory", "Bootstrap uses task rubrics to make the route task-specific.");

  if (["app_build", "private_app_internal_tool", "website_ui", "api_integration", "debugging"].includes(taskAnalysis.primary_task_type) || taskAnalysis.secondary_task_types.includes("app_build")) {
    addRule("coding-protocol:vnem-coding-protocol", "vnem://install/coding-protocol", "Coding execution protocol: repo sensing, smallest coherent diff, verification ladder, final report.", "mandatory", "Code/app work needs implementation discipline and evidence.");
    addRule("coding-playbooks:vnem-coding-playbooks", "vnem://install/coding-playbooks", "Mode-specific playbooks for features, debugging, refactors, rendered apps, API/data work, reviews, and failure recovery.", "recommended", "The agent should choose a task-specific playbook after routing.");
  }

  if (taskAnalysis.primary_task_type === "website_ui" || taskAnalysis.secondary_task_types.includes("visual_qa")) {
    addRule("design-architecture:vnem-design-architecture", "vnem://install/design-architecture", "Design intelligence for UI, dashboard, visual polish, motion, sound, and branded surfaces.", "mandatory", "UI work needs actual rendered quality, not just passing builds.");
    addRule("visual-qa-protocol:vnem-visual-qa-protocol", "vnem://install/visual-qa-protocol", "Rendered visual QA loop for desktop/mobile screenshots and interaction moments.", "mandatory", "Website/UI tasks require visual evidence and accessibility/responsiveness checks.");
  }

  if (taskAnalysis.primary_task_type === "prompt_improvement") {
    addRule("prompt-engineering:vnem-prompt-engineering", "vnem://install/prompt-engineering", "Prompt enhancement protocol and agent-instruction guidance.", "mandatory", "Prompt work should improve expected behavior and include evaluation criteria.");
    addRule("prompt-patterns:vnem-prompt-patterns", "vnem://install/prompt-patterns", "Machine-readable prompt patterns for common agent tasks.", "recommended", "Reusable patterns help avoid vague instruction rewrites.");
  }

  if (taskAnalysis.primary_task_type === "api_integration" || taskAnalysis.secondary_task_types.includes("tool_or_research_decision")) {
    addRule("source-radar:vnem-source-radar", "vnem://install/source-radar", "Source intake map for official docs, registries, benchmark evidence, and verification sources.", "mandatory", "API/tool decisions need primary sources before implementation claims.");
  }

  if (taskAnalysis.primary_task_type === "game_modding_workflow") {
    addRule("source-radar:vnem-source-radar", "vnem://install/source-radar", "Source intake map for primary sources and verification evidence.", "mandatory", "Modding workflow changes need primary source/version evidence and local user test proof.");
    addRule("operating-protocol:approval-gates", "vnem://install/operating-protocol", "Approval gates for risky operations, external tools, secrets, and irreversible writes.", "mandatory", "Modding can damage saves/files; backups and explicit approval are required before mutation.");
  }

  for (const id of uniqueStrings([...(route?.read_first || []), ...(taskContract.read_first || []), ...readFirst.map((doc) => doc.id)]).slice(0, 8)) {
    if (!rules.has(id)) {
      rules.set(id, {
        id,
        resource_uri: resourceUriForRuleId(id),
        summary: "Matched VNEM search-index/read-first item for this task.",
        priority: "recommended",
        why: "This item matched the task route, rubric, playbook, or best-practice search."
      });
    }
  }

  return [...rules.values()];
}

function buildBootstrapNextCalls(taskAnalysis, routeAvailable, registryMatchCount) {
  const calls = [
    {
      tool: "vnem_library_status",
      arguments: {},
      when: "Use once after bootstrap when the task may need external skills, APIs, MCP/tool choices, or capability-library status."
    },
    {
      tool: "vnem_compose_capability_contract",
      arguments: { task: taskAnalysis.original_task, token_budget: "compact", max_modules: 5 },
      when: "Use after bootstrap to convert routing and capability matches into a compact task-specific contract with evidence requirements."
    },
    {
      tool: "vnem_get_required_capabilities",
      arguments: { task: taskAnalysis.original_task, max_modules: 5, token_budget: "compact" },
      when: "Use when the agent needs only the selected capability modules and compact instructions, not full search results."
    },
    {
      tool: "vnem_route_intent",
      arguments: { intent: taskAnalysis.original_task, include_matches: true },
      when: "Immediately after bootstrap when the agent needs the exact route/read-first context and rubric details."
    },
    {
      tool: "vnem_quality_gate",
      arguments: { task: taskAnalysis.original_task },
      when: "Before implementation and before final response to catch silent trade-offs and evidence gaps."
    },
    {
      tool: "vnem_protection_review",
      arguments: { task: taskAnalysis.original_task, plan_or_action: "<proposed risky action or plan>", target_type: "general", token_budget: "compact" },
      when: "Before risky actions such as filesystem, terminal, browser, GitHub, package install, skill use, MCP server, API integration, or game/modding changes."
    },
    {
      tool: "vnem_completion_audit",
      arguments: { task: taskAnalysis.original_task, claimed_result: "<final answer or work summary>", token_budget: "compact" },
      when: "Before final response to audit claims, evidence, missing context, research quality, UI/API/modding proof, and anti-placebo completion."
    },
    {
      tool: "vnem_proof_trail",
      arguments: { task: taskAnalysis.original_task, bootstrap_activation_id: "<activation_id>", capability_ids_used: ["<capability_id>"], token_budget: "compact" },
      when: "Near the end of the workflow, after protection review and completion audit, to produce a compact proof that VNEM was actually used."
    }
  ];

  if (taskAnalysis.primary_task_type !== "prompt_improvement" || registryMatchCount > 0 || routeAvailable) {
    calls.push({
      tool: "vnem_recommend",
      arguments: { task: taskAnalysis.original_task, limit: 6 },
      when: "Use when choosing tools, patterns, MCPs, libraries, workflows, or a compact task contract."
    });
  }

  if (["app_build", "private_app_internal_tool", "website_ui", "game_modding_workflow"].includes(taskAnalysis.primary_task_type)) {
    calls.push({
      tool: "vnem_orchestrate",
      arguments: { task: taskAnalysis.original_task, max_workers: 5 },
      when: "Use for complex app/UI/modding workflow work where single-agent context is likely too broad."
    });
  }

  if (["api_integration", "game_modding_workflow", "prompt_improvement"].includes(taskAnalysis.primary_task_type) || taskAnalysis.secondary_task_types.includes("tool_or_research_decision")) {
    calls.push({
      tool: "vnem_sources",
      arguments: { intent: taskAnalysis.original_task, limit: 6 },
      when: "Use before broad web search or external integration to identify official/high-signal sources and risk checks."
    });
  }

  if (["app_build", "private_app_internal_tool", "website_ui", "prompt_improvement"].includes(taskAnalysis.primary_task_type) && taskAnalysis.primary_task_type !== "game_modding_workflow") {
    calls.push({
      tool: "vnem_recommend_skills",
      arguments: { task: taskAnalysis.original_task, limit: 6 },
      when: "Use when the task may benefit from reusable AI-agent skills/capability packs; review before install/use."
    });
    calls.push({
      tool: "vnem_search_skills",
      arguments: { query: taskAnalysis.original_task, limit: 8 },
      when: "Use to inspect skill candidates, compatibility, risk flags, and provenance before any skill activation."
    });
  }

  if (taskAnalysis.primary_task_type === "api_integration" || taskAnalysis.secondary_task_types.includes("security_data")) {
    calls.push({
      tool: "vnem_build_api_integration_plan",
      arguments: { task: taskAnalysis.original_task, app_type: "unknown", allow_api_keys: false, allow_oauth: false, token_budget: "compact" },
      when: "Use to create the safe API integration contract: auth, HTTPS, CORS, frontend/backend boundary, tests, and evidence."
    });
    calls.push({
      tool: "vnem_recommend_apis",
      arguments: { task: taskAnalysis.original_task, app_type: "unknown", allow_api_keys: false, allow_oauth: false, limit: 6 },
      when: "Use for API/integration tasks to compare auth, HTTPS, CORS, frontend/backend safety, and secret risk."
    });
    calls.push({
      tool: "vnem_search_apis",
      arguments: { query: taskAnalysis.original_task, require_https: true, include_secret_risk: false, limit: 8 },
      when: "Use to inspect API candidates and avoid frontend-secret or CORS/HTTPS mistakes."
    });
    calls.push({
      tool: "vnem_review_skill_or_api",
      arguments: { id: "<candidate-id>", kind: "api", task: taskAnalysis.original_task },
      when: "Use before implementing any selected API or exposing it to frontend code."
    });
  }

  calls.push({
    tool: "vnem_best_practices",
    arguments: { intent: taskAnalysis.original_task, limit: 6 },
    when: "Use to fetch compact implementation, prompt, or workflow guidance after the route is known."
  });

  if (registryMatchCount > 0) {
    calls.push({
      tool: "vnem_search",
      arguments: { query: taskAnalysis.original_task, limit: 8 },
      when: "Use when the agent needs more registry/source matches before selecting a capability."
    });
  }

  return calls;
}

function buildBootstrapCapabilitySlots() {
  const status = buildLibraryStatus(superLibrary);
  return {
    mcp_registry_available: entries.some((entry) => entry.type === "mcp-server"),
    skill_recommendations_available: superLibrary.skills.length > 0,
    skill_entry_count: superLibrary.skills.length,
    api_registry_available: superLibrary.apis.length > 0,
    api_entry_count: superLibrary.apis.length,
    source_names: status.source_names,
    schema_version: status.schema_version,
    generated_at: status.generated_at,
    metadata_enrichment_boundary:
      "Super MCP library records are VNEM-normalized metadata/enrichment only; default MCP does not install skills, execute scripts, call APIs, request keys, or guarantee safety.",
    skill_recommendations_status:
      "Available as a read-only skills.sh/agent-skill capability-library foundation with provenance, compatibility, risk flags, and manual-review requirements.",
    api_registry_status:
      "Available as a read-only public-apis-style integration catalog enriched with auth, HTTPS, CORS, frontend/backend safety, secret-risk, and manual-review fields.",
    future_skill_fields_reserved: [
      "skill_name",
      "description",
      "source",
      "source_url",
      "supported_agents",
      "task_types",
      "install_use_instructions",
      "activation_instructions",
      "files_added",
      "trust_level",
      "audit_status",
      "risk_flags",
      "when_to_use",
      "when_not_to_use",
      "example_queries",
      "related_skills"
    ],
    future_api_fields_reserved: [
      "api_name",
      "description",
      "category",
      "docs_url",
      "auth_type",
      "https_support",
      "cors_support",
      "frontend_safe",
      "backend_proxy_required",
      "secret_api_key_risk",
      "rate_limit_notes",
      "integration_notes",
      "example_use_cases",
      "trust_level",
      "risk_flags",
      "freshness_last_checked"
    ]
  };
}

function buildBootstrapProtectionNeeds(taskAnalysis, riskTolerance) {
  const isApi = taskAnalysis.primary_task_type === "api_integration";
  const isApp = ["app_build", "private_app_internal_tool", "website_ui", "api_integration"].includes(taskAnalysis.primary_task_type) || taskAnalysis.secondary_task_types.includes("security_data");
  const isModding = taskAnalysis.primary_task_type === "game_modding_workflow";
  const isPrompt = taskAnalysis.primary_task_type === "prompt_improvement";
  const isDebug = taskAnalysis.primary_task_type === "debugging";
  const needsPackages = ["app_build", "private_app_internal_tool", "website_ui", "api_integration"].includes(taskAnalysis.primary_task_type);
  const needsExternalSources = isApi || isModding || taskAnalysis.secondary_task_types.includes("tool_or_research_decision");
  const humanApprovalRequirements = [
    "Ask before installing packages, changing dependency managers, editing agent/MCP/CI/deployment/database/auth/secret config, using credentials, or touching production/external systems."
  ];

  if (isPrompt) {
    humanApprovalRequirements.push("Do not edit code or repo files for prompt-improvement work unless the user explicitly asks for repo changes.");
  }
  if (isModding) {
    humanApprovalRequirements.push("Ask before modifying game/mod files, saves, load order, global mod manager config, or active user mod folders.");
  }

  return {
    risk_tolerance: riskTolerance,
    risk_level: taskAnalysis.risk_level,
    secret_api_key_risk: isApi || taskAnalysis.secondary_task_types.includes("security_data"),
    package_install_risk: needsPackages,
    external_source_risk: needsExternalSources,
    modding_compatibility_required: isModding,
    debugging_safety_required: isDebug,
    api_safety_warnings: isApi
      ? [
          "Do not expose API keys in frontend code.",
          "Check auth type, HTTPS, CORS behavior, rate limits, terms, and freshness before integration.",
          "Use a backend proxy/server route for secret-bearing APIs unless official docs prove frontend usage is safe.",
          "Handle errors, unavailable upstreams, quotas, and mocked/offline states honestly."
        ]
      : [],
    frontend_backend_safety_warnings: isApp
      ? [
          "Do not expose API keys in frontend code or committed config.",
          "Separate frontend UI from backend secret handling, auth, database, and external-service calls.",
          "For private/internal tools, review data storage, logs, auth, export/delete behavior, and local/production boundaries."
        ]
      : [],
    package_install_warnings: needsPackages
      ? [
          "Prefer existing dependencies and project patterns first.",
          "New packages require explicit user approval plus license, maintenance, install-script, and permission review."
        ]
      : [],
    external_source_warnings: needsExternalSources
      ? [
          "Prefer primary/official sources before blogs, forums, or generated summaries.",
          "Treat source signals as leads, not approval to install, execute, copy, or recommend as safe."
        ]
      : [],
    modding_safety_warnings: isModding
      ? [
          "Create backups of saves, active mod folders, regulation files, profiles, and load-order state before mutation.",
          "Isolate experiments from the user's active setup unless explicitly approved.",
          "Check game version, DLC/version constraints, co-op/anti-cheat implications, dependency/load-order compatibility, and rollback path.",
          "Do not pretend game behavior is verified without user/local game test evidence."
        ]
      : [],
    human_approval_requirements: humanApprovalRequirements
  };
}

function buildBootstrapVerificationContract(taskAnalysis, taskContract, availableTools) {
  const primary = taskAnalysis.primary_task_type;
  const visual = primary === "website_ui" || taskAnalysis.secondary_task_types.includes("visual_qa");
  const code = ["app_build", "private_app_internal_tool", "website_ui", "api_integration", "debugging"].includes(primary);
  const security = primary === "api_integration" || taskAnalysis.secondary_task_types.includes("security_data");
  const evidence = [
    "State the exact files changed or explain why no files were changed.",
    "Report exact commands/checks run with pass/fail results, not paraphrased success claims.",
    "Name skipped checks and remaining risks."
  ];
  const suggestedCommands = [];

  if (code) {
    evidence.push("Run the narrowest relevant test/check first, then broader tests/builds when blast radius justifies it.");
    suggestedCommands.push("project-specific test command", "project-specific build/typecheck/lint command");
  }
  if (primary === "debugging") {
    evidence.push("First reproduce the failure with logs/tests/console output before editing.");
    evidence.push("Identify the root cause and show the command/log that goes red before fix and green after fix when possible.");
  }
  if (visual) {
    evidence.push("Capture or inspect desktop visual evidence.");
    evidence.push("Capture or inspect mobile/responsive visual evidence.");
    evidence.push("Check keyboard/focus/contrast/reduced-motion or equivalent accessibility concerns when applicable.");
  }
  if (primary === "api_integration") {
    evidence.push("Prove API integration handles auth absence, errors, loading states, and quota/rate-limit style failures without leaking secrets.");
    evidence.push("Document whether the call belongs in frontend code or a backend/server route and why.");
  }
  if (primary === "game_modding_workflow") {
    evidence.push("Provide local game/modding test evidence or explicitly say user-local verification is still required.");
    evidence.push("Show backup/isolation/rollback instructions before any destructive modding step.");
  }
  if (primary === "prompt_improvement") {
    evidence.push("Provide before/after prompt text, intended behavior changes, and evaluation examples or acceptance criteria.");
  }

  return {
    suggested_commands: uniqueStrings(suggestedCommands),
    available_tools_seen: availableTools,
    evidence_required: uniqueStrings(evidence),
    ui_visual_evidence_required: visual,
    test_evidence_required: code,
    security_review_required: security,
    api_secret_review_required: primary === "api_integration",
    modding_local_verification_required: primary === "game_modding_workflow",
    prompt_eval_required: primary === "prompt_improvement",
    do_not_claim_done_without_evidence: true,
    inherited_vnem_verification: taskContract.verification || []
  };
}

function buildBootstrapCompletionAuditExpectations(taskAnalysis) {
  return {
    changed_files: "List all changed files, or state that the task was guidance-only/no-file-change.",
    commands_run: "List exact commands/checks/tests/builds/visual checks run with pass/fail status.",
    pass_fail_results: "Include real output summaries, failing commands, and residual blockers.",
    mcp_tools_used: "List vnem_bootstrap activation_id plus subsequent VNEM MCP tools/resources used.",
    rules_used: "Name required_rules actually applied; do not claim rules were used if they were only returned and ignored.",
    skipped_checks: "List checks not run and why.",
    remaining_risks: "Name unverified behavior, external-service uncertainty, safety/privacy issues, and manual review needs.",
    user_visible_final_summary: [
      "What changed or was recommended.",
      "Why it matches the VNEM route.",
      "What evidence proves it.",
      "What remains unverified or needs user approval."
    ],
    task_specific: taskAnalysis.primary_task_type
  };
}

function buildBootstrapAntiPlacebo(taskAnalysis) {
  const fake = [
    "Returning generic 'AI booster' advice without task-specific routing.",
    "Claiming safety, quality, or completion without tests, logs, screenshots, citations, or changed-file evidence.",
    "Adding dashboard wording, docs, or feature labels without callable behavior."
  ];
  const proof = [
    "An MCP client can list and call vnem_bootstrap and receive structuredContent with activation, task_analysis, rules, next calls, protection, verification, completion audit, and anti-placebo sections.",
    "The output changes for app, UI, API, debugging, modding, and prompt tasks.",
    "Default MCP tool annotations stay read-only and precision/mutation tools remain absent from the default server."
  ];
  const claims = [
    "Do not claim VNEM edited files, ran tests, installed tools, fetched live web data, scanned malware, or completed implementation from bootstrap alone.",
    "Do not claim a full skills.sh-style skill registry or public-apis-style API catalog exists until dedicated registries and tests exist."
  ];

  if (taskAnalysis.primary_task_type === "debugging") {
    fake.push("Changing code before reproducing the broken behavior and calling it debugged.");
    proof.push("A reproduced failure plus a green check after the root-cause fix.");
    claims.push("Do not claim root cause was fixed without a reproduction/evidence loop.");
  }
  if (taskAnalysis.primary_task_type === "website_ui") {
    fake.push("Passing a build while the UI remains visually broken, inaccessible, or unverified in a browser.");
    proof.push("Desktop/mobile visual evidence plus accessibility/responsiveness checks.");
  }
  if (taskAnalysis.primary_task_type === "api_integration") {
    fake.push("Hardcoding/mock weather data or exposing an API key in frontend code while calling it integrated.");
    proof.push("Secret-safe frontend/backend boundary, error handling, and real or honestly mocked API evidence.");
  }
  if (taskAnalysis.primary_task_type === "game_modding_workflow") {
    fake.push("Changing mod workflow docs or files without backup/isolation/compatibility notes and pretending in-game behavior was verified.");
    proof.push("Backup/rollback path plus user/local game/modding test evidence.");
  }
  if (taskAnalysis.primary_task_type === "prompt_improvement") {
    fake.push("Rephrasing a prompt with more confident wording but no behavior target or evaluation examples.");
    proof.push("Before/after prompt plus expected behavior and evaluation examples.");
  }

  return {
    how_this_task_could_be_faked: uniqueStrings(fake),
    evidence_that_proves_not_fake: uniqueStrings(proof),
    claims_not_to_make_without_proof: uniqueStrings(claims)
  };
}

function bootstrapStatusWarnings(status) {
  const warnings = [];
  if (!status.generated_at) warnings.push("Generated data timestamp is unavailable.");
  if (!status.counts.registry_entries) warnings.push("Registry entries were not loaded.");
  if (!status.counts.search_documents) warnings.push("Search documents were not loaded.");
  if (!status.counts.quality_contract) warnings.push("Quality contract was not loaded.");
  if (!status.counts.source_radar_entries) warnings.push("Source radar entries were not loaded.");
  return warnings;
}

function resourceUriForRuleId(id) {
  const text = String(id || "");
  if (text.includes("quality-contract")) return "vnem://install/quality-contract";
  if (text.includes("operating-protocol")) return "vnem://install/operating-protocol";
  if (text.includes("orchestration-protocol")) return "vnem://install/orchestration-protocol";
  if (text.includes("precision-execution-protocol")) return "vnem://install/precision-execution-protocol";
  if (text.includes("omniscient-self-healing-protocol")) return "vnem://install/omniscient-self-healing-protocol";
  if (text.includes("coding-playbook") || text.includes("coding-playbooks")) return "vnem://install/coding-playbooks";
  if (text.includes("coding-protocol")) return "vnem://install/coding-protocol";
  if (text.includes("task-rubric") || text.includes("task-rubrics")) return "vnem://install/task-rubrics";
  if (text.includes("design-architecture")) return "vnem://install/design-architecture";
  if (text.includes("visual-qa-protocol")) return "vnem://install/visual-qa-protocol";
  if (text.includes("source-radar")) return "vnem://install/source-radar";
  if (text.includes("prompt-engineering")) return "vnem://install/prompt-engineering";
  if (text.includes("prompt-pattern")) return "vnem://install/prompt-patterns";
  if (text.startsWith("entry:")) return `vnem://entries/${text.slice("entry:".length)}`;
  return "vnem://install/search-index";
}

function formatBootstrap(bootstrap) {
  const lines = [
    `vnem bootstrap: ${bootstrap.activation.status}`,
    `Activation: ${bootstrap.activation.activation_id}`,
    `Task type: ${bootstrap.task_analysis.primary_task_type} (${bootstrap.task_analysis.confidence} confidence, ${bootstrap.task_analysis.risk_level} risk)`,
    `Read-only: ${bootstrap.activation.read_only}; precision tools exposed: ${bootstrap.activation.precision_tools_exposed}`,
    "",
    "Why:",
    ...bootstrap.task_analysis.why.map((item) => `- ${item}`)
  ];
  if (bootstrap.required_rules.length) {
    lines.push("", "Required/recommended rules:");
    for (const rule of bootstrap.required_rules.slice(0, 8)) {
      lines.push(`- ${rule.priority}: ${rule.id} -> ${rule.resource_uri}`);
    }
  }
  if (bootstrap.recommended_vnem_calls.length) {
    lines.push("", "Next VNEM calls:");
    for (const call of bootstrap.recommended_vnem_calls) {
      lines.push(`- ${call.tool}: ${call.when}`);
    }
  }
  lines.push(
    "",
    `Capability slots: MCP registry ${bootstrap.capability_slots.mcp_registry_available ? "available" : "unavailable"}; dedicated skills ${bootstrap.capability_slots.skill_recommendations_available ? "available" : "reserved/future"}; API registry ${bootstrap.capability_slots.api_registry_available ? "available" : "reserved/future"}.`,
    `Verification: ${bootstrap.verification_contract.evidence_required.slice(0, 3).join("; ")}`,
    `Safety: ${bootstrap.safety}`
  );
  return lines.join("\n");
}

function buildStatus() {
  const entryCountsByType = countBy(entries, (entry) => entry.type || "unknown");
  const entryCountsByTrustTier = countBy(entries, (entry) => entry.trust_tier || "unknown");
  const documentCountsByKind = countBy(documents, (document) => document.kind || "unknown");

  return {
    name: "vnem",
    version: packageJson?.version || "0.1.0",
    root_dir: rootDir,
    data_paths: {
      search_index: searchIndexPath,
      api_index: apiIndexPath || null,
      install_source_radar: firstExisting(["public/install/source-radar.json", ".vnem/source-radar.json"]),
      daily_digest: firstExisting(["discovery/daily-digest.md"])
    },
    generated_at: searchIndex.generated_at || apiIndex?.generated_at || null,
    release_version: searchIndex.release_version || apiIndex?.release_version || packageJson?.version || null,
    release_date: searchIndex.release_date || apiIndex?.release_date || null,
    counts: {
      registry_entries: entries.length,
      search_documents: documents.length,
      source_radar_entries: sourceRadar.length,
      intent_aliases: Object.keys(searchIndex.intent_aliases || {}).length,
      intent_routes: Object.keys(searchIndex.intent_routes || {}).length,
      quality_contract: Boolean(searchIndex.quality_contract),
      orchestration_protocol: Boolean(searchIndex.orchestration_protocol),
      precision_execution_protocol: Boolean(searchIndex.precision_execution_protocol),
      omniscient_self_healing_protocol: Boolean(searchIndex.omniscient_self_healing_protocol),
      install_guide: Boolean(searchIndex.install_guide),
      coding_playbooks: searchIndex.coding_playbooks?.playbooks?.length || 0,
      task_rubrics: searchIndex.task_rubrics?.length || 0,
      prompt_patterns: searchIndex.prompt_patterns?.length || 0,
      by_type: entryCountsByType,
      by_trust_tier: entryCountsByTrustTier,
      by_document_kind: documentCountsByKind
    },
    mcp: {
      tools: DEFAULT_MCP_TOOLS,
      resources: DEFAULT_MCP_RESOURCES,
      prompts: ["vnem_research_task"],
      annotations: READ_ONLY
    },
    safety: {
      mode: "read-only stdio MCP server",
      installs_packages: false,
      edits_files: false,
      calls_upstream_services: false,
      collects_secrets: false,
      starts_daemons: false,
      note:
        "MCP tool annotations are hints for clients. Vnem still keeps tools deterministic and read-only so the server itself does not mutate user systems."
    }
  };
}

function buildOverview(audience) {
  const status = buildStatus();
  const surfaces = [
    {
      name: "Registry",
      paths: ["registry/entries/{slug}/entry.yaml", "registry/entries/{slug}/profile.md"],
      purpose:
        "Source-backed metadata for MCP servers, coding agents, frameworks, evals, memory systems, workflows, and safety tools.",
      usable_via: ["public/api/index.json", "vnem_search", "vnem_get_entry", "vnem_compare"]
    },
    {
      name: "Install pack",
      paths: ["public/install.tgz", "public/install/install-guide.md", "public/install/*", ".vnem/*"],
      purpose:
        "Read-only project guidance files that make another repo vnem-aware through AGENTS.md and .vnem files, with setup guidance for safe archive install, managed repo install, and MCP connection.",
      usable_via: ["vnem://install/install-guide", "npm run install:project -- <repo>", "npm run doctor -- <repo>", "npm run vnem -- mcp-config"]
    },
    {
      name: "MCP server",
      paths: ["scripts/vnem-mcp-server.mjs"],
      purpose:
        "Opt-in stdio MCP surface exposing registry search, recommendations, intent routing, orchestration plans, quality gates, source radar, resources, and task contracts.",
      usable_via: ["npm run mcp", "vnem_status", "vnem_overview", "vnem_recommend", "vnem_quality_gate", "vnem_orchestrate"]
    },
    {
      name: "Precision MCP server",
      paths: ["scripts/vnem-precision-mcp-server.mjs", "scripts/lib/precision-execution-layer.mjs", "scripts/lib/omniscient-self-healing-layer.mjs"],
      purpose:
        "Separate opt-in mutation-capable MCP surface for exact diff patching, current documentation fetches, bounded terminal feedback, local semantic code search, red/green verification loops, and ephemeral scripts inside an explicit workspace.",
      usable_via: ["npm run precision:mcp", "mcp_semantic_code_search", "mcp_apply_diff_patch", "mcp_fetch_documentation", "mcp_execute_terminal_command", "mcp_run_verification_tests", "mcp_execute_ephemeral_script", "vnem://install/precision-execution-protocol", "vnem://install/omniscient-self-healing-protocol"]
    },
    {
      name: "Source radar",
      paths: ["public/install/source-radar.json", ".vnem/source-radar.json"],
      purpose:
        "Map of official/high-signal upstream sources agents should consult before broad web research or tool recommendations.",
      usable_via: ["vnem_sources", "vnem_get_source", "vnem://install/source-radar"]
    },
    {
      name: "Operating protocol and rubrics",
      paths: ["public/install/install-guide.md", "public/install/operating-protocol.md", "public/install/quality-contract.md", "public/install/orchestration-protocol.md", "public/install/precision-execution-protocol.md", "public/install/omniscient-self-healing-protocol.md", "public/install/coding-protocol.md", "public/install/coding-playbooks.json", "public/install/task-rubrics.json"],
      purpose:
        "Compact task-contract and coding-execution layer for sensing the repo, enforcing holistic quality, selecting orchestration patterns, choosing task-specific playbooks, planning exact edits, routing work, approval gates, verification, and final reporting.",
      usable_via: ["vnem_route_intent", "vnem_recommend", "vnem_quality_gate", "vnem_orchestrate", "vnem://install/install-guide", "vnem://install/quality-contract", "vnem://install/orchestration-protocol", "vnem://install/precision-execution-protocol", "vnem://install/omniscient-self-healing-protocol", "vnem://install/coding-protocol", "vnem://install/coding-playbooks", "vnem://install/task-rubrics"]
    },
    {
      name: "Visual/design guidance",
      paths: ["public/install/design-architecture.md", "public/install/visual-qa-protocol.md"],
      purpose:
        "Source-backed design and visual QA guidance for UI, games, dashboards, animation, sound, and brand-facing surfaces.",
      usable_via: ["vnem_recommend for visual tasks", "vnem://install/design-architecture", "vnem://install/visual-qa-protocol"]
    },
    {
      name: "Hermes discovery",
      paths: ["HERMES.md", "scripts/hermes-agent.mjs", "discovery/daily-digest.md", "discovery/candidates/*"],
      purpose:
        "Reviewable ecosystem discovery workflow for new MCP servers, agents, memory tools, evals, and infrastructure signals.",
      usable_via: ["npm run hermes:dry-run", "npm run digest", "vnem://discovery/daily-digest"]
    },
    {
      name: "Website and dashboard",
      paths: ["landing/", "dashboard/"],
      purpose:
        "Static public site and Hermes dashboard surfaces for explaining and browsing the product.",
      usable_via: ["npm run dashboard:build", "vnem.pages.dev when deployed"]
    }
  ];

  return {
    audience,
    one_sentence:
      "vnem is a read-only AI booster and perception layer that helps coding agents choose better tools, sources, prompts, rubrics, quality gates, and safety checks before editing a repo.",
    current_counts: status.counts,
    surfaces,
    safe_workflow: [
      "Use develop for normal improvements.",
      "Use experimental for risky prototypes.",
      "Merge to main only after validation and an understandable diff.",
      "Keep install-pack and MCP behavior read-only unless the user explicitly asks for a separate runtime surface."
    ],
    what_vnem_is_not_yet: [
      "not a shell-command interceptor",
      "not a package installer",
      "not a runtime security gateway",
      "not an automatic code editor",
      "not a secret manager"
    ]
  };
}

function findSource(value) {
  const raw = String(value || "").trim();
  if (sourceRadarById.has(raw)) {
    return sourceRadarById.get(raw);
  }
  const normalized = normalize(raw);
  return (
    sourceRadar.find((source) => normalize(source.id) === normalized || normalize(source.title) === normalized) ||
    null
  );
}

function buildTaskContract(task, intent, route, readFirst, registryEntries) {
  const mode = inferTaskMode(task);
  const rubrics = selectTaskRubrics(task, intent, mode);
  const playbooks = selectCodingPlaybooks(task, intent, mode, rubrics);
  const primaryPlaybook = playbooks[0] || null;
  const perceptionGate = buildPerceptionGate(task, rubrics);
  const qualityGate = buildQualityGate(task, "", intent, rubrics, primaryPlaybook);
  const orchestration = buildTaskOrchestrationSummary(task);
  const precisionExecution = buildPrecisionExecutionSummary(task, mode);
  const omniscientSelfHealing = buildOmniscientSelfHealingSummary(task, mode);
  const rubricIds = new Set(rubrics.flatMap((rubric) => rubric.read_first || []));
  const readFirstIds = uniqueStrings([
    ...(qualityGate?.required_read_first || []),
    ...(precisionExecution?.read_first || []),
    ...(omniscientSelfHealing?.read_first || []),
    ...rubrics.map((rubric) => `task-rubric:${rubric.id}`),
    ...rubricIds,
    ...playbooks.map((playbook) => `coding-playbook:${playbook.id}`),
    ...playbooks.flatMap((playbook) => playbook.read_first || []),
    ...(route?.read_first || []),
    ...readFirst.map((doc) => doc.id).filter(Boolean),
    ...registryEntries.slice(0, 3).map((entry) => entry.id).filter(Boolean)
  ]);
  const approvalGates = uniqueStrings([
    ...(searchIndex.operating_protocol?.default_contract?.approval_gates || []),
    ...rubrics.flatMap((rubric) => rubric.approval_gates || [])
  ]);
  const verification = uniqueStrings([
    ...(searchIndex.operating_protocol?.default_contract?.verification || []),
    ...(qualityGate?.verification_requirements || []),
    ...(primaryPlaybook?.verification_ladder || []),
    ...rubrics.flatMap((rubric) => rubric.verification || [])
  ]);
  const finalReport = uniqueStrings([
    ...(searchIndex.operating_protocol?.default_contract?.report || []),
    ...(primaryPlaybook?.final_report || []),
    ...rubrics.flatMap((rubric) => rubric.output_contract || [])
  ]);

  return compactObject({
    mode,
    intent: intent?.name || null,
    rubric: rubrics.map((rubric) => ({
      id: rubric.id,
      title: rubric.title,
      summary: rubric.summary,
      quality_bar: rubric.quality_bar || []
    })),
    coding_playbook: primaryPlaybook
      ? {
          id: primaryPlaybook.id,
          title: primaryPlaybook.title,
          summary: primaryPlaybook.summary,
          mode: primaryPlaybook.mode,
          read_first: primaryPlaybook.read_first || [],
          repo_sensing: primaryPlaybook.repo_sensing || [],
          execution_loop: primaryPlaybook.execution_loop || [],
          verification_ladder: primaryPlaybook.verification_ladder || [],
          stop_conditions: primaryPlaybook.stop_conditions || [],
          anti_patterns: primaryPlaybook.anti_patterns || [],
          final_report: primaryPlaybook.final_report || []
        }
      : null,
    quality_gate: qualityGate,
    orchestration,
    precision_execution: precisionExecution,
    omniscient_self_healing: omniscientSelfHealing,
    semantic_code_search: omniscientSelfHealing?.semantic_code_search,
    local_code_index: omniscientSelfHealing?.local_code_index,
    verification_tests: omniscientSelfHealing?.verification_tests,
    healing_loop: omniscientSelfHealing?.healing_loop,
    ephemeral_script: omniscientSelfHealing?.ephemeral_script,
    documentation_fetched: precisionExecution?.documentation_policy,
    patch_dry_run: precisionExecution?.patch_policy,
    safe_terminal_command: precisionExecution?.terminal_policy,
    triple_check: qualityGate?.triple_check,
    domain_balance: qualityGate?.detected_domains,
    tradeoff_policy: qualityGate?.tradeoff_policy,
    coding_playbook_alternates: playbooks.slice(1, 3).map((playbook) => ({
      id: playbook.id,
      title: playbook.title,
      summary: playbook.summary
    })),
    route: route
      ? {
          read_first: route.read_first || [],
          compare_options: route.compare_options || [],
          choose_by: route.choose_by || []
        }
      : null,
    read_first: readFirstIds,
    smallest_sufficient_capability: route?.compare_options?.length
      ? `Prefer existing project patterns first; if a new capability is needed, compare: ${route.compare_options.join("; ")}.`
      : "Prefer existing project patterns first; add the smallest source-backed tool only when local code cannot satisfy the task cleanly.",
    choose_by: uniqueStrings([...(route?.choose_by || []), ...(qualityGate?.quality_floor || []), ...(primaryPlaybook?.stop_conditions || []), ...rubrics.flatMap((rubric) => rubric.quality_bar || []), ...(perceptionGate?.criteria || [])]),
    approval_gates: approvalGates,
    perception_gate: perceptionGate,
    verification,
    final_report: finalReport,
    safety:
      "vnem is read-only guidance. Do not install tools, mutate config, use secrets, call external services, or start daemons because of this recommendation without explicit user approval.",
    matched_rubric_read_first: [...rubricIds]
  });
}

function buildPrecisionExecutionSummary(task, mode) {
  const text = normalize(task);
  const relevant = mode === "build" ||
    mode === "debug" ||
    /\b(code|coding|implement|feature|fix|refactor|test|web app|app|game|ui|react|vite|next|phaser|three|terminal|build|documentation|docs|patch|diff)\b/.test(text);
  if (!relevant) {
    return null;
  }

  return {
    availability: "separate opt-in precision MCP server; default vnem MCP remains read-only",
    read_first: ["precision-execution-protocol:vnem-precision-execution-protocol"],
    tools: ["mcp_apply_diff_patch", "mcp_fetch_documentation", "mcp_execute_terminal_command"],
    patch_policy: {
      dry_run_first: true,
      accepted_formats: ["SEARCH/REPLACE exact block", "unified diff hunk"],
      reject_on_context_mismatch: true,
      avoid_whole_file_rewrites: true
    },
    documentation_policy: {
      fetch_before_framework_specific_code: true,
      inject_context_before_write: true,
      examples: ["React", "Next.js", "Vite", "Phaser", "PixiJS", "Three.js", "Luau", "Playwright"]
    },
    terminal_policy: {
      allowed_classes: ["build", "test", "lint", "typecheck", "read-only git inspection"],
      blocks: ["shell chaining", "pipes", "redirection", "package installs", "deploys", "cleanup/destructive commands"],
      timeout_required: true
    }
  };
}

function buildOmniscientSelfHealingSummary(task, mode) {
  const text = normalize(task);
  const relevant = mode === "build" ||
    mode === "debug" ||
    /\b(code|coding|implement|feature|fix|refactor|test|web app|app|game|ui|logic|large repo|codebase|search|proof|verify|verification|heal|self healing|semantic|ephemeral|script|parser|bulk)\b/.test(text);
  if (!relevant) {
    return null;
  }

  const largeRepoSignals = /\b(large repo|massive|codebase|where is|find all|trace|locate|semantic|search|unknown file|scale)\b/.test(text);
  const proofSignals = /\b(feature|logic|bug|fix|test|verify|verification|proof|works|regression|silent)\b/.test(text);
  const ephemeralSignals = /\b(parse|bulk|one off|temporary|ephemeral|script|transform|convert|rename|proprietary|roadblock)\b/.test(text);

  return {
    availability: "separate opt-in precision MCP server; default vnem MCP remains read-only",
    read_first: ["omniscient-self-healing-protocol:vnem-omniscient-self-healing-protocol"],
    tools: ["mcp_semantic_code_search", "mcp_run_verification_tests", "mcp_execute_ephemeral_script"],
    semantic_code_search: {
      use_before_manual_traversal: largeRepoSignals || mode === "build" || mode === "debug",
      tool: "mcp_semantic_code_search",
      returns: ["file paths", "line numbers", "snippets", "scores", "matched terms"],
      privacy: "local hashed-vector index; no external embedding API"
    },
    local_code_index: {
      cache: ".vnem-runtime/code-index.json",
      refreshes_on_boot_or_file_change: true,
      exclude_defaults: [".git", "node_modules", "dist", "build", ".vnem-runtime"],
      direct_read_required_after_search: true
    },
    verification_tests: {
      test_first_required_for_feature_logic: proofSignals,
      tool: "mcp_run_verification_tests",
      phases: ["red", "green", "check"],
      pass_verdicts: ["red_confirmed", "pass"],
      fail_verdicts: ["needs_healing", "blocked"]
    },
    healing_loop: {
      max_attempts: 5,
      required_flow: ["write/select test", "red phase when possible", "surgical patch", "green phase", "repeat until pass or blocked"],
      blocked_action: "report failing command, stdout/stderr, attempts, and smallest human decision needed"
    },
    ephemeral_script: {
      use_for: ephemeralSignals ? "narrow one-off local roadblock" : "only when a unique local parsing/transformation roadblock appears",
      tool: "mcp_execute_ephemeral_script",
      cleanup_required: true,
      blocks: ["network APIs", "process spawning", "destructive filesystem APIs", "shell scripts by default"]
    }
  };
}

function buildTaskOrchestrationSummary(task) {
  const plan = buildOrchestrationPlan(task, { maxWorkers: 5 });
  return {
    pattern: plan.route.pattern,
    confidence: plan.route.confidence,
    reasons: plan.route.reasons,
    reflection_required: plan.route.reflection_required,
    max_iterations: plan.route.max_iterations,
    recommended_workers: plan.route.recommended_workers,
    workflow: plan.workflow.name,
    worker_roles: plan.workflow.agents.map((agent) => agent.role),
    task_ids: plan.workflow.tasks.map((item) => item.id),
    read_first: ["orchestration-protocol:vnem-orchestration-protocol"],
    mcp_tool: "vnem_orchestrate",
    resource_uri: "vnem://install/orchestration-protocol"
  };
}

function selectCodingPlaybooks(task, intent, mode, rubrics) {
  const playbooks = Array.isArray(searchIndex.coding_playbooks?.playbooks)
    ? searchIndex.coding_playbooks.playbooks
    : [];
  if (!playbooks.length) {
    return [];
  }

  const terms = tokenize([
    task,
    intent?.name,
    ...(intent?.aliases || []),
    ...(intent?.route?.read_first || []),
    ...rubrics.flatMap((rubric) => [rubric.id, rubric.title, ...(rubric.intents || []), ...(rubric.read_first || [])])
  ].join(" "));

  const routeIds = new Set(intent?.route?.read_first || []);
  const scored = playbooks
    .map((playbook) => {
      const haystack = tokenize([
        playbook.id,
        playbook.title,
        playbook.mode,
        playbook.summary,
        ...(playbook.intents || []),
        ...(playbook.triggers || []),
        ...(playbook.read_first || []),
        ...(playbook.repo_sensing || []),
        ...(playbook.execution_loop || []),
        ...(playbook.verification_ladder || [])
      ].join(" "));
      const words = new Set(haystack);
      let score = playbook.mode === mode ? 20 : 0;
      if (routeIds.has(`coding-playbook:${playbook.id}`)) {
        score += 70;
      }
      for (const id of playbook.read_first || []) {
        if (routeIds.has(id)) {
          score += 8;
        }
      }
      for (const term of terms) {
        if (words.has(term)) {
          score += 3;
        }
      }
      return { playbook, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.playbook.id.localeCompare(b.playbook.id));

  if (!scored.length) {
    const fallback = playbooks.find((playbook) => playbook.id === "feature-slice") || playbooks[0];
    return fallback ? [fallback] : [];
  }

  return scored.slice(0, 3).map(({ playbook }) => playbook);
}

const QUALITY_DOMAIN_KEYWORDS = {
  performance: ["performance", "fps", "latency", "fast", "faster", "speed", "lightweight", "optimize", "optimized", "bundle", "memory", "render", "lag", "smooth"],
  visual: ["ui", "design", "visual", "aesthetic", "polish", "animation", "layout", "typography", "glow", "assets", "brand", "dashboard", "landing", "canvas"],
  playability: ["game", "play", "playability", "controls", "input", "feedback", "reward", "level", "physics", "sound", "sfx", "game feel", "restart"],
  accessibility: ["mobile", "responsive", "keyboard", "focus", "contrast", "reduced motion", "reduced-motion", "screen reader", "touch", "aria"],
  maintainability: ["refactor", "tests", "test", "conventions", "api", "architecture", "maintainable", "helpers", "module", "cleanup", "code"],
  "security/data": ["auth", "secret", "secrets", "database", "payment", "deployment", "external service", "production data", "token", "credential", "permission"]
};

function buildQualityGate(task, proposedApproach = "", intent, rubrics = [], playbook = null, explicitDomains = [], options = {}) {
  const mode = inferTaskMode(task);
  const text = [task, proposedApproach, intent?.name, ...(intent?.aliases || []), ...(rubrics || []).map((rubric) => rubric.id), playbook?.id].join(" ");
  const detectedDomains = detectQualityDomains(text, explicitDomains);
  const rubricIds = new Set((rubrics || []).map((rubric) => rubric.id));
  const intentName = normalize(intent?.name || "");
  const applies =
    options.force ||
    detectedDomains.length > 0 ||
    Boolean(playbook) ||
    ["build", "debug", "review"].includes(mode) ||
    rubricIds.has("agentic_coding") ||
    rubricIds.has("frontend_ui") ||
    rubricIds.has("aesthetic_experience") ||
    rubricIds.has("interactive_canvas") ||
    ["holistic excellence", "quality gate", "triple check", "performance visuals", "playability", "production ready", "settings gui", "intelligent tradeoff"].includes(intentName);

  if (!applies) {
    return null;
  }

  if ((playbook || rubricIds.has("agentic_coding")) && !detectedDomains.includes("maintainability")) {
    detectedDomains.push("maintainability");
  }
  if ((rubricIds.has("frontend_ui") || rubricIds.has("aesthetic_experience") || /\b(ui|design|visual|dashboard|landing|canvas|animation|brand)\b/.test(normalize(text))) && !detectedDomains.includes("visual")) {
    detectedDomains.push("visual");
  }
  if ((rubricIds.has("interactive_canvas") || /\b(game|playability|controls|reward|physics|sound|game feel)\b/.test(normalize(text))) && !detectedDomains.includes("playability")) {
    detectedDomains.push("playability");
  }
  if ((detectedDomains.includes("visual") || detectedDomains.includes("playability")) && !detectedDomains.includes("accessibility")) {
    detectedDomains.push("accessibility");
  }

  const tradeoffWarnings = detectTradeoffRisks([task, proposedApproach].join(" "), detectedDomains);
  const requiredReadFirst = uniqueStrings([
    "quality-contract:vnem-quality-contract",
    "practice:holistic-excellence-intelligent-tradeoffs",
    ...(detectedDomains.includes("visual") || detectedDomains.includes("playability") || detectedDomains.includes("accessibility")
      ? ["design-architecture:vnem-design-architecture", "visual-qa-protocol:vnem-visual-qa-protocol"]
      : []),
    ...(playbook ? [`coding-playbook:${playbook.id}`] : [])
  ]);
  const verificationRequirements = qualityVerificationForDomains(detectedDomains);
  const verdict = tradeoffWarnings.some((warning) => warning.severity === "blocked")
    ? "blocked"
    : tradeoffWarnings.length
      ? "needs_revision"
      : "pass";
  const contract = searchIndex.quality_contract || {};

  return {
    verdict,
    detected_domains: detectedDomains,
    triple_check: contract.triple_check || [
      { step: "Analyze", instruction: "Identify stated goal, hidden requirements, visible/interactive surfaces, and risk domains." },
      { step: "Architect", instruction: "Plan performance and visuals/playability together before lowering quality." },
      { step: "Review", instruction: "Verify no important domain was sacrificed before final output." }
    ],
    quality_floor: contract.quality_floor || [
      "Do not solve one requirement by quietly damaging another important requirement.",
      "If performance conflicts with visuals or playability, first offer an intelligent alternative."
    ],
    tradeoff_policy: contract.tradeoff_policy || [
      "Optimize the actual bottleneck before lowering quality.",
      "Expose user-controllable quality/performance modes when both high performance and high visual quality matter."
    ],
    tradeoff_warnings: tradeoffWarnings,
    required_read_first: requiredReadFirst,
    verification_requirements: verificationRequirements,
    summary:
      "Use this gate before coding and before final output. A passing implementation must preserve every detected quality domain or explicitly report the remaining trade-off with evidence."
  };
}

function detectQualityDomains(value, explicitDomains = []) {
  const text = normalize(value);
  const domains = [];
  for (const domain of explicitDomains) {
    if (QUALITY_DOMAIN_KEYWORDS[domain] && !domains.includes(domain)) {
      domains.push(domain);
    }
  }
  for (const [domain, keywords] of Object.entries(QUALITY_DOMAIN_KEYWORDS)) {
    if (keywords.some((keyword) => text.includes(normalize(keyword))) && !domains.includes(domain)) {
      domains.push(domain);
    }
  }
  return domains;
}

function detectTradeoffRisks(value, domains = []) {
  const text = normalize(value);
  const hasVisualOrPlay = domains.includes("visual") || domains.includes("playability");
  const warnings = [];
  const addWarning = (risk, alternative, severity = "needs_revision") => {
    warnings.push({ risk, alternative, severity });
  };

  if (hasVisualOrPlay && /\b(remove|removing|drop|dropping|disable|disabling|turn off|strip|stripping|cut|cutting)\b.*\b(visual|animation|animations|effect|effects|polish|glow|sound|sfx|feedback)\b/.test(text)) {
    addWarning(
      "Proposed approach lowers visuals/playability to satisfy another goal.",
      "Optimize the bottleneck first, then add quality profiles, adaptive effects, settings toggles, reduced-motion handling, or scoped fallback."
    );
  }
  if (hasVisualOrPlay && /\bjust\b.*\bfast\b|\bmake it fast\b|\bonly performance\b/.test(text)) {
    addWarning(
      "Performance is being treated as the only success criterion.",
      "Keep a high-quality path and provide a deliberate fast/default profile instead of silently degrading the product."
    );
  }
  if (hasVisualOrPlay && /\bskip\b.*\b(browser|screenshot|visual|mobile|rendered|interaction)\b/.test(text)) {
    addWarning(
      "Rendered verification would be skipped for visual or interactive work.",
      "Run or inspect desktop/mobile rendered states, or report blocked visual verification honestly."
    );
  }
  if (hasVisualOrPlay && /\bignore\b.*\b(mobile|responsive|accessibility|keyboard|focus|contrast|reduced motion)\b/.test(text)) {
    addWarning(
      "Accessibility or responsive quality would be ignored.",
      "Preserve responsive fit, focus/keyboard basics, contrast, reduced-motion behavior, or document a scoped fallback."
    );
  }
  if (/\bskip\b.*\b(test|tests|verification|build|typecheck)\b/.test(text)) {
    addWarning(
      "Verification would be skipped.",
      "Run the narrowest relevant check first, then broader checks when blast radius justifies it."
    );
  }

  return warnings;
}

function qualityVerificationForDomains(domains) {
  const checks = ["run the strongest practical focused check for the changed behavior", "report skipped checks and residual risk plainly"];
  if (domains.includes("performance")) {
    checks.push("identify the bottleneck or performance-sensitive path before lowering quality");
  }
  if (domains.includes("visual")) {
    checks.push("inspect or capture desktop and mobile rendered states");
  }
  if (domains.includes("playability")) {
    checks.push("verify one meaningful interaction, control, reward, or feedback moment");
  }
  if (domains.includes("accessibility")) {
    checks.push("check responsive fit, focus/keyboard basics, contrast, and reduced-motion path when relevant");
  }
  if (domains.includes("maintainability")) {
    checks.push("reuse repo conventions and run focused tests/type/build checks where available");
  }
  if (domains.includes("security/data")) {
    checks.push("identify approval gates for auth, secrets, database, payments, deployment, external services, or production data");
  }
  return uniqueStrings(checks);
}

function buildPerceptionGate(task, rubrics) {
  const text = normalize(task);
  const rubricIds = new Set(rubrics.map((rubric) => rubric.id));
  const applies =
    rubricIds.has("aesthetic_experience") ||
    rubricIds.has("frontend_ui") ||
    rubricIds.has("interactive_canvas") ||
    /\b(ui|frontend|design|visual|aesthetic|pretty|polished|game|canvas|animation|neon|glow|sound|dopamine|reward|microinteraction|dashboard|bento|landing|brand|chat|conversational|typography|motion|glass|dark mode|spacing)\b/.test(text);

  if (!applies) {
    return null;
  }

  return {
    required: true,
    verdicts: ["ship-quality", "needs-polish", "blocked"],
    criteria: [
      "first screen looks intentionally designed, balanced, and domain-appropriate",
      "scale, spacing, hierarchy, color, typography, and motion match the user's reference or vibe",
      "reward effects are anchored to the relevant user action or game event",
      "sound and flashes are pleasant, restrained, muteable, and not noisy",
      "if screenshots reveal obvious ugliness, iterate before final instead of reporting done"
    ],
    ship_blockers: [
      "ugly or generic first screen",
      "oversized canvas, board, hero, card, or empty visual surface",
      "unreadable text, weak contrast, broken hierarchy, or text overflow",
      "unbalanced spacing, cramped grouping, or mismatched scale",
      "noisy glow, blur, flash, animation, or particle effects",
      "reward effects that do not originate from the user action or game event",
      "harsh, constant, unthrottled, or non-muteable audio",
      "missing mobile fit or broken responsive layout"
    ],
    design_system_expectations: [
      "reuse existing repo assets, design tokens, CSS variables, and component patterns before inventing new ones",
      "use a coherent spacing scale and keep internal component padding no larger than external separation",
      "choose layout structure deliberately: CSS Grid for two-dimensional dashboard/bento layouts, simpler flow for sequential reading",
      "use readable type scale, line height, and bounded fluid sizing when responsive typography matters",
      "use current WCAG/W3C guidance as the accessibility baseline; treat WCAG 3/APCA-style contrast as watchlist guidance only",
      "provide restrained motion, reduced-motion fallback, and short muteable sound when audio is included",
      "translate reference style into palette, texture, silhouette, glow behavior, and mood rather than disconnected decoration"
    ],
    visual_verification: [
      "inspect or capture a desktop screenshot",
      "inspect or capture a mobile screenshot",
      "verify one core interaction or reward moment",
      "check reduced-motion behavior for motion-heavy surfaces",
      "check audio unlock, throttling, and mute behavior when sound is included"
    ],
    repo_sensing: [
      "inspect existing design tokens, CSS variables, Tailwind/theme config, and component patterns",
      "inspect local assets, public images, icons, fonts, screenshots, and user-provided references",
      "inspect current routes, layout constraints, canvas sizing, HUD/hero/card scale, and mobile breakpoints",
      "inspect package manifests for existing UI, game, animation, audio, and browser-test tooling before adding anything",
      "use repo-native assets and styles first; ask before fetching media, generating assets, adding dependencies, or changing config"
    ]
  };
}

function inferTaskMode(task) {
  const text = normalize(task);
  if (/\b(prompt|prompting|prompt-engineering|template prompt|system prompt|developer prompt|instructions?)\b/.test(text)) return "prompt";
  if (/\b(debug|fix failing|failing test|error|stack trace|regression|diagnose|root cause)\b/.test(text)) return "debug";
  if (/\b(review|audit|assess|inspect|critique|find bugs|pr review)\b/.test(text)) return "review";
  if (/\b(plan|architect|architecture|proposal|strategy|policy)\b/.test(text)) return "plan";
  if (/\b(build|create|make|implement|develop|ship|add)\b/.test(text)) return "build";
  if (/\bdesign\b/.test(text)) return "plan";
  if (/\b(choose|select|compare|recommend|evaluate|which|best|decide)\b/.test(text)) return "decision";
  return "build";
}

function selectTaskRubrics(task, intent, mode) {
  const rubrics = Array.isArray(searchIndex.task_rubrics) ? searchIndex.task_rubrics : [];
  const queryTerms = new Set(tokenize([task, intent?.name, ...(intent?.aliases || [])].join(" ")));
  const routeIds = new Set(intent?.route?.read_first || []);
  const scored = rubrics
    .map((rubric) => {
      const haystack = [
        rubric.id,
        rubric.title,
        rubric.summary,
        ...(rubric.intents || []),
        ...(rubric.modes || []),
        ...(rubric.read_first || []),
        ...(rubric.quality_bar || [])
      ].map(normalize);
      let score = rubric.modes?.includes(mode) ? 6 : 0;
      for (const term of queryTerms) {
        if (haystack.some((item) => item.includes(term))) score += 2;
      }
      for (const id of rubric.read_first || []) {
        if (routeIds.has(id)) score += 5;
      }
      return { rubric, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.rubric.id.localeCompare(b.rubric.id));

  if (scored.length) {
    return scored.slice(0, 2).map(({ rubric }) => rubric);
  }

  const fallback = rubrics.find((rubric) => rubric.id === "agent_tooling") || rubrics[0];
  return fallback ? [fallback] : [];
}

function scoreDocument(document, terms, queryText, intent) {
  const title = normalize(document.title);
  const summary = normalize(document.summary);
  const tags = (document.tags || []).map(normalize);
  const useCases = (document.use_cases || []).map(normalize);
  const bestFor = (document.best_for || []).map(normalize);
  const keywords = new Set((document.keywords || []).map(normalize));
  let score = Number(document.score || 0);

  if (queryText && title.includes(queryText)) {
    score += 35;
  }
  if (queryText && tags.includes(queryText)) {
    score += 25;
  }
  if (queryText && document.id?.endsWith(queryText)) {
    score += 20;
  }

  for (const term of terms) {
    if (title.includes(term)) score += 14;
    if (tags.some((tag) => tag === term || tag.includes(term))) score += 10;
    if (summary.includes(term)) score += 5;
    if (useCases.some((useCase) => useCase.includes(term))) score += 4;
    if (bestFor.some((item) => item.includes(term))) score += 3;
    if (keywords.has(term)) score += 2;
  }

  if (intent) {
    const relatedTerms = tokenize([intent.name, ...(intent.aliases || [])].join(" "));
    const routeIndex = intent.route?.read_first?.indexOf(document.id) ?? -1;
    if (routeIndex >= 0) {
      score += Math.max(50 - routeIndex * 10, 20);
    }
    for (const term of relatedTerms) {
      if (tags.some((tag) => tag.includes(term))) score += 3;
      if (title.includes(term)) score += 2;
      if (keywords.has(term)) score += 1;
    }
  }

  return score;
}

function enrichDocument(document, rankScore) {
  const slug = document.id?.startsWith("entry:") ? document.id.slice("entry:".length) : null;
  const entry = slug ? entriesBySlug.get(slug) : null;
  return compactObject({
    id: document.id,
    kind: document.kind,
    slug,
    name: entry?.name || document.title,
    summary: entry?.summary_llm || document.summary,
    trust_tier: entry?.trust_tier || document.trust_tier,
    review_status: entry?.review_status,
    type: entry?.type || document.type,
    rank_score: rankScore,
    recommendation_score: entry?.recommendation_score || document.score,
    tags: entry?.tags || document.tags || [],
    use_cases: entry?.use_cases || document.use_cases || [],
    best_for: entry?.best_for || document.best_for || [],
    not_for: entry?.not_for || [],
    source_urls: entry?.source_urls || document.source_urls || [],
    url_path: entry?.url_path || document.url_path,
    entry_path: entry?.entry_path,
    profile_path: entry?.profile_path,
    install: entry?.install,
    permissions: entry?.permissions || [],
    env_vars: entry?.env_vars || [],
    risk_flags: entry?.risk_flags || document.risk_flags || []
  });
}

function resolveIntent(query) {
  const queryText = normalize(query);
  const aliases = searchIndex.intent_aliases || {};
  const routeMap = searchIndex.intent_routes || {};
  const exactName =
    Object.keys(aliases).find((name) => normalize(name) === queryText) ||
    Object.keys(routeMap).find((name) => normalize(name) === queryText);
  if (exactName) {
    const exactAliases = aliases[exactName];
    return {
      name: exactName,
      aliases: Array.isArray(exactAliases) ? exactAliases : [],
      route: routeMap[exactName] || null
    };
  }
  const candidates = Object.entries(aliases)
    .map(([name, values]) => ({
      name,
      aliases: Array.isArray(values) ? values : []
    }))
    .sort((a, b) => b.name.length - a.name.length);

  for (const candidate of candidates) {
    const needles = [candidate.name, ...candidate.aliases].map(normalize).filter(Boolean);
    if (needles.some((needle) => queryText === needle || queryText.includes(needle))) {
      return {
        name: candidate.name,
        aliases: candidate.aliases,
        route: routeMap[candidate.name] || null
      };
    }
  }

  if (routeMap[queryText]) {
    return {
      name: queryText,
      aliases: [],
      route: routeMap[queryText]
    };
  }

  return null;
}

function findEntry(value) {
  const raw = String(value || "").trim();
  const direct = entriesBySlug.get(raw);
  if (direct) {
    return direct;
  }
  const normalized = normalize(raw);
  const slugged = slugify(raw);
  return (
    entriesBySlug.get(slugged) ||
    entries.find((entry) => normalize(entry.name) === normalized || normalize(entry.slug) === normalized) ||
    null
  );
}

async function readProfile(entry) {
  if (!entry.profile_path) {
    return null;
  }
  const profilePath = safePath(entry.profile_path);
  if (!profilePath || !existsSync(profilePath)) {
    return null;
  }
  return readFile(profilePath, "utf8");
}

function compareEntry(entry) {
  return {
    slug: entry.slug,
    name: entry.name,
    type: entry.type,
    trust_tier: entry.trust_tier,
    review_status: entry.review_status,
    summary: entry.summary_llm,
    best_for: entry.best_for || [],
    not_for: entry.not_for || [],
    install: entry.install || {},
    permissions: entry.permissions || [],
    env_vars: entry.env_vars || [],
    risk_flags: entry.risk_flags || [],
    alternatives: entry.alternatives || [],
    source_urls: entry.source_urls || []
  };
}

function formatSearch(query, results, intent) {
  const lines = [`vnem search: ${query}`];
  if (intent) {
    lines.push(`Intent: ${intent.name}${intent.route ? " (has route)" : " (alias only)"}`);
  }
  if (!results.length) {
    lines.push("No matching vnem documents found. Try broader terms or inspect vnem://install/search-index.");
    return lines.join("\n");
  }
  lines.push("");
  for (const result of results) {
    lines.push(formatResultLine(result));
  }
  return lines.join("\n");
}

function formatRecommendation(recommendation) {
  const lines = [`vnem recommendation pass: ${recommendation.task}`];
  if (recommendation.intent) {
    lines.push(`Intent: ${recommendation.intent.name}`);
  }
  if (recommendation.route?.choose_by?.length) {
    lines.push(`Choose by: ${recommendation.route.choose_by.join("; ")}`);
  }
  if (recommendation.task_contract) {
    lines.push(`Mode: ${recommendation.task_contract.mode}`);
    if (recommendation.task_contract.rubric?.length) {
      lines.push(`Rubric: ${recommendation.task_contract.rubric.map((rubric) => rubric.id).join(", ")}`);
    }
    if (recommendation.task_contract.coding_playbook?.id) {
      lines.push(`Coding playbook: ${recommendation.task_contract.coding_playbook.id}`);
    }
    if (recommendation.task_contract.orchestration?.pattern) {
      lines.push(
        `Orchestration: ${recommendation.task_contract.orchestration.pattern} via ${recommendation.task_contract.orchestration.workflow}`
      );
    }
    if (recommendation.task_contract.precision_execution?.availability) {
      lines.push(`Precision execution: ${recommendation.task_contract.precision_execution.availability}`);
    }
    if (recommendation.task_contract.omniscient_self_healing?.availability) {
      lines.push(`Omniscient/self-healing: ${recommendation.task_contract.omniscient_self_healing.availability}`);
    }
    if (recommendation.task_contract.quality_gate?.verdict) {
      lines.push(`Quality gate: ${recommendation.task_contract.quality_gate.verdict}`);
      if (recommendation.task_contract.quality_gate.detected_domains?.length) {
        lines.push(`Quality domains: ${recommendation.task_contract.quality_gate.detected_domains.join(", ")}`);
      }
    }
  }

  lines.push("", "Top registry matches:");
  if (recommendation.registry_entries.length) {
    for (const entry of recommendation.registry_entries) {
      lines.push(formatResultLine(entry));
    }
  } else {
    lines.push("- No registry matches found.");
  }

  lines.push("", "Read first:");
  if (recommendation.read_first.length) {
    for (const doc of recommendation.read_first) {
      lines.push(formatResultLine(doc));
    }
  } else {
    lines.push("- No matching best-practice notes found.");
  }

  if (recommendation.task_contract) {
    lines.push("", "Task contract:");
    if (recommendation.task_contract.quality_gate?.triple_check?.length) {
      lines.push(`- Triple-check: ${recommendation.task_contract.quality_gate.triple_check.map((item) => item.step).join(" -> ")}`);
    }
    if (recommendation.task_contract.quality_gate?.tradeoff_warnings?.length) {
      lines.push(`- Trade-off warnings: ${recommendation.task_contract.quality_gate.tradeoff_warnings.map((warning) => warning.risk).join("; ")}`);
    }
    if (recommendation.task_contract.quality_gate?.verification_requirements?.length) {
      lines.push(`- Quality verification: ${recommendation.task_contract.quality_gate.verification_requirements.slice(0, 5).join("; ")}`);
    }
    if (recommendation.task_contract.orchestration?.pattern) {
      lines.push(
        `- Orchestration: ${recommendation.task_contract.orchestration.pattern}; workers ${recommendation.task_contract.orchestration.recommended_workers}; reflection ${recommendation.task_contract.orchestration.reflection_required ? "required" : "not required"}; tool ${recommendation.task_contract.orchestration.mcp_tool}`
      );
    }
    if (recommendation.task_contract.precision_execution?.tools?.length) {
      lines.push(`- Precision tools: ${recommendation.task_contract.precision_execution.tools.join(", ")}`);
      lines.push("- Precision rule: dry-run exact patches first, fetch current docs before framework-specific code, and use safe terminal checks only.");
    }
    if (recommendation.task_contract.omniscient_self_healing?.tools?.length) {
      lines.push(`- Omniscient tools: ${recommendation.task_contract.omniscient_self_healing.tools.join(", ")}`);
      lines.push("- Proof rule: semantic search before blind traversal, red/green verification before success claims, and ephemeral scripts only for narrow temporary roadblocks.");
    }
    if (recommendation.task_contract.coding_playbook?.execution_loop?.length) {
      lines.push(`- Playbook loop: ${recommendation.task_contract.coding_playbook.execution_loop.slice(0, 4).join("; ")}`);
    }
    lines.push(`- Smallest sufficient capability: ${recommendation.task_contract.smallest_sufficient_capability}`);
    if (recommendation.task_contract.approval_gates?.length) {
      lines.push(`- Approval gates: ${recommendation.task_contract.approval_gates.slice(0, 5).join("; ")}`);
    }
    if (recommendation.task_contract.perception_gate?.required) {
      lines.push(`- Perception gate: ${recommendation.task_contract.perception_gate.criteria.slice(0, 5).join("; ")}`);
      if (recommendation.task_contract.perception_gate.ship_blockers?.length) {
        lines.push(`- Design blockers: ${recommendation.task_contract.perception_gate.ship_blockers.slice(0, 4).join("; ")}`);
      }
      if (recommendation.task_contract.perception_gate.visual_verification?.length) {
        lines.push(`- Visual verification: ${recommendation.task_contract.perception_gate.visual_verification.slice(0, 5).join("; ")}`);
      }
      if (recommendation.task_contract.perception_gate.repo_sensing?.length) {
        lines.push(`- Repo sensing: ${recommendation.task_contract.perception_gate.repo_sensing.slice(0, 4).join("; ")}`);
      }
    }
    if (recommendation.task_contract.verification?.length) {
      lines.push(`- Verification: ${recommendation.task_contract.verification.slice(0, 5).join("; ")}`);
    }
  }

  lines.push("", `Safety: ${recommendation.safety}`);
  return lines.join("\n");
}

function formatQualityGate(result) {
  const gate = result.quality_gate;
  const lines = [`vnem quality gate: ${result.task}`];
  lines.push(`Verdict: ${gate.verdict}`);
  if (gate.detected_domains?.length) {
    lines.push(`Domains: ${gate.detected_domains.join(", ")}`);
  }
  if (gate.triple_check?.length) {
    lines.push("", "Triple-Check Workflow:");
    for (const item of gate.triple_check) {
      lines.push(`- ${item.step}: ${item.instruction}`);
    }
  }
  if (gate.tradeoff_warnings?.length) {
    lines.push("", "Trade-off warnings:");
    for (const warning of gate.tradeoff_warnings) {
      lines.push(`- ${warning.risk} Alternative: ${warning.alternative}`);
    }
  }
  if (gate.required_read_first?.length) {
    lines.push("", `Read first: ${gate.required_read_first.join(", ")}`);
  }
  if (gate.verification_requirements?.length) {
    lines.push("", "Verification requirements:", ...gate.verification_requirements.map((item) => `- ${item}`));
  }
  lines.push("", `Safety: ${result.safety}`);
  return lines.join("\n");
}

function formatOrchestrationPlan(plan) {
  const lines = [`vnem orchestration plan: ${plan.task}`];
  lines.push(`Pattern: ${plan.route.pattern}`);
  lines.push(`Confidence: ${plan.route.confidence}`);
  if (plan.route.reasons?.length) {
    lines.push(`Reasons: ${plan.route.reasons.join("; ")}`);
  }
  lines.push(`Workflow: ${plan.workflow.name}`);
  lines.push(`Recommended workers: ${plan.route.recommended_workers}`);
  lines.push(`Reflection loop: ${plan.reflection_loop.enabled ? `enabled, max ${plan.reflection_loop.max_iterations}` : "not required"}`);
  if (plan.workflow.agents?.length) {
    lines.push("", "Agents:");
    for (const agent of plan.workflow.agents) {
      lines.push(`- ${agent.id} (${agent.role}): ${agent.responsibility}`);
    }
  }
  if (plan.workflow.tasks?.length) {
    lines.push("", "Task graph:");
    for (const task of plan.workflow.tasks.slice(0, 8)) {
      const deps = task.dependencies?.length ? ` after ${task.dependencies.join(", ")}` : "";
      lines.push(`- ${task.id} [${task.role}]${deps}: ${task.title}`);
    }
  }
  lines.push("", "Structured contracts:");
  lines.push(`- Route decision schema: ${Boolean(plan.schemas?.route_decision)}`);
  lines.push(`- Architect task-list schema: ${Boolean(plan.schemas?.architect_task_list)}`);
  lines.push(`- Worker claim/report schemas: ${Boolean(plan.schemas?.worker_claim && plan.schemas?.worker_report)}`);
  lines.push(`- Shared state events: ${plan.shared_state?.events?.length || 0} initial event(s)`);
  lines.push("", `Safety: ${plan.safety}`);
  return lines.join("\n");
}

function formatEntry(entry, profile) {
  const lines = [
    `${entry.name} (${entry.slug})`,
    `${entry.trust_tier} / ${entry.review_status || "review status unknown"} / ${entry.type}`,
    "",
    entry.summary_llm
  ];

  if (entry.best_for?.length) {
    lines.push("", "Best for:", ...entry.best_for.slice(0, 6).map((item) => `- ${item}`));
  }
  if (entry.not_for?.length) {
    lines.push("", "Not for:", ...entry.not_for.slice(0, 4).map((item) => `- ${item}`));
  }
  if (entry.install?.notes || entry.install?.command) {
    lines.push("", "Install notes:");
    if (entry.install.command) lines.push(`- Command: ${entry.install.command}`);
    if (entry.install.notes) lines.push(`- ${entry.install.notes}`);
  }
  if (entry.risk_flags?.length) {
    lines.push("", "Risk flags:", ...entry.risk_flags.map((item) => `- ${item}`));
  }
  if (entry.source_urls?.length) {
    lines.push("", "Sources:", ...entry.source_urls.slice(0, 8).map((url) => `- ${url}`));
  }
  if (profile) {
    lines.push("", "Profile:", profile);
  }
  return lines.join("\n");
}

function formatComparison(comparison) {
  const lines = ["vnem comparison:"];
  for (const entry of comparison.entries) {
    const risk = entry.risk_flags.length ? entry.risk_flags.join("; ") : "none listed";
    lines.push(
      `- ${entry.name} (${entry.slug}): ${entry.trust_tier}, ${entry.type}. ${entry.summary} Risk: ${risk}`
    );
  }
  if (comparison.missing.length) {
    lines.push(`Missing: ${comparison.missing.join(", ")}`);
  }
  return lines.join("\n");
}

function formatBestPractices(result) {
  const lines = [`vnem best-practices: ${result.intent}`];
  if (result.resolved_intent) {
    lines.push(`Intent: ${result.resolved_intent.name}`);
  }
  if (result.route?.compare_options?.length) {
    lines.push(`Compare: ${result.route.compare_options.join("; ")}`);
  }
  lines.push("");
  for (const doc of result.read_first) {
    lines.push(formatResultLine(doc));
  }
  if (!result.read_first.length) {
    lines.push("- No matching best-practice notes found.");
  }
  return lines.join("\n");
}

function formatSourceRadar(result) {
  const lines = [`vnem source radar: ${result.intent || "all sources"}`];
  if (result.category) {
    lines.push(`Category: ${result.category}`);
  }
  if (result.resolved_intent) {
    lines.push(`Intent: ${result.resolved_intent.name}`);
  }
  lines.push("");

  if (!result.sources.length) {
    lines.push("- No matching source radar entries found. Inspect vnem://install/source-radar.");
  } else {
    for (const source of result.sources) {
      lines.push(formatSourceLine(source));
    }
  }

  lines.push("", `Safety: ${result.safety}`);
  return lines.join("\n");
}

function formatCapabilityModules(title, modules = []) {
  return [
    title,
    ...modules.map((module, index) => `${index + 1}. ${module.id} — ${(module.compact_instructions || []).slice(0, 2).join(" ")}`),
    "Core MCP is read-only: no skill installs, API calls, file writes, or terminal execution."
  ].join("\n");
}

function formatActivationPack(pack) {
  return [
    `activation: ${pack.activation_id}`,
    `modules: ${(pack.selected_capability_modules || []).map((module) => module.id).join(", ")}`,
    `required evidence: ${(pack.evidence_requirements || []).slice(0, 3).join("; ")}`,
    "If required module evidence is skipped, mark the task incomplete."
  ].join("\n");
}

function formatSkillGuidance(result) {
  if (!result.found) return `No skill guidance found for ${result.skill_id}.`;
  return [
    `skill guidance: ${result.skill_id}`,
    ...(result.compact_applicable_instructions || []).map((item) => `- ${item}`),
    "Core MCP applies guidance only; installation/execution requires separate approval/tools."
  ].join("\n");
}

function formatBoostTask(boost) {
  return [
    `VNEM task boost: ${boost.task_summary}`,
    `task type: ${boost.task_type}`,
    `questions: ${(boost.missing_context_questions || []).slice(0, 3).join("; ") || "none critical"}`,
    `usable skills: ${(boost.selected_usable_skill_packs || []).map((skill) => skill.id).join(", ") || "none"}`,
    `usable APIs: ${(boost.selected_usable_api_packs || []).map((api) => api.id).join(", ") || "none"}`,
    `workflow: ${(boost.workflow_steps || []).slice(0, 3).join(" | ")}`,
    `handoff risk: ${boost.tools_mcp_handoff?.risk_level || boost.tools_handoff?.risk_level || "none"}`,
    `verify: ${(boost.verification_plan || []).slice(0, 3).join(" | ")}`,
    `must not claim: ${(boost.must_not_claim || []).slice(0, 2).join(" | ")}`,
    `precision/tools: ${(boost.when_tools_or_precision_mcp_is_needed || []).slice(0, 2).join(" | ")}`,
    "Core MCP is read-only: guidance only, no skill installs, live API calls, file edits, browser actions, terminal commands, or GitHub actions."
  ].join("\n");
}

function formatToolsHandoff(handoff) {
  return [
    `VNEM Tools MCP handoff: ${handoff.task_summary}`,
    `risk: ${handoff.risk_level}`,
    `usable APIs: ${(handoff.selected_usable_api_packs || []).map((pack) => pack.id).join(", ") || "none"}`,
    `usable skills: ${(handoff.selected_usable_skill_packs || []).map((pack) => pack.id).join(", ") || "none"}`,
    `tools needed: ${(handoff.required_tool_capabilities || []).slice(0, 4).join(" | ") || "none"}`,
    `permissions: ${(handoff.required_permissions || []).slice(0, 4).join(" | ") || "none"}`,
    `dry run: ${(handoff.dry_run_first || []).slice(0, 3).join(" | ") || "none"}`,
    `blocked until Tools/Precision MCP: ${(handoff.blocked_until_tools_mcp || []).slice(0, 3).join(" | ") || "none"}`,
    "Core MCP prepares this handoff only; it does not execute the handoff."
  ].join("\n");
}

function formatApiPlan(plan) {
  return [
    `API integration plan: ${plan.task}`,
    ...(plan.selected_api_candidates || []).map((api) => `- ${api.id}: auth=${api.auth_type} https=${api.https} cors=${api.cors} frontend_safe=${api.frontend_safe}`),
    `backend proxy required: ${plan.backend_proxy_requirement}`,
    "Do not expose API keys in frontend code. Core MCP does not call APIs."
  ].join("\n");
}

function formatAgentProfile(profile) {
  return [
    `agent profile: ${profile.profile_id} (${profile.display_name})`,
    `MCP support: ${profile.known_mcp_support_status}`,
    `confidence: ${profile.confidence}`,
    ...(profile.token_efficiency_tips || []).map((item) => `token: ${item}`)
  ].join("\n");
}

function formatComposedContract(contract) {
  return [
    `VNEM capability contract: ${contract.task_summary}`,
    `profile: ${contract.agent_profile_summary?.profile_id}`,
    `modules: ${(contract.required_capability_modules || []).map((module) => module.id).join(", ")}`,
    `missing context: ${(contract.missing_context?.recommended_clarifying_questions || []).slice(0, 2).join("; ") || "none critical"}`,
    `domain contracts: ${(contract.domain_quality_contracts || []).map((item) => item.id).join(", ")}`,
    `verification: ${(contract.verification || []).slice(0, 3).join("; ")}`,
    `proof trail: ${contract.proof_trail_expectation?.tool || "vnem_proof_trail"}`,
    contract.self_focus_policy
  ].join("\n");
}

function formatCompletionAudit(audit) {
  return [
    `VNEM completion audit: ${audit.verdict} (${audit.score}/100)`,
    ...(audit.missing_evidence || []).slice(0, 3).map((item) => `missing evidence: ${item}`),
    ...(audit.unverified_claims || []).slice(0, 2).map((item) => `unverified: ${item}`),
    ...(audit.required_next_actions || []).slice(0, 4).map((item) => `next: ${item}`),
    `anti-placebo: ${audit.anti_placebo_result}`
  ].join("\n");
}

function formatProtectionReview(review) {
  return [
    `VNEM protection review: ${review.verdict} (${review.risk_level})`,
    ...(review.risks || []).slice(0, 4).map((item) => `risk: ${item}`),
    ...(review.required_safeguards || []).slice(0, 3).map((item) => `safeguard: ${item}`),
    review.permission_prompt || "Core MCP reviews only; it does not perform the action."
  ].join("\n");
}

function formatProofTrail(report) {
  return [
    `VNEM proof trail: ${report.proof_trail_id}`,
    `verdict: ${report.final_verdict}`,
    `vnem used: ${report.vnem_used}`,
    `bootstrap: ${report.bootstrap_activation_id || "missing"}`,
    `capabilities: ${(report.capability_ids_used || []).join(", ") || "none provided"}`,
    `evidence: commands=${report.evidence_summary?.commands_run?.length || 0}, tests=${report.evidence_summary?.tests_or_checks?.length || 0}, sources=${report.evidence_summary?.sources_used?.length || 0}, visual=${report.evidence_summary?.visual_evidence?.length || 0}`,
    ...(report.missing_evidence || []).slice(0, 4).map((item) => `missing: ${item}`),
    ...(report.must_not_claim || []).slice(0, 3).map((item) => `must not claim: ${item}`)
  ].join("\n");
}

function formatLibraryStatus(status) {
  return [
    `vnem Super MCP library: ${status.loaded ? "loaded" : "missing"}`,
    `Schema: ${status.schema_version}`,
    `Generated: ${status.generated_at || "unknown"}`,
    `Skills: ${status.skills.count}`,
    `APIs: ${status.apis.count}`,
    `Sources: ${status.source_names.join(", ") || "none"}`,
    "",
    "Safety boundaries:",
    `- installs skills: ${status.safety_boundaries.installs_skills}`,
    `- calls APIs: ${status.safety_boundaries.calls_apis}`,
    `- stores/request secrets: ${status.safety_boundaries.stores_or_requests_secrets}`,
    `- records are VNEM-normalized: ${status.records_are_vnem_normalized}`
  ].join("\n");
}

function formatSkillResults(title, result) {
  const lines = [title, `Matches: ${result.matches?.length || 0}`, ""];
  for (const item of result.matches || []) {
    lines.push(`- ${item.name} (${item.id}) score ${item.score}`);
    lines.push(`  Source: ${item.source_url}`);
    lines.push(`  Task types: ${(item.task_types || []).join(", ")}`);
    lines.push(`  Risks: ${(item.risk_flags || []).join(", ") || "none listed"}`);
    lines.push(`  Review: ${item.review_status}; trust: ${item.trust_level}`);
  }
  if (result.warning) lines.push("", `Warning: ${result.warning}`);
  return lines.join("\n");
}

function formatApiResults(title, result) {
  const lines = [title, `Matches: ${result.matches?.length || 0}`, ""];
  for (const item of result.matches || []) {
    lines.push(`- ${item.name} (${item.id}) score ${item.score}`);
    lines.push(`  ${item.category}; auth=${item.auth_type}; https=${item.https}; cors=${item.cors}; frontend_safe=${item.frontend_safe}; backend_required=${item.backend_required}`);
    lines.push(`  Source: ${item.source_url}`);
    lines.push(`  Risks: ${(item.risk_flags || []).join(", ") || "none listed"}`);
  }
  if (result.warning) lines.push("", `Warning: ${result.warning}`);
  return lines.join("\n");
}

function formatApiSafetyProfile(profile) {
  if (!profile.found) return `No API safety profile found for ${profile.id}. Core MCP did not call any API.`;
  return [
    `API safety profile: ${profile.name}`,
    `verdict: ${profile.verdict}`,
    `auth=${profile.auth_type} https=${profile.https} cors=${profile.cors} frontend_safe=${profile.frontend_safe}`,
    `backend required: ${profile.backend_required}`,
    `docs confidence: ${profile.documentation_confidence}`,
    ...(profile.unknowns || []).slice(0, 4).map((item) => `unknown: ${item}`),
    "Core MCP does not call APIs or request/store secrets."
  ].join("\n");
}

function formatSkillSafetyProfile(profile) {
  if (!profile.found) return `No skill safety profile found for ${profile.id}. Core MCP did not install or execute anything.`;
  return [
    `skill safety profile: ${profile.name}`,
    `source review: ${profile.source_review_status}`,
    `content confidence: ${profile.skill_content_confidence}`,
    `core guidance: ${profile.core_can_apply_guidance}; installs/executes: ${profile.installs_or_executes_skill}`,
    `prompt injection risk: ${profile.prompt_injection_risk}`,
    ...(profile.must_not_claim || []).slice(0, 3).map((item) => `must not claim: ${item}`)
  ].join("\n");
}

function formatCapabilityReview(review) {
  const lines = [`vnem capability review: ${review.name || review.id}`, `Kind: ${review.kind}`, `Verdict: ${review.verdict}`];
  if (review.reasons?.length) lines.push("", "Reasons:", ...review.reasons.map((item) => `- ${item}`));
  if (review.risk_flags?.length) lines.push("", `Risk flags: ${review.risk_flags.join(", ")}`);
  if (review.next_safety_checks?.length) lines.push("", "Next safety checks:", ...review.next_safety_checks.map((item) => `- ${item}`));
  return lines.join("\n");
}

function formatStatus(status) {
  return [
    `vnem status: ${status.version}`,
    `Generated: ${status.generated_at || "unknown"}`,
    `Release: ${status.release_version || "unknown"} (${status.release_date || "unknown date"})`,
    "",
    "Loaded data:",
    `- Registry entries: ${status.counts.registry_entries}`,
    `- Search documents: ${status.counts.search_documents}`,
    `- Intent routes: ${status.counts.intent_routes}`,
    `- Install guide: ${status.counts.install_guide ? "loaded" : "missing"}`,
    `- Quality contract: ${status.counts.quality_contract ? "loaded" : "missing"}`,
    `- Orchestration protocol: ${status.counts.orchestration_protocol ? "loaded" : "missing"}`,
    `- Precision execution protocol: ${status.counts.precision_execution_protocol ? "loaded" : "missing"}`,
    `- Omniscient self-healing protocol: ${status.counts.omniscient_self_healing_protocol ? "loaded" : "missing"}`,
    `- Source-radar entries: ${status.counts.source_radar_entries}`,
    `- Task rubrics: ${status.counts.task_rubrics}`,
    `- Prompt patterns: ${status.counts.prompt_patterns}`,
    "",
    "MCP surface:",
    `- Tools: ${status.mcp.tools.join(", ")}`,
    `- Prompts: ${status.mcp.prompts.join(", ")}`,
    `- Key resources: ${status.mcp.resources.slice(0, 10).join(", ")}${status.mcp.resources.length > 10 ? ", ..." : ""}`,
    "",
    `Safety: ${status.safety.mode}. Installs packages: ${status.safety.installs_packages}. Edits files: ${status.safety.edits_files}. Calls upstream services: ${status.safety.calls_upstream_services}.`
  ].join("\n");
}

function formatOverview(overview) {
  const lines = [`vnem overview (${overview.audience})`, "", overview.one_sentence, "", "Usable surfaces:"];
  for (const surface of overview.surfaces) {
    lines.push(`- ${surface.name}: ${surface.purpose}`);
    lines.push(`  Paths: ${surface.paths.join(", ")}`);
    lines.push(`  Use via: ${surface.usable_via.join(", ")}`);
  }
  lines.push("", "Safe workflow:", ...overview.safe_workflow.map((item) => `- ${item}`));
  lines.push("", "Not yet:", ...overview.what_vnem_is_not_yet.map((item) => `- ${item}`));
  return lines.join("\n");
}

function formatRouteIntent(result) {
  const lines = [`vnem route intent: ${result.intent}`];
  if (result.resolved_intent) {
    lines.push(`Resolved: ${result.resolved_intent.name}`);
  } else {
    lines.push("Resolved: none");
  }
  lines.push(`Mode: ${result.mode}`);
  if (result.route?.compare_options?.length) {
    lines.push(`Compare options: ${result.route.compare_options.join("; ")}`);
  }
  if (result.route?.choose_by?.length) {
    lines.push(`Choose by: ${result.route.choose_by.join("; ")}`);
  }
  if (result.rubrics?.length) {
    lines.push(`Rubrics: ${result.rubrics.map((rubric) => rubric.id).join(", ")}`);
  }
  if (result.route?.read_first?.length) {
    lines.push("", "Route read-first:");
    for (const id of result.route.read_first) {
      lines.push(`- ${id}`);
    }
  }
  if (result.read_first?.length) {
    lines.push("", "Matched documents:");
    for (const doc of result.read_first) {
      lines.push(formatResultLine(doc));
    }
  }
  lines.push("", `Safety: ${result.safety}`);
  return lines.join("\n");
}

function formatSourceDetail(source) {
  const lines = [
    `${source.title} (${source.id})`,
    `${source.category || "source"} / priority: ${source.priority || "unknown"}`,
    "",
    source.summary || "No summary."
  ];
  if (source.use_when?.length) {
    lines.push("", "Use when:", ...source.use_when.map((item) => `- ${item}`));
  }
  if (source.monitor?.length) {
    lines.push("", "Monitor:", ...source.monitor.map((item) => `- ${item}`));
  }
  if (source.risk_checks?.length) {
    lines.push("", "Risk checks:", ...source.risk_checks.map((item) => `- ${item}`));
  }
  if (source.source_urls?.length) {
    lines.push("", "Sources:", ...source.source_urls.map((url) => `- ${url}`));
  }
  return lines.join("\n");
}

function formatSourceLine(source) {
  const parts = [
    `- ${source.title}`,
    `[${source.category || "source"}]`,
    `priority: ${source.priority || "unknown"}`
  ];
  const summary = source.summary ? `\n  ${source.summary}` : "";
  const useWhen = source.use_when?.length ? `\n  Use when: ${source.use_when.slice(0, 2).join("; ")}` : "";
  const risk = source.risk_checks?.length ? `\n  Risk checks: ${source.risk_checks.slice(0, 3).join("; ")}` : "";
  const sources = source.source_urls?.length ? `\n  Sources: ${source.source_urls.slice(0, 4).join(", ")}` : "";
  return `${parts.join(" ")}${summary}${useWhen}${risk}${sources}`;
}

function formatResultLine(result) {
  const parts = [
    `- ${result.name}`,
    `[${result.kind}${result.type ? ` / ${result.type}` : ""}]`,
    `${result.trust_tier || "unknown"}`
  ];
  if (result.slug) {
    parts.push(`slug: ${result.slug}`);
  }
  const line = parts.join(" ");
  const summary = result.summary ? `\n  ${result.summary}` : "";
  const sources = result.source_urls?.length ? `\n  Sources: ${result.source_urls.slice(0, 3).join(", ")}` : "";
  return `${line}${summary}${sources}`;
}

function toolResult(text, structuredContent) {
  return {
    content: [{ type: "text", text }],
    structuredContent
  };
}

function errorResult(text) {
  return {
    isError: true,
    content: [{ type: "text", text }],
    structuredContent: { error: text }
  };
}

function tokenize(value) {
  return [...new Set(normalize(value).split(" ").filter((token) => token.length > 1 && !STOPWORDS.has(token)))];
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9+#._/-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value) {
  return normalize(value).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function compactObject(object) {
  return Object.fromEntries(
    Object.entries(object).filter(([, value]) => {
      if (value === null || value === undefined) return false;
      if (Array.isArray(value) && value.length === 0) return false;
      return true;
    })
  );
}

function arrayStrings(value) {
  if (Array.isArray(value)) return value.filter((item) => item !== null && item !== undefined).map((item) => String(item));
  if (value === null || value === undefined || value === "") return [];
  return [String(value)];
}

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean).map((value) => String(value)))];
}

function countBy(items, getKey) {
  return items.reduce((counts, item) => {
    const key = getKey(item);
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function variableValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function safePath(relativePath) {
  if (!relativePath) {
    return null;
  }
  const resolved = path.resolve(rootDir, relativePath);
  return resolved.startsWith(`${rootDir}${path.sep}`) || resolved === rootDir ? resolved : null;
}

function firstExisting(relativePaths) {
  return relativePaths.find((relativePath) => {
    const fullPath = safePath(relativePath);
    return fullPath && existsSync(fullPath);
  });
}

async function readJsonRequired(relativePath, label) {
  if (!relativePath) {
    throw new Error(`Missing required vnem ${label}. Run npm run generate first.`);
  }
  const data = await readJsonOptional(relativePath);
  if (!data) {
    throw new Error(`Unable to read vnem ${label} at ${relativePath}.`);
  }
  return data;
}

async function readJsonOptional(relativePath) {
  const fullPath = safePath(relativePath);
  if (!fullPath || !existsSync(fullPath)) {
    return null;
  }
  return JSON.parse(await readFile(fullPath, "utf8"));
}
