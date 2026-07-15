export function createSourceResearchRuntime({
  existsSync,
  readdir,
  stat,
  readFile,
  path,
  MAX_API_TIMEOUT_MS,
  SKIPPED_DIRS,
  allowedRoots,
  activePermissionProfile,
  actionPolicyPreview,
  enforceActionPolicy,
  decorateToolResult,
  resolveAllowedRoot,
  resolveAllowedFile,
  walkFiles,
  parseSafeResearchUrl,
  redactUrlString,
  safeOptionalUrl,
  significantTerms,
  looksBinary,
  recordSession,
  writeEvidenceLog,
  enforceApproval,
  isSecretLikePath,
  redactSecrets,
  containsRawSecret,
  redactUrl,
  truncate,
  arrayify
}) {
  const SEARCH_PROVIDER_DEFINITIONS = [
    { name: "local_fixture", env: null, supports_current_web: false, supports_news: false, supports_code_search: false, supports_docs_search: true, supports_safe_search: true, requires_api_key: false, requires_approval: false, rate_limit_notes: "deterministic local CI/test fixture", privacy_notes: "no external network" },
    { name: "direct_url", env: null, supports_current_web: false, supports_news: false, supports_code_search: false, supports_docs_search: true, supports_safe_search: true, requires_api_key: false, requires_approval: true, rate_limit_notes: "not search; inspect provided direct URLs only", privacy_notes: "direct source URLs may be logged in redacted evidence" },
    { name: "brave_search_api", env: "BRAVE_SEARCH_API_KEY", supports_current_web: true, supports_news: true, supports_code_search: false, supports_docs_search: true, supports_safe_search: true, requires_api_key: true, requires_approval: true, rate_limit_notes: "provider rate limits apply", privacy_notes: "query sent to Brave if configured and approved" },
    { name: "serpapi", env: "SERPAPI_API_KEY", supports_current_web: true, supports_news: true, supports_code_search: false, supports_docs_search: true, supports_safe_search: true, requires_api_key: true, requires_approval: true, rate_limit_notes: "provider rate limits apply", privacy_notes: "query sent to SerpAPI if configured and approved" },
    { name: "tavily", env: "TAVILY_API_KEY", supports_current_web: true, supports_news: true, supports_code_search: false, supports_docs_search: true, supports_safe_search: true, requires_api_key: true, requires_approval: true, rate_limit_notes: "provider rate limits apply", privacy_notes: "query sent to Tavily if configured and approved" },
    { name: "exa", env: "EXA_API_KEY", supports_current_web: true, supports_news: false, supports_code_search: false, supports_docs_search: true, supports_safe_search: true, requires_api_key: true, requires_approval: true, rate_limit_notes: "provider rate limits apply", privacy_notes: "query sent to Exa if configured and approved" },
    { name: "github_search_api", env: "GITHUB_TOKEN", supports_current_web: true, supports_news: false, supports_code_search: true, supports_docs_search: false, supports_safe_search: true, requires_api_key: true, requires_approval: true, rate_limit_notes: "GitHub API rate limits apply", privacy_notes: "query sent to GitHub if configured and approved" },
    { name: "npm_registry", env: null, supports_current_web: true, supports_news: false, supports_code_search: false, supports_docs_search: false, supports_safe_search: true, requires_api_key: false, requires_approval: true, rate_limit_notes: "npm registry fair-use applies", privacy_notes: "query sent to npm registry if implemented/approved" },
    { name: "docs_site_search", env: "VNEM_DOCS_SEARCH_ENDPOINT", supports_current_web: false, supports_news: false, supports_code_search: false, supports_docs_search: true, supports_safe_search: true, requires_api_key: false, requires_approval: true, rate_limit_notes: "custom endpoint rate limits apply", privacy_notes: "query sent to configured docs endpoint" },
    { name: "custom_provider", env: "VNEM_SEARCH_PROVIDER_ENDPOINT", supports_current_web: true, supports_news: true, supports_code_search: false, supports_docs_search: true, supports_safe_search: true, requires_api_key: false, requires_approval: true, rate_limit_notes: "custom provider limits apply", privacy_notes: "query sent to configured provider endpoint" }
  ];

  function safeSearchProviderManifest() {
    const providers = SEARCH_PROVIDER_DEFINITIONS.map((provider) => ({
      ...provider,
      configured: provider.env ? Boolean(process.env[provider.env]) : provider.name === "local_fixture" || provider.name === "direct_url" || provider.name === "npm_registry",
      configured_by: provider.env ? (process.env[provider.env] ? `${provider.env}_present` : `${provider.env}_missing`) : "no_key_required",
      env_var_name: provider.env,
      api_key_value_exposed: false
    }));
    return {
      providers,
      configured_providers: providers.filter((p) => p.configured).map((p) => p.name),
      unconfigured_providers: providers.filter((p) => !p.configured).map((p) => p.name),
      supports_current_web: providers.some((p) => p.configured && p.supports_current_web),
      supports_news: providers.some((p) => p.configured && p.supports_news),
      supports_code_search: providers.some((p) => p.configured && p.supports_code_search),
      supports_docs_search: providers.some((p) => p.configured && p.supports_docs_search),
      supports_safe_search: providers.some((p) => p.configured && p.supports_safe_search),
      requires_api_key: providers.filter((p) => p.requires_api_key).map((p) => p.name),
      requires_approval: providers.filter((p) => p.requires_approval).map((p) => p.name),
      rate_limit_notes: Object.fromEntries(providers.map((p) => [p.name, p.rate_limit_notes])),
      privacy_notes: Object.fromEntries(providers.map((p) => [p.name, p.privacy_notes])),
      unsupported_behaviors: ["search-engine result page scraping by default", "automatic CAPTCHA bypass", "login/cookie/session use", "private/account page scraping without approval", "fake current-search claims when provider is unavailable", "broad crawling"],
      evidence_log_id: null
    };
  }

  async function safeSearchQueryBuilder(args) {
    const task = String(args.task || "");
    const hay = `${task} ${args.domain_hint || ""} ${args.known_context || ""}`.toLowerCase();
    const sourceTypes = [...new Set(arrayify(args.source_types_needed).map(String))];
    const queries = [];
    const intents = [];
    const add = (query, intent) => { if (query && !queries.includes(query)) { queries.push(query); intents.push({ query, intent }); } };
    const base = task.replace(/https?:\/\/\S+/g, "").replace(/["']/g, "").trim();
    if (/security|malware|phishing|download|scam|cve|advisory/.test(hay)) {
      add(`${base} official security advisory`, "primary security/advisory source");
      add(`${base} CVE advisory vulnerability`, "vulnerability/current security source");
      add(`${base} phishing scam malware download risk`, "risk corroboration");
    }
    if (/docs|library|api|software|javascript|mcp|package|npm/.test(hay)) {
      add(`${base} official docs`, "official documentation");
      add(`${base} site:github.com`, "repository/source code");
      add(`${base} changelog release notes`, "version/freshness evidence");
    }
    if (/github|repo|code|issue|pull request/.test(hay)) add(`${base} site:github.com issues OR discussions`, "GitHub issue/repo research");
    if (/game|gaming|elden ring|meta|build|pvp|pve/.test(hay)) {
      add(`${base} official patch notes`, "official game version source");
      add(`${base} current meta community discussion`, "community meta source");
    }
    if (/mod|modding|nexus|toolchain/.test(hay)) {
      add(`${base} official modding docs toolchain`, "modding documentation");
      add(`${base} compatibility version changelog`, "mod/version compatibility");
    }
    if (/compare|best|alternative|product|tool/.test(hay)) {
      add(`${base} official pricing docs comparison`, "primary product details");
      add(`${base} independent review limitations`, "secondary comparison/counter-source");
    }
    if (args.freshness_required || /latest|current|today|2026|recent|this week|now/.test(hay)) {
      add(`${base} latest current ${new Date().getUTCFullYear()}`, "fresh/current source discovery");
      add(`${base} after:${new Date().getUTCFullYear() - 1}-01-01`, "freshness-filtered search");
    }
    add(`${base} official source`, "primary/official source fallback");
    add(`${base} source quality`, "quality/corroboration fallback");
    const result = {
      task: redactSecrets(task),
      queries: queries.slice(0, 12),
      query_intents: intents.slice(0, 12),
      must_have_source_types: [...new Set([...(sourceTypes.length ? sourceTypes : inferNeededSourceTypes(hay)), args.freshness_required ? "fresh_current_source" : null].filter(Boolean))],
      avoid_source_types: ["SEO farms", "AI-generated listicles", "fake download pages", "credential-harvesting pages", "private/account pages without approval", "search result pages scraped as sources"],
      freshness_requirement: { required: Boolean(args.freshness_required || /latest|current|today|recent|this week|now/.test(hay)), reason: args.freshness_required ? "freshness_required input" : "inferred from task wording" },
      official_source_targets: inferOfficialSourceTargets(hay),
      secondary_source_targets: inferSecondarySourceTargets(hay),
      risk_notes: ["Search query planning does not execute a search.", "Use source quality, CAPTCHA detection, URL reputation, and claim/source matrix before final claims."],
      must_not_claim: ["A search happened.", "Search results were fetched.", "Sources were read or verified.", "Currentness was established."]
    };
    return result;
  }

  async function safeWebSearch(args) {
    const provider = String(args.provider || "local_fixture");
    const query = redactSecrets(String(args.query || ""));
    const max = Math.min(args.max_results || 10, 20);
    const manifest = safeSearchProviderManifest();
    const providerInfo = manifest.providers.find((p) => p.name === provider);
    const dryRun = args.dry_run !== false;
    const base = { provider, query, executed: false, dry_run: dryRun, results: [], result_count: 0, provider_status: "unknown", blocked_or_unavailable_reason: "", freshness_notes: [], safe_to_claim: [], must_not_claim: ["A web search happened.", "Search results were fetched.", "Search result pages were scraped.", "CAPTCHA was bypassed.", "Sources were read beyond search result snippets."], evidence_log_id: null };
    if (!providerInfo) return { ...base, provider_status: "provider_unknown", blocked_or_unavailable_reason: "Provider is not in VNEM search provider manifest." };
    if (dryRun) return { ...base, provider_status: providerInfo.configured ? "dry_run_planned_configured_provider" : "dry_run_planned_provider_unconfigured", blocked_or_unavailable_reason: providerInfo.configured ? "Dry-run only; no provider was contacted." : "Provider is not configured.", safe_to_claim: ["Search was planned only; no provider was contacted."], action_policy_preview: actionPolicyPreview({ action_type: "external_fetch", proposed_action: query }) };
    if (providerInfo.requires_approval) enforceActionPolicy("external_fetch", args);
    if (!providerInfo.configured) {
      const result = { ...base, dry_run: false, provider_status: "provider_unconfigured", blocked_or_unavailable_reason: `${provider} is not configured; no fake results returned.`, must_not_claim: ["Provider search executed.", "Search results were fetched.", "Current web research is complete."] };
      const log = await writeEvidenceLog("web_search", result);
      return decorateToolResult("vnem_tools_api_request", { ...result, evidence_log_id: log.evidence_log_id }, { capability_group: "api_request", network: true, requires_approval: true });
    }
    let results = [];
    let providerStatus = "executed_local_fixture";
    let freshness = [];
    if (provider === "local_fixture") {
      results = localFixtureSearch(query).slice(0, max);
      freshness = ["Deterministic local fixture results; not current live web."];
    } else if (provider === "direct_url") {
      results = extractUrlsFromText(query).map((url, i) => ({ title: `Direct URL ${i + 1}`, url: redactUrlString(url), snippet: "Direct URL supplied in query/task; not a search result.", source_type: "direct_url", date: null, provider: "direct_url" })).slice(0, max);
      providerStatus = results.length ? "executed_direct_url_extraction" : "no_direct_url_found";
    } else {
      providerStatus = "provider_configured_but_not_implemented";
      const result = { ...base, dry_run: false, provider_status: providerStatus, blocked_or_unavailable_reason: `${provider} architecture exists but live adapter is not implemented/tested in this build; no fake results returned.`, must_not_claim: ["Provider search executed.", "Search results were fetched.", "Current web research is complete."] };
      const log = await writeEvidenceLog("web_search", result);
      return { ...result, evidence_log_id: log.evidence_log_id };
    }
    const result = { ...base, dry_run: false, executed: results.length > 0, results: results.map(normalizeSearchResult), result_count: results.length, provider_status: providerStatus, freshness_notes: freshness, safe_to_claim: [`${provider} returned ${results.length} result(s).`, provider === "local_fixture" ? "Search results came from deterministic local fixture data, not live web." : "Provider-backed result metadata was returned."], must_not_claim: [provider === "local_fixture" ? "Live/current web search happened." : "Search result pages were scraped.", "Sources were fully read beyond result snippets.", "CAPTCHA was bypassed."] };
    const log = await writeEvidenceLog("web_search", result);
    const withLog = { ...result, evidence_log_id: log.evidence_log_id };
    recordSession(args.session_id, "web_searches", withLog);
    return withLog;
  }

  async function safeSearchResultRanker(args) {
    const preferred = arrayify(args.preferred_source_types).map((x) => String(x).toLowerCase());
    const normalized = arrayify(args.results).map(normalizeSearchResult);
    const scored = normalized.map((result) => ({ ...result, score: scoreSearchResult(result, String(args.task || ""), preferred, args.freshness_required), risk_flags: urlRiskFlags(result.url, `${result.title} ${result.snippet}`), trust_flags: urlTrustFlags(result.url, result.source_type) }));
    scored.sort((a, b) => b.score - a.score);
    const duplicates = duplicateClusters(scored);
    const risky = scored.filter((r) => r.risk_flags.length || r.score < 30);
    const best = scored.filter((r) => r.score >= 65 && !r.risk_flags.some((f) => /download|credential|malware|phishing/i.test(f))).slice(0, 5);
    const weak = scored.filter((r) => r.score < 50 && !risky.includes(r)).slice(0, 5);
    const missing = preferred.filter((type) => !scored.some((r) => String(r.source_type).toLowerCase().includes(type)));
    const result = { task: redactSecrets(args.task || ""), ranked_results: scored, best_sources: best, weak_sources: weak, risky_sources: risky, duplicate_clusters: duplicates, missing_source_types: missing, recommended_next_queries: missing.map((type) => `${args.task} ${type} official`).slice(0, 5), must_not_claim: ["Ranking proves factual correctness.", "Risky sources are safe to visit/download.", "Fresh/current evidence exists unless dates/providers show it."], evidence_log_id: null };
    const log = await writeEvidenceLog("search_result_ranker", result);
    result.evidence_log_id = log.evidence_log_id;
    recordSession(args.session_id, "search_result_rankings", result);
    return result;
  }

  async function safeRedirectChainCheck(args) {
    const url = parseSafeResearchUrl(args.url);
    const dryRun = args.dry_run !== false;
    const planned = { url: redactUrl(url), redirect_chain: [], final_url: redactUrl(url), same_domain: true, cross_domain_redirects: [], suspicious_redirects: [], blocked_reason: "", dry_run: dryRun, executed: false, safe_to_claim: [], must_not_claim: ["A redirect chain was checked.", "The final page was visited/read.", "Cookies/session/login were used."], evidence_log_id: null };
    if (dryRun) return planned;
    enforceApproval(args);
    const chain = [];
    let current = url;
    let blocked = "";
    for (let i = 0; i < Math.min(args.max_redirects || 5, 10); i++) {
      let response;
      try { response = await fetch(current, { method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(Math.min(args.timeout_ms || 8000, MAX_API_TIMEOUT_MS)) }); }
      catch (error) { blocked = `request_failed: ${error.message}`; break; }
      const location = response.headers.get("location");
      const item = { url: redactUrl(current), status: response.status, method: "HEAD", location: location ? redactUrlString(new URL(location, current).toString()) : null };
      chain.push(item);
      if (![301, 302, 303, 307, 308].includes(response.status) || !location) break;
      const next = new URL(location, current);
      if (next.username || next.password || containsRawSecret(next.toString())) { blocked = "credentialed_or_secret_redirect_blocked"; break; }
      if (!["http:", "https:"].includes(next.protocol)) { blocked = "unsafe_redirect_scheme_blocked"; break; }
      current = next;
      if (current.protocol === "http:" && !isLocalHostname(current.hostname)) { chain.push({ url: redactUrl(current), status: null, method: "not_fetched", location: null }); break; }
    }
    const hosts = chain.map((c) => { try { return new URL(c.url).hostname.replace(/^www\./, ""); } catch { return ""; } }).filter(Boolean);
    const startHost = hosts[0] || url.hostname;
    const cross = chain.filter((c) => { try { return new URL(c.url).hostname.replace(/^www\./, "") !== startHost; } catch { return false; } });
    const suspicious = chain.map((c) => ({ ...c, reason: redirectSuspicionReason(c, startHost) })).filter((c) => c.reason);
    const result = { ...planned, redirect_chain: chain, final_url: chain.at(-1)?.url || redactUrl(current), same_domain: cross.length === 0, cross_domain_redirects: cross, suspicious_redirects: suspicious, blocked_reason: blocked, dry_run: false, executed: true, safe_to_claim: ["Redirect metadata was checked with Tools MCP safeguards."], must_not_claim: ["Final page content was read.", "The URL is safe or trustworthy.", "Cookies/session/login were used."] };
    const log = await writeEvidenceLog("redirect_chain_check", result);
    const withLog = { ...result, evidence_log_id: log.evidence_log_id };
    recordSession(args.session_id, "redirect_chain_checks", withLog);
    return withLog;
  }

  async function safeUrlReputationCheck(args) {
    const flags = urlRiskFlags(args.url, args.url);
    const trust = urlTrustFlags(args.url, "");
    for (const item of arrayify(args.redirect_chain)) {
      const reason = redirectSuspicionReason(item, safeOptionalUrl(args.url).hostname.replace(/^www\./, ""));
      if (reason) flags.push(`redirect_${reason}`);
    }
    for (const domain of arrayify(args.known_official_domains)) if (String(args.url).includes(String(domain))) trust.push("matches_known_official_domain");
    const uniqueFlags = [...new Set(flags)];
    const risk = uniqueFlags.some((f) => /credential|executable|phishing|malware|scam|shortener|redirect/.test(f)) ? "high" : uniqueFlags.length >= 2 ? "medium" : "low";
    const result = { risk_level: risk, risk_flags: uniqueFlags, trust_flags: [...new Set(trust)], recommended_action: risk === "high" ? "Do not enter credentials, do not download, inspect source via safe tools and ask user before visiting." : risk === "medium" ? "Proceed only with source-quality checks and user confirmation." : "Low heuristic risk; still verify source quality before trusting.", safe_to_visit: risk !== "high", safe_to_download: false, requires_user_confirmation: risk !== "low", must_not_claim: ["This is an antivirus verdict.", "The URL is definitely safe.", "Downloads from this URL are safe to run."], evidence_log_id: null };
    const log = await writeEvidenceLog("url_reputation_check", result);
    result.evidence_log_id = log.evidence_log_id;
    recordSession(args.session_id, "url_reputation_checks", result);
    return result;
  }

  async function safeCaptchaDetector(args) {
    const text = `${args.url || ""} ${args.html || ""} ${args.text || ""} ${JSON.stringify(args.screenshot_metadata || {})} ${JSON.stringify(args.page_inspection || {})}`;
    const signals = [];
    if (/captcha|g-recaptcha|hcaptcha|cf-turnstile|data-sitekey|challenge/i.test(text)) signals.push("captcha_challenge_marker");
    if (/verify you are human|are you a robot|unusual traffic|bot detection|automated access/i.test(text)) signals.push("human_verification_text");
    if (/cloudflare ray id|access denied|akamai|perimeterx|datadome|incapsula|blocked/i.test(text)) signals.push("anti_bot_or_access_block_vendor_text");
    const detected = signals.length > 0;
    const result = { captcha_or_block_detected: detected, block_type: detected ? (signals.some((s) => /captcha/.test(s)) ? "captcha_or_anti_bot_challenge" : "access_block_or_anti_bot") : "none_detected", signals, recommended_safe_next_steps: detected ? ["Ask the user to solve the CAPTCHA manually only if they own or are allowed to access the page.", "Ask the user to paste page text after access instead of bypassing anti-bot systems.", "Use official API/docs/source or another official mirror/source when available.", "Stop and report that access is blocked if no allowed path exists."] : ["No CAPTCHA/block signals detected in provided content; continue with normal source quality checks."], user_assisted_handoff_required: detected, alternative_research_paths: ["official docs/API", "provider search through configured approved provider", "direct source URL supplied by user", "cached local docs or repository source"], must_not_claim: ["No automatic CAPTCHA bypass was attempted or provided.", "CAPTCHA/access block was solved automatically.", "Blocked/private content was accessed."], evidence_log_id: null };
    const log = await writeEvidenceLog("captcha_detector", result);
    result.evidence_log_id = log.evidence_log_id;
    recordSession(args.session_id, "captcha_detections", result);
    return result;
  }

  async function safeDownloadSafetyCheck(args) {
    const url = parseSafeResearchUrl(args.download_url);
    const flags = urlRiskFlags(url.toString(), `${args.download_url} ${args.source_page_url || ""}`);
    const ext = fileTypeGuess(url.pathname);
    if (/executable|archive|script/.test(ext)) flags.push(`${ext}_download_type`);
    if (Number(args.source_quality_score ?? 60) < 40) flags.push("low_source_quality_score");
    const dryRun = args.dry_run !== false;
    let executedHead = false;
    let contentType = null;
    let length = null;
    if (!dryRun) {
      enforceActionPolicy("download_check", args);
      try {
        const response = await fetch(url, { method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(8000) });
        executedHead = true;
        contentType = response.headers.get("content-type");
        length = response.headers.get("content-length");
      } catch (error) { flags.push(`head_request_failed:${error.message}`); }
    }
    const unique = [...new Set(flags)];
    const risk = unique.some((f) => /executable|script|fake|phishing|credential|low_source|suspicious|shortener/.test(f)) ? "high" : unique.some((f) => /archive|download/.test(f)) ? "medium" : "low";
    const result = { download_url: redactUrl(url), file_type_guess: ext, source_domain: safeOptionalUrl(args.source_page_url || url.toString()).hostname, risk_level: risk, risk_flags: unique, recommended_action: risk === "high" ? "Do not download or run. Use official source, checksums/signatures, and manual review." : "Do not auto-download; verify official source, checksum/signature, and user approval first.", requires_manual_review: true, executed_head_request: executedHead, content_type: contentType, content_length: length, must_not_claim: ["The file was downloaded.", "The file is safe to run.", "Antivirus scanning was performed.", "Installer/download authenticity was proven."], evidence_log_id: null };
    const log = await writeEvidenceLog("download_safety_check", result);
    result.evidence_log_id = log.evidence_log_id;
    recordSession(args.session_id, "download_safety_checks", result);
    return result;
  }

  async function safeSourceMap(args) {
    const sourceType = String(args.source_type || "local_repo");
    const source = String(args.source || ".");
    const isExternal = /^https?:\/\//i.test(source);
    if (isExternal) {
      const result = {
        source: redactSecrets(source),
        source_type: sourceType,
        top_level_structure: [],
        important_files_or_pages: [],
        docs_locations: [],
        code_locations: [],
        config_locations: [],
        test_or_example_locations: [],
        changelog_or_release_locations: [],
        issue_or_pr_locations_if_available_or_blocked: ["external issue/PR/release extraction requires explicit selected URLs and approval; no broad crawl performed"],
        likely_irrelevant_areas: [],
        missing_or_blocked_areas: ["external_source_mapping_requires_selected_fetch_or_link_map", "broad_crawl_blocked"],
        allowed_roots_check: { inside_allowed_roots: false, external_source: true },
        permission_profile: activePermissionProfile.profile_name,
        trust_boundary: "0_public_information",
        evidence_log_id: null,
        safe_to_claim: ["External source map was planned/blocked only; no hidden external fetch or crawl occurred."],
        must_not_claim: sourceIngestionMustNotClaim()
      };
      const log = await writeEvidenceLog("source_map", result);
      result.evidence_log_id = log.evidence_log_id;
      recordSession(args.session_id, "source_maps", result);
      return result;
    }
    const root = await resolveAllowedRoot(source);
    const files = [];
    await walkFiles(root.absolutePath, root.absolutePath, files, { maxResults: args.max_files || 150 });
    const topEntries = await readdir(root.absolutePath, { withFileTypes: true });
    const top = topEntries.slice(0, 120).map((entry) => ({ path: entry.name, type: entry.isDirectory() ? "directory" : "file", skipped: SKIPPED_DIRS.has(entry.name) || isSecretLikePath(path.join(root.absolutePath, entry.name)) }));
    const rels = files.map((file) => file.path);
    const pick = (re, max = 40) => rels.filter((rel) => re.test(rel)).slice(0, max);
    const blocked = top.filter((entry) => entry.skipped).map((entry) => `${entry.path}: skipped by source-map safety policy`);
    for (const name of [".env", ".env.local", "sessions.db", "cookies.txt", "secrets", "tokens", "credentials", ".ssh", "browser-profile", "password-manager"]) {
      if (existsSync(path.join(root.absolutePath, name))) blocked.push(`${name}: secret/session/private path blocked`);
    }
    const result = {
      source: root.absolutePath,
      source_type: sourceType,
      top_level_structure: top,
      important_files_or_pages: pick(/(^|\/)(README|AGENTS|package|pyproject|Cargo|go\.mod|requirements|CHANGELOG|SECURITY|LICENSE)(\.|$)/i, 60),
      docs_locations: pick(/(^|\/)(docs?|documentation|guides?)(\/|$)|README|quickstart|install/i),
      code_locations: pick(/(^|\/)(src|lib|app|pages|server|client|api|components|routes)(\/|$)|\.(js|mjs|ts|tsx|jsx|py|go|rs|java|cs)$/i),
      config_locations: pick(/(^|\/)(package\.json|tsconfig|vite|next|astro|eslint|prettier|docker|compose|config|\.github\/workflows)/i),
      test_or_example_locations: pick(/(^|\/)(tests?|__tests__|spec|examples?|fixtures?)(\/|$)|\.(test|spec)\./i),
      changelog_or_release_locations: pick(/CHANGELOG|RELEASE|HISTORY|MIGRATION|versions?/i),
      issue_or_pr_locations_if_available_or_blocked: ["Local source map does not read remote GitHub issues/PRs; use explicit public issue/release URLs if needed."],
      likely_irrelevant_areas: ["node_modules", ".git", "build outputs", "coverage", "cache directories"].filter((name) => top.some((entry) => entry.path === name || entry.path.includes(name))),
      missing_or_blocked_areas: [...new Set(blocked)],
      allowed_roots_check: { inside_allowed_roots: true, matched_root: root.root, allowed_roots: allowedRoots },
      permission_profile: activePermissionProfile.profile_name,
      trust_boundary: "2_local_project_information",
      evidence_log_id: null,
      safe_to_claim: [`Mapped ${files.length} non-secret file(s) under the allowed source root.`, "Only structure/path metadata was inspected; secret-like paths and skipped directories were not read."],
      must_not_claim: sourceIngestionMustNotClaim()
    };
    const log = await writeEvidenceLog("source_map", result);
    result.evidence_log_id = log.evidence_log_id;
    recordSession(args.session_id, "source_maps", result);
    return result;
  }

  async function safeSourceExtract(args) {
    const root = await resolveAllowedRoot(args.source_root || ".");
    const targets = arrayify(args.targets).map(String).filter(Boolean).slice(0, Math.min(args.max_targets || 12, 30));
    const read = [];
    const skipped = [];
    const evidenceItems = [];
    if (!targets.length) skipped.push({ path: "<none>", reason: "explicit targets are required; broad extraction/crawling is blocked" });
    for (const targetName of targets) {
      try {
        const target = await resolveAllowedFile(path.isAbsolute(targetName) ? targetName : path.join(root.absolutePath, targetName), { mustExist: true, blockSecrets: true });
        const info = await stat(target.absolutePath);
        if (!info.isFile()) { skipped.push({ path: target.relativePath, reason: "not_a_regular_file" }); continue; }
        const bytes = await readFile(target.absolutePath);
        if (bytes.includes(0) || looksBinary(bytes)) { skipped.push({ path: target.relativePath, reason: "binary_file_blocked" }); continue; }
        const capped = bytes.subarray(0, Math.min(args.max_bytes_per_target || 4000, 16000)).toString("utf8");
        const text = redactSecrets(capped);
        read.push({ path: target.relativePath, bytes_read: Math.min(bytes.length, Buffer.byteLength(capped)), truncated: bytes.length > Buffer.byteLength(capped) });
        evidenceItems.push({ path: target.relativePath, source_type: inferSourceTypeFromPath(target.relativePath), excerpt: truncate(text, 1200), relevance: inferExtractionRelevance(target.relativePath, args.extraction_goal), officialness: inferOfficialness({ path: target.relativePath, text }) });
      } catch (error) {
        skipped.push({ path: targetName, reason: error?.code === "secret_path_blocked" ? "secret_path_blocked" : error?.message || "blocked_or_missing" });
      }
    }
    const combined = evidenceItems.map((item) => `${item.path}\n${item.excerpt}`).join("\n");
    const result = {
      extraction_goal: args.extraction_goal,
      targets_read: read,
      targets_skipped: skipped,
      evidence_items: evidenceItems,
      claim_candidates: extractClaimCandidates(combined),
      dates_or_versions_found: extractDatesAndVersions(combined),
      officialness: summarizeOfficialness(evidenceItems),
      source_quality_notes: evidenceItems.map((item) => ({ path: item.path, source_type: item.source_type, note: item.officialness === "likely_official_project_source" ? "project-local/official repo evidence" : "bounded local source evidence" })),
      freshness_notes: freshnessNotesForText(combined),
      contradictions_found: detectSimpleContradictions(evidenceItems.map((item) => ({ title: item.path, text_excerpt: item.excerpt, source_type: item.source_type, official: item.officialness === "likely_official_project_source" }))),
      gaps: [read.length ? null : "No explicit targets were read.", "Extraction was bounded to selected targets; unselected repo/site areas remain uninspected."].filter(Boolean),
      permission_profile: activePermissionProfile.profile_name,
      trust_boundary_level: "2_local_project_information",
      allowed_roots_check: { inside_allowed_roots: true, matched_root: root.root },
      evidence_log_id: null,
      safe_to_claim: ["Only explicit selected targets were read under allowed roots.", "Secret-like paths were blocked and text excerpts were redacted."],
      must_not_claim: sourceIngestionMustNotClaim()
    };
    const log = await writeEvidenceLog("source_extract", result);
    result.evidence_log_id = log.evidence_log_id;
    recordSession(args.session_id, "source_extracts", result);
    return result;
  }

  async function safeSourceGraph(args) {
    const rawSources = arrayify(args.sources).map(normalizeGraphSource);
    const claims = arrayify(args.claims).map(String).filter(Boolean);
    const sources = rawSources.map((source) => ({
      ...source,
      freshness: classifyFreshness(source),
      trust_level: classifySourceTrust(source),
      claims_supported: claims.filter((claim) => sourceSupportsClaim(source, claim)),
      claims_contradicted: claims.filter((claim) => sourceContradictsClaim(source, claim)),
      outdated_risk: classifyFreshness(source).includes("outdated") || classifyFreshness(source).includes("old"),
      links_to_stronger_evidence: source.official ? [] : rawSources.filter((other) => other.official).map((other) => other.title).slice(0, 3),
      confidence: source.official ? "medium_high" : "low_to_medium",
      notes: source.official ? "Official or primary-like source." : "Community/secondary source; corroborate before confident claims."
    }));
    const contradictions = detectGraphContradictions(sources, claims);
    const verification = claims.map((claim) => {
      const supporting = sources.filter((source) => source.claims_supported.includes(claim));
      const contradicting = sources.filter((source) => source.claims_contradicted.includes(claim));
      const status = contradicting.length ? "contradicted" : supporting.some((s) => s.official) ? "well_supported" : supporting.length ? "likely" : "unknown";
      return { claim, status, supporting_sources: supporting.map((s) => s.title), contradicting_sources: contradicting.map((s) => s.title), confidence: status === "well_supported" ? "medium_high" : status === "contradicted" ? "low_until_resolved" : "low" };
    });
    const result = {
      task: args.task || "",
      sources,
      source_type: [...new Set(sources.map((s) => s.source_type))],
      contradictions_found: contradictions,
      claim_verification: verification,
      freshness_summary: { outdated_risk_count: sources.filter((s) => s.outdated_risk).length, freshness_required_unknown_unless_current_sources: /current|latest|today|recent|now/i.test(args.task || "") },
      permission_profile: activePermissionProfile.profile_name,
      trust_boundary_level: sources.some((s) => /^https?:/i.test(s.url || "")) ? "0_public_information" : "2_local_project_information",
      allowed_roots_check: { provided_sources_only: true, local_file_reads: false },
      confidence: contradictions.length ? "medium_with_conflicts" : sources.length > 1 ? "medium" : "low_single_source",
      notes: [sources.length < 2 ? "Single-source graph cannot prove contradiction-free status." : "Multiple provided sources compared.", contradictions.length ? "Resolve contradictions before confident final claims." : "No contradiction detected in provided sources only."],
      evidence_log_id: null,
      safe_to_claim: ["Source graph compared only provided sources / bounded source evidence.", "Contradiction and freshness notes are limited to supplied source text/metadata."],
      must_not_claim: ["A broad search or crawl happened.", "The topic is contradiction-free when fewer than two relevant sources were checked.", "Outdated/community sources override stronger official evidence.", "Missing sources were checked."]
    };
    const log = await writeEvidenceLog("source_graph", result);
    result.evidence_log_id = log.evidence_log_id;
    recordSession(args.session_id, "source_graphs", result);
    return result;
  }

  function sourceIngestionMustNotClaim() {
    return ["A broad crawl or scrape was performed.", "Secret/cookie/session/browser-profile files were read.", "External pages were fetched without explicit approved fetch evidence.", "The full repo/site is understood when only a bounded map/extract was performed.", "GitHub issues/PRs/releases were extracted unless explicit source evidence says so."];
  }

  function inferSourceTypeFromPath(rel) {
    if (/README/i.test(rel)) return "readme";
    if (/docs?|guide|quickstart|install/i.test(rel)) return "docs";
    if (/CHANGELOG|RELEASE|HISTORY|MIGRATION/i.test(rel)) return "changelog_or_release_notes";
    if (/(^|\/)(tests?|__tests__|spec|examples?)(\/|$)|\.(test|spec)\./i.test(rel)) return "test_or_example";
    if (/package\.json|pyproject|Cargo|go\.mod|requirements|config|tsconfig|vite|next|astro/i.test(rel)) return "config_or_manifest";
    if (/\.(js|mjs|ts|tsx|jsx|py|go|rs|java|cs)$/i.test(rel)) return "code";
    return "local_file";
  }

  function inferExtractionRelevance(rel, goal) {
    const text = `${rel} ${goal}`.toLowerCase();
    if (/readme|docs|guide|install|changelog|release|package|src|test/.test(text)) return "high";
    return "medium";
  }

  function inferOfficialness(item = {}) {
    const text = `${item.path || ""} ${item.url || ""} ${item.source_type || ""} ${item.title || ""}`.toLowerCase();
    if (item.official === true || /official|docs|readme|changelog|release|repo|package/.test(text)) return "likely_official_project_source";
    if (/blog|forum|reddit|community/.test(text)) return "community_or_secondary";
    return "unknown";
  }

  function summarizeOfficialness(items) {
    return { likely_official_count: items.filter((item) => item.officialness === "likely_official_project_source").length, unknown_count: items.filter((item) => item.officialness === "unknown").length };
  }

  function extractClaimCandidates(text) {
    const sentences = String(text || "").split(/(?<=[.!?])\s+|\n+/).map((line) => line.trim()).filter(Boolean);
    return sentences.filter((line) => /install|setup|version|current|requires?|supports?|deprecated|API|breaking|release/i.test(line)).slice(0, 20).map((claim) => ({ claim: truncate(redactSecrets(claim), 240), status: "candidate_needs_source_graph_or_audit" }));
  }

  function extractDatesAndVersions(text) {
    const out = [];
    for (const match of String(text || "").matchAll(/\b(?:v?\d+\.\d+(?:\.\d+)?|20\d{2}-\d{2}-\d{2}|20\d{2})\b/g)) out.push({ value: match[0], context: "date_or_version_candidate" });
    return [...new Map(out.map((item) => [item.value, item])).values()].slice(0, 30);
  }

  function freshnessNotesForText(text) {
    const notes = [];
    if (/20\d{2}-\d{2}-\d{2}|20\d{2}/.test(text)) notes.push("Date-like evidence found; compare with current task requirements before claiming freshness.");
    else notes.push("No clear date found; freshness unknown.");
    if (/deprecated|removed|breaking|migration|release/i.test(text)) notes.push("Version/change wording found; release/changelog evidence may be needed.");
    return notes;
  }

  function normalizeGraphSource(source = {}, index = 0) {
    return {
      id: source.id || `S${index + 1}`,
      title: redactSecrets(source.title || source.path || source.url || `source_${index + 1}`),
      url: source.url ? redactSecrets(source.url) : null,
      source_type: String(source.source_type || inferSourceTypeFromPath(source.path || "") || "unknown"),
      owner_or_author: redactSecrets(source.owner_or_author || source.author || source.owner || "unknown"),
      official: Boolean(source.official) || inferOfficialness(source) === "likely_official_project_source",
      published_at: source.published_at || source.date || source.retrieved_at || null,
      text_excerpt: redactSecrets(source.text_excerpt || source.excerpt || source.summary || source.text || "")
    };
  }

  function classifyFreshness(source) {
    const d = String(source.published_at || "");
    const year = Number((d.match(/20\d{2}/) || [])[0] || 0);
    if (!year) return "unknown";
    if (year <= new Date().getFullYear() - 3) return "outdated_risk";
    if (year < new Date().getFullYear()) return "probably_current_or_version_specific";
    return "current_or_recent";
  }

  function classifySourceTrust(source) {
    if (source.official) return "high";
    if (/release|changelog|repo|package/.test(source.source_type)) return "medium_high";
    if (/community|blog|forum|reddit/.test(source.source_type)) return "medium_low";
    return "medium";
  }

  function sourceSupportsClaim(source, claim) {
    const terms = significantTerms(claim);
    const hay = source.text_excerpt.toLowerCase();
    return terms.length > 0 && terms.every((term) => hay.includes(term)) && !sourceContradictsClaim(source, claim);
  }

  function sourceContradictsClaim(source, claim) {
    const hay = source.text_excerpt.toLowerCase();
    const c = String(claim || "").toLowerCase();
    if (/npm install/.test(c) && /npm install.*(removed|deprecated|no longer|not supported)|removed.*npm install|deprecated.*npm install/.test(hay)) return true;
    if (/yarn add/.test(c) && ((/yarn/.test(hay) && /removed|deprecated|no longer|not supported|not/.test(hay)) || (/npm install/.test(hay) && /removed|deprecated|no longer|not/.test(hay)))) return true;
    if (/current|latest|version 2/.test(c) && /version 1 is current|v1 is current/.test(hay)) return true;
    if (/stable|supported|required|deprecated/.test(c) && /not stable|unsupported|not supported|no longer required|not deprecated/.test(hay)) return true;
    return false;
  }

  function detectSimpleContradictions(items) {
    return detectGraphContradictions(items.map(normalizeGraphSource), []);
  }

  function detectGraphContradictions(sources, claims) {
    const contradictions = [];
    const all = sources.map((s) => `${s.title} ${s.text_excerpt}`).join("\n").toLowerCase();
    const installCommands = [...new Set([...all.matchAll(/\b(npm install|npm create|yarn add|pnpm add|pip install|uv add)\b/g)].map((m) => m[1]))];
    if (installCommands.length > 1) contradictions.push({ type: "conflicting_install_steps", details: installCommands, resolution_hint: "Prefer official current docs/release notes, then test in target runtime." });
    const versions = [...new Set([...all.matchAll(/\bversion\s+([0-9]+(?:\.[0-9]+)*)\s+is\s+current/g)].map((m) => m[1]))];
    if (versions.length > 1) contradictions.push({ type: "version_conflict", details: versions, resolution_hint: "Check release notes/package registry/current official docs." });
    if (sources.some((s) => s.outdated_risk || classifyFreshness(s).includes("outdated")) && sources.some((s) => s.official && /release|docs|official/i.test(`${s.source_type} ${s.title}`))) contradictions.push({ type: "old_docs_vs_new_docs", details: ["Older source conflicts or may conflict with current official/release evidence."], resolution_hint: "Use current official/release evidence first." });
    if (sources.some((s) => !s.official) && sources.some((s) => s.official) && /not deprecated|version 1 is current|yarn add/.test(all) && /deprecated|version 2 is current|npm install/.test(all)) contradictions.push({ type: "official_vs_community_conflict", details: ["Community/secondary wording appears to conflict with official/current source wording."], resolution_hint: "Prefer official source unless runtime evidence disproves it." });
    if (!sources.length) contradictions.push({ type: "unknown_due_to_missing_source", details: ["No sources supplied."], resolution_hint: "Supply at least one bounded source." });
    return contradictions;
  }

  function formatSourceMap(result) { return `vnem_tools_source_map: ${result.source_type} ${result.top_level_structure.length} top-level item(s); blocked ${result.missing_or_blocked_areas.length}\nevidence: ${result.evidence_log_id || "not written"}`; }
  function formatSourceExtract(result) { return `vnem_tools_source_extract: read ${result.targets_read.length}; skipped ${result.targets_skipped.length}; claims ${result.claim_candidates.length}\nevidence: ${result.evidence_log_id || "not written"}`; }
  function formatSourceGraph(result) { return `vnem_tools_source_graph: ${result.sources.length} source(s); contradictions ${result.contradictions_found.length}; confidence ${result.confidence}\nevidence: ${result.evidence_log_id || "not written"}`; }

  async function safeClaimSourceMatrix(args) {
    const sources = arrayify(args.sources).map((s, i) => normalizeMatrixSource(s, i));
    const claims = arrayify(args.claims).map(String);
    const matrix = [];
    const supported = [];
    const unsupported = [];
    const conflicting = [];
    for (const claim of claims) {
      const rows = sources.map((source) => assessClaimAgainstSource(claim, source));
      matrix.push({ claim, source_results: rows });
      const supportRows = rows.filter((r) => r.support === "supports");
      const conflictRows = rows.filter((r) => r.support === "conflicts");
      if (conflictRows.length || (/captcha.*bypass|bypass.*captcha/i.test(claim) && !supportRows.some((r) => r.source_quality_score >= 80))) conflicting.push({ claim, supporting_sources: supportRows.map((r) => r.source_id), conflicting_sources: conflictRows.map((r) => r.source_id), reason: "Conflicting or safety-critical claim requires high-quality corroboration." });
      else if (supportRows.length) supported.push({ claim, supporting_sources: supportRows.map((r) => r.source_id), confidence: supportRows.some((r) => r.source_quality_score >= 80) ? "medium_high" : "low" });
      else unsupported.push({ claim, reason: "No provided source clearly supports this claim." });
    }
    const result = { claims, sources, matrix, supported_claims: supported, unsupported_claims: unsupported, conflicting_claims: conflicting, source_quality_notes: sources.map((s) => ({ source_id: s.id, title: s.title, quality_score: s.source_quality_score, notes: s.source_quality_score >= 80 ? "strong source" : s.source_quality_score < 50 ? "weak source" : "medium source" })), citation_plan: supported.map((s) => `${s.claim}: cite ${s.supporting_sources.join(", ")}`).slice(0, 12), must_not_claim: ["All claims are supported.", "Unsupported/conflicting claims are proven.", "Source quality was externally verified beyond provided metadata."], evidence_log_id: null };
    const log = await writeEvidenceLog("claim_source_matrix", result);
    result.evidence_log_id = log.evidence_log_id;
    recordSession(args.session_id, "claim_source_matrices", result);
    return result;
  }

  async function safeResearchGapDetector(args) {
    const task = String(args.task || "");
    const hay = `${task} ${args.domain || ""}`.toLowerCase();
    const sources = arrayify(args.sources).map((s, i) => normalizeMatrixSource(s, i));
    const hasOfficial = sources.some((s) => /official|docs|primary|vendor|github/.test(`${s.source_type} ${s.title}`.toLowerCase()) || s.source_quality_score >= 85);
    const hasCommunity = sources.some((s) => /community|forum|reddit|discussion/.test(`${s.source_type} ${s.title}`.toLowerCase()));
    const hasCounter = sources.length > 1 && arrayify(args.claims).length > 0;
    const freshness = Boolean(args.freshness_required || /latest|current|today|recent|now|this week|meta/.test(hay));
    const missing = [];
    if (!hasOfficial) missing.push("official_or_primary_source");
    if (/game|meta|community|mod/.test(hay) && !hasCommunity) missing.push("community_source");
    if (/security|malware|phishing|download|cve/.test(hay)) missing.push("security_advisory_or_reputation_source");
    const blockers = [];
    if (freshness) blockers.push("current/fresh search evidence is missing");
    if (!hasOfficial) blockers.push("primary/official source is missing");
    if (!hasCounter) blockers.push("counter-source/conflict check is missing");
    if (sources.some((s) => !s.published_at)) blockers.push("dates or versions are missing for at least one source");
    const result = { missing_source_types: [...new Set(missing)], missing_current_search: freshness, missing_primary_sources: hasOfficial ? [] : ["official docs/API/vendor/source repository/patch notes"], missing_counter_sources: hasCounter ? [] : ["independent corroborating or counter-source"], missing_dates_or_versions: sources.filter((s) => !s.published_at).map((s) => s.id || s.title), confidence_blockers: blockers, recommended_next_queries: (await safeSearchQueryBuilder({ task, freshness_required: freshness, source_types_needed: missing })).queries.slice(0, 6), recommended_next_tools: ["vnem_tools_search_provider_manifest", "vnem_tools_search_query_builder", "vnem_tools_web_search", "vnem_tools_search_result_ranker", "vnem_tools_source_quality_check", "vnem_tools_claim_source_matrix"], must_not_claim: ["A confident final answer is justified before gaps are closed.", "Current/latest facts are verified without current search evidence.", "Primary sources were checked if they are missing."], evidence_log_id: null };
    const log = await writeEvidenceLog("research_gap_detector", result);
    result.evidence_log_id = log.evidence_log_id;
    recordSession(args.session_id, "research_gap_detections", result);
    return result;
  }

  function inferNeededSourceTypes(text) {
    const out = ["official_docs"];
    if (/current|latest|news|today|recent/.test(text)) out.push("current_web");
    if (/security|malware|phishing|cve/.test(text)) out.push("security_advisory");
    if (/github|repo|code/.test(text)) out.push("github_repo");
    if (/game|meta|mod/.test(text)) out.push("community_source");
    return out;
  }
  function inferOfficialSourceTargets(text) { return [/github|repo|code/.test(text) ? "GitHub repository/releases/issues" : null, /npm|javascript|library/.test(text) ? "official docs/npm package/changelog" : null, /security|cve/.test(text) ? "vendor advisory/CVE/NVD" : null, /game|elden|meta/.test(text) ? "official patch notes" : null, "vendor/project official documentation"].filter(Boolean); }
  function inferSecondarySourceTargets(text) { return [/game|meta|mod/.test(text) ? "community forums/reddit/wiki with lower authority" : null, /product|compare|best/.test(text) ? "independent reviews and limitation reports" : null, /security|malware|phishing/.test(text) ? "reputation/security databases" : null, "credible secondary analysis"].filter(Boolean); }
  function localFixtureSearch(query) {
    const q = String(query || "");
    return [
      { title: "Official Browser MCP Security Docs", url: "https://docs.example.com/browser-mcp/security", snippet: `Official docs matching ${q}. Updated 2026.`, source_type: "official_docs", date: "2026-06-01", provider: "local_fixture" },
      { title: "GitHub browser MCP repository", url: "https://github.com/example/browser-mcp", snippet: "Repository, releases, and issues for source verification.", source_type: "github_repo", date: "2026-05-20", provider: "local_fixture" },
      { title: "Security advisory for browser automation tools", url: "https://security.example.org/advisories/browser-mcp", snippet: "Advisory-style fixture for phishing/download risk.", source_type: "security_advisory", date: "2026-04-10", provider: "local_fixture" },
      { title: "Community discussion of browser MCP tools", url: "https://reddit.com/r/mcp/comments/browser-tools", snippet: "Community discussion; useful but lower authority.", source_type: "community", date: "2026-03-01", provider: "local_fixture" },
      { title: "Download NOW free browser MCP installer!!!", url: "https://free-download-example.xyz/setup.exe", snippet: "Spammy fake download result fixture.", source_type: "download", date: null, provider: "local_fixture" }
    ];
  }
  function normalizeSearchResult(result) { return { title: truncate(redactSecrets(result.title || "Untitled"), 200), url: redactUrlString(result.url || ""), snippet: truncate(redactSecrets(result.snippet || result.description || ""), 500), source_type: String(result.source_type || inferSourceTypeFromUrl(result.url || "", result.title || "")).toLowerCase(), date: result.date || result.published_at || null, provider: result.provider || null }; }
  function inferSourceTypeFromUrl(url, title = "") { const hay = `${url} ${title}`.toLowerCase(); if (/github\.com/.test(hay)) return "github_repo"; if (/docs|documentation|developer|api/.test(hay)) return "official_docs"; if (/reddit|forum|discussion/.test(hay)) return "community"; if (/download|\.exe|\.msi|\.zip/.test(hay)) return "download"; if (/security|advisory|cve/.test(hay)) return "security_advisory"; return "web"; }
  function scoreSearchResult(result, task, preferred, freshnessRequired) { let score = 35; const hay = `${result.title} ${result.snippet} ${result.url}`.toLowerCase(); const terms = significantTerms(task); score += Math.min(25, terms.filter((term) => hay.includes(term)).length * 4); if (/official|docs|documentation|vendor|github\.com/.test(hay) || /official_docs|github_repo|security_advisory/.test(result.source_type)) score += 25; if (preferred.includes(String(result.source_type).toLowerCase())) score += 15; if (result.date) score += freshnessRequired ? 15 : 5; if (/reddit|forum|community/.test(result.source_type)) score -= preferred.includes("community") ? 0 : 8; for (const flag of urlRiskFlags(result.url, hay)) score -= /download|credential|phishing|malware/.test(flag) ? 35 : 12; return Math.max(0, Math.min(100, score)); }
  function duplicateClusters(results) { const map = new Map(); for (const r of results) { const key = `${r.title}`.toLowerCase().replace(/\butm\b|copy|\W+/g, " ").trim().slice(0, 60); if (!map.has(key)) map.set(key, []); map.get(key).push(r); } return [...map.values()].filter((items) => items.length > 1).map((items) => items.map((item) => item.url)); }
  function urlRiskFlags(urlValue, text = "") { const flags = []; const raw = String(urlValue || ""); const hay = `${raw} ${text}`.toLowerCase(); let url; try { url = new URL(raw, "https://local.invalid/"); } catch { flags.push("invalid_url"); return flags; } if (url.username || url.password || /:\/\/[^/\s]+:[^@/\s]+@/.test(raw)) flags.push("credentialed_url"); if (containsRawSecret(raw)) flags.push("secret_like_url_parameter"); if (/xn--/.test(url.hostname)) flags.push("punycode_or_homograph_risk"); if (/\.(xyz|top|click|zip|mov|tk|ru)$/i.test(url.hostname)) flags.push("suspicious_tld_or_domain_pattern"); if (/bit\.ly|tinyurl|t\.co|goo\.gl|ow\.ly|is\.gd/.test(url.hostname)) flags.push("url_shortener"); if (/free|download now|crack|keygen|urgent|verify|wallet|airdrop|login|password|phishing|malware|scam/.test(hay)) flags.push("phishing_scam_or_download_bait_words"); if (/\.(exe|msi|dmg|pkg|scr|bat|cmd|ps1|sh)(\?|#|$)/i.test(url.pathname)) flags.push("executable_or_script_download"); if (/\.(zip|7z|rar|tar|gz)(\?|#|$)/i.test(url.pathname)) flags.push("archive_download"); return [...new Set(flags)]; }
  function urlTrustFlags(urlValue, sourceType = "") { const flags = []; let url; try { url = new URL(String(urlValue || ""), "https://local.invalid/"); } catch { return flags; } if (/official|docs|security_advisory|github_repo/.test(String(sourceType))) flags.push("source_type_claims_higher_authority"); if (/github\.com|docs\.|developer\.|mozilla\.org|microsoft\.com|google\.com|npmjs\.com|nvd\.nist\.gov/.test(url.hostname)) flags.push("known_official_or_developer_domain_pattern"); if (url.protocol === "https:") flags.push("https_url"); return flags; }
  function extractUrlsFromText(text) { return [...String(text || "").matchAll(/https?:\/\/[^\s)]+/g)].map((m) => m[0]); }
  function isLocalHostname(hostname) { return ["127.0.0.1", "localhost", "::1"].includes(String(hostname).toLowerCase()); }
  function redirectSuspicionReason(item, startHost) { const url = String(item.url || ""); const hay = `${url} ${item.location || ""}`.toLowerCase(); try { const host = new URL(url).hostname.replace(/^www\./, ""); if (host && startHost && host !== startHost) return "cross-domain redirect"; } catch {} if (/\.(exe|msi|dmg|pkg|scr|bat|cmd|ps1|zip|rar|7z)(\?|#|$)/i.test(hay)) return "download or executable redirect"; if (/login|verify|password|wallet|free|download/.test(hay)) return "suspicious redirect wording"; return ""; }
  function fileTypeGuess(pathname) { if (/\.(exe|msi|dmg|pkg|scr)$/i.test(pathname)) return "executable_installer"; if (/\.(bat|cmd|ps1|sh)$/i.test(pathname)) return "script"; if (/\.(zip|7z|rar|tar|gz)$/i.test(pathname)) return "archive"; if (/\.(pdf)$/i.test(pathname)) return "document"; return "unknown"; }
  function normalizeMatrixSource(source, index) { return { id: String(source.id || `source_${index + 1}`), title: redactSecrets(source.title || `Source ${index + 1}`), url: source.url ? redactUrlString(source.url) : null, source_type: String(source.source_type || "unknown"), source_quality_score: Number(source.source_quality_score ?? source.quality_score ?? 50), text_excerpt: redactSecrets(String(source.text_excerpt || source.snippet || source.text || "")), published_at: source.published_at || source.date || null }; }
  function assessClaimAgainstSource(claim, source) { const claimTerms = significantTerms(claim); const text = source.text_excerpt.toLowerCase(); const hits = claimTerms.filter((term) => text.includes(term)); const support = hits.length >= Math.max(1, Math.ceil(claimTerms.length * 0.6)); const negates = /\b(no|not|never|without|blocked|unsupported|does not|cannot)\b/i.test(text) && hits.length >= 1; const dangerousCaptcha = /captcha.*bypass|bypass.*captcha/i.test(claim); return { source_id: source.id, title: source.title, source_quality_score: source.source_quality_score, support: support && !(negates && !dangerousCaptcha) ? "supports" : negates || (dangerousCaptcha && /no automatic captcha bypass|captcha bypass.*not|not.*captcha bypass/i.test(text)) ? "conflicts" : "not_found", matched_terms: hits.slice(0, 10), note: support ? "claim terms found in source excerpt" : "claim terms not sufficiently present" }; }
  function formatSearchProviderManifest(result) { return `vnem_tools_search_provider_manifest: configured=${result.configured_providers.join(", ")} unconfigured=${result.unconfigured_providers.join(", ")}`; }
  function formatSearchQueryBuilder(result) { return [`vnem_tools_search_query_builder: ${result.queries.length} queries`, ...result.queries.slice(0, 5).map((q) => `- ${q}`)].join("\n"); }
  function formatWebSearch(result) { return `vnem_tools_web_search: ${result.provider_status} executed=${result.executed} results=${result.result_count}`; }
  function formatSearchResultRanker(result) { return `vnem_tools_search_result_ranker: ranked=${result.ranked_results.length} best=${result.best_sources.length} risky=${result.risky_sources.length}`; }
  function formatRedirectChain(result) { return `vnem_tools_redirect_chain_check: redirects=${result.redirect_chain.length} final=${result.final_url}`; }
  function formatUrlReputation(result) { return `vnem_tools_url_reputation_check: ${result.risk_level} flags=${result.risk_flags.join(",")}`; }
  function formatCaptchaDetector(result) { return `vnem_tools_captcha_detector: detected=${result.captcha_or_block_detected} type=${result.block_type}`; }
  function formatDownloadSafety(result) { return `vnem_tools_download_safety_check: ${result.risk_level} type=${result.file_type_guess}`; }
  function formatClaimSourceMatrix(result) { return `vnem_tools_claim_source_matrix: claims=${result.claims.length} supported=${result.supported_claims.length} unsupported=${result.unsupported_claims.length} conflicting=${result.conflicting_claims.length}`; }
  function formatResearchGapDetector(result) { return `vnem_tools_research_gap_detector: blockers=${result.confidence_blockers.length} missing_current_search=${result.missing_current_search}`; }

  return {
    formatCaptchaDetector,
    formatClaimSourceMatrix,
    formatDownloadSafety,
    formatRedirectChain,
    formatResearchGapDetector,
    formatSearchProviderManifest,
    formatSearchQueryBuilder,
    formatSearchResultRanker,
    formatSourceExtract,
    formatSourceGraph,
    formatSourceMap,
    formatUrlReputation,
    formatWebSearch,
    safeCaptchaDetector,
    safeClaimSourceMatrix,
    safeDownloadSafetyCheck,
    safeRedirectChainCheck,
    safeResearchGapDetector,
    safeSearchProviderManifest,
    safeSearchQueryBuilder,
    safeSearchResultRanker,
    safeSourceExtract,
    safeSourceGraph,
    safeSourceMap,
    safeUrlReputationCheck,
    safeWebSearch
  };
}
