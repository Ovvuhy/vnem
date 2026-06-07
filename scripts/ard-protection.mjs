#!/usr/bin/env node
import { runProtection } from "./ard-pipeline.mjs";
const runId = process.argv.includes("--run-id") ? process.argv[process.argv.indexOf("--run-id") + 1] : undefined;
if (!runId) throw new Error("--run-id is required for ard:protect unless run through ard:demo");
const result = await runProtection({ runId });
console.log(JSON.stringify(result, null, 2));
