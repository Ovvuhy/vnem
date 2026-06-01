#!/usr/bin/env node
import { access, copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateConnectorPreviews } from "./preview-connector-changes.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const ABSENT_BACKUP_KIND = "vnem-config-absent-v1";

export async function applyConnectorChanges(mode, options = {}) {
  const repositoryRoot = path.resolve(options.repositoryRoot || rootDir);
  const generatedAt = new Date().toISOString();
  const preview = await generateConnectorPreviews({
    repositoryRoot,
    redact: false
  });
  const results = {};

  for (const [clientId, clientPreview] of Object.entries(preview.previews || {})) {
    results[clientId] = mode === "rollback"
      ? await rollbackClient(clientPreview)
      : await applyClient(clientPreview);
  }

  const writesPerformed = Object.values(results).some((item) => item.changed);
  return {
    generated_at: generatedAt,
    tool: "vnem-apply-connector-changes",
    mode,
    repository_root: repositoryRoot,
    writes_performed: writesPerformed,
    clients_processed: Object.keys(results).length,
    results
  };
}

if (isCliEntry()) {
  const mode = parseMode(process.argv.slice(2));
  if (!mode) {
    process.stderr.write(usageGuide());
    process.exitCode = 1;
  } else {
    try {
      const result = await applyConnectorChanges(mode);
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } catch (error) {
      const result = {
        generated_at: new Date().toISOString(),
        tool: "vnem-apply-connector-changes",
        mode,
        ok: false,
        writes_performed: false,
        error: safeErrorMessage(error)
      };
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      process.exitCode = 1;
    }
  }
}

async function applyClient(preview) {
  const configPath = preview.selected_config_path;
  const backupPath = backupPathFor(configPath);
  try {
    if (!preview.installed) {
      return status(preview, "skipped-not-installed", false, backupPath, "Client is not installed or no profile was detected.");
    }
    if (!preview.would_change) {
      return status(preview, "skipped-no-change", false, backupPath, "VNEM connector already appears present or no structural change is required.");
    }
    if (!configPath || !preview.target_config_state) {
      return status(preview, "skipped-invalid-preview", false, backupPath, "Preview did not produce a writable target config state.");
    }
    if (await exists(backupPath)) {
      return status(preview, "skipped-backup-exists", false, backupPath, "Backup already exists; rollback or remove it before applying again.");
    }

    const existing = await readExistingConfig(configPath);
    await mkdir(path.dirname(configPath), { recursive: true });
    if (existing.exists) {
      await copyFile(configPath, backupPath);
    } else {
      await writeFile(backupPath, JSON.stringify({
        vnem_backup_kind: ABSENT_BACKUP_KIND,
        original_path: configPath,
        created_at: new Date().toISOString()
      }, null, 2) + "\n", "utf8");
    }

    const nextText = `${JSON.stringify(preview.target_config_state, null, 2)}\n`;
    await writeFile(configPath, nextText, "utf8");
    JSON.parse(await readFile(configPath, "utf8"));

    return {
      ...status(preview, "applied", true, backupPath, existing.exists ? "Config updated after adjacent byte-for-byte backup was created." : "Config created with an absent-file rollback marker."),
      backup_created: true,
      config_existed_before: existing.exists,
      backup_kind: existing.exists ? "file-copy" : ABSENT_BACKUP_KIND
    };
  } catch (error) {
    return {
      ...status(preview, isPermissionError(error) ? "permission-denied" : "apply-error", false, backupPath, safeErrorMessage(error)),
      error_code: safeErrorCode(error)
    };
  }
}

async function rollbackClient(preview) {
  const configPath = preview.selected_config_path;
  const backupPath = backupPathFor(configPath);
  try {
    if (!configPath) {
      return status(preview, "skipped-missing-config-path", false, backupPath, "No selected config path is available.");
    }
    if (!(await exists(backupPath))) {
      return status(preview, "skipped-no-backup", false, backupPath, "No adjacent VNEM backup exists for this client.");
    }

    const backupText = await readFile(backupPath, "utf8");
    const absentMarker = parseAbsentBackupMarker(backupText);
    if (absentMarker) {
      await rm(configPath, { force: true });
      const backupRemoved = await removeFileWithRetry(backupPath);
      return {
        ...status(
          preview,
          backupRemoved ? "rolled-back-created-file" : "rolled-back-created-file-backup-retained",
          true,
          backupPath,
          backupRemoved
            ? "Config file created by VNEM was removed and absent-file backup marker was deleted."
            : "Config file created by VNEM was removed, but the backup marker could not be deleted."
        ),
        backup_removed: backupRemoved
      };
    }

    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(configPath, backupText, "utf8");
    const restored = await readFile(configPath, "utf8");
    if (restored !== backupText) {
      return status(preview, "rollback-verify-failed", false, backupPath, "Restored file did not match backup byte-for-byte.");
    }
    const backupRemoved = await removeFileWithRetry(backupPath);
    return {
      ...status(
        preview,
        backupRemoved ? "rolled-back" : "rolled-back-backup-retained",
        true,
        backupPath,
        backupRemoved
          ? "Backup was restored byte-for-byte and backup artifact was removed."
          : "Backup was restored byte-for-byte, but the backup artifact could not be removed."
      ),
      backup_removed: backupRemoved
    };
  } catch (error) {
    return {
      ...status(preview, isPermissionError(error) ? "permission-denied" : "rollback-error", false, backupPath, safeErrorMessage(error)),
      error_code: safeErrorCode(error)
    };
  }
}

async function readExistingConfig(configPath) {
  try {
    await access(configPath);
    return {
      exists: true,
      content: await readFile(configPath, "utf8")
    };
  } catch (error) {
    if (["ENOENT", "ENOTDIR"].includes(error?.code)) {
      return {
        exists: false,
        content: ""
      };
    }
    throw error;
  }
}

function status(preview, action, changed, backupPath, message) {
  return {
    id: preview.id,
    display_name: preview.display_name,
    installed: Boolean(preview.installed),
    action,
    changed,
    selected_config_path: preview.selected_config_path,
    backup_path: backupPath,
    message
  };
}

function backupPathFor(configPath) {
  return configPath ? `${configPath}.vnem.bak` : null;
}

async function exists(targetPath) {
  if (!targetPath) return false;
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function removeFileWithRetry(targetPath) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      await rm(targetPath, { force: true, maxRetries: 3, retryDelay: 50 });
      return !(await exists(targetPath));
    } catch (error) {
      if (!["EPERM", "EACCES", "EBUSY", "ENOTEMPTY"].includes(error?.code)) {
        return false;
      }
      await new Promise((resolve) => setTimeout(resolve, 75 * (attempt + 1)));
    }
  }
  return !(await exists(targetPath));
}

function parseAbsentBackupMarker(text) {
  try {
    const parsed = JSON.parse(text);
    return parsed?.vnem_backup_kind === ABSENT_BACKUP_KIND ? parsed : null;
  } catch {
    return null;
  }
}

function parseMode(args) {
  const apply = args.includes("--apply");
  const rollback = args.includes("--rollback");
  if ((apply && rollback) || (!apply && !rollback)) {
    return null;
  }
  return apply ? "apply" : "rollback";
}

function usageGuide() {
  return [
    "Usage:",
    "  node scripts/apply-connector-changes.mjs --apply",
    "  node scripts/apply-connector-changes.mjs --rollback",
    "",
    "Exactly one flag is required. This tool writes only selected AI-client MCP config files and adjacent .vnem.bak backups."
  ].join("\n") + "\n";
}

function isPermissionError(error) {
  return ["EACCES", "EPERM"].includes(error?.code);
}

function safeErrorCode(error) {
  const code = error?.code || error?.name || "unavailable";
  if (["ENOENT", "ENOTDIR", "EACCES", "EPERM"].includes(code)) {
    return code;
  }
  return "unavailable";
}

function safeErrorMessage(error) {
  return `${safeErrorCode(error)}: ${String(error?.message || "connector apply failed").slice(0, 180)}`;
}

function isCliEntry() {
  return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}
