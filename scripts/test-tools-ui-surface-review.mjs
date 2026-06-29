#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
await mkdir(path.join(rootDir, ".tmp"), { recursive: true });
const tmpRoot = await mkdtemp(path.join(rootDir, ".tmp", "tools-ui-surface-review-"));
const workspace = path.join(tmpRoot, "workspace");
await mkdir(path.join(workspace, "src", "routes"), { recursive: true });
await mkdir(path.join(workspace, "src", "components"), { recursive: true });
await mkdir(path.join(workspace, "tests"), { recursive: true });
await writeFile(path.join(workspace, "package.json"), JSON.stringify({ dependencies: { "@vitejs/plugin-react": "latest", react: "latest", vite: "latest" }, scripts: { dev: "vite", build: "vite build", test: "node tests/app.test.mjs" } }, null, 2), "utf8");
await writeFile(path.join(workspace, "src", "main.jsx"), "import React from 'react'; import { createRoot } from 'react-dom/client'; import App from './App.jsx'; createRoot(document.getElementById('root')).render(<App />);", "utf8");
await writeFile(path.join(workspace, "src", "App.jsx"), "import { Dashboard } from './routes/Dashboard.jsx'; export default function App(){ return <main><Dashboard /></main>; }", "utf8");
await writeFile(path.join(workspace, "src", "routes", "Dashboard.jsx"), "import { VisibleCard } from '../components/VisibleCard.jsx'; export function Dashboard(){ return <section><h1>Dashboard</h1><VisibleCard /></section>; }", "utf8");
await writeFile(path.join(workspace, "src", "components", "VisibleCard.jsx"), "export function VisibleCard(){ return <button aria-label=\"Open project\">Open</button>; }", "utf8");
await writeFile(path.join(workspace, "src", "components", "DeadPanel.jsx"), "export function DeadPanel(){ return <aside>Unrendered</aside>; }", "utf8");
await writeFile(path.join(workspace, "src", "styles.css"), ".card{display:grid}", "utf8");
await writeFile(path.join(workspace, "tests", "app.test.mjs"), "assert.ok('dashboard')", "utf8");
await writeFile(path.join(workspace, ".env"), "TOKEN=must-not-read\n", "utf8");

const client = new Client({ name: "vnem-tools-ui-surface-review-test", version: "1.0.1" }, { capabilities: {} });
const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(scriptDir, "vnem-tools-mcp-server.mjs")], cwd: rootDir, env: { ...process.env, VNEM_TOOLS_ALLOWED_ROOTS: workspace, VNEM_TOOLS_PERMISSION_PROFILE: "safe-readonly", VNEM_TOOLS_EVIDENCE_ROOT: path.join(workspace, ".vnem", "tool-runs") }, stderr: "pipe" });
let stderr = "";
transport.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });

try {
  await client.connect(transport);
  const toolNames = new Set((await client.listTools()).tools.map((tool) => tool.name));
  assert.equal(toolNames.has("vnem_tools_ui_surface_review"), true, "missing UI surface review tool");

  const call = await client.callTool({ name: "vnem_tools_ui_surface_review", arguments: { workspace_root: workspace, max_files: 120 } });
  const review = call.structuredContent?.ui_surface_review;
  assert.equal(review.permission_profile, "safe-readonly");
  assert.equal(review.allowed_roots_check.inside_allowed_roots, true);
  assert.ok(review.detected_frameworks.some((item) => /react|vite/i.test(item)));
  assert.ok(review.routes_found.some((item) => /Dashboard|routes\/Dashboard/i.test(JSON.stringify(item))));
  assert.ok(review.components_found.some((item) => /VisibleCard/i.test(JSON.stringify(item))));
  assert.ok(review.entry_points_found.some((item) => /main\.jsx|index\.html/i.test(JSON.stringify(item))));
  assert.ok(review.render_paths_found.some((item) => /VisibleCard|Dashboard|createRoot/i.test(JSON.stringify(item))));
  assert.ok(review.style_files_found.some((item) => /styles\.css/i.test(JSON.stringify(item))));
  assert.ok(review.test_files_found.some((item) => /app\.test\.mjs/i.test(JSON.stringify(item))));
  assert.ok(review.possible_unrendered_components.some((item) => /DeadPanel/i.test(JSON.stringify(item))));
  assert.ok(review.possible_dead_ui.some((item) => /DeadPanel|unrendered/i.test(JSON.stringify(item))));
  assert.ok(review.missing_state_coverage.some((item) => /loading|error|empty/i.test(item)));
  assert.ok(review.accessibility_risk_hints.some((item) => /accessibility|aria|keyboard/i.test(item)));
  assert.ok(review.evidence_log_id);
  assert.equal(review.safe_to_claim.some((item) => /fully visually verified/i.test(item)), false);
  assert.ok(review.must_not_claim.some((item) => /visual proof|browser/i.test(item)));
  assert.ok(!JSON.stringify(review).includes("must-not-read"));

  console.log("vnem Tools UI surface review tests passed");
} finally {
  await client.close().catch(() => {});
  await rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
  if (stderr.trim()) process.stderr.write(stderr);
}
