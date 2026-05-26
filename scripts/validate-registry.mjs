import { existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { ENTRIES_DIR, ROOT, SCHEMA_PATH, readEntries, readJson } from "./lib/registry.mjs";

const schema = await readJson(SCHEMA_PATH);
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validateEntry = ajv.compile(schema);

const errors = [];
const seenSlugs = new Set();
const seenRepoUrls = new Map();
const seenPackageUrls = new Map();

function addError(message) {
  errors.push(message);
}

function words(text) {
  return text.trim().split(/\s+/).filter(Boolean);
}

const entries = await readEntries();

if (entries.length === 0) {
  addError(`No entries found under ${path.relative(ROOT, ENTRIES_DIR)}`);
}

for (const item of entries) {
  const { entry, profile, entryPath, profilePath, relativeEntryPath, relativeProfilePath } = item;

  if (!validateEntry(entry)) {
    for (const err of validateEntry.errors ?? []) {
      addError(`${relativeEntryPath}: ${err.instancePath || "/"} ${err.message}`);
    }
  }

  if (seenSlugs.has(entry.slug)) {
    addError(`${relativeEntryPath}: duplicate slug ${entry.slug}`);
  }
  seenSlugs.add(entry.slug);

  const expectedDir = path.join(ENTRIES_DIR, entry.slug);
  if (path.dirname(entryPath) !== expectedDir) {
    addError(`${relativeEntryPath}: entry directory must be registry/entries/${entry.slug}`);
  }

  if (!existsSync(profilePath)) {
    addError(`${relativeEntryPath}: missing profile.md`);
  } else if (words(profile).length > 360) {
    addError(`${relativeProfilePath}: profile is too long for an original index summary`);
  }

  if (!entry.licenses?.length) {
    addError(`${relativeEntryPath}: licenses must include SPDX identifier or NOASSERTION`);
  }

  if (!entry.source_urls?.length) {
    addError(`${relativeEntryPath}: source_urls must include at least one provenance URL`);
  }

  if (entry.repo_url) {
    const owner = seenRepoUrls.get(entry.repo_url);
    if (owner) {
      addError(`${relativeEntryPath}: duplicate repo_url already used by ${owner}`);
    }
    seenRepoUrls.set(entry.repo_url, entry.slug);
  }

  for (const packageUrl of entry.package_urls ?? []) {
    const owner = seenPackageUrls.get(packageUrl);
    if (owner) {
      addError(`${relativeEntryPath}: duplicate package_url ${packageUrl} already used by ${owner}`);
    }
    seenPackageUrls.set(packageUrl, entry.slug);
  }

  const files = await stat(path.dirname(entryPath));
  if (!files.isDirectory()) {
    addError(`${relativeEntryPath}: entry parent must be a directory`);
  }
}

const allowedEntryFiles = new Set(["entry.yaml", "profile.md"]);
const entryDirs = new Set(entries.map((item) => path.dirname(item.entryPath)));
for (const entryDir of entryDirs) {
  const dirItems = await import("node:fs/promises").then(({ readdir }) => readdir(entryDir));
  for (const file of dirItems) {
    if (!allowedEntryFiles.has(file)) {
      addError(`${path.relative(ROOT, path.join(entryDir, file))}: vendored or extra files are not allowed in entry directories`);
    }
  }
}

if (errors.length > 0) {
  console.error(`Registry validation failed with ${errors.length} issue(s):`);
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`Registry validation passed for ${entries.length} entries.`);
