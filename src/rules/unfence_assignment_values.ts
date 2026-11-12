import { isSuppressed, parseSuppressions } from "../suppress.js";
import {
  byteLength,
  lookbehindAssignment,
  offsetToLineCol,
  parseValue,
  renderInline,
  skipQuoted,
  skipSpan,
  type Node,
} from "./collapse_assignment_values.js";
import { joinLineRecords, splitLineRecords } from "./line_records.js";
import type { LineRecord } from "./line_records.js";
import type { Rule, RuleOptions, SourceFile, Violation } from "./types.js";
import { DEFAULT_WRAP_AT } from "./wrap_enum_values.js";

type ContainerNode = Extract<Node, { kind: "object" | "array" }>;

interface FenceSite {
  owner: string;
  openLine: number;
  closeLine: number;
  openCol: number;
  lineLength: number;
  hasTab: boolean;
  node: ContainerNode;
}

function wrapThreshold(options: RuleOptions): number {
  return options.wrapAt ?? DEFAULT_WRAP_AT;
}

function restOfLineIsBlank(text: string, from: number): boolean {
  for (let i = from; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "\n") {
      return true;
    }
    if (ch !== " " && ch !== "\t" && ch !== "\r") {
      return false;
    }
  }
  return true;
}

function closerAloneOnLine(text: string, closerStart: number): boolean {
  let lineStart = closerStart;
  while (lineStart > 0 && text[lineStart - 1] !== "\n") {
    lineStart -= 1;
  }
  for (let i = lineStart; i < closerStart; i += 1) {
    const ch = text[i];
    if (ch !== " " && ch !== "\t" && ch !== "\r") {
      return false;
    }
  }
  return restOfLineIsBlank(text, closerStart + 3);
}

function lineHasTab(lines: string[], startLine: number, endLine: number): boolean {
  for (let i = startLine; i <= endLine; i += 1) {
    if (lines[i]?.includes("\t")) {
      return true;
    }
  }
  return false;
}

function parseFenceBody(body: string): ContainerNode | null {
  if (body.split("\n").some((line) => line.trimStart().startsWith("|"))) {
    return null;
  }
  const cursor = { text: body.trim(), i: 0 };
  const node = parseValue(cursor);
  if (node === null || (node.kind !== "object" && node.kind !== "array")) {
    return null;
  }
  while (cursor.i < cursor.text.length) {
    const ch = cursor.text[cursor.i];
    if (ch !== " " && ch !== "\t") {
      return null;
    }
    cursor.i += 1;
  }
  return node;
}

function findFenceSites(lines: string[]): FenceSite[] {
  const text = lines.join("\n");
  const sites: FenceSite[] = [];
  let i = 0;
  while (i < text.length) {
    if (text.startsWith("```", i)) {
      const end = skipSpan(text, i + 3, "```");
      if (end === null) {
        break;
      }
      const owner = lookbehindAssignment(text, i);
      if (
        owner !== null &&
        restOfLineIsBlank(text, i + 3) &&
        closerAloneOnLine(text, end - 3)
      ) {
        const node = parseFenceBody(text.slice(i + 3, end - 3));
        if (node !== null) {
          const open = offsetToLineCol(lines, i);
          const close = offsetToLineCol(lines, end - 3);
          const prefix = lines[open.line]?.slice(0, open.col) ?? "";
          sites.push({
            owner,
            openLine: open.line,
            closeLine: close.line,
            openCol: open.col,
            lineLength: byteLength(prefix) + byteLength(renderInline(node)),
            hasTab: lineHasTab(lines, open.line, close.line),
            node,
          });
        }
      }
      i = end;
      continue;
    }
    if (text.startsWith('"""', i)) {
      const end = skipSpan(text, i + 3, '"""');
      if (end === null) {
        break;
      }
      i = end;
      continue;
    }
    if (text.startsWith("//", i)) {
      const nl = text.indexOf("\n", i);
      i = nl === -1 ? text.length : nl;
      continue;
    }
    const ch = text[i];
    if (ch === '"' || ch === "'") {
      const quotedEnd = skipQuoted(text, i, ch);
      if (quotedEnd === null) {
        break;
      }
      i = quotedEnd;
      continue;
    }
    i += 1;
  }
  return sites;
}

function isLiteralZero(node: Node): boolean {
  return node.kind === "scalar" && node.text === "0";
}

function hasZeroFollowedByKey(node: Node): boolean {
  if (node.kind === "array") {
    return node.items.some(hasZeroFollowedByKey);
  }
  if (node.kind !== "object") {
    return false;
  }
  for (let i = 0; i < node.entries.length; i += 1) {
    const value = node.entries[i]?.value;
    if (value === undefined) {
      continue;
    }
    if (isLiteralZero(value) && i < node.entries.length - 1) {
      return true;
    }
    if (hasZeroFollowedByKey(value)) {
      return true;
    }
  }
  return false;
}

function eligible(site: FenceSite, wrapAt: number): boolean {
  return !site.hasTab && site.lineLength < wrapAt && !hasZeroFollowedByKey(site.node);
}

function violationsFor(
  file: SourceFile,
  lines: string[],
  options: RuleOptions,
  severity: Violation["severity"],
): Violation[] {
  const wrapAt = wrapThreshold(options);
  const violations: Violation[] = [];
  for (const site of findFenceSites(lines)) {
    if (!eligible(site, wrapAt)) {
      continue;
    }
    violations.push({
      ruleId: unfenceAssignmentValues.id,
      message: `fenced ${site.owner} value of line length ${site.lineLength} must be inline (threshold ${wrapAt})`,
      severity,
      file: file.path,
      line: site.openLine + 1,
      column: site.openCol + 1,
    });
  }
  return violations;
}

function unfenceSite(records: LineRecord[], site: FenceSite): boolean {
  const open = records[site.openLine];
  const close = records[site.closeLine];
  if (open === undefined || close === undefined) {
    return false;
  }
  open.content = `${open.content.slice(0, site.openCol)}${renderInline(site.node)}`;
  open.ending = close.ending;
  records.splice(site.openLine + 1, site.closeLine - site.openLine);
  return true;
}

export const unfenceAssignmentValues: Rule = {
  id: "unfence_assignment_values",
  description:
    "Fenced assignment objects and arrays collapse to one line when that line would be shorter than 64, except a 0 followed by another key (Xano rewrites this on push)",
  defaultEnabled: false,
  defaultSeverity: "warning",
  numericOptions: ["wrap_at"],
  lint(file: SourceFile, options: RuleOptions): Violation[] {
    const severity = options.severity ?? unfenceAssignmentValues.defaultSeverity;
    const lines = splitLineRecords(file.text).map((record) => record.content);
    return violationsFor(file, lines, options, severity);
  },
  fix(file: SourceFile, options: RuleOptions): string | null {
    const suppressions = parseSuppressions(file.text);
    const rewriteLines = new Set(
      unfenceAssignmentValues
        .lint(file, options)
        .filter(
          (violation) =>
            !isSuppressed(suppressions, violation.line, unfenceAssignmentValues.id),
        )
        .map((violation) => violation.line),
    );
    if (rewriteLines.size === 0) {
      return null;
    }
    const records = splitLineRecords(file.text);
    const lines = records.map((record) => record.content);
    const wrapAt = wrapThreshold(options);
    const sites = findFenceSites(lines)
      .filter((site) => eligible(site, wrapAt) && rewriteLines.has(site.openLine + 1))
      .sort((a, b) => b.openLine - a.openLine);
    let changed = false;
    for (const site of sites) {
      if (unfenceSite(records, site)) {
        changed = true;
      }
    }
    if (!changed) {
      return null;
    }
    return joinLineRecords(records);
  },
};
