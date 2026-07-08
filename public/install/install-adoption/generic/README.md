# Generic MCP Stdio VNEM Profile

Use `mcp.json` with any MCP stdio client that accepts a `mcpServers` object.
If your client uses a different key name, translate the two server objects without changing command, args, cwd, env, or transport.

Both VNEM MCP servers are included:

- `vnem`: Core MCP for routing, planning, proof contracts, and install guidance.
- `vnem-tools`: Tools MCP for safe repo/code/debug/test/GitHub/proof actions.

Verification after import:

1. Reload the client if required.
2. Confirm the client lists `vnem_entrypoint` and `vnem_install_adoption_guide`.
3. Confirm the client lists `vnem_tools_entrypoint`, `vnem_tools_install_profile_emit`, and `vnem_tools_install_doctor`.
4. Run the install doctor through the Tools MCP or locally with `node scripts/vnem-install-adoption.mjs doctor`.

Repo root: C:\VNEM\vnem-src
Node command: C:\Users\ovvuh\AppData\Local\hermes\node\node.exe
Node version: v22.22.3
Transport: stdio
Secrets: none are embedded in this profile.
