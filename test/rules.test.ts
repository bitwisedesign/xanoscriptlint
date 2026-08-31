import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveConfig } from "../src/config.js";
import { lintFile } from "../src/lint.js";
import {
  CLEAN_XS,
  EMPTY_RUN_XS,
  VAR_RESPONSE_XS,
} from "./support.js";

function config(overrides: Parameters<typeof resolveConfig>[0] = {}) {
  return resolveConfig(overrides, "/tmp", null);
}

describe("built-in rules", () => {
  it("empty_function_run flags empty names and skips comments", () => {
    const file = { path: "a.xs", text: EMPTY_RUN_XS };
    const violations = lintFile(file, config());
    assert.equal(
      violations.some((v) => v.ruleId === "empty_function_run"),
      true,
    );

    const commented = {
      path: "b.xs",
      text: `function "x" {\n  // function.run ""\n}`,
    };
    const none = lintFile(commented, config({ disabled_rules: ["no_trailing_newline"] }));
    assert.equal(
      none.some((v) => v.ruleId === "empty_function_run"),
      false,
    );
  });

  it("no_trailing_newline requires a final }", () => {
    const clean = lintFile({ path: "clean.xs", text: CLEAN_XS }, config());
    assert.equal(
      clean.some((v) => v.ruleId === "no_trailing_newline"),
      false,
    );

    const trailing = lintFile(
      { path: "nl.xs", text: `${CLEAN_XS}\n` },
      config(),
    );
    assert.equal(
      trailing.some((v) => v.ruleId === "no_trailing_newline"),
      true,
    );
  });

  it("no_var_response is opt-in", () => {
    const file = { path: "r.xs", text: VAR_RESPONSE_XS };
    const off = lintFile(file, config());
    assert.equal(
      off.some((v) => v.ruleId === "no_var_response"),
      false,
    );
    const on = lintFile(file, config({ opt_in_rules: ["no_var_response"] }));
    assert.equal(
      on.some((v) => v.ruleId === "no_var_response"),
      true,
    );
  });

  it("per-rule severity override applies", () => {
    const file = { path: "a.xs", text: EMPTY_RUN_XS };
    const violations = lintFile(
      file,
      config({ empty_function_run: "warning" }),
    );
    const hit = violations.find((v) => v.ruleId === "empty_function_run");
    assert.equal(hit?.severity, "warning");
  });
});
