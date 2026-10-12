# Development IDE LombokSQL v0.1.0

## 1. Roadmap

| Version | Content |
|---|---|
| 0.1.1 | Close the release conditions: SQL Server job green, `doctor docs/privacy/style`, Rust coverage, `cargo-fuzz` target |
| 0.2.0 | Database version matrix in CI and SQL Server green (the integration suite already exists for SQLite, PostgreSQL, MySQL); `UNION`/`INTERSECT`; CTEs; minimal DDL (`createTable`, `dropTable`, `createIndex`); Python, Go and PHP ports |
| 0.3.0 | Window functions; `MERGE` for SQL Server; `OUTPUT` for SQL Server; `NULLS FIRST/LAST`; C-ABI and WASM crates (ADR-010) |
| 0.4.0 | Java/Kotlin, C#, Swift, C++ through the C-ABI or ports; benchmarks and binary size |

## 2. Deferred scope

See SPEC section 8 and the README (Known limitations).

## 3. Design principles for contributors

- Contract first, tests first; all ports pass the same vectors.
- No runtime dependencies; dev dependencies are recorded.
- A feature missing from a dialect produces an explicit error, not silently different output.
- The evaluation order in the code follows the order of the SQL output (this keeps parameter order correct).
- English is the default language for all documents, code comments and messages.

## 4. How to contribute

See `CONTRIBUTING.md`.

## 5. Open questions

- Should `limit`/`offset` optionally be bound parameters for the dialects that support it?
- Is a Rust builder needed, or is the JSON AST enough?
- Support for MariaDB (`RETURNING`) as a separate dialect?
