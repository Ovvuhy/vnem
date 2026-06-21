# vnem Daily Signals

Generated: 2026-06-21T07:01:30.150Z

Hermes summarizes source-backed agent and LLM ecosystem signals. This digest does not auto-promote entries into the registry.

## New Candidate Signals (2026-06-21T07 hourly)

### High-signal GitHub projects

- esengine/DeepSeek-Reasonix | promising | review | https://github.com/esengine/DeepSeek-Reasonix
  - DeepSeek-native AI coding agent for terminal. 23k stars, MIT, Go. Engineered around prefix-cache stability.
- boshu2/agentops | unreviewed | watchlist | https://github.com/boshu2/agentops
  - Operational layer for coding agents: memory, validation, feedback loops. 395 stars, Go. Distinct from existing Python agentops registry entry (AgentOps-AI/agentops).
- sandydasari/openacme | unreviewed | review | https://github.com/sandydasari/openacme
  - AI workforce platform: role-specialized agents with multi-provider LLM, MCP, tasks. 77 stars, MIT, TypeScript.
- tenuo-ai/tenuo | unreviewed | review | https://github.com/tenuo-ai/tenuo
  - Capability authorization engine for AI agents. Cryptographically attenuated warrants, Rust core. 75 stars.

### Official tooling

- chrome-devtools-mcp | unreviewed | review | https://github.com/ChromeDevTools/chrome-devtools-mcp
  - Official Chrome DevTools MCP server. Apache-2.0, v1.3.0.
- nx-mcp | unreviewed | review | https://github.com/nrwl/nx-console
  - Official Nx MCP server. MIT, v0.25.0.

### MCP Registry (new since 06:37 digest)

- ai.agentberg/agentberg | promising | review | https://registry.modelcontextprotocol.io/v0.1/servers/ai.agentberg%2Fagentberg/versions/latest
- ai.aient/mcp | promising | review | https://registry.modelcontextprotocol.io/v0.1/servers/ai.aient%2Fmcp/versions/latest
- ai.airshelf/catalog | promising | review | https://registry.modelcontextprotocol.io/v0.1/servers/ai.airshelf%2Fcatalog/versions/latest
- ai.alphacreek/alphacreek-mcp | promising | review | https://registry.modelcontextprotocol.io/v0.1/servers/ai.alphacreek%2Falphacreek-mcp/versions/latest
- ai.ambix/ambix | promising | review | https://registry.modelcontextprotocol.io/v0.1/servers/ai.ambix%2Fambix/versions/latest
- ai.auralogs/auralogs | promising | review | https://registry.modelcontextprotocol.io/v0.1/servers/ai.auralogs%2Fauralogs/versions/latest

### Watchlist / low-signal

- ShibaClaw | unreviewed | watchlist | https://github.com/RikyZ90/ShibaClaw
- stella | unreviewed | watchlist | https://github.com/CherryHQ/stella
- Psycheros | unreviewed | watchlist | https://github.com/PsycherosAI/Psycheros
- clowlove/Hermes-House | unreviewed | watchlist | https://github.com/clowlove/Hermes-House
- linny006/agent-eval-harness | unreviewed | watchlist | https://github.com/linny006/agent-eval-harness
- zorak1103/ha-mcp | unreviewed | review | https://github.com/zorak1103/ha-mcp
- KCNyu/clawock | unreviewed | watchlist | https://github.com/KCNyu/clawock
- azfarh95/sentinel-stack-public | unreviewed | review | https://github.com/azfarh95/sentinel-stack-public
- HaolongChen/AI-Agent-Evaluation-System | unreviewed | watchlist | https://github.com/HaolongChen/AI-Agent-Evaluation-System

### Social-only leads (HN)

- Show HN: We post-trained a model that pen tests instead of refusing | watchlist | watchlist | https://news.ycombinator.com/item?id=48609231
- We built a lab to evaluate data agents - Hex | watchlist | watchlist | https://news.ycombinator.com/item?id=48604937

## Watched Primary Sources

- github-releases route: all 10 configured repos returned 403 rate limit errors. No release signals this run.
- No configured watched-URL sources changed.

## Route Errors

- github-releases: 403 rate limit on all 10 configured repos (modelcontextprotocol, github-mcp-server, supabase-mcp, qdrant, hermes-agent, cline, Roo-Code, claude-code, mcp-gateway, lunar).
- README fetches: most GitHub repos returned 403 on README fetch (rate limit). Repo metadata (stars, license, topics) was still available via search API.

## Maintainer Actions

- Review Hermes candidate reports before merging.
- chrome-devtools-mcp and nx-mcp are official tooling with clear licenses — lower barrier to registry entry if maintainers want them.
- DeepSeek-Reasonix has high star count and MIT license — worth a registry entry if README review passes.
- github-releases route needs authenticated API access to recover signal.
- boshu2/agentops is distinct from the existing agentops registry entry (Python observability vs Go agent ops).
- If generated pack files changed, verify `AGENTS.md`, `search-index.json`, `best-practices.md`, and `agent-workspace.md` still describe read-only behavior.
