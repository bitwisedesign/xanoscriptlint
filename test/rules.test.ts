import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveConfig } from "../src/config.js";
import { lintFile } from "../src/lint.js";
import {
  ALIGNED_MOCK_ENTRIES,
  ALIGNED_MOCK_XS,
  CLEAN_XS,
  ENUM_V62,
  ENUM_V63,
  ENUM_V64,
  inlineEnumDecl,
  wrappedEnumDecl,
  EMPTY_RUN_XS,
  FENCED_INPUT_ARRAY_XS,
  FENCED_INPUT_OBJECT_XS,
  FENCED_MULTILINE_ARRAY_XS,
  FENCED_MULTILINE_OBJECT_XS,
  INVALID_DOUBLE_OPENER_XS,
  INVALID_FUNCTION_RUN_OUTDENTED_MOCK_XS,
  MOCK_LONG_NAME,
  MOCK_SHORT_NAME,
  NONCANONICAL_MULTILINE_MOCK_XS,
  NEGATIVE_DEFAULT_FIXED_XS,
  NEGATIVE_DEFAULT_XS,
  NULL_RESPONSE_XS,
  OVERPADDED_LONG_MOCK_XS,
  UNDERPADDED_MOCK_XS,
  UNFENCED_INPUT_ARRAY_XS,
  UNFENCED_INPUT_OBJECT_XS,
  UNFENCED_FUNCTION_RUN_MULTILINE_MOCK_XS,
  UNFENCED_MULTILINE_ARRAY_XS,
  UNFENCED_MULTILINE_OBJECT_ENTRIES,
  UNFENCED_MULTILINE_OBJECT_XS,
  VALID_FUNCTION_RUN_COMPACT_MOCK_XS,
  VALID_SIBLING_FENCES_XS,
  VAR_RESPONSE_XS,
  ZERO_DEFAULT_FIXED_XS,
  ZERO_DEFAULT_XS,
  wrapInputDecls,
  wrapInputBlock,
  wrapMockBlock,
  wrapAssign,
  wrapReturn,
  inlineAssignObj,
  wrappedAssignObj,
  ASSIGN_LINE_62,
  ASSIGN_LINE_63,
  ASSIGN_LINE_64,
} from "./support.js";

function config(overrides: Parameters<typeof resolveConfig>[0] = {}) {
  return resolveConfig(overrides, "/tmp", null);
}

function guidHits(text: string, overrides: Parameters<typeof resolveConfig>[0] = {}) {
  return lintFile({ path: "a.xs", text }, config(overrides)).filter(
    (v) => v.ruleId === "guid_placement",
  );
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

  it("align_object_colons flags misaligned mock names", () => {
    const aligned = lintFile({ path: "ok.xs", text: ALIGNED_MOCK_XS }, config());
    assert.equal(
      aligned.some((v) => v.ruleId === "align_object_colons"),
      false,
    );

    const under = lintFile({ path: "under.xs", text: UNDERPADDED_MOCK_XS }, config());
    const underHit = under.filter((v) => v.ruleId === "align_object_colons");
    assert.equal(underHit.length, 1);
    assert.equal(underHit[0]?.line, 8);

    const over = lintFile({ path: "over.xs", text: OVERPADDED_LONG_MOCK_XS }, config());
    const overHit = over.filter((v) => v.ruleId === "align_object_colons");
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
    const twoHits = two.filter((v) => v.ruleId === "align_object_colons");
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
    const multiHits = multi.filter((v) => v.ruleId === "align_object_colons");
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
      compact.some((v) => v.ruleId === "align_object_colons"),
      true,
    );

    const singleEntry = wrapMockBlock(`        ${MOCK_SHORT_NAME}  : {id: 1}`);
    const single = lintFile({ path: "single.xs", text: singleEntry }, config());
    assert.equal(
      single.some((v) => v.ruleId === "align_object_colons"),
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
    const objectHits = lintFile({ path: "obj.xs", text: notMock }, config());
    assert.equal(
      objectHits.some((v) => v.ruleId === "align_object_colons"),
      true,
    );

    const commented = wrapMockBlock(
      `        // ${MOCK_SHORT_NAME}: {id: 0}
${ALIGNED_MOCK_ENTRIES}`,
    );
    const comments = lintFile({ path: "c.xs", text: commented }, config());
    assert.equal(
      comments.some((v) => v.ruleId === "align_object_colons"),
      false,
    );

    const disabled = lintFile(
      { path: "off.xs", text: UNDERPADDED_MOCK_XS },
      config({ disabled_rules: ["align_object_colons"] }),
    );
    assert.equal(
      disabled.some((v) => v.ruleId === "align_object_colons"),
      false,
    );
  });

  it("align_object_colons flags input blocks, nested objects, and inline padding", () => {
    const alignedInput = `function "example" {
  input {
  }

  stack {
    function.run "Orders/dispatch" {
      input = {
        user_id   : $input.user_id
        award_uuid: $input.award_uuid
      }
    } as $dispatch
  }

  response = $dispatch
}`;
    assert.equal(
      lintFile({ path: "in-ok.xs", text: alignedInput }, config()).some(
        (v) => v.ruleId === "align_object_colons",
      ),
      false,
    );

    const misalignedInput = `function "example" {
  input {
  }

  stack {
    function.run "Orders/dispatch" {
      input = {
        user_id: $input.user_id
        award_uuid: $input.award_uuid
      }
    } as $dispatch
  }

  response = $dispatch
}`;
    const inputHits = lintFile({ path: "in-bad.xs", text: misalignedInput }, config()).filter(
      (v) => v.ruleId === "align_object_colons",
    );
    assert.equal(inputHits.length, 1);
    assert.equal(inputHits[0]?.line, 8);
    assert.equal(inputHits[0]?.message, "object colons must align to the longest name");

    const nested = `function "example" {
  input {
  }

  stack {
    db.add job {
      data = {
        short: 1
        nested: {
          inner_longer: 2
          x           : 3
        }
      }
    }
  }

  response = $job
}`;
    const nestedHits = lintFile({ path: "nested.xs", text: nested }, config()).filter(
      (v) => v.ruleId === "align_object_colons",
    );
    assert.equal(nestedHits.length, 1);
    assert.equal(nestedHits[0]?.line, 8);

    const afterColon = `function "example" {
  input {
  }

  stack {
    function.run "Orders/dispatch" {
      input = {
        user_id   :  $input.user_id
        award_uuid: $input.award_uuid
      }
    } as $dispatch
  }

  response = $dispatch
}`;
    const spaceHits = lintFile({ path: "spaces.xs", text: afterColon }, config()).filter(
      (v) => v.ruleId === "align_object_colons",
    );
    assert.equal(spaceHits.length, 1);
    assert.equal(spaceHits[0]?.line, 8);
    assert.equal(spaceHits[0]?.message, "object colon must be followed by a single space");

    const inline = `function "example" {
  input {
  }

  stack {
    function.run "Orders/dispatch" {
      input = {user_id  : 1, amount: 2}
    } as $dispatch
  }

  response = $dispatch
}`;
    const inlineHits = lintFile({ path: "inline.xs", text: inline }, config()).filter(
      (v) => v.ruleId === "align_object_colons",
    );
    assert.equal(inlineHits.length, 1);
    assert.equal(inlineHits[0]?.line, 7);
  });

  it("align_object_colons ignores fences, triple quotes, declarations, pipes, and array objects", () => {
    const fenced = wrapMockBlock(
      `        "checkout source": \`\`\`
          {
            foo: 1
            longer_key: 2
          }
          \`\`\``,
    );
    assert.equal(
      lintFile({ path: "fence.xs", text: fenced }, config()).some(
        (v) => v.ruleId === "align_object_colons",
      ),
      false,
    );

    const triple = `function "example" {
  input {
  }

  stack {
    var $agent {
      value = {
        type         : "openai"
        system_prompt: """
          foo     : 1
          longer_key: 2
          """
        max_steps    : 10
      }
    }
  }

  response = $agent
}`;
    assert.equal(
      lintFile({ path: "triple.xs", text: triple }, config()).some(
        (v) => v.ruleId === "align_object_colons",
      ),
      false,
    );

    const ignored = `function "example" {
  input {
    uuid job_uuid
    text email?
  }

  stack {
    var $err {
      value = {}
        |set:"error":"not_found"
        |set:"message":"missing"
    }
    throw {
      name = "not_found"
      value = {}
    }
    var $rows {
      value = [
        {
          uuid : "a"
          output_count_key_fallbacks: []
        }
      ]
    }
  }

  response = $err
}`;
    assert.equal(
      lintFile({ path: "decl.xs", text: ignored }, config()).some(
        (v) => v.ruleId === "align_object_colons",
      ),
      false,
    );
  });

  it("fence_multiline_values flags unfenced multiline objects and arrays", () => {
    const objectHits = lintFile(
      { path: "obj.xs", text: UNFENCED_MULTILINE_OBJECT_XS },
      config(),
    ).filter((v) => v.ruleId === "fence_multiline_values");
    assert.equal(objectHits.length, 1);
    assert.equal(objectHits[0]?.line, 8);
    assert.equal(objectHits[0]?.severity, "error");
    assert.equal(objectHits[0]?.message, "multiline mock value must be wrapped in a ``` fence");

    const arrayHits = lintFile(
      { path: "arr.xs", text: UNFENCED_MULTILINE_ARRAY_XS },
      config(),
    ).filter((v) => v.ruleId === "fence_multiline_values");
    assert.equal(arrayHits.length, 1);
    assert.equal(arrayHits[0]?.line, 8);

    const inputObject = lintFile(
      { path: "in-obj.xs", text: UNFENCED_INPUT_OBJECT_XS },
      config(),
    ).filter((v) => v.ruleId === "fence_multiline_values");
    assert.equal(inputObject.length, 1);
    assert.equal(inputObject[0]?.line, 8);
    assert.equal(inputObject[0]?.message, "multiline input value must be wrapped in a ``` fence");

    const inputArray = lintFile(
      { path: "in-arr.xs", text: UNFENCED_INPUT_ARRAY_XS },
      config(),
    ).filter((v) => v.ruleId === "fence_multiline_values");
    assert.equal(inputArray.length, 1);
    assert.equal(inputArray[0]?.line, 8);

    const quotedName = `function "Orders/function.run" {
  input {
  }

  stack {
    db.query item {
      mock = {
        "checkout applies gift wrap": {
          queued: []
        }
      }
    }
  }

  response = $item
}`;
    const quotedHits = lintFile({ path: "quoted-run.xs", text: quotedName }, config()).filter(
      (v) => v.ruleId === "fence_multiline_values",
    );
    assert.equal(quotedHits.length, 1);
    assert.equal(quotedHits[0]?.line, 8);
    assert.equal(quotedHits[0]?.column, 39);
  });

  it("fence_multiline_values ignores fenced, single-line, nested, and non-mock values", () => {
    const alreadyObject = lintFile(
      { path: "fenced-obj.xs", text: FENCED_MULTILINE_OBJECT_XS },
      config(),
    );
    assert.equal(
      alreadyObject.some((v) => v.ruleId === "fence_multiline_values"),
      false,
    );

    const alreadyArray = lintFile(
      { path: "fenced-arr.xs", text: FENCED_MULTILINE_ARRAY_XS },
      config(),
    );
    assert.equal(
      alreadyArray.some((v) => v.ruleId === "fence_multiline_values"),
      false,
    );

    const alreadyInput = lintFile(
      { path: "fenced-in.xs", text: FENCED_INPUT_OBJECT_XS },
      config(),
    );
    assert.equal(
      alreadyInput.some((v) => v.ruleId === "fence_multiline_values"),
      false,
    );

    const alreadyInputArray = lintFile(
      { path: "fenced-in-arr.xs", text: FENCED_INPUT_ARRAY_XS },
      config(),
    );
    assert.equal(
      alreadyInputArray.some((v) => v.ruleId === "fence_multiline_values"),
      false,
    );

    const inline = wrapMockBlock(
      `        "checkout short": {id: 1}
        "checkout none": null
        "checkout empty": []
        "checkout tick": \`[]\``,
    );
    const scalars = lintFile({ path: "inline.xs", text: inline }, config());
    assert.equal(
      scalars.some((v) => v.ruleId === "fence_multiline_values"),
      false,
    );

    const nested = wrapMockBlock(
      `        "checkout applies gift wrap": \`\`\`
          {
            source: {
              version: 1
            }
          }
          \`\`\``,
    );
    const nestedHits = lintFile({ path: "nested.xs", text: nested }, config());
    assert.equal(
      nestedHits.some((v) => v.ruleId === "fence_multiline_values"),
      false,
    );

    const notMock = `function "example" {
  input {
  }

  stack {
    var $row {
      value = {
        issued : []
        skipped: []
      }
    }
    db.add job {
      data = {
        input: {
          round_uuid: $round
        }
      }
    }
    db.query item {
      join = {
        other: {
          table: "other"
        }
      }
    }
  }

  response = $row
}`;
    const ignored = lintFile({ path: "outside.xs", text: notMock }, config());
    assert.equal(
      ignored.some((v) => v.ruleId === "fence_multiline_values"),
      false,
    );

    const notPlainOwner = `function "example" {
  input {
  }

  stack {
    $mock = {
      issued: [
        {id: 1}
      ]
    }
    payload.input = {
      items: [
        {id: 1}
      ]
    }
  }

  response = $mock
}`;
    assert.equal(
      lintFile({ path: "sigil.xs", text: notPlainOwner }, config()).some(
        (v) => v.ruleId === "fence_multiline_values",
      ),
      false,
    );

    const arrayElement = `function "example" {
  input {
  }

  stack {
    var $rows {
      value = [
        {
          uuid : "a"
          nested: {
            inner: 1
          }
        }
      ]
    }
  }

  response = $rows
}`;
    assert.equal(
      lintFile({ path: "arr-el.xs", text: arrayElement }, config()).some(
        (v) => v.ruleId === "fence_multiline_values",
      ),
      false,
    );

    const nestedInput = wrapInputBlock(
      `        payload: {
          nested: {
            inner: 1
          }
        }`,
    );
    const nestedInputHits = lintFile({ path: "nested-in.xs", text: nestedInput }, config()).filter(
      (v) => v.ruleId === "fence_multiline_values",
    );
    assert.equal(nestedInputHits.length, 1);
    assert.equal(nestedInputHits[0]?.line, 8);

    const noncanonical = lintFile(
      { path: "odd.xs", text: NONCANONICAL_MULTILINE_MOCK_XS },
      config(),
    );
    assert.equal(
      noncanonical.some((v) => v.ruleId === "fence_multiline_values"),
      true,
    );

    const commented = `function "example" {
  input {
  }

  stack {
    db.query item {
      mock = {
        // xanoscriptlint:disable:next fence_multiline_values
${UNFENCED_MULTILINE_OBJECT_ENTRIES}
      }
    }
  }

  response = $item
}`;
    const suppressed = lintFile({ path: "suppressed.xs", text: commented }, config());
    assert.equal(
      suppressed.some((v) => v.ruleId === "fence_multiline_values"),
      false,
    );

    const disabled = lintFile(
      { path: "off.xs", text: UNFENCED_MULTILINE_OBJECT_XS },
      config({ disabled_rules: ["fence_multiline_values"] }),
    );
    assert.equal(
      disabled.some((v) => v.ruleId === "fence_multiline_values"),
      false,
    );

    const warned = lintFile(
      { path: "warn.xs", text: UNFENCED_MULTILINE_OBJECT_XS },
      config({ fence_multiline_values: "warning" }),
    );
    const warnHit = warned.find((v) => v.ruleId === "fence_multiline_values");
    assert.equal(warnHit?.severity, "warning");
  });

  it("fence_multiline_values flags shared fence openers and an outdented function.run mock", () => {
    const double = lintFile({ path: "double.xs", text: INVALID_DOUBLE_OPENER_XS }, config()).filter(
      (v) => v.ruleId === "fence_multiline_values",
    );
    assert.equal(double.length, 1);
    assert.match(double[0]?.message ?? "", /consecutive fence openers/);
    assert.equal(double[0]?.line, 9);
    assert.equal(double[0]?.column, 9);

    const outdented = lintFile(
      { path: "outdent.xs", text: INVALID_FUNCTION_RUN_OUTDENTED_MOCK_XS },
      config(),
    ).filter((v) => v.ruleId === "fence_multiline_values");
    assert.equal(outdented.length, 1);
    assert.match(outdented[0]?.message ?? "", /indented with input inside function\.run/);
    assert.equal(outdented[0]?.line, 16);
    assert.equal(outdented[0]?.column, 11);

    const validFences = lintFile({ path: "ok-fence.xs", text: VALID_SIBLING_FENCES_XS }, config());
    assert.equal(
      validFences.some((v) => v.ruleId === "fence_multiline_values"),
      false,
    );

    const compact = lintFile(
      { path: "ok-run.xs", text: VALID_FUNCTION_RUN_COMPACT_MOCK_XS },
      config(),
    );
    assert.equal(
      compact.some((v) => v.ruleId === "fence_multiline_values"),
      false,
    );

    const multilineRun = lintFile(
      { path: "run-multi.xs", text: UNFENCED_FUNCTION_RUN_MULTILINE_MOCK_XS },
      config(),
    );
    assert.equal(
      multilineRun.some((v) => v.ruleId === "fence_multiline_values"),
      false,
    );

    const sameLineOpen = `function "example" {
  input {
  }

  stack {
    conditional {
      if ($ok) {
        foreach ($items) {
          each {
            function.run "Orders/apply_discounts" { input = {
                user_id: $cart_user_id
              }

          mock = {
            "checkout empty cart": {queued: [], sent: [], done: false}
          }
            } as $discount_result
          }
        }
      }
    }
  }

  response = $ok
}`;
    const sameLineHits = lintFile({ path: "same-line.xs", text: sameLineOpen }, config()).filter(
      (v) => v.ruleId === "fence_multiline_values",
    );
    assert.equal(sameLineHits.length, 1);
    assert.match(sameLineHits[0]?.message ?? "", /indented with input inside function\.run/);
    assert.equal(sameLineHits[0]?.line, 14);
    assert.equal(sameLineHits[0]?.column, 11);
  });

  it("no_zero_numeric_default flags explicit zero defaults", () => {
    const hits = lintFile({ path: "zero.xs", text: ZERO_DEFAULT_XS }, config()).filter(
      (v) => v.ruleId === "no_zero_numeric_default",
    );
    assert.equal(hits.length, 6);
    assert.equal(hits[0]?.line, 3);
    assert.equal(hits[0]?.column, 21);
    assert.equal(hits[0]?.severity, "error");
    assert.equal(hits[0]?.message, "numeric default of 0 must be omitted; Xano strips it on push");

    const clean = lintFile({ path: "ok.xs", text: ZERO_DEFAULT_FIXED_XS }, config());
    assert.equal(
      clean.some((v) => v.ruleId === "no_zero_numeric_default"),
      false,
    );

    const forms = wrapInputDecls(
      `    int bare?=0
    decimal tenths?=0.0
    decimal hundredths?=0.00
    decimal dot?=.0
    int neg?=-0
    int plus?=+0
    int quoted?="0"
    int single?='0'
    int spaced? = 0`,
    );
    const formHits = lintFile({ path: "forms.xs", text: forms }, config()).filter(
      (v) => v.ruleId === "no_zero_numeric_default",
    );
    assert.equal(formHits.length, 9);

    const allowed = wrapInputDecls(
      `    int page?=1
    decimal weight?=0.5
    int padded?=01
    int cap? filters=min:0
    bool enabled?=false
    timestamp created_at?=0
    int quantity?="-1"`,
    );
    assert.equal(
      lintFile({ path: "keep.xs", text: allowed }, config()).some(
        (v) => v.ruleId === "no_zero_numeric_default",
      ),
      false,
    );

    const commented = wrapInputDecls(`    // int retry_count?=0`);
    assert.equal(
      lintFile({ path: "c.xs", text: commented }, config()).some(
        (v) => v.ruleId === "no_zero_numeric_default",
      ),
      false,
    );

    const fenced = `function "example" {
  input {
  }

  stack {
    var $agent {
      value = {
        prompt: \`\`\`
          int retry_count?=0
          \`\`\`
      }
    }
  }

  response = $ok
}`;
    assert.equal(
      lintFile({ path: "fence.xs", text: fenced }, config()).some(
        (v) => v.ruleId === "no_zero_numeric_default",
      ),
      false,
    );

    const triple = `function "example" {
  input {
  }

  stack {
    var $agent {
      value = {
        system_prompt: """
          int retry_count?=0
          """
      }
    }
  }

  response = $ok
}`;
    assert.equal(
      lintFile({ path: "triple.xs", text: triple }, config()).some(
        (v) => v.ruleId === "no_zero_numeric_default",
      ),
      false,
    );

    const disabled = lintFile(
      { path: "off.xs", text: ZERO_DEFAULT_XS },
      config({ disabled_rules: ["no_zero_numeric_default"] }),
    );
    assert.equal(
      disabled.some((v) => v.ruleId === "no_zero_numeric_default"),
      false,
    );

    const warned = lintFile(
      { path: "warn.xs", text: ZERO_DEFAULT_XS },
      config({ no_zero_numeric_default: "warning" }),
    );
    assert.equal(
      warned.find((v) => v.ruleId === "no_zero_numeric_default")?.severity,
      "warning",
    );
  });

  it("quote_negative_numeric_default flags unquoted negative defaults", () => {
    const hits = lintFile({ path: "neg.xs", text: NEGATIVE_DEFAULT_XS }, config()).filter(
      (v) => v.ruleId === "quote_negative_numeric_default",
    );
    assert.equal(hits.length, 6);
    assert.equal(hits[0]?.line, 3);
    assert.equal(hits[0]?.column, 19);
    assert.equal(hits[0]?.severity, "error");
    assert.equal(
      hits[0]?.message,
      "negative numeric default must be quoted; Xano quotes it on push",
    );

    const clean = lintFile({ path: "ok.xs", text: NEGATIVE_DEFAULT_FIXED_XS }, config());
    assert.equal(
      clean.some((v) => v.ruleId === "quote_negative_numeric_default"),
      false,
    );

    const forms = wrapInputDecls(
      `    int quantity?=-1
    decimal drift?=-2.5
    decimal leading?=-.5
    int spaced? = -4`,
    );
    const formHits = lintFile({ path: "forms.xs", text: forms }, config()).filter(
      (v) => v.ruleId === "quote_negative_numeric_default",
    );
    assert.equal(formHits.length, 4);

    const allowed = wrapInputDecls(
      `    int page?=1
    decimal weight?=0.5
    int quantity?="-1"
    int cap? filters=min:0
    bool enabled?=false
    timestamp created_at?=0
    timestamp created_at?=now
    int zero?=-0`,
    );
    const allowedHits = lintFile({ path: "keep.xs", text: allowed }, config());
    assert.equal(
      allowedHits.some((v) => v.ruleId === "quote_negative_numeric_default"),
      false,
    );
    assert.equal(
      allowedHits.some((v) => v.ruleId === "no_zero_numeric_default"),
      true,
    );

    const commented = wrapInputDecls(`    // int quantity?=-1`);
    assert.equal(
      lintFile({ path: "c.xs", text: commented }, config()).some(
        (v) => v.ruleId === "quote_negative_numeric_default",
      ),
      false,
    );

    const fenced = `function "example" {
  input {
  }

  stack {
    var $agent {
      value = {
        prompt: \`\`\`
          int quantity?=-1
          \`\`\`
      }
    }
  }

  response = $ok
}`;
    assert.equal(
      lintFile({ path: "fence.xs", text: fenced }, config()).some(
        (v) => v.ruleId === "quote_negative_numeric_default",
      ),
      false,
    );

    const triple = `function "example" {
  input {
  }

  stack {
    var $agent {
      value = {
        system_prompt: """
          int quantity?=-1
          """
      }
    }
  }

  response = $ok
}`;
    assert.equal(
      lintFile({ path: "triple.xs", text: triple }, config()).some(
        (v) => v.ruleId === "quote_negative_numeric_default",
      ),
      false,
    );

    const disabled = lintFile(
      { path: "off.xs", text: NEGATIVE_DEFAULT_XS },
      config({ disabled_rules: ["quote_negative_numeric_default"] }),
    );
    assert.equal(
      disabled.some((v) => v.ruleId === "quote_negative_numeric_default"),
      false,
    );

    const warned = lintFile(
      { path: "warn.xs", text: NEGATIVE_DEFAULT_XS },
      config({ quote_negative_numeric_default: "warning" }),
    );
    assert.equal(
      warned.find((v) => v.ruleId === "quote_negative_numeric_default")?.severity,
      "warning",
    );
  });

  it("wrap_enum_values uses compact JSON length, not value count", () => {
    assert.equal(JSON.stringify(ENUM_V62).length, 62);
    assert.equal(JSON.stringify(ENUM_V63).length, 63);
    assert.equal(JSON.stringify(ENUM_V64).length, 64);

    const inline63 = lintFile(
      { path: "i63.xs", text: wrapInputDecls(inlineEnumDecl("enum lane", ENUM_V63)) },
      config(),
    ).filter((v) => v.ruleId === "wrap_enum_values");
    assert.equal(inline63.length, 0);

    const inline64 = lintFile(
      { path: "i64.xs", text: wrapInputDecls(inlineEnumDecl("enum lane", ENUM_V64)) },
      config(),
    ).filter((v) => v.ruleId === "wrap_enum_values");
    assert.equal(inline64.length, 1);
    assert.equal(inline64[0]?.line, 4);
    assert.equal(inline64[0]?.column, 7);
    assert.equal(inline64[0]?.severity, "error");
    assert.equal(
      inline64[0]?.message,
      "enum values of compact length 64 must be wrapped (threshold 64)",
    );

    const wrapped63 = lintFile(
      { path: "w63.xs", text: wrapInputDecls(wrappedEnumDecl("enum lane", ENUM_V63)) },
      config(),
    ).filter((v) => v.ruleId === "wrap_enum_values");
    assert.equal(wrapped63.length, 1);
    assert.equal(
      wrapped63[0]?.message,
      "enum values of compact length 63 must be inline (threshold 64)",
    );

    const wrapped64 = lintFile(
      { path: "w64.xs", text: wrapInputDecls(wrappedEnumDecl("enum lane", ENUM_V64)) },
      config(),
    ).filter((v) => v.ruleId === "wrap_enum_values");
    assert.equal(wrapped64.length, 0);
  });

  it("wrap_enum_values matches optional and defaulted enum openers", () => {
    const optional = lintFile(
      {
        path: "opt.xs",
        text: wrapInputDecls(inlineEnumDecl("enum? kind?", ENUM_V64)),
      },
      config(),
    ).filter((v) => v.ruleId === "wrap_enum_values");
    assert.equal(optional.length, 1);

    const defaulted = lintFile(
      {
        path: "def.xs",
        text: wrapInputDecls(inlineEnumDecl("enum lane?=whenever", ENUM_V64)),
      },
      config(),
    ).filter((v) => v.ruleId === "wrap_enum_values");
    assert.equal(defaulted.length, 1);
  });

  it("wrap_enum_values skips non-string arrays, comments inside values, fenced bodies, and non-round-trippable escapes", () => {
    const nonString = wrapInputDecls(`    enum lane {
      values = ["alpha", 1, "bravo"]
    }`);
    assert.equal(
      lintFile({ path: "ns.xs", text: nonString }, config()).some(
        (v) => v.ruleId === "wrap_enum_values",
      ),
      false,
    );

    const commented = wrapInputDecls(`    enum lane {
      values = [
        "alpha"
        // not a value
        "bravo"
      ]
    }`);
    assert.equal(
      lintFile({ path: "cmt.xs", text: commented }, config()).some(
        (v) => v.ruleId === "wrap_enum_values",
      ),
      false,
    );

    const fenced = `function "example" {
  input {
  }

  stack {
    var $ok {
      value = {
        system_prompt: """
          enum lane {
            values = [${ENUM_V64.map((value) => JSON.stringify(value)).join(", ")}]
          }
          """
      }
    }
  }

  response = $ok
}`;
    assert.equal(
      lintFile({ path: "fence.xs", text: fenced }, config()).some(
        (v) => v.ruleId === "wrap_enum_values",
      ),
      false,
    );

    const escaped = wrapInputDecls(`    enum lane {
      values = ["alpha\\n", "bravo\\t", "x\\u0041", "cr\\r"]
    }`);
    assert.equal(
      lintFile(
        { path: "esc.xs", text: escaped },
        config({ wrap_enum_values: { wrap_at: 1 } }),
      ).some((v) => v.ruleId === "wrap_enum_values"),
      false,
    );
  });

  it("wrap_enum_values honors disabled_rules, severity, and wrap_at", () => {
    const text = wrapInputDecls(inlineEnumDecl("enum lane", ENUM_V64));
    const disabled = lintFile(
      { path: "off.xs", text },
      config({ disabled_rules: ["wrap_enum_values"] }),
    );
    assert.equal(
      disabled.some((v) => v.ruleId === "wrap_enum_values"),
      false,
    );

    const warned = lintFile(
      { path: "warn.xs", text },
      config({ wrap_enum_values: "warning" }),
    );
    assert.equal(
      warned.find((v) => v.ruleId === "wrap_enum_values")?.severity,
      "warning",
    );

    const raised = lintFile(
      { path: "raise.xs", text: wrapInputDecls(inlineEnumDecl("enum lane", ENUM_V62)) },
      config({ wrap_enum_values: { wrap_at: 10 } }),
    ).filter((v) => v.ruleId === "wrap_enum_values");
    assert.equal(raised.length, 1);
    assert.match(raised[0]?.message ?? "", /threshold 10/);

    const lowered = lintFile(
      { path: "low.xs", text },
      config({ wrap_enum_values: { wrap_at: 80 } }),
    );
    assert.equal(
      lowered.some((v) => v.ruleId === "wrap_enum_values"),
      false,
    );
  });

  it("collapse_assignment_values uses collapsed line length, not entry count", () => {
    const lineOf = (pad: string) => wrapAssign("input", inlineAssignObj(pad)).split("\n")[6] ?? "";
    assert.equal(lineOf(ASSIGN_LINE_62).length, 62);
    assert.equal(lineOf(ASSIGN_LINE_63).length, 63);
    assert.equal(lineOf(ASSIGN_LINE_64).length, 64);

    const inline63 = lintFile(
      { path: "i63.xs", text: wrapAssign("input", inlineAssignObj(ASSIGN_LINE_63)) },
      config(),
    ).filter((v) => v.ruleId === "collapse_assignment_values");
    assert.equal(inline63.length, 0);

    const inline64 = lintFile(
      { path: "i64.xs", text: wrapAssign("input", inlineAssignObj(ASSIGN_LINE_64)) },
      config(),
    ).filter((v) => v.ruleId === "collapse_assignment_values");
    assert.equal(inline64.length, 0);

    const wrapped63 = lintFile(
      { path: "w63.xs", text: wrapAssign("input", wrappedAssignObj(ASSIGN_LINE_63)) },
      config(),
    ).filter((v) => v.ruleId === "collapse_assignment_values");
    assert.equal(wrapped63.length, 1);
    assert.equal(wrapped63[0]?.line, 7);
    assert.equal(wrapped63[0]?.severity, "error");
    assert.equal(
      wrapped63[0]?.message,
      "input value of line length 63 must be inline (threshold 64)",
    );

    const wrapped64 = lintFile(
      { path: "w64.xs", text: wrapAssign("input", wrappedAssignObj(ASSIGN_LINE_64)) },
      config(),
    ).filter((v) => v.ruleId === "collapse_assignment_values");
    assert.equal(wrapped64.length, 0);

    const wrapped62 = lintFile(
      { path: "w62.xs", text: wrapAssign("input", wrappedAssignObj(ASSIGN_LINE_62)) },
      config(),
    ).filter((v) => v.ruleId === "collapse_assignment_values");
    assert.equal(wrapped62.length, 1);
    assert.equal(
      wrapped62[0]?.message,
      "input value of line length 62 must be inline (threshold 64)",
    );

    const spacedPad = `${"x".repeat(40)}  x`;
    assert.equal(lineOf(spacedPad).length, 64);
    const wrappedSpaced = lintFile(
      { path: "w-spaces.xs", text: wrapAssign("input", wrappedAssignObj(spacedPad)) },
      config(),
    ).filter((v) => v.ruleId === "collapse_assignment_values");
    assert.equal(wrappedSpaced.length, 0);
  });

  it("collapse_assignment_values flags assignment owners including return", () => {
    for (const owner of ["input", "data", "mock", "response", "output", "sort"]) {
      const hits = lintFile(
        { path: `${owner}.xs`, text: wrapAssign(owner, wrappedAssignObj("x")) },
        config(),
      ).filter((v) => v.ruleId === "collapse_assignment_values");
      assert.equal(hits.length, 1, owner);
      assert.match(hits[0]?.message ?? "", new RegExp(`^${owner} value of line length \\d+ must be inline`));
    }

    const returned = lintFile(
      { path: "return.xs", text: wrapReturn(wrappedAssignObj("x")) },
      config(),
    ).filter((v) => v.ruleId === "collapse_assignment_values");
    assert.equal(returned.length, 1);
    assert.match(returned[0]?.message ?? "", /^return value of line length \d+ must be inline/);
  });

  it("collapse_assignment_values skips pipes, comments, fences, non-colon objects, tabs, and enum values", () => {
    const piped = `function "example" {
  input {
  }

  stack {
    var $url {
      value = ["${"a".repeat(70)}"]|join:"/"
    }
  }

  response = $url
}`;
    assert.equal(
      lintFile({ path: "pipe.xs", text: piped }, config()).some(
        (v) => v.ruleId === "collapse_assignment_values",
      ),
      false,
    );

    const force = { collapse_assignment_values: { wrap_at: 1000 } };
    const commented = wrapAssign(
      "input",
      `{
        // keep this block
        k: "x"
      }`,
    );
    assert.equal(
      lintFile({ path: "cmt.xs", text: commented }, config(force)).some(
        (v) => v.ruleId === "collapse_assignment_values",
      ),
      false,
    );

    const fenced = wrapAssign(
      "input",
      `{
        payload: \`\`\`
          {k: 1}
          \`\`\`
      }`,
    );
    assert.equal(
      lintFile({ path: "fence.xs", text: fenced }, config(force)).some(
        (v) => v.ruleId === "collapse_assignment_values",
      ),
      false,
    );

    const thrown = `function "example" {
  input {
  }

  stack {
    throw {
      name = "not_found"
    }
  }

  response = $err
}`;
    assert.equal(
      lintFile({ path: "throw.xs", text: thrown }, config(force)).some(
        (v) => v.ruleId === "collapse_assignment_values",
      ),
      false,
    );

    const tabs = wrapAssign(
      "input",
      `{
\t  k: "x"
      }`,
    );
    assert.equal(
      lintFile({ path: "tabs.xs", text: tabs }, config(force)).some(
        (v) => v.ruleId === "collapse_assignment_values",
      ),
      false,
    );

    const enumText = wrapInputDecls(inlineEnumDecl("enum lane", ENUM_V64));
    const enumHits = lintFile({ path: "enum.xs", text: enumText }, config());
    assert.equal(
      enumHits.filter((v) => v.ruleId === "collapse_assignment_values").length,
      0,
    );
    assert.equal(enumHits.filter((v) => v.ruleId === "wrap_enum_values").length, 1);
  });

  it("collapse_assignment_values honors disabled_rules, severity, and wrap_at", () => {
    const wrapped = wrapAssign("input", wrappedAssignObj(ASSIGN_LINE_62));
    const disabled = lintFile(
      { path: "off.xs", text: wrapped },
      config({ disabled_rules: ["collapse_assignment_values"] }),
    );
    assert.equal(
      disabled.some((v) => v.ruleId === "collapse_assignment_values"),
      false,
    );

    const warned = lintFile(
      { path: "warn.xs", text: wrapped },
      config({ collapse_assignment_values: "warning" }),
    );
    assert.equal(
      warned.find((v) => v.ruleId === "collapse_assignment_values")?.severity,
      "warning",
    );

    const raised = lintFile(
      { path: "raised.xs", text: wrapAssign("input", wrappedAssignObj(ASSIGN_LINE_64)) },
      config({ collapse_assignment_values: { wrap_at: 80 } }),
    ).filter((v) => v.ruleId === "collapse_assignment_values");
    assert.equal(raised.length, 1);

    const lowered = lintFile(
      { path: "lowered.xs", text: wrapAssign("input", wrappedAssignObj(ASSIGN_LINE_62)) },
      config({ collapse_assignment_values: { wrap_at: 10 } }),
    );
    assert.equal(
      lowered.some((v) => v.ruleId === "collapse_assignment_values"),
      false,
    );
  });

  it("guid_placement accepts a flush guid after a single-line value", () => {
    const samples = [
      `function "example" {
  input {
  }

  stack {
  }

  response = $ok
  guid = "g1"
}`,
      `function "example" {
  tags = ["alpha", "beta"]
  guid = "g1"
}`,
      `api_group Sample {
  canonical = "abc"
  swagger = {token: "tok"}
  guid = "g1"
}`,
      `agent "helper" {
  tools = [{name: "lookup"}]
  guid = "g1"
}`,
      `table item {
  schema {
    int id
  }

  index = [{type: "primary", field: [{name: "id"}]}]
  guid = "g1"
}`,
      `task cleanup {
  stack {
  }

  schedule = [{starts_on: 2025-01-01 00:00:00+0000, freq: 3600}]
  guid = "g1"
}`,
      `table_trigger on_insert {
  stack {
  }

  actions = {insert: true}
  guid = "g1"
}`,
      `query "list_items" {
  db.query item {
  } as $rows
    |set:"items":$rows
  guid = "g1"
}`,
      `query "status" {
  response = \`\`\`
    {
      ok: true
    }
    \`\`\`
  guid = "g1"
}`,
    ];
    for (const text of samples) {
      assert.deepEqual(guidHits(text), [], text);
    }
  });

  it("guid_placement accepts a blank line after a block closer", () => {
    const samples = [
      `function "example" {
  input {
  }

  stack {
  }

  response = $ok

  test "ok" {
    expect.to_equal ($ok) {
      value = 1
    }
  }

  guid = "g1"
}`,
      `query "status" {
  response = {
    ok                                 : true
    detail_that_keeps_this_object_long : "abcdefghijklmnopqrstuvwxyz"
  }

  guid = "g1"
}`,
      `agent "helper" {
  tools = [
    {name: "lookup"}
    {name: "write"}
  ]

  guid = "g1"
}`,
      `table item {
  schema {
    int id
  }

  index = [
    {type: "primary", field: [{name: "id"}]}
    {type: "btree", field: [{name: "name"}]}
  ]

  guid = "g1"
}`,
      `function "example" {
  tags = [
    "alpha"
    "beta"
  ]

  guid = "g1"
}`,
    ];
    for (const text of samples) {
      assert.deepEqual(guidHits(text), [], text);
    }
  });

  it("guid_placement flags a missing blank after a closer and a blank after a single-line value", () => {
    const missingBlank = `function "example" {
  input {
  }

  stack {
  }

  response = $ok

  test "ok" {
    expect.to_equal ($ok) {
      value = 1
    }
  }
  guid = "g1"
}`;
    const extraBlank = `function "example" {
  input {
  }

  stack {
  }

  response = $ok

  guid = "g1"
}`;
    const missing = guidHits(missingBlank);
    assert.equal(missing.length, 1);
    assert.equal(missing[0]?.line, 15);
    assert.equal(missing[0]?.column, 3);
    assert.equal(missing[0]?.severity, "warning");
    assert.equal(
      missing[0]?.message,
      "guid must have a blank line above it when it follows a block closer",
    );

    const extra = guidHits(extraBlank);
    assert.equal(extra.length, 1);
    assert.equal(extra[0]?.line, 10);
    assert.equal(extra[0]?.column, 3);
    assert.equal(
      extra[0]?.message,
      "guid must not have a blank line above it when it follows a single-line value",
    );

    const twoBlanks = `function "example" {
  input {
  }

  stack {
  }

  response = $ok

  test "ok" {
    expect.to_equal ($ok) {
      value = 1
    }
  }


  guid = "g1"
}`;
    const surplus = guidHits(twoBlanks);
    assert.equal(surplus.length, 1);
    assert.equal(surplus[0]?.line, 17);
    assert.equal(
      surplus[0]?.message,
      "guid must have exactly one blank line above it",
    );

    const flushViolations = [
      `function "example" {
  tags = ["alpha"]

  guid = "g1"
}`,
      `api_group Sample {
  swagger = {token: "tok"}

  guid = "g1"
}`,
      `agent "helper" {
  tools = [{name: "lookup"}]

  guid = "g1"
}`,
      `table item {
  index = [{type: "primary", field: [{name: "id"}]}]

  guid = "g1"
}`,
      `task cleanup {
  schedule = [{starts_on: 2025-01-01 00:00:00+0000, freq: 3600}]

  guid = "g1"
}`,
      `table_trigger on_insert {
  actions = {insert: true}

  guid = "g1"
}`,
      `query "list_items" {
    |set:"items":$rows

  guid = "g1"
}`,
      `query "status" {
  response = \`\`\`
    {
      ok: true
    }
    \`\`\`

  guid = "g1"
}`,
    ];
    for (const text of flushViolations) {
      const hits = guidHits(text);
      assert.equal(hits.length, 1, text);
      assert.equal(
        hits[0]?.message,
        "guid must not have a blank line above it when it follows a single-line value",
      );
    }

    const closerViolations = [
      `agent "helper" {
  tools = [
    {name: "lookup"}
  ]
  guid = "g1"
}`,
      `table item {
  index = [
    {type: "primary", field: [{name: "id"}]}
  ]
  guid = "g1"
}`,
      `function "example" {
  tags = [
    "alpha"
    "beta"
  ]
  guid = "g1"
}`,
    ];
    for (const text of closerViolations) {
      const hits = guidHits(text);
      assert.equal(hits.length, 1, text);
      assert.equal(
        hits[0]?.message,
        "guid must have a blank line above it when it follows a block closer",
      );
    }
  });

  it("guid_placement ignores a missing guid, fenced text, and a comment predecessor", () => {
    assert.deepEqual(
      guidHits(`function "example" {
  input {
  }

  stack {
  }

  response = $ok
}`),
      [],
    );

    const fenced = `function "example" {
  stack {
    db.query item {
      mock = {
        sample: \`\`\`
          guid = "inside"
          \`\`\`
      }
    }
  }

  response = $ok
}`;
    assert.deepEqual(guidHits(fenced), []);

    const commented = `function "example" {
  response = $ok
  // keep this identifier
  guid = "g1"
}`;
    assert.deepEqual(guidHits(commented), []);
  });

  it("guid_placement is on by default and honors disable:next", () => {
    const extraBlank = `function "example" {
  response = $ok

  guid = "g1"
}`;
    const hits = guidHits(extraBlank);
    assert.equal(hits.length, 1);
    assert.equal(hits[0]?.severity, "warning");

    const disabled = guidHits(extraBlank, { disabled_rules: ["guid_placement"] });
    assert.equal(disabled.length, 0);

    const suppressed = `function "example" {
  response = $ok
  // xanoscriptlint:disable:next guid_placement

  guid = "g1"
}`;
    assert.equal(guidHits(suppressed).length, 0);
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
