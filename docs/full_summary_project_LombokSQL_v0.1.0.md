# Full Summary LombokSQL v0.1.0

## What it is

A compiler that turns a JSON AST into parameterized SQL for four dialects, with no dependencies and no I/O.

## Why it exists

Query builders are usually tied to one language and one driver. Teams that use several languages or several databases rewrite the same logic and get slightly different behavior. With the AST as the contract, a query can be built in one place and compiled in another.

## Main features

See the README (Features section). All features are covered by vectors.

## Current status

Complete code for Rust and TypeScript; passes 716 vector cases; not yet published to any registry; does not yet meet the release score rule (see `TECH_DEBT.md`).

## Example users

See the README (usage scenarios).

## Known Limitations

- Real execution is tested on SQLite, PostgreSQL and MySQL (36 scenarios); SQL Server: in the first CI run, 29 of 36 scenarios passed and the rest failed because of a fixture that has since been fixed and is awaiting a re-run (TD-13). The minimum dialect versions in `SPEC_` have not been tested one by one.
- No `UNION`, CTEs, window functions, DDL, `NULLS FIRST/LAST`, `MERGE`.
- `RETURNING` only on PostgreSQL and SQLite; no upsert for SQL Server.
- `raw` is not validated; every `?` inside it is a placeholder.
- `limit`/`offset` are written directly (validated as integers), not as parameters.
- Only two ports; the builder exists only in TypeScript.
- Fuzzing is pseudo-fuzzing and AST mutation, not `cargo-fuzz`; no third-party audit; Rust coverage not measured yet.

## More information

`SPEC_`, `API_`, `development_ide_`.

## Gap vs comparators (U6)

The comparison is qualitative and based on general knowledge of each category of library; it has not been verified feature by feature on 2026-10-06.

| Comparator (category) | What the comparator has that LombokSQL does not | What LombokSQL offers |
|---|---|---|
| Single-language query builders (Kysely, Knex, SQLAlchemy Core, jOOQ, SeaQuery) | DDL, schema types, CTEs, window functions, `UNION`, driver integration and a mature ecosystem | A cross-language AST contract with shared vectors; identical output across ports; a `no_std + alloc` core; no dependencies |
| ORMs | Object mapping, relations, migrations | Not an ORM; query compilation only |
| Hand-written SQL strings | Complete flexibility | Automatic parameter binding and identifier quoting; rejection of `UPDATE`/`DELETE` without `WHERE` |
