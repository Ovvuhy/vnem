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
    "vnem_search",
    "vnem_recommend",
    "vnem_get_entry",
    "vnem_compare",
    "vnem_best_practices",
    "vnem_sources"
  ]) {
    assert.equal(toolNames.has(name), true, `expected MCP tool ${name}`);
  }

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

  const nonVisualRecommendation = await client.callTool({
    name: "vnem_recommend",
    arguments: {
      task: "Simplify duplicate JavaScript helper functions without changing behavior.",
      limit: 4
    }
  });
  assert.equal(nonVisualRecommendation.isError, undefined);
  assert.equal(
    nonVisualRecommendation.structuredContent?.task_contract?.perception_gate,
    undefined,
    "expected non-visual work to avoid noisy design guidance"
  );

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

  const operatingProtocol = await client.readResource({
    uri: "vnem://install/operating-protocol"
  });
  assert.ok(operatingProtocol.contents[0]?.text?.includes("Universal Loop"));

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
