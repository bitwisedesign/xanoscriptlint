import type { Rule, RuleOptions, SourceFile, Violation } from "./types.js";
import { splitLines } from "../util.js";

const MOCK_OPEN = /^mock\s*=\s*\{/;

interface MockEntry {
  lineIndex: number;
  keyStart: number;
  key: string;
  colonIndex: number;
}

interface MockBlock {
  entries: MockEntry[];
  multiKeyLine: boolean;
}

function isWordChar(ch: string | undefined): boolean {
  return ch !== undefined && /[A-Za-z0-9_]/.test(ch);
}

function readQuoted(
  line: string,
  start: number,
  quote: '"' | "'",
): { text: string; end: number } | null {
  let i = start + 1;
  let escape = false;
  while (i < line.length) {
    if (escape) {
      escape = false;
      i += 1;
      continue;
    }
    if (line[i] === "\\") {
      escape = true;
      i += 1;
      continue;
    }
    if (line[i] === quote) {
      return { text: line.slice(start, i + 1), end: i + 1 };
    }
    i += 1;
  }
  return null;
}

function findMockBlocks(lines: string[]): MockBlock[] {
  const blocks: MockBlock[] = [];
  let mode: "code" | "double" | "single" | "fence" | "comment" = "code";
  let escape = false;
  let mockDepth = 0;
  let block: MockBlock | null = null;

  const finishBlock = (): void => {
    if (block) {
      blocks.push(block);
      block = null;
    }
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (mode === "comment") {
      mode = "code";
    }
    let col = 0;
    while (col < line.length) {
      const ch = line[col];

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

      if (mode === "fence") {
        if (ch === "`" && line.startsWith("```", col)) {
          mode = "code";
          col += 3;
          continue;
        }
        col += 1;
        continue;
      }

      if (ch === "`" && line.startsWith("```", col)) {
        mode = "fence";
        col += 3;
        continue;
      }

      if (ch === "/" && line[col + 1] === "/") {
        mode = "comment";
        break;
      }

      if (ch === '"' || ch === "'") {
        const parsed = readQuoted(line, col, ch);
        if (parsed === null) {
          mode = ch === '"' ? "double" : "single";
          break;
        }
        if (ch === '"' && mockDepth === 1 && block) {
          let look = parsed.end;
          while (look < line.length && (line[look] === " " || line[look] === "\t")) {
            look += 1;
          }
          if (line[look] === ":") {
            if (block.entries.some((entry) => entry.lineIndex === i)) {
              block.multiKeyLine = true;
            }
            block.entries.push({
              lineIndex: i,
              keyStart: col,
              key: parsed.text,
              colonIndex: look,
            });
            col = look + 1;
            continue;
          }
        }
        col = parsed.end;
        continue;
      }

      if (mockDepth === 0) {
        const atBoundary = col === 0 || !isWordChar(line[col - 1]);
        if (atBoundary) {
          const match = MOCK_OPEN.exec(line.slice(col));
          if (match) {
            mockDepth = 1;
            block = { entries: [], multiKeyLine: false };
            col += match[0].length;
            continue;
          }
        }
        col += 1;
        continue;
      }

      if (ch === "{") {
        mockDepth += 1;
        col += 1;
        continue;
      }
      if (ch === "}") {
        mockDepth -= 1;
        if (mockDepth === 0) {
          finishBlock();
        }
        col += 1;
        continue;
      }

      col += 1;
    }
  }

  finishBlock();
  return blocks;
}

function targetColonColumn(entries: MockEntry[]): number {
  return Math.max(...entries.map((entry) => entry.keyStart + entry.key.length));
}

function alignLine(line: string, entry: MockEntry, targetColon: number): string {
  const keyEnd = entry.keyStart + entry.key.length;
  const pad = Math.max(0, targetColon - keyEnd);
  return `${line.slice(0, keyEnd)}${" ".repeat(pad)}:${line.slice(entry.colonIndex + 1)}`;
}

interface LineRecord {
  content: string;
  ending: string;
}

function splitLineRecords(text: string): LineRecord[] {
  const records: LineRecord[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] !== "\n") {
      continue;
    }
    const crlf = i > start && text[i - 1] === "\r";
    records.push({
      content: text.slice(start, crlf ? i - 1 : i),
      ending: crlf ? "\r\n" : "\n",
    });
    start = i + 1;
  }
  records.push({ content: text.slice(start), ending: "" });
  return records;
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
    return records.map((record, i) => `${lines[i]}${record.ending}`).join("");
  },
};
