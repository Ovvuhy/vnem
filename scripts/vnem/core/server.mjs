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

import { createCorePlanningDomains } from "./planning-domains.mjs";
import { createCoreAdoptionRuntime } from "./adoption-runtime.mjs";
import { createCoreBootstrapRuntime } from "./bootstrap-runtime.mjs";

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
  "vnem_usage_self_check",
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

const {
  assessResearchNeed,
  augmentCompletionAuditForPermissions,
  augmentCompletionAuditForResearch,
  buildAntiStagnationCheck,
  buildArchitectureMap,
  buildBrowserResearchPlan,
  buildBrowsingPlan,
  buildCodeChangeContract,
  buildCompactOutputContract,
  buildCoreRoutingRecord,
  buildCoreToolsPlan,
  buildDebuggingPlan,
  buildDesignAmbitionPlan,
  buildDesignDirectionSelector,
  buildEffortBudget,
  buildEvidenceToFixCheck,
  buildFastAnswerContract,
  buildOutputQualityPlan,
  buildRedesignComparisonScorecard,
  buildResearchEvidenceAudit,
  buildResearchStrategy,
  buildSearchPlan,
  buildSourceIngestionPlan,
  buildTotalImpactDesignPlan,
  buildUiQualityPlan,
  buildVisualProofContract,
  buildVisualTasteAudit,
  compactAdaptiveEffort,
  compactCoreToolsPlan,
  compactDesignBehavior,
  compactOutputQualityPlan,
  compactRoutingRecord,
  explainToolsChain,
  formatAntiStagnationCheck,
  formatArchitectureMap,
  formatBrowserResearchPlan,
  formatBrowsingPlan,
  formatCodeChangeContract,
  formatCompactOutputContract,
  formatCoreRoutingRecord,
  formatCoreToolSelection,
  formatCoreToolsPlan,
  formatDebuggingPlan,
  formatDesignAmbitionPlan,
  formatDesignDirectionSelector,
  formatEffortBudget,
  formatEvidenceToFixCheck,
  formatFastAnswerContract,
  formatOutputQualityPlan,
  formatRedesignComparisonScorecard,
  formatResearchEvidenceAudit,
  formatResearchNeedAssessment,
  formatResearchStrategy,
  formatSearchPlan,
  formatSourceIngestionPlan,
  formatToolsChain,
  formatTotalImpactDesignPlan,
  formatUiQualityPlan,
  formatVisualProofContract,
  formatVisualTasteAudit,
  selectToolsForTask
} = createCorePlanningDomains({
  createHash,
  path,
  tokenize,
  normalize,
  uniqueStrings
});

const {
  buildCoreUnderuseDetector,
  buildCoreVisibilityDoctor,
  buildUsageSelfCheck,
  formatCoreUnderuseDetector,
  formatCoreUsageContract,
  formatCoreVisibilityDoctor,
  formatUsageSelfCheck
} = createCoreAdoptionRuntime({
  classifyIntelligentCoreTask,
  recommendIntelligentTools,
  DEFAULT_MCP_TOOLS,
  normalize,
  arrayStrings,
  uniqueStrings
});

const {
  buildBootstrap,
  formatBootstrap
} = createCoreBootstrapRuntime({
  createHash,
  getRequiredCapabilities,
  getAgentProfile,
  detectMissingContext,
  buildDomainQualityContracts,
  buildLibraryStatus,
  searchIndex,
  superLibrary,
  agentProfiles,
  entries,
  searchDocuments,
  relevantPracticeDocs,
  buildStatus,
  buildTaskContract,
  inferTaskMode,
  selectTaskRubrics,
  resolveIntent,
  normalize,
  uniqueStrings
});

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
for (const [implementationModule, toolNames] of [
  ["scripts/vnem/core/bootstrap-runtime.mjs", ["vnem_bootstrap"]],
  ["scripts/vnem/core/adoption-runtime.mjs", ["vnem_mcp_visibility_doctor", "vnem_underuse_detector", "vnem_usage_self_check"]],
  ["scripts/vnem/core/planning-domains.mjs", [
    "vnem_route_task", "vnem_output_quality_plan", "vnem_anti_stagnation_check", "vnem_plan_effort_budget",
    "vnem_fast_answer_contract", "vnem_design_ambition_plan", "vnem_visual_taste_audit", "vnem_redesign_comparison_scorecard",
    "vnem_total_impact_design_plan", "vnem_design_direction_selector", "vnem_compact_output_contract", "vnem_build_debugging_plan",
    "vnem_evidence_to_fix_check", "vnem_build_architecture_map", "vnem_code_change_contract", "vnem_build_ui_quality_plan",
    "vnem_visual_proof_contract", "vnem_select_tools_for_task", "vnem_build_tools_plan", "vnem_build_browser_research_plan",
    "vnem_assess_research_need", "vnem_build_search_plan", "vnem_build_browsing_plan", "vnem_build_research_strategy",
    "vnem_build_source_ingestion_plan", "vnem_research_evidence_audit", "vnem_explain_tools_chain"
  ]]
]) {
  for (const name of toolNames) coreRegistry.annotate(name, { implementation_module: implementationModule });
}
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
          .enum(["auto", "answer_only", "repo_inspection", "implementation", "testing", "ci", "coverage", "benchmarks", "project_automation", "terminal", "debugging", "validation", "publish", "recovery", "research", "documentation", "ui_browser", "patch_targeting", "mcp_tool_audit", "evidence_pack", "no_placebo", "cloudflare", "windows", "package", "api", "skill", "database", "game_modding", "client_setup"])
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
    "vnem_usage_self_check",
    {
      title: "VNEM Usage Self-Check",
      description:
        "Audit VNEM adoption from explicit client configuration, visible tool names, managed instructions, and current-session evidence only; detect useful skipped use and return one exact correction without hidden telemetry.",
      inputSchema: {
        client_name: z.string().default("unknown"),
        configured_mcp_names: z.array(z.string()).max(100).default([]),
        visible_tool_names: z.array(z.string()).max(1000).default([]),
        client_instructions: z.string().max(20000).default(""),
        user_goal: z.string().max(10000).default(""),
        recent_session_actions: z.array(z.string()).max(200).default([]),
        recent_session_evidence: z.array(z.string()).max(200).default([]),
        configuration_observed: z.boolean().default(false),
        tool_list_observed: z.boolean().default(false),
        instructions_observed: z.boolean().default(false),
        session_evidence_observed: z.boolean().default(false)
      },
      annotations: READ_ONLY
    },
    async (args) => {
      const audit = buildUsageSelfCheck(args);
      return toolResult(formatUsageSelfCheck(audit), { usage_self_check: audit });
    }
  );

  mcpServer.registerTool(
    "vnem_install_adoption_guide",
    {
      title: "VNEM Install Adoption Guide",
      description:
        "VNEM Core MCP install adoption guide for connecting both Core and Tools MCP to Codex, Claude, Antigravity-style IDE agents, Hermes, and generic MCP stdio clients without guessing config paths or writing outside the repo.",
      inputSchema: {
        client: z.enum(["codex", "claude", "antigravity", "hermes", "generic"]).default("generic"),
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
