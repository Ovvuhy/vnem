import { double } from "./math.mjs";

export function buildResult(value) {
  return { input: value, output: double(value) };
}
