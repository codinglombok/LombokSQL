# Guide How To Use LombokSQL v0.1.0

## Installation

Not published yet. After the release: `npm install lomboksql` or `cargo add lomboksql`. Until then, build from the repository (see `CONTRIBUTING.md`).

## Basic concepts

1. You build an **AST** (a JSON object) or use the TypeScript builder.
2. `compile(ast, dialect)` returns `{ sql, params }`.
3. You hand `sql` and `params` to your database driver. LombokSQL never opens a connection.

Values always become parameters. A string on the left side of a comparison is a column name; a value on the right side is wrapped as `{ "value": ... }`.

## Example

```ts
import { select, eq, and, gte, inList } from "lomboksql";

const q = select("id", "email")
  .from("accounts")
  .where(and(eq("status", "active"), gte("created_at", "2026-01-01"), inList("country", ["ID", "MY"])))
  .orderBy("id")
  .limit(50);

const { sql, params } = q.build("postgres");
// await pool.query(sql, params)
```

## Recipes

### Dynamic filters

```ts
import { select, eq, like, and } from "lomboksql";
const conds = [];
if (filter.status) conds.push(eq("status", filter.status));
if (filter.name) conds.push(like("name", `%${filter.name}%`));
const q = select().from("items").where(and(...conds)).limit(20);   // no filters: WHERE 1 = 1
```

### Upsert

```ts
import { insertInto } from "lomboksql";
insertInto("counters").columns("key", "n").values("hits", 1).onConflictUpdate(["key"], ["n"]).build("sqlite");
```

### A deliberate bulk delete

```ts
import { deleteFrom } from "lomboksql";
deleteFrom("tmp_import").all().build("postgres");   // without all() this is rejected: missing_where
```

### From another language (Rust)

```rust
let r = lomboksql::compile_json(r#"{"type":"delete","from":"t","where":{"op":"eq","left":"id","right":{"value":7}}}"#, "mysql")?;
```

## Common pitfalls

- `raw` is trusted SQL; never put user input in its text, use `params`. Every `?` in `raw` is a placeholder.
- `RETURNING` is only available on PostgreSQL and SQLite; MySQL and SQL Server throw `unsupported_feature`.
- On dialects other than PostgreSQL, `ilike` becomes `LOWER(a) LIKE LOWER(b)`; collation behavior follows the database.
- SQL Server needs an `ORDER BY` for pagination; if there is none, `ORDER BY (SELECT NULL)` is inserted.
- `limit` and `offset` must be non-negative integers, not strings.
- Every statement is compiled with its own parameter numbering; do not concatenate two `sql` results by hand.
- On SQL Server avoid the legacy `text` column type: it cannot be used with `COUNT(DISTINCT)`, `UPPER` or `=`; use `varchar`/`nvarchar`.

## See also

README, SPEC_, API_.
