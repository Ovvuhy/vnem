# vnem Install And MCP Guide

Generated: 2026-06-05T19:43:23.655Z

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
- MCP server: connect the client and call `vnem_status`, then `vnem_overview`, then `vnem_recommend` for a real coding task.
- Quality gate: for UI/game/app work, call `vnem_quality_gate` or check the `quality_gate` field returned by `vnem_recommend`.
- Orchestration: for complex app, game, coding, or research work, call `vnem_orchestrate` and confirm it returns the expected pattern and JSON schemas.
- Precision server: call `mcp_apply_diff_patch` with `dry_run=true` before any real apply, `mcp_fetch_documentation` before framework-specific code, `mcp_execute_terminal_command` only for allowlisted checks, `mcp_semantic_code_search` before blind traversal, `mcp_run_verification_tests` for red/green proof loops, and `mcp_execute_ephemeral_script` only for temporary local helpers.

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
