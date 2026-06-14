#!/usr/bin/env node
import { runArdDogfood } from "./ard-capability-engine.mjs";
import { previewArdChanges, prepareArdChanges } from "./ard-changes-branch.mjs";

const args = new Set(process.argv.slice(2));
const prepareChanges = args.has("--prepare-changes");
const runIdArgIndex = process.argv.indexOf("--run-id");
const runId = runIdArgIndex >= 0 ? process.argv[runIdArgIndex + 1] : undefined;

const result = await runArdDogfood({
  rootDir: process.cwd(),
  runId,
  prepareChanges,
  changesAdapter: async (workPackage) => {
    const payload = {
      runId: workPackage.workPackageId,
      title: workPackage.title,
      workPackage
    };
    const preview = await previewArdChanges(payload, { repositoryRoot: process.cwd() });
    if (!prepareChanges || !preview.ok) return preview;
    return prepareArdChanges(payload, { repositoryRoot: process.cwd() });
  }
});

const report = {
  ok: result.ok,
  runId: result.runId,
  sourceLanesUsed: result.research.sourceLanesUsed,
  candidatesFound: result.research.candidatesFound,
  newCandidates: result.research.newCandidates,
  repeatedCandidates: result.research.repeatedCandidates,
  lowSignalCollapsed: result.research.lowSignalCollapsed,
  categories: result.research.categories,
  branchEligible: result.protection.branchEligible,
  reviewArtifactOnly: result.protection.reviewArtifactOnly,
  dangerousFindings: result.protection.dangerousFindings,
  workPackages: result.giving.workPackages.map((workPackage) => ({
    workPackageId: workPackage.workPackageId,
    title: workPackage.title,
    safeAction: workPackage.safeAction,
    filesToChange: workPackage.filesToChange,
    testsToRun: workPackage.testsToRun
  })),
  changesByArd: {
    result: result.changesByArd.result,
    previewOk: result.changesByArd.preview?.ok ?? false,
    exactFiles: result.changesByArd.preview?.exactFiles ?? [],
    preparedCommit: result.changesByArd.prepare?.commitHash ?? null,
    blockedReason: result.changesByArd.preview?.blockedReason ?? result.changesByArd.prepare?.message ?? null
  },
  limitations: result.limitations
};

console.log(JSON.stringify(report, null, 2));
