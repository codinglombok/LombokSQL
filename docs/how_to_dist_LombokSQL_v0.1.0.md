# How To Dist LombokSQL v0.1.0

## 1. First upload (bootstrap)

The repository `codinglombok/LombokSQL` already exists. From a local folder containing this project:

```powershell
git init -b main
git add -A
git status            # check: docs/*architecture*, docs/*masterplan*, node_modules, target must NOT appear; no *.bak files
git commit -m "feat: LombokSQL v0.1.0 (AST to parameterized SQL compiler)"
git remote add origin https://github.com/codinglombok/LombokSQL.git
git push -u origin main
gh repo edit codinglombok/LombokSQL --add-topic lombok-ecosystem --add-topic cluster-03 --add-topic level-l0 --add-topic sql --add-topic rust --add-topic typescript --description "Universal SQL query compiler: one JSON AST to parameterized SQL for PostgreSQL, MySQL, SQLite and SQL Server. Part of the Lombok Ecosystem."
```

Do not create a release tag at this stage; see the conditions in `TECH_DEBT.md`.

## 2. Regular release flow

Target (ADR-011): release-please opens a release PR; merging the PR creates the tag `vX.Y.Z`; publishing reads the version from the tag. The reusable workflow `codinglombok/.github` does not exist yet (TD-P0-08), so `ci.yml` in this repository is self-contained for now.

## 3. Publishing per registry

| Registry | Package | Pre-publish check |
|---|---|---|
| npm | `lomboksql` | `cd typescript && npm pack --dry-run` (passes locally); publish with `--provenance` |
| crates.io | `lomboksql` | `cd rust && cargo publish --dry-run` (passes locally) |
| PyPI, Packagist, Go, Maven, NuGet | no port yet | - |

Order: tag, green CI, `npm publish --provenance --access public`, `cargo publish`.

## 4-7. Server, Docker, shared hosting, local

A library is not deployed. Local use: `npm install ./typescript` or `cargo add --path rust`.

## 8. Verification

`lombok doctor docs` is not available yet. Equivalent manual checks:

```powershell
(Get-FileHash vectors\lomboksql-vectors-v1.json -Algorithm SHA256).Hash   # must equal the hash in SPEC_
# forbidden-phrase grep patterns: PRINSIP_UNIVERSAL v3.6 section 5 ("Pola grep minimal"); the result must be empty
git ls-files | Select-String 'architecture|masterplan'   # must be empty (ADR-024)
git ls-files | Select-String '\.bak$'                    # must be empty
```
