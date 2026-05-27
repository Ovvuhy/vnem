# Knip

Knip is a CLI for JavaScript and TypeScript project hygiene. It scans project entry points, workspaces, plugins, and manifests to report unused files, exports, dependencies, types, enum members, and unresolved references.

## Best For

- Evidence-backed dead-code and dependency cleanup in JS/TS repositories
- Pre-refactor audits where agents should prove code is unused before deleting it
- Monorepos that need unused-file and unused-export signals across packages

## Review Notes

Trust tier: promising. Official docs, GitHub, and npm metadata were checked on 2026-05-27. Reports should be reviewed against tests and runtime entry points because static analysis can miss dynamic imports, framework conventions, generated code, or side-effect-only modules.
