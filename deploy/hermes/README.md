# Hermes VPS Runtime

Hermes is meant to run from a dedicated clone of this repository on a VPS. The systemd timers call the Node runner, which writes discovery reports, validates the registry, commits changes, pushes a branch, and opens a draft PR when credentials are configured.

## 1. Create A Dedicated Clone

```bash
sudo useradd --system --create-home --shell /bin/bash hermes
sudo mkdir -p /opt/vnem
sudo chown hermes:hermes /opt/vnem
sudo -u hermes git clone https://github.com/YOUR_ORG/YOUR_REPO.git /opt/vnem
cd /opt/vnem
sudo -u hermes npm install
```

Use SSH remotes or a deploy token for pushing branches. Keep this clone dedicated to Hermes so the dirty-worktree guard can protect normal maintainer work.

## 2. Configure Environment

```bash
sudo mkdir -p /etc/hermes
sudo cp deploy/hermes/hermes.env.example /etc/hermes/hermes.env
sudo chmod 600 /etc/hermes/hermes.env
sudo editor /etc/hermes/hermes.env
```

Required for PR creation:

- `GITHUB_TOKEN`: token or GitHub App installation token with contents, pull request, and metadata access.
- `HERMES_GITHUB_REPO`: `owner/repo`.

Useful optional settings:

- `HERMES_GIT_SYNC=1`: fetch, checkout, and fast-forward `main` before each run.
- `HERMES_CREATE_PR=0`: write local reports without committing or opening PRs.
- `HERMES_PROPOSE_REGISTRY=1`: draft conservative `registry/entries/*` proposals from top non-duplicate candidates.
- `HERMES_WATCH_URLS`: newline or semicolon separated official changelog/docs URLs for daily source-change checks.
- `HERMES_GITHUB_QUERIES`: newline, semicolon, or JSON array of GitHub search queries.
- `HERMES_RELEASE_REPOS`: watched `owner/repo` list for latest GitHub releases.
- `HERMES_NPM_QUERIES`: npm package search queries for MCP servers, coding agents, memory, evals, and agent tooling.
- `HERMES_HN_QUERIES`: Hacker News lead-generation queries. These candidates stay `watchlist` until backed by primary sources.
- `HERMES_INCLUDE_REDDIT=1`: opt into Reddit subreddit search. Keep disabled when public polling is not desired.
- `HERMES_MIN_PER_ROUTE=2`: reserve candidate slots for smaller routes so GitHub search does not crowd them out.

Route toggles:

- `HERMES_INCLUDE_MCP_REGISTRY=0`
- `HERMES_INCLUDE_GITHUB_RELEASES=0`
- `HERMES_INCLUDE_NPM=0`
- `HERMES_INCLUDE_HACKER_NEWS=0`
- `HERMES_INCLUDE_REDDIT=1`

## 3. Install Timers

```bash
sudo cp deploy/hermes/systemd/hermes-hourly.service /etc/systemd/system/
sudo cp deploy/hermes/systemd/hermes-hourly.timer /etc/systemd/system/
sudo cp deploy/hermes/systemd/hermes-daily.service /etc/systemd/system/
sudo cp deploy/hermes/systemd/hermes-daily.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now hermes-hourly.timer hermes-daily.timer
```

Check status and logs:

```bash
systemctl list-timers 'hermes-*'
journalctl -u hermes-hourly.service -n 100 --no-pager
journalctl -u hermes-daily.service -n 100 --no-pager
```

## Manual Runs

```bash
npm run hermes:dry-run
npm run hermes:hourly
npm run hermes:daily
```

The dry run prints the report JSON and does not write files, create branches, push, or open PRs.

## Optional Owner Dashboard API

The owner dashboard reads a narrow, sanitized JSON summary from the VPS. Keep the service bound to localhost and expose it through Cloudflare Tunnel so the VPS does not need an inbound dashboard port.

Add these values to `/etc/hermes/hermes.env`:

```bash
VNEM_REPO_DIR=/opt/vnem
HERMES_DASHBOARD_API_HOST=127.0.0.1
HERMES_DASHBOARD_API_PORT=8788
HERMES_DASHBOARD_API_TOKEN=
```

Install the service:

```bash
sudo cp deploy/hermes/systemd/hermes-dashboard-api.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now hermes-dashboard-api.service
curl -H "Authorization: Bearer $HERMES_DASHBOARD_API_TOKEN" http://127.0.0.1:8788/summary
```

Create a Cloudflare Tunnel route to `http://127.0.0.1:8788`, then set the Cloudflare Pages secrets:

```bash
npx wrangler pages secret put DASHBOARD_AUTH_SECRET --project-name vnem
npx wrangler pages secret put DASHBOARD_ALLOWED_WALLETS --project-name vnem
npx wrangler pages secret put HERMES_API_BASE_URL --project-name vnem
npx wrangler pages secret put HERMES_API_TOKEN --project-name vnem
```

`HERMES_API_TOKEN` in Cloudflare must match `HERMES_DASHBOARD_API_TOKEN` on the VPS. The browser never receives this token; it only talks to the same-origin Pages Function.

## Optional Nous Hermes Brain

The deterministic scout can be paired with the Nous Research Hermes Agent CLI. Install the agent as the `hermes` user, then copy `deploy/hermes/hermes-brain.env.example` to `/etc/hermes/hermes-brain.env` and set `OPENROUTER_API_KEY`.

The brain runner uses `hermes -z` one-shot mode from `/opt/vnem`. It reads the latest candidate reports and may draft digest updates or conservative registry proposals. It skips cleanly when no model API key is configured.

```bash
sudo cp deploy/hermes/hermes-brain.env.example /etc/hermes/hermes-brain.env
sudo chown root:hermes /etc/hermes/hermes-brain.env
sudo chmod 640 /etc/hermes/hermes-brain.env
sudo cp deploy/hermes/systemd/hermes-brain.service /etc/systemd/system/
sudo cp deploy/hermes/systemd/hermes-brain.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now hermes-brain.timer
```
