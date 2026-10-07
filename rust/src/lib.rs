//! LombokSQL core (Rust reference, `no_std + alloc`, zero dependencies).
//!
//! Compiles the normative JSON AST (see `docs/SPEC_LombokSQL_v0.1.0.md`) into SQL text plus
//! ordered parameters for PostgreSQL, MySQL, SQLite and SQL Server. Output is byte-identical
//! to the other ports for every vector in `vectors/lomboksql-vectors-v1.json`.
#![cfg_attr(not(feature = "std"), no_std)]
#![forbid(unsafe_code)]

extern crate alloc;

use alloc::format;
use alloc::string::{String, ToString};
use alloc::vec::Vec;

const MAX_DEPTH: usize = 64;
const MAX_SAFE: f64 = 9007199254740991.0;
const MAX_JSON_DEPTH: usize = 512;

/// Error with a canonical `code` (contract) and a human message (English).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Error {
    pub code: &'static str,
    pub message: String,
}

impl Error {
    fn new(code: &'static str, message: &str) -> Self {
        Error {
            code,
            message: message.to_string(),
        }
    }
    /// Stable message id for translation through LombokLocale.
    pub fn message_id(&self) -> String {
        format!("lomboksql.error.{}", self.code)
    }
}

#[cfg(feature = "std")]
impl std::error::Error for Error {}

impl core::fmt::Display for Error {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        write!(f, "{}: {}", self.code, self.message)
    }
}

type Res<T> = Result<T, Error>;

fn bad<T>(m: &str) -> Res<T> {
    Err(Error::new("invalid_ast", m))
}

/// Dynamic JSON value. Numbers keep their original lexeme so output never reformats them.
#[derive(Debug, Clone, PartialEq)]
pub enum Value {
    Null,
    Bool(bool),
    Num(String),
    Str(String),
    Arr(Vec<Value>),
    Obj(Vec<(String, Value)>),
}

impl Value {
    /// Last matching key wins (same as `JSON.parse`).
    pub fn get(&self, k: &str) -> Option<&Value> {
        match self {
            Value::Obj(m) => m.iter().rev().find(|(kk, _)| kk == k).map(|(_, v)| v),
            _ => None,
        }
    }
    fn is_obj(&self) -> bool {
        matches!(self, Value::Obj(_))
    }
    /// Compact JSON text.
    pub fn to_json(&self) -> String {
        let mut s = String::new();
        self.write_json(&mut s);
        s
    }
    fn write_json(&self, out: &mut String) {
        match self {
            Value::Null => out.push_str("null"),
            Value::Bool(b) => out.push_str(if *b { "true" } else { "false" }),
            Value::Num(n) => out.push_str(n),
            Value::Str(s) => write_str(s, out),
            Value::Arr(a) => {
                out.push('[');
                for (i, v) in a.iter().enumerate() {
                    if i > 0 {
                        out.push(',');
                    }
                    v.write_json(out);
                }
                out.push(']');
            }
            Value::Obj(m) => {
                out.push('{');
                for (i, (k, v)) in m.iter().enumerate() {
                    if i > 0 {
                        out.push(',');
                    }
                    write_str(k, out);
                    out.push(':');
                    v.write_json(out);
                }
                out.push('}');
            }
        }
    }
}

fn write_str(s: &str, out: &mut String) {
    out.push('"');
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
}

// ---------------------------------------------------------------- JSON parser

struct Parser<'a> {
    b: &'a [u8],
    i: usize,
}

/// Parse JSON text into a [`Value`] (depth limit 512). Errors use code `invalid_ast`.
pub fn parse_json(s: &str) -> Res<Value> {
    let mut p = Parser {
        b: s.as_bytes(),
        i: 0,
    };
    p.ws();
    let v = p.value(0)?;
    p.ws();
    if p.i != p.b.len() {
        return bad("trailing characters after JSON value");
    }
    Ok(v)
}

impl Parser<'_> {
    fn ws(&mut self) {
        while self.i < self.b.len() && matches!(self.b[self.i], b' ' | b'\t' | b'\n' | b'\r') {
            self.i += 1;
        }
    }
    fn peek(&self) -> Option<u8> {
        self.b.get(self.i).copied()
    }
    fn lit(&mut self, word: &str, v: Value) -> Res<Value> {
        if self.b[self.i..].starts_with(word.as_bytes()) {
            self.i += word.len();
            Ok(v)
        } else {
            bad("invalid JSON literal")
        }
    }
    fn value(&mut self, depth: usize) -> Res<Value> {
        if depth > MAX_JSON_DEPTH {
            return bad("JSON nesting too deep");
        }
        match self.peek() {
            None => bad("unexpected end of JSON"),
            Some(b'n') => self.lit("null", Value::Null),
            Some(b't') => self.lit("true", Value::Bool(true)),
            Some(b'f') => self.lit("false", Value::Bool(false)),
            Some(b'"') => Ok(Value::Str(self.string()?)),
            Some(b'[') => {
                self.i += 1;
                let mut a = Vec::new();
                self.ws();
                if self.peek() == Some(b']') {
                    self.i += 1;
                    return Ok(Value::Arr(a));
                }
                loop {
                    self.ws();
                    a.push(self.value(depth + 1)?);
                    self.ws();
                    match self.peek() {
                        Some(b',') => self.i += 1,
                        Some(b']') => {
                            self.i += 1;
                            return Ok(Value::Arr(a));
                        }
                        _ => return bad("expected , or ] in array"),
                    }
                }
            }
            Some(b'{') => {
                self.i += 1;
                let mut m = Vec::new();
                self.ws();
                if self.peek() == Some(b'}') {
                    self.i += 1;
                    return Ok(Value::Obj(m));
                }
                loop {
                    self.ws();
                    if self.peek() != Some(b'"') {
                        return bad("expected string key");
                    }
                    let k = self.string()?;
                    self.ws();
                    if self.peek() != Some(b':') {
                        return bad("expected :");
                    }
                    self.i += 1;
                    self.ws();
                    let v = self.value(depth + 1)?;
                    m.push((k, v));
                    self.ws();
                    match self.peek() {
                        Some(b',') => self.i += 1,
                        Some(b'}') => {
                            self.i += 1;
                            return Ok(Value::Obj(m));
                        }
                        _ => return bad("expected , or } in object"),
                    }
                }
            }
            Some(c) if c == b'-' || c.is_ascii_digit() => self.number(),
            Some(_) => bad("unexpected character in JSON"),
        }
    }
    fn number(&mut self) -> Res<Value> {
        let start = self.i;
        if self.peek() == Some(b'-') {
            self.i += 1;
        }
        match self.peek() {
            Some(b'0') => self.i += 1,
            Some(c) if c.is_ascii_digit() => {
                while matches!(self.peek(), Some(c) if c.is_ascii_digit()) {
                    self.i += 1;
                }
            }
            _ => return bad("invalid number"),
        }
        if self.peek() == Some(b'.') {
            self.i += 1;
            if !matches!(self.peek(), Some(c) if c.is_ascii_digit()) {
                return bad("invalid number");
            }
            while matches!(self.peek(), Some(c) if c.is_ascii_digit()) {
                self.i += 1;
            }
        }
        if matches!(self.peek(), Some(b'e') | Some(b'E')) {
            self.i += 1;
            if matches!(self.peek(), Some(b'+') | Some(b'-')) {
                self.i += 1;
            }
            if !matches!(self.peek(), Some(c) if c.is_ascii_digit()) {
                return bad("invalid number");
            }
            while matches!(self.peek(), Some(c) if c.is_ascii_digit()) {
                self.i += 1;
            }
        }
        // slice boundaries are ASCII, hence valid UTF-8
        Ok(Value::Num(
            String::from_utf8_lossy(&self.b[start..self.i]).into_owned(),
        ))
    }
    fn hex4(&mut self) -> Res<u32> {
        if self.i + 4 > self.b.len() {
            return bad("bad \\u escape");
        }
        let mut n = 0u32;
        for k in 0..4 {
            let c = self.b[self.i + k];
            let d = match c {
                b'0'..=b'9' => c - b'0',
                b'a'..=b'f' => c - b'a' + 10,
                b'A'..=b'F' => c - b'A' + 10,
                _ => return bad("bad \\u escape"),
            };
            n = n * 16 + d as u32;
        }
        self.i += 4;
        Ok(n)
    }
    fn string(&mut self) -> Res<String> {
        self.i += 1; // opening quote
        let mut out: Vec<u8> = Vec::new();
        loop {
            let c = match self.peek() {
                None => return bad("unterminated string"),
                Some(c) => c,
            };
            self.i += 1;
            match c {
                b'"' => break,
                b'\\' => {
                    let e = match self.peek() {
                        None => return bad("unterminated escape"),
                        Some(e) => e,
                    };
                    self.i += 1;
                    let ch: char = match e {
                        b'"' => '"',
                        b'\\' => '\\',
                        b'/' => '/',
                        b'b' => '\u{8}',
                        b'f' => '\u{c}',
                        b'n' => '\n',
                        b'r' => '\r',
                        b't' => '\t',
                        b'u' => {
                            let hi = self.hex4()?;
                            if (0xD800..0xDC00).contains(&hi) {
                                if self.b[self.i..].starts_with(b"\\u") {
                                    self.i += 2;
                                    let lo = self.hex4()?;
                                    if !(0xDC00..0xE000).contains(&lo) {
                                        return bad("invalid surrogate pair");
                                    }
                                    let cp = 0x10000 + ((hi - 0xD800) << 10) + (lo - 0xDC00);
                                    match char::from_u32(cp) {
                                        Some(c) => c,
                                        None => return bad("invalid code point"),
                                    }
                                } else {
                                    return bad("lone surrogate");
                                }
                            } else if (0xDC00..0xE000).contains(&hi) {
                                return bad("lone surrogate");
                            } else {
                                match char::from_u32(hi) {
                                    Some(c) => c,
                                    None => return bad("invalid code point"),
                                }
                            }
                        }
                        _ => return bad("invalid escape"),
                    };
                    let mut buf = [0u8; 4];
                    out.extend_from_slice(ch.encode_utf8(&mut buf).as_bytes());
                }
                c if c < 0x20 => return bad("control character in string"),
                c => out.push(c),
            }
        }
        match String::from_utf8(out) {
            Ok(s) => Ok(s),
            Err(_) => bad("invalid UTF-8"),
        }
    }
}

// ------------------------------------------------------------------- compiler

/// Target SQL dialect.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Dialect {
    Postgres,
    Mysql,
    Sqlite,
    Mssql,
}

impl Dialect {
    pub fn parse(s: &str) -> Res<Dialect> {
        match s {
            "postgres" => Ok(Dialect::Postgres),
            "mysql" => Ok(Dialect::Mysql),
            "sqlite" => Ok(Dialect::Sqlite),
            "mssql" => Ok(Dialect::Mssql),
            _ => Err(Error::new(
                "invalid_dialect",
                &format!("unknown dialect: {}", s),
            )),
        }
    }
}

/// Compilation result: SQL text and ordered scalar parameters.
#[derive(Debug, Clone, PartialEq)]
pub struct Compiled {
    pub sql: String,
    pub params: Vec<Value>,
}

impl Compiled {
    /// Parameters as a compact JSON array.
    pub fn params_json(&self) -> String {
        Value::Arr(self.params.clone()).to_json()
    }
}

struct Ctx {
    d: Dialect,
    params: Vec<Value>,
}

struct CondOut {
    sql: String,
    kind: Kind,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Kind {
    And,
    Or,
    Atom,
}

fn fail<T>(code: &'static str, m: &str) -> Res<T> {
    Err(Error::new(code, m))
}

fn has<'v>(o: &'v Value, k: &str) -> Option<&'v Value> {
    o.get(k)
}

fn str_of<'v>(v: &'v Value, what: &str) -> Res<&'v str> {
    match v {
        Value::Str(s) => Ok(s.as_str()),
        _ => bad(&format!("{} must be a string", what)),
    }
}

fn arr_of<'v>(v: &'v Value, what: &str) -> Res<&'v [Value]> {
    match v {
        Value::Arr(a) => Ok(a.as_slice()),
        _ => bad(&format!("{} must be an array", what)),
    }
}

fn opt_bool(o: &Value, k: &str) -> Res<bool> {
    match has(o, k) {
        None => Ok(false),
        Some(Value::Bool(b)) => Ok(*b),
        Some(_) => bad(&format!("{} must be a boolean", k)),
    }
}

fn is_scalar(v: &Value) -> bool {
    matches!(
        v,
        Value::Null | Value::Bool(_) | Value::Num(_) | Value::Str(_)
    )
}

fn check_depth(depth: usize) -> Res<()> {
    if depth > MAX_DEPTH {
        fail("too_deep", "AST nesting exceeds 64 levels")
    } else {
        Ok(())
    }
}

fn valid_fn_name(s: &str) -> bool {
    let mut it = s.chars();
    match it.next() {
        Some(c) if c.is_ascii_alphabetic() || c == '_' => {}
        _ => return false,
    }
    it.all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '.')
}

fn quote_part(d: Dialect, s: &str) -> Res<String> {
    if s.is_empty() || s.contains('\0') {
        return fail("invalid_identifier", "identifier is empty or contains NUL");
    }
    Ok(match d {
        Dialect::Mysql => format!("`{}`", s.replace('`', "``")),
        Dialect::Mssql => format!("[{}]", s.replace(']', "]]")),
        _ => format!("\"{}\"", s.replace('"', "\"\"")),
    })
}

fn quote_path(d: Dialect, s: &str) -> Res<String> {
    let parts: Vec<&str> = s.split('.').collect();
    let mut out = String::new();
    for (i, p) in parts.iter().enumerate() {
        if i > 0 {
            out.push('.');
        }
        if *p == "*" && i == parts.len() - 1 {
            out.push('*');
        } else {
            out.push_str(&quote_part(d, p)?);
        }
    }
    Ok(out)
}

impl Ctx {
    fn placeholder(&mut self, v: &Value) -> String {
        self.params.push(v.clone());
        let n = self.params.len();
        match self.d {
            Dialect::Postgres => format!("${}", n),
            Dialect::Mssql => format!("@p{}", n),
            _ => "?".to_string(),
        }
    }

    fn raw_sql(&mut self, sql: Option<&Value>, params: Option<&Value>) -> Res<String> {
        let text = match sql {
            Some(v) => str_of(v, "raw")?,
            None => return bad("raw must be a string"),
        };
        if text.is_empty() {
            return bad("raw must not be empty");
        }
        let list: &[Value] = match params {
            None => &[],
            Some(p) => arr_of(p, "params")?,
        };
        let mut out = String::new();
        let mut i = 0usize;
        for ch in text.chars() {
            if ch == '?' {
                if i >= list.len() {
                    return bad("raw has more placeholders than params");
                }
                let v = &list[i];
                i += 1;
                if !is_scalar(v) {
                    return bad("raw param must be a scalar");
                }
                let ph = self.placeholder(v);
                out.push_str(&ph);
            } else {
                out.push(ch);
            }
        }
        if i != list.len() {
            return bad("raw has fewer placeholders than params");
        }
        Ok(out)
    }

    fn expr(&mut self, e: &Value, depth: usize, alias_ok: bool) -> Res<String> {
        check_depth(depth)?;
        if let Value::Str(s) = e {
            return quote_path(self.d, s);
        }
        if !e.is_obj() {
            return bad("expression must be a string or an object");
        }
        let present: Vec<&str> = ["col", "value", "raw", "fn", "query"]
            .iter()
            .copied()
            .filter(|k| has(e, k).is_some())
            .collect();
        if present.len() != 1 {
            return bad("expression needs exactly one of col, value, raw, fn, query");
        }
        let mut out: String = match present[0] {
            "col" => quote_path(
                self.d,
                str_of(has(e, "col").unwrap_or(&Value::Null), "col")?,
            )?,
            "value" => {
                let v = has(e, "value").unwrap_or(&Value::Null);
                if !is_scalar(v) {
                    return bad("value must be a scalar");
                }
                self.placeholder(v)
            }
            "raw" => self.raw_sql(has(e, "raw"), has(e, "params"))?,
            "fn" => {
                let name = str_of(has(e, "fn").unwrap_or(&Value::Null), "fn")?;
                if !valid_fn_name(name) {
                    return bad("invalid function name");
                }
                let distinct = opt_bool(e, "distinct")?;
                let args: &[Value] = match has(e, "args") {
                    Some(a) => arr_of(a, "args")?,
                    None => &[],
                };
                let mut list: Vec<String> = Vec::new();
                for a in args {
                    list.push(self.expr(a, depth + 1, false)?);
                }
                format!(
                    "{}({}{})",
                    name.to_ascii_uppercase(),
                    if distinct { "DISTINCT " } else { "" },
                    list.join(", ")
                )
            }
            _ => {
                let q = has(e, "query").unwrap_or(&Value::Null);
                format!("({})", self.select(q, depth + 1)?)
            }
        };
        if alias_ok {
            if let Some(a) = has(e, "as") {
                out.push_str(" AS ");
                out.push_str(&quote_part(self.d, str_of(a, "as")?)?);
            }
        }
        Ok(out)
    }

    fn wrap(c: &CondOut, parent: Kind) -> String {
        if c.kind == Kind::Atom || c.kind == parent {
            c.sql.clone()
        } else {
            format!("({})", c.sql)
        }
    }

    fn cond(&mut self, c: &Value, depth: usize) -> Res<CondOut> {
        check_depth(depth)?;
        if !c.is_obj() {
            return bad("condition must be an object");
        }
        let op = match has(c, "op") {
            Some(v) => str_of(v, "op")?,
            None => return bad("op must be a string"),
        };
        let atom = |sql: String| CondOut {
            sql,
            kind: Kind::Atom,
        };
        match op {
            "and" | "or" => {
                let list = match has(c, "conds") {
                    Some(v) => arr_of(v, "conds")?,
                    None => return bad("conds must be an array"),
                };
                let mut parts: Vec<CondOut> = Vec::new();
                for x in list {
                    parts.push(self.cond(x, depth + 1)?);
                }
                let is_and = op == "and";
                if parts.is_empty() {
                    return Ok(atom(if is_and { "1 = 1" } else { "1 = 0" }.to_string()));
                }
                if parts.len() == 1 {
                    return Ok(parts.remove(0));
                }
                let kind = if is_and { Kind::And } else { Kind::Or };
                let sep = if is_and { " AND " } else { " OR " };
                let strs: Vec<String> = parts.iter().map(|p| Self::wrap(p, kind)).collect();
                Ok(CondOut {
                    sql: strs.join(sep),
                    kind,
                })
            }
            "not" => {
                let inner = match has(c, "cond") {
                    Some(v) => v,
                    None => return bad("not requires cond"),
                };
                let r = self.cond(inner, depth + 1)?;
                Ok(atom(format!("NOT ({})", r.sql)))
            }
            "eq" | "ne" | "gt" | "gte" | "lt" | "lte" => {
                let l = self.ex(c, "left", op, depth)?;
                let r = self.ex(c, "right", op, depth)?;
                let sym = match op {
                    "eq" => "=",
                    "ne" => "<>",
                    "gt" => ">",
                    "gte" => ">=",
                    "lt" => "<",
                    _ => "<=",
                };
                Ok(atom(format!("{} {} {}", l, sym, r)))
            }
            "like" | "notLike" => {
                let l = self.ex(c, "left", op, depth)?;
                let r = self.ex(c, "right", op, depth)?;
                Ok(atom(format!(
                    "{} {} {}",
                    l,
                    if op == "like" { "LIKE" } else { "NOT LIKE" },
                    r
                )))
            }
            "ilike" | "notIlike" => {
                let l = self.ex(c, "left", op, depth)?;
                let r = self.ex(c, "right", op, depth)?;
                let neg = op == "notIlike";
                if self.d == Dialect::Postgres {
                    Ok(atom(format!(
                        "{} {} {}",
                        l,
                        if neg { "NOT ILIKE" } else { "ILIKE" },
                        r
                    )))
                } else {
                    Ok(atom(format!(
                        "LOWER({}) {} LOWER({})",
                        l,
                        if neg { "NOT LIKE" } else { "LIKE" },
                        r
                    )))
                }
            }
            "in" | "notIn" => {
                let neg = op == "notIn";
                let kw = if neg { "NOT IN" } else { "IN" };
                if let Some(q) = has(c, "query") {
                    let l = self.ex(c, "left", op, depth)?;
                    let sub = self.select(q, depth + 1)?;
                    return Ok(atom(format!("{} {} ({})", l, kw, sub)));
                }
                let values = match has(c, "values") {
                    Some(v) => arr_of(v, "values")?,
                    None => return bad("values must be an array"),
                };
                if values.is_empty() {
                    return Ok(atom(if neg { "1 = 1" } else { "1 = 0" }.to_string()));
                }
                let l = self.ex(c, "left", op, depth)?;
                let mut list: Vec<String> = Vec::new();
                for v in values {
                    list.push(self.expr(v, depth + 1, false)?);
                }
                Ok(atom(format!("{} {} ({})", l, kw, list.join(", "))))
            }
            "between" | "notBetween" => {
                let l = self.ex(c, "left", op, depth)?;
                let lo = self.ex(c, "low", op, depth)?;
                let hi = self.ex(c, "high", op, depth)?;
                Ok(atom(format!(
                    "{} {} {} AND {}",
                    l,
                    if op == "between" {
                        "BETWEEN"
                    } else {
                        "NOT BETWEEN"
                    },
                    lo,
                    hi
                )))
            }
            "isNull" | "isNotNull" => {
                let l = self.ex(c, "left", op, depth)?;
                Ok(atom(format!(
                    "{} {}",
                    l,
                    if op == "isNull" {
                        "IS NULL"
                    } else {
                        "IS NOT NULL"
                    }
                )))
            }
            "exists" | "notExists" => {
                let q = match has(c, "query") {
                    Some(v) => v,
                    None => return bad(&format!("{} requires query", op)),
                };
                let sub = self.select(q, depth + 1)?;
                Ok(atom(format!(
                    "{} ({})",
                    if op == "exists" {
                        "EXISTS"
                    } else {
                        "NOT EXISTS"
                    },
                    sub
                )))
            }
            "raw" => {
                let s = self.raw_sql(has(c, "sql"), has(c, "params"))?;
                Ok(atom(s))
            }
            _ => bad(&format!("unknown condition op: {}", op)),
        }
    }

    fn ex(&mut self, c: &Value, k: &str, op: &str, depth: usize) -> Res<String> {
        match has(c, k) {
            None => bad(&format!("{} requires {}", op, k)),
            Some(v) => self.expr(v, depth + 1, false),
        }
    }

    fn table(&mut self, t: &Value, depth: usize) -> Res<String> {
        check_depth(depth)?;
        if let Value::Str(s) = t {
            return quote_path(self.d, s);
        }
        if !t.is_obj() {
            return bad("table must be a string or an object");
        }
        if let Some(q) = has(t, "query") {
            let alias = match has(t, "as") {
                Some(a) => a,
                None => return bad("subquery table requires as"),
            };
            let inner = self.select(q, depth + 1)?;
            return Ok(format!(
                "({}) AS {}",
                inner,
                quote_part(self.d, str_of(alias, "as")?)?
            ));
        }
        let name = match has(t, "name") {
            Some(n) => n,
            None => return bad("table object requires name or query"),
        };
        let mut out = quote_path(self.d, str_of(name, "name")?)?;
        if let Some(a) = has(t, "as") {
            out.push_str(" AS ");
            out.push_str(&quote_part(self.d, str_of(a, "as")?)?);
        }
        Ok(out)
    }

    fn plain_table(&self, t: Option<&Value>) -> Res<String> {
        match t {
            Some(v) => quote_path(self.d, str_of(v, "table")?),
            None => bad("table must be a string"),
        }
    }

    fn select(&mut self, s: &Value, depth: usize) -> Res<String> {
        check_depth(depth)?;
        if !s.is_obj() || has(s, "type") != Some(&Value::Str("select".to_string())) {
            return bad("select statement expected");
        }
        let mut out = String::from("SELECT");
        if opt_bool(s, "distinct")? {
            out.push_str(" DISTINCT");
        }
        let cols: &[Value] = match has(s, "columns") {
            Some(c) => arr_of(c, "columns")?,
            None => &[],
        };
        if cols.is_empty() {
            out.push_str(" *");
        } else {
            let mut list: Vec<String> = Vec::new();
            for c in cols {
                list.push(self.expr(c, depth + 1, true)?);
            }
            out.push(' ');
            out.push_str(&list.join(", "));
        }
        let from = match has(s, "from") {
            Some(f) => f,
            None => return bad("select requires from"),
        };
        out.push_str(" FROM ");
        out.push_str(&self.table(from, depth + 1)?);
        if let Some(js) = has(s, "joins") {
            for j in arr_of(js, "joins")? {
                if !j.is_obj() {
                    return bad("join must be an object");
                }
                let kind = match has(j, "kind") {
                    Some(k) => str_of(k, "kind")?,
                    None => "inner",
                };
                if !matches!(kind, "inner" | "left" | "right" | "full" | "cross") {
                    return bad("unknown join kind");
                }
                if kind == "full" && self.d == Dialect::Mysql {
                    return fail("unsupported_feature", "FULL JOIN is not supported by mysql");
                }
                let table = match has(j, "table") {
                    Some(t) => t,
                    None => return bad("join requires table"),
                };
                out.push(' ');
                out.push_str(&kind.to_ascii_uppercase());
                out.push_str(" JOIN ");
                out.push_str(&self.table(table, depth + 1)?);
                if kind == "cross" {
                    if has(j, "on").is_some() {
                        return bad("cross join must not have on");
                    }
                } else {
                    let on = match has(j, "on") {
                        Some(o) => o,
                        None => return bad("join requires on"),
                    };
                    out.push_str(" ON ");
                    out.push_str(&self.cond(on, depth + 1)?.sql);
                }
            }
        }
        if let Some(w) = has(s, "where") {
            out.push_str(" WHERE ");
            out.push_str(&self.cond(w, depth + 1)?.sql);
        }
        if let Some(g) = has(s, "groupBy") {
            let g = arr_of(g, "groupBy")?;
            if !g.is_empty() {
                let mut list: Vec<String> = Vec::new();
                for x in g {
                    list.push(self.expr(x, depth + 1, false)?);
                }
                out.push_str(" GROUP BY ");
                out.push_str(&list.join(", "));
            }
        }
        if let Some(h) = has(s, "having") {
            out.push_str(" HAVING ");
            out.push_str(&self.cond(h, depth + 1)?.sql);
        }
        let mut ordered = false;
        if let Some(o) = has(s, "orderBy") {
            let o = arr_of(o, "orderBy")?;
            if !o.is_empty() {
                let mut list: Vec<String> = Vec::new();
                for item in o {
                    let mut target = item;
                    let mut dir = "ASC";
                    if item.is_obj() {
                        if let Some(e) = has(item, "expr") {
                            target = e;
                            if let Some(d) = has(item, "dir") {
                                match str_of(d, "dir")? {
                                    "asc" => dir = "ASC",
                                    "desc" => dir = "DESC",
                                    _ => return bad("dir must be asc or desc"),
                                }
                            }
                        }
                    }
                    let e = self.expr(target, depth + 1, false)?;
                    list.push(format!("{} {}", e, dir));
                }
                out.push_str(" ORDER BY ");
                out.push_str(&list.join(", "));
                ordered = true;
            }
        }
        let limit = int_field(s, "limit")?;
        let offset = int_field(s, "offset")?;
        if limit.is_some() || offset.is_some() {
            if self.d == Dialect::Mssql {
                if !ordered {
                    out.push_str(" ORDER BY (SELECT NULL)");
                }
                out.push_str(&format!(" OFFSET {} ROWS", offset.unwrap_or(0)));
                if let Some(l) = limit {
                    out.push_str(&format!(" FETCH NEXT {} ROWS ONLY", l));
                }
            } else {
                if let Some(l) = limit {
                    out.push_str(&format!(" LIMIT {}", l));
                } else if self.d == Dialect::Mysql {
                    out.push_str(" LIMIT 18446744073709551615");
                } else if self.d == Dialect::Sqlite {
                    out.push_str(" LIMIT -1");
                }
                if let Some(o) = offset {
                    out.push_str(&format!(" OFFSET {}", o));
                }
            }
        }
        Ok(out)
    }

    fn returning(&mut self, s: &Value, depth: usize) -> Res<String> {
        let r = match has(s, "returning") {
            Some(r) => arr_of(r, "returning")?,
            None => return Ok(String::new()),
        };
        if r.is_empty() {
            return Ok(String::new());
        }
        if self.d != Dialect::Postgres && self.d != Dialect::Sqlite {
            return fail(
                "unsupported_feature",
                "RETURNING is supported by postgres and sqlite only",
            );
        }
        let mut list: Vec<String> = Vec::new();
        for x in r {
            list.push(self.expr(x, depth + 1, true)?);
        }
        Ok(format!(" RETURNING {}", list.join(", ")))
    }

    fn name_list(&self, v: Option<&Value>, what: &str) -> Res<Vec<String>> {
        let a = match v {
            Some(v) => arr_of(v, what)?,
            None => return bad(&format!("{} must be an array", what)),
        };
        if a.is_empty() {
            return bad(&format!("{} must not be empty", what));
        }
        let mut out = Vec::new();
        for x in a {
            out.push(quote_part(self.d, str_of(x, what)?)?);
        }
        Ok(out)
    }

    fn insert(&mut self, s: &Value, depth: usize) -> Res<String> {
        let table = self.plain_table(has(s, "into"))?;
        let cols = self.name_list(has(s, "columns"), "columns")?;
        let rows = match has(s, "rows") {
            Some(r) => arr_of(r, "rows")?,
            None => return bad("rows must be an array"),
        };
        if rows.is_empty() {
            return bad("rows must not be empty");
        }
        let mut tuples: Vec<String> = Vec::new();
        for row in rows {
            let r = arr_of(row, "row")?;
            if r.len() != cols.len() {
                return bad("row length must equal columns length");
            }
            let mut cells: Vec<String> = Vec::new();
            for cell in r {
                cells.push(self.expr(cell, depth + 1, false)?);
            }
            tuples.push(format!("({})", cells.join(", ")));
        }
        let mut ignore = false;
        let mut conflict = String::new();
        if let Some(oc) = has(s, "onConflict") {
            if !oc.is_obj() {
                return bad("onConflict must be an object");
            }
            let nothing = opt_bool(oc, "doNothing")?;
            let upd = has(oc, "update").is_some();
            if nothing == upd {
                return bad("onConflict needs exactly one of doNothing, update");
            }
            if self.d == Dialect::Mssql {
                return fail("unsupported_feature", "upsert is not supported by mssql");
            }
            let target = if has(oc, "target").is_some() {
                self.name_list(has(oc, "target"), "target")?
            } else {
                Vec::new()
            };
            if nothing {
                if self.d == Dialect::Mysql {
                    ignore = true;
                } else {
                    conflict = format!(
                        " ON CONFLICT{} DO NOTHING",
                        if target.is_empty() {
                            String::new()
                        } else {
                            format!(" ({})", target.join(", "))
                        }
                    );
                }
            } else {
                let set = self.name_list(has(oc, "update"), "update")?;
                if self.d == Dialect::Mysql {
                    let items: Vec<String> = set
                        .iter()
                        .map(|c| format!("{} = VALUES({})", c, c))
                        .collect();
                    conflict = format!(" ON DUPLICATE KEY UPDATE {}", items.join(", "));
                } else {
                    if target.is_empty() {
                        return bad("update upsert requires target");
                    }
                    let items: Vec<String> = set
                        .iter()
                        .map(|c| format!("{} = EXCLUDED.{}", c, c))
                        .collect();
                    conflict = format!(
                        " ON CONFLICT ({}) DO UPDATE SET {}",
                        target.join(", "),
                        items.join(", ")
                    );
                }
            }
        }
        let ret = self.returning(s, depth)?;
        Ok(format!(
            "INSERT {}INTO {} ({}) VALUES {}{}{}",
            if ignore { "IGNORE " } else { "" },
            table,
            cols.join(", "),
            tuples.join(", "),
            conflict,
            ret
        ))
    }

    fn scope(&mut self, s: &Value, depth: usize) -> Res<String> {
        if let Some(w) = has(s, "where") {
            opt_bool(s, "all")?;
            return Ok(format!(" WHERE {}", self.cond(w, depth + 1)?.sql));
        }
        if !opt_bool(s, "all")? {
            return fail(
                "missing_where",
                "update/delete without where requires all: true",
            );
        }
        Ok(String::new())
    }

    fn update(&mut self, s: &Value, depth: usize) -> Res<String> {
        let table = self.plain_table(has(s, "table"))?;
        let set = match has(s, "set") {
            Some(v) => arr_of(v, "set")?,
            None => return bad("set must be an array"),
        };
        if set.is_empty() {
            return bad("set must not be empty");
        }
        let mut items: Vec<String> = Vec::new();
        for it in set {
            let (c, e) = match (has(it, "col"), has(it, "expr")) {
                (Some(c), Some(e)) if it.is_obj() => (c, e),
                _ => return bad("set item needs col and expr"),
            };
            let col = quote_part(self.d, str_of(c, "col")?)?;
            let rhs = self.expr(e, depth + 1, false)?;
            items.push(format!("{} = {}", col, rhs));
        }
        let mut out = format!("UPDATE {} SET {}", table, items.join(", "));
        out.push_str(&self.scope(s, depth)?);
        out.push_str(&self.returning(s, depth)?);
        Ok(out)
    }

    fn delete(&mut self, s: &Value, depth: usize) -> Res<String> {
        let table = self.plain_table(has(s, "from"))?;
        let mut out = format!("DELETE FROM {}", table);
        out.push_str(&self.scope(s, depth)?);
        out.push_str(&self.returning(s, depth)?);
        Ok(out)
    }
}

fn int_field(o: &Value, k: &str) -> Res<Option<u64>> {
    match has(o, k) {
        None => Ok(None),
        Some(Value::Num(lex)) => {
            let f: f64 = match lex.parse() {
                Ok(f) => f,
                Err(_) => return fail("invalid_limit", "not a number"),
            };
            if (0.0..=MAX_SAFE).contains(&f) && (f as u64) as f64 == f {
                Ok(Some(f as u64))
            } else {
                fail(
                    "invalid_limit",
                    &format!("{} must be a non-negative integer <= 9007199254740991", k),
                )
            }
        }
        Some(_) => fail(
            "invalid_limit",
            &format!("{} must be a non-negative integer <= 9007199254740991", k),
        ),
    }
}

/// Compile a statement AST for a dialect name (`postgres`, `mysql`, `sqlite`, `mssql`).
pub fn compile(ast: &Value, dialect: &str) -> Res<Compiled> {
    let d = Dialect::parse(dialect)?;
    let mut ctx = Ctx {
        d,
        params: Vec::new(),
    };
    if !ast.is_obj() {
        return bad("statement must be an object");
    }
    let ty = match has(ast, "type") {
        Some(t) => str_of(t, "type")?,
        None => return bad("type must be a string"),
    };
    let sql = match ty {
        "select" => ctx.select(ast, 0)?,
        "insert" => ctx.insert(ast, 0)?,
        "update" => ctx.update(ast, 0)?,
        "delete" => ctx.delete(ast, 0)?,
        _ => return bad(&format!("unknown statement type: {}", ty)),
    };
    Ok(Compiled {
        sql,
        params: ctx.params,
    })
}

/// Universal entry point for FFI and scripting: JSON AST text in, [`Compiled`] out.
pub fn compile_json(ast_json: &str, dialect: &str) -> Res<Compiled> {
    Dialect::parse(dialect)?;
    let v = parse_json(ast_json)?;
    compile(&v, dialect)
}
