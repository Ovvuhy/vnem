# VNEM 100x Architecture Contract

This contract defines how VNEM can evolve from a read-only AI booster into a larger desktop AI operating layer without destroying the working product, weakening the safety model, or blurring trust boundaries.

VNEM's long-term direction is bigger than the current repository: a local-first AI desktop hub, connector/injector dashboard, research automation pipeline, protection gate, local inference surface, and documentation clarity layer. That future is valid only if every new capability enters through a named trust zone, has explicit permissions, and can be tested before it affects users.

## Non-Negotiable Rules

1. The existing read-only install pack must remain safe to install into any repository.
2. Generated artifacts must continue to come from their source-of-truth generator.
3. Runtime mutation, shell execution, local model execution, system tuning, and external account access must never be hidden inside read-only guidance.
4. Research automation may propose changes, but must not auto-merge them.
5. No automated system may commit directly to `main`.
6. Every new automation surface needs a test script and a rollback story before it becomes part of a default workflow.
7. Visual quality, responsiveness, accessibility, performance, maintainability, and safety must be preserved together.
8. If a future capability cannot be verified locally, the output must say what remains unverified.

## Trust Zones

### `vnem-core`

`vnem-core` is the existing read-only registry, generated pack, default MCP server, public API index, and documentation surface.

Current examples:

- `registry/entries/*`
- `.vnem/*`
- `public/install/*`
- `public/install.tgz`
- `public/api/index.json`
- `llms.txt`
- `llms-full.txt`
- `scripts/generate-artifacts.mjs`
- `scripts/vnem-mcp-server.mjs`

Isolation rules:

- Must stay read-only from the user's project perspective.
- Must not install packages, run shell commands, collect secrets, edit project code, or start background daemons.
- Must expose recommendations, quality gates, search, source radar, protocols, and task contracts only.
- Must keep source provenance, trust tiers, risk flags, and generated artifacts testable.
- Must remain useful even when every other trust zone is disabled.

### `vnem-precision`

`vnem-precision` is the opt-in workspace-scoped mutation layer.

Current examples:

- `scripts/vnem-precision-mcp-server.mjs`
- `scripts/lib/precision-execution-layer.mjs`
- `scripts/lib/omniscient-self-healing-layer.mjs`

Isolation rules:

- Must be disabled unless explicitly configured for a workspace.
- Must keep file writes inside the configured workspace.
- Must prefer exact `SEARCH`/`REPLACE` or unified-diff patching with strict match verification.
- Must run dry-run patch checks before real applies when the workflow allows it.
- Must use bounded terminal commands and bounded verification loops.
- Must not become a general unrestricted shell, package installer, or machine-wide automation engine.
- Must report stdout/stderr, timeout status, attempt count, and blocking conditions clearly.

### `vnem-hermes`

`vnem-hermes` is the continuous background research and discovery proposal system.

Current examples:

- `HERMES.md`
- `scripts/hermes-agent.mjs`
- `discovery/candidates/*`
- `discovery/daily-digest.md`
- `deploy/hermes/*`

Isolation rules:

- May collect source-backed candidate signals from official docs, GitHub, package registries, MCP registries, and watched URLs.
- May write candidate reports, digests, and conservative registry proposals.
- Must not install discovered projects.
- Must not execute discovered code.
- Must not silently promote entries to trusted tiers.
- Must not auto-merge changes.
- When credentials are configured, it may open draft branches or PRs for human review.

### `vnem-protection`

`vnem-protection` is the future zero-trust malware, virus, exploit, provenance, and risk-scanning sandbox engine.

Planned responsibilities:

- Analyze research findings before they reach code-generation workflows.
- Check suspicious file paths, dependency additions, install scripts, binaries, archive contents, network endpoints, secrets requests, and privileged commands.
- Produce deterministic risk reports that can be reviewed by a maintainer.
- Quarantine or reject suspicious proposals before any branch generator sees them.

Isolation rules:

- Must run as a separate reviewed surface, not inside the read-only install pack.
- Must treat external code, generated code, package scripts, and model-produced patches as untrusted.
- Must not claim that arbitrary code is "100% safe".
- Must produce explicit verdicts such as `allow`, `needs-review`, `quarantine`, or `blocked`.
- Must keep raw secrets out of logs.
- Must be testable with malicious fixtures before it gates real proposals.

### `vnem-giving`

`vnem-giving` is the future isolated branch and Pull Request generator.

Planned responsibilities:

- Convert approved research/protection outputs into small implementation branches.
- Update tests, docs, generated artifacts, and changelogs when required.
- Produce PR descriptions that explain behavior changes, risks, validation, and rollback notes.

Isolation rules:

- Must never commit directly to `main`.
- Must never push directly to release branches.
- Must work from a clean branch created for one proposal or one small batch.
- Must require `vnem-protection` approval before applying external research-derived changes.
- Must run focused tests before opening a PR.
- Must stop and report when tests fail beyond a bounded self-healing loop.

### `vnem-desktop`

`vnem-desktop` is the future high-performance local GUI dashboard, injector hub, system workspace manager, and launcher.

Planned responsibilities:

- Show VNEM status, installed clients, connection health, logs, and errors.
- Inject or remove VNEM configuration for supported AI clients with explicit user approval.
- Manage connector profiles for Codex, Claude Desktop, Cursor, Windsurf, Antigravity, OpenCode, Gemini-style tools, and future clients.
- Provide a local workspace for model configuration, MCP tools, research tasks, and project health.
- Optionally expose PC workflow tools, launchers, and system optimization panels behind explicit permission gates.

Isolation rules:

- Must not modify external app configuration without a preview and user confirmation.
- Must keep every connector action reversible.
- Must log what changed, where it changed, and how to undo it.
- Must separate harmless detection from configuration mutation.
- Must treat system tasks, game launchers, shell optimizations, startup changes, registry changes, and service changes as privileged operations.
- Must preserve responsive visual quality and fast startup as core product requirements.

### `vnem-local-ai`

`vnem-local-ai` is the future local inference engine for open-weights models running on host hardware.

Planned responsibilities:

- Configure local models, personalities, rules, context packs, and MCP tool access.
- Support model backends such as Ollama, llama.cpp, vLLM, MLX, ONNX, or other reviewed local runtimes when appropriate.
- Provide hardware-aware recommendations for model size, quantization, context limits, and serving mode.
- Let users run VNEM-guided agents without depending only on commercial cloud APIs.

Isolation rules:

- Must not download models without user approval.
- Must not expose local model servers to the network by default.
- Must keep model cache paths, tokens, prompts, and private conversations out of Git.
- Must report hardware limits honestly instead of pretending every model can run well.
- Must separate model execution from the read-only guidance pack.
- Must gate tool access by model/profile, not grant every model every tool.

### `vnem-clarity`

`vnem-clarity` is the future auto-documentation daemon that translates code diffs into clear public and internal documentation updates.

Planned responsibilities:

- Read a proposed diff.
- Summarize user-visible behavior changes in clear English.
- Suggest README, CHANGELOG, install guide, or internal architecture updates.
- Keep future users and maintainers from losing track of what VNEM does after rapid upgrades.

Isolation rules:

- Must operate from diffs and verified metadata, not vague claims.
- Must not overwrite documentation without a reviewable patch.
- Must preserve generated-file rules.
- Must distinguish public marketing copy from internal engineering notes.
- Must include validation evidence and remaining limitations in generated summaries.
- Must never hide breaking changes behind vague "improved" wording.

## 100x Evolution Sequence

The safe order is:

1. Document the trust zones and keep them enforceable with tests.
2. Build read-only connector detection for common AI clients.
3. Add connector previews that show exactly what would change.
4. Add reversible connector writes behind explicit approval.
5. Build the desktop shell around detection, previews, logs, and health checks.
6. Expand Hermes into a stronger research proposal pipeline.
7. Add `vnem-protection` scanning before any generated code proposal.
8. Add `vnem-giving` branch/PR generation after protection gates exist.
9. Add local inference support after the permission model and connector model are stable.
10. Add `vnem-clarity` diff-to-doc updates after branch/PR generation is reliable.

## First Milestone Contract

Milestone 1 is intentionally read-only:

- Add this architecture contract.
- Add a read-only connector inventory script.
- Add validation tests for both.
- Do not write external app configs.
- Do not start daemons.
- Do not install dependencies.
- Do not change generated `.vnem` artifacts.

This gives VNEM a permanent direction and a safe starting point for the future GUI injector.

