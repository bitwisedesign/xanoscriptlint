import { isSuppressed, parseSuppressions } from "../suppress.js";
import { isBlankLine, isCommentLine } from "../util.js";
import { lineStartDepths } from "./block_depths.js";
import { joinLineRecords, splitLineRecords } from "./line_records.js";
import type { LineRecord } from "./line_records.js";
import { literalLines } from "./numeric_declarations.js";
import { skipQuoted } from "./pipe_chains.js";
import type { Rule, RuleOptions, SourceFile, Violation } from "./types.js";

const DB_OPENER = /^\s*db\.(get|query)\b/;
const MSG_AFTER_FIELD_VALUE = "lock must immediately follow `field_value`";
const MSG_FIRST_IN_QUERY = "lock must be the first member of `db.query`";

interface Member {
  line: number;
  kind: string;
}

interface LockSite {
  kind: "get" | "query";
  lockLine: number;
  commentStart: number;
  insertAt: number;
  column: number;
}

function indentColumn(line: string): number {
  return line.length - line.trimStart().length + 1;
}

function memberKind(line: string): string | null {
  const trimmed = line.trim();
  if (trimmed === "" || trimmed === "}" || trimmed === "]") {
    return null;
  }
  if (trimmed.startsWith("//") || trimmed.startsWith('"') || trimmed.startsWith("'")) {
    return null;
  }
  const match = /^([A-Za-z_][A-Za-z0-9_]*)\b/.exec(trimmed);
  return match?.[1] ?? null;
}

function findCloseLine(
  depths: ReturnType<typeof lineStartDepths>,
  openLine: number,
): number | null {
  const openerStart = depths.starts[openLine];
  for (let i = openLine + 1; i < depths.after.length; i += 1) {
    if (depths.after[i] === openerStart && depths.starts[i] > openerStart) {
      return i;
    }
  }
  return null;
}

function memberEndLine(
  lines: string[],
  members: Member[],
  index: number,
  closeLine: number,
): number {
  const start = members[index].line;
  const next = members[index + 1]?.line ?? closeLine;
  let end = next - 1;
  while (end > start && (isBlankLine(lines[end]) || isCommentLine(lines[end]))) {
    end -= 1;
  }
  return end;
}

const STATIONARY_DIRECTIVE =
  /^\/\/\s*xanoscriptlint:(?:disable:previous|(?:disable|enable)(?:\s|$))/;

function isStationaryDirective(line: string): boolean {
  return STATIONARY_DIRECTIVE.test(line.trim());
}

function attachedCommentStart(lines: string[], lockLine: number, openLine: number): number {
  let start = lockLine;
  while (start - 1 > openLine && isCommentLine(lines[start - 1])) {
    if (isStationaryDirective(lines[start - 1])) {
      break;
    }
    start -= 1;
  }
  return start;
}

function arrayDepthAfter(line: string, startDepth: number): number {
  let depth = startDepth;
  let col = 0;
  while (col < line.length) {
    const ch = line[col];
    if (ch === "/" && line[col + 1] === "/") {
      break;
    }
    if (ch === '"' || ch === "'") {
      const end = skipQuoted(line, col, ch);
      if (end === null) {
        break;
      }
      col = end;
      continue;
    }
    if (ch === "[") {
      depth += 1;
    } else if (ch === "]") {
      depth = Math.max(0, depth - 1);
    }
    col += 1;
  }
  return depth;
}

function collectMembers(
  lines: string[],
  literals: Set<number>,
  depths: ReturnType<typeof lineStartDepths>,
  openLine: number,
  closeLine: number,
  bodyDepth: number,
): Member[] {
  const members: Member[] = [];
  let arrayDepth = 0;
  for (let line = openLine + 1; line < closeLine; line += 1) {
    const inArray = arrayDepth > 0;
    if (!literals.has(line) && !isCommentLine(lines[line]) && !isBlankLine(lines[line])) {
      if (!inArray && depths.starts[line] === bodyDepth) {
        const kind = memberKind(lines[line]);
        if (kind !== null) {
          members.push({ line, kind });
        }
      }
    }
    if (!literals.has(line) && !isCommentLine(lines[line])) {
      arrayDepth = arrayDepthAfter(lines[line], arrayDepth);
    }
  }
  return members;
}

function findLockSites(lines: string[]): LockSite[] {
  const literals = literalLines(lines);
  const depths = lineStartDepths(lines, literals);
  const sites: LockSite[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (literals.has(i) || isCommentLine(lines[i])) {
      continue;
    }
    const opener = DB_OPENER.exec(lines[i]);
    if (opener === null || opener[1] === undefined) {
      continue;
    }
    const kind = opener[1] as "get" | "query";
    if (depths.after[i] <= depths.starts[i]) {
      continue;
    }
    const closeLine = findCloseLine(depths, i);
    if (closeLine === null) {
      continue;
    }
    const members = collectMembers(lines, literals, depths, i, closeLine, depths.after[i]);
    const lockMembers = members.filter((member) => member.kind === "lock");
    if (lockMembers.length !== 1) {
      continue;
    }
    const lockMember = lockMembers[0];
    const lockIndex = members.indexOf(lockMember);
    if (lockIndex < 0) {
      continue;
    }
    if (memberEndLine(lines, members, lockIndex, closeLine) !== lockMember.line) {
      continue;
    }
    const fieldValueIndex = members.findIndex((member) => member.kind === "field_value");
    if (kind === "get" && fieldValueIndex < 0) {
      continue;
    }
    const misplaced =
      kind === "query" ? lockIndex !== 0 : members[lockIndex - 1]?.kind !== "field_value";
    if (!misplaced) {
      continue;
    }
    const insertAt =
      kind === "query"
        ? i + 1
        : memberEndLine(lines, members, fieldValueIndex, closeLine) + 1;
    sites.push({
      kind,
      lockLine: lockMember.line,
      commentStart: attachedCommentStart(lines, lockMember.line, i),
      insertAt,
      column: indentColumn(lines[lockMember.line]),
    });
  }
  return sites;
}

function messageFor(site: LockSite): string {
  return site.kind === "query" ? MSG_FIRST_IN_QUERY : MSG_AFTER_FIELD_VALUE;
}

function copyRecords(records: LineRecord[], start: number, end: number): LineRecord[] {
  return records.slice(start, end).map((record) => ({
    content: record.content,
    ending: record.ending,
  }));
}

function applyFix(records: LineRecord[], site: LockSite): boolean {
  const block = copyRecords(records, site.commentStart, site.lockLine + 1);
  if (block.length === 0) {
    return false;
  }
  const removedCount = site.lockLine - site.commentStart + 1;
  records.splice(site.commentStart, removedCount);
  const insertAt =
    site.insertAt > site.commentStart ? site.insertAt - removedCount : site.insertAt;
  records.splice(insertAt, 0, ...block);
  return true;
}

function violationsFor(
  file: SourceFile,
  lines: string[],
  severity: Violation["severity"],
): Violation[] {
  const violations: Violation[] = [];
  for (const site of findLockSites(lines)) {
    violations.push({
      ruleId: lockPlacement.id,
      message: messageFor(site),
      severity,
      file: file.path,
      line: site.lockLine + 1,
      column: site.column,
    });
  }
  return violations;
}

export const lockPlacement: Rule = {
  id: "lock_placement",
  description:
    "lock sits immediately after field_value in db.get, or first in db.query, matching Xano push form",
  defaultEnabled: false,
  defaultSeverity: "warning",
  lint(file: SourceFile, options: RuleOptions): Violation[] {
    const severity = options.severity ?? lockPlacement.defaultSeverity;
    const lines = splitLineRecords(file.text).map((record) => record.content);
    return violationsFor(file, lines, severity);
  },
  fix(file: SourceFile, options: RuleOptions): string | null {
    const suppressions = parseSuppressions(file.text);
    const rewriteLines = new Set(
      lockPlacement
        .lint(file, options)
        .filter((violation) => !isSuppressed(suppressions, violation.line, lockPlacement.id))
        .map((violation) => violation.line),
    );
    if (rewriteLines.size === 0) {
      return null;
    }
    const records = splitLineRecords(file.text);
    const sites = findLockSites(records.map((record) => record.content))
      .filter((site) => rewriteLines.has(site.lockLine + 1))
      .sort((a, b) => b.lockLine - a.lockLine);
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
