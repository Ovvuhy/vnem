#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PermissionRuntime, PermissionRuntimeError } from "./vnem/permissions/runtime.mjs";
import { HARD_BLOCKED_ACTIONS, buildPermissionProfiles } from "./vnem/permissions/profiles.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
await mkdir(path.join(repoRoot, ".tmp"), { recursive: true });
const temporaryRoot = await mkdtemp(path.join(repoRoot, ".tmp", "permissions-"));
const projectRoot = path.join(temporaryRoot, "project");
await mkdir(path.join(projectRoot, "src"), { recursive: true });

try {
  const profileNames = buildPermissionProfiles().map((profile) => profile.profile_name);
  for (const name of ["safe-readonly", "safe-local-dev", "creator-power", "maintainer", "expert", "custom", "dangerous-disabled"]) {
    assert.ok(profileNames.includes(name), `missing permission profile ${name}`);
  }
  for (const profile of buildPermissionProfiles()) {
    assert.equal(profile.allowed_actions.some((action) => HARD_BLOCKED_ACTIONS.has(action)), false, `${profile.profile_name} weakens a hard block`);
  }

  const runtime = await PermissionRuntime.create({ workspaceRoot: projectRoot, allowedRoots: [projectRoot] });
  assert.equal(runtime.activeProfile().profile_name, "safe-readonly");
  assert.equal(runtime.evaluate({ action: "apply_patch", target_path: path.join(projectRoot, "src", "app.js") }).allowed, false);
  assert.equal(runtime.evaluate({ action: "force_push" }).hard_blocked, true);
  assert.throws(
    () => runtime.requestGrant({ actions: ["force_push"], reason: "unsafe" }),
    (error) => error instanceof PermissionRuntimeError && error.code === "permission_hard_blocked"
  );

  const sessionRequest = runtime.requestGrant({
    actions: ["apply_patch", "run_test"],
    scope: { path_prefixes: ["src"] },
    duration_minutes: 30,
    persistence: "session",
    reason: "Implement and verify one source change."
  });
  await assert.rejects(
    () => runtime.approveGrant({ request_id: sessionRequest.request_id, acknowledgment: "approve" }),
    (error) => error instanceof PermissionRuntimeError && error.code === "permission_acknowledgment_mismatch"
  );
  const sessionGrant = await runtime.approveGrant({ request_id: sessionRequest.request_id, acknowledgment: sessionRequest.exact_acknowledgment });
  assert.equal(sessionGrant.grant.persistence, "session");
  const inScope = runtime.evaluate({ action: "apply_patch", target_path: path.join(projectRoot, "src", "app.js") });
  assert.equal(inScope.allowed, true);
  assert.equal(inScope.approval_required, false);
  assert.equal(inScope.decision_source, "scoped_grant");
  assert.equal(runtime.evaluate({ action: "apply_patch", target_path: path.join(projectRoot, "README.md") }).allowed, false);
  assert.equal(existsSync(path.join(projectRoot, ".vnem", "safety.json")), false, "session grants must not persist");

  const firstProfile = await runtime.setProfile("safe-local-dev");
  assert.equal(firstProfile.persisted, true);
  assert.equal(runtime.activeProfile().profile_name, "safe-local-dev");
  const secondProfile = await runtime.setProfile("approved-writes");
  assert.ok(secondProfile.backup);
  assert.equal(runtime.activeProfile().profile_name, "approved-writes");
  const rolledBack = await runtime.rollbackLatestConfig();
  assert.equal(rolledBack.profile.profile_name, "safe-local-dev");

  const persistentRequest = runtime.requestGrant({
    actions: ["github_pr"],
    scope: { repositories: ["Ovvuhy/vnem"], branches: ["feat/test"] },
    duration_minutes: 10,
    persistence: "persistent",
    reason: "Create or update one feature-branch PR."
  });
  const persistentGrant = await runtime.approveGrant({ request_id: persistentRequest.request_id, acknowledgment: persistentRequest.exact_acknowledgment });
  assert.equal(persistentGrant.grant.persistence, "persistent");
  const reloaded = await PermissionRuntime.create({ workspaceRoot: projectRoot, allowedRoots: [projectRoot] });
  assert.equal(reloaded.evaluate({ action: "github_pr", repository: "Ovvuhy/vnem", branch: "feat/test" }).decision_source, "scoped_grant");
  assert.equal(reloaded.evaluate({ action: "github_pr", repository: "Ovvuhy/vnem", branch: "main" }).allowed, false);
  assert.equal(reloaded.doctor().hard_blocks_intact, true);
  assert.equal((await reloaded.revokeGrant(persistentGrant.grant.grant_id)).persistent_removed, true);

  console.log("VNEM shared permission runtime tests passed");
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
