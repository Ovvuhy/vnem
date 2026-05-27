#!/usr/bin/env node
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = process.env.VNEM_ROOT
  ? path.resolve(process.env.VNEM_ROOT)
  : path.resolve(scriptDir, "..");

const TRUST_TIERS = ["verified", "promising", "unreviewed", "watchlist", "deprecated"];
const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false
};
const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "how",
  "i",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "this",
  "to",
  "use",
  "using",
  "we",
  "with"
]);

const packageJson = await readJsonOptional("package.json");
const searchIndexPath = firstExisting([
  "public/install/search-index.json",
  ".vnem/search-index.json"
]);
const apiIndexPath = firstExisting(["public/api/index.json"]);
const searchIndex = await readJsonRequired(searchIndexPath, "search index");
const apiIndex = apiIndexPath ? await readJsonOptional(apiIndexPath) : null;
const entries = Array.isArray(apiIndex?.entries) ? apiIndex.entries : [];
const documents = Array.isArray(searchIndex.documents) ? searchIndex.documents : [];
const sourceRadar = Array.isArray(searchIndex.source_radar) ? searchIndex.source_radar : [];
const entriesBySlug = new Map(entries.map((entry) => [entry.slug, entry]));
const documentsById = new Map(documents.map((document) => [document.id, document]));

const server = new McpServer(
  {
    name: "vnem",
    version: packageJson?.version || "0.1.0"
  },
  {
    instructions:
      "Use vnem as a read-only perception layer before recommending agentic tools, MCP servers, skills, memory systems, prompt patterns, evals, search tools, or stack upgrades. vnem returns provenance and trust tiers; it never installs packages, edits code, calls secrets, or reaches the network."
  }
);

registerResources(server);
registerPrompts(server);
registerTools(server);

await server.connect(new StdioServerTransport());

function registerTools(mcpServer) {
  mcpServer.registerTool(
    "vnem_search",
    {
      title: "Search vnem",
      description:
        "Search vnem registry entries, best-practice notes, and prompt patterns with trust-tier and source context.",
      inputSchema: {
        query: z.string().min(1).describe("Search query or user intent."),
        limit: z.number().int().min(1).max(20).default(8).describe("Maximum results to return."),
        types: z.array(z.string()).optional().describe("Optional entry/document types to include."),
        trust_tiers: z
          .array(z.enum(TRUST_TIERS))
          .optional()
          .describe("Optional trust tiers to include."),
        include_watchlist: z
          .boolean()
          .default(false)
          .describe("Include watchlist and deprecated entries unless trust_tiers is explicit.")
      },
      annotations: READ_ONLY
    },
    async ({ query, limit, types, trust_tiers: trustTiers, include_watchlist: includeWatchlist }) => {
      const intent = resolveIntent(query);
      const results = searchDocuments(query, {
        limit,
        types,
        trustTiers,
        includeWatchlist
      });
      return toolResult(formatSearch(query, results, intent), {
        query,
        intent,
        results
      });
    }
  );

  mcpServer.registerTool(
    "vnem_recommend",
    {
      title: "Recommend From vnem",
      description:
        "Run a vnem recommendation pass for a task, combining matching registry entries with best practices and decision notes.",
      inputSchema: {
        task: z.string().min(1).describe("The task, stack decision, or agentic workflow to improve."),
        limit: z.number().int().min(1).max(12).default(6).describe("Maximum registry entries to return."),
        types: z.array(z.string()).optional().describe("Optional entry/document types to include."),
        trust_tiers: z
          .array(z.enum(TRUST_TIERS))
          .optional()
          .describe("Optional trust tiers to include."),
        include_watchlist: z.boolean().default(false).describe("Include watchlist and deprecated entries.")
      },
      annotations: READ_ONLY
    },
    async ({ task, limit, types, trust_tiers: trustTiers, include_watchlist: includeWatchlist }) => {
      const intent = resolveIntent(task);
      const matches = searchDocuments(task, {
        limit: Math.max(limit + 8, 12),
        types,
        trustTiers,
        includeWatchlist
      });
      const registryEntries = matches.filter((match) => match.kind === "registry-entry").slice(0, limit);
      const practices = relevantPracticeDocs(task, intent, 6);
      const route = intent?.route || null;
      const taskContract = buildTaskContract(task, intent, route, practices, registryEntries);
      const recommendation = {
        task,
        intent,
        route,
        task_contract: taskContract,
        registry_entries: registryEntries,
        read_first: practices,
        decision_protocol: searchIndex.decision_protocol || null,
        safety:
          "Read-only guidance only. Review upstream permissions, install behavior, licenses, and data handling before use."
      };

      return toolResult(formatRecommendation(recommendation), recommendation);
    }
  );

  mcpServer.registerTool(
    "vnem_get_entry",
    {
      title: "Get vnem Entry",
      description:
        "Fetch one vnem registry entry by slug or exact name, including provenance, trust tier, install notes, permissions, and risk flags.",
      inputSchema: {
        slug: z.string().min(1).describe("Registry slug or exact entry name."),
        include_profile: z.boolean().default(false).describe("Include the local original profile markdown.")
      },
      annotations: READ_ONLY
    },
    async ({ slug, include_profile: includeProfile }) => {
      const entry = findEntry(slug);
      if (!entry) {
        return errorResult(`No vnem entry found for "${slug}". Try vnem_search first.`);
      }

      const profile = includeProfile ? await readProfile(entry) : null;
      const result = {
        ...entry,
        profile: profile || undefined
      };

      return toolResult(formatEntry(entry, profile), result);
    }
  );

  mcpServer.registerTool(
    "vnem_compare",
    {
      title: "Compare vnem Entries",
      description:
        "Compare registry entries by use cases, trust tier, install notes, permissions, risk flags, and alternatives.",
      inputSchema: {
        slugs: z.array(z.string().min(1)).min(2).max(8).describe("Registry slugs or exact names to compare.")
      },
      annotations: READ_ONLY
    },
    async ({ slugs }) => {
      const found = slugs.map((slug) => findEntry(slug)).filter(Boolean);
      const missing = slugs.filter((slug) => !findEntry(slug));
      if (found.length < 2) {
        return errorResult("Need at least two known vnem entries to compare. Try vnem_search first.");
      }

      const comparison = {
        entries: found.map(compareEntry),
        missing
      };

      return toolResult(formatComparison(comparison), comparison);
    }
  );

  mcpServer.registerTool(
    "vnem_best_practices",
    {
      title: "vnem Best Practices",
      description:
        "Find matching vnem best-practice and prompt-pattern notes for a build, review, prompt, agent, or tooling intent.",
      inputSchema: {
        intent: z.string().min(1).describe("Build/review/prompt/tooling intent to look up."),
        limit: z.number().int().min(1).max(12).default(6).describe("Maximum notes to return.")
      },
      annotations: READ_ONLY
    },
    async ({ intent, limit }) => {
      const resolvedIntent = resolveIntent(intent);
      const practices = relevantPracticeDocs(intent, resolvedIntent, limit);
      const result = {
        intent,
        resolved_intent: resolvedIntent,
        read_first: practices,
        route: resolvedIntent?.route || null
      };

      return toolResult(formatBestPractices(result), result);
    }
  );

  mcpServer.registerTool(
    "vnem_sources",
    {
      title: "vnem Source Radar",
      description:
        "Find upstream docs, registries, MCP sources, eval sources, and verification sources vnem should consult before recommending agentic tooling changes.",
      inputSchema: {
        intent: z.string().default("source radar").describe("Source, workflow, or decision intent to look up."),
        category: z
          .string()
          .optional()
          .describe("Optional source category filter such as protocol-registry, agent-client, current-docs, sensitive-connectors, or quality-evidence."),
        limit: z.number().int().min(1).max(12).default(8).describe("Maximum source radar entries to return.")
      },
      annotations: READ_ONLY
    },
    async ({ intent, category, limit }) => {
      const resolvedIntent = resolveIntent(intent);
      const results = sourceRadarResults(intent, category, limit);
      const result = {
        intent,
        category: category || null,
        resolved_intent: resolvedIntent,
        sources: results,
        safety:
          "Read-only source guidance only. Preserve source URLs and review permissions, licenses, and risk flags before promoting a source or installing any tool."
      };

      return toolResult(formatSourceRadar(result), result);
    }
  );
}

function registerResources(mcpServer) {
  registerFileResource(
    mcpServer,
    "vnem-search-index",
    "vnem://install/search-index",
    searchIndexPath,
    "vnem Search Index",
    "Generated search data used by the vnem MCP tools.",
    "application/json"
  );
  registerFileResource(
    mcpServer,
    "vnem-source-radar",
    "vnem://install/source-radar",
    firstExisting(["public/install/source-radar.json", ".vnem/source-radar.json"]),
    "vnem Source Radar",
    "Generated source intake map for official docs, registries, MCP sources, evals, and verification sources.",
    "application/json"
  );
  registerFileResource(
    mcpServer,
    "vnem-api-index",
    "vnem://api/index",
    apiIndexPath,
    "vnem API Index",
    "Generated static API index with full registry entry metadata.",
    "application/json"
  );
  registerFileResource(
    mcpServer,
    "vnem-operating-protocol",
    "vnem://install/operating-protocol",
    firstExisting(["public/install/operating-protocol.md", ".vnem/operating-protocol.md"]),
    "vnem Operating Protocol",
    "Generated universal operating loop for producing compact coding-agent task contracts.",
    "text/markdown"
  );
  registerFileResource(
    mcpServer,
    "vnem-task-rubrics",
    "vnem://install/task-rubrics",
    firstExisting(["public/install/task-rubrics.json", ".vnem/task-rubrics.json"]),
    "vnem Task Rubrics",
    "Generated broad task rubrics for agent quality bars, approval gates, verification, and reporting.",
    "application/json"
  );
  registerFileResource(
    mcpServer,
    "vnem-best-practices",
    "vnem://install/best-practices",
    firstExisting(["public/install/best-practices.md", ".vnem/best-practices.md"]),
    "vnem Best Practices",
    "Generated best-practice notes for agents.",
    "text/markdown"
  );
  registerFileResource(
    mcpServer,
    "vnem-agent-workspace",
    "vnem://install/agent-workspace",
    firstExisting(["public/install/agent-workspace.md", ".vnem/agent-workspace.md"]),
    "vnem Agent Workspace",
    "Generated guidance for autonomous developer environments, MCP gateways, memory files, and agent modes.",
    "text/markdown"
  );
  registerFileResource(
    mcpServer,
    "vnem-prompt-engineering",
    "vnem://install/prompt-engineering",
    firstExisting(["public/install/prompt-engineering.md", ".vnem/prompt-engineering.md"]),
    "vnem Prompt Engineering",
    "Generated prompt-engineering guidance for agents.",
    "text/markdown"
  );
  registerFileResource(
    mcpServer,
    "vnem-prompt-patterns",
    "vnem://install/prompt-patterns",
    firstExisting(["public/install/prompt-patterns.json", ".vnem/prompt-patterns.json"]),
    "vnem Prompt Patterns",
    "Generated prompt pattern data for agents.",
    "application/json"
  );
  registerFileResource(
    mcpServer,
    "vnem-daily-digest",
    "vnem://discovery/daily-digest",
    firstExisting(["discovery/daily-digest.md"]),
    "vnem Daily Digest",
    "Latest generated discovery digest.",
    "text/markdown"
  );

  if (entries.length > 0) {
    mcpServer.registerResource(
      "vnem-entry",
      new ResourceTemplate("vnem://entries/{slug}", {
        list: async () => ({
          resources: entries.map((entry) => ({
            uri: `vnem://entries/${entry.slug}`,
            name: `entry:${entry.slug}`,
            title: entry.name,
            description: entry.summary_llm,
            mimeType: "application/json"
          }))
        }),
        complete: {
          slug: (value) =>
            entries
              .map((entry) => entry.slug)
              .filter((slug) => slug.startsWith(value))
              .slice(0, 30)
        }
      }),
      {
        title: "vnem Registry Entry",
        description: "A generated vnem registry entry as JSON.",
        mimeType: "application/json"
      },
      async (uri, variables) => {
        const slug = variableValue(variables.slug);
        const entry = findEntry(slug);
        if (!entry) {
          throw new Error(`Unknown vnem entry: ${slug}`);
        }
        return {
          contents: [
            {
              uri: uri.href,
              text: JSON.stringify(entry, null, 2),
              mimeType: "application/json"
            }
          ]
        };
      }
    );
  }
}

function registerPrompts(mcpServer) {
  mcpServer.registerPrompt(
    "vnem_research_task",
    {
      title: "Research with vnem",
      description:
        "Prompt an agent to use vnem before making an agentic tooling, MCP, memory, prompt, eval, or stack recommendation.",
      argsSchema: {
        task: z.string().min(1).describe("The task or tooling decision to research.")
      }
    },
    ({ task }) => ({
      description: "Use vnem as a read-only perception layer before recommending tools.",
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              `Use vnem for this task: ${task}`,
              "",
              "1. Call vnem_recommend with the task.",
              "2. Read the returned best-practice notes and top registry entries.",
              "3. Report the vnem intent searched, top matches, recommendation, why, and any source-trust uncertainty.",
              "4. Do not install tools, edit files, or call external services unless I ask for that separately."
            ].join("\n")
          }
        }
      ]
    })
  );
}

function registerFileResource(mcpServer, name, uri, relativePath, title, description, mimeType) {
  if (!relativePath) {
    return;
  }

  const fullPath = safePath(relativePath);
  if (!fullPath || !existsSync(fullPath)) {
    return;
  }

  mcpServer.registerResource(
    name,
    uri,
    {
      title,
      description,
      mimeType
    },
    async () => ({
      contents: [
        {
          uri,
          text: await readFile(fullPath, "utf8"),
          mimeType
        }
      ]
    })
  );
}

function searchDocuments(query, options = {}) {
  const limit = options.limit || 8;
  const types = new Set((options.types || []).map(normalize));
  const trustTiers = new Set(options.trustTiers || []);
  const explicitTrust = trustTiers.size > 0;
  const intent = resolveIntent(query);
  const terms = tokenize(query);
  const queryText = normalize(query);

  return documents
    .map((document) => {
      const score = scoreDocument(document, terms, queryText, intent);
      return { document, score };
    })
    .filter(({ document, score }) => {
      if (score <= 0) {
        return false;
      }
      if (types.size && !types.has(normalize(document.type)) && !types.has(normalize(document.kind))) {
        return false;
      }
      if (explicitTrust && !trustTiers.has(document.trust_tier)) {
        return false;
      }
      if (!explicitTrust && !options.includeWatchlist) {
        return document.trust_tier !== "watchlist" && document.trust_tier !== "deprecated";
      }
      return true;
    })
    .sort((a, b) => b.score - a.score || String(a.document.title).localeCompare(String(b.document.title)))
    .slice(0, limit)
    .map(({ document, score }) => enrichDocument(document, score));
}

function relevantPracticeDocs(query, intent, limit) {
  const routedIds = new Set(intent?.route?.read_first || []);
  const routedDocs = [...routedIds]
    .map((id) => documentsById.get(id))
    .filter(Boolean)
    .map((document) => enrichDocument(document, 100));

  const searched = searchDocuments(query, {
    limit: limit + routedDocs.length + 8,
    includeWatchlist: true
  }).filter((match) => match.kind === "best-practice" || match.kind === "prompt-pattern");

  const merged = [];
  const seen = new Set();
  for (const match of [...routedDocs, ...searched]) {
    if (!seen.has(match.id)) {
      merged.push(match);
      seen.add(match.id);
    }
  }
  return merged.slice(0, limit);
}

function sourceRadarResults(intent, category, limit) {
  const query = [intent, category].filter(Boolean).join(" ");
  const queryText = normalize(query);
  const terms = tokenize(query);
  const categoryText = normalize(category);

  return sourceRadar
    .map((source) => {
      const haystack = normalize([
        source.id,
        source.title,
        source.category,
        source.priority,
        source.summary,
        ...(source.use_when || []),
        ...(source.monitor || []),
        ...(source.risk_checks || []),
        ...(source.source_urls || [])
      ].join(" "));

      let score = source.priority === "critical" ? 30 : source.priority === "high" ? 24 : 14;
      if (categoryText && normalize(source.category) === categoryText) {
        score += 30;
      }
      if (queryText && haystack.includes(queryText)) {
        score += 25;
      }
      for (const term of terms) {
        if (haystack.includes(term)) {
          score += 5;
        }
      }

      return {
        ...source,
        rank_score: score
      };
    })
    .filter((source) => source.rank_score > 0)
    .sort((a, b) => b.rank_score - a.rank_score || String(a.title).localeCompare(String(b.title)))
    .slice(0, limit);
}

function buildTaskContract(task, intent, route, readFirst, registryEntries) {
  const mode = inferTaskMode(task);
  const rubrics = selectTaskRubrics(task, intent, mode);
  const rubricIds = new Set(rubrics.flatMap((rubric) => rubric.read_first || []));
  const readFirstIds = uniqueStrings([
    ...rubrics.map((rubric) => `task-rubric:${rubric.id}`),
    ...rubricIds,
    ...(route?.read_first || []),
    ...readFirst.map((doc) => doc.id).filter(Boolean),
    ...registryEntries.slice(0, 3).map((entry) => entry.id).filter(Boolean)
  ]);
  const approvalGates = uniqueStrings([
    ...(searchIndex.operating_protocol?.default_contract?.approval_gates || []),
    ...rubrics.flatMap((rubric) => rubric.approval_gates || [])
  ]);
  const verification = uniqueStrings([
    ...(searchIndex.operating_protocol?.default_contract?.verification || []),
    ...rubrics.flatMap((rubric) => rubric.verification || [])
  ]);
  const finalReport = uniqueStrings([
    ...(searchIndex.operating_protocol?.default_contract?.report || []),
    ...rubrics.flatMap((rubric) => rubric.output_contract || [])
  ]);

  return compactObject({
    mode,
    intent: intent?.name || null,
    rubric: rubrics.map((rubric) => ({
      id: rubric.id,
      title: rubric.title,
      summary: rubric.summary,
      quality_bar: rubric.quality_bar || []
    })),
    route: route
      ? {
          read_first: route.read_first || [],
          compare_options: route.compare_options || [],
          choose_by: route.choose_by || []
        }
      : null,
    read_first: readFirstIds,
    smallest_sufficient_capability: route?.compare_options?.length
      ? `Prefer existing project patterns first; if a new capability is needed, compare: ${route.compare_options.join("; ")}.`
      : "Prefer existing project patterns first; add the smallest source-backed tool only when local code cannot satisfy the task cleanly.",
    choose_by: uniqueStrings([...(route?.choose_by || []), ...rubrics.flatMap((rubric) => rubric.quality_bar || [])]),
    approval_gates: approvalGates,
    verification,
    final_report: finalReport,
    safety:
      "vnem is read-only guidance. Do not install tools, mutate config, use secrets, call external services, or start daemons because of this recommendation without explicit user approval.",
    matched_rubric_read_first: [...rubricIds]
  });
}

function inferTaskMode(task) {
  const text = normalize(task);
  if (/\b(prompt|rewrite|improve|harden|template|instructions?)\b/.test(text)) return "prompt";
  if (/\b(debug|fix failing|failing test|error|stack trace|regression|diagnose|root cause)\b/.test(text)) return "debug";
  if (/\b(review|audit|assess|inspect|critique|find bugs|pr review)\b/.test(text)) return "review";
  if (/\b(plan|design|architect|architecture|proposal|strategy|policy)\b/.test(text)) return "plan";
  if (/\b(choose|select|compare|recommend|evaluate|which|best|decide)\b/.test(text)) return "decision";
  return "build";
}

function selectTaskRubrics(task, intent, mode) {
  const rubrics = Array.isArray(searchIndex.task_rubrics) ? searchIndex.task_rubrics : [];
  const queryTerms = new Set(tokenize([task, intent?.name, ...(intent?.aliases || [])].join(" ")));
  const routeIds = new Set(intent?.route?.read_first || []);
  const scored = rubrics
    .map((rubric) => {
      const haystack = [
        rubric.id,
        rubric.title,
        rubric.summary,
        ...(rubric.intents || []),
        ...(rubric.modes || []),
        ...(rubric.read_first || []),
        ...(rubric.quality_bar || [])
      ].map(normalize);
      let score = rubric.modes?.includes(mode) ? 6 : 0;
      for (const term of queryTerms) {
        if (haystack.some((item) => item.includes(term))) score += 2;
      }
      for (const id of rubric.read_first || []) {
        if (routeIds.has(id)) score += 5;
      }
      return { rubric, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.rubric.id.localeCompare(b.rubric.id));

  if (scored.length) {
    return scored.slice(0, 2).map(({ rubric }) => rubric);
  }

  const fallback = rubrics.find((rubric) => rubric.id === "agent_tooling") || rubrics[0];
  return fallback ? [fallback] : [];
}

function scoreDocument(document, terms, queryText, intent) {
  const title = normalize(document.title);
  const summary = normalize(document.summary);
  const tags = (document.tags || []).map(normalize);
  const useCases = (document.use_cases || []).map(normalize);
  const bestFor = (document.best_for || []).map(normalize);
  const keywords = new Set((document.keywords || []).map(normalize));
  let score = Number(document.score || 0);

  if (queryText && title.includes(queryText)) {
    score += 35;
  }
  if (queryText && tags.includes(queryText)) {
    score += 25;
  }
  if (queryText && document.id?.endsWith(queryText)) {
    score += 20;
  }

  for (const term of terms) {
    if (title.includes(term)) score += 14;
    if (tags.some((tag) => tag === term || tag.includes(term))) score += 10;
    if (summary.includes(term)) score += 5;
    if (useCases.some((useCase) => useCase.includes(term))) score += 4;
    if (bestFor.some((item) => item.includes(term))) score += 3;
    if (keywords.has(term)) score += 2;
  }

  if (intent) {
    const relatedTerms = tokenize([intent.name, ...(intent.aliases || [])].join(" "));
    const routeIndex = intent.route?.read_first?.indexOf(document.id) ?? -1;
    if (routeIndex >= 0) {
      score += Math.max(50 - routeIndex * 10, 20);
    }
    for (const term of relatedTerms) {
      if (tags.some((tag) => tag.includes(term))) score += 3;
      if (title.includes(term)) score += 2;
      if (keywords.has(term)) score += 1;
    }
  }

  return score;
}

function enrichDocument(document, rankScore) {
  const slug = document.id?.startsWith("entry:") ? document.id.slice("entry:".length) : null;
  const entry = slug ? entriesBySlug.get(slug) : null;
  return compactObject({
    id: document.id,
    kind: document.kind,
    slug,
    name: entry?.name || document.title,
    summary: entry?.summary_llm || document.summary,
    trust_tier: entry?.trust_tier || document.trust_tier,
    review_status: entry?.review_status,
    type: entry?.type || document.type,
    rank_score: rankScore,
    recommendation_score: entry?.recommendation_score || document.score,
    tags: entry?.tags || document.tags || [],
    use_cases: entry?.use_cases || document.use_cases || [],
    best_for: entry?.best_for || document.best_for || [],
    not_for: entry?.not_for || [],
    source_urls: entry?.source_urls || document.source_urls || [],
    url_path: entry?.url_path || document.url_path,
    entry_path: entry?.entry_path,
    profile_path: entry?.profile_path,
    install: entry?.install,
    permissions: entry?.permissions || [],
    env_vars: entry?.env_vars || [],
    risk_flags: entry?.risk_flags || document.risk_flags || []
  });
}

function resolveIntent(query) {
  const queryText = normalize(query);
  const aliases = searchIndex.intent_aliases || {};
  const routeMap = searchIndex.intent_routes || {};
  const candidates = Object.entries(aliases)
    .map(([name, values]) => ({
      name,
      aliases: Array.isArray(values) ? values : []
    }))
    .sort((a, b) => b.name.length - a.name.length);

  for (const candidate of candidates) {
    const needles = [candidate.name, ...candidate.aliases].map(normalize).filter(Boolean);
    if (needles.some((needle) => queryText === needle || queryText.includes(needle))) {
      return {
        name: candidate.name,
        aliases: candidate.aliases,
        route: routeMap[candidate.name] || null
      };
    }
  }

  if (routeMap[queryText]) {
    return {
      name: queryText,
      aliases: [],
      route: routeMap[queryText]
    };
  }

  return null;
}

function findEntry(value) {
  const raw = String(value || "").trim();
  const direct = entriesBySlug.get(raw);
  if (direct) {
    return direct;
  }
  const normalized = normalize(raw);
  const slugged = slugify(raw);
  return (
    entriesBySlug.get(slugged) ||
    entries.find((entry) => normalize(entry.name) === normalized || normalize(entry.slug) === normalized) ||
    null
  );
}

async function readProfile(entry) {
  if (!entry.profile_path) {
    return null;
  }
  const profilePath = safePath(entry.profile_path);
  if (!profilePath || !existsSync(profilePath)) {
    return null;
  }
  return readFile(profilePath, "utf8");
}

function compareEntry(entry) {
  return {
    slug: entry.slug,
    name: entry.name,
    type: entry.type,
    trust_tier: entry.trust_tier,
    review_status: entry.review_status,
    summary: entry.summary_llm,
    best_for: entry.best_for || [],
    not_for: entry.not_for || [],
    install: entry.install || {},
    permissions: entry.permissions || [],
    env_vars: entry.env_vars || [],
    risk_flags: entry.risk_flags || [],
    alternatives: entry.alternatives || [],
    source_urls: entry.source_urls || []
  };
}

function formatSearch(query, results, intent) {
  const lines = [`vnem search: ${query}`];
  if (intent) {
    lines.push(`Intent: ${intent.name}${intent.route ? " (has route)" : " (alias only)"}`);
  }
  if (!results.length) {
    lines.push("No matching vnem documents found. Try broader terms or inspect vnem://install/search-index.");
    return lines.join("\n");
  }
  lines.push("");
  for (const result of results) {
    lines.push(formatResultLine(result));
  }
  return lines.join("\n");
}

function formatRecommendation(recommendation) {
  const lines = [`vnem recommendation pass: ${recommendation.task}`];
  if (recommendation.intent) {
    lines.push(`Intent: ${recommendation.intent.name}`);
  }
  if (recommendation.route?.choose_by?.length) {
    lines.push(`Choose by: ${recommendation.route.choose_by.join("; ")}`);
  }
  if (recommendation.task_contract) {
    lines.push(`Mode: ${recommendation.task_contract.mode}`);
    if (recommendation.task_contract.rubric?.length) {
      lines.push(`Rubric: ${recommendation.task_contract.rubric.map((rubric) => rubric.id).join(", ")}`);
    }
  }

  lines.push("", "Top registry matches:");
  if (recommendation.registry_entries.length) {
    for (const entry of recommendation.registry_entries) {
      lines.push(formatResultLine(entry));
    }
  } else {
    lines.push("- No registry matches found.");
  }

  lines.push("", "Read first:");
  if (recommendation.read_first.length) {
    for (const doc of recommendation.read_first) {
      lines.push(formatResultLine(doc));
    }
  } else {
    lines.push("- No matching best-practice notes found.");
  }

  if (recommendation.task_contract) {
    lines.push("", "Task contract:");
    lines.push(`- Smallest sufficient capability: ${recommendation.task_contract.smallest_sufficient_capability}`);
    if (recommendation.task_contract.approval_gates?.length) {
      lines.push(`- Approval gates: ${recommendation.task_contract.approval_gates.slice(0, 5).join("; ")}`);
    }
    if (recommendation.task_contract.verification?.length) {
      lines.push(`- Verification: ${recommendation.task_contract.verification.slice(0, 5).join("; ")}`);
    }
  }

  lines.push("", `Safety: ${recommendation.safety}`);
  return lines.join("\n");
}

function formatEntry(entry, profile) {
  const lines = [
    `${entry.name} (${entry.slug})`,
    `${entry.trust_tier} / ${entry.review_status || "review status unknown"} / ${entry.type}`,
    "",
    entry.summary_llm
  ];

  if (entry.best_for?.length) {
    lines.push("", "Best for:", ...entry.best_for.slice(0, 6).map((item) => `- ${item}`));
  }
  if (entry.not_for?.length) {
    lines.push("", "Not for:", ...entry.not_for.slice(0, 4).map((item) => `- ${item}`));
  }
  if (entry.install?.notes || entry.install?.command) {
    lines.push("", "Install notes:");
    if (entry.install.command) lines.push(`- Command: ${entry.install.command}`);
    if (entry.install.notes) lines.push(`- ${entry.install.notes}`);
  }
  if (entry.risk_flags?.length) {
    lines.push("", "Risk flags:", ...entry.risk_flags.map((item) => `- ${item}`));
  }
  if (entry.source_urls?.length) {
    lines.push("", "Sources:", ...entry.source_urls.slice(0, 8).map((url) => `- ${url}`));
  }
  if (profile) {
    lines.push("", "Profile:", profile);
  }
  return lines.join("\n");
}

function formatComparison(comparison) {
  const lines = ["vnem comparison:"];
  for (const entry of comparison.entries) {
    const risk = entry.risk_flags.length ? entry.risk_flags.join("; ") : "none listed";
    lines.push(
      `- ${entry.name} (${entry.slug}): ${entry.trust_tier}, ${entry.type}. ${entry.summary} Risk: ${risk}`
    );
  }
  if (comparison.missing.length) {
    lines.push(`Missing: ${comparison.missing.join(", ")}`);
  }
  return lines.join("\n");
}

function formatBestPractices(result) {
  const lines = [`vnem best-practices: ${result.intent}`];
  if (result.resolved_intent) {
    lines.push(`Intent: ${result.resolved_intent.name}`);
  }
  if (result.route?.compare_options?.length) {
    lines.push(`Compare: ${result.route.compare_options.join("; ")}`);
  }
  lines.push("");
  for (const doc of result.read_first) {
    lines.push(formatResultLine(doc));
  }
  if (!result.read_first.length) {
    lines.push("- No matching best-practice notes found.");
  }
  return lines.join("\n");
}

function formatSourceRadar(result) {
  const lines = [`vnem source radar: ${result.intent || "all sources"}`];
  if (result.category) {
    lines.push(`Category: ${result.category}`);
  }
  if (result.resolved_intent) {
    lines.push(`Intent: ${result.resolved_intent.name}`);
  }
  lines.push("");

  if (!result.sources.length) {
    lines.push("- No matching source radar entries found. Inspect vnem://install/source-radar.");
  } else {
    for (const source of result.sources) {
      lines.push(formatSourceLine(source));
    }
  }

  lines.push("", `Safety: ${result.safety}`);
  return lines.join("\n");
}

function formatSourceLine(source) {
  const parts = [
    `- ${source.title}`,
    `[${source.category || "source"}]`,
    `priority: ${source.priority || "unknown"}`
  ];
  const summary = source.summary ? `\n  ${source.summary}` : "";
  const useWhen = source.use_when?.length ? `\n  Use when: ${source.use_when.slice(0, 2).join("; ")}` : "";
  const risk = source.risk_checks?.length ? `\n  Risk checks: ${source.risk_checks.slice(0, 3).join("; ")}` : "";
  const sources = source.source_urls?.length ? `\n  Sources: ${source.source_urls.slice(0, 4).join(", ")}` : "";
  return `${parts.join(" ")}${summary}${useWhen}${risk}${sources}`;
}

function formatResultLine(result) {
  const parts = [
    `- ${result.name}`,
    `[${result.kind}${result.type ? ` / ${result.type}` : ""}]`,
    `${result.trust_tier || "unknown"}`
  ];
  if (result.slug) {
    parts.push(`slug: ${result.slug}`);
  }
  const line = parts.join(" ");
  const summary = result.summary ? `\n  ${result.summary}` : "";
  const sources = result.source_urls?.length ? `\n  Sources: ${result.source_urls.slice(0, 3).join(", ")}` : "";
  return `${line}${summary}${sources}`;
}

function toolResult(text, structuredContent) {
  return {
    content: [{ type: "text", text }],
    structuredContent
  };
}

function errorResult(text) {
  return {
    isError: true,
    content: [{ type: "text", text }],
    structuredContent: { error: text }
  };
}

function tokenize(value) {
  return [...new Set(normalize(value).split(" ").filter((token) => token.length > 1 && !STOPWORDS.has(token)))];
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9+#._/-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value) {
  return normalize(value).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function compactObject(object) {
  return Object.fromEntries(
    Object.entries(object).filter(([, value]) => {
      if (value === null || value === undefined) return false;
      if (Array.isArray(value) && value.length === 0) return false;
      return true;
    })
  );
}

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean).map((value) => String(value)))];
}

function variableValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function safePath(relativePath) {
  if (!relativePath) {
    return null;
  }
  const resolved = path.resolve(rootDir, relativePath);
  return resolved.startsWith(`${rootDir}${path.sep}`) || resolved === rootDir ? resolved : null;
}

function firstExisting(relativePaths) {
  return relativePaths.find((relativePath) => {
    const fullPath = safePath(relativePath);
    return fullPath && existsSync(fullPath);
  });
}

async function readJsonRequired(relativePath, label) {
  if (!relativePath) {
    throw new Error(`Missing required vnem ${label}. Run npm run generate first.`);
  }
  const data = await readJsonOptional(relativePath);
  if (!data) {
    throw new Error(`Unable to read vnem ${label} at ${relativePath}.`);
  }
  return data;
}

async function readJsonOptional(relativePath) {
  const fullPath = safePath(relativePath);
  if (!fullPath || !existsSync(fullPath)) {
    return null;
  }
  return JSON.parse(await readFile(fullPath, "utf8"));
}
