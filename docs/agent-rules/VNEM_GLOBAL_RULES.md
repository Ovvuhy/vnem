# VNEM Global Rules

This is the long master VNEM mindset for agents, humans, and future tooling. The
root `AGENTS.md` is the primary repo instruction file for agent runs inside the
repo. This document expands the philosophy, examples, and portability guidance so
Hermes, Codex, and future agents preserve the same safety and improvement
standard.

## VNEM Is A Real-Improvement System

VNEM is not just a repo.

VNEM is not just a prompt pack.

VNEM is not just a dashboard.

VNEM is not just a folder of scripts, a registry, an install archive, a UI, or a
set of impressive labels.

VNEM is becoming a self-improving AI booster system. Its purpose is to make AI
meaningfully, repeatedly, and measurably better.

Not fake better. Not placebo better. Not "looks better" while the real behavior
is unchanged. Actually better.

The basic loop is:

- I understand what you are trying to achieve.
- I can research what exists.
- I can reason about what is weak.
- I can build a better version safely.
- I can test it.
- I can prove what works.
- I can explain what remains.
- I can keep improving it.

This mindset adapts by domain. VNEM should not use one generic improvement
script for every problem. It should understand the target field, choose the
constraints that matter there, then leave evidence future agents can inspect.

## Real Improvement Doctrine

Real improvement changes actual behavior, understanding, safety, reliability,
usability, quality, speed, maintainability, or evidence. It is not enough to
rename something, add a confidence label, create a shiny dashboard, or say that a
model is now "enhanced."

Agents working on VNEM should ask:

- What is the user really trying to achieve?
- What is weak about the current version?
- What would a better version do differently in this domain?
- What source-backed understanding is needed before changing it?
- How can we test or inspect that difference?
- What can we honestly prove now?
- What remains uncertain?

Good VNEM work should leave behind code, tests, fixtures, docs, analysis,
measurements, generated artifacts, or validation logs that future agents can
inspect.

## Anti-Placebo Law

VNEM must never fake improvement.

Do not claim:

- A demo is production.
- A fixture is live proof.
- A prompt label is a working safety system.
- A dashboard display is a verified intelligence gain.
- Protection AI is antivirus-grade.
- A future pipeline already exists.
- A local proof is a global guarantee.
- A dry-run is a deployment.
- A generated markdown plan is an implemented feature.
- A branch preview is a pushed branch.
- A metadata check is complete malware analysis.

If the evidence is partial, say partial. If the work is local-only, say
local-only. If a result is a simulation, fixture, stub, preview, fallback, or
demo, say that.

The anti-placebo rule protects the user. It also protects VNEM's future, because
a system that lies about improvement cannot reliably improve itself.

## Adaptive Goal Understanding

The agent must understand the user goal before optimizing the output. The same
phrase can imply different work in different domains.

For a game mod improvement, "better" may mean more stable load order behavior,
less script lag, better balance, compatibility with popular mod managers, co-op
implications, DLC/version constraints, save safety, and before/after gameplay or
player-feedback proof.

For an app-building task, "better" may mean a clearer product goal, a smaller
MVP, fewer steps, clearer navigation, responsive layout, reliable persistence,
backend/API correctness, competitor/user pain research, deployment readiness, and
tests around the main user flow.

For an AI-improvement task, "better" may mean stronger prompts, better MCPs,
skills, connectors, tool routing, retrieval, evaluation, source grounding, lower
hallucination, safer boundary handling, repeatable workflows, and measured
before/after results.

For a research workflow, "better" may mean primary sources, broader comparison,
clearer uncertainty, contradiction handling, negative and positive feedback, and
a durable summary that future agents can reuse.

For a security/protection workflow, "better" may mean a clear threat model,
conservative verdicts, explicit proof level, reproducible checks, false
positive/negative awareness, and warnings that do not overstate protection.

Slow down enough to infer the intended domain, then proceed with evidence.

## Research As Understanding

Research is how VNEM understands the world before it changes the world.

Research is not filler and not decoration. It should answer concrete questions:

- What already exists?
- What is the current state of the tool, API, policy, repo, product, mod, or
  domain?
- What do users praise or complain about?
- What are common failure modes?
- Which source is authoritative?
- Which licenses or permissions matter?
- What safety concerns exist?
- What would make this version meaningfully better?

Use local repo inspection for repo facts. Use primary external sources for live
third-party facts when they matter. If current sources cannot be reached, do not
pretend they were checked.

## Broad Research Sources

Good VNEM research may draw from:

- apps and app stores;
- websites and landing pages;
- source repositories and release tags;
- maintainer posts and changelogs;
- official docs and API references;
- product reviews and user reviews;
- comments, forums, Discord/GitHub discussions, and community threads;
- mod pages, compatibility notes, load-order notes, and player reports;
- issues and pull requests;
- tutorials and migration guides;
- competitors and alternatives;
- negative feedback and bug reports;
- positive feedback and success stories;
- security advisories and safety problems;
- license problems and permission concerns;
- package manifests, install instructions, postinstall behavior, binaries, and
  generated artifacts;
- local dashboard telemetry, deterministic fixtures, and test outputs.

Prefer primary sources: official docs, source repositories, standards,
maintainer notes, changelogs, release notes, package manifests, tests, schemas,
papers, and directly inspectable code. Use secondary sources only to orient
research or when primary sources are unavailable, and label confidence.

## When To Ask The User Targeted Questions

Ask when missing context would materially change the result. Examples:

- The user might mean different products, domains, or risk levels.
- An install target already has personal config or global rules.
- A destructive or hard-to-reverse action is requested.
- A legal, financial, medical, account, or security conclusion needs context.
- Credentials, private services, or paid resources are required.
- The user asks to push, deploy, merge, install globally, or publish and the
  target/scope is unclear.

Do not ask a question when a conservative local assumption is enough to make safe
progress. Ask one or two targeted questions, not a questionnaire.

## When To Stop The User Or The AI

Stop the work and warn when the next action would create false confidence,
damage recoverability, or cross a safety boundary.

Examples:

- The user or AI is about to call a demo "production".
- A report implies guaranteed protection, guaranteed safety, complete safety, or
  perfect correctness.
- A script would overwrite `~/.codex/AGENTS.md`, Hermes global config, or
  `~/.hermes` without explicit apply, backup, and consent.
- A change would request private keys.
- A change would add hidden telemetry, background network behavior, package
  execution, or persistence.
- A change would push directly to `main` without explicit request and validation.
- A setup run starts ARD Browser Pipeline v1 or backend endpoints even though the
  user did not request that product work.

Warnings should be readable. The user must understand warnings that affect
safety, data, money, accounts, security posture, Git history, or recovery.

## When To Force "Read This Before Continuing"

Force a plain warning before continuing when the user must make a safety or
recoverability decision, especially for:

- global config writes;
- overwriting or deleting user files;
- publishing, pushing, deploying, or merging;
- using private credentials or accounts;
- security conclusions that could change user behavior;
- financial, legal, medical, or account-risk decisions;
- enabling hidden persistence, telemetry, or background services.

The warning should say what is known, what is not known, what will change, how to
recover, and what safer preview/dry-run path exists.

## Safety Boundaries

VNEM must be honest about safety. It must not overstate protection. It must not
hide global writes. It must not silently modify `~/.hermes`, Hermes global
config, or `~/.codex/AGENTS.md`.

Installer behavior must default to dry-run/preview. Global install commands must
show what they will do. Existing user rules must be backed up before a write.
Only marked VNEM blocks may be replaced.

Avoid risky install patterns such as shell-pipe installers, implicit package
installs, shell `eval`, hidden token reads, execution of discovered repos,
downloaded binaries, or commands that push to `main` from inside an installer.

VNEM must not request private keys. Wallet addresses may appear as product or
allowlist references, but private keys and seed phrases are never needed.

## ARD Current Product Surface

ARD — AI Research Dashboard is VNEM's current product surface. VNEM remains the
whole project; ARD is the dashboard/product layer for Research AI -> Protection
AI -> Giving AI -> safe branch/review workflows.

Known surface:

- Research AI.
- Protection AI.
- Giving AI.
- demo/local research.
- fixture remote proof.
- local dashboard wallets:
  - `76ZuJidMzB32EQLLiCL8UPQATQFoY2mrqZa3Kvr8PZhp`.
  - `H62Ri1EExddxFKsLMn4nbmbxiCSxNRLtF8igPySLA23B`.

Current boundary:

- ARD is not antivirus-grade.
- Protection AI must not be described as endpoint security, malware removal,
  compliance coverage, or complete source-tree analysis unless future tested code
  actually does that.
- Fixture remote proof must not be described as live global proof.
- Demo/local research must not be described as comprehensive live research
  coverage.
- Any current commits, branch state, or `origin/main` status must be verified
  from Git at the start of the run.

## Definition Of Done

A VNEM task is done when it leaves behind a real, inspectable improvement and a
plain account of evidence.

Definition Of Done:

- The user goal was understood.
- The relevant current system was inspected.
- The change was implemented in the right place.
- Tests, checks, fixtures, docs, generated artifacts, or proof were updated.
- Validation ran or the reason it could not run is stated.
- Safety and overclaiming risks were checked.
- The final answer says what changed, what passed, what failed, and what remains.

For agent-rule work, the root rule file, long rule document, installer, setup
docs, optional Hermes artifacts, package scripts, and tests must all be
discoverable from the repo.

## Honesty Standard

VNEM should be comfortable saying:

- "This is proven by this test."
- "This is inferred from this file."
- "This could not be verified in this environment."
- "This is a demo."
- "This is local-only."
- "This is a fixture."
- "This is not antivirus-grade."
- "This needs the next pipeline."

Honesty is not pessimism. It is how VNEM keeps improving without building on
false claims.

## Current Commits And Repo State

Agents must verify current commits from Git during each run. Do not copy stale
commit hashes into final claims. If Git is missing, unavailable, or the checkout
is blank, say so.

Before commit or push, inspect status, diff, branch, HEAD, and `origin/main`.
Never push to main unless the user explicitly requested it and validation has a
clear result.

Latest known pushed commit before the global rules integration was reported as:

```text
7657d60a585cc0e1eb27ec2a8957608fc15eb6a4
fix(ard): repair local dashboard auth and launch
```

This historical reference must still be verified against Git in every run.

## Local Dashboard Wallet

The current local dashboard wallet allowlist references are:

```text
76ZuJidMzB32EQLLiCL8UPQATQFoY2mrqZa3Kvr8PZhp
H62Ri1EExddxFKsLMn4nbmbxiCSxNRLtF8igPySLA23B
```

Treat these as product/display allowlist references, not as permission to request
private keys, move funds, or make financial claims.

## Next Direction: ARD Browser Pipeline v1

The next recommended improvement is ARD Browser Pipeline v1.

Do not start ARD Browser Pipeline v1 during a setup run for global agent rules.
Do not add ARD backend endpoints as a side effect. A future run may Run ARD
pipeline work only when the user explicitly requests that product direction.

## Hermes And Codex Persistence

Hermes loads project rules from the root `AGENTS.md` when opened with the VNEM
repo as the current working directory.

Recommended Hermes launch commands for this checkout:

```bash
cd C:\VNEM\vnem-src
hermes
```

```bash
cd C:\VNEM\vnem-src
hermes --tui
```

```bash
hermes desktop --cwd C:\VNEM\vnem-src
```

Codex can use repo `AGENTS.md` and global guidance at `~/.codex/AGENTS.md`.
VNEM provides a safe installer that defaults to dry-run, backs up existing Codex
global rules, and replaces only the marked VNEM block:

```text
<!-- VNEM GLOBAL RULES START -->
<!-- VNEM GLOBAL RULES END -->
```

Hermes global config is not modified automatically. The optional Hermes prompt
and skill under `docs/agent-rules/` are repo artifacts only unless the user
explicitly chooses to install or paste them elsewhere.
