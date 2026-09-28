import { isBlankLine, isCommentLine, splitLines } from "../util.js";
import { literalLines } from "./numeric_declarations.js";
import type { Rule, RuleOptions, SourceFile, Violation } from "./types.js";

const OPENER =
  /^(\s*)expect\.(to_equal|to_not_equal)\s*(\(.*\))\s*\{\s*(.*?)\s*$/;
const ONE_LINE_NULL = /^value\s*=\s*null\s*\}$/;
const VALUE_NULL = /^\s*value\s*=\s*null\s*$/;
const CLOSER = /^\s*\}\s*$/;

function messageFor(kind: "to_equal" | "to_not_equal", arg: string): string {
  if (kind === "to_equal") {
    return `expect.to_equal with value = null is verbose; use expect.to_not_be_defined ${arg}, or expect.to_be_null ${arg} when the key must be present`;
  }
  return `expect.to_not_equal with value = null is verbose; use expect.to_be_defined ${arg}, or expect.to_not_be_null ${arg} when the key must be present`;
}

function nextCodeLine(lines: string[], start: number): number {
  for (let i = start; i < lines.length; i += 1) {
    if (isBlankLine(lines[i]) || isCommentLine(lines[i])) {
      continue;
    }
    return i;
  }
  return -1;
}

export const noExpectEqualNull: Rule = {
  id: "no_expect_equal_null",
  description:
    "expect.to_equal / expect.to_not_equal with value = null is verbose; use a dedicated assertion",
  defaultEnabled: false,
  defaultSeverity: "error",
  lint(file: SourceFile, options: RuleOptions): Violation[] {
    const severity = options.severity ?? noExpectEqualNull.defaultSeverity;
    const violations: Violation[] = [];
    const lines = splitLines(file.text);
    const literals = literalLines(lines);
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (isCommentLine(line) || literals.has(i)) {
        continue;
      }
      const match = OPENER.exec(line);
      if (!match || match[2] === undefined || match[3] === undefined) {
        continue;
      }
      const kind = match[2] as "to_equal" | "to_not_equal";
      const arg = match[3];
      const tail = match[4] ?? "";
      const oneLine = tail.length > 0;
      if (oneLine) {
        if (!ONE_LINE_NULL.test(tail)) {
          continue;
        }
      } else {
        const valueIndex = nextCodeLine(lines, i + 1);
        if (valueIndex === -1 || !VALUE_NULL.test(lines[valueIndex])) {
          continue;
        }
        const closerIndex = nextCodeLine(lines, valueIndex + 1);
        if (closerIndex === -1 || !CLOSER.test(lines[closerIndex])) {
          continue;
        }
      }
      violations.push({
        ruleId: noExpectEqualNull.id,
        message: messageFor(kind, arg),
        severity,
        file: file.path,
        line: i + 1,
        column: line.indexOf("expect") + 1,
      });
    }
    return violations;
  },
};
