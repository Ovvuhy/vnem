# ARD Decision Log

This log records product/workflow decisions future Building AI runs should preserve unless a later validated sprint changes them.

## 2026-06-14 — Productize ARD as an operator console

Decision: ARD's primary dashboard should be one operator console, not a stack of competing telemetry panels.

Why: users need to understand the current safe action quickly: what is running, what is blocked, what Changes by ARD can do, what is planned, and what remains manual.

Evidence required: canonical operator model test, dashboard build, visual verification, and safety grep.

## 2026-06-14 — Repo-native Building AI memory

Decision: future Building AI runs must read repo memory docs before product work:

- `docs/BUILDING_AI_STATE.md`
- `docs/ARD_ROADMAP.md`
- `docs/ARD_PRODUCT_BACKLOG.md`
- `docs/ARD_DECISION_LOG.md`

Why: chat memory and compressed summaries are not enough. The repo needs durable state, backlog, decisions, and end-of-run expectations.

## 2026-06-14 — Public decision log only

Decision: dashboard decision summaries are public operator summaries only. Do not claim or expose hidden chain-of-thought, private reasoning, or full internal thoughts.

Why: users need useful operational summaries without unsafe or misleading private-reasoning claims.

## 2026-06-14 — Changes by ARD remains protected

Decision: `Changes by ARD` targets only branch `changes-by-ard`. Push requires exact confirmation and no merge is performed. ARD must not push `main` or auto-merge.

Why: branch mutation must stay reviewable, recoverable, and explicit.

## 2026-06-14 — Dangerous findings remain visible

Decision: blocked/quarantined/dangerous findings stay visible in the dashboard and generated artifacts, but are excluded from implementable Giving work.

Why: hiding dangerous findings creates false confidence; applying them would violate the protection boundary.
