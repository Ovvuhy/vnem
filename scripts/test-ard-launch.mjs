#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const oldWallet = "76ZuJidMzB32EQLLiCL8UPQATQFoY2mrqZa3Kvr8PZhp";
const newWallet = "H62Ri1EExddxFKsLMn4nbmbxiCSxNRLtF8igPySLA23B";
const requiredWallets = [newWallet];
const walletAllowlist = requiredWallets.join(",");
const [ardDev, ardLaunch, pkg, envExample] = await Promise.all([
  readFile("scripts/ard-dev.mjs", "utf8"),
  readFile("scripts/ard-launch.mjs", "utf8"),
  readFile("package.json", "utf8"),
  readFile(".env.example", "utf8")
]);

const scripts = JSON.parse(pkg).scripts;
assert.equal(scripts["ard:backend"], "node scripts/vnem-app-server.mjs --port 9099");
assert.equal(scripts["ard:dashboard"], "npm run dashboard:dev -- --host 127.0.0.1");
assert.equal(scripts["ard:dev"], "node scripts/ard-dev.mjs");
assert.match(ardDev, /Backend URL:\s+\$\{backendUrl\}/, "ARD dev must report backend URL");
assert.match(ardDev, /Dashboard URL:\s+\$\{dashboardUrl\}/, "ARD dev must report dashboard URL");
assert.match(ardDev, /scripts\/vnem-app-server\.mjs/, "ARD dev must start backend when needed");
assert.match(ardDev, /Backend port 9099 is occupied by an unknown process\. Refusing/, "ARD dev must not open broken dashboard on unknown backend port");
assert.match(ardDev, /DASHBOARD_ALLOWED_WALLETS/, "ARD dev must pass local wallet allowlist to backend");
for (const wallet of requiredWallets) {
  assert.match(ardDev, new RegExp(wallet), `ARD dev must include local wallet ${wallet}`);
  assert.match(ardLaunch, new RegExp(wallet), `ARD health must print local wallet ${wallet}`);
}
assert.doesNotMatch(ardDev, new RegExp(oldWallet), "ARD dev default allowlist must not include the old wallet");
assert.doesNotMatch(ardLaunch, new RegExp(oldWallet), "ARD health default allowlist must not print the old wallet");
assert.match(ardLaunch, /npm run ard:backend/, "ARD health must show backend split command");
assert.match(envExample, new RegExp(`DASHBOARD_ALLOWED_WALLETS=${walletAllowlist}`), "env example must document local wallet allowlist");
assert.doesNotMatch(ardDev, /taskkill|Stop-Process|execSync|clearDevelopmentPorts/i, "ARD dev must not force-kill existing backend/dashboard processes");
console.log("ARD launch tests passed");
