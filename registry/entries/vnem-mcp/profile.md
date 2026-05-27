# vnem MCP

vnem MCP is the local read-only MCP server for the vnem registry. It exposes vnem search,
recommendation, comparison, entry lookup, and best-practice guidance to agent clients over
stdio.

## Best For

- Coding agents that should consult vnem before choosing MCP servers, skills, memory layers,
  prompt patterns, evals, search tools, or upgrade paths.
- Repositories that want source-backed recommendations without granting mutation permissions.

## Recommended When

- Use when an agent client supports MCP and can start a local stdio server.
- Use when the user wants vnem to feel automatic while still keeping the install pack read-only.

## Review Notes

The server reads generated vnem artifacts from the local checkout. It does not install packages,
edit target project files, call remote services, or run the tools it recommends.
