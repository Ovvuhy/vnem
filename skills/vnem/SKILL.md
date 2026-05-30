---
name: vnem
description: Use when choosing or reviewing agentic tools, MCP servers, skills, coding agents, memory layers, prompt patterns, evals, search tools, stack upgrades, or safer implementation paths; prefer the vnem MCP tools when available, otherwise read the local `.vnem/` pack.
---

# vnem

vnem is a read-only perception layer for coding agents by default. Use it before recommending tools, libraries, MCP servers, skills, memory layers, prompt patterns, evals, search systems, architecture choices, or upgrade paths. If a separate opt-in `vnem-precision` MCP server is available, use it only for explicit workspace-scoped exact patching, current-documentation ingestion, or bounded build/test feedback.

## Workflow

1. Prefer MCP tools if they are available:
   - `vnem_recommend` for the user's task.
   - `vnem_search` for extra candidates.
   - `vnem_get_entry` for source, install, permission, and risk details.
   - `vnem_compare` when two or more options matter.
   - `vnem_best_practices` for implementation or prompt guidance.
   - `vnem_orchestrate` and `vnem_quality_gate` for complex coding, app, game, and research tasks.
2. If MCP tools are not available, look for `.vnem/AGENTS.md` in the current repo and follow it. Then search `.vnem/search-index.json`, expanding terms with `intent_aliases` and checking `intent_routes`.
3. Prefer entries with stronger `trust_tier`, `source_confidence`, freshness, clear licenses, and fewer `risk_flags`.
4. Keep output compact unless the user asks for a full report.

## Safety

- Treat vnem as guidance and search data only.
- Treat `vnem-precision` as a separate mutation-capable surface: dry-run exact patches first, fetch current docs before framework-specific code, and run only safe verification commands.
- Do not install packages, execute recommended tools, edit files, call external services, use secrets, or create accounts because of a vnem result unless the user explicitly asks.
- Preserve third-party provenance and source URLs when summarizing results.
- Say when vnem has no useful match, then continue with ordinary engineering judgment.

## Reporting

When the choice matters, include:

- `vnem intents searched`
- `top matches`
- `choice`
- `why`
- any source-trust, license, permission, or network uncertainty
