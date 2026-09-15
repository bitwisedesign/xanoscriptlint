export const DEFAULT_WRAP_AT = 64;

export const TAGS_OPENER = /^(\s*)tags\s*=\s*\[/;
export const VALUES_OPENER = /^(\s*)values\s*=\s*\[/;

export interface StringArraySite {
  kind: "inline" | "wrapped";
  indent: number;
  openLine: number;
  bracketLine: number;
  tokens: string[];
  compactLength: number;
  hasTab: boolean;
}

export function compactLength(tokens: string[]): number {
  return JSON.stringify(tokens).length;
}

export function wrapThreshold(wrapAt: number | undefined): number {
  return wrapAt ?? DEFAULT_WRAP_AT;
}

function readQuoted(
  text: string,
  start: number,
  quote: '"' | "'",
): { value: string; end: number } | null {
  let i = start + 1;
  let escape = false;
  let value = "";
  while (i < text.length) {
    const ch = text[i];
    if (escape) {
      value += ch;
      escape = false;
      i += 1;
      continue;
    }
    if (ch === "\\") {
      const next = text[i + 1];
      if (next === "n" || next === "t" || next === "r" || next === "u") {
        return null;
      }
      escape = true;
      i += 1;
      continue;
    }
    if (ch === quote) {
      return { value, end: i + 1 };
    }
    value += ch;
    i += 1;
  }
  return null;
}

export function parseStringArrayInner(inner: string): string[] | null {
  const tokens: string[] = [];
  let i = 0;
  while (i < inner.length) {
    const ch = inner[i];
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      i += 1;
      continue;
    }
    if (ch === "/" && inner[i + 1] === "/") {
      return null;
    }
    if (ch === ",") {
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const read = readQuoted(inner, i, ch);
      if (read === null) {
        return null;
      }
      tokens.push(read.value);
      i = read.end;
      continue;
    }
    return null;
  }
  return tokens;
}

export function findMatchingBracket(
  lines: string[],
  startLine: number,
  startCol: number,
): { line: number; col: number } | null {
  let mode: "code" | "double" | "single" = "code";
  let escape = false;
  let depth = 1;
  let line = startLine;
  let col = startCol + 1;
  while (line < lines.length) {
    const text = lines[line];
    while (col < text.length) {
      const ch = text[col];
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
      if (ch === "/" && text[col + 1] === "/") {
        break;
      }
      if (ch === '"') {
        mode = "double";
        col += 1;
        continue;
      }
      if (ch === "'") {
        mode = "single";
        col += 1;
        continue;
      }
      if (ch === "[") {
        depth += 1;
        col += 1;
        continue;
      }
      if (ch === "]") {
        depth -= 1;
        if (depth === 0) {
          return { line, col };
        }
        col += 1;
        continue;
      }
      col += 1;
    }
    line += 1;
    col = 0;
  }
  return null;
}

export function sliceRange(
  lines: string[],
  startLine: number,
  startCol: number,
  endLine: number,
  endCol: number,
): string {
  if (startLine === endLine) {
    return lines[startLine].slice(startCol, endCol);
  }
  const parts = [lines[startLine].slice(startCol)];
  for (let i = startLine + 1; i < endLine; i += 1) {
    parts.push(lines[i]);
  }
  parts.push(lines[endLine].slice(0, endCol));
  return parts.join("\n");
}

export function rangeHasTab(lines: string[], startLine: number, endLine: number): boolean {
  for (let i = startLine; i <= endLine; i += 1) {
    if (lines[i].includes("\t")) {
      return true;
    }
  }
  return false;
}

export function parseStringArraySite(
  lines: string[],
  openLine: number,
  indent: number,
  openCol: number,
  maxExclusiveLine?: number,
): StringArraySite | null {
  const close = findMatchingBracket(lines, openLine, openCol);
  if (close === null || (maxExclusiveLine !== undefined && close.line >= maxExclusiveLine)) {
    return null;
  }
  const trailing = lines[close.line].slice(close.col + 1);
  if (trailing.trim() !== "") {
    return null;
  }
  const inner = sliceRange(lines, openLine, openCol + 1, close.line, close.col);
  const tokens = parseStringArrayInner(inner);
  if (tokens === null) {
    return null;
  }
  return {
    kind: close.line === openLine ? "inline" : "wrapped",
    indent,
    openLine,
    bracketLine: close.line,
    tokens,
    compactLength: compactLength(tokens),
    hasTab: rangeHasTab(lines, openLine, close.line),
  };
}

export function inlineArrayLine(indent: string, name: string, tokens: string[]): string {
  return `${indent}${name} = [${tokens.map((token) => JSON.stringify(token)).join(", ")}]`;
}
