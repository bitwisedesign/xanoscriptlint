import { isSuppressed, parseSuppressions } from "../suppress.js";
import { isCommentLine } from "../util.js";
import { parseValue, renderInline } from "./collapse_assignment_values.js";
import type { Node } from "./collapse_assignment_values.js";
import { joinLineRecords, splitLineRecords } from "./line_records.js";
import type { LineRecord } from "./line_records.js";
import { isNumericZeroLiteral, unquote } from "./numeric_declarations.js";
import {
  ASSIGN,
  collectSpan,
  isCompoundEq,
  isOpaque,
  lineStartModes,
  skipQuoted,
  splitChain,
} from "./pipe_chains.js";
import type { Rule, RuleOptions, SourceFile, Violation } from "./types.js";

const SET_PREFIX = "|set:";
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

interface ZeroSetHit {
  column: number;
  keyRaw: string;
  displayKey: string;
  value: string;
  depth: number;
  objectKey: string | null;
}

interface AssignmentSite {
  openLine: number;
  closeLine: number;
  prefix: string;
  collapsed: string;
  skip: boolean;
  multilineBase: boolean;
  hasTab: boolean;
}

function displayKey(raw: string): string {
  if (raw.startsWith("$")) {
    return raw;
  }
  return `"${unquote(raw).text}"`;
}

function objectKeyFromSetPath(raw: string): string | null {
  if (raw.startsWith("$")) {
    return null;
  }
  const inner = unquote(raw);
  if (inner.text.includes(".")) {
    return null;
  }
  if (IDENT.test(inner.text)) {
    return inner.text;
  }
  if (inner.quoted) {
    return `"${inner.text}"`;
  }
  return null;
}

function readPath(text: string, start: number): { raw: string; end: number } | null {
  const ch = text[start];
  if (ch === '"' || ch === "'") {
    const end = skipQuoted(text, start, ch);
    if (end === null) {
      return null;
    }
    return { raw: text.slice(start, end), end };
  }
  let i = start;
  if (ch === "$") {
    i += 1;
  }
  if (!/[A-Za-z_]/.test(text[i] ?? "")) {
    return null;
  }
  i += 1;
  while (/[A-Za-z0-9_]/.test(text[i] ?? "")) {
    i += 1;
  }
  while (text[i] === "." && /[A-Za-z_]/.test(text[i + 1] ?? "")) {
    i += 2;
    while (/[A-Za-z0-9_]/.test(text[i] ?? "")) {
      i += 1;
    }
  }
  return { raw: text.slice(start, i), end: i };
}

function readValue(text: string, start: number): { text: string; end: number } | null {
  let i = start;
  while (text[i] === " " || text[i] === "\t") {
    i += 1;
  }
  const valueStart = i;
  let depth = 0;
  while (i < text.length) {
    if (isOpaque(text, i) || text.startsWith("//", i)) {
      break;
    }
    const ch = text[i];
    if (ch === '"' || ch === "'") {
      const end = skipQuoted(text, i, ch);
      if (end === null) {
        return null;
      }
      i = end;
      continue;
    }
    if (ch === "{" || ch === "[" || ch === "(") {
      depth += 1;
      i += 1;
      continue;
    }
    if (ch === "}" || ch === "]" || ch === ")") {
      if (depth === 0) {
        break;
      }
      depth -= 1;
      i += 1;
      continue;
    }
    if (ch === "|" && depth === 0) {
      if (text[i + 1] === "|") {
        i += 2;
        continue;
      }
      break;
    }
    i += 1;
  }
  return { text: text.slice(valueStart, i).trim(), end: i };
}

function parseZeroSet(text: string, pipeIndex: number): Omit<ZeroSetHit, "column" | "depth"> | null {
  if (!text.startsWith(SET_PREFIX, pipeIndex)) {
    return null;
  }
  const path = readPath(text, pipeIndex + SET_PREFIX.length);
  if (path === null || text[path.end] !== ":") {
    return null;
  }
  const value = readValue(text, path.end + 1);
  if (value === null || !isNumericZeroLiteral(value.text)) {
    return null;
  }
  return {
    keyRaw: path.raw,
    displayKey: displayKey(path.raw),
    value: value.text,
    objectKey: objectKeyFromSetPath(path.raw),
  };
}

function scanLine(line: string): ZeroSetHit[] {
  const hits: ZeroSetHit[] = [];
  let i = 0;
  let depth = 0;
  while (i < line.length) {
    if (isOpaque(line, i) || line.startsWith("//", i)) {
      break;
    }
    const ch = line[i];
    if (ch === '"' || ch === "'") {
      const end = skipQuoted(line, i, ch);
      if (end === null) {
        break;
      }
      i = end;
      continue;
    }
    if (ch === "{" || ch === "[" || ch === "(") {
      depth += 1;
      i += 1;
      continue;
    }
    if (ch === "}" || ch === "]" || ch === ")") {
      depth -= 1;
      i += 1;
      continue;
    }
    if (ch === "|") {
      if (line[i + 1] === "|") {
        i += 2;
        continue;
      }
      const parsed = parseZeroSet(line, i);
      if (parsed) {
        hits.push({ ...parsed, column: i + 1, depth });
      }
      i += 1;
      continue;
    }
    i += 1;
  }
  return hits;
}

function rangeHasTab(lines: string[], start: number, end: number): boolean {
  for (let i = start; i <= end; i += 1) {
    if (lines[i]?.includes("\t")) {
      return true;
    }
  }
  return false;
}

function parseObjectBase(base: string): Extract<Node, { kind: "object" }> | null {
  const cursor = { text: base.trim(), i: 0 };
  const node = parseValue(cursor);
  if (node === null || node.kind !== "object") {
    return null;
  }
  while (cursor.i < cursor.text.length && (cursor.text[cursor.i] === " " || cursor.text[cursor.i] === "\t")) {
    cursor.i += 1;
  }
  if (cursor.i !== cursor.text.length) {
    return null;
  }
  return node;
}

function keyName(key: string): string {
  return unquote(key).text;
}

function mergeZero(
  node: Extract<Node, { kind: "object" }>,
  key: string,
  zero: string,
): Extract<Node, { kind: "object" }> | null {
  const entries = node.entries.map((entry) => ({ key: entry.key, value: entry.value }));
  const value: Node = { kind: "scalar", text: zero, start: 0, end: 0 };
  const idx = entries.findIndex((entry) => keyName(entry.key) === keyName(key));
  if (idx >= 0) {
    const existing = entries[idx].value;
    if (existing.kind !== "scalar" || !isNumericZeroLiteral(existing.text)) {
      return null;
    }
  } else {
    entries.push({ key, value });
  }
  return { kind: "object", entries, start: 0, end: 0 };
}

function findAssignmentSites(lines: string[]): AssignmentSite[] {
  const sites: AssignmentSite[] = [];
  const startModes = lineStartModes(lines);
  for (let i = 0; i < lines.length; i += 1) {
    if (startModes[i] !== "code") {
      continue;
    }
    const match = ASSIGN.exec(lines[i]);
    if (match === null || match[1] === undefined || match[2] === undefined || match[3] === undefined) {
      continue;
    }
    const eqIndex = match[1].length + match[2].length + match[3].indexOf("=");
    if (isCompoundEq(lines[i], eqIndex)) {
      continue;
    }
    const span = collectSpan(lines, i, match[4] ?? "");
    if (span === null) {
      continue;
    }
    sites.push({
      openLine: i,
      closeLine: span.closeLine,
      prefix: `${match[1]}${match[2]}${match[3]}`,
      collapsed: span.collapsed,
      skip: span.skip,
      multilineBase: span.multilineBase,
      hasTab: rangeHasTab(lines, i, span.closeLine),
    });
    i = span.closeLine;
  }
  return sites;
}

function sourceLinesForTopZeros(
  lines: string[],
  site: AssignmentSite,
  filters: string[],
): (number | undefined)[] {
  const sourceLines: (number | undefined)[] = Array.from({ length: filters.length });
  let line = site.openLine;
  let usedOnLine = 0;
  for (let i = 0; i < filters.length; i += 1) {
    if (parseZeroSet(filters[i], 0) === null) {
      continue;
    }
    while (line <= site.closeLine) {
      const lineHits = scanLine(lines[line]).filter((item) => item.depth === 0);
      if (usedOnLine < lineHits.length) {
        sourceLines[i] = line;
        usedOnLine += 1;
        break;
      }
      line += 1;
      usedOnLine = 0;
    }
  }
  return sourceLines;
}

function rewriteSite(
  lines: string[],
  site: AssignmentSite,
  suppressed: (line: number) => boolean,
): string | null {
  if (site.skip || site.multilineBase || site.hasTab) {
    return null;
  }
  const split = splitChain(site.collapsed);
  if (split === null) {
    return null;
  }
  const base = parseObjectBase(split.base);
  if (base === null) {
    return null;
  }
  const sourceLines = sourceLinesForTopZeros(lines, site, split.filters);
  const hoistIndexes = new Set<number>();
  let merged = base;
  for (let i = 0; i < split.filters.length; i += 1) {
    const parsed = parseZeroSet(split.filters[i], 0);
    if (parsed === null || parsed.objectKey === null) {
      continue;
    }
    const sourceLine = sourceLines[i];
    if (sourceLine === undefined || suppressed(sourceLine + 1)) {
      continue;
    }
    const next = mergeZero(merged, parsed.objectKey, parsed.value);
    if (next === null) {
      continue;
    }
    hoistIndexes.add(i);
    merged = next;
  }
  if (hoistIndexes.size === 0) {
    return null;
  }
  const remaining = split.filters.filter((_, index) => !hoistIndexes.has(index));
  return `${site.prefix}${renderInline(merged)}${remaining.join("")}`;
}

function violationsFor(
  file: SourceFile,
  lines: string[],
  severity: Violation["severity"],
): Violation[] {
  const startModes = lineStartModes(lines);
  const violations: Violation[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (startModes[i] !== "code" || isCommentLine(lines[i])) {
      continue;
    }
    for (const hit of scanLine(lines[i])) {
      violations.push({
        ruleId: noZeroSetFilter.id,
        message: `|set: of 0 does not write ${hit.displayKey}; seed it on the object literal instead`,
        severity,
        file: file.path,
        line: i + 1,
        column: hit.column,
      });
    }
  }
  return violations;
}

export const noZeroSetFilter: Rule = {
  id: "no_zero_set_filter",
  description: "|set: of a numeric 0 does not write the field; seed it on the object literal",
  defaultEnabled: false,
  defaultSeverity: "error",
  lint(file: SourceFile, options: RuleOptions): Violation[] {
    const severity = options.severity ?? noZeroSetFilter.defaultSeverity;
    const lines = splitLineRecords(file.text).map((record) => record.content);
    return violationsFor(file, lines, severity);
  },
  fix(file: SourceFile, options: RuleOptions): string | null {
    const suppressions = parseSuppressions(file.text);
    const rewriteLines = new Set(
      noZeroSetFilter
        .lint(file, options)
        .filter((violation) => !isSuppressed(suppressions, violation.line, noZeroSetFilter.id))
        .map((violation) => violation.line),
    );
    if (rewriteLines.size === 0) {
      return null;
    }
    const records = splitLineRecords(file.text);
    const lines = records.map((record) => record.content);
    const sites = findAssignmentSites(lines)
      .filter((site) => {
        for (let line = site.openLine; line <= site.closeLine; line += 1) {
          if (rewriteLines.has(line + 1)) {
            return true;
          }
        }
        return false;
      })
      .sort((a, b) => b.openLine - a.openLine);
    let changed = false;
    for (const site of sites) {
      const rewritten = rewriteSite(lines, site, (line) =>
        isSuppressed(suppressions, line, noZeroSetFilter.id),
      );
      if (rewritten === null) {
        continue;
      }
      const lastEnding = records[site.closeLine].ending;
      const inserted: LineRecord[] = [{ content: rewritten, ending: lastEnding }];
      records.splice(site.openLine, site.closeLine - site.openLine + 1, ...inserted);
      changed = true;
    }
    if (!changed) {
      return null;
    }
    return joinLineRecords(records);
  },
};
