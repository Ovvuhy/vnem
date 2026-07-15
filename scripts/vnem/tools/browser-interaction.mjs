import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { inflateSync } from "node:zlib";
import WebSocket from "ws";

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);
const ACTION_TYPES = new Set(["navigate", "click", "type", "select", "wait", "wait_for", "assert"]);
const INTERACTIVE_ROLES = new Set(["button", "checkbox", "combobox", "link", "menuitem", "radio", "searchbox", "slider", "spinbutton", "switch", "tab", "textbox"]);
const PRIVATE_PATTERN = /(?:^|[^a-z])(login|log-in|sign[ -]?in|account|private|password|credential|cookie|session|token|secret|api[ _-]?key|credit[ _-]?card|ssn)(?:$|[^a-z])/i;
const CAPTCHA_PATTERN = /captcha|recaptcha|hcaptcha|verify (?:you are|that you are) human|human verification/i;
const SEARCH_ENGINE_HOST_PATTERN = /(^|\.)(google|bing|duckduckgo|yahoo|baidu|yandex)\./i;
const SECRET_VALUE_PATTERN = /(?:gh[pousr]_|github_pat_|sk-|xox[baprs]-|cfut_)[A-Za-z0-9_-]{8,}/i;
const MAX_SCENARIOS = 20;
const MAX_ACTIONS = 40;
const MAX_TEXT_VALUE = 500;
const MAX_SCREENSHOT_PIXELS = 12_000_000;

export class BrowserInteractionError extends Error {
  constructor(message, code = "browser_interaction_error", details = {}) {
    super(message);
    this.name = "BrowserInteractionError";
    this.code = code;
    this.details = details;
  }
}

export class BrowserInteractionRuntime {
  constructor({ allowedRoots, evidenceRoot }) {
    this.allowedRoots = allowedRoots.map((root) => path.resolve(root));
    this.evidenceRoot = path.resolve(evidenceRoot);
  }

  async plan(args = {}) {
    const root = await this.resolveRoot(args.root || this.allowedRoots[0]);
    const policy = buildPolicy(args);
    const scenarios = normalizeScenarios(args, policy);
    registerScenarioOrigins(policy, scenarios);
    const blockers = [...policy.blockers];
    for (const scenario of scenarios) blockers.push(...scenario.blockers.map((blocker) => ({ ...blocker, scenario: scenario.name })));
    if (!scenarios.length) blockers.push({ code: "browser_scenarios_required", reason: "At least one bounded browser scenario is required." });
    return {
      schema_version: 1,
      operation_result: blockers.length ? "blocked" : "planned",
      root,
      executed: false,
      browser_was_run: false,
      scenario_count: scenarios.length,
      scenarios: scenarios.map(publicScenario),
      policy: publicPolicy(policy),
      blockers,
      capabilities: {
        dedicated_local_session: true,
        localhost_navigation: true,
        approved_external_same_origin_navigation: true,
        structured_actions: [...ACTION_TYPES],
        console_and_network_events: true,
        request_interception: true,
        exact_declared_origin_requests: true,
        cookie_headers_blocked: true,
        temporary_profile_cookies_cleared: true,
        dom_snapshots: true,
        accessibility_tree_snapshots: true,
        responsive_viewports: true,
        loading_empty_error_success_scenarios: true,
        pixel_level_png_comparison: true,
        evidence_pack_json_and_markdown: true,
        owned_process_cleanup: true,
        cookie_extraction: false,
        login_automation: false,
        captcha_bypass: false,
        stealth_mode: false
      },
      next_best_action: blockers.length
        ? "Correct the explicit blockers; do not weaken login, cookie, CAPTCHA, secret, URL, or approval boundaries."
        : "Re-submit with dry_run=false, approved=true, a non-empty approval_note, and an allowed browser-capture permission profile."
    };
  }

  async run(args = {}) {
    const plan = await this.plan(args);
    if (args.dry_run !== false || plan.blockers.length) return { ...plan, status: plan.blockers.length ? "blocked" : "planned" };
    if (args.approved !== true || !String(args.approval_note || "").trim()) {
      throw new BrowserInteractionError("Browser interaction requires explicit approval and a non-empty approval note.", "approval_required");
    }

    const browser = resolveBrowserExecutable(args.browser_command);
    const runId = `browser-interaction-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const runDir = path.join(this.evidenceRoot, "browser-interaction", runId);
    await mkdir(runDir, { recursive: true });
    if (!browser) {
      const result = {
        ...plan,
        run_id: runId,
        operation_result: "browser_unavailable",
        status: "browser_unavailable",
        evidence_directory: runDir,
        browser_runtime: { available: false, requested: args.browser_command || process.env.VNEM_TOOLS_BROWSER_COMMAND || null },
        safe_to_claim: false,
        must_not_claim: ["A browser session launched.", "Screenshots, interaction, console, network, DOM, or accessibility proof were collected."]
      };
      return await this.writeEvidence(plan.root, runDir, result);
    }

    const startedAt = Date.now();
    const policy = buildPolicy(args);
    const scenarios = normalizeScenarios(args, policy);
    registerScenarioOrigins(policy, scenarios);
    let session;
    let fatalError = null;
    let scenarioResults = [];
    try {
      session = await launchBrowser(browser, runDir, policy);
      scenarioResults = await executeScenarios(session, scenarios, runDir, policy);
    } catch (error) {
      fatalError = { code: error.code || "browser_runtime_failed", reason: redact(String(error.message || error)), details: redactObject(error.details || {}) };
    }
    const termination = session ? await closeBrowserSession(session) : { requested: false, process_exited: true, profile_removed: true, strategies: [] };
    const summaries = summarizeRun(scenarioResults, fatalError, plan.scenario_count);
    const safe = !fatalError && scenarioResults.length === plan.scenario_count && scenarioResults.every((scenario) => scenario.status === "passed") && termination.process_exited && termination.profile_removed;
    const result = {
      schema_version: 1,
      operation_result: safe ? "completed" : fatalError ? "failed" : "partial",
      status: safe ? "passed" : fatalError ? "failed" : "partial",
      run_id: runId,
      root: plan.root,
      executed: true,
      browser_was_run: Boolean(session),
      started_at: new Date(startedAt).toISOString(),
      finished_at: new Date().toISOString(),
      duration_ms: Date.now() - startedAt,
      browser_runtime: session ? {
        available: true,
        executable: browser,
        pid: session.child.pid,
        headless: true,
        dedicated_temporary_profile: true,
        automation_disclosed: true,
        stealth_mode: false,
        devtools_protocol: true,
        browser_sandbox_disabled: true,
        shared_memory_disabled: true,
        limitation: "The browser sandbox and shared-memory path are disabled for isolated automation compatibility; this is not a production-browser security claim."
      } : { available: false, executable: browser },
      policy: plan.policy,
      scenarios: scenarioResults,
      scenario_count: plan.scenario_count,
      ...summaries,
      fatal_error: fatalError,
      browser_termination: termination,
      evidence_directory: runDir,
      safe_to_claim: safe,
      safe_claims: safe ? [
        "The listed scenarios ran in a disclosed dedicated headless Chromium session.",
        "The recorded actions, screenshots, DOM, accessibility, console, network, viewport, state, and image comparisons exist for the listed URLs only."
      ] : [],
      must_not_claim: safe
        ? ["Authenticated, private-account, cookie, CAPTCHA, broad-search, stealth, cross-browser, or unlisted-route behavior was verified."]
        : ["The browser/UI flow passed.", "Screenshots or runtime evidence were collected for failed or missing scenarios.", "Console, network, responsive, accessibility, or state coverage is clean."]
    };
    return await this.writeEvidence(plan.root, runDir, result);
  }

  async compare(args = {}) {
    const root = await this.resolveRoot(args.root || this.allowedRoots[0]);
    const beforePath = await this.resolveReadablePath(root, args.before_pack_path);
    const afterPath = await this.resolveReadablePath(root, args.after_pack_path);
    for (const packPath of [beforePath, afterPath]) {
      const info = await stat(packPath);
      if (info.size > 16 * 1024 * 1024) throw new BrowserInteractionError("Browser evidence packs are limited to 16 MiB.", "browser_evidence_pack_too_large", { path: packPath, bytes: info.size });
    }
    const before = JSON.parse(await readFile(beforePath, "utf8"));
    const after = JSON.parse(await readFile(afterPath, "utf8"));
    const beforeItems = indexScenarioEvidence(before);
    const afterItems = indexScenarioEvidence(after);
    const keys = [...new Set([...beforeItems.keys(), ...afterItems.keys()])].sort();
    const comparisons = [];
    for (const key of keys.slice(0, 100)) {
      const left = beforeItems.get(key);
      const right = afterItems.get(key);
      if (!left || !right) {
        comparisons.push({ key, status: "unmatched", before_present: Boolean(left), after_present: Boolean(right) });
        continue;
      }
      const visual = left.screenshot?.path && right.screenshot?.path
        ? await comparePngFiles(await this.resolveReadablePath(root, left.screenshot.path), await this.resolveReadablePath(root, right.screenshot.path))
        : { status: "unavailable", reason: "matching screenshot paths were not present" };
      comparisons.push({
        key,
        status: "compared",
        visual,
        dom: compareSnapshots(left.dom, right.dom),
        accessibility: compareSnapshots(left.accessibility, right.accessibility)
      });
    }
    return {
      schema_version: 1,
      operation_result: "compared",
      before_pack_path: beforePath,
      after_pack_path: afterPath,
      matching_items: comparisons.filter((item) => item.status === "compared").length,
      unmatched_items: comparisons.filter((item) => item.status === "unmatched").length,
      comparisons,
      visual_changes: comparisons.filter((item) => item.visual?.status === "compared" && item.visual.changed_pixels > 0).length,
      dom_changes: comparisons.filter((item) => item.dom?.changed).length,
      accessibility_changes: comparisons.filter((item) => item.accessibility?.changed).length,
      limitations: ["Pixel comparison reports changed pixels; it does not decide whether a visual change is aesthetically correct.", "DOM and accessibility comparisons are bounded snapshots, not certification."]
    };
  }

  async resolveRoot(candidate) {
    const absolute = path.resolve(candidate);
    const resolved = await realpath(absolute).catch(() => absolute);
    if (!this.allowedRoots.some((allowed) => isInside(allowed, resolved))) throw new BrowserInteractionError("Browser project root is outside allowed roots.", "path_outside_allowed_roots", { root: resolved });
    return resolved;
  }

  async resolveReadablePath(root, candidate) {
    if (!candidate) throw new BrowserInteractionError("Evidence pack path is required.", "evidence_path_required");
    const absolute = path.resolve(root, String(candidate));
    const resolved = await realpath(absolute).catch(() => null);
    if (!resolved || ![...this.allowedRoots, this.evidenceRoot].some((allowed) => isInside(allowed, resolved))) throw new BrowserInteractionError("Evidence path is outside allowed roots or missing.", "evidence_path_blocked", { path: candidate });
    if (PRIVATE_PATTERN.test(path.basename(resolved))) throw new BrowserInteractionError("Secret/session-like evidence paths are blocked.", "secret_path_blocked");
    return resolved;
  }

  async writeEvidence(root, runDir, result) {
    const reportPath = path.join(runDir, "evidence-pack.json");
    const summaryPath = path.join(runDir, "summary.md");
    result.evidence_path = reportPath;
    result.summary_path = summaryPath;
    result.evidence_path_relative = normalizePath(path.relative(root, reportPath));
    result.summary_path_relative = normalizePath(path.relative(root, summaryPath));
    await atomicWrite(reportPath, `${JSON.stringify(result, null, 2)}\n`);
    await atomicWrite(summaryPath, `${humanSummary(result)}\n`);
    return result;
  }
}

function buildPolicy(args) {
  const allowExternal = args.allow_external === true && process.env.VNEM_TOOLS_ALLOW_EXTERNAL_BROWSER === "1";
  const approvedOrigins = new Set((args.approved_origins || []).map((value) => {
    try { return new URL(value).origin; } catch { return null; }
  }).filter(Boolean));
  const blockers = [];
  if (args.allow_external === true && process.env.VNEM_TOOLS_ALLOW_EXTERNAL_BROWSER !== "1") blockers.push({ code: "external_browser_policy_disabled", reason: "Set VNEM_TOOLS_ALLOW_EXTERNAL_BROWSER=1 as well as allow_external=true for approved external navigation." });
  return {
    localhost_enabled: process.env.VNEM_TOOLS_ALLOW_LOCALHOST === "1",
    external_enabled: allowExternal,
    approved_origins: [...approvedOrigins],
    same_origin_external_read_only: true,
    request_interception: true,
    dedicated_profile: true,
    headless: true,
    automation_disclosed: true,
    stealth_mode: false,
    cookie_access: false,
    login_automation: false,
    captcha_bypass: false,
    broad_search_scraping: false,
    blockers,
    _approvedOrigins: approvedOrigins,
    _allowedOrigins: new Set(approvedOrigins)
  };
}

function normalizeScenarios(args, policy) {
  const baseUrl = String(args.app_url || "").trim();
  const raw = Array.isArray(args.scenarios) && args.scenarios.length
    ? args.scenarios
    : baseUrl ? [{ name: "default", url: baseUrl, viewport: args.viewport, state: args.state, actions: args.actions || [] }] : [];
  if (raw.length > MAX_SCENARIOS) throw new BrowserInteractionError(`Browser runs are limited to ${MAX_SCENARIOS} scenarios.`, "browser_scenario_limit");
  const scenarios = raw.map((item, index) => normalizeScenario(item, index, baseUrl, policy));
  const names = new Set();
  for (const scenario of scenarios) {
    if (names.has(scenario.name)) throw new BrowserInteractionError(`Browser scenario names must be unique: ${scenario.name}`, "browser_scenario_name_duplicate");
    names.add(scenario.name);
  }
  return scenarios;
}

function normalizeScenario(raw, index, baseUrl, policy) {
  const name = String(raw.name || `scenario-${index + 1}`).replace(/[^a-z0-9_.-]+/gi, "-").slice(0, 80);
  const blockers = [];
  let url;
  try { url = new URL(String(raw.url || baseUrl || ""), baseUrl || undefined); } catch { blockers.push({ code: "invalid_url", reason: "Scenario URL is invalid." }); }
  const viewport = normalizeViewport(raw.viewport || raw.viewport_name || "desktop");
  const physicalPixels = viewport.width * viewport.height * viewport.device_scale_factor * viewport.device_scale_factor;
  if (physicalPixels > MAX_SCREENSHOT_PIXELS) blockers.push({ code: "browser_viewport_pixel_limit", reason: `Physical screenshot size is limited to ${MAX_SCREENSHOT_PIXELS} pixels.` });
  const actions = Array.isArray(raw.actions) ? raw.actions.slice(0, MAX_ACTIONS).map((action, actionIndex) => normalizeAction(action, actionIndex, url, policy)) : [];
  if ((raw.actions || []).length > MAX_ACTIONS) blockers.push({ code: "browser_action_limit", reason: `A scenario is limited to ${MAX_ACTIONS} actions.` });
  if (url) blockers.push(...urlBlockers(url, policy));
  for (const action of actions) blockers.push(...action.blockers);
  if (url && !LOCAL_HOSTS.has(url.hostname) && actions.some((action) => ["click", "type", "select"].includes(action.type))) blockers.push({ code: "external_interaction_blocked", reason: "Approved external browser runs are same-origin read-only; click/type/select actions remain localhost-only." });
  return { name, url: url?.toString() || "", viewport, state: String(raw.state || "unspecified").slice(0, 60), actions, blockers };
}

function normalizeAction(raw, index, currentUrl, policy) {
  const type = String(raw?.type || "").toLowerCase();
  const blockers = [];
  if (!ACTION_TYPES.has(type)) blockers.push({ code: "browser_action_unknown", action_index: index, reason: `Unsupported action type: ${type || "missing"}` });
  const selector = raw?.selector === undefined ? "" : String(raw.selector).slice(0, 240);
  const value = raw?.value === undefined ? "" : String(raw.value).slice(0, MAX_TEXT_VALUE);
  const text = raw?.text === undefined ? "" : String(raw.text).slice(0, MAX_TEXT_VALUE);
  if (selector && PRIVATE_PATTERN.test(selector)) blockers.push({ code: "private_selector_blocked", action_index: index, reason: "Selectors that target login, credential, cookie, session, token, or private fields are blocked." });
  if ((value && (PRIVATE_PATTERN.test(value) || SECRET_VALUE_PATTERN.test(value))) || (text && SECRET_VALUE_PATTERN.test(text))) blockers.push({ code: "secret_or_private_value_blocked", action_index: index, reason: "Secret-shaped or private credential values are blocked from browser actions." });
  if (String(raw?.value ?? "").length > MAX_TEXT_VALUE || String(raw?.text ?? "").length > MAX_TEXT_VALUE) blockers.push({ code: "browser_action_text_limit", action_index: index, reason: `Browser action text is limited to ${MAX_TEXT_VALUE} characters.` });
  let url = "";
  if (type === "navigate") {
    try {
      const target = new URL(String(raw.url || raw.value || ""), currentUrl?.toString());
      url = target.toString();
      blockers.push(...urlBlockers(target, policy).map((blocker) => ({ ...blocker, action_index: index })));
    } catch { blockers.push({ code: "invalid_navigation_url", action_index: index }); }
  }
  if (["click", "type", "select"].includes(type) && !selector) blockers.push({ code: "browser_selector_required", action_index: index, reason: `${type} requires a bounded selector.` });
  if (["wait_for", "assert"].includes(type) && !selector && !text && !raw?.url_contains) blockers.push({ code: "browser_condition_required", action_index: index, reason: `${type} requires a selector, expected text, or URL fragment.` });
  return {
    type,
    selector,
    value,
    text,
    url,
    url_contains: String(raw?.url_contains || "").slice(0, 240),
    timeout_ms: clamp(raw?.timeout_ms, 100, 10_000, 5_000),
    wait_after_ms: clamp(raw?.wait_after_ms, 0, 2_000, 100),
    blockers
  };
}

function normalizeViewport(value) {
  const presets = {
    mobile: { label: "mobile", width: 390, height: 844, mobile: true, device_scale_factor: 2 },
    tablet: { label: "tablet", width: 768, height: 1024, mobile: true, device_scale_factor: 1 },
    desktop: { label: "desktop", width: 1440, height: 900, mobile: false, device_scale_factor: 1 }
  };
  if (typeof value === "string") return presets[value.toLowerCase()] || presets.desktop;
  return {
    label: String(value?.label || `${value?.width || 1440}x${value?.height || 900}`).slice(0, 60),
    width: clamp(value?.width, 320, 2560, 1440),
    height: clamp(value?.height, 320, 1600, 900),
    mobile: value?.mobile === true,
    device_scale_factor: clamp(value?.device_scale_factor, 1, 3, value?.mobile ? 2 : 1)
  };
}

function urlBlockers(url, policy) {
  const blockers = [];
  if (!['http:', 'https:'].includes(url.protocol)) blockers.push({ code: "unsafe_browser_url", reason: "Only HTTP(S) URLs are supported." });
  if (url.username || url.password || containsSensitiveQuery(url)) blockers.push({ code: "credentialed_or_secret_url_blocked", reason: "Credentialed URLs and secret-like query parameters are blocked." });
  if (PRIVATE_PATTERN.test(`${url.pathname} ${url.search}`)) blockers.push({ code: "private_flow_blocked", reason: "Login, account, private, cookie, session, token, and credential routes are blocked." });
  if (CAPTCHA_PATTERN.test(`${url.pathname} ${url.search}`)) blockers.push({ code: "captcha_flow_blocked", reason: "CAPTCHA flows are detection-only and are never automated." });
  if (SEARCH_ENGINE_HOST_PATTERN.test(url.hostname)) blockers.push({ code: "search_engine_scraping_blocked", reason: "Broad search-engine browser automation is blocked." });
  if (LOCAL_HOSTS.has(url.hostname)) {
    if (!policy.localhost_enabled) blockers.push({ code: "localhost_policy_disabled", reason: "Set VNEM_TOOLS_ALLOW_LOCALHOST=1 for localhost browser interaction." });
  } else if (!policy.external_enabled || !policy._approvedOrigins.has(url.origin)) {
    blockers.push({ code: "external_origin_not_approved", reason: "External URLs require both policy enablement and an exact approved origin." });
  }
  return blockers;
}

function publicScenario(scenario) {
  return {
    name: scenario.name,
    url: redactUrl(scenario.url),
    viewport: scenario.viewport,
    state: scenario.state,
    actions: scenario.actions.map(publicAction),
    blockers: scenario.blockers
  };
}

function publicAction(action) {
  return {
    type: action.type,
    selector: action.selector || undefined,
    value: action.value ? `[test text length=${action.value.length} sha256=${sha256(action.value).slice(0, 12)}]` : undefined,
    text: action.text || undefined,
    url: action.url ? redactUrl(action.url) : undefined,
    url_contains: action.url_contains || undefined,
    timeout_ms: action.timeout_ms,
    wait_after_ms: action.wait_after_ms
  };
}

function publicPolicy(policy) {
  const { _approvedOrigins, _allowedOrigins, blockers, ...rest } = policy;
  return rest;
}

function registerScenarioOrigins(policy, scenarios) {
  for (const scenario of scenarios) {
    try { policy._allowedOrigins.add(new URL(scenario.url).origin); } catch {}
    for (const action of scenario.actions) if (action.url) {
      try { policy._allowedOrigins.add(new URL(action.url).origin); } catch {}
    }
  }
  policy.declared_origins = [...policy._allowedOrigins].sort();
}

async function launchBrowser(executable, runDir, policy) {
  const profileDir = path.join(runDir, "browser-profile");
  await mkdir(profileDir, { recursive: true });
  const child = spawn(executable, [
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
    "--disable-features=PasswordManagerOnboarding",
    "--password-store=basic",
    "about:blank"
  ], { windowsHide: true, stdio: ["ignore", "ignore", "pipe"], detached: process.platform !== "win32" });
  let stderr = "";
  let spawnError = null;
  let cdp;
  child.stderr?.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-8000); });
  child.once("error", (error) => { spawnError = error; });
  try {
    const activePortFile = path.join(profileDir, "DevToolsActivePort");
    await waitFor(async () => {
      if (spawnError) throw new BrowserInteractionError("Chromium could not be started.", "browser_spawn_failed", { error: redact(spawnError.message) });
      if (child.exitCode !== null || child.signalCode !== null) throw new BrowserInteractionError("Chromium exited before exposing DevTools.", "browser_exited_before_debugging", { exit_code: child.exitCode, signal: child.signalCode, stderr: redact(stderr) });
      return existsSync(activePortFile);
    }, 30_000, "browser launch");
    const [port] = (await readFile(activePortFile, "utf8")).trim().split(/\r?\n/);
    const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
    const page = targets.find((item) => item.type === "page");
    if (!page?.webSocketDebuggerUrl) throw new BrowserInteractionError("Chromium did not expose a page target.", "browser_target_missing");
    cdp = await createCdpClient(page.webSocketDebuggerUrl);
    for (const domain of ["Page", "Runtime", "Network", "Accessibility", "Fetch"]) await cdp.send(`${domain}.enable`, domain === "Fetch" ? { patterns: [{ urlPattern: "*", requestStage: "Request" }] } : {});
    await cdp.send("Network.clearBrowserCookies");
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
    const events = { console: [], network: [], failures: [], blocked_requests: [] };
    let activeScenario = "startup";
    cdp.on("Runtime.consoleAPICalled", (event) => events.console.push({ scenario: activeScenario, type: event.type, text: redact(event.args?.map((arg) => arg.value ?? arg.description ?? "").join(" ") || "") }));
    cdp.on("Runtime.exceptionThrown", (event) => events.console.push({ scenario: activeScenario, type: "exception", text: redact(event.exceptionDetails?.text || "Unhandled browser exception") }));
    cdp.on("Network.responseReceived", (event) => events.network.push({ scenario: activeScenario, url: redactUrl(event.response.url), status: event.response.status, type: event.type, mime_type: event.response.mimeType }));
    cdp.on("Network.loadingFailed", (event) => events.failures.push({ scenario: activeScenario, request_id: event.requestId, error_text: redact(event.errorText), canceled: Boolean(event.canceled), blocked_reason: event.blockedReason || null }));
    cdp.on("Fetch.requestPaused", (event) => {
      const requestUrl = event.request?.url || "";
      const hasCookieHeader = Object.keys(event.request?.headers || {}).some((name) => name.toLowerCase() === "cookie");
      if (!hasCookieHeader && requestAllowed(requestUrl, policy)) void cdp.send("Fetch.continueRequest", { requestId: event.requestId }).catch(() => {});
      else {
        events.blocked_requests.push({ scenario: activeScenario, url: redactUrl(requestUrl), reason: hasCookieHeader ? "cookie_header_blocked" : "origin_or_scheme_not_allowed" });
        void cdp.send("Fetch.failRequest", { requestId: event.requestId, errorReason: "BlockedByClient" }).catch(() => {});
      }
    });
    return { executable, child, cdp, profileDir, events, policy, setActiveScenario(value) { activeScenario = value; } };
  } catch (error) {
    const cleanup = await closeBrowserSession({ child, cdp, profileDir }).catch(() => ({ process_exited: false, profile_removed: false }));
    error.details = { ...(error.details || {}), failed_launch_cleanup: cleanup };
    throw error;
  }
}

async function executeScenarios(session, scenarios, runDir, policy) {
  const results = [];
  for (const scenario of scenarios) {
    let haltAfterScenario = false;
    session.setActiveScenario(scenario.name);
    const startedAt = Date.now();
    const eventOffsets = { console: session.events.console.length, network: session.events.network.length, failures: session.events.failures.length, blocked: session.events.blocked_requests.length };
    const result = { name: scenario.name, url: redactUrl(scenario.url), viewport: scenario.viewport, state: scenario.state, status: "running", action_results: [] };
    try {
      await session.cdp.send("Emulation.setDeviceMetricsOverride", { width: scenario.viewport.width, height: scenario.viewport.height, deviceScaleFactor: scenario.viewport.device_scale_factor, mobile: scenario.viewport.mobile });
      await navigate(session.cdp, scenario.url, policy);
      await assertNoCaptcha(session.cdp);
      await assertNoPrivateFlow(session.cdp);
      result.before = await captureEvidence(session.cdp, runDir, scenario, "before");
      for (let index = 0; index < scenario.actions.length; index += 1) {
        const action = scenario.actions[index];
        const actionResult = await executeAction(session.cdp, action, policy);
        result.action_results.push({ index, ...actionResult });
        await assertNoCaptcha(session.cdp);
      }
      result.after = await captureEvidence(session.cdp, runDir, scenario, "after");
      result.before_after = {
        status: "compared",
        visual: await comparePngFiles(result.before.screenshot.path, result.after.screenshot.path),
        dom: compareSnapshots(result.before.dom, result.after.dom),
        accessibility: compareSnapshots(result.before.accessibility, result.after.accessibility)
      };
      const hasPassingAssertion = result.action_results.some((item) => item.type === "assert" && item.passed);
      result.state_result = { state: scenario.state, status: scenario.state === "unspecified" || hasPassingAssertion ? "passed" : "not_proven", proof: hasPassingAssertion ? "structured assert action passed" : null };
      const screenshotsRendered = [result.before, result.after].every((evidence) => evidence.screenshot.render_integrity.status === "nonblank");
      result.validation_failures = [!screenshotsRendered ? "blank_or_uniform_screenshot" : null, result.after.dom.horizontal_overflow ? "horizontal_overflow" : null].filter(Boolean);
      result.status = result.action_results.every((item) => item.passed) && result.state_result.status === "passed" && result.validation_failures.length === 0 ? "passed" : "failed";
    } catch (error) {
      result.status = "failed";
      result.error = { code: error.code || "browser_scenario_failed", reason: redact(String(error.message || error)), details: redactObject(error.details || {}) };
      result.state_result = { state: scenario.state, status: error.code === "captcha_detected" ? "blocked_captcha_detected" : "failed" };
      haltAfterScenario = error.code === "captcha_detected";
      result.after = await captureEvidence(session.cdp, runDir, scenario, "failed").catch(() => null);
    }
    result.console = session.events.console.slice(eventOffsets.console);
    result.network = session.events.network.slice(eventOffsets.network);
    result.network_failures = session.events.failures.slice(eventOffsets.failures);
    result.blocked_requests = session.events.blocked_requests.slice(eventOffsets.blocked);
    result.console_errors = result.console.filter((item) => ["error", "exception"].includes(item.type));
    result.bad_responses = result.network.filter((item) => item.status >= 400);
    if (result.console_errors.length || result.network_failures.length || result.bad_responses.length || result.blocked_requests.length) result.status = "failed";
    result.duration_ms = Date.now() - startedAt;
    results.push(result);
    if (haltAfterScenario) break;
  }
  return results;
}

async function executeAction(cdp, action, policy) {
  const startedAt = Date.now();
  let details;
  if (["click", "type", "select"].includes(action.type)) await assertNoPrivateFlow(cdp);
  if (action.type === "navigate") {
    const target = new URL(action.url);
    const blockers = urlBlockers(target, policy);
    if (blockers.length) throw new BrowserInteractionError("Navigation target is blocked.", blockers[0].code, { blockers });
    details = await navigate(cdp, target.toString(), policy);
    await assertNoPrivateFlow(cdp);
  } else if (action.type === "click") {
    const target = await browserFunction(cdp, ({ selector }) => {
      const element = document.querySelector(selector);
      if (!element) return { passed: false, reason: "selector_not_found" };
      const link = element.closest("a");
      const form = element.form || element.closest("form");
      return {
        passed: true,
        label: String(element.innerText || element.getAttribute("aria-label") || element.getAttribute("title") || "").trim().slice(0, 200),
        target_url: link?.href || (form ? (element.formAction || form.action) : "") || "",
        opens_new_context: link?.target === "_blank" || element.formTarget === "_blank",
        private_form: Boolean(form?.querySelector("input[type='password'],input[autocomplete='current-password'],input[autocomplete='new-password'],input[autocomplete='one-time-code']"))
      };
    }, { selector: action.selector });
    if (!target?.passed) throw new BrowserInteractionError("Browser click action failed.", "browser_click_failed", { action: publicAction(action), result: target });
    if (target.private_form || PRIVATE_PATTERN.test(target.label)) throw new BrowserInteractionError("Private or authenticated click flows are blocked.", "private_flow_detected", { selector: action.selector });
    if (target.opens_new_context) throw new BrowserInteractionError("Browser actions that open a new window or tab are blocked.", "new_browser_context_blocked", { selector: action.selector });
    if (target.target_url) {
      const targetUrl = new URL(target.target_url);
      const blockers = urlBlockers(targetUrl, policy);
      if (blockers.length) throw new BrowserInteractionError("Click navigation target is blocked.", blockers[0].code, { blockers });
      if (!policy._allowedOrigins.has(targetUrl.origin)) throw new BrowserInteractionError("Click navigation target origin was not declared in the scenario or approved origins.", "browser_origin_not_declared", { origin: targetUrl.origin });
    }
    details = await browserFunction(cdp, ({ selector }) => {
      const element = document.querySelector(selector);
      if (!element) return { passed: false, reason: "selector_not_found" };
      if (element.disabled) return { passed: false, reason: "element_disabled" };
      element.scrollIntoView({ block: "center", inline: "center" });
      element.click();
      return { passed: true, tag: element.tagName.toLowerCase(), id: element.id || null };
    }, { selector: action.selector });
  } else if (action.type === "type") {
    details = await browserFunction(cdp, ({ selector, value }) => {
      const element = document.querySelector(selector);
      if (!element) return { passed: false, reason: "selector_not_found" };
      const tag = element.tagName.toLowerCase();
      const type = String(element.type || "text").toLowerCase();
      if (!(["input", "textarea"].includes(tag)) || ["password", "file", "hidden", "email"].includes(type)) return { passed: false, reason: "unsafe_or_unsupported_test_field", tag, type };
      const prototype = tag === "textarea" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
      if (!setter) return { passed: false, reason: "value_setter_unavailable" };
      setter.call(element, value);
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return { passed: true, tag, type, value_length: value.length };
    }, { selector: action.selector, value: action.value });
    if (details) delete details.value;
  } else if (action.type === "select") {
    details = await browserFunction(cdp, ({ selector, value }) => {
      const element = document.querySelector(selector);
      if (!(element instanceof HTMLSelectElement)) return { passed: false, reason: "select_not_found" };
      if (![...element.options].some((option) => option.value === value)) return { passed: false, reason: "option_not_found" };
      element.value = value;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return { passed: element.value === value, selected_index: element.selectedIndex };
    }, { selector: action.selector, value: action.value });
  } else if (action.type === "wait") {
    await delay(action.timeout_ms);
    details = { passed: true, waited_ms: action.timeout_ms };
  } else if (action.type === "wait_for") {
    details = await waitForCondition(cdp, action, action.timeout_ms);
  } else if (action.type === "assert") {
    details = await evaluateCondition(cdp, action);
  }
  if (!details?.passed) throw new BrowserInteractionError(`Browser ${action.type} action failed.`, `browser_${action.type}_failed`, { action: publicAction(action), result: details });
  if (action.wait_after_ms) await delay(action.wait_after_ms);
  if (["navigate", "click"].includes(action.type)) await assertNoPrivateFlow(cdp);
  return { type: action.type, selector: action.selector || null, passed: true, duration_ms: Date.now() - startedAt, evidence: redactObject(details) };
}

async function evaluateCondition(cdp, action) {
  return await browserFunction(cdp, ({ selector, text, urlContains }) => {
    const element = selector ? document.querySelector(selector) : document.body;
    if (!element) return { passed: false, reason: "selector_not_found" };
    const style = getComputedStyle(element);
    const visible = style.display !== "none" && style.visibility !== "hidden" && element.getBoundingClientRect().width > 0 && element.getBoundingClientRect().height > 0;
    const content = String(element.innerText || element.textContent || "");
    const textPassed = !text || content.includes(text);
    const urlPassed = !urlContains || location.href.includes(urlContains);
    return { passed: visible && textPassed && urlPassed, visible, text_present: textPassed, url_present: urlPassed, text_excerpt: content.slice(0, 300), url: location.href };
  }, { selector: action.selector, text: action.text, urlContains: action.url_contains });
}

async function waitForCondition(cdp, action, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const result = await evaluateCondition(cdp, action).catch(() => ({ passed: false }));
    if (result.passed) return { ...result, waited_ms: Date.now() - startedAt };
    await delay(100);
  }
  return { passed: false, reason: "condition_timeout", waited_ms: Date.now() - startedAt };
}

async function navigate(cdp, url) {
  const response = await cdp.send("Page.navigate", { url });
  if (response.errorText) throw new BrowserInteractionError("Browser navigation failed.", "browser_navigation_failed", { error: response.errorText, url: redactUrl(url) });
  await waitForPageLoad(cdp, 10_000);
  await delay(250);
  return { passed: true, url: redactUrl(url) };
}

async function assertNoCaptcha(cdp) {
  const detection = await browserFunction(cdp, () => {
    const text = String(document.body?.innerText || "");
    const selector = "iframe[src*='recaptcha'],iframe[src*='hcaptcha'],.g-recaptcha,.h-captcha,[data-sitekey]";
    return { passed: true, detected: /captcha|recaptcha|hcaptcha|verify (?:you are|that you are) human|human verification/i.test(text) || Boolean(document.querySelector(selector)) };
  }, {});
  if (detection.detected) throw new BrowserInteractionError("CAPTCHA or human verification was detected; no bypass or further interaction was attempted.", "captcha_detected");
}

async function assertNoPrivateFlow(cdp) {
  const detection = await browserFunction(cdp, () => {
    const privateFields = document.querySelectorAll("input[type='password'],input[autocomplete='current-password'],input[autocomplete='new-password'],input[autocomplete='one-time-code'],input[autocomplete^='cc-']");
    const privateForm = [...document.querySelectorAll("form")].find((form) => {
      const controls = String([...form.querySelectorAll("button,input[type='submit'],[role='button']")].map((element) => element.innerText || element.value || element.getAttribute("aria-label") || "").join(" "));
      return /login|log-in|sign[ -]?in|account|password|credential/i.test(controls);
    });
    return { passed: true, detected: privateFields.length > 0 || Boolean(privateForm), private_field_count: privateFields.length };
  }, {});
  if (detection.detected) throw new BrowserInteractionError("A private, credential, payment, or authenticated flow was detected; no interaction was attempted.", "private_flow_detected", { private_field_count: detection.private_field_count });
}

async function captureEvidence(cdp, runDir, scenario, stage) {
  const dom = await captureDom(cdp);
  const accessibility = await captureAccessibility(cdp);
  const capture = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
  const filename = `${scenario.name}-${scenario.viewport.label}-${stage}.png`.replace(/[^a-z0-9_.-]+/gi, "-");
  const screenshotPath = path.join(runDir, filename);
  const bytes = Buffer.from(capture.data, "base64");
  await writeFile(screenshotPath, bytes);
  const decoded = decodePng(bytes);
  return { dom, accessibility, screenshot: { path: screenshotPath, sha256: sha256(bytes), bytes: bytes.length, width: decoded.width, height: decoded.height, stage, render_integrity: analyzeRenderedPixels(decoded) } };
}

async function captureDom(cdp) {
  const value = await browserFunction(cdp, () => {
    const interactive = [...document.querySelectorAll("a,button,input,select,textarea,[role],[tabindex]")].slice(0, 120).map((element) => ({
      tag: element.tagName.toLowerCase(), id: element.id || null, role: element.getAttribute("role"), type: element.getAttribute("type"), name: element.getAttribute("name"), text: String(element.innerText || element.getAttribute("aria-label") || element.getAttribute("placeholder") || "").trim().slice(0, 120), disabled: Boolean(element.disabled)
    }));
    return {
      title: document.title,
      url: location.href,
      ready_state: document.readyState,
      text: String(document.body?.innerText || "").slice(0, 8000),
      html_language: document.documentElement.lang || null,
      headings: [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].slice(0, 80).map((element) => ({ level: Number(element.tagName.slice(1)), text: String(element.innerText || "").trim().slice(0, 200) })),
      interactive,
      active_element: document.activeElement ? { tag: document.activeElement.tagName.toLowerCase(), id: document.activeElement.id || null } : null,
      viewport_width: innerWidth,
      document_width: document.documentElement.scrollWidth,
      horizontal_overflow: document.documentElement.scrollWidth > innerWidth + 1
    };
  }, {});
  value.url = redactUrl(value.url);
  value.snapshot_hash = sha256(JSON.stringify(value));
  return redactObject(value);
}

async function captureAccessibility(cdp) {
  const tree = await cdp.send("Accessibility.getFullAXTree", { depth: 12 });
  const nodes = (tree.nodes || []).filter((node) => !node.ignored).slice(0, 500).map((node) => ({ role: node.role?.value || "unknown", name: String(node.name?.value || "").slice(0, 240), disabled: node.properties?.some((property) => property.name === "disabled" && property.value?.value === true) || false }));
  const unnamedInteractive = nodes.filter((node) => INTERACTIVE_ROLES.has(node.role) && !node.name).map((node) => ({ role: node.role, issue: "interactive accessibility node has no accessible name" }));
  return {
    node_count: nodes.length,
    interactive_count: nodes.filter((node) => INTERACTIVE_ROLES.has(node.role)).length,
    unnamed_interactive_count: unnamedInteractive.length,
    issues: unnamedInteractive,
    roles: nodes.slice(0, 160),
    snapshot_hash: sha256(JSON.stringify(nodes))
  };
}

function summarizeRun(scenarios, fatalError, expectedScenarioCount = scenarios.length) {
  const consoleEvents = scenarios.flatMap((scenario) => scenario.console || []);
  const consoleErrors = scenarios.flatMap((scenario) => scenario.console_errors || []);
  const network = scenarios.flatMap((scenario) => scenario.network || []);
  const failures = scenarios.flatMap((scenario) => scenario.network_failures || []);
  const badResponses = scenarios.flatMap((scenario) => scenario.bad_responses || []);
  const blockedRequests = scenarios.flatMap((scenario) => scenario.blocked_requests || []);
  const screenshots = scenarios.flatMap((scenario) => [scenario.before?.screenshot, scenario.after?.screenshot].filter(Boolean).map((screenshot) => ({ scenario: scenario.name, ...screenshot })));
  const a11yIssues = scenarios.flatMap((scenario) => [scenario.before?.accessibility, scenario.after?.accessibility].filter(Boolean).flatMap((snapshot) => snapshot.issues || []).map((issue) => ({ scenario: scenario.name, ...issue })));
  return {
    counts: { planned: expectedScenarioCount, executed: scenarios.length, passed: scenarios.filter((scenario) => scenario.status === "passed").length, failed: scenarios.filter((scenario) => scenario.status === "failed").length },
    screenshots,
    console_summary: { status: fatalError ? "partial" : consoleErrors.length ? "errors" : "clean", event_count: consoleEvents.length, error_count: consoleErrors.length, errors: consoleErrors },
    network_summary: { status: fatalError ? "partial" : failures.length || badResponses.length || blockedRequests.length ? "failures" : "clean", response_count: network.length, failures, bad_responses: badResponses, blocked_requests: blockedRequests },
    accessibility_summary: { status: fatalError ? "partial" : "checked", snapshots: scenarios.reduce((sum, scenario) => sum + Number(Boolean(scenario.before?.accessibility)) + Number(Boolean(scenario.after?.accessibility)), 0), issue_count: a11yIssues.length, issues: a11yIssues },
    viewport_coverage: [...new Set(scenarios.map((scenario) => scenario.viewport.label))].map((viewport) => ({ viewport, status: scenarios.filter((scenario) => scenario.viewport.label === viewport).every((scenario) => scenario.status === "passed") ? "passed" : "failed", scenarios: scenarios.filter((scenario) => scenario.viewport.label === viewport).map((scenario) => scenario.name) })),
    state_coverage: [...new Set(scenarios.map((scenario) => scenario.state))].map((state) => ({ state, status: scenarios.filter((scenario) => scenario.state === state).every((scenario) => scenario.state_result?.status === "passed") ? "passed" : "not_proven", scenarios: scenarios.filter((scenario) => scenario.state === state).map((scenario) => scenario.name) })),
    before_after_comparison: { status: scenarios.length && scenarios.every((scenario) => scenario.before_after?.status === "compared") ? "present" : "partial", pairs: scenarios.map((scenario) => ({ scenario: scenario.name, ...scenario.before_after })).filter((item) => item.status === "compared") }
  };
}

async function closeBrowserSession(session) {
  const strategies = [];
  if (session.cdp) {
    await session.cdp.send("Network.clearBrowserCookies").catch(() => {});
    strategies.push("Browser.close");
    await Promise.race([session.cdp.send("Browser.close").catch(() => {}), delay(1500)]);
    session.cdp.close();
  }
  await waitForExit(session.child, 2500);
  if (session.child.exitCode === null) {
    if (process.platform === "win32") {
      strategies.push("taskkill-owned-tree");
      await runProcess("taskkill.exe", ["/pid", String(session.child.pid), "/T", "/F"], 5000).catch(() => {});
    } else {
      strategies.push("kill-owned-process-group");
      try { process.kill(-session.child.pid, "SIGTERM"); } catch {}
      await waitForExit(session.child, 1500);
      if (session.child.exitCode === null) try { process.kill(-session.child.pid, "SIGKILL"); } catch {}
    }
  }
  await waitForExit(session.child, 2500);
  let profileRemoved = false;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      await rm(session.profileDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      profileRemoved = !existsSync(session.profileDir);
      if (profileRemoved) break;
    } catch {}
    await delay(100);
  }
  return { requested: true, pid: session.child.pid, process_exited: session.child.exitCode !== null || session.child.signalCode !== null, exit_code: session.child.exitCode, signal: session.child.signalCode, profile_removed: profileRemoved, strategies };
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
      const item = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) item.reject(new BrowserInteractionError(message.error.message, "cdp_command_failed", message.error)); else item.resolve(message.result || {});
    } else if (message.method) for (const listener of listeners.get(message.method) || []) listener(message.params || {});
  });
  socket.addEventListener("close", () => {
    for (const item of pending.values()) item.reject(new BrowserInteractionError(`Chrome DevTools closed during ${item.method}.`, "cdp_connection_closed"));
    pending.clear();
  });
  return {
    send(method, params = {}) {
      const id = ++sequence;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(id); reject(new BrowserInteractionError(`Chrome DevTools command timed out: ${method}`, "cdp_command_timeout")); }, 12_000);
        pending.set(id, { method, resolve: (value) => { clearTimeout(timer); resolve(value); }, reject: (error) => { clearTimeout(timer); reject(error); } });
        try { socket.send(JSON.stringify({ id, method, params })); }
        catch (error) {
          clearTimeout(timer);
          pending.delete(id);
          reject(new BrowserInteractionError(`Chrome DevTools send failed: ${method}`, "cdp_send_failed", { error: redact(error.message) }));
        }
      });
    },
    on(method, listener) { if (!listeners.has(method)) listeners.set(method, []); listeners.get(method).push(listener); },
    close() { if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) socket.close(); }
  };
}

async function browserFunction(cdp, fn, args) {
  const expression = `(${fn.toString()})(${JSON.stringify(args)})`;
  const response = await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (response.exceptionDetails) throw new BrowserInteractionError("Browser function threw an exception.", "browser_function_exception", { text: response.exceptionDetails.text });
  return response.result?.value;
}

async function waitForPageLoad(cdp, timeoutMs) {
  await waitFor(async () => {
    const state = await cdp.send("Runtime.evaluate", { expression: "document.readyState", returnByValue: true }).catch(() => null);
    return state?.result?.value === "complete";
  }, timeoutMs, "page load");
}

async function waitFor(predicate, timeoutMs, label) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await predicate()) return;
    await delay(100);
  }
  throw new BrowserInteractionError(`Timed out waiting for ${label}.`, "browser_wait_timeout", { label, timeout_ms: timeoutMs });
}

function requestAllowed(value, policy) {
  try {
    const url = new URL(value);
    if (["data:", "blob:", "about:", "devtools:"].includes(url.protocol)) return true;
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    if (url.username || url.password || containsSensitiveQuery(url)) return false;
    if (PRIVATE_PATTERN.test(`${url.pathname} ${url.search}`) || CAPTCHA_PATTERN.test(`${url.pathname} ${url.search}`) || SEARCH_ENGINE_HOST_PATTERN.test(url.hostname)) return false;
    if (LOCAL_HOSTS.has(url.hostname)) return policy.localhost_enabled && policy._allowedOrigins.has(url.origin);
    return policy.external_enabled && policy._approvedOrigins.has(url.origin);
  } catch { return false; }
}

function resolveBrowserExecutable(requested) {
  const candidates = [
    requested,
    process.env.VNEM_TOOLS_BROWSER_COMMAND,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/microsoft-edge",
    "chromium",
    "google-chrome",
    "msedge"
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (path.isAbsolute(candidate) && existsSync(candidate)) return candidate;
    if (!path.isAbsolute(candidate) && commandExists(candidate)) return candidate;
  }
  return null;
}

function commandExists(command) {
  const extensions = process.platform === "win32" ? [".exe", ".cmd", ".bat", ""] : [""];
  return String(process.env.PATH || "").split(path.delimiter).some((entry) => extensions.some((extension) => existsSync(path.join(entry, `${command}${extension}`))));
}

function compareSnapshots(before, after) {
  if (!before || !after) return { status: "unavailable", changed: null };
  return { status: "compared", changed: before.snapshot_hash !== after.snapshot_hash, before_hash: before.snapshot_hash, after_hash: after.snapshot_hash };
}

async function comparePngFiles(beforePath, afterPath) {
  try {
    const before = decodePng(await readFile(beforePath));
    const after = decodePng(await readFile(afterPath));
    if (before.width !== after.width || before.height !== after.height) return { status: "dimensions_changed", before: { width: before.width, height: before.height }, after: { width: after.width, height: after.height }, changed_pixels: null, changed_percent: null };
    let changedPixels = 0;
    let absoluteDifference = 0;
    for (let index = 0; index < before.rgba.length; index += 4) {
      const difference = Math.abs(before.rgba[index] - after.rgba[index]) + Math.abs(before.rgba[index + 1] - after.rgba[index + 1]) + Math.abs(before.rgba[index + 2] - after.rgba[index + 2]) + Math.abs(before.rgba[index + 3] - after.rgba[index + 3]);
      absoluteDifference += difference;
      if (difference > 8) changedPixels += 1;
    }
    const pixels = before.width * before.height;
    return { status: "compared", width: before.width, height: before.height, pixels, changed_pixels: changedPixels, changed_percent: Number((changedPixels / pixels * 100).toFixed(4)), mean_channel_difference: Number((absoluteDifference / pixels / 4).toFixed(4)), before_sha256: sha256(await readFile(beforePath)), after_sha256: sha256(await readFile(afterPath)) };
  } catch (error) {
    return { status: "unavailable", reason: error.message || String(error) };
  }
}

function decodePng(buffer) {
  if (!buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error("not a PNG file");
  let offset = 8;
  let width;
  let height;
  let bitDepth;
  let colorType;
  let interlace;
  const idat = [];
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    offset += 12 + length;
  }
  if (!width || !height || bitDepth !== 8 || ![2, 6].includes(colorType) || interlace !== 0) throw new Error(`unsupported PNG format: depth=${bitDepth} color=${colorType} interlace=${interlace}`);
  if (width * height > MAX_SCREENSHOT_PIXELS) throw new Error(`PNG pixel limit exceeded: ${width}x${height}`);
  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(idat));
  const decoded = Buffer.alloc(stride * height);
  let source = 0;
  for (let row = 0; row < height; row += 1) {
    const filter = raw[source++];
    const rowOffset = row * stride;
    const previousOffset = (row - 1) * stride;
    for (let column = 0; column < stride; column += 1) {
      const value = raw[source++];
      const left = column >= channels ? decoded[rowOffset + column - channels] : 0;
      const up = row > 0 ? decoded[previousOffset + column] : 0;
      const upperLeft = row > 0 && column >= channels ? decoded[previousOffset + column - channels] : 0;
      decoded[rowOffset + column] = (value + pngFilterValue(filter, left, up, upperLeft)) & 0xff;
    }
  }
  const rgba = Buffer.alloc(width * height * 4);
  for (let pixel = 0, output = 0; pixel < decoded.length; pixel += channels, output += 4) {
    rgba[output] = decoded[pixel];
    rgba[output + 1] = decoded[pixel + 1];
    rgba[output + 2] = decoded[pixel + 2];
    rgba[output + 3] = channels === 4 ? decoded[pixel + 3] : 255;
  }
  return { width, height, rgba };
}

function analyzeRenderedPixels(image) {
  const background = [image.rgba[0], image.rgba[1], image.rgba[2]];
  let channelMin = 255;
  let channelMax = 0;
  let nonBackgroundPixels = 0;
  for (let index = 0; index < image.rgba.length; index += 4) {
    const red = image.rgba[index];
    const green = image.rgba[index + 1];
    const blue = image.rgba[index + 2];
    channelMin = Math.min(channelMin, red, green, blue);
    channelMax = Math.max(channelMax, red, green, blue);
    if (Math.abs(red - background[0]) + Math.abs(green - background[1]) + Math.abs(blue - background[2]) > 12) nonBackgroundPixels += 1;
  }
  const pixels = image.width * image.height;
  const nonblank = channelMax - channelMin >= 8 && nonBackgroundPixels >= Math.min(100, Math.max(20, Math.floor(pixels * 0.0001)));
  return {
    status: nonblank ? "nonblank" : "blank_or_uniform",
    channel_min: channelMin,
    channel_max: channelMax,
    channel_range: channelMax - channelMin,
    non_background_pixels: nonBackgroundPixels,
    non_background_percent: Number((nonBackgroundPixels / pixels * 100).toFixed(4)),
    background_reference_rgb: background
  };
}

function pngFilterValue(filter, left, up, upperLeft) {
  if (filter === 0) return 0;
  if (filter === 1) return left;
  if (filter === 2) return up;
  if (filter === 3) return Math.floor((left + up) / 2);
  if (filter === 4) return paeth(left, up, upperLeft);
  throw new Error(`unsupported PNG filter ${filter}`);
}

function paeth(left, up, upperLeft) {
  const estimate = left + up - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  return leftDistance <= upDistance && leftDistance <= upperLeftDistance ? left : upDistance <= upperLeftDistance ? up : upperLeft;
}

function indexScenarioEvidence(pack) {
  const result = new Map();
  for (const scenario of pack.scenarios || []) {
    for (const stage of ["before", "after"]) {
      const evidence = scenario[stage];
      if (evidence) result.set(`${scenario.name}:${scenario.viewport?.label || "unknown"}:${stage}`, evidence);
    }
  }
  return result;
}

function humanSummary(result) {
  const lines = [
    `# Browser interaction ${result.run_id || "plan"}`,
    "",
    `- Status: ${result.status || result.operation_result}`,
    `- Browser was run: ${result.browser_was_run === true}`,
    `- Scenarios passed/planned: ${result.counts ? `${result.counts.passed}/${result.counts.planned}` : `0/${result.scenario_count || 0}`}`,
    `- Screenshots: ${result.screenshots?.length || 0}`,
    `- Console: ${result.console_summary?.status || "not run"}`,
    `- Network: ${result.network_summary?.status || "not run"}`,
    `- Accessibility: ${result.accessibility_summary?.status || "not run"}`,
    `- Browser process exited: ${result.browser_termination?.process_exited ?? "not launched"}`,
    `- Safe to claim: ${result.safe_to_claim === true}`
  ];
  if (result.fatal_error) lines.push("", "## Fatal error", `- ${result.fatal_error.code}: ${result.fatal_error.reason}`);
  if (result.must_not_claim?.length) lines.push("", "## Must not claim", ...result.must_not_claim.map((item) => `- ${item}`));
  return lines.join("\n");
}

async function atomicWrite(file, content) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${randomUUID().slice(0, 8)}.tmp`;
  await writeFile(temporary, content, "utf8");
  await rename(temporary, file);
}

async function runProcess(command, args, timeoutMs) {
  return await new Promise((resolve) => {
    const child = spawn(command, args, { windowsHide: true, stdio: "ignore" });
    const timer = setTimeout(() => { child.kill(); resolve({ exit_code: null, timed_out: true }); }, timeoutMs);
    child.on("error", () => { clearTimeout(timer); resolve({ exit_code: null, timed_out: false }); });
    child.on("exit", (code) => { clearTimeout(timer); resolve({ exit_code: code, timed_out: false }); });
  });
}

async function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return true;
  await Promise.race([new Promise((resolve) => child.once("exit", resolve)), delay(timeoutMs)]);
  return child.exitCode !== null || child.signalCode !== null;
}

function containsSensitiveQuery(url) {
  return [...url.searchParams.keys()].some((key) => /token|secret|password|credential|api[_-]?key|auth|session|cookie/i.test(key)) || SECRET_VALUE_PATTERN.test(url.toString());
}

function redactUrl(value) {
  try {
    const url = new URL(value);
    if (url.username) url.username = "[REDACTED]";
    if (url.password) url.password = "[REDACTED]";
    for (const key of [...url.searchParams.keys()]) if (/token|secret|password|credential|api[_-]?key|auth|session|cookie/i.test(key)) url.searchParams.set(key, "[REDACTED]");
    return url.toString();
  } catch { return redact(value); }
}

function redactObject(value) {
  return JSON.parse(redact(JSON.stringify(value ?? null)));
}

function redact(value) {
  return String(value || "")
    .replace(/(?:gh[pousr]_|github_pat_|sk-|xox[baprs]-|cfut_)[A-Za-z0-9_-]{8,}/gi, "[REDACTED]")
    .replace(/((?:token|secret|password|credential|api[_-]?key|authorization|cookie|session)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]");
}

function isInside(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function normalizePath(value) {
  return String(value || "").replace(/\\/g, "/");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function clamp(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const BROWSER_INTERACTION_MARKERS = Object.freeze({
  actions: sha256("navigate|click|type|select|wait|assert"),
  evidence: sha256("screenshot|console|network|DOM|accessibility|viewport|state|before-after"),
  safety: sha256("localhost|approved origin|no cookie|no login|no CAPTCHA|no stealth|owned process cleanup")
});
