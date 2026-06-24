# vnem Daily Signals

Generated: 2026-06-24T09:19:00.000Z

Hermes summarizes source-backed agent and LLM ecosystem signals. This digest does not auto-promote entries into the registry.

## New Candidate Signals (2026-06-24T09 hourly)

### High-signal GitHub projects

- duckbugio/flock | promising | review | https://github.com/duckbugio/flock
  - Autonomous AI dev-team bot. 746 stars, MIT, Go. Topics: ai-agent, claude-code, self-hosted, telegram-bot. Active development (pushed 2026-06-24). Homepage: https://roost.duckbug.io
- netresearch/jira-skill | unreviewed | review | https://github.com/netresearch/jira-skill
  - AI agent plugin for Jira — CLI tools for issues, worklogs, sprints. 66 stars, 20 forks, Python. Topics: agent-skills, mcp, claude-code-skill, jira. Pushed 2026-06-24.
- runxhq/runx | unreviewed | review | https://github.com/runxhq/runx
  - Governed runtime for agent skill workflows. 19 stars, 37 forks, 81 open issues, MIT, Rust. Topics: agent-orchestration, agent-runtime, agent-skills, ai-governance, mcp, provenance. Homepage: https://runx.ai

### MCP Registry (latestconfirmed)

- ai.agentberg/agentberg | promising | review | https://registry.modelcontextprotocol.io/v0.1/servers/ai.agentberg%2Fagentberg/versions/latest
  - Agent-to-agent trading intelligence exchange. Publish findings, vote on quality, earn reputation. v0.2.0.
- ai.aient/mcp | promising | review | https://registry.modelcontextprotocol.io/v0.1/servers/ai.aient%2Fmcp/versions/latest
  - MCP-native AI SRE: ask what is broken in production, get a reviewed GitHub fix PR. v0.1.0. Repo: https://github.com/haf/glimt
- ai.airshelf/catalog | promising | review | https://registry.modelcontextprotocol.io/v0.1/servers/ai.airshelf%2Fcatalog/versions/latest
  - Cross-vendor B2B catalog for AI agents: search, compare, find equivalents, request a quote. v1.0.0.
- ai.alphacreek/alphacreek-mcp | promising | review | https://registry.modelcontextprotocol.io/v0.1/servers/ai.alphacreek%2Falphacreek-mcp/versions/latest
  - Access SEC filings efficiently (10-K, 10-Q, etc), save time and tokens. v1.0.1.
- ai.ambix/ambix | promising | review | https://registry.modelcontextprotocol.io/v0.1/servers/ai.ambix%2Fambix/versions/latest
  - Shared strategic memory MCP server for product teams. v0.1.0. Repo: https://github.com/ambix-ai/mcp
- ai.auralogs/auralogs | promising | review | https://registry.modelcontextprotocol.io/v0.1/servers/ai.auralogs%2Fauralogs/versions/latest
  - Read-only access to Auralogs production logs: search, inspect errors, review AI analyses. v0.1.0. Repo: https://github.com/auralogs-ai/auralogs-mcp

### npm packages

- chrome-devtools-mcp | unreviewed | review | https://github.com/ChromeDevTools/chrome-devtools-mcp
  - Official Chrome DevTools MCP server. Apache-2.0, v1.4.0. Also tracked in previous digest.
- @sap-ux/fiori-mcp-server | unreviewed | review | https://www.npmjs.com/package/@sap-ux/fiori-mcp-server
  - SAP Fiori MCP server.

### Watchlist / low-signal

- webbrain-one/webbrain | unreviewed | watchlist | https://github.com/webbrain-one/webbrain
  - Open-source AI browser agent for Chrome and Firefox. 36 stars, MIT, JavaScript. Sensitive-permissions flag (browser extension).
- cyberspacesec/certificate-skills | unreviewed | review | https://github.com/cyberspacesec/certificate-skills
  - AI-native certificate security toolkit: Skills, CLI, MCP server, Go SDK for SSL/TLS analysis. MIT, Go. Low-repo-signal flag (0 stars).

## Previously Flagged (2026-06-21)

- esengine/DeepSeek-Reasonix | promising | review | https://github.com/esengine/DeepSeek-Reasonix
- boshu2/agentops | unreviewed | watchlist | https://github.com/boshu2/agentops
- sandydasari/openacme | unreviewed | review | https://github.com/sandydasari/openacme
- tenuo-ai/tenuo | unreviewed | review | https://github.com/tenuo-ai/tenuo

## Watched Primary Sources

- github-releases route: 403 rate limit on all configured repos in prior runs. No release signals recovered this run.
- No configured watched-URL sources changed.

## Route Notes

- README fetches for most GitHub repos returned 403 (rate limit). Repo metadata (stars, license, topics) still available via search API.
- github-search and mcp-registry routes returned results normally.
- npm-search returned results normally.

## Maintainer Actions

- Review Hermes candidate reports before merging.
- duckbugio/flock is the highest-signal new candidate this cycle: 746 stars, MIT, active, self-hosted AI dev-team agent. Recommend priority review.
- chrome-devtools-mcp is official Google tooling with Apache-2.0 — lower barrier to registry entry if maintainers want it.
- github-releases route needs authenticated API access to recover release signal.
- boshu2/agentops (Go, agent ops) is still distinct from the existing agentops registry entry (Python observability).
- Runx (runxhq/runx) has interesting governance/provenance angle but high open-issues count (81) — review for maturity.
- If generated pack files changed, verify AGENTS.md, search-index.json, best-practices.md, and agent-workspace.md still describe read-only behavior.
