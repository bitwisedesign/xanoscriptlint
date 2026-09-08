import path from "node:path";
import type { CustomRuleConfig } from "./config.js";
import type { SourceFile, Violation } from "./rules/types.js";
import { isCommentLine, splitLines } from "./util.js";

export function runCustomRules(
  file: SourceFile,
  rules: CustomRuleConfig[],
): Violation[] {
  const violations: Violation[] = [];
  const posixPath = file.path.split(path.sep).join("/");
  for (const rule of rules) {
    if (!pathAllowed(posixPath, rule)) {
      continue;
    }
    const lines = splitLines(file.text);
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (isCommentLine(line)) {
        continue;
      }
      const match = rule.pattern.exec(line);
      if (match) {
        violations.push({
          ruleId: rule.id,
          message: rule.message,
          severity: rule.severity,
          file: file.path,
          line: i + 1,
          column: match.index + 1,
        });
      }
    }
  }
  return violations;
}

function pathAllowed(posixPath: string, rule: CustomRuleConfig): boolean {
  if (rule.excluded?.some((pattern) => matchesPathRegex(posixPath, pattern))) {
    return false;
  }
  if (rule.included && rule.included.length > 0) {
    return rule.included.some((pattern) => matchesPathRegex(posixPath, pattern));
  }
  return true;
}

function matchesPathRegex(posixPath: string, pattern: string): boolean {
  return new RegExp(pattern).test(posixPath);
}
