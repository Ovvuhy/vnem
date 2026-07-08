# vnem Precision Execution Protocol

Generated: 2026-07-08T14:19:23.600Z

An opt-in mutation-capable execution protocol for preventing destructive editing and knowledge decay through exact patch verification, current documentation context, and bounded terminal feedback.

## Safety Boundary

- This file describes an opt-in precision execution layer. It is not enabled by the default read-only VNEM MCP server.
- Use the default `vnem` MCP server first for read-only recommendations, quality gates, orchestration plans, and source routing.
- Use `vnem-precision` only when the user or project explicitly allows mutation-capable tools for the active workspace.
- The precision server must never bypass the connected client's normal approvals, repository permissions, or user review.

## Tool Contracts

### mcp_apply_diff_patch

Type: `mutation`

Use when: A worker needs to change a file and can provide a narrow SEARCH/REPLACE block or unified diff hunk.

Contract: Read the target, verify exact context, reject mismatches, dry-run by default, then write atomically only when explicitly applied.

### mcp_fetch_documentation

Type: `read_with_network`

Use when: A worker needs current framework, library, engine, or API syntax before writing code.

Contract: Fetch HTTPS docs, normalize them into compact context, record the source hash, and inject the context before code is written.

### mcp_execute_terminal_command

Type: `bounded_execution`

Use when: A worker needs build, test, lint, typecheck, or verification feedback.

Contract: Run one allowlisted non-interactive command in a workspace-confined cwd, capture stdout/stderr, and timeout gracefully.

## AST-Aware Surgical Patching

VNEM's scalpel rule is strict: change only the intended region, verify the old context exactly, and reject the patch when context has drifted.

- Do not rewrite an entire file to change one function.
- Use mcp_apply_diff_patch with dry_run=true before a real apply.
- Require exact SEARCH matches or exact unified-diff hunk context; if matching fails, re-read the file and retry with correct context.
- Keep patches inside the active workspace and block .git internals, binary files, symlink escapes, and traversal attempts.
- Report before/after hashes, changed ranges, and whether the patch was dry-run or applied.

Required patch flow:

1. Re-read the target file or function immediately before patching.
2. Build a narrow SEARCH/REPLACE block or unified diff hunk.
3. Call `mcp_apply_diff_patch` with `dry_run=true`.
4. Review the match count, changed ranges, and before/after hashes.
5. Apply with `dry_run=false` only after the dry run matches the task and approvals.
6. Run focused verification and report the evidence.

## Autonomous Knowledge Ingestor

Agents must not guess framework syntax when current documentation matters.

- Do not rely on memory for framework APIs when current docs matter.
- Fetch official or explicitly supplied HTTPS documentation before writing framework-specific code.
- Inject the documentation excerpt into the worker's active context and cite the URL/hash in the worker report.
- Block write attempts that declare required_documentation until those docs have been fetched for the worker/task.

Required documentation flow:

1. Identify framework/library/API names during Analyze or Architect.
2. Call `mcp_fetch_documentation` for each library that affects code syntax, component APIs, engine setup, or build behavior.
3. Put the returned `context_injection` block into the worker's active task context.
4. If a patch declares `required_documentation`, block the patch until the required docs are recorded for the same worker/task.
5. Prefer fetched docs over memory when syntax conflicts.

## Stateful Terminal Execution

Terminal feedback is for bounded verification. It is not a general-purpose shell.

- Use terminal execution for feedback, not as a general shell.
- Allow only single build/test/check commands; block pipes, redirection, command chaining, deploys, installs, cleanup scripts, and destructive shell commands.
- Keep cwd state inside the workspace, capture stdout/stderr, and return timeout status instead of hanging the agent.
- Treat failed, blocked, or timed-out commands as evidence that the plan must be revised.

Allowed command classes:

- Package-manager build/test/check scripts such as `npm run build`, `npm test`, `pnpm run test`, or `yarn run typecheck`.
- Static checks such as `node --check file.js`.
- Read-only Git inspection such as `git status`, `git diff`, `git log`, or `git show`.
- Language test/check commands such as `cargo test`, `cargo check`, `go test`, `python -m pytest`, or `pytest`.

Blocked command classes:

- Shell chaining, pipes, redirection, backticks, and interactive shell launchers.
- Package installs, deploys, publish/release scripts, cleanup scripts, destructive file operations, registry edits, system commands, and commands outside the workspace.

## Relationship To VNEM

- `.vnem/quality-contract.md` defines the quality bar.
- `.vnem/orchestration-protocol.md` decides whether the task needs single-agent, worker orchestration, split-and-merge research, or reflection.
- `.vnem/coding-protocol.md` defines repo sensing, small diffs, approval gates, verification, and final reporting.
- This precision protocol defines the optional execution tools for exact patching, dynamic docs, and terminal feedback.

## Source URLs

- https://modelcontextprotocol.io/specification/2025-11-25/schema
- https://modelcontextprotocol.io/specification/2025-06-18/server/tools
- https://blog.modelcontextprotocol.io/posts/2026-03-16-tool-annotations/
- https://www.anthropic.com/engineering/writing-tools-for-agents
- https://code.claude.com/docs/en/best-practices
- https://developers.openai.com/codex/guides/agents-md
- https://context7.com/
- https://www.anthropic.com/engineering/claude-code-best-practices
- https://openai.com/business/guides-and-resources/how-openai-uses-codex/
- https://docs.github.com/en/copilot/tutorials/cloud-agent/get-the-best-results
- https://docs.github.com/en/copilot/concepts/prompting/response-customization
- https://code.visualstudio.com/docs/copilot/customization/custom-instructions
- https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/configuration.md
- https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/auto-memory.md
- https://docs.cursor.com/context/rules-for-ai
- https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
- https://www.anthropic.com/engineering/building-effective-agents
- https://developers.openai.com/api/docs/guides/agent-evals
