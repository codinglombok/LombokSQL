# Structure Repo LombokSQL v0.1.0

## 1. Struktur folder

```
LombokSQL/
  README.md  CHANGELOG.md  SECURITY.md  CONTRIBUTING.md  version.txt
  LICENSE-APACHE  LICENSE-MIT  .gitignore
  docs/            12 dokumen standar + TECH_DEBT.md (masterplan_ dan architecture_ tidak di-commit)
  vectors/         lomboksql-vectors-v1.json  README.md
  locales/         en/lomboksql.json  id/lomboksql.json
  rust/            Cargo.toml  src/lib.rs  tests/vectors.rs  LICENSE-*
  typescript/      package.json  tsconfig*.json  src/  test/
  integration/     package.json  run.mjs   (eksekusi nyata: SQLite, PostgreSQL, MySQL, SQL Server; dev saja)
  scripts/         gen-vectors.mjs  mutation-test.mjs  run-ts-tests.mjs
  .github/workflows/  ci.yml
```

## 2. Konvensi penamaan

Dokumen: `<jenis>_LombokSQL_v<semver>.md`. Paket: npm `lomboksql`, crates.io `lomboksql`. Go (rencana): `github.com/codinglombok/lomboksql/go`.

## 3. Berkas wajib di root

README, LICENSE-APACHE, LICENSE-MIT, CHANGELOG, SECURITY, CONTRIBUTING, `.gitignore` dengan tiga baris ADR-024, `version.txt`.

## 4. Struktur per port

| Port | Isi |
|---|---|
| `rust/` | Satu crate `lomboksql`; fitur `std` (bawaan); `tests/` dikecualikan dari paket crates.io karena membaca `../vectors` |
| `typescript/` | `src/compile.ts` (inti), `src/builder.ts`, `src/index.ts`; `test/` dikompilasi ke `dist-test/` |

## 5. Catatan

`LICENSE-*` di `rust/` adalah salinan dari root agar ikut paket crate. `typescript/` menyalin README dan LICENSE saat `npm pack` (skrip `prepack`/`postpack`).
