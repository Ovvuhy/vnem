#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrecisionExecutionError, StatefulTerminalSession } from "./lib/precision-execution-layer.mjs";
import {
  CodebaseSemanticIndex,
  VerificationLoopStore,
  executeEphemeralScript,
  runVerificationTests
} from "./lib/omniscient-self-healing-layer.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
await mkdir(path.join(rootDir, ".tmp"), { recursive: true });
const tmpRoot = await mkdtemp(path.join(rootDir, ".tmp", "omniscient-layer-"));

try {
  const projectDir = path.join(tmpRoot, "project");
  await mkdir(path.join(projectDir, "src"), { recursive: true });
  await writeFile(
    path.join(projectDir, "src", "playerPhysics.js"),
    [
      "export function resolvePlayerCollision(player, platforms) {",
      "  const next = { ...player, grounded: false };",
      "  for (const platform of platforms) {",
      "    if (overlaps(next.hitbox, platform.collider)) {",
      "      next.velocityY = 0;",
      "      next.grounded = true;",
      "    }",
      "  }",
      "  return next;",
      "}",
      ""
    ].join("\n"),
    "utf8"
  );
  await writeFile(
    path.join(projectDir, "src", "authSession.js"),
    "export const deprecatedAuthToken = window.localStorage.getItem('legacy-token');\n",
    "utf8"
  );
  await writeFile(path.join(projectDir, "src", "good.js"), "const ok = true;\n", "utf8");
  await writeFile(path.join(projectDir, "src", "bad.js"), "function broken( {\n", "utf8");

  const index = new CodebaseSemanticIndex({
    workspaceRoot: projectDir,
    indexPath: path.join(projectDir, ".vnem-runtime", "code-index.json"),
    chunkLines: 20
  });
  await index.startBackgroundIndex({ watch: false });
  const collision = await index.search("Where is the player physics collision logic handled?", {
    limit: 3
  });
  assert.ok(collision.results.some((item) => item.target_path === "src/playerPhysics.js"));
  assert.ok(collision.results[0].start_line >= 1);
  assert.ok(collision.results[0].snippet.includes("resolvePlayerCollision"));

  const auth = await index.search("Find deprecated auth token usage", {
    limit: 3
  });
  assert.ok(auth.results.some((item) => item.target_path === "src/authSession.js"));

  await writeFile(
    path.join(projectDir, "src", "playerPhysics.js"),
    "export function wallSlideCollision(player) {\n  return { ...player, wallSliding: true };\n}\n",
    "utf8"
  );
  const refreshed = await index.search("wall slide collision logic", {
    refresh: true,
    limit: 2
  });
  assert.equal(refreshed.results[0].target_path, "src/playerPhysics.js");
  assert.ok(refreshed.results[0].snippet.includes("wallSlideCollision"));

  const store = new VerificationLoopStore();
  const session = new StatefulTerminalSession({ workspaceRoot: projectDir, defaultTimeoutMs: 5000 });
  const red = await runVerificationTests({
    command: "node --check src/bad.js",
    phase: "red",
    taskId: "syntax-feature",
    store,
    session,
    maxAttempts: 5,
    reset: true
  });
  assert.equal(red.verdict, "red_confirmed");
  assert.equal(red.healing_loop.status, "ready_for_implementation");

  const green = await runVerificationTests({
    command: "node --check src/good.js",
    phase: "green",
    taskId: "syntax-feature-green",
    store,
    session,
    maxAttempts: 5,
    reset: true
  });
  assert.equal(green.verdict, "pass");

  const healingOne = await runVerificationTests({
    command: "node --check src/bad.js",
    phase: "green",
    taskId: "bounded-failure",
    store,
    session,
    maxAttempts: 2,
    reset: true
  });
  assert.equal(healingOne.verdict, "needs_healing");
  const healingTwo = await runVerificationTests({
    command: "node --check src/bad.js",
    phase: "green",
    taskId: "bounded-failure",
    store,
    session,
    maxAttempts: 2
  });
  assert.equal(healingTwo.verdict, "blocked");
  assert.equal(healingTwo.healing_loop.status, "human_intervention_required");

  const script = await executeEphemeralScript({
    workspaceRoot: projectDir,
    language: "node",
    script: "const value = { sum: 2 + 3 }; console.log(JSON.stringify(value));",
    timeoutMs: 5000
  });
  assert.equal(script.ok, true);
  assert.ok(script.execution.stdout.includes('"sum":5'));
  assert.equal(script.sandbox.cleanup.sandbox_deleted, true);
  assert.equal(existsSync(path.join(projectDir, ".vnem-runtime", "ephemeral", script.run_id)), false);

  await assert.rejects(
    () =>
      executeEphemeralScript({
        workspaceRoot: projectDir,
        language: "node",
        script: "import { exec } from 'node:child_process'; exec('echo bad');"
      }),
    (error) => error instanceof PrecisionExecutionError && error.code === "process_spawn_blocked"
  );
  await assert.rejects(
    () =>
      executeEphemeralScript({
        workspaceRoot: projectDir,
        language: "shell",
        script: "echo blocked"
      }),
    (error) => error instanceof PrecisionExecutionError && error.code === "shell_ephemeral_disabled"
  );

} finally {
  await removeTreeWithRetry(tmpRoot);
}

console.log("omniscient self-healing layer tests passed");
if (process.platform === "win32") {
  // Piped npm runners can retain inherited PipeWraps after child-process tests.
  process.exit(0);
}

async function removeTreeWithRetry(target) {
  let lastError;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      await rm(target, { recursive: true, force: true });
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
    }
  }
  throw lastError;
}
