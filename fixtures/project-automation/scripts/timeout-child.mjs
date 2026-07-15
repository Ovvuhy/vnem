import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const fixtureRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
await new Promise((resolve) => setTimeout(resolve, 2_500));
await mkdir(path.join(fixtureRoot, "state"), { recursive: true });
await writeFile(path.join(fixtureRoot, "state", "orphan-survived.txt"), "process tree cleanup failed\n", "utf8");
