<p align="center">
  <img src="assets/brand/logo.png" alt="vnem logo" width="86" />
</p>

<h1 align="center">vnem</h1>

<p align="center">
  <strong>Read-only perception layer for coding agents.</strong>
</p>

<p align="center">
  <img src="assets/brand/banner.png" alt="vnem banner" width="100%" />
</p>

vnem is a small, LLM-readable knowledge pack and registry for agentic tools: MCP servers, skills, frameworks, evals, safety utilities, memory systems, payment rails, identity tools, and workflow patterns.

It helps a coding agent answer: _what should I use, what is stale, what is risky, and what is the current better option?_ before it edits a repo.

## Install The Pack

From any project root:

```bash
curl -fsSL https://raw.githubusercontent.com/naellisim/vnem/main/public/install.tgz | tar -xz
```

Until `vnem.ai` is live, the generated install command uses the GitHub-hosted archive. To generate artifacts for a different host later, run `VNEM_BASE_URL=https://vnem.ai npm run generate`.

This extracts only:

- `.vnem/AGENTS.md`
- `.vnem/search-index.json`
- `.vnem/best-practices.md`
- `.vnem/prompt-engineering.md`
- `.vnem/prompt-patterns.json`

Then ask your coding agent to read `.vnem/AGENTS.md`.

## Safety Model

V1 is intentionally boring and safe:

- no CLI install
- no daemon
- no MCP server
- no package install
- no remote code execution
- no secrets collection
- no edits unless the user explicitly approves them

The pack is guidance and search data. It does not run the tools it recommends.

## What This Repo Contains

| Path | Purpose |
| --- | --- |
| `registry/entries/{slug}/entry.yaml` | Canonical machine-readable registry entry. |
| `registry/entries/{slug}/profile.md` | Short human/LLM-readable profile. |
| `schemas/entry.schema.json` | Entry schema used by validation. |
| `scripts/` | Validation, generation, curated knowledge upserts, discovery, digest, and install-pack tests. |
| `public/api/index.json` | Static API generated from registry data. |
| `public/install/*` | Hosted read-only install-pack files. |
| `public/install.tgz` | Tiny archive used by the one-line install command. |
| `.vnem/` | Generated local pack for dogfooding this repo. |
| `llms.txt` | Compact LLM entrypoint. |
| `llms-full.txt` | Full generated registry context for LLMs. |
| `HERMES.md` | Operating contract for recurring agentic discovery and daily ecosystem checks. |

The marketing site source is intentionally not part of this repository. This repo is the open registry, generation system, and install pack.

## For LLMs

If you are working inside this repository, start with [`AGENTS.md`](AGENTS.md).

If you are using vnem inside another project, read `.vnem/AGENTS.md` after installing the pack. Use `.vnem/search-index.json` for tool lookup and `.vnem/best-practices.md` for current stack guidance.

To improve a prompt, say `use vnem to enhance this prompt` and include your rough prompt. The installed pack will route the agent to `.vnem/prompt-engineering.md` and `.vnem/prompt-patterns.json`.

If the agent has read `.vnem/AGENTS.md`, this can also happen automatically: requests to write, rewrite, optimize, critique, or template a prompt should use the prompt-enhancement protocol even when the user does not say `use vnem`.

## Trust Tiers

| Tier | Meaning |
| --- | --- |
| `verified` | Install/docs manually reviewed. |
| `promising` | Official or high-signal source, not fully tested. |
| `unreviewed` | Discovered but not validated. |
| `watchlist` | Useful-looking, but quality/license/security is uncertain. |
| `deprecated` | Stale, broken, or superseded. |

## Local Development

```bash
npm install
npm run curate
npm run validate
npm run generate
npm test
```

Useful commands:

```bash
npm run check:links
npm run curate
npm run discover:dry-run
npm run digest
```

## Add Or Update An Entry

1. Add or edit `registry/entries/{slug}/entry.yaml`.
2. Add or edit `registry/entries/{slug}/profile.md`.
3. Keep summaries original. Do not paste long upstream README/docs excerpts.
4. Preserve upstream source URLs, copyright owner, and SPDX license data when known.
5. Run `npm test`.
6. Open a PR with source links and a conservative trust-tier suggestion.

Discovery automation and Hermes may propose candidates, but maintainers approve what reaches `main`.

## License

Code and scripts are MIT licensed. Original registry metadata and profiles are CC0-1.0. Third-party names, trademarks, copyrights, packages, and licenses remain with their respective owners and are preserved through each entry's provenance fields.
