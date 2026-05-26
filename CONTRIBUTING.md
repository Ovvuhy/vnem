# Contributing

vnem accepts source-backed entries for tools that make agents, LLMs, or agent builders more capable, safer, easier to evaluate, easier to deploy, or easier to operate.

## Good Contributions

- New MCP servers, agent tools, skills, evals, memory/context systems, safety tools, payment/identity rails, or workflow patterns.
- Corrections to license, owner, source, install, permission, or risk metadata.
- Better recommendation fields: `best_for`, `not_for`, `alternatives`, `freshness`, `risk_flags`, and `recommended_when`.
- Discovery improvements that open reviewable PRs instead of merging directly.

## Entry Requirements

Every entry needs:

- a canonical source URL
- upstream owner/copyright holder
- SPDX license identifier, or `NOASSERTION`
- original short summary
- conservative trust tier
- enough tags/use cases for search to find it

Do not include copied source code, vendored packages, secrets, credentials, or long upstream README/docs excerpts.

## Add An Entry

1. Create `registry/entries/{slug}/entry.yaml`.
2. Create `registry/entries/{slug}/profile.md`.
3. Run:

```bash
npm run validate
npm run generate
npm run test:install-pack
```

4. Review generated `llms.txt`, `llms-full.txt`, `public/api/index.json`, `public/install/*`, and `public/install.tgz`.
5. Open a PR with source links and the intended trust tier.

## Trust Tier Guidance

- Use `verified` only when install/docs were manually reviewed.
- Use `promising` for official or high-signal sources that are not fully tested.
- Use `unreviewed` for discovered entries with limited validation.
- Use `watchlist` when usefulness is plausible but quality, license, or security is uncertain.
- Use `deprecated` when stale, broken, or superseded.

## Automation Rules

Discovery bots should open PRs and daily digests only. They should not merge directly, rewrite unrelated entries, or promote candidates to `verified`.

Maintainers decide what reaches `main`.
