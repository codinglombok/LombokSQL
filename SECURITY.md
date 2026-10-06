# Kebijakan Keamanan

## Versi yang didukung

| Versi | Dukungan |
|---|---|
| 0.1.x | Perbaikan keamanan |

## Melaporkan kerentanan

Gunakan **GitHub Private Vulnerability Reporting** pada repo ini (tab Security, "Report a vulnerability"). Jangan membuka issue publik untuk kerentanan.

- Respons awal: paling lama 48 jam.
- Perbaikan untuk temuan kritis: target 7 hari.
- Pengungkapan dikoordinasikan dengan pelapor.

## Cakupan

Dalam cakupan: kompiler (`compile`, `compile_json`, parser JSON Rust), khususnya cara apa pun agar nilai atau identifier yang dikendalikan penyerang menjadi bagian SQL yang tidak terkutip, melewati batas kedalaman, atau menyebabkan panic, crash, atau waktu eksekusi tak terbatas.

Di luar cakupan: isi `raw` (SQL tepercaya yang ditulis pengembang), kebenaran SQL terhadap versi database tertentu yang tidak dinyatakan di `SPEC_`, dan driver database.

## Model ancaman ringkas

Lihat bagian 6 pada dokumen `docs/` terkait keamanan dan `docs/SPEC_LombokSQL_v0.1.0.md`.
