# VNEM Client Setup

`vnem setup` configures VNEM Core and VNEM Tools as local stdio MCP servers without replacing unrelated client settings.

## Commands

```text
vnem setup
vnem clients --json
vnem config preview --clients codex_app,codex_cli --workspace /path/to/project --json
vnem setup --clients codex_app,codex_cli --workspace /path/to/project --profile safe-local-dev --yes --json
vnem setup --clients codex_app,codex_cli --scope global --workspace /path/to/current-project --profile creator-power --yes --json
vnem doctor --clients --scope global --json
vnem rollback --scope global --yes --json
vnem doctor --clients --workspace /path/to/project --json
vnem rollback --yes --json
vnem safety --status --json
vnem status --json
vnem benchmark
```

Interactive setup uses Up/Down to move, Space to toggle a checked client, Enter to continue, and Q to cancel. It asks for components and a safety profile, previews every path and before/after hash, and uses one exact `APPLY VNEM` confirmation.

Noninteractive setup does not write without `--yes`. Use `--no-verify-mcp` only for isolated fixture work where server startup is intentionally out of scope.

## Global Codex Mode

`--scope global` is supported for Codex App and Codex CLI. It registers Core and Tools once in the shared Codex TOML, installs the managed VNEM instruction block in `~/.codex/AGENTS.md`, and records the chosen global profile under `~/.codex/vnem/global.json`. It removes legacy static `VNEM_TOOLS_ALLOWED_ROOTS` and `VNEM_TOOLS_EVIDENCE_ROOT` assignments from VNEM's managed Tools entry instead of replacing them with a drive or user-home root.

At runtime, `vnem-tools` parses only Codex project trust entries from `~/.codex/config.toml`. A trusted canonical project root can be selected immediately; a different trusted project appears on the next discovery call without reinstalling VNEM. Untrusted roots require the bounded `vnem_tools_project_approval_request` and `vnem_tools_project_approval_activate` flow. Session approvals disappear with the Tools process, persistent approvals expire as configured and can be revoked, and drive roots, the whole user home, and dangerously broad parents are rejected.

When Codex does not expose an active-workspace signal to the MCP process, call `vnem_tools_project_select` with an authorized exact root. Relative paths then resolve only inside that selected project. An explicit root on a project-sensitive tool is treated as an explicit, audited selection attempt and must independently pass the same trust or approval check.

Global mode uses namespaced evidence and state (option B):

```text
~/.codex/vnem/projects/<canonical-project-id>/tool-runs
```

The stable project ID is derived from the canonical real path rather than concatenating a raw path. Permission grants, backups, transactions, plans, structural indexes, generated adapters, command/test/browser evidence, and runtime records are kept in the selected project's namespace. This supports read-only projects and avoids adding `.vnem` files to every repository. Hard blocks remain above the global profile; a project policy may narrow that profile but cannot broaden it.

## Transaction Safety

- Existing JSON is parsed and merged through `mcpServers`; unrelated top-level keys, unrelated servers, and unknown server/env settings are preserved.
- Codex TOML is parsed after generation. Only VNEM's managed server tables are updated; unrelated tables and unknown VNEM server/env keys are preserved.
- Project-scoped setup writes the marked VNEM block to eligible project instructions. Global Codex setup writes it only to `~/.codex/AGENTS.md`; it does not modify each project's `AGENTS.md`. Unrelated instructions are preserved, malformed or duplicate markers block setup, and config/instructions/state share one transaction and rollback.
- Codex App and Codex CLI share one deduplicated `~/.codex/config.toml` change.
- Every changed or newly created file is recorded before mutation. Existing files receive private byte-for-byte backups.
- Writes use a temporary file and atomic rename.
- A changed-after-preview hash mismatch blocks the transaction.
- Setup failure rolls back files already touched by that transaction.
- `vnem rollback` previews by default and restores the latest active transaction only with `--yes`.
- Proof and manifests contain paths, hashes, statuses, and redacted errors, never config contents or raw secrets.

The default project-scoped transaction state is under `~/.vnem/setup`. Global Codex transactions are under `~/.codex/vnem/setup`. Generated import profiles are project-local under `.vnem/client-profiles/` and are ignored by Git.

## Support Levels

| Client | Setup behavior | Current proof |
| --- | --- | --- |
| Codex App | Direct merge into `~/.codex/config.toml` | Official contract, Windows fixture coverage, and real local backup/merge/rollback/Core+Tools stdio proof |
| Codex CLI | Same deduplicated Codex TOML merge | Official contract and real local config proof; installed Windows executable is currently OS-blocked from this shell |
| Claude Code | Project `.mcp.json` merge | Official contract and isolated Windows/Linux/macOS fixtures |
| Claude Desktop | Direct JSON merge at its platform config path | Official contract and isolated fixtures; no installed local client proof |
| Antigravity | Import profile only | Client config contract not verified; no guessed global path |
| Generic MCP stdio | Project import profile | Protocol and real Core/Tools stdio proof |
| Hermes | Import profile only | Local CLI detection plus fixture profile; global config contract not verified |
| Cursor | Direct `~/.cursor/mcp.json` merge | Official contract and isolated fixtures |
| Windsurf | Import profile only | Client config contract not verified; no guessed global path |
| Cline | Import profile only | Extension-managed storage is not edited directly |
| Gemini CLI | Direct `~/.gemini/settings.json` merge | Official contract and isolated fixtures |

Client paths are resolved from the current platform and home directory. Portable fixtures cover Windows, Linux, and macOS. Universal examples never contain a developer-specific home path.

## Verification

Setup validates config and managed-instruction syntax, confirms the selected safety profile, starts the selected VNEM servers, lists their tools, and calls `vnem_entrypoint` and `vnem_tools_entrypoint`. This proves the local server/config payload, not that a running client UI has reloaded it.

The read-only Core tool `vnem_usage_self_check` can audit caller-supplied configuration names, visible entrypoints, managed instructions, and current-session evidence. It uses no hidden telemetry and returns no VNEM ceremony for trivial tasks. A missing client reload remains unproven until the client actually exposes and calls the entrypoints.

After a successful setup transaction, plain `vnem doctor` also verifies the clients, components, and safety profile recorded by that transaction. `vnem doctor --clients` runs only the client/setup doctor.

After Codex setup, use the official reload path:

1. In Codex App, open Settings, select MCP servers, then select Restart.
2. Start a new task and inspect the MCP server list.
3. In Codex CLI, restart the process and run `/mcp` or `codex mcp list`.

Current source contracts:

- Codex MCP: <https://developers.openai.com/codex/mcp>
- Codex config reference: <https://developers.openai.com/codex/config-reference>
- Claude Code MCP: <https://docs.anthropic.com/en/docs/claude-code/mcp>
- Cursor MCP: <https://docs.cursor.com/context/model-context-protocol>
- Gemini CLI MCP: <https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/mcp-server.md>

## Limits

- VNEM does not restart a client while that client is hosting active work.
- Import-profile clients still require the user to import through that client's current supported UI or CLI.
- Setup does not claim a client is installed merely because a profile can be generated.
- Setup never reads, prints, or copies credential values into proof output.
