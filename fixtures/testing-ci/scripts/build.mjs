import { mkdir, writeFile } from "node:fs/promises";

await mkdir("dist", { recursive: true });
await writeFile("dist/build.txt", "fixture build passed\n", "utf8");
console.log("fixture build passed");
