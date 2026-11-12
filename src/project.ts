import path from "node:path";
import picomatch from "picomatch";
import type { ResolvedConfig } from "./config.js";
import { parseXs } from "./rules/transaction_model.js";
import type {
  FunctionIndexEntry,
  LintContext,
  ParsedFile,
  SourceFile,
} from "./rules/types.js";

export const TRANSACTION_RULE_IDS = [
  "transaction_boundaries",
  "transaction_stale_reads",
  "transaction_locks",
] as const;

type GlobMatcher = (rel: string) => boolean;

export function needsProjectIndex(config: ResolvedConfig): boolean {
  return TRANSACTION_RULE_IDS.some((id) => config.enabledRuleIds.has(id));
}

export function buildProjectIndex(
  files: SourceFile[],
  config: ResolvedConfig,
): LintContext {
  const matchers = config.callerTransaction.map((pattern) =>
    picomatch(pattern, { dot: true }),
  );
  const parsedByPath = new Map<string, ParsedFile>();
  const functions = new Map<string, FunctionIndexEntry>();
  const duplicateFunctionNames = new Set<string>();

  for (const file of files) {
    const parsed = parseXs(file.text);
    parsedByPath.set(file.path, parsed);
    const callerTransaction = pathMatches(file.path, config.configDir, matchers);
    for (const unit of parsed.units) {
      if (unit.kind !== "function" || unit.name === null) {
        continue;
      }
      if (duplicateFunctionNames.has(unit.name)) {
        continue;
      }
      if (functions.has(unit.name)) {
        functions.delete(unit.name);
        duplicateFunctionNames.add(unit.name);
        continue;
      }
      functions.set(unit.name, {
        opensTransaction: unit.statements.some(
          (stmt) => stmt.op === "db.transaction" && !stmt.inTest,
        ),
        callerTransaction,
      });
    }
  }

  return {
    isCallerTransaction(filePath: string): boolean {
      return pathMatches(filePath, config.configDir, matchers);
    },
    functions,
    duplicateFunctionNames,
    parsed(file: SourceFile): ParsedFile {
      const existing = parsedByPath.get(file.path);
      if (existing !== undefined) {
        return existing;
      }
      const parsed = parseXs(file.text);
      parsedByPath.set(file.path, parsed);
      return parsed;
    },
  };
}

function pathMatches(
  filePath: string,
  configDir: string,
  matchers: GlobMatcher[],
): boolean {
  if (matchers.length === 0) {
    return false;
  }
  const rel = posixRel(filePath, configDir);
  return matchers.some((match) => match(rel));
}

function posixRel(filePath: string, configDir: string): string {
  const resolved = path.resolve(configDir, filePath);
  const rel = path.relative(configDir, resolved);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return filePath.split(path.sep).join("/");
  }
  return rel.split(path.sep).join("/");
}
