# VNEM Local Testing

Use this page when you want to verify the current local ARD browser pipeline from
the VNEM implementation repo without starting new product work.

VNEM's broader mission is general AI improvement: VNEM improves how AIs work on
any user task, project, repo, app, mod, workflow, prompt, tool, system, research
target, or idea. This page is local testing guidance for this repo's current
implementation. The broader VNEM standard is that AI-assisted work should become
easier for users to verify in any target project.

## Start the local dashboard stack

Local dashboard owner access allows this public wallet address after wallet signing:

```text
H62Ri1EExddxFKsLMn4nbmbxiCSxNRLtF8igPySLA23B
```

Do not enter private keys or seed phrases; the dashboard uses a wallet signature challenge.

```bash
cd C:\VNEM\vnem-src
npm run dev:all
```

Then open:

```text
http://127.0.0.1:4174/dashboard/?mock&v=ard
```

Click:

```text
Run ARD pipeline
```

For the protected implementation lane, use the `Changes by ARD` card:

```text
Preview ARD changes
Prepare Changes by ARD commit
Push Changes by ARD branch
```

Push requires this exact confirmation text:

```text
I understand ARD will push changes to the Changes by ARD branch, not main.
```

Expected success:

- Research AI runs.
- Protection AI runs.
- Giving AI runs.
- Dangerous findings appear and remain visible.
- A `fixture-remote` or `dry-run` branch proof appears.
- The `Changes by ARD` card shows display name `Changes by ARD`, Git branch `changes-by-ard`, and main protected.
- Preview is dry-run only.
- Prepare creates a reviewable local `changes-by-ard` commit when the repo is clean.
- Push targets only `origin changes-by-ard` after exact confirmation.
- No fake `main` push appears.

Current honest scope: this is a browser/local deterministic pipeline proof plus a protected branch commit proof. It is not live web research, not antivirus-grade protection, not auto-merge, and not a `main` push by ARD.

## Quick non-browser test

```bash
npm run ard:browser-pipeline
```

This starts a temporary loopback backend, calls the same `POST /api/ard/pipeline/run` route used by the dashboard button, prints the Research AI -> Protection AI -> Giving AI summary, and writes local ARD run artifacts under `discovery/ard-runs/<run-id>/`.

## Current feature tests

```bash
npm run test:current
```

This runs the ARD browser pipeline smoke test, the focused dashboard browser-pipeline status test, and the Changes by ARD helper/dashboard tests.

## Troubleshooting

```bash
npm run dev:health
npm run ard:health
npm run test:current
```

Stop local servers with:

```text
Ctrl+C
```

If a dev server was left behind, run:

```bash
npm run dev:cleanup-dashboard
npm run dev:health
```

## PowerShell note

If PowerShell blocks `npm.ps1` because script execution is disabled, use `npm.cmd` instead:

```powershell
npm.cmd run dev:all
npm.cmd run test:current
npm.cmd run ard:browser-pipeline
```

## Future major feature rule

Every future major VNEM capability built in this repo must include an easy user
test path. VNEM's broader standard is that AI-assisted work should be testable by
the user whenever possible:

- command
- URL if UI
- button/action
- expected result
