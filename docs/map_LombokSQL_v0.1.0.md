# Map LombokSQL v0.1.0

## 1. Posisi dependensi

L0, cluster 03 (Format, Parser & Serialisasi), nomor katalog 03.11. Tidak memiliki dependensi Lombok wajib.

## 2. Contoh dependen di ekosistem

Bagian ini satu-satunya tempat nama aplikasi atau framework boleh muncul (ADR-019). Ini ilustrasi, bukan kepemilikan; siapa pun dapat memakai LombokSQL.

| Pemakai | Jenis | Status integrasi | Keterangan |
|---|---|---|---|
| LombokClarion v3 | Framework | rencana (F7) | Menggantikan lapisan persistence internal v2 |
| LombokServer | Library L4 | rencana | Penyimpanan sesi dan konfigurasi |
| LombokAuth, LombokSecurity | Library L1/L2 | rencana | Penyimpanan token dan jejak audit |
| LombokDocFlow | Aplikasi | rencana | Penyimpanan metadata |

Dependensi opsional LombokSQL ke library lain (LombokJSON, LombokLog, LombokValidator) belum diimplementasikan.

## 3. Bergantung pada

Tidak ada.

## 4. Jalur kontrak normatif

`docs/SPEC_LombokSQL_v0.1.0.md` -> `vectors/lomboksql-vectors-v1.json` (sha256 di SPEC) -> runner `rust/tests/vectors.rs` dan `typescript/test/vectors.test.ts`.

## 5. Peta folder

Lihat `structure_repo_LombokSQL_v0.1.0.md`.
