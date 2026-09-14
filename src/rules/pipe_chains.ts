const COMPOUND_EQ = "!<>=+*/-";
export const ASSIGN = /^(\s*)([A-Za-z_][A-Za-z0-9_.]*)(\s*=\s*)(\S.*)$/;

export function skipQuoted(text: string, start: number, quote: '"' | "'"): number | null {
  let i = start + 1;
  let escape = false;
  while (i < text.length) {
    const ch = text[i];
    if (escape) {
      escape = false;
      i += 1;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      i += 1;
      continue;
    }
    if (ch === quote) {
      return i + 1;
    }
    i += 1;
  }
  return null;
}

export function isOpaque(text: string, i: number): boolean {
  return text.startsWith("```", i) || text.startsWith('"""', i) || text[i] === "`";
}

export interface WalkResult {
  depth: number;
  pipes: number[];
  skip: boolean;
}

export function walk(text: string, startDepth: number): WalkResult {
  let i = 0;
  let depth = startDepth;
  const pipes: number[] = [];
  while (i < text.length) {
    if (isOpaque(text, i) || text.startsWith("//", i)) {
      return { depth, pipes, skip: true };
    }
    const ch = text[i];
    if (ch === '"' || ch === "'") {
      const end = skipQuoted(text, i, ch);
      if (end === null) {
        return { depth, pipes, skip: true };
      }
      i = end;
      continue;
    }
    if (ch === "{" || ch === "[" || ch === "(") {
      depth += 1;
      i += 1;
      continue;
    }
    if (ch === "}" || ch === "]" || ch === ")") {
      depth -= 1;
      i += 1;
      continue;
    }
    if (ch === "|") {
      if (text[i + 1] === "|") {
        i += 2;
        continue;
      }
      if (depth === 0) {
        pipes.push(i);
      }
      i += 1;
      continue;
    }
    i += 1;
  }
  return { depth, pipes, skip: false };
}

export function matchingClose(text: string, open: number): number | null {
  let depth = 0;
  let i = open;
  while (i < text.length) {
    if (isOpaque(text, i) || text.startsWith("//", i)) {
      return null;
    }
    const ch = text[i];
    if (ch === '"' || ch === "'") {
      const end = skipQuoted(text, i, ch);
      if (end === null) {
        return null;
      }
      i = end;
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
        return i;
      }
      i += 1;
      continue;
    }
    i += 1;
  }
  return null;
}

export function splitChain(expr: string): { base: string; filters: string[] } | null {
  const scanned = walk(expr, 0);
  if (scanned.skip) {
    return null;
  }
  if (scanned.pipes.length === 0) {
    return { base: expr, filters: [] };
  }
  const filters = scanned.pipes.map((pos, index) => {
    const end = scanned.pipes[index + 1] ?? expr.length;
    return expr.slice(pos, end).trimEnd();
  });
  return { base: expr.slice(0, scanned.pipes[0]).trimEnd(), filters };
}

export function isCompoundEq(line: string, eqIndex: number): boolean {
  const prev = eqIndex > 0 ? line[eqIndex - 1] : "";
  if (prev !== "" && COMPOUND_EQ.includes(prev)) {
    return true;
  }
  return line[eqIndex + 1] === "=";
}

export function startsPipeLine(line: string): boolean {
  const trimmed = line.trimStart();
  return trimmed.startsWith("|") && !trimmed.startsWith("||");
}

function isMultilineBase(segments: string[]): boolean {
  return segments.slice(1).some((segment) => !startsPipeLine(segment));
}

export interface Span {
  closeLine: number;
  collapsed: string;
  skip: boolean;
  multilineBase: boolean;
}

export function collectSpan(lines: string[], openLine: number, rhs: string): Span | null {
  const segments: string[] = [];
  let depth = 0;
  let skip = false;
  let cur = openLine;
  let text = rhs;
  while (true) {
    const scanned = walk(text, depth);
    skip = skip || scanned.skip;
    depth = scanned.depth;
    segments.push(text);
    if (depth > 0) {
      cur += 1;
      if (cur >= lines.length) {
        return null;
      }
      text = lines[cur];
      continue;
    }
    const next = cur + 1;
    if (next < lines.length && startsPipeLine(lines[next])) {
      cur = next;
      text = lines[cur];
      continue;
    }
    break;
  }
  const collapsed = segments[0].trimEnd() + segments.slice(1).map((segment) => segment.trim()).join("");
  return {
    closeLine: cur,
    collapsed,
    skip,
    multilineBase: isMultilineBase(segments),
  };
}

export type LineMode = "code" | "fence" | "triple";

export function lineModeAfter(line: string, mode: LineMode): LineMode {
  if (mode === "fence") {
    return line.includes("```") ? "code" : "fence";
  }
  if (mode === "triple") {
    return line.includes('"""') ? "code" : "triple";
  }
  let i = 0;
  while (i < line.length) {
    if (line.startsWith("//", i)) {
      break;
    }
    if (line.startsWith("```", i)) {
      return "fence";
    }
    if (line.startsWith('"""', i)) {
      return "triple";
    }
    const ch = line[i];
    if (ch === '"' || ch === "'") {
      const end = skipQuoted(line, i, ch);
      if (end === null) {
        break;
      }
      i = end;
      continue;
    }
    i += 1;
  }
  return "code";
}

export function lineStartModes(lines: string[]): LineMode[] {
  const modes: LineMode[] = [];
  let mode: LineMode = "code";
  for (const line of lines) {
    modes.push(mode);
    mode = lineModeAfter(line, mode);
  }
  return modes;
}
