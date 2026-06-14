# ARD Roadmap

This roadmap is a practical operator backlog for ARD inside VNEM. It separates real current capability from future work so the dashboard does not become placebo UI.

## Now: ARD v2 improvement engine

Goal: make ARD prove a real repo-owned improvement loop:

- Research AI v2 discovers work from multiple repo/local lanes;
- candidate memory prevents silent repeated stale review spam;
- Protection AI v2 explains branch eligibility, safe action, and missing evidence;
- Giving AI v2 produces work packages, not just reports;
- Changes by ARD previews selected work packages with exact files and can prepare a protected branch commit;
- the dashboard shows source lanes, lifecycle state, work packages, dangerous findings, and commit state.

Evidence required: `npm run ard:dogfood`, focused ARD v2 tests, dashboard build, browser visual check, and safety grep.

## Next: work-package validation evidence

Improve candidate review quality before any deeper automation:

- show source, license, risk, trust, and reason in fewer repeated places;
- improve dedupe and latest-event ordering;
- show branch eligibility and exclusion reasons more clearly;
- keep blocked/quarantined items visible but report-only;
- make manual review checklist easier to follow.

## Later: Changes by ARD review depth

Keep `changes-by-ard` protected while improving branch review:

- clearer diff preview;
- validation evidence next to the branch action;
- stronger blocked-state explanations when worktree or remote state is unsafe;
- no auto-merge;
- no main push by ARD.

## Future: live external research

Live external research remains future/planned until explicitly requested, implemented, tested, and labeled with limits. It must not execute discovered repos, install candidate packages, or hide dangerous findings.

## Later VNEM MCP foundation

VNEM MCP foundation is intentionally later. Do not start it during ARD productization unless the user explicitly requests that sprint.
