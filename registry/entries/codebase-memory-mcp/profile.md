# codebase-memory-mcp

codebase-memory-mcp is a local MCP server that indexes source code into a persistent tree-sitter knowledge graph so coding agents can answer structural questions with graph queries instead of repeated grep and file-reading loops.

## Best For

- Large repositories where agents repeatedly ask structural codebase questions

## Recommended When

- Use when structural codebase questions dominate and the team can audit local indexing behavior first.

## Review Notes

Trust tier: promising. Review status: manual-reviewed. Permissions: filesystem, local-server. Risk flags: reads-local-code, writes-agent-config, stores-local-index, early-stage.

Sources:
- https://github.com/DeusData/codebase-memory-mcp
- https://deusdata.github.io/codebase-memory-mcp/
- https://arxiv.org/abs/2603.27277
