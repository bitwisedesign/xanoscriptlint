import { skipQuoted } from "./pipe_chains.js";

const NUMERIC_DEFAULT =
  /^(\s*(?:int|decimal)(?:\[\])?\??\s+[A-Za-z_][A-Za-z0-9_]*\??)(\s*=\s*)("[^"]*"|'[^']*'|[^\s{]+)/;

export interface NumericDefault {
  head: string;
  assign: string;
  value: string;
  valueStart: number;
  valueEnd: number;
}

export function matchNumericDefault(line: string): NumericDefault | null {
  const match = NUMERIC_DEFAULT.exec(line);
  if (match === null || match[1] === undefined || match[2] === undefined || match[3] === undefined) {
    return null;
  }
  const head = match[1];
  const assign = match[2];
  const value = match[3];
  const valueStart = head.length + assign.length;
  return {
    head,
    assign,
    value,
    valueStart,
    valueEnd: valueStart + value.length,
  };
}

export function unquote(value: string): { text: string; quoted: boolean } {
  const opener = value[0];
  if (
    (opener === '"' || opener === "'") &&
    value.length >= 2 &&
    value[value.length - 1] === opener
  ) {
    return { text: value.slice(1, -1), quoted: true };
  }
  return { text: value, quoted: false };
}

const NUMERIC_ZERO_LITERAL = /^[+-]?(?:0+(?:\.0*)?|\.0+)$/;

export function isNumericZeroLiteral(text: string): boolean {
  return NUMERIC_ZERO_LITERAL.test(text);
}

function unquotedIndex(line: string, token: string, from = 0): number {
  let col = from;
  while (col < line.length) {
    const ch = line[col];
    if (ch === "/" && line[col + 1] === "/") {
      return -1;
    }
    if (line.startsWith(token, col)) {
      return col;
    }
    if (ch === '"' || ch === "'") {
      const end = skipQuoted(line, col, ch);
      if (end === null) {
        return -1;
      }
      col = end;
      continue;
    }
    col += 1;
  }
  return -1;
}

function openerOnCodeLine(line: string): "fence" | "triple" | null {
  const fenceAt = unquotedIndex(line, "```");
  const tripleAt = unquotedIndex(line, '"""');
  if (fenceAt === -1 && tripleAt === -1) {
    return null;
  }
  if (tripleAt !== -1 && (fenceAt === -1 || tripleAt < fenceAt)) {
    if (unquotedIndex(line, '"""', tripleAt + 3) !== -1) {
      return null;
    }
    return "triple";
  }
  if (unquotedIndex(line, "```", fenceAt + 3) !== -1) {
    return null;
  }
  return "fence";
}

export function literalLines(lines: string[]): Set<number> {
  const literal = new Set<number>();
  let mode: "code" | "fence" | "triple" = "code";

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (mode !== "code") {
      const closer = mode === "fence" ? "```" : '"""';
      if (unquotedIndex(line, closer) !== -1) {
        mode = "code";
      } else {
        literal.add(i);
      }
      continue;
    }

    const opened = openerOnCodeLine(line);
    if (opened !== null) {
      mode = opened;
    }
  }

  return literal;
}
