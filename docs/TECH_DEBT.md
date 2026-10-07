# Tech Debt LombokSQL

Format: ID, temuan, prioritas, perbaikan, status. Prioritas P1 memblokir rilis minor; P0 memblokir tag 0.1.0.

| ID | Temuan | Prioritas | Perbaikan | Status |
|---|---|---|---|---|
| TD-01 | Eksekusi nyata: SQLite 3.51, PostgreSQL 16, MySQL 8.0 diuji (108 hasil, 6 mutan terbunuh); SQL Server belum; versi minimum lama belum diuji | P0 | Job CI `integration` harus hijau di GitHub; jalankan TD-13; uji versi minimum (PostgreSQL 9.5-12, MySQL 5.7, SQLite 3.24/3.35) | PARSIAL |
| TD-02 | `ci.yml` sudah berjalan (TypeScript 6/6 hijau, mutation hijau); Rust diperbaiki tetapi belum terverifikasi di GitHub; action belum di-pin SHA | P0 | Pastikan Rust hijau; pin SHA; aktifkan Dependabot | PARSIAL |
| TD-03 | `lombok doctor docs/privacy/style` belum ada (TD-P0-08 ekosistem); pemeriksaan manual saja | P0 | Jalankan setelah `codinglombok/.github` ada; daftar istilah klien privat | OPEN |
| TD-04 | Coverage belum diukur; target 90% | P1 | Tambah job coverage Rust dan TS | OPEN |
| TD-05 | Fuzz bukan `cargo-fuzz`; tidak ada fuzz Rust | P1 | Target `cargo-fuzz` untuk `compile_json` | OPEN |
| TD-06 | `no_std` hanya dibuktikan build host | P1 | Build `thumbv7em-none-eabi` di CI | OPEN |
| TD-07 | Clippy dan rustfmt | P1 | Lulus lokal pada Rust 1.75 dan 1.91; ada di CI (`-D warnings`) | SELESAI (menunggu hijau di GitHub) |
| TD-08 | Hanya Rust dan TypeScript; port Python, Go, PHP BELUM | P1 | Rencana 0.2.0 | OPEN |
| TD-09 | Parser JSON Rust menolak AST lebih dalam dari 512 dengan `invalid_ast`, sedangkan TS memberi `too_deep` | P2 | Selaraskan atau dokumentasikan di vector | PARSIAL (didokumentasikan di SPEC 6) |
| TD-10 | Hash vector di SPEC diperbarui manual | P2 | Diperiksa otomatis oleh `test/docs.test.ts` | SELESAI |
| TD-11 | Salinan `LICENSE-*` di `rust/` | P3 | Otomatiskan salinan saat rilis | OPEN |
| TD-12 | 160 kasus regresi berekspektasi dari TS (dikonfirmasi port Rust); hanya 556 golden yang independen | P3 | Tinjau manual sebagian kasus regresi | OPEN |
| TD-13 | Adapter dan job SQL Server belum pernah dijalankan | P1 | Jalankan job `integration-mssql`, perbaiki, lalu hapus `continue-on-error` | OPEN |
| TD-14 | Versi minimum dialek (PostgreSQL 9.5, MySQL 5.7, SQLite 3.24/3.35/3.39, SQL Server 2012) hanya dari dokumentasi vendor | P2 | Matriks versi di CI | OPEN |
