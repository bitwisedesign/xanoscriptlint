import { alignObjectColons } from "./align_object_colons.js";
import { collapseAssignmentValues } from "./collapse_assignment_values.js";
import { emptyFunctionRun } from "./empty_function_run.js";
import { fenceMultilineValues } from "./fence_multiline_values.js";
import { guidPlacement } from "./guid_placement.js";
import { noNullResponse } from "./no_null_response.js";
import { noTrailingComments } from "./no_trailing_comments.js";
import { noTrailingNewline } from "./no_trailing_newline.js";
import { noReservedVar } from "./no_reserved_var.js";
import { noZeroNumericDefault } from "./no_zero_numeric_default.js";
import { noZeroSetFilter } from "./no_zero_set_filter.js";
import { quoteNegativeNumericDefault } from "./quote_negative_numeric_default.js";
import { tagsPlacement } from "./tags_placement.js";
import { unquoteBareTestNames } from "./unquote_bare_test_names.js";
import { unquoteEnumDefaults } from "./unquote_enum_defaults.js";
import { wrapEnumValues } from "./wrap_enum_values.js";
import { wrapPipedValues } from "./wrap_piped_values.js";
import { wrapTagsValues } from "./wrap_tags_values.js";
import type { Rule } from "./types.js";

export const builtinRules: Rule[] = [
  noZeroSetFilter,
  collapseAssignmentValues,
  fenceMultilineValues,
  unquoteBareTestNames,
  alignObjectColons,
  wrapEnumValues,
  wrapPipedValues,
  wrapTagsValues,
  tagsPlacement,
  emptyFunctionRun,
  guidPlacement,
  noTrailingComments,
  noTrailingNewline,
  noReservedVar,
  noNullResponse,
  noZeroNumericDefault,
  quoteNegativeNumericDefault,
  unquoteEnumDefaults,
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
