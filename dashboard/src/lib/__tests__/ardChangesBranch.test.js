import assert from "node:assert/strict";
import {
  CHANGES_BY_ARD_CONFIRMATION,
  deriveArdChangesCard,
  summarizeArdChangesAction
} from "../ardChangesBranch.js";

const empty = deriveArdChangesCard();
assert.equal(empty.displayName, "Changes by ARD");
assert.equal(empty.branchName, "changes-by-ard");
assert.equal(empty.branchValid, true);
assert.equal(empty.mainProtected, true);
assert.equal(empty.statusLabel, "not prepared");
assert.equal(empty.mode, "dry-run");
assert.equal(empty.confirmationRequired, true);
assert.equal(empty.warningCopy, "Read this before continuing: ARD will push only to the Changes by ARD branch. Main stays protected. Review before merging.");
assert.equal(empty.buttonLabels.preview, "Preview ARD changes");
assert.equal(empty.buttonLabels.prepare, "Prepare Changes by ARD commit");
assert.equal(empty.buttonLabels.push, "Push Changes by ARD branch");
assert.equal(empty.fakePushed, false, "empty card must not fake a pushed state");
assert.equal(empty.mainPushAllowed, false, "card must never allow main push");

const preview = deriveArdChangesCard({
  status: {
    lastPreview: { runId: "demo", changedFiles: ["discovery/ard-changes/demo/summary.json"], wouldCommit: false, wouldPush: false }
  }
});
assert.equal(preview.statusLabel, "preview ready");
assert.equal(preview.lastPreview.runId, "demo");
assert.equal(preview.fakePushed, false);

const prepared = deriveArdChangesCard({
  status: {
    lastPreview: { runId: "demo" },
    lastPrepared: { commitHash: "abc123", branchName: "changes-by-ard", pushStatus: "not-pushed" }
  }
});
assert.equal(prepared.statusLabel, "prepared");
assert.equal(prepared.lastPrepared.commitHash, "abc123");
assert.equal(prepared.lastPushed, null);
assert.equal(prepared.fakePushed, false);

const pushed = deriveArdChangesCard({
  status: {
    lastPrepared: { commitHash: "abc123", branchName: "changes-by-ard" },
    lastPushed: { commitHash: "abc123", branchName: "changes-by-ard", pushStatus: "pushed" }
  }
});
assert.equal(pushed.statusLabel, "pushed");
assert.equal(pushed.lastPushed.commitHash, "abc123");
assert.equal(pushed.fakePushed, false);

const blocked = deriveArdChangesCard({ status: { ok: false, error_code: "ARD_CHANGES_DIRTY_WORKTREE" } });
assert.equal(blocked.statusLabel, "blocked");
assert.equal(blocked.errorCode, "ARD_CHANGES_DIRTY_WORKTREE");

assert.deepEqual(summarizeArdChangesAction("previewing"), { tone: "busy", label: "Previewing ARD changes..." });
assert.deepEqual(summarizeArdChangesAction("preparing"), { tone: "busy", label: "Preparing Changes by ARD commit..." });
assert.deepEqual(summarizeArdChangesAction("pushing"), { tone: "busy", label: "Pushing changes-by-ard..." });
assert.equal(CHANGES_BY_ARD_CONFIRMATION, "I understand ARD will push changes to the Changes by ARD branch, not main.");

console.log("dashboard ARD Changes branch tests passed");
