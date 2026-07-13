import assert from "node:assert/strict";
import { buildResult } from "../src/service.mjs";

assert.deepEqual(buildResult(3), { input: 3, output: 6 });
console.log("service integration passed");
