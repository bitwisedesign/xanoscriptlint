import { readFileSync } from "node:fs";
import { runCustomRules } from "./customRules.js";
import type { ResolvedConfig } from "./config.js";
import { builtinRules } from "./rules/index.js";
import type { Correction, FixResult, SourceFile, Violation } from "./rules/types.js";
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
  const customIds = new Set(config.customRules.map((custom) => custom.id));
  const suppressions = parseSuppressions(file.text, customIds);
  return found.filter((violation) => !isSuppressed(suppressions, violation.line, violation.ruleId));
}

export function fixFile(
  file: SourceFile,
  config: ResolvedConfig,
): { text: string; changed: boolean; corrections: Correction[] } {
  let current: SourceFile = file;
  const corrections: Correction[] = [];
  const customIds = new Set(config.customRules.map((custom) => custom.id));
  for (const rule of builtinRules) {
    if (!config.enabledRuleIds.has(rule.id) || !rule.fix) {
      continue;
    }
    const options = config.ruleOptions.get(rule.id) ?? {};
    const suppressions = parseSuppressions(current.text, customIds);
    const violations = rule
      .lint(current, options)
      .filter((violation) => !isSuppressed(suppressions, violation.line, violation.ruleId));
    if (violations.length === 0) {
      continue;
    }
    const next = normalizeFix(rule.fix(current, options));
    if (next === null || next.text === current.text) {
      continue;
    }
    for (const violation of violations) {
      if (next.appliedLines !== undefined && !next.appliedLines.has(violation.line)) {
        continue;
      }
      corrections.push({
        ruleId: rule.id,
        file: file.path,
        line: violation.line,
      });
    }
    current = { path: file.path, text: next.text };
  }
  return {
    text: current.text,
    changed: current.text !== file.text,
    corrections,
  };
}

function normalizeFix(
  next: string | FixResult | null,
): { text: string; appliedLines?: ReadonlySet<number> } | null {
  if (next === null) {
    return null;
  }
  if (typeof next === "string") {
    return { text: next };
  }
  return {
    text: next.text,
    appliedLines:
      next.appliedLines === undefined ? undefined : new Set(next.appliedLines),
  };
}

export type { Correction, SourceFile, Violation } from "./rules/types.js";
export { builtinRules } from "./rules/index.js";
export { loadConfig, ConfigError } from "./config.js";
