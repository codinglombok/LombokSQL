# Structure Repo LombokSQL v0.1.0

## 1. Folder structure

```
LombokSQL/
  README.md  CHANGELOG.md  SECURITY.md  CONTRIBUTING.md  version.txt
  LICENSE-APACHE  LICENSE-MIT  .gitignore  .gitattributes
  docs/            12 standard documents + TECH_DEBT.md (masterplan_ and architecture_ are not committed)
  vectors/         lomboksql-vectors-v1.json  README.md
  locales/         en/lomboksql.json  id/lomboksql.json
  rust/            Cargo.toml  src/lib.rs  tests/vectors.rs  LICENSE-*
  typescript/      package.json  tsconfig*.json  src/  test/
  integration/     package.json  run.mjs   (real execution: SQLite, PostgreSQL, MySQL, SQL Server; dev only)
  scripts/         gen-vectors.mjs  mutation-test.mjs  run-ts-tests.mjs
  .github/         workflows/ci.yml  dependabot.yml
```

## 2. Naming conventions

Documents: `<kind>_LombokSQL_v<semver>.md`. Packages: npm `lomboksql`, crates.io `lomboksql`. Go (planned): `github.com/codinglombok/lomboksql/go`.

## 3. Required root files

README, LICENSE-APACHE, LICENSE-MIT, CHANGELOG, SECURITY, CONTRIBUTING, `.gitignore` with the three ADR-024 lines, `.gitattributes` (LF line endings), `version.txt`.

## 4. Structure per port

| Port | Contents |
|---|---|
| `rust/` | One crate `lomboksql`; feature `std` (default); `tests/` is excluded from the crates.io package because it reads `../vectors` |
| `typescript/` | `src/compile.ts` (core), `src/builder.ts`, `src/index.ts`; `test/` is compiled to `dist-test/` |

## 5. Notes

`LICENSE-*` in `rust/` are copies of the root files so that they ship in the crate. `typescript/` copies the README and the licenses during `npm pack` (scripts `prepack`/`postpack`). Stray backup files (`*.bak`) must never be committed.
