import path from "node:path";
import { ROOT, readEntries, writeJson } from "./lib/registry.mjs";

const apply = process.argv.includes("--apply");
const limit = Number(process.env.DISCOVERY_LIMIT ?? 40);
const endpoint = process.env.MCP_REGISTRY_URL ?? "https://registry.modelcontextprotocol.io/v0.1/servers";
const existing = new Set((await readEntries()).flatMap((item) => [
  item.entry.name,
  ...item.entry.source_urls
]));

async function fetchOfficialRegistry() {
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

function registrySourceUrl(serverName) {
  return `https://registry.modelcontextprotocol.io/v0.1/servers/${encodeURIComponent(serverName)}/versions/latest`;
}

function summarize(server) {
  const name = server.name ?? server.id ?? "unknown-server";
  const sourceUrl = registrySourceUrl(name);
  return {
    name,
    title: server.title ?? name,
    description: server.description ?? server.summary ?? "No description supplied by the source registry.",
    version: server.version ?? server.latest_version ?? server.latest?.version ?? null,
    source_url: sourceUrl,
    suggested_trust_tier: "promising",
    reason: existing.has(name) || existing.has(sourceUrl) ? "already-indexed" : "candidate"
  };
}

let candidates = [];
try {
  candidates = (await fetchOfficialRegistry()).map(summarize);
} catch (error) {
  candidates = [{
    name: "discovery-unavailable",
    title: "Discovery unavailable",
    description: `Official registry fetch failed: ${error.message}`,
    source_url: endpoint,
    suggested_trust_tier: "watchlist",
    reason: "fetch-failed"
  }];
}

const report = {
  generated_at: new Date().toISOString(),
  source: endpoint,
  candidates
};

if (apply) {
  const stamp = new Date().toISOString().slice(0, 10);
  await writeJson(path.join(ROOT, "discovery", "candidates", `${stamp}-official-mcp-registry.json`), report);
  console.log(`Wrote ${candidates.length} discovery candidate(s).`);
} else {
  console.log(JSON.stringify(report, null, 2));
}
