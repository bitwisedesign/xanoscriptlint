const MOCK_OPEN = /^mock\s*=\s*\{/;

export interface MockEntry {
  lineIndex: number;
  keyStart: number;
  key: string;
  colonIndex: number;
  valueStart: number;
  valueEndLine: number;
  valueEndCol: number;
  fenced: boolean;
}

export interface MockBlock {
  entries: MockEntry[];
  multiKeyLine: boolean;
}

export interface LineRecord {
  content: string;
  ending: string;
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

function skipSpaces(line: string, start: number): number {
  let i = start;
  while (i < line.length && (line[i] === " " || line[i] === "\t")) {
    i += 1;
  }
  return i;
}

function lastEntry(block: MockBlock): MockEntry | undefined {
  return block.entries[block.entries.length - 1];
}

export function findMockBlocks(lines: string[]): MockBlock[] {
  const blocks: MockBlock[] = [];
  let mode: "code" | "double" | "single" | "fence" | "comment" = "code";
  let escape = false;
  const stack: Array<"{" | "["> = [];
  let block: MockBlock | null = null;

  const finishBlock = (): void => {
    if (block) {
      blocks.push(block);
      block = null;
    }
    stack.length = 0;
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
          const entry = block ? lastEntry(block) : undefined;
          if (entry?.fenced) {
            entry.valueEndLine = i;
            entry.valueEndCol = col;
          }
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
        if (ch === '"' && stack.length === 1 && block) {
          const colonIndex = skipSpaces(line, parsed.end);
          if (line[colonIndex] === ":") {
            if (block.entries.some((entry) => entry.lineIndex === i)) {
              block.multiKeyLine = true;
            }
            const valueStart = skipSpaces(line, colonIndex + 1);
            const fenced = line.startsWith("```", valueStart);
            block.entries.push({
              lineIndex: i,
              keyStart: col,
              key: parsed.text,
              colonIndex,
              valueStart,
              valueEndLine: i,
              valueEndCol: valueStart,
              fenced,
            });
            if (fenced) {
              mode = "fence";
              col = valueStart + 3;
              continue;
            }
            col = valueStart;
            continue;
          }
        }
        col = parsed.end;
        continue;
      }

      if (stack.length === 0) {
        const atBoundary = col === 0 || !isWordChar(line[col - 1]);
        if (atBoundary) {
          const match = MOCK_OPEN.exec(line.slice(col));
          if (match) {
            stack.push("{");
            block = { entries: [], multiKeyLine: false };
            col += match[0].length;
            continue;
          }
        }
        col += 1;
        continue;
      }

      if (ch === "{" || ch === "[") {
        stack.push(ch);
        col += 1;
        continue;
      }

      if (ch === "}" || ch === "]") {
        const open = ch === "}" ? "{" : "[";
        if (stack[stack.length - 1] === open) {
          stack.pop();
          const entry = block ? lastEntry(block) : undefined;
          if (stack.length === 1 && entry && !entry.fenced) {
            entry.valueEndLine = i;
            entry.valueEndCol = col;
          }
          if (stack.length === 0) {
            finishBlock();
          }
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

export function splitLineRecords(text: string): LineRecord[] {
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

export function joinLineRecords(records: LineRecord[]): string {
  return records.map((record) => `${record.content}${record.ending}`).join("");
}
