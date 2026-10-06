// Mutation check for GP-11: inject a defect into the compiled TypeScript core and require the
// vector runner to fail. Usage (from repo root, after `npm test` built typescript/dist-test):
//   node scripts/mutation-test.mjs
import { cpSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ts = join(root, "typescript");
const tmp = join(ts, ".mut");

const MUTATIONS = [
  ['"<>"', '"!="', "ne operator"],
  ['" OR "', '" AND "', "or separator"],
  ['atom(op === "and" ? "1 = 1" : "1 = 0")', 'atom(op === "and" ? "1 = 0" : "1 = 1")', "empty and/or"],
  ['c.kind === "atom" || c.kind === parent', 'c.kind === "atom"', "same-operator flattening"],
  ['c.kind === "atom" || c.kind === parent', "true", "no parentheses at all"],
  ['.split("`").join("``")', '.split("`").join("`")', "mysql backtick escaping"],
  ['.split("]").join("]]")', '.split("]").join("]")', "mssql bracket escaping"],
  ['.split(\'"\').join(\'""\')', '.split(\'"\').join(\'"\')', "double quote escaping"],
  ["`@p${n}`", "`@${n}`", "mssql placeholder"],
  ["`$${n}`", "`?`", "postgres placeholder"],
  ["18446744073709551615", "1844674407370955161", "mysql offset-only limit"],
  ["ORDER BY (SELECT NULL)", "ORDER BY 1", "mssql implicit order"],
  ['ctx.d !== "postgres" && ctx.d !== "sqlite"', 'ctx.d === "mssql"', "returning support matrix"],
  ['if (!optBool(s, "all"))', "if (false)", "unscoped update/delete guard"],
  ["v < 0 ||", "", "negative limit accepted"],
  ["v > MAX_SAFE", "v > MAX_SAFE * 2", "limit upper bound"],
  ["MAX_DEPTH = 64", "MAX_DEPTH = 100000", "depth limit"],
  ["neg ? \"1 = 1\" : \"1 = 0\"", "neg ? \"1 = 0\" : \"1 = 1\"", "empty IN / NOT IN"],
  ["= EXCLUDED.", "= excluded.", "upsert keyword case"],
  ['dir = d.toUpperCase()', 'dir = "ASC"', "order direction"],
  ['if (ctx.d === "postgres")\n                return atom(`${l} ${neg', 'if (ctx.d !== "postgres")\n                return atom(`${l} ${neg', "ilike dialect branch"],
  ['kind === "full" && ctx.d === "mysql"', 'kind === "full" && ctx.d === "sqlite"', "full join support matrix"],
  ['sep = op === "and" ? " AND " : " OR "', 'sep = op === "and" ? " OR " : " AND "', "and/or separators swapped"],
  ["ON CONFLICT (", "ON CONFLICT  (", "upsert spacing"],
  ["VALUES(${c})", "VALUES (${c})", "mysql VALUES() spacing"],
];

const src = readFileSync(join(ts, "dist-test", "src", "compile.js"), "utf8");
let survived = 0;
for (const [find, repl, label] of MUTATIONS) {
  const count = src.split(find).length - 1;
  if (count === 0) { console.log(`SKIP     ${label}: pattern not found`); survived++; continue; }
  rmSync(tmp, { recursive: true, force: true });
  cpSync(join(ts, "dist-test"), tmp, { recursive: true });
  writeFileSync(join(tmp, "src", "compile.js"), src.split(find).join(repl));
  const r = spawnSync(process.execPath, ["--test", join(tmp, "test", "vectors.test.js")], { encoding: "utf8" });
  const killed = r.status !== 0;
  if (!killed) survived++;
  console.log(`${killed ? "KILLED  " : "SURVIVED"} ${label}`);
}
rmSync(tmp, { recursive: true, force: true });
console.log(`\n${MUTATIONS.length - survived}/${MUTATIONS.length} mutants killed`);
process.exit(survived === 0 ? 0 : 1);
