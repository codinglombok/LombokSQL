# Vectors

`lomboksql-vectors-v1.json` adalah kontrak uji lintas bahasa untuk LombokSQL.

- SHA-256: `39142d61f40466dc6afa4d312215ab2ea1dc59c432a8c78bcb61f51d75ef4164` (harus sama dengan `docs/SPEC_LombokSQL_v0.1.0.md`).
- Dibangkitkan oleh `scripts/gen-vectors.mjs`. Grup `golden`: ekspektasi PostgreSQL ditulis tangan, dialek lain diturunkan oleh transformasi string, sintaks yang berbeda ditulis tangan. Grup `generated-regression`: ekspektasi dari kompiler TypeScript dan dikonfirmasi port Rust.
- Setiap port yang diklaim MUST menjalankan seluruh kasus.
