import { readFileSync } from "node:fs";
import path from "node:path";

export function loadBehaviorTestReferences(root, serverName) {
  try {
    const report = JSON.parse(readFileSync(path.join(root, ".vnem", "runtime-tool-behavior-tests.json"), "utf8"));
    return report.servers?.[serverName] || {};
  } catch {
    return {};
  }
}
