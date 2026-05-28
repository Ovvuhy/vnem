# Contributing

vnem accepts source-backed entries for tools that make agents, LLMs, or agent builders more capable, safer, easier to evaluate, easier to deploy, or easier to operate.

## Good Contributions

- New MCP servers, agent tools, skills, evals, memory/context systems, safety tools, payment/identity rails, or workflow patterns.
- Corrections to license, owner, source, install, permission, or risk metadata.
- Better recommendation fields: `best_for`, `not_for`, `alternatives`, `freshness`, `risk_flags`, and `recommended_when`.
- Discovery improvements that open reviewable PRs instead of merging directly.
- Product or documentation improvements that make vnem easier to understand without weakening the read-only safety model.

## Branch And Safety Workflow

Use a small number of long-lived integration branches:

- `develop`: normal testing branch for product, MCP, registry, install-pack, docs, and website improvements.
- `experimental`: high-risk or unclear experiments such as runtime gateway prototypes, large dashboard changes, automation rewrites, or broad registry migrations.

Short-lived feature branches should branch from `develop` unless the work is intentionally risky, in which case branch from `experimental`. Merge reviewed feature work back into its testing branch, then merge `develop` into `main` only when the full validation path is green and the diff is understandable. Merge `experimental` into `develop` only after the risky part has been reduced to a reviewable, tested change.

Do not keep old one-off branches alive after their useful commits are merged, cherry-picked, superseded, or intentionally rejected. Close stale draft PRs with a note and delete their branches after `main` contains the wanted work.

Avoid pushing directly to `main` except for explicit maintainer-directed consolidation, release repair, or branch-cleanup work.

Before opening a PR:

- keep the change scoped to one purpose
- do not delete registry entries, generated files, or brand assets unless the PR explains why
- regenerate artifacts instead of hand-editing generated outputs
- run the relevant validation commands
- explain any source, license, trust-tier, or permission uncertainty in the PR

Use small PRs when changing product copy, registry data, discovery automation, or install-pack behavior. A change is worse if it makes vnem prettier but less safe, less clear, or harder to verify.

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
