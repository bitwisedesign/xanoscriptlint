import { isSuppressed, parseSuppressions } from "../suppress.js";
import {
  byteLength,
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
import { literalLines } from "./numeric_declarations.js";
import { lineStartDepths } from "./block_depths.js";
import { startsPipeLine } from "./pipe_chains.js";
import { DEFAULT_WRAP_AT } from "./wrap_enum_values.js";
import { renderPipedAssignment } from "./wrap_piped_values.js";
import type { FixResult, Rule, RuleOptions, SourceFile, Violation } from "./types.js";
import { expressionObjectWidth } from "./xano_json_width.js";

type ObjectNode = Extract<Node, { kind: "object" }>;
type StatementKind = "var" | "var.update" | "expect";

const HAZARD =
  "value object with a `0` followed by another key: Xano fences this object, and the fenced value drops keys";
const VAR_MESSAGE = `${HAZARD}; rewrite as a one-line seed under 64 bytes plus |set: for the remaining fields`;
const EXPECT_MESSAGE = `${HAZARD}; an expect cannot take |set:; replace it with one scalar path expect per key`;
const NUMBER = /^-?(?:\d+\.?\d*|\.\d+)$/;
const PLAIN_PATH = /^\$[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/;
const ZERO_LITERAL = /^0(?:\.0+)?$/;
const VAR_UPDATE = /^var\.update\b/;
const VAR = /^var\s+\$/;
const EXPECT = /^expect\.[A-Za-z_][A-Za-z0-9_]*\b/;

interface LayoutSite {
  statement: StatementKind;
  openLine: number;
  closeLine: number;
  openCol: number;
  prefix: string;
  trailing: string;
  indent: number;
  hasTab: boolean;
  node: ObjectNode | null;
}

function statementKind(line: string): StatementKind | null {
  const trimmed = line.trimStart();
  if (VAR_UPDATE.test(trimmed)) {
    return "var.update";
  }
  if (VAR.test(trimmed)) {
    return "var";
  }
  if (EXPECT.test(trimmed)) {
    return "expect";
  }
  return null;
}

function enclosingOpenerLine(
  depths: ReturnType<typeof lineStartDepths>,
  line: number,
): number | null {
  const target = depths.starts[line];
  if (target === undefined || target <= 0) {
    return null;
  }
  for (let i = line; i >= 0; i -= 1) {
    const starts = depths.starts[i];
    const after = depths.after[i];
    if (starts === target - 1 && after !== undefined && after > starts) {
      return i;
    }
  }
  return null;
}

function valueStatementKind(
  lines: string[],
  depths: ReturnType<typeof lineStartDepths>,
  line: number,
): StatementKind | null {
  const own = statementKind(lines[line] ?? "");
  if (own !== null) {
    return own;
  }
  const opener = enclosingOpenerLine(depths, line);
  if (opener === null) {
    return null;
  }
  return statementKind(lines[opener] ?? "");
}

function restOfLineIsBlank(text: string, from: number): boolean {
  for (let i = from; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "\n") {
      return true;
    }
    if (ch !== " " && ch !== "\t" && ch !== "\r") {
      return false;
    }
  }
  return true;
}

function closerAloneOnLine(text: string, closerStart: number): boolean {
  let lineStart = closerStart;
  while (lineStart > 0 && text[lineStart - 1] !== "\n") {
    lineStart -= 1;
  }
  for (let i = lineStart; i < closerStart; i += 1) {
    const ch = text[i];
    if (ch !== " " && ch !== "\t" && ch !== "\r") {
      return false;
    }
  }
  return restOfLineIsBlank(text, closerStart + 3);
}

function lineHasTab(lines: string[], startLine: number, endLine: number): boolean {
  for (let i = startLine; i <= endLine; i += 1) {
    if (lines[i]?.includes("\t")) {
      return true;
    }
  }
  return false;
}

function firstNonBlankChar(text: string): string {
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch !== " " && ch !== "\t" && ch !== "\n" && ch !== "\r") {
      return ch;
    }
  }
  return "";
}

function parseFenceObject(body: string): ObjectNode | null {
  const cursor = { text: body.trim(), i: 0 };
  const node = parseValue(cursor, true);
  if (node === null || node.kind !== "object") {
    return null;
  }
  while (cursor.i < cursor.text.length) {
    const ch = cursor.text[cursor.i];
    if (ch !== " " && ch !== "\t") {
      return null;
    }
    cursor.i += 1;
  }
  return node;
}

function followedByPipe(
  text: string,
  end: number,
  lines: string[],
  closeLine: number,
): boolean {
  let i = end;
  while (i < text.length && (text[i] === " " || text[i] === "\t")) {
    i += 1;
  }
  if (text[i] === "|") {
    return text[i + 1] !== "|";
  }
  const next = lines[closeLine + 1];
  return next !== undefined && startsPipeLine(next);
}

function leadingSpaces(line: string): number {
  const match = /^ */.exec(line);
  return match?.[0].length ?? 0;
}

function isQuotedString(text: string): boolean {
  const quote = text[0];
  if (quote !== '"' && quote !== "'") {
    return false;
  }
  const end = skipQuoted(text, 0, quote);
  return end === text.length;
}

function isSeedable(node: Node): boolean {
  if (node.kind !== "scalar") {
    return false;
  }
  const text = node.text;
  if (isQuotedString(text)) {
    return true;
  }
  if (text.includes("|")) {
    return false;
  }
  return (
    text === "true" ||
    text === "false" ||
    text === "null" ||
    NUMBER.test(text) ||
    PLAIN_PATH.test(text)
  );
}

function isSettable(node: Node): boolean {
  if (node.kind === "object") {
    return node.entries.every((entry) => isSettable(entry.value));
  }
  if (node.kind === "array") {
    return node.items.every((item) => isSettable(item));
  }
  return isSeedable(node);
}

function hasFilter(node: Node): boolean {
  if (node.kind === "object") {
    return node.entries.some((entry) => hasFilter(entry.value));
  }
  if (node.kind === "array") {
    return node.items.some((item) => hasFilter(item));
  }
  return !isQuotedString(node.text) && node.text.includes("|");
}

function isLiteralZero(node: Node): boolean {
  return node.kind === "scalar" && ZERO_LITERAL.test(node.text);
}

function hasZeroFollowedByKey(node: ObjectNode): boolean {
  for (let i = 0; i < node.entries.length - 1; i += 1) {
    const value = node.entries[i]?.value;
    if (value !== undefined && isLiteralZero(value)) {
      return true;
    }
  }
  return false;
}

function quotedKeyToken(key: string): '"' | "'" | null {
  const quote = key[0];
  if (quote !== '"' && quote !== "'") {
    return null;
  }
  if (key.length < 2 || key[key.length - 1] !== quote) {
    return null;
  }
  const end = skipQuoted(key, 0, quote);
  return end === key.length ? quote : null;
}

function keyValue(key: string): string | null {
  const quote = quotedKeyToken(key);
  if (quote === '"') {
    try {
      const parsed: unknown = JSON.parse(key);
      return typeof parsed === "string" ? parsed : null;
    } catch {
      return null;
    }
  }
  if (quote === "'") {
    return key.slice(1, -1);
  }
  return key;
}

function setKey(key: string): string | null {
  const value = keyValue(key);
  if (value === null || value.includes(".")) {
    return null;
  }
  if (quotedKeyToken(key) !== null) {
    return key;
  }
  return JSON.stringify(key);
}

function buildRewrite(
  node: ObjectNode,
  wrapAt: number,
): { collapsed: string; filters: string[] } | null {
  const seed: ObjectNode["entries"] = [];
  let index = 0;
  for (; index < node.entries.length; index += 1) {
    const entry = node.entries[index];
    if (entry === undefined || !isSeedable(entry.value)) {
      break;
    }
    const candidate: ObjectNode = {
      kind: "object",
      entries: [...seed, entry],
      start: 0,
      end: 0,
    };
    if (expressionObjectWidth(candidate, "upper") >= wrapAt) {
      break;
    }
    seed.push(entry);
  }
  const rest = node.entries.slice(index);
  const filters: string[] = [];
  for (const entry of rest) {
    const key = setKey(entry.key);
    if (key === null || !isSettable(entry.value)) {
      return null;
    }
    filters.push(`|set:${key}:${renderInline(entry.value)}`);
  }
  const seedNode: ObjectNode = { kind: "object", entries: seed, start: 0, end: 0 };
  return { collapsed: `${renderInline(seedNode)}${filters.join("")}`, filters };
}

function lineCommentEnd(text: string, i: number): number {
  const nl = text.indexOf("\n", i);
  return nl === -1 ? text.length : nl;
}

function objectClose(text: string, open: number): number | null {
  let depth = 0;
  let i = open;
  while (i < text.length) {
    if (text.startsWith("```", i) || text.startsWith('"""', i)) {
      return null;
    }
    if (text.startsWith("//", i)) {
      i = lineCommentEnd(text, i);
      continue;
    }
    const ch = text[i];
    if (ch === '"' || ch === "'") {
      const quotedEnd = skipQuoted(text, i, ch);
      if (quotedEnd === null) {
        return null;
      }
      i = quotedEnd;
      continue;
    }
    if (ch === "{" || ch === "[") {
      depth += 1;
      i += 1;
      continue;
    }
    if (ch === "}" || ch === "]") {
      depth -= 1;
      if (depth === 0) {
        return ch === "}" ? i : null;
      }
      i += 1;
      continue;
    }
    i += 1;
  }
  return null;
}

function stripLineComments(text: string): string | null {
  let out = "";
  let i = 0;
  while (i < text.length) {
    if (text.startsWith("//", i)) {
      i = lineCommentEnd(text, i);
      continue;
    }
    const ch = text[i];
    if (ch === '"' || ch === "'") {
      const quotedEnd = skipQuoted(text, i, ch);
      if (quotedEnd === null) {
        return null;
      }
      out += text.slice(i, quotedEnd);
      i = quotedEnd;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

function parseObjectAt(
  text: string,
  start: number,
  fieldFilters: boolean,
): ObjectNode | null {
  const node = parseValue({ text, i: start }, fieldFilters);
  return node !== null && node.kind === "object" ? node : null;
}

function commentedObject(text: string, start: number): { end: number; node: ObjectNode } | null {
  const close = objectClose(text, start);
  if (close === null) {
    return null;
  }
  const stripped = stripLineComments(text.slice(start, close + 1));
  if (stripped === null) {
    return null;
  }
  const node = parseObjectAt(stripped, 0, true);
  if (node === null) {
    return null;
  }
  return { end: close + 1, node };
}

function nativeLayoutSite(
  lines: string[],
  text: string,
  depths: ReturnType<typeof lineStartDepths>,
  start: number,
  end: number,
  check: ObjectNode,
  node: ObjectNode | null,
): LayoutSite | null {
  const open = offsetToLineCol(lines, start);
  const close = offsetToLineCol(lines, end - 1);
  const trailing = lines[close.line]?.slice(close.col + 1) ?? "";
  const prefix = lines[open.line]?.slice(0, open.col) ?? "";
  const statement = valueStatementKind(lines, depths, open.line);
  const multiline = open.line !== close.line;
  const oneLineWidth =
    statement === "expect"
      ? byteLength(prefix) + byteLength(renderInline(check)) + byteLength(trailing)
      : expressionObjectWidth(check, "upper");
  if (
    statement === null ||
    followedByPipe(text, end, lines, close.line) ||
    !hasZeroFollowedByKey(check) ||
    (!multiline && oneLineWidth < DEFAULT_WRAP_AT)
  ) {
    return null;
  }
  return {
    statement,
    openLine: open.line,
    closeLine: close.line,
    openCol: open.col,
    prefix,
    trailing,
    indent: leadingSpaces(lines[open.line] ?? ""),
    hasTab: lineHasTab(lines, open.line, close.line),
    node,
  };
}

function findLayoutSites(lines: string[]): LayoutSite[] {
  const text = lines.join("\n");
  const depths = lineStartDepths(lines, literalLines(lines));
  const sites: LayoutSite[] = [];
  let i = 0;
  while (i < text.length) {
    if (text.startsWith("```", i)) {
      const end = skipSpan(text, i + 3, "```");
      if (end === null) {
        break;
      }
      const owner = lookbehindAssignment(text, i);
      if (
        owner === "value" &&
        restOfLineIsBlank(text, i + 3) &&
        closerAloneOnLine(text, end - 3) &&
        firstNonBlankChar(text.slice(i + 3, end - 3)) === "{"
      ) {
        const open = offsetToLineCol(lines, i);
        const close = offsetToLineCol(lines, end - 3);
        const statement = valueStatementKind(lines, depths, open.line);
        if (
          statement !== null &&
          !followedByPipe(text, end, lines, close.line)
        ) {
          sites.push({
            statement,
            openLine: open.line,
            closeLine: close.line,
            openCol: open.col,
            prefix: lines[open.line]?.slice(0, open.col) ?? "",
            trailing: lines[close.line]?.slice(close.col + 3) ?? "",
            indent: leadingSpaces(lines[open.line] ?? ""),
            hasTab: lineHasTab(lines, open.line, close.line),
            node: parseFenceObject(text.slice(i + 3, end - 3)),
          });
        }
      }
      i = end;
      continue;
    }
    if (text.startsWith('"""', i)) {
      const end = skipSpan(text, i + 3, '"""');
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
      const quotedEnd = skipQuoted(text, i, ch);
      if (quotedEnd === null) {
        break;
      }
      i = quotedEnd;
      continue;
    }
    if (ch === "{" || ch === "[") {
      const owner = lookbehindAssignment(text, i);
      if (owner === "value") {
        const node = parseValue({ text, i }, true);
        if (node !== null && (node.kind === "object" || node.kind === "array")) {
          if (node.kind === "object") {
            const site = nativeLayoutSite(lines, text, depths, node.start, node.end, node, node);
            if (site !== null) {
              sites.push(site);
            }
          }
          i = node.end;
          continue;
        }
        if (ch === "{") {
          const fallback = commentedObject(text, i);
          if (fallback !== null) {
            const site = nativeLayoutSite(
              lines,
              text,
              depths,
              i,
              fallback.end,
              fallback.node,
              null,
            );
            if (site !== null) {
              sites.push(site);
            }
            i = fallback.end;
            continue;
          }
        }
      }
    }
    i += 1;
  }
  return sites;
}

function eligible(site: LayoutSite): boolean {
  return !site.hasTab;
}

function messageFor(kind: StatementKind): string {
  return kind === "expect" ? EXPECT_MESSAGE : VAR_MESSAGE;
}

function rewriteLines(site: LayoutSite, wrapAt: number): string[] | null {
  if (site.statement === "expect" || site.node === null || hasFilter(site.node)) {
    return null;
  }
  const inline = `${site.prefix}${renderInline(site.node)}${site.trailing}`;
  if (expressionObjectWidth(site.node, "upper") < wrapAt) {
    return [inline];
  }
  const rewrite = buildRewrite(site.node, wrapAt);
  if (rewrite === null) {
    return null;
  }
  if (rewrite.filters.length === 0) {
    return [`${site.prefix}${rewrite.collapsed}${site.trailing}`];
  }
  const canonical = renderPipedAssignment(site.prefix, rewrite.collapsed, site.indent);
  if (canonical === null || canonical.length === 0) {
    return null;
  }
  const last = canonical.length - 1;
  return canonical.map((line, index) =>
    index === last ? `${line}${site.trailing}` : line,
  );
}

function violationsFor(
  file: SourceFile,
  lines: string[],
  severity: Violation["severity"],
): Violation[] {
  const violations: Violation[] = [];
  for (const site of findLayoutSites(lines)) {
    if (!eligible(site)) {
      continue;
    }
    violations.push({
      ruleId: zeroObjectLiteralLayout.id,
      message: messageFor(site.statement),
      severity,
      file: file.path,
      line: site.openLine + 1,
      column: site.openCol + 1,
    });
  }
  return violations;
}

function replaceSite(records: LineRecord[], site: LayoutSite): boolean {
  const rewritten = rewriteLines(site, DEFAULT_WRAP_AT);
  if (rewritten === null) {
    return false;
  }
  const firstEnding = records[site.openLine]?.ending;
  const lastEnding = records[site.closeLine]?.ending;
  if (firstEnding === undefined || lastEnding === undefined) {
    return false;
  }
  const inserted: LineRecord[] = rewritten.map((content, index) => ({
    content,
    ending:
      index === rewritten.length - 1 ? lastEnding : firstEnding === "" ? "\n" : firstEnding,
  }));
  records.splice(site.openLine, site.closeLine - site.openLine + 1, ...inserted);
  return true;
}

export const zeroObjectLiteralLayout: Rule = {
  id: "zero_object_literal_layout",
  description:
    "var / var.update / expect value objects with a 0 followed by another key, or any fenced object value (Xano fences the object, and the fenced value drops keys)",
  defaultEnabled: false,
  defaultSeverity: "error",
  lint(file: SourceFile, options: RuleOptions): Violation[] {
    const severity = options.severity ?? zeroObjectLiteralLayout.defaultSeverity;
    const lines = splitLineRecords(file.text).map((record) => record.content);
    return violationsFor(file, lines, severity);
  },
  fix(file: SourceFile, options: RuleOptions): FixResult | null {
    const suppressions = parseSuppressions(file.text);
    const rewriteLinesSet = new Set(
      zeroObjectLiteralLayout
        .lint(file, options)
        .filter(
          (violation) =>
            !isSuppressed(suppressions, violation.line, zeroObjectLiteralLayout.id),
        )
        .map((violation) => violation.line),
    );
    if (rewriteLinesSet.size === 0) {
      return null;
    }
    const records = splitLineRecords(file.text);
    const lines = records.map((record) => record.content);
    const sites = findLayoutSites(lines)
      .filter((site) => eligible(site) && rewriteLinesSet.has(site.openLine + 1))
      .sort((a, b) => b.openLine - a.openLine);
    const appliedLines: number[] = [];
    for (const site of sites) {
      if (replaceSite(records, site)) {
        appliedLines.push(site.openLine + 1);
      }
    }
    if (appliedLines.length === 0) {
      return null;
    }
    return { text: joinLineRecords(records), appliedLines };
  },
};
