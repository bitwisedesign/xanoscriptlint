import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveConfig } from "../src/config.js";
import { lintFile } from "../src/lint.js";
import {
  ALIGNED_MOCK_ENTRIES,
  ALIGNED_MOCK_XS,
  CLEAN_XS,
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
    assert.equal(double.length >= 1, true);
    assert.match(double[0]?.message ?? "", /consecutive fence openers/);

    const outdented = lintFile(
      { path: "outdent.xs", text: INVALID_FUNCTION_RUN_OUTDENTED_MOCK_XS },
      config(),
    ).filter((v) => v.ruleId === "fence_multiline_values");
    assert.equal(outdented.length >= 1, true);
    assert.match(outdented[0]?.message ?? "", /indented with input inside function\.run/);

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
