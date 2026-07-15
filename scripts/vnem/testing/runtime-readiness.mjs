#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { callTimed, connectMcp } from "../giga/mcp-client.mjs";

const moduleRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

export async function inspectRuntimeRegistries(root = moduleRoot) {
  const definitions = [
    { id: "core", file: "scripts/vnem-mcp-server.mjs", statusTool: "vnem_registry_status" },
    { id: "tools", file: "scripts/vnem-tools-mcp-server.mjs", statusTool: "vnem_tools_registry_status" },
    { id: "precision", file: "scripts/vnem-precision-mcp-server.mjs", statusTool: "mcp_registry_status" }
  ];
  const servers = {};
  for (const definition of definitions) {
    const connection = await connectMcp({ root, serverFile: definition.file, name: `vnem-runtime-readiness-${definition.id}` });
    try {
      const manifest = await connection.client.listTools();
      const call = await callTimed(connection.client, definition.statusTool, {});
      const status = call.structured?.registry_status;
      servers[definition.id] = {
        server_file: definition.file,
        status_tool: definition.statusTool,
        list_tools_count: manifest.tools.length,
        registry_tool_count: status?.tool_count ?? null,
        counts_match: manifest.tools.length === status?.tool_count,
        registry_valid: status?.valid === true,
        validation_errors: status?.validation?.errors || [],
        validation_warnings: status?.validation?.warnings || [],
        latency_ms: call.latency_ms,
        output_bytes: call.output_bytes,
        fields_complete: (status?.tools || []).every(hasContractFields)
      };
    } finally {
      await connection.close();
    }
  }
  return {
    schema_version: "1.0.0",
    ready: Object.values(servers).every((item) => item.registry_valid && item.counts_match && item.fields_complete),
    proof_model: "live MCP SDK listTools plus registry status calls",
    servers
  };
}

function hasContractFields(tool) {
  return ["name", "version", "title", "description", "category", "output_contract", "annotations", "side_effect_class", "permission_requirements", "network_behavior", "credential_behavior", "evidence_behavior", "rollback_behavior", "compatibility_aliases", "deprecation_state", "implementation_module", "behavior_test_references", "benchmark_scenarios", "input_schema_present"].every((key) => Object.hasOwn(tool, key));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = await inspectRuntimeRegistries();
  console.log("VNEM runtime registry readiness");
  for (const [name, item] of Object.entries(report.servers)) console.log(`${name}: valid=${item.registry_valid}; count=${item.registry_tool_count}; match=${item.counts_match}; warnings=${item.validation_warnings.length}`);
  console.log(`readiness=${report.ready ? "ready" : "blocked"}`);
  if (!report.ready) process.exitCode = 1;
}
