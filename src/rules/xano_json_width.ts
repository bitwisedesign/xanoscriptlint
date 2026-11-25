import { isBlankLine, isCommentLine } from "../util.js";

export type WidthNode =
  | { kind: "object"; entries: { key: string; value: WidthNode }[] }
  | { kind: "array"; items: WidthNode[] }
  | { kind: "scalar"; text: string };

export type JsonWidthBound = "upper" | "lower";

const EXPRESSION_OBJECT_OWNERS = new Set(["input", "value", "data", "response", "mock"]);
const NUMBER = /^-?(?:\d+\.?\d*|\.\d+)$/;
const ZERO_LITERAL = /^0(?:\.0+)?$/;

export function phpJsonString(value: string): string {
  let out = '"';
  for (const ch of value) {
    const cp = ch.codePointAt(0);
    if (cp === undefined) {
      continue;
    }
    if (ch === '"') {
      out += '\\"';
    } else if (ch === "\\") {
      out += "\\\\";
    } else if (ch === "/") {
      out += "\\/";
    } else if (ch === "\b") {
      out += "\\b";
    } else if (ch === "\f") {
      out += "\\f";
    } else if (ch === "\n") {
      out += "\\n";
    } else if (ch === "\r") {
      out += "\\r";
    } else if (ch === "\t") {
      out += "\\t";
    } else if (cp < 0x20) {
      out += `\\u${cp.toString(16).padStart(4, "0")}`;
    } else if (cp > 0xffff) {
      const offset = cp - 0x10000;
      const hi = 0xd800 + (offset >> 10);
      const lo = 0xdc00 + (offset & 0x3ff);
      out += `\\u${hi.toString(16)}\\u${lo.toString(16)}`;
    } else if (cp > 0x7f) {
      out += `\\u${cp.toString(16).padStart(4, "0")}`;
    } else {
      out += ch;
    }
  }
  return `${out}"`;
}

function stripQuotes(text: string): string | null {
  const quote = text[0];
  if (quote === '"' && text.length >= 2) {
    try {
      const parsed: unknown = JSON.parse(text);
      return typeof parsed === "string" ? parsed : null;
    } catch {
      return null;
    }
  }
  if (quote === "'" && text.length >= 2 && text[text.length - 1] === "'") {
    return text.slice(1, -1).replace(/\\'/g, "'").replace(/\\\\/g, "\\");
  }
  return null;
}

export function unquoteKey(key: string): string {
  return stripQuotes(key) ?? key;
}

function encodeConstantScalar(text: string): string {
  if (NUMBER.test(text) || text === "true" || text === "false" || text === "null") {
    return text;
  }
  const stripped = stripQuotes(text);
  if (stripped !== null) {
    return phpJsonString(stripped);
  }
  return phpJsonString(text);
}

function encodeConstant(node: WidthNode): string {
  if (node.kind === "object") {
    return `{${node.entries
      .map((entry) => `${phpJsonString(unquoteKey(entry.key))}:${encodeConstant(entry.value)}`)
      .join(",")}}`;
  }
  if (node.kind === "array") {
    return `[${node.items.map((item) => encodeConstant(item)).join(",")}]`;
  }
  return encodeConstantScalar(node.text);
}

export function constantJsonWidth(node: WidthNode): number {
  return encodeConstant(node).length;
}

interface EncodeOpts {
  unquoteNestedKeys: boolean;
  singleNestedScalars: boolean;
  emptyAsString: boolean;
}

function encodeExpression(node: WidthNode, depth: number, opts: EncodeOpts): string {
  if (node.kind === "object") {
    if (depth > 0 && node.entries.length === 0 && opts.emptyAsString) {
      return phpJsonString("{}");
    }
    return `{${node.entries
      .map((entry) => {
        const key = unquoteKey(entry.key);
        const encodedKey = depth > 0 && opts.unquoteNestedKeys ? key : phpJsonString(key);
        return `${encodedKey}:${encodeExpression(entry.value, depth + 1, opts)}`;
      })
      .join(",")}}`;
  }
  if (node.kind === "array") {
    if (depth > 0 && node.items.length === 0 && opts.emptyAsString) {
      return phpJsonString("[]");
    }
    return `[${node.items.map((item) => encodeExpression(item, depth + 1, opts)).join(",")}]`;
  }
  if (depth <= 1) {
    return phpJsonString(node.text);
  }
  if (opts.singleNestedScalars) {
    return encodeConstantScalar(node.text);
  }
  return phpJsonString(node.text);
}

export function expressionObjectWidth(node: WidthNode, bound: JsonWidthBound): number {
  if (bound === "upper") {
    return encodeExpression(node, 0, {
      unquoteNestedKeys: false,
      singleNestedScalars: false,
      emptyAsString: true,
    }).length;
  }
  return Math.min(
    encodeExpression(node, 0, {
      unquoteNestedKeys: false,
      singleNestedScalars: false,
      emptyAsString: false,
    }).length,
    encodeExpression(node, 0, {
      unquoteNestedKeys: true,
      singleNestedScalars: false,
      emptyAsString: false,
    }).length,
    encodeExpression(node, 0, {
      unquoteNestedKeys: false,
      singleNestedScalars: true,
      emptyAsString: false,
    }).length,
    encodeExpression(node, 0, {
      unquoteNestedKeys: true,
      singleNestedScalars: true,
      emptyAsString: false,
    }).length,
  );
}

function leadingSpaces(line: string): number {
  const match = /^ */.exec(line);
  return match?.[0].length ?? 0;
}

export function enclosingStatement(lines: string[], line: number, column = 0): string {
  const current = lines[line] ?? "";
  const prefix = current.slice(0, column).trim();
  if (prefix.includes("{") || (prefix.length > 0 && !/^[A-Za-z_][A-Za-z0-9_.]*\s*=/.test(prefix))) {
    return prefix;
  }
  const indent = leadingSpaces(current);
  for (let i = line; i >= 0; i -= 1) {
    const text = lines[i] ?? "";
    if (isBlankLine(text) || isCommentLine(text)) {
      continue;
    }
    if (leadingSpaces(text) < indent) {
      return text.trim();
    }
  }
  return current.trim();
}

export function isExpressionObjectOwner(owner: string, context: string): boolean {
  if (!EXPRESSION_OBJECT_OWNERS.has(owner)) {
    return false;
  }
  return !context.startsWith("expect.");
}

export function isLiteralZero(text: string): boolean {
  return ZERO_LITERAL.test(text);
}

export function hasZeroFollowedByKey(node: Extract<WidthNode, { kind: "object" }>): boolean {
  for (let i = 0; i < node.entries.length - 1; i += 1) {
    const value = node.entries[i]?.value;
    if (value?.kind === "scalar" && isLiteralZero(value.text)) {
      return true;
    }
  }
  return false;
}
