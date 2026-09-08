import path from "node:path";
import type { Correction, Violation } from "./rules/types.js";

export type ReporterName = "stylish" | "json";

export function formatReport(
  violations: Violation[],
  reporter: ReporterName,
  cwd: string,
): string {
  if (reporter === "json") {
    return formatJson(violations, cwd);
  }
  return formatStylish(violations, cwd);
}

function formatJson(violations: Violation[], cwd: string): string {
  const payload = violations.map((violation) => ({
    file: displayPath(violation.file, cwd),
    line: violation.line,
    column: violation.column,
    ruleId: violation.ruleId,
    severity: violation.severity,
    message: violation.message,
  }));
  return JSON.stringify(payload, null, 2);
}

function formatStylish(violations: Violation[], cwd: string): string {
  if (violations.length === 0) {
    return "";
  }
  const byFile = new Map<string, Violation[]>();
  for (const violation of violations) {
    const file = displayPath(violation.file, cwd);
    const list = byFile.get(file) ?? [];
    list.push(violation);
    byFile.set(file, list);
  }
  const sections: string[] = [];
  for (const [file, fileViolations] of byFile) {
    const lines = [file];
    for (const violation of fileViolations) {
      lines.push(
        `  ${violation.line}:${violation.column}  ${violation.severity.padEnd(7)}  ${violation.message}  ${violation.ruleId}`,
      );
    }
    sections.push(lines.join("\n"));
  }
  const errors = violations.filter((v) => v.severity === "error").length;
  const warnings = violations.length - errors;
  const problemWord = violations.length === 1 ? "problem" : "problems";
  const errorWord = errors === 1 ? "error" : "errors";
  const warningWord = warnings === 1 ? "warning" : "warnings";
  sections.push(
    `\n${violations.length} ${problemWord} (${errors} ${errorWord}, ${warnings} ${warningWord})`,
  );
  return sections.join("\n\n");
}

function displayPath(file: string, cwd: string): string {
  const rel = path.relative(cwd, file);
  if (rel.length > 0 && !rel.startsWith("..") && !path.isAbsolute(rel)) {
    return rel.split(path.sep).join("/");
  }
  return file;
}

export function formatFixSummary(corrections: Correction[], cwd: string): string {
  if (corrections.length === 0) {
    return "";
  }
  const byFile = new Map<string, Correction[]>();
  for (const correction of corrections) {
    const file = displayPath(correction.file, cwd);
    const list = byFile.get(file) ?? [];
    list.push(correction);
    byFile.set(file, list);
  }
  const sections: string[] = [];
  for (const [file, fileCorrections] of byFile) {
    const lines = [file];
    for (const correction of fileCorrections) {
      lines.push(`  ${correction.line}:1  Corrected  ${correction.ruleId}`);
    }
    sections.push(lines.join("\n"));
  }
  const violationWord = corrections.length === 1 ? "violation" : "violations";
  const fileWord = byFile.size === 1 ? "file" : "files";
  sections.push(`\nCorrected ${corrections.length} ${violationWord} in ${byFile.size} ${fileWord}`);
  return sections.join("\n\n");
}

export function applyStrict(violations: Violation[], strict: boolean): Violation[] {
  if (!strict) {
    return violations;
  }
  return violations.map((violation) => ({ ...violation, severity: "error" }));
}

export function exitCodeFor(violations: Violation[]): number {
  return violations.some((violation) => violation.severity === "error") ? 2 : 0;
}
