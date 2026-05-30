#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DocumentationContextStore,
  PrecisionExecutionError,
  StatefulTerminalSession,
  applyDiffPatch,
  fetchDocumentation,
  parseSearchReplaceBlock
} from "./lib/precision-execution-layer.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
await mkdir(path.join(rootDir, ".tmp"), { recursive: true });
const tmpRoot = await mkdtemp(path.join(rootDir, ".tmp", "precision-layer-"));

try {
  const projectDir = path.join(tmpRoot, "project");
  await mkdir(path.join(projectDir, "src"), { recursive: true });
  const targetPath = path.join(projectDir, "src", "app.js");
  await writeFile(targetPath, "export function label() {\n  return \"old\";\n}\n", "utf8");

  const parsed = parseSearchReplaceBlock("SEARCH:\n  return \"old\";\nREPLACE:\n  return \"new\";");
  assert.equal(parsed.search, "  return \"old\";");
  assert.equal(parsed.replace, "  return \"new\";");

  const dryRun = await applyDiffPatch({
    workspaceRoot: projectDir,
    targetPath: "src/app.js",
    block: "SEARCH:\n  return \"old\";\nREPLACE:\n  return \"new\";",
    dryRun: true
  });
  assert.equal(dryRun.applied, false);
  assert.equal(dryRun.match_count, 1);
  assert.equal(await readFile(targetPath, "utf8"), "export function label() {\n  return \"old\";\n}\n");

  const applied = await applyDiffPatch({
    workspaceRoot: projectDir,
    targetPath: "src/app.js",
    search: "  return \"old\";",
    replace: "  return \"new\";",
    dryRun: false
  });
  assert.equal(applied.applied, true);
  assert.equal(await readFile(targetPath, "utf8"), "export function label() {\n  return \"new\";\n}\n");

  await assert.rejects(
    () =>
      applyDiffPatch({
        workspaceRoot: projectDir,
        targetPath: "src/app.js",
        search: "  return \"old\";",
        replace: "  return \"bad\";",
        dryRun: false
      }),
    (error) => error instanceof PrecisionExecutionError && error.code === "search_match_count_mismatch"
  );
  assert.equal(await readFile(targetPath, "utf8"), "export function label() {\n  return \"new\";\n}\n");

  await writeFile(path.join(projectDir, "src", "dup.js"), "x();\nx();\n", "utf8");
  await assert.rejects(
    () =>
      applyDiffPatch({
        workspaceRoot: projectDir,
        targetPath: "src/dup.js",
        search: "x();",
        replace: "y();",
        dryRun: false
      }),
    (error) => error instanceof PrecisionExecutionError && error.code === "search_match_count_mismatch"
  );

  await writeFile(path.join(projectDir, "src", "diff.js"), "one\ntwo\nthree\n", "utf8");
  const diffResult = await applyDiffPatch({
    workspaceRoot: projectDir,
    targetPath: "src/diff.js",
    mode: "unified_diff",
    unifiedDiff: [
      "--- a/src/diff.js",
      "+++ b/src/diff.js",
      "@@ -1,3 +1,3 @@",
      " one",
      "-two",
      "+TWO",
      " three",
      ""
    ].join("\n"),
    dryRun: false
  });
  assert.equal(diffResult.applied, true);
  assert.equal(await readFile(path.join(projectDir, "src", "diff.js"), "utf8"), "one\nTWO\nthree\n");

  await assert.rejects(
    () =>
      applyDiffPatch({
        workspaceRoot: projectDir,
        targetPath: "../outside.js",
        search: "x",
        replace: "y"
      }),
    (error) => error instanceof PrecisionExecutionError && error.code === "path_outside_workspace"
  );

  const mockFetch = async () => ({
    ok: true,
    status: 200,
    headers: {
      get: () => "text/html; charset=utf-8"
    },
    text: async () => "<html><head><script>bad()</script></head><body><main><h1>React memo</h1><p>Use <code>memo</code> for memoized components.</p></main></body></html>"
  });
  const docs = await fetchDocumentation({
    library: "React",
    topic: "components",
    fetchImpl: mockFetch
  });
  assert.equal(docs.ok, true);
  assert.equal(docs.documentation.library, "React");
  assert.ok(docs.documentation.excerpt.includes("React memo"));
  assert.ok(!docs.documentation.excerpt.includes("bad()"));
  assert.ok(docs.context_injection.includes("VNEM Dynamic Documentation Injection"));

  const store = new DocumentationContextStore();
  store.recordFetch({ workerId: "ui", taskId: "task-1", documentation: docs.documentation });
  assert.equal(store.hasDocumentation({ workerId: "ui", taskId: "task-1", library: "React" }), true);
  assert.ok(store.buildContextInjection({ workerId: "ui", taskId: "task-1" }).includes("React memo"));

  await writeFile(path.join(projectDir, "src", "good.js"), "const ok = true;\n", "utf8");
  const session = new StatefulTerminalSession({ workspaceRoot: projectDir, defaultTimeoutMs: 5000 });
  const check = await session.execute("node --check src/good.js");
  assert.equal(check.ok, true);
  assert.equal(check.timed_out, false);

  const cd = await session.execute("cd src");
  assert.equal(cd.ok, true);
  assert.equal(cd.cwd, "src");
  const cwdCheck = await session.execute("node --check good.js");
  assert.equal(cwdCheck.ok, true);

  await assert.rejects(
    () => session.execute("npm install left-pad"),
    (error) => error instanceof PrecisionExecutionError && error.code === "package_script_not_allowed"
  );
  await assert.rejects(
    () => session.execute("node --check good.js && npm run build"),
    (error) => error instanceof PrecisionExecutionError && error.code === "shell_control_operator_blocked"
  );

  const timeoutSession = new StatefulTerminalSession({
    workspaceRoot: projectDir,
    defaultTimeoutMs: 500,
    additionalAllowedPrefixes: [["node", "-e"]]
  });
  const timedOut = await timeoutSession.execute("node -e \"setTimeout(function(){}, 5000)\"", {
    timeoutMs: 500
  });
  assert.equal(timedOut.ok, false);
  assert.equal(timedOut.timed_out, true);

  console.log("precision execution layer tests passed");
} finally {
  await removeTreeWithRetry(tmpRoot);
}

async function removeTreeWithRetry(target) {
  let lastError;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await rm(target, { recursive: true, force: true });
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
    }
  }
  throw lastError;
}
