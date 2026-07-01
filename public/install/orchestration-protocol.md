# vnem Orchestration Protocol

Generated: 2026-07-01T13:44:56.111Z

A deterministic, model-agnostic routing and multi-agent coordination protocol for choosing Single Agent, Orchestrator-Worker, Split-and-Merge, and Generator/Evaluator reflection patterns before complex work consumes context.

## Safety Boundary

- This file is read-only guidance.
- Do not treat it as an API key template, model runtime, worker daemon, shell proxy, package installer, or file editor.
- The MCP server returns deterministic plans, schemas, prompts, and task contracts. It does not secretly spawn LLM workers or mutate a repository.
- Actual model calls, file writes, browser actions, package installs, network research, and deployments must stay under the connected agent client's normal tool permissions and user approvals.

## Routing & Orchestration Engine

VNEM chooses the smallest orchestration pattern that can realistically satisfy the task:

### single_agent

Use when: The request is a simple question, narrow lookup, or low-risk single-file task where coordination overhead would exceed the value.

Output: One scoped agent answers or acts with focused verification.

### orchestrator_worker

Use when: The request asks to code, build, improve, debug, or verify an app, web app, game, dashboard, UI, API, or multi-file feature.

Output: Lead Architect creates a strict JSON task graph, workers claim scoped tasks, Integration merges, and QA verifies.

### split_and_merge

Use when: The request is complex research, broad comparison, current-source investigation, benchmark collection, or ecosystem scanning.

Output: Research lead splits independent strands, workers gather evidence, source verifier checks claims, and synthesis merges findings.

Routing rule: simple work stays simple. Use multi-agent orchestration only when independent subtasks, context pressure, source verification, or multi-surface coding quality justify the coordination cost.

## Reflection Loop

Use the Planner-Generator-Evaluator pattern when the task has clear quality metrics and iterative critique is likely to improve the result.

- Planner: route the task, define success criteria, choose the workflow, and initialize shared state.
- Generator Agent: Produce JSON matching the generator_output schema with answer_or_patch_plan, changed_files, assumptions, verification_plan, and residual_risks.
- Evaluator Agent: Produce JSON matching the evaluator_output schema with pass, revise, or blocked verdict, score, failures, required_changes, and verification_requirements.
- Maximum iterations: 3.
- Stop on `pass`, stop on `blocked`, or stop after the maximum iterations and return `needs_revision` with remaining failures.

Generator system prompt:

```text
You are the VNEM Generator Agent. Return only JSON matching the generator_output schema. Use the task contract, shared state, and evaluator feedback. Preserve performance, visuals, playability, accessibility, maintainability, and safety when relevant. Include an executable verification plan and residual risks.
```

Evaluator system prompt:

```text
You are the VNEM Evaluator Agent. Return only JSON matching the evaluator_output schema. Pass only when the result is task-aligned, schema-valid, grounded in repo/source evidence, preserves all relevant quality domains, and includes honest verification. If not passing, return concrete required_changes.
```

## Magentic Coding Workflow

Use this workflow for web apps, web games, apps, dashboards, UI surfaces, full-stack features, and multi-file coding work.

1. Lead Architect inspects the repo and returns a strict JSON task list with ids, owner roles, dependencies, acceptance criteria, and allowed MCP tool contracts.
2. Workers claim one unclaimed task in shared state before touching files.
3. UI Agent owns visible surfaces, responsive layout, accessibility basics, and visual polish.
4. Logic Agent owns app/game behavior, state transitions, inputs, rules, and deterministic logic.
5. Integration Agent merges surfaces, resolves conflicts, and preserves performance plus visuals/playability together.
6. QA Agent runs focused checks, browser or screenshot inspection when applicable, interaction checks, and the VNEM quality gate.
7. Lead Architect synthesizes final status only after worker reports and QA evidence are present.

Lead Architect system prompt:

```text
You are the VNEM Lead Architect Agent. Return only JSON matching the architect_task_list schema. Break the project into atomic tasks with unique ids, owner roles, dependencies, acceptance criteria, and allowed MCP tool contracts. For web apps and games, separate UI, logic, integration, QA, performance, accessibility, and visual verification work. Never assign overlapping writable file surfaces without explicit sequencing.
```

Worker system prompt:

```text
You are a VNEM Worker Agent. Claim exactly one task from shared state before doing work. Use MCP file tools only within the task's allowed contract and report every artifact touched. Return only JSON matching the worker_report schema. If blocked by missing context, dependency conflict, unsafe permission, or unclear file ownership, report blocked instead of improvising.
```

## Shared State

All agent-to-agent coordination should be represented through MCP-readable context, not private side conversations. Required state fields:

- `run_id`
- `task`
- `tasks`
- `claims`
- `reports`
- `artifacts`
- `facts`
- `decisions`
- `events`
- `next_ordinal`

State rules:

- Every task claim and report receives a monotonically increasing ordinal.
- Workers report artifacts, evidence, blockers, and changed file surfaces before dependent tasks begin.
- Facts and decisions must include provenance or the agent that recorded them.
- Never store secrets, passwords, private keys, raw tokens, or private user data in shared state.
- One owner must synthesize the final answer or integrated diff; worker outputs are inputs, not competing final reports.

## Required JSON Contracts

- `route_decision`: pattern, confidence, reasons, signals, reflection requirement, max iterations, and worker count.
- `architect_task_list`: project type plus task ids, roles, dependencies, acceptance criteria, and MCP tool contracts.
- `worker_claim`: task id, agent id, role, and claim reason.
- `worker_report`: task id, status, summary, artifacts, evidence, and blockers.
- `generator_output`: iteration, answer or patch plan, changed files, assumptions, verification plan, and residual risks.
- `evaluator_output`: iteration, verdict, score, failures, required changes, and verification requirements.
- `shared_state_event`: ordinal, type, agent id, task id, and payload.

## Web App And Game Quality Bar

- Route app/game work through the Magentic Coding Workflow unless it is clearly a tiny single-surface change.
- Preserve performance, visual quality, playability, accessibility, maintainability, and safety together.
- If performance conflicts with visuals/playability, require quality profiles, settings toggles, adaptive effects, asset optimization, reduced-motion handling, or scoped fallbacks before reducing quality.
- A passing build is not enough for visual or interactive work. Require rendered desktop/mobile evidence, interaction checks, and a perception gate when practical.

## Source URLs

- https://www.anthropic.com/engineering/building-effective-agents
- https://www.anthropic.com/engineering/multi-agent-research-system
- https://www.anthropic.com/engineering/writing-tools-for-agents
- https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
- https://openai.github.io/openai-agents-python/multi_agent/
- https://openai.github.io/openai-agents-python/guardrails/
- https://modelcontextprotocol.io/specification/2025-11-25/schema
- https://modelcontextprotocol.io/specification/2025-06-18/server/tools
- https://modelcontextprotocol.io/specification/2025-06-18/server/resources
