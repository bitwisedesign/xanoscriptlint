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
