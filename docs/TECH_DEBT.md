# Tech Debt LombokSQL

Format: ID, temuan, prioritas, perbaikan, status. Prioritas P1 memblokir rilis minor; P0 memblokir tag 0.1.0.

| ID | Temuan | Prioritas | Perbaikan | Status |
|---|---|---|---|---|
| TD-01 | Eksekusi nyata: SQLite 3.51, PostgreSQL 16, MySQL 8.0 diuji (108 hasil, 6 mutan terbunuh); SQL Server belum; versi minimum lama belum diuji | P0 | Job CI `integration` harus hijau di GitHub; jalankan TD-13; uji versi minimum (PostgreSQL 9.5-12, MySQL 5.7, SQLite 3.24/3.35) | PARSIAL |
| TD-02 | CI berjalan dan hijau di GitHub (run 37723054533): TypeScript 6/6, Rust 3/3, integration, mutation; hanya `integration-mssql` (opsional) yang belum. Action di-pin SHA, Dependabot aktif | P0 | - | SELESAI |
| TD-03 | `lombok doctor docs/privacy/style` belum ada (TD-P0-08 ekosistem); pemeriksaan manual saja | P0 | Jalankan setelah `codinglombok/.github` ada; daftar istilah klien privat | OPEN |
| TD-04 | Coverage TypeScript 98,7% baris (inti `compile.ts` 100%), gerbang 90% di CI; coverage Rust belum diukur (tidak ada `cargo-llvm-cov` di sandbox) | P1 | Tambah job `cargo-llvm-cov` | PARSIAL |
| TD-05 | Fuzz bukan `cargo-fuzz`; tidak ada fuzz Rust | P1 | Target `cargo-fuzz` untuk `compile_json` | OPEN |
| TD-06 | `no_std` hanya dibuktikan build host | P1 | Build `thumbv7em-none-eabi` di CI | OPEN |
| TD-07 | Clippy dan rustfmt | P1 | Lulus lokal pada Rust 1.75 dan 1.91; ada di CI (`-D warnings`) | SELESAI (hijau di GitHub) |
| TD-08 | Hanya Rust dan TypeScript; port Python, Go, PHP BELUM | P1 | Rencana 0.2.0 | OPEN |
| TD-09 | Parser JSON Rust menolak AST lebih dalam dari 512 dengan `invalid_ast`, sedangkan TS memberi `too_deep` | P2 | Selaraskan atau dokumentasikan di vector | PARSIAL (didokumentasikan di SPEC 6) |
| TD-10 | Hash vector di SPEC diperbarui manual | P2 | Diperiksa otomatis oleh `test/docs.test.ts` | SELESAI |
| TD-11 | Salinan `LICENSE-*` di `rust/` | P3 | Otomatiskan salinan saat rilis | OPEN |
| TD-12 | 160 kasus regresi berekspektasi dari TS (dikonfirmasi port Rust); hanya 556 golden yang independen | P3 | Tinjau manual sebagian kasus regresi | OPEN |
| TD-13 | Job SQL Server dijalankan pertama kali di CI: 29 dari 36 skenario lulus, 7 gagal karena fixture memakai tipe `text` (tidak dapat dipakai di COUNT DISTINCT, UPPER, `=` pada SQL Server), bukan karena SQL yang dihasilkan. Fixture sudah diperbaiki (`varchar(100)`), belum dijalankan ulang | P1 | Jalankan ulang; bila hijau hapus `continue-on-error` | PARSIAL |
| TD-14 | Versi minimum dialek (PostgreSQL 9.5, MySQL 5.7, SQLite 3.24/3.35/3.39, SQL Server 2012) hanya dari dokumentasi vendor | P2 | Matriks versi di CI | OPEN |
