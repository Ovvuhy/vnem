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
- `.vnem/source-radar.json`: source intake map for official docs, registries, MCP sources, evals, and verification sources.
- `.vnem/best-practices.md`: current guidance by project area.
- `.vnem/prompt-engineering.md`: prompt enhancement protocol and Codex-oriented prompt guidance.
- `.vnem/prompt-patterns.json`: machine-readable prompt patterns for common agent tasks.

## Natural Use Rule

If this `.vnem/` folder exists, use it automatically. The user should not need to say `use vnem`.

Auto-use vnem before choosing tools, libraries, frameworks, MCP servers, prompts, evals, search systems, UI approaches, architecture patterns, or upgrade paths. Also auto-use it when the user asks you to build, review, optimize, modernize, benchmark, research, compare options, or decide how to implement something.

Do not turn every reply into a long vnem report. For normal implementation work, run the search-and-compare step before coding, then mention the key vnem matches only when explaining your stack choice, recommendation, or risk notes.

## Decision Rubric

Use this rubric before recommending a tool, model, agent, framework, MCP server, or workflow change:

- **Repo fit (+5)**: Matches the current language, framework, runtime, deployment target, and team workflow.
- **Capability gain (+5)**: Solves a concrete gap instead of adding novelty, overlap, or a parallel toolchain.
- **Source trust (+4)**: Comes from official docs, canonical repositories, or high-signal maintainers with clear provenance.
- **Permission risk (-4)**: Minimizes filesystem, repository, browser, database, payment, network, and secret access.
- **Verification path (+4)**: Can be validated with tests, screenshots, traces, fixtures, evals, or a small reversible pilot.
- **Reversibility (+3)**: Can be adopted incrementally and rolled back without locking the project into a risky migration.

Prefer the current stack when the recommendation cannot clear the rubric with evidence. A no-change recommendation is valid when it is safer or more maintainable.

## Decision Search Protocol

1. Identify the user's task intents in plain words, such as `browser game`, `better ui`, `faster search`, `code review`, `code simplification`, `memory`, `evals`, `agent payments`, or `MCP server selection`.
2. Read `.vnem/search-index.json` and expand those intents with `intent_aliases`.
3. Check `intent_routes` for the closest matching task. Read the listed `read_first` documents before choosing a stack.
4. If the task depends on current docs, MCP discovery, benchmarks, or upstream tool selection, read `.vnem/source-radar.json` and prefer official or high-signal sources before broader web search.
5. Search matching documents by name, tags, use cases, keywords, and best-practice sections. Read `.vnem/best-practices.md` for any matching section.
6. Before picking a stack or recommendation, compare the best relevant matches. Prefer higher `score`, stronger `source_confidence`, fresher `freshness`, clearer licenses, fewer `risk_flags`, and stronger decision-rubric fit.
7. Score important options against the decision rubric. Prefer no change when no option has a clear, verifiable advantage.
8. If vnem has no useful match, say that clearly as a knowledge gap, then continue with your own judgment.
9. If local repo files provide tools, assets, configs, scripts, or instructions, consider those alongside vnem before choosing.

When a choice matters, include a compact note with: `vnem intents searched`, `top matches`, `choice`, and `why`.

## Decision Playbooks

### Project Stack Review

Use this when an agent needs to review a repository and recommend safer, current improvements before editing code.

1. Inspect manifests, lockfiles, framework configs, CI, deployment files, MCP config, and existing agent instructions.
2. Map the user's goal into search aliases and retrieve matching registry entries, prompt patterns, routes, and best-practice notes.
3. Score options with the decision rubric and prefer no change when no candidate beats the current stack.
4. Separate safe reading from actions that would edit code, install packages, use secrets, deploy, or mutate external systems.
5. Return the required review sections and include sources, risk flags, and verification commands.

Output sections: `Current stack`, `Outdated or risky choices`, `Better current options`, `Drop-in opportunities`, `Ask before changing`

### Coding Agent Selection

Use this when comparing Codex, Claude Code, Gemini/Google ADK, Copilot-style agents, Cursor/Cline-style tools, or framework-based agents.

1. Start with the work shape: repository editing, app automation, hosted agent runtime, multi-agent orchestration, model-app development, or browser-game build work.
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

### Source Intake Review

Use this when deciding whether an upstream doc, MCP server, registry, benchmark, or agent workflow source belongs in Vnem.

1. Classify the source as protocol docs, client docs, registry feed, MCP server, eval/observability, prompt pattern, or product signal.
2. Prefer official docs, canonical repositories, vendor-maintained MCPs, and sources with llms.txt or clear machine-readable indexes.
3. Record provenance, license posture, freshness, permissions, risk flags, and what agent decision the source improves.
4. Do not copy long upstream documentation into Vnem; link to sources and write original summaries or small metadata entries.
5. Choose the smallest artifact: watched source, registry entry, best-practice note, prompt pattern, eval fixture, or no change.
6. Require a verification path before promoting trust: link check, local MCP smoke test, install review, or before/after agent benchmark.

Output sections: `Source candidate`, `Why it matters`, `Trust and risk`, `Intake path`, `Verification`

### Zero-Trust Gateway Review

Use this when a proposal asks Vnem to intercept tools, pin schemas, redact secrets, block risky commands, index code, or add a package firewall.

1. Reject all-at-once runtime rewrites unless the current repo already has that runtime boundary and tests.
2. Classify each proposal as guidance, advisory analysis, deterministic enforcement, or external runtime enforcement.
3. Keep the install pack read-only: do not add daemons, shell proxies, package installs, or automatic mutation to `.vnem/`.
4. Treat MCP tool annotations as useful risk hints, not security guarantees; untrusted servers can mislabel behavior.
5. Prefer deterministic checks first: path prefix policy, schema hash drift detection, secret redaction, manifest diff review, and explicit approval gates.
6. Require adversarial tests before any enforcement claim: traversal blocks, redaction, schema drift, mismatched write intent, malicious test hooks, and package-addition review.
7. If a runtime gateway is still justified, build it as a separate reviewed surface with a threat model, small pilot, rollback path, and compatibility matrix.

Output sections: `Prompt review`, `Safe subset`, `Risky or blocked scope`, `Phased implementation`, `Verification gates`

### Prompt Upgrade

Use this when a rough prompt should become an operational instruction for an AI agent or model.

1. Preserve the user's actual goal and voice.
2. Add only missing structure that changes reliability: context, scope, constraints, non-goals, output format, examples, and verification.
3. For coding agents, include repo scope, likely files, allowed commands, approval boundaries, verification command, and final reporting requirements.
4. For research or product decisions, require current primary sources and separate confirmed facts from judgment.
5. Return both an enhanced prompt and a compact prompt.

Output sections: `Enhanced prompt`, `Compact prompt`, `What changed`, `Missing inputs`


## Project Review Protocol

1. Inspect the user's repository shape before recommending tech. Look for manifests and configs such as `package.json`, `pnpm-lock.yaml`, `yarn.lock`, `pyproject.toml`, `requirements.txt`, `Cargo.toml`, `go.mod`, `Dockerfile`, `astro.config.*`, `next.config.*`, `vite.config.*`, `.github/workflows/*`, `.mcp.*`, and existing agent instructions.
2. Read `search-index.json` and expand the user's intent with `intent_aliases`. For example, map `better ui` to frontend/design/accessibility terms and `agent payments` to payments/x402/wallet terms.
3. Prefer recommendations with higher `score`, stronger `source_confidence`, fresher `freshness`, clearer licenses, and fewer `risk_flags`.
4. Score the top options against the decision rubric. Prefer no change when no option has a clear, verifiable advantage.
5. When a recommendation touches files, databases, browsers, repositories, wallets, paid APIs, or secrets, call out that risk plainly.
6. Output the review in this exact order: `Current stack`, `Outdated or risky choices`, `Better current options`, `Drop-in opportunities`, `Ask before changing`.

## Prompt Enhancement Protocol

When the user says `use vnem to enhance this prompt`, `use vnem prompt enhancer`, or `vnem prompt forge`, read `.vnem/prompt-engineering.md` and `.vnem/prompt-patterns.json`, then rewrite the user's prompt.

Auto-activate the same protocol even without the trigger phrase when the user asks to write, improve, rewrite, harden, optimize, critique, or template a prompt; asks for a system/developer/agent/Codex/Claude/GPT prompt; or pastes a prompt draft and asks if it is good, powerful, clear, safe, complete, or ready to use.

Do not auto-activate for ordinary task execution. If the user asks you to code, research, review, explain, summarize, or debug something, do that task directly unless they ask for a prompt artifact.

This only limits prompt rewriting. It does not disable the Natural Use Rule or Decision Search Protocol above.

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

