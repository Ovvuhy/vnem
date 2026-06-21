#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const serverPath = path.join(scriptDir, "vnem-mcp-server.mjs");
const packageJson = JSON.parse(await readFile(path.join(rootDir, "package.json"), "utf8"));

const client = new Client(
  {
    name: "vnem-mcp-smoke-test",
    version: packageJson.version
  },
  {
    capabilities: {}
  }
);
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [serverPath],
  cwd: rootDir,
  stderr: "pipe"
});

let stderr = "";
transport.stderr?.on("data", (chunk) => {
  stderr += chunk.toString();
});

try {
  await client.connect(transport);

  const tools = await client.listTools();
  const toolNames = new Set(tools.tools.map((tool) => tool.name));
  for (const name of [
    "vnem_bootstrap",
    "vnem_library_status",
    "vnem_search_skills",
    "vnem_recommend_skills",
    "vnem_search_apis",
    "vnem_recommend_apis",
    "vnem_review_skill_or_api",
    "vnem_get_required_capabilities",
    "vnem_activate_capability_pack",
    "vnem_apply_skill_guidance",
    "vnem_build_api_integration_plan",
    "vnem_get_agent_profile",
    "vnem_compose_capability_contract",
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
  ]) {
    assert.equal(toolNames.has(name), true, `expected MCP tool ${name}`);
  }
  assert.equal(toolNames.has("mcp_apply_diff_patch"), false, "default read-only MCP must not expose precision patch tool");
  assert.equal(toolNames.has("mcp_execute_terminal_command"), false, "default read-only MCP must not expose terminal execution tool");
  assert.equal(toolNames.has("mcp_semantic_code_search"), false, "default read-only MCP must not expose semantic code search tool");
  assert.equal(toolNames.has("mcp_run_verification_tests"), false, "default read-only MCP must not expose verification test execution tool");
  assert.equal(toolNames.has("mcp_execute_ephemeral_script"), false, "default read-only MCP must not expose ephemeral script execution tool");
  for (const tool of tools.tools) {
    assert.equal(tool.annotations?.readOnlyHint, true, `expected ${tool.name} to be annotated read-only`);
    assert.equal(tool.annotations?.destructiveHint, false, `expected ${tool.name} to be annotated non-destructive`);
  }

  const libraryStatus = await client.callTool({
    name: "vnem_library_status",
    arguments: {}
  });
  assert.equal(libraryStatus.isError, undefined);
  assert.ok(libraryStatus.structuredContent?.skills?.count >= 30, "expected nonzero skill capability count");
  assert.ok(libraryStatus.structuredContent?.apis?.count >= 100, "expected nonzero API capability count");
  assert.equal(libraryStatus.structuredContent?.safety_boundaries?.installs_skills, false);
  assert.equal(libraryStatus.structuredContent?.safety_boundaries?.calls_apis, false);
  assert.equal(libraryStatus.structuredContent?.records_are_vnem_normalized, true);

  const skillSearch = await client.callTool({
    name: "vnem_search_skills",
    arguments: { query: "react next", agent_client: "codex", limit: 8 }
  });
  assert.equal(skillSearch.isError, undefined);
  assert.ok(skillSearch.structuredContent?.matches?.length > 0, "expected skill search matches");
  assert.ok(skillSearch.structuredContent.matches.some((match) => /react|next/i.test(`${match.name} ${match.description} ${match.task_types?.join(" ")}`)), "expected React/Next skill match");
  assert.ok(skillSearch.structuredContent.matches.every((match) => match.source && match.source_url && match.imported_from), "skill matches need provenance");
  assert.ok(skillSearch.structuredContent.matches.every((match) => Array.isArray(match.compatible_with) && Array.isArray(match.avoid_with)), "skill matches need compatibility fields");
  assert.ok(skillSearch.structuredContent.warning.includes("review"));

  const skillRecommendation = await client.callTool({
    name: "vnem_recommend_skills",
    arguments: { task: "Improve a Next.js website UI", agent_client: "codex", risk_tolerance: "low", limit: 6 }
  });
  assert.equal(skillRecommendation.isError, undefined);
  assert.ok(skillRecommendation.structuredContent?.recommendations?.length > 0, "expected skill recommendations");
  assert.ok(skillRecommendation.structuredContent.recommendations.some((item) => item.task_types.includes("frontend_ui") || item.task_types.includes("website_ui")), "expected UI/frontend skill recommendation");
  assert.ok(skillRecommendation.structuredContent.recommendations.every((item) => item.when_to_use?.length && item.when_not_to_use?.length), "skill recommendations need use/avoid guidance");
  assert.ok(skillRecommendation.structuredContent.recommendations.every((item) => item.manual_review_required === true), "skill recommendations should require review before install/use");
  assert.ok(skillRecommendation.structuredContent.recommendations.every((item) => item.risk_flags?.includes("prompt_injection_surface")), "external skills should be prompt-injection surfaces");
  assert.ok(skillRecommendation.structuredContent.warning.includes("Do not install"));

  const apiSearch = await client.callTool({
    name: "vnem_search_apis",
    arguments: { query: "weather", require_https: true, limit: 8 }
  });
  assert.equal(apiSearch.isError, undefined);
  assert.ok(apiSearch.structuredContent?.matches?.length > 0, "expected API search matches");
  assert.ok(apiSearch.structuredContent.matches.some((match) => /weather/i.test(`${match.name} ${match.category} ${match.description}`)), "expected weather API match");
  assert.ok(apiSearch.structuredContent.matches.every((match) => match.auth_type && match.https && match.cors && match.source_url && match.imported_from), "API matches need auth/HTTPS/CORS/provenance");

  const apiRecommendation = await client.callTool({
    name: "vnem_recommend_apis",
    arguments: { task: "Add a weather API integration", app_type: "frontend", frontend_only: true, allow_api_keys: false, allow_oauth: false, risk_tolerance: "low", limit: 8 }
  });
  assert.equal(apiRecommendation.isError, undefined);
  assert.ok(apiRecommendation.structuredContent?.recommendations?.length > 0, "expected API recommendations");
  assert.ok(apiRecommendation.structuredContent.recommendations.every((item) => item.frontend_safe !== true || item.secret_risk === false), "frontend-safe API recommendations must not have secret risk");
  assert.ok(apiRecommendation.structuredContent.recommendations.every((item) => !(item.secret_risk && item.frontend_safety_decision === "frontend_safe")), "secret-bearing APIs cannot be marked frontend-safe");
  assert.ok(apiRecommendation.structuredContent.recommendations.some((item) => item.risk_flags.includes("cors_unknown") || item.risk_flags.includes("cors_no") || item.risk_flags.includes("https_no") || item.frontend_safe === true), "expected CORS/HTTPS risk flag or safe browser candidate");
  assert.ok(apiRecommendation.structuredContent.warning.includes("Do not expose API keys in frontend code"));

  const financeApis = await client.callTool({
    name: "vnem_search_apis",
    arguments: { query: "finance", include_secret_risk: true, require_https: false, limit: 12 }
  });
  assert.equal(financeApis.isError, undefined);
  assert.ok(financeApis.structuredContent.matches.some((match) => /finance|currency|exchange/i.test(`${match.name} ${match.category} ${match.description}`)), "expected finance/currency API match");
  assert.ok(financeApis.structuredContent.matches.some((match) => match.risk_flags.includes("cors_unknown") || match.risk_flags.includes("cors_no") || match.risk_flags.includes("https_no") || match.risk_flags.includes("api_key_required") || match.risk_flags.includes("oauth_required")), "expected API risk flags");

  const reviewedApi = await client.callTool({
    name: "vnem_review_skill_or_api",
    arguments: { id: apiRecommendation.structuredContent.recommendations[0].id, kind: "api", task: "Add a weather API integration", frontend_only: true, risk_tolerance: "low" }
  });
  assert.equal(reviewedApi.isError, undefined);
  assert.ok(["allow_metadata_reference", "needs_review", "avoid", "unknown"].includes(reviewedApi.structuredContent?.verdict));
  assert.ok(reviewedApi.structuredContent?.reasons?.length > 0);
  assert.ok(reviewedApi.structuredContent?.next_safety_checks?.length > 0);

  const reviewedSkill = await client.callTool({
    name: "vnem_review_skill_or_api",
    arguments: { id: skillRecommendation.structuredContent.recommendations[0].id, kind: "skill", task: "Improve a Next.js website UI", risk_tolerance: "low" }
  });
  assert.equal(reviewedSkill.isError, undefined);
  assert.ok(reviewedSkill.structuredContent?.risk_flags?.includes("prompt_injection_surface"));
  assert.ok(reviewedSkill.structuredContent?.next_safety_checks?.some((item) => item.includes("SKILL.md")));

  const requiredCaps = await client.callTool({
    name: "vnem_get_required_capabilities",
    arguments: { task: "Improve a Next.js website UI", agent_client: "codex", model_family: "gpt", max_modules: 4, token_budget: "compact" }
  });
  assert.equal(requiredCaps.isError, undefined);
  assert.ok(requiredCaps.structuredContent?.required_modules?.length > 0, "expected required capability modules");
  assert.ok(requiredCaps.structuredContent.required_modules.length <= 4, "required capabilities must respect max_modules");
  assert.ok(JSON.stringify(requiredCaps.structuredContent).length < 9000, "compact required capabilities output should stay small");
  assert.ok(requiredCaps.structuredContent.required_modules.some((module) => /ui|frontend|visual|accessibility|test/i.test(`${module.id} ${module.name} ${module.task_types?.join(" ")} ${module.compact_instructions?.join(" ")}`)), "UI tasks need UI/frontend/visual/accessibility/testing modules");
  assert.ok(requiredCaps.structuredContent.required_modules.every((module) => module.compact_instructions?.length && module.required_evidence?.length), "modules need compact instructions and evidence");
  assert.ok(requiredCaps.structuredContent.self_focus_policy.includes("user task"), "non-VNEM tasks must stay focused on the user's task");

  const capabilityPack = await client.callTool({
    name: "vnem_activate_capability_pack",
    arguments: { task: "Improve a Next.js website UI", agent_client: "codex", risk_tolerance: "low", token_budget: "compact" }
  });
  assert.equal(capabilityPack.isError, undefined);
  assert.ok(capabilityPack.structuredContent?.activation_id?.startsWith("vnem-cap-"));
  assert.ok(capabilityPack.structuredContent?.compact_required_instructions?.length > 0, "activation pack needs compact instructions");
  assert.ok(capabilityPack.structuredContent?.if_skipped_mark_incomplete?.length > 0, "activation pack must fail completion if modules are skipped");
  assert.ok(capabilityPack.structuredContent?.usage_proof_fields?.includes("capability_ids_used"));
  assert.equal(capabilityPack.structuredContent?.safety_boundaries?.core_mcp_installs_skills, false);

  const skillGuidance = await client.callTool({
    name: "vnem_apply_skill_guidance",
    arguments: { skill_id: skillRecommendation.structuredContent.recommendations[0].id, task: "Improve a Next.js website UI", agent_client: "codex", token_budget: "compact" }
  });
  assert.equal(skillGuidance.isError, undefined);
  assert.equal(skillGuidance.structuredContent?.core_mcp_can_apply_guidance, true);
  assert.equal(skillGuidance.structuredContent?.precision_tools_required_for_install_or_execution, true);
  assert.ok(skillGuidance.structuredContent?.compact_applicable_instructions?.length > 0, "skill guidance should apply compact instructions");
  assert.ok(skillGuidance.structuredContent?.manual_review_warning?.includes("does not install"));

  const apiPlan = await client.callTool({
    name: "vnem_build_api_integration_plan",
    arguments: { task: "Add a weather API integration", app_type: "frontend", frontend_only: true, allow_api_keys: false, allow_oauth: false, token_budget: "compact" }
  });
  assert.equal(apiPlan.isError, undefined);
  assert.ok(apiPlan.structuredContent?.selected_api_candidates?.length > 0, "API plan needs selected candidates");
  assert.ok(apiPlan.structuredContent.selected_api_candidates.every((api) => api.auth_type && api.https && api.cors), "API plan candidates need auth/HTTPS/CORS");
  assert.ok(apiPlan.structuredContent?.secret_handling_rules?.some((rule) => rule.includes("Do not expose API keys in frontend code")));
  assert.equal(apiPlan.structuredContent?.core_mcp_calls_api, false);
  assert.ok(apiPlan.structuredContent?.test_plan?.length > 0 && apiPlan.structuredContent?.evidence_requirements?.length > 0);

  const codexProfile = await client.callTool({
    name: "vnem_get_agent_profile",
    arguments: { agent_client: "codex", model_family: "gpt", task: "Improve a Next.js website UI", token_budget: "compact" }
  });
  assert.equal(codexProfile.isError, undefined);
  assert.equal(codexProfile.structuredContent?.profile_id, "codex");
  assert.notEqual(codexProfile.structuredContent?.profile_id, "claude");
  assert.ok(JSON.stringify(codexProfile.structuredContent).length < 5000, "profile output should stay compact");

  const claudeProfile = await client.callTool({
    name: "vnem_get_agent_profile",
    arguments: { agent_client: "claude", token_budget: "compact" }
  });
  assert.equal(claudeProfile.isError, undefined);
  assert.equal(claudeProfile.structuredContent?.profile_id, "claude");
  assert.notEqual(claudeProfile.structuredContent?.profile_id, "codex");

  const unknownProfile = await client.callTool({
    name: "vnem_get_agent_profile",
    arguments: { agent_client: "unknown-new-client", token_budget: "compact" }
  });
  assert.equal(unknownProfile.isError, undefined);
  assert.equal(unknownProfile.structuredContent?.profile_id, "unknown");
  assert.ok(unknownProfile.structuredContent?.confidence === "low" || unknownProfile.structuredContent?.known_mcp_support_status === "unknown");

  const composedContract = await client.callTool({
    name: "vnem_compose_capability_contract",
    arguments: { task: "Build a recipe app for a friend", agent_client: "codex", project_context: "Small Next.js side app", token_budget: "compact", max_modules: 5 }
  });
  assert.equal(composedContract.isError, undefined);
  assert.ok(composedContract.structuredContent?.required_capability_modules?.length > 0);
  assert.ok(composedContract.structuredContent.required_capability_modules.length <= 5);
  assert.ok(composedContract.structuredContent?.self_focus_policy?.includes("not improve VNEM"), "non-VNEM tasks must not redirect into VNEM self-improvement");
  assert.ok(composedContract.structuredContent?.final_report_requirements?.length > 0);
  assert.ok(JSON.stringify(composedContract.structuredContent).length < 12000, "compact composed contract should stay small");
  assert.notEqual(composedContract.structuredContent?.library_dump_count, 80, "contract must not dump all skills");
  assert.notEqual(composedContract.structuredContent?.api_dump_count, 700, "contract must not dump all APIs");

  const limitedSkillSearch = await client.callTool({
    name: "vnem_search_skills",
    arguments: { query: "react", limit: 2 }
  });
  assert.equal(limitedSkillSearch.structuredContent.matches.length <= 2, true, "skill search must respect limit");

  const limitedApiSearch = await client.callTool({
    name: "vnem_search_apis",
    arguments: { query: "weather", limit: 2 }
  });
  assert.equal(limitedApiSearch.structuredContent.matches.length <= 2, true, "API search must respect limit");

  const reviewSkillId = skillRecommendation.structuredContent.recommendations[0].id;

  const habitBootstrap = await client.callTool({
    name: "vnem_bootstrap",
    arguments: {
      task: "Build a private habit tracker app",
      agent_client: "codex",
      project_context: "New private/internal web app with user data.",
      available_tools: ["terminal", "browser"],
      risk_tolerance: "low",
      desired_output: "working private app",
      include_resources: true,
      include_next_calls: true
    }
  });
  assert.equal(habitBootstrap.isError, undefined);
  assert.equal(habitBootstrap.structuredContent?.activation?.status, "active");
  assert.equal(habitBootstrap.structuredContent?.activation?.tool, "vnem_bootstrap");
  assert.equal(habitBootstrap.structuredContent?.activation?.read_only, true);
  assert.equal(habitBootstrap.structuredContent?.activation?.precision_tools_exposed, false);
  assert.ok(habitBootstrap.structuredContent?.activation?.activation_id, "expected activation proof token");
  assert.equal(habitBootstrap.structuredContent?.activation?.vnem_version, packageJson.version);
  assert.ok(habitBootstrap.structuredContent?.repo_or_core_status?.registry_entry_count >= 200);
  assert.ok(habitBootstrap.structuredContent?.repo_or_core_status?.available_mcp_tool_count >= 13);
  assert.equal(habitBootstrap.structuredContent?.capability_slots?.mcp_registry_available, true);
  assert.equal(habitBootstrap.structuredContent?.capability_slots?.skill_recommendations_available, true);
  assert.equal(habitBootstrap.structuredContent?.capability_slots?.api_registry_available, true);
  assert.ok(habitBootstrap.structuredContent?.capability_slots?.skill_entry_count >= 30);
  assert.ok(habitBootstrap.structuredContent?.capability_slots?.api_entry_count >= 100);
  assert.ok(habitBootstrap.structuredContent?.recommended_vnem_calls?.some((call) => call.tool === "vnem_library_status"));
  assert.ok(habitBootstrap.structuredContent?.recommended_vnem_calls?.some((call) => call.tool === "vnem_compose_capability_contract"), "bootstrap should recommend composing a compact capability contract");
  assert.ok(habitBootstrap.structuredContent?.compact_startup_contract?.required_capability_module_count > 0, "bootstrap should include a compact startup capability count");
  assert.ok(JSON.stringify(habitBootstrap.structuredContent).length < 25000, "bootstrap output should stay compact enough for normal task startup");
  assert.notEqual(habitBootstrap.structuredContent?.compact_startup_contract?.required_capability_module_count, 80, "bootstrap must not dump all skills as required modules");
  assert.notEqual(habitBootstrap.structuredContent?.compact_startup_contract?.required_capability_module_count, 700, "bootstrap must not dump all APIs as required modules");
  assert.ok(habitBootstrap.structuredContent?.capability_slots?.future_skill_fields_reserved?.includes("supported_agents"));
  assert.ok(habitBootstrap.structuredContent?.capability_slots?.future_api_fields_reserved?.includes("auth_type"));
  assert.ok(habitBootstrap.structuredContent?.task_analysis?.primary_task_type?.includes("app"));
  assert.ok(habitBootstrap.structuredContent?.task_analysis?.secondary_task_types?.includes("private_internal_tool"));
  assert.ok(habitBootstrap.structuredContent?.protection_needs?.human_approval_requirements?.length > 0);
  assert.ok(habitBootstrap.structuredContent?.verification_contract?.evidence_required?.length > 0);
  assert.ok(habitBootstrap.structuredContent?.completion_audit_expectations?.commands_run);
  assert.ok(habitBootstrap.structuredContent?.anti_placebo_checks?.how_this_task_could_be_faked?.length > 0);
  assert.ok(habitBootstrap.structuredContent?.recommended_vnem_calls?.some((call) => call.tool === "vnem_route_intent"));
  assert.ok(habitBootstrap.structuredContent?.recommended_vnem_calls?.some((call) => call.tool === "vnem_quality_gate"));
  assert.ok(habitBootstrap.structuredContent?.required_rules?.some((rule) => rule.resource_uri === "vnem://install/operating-protocol"));
  assert.ok(habitBootstrap.structuredContent?.required_rules?.some((rule) => rule.resource_uri === "vnem://install/quality-contract"));

  const uiBootstrap = await bootstrap("Improve a Next.js website UI");
  assert.equal(uiBootstrap.task_analysis.primary_task_type, "website_ui");
  assert.ok(uiBootstrap.task_analysis.secondary_task_types.includes("frontend_ui"));
  assert.ok(uiBootstrap.recommended_vnem_calls.some((call) => call.tool === "vnem_recommend_skills"));
  assert.ok(uiBootstrap.recommended_vnem_calls.some((call) => call.tool === "vnem_search_skills"));
  assert.equal(uiBootstrap.verification_contract.ui_visual_evidence_required, true);
  assert.ok(uiBootstrap.verification_contract.evidence_required.some((item) => item.includes("desktop")));
  assert.equal(uiBootstrap.protection_needs.modding_compatibility_required, false);

  const apiBootstrap = await bootstrap("Add a weather API integration");
  assert.equal(apiBootstrap.task_analysis.primary_task_type, "api_integration");
  assert.equal(apiBootstrap.capability_slots.api_registry_available, true);
  assert.ok(apiBootstrap.recommended_vnem_calls.some((call) => call.tool === "vnem_recommend_apis"));
  assert.ok(apiBootstrap.recommended_vnem_calls.some((call) => call.tool === "vnem_search_apis"));
  assert.ok(apiBootstrap.recommended_vnem_calls.some((call) => call.tool === "vnem_review_skill_or_api"));
  assert.ok(apiBootstrap.protection_needs.secret_api_key_risk);
  assert.ok(apiBootstrap.protection_needs.frontend_backend_safety_warnings.some((warning) => warning.includes("Do not expose API keys in frontend code")));
  assert.ok(apiBootstrap.protection_needs.api_safety_warnings.some((warning) => warning.includes("CORS")));

  const debugBootstrap = await bootstrap("Debug a broken project");
  assert.equal(debugBootstrap.task_analysis.primary_task_type, "debugging");
  assert.ok(debugBootstrap.verification_contract.evidence_required.some((item) => item.includes("reproduce")));
  assert.ok(debugBootstrap.anti_placebo_checks.claims_not_to_make_without_proof.some((claim) => claim.includes("root cause")));

  const moddingBootstrap = await bootstrap("Improve an Elden Ring modding workflow");
  assert.equal(moddingBootstrap.task_analysis.primary_task_type, "game_modding_workflow");
  assert.equal(moddingBootstrap.protection_needs.modding_compatibility_required, true);
  assert.ok(moddingBootstrap.protection_needs.modding_safety_warnings.some((warning) => warning.includes("backup")));
  assert.ok(moddingBootstrap.verification_contract.evidence_required.some((item) => item.includes("local game/modding test")));

  const promptBootstrap = await bootstrap("Improve a prompt for a coding AI");
  assert.equal(promptBootstrap.task_analysis.primary_task_type, "prompt_improvement");
  assert.ok(promptBootstrap.verification_contract.evidence_required.some((item) => item.includes("before/after prompt")));
  assert.ok(promptBootstrap.protection_needs.human_approval_requirements.some((item) => item.includes("Do not edit code")));

  const status = await client.callTool({
    name: "vnem_status",
    arguments: {}
  });
  assert.equal(status.isError, undefined);
  assert.equal(status.structuredContent?.safety?.installs_packages, false);
  assert.ok(status.structuredContent?.counts?.registry_entries >= 200, "expected vnem_status registry count");
  assert.ok(status.structuredContent?.mcp?.tools?.includes("vnem_bootstrap"), "expected vnem_status to list bootstrap tool");
  assert.ok(status.structuredContent?.mcp?.tools?.includes("vnem_route_intent"), "expected vnem_status to list route tool");
  assert.ok(status.structuredContent?.mcp?.tools?.includes("vnem_quality_gate"), "expected vnem_status to list quality gate tool");
  assert.ok(status.structuredContent?.mcp?.tools?.includes("vnem_orchestrate"), "expected vnem_status to list orchestration tool");
  assert.equal(status.structuredContent?.counts?.install_guide, true, "expected vnem_status install guide count");
  assert.equal(status.structuredContent?.counts?.quality_contract, true, "expected vnem_status quality contract count");
  assert.equal(status.structuredContent?.counts?.orchestration_protocol, true, "expected vnem_status orchestration protocol count");
  assert.equal(status.structuredContent?.counts?.precision_execution_protocol, true, "expected vnem_status precision execution protocol count");
  assert.equal(status.structuredContent?.counts?.omniscient_self_healing_protocol, true, "expected vnem_status omniscient self-healing protocol count");
  assert.ok(
    status.structuredContent?.mcp?.resources?.includes("vnem://install/coding-protocol"),
    "expected vnem_status to list coding protocol resource"
  );
  assert.ok(
    status.structuredContent?.mcp?.resources?.includes("vnem://install/install-guide"),
    "expected vnem_status to list install guide resource"
  );
  assert.ok(
    status.structuredContent?.mcp?.resources?.includes("vnem://install/quality-contract"),
    "expected vnem_status to list quality contract resource"
  );
  assert.ok(
    status.structuredContent?.mcp?.resources?.includes("vnem://install/orchestration-protocol"),
    "expected vnem_status to list orchestration protocol resource"
  );
  assert.ok(
    status.structuredContent?.mcp?.resources?.includes("vnem://install/precision-execution-protocol"),
    "expected vnem_status to list precision execution protocol resource"
  );
  assert.ok(
    status.structuredContent?.mcp?.resources?.includes("vnem://install/omniscient-self-healing-protocol"),
    "expected vnem_status to list omniscient self-healing protocol resource"
  );
  assert.ok(
    status.structuredContent?.mcp?.resources?.includes("vnem://install/coding-playbooks"),
    "expected vnem_status to list coding playbooks resource"
  );
  assert.ok(status.structuredContent?.counts?.coding_playbooks >= 9, "expected vnem_status coding playbook count");

  const overview = await client.callTool({
    name: "vnem_overview",
    arguments: {
      audience: "newcomer"
    }
  });
  assert.equal(overview.isError, undefined);
  assert.ok(
    overview.structuredContent?.surfaces?.some((surface) => surface.name === "MCP server"),
    "expected vnem_overview MCP server surface"
  );

  const routedIntent = await client.callTool({
    name: "vnem_route_intent",
    arguments: {
      intent: "tool pinning",
      include_matches: true
    }
  });
  assert.equal(routedIntent.isError, undefined);
  assert.equal(routedIntent.structuredContent?.resolved_intent?.name, "tool pinning");
  assert.ok(routedIntent.structuredContent?.route?.read_first?.length > 0, "expected routed intent read-first list");
  assert.ok(routedIntent.structuredContent?.rubrics?.length > 0, "expected routed intent rubrics");

  const sourceDetail = await client.callTool({
    name: "vnem_get_source",
    arguments: {
      id: "mcp-core-and-registry"
    }
  });
  assert.equal(sourceDetail.isError, undefined);
  assert.equal(sourceDetail.structuredContent?.id, "mcp-core-and-registry");
  assert.ok(sourceDetail.structuredContent?.source_urls?.length > 0, "expected source detail URLs");

  const search = await client.callTool({
    name: "vnem_search",
    arguments: {
      query: "mcp servers",
      limit: 3
    }
  });
  assert.equal(search.isError, undefined);
  assert.ok(search.structuredContent?.results?.length > 0, "expected vnem_search results");

  const recommendation = await client.callTool({
    name: "vnem_recommend",
    arguments: {
      task: "Choose MCP tooling for GitHub pull request triage with least-privilege permissions.",
      limit: 4
    }
  });
  assert.equal(recommendation.isError, undefined);
  assert.ok(
    recommendation.structuredContent?.registry_entries?.length > 0,
    "expected vnem_recommend registry entries"
  );
  assert.equal(recommendation.structuredContent?.task_contract?.mode, "decision");
  assert.ok(
    recommendation.structuredContent?.task_contract?.rubric?.some((rubric) => rubric.id === "agent_tooling"),
    "expected vnem_recommend task contract with agent_tooling rubric"
  );
  assert.ok(
    recommendation.structuredContent?.task_contract?.approval_gates?.length > 0,
    "expected vnem_recommend approval gates"
  );
  assert.ok(
    recommendation.structuredContent?.task_contract?.verification?.length > 0,
    "expected vnem_recommend verification checklist"
  );

  const aestheticRecommendation = await client.callTool({
    name: "vnem_recommend",
    arguments: {
      task: "Build a polished neon browser Snake game with action-anchored reward feedback and restrained sound design.",
      limit: 4
    }
  });
  const aestheticContract = aestheticRecommendation.structuredContent?.task_contract;
  assert.equal(aestheticRecommendation.isError, undefined);
  assert.ok(
    aestheticContract?.rubric?.some((rubric) => rubric.id === "aesthetic_experience"),
    "expected vnem_recommend task contract with aesthetic_experience rubric"
  );
  assert.equal(aestheticContract?.perception_gate?.required, true, "expected aesthetic work to require the perception gate");
  assert.ok(
    aestheticContract?.perception_gate?.ship_blockers?.includes("ugly or generic first screen"),
    "expected aesthetic work to include ship blockers"
  );
  assert.ok(
    aestheticContract?.perception_gate?.design_system_expectations?.length > 0,
    "expected aesthetic work to include design-system expectations"
  );
  assert.ok(
    aestheticContract?.perception_gate?.visual_verification?.includes("inspect or capture a desktop screenshot"),
    "expected aesthetic work to include visual verification"
  );
  assert.ok(
    aestheticContract?.perception_gate?.repo_sensing?.some((item) => item.includes("design tokens")),
    "expected aesthetic work to include repo-sensing checklist"
  );
  assert.ok(
    aestheticContract?.read_first?.includes("practice:visual-experience"),
    "expected aesthetic work to read visual-experience guidance first"
  );
  assert.ok(
    aestheticContract?.read_first?.includes("visual-qa-protocol:vnem-visual-qa-protocol"),
    "expected aesthetic work to read visual QA protocol guidance"
  );
  assert.ok(
    aestheticContract?.read_first?.includes("design-architecture:vnem-design-architecture"),
    "expected aesthetic work to read design architecture guidance"
  );
  assert.ok(
    aestheticContract?.coding_playbook?.id === "web-app-rendered-quality" ||
      aestheticContract?.read_first?.includes("coding-playbook:web-app-rendered-quality"),
    "expected aesthetic web/game build work to include rendered-quality coding playbook"
  );
  assert.equal(aestheticContract?.quality_gate?.verdict, "pass", "expected aesthetic work to include a passing quality gate");
  assert.ok(
    aestheticContract?.quality_gate?.detected_domains?.includes("visual"),
    "expected aesthetic work to detect the visual quality domain"
  );
  assert.ok(
    aestheticContract?.quality_gate?.detected_domains?.includes("playability"),
    "expected aesthetic browser game work to detect playability"
  );
  assert.ok(
    aestheticContract?.quality_gate?.triple_check?.map((item) => item.step).join(" ") === "Analyze Architect Review",
    "expected aesthetic work to include the Triple-Check Workflow"
  );
  assert.equal(
    aestheticContract?.orchestration?.pattern,
    "orchestrator_worker",
    "expected polished browser game work to select orchestrator-worker orchestration"
  );
  assert.equal(
    aestheticContract?.orchestration?.workflow,
    "Magentic Coding Workflow",
    "expected polished browser game work to use the Magentic Coding Workflow"
  );
  assert.ok(
    aestheticContract?.orchestration?.worker_roles?.includes("ui_agent") &&
      aestheticContract?.orchestration?.worker_roles?.includes("logic_agent") &&
      aestheticContract?.orchestration?.worker_roles?.includes("qa_agent"),
    "expected polished browser game orchestration to include UI, logic, and QA workers"
  );
  assert.ok(
    aestheticContract?.precision_execution?.tools?.includes("mcp_apply_diff_patch"),
    "expected polished browser game recommendation to include opt-in precision patching guidance"
  );
  assert.ok(
    aestheticContract?.omniscient_self_healing?.tools?.includes("mcp_semantic_code_search"),
    "expected polished browser game recommendation to include opt-in semantic code search guidance"
  );
  assert.ok(
    aestheticContract?.omniscient_self_healing?.tools?.includes("mcp_run_verification_tests"),
    "expected polished browser game recommendation to include opt-in verification test guidance"
  );
  assert.ok(
    aestheticContract?.read_first?.includes("precision-execution-protocol:vnem-precision-execution-protocol"),
    "expected polished browser game read-first to include precision execution protocol"
  );
  assert.ok(
    aestheticContract?.read_first?.includes("omniscient-self-healing-protocol:vnem-omniscient-self-healing-protocol"),
    "expected polished browser game read-first to include omniscient self-healing protocol"
  );
  assert.ok(
    aestheticContract?.read_first?.includes("quality-contract:vnem-quality-contract"),
    "expected aesthetic work to read the quality contract first"
  );

  const nonVisualRecommendation = await client.callTool({
    name: "vnem_recommend",
    arguments: {
      task: "Simplify duplicate JavaScript helper functions without changing behavior.",
      limit: 4
    }
  });
  assert.equal(nonVisualRecommendation.isError, undefined);
  assert.ok(
    nonVisualRecommendation.structuredContent?.task_contract?.coding_playbook?.id === "refactor-preserve",
    "expected code simplification to select the refactor-preserve coding playbook"
  );
  assert.equal(
    nonVisualRecommendation.structuredContent?.task_contract?.perception_gate,
    undefined,
    "expected non-visual work to avoid noisy design guidance"
  );
  const nonVisualQualityGate = nonVisualRecommendation.structuredContent?.task_contract?.quality_gate;
  assert.ok(nonVisualQualityGate, "expected non-visual coding work to still include a quality gate");
  assert.equal(
    nonVisualQualityGate.detected_domains?.includes("visual"),
    false,
    "expected non-visual work to avoid noisy visual quality requirements"
  );
  assert.equal(
    nonVisualQualityGate.detected_domains?.includes("playability"),
    false,
    "expected non-visual work to avoid noisy playability requirements"
  );

  const riskyQualityGate = await client.callTool({
    name: "vnem_quality_gate",
    arguments: {
      task: "Build a polished browser game and make it run faster.",
      proposed_approach: "Make it faster by removing animations and visual effects, ignore mobile, and skip browser screenshots."
    }
  });
  assert.equal(riskyQualityGate.isError, undefined);
  assert.equal(
    riskyQualityGate.structuredContent?.quality_gate?.verdict,
    "needs_revision",
    "expected risky performance/visual trade-off to need revision"
  );
  assert.ok(
    riskyQualityGate.structuredContent?.quality_gate?.detected_domains?.includes("performance"),
    "expected risky quality gate to detect performance"
  );
  assert.ok(
    riskyQualityGate.structuredContent?.quality_gate?.detected_domains?.includes("visual"),
    "expected risky quality gate to detect visual work"
  );
  assert.ok(
    riskyQualityGate.structuredContent?.quality_gate?.detected_domains?.includes("playability"),
    "expected risky quality gate to detect playability"
  );
  assert.ok(
    riskyQualityGate.structuredContent?.quality_gate?.tradeoff_warnings?.some((warning) =>
      warning.alternative.includes("settings toggles")
    ),
    "expected risky quality gate to suggest settings/profile alternatives"
  );
  assert.ok(
    riskyQualityGate.structuredContent?.quality_gate?.required_read_first?.includes("quality-contract:vnem-quality-contract"),
    "expected risky quality gate to require the quality contract"
  );

  const quietQualityGate = await client.callTool({
    name: "vnem_quality_gate",
    arguments: {
      task: "Refactor duplicate JavaScript helper functions without changing behavior.",
      proposed_approach: "Extract a shared helper, preserve call sites, and run focused tests."
    }
  });
  assert.equal(quietQualityGate.isError, undefined);
  assert.equal(quietQualityGate.structuredContent?.quality_gate?.verdict, "pass");
  assert.equal(
    quietQualityGate.structuredContent?.quality_gate?.detected_domains?.includes("visual"),
    false,
    "expected non-visual quality gate to avoid visual requirements"
  );

  const simpleOrchestration = await client.callTool({
    name: "vnem_orchestrate",
    arguments: {
      task: "What is MCP?"
    }
  });
  assert.equal(simpleOrchestration.isError, undefined);
  assert.equal(simpleOrchestration.structuredContent?.route?.pattern, "single_agent");
  assert.equal(simpleOrchestration.structuredContent?.reflection_loop?.enabled, false);

  const gameOrchestration = await client.callTool({
    name: "vnem_orchestrate",
    arguments: {
      task: "Build a polished browser game with settings GUI, responsive controls, reward feedback, and browser verification.",
      max_workers: 6
    }
  });
  assert.equal(gameOrchestration.isError, undefined);
  assert.equal(gameOrchestration.structuredContent?.route?.pattern, "orchestrator_worker");
  assert.equal(gameOrchestration.structuredContent?.workflow?.name, "Magentic Coding Workflow");
  assert.equal(gameOrchestration.structuredContent?.workflow?.project_type, "web_game");
  assert.ok(gameOrchestration.structuredContent?.workflow?.agents?.some((agent) => agent.role === "lead_architect"));
  assert.ok(gameOrchestration.structuredContent?.workflow?.agents?.some((agent) => agent.role === "ui_agent"));
  assert.ok(gameOrchestration.structuredContent?.workflow?.agents?.some((agent) => agent.role === "logic_agent"));
  assert.ok(gameOrchestration.structuredContent?.workflow?.agents?.some((agent) => agent.role === "qa_agent"));
  assert.ok(gameOrchestration.structuredContent?.schemas?.architect_task_list, "expected architect JSON schema");
  assert.ok(gameOrchestration.structuredContent?.shared_state?.tasks?.length >= 5, "expected shared-state task graph");

  const researchOrchestration = await client.callTool({
    name: "vnem_orchestrate",
    arguments: {
      task: "Deep research the current MCP gateway landscape, compare official sources, and synthesize risks.",
      max_workers: 4
    }
  });
  assert.equal(researchOrchestration.isError, undefined);
  assert.equal(researchOrchestration.structuredContent?.route?.pattern, "split_and_merge");
  assert.equal(researchOrchestration.structuredContent?.workflow?.name, "Split-and-Merge Research Workflow");
  assert.ok(researchOrchestration.structuredContent?.workflow?.tasks?.some((task) => task.role === "source_verifier"));

  const entry = await client.callTool({
    name: "vnem_get_entry",
    arguments: {
      slug: "model-context-protocol"
    }
  });
  assert.equal(entry.isError, undefined);
  assert.equal(entry.structuredContent?.slug, "model-context-protocol");

  const sources = await client.callTool({
    name: "vnem_sources",
    arguments: {
      intent: "source radar for MCP registry and coding agents",
      limit: 3
    }
  });
  assert.equal(sources.isError, undefined);
  assert.ok(sources.structuredContent?.sources?.length > 0, "expected vnem_sources results");

  const resources = await client.listResources();
  assert.ok(
    resources.resources.some((resource) => resource.uri === "vnem://install/search-index"),
    "expected search-index resource"
  );
  assert.ok(
    resources.resources.some((resource) => resource.uri === "vnem://install/source-radar"),
    "expected source-radar resource"
  );
  assert.ok(
    resources.resources.some((resource) => resource.uri === "vnem://install/operating-protocol"),
    "expected operating protocol resource"
  );
  assert.ok(
    resources.resources.some((resource) => resource.uri === "vnem://install/install-guide"),
    "expected install guide resource"
  );
  assert.ok(
    resources.resources.some((resource) => resource.uri === "vnem://install/quality-contract"),
    "expected quality contract resource"
  );
  assert.ok(
    resources.resources.some((resource) => resource.uri === "vnem://install/orchestration-protocol"),
    "expected orchestration protocol resource"
  );
  assert.ok(
    resources.resources.some((resource) => resource.uri === "vnem://install/precision-execution-protocol"),
    "expected precision execution protocol resource"
  );
  assert.ok(
    resources.resources.some((resource) => resource.uri === "vnem://install/omniscient-self-healing-protocol"),
    "expected omniscient self-healing protocol resource"
  );
  assert.ok(
    resources.resources.some((resource) => resource.uri === "vnem://install/coding-protocol"),
    "expected coding protocol resource"
  );
  assert.ok(
    resources.resources.some((resource) => resource.uri === "vnem://install/coding-playbooks"),
    "expected coding playbooks resource"
  );
  assert.ok(
    resources.resources.some((resource) => resource.uri === "vnem://install/task-rubrics"),
    "expected task rubrics resource"
  );
  assert.ok(
    resources.resources.some((resource) => resource.uri === "vnem://install/design-architecture"),
    "expected design architecture resource"
  );
  assert.ok(
    resources.resources.some((resource) => resource.uri === "vnem://install/visual-qa-protocol"),
    "expected visual QA protocol resource"
  );
  assert.ok(
    resources.resources.some((resource) => resource.uri === "vnem://install/agent-workspace"),
    "expected agent workspace resource"
  );
  assert.ok(
    resources.resources.some((resource) => resource.uri === "vnem://repo/readme"),
    "expected README resource"
  );
  assert.ok(
    resources.resources.some((resource) => resource.uri === "vnem://repo/product"),
    "expected product resource"
  );
  assert.ok(
    resources.resources.some((resource) => resource.uri === "vnem://repo/security-roadmap"),
    "expected security roadmap resource"
  );
  assert.ok(
    resources.resources.some((resource) => resource.uri === "vnem://repo/hermes"),
    "expected Hermes resource"
  );
  assert.ok(
    resources.resources.some((resource) => resource.uri === "vnem://repo/contributing"),
    "expected contributing resource"
  );

  const operatingProtocol = await client.readResource({
    uri: "vnem://install/operating-protocol"
  });
  assert.ok(operatingProtocol.contents[0]?.text?.includes("Universal Loop"));

  const installGuide = await client.readResource({
    uri: "vnem://install/install-guide"
  });
  assert.ok(installGuide.contents[0]?.text?.includes("vnem Install And MCP Guide"));
  assert.ok(installGuide.contents[0]?.text?.includes("mcp-config"));
  assert.ok(installGuide.contents[0]?.text?.includes("vnem_bootstrap"));

  const qualityContract = await client.readResource({
    uri: "vnem://install/quality-contract"
  });
  assert.ok(qualityContract.contents[0]?.text?.includes("vnem Quality Contract"));
  assert.ok(qualityContract.contents[0]?.text?.includes("Triple-Check Workflow"));
  assert.ok(qualityContract.contents[0]?.text?.includes("Holistic Excellence"));

  const orchestrationProtocol = await client.readResource({
    uri: "vnem://install/orchestration-protocol"
  });
  assert.ok(orchestrationProtocol.contents[0]?.text?.includes("vnem Orchestration Protocol"));
  assert.ok(orchestrationProtocol.contents[0]?.text?.includes("Routing & Orchestration Engine"));
  assert.ok(orchestrationProtocol.contents[0]?.text?.includes("Magentic Coding Workflow"));
  assert.ok(orchestrationProtocol.contents[0]?.text?.includes("Shared State"));

  const precisionProtocol = await client.readResource({
    uri: "vnem://install/precision-execution-protocol"
  });
  assert.ok(precisionProtocol.contents[0]?.text?.includes("vnem Precision Execution Protocol"));
  assert.ok(precisionProtocol.contents[0]?.text?.includes("mcp_apply_diff_patch"));
  assert.ok(precisionProtocol.contents[0]?.text?.includes("mcp_fetch_documentation"));
  assert.ok(precisionProtocol.contents[0]?.text?.includes("mcp_execute_terminal_command"));

  const omniscientProtocol = await client.readResource({
    uri: "vnem://install/omniscient-self-healing-protocol"
  });
  assert.ok(omniscientProtocol.contents[0]?.text?.includes("vnem Omniscient Context And Self-Healing Protocol"));
  assert.ok(omniscientProtocol.contents[0]?.text?.includes("mcp_semantic_code_search"));
  assert.ok(omniscientProtocol.contents[0]?.text?.includes("mcp_run_verification_tests"));
  assert.ok(omniscientProtocol.contents[0]?.text?.includes("mcp_execute_ephemeral_script"));

  const codingProtocol = await client.readResource({
    uri: "vnem://install/coding-protocol"
  });
  assert.ok(codingProtocol.contents[0]?.text?.includes("vnem Coding Protocol"));
  assert.ok(codingProtocol.contents[0]?.text?.includes("Repo Sensing Contract"));
  assert.ok(codingProtocol.contents[0]?.text?.includes("Verification Ladder"));

  const codingPlaybooks = await client.readResource({
    uri: "vnem://install/coding-playbooks"
  });
  const codingPlaybookData = JSON.parse(codingPlaybooks.contents[0]?.text || "{}");
  assert.equal(codingPlaybookData.safety?.mode, "read-only-coding-playbooks");
  assert.ok(codingPlaybookData.playbooks?.some((playbook) => playbook.id === "bug-root-cause"));
  assert.ok(codingPlaybookData.playbooks?.some((playbook) => playbook.id === "web-app-rendered-quality"));

  const taskRubrics = await client.readResource({
    uri: "vnem://install/task-rubrics"
  });
  assert.ok(taskRubrics.contents[0]?.text?.includes("frontend_ui"));

  const designArchitecture = await client.readResource({
    uri: "vnem://install/design-architecture"
  });
  assert.ok(designArchitecture.contents[0]?.text?.includes("vnem Design Architecture"));
  assert.ok(designArchitecture.contents[0]?.text?.includes("WCAG 3 and APCA-style contrast work are watchlist/directional only"));
  assert.ok(designArchitecture.contents[0]?.text?.includes("Guidance Classification"));

  const visualQaProtocol = await client.readResource({
    uri: "vnem://install/visual-qa-protocol"
  });
  assert.ok(visualQaProtocol.contents[0]?.text?.includes("vnem Visual QA Protocol"));
  assert.ok(visualQaProtocol.contents[0]?.text?.includes("Name the single ugliest visible issue"));

  const sourceRadar = await client.readResource({
    uri: "vnem://install/source-radar"
  });
  assert.ok(sourceRadar.contents[0]?.text?.includes("mcp-core-and-registry"));

  const agentWorkspace = await client.readResource({
    uri: "vnem://install/agent-workspace"
  });
  assert.ok(agentWorkspace.contents[0]?.text?.includes("Agent Workspace"));
  assert.ok(agentWorkspace.contents[0]?.text?.includes("MCP Gateway And Tool Routing"));

  const readme = await client.readResource({
    uri: "vnem://repo/readme"
  });
  assert.ok(readme.contents[0]?.text?.includes("Use As An MCP Server"));

  const product = await client.readResource({
    uri: "vnem://repo/product"
  });
  assert.ok(product.contents[0]?.text?.includes("vnem Product Direction"));

  const securityRoadmap = await client.readResource({
    uri: "vnem://repo/security-roadmap"
  });
  assert.ok(securityRoadmap.contents[0]?.text?.includes("Agentic Security Roadmap"));

  const hermes = await client.readResource({
    uri: "vnem://repo/hermes"
  });
  assert.ok(hermes.contents[0]?.text?.includes("Hermes"));

  const entryResource = await client.readResource({
    uri: "vnem://entries/model-context-protocol"
  });
  assert.ok(entryResource.contents[0]?.text?.includes("Model Context Protocol"));

  console.log("vnem MCP smoke test passed");
} catch (error) {
  if (stderr.trim()) {
    console.error(stderr.trim());
  }
  throw error;
} finally {
  await client.close().catch(() => {});
}

async function bootstrap(task, extra = {}) {
  const result = await client.callTool({
    name: "vnem_bootstrap",
    arguments: {
      task,
      include_resources: true,
      include_next_calls: true,
      ...extra
    }
  });
  assert.equal(result.isError, undefined, `expected vnem_bootstrap for ${task} to succeed`);
  assert.equal(result.structuredContent?.activation?.read_only, true, `expected bootstrap for ${task} to stay read-only`);
  assert.equal(result.structuredContent?.activation?.precision_tools_exposed, false, `expected bootstrap for ${task} to keep precision tools separate`);
  assert.ok(result.structuredContent?.required_rules?.length > 0, `expected bootstrap for ${task} to include required rules`);
  assert.ok(result.structuredContent?.recommended_vnem_calls?.length > 0, `expected bootstrap for ${task} to include next calls`);
  assert.ok(result.structuredContent?.verification_contract?.evidence_required?.length > 0, `expected bootstrap for ${task} to include verification evidence`);
  assert.ok(result.structuredContent?.completion_audit_expectations?.mcp_tools_used, `expected bootstrap for ${task} to include completion audit expectations`);
  assert.ok(result.structuredContent?.anti_placebo_checks?.evidence_that_proves_not_fake?.length > 0, `expected bootstrap for ${task} to include anti-placebo proof`);
  return result.structuredContent;
}
