#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const serverPath = path.join(scriptDir, "vnem-mcp-server.mjs");

const client = new Client(
  {
    name: "vnem-mcp-smoke-test",
    version: "0.1.0"
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
      task: "make agentic coding more efficient with MCPs, memory, and faster grep",
      limit: 4
    }
  });
  assert.equal(recommendation.isError, undefined);
  assert.ok(
    recommendation.structuredContent?.registry_entries?.length > 0,
    "expected vnem_recommend registry entries"
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
