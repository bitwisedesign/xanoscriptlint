import type { Rule, RuleOptions, SourceFile, Violation } from "./types.js";
import { isCommentLine, splitLines } from "../util.js";

const EMPTY_RUN = /function\.run\s+(?:"\s*"|'\s*')/;

export const emptyFunctionRun: Rule = {
  id: "empty_function_run",
  description: "function.run must not be called with an empty name",
  defaultEnabled: true,
  defaultSeverity: "error",
  lint(file: SourceFile, options: RuleOptions): Violation[] {
    const severity = options.severity ?? emptyFunctionRun.defaultSeverity;
    const violations: Violation[] = [];
    const lines = splitLines(file.text);
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (isCommentLine(line)) {
        continue;
      }
      const match = EMPTY_RUN.exec(line);
      if (match) {
        violations.push({
          ruleId: emptyFunctionRun.id,
          message: "function.run has an empty name",
          severity,
          file: file.path,
          line: i + 1,
          column: match.index + 1,
        });
      }
    }
    return violations;
  },
};
