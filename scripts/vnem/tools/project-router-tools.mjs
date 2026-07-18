import { z } from "zod";
import { ProjectRouterError } from "../projects/router.mjs";

const READ_ONLY_LOCAL = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const LOCAL_STATE_ACTION = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };

export const PROJECT_ROUTER_TOOL_NAMES = Object.freeze([
  "vnem_tools_global_integration_status",
  "vnem_tools_codex_trusted_projects",
  "vnem_tools_project_authorization_check",
  "vnem_tools_project_approval_request",
  "vnem_tools_project_approval_activate",
  "vnem_tools_project_revoke",
  "vnem_tools_project_select",
  "vnem_tools_project_status",
  "vnem_tools_project_router_doctor"
]);

export function registerProjectRouterTools(server, router, options = {}) {
  const registry = options.registry;

  register(server, registry, "vnem_tools_global_integration_status", {
    title: "Global VNEM Integration Status",
    description: "Report actual Core/Tools global registration, dynamic project routing, global and narrowed profiles, selected project, trust/approval counts, evidence namespace, hard blocks, configuration health, and migration state.",
    inputSchema: {},
    annotations: READ_ONLY_LOCAL
  }, async () => {
    const status = await router.status();
    return result(formatStatus("vnem_tools_global_integration_status", status), { global_integration_status: status });
  });

  register(server, registry, "vnem_tools_codex_trusted_projects", {
    title: "Discover Codex Trusted Projects",
    description: "Parse only Codex project trust entries and return canonical trusted roots plus configuration health without exposing unrelated Codex settings or secrets.",
    inputSchema: {},
    annotations: READ_ONLY_LOCAL
  }, async () => {
    const discovered = await router.discoverCodexTrustedProjects();
    return result(`vnem_tools_codex_trusted_projects: ${discovered.projects.length}\nconfig_health=${discovered.health.code}`, { codex_trusted_projects: discovered });
  });

  register(server, registry, "vnem_tools_project_authorization_check", {
    title: "Check Project Authorization",
    description: "Canonicalize one exact path and check whether it is inside a trusted Codex project or active explicit VNEM approval without selecting it.",
    inputSchema: { root: z.string().min(1) },
    annotations: READ_ONLY_LOCAL
  }, async (args) => {
    const checked = await router.authorizationCheck(args.root);
    return result(`vnem_tools_project_authorization_check: ${checked.authorized ? "authorized" : "denied"}\nreason=${checked.reason || checked.authorization_source}`, { project_authorization: checked });
  });

  register(server, registry, "vnem_tools_project_approval_request", {
    title: "Request Exact Project Approval",
    description: "Inspect and canonicalize one project root, reject broad roots, and produce an exact bounded session or persistent approval acknowledgment without granting access yet.",
    inputSchema: {
      root: z.string().min(1),
      persistence: z.enum(["session", "persistent"]).default("session"),
      duration_minutes: z.number().int().min(1).max(43200).default(60)
    },
    annotations: READ_ONLY_LOCAL
  }, async (args) => {
    const request = await router.requestApproval(args);
    return result([
      `vnem_tools_project_approval_request: ${request.request_id}`,
      `root=${request.exact_access_boundary}`,
      `persistence=${request.persistence}`,
      `expires_at=${request.expires_at}`,
      `exact_acknowledgment=${request.exact_acknowledgment}`
    ].join("\n"), { project_approval_request: request });
  });

  register(server, registry, "vnem_tools_project_approval_activate", {
    title: "Activate Exact Project Approval",
    description: "Activate a prepared exact project approval after matching its acknowledgment; session approvals remain in memory and persistent approvals are stored in global namespaced VNEM state.",
    inputSchema: { request_id: z.string().min(1), acknowledgment: z.string().min(1) },
    annotations: LOCAL_STATE_ACTION
  }, async (args) => {
    const activated = await router.activateApproval(args);
    return result(`vnem_tools_project_approval_activate: active\nproject_id=${activated.project.project_id}\npersistence=${activated.persistence}`, { project_approval_activation: activated });
  });

  register(server, registry, "vnem_tools_project_revoke", {
    title: "Revoke Project Approval",
    description: "Revoke session and persistent VNEM approval for one exact project id or canonical root and clear its selection; Codex trust, if present, is reported separately and is not modified.",
    inputSchema: { project_id: z.string().optional(), root: z.string().optional() },
    annotations: LOCAL_STATE_ACTION
  }, async (args) => {
    const revoked = await router.revoke(args);
    options.onRevoke?.(revoked);
    return result(`vnem_tools_project_revoke: ${revoked.ok ? "revoked" : "not_found"}\naccess_denied_after_revocation=${revoked.access_denied_after_revocation}`, { project_revocation: revoked });
  });

  register(server, registry, "vnem_tools_project_select", {
    title: "Select Active VNEM Project",
    description: "Explicitly select one already authorized project for relative-path tool calls; selection is audited and never broadens authorization.",
    inputSchema: { root: z.string().min(1) },
    annotations: LOCAL_STATE_ACTION
  }, async (args) => {
    const selected = await router.select(args.root, { reason: "project_select_tool" });
    return result(`vnem_tools_project_select: selected\nproject_id=${selected.project.project_id}\nroot=${selected.project.root}\nevidence_root=${selected.evidence_root}`, { project_selection: selected });
  });

  register(server, registry, "vnem_tools_project_status", {
    title: "Current VNEM Project Status",
    description: "Report the selected project, authorization sources, global and narrowed profile, project evidence namespace, and recent denials without exposing secrets.",
    inputSchema: {},
    annotations: READ_ONLY_LOCAL
  }, async () => {
    const status = await router.status();
    return result(formatStatus("vnem_tools_project_status", status), { project_status: status });
  });

  register(server, registry, "vnem_tools_project_router_doctor", {
    title: "VNEM Project Router Doctor",
    description: "Validate global registration, Codex trust parsing, global router state, project approvals, selection, evidence namespacing, profile precedence, migration state, and hard-block integrity.",
    inputSchema: {},
    annotations: READ_ONLY_LOCAL
  }, async () => {
    const doctor = await router.doctor();
    return result(`vnem_tools_project_router_doctor: ${doctor.ok ? "ok" : "issues"}\nissues=${doctor.issues.length}\nhard_blocks_intact=${doctor.hard_blocks_intact}`, { project_router_doctor: doctor });
  });
}

function register(server, registry, name, definition, handler) {
  server.registerTool(name, definition, async (args) => {
    try {
      return await handler(args || {});
    } catch (error) {
      const known = error instanceof ProjectRouterError;
      const code = known ? error.code : "unexpected_project_router_error";
      const message = known ? error.message : "Project router operation failed unexpectedly. Internal details were redacted.";
      return {
        isError: true,
        content: [{ type: "text", text: `${code}: ${message}` }],
        structuredContent: { code, error: message, details: known ? error.details : { internal_error_hidden: true } }
      };
    }
  });
  registry?.annotate(name, {
    implementation_module: "scripts/vnem/tools/project-router-tools.mjs",
    behavior_test_references: ["scripts/test-vnem-codex-global-routing.mjs"],
    benchmark_scenarios: ["Codex global trusted project selection and bounded approval isolation"]
  });
}

function result(text, structuredContent) {
  return { content: [{ type: "text", text }], structuredContent };
}

function formatStatus(name, status) {
  return [
    `${name}: ${status.mode}`,
    `core_globally_registered=${status.core_globally_registered}`,
    `tools_globally_registered=${status.tools_globally_registered}`,
    `dynamic_project_routing_active=${status.dynamic_project_routing_active}`,
    `global_profile=${status.global_profile}`,
    `selected_project=${status.selected_project?.root || "none"}`,
    `evidence_namespace=${status.evidence_namespace}`,
    `core_runtime_health=${status.core_runtime_health?.status || "unknown"}`,
    `tools_runtime_health=${status.tools_runtime_health?.status || "unknown"}`,
    `codex_configuration_health=${status.codex_configuration_health?.code || "unknown"}`,
    `migration_state=${status.migration_state}`
  ].join("\n");
}
