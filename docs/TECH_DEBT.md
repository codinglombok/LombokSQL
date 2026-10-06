# Tech Debt LombokSQL

Format: ID, temuan, prioritas, perbaikan, status. Prioritas P1 memblokir rilis minor; P0 memblokir tag 0.1.0.

| ID | Temuan | Prioritas | Perbaikan | Status |
|---|---|---|---|---|
| TD-01 | SQL belum dieksekusi terhadap database sungguhan; kebenaran hanya terhadap vector | P0 | Test integrasi per dialek di CI (kontainer) pada 0.2.0; untuk 0.1.0 minimal SQLite dijalankan di CI | OPEN |
| TD-02 | `ci.yml` belum pernah dijalankan di GitHub Actions; action belum di-pin SHA | P0 | Jalankan di repo, pin SHA, aktifkan Dependabot | OPEN |
| TD-03 | `lombok doctor docs/privacy/style` belum ada (TD-P0-08 ekosistem); pemeriksaan manual saja | P0 | Jalankan setelah `codinglombok/.github` ada; daftar istilah klien privat | OPEN |
| TD-04 | Coverage belum diukur; target 90% | P1 | Tambah job coverage Rust dan TS | OPEN |
| TD-05 | Fuzz bukan `cargo-fuzz`; tidak ada fuzz Rust | P1 | Target `cargo-fuzz` untuk `compile_json` | OPEN |
| TD-06 | `no_std` hanya dibuktikan build host | P1 | Build `thumbv7em-none-eabi` di CI | OPEN |
| TD-07 | Clippy dan rustfmt belum dijalankan | P1 | Tambah ke CI (`-D warnings`) | OPEN |
| TD-08 | Hanya Rust dan TypeScript; port Python, Go, PHP BELUM | P1 | Rencana 0.2.0 | OPEN |
| TD-09 | Parser JSON Rust menolak AST lebih dalam dari 512 dengan `invalid_ast`, sedangkan TS memberi `too_deep` | P2 | Selaraskan atau dokumentasikan di vector | PARSIAL (didokumentasikan di SPEC 6) |
| TD-10 | Hash vector di SPEC diperbarui manual | P2 | Diperiksa otomatis oleh `test/docs.test.ts` | SELESAI |
| TD-11 | Salinan `LICENSE-*` di `rust/` | P3 | Otomatiskan salinan saat rilis | OPEN |
| TD-12 | 160 kasus regresi berekspektasi dari TS (dikonfirmasi port Rust); hanya 556 golden yang independen | P3 | Tinjau manual sebagian kasus regresi | OPEN |
