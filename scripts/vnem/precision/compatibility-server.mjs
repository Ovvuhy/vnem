import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { attachToolRegistry } from "../registry/tool-registry.mjs";
import { loadBehaviorTestReferences } from "../registry/behavior-contracts.mjs";
import { registerRegistryStatusTool } from "../runtime/registry-tool.mjs";
import { PrecisionRuntime } from "./runtime.mjs";
import { registerPrecisionCompatibilityTools } from "./tools.mjs";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(moduleDir, "..", "..", "..");
const SERVER_VERSION = "1.1.0";

export async function startPrecisionCompatibilityServer(options = {}) {
  const workspaceRoot = path.resolve(
    options.workspaceRoot ||
      process.env.VNEM_PRECISION_ROOT ||
      process.env.VNEM_WORKSPACE_ROOT ||
      process.cwd() ||
      repoRoot
  );
  const runtime = options.runtime || new PrecisionRuntime({ workspaceRoot });
  const server = new McpServer(
    { name: "vnem-precision", version: SERVER_VERSION },
    {
      instructions: [
        "VNEM Precision MCP is a compatibility adapter for clients using the legacy Precision tool names.",
        "All Precision handlers delegate to the same lazy modular precision runtime used by VNEM Tools MCP.",
        "New integrations should use VNEM Tools first-class precision capabilities; existing mcp_* names remain behaviorally supported in this release."
      ].join(" ")
    }
  );
  const registry = attachToolRegistry(server, {
    serverName: "vnem-precision",
    version: SERVER_VERSION,
    implementationModule: "scripts/vnem/precision/compatibility-server.mjs",
    behaviorTestReferences: loadBehaviorTestReferences(repoRoot, "vnem-precision")
  });
  registerPrecisionCompatibilityTools(server, runtime, { registry });
  registerRegistryStatusTool(server, registry, { name: "mcp_registry_status", title: "VNEM Precision Registry Status" });
  const validation = registry.validate();
  if (!validation.valid) throw new Error(`VNEM Precision registry validation failed: ${JSON.stringify(validation.errors)}`);
  await server.connect(options.transport || new StdioServerTransport());
  return { server, registry, runtime };
}
