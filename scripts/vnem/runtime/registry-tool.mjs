export function registerRegistryStatusTool(server, registry, { name, title }) {
  server.registerTool(
    name,
    {
      title,
      description: "Return the authoritative runtime tool registry, contract validation, categories, side-effect classes, compatibility metadata, and behavior-test reference gaps.",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async () => {
      const status = registry.status();
      return {
        content: [{ type: "text", text: `${name}: valid=${status.valid}; tools=${status.tool_count}; errors=${status.validation.errors.length}; warnings=${status.validation.warnings.length}` }],
        structuredContent: { registry_status: status }
      };
    }
  );
  registry.annotate(name, {
    behavior_test_references: ["scripts/test-vnem-runtime-registry.mjs"],
    benchmark_scenarios: ["architecture understanding", "coverage analysis"] ,
    implementation_module: "scripts/vnem/runtime/registry-tool.mjs"
  });
}
