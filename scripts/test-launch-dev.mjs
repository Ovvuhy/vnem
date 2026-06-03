#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildServiceEnv, clearDevelopmentPorts, parseWindowsNetstatPids } from "./launch-dev.mjs";
import { loadLocalEnv, parseEnvFile } from "./local-env.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");

const sampleNetstat = [
  "  TCP    127.0.0.1:8788         0.0.0.0:0              LISTENING       14022",
  "  TCP    [::1]:8788             [::]:0                 LISTENING       14023",
  "  TCP    127.0.0.1:18788        0.0.0.0:0              LISTENING       99999",
  "  TCP    127.0.0.1:8788         127.0.0.1:53530        ESTABLISHED     99998",
  "  UDP    0.0.0.0:8788           *:*                                   14024"
].join("\n");

assert.deepEqual(parseWindowsNetstatPids(sampleNetstat, 8788), [14022, 14023, 14024]);

const commands = [];
const logs = [];
const currentPid = 14023;

function executor(command) {
  commands.push(command);
  if (command.includes("netstat -ano | findstr :4174")) {
    const error = new Error("findstr found no matches");
    error.status = 1;
    throw error;
  }
  if (command.includes("netstat -ano | findstr :8788")) {
    return sampleNetstat;
  }
  if (command.includes("netstat -ano | findstr :9099")) {
    return "  TCP    127.0.0.1:9099         0.0.0.0:0              LISTENING       15001";
  }
  if (command.startsWith("taskkill /PID ")) {
    return "";
  }
  throw new Error(`unexpected command: ${command}`);
}

clearDevelopmentPorts([4174, 8788, 9099], {
  platform: "win32",
  executor,
  currentPid,
  logger: (line) => logs.push(line)
});

assert.ok(commands.includes("netstat -ano | findstr :4174"));
assert.ok(commands.includes("netstat -ano | findstr :8788"));
assert.ok(commands.includes("netstat -ano | findstr :9099"));
assert.ok(commands.includes("taskkill /PID 14022 /F"));
assert.equal(commands.includes("taskkill /PID 14023 /F"), false, "pre-flight must not kill its own PID");
assert.ok(commands.includes("taskkill /PID 14024 /F"));
assert.ok(commands.includes("taskkill /PID 15001 /F"));
assert.deepEqual(logs, [
  "[Pre-flight] Freed port 8788 (PID 14022)",
  "[Pre-flight] Freed port 8788 (PID 14024)",
  "[Pre-flight] Freed port 9099 (PID 15001)"
]);

assert.deepEqual(parseEnvFile([
  "# comment",
  "OPENROUTER_API_KEY='test-key'",
  "export VNEM_TEST_ENV=\"quoted value\"",
  "BAD-KEY=value"
].join("\n")), {
  OPENROUTER_API_KEY: "test-key",
  VNEM_TEST_ENV: "quoted value"
});

const previousOpenRouterKey = process.env.OPENROUTER_API_KEY;
const previousVnemTestEnv = process.env.VNEM_TEST_ENV;
try {
  process.env.OPENROUTER_API_KEY = "parent-key";
  assert.equal(buildServiceEnv({ env: {}, exposeProtectedEnv: false }).OPENROUTER_API_KEY, undefined);
  assert.equal(
    buildServiceEnv({ env: { OPENROUTER_API_KEY: "app-server-key" }, exposeProtectedEnv: true }).OPENROUTER_API_KEY,
    "app-server-key"
  );

  delete process.env.OPENROUTER_API_KEY;
  delete process.env.VNEM_TEST_ENV;
  await mkdir(path.join(rootDir, ".tmp"), { recursive: true });
  const tmpRoot = await mkdtemp(path.join(rootDir, ".tmp", "local-env-"));
  await writeFile(path.join(tmpRoot, ".env"), "OPENROUTER_API_KEY=base-key\nVNEM_TEST_ENV=base\n", "utf8");
  await writeFile(path.join(tmpRoot, ".env.local"), "OPENROUTER_API_KEY=local-key\n", "utf8");
  const preview = loadLocalEnv(tmpRoot, { apply: false });
  assert.equal(preview.values.OPENROUTER_API_KEY, "local-key");
  assert.equal(process.env.OPENROUTER_API_KEY, undefined);
  const loaded = loadLocalEnv(tmpRoot);
  assert.deepEqual(loaded.loaded, [".env", ".env.local"]);
  assert.equal(process.env.OPENROUTER_API_KEY, "local-key");
  assert.equal(process.env.VNEM_TEST_ENV, "base");
} finally {
  if (previousOpenRouterKey == null) {
    delete process.env.OPENROUTER_API_KEY;
  } else {
    process.env.OPENROUTER_API_KEY = previousOpenRouterKey;
  }
  if (previousVnemTestEnv == null) {
    delete process.env.VNEM_TEST_ENV;
  } else {
    process.env.VNEM_TEST_ENV = previousVnemTestEnv;
  }
}

console.log("launch-dev pre-flight tests passed");
