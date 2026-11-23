import { isBlankLine, isCommentLine, splitLines } from "../util.js";
import { lineStartDepths } from "./block_depths.js";
import { literalLines } from "./numeric_declarations.js";
import type { DataRange, ParsedFile, Statement, Unit } from "./types.js";

const UNIT_OPENER =
  /^(function|query|task|tool|agent|table|table_trigger|api_group|mcp_server|realtime_channel|addon|error_trigger|workspace)\s+(?:"([^"]*)"|'([^']*)'|(\S+))/;

const TEST_OPENER = /^\s*test\b/;

const DB_OPENER =
  /^\s*(db\.(?:get|query|edit|patch|del|add_or_edit|add|bulk\.[A-Za-z_]+|truncate|transaction))\b/;

const FUNCTION_RUN_OPENER = /^\s*function\.run\b/;

const DB_ARG =
  /^\s*db\.(?:get|query|edit|patch|del|add_or_edit|add|bulk\.[A-Za-z_]+|truncate)\s+(?:"([^"]*)"|'([^']*)'|([A-Za-z_][A-Za-z0-9_]*))/;

const FUNCTION_RUN_ARG =
  /^\s*function\.run\s+(?:"([^"]*)"|'([^']*)')/;

const LOCK_TRUE = /^\s*lock\s*=\s*true\b/;
const INLINE_LOCK_TRUE = /\{\s*lock\s*=\s*true\s*\}/;
const DATA_MEMBER = /^\s*data\s*=/;
const RETURN_MEMBER = /^\s*return\s*=/;
const AS_VAR = /(?:^|[}\s])as\s+\$([A-Za-z_][A-Za-z0-9_]*)\s*$/;
const TYPE_SINGLE = /type\s*:\s*["']single["']/;
const INLINE_RETURN = /\{\s*return\s*=\s*\{/;

const VAR_OPENER =
  /^\s*(var(?:\.update)?)\s+\$([A-Za-z_][A-Za-z0-9_]*)((?:\.[A-Za-z_][A-Za-z0-9_]*|\[[^\]]*\])*)\s*\{/;
const LOOP_CONTROL = /^\s*(continue|break)\s*$/;
const EXIT_LEAF = /^\s*(?:return|throw)\b(?!\s*=)/;
const HEADER_OPENER = /^\s*(?:foreach|for|while|if|elseif)\s*\(/;
const MEMBER_BLOCK = /^\s*[A-Za-z_][A-Za-z0-9_]*\s*=(?!=)/;
const FOREACH_OPENER = /^\s*foreach\s*\(/;
const EACH_AS = /^\s*each\s+as\s+\$?([A-Za-z_][A-Za-z0-9_]*)\b/;
const MEMBER_START = /^\s*[A-Za-z_][A-Za-z0-9_]*\s*=(?!=)/;

interface Region {
  kind: "unit" | "tx" | "test" | "stmt";
  op: string;
  arg: string | null;
  line: number;
  column: number;
  endLine: number;
}

interface Scan {
  lines: string[];
  literals: Set<number>;
  depths: ReturnType<typeof lineStartDepths>;
  regions: Region[];
}

export interface FlowStep {
  kind: "var" | "var.update" | "foreach";
  name: string;
  field: string;
  source: string;
  line: number;
  endLine: number;
  inTest: boolean;
}

export interface FlowBlock {
  keyword: string;
  line: number;
  endLine: number;
  asVar: string | null;
  children: FlowBlock[];
}

export interface FlowModel {
  steps: FlowStep[];
  blocks: FlowBlock[];
  member(stmt: Statement, name: string): string | null;
}

const BLOCK_KEYWORD = /^\s*([A-Za-z_][A-Za-z0-9_.]*)/;

function scan(text: string): Scan {
  const lines = splitLines(text);
  const literals = literalLines(lines);
  const depths = lineStartDepths(lines, literals);
  const regions: Region[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    if (literals.has(i) || isCommentLine(lines[i]) || isBlankLine(lines[i])) {
      continue;
    }
    const region = regionAt(lines[i], i, depths);
    if (region !== null) {
      regions.push(region);
    }
  }
  return { lines, literals, depths, regions };
}

export function parseFlow(text: string): FlowModel {
  const { lines, literals, depths, regions } = scan(text);
  const steps: FlowStep[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (literals.has(i) || isCommentLine(lines[i]) || isBlankLine(lines[i])) {
      continue;
    }
    const line = lines[i];
    const inTest = enclosing(regions, i, "test").length > 0;
    const compact = compactBranchBody(line);
    const declared = VAR_OPENER.exec(compact ?? line);
    if (declared !== null) {
      const end = compact === null ? (closeLine(depths, i, line) ?? i) : i;
      steps.push({
        kind: declared[1] === "var.update" ? "var.update" : "var",
        name: declared[2],
        field: declared[3] ?? "",
        source: compact === null ? blockBody(lines, literals, i, end) : innerBlockText(compact),
        line: i,
        endLine: end,
        inTest,
      });
      continue;
    }
    if (!FOREACH_OPENER.test(line)) {
      continue;
    }
    const header = headerOpenLine(lines, depths, i);
    const end = header === null ? i : (findCloseLine(depths, header) ?? header);
    const code = codeText(lines, literals, i, header ?? i);
    const source = code.slice(code.indexOf("("), code.lastIndexOf(")") + 1);
    const item = eachItem(lines, literals, header ?? i, end);
    if (item !== null) {
      steps.push({ kind: "foreach", name: item, field: "", source, line: i, endLine: end, inTest });
    }
  }
  return {
    steps,
    blocks: blockTree(lines, literals, depths),
    member: (stmt, name) => memberText(lines, literals, depths, stmt, name),
  };
}

function blockTree(
  lines: string[],
  literals: Set<number>,
  depths: ReturnType<typeof lineStartDepths>,
): FlowBlock[] {
  const roots: FlowBlock[] = [];
  const open: FlowBlock[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (literals.has(i) || isCommentLine(lines[i]) || isBlankLine(lines[i])) {
      continue;
    }
    while (open.length > 0 && open[open.length - 1].endLine < i) {
      open.pop();
    }
    const line = lines[i];
    let opens = depths.after[i] > depths.starts[i];
    let header = i;
    if (!opens && HEADER_OPENER.test(line)) {
      header = headerOpenLine(lines, depths, i) ?? i;
      opens = header > i;
    }
    const compact = opens ? null : compactBranchBody(line);
    const leaf =
      !opens &&
      (DB_OPENER.test(line) ||
        VAR_OPENER.test(line) ||
        FUNCTION_RUN_OPENER.test(line) ||
        LOOP_CONTROL.test(stripLineComment(line)) ||
        EXIT_LEAF.test(line) ||
        compact !== null ||
        (varNameOnClose(line) !== null && !/^\s*\}/.test(line)));
    if (!opens && !leaf) {
      continue;
    }
    const endLine = opens ? (findCloseLine(depths, header) ?? header) : i;
    const block: FlowBlock = {
      keyword: MEMBER_BLOCK.test(line) ? "" : (BLOCK_KEYWORD.exec(line)?.[1] ?? ""),
      line: i,
      endLine,
      asVar: varNameOnClose(lines[endLine] ?? ""),
      children: compact === null || compact === ""
        ? []
        : [{ keyword: BLOCK_KEYWORD.exec(compact)?.[1] ?? "", line: i, endLine: i, asVar: null, children: [] }],
    };
    (open.length > 0 ? open[open.length - 1].children : roots).push(block);
    if (opens) {
      open.push(block);
    }
    i = header;
  }
  return roots;
}

function compactBranchBody(line: string): string | null {
  const code = stripLineComment(line);
  const masked = maskQuoted(code);
  const head = /^\s*(if|elseif|else)\b/.exec(masked);
  if (head === null) {
    return null;
  }
  let at = head[0].length;
  if (head[1] !== "else") {
    const paren = masked.indexOf("(", at);
    let depth = 0;
    let i = paren;
    for (; paren >= 0 && i < masked.length; i += 1) {
      depth += masked[i] === "(" ? 1 : masked[i] === ")" ? -1 : 0;
      if (depth === 0) {
        break;
      }
    }
    if (paren < 0 || i >= masked.length) {
      return null;
    }
    at = i + 1;
  }
  const open = masked.indexOf("{", at);
  if (open < 0 || masked.slice(at, open).trim() !== "") {
    return null;
  }
  const close = matchingBrace(code, open);
  if (close < 0 || masked.slice(close + 1).trim() !== "") {
    return null;
  }
  return code.slice(open + 1, close).trim();
}

function headerOpenLine(lines: string[], depths: ReturnType<typeof lineStartDepths>, start: number): number | null {
  const base = depths.starts[start];
  let parens = 0;
  for (let i = start; i < lines.length; i += 1) {
    if (depths.starts[i] !== base) {
      return null;
    }
    for (const ch of maskQuoted(stripLineComment(lines[i]))) {
      parens += ch === "(" ? 1 : ch === ")" ? -1 : 0;
    }
    if (parens <= 0) {
      return depths.after[i] > base ? i : null;
    }
  }
  return null;
}

function eachItem(lines: string[], literals: Set<number>, open: number, end: number): string | null {
  for (let i = open + 1; i < end; i += 1) {
    if (literals.has(i) || isCommentLine(lines[i]) || isBlankLine(lines[i])) {
      continue;
    }
    return EACH_AS.exec(lines[i])?.[1] ?? null;
  }
  return null;
}

function blockBody(lines: string[], literals: Set<number>, open: number, end: number): string {
  if (open === end) {
    return innerBlockText(stripLineComment(lines[open]));
  }
  return codeText(lines, literals, open + 1, end - 1);
}

function innerBlockText(code: string): string {
  const brace = maskQuoted(code).indexOf("{");
  if (brace < 0) {
    return "";
  }
  const close = matchingBrace(code, brace);
  return code.slice(brace + 1, close < 0 ? code.length : close);
}

function codeText(lines: string[], literals: Set<number>, start: number, end: number): string {
  const kept: string[] = [];
  for (let i = start; i <= end; i += 1) {
    if (literals.has(i) || isCommentLine(lines[i])) {
      continue;
    }
    kept.push(stripLineComment(lines[i]));
  }
  return kept.join("\n");
}

function memberText(
  lines: string[],
  literals: Set<number>,
  depths: ReturnType<typeof lineStartDepths>,
  stmt: Statement,
  name: string,
): string | null {
  const opener = new RegExp(`^\\s*${name}\\s*=(?!=)`);
  if (stmt.line === stmt.endLine) {
    return inlineMemberText(lines[stmt.line], name);
  }
  const region: Region = {
    kind: "stmt",
    op: stmt.op,
    arg: stmt.arg,
    line: stmt.line,
    column: stmt.column,
    endLine: stmt.endLine,
  };
  const bodyDepth = depths.after[stmt.line] > depths.starts[stmt.line]
    ? depths.after[stmt.line]
    : depths.starts[stmt.line];
  const members = memberLines(lines, literals, depths, region, bodyDepth);
  const at = members.findIndex((line) => opener.test(lines[line]));
  if (at < 0) {
    return null;
  }
  const start = members[at];
  const next = members.slice(at + 1).find((line) => MEMBER_START.test(lines[line]));
  const text = codeText(lines, literals, start, (next ?? stmt.endLine) - 1);
  return text.slice(text.indexOf("=") + 1);
}

function inlineMemberText(line: string, name: string): string | null {
  const code = stripLineComment(line);
  const brace = maskQuoted(code).indexOf("{");
  if (brace < 0) {
    return null;
  }
  const close = matchingBrace(code, brace);
  const inner = code.slice(brace + 1, close < 0 ? code.length : close);
  const masked = maskQuoted(inner);
  const found = new RegExp(`(?:^|[\\s{,])${name}\\s*=(?!=)`).exec(masked);
  if (found === null) {
    return null;
  }
  let start = found.index + found[0].length;
  while (start < inner.length && /\s/.test(inner[start])) {
    start += 1;
  }
  let from = start;
  if (inner[start] === "{") {
    const end = matchingBrace(inner, start);
    from = end < 0 ? inner.length : end + 1;
  }
  const next = /\s[A-Za-z_][A-Za-z0-9_]*\s*=(?!=)/.exec(masked.slice(from));
  return inner.slice(start, next === null ? inner.length : from + next.index);
}

export function parseXs(text: string): ParsedFile {
  const { lines, literals, depths, regions } = scan(text);

  const units: Unit[] = [];
  const statements: Statement[] = [];
  for (const region of regions) {
    if (region.kind === "unit") {
      units.push({
        kind: region.op,
        name: region.arg,
        line: region.line,
        endLine: region.endLine,
        statements: [],
      });
    }
  }

  for (const region of regions) {
    if (region.kind !== "stmt" && region.kind !== "tx") {
      continue;
    }
    const bodyDepth = depths.after[region.line] > depths.starts[region.line]
      ? depths.after[region.line]
      : depths.starts[region.line];
    const stmt: Statement = {
      op: region.op,
      arg: region.arg,
      line: region.line,
      column: region.column,
      endLine: region.endLine,
      lock: hasLock(lines, literals, depths, region, bodyDepth),
      singleReturn: hasSingleReturn(lines, literals, depths, region, bodyDepth),
      varName: varNameOnClose(lines[region.endLine] ?? ""),
      data: dataRange(lines, literals, depths, region, bodyDepth),
      txLines: enclosing(regions, region.line, "tx"),
      inTest: enclosing(regions, region.line, "test").length > 0,
    };
    statements.push(stmt);
    const unit = innermostUnit(units, region.line);
    if (unit !== undefined) {
      unit.statements.push(stmt);
    }
  }

  return { units, statements };
}

type VarScanMode = "code" | "double" | "single" | "triple";

export function textHasVarRef(text: string, varName: string): boolean {
  let mode: VarScanMode = "code";
  for (const line of splitLines(text)) {
    const result = scanLineForVarRef(line, varName, mode);
    if (result.found) {
      return true;
    }
    mode = result.mode === "triple" ? "triple" : "code";
  }
  return false;
}

export function lineHasVarRef(line: string, varName: string): boolean {
  return scanLineForVarRef(line, varName, "code").found;
}

function scanLineForVarRef(
  line: string,
  varName: string,
  startMode: VarScanMode,
): { found: boolean; mode: VarScanMode } {
  const token = `$${varName}`;
  let i = 0;
  let mode = startMode;
  let escape = false;
  while (i < line.length) {
    const ch = line[i];
    if (mode === "triple") {
      if (line.startsWith('"""', i)) {
        mode = "code";
        i += 3;
        continue;
      }
      i += 1;
      continue;
    }
    if (mode === "code") {
      if (ch === "/" && line[i + 1] === "/") {
        break;
      }
      if (line.startsWith('"""', i)) {
        mode = "triple";
        i += 3;
        continue;
      }
      if (ch === '"') {
        mode = "double";
        i += 1;
        continue;
      }
      if (ch === "'") {
        mode = "single";
        i += 1;
        continue;
      }
      if (line.startsWith(token, i)) {
        const next = line[i + token.length];
        if (next === undefined || !/[A-Za-z0-9_]/.test(next)) {
          return { found: true, mode };
        }
      }
      i += 1;
      continue;
    }
    if (escape) {
      escape = false;
      i += 1;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      i += 1;
      continue;
    }
    if ((mode === "double" && ch === '"') || (mode === "single" && ch === "'")) {
      mode = "code";
    }
    i += 1;
  }
  return { found: false, mode };
}

function regionAt(
  line: string,
  index: number,
  depths: ReturnType<typeof lineStartDepths>,
): Region | null {
  const close = closeLine(depths, index, line);
  if (close === null) {
    return null;
  }
  const unit = UNIT_OPENER.exec(line.trimStart());
  if (unit !== null && depths.starts[index] === 0) {
    return {
      kind: "unit",
      op: unit[1] ?? "function",
      arg: unit[2] ?? unit[3] ?? stripTrailingBrace(unit[4] ?? null),
      line: index,
      column: indentColumn(line),
      endLine: close,
    };
  }
  if (TEST_OPENER.test(line)) {
    return {
      kind: "test",
      op: "test",
      arg: null,
      line: index,
      column: indentColumn(line),
      endLine: close,
    };
  }
  const db = DB_OPENER.exec(line);
  if (db !== null && db[1] !== undefined) {
    const op = db[1];
    const argMatch = DB_ARG.exec(line);
    return {
      kind: op === "db.transaction" ? "tx" : "stmt",
      op,
      arg: argMatch?.[1] ?? argMatch?.[2] ?? argMatch?.[3] ?? null,
      line: index,
      column: indentColumn(line),
      endLine: close,
    };
  }
  if (FUNCTION_RUN_OPENER.test(line)) {
    const argMatch = FUNCTION_RUN_ARG.exec(line);
    return {
      kind: "stmt",
      op: "function.run",
      arg: argMatch?.[1] ?? argMatch?.[2] ?? null,
      line: index,
      column: indentColumn(line),
      endLine: close,
    };
  }
  return null;
}

function closeLine(
  depths: ReturnType<typeof lineStartDepths>,
  openLine: number,
  line: string,
): number | null {
  if (depths.after[openLine] > depths.starts[openLine]) {
    return findCloseLine(depths, openLine) ?? openLine;
  }
  if (line.includes("{")) {
    return openLine;
  }
  if (UNIT_OPENER.test(line.trimStart()) || TEST_OPENER.test(line) || DB_OPENER.test(line) || FUNCTION_RUN_OPENER.test(line)) {
    return openLine;
  }
  return null;
}

function findCloseLine(
  depths: ReturnType<typeof lineStartDepths>,
  openLine: number,
): number | null {
  const openerStart = depths.starts[openLine];
  for (let i = openLine + 1; i < depths.after.length; i += 1) {
    if (depths.after[i] === openerStart && depths.starts[i] > openerStart) {
      return i;
    }
  }
  return null;
}

function hasLock(
  lines: string[],
  literals: Set<number>,
  depths: ReturnType<typeof lineStartDepths>,
  region: Region,
  bodyDepth: number,
): boolean {
  if (
    region.line === region.endLine &&
    INLINE_LOCK_TRUE.test(maskQuoted(stripLineComment(lines[region.line])))
  ) {
    return true;
  }
  return memberLines(lines, literals, depths, region, bodyDepth).some((line) =>
    LOCK_TRUE.test(lines[line]),
  );
}

function maskQuoted(line: string): string {
  return line.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, (m) => " ".repeat(m.length));
}

function hasSingleReturn(
  lines: string[],
  literals: Set<number>,
  depths: ReturnType<typeof lineStartDepths>,
  region: Region,
  bodyDepth: number,
): boolean {
  if (region.line === region.endLine && hasInlineSingleReturn(lines[region.line])) {
    return true;
  }
  for (const start of memberLines(lines, literals, depths, region, bodyDepth)) {
    if (!RETURN_MEMBER.test(lines[start])) {
      continue;
    }
    const end =
      depths.after[start] > depths.starts[start]
        ? (findCloseLine(depths, start) ?? start)
        : start;
    const text = lines
      .slice(start, end + 1)
      .map(stripLineComment)
      .join("\n");
    if (TYPE_SINGLE.test(text)) {
      return true;
    }
  }
  return false;
}

function hasInlineSingleReturn(line: string): boolean {
  const code = stripLineComment(line);
  const masked = maskQuoted(code);
  const opener = INLINE_RETURN.exec(masked);
  if (opener === null) {
    return false;
  }
  const open = opener.index + opener[0].length - 1;
  const close = matchingBrace(masked, open);
  const body = code.slice(open, close < 0 ? code.length : close + 1);
  return TYPE_SINGLE.test(body);
}

function dataRange(
  lines: string[],
  literals: Set<number>,
  depths: ReturnType<typeof lineStartDepths>,
  region: Region,
  bodyDepth: number,
): DataRange | null {
  for (const start of memberLines(lines, literals, depths, region, bodyDepth)) {
    if (!DATA_MEMBER.test(lines[start])) {
      continue;
    }
    const end =
      depths.after[start] > depths.starts[start]
        ? (findCloseLine(depths, start) ?? start)
        : start;
    return { startLine: start, endLine: end };
  }
  if (region.line === region.endLine && DATA_MEMBER.test(lines[region.line])) {
    return { startLine: region.line, endLine: region.endLine };
  }
  return null;
}

function memberLines(
  lines: string[],
  literals: Set<number>,
  depths: ReturnType<typeof lineStartDepths>,
  region: Region,
  bodyDepth: number,
): number[] {
  const found: number[] = [];
  if (region.line === region.endLine) {
    found.push(region.line);
    return found;
  }
  for (let line = region.line + 1; line < region.endLine; line += 1) {
    if (literals.has(line) || isCommentLine(lines[line]) || isBlankLine(lines[line])) {
      continue;
    }
    if (depths.starts[line] !== bodyDepth) {
      continue;
    }
    found.push(line);
  }
  return found;
}

function varNameOnClose(line: string): string | null {
  const code = stripLineComment(line);
  const match = AS_VAR.exec(code);
  return match?.[1] ?? null;
}

function stripLineComment(line: string): string {
  let i = 0;
  let mode: "code" | "double" | "single" = "code";
  let escape = false;
  while (i < line.length) {
    const ch = line[i];
    if (mode === "code") {
      if (ch === "/" && line[i + 1] === "/") {
        return line.slice(0, i);
      }
      if (ch === '"') {
        mode = "double";
      } else if (ch === "'") {
        mode = "single";
      }
      i += 1;
      continue;
    }
    if (escape) {
      escape = false;
      i += 1;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      i += 1;
      continue;
    }
    if ((mode === "double" && ch === '"') || (mode === "single" && ch === "'")) {
      mode = "code";
    }
    i += 1;
  }
  return line;
}

function enclosing(regions: Region[], line: number, kind: "tx" | "test"): number[] {
  const hits: number[] = [];
  for (const region of regions) {
    if (region.kind !== kind) {
      continue;
    }
    if (region.line < line && line <= region.endLine) {
      hits.push(region.line);
    }
  }
  return hits;
}

function innermostUnit(units: Unit[], line: number): Unit | undefined {
  let found: Unit | undefined;
  for (const unit of units) {
    if (unit.line <= line && line <= unit.endLine) {
      if (found === undefined || unit.line >= found.line) {
        found = unit;
      }
    }
  }
  return found;
}

function indentColumn(line: string): number {
  return line.length - line.trimStart().length + 1;
}

function stripTrailingBrace(name: string | null): string | null {
  if (name === null) {
    return null;
  }
  return name.replace(/\{$/, "").trim() || null;
}

function matchingBrace(text: string, open: number): number {
  let depth = 0;
  let i = open;
  let mode: "code" | "double" | "single" | "triple" = "code";
  let escape = false;
  while (i < text.length) {
    const ch = text[i];
    if (mode === "triple") {
      if (text.startsWith('"""', i)) {
        mode = "code";
        i += 3;
        continue;
      }
      i += 1;
      continue;
    }
    if (mode === "code") {
      if (ch === "/" && text[i + 1] === "/") {
        const nl = text.indexOf("\n", i);
        i = nl < 0 ? text.length : nl + 1;
        continue;
      }
      if (text.startsWith('"""', i)) {
        mode = "triple";
        i += 3;
        continue;
      }
      if (ch === '"') {
        mode = "double";
        i += 1;
        continue;
      }
      if (ch === "'") {
        mode = "single";
        i += 1;
        continue;
      }
      if (ch === "{") {
        depth += 1;
      } else if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          return i;
        }
      }
      i += 1;
      continue;
    }
    if (escape) {
      escape = false;
      i += 1;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      i += 1;
      continue;
    }
    if ((mode === "double" && ch === '"') || (mode === "single" && ch === "'")) {
      mode = "code";
    }
    i += 1;
  }
  return -1;
}
