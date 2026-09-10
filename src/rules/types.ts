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
}

export interface Correction {
  ruleId: string;
  file: string;
  line: number;
}

export interface Rule {
  id: string;
  description: string;
  defaultEnabled: boolean;
  defaultSeverity: Severity;
  numericOptions?: readonly string[];
  lint(file: SourceFile, options: RuleOptions): Violation[];
  fix?(file: SourceFile, options: RuleOptions): string | null;
}
