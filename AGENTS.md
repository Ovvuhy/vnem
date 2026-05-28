# AGENTS.md

This file is for coding agents working on the vnem repository.

## Project Purpose

vnem is a read-only perception layer for coding agents. It provides a registry, generated search data, best-practice notes, and install-pack files that help agents recommend current tools and safer upgrade paths before changing user code.

The project is index-first. Do not vendor third-party tools, copy upstream code, or paste long upstream documentation into the repo.

## Repository Map

- `registry/entries/{slug}/entry.yaml`: canonical entry data.
- `registry/entries/{slug}/profile.md`: short original profile for humans and LLMs.
- `schemas/entry.schema.json`: validation schema.
- `scripts/`: validation, artifact generation, discovery, digest, and tests.
- `public/api/index.json`: generated static API.
- `public/install/*`: generated loose install-pack files.
- `public/install.tgz`: generated install archive.
- `.vnem/`: generated local dogfood pack.
- `llms.txt` and `llms-full.txt`: generated LLM-readable indexes.
- `HERMES.md`: recurring discovery and daily synthesis operating contract.
- `PRODUCT.md`: product direction, public-site clarity goals, commercial boundaries, and non-regression bar.
- `SECURITY-ROADMAP.md`: phased roadmap for advisory-first gateway and runtime-security ideas.
- `landing/`: static landing page and blog bundle for the public website.

The user explicitly changed the prior landing-page policy on 2026-05-27. `landing/` is now allowed in this repo. Do not add a separate `site/` unless the user asks.

## Editing Rules

- Keep changes small and source-backed.
- Preserve third-party copyrights, owners, licenses, and source URLs.
- Use SPDX identifiers when known; use `NOASSERTION` when unknown.
- Keep summaries and profiles original. Avoid copied README excerpts.
- Treat `verified` as a strong claim. Use `promising`, `unreviewed`, or `watchlist` when unsure.
- Generated files must be regenerated instead of hand-edited.
- The install pack must remain read-only guidance/data only. The public curl archive may write `AGENTS.md` plus `.vnem/` guidance files for clean-folder installs, but it must not install packages, include shell scripts, collect secrets, start daemons, or edit application code.

## Validation

Run these before proposing a repo change:

```bash
npm run validate
npm run generate
npm run test:install-pack
```

For broader changes, run:

```bash
npm test
```

Expected network limitation: `npm run discover:dry-run` may return a `discovery-unavailable` candidate in restricted environments. That is acceptable when the rest of the test passes.

## Good Output Shape

When reviewing or changing this repo, report:

- what registry, script, or documentation surface changed
- whether generated artifacts were refreshed
- what validation ran
- any remaining uncertainty around source trust, licenses, or network checks
- a prominent `UPDATES` section after completed improvements, listing exactly what changed, where it landed, validation status, and any remaining limitation
