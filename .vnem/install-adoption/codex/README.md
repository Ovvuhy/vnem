# Codex VNEM MCP Profile

Use `config-snippet.toml` as a merge snippet. Do not replace the whole Codex config file, and do not overwrite unrelated MCP servers.

This kit does not guess the Codex config path. It emits repo-local guidance only.
This tracked file is a portable template. Replace `${VNEM_CHECKOUT}` with the absolute VNEM checkout path, or run `node scripts/vnem-install-adoption.mjs emit --client codex` from a checkout to generate a local profile.

Suggested flow:

1. Review `config-snippet.toml`.
2. Merge the `mcp_servers.vnem` and `mcp_servers.vnem-tools` tables into your active Codex MCP configuration.
3. If your installed Codex CLI supports MCP management, run `codex mcp --help` first and use only the syntax it documents locally.
4. Reload Codex, then verify the tool list includes `vnem_install_adoption_guide` and `vnem_tools_install_doctor`.

Rollback: remove only the two added `mcp_servers` tables from your Codex config and reload the client.

Repo root: ${VNEM_CHECKOUT}
Node command: node
Node version: resolved by the target client environment
Transport: stdio
Servers: vnem, vnem-tools
Secrets: none are embedded in this profile.
