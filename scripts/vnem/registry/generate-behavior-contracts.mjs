#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { callTimed, connectMcp } from "../giga/mcp-client.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const outputPath = path.join(root, ".vnem", "runtime-tool-behavior-tests.json");
const check = process.argv.includes("--check");
const core = await connectMcp({ root, serverFile: "scripts/vnem-mcp-server.mjs", name: "vnem-behavior-contracts-core" });
const tools = await connectMcp({ root, serverFile: "scripts/vnem-tools-mcp-server.mjs", name: "vnem-behavior-contracts-tools" });
const precision = await connectMcp({ root, serverFile: "scripts/vnem-precision-mcp-server.mjs", name: "vnem-behavior-contracts-precision" });

try {
  const [coreManifest, toolsManifest, precisionManifest, coverageCall, toolsRegistryCall] = await Promise.all([
    core.client.listTools(),
    tools.client.listTools(),
    precision.client.listTools(),
    callTimed(tools.client, "vnem_tools_tool_test_coverage_map", { root, max_tools: 240 }),
    callTimed(tools.client, "vnem_tools_registry_status", {})
  ]);
  const coverage = coverageCall.structured?.tool_test_coverage_map || coverageCall.structured;
  const runtimeTools = new Map((toolsRegistryCall.structured?.registry_status?.tools || []).map((tool) => [tool.name, tool]));
  const toolReferences = {};
  const dependencySecurityReferences = Object.fromEntries([
    "vnem_tools_dependency_inventory",
    "vnem_tools_dependency_risk_audit",
    "vnem_tools_dependency_advisory_audit",
    "vnem_tools_dependency_change_analyze",
    "vnem_tools_dependency_upgrade_plan",
    "vnem_tools_dependency_install_apply",
    "vnem_tools_dependency_transaction_rollback"
  ].map((name) => [name, ["scripts/test-tools-giga-dependency-security.mjs"]]));
  for (const tool of toolsManifest.tools) {
    const evidence = coverage?.per_tool?.[tool.name];
    const runtimeReferences = runtimeTools.get(tool.name)?.behavior_test_references || [];
    toolReferences[tool.name] = runtimeReferences.length
      ? runtimeReferences
      : dependencySecurityReferences[tool.name]
        || (evidence?.coverage_level === "behavior_test"
          ? evidence.behavior_test_files || []
          : []);
  }
  toolReferences.vnem_tools_registry_status = ["scripts/test-vnem-runtime-registry.mjs"];
  const coreFocusedReferences = {
    vnem_entrypoint: ["scripts/test-vnem-adoption-reliability-1-regression.mjs", "scripts/test-core-giga-intelligence.mjs"],
    vnem_usage_self_check: ["scripts/test-vnem-adoption-reliability-2-regression.mjs", "scripts/test-giga-adoption-client-use.mjs"],
    vnem_decision_details: ["scripts/test-core-giga-intelligence.mjs"],
    vnem_continue_from_tools_evidence: ["scripts/test-core-giga-intelligence.mjs"],
    vnem_compatibility_assess: ["scripts/test-core-giga-intelligence.mjs"]
  };
  const report = {
    schema_version: "1.0.0",
    source: "live MCP manifests plus vnem_tools_tool_test_coverage_map",
    servers: {
      vnem: Object.fromEntries(coreManifest.tools.map((tool) => [tool.name, coreFocusedReferences[tool.name] || [tool.name === "vnem_registry_status" ? "scripts/test-vnem-runtime-registry.mjs" : "scripts/test-mcp-server.mjs"]])),
      "vnem-tools": Object.fromEntries(toolsManifest.tools.map((tool) => [tool.name, toolReferences[tool.name] || []])),
      "vnem-precision": Object.fromEntries(precisionManifest.tools.map((tool) => [tool.name, [tool.name === "mcp_registry_status" ? "scripts/test-vnem-runtime-registry.mjs" : "scripts/test-precision-mcp-server.mjs"]]))
    }
  };
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (check) {
    if (await readFile(outputPath, "utf8") !== json) throw new Error("Behavior-test contract artifact is stale. Run npm run registry:behavior:generate.");
    console.log(`VNEM behavior-test contracts current: ${countReferences(report)} referenced tools`);
  } else {
    await writeFile(outputPath, json);
    console.log(`Generated VNEM behavior-test contracts: ${countReferences(report)} referenced tools`);
  }
} finally {
  await Promise.all([core.close(), tools.close(), precision.close()]);
}

function countReferences(report) {
  return Object.values(report.servers).flatMap((server) => Object.values(server)).filter((references) => references.length).length;
}
