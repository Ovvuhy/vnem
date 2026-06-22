# vnem Install And MCP Guide

Generated: 2026-06-22T21:02:06.140Z

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
- Agent flow: call `vnem_bootstrap`, then `vnem_boost_task` for the concrete user-task workflow. It selects usable API/skill packs rather than raw records and returns a compact `tools_mcp_handoff`. Use `vnem_prepare_tools_handoff` when a standalone future Tools MCP handoff is needed. Use `vnem_compose_capability_contract` only when lower-level capability IDs/details are needed. Call `vnem_protection_review` before risky filesystem/terminal/browser/GitHub/package/API/skill/modding actions; collect task-specific checks/evidence; call/apply `vnem_completion_audit`; then call `vnem_proof_trail` and include its compact proof/evidence summary in the final response.
- Capability library: when `vnem_bootstrap` reports skill/API availability, use `vnem_library_status`, `vnem_get_required_capabilities`, `vnem_activate_capability_pack`, `vnem_apply_skill_guidance`, `vnem_boost_task`, `vnem_prepare_tools_handoff`, `vnem_build_api_integration_plan`, `vnem_api_safety_profile`, `vnem_skill_safety_profile`, `vnem_get_agent_profile`, `vnem_compose_capability_contract`, `vnem_completion_audit`, `vnem_protection_review`, `vnem_proof_trail`, `vnem_recommend_skills`, `vnem_recommend_apis`, and `vnem_review_skill_or_api` for read-only capability activation, usable pack selection, audit, proof, and protection review. The default Core MCP chooses useful APIs/skills and prepares future Tools MCP handoff, but it does not install skills, execute scripts, call APIs, mutate files, open browsers, run terminals, or push GitHub changes.
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
