import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveConfig } from "../src/config.js";
import { fixFile } from "../src/lint.js";
import {
  AFTER_COLON_SPACES_MOCK_XS,
  ALIGNED_FENCED_INPUT_XS,
  ALIGNED_FENCED_MULTILINE_XS,
  ALIGNED_MOCK_XS,
  CLEAN_XS,
  ENUM_V63,
  ENUM_V64,
  inlineEnumDecl,
  wrappedEnumDecl,
  FENCED_INPUT_ARRAY_XS,
  FENCED_INPUT_OBJECT_XS,
  FENCED_MULTILINE_ARRAY_XS,
  FENCED_MULTILINE_OBJECT_XS,
  INVALID_DOUBLE_OPENER_XS,
  INVALID_FUNCTION_RUN_OUTDENTED_MOCK_XS,
  MISALIGNED_UNFENCED_INPUT_XS,
  MISALIGNED_UNFENCED_MULTILINE_XS,
  MOCK_LONG_NAME,
  MOCK_SHORT_NAME,
  NEGATIVE_DEFAULT_FIXED_XS,
  NEGATIVE_DEFAULT_XS,
  NONCANONICAL_MULTILINE_MOCK_XS,
  NULL_RESPONSE_XS,
  OVERPADDED_LONG_MOCK_XS,
  UNDERPADDED_MOCK_XS,
  UNFENCED_INPUT_ARRAY_XS,
  UNFENCED_INPUT_OBJECT_XS,
  UNFENCED_FUNCTION_RUN_MULTILINE_MOCK_XS,
  UNFENCED_MULTILINE_ARRAY_XS,
  UNFENCED_MULTILINE_OBJECT_XS,
  VALID_FUNCTION_RUN_COMPACT_MOCK_XS,
  VALID_SIBLING_FENCES_XS,
  ZERO_DEFAULT_FIXED_XS,
  ZERO_DEFAULT_XS,
  wrapInputDecls,
  wrapMockBlock,
  wrapAssign,
  inlineAssignObj,
  wrappedAssignObj,
  inlineAssignArr,
  wrappedAssignArr,
  ASSIGN_LINE_63,
  ASSIGN_LINE_64,
} from "./support.js";

function config(overrides: Parameters<typeof resolveConfig>[0] = {}) {
  return resolveConfig(overrides, "/tmp", null);
}

describe("fixFile", () => {
  it("strips a trailing newline and reports a correction", () => {
    const file = { path: "nl.xs", text: `${CLEAN_XS}\n` };
    const result = fixFile(file, config());
    assert.equal(result.changed, true);
    assert.equal(result.text, CLEAN_XS);
    assert.equal(result.corrections.length, 1);
    assert.equal(result.corrections[0].ruleId, "no_trailing_newline");
    assert.equal(result.corrections[0].file, "nl.xs");
  });

  it("strips spaces and tabs after the closing brace", () => {
    const file = { path: "ws.xs", text: `${CLEAN_XS}  \t \n` };
    const result = fixFile(file, config());
    assert.equal(result.changed, true);
    assert.equal(result.text, CLEAN_XS);
    assert.equal(result.corrections.length, 1);
    assert.equal(result.corrections[0].ruleId, "no_trailing_newline");
  });

  it("makes no change to an already-clean file", () => {
    const result = fixFile({ path: "clean.xs", text: CLEAN_XS }, config());
    assert.equal(result.changed, false);
    assert.equal(result.text, CLEAN_XS);
    assert.deepEqual(result.corrections, []);
  });

  it("does not fix a suppressed no_trailing_newline violation", () => {
    const text = `// xanoscriptlint:disable no_trailing_newline\n${CLEAN_XS}\n`;
    const result = fixFile({ path: "suppressed.xs", text }, config());
    assert.equal(result.changed, false);
    assert.equal(result.text, text);
    assert.deepEqual(result.corrections, []);
  });

  it("does not rewrite an unfixable file that does not end with }", () => {
    const text = "not a closing brace\n";
    const result = fixFile({ path: "bad.xs", text }, config());
    assert.equal(result.changed, false);
    assert.equal(result.text, text);
    assert.deepEqual(result.corrections, []);
  });

  it("does not run the fixer when the rule is disabled", () => {
    const file = { path: "nl.xs", text: `${CLEAN_XS}\n` };
    const result = fixFile(file, config({ disabled_rules: ["no_trailing_newline"] }));
    assert.equal(result.changed, false);
    assert.equal(result.text, file.text);
    assert.deepEqual(result.corrections, []);
  });

  it("rewrites response = null when no_null_response is opted in", () => {
    const file = { path: "null.xs", text: NULL_RESPONSE_XS };
    const result = fixFile(file, config({ opt_in_rules: ["no_null_response"] }));
    assert.equal(result.changed, true);
    assert.equal(result.text, NULL_RESPONSE_XS.replace("response = null", "response = {}"));
    assert.equal(result.corrections.length, 1);
    assert.equal(result.corrections[0].ruleId, "no_null_response");
    assert.equal(result.corrections[0].file, "null.xs");
  });

  it("does not rewrite response = null when no_null_response is off", () => {
    const file = { path: "null.xs", text: NULL_RESPONSE_XS };
    const result = fixFile(file, config());
    assert.equal(result.changed, false);
    assert.equal(result.text, NULL_RESPONSE_XS);
    assert.deepEqual(result.corrections, []);
  });

  it("does not rewrite response = null inside a string literal", () => {
    const text = `function "x" {\n  value = "response = null"\n}`;
    const result = fixFile(
      { path: "quoted.xs", text },
      config({ opt_in_rules: ["no_null_response"] }),
    );
    assert.equal(result.changed, false);
    assert.equal(result.text, text);
    assert.deepEqual(result.corrections, []);
  });

  it("aligns object colons and normalizes the space after the colon", () => {
    const result = fixFile({ path: "mock.xs", text: UNDERPADDED_MOCK_XS }, config());
    assert.equal(result.changed, true);
    assert.equal(result.text, ALIGNED_MOCK_XS);
    assert.equal(result.corrections.length, 1);
    assert.equal(result.corrections[0].ruleId, "align_object_colons");
    assert.equal(result.corrections[0].file, "mock.xs");

    const over = fixFile({ path: "over.xs", text: OVERPADDED_LONG_MOCK_XS }, config());
    assert.equal(over.changed, true);
    assert.equal(over.text, ALIGNED_MOCK_XS);

    const spaced = fixFile({ path: "spaces.xs", text: AFTER_COLON_SPACES_MOCK_XS }, config());
    assert.equal(spaced.changed, true);
    assert.equal(spaced.text, ALIGNED_MOCK_XS);

    const multiline = wrapMockBlock(
      `        ${MOCK_SHORT_NAME}: \`\`\`
          [
            {id: 1}
          ]
          \`\`\`
        ${MOCK_LONG_NAME}: []`,
    );
    const fixedMulti = fixFile({ path: "multi.xs", text: multiline }, config());
    assert.equal(fixedMulti.changed, true);
    assert.match(fixedMulti.text, /\[\s+\{id: 1\}\s+\]/);
    assert.doesNotMatch(fixedMulti.text, new RegExp(`${MOCK_SHORT_NAME}:\`\`\``));
  });

  it("preserves each line terminator when aligning object colons", () => {
    const underLines = UNDERPADDED_MOCK_XS.split("\n");
    const alignedLines = ALIGNED_MOCK_XS.split("\n");
    let mixed = "";
    let expected = "";
    for (let i = 0; i < underLines.length; i += 1) {
      const ending = i < underLines.length - 1 ? (i % 2 === 0 ? "\r\n" : "\n") : "";
      mixed += `${underLines[i]}${ending}`;
      expected += `${alignedLines[i]}${ending}`;
    }
    const result = fixFile({ path: "mixed.xs", text: mixed }, config());
    assert.equal(result.changed, true);
    assert.equal(result.text, expected);
  });

  it("does not rewrite aligned objects or a disabled align_object_colons rule", () => {
    const clean = fixFile({ path: "ok.xs", text: ALIGNED_MOCK_XS }, config());
    assert.equal(clean.changed, false);
    assert.equal(clean.text, ALIGNED_MOCK_XS);

    const off = fixFile(
      { path: "mock.xs", text: UNDERPADDED_MOCK_XS },
      config({ disabled_rules: ["align_object_colons"] }),
    );
    assert.equal(off.changed, false);
    assert.equal(off.text, UNDERPADDED_MOCK_XS);
  });

  it("aligns input blocks, nested objects independently, and inline pairs", () => {
    const input = `function "example" {
  input {
  }

  stack {
    function.run "Orders/dispatch" {
      input = {
        user_id: $input.user_id
        award_uuid: $input.award_uuid
        reason: $input.reason
      }
    } as $dispatch
  }

  response = $dispatch
}`;
    const fixedInput = fixFile({ path: "input.xs", text: input }, config());
    assert.equal(fixedInput.changed, true);
    assert.match(fixedInput.text, /user_id {3}: \$input\.user_id/);
    assert.match(fixedInput.text, /award_uuid: \$input\.award_uuid/);

    const nested = `function "example" {
  input {
  }

  stack {
    db.add job {
      data = {
        short: "keep_parent_assignment_wrapped"
        nested: {
          inner_longer: 2
          x: 3
        }
      }
    }
  }

  response = $job
}`;
    const fixedNested = fixFile({ path: "nested.xs", text: nested }, config());
    assert.equal(fixedNested.changed, true);
    assert.match(fixedNested.text, /short : "keep_parent_assignment_wrapped"/);
    assert.match(fixedNested.text, /nested: \{/);
    assert.match(fixedNested.text, /inner_longer: 2/);
    assert.match(fixedNested.text, /x {11}: 3/);
    assert.doesNotMatch(fixedNested.text, /short\s{2,}:/);

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
    const fixedInline = fixFile({ path: "inline.xs", text: inline }, config());
    assert.equal(fixedInline.changed, true);
    assert.match(fixedInline.text, /input = \{user_id: 1, amount: 2\}/);
  });

  it("does not fix a suppressed align_object_colons violation", () => {
    const text = `function "example" {
  input {
  }

  stack {
    function.run "Orders/dispatch" {
      input = {
        // xanoscriptlint:disable:next align_object_colons
        id: 1
        extra_long_name: 2
      }
    } as $dispatch
  }

  response = $dispatch
}`;
    const result = fixFile({ path: "suppressed.xs", text }, config());
    assert.equal(result.changed, false);
    assert.equal(result.text, text);
    assert.deepEqual(result.corrections, []);
  });

  it("does not fix a suppressed no_null_response violation", () => {
    const text = `function "x" {\n  // xanoscriptlint:disable:next no_null_response\n  response = null\n}`;
    const result = fixFile(
      { path: "suppressed.xs", text },
      config({ opt_in_rules: ["no_null_response"] }),
    );
    assert.equal(result.changed, false);
    assert.equal(result.text, text);
    assert.deepEqual(result.corrections, []);
  });

  it("rewrites only unsuppressed response = null lines", () => {
    const text = `function "x" {
  // xanoscriptlint:disable:next no_null_response
  response = null
  response = null
}`;
    const result = fixFile(
      { path: "mixed.xs", text },
      config({ opt_in_rules: ["no_null_response"] }),
    );
    assert.equal(result.changed, true);
    assert.equal(
      result.text,
      `function "x" {
  // xanoscriptlint:disable:next no_null_response
  response = null
  response = {}
}`,
    );
    assert.equal(result.corrections.length, 1);
    assert.equal(result.corrections[0].ruleId, "no_null_response");
    assert.equal(result.corrections[0].line, 4);
  });

  it("fences unfenced multiline mock objects and arrays", () => {
    const object = fixFile(
      { path: "obj.xs", text: UNFENCED_MULTILINE_OBJECT_XS },
      config(),
    );
    assert.equal(object.changed, true);
    assert.equal(object.text, FENCED_MULTILINE_OBJECT_XS);
    assert.equal(object.corrections.length, 1);
    assert.equal(object.corrections[0].ruleId, "fence_multiline_values");
    assert.equal(object.corrections[0].file, "obj.xs");
    assert.equal(object.corrections[0].line, 8);

    const array = fixFile(
      { path: "arr.xs", text: UNFENCED_MULTILINE_ARRAY_XS },
      config(),
    );
    assert.equal(array.changed, true);
    assert.equal(array.text, FENCED_MULTILINE_ARRAY_XS);

    const again = fixFile({ path: "obj.xs", text: object.text }, config());
    assert.equal(again.changed, false);
    assert.equal(again.text, FENCED_MULTILINE_OBJECT_XS);
  });

  it("fences unfenced multiline input objects and arrays", () => {
    const object = fixFile({ path: "in-obj.xs", text: UNFENCED_INPUT_OBJECT_XS }, config());
    assert.equal(object.changed, true);
    assert.equal(object.text, FENCED_INPUT_OBJECT_XS);
    assert.equal(object.corrections[0]?.ruleId, "fence_multiline_values");
    assert.equal(object.corrections[0]?.line, 8);

    const array = fixFile({ path: "in-arr.xs", text: UNFENCED_INPUT_ARRAY_XS }, config());
    assert.equal(array.changed, true);
    assert.equal(array.text, FENCED_INPUT_ARRAY_XS);
  });

  it("preserves each line terminator when fencing multiline mocks", () => {
    const underLines = UNFENCED_MULTILINE_ARRAY_XS.split("\n");
    const endings = underLines.map((_, i) =>
      i < underLines.length - 1 ? (i % 2 === 0 ? "\r\n" : "\n") : "",
    );
    let mixed = "";
    for (let i = 0; i < underLines.length; i += 1) {
      mixed += `${underLines[i]}${endings[i]}`;
    }

    const result = fixFile({ path: "mixed.xs", text: mixed }, config());
    assert.equal(result.changed, true);

    const keyIndex = underLines.findIndex((line) => line.includes(": ["));
    const keyEnding = endings[keyIndex];
    const parts: string[] = [];
    for (let i = 0; i < underLines.length; i += 1) {
      if (i === keyIndex) {
        parts.push(`${underLines[i].replace(/: \[$/, ": ```")}${endings[i]}`);
        parts.push(`          [${keyEnding}`);
        continue;
      }
      if (i === keyIndex + 1) {
        parts.push(`            {id: 8}${endings[i]}`);
        continue;
      }
      if (i === keyIndex + 2) {
        parts.push(`          ]${endings[i]}`);
        parts.push(`          \`\`\`${endings[i]}`);
        continue;
      }
      parts.push(`${underLines[i]}${endings[i]}`);
    }
    assert.equal(result.text, parts.join(""));
  });

  it("keeps the closing fence at EOF when the mock value has no trailing newline", () => {
    const text = `function "example" {
  stack {
    db.query item {
      mock = {
        "checkout lists open carts": [
          {id: 8}
        ]`;
    const result = fixFile({ path: "eof.xs", text }, config());
    assert.equal(result.changed, true);
    assert.equal(
      result.text,
      `function "example" {
  stack {
    db.query item {
      mock = {
        "checkout lists open carts": \`\`\`
          [
            {id: 8}
          ]
          \`\`\``,
    );
    assert.equal(result.text.endsWith("```"), true);
    assert.doesNotMatch(result.text, /\]```/);
  });

  it("aligns and fences a misaligned multiline mock in one pass", () => {
    const result = fixFile(
      { path: "both.xs", text: MISALIGNED_UNFENCED_MULTILINE_XS },
      config(),
    );
    assert.equal(result.changed, true);
    assert.equal(result.text, ALIGNED_FENCED_MULTILINE_XS);
    assert.equal(
      result.corrections.some((c) => c.ruleId === "align_object_colons"),
      true,
    );
    assert.equal(
      result.corrections.some((c) => c.ruleId === "fence_multiline_values"),
      true,
    );
  });

  it("aligns and fences a misaligned multiline input value in one pass", () => {
    const result = fixFile({ path: "in-both.xs", text: MISALIGNED_UNFENCED_INPUT_XS }, config());
    assert.equal(result.changed, true);
    assert.equal(result.text, ALIGNED_FENCED_INPUT_XS);
    assert.equal(
      result.corrections.some((c) => c.ruleId === "align_object_colons"),
      true,
    );
    assert.equal(
      result.corrections.some((c) => c.ruleId === "fence_multiline_values"),
      true,
    );
  });

  it("does not rewrite fenced mocks, disabled fence_multiline_values, or suppressed lines", () => {
    const clean = fixFile({ path: "ok.xs", text: FENCED_MULTILINE_OBJECT_XS }, config());
    assert.equal(clean.changed, false);
    assert.equal(clean.text, FENCED_MULTILINE_OBJECT_XS);

    const off = fixFile(
      { path: "obj.xs", text: UNFENCED_MULTILINE_OBJECT_XS },
      config({ disabled_rules: ["fence_multiline_values"] }),
    );
    assert.equal(off.changed, false);
    assert.equal(off.text, UNFENCED_MULTILINE_OBJECT_XS);

    const suppressedText = `function "example" {
  input {
  }

  stack {
    db.query item {
      mock = {
        // xanoscriptlint:disable:next fence_multiline_values
        "checkout applies gift wrap": {
          issued: []
        }
      }
    }
  }

  response = $item
}`;
    const suppressed = fixFile({ path: "suppressed.xs", text: suppressedText }, config());
    assert.equal(suppressed.changed, false);
    assert.equal(suppressed.text, suppressedText);
  });

  it("reports a non-canonical multiline mock without rewriting it", () => {
    const result = fixFile(
      { path: "odd.xs", text: NONCANONICAL_MULTILINE_MOCK_XS },
      config(),
    );
    assert.equal(result.changed, false);
    assert.equal(result.text, NONCANONICAL_MULTILINE_MOCK_XS);
  });

  it("does not share one fence body across sibling mock keys", () => {
    const aligned = fixFile({ path: "siblings.xs", text: VALID_SIBLING_FENCES_XS }, config());
    assert.doesNotMatch(
      aligned.text,
      /:\s*```\n[^\n]*:\s*```/,
    );
    assert.equal((aligned.text.match(/```/g) ?? []).length, 4);
    assert.match(aligned.text, /id {5}: 1/);
    assert.match(aligned.text, /coupon_code/);

    const invalid = fixFile({ path: "double.xs", text: INVALID_DOUBLE_OPENER_XS }, config());
    assert.match(invalid.text, /:\s*```\n[^\n]*:\s*```/);
  });

  it("does not fence function.run mocks or outdent mock from input", () => {
    const compact = fixFile(
      { path: "run.xs", text: VALID_FUNCTION_RUN_COMPACT_MOCK_XS },
      config(),
    );
    assert.doesNotMatch(compact.text, /```/);
    assert.match(compact.text, /\{queued: \[\], sent: \[\], done: false\}/);
    const compactLines = compact.text.split("\n");
    const inputLine = compactLines.find((line) => line.trimStart().startsWith("input ="));
    const mockLine = compactLines.find((line) => line.trimStart().startsWith("mock ="));
    assert.equal(inputLine !== undefined && mockLine !== undefined, true);
    assert.equal(inputLine?.match(/^ */)?.[0].length, mockLine?.match(/^ */)?.[0].length);

    const multiline = fixFile(
      { path: "run-multi.xs", text: UNFENCED_FUNCTION_RUN_MULTILINE_MOCK_XS },
      config(),
    );
    assert.doesNotMatch(multiline.text, /```/);
    assert.match(multiline.text, /"checkout empty cart"\s*:\s*\{\n/);

    const outdented = fixFile(
      { path: "outdent.xs", text: INVALID_FUNCTION_RUN_OUTDENTED_MOCK_XS },
      config(),
    );
    assert.equal(outdented.changed, true);
    const fixedLines = outdented.text.split("\n");
    const fixedInput = fixedLines.find((line) => line.trimStart().startsWith("input ="));
    const fixedMock = fixedLines.find((line) => line.trimStart().startsWith("mock ="));
    assert.equal(fixedInput !== undefined && fixedMock !== undefined, true);
    assert.equal(fixedInput?.match(/^ */)?.[0].length, fixedMock?.match(/^ */)?.[0].length);
    assert.match(outdented.text, /function\.run[^\n]*\{\n(?:.*\n)* *mock = \{/);

    const suppressedOutdent = `function "example" {
  input {
  }

  stack {
    db.query item {
      mock = {
        "checkout applies gift wrap": {
          queued: []
          sent: []
          extra: "keep_parent_assignment_wrapped"
        }
      }
    }
    conditional {
      if ($ok) {
        foreach ($items) {
          each {
            function.run "Orders/apply_discounts" {
              input = {
                user_id: $cart_user_id
                reason : "manual"
                extra  : "keep_parent_assignment_wrapped"
              }

              // xanoscriptlint:disable:next fence_multiline_values
          mock = {
            "checkout empty cart": {queued: [], sent: [], done: false, extra: "keep_parent_assignment_wrapped"}
          }
            } as $discount_result
          }
        }
      }
    }
  }

  response = $ok
}`;
    const kept = fixFile({ path: "suppressed-outdent.xs", text: suppressedOutdent }, config());
    assert.equal(kept.changed, true);
    assert.match(kept.text, /"checkout applies gift wrap": ```/);
    assert.match(kept.text, /\n {10}mock = \{\n/);
  });

  it("does not rewrite a tab-indented multiline value", () => {
    const text = wrapMockBlock(
      `        "checkout lists open carts": [
\t  {id: 8}
        ]`,
    );
    const result = fixFile({ path: "tabs.xs", text }, config());
    assert.equal(result.changed, false);
    assert.equal(result.text, text);
  });

  it("does not rewrite data or join multiline values", () => {
    const text = `function "example" {
  input {
  }

  stack {
    db.add job {
      data = {
        input: {
          round_uuid : $round
          extra_field: "keep_parent_assignment_wrapped"
        }
      }
    }
    db.query item {
      join = {
        other: {
          table      : "other"
          extra_field: "keep_parent_assignment_wrapped"
        }
      }
    }
  }

  response = $job
}`;
    const result = fixFile({ path: "data.xs", text }, config());
    assert.equal(result.changed, false);
    assert.equal(result.text, text);
  });

  it("strips a zero numeric default and quotes a negative numeric default", () => {
    const zero = fixFile({ path: "zero.xs", text: ZERO_DEFAULT_XS }, config());
    assert.equal(zero.changed, true);
    assert.equal(zero.text, ZERO_DEFAULT_FIXED_XS);
    assert.equal(zero.corrections.length, 6);
    assert.equal(zero.corrections[0]?.ruleId, "no_zero_numeric_default");
    assert.equal(zero.corrections[0]?.file, "zero.xs");
    assert.equal(zero.corrections[0]?.line, 3);

    const again = fixFile({ path: "zero.xs", text: zero.text }, config());
    assert.equal(again.changed, false);
    assert.equal(again.text, ZERO_DEFAULT_FIXED_XS);

    const negative = fixFile({ path: "neg.xs", text: NEGATIVE_DEFAULT_XS }, config());
    assert.equal(negative.changed, true);
    assert.equal(negative.text, NEGATIVE_DEFAULT_FIXED_XS);
    assert.equal(negative.corrections.length, 6);
    assert.equal(negative.corrections[0]?.ruleId, "quote_negative_numeric_default");
    assert.equal(negative.corrections[0]?.line, 3);

    const againNeg = fixFile({ path: "neg.xs", text: negative.text }, config());
    assert.equal(againNeg.changed, false);
    assert.equal(againNeg.text, NEGATIVE_DEFAULT_FIXED_XS);
  });

  it("preserves line endings and suppressions when rewriting numeric defaults", () => {
    const zeroLines = ZERO_DEFAULT_XS.split("\n");
    const fixedLines = ZERO_DEFAULT_FIXED_XS.split("\n");
    let mixed = "";
    let expected = "";
    for (let i = 0; i < zeroLines.length; i += 1) {
      const ending = i < zeroLines.length - 1 ? (i % 2 === 0 ? "\r\n" : "\n") : "";
      mixed += `${zeroLines[i]}${ending}`;
      expected += `${fixedLines[i]}${ending}`;
    }
    const mixedResult = fixFile({ path: "mixed.xs", text: mixed }, config());
    assert.equal(mixedResult.changed, true);
    assert.equal(mixedResult.text, expected);

    const suppressed = wrapInputDecls(
      `    // xanoscriptlint:disable:next no_zero_numeric_default
    int retry_count?=0
    int page?=1`,
    );
    const kept = fixFile({ path: "suppressed.xs", text: suppressed }, config());
    assert.equal(kept.changed, false);
    assert.equal(kept.text, suppressed);

    const negativeSuppressed = wrapInputDecls(
      `    // xanoscriptlint:disable:next quote_negative_numeric_default
    int quantity?=-1
    int page?=1`,
    );
    const keptNeg = fixFile({ path: "suppressed-neg.xs", text: negativeSuppressed }, config());
    assert.equal(keptNeg.changed, false);
    assert.equal(keptNeg.text, negativeSuppressed);
  });

  it("strips a negative zero instead of quoting it", () => {
    const text = wrapInputDecls(`    int offset?=-0`);
    const result = fixFile({ path: "negzero.xs", text }, config());
    assert.equal(result.changed, true);
    assert.equal(result.text, wrapInputDecls(`    int offset?`));
    assert.equal(
      result.corrections.some((c) => c.ruleId === "no_zero_numeric_default"),
      true,
    );
    assert.equal(
      result.corrections.some((c) => c.ruleId === "quote_negative_numeric_default"),
      false,
    );
  });

  it("wraps an over-threshold enum values array and inserts the whitespace line", () => {
    const text = wrapInputDecls(inlineEnumDecl("enum lane", ENUM_V64));
    const expected = wrapInputDecls(wrappedEnumDecl("enum lane", ENUM_V64));
    const result = fixFile({ path: "wrap.xs", text }, config());
    assert.equal(result.changed, true);
    assert.equal(result.text, expected);
    assert.equal(result.corrections.length, 1);
    assert.equal(result.corrections[0]?.ruleId, "wrap_enum_values");
    assert.equal(result.corrections[0]?.line, 4);

    const again = fixFile({ path: "wrap.xs", text: result.text }, config());
    assert.equal(again.changed, false);
    assert.equal(again.text, expected);
  });

  it("collapses an under-threshold wrapped enum values array", () => {
    const text = wrapInputDecls(wrappedEnumDecl("enum lane", ENUM_V63));
    const expected = wrapInputDecls(inlineEnumDecl("enum lane", ENUM_V63));
    const result = fixFile({ path: "inline.xs", text }, config());
    assert.equal(result.changed, true);
    assert.equal(result.text, expected);
    assert.equal(result.corrections[0]?.ruleId, "wrap_enum_values");

    const again = fixFile({ path: "inline.xs", text: result.text }, config());
    assert.equal(again.changed, false);
    assert.equal(again.text, expected);
  });

  it("preserves CRLF when wrapping enum values", () => {
    const source = wrapInputDecls(inlineEnumDecl("enum lane", ENUM_V64));
    const expected = wrapInputDecls(wrappedEnumDecl("enum lane", ENUM_V64));
    const crlf = source.replace(/\n/g, "\r\n");
    const result = fixFile({ path: "crlf.xs", text: crlf }, config());
    assert.equal(result.changed, true);
    assert.equal(result.text, expected.replace(/\n/g, "\r\n"));
  });

  it("does not fence or realign an enum when wrapping alongside mock objects", () => {
    const text = `function "example" {
  input {
${inlineEnumDecl("enum lane", ENUM_V64)}
  }

  stack {
    db.query item {
      mock = {
        ${MOCK_SHORT_NAME}: {id: 1}
        ${MOCK_LONG_NAME}: {id: 2}
      }
    }
  }

  response = $ok
}`;
    const result = fixFile({ path: "both.xs", text }, config());
    assert.equal(result.changed, true);
    assert.equal(
      result.corrections.some((c) => c.ruleId === "wrap_enum_values"),
      true,
    );
    assert.equal(
      result.corrections.some((c) => c.ruleId === "align_object_colons"),
      true,
    );
    assert.equal(
      result.corrections.some((c) => c.ruleId === "fence_multiline_values"),
      false,
    );
    assert.equal(result.text.includes("```"), false);
    assert.equal(result.text.includes(wrappedEnumDecl("enum lane", ENUM_V64)), true);
    assert.match(result.text, /"checkout short"\s+: \{id: 1\}/);
  });

  it("collapses an under-threshold assignment object and is idempotent", () => {
    const text = wrapAssign("input", wrappedAssignObj(ASSIGN_LINE_63));
    const expected = wrapAssign("input", inlineAssignObj(ASSIGN_LINE_63));
    const result = fixFile({ path: "collapse.xs", text }, config());
    assert.equal(result.changed, true);
    assert.equal(result.text, expected);
    assert.equal(result.corrections[0]?.ruleId, "collapse_assignment_values");
    const again = fixFile({ path: "collapse.xs", text: result.text }, config());
    assert.equal(again.changed, false);
    assert.equal(again.text, expected);
  });

  it("preserves repeated spaces inside quoted scalars when collapsing", () => {
    const text = wrapAssign("input", wrappedAssignObj("a  b"));
    const expected = wrapAssign("input", inlineAssignObj("a  b"));
    const result = fixFile({ path: "quoted-spaces.xs", text }, config());
    assert.equal(result.changed, true);
    assert.equal(result.text, expected);
    assert.match(result.text, /"a {2}b"/);
  });

  it("collapses an under-threshold assignment array", () => {
    const text = wrapAssign("output", wrappedAssignArr("x"));
    const expected = wrapAssign("output", inlineAssignArr("x"));
    const result = fixFile({ path: "arr-in.xs", text }, config());
    assert.equal(result.changed, true);
    assert.equal(result.text, expected);
  });

  it("does not expand a long inline assignment", () => {
    const text = wrapAssign("input", inlineAssignObj(ASSIGN_LINE_64));
    const result = fixFile({ path: "inline.xs", text }, config());
    assert.equal(result.changed, false);
    assert.equal(result.text, text);
  });

  it("does not collapse when the one-line form reaches the threshold", () => {
    const text = wrapAssign("input", wrappedAssignObj(ASSIGN_LINE_64));
    const result = fixFile({ path: "keep.xs", text }, config());
    assert.equal(result.changed, false);
    assert.equal(result.text, text);
  });

  it("collapses a parent and keeps nested containers inline", () => {
    const text = wrapAssign(
      "input",
      `{
        outer: {inner_a: 1, inner_b: 2}
      }`,
    );
    const result = fixFile({ path: "nested.xs", text }, config());
    assert.equal(result.changed, true);
    assert.match(result.text, /input = \{outer: \{inner_a: 1, inner_b: 2\}\}/);
    assert.doesNotMatch(result.text, /inner_a:\n/);
  });

  it("preserves CRLF when collapsing assignment values", () => {
    const source = wrapAssign("input", wrappedAssignObj(ASSIGN_LINE_63));
    const expected = wrapAssign("input", inlineAssignObj(ASSIGN_LINE_63));
    const crlf = source.replace(/\n/g, "\r\n");
    const result = fixFile({ path: "crlf-assign.xs", text: crlf }, config());
    assert.equal(result.changed, true);
    assert.equal(result.text, expected.replace(/\n/g, "\r\n"));
  });

  it("does not rewrite a piped container", () => {
    const text = `function "example" {
  input {
  }

  stack {
    var $url {
      value = ["${"a".repeat(70)}"]|join:"/"
    }
  }

  response = $url
}`;
    const result = fixFile({ path: "pipe.xs", text }, config());
    assert.equal(result.changed, false);
    assert.equal(result.text, text);
  });
});
