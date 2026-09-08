import { readFileSync } from "node:fs";
import { runCustomRules } from "./customRules.js";
import type { ResolvedConfig } from "./config.js";
import { builtinRules } from "./rules/index.js";
import type { Correction, SourceFile, Violation } from "./rules/types.js";
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

export function fixFile(
  file: SourceFile,
  config: ResolvedConfig,
): { text: string; changed: boolean; corrections: Correction[] } {
  let current: SourceFile = file;
  const corrections: Correction[] = [];
  for (const rule of builtinRules) {
    if (!config.enabledRuleIds.has(rule.id) || !rule.fix) {
      continue;
    }
    const options = config.ruleOptions.get(rule.id) ?? {};
    const suppressions = parseSuppressions(current.text);
    const violations = rule
      .lint(current, options)
      .filter((violation) => !isSuppressed(suppressions, violation.line, violation.ruleId));
    if (violations.length === 0) {
      continue;
    }
    const next = rule.fix(current, options);
    if (next === null || next === current.text) {
      continue;
    }
    for (const violation of violations) {
      corrections.push({
        ruleId: rule.id,
        file: file.path,
        line: violation.line,
      });
    }
    current = { path: file.path, text: next };
  }
  return {
    text: current.text,
    changed: current.text !== file.text,
    corrections,
  };
}

export type { Correction, SourceFile, Violation } from "./rules/types.js";
export { builtinRules } from "./rules/index.js";
export { loadConfig, ConfigError } from "./config.js";
