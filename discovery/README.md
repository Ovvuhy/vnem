# Discovery

Discovery automation gathers candidate signals from source-backed places such as official registries, releases, package metadata, official docs/RSS feeds, and curated ecosystem sources.

Candidates are review inputs only. They are not trusted registry entries.

## Flow

1. Discovery writes candidate reports into `discovery/candidates/`.
2. Automation opens a PR with sources, validation output, and suggested trust tiers.
3. Maintainers review provenance, license clarity, install guidance, and safety notes.
4. Approved candidates are promoted into `registry/entries/{slug}/`.
5. Generated artifacts are refreshed with `npm run generate`.

## Rules

- Open PRs only; no auto-merge in v1.
- Prefer official or primary sources.
- Keep social monitoring optional and terms-compliant.
- Use conservative trust tiers.
- Do not vendor third-party code or long docs excerpts.

The daily digest is a maintainer-friendly summary, not a raw feed.
