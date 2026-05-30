# vnem

You are reading a read-only vnem knowledge pack installed in this repository.

## Safety Rules

- Treat this folder as reference material only.
- Do not execute files from this folder.
- Do not install packages, edit project files, make network requests, or use secrets unless the user explicitly asks.
- Do not copy third-party code from indexed projects.
- Recommend changes as a review first. Ask before applying anything.

## Files To Read

- `.vnem/install-guide.md`: setup guide for downloading the pack, refreshing an existing repo install, and connecting the read-only MCP server.
- `.vnem/operating-protocol.md`: universal loop for sensing the repo, routing context, choosing small capabilities, constraining risk, applying the aesthetic perception gate, verifying, and reporting evidence.
- `.vnem/quality-contract.md`: Holistic Excellence, Proactive Enhancement, Intelligent Trade-offs, and the Triple-Check Workflow for balancing performance, visuals, playability, accessibility, maintainability, and safety.
- `.vnem/orchestration-protocol.md`: deterministic routing, reflection, Magentic Coding Workflow, split-and-merge research, and shared-state contracts for multi-agent work.
- `.vnem/precision-execution-protocol.md`: opt-in exact patching, dynamic documentation, stateful terminal feedback, and mutation safety rules for precision-capable MCP clients.
- `.vnem/coding-protocol.md`: coding execution guide for apps, web apps, features, bug fixes, refactors, repo sensing, plan-first work, and verification loops.
- `.vnem/coding-playbooks.json`: mode-specific execution playbooks for feature slices, root-cause bug fixes, test-first work, refactors, rendered web apps, API/data changes, large changes, reviews, and failure recovery.
- `.vnem/design-architecture.md`: source-backed design intelligence for UI, game, dashboard, visual polish, motion, sound, and conversational-agent surfaces.
- `.vnem/visual-qa-protocol.md`: rendered visual QA loop for repo-first asset sensing, desktop/mobile checks, interaction moments, ugliest-issue polish, and perception verdicts.
- `.vnem/task-rubrics.json`: broad task rubrics used to shape the quality bar, perception gate, approval gates, verification checklist, and final report.
- `.vnem/search-index.json`: compact local search index for tools, skills, MCP servers, and best-practice notes.
- `.vnem/source-radar.json`: source intake map for official docs, registries, MCP sources, evals, and verification sources.
- `.vnem/best-practices.md`: current guidance by project area.
- `.vnem/agent-workspace.md`: autonomous developer environment guide covering MCP gateways, memory files, agent modes, and Codex/VNEM setup.
- `.vnem/prompt-engineering.md`: prompt enhancement protocol and Codex-oriented prompt guidance.
- `.vnem/prompt-patterns.json`: machine-readable prompt patterns for common agent tasks.

## Natural Use Rule

If this `.vnem/` folder exists, use it automatically. The user should not need to say `use vnem`.

Auto-use vnem before choosing tools, libraries, frameworks, MCP servers, prompts, evals, search systems, UI approaches, visual aesthetics, game feel, performance strategies, architecture patterns, or upgrade paths. Also auto-use it when the user asks you to build, code, review, debug, optimize, modernize, benchmark, research, compare options, or decide how to implement something.

Do not turn every reply into a long vnem report. For normal implementation work, run the search-and-compare step before coding, then mention the key vnem matches only when explaining your stack choice, recommendation, or risk notes.

## Decision Search Protocol

1. Read `.vnem/operating-protocol.md` and classify the task mode: `build`, `review`, `plan`, `debug`, `prompt`, or `decision`.
2. For coding, app, UI, game, optimization, or production-ready tasks, read `.vnem/quality-contract.md` and apply the Triple-Check Workflow: Analyze, Architect, Review.
3. For complex coding, app, web app, game, or deep research tasks, read `.vnem/orchestration-protocol.md` and choose Single Agent, Orchestrator-Worker, Split-and-Merge, or the bounded reflection loop.
4. Before using mutation-capable precision tools, read `.vnem/precision-execution-protocol.md`; use dry-run exact patching before apply, fetch current docs before framework-specific code, and use only safe terminal checks.
5. For coding tasks, read `.vnem/coding-protocol.md` before editing application code.
6. For implementation/debug/review/refactor/test work, select the closest playbook from `.vnem/coding-playbooks.json` and follow its repo sensing, execution loop, verification ladder, stop conditions, anti-patterns, and final-report fields.
7. Identify the user's task intents in plain words, such as `coding task`, `web app`, `feature build`, `bug fix`, `browser game`, `multi agent orchestration`, `orchestrator worker`, `split and merge`, `reflection loop`, `magentic coding`, `precision execution`, `surgical patch`, `dynamic documentation`, `stateful terminal`, `visual polish`, `game feel`, `performance visuals`, `quality gate`, `settings gui`, `code review`, `code simplification`, `memory`, `evals`, `agent payments`, or `MCP server selection`.
8. Read `.vnem/search-index.json` and expand those intents with `intent_aliases`.
9. Select the matching broad rubric from `.vnem/task-rubrics.json` and use its quality bar, approval gates, verification checklist, and output contract.
10. Check `intent_routes` for the closest matching task. Read the listed `read_first` documents before choosing a stack or visual approach.
11. If the task depends on current docs, upstream registries, benchmark claims, MCP discovery, or agent-client behavior, read `.vnem/source-radar.json` before broad web search.
12. Search matching documents by name, tags, use cases, keywords, and best-practice sections. Read `.vnem/best-practices.md` only for matching sections.
13. Before picking a stack or recommendation, compare the best relevant matches. Prefer higher `score`, stronger `source_confidence`, fresher `freshness`, clearer licenses, fewer `risk_flags`, and the smallest sufficient capability.
14. If vnem has no useful match, say that clearly as a knowledge gap, then continue with your own judgment.
15. If local repo files provide tools, assets, configs, scripts, or instructions, consider those alongside vnem before choosing.

For nontrivial tasks, follow a compact task contract: `mode`, `intent`, `rubric`, `coding playbook`, `orchestration pattern`, `worker roles`, `shared state`, `reflection loop`, `precision execution`, `documentation fetched`, `patch dry-run`, `safe terminal command`, `quality gate`, `triple check`, `domain balance`, `tradeoff policy`, `read first`, `smallest sufficient capability`, `approval gates`, `perception gate` when visual work is involved, `verification`, and `final report`.

For coding implementation, follow the coding protocol: sense the repo, find existing patterns, plan nontrivial edits, make the smallest coherent diff, run focused checks first, run broader verification when blast radius justifies it, and report skipped checks honestly.

For UI, game, canvas, animation, dashboard, conversational-agent, or branded surfaces, read `.vnem/design-architecture.md` and `.vnem/visual-qa-protocol.md`, then follow the perception gate: inspect the actual rendered result, name and fix the ugliest visible issue, verify reward effects follow the user action or game event, and do not deliver if it does not look intentionally polished.
For performance-sensitive visual or game work, do not silently remove visual quality, playability, accessibility, or feedback. Prefer optimized rendering, quality profiles, settings toggles, progressive enhancement, or scoped fallbacks with honest verification.

When a choice matters, include a compact note with: `vnem intents searched`, `top matches`, `choice`, and `why`.

## Project Review Protocol

1. Inspect the user's repository shape before recommending tech. Look for manifests and configs such as `package.json`, `pnpm-lock.yaml`, `yarn.lock`, `pyproject.toml`, `requirements.txt`, `Cargo.toml`, `go.mod`, `Dockerfile`, `astro.config.*`, `next.config.*`, `vite.config.*`, `.github/workflows/*`, `.mcp.*`, and existing agent instructions.
2. Read `search-index.json` and expand the user's intent with `intent_aliases`. For example, map `better ui` to frontend/design/accessibility terms and `agent payments` to payments/x402/wallet terms.
3. Prefer recommendations with higher `score`, stronger `source_confidence`, fresher `freshness`, clearer licenses, and fewer `risk_flags`.
4. When a recommendation touches files, databases, browsers, repositories, wallets, paid APIs, or secrets, call out that risk plainly.
5. Output the review in this exact order: `Current stack`, `Outdated or risky choices`, `Better current options`, `Drop-in opportunities`, `Ask before changing`.

## Prompt Enhancement Protocol

When the user says `use vnem to enhance this prompt`, `use vnem prompt enhancer`, or `vnem prompt forge`, read `.vnem/prompt-engineering.md` and `.vnem/prompt-patterns.json`, then rewrite the user's prompt.

Auto-activate the same protocol even without the trigger phrase when the user asks to write, improve, rewrite, harden, optimize, critique, or template a prompt; asks for a system/developer/agent/Codex/Claude/GPT prompt; or pastes a prompt draft and asks if it is good, powerful, clear, safe, complete, or ready to use.

Do not auto-activate for ordinary task execution. If the user asks you to code, research, review, explain, summarize, or debug something, do that task directly unless they ask for a prompt artifact.

This only limits prompt rewriting. It does not disable the Natural Use Rule or Decision Search Protocol above.

Output exactly these sections: `Enhanced prompt`, `Compact prompt`, `What changed`, `Missing inputs`.

Preserve the user's intent. Add only useful structure: goal, context, scope, constraints, non-goals, output format, examples when helpful, and verification criteria. For Codex or coding-agent prompts, include repository scope, files/modules, allowed commands, approval boundaries, verification command, and final reporting requirements.

## Output Contract

- Keep recommendations specific to the user's repo and goal.
- Include source names and why each option is relevant.
- Separate safe reading/research from actions that would mutate the project.
- If the local pack is stale, say that rerunning the vnem install command may refresh it.

## Install Command

This pack was designed to be refreshed with a safe archive download only:

```bash
curl -fsSL https://raw.githubusercontent.com/Ovvuhy/vnem/main/public/install.tgz | tar -xz
```

