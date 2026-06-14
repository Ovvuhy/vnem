# vnem Omniscient Context And Self-Healing Protocol

Generated: 2026-06-14T11:33:41.166Z

An opt-in precision-server protocol for reducing scale blindness and silent logic failures with local semantic code search, red/green verification loops, and sandboxed ephemeral scripts.

## Safety Boundary

- This file describes opt-in tools on the mutation-capable precision server. The default VNEM MCP server remains read-only.
- The semantic index is local and private; it does not call external embedding APIs.
- Verification tests provide executable evidence, not absolute mathematical proof. Report residual coverage risk honestly.
- Ephemeral scripts are temporary helpers, not a general shell, installer, deploy path, or persistent automation system.

## Tool Contracts

### mcp_semantic_code_search

Type: `read_only_local_index`

Use when: A worker needs to locate code by concept, behavior, or responsibility before reading files in a large workspace.

Contract: Use a local private code index to return exact file paths, line ranges, snippets, matched terms, and scores without external embedding APIs.

### mcp_run_verification_tests

Type: `bounded_execution`

Use when: A worker needs executable proof that a feature, bug fix, or logic change works before reporting success.

Contract: Run a safe verification command in red, green, or check phase; track attempts by task id; return pass, red_confirmed, needs_healing, or blocked after max five attempts.

### mcp_execute_ephemeral_script

Type: `temporary_sandboxed_execution`

Use when: A worker hits a narrow roadblock that needs a one-off local parser, transformer, or data-inspection helper.

Contract: Run a short Node/Python helper in an isolated temporary cwd with sanitized env, dangerous APIs blocked, stdout/stderr captured, timeout enforced, and cleanup reported.

## Local RAG And Semantic Codebase Embeddings

The goal is to stop agents from wasting context windows on blind directory traversal.

- Build or refresh the local code index when the precision server boots or when watched files change.
- Index text/code files only; skip .git, node_modules, build outputs, runtime caches, binary files, and oversized files.
- Chunk files with line numbers and store deterministic local vectors plus snippets in .vnem-runtime instead of calling paid or external embedding APIs.
- Use semantic search to identify candidate files, then read the returned file ranges before patching or reasoning about exact behavior.
- Treat semantic scores as retrieval signals, not ground truth. Verify with direct file reads and tests.

Required retrieval flow:

1. Ask `mcp_semantic_code_search` for the concept, behavior, component, risk, or responsibility.
2. Inspect the returned paths, line ranges, snippets, and scores.
3. Read the exact source range before making claims or writing patches.
4. Use targeted `rg`/file reads for exact symbols after semantic search narrows the surface.

## Test-Driven Self-Healing

The proof engine exists to stop silent logic failures before the human user finds them.

- Before adding new feature or logic code, write or select the automated test that represents the user's acceptance criteria.
- Prefer a red phase that fails before implementation; a test that passes before code changes is not proof of the missing behavior.
- Patch with mcp_apply_diff_patch only after a failing test or confirmed bug reproduction, then rerun the verification command.
- Repeat patch-and-test only until the command passes or the hard max-attempt limit is reached.
- If the loop blocks, report the failing command, attempt count, stdout/stderr summary, and the smallest human decision needed.

Required red/green flow:

1. Create or identify the automated test that represents the requested behavior.
2. Run `mcp_run_verification_tests` with `phase=red` when the test should fail before implementation.
3. Use `mcp_apply_diff_patch` for the smallest exact patch.
4. Run `mcp_run_verification_tests` with `phase=green`.
5. If it returns `needs_healing`, patch again only with failure evidence.
6. If it returns `blocked`, stop and ask for human intervention with concrete evidence.

## Ephemeral Scripting

Dynamic helpers are allowed only when a unique roadblock would otherwise waste context or manual effort.

- Use ephemeral scripts for unique local roadblocks, not as a replacement for durable project tooling.
- Keep scripts small, deterministic, and local; do not use secrets, network APIs, process spawning, destructive filesystem operations, or shell control tricks.
- Run scripts from a temporary sandbox and delete the script/sandbox after execution.
- Promote a helper into a reviewed repo script only if the same need repeats and the user approves durable tooling.

## Worker Prompt Additions

- Before manual repo traversal, call mcp_semantic_code_search with the concept you need.
- Before feature or logic code, create or identify the failing automated test and run mcp_run_verification_tests with phase=red when possible.
- After every patch, rerun mcp_run_verification_tests with phase=green and stop only on pass or blocked.
- Use mcp_execute_ephemeral_script only for short local roadblocks and report cleanup status.

## Relationship To VNEM

- `.vnem/quality-contract.md` defines the holistic quality bar.
- `.vnem/orchestration-protocol.md` decides when work needs multiple agents or reflection.
- `.vnem/precision-execution-protocol.md` defines exact patching, dynamic documentation, and terminal boundaries.
- This protocol adds local semantic context, test-first healing loops, and temporary dynamic helper scripts.

## Source URLs

- https://www.anthropic.com/engineering/building-effective-agents
- https://www.anthropic.com/engineering/writing-tools-for-agents
- https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
- https://code.claude.com/docs/en/best-practices
- https://developers.openai.com/codex/guides/agents-md
- https://modelcontextprotocol.io/specification/2025-11-25/schema
- https://modelcontextprotocol.io/specification/2025-06-18/server/tools
- https://github.com/DeusData/codebase-memory-mcp
- https://github.com/qdrant/mcp-server-qdrant
- https://blog.modelcontextprotocol.io/posts/2026-03-16-tool-annotations/
- https://context7.com/
- https://www.anthropic.com/engineering/claude-code-best-practices
- https://openai.com/business/guides-and-resources/how-openai-uses-codex/
- https://docs.github.com/en/copilot/tutorials/cloud-agent/get-the-best-results
- https://docs.github.com/en/copilot/concepts/prompting/response-customization
- https://code.visualstudio.com/docs/copilot/customization/custom-instructions
- https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/configuration.md
- https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/auto-memory.md
- https://docs.cursor.com/context/rules-for-ai
- https://developers.openai.com/api/docs/guides/agent-evals
