import { isBlankLine, isCommentLine, splitLines } from "../util.js";
import { literalLines } from "./numeric_declarations.js";
import type { Rule, RuleOptions, SourceFile, Violation } from "./types.js";

const BARE = /^\s*expect\.to_throw\s*$/;
const ONE_LINE = /^\s*expect\.to_throw\s*\{(.*)\}\s*$/;
const OPENER = /^\s*expect\.to_throw\s*\{\s*$/;
const CLOSER = /^\s*\}\s*$/;
const EXCEPTION = /^\s*exception\s*=\s*(.*?)\s*$/;

const EMPTY_MESSAGE =
  'expect.to_throw with exception = "" passes on any error; set exception to the throw name or the precondition error string';
const BARE_MESSAGE =
  "expect.to_throw without exception passes on any error; set exception to the throw name or the precondition error string";

type ExceptionKind = "empty" | "missing" | "ok";

function exceptionKind(value: string): "empty" | "ok" {
  return value === '""' || value.length === 0 ? "empty" : "ok";
}

function kindFromBody(body: string): ExceptionKind {
  const trimmed = body.trim();
  if (trimmed.length === 0) {
    return "missing";
  }
  const match = EXCEPTION.exec(trimmed);
  if (match === null || match[1] === undefined) {
    return "missing";
  }
  return exceptionKind(match[1]);
}

function kindFromBlock(lines: string[], start: number): ExceptionKind | undefined {
  let kind: "empty" | "ok" | undefined;
  for (let i = start; i < lines.length; i += 1) {
    const line = lines[i];
    if (isBlankLine(line) || isCommentLine(line)) {
      continue;
    }
    if (CLOSER.test(line)) {
      return kind ?? "missing";
    }
    const match = EXCEPTION.exec(line);
    if (match !== null && match[1] !== undefined && kind === undefined) {
      kind = exceptionKind(match[1]);
    }
  }
  return undefined;
}

function messageFor(kind: ExceptionKind): string | undefined {
  if (kind === "empty") {
    return EMPTY_MESSAGE;
  }
  if (kind === "missing") {
    return BARE_MESSAGE;
  }
  return undefined;
}

export const noEmptyExpectThrow: Rule = {
  id: "no_empty_expect_throw",
  description:
    "expect.to_throw with exception = \"\" or with no exception passes on any error",
  defaultEnabled: false,
  defaultSeverity: "error",
  lint(file: SourceFile, options: RuleOptions): Violation[] {
    const severity = options.severity ?? noEmptyExpectThrow.defaultSeverity;
    const violations: Violation[] = [];
    const lines = splitLines(file.text);
    const literals = literalLines(lines);
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (isCommentLine(line) || literals.has(i)) {
        continue;
      }
      let kind: ExceptionKind | undefined;
      if (BARE.test(line)) {
        kind = "missing";
      } else {
        const oneLine = ONE_LINE.exec(line);
        if (oneLine !== null && oneLine[1] !== undefined) {
          kind = kindFromBody(oneLine[1]);
        } else if (OPENER.test(line)) {
          kind = kindFromBlock(lines, i + 1);
        }
      }
      const message = kind === undefined ? undefined : messageFor(kind);
      if (message === undefined) {
        continue;
      }
      violations.push({
        ruleId: noEmptyExpectThrow.id,
        message,
        severity,
        file: file.path,
        line: i + 1,
        column: line.indexOf("expect") + 1,
      });
    }
    return violations;
  },
};
