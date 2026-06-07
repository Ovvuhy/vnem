# Building AI Operating Rules

These rules keep VNEM self-improvement work clean, auditable, and less vulnerable to stale process output or compressed context drift.

## Start every run with facts

Run:

```bash
npm run builder:session
npm run dev:health
git status --short --untracked-files=all
git log --oneline -5
```

Do not start implementation until the branch, worktree, remote SHA, generated dispatch files, accidental duplicate paths, and dev ports are understood.

## Live Builder Health

The dashboard Builder Health card reads the local app server's read-only `GET /api/builder/session` endpoint when the backend is running. It can refresh live facts, but it must not kill processes, clean ports, mutate files, commit, push, or fake live data.

- Live card data is useful for branch, local HEAD, origin/main, worktree, dispatch-file, accidental-path, and port state.
- Backend-offline card data is fallback guidance from source-controlled run history.
- CLI remains the authority for cleanup: use `npm run dev:cleanup-dashboard` only after confirming port health.
- If the browser and CLI disagree, trust `npm run builder:session`, `npm run dev:health`, and `git status` first.

## Builder Run Lifecycle Rules

1. Start a run before major VNEM changes with `npm run builder:run:start -- --title "..."` or `node scripts/vnem-builder-run.mjs start --title "..."`.
2. Do not start a new feature if `discovery/run-history/active-run.json` exists; run `npm run builder:run:recover` first.
3. Update run status before validation and before visual checks, for example `npm run builder:run:update -- --status validating`.
4. Finish the run after commit/push with `npm run builder:run:finish -- --status pushed --commit <sha>` so the active pointer clears.
5. If context compresses repeatedly, run recovery and trust its active-run/git/dev-port summary over stale chat memory.
6. If tool limits hit, leave a clear active-run state instead of pretending the run finished.
7. Stale localhost output is not run state. It is only historical process output until `builder:session`, `builder:run:recover`, and `git status` confirm it.
8. Trust builder session + active run + git status first; use run history as an audit trail, not as permission to skip validation.
9. Builder run commands must not kill processes, commit, push, install packages, execute discovered repos, or mutate outside `discovery/run-history/`.
10. Use auto-capture for major run milestones: `npm run builder:validate` for the validation/generate ladder, `npm run builder:safety` for final diff/safety evidence, `npm run builder:commit -- --message "..."` only after validation+safety pass, and `npm run builder:push` only after a recorded commit.
11. Auto-capture is evidence capture, not auto-approval. It does not auto-merge, does not execute discovered repos, does not install candidate packages, does not kill processes, and the browser dashboard never commits or pushes.

## Do not trust stale background output

Old Vite/server messages can arrive after a task is already committed and pushed. If old localhost output appears:

- run `npm run dev:health`
- run `npm run builder:session`
- check `git status --short --untracked-files=all`
- check `git log --oneline -5`
- do not assume new work exists just because a background process printed a localhost URL

## Port rules

- `9099` = VNEM backend/app server.
- `4174` / `4175` = dashboard dev or preview server.
- Do not start duplicate dashboard servers blindly.
- Reuse a running dashboard server when it is clearly the one you need.
- Do not kill `9099` unless explicitly needed and safe.
- After visual checks, clean dashboard dev servers with `npm run dev:cleanup-dashboard`.
- Cleanup must never kill unknown processes or the backend by default.

## Compression rules

When context compresses repeatedly:

- stop starting new features
- refresh a session report with `npm run builder:session`
- validate the current work
- commit/push only if clean, focused, and verified
- ask for a new session if accuracy is clearly degrading

## Finish before expanding

- Do not start another feature while the worktree is dirty.
- Do not stack prompts on unfinished local diffs.
- Do not push without validation.
- Do not leave generated artifacts stale.
- Do not claim a push happened until `git ls-remote origin refs/heads/main` confirms it.

## Safety reminders

- no auto-merge
- no discovered repo execution
- no package install from candidates
- no fake branch status
- no fake live data
- no hidden process killing
- no killing unknown localhost listeners
