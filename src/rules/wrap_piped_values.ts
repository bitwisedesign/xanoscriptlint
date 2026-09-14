import { isSuppressed, parseSuppressions } from "../suppress.js";
import { joinLineRecords, splitLineRecords } from "./line_records.js";
import type { LineRecord } from "./line_records.js";
import {
  ASSIGN,
  collectSpan,
  isCompoundEq,
  lineStartModes,
  matchingClose,
  skipQuoted,
  splitChain,
} from "./pipe_chains.js";
import type { Rule, RuleOptions, SourceFile, Violation } from "./types.js";

export const DEFAULT_PIPE_WRAP_AT = 34;
export const DEFAULT_FILTER_LIMIT = 3;

const FILTER_NAME = /^\|[A-Za-z_][A-Za-z0-9_]*:/;

interface PipeChainSite {
  openLine: number;
  closeLine: number;
  indent: number;
  owner: string;
  collapsed: string;
  pipeBytes: number;
  filterCount: number;
  eligible: boolean;
  canonical: string[];
}

function wrapThreshold(options: RuleOptions): number {
  return options.wrapAt ?? DEFAULT_PIPE_WRAP_AT;
}

function filterLimit(options: RuleOptions): number {
  return options.filterLimit ?? DEFAULT_FILTER_LIMIT;
}

function byteLength(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

function hasLambdaSigil(text: string): boolean {
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"' || ch === "'") {
      const end = skipQuoted(text, i, ch);
      if (end === null) {
        return false;
      }
      i = end;
      continue;
    }
    if (ch === "$" && text[i + 1] === "$") {
      return true;
    }
    i += 1;
  }
  return false;
}

function isGroupedBase(base: string): boolean {
  const trimmed = base.trim();
  return (
    trimmed.startsWith("(") ||
    (trimmed.startsWith("[") && trimmed !== "[]") ||
    (trimmed.startsWith("{") && trimmed !== "{}")
  );
}

function pipeBytesOf(filters: string[]): number {
  return filters.reduce((total, filter) => total + byteLength(filter), 0);
}

function shouldWrap(expr: string, wrapAt: number, limit: number): boolean {
  const split = splitChain(expr);
  if (split === null || split.filters.length === 0) {
    return false;
  }
  if (hasLambdaSigil(expr) || isGroupedBase(split.base)) {
    return false;
  }
  return pipeBytesOf(split.filters) >= wrapAt || split.filters.length >= limit;
}

function parenArg(filter: string): { prefix: string; inner: string } | null {
  const match = FILTER_NAME.exec(filter);
  if (match === null) {
    return null;
  }
  const open = match[0].length;
  if (filter[open] !== "(") {
    return null;
  }
  const close = matchingClose(filter, open);
  if (close === null || close !== filter.length - 1) {
    return null;
  }
  return { prefix: match[0], inner: filter.slice(open + 1, close) };
}

function renderFilter(
  filter: string,
  indent: number,
  wrapAt: number,
  limit: number,
): string[] {
  const pad = " ".repeat(indent);
  const arg = parenArg(filter);
  if (arg !== null && shouldWrap(arg.inner, wrapAt, limit)) {
    const inner = splitChain(arg.inner);
    if (inner !== null && inner.filters.length > 0) {
      const lines = [`${pad}${arg.prefix}(${inner.base}`];
      for (const nested of inner.filters) {
        lines.push(...renderFilter(nested, indent + 2, wrapAt, limit));
      }
      lines.push(`${pad})`);
      return lines;
    }
  }
  return [`${pad}${filter}`];
}

function renderCanonical(
  prefix: string,
  collapsed: string,
  indent: number,
  wrapAt: number,
  limit: number,
): string[] | null {
  const split = splitChain(collapsed);
  if (split === null || split.filters.length === 0) {
    return null;
  }
  if (!shouldWrap(collapsed, wrapAt, limit)) {
    return [`${prefix}${collapsed}`];
  }
  const lines = [`${prefix}${split.base.trimEnd()}`];
  for (const filter of split.filters) {
    lines.push(...renderFilter(filter, indent + 2, wrapAt, limit));
  }
  return lines;
}

function rangeHasTab(lines: string[], start: number, end: number): boolean {
  for (let i = start; i <= end; i += 1) {
    if (lines[i]?.includes("\t")) {
      return true;
    }
  }
  return false;
}

function findPipeChains(lines: string[], wrapAt: number, limit: number): PipeChainSite[] {
  const sites: PipeChainSite[] = [];
  const startModes = lineStartModes(lines);
  for (let i = 0; i < lines.length; i += 1) {
    if (startModes[i] !== "code") {
      continue;
    }
    const match = ASSIGN.exec(lines[i]);
    if (match === null || match[1] === undefined || match[2] === undefined || match[3] === undefined) {
      continue;
    }
    const eqIndex = match[1].length + match[2].length + match[3].indexOf("=");
    if (isCompoundEq(lines[i], eqIndex)) {
      continue;
    }
    const span = collectSpan(lines, i, match[4] ?? "");
    if (span === null) {
      continue;
    }
    const split = splitChain(span.collapsed);
    if (split === null || split.filters.length === 0) {
      i = span.closeLine;
      continue;
    }
    const prefix = `${match[1]}${match[2]}${match[3]}`;
    const eligible =
      !span.skip &&
      !span.multilineBase &&
      !rangeHasTab(lines, i, span.closeLine) &&
      !hasLambdaSigil(span.collapsed) &&
      !isGroupedBase(split.base);
    const canonical = eligible
      ? renderCanonical(prefix, span.collapsed, match[1].length, wrapAt, limit)
      : null;
    sites.push({
      openLine: i,
      closeLine: span.closeLine,
      indent: match[1].length,
      owner: match[2],
      collapsed: span.collapsed,
      pipeBytes: pipeBytesOf(split.filters),
      filterCount: split.filters.length,
      eligible,
      canonical: canonical ?? [],
    });
    i = span.closeLine;
  }
  return sites;
}

function actualLines(lines: string[], site: PipeChainSite): string[] {
  return lines.slice(site.openLine, site.closeLine + 1);
}

function sameLines(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((line, index) => line === right[index]);
}

function mismatchMessage(site: PipeChainSite, wrapAt: number, limit: number): string {
  const wantsWrap = shouldWrap(site.collapsed, wrapAt, limit);
  if (!wantsWrap) {
    return `${site.owner} piped value of pipe length ${site.pipeBytes} must be inline (threshold ${wrapAt})`;
  }
  if (site.pipeBytes < wrapAt) {
    return `${site.owner} piped value of ${site.filterCount} filters must be wrapped (limit ${limit})`;
  }
  return `${site.owner} piped value of pipe length ${site.pipeBytes} must be wrapped (threshold ${wrapAt})`;
}

function violationsFor(
  file: SourceFile,
  lines: string[],
  options: RuleOptions,
  severity: Violation["severity"],
): Violation[] {
  const wrapAt = wrapThreshold(options);
  const limit = filterLimit(options);
  const violations: Violation[] = [];
  for (const site of findPipeChains(lines, wrapAt, limit)) {
    if (!site.eligible || site.canonical.length === 0) {
      continue;
    }
    if (sameLines(actualLines(lines, site), site.canonical)) {
      continue;
    }
    violations.push({
      ruleId: wrapPipedValues.id,
      message: mismatchMessage(site, wrapAt, limit),
      severity,
      file: file.path,
      line: site.openLine + 1,
      column: site.indent + 1,
    });
  }
  return violations;
}

function replaceSite(records: LineRecord[], site: PipeChainSite): boolean {
  if (site.canonical.length === 0) {
    return false;
  }
  const firstEnding = records[site.openLine].ending;
  const lastEnding = records[site.closeLine].ending;
  const inserted: LineRecord[] = site.canonical.map((content, index) => ({
    content,
    ending: index === site.canonical.length - 1 ? lastEnding : firstEnding === "" ? "\n" : firstEnding,
  }));
  records.splice(site.openLine, site.closeLine - site.openLine + 1, ...inserted);
  return true;
}

export const wrapPipedValues: Rule = {
  id: "wrap_piped_values",
  description:
    "Assignment filter pipelines wrap when the pipe portion reaches 34 UTF-8 bytes or has 3+ filters (Xano rewrites this on push)",
  defaultEnabled: false,
  defaultSeverity: "warning",
  numericOptions: ["wrap_at", "filter_limit"],
  lint(file: SourceFile, options: RuleOptions): Violation[] {
    const severity = options.severity ?? wrapPipedValues.defaultSeverity;
    const lines = splitLineRecords(file.text).map((record) => record.content);
    return violationsFor(file, lines, options, severity);
  },
  fix(file: SourceFile, options: RuleOptions): string | null {
    const suppressions = parseSuppressions(file.text);
    const rewriteLines = new Set(
      wrapPipedValues
        .lint(file, options)
        .filter((violation) => !isSuppressed(suppressions, violation.line, wrapPipedValues.id))
        .map((violation) => violation.line),
    );
    if (rewriteLines.size === 0) {
      return null;
    }
    const records = splitLineRecords(file.text);
    const lines = records.map((record) => record.content);
    const wrapAt = wrapThreshold(options);
    const limit = filterLimit(options);
    const sites = findPipeChains(lines, wrapAt, limit)
      .filter((site) => site.eligible && rewriteLines.has(site.openLine + 1))
      .sort((a, b) => b.openLine - a.openLine);
    let changed = false;
    for (const site of sites) {
      if (replaceSite(records, site)) {
        changed = true;
      }
    }
    if (!changed) {
      return null;
    }
    return joinLineRecords(records);
  },
};
