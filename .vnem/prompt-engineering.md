# vnem Prompt Engineering

Generated: 2026-06-11T11:56:42.965Z

Use this when the user asks to improve, rewrite, harden, or operationalize a prompt. The main trigger phrase is `use vnem to enhance this prompt`.

The prompt layer can also auto-activate. If vnem is installed and the user asks to write, improve, rewrite, optimize, harden, critique, or template a prompt, apply this protocol even when the user does not explicitly say `use vnem`.

## Prime Directive

Preserve the user's intent. Improve the prompt's structure, specificity, context, constraints, output contract, and verification criteria without changing the goal.

## Prompt Enhancement Protocol

1. Classify the prompt: coding, research, review, debugging, frontend, eval, MCP selection, memory policy, or general.
2. Identify missing material that would change the result: audience, source context, scope, constraints, examples, output format, success criteria, tools, or permissions.
3. Keep the user's rough voice and objective, but rewrite the prompt into explicit sections.
4. Add a quality bar and verification plan when the task has factual, coding, design, operational, safety, or money risk.
5. For coding-agent prompts, include repository scope, files/modules, commands to run, what not to change, approval boundaries, and final reporting requirements.
6. Return the enhanced prompt first. Then include a compact version, a short change rationale, and any missing inputs.

## Auto-Activation Rules

Apply automatically when:

- The user asks to write, improve, rewrite, harden, optimize, or critique a prompt.
- The user asks for a system prompt, developer prompt, agent prompt, Codex prompt, Claude prompt, GPT prompt, instruction set, or prompt template.
- The user pastes a prompt draft and asks whether it is good, powerful, clear, safe, complete, or ready to use.
- The user asks for prompt engineering help, even without saying vnem explicitly.

Do not apply automatically when:

- The user is asking the agent to perform the task directly rather than create or improve a prompt.
- The user asks for a normal code change, research answer, review, summary, or explanation without requesting a prompt artifact.
- The user explicitly says not to rewrite, optimize, enhance, or expand the prompt.

When in doubt, answer the user's actual request and add a short prompt-enhancement offer only if it is clearly useful.

## Default Output

When enhancing a prompt, output exactly:

1. `Enhanced prompt`
2. `Compact prompt`
3. `What changed`
4. `Missing inputs`

If there are no missing inputs, write `None`.

## Quality Bar

- The prompt names the concrete outcome.
- The prompt provides context or says what context must be read.
- The prompt separates requirements from preferences.
- The prompt states non-goals or boundaries.
- The prompt defines the output shape.
- The prompt includes verification for risky or objective tasks.
- The prompt avoids vague boosters like `make it better` unless translated into criteria.

## Pattern Catalog

### General Prompt Enhancement

Rewrite a rough prompt into a precise, operational prompt while preserving the user's goal.

Intents: use vnem to enhance this prompt, improve prompt, make this prompt stronger

Template:

```text
You are helping me improve a prompt.

Goal:
<state the user's actual desired outcome>

Context:
<include relevant audience, environment, source material, and constraints>

Task:
<specific action the model or agent should take>

Requirements:
- Preserve the original intent.
- Ask only for missing information that would materially change the answer.
- Use clear sections, explicit constraints, and an output contract.
- Include verification criteria when the task has factual, coding, design, or operational risk.

Output Format:
<define exact sections, schema, table, bullets, code blocks, or artifact>

Quality Bar:
<what a great answer must satisfy>
```

### Codex Implementation Prompt

Prompt a coding agent to inspect the repo, make scoped edits, verify them, and report changed files.

Intents: codex prompt, implement feature, coding task

Template:

```text
You are working in this repository as a coding agent.

Objective:
<feature, bug fix, or refactor>

Scope:
- Files/modules likely involved: <paths or unknown>
- Do not change: <public API, unrelated files, formatting, dependencies, etc.>

Workflow:
1. If `.vnem/quality-contract.md` exists, apply the Triple-Check Workflow: Analyze, Architect, Review.
2. If `.vnem/coding-protocol.md` exists, read it before editing application code.
3. If `.vnem/coding-playbooks.json` exists, choose the closest playbook and follow its repo_sensing, execution_loop, verification_ladder, stop_conditions, and anti_patterns.
4. Inspect the current implementation, repo instructions, manifests, scripts, and nearest local patterns before editing.
5. For nontrivial work, write a short plan before mutation.
6. Make the smallest cohesive change that satisfies the objective without silently sacrificing performance, visuals, playability, accessibility, maintainability, or safety.
7. Add or update tests only where risk justifies it.
8. Run verification: <commands>.
9. Report selected playbook, quality gate result, changed files, verification results, skipped checks, and residual risk.

Constraints:
- Do not run destructive commands.
- Ask before installing packages, changing secrets, deploying, or touching production data.
- Preserve user changes already present in the worktree.
```

### Agentic Coding Task Prompt

Prompt a coding agent to turn a product or engineering request into a repo-grounded, verifiable implementation.

Intents: coding task, app build, web app, feature build, bug fix, large change, test first

Template:

```text
You are a coding agent working in this repository.

Goal:
<what the user wants built, fixed, reviewed, or improved>

Acceptance criteria:
- <observable behavior 1>
- <observable behavior 2>
- <verification or visual evidence expected>

Required repo sensing:
- Read `.vnem/quality-contract.md` if present and apply Holistic Excellence, Proactive Enhancement, Intelligent Trade-offs, and the Triple-Check Workflow.
- Read local agent instructions and `.vnem/coding-protocol.md` if present.
- Read `.vnem/coding-playbooks.json` if present and select the nearest playbook before editing.
- Inspect manifests, scripts, tests, framework config, and the nearest existing implementation pattern.
- Name risky surfaces before mutation: dependencies, auth, database, deployment, secrets, external services, browser automation, or paid APIs.

Execution rules:
- For nontrivial work, produce a short plan before editing.
- Prefer existing project patterns and helpers.
- Keep the diff small and scoped to the acceptance criteria.
- Do not solve one requirement by silently degrading another important domain; use settings, quality profiles, progressive enhancement, or scoped fallback when constraints conflict.
- Ask before installing packages, changing config outside scope, deploying, or using secrets.

Verification:
- Run the narrowest relevant check first: <command or check>.
- Run broader checks when blast radius justifies it: <command or check>.
- For web/UI work, inspect the rendered app on desktop and mobile when practical.

Final report:
- What changed and where.
- Verification run and result.
- Checks skipped and why.
- Remaining risk or approval needed.
```

### Code Simplification Prompt

Prompt a coding agent to reduce complexity while proving every existing feature still works.

Intents: code simplification, code compaction, minimal code, professional code, refactor

Template:

```text
Simplify this code while preserving all existing behavior.

Target:
<files, modules, or feature area>

Non-goals:
- Do not redesign product behavior.
- Do not change public APIs, data formats, or user-visible flows unless explicitly required.
- Do not add new dependencies unless the existing stack cannot solve the problem cleanly.

Workflow:
1. If `.vnem/coding-playbooks.json` exists, use the `refactor-preserve` playbook.
2. Inspect the current implementation, tests, public interfaces, and call sites.
3. Identify removable code with evidence: unused files, unused exports, duplicate branches, dead paths, repeated helpers, or needless state.
4. Preserve behavior with focused tests, snapshots, fixtures, type checks, or golden examples before risky edits.
5. Make small reviewable changes: delete proven waste, collapse duplication, simplify control flow, and reuse existing local helpers.
6. Run focused verification first, then the broader project checks.

Output:
- What was simplified.
- Features or interfaces preserved.
- Verification commands and results.
- Residual risk or areas intentionally left unchanged.
```

### Code Review Prompt

Prompt for a bug-first code review with file and line references.

Intents: review, pr review, find bugs

Template:

```text
Review the changes as a senior engineer.

Priorities:
1. Behavioral bugs and regressions.
2. Security, data-loss, or permission risks.
3. Missing tests for changed behavior.
4. Maintainability issues only when they can cause real defects.

Output:
- Findings first, ordered by severity.
- Include file and line references.
- If no issues are found, say that clearly and mention residual test risk.
```

### Debugging Prompt

Prompt an agent to reproduce, localize, fix, and verify a bug without speculative rewrites.

Intents: debug, failing test, error

Template:

```text
Debug this issue methodically.

Symptom:
<error message, failing test, screenshot, or observed behavior>

Expected behavior:
<what should happen>

Workflow:
1. Reproduce or inspect the failure evidence.
2. Identify the smallest plausible cause.
3. Patch only the relevant code.
4. Run the narrow verification first, then broader checks if needed.
5. Explain the root cause and why the fix covers it.
```

### Research Prompt

Prompt for source-backed research with freshness, tradeoffs, and recommendation criteria.

Intents: research, compare tools, best options

Template:

```text
Research this question using current, primary sources where possible.

Question:
<research question>

Decision Criteria:
- Fit for the stated use case.
- Freshness and maintenance.
- License, security, data, and operational risk.
- Integration effort and reversibility.

Output:
- Short answer.
- Comparison of top options.
- Recommendation with caveats.
- Links to sources used.
```

### Subagent Delegation Prompt

Prompt a coordinator to split independent work across specialists and keep integration centralized.

Intents: subagents, multi agent, parallel work

Template:

```text
Decide whether this task benefits from subagents.

Task:
<task>

Rules:
- Delegate only independent sidecar work.
- Keep the immediate critical-path task local to the coordinator.
- Give each subagent a bounded role, owned files or outputs, and definition of done.
- The coordinator must synthesize results and resolve conflicts.

Output:
- Use or do not use subagents, with reason.
- Subagent assignments if useful.
- Integration and verification plan.
```

### Visual Build Prompt

Prompt an agent to build a usable visual surface that passes the vnem perception gate.

Intents: visual build, build ui, make app, landing page, browser game, agent dashboard, bento dashboard

Template:

```text
Build the actual usable visual experience and treat aesthetics as part of done.

Product/User:
<who uses this and why>

Core Surface:
<page, app, dashboard, game, chat UI, or component>

Visual Direction:
- Use local assets, brand cues, and existing design tokens first.
- Match the user's reference style through palette, scale, spacing, texture, motion, and mood.
- Use source-backed browser primitives where helpful: CSS Grid, clamp(), container queries, reduced-motion media queries, and Web Audio only when needed.

Perception Gate:
- Apply `.vnem/quality-contract.md` when present: performance, visuals, playability, accessibility, maintainability, and safety must not be silently traded away.
- The first screen must look intentional, balanced, readable, and responsive.
- Fix ugly scale, spacing, color, typography, glow, blur, or motion before final.
- Reward effects must originate at the relevant user action or game event.
- Sound must be short, pleasant, throttled, and muteable.

Verification:
- Follow `.vnem/visual-qa-protocol.md` when the vnem pack is present.
- Inspect or capture desktop and mobile screenshots.
- Verify one key interaction or reward moment.
- Check reduced-motion and audio/mute behavior when applicable.

Output:
- Implemented surface.
- Local URL or file path.
- Perception verdict: ship-quality, needs-polish, or blocked.
- Screenshot/interaction verification notes.
```

### Visual Polish Review Prompt

Prompt an agent to inspect a rendered UI, name the ugliest visible issue, fix it, and verify again.

Intents: visual polish, review ugly ui, ui critique, design review, polish pass, make it pretty

Template:

```text
Review this visual surface and improve only what is needed to pass the perception gate.

Target:
<URL, app route, file path, screenshot, or component>

Review Order:
1. Inspect the rendered result before editing.
2. Name the ugliest visible issue in plain language.
3. Check composition, hierarchy, scale, spacing, color, typography, motion, sound, reference fidelity, and mobile fit.
4. Patch the smallest visual/design changes that make the surface feel intentional.
5. Re-check screenshots or interaction evidence before final.

Constraints:
- Preserve existing product behavior.
- Use local assets and design tokens first.
- Do not add packages, fetch media, call image/audio services, or use copyrighted assets without approval.
- Treat APCA/WCAG 3 contrast notes as watchlist guidance, not final compliance requirements.

Output:
- Perception verdict.
- Ugliest issue found and how it changed.
- Verification evidence.
- Remaining polish or accessibility risk.
```

### Frontend Build Prompt

Prompt for a complete frontend experience with visual verification and responsive constraints.

Intents: build ui, make app, landing page, prototype

Template:

```text
Build the actual usable frontend experience, not a marketing placeholder.

Product/User:
<who uses this and why>

Core Workflow:
<primary user flow>

Design Constraints:
- Apply `.vnem/quality-contract.md` when present and preserve performance, visuals, accessibility, maintainability, and safety together.
- Match existing design system if present.
- Use domain-appropriate density, typography, color, and motion.
- Ensure all text fits on mobile and desktop.
- Pass a perception gate before final: first-screen composition, hierarchy, scale, spacing, color harmony, motion, and reference-style fidelity must look intentionally polished.
- Anchor visual/reward effects to the relevant user action or game event; avoid disconnected center flashes unless the center is the event.
- Keep sound effects short, pleasant, throttled, and muteable when audio is included.
- Verify with browser screenshots after implementation.

Output:
- Implemented UI.
- Local URL or file path.
- Perception verdict and verification notes.
```

### Eval Design Prompt

Prompt for a small, measurable eval harness before optimizing prompts or agents.

Intents: eval, grader, quality check, test prompt

Template:

```text
Design an evaluation for this prompt or agent workflow.

Behavior to measure:
<desired behavior>

Failure modes:
<known or suspected failures>

Eval Plan:
- Dataset examples, including edge cases.
- Grader criteria with pass/fail thresholds.
- Human review fields for ambiguous outputs.
- Regression workflow after prompt changes.
```

### MCP Selection Prompt

Prompt for choosing MCP servers by provenance, permissions, risk, and workflow fit.

Intents: choose mcp, best mcp, tool connector

Template:

```text
Recommend MCP servers or tools for this workflow.

Workflow:
<what the agent needs to do>

Constraints:
- Prefer official or vendor-maintained sources for sensitive systems.
- Call out permissions: filesystem, browser, database, repository, payments, secrets.
- Do not recommend installation before review.

Output:
- Current stack.
- Best options.
- Risk flags.
- Ask before changing.
```

### Source Intake Prompt

Prompt an agent to decide whether an upstream source belongs in vnem without copying long docs or promoting unreviewed claims.

Intents: source radar, source intake, research layer, benchmark evidence

Template:

```text
Review this source for possible vnem intake.

Source:
<URL, repository, docs page, registry feed, benchmark, or MCP server>

Decision criteria:
- What agent decision does this source improve?
- Is it official, canonical, vendor-maintained, or high-signal?
- What license, permissions, install, data, or mutation risks are visible?
- Is there a lightweight verification path such as link check, smoke test, fixture, or before/after recommendation diff?

Rules:
- Preserve source URLs and write original summaries.
- Do not copy long upstream documentation into vnem.
- Do not promote trust beyond the evidence.

Output:
- Source candidate.
- Why it matters.
- Trust and risk.
- Smallest artifact to update.
- Verification needed.
```

### Zero-Trust Gateway Roadmap Prompt

Prompt for turning an ambitious agent-runtime security idea into phased read-only guidance, advisory checks, and deferred runtime scope.

Intents: pre execution gateway, zero trust gateway, tool pinning, package firewall, ast indexer

Template:

```text
Review this agentic security proposal for vnem.

Proposal:
<gateway, tool pinning, package firewall, command policy, secret redaction, or AST index idea>

Rules:
- Keep the current vnem install pack read-only.
- Separate guidance, advisory analysis, deterministic checks, and runtime enforcement.
- Treat MCP tool annotations as risk hints, not security guarantees.
- Require explicit approval before any tool install, config mutation, daemon, secret use, or external service call.

Output:
- Safe subset to add now.
- Risky or blocked scope.
- Phased implementation.
- Required tests before enforcement.
- Source anchors and unresolved assumptions.
```

### Memory Policy Prompt

Prompt for deciding what belongs in durable project memory versus temporary task context.

Intents: memory, claude memory, agents.md, context engineering

Template:

```text
Design a memory/context policy for this project.

Persistent memory should include:
- Stable project conventions.
- Common commands.
- Architecture notes that rarely change.
- Safety and permission boundaries.

Persistent memory should not include:
- Secrets or credentials.
- Temporary task state.
- Unverified assumptions.
- Sensitive user data unless explicitly approved.

Output:
- What to store.
- Where to store it.
- What to avoid.
- Review cadence.
```

### Agent Workspace Architecture Prompt

Prompt for designing a read-only-first autonomous developer workspace with agent choice, MCP routing, memory, and verification boundaries.

Intents: agent workspace, autonomous developer environment, coding agents, codex config

Template:

```text
Design an autonomous developer workspace for this repository.

Goal:
<what the agent environment should help builders do>

Constraints:
- Keep the first version read-only unless a maintainer approves mutations.
- Separate knowledge/catalog guidance from runtime daemons or gateway implementations.
- Identify secrets, database, browser, repository, filesystem, and deployment risks.

Evaluate:
- Coding agent client and approval model.
- MCP servers and whether a gateway is justified.
- Persistent memory files and update cadence.
- Verification commands and rollback path.

Output:
- Recommended architecture.
- Minimal first setup.
- Deferred capabilities.
- Risks and required approvals.
```

### MCP Gateway Evaluation Prompt

Prompt for deciding whether an MCP gateway is needed and which routing, policy, and observability requirements matter.

Intents: mcp gateway, one mcp, tool routing, mcp servers

Template:

```text
Evaluate MCP gateway options for this agent workspace.

Current tools:
<MCP servers, clients, credentials, and high-risk operations>

Decision criteria:
- Does the agent see too many tools or schemas?
- Are credentials, policies, logs, or rate limits hard to manage directly?
- Which tools need role-scoped or task-scoped exposure?
- Can the team operate a gateway safely?

Output:
- Gateway needed or not needed.
- Options to compare.
- Least-privilege routing plan.
- Risks, unknowns, and next verification steps.
```

### Memory Bank Initialization Prompt

Prompt for creating durable agent memory without storing secrets or stale task state.

Intents: memory bank, agent modes, roo code, cline, claude md

Template:

```text
Initialize persistent agent memory for this project.

Inputs:
- Repository purpose and architecture.
- Stable commands and verification steps.
- Current task state, blockers, and decisions.

Rules:
- Store durable project facts separately from temporary session notes.
- Include a decision log for major choices and rejected approaches.
- Do not store secrets, credentials, private data, or unsourced claims.
- Define when memory should be reviewed or reset.

Output:
- Proposed files.
- Contents for each file.
- Update protocol.
- Risks and maintenance notes.
```

## Source Anchors

- OpenAI Prompt Engineering: https://developers.openai.com/api/docs/guides/prompt-engineering
- OpenAI Prompt Optimizer: https://developers.openai.com/api/docs/guides/prompt-optimizer
- OpenAI Codex AGENTS.md: https://developers.openai.com/codex/guides/agents-md
- OpenAI Prompting Fundamentals: https://openai.com/academy/prompting/

