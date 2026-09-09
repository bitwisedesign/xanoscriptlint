import { findMockBlocks, joinLineRecords, splitLineRecords } from "./mock_blocks.js";
import type { MockEntry } from "./mock_blocks.js";
import type { Rule, RuleOptions, SourceFile, Violation } from "./types.js";
import { splitLines } from "../util.js";

function targetColonColumn(entries: MockEntry[]): number {
  return Math.max(...entries.map((entry) => entry.keyStart + entry.key.length));
}

function alignLine(line: string, entry: MockEntry, targetColon: number): string {
  const keyEnd = entry.keyStart + entry.key.length;
  const pad = Math.max(0, targetColon - keyEnd);
  return `${line.slice(0, keyEnd)}${" ".repeat(pad)}:${line.slice(entry.colonIndex + 1)}`;
}

function violationsFor(
  file: SourceFile,
  lines: string[],
  severity: Violation["severity"],
): Violation[] {
  const violations: Violation[] = [];
  for (const block of findMockBlocks(lines)) {
    if (block.multiKeyLine || block.entries.length === 0) {
      continue;
    }
    const targetColon = targetColonColumn(block.entries);
    for (const entry of block.entries) {
      if (entry.colonIndex === targetColon) {
        continue;
      }
      violations.push({
        ruleId: alignMockColons.id,
        message: "mock colons must align to the longest name",
        severity,
        file: file.path,
        line: entry.lineIndex + 1,
        column: entry.colonIndex + 1,
      });
    }
  }
  return violations;
}

export const alignMockColons: Rule = {
  id: "align_mock_colons",
  description: "Mock entry colons must align to the longest name",
  defaultEnabled: true,
  defaultSeverity: "error",
  lint(file: SourceFile, options: RuleOptions): Violation[] {
    const severity = options.severity ?? alignMockColons.defaultSeverity;
    return violationsFor(file, splitLines(file.text), severity);
  },
  fix(file: SourceFile): string | null {
    const records = splitLineRecords(file.text);
    const lines = records.map((record) => record.content);
    let changed = false;
    for (const block of findMockBlocks(lines)) {
      if (block.multiKeyLine || block.entries.length === 0) {
        continue;
      }
      const targetColon = targetColonColumn(block.entries);
      for (const entry of block.entries) {
        if (entry.colonIndex === targetColon) {
          continue;
        }
        const next = alignLine(lines[entry.lineIndex], entry, targetColon);
        if (next !== lines[entry.lineIndex]) {
          lines[entry.lineIndex] = next;
          changed = true;
        }
      }
    }
    if (!changed) {
      return null;
    }
    return joinLineRecords(records.map((record, i) => ({ ...record, content: lines[i] })));
  },
};
