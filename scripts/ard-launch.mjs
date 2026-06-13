#!/usr/bin/env node
import { inspectVnemDevHealth } from "./vnem-dev-health.mjs";

const report = await inspectVnemDevHealth();
const backend = report.ports.find((port) => port.port === 9099);
const dashboard = report.ports.find((port) => port.port === 4174) ?? report.ports.find((port) => port.port === 4175);
console.log("ARD — AI Research Dashboard");
console.log("Backend URL:   http://127.0.0.1:9099");
console.log("Dashboard URL: http://127.0.0.1:4174/dashboard/?mock&v=ard");
console.log(`Backend status:   ${backend?.listening ? "running" : "not running"}`);
console.log(`Dashboard status: ${dashboard?.listening ? `running on ${dashboard.port}` : "not running"}`);
console.log("Local allowed wallets:");
console.log("  H62Ri1EExddxFKsLMn4nbmbxiCSxNRLtF8igPySLA23B");
console.log("");
console.log("To launch ARD backend + dashboard:");
console.log("  npm run ard:dev");
console.log("Split commands if needed:");
console.log("  npm run ard:backend");
console.log("  npm run ard:dashboard");
console.log("If dashboard ports are occupied, run:");
console.log("  npm run dev:cleanup-dashboard");
console.log("Demo pipeline:");
console.log("  npm run ard:demo");
