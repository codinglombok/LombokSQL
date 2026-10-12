# Tech Debt LombokSQL

Format: ID, finding, priority, fix, status. Priority P0 blocks the tag 0.1.0; P1 blocks a minor release.

| ID | Finding | Priority | Fix | Status |
|---|---|---|---|---|
| TD-01 | Real execution: SQLite 3.51, PostgreSQL 16 and MySQL 8.0 are tested (108 results, 6 mutants killed); SQL Server is not green yet; older minimum versions are untested | P0 | Confirm the `integration` CI job is green; complete TD-13; test the minimum versions (PostgreSQL 9.5-12, MySQL 5.7, SQLite 3.24/3.35) | PARTIAL |
| TD-02 | CI runs and is green on GitHub (run 37723054533): TypeScript 6/6, Rust 3/3, integration, mutation; only the optional `integration-mssql` is not. Actions pinned to SHAs, Dependabot active | P0 | - | DONE |
| TD-03 | `lombok doctor docs/privacy/style` does not exist yet (ecosystem TD-P0-08); manual checks only | P0 | Run it once `codinglombok/.github` exists; private client-term list | OPEN |
| TD-04 | TypeScript coverage 98.7% of lines (core `compile.ts` 100%), 90% gate in CI; Rust coverage not measured (no `cargo-llvm-cov` in the sandbox) | P1 | Add a `cargo-llvm-cov` job | PARTIAL |
| TD-05 | Fuzzing is not `cargo-fuzz`; no Rust fuzzing | P1 | A `cargo-fuzz` target for `compile_json` | OPEN |
| TD-06 | `no_std` is only proven by a host build | P1 | Build `thumbv7em-none-eabi` in CI (the CI step exists; its result has not been confirmed) | PARTIAL |
| TD-07 | Clippy and rustfmt | P1 | Pass locally on Rust 1.75 and 1.91; in CI (`-D warnings`) | DONE (green on GitHub) |
| TD-08 | Only Rust and TypeScript; Python, Go and PHP ports NOT YET | P1 | Planned for 0.2.0 | OPEN |
| TD-09 | The Rust JSON parser rejects ASTs deeper than 512 with `invalid_ast`, while TypeScript reports `too_deep` | P2 | Align them or document it in the vectors | PARTIAL (documented in SPEC 6) |
| TD-10 | The vector hash in SPEC was updated by hand | P2 | Checked automatically by `test/docs.test.ts` | DONE |
| TD-11 | Copies of `LICENSE-*` in `rust/` | P3 | Automate the copy at release time | OPEN |
| TD-12 | The 160 regression cases take their expectations from TypeScript (confirmed by the Rust port); only the 556 golden cases are independent | P3 | Manually review a sample of the regression cases | OPEN |
| TD-13 | The SQL Server job ran for the first time in CI: 29 of 36 scenarios passed, 7 failed because the fixture used the `text` type (not usable with COUNT DISTINCT, UPPER, `=` on SQL Server), not because of the generated SQL. The fixture has been fixed (`varchar(100)`); the re-run has not been confirmed | P1 | Re-run; when green, remove `continue-on-error` | PARTIAL |
| TD-14 | Minimum dialect versions (PostgreSQL 9.5, MySQL 5.7, SQLite 3.24/3.35/3.39, SQL Server 2012) come only from vendor documentation | P2 | A version matrix in CI | OPEN |
| TD-15 | Stray `README.md.bak` and `CHANGELOG.md.bak` files were committed to the repository | P1 | `git rm` them; `.bak` is now ignored by `.gitignore` | OPEN |
