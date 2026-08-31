import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ConfigError,
  loadConfigText,
  resolveConfig,
} from "../src/config.js";

describe("config enablement", () => {
  it("enables default-on rules with no config", () => {
    const config = resolveConfig({}, "/tmp", null);
    assert.equal(config.enabledRuleIds.has("empty_function_run"), true);
    assert.equal(config.enabledRuleIds.has("no_trailing_newline"), true);
    assert.equal(config.enabledRuleIds.has("no_var_response"), false);
    assert.deepEqual(config.included, ["**/*.xs"]);
  });

  it("opts out with disabled_rules", () => {
    const config = resolveConfig(
      { disabled_rules: ["no_trailing_newline"] },
      "/tmp",
      null,
    );
    assert.equal(config.enabledRuleIds.has("no_trailing_newline"), false);
    assert.equal(config.enabledRuleIds.has("empty_function_run"), true);
  });

  it("opts in with opt_in_rules", () => {
    const config = resolveConfig(
      { opt_in_rules: ["no_var_response"] },
      "/tmp",
      null,
    );
    assert.equal(config.enabledRuleIds.has("no_var_response"), true);
  });

  it("only_rules is exclusive", () => {
    const config = resolveConfig(
      { only_rules: ["empty_function_run"] },
      "/tmp",
      null,
    );
    assert.equal(config.enabledRuleIds.has("empty_function_run"), true);
    assert.equal(config.enabledRuleIds.has("no_trailing_newline"), false);
    assert.equal(config.enabledRuleIds.has("no_var_response"), false);
  });

  it("rejects only_rules combined with disabled_rules", () => {
    assert.throws(
      () =>
        resolveConfig(
          {
            only_rules: ["empty_function_run"],
            disabled_rules: ["no_trailing_newline"],
          },
          "/tmp",
          null,
        ),
      ConfigError,
    );
  });

  it("rejects unknown rule ids", () => {
    assert.throws(
      () => resolveConfig({ disabled_rules: ["not_a_rule"] }, "/tmp", null),
      /unknown rule id/,
    );
  });

  it("parses per-rule severity shorthand", () => {
    const config = resolveConfig(
      { empty_function_run: "warning" },
      "/tmp",
      null,
    );
    assert.equal(config.ruleOptions.get("empty_function_run")?.severity, "warning");
  });

  it("rejects a non-string severity instead of coercing it", () => {
    // A YAML list stringifies to "error", which must not pass validation.
    assert.throws(
      () => resolveConfig({ empty_function_run: { severity: ["error"] } }, "/tmp", null),
      /must be "error" or "warning"/,
    );
    assert.throws(
      () => resolveConfig({ empty_function_run: { severity: 1 } }, "/tmp", null),
      /must be "error" or "warning"/,
    );
  });

  it("always enables custom_rules unless only_rules omits them", () => {
    const withCustom = loadConfigText(
      `
custom_rules:
  no_todo:
    regex: TODO
`,
      "/tmp",
      null,
    );
    assert.equal(withCustom.enabledRuleIds.has("no_todo"), true);
    assert.equal(withCustom.customRules.length, 1);

    const onlyBuiltin = loadConfigText(
      `
only_rules:
  - empty_function_run
custom_rules:
  no_todo:
    regex: TODO
`,
      "/tmp",
      null,
    );
    assert.equal(onlyBuiltin.enabledRuleIds.has("no_todo"), false);
    assert.equal(onlyBuiltin.customRules.length, 0);

    const onlyCustomToken = loadConfigText(
      `
only_rules:
  - custom_rules
custom_rules:
  no_todo:
    regex: TODO
`,
      "/tmp",
      null,
    );
    assert.equal(onlyCustomToken.enabledRuleIds.has("no_todo"), true);
  });

  it("can disable a custom rule", () => {
    const config = loadConfigText(
      `
disabled_rules:
  - no_todo
custom_rules:
  no_todo:
    regex: TODO
`,
      "/tmp",
      null,
    );
    assert.equal(config.enabledRuleIds.has("no_todo"), false);
    assert.equal(config.customRules.length, 0);
  });

  it("rejects invalid custom regex", () => {
    assert.throws(
      () =>
        loadConfigText(
          `
custom_rules:
  bad:
    regex: "("
`,
          "/tmp",
          null,
        ),
      /regex is invalid/,
    );
  });
});
