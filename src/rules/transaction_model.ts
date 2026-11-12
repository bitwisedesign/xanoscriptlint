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
const AS_VAR = /(?:^|})\s*as\s+\$([A-Za-z_][A-Za-z0-9_]*)\s*$/;
const TYPE_SINGLE = /type\s*:\s*["']single["']/;
const INLINE_RETURN = /\{\s*return\s*=\s*\{/;

interface Region {
  kind: "unit" | "tx" | "test" | "stmt";
  op: string;
  arg: string | null;
  line: number;
  column: number;
  endLine: number;
}

export function parseXs(text: string): ParsedFile {
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

export function dataText(lines: string[], range: DataRange): string {
  const chunk = lines.slice(range.startLine, range.endLine + 1).join("\n");
  const dataAt = chunk.search(/\bdata\s*=/);
  if (dataAt < 0) {
    return "";
  }
  const braceAt = indexOfCode(chunk, "{", dataAt);
  if (braceAt < 0) {
    return "";
  }
  const close = matchingBrace(chunk, braceAt);
  if (close < 0) {
    return chunk.slice(braceAt);
  }
  return chunk.slice(braceAt, close + 1);
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

function indexOfCode(text: string, token: string, from: number): number {
  let i = from;
  let mode: "code" | "double" | "single" = "code";
  let escape = false;
  while (i < text.length) {
    const ch = text[i];
    if (mode === "code") {
      if (ch === "/" && text[i + 1] === "/") {
        const nl = text.indexOf("\n", i);
        i = nl < 0 ? text.length : nl + 1;
        continue;
      }
      if (text.startsWith(token, i)) {
        return i;
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
  return -1;
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
