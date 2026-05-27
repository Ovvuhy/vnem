#!/usr/bin/env bash
set -euo pipefail

if [ -f /etc/hermes/hermes-brain.env ]; then
  set -a
  # shellcheck disable=SC1091
  . /etc/hermes/hermes-brain.env
  set +a
fi

HERMES_HOME="${HERMES_HOME:-/home/hermes/.hermes}"
if [ -f "$HERMES_HOME/.env" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$HERMES_HOME/.env"
  set +a
fi

if [ "${HERMES_BRAIN_ENABLED:-1}" != "1" ]; then
  echo "Hermes brain disabled by HERMES_BRAIN_ENABLED."
  exit 0
fi

provider="${HERMES_BRAIN_PROVIDER:-openrouter}"
if [ "$provider" = "openrouter" ] && [ -z "${OPENROUTER_API_KEY:-}" ]; then
  echo "Skipping Hermes brain run: OPENROUTER_API_KEY is not configured."
  exit 0
fi

repo_dir="${VNEM_REPO_DIR:-/opt/vnem}"
cd "$repo_dir"
start_branch="$(git branch --show-current 2>/dev/null || true)"

mkdir -p "$HERMES_HOME/logs"

if [ -n "${HERMES_BRAIN_PROMPT:-}" ]; then
  prompt="$HERMES_BRAIN_PROMPT"
else
  prompt="$(cat <<'PROMPT'
You are Hermes, the living maintainer brain for vnem.

Work only inside the current repository. Start by reading HERMES.md, README.md, discovery/README.md, the newest discovery/candidates/hermes*.json reports, and discovery/daily-digest.md if present.

Your mission:
- Turn fresh source-backed signals into useful, reviewable repo improvements.
- Prefer small candidate reports, digest updates, and conservative registry proposals.
- Keep every change safe for maintainers to review.

Allowed actions:
- Edit discovery/daily-digest.md.
- Add or update discovery notes and candidate reports.
- Add registry/entries/{slug}/entry.yaml and profile.md only when evidence is strong enough for maintainer review.
- Run npm run validate.
- Run npm run generate and npm run test:install-pack only when registry entries changed.
- Use git status and git diff to summarize changes.
- If push credentials are available, create a branch named hermes/brain-YYYYMMDD-HHMM, commit only your relevant changes, push it, and open a draft PR if tooling/API credentials make that possible.
- Leave the VPS worktree on the branch you found at startup. If you create or checkout another branch, return to the original branch before exiting.

Safety rules:
- Do not execute discovered repositories.
- Do not install candidate packages.
- Do not copy third-party source code.
- Do not use paid APIs other than this LLM call unless explicitly configured.
- Do not merge to main.
- Do not rewrite unrelated local changes.
- Do not touch secrets.

Output a concise final report with:
- what you inspected
- what you changed
- checks run
- whether a branch/PR was created
- what still needs maintainer attention
PROMPT
)"
fi

skills="${HERMES_BRAIN_SKILLS:-codebase-inspection,github-repo-management,github-pr-workflow}"
args=(
  /home/hermes/.local/bin/hermes
  --provider "$provider"
  --skills "$skills"
  -z "$prompt"
)

if [ -n "${HERMES_BRAIN_MODEL:-}" ]; then
  args+=(--model "$HERMES_BRAIN_MODEL")
fi

set +e
"${args[@]}" 2>&1 | tee -a "$HERMES_HOME/logs/vnem-brain.log"
status=${PIPESTATUS[0]}
set -e

if [ "${HERMES_BRAIN_RESTORE_BRANCH:-1}" = "1" ] && [ -n "$start_branch" ]; then
  current_branch="$(git branch --show-current 2>/dev/null || true)"
  if [ -n "$current_branch" ] && [ "$current_branch" != "$start_branch" ]; then
    git checkout "$start_branch" || echo "Warning: could not restore startup branch $start_branch"
  fi
fi

exit "$status"
