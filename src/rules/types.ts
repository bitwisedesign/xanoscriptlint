export type Severity = "error" | "warning";

export interface SourceFile {
  path: string;
  text: string;
}

export interface Violation {
  ruleId: string;
  message: string;
  severity: Severity;
  file: string;
  line: number;
  column: number;
}

export interface RuleOptions {
  severity?: Severity;
  wrapAt?: number;
  filterLimit?: number;
}

export interface Correction {
  ruleId: string;
  file: string;
  line: number;
}

export interface FixResult {
  text: string;
  appliedLines?: readonly number[];
}

export interface FunctionIndexEntry {
  opensTransaction: boolean;
  callerTransaction: boolean;
}

export interface LintContext {
  isCallerTransaction(filePath: string): boolean;
  functions: ReadonlyMap<string, FunctionIndexEntry>;
  parsed(file: SourceFile): ParsedFile;
}

export interface DataRange {
  startLine: number;
  endLine: number;
}

export interface Statement {
  op: string;
  arg: string | null;
  line: number;
  column: number;
  endLine: number;
  lock: boolean;
  singleReturn: boolean;
  varName: string | null;
  data: DataRange | null;
  txLines: number[];
  inTest: boolean;
}

export interface Unit {
  kind: string;
  name: string | null;
  line: number;
  endLine: number;
  statements: Statement[];
}

export interface ParsedFile {
  units: Unit[];
  statements: Statement[];
}

export interface Rule {
  id: string;
  description: string;
  defaultEnabled: boolean;
  defaultSeverity: Severity;
  numericOptions?: readonly string[];
  lint(file: SourceFile, options: RuleOptions, context?: LintContext): Violation[];
  fix?(file: SourceFile, options: RuleOptions): string | FixResult | null;
}
