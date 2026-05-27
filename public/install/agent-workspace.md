# Agent Workspace

Generated read-only guidance for designing an autonomous developer environment with vnem.

## Safety Boundary

- This file is guidance only.
- Do not treat it as a gateway config, daemon script, credential template, or install recipe.
- Ask before adding MCP servers, editing agent config, using secrets, starting services, or giving an agent write access.

## Recommended Default

Start with a small, readable setup: Codex or another coding agent, repository-local instructions, the vnem read-only pack, and only the MCP servers required for the current workflow.

Add gateways, memory banks, browser sessions, database access, and repository mutation tools only after the team can name the approval path and rollback plan.

Use `.vnem/source-radar.json` when workspace choices depend on current agent-client docs, MCP registry behavior, browser verification tooling, sensitive connectors, or benchmark/eval sources.

## MCP Gateway And Tool Routing

Use a gateway when a direct MCP setup becomes hard to govern: too many tool schemas, repeated credential setup, missing audit logs, or different roles needing different tool catalogs.

Evaluate gateways by these questions:

- Which tools must be visible to this agent role right now?
- Which tools can mutate repositories, databases, browsers, deployments, payments, or files?
- Where are credentials stored and how are they scoped?
- Can the gateway log requests, enforce rate limits, and narrow discovery responses?
- Is the team ready to operate the gateway, or is a smaller direct MCP list safer?

Use the registry entries for Lunar MCPX, Microsoft MCP Gateway, official GitHub MCP Server, Supabase MCP, Qdrant MCP, OpenTabs, and Crawl4AI RAG as catalog guidance before changing runtime config.

## Zero-Trust Gateway Readiness

Keep gateway-security ideas advisory until they have a threat model and tests. Tool annotations, schema hashes, path policy, secret redaction, package review, and AST indexing are useful controls, but the read-only vnem pack should not become a shell proxy, package installer, daemon, or enforcement runtime.

For phased runtime-security planning, read the source-radar `agentic-gateway-security` entry and the root `SECURITY-ROADMAP.md` in this repository when available.

## Persistent Memory And Context Files

Keep durable memory short, factual, and reviewed.

- Codex: use `AGENTS.md` for repository purpose, commands, conventions, verification, and approval boundaries.
- Claude Code: use `CLAUDE.md` for Claude-specific project memory and keep local machine overrides out of shared files.
- Roo/Cline-style workflows: use mode rules or a memory bank only when maintainers will keep active context and decision logs current.
- Store architectural decisions and rejected approaches when repeating the same mistake would be costly.
- Keep secrets, credentials, private customer data, and unverified research out of memory files.

## IDE Agent Selection

Choose agents by fit rather than hype. Compare editor workflow, approval model, model routing, MCP support, maintenance status, terminal behavior, and how well the agent verifies changes in this repository.

Use Cursor Agent when editor-native multi-file work and Cursor rules are the main workflow. Use Cline or similar VS Code agents when explicit approvals and model flexibility matter. Treat Roo Code and community mode libraries as watchlist inputs when upstream maintenance is unclear. Use Claude Code or Codex when terminal-native repo work, command verification, and explicit project memory are a better fit.

## Codex/VNEM Setup

For Codex-based workspaces:

- Keep vnem read-only and use it before choosing tools, MCP servers, memory patterns, or agent clients.
- Keep project instructions in `AGENTS.md`; keep them concise and stable.
- Register vnem as an MCP resource only for lookup and recommendations.
- Prefer the prompt patterns for recurring architecture, gateway evaluation, and memory initialization tasks.
- Do not add runnable gateway prototypes, daemon changes, secrets, or third-party code to the vnem pack.

## Decision Checklist

- What does the agent need to read?
- What can the agent mutate?
- Which approvals are required before mutation?
- Which MCP servers are official or high-confidence sources?
- Does a gateway reduce risk, or does it add operational surface area?
- Which memory file owns stable facts, current task state, and decisions?
- Which tests or checks prove the environment is helping rather than drifting?

