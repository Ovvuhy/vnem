import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import TOML from "@iarna/toml";

export const CLOUDFLARE_MUTATION_APPROVAL_PHRASE = "I APPROVE CLOUDFLARE MUTATION";
export const CLOUDFLARE_DESTRUCTIVE_APPROVAL_PHRASE = "I APPROVE CLOUDFLARE DESTRUCTIVE ACTION";
export const CLOUDFLARE_EVIDENCE_FILES = Object.freeze([
  "request_summary.json",
  "approval_record.json",
  "commands_run.txt",
  "stdout_redacted.txt",
  "stderr_redacted.txt",
  "cloudflare_result_redacted.json",
  "verification_result.json",
  "changed_resources.json",
  "rollback_hint.json",
  "diagnosis.json",
  "execution_status.json",
  "final_summary.md"
]);

const API_BASE = "https://api.cloudflare.com/client/v4";
const API_TIMEOUT_MS = 15_000;
const API_MAX_BYTES = 1024 * 1024;
const VERIFY_MAX_BYTES = 256 * 1024;
const MAX_API_PAGES = 3;
const MAX_ARTIFACT_FILES = 2_000;
const MAX_ARTIFACT_BYTES = 256 * 1024 * 1024;
const ENV_REFERENCE_NAME = /^[A-Z_][A-Z0-9_]{1,127}$/;
const VARIABLE_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;
const SAFE_PACKAGE_SCRIPT = /^[A-Za-z0-9:_-]+$/;
const CONTROL_OPERATOR_PATTERN = /[;&|`<>\r\n]/;
const PRIVATE_HOST_PATTERN = /^(?:localhost|0\.0\.0\.0|127(?:\.\d{1,3}){3}|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|169\.254(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}|\[?::1\]?)$/i;

export class CloudflareControlError extends Error {
  constructor(message, code = "cloudflare_control_error", details = {}) {
    super(message);
    this.name = "CloudflareControlError";
    this.code = code;
    this.details = redactDeep(details);
  }
}

export class CloudflareControlRuntime {
  constructor(options = {}) {
    this.allowedRoots = (options.allowedRoots || [process.cwd()]).map((item) => path.resolve(item));
    this.evidenceRoot = path.resolve(options.evidenceRoot || path.join(this.allowedRoots[0], ".vnem", "tool-runs"));
    this.repoRoot = path.resolve(options.repoRoot || this.allowedRoots[0]);
    this.env = options.env || process.env;
    this.fetchImpl = options.fetchImpl || globalThis.fetch;
    this.runProcess = options.runProcess;
    this.runProcessWithInput = options.runProcessWithInput;
    this.permissionProfile = options.permissionProfile || (() => "safe-readonly");
    this.commandTimeoutMs = options.commandTimeoutMs || 120_000;
    this.maxCommandOutputBytes = options.maxCommandOutputBytes || 256 * 1024;
    this.apiBase = resolveApiBase(this.env);
  }

  policy() {
    const profile = this.permissionProfile();
    return {
      capability_group: "cloudflare_control",
      preferred_strategy: [
        "Use a locally installed Wrangler through npx --no-install for Pages and Workers commands.",
        "Use the bounded Cloudflare API client for discovery, DNS, Pages rollback, and cache operations.",
        "Keep credentials in named environment references; never use cookies, browser sessions, or raw token output."
      ],
      permission_profile: profile,
      capability_status: profile === "dangerous-disabled" ? "disabled_by_profile" : profile === "safe-readonly" ? "read_only" : profile === "safe-local-dev" ? "dry_run_only" : "approval_gated_mutation_enabled",
      allowed_operations: allowedOperations(profile),
      mutation_approval_phrase: CLOUDFLARE_MUTATION_APPROVAL_PHRASE,
      destructive_approval_phrase: CLOUDFLARE_DESTRUCTIVE_APPROVAL_PHRASE,
      protected_resource_defaults: defaultProtectedResources(),
      secrets_redacted: true,
      no_cookie_session_auth: true,
      live_mutation_requires_real_provider_success: true
    };
  }

  async status(args = {}) {
    const version = await this.getWranglerVersion();
    const policy = this.policy();
    const tokenName = firstPresentName(this.env, ["CLOUDFLARE_API_TOKEN", "CF_API_TOKEN", "CF_TOKEN"]);
    const accountName = firstPresentName(this.env, ["CLOUDFLARE_ACCOUNT_ID", "CF_ACCOUNT_ID"]);
    const missing = [];
    if (!version.wrangler_available) missing.push("Install Wrangler locally in the project before command execution.");
    if (!tokenName) missing.push("Set a scoped Cloudflare API token outside the repository or authenticate Wrangler interactively.");
    let authDiagnosis = { checked: false, verified: false, reason: "live_check_not_requested" };
    if (args.live_check === true) {
      if (!tokenName) authDiagnosis = { checked: true, verified: false, reason: "api_token_missing" };
      else {
        try {
          const verification = await this.apiRequest("GET", "/user/tokens/verify");
          authDiagnosis = {
            checked: true,
            verified: verification.success === true,
            token_status: verification.result?.status || null,
            token_id_redacted: redactId(verification.result?.id),
            source: "cloudflare_api"
          };
        } catch (error) {
          const diagnosis = this.errorDiagnose({ operation: "auth_verify", code: error.code, message: error.message, status: error.details?.status });
          authDiagnosis = { checked: true, verified: false, reason: error.code || "auth_verify_failed", diagnosis };
        }
      }
    }
    return {
      wrangler_available: version.wrangler_available,
      wrangler_version: version.wrangler_version,
      wrangler_probe_method: version.probe_method,
      node_available: true,
      npx_probe_allowed: this.env.VNEM_TOOLS_ALLOW_NPX_WRANGLER_CHECK === "1",
      api_token_present: Boolean(tokenName),
      api_token_redacted: tokenName ? "[REDACTED]" : null,
      account_id_present: Boolean(accountName),
      credential_references: {
        api_token: tokenName ? { type: "environment", name: tokenName, value_exposed: false } : null,
        account_id: accountName ? { type: "environment", name: accountName, value_exposed: false } : null
      },
      auth_state: authDiagnosis.verified ? "api_token_verified" : tokenName ? "api_token_present_not_verified" : version.wrangler_available ? "wrangler_available_login_unknown" : "not_authenticated_detected",
      auth_diagnosis: authDiagnosis,
      permission_profile: this.permissionProfile(),
      capability_status: policy.capability_status,
      allowed_operations: policy.allowed_operations,
      blocked_operations: ["cookies", "browser_sessions", "browser_profile_scraping", "CAPTCHA_bypass", "account_billing_user_token_mutation", "printing_or_committing_tokens", "npx_network_install"],
      missing_setup: missing,
      recommended_next_step: missing.length ? missing[0] : args.live_check ? "Use read-only account/project discovery before planning a mutation." : "Run status with live_check=true for a bounded token verification, then use read-only discovery.",
      secrets_redacted: true,
      tools_can_mutate: ["approved-writes", "creator-power"].includes(this.permissionProfile()),
      no_cookie_session_auth: true
    };
  }

  authPlan(args = {}) {
    const full = /full|broad|authorized/i.test(args.access_goal || "");
    return {
      recommended_auth_method: full ? "Wrangler login plus separate scoped Cloudflare API tokens for the approved account and zone operations." : "Least-privilege Cloudflare API token references plus local Wrangler login only when a command flow needs it.",
      wrangler_login_steps: ["Install Wrangler locally in the project.", "Run npx --no-install wrangler login in a real terminal/browser.", "Verify with npx --no-install wrangler whoami.", "Use plan tools before any approved deploy or rollback."],
      api_token_steps: ["Create a scoped API token in Cloudflare.", "Limit account, project, zone, and permission scope to the intended operation.", "Store it in CLOUDFLARE_API_TOKEN or CF_API_TOKEN outside the repository.", "Verify through the bounded token status endpoint without printing the value."],
      needed_permissions: full ? ["Account Read", "Workers Scripts Edit", "Cloudflare Pages Edit", "Zone Read", "DNS Read/Edit", "Cache Purge"] : ["Account Read", "Cloudflare Pages Read/Edit for the selected account", "Workers Scripts Read/Edit for the selected account", "Zone DNS Read/Edit only for selected zones"],
      least_privilege_recommendation: "Prefer separate tokens per provider surface and constrain each token to the exact account or zone.",
      env_var_names: ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID", "CF_API_TOKEN", "CF_ACCOUNT_ID"],
      environment_reference_contract: { type: "environment", name_only_in_tool_output: true, raw_value_output: false },
      secret_storage_warning: "Do not commit, print, log, or include token values in evidence packs.",
      forbidden_auth_methods: ["cookies", "browser sessions", "browser profile scraping", "CAPTCHA bypass", "committed tokens", "printed tokens"],
      verification_command: "npx --no-install wrangler whoami",
      official_docs_grounding: ["Wrangler commands should use a local project installation.", "Pages production rollback uses the Cloudflare Pages deployment rollback API.", "Workers rollback targets a version ID and creates a new active deployment."]
    };
  }

  async accountsList(args = {}) {
    this.enforceRead();
    if (args.simulate) return { read_only: true, source: "simulated", accounts: [{ id_redacted: "acct...test", name: "simulated-account", type: "standard" }], secrets_redacted: true, live_provider_checked: false };
    const result = await this.apiList("/accounts");
    return {
      read_only: true,
      source: "api",
      accounts: result.items.map((account) => ({ id_redacted: redactId(account.id), name: account.name || "unknown", type: account.type || null })),
      success: true,
      pages_fetched: result.pages_fetched,
      truncated: result.truncated,
      live_provider_checked: true,
      secrets_redacted: true
    };
  }

  async projectsList(args = {}) {
    this.enforceRead();
    const accountId = this.accountId(args.account_id);
    if (args.simulate) {
      return {
        read_only: true,
        source: "simulated",
        pages_projects: [{ name: "simulated-pages", production_branch: "main", production_indicator: true }],
        workers_scripts: [{ id: "simulated-worker", production_indicator: true }],
        live_provider_checked: false,
        secrets_redacted: true
      };
    }
    if (!accountId) throw cloudflareError("CLOUDFLARE_ACCOUNT_ID is required for project discovery.", "cloudflare_account_id_required");
    const encoded = encodeURIComponent(accountId);
    const [pagesResult, workersResult] = await Promise.allSettled([
      this.apiList(`/accounts/${encoded}/pages/projects`),
      this.apiList(`/accounts/${encoded}/workers/scripts`)
    ]);
    const pages = pagesResult.status === "fulfilled" ? pagesResult.value : { items: [], error: summarizeError(pagesResult.reason) };
    const workers = workersResult.status === "fulfilled" ? workersResult.value : { items: [], error: summarizeError(workersResult.reason) };
    return {
      read_only: true,
      source: "api",
      account_id_redacted: redactId(accountId),
      pages_projects: pages.items.map((project) => ({
        name: project.name,
        production_branch: project.production_branch || null,
        production_indicator: Boolean(project.production_branch),
        subdomain: project.subdomain || null,
        latest_deployment: project.latest_deployment ? { id: redactId(project.latest_deployment.id), environment: project.latest_deployment.environment, status: project.latest_deployment.latest_stage?.status || null } : null
      })),
      workers_scripts: workers.items.map((worker) => ({ id: worker.id || worker.name, modified_on: worker.modified_on || null, production_indicator: true })),
      pages_success: !pages.error,
      workers_success: !workers.error,
      partial_failure: pages.error || workers.error ? { pages: pages.error || null, workers: workers.error || null } : null,
      live_provider_checked: true,
      secrets_redacted: true
    };
  }

  async pagesDeployPlan(args) {
    const root = await this.resolveRoot(args.project_dir || ".");
    const inspection = await inspectCloudflareProject(root.absolutePath, args);
    const risks = protectedRisks({ ...args, resource_name: args.project_name, resource_type: "pages_project" });
    const command = this.wranglerCommand(["pages", "deploy", inspection.build_output.relative_path, "--project-name", args.project_name, ...(args.branch ? ["--branch", args.branch] : [])]);
    return {
      command_plan: [command.display],
      detected_framework: inspection.framework,
      build_command: inspection.build.command,
      build_command_source: inspection.build.source,
      build_output: inspection.build_output,
      output_dir: inspection.build_output.relative_path,
      wrangler_config: inspection.wrangler_config,
      project_name: args.project_name,
      environment: args.environment || "preview",
      approval_required: true,
      mutation_type: "cloudflare_pages_deploy",
      protected_resource_risk: risks,
      evidence_to_collect: ["build command exit evidence", "artifact manifest and bounds", "Wrangler deploy output", "deployment URL from Wrangler/API output", "deployment URL and HTTP marker verification", "rollback target guidance"],
      dry_run_only: true,
      must_not_claim: ["Pages was deployed", "Deployment URL is live", "Production changed"]
    };
  }

  async workersDeployPlan(args) {
    const root = await this.resolveRoot(args.project_dir || ".");
    const inspection = await inspectCloudflareProject(root.absolutePath, args);
    const command = this.wranglerCommand(["deploy", ...(args.entrypoint ? [args.entrypoint] : []), ...(args.script_name ? ["--name", args.script_name] : []), ...(args.environment && args.environment !== "production" ? ["--env", args.environment] : [])]);
    return {
      command_plan: [command.display],
      detected_framework: inspection.framework,
      build_command: inspection.build.command,
      build_command_source: inspection.build.source,
      wrangler_config_detected: inspection.wrangler_config.detected,
      wrangler_config: inspection.wrangler_config,
      script_name: args.script_name || inspection.wrangler_config.name || null,
      entrypoint: args.entrypoint || inspection.wrangler_config.main || null,
      environment: args.environment || "preview",
      approval_required: true,
      mutation_type: "cloudflare_workers_deploy",
      protected_resource_risk: protectedRisks({ ...args, resource_name: args.script_name, resource_type: "worker" }),
      evidence_to_collect: ["build command exit evidence", "Wrangler deploy output", "Worker URL/version metadata", "bounded verification result", "rollback version guidance"],
      dry_run_only: true,
      must_not_claim: ["Worker was deployed", "Production Worker changed"]
    };
  }

  async pagesDeploy(args) {
    const plan = await this.pagesDeployPlan(args);
    if (args.dry_run !== false && args.simulate !== true) return { ...plan, dry_run: true, mutated: false, executed: false };
    this.enforceMutation("cloudflare_mutation", args, plan);
    return this.executeMutation("pages_deploy", args, plan, async (root) => {
      const commands = [];
      const build = await this.runBuildIfNeeded(root.absolutePath, plan.build_command, commands);
      const artifact = await inspectArtifact(path.join(root.absolutePath, plan.output_dir), root.absolutePath);
      if (!args.simulate && (!artifact.exists || artifact.file_count === 0)) throw cloudflareError("Pages build output is missing or empty; deployment was not attempted.", "cloudflare_build_output_missing", { build_output: artifact });
      const command = this.wranglerCommand(["pages", "deploy", plan.output_dir, "--project-name", args.project_name, ...(args.branch ? ["--branch", args.branch] : [])]);
      commands.push(command.display);
      const deploy = args.simulate ? simulatedResult("pages_deploy", { deployment_url: `https://${args.project_name}.pages.dev`, project_name: args.project_name }) : await this.executeCommand(command, root.absolutePath);
      this.requireCommandSuccess(deploy, "Cloudflare Pages deploy failed.", "cloudflare_pages_deploy_failed");
      const url = extractDeploymentUrl(`${deploy.stdout || ""}\n${deploy.stderr || ""}`) || deploy.deployment_url || null;
      if (!url && !args.simulate) throw cloudflareError("Wrangler completed without a deployment URL, so remote deployment identity is not proven.", "cloudflare_deployment_url_missing", { result: deploy });
      const verification = await this.deployVerify({ deployment_url: url || "", expected_status: 200, expected_body_marker: args.expected_body_marker || "", simulate: args.simulate === true });
      if (!args.simulate && !verification.verified) throw cloudflareError("Pages deployment verification did not satisfy the expected HTTP evidence.", "cloudflare_deployment_verification_failed", { verification });
      return {
        commands,
        stdout: `${build?.stdout || ""}\n${deploy.stdout || ""}`,
        stderr: `${build?.stderr || ""}\n${deploy.stderr || ""}`,
        result: { command_ok: deploy.ok, exit_code: deploy.exit_code ?? null, deployment_url: url, artifact },
        verification,
        changed: [{ type: "pages_project", name: args.project_name, environment: args.environment || "preview", deployment_url: url }],
        rollback: { hint: "List successful production Pages deployments and call the rollback tool with the exact previous deployment ID." }
      };
    });
  }

  async workersDeploy(args) {
    const plan = await this.workersDeployPlan(args);
    if (args.dry_run !== false && args.simulate !== true) return { ...plan, dry_run: true, mutated: false, executed: false };
    this.enforceMutation("cloudflare_mutation", args, plan);
    return this.executeMutation("workers_deploy", args, plan, async (root) => {
      const commands = [];
      const build = await this.runBuildIfNeeded(root.absolutePath, plan.build_command, commands);
      const command = this.wranglerCommand(["deploy", ...(args.entrypoint ? [args.entrypoint] : []), ...(args.script_name ? ["--name", args.script_name] : []), ...(args.environment && args.environment !== "production" ? ["--env", args.environment] : [])]);
      commands.push(command.display);
      const deploy = args.simulate ? simulatedResult("workers_deploy", { script_name: args.script_name || plan.script_name || "worker", deployment_url: "https://simulated-worker.workers.dev", version_id: "version-simulated" }) : await this.executeCommand(command, root.absolutePath);
      this.requireCommandSuccess(deploy, "Cloudflare Workers deploy failed.", "cloudflare_workers_deploy_failed");
      const output = `${deploy.stdout || ""}\n${deploy.stderr || ""}`;
      const url = extractDeploymentUrl(output) || deploy.deployment_url || null;
      const versionId = extractVersionId(output) || deploy.version_id || null;
      const verification = url ? await this.deployVerify({ deployment_url: url, expected_status: 200, simulate: args.simulate === true }) : { verified: false, status: "command_completed_metadata_missing", deployment_url: null, must_not_claim: ["Worker route was reached."] };
      return {
        commands,
        stdout: `${build?.stdout || ""}\n${deploy.stdout || ""}`,
        stderr: `${build?.stderr || ""}\n${deploy.stderr || ""}`,
        result: { command_ok: deploy.ok, exit_code: deploy.exit_code ?? null, deployment_url: url, version_id: redactId(versionId) },
        verification,
        changed: [{ type: "worker_script", name: args.script_name || plan.script_name || null, environment: args.environment || "preview", version_id: redactId(versionId), deployment_url: url }],
        rollback: { hint: versionId ? `Use the exact prior Worker version ID, not the newly deployed version ${redactId(versionId)}.` : "List Worker versions and select the exact prior stable version before rollback." }
      };
    });
  }

  async dnsPlan(args) {
    const risks = protectedRisks({ ...args, resource_type: "dns_record", resource_name: args.record_name });
    const operation = String(args.operation || "create").toLowerCase();
    if (!["create", "update", "delete"].includes(operation)) throw cloudflareError("DNS operation must be create, update, or delete.", "cloudflare_dns_operation_invalid");
    return {
      zone_name: args.zone_name,
      record_name: args.record_name,
      record_type: String(args.record_type || "").toUpperCase(),
      operation,
      proxied: args.proxied ?? null,
      ttl: args.ttl ?? null,
      approval_required: true,
      destructive_approval_required: operation === "delete",
      mutation_type: operation === "delete" ? "cloudflare_dns_delete" : "cloudflare_dns_mutation",
      protected_resource_risk: risks,
      existing_record_conflict: args.simulate ? "not_checked_in_simulation" : "checked_during_apply_when_authenticated",
      production_traffic_risk: risks.some((risk) => /root|apex|www|production/i.test(risk)),
      dry_run_only: true,
      values_redacted: true,
      must_not_claim: ["DNS was changed", "No production traffic risk", "Existing records were checked"]
    };
  }

  async dnsApply(args) {
    const plan = await this.dnsPlan(args);
    if (args.dry_run !== false && args.simulate !== true) return { ...plan, dry_run: true, mutated: false, executed: false };
    const destructive = plan.destructive_approval_required;
    this.enforceMutation(destructive ? "cloudflare_destructive" : "cloudflare_mutation", args, plan);
    return this.executeMutation("dns_apply", args, plan, async () => {
      const result = args.simulate ? simulatedResult("dns_apply", { operation: plan.operation, record_name: args.record_name }) : await this.applyDnsViaApi(args);
      return {
        commands: [`Cloudflare API DNS ${plan.operation} ${plan.record_type} ${args.record_name}`],
        stdout: JSON.stringify(result),
        stderr: "",
        result,
        verification: { status: args.simulate ? "simulated" : "api_read_after_write", success: result.success !== false, before_record_present: Boolean(result.before), after_record_present: Boolean(result.after) },
        changed: [{ type: "dns_record", zone_name: args.zone_name, name: args.record_name, record_type: plan.record_type, operation: plan.operation, value_redacted: redactDnsValue(plan.record_type, args.record_value) }],
        rollback: { hint: plan.operation === "delete" ? "Recreate the exact prior record from separately retained provider evidence." : "Restore the exact prior record or delete the newly created record after a fresh read." }
      };
    }, { destructive });
  }

  envPlan(args) {
    const risks = protectedRisks({ ...args, resource_type: `${args.target_type}_env`, resource_name: args.target_name });
    const variables = asArray(args.variables).map((variable) => normalizeVariablePlan(variable));
    return {
      target_type: args.target_type,
      target_name: args.target_name,
      environment: args.environment,
      variables,
      approval_required: true,
      mutation_type: "cloudflare_env_secrets_mutation",
      protected_resource_risk: risks,
      values_redacted: true,
      raw_values_required: false,
      supported_value_reference: { type: "environment", value_exposed: false },
      before_after_evidence_policy: "names and provider status only; never values",
      dry_run_only: true,
      must_not_claim: ["Secret values were printed", "Env/secrets were changed"]
    };
  }

  async envApply(args) {
    const plan = this.envPlan(args);
    if (args.dry_run !== false && args.simulate !== true) return { ...plan, dry_run: true, mutated: false, executed: false };
    this.enforceMutation("cloudflare_mutation", args, plan);
    return this.executeMutation("env_apply", args, plan, async (root) => {
      const commands = [];
      const results = [];
      for (const variable of asArray(args.variables)) {
        const normalized = normalizeVariablePlan(variable);
        const operation = normalized.operation;
        if (normalized.secret === false && !args.simulate) throw cloudflareError("Real plain-text variable mutation is not supported by this secret-only command path.", "cloudflare_plain_var_real_apply_not_implemented", { variable_name: normalized.name });
        const wranglerArgs = args.target_type === "pages"
          ? ["pages", "secret", operation === "delete" ? "delete" : "put", normalized.name, "--project-name", args.target_name]
          : ["secret", operation === "delete" ? "delete" : "put", normalized.name, "--name", args.target_name, ...(args.environment && args.environment !== "production" ? ["--env", args.environment] : [])];
        const command = this.wranglerCommand(wranglerArgs);
        commands.push(command.display);
        if (!args.simulate) {
          let result;
          if (operation === "delete") result = await this.executeCommand(command, root.absolutePath);
          else {
            const value = this.resolveVariableValue(variable);
            result = await this.executeCommand(command, root.absolutePath, `${value}\n`, [value]);
          }
          this.requireCommandSuccess(result, "Cloudflare secret operation failed.", "cloudflare_env_apply_failed", { variable_name: normalized.name });
          results.push({ ok: true, exit_code: result.exit_code ?? null, variable_name: normalized.name });
        }
      }
      const result = args.simulate ? simulatedResult("env_apply", { variables: plan.variables }) : { success: true, results };
      return {
        commands,
        stdout: JSON.stringify(result),
        stderr: "",
        result,
        verification: { status: args.simulate ? "simulated" : "wrangler_completed", values_redacted: true, raw_values_logged: false },
        changed: plan.variables.map((variable) => ({ ...variable, value: "[REDACTED]" })),
        rollback: { hint: "Restore prior variable names using fresh external secret references; prior values are intentionally absent from evidence." }
      };
    });
  }

  async deployVerify(args = {}) {
    if (args.simulate) {
      return {
        deployment_url: args.deployment_url || null,
        http_response_received: true,
        reachable: true,
        verified: false,
        http_status: args.expected_status || 200,
        status_matched: true,
        metadata_checked: false,
        marker_matched: args.expected_body_marker ? true : null,
        browser_evidence_handoff_recommended: true,
        safe_to_claim: ["Simulated deployment verification only."],
        must_not_claim: ["Real deployment URL was reached."]
      };
    }
    if (!args.deployment_url) return { deployment_url: null, reachable: false, verified: false, http_status: null, metadata_checked: false, must_not_claim: ["Deployment URL is reachable."] };
    let target = validateVerificationUrl(args.deployment_url, this.env);
    let response;
    for (let redirect = 0; redirect <= 3; redirect += 1) {
      response = await this.fetchWithTimeout(target, { method: "GET", redirect: "manual" }, API_TIMEOUT_MS);
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      const location = response.headers.get("location");
      if (!location || redirect === 3) throw cloudflareError("Deployment verification redirect limit reached.", "cloudflare_verify_redirect_limit", { status: response.status });
      target = validateVerificationUrl(new URL(location, target).toString(), this.env);
    }
    const text = await readBoundedResponse(response, VERIFY_MAX_BYTES, "cloudflare_verify_response_too_large");
    const expectedStatus = Number(args.expected_status || 200);
    const statusMatched = response.status === expectedStatus;
    const markerMatched = args.expected_body_marker ? text.includes(args.expected_body_marker) : null;
    const titleMatched = args.expected_title ? text.includes(`<title>${args.expected_title}</title>`) || text.includes(args.expected_title) : null;
    let metadata = null;
    if (args.account_id && args.project_name && args.deployment_id) {
      const accountId = this.accountId(args.account_id);
      const json = await this.apiRequest("GET", `/accounts/${encodeURIComponent(accountId)}/pages/projects/${encodeURIComponent(args.project_name)}/deployments/${encodeURIComponent(args.deployment_id)}`);
      metadata = { checked: true, deployment_id_redacted: redactId(json.result?.id), environment: json.result?.environment || null, stage_status: json.result?.latest_stage?.status || null, url: json.result?.url || null };
    }
    const metadataMatched = metadata ? metadata.stage_status === "success" && (!metadata.url || normalizeUrl(metadata.url) === normalizeUrl(target)) : null;
    const verified = statusMatched && markerMatched !== false && titleMatched !== false && metadataMatched !== false;
    return {
      deployment_url: redactUrl(target),
      final_url: redactUrl(target),
      http_response_received: true,
      reachable: response.ok,
      verified,
      http_status: response.status,
      expected_status: expectedStatus,
      status_matched: statusMatched,
      response_bytes: Buffer.byteLength(text),
      response_truncated: false,
      metadata_checked: Boolean(metadata),
      metadata,
      marker_matched: markerMatched,
      title_matched: titleMatched,
      browser_evidence_handoff_recommended: true,
      safe_to_claim: verified ? ["The bounded deployment URL checks matched the requested HTTP and marker evidence."] : ["A bounded HTTP response was received, but all requested verification conditions did not pass."],
      must_not_claim: ["Full UI visual proof was collected unless separate browser evidence exists.", ...(verified ? [] : ["Deployment verification passed."])]
    };
  }

  async rollbackPlan(args, options = {}) {
    const targetType = args.target_type || "pages";
    let target = args.deployment_id || args.version_id || null;
    let discovery = { attempted: false, source: "explicit_target_or_not_requested" };
    if (args.simulate) {
      target = target || (targetType === "pages" ? "deployment-simulated-previous" : "version-simulated-previous");
      discovery = { attempted: true, source: "simulated", target_identified: true };
    } else if (targetType === "pages" && args.discover !== false && args.project_name && this.accountId(args.account_id)) {
      const deployments = await this.pageDeployments(args);
      const successfulProduction = deployments.filter((item) => item.environment === "production" && item.latest_stage?.status === "success");
      const candidate = args.deployment_id ? successfulProduction.find((item) => item.id === args.deployment_id) : successfulProduction[1];
      target = candidate?.id || target;
      discovery = {
        attempted: true,
        source: "cloudflare_pages_deployments_api",
        successful_production_deployments: successfulProduction.length,
        current_deployment_id_redacted: redactId(successfulProduction[0]?.id),
        target_id_redacted: redactId(candidate?.id),
        target_identified: Boolean(candidate)
      };
    } else if (targetType === "workers" && args.discover === true && args.script_name) {
      const command = this.wranglerCommand(["versions", "list", "--name", args.script_name, "--json"]);
      const root = await this.resolveRoot(args.project_dir || ".");
      const result = await this.executeCommand(command, root.absolutePath);
      this.requireCommandSuccess(result, "Workers version discovery failed.", "cloudflare_worker_version_discovery_failed");
      const versions = parseJsonArray(result.stdout);
      target = args.version_id || versions[1]?.id || null;
      discovery = { attempted: true, source: "wrangler_versions_list", versions_found: versions.length, target_id_redacted: redactId(target), target_identified: Boolean(target) };
    }
    const plan = {
      target_type: targetType,
      project_name: args.project_name || null,
      script_name: args.script_name || null,
      account_id_redacted: redactId(this.accountId(args.account_id)),
      deployment_id: targetType === "pages" ? redactId(target) : redactId(args.deployment_id),
      version_id: targetType === "workers" ? redactId(target) : redactId(args.version_id),
      target_id_available: Boolean(target),
      target_id_internal: target,
      discovery,
      approval_required: true,
      destructive_approval_required: true,
      protected_resource_risk: protectedRisks({ ...args, resource_type: "rollback", resource_name: args.project_name || args.script_name }),
      previous_deployment_identification: target ? "exact_target_identified" : "exact_previous_target_not_identified",
      dry_run_only: true,
      must_not_claim: ["Rollback was applied", ...(target ? [] : ["Previous version was identified with certainty."])]
    };
    return options.includeTarget === true ? plan : withoutInternalTarget(plan);
  }

  async rollback(args) {
    const plan = await this.rollbackPlan(args, { includeTarget: true });
    if (args.dry_run !== false && args.simulate !== true) return { ...withoutInternalTarget(plan), dry_run: true, mutated: false, executed: false };
    this.enforceMutation("cloudflare_destructive", args, plan);
    const targetId = plan.target_id_internal;
    if (!targetId) throw cloudflareError("Rollback requires an exact previously identified deployment or version ID.", "cloudflare_rollback_target_required", { rollback_plan: withoutInternalTarget(plan) });
    return this.executeMutation("rollback", args, withoutInternalTarget(plan), async (root) => {
      let result;
      let commands;
      if (args.simulate) {
        result = simulatedResult("rollback", { target_type: plan.target_type, target_id: redactId(targetId) });
        commands = [plan.target_type === "workers" ? `npx --no-install wrangler rollback ${redactId(targetId)}` : `Cloudflare API Pages rollback ${redactId(targetId)}`];
      } else if (plan.target_type === "workers") {
        const command = this.wranglerCommand(["rollback", targetId, ...(args.script_name ? ["--name", args.script_name] : []), "--message", args.rollback_message || "VNEM approved rollback"]);
        commands = [command.display];
        result = await this.executeCommand(command, root.absolutePath);
        this.requireCommandSuccess(result, "Workers rollback command failed.", "cloudflare_rollback_failed");
      } else {
        const accountId = this.accountId(args.account_id);
        if (!accountId) throw cloudflareError("Pages rollback requires CLOUDFLARE_ACCOUNT_ID.", "cloudflare_account_id_required");
        if (!args.project_name) throw cloudflareError("Pages rollback requires project_name.", "cloudflare_pages_project_required");
        commands = [`POST /accounts/${redactId(accountId)}/pages/projects/${args.project_name}/deployments/${redactId(targetId)}/rollback`];
        result = await this.apiRequest("POST", `/accounts/${encodeURIComponent(accountId)}/pages/projects/${encodeURIComponent(args.project_name)}/deployments/${encodeURIComponent(targetId)}/rollback`);
        if (result.result?.latest_stage?.status && result.result.latest_stage.status !== "success") throw cloudflareError("Pages rollback API did not return a successful deployment stage.", "cloudflare_pages_rollback_verification_failed", { stage_status: result.result.latest_stage.status });
      }
      return {
        commands,
        stdout: JSON.stringify(redactDeep(result)),
        stderr: "",
        result,
        verification: { status: args.simulate ? "simulated" : plan.target_type === "pages" ? "pages_api_rollback_accepted" : "wrangler_rollback_completed", provider_success: result.success !== false, target_id_redacted: redactId(targetId) },
        changed: [{ type: "rollback", target_type: plan.target_type, target: args.project_name || args.script_name, target_id_redacted: redactId(targetId) }],
        rollback: { hint: "Undoing this rollback requires a separately reviewed redeployment of the newer version." }
      };
    }, { destructive: true });
  }

  async cachePurgePlan(args) {
    const risks = protectedRisks({ ...args, resource_type: "cache", resource_name: args.zone_name });
    if (args.purge_everything) risks.push("purge_everything may affect the whole production zone cache");
    const files = asArray(args.files).map((file) => redactSecrets(file));
    return { zone_name: args.zone_name, files, purge_everything: args.purge_everything === true, scope_valid: args.purge_everything === true || files.length > 0, approval_required: true, mutation_type: "cloudflare_cache_purge", protected_resource_risk: risks, dry_run_only: true, must_not_claim: ["Cache was purged", "No user impact"] };
  }

  async cachePurge(args) {
    const plan = await this.cachePurgePlan(args);
    if (args.dry_run !== false && args.simulate !== true) return { ...plan, dry_run: true, mutated: false, executed: false };
    this.enforceMutation("cloudflare_mutation", args, plan);
    if (!plan.scope_valid) throw cloudflareError("Cache purge requires files or purge_everything=true.", "cloudflare_cache_purge_scope_required");
    return this.executeMutation("cache_purge", args, plan, async () => {
      let result = simulatedResult("cache_purge", { purge_everything: args.purge_everything === true });
      if (!args.simulate) {
        const zoneId = await this.zoneId(args.zone_name);
        const body = args.purge_everything ? { purge_everything: true } : { files: asArray(args.files).map(validatePurgeUrl) };
        result = await this.apiRequest("POST", `/zones/${encodeURIComponent(zoneId)}/purge_cache`, body);
      }
      return {
        commands: [`Cloudflare API cache purge ${args.zone_name}`],
        stdout: JSON.stringify(result),
        stderr: "",
        result,
        verification: { status: args.simulate ? "simulated" : "api_result", success: result.success !== false },
        changed: [{ type: "cache_purge", zone_name: args.zone_name, purge_everything: args.purge_everything === true, files: asArray(args.files).map((file) => redactSecrets(file)) }],
        rollback: { hint: "Cache purge is not reversible; verify origin health and observe recache." }
      };
    });
  }

  errorDiagnose(args = {}) {
    const text = `${args.operation || ""} ${args.code || ""} ${args.message || ""} ${args.stderr || ""} ${args.stdout || ""} ${args.status || ""}`.toLowerCase();
    let classification = "unknown_provider_failure";
    let retry = "Do not retry mutation until the provider error is understood.";
    let safeRetry = false;
    const nextSteps = [];
    if (/approval|permission_profile|protected_resource/.test(text)) {
      classification = "approval_or_local_policy";
      retry = "Review the plan and permission profile; retry only with the exact required approval and protected-resource acknowledgement.";
      nextSteps.push("Inspect the dry-run plan and active permission profile.");
    } else if (/401|authentication|unauthorized|token.*missing|auth_missing|10000/.test(text)) {
      classification = "authentication_or_token";
      retry = "Verify the scoped token reference with a read-only status call before retrying.";
      safeRetry = true;
      nextSteps.push("Run Cloudflare status with live_check=true.");
    } else if (/403|forbidden|permission|scope|9109/.test(text)) {
      classification = "provider_permission_scope";
      retry = "Adjust only the required account/zone permission scope, then repeat read-only discovery.";
      safeRetry = true;
      nextSteps.push("Confirm account, zone, and token permission scope.");
    } else if (/429|rate.?limit/.test(text)) {
      classification = "provider_rate_limit";
      retry = "Honor Retry-After and retry only idempotent reads automatically.";
      safeRetry = true;
      nextSteps.push("Wait for the provider retry window; do not replay mutation blindly.");
    } else if (/timeout|etimedout|econnreset|enotfound|network|fetch failed/.test(text)) {
      classification = "network_or_timeout";
      retry = "Retry a bounded read-only probe once network health is restored.";
      safeRetry = true;
      nextSteps.push("Check DNS/network reachability and repeat status or discovery first.");
    } else if (/build_failed|build failed|npm.*exit|artifact|output.*missing/.test(text)) {
      classification = "local_build_or_artifact";
      retry = "Fix the local build or output directory and rerun the plan before deployment.";
      nextSteps.push("Run the detected build command and inspect the bounded artifact manifest.");
    } else if (/wrangler.*config|pages_build_output_dir|configuration|no config/.test(text)) {
      classification = "wrangler_configuration";
      retry = "Reconcile the local Wrangler config with the selected project before deployment.";
      nextSteps.push("Inspect wrangler.toml, wrangler.json, or wrangler.jsonc and project discovery output.");
    } else if (/verify|marker|status.*mismatch|deployment_url_missing/.test(text)) {
      classification = "deployment_verification";
      retry = "Keep the mutation outcome separate from reachability proof and inspect the exact deployment URL or provider deployment record.";
      safeRetry = true;
      nextSteps.push("Run bounded deploy verification with an expected marker and exact provider deployment identity.");
    } else if (/4\d\d|validation|invalid|10020/.test(text)) {
      classification = "provider_validation";
      retry = "Correct the provider request shape; do not broaden credentials or force the mutation.";
      nextSteps.push("Inspect redacted provider error codes and request metadata.");
    }
    return {
      operation: args.operation || null,
      classification,
      safe_read_retry: safeRetry,
      mutation_retry_requires_fresh_approval: true,
      diagnosis_input_redacted: true,
      recommended_recovery: retry,
      exact_next_steps: nextSteps,
      must_not_claim: ["The failed operation changed Cloudflare successfully.", "A retry is safe without checking provider state."]
    };
  }

  mutationApprovalContract(args) {
    const destructive = args.destructive === true;
    const required = destructive ? CLOUDFLARE_DESTRUCTIVE_APPROVAL_PHRASE : CLOUDFLARE_MUTATION_APPROVAL_PHRASE;
    const approved = String(args.approval_phrase || "") === required;
    return { operation: args.operation, destructive, required_phrase: required, provided_phrase_exact_match: approved, approved, protected_resource_risk: asArray(args.protected_resource_risk), approval_missing_or_invalid: !approved, must_not_claim: approved ? [] : ["Mutation was approved", "Mutation was executed"] };
  }

  secretRedactionCheck(args = {}) {
    const text = String(args.text || "");
    const patterns = [];
    if (/cfut_[A-Za-z0-9_-]{10,}/.test(text)) patterns.push("cfut_token");
    if (/authorization\s*[:=]\s*bearer\s+[^\s\"'{}]+/i.test(text) || /bearer\s+[a-z0-9._~+/-]+/i.test(text)) patterns.push("authorization_bearer");
    if (/(CLOUDFLARE_API_TOKEN|CF_API_TOKEN|CF_TOKEN)\s*[:=]/i.test(text)) patterns.push("cloudflare_env_token");
    if (/X-Auth-Email\s*[:=]|X-Auth-Key\s*[:=]/i.test(text)) patterns.push("email_api_key_pair");
    if (/(?:secret|password|token|api[_-]?key)\s*[:=]\s*[^\s,;]{6,}/i.test(text)) patterns.push("generic_secret_value");
    const extraSecrets = [...asArray(args.secret_values), ...this.environmentSecretValues()].filter(Boolean);
    const redacted = redactSecrets(text, extraSecrets);
    const leakedExtras = extraSecrets.filter((value) => redacted.includes(value));
    return {
      leak_detected: patterns.length > 0 || leakedExtras.length > 0,
      detected_patterns: [...new Set(patterns)],
      redacted_output: redacted,
      redacted_output_safe: leakedExtras.length === 0 && !/cfut_[A-Za-z0-9_-]{10,}/.test(redacted) && !/Bearer\s+(?!\[REDACTED\]|$)[A-Za-z0-9._~+/-]{6,}/i.test(redacted),
      secrets_redacted: true,
      must_not_claim: patterns.length ? ["Original text was safe to log without redaction"] : []
    };
  }

  async evidencePackAudit(args) {
    const directory = path.resolve(args.evidence_pack_path);
    if (!isInside(directory, this.evidenceRoot) && !this.allowedRoots.some((root) => isInside(directory, root))) throw cloudflareError("Evidence pack must remain inside the configured evidence root or an allowed project root.", "cloudflare_evidence_path_outside_allowed_roots");
    const missing = [];
    const leakFiles = [];
    for (const file of CLOUDFLARE_EVIDENCE_FILES) {
      const target = path.join(directory, file);
      if (!existsSync(target)) {
        missing.push(file);
        continue;
      }
      const text = await readFile(target, "utf8");
      if (!this.secretRedactionCheck({ text }).redacted_output_safe || /cfut_[A-Za-z0-9_-]{10,}/.test(text)) leakFiles.push(file);
    }
    let execution = {};
    if (existsSync(path.join(directory, "execution_status.json"))) execution = JSON.parse(await readFile(path.join(directory, "execution_status.json"), "utf8"));
    return {
      evidence_pack_path: directory,
      required_files: CLOUDFLARE_EVIDENCE_FILES,
      missing_files: missing,
      complete: missing.length === 0 && leakFiles.length === 0,
      secret_leak_files: leakFiles,
      execution_status: execution.status || "unknown",
      simulated: execution.simulated === true,
      real_mutation_proven: missing.length === 0 && leakFiles.length === 0 && execution.status === "succeeded" && execution.simulated === false && execution.provider_success === true,
      prevents_fake_mutation_success_claims: existsSync(path.join(directory, "verification_result.json")) && existsSync(path.join(directory, "execution_status.json"))
    };
  }

  async getWranglerVersion() {
    if (this.env.VNEM_TOOLS_SKIP_WRANGLER_CHECK === "1" || !this.runProcess) return { wrangler_available: false, wrangler_version: null, probe_method: this.runProcess ? "skipped_by_env" : "runner_unavailable" };
    let result = await this.runProcess("wrangler", ["--version"], { cwd: this.repoRoot, timeoutMs: 3_000, maxOutputBytes: 2_000 });
    let probeMethod = "local_wrangler";
    if (!result.ok && this.env.VNEM_TOOLS_ALLOW_NPX_WRANGLER_CHECK === "1") {
      const command = this.wranglerCommand(["--version"]);
      result = await this.runProcess(command.command, command.args, { cwd: this.repoRoot, timeoutMs: 5_000, maxOutputBytes: 2_000 });
      probeMethod = "npx_no_install_wrangler";
    }
    const output = `${result.stdout || ""}\n${result.stderr || ""}`;
    const match = output.match(/(\d+\.\d+\.\d+)/);
    return { wrangler_available: result.ok || Boolean(match), wrangler_version: match?.[1] || null, probe_method: probeMethod };
  }

  async apiRequest(method, apiPath, body, options = {}) {
    const token = this.apiToken();
    if (!token) throw cloudflareError("Cloudflare API token missing.", "cloudflare_auth_missing");
    const methodUpper = String(method || "GET").toUpperCase();
    const retries = options.retries ?? (["GET", "HEAD"].includes(methodUpper) ? 2 : 0);
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const response = await this.fetchWithTimeout(`${this.apiBase}${apiPath}`, {
          method: methodUpper,
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
          redirect: "error"
        }, options.timeoutMs || API_TIMEOUT_MS);
        const text = await readBoundedResponse(response, API_MAX_BYTES, "cloudflare_api_response_too_large");
        const json = text ? parseJsonObject(text, "cloudflare_api_invalid_json") : {};
        if (response.ok && json.success !== false) return json;
        const retryable = [429, 500, 502, 503, 504].includes(response.status) && ["GET", "HEAD"].includes(methodUpper);
        const error = cloudflareError("Cloudflare API request failed.", "cloudflare_api_failed", { status: response.status, errors: json.errors || [], messages: json.messages || [], attempt: attempt + 1 });
        if (!retryable || attempt === retries) throw error;
        lastError = error;
        await delay(Math.min(200 * (attempt + 1), 500));
      } catch (error) {
        lastError = error instanceof CloudflareControlError ? error : cloudflareError("Cloudflare API network request failed.", "cloudflare_api_network_failed", { message: error.message, attempt: attempt + 1 });
        if (attempt === retries || !["GET", "HEAD"].includes(methodUpper)) throw lastError;
        await delay(Math.min(200 * (attempt + 1), 500));
      }
    }
    throw lastError;
  }

  async apiList(apiPath) {
    const items = [];
    let page = 1;
    let totalPages = 1;
    do {
      const separator = apiPath.includes("?") ? "&" : "?";
      const response = await this.apiRequest("GET", `${apiPath}${separator}page=${page}&per_page=50`);
      items.push(...asArray(response.result));
      totalPages = Math.max(1, Number(response.result_info?.total_pages || 1));
      page += 1;
    } while (page <= totalPages && page <= MAX_API_PAGES);
    return { items, pages_fetched: page - 1, total_pages: totalPages, truncated: totalPages >= page };
  }

  async fetchWithTimeout(url, init, timeoutMs) {
    if (typeof this.fetchImpl !== "function") throw cloudflareError("Fetch runtime is unavailable.", "cloudflare_fetch_unavailable");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await this.fetchImpl(url, { ...init, signal: controller.signal });
    } catch (error) {
      if (error?.name === "AbortError") throw cloudflareError("Cloudflare network request timed out.", "cloudflare_network_timeout", { timeout_ms: timeoutMs });
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async executeMutation(operation, args, plan, executor, options = {}) {
    const root = args.project_dir ? await this.resolveRoot(args.project_dir) : { absolutePath: this.allowedRoots[0] };
    try {
      const details = await executor(root);
      const simulated = args.simulate === true;
      const pack = await this.writeEvidencePack(operation, args, plan, { ...details, diagnosis: null, execution: { status: "succeeded", simulated, provider_success: !simulated && details.result?.success !== false } }, options);
      return {
        operation,
        dry_run: false,
        executed: true,
        mutated: !simulated,
        simulated,
        provider_success: !simulated && details.result?.success !== false,
        approval_verified: true,
        destructive_approval_verified: options.destructive === true,
        protected_resource_acknowledged: Boolean(args.protected_acknowledgment || !asArray(plan.protected_resource_risk).length),
        evidence_pack_path: pack.path,
        evidence_pack_id: pack.id,
        commands_run: details.commands || [],
        result_summary: redactDeep(details.result),
        verification_result: details.verification,
        changed_resources: details.changed || [],
        rollback_hint: details.rollback,
        safe_to_claim: simulated ? ["The simulated command path and evidence-pack contract completed; no Cloudflare resource changed."] : ["The provider command or API completed and the recorded verification states exactly what was checked."],
        must_not_claim: simulated ? ["Real Cloudflare resources changed.", "Deployment is live."] : details.verification?.verified === false ? ["Deployment reachability or requested marker verification passed."] : []
      };
    } catch (error) {
      const normalized = error instanceof CloudflareControlError ? error : cloudflareError(error.message || String(error), "cloudflare_execution_failed");
      const diagnosis = this.errorDiagnose({ operation, code: normalized.code, message: normalized.message, status: normalized.details?.status, stderr: normalized.details?.stderr || "" });
      const failure = {
        commands: normalized.details?.commands || [],
        stdout: normalized.details?.stdout || "",
        stderr: normalized.details?.stderr || normalized.message,
        result: { success: false, code: normalized.code },
        verification: { status: "failed", provider_success: false },
        changed: [],
        rollback: { hint: "Inspect remote state before retrying; a failed local command does not prove that no provider-side partial effect occurred." },
        diagnosis,
        execution: { status: "failed", simulated: args.simulate === true, provider_success: false }
      };
      const pack = await this.writeEvidencePack(operation, args, plan, failure, options).catch(() => null);
      throw cloudflareError(normalized.message, normalized.code, { ...normalized.details, diagnosis, evidence_pack_path: pack?.path || null, mutation_success_recorded: false });
    }
  }

  async writeEvidencePack(operation, args, plan, details, options = {}) {
    const id = `${new Date().toISOString().replace(/[:.]/g, "-")}-${operation}-${randomUUID().slice(0, 8)}`;
    const directory = path.join(this.evidenceRoot, "cloudflare", id);
    await mkdir(directory, { recursive: true });
    const approval = this.mutationApprovalContract({ operation, destructive: options.destructive === true, approval_phrase: args.approval_phrase || "", protected_resource_risk: asArray(plan.protected_resource_risk) });
    const execution = details.execution || { status: "unknown", simulated: args.simulate === true, provider_success: false };
    const files = {
      "request_summary.json": { operation, plan: withoutInternalTarget(redactDeep(plan)), simulate: args.simulate === true, permission_profile: this.permissionProfile() },
      "approval_record.json": approval,
      "commands_run.txt": asArray(details.commands).join("\n"),
      "stdout_redacted.txt": details.stdout || "",
      "stderr_redacted.txt": details.stderr || "",
      "cloudflare_result_redacted.json": redactDeep(details.result || {}),
      "verification_result.json": redactDeep(details.verification || {}),
      "changed_resources.json": redactDeep(details.changed || []),
      "rollback_hint.json": redactDeep(details.rollback || {}),
      "diagnosis.json": redactDeep(details.diagnosis || { classification: "none", operation_succeeded: execution.status === "succeeded" }),
      "execution_status.json": execution,
      "final_summary.md": [`# Cloudflare ${operation}`, `status: ${execution.status}`, `simulated: ${execution.simulated === true}`, `provider_success: ${execution.provider_success === true}`, `approval_verified: ${approval.approved}`, `changed_resources: ${asArray(details.changed).length}`, "secrets_redacted: true"].join("\n")
    };
    const secretValues = [...this.environmentSecretValues(), ...asArray(args.variables).map((variable) => variable.value).filter(Boolean)];
    for (const [name, value] of Object.entries(files)) {
      const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
      await writeFile(path.join(directory, name), redactSecrets(text, secretValues), "utf8");
    }
    return { id, path: directory };
  }

  enforceRead() {
    if (this.permissionProfile() === "dangerous-disabled") throw cloudflareError("Cloudflare read action blocked by the active permission profile.", "permission_profile_blocked", { permission_profile: this.permissionProfile() });
  }

  enforceMutation(actionType, args, plan) {
    const profile = this.permissionProfile();
    const destructive = actionType === "cloudflare_destructive";
    const mutationAllowed = ["approved-writes", "creator-power"].includes(profile);
    if ((destructive && profile !== "creator-power") || (!destructive && !mutationAllowed)) throw cloudflareError(`Cloudflare ${destructive ? "destructive" : "mutation"} action blocked by active permission profile ${profile}.`, "permission_profile_blocked", { permission_profile: profile, dry_run_plan: plan });
    const contract = this.mutationApprovalContract({ operation: actionType, destructive, approval_phrase: args.approval_phrase || "", protected_resource_risk: asArray(plan.protected_resource_risk) });
    if (!contract.approved) throw cloudflareError(destructive ? "Cloudflare destructive action requires exact destructive approval phrase." : "Cloudflare mutation requires exact mutation approval phrase.", destructive ? "cloudflare_destructive_approval_required" : "cloudflare_mutation_approval_required", { approval_contract: contract, dry_run_plan: plan });
    if (asArray(plan.protected_resource_risk).length && !String(args.protected_acknowledgment || "").trim()) throw cloudflareError("Protected Cloudflare resource action requires protected_acknowledgment.", "cloudflare_protected_resource_ack_required", { protected_resource_risk: plan.protected_resource_risk, dry_run_plan: plan });
  }

  async resolveRoot(input) {
    const candidate = path.isAbsolute(input || "") ? path.resolve(input) : path.resolve(this.allowedRoots[0], input || ".");
    let resolved;
    try {
      resolved = await realpath(candidate);
    } catch {
      throw cloudflareError("Cloudflare project directory does not exist.", "cloudflare_project_directory_missing", { project_dir: candidate });
    }
    if (!this.allowedRoots.some((root) => isInside(resolved, root))) throw cloudflareError("Cloudflare project directory is outside allowed roots.", "cloudflare_project_outside_allowed_roots", { project_dir: resolved });
    return { absolutePath: resolved };
  }

  wranglerCommand(args) {
    const command = "npx";
    const allArgs = ["--no-install", "wrangler", ...args.map(String)];
    return { command, args: allArgs, display: ["npx", ...allArgs].map(quoteDisplayArg).join(" ") };
  }

  async executeCommand(spec, cwd, input, extraSecrets = []) {
    if (!this.runProcess) throw cloudflareError("Cloudflare command runner is unavailable.", "cloudflare_command_runner_unavailable");
    const options = { cwd, timeoutMs: this.commandTimeoutMs, maxOutputBytes: this.maxCommandOutputBytes };
    const result = input === undefined
      ? await this.runProcess(spec.command, spec.args, options)
      : await this.runProcessWithInput(spec.command, spec.args, { ...options, input, extraSecrets });
    return redactCommandResult(result, extraSecrets);
  }

  async runBuildIfNeeded(cwd, commandText, commands) {
    if (!commandText) return null;
    const command = parseBuildCommand(commandText);
    commands.push(command.display);
    const result = await this.executeCommand(command, cwd);
    this.requireCommandSuccess(result, "Build failed; Cloudflare deploy was not attempted.", "cloudflare_build_failed");
    return result;
  }

  requireCommandSuccess(result, message, code, details = {}) {
    if (!result?.ok) throw cloudflareError(message, code, { ...details, exit_code: result?.exit_code ?? null, timed_out: result?.timed_out === true, stdout: result?.stdout || "", stderr: result?.stderr || "" });
  }

  resolveVariableValue(variable) {
    if (variable.value_reference) {
      const reference = variable.value_reference;
      if (reference.type !== "environment" || !ENV_REFERENCE_NAME.test(String(reference.name || ""))) throw cloudflareError("Cloudflare secret value_reference must name a valid environment variable.", "cloudflare_env_reference_invalid", { variable_name: variable.name });
      const value = this.env[reference.name];
      if (!value) throw cloudflareError("Referenced Cloudflare secret environment variable is missing.", "cloudflare_env_reference_missing", { variable_name: variable.name, reference_name: reference.name });
      return value;
    }
    throw cloudflareError("Real Cloudflare secret apply requires value_reference; raw values are accepted only by simulated compatibility tests.", "cloudflare_env_reference_required", { variable_name: variable.name });
  }

  async applyDnsViaApi(args) {
    const zoneId = await this.zoneId(args.zone_name);
    const name = normalizeDnsRecordName(args.record_name, args.zone_name);
    const type = String(args.record_type || "").toUpperCase();
    const existing = await this.apiRequest("GET", `/zones/${encodeURIComponent(zoneId)}/dns_records?type=${encodeURIComponent(type)}&name=${encodeURIComponent(name)}`);
    const current = asArray(existing.result)[0] || null;
    const operation = String(args.operation || "create").toLowerCase();
    let mutation;
    if (operation === "delete") {
      if (!current?.id) throw cloudflareError("DNS delete requested but matching record was not found.", "cloudflare_dns_record_not_found");
      mutation = await this.apiRequest("DELETE", `/zones/${encodeURIComponent(zoneId)}/dns_records/${encodeURIComponent(current.id)}`);
    } else {
      const body = { type, name, content: args.record_value, ttl: args.ttl || 1, proxied: args.proxied === true };
      if (operation === "update") {
        if (!current?.id) throw cloudflareError("DNS update requested but matching record was not found.", "cloudflare_dns_record_not_found");
        mutation = await this.apiRequest("PUT", `/zones/${encodeURIComponent(zoneId)}/dns_records/${encodeURIComponent(current.id)}`, body);
      } else {
        if (current?.id) throw cloudflareError("DNS create requested but a matching record already exists.", "cloudflare_dns_record_conflict", { record_id_redacted: redactId(current.id) });
        mutation = await this.apiRequest("POST", `/zones/${encodeURIComponent(zoneId)}/dns_records`, body);
      }
    }
    const afterResponse = await this.apiRequest("GET", `/zones/${encodeURIComponent(zoneId)}/dns_records?type=${encodeURIComponent(type)}&name=${encodeURIComponent(name)}`);
    return { success: mutation.success !== false, before: redactDnsRecord(current), after: redactDnsRecord(asArray(afterResponse.result)[0] || null), provider_result_id_redacted: redactId(mutation.result?.id) };
  }

  async zoneId(zoneName) {
    const response = await this.apiRequest("GET", `/zones?name=${encodeURIComponent(zoneName)}`);
    const zone = asArray(response.result)[0];
    if (!zone?.id) throw cloudflareError("Cloudflare zone not found or token lacks Zone Read.", "cloudflare_zone_not_found", { zone_name: zoneName });
    return zone.id;
  }

  async pageDeployments(args) {
    const accountId = this.accountId(args.account_id);
    if (!accountId) throw cloudflareError("Pages deployment discovery requires CLOUDFLARE_ACCOUNT_ID.", "cloudflare_account_id_required");
    const result = await this.apiList(`/accounts/${encodeURIComponent(accountId)}/pages/projects/${encodeURIComponent(args.project_name)}/deployments`);
    return result.items;
  }

  apiToken() {
    return this.env.CLOUDFLARE_API_TOKEN || this.env.CF_API_TOKEN || this.env.CF_TOKEN || "";
  }

  accountId(explicit) {
    return explicit || this.env.CLOUDFLARE_ACCOUNT_ID || this.env.CF_ACCOUNT_ID || "";
  }

  environmentSecretValues() {
    return [this.env.CLOUDFLARE_API_TOKEN, this.env.CF_API_TOKEN, this.env.CF_TOKEN].filter(Boolean);
  }
}

function allowedOperations(profile) {
  if (profile === "dangerous-disabled") return [];
  const read = ["status", "auth_plan", "accounts_list", "projects_list", "deploy_verify", "error_diagnose", "evidence_pack_audit", "mutation_approval_contract", "secret_redaction_check"];
  const plan = ["pages_deploy_plan", "workers_deploy_plan", "dns_plan", "env_plan", "rollback_plan", "cache_purge_plan"];
  if (profile === "safe-readonly") return read;
  if (profile === "safe-local-dev") return [...read, ...plan];
  const mutation = ["pages_deploy", "workers_deploy", "dns_create", "dns_update", "env_apply", "cache_purge"];
  if (profile === "approved-writes") return [...read, ...plan, ...mutation];
  if (profile === "creator-power") return [...read, ...plan, ...mutation, "dns_delete", "rollback", "destructive_delete_with_exact_phrase"];
  return read;
}

function defaultProtectedResources() {
  return ["production environments", "root/apex DNS records", "www DNS records", "MX records", "TXT records containing SPF/DKIM/DMARC", "active Pages production project", "active Worker production script", "account-level settings", "billing/account/user/token management", "anything marked protected by the user"];
}

async function inspectCloudflareProject(root, args) {
  const packagePath = path.join(root, "package.json");
  let pkg = {};
  if (existsSync(packagePath)) pkg = parseJsonObject(await readFile(packagePath, "utf8"), "cloudflare_package_json_invalid");
  const dependencies = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  const framework = detectFramework(dependencies, pkg.scripts || {});
  const wranglerConfig = await readWranglerConfig(root);
  const build = detectBuildCommand(args.build_command, pkg.scripts || {});
  const output = detectOutputDirectory(args.output_dir, wranglerConfig.values, framework);
  const absoluteOutput = path.resolve(root, output.path);
  if (!isInside(absoluteOutput, root)) throw cloudflareError("Detected build output is outside the project root.", "cloudflare_build_output_outside_root", { output_dir: output.path });
  const artifact = await inspectArtifact(absoluteOutput, root);
  return {
    framework,
    build,
    build_output: { ...artifact, relative_path: normalizePath(path.relative(root, absoluteOutput) || "."), detection_source: output.source },
    wrangler_config: wranglerConfig
  };
}

async function readWranglerConfig(root) {
  for (const name of ["wrangler.toml", "wrangler.json", "wrangler.jsonc"]) {
    const target = path.join(root, name);
    if (!existsSync(target)) continue;
    const text = await readFile(target, "utf8");
    if (name.endsWith(".toml")) {
      try {
        const values = TOML.parse(text);
        return { detected: true, file: name, format: "toml", parsed: true, name: values.name || null, main: values.main || null, pages_build_output_dir: values.pages_build_output_dir || null, values };
      } catch (error) {
        return { detected: true, file: name, format: "toml", parsed: false, parse_error: error.message, values: {} };
      }
    }
    if (name.endsWith(".json")) {
      try {
        const values = JSON.parse(text);
        return { detected: true, file: name, format: "json", parsed: true, name: values.name || null, main: values.main || null, pages_build_output_dir: values.pages_build_output_dir || null, values };
      } catch (error) {
        return { detected: true, file: name, format: "json", parsed: false, parse_error: error.message, values: {} };
      }
    }
    return { detected: true, file: name, format: "jsonc", parsed: false, parse_error: "JSONC is detected but not rewritten or heuristically parsed; Wrangler remains the source of truth.", values: {} };
  }
  return { detected: false, file: null, format: null, parsed: false, values: {} };
}

function detectFramework(dependencies, scripts) {
  const names = new Set(Object.keys(dependencies));
  const scriptText = Object.values(scripts).join(" ").toLowerCase();
  if (names.has("next") || /\bnext\s+(?:build|dev)/.test(scriptText)) return "next";
  if (names.has("astro") || /\bastro\s+build/.test(scriptText)) return "astro";
  if (names.has("@sveltejs/kit")) return "sveltekit";
  if (names.has("vite") || /\bvite\s+build/.test(scriptText)) return "vite";
  if (names.has("react-scripts") || /react-scripts\s+build/.test(scriptText)) return "create-react-app";
  return "unknown_or_static";
}

function detectBuildCommand(explicit, scripts) {
  if (String(explicit || "").trim()) return { command: String(explicit).trim(), source: "explicit" };
  if (typeof scripts.build === "string") return { command: "npm run build", source: "package_script" };
  return { command: "", source: "none" };
}

function detectOutputDirectory(explicit, config, framework) {
  if (String(explicit || "").trim()) return { path: String(explicit).trim(), source: "explicit" };
  if (typeof config.pages_build_output_dir === "string" && config.pages_build_output_dir.trim()) return { path: config.pages_build_output_dir.trim(), source: "wrangler_config" };
  const known = { vite: "dist", astro: "dist", "create-react-app": "build", next: ".vercel/output/static", sveltekit: ".svelte-kit/cloudflare" };
  return { path: known[framework] || "dist", source: known[framework] ? "framework_default" : "conservative_default" };
}

async function inspectArtifact(absolutePath, root) {
  if (!existsSync(absolutePath)) return { exists: false, is_directory: false, file_count: 0, total_bytes: 0, index_file_present: false, manifest_sha256: null, limits_exceeded: false, absolute_path_redacted: normalizePath(path.relative(root, absolutePath)) };
  const info = await stat(absolutePath);
  if (!info.isDirectory()) throw cloudflareError("Cloudflare build output must be a directory.", "cloudflare_build_output_not_directory", { output_path: normalizePath(path.relative(root, absolutePath)) });
  const files = [];
  const queue = [absolutePath];
  let totalBytes = 0;
  while (queue.length) {
    const directory = queue.shift();
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) queue.push(target);
      else if (entry.isFile()) {
        const fileInfo = await stat(target);
        totalBytes += fileInfo.size;
        files.push({ path: normalizePath(path.relative(absolutePath, target)), bytes: fileInfo.size });
        if (files.length > MAX_ARTIFACT_FILES || totalBytes > MAX_ARTIFACT_BYTES) throw cloudflareError("Cloudflare build output exceeds artifact inspection bounds.", "cloudflare_build_output_too_large", { file_count: files.length, total_bytes: totalBytes });
      }
    }
  }
  files.sort((left, right) => left.path.localeCompare(right.path));
  return {
    exists: true,
    is_directory: true,
    file_count: files.length,
    total_bytes: totalBytes,
    index_file_present: files.some((file) => file.path.toLowerCase() === "index.html"),
    manifest_sha256: createHash("sha256").update(JSON.stringify(files)).digest("hex"),
    limits_exceeded: false,
    sample_files: files.slice(0, 20),
    absolute_path_redacted: normalizePath(path.relative(root, absolutePath))
  };
}

function parseBuildCommand(commandText) {
  const command = String(commandText || "").trim();
  if (!command || CONTROL_OPERATOR_PATTERN.test(command)) throw cloudflareError("Unsafe build command blocked.", "cloudflare_build_command_blocked", { command: redactSecrets(command) });
  const tokens = command.split(/\s+/);
  const executable = tokens[0].toLowerCase().replace(/\.cmd$/, "");
  if (executable !== "npm") throw cloudflareError("Cloudflare build command must use a reviewed npm script.", "cloudflare_build_command_not_allowlisted", { command: redactSecrets(command) });
  if (tokens[1] === "test" && tokens.length === 2) return { command: "npm", args: ["test"], display: "npm test" };
  if (tokens[1] !== "run" || !tokens[2] || !SAFE_PACKAGE_SCRIPT.test(tokens[2]) || tokens.length !== 3) throw cloudflareError("Cloudflare build command must be exactly npm run <reviewed-script>.", "cloudflare_build_command_not_allowlisted", { command: redactSecrets(command) });
  return { command: "npm", args: ["run", tokens[2]], display: `npm run ${tokens[2]}` };
}

function protectedRisks(args = {}) {
  const resources = [...defaultProtectedResources(), ...asArray(args.protected_resources)];
  const risks = [];
  const name = String(args.record_name || args.resource_name || args.project_name || args.script_name || "").toLowerCase();
  const type = String(args.record_type || "").toUpperCase();
  const value = String(args.record_value || "").toLowerCase();
  const environment = String(args.environment || "").toLowerCase();
  if (environment === "production") risks.push("production environment protected by default");
  if (name === "@" || (args.zone_name && name === String(args.zone_name).toLowerCase())) risks.push("root/apex DNS record protected by default");
  if (name === "www" || name.startsWith("www.")) risks.push("www DNS record protected by default");
  if (type === "MX") risks.push("MX mail record protected by default");
  if (type === "TXT" && /(spf|dkim|dmarc|v=spf1|_dmarc|domainkey)/i.test(`${name} ${value}`)) risks.push("TXT SPF/DKIM/DMARC mail record protected by default");
  for (const item of resources) if (item && name && String(item).toLowerCase().includes(name)) risks.push(`user protected resource match: ${item}`);
  return [...new Set(risks)];
}

function normalizeVariablePlan(variable = {}) {
  const name = String(variable.name || "");
  if (!VARIABLE_NAME.test(name)) throw cloudflareError("Cloudflare variable name is invalid.", "cloudflare_env_name_invalid", { variable_name: name });
  const operation = String(variable.operation || "put").toLowerCase();
  if (!["put", "delete"].includes(operation)) throw cloudflareError("Cloudflare variable operation must be put or delete.", "cloudflare_env_operation_invalid", { variable_name: name });
  const reference = variable.value_reference ? { type: variable.value_reference.type || null, name: variable.value_reference.name || null, value_exposed: false } : null;
  return { name, secret: variable.secret !== false, operation, value: "[REDACTED]", value_source: reference ? "environment_reference" : variable.value !== undefined ? "raw_value_compatibility_input" : operation === "delete" ? "not_required" : "missing", value_reference: reference };
}

function resolveApiBase(env) {
  const custom = env.VNEM_TOOLS_CLOUDFLARE_API_BASE_URL;
  if (!custom) return API_BASE;
  if (env.VNEM_TOOLS_CLOUDFLARE_TEST_MODE !== "1") throw cloudflareError("Custom Cloudflare API base is allowed only in explicit test mode.", "cloudflare_custom_api_base_blocked");
  const url = new URL(custom);
  if (!["http:", "https:"].includes(url.protocol) || !PRIVATE_HOST_PATTERN.test(url.hostname) || url.username || url.password) throw cloudflareError("Test Cloudflare API base must be an uncredentialed loopback URL.", "cloudflare_test_api_base_invalid");
  return url.toString().replace(/\/$/, "");
}

function validateVerificationUrl(value, env) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw cloudflareError("Deployment verification URL is invalid.", "cloudflare_verify_url_invalid");
  }
  const testLoopback = env.VNEM_TOOLS_CLOUDFLARE_TEST_MODE === "1" && PRIVATE_HOST_PATTERN.test(url.hostname);
  if ((!testLoopback && url.protocol !== "https:") || (PRIVATE_HOST_PATTERN.test(url.hostname) && !testLoopback) || url.username || url.password) throw cloudflareError("Deployment verification URL must be public HTTPS; loopback is limited to explicit test mode.", "cloudflare_verify_url_blocked", { protocol: url.protocol, hostname: url.hostname });
  return url.toString();
}

async function readBoundedResponse(response, maxBytes, code) {
  const length = Number(response.headers.get("content-length") || 0);
  if (length > maxBytes) throw cloudflareError("Cloudflare response exceeded the configured byte limit.", code, { content_length: length, max_bytes: maxBytes });
  if (!response.body?.getReader) {
    const text = await response.text();
    if (Buffer.byteLength(text) > maxBytes) throw cloudflareError("Cloudflare response exceeded the configured byte limit.", code, { max_bytes: maxBytes });
    return text;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw cloudflareError("Cloudflare response exceeded the configured byte limit.", code, { max_bytes: maxBytes });
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function parseJsonObject(text, code) {
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("expected object");
    return value;
  } catch (error) {
    throw cloudflareError("JSON response or configuration is invalid.", code, { message: error.message });
  }
}

function parseJsonArray(text) {
  try {
    const value = JSON.parse(String(text || ""));
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function redactDeep(value) {
  if (Array.isArray(value)) return value.map(redactDeep);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => {
    if (/value|token|secret|password|credential|api[_-]?key|target_id_internal/i.test(key) && typeof item === "string") return [key, "[REDACTED]"];
    return [key, redactDeep(item)];
  }));
  return typeof value === "string" ? redactSecrets(value) : value;
}

function redactSecrets(value, extraSecrets = []) {
  let text = String(value ?? "");
  for (const secret of extraSecrets.filter(Boolean).sort((left, right) => String(right).length - String(left).length)) text = text.split(String(secret)).join("[REDACTED]");
  return text
    .replace(/cfut_[A-Za-z0-9_-]{10,}/g, "[REDACTED]")
    .replace(/(authorization\s*[:=]\s*bearer\s+)[^\s\"'{}]+/gi, "$1[REDACTED]")
    .replace(/(CLOUDFLARE_API_TOKEN|CF_API_TOKEN|CF_TOKEN)\s*[:=]\s*[^\s\"']+/gi, "$1=[REDACTED]")
    .replace(/(X-Auth-Key\s*[:=]\s*)[^\s\"']+/gi, "$1[REDACTED]");
}

function redactCommandResult(result, extraSecrets = []) {
  return { ...result, stdout: redactSecrets(result?.stdout || "", extraSecrets), stderr: redactSecrets(result?.stderr || "", extraSecrets) };
}

function redactDnsRecord(record) {
  if (!record) return null;
  return { id_redacted: redactId(record.id), name: record.name || null, type: record.type || null, content: redactDnsValue(record.type, record.content), proxied: record.proxied ?? null, ttl: record.ttl ?? null };
}

function redactDnsValue(type, value) {
  return /TXT|MX/i.test(type || "") ? "[REDACTED]" : redactSecrets(value || "");
}

function redactId(value) {
  const text = String(value || "");
  if (!text) return null;
  return text.length <= 8 ? "[REDACTED_ID]" : `${text.slice(0, 4)}...${text.slice(-4)}`;
}

function redactUrl(value) {
  const url = value instanceof URL ? new URL(value) : new URL(value);
  url.username = "";
  url.password = "";
  for (const key of [...url.searchParams.keys()]) if (/token|key|secret|signature|auth/i.test(key)) url.searchParams.set(key, "[REDACTED]");
  return url.toString();
}

function normalizeUrl(value) {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return String(value || "");
  }
}

function normalizeDnsRecordName(recordName, zoneName) {
  const name = String(recordName || "").trim();
  if (name === "@") return zoneName;
  if (name.endsWith(`.${zoneName}`) || name === zoneName) return name;
  return `${name}.${zoneName}`;
}

function validatePurgeUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw cloudflareError("Cache purge file must be a valid URL.", "cloudflare_cache_file_invalid");
  }
  if (url.protocol !== "https:" || PRIVATE_HOST_PATTERN.test(url.hostname) || url.username || url.password) throw cloudflareError("Cache purge files must be public HTTPS URLs without credentials.", "cloudflare_cache_file_blocked");
  return url.toString();
}

function withoutInternalTarget(value) {
  if (!value || typeof value !== "object") return value;
  const { target_id_internal, ...rest } = value;
  return rest;
}

function summarizeError(error) {
  return { code: error?.code || "cloudflare_read_failed", message: error?.message || String(error), details: redactDeep(error?.details || {}) };
}

function simulatedResult(kind, extra = {}) {
  return { ok: true, code: 0, success: true, simulated: true, kind, id: `${kind}-simulated`, stdout: `${kind} simulated ok`, stderr: "", ...extra };
}

function extractDeploymentUrl(text) {
  const match = String(text || "").match(/https?:\/\/[^\s)\]}]+/);
  return match ? match[0].replace(/[.,;]+$/, "") : null;
}

function extractVersionId(text) {
  const match = String(text || "").match(/(?:version(?:\s+id)?|version_id)\s*[:=]\s*([a-f0-9-]{16,})/i);
  return match?.[1] || null;
}

function firstPresentName(env, names) {
  return names.find((name) => Boolean(env[name])) || null;
}

function quoteDisplayArg(value) {
  const text = String(value);
  return /[\s\"]/.test(text) ? `"${text.replace(/"/g, '\\"')}"` : text;
}

function normalizePath(value) {
  return String(value || "").replace(/\\/g, "/");
}

function asArray(value) {
  return Array.isArray(value) ? value : value == null ? [] : [value];
}

function isInside(candidate, root) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function cloudflareError(message, code, details = {}) {
  return new CloudflareControlError(message, code, details);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
