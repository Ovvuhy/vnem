import { z } from "zod";
import {
  applyClientSetup,
  detectSupportedClients,
  planClientSetup,
  publicSetupPlan,
  rollbackClientSetup,
  setupStatus,
  verifySetup
} from "../clients/setup.mjs";

const READ_ONLY_LOCAL = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const LOCAL_ACTION = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false };
const CLIENT_IDS = [
  "codex",
  "codex_app",
  "codex_cli",
  "claude_code",
  "claude_desktop",
  "cursor",
  "windsurf",
  "cline",
  "gemini_cli",
  "antigravity",
  "hermes",
  "generic_stdio",
  "generic_http"
];
const COMPONENTS = ["core", "tools", "precision"];

export const CLIENT_SETUP_TOOL_NAMES = Object.freeze([
  "vnem_tools_client_detect",
  "vnem_tools_client_setup_plan",
  "vnem_tools_client_install",
  "vnem_tools_client_setup_status",
  "vnem_tools_client_verify",
  "vnem_tools_client_rollback"
]);

export function registerClientSetupTools(mcpServer, runtime) {
  const { repoRoot, enforceActionPolicy, toolResult, withToolErrors } = runtime;

  mcpServer.registerTool(
    "vnem_tools_client_detect",
    {
      title: "VNEM Client Detect",
      description: "Detect supported VNEM clients and their config/install evidence without changing client state.",
      inputSchema: detectionSchema(repoRoot),
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => {
      const result = await detectSupportedClients(clientOptions(args, repoRoot));
      return clientResult(toolResult, "vnem_tools_client_detect", "client_detect", result);
    })
  );

  mcpServer.registerTool(
    "vnem_tools_client_setup_plan",
    {
      title: "VNEM Client Setup Plan",
      description: "Preview exact merge-preserving client config, instruction, safety-profile, backup, and rollback changes.",
      inputSchema: setupSchema(repoRoot),
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => {
      const result = publicSetupPlan(await planClientSetup(clientOptions(args, repoRoot)));
      return clientResult(toolResult, "vnem_tools_client_setup_plan", "client_setup_plan", result);
    })
  );

  mcpServer.registerTool(
    "vnem_tools_client_install",
    {
      title: "VNEM Client Install",
      description: "Preview by default, or apply one approved backup-backed client setup transaction and verify the result.",
      inputSchema: mutationSchema(setupSchema(repoRoot)),
      annotations: LOCAL_ACTION
    },
    async (args) => withToolErrors(async () => {
      enforceActionPolicy("local_pc_action", { ...args, target_path: args.home || args.workspace });
      const options = clientOptions(args, repoRoot);
      const plan = await planClientSetup(options);
      const result = await applyClientSetup({
        ...options,
        plan,
        yes: args.dry_run === false,
        verifyMcp: args.verify_mcp !== false
      });
      return clientResult(toolResult, "vnem_tools_client_install", "client_install", result);
    })
  );

  mcpServer.registerTool(
    "vnem_tools_client_setup_status",
    {
      title: "VNEM Client Setup Status",
      description: "Inspect detected clients and the latest local setup transaction without modifying configuration.",
      inputSchema: statusSchema(repoRoot),
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => {
      const result = await setupStatus(clientOptions(args, repoRoot));
      return clientResult(toolResult, "vnem_tools_client_setup_status", "client_setup_status", result);
    })
  );

  mcpServer.registerTool(
    "vnem_tools_client_verify",
    {
      title: "VNEM Client Verify",
      description: "Verify merged client config, managed instructions, safety profile, and optional Core/Tools MCP startup proof.",
      inputSchema: {
        ...setupSchema(repoRoot),
        verify_mcp: z.boolean().default(true)
      },
      annotations: READ_ONLY_LOCAL
    },
    async (args) => withToolErrors(async () => {
      const plan = await planClientSetup(clientOptions(args, repoRoot));
      const result = await verifySetup({ ...plan, runMcp: args.verify_mcp !== false });
      return clientResult(toolResult, "vnem_tools_client_verify", "client_verify", result);
    })
  );

  mcpServer.registerTool(
    "vnem_tools_client_rollback",
    {
      title: "VNEM Client Rollback",
      description: "Preview by default, or restore an approved client setup transaction from its exact backups.",
      inputSchema: mutationSchema(statusSchema(repoRoot), {
        transaction_id: z.string().min(1).optional()
      }),
      annotations: LOCAL_ACTION
    },
    async (args) => withToolErrors(async () => {
      enforceActionPolicy("local_pc_action", { ...args, target_path: args.state_dir || args.home || args.workspace });
      const result = await rollbackClientSetup({
        home: args.home,
        stateDir: args.state_dir,
        transactionId: args.transaction_id,
        yes: args.dry_run === false
      });
      return clientResult(toolResult, "vnem_tools_client_rollback", "client_rollback", result);
    })
  );
}

function detectionSchema(repoRoot) {
  return {
    root: z.string().default(repoRoot),
    workspace: z.string().default(process.cwd()),
    home: z.string().optional()
  };
}

function setupSchema(repoRoot) {
  return {
    ...detectionSchema(repoRoot),
    clients: z.array(z.enum(CLIENT_IDS)).default([]),
    components: z.array(z.enum(COMPONENTS)).default(["core", "tools"]),
    safety_profile: z.string().default("safe-local-dev"),
    scope: z.enum(["project", "global"]).default("project"),
    state_dir: z.string().optional(),
    config_overrides: z.record(z.string()).default({})
  };
}

function statusSchema(repoRoot) {
  return {
    ...detectionSchema(repoRoot),
    scope: z.enum(["project", "global"]).default("project"),
    state_dir: z.string().optional()
  };
}

function mutationSchema(schema, extra = {}) {
  return {
    ...schema,
    ...extra,
    dry_run: z.boolean().default(true),
    approved: z.boolean().default(false),
    approval_note: z.string().default(""),
    verify_mcp: z.boolean().default(true)
  };
}

function clientOptions(args, repoRoot) {
  return {
    root: args.root || repoRoot,
    workspace: args.workspace,
    home: args.home,
    clients: args.clients,
    components: args.components,
    safetyProfile: args.safety_profile,
    scope: args.scope,
    stateDir: args.state_dir,
    configOverrides: args.config_overrides
  };
}

function clientResult(toolResult, toolName, key, result) {
  const summary = [
    `${toolName}: ${result.operation || (result.ok ? "verified" : "complete")}`,
    `applied: ${result.applied === true}`,
    `secrets_in_output: ${result.secrets_in_output === true}`,
    `safe_next_step: ${result.next_action || result.rollback || nextAction(toolName, result)}`
  ].join("\n");
  return toolResult(summary, { [key]: result });
}

function nextAction(toolName, result) {
  if (toolName === "vnem_tools_client_detect") return "Review detected clients, then call vnem_tools_client_setup_plan for the exact intended client set.";
  if (toolName === "vnem_tools_client_setup_status") return result.latest_transaction ? "Verify or preview rollback of the latest transaction." : "No setup transaction exists; preview client setup before applying.";
  if (toolName === "vnem_tools_client_verify") return result.ok ? "Reload the client UI and confirm VNEM tools are visible." : "Review failed checks, then repair or roll back the transaction.";
  if (toolName === "vnem_tools_client_rollback") return result.applied ? "Verify restored client state and reload the client." : "Review the exact rollback preview, then repeat with explicit approval.";
  return "Review the exact setup result and retain transaction evidence.";
}
