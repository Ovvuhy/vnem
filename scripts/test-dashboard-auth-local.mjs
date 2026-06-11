#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { allowedWallets, isWalletAllowed } from "../landing/functions/_shared/auth.js";

const oldWallet = "76ZuJidMzB32EQLLiCL8UPQATQFoY2mrqZa3Kvr8PZhp";
const newWallet = "H62Ri1EExddxFKsLMn4nbmbxiCSxNRLtF8igPySLA23B";
const unknownWallet = "UnknownWallet111111111111111111111111111111";
const requiredWallets = [oldWallet, newWallet];
const [app, vite, appJs, authShared] = await Promise.all([
  readFile("scripts/vnem-app-server.mjs", "utf8"),
  readFile("dashboard/vite.config.js", "utf8"),
  readFile("dashboard/src/App.jsx", "utf8"),
  readFile("landing/functions/_shared/auth.js", "utf8")
]);

const env = { DASHBOARD_ALLOWED_WALLETS: requiredWallets.join(",") };
assert.deepEqual(allowedWallets(env), requiredWallets, "shared auth must parse a comma-separated wallet allowlist");
assert.equal(isWalletAllowed(oldWallet, env), true, "old wallet must remain allowlisted");
assert.equal(isWalletAllowed(newWallet, env), true, "new wallet must be allowlisted");
assert.equal(isWalletAllowed(unknownWallet, env), false, "unknown wallet must still be rejected");
assert.equal(isWalletAllowed(oldWallet, { DASHBOARD_ALLOWED_WALLETS: "*" }), false, "wildcard allow-all must not be accepted");

for (const wallet of requiredWallets) {
  assert.match(app, new RegExp(wallet), `local app server must include dev wallet fallback ${wallet}`);
  assert.match(appJs, new RegExp(wallet), `owner gate must display local wallet ${wallet}`);
}
assert.match(app, /process\.env\.DASHBOARD_ALLOWED_WALLETS \?\? localDashboardWallets/, "local fallback must not override explicit production/env allowlist");
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
assert.match(appJs, /formatWalletAllowlist/, "owner gate diagnostics must format a multi-wallet allowlist clearly");
assert.doesNotMatch(appJs, /private.?key/i, "dashboard must not ask for private keys");
console.log("dashboard local auth tests passed");
