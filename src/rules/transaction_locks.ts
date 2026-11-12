import { splitLines } from "../util.js";
import { dataText, textHasVarRef } from "./transaction_model.js";
import type { LintContext, Rule, RuleOptions, SourceFile, Statement, Violation } from "./types.js";

const WRITE_OPS = new Set(["db.edit", "db.patch", "db.add_or_edit"]);

export const transactionLocks: Rule = {
  id: "transaction_locks",
  description:
    "an unlocked db.get or single db.query whose variable feeds a later write of that table needs lock = true",
  defaultEnabled: false,
  defaultSeverity: "error",
  lint(file: SourceFile, options: RuleOptions, context?: LintContext): Violation[] {
    const severity = options.severity ?? transactionLocks.defaultSeverity;
    if (context === undefined) {
      return [];
    }
    const parsed = context.parsed(file);
    const lines = splitLines(file.text);
    const violations: Violation[] = [];
    const scopes = parsed.units.length > 0
      ? parsed.units
      : [{ statements: parsed.statements }];
    for (const unit of scopes) {
      const live = unit.statements.filter((stmt) => !stmt.inTest);
      const unlocked: Statement[] = [];
      const locked: Statement[] = [];
      const reported = new Set<Statement>();
      for (const stmt of live) {
        if (isUnlockableRead(stmt) && stmt.lock && stmt.arg !== null) {
          locked.push(stmt);
        }
        if (isUnlockableRead(stmt) && !stmt.lock && stmt.varName !== null && stmt.arg !== null) {
          unlocked.push(stmt);
        }
        if (!WRITE_OPS.has(stmt.op) || stmt.arg === null || stmt.data === null) {
          continue;
        }
        const body = dataText(lines, stmt.data);
        for (const read of unlocked) {
          if (reported.has(read) || read.arg !== stmt.arg || read.line >= stmt.line) {
            continue;
          }
          if (read.varName === null || !textHasVarRef(body, read.varName)) {
            continue;
          }
          const lockedBetween = locked.some(
            (lock) =>
              lock.arg === stmt.arg && read.line < lock.line && lock.line < stmt.line,
          );
          if (lockedBetween) {
            continue;
          }
          reported.add(read);
          violations.push({
            ruleId: transactionLocks.id,
            message: `unlocked read of ${read.arg} as $${read.varName} is used in ${stmt.op} data on line ${stmt.line + 1}; add lock = true`,
            severity,
            file: file.path,
            line: read.line + 1,
            column: read.column,
          });
        }
      }
    }
    return violations;
  },
};

function isUnlockableRead(stmt: Statement): boolean {
  if (stmt.op === "db.get") {
    return true;
  }
  return stmt.op === "db.query" && stmt.singleReturn;
}
