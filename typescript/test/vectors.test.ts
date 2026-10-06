import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { compile, LombokSqlError } from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const vectorPath = join(here, "..", "..", "..", "vectors", "lomboksql-vectors-v1.json");
const doc = JSON.parse(readFileSync(vectorPath, "utf8")) as {
  groups: { name: string; cases: { name: string; dialect: string; ast: unknown; expect: { sql?: string; params?: unknown[]; error?: string } }[] }[];
};

let total = 0;
for (const group of doc.groups) {
  test(`vectors: ${group.name} (${group.cases.length} cases)`, () => {
    for (const k of group.cases) {
      total++;
      if (k.expect.error !== undefined) {
        assert.throws(() => compile(k.ast, k.dialect), (err: unknown) => err instanceof LombokSqlError && err.code === k.expect.error, k.name);
      } else {
        const r = compile(k.ast, k.dialect);
        assert.equal(r.sql, k.expect.sql, k.name);
        assert.deepEqual(r.params, k.expect.params, k.name);
      }
    }
  });
}
test("vector count meets GP-11 (>= 100)", () => {
  assert.ok(total >= 100, `executed ${total}`);
});
