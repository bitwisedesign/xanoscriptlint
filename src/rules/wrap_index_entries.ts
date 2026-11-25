import { isSuppressed, parseSuppressions } from "../suppress.js";
import {
  lookbehindAssignment,
  offsetToLineCol,
  parseValue,
  renderInline,
  skipQuoted,
  skipSpan,
  type Node,
} from "./collapse_assignment_values.js";
import { joinLineRecords, splitLineRecords } from "./line_records.js";
import type { LineRecord } from "./line_records.js";
import type { Rule, RuleOptions, SourceFile, Violation } from "./types.js";
import { DEFAULT_WRAP_AT } from "./wrap_enum_values.js";
import { constantJsonWidth } from "./xano_json_width.js";

type ObjectNode = Extract<Node, { kind: "object" }>;
type ArrayNode = Extract<Node, { kind: "array" }>;

interface IndexItemSite {
  kind: "item" | "field";
  action: "wrap" | "collapse";
  openLine: number;
  openCol: number;
  width: number;
  item: ObjectNode;
}

function wrapThreshold(options: RuleOptions): number {
  return options.wrapAt ?? DEFAULT_WRAP_AT;
}

function leadingSpaces(line: string): number {
  const match = /^ */.exec(line);
  return match?.[0].length ?? 0;
}

function isMultiline(lines: string[], start: number, end: number): boolean {
  return offsetToLineCol(lines, start).line !== offsetToLineCol(lines, end - 1).line;
}

function fieldArrays(item: ObjectNode): ArrayNode[] {
  return item.entries.flatMap((entry) => (entry.value.kind === "array" ? [entry.value] : []));
}

function renderWrappedArray(node: ArrayNode, indent: number): string[] {
  const inner = indent + 2;
  const lines = ["["];
  for (const item of node.items) {
    lines.push(`${" ".repeat(inner)}${renderInline(item)}`);
  }
  lines.push(`${" ".repeat(indent)}]`);
  return lines;
}

function renderWrappedItem(item: ObjectNode, indent: number, wrapAt: number): string[] {
  const inner = indent + 2;
  const maxKey = Math.max(0, ...item.entries.map((entry) => entry.key.length));
  const lines = [`${" ".repeat(indent)}{`];
  for (const entry of item.entries) {
    const colon = `${entry.key}${" ".repeat(maxKey - entry.key.length)}:`;
    if (entry.value.kind === "array" && constantJsonWidth(entry.value) >= wrapAt) {
      const wrapped = renderWrappedArray(entry.value, inner);
      lines.push(`${" ".repeat(inner)}${colon} ${wrapped[0]}`);
      lines.push(...wrapped.slice(1));
    } else {
      lines.push(`${" ".repeat(inner)}${colon} ${renderInline(entry.value)}`);
    }
  }
  lines.push(`${" ".repeat(indent)}}`);
  return lines;
}

function skipBalanced(text: string, start: number): number | null {
  let depth = 0;
  let i = start;
  while (i < text.length) {
    if (text.startsWith("```", i) || text.startsWith('"""', i)) {
      const closer = text.startsWith("```", i) ? "```" : '"""';
      const end = skipSpan(text, i + closer.length, closer);
      if (end === null) {
        return null;
      }
      i = end;
      continue;
    }
    if (text.startsWith("//", i)) {
      const nl = text.indexOf("\n", i);
      i = nl === -1 ? text.length : nl;
      continue;
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
    if (ch === "{" || ch === "[") {
      depth += 1;
      i += 1;
      continue;
    }
    if (ch === "}" || ch === "]") {
      depth -= 1;
      i += 1;
      if (depth === 0) {
        return i;
      }
      continue;
    }
    i += 1;
  }
  return null;
}

function skipIndexTrivia(text: string, start: number): number {
  let i = start;
  while (i < text.length) {
    const ch = text[i];
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      i += 1;
      continue;
    }
    if (text.startsWith("//", i)) {
      const nl = text.indexOf("\n", i);
      i = nl === -1 ? text.length : nl;
      continue;
    }
    break;
  }
  return i;
}

function findIndexObjectItems(lines: string[]): ObjectNode[] {
  const text = lines.join("\n");
  const items: ObjectNode[] = [];
  let i = 0;
  while (i < text.length) {
    if (text.startsWith("```", i) || text.startsWith('"""', i)) {
      const closer = text.startsWith("```", i) ? "```" : '"""';
      const end = skipSpan(text, i + closer.length, closer);
      if (end === null) {
        break;
      }
      i = end;
      continue;
    }
    if (text.startsWith("//", i)) {
      const nl = text.indexOf("\n", i);
      i = nl === -1 ? text.length : nl;
      continue;
    }
    const ch = text[i];
    if (ch === '"' || ch === "'") {
      const end = skipQuoted(text, i, ch);
      if (end === null) {
        break;
      }
      i = end;
      continue;
    }
    if (ch === "[" && lookbehindAssignment(text, i) === "index") {
      i += 1;
      while (i < text.length) {
        i = skipIndexTrivia(text, i);
        if (i >= text.length) {
          break;
        }
        if (text[i] === "]") {
          i += 1;
          break;
        }
        if (text[i] === "{" || text[i] === "[") {
          const node = parseValue({ text, i });
          if (node !== null && node.kind === "object") {
            items.push(node);
            i = node.end;
            continue;
          }
          const skipped = skipBalanced(text, i);
          i = skipped ?? i + 1;
          continue;
        }
        i += 1;
      }
      continue;
    }
    i += 1;
  }
  return items;
}

function itemHasTab(text: string, item: ObjectNode): boolean {
  return text.slice(item.start, item.end).includes("\t");
}

function findIndexItemSites(lines: string[], wrapAt: number): IndexItemSite[] {
  const text = lines.join("\n");
  const sites: IndexItemSite[] = [];
  for (const item of findIndexObjectItems(lines)) {
    if (itemHasTab(text, item)) {
      continue;
    }
    const open = offsetToLineCol(lines, item.start);
    const multiline = isMultiline(lines, item.start, item.end);
    const width = constantJsonWidth(item);
    if (!multiline && width >= wrapAt) {
      sites.push({
        kind: "item",
        action: "wrap",
        openLine: open.line,
        openCol: open.col,
        width,
        item,
      });
    } else if (multiline && width < wrapAt) {
      sites.push({
        kind: "item",
        action: "collapse",
        openLine: open.line,
        openCol: open.col,
        width,
        item,
      });
    } else if (multiline) {
      for (const field of fieldArrays(item)) {
        const fieldWidth = constantJsonWidth(field);
        const fieldMulti = isMultiline(lines, field.start, field.end);
        const fieldOpen = offsetToLineCol(lines, field.start);
        if (!fieldMulti && fieldWidth >= wrapAt) {
          sites.push({
            kind: "field",
            action: "wrap",
            openLine: fieldOpen.line,
            openCol: fieldOpen.col,
            width: fieldWidth,
            item,
          });
        } else if (fieldMulti && fieldWidth < wrapAt) {
          sites.push({
            kind: "field",
            action: "collapse",
            openLine: fieldOpen.line,
            openCol: fieldOpen.col,
            width: fieldWidth,
            item,
          });
        }
      }
    }
  }
  return sites;
}

function locateItem(
  records: LineRecord[],
  item: ObjectNode,
): { openLine: number; closeLine: number; openCol: number; closeCol: number } | null {
  const lines = records.map((record) => record.content);
  const open = offsetToLineCol(lines, item.start);
  const close = offsetToLineCol(lines, item.end - 1);
  if (records[open.line] === undefined || records[close.line] === undefined) {
    return null;
  }
  return {
    openLine: open.line,
    closeLine: close.line,
    openCol: open.col,
    closeCol: close.col,
  };
}

function replaceItem(records: LineRecord[], item: ObjectNode, wrapAt: number, collapse: boolean): boolean {
  const span = locateItem(records, item);
  if (span === null) {
    return false;
  }
  const open = records[span.openLine];
  const close = records[span.closeLine];
  if (open === undefined || close === undefined) {
    return false;
  }
  const prefix = open.content.slice(0, span.openCol);
  const trailing = close.content.slice(span.closeCol + 1);
  const ending = open.ending === "" ? "\n" : open.ending;
  if (collapse) {
    records.splice(span.openLine, span.closeLine - span.openLine + 1, {
      content: `${prefix}${renderInline(item)}${trailing}`,
      ending: close.ending,
    });
    return true;
  }
  const wrapped = renderWrappedItem(item, leadingSpaces(`${prefix}{`), wrapAt);
  const inserted: LineRecord[] = wrapped.map((line, index) => {
    let content = line;
    if (index === 0) {
      content = `${prefix}${line.trimStart()}`;
    } else if (index === wrapped.length - 1) {
      content = `${line}${trailing}`;
    }
    return {
      content,
      ending: index === wrapped.length - 1 ? close.ending : ending,
    };
  });
  records.splice(span.openLine, span.closeLine - span.openLine + 1, ...inserted);
  return true;
}

function violationsFor(
  file: SourceFile,
  lines: string[],
  options: RuleOptions,
  severity: Violation["severity"],
): Violation[] {
  const wrapAt = wrapThreshold(options);
  const violations: Violation[] = [];
  for (const site of findIndexItemSites(lines, wrapAt)) {
    const target = site.action === "wrap" ? "wrapped" : "inline";
    const owner = site.kind === "item" ? "index entry" : "index field";
    violations.push({
      ruleId: wrapIndexEntries.id,
      message: `${owner} of JSON width ${site.width} must be ${target} (threshold ${wrapAt})`,
      severity,
      file: file.path,
      line: site.openLine + 1,
      column: site.openCol + 1,
    });
  }
  return violations;
}

export const wrapIndexEntries: Rule = {
  id: "wrap_index_entries",
  description:
    "Table index entries and their field arrays wrap when constant JSON width reaches 64 (Xano rewrites this on push)",
  defaultEnabled: false,
  defaultSeverity: "warning",
  numericOptions: ["wrap_at"],
  lint(file: SourceFile, options: RuleOptions): Violation[] {
    const severity = options.severity ?? wrapIndexEntries.defaultSeverity;
    const lines = splitLineRecords(file.text).map((record) => record.content);
    return violationsFor(file, lines, options, severity);
  },
  fix(file: SourceFile, options: RuleOptions): string | null {
    const suppressions = parseSuppressions(file.text);
    const rewriteLines = new Set(
      wrapIndexEntries
        .lint(file, options)
        .filter((violation) => !isSuppressed(suppressions, violation.line, wrapIndexEntries.id))
        .map((violation) => violation.line),
    );
    if (rewriteLines.size === 0) {
      return null;
    }
    const wrapAt = wrapThreshold(options);
    const records = splitLineRecords(file.text);
    const lines = records.map((record) => record.content);
    const sites = findIndexItemSites(lines, wrapAt)
      .filter((site) => rewriteLines.has(site.openLine + 1))
      .sort((a, b) => b.item.start - a.item.start);
    let changed = false;
    const seen = new Set<number>();
    for (const site of sites) {
      if (seen.has(site.item.start)) {
        continue;
      }
      seen.add(site.item.start);
      if (replaceItem(records, site.item, wrapAt, site.kind === "item" && site.action === "collapse")) {
        changed = true;
      }
    }
    if (!changed) {
      return null;
    }
    return joinLineRecords(records);
  },
};
