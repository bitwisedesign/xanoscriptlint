import { isSuppressed, parseSuppressions } from "../suppress.js";
import { isCommentLine } from "../util.js";
import { joinLineRecords, splitLineRecords } from "./line_records.js";
import type { LineRecord } from "./line_records.js";
import { literalLines } from "./numeric_declarations.js";
import {
  TAGS_OPENER,
  inlineArrayLine,
  parseStringArraySite,
  wrapThreshold,
  type StringArraySite,
} from "./string_arrays.js";
import type { Rule, RuleOptions, SourceFile, Violation } from "./types.js";

function findTagsValues(lines: string[], literals: Set<number>): StringArraySite[] {
  const sites: StringArraySite[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (literals.has(i) || isCommentLine(lines[i])) {
      continue;
    }
    const match = TAGS_OPENER.exec(lines[i]);
    if (match === null || match[1] === undefined) {
      continue;
    }
    const openCol = match[0].length - 1;
    const site = parseStringArraySite(lines, i, match[1].length, openCol);
    if (site !== null) {
      sites.push(site);
    }
  }
  return sites;
}

export function tagsOpenLines(lines: string[]): Set<number> {
  return new Set(findTagsValues(lines, literalLines(lines)).map((site) => site.openLine));
}

function expandInline(records: LineRecord[], site: StringArraySite): boolean {
  if (site.hasTab) {
    return false;
  }
  const openRecord = records[site.openLine];
  const indent = " ".repeat(site.indent);
  const itemIndent = " ".repeat(site.indent + 2);
  const ending = openRecord.ending === "" ? "\n" : openRecord.ending;
  const inserted: LineRecord[] = site.tokens.map((token) => ({
    content: `${itemIndent}${JSON.stringify(token)}`,
    ending,
  }));
  inserted.push({ content: `${indent}]`, ending });
  records[site.openLine].content = `${indent}tags = [`;
  records.splice(site.openLine + 1, 0, ...inserted);
  return true;
}

function collapseWrapped(records: LineRecord[], site: StringArraySite): boolean {
  if (site.hasTab) {
    return false;
  }
  const indent = " ".repeat(site.indent);
  records[site.openLine].content = inlineArrayLine(indent, "tags", site.tokens);
  records.splice(site.openLine + 1, site.bracketLine - site.openLine);
  return true;
}

function violationsFor(
  file: SourceFile,
  lines: string[],
  options: RuleOptions,
  severity: Violation["severity"],
): Violation[] {
  const wrapAt = wrapThreshold(options.wrapAt);
  const literals = literalLines(lines);
  const violations: Violation[] = [];
  for (const site of findTagsValues(lines, literals)) {
    if (site.kind === "inline" && site.compactLength >= wrapAt) {
      violations.push({
        ruleId: wrapTagsValues.id,
        message: `tags of compact length ${site.compactLength} must be wrapped (threshold ${wrapAt})`,
        severity,
        file: file.path,
        line: site.openLine + 1,
        column: site.indent + 1,
      });
    } else if (site.kind === "wrapped" && site.compactLength < wrapAt) {
      violations.push({
        ruleId: wrapTagsValues.id,
        message: `tags of compact length ${site.compactLength} must be inline (threshold ${wrapAt})`,
        severity,
        file: file.path,
        line: site.openLine + 1,
        column: site.indent + 1,
      });
    }
  }
  return violations;
}

export const wrapTagsValues: Rule = {
  id: "wrap_tags_values",
  description:
    "Declaration tags arrays wrap when compact JSON length reaches 64 (Xano rewrites this on push)",
  defaultEnabled: false,
  defaultSeverity: "warning",
  numericOptions: ["wrap_at"],
  lint(file: SourceFile, options: RuleOptions): Violation[] {
    const severity = options.severity ?? wrapTagsValues.defaultSeverity;
    const lines = splitLineRecords(file.text).map((record) => record.content);
    return violationsFor(file, lines, options, severity);
  },
  fix(file: SourceFile, options: RuleOptions): string | null {
    const suppressions = parseSuppressions(file.text);
    const rewriteLines = new Set(
      wrapTagsValues
        .lint(file, options)
        .filter((violation) => !isSuppressed(suppressions, violation.line, wrapTagsValues.id))
        .map((violation) => violation.line),
    );
    if (rewriteLines.size === 0) {
      return null;
    }
    const records = splitLineRecords(file.text);
    const lines = records.map((record) => record.content);
    const literals = literalLines(lines);
    const wrapAt = wrapThreshold(options.wrapAt);
    const sites = findTagsValues(lines, literals)
      .filter((site) => rewriteLines.has(site.openLine + 1))
      .sort((a, b) => b.openLine - a.openLine);
    let changed = false;
    for (const site of sites) {
      if (site.kind === "inline" && site.compactLength >= wrapAt) {
        if (expandInline(records, site)) {
          changed = true;
        }
      } else if (site.kind === "wrapped" && site.compactLength < wrapAt) {
        if (collapseWrapped(records, site)) {
          changed = true;
        }
      }
    }
    if (!changed) {
      return null;
    }
    return joinLineRecords(records);
  },
};
