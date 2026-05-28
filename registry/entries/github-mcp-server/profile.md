# GitHub MCP Server

GitHub MCP Server is GitHub's official MCP server for repository, code search, issue, pull request, workflow, security, and collaboration operations, with toolset controls and read-only mode available.

## Best For

- GitHub-native repository workflows with scoped tokens and branch protections

## Recommended When

- Use when an agent needs GitHub context or PR workflows and token scope can be constrained.
- Prefer read-only mode or narrow toolsets until mutation is explicitly approved.

## Review Notes

Trust tier: promising. Review status: manual-reviewed. Permissions: repository, network. Risk flags: mutates-repositories, requires-token, high-tool-count.

Sources:
- https://github.com/github/github-mcp-server
