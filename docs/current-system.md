# VNEM Current System Map

VNEM is being built as an AI-improvement platform, but the repo should stay honest about what exists today.

## Current implemented / in-progress surfaces

| Surface | Status | What it does now | Boundary |
| --- | --- | --- | --- |
| VNEM Core | Implemented | Provides the protected read-only install pack, source radar, registry data, rubrics, prompts, best-practice notes, quality gates, and generated LLM/API artifacts. | The install pack is guidance/data. It does not install packages, execute tools, collect secrets, or edit app code. |
| VNEM App / Dashboard | In progress | Shows owner-gated dashboard status, local AI client connector status, targeting controls, pipeline telemetry, findings, route health, provider state, and staged dispatch review. | It must label live, sample, fallback, preview, and planned states clearly. |
| Research AI | In progress | Accepts dashboard targets, queries configured source routes, ranks candidates, and emits source-backed telemetry when the local app server is running. | A source signal is not approval. It must pass Protection AI before Giving AI can stage anything. |
| Protection AI | In progress | Reviews candidate provenance, route metadata, package surfaces, permissions, flags, threat score, and block/isolate decisions. | It should be conservative. Blocked or isolated items are not applied. |
| Giving AI | In progress | Stages reviewable markdown dispatches in `.vnem/staging/` and can promote approved markdown into `.vnem/approved/`. | Approval moves markdown only. It does not execute code, install packages, commit changes, or touch external systems. |
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

## Formal Protection AI verdict contract

| Verdict | Meaning | Giving AI gate | Human review |
| --- | --- | --- | --- |
| `allow` | No blocking issue was found in the available metadata/checks. This does **not** prove the item is 100% safe. | May move toward Giving AI staging or maintainer review. | No extra review flag from this verdict, but risky changes still require normal maintainer judgment. |
| `needs-review` | The item may be useful, but open questions remain: missing license, unclear permissions, weak source, unknown install surface, incomplete metadata, or low confidence. | Eligible only as reviewable work; risky application should wait. | Inspect source, license, permissions, install surface, and metadata confidence before use. |
| `quarantine` | Suspicious or high-risk signals exist: suspicious binaries, unclear installers, privileged commands, secret requests, dangerous package behavior, or similar. | Not eligible for Giving AI application paths. | Keep isolated for audit/research until deeper review clears it. |
| `blocked` | Strong unsafe indicators exist: malware/scam/credential theft/exploit/destructive automation/unsafe persistence or equivalent. | Must not reach Giving AI. | Do not apply, install, execute, or recommend as safe. |

Current dashboard code derives this verdict from existing candidate shapes including `repository_review.verdict`, `protection_report`, `risk_flags`, threat/trust scores, `recommended_action`, and older statuses like `isolated_by_protection`. The UI shows the verdict badge, short reason, threat/trust scores when available, next action, whether Giving AI is eligible, and whether maintainer review is required.

Current backend behavior stages/reviews markdown rather than applying code. The verdict contract clarifies and visualizes the gate; it does not claim complete malware scanning, execute discovered repos, install packages, or make Giving AI auto-apply changes.

## Current dashboard quality bar

The dashboard should answer these questions without requiring the user to read source code:

- Is telemetry live or offline?
- Is OpenRouter active, paused for backoff, rate-limited, missing, or using deterministic fallback?
- What is the active mission?
- Which pipeline stage owns the current work?
- Did Protection AI allow, flag for review, quarantine, or block the item?
- Can Giving AI touch the item, or is it isolated from application paths?
- Is there a Giving AI dispatch waiting for review?
- What should the user do next?
- Which features are implemented now vs planned later?

## Safety notes

- VNEM Core remains protected and read-only.
- The app/dashboard may perform explicit local review actions, but those actions must be narrow and auditable.
- Protection AI verdicts are `allow`, `needs-review`, `quarantine`, and `blocked`; `allow` means allowed by current checks, not proven safe.
- `quarantine` and `blocked` are isolated from Giving AI application paths.
- Connector changes require preview/apply/revert style controls.
- Future VNEM AI and full platform surfaces should be prepared for in architecture and copy, but not faked.
