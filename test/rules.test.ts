import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveConfig } from "../src/config.js";
import { lintFile } from "../src/lint.js";
import {
  ALIGNED_MOCK_ENTRIES,
  ALIGNED_MOCK_XS,
  CLEAN_XS,
  EMPTY_RUN_XS,
  MOCK_LONG_NAME,
  MOCK_SHORT_NAME,
  NULL_RESPONSE_XS,
  OVERPADDED_LONG_MOCK_XS,
  UNDERPADDED_MOCK_XS,
  VAR_RESPONSE_XS,
  wrapMockBlock,
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

  it("no_null_response is opt-in and skips comments and $response", () => {
    const file = { path: "r.xs", text: NULL_RESPONSE_XS };
    const off = lintFile(file, config());
    assert.equal(
      off.some((v) => v.ruleId === "no_null_response"),
      false,
    );
    const on = lintFile(file, config({ opt_in_rules: ["no_null_response"] }));
    assert.equal(
      on.some((v) => v.ruleId === "no_null_response"),
      true,
    );

    const commented = {
      path: "c.xs",
      text: `function "x" {\n  // response = null\n}`,
    };
    const none = lintFile(commented, config({ opt_in_rules: ["no_null_response"] }));
    assert.equal(
      none.some((v) => v.ruleId === "no_null_response"),
      false,
    );

    const dollar = {
      path: "d.xs",
      text: `function "x" {\n  $response = null\n}`,
    };
    const skipped = lintFile(dollar, config({ opt_in_rules: ["no_null_response"] }));
    assert.equal(
      skipped.some((v) => v.ruleId === "no_null_response"),
      false,
    );

    const quoted = {
      path: "q.xs",
      text: `function "x" {\n  value = "response = null"\n}`,
    };
    const inString = lintFile(quoted, config({ opt_in_rules: ["no_null_response"] }));
    assert.equal(
      inString.some((v) => v.ruleId === "no_null_response"),
      false,
    );
  });

  it("align_mock_colons flags misaligned mock names and skips non-mocks", () => {
    const aligned = lintFile({ path: "ok.xs", text: ALIGNED_MOCK_XS }, config());
    assert.equal(
      aligned.some((v) => v.ruleId === "align_mock_colons"),
      false,
    );

    const under = lintFile({ path: "under.xs", text: UNDERPADDED_MOCK_XS }, config());
    const underHit = under.filter((v) => v.ruleId === "align_mock_colons");
    assert.equal(underHit.length, 1);
    assert.equal(underHit[0]?.line, 8);

    const over = lintFile({ path: "over.xs", text: OVERPADDED_LONG_MOCK_XS }, config());
    const overHit = over.filter((v) => v.ruleId === "align_mock_colons");
    assert.equal(overHit.length, 1);
    assert.equal(overHit[0]?.line, 9);

    const twoBlocks = `function "example" {
  input {
  }

  stack {
    db.query item {
      mock = {
        "a": 1
        "bb": 2
      }
    }
    db.query other {
      mock = {
        "xxx": 1
        "y"  : 2
      }
    }
  }

  response = $item
}`;
    const two = lintFile({ path: "two.xs", text: twoBlocks }, config());
    const twoHits = two.filter((v) => v.ruleId === "align_mock_colons");
    assert.equal(twoHits.length, 1);
    assert.equal(twoHits[0]?.line, 8);

    const multiline = wrapMockBlock(
      `        ${MOCK_SHORT_NAME}: \`\`\`
          [
            {id: 1}
          ]
          \`\`\`
        ${MOCK_LONG_NAME}: []`,
    );
    const multi = lintFile({ path: "multi.xs", text: multiline }, config());
    const multiHits = multi.filter((v) => v.ruleId === "align_mock_colons");
    assert.equal(multiHits.length, 1);
    assert.equal(multiHits[0]?.line, 8);

    const oneLiner = `function "example" {
  input {
  }

  stack {
    db.query item {
      mock = {${MOCK_SHORT_NAME}  : {id: 1}}
    }
  }

  response = $item
}`;
    const compact = lintFile({ path: "one.xs", text: oneLiner }, config());
    assert.equal(
      compact.some((v) => v.ruleId === "align_mock_colons"),
      true,
    );

    const singleEntry = wrapMockBlock(`        ${MOCK_SHORT_NAME}  : {id: 1}`);
    const single = lintFile({ path: "single.xs", text: singleEntry }, config());
    assert.equal(
      single.some((v) => v.ruleId === "align_mock_colons"),
      true,
    );

    const notMock = `function "example" {
  input {
  }

  stack {
    var $row {
      value = {
        "not a mock" : 1
        "also"       : 2
      }
    }
  }

  response = $row
}`;
    const ignored = lintFile({ path: "obj.xs", text: notMock }, config());
    assert.equal(
      ignored.some((v) => v.ruleId === "align_mock_colons"),
      false,
    );

    const commented = wrapMockBlock(
      `        // ${MOCK_SHORT_NAME}: {id: 0}
${ALIGNED_MOCK_ENTRIES}`,
    );
    const comments = lintFile({ path: "c.xs", text: commented }, config());
    assert.equal(
      comments.some((v) => v.ruleId === "align_mock_colons"),
      false,
    );

    const disabled = lintFile(
      { path: "off.xs", text: UNDERPADDED_MOCK_XS },
      config({ disabled_rules: ["align_mock_colons"] }),
    );
    assert.equal(
      disabled.some((v) => v.ruleId === "align_mock_colons"),
      false,
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
