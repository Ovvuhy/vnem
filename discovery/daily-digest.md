# vnem Daily Signals

Generated: 2026-05-26T10:23:10.950Z

This digest is designed for maintainers. It summarizes source-backed candidates and stable best-practice signals; it does not auto-promote entries into the registry.

## Discovery Candidates

- No new candidate report found, or every candidate is already indexed.

## Best-practice Signals

- Agent Tooling: Treat MCP servers, skills, prompts, and tools as versioned capabilities with provenance, permission notes, and review status.
- Backend And APIs: Use boring, observable APIs with typed boundaries, explicit auth, and generated clients when agents need reliable integration points.
- Code Review And Upgrade Audits: Project-review agents should inspect manifests, framework configs, dependency age, security posture, and available drop-in improvements before proposing code changes.
- Coding Agents: Give repository-editing agents tight scope, strong local context, explicit approval boundaries, and fast verification loops before trusting broader autonomy.
- Context Engineering: Treat instructions, memory files, retrieval, and artifacts as the agent's working environment; prune noise and make durable context explicit.
- Data And Memory: Use memory and data connectors only when they improve repeated work, and keep scopes narrow enough for users to reason about.
- Deployment And Operations: Agent-built systems need cheap preview deploys, logs, rollback paths, and clear operational ownership.
- Evals And Verification: Agents should prove outputs with tests, screenshots, fixtures, or structured checks before recommending a stack change.

## Watchlist / Risk Flags

- [Codex AGENTS.md](/entries/codex-agents-md/) | workflow | verified | no-canonical-repo-url
- [ABMeter](/entries/ai-abmeter-abmeter/) | mcp-server | promising | license-not-asserted
- [ac.tandem/docs-mcp](/entries/ac-tandem-docs-mcp/) | mcp-server | promising | license-not-asserted
- [agency.lona/trading](/entries/agency-lona-trading/) | mcp-server | promising | license-not-asserted
- [Agent Skills Search Server](/entries/ai-com-mcp-skills-search/) | mcp-server | promising | license-not-asserted
- [AgentDM: Agent to Agent Communication Platform](/entries/ai-agentdm-agentdm/) | mcp-server | promising | license-not-asserted
- [Agentic News](/entries/ai-agentic-news-mcp/) | mcp-server | promising | license-not-asserted
- [Agentic Shelf](/entries/ai-agenticshelf-mcp/) | mcp-server | promising | license-not-asserted
- [AgentTrust — Identity & Trust for A2A Agents](/entries/ai-agenttrust-mcp-server/) | mcp-server | promising | license-not-asserted
- [ai.adeu/adeu](/entries/ai-adeu-adeu/) | mcp-server | promising | license-not-asserted
- [ai.aliengiraffe/spotdb](/entries/ai-aliengiraffe-spotdb/) | mcp-server | promising | license-not-asserted
- [ai.autoblocks/contextlayer-mcp](/entries/ai-autoblocks-contextlayer-mcp/) | mcp-server | promising | license-not-asserted
- [ai.autonomad/computeback](/entries/ai-autonomad-computeback/) | mcp-server | promising | license-not-asserted
- [ai.autonomad/travel](/entries/ai-autonomad-travel/) | mcp-server | promising | license-not-asserted
- [ai.cueapi/mcp](/entries/ai-cueapi-mcp/) | mcp-server | promising | license-not-asserted
- [ai.exa/exa](/entries/ai-exa-exa/) | mcp-server | promising | license-not-asserted
- [ai.explorium/mcp-explorium](/entries/ai-explorium-mcp-explorium/) | mcp-server | promising | license-not-asserted
- [ai.imboard/dossier](/entries/ai-imboard-dossier/) | mcp-server | promising | license-not-asserted
- [ai.inflowpay.app/inflow](/entries/ai-inflowpay-app-inflow/) | mcp-server | promising | license-not-asserted
- [ai.klavis/strata](/entries/ai-klavis-strata/) | mcp-server | promising | license-not-asserted

## Maintainer Actions

- Review the discovery PR before merging.
- Promote candidates only after checking source links, license posture, permissions, and install docs.
- Keep X, Reddit, and social ingestion disabled unless official credentials and terms-compliant access are configured.
- If the local pack changed, verify `AGENTS.md`, `search-index.json`, and `best-practices.md` still describe read-only behavior.
