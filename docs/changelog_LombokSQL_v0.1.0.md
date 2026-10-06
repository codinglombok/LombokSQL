# Changelog LombokSQL (ringkasan)

Entri terbaru di depan. Rincian ada di `CHANGELOG.md`.

## 0.1.0 - 2026-10-06

### Added
- Kompiler AST JSON ke SQL berparameter untuk `postgres`, `mysql`, `sqlite`, `mssql`.
- `select`, `insert` (upsert, `RETURNING`), `update`, `delete`; perlindungan `missing_where`.
- Port Rust `no_std + alloc` dan port TypeScript; builder fluent TypeScript.
- Vector 716 kasus; runner di kedua port; fuzz, uji mutasi.

### Security
- Nilai selalu terikat; identifier selalu dikutip; batas kedalaman 64.
