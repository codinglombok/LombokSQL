// Generates vectors/lomboksql-vectors-v1.json.
// Group "golden": expectations are WRITTEN BY HAND for PostgreSQL and derived for the other
// dialects by a string-level transform (quote style + placeholder style) that does not use
// the compiler; dialect-specific syntax is overridden by hand.
// Group "generated-regression": expectations come from the TypeScript compiler and are
// cross-checked by the independent Rust port (run both runners before accepting changes).
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { compile, LombokSqlError } from "../typescript/dist/index.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIALECTS = ["postgres", "mysql", "sqlite", "mssql"];

const quote = (sql, d) => {
  if (d === "postgres" || d === "sqlite") return sql;
  return sql.replace(/"((?:[^"]|"")*)"/g, (_m, id) => {
    const raw = id.replace(/""/g, '"');
    return d === "mysql" ? "`" + raw.replace(/`/g, "``") + "`" : "[" + raw.replace(/\]/g, "]]") + "]";
  });
};
const placeholders = (sql, d) => (d === "mssql" ? sql.replace(/\$(\d+)/g, "@p$1") : d === "postgres" ? sql : sql.replace(/\$\d+/g, "?"));
const derive = (pg, d) => placeholders(quote(pg, d), d);

const golden = [];
/** g(name, ast, pgSql, params, overrides) ; overrides[dialect] = sql string | {error} | {sql, params} */
function g(name, ast, pg, params = [], over = {}) {
  for (const d of DIALECTS) {
    const o = over[d];
    let expect;
    if (o && typeof o === "object" && "error" in o) expect = { error: o.error };
    else if (o && typeof o === "object") expect = { sql: o.sql, params: o.params ?? params };
    else if (typeof o === "string") expect = { sql: o, params };
    else expect = { sql: derive(pg, d), params };
    golden.push({ name: `${name} [${d}]`, dialect: d, ast, expect });
  }
}
/** e(name, ast, code): an error expected on every dialect. */
function e(name, ast, code, dialects = DIALECTS) {
  for (const d of dialects) golden.push({ name: `${name} [${d}]`, dialect: d, ast, expect: { error: code } });
}

const c = (x) => ({ col: x });
const v = (x) => ({ value: x });
const eq = (l, r) => ({ op: "eq", left: l, right: r });
const sel = (o) => ({ type: "select", ...o });
const and = (...conds) => ({ op: "and", conds });
const or = (...conds) => ({ op: "or", conds });

// ---- select basics
g("select star", sel({ from: "users" }), 'SELECT * FROM "users"');
g("select columns and alias table", sel({ columns: ["id", "u.name"], from: { name: "users", as: "u" } }), 'SELECT "id", "u"."name" FROM "users" AS "u"');
g("select column alias", sel({ columns: [{ col: "id", as: "user_id" }], from: "t" }), 'SELECT "id" AS "user_id" FROM "t"');
g("select distinct qualified star", sel({ distinct: true, columns: ["u.*"], from: { name: "users", as: "u" } }), 'SELECT DISTINCT "u".* FROM "users" AS "u"');
g("select schema qualified table", sel({ from: "public.users" }), 'SELECT * FROM "public"."users"');
g("select star column only", sel({ columns: ["*"], from: "t" }), 'SELECT * FROM "t"');
g("select star not last part is quoted", sel({ columns: ["*.x"], from: "t" }), 'SELECT "*"."x" FROM "t"');
g("select empty columns means star", sel({ columns: [], from: "t" }), 'SELECT * FROM "t"');

// ---- identifier quoting
g("quote double quote in identifier", sel({ columns: ['we"ird'], from: "t" }), 'SELECT "we""ird" FROM "t"');
g("quote backtick in identifier", sel({ columns: ["a`b"], from: "t" }), 'SELECT "a`b" FROM "t"');
g("quote bracket in identifier", sel({ columns: ["a]b"], from: "t" }), 'SELECT "a]b" FROM "t"');
g("unicode identifiers", sel({ columns: ["名前", "😀"], from: "ünï" }), 'SELECT "名前", "😀" FROM "ünï"');
g("identifier with space and keyword", sel({ columns: ["order by"], from: "select" }), 'SELECT "order by" FROM "select"');

// ---- where
g("where eq value", sel({ from: "t", where: eq("id", v(1)) }), 'SELECT * FROM "t" WHERE "id" = $1', [1]);
g("where comparison operators", sel({ from: "t", where: and(
  { op: "ne", left: "a", right: v(1) }, { op: "gt", left: "b", right: v(2) }, { op: "gte", left: "c", right: v(3) },
  { op: "lt", left: "d", right: v(4) }, { op: "lte", left: "e", right: v(5) }) }),
  'SELECT * FROM "t" WHERE "a" <> $1 AND "b" > $2 AND "c" >= $3 AND "d" < $4 AND "e" <= $5', [1, 2, 3, 4, 5]);
g("where column to column", sel({ from: "t", where: eq("a", c("b")) }), 'SELECT * FROM "t" WHERE "a" = "b"');
g("where and or parenthesization", sel({ from: "t", where: and(eq("a", v(1)), or(eq("b", v(2)), eq("c", v(3)))) }),
  'SELECT * FROM "t" WHERE "a" = $1 AND ("b" = $2 OR "c" = $3)', [1, 2, 3]);
g("where or of ands", sel({ from: "t", where: or(and(eq("a", v(1)), eq("b", v(2))), eq("c", v(3))) }),
  'SELECT * FROM "t" WHERE ("a" = $1 AND "b" = $2) OR "c" = $3', [1, 2, 3]);
g("where nested same operator flattens", sel({ from: "t", where: and(and(eq("a", v(1)), eq("b", v(2))), eq("c", v(3))) }),
  'SELECT * FROM "t" WHERE "a" = $1 AND "b" = $2 AND "c" = $3', [1, 2, 3]);
g("where not atom", sel({ from: "t", where: { op: "not", cond: eq("a", v(1)) } }), 'SELECT * FROM "t" WHERE NOT ("a" = $1)', [1]);
g("where not or", sel({ from: "t", where: { op: "not", cond: or(eq("a", v(1)), eq("b", v(2))) } }), 'SELECT * FROM "t" WHERE NOT ("a" = $1 OR "b" = $2)', [1, 2]);
g("where empty and", sel({ from: "t", where: and() }), 'SELECT * FROM "t" WHERE 1 = 1');
g("where empty or", sel({ from: "t", where: or() }), 'SELECT * FROM "t" WHERE 1 = 0');
g("where single child collapses", sel({ from: "t", where: and(eq("a", v(1))) }), 'SELECT * FROM "t" WHERE "a" = $1', [1]);
g("where single or child inside and keeps parens", sel({ from: "t", where: and(and(or(eq("a", v(1)), eq("b", v(2)))), eq("c", v(3))) }),
  'SELECT * FROM "t" WHERE ("a" = $1 OR "b" = $2) AND "c" = $3', [1, 2, 3]);
g("where in list", sel({ from: "t", where: { op: "in", left: "id", values: [v(1), v(2), v(3)] } }), 'SELECT * FROM "t" WHERE "id" IN ($1, $2, $3)', [1, 2, 3]);
g("where not in list", sel({ from: "t", where: { op: "notIn", left: "id", values: [v("a")] } }), 'SELECT * FROM "t" WHERE "id" NOT IN ($1)', ["a"]);
g("where in empty list is false", sel({ from: "t", where: { op: "in", left: "id", values: [] } }), 'SELECT * FROM "t" WHERE 1 = 0');
g("where not in empty list is true", sel({ from: "t", where: { op: "notIn", left: "id", values: [] } }), 'SELECT * FROM "t" WHERE 1 = 1');
g("where in subquery", sel({ from: "t", where: { op: "in", left: "id", query: sel({ columns: ["user_id"], from: "admins", where: eq("active", v(true)) }) } }),
  'SELECT * FROM "t" WHERE "id" IN (SELECT "user_id" FROM "admins" WHERE "active" = $1)', [true]);
g("where between", sel({ from: "t", where: { op: "between", left: "age", low: v(18), high: v(65) } }), 'SELECT * FROM "t" WHERE "age" BETWEEN $1 AND $2', [18, 65]);
g("where not between", sel({ from: "t", where: { op: "notBetween", left: "age", low: v(1), high: v(2) } }), 'SELECT * FROM "t" WHERE "age" NOT BETWEEN $1 AND $2', [1, 2]);
g("where is null", sel({ from: "t", where: { op: "isNull", left: "deleted_at" } }), 'SELECT * FROM "t" WHERE "deleted_at" IS NULL');
g("where is not null", sel({ from: "t", where: { op: "isNotNull", left: "deleted_at" } }), 'SELECT * FROM "t" WHERE "deleted_at" IS NOT NULL');
g("where like", sel({ from: "t", where: { op: "like", left: "name", right: v("a%") } }), 'SELECT * FROM "t" WHERE "name" LIKE $1', ["a%"]);
g("where not like", sel({ from: "t", where: { op: "notLike", left: "name", right: v("a%") } }), 'SELECT * FROM "t" WHERE "name" NOT LIKE $1', ["a%"]);
const lowerLike = (neg) => (d) => ({ sql: derive(`SELECT * FROM "t" WHERE LOWER("name") ${neg ? "NOT " : ""}LIKE LOWER($1)`, d) });
g("where ilike", sel({ from: "t", where: { op: "ilike", left: "name", right: v("A%") } }), 'SELECT * FROM "t" WHERE "name" ILIKE $1', ["A%"],
  Object.fromEntries(["mysql", "sqlite", "mssql"].map((d) => [d, lowerLike(false)(d)])));
g("where not ilike", sel({ from: "t", where: { op: "notIlike", left: "name", right: v("A%") } }), 'SELECT * FROM "t" WHERE "name" NOT ILIKE $1', ["A%"],
  Object.fromEntries(["mysql", "sqlite", "mssql"].map((d) => [d, lowerLike(true)(d)])));
g("where exists correlated", sel({ from: { name: "users", as: "u" }, where: { op: "exists", query: sel({ columns: [{ raw: "1" }], from: "orders", where: eq("orders.user_id", c("u.id")) }) } }),
  'SELECT * FROM "users" AS "u" WHERE EXISTS (SELECT 1 FROM "orders" WHERE "orders"."user_id" = "u"."id")');
g("where not exists", sel({ from: "a", where: { op: "notExists", query: sel({ columns: [{ raw: "1" }], from: "b" }) } }), 'SELECT * FROM "a" WHERE NOT EXISTS (SELECT 1 FROM "b")');
g("where raw condition", sel({ from: "t", where: and({ op: "raw", sql: "score > ? + ?", params: [1, 2] }, eq("a", v(3))) }),
  'SELECT * FROM "t" WHERE score > $1 + $2 AND "a" = $3', [1, 2, 3]);
g("param types", sel({ from: "t", where: { op: "in", left: "x", values: [v(null), v(true), v(false), v(1.5), v(-2), v("it's \"q\"\n"), v("😀")] } }),
  'SELECT * FROM "t" WHERE "x" IN ($1, $2, $3, $4, $5, $6, $7)', [null, true, false, 1.5, -2, "it's \"q\"\n", "😀"]);
g("deep but allowed nesting", sel({ from: "t", where: Array.from({ length: 40 }).reduce((acc) => ({ op: "not", cond: acc }), eq("a", v(1))) }),
  'SELECT * FROM "t" WHERE ' + "NOT (".repeat(40) + '"a" = $1' + ")".repeat(40), [1]);

// ---- joins
g("inner join default kind plus left join", sel({ from: { name: "users", as: "u" }, joins: [
  { table: { name: "orders", as: "o" }, on: eq("o.user_id", c("u.id")) },
  { kind: "left", table: "profiles", on: eq("profiles.user_id", c("u.id")) }] }),
  'SELECT * FROM "users" AS "u" INNER JOIN "orders" AS "o" ON "o"."user_id" = "u"."id" LEFT JOIN "profiles" ON "profiles"."user_id" = "u"."id"');
g("right join", sel({ from: "a", joins: [{ kind: "right", table: "b", on: eq("a.id", c("b.id")) }] }), 'SELECT * FROM "a" RIGHT JOIN "b" ON "a"."id" = "b"."id"');
g("full join", sel({ from: "a", joins: [{ kind: "full", table: "b", on: eq("a.id", c("b.id")) }] }), 'SELECT * FROM "a" FULL JOIN "b" ON "a"."id" = "b"."id"', [], { mysql: { error: "unsupported_feature" } });
g("cross join", sel({ from: "a", joins: [{ kind: "cross", table: "b" }] }), 'SELECT * FROM "a" CROSS JOIN "b"');
g("join on compound condition with params", sel({ from: "a", joins: [{ kind: "left", table: "b", on: and(eq("a.id", c("b.a_id")), eq("b.kind", v("x"))) }], where: eq("a.n", v(2)) }),
  'SELECT * FROM "a" LEFT JOIN "b" ON "a"."id" = "b"."a_id" AND "b"."kind" = $1 WHERE "a"."n" = $2', ["x", 2]);
g("join subquery table", sel({ from: "a", joins: [{ kind: "inner", table: { query: sel({ columns: ["a_id"], from: "b", where: eq("z", v(1)) }), as: "x" }, on: eq("a.id", c("x.a_id")) }] }),
  'SELECT * FROM "a" INNER JOIN (SELECT "a_id" FROM "b" WHERE "z" = $1) AS "x" ON "a"."id" = "x"."a_id"', [1]);

// ---- grouping, functions, ordering
g("group by having aggregate", sel({ columns: ["dept", { fn: "count", args: ["*"], as: "n" }], from: "emp", groupBy: ["dept"], having: { op: "gt", left: { fn: "count", args: ["*"] }, right: v(5) } }),
  'SELECT "dept", COUNT(*) AS "n" FROM "emp" GROUP BY "dept" HAVING COUNT(*) > $1', [5]);
g("count distinct", sel({ columns: [{ fn: "count", distinct: true, args: ["u.id"] }], from: { name: "users", as: "u" } }), 'SELECT COUNT(DISTINCT "u"."id") FROM "users" AS "u"');
g("function names are upper cased and may be dotted", sel({ columns: [{ fn: "pg_catalog.now" }, { fn: "coalesce", args: ["a", v(0)] }], from: "t" }), 'SELECT PG_CATALOG.NOW(), COALESCE("a", $1) FROM "t"', [0]);
g("order by directions", sel({ from: "t", orderBy: ["a", { expr: "b", dir: "desc" }, { expr: "c", dir: "asc" }, { expr: { fn: "lower", args: ["d"] } }] }),
  'SELECT * FROM "t" ORDER BY "a" ASC, "b" DESC, "c" ASC, LOWER("d") ASC');
g("raw column with params and alias", sel({ columns: [{ raw: "COALESCE(a, ?)", params: [0], as: "x" }], from: "t" }), 'SELECT COALESCE(a, $1) AS "x" FROM "t"', [0]);
g("scalar subquery column", sel({ columns: [{ query: sel({ columns: [{ fn: "count", args: ["*"] }], from: "b", where: eq("b.a_id", c("a.id")) }), as: "c" }], from: "a" }),
  'SELECT (SELECT COUNT(*) FROM "b" WHERE "b"."a_id" = "a"."id") AS "c" FROM "a"');
g("subquery in from keeps parameter order", sel({ columns: ["x.id"], from: { query: sel({ columns: ["id"], from: "a", where: eq("k", v(1)) }), as: "x" }, where: eq("x.id", v(2)) }),
  'SELECT "x"."id" FROM (SELECT "id" FROM "a" WHERE "k" = $1) AS "x" WHERE "x"."id" = $2', [1, 2]);
g("parameter numbering across clauses", sel({ columns: [{ raw: "? + 1", params: [10], as: "n" }], from: "t", where: and({ op: "in", left: "id", query: sel({ columns: ["i"], from: "s", where: eq("z", v(20)) }) }, eq("a", v(30))), having: { op: "gt", left: { fn: "sum", args: ["q"] }, right: v(40) }, groupBy: ["g"] }),
  'SELECT $1 + 1 AS "n" FROM "t" WHERE "id" IN (SELECT "i" FROM "s" WHERE "z" = $2) AND "a" = $3 GROUP BY "g" HAVING SUM("q") > $4', [10, 20, 30, 40]);

// ---- pagination
const pagMssql = (tail) => ({ sql: `SELECT * FROM [t]${tail}` });
g("limit and offset", sel({ from: "t", limit: 10, offset: 20 }), 'SELECT * FROM "t" LIMIT 10 OFFSET 20', [], { mssql: pagMssql(" ORDER BY (SELECT NULL) OFFSET 20 ROWS FETCH NEXT 10 ROWS ONLY") });
g("limit only", sel({ from: "t", limit: 5 }), 'SELECT * FROM "t" LIMIT 5', [], { mssql: pagMssql(" ORDER BY (SELECT NULL) OFFSET 0 ROWS FETCH NEXT 5 ROWS ONLY") });
g("offset only", sel({ from: "t", offset: 5 }), 'SELECT * FROM "t" OFFSET 5', [], {
  mysql: { sql: "SELECT * FROM `t` LIMIT 18446744073709551615 OFFSET 5" },
  sqlite: { sql: 'SELECT * FROM "t" LIMIT -1 OFFSET 5' },
  mssql: pagMssql(" ORDER BY (SELECT NULL) OFFSET 5 ROWS") });
g("limit zero", sel({ from: "t", limit: 0 }), 'SELECT * FROM "t" LIMIT 0', [], { mssql: pagMssql(" ORDER BY (SELECT NULL) OFFSET 0 ROWS FETCH NEXT 0 ROWS ONLY") });
g("limit with order by", sel({ from: "t", orderBy: ["a"], limit: 3, offset: 6 }), 'SELECT * FROM "t" ORDER BY "a" ASC LIMIT 3 OFFSET 6', [], { mssql: { sql: "SELECT * FROM [t] ORDER BY [a] ASC OFFSET 6 ROWS FETCH NEXT 3 ROWS ONLY" } });
g("limit maximum safe integer", sel({ from: "t", limit: 9007199254740991 }), 'SELECT * FROM "t" LIMIT 9007199254740991', [], { mssql: pagMssql(" ORDER BY (SELECT NULL) OFFSET 0 ROWS FETCH NEXT 9007199254740991 ROWS ONLY") });

// ---- insert
g("insert one row", { type: "insert", into: "users", columns: ["name", "age"], rows: [[v("Ann"), v(30)]] }, 'INSERT INTO "users" ("name", "age") VALUES ($1, $2)', ["Ann", 30]);
g("insert many rows", { type: "insert", into: "users", columns: ["name"], rows: [[v("a")], [v("b")], [v("c")]] }, 'INSERT INTO "users" ("name") VALUES ($1), ($2), ($3)', ["a", "b", "c"]);
g("insert null and raw cell", { type: "insert", into: "t", columns: ["a", "b", "c"], rows: [[v(null), { raw: "NOW()" }, v(true)]] }, 'INSERT INTO "t" ("a", "b", "c") VALUES ($1, NOW(), $2)', [null, true]);
g("insert qualified table", { type: "insert", into: "public.t", columns: ["a"], rows: [[v(1)]] }, 'INSERT INTO "public"."t" ("a") VALUES ($1)', [1]);
const ins2 = { type: "insert", into: "t", columns: ["a", "b"], rows: [[v(1), v(2)]] };
g("insert on conflict do nothing with target", { ...ins2, onConflict: { target: ["a"], doNothing: true } }, 'INSERT INTO "t" ("a", "b") VALUES ($1, $2) ON CONFLICT ("a") DO NOTHING', [1, 2],
  { mysql: { sql: "INSERT IGNORE INTO `t` (`a`, `b`) VALUES (?, ?)" }, mssql: { error: "unsupported_feature" } });
g("insert on conflict do nothing without target", { ...ins2, onConflict: { doNothing: true } }, 'INSERT INTO "t" ("a", "b") VALUES ($1, $2) ON CONFLICT DO NOTHING', [1, 2],
  { mysql: { sql: "INSERT IGNORE INTO `t` (`a`, `b`) VALUES (?, ?)" }, mssql: { error: "unsupported_feature" } });
g("insert upsert update columns", { ...ins2, onConflict: { target: ["a"], update: ["b"] } }, 'INSERT INTO "t" ("a", "b") VALUES ($1, $2) ON CONFLICT ("a") DO UPDATE SET "b" = EXCLUDED."b"', [1, 2],
  { mysql: { sql: "INSERT INTO `t` (`a`, `b`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `b` = VALUES(`b`)" }, mssql: { error: "unsupported_feature" } });
g("insert upsert two update columns composite target", { type: "insert", into: "t", columns: ["a", "b", "c"], rows: [[v(1), v(2), v(3)]], onConflict: { target: ["a", "b"], update: ["b", "c"] } },
  'INSERT INTO "t" ("a", "b", "c") VALUES ($1, $2, $3) ON CONFLICT ("a", "b") DO UPDATE SET "b" = EXCLUDED."b", "c" = EXCLUDED."c"', [1, 2, 3],
  { mysql: { sql: "INSERT INTO `t` (`a`, `b`, `c`) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE `b` = VALUES(`b`), `c` = VALUES(`c`)" }, mssql: { error: "unsupported_feature" } });
g("insert returning", { ...ins2, returning: ["a", { col: "b", as: "bee" }] }, 'INSERT INTO "t" ("a", "b") VALUES ($1, $2) RETURNING "a", "b" AS "bee"', [1, 2],
  { mysql: { error: "unsupported_feature" }, mssql: { error: "unsupported_feature" } });
g("insert empty returning is ignored", { ...ins2, returning: [] }, 'INSERT INTO "t" ("a", "b") VALUES ($1, $2)', [1, 2]);

// ---- update
g("update set and where order of params", { type: "update", table: "users", set: [{ col: "name", expr: v("x") }, { col: "age", expr: v(5) }], where: eq("id", v(9)) }, 'UPDATE "users" SET "name" = $1, "age" = $2 WHERE "id" = $3', ["x", 5, 9]);
g("update with raw expression", { type: "update", table: "t", set: [{ col: "n", expr: { raw: "n + ?", params: [1] } }], where: eq("id", v(2)) }, 'UPDATE "t" SET "n" = n + $1 WHERE "id" = $2', [1, 2]);
g("update with column expression", { type: "update", table: "t", set: [{ col: "a", expr: c("b") }], where: { op: "isNull", left: "a" } }, 'UPDATE "t" SET "a" = "b" WHERE "a" IS NULL');
g("update all rows explicitly", { type: "update", table: "t", set: [{ col: "a", expr: v(1) }], all: true }, 'UPDATE "t" SET "a" = $1', [1]);
g("update where wins over all", { type: "update", table: "t", set: [{ col: "a", expr: v(1) }], all: true, where: eq("id", v(2)) }, 'UPDATE "t" SET "a" = $1 WHERE "id" = $2', [1, 2]);
g("update returning", { type: "update", table: "t", set: [{ col: "a", expr: v(1) }], where: eq("id", v(2)), returning: ["a"] }, 'UPDATE "t" SET "a" = $1 WHERE "id" = $2 RETURNING "a"', [1, 2],
  { mysql: { error: "unsupported_feature" }, mssql: { error: "unsupported_feature" } });

// ---- delete
g("delete where", { type: "delete", from: "t", where: eq("id", v(1)) }, 'DELETE FROM "t" WHERE "id" = $1', [1]);
g("delete all explicitly", { type: "delete", from: "t", all: true }, 'DELETE FROM "t"');
g("delete returning", { type: "delete", from: "t", where: eq("id", v(1)), returning: ["id"] }, 'DELETE FROM "t" WHERE "id" = $1 RETURNING "id"', [1],
  { mysql: { error: "unsupported_feature" }, mssql: { error: "unsupported_feature" } });
g("delete with subquery condition", { type: "delete", from: "t", where: { op: "in", left: "id", query: sel({ columns: ["tid"], from: "gone" }) } }, 'DELETE FROM "t" WHERE "id" IN (SELECT "tid" FROM "gone")');

// ---- errors
const okSel = (extra) => sel({ from: "t", ...extra });
e("error statement is not an object", 5, "invalid_ast");
e("error statement is an array", [], "invalid_ast");
e("error missing type", { from: "t" }, "invalid_ast");
e("error unknown statement type", { type: "merge" }, "invalid_ast");
e("error select without from", { type: "select" }, "invalid_ast");
e("error columns not an array", okSel({ columns: "id" }), "invalid_ast");
e("error expression with two kinds", okSel({ columns: [{ col: "a", value: 1 }] }), "invalid_ast");
e("error expression empty object", okSel({ columns: [{}] }), "invalid_ast");
e("error expression number", okSel({ columns: [5] }), "invalid_ast");
e("error expression null", okSel({ columns: [null] }), "invalid_ast");
e("error value is an object", okSel({ where: eq("a", { value: { x: 1 } }) }), "invalid_ast");
e("error value is an array", okSel({ where: eq("a", { value: [1] }) }), "invalid_ast");
e("error raw too few params", okSel({ columns: [{ raw: "a + ? + ?", params: [1] }] }), "invalid_ast");
e("error raw too many params", okSel({ columns: [{ raw: "a", params: [1] }] }), "invalid_ast");
e("error raw non scalar param", okSel({ columns: [{ raw: "a + ?", params: [{}] }] }), "invalid_ast");
e("error raw empty", okSel({ columns: [{ raw: "" }] }), "invalid_ast");
e("error function name with parenthesis", okSel({ columns: [{ fn: "count(*)" }] }), "invalid_ast");
e("error function name empty", okSel({ columns: [{ fn: "" }] }), "invalid_ast");
e("error distinct not boolean", okSel({ distinct: "yes" }), "invalid_ast");
e("error cross join with on", okSel({ joins: [{ kind: "cross", table: "b", on: eq("a", c("b")) }] }), "invalid_ast");
e("error join without on", okSel({ joins: [{ kind: "left", table: "b" }] }), "invalid_ast");
e("error unknown join kind", okSel({ joins: [{ kind: "natural", table: "b" }] }), "invalid_ast");
e("error subquery table without alias", sel({ from: { query: sel({ from: "a" }) } }), "invalid_ast");
e("error table object without name", sel({ from: {} }), "invalid_ast");
e("error unknown condition op", okSel({ where: { op: "xor" } }), "invalid_ast");
e("error condition missing left", okSel({ where: { op: "eq", right: v(1) } }), "invalid_ast");
e("error in without values", okSel({ where: { op: "in", left: "a" } }), "invalid_ast");
e("error and without conds", okSel({ where: { op: "and" } }), "invalid_ast");
e("error not without cond", okSel({ where: { op: "not" } }), "invalid_ast");
e("error order dir invalid", okSel({ orderBy: [{ expr: "a", dir: "up" }] }), "invalid_ast");
e("error nested select has wrong type", okSel({ where: { op: "in", left: "a", query: { type: "delete", from: "x" } } }), "invalid_ast");
e("error insert row length mismatch", { type: "insert", into: "t", columns: ["a", "b"], rows: [[v(1)]] }, "invalid_ast");
e("error insert empty rows", { type: "insert", into: "t", columns: ["a"], rows: [] }, "invalid_ast");
e("error insert empty columns", { type: "insert", into: "t", columns: [], rows: [[]] }, "invalid_ast");
e("error insert into not a string", { type: "insert", into: { name: "t" }, columns: ["a"], rows: [[v(1)]] }, "invalid_ast");
e("error update empty set", { type: "update", table: "t", set: [], where: eq("a", v(1)) }, "invalid_ast");
e("error update set item without expr", { type: "update", table: "t", set: [{ col: "a" }], where: eq("a", v(1)) }, "invalid_ast");
e("error upsert with both modes", { type: "insert", into: "t", columns: ["a"], rows: [[v(1)]], onConflict: { target: ["a"], doNothing: true, update: ["a"] } }, "invalid_ast", ["postgres", "mysql", "sqlite"]);
e("error upsert with neither mode", { type: "insert", into: "t", columns: ["a"], rows: [[v(1)]], onConflict: { target: ["a"] } }, "invalid_ast", ["postgres", "mysql", "sqlite"]);
e("error upsert update needs target on postgres and sqlite", { type: "insert", into: "t", columns: ["a"], rows: [[v(1)]], onConflict: { update: ["a"] } }, "invalid_ast", ["postgres", "sqlite"]);
e("error empty identifier", okSel({ columns: [""] }), "invalid_identifier");
e("error empty path part", okSel({ columns: ["a..b"] }), "invalid_identifier");
e("error leading dot", okSel({ columns: [".a"] }), "invalid_identifier");
e("error trailing dot", sel({ from: "a." }), "invalid_identifier");
e("error NUL in identifier", okSel({ columns: ["a\u0000b"] }), "invalid_identifier");
e("error empty alias", okSel({ columns: [{ col: "a", as: "" }] }), "invalid_identifier");
e("error empty insert column name", { type: "insert", into: "t", columns: [""], rows: [[v(1)]] }, "invalid_identifier");
e("error update without where", { type: "update", table: "t", set: [{ col: "a", expr: v(1) }] }, "missing_where");
e("error update all false", { type: "update", table: "t", set: [{ col: "a", expr: v(1) }], all: false }, "missing_where");
e("error delete without where", { type: "delete", from: "t" }, "missing_where");
e("error limit negative", okSel({ limit: -1 }), "invalid_limit");
e("error limit fractional", okSel({ limit: 1.5 }), "invalid_limit");
e("error limit string", okSel({ limit: "10" }), "invalid_limit");
e("error limit null", okSel({ limit: null }), "invalid_limit");
e("error offset above safe integer", okSel({ offset: 9007199254740992 }), "invalid_limit");
e("error nesting too deep", sel({ from: "t", where: Array.from({ length: 100 }).reduce((acc) => ({ op: "not", cond: acc }), eq("a", v(1))) }), "too_deep");
for (const d of ["oracle", "", "Postgres", "pg"]) golden.push({ name: `error unknown dialect "${d}"`, dialect: d, ast: sel({ from: "t" }), expect: { error: "invalid_dialect" } });

// ---------------------------------------------------------------- generated regression
let seed = 20261001;
const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const names = ["id", "name", "a", "b.c", "t.x", "created_at", "we\"ird", "名前"];
const scalars = () => pick([null, true, false, 0, 1, -7, 2.5, "s", "it's", "%x%", "😀"]);
function genExpr(d) {
  const k = d > 2 ? 0 : Math.floor(rnd() * 6);
  if (k === 0) return pick(names);
  if (k === 1) return { col: pick(names), as: rnd() < 0.3 ? "al" : undefined };
  if (k === 2 || k === 5) return { value: scalars() };
  if (k === 3) return { fn: pick(["count", "sum", "lower", "max"]), args: [genExpr(d + 1)], distinct: rnd() < 0.2 };
  return { raw: "f(?, ?)", params: [scalars(), scalars()] };
}
function genCond(d) {
  const k = d > 3 ? 3 : Math.floor(rnd() * 9);
  if (k === 0) return { op: "and", conds: Array.from({ length: Math.floor(rnd() * 4) }, () => genCond(d + 1)) };
  if (k === 1) return { op: "or", conds: Array.from({ length: Math.floor(rnd() * 4) }, () => genCond(d + 1)) };
  if (k === 2) return { op: "not", cond: genCond(d + 1) };
  if (k === 3) return { op: pick(["eq", "ne", "gt", "gte", "lt", "lte", "like", "ilike", "notLike", "notIlike"]), left: pick(names), right: genExpr(2) };
  if (k === 4) return { op: pick(["in", "notIn"]), left: pick(names), values: Array.from({ length: Math.floor(rnd() * 4) }, () => ({ value: scalars() })) };
  if (k === 5) return { op: pick(["between", "notBetween"]), left: pick(names), low: { value: 1 }, high: { value: 9 } };
  if (k === 6) return { op: pick(["isNull", "isNotNull"]), left: pick(names) };
  if (k === 7) return { op: "raw", sql: "g(?)", params: [scalars()] };
  return { op: "exists", query: { type: "select", columns: [{ raw: "1" }], from: "s", where: genCond(d + 2) } };
}
function genSelect() {
  const s = { type: "select", from: rnd() < 0.3 ? { name: "t", as: "x" } : "t" };
  if (rnd() < 0.7) s.columns = Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => genExpr(0));
  if (rnd() < 0.2) s.distinct = true;
  if (rnd() < 0.3) s.joins = [{ kind: pick(["inner", "left", "right", "full"]), table: "u", on: genCond(2) }];
  if (rnd() < 0.8) s.where = genCond(0);
  if (rnd() < 0.2) s.groupBy = [pick(names)];
  if (rnd() < 0.1) s.having = genCond(2);
  if (rnd() < 0.4) s.orderBy = [{ expr: pick(names), dir: pick(["asc", "desc"]) }];
  if (rnd() < 0.4) s.limit = Math.floor(rnd() * 100);
  if (rnd() < 0.3) s.offset = Math.floor(rnd() * 100);
  return s;
}
const generated = [];
for (let i = 0; i < 160; i++) {
  const kind = pick(["select", "select", "select", "insert", "update", "delete"]);
  let ast;
  if (kind === "select") ast = genSelect();
  else if (kind === "insert") {
    ast = { type: "insert", into: "t", columns: ["a", "b"], rows: Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => [{ value: scalars() }, { value: scalars() }]) };
    if (rnd() < 0.4) ast.onConflict = rnd() < 0.5 ? { target: ["a"], doNothing: true } : { target: ["a"], update: ["b"] };
    if (rnd() < 0.3) ast.returning = ["a"];
  } else if (kind === "update") {
    ast = { type: "update", table: "t", set: [{ col: "a", expr: { value: scalars() } }], returning: rnd() < 0.2 ? ["a"] : undefined };
    if (rnd() < 0.8) ast.where = genCond(0); else if (rnd() < 0.5) ast.all = true;
  } else {
    ast = { type: "delete", from: "t", returning: rnd() < 0.2 ? ["id"] : undefined };
    if (rnd() < 0.8) ast.where = genCond(0); else if (rnd() < 0.5) ast.all = true;
  }
  ast = JSON.parse(JSON.stringify(ast));
  const d = DIALECTS[i % 4];
  let expect;
  try { const r = compile(ast, d); expect = { sql: r.sql, params: r.params }; }
  catch (err) { if (!(err instanceof LombokSqlError)) throw err; expect = { error: err.code }; }
  generated.push({ name: `generated ${String(i + 1).padStart(3, "0")} ${kind} [${d}]`, dialect: d, ast, expect });
}

// sanity: every success case must satisfy placeholder count == params length
for (const k of [...golden, ...generated]) {
  if (!("sql" in k.expect)) continue;
  const n = k.dialect === "postgres" ? (k.expect.sql.match(/\$\d+/g) ?? []).length : k.dialect === "mssql" ? (k.expect.sql.match(/@p\d+/g) ?? []).length : (k.expect.sql.match(/\?/g) ?? []).length;
  if (n !== k.expect.params.length) throw new Error(`placeholder mismatch in ${k.name}: ${n} vs ${k.expect.params.length}`);
}

const doc = {
  format: "lomboksql-vectors-v1",
  specVersion: "0.1.0",
  note: "Normative cross-language vectors. Numbers in params are normalized (no exponent, no trailing zeros).",
  groups: [
    { name: "golden", cases: golden },
    { name: "generated-regression", cases: generated },
  ],
};
const text = JSON.stringify(doc, null, 1) + "\n";
writeFileSync(join(root, "vectors", "lomboksql-vectors-v1.json"), text);
const sha = createHash("sha256").update(readFileSync(join(root, "vectors", "lomboksql-vectors-v1.json"))).digest("hex");
console.log(`golden=${golden.length} generated=${generated.length} total=${golden.length + generated.length} sha256=${sha}`);
