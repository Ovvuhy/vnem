import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import path from "node:path";
import WebSocket from "ws";

const SKIPPED_DIRECTORIES = new Set([".git", ".vnem", "node_modules", "dist", "build", "coverage", ".next", ".cache"]);
const TEXT_EXTENSIONS = new Set([".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".html", ".css", ".json", ".md"]);
const MARKER_FILE = ".vnem-app-engineering.json";
const SUPPORTED_ADAPTERS = Object.freeze({
  "vite-react-node": {
    support_level: "verified_generation_and_execution",
    project_types: ["Vite", "React", "Node API"],
    limitations: ["The Node API adapter runs through a Vite development plugin; production API hosting remains deployment-specific."]
  },
  "static-node": {
    support_level: "verified_generation_and_execution",
    project_types: ["Static HTML/CSS/JavaScript", "Node API"],
    limitations: ["No framework-specific component model; the generated browser client uses native DOM APIs."]
  },
  "next-style": {
    support_level: "inspection_and_plan_only",
    project_types: ["Next-style React"],
    limitations: ["Automatic mutation is disabled for unmarked Next projects because routing and server conventions vary by version and project configuration."]
  },
  generic: {
    support_level: "inspection_only",
    project_types: ["Generic web project"],
    limitations: ["Automatic generation requires a VNEM fixture/marker or a future adapter extension."]
  }
});

export async function inspectAppProject(root, options = {}) {
  const startedAt = performance.now();
  const maxFiles = Math.max(1, Math.min(Number(options.max_files || 500), 2000));
  const files = [];
  await walkProject(root, root, files, maxFiles);
  const relativeFiles = files.map((item) => item.path);
  const packageJson = await readJsonIfPresent(path.join(root, "package.json"));
  const marker = await readJsonIfPresent(path.join(root, MARKER_FILE));
  const manifestText = JSON.stringify({ ...(packageJson?.dependencies || {}), ...(packageJson?.devDependencies || {}) }).toLowerCase();
  const adapter = detectAdapter({ marker, relativeFiles, manifestText });
  const sampled = await sampleSourceFiles(root, files);
  const routes = detectRoutes(sampled);
  const components = detectComponents(sampled);
  const apiHandlers = detectApiHandlers(sampled);
  const dataModels = detectDataModels(sampled);
  const stateUsage = detectStateUsage(sampled);
  const boundaries = detectBoundaries(relativeFiles, sampled);
  const experienceStates = detectExperienceStates(sampled);
  const quality = detectQualitySignals(sampled);
  const gaps = [];
  if (boundaries.frontend.length && !boundaries.backend.length) gaps.push("frontend_without_detected_backend_boundary");
  if (boundaries.backend.length && !boundaries.frontend.length) gaps.push("backend_without_detected_visible_frontend");
  if (boundaries.frontend.length && !apiHandlers.length) gaps.push("visible_ui_without_detected_api_handler");
  if (apiHandlers.length && !routes.some((item) => item.kind === "frontend")) gaps.push("api_handler_without_detected_visible_route");
  for (const stateName of ["loading", "empty", "error", "success"]) {
    if (!experienceStates[stateName]) gaps.push(`missing_${stateName}_state_signal`);
  }
  if (!quality.validation) gaps.push("validation_not_detected");
  if (!quality.accessibility) gaps.push("accessibility_signals_not_detected");
  if (!quality.responsive) gaps.push("responsive_signals_not_detected");

  const scripts = packageJson?.scripts || {};
  const support = SUPPORTED_ADAPTERS[adapter] || SUPPORTED_ADAPTERS.generic;
  return {
    project_root: root,
    inspected_at: new Date().toISOString(),
    duration_ms: roundMs(performance.now() - startedAt),
    files_scanned: files.length,
    scan_truncated: files.length >= maxFiles,
    adapter,
    marker_present: Boolean(marker),
    marker,
    support,
    package_manager: detectPackageManager(relativeFiles),
    frameworks: detectFrameworks(relativeFiles, manifestText, adapter),
    boundaries,
    routes,
    components,
    api_handlers: apiHandlers,
    data_models: dataModels,
    state_management: stateUsage,
    experience_states: experienceStates,
    quality_signals: quality,
    incomplete_vertical_slice_signals: gaps,
    scripts: Object.fromEntries(Object.entries(scripts).filter(([name]) => /^(test|build|dev|start|preview|lint|typecheck|validate)(:|$)/.test(name))),
    extension_points: [
      "Add an adapter that emits a marker-compatible operation plan.",
      "Add framework-specific route and data-model detectors without changing transaction safety.",
      "Add a deployment-specific production API verifier separately from localhost acceptance."
    ],
    skipped_policy: ["secret-like paths", ...SKIPPED_DIRECTORIES]
  };
}

export async function buildVerticalSlicePlan(root, options = {}) {
  const inspection = await inspectAppProject(root, options);
  const requestedAdapter = String(options.adapter || "").trim();
  const adapter = requestedAdapter || inspection.adapter;
  if (!["vite-react-node", "static-node"].includes(adapter)) {
    return {
      status: "blocked_unsupported_adapter",
      adapter,
      inspection,
      operations: [],
      safe_to_apply: false,
      blocked_reason: `Adapter ${adapter} supports ${inspection.support.support_level}; automatic vertical-slice mutation is unavailable.`,
      next_best_action: "Inspect the project, add a narrow adapter/marker, then regenerate the plan."
    };
  }
  if (!inspection.marker_present && options.allow_unmarked !== true) {
    return {
      status: "blocked_unmarked_project",
      adapter,
      inspection,
      operations: [],
      safe_to_apply: false,
      blocked_reason: `Automatic mutation is limited to projects containing ${MARKER_FILE}.`,
      next_best_action: "Use inspection output to integrate manually or add an explicitly reviewed VNEM app-engineering marker."
    };
  }
  const feature = normalizeFeature(options.feature_name || "Task board");
  const generated = adapter === "vite-react-node" ? viteReactNodeFiles(feature) : staticNodeFiles(feature);
  const operations = [];
  for (const [relativePath, content] of Object.entries(generated)) {
    const absolute = safeJoin(root, relativePath);
    const before = existsSync(absolute) ? await readFile(absolute) : null;
    operations.push({
      op: "write",
      path: normalizePath(relativePath),
      content,
      expected_before_sha256: before ? sha256(before) : null,
      before_exists: Boolean(before),
      after_sha256: sha256(content),
      bytes: Buffer.byteLength(content)
    });
  }
  const planCore = {
    schema_version: 1,
    adapter,
    feature,
    operations: operations.map(({ content, ...operation }) => operation)
  };
  const planId = `app-plan-${sha256(JSON.stringify(planCore)).slice(0, 16)}`;
  return {
    status: "ready",
    plan_id: planId,
    generated_at: new Date().toISOString(),
    adapter,
    feature,
    inspection,
    operations,
    files_previewed: operations.map((item) => ({ path: item.path, before_exists: item.before_exists, bytes: item.bytes, after_sha256: item.after_sha256 })),
    transaction: {
      staged_sibling_temp_files: true,
      per_file_rename_commit: true,
      automatic_all_or_rollback_semantics: true,
      cross_file_filesystem_atomicity_claimed: false,
      precondition_hashes_required: true,
      retained_restore_manifest: true
    },
    acceptance_plan: {
      scripts: ["test", "build"],
      dev_script: "dev",
      route: "/",
      api_route: "/api/tasks",
      user_path: ["load task list", "enter a task title", "submit", "observe success state and new task"],
      browser_evidence: ["desktop screenshot", "mobile screenshot", "console events", "network responses/failures", "DOM completion state"]
    },
    safe_to_apply: true,
    limitations: [
      "The transaction guarantees automatic rollback on a failed commit, not impossible cross-file filesystem atomicity.",
      ...SUPPORTED_ADAPTERS[adapter].limitations
    ]
  };
}

export async function applyVerticalSlicePlan(root, plan) {
  if (!plan || plan.status !== "ready" || !plan.plan_id || !Array.isArray(plan.operations) || plan.operations.length === 0) {
    throw appError("A ready non-empty app plan is required.", "app_plan_invalid");
  }
  const transactionId = `app-tx-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const transactionRoot = path.join(root, ".vnem", "app-transactions", transactionId);
  const originalsRoot = path.join(transactionRoot, "originals");
  const staged = [];
  const committed = [];
  const startedAt = performance.now();
  await mkdir(originalsRoot, { recursive: true });
  try {
    for (const operation of plan.operations) {
      if (operation.op !== "write") throw appError(`Unsupported app operation: ${operation.op}`, "app_operation_unsupported");
      const target = safeJoin(root, operation.path);
      const currentExists = existsSync(target);
      const current = currentExists ? await readFile(target) : null;
      const currentHash = current ? sha256(current) : null;
      if (currentHash !== operation.expected_before_sha256) {
        throw appError(`Precondition changed for ${operation.path}.`, "app_plan_precondition_changed", {
          path: operation.path,
          expected_sha256: operation.expected_before_sha256,
          actual_sha256: currentHash
        });
      }
      await mkdir(path.dirname(target), { recursive: true });
      const temp = path.join(path.dirname(target), `.${path.basename(target)}.vnem-stage-${randomUUID()}`);
      await writeFile(temp, operation.content, "utf8");
      if (sha256(await readFile(temp)) !== operation.after_sha256) {
        throw appError(`Staged content hash mismatch for ${operation.path}.`, "app_stage_hash_mismatch");
      }
      staged.push({ operation, target, temp, currentExists });
    }

    for (const item of staged) {
      const backup = safeJoin(originalsRoot, item.operation.path);
      if (item.currentExists) {
        await mkdir(path.dirname(backup), { recursive: true });
        await rename(item.target, backup);
      }
      try {
        await rename(item.temp, item.target);
      } catch (error) {
        if (item.currentExists && existsSync(backup)) await rename(backup, item.target);
        throw error;
      }
      committed.push({ ...item, backup: item.currentExists ? backup : null });
    }
  } catch (error) {
    for (const item of [...committed].reverse()) {
      await rm(item.target, { force: true }).catch(() => {});
      if (item.backup && existsSync(item.backup)) {
        await mkdir(path.dirname(item.target), { recursive: true });
        await rename(item.backup, item.target).catch(() => {});
      }
    }
    for (const item of staged) await rm(item.temp, { force: true }).catch(() => {});
    await writeFile(path.join(transactionRoot, "failure.json"), JSON.stringify({
      transaction_id: transactionId,
      plan_id: plan.plan_id,
      rolled_back: true,
      error: { code: error.code || "app_transaction_failed", message: error.message || String(error) }
    }, null, 2), "utf8").catch(() => {});
    throw error;
  }

  const manifest = {
    schema_version: 1,
    transaction_id: transactionId,
    plan_id: plan.plan_id,
    project_root: root,
    adapter: plan.adapter,
    feature: plan.feature,
    committed_at: new Date().toISOString(),
    duration_ms: roundMs(performance.now() - startedAt),
    status: "applied",
    files: committed.map((item) => ({
      path: item.operation.path,
      before_existed: item.currentExists,
      before_sha256: item.operation.expected_before_sha256,
      after_sha256: item.operation.after_sha256,
      backup_path: item.backup
    })),
    rollback_available: true,
    acceptance_status: "not_run"
  };
  const manifestPath = path.join(transactionRoot, "manifest.json");
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  return { ...manifest, manifest_path: manifestPath, transaction_root: transactionRoot };
}

export async function rollbackVerticalSliceTransaction(root, manifestPath) {
  const absoluteManifest = path.isAbsolute(manifestPath) ? path.resolve(manifestPath) : safeJoin(root, manifestPath);
  if (!isInside(root, absoluteManifest)) throw appError("Transaction manifest is outside the project root.", "app_transaction_outside_root");
  const manifest = JSON.parse(await readFile(absoluteManifest, "utf8"));
  if (path.resolve(manifest.project_root) !== path.resolve(root)) throw appError("Transaction manifest belongs to another project root.", "app_transaction_root_mismatch");
  const restored = [];
  for (const file of [...manifest.files].reverse()) {
    const target = safeJoin(root, file.path);
    const currentHash = existsSync(target) ? sha256(await readFile(target)) : null;
    if (currentHash !== file.after_sha256) {
      throw appError(`Rollback precondition changed for ${file.path}.`, "app_rollback_precondition_changed", { path: file.path, expected_sha256: file.after_sha256, actual_sha256: currentHash });
    }
    await rm(target, { force: true });
    if (file.before_existed) {
      if (!file.backup_path || !existsSync(file.backup_path)) throw appError(`Backup is missing for ${file.path}.`, "app_backup_missing");
      await mkdir(path.dirname(target), { recursive: true });
      await rename(file.backup_path, target);
    }
    restored.push(file.path);
  }
  const result = { transaction_id: manifest.transaction_id, status: "rolled_back", rolled_back_at: new Date().toISOString(), restored_files: restored };
  await writeFile(path.join(path.dirname(absoluteManifest), "rollback.json"), JSON.stringify(result, null, 2), "utf8");
  return result;
}

export async function updateTransactionAcceptance(manifestPath, acceptance) {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.acceptance_status = acceptance.status;
  manifest.acceptance_completed_at = new Date().toISOString();
  manifest.acceptance_evidence = acceptance.evidence_path || null;
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  return manifest;
}

export async function runChromiumUserPath(url, outputDir, options = {}) {
  const startedAt = performance.now();
  const target = new URL(url);
  if (!["http:", "https:"].includes(target.protocol) || !["127.0.0.1", "localhost", "[::1]", "::1"].includes(target.hostname)) {
    throw appError("App browser acceptance is limited to localhost HTTP targets.", "browser_target_not_localhost", { url });
  }
  await mkdir(outputDir, { recursive: true });
  const browser = resolveBrowserExecutable(options.browser_command);
  if (!browser) {
    return { status: "browser_unavailable", browser_was_run: false, console: [], network: [], network_failures: [], screenshots: [], safe_to_claim: false, what_is_not_proven: ["Browser user path", "console and network evidence", "desktop/mobile screenshots"] };
  }
  const profileDir = path.join(outputDir, `.browser-profile-${randomUUID()}`);
  await mkdir(profileDir, { recursive: true });
  const launchPolicy = {
    dedicated_temporary_profile: true,
    localhost_only: true,
    browser_sandbox_disabled: true,
    gpu_disabled: true,
    shared_memory_disabled: true,
    limitation: "The validated Chromium runtimes required test-only sandbox, GPU, and shared-memory disablement; this is local acceptance evidence, not a production browser security claim."
  };
  const child = spawn(browser, [
    "--headless=new",
    "--remote-debugging-port=0",
    `--user-data-dir=${profileDir}`,
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-sync",
    "--disable-gpu",
    "--disable-gpu-compositing",
    "--disable-dev-shm-usage",
    "--hide-scrollbars",
    "about:blank"
  ], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  let browserStderr = "";
  child.stderr?.on("data", (chunk) => { browserStderr = `${browserStderr}${chunk}`.slice(-8000); });
  let cdp;
  try {
    const activePortFile = path.join(profileDir, "DevToolsActivePort");
    await waitFor(() => {
      if (child.exitCode !== null || child.signalCode !== null) throw appError("Chromium exited before exposing a debugging port.", "browser_exited_before_debugging", { exit_code: child.exitCode, signal: child.signalCode });
      return existsSync(activePortFile);
    }, Number(options.launch_timeout_ms || 30000));
    const [port] = (await readFile(activePortFile, "utf8")).trim().split(/\r?\n/);
    const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
    const page = targets.find((item) => item.type === "page");
    if (!page?.webSocketDebuggerUrl) throw appError("Chrome did not expose a page debugging target.", "browser_target_missing");
    cdp = await createCdpClient(page.webSocketDebuggerUrl);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Network.enable");
    const consoleEvents = [];
    const network = [];
    const networkFailures = [];
    cdp.on("Runtime.consoleAPICalled", (event) => consoleEvents.push({ type: event.type, text: event.args?.map((arg) => arg.value ?? arg.description ?? "").join(" ") || "" }));
    cdp.on("Runtime.exceptionThrown", (event) => consoleEvents.push({ type: "exception", text: event.exceptionDetails?.text || "Unhandled browser exception" }));
    cdp.on("Network.responseReceived", (event) => network.push({ url: event.response.url, status: event.response.status, type: event.type, mime_type: event.response.mimeType }));
    cdp.on("Network.loadingFailed", (event) => networkFailures.push({ request_id: event.requestId, error_text: event.errorText, canceled: Boolean(event.canceled) }));

    const screenshots = [];
    const desktop = await runViewportJourney(cdp, url, { width: 1440, height: 1000, mobile: false, scale: 1 }, path.join(outputDir, "desktop.png"), true);
    screenshots.push(desktop.screenshot);
    const mobile = await runViewportJourney(cdp, url, { width: 390, height: 844, mobile: true, scale: 2 }, path.join(outputDir, "mobile.png"), false);
    screenshots.push(mobile.screenshot);
    const consoleErrors = consoleEvents.filter((item) => item.type === "error" || item.type === "exception");
    const badResponses = network.filter((item) => item.status >= 400);
    const safe = desktop.user_path_passed && mobile.page_loaded && consoleErrors.length === 0 && networkFailures.length === 0 && badResponses.length === 0;
    return {
      status: safe ? "passed" : "failed",
      browser_was_run: true,
      browser_executable: browser,
      duration_ms: roundMs(performance.now() - startedAt),
      desktop,
      mobile,
      console: consoleEvents,
      console_errors: consoleErrors,
      network,
      network_failures: networkFailures,
      bad_responses: badResponses,
      screenshots,
      launch_policy: launchPolicy,
      safe_to_claim: safe,
      what_is_not_proven: ["External deployment behavior", "authenticated flows", "cross-browser behavior beyond the detected Chromium browser"]
    };
  } catch (error) {
    error.details = { ...(error.details || {}), browser_executable: browser, browser_stderr: browserStderr };
    throw error;
  } finally {
    if (cdp) await Promise.race([cdp.send("Browser.close").catch(() => {}), delay(1000)]);
    cdp?.close();
    if (!child.killed) child.kill();
    await waitForExit(child, 2000).catch(() => {});
    await rm(profileDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }).catch(() => {});
  }
}

async function runViewportJourney(cdp, url, viewport, screenshotPath, exercise) {
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: viewport.width, height: viewport.height, deviceScaleFactor: viewport.scale, mobile: viewport.mobile });
  await cdp.send("Page.navigate", { url });
  await waitForPageLoad(cdp, 10000);
  await delay(500);
  let userPathPassed = false;
  if (exercise) {
    const evaluation = await cdp.send("Runtime.evaluate", {
      expression: `(async () => {
        const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        const input = document.querySelector('#task-title');
        const form = document.querySelector('#task-form');
        if (!input || !form) return { passed: false, reason: 'form_missing' };
        const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        valueSetter.call(input, 'Browser verified task');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await wait(50);
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await wait(700);
        const body = document.body.innerText;
        return { passed: body.includes('Browser verified task') && body.toLowerCase().includes('saved'), body };
      })()`,
      awaitPromise: true,
      returnByValue: true
    });
    userPathPassed = Boolean(evaluation.result?.value?.passed);
  }
  const snapshot = await cdp.send("Runtime.evaluate", { expression: `({ title: document.title, text: document.body.innerText, ready: document.readyState, width: document.documentElement.scrollWidth })`, returnByValue: true });
  const capture = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await writeFile(screenshotPath, Buffer.from(capture.data, "base64"));
  return {
    page_loaded: snapshot.result?.value?.ready === "complete",
    title: snapshot.result?.value?.title || "",
    body_text: String(snapshot.result?.value?.text || "").slice(0, 2000),
    horizontal_overflow: Number(snapshot.result?.value?.width || 0) > viewport.width + 1,
    user_path_exercised: exercise,
    user_path_passed: exercise ? userPathPassed : null,
    screenshot: { path: screenshotPath, viewport, bytes: (await stat(screenshotPath)).size }
  };
}

function viteReactNodeFiles(feature) {
  const title = feature.display_name;
  return {
    [MARKER_FILE]: `${JSON.stringify({ schema_version: 1, adapter: "vite-react-node", managed_paths: ["src", "test", "vite.config.mjs", "index.html", "package.json"] }, null, 2)}\n`,
    "package.json": `${JSON.stringify({ name: feature.slug, private: true, type: "module", scripts: { test: "node --test test/domain.test.mjs", build: "vite build", dev: "vite --host 127.0.0.1" }, dependencies: { react: "^19.2.6", "react-dom": "^19.2.6" }, devDependencies: { "@vitejs/plugin-react": "^6.0.2", vite: "^8.0.14" } }, null, 2)}\n`,
    "index.html": `<!doctype html>\n<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="description" content="${title}"><link rel="icon" href="data:,"><title>${title}</title></head><body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>\n`,
    "src/domain/tasks.mjs": domainModule(),
    "src/api/tasks.mjs": apiModule(),
    "vite.config.mjs": viteConfig(),
    "src/main.jsx": `import React from "react";\nimport { createRoot } from "react-dom/client";\nimport App from "./App.jsx";\nimport "./styles.css";\n\ncreateRoot(document.getElementById("root")).render(<React.StrictMode><App /></React.StrictMode>);\n`,
    "src/App.jsx": reactApp(title),
    "src/styles.css": appStyles(),
    "test/domain.test.mjs": domainTest()
  };
}

function staticNodeFiles(feature) {
  const title = feature.display_name;
  return {
    [MARKER_FILE]: `${JSON.stringify({ schema_version: 1, adapter: "static-node", managed_paths: ["src", "public", "test", "scripts", "package.json"] }, null, 2)}\n`,
    "package.json": `${JSON.stringify({ name: feature.slug, private: true, type: "module", scripts: { test: "node --test test/domain.test.mjs", build: "node scripts/build.mjs", dev: "node src/server.mjs" } }, null, 2)}\n`,
    "src/domain/tasks.mjs": domainModule(),
    "src/api/tasks.mjs": apiModule(),
    "src/server.mjs": staticServer(),
    "public/index.html": `<!doctype html>\n<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="description" content="${title}"><link rel="icon" href="data:,"><title>${title}</title><link rel="stylesheet" href="/styles.css"></head><body><main id="app" aria-busy="true"><p role="status">Loading tasks...</p></main><script type="module" src="/app.js"></script></body></html>\n`,
    "public/app.js": staticApp(title),
    "public/styles.css": appStyles(),
    "scripts/build.mjs": `import { cp, mkdir, rm } from "node:fs/promises";\nawait rm("dist", { recursive: true, force: true });\nawait mkdir("dist", { recursive: true });\nawait cp("public", "dist", { recursive: true });\nconsole.log("built static client to dist");\n`,
    "test/domain.test.mjs": domainTest()
  };
}

function domainModule() {
  return `export function createTaskStore(seed = []) {\n  const tasks = seed.map((task, index) => ({ id: task.id || String(index + 1), title: String(task.title), complete: Boolean(task.complete) }));\n  return {\n    list() { return tasks.map((task) => ({ ...task })); },\n    add(input) {\n      const title = String(input?.title || "").trim();\n      if (title.length < 3) return { ok: false, error: "Title must contain at least 3 characters." };\n      if (title.length > 80) return { ok: false, error: "Title must contain at most 80 characters." };\n      const task = { id: String(tasks.length + 1), title, complete: false };\n      tasks.push(task);\n      return { ok: true, task: { ...task } };\n    }\n  };\n}\n`;
}

function apiModule() {
  return `export async function handleTasksRequest(request, response, store) {\n  if (request.method === "GET") return send(response, 200, { tasks: store.list() });\n  if (request.method === "POST") {\n    try {\n      const input = await readJson(request);\n      const result = store.add(input);\n      return result.ok ? send(response, 201, result) : send(response, 400, result);\n    } catch {\n      return send(response, 400, { ok: false, error: "Request body must be valid JSON." });\n    }\n  }\n  return send(response, 405, { error: "Method not allowed." });\n}\n\nfunction readJson(request) {\n  return new Promise((resolve, reject) => {\n    let body = "";\n    request.on("data", (chunk) => { body += chunk; if (body.length > 10000) reject(new Error("too large")); });\n    request.on("end", () => { try { resolve(JSON.parse(body || "{}")); } catch (error) { reject(error); } });\n    request.on("error", reject);\n  });\n}\n\nfunction send(response, status, payload) {\n  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });\n  response.end(JSON.stringify(payload));\n}\n`;
}

function viteConfig() {
  return `import { defineConfig } from "vite";\nimport react from "@vitejs/plugin-react";\nimport { createTaskStore } from "./src/domain/tasks.mjs";\nimport { handleTasksRequest } from "./src/api/tasks.mjs";\n\nfunction taskApi() {\n  const store = createTaskStore([{ title: "Inspect the real project", complete: true }]);\n  return {\n    name: "vnem-task-api",\n    configureServer(server) {\n      server.middlewares.use("/api/tasks", (request, response) => handleTasksRequest(request, response, store));\n    }\n  };\n}\n\nexport default defineConfig({ plugins: [react(), taskApi()] });\n`;
}

function staticServer() {
  return `import { createReadStream } from "node:fs";\nimport { createServer } from "node:http";\nimport { extname, join } from "node:path";\nimport { createTaskStore } from "./domain/tasks.mjs";\nimport { handleTasksRequest } from "./api/tasks.mjs";\n\nconst portIndex = process.argv.indexOf("--port");\nconst port = Number(portIndex >= 0 ? process.argv[portIndex + 1] : process.env.PORT || 4173);\nconst store = createTaskStore([{ title: "Inspect the real project", complete: true }]);\nconst types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8" };\nconst server = createServer((request, response) => {\n  const url = new URL(request.url, "http://127.0.0.1");\n  if (url.pathname === "/api/tasks") return handleTasksRequest(request, response, store);\n  const relative = url.pathname === "/" ? "index.html" : url.pathname.slice(1);\n  if (relative.includes("..")) { response.writeHead(400); return response.end("Bad path"); }\n  const file = join(process.cwd(), "public", relative);\n  const stream = createReadStream(file);\n  stream.on("open", () => { response.writeHead(200, { "content-type": types[extname(file)] || "application/octet-stream" }); stream.pipe(response); });\n  stream.on("error", () => { response.writeHead(404, { "content-type": "text/plain; charset=utf-8" }); response.end("Not found"); });\n});\nserver.listen(port, "127.0.0.1", () => console.log("READY http://127.0.0.1:" + port));\n`;
}

function reactApp(title) {
  return `import { useEffect, useState } from "react";\n\nexport default function App() {\n  const [tasks, setTasks] = useState([]);\n  const [title, setTitle] = useState("");\n  const [status, setStatus] = useState({ kind: "loading", message: "Loading tasks..." });\n  useEffect(() => { loadTasks(); }, []);\n  async function loadTasks() {\n    setStatus({ kind: "loading", message: "Loading tasks..." });\n    try {\n      const response = await fetch("/api/tasks");\n      if (!response.ok) throw new Error("Could not load tasks.");\n      const data = await response.json();\n      setTasks(data.tasks);\n      setStatus({ kind: data.tasks.length ? "ready" : "empty", message: data.tasks.length ? "Tasks loaded." : "No tasks yet. Add the first one." });\n    } catch (error) { setStatus({ kind: "error", message: error.message }); }\n  }\n  async function submit(event) {\n    event.preventDefault();\n    const clean = title.trim();\n    if (clean.length < 3) return setStatus({ kind: "error", message: "Title must contain at least 3 characters." });\n    setStatus({ kind: "loading", message: "Saving task..." });\n    try {\n      const response = await fetch("/api/tasks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: clean }) });\n      const data = await response.json();\n      if (!response.ok) throw new Error(data.error || "Could not save task.");\n      setTasks((current) => [...current, data.task]);\n      setTitle("");\n      setStatus({ kind: "success", message: "Task saved successfully." });\n    } catch (error) { setStatus({ kind: "error", message: error.message }); }\n  }\n  return <main className="shell">\n    <header><p className="eyebrow">VNEM verified vertical slice</p><h1>${title}</h1><p>Frontend, API, domain state, validation, and browser proof in one bounded workflow.</p></header>\n    <section aria-labelledby="add-heading"><h2 id="add-heading">Add a task</h2><form id="task-form" onSubmit={submit} noValidate><label htmlFor="task-title">Task title</label><div className="form-row"><input id="task-title" value={title} onChange={(event) => setTitle(event.target.value)} minLength="3" maxLength="80" required aria-describedby="task-help"/><button type="submit" disabled={status.kind === "loading"}>Add task</button></div><small id="task-help">Use 3 to 80 characters.</small></form></section>\n    <section aria-labelledby="tasks-heading" aria-busy={status.kind === "loading"}><div className="section-heading"><h2 id="tasks-heading">Current tasks</h2><button className="quiet" type="button" onClick={loadTasks}>Refresh</button></div><p className={\`status \${status.kind}\`} role={status.kind === "error" ? "alert" : "status"}>{status.message}</p>{tasks.length ? <ul>{tasks.map((task) => <li key={task.id}><span>{task.title}</span><strong>{task.complete ? "Done" : "Open"}</strong></li>)}</ul> : status.kind !== "loading" && <p className="empty">Nothing here yet.</p>}</section>\n  </main>;\n}\n`;
}

function staticApp(title) {
  return `const root = document.querySelector("#app");\nlet tasks = [];\nrender("loading", "Loading tasks...");\nloadTasks();\n\nasync function loadTasks() {\n  render("loading", "Loading tasks...");\n  try {\n    const response = await fetch("/api/tasks");\n    if (!response.ok) throw new Error("Could not load tasks.");\n    tasks = (await response.json()).tasks;\n    render(tasks.length ? "ready" : "empty", tasks.length ? "Tasks loaded." : "No tasks yet. Add the first one.");\n  } catch (error) { render("error", error.message); }\n}\n\nasync function submit(event) {\n  event.preventDefault();\n  const input = document.querySelector("#task-title");\n  const title = input.value.trim();\n  if (title.length < 3) return setStatus("error", "Title must contain at least 3 characters.");\n  setStatus("loading", "Saving task...");\n  try {\n    const response = await fetch("/api/tasks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title }) });\n    const data = await response.json();\n    if (!response.ok) throw new Error(data.error || "Could not save task.");\n    tasks.push(data.task); input.value = ""; render("success", "Task saved successfully.");\n  } catch (error) { setStatus("error", error.message); }\n}\n\nfunction setStatus(kind, message) { const status = document.querySelector("#task-status"); status.className = \`status \${kind}\`; status.setAttribute("role", kind === "error" ? "alert" : "status"); status.textContent = message; }\nfunction render(kind, message) {\n  root.removeAttribute("aria-busy");\n  root.className = "shell";\n  root.innerHTML = \`<header><p class="eyebrow">VNEM verified vertical slice</p><h1>${title}</h1><p>Frontend, API, domain state, validation, and browser proof in one bounded workflow.</p></header><section aria-labelledby="add-heading"><h2 id="add-heading">Add a task</h2><form id="task-form" novalidate><label for="task-title">Task title</label><div class="form-row"><input id="task-title" minlength="3" maxlength="80" required aria-describedby="task-help"><button type="submit">Add task</button></div><small id="task-help">Use 3 to 80 characters.</small></form></section><section aria-labelledby="tasks-heading"><div class="section-heading"><h2 id="tasks-heading">Current tasks</h2><button class="quiet" id="refresh" type="button">Refresh</button></div><p id="task-status" class="status \${kind}" role="\${kind === "error" ? "alert" : "status"}">\${message}</p>\${tasks.length ? '<ul>' + tasks.map((task) => '<li><span>' + escapeHtml(task.title) + '</span><strong>' + (task.complete ? 'Done' : 'Open') + '</strong></li>').join('') + '</ul>' : '<p class="empty">Nothing here yet.</p>'}</section>\`;\n  document.querySelector("#task-form").addEventListener("submit", submit);\n  document.querySelector("#refresh").addEventListener("click", loadTasks);\n}\nfunction escapeHtml(value) { const span = document.createElement("span"); span.textContent = value; return span.innerHTML; }\n`;
}

function appStyles() {
  return `:root { color: #18181b; background: #f5f7fa; font-family: Inter, ui-sans-serif, system-ui, sans-serif; font-synthesis: none; }\n* { box-sizing: border-box; }\nbody { margin: 0; min-width: 320px; }\nbutton, input { font: inherit; }\nbutton { min-height: 44px; border: 1px solid #18181b; border-radius: 6px; padding: 0 1rem; color: white; background: #18181b; cursor: pointer; }\nbutton:focus-visible, input:focus-visible { outline: 3px solid #0b6bcb; outline-offset: 2px; }\nbutton:disabled { opacity: .55; cursor: wait; }\n.shell { width: min(760px, calc(100% - 2rem)); margin: 0 auto; padding: 3rem 0 5rem; }\nheader { margin-bottom: 2rem; }\nh1 { max-width: 16ch; margin: .35rem 0 .75rem; font-size: clamp(2.25rem, 8vw, 4.5rem); line-height: 1; }\nh2 { margin: 0; font-size: 1.2rem; }\np { line-height: 1.6; }\n.eyebrow { margin: 0; color: #0b6bcb; font-size: .78rem; font-weight: 800; text-transform: uppercase; }\nsection { padding: 1.25rem 0; border-top: 1px solid #cbd2da; }\nlabel { display: block; margin: .9rem 0 .35rem; font-weight: 700; }\n.form-row, .section-heading, li { display: flex; align-items: center; gap: .75rem; }\ninput { flex: 1; min-width: 0; min-height: 44px; border: 1px solid #8a949f; border-radius: 6px; padding: .65rem .75rem; background: white; }\nsmall { display: block; margin-top: .4rem; color: #59636e; }\n.section-heading { justify-content: space-between; }\n.quiet { min-height: 36px; color: #18181b; background: transparent; }\n.status { padding: .75rem; border-left: 4px solid #0b6bcb; background: #e9f3ff; }\n.status.error { border-color: #b42318; background: #fff0ee; }\n.status.success { border-color: #16803d; background: #eaf8ee; }\nul { display: grid; gap: .5rem; margin: 1rem 0 0; padding: 0; list-style: none; }\nli { justify-content: space-between; padding: .8rem; border: 1px solid #d6dbe1; border-radius: 6px; background: white; }\nli strong { color: #59636e; font-size: .8rem; }\n.empty { color: #59636e; }\n@media (max-width: 560px) { .shell { padding-top: 2rem; } .form-row { align-items: stretch; flex-direction: column; } .form-row button { width: 100%; } }\n@media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior: auto !important; } }\n`;
}

function domainTest() {
  return `import test from "node:test";\nimport assert from "node:assert/strict";\nimport { createTaskStore } from "../src/domain/tasks.mjs";\n\ntest("task store validates and preserves a coherent slice", () => {\n  const store = createTaskStore();\n  assert.equal(store.add({ title: "x" }).ok, false);\n  const created = store.add({ title: "Ship verified slice" });\n  assert.equal(created.ok, true);\n  assert.deepEqual(store.list(), [{ id: "1", title: "Ship verified slice", complete: false }]);\n});\n`;
}

async function walkProject(current, root, output, maxFiles) {
  if (output.length >= maxFiles) return;
  let entries = [];
  try { entries = await readdir(current, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    if (output.length >= maxFiles) return;
    const absolute = path.join(current, entry.name);
    const relative = normalizePath(path.relative(root, absolute));
    if (entry.isDirectory()) {
      if (SKIPPED_DIRECTORIES.has(entry.name) || isSecretPath(relative)) continue;
      await walkProject(absolute, root, output, maxFiles);
    } else if (entry.isFile() && !isSecretPath(relative)) {
      const info = await stat(absolute);
      output.push({ path: relative, absolute, bytes: info.size });
    }
  }
}

async function sampleSourceFiles(root, files) {
  const sampled = [];
  for (const file of files) {
    if (!TEXT_EXTENSIONS.has(path.extname(file.path).toLowerCase()) || file.bytes > 128 * 1024) continue;
    try { sampled.push({ path: file.path, text: await readFile(safeJoin(root, file.path), "utf8") }); } catch {}
  }
  return sampled;
}

function detectAdapter({ marker, relativeFiles, manifestText }) {
  if (marker?.adapter && SUPPORTED_ADAPTERS[marker.adapter]) return marker.adapter;
  if (/next/.test(manifestText) || relativeFiles.some((file) => /^(app|pages)\//.test(file))) return "next-style";
  if (/vite/.test(manifestText) && /react/.test(manifestText)) return "vite-react-node";
  if (relativeFiles.includes("index.html") || relativeFiles.some((file) => file.startsWith("public/"))) return "static-node";
  return "generic";
}

function detectFrameworks(files, manifestText, adapter) {
  const frameworks = new Set();
  if (/react/.test(manifestText) || files.some((file) => /\.(jsx|tsx)$/.test(file))) frameworks.add("React");
  if (/vite/.test(manifestText) || files.some((file) => /(^|\/)vite\.config\./.test(file))) frameworks.add("Vite");
  if (/next/.test(manifestText) || adapter === "next-style") frameworks.add("Next-style");
  if (/express/.test(manifestText)) frameworks.add("Express");
  if (files.some((file) => /server\.(mjs|js|ts)$/.test(file))) frameworks.add("Node");
  if (files.some((file) => file.endsWith(".html"))) frameworks.add("Static HTML");
  return [...frameworks];
}

function detectBoundaries(files, sampled) {
  const frontend = files.filter((file) => /(^|\/)(src|app|pages|public)\/|\.html$/.test(file) && /\.(jsx|tsx|js|ts|html|css)$/.test(file)).slice(0, 30);
  const backend = files.filter((file) => /(^|\/)(api|server|backend|functions|routes)\/|(^|\/)(server|api)\.(mjs|js|ts)$/.test(file)).slice(0, 30);
  const shared = files.filter((file) => /(^|\/)(domain|models|shared|lib)\//.test(file)).slice(0, 30);
  const dataFlow = [];
  for (const item of sampled) {
    if (/fetch\s*\(|axios\.|useQuery\s*\(/.test(item.text)) dataFlow.push({ path: item.path, direction: "frontend_to_api", signal: "client request" });
    if (/createServer\s*\(|\.get\s*\(|\.post\s*\(|Request\s*\(/.test(item.text)) dataFlow.push({ path: item.path, direction: "request_to_handler", signal: "server handler" });
  }
  return { frontend, backend, shared, data_flow: dataFlow.slice(0, 40) };
}

function detectRoutes(sampled) {
  const found = [];
  for (const item of sampled) {
    const patterns = [
      { regex: /(?:fetch|useQuery)\s*\(\s*["'`]([^"'`]+)["'`]/g, kind: "frontend" },
      { regex: /(?:app|router)\.(?:get|post|put|patch|delete)\s*\(\s*["'`]([^"'`]+)["'`]/g, kind: "api" },
      { regex: /url\.pathname\s*===\s*["'`]([^"'`]+)["'`]/g, kind: "api" }
    ];
    for (const pattern of patterns) for (const match of item.text.matchAll(pattern.regex)) found.push({ path: item.path, route: match[1], kind: pattern.kind });
    if (/^(app|pages)\//.test(item.path)) found.push({ path: item.path, route: fileRoute(item.path), kind: "frontend" });
  }
  return uniqueObjects(found, (item) => `${item.path}:${item.route}:${item.kind}`).slice(0, 60);
}

function detectComponents(sampled) {
  const found = [];
  for (const item of sampled) {
    for (const match of item.text.matchAll(/(?:function|const)\s+([A-Z][A-Za-z0-9_]*)\b/g)) found.push({ name: match[1], path: item.path });
  }
  return uniqueObjects(found, (item) => `${item.path}:${item.name}`).slice(0, 60);
}

function detectApiHandlers(sampled) {
  return sampled.filter((item) => /createServer\s*\(|\.middlewares\.use\s*\(|(?:app|router)\.(?:get|post|put|patch|delete)\s*\(|export\s+(?:async\s+)?function\s+(?:GET|POST|PUT|PATCH|DELETE|handle)/.test(item.text)).map((item) => ({ path: item.path, methods: [...new Set([...item.text.matchAll(/\b(GET|POST|PUT|PATCH|DELETE)\b/g)].map((match) => match[1]))] })).slice(0, 50);
}

function detectDataModels(sampled) {
  return sampled.filter((item) => /(?:interface|type|class|schema|model|createTaskStore|useState)\b/.test(item.text)).map((item) => ({ path: item.path, signal: /schema|model/i.test(item.text) ? "schema_or_model" : "typed_or_state_model" })).slice(0, 50);
}

function detectStateUsage(sampled) {
  const signals = [];
  for (const item of sampled) {
    if (/useState\s*\(/.test(item.text)) signals.push({ path: item.path, kind: "React local state" });
    if (/redux|zustand|mobx|createContext\s*\(/i.test(item.text)) signals.push({ path: item.path, kind: "shared client state" });
    if (/createTaskStore|new Map\s*\(|new Set\s*\(/.test(item.text)) signals.push({ path: item.path, kind: "server/domain state" });
  }
  return signals.slice(0, 50);
}

function detectExperienceStates(sampled) {
  const text = sampled.map((item) => item.text).join("\n").toLowerCase();
  return { loading: /loading|aria-busy/.test(text), empty: /empty|no .+ yet|nothing here/.test(text), error: /error|role=["']alert/.test(text), success: /success|saved successfully/.test(text) };
}

function detectQualitySignals(sampled) {
  const text = sampled.map((item) => item.text).join("\n");
  return {
    validation: /required|minLength|minlength|maxLength|maxlength|\.trim\(\)|zod|schema/.test(text),
    accessibility: /aria-|htmlFor|<label|role=["'](?:alert|status)|:focus-visible/.test(text),
    responsive: /@media|viewport|clamp\(/.test(text),
    focused_tests: /node:test|describe\s*\(|test\s*\(/.test(text),
    visible_data_connection: /fetch\s*\([\s\S]{0,500}(?:set[A-Z]|innerHTML|textContent)/.test(text)
  };
}

function detectPackageManager(files) {
  if (files.includes("pnpm-lock.yaml")) return "pnpm";
  if (files.includes("yarn.lock")) return "yarn";
  if (files.includes("bun.lock") || files.includes("bun.lockb")) return "bun";
  return files.includes("package-lock.json") || files.includes("package.json") ? "npm" : "unknown";
}

function normalizeFeature(value) {
  const displayName = String(value || "Task board").replace(/[<>]/g, "").trim().slice(0, 60) || "Task board";
  const slug = displayName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "task-board";
  return { display_name: displayName, slug };
}

function resolveBrowserExecutable(requested) {
  const candidates = [requested, process.env.VNEM_TOOLS_BROWSER_COMMAND, "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", "chromium", "google-chrome", "msedge"].filter(Boolean);
  for (const candidate of candidates) {
    if (path.isAbsolute(candidate) && existsSync(candidate)) return candidate;
    if (!path.isAbsolute(candidate) && commandExists(candidate)) return candidate;
  }
  return null;
}

function commandExists(command) {
  const pathEntries = String(process.env.PATH || "").split(path.delimiter);
  const extensions = process.platform === "win32" ? [".exe", ".cmd", ".bat", ""] : [""];
  return pathEntries.some((entry) => extensions.some((extension) => existsSync(path.join(entry, `${command}${extension}`))));
}

async function createCdpClient(url) {
  const socket = new WebSocket(url);
  const pending = new Map();
  const listeners = new Map();
  let sequence = 0;
  await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (message.id && pending.has(message.id)) {
      const item = pending.get(message.id); pending.delete(message.id);
      if (message.error) item.reject(appError(message.error.message, "cdp_command_failed", message.error)); else item.resolve(message.result || {});
    } else if (message.method) {
      for (const listener of listeners.get(message.method) || []) listener(message.params || {});
    }
  });
  socket.addEventListener("close", () => {
    for (const item of pending.values()) item.reject(appError(`Chrome DevTools connection closed during ${item.method}.`, "cdp_connection_closed", { method: item.method }));
    pending.clear();
  });
  return {
    send(method, params = {}) {
      const id = ++sequence;
      socket.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(id); reject(appError(`Chrome DevTools command timed out: ${method}`, "cdp_command_timeout")); }, 10000);
        pending.set(id, { method, resolve: (value) => { clearTimeout(timer); resolve(value); }, reject: (error) => { clearTimeout(timer); reject(error); } });
      });
    },
    on(method, listener) { if (!listeners.has(method)) listeners.set(method, []); listeners.get(method).push(listener); },
    close() { socket.close(); }
  };
}

async function waitForPageLoad(cdp, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const state = await cdp.send("Runtime.evaluate", { expression: "document.readyState", returnByValue: true }).catch(() => null);
    if (state?.result?.value === "complete") return;
    await delay(100);
  }
  throw appError("Browser page load timed out.", "browser_page_timeout");
}

async function waitFor(predicate, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) { if (await predicate()) return; await delay(100); }
  throw appError("Timed out waiting for browser startup.", "browser_launch_timeout");
}

async function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null) return;
  await Promise.race([new Promise((resolve) => child.once("exit", resolve)), delay(timeoutMs)]);
}

async function readJsonIfPresent(file) {
  try { return JSON.parse(await readFile(file, "utf8")); } catch { return null; }
}

function safeJoin(root, relative) {
  const target = path.resolve(root, String(relative || ""));
  if (!isInside(root, target)) throw appError(`Path escapes project root: ${relative}`, "app_path_outside_root");
  return target;
}

function isInside(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function isSecretPath(relative) {
  return normalizePath(relative).toLowerCase().split("/").some((part) => part === ".env" || part.startsWith(".env.") || /secret|credential|password|token|cookie|session|\.pem$|\.key$/i.test(part));
}

function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function normalizePath(value) { return String(value || "").replaceAll("\\", "/"); }
function roundMs(value) { return Number(value.toFixed(2)); }
function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function uniqueObjects(items, key) { const seen = new Set(); return items.filter((item) => { const value = key(item); if (seen.has(value)) return false; seen.add(value); return true; }); }
function fileRoute(file) { return `/${file.replace(/^(app|pages)\//, "").replace(/\/(page|index)\.(jsx?|tsx?)$/, "").replace(/\.(jsx?|tsx?)$/, "")}`.replace(/\/$/, "") || "/"; }
function appError(message, code, details = {}) { const error = new Error(message); error.code = code; error.details = details; return error; }
