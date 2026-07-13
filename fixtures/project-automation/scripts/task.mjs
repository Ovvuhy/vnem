import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const fixtureRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stateRoot = path.join(fixtureRoot, "state");
const logRoot = path.join(fixtureRoot, "logs");
const action = process.argv[2] || "unknown";

await mkdir(stateRoot, { recursive: true });
await mkdir(logRoot, { recursive: true });
await writeFile(path.join(logRoot, "project.log"), `${new Date(0).toISOString()} action=${action}\n`, { flag: "a" });

if (action === "test" || action === "build" || action === "custom") {
  console.log(`${action}:ok`);
} else if (action === "prepare") {
  await writeFile(path.join(stateRoot, "prepared.txt"), "prepared\n", "utf8");
  console.log("prepare:ok");
} else if (action === "finish") {
  await writeFile(path.join(stateRoot, "finished.txt"), "finished\n", "utf8");
  console.log("finish:ok");
} else if (action === "rollback-prepare") {
  await rm(path.join(stateRoot, "prepared.txt"), { force: true });
  console.log("rollback-prepare:ok");
} else if (action === "rollback-finish") {
  await rm(path.join(stateRoot, "finished.txt"), { force: true });
  console.log("rollback-finish:ok");
} else if (action === "long-output") {
  for (let index = 0; index < 800; index += 1) console.log(`long-output:${String(index).padStart(4, "0")}:${"x".repeat(40)}`);
} else if (action === "env-safety") {
  console.log(`env-safety:${process.env.VNEM_PHASE8_SECRET_CANARY || "absent"}`);
} else if (action === "fail-seven") {
  console.error("intentional failure with exit code seven");
  process.exitCode = 7;
} else if (action === "orphan-timeout") {
  const child = spawn(process.execPath, [path.join(fixtureRoot, "scripts", "timeout-child.mjs")], { cwd: fixtureRoot, stdio: "ignore" });
  console.log(`timeout-child:${child.pid}`);
  await new Promise((resolve) => setTimeout(resolve, 10_000));
} else {
  console.log(`unknown-action:${action}`);
}
