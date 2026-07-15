import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";

const SCHEMA_VERSION = "2.0.0";
const DEFAULT_MAX_DOC_BYTES = 256 * 1024;
const DEFAULT_CONTEXT_CHARS = 12_000;
const DEFAULT_EXCERPT_CHARS = 8_000;
const DEFAULT_MAX_SECTIONS = 4;
const DEFAULT_OFFICIAL_MAX_AGE_SECONDS = 24 * 60 * 60;
const DEFAULT_COMMUNITY_MAX_AGE_SECONDS = 6 * 60 * 60;
const MAX_CACHE_ENTRIES = 40;
const MAX_REDIRECTS = 3;
const ALLOWED_CONTENT_TYPES = /(?:text\/(?:html|plain|markdown)|application\/(?:json|ld\+json|xhtml\+xml))/i;
const SENSITIVE_QUERY_KEY = /(?:token|secret|password|passwd|api[_-]?key|access[_-]?key|authorization|credential|cookie|session)/i;
const SECRET_VALUE_RE = /(?:bearer\s+[a-z0-9._~+/-]{8,}|github_pat_[a-z0-9_]{20,}|gh[pousr]_[a-z0-9_]{20,}|sk-[a-z0-9_-]{10,})/gi;
const NEGATIVE_CLAIM_RE = /\b(?:must\s+not|should\s+not|does\s+not|do\s+not|cannot|can't|never|no\s+longer|unsupported|removed|deprecated|disabled)\b/i;
const CLAIM_RE = /\b(?:must|should|required|requires?|supports?|supported|unsupported|use|uses|default|enabled|disabled|deprecated|removed|cannot|does\s+not|do\s+not|never|no\s+longer)\b/i;
const CLAIM_STOP_WORDS = new Set(["a", "an", "and", "are", "as", "at", "be", "by", "can", "cannot", "do", "does", "for", "from", "in", "is", "it", "may", "must", "no", "not", "of", "on", "or", "should", "the", "this", "to", "use", "uses", "using", "with"]);

export class DocumentationIntelligenceError extends Error {
  constructor(message, code = "documentation_intelligence_error", details = {}) {
    super(message);
    this.name = "DocumentationIntelligenceError";
    this.code = code;
    this.details = redactDeep(details);
  }
}

export const DOCUMENTATION_SOURCE_REGISTRY = deepFreeze({
  react: provider("React", "https://react.dev/reference/react", ["react.dev"], "react_docs", {
    aliases: ["reactjs"],
    topics: {
      hooks: "https://react.dev/reference/react/hooks",
      components: "https://react.dev/reference/react/components",
      performance: "https://react.dev/learn/render-and-commit",
      create_root: "https://react.dev/reference/react-dom/client/createRoot"
    },
    preferred_headings: ["reference", "usage", "parameters", "caveats"]
  }),
  next: provider("Next.js", "https://nextjs.org/docs", ["nextjs.org"], "next_docs", { aliases: ["nextjs", "next.js"], preferred_headings: ["app router", "pages router", "version"] }),
  vite: provider("Vite", "https://vite.dev/guide/", ["vite.dev"], "vite_docs", { preferred_headings: ["getting started", "config", "features"] }),
  node: provider("Node.js", "https://nodejs.org/docs/latest/api/", ["nodejs.org"], "node_docs", { aliases: ["node", "nodejs"], preferred_headings: ["class", "method", "history version changes"] }),
  typescript: provider("TypeScript", "https://www.typescriptlang.org/docs/", ["typescriptlang.org", "www.typescriptlang.org"], "typescript_docs", { aliases: ["ts"], preferred_headings: ["handbook", "reference", "release notes"] }),
  mdn: provider("MDN Web Docs", "https://developer.mozilla.org/en-US/docs/Web", ["developer.mozilla.org"], "mdn_docs", { aliases: ["mozilla", "web api", "web platform"], preferred_headings: ["syntax", "parameters", "return value", "browser compatibility"] }),
  tailwind: provider("Tailwind CSS", "https://tailwindcss.com/docs/installation/using-vite", ["tailwindcss.com"], "tailwind_docs", { aliases: ["tailwindcss"] }),
  shadcn: provider("shadcn/ui", "https://ui.shadcn.com/docs", ["ui.shadcn.com"], "shadcn_docs", { aliases: ["shadcn-ui", "shadcn ui"] }),
  playwright: provider("Playwright", "https://playwright.dev/docs/intro", ["playwright.dev"], "playwright_docs"),
  cloudflare: provider("Cloudflare", "https://developers.cloudflare.com/", ["developers.cloudflare.com"], "cloudflare_docs", { aliases: ["cloudflare pages", "cloudflare workers"] }),
  github: provider("GitHub Docs", "https://docs.github.com/", ["docs.github.com"], "github_docs", { aliases: ["github"] }),
  npm: provider("npm Docs", "https://docs.npmjs.com/", ["docs.npmjs.com"], "npm_docs", { aliases: ["npmjs"] }),
  phaser: provider("Phaser", "https://docs.phaser.io/phaser/getting-started/what-is-phaser", ["docs.phaser.io"], "generic_official_docs"),
  pixi: provider("PixiJS", "https://pixijs.com/8.x/guides", ["pixijs.com"], "generic_official_docs", { aliases: ["pixijs", "pixi.js"] }),
  three: provider("Three.js", "https://threejs.org/docs/index.html#manual/en/introduction/Creating-a-scene", ["threejs.org"], "generic_official_docs", { aliases: ["threejs", "three.js"] }),
  babylon: provider("Babylon.js", "https://doc.babylonjs.com/", ["doc.babylonjs.com", "babylonjs.com"], "generic_official_docs", { aliases: ["babylonjs", "babylon.js"] }),
  excalibur: provider("Excalibur", "https://excaliburjs.com/docs/", ["excaliburjs.com"], "generic_official_docs"),
  matter: provider("Matter.js", "https://brm.io/matter-js/docs/", ["brm.io"], "generic_official_docs", { aliases: ["matterjs", "matter.js"] }),
  rapier: provider("Rapier", "https://rapier.rs/docs/user_guides/javascript/getting_started_js", ["rapier.rs"], "generic_official_docs"),
  luau: provider("Luau", "https://luau.org/getting-started", ["luau.org"], "luau_docs", { aliases: ["roblox luau"] })
});

export class DocumentationCache {
  constructor(options = {}) {
    this.cachePath = options.cachePath ? path.resolve(options.cachePath) : null;
    this.maxEntries = clamp(options.maxEntries, 1, 100, MAX_CACHE_ENTRIES);
    this.now = options.now || (() => Date.now());
    this.entries = new Map();
    this.loaded = false;
  }

  async get(url) {
    await this.load();
    return clone(this.entries.get(cacheKey(url)) || null);
  }

  async put(entry) {
    await this.load();
    const normalized = sanitizeCacheEntry(entry);
    this.entries.set(cacheKey(normalized.url), normalized);
    while (this.entries.size > this.maxEntries) {
      const oldest = [...this.entries.entries()].sort((left, right) => Date.parse(left[1].validated_at || left[1].fetched_at || 0) - Date.parse(right[1].validated_at || right[1].fetched_at || 0))[0];
      if (!oldest) break;
      this.entries.delete(oldest[0]);
    }
    await this.persist();
    return clone(normalized);
  }

  async touch(url, updates = {}) {
    const current = await this.get(url);
    if (!current) return null;
    return this.put({ ...current, ...updates, url: current.url });
  }

  async status(filters = {}) {
    await this.load();
    const now = this.now();
    const library = normalizeKey(filters.library || "");
    const url = filters.url ? cacheKey(filters.url) : "";
    const maxAgeSeconds = clamp(filters.max_age_seconds, 0, 30 * 24 * 60 * 60, DEFAULT_OFFICIAL_MAX_AGE_SECONDS);
    const entries = [...this.entries.values()].filter((entry) => (!library || normalizeKey(entry.library) === library) && (!url || cacheKey(entry.url) === url)).map((entry) => cacheStatusRecord(entry, now, maxAgeSeconds));
    return {
      schema_version: SCHEMA_VERSION,
      operation_result: "documentation_cache_inspected",
      cache_path: this.cachePath,
      persistent: Boolean(this.cachePath),
      entry_count: entries.length,
      stale_count: entries.filter((entry) => entry.stale).length,
      entries
    };
  }

  async load() {
    if (this.loaded) return;
    this.loaded = true;
    if (!this.cachePath) return;
    try {
      const parsed = JSON.parse(await readFile(this.cachePath, "utf8"));
      if (parsed?.schema_version !== SCHEMA_VERSION || !Array.isArray(parsed.entries)) return;
      for (const entry of parsed.entries.slice(-this.maxEntries)) {
        try {
          const normalized = sanitizeCacheEntry(entry);
          this.entries.set(cacheKey(normalized.url), normalized);
        } catch {
          // Ignore malformed cache records rather than trusting partial metadata.
        }
      }
    } catch (error) {
      if (error?.code !== "ENOENT") throw new DocumentationIntelligenceError("Documentation cache could not be read.", "documentation_cache_read_failed", { message: error?.message });
    }
  }

  async persist() {
    if (!this.cachePath) return;
    await mkdir(path.dirname(this.cachePath), { recursive: true });
    const payload = `${JSON.stringify({ schema_version: SCHEMA_VERSION, written_at: new Date(this.now()).toISOString(), entries: [...this.entries.values()] }, null, 2)}\n`;
    if (Buffer.byteLength(payload) > 16 * 1024 * 1024) throw new DocumentationIntelligenceError("Documentation cache exceeds its storage bound.", "documentation_cache_too_large");
    const temp = `${this.cachePath}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temp, payload, { encoding: "utf8", mode: 0o600, flag: "wx" });
    try {
      await rename(temp, this.cachePath);
    } catch (error) {
      if (process.platform !== "win32" || !["EEXIST", "EPERM"].includes(error?.code)) throw error;
      await unlink(this.cachePath).catch((unlinkError) => { if (unlinkError?.code !== "ENOENT") throw unlinkError; });
      await rename(temp, this.cachePath);
    } finally {
      await unlink(temp).catch(() => {});
    }
  }
}

export class DocumentationContextStore {
  constructor(options = {}) {
    this.maxEntries = clamp(options.maxEntries, 1, 200, 50);
    this.now = options.now || (() => Date.now());
    this.records = new Map();
  }

  recordFetch({ workerId = "default", taskId = "default", documentation }) {
    if (!documentation) throw new DocumentationIntelligenceError("documentation is required.", "missing_documentation");
    const key = this.key(workerId, taskId, documentation.library, documentation.topic || documentation.url);
    const record = { worker_id: workerId, task_id: taskId, recorded_at: new Date(this.now()).toISOString(), documentation: clone(documentation) };
    this.records.set(key, record);
    while (this.records.size > this.maxEntries) this.records.delete(this.records.keys().next().value);
    return clone(record);
  }

  list({ workerId, taskId, library, includeCommunity = true } = {}) {
    return [...this.records.values()].filter((record) => {
      if (workerId && record.worker_id !== workerId) return false;
      if (taskId && record.task_id !== taskId) return false;
      if (library && normalizeKey(record.documentation.library) !== normalizeKey(library) && normalizeKey(record.documentation.requested_library) !== normalizeKey(library)) return false;
      if (!includeCommunity && record.documentation.source_classification?.official !== true) return false;
      return true;
    }).map(clone);
  }

  hasDocumentation({ workerId, taskId, library, requireReady = true } = {}) {
    return this.list({ workerId, taskId, library }).some((record) => !requireReady || record.documentation.implementation_readiness?.ready === true);
  }

  contradictions(filters = {}) {
    return detectDocumentationContradictions(this.list(filters).map((record) => record.documentation));
  }

  buildContextInjection({ workerId, taskId, library, includeCommunity = true, maxContextChars = DEFAULT_CONTEXT_CHARS } = {}) {
    const documents = this.list({ workerId, taskId, library, includeCommunity }).map((record) => record.documentation);
    return buildDocumentationInjection(documents, { maxChars: maxContextChars, contradictions: detectDocumentationContradictions(documents) });
  }

  key(workerId, taskId, library, topic) {
    return [workerId, taskId, normalizeKey(library), normalizeKey(topic || "")].join("::");
  }
}

export function documentationSourceCatalog(filters = {}) {
  const library = normalizeKey(filters.library || "");
  const sources = Object.entries(DOCUMENTATION_SOURCE_REGISTRY).filter(([id, entry]) => !library || [id, entry.name, ...(entry.aliases || [])].map(normalizeKey).includes(library)).map(([id, entry]) => ({
    id,
    name: entry.name,
    canonical_url: entry.url,
    official_domains: [...entry.official_domains],
    provider_adapter: entry.provider_adapter,
    aliases: [...(entry.aliases || [])],
    topics: clone(entry.topics || {}),
    source_classification: "official_registry"
  }));
  return {
    schema_version: SCHEMA_VERSION,
    operation_result: "documentation_sources_cataloged",
    source_count: sources.length,
    sources,
    provider_adapters: [...new Set(sources.map((source) => source.provider_adapter))].sort(),
    url_policy: {
      protocols: ["https"],
      credentials_in_url: "blocked",
      sensitive_query_parameters: "blocked",
      private_or_ip_literal_hosts: "blocked",
      redirects: "maximum 3; same official provider or same community origin",
      unknown_domains: "require allow_community=true and remain non-authoritative"
    },
    authority_policy: "Official status comes from an exact registry-domain match, not caller labels or HTTP success.",
    currentness_policy: "Fresh validation, cache age, source date, requested version evidence, and deprecation signals are reported separately. HTTP success alone is never currentness proof."
  };
}

export async function fetchDocumentation(options = {}) {
  const now = options.now || (() => Date.now());
  const source = resolveDocumentationSource(options.library, options.topic, options.url, options.allowCommunity === true);
  const maxBytes = clamp(options.maxBytes, 1024, 512_000, DEFAULT_MAX_DOC_BYTES);
  const excerptChars = clamp(options.contextChars, 1_000, DEFAULT_CONTEXT_CHARS, DEFAULT_EXCERPT_CHARS);
  const maxSections = clamp(options.maxSections, 1, 8, DEFAULT_MAX_SECTIONS);
  const cacheMode = normalizeCacheMode(options.cacheMode);
  const maxAgeSeconds = clamp(options.maxAgeSeconds, 0, 30 * 24 * 60 * 60, source.official ? DEFAULT_OFFICIAL_MAX_AGE_SECONDS : DEFAULT_COMMUNITY_MAX_AGE_SECONDS);
  const cache = options.cache || new DocumentationCache({ now });
  const cached = await cache.get(source.fetch_url);
  const cachedStatus = cached ? cacheStatusRecord(cached, now(), maxAgeSeconds) : null;

  if (cacheMode === "cache_only") {
    if (!cached) throw new DocumentationIntelligenceError("No cached documentation matches this source.", "documentation_cache_miss", { url: source.public_url });
    return materializeResult(cached, source, options, { cacheStatus: cachedStatus.stale ? "cache_only_stale" : "cache_only_fresh", now, maxAgeSeconds, excerptChars, maxSections, network: false });
  }
  if (cacheMode === "prefer_fresh" && cached && !cachedStatus.stale) {
    return materializeResult(cached, source, options, { cacheStatus: "fresh_cache_hit", now, maxAgeSeconds, excerptChars, maxSections, network: false });
  }

  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new DocumentationIntelligenceError("No fetch implementation is available in this runtime.", "fetch_unavailable");
  const requestHeaders = {
    accept: "text/markdown,text/plain,text/html,application/json;q=0.9,*/*;q=0.2",
    "user-agent": "vnem-current-docs/2.0"
  };
  if (cached?.etag) requestHeaders["if-none-match"] = cached.etag;
  if (cached?.last_modified) requestHeaders["if-modified-since"] = cached.last_modified;
  const fetched = await fetchWithPolicy(source, fetchImpl, requestHeaders, options.timeoutMs || 15_000);

  if (fetched.response.status === 304) {
    if (!cached) throw new DocumentationIntelligenceError("Documentation server returned 304 without a cached body.", "documentation_cache_revalidation_missing", { url: source.public_url });
    const validatedAt = new Date(now()).toISOString();
    const updated = await cache.put({
      ...cached,
      url: fetched.final_url,
      validated_at: validatedAt,
      etag: headerValue(fetched.response.headers, "etag") || cached.etag,
      last_modified: headerValue(fetched.response.headers, "last-modified") || cached.last_modified
    });
    return materializeResult(updated, { ...source, public_url: fetched.final_url, fetch_url: fetched.final_url }, options, {
      cacheStatus: "revalidated_not_modified",
      now,
      maxAgeSeconds,
      excerptChars,
      maxSections,
      network: true,
      redirects: fetched.redirects,
      conditional: conditionalEvidence(requestHeaders)
    });
  }
  if (!fetched.response.ok) throw new DocumentationIntelligenceError(`Documentation fetch returned HTTP ${fetched.response.status || "unknown"}.`, "documentation_fetch_http_error", { url: fetched.final_url, status: fetched.response.status || null });

  const contentType = headerValue(fetched.response.headers, "content-type") || "unknown";
  if (contentType !== "unknown" && !ALLOWED_CONTENT_TYPES.test(contentType)) throw new DocumentationIntelligenceError("Documentation response content type is not textual documentation.", "documentation_content_type_blocked", { content_type: contentType });
  const raw = await readBoundedResponse(fetched.response, maxBytes);
  const rawText = raw.toString("utf8");
  const normalized = normalizeDocumentationText(rawText, contentType);
  if (!normalized.trim()) throw new DocumentationIntelligenceError("Documentation response did not contain usable text.", "documentation_content_empty");
  const sourceDate = detectSourceDate(rawText, normalized, fetched.response.headers, now());
  const redactedText = redactDocumentationText(normalized);
  const validatedAt = new Date(now()).toISOString();
  const record = await cache.put({
    schema_version: SCHEMA_VERSION,
    library: source.library,
    requested_library: options.library || null,
    topic: options.topic || null,
    url: fetched.final_url,
    fetched_at: validatedAt,
    validated_at: validatedAt,
    source_date: sourceDate.value,
    source_date_basis: sourceDate.basis,
    content_type: contentType,
    bytes: raw.length,
    content_sha256: sha256(redactedText),
    normalized_text: redactedText,
    etag: headerValue(fetched.response.headers, "etag") || null,
    last_modified: headerValue(fetched.response.headers, "last-modified") || null,
    source_classification: sourceClassification(source),
    redaction_applied: redactedText !== normalized
  });
  return materializeResult(record, { ...source, public_url: fetched.final_url, fetch_url: fetched.final_url }, options, {
    cacheStatus: cached ? "cache_refreshed_changed_or_unvalidated" : "network_fetched",
    now,
    maxAgeSeconds,
    excerptChars,
    maxSections,
    network: true,
    redirects: fetched.redirects,
    conditional: conditionalEvidence(requestHeaders)
  });
}

export function detectDocumentationContradictions(documents = []) {
  const claims = documents.flatMap((document, documentIndex) => extractClaims(document).map((claim) => ({ ...claim, document, documentIndex })));
  const contradictions = [];
  for (let leftIndex = 0; leftIndex < claims.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < claims.length; rightIndex += 1) {
      const left = claims[leftIndex];
      const right = claims[rightIndex];
      if (left.document.url === right.document.url || left.polarity === right.polarity) continue;
      if (normalizeKey(left.document.library) !== normalizeKey(right.document.library) && normalizeKey(left.document.requested_library) !== normalizeKey(right.document.requested_library)) continue;
      const similarity = jaccard(left.tokens, right.tokens);
      if (similarity < 0.62) continue;
      const preferred = preferredDocument(left.document, right.document);
      contradictions.push({
        id: `docs-contradiction-${sha256(`${left.document.url}\0${left.text}\0${right.document.url}\0${right.text}`).slice(0, 12)}`,
        similarity: Number(similarity.toFixed(3)),
        topic_fingerprint: [...new Set([...left.tokens].filter((token) => right.tokens.has(token)))].slice(0, 12),
        claims: [claimSummary(left), claimSummary(right)],
        preferred_source_url: preferred?.url || null,
        resolution_status: preferred ? "prefer_stronger_source_but_review_semantics" : "manual_review_required",
        must_not_claim: "Lexical polarity detection proves which claim is semantically correct."
      });
      if (contradictions.length >= 20) return contradictions;
    }
  }
  return contradictions;
}

export function buildDocumentationInjection(documents, options = {}) {
  const maxChars = clamp(options.maxChars, 1_000, 24_000, DEFAULT_CONTEXT_CHARS);
  const docs = [...(documents || [])].filter(Boolean).sort(compareDocumentPriority);
  if (!docs.length) return "";
  const contradictions = options.contradictions || detectDocumentationContradictions(docs);
  const lines = [
    "# VNEM Dynamic Documentation Injection",
    "",
    "Use only the bounded relevant sections below. Keep source authority, validation time, source date, requested-version evidence, and contradictions attached to claims.",
    ""
  ];
  docs.forEach((doc, index) => {
    lines.push(`## ${index + 1}. ${doc.library}${doc.topic ? ` - ${doc.topic}` : ""}`);
    lines.push(`Source: ${doc.url}`);
    lines.push(`Classification: ${doc.source_classification?.type || "unknown"}; official=${doc.source_classification?.official === true}`);
    lines.push(`Validated: ${doc.validated_at || doc.fetched_at || "unknown"}; source date: ${doc.source_date || "not exposed"}; stale=${doc.freshness?.stale === true}`);
    lines.push(`Content SHA-256: ${doc.content_sha256 || doc.sha256 || "unknown"}`);
    if (doc.version_relevance?.requested) lines.push(`Requested version: ${doc.version_relevance.requested}; evidence=${doc.version_relevance.status}`);
    lines.push("");
    lines.push(truncate(doc.excerpt || "", Math.max(600, Math.floor(maxChars / Math.max(1, docs.length)) - 500)));
    lines.push("");
  });
  if (contradictions.length) {
    lines.push("## Contradictions requiring review", "");
    for (const item of contradictions.slice(0, 8)) lines.push(`- ${item.claims[0].text} <> ${item.claims[1].text} (${item.resolution_status})`);
  }
  lines.push("", "Full pages were not injected. A successful response alone is not authority or currentness proof.");
  return boundContext(lines.join("\n").trim(), maxChars);
}

function materializeResult(entry, source, options, evidence) {
  const selected = extractRelevantSections(entry.normalized_text, {
    topic: options.topic,
    query: options.query,
    version: options.version,
    preferredHeadings: source.preferred_headings,
    maxSections: evidence.maxSections,
    maxChars: evidence.excerptChars
  });
  const age = cacheAgeSeconds(entry, evidence.now());
  const stale = evidence.maxAgeSeconds === 0 || age > evidence.maxAgeSeconds;
  const versionRelevance = assessVersionRelevance(options.version, `${selected.excerpt}\n${entry.normalized_text.slice(0, 4_000)}`);
  const deprecatedSignals = selected.excerpt.match(/\b(?:deprecated|legacy|no longer supported|removed in)\b/gi) || [];
  const classification = sourceClassification(source, entry.source_classification);
  const authoritative = classification.official === true;
  const currentPathValidated = authoritative && !stale && evidence.cacheStatus !== "cache_only_stale";
  const currentContentDated = Boolean(entry.source_date) || versionRelevance.status === "matched";
  const versionReady = !options.version || versionRelevance.status === "matched";
  const ready = authoritative && !stale && versionReady && deprecatedSignals.length === 0;
  const document = {
    schema_version: SCHEMA_VERSION,
    library: source.library || entry.library,
    requested_library: options.library || entry.requested_library || null,
    topic: options.topic || entry.topic || null,
    query: options.query || null,
    version: options.version || null,
    url: source.public_url || entry.url,
    fetched_at: entry.fetched_at,
    validated_at: entry.validated_at,
    source_date: entry.source_date || null,
    source_date_basis: entry.source_date_basis || "not_exposed",
    content_type: entry.content_type,
    bytes: entry.bytes,
    sha256: entry.content_sha256,
    content_sha256: entry.content_sha256,
    extracted_sha256: sha256(selected.excerpt),
    excerpt: selected.excerpt,
    sections: selected.sections,
    full_page_returned: false,
    source_classification: classification,
    freshness: {
      cache_status: evidence.cacheStatus,
      cache_age_seconds: age,
      max_age_seconds: evidence.maxAgeSeconds,
      stale,
      etag: entry.etag || null,
      last_modified: entry.last_modified || null,
      conditional_request: evidence.conditional || conditionalEvidence({}),
      network_request_made: evidence.network === true,
      redirects: evidence.redirects || []
    },
    version_relevance: versionRelevance,
    authority: {
      authoritative,
      authority_basis: classification.authority_basis,
      current_path_freshly_validated: currentPathValidated,
      source_content_date_or_version_proven: currentContentDated,
      http_success_alone_sufficient: false
    },
    implementation_readiness: {
      ready,
      status: ready ? "official_fresh_context_ready_with_reported_limits" : "not_ready_for_unqualified_implementation_claim",
      blockers: [!authoritative ? "source_not_official" : null, stale ? "cache_stale" : null, !versionReady ? "requested_version_not_observed" : null, deprecatedSignals.length ? "deprecated_or_removed_signal" : null].filter(Boolean)
    },
    redaction: { applied: entry.redaction_applied === true, raw_credentials_returned: false }
  };
  const contextInjection = buildDocumentationInjection([document], { maxChars: evidence.excerptChars });
  return {
    ok: true,
    operation_result: "current_documentation_retrieved",
    documentation: document,
    context_injection: contextInjection,
    context_chars: contextInjection.length,
    cache: { status: evidence.cacheStatus, timestamp: entry.validated_at, content_sha256: entry.content_sha256 },
    safe_to_claim: [authoritative ? "The final URL matches a VNEM registry official domain." : "The source was fetched as community or unknown and is not authoritative.", `The bounded content was validated at ${entry.validated_at}.`, entry.source_date ? `The source exposed date ${entry.source_date}.` : "The source did not expose a trustworthy content date."],
    must_not_claim: ["HTTP success proves authority or currentness.", "The context contains the full page.", "No contradiction means all documentation agrees.", versionRelevance.status !== "matched" && options.version ? `The page proves requested version ${options.version}.` : null].filter(Boolean),
    policy: "Inject this concise context before framework-specific changes, retain URL/date/hash metadata, and revalidate stale records."
  };
}

function provider(name, url, officialDomains, providerAdapter, options = {}) {
  return { name, url, official_domains: officialDomains, provider_adapter: providerAdapter, aliases: options.aliases || [], topics: options.topics || {}, preferred_headings: options.preferred_headings || [] };
}

function resolveDocumentationSource(library, topic, suppliedUrl, allowCommunity) {
  const requestedKey = normalizeKey(library || "");
  const registryMatch = Object.entries(DOCUMENTATION_SOURCE_REGISTRY).find(([id, entry]) => [id, entry.name, ...(entry.aliases || [])].map(normalizeKey).includes(requestedKey));
  if (!suppliedUrl && !registryMatch) throw new DocumentationIntelligenceError("Unknown documentation source. Provide a specific HTTPS URL and explicitly allow community/unknown sources if needed.", "unknown_documentation_source", { library });
  let rawUrl;
  let matched = registryMatch;
  if (suppliedUrl) {
    const parsed = assertSafeDocumentationUrl(suppliedUrl);
    const byDomain = Object.entries(DOCUMENTATION_SOURCE_REGISTRY).find(([, entry]) => entry.official_domains.some((domain) => hostMatches(parsed.hostname, domain)));
    if (byDomain) matched = byDomain;
    else if (!allowCommunity) throw new DocumentationIntelligenceError("Unknown documentation domains require allow_community=true and remain non-authoritative.", "documentation_community_approval_required", { host: parsed.hostname });
    else matched = null;
    rawUrl = parsed.toString();
  } else {
    const [, entry] = registryMatch;
    const topicKey = normalizeKey(topic || "");
    rawUrl = topicKey && entry.topics ? Object.entries(entry.topics).find(([name]) => normalizeKey(name) === topicKey)?.[1] || entry.url : entry.url;
  }
  const parsed = assertSafeDocumentationUrl(rawUrl);
  const entry = matched?.[1] || null;
  const official = Boolean(entry && entry.official_domains.some((domain) => hostMatches(parsed.hostname, domain)));
  const publicUrl = parsed.toString();
  parsed.hash = "";
  return {
    library: entry?.name || library || parsed.hostname,
    requested_library: library || null,
    public_url: publicUrl,
    fetch_url: parsed.toString(),
    official,
    provider_id: matched?.[0] || null,
    provider_adapter: entry?.provider_adapter || "generic_community_docs",
    official_domains: entry?.official_domains || [],
    preferred_headings: entry?.preferred_headings || [],
    authority_basis: official ? "exact_registry_domain_match" : "community_or_unknown_domain"
  };
}

async function fetchWithPolicy(source, fetchImpl, headers, timeoutMs) {
  const startedUrl = source.fetch_url;
  let current = startedUrl;
  const redirects = [];
  for (let attempt = 0; attempt <= MAX_REDIRECTS; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), clamp(timeoutMs, 1_000, 60_000, 15_000));
    let response;
    try {
      response = await fetchImpl(current, { method: "GET", redirect: "manual", signal: controller.signal, headers });
    } catch (error) {
      const code = error?.name === "AbortError" ? "documentation_fetch_timeout" : "documentation_fetch_failed";
      throw new DocumentationIntelligenceError("Documentation fetch failed.", code, { url: current, message: error?.message || String(error) });
    } finally {
      clearTimeout(timer);
    }
    if (![301, 302, 303, 307, 308].includes(response.status)) return { response, final_url: current, redirects };
    if (attempt === MAX_REDIRECTS) throw new DocumentationIntelligenceError("Documentation redirect limit exceeded.", "documentation_redirect_limit", { redirects });
    const location = headerValue(response.headers, "location");
    if (!location) throw new DocumentationIntelligenceError("Documentation redirect omitted Location.", "documentation_redirect_invalid");
    const next = assertSafeDocumentationUrl(new URL(location, current).toString());
    const currentUrl = new URL(current);
    const sameAuthority = source.official ? source.official_domains.some((domain) => hostMatches(next.hostname, domain)) : next.origin === currentUrl.origin;
    if (!sameAuthority) throw new DocumentationIntelligenceError("Documentation redirect crossed its approved source boundary.", "documentation_redirect_origin_blocked", { from: current, to: next.toString() });
    redirects.push({ status: response.status, from: current, to: next.toString() });
    next.hash = "";
    current = next.toString();
  }
  throw new DocumentationIntelligenceError("Documentation fetch did not resolve.", "documentation_fetch_failed");
}

function assertSafeDocumentationUrl(value) {
  let url;
  try { url = new URL(value); }
  catch { throw new DocumentationIntelligenceError("Documentation URL is invalid.", "invalid_documentation_url", { url: value }); }
  if (url.protocol !== "https:") throw new DocumentationIntelligenceError("Documentation URL must use HTTPS.", "documentation_url_not_https", { url: value });
  if (url.username || url.password) throw new DocumentationIntelligenceError("Documentation URL must not contain credentials.", "documentation_url_credentials_blocked");
  if (url.port && url.port !== "443") throw new DocumentationIntelligenceError("Documentation URL uses a non-standard port.", "documentation_url_port_blocked", { port: url.port });
  const host = url.hostname.toLowerCase();
  if (net.isIP(host) || host === "localhost" || host.endsWith(".local") || host.endsWith(".localhost") || host === "0.0.0.0") throw new DocumentationIntelligenceError("Documentation URL points at a local, private, or IP-literal host.", "private_host_blocked", { host });
  if ([...url.searchParams.keys()].some((key) => SENSITIVE_QUERY_KEY.test(key))) throw new DocumentationIntelligenceError("Documentation URL contains a sensitive query parameter.", "documentation_url_sensitive_query_blocked");
  if (url.toString().length > 2_048) throw new DocumentationIntelligenceError("Documentation URL exceeds its length bound.", "documentation_url_too_long");
  return url;
}

async function readBoundedResponse(response, maxBytes) {
  const declared = Number(headerValue(response.headers, "content-length") || 0);
  if (Number.isFinite(declared) && declared > maxBytes) throw new DocumentationIntelligenceError("Documentation response exceeds the configured byte limit.", "documentation_too_large", { declared_bytes: declared, max_bytes: maxBytes });
  if (response.body?.getReader) {
    const reader = response.body.getReader();
    const chunks = [];
    let bytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new DocumentationIntelligenceError("Documentation response exceeds the configured byte limit.", "documentation_too_large", { max_bytes: maxBytes });
      }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks);
  }
  if (typeof response.arrayBuffer === "function") {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maxBytes) throw new DocumentationIntelligenceError("Documentation response exceeds the configured byte limit.", "documentation_too_large", { max_bytes: maxBytes });
    return buffer;
  }
  const buffer = Buffer.from(await response.text(), "utf8");
  if (buffer.length > maxBytes) throw new DocumentationIntelligenceError("Documentation response exceeds the configured byte limit.", "documentation_too_large", { max_bytes: maxBytes });
  return buffer;
}

function normalizeDocumentationText(rawText, contentType) {
  if (/html|xhtml/i.test(contentType) || /<html|<!doctype html/i.test(rawText)) {
    return decodeHtmlEntities(rawText)
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
      .replace(/<!--([\s\S]*?)-->/g, " ")
      .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_match, level, body) => `\n${"#".repeat(Number(level))} ${stripTags(body)}\n`)
      .replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_match, body) => `\n\n${stripTags(body)}\n\n`)
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|section|article|main|aside|header|footer|nav|li|tr)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
  if (/json/i.test(contentType)) {
    try { return JSON.stringify(JSON.parse(rawText), null, 2); } catch { /* keep bounded source text */ }
  }
  return rawText.replace(/\r\n/g, "\n").replace(/[ \t]+$/gm, "").replace(/\n{4,}/g, "\n\n\n").trim();
}

function extractRelevantSections(text, options = {}) {
  const sections = sectionize(text);
  const queryText = [options.topic, options.query, options.version, ...(options.preferredHeadings || [])].filter(Boolean).join(" ");
  const terms = meaningfulTerms(queryText);
  const phrase = normalizeKey([options.topic, options.query].filter(Boolean).join(" "));
  const scored = sections.map((section) => {
    const headingLower = section.heading.toLowerCase();
    const bodyLower = section.text.toLowerCase();
    const matched = terms.filter((term) => headingLower.includes(term) || bodyLower.includes(term));
    let score = matched.reduce((sum, term) => sum + (headingLower.includes(term) ? 5 : 1), 0);
    if (phrase && normalizeKey(`${section.heading} ${section.text}`).includes(phrase)) score += 10;
    if ((options.preferredHeadings || []).some((heading) => headingLower.includes(String(heading).toLowerCase()))) score += 1;
    return { ...section, score, matched_terms: matched };
  });
  const maxSections = clamp(options.maxSections, 1, 8, DEFAULT_MAX_SECTIONS);
  const selected = (terms.length ? scored.sort((left, right) => right.score - left.score || left.index - right.index) : scored).slice(0, maxSections).sort((left, right) => left.index - right.index);
  const outputSections = selected.map((section) => ({ heading: section.heading, level: section.level, source_order: section.index, relevance_score: section.score, matched_terms: section.matched_terms, excerpt: truncate(section.text, 2_500) }));
  const excerpt = boundContext(outputSections.map((section) => `${"#".repeat(Math.max(2, section.level || 2))} ${section.heading}\n${section.excerpt}`).join("\n\n"), clamp(options.maxChars, 1_000, DEFAULT_CONTEXT_CHARS, DEFAULT_EXCERPT_CHARS));
  return { sections: outputSections, excerpt };
}

function sectionize(text) {
  const lines = String(text || "").split("\n");
  const sections = [];
  let current = { heading: "Overview", level: 1, lines: [], index: 0 };
  const flush = () => {
    const body = current.lines.join("\n").trim();
    if (body) sections.push({ heading: current.heading, level: current.level, text: body, index: current.index });
  };
  for (const line of lines) {
    const match = line.match(/^(#{1,6})\s+(.{1,240})$/);
    if (match) {
      flush();
      current = { heading: match[2].trim(), level: match[1].length, lines: [], index: sections.length };
    } else {
      current.lines.push(line);
    }
  }
  flush();
  if (sections.length) return sections.slice(0, 200);
  return String(text || "").split(/\n\s*\n/).filter(Boolean).slice(0, 200).map((body, index) => ({ heading: index ? `Section ${index + 1}` : "Overview", level: 2, text: truncate(body.trim(), 3_000), index }));
}

function detectSourceDate(rawText, normalizedText, headers, nowMs) {
  const candidates = [
    { value: headerValue(headers, "last-modified"), basis: "http_last_modified" },
    { value: rawText.match(/(?:article:modified_time|dateModified|datePublished)[^>\n]{0,160}(?:content=|[:=]\s*)["']?([^"'<>\n,}]{6,50})/i)?.[1], basis: "document_metadata" },
    { value: normalizedText.match(/\b(?:last updated|updated|modified|published)\s*(?:on|:)?\s*([A-Z][a-z]+\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2})/i)?.[1], basis: "visible_date_marker" }
  ];
  for (const candidate of candidates) {
    const time = Date.parse(candidate.value || "");
    if (Number.isFinite(time) && time >= Date.UTC(1990, 0, 1) && time <= nowMs + 86_400_000) return { value: new Date(time).toISOString(), basis: candidate.basis };
  }
  return { value: null, basis: "not_exposed" };
}

function assessVersionRelevance(requested, text) {
  if (!requested) return { requested: null, status: "not_requested", observed_tokens: [] };
  const tokens = String(requested).match(/\d+(?:\.\d+){0,2}|[a-z][a-z0-9_-]{1,30}/gi) || [];
  const observed = tokens.filter((token) => new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(token)}(?:$|[^a-z0-9])`, "i").test(text));
  return { requested: String(requested), status: observed.length === tokens.length && tokens.length ? "matched" : observed.length ? "partial" : "not_observed", observed_tokens: observed };
}

function extractClaims(document) {
  const text = (document.sections || []).map((section) => section.excerpt).join(" ") || document.excerpt || "";
  return text.split(/(?<=[.!?])\s+|\n+/).map((sentence) => sentence.replace(/^#+\s*/, "").trim()).filter((sentence) => sentence.length >= 18 && sentence.length <= 500 && CLAIM_RE.test(sentence)).slice(0, 80).map((sentence) => ({
    text: truncate(sentence, 320),
    polarity: NEGATIVE_CLAIM_RE.test(sentence) ? "negative" : "positive",
    tokens: new Set(meaningfulTerms(sentence).filter((token) => !CLAIM_STOP_WORDS.has(token)))
  })).filter((claim) => claim.tokens.size >= 2);
}

function claimSummary(claim) {
  return { text: claim.text, polarity: claim.polarity, source_url: claim.document.url, source_date: claim.document.source_date || null, official: claim.document.source_classification?.official === true, validated_at: claim.document.validated_at || null };
}

function preferredDocument(left, right) {
  const leftScore = documentPriority(left);
  const rightScore = documentPriority(right);
  return leftScore === rightScore ? null : leftScore > rightScore ? left : right;
}

function compareDocumentPriority(left, right) {
  return documentPriority(right) - documentPriority(left) || String(right.validated_at || "").localeCompare(String(left.validated_at || ""));
}

function documentPriority(document) {
  return (document.source_classification?.official ? 100 : 0) + (document.freshness?.stale ? -30 : 20) + (document.source_date ? 5 : 0) + (document.version_relevance?.status === "matched" ? 5 : 0);
}

function sourceClassification(source, cached = {}) {
  const official = source.official === true || cached?.official === true;
  return {
    type: official ? "official_registry" : "community_or_unknown",
    official,
    provider_id: source.provider_id || cached?.provider_id || null,
    provider_adapter: source.provider_adapter || cached?.provider_adapter || "generic_community_docs",
    domain: new URL(source.public_url || source.fetch_url).hostname,
    domain_match: official,
    authority_basis: official ? "exact_registry_domain_match" : "no_official_registry_domain_match",
    caller_label_trusted: false
  };
}

function sanitizeCacheEntry(entry) {
  if (!entry?.url || !entry?.content_sha256 || typeof entry.normalized_text !== "string") throw new DocumentationIntelligenceError("Documentation cache entry is incomplete.", "documentation_cache_entry_invalid");
  const normalizedText = redactDocumentationText(entry.normalized_text).slice(0, DEFAULT_MAX_DOC_BYTES);
  return {
    schema_version: SCHEMA_VERSION,
    library: truncate(String(entry.library || new URL(entry.url).hostname), 120),
    requested_library: entry.requested_library ? truncate(String(entry.requested_library), 120) : null,
    topic: entry.topic ? truncate(String(entry.topic), 240) : null,
    url: assertSafeDocumentationUrl(entry.url).toString(),
    fetched_at: validIso(entry.fetched_at),
    validated_at: validIso(entry.validated_at || entry.fetched_at),
    source_date: entry.source_date ? validIso(entry.source_date) : null,
    source_date_basis: truncate(String(entry.source_date_basis || "not_exposed"), 80),
    content_type: truncate(String(entry.content_type || "unknown"), 160),
    bytes: clamp(entry.bytes, 0, DEFAULT_MAX_DOC_BYTES, Buffer.byteLength(normalizedText)),
    content_sha256: String(entry.content_sha256),
    normalized_text: normalizedText,
    etag: entry.etag ? truncate(redactDocumentationText(String(entry.etag)), 300) : null,
    last_modified: entry.last_modified ? truncate(String(entry.last_modified), 160) : null,
    source_classification: redactDeep(entry.source_classification || {}),
    redaction_applied: entry.redaction_applied === true || normalizedText !== entry.normalized_text
  };
}

function cacheStatusRecord(entry, nowMs, maxAgeSeconds) {
  const age = cacheAgeSeconds(entry, nowMs);
  return {
    library: entry.library,
    url: entry.url,
    validated_at: entry.validated_at,
    source_date: entry.source_date,
    content_sha256: entry.content_sha256,
    etag: entry.etag,
    last_modified: entry.last_modified,
    cache_age_seconds: age,
    max_age_seconds: maxAgeSeconds,
    stale: maxAgeSeconds === 0 || age > maxAgeSeconds,
    official: entry.source_classification?.official === true
  };
}

function cacheAgeSeconds(entry, nowMs) {
  const timestamp = Date.parse(entry.validated_at || entry.fetched_at || "");
  return Number.isFinite(timestamp) ? Math.max(0, Math.floor((nowMs - timestamp) / 1_000)) : Number.MAX_SAFE_INTEGER;
}

function normalizeCacheMode(value) {
  const mode = String(value || "prefer_fresh").trim().toLowerCase();
  if (!["prefer_fresh", "refresh", "cache_only"].includes(mode)) throw new DocumentationIntelligenceError("Unknown documentation cache mode.", "documentation_cache_mode_invalid", { cache_mode: value });
  return mode;
}

function conditionalEvidence(headers) {
  return { if_none_match_sent: Boolean(headers["if-none-match"]), if_modified_since_sent: Boolean(headers["if-modified-since"]) };
}

function redactDocumentationText(value) {
  return String(value)
    .replace(SECRET_VALUE_RE, "[REDACTED]")
    .replace(/\b([A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|API_KEY|ACCESS_KEY)[A-Z0-9_]*)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s]+)/gi, "$1=[REDACTED]")
    .replace(/([?&](?:token|password|secret|api[-_]?key|access[-_]?key)=)[^&#\s]+/gi, "$1[REDACTED]");
}

function redactDeep(value) {
  if (typeof value === "string") return redactDocumentationText(value);
  if (Array.isArray(value)) return value.map(redactDeep);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, SENSITIVE_QUERY_KEY.test(key) ? "[REDACTED]" : redactDeep(child)]));
}

function meaningfulTerms(value) {
  return [...new Set(String(value || "").toLowerCase().match(/[a-z][a-z0-9_.-]{2,}/g) || [])].filter((token) => !CLAIM_STOP_WORDS.has(token)).slice(0, 40);
}

function jaccard(left, right) {
  if (!left.size || !right.size) return 0;
  const intersection = [...left].filter((token) => right.has(token)).length;
  return intersection / new Set([...left, ...right]).size;
}

function hostMatches(host, officialDomain) {
  return host.toLowerCase() === officialDomain.toLowerCase();
}

function cacheKey(url) {
  const parsed = new URL(url);
  parsed.hash = "";
  return parsed.toString();
}

function headerValue(headers, name) {
  if (!headers) return "";
  if (typeof headers.get === "function") return headers.get(name) || "";
  return headers[name] || headers[name.toLowerCase()] || "";
}

function decodeHtmlEntities(text) {
  return String(text)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_match, code) => safeCodePoint(Number.parseInt(code, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => safeCodePoint(Number.parseInt(code, 16)));
}

function stripTags(value) {
  return String(value).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function safeCodePoint(value) {
  try { return Number.isInteger(value) && value >= 0 && value <= 0x10ffff ? String.fromCodePoint(value) : ""; }
  catch { return ""; }
}

function boundContext(value, maxChars) {
  const text = String(value || "");
  if (text.length <= maxChars) return text;
  const suffix = "\n\n[VNEM context truncated at configured bound]";
  return `${text.slice(0, Math.max(0, maxChars - suffix.length)).trimEnd()}${suffix}`;
}

function validIso(value) {
  const timestamp = Date.parse(value || "");
  if (!Number.isFinite(timestamp)) throw new DocumentationIntelligenceError("Documentation timestamp is invalid.", "documentation_timestamp_invalid");
  return new Date(timestamp).toISOString();
}

function normalizeKey(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "").trim();
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function truncate(value, max) {
  const text = String(value || "");
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 18))}\n[VNEM truncated]`;
}

function clamp(value, min, max, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(min, Math.min(max, Math.floor(numeric))) : fallback;
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
