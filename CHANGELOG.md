# Changelog

Semua perubahan penting dicatat di sini. Format mengikuti [Keep a Changelog](https://keepachangelog.com/); entri terbaru di depan. Versi mengikuti [SemVer](https://semver.org/).

## [0.1.0] - 2026-10-06

### Added
- Kompiler AST JSON ke SQL berparameter untuk PostgreSQL, MySQL, SQLite, dan SQL Server.
- Pernyataan `select`, `insert`, `update`, `delete` dengan kondisi, join, subquery, agregasi, paginasi, upsert, dan `RETURNING` (PostgreSQL dan SQLite).
- Perlindungan `missing_where` untuk `update` dan `delete` tanpa `WHERE`.
- Port Rust (`no_std + alloc`, tanpa dependensi) dan port TypeScript (tanpa dependensi runtime).
- Builder fluent TypeScript.
- Vector bersama 716 kasus, dijalankan oleh runner Rust dan TypeScript.
- Pseudo-fuzz, fuzz berbasis mutasi AST, dan skrip uji mutasi (25 mutan).

### Security
- Nilai selalu terikat sebagai parameter; identifier selalu dikutip; batas kedalaman 64.
