import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveConfig } from "../src/config.js";
import { fixFile } from "../src/lint.js";
import { CLEAN_XS, NULL_RESPONSE_XS } from "./support.js";

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
});
