import { isSuppressed, parseSuppressions } from "../suppress.js";
import { isCommentLine } from "../util.js";
import { joinLineRecords, splitLineRecords } from "./line_records.js";
import { literalLines, matchNumericDefault, unquote } from "./numeric_declarations.js";
import type { Rule, RuleOptions, SourceFile, Violation } from "./types.js";

const ZERO = /^[+-]?(?:0+(?:\.0*)?|\.0+)$/;

function isZeroDefault(line: string): { column: number } | null {
  const parsed = matchNumericDefault(line);
  if (parsed === null) {
    return null;
  }
  if (!ZERO.test(unquote(parsed.value).text)) {
    return null;
  }
  return { column: parsed.head.length + parsed.assign.indexOf("=") + 1 };
}

function stripZeroDefault(line: string): string {
  const parsed = matchNumericDefault(line);
  if (parsed === null) {
    return line;
  }
  return `${parsed.head}${line.slice(parsed.valueEnd)}`;
}

export const noZeroNumericDefault: Rule = {
  id: "no_zero_numeric_default",
  description: "Numeric defaults of 0 must be omitted",
  defaultEnabled: true,
  defaultSeverity: "error",
  lint(file: SourceFile, options: RuleOptions): Violation[] {
    const severity = options.severity ?? noZeroNumericDefault.defaultSeverity;
    const lines = splitLineRecords(file.text).map((record) => record.content);
    const literals = literalLines(lines);
    const violations: Violation[] = [];
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (isCommentLine(line) || literals.has(i)) {
        continue;
      }
      const hit = isZeroDefault(line);
      if (hit) {
        violations.push({
          ruleId: noZeroNumericDefault.id,
          message: "numeric default of 0 must be omitted; Xano strips it on push",
          severity,
          file: file.path,
          line: i + 1,
          column: hit.column,
        });
      }
    }
    return violations;
  },
  fix(file: SourceFile, options: RuleOptions): string | null {
    const suppressions = parseSuppressions(file.text);
    const rewriteLines = new Set(
      noZeroNumericDefault
        .lint(file, options)
        .filter(
          (violation) => !isSuppressed(suppressions, violation.line, noZeroNumericDefault.id),
        )
        .map((violation) => violation.line),
    );
    if (rewriteLines.size === 0) {
      return null;
    }
    const records = splitLineRecords(file.text);
    let changed = false;
    for (let i = 0; i < records.length; i += 1) {
      if (!rewriteLines.has(i + 1)) {
        continue;
      }
      const rewritten = stripZeroDefault(records[i].content);
      if (rewritten !== records[i].content) {
        records[i].content = rewritten;
        changed = true;
      }
    }
    if (!changed) {
      return null;
    }
    return joinLineRecords(records);
  },
};
