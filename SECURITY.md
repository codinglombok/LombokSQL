# Security Policy

## Supported versions

| Version | Support |
|---|---|
| 0.1.x | Security fixes |

## Reporting a vulnerability

Use **GitHub Private Vulnerability Reporting** on this repository (Security tab, "Report a vulnerability"). Do not open a public issue for a vulnerability.

- Initial response: within 48 hours.
- Fix for critical findings: 7 days (target).
- Disclosure is coordinated with the reporter.

## Scope

In scope: the compiler (`compile`, `compile_json`, the Rust JSON parser), in particular any way for an attacker-controlled value or identifier to become part of the SQL unquoted, to bypass the nesting limit, or to cause a panic, crash or unbounded execution time.

Out of scope: the content of `raw` (trusted SQL written by the developer), the correctness of SQL against a specific database version that is not stated in `SPEC_`, and database drivers.

## Short threat model

See section 6 of the security-related documents in `docs/` and `docs/SPEC_LombokSQL_v0.1.0.md`.
