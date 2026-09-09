export interface ObjectEntry {
  lineIndex: number;
  keyStart: number;
  key: string;
  colonIndex: number;
  valueStart: number;
  ownLine: boolean;
}

export interface ObjectBlock {
  ownLine: ObjectEntry[];
  inline: ObjectEntry[];
}

interface Frame {
  kind: "{" | "[";
  ownLine: ObjectEntry[];
  inline: ObjectEntry[];
  align: boolean;
}

function isKeyStart(ch: string | undefined): boolean {
  return ch !== undefined && /[A-Za-z_$]/.test(ch);
}

function isKeyChar(ch: string | undefined): boolean {
  return ch !== undefined && /[A-Za-z0-9_.]/.test(ch);
}

function skipSpaces(line: string, start: number): number {
  let i = start;
  while (i < line.length && (line[i] === " " || line[i] === "\t")) {
    i += 1;
  }
  return i;
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

function parseKey(line: string, start: number): { key: string; end: number } | null {
  const opener = line[start];
  if (opener === '"' || opener === "'") {
    const quoted = readQuoted(line, start, opener);
    if (quoted === null) {
      return null;
    }
    return { key: quoted.text, end: quoted.end };
  }
  if (!isKeyStart(opener)) {
    return null;
  }
  let i = start + 1;
  while (i < line.length && isKeyChar(line[i])) {
    i += 1;
  }
  return { key: line.slice(start, i), end: i };
}

function parseEntry(
  line: string,
  start: number,
  lineIndex: number,
  ownLine: boolean,
): ObjectEntry | null {
  const parsed = parseKey(line, start);
  if (parsed === null) {
    return null;
  }
  const colonIndex = skipSpaces(line, parsed.end);
  if (line[colonIndex] !== ":") {
    return null;
  }
  return {
    lineIndex,
    keyStart: start,
    key: parsed.key,
    colonIndex,
    valueStart: skipSpaces(line, colonIndex + 1),
    ownLine,
  };
}

function currentObject(stack: Frame[]): Frame | undefined {
  const top = stack[stack.length - 1];
  return top?.kind === "{" ? top : undefined;
}

function addEntry(frame: Frame, entry: ObjectEntry): void {
  if (entry.ownLine) {
    frame.ownLine.push(entry);
  } else {
    frame.inline.push(entry);
  }
}

function tryInline(
  line: string,
  col: number,
  lineIndex: number,
  stack: Frame[],
): ObjectEntry | null {
  const frame = currentObject(stack);
  if (!frame?.align) {
    return null;
  }
  const start = skipSpaces(line, col);
  return parseEntry(line, start, lineIndex, false);
}

function precedingOpener(line: string, braceCol: number): "=" | ":" | "return" | null {
  let i = braceCol - 1;
  while (i >= 0 && (line[i] === " " || line[i] === "\t")) {
    i -= 1;
  }
  if (i < 0) {
    return null;
  }
  if (line[i] === "=") {
    return "=";
  }
  if (line[i] === ":") {
    return ":";
  }
  if (!/[A-Za-z0-9_]/.test(line[i])) {
    return null;
  }
  let start = i;
  while (start >= 0 && /[A-Za-z0-9_]/.test(line[start])) {
    start -= 1;
  }
  return line.slice(start + 1, i + 1) === "return" ? "return" : null;
}

function frameAligns(line: string, braceCol: number, stack: Frame[]): boolean {
  const kind = precedingOpener(line, braceCol);
  if (kind === "=" || kind === "return") {
    return true;
  }
  return kind === ":" && currentObject(stack)?.align === true;
}

function closeFrame(stack: Frame[], blocks: ObjectBlock[]): void {
  const frame = stack.pop();
  if (frame === undefined || frame.kind !== "{" || !frame.align) {
    return;
  }
  if (frame.ownLine.length === 0 && frame.inline.length === 0) {
    return;
  }
  blocks.push({ ownLine: frame.ownLine, inline: frame.inline });
}

export function findObjectBlocks(lines: string[]): ObjectBlock[] {
  const blocks: ObjectBlock[] = [];
  let mode: "code" | "double" | "single" | "fence" | "triple" | "comment" = "code";
  let escape = false;
  const stack: Frame[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (mode === "comment") {
      mode = "code";
    }
    let col = 0;
    let atLineStart = true;
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

      if (mode === "triple") {
        if (ch === '"' && line.startsWith('"""', col)) {
          mode = "code";
          col += 3;
          continue;
        }
        col += 1;
        continue;
      }

      if (ch === " " || ch === "\t") {
        col += 1;
        continue;
      }

      if (ch === "/" && line[col + 1] === "/") {
        mode = "comment";
        break;
      }

      if (atLineStart) {
        const frame = currentObject(stack);
        if (frame?.align) {
          const entry = parseEntry(line, col, i, true);
          if (entry !== null) {
            addEntry(frame, entry);
            col = entry.valueStart;
            atLineStart = false;
            continue;
          }
        }
        atLineStart = false;
      }

      if (ch === "`" && line.startsWith("```", col)) {
        mode = "fence";
        col += 3;
        continue;
      }

      if (ch === '"' && line.startsWith('"""', col)) {
        mode = "triple";
        col += 3;
        continue;
      }

      if (ch === '"' || ch === "'") {
        const parsed = readQuoted(line, col, ch);
        if (parsed === null) {
          mode = ch === '"' ? "double" : "single";
          break;
        }
        col = parsed.end;
        continue;
      }

      if (ch === "{" || ch === "[") {
        const align = ch === "{" && frameAligns(line, col, stack);
        stack.push({ kind: ch, ownLine: [], inline: [], align });
        col += 1;
        if (ch === "{") {
          const entry = tryInline(line, col, i, stack);
          if (entry !== null) {
            addEntry(stack[stack.length - 1], entry);
            col = entry.valueStart;
          }
        }
        continue;
      }

      if (ch === "}" || ch === "]") {
        const open = ch === "}" ? "{" : "[";
        if (stack[stack.length - 1]?.kind === open) {
          if (open === "{") {
            closeFrame(stack, blocks);
          } else {
            stack.pop();
          }
        }
        col += 1;
        continue;
      }

      if (ch === ",") {
        col += 1;
        const entry = tryInline(line, col, i, stack);
        if (entry !== null) {
          addEntry(stack[stack.length - 1], entry);
          col = entry.valueStart;
        }
        continue;
      }

      col += 1;
    }
  }

  while (stack.length > 0) {
    closeFrame(stack, blocks);
  }
  return blocks;
}
