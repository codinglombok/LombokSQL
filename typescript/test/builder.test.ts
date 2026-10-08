import { test } from "node:test";
import assert from "node:assert/strict";
import { select, insertInto, update, deleteFrom, eq, gt, and, or, ilike, inList, inQuery, exists, col, fn, val, raw, isNull, between, LombokSqlError } from "../src/index.js";

test("select builder: shorthand alias, joins, where AND-combination, paging", () => {
  const q = select("u.id", "u.name")
    .from("users u")
    .leftJoin("orders o", eq("o.user_id", col("u.id")))
    .where(eq("u.active", true))
    .where(or(gt("u.age", 18), ilike("u.name", "a%")))
    .orderBy("u.id", "desc")
    .limit(10)
    .offset(20);
  assert.deepEqual(q.build("postgres"), {
    sql: 'SELECT "u"."id", "u"."name" FROM "users" AS "u" LEFT JOIN "orders" AS "o" ON "o"."user_id" = "u"."id" WHERE "u"."active" = $1 AND ("u"."age" > $2 OR "u"."name" ILIKE $3) ORDER BY "u"."id" DESC LIMIT 10 OFFSET 20',
    params: [true, 18, "a%"],
  });
  assert.equal(q.build("mssql").sql.endsWith("OFFSET 20 ROWS FETCH NEXT 10 ROWS ONLY"), true);
  assert.equal(q.build("mysql").sql.includes("LOWER(`u`.`name`) LIKE LOWER(?)"), true);
});

test("builder output equals the normative AST", () => {
  assert.deepEqual(select().from("t").where(eq("id", 1)).toAst(), { type: "select", from: "t", where: { op: "eq", left: "id", right: { value: 1 } } });
});

test("builders do not share state between calls", () => {
  const a = select("x").from("t");
  const before = JSON.stringify(a.toAst());
  a.toAst()["from"] = "mutated";
  assert.equal(JSON.stringify(a.toAst()), before);
});

test("in list, between, null checks, functions and raw", () => {
  const q = select(fn("count", ["*"], { as: "n" }), raw("COALESCE(x, ?)", [0], "z"))
    .from("t")
    .where(and(inList("id", [1, 2, 3]), between("age", 1, 9), isNull("deleted_at")));
  assert.deepEqual(q.build("sqlite"), {
    sql: 'SELECT COUNT(*) AS "n", COALESCE(x, ?) AS "z" FROM "t" WHERE "id" IN (?, ?, ?) AND "age" BETWEEN ? AND ? AND "deleted_at" IS NULL',
    params: [0, 1, 2, 3, 1, 9],
  });
});

test("subqueries: IN and EXISTS keep parameter order", () => {
  const sub = select("user_id").from("admins").where(eq("level", 3));
  const q = select().from("users").where(and(inQuery("id", sub), exists(select(raw("1")).from("b").where(eq("b.k", val("v"))))));
  assert.deepEqual(q.build("postgres").params, [3, "v"]);
});

test("insert, upsert, update, delete", () => {
  assert.deepEqual(insertInto("t").columns("a", "b").values(1, "x").values(2, "y").onConflictUpdate(["a"], ["b"]).returning("a").build("postgres"), {
    sql: 'INSERT INTO "t" ("a", "b") VALUES ($1, $2), ($3, $4) ON CONFLICT ("a") DO UPDATE SET "b" = EXCLUDED."b" RETURNING "a"',
    params: [1, "x", 2, "y"],
  });
  assert.deepEqual(update("t").set("a", 1).set("b", null).where(eq("id", 7)).build("mysql"), { sql: "UPDATE `t` SET `a` = ?, `b` = ? WHERE `id` = ?", params: [1, null, 7] });
  assert.deepEqual(deleteFrom("t").where(eq("id", 1)).build("mssql"), { sql: "DELETE FROM [t] WHERE [id] = @p1", params: [1] });
});

test("unscoped update/delete is refused unless all() is called", () => {
  assert.throws(() => update("t").set("a", 1).build("postgres"), (e: unknown) => e instanceof LombokSqlError && e.code === "missing_where");
  assert.throws(() => deleteFrom("t").build("postgres"), (e: unknown) => e instanceof LombokSqlError && e.code === "missing_where");
  assert.equal(deleteFrom("t").all().build("postgres").sql, 'DELETE FROM "t"');
});

test("errors carry a stable messageId", () => {
  try {
    select().build("postgres");
    assert.fail("expected error");
  } catch (e) {
    assert.ok(e instanceof LombokSqlError);
    assert.equal(e.messageId, "lomboksql.error.invalid_ast");
  }
});

test("every condition helper emits its documented op and compiles on all dialects", async () => {
  const b = await import("../src/index.js");
  const cases: [Record<string, unknown>, string][] = [
    [b.ne("a", 1), "ne"], [b.lt("a", 1), "lt"], [b.lte("a", 1), "lte"], [b.gte("a", 1), "gte"],
    [b.like("a", "x"), "like"], [b.notLike("a", "x"), "notLike"], [b.ilike("a", "x"), "ilike"], [b.notIlike("a", "x"), "notIlike"],
    [b.isNotNull("a"), "isNotNull"], [b.notInList("a", [1]), "notIn"], [b.rawCond("a > ?", [1]), "raw"],
    [b.between("a", 1, 2), "between"], [b.not(b.eq("a", 1)), "not"], [b.or(b.eq("a", 1)), "or"],
  ];
  for (const [ast, op] of cases) {
    assert.equal(ast["op"], op);
    for (const d of ["postgres", "mysql", "sqlite", "mssql"]) {
      const r = b.select().from("t").where(ast).build(d);
      assert.ok(r.sql.startsWith("SELECT * FROM"), `${op} on ${d}`);
    }
  }
});

test("every join and clause builder method maps to the AST", async () => {
  const b = await import("../src/index.js");
  const q = b.select("a.id")
    .distinct()
    .from("a")
    .innerJoin("b", b.eq("a.id", b.col("b.id")))
    .leftJoin("c", b.eq("a.id", b.col("c.id")))
    .rightJoin("d", b.eq("a.id", b.col("d.id")))
    .fullJoin("e", b.eq("a.id", b.col("e.id")))
    .crossJoin({ name: "f", as: "ff" })
    .groupBy("a.id")
    .having(b.gt(b.fn("count", ["*"]), 0))
    .orderBy("a.id");
  const ast = q.toAst() as { joins: { kind: string }[]; distinct: boolean };
  assert.deepEqual(ast.joins.map((j) => j.kind), ["inner", "left", "right", "full", "cross"]);
  assert.equal(ast.distinct, true);
  assert.ok(q.build("postgres").sql.includes('CROSS JOIN "f" AS "ff"'));
  assert.throws(() => q.build("mysql"), (e: unknown) => e instanceof b.LombokSqlError && e.code === "unsupported_feature");
  assert.equal(b.select().from(b.select("x").from("y"), "z").build("sqlite").sql, 'SELECT * FROM (SELECT "x" FROM "y") AS "z"');
  assert.equal(b.insertInto("t").columns("a").values(1).onConflictDoNothing().returning("a").build("sqlite").sql, 'INSERT INTO "t" ("a") VALUES (?) ON CONFLICT DO NOTHING RETURNING "a"');
  assert.equal(b.update("t").set("a", 1).where(b.eq("id", 1)).returning("a").build("postgres").sql, 'UPDATE "t" SET "a" = $1 WHERE "id" = $2 RETURNING "a"');
  assert.equal(b.deleteFrom("t").where(b.eq("id", 1)).returning("id").build("sqlite").sql, 'DELETE FROM "t" WHERE "id" = ? RETURNING "id"');
});
