export function deriveArdStatus(input = {}) {
  const demo = input.demoSummary ?? input.latestDemo ?? null;
  const research = input.research ?? demo?.research ?? {};
  const protection = input.protection ?? demo?.protection ?? {};
  const giving = input.giving ?? demo?.giving ?? {};
  const branchName = giving.branchName ?? input.branchName ?? null;
  const branchPushed = Boolean(giving.pushed ?? input.branchPushed ?? false);
  const safeCandidatesCount = Number(giving.included ?? giving.includedCandidates?.length ?? protection.allowed ?? 0);
  const needsReviewCount = Number(protection.needsReview ?? 0);
  const dangerousFindingsCount = Number(protection.dangerousFindings ?? protection.dangerousFindingsCount ?? 0);
  const researchStatus = research.status ?? (research.candidatesFound ? "completed" : "idle");
  const protectionStatus = protection.blocked || protection.allowed || protection.needsReview ? "completed" : "idle";
  const givingStatus = branchPushed ? "pushed" : safeCandidatesCount > 0 ? "ready" : dangerousFindingsCount > 0 ? "blocked" : "idle";
  const nextAction = branchPushed
    ? `Review research branch ${branchName}.`
    : safeCandidatesCount > 0
      ? "Run npm run ard:demo or Giving AI to prepare the research branch."
      : dangerousFindingsCount > 0
        ? "Review Dangerous Findings before allowing any Giving AI work."
        : "Run ARD pipeline to produce research candidates.";
  return {
    title: "ARD — AI Research Dashboard",
    mode: input.mode ?? demo?.mode ?? "demo/local research source",
    researchStatus,
    protectionStatus,
    givingStatus,
    dangerousFindingsCount,
    safeCandidatesCount,
    needsReviewCount,
    researchBranch: branchName ?? "not prepared",
    branchPushed,
    nextAction,
    rawDetailsCollapsed: true,
    primaryActionLabel: "Run ARD pipeline"
  };
}
