import type { Rule, RuleOptions, SourceFile, Violation } from "./types.js";

export const noTrailingNewline: Rule = {
  id: "no_trailing_newline",
  description: "XanoScript files must end with } and no trailing newline",
  defaultEnabled: true,
  defaultSeverity: "error",
  lint(file: SourceFile, options: RuleOptions): Violation[] {
    const severity = options.severity ?? noTrailingNewline.defaultSeverity;
    if (file.text.endsWith("}")) {
      return [];
    }
    const lines = file.text.split(/\r?\n/);
    return [
      {
        ruleId: noTrailingNewline.id,
        message: "file must end with } and no trailing newline",
        severity,
        file: file.path,
        line: Math.max(lines.length, 1),
        column: 1,
      },
    ];
  },
};
