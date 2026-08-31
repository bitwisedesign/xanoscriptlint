import type { Rule, RuleOptions, SourceFile, Violation } from "./types.js";
import { isCommentLine, splitLines } from "../util.js";

const VAR_RESPONSE = /var\s+\$response\b/;

export const noVarResponse: Rule = {
  id: "no_var_response",
  description: "Do not declare var $response; Xano rewrites it",
  defaultEnabled: false,
  defaultSeverity: "warning",
  lint(file: SourceFile, options: RuleOptions): Violation[] {
    const severity = options.severity ?? noVarResponse.defaultSeverity;
    const violations: Violation[] = [];
    const lines = splitLines(file.text);
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (isCommentLine(line)) {
        continue;
      }
      const match = VAR_RESPONSE.exec(line);
      if (match) {
        violations.push({
          ruleId: noVarResponse.id,
          message: "var $response is rewritten by Xano; use a different name",
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
