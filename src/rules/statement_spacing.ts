import { isSuppressed, parseSuppressions } from "../suppress.js";
import { isBlankLine, isCommentLine } from "../util.js";
import { isAssignBrace, isColonBrace, isReturnBrace } from "./indent_model.js";
import { joinLineRecords, splitLineRecords } from "./line_records.js";
import { skipQuoted } from "./pipe_chains.js";
import type { Rule, RuleOptions, SourceFile, Violation } from "./types.js";

const FENCE = "```";
const TRIPLE = '"""';
const SCOPE_ROOT = /^(input|schema|stack)\b/;

const MSG = "blank line not allowed after a single-line statement with no adjacent comment";

type LineMode = "code" | "fence" | "triple";
type Delimiter = "{" | "[" | "(";

const CLOSER_TO_OPENER: Record<"}" | "]" | ")", Delimiter> = {
  "}": "{",
  "]": "[",
  ")": "(",
};

interface Frame {
  kind: Delimiter;
  literal: boolean;
  inScope: boolean;
  top: boolean;
  items: number[];
}

export interface SpacingSite {
  nextLine: number;
  blankIndices: number[];
  column: number;
}

function isPipeContinuation(line: string): boolean {
  const trimmed = line.trimStart();
  return trimmed.startsWith("|") && !trimmed.startsWith("||");
}

function isCloserLine(line: string): boolean {
  const trimmed = line.trimStart();
  return trimmed.startsWith("}") || trimmed.startsWith("]") || trimmed.startsWith(")");
}

function indentColumn(line: string): number {
  return line.length - line.trimStart().length + 1;
}

function isLiteralBrace(line: string, brace: number): boolean {
  return isAssignBrace(line, brace) || isColonBrace(line, brace) || isReturnBrace(line, brace);
}

function nearestNonBlank(lines: string[], start: number): number {
  for (let i = start; i >= 0; i -= 1) {
    if (!isBlankLine(lines[i] ?? "")) {
      return i;
    }
  }
  return -1;
}

function sitesForFrame(lines: string[], items: number[]): SpacingSite[] {
  const sites: SpacingSite[] = [];
  for (let n = 0; n < items.length - 1; n += 1) {
    const start = items[n] ?? 0;
    const next = items[n + 1] ?? 0;
    let end = next - 1;
    while (end > start && (isBlankLine(lines[end] ?? "") || isCommentLine(lines[end] ?? ""))) {
      end -= 1;
    }
    if (end > start) {
      continue;
    }
    const above = nearestNonBlank(lines, start - 1);
    if (above >= 0 && isCommentLine(lines[above] ?? "")) {
      continue;
    }
    const blankIndices: number[] = [];
    let commented = false;
    for (let i = end + 1; i < next; i += 1) {
      const line = lines[i] ?? "";
      if (isCommentLine(line)) {
        commented = true;
        break;
      }
      if (isBlankLine(line)) {
        blankIndices.push(i);
      }
    }
    if (commented || blankIndices.length === 0) {
      continue;
    }
    sites.push({
      nextLine: next,
      blankIndices,
      column: indentColumn(lines[next] ?? ""),
    });
  }
  return sites;
}

function pushBrace(stack: Frame[], line: string, brace: number): void {
  const parent = stack[stack.length - 1];
  const literal = parent?.literal === true || isLiteralBrace(line, brace);
  const top = parent === undefined;
  const scopeRoot = !literal && parent?.top === true && SCOPE_ROOT.test(line.trimStart());
  stack.push({
    kind: "{",
    literal,
    inScope: !literal && (scopeRoot || parent?.inScope === true),
    top,
    items: [],
  });
}

export function findSpacingSites(lines: string[]): SpacingSite[] | null {
  const sites: SpacingSite[] = [];
  const stack: Frame[] = [];
  let mode: LineMode = "code";

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    const startMode = mode;
    if (startMode === "code") {
      const frame = stack[stack.length - 1];
      if (
        frame !== undefined &&
        frame.kind === "{" &&
        frame.inScope &&
        !frame.literal &&
        !isBlankLine(line) &&
        !isCommentLine(line) &&
        !isCloserLine(line) &&
        !isPipeContinuation(line)
      ) {
        frame.items.push(i);
      }
    }
    let col = 0;
    if (startMode === "fence") {
      const closer = line.indexOf(FENCE);
      if (closer < 0) {
        continue;
      }
      mode = "code";
      col = closer + FENCE.length;
    } else if (startMode === "triple") {
      const closer = line.indexOf(TRIPLE);
      if (closer < 0) {
        continue;
      }
      mode = "code";
      col = closer + TRIPLE.length;
    }
    while (col < line.length) {
      if (line.startsWith("//", col)) {
        break;
      }
      if (line.startsWith(FENCE, col)) {
        const closer = line.indexOf(FENCE, col + FENCE.length);
        if (closer < 0) {
          mode = "fence";
          break;
        }
        col = closer + FENCE.length;
        continue;
      }
      if (line.startsWith(TRIPLE, col)) {
        const closer = line.indexOf(TRIPLE, col + TRIPLE.length);
        if (closer < 0) {
          mode = "triple";
          break;
        }
        col = closer + TRIPLE.length;
        continue;
      }
      const ch = line[col];
      if (ch === '"' || ch === "'") {
        const end = skipQuoted(line, col, ch);
        if (end === null) {
          return null;
        }
        col = end;
        continue;
      }
      if (ch === "{" || ch === "[" || ch === "(") {
        if (ch === "{") {
          pushBrace(stack, line, col);
        } else {
          stack.push({ kind: ch, literal: true, inScope: false, top: false, items: [] });
        }
        col += 1;
        continue;
      }
      if (ch === "}" || ch === "]" || ch === ")") {
        const frame = stack[stack.length - 1];
        if (frame === undefined || frame.kind !== CLOSER_TO_OPENER[ch]) {
          return null;
        }
        stack.pop();
        if (frame.kind === "{" && frame.inScope && !frame.literal) {
          sites.push(...sitesForFrame(lines, frame.items));
        }
        col += 1;
        continue;
      }
      col += 1;
    }
  }
  if (stack.length > 0 || mode !== "code") {
    return null;
  }
  sites.sort((a, b) => a.nextLine - b.nextLine);
  return sites;
}

function violationsFor(
  file: SourceFile,
  lines: string[],
  severity: Violation["severity"],
): Violation[] {
  const sites = findSpacingSites(lines);
  if (sites === null) {
    return [];
  }
  return sites.map((site) => ({
    ruleId: statementSpacing.id,
    message: MSG,
    severity,
    file: file.path,
    line: site.nextLine + 1,
    column: site.column,
  }));
}

export const statementSpacing: Rule = {
  id: "statement_spacing",
  description:
    "Blank lines between sibling statements only after a multi-line statement or next to a comment",
  defaultEnabled: false,
  defaultSeverity: "warning",
  lint(file: SourceFile, options: RuleOptions): Violation[] {
    const severity = options.severity ?? statementSpacing.defaultSeverity;
    const lines = splitLineRecords(file.text).map((record) => record.content);
    return violationsFor(file, lines, severity);
  },
  fix(file: SourceFile, options: RuleOptions): string | null {
    const suppressions = parseSuppressions(file.text);
    const rewriteLines = new Set(
      statementSpacing
        .lint(file, options)
        .filter((violation) => !isSuppressed(suppressions, violation.line, statementSpacing.id))
        .map((violation) => violation.line),
    );
    if (rewriteLines.size === 0) {
      return null;
    }
    const records = splitLineRecords(file.text);
    const sites = findSpacingSites(records.map((record) => record.content));
    if (sites === null) {
      return null;
    }
    const removals = sites
      .filter((site) => rewriteLines.has(site.nextLine + 1))
      .sort((a, b) => b.nextLine - a.nextLine);
    let changed = false;
    for (const site of removals) {
      for (const index of [...site.blankIndices].sort((a, b) => b - a)) {
        records.splice(index, 1);
        changed = true;
      }
    }
    if (!changed) {
      return null;
    }
    return joinLineRecords(records);
  },
};
