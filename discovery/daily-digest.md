# vnem Daily Signals

Generated: 2026-05-27T20:55:37.393Z

This digest is designed for maintainers. It summarizes source-backed candidates and stable best-practice signals; it does not auto-promote entries into the registry.

## Discovery Candidates

- No new candidate report found, or every candidate is already indexed.

## Best-practice Signals

- MCP Gateway And Tool Routing: Use MCP gateways as a policy, discovery, routing, and observability layer only when the agent would otherwise see too many tools or credentials directly.
- Code Simplification And Minimal Refactors: Simplify code by preserving behavior first, deleting proven waste, reducing duplication, and using the project's existing abstractions before introducing new ones.
- Visual Experience And Perception Gate: For visual work, judge the actual perceptual artifact: if it looks ugly, generic, oversized, noisy, or mismatched to references, it is not done.
- Browser Games And Interactive Canvas: For browser-native games, choose the lightest proven stack that can deliver real playability: responsive rendering, input, rules, state transitions, visible feedback, accessible UI, and browser-verified behavior.
- Persistent Memory And Context Files: Put stable project facts in versioned instruction files, keep volatile task state separate, and review memory for secrets, stale assumptions, and repeated failed approaches.
- Codex/VNEM Setup: For Codex-based workspaces, keep vnem read-only, load `AGENTS.md` instructions, expose MCP resources deliberately, and use generated guidance before installing tools.
- IDE Agent Selection: Choose coding agents by editor fit, approval model, model routing, MCP support, maintenance status, and the repo's need for autonomous multi-file changes.
- Model And Provider Selection: Choose Codex, Claude Code, Gemini/ADK, framework agents, or model APIs by workflow fit, permissions, eval evidence, and operational cost rather than brand preference.

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
- If the local pack changed, verify `AGENTS.md`, `search-index.json`, `best-practices.md`, and `agent-workspace.md` still describe read-only behavior.
