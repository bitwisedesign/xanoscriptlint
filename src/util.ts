import { realpathSync } from "node:fs";
import path from "node:path";

export function isCommentLine(line: string): boolean {
  return line.trimStart().startsWith("//");
}

export function isBlankLine(line: string): boolean {
  return line.trim().length === 0;
}

export function splitLines(text: string): string[] {
  return text.split(/\r?\n/);
}

export function lineNumberOfOffset(text: string, offset: number): {
  line: number;
  column: number;
} {
  let line = 1;
  let column = 1;
  for (let i = 0; i < offset && i < text.length; i += 1) {
    if (text[i] === "\n") {
      line += 1;
      column = 1;
    } else if (text[i] !== "\r") {
      column += 1;
    }
  }
  return { line, column };
}

export function isMainModule(argv1: string | undefined, modulePath: string): boolean {
  if (!argv1) {
    return false;
  }
  try {
    return realpathSync(argv1) === realpathSync(modulePath);
  } catch {
    return path.resolve(argv1) === path.resolve(modulePath);
  }
}
