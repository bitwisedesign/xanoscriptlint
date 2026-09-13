import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadConfigText, resolveConfig } from "../src/config.js";
import { lintFile } from "../src/lint.js";
import { EMPTY_RUN_XS } from "./support.js";

function config() {
  return resolveConfig({ disabled_rules: ["no_trailing_newline"] }, "/tmp", null);
}

describe("suppressions", () => {
  it("disable/enable is a region through EOF or enable", () => {
    const text = `// xanoscriptlint:disable empty_function_run
function "a" {
  stack {
    function.run ""
  }
}
// xanoscriptlint:enable empty_function_run
function "b" {
  stack {
    function.run ""
  }
}`;
    const violations = lintFile({ path: "a.xs", text }, config());
    const lines = violations
      .filter((v) => v.ruleId === "empty_function_run")
      .map((v) => v.line);
    assert.deepEqual(lines, [10]);
  });

  it("disable:next suppresses the next statement", () => {
    const text = `function "a" {
  stack {
    // xanoscriptlint:disable:next empty_function_run
    function.run ""
    function.run ""
  }
}`;
    const violations = lintFile({ path: "a.xs", text }, config());
    const lines = violations
      .filter((v) => v.ruleId === "empty_function_run")
      .map((v) => v.line);
    assert.deepEqual(lines, [5]);
  });

  it("disable:previous suppresses the previous statement", () => {
    const text = `function "a" {
  stack {
    function.run ""
    // xanoscriptlint:disable:previous empty_function_run
  }
}`;
    const violations = lintFile({ path: "a.xs", text }, config());
    assert.equal(
      violations.some((v) => v.ruleId === "empty_function_run"),
      false,
    );
  });

  it("file-wide disable at the top covers the file", () => {
    const text = `// xanoscriptlint:disable empty_function_run
${EMPTY_RUN_XS}`;
    const violations = lintFile({ path: "a.xs", text }, config());
    assert.equal(
      violations.some((v) => v.ruleId === "empty_function_run"),
      false,
    );
  });

  it("deprecated no_var_response alias still suppresses no_reserved_var", () => {
    const text = `function "a" {
  stack {
    // xanoscriptlint:disable:next no_var_response
    var $auth {
      value = 1
    }
    var $db {
      value = 1
    }
  }
}`;
    const violations = lintFile(
      { path: "a.xs", text },
      resolveConfig(
        {
          disabled_rules: ["no_trailing_newline"],
        },
        "/tmp",
        null,
      ),
    );
    const reserved = violations.filter((v) => v.ruleId === "no_reserved_var");
    assert.deepEqual(
      reserved.map((v) => v.line),
      [7],
    );
  });

  it("keeps a custom rule id distinct from its builtin alias", () => {
    const text = `function "a" {
  stack {
    // xanoscriptlint:disable:next no_var_response
    TODO
    var $auth {
      value = 1
    }
  }
}`;
    const violations = lintFile(
      { path: "a.xs", text },
      loadConfigText(
        `
disabled_rules:
  - no_trailing_newline
custom_rules:
  no_var_response:
    regex: TODO
    message: Remove TODO
`,
        "/tmp",
        null,
      ),
    );
    assert.equal(
      violations.some((v) => v.ruleId === "no_var_response"),
      false,
    );
    const reserved = violations.filter((v) => v.ruleId === "no_reserved_var");
    assert.deepEqual(
      reserved.map((v) => v.line),
      [5],
    );
  });
});
