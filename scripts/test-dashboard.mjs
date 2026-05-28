#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import bs58 from "bs58";
import nacl from "tweetnacl";
import {
  createLoginChallenge,
  createSessionCookie,
  readSession,
  verifySignedLogin
} from "../landing/functions/_shared/auth.js";
import { onRequestGet as dashboardSummary } from "../landing/functions/api/dashboard/summary.js";
import { buildHermesDashboardSummary } from "./lib/hermes-dashboard-summary.mjs";

const textEncoder = new TextEncoder();

await testWalletAuth();
await testSummaryBuilder();
await testPagesSummaryProxy();
await testDashboardFiles();

console.log("dashboard tests passed");

async function testWalletAuth() {
  const keyPair = nacl.sign.keyPair();
  const walletAddress = bs58.encode(keyPair.publicKey);
  const env = {
    DASHBOARD_AUTH_SECRET: "test-secret-with-enough-entropy",
    DASHBOARD_ALLOWED_WALLETS: walletAddress
  };
  const now = new Date("2026-05-27T12:00:00.000Z");
  const challenge = await createLoginChallenge({
    walletAddress,
    origin: "https://vnem.pages.dev",
    now
  }, env);
  const signature = bs58.encode(nacl.sign.detached(textEncoder.encode(challenge.message), keyPair.secretKey));

  const login = await verifySignedLogin({
    challenge: challenge.challenge,
    walletAddress,
    signature,
    message: challenge.message,
    now
  }, env);
  assert.equal(login.wallet_address, walletAddress);

  const cookie = await createSessionCookie(login, env, { now });
  const session = await readSession(new Request("https://vnem.pages.dev/dashboard/", {
    headers: { cookie }
  }), env, { now });
  assert.equal(session.wallet_address, walletAddress);

  await assert.rejects(
    () => verifySignedLogin({
      challenge: `${challenge.challenge}x`,
      walletAddress,
      signature,
      message: challenge.message,
      now
    }, env),
    /invalid-token-signature/
  );

  await assert.rejects(
    () => verifySignedLogin({
      challenge: challenge.challenge,
      walletAddress,
      signature,
      message: challenge.message.replace(walletAddress, "DifferentWallet11111111111111111111111111111"),
      now
    }, env),
    /signed-message-does-not-match-challenge/
  );

  await assert.rejects(
    () => verifySignedLogin({
      challenge: challenge.challenge,
      walletAddress,
      signature: bs58.encode(new Uint8Array(64)),
      message: challenge.message,
      now
    }, env),
    /invalid-wallet-signature/
  );

  await assert.rejects(
    () => verifySignedLogin({
      challenge: challenge.challenge,
      walletAddress,
      signature,
      message: challenge.message,
      now: new Date("2026-05-27T12:06:00.000Z")
    }, env),
    /login-challenge-expired/
  );

  await assert.rejects(
    () => createLoginChallenge({
      walletAddress,
      origin: "https://vnem.pages.dev",
      now
    }, { ...env, DASHBOARD_ALLOWED_WALLETS: "DifferentWallet11111111111111111111111111111" }),
    /wallet-not-allowlisted/
  );

  const expired = await readSession(new Request("https://vnem.pages.dev/dashboard/", {
    headers: { cookie }
  }), env, { now: new Date("2026-05-28T01:00:00.000Z") });
  assert.equal(expired, null);
}

async function testSummaryBuilder() {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "vnem-dashboard-test-"));
  const candidateDir = path.join(rootDir, "discovery", "candidates");
  await mkdir(candidateDir, { recursive: true });
  await writeFile(path.join(candidateDir, "hermes-2026-05-27T12.json"), JSON.stringify({
    generated_at: "2026-05-27T12:00:00.000Z",
    mode: "hourly",
    source_routes: ["github-search", "npm-search"],
    candidates: [
      {
        source_route: "github-search",
        name: "owner/agent",
        title: "Agent Tool",
        source_url: "https://github.com/owner/agent",
        signal_summary: "Fresh agent tool. OPENROUTER_API_KEY=test-openrouter-key",
        suggested_trust_tier: "unreviewed",
        risk_flags: ["sensitive-permissions", "binary-download"],
        repository_review: {
          verdict: "blocked",
          risk_score: 82,
          trust_score: 18,
          flags: ["binary-download"],
          reasons: ["README or release text tells users to download/run an executable or installer."],
          reviewed_at: "2026-05-27T12:00:00.000Z"
        },
        recommended_action: "blocked",
        reason: "candidate",
        metrics: { stars: 42, license: "MIT", pushed_at: "2026-05-27T11:30:00.000Z", repo_risk_score: 82, repo_trust_score: 18, repo_verdict: "blocked" }
      }
    ],
    watched_sources: [],
    errors: [{ route: "npm-search", query: "agent memory", error: "timeout" }]
  }, null, 2));
  await writeFile(path.join(candidateDir, "invalid.json"), "{");
  await mkdir(path.join(rootDir, "discovery"), { recursive: true });
  await writeFile(path.join(rootDir, "discovery", "daily-digest.md"), [
    "# vnem Daily Signals",
    "",
    "Generated: 2026-05-27T12:00:00.000Z",
    "",
    "Hermes digest body.",
    "",
    "## Maintainer Actions",
    "",
    "- Review candidate reports.",
    "- Promote only after primary-source checks.",
    ""
  ].join("\n"));

  const summary = await buildHermesDashboardSummary({
    rootDir,
    now: new Date("2026-05-27T13:00:00.000Z"),
    runCommand(command, args) {
      if (args.join(" ") === "status --porcelain") return "";
      if (args.join(" ") === "branch --show-current") return "main\n";
      if (args.join(" ") === "rev-parse --short HEAD") return "abc123\n";
      return "";
    },
    systemctlShow(unit) {
      if (unit.endsWith(".timer")) {
        return "ActiveState=active\nSubState=waiting\nNextElapseUSecRealtime=Wed 2026-05-27 14:00:00 CEST\nLastTriggerUSecRealtime=Wed 2026-05-27 13:00:00 CEST\n";
      }
      return "ActiveState=inactive\nResult=success\nExecMainStatus=0\n";
    }
  });

  assert.equal(summary.repo_status.clean, true);
  assert.equal(summary.findings.length, 1);
  assert.equal(summary.findings[0].signal_summary.includes("test-openrouter-key"), false);
  assert.equal(summary.aggregates.by_route["github-search"], 1);
  assert.equal(summary.findings[0].repository_review.verdict, "blocked");
  assert.equal(summary.findings[0].metrics.repo_risk_score, 82);
  assert.equal(summary.aggregates.by_action.blocked, 1);
  assert.equal(summary.errors.some((error) => error.route === "npm-search"), true);
  assert.equal(summary.errors.some((error) => error.route === "candidate-report"), true);
  assert.equal(summary.digest.maintainer_actions.length, 2);
  assert.equal(summary.timers.hourly.active_state, "active");
}

async function testPagesSummaryProxy() {
  const keyPair = nacl.sign.keyPair();
  const walletAddress = bs58.encode(keyPair.publicKey);
  const env = {
    DASHBOARD_AUTH_SECRET: "proxy-secret",
    DASHBOARD_ALLOWED_WALLETS: walletAddress,
    HERMES_API_BASE_URL: "https://hermes.example.com",
    HERMES_API_TOKEN: "vps-token"
  };
  const now = new Date("2026-05-27T12:00:00.000Z");
  const cookie = await createSessionCookie({
    wallet_address: walletAddress,
    expires_at: new Date("2030-05-27T13:00:00.000Z").toISOString()
  }, env, { now });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "https://hermes.example.com/summary");
    assert.equal(init.headers.authorization, "Bearer vps-token");
    return new Response(JSON.stringify({ generated_at: "2026-05-27T12:00:00.000Z", findings: [] }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  try {
    const response = await dashboardSummary({
      request: new Request("https://vnem.pages.dev/api/dashboard/summary", { headers: { cookie } }),
      env
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.generated_at, "2026-05-27T12:00:00.000Z");

    const denied = await dashboardSummary({
      request: new Request("https://vnem.pages.dev/api/dashboard/summary"),
      env
    });
    assert.equal(denied.status, 401);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function testDashboardFiles() {
  for (const filePath of [
    "dashboard/index.html",
    "dashboard/src/App.jsx",
    "landing/dashboard/index.html",
    "landing/functions/api/auth/nonce.js",
    "landing/functions/api/auth/verify.js",
    "landing/functions/api/dashboard/summary.js",
    "deploy/hermes/systemd/hermes-dashboard-api.service"
  ]) {
    assert.equal(existsSync(filePath), true, `expected ${filePath}`);
  }

  const workflow = await readFile(".github/workflows/deploy-cloudflare-pages.yml", "utf8");
  assert.ok(workflow.includes("npm run dashboard:build"));
  assert.ok(workflow.includes("npm run test:dashboard"));

  const dashboardHtml = await readFile("landing/dashboard/index.html", "utf8");
  const referencedAssets = [...dashboardHtml.matchAll(/(?:src|href)="\/dashboard\/([^"]+)"/g)]
    .map((match) => match[1])
    .filter((assetPath) => assetPath.startsWith("assets/"));

  assert.ok(referencedAssets.length > 0, "dashboard build must reference compiled assets");
  for (const assetPath of referencedAssets) {
    const filePath = path.join("landing", "dashboard", assetPath);
    assert.equal(existsSync(filePath), true, `dashboard asset missing from deploy directory: ${filePath}`);
  }
}
