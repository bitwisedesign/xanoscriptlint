import type { Rule, RuleOptions, SourceFile, Violation } from "./types.js";
import { isCommentLine, splitLines } from "../util.js";

const RESERVED = [
  "auth",
  "db",
  "env",
  "error",
  "input",
  "output",
  "response",
  "this",
  "toolset",
  "var",
];
const NAMES = RESERVED.join("|");
const DECLARATION = new RegExp(`^(\\s*var(?:\\.update)?\\s+)\\$(${NAMES})\\b`);
const BINDING = new RegExp(`\\bas\\s+(\\$(?:${NAMES}))\\b\\s*\\{?\\s*$`);

export const noReservedVar: Rule = {
  id: "no_reserved_var",
  description: "Do not declare reserved variable names",
  defaultEnabled: false,
  defaultSeverity: "warning",
  lint(file: SourceFile, options: RuleOptions): Violation[] {
    const severity = options.severity ?? noReservedVar.defaultSeverity;
    const violations: Violation[] = [];
    const lines = splitLines(file.text);
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (isCommentLine(line)) {
        continue;
      }
      const declared = DECLARATION.exec(line);
      if (declared) {
        violations.push({
          ruleId: noReservedVar.id,
          message: `$${declared[2]} is a reserved variable name; use a different name`,
          severity,
          file: file.path,
          line: i + 1,
          column: declared[1].length + 1,
        });
        continue;
      }
      const bound = BINDING.exec(line);
      if (bound) {
        violations.push({
          ruleId: noReservedVar.id,
          message: `${bound[1]} is a reserved variable name; use a different name`,
          severity,
          file: file.path,
          line: i + 1,
          column: bound.index + bound[0].indexOf(bound[1]) + 1,
        });
      }
    }
    return violations;
  },
};
