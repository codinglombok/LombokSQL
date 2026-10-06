# Lang LombokSQL v0.1.0

## 1. Tingkat i18n

Tingkat **E** (pesan error dan dokumentasi saja). Library tidak menghasilkan teks untuk pengguna akhir selain pesan galat; SQL yang dihasilkan bukan teks yang dilokalkan.

## 2. Katalog ID pesan (normatif)

Format `lomboksql.<jenis>.<kode>`. Berkas katalog: `locales/<bcp47>/lomboksql.json`, satu berkas untuk semua port.

| ID | Teks sumber (en) | Kode galat |
|---|---|---|
| `lomboksql.error.invalid_ast` | The query structure is invalid. | `invalid_ast` |
| `lomboksql.error.invalid_identifier` | An identifier is empty, contains a NUL character, or has an empty path part. | `invalid_identifier` |
| `lomboksql.error.invalid_dialect` | The SQL dialect is not supported. | `invalid_dialect` |
| `lomboksql.error.invalid_limit` | Limit and offset must be non-negative integers. | `invalid_limit` |
| `lomboksql.error.unsupported_feature` | This feature is not supported by the selected dialect. | `unsupported_feature` |
| `lomboksql.error.missing_where` | Update and delete require a condition or an explicit all flag. | `missing_where` |
| `lomboksql.error.too_deep` | The query is nested too deeply. | `too_deep` |

Galat membawa `code` (kontrak, sama di semua port) dan `messageId`. Pesan `message` di objek galat berbahasa Inggris dan tidak bersifat normatif.

## 3. Cakupan saat ini

Core-20: 2 dari 20 (`en`, `id`). Paket Nusantara: 0 dari 6. Bahasa lain belum ada. Katalog bahasa tambahan harus ditinjau penutur asli sebelum diterima.

## 4. Cara menambah bahasa

1. Salin `locales/en/lomboksql.json` ke `locales/<bcp47>/lomboksql.json`.
2. Terjemahkan nilai; kunci tidak diubah.
3. Minta tinjauan penutur asli, lalu ajukan PR.

## 5. Ketergantungan LombokLocale

Tidak ada pada 0.1.0. Konsumen yang memakai LombokLocale dapat me-resolve `messageId` terhadap katalog di atas.
