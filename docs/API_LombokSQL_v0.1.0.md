# API LombokSQL v0.1.0

Semantik normatif ada di `SPEC_LombokSQL_v0.1.0.md`; dokumen ini hanya mendaftar antarmuka yang benar-benar diekspor.

## 1. TypeScript (paket `lomboksql`)

Stabilitas: 0.x, dapat berubah pada rilis minor.

### Inti

| Simbol | Tanda tangan | Keterangan |
|---|---|---|
| `compile` | `compile(ast: unknown, dialect: string): Compiled` | Kompiler normatif. Melempar `LombokSqlError`. Sejak 0.1.0 |
| `Compiled` | `{ sql: string; params: Scalar[] }` | Hasil |
| `Scalar` | `null \| boolean \| number \| string` | Tipe parameter |
| `Dialect` | `"postgres" \| "mysql" \| "sqlite" \| "mssql"` | |
| `LombokSqlError` | `extends Error`; `code: ErrorCode`, `messageId: string` | Kode: lihat SPEC bagian 7 |
| `ErrorCode` | union kode galat | |

### Builder (hanya membangun AST; semua keluaran SQL berasal dari `compile`)

| Simbol | Keterangan |
|---|---|
| `select(...cols)`, `insertInto(t)`, `update(t)`, `deleteFrom(t)` | Membuat builder. `toAst()` mengembalikan salinan AST, `build(dialect)` memanggil `compile` |
| `SelectBuilder`: `columns`, `distinct`, `from` (string `"tabel alias"`, objek, atau builder), `innerJoin`, `leftJoin`, `rightJoin`, `fullJoin`, `crossJoin`, `where` (pemanggilan berulang digabung AND), `groupBy`, `having`, `orderBy(expr, dir)`, `limit`, `offset` | |
| `InsertBuilder`: `columns`, `values(...cells)` (satu baris), `onConflictDoNothing(target?)`, `onConflictUpdate(target, update)`, `returning` | |
| `UpdateBuilder`: `set(col, value)`, `where`, `all()`, `returning` | |
| `DeleteBuilder`: `where`, `all()`, `returning` | |
| Ekspresi: `col(name, as?)`, `val(value, as?)`, `raw(sql, params?, as?)`, `fn(name, args?, {distinct?, as?})` | |
| Kondisi: `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `like`, `notLike`, `ilike`, `notIlike`, `and`, `or`, `not`, `isNull`, `isNotNull`, `between`, `inList`, `notInList`, `inQuery`, `exists`, `notExists`, `rawCond` | |

Konvensi builder: string di sisi kiri pembanding dan di daftar kolom adalah kolom; nilai JS di sisi kanan menjadi parameter terikat. Gunakan `col()` untuk kolom di sisi kanan.

## 2. Rust (crate `lomboksql`)

Fitur: `std` (bawaan). Tanpa `std`, crate bersifat `no_std + alloc`.

| Simbol | Keterangan |
|---|---|
| `compile(ast: &Value, dialect: &str) -> Result<Compiled, Error>` | Kompiler normatif |
| `compile_json(ast_json: &str, dialect: &str) -> Result<Compiled, Error>` | Titik masuk universal untuk FFI dan skrip |
| `parse_json(&str) -> Result<Value, Error>` | Parser JSON internal (kedalaman maksimum 512) |
| `Value` | `Null`, `Bool`, `Num(String)` (leksem asli), `Str`, `Arr`, `Obj`; `get`, `to_json` |
| `Compiled { sql, params }` | `params_json()` menghasilkan array JSON ringkas |
| `Dialect` | `Postgres`, `Mysql`, `Sqlite`, `Mssql`; `Dialect::parse` |
| `Error { code, message }` | `message_id()`; implementasi `Display` dan (dengan `std`) `std::error::Error` |

Port Rust tidak memiliki builder pada 0.1.0.

## 3. Port lain

Belum ada.

## 4. Kompatibilitas lintas bahasa

Untuk AST yang sama dan dialek yang sama, `compile` TypeScript dan Rust menghasilkan `sql` dan `params` identik pada seluruh vector (716 kasus).
