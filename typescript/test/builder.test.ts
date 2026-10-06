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
