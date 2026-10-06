//! Executes every case of vectors/lomboksql-vectors-v1.json (GP-11).
use lomboksql::{compile, parse_json, Value};

fn vector_text() -> String {
    let p = concat!(env!("CARGO_MANIFEST_DIR"), "/../vectors/lomboksql-vectors-v1.json");
    std::fs::read_to_string(p).expect("vectors file")
}

fn s(v: &Value) -> &str {
    match v {
        Value::Str(x) => x,
        _ => panic!("expected string"),
    }
}

#[test]
fn all_vectors_match() {
    let doc = parse_json(&vector_text()).expect("vectors parse");
    let groups = match doc.get("groups") {
        Some(Value::Arr(g)) => g,
        _ => panic!("groups"),
    };
    let mut total = 0usize;
    let mut failures: Vec<String> = Vec::new();
    for g in groups {
        let cases = match g.get("cases") {
            Some(Value::Arr(c)) => c,
            _ => panic!("cases"),
        };
        for k in cases {
            total += 1;
            let name = s(k.get("name").unwrap());
            let dialect = s(k.get("dialect").unwrap());
            let ast = k.get("ast").unwrap();
            let expect = k.get("expect").unwrap();
            let got = compile(ast, dialect);
            match (expect.get("error"), got) {
                (Some(code), Err(e)) => {
                    if e.code != s(code) {
                        failures.push(format!("{}: error code {} != {}", name, e.code, s(code)));
                    }
                }
                (Some(code), Ok(r)) => failures.push(format!("{}: expected error {} but got {}", name, s(code), r.sql)),
                (None, Err(e)) => failures.push(format!("{}: unexpected error {}", name, e)),
                (None, Ok(r)) => {
                    if r.sql != s(expect.get("sql").unwrap()) {
                        failures.push(format!("{}: sql\n  got      {}\n  expected {}", name, r.sql, s(expect.get("sql").unwrap())));
                    }
                    let want = expect.get("params").unwrap().to_json();
                    if r.params_json() != want {
                        failures.push(format!("{}: params {} != {}", name, r.params_json(), want));
                    }
                }
            }
        }
    }
    assert!(total >= 100, "GP-11 needs >= 100 cases, ran {}", total);
    assert!(failures.is_empty(), "{} of {} failed:\n{}", failures.len(), total, failures.join("\n"));
    println!("vectors executed: {}", total);
}

#[test]
fn compile_json_entry_point() {
    let r = lomboksql::compile_json(r#"{"type":"select","from":"t","where":{"op":"eq","left":"a","right":{"value":1}}}"#, "postgres").unwrap();
    assert_eq!(r.sql, "SELECT * FROM \"t\" WHERE \"a\" = $1");
    assert_eq!(r.params_json(), "[1]");
}

#[test]
fn malformed_json_is_invalid_ast() {
    for bad in ["", "{", "[1,]", "{\"a\":}", "\"\\ud800\"", "01", "1.", "nul", "{} x"] {
        let e = lomboksql::compile_json(bad, "postgres").unwrap_err();
        assert_eq!(e.code, "invalid_ast", "input {:?}", bad);
    }
}

#[test]
fn json_depth_limit_does_not_overflow_stack() {
    let deep = format!("{}1{}", "[".repeat(5000), "]".repeat(5000));
    assert_eq!(lomboksql::compile_json(&deep, "postgres").unwrap_err().code, "invalid_ast");
}
