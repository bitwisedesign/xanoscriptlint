import { findMockBlocks, joinLineRecords, splitLineRecords } from "./mock_blocks.js";
import type { LineRecord, MockEntry } from "./mock_blocks.js";
import type { Rule, RuleOptions, SourceFile, Violation } from "./types.js";
import { isSuppressed, parseSuppressions } from "../suppress.js";
import { splitLines } from "../util.js";

function isUnfencedMultiline(entry: MockEntry): boolean {
  return !entry.fenced && entry.valueEndLine > entry.lineIndex;
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

function openerOnKeyLine(line: string, entry: MockEntry): "{" | "[" | null {
  const fragment = line.slice(entry.valueStart).trim();
  if (fragment === "{" || fragment === "[") {
    return fragment;
  }
  return null;
}

function canFence(records: LineRecord[], entry: MockEntry): boolean {
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

function fenceEntry(records: LineRecord[], entry: MockEntry): boolean {
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
  const ending = records[entry.lineIndex].ending;
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
  records.splice(entry.lineIndex + 1, 0, { content: `${indent}${opener}`, ending });
  records.splice(entry.valueEndLine + 2, 0, { content: `${indent}\`\`\``, ending });
  return true;
}

function violationsFor(
  file: SourceFile,
  lines: string[],
  severity: Violation["severity"],
): Violation[] {
  const violations: Violation[] = [];
  for (const block of findMockBlocks(lines)) {
    for (const entry of block.entries) {
      if (!isUnfencedMultiline(entry)) {
        continue;
      }
      violations.push({
        ruleId: fenceMultilineMocks.id,
        message: "multiline mock value must be wrapped in a ``` fence",
        severity,
        file: file.path,
        line: entry.lineIndex + 1,
        column: entry.valueStart + 1,
      });
    }
  }
  return violations;
}

export const fenceMultilineMocks: Rule = {
  id: "fence_multiline_mocks",
  description: "Multiline mock values must be wrapped in a ``` fence",
  defaultEnabled: true,
  defaultSeverity: "error",
  lint(file: SourceFile, options: RuleOptions): Violation[] {
    const severity = options.severity ?? fenceMultilineMocks.defaultSeverity;
    return violationsFor(file, splitLines(file.text), severity);
  },
  fix(file: SourceFile, options: RuleOptions): string | null {
    const suppressions = parseSuppressions(file.text);
    const rewriteLines = new Set(
      fenceMultilineMocks
        .lint(file, options)
        .filter((violation) => !isSuppressed(suppressions, violation.line, fenceMultilineMocks.id))
        .map((violation) => violation.line),
    );
    if (rewriteLines.size === 0) {
      return null;
    }
    const records = splitLineRecords(file.text);
    const lines = records.map((record) => record.content);
    const entries = findMockBlocks(lines)
      .flatMap((block) => (block.multiKeyLine ? [] : block.entries))
      .filter((entry) => isUnfencedMultiline(entry) && rewriteLines.has(entry.lineIndex + 1))
      .sort((a, b) => b.lineIndex - a.lineIndex || b.colonIndex - a.colonIndex);
    let changed = false;
    for (const entry of entries) {
      if (fenceEntry(records, entry)) {
        changed = true;
      }
    }
    if (!changed) {
      return null;
    }
    return joinLineRecords(records);
  },
};
