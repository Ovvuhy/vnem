# vnem Coding Protocol

Generated: 2026-06-22T21:02:06.140Z

A read-only coding execution protocol for making agents better at apps, web apps, features, debugging, refactors, and reviews through repo sensing, plan-first work, small diffs, and verifiable outcomes.

## Safety Boundary

- This file is read-only guidance.
- Do not treat it as a script, package installer, dependency recommendation, CI config, or runtime agent.
- Use it to improve how a coding agent thinks and verifies before it edits application code.
- Keep package installs, deployment, production data, secrets, paid APIs, and broad rewrites behind explicit user approval.

## How To Use

- Read this file for coding tasks, app builds, web apps, feature work, bug fixes, refactors, and code reviews.
- Read `.vnem/quality-contract.md` for the holistic quality gate: performance, visuals, playability, accessibility, maintainability, and safety must not be silently traded away.
- Then use `.vnem/coding-playbooks.json` to select the closest concrete execution loop for the task mode.
- Use `.vnem/search-index.json` to route the task and `.vnem/task-rubrics.json` to pick the quality bar.
- Use `.vnem/design-architecture.md` and `.vnem/visual-qa-protocol.md` when the task has a visible app, web, UI, canvas, or game surface.
- Use `.vnem/source-radar.json` when current docs, agent-client behavior, benchmark claims, or framework/tool choices matter.

## What Actually Improves AI Coding

- Give the agent stable project instructions, but keep them concise enough that the important parts remain visible.
- Give the agent a verification loop it can run itself: tests, build, typecheck, browser screenshot, fixture, expected output, or reproduction step.
- Shape tasks like good issues: problem, acceptance criteria, scope, target files or discovery path, non-goals, and evidence required before final.
- Use an explore -> plan -> implement -> verify loop for nontrivial changes instead of speculative editing.
- Keep the context budget clean: read exact files, summarize discoveries, avoid broad doc dumps, and split unrelated work into a fresh session.
- Prefer small reviewable diffs that reuse existing patterns over broad rewrites, new frameworks, or clever abstractions.
- Apply the vnem Quality Contract so performance, visuals, playability, accessibility, maintainability, and safety improve together instead of trading one away silently.

## Holistic Excellence Contract

- Before coding, run the Triple-Check Workflow: Analyze the stated and hidden goal, Architect a balanced implementation, then Review for sacrificed domains before final.
- Do not satisfy a performance request by quietly removing visual quality, game feel, accessibility, or verification when those domains matter.
- If a fast path and high-quality path conflict, engineer a deliberate alternative such as a settings GUI, quality profile, adaptive effects, lazy loading, reduced-motion path, optimized assets, feature flag, or scoped fallback.
- For production-ready work, preserve behavior, speed, visual polish, interaction feel, maintainability, and safety to the strongest feasible level for the repo and task.
- If a trade-off remains, name it plainly with evidence, user impact, mitigation, and what could not be verified.

## Repo Sensing Contract

- Before editing, inspect the nearest agent instruction files, README, package or language manifests, lockfiles, framework config, scripts, tests, CI, and relevant source files.
- Find one or two existing examples of the pattern to copy: route, component, API handler, test, state store, data model, error handling, or styling convention.
- Name the current stack and verification commands before recommending new tooling.
- If the task is visual or browser-based, inspect assets, routes, CSS tokens, existing components, and available browser-test tooling.
- If the task touches auth, payments, data, deployment, secrets, package installs, or production-like resources, stop and identify the approval gate before mutation.

## Plan Before Mutating

- For small safe changes, keep the plan internal and proceed after sensing the repo.
- For large, ambiguous, security-sensitive, dependency-changing, or multi-module work, write a short plan before editing.
- A good plan names files or modules, the behavior change, non-goals, verification commands, rollback path, and likely risks.
- Do not let planning become an essay. The plan should be short enough to guide the next edits.
- When the plan reveals missing acceptance criteria or risky scope, ask one blocking question or propose the smallest safe first slice.

## Implementation Rules

- Make the smallest coherent change that satisfies the acceptance criteria.
- When a precision execution MCP is available, prefer exact SEARCH/REPLACE or unified-diff patching with a dry-run over rewriting whole files.
- Before writing framework-specific code, fetch current documentation when syntax, API shape, or engine setup might have changed.
- Reuse existing project helpers, components, styles, data access layers, and error patterns before adding new ones.
- Add dependencies only when local code or existing dependencies cannot reasonably solve the problem, and state why before installing.
- Preserve public APIs, data formats, migration behavior, and user-visible flows unless the user explicitly asked to change them.
- Keep generated code, formatting-only churn, dependency-lock churn, and unrelated refactors out of the diff unless required by the task.
- For web apps, build the actual usable workflow first, then polish the first viewport and core interaction.

## Verification Ladder

- Start with the narrowest relevant check: one failing test, a focused unit test, typecheck for touched files, or a small fixture.
- Escalate to broader test/build/lint when shared behavior, public APIs, routing, build config, auth, data, or dependencies changed.
- For UI and web apps, run the app or inspect the rendered artifact when practical; code review alone is not enough for visual fit.
- For bug fixes, reproduce or describe the original failure, then prove the new behavior prevents it.
- For refactors, prove behavior preservation with existing tests, snapshots, fixtures, or call-site evidence before deleting or reshaping code.
- If a check cannot run, report exactly why and what risk remains.

## Web App And App Quality Bar

- The first screen must reveal the real product/workflow, not a placeholder or generic landing copy.
- The primary workflow should be usable without reading explanatory feature text.
- Text must fit on mobile and desktop; controls need stable dimensions, labels, focus states, and usable tap targets.
- Use domain-appropriate density: dashboards and tools should be scannable and utilitarian; games and branded surfaces can be more expressive.
- Use source-backed libraries or existing project conventions for hard domains such as routing, auth, forms, payments, persistence, browser automation, game engines, and 3D.
- Before final, name and fix the ugliest visible issue if browser/screenshot evidence is available.

## Context And Agent-Client Compatibility

- AGENTS.md, CLAUDE.md, GEMINI.md, Copilot instructions, and Cursor rules are all repo-context surfaces; keep shared guidance stable and avoid client-specific clutter unless needed.
- Use `.vnem/search-index.json` for fast local routing and `.vnem/source-radar.json` for current upstream docs before broad web search.
- Use MCP tools and resources only when they reduce context or verification cost; do not expose large tool catalogs just because they are available.
- Use subagents or parallel sessions for independent investigation, review, or alternative designs, then integrate through one owner.
- After repeated failed attempts, summarize the learned constraints and restart the task in a cleaner context.

## Final Report Contract

- State what changed and where.
- State the vnem intent, top matches, and chosen route when the choice mattered.
- List verification commands or rendered checks and their result.
- Call out failed or skipped checks plainly.
- Call out approval gates that remain, such as package installs, deployment, secrets, paid APIs, or production data.
- Keep the report compact enough that the user can decide whether to review, merge, or ask for the next slice.

## Source URLs

- https://www.anthropic.com/engineering/claude-code-best-practices
- https://openai.com/business/guides-and-resources/how-openai-uses-codex/
- https://docs.github.com/en/copilot/tutorials/cloud-agent/get-the-best-results
- https://docs.github.com/en/copilot/concepts/prompting/response-customization
- https://code.visualstudio.com/docs/copilot/customization/custom-instructions
- https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/configuration.md
- https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/auto-memory.md
- https://docs.cursor.com/context/rules-for-ai
- https://www.anthropic.com/engineering/writing-tools-for-agents
- https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
- https://www.anthropic.com/engineering/building-effective-agents
- https://developers.openai.com/api/docs/guides/agent-evals
