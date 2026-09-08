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
}

export interface Rule {
  id: string;
  description: string;
  defaultEnabled: boolean;
  defaultSeverity: Severity;
  lint(file: SourceFile, options: RuleOptions): Violation[];
}
