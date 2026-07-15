export function createBrowserResearchRuntime({
  readFile,
  path,
  MAX_FETCH_TEXT_BYTES,
  ToolsError,
  resolveAllowedRoot,
  resolveAllowedFile,
  safeFetchUrlText,
  looksBinary,
  extractText,
  extractTitle,
  recordSession,
  writeEvidenceLog,
  enforceApproval,
  redactSecrets,
  containsRawSecret,
  redactUrl,
  truncate,
  arrayify
}) {
  function parseSafeResearchUrl(input) {
    if (containsRawSecret(input)) throw new ToolsError("Raw secret-like values are blocked in URLs.", "raw_secret_blocked");
    let url;
    try { url = new URL(String(input)); } catch { throw new ToolsError("Invalid URL.", "invalid_url"); }
    if (url.username || url.password) throw new ToolsError("Credentialed URLs are blocked.", "credentialed_url_blocked");
    if (["data:", "javascript:"].includes(url.protocol)) throw new ToolsError("Unsafe URL scheme blocked.", "unsafe_url_scheme_blocked");
    if (isSearchEngineUrl(url)) throw new ToolsError("Search-engine scraping is blocked by default.", "search_engine_scraping_blocked", { host: url.hostname });
    if (url.protocol === "file:") return url;
    if (!["http:", "https:"].includes(url.protocol)) throw new ToolsError("Only http(s) and safe file URLs are allowed.", "unsafe_url_scheme_blocked");
    if (url.protocol === "http:" && !["127.0.0.1", "localhost", "::1"].includes(url.hostname)) throw new ToolsError("External plaintext HTTP is blocked; use HTTPS or localhost.", "insecure_external_http_blocked");
    return url;
  }

  function isSearchEngineUrl(url) {
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    return ["google.com", "bing.com", "duckduckgo.com", "search.yahoo.com", "yandex.com", "baidu.com"].some((domain) => host === domain || host.endsWith(`.${domain}`)) && /(^|\/)search|q=/.test(`${url.pathname}${url.search}`);
  }

  async function safeSourceQualityCheck(args) {
    const text = String(args.text_excerpt || "");
    const sourceType = String(args.source_type || "unknown").toLowerCase();
    let score = 40;
    const qualityFlags = [];
    const riskFlags = [];
    if (args.url) { score += 10; qualityFlags.push("direct_url_provided"); }
    if (/official|docs|primary|spec|standard/.test(sourceType) || /official|docs|documentation|specification/i.test(args.title || "")) { score += 25; qualityFlags.push("likely_primary_or_official_source"); }
    if (args.published_at || args.retrieved_at) { score += 10; qualityFlags.push("date_metadata_present"); }
    if (text.length > 80) { score += 10; qualityFlags.push("substantive_excerpt_present"); }
    if (!args.url) riskFlags.push("no_url_provided");
    if (!args.published_at) riskFlags.push("published_date_unknown");
    if (text.length < 80) riskFlags.push("thin_excerpt");
    score = Math.max(0, Math.min(100, score));
    return {
      url: args.url || null,
      title: redactSecrets(args.title || ""),
      source_quality_score: score,
      quality_flags: qualityFlags,
      risk_flags: riskFlags,
      recency_notes: args.published_at || args.retrieved_at ? `published_at=${args.published_at || "unknown"}; retrieved_at=${args.retrieved_at || "unknown"}` : "No date metadata supplied; recency unknown.",
      primary_source_likelihood: qualityFlags.includes("likely_primary_or_official_source") ? "medium_high" : "unknown",
      citation_recommendation: score >= 70 ? "usable_with_citation_and_scope_limits" : "use_only_with_corroboration",
      must_not_claim: ["Verified factual correctness beyond the provided source text.", "No better or conflicting sources exist.", "Current web search was performed by this tool."]
    };
  }

  async function safeResearchBrief(args) {
    const sources = arrayify(args.sources).map((source) => ({ url: source.url || null, title: redactSecrets(source.title || "untitled"), text_excerpt: redactSecrets(source.text_excerpt || source.summary || ""), source_quality_score: source.source_quality_score || source.quality_score || null }));
    const supported = [];
    const unsupported = [];
    for (const claim of arrayify(args.claims_to_check)) {
      const claimText = String(claim);
      const terms = claimText.toLowerCase().split(/\W+/).filter((term) => term.length > 3);
      const hits = sources.filter((source) => terms.length ? terms.every((term) => source.text_excerpt.toLowerCase().includes(term)) : false);
      if (hits.length) supported.push({ claim: claimText, supporting_sources: hits.map((source) => source.title).slice(0, 3), support_level: "mentioned_by_provided_sources" });
      else unsupported.push({ claim: claimText, reason: "Not supported by provided source excerpts." });
    }
    const brief = {
      task: args.task,
      research_brief: sources.length ? `Reviewed ${sources.length} provided/direct source summary item(s) for: ${args.task}.` : `No sources supplied for: ${args.task}.`,
      supported_claims: supported,
      unsupported_claims: unsupported,
      conflicts: [],
      missing_sources: sources.length ? [] : ["At least one direct source or source summary is needed."],
      recommended_next_sources: ["Use current external search outside Tools MCP if the task requires broad discovery.", "Prefer official docs/specs/primary sources and corroborating independent sources."],
      must_not_claim: ["A broad web search happened.", "Search-engine results were scraped.", "Unsupported claims are verified.", "Provided source excerpts prove facts beyond their text."],
      evidence_log_id: null
    };
    const log = await writeEvidenceLog("research_brief", brief);
    brief.evidence_log_id = log.evidence_log_id;
    recordSession(args.session_id, "research_briefs", brief);
    return brief;
  }

  async function loadPageLikeSource(args, options = {}) {
    const keys = ["url", "file_path", "html", "text"].filter((key) => typeof args[key] === "string" && args[key].trim());
    if (keys.length !== 1) throw new ToolsError("Provide exactly one of url, file_path, html, or text.", "page_source_required");
    const maxBytes = Math.min(args.max_bytes || options.max_bytes || MAX_FETCH_TEXT_BYTES, MAX_FETCH_TEXT_BYTES);
    if (args.url) {
      const url = parseSafeResearchUrl(args.url);
      const dryRun = args.dry_run !== false;
      const planned = { source_type: "url", url_or_file: redactUrl(url), dry_run: true, executed: false, evidence_log_id: null, safe_to_claim: [], must_not_claim: browserUnderstandingMustNotClaim() };
      if (dryRun) return { ...planned, source_text: "", html: "", text: "" };
      enforceApproval(args);
      const fetched = await safeFetchUrlText({ ...args, dry_run: false, approved: true, approval_note: args.approval_note || "approved nested page source fetch", max_response_bytes: maxBytes });
      return { source_type: "url", url_or_file: fetched.url, dry_run: false, executed: true, html: fetched.text_excerpt || "", text: fetched.text_excerpt || "", fetched, evidence_log_id: fetched.evidence_log_id };
    }
    if (args.file_path) {
      const workspaceRoot = await resolveAllowedRoot(args.workspace_root || args.root || ".");
      const raw = String(args.file_path).trim();
      const target = await resolveAllowedFile(path.isAbsolute(raw) ? raw : path.join(workspaceRoot.absolutePath, raw), { mustExist: true, blockSecrets: true });
      const bytes = await readFile(target.absolutePath);
      if (bytes.includes(0) || looksBinary(bytes)) throw new ToolsError("Binary page-like files are blocked.", "binary_file_blocked", { path: target.relativePath });
      const content = redactSecrets(bytes.subarray(0, maxBytes).toString("utf8"));
      return { source_type: "file", url_or_file: target.relativePath, dry_run: false, executed: true, html: content, text: extractText(content), truncated: bytes.length > maxBytes };
    }
    if (args.html) {
      const html = redactSecrets(String(args.html).slice(0, maxBytes));
      return { source_type: "provided_html", url_or_file: "provided_html", dry_run: false, executed: true, html, text: extractText(html), truncated: String(args.html).length > maxBytes };
    }
    const text = redactSecrets(String(args.text).slice(0, maxBytes));
    return { source_type: "provided_text", url_or_file: "provided_text", dry_run: false, executed: true, html: text, text: extractText(text), truncated: String(args.text).length > maxBytes };
  }

  async function safeBrowserPageInspect(args) {
    const source = await loadPageLikeSource(args);
    if (source.dry_run) return { ...emptyPageInspection(), ...source };
    const html = source.html || source.text || "";
    const text = extractText(html);
    const headings = extractHeadings(html);
    const links = extractLinks(html);
    const images = extractTagAttrs(html, "img");
    const forms = extractTagBlocks(html, "form");
    const buttons = extractButtons(html);
    const scripts = (html.match(/<script\b/gi) || []).length;
    const sections = buildStructuredSections(html, headings, text);
    const result = {
      source_type: source.source_type,
      url_or_file: source.url_or_file,
      dry_run: false,
      executed: true,
      title: extractTitle(html),
      meta_description: extractMetaDescription(html),
      headings,
      main_text_excerpt: truncate(text, 2200),
      detected_language_hint: detectLanguageHint(html, text),
      links_count: links.length,
      images_count: images.length,
      forms_count: forms.length,
      buttons_count: buttons.length,
      scripts_count: scripts,
      structured_sections: sections,
      possible_page_purpose: inferPagePurpose({ title: extractTitle(html), headings, text, forms_count: forms.length }),
      risk_flags: pageRiskFlags(html, links),
      quality_flags: pageQualityFlags(html, text, headings),
      safe_to_claim: ["Page/source content was inspected with static Tools MCP parsing safeguards."],
      must_not_claim: browserUnderstandingMustNotClaim(),
      evidence_log_id: null
    };
    const log = await writeEvidenceLog("browser_page_inspect", result);
    result.evidence_log_id = log.evidence_log_id;
    recordSession(args.session_id, "browser_page_inspections", result);
    return result;
  }

  function emptyPageInspection() {
    return { title: "", meta_description: "", headings: [], main_text_excerpt: "", detected_language_hint: "unknown", links_count: 0, images_count: 0, forms_count: 0, buttons_count: 0, scripts_count: 0, structured_sections: [], possible_page_purpose: "unknown", risk_flags: [], quality_flags: [], safe_to_claim: [], must_not_claim: browserUnderstandingMustNotClaim() };
  }

  async function safeBrowserReadabilityExtract(args) {
    const source = await loadPageLikeSource(args);
    if (source.dry_run) return { title: "", readable_text_excerpt: "", headings: [], code_blocks_count: 0, lists_count: 0, tables_count: 0, content_quality_flags: ["dry_run_only_no_content_extracted"], truncated: false, evidence_log_id: null, ...source };
    const html = source.html || "";
    const main = extractMainLikeHtml(html);
    const readable = extractText(main || html);
    const codeBlockCount = (html.match(/<pre\b/gi) || []).length || (html.match(/<code\b/gi) || []).length;
    const result = { title: extractTitle(html), readable_text_excerpt: truncate(readable, 2600), headings: extractHeadings(main || html), code_blocks_count: codeBlockCount, lists_count: (html.match(/<[ou]l\b/gi) || []).length, tables_count: (html.match(/<table\b/gi) || []).length, content_quality_flags: ["heuristic_readability_extract_not_perfect", readable.length < 120 ? "thin_readable_text" : "substantive_readable_text"], truncated: Boolean(source.truncated || readable.length > 2600), evidence_log_id: null };
    const log = await writeEvidenceLog("browser_readability_extract", result);
    result.evidence_log_id = log.evidence_log_id;
    recordSession(args.session_id, "browser_readability_extracts", result);
    return result;
  }

  async function safeBrowserLinkMap(args) {
    const source = await loadPageLikeSource(args);
    if (source.dry_run) return { internal_links: [], external_links: [], same_domain_links: [], anchor_links: [], mailto_links: [], download_like_links: [], blocked_or_suspicious_links: [], domain_summary: {}, recommended_followup_urls: [], must_not_claim: linkMapMustNotClaim(), evidence_log_id: null, ...source };
    const baseUrl = safeOptionalUrl(args.base_url || (source.source_type === "url" ? source.url_or_file : "https://local.invalid/"));
    const all = extractLinks(source.html || "").slice(0, Math.min(args.max_links || 80, 200));
    const mapped = all.map((link) => classifyLink(link, baseUrl));
    const result = {
      internal_links: mapped.filter((l) => l.category === "internal"),
      external_links: mapped.filter((l) => l.category === "external"),
      same_domain_links: mapped.filter((l) => l.category === "same_domain"),
      anchor_links: mapped.filter((l) => l.category === "anchor"),
      mailto_links: mapped.filter((l) => l.category === "mailto"),
      download_like_links: mapped.filter((l) => l.download_like),
      blocked_or_suspicious_links: mapped.filter((l) => l.suspicious || l.blocked).map((l) => ({ href: l.href, text: l.text, reason: l.reason })),
      domain_summary: domainSummary(mapped),
      recommended_followup_urls: mapped.filter((l) => !l.suspicious && !l.blocked && ["same_domain", "external"].includes(l.category)).map((l) => l.absolute || l.href).slice(0, 10),
      must_not_claim: linkMapMustNotClaim(),
      evidence_log_id: null
    };
    const log = await writeEvidenceLog("browser_link_map", result);
    result.evidence_log_id = log.evidence_log_id;
    recordSession(args.session_id, "browser_link_maps", result);
    return result;
  }

  async function safeBrowserDomSearch(args) {
    const source = await loadPageLikeSource(args);
    if (source.dry_run) return { matches: [], match_count: 0, truncated: false, evidence_log_id: null, ...source };
    const query = String(args.query || "").toLowerCase();
    const max = Math.min(args.max_results || 50, 100);
    const candidates = domSearchCandidates(source.html || "", args.mode || "text");
    const matches = candidates.filter((item) => `${item.text} ${item.href || ""} ${item.selector || ""}`.toLowerCase().includes(query)).slice(0, max);
    const result = { mode: args.mode || "text", query: args.query, matches, match_count: matches.length, truncated: candidates.length > max && matches.length >= max, evidence_log_id: null };
    const log = await writeEvidenceLog("browser_dom_search", result);
    result.evidence_log_id = log.evidence_log_id;
    recordSession(args.session_id, "browser_dom_searches", result);
    return result;
  }

  async function safeBrowserAccessibilityAudit(args) {
    const source = await loadPageLikeSource(args);
    if (source.dry_run) return { score: null, issues: [], warnings: ["dry_run_only_no_static_accessibility_audit"], passes: [], must_not_claim: accessibilityMustNotClaim(), recommended_fixes: [], evidence_log_id: null, ...source };
    const html = source.html || "";
    const issues = [];
    const warnings = ["Static heuristic audit only; color contrast is not verified unless explicit color data exists."];
    const passes = [];
    const images = extractTagAttrs(html, "img");
    images.forEach((img, index) => { if (!attrValue(img.attrs, "alt")) issues.push({ type: "missing_image_alt", message: `Image ${index + 1} is missing alt text.` }); });
    if (images.some((img) => attrValue(img.attrs, "alt"))) passes.push("At least one image has alt text.");
    const buttons = extractButtons(html);
    buttons.forEach((button, index) => { if (!button.text.trim()) issues.push({ type: "button_text", message: `Button ${index + 1} has no accessible text.` }); });
    if (buttons.some((button) => button.text.trim())) passes.push("Buttons include visible text.");
    const inputs = extractTagAttrs(html, "input");
    const labels = extractLabels(html);
    inputs.forEach((input, index) => { const id = attrValue(input.attrs, "id"); const name = attrValue(input.attrs, "name"); if (!id || !labels.forIds.has(id)) issues.push({ type: "form_label", message: `Input ${name || index + 1} may be missing an associated label.` }); });
    if (labels.count > 0) passes.push("Form labels are present.");
    const headings = extractHeadings(html);
    if (!extractTitle(html)) issues.push({ type: "title_present", message: "Page title is missing." }); else passes.push("Page title is present.");
    if (!/<main\b|role=["']main["']/i.test(html)) warnings.push("No main landmark detected."); else passes.push("Main landmark is present.");
    headingOrderIssues(headings).forEach((message) => issues.push({ type: "heading_order", message }));
    extractLinks(html).forEach((link, index) => { if (!link.text || /^(click here|here|more|read more)$/i.test(link.text.trim())) issues.push({ type: "link_text_quality", message: `Link ${index + 1} has weak or missing link text.` }); });
    const score = Math.max(0, Math.min(100, 100 - issues.length * 12 - warnings.length * 3));
    const result = { score, issues, warnings, passes, must_not_claim: accessibilityMustNotClaim(), recommended_fixes: recommendedA11yFixes(issues), evidence_log_id: null };
    const log = await writeEvidenceLog("browser_accessibility_audit", result);
    result.evidence_log_id = log.evidence_log_id;
    recordSession(args.session_id, "browser_accessibility_audits", result);
    return result;
  }

  async function safeBrowserCompareSnapshots(args) {
    const before = await loadPageLikeSource({ ...(args.before || {}), max_bytes: args.max_bytes, dry_run: false, approved: true, approval_note: "compare local/provided snapshot" });
    const after = await loadPageLikeSource({ ...(args.after || {}), max_bytes: args.max_bytes, dry_run: false, approved: true, approval_note: "compare local/provided snapshot" });
    const beforeLinks = extractLinks(before.html || "");
    const afterLinks = extractLinks(after.html || "");
    const beforeHeadings = extractHeadings(before.html || "").map((h) => h.text);
    const afterHeadings = extractHeadings(after.html || "").map((h) => h.text);
    const beforeText = extractText(before.html || "");
    const afterText = extractText(after.html || "");
    const result = {
      changed_title: extractTitle(before.html) !== extractTitle(after.html),
      changed_headings: { added: arrayDiff(afterHeadings, beforeHeadings), removed: arrayDiff(beforeHeadings, afterHeadings) },
      changed_text_summary: summarizeTextChange(beforeText, afterText),
      added_links: linkDiff(afterLinks, beforeLinks),
      removed_links: linkDiff(beforeLinks, afterLinks),
      added_forms_or_buttons: countFormsButtons(after.html) - countFormsButtons(before.html) > 0,
      removed_forms_or_buttons: countFormsButtons(before.html) - countFormsButtons(after.html) > 0,
      risk_flags: [...pageRiskFlags(before.html, beforeLinks), ...pageRiskFlags(after.html, afterLinks)].filter((v, i, a) => a.indexOf(v) === i),
      summary: "Static snapshot comparison completed; changed content was summarized without screenshots or full visual understanding claims.",
      evidence_log_id: null
    };
    const log = await writeEvidenceLog("browser_compare_snapshots", result);
    result.evidence_log_id = log.evidence_log_id;
    recordSession(args.session_id, "browser_snapshot_compares", result);
    return result;
  }

  async function safeBrowserResearchPack(args) {
    const sources = arrayify(args.sources).slice(0, Math.min(args.max_sources || 8, 20)).map(normalizeResearchPackSource);
    const claims = arrayify(args.claims_to_check).map(String);
    const supported = [];
    const unsupported = [];
    const conflicting = [];
    for (const claim of claims) {
      const terms = significantTerms(claim);
      const hits = sources.filter((source) => terms.length && terms.every((term) => source.text_excerpt.toLowerCase().includes(term)));
      const weakHits = sources.filter((source) => terms.length && terms.some((term) => source.text_excerpt.toLowerCase().includes(term)) && !hits.includes(source));
      const relevant = [...hits, ...weakHits];
      const hasNegated = relevant.some((source) => /\b(not|no longer|never)\s+(supported|deprecated|stable|required|requires)\b/i.test(source.text_excerpt));
      const hasPositive = relevant.some((source) => /\b(supported|deprecated|stable|required|requires)\b/i.test(source.text_excerpt) && !/\b(not|no longer|never)\s+(supported|deprecated|stable|required|requires)\b/i.test(source.text_excerpt));
      if (hits.length) supported.push({ claim, support_level: "supported_by_provided_sources", supporting_sources: hits.map((s) => s.title).slice(0, 4) });
      else unsupported.push({ claim, reason: "Not supported by provided source text/summaries." });
      if ((weakHits.length && hits.length && /\b(not|deprecated|unsupported|false|removed)\b/i.test(weakHits.map((s) => s.text_excerpt).join(" "))) || (hasNegated && hasPositive)) conflicting.push({ claim, conflict_summary: "Provided sources appear to contain partial or opposing wording; review manually.", sources: relevant.map((s) => s.title).slice(0, 4) });
    }
    const best = sources.filter((s) => s.source_quality_score >= 70 && s.has_read_content).slice(0, 5);
    const weak = sources.filter((s) => s.source_quality_score < 50 || !s.has_read_content).slice(0, 5);
    const missing = [];
    if (!sources.length) missing.push("No sources supplied.");
    for (const source of sources) if (!source.has_read_content) missing.push(`Source ${source.title} is metadata-only; do not claim it was read.`);
    for (const item of unsupported) missing.push(`Claim not supported by provided sources: ${item.claim}`);
    const pack = {
      task: args.task,
      source_summaries: sources.map((source) => ({ title: source.title, url: source.url, source_quality_score: source.source_quality_score, has_read_content: source.has_read_content, summary: truncate(source.text_excerpt, 300) })),
      source_quality_summary: { source_count: sources.length, best_count: best.length, weak_count: weak.length, average_score: sources.length ? Math.round(sources.reduce((sum, source) => sum + source.source_quality_score, 0) / sources.length) : null },
      supported_claims: supported,
      unsupported_claims: unsupported,
      conflicting_claims: conflicting,
      missing_evidence: missing.slice(0, 12),
      best_sources: best.map(pickResearchSourceForOutput),
      weak_sources: weak.map(pickResearchSourceForOutput),
      recommended_next_sources: ["Use external current search outside Tools MCP when broad/latest discovery is required.", "Prefer official docs/specs/primary sources and corroborating independent sources.", "Fetch direct approved URLs before claiming source text was read."],
      citation_plan: best.map((source, index) => ({ citation_id: `S${index + 1}`, title: source.title, url: source.url, use_for: "claims directly supported by the excerpt/inspection evidence" })),
      must_not_claim: ["A broad web search happened.", "Search-engine results were scraped.", "A source was read when only metadata was supplied.", "Unsupported or conflicting claims are verified.", "Current/latest coverage is complete without external current search evidence."],
      safe_to_claim: ["This pack evaluated only provided/direct/local source summaries supplied to Tools MCP.", "Supported claims are limited to the provided source text/summaries."],
      evidence_log_id: null
    };
    const log = await writeEvidenceLog("browser_research_pack", pack);
    pack.evidence_log_id = log.evidence_log_id;
    recordSession(args.session_id, "browser_research_packs", pack);
    return pack;
  }

  function browserUnderstandingMustNotClaim() {
    return ["Full visual/browser verification was performed.", "A web search happened.", "Links were followed or pages were crawled.", "JavaScript runtime behavior was fully evaluated.", "Login/session/cookie/CAPTCHA automation was used."];
  }

  function linkMapMustNotClaim() {
    return ["Links were followed.", "A crawl was performed.", "External pages were fetched or verified.", "Credentialed/private pages were accessed."];
  }

  function accessibilityMustNotClaim() {
    return ["Full accessibility certification was completed.", "Color contrast was verified without explicit color data.", "Keyboard/screen-reader behavior was fully tested.", "Browser/assistive-technology runtime testing happened."];
  }

  function extractMetaDescription(html) {
    const match = String(html || "").match(/<meta\s+[^>]*(?:name=["']description["'][^>]*content=["']([^"']*)["']|content=["']([^"']*)["'][^>]*name=["']description["'])[^>]*>/i);
    return truncate(redactSecrets(extractText(match?.[1] || match?.[2] || "")), 300);
  }

  function extractHeadings(html) {
    const out = [];
    for (const match of String(html || "").matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)) out.push({ level: Number(match[1]), text: truncate(redactSecrets(extractText(match[2])), 240) });
    return out.slice(0, 50);
  }

  function extractLinks(html) {
    const out = [];
    for (const match of String(html || "").matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
      const href = attrValue(match[1], "href") || "";
      out.push({ href: redactCredentialHref(href), text: truncate(redactSecrets(extractText(match[2])), 160) });
    }
    return out.slice(0, 300);
  }

  function extractTagAttrs(html, tag) {
    const out = [];
    const re = new RegExp(`<${tag}\\b([^>]*)>`, "gi");
    for (const match of String(html || "").matchAll(re)) out.push({ attrs: match[1] || "" });
    return out.slice(0, 200);
  }

  function extractTagBlocks(html, tag) {
    const out = [];
    const re = new RegExp(`<${tag}\\b([^>]*)>([\\s\\S]*?)<\\/${tag}>`, "gi");
    for (const match of String(html || "").matchAll(re)) out.push({ attrs: match[1] || "", inner_html: match[2] || "", text: truncate(extractText(match[2]), 300) });
    return out.slice(0, 100);
  }

  function extractButtons(html) {
    const buttons = extractTagBlocks(html, "button").map((button) => ({ text: button.text, attrs: button.attrs }));
    for (const input of extractTagAttrs(html, "input")) if (/type=["']?(button|submit|reset)/i.test(input.attrs)) buttons.push({ text: attrValue(input.attrs, "value") || attrValue(input.attrs, "aria-label") || "", attrs: input.attrs });
    return buttons.slice(0, 100);
  }

  function attrValue(attrs, name) {
    const re = new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
    const match = String(attrs || "").match(re);
    return match ? redactSecrets(match[1] || match[2] || match[3] || "") : "";
  }

  function redactCredentialHref(value) {
    return redactSecrets(String(value || "")).replace(/(https?:\/\/)[^\s/@:]+:[^\s/@]+@/i, "$1[REDACTED]@");
  }

  function redactUrlString(value) {
    try { return redactUrl(new URL(value, "https://local.invalid/")); } catch { return redactSecrets(String(value || "")); }
  }

  function extractMainLikeHtml(html) {
    return String(html || "").match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1]
      || String(html || "").match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1]
      || String(html || "").match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1]
      || String(html || "");
  }

  function buildStructuredSections(html, headings, text) {
    if (headings.length) return headings.slice(0, 12).map((heading) => ({ heading: heading.text, level: heading.level }));
    return text ? [{ heading: "content", level: 0, excerpt: truncate(text, 500) }] : [];
  }

  function detectLanguageHint(html, text) {
    const lang = String(html || "").match(/<html\b[^>]*lang=["']?([a-z-]+)/i)?.[1];
    if (lang) return lang.toLowerCase();
    return /\b(the|and|is|are|with)\b/i.test(text || "") ? "en" : "unknown";
  }

  function inferPagePurpose({ title, headings, text, forms_count }) {
    const hay = `${title} ${headings.map((h) => h.text).join(" ")} ${text}`.toLowerCase();
    if (/docs|documentation|guide|api|reference/.test(hay)) return "documentation_or_reference";
    if (/pricing|buy|checkout|cart/.test(hay)) return "commerce";
    if (forms_count && /subscribe|contact|email|sign/.test(hay)) return "lead_capture_or_form_page";
    if (/blog|article|news/.test(hay)) return "article_or_blog";
    return "general_web_page";
  }

  function pageRiskFlags(html, links = extractLinks(html)) {
    const flags = [];
    if ((String(html || "").match(/<script\b/gi) || []).length) flags.push("scripts_present_static_only_not_executed");
    for (const link of links) if (/^javascript:|^data:/i.test(link.href)) flags.push("unsafe_link_scheme_present");
    for (const link of links) if (/:\/\/[^/\s]+:[^@/\s]+@/.test(link.href)) flags.push("credentialed_link_present");
    if (/password|token|api[_-]?key/i.test(String(html || ""))) flags.push("secret_like_terms_redacted_or_flagged");
    return [...new Set(flags)];
  }

  function pageQualityFlags(html, text, headings) {
    const flags = [];
    if (extractTitle(html)) flags.push("title_present"); else flags.push("title_missing");
    if (extractMetaDescription(html)) flags.push("meta_description_present");
    if (headings.length) flags.push("headings_present");
    if (text.length > 200) flags.push("substantive_text_present"); else flags.push("thin_text");
    return flags;
  }

  function safeOptionalUrl(value) {
    try { return new URL(String(value || "https://local.invalid/")); } catch { return new URL("https://local.invalid/"); }
  }

  function classifyLink(link, baseUrl) {
    const href = link.href || "";
    const item = { ...link, category: "internal", absolute: null, download_like: /\.(zip|tar|gz|pdf|exe|dmg|msi|7z)(\?|#|$)/i.test(href), suspicious: false, blocked: false, reason: "" };
    if (!href) { item.suspicious = true; item.reason = "empty_href"; return item; }
    if (href.startsWith("#")) { item.category = "anchor"; return item; }
    if (/^mailto:/i.test(href)) { item.category = "mailto"; return item; }
    if (/^javascript:|^data:/i.test(href)) { item.suspicious = true; item.blocked = true; item.reason = "unsafe_scheme"; return item; }
    if (/:\/\/(?:\[REDACTED\]|[^/\s]+:[^@/\s]+)@/.test(href)) { item.suspicious = true; item.blocked = true; item.reason = "credentialed_url"; return item; }
    try {
      const absolute = new URL(href, baseUrl);
      item.absolute = redactUrl(absolute);
      item.category = absolute.hostname.replace(/^www\./, "") === baseUrl.hostname.replace(/^www\./, "") ? "same_domain" : "external";
      if (href.startsWith("/")) item.category = "internal";
    } catch { item.suspicious = true; item.reason = "invalid_url"; }
    return item;
  }

  function domainSummary(mapped) {
    const counts = {};
    for (const link of mapped) {
      try { const host = new URL(link.absolute || link.href, "https://local.invalid/").hostname; counts[host] = (counts[host] || 0) + 1; } catch {}
    }
    return counts;
  }

  function domSearchCandidates(html, mode) {
    if (mode === "heading") return extractHeadings(html).map((h) => ({ type: "heading", text: h.text, level: h.level }));
    if (mode === "link") return extractLinks(html).map((l) => ({ type: "link", text: l.text, href: l.href }));
    if (mode === "image") return extractTagAttrs(html, "img").map((img) => ({ type: "image", text: `${attrValue(img.attrs, "alt")} ${attrValue(img.attrs, "src")}`.trim() }));
    if (mode === "form") return extractTagBlocks(html, "form").map((form) => ({ type: "form", text: `${form.text} ${form.attrs} ${form.inner_html}`.trim() }));
    if (mode === "button") return extractButtons(html).map((button) => ({ type: "button", text: button.text, selector: button.attrs }));
    if (mode === "selector_like") return [...String(html || "").matchAll(/<([a-z0-9-]+)\b([^>]*)>/gi)].map((m) => ({ type: "element", text: m[0].slice(0, 240), selector: `${m[1]}${attrValue(m[2], "id") ? `#${attrValue(m[2], "id")}` : ""}` }));
    return extractText(html).split(/(?<=[.!?])\s+/).filter(Boolean).slice(0, 200).map((text) => ({ type: "text", text: truncate(text, 300) }));
  }

  function extractLabels(html) {
    const forIds = new Set();
    let count = 0;
    for (const label of extractTagBlocks(html, "label")) { count++; const id = attrValue(label.attrs, "for"); if (id) forIds.add(id); }
    return { count, forIds };
  }

  function headingOrderIssues(headings) {
    const issues = [];
    let last = 0;
    for (const heading of headings) {
      if (last && heading.level > last + 1) issues.push(`Heading jumps from h${last} to h${heading.level}.`);
      last = heading.level;
    }
    return issues;
  }

  function recommendedA11yFixes(issues) {
    const fixes = [];
    if (issues.some((i) => i.type === "missing_image_alt")) fixes.push("Add meaningful alt text or empty alt for decorative images.");
    if (issues.some((i) => i.type === "form_label")) fixes.push("Associate each input with a visible label or aria-label/aria-labelledby.");
    if (issues.some((i) => i.type === "button_text")) fixes.push("Give buttons visible or aria-label text.");
    if (issues.some((i) => i.type === "heading_order")) fixes.push("Use heading levels in order without skipping levels.");
    if (issues.some((i) => i.type === "link_text_quality")) fixes.push("Use descriptive link text rather than generic 'click here' labels.");
    return fixes;
  }

  function arrayDiff(left, right) {
    return left.filter((item) => !right.includes(item));
  }

  function linkDiff(left, right) {
    const keys = new Set(right.map((link) => `${link.href}|${link.text}`));
    return left.filter((link) => !keys.has(`${link.href}|${link.text}`));
  }

  function summarizeTextChange(before, after) {
    if (before === after) return "No text change detected by static extraction.";
    return `Text changed: before ${before.length} chars, after ${after.length} chars.`;
  }

  function countFormsButtons(html) {
    return (String(html || "").match(/<form\b|<button\b/gi) || []).length;
  }

  function significantTerms(text) {
    return String(text || "").toLowerCase().split(/\W+/).filter((term) => term.length > 3 && !["feature", "requires", "about", "with", "this", "that"].includes(term));
  }

  function normalizeResearchPackSource(source) {
    const text = redactSecrets(source.text_excerpt || source.summary || source.main_text_excerpt || source.readable_text_excerpt || "");
    const score = Number(source.source_quality_score || source.quality_score || (source.source_type === "official_docs" ? 75 : text ? 55 : 25));
    return { url: source.url || source.url_or_file || null, title: redactSecrets(source.title || source.name || "untitled source"), source_type: source.source_type || "provided_source", text_excerpt: text, source_quality_score: Math.max(0, Math.min(100, score)), has_read_content: Boolean(text.trim() || source.fetched || source.inspected) };
  }

  function pickResearchSourceForOutput(source) {
    return { title: source.title, url: source.url, source_quality_score: source.source_quality_score, has_read_content: source.has_read_content };
  }

  function formatBrowserPageInspect(result) { return `vnem_tools_browser_page_inspect: ${result.title || result.source_type}\nsource: ${result.url_or_file}\nevidence: ${result.evidence_log_id || "not written"}`; }
  function formatBrowserReadability(result) { return `vnem_tools_browser_readability_extract: ${result.title || "untitled"}\nchars: ${result.readable_text_excerpt?.length || 0}\nevidence: ${result.evidence_log_id || "not written"}`; }
  function formatBrowserLinkMap(result) { return `vnem_tools_browser_link_map: ${(result.internal_links?.length || 0) + (result.external_links?.length || 0)} mapped link(s)\nevidence: ${result.evidence_log_id || "not written"}`; }
  function formatBrowserDomSearch(result) { return `vnem_tools_browser_dom_search: ${result.match_count} match(es) for ${JSON.stringify(result.query)}\nevidence: ${result.evidence_log_id || "not written"}`; }
  function formatBrowserAccessibilityAudit(result) { return `vnem_tools_browser_accessibility_audit: score ${result.score ?? "dry-run"}; issues ${result.issues?.length || 0}\nevidence: ${result.evidence_log_id || "not written"}`; }
  function formatBrowserCompare(result) { return `vnem_tools_browser_compare_snapshots: ${result.summary}\nevidence: ${result.evidence_log_id || "not written"}`; }
  function formatBrowserResearchPack(result) { return `vnem_tools_browser_research_pack: ${result.source_summaries.length} source(s); supported ${result.supported_claims.length}; unsupported ${result.unsupported_claims.length}\nevidence: ${result.evidence_log_id || "not written"}`; }

  return {
    formatBrowserAccessibilityAudit,
    formatBrowserCompare,
    formatBrowserDomSearch,
    formatBrowserLinkMap,
    formatBrowserPageInspect,
    formatBrowserReadability,
    formatBrowserResearchPack,
    parseSafeResearchUrl,
    redactUrlString,
    safeBrowserAccessibilityAudit,
    safeBrowserCompareSnapshots,
    safeBrowserDomSearch,
    safeBrowserLinkMap,
    safeBrowserPageInspect,
    safeBrowserReadabilityExtract,
    safeBrowserResearchPack,
    safeOptionalUrl,
    safeResearchBrief,
    safeSourceQualityCheck,
    significantTerms
  };
}
