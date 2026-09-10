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
    assert.equal(config.enabledRuleIds.has("align_object_colons"), true);
    assert.equal(config.enabledRuleIds.has("fence_multiline_values"), true);
    assert.equal(config.enabledRuleIds.has("wrap_enum_values"), true);
    assert.equal(config.enabledRuleIds.has("collapse_assignment_values"), true);
    assert.equal(config.enabledRuleIds.has("guid_placement"), true);
    assert.equal(config.enabledRuleIds.has("no_trailing_comments"), true);
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

  it("rejects the custom_rules token in disabled_rules and opt_in_rules", () => {
    assert.throws(
      () =>
        loadConfigText(
          `
disabled_rules:
  - custom_rules
custom_rules:
  no_todo:
    regex: TODO
`,
          "/tmp",
          null,
        ),
      /custom_rules is only valid in only_rules/,
    );
    assert.throws(
      () =>
        loadConfigText(
          `
opt_in_rules:
  - custom_rules
custom_rules:
  no_todo:
    regex: TODO
`,
          "/tmp",
          null,
        ),
      /custom_rules is only valid in only_rules/,
    );
  });

  it("parses wrap_enum_values wrap_at", () => {
    const config = resolveConfig(
      { wrap_enum_values: { wrap_at: 64 } },
      "/tmp",
      null,
    );
    assert.equal(config.ruleOptions.get("wrap_enum_values")?.wrapAt, 64);
  });

  it("parses collapse_assignment_values wrap_at", () => {
    const config = resolveConfig(
      { collapse_assignment_values: { wrap_at: 32 } },
      "/tmp",
      null,
    );
    assert.equal(config.ruleOptions.get("collapse_assignment_values")?.wrapAt, 32);
  });

  it("rejects a non-integer or non-positive wrap_at", () => {
    assert.throws(
      () => resolveConfig({ wrap_enum_values: { wrap_at: 0 } }, "/tmp", null),
      /wrap_enum_values.wrap_at must be an integer >= 1/,
    );
    assert.throws(
      () => resolveConfig({ wrap_enum_values: { wrap_at: 1.5 } }, "/tmp", null),
      /wrap_enum_values.wrap_at must be an integer >= 1/,
    );
    assert.throws(
      () => resolveConfig({ wrap_enum_values: { wrap_at: "64" } }, "/tmp", null),
      /wrap_enum_values.wrap_at must be an integer >= 1/,
    );
  });

  it("rejects wrap_at on a rule that does not declare it", () => {
    assert.throws(
      () => resolveConfig({ align_object_colons: { wrap_at: 64 } }, "/tmp", null),
      /unknown option for align_object_colons: wrap_at/,
    );
  });

  it("still rejects unknown options on wrap_enum_values", () => {
    assert.throws(
      () =>
        resolveConfig({ wrap_enum_values: { wrap_at: 64, extra: 1 } }, "/tmp", null),
      /unknown option for wrap_enum_values: extra/,
    );
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
