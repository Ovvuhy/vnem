export function vectorLabel(value) {
  const map = {
    github: "GitHub Repositories",
    npm: "NPM Package Registry",
    mcp: "MCP Tool Catalog"
  };
  return map[value] ?? "GitHub Repositories";
}

export function vectorRoute(value) {
  const map = {
    github: "github-search",
    npm: "npm-search",
    mcp: "mcp-registry"
  };
  return map[value] ?? "github-search";
}

export function humanize(value) {
  return String(value ?? "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function formatTime(value) {
  if (!value) return "--:--";
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(new Date(value));
}

export function clampPercent(value) {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(100, Math.round(number)));
}

export function formatMetric(value, digits = 2) {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number)) return "0";
  return number.toFixed(digits).replace(/\.?0+$/, "");
}
