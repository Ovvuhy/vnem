import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
const execFile = promisify(execFileCb);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
async function withTools(env, fn) {
  await mkdir(path.join(rootDir, ".tmp"), { recursive: true });
  const tmpRoot = await mkdtemp(path.join(rootDir, ".tmp", "autonomy1-"));
  const workspace = path.join(tmpRoot, "workspace");
  await mkdir(workspace, { recursive: true });
  const client = new Client({ name: "autonomy-test", version: "1.0.1" }, { capabilities: {} });
  const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(scriptDir, "vnem-tools-mcp-server.mjs")], cwd: rootDir, env: { ...process.env, VNEM_TOOLS_ALLOWED_ROOTS: workspace, VNEM_TOOLS_EVIDENCE_ROOT: path.join(workspace, ".vnem", "tool-runs"), ...env }, stderr: "pipe" });
  let stderr = "";
  transport.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });
  try { await client.connect(transport); return await fn(client, workspace, tmpRoot); }
  finally { await client.close().catch(() => {}); await rm(tmpRoot, { recursive: true, force: true }).catch(() => {}); if (stderr.trim()) process.stderr.write(stderr); }
}
async function initRepo(repo) {
  await mkdir(repo, { recursive: true });
  await execFile("git", ["init"], { cwd: repo });
  await execFile("git", ["config", "user.email", "vnem-test@example.local"], { cwd: repo });
  await execFile("git", ["config", "user.name", "VNEM Test"], { cwd: repo });
  await writeFile(path.join(repo, "package.json"), JSON.stringify({ scripts: { test: "node --check index.js", build: "node --check index.js" }, dependencies: { zod: "latest" } }, null, 2));
  await writeFile(path.join(repo, "index.js"), "console.log('ok');\n");
  await writeFile(path.join(repo, "README.md"), "# Fixture\n");
  await execFile("git", ["add", "package.json", "index.js", "README.md"], { cwd: repo });
  await execFile("git", ["commit", "-m", "initial"], { cwd: repo });
  await execFile("git", ["branch", "-M", "main"], { cwd: repo });
}

await withTools({}, async (client) => {
  const guide = await client.callTool({ name: "vnem_tools_github_settings_guide", arguments: {} });
  const text = guide.structuredContent.github_settings_guide.config_block;
  assert.match(text, /# ============================================================\n# GITHUB SETTINGS\n# ============================================================/);
  assert.match(text, /\[mcp_servers\."vnem-tools"\.env\]/);
  assert.match(text, /VNEM_TOOLS_GITHUB_PROFILE = "maintainer"/);
  assert.match(text, /VNEM_TOOLS_GITHUB_ALLOWED_REPOS = "Ovvuhy\/vnem;Ovvuhy\/ME3-By-my-AI-and-Me"/);
  assert.match(text, /VNEM_TOOLS_GITHUB_ALLOW_FORCE_PUSH = "0"/);
  assert.match(text, /VNEM_TOOLS_MALWARE_DOWNLOAD_BLOCK = "1"/);
  assert.ok(guide.structuredContent.github_settings_guide.settings.find((s) => s.name === "VNEM_TOOLS_GITHUB_ALLOW_DIRECT_PUSH"));
  const status = await client.callTool({ name: "vnem_tools_github_profile_status", arguments: {} });
  assert.equal(status.structuredContent.github_profile_status.active_github_profile, "maintainer");
  assert.ok(status.structuredContent.github_profile_status.config_knobs.VNEM_TOOLS_GITHUB_ALLOW_DIRECT_PUSH);
});
console.log("vnem Tools GitHub settings tests passed");
