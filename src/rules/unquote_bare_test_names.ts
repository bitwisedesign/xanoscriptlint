import { isSuppressed, parseSuppressions } from "../suppress.js";
import { isCommentLine } from "../util.js";
import { joinLineRecords, splitLineRecords } from "./line_records.js";
import { literalLines, unquote } from "./numeric_declarations.js";
import { findObjectBlocks } from "./object_blocks.js";
import type { Rule, RuleOptions, SourceFile, Violation } from "./types.js";

const BARE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const BLOCK_KEYWORDS = new Set(["input", "stack", "response", "test", "mock", "guid", "filters"]);
const QUOTED_TEST = /^(\s*test\s+)("[^"]*"|'[^']*')(\s*\{\s*)$/;

const TEST_MESSAGE = "quoted test name must be unquoted; Xano strips quotes on push";
const MOCK_MESSAGE = "quoted mock key must be unquoted; Xano strips quotes on push";

interface Hit {
  lineIndex: number;
  keyStart: number;
  keyEnd: number;
  replacement: string;
  kind: "test" | "mock";
}

function bareNameFromQuoted(quoted: string): string | null {
  const { text, quoted: isQuoted } = unquote(quoted);
  if (!isQuoted || !BARE_NAME.test(text) || BLOCK_KEYWORDS.has(text)) {
    return null;
  }
  return text;
}

function matchQuotedTest(line: string): { quoteStart: number; quoteEnd: number; bare: string } | null {
  const match = QUOTED_TEST.exec(line);
  if (match === null || match[1] === undefined || match[2] === undefined) {
    return null;
  }
  const quoted = match[2];
  const bare = bareNameFromQuoted(quoted);
  if (bare === null) {
    return null;
  }
  const quoteStart = match[1].length;
  return { quoteStart, quoteEnd: quoteStart + quoted.length, bare };
}

function collectHits(lines: string[]): Hit[] {
  const hits: Hit[] = [];
  const literals = literalLines(lines);

  for (let i = 0; i < lines.length; i += 1) {
    if (isCommentLine(lines[i]) || literals.has(i)) {
      continue;
    }
    const test = matchQuotedTest(lines[i]);
    if (test === null) {
      continue;
    }
    hits.push({
      lineIndex: i,
      keyStart: test.quoteStart,
      keyEnd: test.quoteEnd,
      replacement: test.bare,
      kind: "test",
    });
  }

  for (const block of findObjectBlocks(lines)) {
    if (block.owner !== "mock" || block.depth !== 0) {
      continue;
    }
    for (const entry of [...block.ownLine, ...block.inline]) {
      if (literals.has(entry.lineIndex) || isCommentLine(lines[entry.lineIndex])) {
        continue;
      }
      const bare = bareNameFromQuoted(entry.key);
      if (bare === null) {
        continue;
      }
      hits.push({
        lineIndex: entry.lineIndex,
        keyStart: entry.keyStart,
        keyEnd: entry.keyStart + entry.key.length,
        replacement: entry.ownLine ? `${bare}  ` : bare,
        kind: "mock",
      });
    }
  }

  hits.sort((a, b) => a.lineIndex - b.lineIndex || a.keyStart - b.keyStart);
  return hits;
}

function violationsFor(
  file: SourceFile,
  lines: string[],
  severity: Violation["severity"],
): Violation[] {
  return collectHits(lines).map((hit) => ({
    ruleId: unquoteBareTestNames.id,
    message: hit.kind === "test" ? TEST_MESSAGE : MOCK_MESSAGE,
    severity,
    file: file.path,
    line: hit.lineIndex + 1,
    column: hit.keyStart + 1,
  }));
}

export const unquoteBareTestNames: Rule = {
  id: "unquote_bare_test_names",
  description: "Quoted test names and top-level mock keys with no spaces must be unquoted",
  defaultEnabled: false,
  defaultSeverity: "warning",
  lint(file: SourceFile, options: RuleOptions): Violation[] {
    const severity = options.severity ?? unquoteBareTestNames.defaultSeverity;
    const lines = splitLineRecords(file.text).map((record) => record.content);
    return violationsFor(file, lines, severity);
  },
  fix(file: SourceFile, options: RuleOptions): string | null {
    const suppressions = parseSuppressions(file.text);
    const rewriteLines = new Set(
      unquoteBareTestNames
        .lint(file, options)
        .filter(
          (violation) => !isSuppressed(suppressions, violation.line, unquoteBareTestNames.id),
        )
        .map((violation) => violation.line),
    );
    if (rewriteLines.size === 0) {
      return null;
    }
    const records = splitLineRecords(file.text);
    const lines = records.map((record) => record.content);
    const work = collectHits(lines)
      .filter((hit) => rewriteLines.has(hit.lineIndex + 1))
      .sort((a, b) => b.lineIndex - a.lineIndex || b.keyStart - a.keyStart);
    if (work.length === 0) {
      return null;
    }
    let changed = false;
    for (const hit of work) {
      const line = lines[hit.lineIndex];
      const next = `${line.slice(0, hit.keyStart)}${hit.replacement}${line.slice(hit.keyEnd)}`;
      if (next !== line) {
        lines[hit.lineIndex] = next;
        changed = true;
      }
    }
    if (!changed) {
      return null;
    }
    return joinLineRecords(records.map((record, i) => ({ ...record, content: lines[i] })));
  },
};
