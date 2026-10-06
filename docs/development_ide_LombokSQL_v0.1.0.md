# Development IDE LombokSQL v0.1.0

## 1. Roadmap

| Versi | Isi |
|---|---|
| 0.1.1 | Tutup syarat rilis: CI dijalankan, `doctor docs/privacy/style`, coverage diukur, `cargo-fuzz` target |
| 0.2.0 | Test integrasi terhadap PostgreSQL, MySQL, SQLite, SQL Server (kontainer) di CI; `UNION`/`INTERSECT`; CTE; DDL minimal (`createTable`, `dropTable`, `createIndex`); port Python, Go, PHP |
| 0.3.0 | Window function; `MERGE` untuk SQL Server; `OUTPUT` untuk SQL Server; `NULLS FIRST/LAST`; crate C-ABI dan WASM (ADR-010) |
| 0.4.0 | Java/Kotlin, C#, Swift, C++ lewat C-ABI atau port; benchmark dan ukuran biner |

## 2. Deferred scope

Lihat SPEC bagian 8 dan README (Batasan).

## 3. Prinsip desain kontributor

- Kontrak dulu, test dulu; semua port lulus vector yang sama.
- Tidak ada dependensi runtime; dev-dependency dicatat.
- Setiap fitur yang tidak ada pada dialek menghasilkan galat eksplisit, bukan keluaran yang diam-diam berbeda.
- Urutan evaluasi kode mengikuti urutan keluaran SQL (menjaga urutan parameter).

## 4. Cara berkontribusi

Lihat `CONTRIBUTING.md`.

## 5. Pertanyaan terbuka

- Apakah `limit`/`offset` sebaiknya opsional sebagai parameter terikat untuk dialek yang mendukungnya?
- Apakah builder Rust diperlukan atau cukup AST JSON?
- Dukungan MariaDB (`RETURNING`) sebagai dialek terpisah?
