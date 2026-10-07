# SPEC LombokSQL v0.1.0

This document is the normative cross-language contract. Every language port MUST produce byte-identical output for all specified inputs. Deviations from this specification are bugs.

Key words MUST, MUST NOT, SHOULD and MAY are interpreted as in RFC 2119 and RFC 8174.

| Atribut | Nilai |
|---|---|
| Versi kontrak | 0.1.0 |
| Tanggal tinjauan standar acuan | 2026-10-06 |
| Vector | `vectors/lomboksql-vectors-v1.json` |
| SHA-256 vector | `39142d61f40466dc6afa4d312215ab2ea1dc59c432a8c78bcb61f51d75ef4164` |

## 0. Standar acuan (U2)

| Acuan | Versi | Pemakaian |
|---|---|---|
| RFC 8259 | Desember 2017 | Sintaks JSON AST dan parameter |
| RFC 2119, RFC 8174 | 1997, 2017 | Kata kunci normatif |
| Unicode | 16.0 | Identifier dan nilai dihitung per code point; hanya urutan scalar value yang sah |
| ISO/IEC 9075 (SQL:2023) | 2023 | Acuan semantik umum `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `JOIN`, `BETWEEN`, `IN`, `EXISTS` |

Versi minimum dialek (diambil dari dokumentasi vendor; **belum diuji satu per satu**. Yang dieksekusi di `integration/`: SQLite 3.51.2, PostgreSQL 16.15, MySQL 8.0.46; SQL Server belum, lihat bagian 8):

| Dialek | Versi minimum untuk fitur terkait |
|---|---|
| `postgres` | 9.5 (`ON CONFLICT`); `ILIKE`, `RETURNING` tersedia sejak lama |
| `mysql` | 5.7 atau 8.0 (`ON DUPLICATE KEY UPDATE ... VALUES()`, `INSERT IGNORE`); `FULL JOIN` tidak didukung |
| `sqlite` | 3.24 (upsert), 3.35 (`RETURNING`), 3.39 (`RIGHT`/`FULL JOIN`) |
| `mssql` | 2012 (`OFFSET ... FETCH`); upsert dan `RETURNING` tidak didukung di 0.1.0 |

## 1. Vector

Berkas `vectors/lomboksql-vectors-v1.json` memuat objek `{ format, specVersion, note, groups }`. Setiap grup memuat `cases`; setiap kasus memuat `name`, `dialect`, `ast`, dan `expect`. `expect` berbentuk `{ "sql": string, "params": array }` atau `{ "error": code }`. Setiap port yang diklaim MUST menjalankan seluruh kasus dan MUST menghasilkan `sql` yang sama persis (byte demi byte), `params` yang sama persis (nilai dan urutan), atau `code` galat yang sama. Hash SHA-256 berkas di atas MUST sama dengan hash di tabel atribut; perubahan vector MUST memperbarui hash ini. Angka di `params` pada vector dinormalisasi (tanpa eksponen, tanpa nol di belakang); perilaku untuk penulisan angka lain tidak dispesifikasikan.

## 2. Antarmuka

`compile(ast, dialect) -> { sql: string, params: array }` atau galat. `dialect` MUST salah satu dari `postgres`, `mysql`, `sqlite`, `mssql`; selain itu galat `invalid_dialect`, dan pemeriksaan ini MUST dilakukan sebelum AST diperiksa. Fungsi MUST murni: tidak ada I/O, keadaan global, atau keacakan. `sql` tidak memuat titik koma penutup. `params` hanya berisi skalar JSON (`null`, boolean, angka, string).

Port MAY menyediakan antarmuka tambahan (builder, `compile_json`), tetapi keluarannya MUST sama dengan `compile` untuk AST yang setara.

## 3. Model AST

AST adalah nilai JSON. Objek yang dibaca dengan kunci duplikat MUST memakai kemunculan terakhir. Kunci tak dikenal MUST diabaikan. Sebuah kunci dianggap ada bila ada dan nilainya bukan `undefined` (di JSON: ada); nilai `null` pada kunci opsional diperlakukan sebagai ada dan berlaku aturan tipe kunci tersebut.

### 3.1 Pernyataan

| `type` | Kunci |
|---|---|
| `select` | `from` (wajib), `columns`, `distinct`, `joins`, `where`, `groupBy`, `having`, `orderBy`, `limit`, `offset` |
| `insert` | `into`, `columns`, `rows` (wajib semua), `onConflict`, `returning` |
| `update` | `table`, `set` (wajib), `where`, `all`, `returning` |
| `delete` | `from` (wajib), `where`, `all`, `returning` |

`type` yang bukan string atau tidak dikenal MUST menghasilkan `invalid_ast`.

### 3.2 Ekspresi

Ekspresi adalah string atau objek. String adalah referensi kolom (bagian 4.1). Objek MUST memiliki **tepat satu** dari kunci `col`, `value`, `raw`, `fn`, `query`; selain itu `invalid_ast`.

| Bentuk | Aturan keluaran |
|---|---|
| `{col: s}` | `quotePath(s)` |
| `{value: x}` | `x` MUST skalar (selain itu `invalid_ast`); dilekatkan ke `params` dan keluaran adalah placeholder |
| `{raw: s, params: [...]}` | `s` string tidak kosong; setiap `?` pada `s` (tanpa pengecualian) diganti placeholder dan param berikutnya di `params`; jumlah `?` MUST sama dengan panjang `params` (default `[]`); setiap param MUST skalar |
| `{fn: name, args: [...], distinct: bool}` | `name` MUST cocok `^[A-Za-z_][A-Za-z0-9_.]*$`; keluaran `UPPER(name) + "(" + ("DISTINCT " bila distinct) + args dipisah ", " + ")"`; `args` default `[]` |
| `{query: select}` | `"(" + select + ")"` |

`as` pada ekspresi hanya berlaku pada daftar `columns` dan `returning`: keluaran ditambah `" AS " + quotePart(as)`. Di tempat lain `as` MUST diabaikan.

### 3.3 Kondisi

Kondisi adalah objek dengan `op` string. Hasil kompilasi sebuah kondisi memiliki jenis `and`, `or`, atau `atom`.

| `op` | Kunci | Keluaran (jenis) |
|---|---|---|
| `and`, `or` | `conds` (array, wajib) | Anak dikompilasi berurutan. 0 anak: `1 = 1` (`and`) atau `1 = 0` (`or`), jenis atom. 1 anak: hasil anak itu apa adanya (jenis anak). Selain itu anak digabung `" AND "`/`" OR "`; anak berjenis `and`/`or` yang berbeda dari induk MUST dibungkus `(...)`; anak atom atau sejenis tidak dibungkus. Jenis hasil = op induk |
| `not` | `cond` | `NOT (` anak `)`, atom |
| `eq` `ne` `gt` `gte` `lt` `lte` | `left`, `right` | `left SYM right` dengan SYM `=`, `<>`, `>`, `>=`, `<`, `<=`; atom |
| `like`, `notLike` | `left`, `right` | `LIKE` / `NOT LIKE`; atom |
| `ilike`, `notIlike` | `left`, `right` | `postgres`: `ILIKE` / `NOT ILIKE`. Dialek lain: `LOWER(left) LIKE LOWER(right)` / `LOWER(left) NOT LIKE LOWER(right)` |
| `in`, `notIn` | `left` dan (`values` array **atau** `query`) | Bila `query` ada: `left IN (select)`. Bila tidak: `values` array wajib; kosong menghasilkan `1 = 0` (`in`) atau `1 = 1` (`notIn`) **tanpa** mengompilasi `left`; selain itu `left IN (v1, v2, ...)` |
| `between`, `notBetween` | `left`, `low`, `high` | `left BETWEEN low AND high` / `NOT BETWEEN` |
| `isNull`, `isNotNull` | `left` | `left IS NULL` / `IS NOT NULL` |
| `exists`, `notExists` | `query` | `EXISTS (select)` / `NOT EXISTS (select)` |
| `raw` | `sql`, `params` | aturan `raw` bagian 3.2; atom |

Operan kondisi adalah ekspresi (bagian 3.2). Kunci wajib yang hilang MUST `invalid_ast`. Op tak dikenal MUST `invalid_ast`.

### 3.4 Tabel

`from` pada `select` dan `table` pada join adalah string (`quotePath`) atau objek: `{name, as?}` keluaran `quotePath(name)` dan `" AS " + quotePart(as)` bila ada; atau `{query, as}` keluaran `"(" + select + ") AS " + quotePart(as)` (`as` wajib). `into`, `table` (update), dan `from` (delete) MUST string biasa dan dikutip dengan `quotePath`.

### 3.5 Select

Keluaran dirangkai berurutan dan dipisah satu spasi:

1. `SELECT`, lalu `DISTINCT` bila `distinct` true (`distinct` bukan boolean: `invalid_ast`).
2. Kolom: bila `columns` kosong atau tidak ada: `*`; selain itu ekspresi dipisah `", "` (alias diizinkan).
3. `FROM` tabel.
4. Setiap join: `KIND JOIN tabel` lalu `ON kondisi`. `kind` default `inner`; nilai sah `inner`, `left`, `right`, `full`, `cross` (huruf kecil), huruf besar di keluaran. `cross` MUST tanpa `on`; lainnya MUST punya `on`. `full` pada `mysql` MUST `unsupported_feature`.
5. `WHERE kondisi`, bila ada. Kondisi tingkat atas tidak dibungkus kurung.
6. `GROUP BY` ekspresi (bila array tidak kosong).
7. `HAVING kondisi`.
8. `ORDER BY`: setiap butir adalah ekspresi atau `{expr, dir}` (`dir` `asc`|`desc`, default asc, selain itu `invalid_ast`). Keluaran selalu `ekspresi ASC|DESC`. Butir objek yang memiliki kunci `expr` ditafsirkan sebagai `{expr, dir}`.
9. Paginasi (bagian 5).

Urutan pelekatan parameter MUST mengikuti urutan kemunculan placeholder di `sql` (kiri ke kanan); implementasi MUST mengompilasi bagian sesuai urutan 2 sampai 8.

### 3.6 Insert

`INSERT INTO tabel (kolom, ...) VALUES (sel, ...), (sel, ...)` ditambah klausa konflik dan `RETURNING`. `columns` array string tidak kosong, setiap nama dikutip dengan `quotePart` (satu nama, titik tidak dipecah). `rows` array tidak kosong; setiap baris array ekspresi dengan panjang sama dengan `columns` (selain itu `invalid_ast`). `onConflict` objek dengan **tepat satu** dari `doNothing: true` atau `update: [kolom, ...]`; `target` array nama kolom opsional.

| Dialek | `doNothing` | `update` |
|---|---|---|
| `postgres`, `sqlite` | ` ON CONFLICT (target) DO NOTHING` (tanpa `(target)` bila target tidak ada) | ` ON CONFLICT (target) DO UPDATE SET "c" = EXCLUDED."c", ...`; `target` MUST ada dan tidak kosong |
| `mysql` | awalan `INSERT IGNORE INTO`; `target` diabaikan | ` ON DUPLICATE KEY UPDATE `c` = VALUES(`c`), ...`; `target` diabaikan |
| `mssql` | `unsupported_feature` | `unsupported_feature` |

### 3.7 Update dan Delete

`UPDATE tabel SET "c" = ekspresi, ...`: `set` array tidak kosong berisi `{col, expr}` terurut; nama kolom dikutip `quotePart`. `DELETE FROM tabel`. Untuk keduanya: bila `where` ada keluaran ` WHERE kondisi`; bila `where` tidak ada, `all` MUST `true`, selain itu galat `missing_where`. `all` yang bukan boolean MUST `invalid_ast`. Bila `where` ada, `all` tidak berpengaruh.

### 3.8 Returning

`returning` array ekspresi (alias diizinkan); array kosong atau tidak ada tidak menghasilkan apa pun. Pada `postgres` dan `sqlite`: ` RETURNING ekspresi, ...`; pada dialek lain dengan array tidak kosong MUST `unsupported_feature`.

## 4. Pengutipan dan placeholder

### 4.1 Identifier

`quotePart(s)`: `s` MUST tidak kosong dan tidak mengandung U+0000 (selain itu `invalid_identifier`). `postgres`/`sqlite`: `"` + s dengan `"` digandakan + `"`. `mysql`: `` ` `` + s dengan `` ` `` digandakan + `` ` ``. `mssql`: `[` + s dengan `]` digandakan + `]`.

`quotePath(s)`: `s` dipecah pada setiap `.` (sehingga `a..b`, `.a`, `a.` menghasilkan bagian kosong dan `invalid_identifier`); setiap bagian dikutip dengan `quotePart`, kecuali bagian `*` yang merupakan bagian **terakhir**, yang ditulis `*` tanpa kutip. Bagian `*` di posisi lain dikutip biasa.

### 4.2 Placeholder

Parameter dinomori 1, 2, ... menurut urutan pelekatan. `postgres`: `$n`. `sqlite`, `mysql`: `?`. `mssql`: `@pn`.

## 5. Paginasi

`limit` dan `offset` MUST bilangan bulat tak negatif dan paling besar 9007199254740991 (selain itu `invalid_limit`; bukan angka, misalnya string atau `null`, juga `invalid_limit`). Keduanya ditulis langsung (bukan parameter).

| Dialek | Keluaran |
|---|---|
| `postgres` | ` LIMIT n` bila limit; ` OFFSET m` bila offset |
| `sqlite` | seperti postgres; bila hanya offset: ` LIMIT -1 OFFSET m` |
| `mysql` | seperti postgres; bila hanya offset: ` LIMIT 18446744073709551615 OFFSET m` |
| `mssql` | bila tidak ada `ORDER BY`: ` ORDER BY (SELECT NULL)`; lalu ` OFFSET m ROWS` (m=0 bila tak ada offset); lalu ` FETCH NEXT n ROWS ONLY` bila limit |

## 6. Keamanan

- Nilai (`value`, param `raw`) MUST tidak pernah menjadi bagian teks `sql`.
- Identifier MUST selalu dikutip; satu-satunya pengecualian adalah `*` terakhir dan fungsi (`fn`, yang divalidasi regex) dan `raw` (SQL tepercaya).
- Kedalaman: ekspresi, kondisi, dan select bersarang MUST dibatasi 64 tingkat (kedalaman 0 untuk pernyataan; setiap panggilan bersarang menambah 1; kedalaman > 64 adalah `too_deep`). Implementasi MUST tidak mengalami kehabisan stack pada masukan apa pun yang secara sintaks sah.
- Port yang menerima teks JSON MUST membatasi kedalaman parser (port Rust: 512) dan memetakan galat sintaks ke `invalid_ast`.
- Masukan apa pun MUST menghasilkan hasil atau galat dengan `code` pada bagian 7; panic atau pengecualian lain adalah bug.

## 7. Galat

| `code` | Kondisi | `messageId` |
|---|---|---|
| `invalid_ast` | bentuk atau tipe AST salah, kunci wajib hilang, pilihan tak dikenal, JSON tidak sah | `lomboksql.error.invalid_ast` |
| `invalid_identifier` | identifier kosong, mengandung NUL, atau bagian jalur kosong | `lomboksql.error.invalid_identifier` |
| `invalid_dialect` | dialek tidak dikenal (peka huruf) | `lomboksql.error.invalid_dialect` |
| `invalid_limit` | `limit`/`offset` bukan bilangan bulat 0..9007199254740991 | `lomboksql.error.invalid_limit` |
| `unsupported_feature` | fitur tidak ada pada dialek | `lomboksql.error.unsupported_feature` |
| `missing_where` | update/delete tanpa `where` dan tanpa `all: true` | `lomboksql.error.missing_where` |
| `too_deep` | kedalaman > 64 | `lomboksql.error.too_deep` |

Bila beberapa galat berlaku sekaligus, galat yang dilaporkan adalah galat pertama dalam urutan evaluasi bagian 3 (dialek lebih dulu, lalu urutan pengompilasian). Urutan insert: `into`, `columns`, `rows` (baris demi baris), `onConflict`, `returning`; update: `table`, `set`, `where`/`all`, `returning`; delete: `from`, `where`/`all`, `returning`.

## 8. Non-goals (0.1.0)

`UNION`/`INTERSECT`, CTE, window function, DDL, `NULLS FIRST/LAST`, `MERGE`, `RETURNING`/`OUTPUT` untuk MySQL dan SQL Server, validasi isi `raw`, validasi terhadap skema database, dan eksekusi. Kebenaran SQL terhadap mesin database sungguhan diuji pada SQLite, PostgreSQL, dan MySQL (`integration/`); SQL Server belum pernah dijalankan.

## 9. Riwayat perubahan kontrak

| Versi | Perubahan |
|---|---|
| 0.1.0 | Kontrak awal |
