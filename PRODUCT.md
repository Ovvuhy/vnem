# vnem Product Direction

vnem's product goal is to make AI coding agents more useful before they touch a user's codebase.

The open repository should stay focused on a safe, source-backed, read-only knowledge layer. Future product surfaces can make that layer easier to install, browse, trust, and apply, but they should not weaken the safety model.

## Core Promise

Give coding agents better perception:

- what tools exist now
- which sources are official or high-signal
- what permissions and risks a tool carries
- when a tool is a good fit
- when a tool is stale, risky, or not worth installing
- which AI agent, model provider, or workflow is the best fit for the user's actual repo and task
- how to write clearer prompts and safer implementation instructions

The user-facing promise is simple: **sharper stack reviews, better tool choices, and cleaner diffs before an agent edits a repo.**

## Current Product Shape

vnem is currently an open-core knowledge system with three surfaces:

- **Registry:** `registry/entries/*` stores source-backed metadata for agentic tools, MCP servers, coding agents, evals, memory systems, observability tools, and workflows.
- **Install pack:** `public/install.tgz` and `public/install/*` provide the read-only `.vnem` files that an agent can install into another project, including decision rubrics, playbooks, best-practice notes, and prompt patterns.
- **Source radar:** `.vnem/source-radar.json` and `public/install/source-radar.json` map official docs, registries, MCP sources, benchmark/eval sources, and verification sources that agents should consult before broad web research.
- **Generated indexes:** `public/api/index.json`, `llms.txt`, and `llms-full.txt` expose compact LLM-readable and API-readable views of the registry.

The public landing page should explain those surfaces. This repository should keep producing the trustworthy data behind them.

## Primary Users

- Maintainers who want AI agents to inspect a repo before recommending dependencies or code changes.
- Builders comparing coding agents, MCP servers, eval tools, memory systems, and orchestration frameworks.
- Teams that want current AI-tool guidance without giving a tool automatic write access.
- Prompt authors who want stronger, more operational Codex, Claude Code, Gemini/ADK, or general agent prompts.

## What Belongs In vnem

- Source-backed registry entries for agentic tools and workflows.
- Conservative trust tiers, freshness notes, permission metadata, and risk flags.
- Decision rubrics and playbooks for comparing Codex, Claude Code, Gemini/ADK, MCP servers, model providers, and agent workflows.
- Source radar metadata for official docs, MCP registries, high-signal MCP sources, evals, observability tools, and client-specific instruction models.
- Prompt patterns and review protocols that improve agent behavior.
- Discovery automation that opens reviewable proposals instead of silently changing trusted data.
- Public-site copy that makes installation, safety, and value obvious.

## What Does Not Belong In vnem Core

- Vendored third-party source code.
- Long copied upstream documentation.
- Auto-install scripts for discovered tools.
- Background daemons in the install pack.
- Secret collection or account authorization flows.
- Unreviewed promotion to `verified`.
- Broad non-agent content that makes the registry harder to trust.

Gaming optimization, hardware settings, and creator workflow content can become a future product area, but should use a separate taxonomy and quality bar instead of being mixed into the current agent-tool registry.

## Public Site Clarity Goals

The public page should stay visually polished, but the first screen should make the product understandable in seconds:

- one-sentence explanation of what vnem does
- one-line install command
- exactly what files get installed
- why read-only matters
- how source radar reduces repeated research by pointing agents at official/high-signal upstreams first
- a quick "before vnem / after vnem" example of an agent recommendation
- visible trust signals: source-backed, risk flags, trust tiers, no auto-execution
- clear paths for Codex, Claude Code, Gemini/ADK, Cursor/Cline-style tools, and MCP users

Avoid making the page feel like a generic AI directory. vnem is strongest when it feels like an upgrade layer for agent judgment.

## Commercial Path

A future paid product could make sense if it sells workflow, freshness, and team trust rather than hiding the open registry.

Potential paid surfaces:

- hosted dashboard for browsing and comparing registry entries
- private team packs with approved tools and blocked tools
- scheduled repo audits that produce PR-ready recommendations
- hosted discovery with changelog and risk monitoring
- organization policy checks for MCP servers, permissions, and secrets
- visual reports for maintainers and non-technical stakeholders

The open install pack should remain safe and useful. Paid features should add convenience, private data support, monitoring, collaboration, or hosted review workflows.

## Non-Regression Bar

Every improvement should preserve these guarantees:

- installing vnem remains read-only
- generated artifacts come from source data, not manual edits
- registry claims stay source-backed
- risky actions stay behind explicit user approval
- `main` only receives reviewed changes
- the README and public site make the product easier to understand, not more vague
