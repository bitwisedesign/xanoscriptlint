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

function openerOnCodeLine(line: string): "fence" | "triple" | null {
  const fenceAt = line.indexOf("```");
  const tripleAt = line.indexOf('"""');
  if (fenceAt === -1 && tripleAt === -1) {
    return null;
  }
  if (tripleAt !== -1 && (fenceAt === -1 || tripleAt < fenceAt)) {
    if (line.indexOf('"""', tripleAt + 3) !== -1) {
      return null;
    }
    return "triple";
  }
  if (line.indexOf("```", fenceAt + 3) !== -1) {
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
      if (line.includes(closer)) {
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
