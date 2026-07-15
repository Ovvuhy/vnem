#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { auditGeneratedArtifacts, resolveGenerationClock } from "./vnem/generation/generated-artifacts.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const generationMetadata = JSON.parse(await readFile(path.join(root, "generation", "metadata.json"), "utf8"));
const generationClock = resolveGenerationClock({ sourceDateEpoch: process.env.SOURCE_DATE_EPOCH, semanticTimestamp: generationMetadata.semantic_timestamp });
const installBaseUrl = (process.env.VNEM_BASE_URL ?? "https://raw.githubusercontent.com/Ovvuhy/vnem/main/public").replace(/\/+$/, "");
const report = await auditGeneratedArtifacts({
  root,
  expectedSemanticTimestamp: generationClock.iso,
  expectedGenerationSettings: {
    install_base_url: installBaseUrl,
    archive_order: "portable_path_ascending",
    archive_header_policy: "normalized_ustar_gzip"
  }
});

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`Generated artifact audit: ${report.status.toUpperCase()}`);
  console.log(`Artifacts: ${report.artifact_count || 0}; source inputs: ${report.source_input_count || 0}; text scanned: ${report.text_artifacts_scanned || 0}; binary scanned: ${report.binary_artifacts_scanned || 0}`);
  for (const issue of report.issues || []) console.log(`- ${issue.code}: ${issue.path} (${issue.detail})`);
  console.log(`Safe next step: ${report.safe_next_step}`);
}

if (report.status !== "pass") process.exitCode = 1;
