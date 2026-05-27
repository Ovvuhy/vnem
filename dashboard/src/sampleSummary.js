export const sampleSummary = {
  generated_at: "2026-05-27T17:32:00.000Z",
  repo_status: {
    branch: "main",
    revision: "a17c3f0",
    dirty_files: 0,
    clean: true
  },
  timers: {
    hourly: {
      active_state: "active",
      service_result: "success",
      next: "Wed 2026-05-27 18:00:00 CEST",
      last_trigger: "Wed 2026-05-27 17:00:02 CEST"
    },
    daily: {
      active_state: "active",
      service_result: "success",
      next: "Thu 2026-05-28 08:30:00 CEST",
      last_trigger: "Wed 2026-05-27 08:35:12 CEST"
    },
    brain: {
      active_state: "active",
      service_result: "success",
      next: "Thu 2026-05-28 09:05:00 CEST",
      last_trigger: "Wed 2026-05-27 09:12:44 CEST"
    }
  },
  runs: [
    {
      generated_at: "2026-05-27T17:00:02.000Z",
      mode: "hourly",
      candidates: 18,
      fresh_candidates: 7,
      source_routes: ["github-search", "github-releases", "npm-search", "hacker-news", "mcp-registry"],
      errors: 1,
      watched_sources: 0
    },
    {
      generated_at: "2026-05-27T08:35:12.000Z",
      mode: "daily",
      candidates: 28,
      fresh_candidates: 9,
      source_routes: ["github-search", "github-releases", "npm-search", "hacker-news", "watch-urls"],
      errors: 0,
      watched_sources: 6
    }
  ],
  findings: [
    {
      id: "1",
      generated_at: "2026-05-27T17:00:02.000Z",
      source_route: "github-releases",
      title: "mcp-gateway: v0.4.0",
      source_url: "https://github.com/microsoft/mcp-gateway",
      suggested_trust_tier: "promising",
      risk_flags: [],
      recommended_action: "review",
      reason: "candidate",
      signal_summary: "Watched gateway repository published a new release.",
      metrics: { stars: 930, license: "MIT", version: "v0.4.0", language: "Go" }
    },
    {
      id: "2",
      generated_at: "2026-05-27T17:00:02.000Z",
      source_route: "hacker-news",
      title: "Discussion: new long-context coding agent benchmarks",
      source_url: "https://news.ycombinator.com/item?id=999",
      suggested_trust_tier: "watchlist",
      risk_flags: ["social-signal", "needs-primary-source"],
      recommended_action: "watchlist",
      reason: "candidate",
      signal_summary: "Lead surfaced from HN; needs primary source.",
      metrics: { points: 112, comments: 34 }
    },
    {
      id: "3",
      generated_at: "2026-05-27T08:35:12.000Z",
      source_route: "npm-search",
      title: "@example/mcp-agent-memory",
      source_url: "https://www.npmjs.com/package/@example/mcp-agent-memory",
      suggested_trust_tier: "unreviewed",
      risk_flags: ["license-not-asserted", "sensitive-permissions"],
      recommended_action: "watchlist",
      reason: "candidate",
      signal_summary: "Matched npm search for agent memory.",
      metrics: { npm_score: 0.72, version: "0.3.1", license: null }
    }
  ],
  aggregates: {
    total_findings: 3,
    today: 3,
    seven_days: 3,
    by_route: { "github-releases": 1, "hacker-news": 1, "npm-search": 1 },
    by_trust_tier: { promising: 1, watchlist: 1, unreviewed: 1 },
    by_action: { review: 1, watchlist: 2 },
    by_risk_flag: { "social-signal": 1, "needs-primary-source": 1, "license-not-asserted": 1, "sensitive-permissions": 1 }
  },
  source_health: [
    { route: "github-search", status: "active", candidates: 8, errors: 0 },
    { route: "github-releases", status: "active", candidates: 5, errors: 0 },
    { route: "npm-search", status: "active", candidates: 4, errors: 0 },
    { route: "hacker-news", status: "active", candidates: 1, errors: 0 },
    { route: "mcp-registry", status: "degraded", candidates: 0, errors: 1 },
    { route: "watch-urls", status: "quiet", candidates: 0, watched_sources: 6, errors: 0 }
  ],
  errors: [
    {
      generated_at: "2026-05-27T17:00:02.000Z",
      route: "mcp-registry",
      source: "official registry",
      error: "timeout"
    }
  ],
  digest: {
    available: true,
    generated_at: "2026-05-27T08:35:12.000Z",
    excerpt: "Hermes summarizes source-backed agent and LLM ecosystem signals. This digest does not auto-promote entries into the registry.",
    maintainer_actions: [
      "Review Hermes candidate reports before merging.",
      "Promote candidates only after checking source links, license posture, permissions, and install docs."
    ],
    brain_pass: "Latest daily run produced the current digest."
  }
};
