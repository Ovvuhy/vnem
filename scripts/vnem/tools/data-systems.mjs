import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, lstat, mkdir, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";

const STRUCTURED_FORMATS = new Set(["json", "jsonl", "csv", "yaml"]);
const SQLITE_FORMATS = new Set(["sqlite", "sqlite3", "db"]);
const MAX_STRUCTURED_BYTES = 16 * 1024 * 1024;
const MAX_SQLITE_BYTES = 32 * 1024 * 1024;
const MAX_SOURCE_ROWS = 100_000;
const MAX_RESULT_ROWS = 500;
const MAX_RESULT_BYTES = 256 * 1024;
const MAX_COLUMNS = 200;
const SECRET_FIELD_PATTERN = /(?:^|[_-])(authorization|auth|api[_-]?key|cookie|credential|dsn|password|passwd|private[_-]?key|refresh[_-]?token|secret|session|token)(?:$|[_-])/i;
const SECRET_VALUE_PATTERNS = [
  /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\b(?:sk|pk)-(?:live|test)-[A-Za-z0-9_-]{16,}\b/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}\b/gi
];
const SENSITIVE_PATH_PATTERN = /(?:^|[/\\])(?:\.env(?:\.|$)|\.npmrc$|\.netrc$|credentials?(?:\.|$)|id_(?:rsa|dsa|ecdsa|ed25519)(?:\.|$)|cookies?(?:\.|$)|sessions?(?:\.|$))/i;
const REMOTE_CONNECTION_TYPES = new Set(["remote_postgres", "remote_mysql", "remote_mariadb", "remote_sqlserver"]);
const CREDENTIAL_REFERENCE_TYPES = new Set(["environment", "client_secret_reference", "os_credential_store", "provider_profile"]);
const SQL_MUTATION_KEYWORDS = new Set(["ALTER", "ATTACH", "BEGIN", "COMMIT", "CREATE", "DELETE", "DETACH", "DROP", "END", "INSERT", "PRAGMA", "REINDEX", "RELEASE", "REPLACE", "ROLLBACK", "SAVEPOINT", "TRUNCATE", "UPDATE", "VACUUM"]);
const MIGRATION_BLOCKED_KEYWORDS = new Set(["ATTACH", "DETACH", "PRAGMA", "REINDEX", "VACUUM"]);

let sqlJsPromise;
let sqlJsRuntimeState = "not_loaded";

export function dataSystemsRuntimeLoadStatus() {
  return {
    sqlite_engine: sqlJsRuntimeState,
    lazy: true,
    loads_on: "first SQLite inspection or transaction"
  };
}

export class DataSystemsError extends Error {
  constructor(message, code = "data_systems_error", details = {}) {
    super(message);
    this.name = "DataSystemsError";
    this.code = code;
    this.details = redactDeep(details);
  }
}

export class DataSystemsRuntime {
  constructor(options = {}) {
    this.allowedRoots = (options.allowedRoots || [process.cwd()]).map((item) => path.resolve(item));
    this.evidenceRoot = path.resolve(options.evidenceRoot || path.join(this.allowedRoots[0], ".vnem", "tool-runs"));
    if (!options.allowExternalEvidenceRoot && !insideAny(this.evidenceRoot, this.allowedRoots)) throw dataError("Data evidence root must remain inside an allowed root unless a shared global router supplied an isolated state namespace.", "data_evidence_root_blocked");
    this.maxStructuredBytes = boundedInteger(options.maxStructuredBytes, 1024, MAX_STRUCTURED_BYTES, MAX_STRUCTURED_BYTES);
    this.maxSqliteBytes = boundedInteger(options.maxSqliteBytes, 1024, MAX_SQLITE_BYTES, MAX_SQLITE_BYTES);
    this.transformPlans = new Map();
    this.migrationPreviews = new Map();
    this.transactions = new Map();
  }

  async sourceInspect(args = {}) {
    const source = await this.loadSource(args);
    if (source.format === "sqlite") return this.schemaInspect(args);
    const maxRows = boundedInteger(args.max_rows, 1, 500, 50);
    const maxColumns = boundedInteger(args.max_columns, 1, MAX_COLUMNS, 80);
    const schema = inferSchema(source.rows, maxColumns);
    const result = {
      operation_result: "data_source_inspected",
      source: sourceSummary(source),
      shape: source.shape,
      row_count: source.rows.length,
      column_count: schema.columns.length,
      schema,
      preview: redactRows(source.rows.slice(0, maxRows), maxColumns),
      preview_rows: Math.min(source.rows.length, maxRows),
      preview_truncated: source.rows.length > maxRows,
      result_limits: resultLimits(maxRows, maxColumns, args.max_bytes),
      secret_redaction: redactionPolicy(),
      parser: source.parser,
      evidence_log_id: null
    };
    result.evidence_log_id = (await this.writeEvidence("source-inspect", result)).evidence_log_id;
    return result;
  }

  async sourceValidate(args = {}) {
    const source = await this.loadSource(args);
    const maxIssues = boundedInteger(args.max_issues, 1, 500, 100);
    if (source.format === "sqlite") {
      const inspection = await this.schemaInspect(args);
      const validation = validateSqliteExpectation(inspection, args.expected_schema || {}, maxIssues);
      const result = {
        operation_result: "data_source_validated",
        source: inspection.source,
        valid: validation.issues.length === 0,
        issue_count: validation.total,
        issues: validation.issues,
        issues_truncated: validation.total > validation.issues.length,
        schema: inspection.schema,
        values_returned: false,
        secret_redaction: redactionPolicy(),
        evidence_log_id: null
      };
      result.evidence_log_id = (await this.writeEvidence("source-validate", result)).evidence_log_id;
      return result;
    }
    const inferred = inferSchema(source.rows, MAX_COLUMNS);
    const validation = validateRows(source.rows, args.expected_schema || {}, maxIssues);
    const result = {
      operation_result: "data_source_validated",
      source: sourceSummary(source),
      valid: validation.issues.length === 0,
      issue_count: validation.total,
      issues: validation.issues,
      issues_truncated: validation.total > validation.issues.length,
      inferred_schema: inferred,
      expected_schema_present: Object.keys(args.expected_schema || {}).length > 0,
      values_returned: false,
      secret_redaction: redactionPolicy(),
      evidence_log_id: null
    };
    result.evidence_log_id = (await this.writeEvidence("source-validate", result)).evidence_log_id;
    return result;
  }

  async sourceDiff(args = {}) {
    const left = await this.loadSource({ ...args, path: args.left_path, format: args.left_format || args.format });
    const right = await this.loadSource({ ...args, path: args.right_path, format: args.right_format || args.format });
    if (left.format === "sqlite" || right.format === "sqlite") throw dataError("Use database schema inspection and migration preview for SQLite changes.", "data_diff_sqlite_requires_database_tools");
    const keyColumns = uniqueStrings(args.key_columns || []).slice(0, 8);
    const maxChanges = boundedInteger(args.max_changes, 1, 500, 100);
    const leftMap = indexRows(left.rows, keyColumns);
    const rightMap = indexRows(right.rows, keyColumns);
    const added = [];
    const removed = [];
    const changed = [];
    for (const [key, rightRow] of rightMap) {
      if (!leftMap.has(key)) added.push(key);
      else if (stableHash(leftMap.get(key)) !== stableHash(rightRow)) changed.push(key);
    }
    for (const key of leftMap.keys()) if (!rightMap.has(key)) removed.push(key);
    const leftSchema = inferSchema(left.rows, MAX_COLUMNS);
    const rightSchema = inferSchema(right.rows, MAX_COLUMNS);
    const result = {
      operation_result: "data_sources_diffed",
      left: sourceSummary(left),
      right: sourceSummary(right),
      key_strategy: keyColumns.length ? { type: "columns", columns: keyColumns } : { type: "row_sha256", columns: [] },
      row_changes: {
        added: added.length,
        removed: removed.length,
        changed: changed.length,
        unchanged: [...rightMap.keys()].filter((key) => leftMap.has(key) && stableHash(leftMap.get(key)) === stableHash(rightMap.get(key))).length,
        sample_added_keys: redactDeep(added.slice(0, maxChanges)),
        sample_removed_keys: redactDeep(removed.slice(0, maxChanges)),
        sample_changed_keys: redactDeep(changed.slice(0, maxChanges)),
        values_returned: false
      },
      schema_diff: diffInferredSchemas(leftSchema, rightSchema),
      changes_truncated: added.length > maxChanges || removed.length > maxChanges || changed.length > maxChanges,
      secret_redaction: redactionPolicy(),
      evidence_log_id: null
    };
    result.evidence_log_id = (await this.writeEvidence("source-diff", result)).evidence_log_id;
    return result;
  }

  async transformPlan(args = {}) {
    const source = await this.loadSource(args);
    if (!STRUCTURED_FORMATS.has(source.format)) throw dataError("Transform planning supports JSON, JSONL, CSV, and YAML sources.", "data_transform_format_unsupported", { format: source.format });
    const root = await this.resolveRoot(args.root || ".");
    const outputFormat = normalizeStructuredFormat(args.output_format || formatFromPath(args.output_path) || source.format);
    const outputPath = await this.resolveOutputPath(root, args.output_path);
    const operations = normalizeTransformOperations(args.operations || {});
    const transformed = transformRows(source.rows, operations);
    const encoded = encodeRows(transformed, outputFormat);
    if (encoded.byteLength > this.maxStructuredBytes) throw dataError("Transformed output exceeds the configured byte limit.", "data_transform_output_too_large", { bytes: encoded.byteLength, max_bytes: this.maxStructuredBytes });
    const planId = `data-plan-${stableHash({ source: source.sha256, outputPath, outputFormat, operations: redactTransformOperations(operations) }).slice(0, 20)}`;
    const plan = {
      plan_id: planId,
      root,
      source_path: source.path,
      source_sha256: source.sha256,
      source_format: source.format,
      output_path: outputPath,
      output_format: outputFormat,
      operations,
      output_sha256: sha256(encoded),
      output_bytes: encoded.byteLength,
      input_rows: source.rows.length,
      output_rows: transformed.length,
      created_at: new Date().toISOString()
    };
    this.transformPlans.set(planId, plan);
    const result = {
      operation_result: "data_transform_planned",
      plan_id: planId,
      source: sourceSummary(source),
      output: { path: outputPath, format: outputFormat, rows: transformed.length, bytes: encoded.byteLength, sha256: plan.output_sha256 },
      operations: redactTransformOperations(operations),
      preview: redactRows(transformed.slice(0, boundedInteger(args.max_rows, 1, 200, 25)), MAX_COLUMNS),
      dry_run: true,
      write_requirements: mutationRequirements("database_write", true),
      secret_values_persisted_in_evidence: false,
      limitations: ["Transformation plans are in-session and hash-bound to the exact source bytes.", "Actual transformed data may preserve source secrets, but tool output and evidence redact them."],
      evidence_log_id: null
    };
    result.evidence_log_id = (await this.writeEvidence("transform-plan", result)).evidence_log_id;
    return result;
  }

  transformApplyPlan(args = {}) {
    const plan = this.requireTransformPlan(args.plan_id);
    return {
      operation_result: "data_transform_apply_planned",
      plan_id: plan.plan_id,
      source_path: plan.source_path,
      output_path: plan.output_path,
      source_sha256: plan.source_sha256,
      expected_output_sha256: plan.output_sha256,
      expected_rows: plan.output_rows,
      dry_run: true,
      write_requirements: mutationRequirements("database_write", true),
      safe_next_step: "Use an approved write profile and submit dry_run=false with approved=true and a specific approval_note."
    };
  }

  async transformApply(args = {}) {
    const plan = this.requireTransformPlan(args.plan_id);
    requirePermissionDecision(args.permission_decision, "database_write");
    const current = await this.loadSource({ root: plan.root, path: plan.source_path, format: plan.source_format });
    if (current.sha256 !== plan.source_sha256) throw dataError("Transform source changed after preview.", "data_transform_preview_stale", { expected_sha256: plan.source_sha256, actual_sha256: current.sha256 });
    const transformed = transformRows(current.rows, plan.operations);
    const encoded = encodeRows(transformed, plan.output_format);
    if (sha256(encoded) !== plan.output_sha256) throw dataError("Transform output no longer matches the reviewed preview.", "data_transform_output_changed");
    const transaction = await this.writeTransactionalFile({
      kind: "structured_transform",
      root: plan.root,
      targetPath: plan.output_path,
      bytes: encoded,
      planId: plan.plan_id,
      expectedSource: { path: plan.source_path, sha256: plan.source_sha256 }
    });
    const result = {
      operation_result: "data_transform_applied",
      executed: true,
      plan_id: plan.plan_id,
      transaction_id: transaction.transaction_id,
      output_path: plan.output_path,
      output_format: plan.output_format,
      rows_written: transformed.length,
      bytes_written: encoded.byteLength,
      output_sha256: transaction.after_sha256,
      backup: transaction.backup,
      rollback_available: true,
      verification: transaction.verification,
      permission: args.permission_decision,
      secret_values_persisted_in_evidence: false,
      cross_file_filesystem_atomicity_claimed: false,
      evidence_log_id: null
    };
    result.evidence_log_id = (await this.writeEvidence("transform-apply", result)).evidence_log_id;
    return result;
  }

  async connectionPlan(args = {}) {
    const connection = normalizeConnection(args.connection || {});
    if (connection.type === "local_sqlite") {
      const root = await this.resolveRoot(args.root || ".");
      const file = await this.resolveInputPath(root, connection.path || args.path, { maxBytes: this.maxSqliteBytes });
      return {
        operation_result: "database_connection_planned",
        connection_type: "local_sqlite",
        local_path: file.path,
        read_only_default: true,
        execution_supported: true,
        permission_action: connection.access === "read_write" ? "database_write" : "database_read",
        credential_reference_required: false,
        raw_credentials_accepted: false,
        scope: { root, database: path.basename(file.path), access: connection.access },
        limitations: sqliteLimitations()
      };
    }
    const credentialReference = normalizeCredentialReference(connection.credential_reference);
    const scope = normalizeRemoteScope(connection.scope);
    if (scope.access === "read_write" && args.allow_remote_write !== true) throw dataError("Remote write scope requires an explicit allow_remote_write acknowledgement in the plan.", "remote_database_write_scope_not_acknowledged");
    const result = {
      operation_result: "database_connection_planned",
      connection_type: connection.type,
      provider: connection.provider || connection.type.replace("remote_", ""),
      credential_reference: { type: credentialReference.type, name: credentialReference.name, value_exposed: false },
      scope,
      read_only_default: true,
      execution_supported: false,
      permission_action: scope.access === "read_write" ? "database_write" : "database_read",
      credential_reference_required: true,
      explicit_scope_required: true,
      raw_credentials_accepted: false,
      safe_next_step: "Install and review a provider-specific adapter before attempting a remote connection; this runtime does not execute remote database traffic."
    };
    result.evidence_log_id = (await this.writeEvidence("connection-plan", result)).evidence_log_id;
    return result;
  }

  async schemaInspect(args = {}) {
    const database = await this.openSqlite(args);
    try {
      const maxTables = boundedInteger(args.max_tables, 1, 200, 80);
      const maxColumns = boundedInteger(args.max_columns, 1, MAX_COLUMNS, 120);
      const schema = inspectSqliteSchema(database.db, { maxTables, maxColumns, includeRowCounts: args.include_row_counts === true });
      const result = {
        operation_result: "database_schema_inspected",
        source: database.source,
        database_engine: "SQLite",
        sqlite_runtime: "sql.js WebAssembly",
        read_only: true,
        schema,
        result_limits: { max_tables: maxTables, max_columns: maxColumns, max_sqlite_bytes: this.maxSqliteBytes },
        values_returned: false,
        secret_redaction: redactionPolicy(),
        limitations: sqliteLimitations(),
        evidence_log_id: null
      };
      result.evidence_log_id = (await this.writeEvidence("schema-inspect", result)).evidence_log_id;
      return result;
    } finally {
      database.db.close();
    }
  }

  async queryPlan(args = {}) {
    const sql = validateReadOnlySql(args.sql);
    const parameters = normalizeSqlParameters(args.parameters);
    const database = await this.openSqlite(args);
    try {
      database.db.run("PRAGMA query_only = ON");
      const explain = executePreparedRows(database.db, `EXPLAIN QUERY PLAN ${sql}`, parameters, 200).rows.map((row) => redactDeep(row));
      const planId = `query-plan-${stableHash({ database: database.source.sha256, sql, parameter_shape: parameterSummary(parameters) }).slice(0, 20)}`;
      const result = {
        operation_result: "database_query_planned",
        plan_id: planId,
        source: database.source,
        read_only: true,
        single_statement: true,
        sql_sha256: sha256(sql),
        sql_preview: redactSql(sql),
        parameters: parameterSummary(parameters),
        query_plan: explain,
        result_limits: resultLimits(args.max_rows, args.max_columns, args.max_bytes),
        permission_action: "database_read",
        secret_parameter_values_exposed: false,
        executed_for_rows: false,
        limitations: sqliteLimitations(),
        evidence_log_id: null
      };
      result.evidence_log_id = (await this.writeEvidence("query-plan", result)).evidence_log_id;
      return result;
    } catch (error) {
      throw normalizeSqliteError(error, "database_query_plan_failed");
    } finally {
      database.db.close();
    }
  }

  async queryExecute(args = {}) {
    const sql = validateReadOnlySql(args.sql);
    const parameters = normalizeSqlParameters(args.parameters);
    const maxRows = boundedInteger(args.max_rows, 1, MAX_RESULT_ROWS, 100);
    const maxColumns = boundedInteger(args.max_columns, 1, MAX_COLUMNS, 80);
    const maxBytes = boundedInteger(args.max_bytes, 1024, MAX_RESULT_BYTES, 64 * 1024);
    const database = await this.openSqlite(args);
    try {
      database.db.run("PRAGMA query_only = ON");
      const execution = executePreparedRows(database.db, sql, parameters, maxRows + 1, maxColumns);
      const rawRows = execution.rows.slice(0, maxRows);
      const bounded = boundRowsByBytes(redactRows(rawRows, maxColumns), maxBytes);
      const result = {
        operation_result: "database_query_completed",
        source: database.source,
        read_only: true,
        query_only_pragma_enabled: true,
        sql_sha256: sha256(sql),
        columns: execution.columns.slice(0, maxColumns),
        rows: bounded.rows,
        rows_returned: bounded.rows.length,
        rows_truncated: execution.rows.length > maxRows || bounded.truncated,
        columns_truncated: execution.columns.length > maxColumns,
        result_bytes: bounded.bytes,
        result_limits: { max_rows: maxRows, max_columns: maxColumns, max_bytes: maxBytes },
        parameters: parameterSummary(parameters),
        secret_parameter_values_exposed: false,
        secret_redaction: redactionPolicy(),
        database_mutated: false,
        evidence_log_id: null
      };
      result.evidence_log_id = (await this.writeEvidence("query-execute", result)).evidence_log_id;
      return result;
    } catch (error) {
      throw normalizeSqliteError(error, "database_query_failed");
    } finally {
      database.db.close();
    }
  }

  async migrationPreview(args = {}) {
    const statements = normalizeMigrationStatements(args.statements);
    const database = await this.openSqlite(args);
    try {
      const sidecars = sqliteSidecars(database.source.path).filter((item) => existsSync(item));
      const schemaBefore = inspectSqliteSchema(database.db, { maxTables: 200, maxColumns: MAX_COLUMNS, includeRowCounts: false });
      const statementResults = [];
      database.db.run("BEGIN IMMEDIATE");
      try {
        for (const statement of statements) {
          database.db.run(statement.sql);
          statementResults.push({
            index: statement.index,
            kind: statement.kind,
            sql_sha256: statement.sha256,
            sql_preview: redactSql(statement.sql),
            affected_rows: database.db.getRowsModified(),
            destructive: statement.destructive
          });
        }
        const schemaAfter = inspectSqliteSchema(database.db, { maxTables: 200, maxColumns: MAX_COLUMNS, includeRowCounts: false });
        database.db.run("ROLLBACK");
        const previewId = `migration-preview-${stableHash({ source: database.source.sha256, statements: statements.map((item) => item.sha256) }).slice(0, 20)}`;
        const preview = {
          preview_id: previewId,
          root: database.root,
          database_path: database.source.path,
          source_sha256: database.source.sha256,
          statements,
          statement_results: statementResults,
          schema_before_sha256: stableHash(schemaBefore),
          schema_after_sha256: stableHash(schemaAfter),
          schema_diff: diffSqliteSchemas(schemaBefore, schemaAfter),
          affected_rows_total: statementResults.reduce((sum, item) => sum + item.affected_rows, 0),
          destructive: statementResults.some((item) => item.destructive),
          sidecars,
          created_at: new Date().toISOString()
        };
        this.migrationPreviews.set(previewId, preview);
        const result = {
          operation_result: "database_migration_previewed",
          preview_id: previewId,
          source: database.source,
          transaction_executed_in_memory_only: true,
          database_file_mutated: false,
          statements: statementResults,
          affected_rows_preview: { total: preview.affected_rows_total, per_statement: statementResults.map(({ index, affected_rows }) => ({ index, affected_rows })) },
          schema_diff: preview.schema_diff,
          destructive_statements_present: preview.destructive,
          active_sidecars_detected: sidecars,
          apply_blocked_by_sidecars: sidecars.length > 0,
          write_requirements: mutationRequirements("database_write", true),
          backup_required: true,
          rollback_required: true,
          evidence_log_id: null
        };
        result.evidence_log_id = (await this.writeEvidence("migration-preview", result)).evidence_log_id;
        return result;
      } catch (error) {
        try { database.db.run("ROLLBACK"); } catch {}
        throw error;
      }
    } catch (error) {
      throw normalizeSqliteError(error, "database_migration_preview_failed");
    } finally {
      database.db.close();
    }
  }

  migrationApplyPlan(args = {}) {
    const preview = this.requireMigrationPreview(args.preview_id);
    return {
      operation_result: "database_migration_apply_planned",
      preview_id: preview.preview_id,
      database_path: preview.database_path,
      source_sha256: preview.source_sha256,
      statement_count: preview.statements.length,
      affected_rows_preview: preview.affected_rows_total,
      destructive_statements_present: preview.destructive,
      active_sidecars_detected: preview.sidecars,
      dry_run: true,
      write_requirements: mutationRequirements("database_write", true),
      destructive_acknowledgement_required: preview.destructive,
      safe_next_step: preview.sidecars.length ? "Close the database owner and remove live WAL/journal state safely before creating a fresh preview." : "Use an approved write profile and exact approval against this fresh preview."
    };
  }

  async migrationApply(args = {}) {
    const preview = this.requireMigrationPreview(args.preview_id);
    requirePermissionDecision(args.permission_decision, "database_write");
    if (preview.destructive && args.acknowledge_destructive !== true) throw dataError("Destructive migration statements require acknowledge_destructive=true.", "database_destructive_migration_not_acknowledged");
    const sidecars = sqliteSidecars(preview.database_path).filter((item) => existsSync(item));
    if (sidecars.length) throw dataError("SQLite WAL, shared-memory, or journal sidecars are active; applying from an in-memory copy could lose concurrent state.", "database_active_sidecar_blocked", { sidecars });
    const current = await readFile(preview.database_path);
    const currentHash = sha256(current);
    if (currentHash !== preview.source_sha256) throw dataError("Database changed after migration preview.", "database_migration_preview_stale", { expected_sha256: preview.source_sha256, actual_sha256: currentHash });
    const SQL = await loadSqlJs();
    const db = new SQL.Database(current);
    let exported;
    let affectedRows = 0;
    try {
      db.run("BEGIN IMMEDIATE");
      for (const statement of preview.statements) {
        db.run(statement.sql);
        affectedRows += db.getRowsModified();
      }
      db.run("COMMIT");
      const schemaAfter = inspectSqliteSchema(db, { maxTables: 200, maxColumns: MAX_COLUMNS, includeRowCounts: false });
      if (stableHash(schemaAfter) !== preview.schema_after_sha256) throw dataError("Applied migration schema differs from the reviewed preview.", "database_migration_schema_mismatch");
      if (affectedRows !== preview.affected_rows_total) throw dataError("Applied affected-row count differs from the reviewed preview.", "database_migration_affected_rows_mismatch", { expected: preview.affected_rows_total, actual: affectedRows });
      exported = Buffer.from(db.export());
    } catch (error) {
      try { db.run("ROLLBACK"); } catch {}
      throw normalizeSqliteError(error, "database_migration_execution_failed");
    } finally {
      db.close();
    }
    const latestHash = sha256(await readFile(preview.database_path));
    if (latestHash !== preview.source_sha256) throw dataError("Database changed while the migration was being prepared.", "database_migration_concurrent_change", { expected_sha256: preview.source_sha256, actual_sha256: latestHash });
    const transaction = await this.writeTransactionalFile({
      kind: "sqlite_migration",
      root: preview.root,
      targetPath: preview.database_path,
      bytes: exported,
      planId: preview.preview_id,
      expectedSource: { path: preview.database_path, sha256: preview.source_sha256 }
    });
    const verification = await this.verifySqliteFile(preview.database_path, preview.schema_after_sha256);
    if (!verification.valid) {
      await this.rollbackTransaction({ transaction_id: transaction.transaction_id, force_internal: true });
      throw dataError("Post-write database verification failed; the exact backup was restored.", "database_migration_verification_failed_rolled_back", { verification, transaction_id: transaction.transaction_id });
    }
    const result = {
      operation_result: "database_migration_applied",
      executed: true,
      preview_id: preview.preview_id,
      transaction_id: transaction.transaction_id,
      database_path: preview.database_path,
      before_sha256: preview.source_sha256,
      after_sha256: transaction.after_sha256,
      affected_rows: affectedRows,
      schema_diff: preview.schema_diff,
      backup: transaction.backup,
      rollback_available: true,
      verification,
      permission: args.permission_decision,
      cross_file_filesystem_atomicity_claimed: false,
      concurrent_database_writers_supported: false,
      evidence_log_id: null
    };
    result.evidence_log_id = (await this.writeEvidence("migration-apply", result)).evidence_log_id;
    return result;
  }

  rollbackPlan(args = {}) {
    const transaction = this.requireTransaction(args.transaction_id);
    return {
      operation_result: "data_transaction_rollback_planned",
      transaction_id: transaction.transaction_id,
      kind: transaction.kind,
      target_path: transaction.target_path,
      expected_current_sha256: transaction.after_sha256,
      restore_sha256: transaction.before_sha256,
      target_existed_before: transaction.target_existed_before,
      dry_run: true,
      write_requirements: mutationRequirements("database_write", true)
    };
  }

  async rollbackTransaction(args = {}) {
    const transaction = this.requireTransaction(args.transaction_id);
    if (!args.force_internal) requirePermissionDecision(args.permission_decision, "database_write");
    if (transaction.rolled_back_at) throw dataError("Data transaction is already rolled back.", "data_transaction_already_rolled_back", { transaction_id: transaction.transaction_id });
    const currentHash = existsSync(transaction.target_path) ? sha256(await readFile(transaction.target_path)) : null;
    if (currentHash !== transaction.after_sha256) throw dataError("Rollback target changed after the transaction.", "data_rollback_precondition_changed", { expected_sha256: transaction.after_sha256, actual_sha256: currentHash });
    if (transaction.target_existed_before) {
      await copyFile(transaction.backup.path, transaction.target_path);
    } else {
      await rm(transaction.target_path, { force: true });
    }
    const restoredHash = existsSync(transaction.target_path) ? sha256(await readFile(transaction.target_path)) : null;
    if (restoredHash !== transaction.before_sha256) throw dataError("Rollback verification did not match the retained original.", "data_rollback_verification_failed", { expected_sha256: transaction.before_sha256, actual_sha256: restoredHash });
    transaction.rolled_back_at = new Date().toISOString();
    transaction.rollback_hashes_match = true;
    await writeFile(transaction.manifest_path, `${JSON.stringify(redactDeep(transaction), null, 2)}\n`, "utf8");
    const result = {
      operation_result: "data_transaction_rolled_back",
      executed: true,
      transaction_id: transaction.transaction_id,
      kind: transaction.kind,
      target_path: transaction.target_path,
      restored_sha256: restoredHash,
      target_removed: !transaction.target_existed_before,
      rollback: { completed: true, hashes_match: true },
      permission: args.permission_decision || { internal_automatic_rollback: true },
      evidence_log_id: null
    };
    result.evidence_log_id = (await this.writeEvidence("transaction-rollback", result)).evidence_log_id;
    return result;
  }

  async loadSource(args = {}) {
    const root = await this.resolveRoot(args.root || ".");
    const requestedFormat = normalizeFormat(args.format || formatFromPath(args.path));
    const maxBytes = SQLITE_FORMATS.has(requestedFormat) ? this.maxSqliteBytes : boundedInteger(args.max_bytes, 1024, this.maxStructuredBytes, this.maxStructuredBytes);
    const file = await this.resolveInputPath(root, args.path, { maxBytes });
    const format = requestedFormat || normalizeFormat(formatFromPath(file.path));
    if (SQLITE_FORMATS.has(format)) return { format: "sqlite", path: file.path, relative_path: relativeFrom(root, file.path), bytes: file.bytes, sha256: file.sha256, root, parser: "sql.js SQLite WebAssembly", rows: [], shape: "database" };
    if (!STRUCTURED_FORMATS.has(format)) throw dataError("Supported local data formats are SQLite, JSON, JSONL, CSV, and YAML.", "data_format_unsupported", { format, path: file.path });
    const text = file.buffer.toString("utf8");
    if (text.includes("\u0000")) throw dataError("Structured text contains NUL bytes.", "data_text_binary_blocked");
    const parsed = parseStructuredText(text, format);
    if (parsed.rows.length > MAX_SOURCE_ROWS) throw dataError("Structured source exceeds the row limit.", "data_source_row_limit", { rows: parsed.rows.length, max_rows: MAX_SOURCE_ROWS });
    assertNoPrototypePollution(parsed.value);
    return {
      format,
      path: file.path,
      relative_path: relativeFrom(root, file.path),
      bytes: file.bytes,
      sha256: file.sha256,
      root,
      parser: parsed.parser,
      shape: parsed.shape,
      rows: parsed.rows,
      value: parsed.value,
      parser_warnings: parsed.warnings || []
    };
  }

  async openSqlite(args = {}) {
    const root = await this.resolveRoot(args.root || ".");
    const file = await this.resolveInputPath(root, args.path || args.connection?.path, { maxBytes: this.maxSqliteBytes });
    const format = normalizeFormat(args.format || formatFromPath(file.path));
    if (!SQLITE_FORMATS.has(format)) throw dataError("Database tools currently support local SQLite files only.", "database_engine_unsupported", { format });
    const SQL = await loadSqlJs();
    try {
      const db = new SQL.Database(file.buffer);
      return {
        root,
        db,
        source: { path: file.path, relative_path: relativeFrom(root, file.path), bytes: file.bytes, sha256: file.sha256, format: "sqlite" }
      };
    } catch (error) {
      throw dataError(`SQLite file could not be opened: ${error.message}`, "database_open_failed", { path: file.path });
    }
  }

  async resolveRoot(requested) {
    const candidate = path.resolve(requested || ".");
    let resolved;
    try { resolved = await realpath(candidate); } catch { throw dataError("Data root does not exist.", "data_root_missing", { root: candidate }); }
    if (!insideAny(resolved, this.allowedRoots)) throw dataError("Data root is outside the configured allowed roots.", "data_root_outside_allowed_roots", { root: resolved });
    return resolved;
  }

  async resolveInputPath(root, requestedPath, options = {}) {
    if (!requestedPath) throw dataError("A data source path is required.", "data_path_required");
    const candidate = path.resolve(root, requestedPath);
    if (!inside(root, candidate)) throw dataError("Data path escapes the selected root.", "data_path_escape_blocked", { path: candidate });
    if (SENSITIVE_PATH_PATTERN.test(relativeFrom(root, candidate))) throw dataError("Credential/session-like files are blocked as data sources.", "data_sensitive_path_blocked", { path: relativeFrom(root, candidate) });
    const link = await lstat(candidate).catch(() => null);
    if (!link) throw dataError("Data source does not exist.", "data_source_missing", { path: candidate });
    if (link.isSymbolicLink()) throw dataError("Symbolic-link data sources are blocked.", "data_source_link_blocked", { path: candidate });
    const resolved = await realpath(candidate);
    if (!inside(root, resolved) || !insideAny(resolved, this.allowedRoots)) throw dataError("Resolved data source escapes the allowed root.", "data_source_realpath_escape_blocked", { path: resolved });
    const info = await stat(resolved);
    if (!info.isFile()) throw dataError("Data source must be a regular file.", "data_source_not_file", { path: resolved });
    const maxBytes = options.maxBytes || this.maxStructuredBytes;
    if (info.size > maxBytes) throw dataError("Data source exceeds the configured byte limit.", "data_source_too_large", { bytes: info.size, max_bytes: maxBytes });
    const buffer = await readFile(resolved);
    return { path: resolved, bytes: buffer.byteLength, buffer, sha256: sha256(buffer) };
  }

  async resolveOutputPath(root, requestedPath) {
    if (!requestedPath) throw dataError("An output_path is required for a transform plan.", "data_output_path_required");
    const candidate = path.resolve(root, requestedPath);
    if (!inside(root, candidate)) throw dataError("Data output path escapes the selected root.", "data_output_path_escape_blocked", { path: candidate });
    if (SENSITIVE_PATH_PATTERN.test(relativeFrom(root, candidate))) throw dataError("Credential/session-like output paths are blocked.", "data_sensitive_output_path_blocked", { path: relativeFrom(root, candidate) });
    const parent = await realpath(path.dirname(candidate)).catch(() => null);
    if (!parent || !inside(root, parent) || !insideAny(parent, this.allowedRoots)) throw dataError("Data output parent must already exist inside the allowed root.", "data_output_parent_blocked", { path: candidate });
    if (existsSync(candidate)) {
      const link = await lstat(candidate);
      if (link.isSymbolicLink() || !link.isFile()) throw dataError("Existing data output must be a regular non-link file.", "data_output_target_blocked", { path: candidate });
    }
    return candidate;
  }

  requireTransformPlan(planId) {
    const plan = this.transformPlans.get(String(planId || ""));
    if (!plan) throw dataError("Transform plan is missing or belongs to another server session.", "data_transform_plan_not_found", { plan_id: planId });
    return plan;
  }

  requireMigrationPreview(previewId) {
    const preview = this.migrationPreviews.get(String(previewId || ""));
    if (!preview) throw dataError("Migration preview is missing or belongs to another server session.", "database_migration_preview_not_found", { preview_id: previewId });
    return preview;
  }

  requireTransaction(transactionId) {
    const transaction = this.transactions.get(String(transactionId || ""));
    if (!transaction) throw dataError("Data transaction is missing or belongs to another server session.", "data_transaction_not_found", { transaction_id: transactionId });
    return transaction;
  }

  async writeTransactionalFile({ kind, root, targetPath, bytes, planId, expectedSource }) {
    if (!inside(root, targetPath) || !insideAny(targetPath, this.allowedRoots)) throw dataError("Transaction target escapes the allowed root.", "data_transaction_target_blocked");
    const transactionId = `data-tx-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const transactionRoot = path.join(this.evidenceRoot, "data-systems", "transactions", transactionId);
    await mkdir(transactionRoot, { recursive: true });
    const targetExisted = existsSync(targetPath);
    const beforeBytes = targetExisted ? await readFile(targetPath) : null;
    const beforeHash = beforeBytes ? sha256(beforeBytes) : null;
    const backupPath = targetExisted ? path.join(transactionRoot, "original.bin") : null;
    if (targetExisted) await writeFile(backupPath, beforeBytes);
    const tempPath = path.join(path.dirname(targetPath), `.${path.basename(targetPath)}.${transactionId}.tmp`);
    let wroteTarget = false;
    try {
      await writeFile(tempPath, bytes);
      if (expectedSource?.path === targetPath) {
        const latestHash = targetExisted ? sha256(await readFile(targetPath)) : null;
        if (latestHash !== expectedSource.sha256) throw dataError("Transaction source changed before replacement.", "data_transaction_source_changed", { expected_sha256: expectedSource.sha256, actual_sha256: latestHash });
      }
      if (targetExisted) await rm(targetPath, { force: true });
      await rename(tempPath, targetPath);
      wroteTarget = true;
      const afterHash = sha256(await readFile(targetPath));
      if (afterHash !== sha256(bytes)) throw dataError("Transaction write verification failed.", "data_transaction_write_verification_failed", { expected_sha256: sha256(bytes), actual_sha256: afterHash });
      const transaction = {
        schema_version: "1.0.0",
        transaction_id: transactionId,
        kind,
        plan_id: planId,
        root,
        target_path: targetPath,
        target_existed_before: targetExisted,
        before_sha256: beforeHash,
        after_sha256: afterHash,
        backup: { available: targetExisted, path: backupPath, sha256: beforeHash },
        expected_source: expectedSource || null,
        created_at: new Date().toISOString(),
        rolled_back_at: null,
        manifest_path: path.join(transactionRoot, "manifest.json"),
        verification: { target_exists: true, hashes_match: true }
      };
      await writeFile(transaction.manifest_path, `${JSON.stringify(redactDeep(transaction), null, 2)}\n`, "utf8");
      this.transactions.set(transactionId, transaction);
      return transaction;
    } catch (error) {
      await rm(tempPath, { force: true }).catch(() => {});
      if (wroteTarget || !existsSync(targetPath)) {
        if (targetExisted && backupPath && existsSync(backupPath)) await copyFile(backupPath, targetPath).catch(() => {});
        else if (!targetExisted) await rm(targetPath, { force: true }).catch(() => {});
      }
      throw error;
    }
  }

  async verifySqliteFile(filePath, expectedSchemaHash) {
    const bytes = await readFile(filePath);
    const SQL = await loadSqlJs();
    let db;
    try {
      db = new SQL.Database(bytes);
      const integrity = executePreparedRows(db, "PRAGMA integrity_check", undefined, 10).rows;
      const schema = inspectSqliteSchema(db, { maxTables: 200, maxColumns: MAX_COLUMNS, includeRowCounts: false });
      const schemaHash = stableHash(schema);
      return { valid: integrity.length === 1 && Object.values(integrity[0])[0] === "ok" && schemaHash === expectedSchemaHash, integrity_check: redactDeep(integrity), schema_sha256: schemaHash, expected_schema_sha256: expectedSchemaHash };
    } catch (error) {
      return { valid: false, error: redactText(error.message), expected_schema_sha256: expectedSchemaHash };
    } finally {
      db?.close();
    }
  }

  async writeEvidence(kind, payload) {
    const dir = path.join(this.evidenceRoot, "data-systems", "evidence");
    await mkdir(dir, { recursive: true });
    const evidenceLogId = `data-${kind}-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const file = path.join(dir, `${evidenceLogId}.json`);
    await writeFile(file, `${JSON.stringify(redactDeep({ schema_version: "1.0.0", kind, captured_at: new Date().toISOString(), payload }), null, 2)}\n`, "utf8");
    return { evidence_log_id: evidenceLogId, evidence_path: file };
  }
}

async function loadSqlJs() {
  if (!sqlJsPromise) {
    sqlJsRuntimeState = "loading";
    sqlJsPromise = import("sql.js")
      .then(({ default: initSqlJs }) => initSqlJs())
      .then((runtime) => {
        sqlJsRuntimeState = "loaded";
        return runtime;
      })
      .catch((error) => {
        sqlJsPromise = undefined;
        sqlJsRuntimeState = "not_loaded";
        throw error;
      });
  }
  return await sqlJsPromise;
}

function parseStructuredText(text, format) {
  try {
    if (format === "json") {
      const value = JSON.parse(text);
      return normalizeParsedValue(value, "JSON.parse");
    }
    if (format === "jsonl") {
      const rows = [];
      for (const [index, line] of text.split(/\r?\n/).entries()) {
        if (!line.trim()) continue;
        try { rows.push(normalizeRow(JSON.parse(line), rows.length)); }
        catch (error) { throw dataError(`JSONL line ${index + 1} is invalid: ${error.message}`, "data_jsonl_parse_failed", { line: index + 1 }); }
      }
      return { value: rows, rows, shape: "row_array", parser: "JSON.parse per non-empty line" };
    }
    if (format === "csv") {
      const parsed = parseCsv(text);
      return { value: parsed.rows, rows: parsed.rows, shape: "row_array", parser: "bounded RFC 4180-style state machine", warnings: parsed.warnings };
    }
    if (format === "yaml") {
      const documents = [];
      yaml.loadAll(text, (document) => documents.push(document), { schema: yaml.FAILSAFE_SCHEMA, json: true });
      if (documents.length !== 1) throw dataError("YAML sources must contain exactly one document.", "data_yaml_document_count", { documents: documents.length });
      return normalizeParsedValue(documents[0], "js-yaml FAILSAFE_SCHEMA");
    }
  } catch (error) {
    if (error instanceof DataSystemsError) throw error;
    throw dataError(`Structured data parse failed: ${error.message}`, "data_parse_failed", { format });
  }
  throw dataError("Unsupported structured data format.", "data_format_unsupported", { format });
}

function normalizeParsedValue(value, parser) {
  if (Array.isArray(value)) return { value, rows: value.map((item, index) => normalizeRow(item, index)), shape: "row_array", parser };
  if (isPlainObject(value)) {
    const arrayEntries = Object.entries(value).filter(([, item]) => Array.isArray(item));
    if (arrayEntries.length === 1) return { value, rows: arrayEntries[0][1].map((item, index) => normalizeRow(item, index)), shape: `object_array:${arrayEntries[0][0]}`, parser };
    return { value, rows: [normalizeRow(value, 0)], shape: "object", parser };
  }
  return { value, rows: [{ value }], shape: "scalar", parser };
}

function normalizeRow(value, index) {
  if (isPlainObject(value)) return value;
  if (Array.isArray(value)) return Object.fromEntries(value.map((item, column) => [`column_${column + 1}`, item]));
  return { row: index + 1, value };
}

function parseCsv(text) {
  const records = [];
  let record = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { field += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else field += char;
      continue;
    }
    if (char === '"' && field === "") quoted = true;
    else if (char === ",") { record.push(field); field = ""; }
    else if (char === "\n") { record.push(field.replace(/\r$/, "")); records.push(record); record = []; field = ""; }
    else field += char;
  }
  if (quoted) throw dataError("CSV has an unterminated quoted field.", "data_csv_unterminated_quote");
  if (field.length || record.length) { record.push(field.replace(/\r$/, "")); records.push(record); }
  if (!records.length) return { rows: [], warnings: ["empty_csv"] };
  const rawHeaders = records.shift();
  const headers = uniqueHeaders(rawHeaders);
  if (headers.length > MAX_COLUMNS) throw dataError("CSV exceeds the column limit.", "data_csv_column_limit", { columns: headers.length, max_columns: MAX_COLUMNS });
  const warnings = rawHeaders.length !== new Set(rawHeaders).size ? ["duplicate_headers_disambiguated"] : [];
  const rows = records.filter((row) => row.some((item) => item !== "")).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? null])));
  return { rows, warnings };
}

function uniqueHeaders(headers) {
  const counts = new Map();
  return headers.map((header, index) => {
    const base = String(header || `column_${index + 1}`).trim() || `column_${index + 1}`;
    const count = (counts.get(base) || 0) + 1;
    counts.set(base, count);
    return count === 1 ? base : `${base}_${count}`;
  });
}

function inferSchema(rows, maxColumns) {
  const byColumn = new Map();
  const sampled = rows.slice(0, 1000);
  for (const row of sampled) {
    for (const [name, value] of Object.entries(row).slice(0, maxColumns)) {
      if (!byColumn.has(name)) byColumn.set(name, { name, types: new Set(), present: 0, nulls: 0, sensitive: SECRET_FIELD_PATTERN.test(name) });
      const column = byColumn.get(name);
      column.present += 1;
      if (value === null || value === undefined) column.nulls += 1;
      column.types.add(valueType(value));
    }
  }
  const columns = [...byColumn.values()].slice(0, maxColumns).map((column) => ({
    name: column.name,
    types: [...column.types].sort(),
    nullable: column.nulls > 0 || column.present < sampled.length,
    required_in_sample: sampled.length > 0 && column.present === sampled.length,
    present_count: column.present,
    null_count: column.nulls,
    sensitive: column.sensitive
  }));
  return { sample_rows: sampled.length, total_rows: rows.length, columns, columns_truncated: byColumn.size > maxColumns };
}

function validateRows(rows, expectedSchema, maxIssues) {
  const columns = isPlainObject(expectedSchema.columns) ? expectedSchema.columns : {};
  const allowExtra = expectedSchema.allow_extra_columns !== false;
  const issues = [];
  let total = 0;
  const add = (issue) => { total += 1; if (issues.length < maxIssues) issues.push(issue); };
  for (const [rowIndex, row] of rows.entries()) {
    for (const [name, ruleValue] of Object.entries(columns)) {
      const rule = typeof ruleValue === "string" ? { type: ruleValue } : ruleValue || {};
      if (!(name in row) || row[name] === undefined) {
        if (rule.required === true) add({ code: "required_column_missing", row: rowIndex + 1, column: name });
        continue;
      }
      if (row[name] === null) {
        if (rule.nullable === false) add({ code: "null_not_allowed", row: rowIndex + 1, column: name });
        continue;
      }
      const allowed = Array.isArray(rule.type) ? rule.type : rule.type ? [rule.type] : [];
      if (allowed.length && !allowed.includes(valueType(row[name]))) add({ code: "type_mismatch", row: rowIndex + 1, column: name, expected_types: allowed, actual_type: valueType(row[name]) });
    }
    if (!allowExtra) for (const name of Object.keys(row)) if (!(name in columns)) add({ code: "unexpected_column", row: rowIndex + 1, column: name });
  }
  return { issues, total };
}

function validateSqliteExpectation(inspection, expectedSchema, maxIssues) {
  const expectedTables = isPlainObject(expectedSchema.tables) ? expectedSchema.tables : {};
  const actualTables = new Map(inspection.schema.tables.map((table) => [table.name, table]));
  const issues = [];
  let total = 0;
  const add = (issue) => { total += 1; if (issues.length < maxIssues) issues.push(issue); };
  for (const [tableName, tableRule] of Object.entries(expectedTables)) {
    const table = actualTables.get(tableName);
    if (!table) { add({ code: "required_table_missing", table: tableName }); continue; }
    const columns = new Map(table.columns.map((column) => [column.name, column]));
    for (const [columnName, columnRuleValue] of Object.entries(tableRule?.columns || {})) {
      const column = columns.get(columnName);
      if (!column) { add({ code: "required_column_missing", table: tableName, column: columnName }); continue; }
      const rule = typeof columnRuleValue === "string" ? { type: columnRuleValue } : columnRuleValue || {};
      if (rule.type && String(column.type || "").toUpperCase() !== String(rule.type).toUpperCase()) add({ code: "column_type_mismatch", table: tableName, column: columnName, expected_type: rule.type, actual_type: column.type });
    }
  }
  return { issues, total };
}

function diffInferredSchemas(left, right) {
  const leftMap = new Map(left.columns.map((column) => [column.name, column]));
  const rightMap = new Map(right.columns.map((column) => [column.name, column]));
  return {
    added_columns: [...rightMap.keys()].filter((name) => !leftMap.has(name)),
    removed_columns: [...leftMap.keys()].filter((name) => !rightMap.has(name)),
    changed_columns: [...rightMap.keys()].filter((name) => leftMap.has(name) && stableHash({ types: leftMap.get(name).types, nullable: leftMap.get(name).nullable }) !== stableHash({ types: rightMap.get(name).types, nullable: rightMap.get(name).nullable })).map((name) => ({ name, before: { types: leftMap.get(name).types, nullable: leftMap.get(name).nullable }, after: { types: rightMap.get(name).types, nullable: rightMap.get(name).nullable } }))
  };
}

function normalizeTransformOperations(value) {
  if (!isPlainObject(value)) throw dataError("Transform operations must be an object.", "data_transform_operations_invalid");
  const select = uniqueStrings(value.select || []).slice(0, MAX_COLUMNS);
  const drop = uniqueStrings(value.drop || []).slice(0, MAX_COLUMNS);
  const renameMap = isPlainObject(value.rename) ? Object.fromEntries(Object.entries(value.rename).map(([from, to]) => [safeColumnName(from), safeColumnName(to)])) : {};
  const addConstants = isPlainObject(value.add_constants) ? Object.fromEntries(Object.entries(value.add_constants).slice(0, MAX_COLUMNS).map(([name, item]) => [safeColumnName(name), safeScalar(item)])) : {};
  const filters = (value.filters || []).slice(0, 20).map((filter) => ({ column: safeColumnName(filter.column), operator: normalizeFilterOperator(filter.operator), value: safeScalar(filter.value) }));
  const sort = (value.sort || []).slice(0, 8).map((item) => ({ column: safeColumnName(item.column), direction: String(item.direction || "asc").toLowerCase() === "desc" ? "desc" : "asc" }));
  const limit = value.limit === undefined || value.limit === null ? null : boundedInteger(value.limit, 0, MAX_SOURCE_ROWS, MAX_SOURCE_ROWS);
  const overlap = select.filter((name) => drop.includes(name));
  if (overlap.length) throw dataError("A column cannot be both selected and dropped.", "data_transform_column_conflict", { columns: overlap });
  return { select, drop, rename: renameMap, add_constants: addConstants, filters, sort, limit };
}

function transformRows(rows, operations) {
  let result = rows.filter((row) => operations.filters.every((filter) => matchesFilter(row[filter.column], filter)));
  result = result.map((row) => {
    const selected = operations.select.length ? Object.fromEntries(operations.select.filter((name) => name in row).map((name) => [name, row[name]])) : { ...row };
    for (const name of operations.drop) delete selected[name];
    for (const [from, to] of Object.entries(operations.rename)) {
      if (from in selected) { selected[to] = selected[from]; delete selected[from]; }
    }
    return { ...selected, ...operations.add_constants };
  });
  for (const sort of [...operations.sort].reverse()) result = result.toSorted((left, right) => compareValues(left[sort.column], right[sort.column]) * (sort.direction === "desc" ? -1 : 1));
  if (operations.limit !== null) result = result.slice(0, operations.limit);
  return result;
}

function matchesFilter(value, filter) {
  switch (filter.operator) {
    case "eq": return value === filter.value;
    case "ne": return value !== filter.value;
    case "gt": return value > filter.value;
    case "gte": return value >= filter.value;
    case "lt": return value < filter.value;
    case "lte": return value <= filter.value;
    case "contains": return String(value ?? "").includes(String(filter.value ?? ""));
    case "is_null": return value === null || value === undefined;
    case "not_null": return value !== null && value !== undefined;
    default: return false;
  }
}

function normalizeFilterOperator(value) {
  const operator = String(value || "eq").toLowerCase();
  if (!["eq", "ne", "gt", "gte", "lt", "lte", "contains", "is_null", "not_null"].includes(operator)) throw dataError("Unsupported transform filter operator.", "data_transform_filter_operator_unsupported", { operator });
  return operator;
}

function redactTransformOperations(operations) {
  return {
    ...operations,
    add_constants: Object.fromEntries(Object.keys(operations.add_constants).map((name) => [name, SECRET_FIELD_PATTERN.test(name) ? "[REDACTED]" : redactDeep(operations.add_constants[name])])),
    filters: operations.filters.map((filter) => ({ column: filter.column, operator: filter.operator, value_type: valueType(filter.value), value_sha256: stableHash(filter.value) }))
  };
}

function encodeRows(rows, format) {
  if (format === "json") return Buffer.from(`${JSON.stringify(rows, null, 2)}\n`, "utf8");
  if (format === "jsonl") return Buffer.from(`${rows.map((row) => JSON.stringify(row)).join("\n")}${rows.length ? "\n" : ""}`, "utf8");
  if (format === "yaml") return Buffer.from(yaml.dump(rows, { noRefs: true, lineWidth: 120, sortKeys: false }), "utf8");
  if (format === "csv") {
    const headers = uniqueStrings(rows.flatMap((row) => Object.keys(row))).slice(0, MAX_COLUMNS);
    const lines = [headers.map(csvCell).join(","), ...rows.map((row) => headers.map((header) => csvCell(serializeCell(row[header]))).join(","))];
    return Buffer.from(`${lines.join("\n")}\n`, "utf8");
  }
  throw dataError("Unsupported transform output format.", "data_transform_output_format_unsupported", { format });
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function serializeCell(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function normalizeConnection(value) {
  if (!isPlainObject(value)) throw dataError("Database connection must be an object.", "database_connection_invalid");
  if (hasRawCredential(value)) throw dataError("Raw database credentials and connection strings are not accepted.", "database_raw_credential_blocked");
  const type = String(value.type || "local_sqlite").toLowerCase();
  if (type !== "local_sqlite" && !REMOTE_CONNECTION_TYPES.has(type)) throw dataError("Unsupported database connection type.", "database_connection_type_unsupported", { type });
  const access = String(value.access || value.scope?.access || "read_only").toLowerCase();
  if (!["read_only", "read_write"].includes(access)) throw dataError("Database access must be read_only or read_write.", "database_access_scope_invalid");
  return { ...value, type, access };
}

function normalizeCredentialReference(value) {
  if (!isPlainObject(value)) throw dataError("Remote database connections require a typed credential_reference.", "remote_database_credential_reference_required");
  if (hasRawCredential(value)) throw dataError("Credential references must contain names only, never values.", "database_raw_credential_blocked");
  const type = String(value.type || "").toLowerCase();
  const name = String(value.name || "");
  if (!CREDENTIAL_REFERENCE_TYPES.has(type)) throw dataError("Unsupported database credential-reference type.", "database_credential_reference_type_unsupported", { type });
  if (!/^[A-Za-z][A-Za-z0-9_.:/-]{1,127}$/.test(name)) throw dataError("Credential-reference name is invalid.", "database_credential_reference_name_invalid");
  return { type, name };
}

function normalizeRemoteScope(value) {
  if (!isPlainObject(value)) throw dataError("Remote database connections require explicit host, database, and access scope.", "remote_database_scope_required");
  const host = String(value.host || "").toLowerCase();
  const database = String(value.database || "");
  const access = String(value.access || "read_only").toLowerCase();
  if (!/^[a-z0-9.-]{1,253}$/.test(host) || host === "localhost" || host.endsWith(".local") || /^\d+\.\d+\.\d+\.\d+$/.test(host)) throw dataError("Remote database host scope must be a specific non-local DNS name.", "remote_database_host_scope_invalid", { host });
  if (!/^[A-Za-z0-9_.-]{1,128}$/.test(database)) throw dataError("Remote database name scope is invalid.", "remote_database_name_scope_invalid");
  if (!["read_only", "read_write"].includes(access)) throw dataError("Remote database access scope must be read_only or read_write.", "remote_database_access_scope_invalid");
  const schemas = uniqueStrings(value.schemas || []).slice(0, 50);
  return { host, port: boundedInteger(value.port, 1, 65535, null), database, schemas, access, max_rows: boundedInteger(value.max_rows, 1, MAX_RESULT_ROWS, 100) };
}

function hasRawCredential(value) {
  return Object.keys(value || {}).some((key) => /^(password|passwd|secret|token|credential|connection_string|url|uri|dsn|value)$/i.test(key));
}

function validateReadOnlySql(value) {
  const sql = String(value || "").trim();
  if (!sql) throw dataError("SQL is required.", "database_sql_required");
  if (Buffer.byteLength(sql, "utf8") > 32 * 1024) throw dataError("SQL exceeds the statement byte limit.", "database_sql_too_large");
  const analysis = analyzeSql(sql);
  if (analysis.statement_count !== 1) throw dataError("Exactly one SQL statement is allowed.", "database_multiple_statements_blocked", { statement_count: analysis.statement_count });
  const mutation = analysis.keywords.find((keyword) => SQL_MUTATION_KEYWORDS.has(keyword));
  if (mutation) throw dataError("Mutation, transaction, attachment, and PRAGMA SQL is blocked by the read-only query path.", "database_query_mutation_blocked", { keyword: mutation });
  if (!["SELECT", "WITH"].includes(analysis.first_keyword)) throw dataError("Database queries are read-only and must start with SELECT or WITH.", "database_query_not_read_only", { first_keyword: analysis.first_keyword });
  if (analysis.normalized.includes("LOAD_EXTENSION")) throw dataError("SQLite extension loading is blocked.", "database_extension_loading_blocked");
  return sql.replace(/;\s*$/, "");
}

function normalizeMigrationStatements(values) {
  if (!Array.isArray(values) || !values.length) throw dataError("Migration preview requires at least one SQL statement.", "database_migration_statements_required");
  if (values.length > 20) throw dataError("Migration preview exceeds the statement limit.", "database_migration_statement_limit", { statements: values.length, max_statements: 20 });
  return values.map((value, index) => {
    const sql = String(value || "").trim();
    const analysis = analyzeSql(sql);
    if (analysis.statement_count !== 1) throw dataError("Each migration array item must contain exactly one statement.", "database_migration_multiple_statements", { index });
    const blocked = analysis.keywords.find((keyword) => MIGRATION_BLOCKED_KEYWORDS.has(keyword));
    if (blocked || analysis.normalized.includes("LOAD_EXTENSION")) throw dataError("Migration statement uses a blocked SQLite capability.", "database_migration_capability_blocked", { index, keyword: blocked || "LOAD_EXTENSION" });
    const kind = migrationKind(analysis.normalized);
    if (!kind) throw dataError("Migration statement type is not in the reviewed local SQLite subset.", "database_migration_statement_unsupported", { index, first_keyword: analysis.first_keyword });
    if ((kind === "update" || kind === "delete") && !analysis.keywords.includes("WHERE")) throw dataError("UPDATE and DELETE migrations require a WHERE clause.", "database_migration_where_required", { index, kind });
    const destructive = /^(DROP\s+(?:TABLE|INDEX)|ALTER\s+TABLE\s+\S+\s+DROP\s+COLUMN|DELETE\b)/.test(analysis.normalized);
    return { index, sql: sql.replace(/;\s*$/, ""), kind, sha256: sha256(sql.replace(/;\s*$/, "")), destructive };
  });
}

function migrationKind(normalized) {
  if (/^CREATE\s+TABLE\b/.test(normalized)) return "create_table";
  if (/^CREATE\s+(?:UNIQUE\s+)?INDEX\b/.test(normalized)) return "create_index";
  if (/^ALTER\s+TABLE\b/.test(normalized)) return "alter_table";
  if (/^DROP\s+(?:TABLE|INDEX)\b/.test(normalized)) return "drop";
  if (/^INSERT\s+INTO\b/.test(normalized)) return "insert";
  if (/^UPDATE\b/.test(normalized)) return "update";
  if (/^DELETE\s+FROM\b/.test(normalized)) return "delete";
  return null;
}

function analyzeSql(sql) {
  let normalized = "";
  let state = "plain";
  let semicolons = 0;
  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    const next = sql[index + 1];
    if (state === "line_comment") { if (char === "\n") { state = "plain"; normalized += " "; } continue; }
    if (state === "block_comment") { if (char === "*" && next === "/") { state = "plain"; index += 1; normalized += " "; } continue; }
    if (state === "single") { if (char === "'" && next === "'") index += 1; else if (char === "'") state = "plain"; continue; }
    if (state === "double") { if (char === '"' && next === '"') index += 1; else if (char === '"') state = "plain"; continue; }
    if (state === "backtick") { if (char === "`") state = "plain"; continue; }
    if (state === "bracket") { if (char === "]") state = "plain"; continue; }
    if (char === "-" && next === "-") { state = "line_comment"; index += 1; continue; }
    if (char === "/" && next === "*") { state = "block_comment"; index += 1; continue; }
    if (char === "'") { state = "single"; normalized += " ? "; continue; }
    if (char === '"') { state = "double"; normalized += " IDENT "; continue; }
    if (char === "`") { state = "backtick"; normalized += " IDENT "; continue; }
    if (char === "[") { state = "bracket"; normalized += " IDENT "; continue; }
    if (char === ";") { semicolons += 1; normalized += ";"; continue; }
    normalized += char;
  }
  if (state !== "plain" && state !== "line_comment") throw dataError("SQL contains an unterminated string, identifier, or comment.", "database_sql_unterminated_token");
  normalized = normalized.toUpperCase().replace(/\s+/g, " ").trim();
  const trailingOnly = semicolons === 1 && /;\s*$/.test(normalized) && !/;.*\S.*;/.test(normalized);
  const statementCount = semicolons === 0 || trailingOnly ? (normalized.replace(/;/g, "").trim() ? 1 : 0) : semicolons + (normalized.endsWith(";") ? 0 : 1);
  const keywords = normalized.match(/\b[A-Z][A-Z_]*\b/g) || [];
  return { normalized: normalized.replace(/;\s*$/, ""), keywords, first_keyword: keywords[0] || "", statement_count: statementCount };
}

function normalizeSqlParameters(value) {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) {
    if (value.length > 100) throw dataError("SQL parameter count exceeds the limit.", "database_parameter_limit");
    return value.map(safeScalar);
  }
  if (isPlainObject(value)) {
    const entries = Object.entries(value);
    if (entries.length > 100) throw dataError("SQL parameter count exceeds the limit.", "database_parameter_limit");
    return Object.fromEntries(entries.map(([key, item]) => {
      if (!/^[:@$]?[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(key)) throw dataError("Named SQL parameter is invalid.", "database_parameter_name_invalid", { parameter: key });
      return [key, safeScalar(item)];
    }));
  }
  throw dataError("SQL parameters must be an array or object of scalar values.", "database_parameters_invalid");
}

function parameterSummary(value) {
  if (value === undefined) return { count: 0, shape: "none", types: [], values_exposed: false };
  if (Array.isArray(value)) return { count: value.length, shape: "positional", types: value.map(valueType), values_sha256: stableHash(value), values_exposed: false };
  return { count: Object.keys(value).length, shape: "named", names: Object.keys(value), types: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, valueType(item)])), values_sha256: stableHash(value), values_exposed: false };
}

function executePreparedRows(db, sql, parameters, maxRows, maxColumns = MAX_COLUMNS) {
  let statement;
  try {
    statement = db.prepare(sql);
    if (parameters !== undefined) statement.bind(parameters);
    const columns = statement.getColumnNames();
    const rows = [];
    while (rows.length < maxRows && statement.step()) {
      const object = statement.getAsObject();
      rows.push(Object.fromEntries(Object.entries(object).slice(0, maxColumns)));
    }
    return { columns, rows };
  } finally {
    statement?.free();
  }
}

function inspectSqliteSchema(db, options) {
  const objects = executePreparedRows(db, "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE type IN ('table','index','view','trigger') AND name NOT LIKE 'sqlite_%' ORDER BY type, name", undefined, options.maxTables * 4, 4).rows;
  const tableObjects = objects.filter((item) => item.type === "table").slice(0, options.maxTables);
  const tables = tableObjects.map((item) => {
    const columns = executePreparedRows(db, `PRAGMA table_info(${quoteIdentifier(item.name)})`, undefined, options.maxColumns, 8).rows.map((column) => ({ cid: column.cid, name: column.name, type: column.type || "", notnull: Boolean(column.notnull), default_value: redactDeep(column.dflt_value), primary_key_position: column.pk || 0, sensitive: SECRET_FIELD_PATTERN.test(String(column.name || "")) }));
    const indexes = executePreparedRows(db, `PRAGMA index_list(${quoteIdentifier(item.name)})`, undefined, 100, 8).rows.map((index) => ({ name: index.name, unique: Boolean(index.unique), origin: index.origin, partial: Boolean(index.partial) }));
    const foreignKeys = executePreparedRows(db, `PRAGMA foreign_key_list(${quoteIdentifier(item.name)})`, undefined, 100, 10).rows.map((foreign) => ({ id: foreign.id, sequence: foreign.seq, table: foreign.table, from: foreign.from, to: foreign.to, on_update: foreign.on_update, on_delete: foreign.on_delete, match: foreign.match }));
    let rowCount = null;
    if (options.includeRowCounts) rowCount = Number(Object.values(executePreparedRows(db, `SELECT COUNT(*) AS count FROM ${quoteIdentifier(item.name)}`, undefined, 1, 1).rows[0] || {})[0] || 0);
    return { name: item.name, columns, columns_truncated: columns.length >= options.maxColumns, indexes, foreign_keys: foreignKeys, row_count: rowCount };
  });
  const views = objects.filter((item) => item.type === "view").map((item) => ({ name: item.name, sql_sha256: item.sql ? sha256(item.sql) : null }));
  const triggers = objects.filter((item) => item.type === "trigger").map((item) => ({ name: item.name, table: item.tbl_name, sql_sha256: item.sql ? sha256(item.sql) : null }));
  const indexes = objects.filter((item) => item.type === "index").map((item) => ({ name: item.name, table: item.tbl_name, sql_sha256: item.sql ? sha256(item.sql) : null }));
  return { tables, views, triggers, indexes, tables_truncated: tableObjects.length < objects.filter((item) => item.type === "table").length };
}

function diffSqliteSchemas(before, after) {
  const beforeTables = new Map(before.tables.map((table) => [table.name, table]));
  const afterTables = new Map(after.tables.map((table) => [table.name, table]));
  const changedTables = [];
  for (const [name, table] of afterTables) {
    if (!beforeTables.has(name)) continue;
    const beforeColumns = new Map(beforeTables.get(name).columns.map((column) => [column.name, column]));
    const afterColumns = new Map(table.columns.map((column) => [column.name, column]));
    const added = [...afterColumns.keys()].filter((column) => !beforeColumns.has(column));
    const removed = [...beforeColumns.keys()].filter((column) => !afterColumns.has(column));
    const changed = [...afterColumns.keys()].filter((column) => beforeColumns.has(column) && stableHash(afterColumns.get(column)) !== stableHash(beforeColumns.get(column)));
    if (added.length || removed.length || changed.length) changedTables.push({ name, added_columns: added, removed_columns: removed, changed_columns: changed });
  }
  return {
    added_tables: [...afterTables.keys()].filter((name) => !beforeTables.has(name)),
    removed_tables: [...beforeTables.keys()].filter((name) => !afterTables.has(name)),
    changed_tables: changedTables,
    added_indexes: after.indexes.filter((index) => !before.indexes.some((item) => item.name === index.name)).map((index) => index.name),
    removed_indexes: before.indexes.filter((index) => !after.indexes.some((item) => item.name === index.name)).map((index) => index.name)
  };
}

function indexRows(rows, keyColumns) {
  const map = new Map();
  for (const row of rows) {
    const key = keyColumns.length ? keyColumns.map((column) => redactDeep(row[column])).map((item) => typeof item === "string" ? item : JSON.stringify(item)).join("\u001f") : stableHash(row);
    if (map.has(key)) throw dataError("Diff key is not unique in one source.", "data_diff_key_not_unique", { key_sha256: stableHash(key), key_columns: keyColumns });
    map.set(key, row);
  }
  return map;
}

function redactRows(rows, maxColumns) {
  return rows.map((row) => Object.fromEntries(Object.entries(row).slice(0, maxColumns).map(([key, value]) => [key, SECRET_FIELD_PATTERN.test(key) ? "[REDACTED]" : redactDeep(value)])));
}

function redactDeep(value, key = "") {
  if (SECRET_FIELD_PATTERN.test(key)) return "[REDACTED]";
  if (typeof value === "string") return redactText(value);
  if (Array.isArray(value)) return value.map((item) => redactDeep(item));
  if (isPlainObject(value)) return Object.fromEntries(Object.entries(value).map(([childKey, item]) => [childKey, redactDeep(item, childKey)]));
  return value;
}

function redactText(value) {
  let text = String(value || "");
  for (const pattern of SECRET_VALUE_PATTERNS) text = text.replace(pattern, "[REDACTED]");
  return text;
}

function redactSql(sql) {
  return redactText(String(sql || "").replace(/'(?:''|[^'])*'/g, "'?'"));
}

function redactionPolicy() {
  return { sensitive_field_names_redacted: true, known_secret_value_patterns_redacted: true, raw_secret_values_in_evidence: false };
}

function sourceSummary(source) {
  return { path: source.path, relative_path: source.relative_path, format: source.format, bytes: source.bytes, sha256: source.sha256 };
}

function resultLimits(maxRows, maxColumns, maxBytes) {
  return { max_rows: boundedInteger(maxRows, 1, MAX_RESULT_ROWS, 100), max_columns: boundedInteger(maxColumns, 1, MAX_COLUMNS, 80), max_bytes: boundedInteger(maxBytes, 1024, MAX_RESULT_BYTES, 64 * 1024) };
}

function mutationRequirements(permissionAction, backupRequired) {
  return { read_only_default: true, permission_action: permissionAction, approved_profile_or_exact_scope_required: true, approved_true_required: true, specific_approval_note_required: true, transaction_required: true, backup_required: backupRequired, rollback_path_required: true, affected_row_or_output_preview_required: true, evidence_required: true };
}

function sqliteLimitations() {
  return ["SQLite files are loaded into bounded memory through sql.js; files larger than 32 MiB are refused.", "Concurrent writers and active WAL/journal sidecars are unsupported for mutation.", "Read-only SQL is enforced by lexical policy plus SQLite PRAGMA query_only, not by a general SQL parser.", "Remote database execution is not implemented by this local adapter."];
}

function requirePermissionDecision(decision, action) {
  if (!decision?.allowed || decision.action_type !== action) throw dataError("Exact database permission evidence is required.", "database_permission_evidence_missing", { required_action: action, permission_decision: decision || null });
}

function normalizeSqliteError(error, fallbackCode) {
  if (error instanceof DataSystemsError) return error;
  return dataError(`SQLite operation failed: ${error.message || String(error)}`, fallbackCode);
}

function dataError(message, code, details = {}) {
  return new DataSystemsError(message, code, details);
}

function normalizeFormat(value) {
  const format = String(value || "").trim().toLowerCase().replace(/^\./, "");
  if (format === "ndjson") return "jsonl";
  if (format === "yml") return "yaml";
  if (SQLITE_FORMATS.has(format)) return "sqlite";
  return format;
}

function normalizeStructuredFormat(value) {
  const format = normalizeFormat(value);
  if (!STRUCTURED_FORMATS.has(format)) throw dataError("Transform output must be JSON, JSONL, CSV, or YAML.", "data_transform_output_format_unsupported", { format });
  return format;
}

function formatFromPath(value) {
  return path.extname(String(value || "")).slice(1).toLowerCase();
}

function safeColumnName(value) {
  const name = String(value || "");
  if (!name || name.length > 256 || /[\u0000-\u001f]/.test(name) || ["__proto__", "prototype", "constructor"].includes(name)) throw dataError("Transform column name is invalid.", "data_transform_column_invalid");
  return name;
}

function safeScalar(value) {
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) return value;
  throw dataError("Only string, number, boolean, or null scalar values are accepted here.", "data_scalar_required");
}

function assertNoPrototypePollution(value, depth = 0) {
  if (depth > 30) throw dataError("Structured data nesting exceeds the safety limit.", "data_nesting_limit");
  if (Array.isArray(value)) for (const item of value) assertNoPrototypePollution(item, depth + 1);
  else if (isPlainObject(value)) for (const [key, item] of Object.entries(value)) {
    if (["__proto__", "prototype", "constructor"].includes(key)) throw dataError("Prototype-affecting structured-data key is blocked.", "data_prototype_key_blocked", { key });
    assertNoPrototypePollution(item, depth + 1);
  }
}

function boundRowsByBytes(rows, maxBytes) {
  const kept = [];
  let bytes = 2;
  for (const row of rows) {
    const rowBytes = Buffer.byteLength(JSON.stringify(row), "utf8") + 1;
    if (bytes + rowBytes > maxBytes) return { rows: kept, bytes, truncated: true };
    kept.push(row);
    bytes += rowBytes;
  }
  return { rows: kept, bytes, truncated: false };
}

function valueType(value) {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return "array";
  if (Number.isInteger(value)) return "integer";
  if (typeof value === "number") return "number";
  if (typeof value === "object") return "object";
  return typeof value;
}

function compareValues(left, right) {
  if (left === right) return 0;
  if (left === null || left === undefined) return -1;
  if (right === null || right === undefined) return 1;
  return left < right ? -1 : 1;
}

function serializeStable(value) {
  if (Array.isArray(value)) return `[${value.map(serializeStable).join(",")}]`;
  if (isPlainObject(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${serializeStable(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function stableHash(value) {
  return sha256(serializeStable(value));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).map((item) => String(item)).filter(Boolean))];
}

function boundedInteger(value, min, max, fallback) {
  if (value === null && fallback === null) return null;
  const number = Number(value);
  if (!Number.isInteger(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function quoteIdentifier(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function inside(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function insideAny(candidate, roots) {
  return roots.some((root) => inside(root, candidate));
}

function relativeFrom(root, candidate) {
  return path.relative(root, candidate).split(path.sep).join("/") || ".";
}

function sqliteSidecars(filePath) {
  return [`${filePath}-wal`, `${filePath}-shm`, `${filePath}-journal`];
}
