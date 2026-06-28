# nx-mcp

MCP server for Nx monorepo workspace management.

- **Repository:** https://github.com/nrwl/nx
- **Package:** https://www.npmjs.com/package/nx-mcp
- **License:** MIT
- **Trust Tier:** promising

## What it does

Exposes Nx monorepo capabilities to coding agents through MCP. Provides:

- Workspace graph navigation (projects, targets, dependencies)
- Affected-graph analysis (what changed since last commit?)
- Task discovery and execution
- Project configuration reading

## Why builders should care

Useful for coding agents working in monorepos using Nx. Helps an agent understand the workspace structure before editing files or running tasks, and reason about what tests/builds are safe to run after a change.

## Install

```bash
npx nx-mcp
```

## Relations

- Related to monorepo and build-tooling workflows.
