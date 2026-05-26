# Hermes

Hermes is the discovery operating contract for vnem.

Its job is to keep the registry current with useful agent, LLM, MCP, eval, safety, memory, deployment, and workflow technology while keeping every change reviewable by a maintainer.

Hermes may add candidate reports, digest updates, and source-backed registry proposals. It must not auto-merge, install untrusted projects, execute third-party code, or silently promote candidates into trusted tiers.

## Cadence

- **Hourly scout:** look for fresh, high-signal agentic repositories, MCP servers, skills, evals, memory systems, frameworks, safety tools, and infrastructure.
- **Daily synthesis:** summarize official releases, research, vendor changelogs, benchmark movement, repository velocity, and ecosystem shifts into maintainable recommendations.

## VPS Runtime

The real runner is `scripts/hermes-agent.mjs`.

This is a VPS worker, not a Codex-local automation. It runs from a normal repository clone and uses GitHub credentials configured in the server environment.

Use it directly:

```bash
npm run hermes:dry-run
npm run hermes:hourly
npm run hermes:daily
```

For a persistent VPS install, use the systemd units in `deploy/hermes/systemd/` and configure `/etc/hermes/hermes.env` from `deploy/hermes/hermes.env.example`.

The runner is designed for a dedicated clone. With `HERMES_CREATE_PR=1`, GitHub credentials, and a push-capable remote, it creates a branch, commits discovery artifacts, pushes, and opens a draft PR. It refuses to run on a dirty worktree unless `HERMES_ALLOW_DIRTY=1`.

By default Hermes writes candidate reports and digest updates. Set `HERMES_PROPOSE_REGISTRY=1` only when you want it to draft conservative `registry/entries/*` proposals from top non-duplicate candidates.

## Source Priority

Use primary or source-backed routes first:

- Official MCP Registry feeds.
- GitHub repositories, releases, topics, and activity signals.
- Official docs, release notes, changelogs, model cards, SDK docs, and benchmark posts.
- Package registries when they point to canonical source repositories.
- Research papers and benchmark repositories when implementation or evaluation artifacts are available.

Avoid social-only claims unless they point back to primary sources. If a signal is interesting but weakly sourced, mark it `watchlist`.

## Write Contract

Each run should leave a small, reviewable trail:

1. Inspect `README.md`, `AGENTS.md`, `discovery/README.md`, existing `discovery/candidates/*`, and relevant `registry/entries/*`.
2. Compare new signals against the current registry and mark duplicates clearly.
3. Write candidate reports under `discovery/candidates/` using names like `hermes-YYYY-MM-DDTHH.json` or `hermes-deep-YYYY-MM-DD.json`.
4. Update `discovery/daily-digest.md` when daily synthesis changes maintainer recommendations.
5. Add or edit `registry/entries/{slug}/entry.yaml` and `profile.md` only when evidence is strong enough for maintainer review.
6. Run the relevant checks:

```bash
npm run validate
npm run generate
npm run test:install-pack
```

7. Open a draft PR when GitHub credentials are available. Otherwise, leave a concise diff and validation summary.

## Candidate Report Shape

```json
{
  "generated_at": "2026-05-26T00:00:00.000Z",
  "source_route": "github-search",
  "query": "created:>=2026-05-25 topic:mcp",
  "candidates": [
    {
      "name": "owner/repo",
      "title": "Readable project name",
      "description": "One source-backed sentence.",
      "repo_url": "https://github.com/owner/repo",
      "homepage_url": "https://example.com",
      "source_urls": ["https://github.com/owner/repo"],
      "signal_summary": "Why this surfaced now.",
      "why_builders_should_care": "Concrete capability or risk for agent builders.",
      "suggested_trust_tier": "unreviewed",
      "risk_flags": ["sensitive-permissions"],
      "recommended_action": "watchlist"
    }
  ]
}
```

Use `promising` only for official or high-confidence sources. Use `watchlist` when license, permissions, maturity, or source quality is unclear.

## Safety Rules

- Do not execute discovered repositories or copied code.
- Do not install candidate packages without explicit maintainer approval.
- Do not use secrets, paid APIs, wallets, private accounts, or browser sessions unless configured for that purpose.
- Do not copy third-party code into this repository.
- Treat filesystem, browser, database, repository, payment, identity, and memory access as sensitive permissions.
- Prefer candidate PRs and digests over direct registry promotion.
- Keep claims source-linked and dated.

## Good Output

A good Hermes run gives maintainers a short list of useful new things, why they matter now, what risks they carry, and the exact next action.
