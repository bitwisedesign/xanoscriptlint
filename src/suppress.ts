import { isBlankLine, isCommentLine, splitLines } from "./util.js";

export interface SuppressionIndex {
  regionDisabled: Map<number, Set<string>>;
  nextDisabled: Map<number, Set<string>>;
  previousDisabled: Map<number, Set<string>>;
}

const DIRECTIVE =
  /^\/\/\s*xanoscriptlint:(disable|enable)(?::(next|previous))?(?:\s+(.*))?$/;

export function parseSuppressions(text: string): SuppressionIndex {
  const lines = splitLines(text);
  const regionDisabled = new Map<number, Set<string>>();
  const nextDisabled = new Map<number, Set<string>>();
  const previousDisabled = new Map<number, Set<string>>();
  const active = new Set<string>();

  for (let i = 0; i < lines.length; i += 1) {
    const lineNo = i + 1;
    const trimmed = lines[i].trim();
    const directive = parseDirective(trimmed);
    if (directive && !directive.scope) {
      if (directive.action === "disable") {
        for (const id of directive.ids) {
          active.add(id);
        }
      } else {
        for (const id of directive.ids) {
          active.delete(id);
        }
      }
    }
    regionDisabled.set(lineNo, new Set(active));
  }

  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    const directive = parseDirective(trimmed);
    if (!directive || !directive.scope) {
      continue;
    }
    if (directive.scope === "next") {
      const target = nextCodeLine(lines, i + 1);
      if (target !== undefined) {
        addAll(nextDisabled, target, directive.ids);
      }
    } else {
      const target = previousCodeLine(lines, i - 1);
      if (target !== undefined) {
        addAll(previousDisabled, target, directive.ids);
      }
    }
  }

  return { regionDisabled, nextDisabled, previousDisabled };
}

export function isSuppressed(
  index: SuppressionIndex,
  line: number,
  ruleId: string,
): boolean {
  if (index.regionDisabled.get(line)?.has(ruleId)) {
    return true;
  }
  if (index.nextDisabled.get(line)?.has(ruleId)) {
    return true;
  }
  if (index.previousDisabled.get(line)?.has(ruleId)) {
    return true;
  }
  return false;
}

function parseDirective(trimmed: string): {
  action: "disable" | "enable";
  scope?: "next" | "previous";
  ids: string[];
} | null {
  if (!isCommentLine(trimmed)) {
    return null;
  }
  const match = DIRECTIVE.exec(trimmed);
  if (!match) {
    return null;
  }
  const action = match[1] as "disable" | "enable";
  const scope = match[2] as "next" | "previous" | undefined;
  const ids = (match[3] ?? "")
    .split(/[,\s]+/)
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
  if (ids.length === 0) {
    return null;
  }
  if (action === "enable" && scope) {
    return null;
  }
  return { action, scope, ids };
}

function nextCodeLine(lines: string[], start: number): number | undefined {
  for (let i = start; i < lines.length; i += 1) {
    if (isBlankLine(lines[i]) || isCommentLine(lines[i])) {
      continue;
    }
    return i + 1;
  }
  return undefined;
}

function previousCodeLine(lines: string[], start: number): number | undefined {
  for (let i = start; i >= 0; i -= 1) {
    if (isBlankLine(lines[i]) || isCommentLine(lines[i])) {
      continue;
    }
    return i + 1;
  }
  return undefined;
}

function addAll(map: Map<number, Set<string>>, line: number, ids: string[]): void {
  const set = map.get(line) ?? new Set<string>();
  for (const id of ids) {
    set.add(id);
  }
  map.set(line, set);
}
