#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const wallet = "76ZuJidMzB32EQLLiCL8UPQATQFoY2mrqZa3Kvr8PZhp";
const [app, vite, appJs, authShared] = await Promise.all([
  readFile("scripts/vnem-app-server.mjs", "utf8"),
  readFile("dashboard/vite.config.js", "utf8"),
  readFile("dashboard/src/App.jsx", "utf8"),
  readFile("landing/functions/_shared/auth.js", "utf8")
]);

assert.match(app, new RegExp(wallet), "local app server must include requested dev wallet fallback");
assert.match(app, /process\.env\.DASHBOARD_ALLOWED_WALLETS \?\? localDashboardWallet/, "local fallback must not override explicit production/env allowlist");
assert.match(authShared, /allowed\.length > 0 && allowed\.includes\(walletAddress\)/, "shared production auth must require a non-empty explicit allowlist");
assert.doesNotMatch(authShared, /return true;\s*}\s*export function isWalletAllowed/s, "shared auth must not allow every wallet");
assert.match(app, /POST \/api\/auth\/nonce/, "app server must serve local auth nonce");
assert.match(app, /POST \/api\/auth\/verify/, "app server must serve local auth verify");
assert.match(app, /GET \/api\/auth\/session/, "app server must serve local auth session");
assert.match(app, /GET \/api\/dashboard\/summary/, "app server must serve local dashboard summary");
assert.match(vite, /127\.0\.0\.1:9099/, "Vite proxy must default to local app server 9099");
assert.match(vite, /"\/api"/, "Vite proxy must proxy /api including /api/auth and /api/telemetry");
assert.match(appJs, /backend-offline/, "owner gate must map backend offline errors");
assert.match(appJs, /wallet-signing-cancelled/, "owner gate must map user rejected wallet signing");
assert.match(appJs, /wallet-not-allowlisted/, "owner gate must map not-allowlisted wallet");
assert.match(appJs, new RegExp(wallet), "owner gate must display the expected local wallet");
assert.doesNotMatch(appJs, /private.?key/i, "dashboard must not ask for private keys");
console.log("dashboard local auth tests passed");
