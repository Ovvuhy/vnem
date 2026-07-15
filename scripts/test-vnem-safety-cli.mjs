#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const runFile = promisify(execFile);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const cliPath = path.join(scriptDir, "vnem-cli.mjs");
await mkdir(path.join(repoRoot, ".tmp"), { recursive: true });
const temporaryRoot = await mkdtemp(path.join(repoRoot, ".tmp", "safety-cli-"));
const projectRoot = path.join(temporaryRoot, "project");
await mkdir(projectRoot, { recursive: true });

try {
  const status = await runJson(["safety", "--status", "--json", "--root", projectRoot]);
  assert.equal(status.operation, "status");
  assert.equal(status.profile.profile_name, "safe-readonly");
  assert.equal(status.hard_blocked_actions.includes("force_push"), true);

  const profiles = await runJson(["safety", "--list-profiles", "--json", "--root", projectRoot]);
  assert.ok(profiles.profiles.some((profile) => profile.profile_name === "maintainer"));
  assert.ok(profiles.profiles.some((profile) => profile.profile_name === "expert"));
  assert.ok(profiles.profiles.every((profile) => !profile.allowed_actions.includes("force_push")));

  const preview = await runJson(["safety", "--profile", "safe-local-dev", "--json", "--root", projectRoot]);
  assert.equal(preview.applied, false);
  assert.equal(preview.preview.profile, "safe-local-dev");
  assert.equal(existsSync(path.join(projectRoot, ".vnem", "safety.json")), false);

  const applied = await runJson(["safety", "--profile", "safe-local-dev", "--json", "--root", projectRoot, "--yes"]);
  assert.equal(applied.applied, true);
  assert.equal(applied.persisted, true);
  let config = JSON.parse(await readFile(path.join(projectRoot, ".vnem", "safety.json"), "utf8"));
  assert.equal(config.profile, "safe-local-dev");

  const elevated = await runJson(["safety", "--profile", "maintainer", "--json", "--root", projectRoot, "--yes"]);
  assert.ok(elevated.backup);
  config = JSON.parse(await readFile(path.join(projectRoot, ".vnem", "safety.json"), "utf8"));
  assert.equal(config.profile, "maintainer");

  const doctor = await runJson(["safety", "--doctor", "--json", "--root", projectRoot]);
  assert.equal(doctor.ok, true);
  assert.equal(doctor.hard_blocks_intact, true);

  const rollbackPreview = await runJson(["safety", "--rollback", "--json", "--root", projectRoot]);
  assert.equal(rollbackPreview.applied, false);
  const rollback = await runJson(["safety", "--rollback", "--json", "--root", projectRoot, "--yes"]);
  assert.equal(rollback.applied, true);
  assert.equal(rollback.profile.profile_name, "safe-local-dev");

  const sessionOnly = await runJson(["safety", "--profile", "expert", "--session", "--json", "--root", projectRoot, "--yes"]);
  assert.equal(sessionOnly.persisted, false);
  config = JSON.parse(await readFile(path.join(projectRoot, ".vnem", "safety.json"), "utf8"));
  assert.equal(config.profile, "safe-local-dev", "session-only profile must not alter persistent config");

  await assert.rejects(
    () => runFile(process.execPath, [cliPath, "safety", "--profile", "custom", "--custom-actions", "apply_patch,force_push", "--root", projectRoot, "--yes", "--json"], { cwd: repoRoot, windowsHide: true }),
    (error) => /permission_custom_hard_blocked|hard-blocked/i.test(`${error.stderr || ""} ${error.stdout || ""}`)
  );

  console.log("VNEM safety CLI tests passed");
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}

async function runJson(args) {
  const { stdout } = await runFile(process.execPath, [cliPath, ...args], { cwd: repoRoot, windowsHide: true });
  return JSON.parse(stdout);
}
