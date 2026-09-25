import { isSuppressed, parseSuppressions } from "../suppress.js";
import { planIndent } from "./indent_model.js";
import { joinLineRecords, splitLineRecords } from "./line_records.js";
import type { LineRecord } from "./line_records.js";
import type { Rule, RuleOptions, SourceFile, Violation } from "./types.js";

function separatorMessage(expected: number, found: number): string {
  return `expected separator width ${expected}, found ${found}`;
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
    const expected = plan.separator[i];
    if (expected === null || expected === undefined) {
      continue;
    }
    const found = (lines[i] ?? "").length;
    if (found === expected) {
      continue;
    }
    violations.push({
      ruleId: separatorIndentation.id,
      message: separatorMessage(expected, found),
      severity,
      file: file.path,
      line: i + 1,
      column: 1,
    });
  }
  return violations;
}

export const separatorIndentation: Rule = {
  id: "separator_indentation",
  description:
    'Whitespace-only lines use the enclosing block opener\'s indent; empty lines in """ strings use the opener\'s indent plus 2',
  defaultEnabled: false,
  defaultSeverity: "warning",
  lint(file: SourceFile, options: RuleOptions): Violation[] {
    const severity = options.severity ?? separatorIndentation.defaultSeverity;
    const lines = splitLineRecords(file.text).map((record) => record.content);
    return violationsFor(file, lines, severity);
  },
  fix(file: SourceFile, options: RuleOptions): string | null {
    const suppressions = parseSuppressions(file.text);
    const rewriteLines = new Set(
      separatorIndentation
        .lint(file, options)
        .filter((violation) => !isSuppressed(suppressions, violation.line, separatorIndentation.id))
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
    let changed = false;
    for (const line of rewriteLines) {
      const index = line - 1;
      const expected = plan.separator[index];
      if (expected === null || expected === undefined) {
        continue;
      }
      const next = " ".repeat(expected);
      if (lines[index] === next) {
        continue;
      }
      lines[index] = next;
      changed = true;
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
