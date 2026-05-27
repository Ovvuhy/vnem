# vnem Agentic Security Roadmap

This document reviews the proposal to turn vnem into a zero-trust pre-execution gateway, tool-schema pinning layer, package firewall, and AST code graph indexer.

[ARCHITECTURAL OBJECTION]

Do not implement the proposal as a direct repo restructure into a new Rust runtime today.

The current repository is a Node-based registry, generator, read-only install pack, optional stdio MCP server, and static site. Replacing it with `Cargo.toml`, `src/security/*`, `src/context/*`, and `src/indexer/*` would remove the working product surface, invalidate the current install flow, and create a high-risk runtime security product before the threat model, compatibility matrix, and adversarial tests exist.

The correct direction is phased:

1. Keep the vnem install pack read-only.
2. Encode gateway and firewall decisions as guidance, routes, and prompt patterns first.
3. Add deterministic advisory checks before any live interception.
4. Build any runtime gateway as a separate reviewed surface only after threat modeling.

## Prompt Review

The submitted prompt has strong product instincts:

- classify read-only vs mutating tool calls
- preserve high-level user intent before execution
- redact secrets from logs
- confine paths to the active workspace
- detect MCP tool schema drift
- review dependency additions before install
- index code structurally instead of forcing agents to repeatedly rediscover the repo
- test adversarial agent behavior

The unsafe parts are the scope and enforcement claims:

- It asks for a full Rust rewrite without proving why the existing Node generator and MCP server should be replaced.
- It mixes guidance, runtime interception, package registry calls, secret handling, AST indexing, and LLM-assisted risk scoring in one change.
- It assumes unverified components such as an "Intaris-based interceptor" without a recorded source or dependency review.
- It treats future controls as if they already enforce security. Vnem currently provides read-only guidance; it does not own the agent host, shell, filesystem sandbox, or MCP client approval layer.
- It asks for "under 1ms" read-command execution without a benchmark target, execution environment, or measurement harness.

## Safe Subset To Implement Now

The safe, product-aligned subset is:

- Add Vnem search intents for `pre execution gateway`, `zero trust gateway`, `tool pinning`, `package firewall`, and `ast indexer`.
- Add a decision playbook that tells agents to reject all-at-once runtime rewrites and classify each idea as guidance, advisory analysis, deterministic enforcement, or separate runtime enforcement.
- Add best-practice guidance for schema hashing, secret redaction, path confinement, dependency manifest review, and read-only AST indexing.
- Add a prompt pattern that turns future ambitious gateway proposals into phased plans with explicit non-goals and tests.
- Add source-radar entries for MCP tool annotations, tool-list change notifications, secret scanning, and package provenance.

This improves Vnem's core product without adding a daemon, shell proxy, filesystem writer, package installer, or hidden runtime behavior.

## Deferred Runtime Scope

These items should not be implemented inside the read-only install pack:

- shell command interception
- JSON-RPC proxying for arbitrary agent hosts
- automatic blocking of tool calls
- live package registry firewall checks
- durable code graph database writes
- LLM-assisted risk scoring that claims to enforce security
- secret storage or audit logging of raw tool arguments

If Vnem later ships a runtime gateway, it should be a separate package or service with its own threat model, tests, release process, and explicit user opt-in.

## Phased Plan

### Phase 1: Advisory Gateway Layer

- Publish the gateway review playbook in generated artifacts.
- Route relevant intents to source radar, security guidance, and MCP-selection guidance.
- Keep all outputs advisory and read-only.
- Add tests that prove the install pack contains the guidance and search routes.

### Phase 2: Deterministic Local Checks

- Add a local, opt-in command that can analyze a proposed action without executing it.
- Check resolved paths against the workspace root.
- Redact obvious tokens, private keys, connection strings, and high-entropy arguments before printing diagnostics.
- Hash tool schemas from a static MCP client export and report drift.
- Review dependency manifest diffs without installing packages.

### Phase 3: Read-Only AST Graph Prototype

- Add a read-only index command that extracts symbols, imports, and file relationships into a disposable local artifact.
- Start with one language family and small fixtures.
- Use monotonic source ordinals for incremental updates.
- Soft-delete missing files instead of deleting graph nodes immediately.

### Phase 4: Runtime Gateway Pilot

- Build a separate runtime only if Phases 1-3 show value.
- Require a threat model before implementation.
- Require explicit user approval for every mutating class of action.
- Treat MCP tool annotations as hints, not enforcement.
- Keep a bypass and rollback path for false positives.

## Required Tests Before Runtime Enforcement

- directory traversal outside the workspace is rejected after path resolution
- logs redact secrets before persistence
- a tool schema hash change forces review
- dependency additions with suspicious names are flagged before install
- malicious test hooks such as `conftest.py` rewrites are treated as high-risk writes
- out-of-order index writes do not corrupt the graph state
- generated Vnem install artifacts remain read-only

## Source Anchors

- MCP tool annotations: https://blog.modelcontextprotocol.io/posts/2026-03-16-tool-annotations/
- MCP schema reference: https://modelcontextprotocol.io/specification/2025-06-18/schema
- MCP TypeScript `ToolAnnotationsSchema`: https://ts.sdk.modelcontextprotocol.io/variables/types.ToolAnnotationsSchema.html
- GitHub secret scanning overview: https://docs.github.com/en/code-security/secret-scanning/introduction/about-secret-scanning
- npm registry signatures: https://docs.npmjs.com/about-registry-signatures
