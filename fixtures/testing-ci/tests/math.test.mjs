import assert from "node:assert/strict";
import { double } from "../src/math.mjs";

assert.equal(double(4), 8);
assert.throws(() => double(Number.NaN), /finite/);
console.log("math unit passed");
