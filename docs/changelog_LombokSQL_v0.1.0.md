# Changelog LombokSQL (summary)

The newest entry comes first. Details are in `CHANGELOG.md`.

## Unreleased

- Integration suite on real databases (SQLite, PostgreSQL, MySQL; SQL Server adapter), CI fixes, pinned actions, coverage gate.

## 0.1.0 - 2026-10-06

### Added
- Compiler from a JSON AST to parameterized SQL for `postgres`, `mysql`, `sqlite`, `mssql`.
- `select`, `insert` (upsert, `RETURNING`), `update`, `delete`; `missing_where` protection.
- Rust `no_std + alloc` port and TypeScript port; fluent TypeScript builder.
- 716 vectors; runners in both ports; fuzzing and mutation testing.

### Security
- Values are always bound; identifiers are always quoted; nesting limit of 64 levels.
