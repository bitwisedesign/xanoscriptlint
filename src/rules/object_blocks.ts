export interface ObjectEntry {
  lineIndex: number;
  keyStart: number;
  key: string;
  colonIndex: number;
  valueStart: number;
  valueEndLine: number;
  valueEndCol: number;
  fenced: boolean;
  ownLine: boolean;
}

export interface ObjectBlock {
  ownLine: ObjectEntry[];
  inline: ObjectEntry[];
  owner: string | null;
  depth: number;
  inFunctionRun: boolean;
  functionRunId: number | null;
  openLine: number;
  closeLine: number;
}

interface Frame {
  kind: "{" | "[";
  ownLine: ObjectEntry[];
  inline: ObjectEntry[];
  align: boolean;
  owner: string | null;
  depth: number;
  inFunctionRun: boolean;
  functionRunId: number | null;
  openLine: number;
  lastAdded?: ObjectEntry;
  valueOf?: ObjectEntry;
}

interface Lookbehind {
  kind: "=" | ":" | "return";
  name: string | null;
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
  const valueStart = skipSpaces(line, colonIndex + 1);
  return {
    lineIndex,
    keyStart: start,
    key: parsed.key,
    colonIndex,
    valueStart,
    valueEndLine: lineIndex,
    valueEndCol: valueStart,
    fenced: line.startsWith("```", valueStart),
    ownLine,
  };
}

function currentObject(stack: Frame[]): Frame | undefined {
  const top = stack[stack.length - 1];
  return top?.kind === "{" ? top : undefined;
}

function runContext(stack: Frame[]): { inFunctionRun: boolean; functionRunId: number | null } {
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    if (stack[i].inFunctionRun) {
      return { inFunctionRun: true, functionRunId: stack[i].functionRunId };
    }
  }
  return { inFunctionRun: false, functionRunId: null };
}

function isFunctionRunBrace(line: string, braceCol: number): boolean {
  const prefix = line.slice(0, braceCol);
  return /\bfunction\.run\b/.test(prefix) && !prefix.includes("{");
}

function addEntry(frame: Frame, entry: ObjectEntry): void {
  if (entry.ownLine) {
    frame.ownLine.push(entry);
  } else {
    frame.inline.push(entry);
  }
  frame.lastAdded = entry;
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

function assignmentName(line: string, eqIndex: number): string | null {
  let end = eqIndex - 1;
  while (end >= 0 && (line[end] === " " || line[end] === "\t")) {
    end -= 1;
  }
  if (end < 0) {
    return null;
  }
  let start = end;
  while (start >= 0 && /[A-Za-z0-9_$.]/.test(line[start])) {
    start -= 1;
  }
  const token = line.slice(start + 1, end + 1);
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(token)) {
    return null;
  }
  return token;
}

function lookbehind(line: string, braceCol: number): Lookbehind | null {
  let i = braceCol - 1;
  while (i >= 0 && (line[i] === " " || line[i] === "\t")) {
    i -= 1;
  }
  if (i < 0) {
    return null;
  }
  if (line[i] === "=") {
    return { kind: "=", name: assignmentName(line, i) };
  }
  if (line[i] === ":") {
    return { kind: ":", name: null };
  }
  if (!/[A-Za-z0-9_]/.test(line[i])) {
    return null;
  }
  let start = i;
  while (start >= 0 && /[A-Za-z0-9_]/.test(line[start])) {
    start -= 1;
  }
  if (line.slice(start + 1, i + 1) === "return") {
    return { kind: "return", name: "return" };
  }
  return null;
}

function frameMeta(
  line: string,
  braceCol: number,
  stack: Frame[],
): { align: boolean; owner: string | null; depth: number } {
  const behind = lookbehind(line, braceCol);
  if (behind?.kind === "=") {
    return { align: true, owner: behind.name, depth: 0 };
  }
  if (behind?.kind === "return") {
    return { align: true, owner: "return", depth: 0 };
  }
  const parent = currentObject(stack);
  if (behind?.kind === ":" && parent?.align) {
    return { align: true, owner: parent.owner, depth: parent.depth + 1 };
  }
  return { align: false, owner: null, depth: 0 };
}

function closeTop(
  stack: Frame[],
  blocks: ObjectBlock[],
  lineIndex: number,
  col: number,
): void {
  const frame = stack.pop();
  if (frame === undefined) {
    return;
  }
  if (frame.valueOf) {
    frame.valueOf.valueEndLine = lineIndex;
    frame.valueOf.valueEndCol = col;
  }
  if (frame.kind !== "{" || !frame.align) {
    return;
  }
  if (frame.ownLine.length === 0 && frame.inline.length === 0) {
    return;
  }
  blocks.push({
    ownLine: frame.ownLine,
    inline: frame.inline,
    owner: frame.owner,
    depth: frame.depth,
    inFunctionRun: frame.inFunctionRun,
    functionRunId: frame.functionRunId,
    openLine: frame.openLine,
    closeLine: lineIndex,
  });
}

export function findObjectBlocks(lines: string[]): ObjectBlock[] {
  const blocks: ObjectBlock[] = [];
  let mode: "code" | "double" | "single" | "fence" | "triple" | "comment" = "code";
  let escape = false;
  let pendingFenced: ObjectEntry | null = null;
  const stack: Frame[] = [];
  let nextFunctionRunId = 0;

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
          if (pendingFenced) {
            pendingFenced.valueEndLine = i;
            pendingFenced.valueEndCol = col;
            pendingFenced = null;
          }
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
            atLineStart = false;
            if (entry.fenced) {
              mode = "fence";
              pendingFenced = entry;
              col = entry.valueStart + 3;
              continue;
            }
            col = entry.valueStart;
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
        const parent = currentObject(stack);
        const last = parent?.lastAdded;
        const valueOf = last && !last.fenced && last.valueStart === col ? last : undefined;
        const meta =
          ch === "{" ? frameMeta(line, col, stack) : { align: false, owner: null, depth: 0 };
        const isRun = ch === "{" && isFunctionRunBrace(line, col);
        const inherited = runContext(stack);
        stack.push({
          kind: ch,
          ownLine: [],
          inline: [],
          align: meta.align,
          owner: meta.owner,
          depth: meta.depth,
          inFunctionRun: isRun || inherited.inFunctionRun,
          functionRunId: isRun ? (nextFunctionRunId += 1) : inherited.functionRunId,
          openLine: i,
          valueOf,
        });
        col += 1;
        if (ch === "{") {
          const entry = tryInline(line, col, i, stack);
          if (entry !== null) {
            addEntry(stack[stack.length - 1], entry);
            if (entry.fenced) {
              mode = "fence";
              pendingFenced = entry;
              col = entry.valueStart + 3;
              continue;
            }
            col = entry.valueStart;
          }
        }
        continue;
      }

      if (ch === "}" || ch === "]") {
        const open = ch === "}" ? "{" : "[";
        if (stack[stack.length - 1]?.kind === open) {
          closeTop(stack, blocks, i, col);
        }
        col += 1;
        continue;
      }

      if (ch === ",") {
        col += 1;
        const entry = tryInline(line, col, i, stack);
        if (entry !== null) {
          addEntry(stack[stack.length - 1], entry);
          if (entry.fenced) {
            mode = "fence";
            pendingFenced = entry;
            col = entry.valueStart + 3;
            continue;
          }
          col = entry.valueStart;
        }
        continue;
      }

      col += 1;
    }
  }

  while (stack.length > 0) {
    closeTop(stack, blocks, Math.max(0, lines.length - 1), 0);
  }
  return blocks;
}
