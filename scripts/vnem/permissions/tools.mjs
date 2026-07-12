import { z } from "zod";
import { PermissionRuntimeError } from "./runtime.mjs";

const READ_ONLY_LOCAL = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const PERMISSION_MUTATION = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false };

export function registerPermissionRuntimeTools(server, runtime, options = {}) {
  const testReference = options.testReference || "scripts/test-tools-scoped-permissions.mjs";
  register(server, options.registry, "vnem_tools_permission_request", {
    title: "Request Scoped Permission",
    description: "Prepare one exact session or persistent permission request with action, scope, duration, material risk, rollback, safer alternative, and action-specific acknowledgment; hard blocks cannot be requested.",
    inputSchema: {
      actions: z.array(z.string()).min(1).max(20),
      scope: z.object({
        path_prefixes: z.array(z.string()).default([]),
        repositories: z.array(z.string()).default([]),
        branches: z.array(z.string()).default([]),
        providers: z.array(z.string()).default([]),
        domains: z.array(z.string()).default([])
      }).default({}),
      duration_minutes: z.number().int().min(1).max(1440).default(60),
      persistence: z.enum(["session", "persistent"]).default("session"),
      reason: z.string().min(1),
      safer_alternative: z.string().default("Keep the current profile and use dry-run/read-only planning.")
    },
    annotations: READ_ONLY_LOCAL
  }, async (args) => {
    const request = runtime.requestGrant(args);
    return result(formatRequest(request), { permission_request: request });
  }, testReference);

  register(server, options.registry, "vnem_tools_permission_grant", {
    title: "Approve Scoped Permission",
    description: "Activate a previously prepared exact scoped grant after matching its action-specific acknowledgment; session grants stay in memory and persistent grants create rollback-capable config backups.",
    inputSchema: {
      request_id: z.string().min(1),
      acknowledgment: z.string().min(1)
    },
    annotations: PERMISSION_MUTATION
  }, async (args) => {
    const grant = await runtime.approveGrant(args);
    return result(`vnem_tools_permission_grant: active ${grant.grant.grant_id}\nPersistence: ${grant.grant.persistence}\nExpires: ${grant.grant.expires_at}\nPer-call reapproval: no inside exact scope`, { permission_grant: grant });
  }, testReference);

  register(server, options.registry, "vnem_tools_permission_revoke", {
    title: "Revoke Scoped Permission",
    description: "Revoke one session or persistent scoped permission by exact grant id and preserve config rollback evidence for persistent changes.",
    inputSchema: { grant_id: z.string().min(1) },
    annotations: PERMISSION_MUTATION
  }, async (args) => {
    const revoked = await runtime.revokeGrant(args.grant_id);
    return result(`vnem_tools_permission_revoke: ${revoked.ok ? "revoked" : "not found"} ${revoked.grant_id}`, { permission_revoke: revoked });
  }, testReference);

  register(server, options.registry, "vnem_tools_permission_evaluate", {
    title: "Evaluate Permission",
    description: "Evaluate one action against hard blocks, the active profile, and exact active scoped grants without executing the action.",
    inputSchema: {
      action: z.string().min(1),
      target_path: z.string().optional(),
      repository: z.string().optional(),
      branch: z.string().optional(),
      provider: z.string().optional(),
      domain: z.string().optional(),
      url: z.string().url().optional()
    },
    annotations: READ_ONLY_LOCAL
  }, async (args) => {
    const decision = runtime.evaluate(args);
    return result(`vnem_tools_permission_evaluate: ${decision.allowed ? "allowed" : "blocked"} ${decision.action}\nSource: ${decision.decision_source}\nApproval required: ${decision.approval_required}\nReason: ${decision.reason}`, { permission_decision: decision });
  }, testReference);

  register(server, options.registry, "vnem_tools_permission_doctor", {
    title: "Permission Configuration Doctor",
    description: "Validate the active safety profile, custom actions, persistent grants, backup availability, and hard-block integrity from the shared permission runtime.",
    inputSchema: {},
    annotations: READ_ONLY_LOCAL
  }, async () => {
    const doctor = runtime.doctor();
    return result(`vnem_tools_permission_doctor: ${doctor.ok ? "ok" : "issues"}\nProfile: ${doctor.profile}\nHard blocks intact: ${doctor.hard_blocks_intact}\nIssues: ${doctor.issues.length}`, { permission_doctor: doctor });
  }, testReference);
}

function register(server, registry, name, definition, handler, testReference) {
  server.registerTool(name, definition, async (args) => {
    try {
      return await handler(args);
    } catch (error) {
      return permissionError(error);
    }
  });
  registry?.annotate(name, {
    implementation_module: "scripts/vnem/permissions/tools.mjs",
    behavior_test_references: [testReference],
    benchmark_scenarios: ["scoped permission grant and hard-block enforcement"]
  });
}

function result(text, structuredContent) {
  return { content: [{ type: "text", text }], structuredContent };
}

function permissionError(error) {
  const known = error instanceof PermissionRuntimeError;
  const code = known ? error.code : "unexpected_permission_error";
  const message = known ? error.message : "Permission operation failed unexpectedly. Internal details were redacted.";
  return {
    isError: true,
    content: [{ type: "text", text: `${code}: ${message}` }],
    structuredContent: { code, error: message, details: known ? error.details : { internal_error_hidden: true } }
  };
}

function formatRequest(request) {
  return [
    `vnem_tools_permission_request: ${request.request_id}`,
    `Actions: ${request.actions.join(", ")}`,
    `Persistence: ${request.persistence}`,
    `Duration: ${request.duration_minutes} minutes`,
    `Risk: ${request.material_risks.join("; ")}`,
    `Rollback: ${request.rollback}`,
    `Exact acknowledgment: ${request.exact_acknowledgment}`
  ].join("\n");
}
