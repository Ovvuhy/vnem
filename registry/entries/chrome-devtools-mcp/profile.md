# chrome-devtools-mcp

MCP server for Chrome DevTools Protocol.

- **Repository:** https://github.com/ChromeDevTools/chrome-devtools-mcp
- **Package:** https://www.npmjs.com/package/chrome-devtools-mcp
- **License:** Apache-2.0
- **Trust Tier:** promising

## What it does

Exposes Chrome DevTools Protocol (CDP) capabilities to coding agents through the Model Context Protocol. This lets an agent drive a browser for:

- Page inspection and DOM traversal
- Console log access
- Network request monitoring
- Screenshot capture
- Performance profiling

## Why builders should care

Useful for agents that need to debug web applications, run headless browser tests, or interact with a running browser during development workflows. Officially maintained by Google.

## Install

```bash
npx chrome-devtools-mcp
```

## Relations

- See `playwright-mcp` for another browser-focused MCP option.
