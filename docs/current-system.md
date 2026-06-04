# VNEM Current System Map

VNEM is being built as an AI-improvement platform, but the repo should stay honest about what exists today.

## Current implemented / in-progress surfaces

| Surface | Status | What it does now | Boundary |
| --- | --- | --- | --- |
| VNEM Core | Implemented | Provides the protected read-only install pack, source radar, registry data, rubrics, prompts, best-practice notes, quality gates, and generated LLM/API artifacts. | The install pack is guidance/data. It does not install packages, execute tools, collect secrets, or edit app code. |
| VNEM App / Dashboard | In progress | Shows owner-gated dashboard status, local AI client connector status, targeting controls, pipeline telemetry, improvement mission control, findings, route health, provider state, and staged dispatch review. | It must label live, sample, fallback, preview, and planned states clearly. |
| Research AI | In progress | Accepts dashboard targets, queries configured source routes, ranks candidates, and emits source-backed telemetry when the local app server is running. | A source signal is not approval. It must pass Protection AI before Giving AI can stage anything. |
| Protection AI | In progress | Reviews candidate provenance, route metadata, package surfaces, permissions, flags, threat score, and block/isolate decisions. | It should be conservative. Blocked or quarantined items are not applied. |
| Giving AI | In progress | Stages reviewable markdown dispatches in `.vnem/staging/`, can promote approved markdown into `.vnem/approved/`, previews safe branch plans through the app server, and has a confirmed prepare endpoint for `vnem-giving/<slug>` review branches. | Approval moves markdown only today. Research-derived implementation output must go to a `vnem-giving/<slug>` branch before manual review; it must not directly touch `main`. |
| VNEM Connectors | Foundation | Detects local AI clients, previews config changes, and supports explicit apply/revert style connector flows. | Never fake connected state. Preview before apply. Show errors honestly. |
| VNEM AI | Planned | Future customizable AI surface with provider settings, modes, tools, rules, personality, local/cloud model support, and app-builder/prompt/security workflows. | Do not present this as implemented until the repo contains working UI/API behavior and validation. |

## Pipeline contract

The current dashboard should make the pipeline legible:

1. Research AI finds a candidate from a configured route.
2. Research AI records source URL, route, title, score/trust hints, and why it might matter.
3. Protection AI checks provenance, license/permission concerns, package/install surface, suspicious commands, binary/download flags, and threat score.
4. Protection AI normalizes the candidate into one verdict: `allow`, `needs-review`, `quarantine`, or `blocked`.
5. Giving AI receives only allowed/reviewable work and stages markdown for owner review.
6. The dashboard owner approves or rejects the staged markdown.
7. Approved markdown moves to `.vnem/approved/`; rejected markdown is deleted from `.vnem/staging/`.

## Improvement Mission Engine v1

The dashboard now derives one focused VNEM improvement mission from live telemetry when the app server is connected, or from dashboard summary/sample findings when it is offline/demo. The mission engine is a current dashboard/state-derivation layer; it does not pretend that backend git automation is live.

A mission answers:

- what VNEM improvement is being researched;
- which routes/sources Research AI is using;
- which candidates were found;
- what verdict Protection AI assigned;
- which candidates are eligible for Giving AI;
- which candidates are quarantined or blocked;
- what safe `vnem-giving/<slug>` branch would receive future implementation work;
- what validation and manual review must happen before `main` changes.

Current implemented behavior:

1. Dashboard mission derivation maps `active_ingestions`, summary findings, telemetry mission targets, existing verdicts, staged dispatches, approved dispatches, and route/source metadata into a mission model.
2. The mission UI shows Research AI -> Protection AI -> Giving AI -> Safe Branch -> Manual Review -> Main.
3. Verdict counters show allowed, needs-review, quarantined, and blocked candidates.
4. The branch lane shows the planned branch name, base branch (`main`), included candidates, isolated candidates, validation status, push status, and review status.
5. Branch preview calls the local app-server preview endpoint and does not mutate git.
6. Branch preparation is backend-supported only through explicit confirmation (`confirm: "prepare-giving-branch"`), clean-main checks, branch-name checks, a branch-plan file, validation, and push to the review branch. Dashboard prepare remains disabled until the confirmation/review UX is added, so it cannot fake or accidentally trigger branch writes.

Backend branch preparation behavior:

1. Preview accepts a candidate plan and returns the branch name, base branch, included/excluded candidates, blocked IDs, required checks, validation commands, and manual-review status without mutating git.
2. Prepare requires explicit `confirm: "prepare-giving-branch"` so branch writes cannot happen from an accidental dashboard click.
3. Prepare creates a branch named `vnem-giving/<short-slug>` from a clean `main` worktree.
4. Included candidates must have verdict `allow`, or `needs-review` after explicit maintainer review is satisfied.
5. Prepare refuses any included `quarantine` or `blocked` candidate.
6. Prepare writes a reviewable branch-plan file under `discovery/branch-plans/`, commits it on the Giving branch, runs configured validation, and pushes only the review branch after validation passes.
7. Prepare never pushes or merges `main`; `main` changes require a separate manual review/merge action.

## Giving AI safe branch contract

Research-derived Giving AI implementation output must use this branch-first contract instead of direct `main` writes:

```js
{
  branchName: "vnem-giving/<slug>",
  baseBranch: "main",
  sourceMissionId: "...",
  includedCandidates: [],
  protectionVerdicts: [],
  changedFiles: [],
  validationCommands: [],
  validationStatus: "not-run",
  commitHash: null,
  pushStatus: "not-pushed",
  reviewStatus: "waiting-for-manual-review",
  rollbackNotes: []
}
```

Rules:

- Branches start from `main`.
- Giving AI must not commit directly to `main`.
- `quarantine` and `blocked` candidates cannot be included.
- `needs-review` candidates require explicit maintainer review before risky use.
- No branch push if validation fails.
- No branch push if unrelated changes, secrets, unsafe execution, or unclear provenance are detected.
- Manual review is required before any merge to `main`.

## Formal Protection AI verdict contract

| Verdict | Meaning | Giving AI gate | Human review |
| --- | --- | --- | --- |
| `allow` | No blocking issue was found in the available metadata/checks. This does **not** prove the item is 100% safe. | May move toward Giving AI staging or maintainer review. | No extra review flag from this verdict, but risky changes still require normal maintainer judgment. |
| `needs-review` | The item may be useful, but open questions remain: missing license, unclear permissions, weak source, unknown install surface, incomplete metadata, or low confidence. | Eligible only as reviewable work; risky application should wait. | Inspect source, license, permissions, install surface, and metadata confidence before use. |
| `quarantine` | Suspicious or high-risk signals exist: suspicious binaries, unclear installers, privileged commands, secret requests, dangerous package behavior, or similar. | Not eligible for Giving AI application paths. | Keep isolated for audit/research until deeper review clears it. |
| `blocked` | Strong unsafe indicators exist: malware/scam/credential theft/exploit/destructive automation/unsafe persistence or equivalent. | Must not reach Giving AI. | Do not apply, install, execute, or recommend as safe. |

Current dashboard code derives this verdict from existing candidate shapes including `repository_review.verdict`, `protection_report`, `risk_flags`, threat/trust scores, `recommended_action`, and older statuses like `isolated_by_protection`. The UI shows the verdict badge, short reason, threat/trust scores when available, next action, whether Giving AI is eligible, and whether maintainer review is required.

Current backend behavior stages/reviews markdown rather than applying code. The verdict contract clarifies and visualizes the gate; it does not claim complete malware scanning, execute discovered repos, install packages, or make Giving AI auto-apply changes.

## Dashboard Command Center and real work status

The dashboard now prioritizes one action-oriented workflow at the top instead of leading with many large telemetry panels:

```text
Current Mission -> Research Status -> Protection Decision -> Giving Branch -> Manual Review
```

The Command Center is a current UI/state-derivation layer. It does not fake AI autonomy. It derives a real work status from connected telemetry, provider state, mission candidates, branch preview results, route errors, and sample/offline state. Possible statuses include idle/offline, researching, Protection reviewing, waiting for review, ready for branch preview, branch preview ready, branch prepared/pushed, blocked, provider backoff, and backend offline.

The top card must say:

- the active mission;
- whether the backend is live;
- whether data is live, sample/summary, fallback, or stale;
- what the current blocker is;
- what action should be clicked next;
- whether branch preview is available;
- whether a branch has actually been previewed, prepared, committed, or pushed.

Raw findings, maintainer notes, connector details, mission controls, and logs are secondary details. They should not bury the current mission, blocker, candidate queue, or safe branch status.

## Candidate triage layer

When many candidates are stuck at `needs-review`, the dashboard should not show only a scary raw count. The triage helper groups candidates into actionable reasons:

- top 5 review candidates;
- branch-eligible candidates;
- already indexed;
- missing license;
- weak source / social signal;
- likely duplicate or low signal;
- needs primary source;
- suspicious package/install surface;
- quarantined;
- blocked.

This layer does not magically allow unsafe work. It explains why candidates are stuck and points the user at the small set most likely to move forward. If 161 candidates are all `needs-review`, the correct behavior is to say why and recommend reviewing the top 5, not to dump all 161 as the main view.

## Current dashboard quality bar

The dashboard should answer these questions without requiring the user to read source code:

- Is telemetry live or offline?
- Is OpenRouter active, paused for backoff, rate-limited, missing, or using deterministic fallback?
- What is the active mission?
- Which pipeline stage owns the current work?
- Did Protection AI allow, flag for review, quarantine, or block the item?
- Can Giving AI touch the item, or is it isolated from application paths?
- Is there a Giving AI dispatch waiting for review?
- Which safe branch would receive research-derived implementation work?
- Is `main` protected behind manual review?
- What should the user do next?
- Which features are implemented now vs planned later?

## Safety notes

- VNEM Core remains protected and read-only.
- The app/dashboard may perform explicit local review actions, but those actions must be narrow and auditable.
- Protection AI verdicts are `allow`, `needs-review`, `quarantine`, and `blocked`; `allow` means allowed by current checks, not proven safe.
- `quarantine` and `blocked` are isolated from Giving AI application paths.
- Connector changes require preview/apply/revert style controls.
- Future VNEM AI and full platform surfaces should be prepared for in architecture and copy, but not faked.
