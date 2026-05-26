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

## Project Review Protocol

1. Inspect the user's repository shape before recommending tech. Look for manifests and configs such as `package.json`, `pnpm-lock.yaml`, `yarn.lock`, `pyproject.toml`, `requirements.txt`, `Cargo.toml`, `go.mod`, `Dockerfile`, `astro.config.*`, `next.config.*`, `vite.config.*`, `.github/workflows/*`, `.mcp.*`, and existing agent instructions.
2. Read `search-index.json` and expand the user's intent with `intent_aliases`. For example, map `better ui` to frontend/design/accessibility terms and `agent payments` to payments/x402/wallet terms.
3. Prefer recommendations with higher `score`, stronger `source_confidence`, fresher `freshness`, clearer licenses, and fewer `risk_flags`.
4. When a recommendation touches files, databases, browsers, repositories, wallets, paid APIs, or secrets, call out that risk plainly.
5. Output the review in this exact order: `Current stack`, `Outdated or risky choices`, `Better current options`, `Drop-in opportunities`, `Ask before changing`.

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

