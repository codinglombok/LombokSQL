# Full Summary LombokSQL v0.1.0

## Apa ini

Kompiler yang mengubah AST JSON menjadi SQL berparameter untuk empat dialek, tanpa dependensi dan tanpa I/O.

## Mengapa dibuat

Query builder umumnya terikat satu bahasa dan satu driver. Tim yang memakai beberapa bahasa atau beberapa database menulis ulang logika yang sama dan mendapat perilaku yang sedikit berbeda. Dengan AST sebagai kontrak, query dapat dibangun di satu tempat dan dikompilasi di tempat lain.

## Fitur utama

Lihat README (bagian Fitur). Semua fitur dicakup vector.

## Status saat ini

Kode lengkap untuk Rust dan TypeScript; lulus 716 kasus vector; belum terbit di registry; belum memenuhi aturan skor rilis (lihat `TECH_DEBT.md`).

## Contoh pemakai

Lihat README (skenario pemakaian).

## Batasan yang Diketahui

- Eksekusi nyata diuji pada SQLite, PostgreSQL, dan MySQL (36 skenario); SQL Server: run pertama di CI 29 dari 36 skenario lulus, sisanya gagal karena fixture yang sudah diperbaiki dan menunggu run ulang (TD-13). Versi minimum dialek di `SPEC_` belum diuji satu per satu.
- Tidak ada `UNION`, CTE, window function, DDL, `NULLS FIRST/LAST`, `MERGE`.
- `RETURNING` hanya PostgreSQL dan SQLite; upsert tidak ada untuk SQL Server.
- `raw` tidak divalidasi; setiap `?` di dalamnya adalah placeholder.
- `limit`/`offset` ditulis langsung (divalidasi bilangan bulat), bukan parameter.
- Hanya dua port; builder hanya di TypeScript.
- Fuzz berupa pseudo-fuzz dan mutasi AST, belum `cargo-fuzz`; belum audit pihak ketiga; coverage belum diukur.

## Info lanjut

SPEC_, API_, `development_ide_`.

## Gap vs pembanding (U6)

Perbandingan bersifat kualitatif dan berdasarkan pengetahuan umum tentang kategori library; belum diverifikasi fitur demi fitur pada 2026-10-06.

| Pembanding (kategori) | Yang dimiliki pembanding dan belum dimiliki LombokSQL | Yang ditawarkan LombokSQL |
|---|---|---|
| Query builder satu bahasa (Kysely, Knex, SQLAlchemy Core, jOOQ, SeaQuery) | DDL, tipe skema, CTE, window function, `UNION`, integrasi driver dan ekosistem matang | Kontrak AST lintas bahasa dengan vector bersama; keluaran identik antar port; inti `no_std + alloc`; tanpa dependensi |
| ORM | Pemetaan objek, relasi, migrasi | Bukan ORM; hanya kompilasi query |
| String SQL manual | Fleksibilitas penuh | Parameter terikat dan pengutipan identifier otomatis; penolakan `UPDATE`/`DELETE` tanpa `WHERE` |
