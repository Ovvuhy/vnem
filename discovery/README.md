# Discovery

Discovery automation gathers candidate signals from source-backed places such as official registries, releases, package metadata, official docs/RSS feeds, and curated ecosystem sources.

Candidates are review inputs only. They are not trusted registry entries.

Forum and social sources are allowed only as discovery leads. Hacker News, Reddit, or similar discussions can identify what builders are noticing, but they do not establish facts by themselves. Promote those leads only after finding primary sources such as a repository, official release, docs page, model card, benchmark artifact, package registry record, or paper.

## Flow

1. Discovery writes candidate reports into `discovery/candidates/`.
2. Reports include route metadata such as `github-search`, `github-releases`, `mcp-registry`, `npm-search`, `hacker-news`, `reddit`, or `watch-urls`.
3. Automation opens a PR with sources, validation output, and suggested trust tiers when credentials are configured.
4. Maintainers review provenance, license clarity, install guidance, and safety notes.
5. Approved candidates are promoted into `registry/entries/{slug}/`.
6. Generated artifacts are refreshed with `npm run generate`.

## Rules

- Open PRs only; no auto-merge in v1.
- Prefer official or primary sources.
- Keep social monitoring optional and terms-compliant.
- Mark social/forum-only candidates as `watchlist` with `needs-primary-source`.
- Use conservative trust tiers.
- Do not vendor third-party code or long docs excerpts.

The daily digest is a maintainer-friendly summary, not a raw feed.
