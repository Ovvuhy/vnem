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
