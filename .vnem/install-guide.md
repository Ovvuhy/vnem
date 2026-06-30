# vnem Install And MCP Guide

Generated: 2026-06-30T09:26:27.230Z

A compact setup guide for downloading the read-only vnem pack, installing it into an existing repo without overwriting local agent instructions, and connecting the local stdio MCP server with generated JSON config.

## Safety Boundary

- The install pack is read-only guidance and generated search data.
- The archive install does not run package manager scripts, shell scripts, daemons, or MCP servers.
- The MCP server is opt-in, local, stdio-based, and read-only; it exposes vnem search, recommendation, resources, quality gates, and deterministic orchestration plans.
- The separate precision MCP server is mutation-capable and must be enabled only for an explicitly scoped workspace.
- Review any client config before adding it to a shared project or user-wide MCP scope.

## Fastest Pack Install

Use this inside the project that should become vnem-aware:

```bash
curl -fsSL https://raw.githubusercontent.com/Ovvuhy/vnem/main/public/install.tgz | tar -xz
```

This extracts `AGENTS.md` plus the `.vnem/` guidance pack. It is best for a clean repo or a repo where replacing/creating the root `AGENTS.md` is acceptable.

PowerShell-safe archive download:

```powershell
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/Ovvuhy/vnem/main/public/install.tgz" -OutFile "vnem-install.tgz"
tar -xzf vnem-install.tgz
Remove-Item vnem-install.tgz
```

## Existing Repo Install

If the project already has an `AGENTS.md`, use the local CLI installer from a vnem checkout so it upserts a managed block instead of replacing the whole file:

```bash
git clone https://github.com/Ovvuhy/vnem.git
cd vnem
npm install
npm run install:project -- /path/to/project
npm run doctor -- /path/to/project
```

Claude-style projects can also receive a `CLAUDE.md` pointer:

```bash
npm run install:project -- /path/to/project --claude
```

## MCP Setup From A Checkout

The MCP server requires a local checkout with dependencies installed:

```bash
git clone https://github.com/Ovvuhy/vnem.git
cd vnem
npm install
npm run mcp
```

For client config, generate absolute-path JSON from the checkout:

```bash
node scripts/vnem-cli.mjs mcp-config
node scripts/vnem-cli.mjs mcp-config --server-json
```

Opt-in precision MCP config for a project that should allow exact patching, current-doc fetching, and safe terminal feedback:

```bash
node scripts/vnem-cli.mjs mcp-config --precision --workspace /path/to/project
node scripts/vnem-cli.mjs mcp-config --precision --workspace /path/to/project --server-json
```

Opt-in Tools MCP foundation for a project that should allow bounded approved manifest/catalog discovery, workspace maps, read-many/code-search/reference/dependency intelligence, safe source-quality/research-brief/research-pack helpers, bounded source-map/source-extract/source-graph helpers, provider-search query/build/run/rank tools, URL reputation/redirect/CAPTCHA/download risk checks, claim/source matrices, contradiction/freshness detection, research gap detection, safe static page inspection/readability/link-map/DOM-search/accessibility/snapshot-comparison helpers, permission-profile/trust-boundary previews (`safe-readonly` default, `safe-local-dev`, `approved-writes`, `creator-power`, and preview-only install/GitHub profiles), safe project scans, dry-run-first single/multi-file patches, batch restore/rollback, safe package tasks, local dev servers, approved GET/HEAD API requests, approved local browser screenshots, bounded localhost browser evidence runs, UI surface review, browser evidence planning, UI evidence audits, optional approved local git commits, and proof-compatible evidence/session logs:

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

Tools MCP is separate from Core MCP and is not Giga MCP: no Giga MCP, unrestricted filesystem, arbitrary shell, git push / remote GitHub mutation, package installs, package publishing, deployment, unrestricted external browser browsing by default, search-engine result page scraping by default, automatic CAPTCHA bypass, unrestricted crawling, login/session/cookie automation, credential capture, automatic downloads/installers, secret-backed live API execution, and unrestricted API calls remain unsupported. Default Tools profile is `safe-readonly`; real local dev/write/API/browser/git actions require an explicit stronger profile plus approval/evidence/rollback where applicable. Real provider search works only when configured and approved; otherwise Tools returns honest unavailable/unconfigured status.

Actual Core → Tools use path: start/connect Core MCP; start/connect Tools MCP for a specific workspace; ask Core `vnem_route_task`, `vnem_output_quality_plan`, `vnem_anti_stagnation_check`, `vnem_build_debugging_plan`, `vnem_evidence_to_fix_check`, `vnem_build_architecture_map`, `vnem_code_change_contract`, `vnem_build_ui_quality_plan`, `vnem_visual_proof_contract`, `vnem_select_tools_for_task`, `vnem_build_tools_plan`, `vnem_assess_research_need`, `vnem_build_search_plan`, `vnem_build_browsing_plan`, `vnem_build_browser_research_plan`, `vnem_build_research_strategy`, `vnem_build_source_ingestion_plan`, `vnem_research_evidence_audit`, `vnem_explain_tools_chain`, or `vnem_boost_task` to select tool capabilities, classify relevant/ignored memory, make material missing-context ask/no-ask decisions, prevent repeated finished work, and build a compact-first plan-only handoff; use `vnem_tools_manifest`, `vnem_tools_permission_status`, `vnem_tools_action_policy_preview`, and `vnem_tools_trust_boundary_classify` for catalog/profile/trust-boundary discovery; dry-run first; ask the user for exact approval including active/required profile, trust boundary, scope, rollback, and evidence; map/read/search the project, inspect dependencies without installing, build search queries, run configured/approved provider search or return honest unavailable status, rank search results, evaluate direct/provided/local sources, inspect page structure, extract readability, map links without following them, search DOM-like content, detect CAPTCHA/access blocks, check URL/redirect/download risk, build claim/source matrices, detect research gaps, build source maps, extract explicit bounded targets, compare source graphs for official/community conflicts, freshness, and contradictions, review architecture entry points/registries/tests/configs for fake parallel systems and possible dead code, review UI routes/components/render paths/state coverage, plan browser evidence without hidden automation, execute bounded approved localhost browser evidence packs, audit UI evidence objects, and do not treat blocked/partial browser runs as proof. Browser evidence run requires `VNEM_TOOLS_ALLOW_LOCALHOST=1`, permission/approval, requested routes only, and `browser_was_run=true` before visual/browser claims; no login/cookie/session/CAPTCHA/broad browsing is supported. audit provided UI evidence objects, collect bounded log-first debug evidence without arbitrary commands, run static accessibility checks, compare page snapshots, apply approved patch batches/restores, run safe project tasks, start/stop local dev servers, perform approved API/browser proof, optionally make an approved local git commit, and collect `vnem_tools_collect_evidence` or `vnem_tools_finish_session`; use `proof_trail_compatible_summary` with `vnem_completion_audit` / `vnem_research_evidence_audit` / `vnem_proof_trail`; do not claim visual/live API/search proof unless those evidence fields exist.

How to test Core + Tools MCP locally without external internet: `npm run test:mcp-user-smoke`, `npm run tools:readiness`, and `npm run core:readiness`. Public Tools MCP reports permission profiles, allowed-root/workspace/evidence-root status, broad-root warnings, blocked categories, action policy previews, and trust-boundary classifications. It can build search queries, run configured/approved provider search, rank results, inspect sources/pages, map allowed local repos/docs, extract explicit bounded targets, build source graphs, detect freshness/contradictions, check URL/reputation/download risk, build claim/source matrices, detect research gaps, review architecture entry points/registries/tests/configs, review UI route/component/render/state coverage, plan browser proof without hidden automation, execute bounded approved localhost browser evidence packs, audit UI evidence objects, flag fake parallel systems and possible dead code, and collect bounded log-first debug evidence without arbitrary commands. It blocks secret paths/values, cookies/sessions/browser profiles/password-manager-like paths, and hard-dangerous actions by default. It does not automatically bypass CAPTCHA, scrape search engine result pages by default, perform login/session/cookie automation, run arbitrary downloads/installers, crawl broadly, read secret/session/browser-profile paths, or claim live/current search, full repo/site understanding, root cause, completed fixes, UI improvement, responsive/accessibility/browser-working status, wired implementation, or dead-code-free status without matching visual/browser/source evidence. Browser proof requires `browser_was_run=true` plus screenshot/DOM/route/console/network/a11y/viewport/state evidence as applicable; blocked runs are not proof.

Generic `.mcp.json` shape:

```json
{
  "mcpServers": {
    "vnem": {
      "command": "node",
      "args": [
        "/absolute/path/to/vnem/scripts/vnem-mcp-server.mjs"
      ],
      "env": {
        "VNEM_ROOT": "/absolute/path/to/vnem"
      }
    }
  }
}
```

Claude Code can add a single-server JSON object with `claude mcp add-json vnem '<json>'`. Other MCP clients usually accept either the full `mcpServers` object above or the single `vnem` server object printed by `--server-json`.

For the precision server, use the generated `vnem-precision` config and review `VNEM_PRECISION_ROOT` before connecting it. The default read-only server remains the safer default.

## Verify

- Pack install: run `npm run doctor -- /path/to/project` from the vnem checkout.
- MCP activation: connect the client and call `vnem_bootstrap` with the real task. Confirm the structured output includes `activation.status=active`, `read_only=true`, `precision_tools_exposed=false`, `compact_startup_contract`, `missing_context`, `domain_quality_contracts`, task-specific `required_rules`, `recommended_vnem_calls`, `protection_needs`, `verification_contract`, `completion_audit_expectations`, proof-trail recommendation, and `anti_placebo_checks`.
- Agent flow: call `vnem_bootstrap`, then `vnem_boost_task` for the concrete user-task workflow. It selects usable API/skill packs rather than raw records and returns a compact `tools_mcp_handoff`. Use `vnem_prepare_tools_handoff` when a standalone Tools MCP handoff is needed; for source/browser work, use `vnem_build_browser_research_plan` and `vnem_explain_tools_chain` to separate direct-source, website-understanding, local-UI, and current-search needs. Connect the separate `vnem-tools` MCP foundation only when approved actions are needed; it dry-runs first, asks permission, scans projects safely, applies approved path-limited patch batches, restores from approved backups/restore plans, runs only allowlisted commands and safe package tasks, starts/stops only local Tools-started dev servers, performs only approved GET/HEAD API requests, inspects direct/local/provided page sources, maps links without following/crawling, runs heuristic accessibility/snapshot checks, captures approved local browser screenshots, can make approved local git commits of explicit safe files, and collects redacted action/session evidence. Use `vnem_compose_capability_contract` only when lower-level capability IDs/details are needed. Call `vnem_protection_review` before risky filesystem/terminal/browser/GitHub/package/API/skill/modding actions; collect task-specific checks/evidence; call/apply `vnem_completion_audit`; then call `vnem_proof_trail` and include its compact proof/evidence summary in the final response.
- Capability library: when `vnem_bootstrap` reports skill/API availability, use `vnem_library_status`, `vnem_get_required_capabilities`, `vnem_activate_capability_pack`, `vnem_apply_skill_guidance`, `vnem_boost_task`, `vnem_route_task`, `vnem_output_quality_plan`, `vnem_anti_stagnation_check`, `vnem_prepare_tools_handoff`, `vnem_build_tools_plan`, `vnem_build_debugging_plan`, `vnem_evidence_to_fix_check`, `vnem_build_architecture_map`, `vnem_code_change_contract`, `vnem_build_browser_research_plan`, `vnem_explain_tools_chain`, `vnem_build_api_integration_plan`, `vnem_api_safety_profile`, `vnem_skill_safety_profile`, `vnem_get_agent_profile`, `vnem_compose_capability_contract`, `vnem_completion_audit`, `vnem_protection_review`, `vnem_proof_trail`, `vnem_recommend_skills`, `vnem_recommend_apis`, and `vnem_review_skill_or_api` for read-only capability activation, usable pack selection, routing/memory relevance, missing-context decisions, output-quality contracts, anti-stagnation checks, browser/source planning, audit, proof, and protection review. The default Core MCP chooses useful APIs/skills and prepares Tools MCP handoff, but it does not install skills, execute scripts, call APIs, mutate files, open browsers, run terminals, or push GitHub changes. Tools MCP is separate and approval-gated.
- Domain contracts: research/source-quality work must use current/high-quality sources where facts can change; UI/backend work needs visible user-path, backend-to-UI data flow, loading/error/empty/success/responsive/accessibility checks, and visual evidence; API work needs auth/CORS/HTTPS/secret/backend handling plus docs/freshness/rate-limit unknowns; game/build/modding work needs specific game/version/tool/file-format context, backups/isolation where mutation is proposed, and no generic best-build claims without PvE/PvP/DLC/progression assumptions.
- Real task examples: Elden Ring build boosts ask PvE/PvP, DLC/base game, progression/rune level, weapon/stat preference, armor/poise, player skill, and patch/source freshness; weather widgets select a usable weather API pack and require frontend/backend, CORS, secret, rate-limit, loading/error/empty/success, and mocked-test proof; currency converters select a usable exchange API pack and require mocked rates, stale-rate handling, rate-limit/backoff, and no frontend secrets; repo issue triage helpers select a usable GitHub API pack with backend OAuth/PAT and GitHub/action handoff; suspicious domain/IP checks select a usable threat/IP pack with backend API-key handling, corroboration, and human review; dashboard UI/backend tasks require visible user path, backend-to-UI data flow, visual/browser/screenshot, responsive, accessibility, and state proof; modding tasks require game version, platform, toolchain, file formats, backup, restore, compatibility, and Tools/Precision MCP for edits; Gmail/PC security tasks separate user actions from tool actions, require current source-quality checks, and forbid impossible guarantees; repo debugging tasks require logs first, reproduction, root cause, minimal patch, tests, and before/after proof.
- Orchestration: for complex app, game, coding, or research work, call `vnem_orchestrate` and confirm it returns the expected pattern and JSON schemas.
- Precision server: call `mcp_apply_diff_patch` with `dry_run=true` before any real apply, `mcp_fetch_documentation` before framework-specific code, `mcp_execute_terminal_command` only for allowlisted checks, `mcp_semantic_code_search` before blind traversal, `mcp_run_verification_tests` for red/green proof loops, and `mcp_execute_ephemeral_script` only for temporary local helpers. These tools are not exposed by the default read-only MCP server.
- Current limits: Super MCP skill/API records are metadata/enrichment only, not automatic install/execution. VNEM is not a standalone trained AI model.

## Troubleshooting

- If the archive command fails, download `install.tgz` directly from the HTTPS URL and extract it with `tar -xzf`.
- If an MCP client cannot start the server, use the absolute `node` path or verify Node.js 20+ is available to that client process.
- If paths contain spaces, keep JSON strings quoted and prefer the generated config over hand-written paths.
- If a project should share MCP config, commit only read-only config and avoid secrets in `.mcp.json`.

## Source URLs

- https://raw.githubusercontent.com/Ovvuhy/vnem/main/public/install.tgz
- https://modelcontextprotocol.io/legacy/concepts/transports
- https://docs.anthropic.com/en/docs/claude-code/mcp
- https://docs.anthropic.com/en/docs/claude-code/sdk/sdk-mcp
