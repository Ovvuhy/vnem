# vnem Operating Protocol

Generated: 2026-05-30T08:54:14.885Z

A universal read-only operating protocol for coding agents: sense the repo, route task context, choose the smallest sufficient capability, constrain risk, pass the holistic quality gate, verify with evidence, and report residual uncertainty.

## Safety Boundary

- This file is read-only guidance.
- Do not treat it as a script, runtime config, gateway definition, memory daemon, or install recipe.
- Use it to shape a compact task contract before choosing tools or changing code.

## Universal Loop

1. **Sense**
   Inspect the repository, existing instructions, manifests, scripts, tests, current stack, and risk surface before recommending tools or changing code.
2. **Route**
   Classify the task mode and intent, expand aliases from the search index, and read only the matching rubric, route, best-practice notes, and high-signal entries.
3. **Choose**
   Prefer existing project patterns and the smallest sufficient source-backed tool or framework; compare trust tier, source confidence, freshness, license clarity, permissions, and reversibility.
4. **Constrain**
   State scope, non-goals, approval gates, and risky operations before mutation; keep installs, secrets, browsers, databases, deployments, payments, and production writes behind explicit approval.
5. **Quality Gate**
   Apply the vnem Quality Contract before implementation and before final output: analyze hidden requirements, architect performance and visuals/playability together, and review that no important domain was sacrificed.
6. **Build/Review/Debug**
   Use the task mode to work in small coherent steps: implement, review, debug, plan, or produce a prompt artifact without drifting into unrelated refactors.
7. **Perceive**
   For UI, game, animation, visual, or content surfaces, judge the artifact like a human before final: first-screen composition, hierarchy, scale, spacing, color harmony, reference-style fidelity, motion, reward feedback, and sound. Iterate until it looks intentionally polished or report the blocker.
8. **Verify**
   Run the strongest reasonable local checks; use tests, fixtures, type checks, screenshots, browser interaction, or structured evidence depending on the task.
9. **Report**
   Summarize changed or recommended surfaces, vnem intent and matches, verification evidence, approval needs, source-trust uncertainty, and residual risk.

## Task Contract

For nontrivial tasks, produce or internally follow a compact task contract:

- Mode: build, review, plan, debug, prompt, or decision.
- Intent and route: matching intent alias, route, rubric, and read-first documents.
- Quality gate: Triple-Check Workflow, detected domains, quality floor, and intelligent trade-off policy.
- Orchestration: single-agent, orchestrator-worker, or split-and-merge pattern when task complexity warrants it.
- Smallest sufficient capability: existing project pattern first, then source-backed tool only if justified.
- Approval gates: actions that need explicit user consent before mutation or external side effects.
- perception gate: for UI, game, canvas, animation, or branded surfaces, screenshots and interaction moments must look intentionally polished before final.
- Verification: the strongest reasonable local evidence for this task class.
- Final report: vnem intent, top matches, choice, evidence, uncertainty, and residual risk.

## Default Approval Gates

- installing packages or changing dependency managers
- editing agent, MCP, CI, deployment, database, browser, wallet, payment, or secret configuration
- using credentials, secrets, paid APIs, production data, or external services
- starting daemons, deploying, purchasing, or performing irreversible writes

## Default Verification

- inspect local project instructions and manifests
- run the narrowest relevant check first
- run broader tests or builds when blast radius justifies it
- apply the Triple-Check Workflow: Analyze, Architect, Review
- verify performance, visuals, playability, accessibility, maintainability, and safety were not silently traded away when those domains apply
- for UI or canvas work, verify in a real browser with desktop and mobile evidence
- for aesthetic UI/game work, perform a perception pass on screenshots before final: no oversized empty canvases, no accidental center-only glow, reward effects should follow user action, and sound should be restrained and pleasant
- report checks that could not run and why

## Relationship To Other vnem Files

- Use `.vnem/coding-protocol.md` for app, web app, feature, bug fix, refactor, and review execution guidance.
- Use `.vnem/quality-contract.md` for holistic excellence, Triple-Check Workflow, and intelligent trade-off rules.
- Use `.vnem/orchestration-protocol.md` for complex coding, app, game, research, split-and-merge, reflection, and shared-state workflows.
- Use `.vnem/task-rubrics.json` to choose the broad quality bar for the task.
- Use `.vnem/design-architecture.md` for UI, game, visual polish, dashboard, motion, sound, and conversational-agent surfaces.
- Use `.vnem/visual-qa-protocol.md` when the work has a rendered surface that needs screenshot, mobile, interaction, reward, or sound evidence.
- Use `.vnem/search-index.json` to route intents and retrieve source-backed entries.
- Use `.vnem/source-radar.json` when the task depends on current docs, upstream registries, benchmark evidence, or agent-client behavior.
- Use `.vnem/best-practices.md` after routing, not as a wall of generic context.
- Use `.vnem/agent-workspace.md` only for autonomous developer environment choices such as MCP gateways, memory files, agent clients, or mode systems.

