# LombokSQL

[![License](https://img.shields.io/badge/license-Apache--2.0%20OR%20MIT-blue)](LICENSE-APACHE)

Kompiler SQL universal: satu **AST JSON** menjadi **SQL berparameter** yang deterministik untuk PostgreSQL, MySQL, SQLite, dan SQL Server. Tanpa dependensi runtime, tanpa koneksi database, tanpa I/O. Hasilnya identik byte-per-byte di setiap port.

Part of the [Lombok Ecosystem](https://github.com/codinglombok).

## Mengapa library ini?

Banyak program perlu menyusun SQL secara dinamis: layanan web, alat CLI dan ETL, fungsi serverless, gateway di perangkat tepi, generator data uji, dan alat migrasi. Query builder yang ada biasanya terikat satu bahasa, satu driver, atau satu ORM, sehingga logika yang sama harus ditulis ulang di setiap bahasa dan hasilnya sedikit berbeda.

LombokSQL memisahkan dua hal:

1. **Kontrak**: AST JSON yang dispesifikasikan secara normatif (`docs/SPEC_LombokSQL_v0.1.0.md`) dan vector uji bersama.
2. **Implementasi**: kompiler kecil per bahasa. Karena AST adalah data biasa, ia dapat disimpan, dikirim lewat jaringan, di-cache, diperiksa, atau dibangkitkan oleh bahasa mana pun, lalu dikompilasi di tempat yang memiliki dialek target.

Skenario pemakaian:

- **Layanan web dan API**: filter dinamis dari parameter permintaan menjadi `WHERE` aman tanpa penyambungan string.
- **Alat ETL dan CLI**: satu definisi query dijalankan ke SQLite lokal saat uji dan PostgreSQL di produksi.
- **Serverless dan edge**: inti Rust `no_std + alloc` dan paket TypeScript tanpa dependensi, cocok untuk lingkungan dengan batas ukuran.
- **Perangkat dan gateway tertanam**: menyusun perintah SQL untuk database jarak jauh dari firmware tanpa library besar.
- **Generator data dan alat migrasi**: `INSERT`, upsert, dan pembaruan massal yang konsisten antar dialek.

Contoh dependen lain di ekosistem Lombok dicantumkan di `docs/map_LombokSQL_v0.1.0.md`.

## Fitur

Setiap fitur di bawah ini dicakup vector di `vectors/` dan test TypeScript.

- `SELECT`: kolom, alias, `DISTINCT`, subquery di `FROM` dan kolom, `JOIN` (inner, left, right, full, cross), `WHERE`, `GROUP BY`, `HAVING`, `ORDER BY`, `LIMIT`/`OFFSET`.
- Kondisi: `and`, `or`, `not`, perbandingan, `like`, `ilike`, `in` (daftar atau subquery), `between`, `is null`, `exists`, kondisi mentah berparameter. Kurung disisipkan hanya bila perlu.
- `INSERT` (banyak baris), upsert (`ON CONFLICT` dan `ON DUPLICATE KEY`), `RETURNING`.
- `UPDATE` dan `DELETE`. **Tanpa `WHERE` ditolak** (`missing_where`) kecuali `all: true` dinyatakan eksplisit.
- Semua nilai selalu menjadi parameter terikat. Identifier selalu dikutip sesuai dialek. Teks nilai tidak pernah masuk ke SQL.
- Penomoran placeholder per dialek: `$1`, `?`, `@p1`.
- Paginasi per dialek (SQL Server memakai `OFFSET ... FETCH`).
- Galat dengan `code` kanonik dan `messageId` untuk terjemahan; batas kedalaman 64.

## Instalasi

Belum terbit di registry. Setelah rilis pertama:

```bash
npm install lomboksql      # TypeScript / JavaScript
cargo add lomboksql        # Rust
```

## Quick Start

### TypeScript

```ts
import { select, eq, gt, and, compile } from "lomboksql";

const q = select("u.id", "u.name")
  .from("users u")
  .where(and(eq("u.active", true), gt("u.age", 18)))
  .orderBy("u.id", "desc")
  .limit(10);

q.build("postgres");
// { sql: 'SELECT "u"."id", "u"."name" FROM "users" AS "u" WHERE "u"."active" = $1 AND "u"."age" > $2 ORDER BY "u"."id" DESC LIMIT 10',
//   params: [true, 18] }

q.build("mssql").sql;
// SELECT [u].[id], [u].[name] FROM [users] AS [u] WHERE [u].[active] = @p1 AND [u].[age] > @p2 ORDER BY [u].[id] DESC OFFSET 0 ROWS FETCH NEXT 10 ROWS ONLY

// Atau langsung dari AST (kontrak lintas bahasa):
compile({ type: "select", from: "t", where: { op: "eq", left: "id", right: { value: 1 } } }, "sqlite");
```

### Rust

```rust
use lomboksql::compile_json;

let r = compile_json(
    r#"{"type":"select","from":"t","where":{"op":"eq","left":"id","right":{"value":1}}}"#,
    "postgres",
).unwrap();
assert_eq!(r.sql, r#"SELECT * FROM "t" WHERE "id" = $1"#);
assert_eq!(r.params_json(), "[1]");
```

## Status port

| Port | Status | Bukti |
|---|---|---|
| Rust (`no_std + alloc`) | YA, lulus vector | `rust/tests/vectors.rs` menjalankan seluruh vector |
| TypeScript | YA, lulus vector | `typescript/test/vectors.test.ts` menjalankan seluruh vector; ditambah test builder dan fuzz |
| Python, Go, PHP, Java, Kotlin, C#, C/C++, Swift, Perl | BELUM | Tidak ada kode; direncanakan setelah kontrak stabil (lihat `docs/development_ide_LombokSQL_v0.1.0.md`) |

Vector: 716 kasus (556 golden berekspektasi tulis tangan, 160 regresi hasil pembangkit) pada empat dialek.

## Standar yang diimplementasikan

Kontrak output ditentukan oleh `SPEC_`. Dialek target dan versi minimum fitur dicantumkan di sana (PostgreSQL, MySQL, SQLite, SQL Server). Lihat bagian "Batasan yang diketahui".

## Batasan yang diketahui

- **SQL yang dihasilkan belum dieksekusi terhadap database sungguhan.** Kebenarannya dibuktikan terhadap vector, bukan terhadap mesin database. Test integrasi per dialek direncanakan.
- Belum ada: `UNION`/`INTERSECT`, CTE (`WITH`), window function, DDL (`CREATE TABLE`, migrasi), `NULLS FIRST/LAST`, `RETURNING` untuk MySQL dan SQL Server, upsert untuk SQL Server (`MERGE`).
- Fungsi SQL dan `raw` tidak divalidasi; `raw` adalah SQL tepercaya yang ditulis pengembang, bukan masukan pengguna.
- Setiap `?` di dalam `raw` adalah placeholder; tanda tanya literal harus diberikan sebagai parameter.
- Hanya Rust dan TypeScript yang memiliki kode. Builder fluent hanya ada di TypeScript.
- Belum ada audit keamanan pihak ketiga. Fuzz bersifat pseudo-fuzz, belum `cargo-fuzz`.

## Ekosistem Lombok

LombokSQL tidak bergantung pada library Lombok lain (L0). Library lain dapat memakainya secara opsional; daftar dependen ada di `docs/map_LombokSQL_v0.1.0.md`.

## Contributing

Lihat [CONTRIBUTING.md](CONTRIBUTING.md). Untuk melaporkan kerentanan lihat [SECURITY.md](SECURITY.md).

## Lisensi

`Apache-2.0 OR MIT`. Lihat [LICENSE-APACHE](LICENSE-APACHE) dan [LICENSE-MIT](LICENSE-MIT).
