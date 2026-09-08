import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadConfigText } from "../src/config.js";
import { lintFile } from "../src/lint.js";

describe("custom_rules", () => {
  it("flags regex matches on non-comment lines", () => {
    const config = loadConfigText(
      `
disabled_rules:
  - no_trailing_newline
custom_rules:
  no_todo:
    regex: TODO
    message: Remove TODO
    severity: warning
`,
      "/tmp",
      null,
    );
    const hits = lintFile(
      {
        path: "fn.xs",
        text: `function "x" {\n  TODO\n}`,
      },
      config,
    );
    assert.equal(hits.some((v) => v.ruleId === "no_todo"), true);

    const commented = lintFile(
      {
        path: "fn.xs",
        text: `function "x" {\n  // TODO\n}`,
      },
      config,
    );
    assert.equal(commented.some((v) => v.ruleId === "no_todo"), false);
  });

  it("applies custom path excluded regexes", () => {
    const config = loadConfigText(
      `
disabled_rules:
  - empty_function_run
  - no_trailing_newline
custom_rules:
  no_todo:
    regex: TODO
    excluded:
      - ".*Test\\\\.xs"
`,
      "/tmp",
      null,
    );
    const skipped = lintFile(
      { path: "/proj/FooTest.xs", text: "TODO\n}" },
      config,
    );
    assert.equal(skipped.some((v) => v.ruleId === "no_todo"), false);
    const flagged = lintFile(
      { path: "/proj/foo.xs", text: "TODO\n}" },
      config,
    );
    assert.equal(flagged.some((v) => v.ruleId === "no_todo"), true);
  });
});
