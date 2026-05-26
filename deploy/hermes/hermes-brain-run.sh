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

mkdir -p "$HERMES_HOME/logs"

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

args=(
  /home/hermes/.local/bin/hermes
  --provider "$provider"
  --skills codebase-inspection,github-repo-management,github-pr-workflow
  -z "$prompt"
)

if [ -n "${HERMES_BRAIN_MODEL:-}" ]; then
  args+=(--model "$HERMES_BRAIN_MODEL")
fi

"${args[@]}" 2>&1 | tee -a "$HERMES_HOME/logs/vnem-brain.log"
