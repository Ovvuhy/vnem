#!/usr/bin/env node
import { execSync, spawn } from "node:child_process";
import dns from "node:dns";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const dashboardPort = 4174;
const dashboardApiPort = 8788;
const appServerPort = 9099;
const developmentPorts = [dashboardPort, dashboardApiPort, appServerPort];
const dashboardApiToken = "local_development_secret_token_2026";
const viteBin = "node_modules/vite/bin/vite.js";
const services = [
  {
    id: "api",
    label: "API",
    color: "\x1b[33m",
    command: process.execPath,
    args: ["scripts/hermes-dashboard-api.mjs"],
    env: {
      HERMES_DASHBOARD_API_TOKEN: dashboardApiToken,
      HERMES_DASHBOARD_API_HOST: "127.0.0.1",
      HERMES_DASHBOARD_API_PORT: String(dashboardApiPort)
    }
  },
  {
    id: "app-server",
    label: "App Server",
    color: "\x1b[35m",
    command: process.execPath,
    args: ["scripts/vnem-app-server.mjs", "--port", String(appServerPort)],
    env: {
      VNEM_APP_SERVER_HOST: "127.0.0.1",
      VNEM_APP_SERVER_PORT: String(appServerPort)
    }
  },
  {
    id: "vite",
    label: "Vite",
    color: "\x1b[32m",
    command: process.execPath,
    args: [viteBin, "--config", "dashboard/vite.config.js"],
    env: {
      VITE_VNEM_APP_SERVER_URL: `http://127.0.0.1:${appServerPort}`,
      VITE_HERMES_DASHBOARD_API_TARGET: `http://127.0.0.1:${dashboardApiPort}`
    }
  }
];

const reset = "\x1b[0m";
const children = new Map();
let shuttingDown = false;

if (isCliEntry()) {
  main();
}

export function main() {
  dns.setDefaultResultOrder?.("ipv4first");
  clearDevelopmentPorts(developmentPorts);

  process.stdout.write("[VNEM Dev] Starting local stack\n");
  process.stdout.write(`[VNEM Dev] Dashboard: http://127.0.0.1:${dashboardPort}/dashboard/\n`);
  process.stdout.write(`[VNEM Dev] Dashboard API: http://127.0.0.1:${dashboardApiPort}\n`);
  process.stdout.write(`[VNEM Dev] App Server: http://127.0.0.1:${appServerPort}\n`);

  for (const service of services) {
    launchService(service);
  }

  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(signal, () => {
      shutdown(0, signal);
    });
  }

  process.on("uncaughtException", (error) => {
    prefixRaw("VNEM Dev", "\x1b[31m", `uncaught exception: ${error.stack || error.message}`);
    shutdown(1, "uncaughtException");
  });

  process.on("unhandledRejection", (error) => {
    prefixRaw("VNEM Dev", "\x1b[31m", `unhandled rejection: ${error?.stack || error}`);
    shutdown(1, "unhandledRejection");
  });
}

export function clearDevelopmentPorts(ports = developmentPorts, options = {}) {
  const platform = options.platform ?? process.platform;
  const executor = options.executor ?? execSync;
  const logger = typeof options.logger === "function" ? options.logger : (line) => process.stdout.write(`${line}\n`);
  const currentPid = options.currentPid ?? process.pid;

  for (const port of ports) {
    try {
      const pids = platform === "win32"
        ? findWindowsPortPids(port, executor)
        : findPosixPortPids(port, executor);

      for (const pid of pids) {
        if (pid === currentPid) {
          continue;
        }
        const result = killPortPid({ platform, port, pid, executor });
        if (result.killed || result.released) {
          logger(`[Pre-flight] Freed port ${port} (PID ${pid})`);
        } else {
          logger(`[Pre-flight] Port ${port} held by PID ${pid}, but termination failed: ${safeErrorMessage(result.error)}`);
        }
      }
    } catch (error) {
      if (!isExpectedPortScanMiss(error)) {
        logger(`[Pre-flight] Port ${port} scan skipped: ${safeErrorMessage(error)}`);
      }
    }
  }
}

function killPortPid({ platform, port, pid, executor }) {
  try {
    if (platform === "win32") {
      executor(`taskkill /PID ${pid} /F`, { stdio: "ignore" });
    } else {
      executor(`kill -9 ${pid}`, { stdio: "ignore" });
    }
    return { killed: true };
  } catch (error) {
    if (!isPidStillHoldingPort({ platform, port, pid, executor })) {
      return { released: true };
    }
    return { error };
  }
}

function isPidStillHoldingPort({ platform, port, pid, executor }) {
  try {
    const pids = platform === "win32"
      ? findWindowsPortPids(port, executor)
      : findPosixPortPids(port, executor);
    return pids.includes(pid);
  } catch {
    return false;
  }
}

export function findWindowsPortPids(port, executor = execSync) {
  const output = String(executor(`netstat -ano | findstr :${port}`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }) ?? "");
  return parseWindowsNetstatPids(output, port);
}

export function parseWindowsNetstatPids(output, port) {
  const pids = new Set();
  const portPattern = new RegExp(`(?:^|\\]|:)${escapeRegExp(String(port))}$`);

  for (const line of String(output).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    const columns = trimmed.split(/\s+/);
    const protocol = columns[0]?.toUpperCase();
    if (protocol === "TCP") {
      const localAddress = columns[1] ?? "";
      const state = columns[3]?.toUpperCase();
      const pid = Number.parseInt(columns[4] ?? "", 10);
      if (state === "LISTENING" && portPattern.test(localAddress) && Number.isInteger(pid)) {
        pids.add(pid);
      }
    }
    if (protocol === "UDP") {
      const localAddress = columns[1] ?? "";
      const pid = Number.parseInt(columns.at(-1) ?? "", 10);
      if (portPattern.test(localAddress) && Number.isInteger(pid)) {
        pids.add(pid);
      }
    }
  }

  return [...pids];
}

function findPosixPortPids(port, executor = execSync) {
  const output = String(executor(`lsof -nP -iTCP:${port} -sTCP:LISTEN -t`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }) ?? "");
  return [...new Set(output.split(/\s+/).map((value) => Number.parseInt(value, 10)).filter(Number.isInteger))];
}

function launchService(service) {
  let child;
  try {
    child = spawn(service.command, service.args, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ...service.env,
        NODE_OPTIONS: withIpv4First(process.env.NODE_OPTIONS)
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
  } catch (error) {
    prefixRaw(service.label, "\x1b[31m", `failed to spawn: ${error.message}`);
    shutdown(1, `${service.id}-spawn-throw`);
    return;
  }

  children.set(service.id, { child, service });
  prefixRaw(service.label, service.color, `spawned pid ${child.pid}: ${service.command} ${service.args.join(" ")}`);
  pipePrefixed(child.stdout, service.label, service.color);
  pipePrefixed(child.stderr, service.label, service.color);

  child.on("error", (error) => {
    if (shuttingDown) return;
    prefixRaw(service.label, "\x1b[31m", `failed to start: ${error.message}`);
    shutdown(1, `${service.id}-spawn-error`);
  });

  child.on("exit", (code, signal) => {
    children.delete(service.id);
    if (shuttingDown) return;
    const reason = signal ? `signal ${signal}` : `code ${code}`;
    prefixRaw(service.label, "\x1b[31m", `exited unexpectedly with ${reason}`);
    shutdown(code === 0 ? 1 : code ?? 1, `${service.id}-exit`);
  });
}

function pipePrefixed(stream, label, color) {
  const reader = readline.createInterface({ input: stream });
  reader.on("line", (line) => {
    prefixRaw(label, color, line);
  });
}

function prefixRaw(label, color, line) {
  const tag = `${color}[${label}]${reset}`;
  process.stdout.write(`${tag} ${line}\n`);
}

function withIpv4First(existing) {
  const flag = "--dns-result-order=ipv4first";
  if (String(existing || "").includes("--dns-result-order")) {
    return existing;
  }
  return [existing, flag].filter(Boolean).join(" ");
}

function shutdown(exitCode, reason) {
  if (shuttingDown) return;
  shuttingDown = true;
  prefixRaw("VNEM Dev", "\x1b[36m", `stopping local stack (${reason})`);

  const running = [...children.values()];
  for (const { child, service } of running) {
    killChildTree(child, service);
  }

  const timeout = setTimeout(() => {
    process.exit(exitCode);
  }, 2500);
  timeout.unref?.();

  Promise.allSettled(running.map(({ child }) => onceExit(child))).then(() => {
    clearTimeout(timeout);
    process.exit(exitCode);
  });
}

function killChildTree(child, service) {
  if (!child.pid) return;
  prefixRaw(service.label, service.color, `stopping pid ${child.pid}`);
  if (process.platform === "win32") {
    spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true
    });
    return;
  }
  child.kill("SIGTERM");
  setTimeout(() => {
    if (!child.killed) {
      child.kill("SIGKILL");
    }
  }, 1500).unref?.();
}

function onceExit(child) {
  if (child.exitCode != null || child.signalCode != null) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    child.once("exit", resolve);
  });
}

function isCliEntry() {
  if (!process.argv[1]) {
    return false;
  }
  const executedPath = path.resolve(process.argv[1]).toLowerCase();
  const modulePath = fileURLToPath(import.meta.url).toLowerCase();
  return executedPath === modulePath;
}

function isExpectedPortScanMiss(error) {
  return error?.status === 1 || error?.code === 1;
}

function safeErrorMessage(error) {
  return String(error?.message || error || "unknown error").replace(/\s+/g, " ").slice(0, 180);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
