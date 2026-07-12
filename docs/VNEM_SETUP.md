# VNEM Client Setup

`vnem setup` configures VNEM Core and VNEM Tools as local stdio MCP servers without replacing unrelated client settings.

## Commands

```text
vnem setup
vnem clients --json
vnem config preview --clients codex_app,codex_cli --workspace /path/to/project --json
vnem setup --clients codex_app,codex_cli --workspace /path/to/project --profile safe-local-dev --yes --json
vnem doctor --clients --workspace /path/to/project --json
vnem rollback --yes --json
vnem safety --status --json
vnem status --json
vnem benchmark
```

Interactive setup uses Up/Down to move, Space to toggle a checked client, Enter to continue, and Q to cancel. It asks for components and a safety profile, previews every path and before/after hash, and uses one exact `APPLY VNEM` confirmation.

Noninteractive setup does not write without `--yes`. Use `--no-verify-mcp` only for isolated fixture work where server startup is intentionally out of scope.

## Transaction Safety

- Existing JSON is parsed and merged through `mcpServers`; unrelated top-level keys, unrelated servers, and unknown server/env settings are preserved.
- Codex TOML is parsed after generation. Only VNEM's managed server tables are updated; unrelated tables and unknown VNEM server/env keys are preserved.
- Codex App and Codex CLI share one deduplicated `~/.codex/config.toml` change.
- Every changed or newly created file is recorded before mutation. Existing files receive private byte-for-byte backups.
- Writes use a temporary file and atomic rename.
- A changed-after-preview hash mismatch blocks the transaction.
- Setup failure rolls back files already touched by that transaction.
- `vnem rollback` previews by default and restores the latest active transaction only with `--yes`.
- Proof and manifests contain paths, hashes, statuses, and redacted errors, never config contents or raw secrets.

The default transaction state is under `~/.vnem/setup`. Generated import profiles are project-local under `.vnem/client-profiles/` and are ignored by Git.

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

Setup validates config syntax, confirms the selected safety profile, starts the selected VNEM servers, lists their tools, and calls `vnem_entrypoint` and `vnem_tools_entrypoint`. This proves the local server/config payload, not that a running client UI has reloaded it.

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
