export const CHANGES_BY_ARD_DISPLAY_NAME = "Changes by ARD";
export const CHANGES_BY_ARD_BRANCH = "changes-by-ard";
export const CHANGES_BY_ARD_CONFIRMATION = "I understand ARD will push changes to the Changes by ARD branch, not main.";
export const CHANGES_BY_ARD_WARNING = "Read this before continuing: ARD will push only to the Changes by ARD branch. Main stays protected. Review before merging.";

export function deriveArdChangesCard({ status = null } = {}) {
  const lastPreview = status?.lastPreview ?? null;
  const lastPrepared = status?.lastPrepared ?? null;
  const lastPushed = status?.lastPushed ?? null;
  const pushedIsReal = Boolean(lastPushed?.pushStatus === "pushed" && lastPushed?.branchName === CHANGES_BY_ARD_BRANCH && lastPushed?.commitHash);
  return {
    displayName: status?.displayName ?? CHANGES_BY_ARD_DISPLAY_NAME,
    branchName: status?.branchName ?? CHANGES_BY_ARD_BRANCH,
    branchValid: status?.branchValid ?? true,
    mainProtected: status?.mainProtected ?? true,
    mode: status?.mode ?? (pushedIsReal ? "pushed branch" : lastPrepared ? "local commit" : "dry-run"),
    statusLabel: statusLabel(status, { lastPreview, lastPrepared, lastPushed, pushedIsReal }),
    lastPreview,
    lastPrepared,
    lastPushed: pushedIsReal ? lastPushed : null,
    confirmationRequired: true,
    requiredConfirmation: status?.requiredConfirmation ?? CHANGES_BY_ARD_CONFIRMATION,
    warningCopy: CHANGES_BY_ARD_WARNING,
    buttonLabels: {
      preview: "Preview ARD changes",
      prepare: "Prepare Changes by ARD commit",
      push: "Push Changes by ARD branch"
    },
    fakePushed: Boolean(lastPushed) && !pushedIsReal,
    mainPushAllowed: false,
    errorCode: status?.error_code ?? null,
    message: status?.message ?? lastPreview?.message ?? lastPrepared?.message ?? null,
    worktreeDiagnostics: status?.worktreeDiagnostics ?? lastPreview?.worktreeDiagnostics ?? lastPrepared?.worktreeDiagnostics ?? null,
    nextAction: status?.nextAction ?? "Preview ARD changes before preparing a protected branch commit."
  };
}

export function summarizeArdChangesAction(state) {
  if (state === "previewing") return { tone: "busy", label: "Previewing ARD changes..." };
  if (state === "preparing") return { tone: "busy", label: "Preparing Changes by ARD commit..." };
  if (state === "pushing") return { tone: "busy", label: "Pushing changes-by-ard..." };
  if (state === "error") return { tone: "critical", label: "Changes by ARD action failed." };
  return { tone: "idle", label: "Changes by ARD is ready for preview." };
}

function statusLabel(status, derived) {
  if (status?.ok === false || status?.error_code) return "blocked";
  if (derived.pushedIsReal) return "pushed";
  if (derived.lastPrepared?.commitHash) return "prepared";
  if (derived.lastPreview) return "preview ready";
  return "not prepared";
}
