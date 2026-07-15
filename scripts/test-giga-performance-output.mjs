#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import initSqlJs from "sql.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
await mkdir(path.join(root, ".tmp"), { recursive: true });
const fixtureRoot = await mkdtemp(path.join(root, ".tmp", "phase22-performance-"));
const clients = [];

try {
  await writeFile(path.join(fixtureRoot, "sample.mjs"), "export function add(left, right) { return left + right; }\n", "utf8");
  await writeFile(path.join(fixtureRoot, "rows.json"), "[{\"id\":1,\"name\":\"Ada\"}]\n", "utf8");
  await writeSqliteFixture(path.join(fixtureRoot, "rows.sqlite"));

  const tools = await connect("tools", "scripts/vnem-tools-mcp-server.mjs", {
    VNEM_TOOLS_ALLOWED_ROOTS: [fixtureRoot, root].join(path.delimiter),
    VNEM_TOOLS_EVIDENCE_ROOT: path.join(fixtureRoot, ".vnem", "evidence"),
    VNEM_TOOLS_PERMISSION_PROFILE: "safe-readonly"
  });
  const core = await connect("core", "scripts/vnem-mcp-server.mjs");
  const precision = await connect("precision", "scripts/vnem-precision-mcp-server.mjs", {
    VNEM_PRECISION_ROOT: fixtureRoot
  });

  const before = await value(tools.client, "vnem_tools_status", {}, "tools_status");
  assert.equal(before.lazy_runtime_status.structural_code.babel_parser, "not_loaded");
  assert.equal(before.lazy_runtime_status.data_systems.sqlite_engine, "not_loaded");

  const toolsCalls = await sampleCalls(tools.client, "vnem_tools_entrypoint", {
    user_goal: "Map this repository and choose the smallest safe verification path.",
    root: fixtureRoot,
    task_mode: "repo_inspection"
  }, 30);
  assert.ok(toolsCalls.p95_ms <= 150, `Tools entrypoint p95 ${toolsCalls.p95_ms}ms exceeded 150ms`);
  assert.ok(toolsCalls.max_output_bytes <= 12 * 1024, `Tools planning output ${toolsCalls.max_output_bytes} bytes exceeded 12KB`);

  const statusCalls = await sampleCalls(tools.client, "vnem_tools_status", {}, 30);
  assert.ok(statusCalls.p95_ms <= 150, `Tools status p95 ${statusCalls.p95_ms}ms exceeded 150ms`);

  const coreCalls = await sampleCalls(core.client, "vnem_entrypoint", {
    user_goal: "Map this repository and choose the smallest safe verification path.",
    available_mcp_names: ["vnem", "vnem-tools"],
    task_mode: "repo_inspection"
  }, 30);
  assert.ok(coreCalls.p95_ms <= 250, `Core entrypoint p95 ${coreCalls.p95_ms}ms exceeded 250ms`);
  assert.ok(coreCalls.max_output_bytes <= 8 * 1024, `Core route output ${coreCalls.max_output_bytes} bytes exceeded 8KB`);

  await value(tools.client, "vnem_tools_structural_index_build", { root: fixtureRoot, refresh: true }, "structural_index");
  const afterStructural = await value(tools.client, "vnem_tools_status", {}, "tools_status");
  assert.equal(afterStructural.lazy_runtime_status.structural_code.babel_parser, "loaded");
  assert.equal(afterStructural.lazy_runtime_status.data_systems.sqlite_engine, "not_loaded");

  await value(tools.client, "vnem_tools_data_source_inspect", { root: fixtureRoot, path: "rows.json" }, "data_source_inspection");
  const afterJson = await value(tools.client, "vnem_tools_status", {}, "tools_status");
  assert.equal(afterJson.lazy_runtime_status.data_systems.sqlite_engine, "not_loaded", "non-SQLite structured reads must not initialize sql.js");

  await value(tools.client, "vnem_tools_database_schema_inspect", { root: fixtureRoot, path: "rows.sqlite" }, "database_schema_inspection");
  const afterSqlite = await value(tools.client, "vnem_tools_status", {}, "tools_status");
  assert.equal(afterSqlite.lazy_runtime_status.data_systems.sqlite_engine, "loaded");

  const precisionManifest = await precision.client.listTools();
  assert.ok(precisionManifest.tools.some((tool) => tool.name === "mcp_registry_status"));
  assert.equal(precisionManifest.tools.length, 7, "Precision remains a compact compatibility shim");

  console.log(`Phase 22 performance/output regression passed: Core p95 ${coreCalls.p95_ms}ms/${coreCalls.max_output_bytes}B; Tools p95 ${toolsCalls.p95_ms}ms/${toolsCalls.max_output_bytes}B; status p95 ${statusCalls.p95_ms}ms; lazy Babel/SQLite proven.`);
} finally {
  await Promise.all(clients.map(({ client }) => client.close().catch(() => {})));
  await rm(fixtureRoot, { recursive: true, force: true });
}

async function connect(name, serverFile, env = {}) {
  const client = new Client({ name: `vnem-giga-phase22-${name}`, version: "1.0.1" }, { capabilities: {} });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(root, serverFile)],
    cwd: root,
    env: { ...process.env, VNEM_ROOT: root, VNEM_TOOLS_SKIP_WRANGLER_CHECK: "1", ...env },
    stderr: "pipe"
  });
  await client.connect(transport);
  const connection = { client, transport };
  clients.push(connection);
  return connection;
}

async function value(client, name, args, key) {
  const result = await client.callTool({ name, arguments: args });
  assert.notEqual(result.isError, true, `${name} failed: ${JSON.stringify(result.structuredContent)}`);
  assert.ok(result.structuredContent?.[key], `${name} omitted ${key}`);
  return result.structuredContent[key];
}

async function sampleCalls(client, name, args, runs) {
  const samples = [];
  for (let index = 0; index < runs; index += 1) {
    const started = performance.now();
    const result = await client.callTool({ name, arguments: args });
    const latencyMs = performance.now() - started;
    assert.notEqual(result.isError, true, `${name} sample ${index + 1} failed`);
    const text = result.content?.filter((item) => item.type === "text").map((item) => item.text).join("\n") || "";
    samples.push({ latency_ms: latencyMs, output_bytes: Buffer.byteLength(text) });
  }
  const latencies = samples.map((sample) => sample.latency_ms).sort((a, b) => a - b);
  return {
    runs,
    p95_ms: Number(percentile(latencies, 0.95).toFixed(2)),
    max_ms: Number(latencies.at(-1).toFixed(2)),
    max_output_bytes: Math.max(...samples.map((sample) => sample.output_bytes))
  };
}

function percentile(sorted, quantile) {
  if (!sorted.length) return 0;
  const position = (sorted.length - 1) * quantile;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const fraction = position - lower;
  return sorted[lower] + (sorted[upper] - sorted[lower]) * fraction;
}

async function writeSqliteFixture(file) {
  const SQL = await initSqlJs();
  const database = new SQL.Database();
  try {
    database.run("CREATE TABLE rows (id INTEGER PRIMARY KEY, name TEXT NOT NULL)");
    database.run("INSERT INTO rows (id, name) VALUES (1, 'Ada')");
    await writeFile(file, Buffer.from(database.export()));
  } finally {
    database.close();
  }
}
