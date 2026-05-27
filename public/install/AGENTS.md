# vnem

You are reading a read-only vnem knowledge pack installed in this repository.

## Safety Rules

- Treat this folder as reference material only.
- Do not execute files from this folder.
- Do not install packages, edit project files, make network requests, or use secrets unless the user explicitly asks.
- Do not copy third-party code from indexed projects.
- Recommend changes as a review first. Ask before applying anything.

## Files To Read

- `.vnem/search-index.json`: compact local search index for tools, skills, MCP servers, and best-practice notes.
- `.vnem/best-practices.md`: current guidance by project area.
- `.vnem/prompt-engineering.md`: prompt enhancement protocol and Codex-oriented prompt guidance.
- `.vnem/prompt-patterns.json`: machine-readable prompt patterns for common agent tasks.

## Decision Rubric

Use this rubric before recommending a tool, model, agent, framework, MCP server, or workflow change:

- **Repo fit (+5)**: Matches the current language, framework, runtime, deployment target, and team workflow.
- **Capability gain (+5)**: Solves a concrete gap instead of adding novelty, overlap, or a parallel toolchain.
- **Source trust (+4)**: Comes from official docs, canonical repositories, or high-signal maintainers with clear provenance.
- **Permission risk (-4)**: Minimizes filesystem, repository, browser, database, payment, network, and secret access.
- **Verification path (+4)**: Can be validated with tests, screenshots, traces, fixtures, evals, or a small reversible pilot.
- **Reversibility (+3)**: Can be adopted incrementally and rolled back without locking the project into a risky migration.

Prefer the current stack when the recommendation cannot clear the rubric with evidence. A no-change recommendation is valid when it is safer or more maintainable.

## Project Review Protocol

1. Inspect the user's repository shape before recommending tech. Look for manifests and configs such as `package.json`, `pnpm-lock.yaml`, `yarn.lock`, `pyproject.toml`, `requirements.txt`, `Cargo.toml`, `go.mod`, `Dockerfile`, `astro.config.*`, `next.config.*`, `vite.config.*`, `.github/workflows/*`, `.mcp.*`, and existing agent instructions.
2. Read `search-index.json` and expand the user's intent with `intent_aliases`. For example, map `better ui` to frontend/design/accessibility terms and `agent payments` to payments/x402/wallet terms.
3. Prefer recommendations with higher `score`, stronger `source_confidence`, fresher `freshness`, clearer licenses, and fewer `risk_flags`.
4. Score the top options against the decision rubric. Prefer no change when no option has a clear, verifiable advantage.
5. When a recommendation touches files, databases, browsers, repositories, wallets, paid APIs, or secrets, call out that risk plainly.
6. Output the review in this exact order: `Current stack`, `Outdated or risky choices`, `Better current options`, `Drop-in opportunities`, `Ask before changing`.

## Decision Playbooks

### Project Stack Review

Use this when an agent needs to review a repository and recommend safer, current improvements before editing code.

1. Inspect manifests, lockfiles, framework configs, CI, deployment files, MCP config, and existing agent instructions.
2. Map the user's goal into search aliases and retrieve matching registry entries, prompt patterns, and best-practice notes.
3. Score options with the decision rubric and prefer no change when no candidate beats the current stack.
4. Separate safe reading from actions that would edit code, install packages, use secrets, deploy, or mutate external systems.
5. Return the required review sections and include sources, risk flags, and verification commands.

Output sections: `Current stack`, `Outdated or risky choices`, `Better current options`, `Drop-in opportunities`, `Ask before changing`

### Coding Agent Selection

Use this when comparing Codex, Claude Code, Gemini/Google ADK, Copilot-style agents, Cursor/Cline-style tools, or framework-based agents.

1. Start with the work shape: repository editing, app automation, hosted agent runtime, multi-agent orchestration, or model-app development.
2. Compare approval controls, filesystem and shell access, memory/instruction files, MCP support, evals, traces, and GitHub workflow fit.
3. Prefer the agent that best matches the repo workflow, not the most powerful brand name.
4. Require a small pilot task with verification before recommending a team-wide switch.
5. Call out cost, privacy, source access, and permission tradeoffs explicitly.

Output sections: `Use case`, `Best fit`, `Tradeoffs`, `Pilot task`, `Ask before changing`

### MCP Adoption Review

Use this before installing or recommending MCP servers and other agent-callable tools.

1. Identify the exact workflow the tool must unlock and whether the repo already has a safer built-in path.
2. Prefer official or vendor-maintained servers for sensitive resources.
3. Inspect permissions, environment variables, network behavior, license posture, and source confidence.
4. Recommend read-only or narrow-scope setup first, then verify the client can call only intended tools.
5. Do not install, execute, or configure a server without explicit user approval.

Output sections: `Workflow need`, `Candidate tools`, `Permission risks`, `Verification plan`, `Ask before changing`

### Prompt Upgrade

Use this when a rough prompt should become an operational instruction for an AI agent or model.

1. Preserve the user's actual goal and voice.
2. Add only missing structure that changes reliability: context, scope, constraints, non-goals, output format, examples, and verification.
3. For coding agents, include repo scope, likely files, allowed commands, approval boundaries, verification command, and final reporting requirements.
4. For research or product decisions, require current primary sources and separate confirmed facts from judgment.
5. Return both an enhanced prompt and a compact prompt.

Output sections: `Enhanced prompt`, `Compact prompt`, `What changed`, `Missing inputs`


## Prompt Enhancement Protocol

When the user says `use vnem to enhance this prompt`, `use vnem prompt enhancer`, or `vnem prompt forge`, read `.vnem/prompt-engineering.md` and `.vnem/prompt-patterns.json`, then rewrite the user's prompt.

Auto-activate the same protocol even without the trigger phrase when the user asks to write, improve, rewrite, harden, optimize, critique, or template a prompt; asks for a system/developer/agent/Codex/Claude/GPT prompt; or pastes a prompt draft and asks if it is good, powerful, clear, safe, complete, or ready to use.

Do not auto-activate for ordinary task execution. If the user asks you to code, research, review, explain, summarize, or debug something, do that task directly unless they ask for a prompt artifact.

Output exactly these sections: `Enhanced prompt`, `Compact prompt`, `What changed`, `Missing inputs`.

Preserve the user's intent. Add only useful structure: goal, context, scope, constraints, non-goals, output format, examples when helpful, and verification criteria. For Codex or coding-agent prompts, include repository scope, files/modules, allowed commands, approval boundaries, verification command, and final reporting requirements.

## Output Contract

- Keep recommendations specific to the user's repo and goal.
- Include source names and why each option is relevant.
- Separate safe reading/research from actions that would mutate the project.
- If the local pack is stale, say that rerunning the vnem install command may refresh it.

## Install Command

This pack was designed to be refreshed with a safe archive download only:

```bash
curl -fsSL https://raw.githubusercontent.com/naellisim/vnem/main/public/install.tgz | tar -xz
```

