import { isSuppressed, parseSuppressions } from "../suppress.js";
import { leadingSpaces, planIndent } from "./indent_model.js";
import { joinLineRecords, splitLineRecords } from "./line_records.js";
import type { LineRecord } from "./line_records.js";
import type { Rule, RuleOptions, SourceFile, Violation } from "./types.js";

function indentMessage(expected: number, found: number): string {
  return `expected indent ${expected}, found ${found}`;
}

function withIndent(line: string, indent: number): string {
  return `${" ".repeat(indent)}${line.slice(leadingSpaces(line))}`;
}

function canShift(line: string, delta: number): boolean {
  return leadingSpaces(line) + delta >= 0;
}

function shiftBy(line: string, delta: number): string {
  return withIndent(line, leadingSpaces(line) + delta);
}

function violationsFor(
  file: SourceFile,
  lines: string[],
  severity: Violation["severity"],
): Violation[] {
  const plan = planIndent(lines);
  if (!plan.reliable) {
    return [];
  }
  const violations: Violation[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const expected = plan.expected[i];
    if (expected === null || expected === undefined) {
      continue;
    }
    const found = leadingSpaces(lines[i] ?? "");
    if (found === expected) {
      continue;
    }
    violations.push({
      ruleId: indentation.id,
      message: indentMessage(expected, found),
      severity,
      file: file.path,
      line: i + 1,
      column: 1,
    });
  }
  return violations;
}

function applyLine(lines: string[], index: number, plan: ReturnType<typeof planIndent>): boolean {
  const expected = plan.expected[index];
  if (expected === null || expected === undefined) {
    return false;
  }
  const current = lines[index] ?? "";
  const delta = expected - leadingSpaces(current);
  if (delta === 0) {
    return false;
  }
  const bodyEnd = plan.bodyOf.get(index);
  if (bodyEnd !== undefined) {
    for (let j = index + 1; j <= bodyEnd; j += 1) {
      if (!canShift(lines[j] ?? "", delta)) {
        return false;
      }
    }
    for (let j = index + 1; j <= bodyEnd; j += 1) {
      lines[j] = shiftBy(lines[j] ?? "", delta);
    }
  }
  lines[index] = withIndent(current, expected);
  return true;
}

export const indentation: Rule = {
  id: "indentation",
  description:
    "Code is indented two spaces per nesting level; a wrapped filter pipeline stays at its opener's indent plus two",
  defaultEnabled: false,
  defaultSeverity: "warning",
  lint(file: SourceFile, options: RuleOptions): Violation[] {
    const severity = options.severity ?? indentation.defaultSeverity;
    const lines = splitLineRecords(file.text).map((record) => record.content);
    return violationsFor(file, lines, severity);
  },
  fix(file: SourceFile, options: RuleOptions): string | null {
    const suppressions = parseSuppressions(file.text);
    const rewriteLines = new Set(
      indentation
        .lint(file, options)
        .filter((violation) => !isSuppressed(suppressions, violation.line, indentation.id))
        .map((violation) => violation.line),
    );
    if (rewriteLines.size === 0) {
      return null;
    }
    const records = splitLineRecords(file.text);
    const lines = records.map((record) => record.content);
    const plan = planIndent(lines);
    if (!plan.reliable) {
      return null;
    }
    const indexes = [...rewriteLines]
      .map((line) => line - 1)
      .sort((a, b) => b - a);
    let changed = false;
    for (const index of indexes) {
      if (applyLine(lines, index, plan)) {
        changed = true;
      }
    }
    if (!changed) {
      return null;
    }
    const next: LineRecord[] = records.map((record, index) => ({
      ...record,
      content: lines[index] ?? record.content,
    }));
    return joinLineRecords(next);
  },
};
