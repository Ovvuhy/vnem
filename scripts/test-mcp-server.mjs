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
  for (const tool of tools.tools) {
    assert.equal(tool.annotations?.readOnlyHint, true, `expected ${tool.name} to be annotated read-only`);
    assert.equal(tool.annotations?.destructiveHint, false, `expected ${tool.name} to be annotated non-destructive`);
  }

  const status = await client.callTool({
    name: "vnem_status",
    arguments: {}
  });
  assert.equal(status.isError, undefined);
  assert.equal(status.structuredContent?.safety?.installs_packages, false);
  assert.ok(status.structuredContent?.counts?.registry_entries >= 200, "expected vnem_status registry count");
  assert.ok(status.structuredContent?.mcp?.tools?.includes("vnem_route_intent"), "expected vnem_status to list route tool");
  assert.ok(status.structuredContent?.mcp?.tools?.includes("vnem_quality_gate"), "expected vnem_status to list quality gate tool");
  assert.ok(status.structuredContent?.mcp?.tools?.includes("vnem_orchestrate"), "expected vnem_status to list orchestration tool");
  assert.equal(status.structuredContent?.counts?.install_guide, true, "expected vnem_status install guide count");
  assert.equal(status.structuredContent?.counts?.quality_contract, true, "expected vnem_status quality contract count");
  assert.equal(status.structuredContent?.counts?.orchestration_protocol, true, "expected vnem_status orchestration protocol count");
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
  assert.ok(installGuide.contents[0]?.text?.includes("vnem_status"));

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
