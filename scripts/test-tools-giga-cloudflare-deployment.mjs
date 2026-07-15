#!/usr/bin/env node
import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const benchmarkArg = process.argv.find((arg) => arg.startsWith("--benchmark-output="));
const benchmarkOutput = benchmarkArg ? safeOutputPath(benchmarkArg.slice("--benchmark-output=".length)) : null;
await mkdir(path.join(repoRoot, ".tmp"), { recursive: true });
const tempRoot = await mkdtemp(path.join(repoRoot, ".tmp", "cloudflare-phase20-"));
const evidenceRoot = path.join(tempRoot, ".vnem", "tool-runs");
const secretValue = "phase20-secret-reference-must-never-appear";
const apiCalls = [];
const timings = {};
let dnsRecord = null;
let server;
let client;
let transport;

const phaseTools = [
  "vnem_tools_cloudflare_status",
  "vnem_tools_cloudflare_auth_plan",
  "vnem_tools_cloudflare_accounts_list",
  "vnem_tools_cloudflare_projects_list",
  "vnem_tools_cloudflare_pages_deploy_plan",
  "vnem_tools_cloudflare_pages_deploy",
  "vnem_tools_cloudflare_workers_deploy_plan",
  "vnem_tools_cloudflare_workers_deploy",
  "vnem_tools_cloudflare_dns_plan",
  "vnem_tools_cloudflare_dns_apply",
  "vnem_tools_cloudflare_env_plan",
  "vnem_tools_cloudflare_env_apply",
  "vnem_tools_cloudflare_deploy_verify",
  "vnem_tools_cloudflare_rollback_plan",
  "vnem_tools_cloudflare_rollback",
  "vnem_tools_cloudflare_cache_purge_plan",
  "vnem_tools_cloudflare_cache_purge",
  "vnem_tools_cloudflare_error_diagnose"
];

try {
  await createProjectFixture(tempRoot);
  server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://127.0.0.1");
      if (["/deployment", "/worker"].includes(url.pathname)) {
        const body = "<!doctype html><title>Phase 20 Fixture</title><main>phase20-marker deployed safely</main>";
        response.writeHead(200, { "content-type": "text/html; charset=utf-8", "content-length": Buffer.byteLength(body) });
        response.end(body);
        return;
      }
      assert.equal(request.headers.authorization, "Bearer cfut_phase20_local_fixture_token_1234567890");
      apiCalls.push({ method: request.method, path: url.pathname, query: [...url.searchParams.keys()].sort() });
      const baseUrl = `http://127.0.0.1:${server.address().port}`;
      const apiPath = url.pathname.replace(/^\/client\/v4/, "");
      if (request.method === "GET" && apiPath === "/user/tokens/verify") return sendJson(response, 200, success({ id: "token-phase20-12345678", status: "active" }));
      if (request.method === "GET" && apiPath === "/accounts") return sendJson(response, 200, success([{ id: "account-phase20-12345678", name: "Phase 20 Account", type: "standard" }], pageInfo()));
      if (request.method === "GET" && apiPath === "/accounts/account-phase20-12345678/pages/projects") {
        return sendJson(response, 200, success([{ name: "demo-pages", production_branch: "main", subdomain: "demo-pages.pages.dev", latest_deployment: { id: "deployment-current-12345678", environment: "production", latest_stage: { status: "success" } } }], pageInfo()));
      }
      if (request.method === "GET" && apiPath === "/accounts/account-phase20-12345678/workers/scripts") return sendJson(response, 200, success([{ id: "demo-worker", modified_on: "2026-07-14T00:00:00Z" }], pageInfo()));
      if (request.method === "GET" && apiPath === "/accounts/account-phase20-12345678/pages/projects/demo-pages/deployments") {
        return sendJson(response, 200, success([
          pageDeployment("deployment-current-12345678", `${baseUrl}/deployment`, "2026-07-14T12:00:00Z"),
          pageDeployment("deployment-previous-12345678", `${baseUrl}/deployment`, "2026-07-13T12:00:00Z"),
          { ...pageDeployment("deployment-failed-12345678", `${baseUrl}/deployment`, "2026-07-12T12:00:00Z"), latest_stage: { status: "failure" } }
        ], pageInfo()));
      }
      if (request.method === "GET" && apiPath === "/accounts/account-phase20-12345678/pages/projects/demo-pages/deployments/deployment-current-12345678") return sendJson(response, 200, success(pageDeployment("deployment-current-12345678", `${baseUrl}/deployment`, "2026-07-14T12:00:00Z")));
      if (request.method === "POST" && apiPath === "/accounts/account-phase20-12345678/pages/projects/demo-pages/deployments/deployment-previous-12345678/rollback") return sendJson(response, 200, success(pageDeployment("deployment-rollback-12345678", `${baseUrl}/deployment`, "2026-07-14T13:00:00Z")));
      if (request.method === "GET" && apiPath === "/zones") return sendJson(response, 200, success([{ id: "zone-phase20-12345678", name: "example.com" }], pageInfo()));
      if (request.method === "GET" && apiPath === "/zones/zone-phase20-12345678/dns_records") return sendJson(response, 200, success(dnsRecord ? [dnsRecord] : [], pageInfo()));
      if (request.method === "POST" && apiPath === "/zones/zone-phase20-12345678/dns_records") {
        const body = await readJsonBody(request);
        dnsRecord = { id: "record-phase20-12345678", ...body };
        return sendJson(response, 200, success(dnsRecord));
      }
      if (request.method === "POST" && apiPath === "/zones/zone-phase20-12345678/purge_cache") {
        const body = await readJsonBody(request);
        assert.deepEqual(body, { files: ["https://example.com/app.js"] });
        return sendJson(response, 200, success({ id: "zone-phase20-12345678" }));
      }
      return sendJson(response, 404, { success: false, errors: [{ code: 1000, message: `unhandled ${request.method} ${apiPath}` }], result: null });
    } catch (error) {
      sendJson(response, 500, { success: false, errors: [{ code: 9999, message: error.message }], result: null });
    }
  });
  await new Promise((resolve, reject) => server.listen(0, "127.0.0.1", resolve).once("error", reject));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  ({ client, transport } = await connectTools(tempRoot, evidenceRoot, baseUrl, secretValue));

  const listed = await client.listTools();
  const names = new Set(listed.tools.map((tool) => tool.name));
  for (const name of phaseTools) assert.ok(names.has(name), `missing Phase 20 tool ${name}`);

  const coverage = await callValue(client, "vnem_tools_tool_test_coverage_map", { root: repoRoot, max_tools: 250 }, "tool_test_coverage_map");
  for (const name of phaseTools) {
    assert.equal(coverage.per_tool[name]?.coverage_level, "behavior_test", `coverage mapper missed Phase 20 behavior for ${name}`);
    assert.ok(coverage.per_tool[name].behavior_test_files.includes("scripts/test-tools-giga-cloudflare-deployment.mjs"), `coverage mapper did not attribute Phase 20 test to ${name}: ${JSON.stringify(coverage.per_tool[name])}`);
  }

  const status = await timed("status_live_ms", () => callValue(client, "vnem_tools_cloudflare_status", { live_check: true }, "cloudflare_status"));
  assert.equal(status.wrangler_available, true);
  assert.match(status.wrangler_version, /^4\./);
  assert.equal(status.auth_diagnosis.verified, true);
  assert.equal(status.credential_references.api_token.name, "CLOUDFLARE_API_TOKEN");
  assert.equal(status.credential_references.api_token.value_exposed, false);
  assert.doesNotMatch(JSON.stringify(status), /phase20_local_fixture_token/);

  const authPlan = await callValue(client, "vnem_tools_cloudflare_auth_plan", { access_goal: "least_privilege" }, "cloudflare_auth_plan");
  assert.equal(authPlan.environment_reference_contract.raw_value_output, false);
  assert.ok(authPlan.forbidden_auth_methods.includes("cookies"));

  const accounts = await timed("accounts_ms", () => callValue(client, "vnem_tools_cloudflare_accounts_list", {}, "cloudflare_accounts_list"));
  assert.equal(accounts.live_provider_checked, true);
  assert.equal(accounts.accounts[0].name, "Phase 20 Account");
  assert.match(accounts.accounts[0].id_redacted, /^acco\.\.\.5678$/);

  const projects = await timed("projects_ms", () => callValue(client, "vnem_tools_cloudflare_projects_list", {}, "cloudflare_projects_list"));
  assert.equal(projects.pages_success, true);
  assert.equal(projects.workers_success, true);
  assert.equal(projects.pages_projects[0].name, "demo-pages");
  assert.equal(projects.workers_scripts[0].id, "demo-worker");

  const pagesPlan = await callValue(client, "vnem_tools_cloudflare_pages_deploy_plan", { project_dir: ".", project_name: "demo-pages", branch: "feature-proof" }, "pages_deploy_plan");
  assert.equal(pagesPlan.detected_framework, "vite");
  assert.equal(pagesPlan.build_command, "npm run build");
  assert.equal(pagesPlan.build_command_source, "package_script");
  assert.equal(pagesPlan.output_dir, "dist");
  assert.equal(pagesPlan.build_output.detection_source, "wrangler_config");
  assert.equal(pagesPlan.wrangler_config.parsed, true);
  assert.match(pagesPlan.command_plan[0], /npx --no-install wrangler pages deploy dist/);

  const pages = await timed("pages_deploy_ms", () => callValue(client, "vnem_tools_cloudflare_pages_deploy", {
    project_dir: ".",
    project_name: "demo-pages",
    branch: "feature-proof",
    expected_body_marker: "phase20-marker",
    dry_run: false,
    approval_phrase: "I APPROVE CLOUDFLARE MUTATION"
  }, "pages_deploy"));
  assert.equal(pages.executed, true);
  assert.equal(pages.mutated, true);
  assert.equal(pages.simulated, false);
  assert.equal(pages.provider_success, true);
  assert.equal(pages.mutation_state, "real_mutation_provider_success_with_evidence");
  assert.equal(pages.approval_state, "mutation_approval_verified");
  assert.equal(pages.result_summary.exit_code, 0);
  assert.equal(pages.verification_result.verified, true);
  assert.equal(pages.verification_result.marker_matched, true);
  assert.equal(pages.result_summary.artifact.index_file_present, true);
  assert.ok(pages.evidence_pack_path);
  const pagesAudit = await callValue(client, "vnem_tools_evidence_pack_audit", { evidence_pack_path: pages.evidence_pack_path }, "evidence_pack_audit");
  assert.equal(pagesAudit.complete, true);
  assert.equal(pagesAudit.real_mutation_proven, true);
  assert.equal(pagesAudit.execution_status, "succeeded");

  const workersPlan = await callValue(client, "vnem_tools_cloudflare_workers_deploy_plan", { project_dir: ".", script_name: "demo-worker", environment: "preview" }, "workers_deploy_plan");
  assert.equal(workersPlan.wrangler_config_detected, true);
  assert.equal(workersPlan.entrypoint, "src/worker.mjs");
  const worker = await timed("workers_deploy_ms", () => callValue(client, "vnem_tools_cloudflare_workers_deploy", {
    project_dir: ".",
    script_name: "demo-worker",
    environment: "preview",
    dry_run: false,
    approval_phrase: "I APPROVE CLOUDFLARE MUTATION"
  }, "workers_deploy"));
  assert.equal(worker.mutated, true);
  assert.equal(worker.provider_success, true);
  assert.equal(worker.result_summary.exit_code, 0);
  assert.equal(worker.verification_result.verified, true);
  assert.match(worker.changed_resources[0].version_id, /^1111\.\.\.1111$/);

  const exactVerify = await callValue(client, "vnem_tools_cloudflare_deploy_verify", {
    deployment_url: `${baseUrl}/deployment`,
    expected_status: 200,
    expected_body_marker: "phase20-marker",
    expected_title: "Phase 20 Fixture",
    account_id: "account-phase20-12345678",
    project_name: "demo-pages",
    deployment_id: "deployment-current-12345678"
  }, "deploy_verify");
  assert.equal(exactVerify.verified, true);
  assert.equal(exactVerify.metadata_checked, true);
  assert.equal(exactVerify.metadata.stage_status, "success");
  const mismatch = await callValue(client, "vnem_tools_cloudflare_deploy_verify", { deployment_url: `${baseUrl}/deployment`, expected_body_marker: "missing-marker" }, "deploy_verify");
  assert.equal(mismatch.verified, false);
  assert.equal(mismatch.marker_matched, false);

  const envPlan = await callValue(client, "vnem_tools_cloudflare_env_plan", {
    target_type: "workers",
    target_name: "demo-worker",
    environment: "preview",
    variables: [{ name: "API_SECRET", secret: true, operation: "put", value_reference: { type: "environment", name: "PHASE20_SECRET_REFERENCE" } }]
  }, "env_plan");
  assert.equal(envPlan.variables[0].value_source, "environment_reference");
  assert.equal(envPlan.variables[0].value_reference.value_exposed, false);
  const envApply = await callValue(client, "vnem_tools_cloudflare_env_apply", {
    target_type: "workers",
    target_name: "demo-worker",
    environment: "preview",
    variables: [{ name: "API_SECRET", secret: true, operation: "put", value_reference: { type: "environment", name: "PHASE20_SECRET_REFERENCE" } }],
    dry_run: false,
    approval_phrase: "I APPROVE CLOUDFLARE MUTATION"
  }, "env_apply");
  assert.equal(envApply.mutated, true);
  assert.equal(envApply.result_summary.results[0].exit_code, 0);
  assert.doesNotMatch(JSON.stringify(envApply), /phase20-secret-reference/);
  assert.doesNotMatch(await readFile(path.join(envApply.evidence_pack_path, "stdout_redacted.txt"), "utf8"), /phase20-secret-reference/);

  const rawSecret = await callRaw(client, "vnem_tools_cloudflare_env_apply", {
    target_type: "workers",
    target_name: "demo-worker",
    environment: "preview",
    variables: [{ name: "RAW_SECRET", value: "raw-secret-must-be-blocked", secret: true, operation: "put" }],
    dry_run: false,
    approval_phrase: "I APPROVE CLOUDFLARE MUTATION"
  });
  assert.equal(rawSecret.isError, true);
  assert.equal(rawSecret.structuredContent.code, "cloudflare_env_reference_required");
  assert.doesNotMatch(JSON.stringify(rawSecret), /raw-secret-must-be-blocked/);

  const rollbackPlan = await timed("pages_rollback_plan_ms", () => callValue(client, "vnem_tools_cloudflare_rollback_plan", { target_type: "pages", project_name: "demo-pages", discover: true }, "rollback_plan"));
  assert.equal(rollbackPlan.target_id_available, true);
  assert.equal(rollbackPlan.discovery.target_identified, true);
  assert.match(rollbackPlan.deployment_id, /^depl\.\.\.5678$/);
  assert.equal(Object.hasOwn(rollbackPlan, "target_id_internal"), false);
  const pagesRollback = await timed("pages_rollback_ms", () => callValue(client, "vnem_tools_cloudflare_rollback", {
    target_type: "pages",
    project_name: "demo-pages",
    discover: true,
    dry_run: false,
    approval_phrase: "I APPROVE CLOUDFLARE DESTRUCTIVE ACTION"
  }, "rollback"));
  assert.equal(pagesRollback.mutated, true);
  assert.equal(pagesRollback.verification_result.status, "pages_api_rollback_accepted");
  assert.ok(apiCalls.some((call) => call.method === "POST" && call.path.endsWith("/deployment-previous-12345678/rollback")));

  const workerRollback = await callValue(client, "vnem_tools_cloudflare_rollback", {
    target_type: "workers",
    project_dir: ".",
    script_name: "demo-worker",
    version_id: "22222222-2222-2222-2222-222222222222",
    discover: false,
    rollback_message: "Phase 20 exact rollback proof",
    dry_run: false,
    approval_phrase: "I APPROVE CLOUDFLARE DESTRUCTIVE ACTION"
  }, "rollback");
  assert.equal(workerRollback.mutated, true);
  assert.equal(workerRollback.verification_result.status, "wrangler_rollback_completed");
  assert.ok(workerRollback.commands_run[0].includes("--message"));

  const dnsPlan = await callValue(client, "vnem_tools_cloudflare_dns_plan", {
    zone_name: "example.com",
    record_name: "app",
    record_type: "A",
    record_value: "192.0.2.20",
    operation: "create"
  }, "dns_plan");
  assert.equal(dnsPlan.production_traffic_risk, false);
  const dns = await callValue(client, "vnem_tools_cloudflare_dns_apply", {
    zone_name: "example.com",
    record_name: "app",
    record_type: "A",
    record_value: "192.0.2.20",
    operation: "create",
    dry_run: false,
    approval_phrase: "I APPROVE CLOUDFLARE MUTATION"
  }, "dns_apply");
  assert.equal(dns.mutated, true);
  assert.equal(dns.verification_result.before_record_present, false);
  assert.equal(dns.verification_result.after_record_present, true);

  const purgePlan = await callValue(client, "vnem_tools_cloudflare_cache_purge_plan", { zone_name: "example.com", files: ["https://example.com/app.js"] }, "cache_purge_plan");
  assert.equal(purgePlan.scope_valid, true);
  const purge = await callValue(client, "vnem_tools_cloudflare_cache_purge", {
    zone_name: "example.com",
    files: ["https://example.com/app.js"],
    dry_run: false,
    approval_phrase: "I APPROVE CLOUDFLARE MUTATION",
    protected_acknowledgment: "Scoped purge for the Phase 20 test zone is approved."
  }, "cache_purge");
  assert.equal(purge.mutated, true);
  assert.equal(purge.verification_result.success, true);

  await writeFile(path.join(tempRoot, "fail-pages.flag"), "fail", "utf8");
  const failedDeploy = await callRaw(client, "vnem_tools_cloudflare_pages_deploy", {
    project_dir: ".",
    project_name: "demo-pages",
    dry_run: false,
    approval_phrase: "I APPROVE CLOUDFLARE MUTATION"
  });
  assert.equal(failedDeploy.isError, true);
  assert.equal(failedDeploy.structuredContent.code, "cloudflare_pages_deploy_failed");
  assert.equal(failedDeploy.structuredContent.mutation_success_recorded, false);
  const failurePack = failedDeploy.structuredContent.evidence_pack_path;
  assert.ok(failurePack);
  const failureAudit = await callValue(client, "vnem_tools_evidence_pack_audit", { evidence_pack_path: failurePack }, "evidence_pack_audit");
  assert.equal(failureAudit.complete, true);
  assert.equal(failureAudit.execution_status, "failed");
  assert.equal(failureAudit.real_mutation_proven, false);
  await rm(path.join(tempRoot, "fail-pages.flag"), { force: true });

  const authDiagnosis = await callValue(client, "vnem_tools_cloudflare_error_diagnose", { operation: "deploy", status: 401, message: "Unauthorized token" }, "cloudflare_error_diagnosis");
  assert.equal(authDiagnosis.classification, "authentication_or_token");
  const buildDiagnosis = await callValue(client, "vnem_tools_cloudflare_error_diagnose", { operation: "pages deploy", code: "cloudflare_build_output_missing", message: "artifact missing" }, "cloudflare_error_diagnosis");
  assert.equal(buildDiagnosis.classification, "local_build_or_artifact");

  const simulated = await callValue(client, "vnem_tools_cloudflare_workers_deploy", {
    project_dir: ".",
    script_name: "demo-worker",
    simulate: true,
    approval_phrase: "I APPROVE CLOUDFLARE MUTATION"
  }, "workers_deploy");
  assert.equal(simulated.executed, true);
  assert.equal(simulated.simulated, true);
  assert.equal(simulated.mutated, false);
  assert.equal(simulated.provider_success, false);
  assert.equal(simulated.mutation_state, "simulated_no_mutation");

  const benchmark = {
    schema_version: "1.0.0",
    phase: 20,
    feature: "cloudflare_and_deployment",
    captured_at: new Date().toISOString(),
    real_stdio_mcp: true,
    real_local_build_and_command_execution: true,
    local_cloudflare_api_fixture: true,
    real_cloudflare_account_mutation: false,
    tools_exercised: phaseTools,
    timings_ms: timings,
    proof: {
      modular_runtime_active: true,
      local_wrangler_no_install_execution: true,
      live_auth_status_fixture: true,
      account_and_project_discovery: true,
      framework_build_and_output_detection: true,
      pages_deploy_command_and_http_marker_verification: true,
      workers_deploy_url_and_version_evidence: true,
      pages_api_rollback_to_discovered_previous_deployment: true,
      workers_exact_version_rollback: true,
      environment_reference_stdin_without_value_evidence: true,
      dns_read_after_write: true,
      cache_purge_scope: true,
      failed_deploy_cannot_record_mutation_success: true,
      simulated_path_reports_mutated_false: true,
      error_classification: true,
      behavior_coverage_mapper_for_eighteen_tools: true
    },
    request_counts: {
      cloudflare_api: apiCalls.length,
      pages_rollback_posts: apiCalls.filter((call) => call.path.endsWith("/rollback")).length,
      dns_mutation_posts: apiCalls.filter((call) => call.path.endsWith("/dns_records") && call.method === "POST").length,
      cache_purge_posts: apiCalls.filter((call) => call.path.endsWith("/purge_cache")).length
    },
    limitations: [
      "The provider API and Wrangler executable are deterministic local fixtures; no real Cloudflare account was mutated.",
      "HTTP verification proves bounded response and marker checks, not visual browser correctness.",
      "JSONC Wrangler configuration is detected but intentionally left to Wrangler rather than heuristically parsed."
    ]
  };
  if (benchmarkOutput) {
    await mkdir(path.dirname(benchmarkOutput), { recursive: true });
    await writeFile(benchmarkOutput, `${JSON.stringify(benchmark, null, 2)}\n`, "utf8");
  }
  console.log("VNEM GIGA Phase 20 Cloudflare deployment tests passed");
} finally {
  await transport?.close().catch(() => {});
  await new Promise((resolve) => server?.close(resolve) || resolve());
  await rm(tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }).catch(() => {});
}

async function createProjectFixture(root) {
  await mkdir(path.join(root, "src"), { recursive: true });
  await mkdir(path.join(root, "node_modules", "wrangler", "bin"), { recursive: true });
  await mkdir(path.join(root, "node_modules", ".bin"), { recursive: true });
  await writeFile(path.join(root, "package.json"), JSON.stringify({
    name: "phase20-cloudflare-fixture",
    private: true,
    scripts: { build: "node build.mjs" },
    devDependencies: { vite: "8.1.0", wrangler: "4.99.0" }
  }, null, 2));
  await writeFile(path.join(root, "build.mjs"), [
    'import { mkdir, writeFile } from "node:fs/promises";',
    'await mkdir("dist/assets", { recursive: true });',
    'await writeFile("dist/index.html", "<!doctype html><title>Phase 20 Fixture</title><main>phase20-marker</main>");',
    'await writeFile("dist/assets/app.js", "console.log(\\"phase20\\")");'
  ].join("\n"));
  await writeFile(path.join(root, "wrangler.toml"), ['name = "demo-worker"', 'main = "src/worker.mjs"', 'pages_build_output_dir = "dist"', 'compatibility_date = "2026-07-14"', ""].join("\n"));
  await writeFile(path.join(root, "src", "worker.mjs"), 'export default { fetch() { return new Response("phase20-marker"); } };\n');
  const fakeWrangler = path.join(root, "node_modules", "wrangler", "bin", "wrangler.mjs");
  await writeFile(fakeWrangler, [
    '#!/usr/bin/env node',
    'import { existsSync } from "node:fs";',
    'const args = process.argv.slice(2);',
    'const base = process.env.PHASE20_VERIFY_BASE_URL;',
    'if (args.includes("--version")) { console.log("4.99.0"); process.exit(0); }',
    'if (args[0] === "pages" && args[1] === "deploy") {',
    '  if (existsSync("fail-pages.flag")) { console.error("ERROR authentication failed after fixture command start"); process.exit(7); }',
    '  console.log(`Deployment complete! ${base}/deployment`); process.exit(0);',
    '}',
    'if (args[0] === "deploy") { console.log(`Published ${base}/worker`); console.log("Version ID: 11111111-1111-1111-1111-111111111111"); process.exit(0); }',
    'if (args[0] === "versions" && args[1] === "list") { console.log(JSON.stringify([{id:"11111111-1111-1111-1111-111111111111"},{id:"22222222-2222-2222-2222-222222222222"}])); process.exit(0); }',
    'if (args[0] === "rollback") { console.log(`Rolled back to version ${args[1]}`); process.exit(0); }',
    'if (args.includes("secret")) { let input=""; for await (const chunk of process.stdin) input += chunk; if (args.includes("put") && !input.trim()) process.exit(8); console.log("Secret operation accepted with value redacted"); process.exit(0); }',
    'console.error(`unsupported fake Wrangler command: ${args.join(" ")}`); process.exit(9);'
  ].join("\n"));
  await writeFile(path.join(root, "node_modules", "wrangler", "package.json"), JSON.stringify({ name: "wrangler", version: "4.99.0", type: "module", bin: { wrangler: "bin/wrangler.mjs" } }, null, 2));
  const cmd = `@ECHO OFF\r\n"${process.execPath}" "${fakeWrangler}" %*\r\n`;
  await writeFile(path.join(root, "node_modules", ".bin", "wrangler.cmd"), cmd);
  const sh = `#!/usr/bin/env sh\nexec "${process.execPath.replace(/\\/g, "/")}" "${fakeWrangler.replace(/\\/g, "/")}" "$@"\n`;
  const shPath = path.join(root, "node_modules", ".bin", "wrangler");
  await writeFile(shPath, sh);
  await chmod(shPath, 0o755).catch(() => {});
}

async function connectTools(root, evidence, baseUrl, secret) {
  const nextClient = new Client({ name: "phase20-cloudflare-test", version: "1.0.1" }, { capabilities: {} });
  const nextTransport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(scriptDir, "vnem-tools-mcp-server.mjs")],
    cwd: repoRoot,
    env: {
      ...process.env,
      VNEM_TOOLS_ROOT: root,
      VNEM_TOOLS_PRECISION_ROOT: root,
      VNEM_TOOLS_ALLOWED_ROOTS: [root, repoRoot].join(path.delimiter),
      VNEM_TOOLS_EVIDENCE_ROOT: evidence,
      VNEM_TOOLS_PERMISSION_PROFILE: "creator-power",
      VNEM_TOOLS_ALLOW_NPX_WRANGLER_CHECK: "1",
      VNEM_TOOLS_CLOUDFLARE_TEST_MODE: "1",
      VNEM_TOOLS_CLOUDFLARE_API_BASE_URL: `${baseUrl}/client/v4`,
      CLOUDFLARE_API_TOKEN: "cfut_phase20_local_fixture_token_1234567890",
      CLOUDFLARE_ACCOUNT_ID: "account-phase20-12345678",
      PHASE20_SECRET_REFERENCE: secret,
      PHASE20_VERIFY_BASE_URL: baseUrl
    },
    stderr: "pipe"
  });
  await nextClient.connect(nextTransport);
  return { client: nextClient, transport: nextTransport };
}

async function callRaw(target, name, args) {
  return await target.callTool({ name, arguments: args });
}

async function callValue(target, name, args, key) {
  const response = await callRaw(target, name, args);
  if (response.isError) throw new Error(`${name} failed: ${JSON.stringify(response.structuredContent)}`);
  const value = response.structuredContent?.[key];
  assert.ok(value, `${name} missing ${key}`);
  return value;
}

async function timed(name, fn) {
  const started = performance.now();
  const result = await fn();
  timings[name] = Number((performance.now() - started).toFixed(2));
  return result;
}

function pageInfo() {
  return { page: 1, per_page: 50, count: 1, total_count: 1, total_pages: 1 };
}

function success(result, resultInfo) {
  return { success: true, errors: [], messages: [], result, ...(resultInfo ? { result_info: resultInfo } : {}) };
}

function pageDeployment(id, url, createdOn) {
  return { id, project_name: "demo-pages", environment: "production", url, created_on: createdOn, latest_stage: { status: "success" } };
}

function sendJson(response, status, body) {
  const text = JSON.stringify(body);
  response.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(text) });
  response.end(text);
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function safeOutputPath(value) {
  const candidate = path.resolve(repoRoot, value);
  const allowed = path.join(repoRoot, ".vnem", "giga-evolution", "phase-20");
  const relative = path.relative(allowed, candidate);
  if (relative.startsWith("..") || path.isAbsolute(relative) || path.extname(candidate).toLowerCase() !== ".json") throw new Error("Phase 20 benchmark output must be JSON under .vnem/giga-evolution/phase-20.");
  return candidate;
}
