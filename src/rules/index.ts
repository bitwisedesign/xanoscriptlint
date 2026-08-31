import { emptyFunctionRun } from "./empty_function_run.js";
import { noTrailingNewline } from "./no_trailing_newline.js";
import { noVarResponse } from "./no_var_response.js";
import type { Rule } from "./types.js";

export const builtinRules: Rule[] = [
  emptyFunctionRun,
  noTrailingNewline,
  noVarResponse,
];

export function builtinRuleById(id: string): Rule | undefined {
  return builtinRules.find((rule) => rule.id === id);
}

export type { Rule, RuleOptions, Severity, SourceFile, Violation } from "./types.js";
