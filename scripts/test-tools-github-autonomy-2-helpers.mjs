import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

export const scriptDir = path.dirname(fileURLToPath(import.meta.url));
export const rootDir = path.resolve(scriptDir, "..");

export async function withGithubMockTools(env, fn) {
  await mkdir(path.join(rootDir, ".tmp"), { recursive: true });
  const tmpRoot = await mkdtemp(path.join(rootDir, ".tmp", "autonomy2-"));
  const workspace = path.join(tmpRoot, "workspace");
  const commandLog = path.join(tmpRoot, "commands.jsonl");
  await mkdir(path.join(workspace, "src"), { recursive: true });
  await writeFile(path.join(workspace, "README.md"), "# Fixture\n");
  await writeFile(path.join(workspace, "src", "app.js"), "console.log('fixture');\n");
  await writeFile(path.join(workspace, "package.json"), JSON.stringify({ scripts: { test: "node --check src/app.js", build: "node --check src/app.js" } }, null, 2));
  const client = new Client({ name: "autonomy2-test", version: "1.0.1" }, { capabilities: {} });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(scriptDir, "vnem-tools-mcp-server.mjs")],
    cwd: rootDir,
    env: {
      ...process.env,
      VNEM_TOOLS_ALLOWED_ROOTS: workspace,
      VNEM_TOOLS_EVIDENCE_ROOT: path.join(workspace, ".vnem", "tool-runs"),
      VNEM_TOOLS_GITHUB_ALLOWED_REPOS: "fixture/local",
      VNEM_TOOLS_GITHUB_PROFILE: "maintainer",
      VNEM_TOOLS_COMMAND_MOCK_LOG: commandLog,
      ...env
    },
    stderr: "pipe"
  });
  let stderr = "";
  transport.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });
  try {
    await client.connect(transport);
    return await fn({ client, workspace, tmpRoot, commandLog });
  } finally {
    await client.close().catch(() => {});
    await rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
    if (stderr.trim()) process.stderr.write(stderr);
  }
}

export async function readCommands(commandLog) {
  const text = await readFile(commandLog, "utf8");
  return text.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

export function commandLines(commands) {
  return commands.map((entry) => `${entry.command} ${entry.args.join(" ")}`.trim());
}

export function assertCommand(lines, pattern, message) {
  assert.ok(lines.some((line) => pattern.test(line)), `${message}\ncommands:\n${lines.join("\n")}`);
}

export function assertNoCommand(lines, pattern, message) {
  assert.ok(!lines.some((line) => pattern.test(line)), `${message}\ncommands:\n${lines.join("\n")}`);
}
