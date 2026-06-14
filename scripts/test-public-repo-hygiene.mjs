#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function text(path) {
  return readFile(path, "utf8");
}

const readme = await text("README.md");
const product = await text("PRODUCT.md");
const cleanup = await text("docs/GITHUB_REPO_CLEANUP.md");
const landing = await text("landing/index.html");
const docs = [
  await text("README.md"),
  await text("PRODUCT.md"),
  await text("docs/current-system.md"),
  await text("docs/local-testing.md"),
  await text("docs/BUILDING_AI_STATE.md"),
  await text("docs/ARD_ROADMAP.md"),
  await text("docs/ARD_PRODUCT_BACKLOG.md"),
  await text("docs/ARD_DECISION_LOG.md"),
  cleanup
].join("\n");

assert.match(readme, /npm\.cmd run dashboard/);
assert.match(readme, /npm\.cmd run ard:dogfood/);
assert.match(readme, /npm\.cmd run test:current/);
assert.ok(readme.indexOf("npm run dashboard") < readme.indexOf("npm run dev:all"), "dashboard must appear before dev:all so dev:all is secondary");
assert.match(landing, /npm\.cmd run dashboard/);
assert.match(landing, /npm\.cmd run ard:dogfood/);
assert.doesNotMatch(landing, /<pre class="code-block"><code>npm run dev:all/i, "landing must not present dev:all as the primary dashboard command");

for (const phrase of ["AI skills", "MCP", "agent frameworks", "evals", "safety/security", "repo automation", "Roblox/Luau"]) {
  assert.match(docs, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
}
assert.match(docs, /review-artifact-only|review artifacts/i);
assert.match(docs, /candidate lifecycle|candidate memory/i);
assert.match(docs, /Changes by ARD/i);
assert.match(docs, /protected branch/i);

for (const match of docs.matchAll(/fully safe|100% safe|guaranteed safe/gi)) {
  const window = docs.slice(Math.max(0, match.index - 80), match.index + 120);
  assert.match(window, /not|do not|must not|without claiming|does not mean|avoid/i, "absolute safety phrases must appear only as limitations/warnings");
}
assert.doesNotMatch(docs, /ARD (?:will|can|may) push main/i);
assert.doesNotMatch(docs, /auto-merge is enabled|auto-merges|will auto-merge/i);
assert.doesNotMatch(docs, /roblox-only|only Roblox/i);
assert.doesNotMatch(`${readme}\n${product}`, /76ZuJidMzB32EQLLiCL8UPQATQFoY2mrqZa3Kvr8PZhp/);

for (const match of docs.matchAll(/live external research/gi)) {
  const window = docs.slice(Math.max(0, match.index - 80), match.index + 160);
  assert.match(window, /planned|future|not live|unless|do not claim/i, "live external research must be marked planned/future unless verified");
}
for (const match of docs.matchAll(/antivirus-grade/gi)) {
  const window = docs.slice(Math.max(0, match.index - 80), match.index + 120);
  assert.match(window, /not|never|without claiming|no/i, "antivirus-grade references must be limitations, not claims");
}

assert.match(cleanup, /\| branch \| type \| last commit date \| last commit sha \| merged into origin\/main \| unique commits count \| open PR \| safe to delete \| action taken \| reason \|/);
assert.match(cleanup, /No remote branches were deleted/i);
assert.match(cleanup, /Never delete `main`/);
assert.match(cleanup, /Never delete `changes-by-ard`/);

console.log("public repo hygiene tests passed");
