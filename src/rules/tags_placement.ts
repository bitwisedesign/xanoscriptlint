import { isSuppressed, parseSuppressions } from "../suppress.js";
import { isBlankLine, isCommentLine } from "../util.js";
import { joinLineRecords, splitLineRecords } from "./line_records.js";
import type { LineRecord } from "./line_records.js";
import { literalLines } from "./numeric_declarations.js";
import { TAGS_OPENER, findMatchingBracket, rangeHasTab } from "./string_arrays.js";
import type { Rule, RuleOptions, SourceFile, Violation } from "./types.js";

const ANCHORS = new Set(["guid", "llm", "tools", "cache", "test"]);

const MSG_NEED_BLANK_ABOVE =
  "tags must have a blank line above it when it follows a block closer";
const MSG_EXACTLY_ONE_ABOVE = "tags must have exactly one blank line above it";
const MSG_NO_BLANK_ABOVE =
  "tags must not have a blank line above it when it follows a single-line value";
const MSG_NEED_BLANK_BELOW =
  "tags must have a blank line below it when it is wrapped or followed by a test block";
const MSG_EXACTLY_ONE_BELOW = "tags must have exactly one blank line below it";
const MSG_NO_BLANK_BELOW =
  "tags must not have a blank line below it when followed by a single-line value";

interface Anchor {
  name: string;
  line: number;
}

interface BlankRun {
  count: number;
  indices: number[];
  expect: boolean;
}

interface TagsSite {
  openLine: number;
  bracketLine: number;
  column: number;
  wrapped: boolean;
  hasTab: boolean;
  firstAnchor: Anchor | null;
  closeLine: number;
  misplaced: boolean;
  blankAbove: BlankRun;
  blankBelow: BlankRun;
}

function isCloserLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed === "}" || trimmed === "]";
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
  if (/^test\b/.test(trimmed)) {
    return "test";
  }
  const match = /^([A-Za-z_][A-Za-z0-9_]*)\b/.exec(trimmed);
  return match?.[1] ?? null;
}

function lineStartDepths(lines: string[], literals: Set<number>): {
  starts: number[];
  after: number[];
} {
  const starts: number[] = [];
  const after: number[] = [];
  let depth = 0;
  let mode: "code" | "double" | "single" = "code";
  let escape = false;
  for (let i = 0; i < lines.length; i += 1) {
    starts.push(depth);
    if (literals.has(i) || isCommentLine(lines[i])) {
      after.push(depth);
      continue;
    }
    const text = lines[i];
    let col = 0;
    while (col < text.length) {
      const ch = text[col];
      if (mode === "double" || mode === "single") {
        if (escape) {
          escape = false;
          col += 1;
          continue;
        }
        if (ch === "\\") {
          escape = true;
          col += 1;
          continue;
        }
        if ((mode === "double" && ch === '"') || (mode === "single" && ch === "'")) {
          mode = "code";
        }
        col += 1;
        continue;
      }
      if (ch === "/" && text[col + 1] === "/") {
        break;
      }
      if (ch === '"') {
        mode = "double";
        col += 1;
        continue;
      }
      if (ch === "'") {
        mode = "single";
        col += 1;
        continue;
      }
      if (ch === "{") {
        depth += 1;
        col += 1;
        continue;
      }
      if (ch === "}") {
        depth = Math.max(0, depth - 1);
        col += 1;
        continue;
      }
      col += 1;
    }
    after.push(depth);
  }
  return { starts, after };
}

function skipBackward(lines: string[], start: number): { blanks: number[]; prev: number } {
  const blanks: number[] = [];
  let j = start;
  while (j >= 0) {
    if (isBlankLine(lines[j])) {
      blanks.push(j);
      j -= 1;
      continue;
    }
    if (isCommentLine(lines[j])) {
      j -= 1;
      continue;
    }
    break;
  }
  return { blanks, prev: j };
}

function skipForward(
  lines: string[],
  start: number,
  last: number,
): { blanks: number[]; next: number } {
  const blanks: number[] = [];
  let j = start;
  while (j <= last) {
    if (isBlankLine(lines[j])) {
      blanks.push(j);
      j += 1;
      continue;
    }
    if (isCommentLine(lines[j])) {
      j += 1;
      continue;
    }
    break;
  }
  return { blanks, next: j };
}

function parseTagsExtent(
  lines: string[],
  openLine: number,
): { bracketLine: number; wrapped: boolean; hasTab: boolean } | null {
  const match = TAGS_OPENER.exec(lines[openLine]);
  if (match === null) {
    return null;
  }
  const openCol = match[0].length - 1;
  const close = findMatchingBracket(lines, openLine, openCol);
  if (close === null) {
    return null;
  }
  if (lines[close.line].slice(close.col + 1).trim() !== "") {
    return null;
  }
  return {
    bracketLine: close.line,
    wrapped: close.line !== openLine,
    hasTab: rangeHasTab(lines, openLine, close.line),
  };
}

function findTagsSites(lines: string[]): TagsSite[] {
  const literals = literalLines(lines);
  const depths = lineStartDepths(lines, literals);
  const sites: TagsSite[] = [];
  let openLine = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const startDepth = depths.starts[i];
    const afterDepth = depths.after[i];
    if (openLine === -1 && startDepth === 0 && afterDepth >= 1) {
      openLine = i;
    }
    if (openLine === -1 || !(startDepth >= 1 && afterDepth === 0)) {
      continue;
    }
    const closeLine = i;
    const members: { line: number; kind: string }[] = [];
    for (let line = openLine + 1; line < closeLine; line += 1) {
      if (literals.has(line) || isCommentLine(lines[line]) || depths.starts[line] !== 1) {
        continue;
      }
      const kind = memberKind(lines[line]);
      if (kind === null) {
        continue;
      }
      members.push({ line, kind });
    }
    const tagsMembers = members.filter((member) => member.kind === "tags");
    const tagsMember = tagsMembers[tagsMembers.length - 1];
    const firstAnchorMember = members.find((member) => ANCHORS.has(member.kind));
    const firstAnchor =
      firstAnchorMember === undefined
        ? null
        : { name: firstAnchorMember.kind, line: firstAnchorMember.line };
    openLine = -1;
    if (tagsMember === undefined) {
      continue;
    }
    const extent = parseTagsExtent(lines, tagsMember.line);
    if (extent === null) {
      continue;
    }
    const above = skipBackward(lines, tagsMember.line - 1);
    const below = skipForward(lines, extent.bracketLine + 1, closeLine);
    const belowKind = memberKind(lines[below.next] ?? "");
    const expectedNext = firstAnchor?.line ?? closeLine;
    const misplaced = below.next !== expectedNext;
    sites.push({
      openLine: tagsMember.line,
      bracketLine: extent.bracketLine,
      column: indentColumn(lines[tagsMember.line]),
      wrapped: extent.wrapped,
      hasTab: extent.hasTab,
      firstAnchor,
      closeLine,
      misplaced,
      blankAbove: {
        count: above.blanks.length,
        indices: above.blanks,
        expect: above.prev >= 0 && isCloserLine(lines[above.prev]),
      },
      blankBelow: {
        count: below.blanks.length,
        indices: below.blanks,
        expect: belowKind !== null && (extent.wrapped || belowKind === "test"),
      },
    });
  }
  return sites;
}

function placementMessage(site: TagsSite): string | null {
  if (!site.misplaced) {
    return null;
  }
  if (site.firstAnchor !== null) {
    return `tags must be placed immediately before \`${site.firstAnchor.name}\``;
  }
  return "tags must be placed at the end of the declaration";
}

function blankAboveMessage(site: TagsSite): string | null {
  if (site.blankAbove.expect) {
    if (site.blankAbove.count === 0) {
      return MSG_NEED_BLANK_ABOVE;
    }
    if (site.blankAbove.count > 1) {
      return MSG_EXACTLY_ONE_ABOVE;
    }
    return null;
  }
  if (site.blankAbove.count > 0) {
    return MSG_NO_BLANK_ABOVE;
  }
  return null;
}

function blankBelowMessage(site: TagsSite): string | null {
  if (site.blankBelow.expect) {
    if (site.blankBelow.count === 0) {
      return MSG_NEED_BLANK_BELOW;
    }
    if (site.blankBelow.count > 1) {
      return MSG_EXACTLY_ONE_BELOW;
    }
    return null;
  }
  if (site.blankBelow.count > 0) {
    return MSG_NO_BLANK_BELOW;
  }
  return null;
}

function messagesFor(site: TagsSite): string[] {
  return [placementMessage(site), blankAboveMessage(site), blankBelowMessage(site)].filter(
    (message): message is string => message !== null,
  );
}

function copyRecords(records: LineRecord[], start: number, end: number): LineRecord[] {
  return records.slice(start, end).map((record) => ({
    content: record.content,
    ending: record.ending,
  }));
}

function applyFix(records: LineRecord[], site: TagsSite): boolean {
  if (site.hasTab) {
    return false;
  }
  const tagsBlock = copyRecords(records, site.openLine, site.bracketLine + 1);
  if (tagsBlock.length === 0) {
    return false;
  }
  const ending = tagsBlock[0].ending === "" ? "\n" : tagsBlock[0].ending;
  let trailing = 0;
  let j = site.bracketLine + 1;
  while (j < records.length && isBlankLine(records[j].content)) {
    trailing += 1;
    j += 1;
  }
  const removedStart = site.openLine;
  const removedCount = site.bracketLine - site.openLine + 1 + trailing;
  records.splice(removedStart, removedCount);

  const adjust = (line: number): number => {
    if (line < removedStart) {
      return line;
    }
    if (line < removedStart + removedCount) {
      return removedStart;
    }
    return line - removedCount;
  };

  const target = site.firstAnchor === null ? adjust(site.closeLine) : adjust(site.firstAnchor.line);
  let i = target - 1;
  while (i >= 0 && isCommentLine(records[i].content)) {
    i -= 1;
  }
  while (i >= 0 && isBlankLine(records[i].content)) {
    i -= 1;
  }
  const insertAt = i + 1;
  let k = insertAt;
  while (k < target && isBlankLine(records[k].content)) {
    k += 1;
  }
  if (k > insertAt) {
    records.splice(insertAt, k - insertAt);
  }

  const prev = insertAt > 0 ? records[insertAt - 1]?.content ?? "" : "";
  let nextIdx = insertAt;
  while (nextIdx < records.length && isCommentLine(records[nextIdx].content)) {
    nextIdx += 1;
  }
  const nextKind = memberKind(records[nextIdx]?.content ?? "");
  const wrapped = tagsBlock.length > 1;
  const insert: LineRecord[] = [];
  if (isCloserLine(prev)) {
    insert.push({ content: "", ending });
  }
  insert.push(...tagsBlock);
  if (nextKind !== null && (wrapped || nextKind === "test")) {
    insert.push({ content: "", ending });
  }
  records.splice(insertAt, 0, ...insert);
  return true;
}

function violationsFor(
  file: SourceFile,
  lines: string[],
  severity: Violation["severity"],
): Violation[] {
  const violations: Violation[] = [];
  for (const site of findTagsSites(lines)) {
    for (const message of messagesFor(site)) {
      violations.push({
        ruleId: tagsPlacement.id,
        message,
        severity,
        file: file.path,
        line: site.openLine + 1,
        column: site.column,
      });
    }
  }
  return violations;
}

export const tagsPlacement: Rule = {
  id: "tags_placement",
  description:
    "tags sits immediately before guid, test, llm, tools, or cache, with blank lines matching Xano push form",
  defaultEnabled: false,
  defaultSeverity: "warning",
  lint(file: SourceFile, options: RuleOptions): Violation[] {
    const severity = options.severity ?? tagsPlacement.defaultSeverity;
    const lines = splitLineRecords(file.text).map((record) => record.content);
    return violationsFor(file, lines, severity);
  },
  fix(file: SourceFile, options: RuleOptions): string | null {
    const suppressions = parseSuppressions(file.text);
    const rewriteLines = new Set(
      tagsPlacement
        .lint(file, options)
        .filter((violation) => !isSuppressed(suppressions, violation.line, tagsPlacement.id))
        .map((violation) => violation.line),
    );
    if (rewriteLines.size === 0) {
      return null;
    }
    const records = splitLineRecords(file.text);
    const sites = findTagsSites(records.map((record) => record.content))
      .filter((site) => rewriteLines.has(site.openLine + 1))
      .sort((a, b) => b.openLine - a.openLine);
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
