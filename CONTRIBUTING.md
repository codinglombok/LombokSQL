# Berkontribusi

1. **Kontrak dulu.** Perubahan perilaku dimulai dari `docs/SPEC_LombokSQL_v0.1.0.md` dan `scripts/gen-vectors.mjs`, bukan dari kode.
2. **Test dulu.** Tambahkan kasus golden dengan ekspektasi PostgreSQL yang ditulis tangan. Dialek lain diturunkan oleh transformasi string di pembangkit; override tulis tangan hanya untuk sintaks yang memang berbeda.
3. **Semua port harus lulus.** Jalankan:

```bash
cd typescript && npm ci && npm test        # build + test TypeScript
node ../scripts/gen-vectors.mjs            # setelah mengubah vector; catat sha256 baru di SPEC
cd ../rust && cargo test && cargo build --no-default-features
node ../scripts/mutation-test.mjs          # semua mutan harus terbunuh
```

4. Perubahan vector mengubah hash di `SPEC_`; perbarui `SPEC_`, `CHANGELOG.md`, dan `API_` pada PR yang sama.
5. Pesan commit mengikuti Conventional Commits (`feat:`, `fix:`, `docs:`) dan bersifat fungsional.
6. Jangan menyertakan data nyata, nama klien, atau domain organisasi nyata di contoh, test, atau pesan commit; gunakan data sintetis dan domain `example.com`.
7. Dokumen berbahasa formal tanpa emoji.
