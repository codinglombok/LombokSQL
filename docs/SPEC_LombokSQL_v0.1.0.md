# SPEC LombokSQL v0.1.0

This document is the normative cross-language contract. Every language port MUST produce byte-identical output for all specified inputs. Deviations from this specification are bugs.

The key words MUST, MUST NOT, SHOULD and MAY are to be interpreted as in RFC 2119 and RFC 8174.

| Attribute | Value |
|---|---|
| Contract version | 0.1.0 |
| Review date of reference standards | 2026-10-06 |
| Vectors | `vectors/lomboksql-vectors-v1.json` |
| Vector SHA-256 | `39142d61f40466dc6afa4d312215ab2ea1dc59c432a8c78bcb61f51d75ef4164` |

## 0. Reference standards (U2)

| Reference | Version | Use |
|---|---|---|
| RFC 8259 | December 2017 | Syntax of the JSON AST and of parameters |
| RFC 2119, RFC 8174 | 1997, 2017 | Normative key words |
| Unicode | 16.0 | Identifiers and values are processed per code point; only well-formed sequences of scalar values are valid |
| ISO/IEC 9075 (SQL:2023) | 2023 | General semantics of `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `JOIN`, `BETWEEN`, `IN`, `EXISTS` |

Minimum dialect versions (taken from vendor documentation; **not tested one by one**. What is executed in `integration/`: SQLite 3.51.2, PostgreSQL 16.15, MySQL 8.0.46; SQL Server does not pass completely yet, see section 8):

| Dialect | Minimum version for the related feature |
|---|---|
| `postgres` | 9.5 (`ON CONFLICT`); `ILIKE` and `RETURNING` have long been available |
| `mysql` | 5.7 or 8.0 (`ON DUPLICATE KEY UPDATE ... VALUES()`, `INSERT IGNORE`); `FULL JOIN` is not supported |
| `sqlite` | 3.24 (upsert), 3.35 (`RETURNING`), 3.39 (`RIGHT`/`FULL JOIN`) |
| `mssql` | 2012 (`OFFSET ... FETCH`); upsert and `RETURNING` are not supported in 0.1.0 |

## 1. Vectors

The file `vectors/lomboksql-vectors-v1.json` contains an object `{ format, specVersion, note, groups }`. Each group contains `cases`; each case contains `name`, `dialect`, `ast` and `expect`. `expect` has the form `{ "sql": string, "params": array }` or `{ "error": code }`. Every claimed port MUST run all cases and MUST produce exactly the same `sql` (byte for byte), exactly the same `params` (values and order), or the same error `code`. The SHA-256 hash of the file MUST equal the hash in the attribute table above; a change to the vectors MUST update this hash. Numbers in `params` in the vectors are normalized (no exponent, no trailing zeros); behavior for other number spellings is unspecified.

## 2. Interface

`compile(ast, dialect) -> { sql: string, params: array }` or an error. `dialect` MUST be one of `postgres`, `mysql`, `sqlite`, `mssql`; anything else is the error `invalid_dialect`, and this check MUST be performed before the AST is examined. The function MUST be pure: no I/O, no global state, no randomness. `sql` has no trailing semicolon. `params` contains only JSON scalars (`null`, boolean, number, string).

A port MAY provide additional interfaces (a builder, `compile_json`), but their output MUST equal that of `compile` for an equivalent AST.

## 3. AST model

The AST is a JSON value. When an object is read with duplicate keys, the last occurrence MUST win. Unknown keys MUST be ignored. A key counts as present when it exists and its value is not `undefined` (in JSON: when it exists); a `null` value on an optional key counts as present and the type rule of that key applies.

### 3.1 Statements

| `type` | Keys |
|---|---|
| `select` | `from` (required), `columns`, `distinct`, `joins`, `where`, `groupBy`, `having`, `orderBy`, `limit`, `offset` |
| `insert` | `into`, `columns`, `rows` (all required), `onConflict`, `returning` |
| `update` | `table`, `set` (required), `where`, `all`, `returning` |
| `delete` | `from` (required), `where`, `all`, `returning` |

A `type` that is not a string or is unknown MUST produce `invalid_ast`.

### 3.2 Expressions

An expression is a string or an object. A string is a column reference (section 4.1). An object MUST have **exactly one** of the keys `col`, `value`, `raw`, `fn`, `query`; otherwise `invalid_ast`.

| Form | Output rule |
|---|---|
| `{col: s}` | `quotePath(s)` |
| `{value: x}` | `x` MUST be a scalar (otherwise `invalid_ast`); it is appended to `params` and the output is the placeholder |
| `{raw: s, params: [...]}` | `s` is a non-empty string; every `?` in `s` (without exception) is replaced by a placeholder and the next param in `params`; the number of `?` MUST equal the length of `params` (default `[]`); every param MUST be a scalar |
| `{fn: name, args: [...], distinct: bool}` | `name` MUST match `^[A-Za-z_][A-Za-z0-9_.]*$`; the output is `UPPER(name) + "(" + ("DISTINCT " if distinct) + args separated by ", " + ")"`; `args` defaults to `[]` |
| `{query: select}` | `"(" + select + ")"` |

`as` on an expression applies only in the `columns` and `returning` lists: the output gets `" AS " + quotePart(as)` appended. Elsewhere `as` MUST be ignored.

### 3.3 Conditions

A condition is an object with a string `op`. The compilation result of a condition has a kind: `and`, `or` or `atom`.

| `op` | Keys | Output (kind) |
|---|---|---|
| `and`, `or` | `conds` (array, required) | Children are compiled in order. 0 children: `1 = 1` (`and`) or `1 = 0` (`or`), kind atom. 1 child: the result of that child unchanged (the child's kind). Otherwise children are joined with `" AND "`/`" OR "`; a child of kind `and`/`or` that differs from the parent MUST be wrapped in `(...)`; an atom or same-kind child is not wrapped. The kind of the result is the parent op |
| `not` | `cond` | `NOT (` child `)`, atom |
| `eq` `ne` `gt` `gte` `lt` `lte` | `left`, `right` | `left SYM right` with SYM `=`, `<>`, `>`, `>=`, `<`, `<=`; atom |
| `like`, `notLike` | `left`, `right` | `LIKE` / `NOT LIKE`; atom |
| `ilike`, `notIlike` | `left`, `right` | `postgres`: `ILIKE` / `NOT ILIKE`. Other dialects: `LOWER(left) LIKE LOWER(right)` / `LOWER(left) NOT LIKE LOWER(right)` |
| `in`, `notIn` | `left` and (`values` array **or** `query`) | If `query` is present: `left IN (select)`. Otherwise `values` is a required array; an empty array produces `1 = 0` (`in`) or `1 = 1` (`notIn`) **without** compiling `left`; otherwise `left IN (v1, v2, ...)` |
| `between`, `notBetween` | `left`, `low`, `high` | `left BETWEEN low AND high` / `NOT BETWEEN` |
| `isNull`, `isNotNull` | `left` | `left IS NULL` / `IS NOT NULL` |
| `exists`, `notExists` | `query` | `EXISTS (select)` / `NOT EXISTS (select)` |
| `raw` | `sql`, `params` | the `raw` rule of section 3.2; atom |

Operands of a condition are expressions (section 3.2). A missing required key MUST produce `invalid_ast`. An unknown op MUST produce `invalid_ast`.

### 3.4 Tables

`from` in `select` and `table` in a join are a string (`quotePath`) or an object: `{name, as?}` whose output is `quotePath(name)` followed by `" AS " + quotePart(as)` if present; or `{query, as}` whose output is `"(" + select + ") AS " + quotePart(as)` (`as` is required). `into`, `table` (update) and `from` (delete) MUST be plain strings and are quoted with `quotePath`.

### 3.5 Select

The output is assembled in order and separated by one space:

1. `SELECT`, then `DISTINCT` if `distinct` is true (a non-boolean `distinct` is `invalid_ast`).
2. Columns: if `columns` is empty or absent: `*`; otherwise expressions separated by `", "` (aliases allowed).
3. `FROM` table.
4. Each join: `KIND JOIN table` then `ON condition`. `kind` defaults to `inner`; valid values are `inner`, `left`, `right`, `full`, `cross` (lowercase), uppercase in the output. `cross` MUST NOT have `on`; every other kind MUST have `on`. `full` on `mysql` MUST produce `unsupported_feature`.
5. `WHERE condition`, if present. The top-level condition is not wrapped in parentheses.
6. `GROUP BY` expressions (if the array is not empty).
7. `HAVING condition`.
8. `ORDER BY`: each item is an expression or `{expr, dir}` (`dir` is `asc`|`desc`, default asc, otherwise `invalid_ast`). The output is always `expression ASC|DESC`. An object item that has the key `expr` is interpreted as `{expr, dir}`.
9. Pagination (section 5).

The order in which parameters are attached MUST follow the order in which placeholders appear in `sql` (left to right); an implementation MUST compile the parts in the order 2 to 8.

### 3.6 Insert

`INSERT INTO table (column, ...) VALUES (cell, ...), (cell, ...)` followed by a conflict clause and `RETURNING`. `columns` is a non-empty array of strings, each name quoted with `quotePart` (a single name; dots are not split). `rows` is a non-empty array; each row is an array of expressions with the same length as `columns` (otherwise `invalid_ast`). `onConflict` is an object with **exactly one** of `doNothing: true` or `update: [column, ...]`; `target` is an optional array of column names.

| Dialect | `doNothing` | `update` |
|---|---|---|
| `postgres`, `sqlite` | ` ON CONFLICT (target) DO NOTHING` (without `(target)` if there is no target) | ` ON CONFLICT (target) DO UPDATE SET "c" = EXCLUDED."c", ...`; `target` MUST be present and non-empty |
| `mysql` | prefix `INSERT IGNORE INTO`; `target` is ignored | ` ON DUPLICATE KEY UPDATE `c` = VALUES(`c`), ...`; `target` is ignored |
| `mssql` | `unsupported_feature` | `unsupported_feature` |

### 3.7 Update and Delete

`UPDATE table SET "c" = expression, ...`: `set` is a non-empty array of ordered `{col, expr}` items; column names are quoted with `quotePart`. `DELETE FROM table`. For both: if `where` is present the output is ` WHERE condition`; if `where` is absent, `all` MUST be `true`, otherwise the error is `missing_where`. A non-boolean `all` MUST produce `invalid_ast`. When `where` is present, `all` has no effect.

### 3.8 Returning

`returning` is an array of expressions (aliases allowed); an empty or absent array produces nothing. On `postgres` and `sqlite`: ` RETURNING expression, ...`; on other dialects with a non-empty array it MUST produce `unsupported_feature`.

## 4. Quoting and placeholders

### 4.1 Identifiers

`quotePart(s)`: `s` MUST be non-empty and MUST NOT contain U+0000 (otherwise `invalid_identifier`). `postgres`/`sqlite`: `"` + s with `"` doubled + `"`. `mysql`: `` ` `` + s with `` ` `` doubled + `` ` ``. `mssql`: `[` + s with `]` doubled + `]`.

`quotePath(s)`: `s` is split at every `.` (so `a..b`, `.a` and `a.` produce an empty part and `invalid_identifier`); each part is quoted with `quotePart`, except a part `*` that is the **last** part, which is written as `*` without quotes. A `*` part in any other position is quoted normally.

### 4.2 Placeholders

Parameters are numbered 1, 2, ... in the order they are attached. `postgres`: `$n`. `sqlite`, `mysql`: `?`. `mssql`: `@pn`.

## 5. Pagination

`limit` and `offset` MUST be non-negative integers of at most 9007199254740991 (otherwise `invalid_limit`; a non-number such as a string or `null` is also `invalid_limit`). Both are written directly (not as parameters).

| Dialect | Output |
|---|---|
| `postgres` | ` LIMIT n` if limit; ` OFFSET m` if offset |
| `sqlite` | like postgres; if only offset: ` LIMIT -1 OFFSET m` |
| `mysql` | like postgres; if only offset: ` LIMIT 18446744073709551615 OFFSET m` |
| `mssql` | if there is no `ORDER BY`: ` ORDER BY (SELECT NULL)`; then ` OFFSET m ROWS` (m=0 if there is no offset); then ` FETCH NEXT n ROWS ONLY` if limit |

## 6. Security

- Values (`value`, `raw` params) MUST never become part of the `sql` text.
- Identifiers MUST always be quoted; the only exceptions are a trailing `*`, functions (`fn`, validated by a regular expression) and `raw` (trusted SQL).
- Depth: nested expressions, conditions and selects MUST be limited to 64 levels (depth 0 for the statement; every nested call adds 1; depth > 64 is `too_deep`). An implementation MUST NOT exhaust its stack on any syntactically valid input.
- A port that accepts JSON text MUST limit the parser depth (Rust port: 512) and map syntax errors to `invalid_ast`.
- Any input MUST produce a result or an error with a `code` from section 7; a panic or any other exception is a bug.

## 7. Errors

| `code` | Condition | `messageId` |
|---|---|---|
| `invalid_ast` | wrong AST shape or type, missing required key, unknown choice, invalid JSON | `lomboksql.error.invalid_ast` |
| `invalid_identifier` | empty identifier, contains NUL, or empty path part | `lomboksql.error.invalid_identifier` |
| `invalid_dialect` | unknown dialect (case-sensitive) | `lomboksql.error.invalid_dialect` |
| `invalid_limit` | `limit`/`offset` is not an integer in 0..9007199254740991 | `lomboksql.error.invalid_limit` |
| `unsupported_feature` | feature does not exist in the dialect | `lomboksql.error.unsupported_feature` |
| `missing_where` | update/delete without `where` and without `all: true` | `lomboksql.error.missing_where` |
| `too_deep` | depth > 64 | `lomboksql.error.too_deep` |

When several errors apply at once, the reported error is the first one in the evaluation order of section 3 (dialect first, then compilation order). Insert order: `into`, `columns`, `rows` (row by row), `onConflict`, `returning`; update: `table`, `set`, `where`/`all`, `returning`; delete: `from`, `where`/`all`, `returning`.

## 8. Non-goals (0.1.0)

`UNION`/`INTERSECT`, CTEs, window functions, DDL, `NULLS FIRST/LAST`, `MERGE`, `RETURNING`/`OUTPUT` for MySQL and SQL Server, validation of the content of `raw`, validation against a database schema, and execution. The correctness of the SQL against real database engines is tested on SQLite, PostgreSQL and MySQL (`integration/`); SQL Server: in the first run, 29 of 36 scenarios passed and the rest failed because of the fixture (fixed, re-run pending).

## 9. Contract change history

| Version | Change |
|---|---|
| 0.1.0 | Initial contract |
