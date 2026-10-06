/**
 * Builder helpers. They only produce the normative JSON AST; compile() does all SQL work.
 * Convention: a bare string on the LEFT of a comparison (or in column lists) is a column;
 * a raw JS value on the RIGHT is a bound parameter. Use col() to force a column on the right.
 */
import { compile, type Compiled, type Scalar } from "./compile.js";

export type Ast = Record<string, unknown>;
export type Expr = string | Ast;

const isAst = (x: unknown): x is Ast => typeof x === "object" && x !== null && !Array.isArray(x);

/** Column reference, optionally aliased. */
export const col = (name: string, as?: string): Ast => (as === undefined ? { col: name } : { col: name, as });
/** Bound parameter. */
export const val = (value: Scalar, as?: string): Ast => (as === undefined ? { value } : { value, as });
/** Trusted raw SQL; every "?" is a placeholder bound to params in order. */
export const raw = (sql: string, params: Scalar[] = [], as?: string): Ast => {
  const o: Ast = { raw: sql, params };
  if (as !== undefined) o["as"] = as;
  return o;
};
/** SQL function call, e.g. fn("count", ["*"]). */
export const fn = (name: string, args: Expr[] = [], opts: { distinct?: boolean; as?: string } = {}): Ast => {
  const o: Ast = { fn: name, args };
  if (opts.distinct) o["distinct"] = true;
  if (opts.as !== undefined) o["as"] = opts.as;
  return o;
};

const left = (x: Expr): Expr => x;
const right = (x: unknown): Expr => (isAst(x) ? (x as Ast) : { value: x as Scalar });

const cmp = (op: string) => (l: Expr, r: unknown): Ast => ({ op, left: left(l), right: right(r) });
export const eq = cmp("eq");
export const ne = cmp("ne");
export const gt = cmp("gt");
export const gte = cmp("gte");
export const lt = cmp("lt");
export const lte = cmp("lte");
export const like = cmp("like");
export const notLike = cmp("notLike");
export const ilike = cmp("ilike");
export const notIlike = cmp("notIlike");
export const and = (...conds: Ast[]): Ast => ({ op: "and", conds });
export const or = (...conds: Ast[]): Ast => ({ op: "or", conds });
export const not = (cond: Ast): Ast => ({ op: "not", cond });
export const isNull = (l: Expr): Ast => ({ op: "isNull", left: l });
export const isNotNull = (l: Expr): Ast => ({ op: "isNotNull", left: l });
export const between = (l: Expr, low: unknown, high: unknown): Ast => ({ op: "between", left: l, low: right(low), high: right(high) });
export const inList = (l: Expr, values: unknown[]): Ast => ({ op: "in", left: l, values: values.map(right) });
export const notInList = (l: Expr, values: unknown[]): Ast => ({ op: "notIn", left: l, values: values.map(right) });
export const inQuery = (l: Expr, q: SelectBuilder): Ast => ({ op: "in", left: l, query: q.toAst() });
export const exists = (q: SelectBuilder): Ast => ({ op: "exists", query: q.toAst() });
export const notExists = (q: SelectBuilder): Ast => ({ op: "notExists", query: q.toAst() });
export const rawCond = (sql: string, params: Scalar[] = []): Ast => ({ op: "raw", sql, params });

type Table = string | { name: string; as?: string } | { query: Ast; as: string };

/** Parse "table" or "table AS alias" / "table alias" shorthand into a table node. */
function tableOf(t: string | Table): Table {
  if (typeof t !== "string") return t;
  const m = /^(\S+)\s+(?:as\s+)?(\S+)$/i.exec(t.trim());
  return m ? { name: m[1] as string, as: m[2] as string } : t;
}

export class SelectBuilder {
  private ast: Ast = { type: "select" };
  columns(...cols: Expr[]): this {
    this.ast["columns"] = [...((this.ast["columns"] as Expr[] | undefined) ?? []), ...cols];
    return this;
  }
  distinct(on = true): this {
    this.ast["distinct"] = on;
    return this;
  }
  from(t: string | Table | SelectBuilder, as?: string): this {
    this.ast["from"] = t instanceof SelectBuilder ? { query: t.toAst(), as: as ?? "t" } : tableOf(t);
    return this;
  }
  private join(kind: string, t: string | Table, on?: Ast): this {
    const j: Ast = { kind, table: tableOf(t) };
    if (on !== undefined) j["on"] = on;
    this.ast["joins"] = [...((this.ast["joins"] as Ast[] | undefined) ?? []), j];
    return this;
  }
  innerJoin(t: string | Table, on: Ast): this { return this.join("inner", t, on); }
  leftJoin(t: string | Table, on: Ast): this { return this.join("left", t, on); }
  rightJoin(t: string | Table, on: Ast): this { return this.join("right", t, on); }
  fullJoin(t: string | Table, on: Ast): this { return this.join("full", t, on); }
  crossJoin(t: string | Table): this { return this.join("cross", t); }
  /** Repeated calls are combined with AND. */
  where(cond: Ast): this {
    const prev = this.ast["where"] as Ast | undefined;
    this.ast["where"] = prev === undefined ? cond : and(prev, cond);
    return this;
  }
  groupBy(...exprs: Expr[]): this {
    this.ast["groupBy"] = [...((this.ast["groupBy"] as Expr[] | undefined) ?? []), ...exprs];
    return this;
  }
  having(cond: Ast): this {
    this.ast["having"] = cond;
    return this;
  }
  orderBy(expr: Expr, dir: "asc" | "desc" = "asc"): this {
    this.ast["orderBy"] = [...((this.ast["orderBy"] as Ast[] | undefined) ?? []), { expr, dir }];
    return this;
  }
  limit(n: number): this {
    this.ast["limit"] = n;
    return this;
  }
  offset(n: number): this {
    this.ast["offset"] = n;
    return this;
  }
  toAst(): Ast {
    return JSON.parse(JSON.stringify(this.ast)) as Ast;
  }
  build(dialect: string): Compiled {
    return compile(this.ast, dialect);
  }
}

export class InsertBuilder {
  private ast: Ast = { type: "insert", columns: [], rows: [] };
  constructor(table: string) {
    this.ast["into"] = table;
  }
  columns(...names: string[]): this {
    this.ast["columns"] = names;
    return this;
  }
  /** One row of values aligned with columns(). Raw JS values become bound parameters. */
  values(...cells: unknown[]): this {
    (this.ast["rows"] as unknown[][]).push(cells.map(right));
    return this;
  }
  onConflictDoNothing(target: string[] = []): this {
    this.ast["onConflict"] = target.length > 0 ? { target, doNothing: true } : { doNothing: true };
    return this;
  }
  onConflictUpdate(target: string[], update: string[]): this {
    this.ast["onConflict"] = { target, update };
    return this;
  }
  returning(...cols: Expr[]): this {
    this.ast["returning"] = cols;
    return this;
  }
  toAst(): Ast {
    return JSON.parse(JSON.stringify(this.ast)) as Ast;
  }
  build(dialect: string): Compiled {
    return compile(this.ast, dialect);
  }
}

export class UpdateBuilder {
  private ast: Ast = { type: "update", set: [] };
  constructor(table: string) {
    this.ast["table"] = table;
  }
  set(column: string, value: unknown): this {
    (this.ast["set"] as Ast[]).push({ col: column, expr: right(value) });
    return this;
  }
  where(cond: Ast): this {
    const prev = this.ast["where"] as Ast | undefined;
    this.ast["where"] = prev === undefined ? cond : and(prev, cond);
    return this;
  }
  /** Explicitly allow an update without WHERE. */
  all(): this {
    this.ast["all"] = true;
    return this;
  }
  returning(...cols: Expr[]): this {
    this.ast["returning"] = cols;
    return this;
  }
  toAst(): Ast {
    return JSON.parse(JSON.stringify(this.ast)) as Ast;
  }
  build(dialect: string): Compiled {
    return compile(this.ast, dialect);
  }
}

export class DeleteBuilder {
  private ast: Ast = { type: "delete" };
  constructor(table: string) {
    this.ast["from"] = table;
  }
  where(cond: Ast): this {
    const prev = this.ast["where"] as Ast | undefined;
    this.ast["where"] = prev === undefined ? cond : and(prev, cond);
    return this;
  }
  /** Explicitly allow a delete without WHERE. */
  all(): this {
    this.ast["all"] = true;
    return this;
  }
  returning(...cols: Expr[]): this {
    this.ast["returning"] = cols;
    return this;
  }
  toAst(): Ast {
    return JSON.parse(JSON.stringify(this.ast)) as Ast;
  }
  build(dialect: string): Compiled {
    return compile(this.ast, dialect);
  }
}

export const select = (...cols: Expr[]): SelectBuilder => (cols.length > 0 ? new SelectBuilder().columns(...cols) : new SelectBuilder());
export const insertInto = (table: string): InsertBuilder => new InsertBuilder(table);
export const update = (table: string): UpdateBuilder => new UpdateBuilder(table);
export const deleteFrom = (table: string): DeleteBuilder => new DeleteBuilder(table);
