import { isSuppressed, parseSuppressions } from "../suppress.js";
import { isCommentLine } from "../util.js";
import { joinLineRecords, splitLineRecords } from "./line_records.js";
import { literalLines, unquote } from "./numeric_declarations.js";
import type { Rule, RuleOptions, SourceFile, Violation } from "./types.js";

const ENUM_QUOTED_DEFAULT =
  /^(\s*enum(?:\[\])?\??\s+[A-Za-z_][A-Za-z0-9_]*\??\s*=\s*)("[^"]*"|'[^']*')(\s*\{\s*)$/;
const BARE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const BARE_DENY = new Set(["true", "false", "null"]);

const MESSAGE = "quoted enum default must be unquoted; Xano strips quotes on push";

interface QuotedEnumDefault {
  column: number;
  bare: string;
  head: string;
  tail: string;
}

function matchQuotedEnumDefault(line: string): QuotedEnumDefault | null {
  const match = ENUM_QUOTED_DEFAULT.exec(line);
  if (match === null || match[1] === undefined || match[2] === undefined || match[3] === undefined) {
    return null;
  }
  const { text, quoted } = unquote(match[2]);
  if (!quoted || !BARE_NAME.test(text) || BARE_DENY.has(text)) {
    return null;
  }
  return {
    column: match[1].length + 1,
    bare: text,
    head: match[1],
    tail: match[3],
  };
}

function unquoteEnumDefault(line: string): string {
  const hit = matchQuotedEnumDefault(line);
  if (hit === null) {
    return line;
  }
  return `${hit.head}${hit.bare}${hit.tail}`;
}

export const unquoteEnumDefaults: Rule = {
  id: "unquote_enum_defaults",
  description: "Quoted enum defaults that are bare identifiers must be unquoted",
  defaultEnabled: false,
  defaultSeverity: "warning",
  lint(file: SourceFile, options: RuleOptions): Violation[] {
    const severity = options.severity ?? unquoteEnumDefaults.defaultSeverity;
    const lines = splitLineRecords(file.text).map((record) => record.content);
    const literals = literalLines(lines);
    const violations: Violation[] = [];
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (isCommentLine(line) || literals.has(i)) {
        continue;
      }
      const hit = matchQuotedEnumDefault(line);
      if (hit) {
        violations.push({
          ruleId: unquoteEnumDefaults.id,
          message: MESSAGE,
          severity,
          file: file.path,
          line: i + 1,
          column: hit.column,
        });
      }
    }
    return violations;
  },
  fix(file: SourceFile, options: RuleOptions): string | null {
    const suppressions = parseSuppressions(file.text);
    const rewriteLines = new Set(
      unquoteEnumDefaults
        .lint(file, options)
        .filter(
          (violation) => !isSuppressed(suppressions, violation.line, unquoteEnumDefaults.id),
        )
        .map((violation) => violation.line),
    );
    if (rewriteLines.size === 0) {
      return null;
    }
    const records = splitLineRecords(file.text);
    let changed = false;
    for (let i = 0; i < records.length; i += 1) {
      if (!rewriteLines.has(i + 1)) {
        continue;
      }
      const rewritten = unquoteEnumDefault(records[i].content);
      if (rewritten !== records[i].content) {
        records[i].content = rewritten;
        changed = true;
      }
    }
    if (!changed) {
      return null;
    }
    return joinLineRecords(records);
  },
};
