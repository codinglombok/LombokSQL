# API LombokSQL v0.1.0

Normative semantics are in `SPEC_LombokSQL_v0.1.0.md`; this document only lists the interfaces that are actually exported.

## 1. TypeScript (package `lomboksql`)

Stability: 0.x, may change in minor releases.

### Core

| Symbol | Signature | Notes |
|---|---|---|
| `compile` | `compile(ast: unknown, dialect: string): Compiled` | The normative compiler. Throws `LombokSqlError`. Since 0.1.0 |
| `Compiled` | `{ sql: string; params: Scalar[] }` | Result |
| `Scalar` | `null \| boolean \| number \| string` | Parameter type |
| `Dialect` | `"postgres" \| "mysql" \| "sqlite" \| "mssql"` | |
| `LombokSqlError` | `extends Error`; `code: ErrorCode`, `messageId: string` | Codes: see SPEC section 7 |
| `ErrorCode` | union of error codes | |

### Builder (only builds the AST; all SQL output comes from `compile`)

| Symbol | Notes |
|---|---|
| `select(...cols)`, `insertInto(t)`, `update(t)`, `deleteFrom(t)` | Create a builder. `toAst()` returns a copy of the AST, `build(dialect)` calls `compile` |
| `SelectBuilder`: `columns`, `distinct`, `from` (a `"table alias"` string, an object, or a builder), `innerJoin`, `leftJoin`, `rightJoin`, `fullJoin`, `crossJoin`, `where` (repeated calls are combined with AND), `groupBy`, `having`, `orderBy(expr, dir)`, `limit`, `offset` | |
| `InsertBuilder`: `columns`, `values(...cells)` (one row), `onConflictDoNothing(target?)`, `onConflictUpdate(target, update)`, `returning` | |
| `UpdateBuilder`: `set(col, value)`, `where`, `all()`, `returning` | |
| `DeleteBuilder`: `where`, `all()`, `returning` | |
| Expressions: `col(name, as?)`, `val(value, as?)`, `raw(sql, params?, as?)`, `fn(name, args?, {distinct?, as?})` | |
| Conditions: `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `like`, `notLike`, `ilike`, `notIlike`, `and`, `or`, `not`, `isNull`, `isNotNull`, `between`, `inList`, `notInList`, `inQuery`, `exists`, `notExists`, `rawCond` | |

Builder convention: a string on the left side of a comparison and in column lists is a column; a JS value on the right side becomes a bound parameter. Use `col()` for a column on the right side.

## 2. Rust (crate `lomboksql`)

Feature: `std` (default). Without `std`, the crate is `no_std + alloc`.

| Symbol | Notes |
|---|---|
| `compile(ast: &Value, dialect: &str) -> Result<Compiled, Error>` | The normative compiler |
| `compile_json(ast_json: &str, dialect: &str) -> Result<Compiled, Error>` | Universal entry point for FFI and scripting |
| `parse_json(&str) -> Result<Value, Error>` | Internal JSON parser (maximum depth 512) |
| `Value` | `Null`, `Bool`, `Num(String)` (original lexeme), `Str`, `Arr`, `Obj`; `get`, `to_json` |
| `Compiled { sql, params }` | `params_json()` returns a compact JSON array |
| `Dialect` | `Postgres`, `Mysql`, `Sqlite`, `Mssql`; `Dialect::parse` |
| `Error { code, message }` | `message_id()`; implements `Display` and (with `std`) `std::error::Error` |

The Rust port has no builder in 0.1.0.

## 3. Other ports

None yet.

## 4. Cross-language compatibility

For the same AST and the same dialect, `compile` in TypeScript and Rust produce identical `sql` and `params` on all vectors (716 cases).
