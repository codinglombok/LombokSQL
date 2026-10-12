# Changelog

All notable changes are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/); the newest entry comes first. Versions follow [SemVer](https://semver.org/).

## [Unreleased]

### Added
- `integration/`: 36 scenarios executed on SQLite, PostgreSQL and MySQL that compare results (not SQL text); a SQL Server adapter. CI job `integration` with service containers.

### Fixed
- SQL Server integration fixture uses `varchar(100)` instead of `text` (first run: 7 failures caused by the `text` type).
- CI: `cargo fmt` applied to the whole crate, portable test runner (Node 20), `.gitattributes` so that the vector hash is the same on Windows.

### Changed
- CI: actions pinned to SHAs, Dependabot (actions, npm, cargo), TypeScript coverage gate at 90% (measured: 98.7%).

## [0.1.0] - 2026-10-06

### Added
- Compiler from a JSON AST to parameterized SQL for PostgreSQL, MySQL, SQLite and SQL Server.
- `select`, `insert`, `update` and `delete` statements with conditions, joins, subqueries, aggregation, pagination, upsert and `RETURNING` (PostgreSQL and SQLite).
- `missing_where` protection for `update` and `delete` without `WHERE`.
- Rust port (`no_std + alloc`, no dependencies) and TypeScript port (no runtime dependencies).
- Fluent TypeScript builder.
- Shared vectors of 716 cases, executed by the Rust and TypeScript runners.
- Pseudo-fuzzing, AST mutation fuzzing and a mutation-testing script (25 mutants).

### Security
- Values are always bound as parameters; identifiers are always quoted; nesting is limited to 64 levels.
