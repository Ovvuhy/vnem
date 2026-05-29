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
const sourceRadarById = new Map(sourceRadar.map((source) => [source.id, source]));

const server = new McpServer(
  {
    name: "vnem",
    version: packageJson?.version || "0.1.0"
  },
  {
    instructions:
      "Use vnem as a read-only AI booster and perception layer before coding, recommending tools, or changing a stack. For coding tasks, call vnem_recommend and apply the Triple-Check Workflow: Analyze the user's true goal and hidden requirements, Architect performance and visuals/playability together, then Review that no important domain was sacrificed. vnem returns provenance, trust tiers, and deterministic quality gates; it never installs packages, edits code, calls secrets, or reaches the network."
  }
);

registerResources(server);
registerPrompts(server);
registerTools(server);

await server.connect(new StdioServerTransport());

function registerTools(mcpServer) {
  mcpServer.registerTool(
    "vnem_status",
    {
      title: "vnem Status",
      description:
        "Explain what this vnem MCP server loaded, which read-only surfaces are available, and how fresh the generated data is.",
      inputSchema: {},
      annotations: READ_ONLY
    },
    async () => {
      const status = buildStatus();
      return toolResult(formatStatus(status), status);
    }
  );

  mcpServer.registerTool(
    "vnem_overview",
    {
      title: "vnem Overview",
      description:
        "Explain vnem's usable product surfaces: registry, install pack, MCP server, source radar, task rubrics, Hermes, dashboard, and safety model.",
      inputSchema: {
        audience: z
          .enum(["maintainer", "agent", "newcomer"])
          .default("newcomer")
          .describe("Who the explanation is for.")
      },
      annotations: READ_ONLY
    },
    async ({ audience }) => {
      const overview = buildOverview(audience);
      return toolResult(formatOverview(overview), overview);
    }
  );

  mcpServer.registerTool(
    "vnem_route_intent",
    {
      title: "Route vnem Intent",
      description:
        "Resolve a task or phrase into vnem's intent route, read-first guidance, comparison options, choice criteria, rubrics, and report contract.",
      inputSchema: {
        intent: z.string().min(1).describe("Task, decision, or phrase to route."),
        include_matches: z
          .boolean()
          .default(true)
          .describe("Include the resolved read-first documents when possible.")
      },
      annotations: READ_ONLY
    },
    async ({ intent, include_matches: includeMatches }) => {
      const resolvedIntent = resolveIntent(intent);
      const route = resolvedIntent?.route || searchIndex.intent_routes?.[normalize(intent)] || null;
      const rubrics = selectTaskRubrics(intent, resolvedIntent, inferTaskMode(intent));
      const readFirst = includeMatches ? relevantPracticeDocs(intent, resolvedIntent, 8) : [];
      const result = {
        intent,
        resolved_intent: resolvedIntent,
        route,
        mode: inferTaskMode(intent),
        rubrics: rubrics.map((rubric) => ({
          id: rubric.id,
          title: rubric.title,
          summary: rubric.summary,
          quality_bar: rubric.quality_bar || [],
          approval_gates: rubric.approval_gates || [],
          verification: rubric.verification || []
        })),
        read_first: readFirst,
        safety:
          "Read-only routing only. Use this to choose context and verification, not to install tools or mutate a repo."
      };
      return toolResult(formatRouteIntent(result), result);
    }
  );

  mcpServer.registerTool(
    "vnem_get_source",
    {
      title: "Get vnem Source Radar Entry",
      description:
        "Fetch one source-radar entry by id or title, including when to use it, what to monitor, risk checks, and source URLs.",
      inputSchema: {
        id: z.string().min(1).describe("Source-radar id or exact title.")
      },
      annotations: READ_ONLY
    },
    async ({ id }) => {
      const source = findSource(id);
      if (!source) {
        return errorResult(`No vnem source-radar entry found for "${id}". Try vnem_sources first.`);
      }
      return toolResult(formatSourceDetail(source), source);
    }
  );

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
    "vnem_quality_gate",
    {
      title: "Run vnem Quality Gate",
      description:
        "Apply VNEM's Triple-Check Workflow to a coding, app, UI, game, optimization, or production-readiness task and detect silent trade-off risks before code is written or finalized.",
      inputSchema: {
        task: z.string().min(1).describe("The task, feature, bug fix, UI/game build, optimization, or production-readiness request."),
        proposed_approach: z
          .string()
          .optional()
          .describe("Optional proposed implementation approach to review for silent quality trade-offs."),
        domains: z
          .array(z.enum(["performance", "visual", "playability", "accessibility", "maintainability", "security/data"]))
          .optional()
          .describe("Optional explicit quality domains to include in the gate.")
      },
      annotations: READ_ONLY
    },
    async ({ task, proposed_approach: proposedApproach, domains }) => {
      const intent = resolveIntent(task);
      const mode = inferTaskMode(task);
      const rubrics = selectTaskRubrics(task, intent, mode);
      const playbook = selectCodingPlaybooks(task, intent, mode, rubrics)[0] || null;
      const qualityGate = buildQualityGate(task, proposedApproach || "", intent, rubrics, playbook, domains || []);
      const result = {
        task,
        proposed_approach: proposedApproach || null,
        intent,
        mode,
        quality_gate: qualityGate || buildQualityGate(task, proposedApproach || "", intent, rubrics, playbook, domains || [], { force: true }),
        safety:
          "Read-only quality analysis only. This tool does not edit files, run commands, install packages, call upstream services, or enforce runtime policy."
      };
      return toolResult(formatQualityGate(result), result);
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
    "vnem-install-guide",
    "vnem://install/install-guide",
    firstExisting(["public/install/install-guide.md", ".vnem/install-guide.md"]),
    "vnem Install And MCP Guide",
    "Generated setup guide for downloading the read-only pack, using the local installer, and connecting the stdio MCP server.",
    "text/markdown"
  );
  registerFileResource(
    mcpServer,
    "vnem-quality-contract",
    "vnem://install/quality-contract",
    firstExisting(["public/install/quality-contract.md", ".vnem/quality-contract.md"]),
    "vnem Quality Contract",
    "Generated holistic excellence contract, Triple-Check Workflow, quality floor, and intelligent trade-off policy.",
    "text/markdown"
  );
  registerFileResource(
    mcpServer,
    "vnem-coding-protocol",
    "vnem://install/coding-protocol",
    firstExisting(["public/install/coding-protocol.md", ".vnem/coding-protocol.md"]),
    "vnem Coding Protocol",
    "Generated coding execution protocol for repo sensing, plan-first work, small diffs, verification, and final reporting.",
    "text/markdown"
  );
  registerFileResource(
    mcpServer,
    "vnem-coding-playbooks",
    "vnem://install/coding-playbooks",
    firstExisting(["public/install/coding-playbooks.json", ".vnem/coding-playbooks.json"]),
    "vnem Coding Playbooks",
    "Generated mode-specific coding-agent playbooks for feature slices, root-cause bug fixes, tests, refactors, web apps, API/data work, reviews, large changes, and failure recovery.",
    "application/json"
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
    "vnem-design-architecture",
    "vnem://install/design-architecture",
    firstExisting(["public/install/design-architecture.md", ".vnem/design-architecture.md"]),
    "vnem Design Architecture",
    "Generated source-backed design intelligence for UI, game, dashboard, visual polish, motion, sound, and conversational-agent surfaces.",
    "text/markdown"
  );
  registerFileResource(
    mcpServer,
    "vnem-visual-qa-protocol",
    "vnem://install/visual-qa-protocol",
    firstExisting(["public/install/visual-qa-protocol.md", ".vnem/visual-qa-protocol.md"]),
    "vnem Visual QA Protocol",
    "Generated rendered-quality loop for UI, game, dashboard, canvas, motion, sound, and brand-facing surfaces.",
    "text/markdown"
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
  registerFileResource(
    mcpServer,
    "vnem-readme",
    "vnem://repo/readme",
    firstExisting(["README.md"]),
    "vnem README",
    "Repository overview, install instructions, MCP usage, safety model, and local development commands.",
    "text/markdown"
  );
  registerFileResource(
    mcpServer,
    "vnem-product",
    "vnem://repo/product",
    firstExisting(["PRODUCT.md"]),
    "vnem Product Direction",
    "Product direction, public-site clarity goals, commercial boundaries, and non-regression bar.",
    "text/markdown"
  );
  registerFileResource(
    mcpServer,
    "vnem-security-roadmap",
    "vnem://repo/security-roadmap",
    firstExisting(["SECURITY-ROADMAP.md"]),
    "vnem Security Roadmap",
    "Advisory-first roadmap for zero-trust gateway, tool pinning, package firewall, AST indexing, and runtime-security ideas.",
    "text/markdown"
  );
  registerFileResource(
    mcpServer,
    "vnem-hermes",
    "vnem://repo/hermes",
    firstExisting(["HERMES.md"]),
    "vnem Hermes",
    "Discovery operating contract for recurring ecosystem scans and daily synthesis.",
    "text/markdown"
  );
  registerFileResource(
    mcpServer,
    "vnem-contributing",
    "vnem://repo/contributing",
    firstExisting(["CONTRIBUTING.md"]),
    "vnem Contributing",
    "Contribution requirements, branch workflow, trust tiers, and automation safety rules.",
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
              "2. For coding, UI, game, optimization, or production-readiness tasks, apply the returned quality_gate and Triple-Check Workflow.",
              "3. Read the returned best-practice notes and top registry entries.",
              "4. Report the vnem intent searched, top matches, quality gate verdict, recommendation, why, and any source-trust uncertainty.",
              "5. Do not install tools, edit files, or call external services unless I ask for that separately."
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

function buildStatus() {
  const entryCountsByType = countBy(entries, (entry) => entry.type || "unknown");
  const entryCountsByTrustTier = countBy(entries, (entry) => entry.trust_tier || "unknown");
  const documentCountsByKind = countBy(documents, (document) => document.kind || "unknown");

  return {
    name: "vnem",
    version: packageJson?.version || "0.1.0",
    root_dir: rootDir,
    data_paths: {
      search_index: searchIndexPath,
      api_index: apiIndexPath || null,
      install_source_radar: firstExisting(["public/install/source-radar.json", ".vnem/source-radar.json"]),
      daily_digest: firstExisting(["discovery/daily-digest.md"])
    },
    generated_at: searchIndex.generated_at || apiIndex?.generated_at || null,
    release_version: searchIndex.release_version || apiIndex?.release_version || packageJson?.version || null,
    release_date: searchIndex.release_date || apiIndex?.release_date || null,
    counts: {
      registry_entries: entries.length,
      search_documents: documents.length,
      source_radar_entries: sourceRadar.length,
      intent_aliases: Object.keys(searchIndex.intent_aliases || {}).length,
      intent_routes: Object.keys(searchIndex.intent_routes || {}).length,
      quality_contract: Boolean(searchIndex.quality_contract),
      install_guide: Boolean(searchIndex.install_guide),
      coding_playbooks: searchIndex.coding_playbooks?.playbooks?.length || 0,
      task_rubrics: searchIndex.task_rubrics?.length || 0,
      prompt_patterns: searchIndex.prompt_patterns?.length || 0,
      by_type: entryCountsByType,
      by_trust_tier: entryCountsByTrustTier,
      by_document_kind: documentCountsByKind
    },
    mcp: {
      tools: [
        "vnem_status",
        "vnem_overview",
        "vnem_route_intent",
        "vnem_get_source",
        "vnem_search",
        "vnem_recommend",
        "vnem_quality_gate",
        "vnem_get_entry",
        "vnem_compare",
        "vnem_best_practices",
        "vnem_sources"
      ],
      resources: [
        "vnem://install/search-index",
        "vnem://install/source-radar",
        "vnem://api/index",
        "vnem://install/operating-protocol",
        "vnem://install/install-guide",
        "vnem://install/quality-contract",
        "vnem://install/coding-protocol",
        "vnem://install/coding-playbooks",
        "vnem://install/task-rubrics",
        "vnem://install/design-architecture",
        "vnem://install/visual-qa-protocol",
        "vnem://install/best-practices",
        "vnem://install/agent-workspace",
        "vnem://install/prompt-engineering",
        "vnem://install/prompt-patterns",
        "vnem://discovery/daily-digest",
        "vnem://repo/readme",
        "vnem://repo/product",
        "vnem://repo/security-roadmap",
        "vnem://repo/hermes",
        "vnem://repo/contributing",
        "vnem://entries/{slug}"
      ],
      prompts: ["vnem_research_task"],
      annotations: READ_ONLY
    },
    safety: {
      mode: "read-only stdio MCP server",
      installs_packages: false,
      edits_files: false,
      calls_upstream_services: false,
      collects_secrets: false,
      starts_daemons: false,
      note:
        "MCP tool annotations are hints for clients. Vnem still keeps tools deterministic and read-only so the server itself does not mutate user systems."
    }
  };
}

function buildOverview(audience) {
  const status = buildStatus();
  const surfaces = [
    {
      name: "Registry",
      paths: ["registry/entries/{slug}/entry.yaml", "registry/entries/{slug}/profile.md"],
      purpose:
        "Source-backed metadata for MCP servers, coding agents, frameworks, evals, memory systems, workflows, and safety tools.",
      usable_via: ["public/api/index.json", "vnem_search", "vnem_get_entry", "vnem_compare"]
    },
    {
      name: "Install pack",
      paths: ["public/install.tgz", "public/install/install-guide.md", "public/install/*", ".vnem/*"],
      purpose:
        "Read-only project guidance files that make another repo vnem-aware through AGENTS.md and .vnem files, with setup guidance for safe archive install, managed repo install, and MCP connection.",
      usable_via: ["vnem://install/install-guide", "npm run install:project -- <repo>", "npm run doctor -- <repo>", "npm run vnem -- mcp-config"]
    },
    {
      name: "MCP server",
      paths: ["scripts/vnem-mcp-server.mjs"],
      purpose:
        "Opt-in stdio MCP surface exposing registry search, recommendations, intent routing, quality gates, source radar, resources, and task contracts.",
      usable_via: ["npm run mcp", "vnem_status", "vnem_overview", "vnem_recommend", "vnem_quality_gate"]
    },
    {
      name: "Source radar",
      paths: ["public/install/source-radar.json", ".vnem/source-radar.json"],
      purpose:
        "Map of official/high-signal upstream sources agents should consult before broad web research or tool recommendations.",
      usable_via: ["vnem_sources", "vnem_get_source", "vnem://install/source-radar"]
    },
    {
      name: "Operating protocol and rubrics",
      paths: ["public/install/install-guide.md", "public/install/operating-protocol.md", "public/install/quality-contract.md", "public/install/coding-protocol.md", "public/install/coding-playbooks.json", "public/install/task-rubrics.json"],
      purpose:
        "Compact task-contract and coding-execution layer for sensing the repo, enforcing holistic quality, selecting task-specific playbooks, planning edits, routing work, approval gates, verification, and final reporting.",
      usable_via: ["vnem_route_intent", "vnem_recommend", "vnem_quality_gate", "vnem://install/install-guide", "vnem://install/quality-contract", "vnem://install/coding-protocol", "vnem://install/coding-playbooks", "vnem://install/task-rubrics"]
    },
    {
      name: "Visual/design guidance",
      paths: ["public/install/design-architecture.md", "public/install/visual-qa-protocol.md"],
      purpose:
        "Source-backed design and visual QA guidance for UI, games, dashboards, animation, sound, and brand-facing surfaces.",
      usable_via: ["vnem_recommend for visual tasks", "vnem://install/design-architecture", "vnem://install/visual-qa-protocol"]
    },
    {
      name: "Hermes discovery",
      paths: ["HERMES.md", "scripts/hermes-agent.mjs", "discovery/daily-digest.md", "discovery/candidates/*"],
      purpose:
        "Reviewable ecosystem discovery workflow for new MCP servers, agents, memory tools, evals, and infrastructure signals.",
      usable_via: ["npm run hermes:dry-run", "npm run digest", "vnem://discovery/daily-digest"]
    },
    {
      name: "Website and dashboard",
      paths: ["landing/", "dashboard/"],
      purpose:
        "Static public site and Hermes dashboard surfaces for explaining and browsing the product.",
      usable_via: ["npm run dashboard:build", "vnem.pages.dev when deployed"]
    }
  ];

  return {
    audience,
    one_sentence:
      "vnem is a read-only AI booster and perception layer that helps coding agents choose better tools, sources, prompts, rubrics, quality gates, and safety checks before editing a repo.",
    current_counts: status.counts,
    surfaces,
    safe_workflow: [
      "Use develop for normal improvements.",
      "Use experimental for risky prototypes.",
      "Merge to main only after validation and an understandable diff.",
      "Keep install-pack and MCP behavior read-only unless the user explicitly asks for a separate runtime surface."
    ],
    what_vnem_is_not_yet: [
      "not a shell-command interceptor",
      "not a package installer",
      "not a runtime security gateway",
      "not an automatic code editor",
      "not a secret manager"
    ]
  };
}

function findSource(value) {
  const raw = String(value || "").trim();
  if (sourceRadarById.has(raw)) {
    return sourceRadarById.get(raw);
  }
  const normalized = normalize(raw);
  return (
    sourceRadar.find((source) => normalize(source.id) === normalized || normalize(source.title) === normalized) ||
    null
  );
}

function buildTaskContract(task, intent, route, readFirst, registryEntries) {
  const mode = inferTaskMode(task);
  const rubrics = selectTaskRubrics(task, intent, mode);
  const playbooks = selectCodingPlaybooks(task, intent, mode, rubrics);
  const primaryPlaybook = playbooks[0] || null;
  const perceptionGate = buildPerceptionGate(task, rubrics);
  const qualityGate = buildQualityGate(task, "", intent, rubrics, primaryPlaybook);
  const rubricIds = new Set(rubrics.flatMap((rubric) => rubric.read_first || []));
  const readFirstIds = uniqueStrings([
    ...(qualityGate?.required_read_first || []),
    ...rubrics.map((rubric) => `task-rubric:${rubric.id}`),
    ...rubricIds,
    ...playbooks.map((playbook) => `coding-playbook:${playbook.id}`),
    ...playbooks.flatMap((playbook) => playbook.read_first || []),
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
    ...(qualityGate?.verification_requirements || []),
    ...(primaryPlaybook?.verification_ladder || []),
    ...rubrics.flatMap((rubric) => rubric.verification || [])
  ]);
  const finalReport = uniqueStrings([
    ...(searchIndex.operating_protocol?.default_contract?.report || []),
    ...(primaryPlaybook?.final_report || []),
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
    coding_playbook: primaryPlaybook
      ? {
          id: primaryPlaybook.id,
          title: primaryPlaybook.title,
          summary: primaryPlaybook.summary,
          mode: primaryPlaybook.mode,
          read_first: primaryPlaybook.read_first || [],
          repo_sensing: primaryPlaybook.repo_sensing || [],
          execution_loop: primaryPlaybook.execution_loop || [],
          verification_ladder: primaryPlaybook.verification_ladder || [],
          stop_conditions: primaryPlaybook.stop_conditions || [],
          anti_patterns: primaryPlaybook.anti_patterns || [],
          final_report: primaryPlaybook.final_report || []
        }
      : null,
    quality_gate: qualityGate,
    triple_check: qualityGate?.triple_check,
    domain_balance: qualityGate?.detected_domains,
    tradeoff_policy: qualityGate?.tradeoff_policy,
    coding_playbook_alternates: playbooks.slice(1, 3).map((playbook) => ({
      id: playbook.id,
      title: playbook.title,
      summary: playbook.summary
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
    choose_by: uniqueStrings([...(route?.choose_by || []), ...(qualityGate?.quality_floor || []), ...(primaryPlaybook?.stop_conditions || []), ...rubrics.flatMap((rubric) => rubric.quality_bar || []), ...(perceptionGate?.criteria || [])]),
    approval_gates: approvalGates,
    perception_gate: perceptionGate,
    verification,
    final_report: finalReport,
    safety:
      "vnem is read-only guidance. Do not install tools, mutate config, use secrets, call external services, or start daemons because of this recommendation without explicit user approval.",
    matched_rubric_read_first: [...rubricIds]
  });
}

function selectCodingPlaybooks(task, intent, mode, rubrics) {
  const playbooks = Array.isArray(searchIndex.coding_playbooks?.playbooks)
    ? searchIndex.coding_playbooks.playbooks
    : [];
  if (!playbooks.length) {
    return [];
  }

  const terms = tokenize([
    task,
    intent?.name,
    ...(intent?.aliases || []),
    ...(intent?.route?.read_first || []),
    ...rubrics.flatMap((rubric) => [rubric.id, rubric.title, ...(rubric.intents || []), ...(rubric.read_first || [])])
  ].join(" "));

  const routeIds = new Set(intent?.route?.read_first || []);
  const scored = playbooks
    .map((playbook) => {
      const haystack = tokenize([
        playbook.id,
        playbook.title,
        playbook.mode,
        playbook.summary,
        ...(playbook.intents || []),
        ...(playbook.triggers || []),
        ...(playbook.read_first || []),
        ...(playbook.repo_sensing || []),
        ...(playbook.execution_loop || []),
        ...(playbook.verification_ladder || [])
      ].join(" "));
      const words = new Set(haystack);
      let score = playbook.mode === mode ? 20 : 0;
      if (routeIds.has(`coding-playbook:${playbook.id}`)) {
        score += 70;
      }
      for (const id of playbook.read_first || []) {
        if (routeIds.has(id)) {
          score += 8;
        }
      }
      for (const term of terms) {
        if (words.has(term)) {
          score += 3;
        }
      }
      return { playbook, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.playbook.id.localeCompare(b.playbook.id));

  if (!scored.length) {
    const fallback = playbooks.find((playbook) => playbook.id === "feature-slice") || playbooks[0];
    return fallback ? [fallback] : [];
  }

  return scored.slice(0, 3).map(({ playbook }) => playbook);
}

const QUALITY_DOMAIN_KEYWORDS = {
  performance: ["performance", "fps", "latency", "fast", "faster", "speed", "lightweight", "optimize", "optimized", "bundle", "memory", "render", "lag", "smooth"],
  visual: ["ui", "design", "visual", "aesthetic", "polish", "animation", "layout", "typography", "glow", "assets", "brand", "dashboard", "landing", "canvas"],
  playability: ["game", "play", "playability", "controls", "input", "feedback", "reward", "level", "physics", "sound", "sfx", "game feel", "restart"],
  accessibility: ["mobile", "responsive", "keyboard", "focus", "contrast", "reduced motion", "reduced-motion", "screen reader", "touch", "aria"],
  maintainability: ["refactor", "tests", "test", "conventions", "api", "architecture", "maintainable", "helpers", "module", "cleanup", "code"],
  "security/data": ["auth", "secret", "secrets", "database", "payment", "deployment", "external service", "production data", "token", "credential", "permission"]
};

function buildQualityGate(task, proposedApproach = "", intent, rubrics = [], playbook = null, explicitDomains = [], options = {}) {
  const mode = inferTaskMode(task);
  const text = [task, proposedApproach, intent?.name, ...(intent?.aliases || []), ...(rubrics || []).map((rubric) => rubric.id), playbook?.id].join(" ");
  const detectedDomains = detectQualityDomains(text, explicitDomains);
  const rubricIds = new Set((rubrics || []).map((rubric) => rubric.id));
  const intentName = normalize(intent?.name || "");
  const applies =
    options.force ||
    detectedDomains.length > 0 ||
    Boolean(playbook) ||
    ["build", "debug", "review"].includes(mode) ||
    rubricIds.has("agentic_coding") ||
    rubricIds.has("frontend_ui") ||
    rubricIds.has("aesthetic_experience") ||
    rubricIds.has("interactive_canvas") ||
    ["holistic excellence", "quality gate", "triple check", "performance visuals", "playability", "production ready", "settings gui", "intelligent tradeoff"].includes(intentName);

  if (!applies) {
    return null;
  }

  if ((playbook || rubricIds.has("agentic_coding")) && !detectedDomains.includes("maintainability")) {
    detectedDomains.push("maintainability");
  }
  if ((rubricIds.has("frontend_ui") || rubricIds.has("aesthetic_experience") || /\b(ui|design|visual|dashboard|landing|canvas|animation|brand)\b/.test(normalize(text))) && !detectedDomains.includes("visual")) {
    detectedDomains.push("visual");
  }
  if ((rubricIds.has("interactive_canvas") || /\b(game|playability|controls|reward|physics|sound|game feel)\b/.test(normalize(text))) && !detectedDomains.includes("playability")) {
    detectedDomains.push("playability");
  }
  if ((detectedDomains.includes("visual") || detectedDomains.includes("playability")) && !detectedDomains.includes("accessibility")) {
    detectedDomains.push("accessibility");
  }

  const tradeoffWarnings = detectTradeoffRisks([task, proposedApproach].join(" "), detectedDomains);
  const requiredReadFirst = uniqueStrings([
    "quality-contract:vnem-quality-contract",
    "practice:holistic-excellence-intelligent-tradeoffs",
    ...(detectedDomains.includes("visual") || detectedDomains.includes("playability") || detectedDomains.includes("accessibility")
      ? ["design-architecture:vnem-design-architecture", "visual-qa-protocol:vnem-visual-qa-protocol"]
      : []),
    ...(playbook ? [`coding-playbook:${playbook.id}`] : [])
  ]);
  const verificationRequirements = qualityVerificationForDomains(detectedDomains);
  const verdict = tradeoffWarnings.some((warning) => warning.severity === "blocked")
    ? "blocked"
    : tradeoffWarnings.length
      ? "needs_revision"
      : "pass";
  const contract = searchIndex.quality_contract || {};

  return {
    verdict,
    detected_domains: detectedDomains,
    triple_check: contract.triple_check || [
      { step: "Analyze", instruction: "Identify stated goal, hidden requirements, visible/interactive surfaces, and risk domains." },
      { step: "Architect", instruction: "Plan performance and visuals/playability together before lowering quality." },
      { step: "Review", instruction: "Verify no important domain was sacrificed before final output." }
    ],
    quality_floor: contract.quality_floor || [
      "Do not solve one requirement by quietly damaging another important requirement.",
      "If performance conflicts with visuals or playability, first offer an intelligent alternative."
    ],
    tradeoff_policy: contract.tradeoff_policy || [
      "Optimize the actual bottleneck before lowering quality.",
      "Expose user-controllable quality/performance modes when both high performance and high visual quality matter."
    ],
    tradeoff_warnings: tradeoffWarnings,
    required_read_first: requiredReadFirst,
    verification_requirements: verificationRequirements,
    summary:
      "Use this gate before coding and before final output. A passing implementation must preserve every detected quality domain or explicitly report the remaining trade-off with evidence."
  };
}

function detectQualityDomains(value, explicitDomains = []) {
  const text = normalize(value);
  const domains = [];
  for (const domain of explicitDomains) {
    if (QUALITY_DOMAIN_KEYWORDS[domain] && !domains.includes(domain)) {
      domains.push(domain);
    }
  }
  for (const [domain, keywords] of Object.entries(QUALITY_DOMAIN_KEYWORDS)) {
    if (keywords.some((keyword) => text.includes(normalize(keyword))) && !domains.includes(domain)) {
      domains.push(domain);
    }
  }
  return domains;
}

function detectTradeoffRisks(value, domains = []) {
  const text = normalize(value);
  const hasVisualOrPlay = domains.includes("visual") || domains.includes("playability");
  const warnings = [];
  const addWarning = (risk, alternative, severity = "needs_revision") => {
    warnings.push({ risk, alternative, severity });
  };

  if (hasVisualOrPlay && /\b(remove|removing|drop|dropping|disable|disabling|turn off|strip|stripping|cut|cutting)\b.*\b(visual|animation|animations|effect|effects|polish|glow|sound|sfx|feedback)\b/.test(text)) {
    addWarning(
      "Proposed approach lowers visuals/playability to satisfy another goal.",
      "Optimize the bottleneck first, then add quality profiles, adaptive effects, settings toggles, reduced-motion handling, or scoped fallback."
    );
  }
  if (hasVisualOrPlay && /\bjust\b.*\bfast\b|\bmake it fast\b|\bonly performance\b/.test(text)) {
    addWarning(
      "Performance is being treated as the only success criterion.",
      "Keep a high-quality path and provide a deliberate fast/default profile instead of silently degrading the product."
    );
  }
  if (hasVisualOrPlay && /\bskip\b.*\b(browser|screenshot|visual|mobile|rendered|interaction)\b/.test(text)) {
    addWarning(
      "Rendered verification would be skipped for visual or interactive work.",
      "Run or inspect desktop/mobile rendered states, or report blocked visual verification honestly."
    );
  }
  if (hasVisualOrPlay && /\bignore\b.*\b(mobile|responsive|accessibility|keyboard|focus|contrast|reduced motion)\b/.test(text)) {
    addWarning(
      "Accessibility or responsive quality would be ignored.",
      "Preserve responsive fit, focus/keyboard basics, contrast, reduced-motion behavior, or document a scoped fallback."
    );
  }
  if (/\bskip\b.*\b(test|tests|verification|build|typecheck)\b/.test(text)) {
    addWarning(
      "Verification would be skipped.",
      "Run the narrowest relevant check first, then broader checks when blast radius justifies it."
    );
  }

  return warnings;
}

function qualityVerificationForDomains(domains) {
  const checks = ["run the strongest practical focused check for the changed behavior", "report skipped checks and residual risk plainly"];
  if (domains.includes("performance")) {
    checks.push("identify the bottleneck or performance-sensitive path before lowering quality");
  }
  if (domains.includes("visual")) {
    checks.push("inspect or capture desktop and mobile rendered states");
  }
  if (domains.includes("playability")) {
    checks.push("verify one meaningful interaction, control, reward, or feedback moment");
  }
  if (domains.includes("accessibility")) {
    checks.push("check responsive fit, focus/keyboard basics, contrast, and reduced-motion path when relevant");
  }
  if (domains.includes("maintainability")) {
    checks.push("reuse repo conventions and run focused tests/type/build checks where available");
  }
  if (domains.includes("security/data")) {
    checks.push("identify approval gates for auth, secrets, database, payments, deployment, external services, or production data");
  }
  return uniqueStrings(checks);
}

function buildPerceptionGate(task, rubrics) {
  const text = normalize(task);
  const rubricIds = new Set(rubrics.map((rubric) => rubric.id));
  const applies =
    rubricIds.has("aesthetic_experience") ||
    rubricIds.has("frontend_ui") ||
    rubricIds.has("interactive_canvas") ||
    /\b(ui|frontend|design|visual|aesthetic|pretty|polished|game|canvas|animation|neon|glow|sound|dopamine|reward|microinteraction|dashboard|bento|landing|brand|chat|conversational|typography|motion|glass|dark mode|spacing)\b/.test(text);

  if (!applies) {
    return null;
  }

  return {
    required: true,
    verdicts: ["ship-quality", "needs-polish", "blocked"],
    criteria: [
      "first screen looks intentionally designed, balanced, and domain-appropriate",
      "scale, spacing, hierarchy, color, typography, and motion match the user's reference or vibe",
      "reward effects are anchored to the relevant user action or game event",
      "sound and flashes are pleasant, restrained, muteable, and not noisy",
      "if screenshots reveal obvious ugliness, iterate before final instead of reporting done"
    ],
    ship_blockers: [
      "ugly or generic first screen",
      "oversized canvas, board, hero, card, or empty visual surface",
      "unreadable text, weak contrast, broken hierarchy, or text overflow",
      "unbalanced spacing, cramped grouping, or mismatched scale",
      "noisy glow, blur, flash, animation, or particle effects",
      "reward effects that do not originate from the user action or game event",
      "harsh, constant, unthrottled, or non-muteable audio",
      "missing mobile fit or broken responsive layout"
    ],
    design_system_expectations: [
      "reuse existing repo assets, design tokens, CSS variables, and component patterns before inventing new ones",
      "use a coherent spacing scale and keep internal component padding no larger than external separation",
      "choose layout structure deliberately: CSS Grid for two-dimensional dashboard/bento layouts, simpler flow for sequential reading",
      "use readable type scale, line height, and bounded fluid sizing when responsive typography matters",
      "use current WCAG/W3C guidance as the accessibility baseline; treat WCAG 3/APCA-style contrast as watchlist guidance only",
      "provide restrained motion, reduced-motion fallback, and short muteable sound when audio is included",
      "translate reference style into palette, texture, silhouette, glow behavior, and mood rather than disconnected decoration"
    ],
    visual_verification: [
      "inspect or capture a desktop screenshot",
      "inspect or capture a mobile screenshot",
      "verify one core interaction or reward moment",
      "check reduced-motion behavior for motion-heavy surfaces",
      "check audio unlock, throttling, and mute behavior when sound is included"
    ],
    repo_sensing: [
      "inspect existing design tokens, CSS variables, Tailwind/theme config, and component patterns",
      "inspect local assets, public images, icons, fonts, screenshots, and user-provided references",
      "inspect current routes, layout constraints, canvas sizing, HUD/hero/card scale, and mobile breakpoints",
      "inspect package manifests for existing UI, game, animation, audio, and browser-test tooling before adding anything",
      "use repo-native assets and styles first; ask before fetching media, generating assets, adding dependencies, or changing config"
    ]
  };
}

function inferTaskMode(task) {
  const text = normalize(task);
  if (/\b(prompt|prompting|prompt-engineering|template prompt|system prompt|developer prompt|instructions?)\b/.test(text)) return "prompt";
  if (/\b(debug|fix failing|failing test|error|stack trace|regression|diagnose|root cause)\b/.test(text)) return "debug";
  if (/\b(review|audit|assess|inspect|critique|find bugs|pr review)\b/.test(text)) return "review";
  if (/\b(plan|architect|architecture|proposal|strategy|policy)\b/.test(text)) return "plan";
  if (/\b(build|create|make|implement|develop|ship|add)\b/.test(text)) return "build";
  if (/\bdesign\b/.test(text)) return "plan";
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
  const exactName =
    Object.keys(aliases).find((name) => normalize(name) === queryText) ||
    Object.keys(routeMap).find((name) => normalize(name) === queryText);
  if (exactName) {
    const exactAliases = aliases[exactName];
    return {
      name: exactName,
      aliases: Array.isArray(exactAliases) ? exactAliases : [],
      route: routeMap[exactName] || null
    };
  }
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
    if (recommendation.task_contract.coding_playbook?.id) {
      lines.push(`Coding playbook: ${recommendation.task_contract.coding_playbook.id}`);
    }
    if (recommendation.task_contract.quality_gate?.verdict) {
      lines.push(`Quality gate: ${recommendation.task_contract.quality_gate.verdict}`);
      if (recommendation.task_contract.quality_gate.detected_domains?.length) {
        lines.push(`Quality domains: ${recommendation.task_contract.quality_gate.detected_domains.join(", ")}`);
      }
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
    if (recommendation.task_contract.quality_gate?.triple_check?.length) {
      lines.push(`- Triple-check: ${recommendation.task_contract.quality_gate.triple_check.map((item) => item.step).join(" -> ")}`);
    }
    if (recommendation.task_contract.quality_gate?.tradeoff_warnings?.length) {
      lines.push(`- Trade-off warnings: ${recommendation.task_contract.quality_gate.tradeoff_warnings.map((warning) => warning.risk).join("; ")}`);
    }
    if (recommendation.task_contract.quality_gate?.verification_requirements?.length) {
      lines.push(`- Quality verification: ${recommendation.task_contract.quality_gate.verification_requirements.slice(0, 5).join("; ")}`);
    }
    if (recommendation.task_contract.coding_playbook?.execution_loop?.length) {
      lines.push(`- Playbook loop: ${recommendation.task_contract.coding_playbook.execution_loop.slice(0, 4).join("; ")}`);
    }
    lines.push(`- Smallest sufficient capability: ${recommendation.task_contract.smallest_sufficient_capability}`);
    if (recommendation.task_contract.approval_gates?.length) {
      lines.push(`- Approval gates: ${recommendation.task_contract.approval_gates.slice(0, 5).join("; ")}`);
    }
    if (recommendation.task_contract.perception_gate?.required) {
      lines.push(`- Perception gate: ${recommendation.task_contract.perception_gate.criteria.slice(0, 5).join("; ")}`);
      if (recommendation.task_contract.perception_gate.ship_blockers?.length) {
        lines.push(`- Design blockers: ${recommendation.task_contract.perception_gate.ship_blockers.slice(0, 4).join("; ")}`);
      }
      if (recommendation.task_contract.perception_gate.visual_verification?.length) {
        lines.push(`- Visual verification: ${recommendation.task_contract.perception_gate.visual_verification.slice(0, 5).join("; ")}`);
      }
      if (recommendation.task_contract.perception_gate.repo_sensing?.length) {
        lines.push(`- Repo sensing: ${recommendation.task_contract.perception_gate.repo_sensing.slice(0, 4).join("; ")}`);
      }
    }
    if (recommendation.task_contract.verification?.length) {
      lines.push(`- Verification: ${recommendation.task_contract.verification.slice(0, 5).join("; ")}`);
    }
  }

  lines.push("", `Safety: ${recommendation.safety}`);
  return lines.join("\n");
}

function formatQualityGate(result) {
  const gate = result.quality_gate;
  const lines = [`vnem quality gate: ${result.task}`];
  lines.push(`Verdict: ${gate.verdict}`);
  if (gate.detected_domains?.length) {
    lines.push(`Domains: ${gate.detected_domains.join(", ")}`);
  }
  if (gate.triple_check?.length) {
    lines.push("", "Triple-Check Workflow:");
    for (const item of gate.triple_check) {
      lines.push(`- ${item.step}: ${item.instruction}`);
    }
  }
  if (gate.tradeoff_warnings?.length) {
    lines.push("", "Trade-off warnings:");
    for (const warning of gate.tradeoff_warnings) {
      lines.push(`- ${warning.risk} Alternative: ${warning.alternative}`);
    }
  }
  if (gate.required_read_first?.length) {
    lines.push("", `Read first: ${gate.required_read_first.join(", ")}`);
  }
  if (gate.verification_requirements?.length) {
    lines.push("", "Verification requirements:", ...gate.verification_requirements.map((item) => `- ${item}`));
  }
  lines.push("", `Safety: ${result.safety}`);
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

function formatStatus(status) {
  return [
    `vnem status: ${status.version}`,
    `Generated: ${status.generated_at || "unknown"}`,
    `Release: ${status.release_version || "unknown"} (${status.release_date || "unknown date"})`,
    "",
    "Loaded data:",
    `- Registry entries: ${status.counts.registry_entries}`,
    `- Search documents: ${status.counts.search_documents}`,
    `- Intent routes: ${status.counts.intent_routes}`,
    `- Install guide: ${status.counts.install_guide ? "loaded" : "missing"}`,
    `- Quality contract: ${status.counts.quality_contract ? "loaded" : "missing"}`,
    `- Source-radar entries: ${status.counts.source_radar_entries}`,
    `- Task rubrics: ${status.counts.task_rubrics}`,
    `- Prompt patterns: ${status.counts.prompt_patterns}`,
    "",
    "MCP surface:",
    `- Tools: ${status.mcp.tools.join(", ")}`,
    `- Prompts: ${status.mcp.prompts.join(", ")}`,
    `- Key resources: ${status.mcp.resources.slice(0, 10).join(", ")}${status.mcp.resources.length > 10 ? ", ..." : ""}`,
    "",
    `Safety: ${status.safety.mode}. Installs packages: ${status.safety.installs_packages}. Edits files: ${status.safety.edits_files}. Calls upstream services: ${status.safety.calls_upstream_services}.`
  ].join("\n");
}

function formatOverview(overview) {
  const lines = [`vnem overview (${overview.audience})`, "", overview.one_sentence, "", "Usable surfaces:"];
  for (const surface of overview.surfaces) {
    lines.push(`- ${surface.name}: ${surface.purpose}`);
    lines.push(`  Paths: ${surface.paths.join(", ")}`);
    lines.push(`  Use via: ${surface.usable_via.join(", ")}`);
  }
  lines.push("", "Safe workflow:", ...overview.safe_workflow.map((item) => `- ${item}`));
  lines.push("", "Not yet:", ...overview.what_vnem_is_not_yet.map((item) => `- ${item}`));
  return lines.join("\n");
}

function formatRouteIntent(result) {
  const lines = [`vnem route intent: ${result.intent}`];
  if (result.resolved_intent) {
    lines.push(`Resolved: ${result.resolved_intent.name}`);
  } else {
    lines.push("Resolved: none");
  }
  lines.push(`Mode: ${result.mode}`);
  if (result.route?.compare_options?.length) {
    lines.push(`Compare options: ${result.route.compare_options.join("; ")}`);
  }
  if (result.route?.choose_by?.length) {
    lines.push(`Choose by: ${result.route.choose_by.join("; ")}`);
  }
  if (result.rubrics?.length) {
    lines.push(`Rubrics: ${result.rubrics.map((rubric) => rubric.id).join(", ")}`);
  }
  if (result.route?.read_first?.length) {
    lines.push("", "Route read-first:");
    for (const id of result.route.read_first) {
      lines.push(`- ${id}`);
    }
  }
  if (result.read_first?.length) {
    lines.push("", "Matched documents:");
    for (const doc of result.read_first) {
      lines.push(formatResultLine(doc));
    }
  }
  lines.push("", `Safety: ${result.safety}`);
  return lines.join("\n");
}

function formatSourceDetail(source) {
  const lines = [
    `${source.title} (${source.id})`,
    `${source.category || "source"} / priority: ${source.priority || "unknown"}`,
    "",
    source.summary || "No summary."
  ];
  if (source.use_when?.length) {
    lines.push("", "Use when:", ...source.use_when.map((item) => `- ${item}`));
  }
  if (source.monitor?.length) {
    lines.push("", "Monitor:", ...source.monitor.map((item) => `- ${item}`));
  }
  if (source.risk_checks?.length) {
    lines.push("", "Risk checks:", ...source.risk_checks.map((item) => `- ${item}`));
  }
  if (source.source_urls?.length) {
    lines.push("", "Sources:", ...source.source_urls.map((url) => `- ${url}`));
  }
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

function countBy(items, getKey) {
  return items.reduce((counts, item) => {
    const key = getKey(item);
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
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
