import type { LintContext, Rule, RuleOptions, SourceFile, Statement, Violation } from "./types.js";

const WRITE_OPS = new Set(["db.edit", "db.patch", "db.del", "db.add_or_edit"]);
const READ_OPS = new Set(["db.get", "db.query"]);

export const transactionStaleReads: Rule = {
  id: "transaction_stale_reads",
  description:
    "a db.edit / db.patch / db.del / db.add_or_edit inside db.transaction must not rely on a read of that table from outside the transaction",
  defaultEnabled: false,
  defaultSeverity: "warning",
  lint(file: SourceFile, options: RuleOptions, context?: LintContext): Violation[] {
    const severity = options.severity ?? transactionStaleReads.defaultSeverity;
    if (context === undefined) {
      return [];
    }
    if (context.isCallerTransaction(file.path)) {
      return [];
    }
    const parsed = context.parsed(file);
    const violations: Violation[] = [];
    const reported = new Set<string>();
    const scopes = parsed.units.length > 0
      ? parsed.units
      : [{ statements: parsed.statements }];
    for (const unit of scopes) {
      const live = unit.statements.filter((stmt) => !stmt.inTest);
      const outsideReads = new Map<string, Statement>();
      for (const stmt of live) {
        if (READ_OPS.has(stmt.op) && stmt.arg !== null && stmt.txLines.length === 0) {
          if (!outsideReads.has(stmt.arg)) {
            outsideReads.set(stmt.arg, stmt);
          }
        }
      }
      const byTx = new Map<number, Statement[]>();
      for (const stmt of live) {
        const tx = stmt.txLines[stmt.txLines.length - 1];
        if (tx === undefined) {
          continue;
        }
        const group = byTx.get(tx) ?? [];
        group.push(stmt);
        byTx.set(tx, group);
      }
      for (const [tx, group] of byTx) {
        const reread = new Set<string>();
        for (const stmt of group) {
          if (READ_OPS.has(stmt.op) && stmt.arg !== null) {
            reread.add(stmt.arg);
          }
          if (!WRITE_OPS.has(stmt.op) || stmt.arg === null) {
            continue;
          }
          const prior = outsideReads.get(stmt.arg);
          if (prior === undefined || prior.line >= stmt.line) {
            continue;
          }
          if (reread.has(stmt.arg)) {
            continue;
          }
          const key = `${tx}:${stmt.arg}`;
          if (reported.has(key)) {
            continue;
          }
          reported.add(key);
          violations.push({
            ruleId: transactionStaleReads.id,
            message: `${stmt.op} ${stmt.arg} uses a read of ${stmt.arg} from outside this db.transaction; re-read it inside`,
            severity,
            file: file.path,
            line: stmt.line + 1,
            column: stmt.column,
          });
        }
      }
    }
    return violations;
  },
};
