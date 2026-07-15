#!/usr/bin/env node
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { callTimed, connectMcp } from "../giga/mcp-client.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const outputPath = path.join(root, ".vnem", "runtime-tool-registry.json");
const docsPath = path.join(root, "docs", "VNEM_TOOL_REGISTRY.md");
const check = process.argv.includes("--check");
const definitions = [
  { id: "core", file: "scripts/vnem-mcp-server.mjs", statusTool: "vnem_registry_status" },
  { id: "tools", file: "scripts/vnem-tools-mcp-server.mjs", statusTool: "vnem_tools_registry_status" },
  { id: "precision", file: "scripts/vnem-precision-mcp-server.mjs", statusTool: "mcp_registry_status" }
];
const servers = {};

for (const definition of definitions) {
  const connection = await connectMcp({ root, serverFile: definition.file, name: `vnem-registry-export-${definition.id}` });
  try {
    const call = await callTimed(connection.client, definition.statusTool, {});
    const status = call.structured?.registry_status;
    if (!status?.valid) throw new Error(`${definition.id} registry is invalid`);
    servers[definition.id] = status;
  } finally {
    await connection.close();
  }
}

const report = {
  schema_version: "1.0.0",
  source: "live MCP runtime registry status calls",
  total_tools: Object.values(servers).reduce((sum, server) => sum + server.tool_count, 0),
  servers,
  compatibility_map: Object.fromEntries(Object.values(servers).flatMap((server) => server.tools.flatMap((tool) => tool.compatibility_aliases.map((alias) => [alias, tool.name])))),
  validation: {
    valid: Object.values(servers).every((server) => server.valid),
    errors: Object.values(servers).flatMap((server) => server.validation.errors),
    tools_without_behavior_test_references: Object.values(servers).flatMap((server) => server.validation.warnings.filter((warning) => warning.code === "behavior_test_reference_missing").map((warning) => warning.tool))
  }
};
const json = `${JSON.stringify(report, null, 2)}\n`;
const markdown = registryMarkdown(report);

if (check) {
  const [currentJson, currentDocs] = await Promise.all([readFile(outputPath, "utf8"), readFile(docsPath, "utf8")]);
  if (currentJson !== json || currentDocs !== markdown) throw new Error("Runtime registry artifacts are stale. Run npm run registry:generate.");
  console.log(`VNEM runtime registry artifacts current: ${report.total_tools} tools`);
} else {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await Promise.all([writeFile(outputPath, json), writeFile(docsPath, markdown)]);
  console.log(`Generated VNEM runtime registry artifacts for ${report.total_tools} tools`);
}

function registryMarkdown(registry) {
  const rows = Object.entries(registry.servers).flatMap(([serverName, server]) => server.tools.map((tool) => `| ${serverName} | \`${tool.name}\` | ${tool.category} | ${tool.side_effect_class} | ${tool.permission_requirements.join(", ")} | ${tool.evidence_behavior} | ${tool.rollback_behavior.mode} | ${tool.implementation_module} |`));
  return `# VNEM Runtime Tool Registry\n\nGenerated from live MCP runtime registries. Do not edit this table manually.\n\n- Total tools: ${registry.total_tools}\n- Registry valid: ${registry.validation.valid}\n- Missing behavior-test references: ${registry.validation.tools_without_behavior_test_references.length}\n\n| Server | Tool | Category | Side effect | Permissions | Evidence | Rollback | Implementation |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n${rows.join("\n")}\n`;
}
