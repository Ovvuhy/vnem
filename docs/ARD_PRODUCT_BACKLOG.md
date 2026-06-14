# ARD Product Backlog

Prioritize real product improvements that make ARD more useful and make future Building AI runs faster. Do not treat labels as features.

## P0 — ARD v2 work-package loop

Make ARD produce branchable repo-owned work, not only dashboard status:

- Research AI v2 source lanes;
- lifecycle memory and anti-repeat handling;
- scoring/ranking with branchability and staleness;
- Protection AI v2 safe actions and missing evidence;
- Giving AI v2 work packages with exact files and tests;
- Changes by ARD preview/prepare from a selected work package.

## P0 — ARD dashboard productization

Build and maintain a clean operator console with one information hierarchy, one primary control center, a clear timeline, readable Changes by ARD controls, and raw/advanced details collapsed by default.

## P0 — Research → Protection → Giving visibility

Make the stage handoff understandable:

- Research AI: what source/evidence was found;
- Protection AI: verdict, proof level, dangerous signals, and why Giving can or cannot proceed;
- Giving AI: included/excluded counts and branch proof;
- Manual Review: what the human must inspect before any merge.

## P0 — Changes by ARD review/branch clarity

Keep `Changes by ARD` visible as the protected implementation lane:

- display name: `Changes by ARD`;
- Git branch: `changes-by-ard`;
- preview dry-run;
- prepare local reviewable commit;
- push only after exact confirmation;
- no auto-merge;
- no main push by ARD.

## P1 — AI/provider/mode/status truthfulness

The dashboard must show provider, model, mode, API key configured yes/no, local fallback yes/no, live external research yes/no/planned, current stage, and last stage update. If unknown, say unknown. If planned, say planned.

## P1 — Faster user testing

Every major feature needs:

- command;
- URL if UI;
- button/action;
- expected result;
- quick non-browser smoke when practical;
- focused `test:current` coverage.

## P1 — Better review queue

Reduce repeated candidate cards, dedupe visible candidates, show latest meaningful event first, and group low-signal/noisy entries without hiding dangerous findings.

## P2 — Better pipeline quality/efficiency

Improve candidate ranking, evidence summaries, branch eligibility, and validation evidence. Do not skip Research AI, Protection AI, Giving AI, manual review gates, or safety boundaries.

## P3 — Later VNEM MCP foundation

Build only after ARD's operator workflow is stable. VNEM MCP must not start as a side effect of dashboard productization.
