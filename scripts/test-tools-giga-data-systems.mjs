#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import initSqlJs from "sql.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const benchmarkArg = process.argv.find((arg) => arg.startsWith("--benchmark-output="));
const benchmarkOutput = benchmarkArg ? safeOutputPath(benchmarkArg.slice("--benchmark-output=".length)) : null;
await mkdir(path.join(repoRoot, ".tmp"), { recursive: true });
const tempRoot = await mkdtemp(path.join(repoRoot, ".tmp", "data-systems-phase19-"));
const phaseTools = [
  "vnem_tools_data_source_inspect",
  "vnem_tools_data_source_validate",
  "vnem_tools_data_source_diff",
  "vnem_tools_data_transform_plan",
  "vnem_tools_data_transform_apply",
  "vnem_tools_database_connection_plan",
  "vnem_tools_database_schema_inspect",
  "vnem_tools_database_query_plan",
  "vnem_tools_database_query",
  "vnem_tools_database_migration_preview",
  "vnem_tools_database_migration_apply",
  "vnem_tools_data_transaction_rollback"
];
const timings = {};
let client;
let transport;
let readonlyClient;
let readonlyTransport;
let stderr = "";

try {
  await createFixtures(tempRoot);
  ({ client, transport } = await connectTools(tempRoot, "approved-writes"));
  const listed = await client.listTools();
  const names = new Set(listed.tools.map((tool) => tool.name));
  for (const name of phaseTools) assert.ok(names.has(name), `missing Phase 19 tool ${name}`);

  const coverage = await callValue(client, "vnem_tools_tool_test_coverage_map", { root: repoRoot, max_tools: 250 }, "tool_test_coverage_map");
  for (const name of phaseTools) {
    assert.equal(coverage.per_tool[name]?.coverage_level, "behavior_test", `coverage mapper missed Phase 19 behavior for ${name}`);
    assert.ok(coverage.per_tool[name].behavior_test_files.includes("scripts/test-tools-giga-data-systems.mjs"));
  }

  const json = await timed("json_inspect_ms", () => callValue(client, "vnem_tools_data_source_inspect", { root: tempRoot, path: "users.json", max_rows: 10 }, "data_source_inspection"));
  assert.equal(json.operation_result, "data_source_inspected");
  assert.equal(json.source.format, "json");
  assert.equal(json.row_count, 3);
  assert.equal(json.schema.columns.some((column) => column.name === "id" && column.types.includes("integer")), true);
  assert.equal(json.schema.columns.find((column) => column.name === "secret_token").sensitive, true);
  assert.equal(json.preview[0].secret_token, "[REDACTED]");
  assert.doesNotMatch(JSON.stringify(json), /ghp_fixture_secret_value/);

  const jsonl = await callValue(client, "vnem_tools_data_source_inspect", { root: tempRoot, path: "events.jsonl" }, "data_source_inspection");
  const csv = await callValue(client, "vnem_tools_data_source_inspect", { root: tempRoot, path: "users.csv" }, "data_source_inspection");
  const yaml = await callValue(client, "vnem_tools_data_source_inspect", { root: tempRoot, path: "users.yaml" }, "data_source_inspection");
  assert.equal(jsonl.source.format, "jsonl");
  assert.equal(csv.source.format, "csv");
  assert.equal(yaml.source.format, "yaml");
  assert.match(csv.parser, /RFC 4180/);
  assert.match(yaml.parser, /FAILSAFE_SCHEMA/);

  const validation = await callValue(client, "vnem_tools_data_source_validate", {
    root: tempRoot,
    path: "users.json",
    expected_schema: { columns: { id: { type: "integer", required: true }, name: { type: "string", required: true }, missing: { type: "string", required: true } }, allow_extra_columns: true }
  }, "data_source_validation");
  assert.equal(validation.valid, false);
  assert.equal(validation.issue_count, 3);
  assert.ok(validation.issues.every((issue) => issue.code === "required_column_missing"));
  assert.equal(validation.values_returned, false);

  const diff = await callValue(client, "vnem_tools_data_source_diff", { root: tempRoot, left_path: "users.json", right_path: "users-next.json", key_columns: ["id"] }, "data_source_diff");
  assert.deepEqual({ added: diff.row_changes.added, removed: diff.row_changes.removed, changed: diff.row_changes.changed }, { added: 1, removed: 1, changed: 1 });
  assert.equal(diff.row_changes.values_returned, false);

  const transform = await timed("transform_plan_ms", () => callValue(client, "vnem_tools_data_transform_plan", {
    root: tempRoot,
    path: "users.json",
    output_path: "active-users.csv",
    output_format: "csv",
    operations: { select: ["id", "name", "active"], filters: [{ column: "active", operator: "eq", value: true }], rename: { name: "display_name" }, sort: [{ column: "id", direction: "desc" }] }
  }, "data_transform_plan"));
  assert.equal(transform.output.rows, 2);
  assert.equal(transform.dry_run, true);
  assert.equal(transform.secret_values_persisted_in_evidence, false);
  assert.equal(existsSync(path.join(tempRoot, "active-users.csv")), false);

  const transformDryRun = await callValue(client, "vnem_tools_data_transform_apply", { plan_id: transform.plan_id }, "data_transform_application");
  assert.equal(transformDryRun.dry_run, true);
  const transformed = await timed("transform_apply_ms", () => callValue(client, "vnem_tools_data_transform_apply", {
    plan_id: transform.plan_id,
    dry_run: false,
    approved: true,
    approval_note: "Phase 19 exact local structured-data transform with backup and rollback proof."
  }, "data_transform_application"));
  assert.equal(transformed.operation_result, "data_transform_applied");
  assert.equal(transformed.rollback_available, true);
  assert.equal(transformed.verification.hashes_match, true);
  assert.match(await readFile(path.join(tempRoot, "active-users.csv"), "utf8"), /display_name/);
  assert.doesNotMatch(await readFile(path.join(tempRoot, "active-users.csv"), "utf8"), /secret_token/);
  const transformRollback = await callValue(client, "vnem_tools_data_transaction_rollback", {
    transaction_id: transformed.transaction_id,
    dry_run: false,
    approved: true,
    approval_note: "Phase 19 exact structured-data transform rollback proof."
  }, "data_transaction_rollback");
  assert.equal(transformRollback.rollback.hashes_match, true);
  assert.equal(transformRollback.target_removed, true);
  assert.equal(existsSync(path.join(tempRoot, "active-users.csv")), false);

  const missingCredential = await callRaw(client, "vnem_tools_database_connection_plan", { connection: { type: "remote_postgres", access: "read_only", scope: { host: "db.example.com", database: "app", access: "read_only" } } });
  assert.equal(missingCredential.isError, true);
  assert.equal(missingCredential.structuredContent.code, "remote_database_credential_reference_required");
  const rawCredential = await callRaw(client, "vnem_tools_database_connection_plan", { connection: { type: "remote_postgres", access: "read_only", password: "must-never-be-accepted", scope: { host: "db.example.com", database: "app", access: "read_only" } } });
  assert.equal(rawCredential.isError, true);
  assert.doesNotMatch(JSON.stringify(rawCredential), /must-never-be-accepted/);
  const remotePlan = await callValue(client, "vnem_tools_database_connection_plan", {
    connection: {
      type: "remote_postgres",
      access: "read_only",
      credential_reference: { type: "environment", name: "VNEM_TEST_DATABASE_REFERENCE" },
      scope: { host: "db.example.com", port: 5432, database: "app", schemas: ["public"], access: "read_only", max_rows: 50 }
    }
  }, "database_connection_plan");
  assert.equal(remotePlan.execution_supported, false);
  assert.equal(remotePlan.credential_reference.value_exposed, false);
  assert.equal(remotePlan.scope.access, "read_only");
  assert.equal(remotePlan.raw_credentials_accepted, false);

  const schema = await timed("sqlite_schema_ms", () => callValue(client, "vnem_tools_database_schema_inspect", { root: tempRoot, path: "app.sqlite", include_row_counts: true }, "database_schema_inspection"));
  assert.equal(schema.database_engine, "SQLite");
  assert.equal(schema.read_only, true);
  const users = schema.schema.tables.find((table) => table.name === "users");
  assert.ok(users);
  assert.equal(users.row_count, 3);
  assert.equal(users.columns.find((column) => column.name === "secret_token").sensitive, true);
  assert.equal(schema.values_returned, false);

  const queryPlan = await timed("sqlite_query_plan_ms", () => callValue(client, "vnem_tools_database_query_plan", { root: tempRoot, path: "app.sqlite", sql: "SELECT id, name FROM users WHERE id >= ? ORDER BY id", parameters: [2] }, "database_query_plan"));
  assert.equal(queryPlan.read_only, true);
  assert.equal(queryPlan.executed_for_rows, false);
  assert.ok(queryPlan.query_plan.length >= 1);
  assert.equal(queryPlan.parameters.values_exposed, false);

  const query = await timed("sqlite_query_ms", () => callValue(client, "vnem_tools_database_query", { root: tempRoot, path: "app.sqlite", sql: "SELECT id, name, secret_token FROM users ORDER BY id", max_rows: 2 }, "database_query"));
  assert.equal(query.database_mutated, false);
  assert.equal(query.query_only_pragma_enabled, true);
  assert.equal(query.rows_returned, 2);
  assert.equal(query.rows_truncated, true);
  assert.ok(query.rows.every((row) => row.secret_token === "[REDACTED]"));
  assert.doesNotMatch(JSON.stringify(query), /db-secret-/);

  for (const [sql, code] of [
    ["UPDATE users SET name = 'unsafe' WHERE id = 1", "database_query_mutation_blocked"],
    ["PRAGMA table_info(users)", "database_query_mutation_blocked"],
    ["SELECT 1; SELECT 2", "database_multiple_statements_blocked"],
    ["WITH changed AS (DELETE FROM users WHERE id = 1 RETURNING id) SELECT * FROM changed", "database_query_mutation_blocked"]
  ]) {
    const blocked = await callRaw(client, "vnem_tools_database_query", { root: tempRoot, path: "app.sqlite", sql });
    assert.equal(blocked.isError, true, `expected blocked SQL: ${sql}`);
    assert.equal(blocked.structuredContent.code, code);
  }

  const noWhere = await callRaw(client, "vnem_tools_database_migration_preview", { root: tempRoot, path: "app.sqlite", statements: ["DELETE FROM users"] });
  assert.equal(noWhere.isError, true);
  assert.equal(noWhere.structuredContent.code, "database_migration_where_required");
  const attachment = await callRaw(client, "vnem_tools_database_migration_preview", { root: tempRoot, path: "app.sqlite", statements: ["ATTACH DATABASE 'other.sqlite' AS other"] });
  assert.equal(attachment.isError, true);
  assert.equal(attachment.structuredContent.code, "database_migration_capability_blocked");

  const migration = await timed("sqlite_migration_preview_ms", () => callValue(client, "vnem_tools_database_migration_preview", {
    root: tempRoot,
    path: "app.sqlite",
    statements: [
      "ALTER TABLE users ADD COLUMN active INTEGER DEFAULT 1",
      "CREATE INDEX idx_users_active ON users(active)",
      "INSERT INTO users(name, secret_token, active) VALUES ('Dora', 'db-secret-four', 1)"
    ]
  }, "database_migration_preview"));
  assert.equal(migration.database_file_mutated, false);
  assert.equal(migration.transaction_executed_in_memory_only, true);
  assert.equal(migration.affected_rows_preview.total, 1);
  assert.deepEqual(migration.schema_diff.changed_tables[0].added_columns, ["active"]);
  assert.ok(migration.schema_diff.added_indexes.includes("idx_users_active"));
  assert.equal(migration.apply_blocked_by_sidecars, false);
  assert.doesNotMatch(JSON.stringify(migration), /db-secret-four/);

  const migrationDryRun = await callValue(client, "vnem_tools_database_migration_apply", { preview_id: migration.preview_id }, "database_migration_application");
  assert.equal(migrationDryRun.dry_run, true);
  const applied = await timed("sqlite_migration_apply_ms", () => callValue(client, "vnem_tools_database_migration_apply", {
    preview_id: migration.preview_id,
    dry_run: false,
    approved: true,
    approval_note: "Phase 19 exact SQLite migration transaction with affected-row, backup, verification, and rollback proof."
  }, "database_migration_application"));
  assert.equal(applied.operation_result, "database_migration_applied");
  assert.equal(applied.affected_rows, 1);
  assert.equal(applied.backup.available, true);
  assert.equal(applied.rollback_available, true);
  assert.equal(applied.verification.valid, true);
  assert.equal(applied.concurrent_database_writers_supported, false);

  const afterApply = await callValue(client, "vnem_tools_database_query", { root: tempRoot, path: "app.sqlite", sql: "SELECT id, active, secret_token FROM users ORDER BY id", max_rows: 10 }, "database_query");
  assert.equal(afterApply.rows_returned, 4);
  assert.equal(afterApply.rows[3].active, 1);
  assert.equal(afterApply.rows[3].secret_token, "[REDACTED]");

  const migrationRollback = await timed("sqlite_rollback_ms", () => callValue(client, "vnem_tools_data_transaction_rollback", {
    transaction_id: applied.transaction_id,
    dry_run: false,
    approved: true,
    approval_note: "Phase 19 exact SQLite migration rollback and byte-hash verification proof."
  }, "data_transaction_rollback"));
  assert.equal(migrationRollback.rollback.completed, true);
  assert.equal(migrationRollback.rollback.hashes_match, true);
  const afterRollback = await callValue(client, "vnem_tools_database_schema_inspect", { root: tempRoot, path: "app.sqlite" }, "database_schema_inspection");
  assert.equal(afterRollback.schema.tables.find((table) => table.name === "users").columns.some((column) => column.name === "active"), false);

  await writeFile(path.join(tempRoot, "app.sqlite-wal"), "fixture-sidecar", "utf8");
  const sidecarPreview = await callValue(client, "vnem_tools_database_migration_preview", { root: tempRoot, path: "app.sqlite", statements: ["ALTER TABLE users ADD COLUMN note TEXT"] }, "database_migration_preview");
  assert.equal(sidecarPreview.apply_blocked_by_sidecars, true);
  const sidecarApply = await callRaw(client, "vnem_tools_database_migration_apply", { preview_id: sidecarPreview.preview_id, dry_run: false, approved: true, approval_note: "This must remain blocked by active SQLite sidecar evidence." });
  assert.equal(sidecarApply.isError, true);
  assert.equal(sidecarApply.structuredContent.code, "database_active_sidecar_blocked");
  await rm(path.join(tempRoot, "app.sqlite-wal"), { force: true });

  await transport.close();
  transport = null;
  client = null;
  ({ client: readonlyClient, transport: readonlyTransport } = await connectTools(tempRoot, "safe-readonly"));
  const readonlyQuery = await callValue(readonlyClient, "vnem_tools_database_query", { root: tempRoot, path: "app.sqlite", sql: "SELECT COUNT(*) AS count FROM users" }, "database_query");
  assert.equal(readonlyQuery.rows[0].count, 3);
  const readonlyMigration = await callValue(readonlyClient, "vnem_tools_database_migration_preview", { root: tempRoot, path: "app.sqlite", statements: ["ALTER TABLE users ADD COLUMN blocked TEXT"] }, "database_migration_preview");
  const deniedWrite = await callRaw(readonlyClient, "vnem_tools_database_migration_apply", { preview_id: readonlyMigration.preview_id, dry_run: false, approved: true, approval_note: "Safe-readonly must deny this write despite approval text." });
  assert.equal(deniedWrite.isError, true);
  assert.equal(deniedWrite.structuredContent.code, "permission_profile_blocked");

  const benchmark = {
    schema_version: "1.0.0",
    phase: 19,
    feature: "databases_and_structured_data",
    captured_at: new Date().toISOString(),
    real_stdio_mcp: true,
    tools_exercised: phaseTools,
    formats_proven: ["SQLite", "JSON", "JSONL", "CSV", "YAML"],
    timings_ms: timings,
    proof: {
      tabular_inspection: true,
      schema_inference: true,
      validation: true,
      diffing: true,
      transformation_apply_and_rollback: true,
      sqlite_schema_and_query_plan: true,
      sqlite_query_only_enforced: true,
      migration_preview_affected_rows: true,
      migration_backup_verify_rollback: true,
      secret_redaction: true,
      remote_credential_reference_and_scope: true,
      safe_readonly_write_denial: true,
      sidecar_concurrency_block: true,
      behavior_coverage_mapper_for_twelve_tools: true
    },
    mutation_boundaries: {
      remote_database_connection: false,
      raw_credentials: false,
      unpreviewed_write: false,
      write_without_permission: false,
      write_without_backup: false,
      write_without_rollback: false,
      active_wal_write: false,
      arbitrary_sql_mutation: false
    },
    limitations: [
      "SQLite is loaded into bounded memory through sql.js and mutation refuses active sidecars or concurrent-writer claims.",
      "Remote database plans validate references and scope but do not execute network connections.",
      "CSV parsing is a bounded RFC 4180-style implementation; schema inference and SQL lexical checks retain explicit heuristic limits."
    ]
  };
  if (benchmarkOutput) {
    await mkdir(path.dirname(benchmarkOutput), { recursive: true });
    await writeFile(benchmarkOutput, `${JSON.stringify(benchmark, null, 2)}\n`, "utf8");
  }
  console.log("VNEM GIGA Phase 19 data systems tests passed");
} finally {
  await transport?.close().catch(() => {});
  await readonlyTransport?.close().catch(() => {});
  await rm(tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }).catch(() => {});
}

async function createFixtures(root) {
  const users = [
    { id: 1, name: "Ada", active: true, secret_token: "ghp_fixture_secret_value_aaaaaaaa" },
    { id: 2, name: "Ben", active: false, secret_token: "ghp_fixture_secret_value_bbbbbbbb" },
    { id: 3, name: "Cy", active: true, secret_token: "ghp_fixture_secret_value_cccccccc" }
  ];
  const next = [
    { id: 1, name: "Ada Lovelace", active: true, secret_token: "ghp_fixture_secret_value_aaaaaaaa" },
    { id: 3, name: "Cy", active: true, secret_token: "ghp_fixture_secret_value_cccccccc" },
    { id: 4, name: "Dora", active: true, secret_token: "ghp_fixture_secret_value_dddddddd" }
  ];
  await writeFile(path.join(root, "users.json"), `${JSON.stringify(users, null, 2)}\n`, "utf8");
  await writeFile(path.join(root, "users-next.json"), `${JSON.stringify(next, null, 2)}\n`, "utf8");
  await writeFile(path.join(root, "events.jsonl"), `${JSON.stringify({ id: 1, type: "created" })}\n${JSON.stringify({ id: 2, type: "updated" })}\n`, "utf8");
  await writeFile(path.join(root, "users.csv"), "id,name,active,secret_token\n1,Ada,true,csv-secret-one\n2,\"Ben, Jr\",false,csv-secret-two\n", "utf8");
  await writeFile(path.join(root, "users.yaml"), "- id: 1\n  name: Ada\n  active: true\n  secret_token: yaml-secret-one\n- id: 2\n  name: Ben\n  active: false\n  secret_token: yaml-secret-two\n", "utf8");
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run("CREATE TABLE users(id INTEGER PRIMARY KEY, name TEXT NOT NULL, secret_token TEXT)");
  db.run("CREATE TABLE projects(id INTEGER PRIMARY KEY, owner_id INTEGER, name TEXT, FOREIGN KEY(owner_id) REFERENCES users(id))");
  db.run("CREATE INDEX idx_projects_owner ON projects(owner_id)");
  const insert = db.prepare("INSERT INTO users(id, name, secret_token) VALUES (?, ?, ?)");
  for (const row of [[1, "Ada", "db-secret-one"], [2, "Ben", "db-secret-two"], [3, "Cy", "db-secret-three"]]) insert.run(row);
  insert.free();
  db.run("INSERT INTO projects(owner_id, name) VALUES (1, 'VNEM')");
  await writeFile(path.join(root, "app.sqlite"), Buffer.from(db.export()));
  db.close();
}

async function connectTools(root, profile) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(repoRoot, "scripts", "vnem-tools-mcp-server.mjs")],
    cwd: repoRoot,
    env: {
      ...process.env,
      VNEM_TOOLS_ROOT: root,
      VNEM_TOOLS_PRECISION_ROOT: root,
      VNEM_TOOLS_ALLOWED_ROOTS: [repoRoot, root].join(path.delimiter),
      VNEM_TOOLS_EVIDENCE_ROOT: path.join(root, ".vnem", "tool-runs"),
      VNEM_TOOLS_PERMISSION_PROFILE: profile,
      VNEM_TOOLS_SKIP_WRANGLER_CHECK: "1"
    },
    stderr: "pipe"
  });
  transport.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });
  const client = new Client({ name: `vnem-phase19-${profile}`, version: "1.0.0" });
  await client.connect(transport);
  return { client, transport };
}

async function callRaw(targetClient, name, args) {
  return targetClient.callTool({ name, arguments: args });
}

async function callValue(targetClient, name, args, key) {
  const result = await callRaw(targetClient, name, args);
  if (result.isError) throw new Error(`${name} failed: ${JSON.stringify(result.structuredContent)}\n${stderr}`);
  return result.structuredContent[key];
}

async function timed(name, fn) {
  const started = performance.now();
  const result = await fn();
  timings[name] = Number((performance.now() - started).toFixed(2));
  return result;
}

function safeOutputPath(value) {
  const candidate = path.resolve(repoRoot, value);
  const relative = path.relative(repoRoot, candidate);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Benchmark output must remain inside the repository.");
  return candidate;
}
