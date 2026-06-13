# Hermes And Codex VNEM Setup

VNEM is a general AI-improvement system. VNEM improves how AIs work on any user
task, project, repo, app, mod, workflow, prompt, tool, system, research target,
or idea. This repository is the current implementation and testbed, not the only
target for VNEM principles.

There are two common modes:

1. Developing VNEM: open Hermes or Codex inside `C:\VNEM\vnem-src` so it reads
   this repo's `AGENTS.md` and follows repo-maintenance rules.
2. Using VNEM principles on another project: copy/adapt VNEM-style `AGENTS.md`
   or global rules into that project so the AI applies VNEM's improvement loop to
   that project.

## Hermes

For developing VNEM, Hermes Agent should be opened inside the VNEM repo so it
loads the root `AGENTS.md`.

Hermes CLI:

```bash
cd C:\VNEM\vnem-src
hermes
```

Hermes TUI:

```bash
cd C:\VNEM\vnem-src
hermes --tui
```

Hermes Desktop:

```bash
hermes desktop --cwd C:\VNEM\vnem-src
```

Hermes Desktop and CLI share the same Hermes core/config/sessions/skills. If
Hermes is opened outside the VNEM repo, it may not load this implementation
repo's project rules. That is correct when the target is another project, but
that project should receive its own adapted VNEM-style rules.

Root `AGENTS.md` is the project-level instruction file for this implementation
repo. It should be committed in the repo and reviewed like source code.

VNEM does not modify Hermes global config automatically and does not write to
`~/.hermes` silently. The optional Hermes prompt and skill in `docs/agent-rules/`
are repo-local artifacts only unless the user explicitly installs or pastes them
elsewhere.

## Codex

Codex supports repo `AGENTS.md` and global guidance at:

```text
~/.codex/AGENTS.md
```

Global Codex guidance may be installed only with an explicit apply command. Use
the installer to preview or apply the VNEM global block:

```bash
node scripts/install-vnem-agent-rules.mjs --dry-run
node scripts/install-vnem-agent-rules.mjs --codex
node scripts/install-vnem-agent-rules.mjs --codex --apply
node scripts/install-vnem-agent-rules.mjs --print-hermes
node scripts/install-vnem-agent-rules.mjs --all --dry-run
```

Default behavior is dry-run/preview. `~/.codex` is created only when `--apply` is
used. If `~/.codex/AGENTS.md` already exists, the installer creates a backup
before changing it:

```text
AGENTS.md.backup-<timestamp>
```

Only this marked block is inserted or replaced:

```text
<!-- VNEM GLOBAL RULES START -->
...
<!-- VNEM GLOBAL RULES END -->
```

Unrelated user Codex rules before or after the marked block are preserved. The
installer must not write to `~/.hermes`; it only prints the Hermes commands.

## Optional Hermes Prompt

A short startup prompt is available at:

```text
docs/agent-rules/HERMES_VNEM_START_PROMPT.md
```

An optional repo-local Hermes skill template is available at:

```text
docs/agent-rules/hermes-vnem-rules/SKILL.md
```

These are repo artifacts only. Install or paste them manually only when desired,
and adapt the language when the target is another project rather than VNEM
development.
