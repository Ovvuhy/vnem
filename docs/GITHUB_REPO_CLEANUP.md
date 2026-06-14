# GitHub Repo Cleanup Audit

Last audited: 2026-06-14

This audit is conservative. No remote branches were deleted during ARD Capability Expansion v2.2. Delete only after maintainer confirmation unless every safety condition is clearly satisfied.

GitHub CLI status: `gh` was unavailable in this shell, so open PR/issue/release data is unknown from GitHub API. Branch merge/unique-commit data below comes from local `git fetch --prune origin`, `git branch -r --merged origin/main`, and `git rev-list origin/main..origin/<branch>`.

Branch deletion rules preserved:

- Never delete `main`.
- Never delete `changes-by-ard` during ARD work.
- Never delete an unmerged branch without explicit user confirmation.
- Never delete unknown branches just because they are old.
- Never delete branches with unique commits unless those commits are reviewed and confirmed disposable.

| branch | type | last commit date | last commit sha | merged into origin/main | unique commits count | open PR | safe to delete | action taken | reason |
| --- | --- | --- | --- | --- | ---: | --- | --- | --- | --- |
| main | protected default | 2026-06-14T13:37:43+02:00 | 0aa6f58 | yes | 0 | unknown | no | kept | Default branch. |
| changes-by-ard | protected ARD review lane | 2026-06-13T15:03:34+02:00 | 083e363 | yes | 0 | unknown | no | kept | Reserved branch for ARD protected review work. |
| automation/discovery-candidates | automation/discovery | 2026-06-14T11:09:17Z | 33d34ce | no | 1 | unknown | no | kept | Unmerged unique discovery work; needs maintainer review. |
| codex/hermes-vps-brain | automation/brain | 2026-06-13T09:16:31+02:00 | faa8c7a | no | 13 | unknown | no | kept | Unmerged unique Hermes brain work. |
| develop | historical integration | 2026-05-30T16:32:55+02:00 | 67f50b2 | yes | 0 | unknown | maybe | kept | Merged, but not obviously temporary; user confirmation recommended before deletion. |
| experimental | historical experiment | 2026-05-28T13:31:41+02:00 | 0d94cf1 | yes | 0 | unknown | maybe | kept | Merged, but branch purpose is unclear; user confirmation recommended. |
| hermes/brain-20260529-0730 | automation/brain | 2026-05-29T09:14:17+02:00 | fdf1180 | no | 7 | unknown | no | kept | Unmerged unique daily/hourly brain output. |
| hermes/brain-20260601-0800 | automation/brain | 2026-06-01T09:11:49+02:00 | 9dc7a6e | no | 7 | unknown | no | kept | Unmerged unique daily/hourly brain output. |
| hermes/brain-20260602-0815 | automation/brain | 2026-06-02T09:26:02+02:00 | 2bc088e | no | 7 | unknown | no | kept | Unmerged unique daily/hourly brain output. |
| hermes/brain-20260603-0917 | automation/brain | 2026-06-03T09:18:51+02:00 | 2d3d01f | no | 7 | unknown | no | kept | Unmerged unique daily/hourly brain output. |
| hermes/brain-20260606-0800 | automation/brain | 2026-06-06T09:18:40+02:00 | cff7d62 | no | 9 | unknown | no | kept | Unmerged unique daily/hourly brain output. |
| hermes/brain-20260607-0709 | automation/brain | 2026-06-07T09:15:02+02:00 | e3db594 | no | 9 | unknown | no | kept | Unmerged unique daily/hourly brain output. |
| hermes/brain-20260612-0800 | automation/brain | 2026-06-12T09:15:38+02:00 | 09605ca | no | 13 | unknown | no | kept | Unmerged unique daily/hourly brain output. |
| hermes/brain-20260614-0730 | automation/brain | 2026-06-14T09:14:53+02:00 | b19dde8 | no | 14 | unknown | no | kept | Unmerged unique daily/hourly brain output. |

Recommended cleanup, not performed:

1. Use GitHub UI or `gh pr list --state all` from an authenticated shell to verify open PR state.
2. Consider deleting `develop` and `experimental` only after confirming they are no longer active collaboration branches.
3. Review unmerged `hermes/brain-*`, `codex/hermes-vps-brain`, and `automation/discovery-candidates` branches for candidate/digest value before any deletion.
4. Keep `changes-by-ard` as the protected ARD review lane.
