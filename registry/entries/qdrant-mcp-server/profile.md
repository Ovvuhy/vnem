# Qdrant MCP Server

Qdrant MCP Server is Qdrant's official MCP implementation for storing and retrieving semantic memory in Qdrant collections through store and find tools.

## Best For

- Teams already using Qdrant or needing a small MCP memory layer

## Recommended When

- Use when stored memories are reviewed, scoped, and safe to persist in a vector database.

## Review Notes

Trust tier: promising. Review status: manual-reviewed. Permissions: database, network. Risk flags: database-access, memory-can-leak-sensitive-context, embedding-model-dependency.

Sources:
- https://github.com/qdrant/mcp-server-qdrant
