import { isSuppressed, parseSuppressions } from "../suppress.js";
import { joinLineRecords, splitLineRecords } from "./line_records.js";
import type { LineRecord } from "./line_records.js";
import type { Rule, RuleOptions, SourceFile, Violation } from "./types.js";
import { DEFAULT_WRAP_AT, enumValuesOpenLines } from "./wrap_enum_values.js";

const COMPOUND_EQ = "!<>=+*/-";

interface Cursor {
  readonly text: string;
  i: number;
}

type Node =
  | { kind: "object"; entries: { key: string; value: Node }[]; start: number; end: number }
  | { kind: "array"; items: Node[]; start: number; end: number }
  | { kind: "scalar"; text: string; start: number; end: number };

type ContainerNode = Extract<Node, { kind: "object" | "array" }>;

interface AssignmentSite {
  kind: "inline" | "multiline";
  owner: string;
  openLine: number;
  closeLine: number;
  openCol: number;
  trailing: string;
  lineLength: number;
  hasTab: boolean;
  piped: boolean;
  node: ContainerNode;
}

function wrapThreshold(options: RuleOptions): number {
  return options.wrapAt ?? DEFAULT_WRAP_AT;
}

function byteLength(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

function peek(cursor: Cursor): string {
  return cursor.text[cursor.i] ?? "";
}

function skipSpaces(cursor: Cursor): void {
  while (cursor.i < cursor.text.length) {
    const ch = cursor.text[cursor.i];
    if (ch !== " " && ch !== "\t") {
      break;
    }
    cursor.i += 1;
  }
}

function skipWs(cursor: Cursor): boolean {
  while (cursor.i < cursor.text.length) {
    const ch = cursor.text[cursor.i];
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      cursor.i += 1;
      continue;
    }
    if (ch === "/" && cursor.text[cursor.i + 1] === "/") {
      return false;
    }
    if (cursor.text.startsWith("```", cursor.i) || cursor.text.startsWith('"""', cursor.i)) {
      return false;
    }
    break;
  }
  return true;
}

function skipQuoted(text: string, start: number, quote: '"' | "'"): number | null {
  let i = start + 1;
  let escape = false;
  while (i < text.length) {
    const ch = text[i];
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
    if (ch === quote) {
      return i + 1;
    }
    i += 1;
  }
  return null;
}

function skipQuotedCursor(cursor: Cursor, quote: '"' | "'"): boolean {
  const end = skipQuoted(cursor.text, cursor.i, quote);
  if (end === null) {
    return false;
  }
  cursor.i = end;
  return true;
}

function isWordChar(ch: string | undefined): boolean {
  return ch !== undefined && /[A-Za-z0-9_]/.test(ch);
}

function isKeyStart(ch: string | undefined): boolean {
  return ch !== undefined && /[A-Za-z_$]/.test(ch);
}

function isKeyChar(ch: string | undefined): boolean {
  return ch !== undefined && /[A-Za-z0-9_.]/.test(ch);
}

function assignmentOwner(text: string, eqIndex: number): string {
  let end = eqIndex - 1;
  while (end >= 0 && (text[end] === " " || text[end] === "\t")) {
    end -= 1;
  }
  if (end < 0) {
    return "assignment";
  }
  let start = end;
  while (start >= 0 && /[A-Za-z0-9_$.]/.test(text[start])) {
    start -= 1;
  }
  const token = text.slice(start + 1, end + 1);
  return token === "" ? "assignment" : token;
}

function lookbehindAssignment(text: string, braceOffset: number): string | null {
  let i = braceOffset - 1;
  while (i >= 0 && (text[i] === " " || text[i] === "\t")) {
    i -= 1;
  }
  if (i < 0) {
    return null;
  }
  if (text[i] === "=") {
    const prev = i > 0 ? text[i - 1] : "";
    if (prev !== "" && COMPOUND_EQ.includes(prev)) {
      return null;
    }
    return assignmentOwner(text, i);
  }
  if (!isWordChar(text[i])) {
    return null;
  }
  let start = i;
  while (start >= 0 && isWordChar(text[start])) {
    start -= 1;
  }
  if (text.slice(start + 1, i + 1) === "return") {
    return "return";
  }
  return null;
}

function readKey(cursor: Cursor): string | null {
  const ch = peek(cursor);
  if (ch === '"' || ch === "'") {
    const start = cursor.i;
    if (!skipQuotedCursor(cursor, ch)) {
      return null;
    }
    return cursor.text.slice(start, cursor.i);
  }
  if (!isKeyStart(ch)) {
    return null;
  }
  const start = cursor.i;
  cursor.i += 1;
  while (isKeyChar(peek(cursor))) {
    cursor.i += 1;
  }
  return cursor.text.slice(start, cursor.i);
}

function parseScalar(cursor: Cursor): Node | null {
  const start = cursor.i;
  while (cursor.i < cursor.text.length) {
    const ch = peek(cursor);
    if (ch === "\n" || ch === "," || ch === "}" || ch === "]") {
      break;
    }
    if (ch === "/" && cursor.text[cursor.i + 1] === "/") {
      return null;
    }
    if (cursor.text.startsWith("```", cursor.i) || cursor.text.startsWith('"""', cursor.i)) {
      return null;
    }
    if (ch === '"' || ch === "'") {
      if (!skipQuotedCursor(cursor, ch)) {
        return null;
      }
      continue;
    }
    if (ch === "{" || ch === "[") {
      return null;
    }
    cursor.i += 1;
  }
  const text = cursor.text.slice(start, cursor.i).trim();
  if (text === "" || /[\n\r\t]/.test(text)) {
    return null;
  }
  return { kind: "scalar", text, start, end: cursor.i };
}

function parseValue(cursor: Cursor): Node | null {
  skipSpaces(cursor);
  if (cursor.i >= cursor.text.length) {
    return null;
  }
  if (cursor.text.startsWith("```", cursor.i) || cursor.text.startsWith('"""', cursor.i)) {
    return null;
  }
  const ch = peek(cursor);
  if (ch === "{") {
    return parseObject(cursor);
  }
  if (ch === "[") {
    return parseArray(cursor);
  }
  return parseScalar(cursor);
}

function parseObject(cursor: Cursor): Node | null {
  const start = cursor.i;
  cursor.i += 1;
  const entries: { key: string; value: Node }[] = [];
  while (true) {
    if (!skipWs(cursor)) {
      return null;
    }
    if (cursor.i >= cursor.text.length) {
      return null;
    }
    if (peek(cursor) === "}") {
      cursor.i += 1;
      return { kind: "object", entries, start, end: cursor.i };
    }
    const key = readKey(cursor);
    if (key === null) {
      return null;
    }
    skipSpaces(cursor);
    if (peek(cursor) !== ":") {
      return null;
    }
    cursor.i += 1;
    const value = parseValue(cursor);
    if (value === null) {
      return null;
    }
    entries.push({ key, value });
    skipSpaces(cursor);
    if (peek(cursor) === ",") {
      cursor.i += 1;
    }
  }
}

function parseArray(cursor: Cursor): Node | null {
  const start = cursor.i;
  cursor.i += 1;
  const items: Node[] = [];
  while (true) {
    if (!skipWs(cursor)) {
      return null;
    }
    if (cursor.i >= cursor.text.length) {
      return null;
    }
    if (peek(cursor) === "]") {
      cursor.i += 1;
      return { kind: "array", items, start, end: cursor.i };
    }
    const value = parseValue(cursor);
    if (value === null) {
      return null;
    }
    items.push(value);
    skipSpaces(cursor);
    if (peek(cursor) === ",") {
      cursor.i += 1;
    }
  }
}

function renderInline(node: Node): string {
  if (node.kind === "object") {
    return `{${node.entries.map((entry) => `${entry.key}: ${renderInline(entry.value)}`).join(", ")}}`;
  }
  if (node.kind === "array") {
    return `[${node.items.map((item) => renderInline(item)).join(", ")}]`;
  }
  return node.text;
}

function offsetToLineCol(lines: string[], offset: number): { line: number; col: number } {
  let remaining = offset;
  for (let line = 0; line < lines.length; line += 1) {
    const length = lines[line].length;
    if (remaining <= length) {
      return { line, col: remaining };
    }
    remaining -= length + 1;
  }
  const last = Math.max(0, lines.length - 1);
  return { line: last, col: lines[last]?.length ?? 0 };
}

function lineHasTab(lines: string[], startLine: number, endLine: number): boolean {
  for (let i = startLine; i <= endLine; i += 1) {
    if (lines[i]?.includes("\t")) {
      return true;
    }
  }
  return false;
}

function isPiped(text: string, end: number): boolean {
  let i = end;
  while (i < text.length && (text[i] === " " || text[i] === "\t")) {
    i += 1;
  }
  return text[i] === "|";
}

function skipSpan(text: string, start: number, closer: string): number | null {
  const end = text.indexOf(closer, start);
  return end === -1 ? null : end + closer.length;
}

function findAssignmentSites(lines: string[]): AssignmentSite[] {
  const text = lines.join("\n");
  const enumLines = enumValuesOpenLines(lines);
  const sites: AssignmentSite[] = [];
  let i = 0;
  while (i < text.length) {
    if (text.startsWith("```", i)) {
      const end = skipSpan(text, i + 3, "```");
      if (end === null) {
        break;
      }
      i = end;
      continue;
    }
    if (text.startsWith('"""', i)) {
      const end = skipSpan(text, i + 3, '"""');
      if (end === null) {
        break;
      }
      i = end;
      continue;
    }
    if (text.startsWith("//", i)) {
      const nl = text.indexOf("\n", i);
      i = nl === -1 ? text.length : nl;
      continue;
    }
    const ch = text[i];
    if (ch === '"' || ch === "'") {
      const end = skipQuoted(text, i, ch);
      if (end === null) {
        break;
      }
      i = end;
      continue;
    }
    if (ch === "{" || ch === "[") {
      const owner = lookbehindAssignment(text, i);
      if (owner !== null) {
        const node = parseValue({ text, i });
        if (node !== null && (node.kind === "object" || node.kind === "array")) {
          const open = offsetToLineCol(lines, node.start);
          const close = offsetToLineCol(lines, node.end - 1);
          const trailing = lines[close.line].slice(close.col + 1);
          const prefix = lines[open.line].slice(0, open.col);
          sites.push({
            kind: open.line === close.line ? "inline" : "multiline",
            owner,
            openLine: open.line,
            closeLine: close.line,
            openCol: open.col,
            trailing,
            lineLength:
              byteLength(prefix) + byteLength(renderInline(node)) + byteLength(trailing),
            hasTab: lineHasTab(lines, open.line, close.line),
            piped: isPiped(text, node.end),
            node,
          });
          i = node.end;
          continue;
        }
      }
    }
    i += 1;
  }
  return sites.filter((site) => !enumLines.has(site.openLine));
}

function eligible(site: AssignmentSite): boolean {
  return !site.hasTab && !site.piped;
}

function violationsFor(
  file: SourceFile,
  lines: string[],
  options: RuleOptions,
  severity: Violation["severity"],
): Violation[] {
  const wrapAt = wrapThreshold(options);
  const violations: Violation[] = [];
  for (const site of findAssignmentSites(lines)) {
    if (!eligible(site)) {
      continue;
    }
    if (site.kind === "multiline" && site.lineLength < wrapAt) {
      violations.push({
        ruleId: collapseAssignmentValues.id,
        message: `${site.owner} value of line length ${site.lineLength} must be inline (threshold ${wrapAt})`,
        severity,
        file: file.path,
        line: site.openLine + 1,
        column: site.openCol + 1,
      });
    }
  }
  return violations;
}

function collapseSite(records: LineRecord[], site: AssignmentSite): boolean {
  const prefix = records[site.openLine].content.slice(0, site.openCol);
  records[site.openLine].content = `${prefix}${renderInline(site.node)}${site.trailing}`;
  records[site.openLine].ending = records[site.closeLine].ending;
  records.splice(site.openLine + 1, site.closeLine - site.openLine);
  return true;
}

export const collapseAssignmentValues: Rule = {
  id: "collapse_assignment_values",
  description:
    "Assignment objects and arrays collapse to one line when that line would be shorter than 64 (Xano rewrites this on push)",
  defaultEnabled: true,
  defaultSeverity: "error",
  numericOptions: ["wrap_at"],
  lint(file: SourceFile, options: RuleOptions): Violation[] {
    const severity = options.severity ?? collapseAssignmentValues.defaultSeverity;
    const lines = splitLineRecords(file.text).map((record) => record.content);
    return violationsFor(file, lines, options, severity);
  },
  fix(file: SourceFile, options: RuleOptions): string | null {
    const suppressions = parseSuppressions(file.text);
    const rewriteLines = new Set(
      collapseAssignmentValues
        .lint(file, options)
        .filter((violation) => !isSuppressed(suppressions, violation.line, collapseAssignmentValues.id))
        .map((violation) => violation.line),
    );
    if (rewriteLines.size === 0) {
      return null;
    }
    const records = splitLineRecords(file.text);
    const lines = records.map((record) => record.content);
    const sites = findAssignmentSites(lines)
      .filter((site) => eligible(site) && rewriteLines.has(site.openLine + 1))
      .sort((a, b) => b.openLine - a.openLine);
    let changed = false;
    for (const site of sites) {
      if (collapseSite(records, site)) {
        changed = true;
      }
    }
    if (!changed) {
      return null;
    }
    return joinLineRecords(records);
  },
};
