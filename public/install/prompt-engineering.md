# vnem Prompt Engineering

Generated: 2026-05-27T16:15:49.891Z

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
1. Inspect the current implementation before editing.
2. Make the smallest cohesive change that satisfies the objective.
3. Add or update tests only where risk justifies it.
4. Run verification: <commands>.
5. Report changed files, verification results, and residual risk.

Constraints:
- Do not run destructive commands.
- Ask before installing packages, changing secrets, deploying, or touching production data.
- Preserve user changes already present in the worktree.
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
1. Inspect the current implementation, tests, public interfaces, and call sites.
2. Identify removable code with evidence: unused files, unused exports, duplicate branches, dead paths, repeated helpers, or needless state.
3. Preserve behavior with focused tests, snapshots, fixtures, type checks, or golden examples before risky edits.
4. Make small reviewable changes: delete proven waste, collapse duplication, simplify control flow, and reuse existing local helpers.
5. Run focused verification first, then the broader project checks.

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
- Match existing design system if present.
- Use domain-appropriate density, typography, color, and motion.
- Ensure all text fits on mobile and desktop.
- Verify with browser screenshots after implementation.

Output:
- Implemented UI.
- Local URL or file path.
- Verification notes.
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

