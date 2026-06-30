# trpc-agent-go

A Go framework for building production agent systems with graph workflows, tools, memory, A2A, AG-UI, MCP, evaluation, and observability.

- **Repository:** https://github.com/trpc-group/trpc-agent-go
- **Docs:** https://trpc-group.github.io/trpc-agent-go/
- **License:** Apache-2.0
- **Trust Tier:** promising

## What it does

Provides a production-grade Go framework for building agent systems that covers:

- Graph-based workflow orchestration
- Tool integration and memory management
- A2A (Agent-to-Agent) protocol support
- AG-UI protocol for agent-user interfaces
- MCP (Model Context Protocol) server and client
- Built-in evaluation and benchmarking
- OpenTelemetry-native observability and tracing

## Why builders should care

This is the first Go-native agent framework that covers the full production stack: workflows, multi-protocol support (MCP, A2A, AG-UI), evaluation, and observability. It fills a genuine gap for Go-speaking teams who currently lack a framework comparable to LangGraph or CrewAI.

## Install

```bash
go get github.com/trpc-group/trpc-agent-go
```

## Relations

- Alternative to langgraph and crewai for Go-based agent systems
- Complements MCP ecosystem as both server and client
- Supports A2A interop with Google Agent2Agent protocol agents
