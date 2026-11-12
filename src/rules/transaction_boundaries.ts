import type { LintContext, Rule, RuleOptions, SourceFile, Statement, Violation } from "./types.js";

const MSG_LOCK_OUTSIDE = "`lock = true` must be inside `db.transaction`";
const MSG_NESTED_TX = "`db.transaction` must not nest inside another `db.transaction`";
const MSG_CALLEE_OPENS_TX = (name: string) =>
  `function.run "${name}" opens its own db.transaction`;
const MSG_HELPER_OPENS_TX = "caller-transaction file must not open db.transaction";
const MSG_HELPER_OUTSIDE_TX = (name: string) =>
  `function.run "${name}" must run inside db.transaction`;

export const transactionBoundaries: Rule = {
  id: "transaction_boundaries",
  description:
    "db.transaction and lock = true sit at the right boundary; caller-transaction callees are not run outside one",
  defaultEnabled: false,
  defaultSeverity: "error",
  lint(file: SourceFile, options: RuleOptions, context?: LintContext): Violation[] {
    const severity = options.severity ?? transactionBoundaries.defaultSeverity;
    if (context === undefined) {
      return [];
    }
    const parsed = context.parsed(file);
    const callerTx = context.isCallerTransaction(file.path);
    const violations: Violation[] = [];
    for (const stmt of parsed.statements) {
      if (stmt.inTest) {
        continue;
      }
      if (stmt.lock && stmt.txLines.length === 0 && !callerTx) {
        violations.push(hit(file, stmt, severity, MSG_LOCK_OUTSIDE));
      }
      if (stmt.op === "db.transaction" && stmt.txLines.length > 0) {
        violations.push(hit(file, stmt, severity, MSG_NESTED_TX));
      }
      if (stmt.op === "db.transaction" && callerTx) {
        violations.push(hit(file, stmt, severity, MSG_HELPER_OPENS_TX));
      }
      if (stmt.op === "function.run" && stmt.arg !== null) {
        const callee = context.functions.get(stmt.arg);
        const inTx = stmt.txLines.length > 0 || callerTx;
        if (inTx && callee?.opensTransaction) {
          violations.push(hit(file, stmt, severity, MSG_CALLEE_OPENS_TX(stmt.arg)));
        }
        if (!inTx && callee?.callerTransaction) {
          violations.push(hit(file, stmt, severity, MSG_HELPER_OUTSIDE_TX(stmt.arg)));
        }
      }
    }
    return violations;
  },
};

function hit(
  file: SourceFile,
  stmt: Statement,
  severity: Violation["severity"],
  message: string,
): Violation {
  return {
    ruleId: transactionBoundaries.id,
    message,
    severity,
    file: file.path,
    line: stmt.line + 1,
    column: stmt.column,
  };
}
