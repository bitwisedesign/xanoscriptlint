import { isSuppressed, parseSuppressions } from "../suppress.js";
import { isCommentLine } from "../util.js";
import { joinLineRecords, splitLineRecords } from "./line_records.js";
import { skipQuoted } from "./pipe_chains.js";
import type { Rule, RuleOptions, SourceFile, Violation } from "./types.js";

const IF_OPENER = /^(\s*(?:else)?if\s*\()/;
const TRAILING_PATH = /(?:\$[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)$/;
const BOUND_BEFORE = /(?:\(|&&|\|\|)$/;
const BOUND_AFTER = /^(?:\)|&&|\|\|)/;

interface EqualTrueHit {
  line: number;
  column: number;
  start: number;
  end: number;
}

function isBoundaryBefore(line: string, pathStart: number): boolean {
  let i = pathStart;
  while (i > 0 && (line[i - 1] === " " || line[i - 1] === "\t")) {
    i -= 1;
  }
  if (i > 0 && line[i - 1] === "!") {
    return false;
  }
  return BOUND_BEFORE.test(line.slice(0, i));
}

function isBoundaryAfter(line: string, trueEnd: number): boolean {
  let i = trueEnd;
  while (i < line.length && (line[i] === " " || line[i] === "\t")) {
    i += 1;
  }
  return BOUND_AFTER.test(line.slice(i));
}

function findHits(line: string): Omit<EqualTrueHit, "line">[] {
  if (!IF_OPENER.test(line) || isCommentLine(line)) {
    return [];
  }
  const hits: Omit<EqualTrueHit, "line">[] = [];
  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (ch === '"' || ch === "'") {
      const end = skipQuoted(line, i, ch);
      i = end === null ? line.length : end;
      continue;
    }
    if (line.startsWith("//", i)) {
      break;
    }
    if (line.startsWith("==", i) && line[i - 1] !== "=" && line[i - 1] !== "!" && line[i + 2] !== "=") {
      let trueStart = i + 2;
      while (trueStart < line.length && (line[trueStart] === " " || line[trueStart] === "\t")) {
        trueStart += 1;
      }
      if (line.startsWith("true", trueStart) && !/[A-Za-z0-9_]/.test(line[trueStart + 4] ?? "")) {
        let pathEnd = i;
        while (pathEnd > 0 && (line[pathEnd - 1] === " " || line[pathEnd - 1] === "\t")) {
          pathEnd -= 1;
        }
        const before = line.slice(0, pathEnd);
        const trailing = TRAILING_PATH.exec(before);
        if (
          trailing !== null &&
          isBoundaryBefore(line, pathEnd - trailing[0].length) &&
          isBoundaryAfter(line, trueStart + 4)
        ) {
          hits.push({
            column: i + 1,
            start: pathEnd,
            end: trueStart + 4,
          });
        }
      }
    }
    i += 1;
  }
  return hits;
}

function indexOutsideQuotes(line: string, token: string): number {
  let col = 0;
  while (col < line.length) {
    const ch = line[col];
    if (ch === "/" && line[col + 1] === "/") {
      return -1;
    }
    if (line.startsWith(token, col)) {
      return col;
    }
    if (ch === '"' || ch === "'") {
      const end = skipQuoted(line, col, ch);
      if (end === null) {
        return -1;
      }
      col = end;
      continue;
    }
    col += 1;
  }
  return -1;
}

function lineOpensMultiline(line: string): "fence" | "triple" | null {
  const fenceAt = indexOutsideQuotes(line, "```");
  const tripleAt = indexOutsideQuotes(line, '"""');
  if (fenceAt === -1 && tripleAt === -1) {
    return null;
  }
  if (tripleAt !== -1 && (fenceAt === -1 || tripleAt < fenceAt)) {
    return line.indexOf('"""', tripleAt + 3) === -1 ? "triple" : null;
  }
  return line.indexOf("```", fenceAt + 3) === -1 ? "fence" : null;
}

function findLineHits(lines: string[]): EqualTrueHit[] {
  const hits: EqualTrueHit[] = [];
  let mode: "code" | "fence" | "triple" = "code";
  for (let line = 0; line < lines.length; line += 1) {
    const text = lines[line] ?? "";
    let scanStart = 0;
    if (mode !== "code") {
      const closer = mode === "fence" ? "```" : '"""';
      const closeAt = text.indexOf(closer);
      if (closeAt === -1) {
        continue;
      }
      mode = "code";
      scanStart = closeAt + closer.length;
    }
    const scan = text.slice(scanStart);
    for (const hit of findHits(scan)) {
      hits.push({
        line,
        column: hit.column + scanStart,
        start: hit.start + scanStart,
        end: hit.end + scanStart,
      });
    }
    const opened = lineOpensMultiline(scan);
    if (opened !== null) {
      mode = opened;
    }
  }
  return hits;
}

function violationsFor(
  file: SourceFile,
  lines: string[],
  severity: Violation["severity"],
): Violation[] {
  return findLineHits(lines).map((hit) => ({
    ruleId: noEqualTrueCondition.id,
    message: "`== true` in an if/elseif condition is stripped on push; use the path alone",
    severity,
    file: file.path,
    line: hit.line + 1,
    column: hit.column,
  }));
}

export const noEqualTrueCondition: Rule = {
  id: "no_equal_true_condition",
  description:
    "`$path == true` inside if/elseif is rewritten to `$path` (Xano strips it on push)",
  defaultEnabled: false,
  defaultSeverity: "warning",
  lint(file: SourceFile, options: RuleOptions): Violation[] {
    const severity = options.severity ?? noEqualTrueCondition.defaultSeverity;
    const lines = splitLineRecords(file.text).map((record) => record.content);
    return violationsFor(file, lines, severity);
  },
  fix(file: SourceFile, options: RuleOptions): string | null {
    const suppressions = parseSuppressions(file.text);
    const allowed = new Set(
      noEqualTrueCondition
        .lint(file, options)
        .filter(
          (violation) => !isSuppressed(suppressions, violation.line, noEqualTrueCondition.id),
        )
        .map((violation) => `${violation.line}:${violation.column}`),
    );
    if (allowed.size === 0) {
      return null;
    }
    const records = splitLineRecords(file.text);
    const lines = records.map((record) => record.content);
    const hits = findLineHits(lines)
      .filter((hit) => allowed.has(`${hit.line + 1}:${hit.column}`))
      .sort((a, b) => b.line - a.line || b.start - a.start);
    let changed = false;
    for (const hit of hits) {
      const line = records[hit.line];
      if (line === undefined) {
        continue;
      }
      line.content = `${line.content.slice(0, hit.start)}${line.content.slice(hit.end)}`;
      changed = true;
    }
    if (!changed) {
      return null;
    }
    return joinLineRecords(records);
  },
};
