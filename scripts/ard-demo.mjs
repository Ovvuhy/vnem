#!/usr/bin/env node
import { runArdDemo } from "./ard-pipeline.mjs";
const result = await runArdDemo({ runId: process.argv.includes("--run-id") ? process.argv[process.argv.indexOf("--run-id") + 1] : "ard-demo-run" });
console.log(JSON.stringify(result, null, 2));
