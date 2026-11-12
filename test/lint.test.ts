import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { resolveConfig } from "../src/config.js";
import { lintFiles } from "../src/lint.js";
import { runCli } from "../src/cli.js";
import {
  CLEAN_XS,
  EMPTY_RUN_XS,
  collectStream,
  formattingOptInRules,
  withTempDir,
  writeXs,
} from "./support.js";

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

describe("fixture linting", () => {
  it("clean files have no default-on violations", () => {
    const config = resolveConfig({}, "/tmp", null);
    const violations = lintFiles([{ path: "clean.xs", text: CLEAN_XS }], config);
    assert.deepEqual(violations, []);
  });

  it("committed fixtures match expected findings when formatting rules are opted in", () => {
    const config = resolveConfig({ opt_in_rules: formattingOptInRules() }, fixtures, null);
    const clean = {
      path: path.join(fixtures, "clean/ok.xs"),
      text: readFileSync(path.join(fixtures, "clean/ok.xs"), "utf8"),
    };
    assert.deepEqual(lintFiles([clean], config), []);

    const emptyRun = {
      path: path.join(fixtures, "violations/empty_run.xs"),
      text: readFileSync(path.join(fixtures, "violations/empty_run.xs"), "utf8"),
    };
    assert.equal(
      lintFiles([emptyRun], config).some((v) => v.ruleId === "empty_function_run"),
      true,
    );

    const trailing = {
      path: path.join(fixtures, "violations/trailing_newline.xs"),
      text: readFileSync(path.join(fixtures, "violations/trailing_newline.xs"), "utf8"),
    };
    assert.equal(
      lintFiles([trailing], config).some((v) => v.ruleId === "no_trailing_newline"),
      true,
    );

    const objectColons = {
      path: path.join(fixtures, "violations/align_object_colons.xs"),
      text: readFileSync(path.join(fixtures, "violations/align_object_colons.xs"), "utf8"),
    };
    assert.equal(
      lintFiles([objectColons], config).some((v) => v.ruleId === "align_object_colons"),
      true,
    );

    const fenceValues = {
      path: path.join(fixtures, "violations/fence_multiline_values.xs"),
      text: readFileSync(path.join(fixtures, "violations/fence_multiline_values.xs"), "utf8"),
    };
    assert.equal(
      lintFiles([fenceValues], config).some((v) => v.ruleId === "fence_multiline_values"),
      true,
    );

    const zeroDefault = {
      path: path.join(fixtures, "violations/zero_numeric_default.xs"),
      text: readFileSync(path.join(fixtures, "violations/zero_numeric_default.xs"), "utf8"),
    };
    assert.equal(
      lintFiles([zeroDefault], config).some((v) => v.ruleId === "no_zero_numeric_default"),
      true,
    );

    const negativeDefault = {
      path: path.join(fixtures, "violations/quote_negative_numeric_default.xs"),
      text: readFileSync(
        path.join(fixtures, "violations/quote_negative_numeric_default.xs"),
        "utf8",
      ),
    };
    assert.equal(
      lintFiles([negativeDefault], config).some(
        (v) => v.ruleId === "quote_negative_numeric_default",
      ),
      true,
    );

    const wrapEnum = {
      path: path.join(fixtures, "violations/wrap_enum_values.xs"),
      text: readFileSync(path.join(fixtures, "violations/wrap_enum_values.xs"), "utf8"),
    };
    assert.equal(
      lintFiles([wrapEnum], config).some((v) => v.ruleId === "wrap_enum_values"),
      true,
    );

    const collapseAssign = {
      path: path.join(fixtures, "violations/collapse_assignment_values.xs"),
      text: readFileSync(path.join(fixtures, "violations/collapse_assignment_values.xs"), "utf8"),
    };
    assert.equal(
      lintFiles([collapseAssign], config).some((v) => v.ruleId === "collapse_assignment_values"),
      true,
    );

    const unfenceAssign = {
      path: path.join(fixtures, "violations/unfence_assignment_values.xs"),
      text: readFileSync(path.join(fixtures, "violations/unfence_assignment_values.xs"), "utf8"),
    };
    assert.equal(
      lintFiles([unfenceAssign], config).some((v) => v.ruleId === "unfence_assignment_values"),
      true,
    );

    const wrapPiped = {
      path: path.join(fixtures, "violations/wrap_piped_values.xs"),
      text: readFileSync(path.join(fixtures, "violations/wrap_piped_values.xs"), "utf8"),
    };
    assert.equal(
      lintFiles([wrapPiped], config).some((v) => v.ruleId === "wrap_piped_values"),
      true,
    );

    const wrapTags = {
      path: path.join(fixtures, "violations/wrap_tags_values.xs"),
      text: readFileSync(path.join(fixtures, "violations/wrap_tags_values.xs"), "utf8"),
    };
    assert.equal(
      lintFiles([wrapTags], config).some((v) => v.ruleId === "wrap_tags_values"),
      true,
    );

    const wrapAssignArrays = {
      path: path.join(fixtures, "violations/wrap_assignment_arrays.xs"),
      text: readFileSync(path.join(fixtures, "violations/wrap_assignment_arrays.xs"), "utf8"),
    };
    assert.equal(
      lintFiles([wrapAssignArrays], config).some((v) => v.ruleId === "wrap_assignment_arrays"),
      true,
    );

    const tagsPlacement = {
      path: path.join(fixtures, "violations/tags_placement.xs"),
      text: readFileSync(path.join(fixtures, "violations/tags_placement.xs"), "utf8"),
    };
    assert.equal(
      lintFiles([tagsPlacement], config).some((v) => v.ruleId === "tags_placement"),
      true,
    );

    const guidPlacement = {
      path: path.join(fixtures, "violations/guid_placement.xs"),
      text: readFileSync(path.join(fixtures, "violations/guid_placement.xs"), "utf8"),
    };
    assert.equal(
      lintFiles([guidPlacement], config).some((v) => v.ruleId === "guid_placement"),
      true,
    );

    const lockPlacement = {
      path: path.join(fixtures, "violations/lock_placement.xs"),
      text: readFileSync(path.join(fixtures, "violations/lock_placement.xs"), "utf8"),
    };
    assert.equal(
      lintFiles([lockPlacement], config).some((v) => v.ruleId === "lock_placement"),
      true,
    );

    const unquoteEnum = {
      path: path.join(fixtures, "violations/unquote_enum_defaults.xs"),
      text: readFileSync(path.join(fixtures, "violations/unquote_enum_defaults.xs"), "utf8"),
    };
    assert.equal(
      lintFiles([unquoteEnum], config).some((v) => v.ruleId === "unquote_enum_defaults"),
      true,
    );

    const unquoteBare = {
      path: path.join(fixtures, "violations/unquote_bare_test_names.xs"),
      text: readFileSync(path.join(fixtures, "violations/unquote_bare_test_names.xs"), "utf8"),
    };
    assert.equal(
      lintFiles([unquoteBare], config).some((v) => v.ruleId === "unquote_bare_test_names"),
      true,
    );

    const trailingComments = {
      path: path.join(fixtures, "violations/no_trailing_comments.xs"),
      text: readFileSync(path.join(fixtures, "violations/no_trailing_comments.xs"), "utf8"),
    };
    assert.equal(
      lintFiles([trailingComments], config).some((v) => v.ruleId === "no_trailing_comments"),
      true,
    );

    const reservedVar = {
      path: path.join(fixtures, "violations/reserved_var.xs"),
      text: readFileSync(path.join(fixtures, "violations/reserved_var.xs"), "utf8"),
    };
    assert.equal(
      lintFiles([reservedVar], config).some((v) => v.ruleId === "no_reserved_var"),
      true,
    );
  });

  it("committed indentation fixtures match when those rules are opted in", () => {
    const config = resolveConfig(
      { opt_in_rules: ["indentation", "separator_indentation"] },
      fixtures,
      null,
    );
    const clean = {
      path: path.join(fixtures, "clean/ok.xs"),
      text: readFileSync(path.join(fixtures, "clean/ok.xs"), "utf8"),
    };
    assert.deepEqual(lintFiles([clean], config), []);

    const indent = {
      path: path.join(fixtures, "violations/indentation.xs"),
      text: readFileSync(path.join(fixtures, "violations/indentation.xs"), "utf8"),
    };
    assert.equal(
      lintFiles([indent], config).some((v) => v.ruleId === "indentation"),
      true,
    );
    assert.equal(
      lintFiles([indent], config).some((v) => v.ruleId === "separator_indentation"),
      false,
    );

    const separator = {
      path: path.join(fixtures, "violations/separator_indentation.xs"),
      text: readFileSync(path.join(fixtures, "violations/separator_indentation.xs"), "utf8"),
    };
    assert.equal(
      lintFiles([separator], config).some((v) => v.ruleId === "separator_indentation"),
      true,
    );
    assert.equal(
      lintFiles([separator], config).some((v) => v.ruleId === "indentation"),
      false,
    );
  });

  it("committed statement_spacing fixtures match when that rule is opted in", () => {
    const config = resolveConfig({ opt_in_rules: ["statement_spacing"] }, fixtures, null);
    const clean = {
      path: path.join(fixtures, "clean/ok.xs"),
      text: readFileSync(path.join(fixtures, "clean/ok.xs"), "utf8"),
    };
    assert.deepEqual(lintFiles([clean], config), []);

    const spacing = {
      path: path.join(fixtures, "violations/statement_spacing.xs"),
      text: readFileSync(path.join(fixtures, "violations/statement_spacing.xs"), "utf8"),
    };
    assert.equal(
      lintFiles([spacing], config).some((v) => v.ruleId === "statement_spacing"),
      true,
    );
  });

  it("committed no_zero_set_filter fixture matches when that rule is opted in", () => {
    const config = resolveConfig({ opt_in_rules: ["no_zero_set_filter"] }, fixtures, null);
    const zeroSet = {
      path: path.join(fixtures, "violations/zero_set_filter.xs"),
      text: readFileSync(path.join(fixtures, "violations/zero_set_filter.xs"), "utf8"),
    };
    assert.equal(
      lintFiles([zeroSet], config).some((v) => v.ruleId === "no_zero_set_filter"),
      true,
    );
  });

  it("committed transaction fixtures match when those rules are opted in", () => {
    const config = resolveConfig(
      { opt_in_rules: ["transaction_boundaries", "transaction_stale_reads", "transaction_locks"] },
      fixtures,
      null,
    );
    const boundaries = {
      path: path.join(fixtures, "violations/transaction_boundaries.xs"),
      text: readFileSync(path.join(fixtures, "violations/transaction_boundaries.xs"), "utf8"),
    };
    assert.equal(
      lintFiles([boundaries], config).some((v) => v.ruleId === "transaction_boundaries"),
      true,
    );

    const stale = {
      path: path.join(fixtures, "violations/transaction_stale_reads.xs"),
      text: readFileSync(path.join(fixtures, "violations/transaction_stale_reads.xs"), "utf8"),
    };
    assert.equal(
      lintFiles([stale], config).some((v) => v.ruleId === "transaction_stale_reads"),
      true,
    );

    const locks = {
      path: path.join(fixtures, "violations/transaction_locks.xs"),
      text: readFileSync(path.join(fixtures, "violations/transaction_locks.xs"), "utf8"),
    };
    assert.equal(
      lintFiles([locks], config).some((v) => v.ruleId === "transaction_locks"),
      true,
    );
  });

  it("transaction_boundaries resolves callees across files", () => {
    const config = resolveConfig(
      {
        opt_in_rules: ["transaction_boundaries"],
        caller_transaction: ["helpers/**"],
      },
      "/tmp",
      null,
    );
    const helper = {
      path: "helpers/apply_debit.xs",
      text: `function "Wallet/apply_debit" {
  input {
  }

  stack {
    db.get wallet {
      field_name = "id"
      field_value = $input.id
      lock = true
    } as $row
  }

  response = $ok
}`,
    };
    const opensTx = {
      path: "wallet/settle.xs",
      text: `function "Wallet/settle" {
  input {
  }

  stack {
    db.transaction {
      stack {
        db.get wallet {
          field_name = "id"
          field_value = $input.id
        } as $row
      }
    }
  }

  response = $ok
}`,
    };
    const helperOutside = {
      path: "inventory/reserve.xs",
      text: `function "Inventory/reserve_stock" {
  input {
  }

  stack {
    function.run "Wallet/apply_debit" {
      input = {id: $input.wallet_id}
    } as $debited
  }

  response = $ok
}`,
    };
    const nestedCall = {
      path: "inventory/settle_item.xs",
      text: `function "Inventory/settle_item" {
  input {
  }

  stack {
    db.transaction {
      stack {
        function.run "Wallet/settle" {
          input = {id: $input.wallet_id}
        } as $settled
      }
    }
  }

  response = $ok
}`,
    };
    const helperOpens = {
      path: "helpers/open_tx.xs",
      text: `function "Wallet/open_tx" {
  input {
  }

  stack {
    db.transaction {
      stack {
        db.get wallet {
          field_name = "id"
          field_value = $input.id
        } as $row
      }
    }
  }

  response = $ok
}`,
    };

    const outside = lintFiles([helper, helperOutside], config).filter(
      (v) => v.ruleId === "transaction_boundaries",
    );
    assert.equal(outside.length, 1);
    assert.equal(outside[0]?.file, "inventory/reserve.xs");

    const nested = lintFiles([opensTx, nestedCall], config).filter(
      (v) => v.ruleId === "transaction_boundaries",
    );
    assert.equal(nested.length, 1);
    assert.equal(nested[0]?.file, "inventory/settle_item.xs");

    const opened = lintFiles([helperOpens], config).filter(
      (v) => v.ruleId === "transaction_boundaries",
    );
    assert.equal(opened.length, 1);
    assert.equal(opened[0]?.file, "helpers/open_tx.xs");
    assert.equal(opened[0]?.message, "caller-transaction file must not open db.transaction");
  });

  it("committed no_expect_equal_null fixture matches when that rule is opted in", () => {
    const config = resolveConfig({ opt_in_rules: ["no_expect_equal_null"] }, fixtures, null);
    const expectNull = {
      path: path.join(fixtures, "violations/expect_equal_null.xs"),
      text: readFileSync(path.join(fixtures, "violations/expect_equal_null.xs"), "utf8"),
    };
    assert.equal(
      lintFiles([expectNull], config).some((v) => v.ruleId === "no_expect_equal_null"),
      true,
    );
  });

  it("CLI lints a violations directory and exits 2", async () => {
    await withTempDir(async (dir) => {
      await writeXs(dir, ".xanoscriptlint.yml", "included:\n  - \"**/*.xs\"\n");
      await writeXs(dir, "violations/empty_run.xs", EMPTY_RUN_XS);
      const cwd = process.cwd();
      process.chdir(dir);
      try {
        const stdout = collectStream();
        const stderr = collectStream();
        const code = await runCli(
          ["node", "xanoscriptlint", "--reporter", "json", "violations"],
          { stdout: stdout.stream, stderr: stderr.stream },
        );
        assert.equal(code, 2, stderr.text());
        assert.match(stdout.text(), /empty_function_run/);
        JSON.parse(stdout.text());
      } finally {
        process.chdir(cwd);
      }
    });
  });
});
