# Map LombokSQL v0.1.0

## 1. Dependency position

L0, cluster 03 (Formats, Parsers & Serialization), catalog number 03.11. No required Lombok dependencies.

## 2. Example dependents in the ecosystem

This section is the only place where application or framework names may appear (ADR-019). It is an illustration, not ownership; anyone can use LombokSQL.

| Dependent | Kind | Integration status | Notes |
|---|---|---|---|
| LombokClarion v3 | Framework | planned (F7) | Replaces the internal v2 persistence layer |
| LombokServer | L4 library | planned | Session and configuration storage |
| LombokAuth, LombokSecurity | L1/L2 libraries | planned | Token storage and audit trail |
| LombokDocFlow | Application | planned | Metadata storage |

LombokSQL's optional dependencies on other libraries (LombokJSON, LombokLog, LombokValidator) are not implemented yet.

## 3. Depends on

Nothing.

## 4. Normative contract path

`docs/SPEC_LombokSQL_v0.1.0.md` -> `vectors/lomboksql-vectors-v1.json` (sha256 in SPEC) -> runners `rust/tests/vectors.rs` and `typescript/test/vectors.test.ts`.

## 5. Folder map

See `structure_repo_LombokSQL_v0.1.0.md`.
