import { isCommentLine } from "../util.js";

export interface LineDepths {
  starts: number[];
  after: number[];
}

export function lineStartDepths(lines: string[], literals: Set<number>): LineDepths {
  const starts: number[] = [];
  const after: number[] = [];
  let depth = 0;
  let mode: "code" | "double" | "single" = "code";
  let escape = false;
  for (let i = 0; i < lines.length; i += 1) {
    starts.push(depth);
    if (literals.has(i) || isCommentLine(lines[i])) {
      after.push(depth);
      continue;
    }
    const text = lines[i];
    let col = 0;
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
      if (ch === "{") {
        depth += 1;
        col += 1;
        continue;
      }
      if (ch === "}") {
        depth = Math.max(0, depth - 1);
        col += 1;
        continue;
      }
      col += 1;
    }
    after.push(depth);
  }
  return { starts, after };
}
