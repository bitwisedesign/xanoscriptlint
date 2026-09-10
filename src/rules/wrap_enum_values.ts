import { isSuppressed, parseSuppressions } from "../suppress.js";
import { isBlankLine, isCommentLine } from "../util.js";
import { joinLineRecords, splitLineRecords } from "./line_records.js";
import type { LineRecord } from "./line_records.js";
import { literalLines } from "./numeric_declarations.js";
import type { Rule, RuleOptions, SourceFile, Violation } from "./types.js";

export const DEFAULT_WRAP_AT = 64;

const ENUM_OPENER = /^(\s*)enum\b[^{}]*\{\s*$/;
const VALUES_OPENER = /^(\s*)values\s*=\s*\[/;

interface EnumValuesSite {
  kind: "inline" | "wrapped";
  enumIndent: number;
  valuesIndent: number;
  valuesLine: number;
  bracketLine: number;
  enumCloseLine: number;
  tokens: string[];
  compactLength: number;
  hasTab: boolean;
}

function wrapThreshold(options: RuleOptions): number {
  return options.wrapAt ?? DEFAULT_WRAP_AT;
}

function compactLength(tokens: string[]): number {
  return JSON.stringify(tokens).length;
}

function readQuoted(
  text: string,
  start: number,
  quote: '"' | "'",
): { value: string; end: number } | null {
  let i = start + 1;
  let escape = false;
  let value = "";
  while (i < text.length) {
    const ch = text[i];
    if (escape) {
      value += ch;
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
      return { value, end: i + 1 };
    }
    value += ch;
    i += 1;
  }
  return null;
}

function parseStringArrayInner(inner: string): string[] | null {
  const tokens: string[] = [];
  let i = 0;
  while (i < inner.length) {
    const ch = inner[i];
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      i += 1;
      continue;
    }
    if (ch === "/" && inner[i + 1] === "/") {
      return null;
    }
    if (ch === ",") {
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const read = readQuoted(inner, i, ch);
      if (read === null) {
        return null;
      }
      tokens.push(read.value);
      i = read.end;
      continue;
    }
    return null;
  }
  return tokens;
}

function findMatchingBracket(
  lines: string[],
  startLine: number,
  startCol: number,
): { line: number; col: number } | null {
  let mode: "code" | "double" | "single" = "code";
  let escape = false;
  let depth = 1;
  let line = startLine;
  let col = startCol + 1;
  while (line < lines.length) {
    const text = lines[line];
    while (col < text.length) {
      const ch = text[col];
      if (mode === "double" || mode === "single") {
        if (escape) {
          escape = false;
          col += 1;
          continue;
        }
        if (ch === "\\") {
          escape = true;
          col += 1;
          continue;
        }
        if ((mode === "double" && ch === '"') || (mode === "single" && ch === "'")) {
          mode = "code";
        }
        col += 1;
        continue;
      }
      if (ch === "/" && text[col + 1] === "/") {
        break;
      }
      if (ch === '"') {
        mode = "double";
        col += 1;
        continue;
      }
      if (ch === "'") {
        mode = "single";
        col += 1;
        continue;
      }
      if (ch === "[") {
        depth += 1;
        col += 1;
        continue;
      }
      if (ch === "]") {
        depth -= 1;
        if (depth === 0) {
          return { line, col };
        }
        col += 1;
        continue;
      }
      col += 1;
    }
    line += 1;
    col = 0;
  }
  return null;
}

function findEnumClose(
  lines: string[],
  openLine: number,
  literals: Set<number>,
): number | null {
  let depth = 1;
  let mode: "code" | "double" | "single" = "code";
  let escape = false;
  for (let line = openLine + 1; line < lines.length; line += 1) {
    if (literals.has(line) || isCommentLine(lines[line])) {
      continue;
    }
    const text = lines[line];
    let col = 0;
    while (col < text.length) {
      const ch = text[col];
      if (mode === "double" || mode === "single") {
        if (escape) {
          escape = false;
          col += 1;
          continue;
        }
        if (ch === "\\") {
          escape = true;
          col += 1;
          continue;
        }
        if ((mode === "double" && ch === '"') || (mode === "single" && ch === "'")) {
          mode = "code";
        }
        col += 1;
        continue;
      }
      if (ch === "/" && text[col + 1] === "/") {
        break;
      }
      if (ch === '"') {
        mode = "double";
        col += 1;
        continue;
      }
      if (ch === "'") {
        mode = "single";
        col += 1;
        continue;
      }
      if (ch === "{") {
        depth += 1;
        col += 1;
        continue;
      }
      if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          return line;
        }
        col += 1;
        continue;
      }
      col += 1;
    }
  }
  return null;
}

function sliceRange(
  lines: string[],
  startLine: number,
  startCol: number,
  endLine: number,
  endCol: number,
): string {
  if (startLine === endLine) {
    return lines[startLine].slice(startCol, endCol);
  }
  const parts = [lines[startLine].slice(startCol)];
  for (let i = startLine + 1; i < endLine; i += 1) {
    parts.push(lines[i]);
  }
  parts.push(lines[endLine].slice(0, endCol));
  return parts.join("\n");
}

function rangeHasTab(lines: string[], startLine: number, endLine: number): boolean {
  for (let i = startLine; i <= endLine; i += 1) {
    if (lines[i].includes("\t")) {
      return true;
    }
  }
  return false;
}

function parseValuesSite(
  lines: string[],
  valuesLine: number,
  enumCloseLine: number,
  enumIndent: number,
): EnumValuesSite | null {
  const line = lines[valuesLine];
  const match = VALUES_OPENER.exec(line);
  if (match === null || match[1] === undefined) {
    return null;
  }
  const openCol = match[0].length - 1;
  const close = findMatchingBracket(lines, valuesLine, openCol);
  if (close === null || close.line >= enumCloseLine) {
    return null;
  }
  const trailing = lines[close.line].slice(close.col + 1);
  if (trailing.trim() !== "") {
    return null;
  }
  const inner = sliceRange(lines, valuesLine, openCol + 1, close.line, close.col);
  const tokens = parseStringArrayInner(inner);
  if (tokens === null) {
    return null;
  }
  return {
    kind: close.line === valuesLine ? "inline" : "wrapped",
    enumIndent,
    valuesIndent: match[1].length,
    valuesLine,
    bracketLine: close.line,
    enumCloseLine,
    tokens,
    compactLength: compactLength(tokens),
    hasTab: rangeHasTab(lines, valuesLine, close.line),
  };
}

function findEnumValues(
  lines: string[],
  literals: Set<number>,
): EnumValuesSite[] {
  const sites: EnumValuesSite[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (literals.has(i) || isCommentLine(lines[i])) {
      continue;
    }
    const open = ENUM_OPENER.exec(lines[i]);
    if (open === null || open[1] === undefined) {
      continue;
    }
    const enumCloseLine = findEnumClose(lines, i, literals);
    if (enumCloseLine === null) {
      continue;
    }
    for (let j = i + 1; j < enumCloseLine; j += 1) {
      if (literals.has(j) || isCommentLine(lines[j])) {
        continue;
      }
      if (VALUES_OPENER.test(lines[j])) {
        const site = parseValuesSite(lines, j, enumCloseLine, open[1].length);
        if (site !== null) {
          sites.push(site);
        }
        break;
      }
    }
    i = enumCloseLine;
  }
  return sites;
}

function inlineValuesLine(indent: string, tokens: string[]): string {
  return `${indent}values = [${tokens.map((token) => JSON.stringify(token)).join(", ")}]`;
}

function isCloserLine(line: string): boolean {
  return line.trim() === "}";
}

function expandInline(records: LineRecord[], site: EnumValuesSite): boolean {
  if (site.hasTab) {
    return false;
  }
  const valuesRecord = records[site.valuesLine];
  const indent = " ".repeat(site.valuesIndent);
  const itemIndent = " ".repeat(site.valuesIndent + 2);
  const ending = valuesRecord.ending === "" ? "\n" : valuesRecord.ending;
  const next = records[site.valuesLine + 1];
  const addBlank = next !== undefined && isCloserLine(next.content);
  const inserted: LineRecord[] = site.tokens.map((token) => ({
    content: `${itemIndent}${JSON.stringify(token)}`,
    ending,
  }));
  inserted.push({ content: `${indent}]`, ending });
  if (addBlank) {
    inserted.push({ content: " ".repeat(site.enumIndent), ending });
  }
  records[site.valuesLine].content = `${indent}values = [`;
  records.splice(site.valuesLine + 1, 0, ...inserted);
  return true;
}

function collapseWrapped(records: LineRecord[], site: EnumValuesSite): boolean {
  if (site.hasTab) {
    return false;
  }
  const indent = " ".repeat(site.valuesIndent);
  records[site.valuesLine].content = inlineValuesLine(indent, site.tokens);
  const deleteCount = site.bracketLine - site.valuesLine;
  records.splice(site.valuesLine + 1, deleteCount);
  const after = records[site.valuesLine + 1];
  const closer = records[site.valuesLine + 2];
  if (
    after !== undefined &&
    closer !== undefined &&
    isBlankLine(after.content) &&
    isCloserLine(closer.content)
  ) {
    records.splice(site.valuesLine + 1, 1);
  }
  return true;
}

function violationsFor(
  file: SourceFile,
  lines: string[],
  options: RuleOptions,
  severity: Violation["severity"],
): Violation[] {
  const wrapAt = wrapThreshold(options);
  const literals = literalLines(lines);
  const violations: Violation[] = [];
  for (const site of findEnumValues(lines, literals)) {
    if (site.kind === "inline" && site.compactLength >= wrapAt) {
      violations.push({
        ruleId: wrapEnumValues.id,
        message: `enum values of compact length ${site.compactLength} must be wrapped (threshold ${wrapAt})`,
        severity,
        file: file.path,
        line: site.valuesLine + 1,
        column: site.valuesIndent + 1,
      });
    } else if (site.kind === "wrapped" && site.compactLength < wrapAt) {
      violations.push({
        ruleId: wrapEnumValues.id,
        message: `enum values of compact length ${site.compactLength} must be inline (threshold ${wrapAt})`,
        severity,
        file: file.path,
        line: site.valuesLine + 1,
        column: site.valuesIndent + 1,
      });
    }
  }
  return violations;
}

export const wrapEnumValues: Rule = {
  id: "wrap_enum_values",
  description:
    "Enum values arrays wrap when compact JSON length reaches 64 (Xano rewrites this on push)",
  defaultEnabled: true,
  defaultSeverity: "error",
  numericOptions: ["wrap_at"],
  lint(file: SourceFile, options: RuleOptions): Violation[] {
    const severity = options.severity ?? wrapEnumValues.defaultSeverity;
    const lines = splitLineRecords(file.text).map((record) => record.content);
    return violationsFor(file, lines, options, severity);
  },
  fix(file: SourceFile, options: RuleOptions): string | null {
    const suppressions = parseSuppressions(file.text);
    const rewriteLines = new Set(
      wrapEnumValues
        .lint(file, options)
        .filter((violation) => !isSuppressed(suppressions, violation.line, wrapEnumValues.id))
        .map((violation) => violation.line),
    );
    if (rewriteLines.size === 0) {
      return null;
    }
    const records = splitLineRecords(file.text);
    const lines = records.map((record) => record.content);
    const literals = literalLines(lines);
    const wrapAt = wrapThreshold(options);
    const sites = findEnumValues(lines, literals)
      .filter((site) => rewriteLines.has(site.valuesLine + 1))
      .sort((a, b) => b.valuesLine - a.valuesLine);
    let changed = false;
    for (const site of sites) {
      if (site.kind === "inline" && site.compactLength >= wrapAt) {
        if (expandInline(records, site)) {
          changed = true;
        }
      } else if (site.kind === "wrapped" && site.compactLength < wrapAt) {
        if (collapseWrapped(records, site)) {
          changed = true;
        }
      }
    }
    if (!changed) {
      return null;
    }
    return joinLineRecords(records);
  },
};
