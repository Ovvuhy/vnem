# vnem Update: MCP, Skill, And One-Command Repo Install

We started vnem as a small read-only perception layer for coding agents.

The idea is simple: before an agent changes a repo, installs a package, chooses an MCP server, picks a memory layer, writes a prompt, or recommends an upgrade path, it should have a current map of the tool landscape and the risks around each option.

This update makes vnem much easier to actually use.

## What changed

vnem now has a real local MCP server.

It exposes the registry, search index, best-practice notes, prompt patterns, and trust metadata through read-only tools:

- `vnem_search`
- `vnem_recommend`
- `vnem_get_entry`
- `vnem_compare`
- `vnem_best_practices`

The MCP server does not install tools, edit code, call external services, collect secrets, or run the projects it recommends. It gives the agent better perception before action.

vnem also has a simple project installer.

From a vnem checkout, you can make any repo vnem-aware:

```bash
npm run install:project -- /path/to/project
```

That writes a `.vnem/` knowledge pack into the target repo and creates a small root `AGENTS.md` pointer. After that, coding agents that read `AGENTS.md` should naturally consult vnem before making stack, tooling, MCP, prompt, eval, memory, or search decisions.

There is also a doctor command:

```bash
npm run doctor -- /path/to/project
```

And a bundled Codex skill, so vnem can be used as a first-class agent workflow instead of only as files.

## New knowledge added

This update also expands the registry with new agentic infrastructure and coding-efficiency signals.

From the EasyA/community direction:

- Clude as an early cognitive memory layer and MCP server for agent memory.
- Swarms as a Python multi-agent orchestration framework.
- Covenant Research as watchlist-level governance research for autonomous agents.
- Kaimo as an early agent-commerce and x402 signal.

For agentic coding efficiency:

- ripgrep as the default fast lexical search primitive.
- ast-grep for syntax-aware search and safer codemods.
- ugrep for deeper audit/search workflows across archives, compressed files, documents, fuzzy search, and interactive use.
- codebase-memory-mcp as a graph-backed MCP approach to codebase memory.
- Knip and jscpd for dead-code and duplicate-code evidence before refactoring.

We also added a broader browser-game stack set, including Phaser, PixiJS, Three.js, Babylon.js, Excalibur, KAPLAY, Matter.js, Rapier, and PlayCanvas, so agents have better defaults when users ask for playable browser games instead of generic demos.

## Why this matters

Agents are becoming maintainers, researchers, tool selectors, and sometimes buyers.

That makes the step before action more important.

An agent should know:

- which tools are current
- which ones are promising but not fully reviewed
- which ones need network, filesystem, secrets, browser, wallet, or database access
- what safer alternatives exist
- when grep is enough and when AST or graph search is better
- when a memory layer needs retention, deletion, and export boundaries
- when a commerce tool needs receipts, limits, and audit trails

vnem is trying to be that small read-only layer.

Not another autonomous system.
Not another installer that mutates your repo.
Not another tool that quietly asks for secrets.

Just a local, source-backed map that helps agents choose better before they act.

## Current shape

vnem can now be used in three ways:

1. Install the `.vnem/` pack into a repo so agents read it through `AGENTS.md`.
2. Run the local read-only MCP server for tool-based search and recommendations.
3. Install the bundled Codex skill for a cleaner agent workflow.

The goal is that you can open a clean project folder, start coding there, and the agent already understands:

> Before I choose tools or change code, check vnem.

That is the direction.

Small, local, read-only perception for coding agents.

