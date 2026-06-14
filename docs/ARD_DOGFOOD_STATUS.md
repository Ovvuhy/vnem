# ARD Dogfood Status

Last updated: 2026-06-14

ARD Capability Expansion v2 adds a repo/local dogfood loop that proves ARD can discover, protect, package, and preview branchable VNEM work without installing external packages, executing discovered repositories, weakening auth, pushing main, or auto-merging.

## Current dogfood command

```bash
npm run ard:dogfood
```

PowerShell:

```powershell
npm.cmd run ard:dogfood
```

The command writes intentional local artifacts under `discovery/ard-runs/<run-id>/` and lifecycle memory under `discovery/ard-memory/candidate-memory.json`.

## Proven v2 behavior

- Research AI v2 uses repo/local source lanes: repo self-research, backlog/roadmap, run-history/failure, dashboard/product weakness, test/validation gap, docs drift, Changes by ARD opportunity, and an explicitly labeled external metadata lane.
- Research AI v2 uses a category taxonomy beyond Roblox/Luau: AI skills, MCPs, agent frameworks, coding tools, research methods, evals/benchmarks, safety/security, prompting playbooks, repo automation, documentation systems, browser automation, data/memory/retrieval, Roblox/Luau, and general devtools.
- Roblox/Luau remains one category, but repeated or missing-license Roblox/Luau repos are demoted into waiting-for-evidence/review-artifact-only states instead of dominating the primary queue.
- External GitHub candidates with missing licenses can generate metadata-only review artifacts under `docs/ard-reviews/`; they are not implementable code and cannot be copied, installed, or executed.
- Candidate memory records first/last seen, times seen, lifecycle status, missing evidence, safe action, branch eligibility, and suppression state.
- Protection AI v2 outputs branch eligibility, safe action, missing evidence, why-not-branch-eligible, and whether a candidate can feed Giving AI / Changes by ARD.
- Giving AI v2 creates structured work packages with files to change, tests to run, risk notes, rollback notes, and blocked reasons.
- Changes by ARD can preview a selected work package with exact files and can prepare a protected `changes-by-ard` branch commit when the worktree is clean and the package is safe.

## Limitations

- External metadata is not treated as live unless explicitly enabled and backed by real safe metadata fetches.
- Protection AI v2 is branch-eligibility/static metadata classification, not antivirus-grade scanning.
- Dangerous findings stay visible and report-only; they never become work packages.
- Main remains protected; any Changes by ARD push targets `origin/changes-by-ard` only after exact confirmation.
