#!/usr/bin/env node
import { spawn } from "node:child_process";
import process from "node:process";
import { inspectVnemDevHealth } from "./vnem-dev-health.mjs";

const backendUrl = "http://127.0.0.1:9099";
const dashboardUrl = "http://127.0.0.1:4174/dashboard/?mock&v=ard";
const localWallets = [
  "76ZuJidMzB32EQLLiCL8UPQATQFoY2mrqZa3Kvr8PZhp",
  "H62Ri1EExddxFKsLMn4nbmbxiCSxNRLtF8igPySLA23B"
].join(",");
const localWallet = process.env.DASHBOARD_ALLOWED_WALLETS ?? localWallets;
const children = [];
let shuttingDown = false;

const report = await inspectVnemDevHealth();
const backend = report.ports.find((entry) => Number(entry.port) === 9099);
const dashboard = report.ports.find((entry) => Number(entry.port) === 4174) ?? report.ports.find((entry) => Number(entry.port) === 4175);

console.log("ARD — AI Research Dashboard");
console.log(`Backend URL:   ${backendUrl}`);
console.log(`Dashboard URL: ${dashboardUrl}`);
console.log(`Local allowed wallet: ${localWallet}`);
console.log(`Backend status:   ${backend?.listening ? (backend.looksLikeVnemAppServer ? "running" : "occupied by unknown process") : "not running"}`);
console.log(`Dashboard status: ${dashboard?.listening ? `running on ${dashboard.port}` : "not running"}`);
console.log("");

if (backend?.listening && !backend.looksLikeVnemAppServer) {
  console.error("Backend port 9099 is occupied by an unknown process. Refusing to start a broken ARD dashboard.");
  console.error("Run npm run dev:health, clear the conflicting process manually, then run npm run ard:dev again.");
  process.exit(1);
}

if (!backend?.listening) {
  start("backend", process.execPath, ["scripts/vnem-app-server.mjs", "--port", "9099"], {
    DASHBOARD_ALLOWED_WALLETS: localWallet,
    DASHBOARD_AUTH_SECRET: process.env.DASHBOARD_AUTH_SECRET ?? "vnem-local-dashboard-dev-secret"
  });
} else {
  console.log("Reusing existing VNEM backend on 9099.");
}

if (!dashboard?.listening) {
  start("dashboard", process.execPath, ["node_modules/vite/bin/vite.js", "--config", "dashboard/vite.config.js", "--host", "127.0.0.1"], {
    VITE_VNEM_APP_SERVER_URL: backendUrl,
    VITE_HERMES_DASHBOARD_API_TARGET: backendUrl,
    VITE_DASHBOARD_LOCAL_ALLOWED_WALLET: localWallet
  });
} else {
  console.log(`Reusing existing dashboard dev server on ${dashboard.port}.`);
}

console.log("");
console.log("Open ARD:");
console.log(`  ${dashboardUrl}`);
console.log("If auth fails, confirm the connected wallet matches the local allowed wallet above.");
console.log("Press Ctrl+C to stop ARD processes started by this command.");

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => shutdown(signal));
}

function start(label, command, args, env = {}) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"]
  });
  children.push({ label, child });
  child.stdout.on("data", (chunk) => process.stdout.write(`[${label}] ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`[${label}] ${chunk}`));
  child.on("exit", (code, signal) => {
    if (!shuttingDown && code !== 0) {
      console.error(`[${label}] exited unexpectedly with code ${code ?? "null"} signal ${signal ?? "null"}`);
    }
  });
  return child;
}

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\nARD dev shutting down (${signal}).`);
  for (const { child } of children) {
    if (!child.killed) child.kill();
  }
  setTimeout(() => process.exit(0), 300);
}
