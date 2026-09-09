import { alignObjectColons } from "./align_object_colons.js";
import { emptyFunctionRun } from "./empty_function_run.js";
import { fenceMultilineValues } from "./fence_multiline_values.js";
import { noNullResponse } from "./no_null_response.js";
import { noTrailingNewline } from "./no_trailing_newline.js";
import { noVarResponse } from "./no_var_response.js";
import type { Rule } from "./types.js";

export const builtinRules: Rule[] = [
  alignObjectColons,
  fenceMultilineValues,
  emptyFunctionRun,
  noTrailingNewline,
  noVarResponse,
  noNullResponse,
];

export function builtinRuleById(id: string): Rule | undefined {
  return builtinRules.find((rule) => rule.id === id);
}

export type {
  Correction,
  Rule,
  RuleOptions,
  Severity,
  SourceFile,
  Violation,
} from "./types.js";
