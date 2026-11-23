import { splitLines } from "../util.js";
import { parseFlow, textHasVarRef } from "./transaction_model.js";
import type { FlowBlock, FlowModel, FlowStep } from "./transaction_model.js";
import type { LintContext, Rule, RuleOptions, SourceFile, Statement, Violation } from "./types.js";

const WRITE_OPS = new Set(["db.edit", "db.patch", "db.add_or_edit"]);
const HELD_KEY_WRITE_OPS = new Set(["db.edit", "db.patch"]);
const RETURNING_WRITE_OPS = new Set(["db.edit", "db.patch", "db.add_or_edit", "db.add"]);
const READ_OPS = new Set(["db.get", "db.query"]);
const LOOP_KEYWORDS = new Set(["foreach", "for", "while"]);
const CONDITIONAL_BRANCHES = new Set(["if", "elseif", "else"]);
const SWITCH_BRANCHES = new Set(["case", "default"]);
const EXIT_KEYWORDS = new Set(["throw", "return"]);
const TYPE_SINGLE = /type\s*:\s*["']single["']/;
const TYPE_LIST = /type\s*:\s*["']list["']/;
const TYPE_ANY = /type\s*:/;
const PAGING = /\bpaging\s*:/;
const FIRST_SORT_KEY =
  /^\s*(?:"([^"]*)"|'([^']*)'|([A-Za-z_][A-Za-z0-9_.]*))\s*:\s*["']([A-Za-z]+)["']/;
const ID_FIELD = /^\s*["']id["']\s*$/;
const EACH_AS = /^\s*each\s+as\s+\$([A-Za-z_][A-Za-z0-9_]*)\b/;
const LIST_SOURCE = /^\(\s*\$([A-Za-z_][A-Za-z0-9_]*)(?:\.items)?\s*\)$/;
const SET_SEGMENT = /^\s*set\s*:\s*(["'])([^"']*)\1\s*:/;
const MAX_LOOP_PASSES = 64;

type Shape = "single" | "list" | "locked_list" | "stale" | "stale_list";

interface Origin {
  read: Statement;
  shape: Shape;
}

interface Loop {
  line: number;
  endLine: number;
}

interface Taint {
  origin: Origin;
  path: string[];
  loops: Loop[];
  heldBy: string | null;
}

type Env = Map<string, Taint[]>;

interface State {
  env: Env;
  held: Set<string>;
  dead: boolean;
}

interface LoopFrame {
  continues: State[];
  breaks: State[];
}

type Exit = "continue" | "break" | "leave";

interface FinallyFrame {
  pending: { exit: Exit; state: State }[];
}

type ControlFrame = { loop: LoopFrame } | FinallyFrame;

interface Hit {
  origin: Origin;
  write: Statement;
  path: string[];
}

export const transactionLocks: Rule = {
  id: "transaction_locks",
  description:
    "a db.get or single db.query whose value (directly or through var, var.update, foreach items, or reads keyed by it) feeds a later write of that table must be locked in the write's db.transaction; a list db.query whose items drive per-row db.edit / db.patch / db.add_or_edit of that table must be locked there and sorted by id ascending",
  defaultEnabled: false,
  defaultSeverity: "error",
  lint(file: SourceFile, options: RuleOptions, context?: LintContext): Violation[] {
    const severity = options.severity ?? transactionLocks.defaultSeverity;
    if (context === undefined) {
      return [];
    }
    const parsed = context.parsed(file);
    const analysis = new LockAnalysis(
      splitLines(file.text),
      parseFlow(file.text),
      parsed.statements,
      context.isCallerTransaction(file.path),
    );
    const roots = analysis.flow.blocks;
    if (parsed.units.length === 0) {
      analysis.run(roots);
    }
    for (const unit of parsed.units) {
      const root = roots.find((block) => block.line === unit.line);
      if (root !== undefined) {
        analysis.run(root.children);
      }
    }
    return [...analysis.hits.values()]
      .sort((a, b) => a.origin.read.line - b.origin.read.line)
      .map((hit) => ({
        ruleId: transactionLocks.id,
        message: message(
          hit.origin,
          hit.write,
          hit.path,
          analysis.txOf(hit.origin.read),
          analysis.txOf(hit.write),
          sortsByIdAsc(analysis.flow.member(hit.origin.read, "sort"), hit.origin.read.arg ?? ""),
        ),
        severity,
        file: file.path,
        line: hit.origin.read.line + 1,
        column: hit.origin.read.column,
      }));
  },
};

class LockAnalysis {
  readonly hits = new Map<Statement, Hit>();
  private readonly statements = new Map<number, Statement>();
  private readonly steps = new Map<number, FlowStep>();
  private readonly origins = new Map<string, Origin>();
  private readonly control: ControlFrame[] = [];
  private readonly activeLoops: Loop[] = [];
  private readonly tryFrames: State[][] = [];

  constructor(
    private readonly lines: string[],
    readonly flow: FlowModel,
    statements: Statement[],
    private readonly callerTx: boolean,
  ) {
    for (const stmt of statements) {
      this.statements.set(stmt.line, stmt);
    }
    for (const step of flow.steps) {
      this.steps.set(step.line, step);
    }
  }

  txOf(stmt: Statement): string | null {
    if (this.callerTx) {
      return "caller";
    }
    const tx = stmt.txLines[stmt.txLines.length - 1];
    return tx === undefined ? null : String(tx);
  }

  run(blocks: FlowBlock[]): void {
    this.execAll(blocks, { env: new Map(), held: new Set(), dead: false });
  }

  private execAll(blocks: FlowBlock[], state: State): State {
    let current = state;
    for (const block of blocks) {
      if (current.dead) {
        break;
      }
      this.tryFrames[this.tryFrames.length - 1]?.push(clone(current));
      current = this.exec(block, current);
    }
    return current;
  }

  private exec(block: FlowBlock, state: State): State {
    if (block.keyword === "test") {
      return state;
    }
    if (block.keyword === "continue" || block.keyword === "break") {
      this.exitTo(block.keyword, state);
      return deadState();
    }
    const stmt = this.statements.get(block.line);
    if (stmt !== undefined) {
      if (stmt.inTest) {
        return state;
      }
      if (stmt.op === "db.transaction") {
        const before = new Set(state.held);
        const out = this.execAll(block.children, state);
        return out.dead || this.callerTx ? out : { env: release(out.env, String(stmt.line)), held: before, dead: false };
      }
      return this.applyStatement(stmt, state);
    }
    const step = this.steps.get(block.line);
    if (step !== undefined && step.kind !== "foreach") {
      return step.inTest ? state : this.applyAssign(step, state);
    }
    if (block.keyword === "conditional") {
      return this.execBranches(block, state, CONDITIONAL_BRANCHES, "else");
    }
    if (block.keyword === "switch") {
      return this.execBranches(block, state, SWITCH_BRANCHES, "default");
    }
    if (LOOP_KEYWORDS.has(block.keyword)) {
      return this.execLoop(block, state, step);
    }
    if (block.keyword === "try_catch") {
      return this.execTryCatch(block, state);
    }
    if (EXIT_KEYWORDS.has(block.keyword)) {
      this.exitTo("leave", state);
      return deadState();
    }
    const out = this.execAll(block.children, state);
    if (block.asVar !== null && !out.dead) {
      out.env.delete(block.asVar);
      dropVar(out.held, block.asVar);
    }
    return out;
  }

  private execBranches(block: FlowBlock, state: State, keywords: Set<string>, fallback: string): State {
    const branches = block.children.filter((child) => keywords.has(child.keyword));
    const outs = branches.map((branch) => this.execAll(branch.children, clone(state)));
    if (!branches.some((branch) => branch.keyword === fallback)) {
      outs.push(state);
    }
    return merge(outs);
  }

  private execLoop(block: FlowBlock, entry: State, step: FlowStep | undefined): State {
    const each = block.children.find((child) => child.keyword === "each");
    const body = each?.children ?? block.children;
    const index = each === undefined || step !== undefined
      ? null
      : (EACH_AS.exec(this.lines[each.line])?.[1] ?? null);
    const loop = { line: block.line, endLine: block.endLine };
    let top = clone(entry);
    let pass = this.iterate(body, step, index, top, loop);
    let converged = false;
    for (let count = 1; count < MAX_LOOP_PASSES; count += 1) {
      const next = merge([entry, pass.end]);
      if (signature(next) === signature(top)) {
        converged = true;
        break;
      }
      top = next;
      pass = this.iterate(body, step, index, top, loop);
    }
    if (!converged) {
      const widened = this.iterate(body, step, index, widen(merge([entry, pass.end])), loop);
      pass = { end: merge([pass.end, widened.end]), breaks: [...pass.breaks, ...widened.breaks] };
    }
    return merge([entry, pass.end, ...pass.breaks]);
  }

  private iterate(
    body: FlowBlock[],
    step: FlowStep | undefined,
    index: string | null,
    top: State,
    loop: Loop,
  ): { end: State; breaks: State[] } {
    const iteration = clone(top);
    if (step !== undefined) {
      this.assignItem(step, iteration, loop);
    } else if (index !== null) {
      iteration.env.delete(index);
      dropVar(iteration.held, index);
    }
    const frame: LoopFrame = { continues: [], breaks: [] };
    this.control.push({ loop: frame });
    this.activeLoops.push(loop);
    const out = this.execAll(body, iteration);
    this.activeLoops.pop();
    this.control.pop();
    return { end: merge([out, ...frame.continues]), breaks: frame.breaks };
  }

  private execTryCatch(block: FlowBlock, state: State): State {
    const part = (keyword: string) => block.children.find((child) => child.keyword === keyword);
    const tryPart = part("try");
    const catchPart = part("catch");
    const finallyPart = part("finally");
    const frame: FinallyFrame = { pending: [] };
    if (finallyPart !== undefined) {
      this.control.push(frame);
    }
    const throwSites: State[] = [];
    this.tryFrames.push(throwSites);
    const tried = tryPart === undefined ? clone(state) : this.execAll(tryPart.children, clone(state));
    this.tryFrames.pop();
    let out = tried;
    const escaped: State[] = [];
    if (catchPart !== undefined) {
      this.tryFrames.push(escaped);
      out = merge([tried, this.execAll(catchPart.children, merge([state, ...throwSites]))]);
      this.tryFrames.pop();
    } else {
      escaped.push(clone(state), ...throwSites);
    }
    this.tryFrames[this.tryFrames.length - 1]?.push(...escaped);
    if (finallyPart === undefined) {
      return out;
    }
    this.control.pop();
    for (const exit of ["continue", "break", "leave"] as const) {
      const entries = frame.pending.filter((p) => p.exit === exit).map((p) => p.state);
      if (exit === "leave") {
        entries.push(...escaped);
      }
      if (entries.length === 0) {
        continue;
      }
      const after = this.execAll(finallyPart.children, merge(entries));
      if (!after.dead) {
        this.exitTo(exit, after);
      }
    }
    return this.execAll(finallyPart.children, out);
  }

  private exitTo(exit: Exit, state: State): void {
    for (let i = this.control.length - 1; i >= 0; i -= 1) {
      const frame = this.control[i];
      if ("pending" in frame) {
        frame.pending.push({ exit, state: clone(state) });
        return;
      }
      if (exit !== "leave") {
        (exit === "continue" ? frame.loop.continues : frame.loop.breaks).push(clone(state));
        return;
      }
    }
  }

  private assignItem(step: FlowStep, state: State, loop: Loop): void {
    const source = LIST_SOURCE.exec(step.source.trim())?.[1] ?? null;
    const lockedTables = source === null ? [] : heldTables(state.held, source, "[]");
    state.env.set(step.name, derive(state.env, step.source, step.name, [...this.activeLoops, loop]));
    dropVar(state.held, step.name);
    for (const table of lockedTables) {
      state.held.add(heldKey(table, `$${step.name}.id`));
    }
  }

  private applyAssign(step: FlowStep, state: State): State {
    if (step.field !== "") {
      const added = derive(state.env, step.source, step.name);
      state.env.set(step.name, union(state.env.get(step.name) ?? [], added));
      dropPath(state.held, step.name, step.field);
      return state;
    }
    const alias = aliasSource(step.source);
    const rows = alias === null ? [] : heldTables(state.held, alias, ".id");
    const lists = alias === null ? [] : heldTables(state.held, alias, "[]");
    state.env.set(step.name, derive(state.env, step.source, step.name));
    dropVar(state.held, step.name);
    for (const table of rows) {
      state.held.add(heldKey(table, `$${step.name}.id`));
    }
    for (const table of lists) {
      state.held.add(heldKey(table, `$${step.name}[]`));
    }
    return state;
  }

  private applyStatement(stmt: Statement, state: State): State {
    if (READ_OPS.has(stmt.op)) {
      return this.applyRead(stmt, state);
    }
    if (WRITE_OPS.has(stmt.op) && stmt.arg !== null) {
      this.checkWrite(stmt, state);
    }
    if (stmt.varName !== null) {
      if (RETURNING_WRITE_OPS.has(stmt.op)) {
        state.env.set(stmt.varName, derive(state.env, this.writeData(stmt), stmt.varName));
      } else {
        state.env.delete(stmt.varName);
      }
      dropVar(state.held, stmt.varName);
    }
    return state;
  }

  private applyRead(stmt: Statement, state: State): State {
    const table = stmt.arg;
    const inTx = this.txOf(stmt) !== null;
    const key = table === null ? null : this.readKey(stmt, table);
    const keyHeld = inTx && table !== null && key !== null && state.held.has(heldKey(table, key));
    const locked = (stmt.lock && inTx) || keyHeld;
    const single = stmt.op === "db.get" || stmt.singleReturn;
    if (stmt.varName !== null) {
      const inputs = [this.flow.member(stmt, "field_value"), this.flow.member(stmt, "where")]
        .filter((text): text is string => text !== null)
        .join("\n");
      const derived = derive(state.env, inputs, stmt.varName);
      const taints = locked ? derived.filter((taint) => taint.origin.shape === "locked_list") : derived;
      for (const shape of originShapes(stmt, this.flow, locked)) {
        const heldBy = shape === "stale" || shape === "stale_list" ? this.txOf(stmt) : null;
        taints.push({ origin: this.origin(stmt, shape), path: [], loops: [], heldBy });
      }
      state.env.set(stmt.varName, taints);
      dropVar(state.held, stmt.varName);
    }
    if (!locked || table === null) {
      return state;
    }
    if (key !== null && (stmt.varName === null || !textHasVarRef(key, stmt.varName))) {
      state.held.add(heldKey(table, key));
    }
    if (stmt.varName !== null && single) {
      state.held.add(heldKey(table, `$${stmt.varName}.id`));
    }
    if (
      stmt.varName !== null &&
      !single &&
      isListQuery(this.flow.member(stmt, "return")) &&
      sortsByIdAsc(this.flow.member(stmt, "sort"), table)
    ) {
      state.held.add(heldKey(table, `$${stmt.varName}[]`));
    }
    return state;
  }

  private readKey(stmt: Statement, table: string): string | null {
    if (stmt.op === "db.get") {
      const value = this.flow.member(stmt, "field_value");
      return value !== null && this.keyedById(stmt) ? value : null;
    }
    if (!stmt.singleReturn) {
      return null;
    }
    const where = this.flow.member(stmt, "where");
    const match = where === null
      ? null
      : new RegExp(`^\\s*\\$db\\.${escapeRegExp(table)}\\.id\\s*==\\s*([\\s\\S]+?)\\s*$`).exec(where);
    return match?.[1] ?? null;
  }

  private keyedById(stmt: Statement): boolean {
    const field = this.flow.member(stmt, "field_name");
    return field !== null && ID_FIELD.test(field);
  }

  private origin(stmt: Statement, shape: Shape): Origin {
    const key = `${stmt.line}:${shape}`;
    const cached = this.origins.get(key);
    if (cached !== undefined) {
      return cached;
    }
    const origin = { read: stmt, shape };
    this.origins.set(key, origin);
    return origin;
  }

  private writeData(write: Statement): string {
    return this.flow.member(write, "data") ?? "";
  }

  private checkWrite(write: Statement, state: State): void {
    const table = write.arg ?? "";
    const data = this.writeData(write);
    const key = this.flow.member(write, "field_value") ?? "";
    const keyHeld =
      HELD_KEY_WRITE_OPS.has(write.op) && this.keyedById(write) && state.held.has(heldKey(table, key));
    const inLoop = (taint: Taint) =>
      taint.loops.some((loop) => loop.line < write.line && write.line <= loop.endLine);
    const active = (taint: Taint, ...shapes: Shape[]) => taint.heldBy === null && shapes.includes(taint.origin.shape);
    const single = matches(state.env, data, (taint) => active(taint, "single", "stale"));
    const list = matches(
      state.env,
      `${keyHeld ? "" : key}\n${data}`,
      (taint) => active(taint, "list", "stale_list") && inLoop(taint),
    );
    const lockedList = matches(
      state.env,
      `${key}\n${data}`,
      (taint) => active(taint, "locked_list") && inLoop(taint),
    );
    for (const [origin, path] of [...single, ...list, ...lockedList]) {
      if (origin.read.arg !== write.arg) {
        continue;
      }
      const prior = this.hits.get(origin.read);
      if (
        prior === undefined ||
        write.line < prior.write.line ||
        (write.line === prior.write.line && path.length < prior.path.length)
      ) {
        this.hits.set(origin.read, { origin, write, path });
      }
    }
  }
}

function originShapes(stmt: Statement, flow: FlowModel, locked: boolean): Shape[] {
  if (stmt.arg === null) {
    return [];
  }
  if (stmt.op === "db.get" || stmt.singleReturn) {
    return [locked ? "stale" : "single"];
  }
  if (!isListQuery(flow.member(stmt, "return"))) {
    return [];
  }
  if (!locked) {
    return ["list"];
  }
  return sortsByIdAsc(flow.member(stmt, "sort"), stmt.arg) ? ["stale_list"] : ["locked_list", "stale_list"];
}

function release(env: Env, tx: string): Env {
  const out: Env = new Map();
  for (const [name, taints] of env) {
    out.set(
      name,
      union([], taints.map((taint) => (taint.heldBy === tx ? { ...taint, heldBy: null } : taint))),
    );
  }
  return out;
}

function isListQuery(returnText: string | null): boolean {
  if (returnText === null) {
    return true;
  }
  if (TYPE_SINGLE.test(returnText)) {
    return false;
  }
  return PAGING.test(returnText) || TYPE_LIST.test(returnText) || !TYPE_ANY.test(returnText);
}

function sortsByIdAsc(sortText: string | null, table: string): boolean {
  if (sortText === null) {
    return false;
  }
  const brace = sortText.indexOf("{");
  if (brace < 0) {
    return false;
  }
  const first = FIRST_SORT_KEY.exec(sortText.slice(brace + 1));
  if (first === null) {
    return false;
  }
  const key = first[1] ?? first[2] ?? first[3];
  return (key === "id" || key === `${table}.id`) && first[4].toLowerCase() === "asc";
}

function heldKey(table: string, expr: string): string {
  const normalized = expr
    .trim()
    .replace(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|\s+/g, (match, quoted: string | undefined) => quoted ?? " ");
  return `${table}\u0001${normalized}`;
}

function heldExpr(key: string): string {
  return key.split("\u0001")[1] ?? "";
}

function heldTables(held: Set<string>, name: string, suffix: ".id" | "[]"): string[] {
  const tables: string[] = [];
  for (const key of held) {
    if (heldExpr(key) === `$${name}${suffix}`) {
      tables.push(key.split("\u0001")[0]);
    }
  }
  return tables;
}

function dropVar(held: Set<string>, name: string): void {
  for (const key of [...held]) {
    if (textHasVarRef(heldExpr(key), name)) {
      held.delete(key);
    }
  }
}

function dropPath(held: Set<string>, name: string, field: string): void {
  const target = `$${name}${field}`;
  for (const key of [...held]) {
    const expr = heldExpr(key);
    const covers = target.startsWith(expr) && /^[.[]/.test(target.slice(expr.length));
    if (expr === `$${name}[]` || covers || textHasVarRef(expr, `${name}${field}`)) {
      held.delete(key);
    }
  }
}

function aliasSource(source: string): string | null {
  const value = source.replace(/^\s*value\s*=\s*/, "");
  const [head, ...filters] = topLevelPipes(value);
  const name = /^\s*\$([A-Za-z_][A-Za-z0-9_]*)\s*$/.exec(head ?? "")?.[1] ?? null;
  if (name === null) {
    return null;
  }
  for (const filter of filters) {
    const set = SET_SEGMENT.exec(filter);
    if (set === null || set[2] === "id") {
      return null;
    }
  }
  return name;
}

function topLevelPipes(text: string): string[] {
  const segments: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let escape = false;
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote !== null) {
      if (escape) {
        escape = false;
      } else if (ch === "\\") {
        escape = true;
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === "(" || ch === "[" || ch === "{") {
      depth += 1;
    } else if (ch === ")" || ch === "]" || ch === "}") {
      depth -= 1;
    } else if (ch === "|" && depth === 0) {
      segments.push(text.slice(start, i));
      start = i + 1;
    }
  }
  segments.push(text.slice(start));
  return segments;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function deadState(): State {
  return { env: new Map(), held: new Set(), dead: true };
}

function clone(state: State): State {
  return { env: new Map(state.env), held: new Set(state.held), dead: state.dead };
}

function taintKey(taint: Taint): string {
  return `${taint.origin.read.line}:${taint.origin.shape}:${taint.heldBy ?? ""}:${taint.loops.map((loop) => loop.line).join(",")}`;
}

function union(base: Taint[], added: Taint[]): Taint[] {
  const kept = [...base];
  for (const taint of added) {
    const at = kept.findIndex((other) => taintKey(other) === taintKey(taint));
    if (at < 0) {
      kept.push(taint);
    } else if (taint.path.length < kept[at].path.length) {
      kept[at] = taint;
    }
  }
  return kept;
}

function merge(states: State[]): State {
  const live = states.filter((state) => !state.dead);
  if (live.length === 0) {
    return deadState();
  }
  const env: Env = new Map();
  for (const state of live) {
    for (const [name, taints] of state.env) {
      env.set(name, union(env.get(name) ?? [], taints));
    }
  }
  const [first, ...rest] = live;
  const held = new Set([...first.held].filter((key) => rest.every((state) => state.held.has(key))));
  return { env, held, dead: false };
}

function widen(state: State): State {
  let all: Taint[] = [];
  for (const taints of state.env.values()) {
    all = union(all, taints);
  }
  const env: Env = new Map();
  for (const name of state.env.keys()) {
    env.set(name, all);
  }
  return { env, held: new Set(), dead: false };
}

function signature(state: State): string {
  if (state.dead) {
    return "dead";
  }
  const vars = [...state.env]
    .filter(([, taints]) => taints.length > 0)
    .map(([name, taints]) => {
      const parts = taints.map((taint) => `${taintKey(taint)}:${taint.path.join(",")}`).sort();
      return `${name}=${parts.join(";")}`;
    })
    .sort();
  return `${vars.join("|")}#${[...state.held].sort().join("|")}`;
}

function matches(env: Env, text: string, keep: (taint: Taint) => boolean): Map<Origin, string[]> {
  const found = new Map<Origin, string[]>();
  if (text.trim().length === 0) {
    return found;
  }
  for (const [name, taints] of env) {
    if (taints.length === 0 || !textHasVarRef(text, name)) {
      continue;
    }
    for (const taint of taints) {
      const prior = found.get(taint.origin);
      if (keep(taint) && (prior === undefined || taint.path.length < prior.length)) {
        found.set(taint.origin, taint.path);
      }
    }
  }
  return found;
}

function derive(env: Env, text: string, target: string, added: Loop[] = []): Taint[] {
  const found = new Map<string, Taint>();
  if (text.trim().length === 0) {
    return [];
  }
  for (const [name, taints] of env) {
    if (taints.length === 0 || !textHasVarRef(text, name)) {
      continue;
    }
    for (const taint of taints) {
      const path = extend(taint, target);
      const loops = [
        ...taint.loops,
        ...added.filter((loop) => !taint.loops.some((known) => known.line === loop.line)),
      ];
      const next = { ...taint, path, loops };
      const id = taintKey(next);
      const prior = found.get(id);
      if (prior === undefined || path.length < prior.path.length) {
        found.set(id, next);
      }
    }
  }
  return [...found.values()];
}

function extend(taint: Taint, target: string): string[] {
  if (taint.path.length === 0 && taint.origin.read.varName === target) {
    return [];
  }
  const seen = taint.path.indexOf(target);
  return seen >= 0 ? taint.path.slice(0, seen + 1) : [...taint.path, target];
}

function message(
  origin: Origin,
  write: Statement,
  path: string[],
  readTx: string | null,
  writeTx: string | null,
  sorted: boolean,
): string {
  const read = origin.read;
  const via = path.length === 0 ? "" : ` via ${path.map((name) => `$${name}`).join(" -> ")}`;
  const at = `${write.op} on line ${write.line + 1}`;
  const carried = writeTx !== null && readTx === writeTx;
  if (origin.shape === "stale") {
    if (carried) {
      return `locked read of ${read.arg} as $${read.varName} from an earlier loop iteration is used in ${write.op} data on line ${write.line + 1}${via}; re-read the row or recompute the value in the current iteration's db.transaction`;
    }
    const fix = writeTx === null
      ? "wrap the read and the write in one db.transaction"
      : "move the read into the db.transaction that holds the write";
    return `locked read of ${read.arg} as $${read.varName} in another transaction is used in ${write.op} data on line ${write.line + 1}${via}; ${fix}`;
  }
  if (origin.shape === "stale_list") {
    if (carried) {
      return `locked list read of ${read.arg} as $${read.varName} from an earlier loop iteration drives ${at}${via}; re-read the rows or recompute the values in the current iteration's db.transaction`;
    }
    const fix = writeTx === null
      ? `wrap the query and the writes in one db.transaction${sorted ? "" : ", and sort the query by id ascending"}`
      : `move the query into the db.transaction that holds the write${sorted ? "" : " and sort it by id ascending"}`;
    return `locked list read of ${read.arg} as $${read.varName} in another transaction drives ${at}${via}; ${fix}`;
  }
  if (origin.shape === "locked_list") {
    return `locked list read of ${read.arg} as $${read.varName} drives ${at}; sort by id ascending so locks follow the order other lockers use`;
  }
  if (origin.shape === "single") {
    const fix = writeTx === null
      ? "wrap the read and the write in one db.transaction and add lock = true"
      : readTx === writeTx
        ? "add lock = true"
        : "move the read into the db.transaction that holds the write and add lock = true";
    return `unlocked read of ${read.arg} as $${read.varName} is used in ${write.op} data on line ${write.line + 1}${via}; ${fix}`;
  }
  const fix = writeTx === null
    ? "wrap the query and the writes in one db.transaction, sort the query by id ascending, and add lock = true"
    : readTx === writeTx
      ? 'add sort = {id: "asc"} and lock = true to the query'
      : "move the query into the db.transaction that holds the write, sort it by id ascending, and add lock = true";
  return `unlocked list read of ${read.arg} as $${read.varName} drives ${at}${via}; ${fix}`;
}
