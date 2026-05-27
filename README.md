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

Live overview: [vnem.pages.dev](https://vnem.pages.dev)

## What Vnem Improves

vnem is meant to improve the judgment of coding agents, not replace maintainer review.

- **Better recommendations:** agents compare current MCP servers, coding agents, frameworks, evals, memory systems, and workflows before proposing a stack change.
- **Safer adoption:** each entry tracks source links, licenses, permissions, risk flags, trust tier, and install notes.
- **Stronger AI selection:** the install pack includes a decision rubric and playbooks for comparing Codex, Claude Code, Gemini/ADK, MCP tools, and agent workflows by fit, risk, verification, cost, and reversibility.
- **Shared research layer:** source radar maps official docs, registries, MCP sources, evals, and verification sources so agents know where to research before burning context from scratch.
- **Clearer prompts:** the install pack includes prompt-engineering guidance and reusable prompt patterns for Codex-style implementation, review, debugging, research, eval, and MCP-selection tasks.
- **Faster repo audits:** agents inspect the project first, then separate stale or risky choices from realistic drop-in improvements.

## How It Works

1. Install the read-only pack into a project.
2. Ask a coding agent to read `.vnem/AGENTS.md`.
3. The agent uses `.vnem/search-index.json`, `.vnem/best-practices.md`, decision playbooks, and `.vnem/prompt-*` files while reviewing the repo.
4. For current docs, MCP discovery, or benchmark claims, the agent checks `.vnem/source-radar.json` before broad web search.
5. The agent scores options against repo fit, capability gain, source trust, permission risk, verification path, and reversibility.
6. The agent recommends options and asks before changing code, installing packages, using secrets, or touching external systems.

## Install The Pack

From any project root:

```bash
curl -fsSL https://raw.githubusercontent.com/naellisim/vnem/main/public/install.tgz | tar -xz
```

Until `vnem.ai` is live, the generated install command uses the GitHub-hosted archive. To generate artifacts for a different host later, run `VNEM_BASE_URL=https://vnem.ai npm run generate`.

In a clean project folder, this extracts:

- `AGENTS.md`
- `.vnem/AGENTS.md`
- `.vnem/search-index.json`
- `.vnem/source-radar.json`
- `.vnem/best-practices.md`
- `.vnem/prompt-engineering.md`
- `.vnem/prompt-patterns.json`

`AGENTS.md` points coding agents to `.vnem/AGENTS.md`, the full agent entrypoint. Once an agent has read it, the user should not need special `use vnem` prompts: vnem auto-activates for build, review, optimization, research, benchmark, and stack/tool decision tasks.

For existing repos with their own `AGENTS.md`, prefer the CLI installer below because it updates a managed vnem block instead of replacing the whole file.

## Make A Repo vnem-Aware

For the easiest local workflow, install vnem from this checkout into any clean project folder:

```bash
npm run install:project -- /path/to/my-project
```

This writes the read-only `.vnem/` pack and creates or updates `/path/to/my-project/AGENTS.md` with a tiny managed pointer. After that, coding agents that read `AGENTS.md` should automatically consult vnem before choosing tools, MCP servers, skills, prompt patterns, evals, memory layers, search tools, or upgrade paths.

Check a project:

```bash
npm run doctor -- /path/to/my-project
```

Claude-style projects can also get a `CLAUDE.md` pointer:

```bash
npm run install:project -- /path/to/my-project --claude
```

## Use As An MCP Server

vnem also ships an opt-in, read-only MCP server over stdio. It exposes the generated registry and install-pack guidance as tools, resources, and a prompt; it does not install packages, edit files, call upstream services, or collect secrets.

From this repo:

```bash
npm run mcp
```

Example MCP client config:

```json
{
  "mcpServers": {
    "vnem": {
      "command": "node",
      "args": ["/path/to/vnem/scripts/vnem-mcp-server.mjs"]
    }
  }
}
```

Main tools:

- `vnem_search`: search registry entries, best-practice notes, and prompt patterns.
- `vnem_recommend`: run a recommendation pass for an agentic tooling or stack decision.
- `vnem_get_entry`: fetch one registry entry with provenance, install notes, permissions, and risks.
- `vnem_compare`: compare two or more registry entries.
- `vnem_best_practices`: find matching best-practice and prompt-pattern notes.
- `vnem_sources`: find source-radar entries for upstream docs, registries, MCP sources, and benchmark evidence.

You can also install the bundled Codex skill from this checkout:

```bash
npm run vnem -- install-skill
```

## Safety Model

V1 is intentionally boring and safe:

- no CLI install
- no daemon
- optional MCP server is local, read-only, and stdio-only
- no package install
- no remote code execution
- no network calls from MCP tools
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
| `landing/` | Static public landing page and blog bundle for the website. |
| `llms.txt` | Compact LLM entrypoint. |
| `llms-full.txt` | Full generated registry context for LLMs. |
| `HERMES.md` | Operating contract for recurring agentic discovery and daily ecosystem checks. |

This repo is the open registry, generation system, install pack, MCP server, and static public site source.

For product direction, public-site clarity, and future commercial boundaries, see [`PRODUCT.md`](PRODUCT.md).

## For LLMs

If you are working inside this repository, start with [`AGENTS.md`](AGENTS.md).

If you are using vnem inside another project, read `.vnem/AGENTS.md` after installing the pack. It tells agents to automatically search `.vnem/search-index.json`, check `intent_routes`, compare relevant best-practice notes, and report vnem knowledge gaps before choosing a stack or recommendation.

To improve a prompt, say `use vnem to enhance this prompt` and include your rough prompt. The installed pack will route the agent to `.vnem/prompt-engineering.md` and `.vnem/prompt-patterns.json`.

If the agent has read `.vnem/AGENTS.md`, this can also happen automatically: requests to write, rewrite, optimize, critique, or template a prompt should use the prompt-enhancement protocol even when the user does not say `use vnem`.

To compare AI tools, ask for a vnem-backed review such as `codex vs claude`, `gemini agent`, `ai model selection`, or `agent upgrade`. The installed pack routes those intents to the decision rubric, playbooks, prompt patterns, and relevant registry entries.

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
