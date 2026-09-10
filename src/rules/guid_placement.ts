import { isSuppressed, parseSuppressions } from "../suppress.js";
import { isBlankLine, isCommentLine, splitLines } from "../util.js";
import { joinLineRecords, splitLineRecords } from "./line_records.js";
import { literalLines } from "./numeric_declarations.js";
import type { Rule, RuleOptions, SourceFile, Violation } from "./types.js";

const GUID_LINE = /^\s*guid\s*=/;

const MSG_NEED_BLANK = "guid must have a blank line above it when it follows a block closer";
const MSG_EXACTLY_ONE = "guid must have exactly one blank line above it";
const MSG_NO_BLANK = "guid must not have a blank line above it when it follows a single-line value";

interface GuidSite {
  lineIndex: number;
  blankCount: number;
  firstBlankIndex: number;
  expectBlank: boolean;
  column: number;
}

function isCloserLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed === "}" || trimmed === "]";
}

function indentColumn(line: string): number {
  return line.length - line.trimStart().length + 1;
}

function findGuidSites(lines: string[]): GuidSite[] {
  const literals = literalLines(lines);
  const sites: GuidSite[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (literals.has(i) || !GUID_LINE.test(lines[i])) {
      continue;
    }
    let j = i - 1;
    let blankCount = 0;
    while (j >= 0 && isBlankLine(lines[j])) {
      blankCount += 1;
      j -= 1;
    }
    if (j < 0 || isCommentLine(lines[j])) {
      continue;
    }
    sites.push({
      lineIndex: i,
      blankCount,
      firstBlankIndex: blankCount === 0 ? i : j + 1,
      expectBlank: isCloserLine(lines[j]),
      column: indentColumn(lines[i]),
    });
  }
  return sites;
}

function messageFor(site: GuidSite): string | null {
  if (site.expectBlank) {
    if (site.blankCount === 0) {
      return MSG_NEED_BLANK;
    }
    if (site.blankCount > 1) {
      return MSG_EXACTLY_ONE;
    }
    return null;
  }
  if (site.blankCount > 0) {
    return MSG_NO_BLANK;
  }
  return null;
}

function violationsFor(
  file: SourceFile,
  lines: string[],
  severity: Violation["severity"],
): Violation[] {
  const violations: Violation[] = [];
  for (const site of findGuidSites(lines)) {
    const message = messageFor(site);
    if (message === null) {
      continue;
    }
    violations.push({
      ruleId: guidPlacement.id,
      message,
      severity,
      file: file.path,
      line: site.lineIndex + 1,
      column: site.column,
    });
  }
  return violations;
}

function applyFix(records: ReturnType<typeof splitLineRecords>, site: GuidSite): boolean {
  if (site.expectBlank) {
    if (site.blankCount === 0) {
      const prev = records[site.lineIndex - 1];
      const ending = prev !== undefined && prev.ending !== "" ? prev.ending : "\n";
      records.splice(site.lineIndex, 0, { content: "", ending });
      return true;
    }
    if (site.blankCount > 1) {
      records.splice(site.firstBlankIndex + 1, site.blankCount - 1);
      return true;
    }
    return false;
  }
  if (site.blankCount > 0) {
    records.splice(site.firstBlankIndex, site.blankCount);
    return true;
  }
  return false;
}

export const guidPlacement: Rule = {
  id: "guid_placement",
  description: "guid must be separated by a blank line only when it follows a block closer",
  defaultEnabled: true,
  defaultSeverity: "warning",
  lint(file: SourceFile, options: RuleOptions): Violation[] {
    const severity = options.severity ?? guidPlacement.defaultSeverity;
    return violationsFor(file, splitLines(file.text), severity);
  },
  fix(file: SourceFile, options: RuleOptions): string | null {
    const suppressions = parseSuppressions(file.text);
    const rewriteLines = new Set(
      guidPlacement
        .lint(file, options)
        .filter((violation) => !isSuppressed(suppressions, violation.line, guidPlacement.id))
        .map((violation) => violation.line),
    );
    if (rewriteLines.size === 0) {
      return null;
    }
    const records = splitLineRecords(file.text);
    const sites = findGuidSites(records.map((record) => record.content))
      .filter((site) => rewriteLines.has(site.lineIndex + 1))
      .sort((a, b) => b.lineIndex - a.lineIndex);
    let changed = false;
    for (const site of sites) {
      if (applyFix(records, site)) {
        changed = true;
      }
    }
    if (!changed) {
      return null;
    }
    return joinLineRecords(records);
  },
};
