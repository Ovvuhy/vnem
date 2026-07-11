const SECRET_PATTERN = /(sk-[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9_]{8,}|xox[baprs]-[A-Za-z0-9-]{8,}|AKIA[0-9A-Z]{16}|Bearer\s+\S+|-----BEGIN [A-Z ]*PRIVATE KEY-----)/gi;

export class VnemRuntimeError extends Error {
  constructor(message, options = {}) {
    super(message, { cause: options.cause });
    this.name = "VnemRuntimeError";
    this.code = options.code || "VNEM_RUNTIME_ERROR";
    this.category = options.category || "runtime";
    this.retryable = options.retryable === true;
    this.blockedByPermission = options.blocked_by_permission === true;
    this.missingDependency = options.missing_dependency || null;
    this.missingCredentialReference = options.missing_credential_reference || null;
    this.safeNextAction = options.safe_next_action || "Review the redacted error details and retry only after the blocking condition is resolved.";
    this.rollbackState = options.rollback_state || "not_required";
    this.evidenceId = options.evidence_id || null;
    this.details = options.details || null;
  }
}

export function structuredRuntimeError(error, context = {}) {
  const known = error instanceof VnemRuntimeError;
  return {
    code: known ? error.code : "VNEM_UNEXPECTED_ERROR",
    message: redact(known ? error.message : "The tool failed unexpectedly. Internal details were redacted."),
    category: known ? error.category : "unexpected_runtime",
    retryable: known ? error.retryable : false,
    blocked_by_permission: known ? error.blockedByPermission : false,
    missing_dependency: known ? redact(error.missingDependency) : null,
    missing_credential_reference: known ? redact(error.missingCredentialReference) : null,
    safe_next_action: known ? redact(error.safeNextAction) : "Inspect server-side evidence or logs without exposing secrets, then retry the smallest safe operation.",
    rollback_state: known ? error.rollbackState : context.mutation_started ? "unknown_check_evidence" : "not_started",
    evidence_id: known ? error.evidenceId : context.evidence_id || null,
    details_redacted: known ? redactDetails(error.details) : { tool: context.tool_name || "unknown", internal_error_hidden: true }
  };
}

export function runtimeErrorResult(error, context = {}) {
  const structured = structuredRuntimeError(error, context);
  return {
    isError: true,
    content: [{ type: "text", text: `${structured.code}: ${structured.message}\nnext=${structured.safe_next_action}` }],
    structuredContent: { error: structured, runtime_error: structured }
  };
}

export function assertSafeToolResult(result, toolName, context = {}) {
  if (!result || typeof result !== "object" || !Array.isArray(result.content)) {
    throw new VnemRuntimeError(`Tool ${toolName} returned an invalid MCP result contract.`, {
      code: "VNEM_INVALID_TOOL_RESULT",
      category: "output_contract",
      safe_next_action: "Inspect the handler result and return an MCP content array plus optional structuredContent."
    });
  }
  const safe = redactResult(result);
  if (safe.isError === true && !safe.structuredContent?.runtime_error) {
    const legacyCode = safe.structuredContent?.code || "VNEM_TOOL_ERROR";
    const message = safe.content.find((item) => item?.type === "text")?.text || "The tool returned an error.";
    const runtimeError = structuredRuntimeError(new VnemRuntimeError(message, {
      code: legacyCode,
      category: "tool_operation",
      blocked_by_permission: /permission|approval|blocked/.test(String(legacyCode)),
      safe_next_action: safe.structuredContent?.safe_next_action || "Follow the tool's redacted error guidance before retrying.",
      rollback_state: context.mutation_started ? "check_tool_evidence" : "not_started",
      evidence_id: safe.structuredContent?.evidence_id || null,
      details: safe.structuredContent
    }), { tool_name: toolName, ...context });
    safe.structuredContent = { ...(safe.structuredContent || {}), runtime_error: runtimeError };
  }
  return safe;
}

export function redact(value) {
  if (value === null || value === undefined) return value;
  return String(value).replace(SECRET_PATTERN, "[REDACTED]");
}

function redactDetails(details) {
  if (details === undefined) return undefined;
  if (details === null) return null;
  if (Array.isArray(details)) return details.map(redactDetails);
  if (typeof details === "object") return Object.fromEntries(Object.entries(details).map(([key, value]) => [key, redactDetails(value)]));
  return typeof details === "string" ? redact(details) : details;
}

function redactResult(result) {
  const clone = structuredClone(result);
  if (Array.isArray(clone.content)) {
    clone.content = clone.content.map((item) => item?.type === "text" ? { ...item, text: redact(item.text) } : item);
  }
  if (clone.structuredContent) clone.structuredContent = redactDetails(clone.structuredContent);
  return clone;
}
