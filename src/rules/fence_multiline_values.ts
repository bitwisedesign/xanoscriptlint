import { joinLineRecords, splitLineRecords } from "./line_records.js";
import type { LineRecord } from "./line_records.js";
import { findObjectBlocks } from "./object_blocks.js";
import type { ObjectBlock, ObjectEntry } from "./object_blocks.js";
import type { Rule, RuleOptions, SourceFile, Violation } from "./types.js";
import { isSuppressed, parseSuppressions } from "../suppress.js";
import { isCommentLine, splitLines } from "../util.js";

const FENCE_OWNERS = new Set(["mock", "input"]);
const FENCE_OPENER = /^(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[A-Za-z_][A-Za-z0-9_]*)\s*:\s*```\s*$/;
const SIBLING_STATEMENT = /^(?:mock|input)\s*=/;

function isFenceOpenerLine(line: string): boolean {
  return FENCE_OPENER.test(line.trimStart());
}

function isFenceBlock(block: ObjectBlock): boolean {
  if (block.depth !== 0 || block.owner === null || !FENCE_OWNERS.has(block.owner)) {
    return false;
  }
  return !(block.owner === "mock" && block.inFunctionRun);
}

function isUnfencedMultiline(entry: ObjectEntry): boolean {
  return !entry.fenced && entry.valueEndLine > entry.lineIndex;
}

function fenceEntries(lines: string[]): Array<{ entry: ObjectEntry; owner: string }> {
  const found: Array<{ entry: ObjectEntry; owner: string }> = [];
  for (const block of findObjectBlocks(lines)) {
    if (!isFenceBlock(block) || block.owner === null) {
      continue;
    }
    for (const entry of [...block.ownLine, ...block.inline]) {
      if (isUnfencedMultiline(entry)) {
        found.push({ entry, owner: block.owner });
      }
    }
  }
  return found;
}

function leadingSpaces(line: string): number {
  let i = 0;
  while (i < line.length && line[i] === " ") {
    i += 1;
  }
  return i;
}

function hasTabIndent(line: string): boolean {
  const match = /^[ \t]*/.exec(line);
  return match !== null && match[0].includes("\t");
}

function shiftIndent(line: string, delta: number): string | null {
  if (line.trim().length === 0) {
    return line;
  }
  if (delta > 0) {
    return `${" ".repeat(delta)}${line}`;
  }
  if (delta < 0) {
    const need = -delta;
    if (!line.startsWith(" ".repeat(need))) {
      return null;
    }
    return line.slice(need);
  }
  return line;
}

function openerOnKeyLine(line: string, entry: ObjectEntry): "{" | "[" | null {
  const fragment = line.slice(entry.valueStart).trim();
  if (fragment === "{" || fragment === "[") {
    return fragment;
  }
  return null;
}

function rangeIncludesSiblingStatement(records: LineRecord[], entry: ObjectEntry): boolean {
  for (let i = entry.lineIndex + 1; i <= entry.valueEndLine; i += 1) {
    const trimmed = records[i].content.trimStart();
    if (SIBLING_STATEMENT.test(trimmed) || trimmed.startsWith("function.run")) {
      return true;
    }
  }
  return false;
}

function canFence(records: LineRecord[], entry: ObjectEntry): boolean {
  const keyLine = records[entry.lineIndex]?.content;
  const endLine = records[entry.valueEndLine]?.content;
  if (keyLine === undefined || endLine === undefined) {
    return false;
  }
  const opener = openerOnKeyLine(keyLine, entry);
  if (opener === null) {
    return false;
  }
  const closer = opener === "{" ? "}" : "]";
  if (endLine[entry.valueEndCol] !== closer) {
    return false;
  }
  if (endLine.slice(entry.valueEndCol + 1).trim() !== "") {
    return false;
  }
  const nextLine = records[entry.lineIndex + 1]?.content;
  if (
    nextLine !== undefined &&
    isFenceOpenerLine(nextLine) &&
    leadingSpaces(nextLine) === leadingSpaces(keyLine)
  ) {
    return false;
  }
  if (rangeIncludesSiblingStatement(records, entry)) {
    return false;
  }
  for (let i = entry.lineIndex; i <= entry.valueEndLine; i += 1) {
    if (hasTabIndent(records[i].content)) {
      return false;
    }
  }
  const contentIndent = leadingSpaces(keyLine) + 2;
  const delta = contentIndent - leadingSpaces(endLine);
  if (delta < 0) {
    for (let i = entry.lineIndex + 1; i <= entry.valueEndLine; i += 1) {
      if (shiftIndent(records[i].content, delta) === null) {
        return false;
      }
    }
  }
  return true;
}

function fenceEntry(records: LineRecord[], entry: ObjectEntry): boolean {
  if (!canFence(records, entry)) {
    return false;
  }
  const keyLine = records[entry.lineIndex].content;
  const endLine = records[entry.valueEndLine].content;
  const opener = openerOnKeyLine(keyLine, entry);
  if (opener === null) {
    return false;
  }
  const contentIndent = leadingSpaces(keyLine) + 2;
  const delta = contentIndent - leadingSpaces(endLine);
  const indent = " ".repeat(contentIndent);
  const keyEnding = records[entry.lineIndex].ending;
  const closerEnding = records[entry.valueEndLine].ending;
  const shiftedLines: string[] = [];
  for (let i = entry.lineIndex + 1; i <= entry.valueEndLine; i += 1) {
    const shifted = shiftIndent(records[i].content, delta);
    if (shifted === null) {
      return false;
    }
    shiftedLines.push(shifted);
  }
  for (let i = 0; i < shiftedLines.length; i += 1) {
    records[entry.lineIndex + 1 + i].content = shiftedLines[i];
  }

  records[entry.lineIndex].content = `${keyLine.slice(0, entry.colonIndex + 1)} \`\`\``;
  records.splice(entry.lineIndex + 1, 0, { content: `${indent}${opener}`, ending: keyEnding });
  const closerIndex = entry.valueEndLine + 1;
  if (records[closerIndex].ending === "") {
    records[closerIndex].ending = keyEnding;
  }
  records.splice(closerIndex + 1, 0, { content: `${indent}\`\`\``, ending: closerEnding });
  return true;
}

interface RunPair {
  input: ObjectBlock;
  mock: ObjectBlock;
}

function functionRunPairs(lines: string[]): RunPair[] {
  const byRun = new Map<number, { input?: ObjectBlock; mock?: ObjectBlock }>();
  for (const block of findObjectBlocks(lines)) {
    if (!block.inFunctionRun || block.depth !== 0 || block.functionRunId === null) {
      continue;
    }
    if (block.owner !== "mock" && block.owner !== "input") {
      continue;
    }
    const slot = byRun.get(block.functionRunId) ?? {};
    if (block.owner === "mock") {
      slot.mock = block;
    } else {
      slot.input = block;
    }
    byRun.set(block.functionRunId, slot);
  }
  const pairs: RunPair[] = [];
  for (const slot of byRun.values()) {
    if (slot.input !== undefined && slot.mock !== undefined) {
      pairs.push({ input: slot.input, mock: slot.mock });
    }
  }
  return pairs;
}

function consecutiveFenceOpenerViolations(
  file: SourceFile,
  lines: string[],
  severity: Violation["severity"],
): Violation[] {
  const violations: Violation[] = [];
  for (let i = 0; i < lines.length - 1; i += 1) {
    if (isCommentLine(lines[i]) || isCommentLine(lines[i + 1])) {
      continue;
    }
    if (!isFenceOpenerLine(lines[i]) || !isFenceOpenerLine(lines[i + 1])) {
      continue;
    }
    if (leadingSpaces(lines[i]) !== leadingSpaces(lines[i + 1])) {
      continue;
    }
    violations.push({
      ruleId: fenceMultilineValues.id,
      message: "consecutive fence openers; each fenced key must have its own closed ``` body",
      severity,
      file: file.path,
      line: i + 2,
      column: leadingSpaces(lines[i + 1]) + 1,
    });
  }
  return violations;
}

function functionRunMockIndentViolations(
  file: SourceFile,
  lines: string[],
  severity: Violation["severity"],
): Violation[] {
  const violations: Violation[] = [];
  for (const { input, mock } of functionRunPairs(lines)) {
    const inputIndent = leadingSpaces(lines[input.openLine]);
    const mockIndent = leadingSpaces(lines[mock.openLine]);
    if (inputIndent === mockIndent) {
      continue;
    }
    violations.push({
      ruleId: fenceMultilineValues.id,
      message: "mock must be indented with input inside function.run",
      severity,
      file: file.path,
      line: mock.openLine + 1,
      column: mockIndent + 1,
    });
  }
  return violations;
}

function fixFunctionRunMockIndents(records: LineRecord[]): boolean {
  const lines = records.map((record) => record.content);
  let changed = false;
  const pairs = functionRunPairs(lines).sort((a, b) => b.mock.openLine - a.mock.openLine);
  for (const { input, mock } of pairs) {
    const inputIndent = leadingSpaces(records[input.openLine].content);
    const mockIndent = leadingSpaces(records[mock.openLine].content);
    const delta = inputIndent - mockIndent;
    if (delta === 0) {
      continue;
    }
    let ok = true;
    const shifted: string[] = [];
    for (let i = mock.openLine; i <= mock.closeLine; i += 1) {
      const next = shiftIndent(records[i].content, delta);
      if (next === null) {
        ok = false;
        break;
      }
      shifted.push(next);
    }
    if (!ok) {
      continue;
    }
    for (let i = 0; i < shifted.length; i += 1) {
      records[mock.openLine + i].content = shifted[i];
    }
    changed = true;
  }
  return changed;
}

function violationsFor(
  file: SourceFile,
  lines: string[],
  severity: Violation["severity"],
): Violation[] {
  const violations: Violation[] = [];
  for (const { entry, owner } of fenceEntries(lines)) {
    violations.push({
      ruleId: fenceMultilineValues.id,
      message: `multiline ${owner} value must be wrapped in a \`\`\` fence`,
      severity,
      file: file.path,
      line: entry.lineIndex + 1,
      column: entry.valueStart + 1,
    });
  }
  violations.push(...consecutiveFenceOpenerViolations(file, lines, severity));
  violations.push(...functionRunMockIndentViolations(file, lines, severity));
  return violations;
}

export const fenceMultilineValues: Rule = {
  id: "fence_multiline_values",
  description: "Multiline mock and input values must be wrapped in a ``` fence",
  defaultEnabled: true,
  defaultSeverity: "error",
  lint(file: SourceFile, options: RuleOptions): Violation[] {
    const severity = options.severity ?? fenceMultilineValues.defaultSeverity;
    return violationsFor(file, splitLines(file.text), severity);
  },
  fix(file: SourceFile, options: RuleOptions): string | null {
    const suppressions = parseSuppressions(file.text);
    const rewriteLines = new Set(
      fenceMultilineValues
        .lint(file, options)
        .filter((violation) => !isSuppressed(suppressions, violation.line, fenceMultilineValues.id))
        .map((violation) => violation.line),
    );
    const records = splitLineRecords(file.text);
    const lines = records.map((record) => record.content);
    const entries = fenceEntries(lines)
      .map(({ entry }) => entry)
      .filter((entry) => rewriteLines.has(entry.lineIndex + 1))
      .sort((a, b) => b.lineIndex - a.lineIndex || b.colonIndex - a.colonIndex);
    let changed = false;
    for (const entry of entries) {
      if (fenceEntry(records, entry)) {
        changed = true;
      }
    }
    if (fixFunctionRunMockIndents(records)) {
      changed = true;
    }
    if (!changed) {
      return null;
    }
    return joinLineRecords(records);
  },
};
