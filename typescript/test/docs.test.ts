import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (p: string): string => readFileSync(join(root, p), "utf8").replace(/\r\n/g, "\n");
const version = read("version.txt").trim();

test("doctor-lite: vector sha256 in SPEC equals the vector file", () => {
  const sha = createHash("sha256").update(readFileSync(join(root, "vectors", "lomboksql-vectors-v1.json"))).digest("hex");
  assert.ok(read(`docs/SPEC_LombokSQL_v${version}.md`).includes(sha));
  assert.ok(read("vectors/README.md").includes(sha));
});

test("doctor-lite: SPEC opens with the mandatory normative sentence", () => {
  assert.ok(read(`docs/SPEC_LombokSQL_v${version}.md`).includes("This document is the normative cross-language contract. Every language port MUST produce byte-identical output for all specified inputs. Deviations from this specification are bugs."));
});

test("doctor-lite: versions agree and the 10 public standard documents exist", () => {
  assert.equal(JSON.parse(read("typescript/package.json")).version, version);
  assert.match(read("rust/Cargo.toml"), new RegExp(`^version = "${version.replace(/\./g, "\\.")}"`, "m"));
  for (const kind of ["changelog", "map", "structure_repo", "full_summary_project", "guide_how_to_use", "how_to_dist", "development_ide", "API", "Lang", "SPEC"]) {
    assert.ok(existsSync(join(root, "docs", `${kind}_LombokSQL_v${version}.md`)), kind);
  }
});

test("doctor-lite (ADR-024): internal documents are never tracked by git", () => {
  let tracked: string;
  try {
    tracked = execFileSync("git", ["ls-files", "docs", "map"], { cwd: root, encoding: "utf8" });
  } catch {
    return; // not a git checkout (for example an extracted archive): nothing to verify
  }
  assert.ok(!/architecture|masterplan/i.test(tracked), tracked);
  assert.ok(!/^map\//m.test(tracked));
});

test("doctor-lite: license files are real texts and match the SPDX expression", () => {
  assert.ok(readFileSync(join(root, "LICENSE-APACHE")).length >= 1000);
  assert.ok(readFileSync(join(root, "LICENSE-MIT")).length >= 1000);
  assert.equal(JSON.parse(read("typescript/package.json")).license, "Apache-2.0 OR MIT");
  assert.match(read("rust/Cargo.toml"), /license = "Apache-2\.0 OR MIT"/);
});

test("doctor-lite: public markdown has no emoji and no forbidden ownership phrases", () => {
  const files = ["README.md", "CHANGELOG.md", "SECURITY.md", "CONTRIBUTING.md", "vectors/README.md", "docs/TECH_DEBT.md"];
  const docs = ["changelog", "map", "structure_repo", "full_summary_project", "guide_how_to_use", "how_to_dist", "development_ide", "API", "Lang", "SPEC"];
  for (const d of docs) files.push(`docs/${d}_LombokSQL_v${version}.md`);
  const emoji = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
  const forbidden = /Part of \[?LombokRAG|Library\s*#\d+|Peran di RAG|Role in RAG|Purpose in RAG|bagian dari Lombok(RAG|Clarion|DocFlow|PDF|AgenticAuto|Miner|DNSProxy|Proxy)|khusus (untuk )?RAG/;
  for (const f of files) {
    const text = read(f);
    assert.ok(!emoji.test(text), `emoji in ${f}`);
    if (f !== `docs/map_LombokSQL_v${version}.md`) assert.ok(!forbidden.test(text), `forbidden phrase in ${f}`);
  }
});

test("doctor-lite: .gitignore carries the three ADR-024 lines", () => {
  const g = read(".gitignore");
  for (const line of ["/map", "/docs/*architecture*.*", "/docs/*masterplan*.*"]) assert.ok(g.split("\n").includes(line), line);
});

test("README quick-start output is exactly what the library produces", async () => {
  const { select, eq, gt, and, compile } = await import("../src/index.js");
  const q = select("u.id", "u.name").from("users u").where(and(eq("u.active", true), gt("u.age", 18))).orderBy("u.id", "desc").limit(10);
  assert.equal(q.build("postgres").sql, 'SELECT "u"."id", "u"."name" FROM "users" AS "u" WHERE "u"."active" = $1 AND "u"."age" > $2 ORDER BY "u"."id" DESC LIMIT 10');
  assert.equal(q.build("mssql").sql, "SELECT [u].[id], [u].[name] FROM [users] AS [u] WHERE [u].[active] = @p1 AND [u].[age] > @p2 ORDER BY [u].[id] DESC OFFSET 0 ROWS FETCH NEXT 10 ROWS ONLY");
  assert.ok(read("README.md").includes(q.build("mssql").sql));
  assert.equal(compile({ type: "select", from: "t", where: { op: "eq", left: "id", right: { value: 1 } } }, "sqlite").sql, 'SELECT * FROM "t" WHERE "id" = ?');
});

test("guide recipes behave as documented", async () => {
  const { select, eq, like, and, insertInto, deleteFrom, gte, inList, LombokSqlError } = await import("../src/index.js");
  assert.equal(select().from("items").where(and()).limit(20).build("postgres").sql, 'SELECT * FROM "items" WHERE 1 = 1 LIMIT 20');
  assert.equal(select().from("items").where(and(eq("status", "a"), like("name", "%x%"))).build("postgres").sql, 'SELECT * FROM "items" WHERE "status" = $1 AND "name" LIKE $2');
  assert.equal(insertInto("counters").columns("key", "n").values("hits", 1).onConflictUpdate(["key"], ["n"]).build("sqlite").sql, 'INSERT INTO "counters" ("key", "n") VALUES (?, ?) ON CONFLICT ("key") DO UPDATE SET "n" = EXCLUDED."n"');
  assert.equal(deleteFrom("tmp_import").all().build("postgres").sql, 'DELETE FROM "tmp_import"');
  assert.throws(() => deleteFrom("tmp_import").build("postgres"), (e: unknown) => e instanceof LombokSqlError && e.code === "missing_where");
  const q = select("id", "email").from("accounts").where(and(eq("status", "active"), gte("created_at", "2026-01-01"), inList("country", ["ID", "MY"]))).orderBy("id").limit(50);
  assert.deepEqual(q.build("postgres").params, ["active", "2026-01-01", "ID", "MY"]);
});
