#!/usr/bin/env node
import assert from "node:assert/strict";
import { clearDevelopmentPorts, parseWindowsNetstatPids } from "./launch-dev.mjs";

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

console.log("launch-dev pre-flight tests passed");
