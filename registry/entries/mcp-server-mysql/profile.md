# MCP Server MySQL

MCP Server MySQL provides MCP access to MySQL schemas and queries with read-only defaults, explicit write-operation gates, remote mode, rate limits, query complexity controls, and connection pooling.

## Best For

- Development databases where read-only schema and query access can speed backend work

## Recommended When

- Use only with read-only defaults, development data, and explicit approval before enabling writes.

## Review Notes

Trust tier: unreviewed. Review status: manual-reviewed. Permissions: database, network. Risk flags: database-access, requires-secrets, write-gates-available, community-maintained.

Sources:
- https://github.com/benborla/mcp-server-mysql
