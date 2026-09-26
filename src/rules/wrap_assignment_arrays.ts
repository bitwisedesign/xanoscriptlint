import { isSuppressed, parseSuppressions } from "../suppress.js";
import { isBlankLine, isCommentLine } from "../util.js";
import { joinLineRecords, splitLineRecords } from "./line_records.js";
import type { LineRecord } from "./line_records.js";
import { literalLines } from "./numeric_declarations.js";
import {
  ASSIGNMENT_ARRAY_OPENER,
  parseStringArraySite,
  wrapThreshold,
  type StringArraySite,
} from "./string_arrays.js";
import type { Rule, RuleOptions, SourceFile, Violation } from "./types.js";

const OWNED_NAMES = new Set(["tags", "values"]);

interface AssignmentArraySite extends StringArraySite {
  owner: string;
}

function findAssignmentArrays(
  lines: string[],
  literals: Set<number>,
): AssignmentArraySite[] {
  const sites: AssignmentArraySite[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (literals.has(i) || isCommentLine(lines[i])) {
      continue;
    }
    const match = ASSIGNMENT_ARRAY_OPENER.exec(lines[i]);
    if (match === null || match[1] === undefined || match[2] === undefined) {
      continue;
    }
    const owner = match[2];
    if (OWNED_NAMES.has(owner)) {
      continue;
    }
    const openCol = match[0].length - 1;
    const site = parseStringArraySite(lines, i, match[1].length, openCol);
    if (site === null || site.kind !== "inline" || site.hasTab) {
      continue;
    }
    sites.push({ ...site, owner });
  }
  return sites;
}

function nextNeedsSeparator(records: LineRecord[], openLine: number): boolean {
  const next = records[openLine + 1];
  if (next === undefined || isBlankLine(next.content)) {
    return false;
  }
  return !next.content.trimStart().startsWith("}");
}

function expandInline(records: LineRecord[], site: AssignmentArraySite): boolean {
  const openRecord = records[site.openLine];
  if (openRecord === undefined) {
    return false;
  }
  const indent = " ".repeat(site.indent);
  const itemIndent = " ".repeat(site.indent + 2);
  const ending = openRecord.ending === "" ? "\n" : openRecord.ending;
  const inserted: LineRecord[] = site.tokens.map((token) => ({
    content: `${itemIndent}${JSON.stringify(token)}`,
    ending,
  }));
  inserted.push({ content: `${indent}]`, ending });
  if (nextNeedsSeparator(records, site.openLine)) {
    inserted.push({
      content: " ".repeat(Math.max(0, site.indent - 2)),
      ending,
    });
  }
  records[site.openLine].content = `${indent}${site.owner} = [`;
  records.splice(site.openLine + 1, 0, ...inserted);
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
  for (const site of findAssignmentArrays(lines, literals)) {
    if (site.compactLength < wrapAt) {
      continue;
    }
    violations.push({
      ruleId: wrapAssignmentArrays.id,
      message: `${site.owner} array of compact length ${site.compactLength} must be wrapped (threshold ${wrapAt})`,
      severity,
      file: file.path,
      line: site.openLine + 1,
      column: site.indent + 1,
    });
  }
  return violations;
}

export const wrapAssignmentArrays: Rule = {
  id: "wrap_assignment_arrays",
  description:
    "Assignment string arrays wrap when compact JSON length reaches 64 (Xano rewrites this on push)",
  defaultEnabled: false,
  defaultSeverity: "warning",
  numericOptions: ["wrap_at"],
  lint(file: SourceFile, options: RuleOptions): Violation[] {
    const severity = options.severity ?? wrapAssignmentArrays.defaultSeverity;
    const lines = splitLineRecords(file.text).map((record) => record.content);
    return violationsFor(file, lines, options, severity);
  },
  fix(file: SourceFile, options: RuleOptions): string | null {
    const suppressions = parseSuppressions(file.text);
    const rewriteLines = new Set(
      wrapAssignmentArrays
        .lint(file, options)
        .filter(
          (violation) => !isSuppressed(suppressions, violation.line, wrapAssignmentArrays.id),
        )
        .map((violation) => violation.line),
    );
    if (rewriteLines.size === 0) {
      return null;
    }
    const records = splitLineRecords(file.text);
    const lines = records.map((record) => record.content);
    const literals = literalLines(lines);
    const wrapAt = wrapThreshold(options.wrapAt);
    const sites = findAssignmentArrays(lines, literals)
      .filter((site) => rewriteLines.has(site.openLine + 1) && site.compactLength >= wrapAt)
      .sort((a, b) => b.openLine - a.openLine);
    let changed = false;
    for (const site of sites) {
      if (expandInline(records, site)) {
        changed = true;
      }
    }
    if (!changed) {
      return null;
    }
    return joinLineRecords(records);
  },
};
