/**
 * LombokSQL core: deterministic compiler from a JSON AST to SQL text + ordered parameters.
 * Normative contract: docs/SPEC_LombokSQL_v0.1.0.md. Zero runtime dependencies.
 */

export type Dialect = "postgres" | "mysql" | "sqlite" | "mssql";
export type Scalar = null | boolean | number | string;

export interface Compiled {
  sql: string;
  params: Scalar[];
}

export type ErrorCode =
  | "invalid_ast"
  | "invalid_identifier"
  | "invalid_dialect"
  | "invalid_limit"
  | "unsupported_feature"
  | "missing_where"
  | "too_deep";

export class LombokSqlError extends Error {
  readonly code: ErrorCode;
  readonly messageId: string;
  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = "LombokSqlError";
    this.code = code;
    this.messageId = `lomboksql.error.${code}`;
  }
}

const MAX_DEPTH = 64;
const MAX_SAFE = 9007199254740991;
const FN_NAME = /^[A-Za-z_][A-Za-z0-9_.]*$/;
const DIALECTS: readonly string[] = ["postgres", "mysql", "sqlite", "mssql"];

type Obj = Record<string, unknown>;
interface Ctx {
  d: Dialect;
  params: Scalar[];
}
interface CondOut {
  sql: string;
  kind: "and" | "or" | "atom";
}

function fail(code: ErrorCode, message: string): never {
  throw new LombokSqlError(code, message);
}
function isObj(v: unknown): v is Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function has(o: Obj, k: string): boolean {
  return Object.prototype.hasOwnProperty.call(o, k) && o[k] !== undefined;
}
function strOf(v: unknown, what: string): string {
  if (typeof v !== "string") fail("invalid_ast", `${what} must be a string`);
  return v;
}
function arrOf(v: unknown, what: string): unknown[] {
  if (!Array.isArray(v)) fail("invalid_ast", `${what} must be an array`);
  return v;
}
function optBool(o: Obj, k: string): boolean {
  if (!has(o, k)) return false;
  if (typeof o[k] !== "boolean") fail("invalid_ast", `${k} must be a boolean`);
  return o[k] as boolean;
}
function isScalar(v: unknown): v is Scalar {
  return v === null || typeof v === "boolean" || typeof v === "string" || (typeof v === "number" && Number.isFinite(v));
}
function checkDepth(depth: number): void {
  if (depth > MAX_DEPTH) fail("too_deep", "AST nesting exceeds 64 levels");
}

function quotePart(d: Dialect, s: string): string {
  if (s.length === 0 || s.includes("\u0000")) fail("invalid_identifier", "identifier is empty or contains NUL");
  if (d === "mysql") return "`" + s.split("`").join("``") + "`";
  if (d === "mssql") return "[" + s.split("]").join("]]") + "]";
  return '"' + s.split('"').join('""') + '"';
}
function quotePath(d: Dialect, s: string): string {
  const parts = s.split(".");
  return parts
    .map((p, i) => (p === "*" && i === parts.length - 1 ? "*" : quotePart(d, p)))
    .join(".");
}
function placeholder(ctx: Ctx, v: Scalar): string {
  ctx.params.push(v);
  const n = ctx.params.length;
  if (ctx.d === "postgres") return `$${n}`;
  if (ctx.d === "mssql") return `@p${n}`;
  return "?";
}
function rawSql(ctx: Ctx, sql: unknown, params: unknown): string {
  const text = strOf(sql, "raw");
  if (text.length === 0) fail("invalid_ast", "raw must not be empty");
  const list = params === undefined ? [] : arrOf(params, "params");
  let out = "";
  let i = 0;
  for (const ch of text) {
    if (ch === "?") {
      if (i >= list.length) fail("invalid_ast", "raw has more placeholders than params");
      const v = list[i++];
      if (!isScalar(v)) fail("invalid_ast", "raw param must be a scalar");
      out += placeholder(ctx, v);
    } else {
      out += ch;
    }
  }
  if (i !== list.length) fail("invalid_ast", "raw has fewer placeholders than params");
  return out;
}

function exprSql(ctx: Ctx, e: unknown, depth: number, aliasOk: boolean): string {
  checkDepth(depth);
  if (typeof e === "string") return quotePath(ctx.d, e);
  if (!isObj(e)) fail("invalid_ast", "expression must be a string or an object");
  const keys = ["col", "value", "raw", "fn", "query"].filter((k) => has(e, k));
  if (keys.length !== 1) fail("invalid_ast", "expression needs exactly one of col, value, raw, fn, query");
  let out: string;
  switch (keys[0]) {
    case "col":
      out = quotePath(ctx.d, strOf(e["col"], "col"));
      break;
    case "value": {
      const v = e["value"];
      if (!isScalar(v)) fail("invalid_ast", "value must be a scalar");
      out = placeholder(ctx, v);
      break;
    }
    case "raw":
      out = rawSql(ctx, e["raw"], e["params"]);
      break;
    case "fn": {
      const name = strOf(e["fn"], "fn");
      if (!FN_NAME.test(name)) fail("invalid_ast", "invalid function name");
      const distinct = optBool(e, "distinct");
      const args = has(e, "args") ? arrOf(e["args"], "args") : [];
      const list: string[] = [];
      for (const a of args) list.push(exprSql(ctx, a, depth + 1, false));
      out = `${name.toUpperCase()}(${distinct ? "DISTINCT " : ""}${list.join(", ")})`;
      break;
    }
    default:
      out = "(" + selectSql(ctx, e["query"], depth + 1) + ")";
  }
  if (aliasOk && has(e, "as")) out += " AS " + quotePart(ctx.d, strOf(e["as"], "as"));
  return out;
}

const CMP: Record<string, string> = { eq: "=", ne: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=" };

function wrap(c: CondOut, parent: "and" | "or"): string {
  return c.kind === "atom" || c.kind === parent ? c.sql : `(${c.sql})`;
}

function condSql(ctx: Ctx, c: unknown, depth: number): CondOut {
  checkDepth(depth);
  if (!isObj(c)) fail("invalid_ast", "condition must be an object");
  const op = strOf(c["op"], "op");
  const ex = (k: string): string => {
    if (!has(c, k)) fail("invalid_ast", `${op} requires ${k}`);
    return exprSql(ctx, c[k], depth + 1, false);
  };
  const atom = (sql: string): CondOut => ({ sql, kind: "atom" });
  switch (op) {
    case "and":
    case "or": {
      const list = arrOf(c["conds"], "conds");
      const parts: CondOut[] = [];
      for (const x of list) parts.push(condSql(ctx, x, depth + 1));
      if (parts.length === 0) return atom(op === "and" ? "1 = 1" : "1 = 0");
      if (parts.length === 1) return parts[0] as CondOut;
      const sep = op === "and" ? " AND " : " OR ";
      return { sql: parts.map((p) => wrap(p, op)).join(sep), kind: op };
    }
    case "not": {
      if (!has(c, "cond")) fail("invalid_ast", "not requires cond");
      const inner = condSql(ctx, c["cond"], depth + 1);
      return atom(`NOT (${inner.sql})`);
    }
    case "eq":
    case "ne":
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      const l = ex("left");
      const r = ex("right");
      return atom(`${l} ${CMP[op]} ${r}`);
    }
    case "like":
    case "notLike": {
      const l = ex("left");
      const r = ex("right");
      return atom(`${l} ${op === "like" ? "LIKE" : "NOT LIKE"} ${r}`);
    }
    case "ilike":
    case "notIlike": {
      const l = ex("left");
      const r = ex("right");
      const neg = op === "notIlike";
      if (ctx.d === "postgres") return atom(`${l} ${neg ? "NOT ILIKE" : "ILIKE"} ${r}`);
      return atom(`LOWER(${l}) ${neg ? "NOT LIKE" : "LIKE"} LOWER(${r})`);
    }
    case "in":
    case "notIn": {
      const neg = op === "notIn";
      if (has(c, "query")) {
        const l = ex("left");
        return atom(`${l} ${neg ? "NOT IN" : "IN"} (${selectSql(ctx, c["query"], depth + 1)})`);
      }
      const values = arrOf(c["values"], "values");
      if (values.length === 0) return atom(neg ? "1 = 1" : "1 = 0");
      const l = ex("left");
      const list: string[] = [];
      for (const v of values) list.push(exprSql(ctx, v, depth + 1, false));
      return atom(`${l} ${neg ? "NOT IN" : "IN"} (${list.join(", ")})`);
    }
    case "between":
    case "notBetween": {
      const l = ex("left");
      const lo = ex("low");
      const hi = ex("high");
      return atom(`${l} ${op === "between" ? "BETWEEN" : "NOT BETWEEN"} ${lo} AND ${hi}`);
    }
    case "isNull":
    case "isNotNull": {
      const l = ex("left");
      return atom(`${l} ${op === "isNull" ? "IS NULL" : "IS NOT NULL"}`);
    }
    case "exists":
    case "notExists": {
      if (!has(c, "query")) fail("invalid_ast", `${op} requires query`);
      return atom(`${op === "exists" ? "EXISTS" : "NOT EXISTS"} (${selectSql(ctx, c["query"], depth + 1)})`);
    }
    case "raw":
      return atom(rawSql(ctx, c["sql"], c["params"]));
    default:
      return fail("invalid_ast", `unknown condition op: ${op}`);
  }
}

function tableSql(ctx: Ctx, t: unknown, depth: number): string {
  checkDepth(depth);
  if (typeof t === "string") return quotePath(ctx.d, t);
  if (!isObj(t)) fail("invalid_ast", "table must be a string or an object");
  if (has(t, "query")) {
    if (!has(t, "as")) fail("invalid_ast", "subquery table requires as");
    const inner = selectSql(ctx, t["query"], depth + 1);
    return `(${inner}) AS ${quotePart(ctx.d, strOf(t["as"], "as"))}`;
  }
  if (!has(t, "name")) fail("invalid_ast", "table object requires name or query");
  let out = quotePath(ctx.d, strOf(t["name"], "name"));
  if (has(t, "as")) out += " AS " + quotePart(ctx.d, strOf(t["as"], "as"));
  return out;
}

function plainTable(ctx: Ctx, t: unknown): string {
  return quotePath(ctx.d, strOf(t, "table"));
}

function intField(o: Obj, k: string): number | undefined {
  if (!has(o, k)) return undefined;
  const v = o[k];
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > MAX_SAFE) {
    fail("invalid_limit", `${k} must be a non-negative integer <= 9007199254740991`);
  }
  return v;
}

function selectSql(ctx: Ctx, s: unknown, depth: number): string {
  checkDepth(depth);
  if (!isObj(s) || s["type"] !== "select") fail("invalid_ast", "select statement expected");
  let out = "SELECT";
  if (optBool(s, "distinct")) out += " DISTINCT";
  const cols = has(s, "columns") ? arrOf(s["columns"], "columns") : [];
  if (cols.length === 0) {
    out += " *";
  } else {
    const list: string[] = [];
    for (const c of cols) list.push(exprSql(ctx, c, depth + 1, true));
    out += " " + list.join(", ");
  }
  if (!has(s, "from")) fail("invalid_ast", "select requires from");
  out += " FROM " + tableSql(ctx, s["from"], depth + 1);
  if (has(s, "joins")) {
    for (const j of arrOf(s["joins"], "joins")) {
      if (!isObj(j)) fail("invalid_ast", "join must be an object");
      const kind = has(j, "kind") ? strOf(j["kind"], "kind") : "inner";
      if (!["inner", "left", "right", "full", "cross"].includes(kind)) fail("invalid_ast", "unknown join kind");
      if (kind === "full" && ctx.d === "mysql") fail("unsupported_feature", "FULL JOIN is not supported by mysql");
      if (!has(j, "table")) fail("invalid_ast", "join requires table");
      out += ` ${kind.toUpperCase()} JOIN ` + tableSql(ctx, j["table"], depth + 1);
      if (kind === "cross") {
        if (has(j, "on")) fail("invalid_ast", "cross join must not have on");
      } else {
        if (!has(j, "on")) fail("invalid_ast", "join requires on");
        out += " ON " + condSql(ctx, j["on"], depth + 1).sql;
      }
    }
  }
  if (has(s, "where")) out += " WHERE " + condSql(ctx, s["where"], depth + 1).sql;
  if (has(s, "groupBy")) {
    const g = arrOf(s["groupBy"], "groupBy");
    if (g.length > 0) {
      const list: string[] = [];
      for (const x of g) list.push(exprSql(ctx, x, depth + 1, false));
      out += " GROUP BY " + list.join(", ");
    }
  }
  if (has(s, "having")) out += " HAVING " + condSql(ctx, s["having"], depth + 1).sql;
  let ordered = false;
  if (has(s, "orderBy")) {
    const o = arrOf(s["orderBy"], "orderBy");
    if (o.length > 0) {
      const list: string[] = [];
      for (const item of o) {
        let target: unknown = item;
        let dir = "ASC";
        if (isObj(item) && has(item, "expr")) {
          target = item["expr"];
          if (has(item, "dir")) {
            const d = strOf(item["dir"], "dir");
            if (d !== "asc" && d !== "desc") fail("invalid_ast", "dir must be asc or desc");
            dir = d.toUpperCase();
          }
        }
        list.push(exprSql(ctx, target, depth + 1, false) + " " + dir);
      }
      out += " ORDER BY " + list.join(", ");
      ordered = true;
    }
  }
  const limit = intField(s, "limit");
  const offset = intField(s, "offset");
  if (limit !== undefined || offset !== undefined) {
    if (ctx.d === "mssql") {
      if (!ordered) out += " ORDER BY (SELECT NULL)";
      out += ` OFFSET ${offset ?? 0} ROWS`;
      if (limit !== undefined) out += ` FETCH NEXT ${limit} ROWS ONLY`;
    } else {
      if (limit !== undefined) out += ` LIMIT ${limit}`;
      else if (ctx.d === "mysql") out += " LIMIT 18446744073709551615";
      else if (ctx.d === "sqlite") out += " LIMIT -1";
      if (offset !== undefined) out += ` OFFSET ${offset}`;
    }
  }
  return out;
}

function returningSql(ctx: Ctx, s: Obj, depth: number): string {
  if (!has(s, "returning")) return "";
  const r = arrOf(s["returning"], "returning");
  if (r.length === 0) return "";
  if (ctx.d !== "postgres" && ctx.d !== "sqlite") fail("unsupported_feature", "RETURNING is supported by postgres and sqlite only");
  const list: string[] = [];
  for (const x of r) list.push(exprSql(ctx, x, depth + 1, true));
  return " RETURNING " + list.join(", ");
}

function nameList(ctx: Ctx, v: unknown, what: string): string[] {
  const a = arrOf(v, what);
  if (a.length === 0) fail("invalid_ast", `${what} must not be empty`);
  return a.map((x) => quotePart(ctx.d, strOf(x, what)));
}

function insertSql(ctx: Ctx, s: Obj, depth: number): string {
  const table = plainTable(ctx, s["into"]);
  const cols = nameList(ctx, s["columns"], "columns");
  const rows = arrOf(s["rows"], "rows");
  if (rows.length === 0) fail("invalid_ast", "rows must not be empty");
  const tuples: string[] = [];
  for (const row of rows) {
    const r = arrOf(row, "row");
    if (r.length !== cols.length) fail("invalid_ast", "row length must equal columns length");
    const cells: string[] = [];
    for (const cell of r) cells.push(exprSql(ctx, cell, depth + 1, false));
    tuples.push(`(${cells.join(", ")})`);
  }
  let ignore = false;
  let conflict = "";
  if (has(s, "onConflict")) {
    const oc = s["onConflict"];
    if (!isObj(oc)) fail("invalid_ast", "onConflict must be an object");
    const nothing = optBool(oc, "doNothing");
    const upd = has(oc, "update");
    if (nothing === upd) fail("invalid_ast", "onConflict needs exactly one of doNothing, update");
    if (ctx.d === "mssql") fail("unsupported_feature", "upsert is not supported by mssql");
    const target = has(oc, "target") ? nameList(ctx, oc["target"], "target") : [];
    if (nothing) {
      if (ctx.d === "mysql") ignore = true;
      else conflict = " ON CONFLICT" + (target.length > 0 ? ` (${target.join(", ")})` : "") + " DO NOTHING";
    } else {
      const set = nameList(ctx, oc["update"], "update");
      if (ctx.d === "mysql") {
        conflict = " ON DUPLICATE KEY UPDATE " + set.map((c) => `${c} = VALUES(${c})`).join(", ");
      } else {
        if (target.length === 0) fail("invalid_ast", "update upsert requires target");
        conflict = ` ON CONFLICT (${target.join(", ")}) DO UPDATE SET ` + set.map((c) => `${c} = EXCLUDED.${c}`).join(", ");
      }
    }
  }
  const ret = returningSql(ctx, s, depth);
  return `INSERT ${ignore ? "IGNORE " : ""}INTO ${table} (${cols.join(", ")}) VALUES ${tuples.join(", ")}${conflict}${ret}`;
}

function updateSql(ctx: Ctx, s: Obj, depth: number): string {
  const table = plainTable(ctx, s["table"]);
  const set = arrOf(s["set"], "set");
  if (set.length === 0) fail("invalid_ast", "set must not be empty");
  const items: string[] = [];
  for (const it of set) {
    if (!isObj(it) || !has(it, "col") || !has(it, "expr")) fail("invalid_ast", "set item needs col and expr");
    const col = quotePart(ctx.d, strOf(it["col"], "col"));
    items.push(`${col} = ${exprSql(ctx, it["expr"], depth + 1, false)}`);
  }
  let out = `UPDATE ${table} SET ${items.join(", ")}`;
  out += scopeSql(ctx, s, depth);
  return out + returningSql(ctx, s, depth);
}

function scopeSql(ctx: Ctx, s: Obj, depth: number): string {
  if (has(s, "where")) {
    optBool(s, "all");
    return " WHERE " + condSql(ctx, s["where"], depth + 1).sql;
  }
  if (!optBool(s, "all")) fail("missing_where", "update/delete without where requires all: true");
  return "";
}

function deleteSql(ctx: Ctx, s: Obj, depth: number): string {
  const table = plainTable(ctx, s["from"]);
  const out = `DELETE FROM ${table}` + scopeSql(ctx, s, depth);
  return out + returningSql(ctx, s, depth);
}

/** Compile a statement AST for a dialect. Throws LombokSqlError on any invalid input. */
export function compile(ast: unknown, dialect: string): Compiled {
  if (!DIALECTS.includes(dialect)) fail("invalid_dialect", `unknown dialect: ${dialect}`);
  const ctx: Ctx = { d: dialect as Dialect, params: [] };
  if (!isObj(ast)) fail("invalid_ast", "statement must be an object");
  const type = strOf(ast["type"], "type");
  let sql: string;
  switch (type) {
    case "select":
      sql = selectSql(ctx, ast, 0);
      break;
    case "insert":
      sql = insertSql(ctx, ast, 0);
      break;
    case "update":
      sql = updateSql(ctx, ast, 0);
      break;
    case "delete":
      sql = deleteSql(ctx, ast, 0);
      break;
    default:
      return fail("invalid_ast", `unknown statement type: ${type}`);
  }
  return { sql, params: ctx.params };
}
