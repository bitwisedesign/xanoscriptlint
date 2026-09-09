import { isSuppressed, parseSuppressions } from "../suppress.js";
import { isCommentLine } from "../util.js";
import { joinLineRecords, splitLineRecords } from "./line_records.js";
import { literalLines, matchNumericDefault, unquote } from "./numeric_declarations.js";
import type { Rule, RuleOptions, SourceFile, Violation } from "./types.js";

const NEGATIVE = /^-(?:\d+(?:\.\d*)?|\.\d+)$/;
const ZERO = /^[+-]?(?:0+(?:\.0*)?|\.0+)$/;

function isUnquotedNegative(line: string): { column: number } | null {
  const parsed = matchNumericDefault(line);
  if (parsed === null) {
    return null;
  }
  const { text, quoted } = unquote(parsed.value);
  if (quoted || !NEGATIVE.test(parsed.value) || ZERO.test(text) || Number(text) === 0) {
    return null;
  }
  return { column: parsed.valueStart + 1 };
}

function quoteNegativeDefault(line: string): string {
  const parsed = matchNumericDefault(line);
  if (parsed === null) {
    return line;
  }
  return `${parsed.head}${parsed.assign}"${parsed.value}"${line.slice(parsed.valueEnd)}`;
}

export const quoteNegativeNumericDefault: Rule = {
  id: "quote_negative_numeric_default",
  description: "Negative numeric defaults must be quoted",
  defaultEnabled: true,
  defaultSeverity: "error",
  lint(file: SourceFile, options: RuleOptions): Violation[] {
    const severity = options.severity ?? quoteNegativeNumericDefault.defaultSeverity;
    const lines = splitLineRecords(file.text).map((record) => record.content);
    const literals = literalLines(lines);
    const violations: Violation[] = [];
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (isCommentLine(line) || literals.has(i)) {
        continue;
      }
      const hit = isUnquotedNegative(line);
      if (hit) {
        violations.push({
          ruleId: quoteNegativeNumericDefault.id,
          message: "negative numeric default must be quoted; Xano quotes it on push",
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
      quoteNegativeNumericDefault
        .lint(file, options)
        .filter(
          (violation) =>
            !isSuppressed(suppressions, violation.line, quoteNegativeNumericDefault.id),
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
      const rewritten = quoteNegativeDefault(records[i].content);
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
