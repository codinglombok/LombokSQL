# Guide How To Use LombokSQL v0.1.0

## Instalasi

Belum terbit. Setelah rilis: `npm install lomboksql` atau `cargo add lomboksql`. Sebelum itu, bangun dari repo (lihat `CONTRIBUTING.md`).

## Konsep dasar

1. Anda menyusun **AST** (objek JSON) atau memakai builder TypeScript.
2. `compile(ast, dialek)` menghasilkan `{ sql, params }`.
3. Anda menyerahkan `sql` dan `params` ke driver database. LombokSQL tidak membuka koneksi.

Nilai selalu menjadi parameter. String di sisi kiri pembanding adalah nama kolom; nilai di sisi kanan dibungkus `{ "value": ... }`.

## Contoh

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

### Filter dinamis

```ts
import { select, eq, like, and } from "lomboksql";
const conds = [];
if (filter.status) conds.push(eq("status", filter.status));
if (filter.name) conds.push(like("name", `%${filter.name}%`));
const q = select().from("items").where(and(...conds)).limit(20);   // tanpa filter: WHERE 1 = 1
```

### Upsert

```ts
import { insertInto } from "lomboksql";
insertInto("counters").columns("key", "n").values("hits", 1).onConflictUpdate(["key"], ["n"]).build("sqlite");
```

### Hapus massal secara sengaja

```ts
import { deleteFrom } from "lomboksql";
deleteFrom("tmp_import").all().build("postgres");   // tanpa all() akan ditolak: missing_where
```

### Dari bahasa lain (Rust)

```rust
let r = lomboksql::compile_json(r#"{"type":"delete","from":"t","where":{"op":"eq","left":"id","right":{"value":7}}}"#, "mysql")?;
```

## Common pitfalls

- `raw` adalah SQL tepercaya; jangan menyertakan masukan pengguna di teksnya, pakai `params`. Setiap `?` di `raw` adalah placeholder.
- `RETURNING` hanya PostgreSQL dan SQLite; MySQL dan SQL Server melempar `unsupported_feature`.
- `ilike` pada dialek selain PostgreSQL menjadi `LOWER(a) LIKE LOWER(b)`; perilaku kolasi mengikuti database.
- SQL Server memerlukan `ORDER BY` untuk paginasi; bila tidak ada, `ORDER BY (SELECT NULL)` disisipkan.
- `limit` dan `offset` harus bilangan bulat tak negatif, bukan string.
- Setiap pernyataan dikompilasi dengan penomoran parameter sendiri; jangan menggabungkan dua hasil `sql` secara manual.

## Lihat juga

README, SPEC_, API_.
