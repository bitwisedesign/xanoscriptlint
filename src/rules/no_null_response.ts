import type { Rule, RuleOptions, SourceFile, Violation } from "./types.js";
import { isCommentLine, splitLines } from "../util.js";

const RESPONSE_NULL = /(?<=^\s*)response(\s*=\s*)null\b/;

function rewriteLine(line: string): string {
  return line.replace(RESPONSE_NULL, "response$1{}");
}

export const noNullResponse: Rule = {
  id: "no_null_response",
  description: "Do not assign response = null; use an empty object",
  defaultEnabled: false,
  defaultSeverity: "warning",
  lint(file: SourceFile, options: RuleOptions): Violation[] {
    const severity = options.severity ?? noNullResponse.defaultSeverity;
    const violations: Violation[] = [];
    const lines = splitLines(file.text);
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (isCommentLine(line)) {
        continue;
      }
      const match = RESPONSE_NULL.exec(line);
      if (match) {
        violations.push({
          ruleId: noNullResponse.id,
          message: "response = null is not allowed; use response = {}",
          severity,
          file: file.path,
          line: i + 1,
          column: match.index + 1,
        });
      }
    }
    return violations;
  },
  fix(file: SourceFile): string | null {
    const lines = splitLines(file.text);
    let changed = false;
    const next = lines.map((line) => {
      if (isCommentLine(line)) {
        return line;
      }
      const rewritten = rewriteLine(line);
      if (rewritten !== line) {
        changed = true;
      }
      return rewritten;
    });
    if (!changed) {
      return null;
    }
    const nl = file.text.includes("\r\n") ? "\r\n" : "\n";
    return next.join(nl);
  },
};
