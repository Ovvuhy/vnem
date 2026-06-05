# vnem Daily Signals

Generated: 2026-06-05T08:00:00.000Z

Hermes summarizes source-backed agent and LLM ecosystem signals. This digest does not auto-promote entries into the registry.

## New Candidate Signals (2026-06-05 Brain Pass)

Fresh repos created 2026-06-03 to 2026-06-05 from GitHub search:

- delego | unreviewed | review | https://github.com/Delego-Dev/delego
- cross-agent-memory-kit | unreviewed | watchlist | https://github.com/internetyev/cross-agent-memory-kit
- inspect-evals-mcptox | unreviewed | review | https://github.com/stefanoamorelli/inspect-evals-mcptox
- ClawGUI | unreviewed | review | https://github.com/ZJU-REAL/ClawGUI
- AssetOpsBench | unreviewed | review | https://github.com/IBM/AssetOpsBench
- ECC | unreviewed | watchlist | https://github.com/affaan-m/ECC
- cua | unreviewed | review | https://github.com/trycua/cua

## Previously Flagged (from VPS hourly runs 2026-05-29 to 2026-06-05)

These candidates appeared in VPS hourly reports and remain unreviewed:

- BittleBits GEO Assistant | promising | review | https://registry.modelcontextprotocol.io/v0.1/servers/ai.bittlebits%2Fbittlebits/versions/latest
- agentops | promising | review | https://github.com/boshu2/agentops (now in registry as `agentops`)
- mcp-yahoo-finance | unreviewed | review | https://github.com/maxscheijen/mcp-yahoo-finance
- agent-arch | unreviewed | review | https://github.com/agent-axiom/agent-arch
- web3-agent-kit | unreviewed | review | https://github.com/ulsreall/web3-agent-kit
- LoopBack | unreviewed | review | https://github.com/darenr/LoopBack
- contexa | unreviewed | review | https://github.com/contexa-security/contexa
- nx-mcp | unreviewed | review | https://www.npmjs.com/package/nx-mcp
- chrome-devtools-mcp | unreviewed | review | https://www.npmjs.com/package/chrome-devtools-mcp
- hermes-agent v0.15.2 | unreviewed | review | https://github.com/NousResearch/hermes-agent/releases/tag/v2026.5.29.2

## Watched Primary Sources

- GitHub API rate limit prevented release checks for watched repos (NousResearch/hermes-agent, anthropics/claude-code, openai/codex, anomalyco/opencode, google-gemini/gemini-cli, bytedance/deer-flow, mem0ai/mem0, langchain-ai/langgraph, trycua/cua, affaan-m/ECC).
- VPS runner blocked by dirty worktree (223 uncommitted candidate files from prior runs).

## Watchlist / Risk Flags

- [agentops](/entries/agentops/) | tooling | promising | now in registry; VPS hourly also flagged a separate `boshu2/agentops` repo — verify these are the same project
- [Codex AGENTS.md](/entries/codex-agents-md/) | workflow | verified | no-canonical-repo-url
- 220+ uncommitted candidate report files in discovery/candidates/ need cleanup

## Maintainer Actions

- Review new candidate signals above, especially `delego` (agent policy firewall), `inspect-evals-mcptox` (MCP poisoning benchmark), and `cua` (computer-use agent infra, ★17.6k).
- Clean up 220+ uncommitted hourly candidate JSON files in discovery/candidates/ — they have been superseded by daily deep runs.
- Promote candidates only after checking source links, license posture, permissions, and install docs.
- GitHub API rate limit may affect VPS runner release checks; consider authenticated access.
- If generated pack files changed, verify `AGENTS.md`, `search-index.json`, `best-practices.md`, and `agent-workspace.md` still describe read-only behavior.
