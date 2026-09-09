import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveConfig } from "../src/config.js";
import { fixFile } from "../src/lint.js";
import {
  AFTER_COLON_SPACES_MOCK_XS,
  ALIGNED_FENCED_MULTILINE_XS,
  ALIGNED_MOCK_XS,
  CLEAN_XS,
  FENCED_MULTILINE_ARRAY_XS,
  FENCED_MULTILINE_OBJECT_XS,
  MISALIGNED_UNFENCED_MULTILINE_XS,
  MOCK_LONG_NAME,
  MOCK_SHORT_NAME,
  NONCANONICAL_MULTILINE_MOCK_XS,
  NULL_RESPONSE_XS,
  OVERPADDED_LONG_MOCK_XS,
  UNDERPADDED_MOCK_XS,
  UNFENCED_MULTILINE_ARRAY_XS,
  UNFENCED_MULTILINE_OBJECT_XS,
  wrapMockBlock,
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

  it("aligns mock colons and leaves text after the colon alone", () => {
    const result = fixFile({ path: "mock.xs", text: UNDERPADDED_MOCK_XS }, config());
    assert.equal(result.changed, true);
    assert.equal(result.text, ALIGNED_MOCK_XS);
    assert.equal(result.corrections.length, 1);
    assert.equal(result.corrections[0].ruleId, "align_mock_colons");
    assert.equal(result.corrections[0].file, "mock.xs");

    const over = fixFile({ path: "over.xs", text: OVERPADDED_LONG_MOCK_XS }, config());
    assert.equal(over.changed, true);
    assert.equal(over.text, ALIGNED_MOCK_XS);

    const spaced = fixFile({ path: "spaces.xs", text: AFTER_COLON_SPACES_MOCK_XS }, config());
    assert.equal(spaced.changed, true);
    assert.match(spaced.text, new RegExp(`${MOCK_SHORT_NAME}\\s+:    \\{id: 1\\}`));
    assert.match(spaced.text, new RegExp(`${MOCK_LONG_NAME}: \\{id: 2\\}`));

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

  it("preserves each line terminator when aligning mock colons", () => {
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

  it("does not rewrite aligned mocks or a disabled align_mock_colons rule", () => {
    const clean = fixFile({ path: "ok.xs", text: ALIGNED_MOCK_XS }, config());
    assert.equal(clean.changed, false);
    assert.equal(clean.text, ALIGNED_MOCK_XS);

    const off = fixFile(
      { path: "mock.xs", text: UNDERPADDED_MOCK_XS },
      config({ disabled_rules: ["align_mock_colons"] }),
    );
    assert.equal(off.changed, false);
    assert.equal(off.text, UNDERPADDED_MOCK_XS);
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
    assert.equal(object.corrections[0].ruleId, "fence_multiline_mocks");
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
        parts.push(`          \`\`\`${keyEnding}`);
        continue;
      }
      parts.push(`${underLines[i]}${endings[i]}`);
    }
    assert.equal(result.text, parts.join(""));
  });

  it("aligns and fences a misaligned multiline mock in one pass", () => {
    const result = fixFile(
      { path: "both.xs", text: MISALIGNED_UNFENCED_MULTILINE_XS },
      config(),
    );
    assert.equal(result.changed, true);
    assert.equal(result.text, ALIGNED_FENCED_MULTILINE_XS);
    assert.equal(
      result.corrections.some((c) => c.ruleId === "align_mock_colons"),
      true,
    );
    assert.equal(
      result.corrections.some((c) => c.ruleId === "fence_multiline_mocks"),
      true,
    );
  });

  it("does not rewrite fenced mocks, disabled fence_multiline_mocks, or suppressed lines", () => {
    const clean = fixFile({ path: "ok.xs", text: FENCED_MULTILINE_OBJECT_XS }, config());
    assert.equal(clean.changed, false);
    assert.equal(clean.text, FENCED_MULTILINE_OBJECT_XS);

    const off = fixFile(
      { path: "obj.xs", text: UNFENCED_MULTILINE_OBJECT_XS },
      config({ disabled_rules: ["fence_multiline_mocks"] }),
    );
    assert.equal(off.changed, false);
    assert.equal(off.text, UNFENCED_MULTILINE_OBJECT_XS);

    const suppressedText = `function "example" {
  input {
  }

  stack {
    db.query item {
      mock = {
        // xanoscriptlint:disable:next fence_multiline_mocks
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
});
