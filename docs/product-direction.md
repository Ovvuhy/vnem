# VNEM Product Direction

VNEM's mission is general AI improvement across domains, not VNEM-only self-improvement.

Product mission: VNEM improves how AIs work on any user task, project, repo, app, mod, workflow, prompt, tool, system, research target, or idea.

Repo development context: this repository is the current implementation and testbed where VNEM itself is built, tested, and maintained. VNEM principles can improve any task or project. When this repository is the task, those same principles help improve VNEM itself.

ARD Browser Pipeline v2 remains important, but it is one lane, not the whole product. The product should not tunnel-vision on ARD, branch automation, or repo self-improvement at the expense of portable AI-improvement workflows.

Current focused acceleration state is maintained in `docs/BUILDING_AI_STATE.md`, `docs/ARD_ROADMAP.md`, `docs/ARD_PRODUCT_BACKLOG.md`, and `docs/ARD_DECISION_LOG.md`. Future Building AI runs should read those docs before product work so they do not redo shipped work or miss visual verification requirements.

## Lane 1 — ARD pipeline and branch safety

- ARD Browser Pipeline v2.
- Changes by ARD protected implementation lane.
- Display name `Changes by ARD`; Git branch `changes-by-ard`.
- Preview is dry-run, prepare creates a reviewable local branch commit, and push requires exact confirmation.
- Live source routes only when explicitly requested and validated.
- Explicit operator confirmation before branch mutation.
- Real remote research branch push with protected implementation branches.
- No auto-merge.
- No main push without review.
- Clear labels for local, fixture, dry-run, preview, live, and planned states.

## Lane 2 — Using VNEM on other projects

- Portable AGENTS.md templates.
- Project onboarding wizard.
- "Apply VNEM to this repo" flow.
- Local project health detection.
- Project-specific safety rules.
- User test path generation for any project.
- Clear separation between VNEM repo-maintenance rules and portable VNEM principles.

## Lane 3 — Research and evidence quality

- Source ranking.
- Community signal synthesis.
- Reviews, comments, issues, forum, benchmark, and release-note analysis.
- Evidence grading.
- Stale-source detection.
- Citation and reporting standards.
- "What people love/hate" extraction for apps, mods, tools, workflows, and products.

## Lane 4 — Protection and safety

- Static risk scanning.
- Unsafe command detection.
- Dependency/install risk review.
- Secret, private-key, and seed-phrase refusal.
- Malicious pattern reporting.
- Honest safety labels by proof level.
- No fake antivirus claims.
- No hidden telemetry, hidden persistence, or discovered-code execution.

## Lane 5 — AI workflow improvement

- Prompt improvement loops.
- MCP/tool setup verification.
- Skill and playbook quality checks.
- Context handoff standards.
- Multi-agent review patterns.
- Failure memory and recovery patterns.
- Reduced hallucination, reduced placebo work, and better proof discipline.

## Lane 6 — User-facing verification

- `test:current` and domain-specific current-user-path checks.
- Local testing docs.
- UI/browser verification when a product surface changes.
- "How the user tests this" required in final output.
- Task-specific acceptance checks.
- Evidence that matches the actual user path, not only internal implementation claims.

## Lane 7 — Domain adapters

- Coding repo adapter.
- Game/mod adapter.
- App/product adapter.
- Security review adapter.
- Research synthesis adapter.
- AI-prompt/tooling adapter.
- Future adapters for productivity workflows, automations, dashboards, and broken prototypes.

## Non-regression standard

Future work should preserve this distinction:

```text
Product mission:
VNEM improves how AIs work across domains.

Repo development context:
This repository is where VNEM itself is built, tested, and maintained.
```

Correct shorthand:

```text
VNEM improves how AIs work across tasks and domains. This repo is the implementation and testbed. Improving VNEM is one use case, not the product's entire purpose.
```
