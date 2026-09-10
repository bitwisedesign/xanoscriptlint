import { isBlankLine, isCommentLine, splitLines } from "../util.js";
import { literalLines } from "./numeric_declarations.js";
import type { Rule, RuleOptions, SourceFile, Violation } from "./types.js";

const GUID_LINE = /^\s*guid\s*=/;

const MSG_BODY = "trailing comment will be moved to the file header on push";
const MSG_AFTER_CLOSER =
  "comment after the closing } is invalid XanoScript and will be moved to the file header on push";

function indentColumn(line: string): number {
  return line.length - line.trimStart().length + 1;
}

function isCloserLine(line: string): boolean {
  return line.trim() === "}";
}

function isGuidLine(line: string): boolean {
  return GUID_LINE.test(line);
}

function violationsFor(
  file: SourceFile,
  lines: string[],
  severity: Violation["severity"],
): Violation[] {
  const literals = literalLines(lines);
  const found: Violation[] = [];
  let seenGuid = false;
  let seenCloser = false;

  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (isBlankLine(line) || literals.has(i)) {
      continue;
    }
    if (isCommentLine(line)) {
      found.push({
        ruleId: noTrailingComments.id,
        message: seenCloser ? MSG_BODY : MSG_AFTER_CLOSER,
        severity,
        file: file.path,
        line: i + 1,
        column: indentColumn(line),
      });
      continue;
    }
    if (!seenGuid && isGuidLine(line)) {
      seenGuid = true;
      continue;
    }
    if (!seenCloser && isCloserLine(line)) {
      seenCloser = true;
      continue;
    }
    break;
  }

  found.reverse();
  return found;
}

export const noTrailingComments: Rule = {
  id: "no_trailing_comments",
  description: "Comments above guid or after the file's closing } are moved to the file header on push",
  defaultEnabled: true,
  defaultSeverity: "warning",
  lint(file: SourceFile, options: RuleOptions): Violation[] {
    const severity = options.severity ?? noTrailingComments.defaultSeverity;
    return violationsFor(file, splitLines(file.text), severity);
  },
};
