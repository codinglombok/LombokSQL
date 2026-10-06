import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { compile, LombokSqlError } from "../src/index.js";

let seed = 424242;
const rnd = (): number => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};
const pick = <T>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)] as T;

const KEYS = ["type", "from", "columns", "where", "op", "left", "right", "conds", "cond", "col", "value", "raw", "params", "fn", "args", "query", "as", "name", "joins", "kind", "table", "on", "values", "low", "high", "limit", "offset", "orderBy", "expr", "dir", "set", "into", "rows", "onConflict", "all", "returning", "sql", "groupBy", "having", "distinct"];
const STRS = ["select", "insert", "update", "delete", "eq", "and", "or", "not", "in", "t", "a.b", "*", "", "x?y", "inner", "asc", "desc", "count", "a\u0000b", "'; DROP TABLE users; --", "😀"];

function junk(depth: number): unknown {
  const k = depth > 5 ? Math.floor(rnd() * 4) : Math.floor(rnd() * 7);
  if (k === 0) return pick(STRS);
  if (k === 1) return Math.floor(rnd() * 20) - 5;
  if (k === 2) return pick([null, true, false, 1.5]);
  if (k === 3) return pick(STRS);
  if (k === 4) return Array.from({ length: Math.floor(rnd() * 4) }, () => junk(depth + 1));
  const o: Record<string, unknown> = {};
  for (let i = 0, n = Math.floor(rnd() * 5); i < n; i++) o[pick(KEYS)] = junk(depth + 1);
  return o;
}

function countPlaceholders(sql: string, d: string): number {
  // quoted identifiers may legitimately contain "?", "$1" or "@p1"; drop them first
  const stripped = sql.replace(d === "mysql" ? /`(?:[^`]|``)*`/g : d === "mssql" ? /\[(?:[^\]]|\]\])*\]/g : /"(?:[^"]|"")*"/g, "");
  const re = d === "postgres" ? /\$\d+/g : d === "mssql" ? /@p\d+/g : /\?/g;
  return (stripped.match(re) ?? []).length;
}

test("pseudo-fuzz: random garbage never throws anything but LombokSqlError", () => {
  let ok = 0;
  for (let i = 0; i < 20000; i++) {
    const ast = junk(0);
    if (typeof ast === "object" && ast !== null && !Array.isArray(ast) && rnd() < 0.7) (ast as Record<string, unknown>)["type"] = pick(["select", "insert", "update", "delete"]);
    const d = pick(["postgres", "mysql", "sqlite", "mssql"]);
    try {
      const r = compile(ast, d);
      ok++;
      assert.equal(countPlaceholders(r.sql, d), r.params.length);
    } catch (e) {
      assert.ok(e instanceof LombokSqlError, `unexpected ${String(e)} for ${JSON.stringify(ast)}`);
    }
  }
  assert.ok(ok >= 0);
});

test("injection property: bound values never appear in SQL text", () => {
  const evil = ["'; DROP TABLE users; --", "\" OR 1=1 --", "\\'", "%00", "`; SELECT 1"];
  for (const v of evil) {
    for (const d of ["postgres", "mysql", "sqlite", "mssql"]) {
      const r = compile({ type: "select", from: "t", where: { op: "eq", left: "a", right: { value: v } } }, d);
      assert.ok(!r.sql.includes(v) && r.params[0] === v);
    }
  }
});

test("pathological input terminates quickly", () => {
  const t0 = Date.now();
  let w: unknown = { op: "eq", left: "a", right: { value: 1 } };
  for (let i = 0; i < 10000; i++) w = { op: "not", cond: w };
  assert.throws(() => compile({ type: "select", from: "t", where: w }, "postgres"), (e: unknown) => e instanceof LombokSqlError && e.code === "too_deep");
  const wide = { op: "in", left: "a", values: Array.from({ length: 50000 }, (_, i) => ({ value: i })) };
  assert.equal(compile({ type: "select", from: "t", where: wide }, "postgres").params.length, 50000);
  assert.ok(Date.now() - t0 < 3000);
});

// ---- structure-aware fuzz: mutate valid ASTs taken from the vectors
type Path = (string | number)[];
function paths(v: unknown, base: Path = [], out: Path[] = []): Path[] {
  out.push(base);
  if (Array.isArray(v)) v.forEach((x, i) => paths(x, [...base, i], out));
  else if (typeof v === "object" && v !== null) for (const k of Object.keys(v)) paths((v as Record<string, unknown>)[k], [...base, k], out);
  return out;
}
function getAt(v: unknown, p: Path): unknown {
  return p.reduce<unknown>((acc, k) => (acc as Record<string | number, unknown>)[k], v);
}
function mutate(ast: unknown): unknown {
  const copy = JSON.parse(JSON.stringify(ast)) as unknown;
  const all = paths(copy).filter((p) => p.length > 0);
  if (all.length === 0) return copy;
  const p = pick(all);
  const parent = getAt(copy, p.slice(0, -1)) as Record<string | number, unknown>;
  const last = p[p.length - 1] as string | number;
  const how = Math.floor(rnd() * 4);
  if (how === 0) {
    if (Array.isArray(parent)) parent.splice(last as number, 1);
    else delete parent[last];
  } else if (how === 1) parent[last] = junk(4);
  else if (how === 2) parent[last] = JSON.parse(JSON.stringify(getAt(copy, pick(all)))) as unknown;
  else parent[last] = pick(STRS);
  return copy;
}

test("structure-aware fuzz: mutated valid ASTs keep invariants and exercise the success path", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const doc = JSON.parse(readFileSync(join(here, "..", "..", "..", "vectors", "lomboksql-vectors-v1.json"), "utf8")) as {
    groups: { cases: { dialect: string; ast: unknown; expect: { error?: string } }[] }[];
  };
  const seeds = doc.groups.flatMap((g) => g.cases).filter((c) => c.expect.error === undefined);
  let ok = 0;
  let total = 0;
  for (const c of seeds) {
    for (let i = 0; i < 25; i++) {
      const ast = mutate(c.ast);
      total++;
      try {
        const r = compile(ast, c.dialect);
        ok++;
        assert.equal(countPlaceholders(r.sql, c.dialect), r.params.length);
      } catch (e) {
        assert.ok(e instanceof LombokSqlError, `unexpected ${String(e)} for ${JSON.stringify(ast)}`);
      }
    }
  }
  assert.ok(ok > total * 0.2, `only ${ok}/${total} mutated ASTs compiled`);
});
