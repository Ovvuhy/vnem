#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
await mkdir(path.join(rootDir, ".tmp"), { recursive: true });
const tmpRoot = await mkdtemp(path.join(rootDir, ".tmp", "tools-intelligence-"));
const workspace = path.join(tmpRoot, "project");
await mkdir(path.join(workspace, "src", "components"), { recursive: true });
await mkdir(path.join(workspace, "tests"), { recursive: true });
await mkdir(path.join(workspace, "docs"), { recursive: true });
await mkdir(path.join(workspace, "dist"), { recursive: true });
await writeFile(path.join(workspace, "package.json"), JSON.stringify({
  type: "module",
  scripts: {
    test: "node tests/app.test.js",
    build: "vite build",
    deploy: "git push origin main",
    postinstall: "node scripts/setup.js",
    dev: "vite --host 127.0.0.1"
  },
  dependencies: { react: "1.0.0", vite: "1.0.0", express: "1.0.0" },
  devDependencies: { typescript: "1.0.0" }
}, null, 2), "utf8");
await writeFile(path.join(workspace, "src", "app.js"), "export function App() { return Helper('safe'); }\nexport function Helper(value) { return value.toUpperCase(); }\n", "utf8");
await writeFile(path.join(workspace, "src", "components", "Widget.jsx"), "import { Helper } from '../app.js';\nexport const Widget = () => Helper('widget');\n", "utf8");
await writeFile(path.join(workspace, "tests", "app.test.js"), "import { Helper } from '../src/app.js';\nif (Helper('ok') !== 'OK') throw new Error('bad');\nconsole.log('ok');\n", "utf8");
await writeFile(path.join(workspace, "docs", "readme.md"), "# Demo\n", "utf8");
await writeFile(path.join(workspace, "vite.config.js"), "export default {};\n", "utf8");
await writeFile(path.join(workspace, ".env"), "TOKEN=should-not-leak\n", "utf8");
await writeFile(path.join(workspace, "dist", "bundle.js"), "generated Helper token=should-not-leak\n", "utf8");
await writeFile(path.join(workspace, "large.bin"), Buffer.alloc(4096, 1));

const client = new Client({ name: "vnem-tools-intelligence-test", version: "1.0.1" }, { capabilities: {} });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(scriptDir, "vnem-tools-mcp-server.mjs")],
  cwd: rootDir,
  env: { ...process.env, VNEM_TOOLS_ALLOWED_ROOTS: workspace, VNEM_TOOLS_EVIDENCE_ROOT: path.join(workspace, ".vnem", "tool-runs") },
  stderr: "pipe"
});
let stderr = "";
transport.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });

try {
  await client.connect(transport);
  const toolNames = new Set((await client.listTools()).tools.map((tool) => tool.name));
  for (const name of ["vnem_tools_manifest", "vnem_tools_workspace_map", "vnem_tools_read_many_files", "vnem_tools_code_search", "vnem_tools_find_references", "vnem_tools_dependency_scan"]) {
    assert.equal(toolNames.has(name), true, `missing ${name}`);
  }

  const manifestCall = await client.callTool({ name: "vnem_tools_manifest", arguments: {} });
  assert.equal(manifestCall.isError, undefined);
  const manifest = manifestCall.structuredContent?.manifest;
  for (const name of ["vnem_tools_apply_patch_batch", "vnem_tools_workspace_map", "vnem_tools_fetch_url_text", "vnem_tools_research_brief", "vnem_tools_git_commit"]) {
    assert.ok(manifest.tools.some((tool) => tool.tool_name === name), `manifest missing ${name}`);
  }
  for (const group of ["filesystem", "project_intelligence", "research_sources", "session_evidence", "local_git"]) assert.ok(manifest.capability_groups.includes(group), `manifest missing group ${group}`);
  for (const tool of manifest.tools.filter((item) => item.mutation || item.network)) {
    assert.notEqual(tool.requires_approval, undefined, `${tool.tool_name} missing approval metadata`);
    assert.equal(tool.evidence_logged, true, `${tool.tool_name} missing evidence metadata`);
    assert.ok(tool.unsafe_actions_blocked.length > 0, `${tool.tool_name} missing blocked actions`);
  }
  assert.doesNotMatch(JSON.stringify(manifest), /implements Giga|git push supported|package installs supported|secret-backed live API execution supported|external browsing by default supported/i);

  const mapCall = await client.callTool({ name: "vnem_tools_workspace_map", arguments: { root: ".", max_depth: 4, max_files: 80 } });
  assert.equal(mapCall.isError, undefined);
  const map = mapCall.structuredContent?.workspace_map;
  assert.ok(map.important_dirs.source.includes("src"));
  assert.ok(map.important_dirs.tests.includes("tests"));
  assert.ok(map.config_files.includes("package.json"));
  assert.ok(map.likely_entrypoints.includes("src/app.js"));
  assert.ok(map.large_files.some((item) => item.path === "large.bin"));
  assert.ok(map.skipped_paths.some((item) => item.includes(".env")));
  assert.doesNotMatch(JSON.stringify(map), /should-not-leak/);

  const many = await client.callTool({ name: "vnem_tools_read_many_files", arguments: { root: ".", paths: ["src/app.js", "src/components/Widget.jsx", ".env", "dist/bundle.js", "large.bin"], max_file_bytes: 2000, max_total_bytes: 3000 } });
  assert.equal(many.isError, undefined);
  const readMany = many.structuredContent?.read_many_files;
  assert.equal(readMany.files.length, 2);
  assert.ok(readMany.blocked_files.some((item) => item.path === ".env" && item.code === "secret_path_blocked"));
  assert.ok(readMany.blocked_files.some((item) => item.path === "dist/bundle.js"));
  assert.ok(readMany.blocked_files.some((item) => item.path === "large.bin" && item.code === "binary_file_blocked"));
  assert.doesNotMatch(JSON.stringify(readMany), /should-not-leak/);

  const search = await client.callTool({ name: "vnem_tools_code_search", arguments: { root: ".", query: "Helper", file_globs: ["*.js", "*.jsx"], max_results: 10, context_lines: 1 } });
  assert.equal(search.isError, undefined);
  const codeSearch = search.structuredContent?.code_search;
  assert.ok(codeSearch.result_count >= 2);
  assert.ok(codeSearch.matches.every((match) => !match.path.startsWith("dist/")));
  assert.ok(codeSearch.skipped_paths.some((item) => item.includes(".env") || item.includes("dist")));

  const refs = await client.callTool({ name: "vnem_tools_find_references", arguments: { root: ".", symbol: "Helper", max_results: 10 } });
  assert.equal(refs.isError, undefined);
  const references = refs.structuredContent?.references;
  assert.ok(references.result_count >= 3);
  assert.ok(references.likely_definition_files.includes("src/app.js"));

  const deps = await client.callTool({ name: "vnem_tools_dependency_scan", arguments: { root: ".", include_scripts: true, include_lockfiles: true } });
  assert.equal(deps.isError, undefined);
  const dependencyScan = deps.structuredContent?.dependency_scan;
  assert.equal(dependencyScan.package_manager, "npm");
  assert.ok(dependencyScan.dependencies_summary.dependencies.includes("react"));
  assert.ok(dependencyScan.likely_frameworks.includes("Vite"));
  assert.ok(dependencyScan.risky_scripts.some((item) => item.name === "deploy"));
  assert.ok(dependencyScan.risky_scripts.some((item) => item.name === "postinstall"));
  assert.ok(dependencyScan.safe_scripts.some((item) => item.name === "test"));

  console.log("vnem Tools intelligence tests passed");
} finally {
  await client.close().catch(() => {});
  await rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
  if (stderr.trim()) process.stderr.write(stderr);
}
