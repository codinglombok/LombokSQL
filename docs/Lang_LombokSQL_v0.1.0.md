# Lang LombokSQL v0.1.0

## 1. i18n level

Level **E** (error messages and documentation only). The library produces no end-user text other than error messages; the generated SQL is not localized text. The source language of all messages and documentation is English.

## 2. Message ID catalog (normative)

Format `lomboksql.<kind>.<code>`. Catalog files: `locales/<bcp47>/lomboksql.json`, one file for all ports.

| ID | Source text (en) | Error code |
|---|---|---|
| `lomboksql.error.invalid_ast` | The query structure is invalid. | `invalid_ast` |
| `lomboksql.error.invalid_identifier` | An identifier is empty, contains a NUL character, or has an empty path part. | `invalid_identifier` |
| `lomboksql.error.invalid_dialect` | The SQL dialect is not supported. | `invalid_dialect` |
| `lomboksql.error.invalid_limit` | Limit and offset must be non-negative integers. | `invalid_limit` |
| `lomboksql.error.unsupported_feature` | This feature is not supported by the selected dialect. | `unsupported_feature` |
| `lomboksql.error.missing_where` | Update and delete require a condition or an explicit all flag. | `missing_where` |
| `lomboksql.error.too_deep` | The query is nested too deeply. | `too_deep` |

An error carries `code` (contract, the same in all ports) and `messageId`. The `message` field of the error object is in English and is not normative.

## 3. Current coverage

Core-20: 2 of 20 (`en`, `id`). Nusantara pack: 0 of 6. No other languages yet. Catalogs for additional languages must be reviewed by a native speaker before they are accepted.

## 4. How to add a language

1. Copy `locales/en/lomboksql.json` to `locales/<bcp47>/lomboksql.json`.
2. Translate the values; keys are not changed.
3. Ask a native speaker to review, then open a pull request.

## 5. Dependency on LombokLocale

None in 0.1.0. A consumer that uses LombokLocale can resolve `messageId` against the catalogs above.
