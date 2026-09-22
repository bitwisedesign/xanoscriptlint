import { skipQuoted } from "./pipe_chains.js";

const FENCE = "```";
const TRIPLE = '"""';

export type LineMode = "code" | "fence" | "triple";

export interface IndentPlan {
  expected: (number | null)[];
  separator: (number | null)[];
  bodyOf: Map<number, number>;
  reliable: boolean;
}

interface Scan {
  delta: number;
  startsCloser: boolean;
  mode: LineMode;
  mismatch: boolean;
}

export function leadingSpaces(line: string): number {
  let i = 0;
  while (line[i] === " ") {
    i += 1;
  }
  return i;
}

function indentHasTab(line: string): boolean {
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === " ") {
      continue;
    }
    return ch === "\t";
  }
  return false;
}

function isPipeContinuation(line: string): boolean {
  const trimmed = line.trimStart();
  return trimmed.startsWith("|") && !trimmed.startsWith("||");
}

type Delimiter = "{" | "[" | "(";

const CLOSER_TO_OPENER: Record<"}" | "]" | ")", Delimiter> = {
  "}": "{",
  "]": "[",
  ")": "(",
};

interface ObjectFrame {
  kind: Delimiter;
  maxKey: number;
  flatten: boolean;
  openerIndent: number;
}

function nestOffset(stack: ObjectFrame[]): number {
  let count = 0;
  for (const frame of stack) {
    if (frame.flatten) {
      count += 1;
    }
  }
  return -2 * count;
}

function skipSpaces(text: string, start: number): number {
  let i = start;
  while (i < text.length && (text[i] === " " || text[i] === "\t")) {
    i += 1;
  }
  return i;
}

function nonSpaceBefore(line: string, index: number): number {
  let i = index - 1;
  while (i >= 0 && (line[i] === " " || line[i] === "\t")) {
    i -= 1;
  }
  return i;
}

function isColonBrace(line: string, brace: number): boolean {
  const i = nonSpaceBefore(line, brace);
  return i >= 0 && line[i] === ":";
}

function isAssignBrace(line: string, brace: number): boolean {
  const i = nonSpaceBefore(line, brace);
  if (i < 0 || line[i] !== "=") {
    return false;
  }
  const prev = i > 0 ? line[i - 1] : "";
  return prev === "" || !"!<>=+".includes(prev);
}

function isReturnBrace(line: string, brace: number): boolean {
  const i = nonSpaceBefore(line, brace);
  if (i < 5) {
    return false;
  }
  let start = i;
  while (start >= 0 && /[A-Za-z]/.test(line[start] ?? "")) {
    start -= 1;
  }
  return line.slice(start + 1, i + 1) === "return";
}

function readKey(text: string, start: number): { length: number; end: number } | null {
  const ch = text[start];
  if (ch === '"' || ch === "'") {
    const end = skipQuoted(text, start, ch);
    if (end === null) {
      return null;
    }
    return { length: end - start, end };
  }
  if (ch === undefined || !/[A-Za-z_]/.test(ch)) {
    return null;
  }
  let i = start + 1;
  while (i < text.length && /[A-Za-z0-9_.]/.test(text[i] ?? "")) {
    i += 1;
  }
  return { length: i - start, end: i };
}

function directKeyMax(lines: string[], line: number, braceCol: number): number | null {
  let max = 0;
  let depth = 1;
  let mode: LineMode = "code";
  let li = line;
  let i = braceCol + 1;
  while (li < lines.length) {
    const text = lines[li] ?? "";
    if (mode === "fence") {
      const closer = text.indexOf(FENCE);
      if (closer < 0) {
        li += 1;
        i = 0;
        continue;
      }
      mode = "code";
      i = closer + FENCE.length;
    } else if (mode === "triple") {
      const closer = text.indexOf(TRIPLE);
      if (closer < 0) {
        li += 1;
        i = 0;
        continue;
      }
      mode = "code";
      i = closer + TRIPLE.length;
    }
    while (i < text.length) {
      if (text.startsWith("//", i)) {
        break;
      }
      if (text.startsWith(FENCE, i)) {
        const closer = text.indexOf(FENCE, i + FENCE.length);
        if (closer < 0) {
          mode = "fence";
          break;
        }
        i = closer + FENCE.length;
        continue;
      }
      if (text.startsWith(TRIPLE, i)) {
        const closer = text.indexOf(TRIPLE, i + TRIPLE.length);
        if (closer < 0) {
          mode = "triple";
          break;
        }
        i = closer + TRIPLE.length;
        continue;
      }
      const ch = text[i];
      if (depth === 1 && (ch === '"' || ch === "'" || /[A-Za-z_]/.test(ch ?? ""))) {
        const key = readKey(text, i);
        if (key !== null) {
          const after = skipSpaces(text, key.end);
          if (text[after] === ":") {
            max = Math.max(max, key.length);
            i = after + 1;
            continue;
          }
        }
      }
      if (ch === '"' || ch === "'") {
        const end = skipQuoted(text, i, ch);
        if (end === null) {
          return null;
        }
        i = end;
        continue;
      }
      if (ch === " " || ch === "\t") {
        i += 1;
        continue;
      }
      if (ch === "{" || ch === "[" || ch === "(") {
        depth += 1;
        i += 1;
        continue;
      }
      if (ch === "}" || ch === "]" || ch === ")") {
        depth -= 1;
        if (depth === 0) {
          return max;
        }
        i += 1;
        continue;
      }
      i += 1;
    }
    li += 1;
    i = 0;
  }
  return null;
}

function parentKeyMax(stack: ObjectFrame[]): number {
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    const maxKey = stack[i]?.maxKey ?? -1;
    if (maxKey >= 0) {
      return maxKey;
    }
  }
  return -1;
}

function objectFrame(
  lines: string[],
  lineIndex: number,
  line: string,
  brace: number,
  stack: ObjectFrame[],
  openerIndent: number,
): ObjectFrame {
  const colon = isColonBrace(line, brace);
  const keyed = colon || isAssignBrace(line, brace) || isReturnBrace(line, brace);
  const maxKey = keyed ? (directKeyMax(lines, lineIndex, brace) ?? -1) : -1;
  const parent = parentKeyMax(stack);
  return {
    kind: "{",
    maxKey,
    flatten: colon && maxKey >= 0 && parent >= 0 && maxKey > parent,
    openerIndent,
  };
}

function enclosingOpenerIndent(stack: ObjectFrame[]): number | null {
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    const frame = stack[i];
    if (frame?.kind === "{") {
      return frame.openerIndent;
    }
  }
  return null;
}

function lineStartsWithCloser(line: string, mode: LineMode): boolean {
  if (mode !== "code") {
    return false;
  }
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === " " || ch === "\t") {
      continue;
    }
    if (line.startsWith("//", i) || line.startsWith(FENCE, i) || line.startsWith(TRIPLE, i)) {
      return false;
    }
    if (ch === '"' || ch === "'") {
      return false;
    }
    return ch === "}" || ch === "]" || ch === ")";
  }
  return false;
}

function scan(
  line: string,
  mode: LineMode,
  stack: ObjectFrame[],
  lines: string[],
  lineIndex: number,
  lineIndent: number,
): Scan {
  let i = 0;
  let delta = 0;
  let startsCloser = false;
  let seenCode = false;
  let openersOnLine = 0;
  let mismatch = false;
  if (mode === "fence") {
    const closer = line.indexOf(FENCE);
    if (closer < 0) {
      return { delta: 0, startsCloser: false, mode: "fence", mismatch };
    }
    i = closer + FENCE.length;
  } else if (mode === "triple") {
    const closer = line.indexOf(TRIPLE);
    if (closer < 0) {
      return { delta: 0, startsCloser: false, mode: "triple", mismatch };
    }
    i = closer + TRIPLE.length;
  }
  while (i < line.length) {
    if (line.startsWith("//", i)) {
      break;
    }
    if (line.startsWith(FENCE, i)) {
      const closer = line.indexOf(FENCE, i + FENCE.length);
      if (closer < 0) {
        return { delta, startsCloser, mode: "fence", mismatch };
      }
      i = closer + FENCE.length;
      continue;
    }
    if (line.startsWith(TRIPLE, i)) {
      const closer = line.indexOf(TRIPLE, i + TRIPLE.length);
      if (closer < 0) {
        return { delta, startsCloser, mode: "triple", mismatch };
      }
      i = closer + TRIPLE.length;
      continue;
    }
    const ch = line[i];
    if (ch === '"' || ch === "'") {
      const end = skipQuoted(line, i, ch);
      if (end === null) {
        break;
      }
      seenCode = true;
      i = end;
      continue;
    }
    if (ch === " " || ch === "\t") {
      i += 1;
      continue;
    }
    if (ch === "{" || ch === "[" || ch === "(") {
      const openerIndent = lineIndent + 2 * openersOnLine;
      if (ch === "{") {
        stack.push(objectFrame(lines, lineIndex, line, i, stack, openerIndent));
      } else {
        stack.push({ kind: ch, maxKey: -1, flatten: false, openerIndent });
      }
      openersOnLine += 1;
      delta += 1;
      seenCode = true;
      i += 1;
      continue;
    }
    if (ch === "}" || ch === "]" || ch === ")") {
      if (!seenCode) {
        startsCloser = true;
      }
      const top = stack[stack.length - 1];
      if (top === undefined || top.kind !== CLOSER_TO_OPENER[ch]) {
        mismatch = true;
      } else {
        stack.pop();
        if (openersOnLine > 0) {
          openersOnLine -= 1;
        }
      }
      delta -= 1;
      seenCode = true;
      i += 1;
      continue;
    }
    seenCode = true;
    i += 1;
  }
  return { delta, startsCloser, mode: "code", mismatch };
}

export function planIndent(lines: string[]): IndentPlan {
  const expected: (number | null)[] = new Array<number | null>(lines.length).fill(null);
  const separator: (number | null)[] = new Array<number | null>(lines.length).fill(null);
  const bodyOf = new Map<number, number>();
  let reliable = true;
  let depth = 0;
  let mode: LineMode = "code";
  let chainOffset = 0;
  let inChain = false;
  let chainDepth = 0;
  let prevExpected = 0;
  let opaqueOpen: number | null = null;
  const objects: ObjectFrame[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (indentHasTab(line)) {
      reliable = false;
    }
    const startMode = mode;
    if (startMode === "code") {
      const blank = line.trim().length === 0;
      const pipe = !blank && isPipeContinuation(line);
      if (inChain && !blank && (depth < chainDepth || (depth === chainDepth && !pipe))) {
        inChain = false;
        chainOffset = 0;
      }
      if (pipe && !inChain) {
        inChain = true;
        chainOffset = prevExpected + 2 - 2 * depth;
        chainDepth = depth;
      }
    }
    const nest = inChain ? 0 : nestOffset(objects);
    const lineIndent =
      2 * (depth - (lineStartsWithCloser(line, startMode) ? 1 : 0)) + chainOffset + nest;
    const scanned = scan(line, startMode, objects, lines, i, lineIndent);
    if (startMode === "code") {
      const blank = line.trim().length === 0;
      if (!blank) {
        const value = 2 * (depth - (scanned.startsCloser ? 1 : 0)) + chainOffset + nest;
        expected[i] = value;
        if (value < 0) {
          reliable = false;
        }
        prevExpected = value;
      } else {
        const openerIndent = enclosingOpenerIndent(objects);
        separator[i] =
          openerIndent === null ? Math.max(0, 2 * depth - 2 + chainOffset + nest) : Math.max(0, openerIndent);
      }
    }
    if (startMode === "code" && scanned.mode !== "code") {
      opaqueOpen = i;
    } else if (startMode !== "code" && scanned.mode === "code") {
      if (opaqueOpen !== null && opaqueOpen !== i) {
        bodyOf.set(opaqueOpen, i);
      }
      opaqueOpen = null;
    }
    depth += scanned.delta;
    if (depth < 0 || scanned.mismatch) {
      reliable = false;
    }
    mode = scanned.mode;
  }
  if (depth !== 0 || mode !== "code" || objects.length > 0) {
    reliable = false;
  }
  return { expected, separator, bodyOf, reliable };
}
