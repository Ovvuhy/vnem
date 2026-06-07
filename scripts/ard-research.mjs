#!/usr/bin/env node
import { runResearch } from "./ard-pipeline.mjs";
const result = await runResearch({ runId: process.argv.includes("--run-id") ? process.argv[process.argv.indexOf("--run-id") + 1] : undefined });
console.log(JSON.stringify(result, null, 2));
