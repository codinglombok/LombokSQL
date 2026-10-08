// Executes LombokSQL output against real databases and compares RESULTS (not text).
//   SQLite : always (node:sqlite, Node >= 22.5)
//   PG_URL=postgres://user:pw@host:5432/db       enables PostgreSQL
//   MYSQL_URL=mysql://user:pw@host:3306/db       enables MySQL
//   MSSQL_URL='Server=host,1433;Database=master;User Id=sa;Password=...;TrustServerCertificate=true'  enables SQL Server
// Every scenario uses the same seed data and must return the same rows on every engine.
import { createRequire } from "node:module";
import { select, insertInto, update, deleteFrom, compile, LombokSqlError,
  eq, ne, gt, gte, lt, and, or, not, ilike, like, inList, notInList, inQuery, exists, notExists,
  between, isNull, isNotNull, col, val, raw, fn } from "../typescript/dist/index.js";

const NUM_COLS = new Set(["n", "s", "c"]);
const failures = [];
let passed = 0;

async function openSqlite() {
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(":memory:");
  const bind = (ps) => ps.map((x) => (typeof x === "boolean" ? (x ? 1 : 0) : x));
  return {
    dialect: "sqlite",
    version: "SQLite " + db.prepare("select sqlite_version() v").get().v,
    async ddl(sql) { db.exec(sql); },
    async run(sql, params = []) { return db.prepare(sql).all(...bind(params)).map((r) => ({ ...r })); },
    async close() { db.close(); },
  };
}
async function openPg(url) {
  const require = createRequire(import.meta.url);
  const pg = require("pg");
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  const version = (await c.query("select version() v")).rows[0].v.split(" on ")[0];
  return {
    dialect: "postgres", version,
    async ddl(sql) { await c.query(sql); },
    async run(sql, params = []) { return (await c.query(sql, params)).rows; },
    async close() { await c.end(); },
  };
}
async function openMysql(url) {
  const mysql = await import("mysql2/promise");
  const c = await mysql.createConnection(url);
  const [[v]] = await c.query("select version() v");
  return {
    dialect: "mysql", version: "MySQL " + v.v,
    async ddl(sql) { await c.query(sql); },
    async run(sql, params = []) { const [rows] = await c.execute(sql, params); return Array.isArray(rows) ? rows : []; },
    async close() { await c.end(); },
  };
}

async function openMssql(conn) {
  const require = createRequire(import.meta.url);
  const sql = require("mssql");
  const pool = await sql.connect(conn);
  const version = (await pool.request().query("select @@version v")).recordset[0].v.split("\n")[0];
  return {
    dialect: "mssql", version,
    async ddl(text) { await pool.request().batch(text); },
    async run(text, params = []) {
      const req = pool.request();
      params.forEach((v, i) => req.input("p" + (i + 1), v));
      return (await req.query(text)).recordset ?? [];
    },
    async close() { await pool.close(); },
  };
}

// SQL Server's legacy `text` cannot be used with COUNT(DISTINCT), UPPER/LOWER or "=", so only PostgreSQL and SQLite get `text`.
const TEXT = (d) => (d === "postgres" || d === "sqlite" ? "text" : "varchar(100)");
async function reseed(e) {
  const d = e.dialect;
  const q = d === "mysql" ? (s) => "`" + s + "`" : d === "mssql" ? (s) => "[" + s + "]" : (s) => '"' + s + '"';
  for (const t of ["users", "orders", "flags", "order", "名前"]) await e.ddl(`DROP TABLE IF EXISTS ${q(t)}`);
  const csType = d === "mysql" ? "varchar(100) COLLATE utf8mb4_bin" : d === "mssql" ? "varchar(100) COLLATE Latin1_General_CS_AS" : TEXT(d);
  await e.ddl(`CREATE TABLE users (id int primary key, name ${TEXT(d)}, age int, active int, country ${TEXT(d)}, deleted_at ${TEXT(d)}, cs ${csType})`);
  await e.ddl(`CREATE TABLE orders (id int primary key, user_id int, total int, kind ${TEXT(d)})`);
  await e.ddl(`CREATE TABLE flags (id int primary key, flag ${d === "mssql" ? "bit" : "boolean"})`);
  const weird = d === "mysql" ? '`we"ird`' : d === "mssql" ? '[we"ird]' : '"we""ird"';
  const tick = d === "mysql" ? "`back``tick`" : d === "mssql" ? "[back`tick]" : '"back`tick"';
  await e.ddl(`CREATE TABLE ${q("order")} (${q("select")} int, ${weird} ${TEXT(d)}, ${tick} ${TEXT(d)})`);
  await e.ddl(`CREATE TABLE ${q("名前")} (id int primary key, nilai ${d === "mssql" ? "nvarchar(100)" : TEXT(d)})`);
  await e.ddl(`INSERT INTO users (id,name,age,active,country,deleted_at) VALUES (1,'Ann',30,1,'ID',NULL),(2,'bob',17,1,'MY',NULL),(3,'Carl',45,0,'ID','2026-01-01'),(4,'dina',22,1,'SG',NULL),(5,'Eka',NULL,1,'ID',NULL)`);
  await e.ddl(`UPDATE users SET cs = name`);
  await e.ddl(`INSERT INTO orders VALUES (1,1,100,'a'),(2,1,50,'b'),(3,2,70,'a'),(4,3,20,'b'),(5,9,5,'a')`);
  await e.ddl(d === "mssql" ? `INSERT INTO flags VALUES (1,1),(2,0),(3,1)` : `INSERT INTO flags VALUES (1,TRUE),(2,FALSE),(3,TRUE)`);
}

function norm(rows) {
  return rows.map((r) => Object.entries(r).map(([k, v]) => {
    if (typeof v === "bigint") return Number(v);
    if (NUM_COLS.has(k) && typeof v === "string" && /^-?\d+(\.0+)?$/.test(v)) return Number(v);
    if (typeof v === "boolean") return v ? 1 : 0;
    return v;
  }));
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function expectRefused(expect, builder, dialect) {
  let code = null;
  try { builder.build(dialect); } catch (err) { code = err.code; }
  expect(code, "unsupported_feature");
}

function suite() {
  const S = [];
  const t = (name, fn) => S.push({ name, fn });
  // Each scenario: await q(builderOrAst) -> normalized rows, then expect(rows, wanted).
  t("where: and/or precedence with NULL age", async ({ q, expect }) =>
    expect(await q(select("id").from("users").where(and(eq("active", 1), or(gt("age", 18), eq("country", "MY")))).orderBy("id")), [[1], [2], [4]]));
  t("where: not()", async ({ q, expect }) =>
    expect(await q(select("id").from("users").where(not(eq("active", 1))).orderBy("id")), [[3]]));
  t("where: in list / not in list", async ({ q, expect }) => {
    expect(await q(select("id").from("users").where(inList("id", [1, 3, 9])).orderBy("id")), [[1], [3]]);
    expect(await q(select("id").from("users").where(notInList("id", [1, 2])).orderBy("id")), [[3], [4], [5]]);
  });
  t("where: empty IN is false, empty NOT IN is true", async ({ q, expect }) => {
    expect(await q(select("id").from("users").where(inList("id", []))), []);
    expect((await q(select("id").from("users").where(notInList("id", [])))).length, 5);
  });
  t("where: between", async ({ q, expect }) =>
    expect(await q(select("id").from("users").where(between("age", 18, 30)).orderBy("id")), [[1], [4]]));
  t("where: ilike is case-insensitive on every engine", async ({ q, expect }) => {
    expect(await q(select("id").from("users").where(ilike("name", "A%")).orderBy("id")), [[1]]);
    expect(await q(select("id").from("users").where(ilike("name", "B%")).orderBy("id")), [[2]]);
    expect(await q(select("id").from("users").where(ilike("name", "%A")).orderBy("id")), [[4], [5]]);
  });
  t("where: ilike on a case-sensitive column (binary collation on MySQL)", async ({ q, expect }) => {
    expect(await q(select("id").from("users").where(ilike("cs", "a%")).orderBy("id")), [[1]]);
    expect(await q(select("id").from("users").where(ilike("cs", "%A")).orderBy("id")), [[4], [5]]);
  });
  t("where: is null / is not null", async ({ q, expect }) => {
    expect(await q(select("id").from("users").where(isNull("deleted_at")).orderBy("id")), [[1], [2], [4], [5]]);
    expect(await q(select("id").from("users").where(isNotNull("deleted_at")).orderBy("id")), [[3]]);
    expect(await q(select("id").from("users").where(isNull("age"))), [[5]]);
  });
  t("where: boolean parameter", async ({ q, expect }) =>
    expect(await q(select("id").from("flags").where(eq("flag", true)).orderBy("id")), [[1], [3]]));
  t("paging: limit + offset", async ({ q, expect }) => {
    expect(await q(select("id").from("users").orderBy("id", "desc").limit(2).offset(1)), [[4], [3]]);
    expect(await q(select("id").from("users").orderBy("id").limit(0)), []);
  });
  t("paging: offset only (MySQL/SQLite need a synthetic LIMIT)", async ({ q, expect }) =>
    expect(await q(select("id").from("users").orderBy("id").offset(3)), [[4], [5]]));
  t("paging: maximum safe integer limit", async ({ q, expect }) =>
    expect((await q(select("id").from("users").orderBy("id").limit(9007199254740991))).length, 5));
  t("join: inner", async ({ q, expect }) =>
    expect(await q(select("o.id", "u.name").from("users u").columns().innerJoin("orders o", eq("o.user_id", col("u.id"))).orderBy("o.id")),
      [[1, "Ann"], [2, "Ann"], [3, "bob"], [4, "Carl"]]));
  t("join: left, rows without match", async ({ q, expect }) =>
    expect(await q(select("u.id").from("users u").leftJoin("orders o", eq("o.user_id", col("u.id"))).where(isNull("o.id")).orderBy("u.id")), [[4], [5]]));
  t("join: right, orphan order", async ({ q, expect, e }) => {
    expect(await q(select("o.id").from("users u").rightJoin("orders o", eq("o.user_id", col("u.id"))).where(isNull("u.id"))), [[5]]);
  });
  t("join: full is supported or refused explicitly", async ({ q, expect, e }) => {
    const b = select("u.id", "o.id").from("users u").fullJoin("orders o", eq("o.user_id", col("u.id")));
    if (e.dialect === "mysql") {
      let code = null;
      try { b.build("mysql"); } catch (err) { code = err.code; }
      expect(code, "unsupported_feature");
    } else expect((await q(b)).length, 7); // 4 matched + 2 users without orders + 1 orphan order
  });
  t("join: cross", async ({ q, expect }) =>
    expect(await q(select(fn("count", ["*"], { as: "n" })).from("users u").crossJoin("orders o")), [[25]]));
  t("aggregate: group by + having", async ({ q, expect }) =>
    expect(await q(select("user_id", fn("count", ["*"], { as: "n" }), fn("sum", ["total"], { as: "s" })).from("orders").groupBy("user_id")
      .having(gt(fn("count", ["*"]), 1))), [[1, 2, 150]]));
  t("aggregate: count distinct and select distinct", async ({ q, expect }) => {
    expect(await q(select(fn("count", ["country"], { distinct: true, as: "n" })).from("users")), [[3]]);
    expect(await q(select("country").distinct().from("users").orderBy("country")), [["ID"], ["MY"], ["SG"]]);
  });
  t("subquery: IN", async ({ q, expect }) =>
    expect(await q(select("id").from("users").where(inQuery("id", select("user_id").from("orders").where(gte("total", 50)))).orderBy("id")), [[1], [2]]));
  t("subquery: EXISTS / NOT EXISTS correlated", async ({ q, expect }) => {
    const sub = select(raw("1")).from("orders o").where(eq("o.user_id", col("u.id")));
    expect(await q(select("u.id").from("users u").where(exists(sub)).orderBy("u.id")), [[1], [2], [3]]);
    expect(await q(select("u.id").from("users u").where(notExists(sub)).orderBy("u.id")), [[4], [5]]);
  });
  t("subquery: scalar column and derived table", async ({ q, expect }) => {
    const cnt = select(fn("count", ["*"])).from("orders o").where(eq("o.user_id", col("u.id")));
    const ast = select("u.id").from("users u").toAst();
    ast.columns = ["u.id", { query: cnt.toAst(), as: "n" }];
    ast.orderBy = [{ expr: "u.id", dir: "asc" }];
    expect(await q(ast), [[1, 2], [2, 1], [3, 1], [4, 0], [5, 0]]);
    expect(await q(select("x.id").from(select("id").from("users").where(gt("age", 20)), "x").orderBy("x.id")), [[1], [3], [4]]);
  });
  t("expressions: functions and raw with parameters", async ({ q, expect }) => {
    expect(await q(select(fn("upper", ["name"], { as: "c" })).from("users").where(eq("id", 1))), [["ANN"]]);
    expect(await q(select(fn("coalesce", ["age", val(0)], { as: "n" })).from("users").where(eq("id", 5))), [[0]]);
    expect(await q(select(raw("? + 1", [10], "n")).from("users").where(eq("id", 1))), [[11]]);
  });
  t("parameters: numbering is correct across subquery, where, having", async ({ q, expect }) =>
    expect(await q(select("user_id", fn("sum", ["total"], { as: "s" })).from("orders")
      .where(and(inQuery("user_id", select("id").from("users").where(gt("id", 0))), gt("total", 10)))
      .groupBy("user_id").having(gt(fn("sum", ["total"]), 60)).orderBy("user_id")), [[1, 150], [2, 70]]));
  t("insert: many rows, then read back", async ({ q, expect }) => {
    await q(insertInto("users").columns("id", "name", "age", "active", "country").values(10, "Zed", 1, 1, "ID").values(11, "Yan", 2, 0, "MY"));
    expect(await q(select("id", "name").from("users").where(gte("id", 10)).orderBy("id")), [[10, "Zed"], [11, "Yan"]]);
  });
  t("insert: returning (postgres and sqlite) or explicit refusal", async ({ q, expect, e }) => {
    const b = insertInto("users").columns("id", "name").values(20, "Q").returning("id", "name");
    if (e.dialect === "mysql" || e.dialect === "mssql") { let code = null; try { b.build(e.dialect); } catch (err) { code = err.code; } expect(code, "unsupported_feature"); }
    else expect(await q(b), [[20, "Q"]]);
  });
  t("upsert: update on conflict", async ({ q, expect, e }) => {
    if (e.dialect === "mssql") return expectRefused(expect, insertInto("users").columns("id", "name").values(1, "Zed").onConflictUpdate(["id"], ["name"]), "mssql");
    await q(insertInto("users").columns("id", "name").values(1, "Zed").onConflictUpdate(["id"], ["name"]));
    expect(await q(select("id", "name", "age").from("users").where(eq("id", 1))), [[1, "Zed", 30]]);
  });
  t("upsert: do nothing keeps the existing row", async ({ q, expect, e }) => {
    if (e.dialect === "mssql") return expectRefused(expect, insertInto("users").columns("id", "name").values(1, "Zed").onConflictDoNothing(["id"]), "mssql");
    await q(insertInto("users").columns("id", "name").values(1, "Zed").onConflictDoNothing(["id"]));
    expect(await q(select("name").from("users").where(eq("id", 1))), [["Ann"]]);
  });
  t("update: where, and params ordered set-then-where", async ({ q, expect }) => {
    await q(update("users").set("age", 99).set("name", "Q").where(eq("id", 2)));
    expect(await q(select("age", "name").from("users").where(eq("id", 2))), [[99, "Q"]]);
  });
  t("update: raw expression and all()", async ({ q, expect }) => {
    await q(update("orders").set("total", raw("total + ?", [1])).where(eq("id", 1)));
    expect(await q(select("total").from("orders").where(eq("id", 1))), [[101]]);
    await q(update("orders").set("kind", "z").all());
    expect(await q(select(fn("count", ["*"], { as: "n" })).from("orders").where(eq("kind", "z"))), [[5]]);
  });
  t("update: returning (postgres and sqlite)", async ({ q, expect, e }) => {
    if (e.dialect === "mysql" || e.dialect === "mssql") return expectRefused(expect, update("users").set("age", 50).where(eq("id", 4)).returning("id", "age"), e.dialect);
    expect(await q(update("users").set("age", 50).where(eq("id", 4)).returning("id", "age")), [[4, 50]]);
  });
  t("delete: where, then all()", async ({ q, expect }) => {
    await q(deleteFrom("orders").where(lt("total", 30)));
    expect(await q(select("id").from("orders").orderBy("id")), [[1], [2], [3]]);
    await q(deleteFrom("orders").all());
    expect(await q(select("id").from("orders")), []);
  });
  t("identifiers: reserved words and quote characters round-trip", async ({ q, expect, e }) => {
    await q(insertInto("order").columns("select", 'we"ird').values(7, "x"));
    expect(await q(select("select", 'we"ird').from("order")), [[7, "x"]]);
  });
  t("identifiers: backtick inside an identifier is escaped", async ({ q, expect }) => {
    await q(insertInto("order").columns("select", "back`tick").values(8, "y"));
    expect(await q(select("back`tick").from("order").where(eq("select", 8))), [["y"]]);
  });
  t("identifiers and values: unicode round-trip", async ({ q, expect }) => {
    await q(insertInto("名前").columns("id", "nilai").values(1, "名前😀"));
    expect(await q(select("nilai").from("名前").where(eq("id", 1))), [["名前😀"]]);
  });
  t("security: hostile values are stored literally, schema survives", async ({ q, expect }) => {
    const evil = "'; DROP TABLE users; --";
    await q(insertInto("users").columns("id", "name").values(30, evil));
    expect(await q(select("name").from("users").where(eq("id", 30))), [[evil]]);
    expect(await q(select("name").from("users").where(eq("name", evil))), [[evil]]);
    expect((await q(select(fn("count", ["*"], { as: "n" })).from("users")))[0][0], 6);
  });
  return S;
}

async function main() {
  const engines = [await openSqlite()];
  if (process.env.PG_URL) engines.push(await openPg(process.env.PG_URL));
  if (process.env.MYSQL_URL) engines.push(await openMysql(process.env.MYSQL_URL));
  if (process.env.MSSQL_URL) engines.push(await openMssql(process.env.MSSQL_URL));
  const scenarios = suite();
  for (const e of engines) {
    console.log(`\n== ${e.version}  (${scenarios.length} scenarios)`);
    for (const s of scenarios) {
      await reseed(e);
      const q = async (b) => {
        const { sql, params } = typeof b.build === "function" ? b.build(e.dialect) : compile(b, e.dialect);
        try { return norm(await e.run(sql, params)); }
        catch (err) { throw new Error(`${err.message}\n      SQL: ${sql}\n      params: ${JSON.stringify(params)}`); }
      };
      const expect = (got, want) => { if (!same(got, want)) throw new Error(`got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); };
      try { await s.fn({ q, expect, e }); passed++; console.log(`  ok    ${s.name}`); }
      catch (err) { failures.push(`[${e.dialect}] ${s.name}: ${err.message}`); console.log(`  FAIL  ${s.name}\n      ${err.message}`); }
    }
    await e.close();
  }
  console.log(`\n${passed} passed, ${failures.length} failed across ${engines.length} engine(s)`);
  process.exit(failures.length === 0 ? 0 : 1);
}
main().catch((err) => { console.error(err); process.exit(2); });
