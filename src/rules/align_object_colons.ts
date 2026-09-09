import { joinLineRecords, splitLineRecords } from "./line_records.js";
import { findObjectBlocks } from "./object_blocks.js";
import type { ObjectEntry } from "./object_blocks.js";
import type { Rule, RuleOptions, SourceFile, Violation } from "./types.js";
import { isSuppressed, parseSuppressions } from "../suppress.js";
import { splitLines } from "../util.js";

const ALIGN_MESSAGE = "object colons must align to the longest name";
const SPACE_MESSAGE = "object colon must be followed by a single space";

function targetColonColumn(entries: ObjectEntry[]): number {
  return Math.max(...entries.map((entry) => entry.keyStart + entry.key.length));
}

function hasValue(line: string, entry: ObjectEntry): boolean {
  return line.slice(entry.colonIndex + 1).trim().length > 0;
}

function spacingOk(line: string, entry: ObjectEntry): boolean {
  const rest = line.slice(entry.colonIndex + 1);
  if (rest.trim().length === 0) {
    return true;
  }
  return rest.startsWith(" ") && rest[1] !== " ";
}

function alignmentGroups(blocks: ReturnType<typeof findObjectBlocks>): ObjectEntry[][] {
  const groups: ObjectEntry[][] = [];
  for (const block of blocks) {
    if (block.ownLine.length > 0) {
      groups.push(block.ownLine);
    }
    for (const entry of block.inline) {
      groups.push([entry]);
    }
  }
  return groups;
}

function violationFor(
  file: SourceFile,
  line: string,
  entry: ObjectEntry,
  targetColon: number,
  severity: Violation["severity"],
): Violation | null {
  if (!hasValue(line, entry)) {
    return null;
  }
  if (entry.colonIndex !== targetColon) {
    return {
      ruleId: alignObjectColons.id,
      message: ALIGN_MESSAGE,
      severity,
      file: file.path,
      line: entry.lineIndex + 1,
      column: entry.colonIndex + 1,
    };
  }
  if (!spacingOk(line, entry)) {
    return {
      ruleId: alignObjectColons.id,
      message: SPACE_MESSAGE,
      severity,
      file: file.path,
      line: entry.lineIndex + 1,
      column: entry.colonIndex + 1,
    };
  }
  return null;
}

function rewriteLine(line: string, entry: ObjectEntry, targetColon: number): string {
  const rest = line.slice(entry.colonIndex + 1);
  if (rest.trim().length === 0) {
    return line;
  }
  const pad = Math.max(0, targetColon - (entry.keyStart + entry.key.length));
  return `${line.slice(0, entry.keyStart)}${entry.key}${" ".repeat(pad)}: ${rest.trimStart()}`;
}

function violationsFor(
  file: SourceFile,
  lines: string[],
  severity: Violation["severity"],
): Violation[] {
  const violations: Violation[] = [];
  for (const group of alignmentGroups(findObjectBlocks(lines))) {
    const targetColon = targetColonColumn(group);
    for (const entry of group) {
      const violation = violationFor(file, lines[entry.lineIndex], entry, targetColon, severity);
      if (violation) {
        violations.push(violation);
      }
    }
  }
  return violations;
}

export const alignObjectColons: Rule = {
  id: "align_object_colons",
  description: "Object entry colons must align to the longest name",
  defaultEnabled: true,
  defaultSeverity: "error",
  lint(file: SourceFile, options: RuleOptions): Violation[] {
    const severity = options.severity ?? alignObjectColons.defaultSeverity;
    return violationsFor(file, splitLines(file.text), severity);
  },
  fix(file: SourceFile, options: RuleOptions): string | null {
    const suppressions = parseSuppressions(file.text);
    const rewriteLines = new Set(
      alignObjectColons
        .lint(file, options)
        .filter((violation) => !isSuppressed(suppressions, violation.line, alignObjectColons.id))
        .map((violation) => violation.line),
    );
    if (rewriteLines.size === 0) {
      return null;
    }
    const records = splitLineRecords(file.text);
    const lines = records.map((record) => record.content);
    const work: Array<{ entry: ObjectEntry; targetColon: number }> = [];
    for (const group of alignmentGroups(findObjectBlocks(lines))) {
      const targetColon = targetColonColumn(group);
      for (const entry of group) {
        if (!rewriteLines.has(entry.lineIndex + 1)) {
          continue;
        }
        work.push({ entry, targetColon });
      }
    }
    work.sort((a, b) => b.entry.lineIndex - a.entry.lineIndex || b.entry.colonIndex - a.entry.colonIndex);
    let changed = false;
    for (const { entry, targetColon } of work) {
      const next = rewriteLine(lines[entry.lineIndex], entry, targetColon);
      if (next !== lines[entry.lineIndex]) {
        lines[entry.lineIndex] = next;
        changed = true;
      }
    }
    if (!changed) {
      return null;
    }
    return joinLineRecords(records.map((record, i) => ({ ...record, content: lines[i] })));
  },
};
