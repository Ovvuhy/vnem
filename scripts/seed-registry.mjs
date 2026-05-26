import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";
import { ENTRIES_DIR, ROOT } from "./lib/registry.mjs";

const limitArgIndex = process.argv.indexOf("--limit");
const limit = limitArgIndex >= 0 ? Number(process.argv[limitArgIndex + 1]) : 150;
const endpoint = process.env.MCP_REGISTRY_URL ?? "https://registry.modelcontextprotocol.io/v0.1/servers";
const today = new Date().toISOString().slice(0, 10);

const fallbackServers = [
  {
    name: "io.modelcontextprotocol/filesystem",
    title: "Filesystem MCP Server",
    description: "Reference MCP server for scoped local filesystem access.",
    repository: { url: "https://github.com/modelcontextprotocol/servers" }
  },
  {
    name: "io.modelcontextprotocol/memory",
    title: "Memory MCP Server",
    description: "Reference MCP server for simple persistent memory across agent sessions.",
    repository: { url: "https://github.com/modelcontextprotocol/servers" }
  },
  {
    name: "io.modelcontextprotocol/sequential-thinking",
    title: "Sequential Thinking MCP Server",
    description: "Reference MCP server for structured multi-step reasoning traces.",
    repository: { url: "https://github.com/modelcontextprotocol/servers" }
  },
  {
    name: "io.modelcontextprotocol/fetch",
    title: "Fetch MCP Server",
    description: "Reference MCP server for retrieving and transforming web content.",
    repository: { url: "https://github.com/modelcontextprotocol/servers" }
  },
  {
    name: "github/github-mcp-server",
    title: "GitHub MCP Server",
    description: "MCP server for GitHub repositories, issues, pull requests, and workflows.",
    repository: { url: "https://github.com/github/github-mcp-server" }
  }
];

async function fetchRegistryServers() {
  const servers = [];
  let cursor = null;

  while (servers.length < limit) {
    const pageLimit = Math.min(100, limit - servers.length);
    const url = new URL(endpoint);
    url.searchParams.set("limit", String(pageLimit));
    url.searchParams.set("version", "latest");
    if (cursor) url.searchParams.set("cursor", cursor);

    const response = await fetch(url, { redirect: "follow" });
    if (!response.ok) {
      throw new Error(`registry returned ${response.status}`);
    }

    const json = await response.json();
    const page = json.servers ?? json.data ?? [];
    servers.push(...page.map((item) => item?.server ?? item));
    cursor = json.metadata?.nextCursor ?? json.metadata?.next_cursor ?? json.nextCursor ?? null;

    if (!cursor || page.length === 0) break;
  }

  return servers;
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/^@/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 86)
    .replace(/-+$/g, "") || "entry";
}

function arrayFrom(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  return [value].filter(Boolean);
}

function compactUnique(values) {
  return [...new Set(values.filter(Boolean))];
}

function findRepoUrl(server) {
  const candidates = [
    server.repo_url,
    server.repository_url,
    server.repository?.url,
    server.repo?.url,
    server.source?.url,
    server.homepage_url,
    server.homepage
  ];
  return candidates.find((value) => typeof value === "string" && value.includes("github.com")) ?? null;
}

function findHomepageUrl(server) {
  const candidates = [
    server.homepage_url,
    server.websiteUrl,
    server.homepage,
    server.website,
    server.repository?.url,
    server.source?.url
  ];
  return candidates.find((value) => typeof value === "string" && value.startsWith("http")) ?? null;
}

function registrySourceUrl(name) {
  return `https://registry.modelcontextprotocol.io/v0.1/servers/${encodeURIComponent(name)}/versions/latest`;
}

function inferTags(text) {
  const haystack = text.toLowerCase();
  const tags = ["mcp", "agent-tools"];
  const checks = [
    ["github", "github"],
    ["browser", "browser"],
    ["search", "search"],
    ["file", "filesystem"],
    ["database", "database"],
    ["postgres", "database"],
    ["memory", "memory"],
    ["payment", "payments"],
    ["wallet", "payments"],
    ["security", "security"],
    ["deploy", "deployment"],
    ["documentation", "docs"],
    ["docs", "docs"],
    ["analytics", "analytics"],
    ["api", "api"],
    ["test", "testing"],
    ["eval", "evals"],
    ["salesforce", "crm"],
    ["slack", "collaboration"]
  ];

  for (const [needle, tag] of checks) {
    if (haystack.includes(needle)) tags.push(tag);
  }

  return compactUnique(tags).slice(0, 8);
}

function inferUseCases(text) {
  const haystack = text.toLowerCase();
  const useCases = ["Extend agents with external tools"];
  if (haystack.includes("search")) useCases.push("Give agents searchable web or knowledge access");
  if (haystack.includes("file")) useCases.push("Let agents work with scoped files");
  if (haystack.includes("database") || haystack.includes("postgres")) useCases.push("Connect agents to structured data");
  if (haystack.includes("memory")) useCases.push("Persist useful context between sessions");
  if (haystack.includes("deploy")) useCases.push("Help agents ship and operate software");
  if (haystack.includes("github")) useCases.push("Let agents inspect and change repositories");
  if (haystack.includes("security")) useCases.push("Improve agent security review and guardrails");
  return compactUnique(useCases).slice(0, 5);
}

function inferBestFor(text) {
  const haystack = text.toLowerCase();
  const bestFor = ["Agents that need a focused MCP capability from an official registry source"];
  if (haystack.includes("search")) bestFor.push("Search, retrieval, and research workflows");
  if (haystack.includes("database") || haystack.includes("data")) bestFor.push("Data access, analytics, or reporting workflows");
  if (haystack.includes("payment") || haystack.includes("wallet") || haystack.includes("x402")) bestFor.push("Agent payments, commerce, or wallet-enabled workflows");
  if (haystack.includes("security") || haystack.includes("trust")) bestFor.push("Trust, identity, compliance, or safety checks");
  if (haystack.includes("ui") || haystack.includes("design")) bestFor.push("Design, UI, or product-building workflows");
  return compactUnique(bestFor).slice(0, 5);
}

function inferRecommendedWhen(text) {
  const haystack = text.toLowerCase();
  const recommendations = ["Use when this capability matches a concrete project need and the upstream source has been reviewed"];
  if (haystack.includes("github")) recommendations.push("Use when the project already depends on GitHub issues, pull requests, releases, or repositories");
  if (haystack.includes("memory")) recommendations.push("Use when the agent needs persistent context between sessions");
  if (haystack.includes("eval") || haystack.includes("test")) recommendations.push("Use when validating outputs matters more than raw generation speed");
  if (haystack.includes("payment") || haystack.includes("x402")) recommendations.push("Use when agent actions involve paid APIs, commerce, or receipts");
  return compactUnique(recommendations).slice(0, 5);
}

function inferPermissions(text) {
  const haystack = text.toLowerCase();
  const permissions = ["network"];
  if (haystack.includes("file")) permissions.push("filesystem");
  if (haystack.includes("database") || haystack.includes("postgres")) permissions.push("database");
  if (haystack.includes("browser")) permissions.push("browser");
  if (haystack.includes("github")) permissions.push("repository");
  if (haystack.includes("payment") || haystack.includes("wallet")) permissions.push("payments");
  return compactUnique(permissions);
}

function packageUrls(server) {
  const packages = arrayFrom(server.packages);
  const urls = [];
  for (const pkg of packages) {
    if (typeof pkg === "string" && pkg.startsWith("http")) urls.push(pkg);
    if (pkg?.url) urls.push(pkg.url);
    if (pkg?.registry_url) urls.push(pkg.registry_url);
    if (pkg?.name && pkg.registry === "npm") urls.push(`https://www.npmjs.com/package/${pkg.name}`);
    if (pkg?.name && pkg.registry === "pypi") urls.push(`https://pypi.org/project/${pkg.name}/`);
  }
  return compactUnique(urls);
}

function licenses(server) {
  const values = [
    ...arrayFrom(server.license),
    ...arrayFrom(server.licenses),
    ...arrayFrom(server.metadata?.license)
  ];
  return compactUnique(values.map((value) => typeof value === "string" ? value : value?.id)).filter(Boolean).slice(0, 4);
}

function ownerFrom(name, repoUrl) {
  if (repoUrl?.includes("github.com/")) {
    const [, owner] = repoUrl.match(/github\.com\/([^/]+)/) ?? [];
    if (owner) return owner;
  }
  if (name.includes("/")) return name.split("/")[0];
  return "Unknown upstream owner";
}

function toEntry(server, slug) {
  const name = server.name ?? server.id ?? slug;
  const title = server.title ?? server.display_name ?? name;
  const description = server.description ?? server.summary ?? `${title} is an MCP server discovered from the official registry.`;
  const repoUrl = findRepoUrl(server);
  const homepageUrl = findHomepageUrl(server);
  const sourceUrls = compactUnique([
    registrySourceUrl(name),
    repoUrl,
    homepageUrl,
    ...arrayFrom(server.source_urls)
  ]);
  const text = `${name} ${title} ${description}`;
  const licenseValues = licenses(server);

  return {
    schema_version: "1.0.0",
    slug,
    name: title,
    type: "mcp-server",
    summary_llm: `${title} is an MCP server for agentic systems. ${description}`.slice(0, 410),
    homepage_url: homepageUrl,
    repo_url: repoUrl,
    package_urls: packageUrls(server),
    licenses: licenseValues.length ? licenseValues : ["NOASSERTION"],
    copyright_owner: ownerFrom(name, repoUrl),
    source_urls: sourceUrls,
    source_kind: "official_registry",
    protocols: ["MCP"],
    clients: ["Claude Desktop", "Cursor", "Windsurf", "VS Code", "OpenAI Agents SDK"],
    install: {
      command: null,
      notes: "Install from the upstream source after reviewing its permissions, environment variables, and transport configuration.",
      config_example: null
    },
    permissions: inferPermissions(text),
    env_vars: [],
    tags: inferTags(text),
    use_cases: inferUseCases(text),
    best_for: inferBestFor(text),
    not_for: ["Projects that cannot review upstream permissions, network behavior, or data handling"],
    alternatives: [],
    supersedes: [],
    freshness: "current",
    source_confidence: "official",
    maintenance_signals: ["Listed in the official MCP Registry latest-version feed"],
    risk_flags: licenseValues.length ? [] : ["license-not-asserted"],
    recommended_when: inferRecommendedWhen(text),
    trust_tier: "promising",
    review_status: "bot-reviewed",
    last_checked: today
  };
}

function profileFor(entry) {
  const source = entry.source_urls[0];
  return `# ${entry.name}

${entry.summary_llm}

## When To Use

Use this when an agent needs ${entry.use_cases[0].toLowerCase()} through a tool surface that can be reviewed and permissioned.

## Review Notes

Trust tier: ${entry.trust_tier}. This entry was seeded from an official registry source and still needs maintainer review before it should be treated as verified.

Primary source: ${source}
`;
}

let servers;
try {
  servers = await fetchRegistryServers();
  console.log(`Fetched ${servers.length} servers from ${endpoint}.`);
} catch (error) {
  servers = fallbackServers;
  console.warn(`Live registry fetch failed (${error.message}); using ${servers.length} fallback entries.`);
}

const seenSlugs = new Map();
const entries = servers.slice(0, limit).map((server) => {
  const base = slugify(server.name ?? server.title ?? server.id ?? "entry");
  const count = seenSlugs.get(base) ?? 0;
  seenSlugs.set(base, count + 1);
  const slug = count === 0 ? base : `${base}-${count + 1}`;
  return toEntry(server, slug);
});

const seenRepoUrls = new Set();
const seenPackageUrls = new Set();
for (const entry of entries) {
  if (entry.repo_url) {
    if (seenRepoUrls.has(entry.repo_url)) {
      entry.source_urls = compactUnique([...entry.source_urls, entry.repo_url]);
      entry.repo_url = null;
    } else {
      seenRepoUrls.add(entry.repo_url);
    }
  }

  entry.package_urls = entry.package_urls.filter((url) => {
    if (seenPackageUrls.has(url)) {
      entry.source_urls = compactUnique([...entry.source_urls, url]);
      return false;
    }
    seenPackageUrls.add(url);
    return true;
  });
}

await rm(ENTRIES_DIR, { recursive: true, force: true });

for (const entry of entries) {
  const dir = path.join(ENTRIES_DIR, entry.slug);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "entry.yaml"), yaml.dump(entry, {
    lineWidth: 100,
    noRefs: true,
    sortKeys: false
  }));
  await writeFile(path.join(dir, "profile.md"), profileFor(entry));
}

console.log(`Seeded ${entries.length} registry entries under ${path.relative(ROOT, ENTRIES_DIR)}.`);
