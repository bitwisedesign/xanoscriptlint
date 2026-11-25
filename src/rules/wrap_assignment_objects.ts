import { isSuppressed, parseSuppressions } from "../suppress.js";
import { isBlankLine } from "../util.js";
import {
  assignmentSiteEligible,
  findAssignmentSites,
  renderInline,
  usesExpressionJsonWidth,
  type AssignmentSite,
} from "./collapse_assignment_values.js";
import { joinLineRecords, splitLineRecords } from "./line_records.js";
import type { LineRecord } from "./line_records.js";
import type { Rule, RuleOptions, SourceFile, Violation } from "./types.js";
import { DEFAULT_WRAP_AT } from "./wrap_enum_values.js";
import {
  enclosingStatement,
  expressionObjectWidth,
  hasZeroFollowedByKey,
} from "./xano_json_width.js";

function wrapThreshold(options: RuleOptions): number {
  return options.wrapAt ?? DEFAULT_WRAP_AT;
}

function leadingSpaces(line: string): number {
  const match = /^ */.exec(line);
  return match?.[0].length ?? 0;
}

function zeroOwned(site: AssignmentSite, lines: string[]): boolean {
  if (site.owner !== "value" || site.node.kind !== "object" || !hasZeroFollowedByKey(site.node)) {
    return false;
  }
  const context = enclosingStatement(lines, site.openLine, site.openCol);
  return context.startsWith("var ") || context.startsWith("var.update");
}

function nextNeedsSeparator(records: LineRecord[], closeLine: number): boolean {
  const next = records[closeLine + 1];
  if (next === undefined || isBlankLine(next.content)) {
    return false;
  }
  return !next.content.trimStart().startsWith("}");
}

function wrapObject(records: LineRecord[], site: AssignmentSite): boolean {
  if (site.node.kind !== "object") {
    return false;
  }
  const openRecord = records[site.openLine];
  const closeRecord = records[site.closeLine];
  if (openRecord === undefined || closeRecord === undefined) {
    return false;
  }
  const indent = leadingSpaces(openRecord.content);
  const prefix = openRecord.content.slice(0, site.openCol);
  const inner = indent + 2;
  const ending = openRecord.ending === "" ? "\n" : openRecord.ending;
  const maxKey = Math.max(0, ...site.node.entries.map((entry) => entry.key.length));
  const inserted: LineRecord[] = site.node.entries.map((entry) => ({
    content: `${" ".repeat(inner)}${entry.key}${" ".repeat(maxKey - entry.key.length)}: ${renderInline(entry.value)}`,
    ending,
  }));
  inserted.push({
    content: `${" ".repeat(indent)}}${site.trailing}`,
    ending: closeRecord.ending,
  });
  if (nextNeedsSeparator(records, site.closeLine)) {
    inserted.push({
      content: " ".repeat(Math.max(0, indent - 2)),
      ending,
    });
  }
  records[site.openLine].content = `${prefix}{`;
  records[site.openLine].ending = ending;
  records.splice(site.openLine + 1, site.closeLine - site.openLine, ...inserted);
  return true;
}

function violationsFor(
  file: SourceFile,
  lines: string[],
  options: RuleOptions,
  severity: Violation["severity"],
): Violation[] {
  const wrapAt = wrapThreshold(options);
  const violations: Violation[] = [];
  for (const site of findAssignmentSites(lines)) {
    if (
      !assignmentSiteEligible(site) ||
      site.kind !== "inline" ||
      !usesExpressionJsonWidth(site, lines) ||
      zeroOwned(site, lines)
    ) {
      continue;
    }
    const width = expressionObjectWidth(site.node, "lower");
    if (width < wrapAt) {
      continue;
    }
    violations.push({
      ruleId: wrapAssignmentObjects.id,
      message: `${site.owner} object of JSON width ${width} must be wrapped (threshold ${wrapAt})`,
      severity,
      file: file.path,
      line: site.openLine + 1,
      column: site.openCol + 1,
    });
  }
  return violations;
}

export const wrapAssignmentObjects: Rule = {
  id: "wrap_assignment_objects",
  description:
    "Assignment objects wrap when JSON width reaches 64 (Xano rewrites this on push)",
  defaultEnabled: false,
  defaultSeverity: "warning",
  numericOptions: ["wrap_at"],
  lint(file: SourceFile, options: RuleOptions): Violation[] {
    const severity = options.severity ?? wrapAssignmentObjects.defaultSeverity;
    const lines = splitLineRecords(file.text).map((record) => record.content);
    return violationsFor(file, lines, options, severity);
  },
  fix(file: SourceFile, options: RuleOptions): string | null {
    const suppressions = parseSuppressions(file.text);
    const rewriteLines = new Set(
      wrapAssignmentObjects
        .lint(file, options)
        .filter(
          (violation) => !isSuppressed(suppressions, violation.line, wrapAssignmentObjects.id),
        )
        .map((violation) => violation.line),
    );
    if (rewriteLines.size === 0) {
      return null;
    }
    const records = splitLineRecords(file.text);
    const lines = records.map((record) => record.content);
    const sites = findAssignmentSites(lines)
      .filter((site) => rewriteLines.has(site.openLine + 1))
      .sort((a, b) => b.openLine - a.openLine);
    let changed = false;
    for (const site of sites) {
      if (wrapObject(records, site)) {
        changed = true;
      }
    }
    if (!changed) {
      return null;
    }
    return joinLineRecords(records);
  },
};
