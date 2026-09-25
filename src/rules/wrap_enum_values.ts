import { isSuppressed, parseSuppressions } from "../suppress.js";
import { isBlankLine, isCommentLine } from "../util.js";
import { joinLineRecords, splitLineRecords } from "./line_records.js";
import type { LineRecord } from "./line_records.js";
import { literalLines } from "./numeric_declarations.js";
import {
  DEFAULT_WRAP_AT,
  VALUES_OPENER,
  inlineArrayLine,
  parseStringArraySite,
  wrapThreshold,
  type StringArraySite,
} from "./string_arrays.js";
import type { Rule, RuleOptions, SourceFile, Violation } from "./types.js";

export { DEFAULT_WRAP_AT };

const ENUM_OPENER = /^(\s*)enum\b[^{}]*\{\s*$/;

interface EnumValuesSite extends StringArraySite {
  enumIndent: number;
  enumOpenLine: number;
  enumCloseLine: number;
}

const NEED_SEPARATOR =
  "wrapped enum values need a whitespace line before the enum's closing brace when a comment precedes the enum";
const NEED_ONE_SEPARATOR =
  "wrapped enum values need exactly one whitespace line before the enum's closing brace when a comment precedes the enum";
const FORBID_SEPARATOR =
  "wrapped enum values must not have a whitespace line before the enum's closing brace unless a comment precedes the enum";

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

function parseValuesSite(
  lines: string[],
  valuesLine: number,
  enumOpenLine: number,
  enumCloseLine: number,
  enumIndent: number,
): EnumValuesSite | null {
  const match = VALUES_OPENER.exec(lines[valuesLine]);
  if (match === null || match[1] === undefined) {
    return null;
  }
  const openCol = match[0].length - 1;
  const site = parseStringArraySite(lines, valuesLine, match[1].length, openCol, enumCloseLine);
  if (site === null) {
    return null;
  }
  return {
    ...site,
    enumIndent,
    enumOpenLine,
    enumCloseLine,
  };
}

function wantsSeparator(lines: string[], site: EnumValuesSite): boolean {
  return isCommentLine(lines[site.enumOpenLine - 1] ?? "");
}

function separatorBlankCount(lines: string[], site: EnumValuesSite): number | null {
  let count = 0;
  for (let i = site.bracketLine + 1; i < site.enumCloseLine; i += 1) {
    if (!isBlankLine(lines[i] ?? "")) {
      return null;
    }
    count += 1;
  }
  return count;
}

export function enumValuesOpenLines(lines: string[]): Set<number> {
  return new Set(
    findEnumValues(lines, literalLines(lines)).map((site) => site.openLine),
  );
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
        const site = parseValuesSite(lines, j, i, enumCloseLine, open[1].length);
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

function isCloserLine(line: string): boolean {
  return line.trim() === "}";
}

function expandInline(
  records: LineRecord[],
  site: EnumValuesSite,
  wantSeparator: boolean,
): boolean {
  if (site.hasTab) {
    return false;
  }
  const valuesRecord = records[site.openLine];
  if (valuesRecord === undefined) {
    return false;
  }
  const indent = " ".repeat(site.indent);
  const itemIndent = " ".repeat(site.indent + 2);
  const ending = valuesRecord.ending === "" ? "\n" : valuesRecord.ending;
  const blankCount = trailingBlanksBeforeCloser(records, site.openLine + 1);
  const closer = records[site.openLine + 1 + blankCount];
  const hasCloser = closer !== undefined && isCloserLine(closer.content);
  if (blankCount > 0) {
    records.splice(site.openLine + 1, blankCount);
  }
  const inserted: LineRecord[] = site.tokens.map((token) => ({
    content: `${itemIndent}${JSON.stringify(token)}`,
    ending,
  }));
  inserted.push({ content: `${indent}]`, ending });
  if (wantSeparator && hasCloser) {
    inserted.push({ content: " ".repeat(site.enumIndent), ending });
  }
  records[site.openLine].content = `${indent}values = [`;
  records.splice(site.openLine + 1, 0, ...inserted);
  return true;
}

function trailingBlanksBeforeCloser(
  records: LineRecord[],
  start: number,
): number {
  let count = 0;
  while (
    records[start + count] !== undefined &&
    isBlankLine(records[start + count]?.content ?? "")
  ) {
    count += 1;
  }
  const closer = records[start + count];
  if (closer === undefined || !isCloserLine(closer.content)) {
    return 0;
  }
  return count;
}

function collapseWrapped(records: LineRecord[], site: EnumValuesSite): boolean {
  if (site.hasTab) {
    return false;
  }
  const indent = " ".repeat(site.indent);
  records[site.openLine].content = inlineArrayLine(indent, "values", site.tokens);
  const deleteCount = site.bracketLine - site.openLine;
  records.splice(site.openLine + 1, deleteCount);
  const blankCount = trailingBlanksBeforeCloser(records, site.openLine + 1);
  if (blankCount > 0) {
    records.splice(site.openLine + 1, blankCount);
  }
  return true;
}

function fixSeparator(
  records: LineRecord[],
  site: EnumValuesSite,
  want: boolean,
): boolean {
  if (site.hasTab) {
    return false;
  }
  const blankCount = trailingBlanksBeforeCloser(records, site.bracketLine + 1);
  const closer = records[site.bracketLine + 1 + blankCount];
  if (closer === undefined || !isCloserLine(closer.content)) {
    return false;
  }
  if (want) {
    if (blankCount === 1) {
      return false;
    }
    if (blankCount === 0) {
      const bracket = records[site.bracketLine];
      const ending = bracket === undefined || bracket.ending === "" ? "\n" : bracket.ending;
      records.splice(site.bracketLine + 1, 0, {
        content: " ".repeat(site.enumIndent),
        ending,
      });
      return true;
    }
    records.splice(site.bracketLine + 2, blankCount - 1);
    return true;
  }
  if (blankCount === 0) {
    return false;
  }
  records.splice(site.bracketLine + 1, blankCount);
  return true;
}

function violationsFor(
  file: SourceFile,
  lines: string[],
  options: RuleOptions,
  severity: Violation["severity"],
): Violation[] {
  const wrapAt = wrapThreshold(options.wrapAt);
  const literals = literalLines(lines);
  const violations: Violation[] = [];
  for (const site of findEnumValues(lines, literals)) {
    if (site.kind === "inline" && site.compactLength >= wrapAt) {
      violations.push({
        ruleId: wrapEnumValues.id,
        message: `enum values of compact length ${site.compactLength} must be wrapped (threshold ${wrapAt})`,
        severity,
        file: file.path,
        line: site.openLine + 1,
        column: site.indent + 1,
      });
    } else if (site.kind === "wrapped" && site.compactLength < wrapAt) {
      violations.push({
        ruleId: wrapEnumValues.id,
        message: `enum values of compact length ${site.compactLength} must be inline (threshold ${wrapAt})`,
        severity,
        file: file.path,
        line: site.openLine + 1,
        column: site.indent + 1,
      });
    } else if (site.kind === "wrapped" && site.compactLength >= wrapAt) {
      const blanks = separatorBlankCount(lines, site);
      if (blanks === null) {
        continue;
      }
      const want = wantsSeparator(lines, site);
      let message: string | null = null;
      if (want && blanks === 0) {
        message = NEED_SEPARATOR;
      } else if (want && blanks > 1) {
        message = NEED_ONE_SEPARATOR;
      } else if (!want && blanks > 0) {
        message = FORBID_SEPARATOR;
      }
      if (message !== null) {
        violations.push({
          ruleId: wrapEnumValues.id,
          message,
          severity,
          file: file.path,
          line: site.openLine + 1,
          column: site.indent + 1,
        });
      }
    }
  }
  return violations;
}

export const wrapEnumValues: Rule = {
  id: "wrap_enum_values",
  description:
    "Enum values arrays wrap when compact JSON length reaches 64 (Xano rewrites this on push)",
  defaultEnabled: false,
  defaultSeverity: "warning",
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
    const wrapAt = wrapThreshold(options.wrapAt);
    const sites = findEnumValues(lines, literals)
      .filter((site) => rewriteLines.has(site.openLine + 1))
      .sort((a, b) => b.openLine - a.openLine);
    let changed = false;
    for (const site of sites) {
      if (site.kind === "inline" && site.compactLength >= wrapAt) {
        if (expandInline(records, site, wantsSeparator(lines, site))) {
          changed = true;
        }
      } else if (site.kind === "wrapped" && site.compactLength < wrapAt) {
        if (collapseWrapped(records, site)) {
          changed = true;
        }
      } else if (site.kind === "wrapped" && site.compactLength >= wrapAt) {
        if (fixSeparator(records, site, wantsSeparator(lines, site))) {
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
