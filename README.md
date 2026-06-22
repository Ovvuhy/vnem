<p align="center">
  <img src="assets/brand/logo.png" alt="vnem logo" width="86" />
</p>

<h1 align="center">vnem</h1>

<p align="center">
  <strong>General AI-improvement system for safer, better work across tasks, projects, repos, apps, mods, workflows, prompts, tools, research, and ideas.</strong>
</p>

<p align="center">
  <img src="assets/brand/banner.png" alt="vnem banner" width="100%" />
</p>

vnem is a general AI-improvement system. **VNEM Core** is the protected read-only perception layer: it gives agents local guidance so they understand the user's real goal, research what exists, identify weak points, protect against risky actions, build safer improvements, test the real user path, and prove what changed before touching code.

Product mission: VNEM improves how AIs work on any user task, project, repo, app, mod, workflow, prompt, tool, system, research target, or idea.

Repo development context: this repository is the current implementation and testbed where VNEM itself is built, tested, and maintained. Improving VNEM is one use case, not the product's entire purpose.

The current repo is also growing the **VNEM App** and reviewable **Research AI -> Protection AI -> Giving AI** pipeline. Those app surfaces can stage and review local markdown dispatches, but they must stay explicit, auditable, and honest about what is implemented versus planned.

It also ships an LLM-readable knowledge pack and registry for agentic tools: MCP servers, skills, frameworks, evals, safety utilities, memory systems, payment rails, identity tools, and workflow patterns.

It helps a coding agent answer: _what should I use, what is stale, what is risky, what quality domains matter, and what is the current better option?_ before it edits a repo.

See [`docs/product-direction.md`](docs/product-direction.md) for the maintained direction map. ARD Browser Pipeline v2 remains important, but it is one lane, not the whole product.

Live overview: [vnem.pages.dev](https://vnem.pages.dev)

## Agent Operating Rules

AI agents working inside this repo must start with [`AGENTS.md`](AGENTS.md). The
long master mindset lives at
[`docs/agent-rules/VNEM_GLOBAL_RULES.md`](docs/agent-rules/VNEM_GLOBAL_RULES.md),
and Hermes/Codex setup guidance lives at
[`docs/hermes-codex-vnem-setup.md`](docs/hermes-codex-vnem-setup.md).

If you are applying VNEM to another project, install or adapt the VNEM pack/rules
there so the AI applies the same improvement loop to that project's goals,
constraints, risks, and user test path.

Useful agent-rules commands:

```bash
npm run test:agents-rules
npm run agent-rules:dry-run
npm run agent-rules:hermes
```

Codex global guidance can be previewed or explicitly applied with
`scripts/install-vnem-agent-rules.mjs`; it defaults to dry-run and preserves
unrelated `~/.codex/AGENTS.md` content outside the marked VNEM block. Hermes
Desktop/CLI/TUI should be opened with the VNEM repo as cwd, for example
`hermes desktop --cwd C:\VNEM\vnem-src`.

## Quick Start

Use the read-only pack when you only want repo-local AI guidance inside the current project:

```bash
curl -fsSL https://raw.githubusercontent.com/Ovvuhy/vnem/main/public/install.tgz | tar -xz
```

Use the checkout when you want the CLI installer, doctor checks, MCP server, dashboard, or local intelligence app server:

```bash
git clone https://github.com/Ovvuhy/vnem.git
cd vnem
npm install
npm run install:project -- /path/to/my-project
npm run doctor -- /path/to/my-project
node scripts/vnem-cli.mjs mcp-config
```

Run the owner dashboard and local app server when you want live Research AI -> Protection AI -> Giving AI dispatch review:

```bash
npm run dashboard
```

PowerShell users can run:

```powershell
npm.cmd run dashboard
```

`npm run dashboard` is the simple alias for `npm run ard:dev`; `npm run dev:all` and `npm run ard:health` remain available for the broader local launcher and health checks.

The dashboard exposes explicit review controls. A staged Giving AI dispatch can be opened, inspected as markdown, promoted into `.vnem/approved/`, or rejected and deleted from `.vnem/staging/`. Approval does not commit code, execute scripts, install packages, or touch external systems.

For ARD v2 work packages, open the real dashboard at `http://127.0.0.1:4174/dashboard/?v=ard`. The operator console shows source lanes, categories, dangerous findings, all work packages through the candidate explorer, and how many packages are hidden in compact view. `Use in Changes by ARD` selects a package and updates the protected branch card with the selected title, safe action, exact files, tests, and worktree blockers. Fixture/mock dashboard mode is for regression fixtures only, not final acceptance proof.

ARD Browser Pipeline v1 wires the top `Run ARD pipeline` button to the local backend. With `npm run ard:dev` running, the browser calls `POST /api/ard/pipeline/run`, runs the repo/local Research AI v2 -> Protection AI v2 -> Giving AI v2 path, writes `discovery/ard-runs/<run-id>/`, shows dangerous findings, records source lanes/lifecycle/work packages, and records a `fixture-remote` research branch proof. This is a real local/browser capability, not live web research and not antivirus-grade protection.

Dogfood the ARD v2 improvement loop without opening the dashboard:

```bash
npm run ard:dogfood
```

PowerShell:

```powershell
npm.cmd run ard:dogfood
```

This proves source lanes, categories, candidate memory, scoring/ranking, Protection safe actions, Giving work packages, and Changes by ARD preview exact files. It writes runtime `discovery/ard-runs/<run-id>/` artifacts and `discovery/ard-memory/candidate-memory.json`; it does not push `main`, auto-merge, install external candidate packages, or execute discovered repos. Review-artifact-only external candidates are metadata/review markdown only, and waiting-for-evidence candidates are not implementation-ready.

Quick current verification:

```powershell
npm.cmd run test:current
```

ARD v2 research categories include AI skills, MCPs, agent frameworks, evals/benchmarks, safety/security, prompting playbooks, repo automation, documentation systems, browser automation, data/memory/retrieval, coding tools, general devtools, and Roblox/Luau as one capped category. Missing-license external repositories are review-artifact-only or waiting-for-evidence; they are not implementable code.

Quick user test path without opening the dashboard:

```bash
npm run ard:browser-pipeline
```

That smoke command starts a temporary loopback backend, calls the same `POST /api/ard/pipeline/run` route used by the browser button, prints the Research/Protection/Giving summary, and writes local ARD run artifacts under `discovery/ard-runs/<run-id>/`. It never pushes to `main`.

## Local Testing

For the user-facing ARD browser pipeline test path in this implementation repo, see [`docs/local-testing.md`](docs/local-testing.md). Future Building AI runs should also start from [`docs/BUILDING_AI_STATE.md`](docs/BUILDING_AI_STATE.md), [`docs/ARD_PRODUCT_BACKLOG.md`](docs/ARD_PRODUCT_BACKLOG.md), [`docs/ARD_ROADMAP.md`](docs/ARD_ROADMAP.md), and [`docs/ARD_DECISION_LOG.md`](docs/ARD_DECISION_LOG.md):

```bash
cd C:\VNEM\vnem-src
npm.cmd run dashboard
```

Open `http://127.0.0.1:4174/dashboard/?v=ard`, connect/sign with the local allowlisted wallet (`H62Ri1EExddxFKsLMn4nbmbxiCSxNRLtF8igPySLA23B`), click `Run ARD pipeline` or run `npm.cmd run ard:dogfood`, and expect one ARD operator console with a mission header, control center, pipeline timeline, Changes by ARD protected branch card, work package explorer, review queue, AI status/public decision log, visible dangerous findings, system health, planned features marked planned/future, and advanced/raw details collapsed. For current feature checks, run `npm run test:current`.

## The VNEM Standard

VNEM is built around one rule: an AI agent should not satisfy one requirement by silently damaging another.

- **Holistic Excellence:** performance, visuals, playability, accessibility, maintainability, and safety are all part of done.
- **Proactive Enhancement:** the agent should infer the stronger product the user actually wants, not only the smallest literal interpretation of the prompt.
- **Intelligent Trade-offs:** when constraints conflict, the agent must engineer alternatives such as quality profiles, settings toggles, progressive enhancement, reduced-motion paths, asset optimization, or scoped fallbacks before lowering product quality.

If a user asks for extreme performance, VNEM should not let the agent quietly remove visual quality or game feel. The better answer is to optimize the system and expose control: fast defaults, high-quality modes, adaptive effects, and honest verification evidence.

| Prompt pressure | Standard agent failure | With VNEM |
| --- | --- | --- |
| "Make it faster." | Removes animation, sound, texture, or visual polish and calls the job done. | Optimizes the render path, keeps the high-quality path, and adds quality/profile controls when needed. |
| "Build a game." | Ships a technically working but ugly canvas with weak controls and no interaction evidence. | Checks playability, visual fit, reward feedback, responsive sizing, and screenshot or browser evidence. |
| "Make it production-ready." | Runs a build and ignores user-facing quality gaps. | Applies a quality gate across behavior, performance, visuals, accessibility, maintainability, safety, and verification. |

## Multi-Agent Orchestration

VNEM now includes a deterministic orchestration layer for tasks that are too broad for one context window.

| Task shape | VNEM route | Why |
| --- | --- | --- |
| Simple question or narrow lookup | Single Agent | Avoids unnecessary latency, cost, and coordination overhead. |
| Web app, app, UI, API, or game build | Orchestrator-Worker | A Lead Architect splits the task into JSON work items, workers own UI/logic/integration/QA surfaces, and one owner synthesizes the result. |
| Complex research or ecosystem scan | Split-and-Merge | Research strands collect evidence independently, a verifier checks sources, and synthesis happens only after contradictions and uncertainty are recorded. |

For coding and app/game work, the Magentic Coding Workflow assigns a Lead Architect, UI Agent, Logic Agent, Integration Agent, and QA Agent through shared-state task claims and worker reports. For quality-sensitive outputs, VNEM adds a bounded Generator/Evaluator reflection loop with a maximum of three iterations and strict JSON verdicts: `pass`, `revise`, or `blocked`.

This is still read-only guidance. The MCP server returns orchestration plans, prompts, shared-state contracts, and JSON schemas through `vnem_orchestrate`; it does not spawn hidden model workers, edit files, install dependencies, or bypass the connected agent client's permissions.

## Precision Execution Layer

VNEM now has a separate opt-in precision MCP server for teams that explicitly want mutation-capable execution under tighter rules. The default `vnem` MCP server stays read-only. The precision server is for workspace-scoped edits and verification only.

| Problem | Precision tool | Behavior |
| --- | --- | --- |
| Destructive full-file rewrites | `mcp_apply_diff_patch` | Accepts exact `SEARCH`/`REPLACE` blocks or unified diffs, verifies the old context first, dry-runs by default, and rejects mismatches instead of guessing. |
| Knowledge decay and deprecated APIs | `mcp_fetch_documentation` | Fetches current HTTPS docs, normalizes them into a compact context block, and records them as read-before-write evidence for the worker/task. |
| Weak feedback loops | `mcp_execute_terminal_command` | Runs one allowlisted build/test/check command in a workspace-confined stateful cwd, captures stdout/stderr, and times out cleanly. |

## Omniscient Context And Self-Healing

The same opt-in precision server now includes a local context and proof layer for larger projects. This does not turn the default MCP server into a writer or shell proxy; it adds tools only when a project explicitly enables `vnem-precision`.

| Problem | Stage 4 tool | Behavior |
| --- | --- | --- |
| Scale blindness in large repos | `mcp_semantic_code_search` | Builds a local private hashed-vector code index and returns conceptual matches with exact paths, line ranges, snippets, scores, and matched terms. |
| Silent logic failures | `mcp_run_verification_tests` | Tracks a bounded red/green/check verification loop by task id, returns `red_confirmed`, `pass`, `needs_healing`, or `blocked`, and caps healing at five attempts. |
| Unique local roadblocks | `mcp_execute_ephemeral_script` | Runs a short Node/Python helper in a temporary sandbox, blocks dangerous APIs, captures stdout/stderr, and deletes the script and sandbox afterward. |

The practical rule is simple: semantic search before blind traversal, test-first evidence before feature/logic success claims, and ephemeral scripts only for narrow temporary roadblocks.

Run it only for a project that should allow these capabilities:

```bash
node scripts/vnem-cli.mjs mcp-config --precision --workspace /path/to/my-project
npm run precision:mcp
```

Use the read-only server first for recommendations, orchestration, and quality gates. Use the precision server only after the task contract calls for exact patching, current documentation context, semantic code search, red/green verification, ephemeral scripts, or bounded build/test feedback.

## What Vnem Improves

vnem is meant to improve the judgment of coding agents, not replace maintainer review.

- **Holistic quality gates:** agents run a Triple-Check Workflow: Analyze the real goal, Architect performance and visuals/playability together, then Review that no important domain was sacrificed.
- **Multi-agent routing:** agents choose Single Agent, Orchestrator-Worker, or Split-and-Merge workflows before complex coding, app/game, or research tasks collapse into one overloaded context.
- **Precision execution:** agents can use an opt-in scalpel layer for exact patches, current documentation ingestion, and safe terminal feedback instead of broad rewrites or stale API guesses.
- **Omniscient context and proof loops:** agents can use opt-in local semantic code search, test-driven healing loops, and temporary scripts to reduce blind file traversal and silent logic failures.
- **Better recommendations:** agents compare current MCP servers, coding agents, frameworks, evals, memory systems, and workflows before proposing a stack change.
- **Safer adoption:** each entry tracks source links, licenses, permissions, risk flags, trust tier, and install notes.
- **Coding execution playbooks:** agents pick a task-specific loop for feature slices, root-cause bug fixes, test-first work, refactors, rendered web apps, API/data changes, large changes, reviews, and failure recovery.
- **Universal task contracts:** the operating protocol, coding protocol, playbooks, and broad rubrics steer agents through sensing the repo, choosing small capabilities, constraining risk, verifying, and reporting evidence.
- **Shared research layer:** source radar maps official docs, registries, MCP sources, evals, and verification sources so agents know where to research before burning context from scratch.
- **Gateway-ready security guidance:** vnem routes pre-execution gateway, tool pinning, package firewall, and AST-indexer ideas into a phased zero-trust review instead of a risky runtime rewrite.
- **Clearer prompts:** the install pack includes prompt-engineering guidance and reusable prompt patterns for Codex-style implementation, review, debugging, research, eval, and MCP-selection tasks.

## How It Works

1. Install the read-only pack into a project.
2. Ask a coding agent to read `.vnem/AGENTS.md`.
3. The agent follows `.vnem/operating-protocol.md`, `.vnem/quality-contract.md`, `.vnem/orchestration-protocol.md`, `.vnem/coding-protocol.md`, and `.vnem/coding-playbooks.json`, then selects a broad rubric from `.vnem/task-rubrics.json`.
4. The agent uses `.vnem/search-index.json`, `.vnem/best-practices.md`, `.vnem/agent-workspace.md`, and `.vnem/prompt-*` files only when routed there.
5. For opt-in mutation workflows, the agent reads `.vnem/precision-execution-protocol.md` and `.vnem/omniscient-self-healing-protocol.md` before using exact patching, semantic search, verification loops, or ephemeral scripts.
6. For current docs, MCP discovery, or benchmark claims, the agent checks `.vnem/source-radar.json` before broad web search.
7. If the local app server is running, Research AI can ingest a target from the dashboard, Protection AI reviews provenance/risk/license/safety, and Giving AI stages a markdown dispatch in `.vnem/staging/`.
8. The dashboard owner reviews the staged dispatch through the findings matrix. Approve moves the markdown into `.vnem/approved/`; reject deletes the staged markdown and clears the active review item.
9. The app server serializes OpenRouter inference calls. If OpenRouter returns a 429, VNEM pauses for the exact `retry-after` window, keeps the active payload queued, broadcasts a resume countdown, then continues instead of silently dropping to fallback.
10. The dashboard system map translates current telemetry into plain current-vs-planned surfaces, next actions, blocked/review states, connector readiness, and provider backoff status. See [`docs/current-system.md`](docs/current-system.md) for the maintained current system contract.
11. The agent recommends options and asks before changing code, installing packages, using secrets, or touching external systems.

## Install The Pack

From any project root:

```bash
curl -fsSL https://raw.githubusercontent.com/Ovvuhy/vnem/main/public/install.tgz | tar -xz
```

Until `vnem.ai` is live, the generated install command uses the GitHub-hosted archive. To generate artifacts for a different host later, run `VNEM_BASE_URL=https://vnem.ai npm run generate`.

In a clean project folder, this extracts:

- `AGENTS.md`
- `.vnem/AGENTS.md`
- `.vnem/install-guide.md`
- `.vnem/operating-protocol.md`
- `.vnem/quality-contract.md`
- `.vnem/orchestration-protocol.md`
- `.vnem/precision-execution-protocol.md`
- `.vnem/omniscient-self-healing-protocol.md`
- `.vnem/coding-protocol.md`
- `.vnem/coding-playbooks.json`
- `.vnem/design-architecture.md`
- `.vnem/visual-qa-protocol.md`
- `.vnem/task-rubrics.json`
- `.vnem/search-index.json`
- `.vnem/source-radar.json`
- `.vnem/best-practices.md`
- `.vnem/agent-workspace.md`
- `.vnem/prompt-engineering.md`
- `.vnem/prompt-patterns.json`

`AGENTS.md` points coding agents to `.vnem/AGENTS.md`, the full agent entrypoint, plus `.vnem/quality-contract.md`, `.vnem/orchestration-protocol.md`, `.vnem/precision-execution-protocol.md`, `.vnem/omniscient-self-healing-protocol.md`, `.vnem/coding-protocol.md`, and `.vnem/coding-playbooks.json` for implementation work and `.vnem/agent-workspace.md` for autonomous developer environment guidance. Once an agent has read it, the user should not need special `use vnem` prompts: vnem auto-activates for build, code, debug, review, optimization, research, benchmark, and stack/tool decision tasks.

For existing repos with their own `AGENTS.md`, prefer the CLI installer below because it updates a managed vnem block instead of replacing the whole file.

PowerShell users can avoid pipe behavior entirely:

```powershell
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/Ovvuhy/vnem/main/public/install.tgz" -OutFile "vnem-install.tgz"
tar -xzf vnem-install.tgz
Remove-Item vnem-install.tgz
```

## Make A Repo vnem-Aware

For the easiest local workflow, install vnem from this checkout into any clean project folder:

```bash
npm run install:project -- /path/to/my-project
```

This writes the read-only `.vnem/` pack and creates or updates `/path/to/my-project/AGENTS.md` with a tiny managed pointer. After that, coding agents that read `AGENTS.md` should automatically consult vnem before choosing tools, MCP servers, skills, prompt patterns, evals, memory layers, search tools, or upgrade paths.

Check a project:

```bash
npm run doctor -- /path/to/my-project
```

Claude-style projects can also get a `CLAUDE.md` pointer:

```bash
npm run install:project -- /path/to/my-project --claude
```

## Use As An MCP Server

vnem also ships an opt-in, read-only MCP server over stdio. It exposes the generated registry and install-pack guidance as tools, resources, and a prompt; it does not install packages, edit files, call upstream services, or collect secrets.

From this repo:

```bash
npm run mcp
```

Generate an absolute-path MCP client config from your checkout:

```bash
node scripts/vnem-cli.mjs mcp-config
node scripts/vnem-cli.mjs mcp-config --server-json
```

Example full MCP client config:

```json
{
  "mcpServers": {
    "vnem": {
      "command": "node",
      "args": ["/path/to/vnem/scripts/vnem-mcp-server.mjs"],
      "env": {
        "VNEM_ROOT": "/path/to/vnem"
      }
    }
  }
}
```

For Claude Code, the server-object form from `node scripts/vnem-cli.mjs mcp-config --server-json` can be passed to `claude mcp add-json vnem '<json>'`. For generic MCP clients, use the full `mcpServers` object.

Main tools:

- `vnem_bootstrap`: activate VNEM for a specific task. It returns structured `activation`, `repo_or_core_status`, `task_analysis`, `required_rules`, `recommended_vnem_calls`, `capability_slots`, `protection_needs`, `verification_contract`, `completion_audit_expectations`, and `anti_placebo_checks`. It is read-only and does not expose precision/mutation tools.
- `vnem_status`: show loaded data paths, generated timestamps, counts, MCP tools/resources/prompts, and read-only safety posture.
- `vnem_overview`: explain the usable vnem surfaces for newcomers, maintainers, or agents.
- `vnem_route_intent`: resolve a task or phrase into intent routing, read-first guidance, comparison options, rubrics, approval gates, and verification criteria.
- `vnem_get_source`: fetch one source-radar entry by ID or title.
- `vnem_search`: search registry entries, best-practice notes, prompt patterns, source radar, rubrics, and playbooks.
- `vnem_recommend`: run a recommendation pass for an agentic tooling or stack decision and return a compact task contract.
- `vnem_quality_gate`: apply VNEM's Triple-Check Workflow to a task or proposed approach and flag silent performance/visual/playability trade-offs.
- `vnem_orchestrate`: route a prompt into Single Agent, Orchestrator-Worker, or Split-and-Merge and return strict schemas, prompts, shared-state contracts, and reflection-loop guidance.
- `vnem_get_entry`: fetch one registry entry with provenance, install notes, permissions, and risks.
- `vnem_compare`: compare two or more registry entries.
- `vnem_best_practices`: find matching best-practice and prompt-pattern notes.
- `vnem_sources`: find source-radar entries for upstream docs, registries, MCP sources, and benchmark evidence.

Precision MCP tools, available only from `scripts/vnem-precision-mcp-server.mjs` / `npm run precision:mcp`:

- `mcp_apply_diff_patch`: exact `SEARCH`/`REPLACE` or unified-diff patching with strict match verification and dry-run-first behavior.
- `mcp_fetch_documentation`: current HTTPS documentation fetch with compact worker context injection and source hash reporting.
- `mcp_execute_terminal_command`: workspace-confined, allowlisted build/test/check execution with stdout/stderr capture and timeout handling.
- `mcp_semantic_code_search`: local private semantic code search with file paths, line ranges, snippets, scores, and matched terms.
- `mcp_run_verification_tests`: bounded red/green/check verification loop for test-first proof and self-healing.
- `mcp_execute_ephemeral_script`: temporary Node/Python helper execution in a sandbox with cleanup and dangerous API blocking.

Main resources:

- `vnem://install/search-index`
- `vnem://install/source-radar`
- `vnem://api/index`
- `vnem://install/install-guide`
- `vnem://install/operating-protocol`
- `vnem://install/quality-contract`
- `vnem://install/orchestration-protocol`
- `vnem://install/precision-execution-protocol`
- `vnem://install/omniscient-self-healing-protocol`
- `vnem://install/coding-protocol`
- `vnem://install/coding-playbooks`
- `vnem://install/task-rubrics`
- `vnem://install/design-architecture`
- `vnem://install/visual-qa-protocol`
- `vnem://install/best-practices`
- `vnem://install/agent-workspace`
- `vnem://install/prompt-engineering`
- `vnem://install/prompt-patterns`
- `vnem://discovery/daily-digest`
- `vnem://repo/readme`
- `vnem://repo/product`
- `vnem://repo/security-roadmap`
- `vnem://repo/hermes`
- `vnem://repo/contributing`
- `vnem://entries/{slug}`

The quickest way to activate VNEM in a running MCP client is:

1. Call `vnem_bootstrap` with the real user task, optional `agent_client`, optional `project_context`, optional `available_tools`, optional `risk_tolerance`, optional `desired_output`, and `include_resources` / `include_next_calls` booleans.
2. Call the returned `recommended_vnem_calls`, usually `vnem_route_intent`, `vnem_recommend`, `vnem_quality_gate`, `vnem_orchestrate`, `vnem_search`, `vnem_best_practices`, or `vnem_sources` depending on the task.
3. Use the returned `required_rules` / `vnem://...` resources as the task's read-first contract.
4. Run the returned verification contract before claiming success.
5. In the final report, include the `activation_id`, MCP tools used, rules used, changed files, commands/checks run, skipped checks, remaining risks, and evidence.

Example `vnem_bootstrap` arguments:

```json
{
  "task": "Add a weather API integration",
  "agent_client": "codex",
  "project_context": "Existing Next.js app",
  "available_tools": ["terminal", "browser"],
  "risk_tolerance": "low",
  "desired_output": "secret-safe working integration",
  "include_resources": true,
  "include_next_calls": true
}
```

Example output shape, shortened:

```json
{
  "activation": { "status": "active", "tool": "vnem_bootstrap", "read_only": true, "precision_tools_exposed": false },
  "task_analysis": { "primary_task_type": "api_integration", "risk_level": "elevated" },
  "required_rules": [{ "resource_uri": "vnem://install/quality-contract", "priority": "mandatory" }],
  "compact_startup_contract": { "token_budget": "compact", "required_capability_ids": ["module:workflow:api-safety-integration"] },
  "recommended_vnem_calls": [{ "tool": "vnem_compose_capability_contract" }, { "tool": "vnem_protection_review" }, { "tool": "vnem_completion_audit" }, { "tool": "vnem_proof_trail" }],
  "capability_slots": { "mcp_registry_available": true, "skill_recommendations_available": true, "api_registry_available": true },
  "protection_needs": { "secret_api_key_risk": true },
  "verification_contract": { "do_not_claim_done_without_evidence": true },
  "completion_audit_expectations": { "changed_files": "List all changed files..." },
  "anti_placebo_checks": { "evidence_that_proves_not_fake": ["..."] }
}
```

Current limits: `vnem_bootstrap` now reports the Super MCP capability library when `capabilities/super-library.json` is present. It can recommend read-only skill/API library calls, but VNEM is still not a standalone trained AI model. The default MCP server remains read-only; precision tools remain in `scripts/vnem-precision-mcp-server.mjs` only.

## Super MCP capability library

VNEM now includes a first Super MCP library foundation in `capabilities/super-library.json`. It is a VNEM-normalized capability registry, not a raw list and not an execution layer.

The current library contains:

- AI-agent skill/capability-pack records imported from `https://www.skills.sh/` and cross-referenced with `https://github.com/vercel-labs/agent-skills` where available.
- Public API/integration records imported from `https://raw.githubusercontent.com/public-apis/public-apis/master/README.md`.
- Safety and compatibility enrichment fields such as task types, supported-agent status, verified-instruction summary, source-review status, skill-content confidence, agent-compatibility confidence, Core-guidance-vs-Precision-install boundary, install/use notes, activation instructions, required evidence, when-to-use / when-not-to-use guidance, compatible/avoid/recommended-combination fields, trust level, review status, audit status, official-docs/freshness/rate-limit confidence, verification source URLs, frontend/backend API safety, secret-handling pattern, CORS/HTTPS risk, integration-test requirements, and manual-review requirements.

Read-only MCP tools:

- `vnem_library_status`: report skill/API counts, sources, schema version, generated timestamp, limitations, and no-install/no-runtime-call boundaries.
- `vnem_search_skills`: search skill capability records by query, task type, agent client, category, trust level, and risk filter.
- `vnem_recommend_skills`: recommend skills for a user task with why-it-applies, compatibility, avoid-with, review, and risk guidance.
- `vnem_search_apis`: search API records by query/category/auth/HTTPS/CORS/frontend constraints.
- `vnem_recommend_apis`: recommend APIs for a task with auth, HTTPS, CORS, frontend/backend safety decision, secret/API-key warning, integration pattern, provenance, and manual-review warning.
- `vnem_review_skill_or_api`: review one skill/API record by id and return a metadata-reference verdict, risk flags, missing fields, compatibility notes, and next safety checks.
- `vnem_api_safety_profile`: answer whether a selected API can be used safely from frontend/backend contexts, including auth, CORS, HTTPS, secret risk, backend proxy need, docs/freshness confidence, rate-limit unknowns, test requirements, and unsafe patterns to avoid. It does not call the API.
- `vnem_skill_safety_profile`: explain what a skill is for, whether Core MCP can safely apply guidance, whether install/execution is needed, compatibility confidence, prompt-injection/manual-review risk, evidence that proves use, compatible modules, and must-not-claim limits. It does not install or execute the skill.
- `vnem_get_required_capabilities`: select the few required/strongly recommended capability modules for a task and return compact instructions, risks, evidence requirements, and deeper lookup IDs.
- `vnem_activate_capability_pack`: create a task-specific activation contract with required instructions, usage-proof fields, incomplete-if-skipped rules, and safety boundaries.
- `vnem_apply_skill_guidance`: apply one selected skill's compact guidance to the current task without installing the skill or executing scripts.
- `vnem_build_api_integration_plan`: build a safe API plan with auth/HTTPS/CORS, frontend/backend decision, backend proxy/secret rules, tests, and evidence. It does not call the API.
- `vnem_get_agent_profile`: return only the relevant Codex/Claude/Gemini/DeepSeek/Hermes/Qwen/generic/unknown profile so one AI does not receive another AI's irrelevant instructions.
- `vnem_compose_capability_contract`: combine routing, selected capability modules, one agent profile, skill/API plan when relevant, risks, verification, and final-report requirements into one compact contract.
- `vnem_completion_audit`: audit an AI's final answer, plan, or work summary against the original task and VNEM contract. It flags fake completion, missing evidence, skipped modules, weak research, missing visual/UI proof, backend-without-UI exposure, unsafe API claims, game/build context gaps, and modding pipeline gaps.
- `vnem_protection_review`: review a proposed risky plan/action before proceeding. It identifies filesystem, terminal, browser, GitHub, package install, skill/MCP, API-key, frontend/backend, research, UI, and game/modding risks; it produces a specific human-readable permission prompt but performs no action.
- `vnem_proof_trail`: produce a compact final proof trail showing bootstrap id, capability IDs used, contract/protection/audit summaries, evidence counts, missing evidence, assumptions, remaining risks, safe claims, must-not-claim warnings, and final verdict. It is for final reporting only and does not execute anything.

Capability modules:

- A VNEM capability module is an actionable read-only unit with id, kind, task types, supported agents/clients, compact instructions, required evidence, compatibility, avoid-with/conflicts, risks, verification requirements, token-budget guidance, and full-detail lookup URI.
- Core MCP can activate/apply guidance as a contract, but it cannot install, execute, mutate, or call external APIs.
- Non-VNEM user tasks must stay focused on the user's deliverable. VNEM repo self-improvement guidance is selected only when the task explicitly asks to build/fix VNEM.
- Token efficiency uses progressive disclosure: bootstrap summary, selected module IDs, compact required instructions, and deeper IDs/URIs only when needed. Normal outputs do not dump all skills, APIs, or model profiles.
- Research quality contracts require current/source-quality research when facts can change, direct/official sources where possible, explicit assumptions, and no fake certainty.
- UI/frontend/backend contracts treat UI as part of the deliverable: backend work is incomplete when the user cannot see/use it, and UI polish claims need screenshots/browser/visual evidence.
- Game/build/modding contracts require game/version/tool/file-format research, PvE/PvP/DLC/progression assumptions for build advice, backups/isolation for modding, and no patching before the pipeline is understood.
- Missing-context detection recommends clarifying questions only when missing answers would materially change quality or safety; otherwise the AI may proceed with explicit assumptions.

Safety boundary:

- Skills are not installed automatically.
- Skill scripts are not executed.
- APIs are not called automatically.
- API keys are not requested, stored, or exposed.
- Do not expose API keys in frontend code.
- Entries are provenance/enrichment records, not guarantees of safety or freshness.
- Community skills and public API rows require manual source review before use.

Recommended agent flow:

1. Call `vnem_bootstrap`.
2. Call `vnem_compose_capability_contract` for the compact task contract and required capability IDs.
3. Use returned required rules/resources and task-specific checks/evidence requirements.
4. Before risky filesystem/terminal/browser/GitHub/package/API/skill/modding actions, call `vnem_protection_review` and get explicit user approval outside Core MCP.
5. Run task-specific verification and evidence collection: commands/checks, sources, screenshots/visual proof, changed files, assumptions, and skipped items.
6. Before final response, call or apply `vnem_completion_audit`; do not claim done without evidence.
7. Call `vnem_proof_trail` with bootstrap id, capability IDs, protection review(s), completion audit, evidence, assumptions, skipped items, and remaining risks.
8. Include the compact proof trail / evidence summary in the final answer.
9. Use `vnem_get_agent_profile` when needed to fetch only the relevant AI/client profile instead of dumping every model-specific instruction.
10. Do not install skills or call APIs blindly.

Examples:

- Next.js UI task: call `vnem_bootstrap`, then `vnem_compose_capability_contract` with `token_budget=compact`; apply the frontend/UI quality module and report build plus backend-to-UI data flow, visual/responsive/accessibility, loading/error/empty/success-state evidence. `vnem_completion_audit` should revise if no screenshot/browser/visual proof exists.
- Weather/API integration: call `vnem_recommend_apis`, then `vnem_api_safety_profile` for the selected API, then `vnem_build_api_integration_plan`; compare auth/HTTPS/CORS, docs/freshness/rate-limit confidence, use a backend proxy for secret-bearing or CORS-unsafe APIs, never expose frontend keys, and provide success/error/loading/rate-limit tests. `vnem_protection_review` should block/revise frontend API-key exposure.
- Skill/capability use: call `vnem_recommend_skills`, then `vnem_skill_safety_profile`; Core MCP may apply safe guidance summaries, but installation/execution remains Precision/Tools-only after manual SKILL.md/scripts/references review.
- Debugging task: call `vnem_get_required_capabilities`; apply the systematic debugging module, reproduce the failure, identify root cause, fix, and show red/green or equivalent proof.
- Elden Ring build research: ask or state assumptions for PvE/PvP, Shadow of the Erdtree DLC ownership, rune level/progression, armor/poise relevance, weapon/spell/stat preference, solo/co-op, and skill level; use current/source-quality research and avoid generic outdated "best build" claims.
- Game/modding task: research the specific game, file formats, tools, compatibility issues, backups/isolation, and verification plan before any future Precision/Tools mutation.
- Risky Tools/Giga MCP permission preview: `vnem_protection_review` returns a prompt with exact action/scope, danger level, why it is needed, what can go wrong, safeguards, rollback/recovery, what the AI will do after approval, and what it will not do. Core MCP never runs the action.
- Final proof trail: call `vnem_proof_trail` after `vnem_completion_audit` to show VNEM was actually used, which capabilities were used, what evidence exists, what is missing, safe claims, and must-not-claim limits.
- Prompt-improvement task: apply the prompt-improvement module, show the target behavior, before/after prompt, and examples/evaluation proving behavior changed.
- Non-VNEM task: use VNEM only to improve the user's task contract; do not redirect the agent into improving VNEM itself.

You can also install the bundled Codex skill from this checkout:

```bash
npm run vnem -- install-skill
```

## Safety Model

The default pack and default MCP server are intentionally boring and safe:

- no auto-install of discovered third-party tools
- no daemon
- default MCP server is local, read-only, and stdio-only
- no package installs from the default MCP server or install pack
- no remote code execution
- no network calls from the default MCP tools
- no secrets collection
- no edits from the default MCP server

The precision MCP server is separate because it can mutate files, fetch documentation, run bounded verification commands, maintain a local code index, and execute temporary scripts. It must be connected only with an explicit `VNEM_PRECISION_ROOT` workspace and normal client/user approvals.

The pack is guidance and search data. The default server does not run the tools it recommends.

## What This Repo Contains

| Path | Purpose |
| --- | --- |
| `registry/entries/{slug}/entry.yaml` | Canonical machine-readable registry entry. |
| `registry/entries/{slug}/profile.md` | Short human/LLM-readable profile. |
| `schemas/entry.schema.json` | Entry schema used by validation. |
| `capabilities/super-library.json` | VNEM-normalized skill/API capability records used by Core MCP recommendations and contracts. |
| `capabilities/agent-profiles.json` | Compact Codex/Claude/Gemini/DeepSeek/Hermes/Qwen/generic/unknown client profiles used to avoid irrelevant instruction dumps. |
| `schemas/super-library.schema.json` | Schema for the Super MCP skill/API capability library. |
| `schemas/agent-profiles.schema.json` | Schema for compact agent/model profile records. |
| `fixtures/super-library/` | Deterministic sample inputs for skill/API importer tests; avoids relying only on live website layouts. |
| `scripts/` | Validation, generation, curated knowledge upserts, discovery, digest, and install-pack tests. |
| `scripts/lib/super-library.mjs` | Loader/search/recommend/review helpers for skill/API capability records. |
| `scripts/lib/capability-modules.mjs` | Read-only capability-module selection, activation contracts, skill guidance, API plans, and composed task contracts. |
| `scripts/lib/quality-contracts.mjs` | Read-only completion audits, protection reviews, missing-context detection, and research/UI/API/game/modding domain quality contracts. |
| `scripts/lib/agent-profiles.mjs` | Loader and compact profile selection for one relevant AI/client. |
| `public/api/index.json` | Static API generated from registry data. |
| `public/install/*` | Hosted read-only install-pack files. |
| `public/install.tgz` | Tiny archive used by the one-line install command. |
| `.vnem/` | Generated local pack for dogfooding this repo. |
| `.vnem/install-guide.md` | Generated setup guide for archive install, managed repo install, MCP config, and verification. |
| `.vnem/orchestration-protocol.md` | Generated deterministic routing, reflection, multi-agent coding, research split-and-merge, and shared-state protocol. |
| `.vnem/precision-execution-protocol.md` | Generated opt-in protocol for exact patching, current documentation ingestion, and safe stateful terminal feedback. |
| `.vnem/omniscient-self-healing-protocol.md` | Generated opt-in protocol for local semantic code search, red/green verification loops, and ephemeral scripting. |
| `scripts/lib/precision-execution-layer.mjs` | Backend library for exact patching, documentation ingestion, and stateful terminal execution. |
| `scripts/lib/omniscient-self-healing-layer.mjs` | Backend library for local semantic indexing, verification-loop tracking, and temporary script execution. |
| `scripts/vnem-precision-mcp-server.mjs` | Separate opt-in mutation-capable precision MCP server. |
| `landing/` | Static public landing page and blog bundle for the website. |
| `dashboard/` | Vite/React source for the Hermes owner dashboard surface. |
| `PRODUCT.md` | Product direction, public-site clarity goals, and non-regression bar. |
| `SECURITY-ROADMAP.md` | Advisory-first roadmap for zero-trust gateway and runtime-security ideas. |
| `llms.txt` | Compact LLM entrypoint. |
| `llms-full.txt` | Full generated registry context for LLMs. |
| `HERMES.md` | Operating contract for recurring agentic discovery and daily ecosystem checks. |

This repo is the open registry, generation system, install pack, MCP server, and static public site source.

For product direction, public-site clarity, and future commercial boundaries, see [`PRODUCT.md`](PRODUCT.md).

## For LLMs

If you are working inside this repository, start with [`AGENTS.md`](AGENTS.md).

If you are using vnem inside another project, read `.vnem/AGENTS.md` after installing the pack. It tells agents to automatically search `.vnem/search-index.json`, check `intent_routes`, compare relevant best-practice notes, and report vnem knowledge gaps before choosing a stack or recommendation.

To improve a prompt, say `use vnem to enhance this prompt` and include your rough prompt. The installed pack will route the agent to `.vnem/prompt-engineering.md` and `.vnem/prompt-patterns.json`.

If the agent has read `.vnem/AGENTS.md`, this can also happen automatically: requests to write, rewrite, optimize, critique, or template a prompt should use the prompt-enhancement protocol even when the user does not say `use vnem`.

To compare AI tools or research sources, ask for a vnem-backed review such as `codex vs claude`, `ai model selection`, `source radar`, `source intake`, or `zero trust gateway`. The installed pack routes those intents to the operating protocol, broad rubrics, source radar, best-practice notes, and relevant registry entries.

## Trust Tiers

| Tier | Meaning |
| --- | --- |
| `verified` | Install/docs manually reviewed. |
| `promising` | Official or high-signal source, not fully tested. |
| `unreviewed` | Discovered but not validated. |
| `watchlist` | Useful-looking, but quality/license/security is uncertain. |
| `deprecated` | Stale, broken, or superseded. |

## Local Development

```bash
npm install
npm run curate
npm run validate
npm run generate
npm test
```

Useful commands:

```bash
npm run check:links
npm run curate
npm run discover:dry-run
npm run digest
```

## Add Or Update An Entry

1. Add or edit `registry/entries/{slug}/entry.yaml`.
2. Add or edit `registry/entries/{slug}/profile.md`.
3. Keep summaries original. Do not paste long upstream README/docs excerpts.
4. Preserve upstream source URLs, copyright owner, and SPDX license data when known.
5. Run `npm test`.
6. Open a PR with source links and a conservative trust-tier suggestion.

Discovery automation and Hermes may propose candidates, but maintainers approve what reaches `main`.

## Token / Community

CA: `M2DvKKrQiKu8Ux9pz3cKgdudmLqUUQLVbB9Vy9zEASY`

EasyA Kickstart: https://kickstart.easya.io/token/M2DvKKrQiKu8Ux9pz3cKgdudmLqUUQLVbB9Vy9zEASY

## License

Code and scripts are MIT licensed. Original registry metadata and profiles are CC0-1.0. Third-party names, trademarks, copyrights, packages, and licenses remain with their respective owners and are preserved through each entry's provenance fields.
