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

## Current Architecture

VNEM has two primary MCP servers. **Core** is the read-only decision layer for routing, compatibility, evidence contracts, quality, and usage auditing. **Tools** is the permission-aware execution layer for bounded repo inspection, code/test/browser/GitHub/data/deployment work, rollback, and proof. The seven-tool **Precision** server is a compatibility shim over shared runtime behavior for existing clients; it is not a third primary implementation.

Use the managed setup and safety paths instead of hand-writing a partial server config:

```powershell
node scripts/vnem-cli.mjs setup
node scripts/vnem-cli.mjs safety --status --json
npm.cmd run core:readiness
npm.cmd run tools:readiness
```

Setup can merge verified client contracts or emit import-only profiles. A generated profile proves its payload and MCP protocol behavior, not that a client is installed, reloaded, or autonomously using VNEM. See [`docs/VNEM_SETUP.md`](docs/VNEM_SETUP.md) for the exact support matrix.

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
node scripts/vnem-cli.mjs setup
```

`vnem setup` detects supported clients, lets you select Core/Tools and a safety profile, previews every config change, backs up each changed file, validates the result, exercises both MCP entrypoints, and provides exact rollback. It preserves unrelated client settings and emits import-only profiles when a global client contract is not verified. See [`docs/VNEM_SETUP.md`](docs/VNEM_SETUP.md).

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

## Tools MCP Foundation

VNEM now also has a separate `vnem-tools` MCP foundation. Core MCP decides what should happen, chooses usable skills/APIs, selects Tools capabilities, creates proof requirements, and prepares a Tools handoff. Tools MCP gives the connected AI safe hands for approved, evidence-logged actions. Tools MCP is becoming a large VNEM-improved tool ecosystem, so every tool carries safety metadata, evidence behavior, and Core handoff compatibility instead of merely copying ordinary MCP tools.

`vnem_entrypoint` is the compact default Core decision layer for material tasks. It scores task domains using the goal, explicit mode, project context, repository signals, environment facts, and user constraints; mixed tasks keep multiple domains instead of collapsing to a generic route. The response selects at most six exact Tools calls, states whether each is available/configured/allowed/executed/succeeded/proven, exposes task-scoped compatibility and permission implications, and returns a deterministic decision id. Use `vnem_decision_details` for deeper scored context, `vnem_compatibility_assess` for reusable scoped compatibility evidence, and `vnem_continue_from_tools_evidence` to decide whether proof is complete, a targeted rerun is needed, a claim exceeds evidence, or a real blocker requires user input. Core remains read-only and does not impose one fixed research-plan-execute workflow.

Tools MCP is safeguard-first, not Giga MCP:

| Action class | Tools MCP foundation behavior |
| --- | --- |
| Status/catalog/planning | Reports active permission profile, allowed roots, workspace/evidence-root status, broad-root warnings, blocked paths/categories, command/network/secret policies, Core handoff support, and `vnem_tools_manifest` capability metadata for all Tools MCP tools. |
| Permission profiles/trust boundaries | First-class profiles (`safe-readonly` default, `safe-local-dev`, `approved-writes`, `approved-installs`, `approved-github`, `creator-power`, `dangerous-disabled`) gate Tools actions. `vnem_tools_permission_profiles`, `vnem_tools_permission_status`, `vnem_tools_action_policy_preview`, `vnem_tools_trust_boundary_classify`, `vnem_tools_reliability_catalog`, `vnem_tools_action_recovery_plan`, `vnem_tools_high_power_action_review`, and `vnem_tools_capability_gap_report` explain what is allowed, approval-gated, blocked, preview-only, simulated, dry-run/local-tested, or still unsupported before execution. |
| Permission prompts | Produces normal-user approval text with exact action, risk, scope, dry-run option, rollback/restore plan, and evidence collected. |
| File reads/lists/search | Confined to allowed roots; blocks `.env`, `.env.local`, `*.pem`, `*.key`, `id_rsa`, tokens, credentials, cookies, sessions, browser profiles, and password-manager-like paths; skips `.git`, `node_modules`, and build outputs; redacts obvious secrets. |
| Project intelligence | `vnem_tools_workspace_map`, `vnem_tools_read_many_files`, `vnem_tools_code_search`, `vnem_tools_find_references`, and `vnem_tools_dependency_scan` help AIs inspect projects without reading secrets, generated outputs, caches, binary files, or unbounded context. |
| Patches | Dry-run by default; real apply requires `dry_run=false`, `approved=true`, and a non-empty approval note; supports single-file patches plus multi-file replace/create/append/explicit-delete batches with backups, restore plans, and no partial apply by default. |
| Restore | Restores a previous Tools MCP backup or batch restore plan only inside allowed roots; dry-run default, approval required, secret-like targets blocked, evidence logged. |
| Commands/tasks | Dry-run by default; real execution requires approval; only safe allowlisted commands and package.json project tasks are allowed; package install/publish/deploy/push/destructive shell chains stay blocked. |
| Dev servers | Starts approved local `dev`/`start`/`preview` scripts only on localhost ports 3000-9999; tracks Tools-started servers in-memory and stops only those servers. |
| Local git | Read-only local status/diff plus approved local commit of explicit safe files only; destructive git remains blocked. |
| GitHub autonomy | `github_autonomy` adds power-first repo work: `vnem_tools_github_status`, settings/profile status, repo inspect/intelligence, branch creation, selected-file commit + feature-branch push, PR/issue/comment/label tools, Actions status/rerun, CI failure triage, PR quality gate, task truth check, and optional draft release/settings plan/apply. Default GitHub profile is `maintainer`: feature branches, PRs, issues, labels, CI rerun, and draft releases are usable when config/auth allows. Hard blocks remain for token leaks, committing `.env`/secrets, blind force-push, protected direct push by default, repo delete by default, unknown installer/malware execution, and settings mutation unless explicitly enabled. |
| API requests | Dry-run by default; real requests require approval; first batch allows only GET/HEAD, blocks raw secrets in headers/body, validates URLs against usable API pack context or explicit localhost test mode, and caps timeout/output. |
| Cloudflare control | Cloudflare execution belongs to Tools MCP, not Core MCP. `cloudflare_control` exposes `vnem_tools_cloudflare_status`, auth planning, account/project discovery, Pages/Workers deploy plans and approval-gated deploys, DNS plans/apply, env/secret plans/apply, deploy verification, rollback plans/apply, and cache purge plans/apply. Wrangler is preferred for local Pages/Workers deploy flows; Cloudflare API is used for discovery, DNS, metadata, verification, and gaps. Tokens are never printed or stored in repo; cookies/sessions/browser profile scraping/CAPTCHA bypass are forbidden. Mutations require exact approval phrases and every mutation writes a redacted evidence pack under `.vnem/tool-runs/cloudflare/` or `VNEM_TOOLS_EVIDENCE_ROOT`. |
| High-power Tools quality | `vnem_tools_reliability_catalog`, `vnem_tools_action_recovery_plan`, `vnem_tools_high_power_action_review`, `vnem_tools_capability_gap_report`, `vnem_tools_evidence_pack_audit`, `vnem_tools_mutation_approval_contract`, and `vnem_tools_secret_redaction_check` standardize honest reliability labels (`declared_only`, `simulated_tested`, `dry_run_tested`, `local_tested`, `live_tested_disposable`, `production_safe_with_approval`), failure recovery, mutation review, evidence completeness, approval gates, exact destructive approval, and redaction checks for Cloudflare and all high-power Tools workflows. |
| Source/search/browser intelligence | `vnem_tools_search_provider_manifest`, `vnem_tools_search_query_builder`, `vnem_tools_web_search`, `vnem_tools_search_result_ranker`, `vnem_tools_fetch_url_text`, `vnem_tools_source_quality_check`, `vnem_tools_research_brief`, `vnem_tools_browser_research_pack`, `vnem_tools_claim_source_matrix`, `vnem_tools_research_gap_detector`, `vnem_tools_source_map`, `vnem_tools_source_extract`, and `vnem_tools_source_graph` build strong queries, run configured/approved provider search or honestly return unavailable, rank results, map bounded local/source structures, extract explicit selected targets with redaction, compare evidence for officialness/freshness/contradictions, map claims to evidence, and detect research gaps without pretending unsupported search or broad crawling happened. |
| Browser page understanding | `vnem_tools_browser_page_inspect`, `vnem_tools_browser_readability_extract`, `vnem_tools_browser_link_map`, `vnem_tools_browser_dom_search`, `vnem_tools_browser_accessibility_audit`, and `vnem_tools_browser_compare_snapshots` provide safe static page/source understanding for direct URLs, localhost, allowed local HTML files, provided HTML/text, and evidence-backed source snippets. They do not execute JavaScript, follow links, crawl, certify accessibility, or claim visual proof. |
| Browsing risk/CAPTCHA/download safety | `vnem_tools_redirect_chain_check`, `vnem_tools_url_reputation_check`, `vnem_tools_captcha_detector`, and `vnem_tools_download_safety_check` flag suspicious redirects, phishing/scam/download bait, credential traps, CAPTCHA/access-block pages, and risky download links. CAPTCHA handling is user-assisted only; no automatic bypass or download/install execution is implemented. |
| Browser proof | Captures approved local screenshot evidence from `file://` files under allowed roots or localhost/127.0.0.1 pages; dry-run default. `vnem_tools_browser_evidence_run` can execute a bounded approved localhost/127.0.0.1 evidence plan only when `VNEM_TOOLS_ALLOW_LOCALHOST=1` and the active permission profile allows `browser_capture`; blocked/partial runs return `browser_was_run=false` or `safe_to_claim=false` and are not proof. External URLs, data/javascript/credentialed URLs, secret-like files, login/cookie/session/CAPTCHA/credential automation, hidden broad browsing, and broad scraping are blocked. |
| UI/web quality proof | Core `vnem_build_ui_quality_plan` and `vnem_visual_proof_contract` produce plan-only visual-proof requirements for routes/components, before/after screenshots, console/network checks, accessibility checks, multiple responsive viewports, and empty/loading/error states. Tools `vnem_tools_ui_surface_review`, `vnem_tools_browser_evidence_plan`, `vnem_tools_browser_evidence_run`, and `vnem_tools_ui_evidence_audit` safely review local UI surfaces, plan browser evidence, execute bounded approved localhost proof packs, and reject UI-improved/responsive/accessibility/browser-works claims when screenshot/DOM/route/render/console/network/a11y/viewport/state evidence is missing or explicitly unavailable. |
| Session evidence | Groups scan/patch/task/dev-server/browser/API/restore/git actions into one redacted JSON proof pack with safe-to-claim, must-not-claim, remaining-risk, and final-report lines. |
| Evidence | Writes structured redacted JSON evidence under `.vnem/tool-runs/` (or configured evidence root) plus a `proof_trail_compatible_summary` so final reports can say only what was actually proven. |

Run it only for a workspace that should allow these bounded capabilities:

```bash
node scripts/vnem-cli.mjs mcp-config --core --tools --workspace /path/to/project
npm run tools:mcp
npm run test:tools-mcp
npm run test:tools-browser
npm run test:tools-project-actions
npm run test:tools-git-session
npm run test:tools-intelligence
npm run test:tools-research
npm run test:tools-browser-intelligence
npm run test:tools-browser-research-pack
npm run test:tools-search-power
npm run test:tools-risk-captcha
npm run test:tools-permission-profiles
npm run test:tools-trust-boundary
npm run test:tools-secret-blocking
npm run test:tools-ui-surface-review
npm run test:tools-browser-evidence-plan
npm run test:tools-browser-evidence-run
npm run test:tools-ui-evidence-audit
npm run test:browser-evidence-completion-audit
npm run test:core-ui-quality-plan
npm run test:core-visual-proof-contract
npm run test:ui-completion-audit
npm run test:core-permission-planning
npm run test:core-research-strategy
npm run test:core-source-ingestion-planning
npm run test:tools-source-ingestion
npm run test:tools-source-graph
npm run test:research-evidence-audit
npm run test:core-tool-selection
npm run test:core-tools-ecosystem
npm run test:core-browser-research-planning
npm run test:core-search-planning
npm run test:core-routing-memory-output
npm run test:core-output-quality
npm run test:core-anti-stagnation
npm run test:mcp-user-smoke
npm run test:core-tools-e2e
npm run tools:readiness
npm run core:readiness
```

GitHub power is user-modifiable in the Tools MCP env config. Default example:

```toml
[mcp_servers."vnem-tools".env]
# ============================================================
# GITHUB SETTINGS
# ============================================================
VNEM_TOOLS_AUTONOMY_MODE = "fast"
VNEM_TOOLS_GITHUB_PROFILE = "maintainer"
VNEM_TOOLS_GITHUB_ALLOWED_REPOS = "Ovvuhy/vnem;Ovvuhy/ME3-By-my-AI-and-Me"
VNEM_TOOLS_GITHUB_PROTECTED_BRANCHES = "main;master;production"
VNEM_TOOLS_GITHUB_ALLOW_DIRECT_PUSH = "0"
VNEM_TOOLS_GITHUB_ALLOW_FORCE_PUSH = "0"
VNEM_TOOLS_GITHUB_ALLOW_REPO_DELETE = "0"
VNEM_TOOLS_GITHUB_ALLOW_SETTINGS_MUTATION = "0"
VNEM_TOOLS_GITHUB_ALLOW_RELEASES = "1"
VNEM_TOOLS_GITHUB_ALLOW_ACTIONS_RERUN = "1"
VNEM_TOOLS_MALWARE_DOWNLOAD_BLOCK = "1"
```

Profiles: `off`, `read`, `work`, `maintainer`, `admin`, `owner`, `custom`. Change the env values above to adjust GitHub power; tokens are detected by presence only and never printed.

Actual Core → Tools use path:

1. Start/connect Core MCP.
2. Start/connect Tools MCP for a specific workspace. By default it uses `VNEM_TOOLS_PERMISSION_PROFILE=safe-readonly`; set a stronger explicit profile such as `safe-local-dev`, `approved-writes`, or `creator-power` only for scoped local testing that needs it.
3. Ask Core `vnem_plan_effort_budget`, `vnem_fast_answer_contract`, `vnem_route_task`, `vnem_output_quality_plan`, `vnem_anti_stagnation_check`, `vnem_design_ambition_plan`, `vnem_visual_taste_audit`, `vnem_redesign_comparison_scorecard`, `vnem_total_impact_design_plan`, `vnem_design_direction_selector`, `vnem_compact_output_contract`, `vnem_select_tools_for_task`, `vnem_build_tools_plan`, `vnem_assess_research_need`, `vnem_build_search_plan`, `vnem_build_browsing_plan`, `vnem_build_browser_research_plan`, `vnem_build_research_strategy`, `vnem_build_source_ingestion_plan`, `vnem_research_evidence_audit`, `vnem_explain_tools_chain`, or `vnem_boost_task` to classify the task, choose Tools capabilities, classify relevant/ignored memory, decide whether missing context materially requires asking the user, define dry-runs/approvals/evidence, detect freshness/search needs, handle CAPTCHA/download/redirect risk in plan form, prevent repeated finished work, and produce a compact-first output/final-report contract.
4. Pass Core's `tools_mcp_handoff` to `vnem_tools_prepare_action_plan`; call `vnem_tools_permission_status`, `vnem_tools_reliability_catalog`, `vnem_tools_high_power_action_review`, and `vnem_tools_action_policy_preview` before real mutation/network/browser/git actions, and use `vnem_tools_action_recovery_plan` when a tool fails or is blocked.
5. Tools creates an action plan and marks unsupported work as blocked.
6. Tools dry-runs the catalog/project/source scan/patch batch/restore/task/dev-server/API/browser/local-git action first.
7. User approves the exact action with scope, active/required permission profile, trust-boundary level, rollback/restore plan, and evidence expectations.
8. Tools performs only the permission-allowed approved allowed-root/localhost/direct-source/provider-search action, can map workspaces, read bounded safe file sets, search code, inspect dependencies without installing, build search queries, run configured/approved provider search or return honest unavailable status, rank results, evaluate provided/direct sources, inspect page structure, extract readable content, map links without following them, search DOM-like content, detect CAPTCHA/access blocks, check URL/redirect/download risk, build claim/source matrices, detect research gaps, build source maps, extract explicit bounded targets, compare source graphs for official/community conflicts, freshness, and contradictions, review UI routes/components/render paths/state coverage, plan browser evidence without hidden automation, audit provided UI evidence objects, run static accessibility checks, compare snapshots, capture local browser proof when useful, restore/rollback batches, and optionally make an approved local git commit of explicit safe files.
9. Tools collects redacted action/session evidence with `vnem_tools_collect_evidence` or `vnem_tools_finish_session`.
10. Final response maps `proof_trail_compatible_summary` into Core `vnem_completion_audit` / `vnem_research_evidence_audit` / `vnem_proof_trail` inputs and says whether browser visual proof was actually captured; do not claim UI improvement, responsive behavior, accessibility improvement, browser-working status, or live API proof without screenshot/DOM/route-render/console/network/a11y/viewport/state evidence as applicable.

Not in this foundation batch: no Giga MCP, unrestricted filesystem, arbitrary shell, repo deletion/force-push/protected direct push/settings mutation by default, package installs, package publishing, unrestricted deployments outside the Cloudflare approval-gated Tools workflows, unrestricted external browser browsing by default, search-engine result page scraping by default, automatic CAPTCHA bypass, unrestricted crawling, login/cookie/session automation, credential capture, automatic downloads/installers, or unrestricted API calls. Real provider search works only when a provider is configured and the user approves it; unavailable providers return structured unavailable results, not fake search results. Future work can add more only after this safety base stays stable.

## How to test Core + Tools MCP locally

Use the deterministic smoke path first; it requires no external internet:

```bash
npm run test:mcp-user-smoke
npm run tools:readiness
npm run core:readiness
```

GitHub power is user-modifiable in the Tools MCP env config. Default example:

```toml
[mcp_servers."vnem-tools".env]
# ============================================================
# GITHUB SETTINGS
# ============================================================
VNEM_TOOLS_AUTONOMY_MODE = "fast"
VNEM_TOOLS_GITHUB_PROFILE = "maintainer"
VNEM_TOOLS_GITHUB_ALLOWED_REPOS = "Ovvuhy/vnem;Ovvuhy/ME3-By-my-AI-and-Me"
VNEM_TOOLS_GITHUB_PROTECTED_BRANCHES = "main;master;production"
VNEM_TOOLS_GITHUB_ALLOW_DIRECT_PUSH = "0"
VNEM_TOOLS_GITHUB_ALLOW_FORCE_PUSH = "0"
VNEM_TOOLS_GITHUB_ALLOW_REPO_DELETE = "0"
VNEM_TOOLS_GITHUB_ALLOW_SETTINGS_MUTATION = "0"
VNEM_TOOLS_GITHUB_ALLOW_RELEASES = "1"
VNEM_TOOLS_GITHUB_ALLOW_ACTIONS_RERUN = "1"
VNEM_TOOLS_MALWARE_DOWNLOAD_BLOCK = "1"
```

Profiles: `off`, `read`, `work`, `maintainer`, `admin`, `owner`, `custom`. Change the env values above to adjust GitHub power; tokens are detected by presence only and never printed.

The smoke test proves Core can build search/browsing/debugging/code-quality plans, Tools exposes the search/browser/source/debugging/architecture safety tools, query building and result ranking work with fixtures, CAPTCHA/access-block and suspicious download/redirect signals are detected, claim/source matrices are built, source-map/extract/graph plus architecture-review/debug-evidence tools are present, and research/debugging gaps are reported without live web access or arbitrary command execution.

Public Tools MCP can build strong search queries, run provider-backed search when configured and approved, rank search results, inspect sources/pages, map local repos/docs folders inside allowed roots, extract explicit bounded targets, build source graphs, detect outdated/conflicting source evidence, check URL/reputation/download risk, build claim/source matrices, detect research gaps, review architecture entry points/registries/tests/configs for unwired parallel systems and possible dead code, and collect bounded log-first debugging evidence from safe logs/git status/package metadata.

Public Tools MCP does not automatically bypass CAPTCHA, scrape search engine result pages by default, perform login/session/cookie automation, run arbitrary downloads/installers, crawl broadly, read secret/session/browser-profile paths, run arbitrary commands from debug evidence collection, or claim live/current search, full repo/site understanding, root cause, dead-code-free status, or completed fixes without matching evidence.

## Precision Compatibility Layer

Core and Tools are the two primary MCPs. The opt-in Precision server preserves seven legacy tool names for clients that already depend on them and delegates to shared runtime behavior. New setup should use Core + Tools and an explicit Tools safety profile.

| Problem | Precision tool | Behavior |
| --- | --- | --- |
| Destructive full-file rewrites | `mcp_apply_diff_patch` | Accepts exact `SEARCH`/`REPLACE` blocks or unified diffs, verifies the old context first, dry-runs by default, and rejects mismatches instead of guessing. |
| Knowledge decay and deprecated APIs | `mcp_fetch_documentation` | Fetches current HTTPS docs, normalizes them into a compact context block, and records them as read-before-write evidence for the worker/task. |
| Weak feedback loops | `mcp_execute_terminal_command` | Runs one allowlisted build/test/check command in a workspace-confined stateful cwd, captures stdout/stderr, and times out cleanly. |

## Omniscient Context And Self-Healing

The same compatibility shim exposes local context and proof tools for existing clients. Core stays read-only, and Tools owns the primary permission, approval, rollback, and evidence model.

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

Use Core for decisions and Tools for new execution workflows. Keep Precision only where an existing client or workflow requires its compatibility names.

## What Vnem Improves

vnem is meant to improve the judgment of coding agents, not replace maintainer review.

- **Holistic quality gates:** agents run a Triple-Check Workflow: Analyze the real goal, Architect performance and visuals/playability together, then Review that no important domain was sacrificed.
- **Multi-agent routing:** agents choose Single Agent, Orchestrator-Worker, or Split-and-Merge workflows before complex coding, app/game, or research tasks collapse into one overloaded context.
- **Precision compatibility:** existing clients retain the seven exact-patch, documentation, terminal, search, verification, and helper names without duplicating the primary Tools runtime.
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

Tools MCP foundation tools, available only from `scripts/vnem-tools-mcp-server.mjs` / `npm run tools:mcp`:

- `vnem_tools_status`, `vnem_tools_manifest`: report Tools MCP safety policy, active permission profile, allowed-root/workspace/evidence-root status, root warnings, plus a structured catalog of every tool, capability group, safety metadata, evidence behavior, and Core handoff compatibility.
- `vnem_tools_permission_profiles`, `vnem_tools_permission_status`, `vnem_tools_action_policy_preview`, `vnem_tools_trust_boundary_classify`: expose permission profiles, profile/root/provider status, per-action allow/block/approval previews, high-power summaries, Cloudflare summaries, exact approval phrase summaries, and trust-boundary levels (`0_public_information` through `6_blocked_dangerous_action`) without exposing secrets.
- `vnem_tools_reliability_catalog`, `vnem_tools_action_recovery_plan`, `vnem_tools_high_power_action_review`, `vnem_tools_capability_gap_report`: label which Tools are only declared/simulated/dry-run/local-tested/live-disposable/production-safe-with-approval, convert failures into exact next steps and must-not-claim boundaries, pre-review high-power actions, and list known blocked gaps instead of pretending unsupported capabilities exist.
- `vnem_tools_prepare_action_plan`: consume a Core handoff-like object and produce a cautious action plan with supported actions, blocked unsupported actions, required permission profile, approval gates, rollback, and evidence.
- `vnem_tools_permission_prompt`: generate normal-user approval text for exact action, scope, risk, dry-run option, rollback/restore plan, and evidence logging.
- `vnem_tools_read_file`, `vnem_tools_list_files`, `vnem_tools_search_files`, `vnem_tools_workspace_map`, `vnem_tools_read_many_files`, `vnem_tools_code_search`, `vnem_tools_find_references`, `vnem_tools_dependency_scan`: bounded allowed-root project intelligence with secret-path blocking, generated-output/cache skips, redaction, output caps, dependency/script risk flags, and no package installs.
- `vnem_tools_architecture_review`, `vnem_tools_debug_evidence`: bounded code-quality/debugging intelligence for real entry points, MCP/tool or route registries, package scripts, tests, configs, fake parallel systems, possible dead code, contract-change risks, safe logs, git status, package metadata, targeted checks, and evidence logs. These tools do not run arbitrary commands, install packages, read secrets, crawl broadly, or claim a fix/root cause without evidence.
- `vnem_tools_apply_patch`, `vnem_tools_apply_patch_batch`: dry-run-first approved single/multi-file text patching with path checks, approval gate, backups, restore plans, and no partial batch apply by default.
- `vnem_tools_restore_backup`, `vnem_tools_restore_batch`: dry-run-first approved rollback from Tools MCP backup paths or restore plans to allowed target files.
- `vnem_tools_project_scan`: safe project summary of package manager, package scripts, likely frameworks, source/test/config/build paths, safe commands, skipped secret paths, and warnings.
- `vnem_tools_app_inspect`, `vnem_tools_app_vertical_slice_plan`: bounded app architecture inspection and deterministic vertical-slice planning for marker-backed Vite/React/Node and static Node fixtures; Next-style and generic projects remain inspection/plan-only unless a reviewed adapter exists.
- `vnem_tools_app_vertical_slice_apply`, `vnem_tools_app_acceptance_run`, `vnem_tools_app_transaction_rollback`: approved hash-bound multi-file apply, test/build/localhost Chromium acceptance with console/network and desktop/mobile evidence, automatic restore after failed acceptance, and exact transaction rollback. Chromium proof uses a dedicated temporary profile and reports the host-specific sandbox/GPU launch limitation.
- `vnem_tools_run_command`, `vnem_tools_run_project_task`: dry-run-first approved allowlisted commands and safe package.json tasks only; no arbitrary shell, pushes, resets, publish, install, deploy, or destructive commands.
- `vnem_tools_start_dev_server`, `vnem_tools_list_dev_servers`, `vnem_tools_stop_dev_server`: approved localhost dev/start/preview script lifecycle for Tools-started processes only.
- `vnem_tools_api_request`: dry-run-first approved GET/HEAD API requests only; raw secrets blocked; no untrusted URL calls by default.
- `vnem_tools_fetch_url_text`, `vnem_tools_source_quality_check`, `vnem_tools_research_brief`, `vnem_tools_browser_research_pack`: safe source intelligence for direct/provided/local sources; external URL fetch is dry-run-first and approved, search-engine scraping is blocked, and research packs separate supported/unsupported/conflicting claims without faking web search.
- `vnem_tools_search_provider_manifest`, `vnem_tools_search_query_builder`, `vnem_tools_web_search`, `vnem_tools_search_result_ranker`: public search-provider framework. It reports configured/unconfigured providers without exposing API key values, builds strong search queries, runs approved configured provider search or deterministic local fixture search for tests, returns provider_unconfigured/provider_unavailable honestly, and ranks results by relevance, credibility, freshness, duplicates, and risk.
- `vnem_tools_claim_source_matrix`, `vnem_tools_research_gap_detector`: claim/source support matrix and gap analysis for unsupported/conflicting claims, missing current search, missing primary/counter sources, and missing dates/versions.
- `vnem_tools_redirect_chain_check`, `vnem_tools_url_reputation_check`, `vnem_tools_captcha_detector`, `vnem_tools_download_safety_check`: safer browsing risk tools for suspicious redirects, phishing/scam/download bait, credential traps, CAPTCHA/access blocks, and risky download links. They do not bypass CAPTCHA, use cookies/sessions/login, download files, or run installers.
- `vnem_tools_browser_page_inspect`, `vnem_tools_browser_readability_extract`, `vnem_tools_browser_link_map`, `vnem_tools_browser_dom_search`, `vnem_tools_browser_accessibility_audit`, `vnem_tools_browser_compare_snapshots`: safe static browser/page understanding for direct URLs, localhost, allowed local HTML files, provided HTML/text, or previous evidence. They inspect page structure, readable content, links, DOM-like content, accessibility heuristics, and before/after snapshots without JavaScript execution, crawling, accessibility certification, or visual overclaims.
- `vnem_tools_browser_capture`: dry-run-first approved local browser screenshot proof for allowed-root files or localhost pages; external/data/javascript/credentialed URLs, secret files, login/session/cookie/CAPTCHA/credential automation, and broad scraping are blocked.
- `vnem_tools_start_session`, `vnem_tools_finish_session`, `vnem_tools_collect_evidence`: write redacted structured action/session evidence and `proof_trail_compatible_summary`, including screenshot paths/hashes when browser proof exists, for final proof trails.
- `vnem_tools_git_status`, `vnem_tools_git_diff_summary`, `vnem_tools_git_commit`: read-only local git status/diff plus approved local commits of explicit safe files; no git push or remote mutation.

Not in Tools MCP foundation: no Giga MCP, unrestricted filesystem, arbitrary shell, repo deletion/force-push/protected direct push/settings mutation by default, package installs, package publishing, deployment, unrestricted external browser browsing by default, search-engine result page scraping by default, automatic CAPTCHA bypass, unrestricted crawling, secret-backed live API execution, login/cookie/session automation, credential capture, automatic downloads/installers, or unrestricted API calls. Real provider search only works when a provider is configured and approved; otherwise Tools returns honest unavailable/unconfigured status.

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
2. For real user tasks, call `vnem_boost_task` next to get the concrete workflow, questions, selected skill/API guidance, verification, proof requirements, and Core-vs-Tools/Precision boundary.
3. Call the returned lower-level `recommended_vnem_calls`, usually `vnem_route_intent`, `vnem_recommend`, `vnem_quality_gate`, `vnem_orchestrate`, `vnem_search`, `vnem_best_practices`, or `vnem_sources` depending on the task.
4. Use the returned `required_rules` / `vnem://...` resources as the task's read-first contract.
5. Run the returned verification contract before claiming success.
6. In the final report, include the `activation_id`, MCP tools used, rules used, changed files, commands/checks run, skipped checks, remaining risks, and evidence.

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
- `vnem_boost_task`: single real-task entry point that selects usable skill packs, usable API packs only when relevant, domain contracts, routing record, missing questions, output-quality plan, workflow steps, safety rules, verification/proof requirements, must-not-claim limits, and Core-vs-Tools/Precision boundaries.
- `vnem_route_task`: produce a structured Core routing record for serious tasks: task categories, relevant/ignored/outdated/conflicting/unverified/verified memory, material missing-context ask/no-ask decision, needed capabilities, Tools/current-research needs, Tools permission profile/trust-boundary planning, compatibility/safety risks, evidence, next action, and must-not-claim limits.
- `vnem_output_quality_plan`: produce compact-first output/report contracts for AI work review, blocker report, user command handoff, Building AI prompt handoff, and technical final report, with evidence labels (`proven`, `tested`, `supported`, `likely`, `assumed`, `unknown`, `blocked`, `failed`, `not_attempted`, `preparation_only`).
- `vnem_anti_stagnation_check`: flag docs-only fake progress, repeated finished areas, broad-scan loops, full-test-suite loops, same-next-step renames, and polishing finished areas while higher-value work waits.
- `vnem_plan_effort_budget`: classify the user goal into `instant_answer`, `quick_plan`, `standard`, `deep_proof`, or `max_verification`, with truth-over-comfort rules, research/tool budget, escalation triggers, clarification discipline, and must-not-claim boundaries.
- `vnem_fast_answer_contract`: keep simple stable answers fast, answer-first, truthful, and no-ceremony; it forbids long audit reports, pointless clarification, fake proof sections, and decorative tool plans.
- `vnem_design_ambition_plan`: for UI/redesign tasks, follow explicit user style when given; otherwise adapt to business, audience, brand, content, and conversion goal, consider references when useful, require total-impact improvement, and reject generic-template defaults.
- `vnem_visual_taste_audit`: audit planned/completed design work for boring/generic risk, weak hero/CTA/typography/spacing/mobile polish, ignored user style, weak brand fit, inflated scores, one-axis optimization, actually-better-than-original risk, missing visual proof, and missing before/after comparison.
- `vnem_redesign_comparison_scorecard`: compare original/reference vs new redesign across equal total-impact axes: visual beauty, brand fit, conversion/sales clarity, usability, content hierarchy, typography, spacing/layout, mobile polish, animation/interactivity, originality, performance/feel, trust/accessibility basics, and overall user impact. It scores conservatively and refuses visual-superiority claims without screenshots/browser plus before/after evidence.
- `vnem_total_impact_design_plan`: plan redesigns so no single axis (prettiness, animation, minimalism, novelty, etc.) can mask weaker conversion, usability, mobile, trust/accessibility, performance/feel, or overall user impact.
- `vnem_design_direction_selector`: choose a design direction by total impact, preserving explicit user style while rejecting visual-only or generic directions that could be worse than the original.
- `vnem_compact_output_contract`: keep outputs compact by default without becoming vague, hiding material caveats, or removing needed proof; expand for risky/current/UI/debug/security/repo/file tasks.
- `vnem_build_debugging_plan`, `vnem_evidence_to_fix_check`, `vnem_build_architecture_map`, `vnem_code_change_contract`: plan-only Core debugging/code-quality tools for log-first evidence gathering, root-cause structure, targeted tests before broad verification, anti-placebo fix checks, architecture/integration mapping, code-change contracts, and must-not-claim boundaries. Core does not inspect logs, run tests, or execute Tools actions.
- `vnem_prepare_tools_handoff`: prepare a read-only handoff for future Tools/Precision MCP: selected usable packs, required tool capabilities, permission-profile plan, trust-boundary level, approval-required actions, dry-run-first plan, rollback/restore plan, evidence to collect, blocked actions, safe Core actions, and must-not-claim limits.
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
- UI/frontend/backend contracts treat UI as part of the deliverable: backend work is incomplete when the user cannot see/use it, UI polish claims need screenshots/browser/visual evidence, redesign scores must be conservative/before-after-backed, and compact output must keep material caveats/proof.
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
2. Call `vnem_route_task` or `vnem_boost_task` for the concrete task workflow. It classifies the task, filters relevant memory from ignored/outdated/conflicting memory, asks only for material missing context, selects usable API/skill packs rather than raw discovered records, includes a compact `tools_mcp_handoff`, and returns output-quality/anti-stagnation guidance.
3. If you need a standalone future Tools MCP handoff, call `vnem_prepare_tools_handoff` for selected usable packs, required tools, permissions, dry-run-first plan, rollback/restore, evidence, blocked actions, and must-not-claim limits.
4. If you need lower-level details, call `vnem_compose_capability_contract` for required capability IDs or `vnem_build_api_integration_plan` / safety-profile tools for API-specific work.
5. Use returned required rules/resources and task-specific checks/evidence requirements.
6. Before risky filesystem/terminal/browser/GitHub/package/API/skill/modding actions, call `vnem_protection_review` and get explicit user approval outside Core MCP.
7. Run task-specific verification and evidence collection: commands/checks, sources, screenshots/visual proof, changed files, assumptions, and skipped items.
8. Call/apply `vnem_completion_audit`, then call `vnem_proof_trail` and include its compact proof/evidence summary in the final response.

Core/Tools boundary:

- Core MCP chooses useful APIs/skills, routes serious tasks with `vnem_route_task`, selects Tools MCP capabilities with `vnem_select_tools_for_task`, assesses research need with `vnem_assess_research_need`, builds provider-search plans with `vnem_build_search_plan`, builds browsing risk plans with `vnem_build_browsing_plan`, builds general plan-only Core→Tools sequences with `vnem_build_tools_plan`, builds browser/source research plans with `vnem_build_browser_research_plan`, explains Tools chains with `vnem_explain_tools_chain`, creates compact-first output contracts with `vnem_output_quality_plan`, flags repetition with `vnem_anti_stagnation_check`, audits final claims with `vnem_completion_audit` / `vnem_proof_trail`, and prepares Tools MCP handoffs without executing actions.
- Core MCP does not execute actions: no file edits, terminal commands, browser/screenshot work, package installs, GitHub mutations, live API calls, local mod edits, account/device changes, or claims that Tools actions happened.
- Tools MCP foundation performs approved bounded actions using Core's handoff: manifest/catalog discovery, dry-run first, permission prompts, path-limited reads/search/workspace maps/read-many/reference/dependency scans, source-quality/research-brief/research-pack helpers for direct/provided/local sources, provider-search query/build/run/rank helpers, URL reputation/redirect/CAPTCHA/download risk checks, claim/source matrices, research gap detection, safe static page inspection/readability/link-map/DOM-search/accessibility/snapshot-comparison helpers, project scans/patch batches/restores, safe project tasks, local dev server lifecycle, approved GET/HEAD API requests, approved local browser screenshot capture, optional approved local git commits, session evidence, and proof handoffs.
- Not in this foundation batch: no Giga MCP, unrestricted filesystem, arbitrary shell, repo deletion/force-push/protected direct push/settings mutation by default, package installs, package publishing, deployment, unrestricted external browser browsing by default, search-engine result page scraping by default, automatic CAPTCHA bypass, unrestricted crawling, secret-backed live API execution, login/cookie/session automation, credential capture, automatic downloads/installers, or unrestricted API calls. Real provider search only works when configured and approved; otherwise Tools returns honest unavailable/unconfigured status.
- Raw discovered APIs/skills are not counted as usable packs; usable packs are a curated subset with docs/source, safety boundaries, test plans, and handoff needs.

Examples:

- Elden Ring build request:
  - User task: "Give me the best overpowered Elden Ring build."
  - VNEM Core detects: game/build research plus changing/current patch facts.
  - Applies: game-build research contract and source-quality contract.
  - Questions: PvE or PvP, DLC/base game, rune level/progression, weapon/stat/playstyle preference, armor/poise importance, and player skill level.
  - Proof required: current patch/source freshness, stated assumptions, alternatives when DLC/items/stats are unavailable.
  - Core stops at: guidance and proof requirements; no file/tool execution is needed from Core.
  - Tools/Precision MCP: not needed for answering build advice unless the AI must browse/fetch current sources outside Core.
- Weather widget/API integration:
  - User task: "Build a weather widget for my web app."
  - VNEM Core detects: API integration plus visible frontend/UI work.
  - Applies: API integration safety contract, UI/frontend/backend contract, API safety/profile fields, and selected weather API guidance such as Open-Meteo when useful.
  - Questions: frontend-only or backend route, location input, units, auth/CORS/rate-limit constraints, and whether live API testing is approved.
  - Proof required: auth/HTTPS/CORS/frontend-vs-backend decision, no frontend secrets, loading/error/empty/success/rate-limit states, mocked API tests or approved live tests.
  - Core stops at: read-only API planning; it does not call the weather API.
  - Tools/Precision MCP: needed for file edits, test execution, browser proof, and live API calls.
- Currency converter/API integration:
  - User task: "Build a currency converter feature."
  - VNEM Core detects: currency/exchange API integration plus frontend or backend feature work.
  - Applies: usable exchange-rate API pack when available, API integration safety pack, rate-limit/backoff guidance, and mocked exchange-response tests.
  - Proof required: selected exchange API docs/source, no frontend secret exposure, mocked rate conversion/error/429 tests, stale-rate handling.
  - Core stops at: read-only API planning and handoff.
  - Future Tools/Precision MCP: needed for file edits, command/test execution, secret storage, and approved live calls.
- GitHub repo helper:
  - User task: "Build a repo issue triage helper."
  - VNEM Core detects: GitHub/dev API integration plus workflow/triage guidance.
  - Applies: usable GitHub REST API pack, backend OAuth/PAT handling, rate-limit guidance, and issue-triage skill guidance.
  - Proof required: mock issue/search responses, pagination/rate-limit tests, least-privilege token boundary, no PAT in frontend/logs.
  - Core stops at: guidance and handoff; it never mutates GitHub.
  - Future Tools/Precision MCP: needed for GitHub actions, file edits, terminal tests, and approved live API calls.
- Suspicious domain/IP check:
  - User task: "Check whether a suspicious domain or IP is risky."
  - VNEM Core detects: security/threat API task.
  - Applies: usable threat/reputation API pack such as AbuseIPDB, VirusTotal, URLHaus, Safe Browsing, IPinfo, or ip-api when appropriate.
  - Proof required: backend/API-key handling, mocked reputation response, human-review warning, corroboration if action is proposed.
  - Core stops at: risk-enrichment plan; it does not call threat APIs or block anything.
  - Future Tools/Precision MCP: needed for approved live lookups, secret handling, logs/evidence, and any enforcement action.
- UI/frontend/backend improvement:
  - User task: "Improve my dashboard UI and make sure the backend feature is actually visible."
  - VNEM Core detects: UI/frontend/backend integration.
  - Applies: frontend/UI skill guidance and UI/backend quality contract.
  - Questions: target route, backend feature, user action path, desktop/mobile states, accessibility bar, and screenshot/browser proof expectations.
  - Proof required: visible user path, backend-to-UI data flow, form/action path when relevant, loading/error/empty/success states, responsive/mobile/desktop and accessibility proof, screenshot/browser/visual proof.
  - Core stops at: guidance and verification requirements; it does not inspect the browser or edit code.
  - Tools/Precision MCP: needed for actual UI changes, browser screenshots, and test commands.
- Modding task:
  - User task: "Improve this Elden Ring mod and make real file changes."
  - VNEM Core detects: high-risk game/modding workflow.
  - Applies: modding safety contract, game-build context contract, and protection review triggers.
  - Questions: exact game version, platform, mod loader/toolchain, file formats, target files, backup/isolation, restore plan, compatibility constraints.
  - Proof required: toolchain/file-format research, backup and restore plan, isolated workspace, compatibility check, and game/tool-specific verification plan.
  - Core stops at: planning/check guidance; it cannot edit mod files.
  - Tools/Precision MCP: required for actual file edits, unpack/repack, backups/restores, and local verification.
- Security hardening:
  - User task: "Help me make my Gmail and PC as secure as possible."
  - VNEM Core detects: high-stakes account/device security advice.
  - Applies: security/protection workflow and source-quality contract.
  - Questions: account access status, device OS, threat level, recovery options, MFA status, password manager use, suspicious sessions/apps, backup status.
  - Proof required: current official/vendor guidance where facts change, immediate account-safety checklist, user-action vs tool-action separation, final safety checklist.
  - Core stops at: advice/checklist; it does not change Gmail, PC settings, sessions, passwords, or devices.
  - Tools/Precision MCP: only with user approval for local checks or browser/account actions.
- Repo debugging:
  - User task: "Fix this repo issue and prove it works."
  - VNEM Core detects: coding/debugging/testing workflow.
  - Applies: systematic debugging proof workflow and code/debug verification contract.
  - Questions: failing command, logs, repro steps, expected vs actual behavior, test scope, safe patch constraints.
  - Proof required: logs first, reproduction, root cause, minimal patch, focused tests, regression checks, before/after proof.
  - Core stops at: workflow and proof contract; it does not mutate files or run commands.
  - Tools/Precision MCP: needed for file edits, terminal commands, tests, and GitHub actions.

Older lower-level examples:

- Next.js UI task: call `vnem_bootstrap`, then `vnem_boost_task` or `vnem_compose_capability_contract` with `token_budget=compact`; apply the frontend/UI quality module and report build plus backend-to-UI data flow, visual/responsive/accessibility, loading/error/empty/success-state evidence. `vnem_completion_audit` should revise if no screenshot/browser/visual proof exists.
- Weather/API integration: call `vnem_boost_task`; if deeper API detail is needed, call `vnem_recommend_apis`, then `vnem_api_safety_profile` for the selected API, then `vnem_build_api_integration_plan`; compare auth/HTTPS/CORS, docs/freshness/rate-limit confidence, use a backend proxy for secret-bearing or CORS-unsafe APIs, never expose frontend keys, and provide success/error/loading/rate-limit tests. `vnem_protection_review` should block/revise frontend API-key exposure.
- Skill/capability use: call `vnem_recommend_skills`, then `vnem_skill_safety_profile`; Core MCP may apply safe guidance summaries, but installation/execution remains Precision/Tools-only after manual SKILL.md/scripts/references review.
- Debugging task: call `vnem_boost_task`, `vnem_build_debugging_plan`, and, before claiming fixed, `vnem_evidence_to_fix_check`; collect bounded evidence with Tools `vnem_tools_debug_evidence`, map integration points with `vnem_tools_architecture_review`, reproduce the failure, identify root cause, fix the real path, and show targeted red/green or equivalent proof before broad verification.
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
| `scripts/lib/quality-contracts.mjs` | Read-only completion audits, protection reviews, missing-context detection, and research/UI/API/game/modding/debugging/code-quality domain quality contracts, including anti-placebo checks for unwired MCP tools, docs-only bug fixes, mock-only proof, and missing targeted verification. |
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
| `scripts/vnem-tools-mcp-server.mjs` | Separate safe Tools MCP foundation: dry-run-first approved patches, commands, API requests, and evidence. |
| `scripts/test-tools-mcp-server.mjs` | Smoke/safety tests for the Tools MCP foundation. |
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
