# vnem Best Practices

Generated: 2026-05-27T21:08:33.015Z

Use this as a compact, current guidance layer for coding agents. Prefer these notes when choosing whether to add, replace, or avoid a tool.

## MCP Gateway And Tool Routing

Use MCP gateways as a policy, discovery, routing, and observability layer only when the agent would otherwise see too many tools or credentials directly.

- Start with a small direct MCP server set; add a gateway when tool discovery, authentication, policy, logging, or routing becomes hard to govern.
- Expose tools by role and task intent instead of broadcasting every server schema to the model.
- Keep high-risk tools behind explicit policy: repositories, browsers, databases, payments, filesystem writes, deployments, and production data.
- Centralize audit logs, credential propagation, and rate limits at the gateway when multiple agents or teams share tool access.
- Treat gateway catalog recommendations as architecture guidance; do not ship gateway daemons, secrets, or runnable configs from a read-only knowledge pack.

Sources: https://modelcontextprotocol.io/docs/getting-started/intro, https://modelcontextprotocol.io/specification/2025-11-25/basic/security_best_practices, https://docs.lunar.dev/mcpx/architecture, https://github.com/microsoft/mcp-gateway

Search aliases: mcp gateway, one mcp, tool routing, discovery control, least privilege, policy, lunar mcpx, microsoft mcp gateway, catalog

## Persistent Memory And Context Files

Put stable project facts in versioned instruction files, keep volatile task state separate, and review memory for secrets, stale assumptions, and repeated failed approaches.

- Use `AGENTS.md` for Codex-facing repository instructions: commands, conventions, scope, and safety boundaries.
- Use `CLAUDE.md` for Claude Code memory when that client is active, and separate shared project instructions from local machine overrides.
- Add a memory bank only when the team will maintain it; stale active context is worse than a short instruction file.
- Record architectural decisions and abandoned approaches so agents do not repeat known dead ends.
- Never store secrets, credentials, private customer data, or unverified claims in durable agent memory.

Sources: https://developers.openai.com/codex/guides/agents-md, https://docs.anthropic.com/en/docs/claude-code/memory, https://github.com/Bhartendu-Kumar/rules_template

Search aliases: memory bank, persistent memory, context files, agents.md, claude.md, decision log, active context, roo code, cline

## IDE Agent Selection

Choose coding agents by editor fit, approval model, model routing, MCP support, maintenance status, and the repo's need for autonomous multi-file changes.

- Use source-backed product capabilities rather than unsourced benchmark claims when comparing agents.
- Prefer strong human approval flows for agents that can edit files, run shell commands, or mutate repositories.
- Use BYOM or OpenRouter-style routing only when the client supports it and the task can tolerate model variability.
- Treat archived or community-maintained forks as watchlist options until maintenance and security posture are clear.
- Evaluate agents on one real repository workflow: plan quality, file selection, diffs, verification behavior, and recovery from failed tests.

Sources: https://docs.cursor.com/agent/overview, https://docs.cline.bot/introduction/overview, https://docs.anthropic.com/en/docs/claude-code/overview, https://developers.openai.com/codex

Search aliases: ide agent, coding agents, roo code, cline, cursor agent, claude code, codex, byom, agent modes

## Codex/VNEM Setup

For Codex-based workspaces, keep vnem read-only, load `AGENTS.md` instructions, expose MCP resources deliberately, and use generated guidance before installing tools.

- Keep `AGENTS.md` concise and repository-specific: commands, conventions, verification, and approval boundaries.
- Read `.vnem/agent-workspace.md` before designing a new autonomous developer environment.
- Expose vnem through MCP as read-only resources and tools; use it for recommendation context, not for installation or mutation.
- Prefer generated prompt patterns for recurring architecture, gateway, memory, and implementation prompts.
- Ask before adding MCP servers, editing client config, installing packages, using secrets, or starting daemons.

Sources: https://developers.openai.com/codex/guides/agents-md, https://platform.openai.com/docs/docs-mcp, https://github.com/openai/codex

Search aliases: codex config, codex, vnem, agents.md, mcp resources, agent workspace, prompt patterns, read-only knowledge pack

## Visual Experience And Perception Gate

For visual work, judge the actual perceptual artifact: if it looks ugly, generic, oversized, noisy, or mismatched to references, it is not done.

- Read `.vnem/design-architecture.md` for UI, game, dashboard, animation, brand, or visual-polish tasks before choosing the final visual approach.
- A UI, game, animation, or visual artifact is not deliverable until the first screenshot looks intentionally designed, balanced, and domain-appropriate.
- Run a perception gate before final: composition, hierarchy, scale, spacing, color harmony, typography, motion, sound, and feedback origin.
- Anchor reward and dopamine effects to the user action or game event; avoid static center glow unless the center is truly the event.
- For canvas and games, keep the playfield within the viewport with breathing room; oversized empty boards fail the visual check unless the user asked for that scale.
- Sound design must be short, pleasant, throttled, and muteable; avoid constant tick noise unless it is subtle and intentionally improves feel.
- Use source-backed CSS capabilities deliberately: CSS Grid for two-dimensional dashboard layout, `clamp()` for bounded fluid sizing, container queries for component-local responsiveness, and `backdrop-filter` only with readable fallbacks.
- Use WCAG 2.2/current W3C contrast requirements as the accessibility baseline. Treat APCA and WCAG 3 contrast discussions as watchlist guidance until W3C finalizes the algorithm.
- Translate reference assets into a cohesive motif by extracting palette, texture, silhouette, glow behavior, and spatial mood instead of pasting a disconnected decoration.
- After a screenshot or browser pass, name the ugliest visible issue and fix it before reporting completion.
- If the artifact still looks ugly or unpleasant, report it as blocked or needs-polish instead of calling it done.

Sources: https://developer.mozilla.org/en-US/docs/Web/CSS, https://developer.mozilla.org/en-US/docs/Web/CSS/grid, https://developer.mozilla.org/en-US/docs/Web/CSS/clamp, https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_container_queries, https://developer.mozilla.org/en-US/docs/Web/CSS/backdrop-filter, https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API, https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame, https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion, https://w3c.github.io/wcag/guidelines/22/

Search aliases: aesthetic experience, visual polish, pretty, polished, perception gate, game feel, reward feedback, dopamine, neon, glow, sound design, screenshot critique, first screen, composition, reference fidelity, ui architecture, bento dashboard, agent dashboard, motion design, design tokens, dark mode, glassmorphism, typography, layout spacing, optical alignment

## Frontend And UI

Prefer mature component systems, accessibility-first primitives, screenshot verification, domain-specific UI patterns, and an aesthetic perception gate before inventing custom interaction layers.

- Start with the product workflow, then pick UI libraries that reduce implementation risk.
- For user-facing UI, run the perception gate before final: first-screen composition, hierarchy, scale, spacing, color, typography, motion, and responsive fit.
- Use visual verification for responsive states before shipping UI generated by agents.
- Favor established icon, form, table, and command-menu primitives over handwritten widgets.

Sources: https://www.anthropic.com/engineering/building-effective-agents

Search aliases: better ui, frontend, design, tailwind, astro, react, accessibility, screenshot, component, visual polish, perception gate

## Browser Games And Interactive Canvas

For browser-native games, choose the lightest proven stack that can deliver real playability: responsive rendering, input, rules, state transitions, visible feedback, accessible UI, and browser-verified behavior.

- Pick the smallest stack that satisfies playability: Canvas with Vite for tiny custom 2D, Phaser for scene/sprite/audio/camera-heavy 2D, PixiJS for renderer-first 2D interaction, Excalibur for TypeScript-first 2D, and KAPLAY for fast playful prototypes.
- Use Three.js for custom 3D scenes, Babylon.js for richer 3D engine features, and PlayCanvas when a browser-first 3D engine/editor workflow is valuable; avoid 3D stacks for simple 2D games.
- Add physics only when game rules need it: prefer simple custom collision first, Matter.js for approachable 2D rigid bodies, and Rapier when higher-performance 2D/3D physics or determinism options matter.
- Build the loop around requestAnimationFrame timestamps, separate update and render work, use fixed-step simulation for physics-sensitive games, and keep pause/resume behavior explicit.
- Model input as actions rather than raw keys so keyboard, pointer, touch, and gamepad controls can share game logic and be remapped for nontrivial games.
- Include asset preload/loading, start, pause, win, lose, restart, and error states before visual flourishes; browser games fail quickly when a terminal state or restart path is missing.
- Design game UI for readability during motion: high-contrast HUD text, clear hit/damage/reward feedback, stable layout, large touch targets, and readable menus on both desktop and mobile.
- Reward feedback should originate at the relevant interaction or game-event coordinates, such as the collectible position, rather than defaulting to a static center flash.
- Treat game feel as a deliverable: score pulses, particles, hit-stop, glow, and sound should make success feel good without cluttering the playfield.
- Keep sound restrained, throttled, and muteable; do not tick or beep on every movement step unless the cue is subtle and intentionally improves rhythm.
- Treat accessibility as game feel: provide keyboard/touch parity where practical, avoid color-only cues, respect reduced-motion needs, watch photosensitive flashing, and add captions or visual audio cues when sound carries gameplay information.
- Verify delivered playability in a real browser: serve locally, confirm nonblank canvas pixels, simulate inputs, check state transitions and restart, inspect desktop and mobile viewports, and test audio unlock behavior.
- Before final, judge the first screenshot and one reward moment for polish; a playable game that looks oversized, muddy, static, or unpleasant is not done.
- Use performance work after the game is playable: batch Canvas drawing, pre-render expensive repeated work to snug offscreen buffers, measure before optimizing, and move to WebGL/WebGPU libraries when object count or effects justify it.
- For coding-agent evaluation, judge the delivered game rather than just build success; browser games expose input, spatial mapping, rules, terminal conditions, restart, and visible-feedback failures that normal code checks miss.

Sources: https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API, https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame, https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas, https://web.dev/articles/canvas-performance, https://vite.dev/guide/, https://docs.phaser.io/, https://pixijs.com/, https://excaliburjs.com/, https://kaplayjs.com/, https://threejs.org/docs/, https://doc.babylonjs.com/setup/support/webGPU, https://github.com/playcanvas/engine, https://github.com/liabru/matter-js, https://github.com/dimforge/rapier.js/, https://learn.microsoft.com/en-us/gaming/accessibility/guidelines, https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/102, https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/107, https://w3c.github.io/wcag/guidelines/22/, https://arxiv.org/abs/2605.17637

Search aliases: browser game, web game, html5 game, canvas game, 2d game, 3d game, game engine, game ui, game accessibility, game physics, game testing, canvas performance, canvas, animation, vite, phaser, pixi, excalibur, kaplay, three.js, babylon.js, playcanvas, matter.js, rapier

## Backend And APIs

Use boring, observable APIs with typed boundaries, explicit auth, and generated clients when agents need reliable integration points.

- Keep agent-callable APIs narrow and typed.
- Expose idempotent operations when agents may retry.
- Log tool calls and return structured errors instead of opaque text.

Sources: https://www.anthropic.com/engineering/building-effective-agents

Search aliases: backend, api, database, postgres, auth, server, runtime, deployment

## Agent Tooling

Treat MCP servers, skills, prompts, and tools as versioned capabilities with provenance, permission notes, and review status.

- Prefer read-only tools until the agent has proven the workflow.
- Record tool permissions and environment variables near the install instructions.
- Use reviewable PRs for automated registry updates.

Sources: https://modelcontextprotocol.io/docs/getting-started/intro, https://www.anthropic.com/engineering/building-effective-agents

Search aliases: agent, mcp, skills, tools, orchestration, workflow, prompt

## Search And Retrieval

Use hybrid search for local knowledge packs: lexical matching for speed, intent aliases for recall, and semantic/reranking later when hosted infrastructure is justified.

- Keep a local static index for offline agent reads.
- Normalize aliases like 'better UI' or 'agent payments' into explicit search terms.
- Rank by source confidence, trust tier, freshness, and risk flags.

Sources: https://docs.llamaindex.ai/en/stable/use_cases/agents/, https://docs.langchain.com/oss/python/langgraph/overview

Search aliases: faster search, search, retrieval, index, semantic, rerank, hybrid, latency

## Evals And Verification

Agents should prove outputs with tests, screenshots, fixtures, or structured checks before recommending a stack change.

- Ask what success looks like before choosing a package.
- Use small fixtures to test recommendations against real project files.
- Prefer tools that expose pass/fail evidence over tools that only generate text.

Sources: https://inspect.aisi.org.uk/, https://www.promptfoo.dev/docs/intro/, https://docs.ragas.io/

Search aliases: evals, testing, benchmark, verification, quality, score, fixtures

## Code Review And Upgrade Audits

Project-review agents should inspect manifests, framework configs, dependency age, security posture, and available drop-in improvements before proposing code changes.

- Start with the current stack and lockfiles before recommending replacements.
- Separate outdated or risky choices from optional upgrades.
- Ask before editing code, installing packages, using secrets, or opening network connections.

Sources: https://github.com/openai/codex, https://docs.anthropic.com/en/docs/claude-code/overview

Search aliases: code review, upgrade, dependency, outdated, package, static analysis, best practices

## Code Simplification And Minimal Refactors

Simplify code by preserving behavior first, deleting proven waste, reducing duplication, and using the project's existing abstractions before introducing new ones.

- Treat simplification as behavior-preserving refactoring: characterize current behavior with tests, snapshots, fixtures, or golden examples before deleting or reshaping code.
- Prefer deletion over abstraction when code is unused, unreachable, duplicated, or handled by an existing local helper.
- Use static evidence before edits: lexical search, AST-aware search, unused-file/export/dependency checks, duplicate-code detection, and existing lint or type checks.
- Keep public APIs, data formats, error behavior, and user-visible workflows stable unless the user explicitly asks for a product change.
- Make small reviewable steps: remove dead code, collapse duplication, simplify control flow, then rerun focused and broad verification.

Sources: https://refactoring.com/, https://martinfowler.com/bliki/OpportunisticRefactoring.html, https://knip.dev/, https://jscpd.dev/, https://ast-grep.github.io/

Search aliases: code simplification, code compaction, minimal code, professional code, refactor, dead code, duplication, complexity, knip, jscpd, ast-grep

## Security And Trust

Never let discovery become blind execution. Track permissions, licenses, data access, stale links, and whether a tool can mutate user state.

- Do not install or execute discovered tools without explicit user approval.
- Prefer upstreams with clear licenses and active source links.
- Call out tools that touch files, browsers, databases, wallets, or secrets.

Sources: https://modelcontextprotocol.io/docs/getting-started/intro, https://www.anthropic.com/engineering/building-effective-agents

Search aliases: security, trust, identity, compliance, guardrails, audit, permissions

## Payments And Commerce

Agent payments need receipts, spending limits, explicit policies, and reviewable proof of what was purchased or executed.

- Use strict budgets and require receipts for paid agent actions.
- Separate payment authorization from task completion verification.
- Prefer protocols with clear provenance and auditable transaction context.

Sources: https://docs.stripe.com/agents

Search aliases: agent payments, payments, x402, wallet, commerce, receipt, budget

## Data And Memory

Use memory and data connectors only when they improve repeated work, and keep scopes narrow enough for users to reason about.

- Start with read-only data access.
- Expose what the agent can remember and how to delete it.
- Prefer project-local summaries over unbounded transcript memory.

Sources: https://docs.anthropic.com/en/docs/claude-code/memory, https://docs.mem0.ai/, https://docs.letta.com/

Search aliases: memory, data, context, persistence, knowledge, database, state

## Deployment And Operations

Agent-built systems need cheap preview deploys, logs, rollback paths, and clear operational ownership.

- Use preview environments for generated changes.
- Keep CI fast enough that agents can use it as feedback.
- Surface stale dependencies and known upgrade paths in the recommendation output.

Sources: https://docs.langfuse.com/, https://docs.arize.com/phoenix, https://docs.sentry.io/product/sentry-mcp/

Search aliases: deployment, ops, logs, preview, monitoring, release

## Coding Agents

Give repository-editing agents tight scope, strong local context, explicit approval boundaries, and fast verification loops before trusting broader autonomy.

- Prefer agents that can inspect the repo, produce diffs, run tests, and explain residual risk.
- Keep destructive shell, package installs, deploys, secrets, and production writes behind explicit approval.
- Use small, reviewable pull requests and require the agent to report changed files and verification evidence.

Sources: https://github.com/openai/codex, https://docs.anthropic.com/en/docs/claude-code/overview, https://docs.github.com/en/copilot/concepts/about-copilot-coding-agent, https://aider.chat/docs/, https://docs.all-hands.dev/

Search aliases: coding agents, codex, claude code, copilot, cursor, aider, cline, openhands, codebase, repository

## Subagents And Multi-Agent Work

Use multiple agents for independent research, codebase slices, critique, or tool-specialized work; keep one owner responsible for integration and final judgment.

- Split only independent work; do not delegate the immediate blocker on the critical path.
- Give every subagent a narrow role, owned files or outputs, and a clear definition of done.
- Centralize synthesis, conflict resolution, and user-facing recommendations in one coordinator.

Sources: https://docs.anthropic.com/en/docs/claude-code/sub-agents, https://www.anthropic.com/engineering/built-multi-agent-research-system, https://openai.github.io/openai-agents-python/, https://langchain-ai.github.io/langgraph/concepts/multi_agent/

Search aliases: subagents, multi agent, swarms, delegation, parallel, handoffs, supervisor, specialist, agent team

## Context Engineering

Treat instructions, memory files, retrieval, and artifacts as the agent's working environment; prune noise and make durable context explicit.

- Put stable project instructions in versioned files and keep temporary task notes out of global memory.
- Prefer retrieved, cited context over pasting large opaque blobs into prompts.
- Audit memory writes for secrets, stale assumptions, and accidental cross-project leakage.

Sources: https://docs.anthropic.com/en/docs/claude-code/memory, https://docs.anthropic.com/en/docs/claude-code/sub-agents, https://docs.mem0.ai/, https://docs.letta.com/

Search aliases: context engineering, claude memory, memory, instructions, agents.md, claude.md, retrieval, skills, knowledge pack

## Research Source Intake

Treat vnem as a source router, not a document dump: capture official, current, machine-readable sources that help agents make better decisions before editing.

- Start source intake from the agent decision it improves: tool choice, MCP adoption, model/provider selection, prompt upgrade, eval design, UI verification, or risk review.
- Prefer official docs, canonical repositories, maintained registries, llms.txt indexes, vendor MCP docs, and eval frameworks with repeatable fixtures.
- Keep vnem metadata original and compact; preserve source URLs instead of copying long upstream docs into the install pack.
- Record trust tier, source confidence, freshness, permissions, license posture, risk flags, and whether the source can mutate external systems.
- Separate discovery from promotion: Hermes can suggest candidates, but maintainers should review before raising trust or recommending installs.
- Tie important claims to a small benchmark, smoke test, link check, or before/after agent recommendation diff.

Sources: https://modelcontextprotocol.io/docs/getting-started/intro, https://github.com/modelcontextprotocol/registry, https://llmstxt.org/, https://developers.openai.com/codex/guides/agents-md, https://code.claude.com/docs/en/mcp, https://inspect.aisi.org.uk/

Search aliases: source radar, research layer, source intake, current docs, official docs, mcp registry, llms.txt, benchmark evidence, provenance, freshness

## MCP Server Selection

MCP servers should be selected like dependencies: source-backed, least-privilege, pinned where possible, and tested against the actual client workflow.

- Install one server per concrete workflow, then verify the client can call only the intended tools.
- Mark servers that can browse, mutate repositories, query databases, spend money, or access production data.
- Prefer official or vendor-maintained servers for high-risk resources, and put community servers behind review.

Sources: https://modelcontextprotocol.io/docs/getting-started/intro, https://github.com/microsoft/playwright-mcp, https://github.com/upstash/context7, https://github.com/supabase-community/supabase-mcp, https://docs.browserbase.com/integrations/mcp/introduction

Search aliases: mcp servers, model context protocol, tools, resources, prompts, context7, playwright, browserbase, supabase, sentry

## Zero-Trust Agent Gateway Readiness

Move toward gateway behavior in phases: advisory guidance first, deterministic checks second, runtime enforcement only after threat modeling and adversarial tests.

- Do not convert the read-only vnem install pack into a daemon, shell proxy, package installer, or runtime command interceptor.
- Treat tool metadata and MCP annotations as risk signals only; trusted clients still need deterministic controls for filesystem, network, secrets, and external side effects.
- Pin tool schemas by hashing canonical schema JSON and require review when a trusted server's tool schema changes unexpectedly.
- Redact secrets before logging by combining known token patterns, connection-string patterns, private-key markers, and high-entropy argument detection.
- Enforce workspace path policy with resolved absolute paths and prefix checks before any future mutating gateway action.
- Review dependency additions as manifest diffs before installation; use package metadata and provenance signals as advisory checks with human override.
- Keep AST indexing read-only at first: extract symbols, imports, and calls into a disposable local graph before writing durable index state.

Sources: https://blog.modelcontextprotocol.io/posts/2026-03-16-tool-annotations/, https://modelcontextprotocol.io/specification/2025-06-18/schema, https://ts.sdk.modelcontextprotocol.io/variables/types.ToolAnnotationsSchema.html, https://docs.github.com/en/code-security/secret-scanning/introduction/about-secret-scanning, https://docs.npmjs.com/about-registry-signatures

Search aliases: pre execution gateway, zero trust gateway, tool pinning, schema hashing, mcp rug pull, tool poisoning, package firewall, ast indexer, path confinement, secret redaction, command risk

## Observability And Tracing

Agent runs need traces, costs, tool calls, inputs, outputs, and evaluation hooks so failures can be diagnosed instead of narrated after the fact.

- Capture full tool-call traces for development and scrub secrets before long-term retention.
- Attach eval results to traces so regressions connect to the prompt, model, tool, and dataset versions.
- Track cost, latency, retries, and handoff paths separately for single-agent and multi-agent systems.

Sources: https://docs.smith.langchain.com/, https://docs.arize.com/phoenix, https://docs.langfuse.com/, https://docs.agentops.ai/

Search aliases: observability, tracing, telemetry, spans, costs, langsmith, phoenix, langfuse, agentops

## Human Approval And Durability

Long-running agent systems should checkpoint state, support interruption, require approvals for risky actions, and resume without replaying unsafe side effects.

- Checkpoint before external side effects such as writes, purchases, deployments, and notifications.
- Represent approval gates as first-class workflow states, not as prose hidden in prompts.
- Design resumable tasks around idempotent operations and explicit operation IDs.

Sources: https://docs.langchain.com/oss/python/langgraph/overview, https://openai.github.io/openai-agents-python/, https://microsoft.github.io/autogen/stable/

Search aliases: human in the loop, approval, checkpoint, durable execution, resume, rollback, interrupt, review

## Prompt Engineering

Upgrade rough prompts into operational instructions with intent, context, constraints, output contracts, examples, and verification criteria.

- Preserve the user's intent first; improve structure, specificity, and testability without changing the goal.
- Add missing success criteria, inputs, constraints, non-goals, output format, and verification steps.
- For coding-agent prompts, include repository scope, files or modules, allowed commands, verification command, and what must not change.

Sources: https://developers.openai.com/api/docs/guides/prompt-engineering, https://developers.openai.com/api/docs/guides/prompt-optimizer, https://developers.openai.com/codex/guides/agents-md

Search aliases: prompt engineering, prompt enhancer, codex prompt, prompt optimizer, instructions, output format, examples, rubric

## Model And Provider Selection

Choose Codex, Claude Code, Gemini/ADK, framework agents, or model APIs by workflow fit, permissions, eval evidence, and operational cost rather than brand preference.

- Start from the task shape: repo editing, hosted agent runtime, multi-agent workflow, model app, browser-game build, or tool-calling backend.
- Compare approval boundaries, shell/filesystem access, memory model, MCP/tool support, tracing, evals, deployment path, cost, privacy, and reversibility.
- Run a small benchmark or pilot task before standardizing on a new agent/provider workflow.

Sources: https://developers.openai.com/codex/guides/agents-md, https://openai.github.io/openai-agents-python/, https://code.claude.com/docs/en/overview, https://adk.dev/

Search aliases: ai model selection, codex vs claude, gemini agent, provider, model, agent upgrade, adk

