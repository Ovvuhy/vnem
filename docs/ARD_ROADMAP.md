# ARD Roadmap

This roadmap is a practical operator backlog for ARD inside VNEM. It separates real current capability from future work so the dashboard does not become placebo UI.

## Now: ARD operator console

Goal: make the dashboard answer, without excessive scrolling:

- what ARD is doing;
- what provider/model/mode is active;
- what Research AI found;
- what Protection AI decided;
- what Giving AI prepared;
- what Changes by ARD can do;
- what needs review;
- what is dangerous;
- what safe action is next.

Evidence required: focused dashboard model tests, dashboard build, browser visual check, and no console error flood.

## Next: better review and evidence quality

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
