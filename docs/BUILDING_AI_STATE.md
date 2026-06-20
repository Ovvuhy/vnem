# Building AI State

This is repo-native memory for future Building AI runs. It is not chat memory and it is not a promise that future Git state is unchanged. Always verify Git, ports, and run history before acting.

## What VNEM is

VNEM is a general AI-improvement system. The product goal is to help AIs understand the user's real goal, research what exists, identify weaknesses, build safer improvements, test them, prove what changed, and leave the next run easier.

## What ARD currently does

ARD — AI Research Dashboard is the current dashboard/product surface for this repo. It currently supports:

- owner-gated local dashboard access through public wallet allowlisting plus wallet signing;
- browser/local deterministic Research AI → Protection AI → Giving AI pipeline runs;
- visible dangerous findings that are excluded from implementable Giving work;
- fixture/dry-run research branch proof, not a main push;
- Changes by ARD protected branch lane using `changes-by-ard` with exact confirmation;
- local backend routes for dashboard status, ARD pipeline runs, review queues, builder health, and protected branch actions;
- ARD v2 repo/local dogfood through `npm run ard:dogfood`.

## Current acceleration state

ARD Capability Expansion v2 turns ARD from a deterministic demo into a repo/local improvement engine:

- Research AI v2 uses source lanes for repo self-research, backlog/roadmap, run-history/failure, dashboard/product weakness, test/validation gaps, docs drift, Changes by ARD opportunities, and optional external metadata.
- Candidate lifecycle memory lives at `discovery/ard-memory/candidate-memory.json` and tracks first/last seen, times seen, lifecycle state, missing evidence, suppression, safe action, and branch eligibility.
- Candidate scoring ranks product impact, user-visible impact, actionability, branchability, evidence, source quality, safety/license risk, complexity, testability, novelty, and staleness.
- Protection AI v2 explains branch eligibility, safe action, missing evidence, why-not-branch-eligible, and whether Giving AI / Changes by ARD can use the candidate.
- Giving AI v2 emits work packages with exact files, tests, diff summary, rollback notes, risk notes, and blocked reasons.
- Changes by ARD can preview selected work packages with exact files and prepare a protected branch commit without touching main.
- The real dashboard at `http://127.0.0.1:4174/dashboard/?v=ard` exposes source lanes, repeated/suppressed counts, all work packages through the candidate explorer, selected package exact files/tests, exact worktree blockers, and prepared/pushed commit status.
- ARD v2.2 adds a research category taxonomy beyond Roblox/Luau: AI skills, MCPs, agent frameworks, coding tools, research methods, evals/benchmarks, safety/security, prompting playbooks, repo automation, documentation systems, browser automation, data/memory/retrieval, Roblox/Luau, and general devtools.
- External GitHub repositories with missing or unknown license metadata are auto-triaged as review-artifact-only or waiting-for-evidence. They are not implementable code, are not installed, are not executed, and do not dominate the primary review queue.

Dogfood run `ard-reality-fix-final` found 27 candidates across 8 source lanes and 14 categories, kept Roblox/Luau to one category, counted 5 review-artifact-only external candidates, kept 1 dangerous finding visible/excluded, produced 25 work packages, and produced a Changes by ARD preview-ready work package with exact files. The dashboard candidate explorer can expand from compact view to all 25 packages, and selecting `Use in Changes by ARD` updates the protected branch preview card.

## Recently shipped

- ARD Browser Pipeline v1: dashboard `Run ARD pipeline` calls the local backend and writes local ARD run artifacts.
- Final user testing path: `npm run test:current`, `npm run ard:browser-pipeline`, and `docs/local-testing.md`.
- Local dashboard wallet allowlist update for `H62Ri1EExddxFKsLMn4nbmbxiCSxNRLtF8igPySLA23B`.
- Changes by ARD protected branch lane: preview is dry-run, prepare creates a reviewable branch commit, push requires exact confirmation and targets only `changes-by-ard`.
- This acceleration sprint adds a canonical ARD operator model, a cleaner dashboard hierarchy, and repo memory docs.

## Broken or weak

- The dashboard had too many competing primary sections, repeated pipeline explanations, and raw telemetry too high on the page.
- Future runs lacked one compact repo-native memory source for what exists, what matters, what must not be redone, and what should be visually verified.
- Provider/mode/model status was present but not integrated into one operator decision surface.
- Review queues and dangerous findings existed but could feel fragmented across sections.

## Current priority

Use ARD v2 to make the Research → Protection → Giving → Changes by ARD loop produce safer, more specific repo-owned work packages. Keep main protected, dangerous findings visible, Changes by ARD protected, public summaries only, no hidden chain-of-thought, no fake live research claim, and no auto-merge.

## Next 5 high-impact tasks

1. Improve ARD dashboard productization with clearer operator workflows and fewer repeated sections.
2. Improve Research → Protection → Giving visibility with better per-stage evidence and status quality.
3. Make Changes by ARD review/branch clarity stronger with clearer diffs, validation evidence, and operator confirmation UX.
4. Improve AI/provider/mode/status truthfulness, including API key state, fallback state, and planned-vs-real labels.
5. Improve faster user testing: one command, one URL, one click path, and visible expected results.

## Must not be repeated

- Do not rebuild ARD Browser Pipeline v1 from scratch.
- Do not remove or weaken Changes by ARD.
- Do not let ARD push or merge `main`.
- Do not hide blocked, quarantined, or dangerous findings.
- Do not execute discovered repos or install candidate packages.
- Do not claim live external research, antivirus-grade protection, production readiness, or hidden private reasoning.
- Do not leave raw/generated runtime artifacts dirty unless they are intentional and documented.

## What must be visually verified

When the dashboard changes, open `http://127.0.0.1:4174/dashboard/?mock&v=ard` after `npm run dashboard` or `npm run ard:dev` and verify:

- one main operator control center;
- one visible Run ARD pipeline button in the primary view;
- Research AI, Protection AI, Giving AI, Changes by ARD, and Manual Review timeline;
- Changes by ARD confirmation is readable and disabled until exact confirmation;
- AI provider/model/mode/API key/fallback status is visible;
- dangerous findings are represented;
- advanced/raw details are collapsed by default;
- browser console has no error flood.

## How future Building AI runs start

1. Read `AGENTS.md`, `docs/agent-rules/VNEM_GLOBAL_RULES.md`, this file, `docs/ARD_PRODUCT_BACKLOG.md`, `docs/ARD_ROADMAP.md`, and `docs/ARD_DECISION_LOG.md`.
2. Run builder recovery, dev health, Git status, branch, local HEAD, origin/main, and changes-by-ard remote checks.
3. Check crash/runtime/report/startup/log files and current generated runtime artifacts.
4. Inspect the relevant code before proposing changes.
5. Write or update focused tests before production behavior changes.

## How future Building AI runs end

Ship a real improvement. Prove it. Commit it. Push it. Leave the next run easier than this one.

Concretely:

1. Run focused tests for the changed surfaces.
2. Run dashboard build and user-path validation when UI changes.
3. Run validation/generation/install-pack checks when docs/generated artifacts change.
4. Run diff/safety checks.
5. Visually verify UI changes.
6. Update this state/backlog/decision docs if the product direction changed.
7. Commit, push, verify origin/main, recover builder run, and leave dev ports clean or clearly reported.
