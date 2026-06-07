#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { runResearch, runProtection } from "./ard-pipeline.mjs";

const rootDir = await mkdtemp(path.join(os.tmpdir(), "vnem-ard-protection-test-"));
try {
  const research = await runResearch({ rootDir, runId: "ard-test-protection" });
  const protection = await runProtection({ rootDir, research });
  assert.equal(protection.allowed, 1);
  assert.equal(protection.needsReview, 2);
  assert.equal(protection.blocked, 1);
  assert.equal(protection.quarantined, 0);
  assert.equal(protection.verdicts.find((item) => item.candidateId === "clean-dashboard-launcher").verdict, "allow");
  assert.equal(protection.verdicts.find((item) => item.candidateId === "missing-license-agent-ui-pattern").verdict, "needs-review");
  const malware = protection.verdicts.find((item) => item.candidateId === "token-stealing-postinstall-kit");
  assert.equal(malware.verdict, "blocked");
  assert.equal(malware.givingEligible, false);
  assert.ok(malware.dangerousSignals.some((signal) => signal.includes("credential")));
  assert.ok(protection.verdicts.filter((item) => ["blocked", "quarantine"].includes(item.verdict)).every((item) => !item.givingEligible));
  const dangerousReport = await readFile(path.join(rootDir, "discovery", "ard-runs", research.runId, "dangerous-findings.md"), "utf8");
  assert.match(dangerousReport, /Excluded from Giving: yes/);
  console.log("ARD protection tests passed");
} finally {
  await rm(rootDir, { recursive: true, force: true });
}
