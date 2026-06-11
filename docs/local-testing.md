# VNEM Local Testing

Use this page when you want to verify the current local ARD browser pipeline from a real checkout without starting new product work.

## Start the local dashboard stack

Local dashboard owner access allows either of these public wallet addresses after wallet signing:

```text
76ZuJidMzB32EQLLiCL8UPQATQFoY2mrqZa3Kvr8PZhp
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

Expected success:

- Research AI runs.
- Protection AI runs.
- Giving AI runs.
- Dangerous findings appear and remain visible.
- A `fixture-remote` or `dry-run` branch proof appears.
- No fake `main` push appears.

Current honest scope: this is a browser/local deterministic pipeline proof. It is not live web research, not antivirus-grade protection, and not a real remote research-branch push.

## Quick non-browser test

```bash
npm run ard:browser-pipeline
```

This starts a temporary loopback backend, calls the same `POST /api/ard/pipeline/run` route used by the dashboard button, prints the Research AI -> Protection AI -> Giving AI summary, and writes local ARD run artifacts under `discovery/ard-runs/<run-id>/`.

## Current feature tests

```bash
npm run test:current
```

This runs the ARD browser pipeline smoke test and the focused dashboard browser-pipeline status test.

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

Every future major VNEM feature must include an easy user test path:

- command
- URL if UI
- button/action
- expected result
