import { readFileSync } from "node:fs";
import { runCustomRules } from "./customRules.js";
import type { ResolvedConfig } from "./config.js";
import { builtinRules } from "./rules/index.js";
import type { SourceFile, Violation } from "./rules/types.js";
import { isSuppressed, parseSuppressions } from "./suppress.js";

export function readSourceFile(filePath: string): SourceFile {
  return { path: filePath, text: readFileSync(filePath, "utf8") };
}

export function lintFiles(
  files: SourceFile[],
  config: ResolvedConfig,
): Violation[] {
  const violations: Violation[] = [];
  for (const file of files) {
    violations.push(...lintFile(file, config));
  }
  return violations;
}

export function lintFile(file: SourceFile, config: ResolvedConfig): Violation[] {
  const found: Violation[] = [];
  for (const rule of builtinRules) {
    if (!config.enabledRuleIds.has(rule.id)) {
      continue;
    }
    const options = config.ruleOptions.get(rule.id) ?? {};
    found.push(...rule.lint(file, options));
  }
  found.push(...runCustomRules(file, config.customRules));
  const suppressions = parseSuppressions(file.text);
  return found.filter((violation) => !isSuppressed(suppressions, violation.line, violation.ruleId));
}

export type { SourceFile, Violation } from "./rules/types.js";
export { builtinRules } from "./rules/index.js";
export { loadConfig, ConfigError } from "./config.js";
