# How To Dist LombokSQL v0.1.0

## 1. Upload pertama (bootstrap)

Repo `codinglombok/LombokSQL` sudah dibuat kosong. Dari folder lokal berisi proyek ini:

```powershell
git init -b main
git add -A
git status            # periksa: docs/*architecture*, docs/*masterplan*, node_modules, target TIDAK ikut
git commit -m "feat: LombokSQL v0.1.0 (kompiler AST ke SQL berparameter)"
git remote add origin https://github.com/codinglombok/LombokSQL.git
git push -u origin main
gh repo edit codinglombok/LombokSQL --add-topic lombok-ecosystem --add-topic cluster-03 --add-topic level-l0 --add-topic sql --add-topic rust --add-topic typescript --description "Universal SQL query compiler: one JSON AST to parameterized SQL for PostgreSQL, MySQL, SQLite and SQL Server. Part of the Lombok Ecosystem."
```

Jangan membuat tag rilis pada tahap ini; lihat syarat di `TECH_DEBT.md`.

## 2. Alur rilis reguler

Target (ADR-011): release-please membuka PR rilis; merge PR membuat tag `vX.Y.Z`; publish membaca versi dari tag. Reusable workflow `codinglombok/.github` belum ada (TD-P0-08), sehingga `ci.yml` repo ini mandiri sementara.

## 3. Publish per registry

| Registry | Paket | Pemeriksaan pra-publish |
|---|---|---|
| npm | `lomboksql` | `cd typescript && npm pack --dry-run` (lulus lokal); publish dengan `--provenance` |
| crates.io | `lomboksql` | `cd rust && cargo publish --dry-run` (lulus lokal) |
| PyPI, Packagist, Go, Maven, NuGet | belum ada port | - |

Urutan: tag, CI hijau, `npm publish --provenance --access public`, `cargo publish`.

## 4-7. Server, Docker, shared hosting, lokal

Library tidak dideploy. Pemakaian lokal: `npm install ./typescript` atau `cargo add --path rust`.

## 8. Verifikasi

`lombok doctor docs` belum tersedia. Pemeriksaan manual setara:

```powershell
(Get-FileHash vectors\lomboksql-vectors-v1.json -Algorithm SHA256).Hash   # harus sama dengan hash di SPEC_
# pola grep frasa terlarang: PRINSIP_UNIVERSAL v3.6 bagian 5 ("Pola grep minimal"); hasilnya harus kosong
git ls-files | Select-String 'architecture|masterplan'   # harus kosong (ADR-024)
```
