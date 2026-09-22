import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyRuleOverrides,
  ConfigError,
  loadConfigText,
  resolveConfig,
} from "../src/config.js";

describe("config enablement", () => {
  it("enables default-on rules with no config", () => {
    const config = resolveConfig({}, "/tmp", null);
    assert.equal(config.enabledRuleIds.has("empty_function_run"), true);
    assert.equal(config.enabledRuleIds.has("no_trailing_newline"), true);
    assert.equal(config.enabledRuleIds.has("no_trailing_comments"), true);
    assert.equal(config.enabledRuleIds.has("no_reserved_var"), true);
    assert.equal(config.enabledRuleIds.has("align_object_colons"), false);
    assert.equal(config.enabledRuleIds.has("collapse_assignment_values"), false);
    assert.equal(config.enabledRuleIds.has("fence_multiline_values"), false);
    assert.equal(config.enabledRuleIds.has("guid_placement"), false);
    assert.equal(config.enabledRuleIds.has("no_null_response"), false);
    assert.equal(config.enabledRuleIds.has("no_zero_numeric_default"), false);
    assert.equal(config.enabledRuleIds.has("no_zero_set_filter"), false);
    assert.equal(config.enabledRuleIds.has("quote_negative_numeric_default"), false);
    assert.equal(config.enabledRuleIds.has("unquote_bare_test_names"), false);
    assert.equal(config.enabledRuleIds.has("unquote_enum_defaults"), false);
    assert.equal(config.enabledRuleIds.has("wrap_enum_values"), false);
    assert.equal(config.enabledRuleIds.has("wrap_piped_values"), false);
    assert.equal(config.enabledRuleIds.has("wrap_tags_values"), false);
    assert.equal(config.enabledRuleIds.has("tags_placement"), false);
    assert.deepEqual(config.included, ["**/*.xs"]);
    assert.equal(config.strict, false);
  });

  it("parses strict as a boolean", () => {
    assert.equal(resolveConfig({ strict: true }, "/tmp", null).strict, true);
    assert.equal(resolveConfig({ strict: false }, "/tmp", null).strict, false);
    assert.equal(resolveConfig({}, "/tmp", null).strict, false);
  });

  it("rejects a non-boolean strict", () => {
    assert.throws(
      () => loadConfigText("strict: yes-please\n", "/tmp", null),
      /strict must be a boolean/,
    );
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
      { opt_in_rules: ["no_null_response"] },
      "/tmp",
      null,
    );
    assert.equal(config.enabledRuleIds.has("no_null_response"), true);
  });

  it("disabled_rules wins over opt_in_rules", () => {
    const config = resolveConfig(
      {
        opt_in_rules: ["align_object_colons"],
        disabled_rules: ["align_object_colons"],
      },
      "/tmp",
      null,
    );
    assert.equal(config.enabledRuleIds.has("align_object_colons"), false);
  });

  it("maps deprecated no_var_response to no_reserved_var", () => {
    const enabled = resolveConfig(
      { opt_in_rules: ["no_var_response"] },
      "/tmp",
      null,
    );
    assert.equal(enabled.enabledRuleIds.has("no_reserved_var"), true);
    assert.equal(enabled.enabledRuleIds.has("no_var_response"), false);

    const disabled = resolveConfig(
      { disabled_rules: ["no_var_response"] },
      "/tmp",
      null,
    );
    assert.equal(disabled.enabledRuleIds.has("no_reserved_var"), false);

    const options = resolveConfig({ no_var_response: "error" }, "/tmp", null);
    assert.equal(options.ruleOptions.get("no_reserved_var")?.severity, "error");
    assert.equal(options.ruleOptions.has("no_var_response"), false);

    const canonicalWins = resolveConfig(
      { no_var_response: "error", no_reserved_var: "warning" },
      "/tmp",
      null,
    );
    assert.equal(canonicalWins.ruleOptions.get("no_reserved_var")?.severity, "warning");
  });

  it("only_rules is exclusive", () => {
    const config = resolveConfig(
      { only_rules: ["empty_function_run"] },
      "/tmp",
      null,
    );
    assert.equal(config.enabledRuleIds.has("empty_function_run"), true);
    assert.equal(config.enabledRuleIds.has("no_trailing_newline"), false);
    assert.equal(config.enabledRuleIds.has("no_reserved_var"), false);
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

  it("does not treat a custom rule id as a builtin alias", () => {
    const config = loadConfigText(
      `
disabled_rules:
  - no_var_response
custom_rules:
  no_var_response:
    regex: TODO
`,
      "/tmp",
      null,
    );
    assert.equal(config.enabledRuleIds.has("no_var_response"), false);
    assert.equal(config.customRules.length, 0);
    assert.equal(config.enabledRuleIds.has("no_reserved_var"), true);
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

  it("parses wrap_piped_values wrap_at and filter_limit", () => {
    const config = resolveConfig(
      { wrap_piped_values: { wrap_at: 20, filter_limit: 4 } },
      "/tmp",
      null,
    );
    assert.equal(config.ruleOptions.get("wrap_piped_values")?.wrapAt, 20);
    assert.equal(config.ruleOptions.get("wrap_piped_values")?.filterLimit, 4);
  });

  it("parses wrap_enum_values wrap_at", () => {
    const config = resolveConfig(
      { wrap_enum_values: { wrap_at: 64 } },
      "/tmp",
      null,
    );
    assert.equal(config.ruleOptions.get("wrap_enum_values")?.wrapAt, 64);
  });

  it("parses wrap_tags_values wrap_at", () => {
    const config = resolveConfig(
      { wrap_tags_values: { wrap_at: 64 } },
      "/tmp",
      null,
    );
    assert.equal(config.ruleOptions.get("wrap_tags_values")?.wrapAt, 64);
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

  it("still rejects unknown options on wrap_piped_values", () => {
    assert.throws(
      () =>
        resolveConfig({ wrap_piped_values: { wrap_at: 34, extra: 1 } }, "/tmp", null),
      /unknown option for wrap_piped_values: extra/,
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

describe("CLI rule overrides", () => {
  it("opts in a default-off rule", () => {
    const config = applyRuleOverrides(resolveConfig({}, "/tmp", null), {
      optIn: ["align_object_colons"],
      disable: [],
      only: [],
    });
    assert.equal(config.enabledRuleIds.has("align_object_colons"), true);
    assert.equal(config.enabledRuleIds.has("empty_function_run"), true);
  });

  it("opt-in all enables every built-in", () => {
    const config = applyRuleOverrides(resolveConfig({}, "/tmp", null), {
      optIn: ["all"],
      disable: [],
      only: [],
    });
    assert.equal(config.enabledRuleIds.has("align_object_colons"), true);
    assert.equal(config.enabledRuleIds.has("no_null_response"), true);
    assert.equal(config.enabledRuleIds.has("no_zero_set_filter"), true);
    assert.equal(config.enabledRuleIds.has("wrap_piped_values"), true);
    assert.equal(config.enabledRuleIds.has("empty_function_run"), true);
  });

  it("disable turns a rule off after opt-in", () => {
    const config = applyRuleOverrides(resolveConfig({}, "/tmp", null), {
      optIn: ["all"],
      disable: ["no_null_response"],
      only: [],
    });
    assert.equal(config.enabledRuleIds.has("no_null_response"), false);
    assert.equal(config.enabledRuleIds.has("align_object_colons"), true);
  });

  it("only replaces the enabled set", () => {
    const config = applyRuleOverrides(resolveConfig({}, "/tmp", null), {
      optIn: [],
      disable: [],
      only: ["empty_function_run"],
    });
    assert.equal(config.enabledRuleIds.has("empty_function_run"), true);
    assert.equal(config.enabledRuleIds.has("no_trailing_newline"), false);
    assert.equal(config.enabledRuleIds.has("no_reserved_var"), false);
  });

  it("rejects --only combined with --opt-in", () => {
    assert.throws(
      () =>
        applyRuleOverrides(resolveConfig({}, "/tmp", null), {
          optIn: ["align_object_colons"],
          disable: [],
          only: ["empty_function_run"],
        }),
      ConfigError,
    );
  });

  it("rejects an unknown rule id", () => {
    assert.throws(
      () =>
        applyRuleOverrides(resolveConfig({}, "/tmp", null), {
          optIn: ["not_a_rule"],
          disable: [],
          only: [],
        }),
      /unknown rule id in --opt-in: not_a_rule/,
    );
  });

  it("CLI opt-in beats config disabled_rules", () => {
    const config = applyRuleOverrides(
      resolveConfig({ disabled_rules: ["no_trailing_newline"] }, "/tmp", null),
      { optIn: ["no_trailing_newline"], disable: [], only: [] },
    );
    assert.equal(config.enabledRuleIds.has("no_trailing_newline"), true);
  });

  it("CLI disable beats config opt_in_rules", () => {
    const config = applyRuleOverrides(
      resolveConfig({ opt_in_rules: ["no_null_response"] }, "/tmp", null),
      { optIn: [], disable: ["no_null_response"], only: [] },
    );
    assert.equal(config.enabledRuleIds.has("no_null_response"), false);
  });

  it("maps deprecated no_var_response on the CLI", () => {
    const config = applyRuleOverrides(resolveConfig({}, "/tmp", null), {
      optIn: [],
      disable: ["no_var_response"],
      only: [],
    });
    assert.equal(config.enabledRuleIds.has("no_reserved_var"), false);
  });

  it("only custom_rules enables defined custom rules", () => {
    const base = loadConfigText(
      `
custom_rules:
  no_todo:
    regex: TODO
`,
      "/tmp",
      null,
    );
    const config = applyRuleOverrides(base, {
      optIn: [],
      disable: [],
      only: ["custom_rules"],
    });
    assert.equal(config.enabledRuleIds.has("no_todo"), true);
    assert.equal(config.customRules.length, 1);
    assert.equal(config.enabledRuleIds.has("empty_function_run"), false);
  });

  it("opt-in re-enables a custom rule disabled in config", () => {
    const base = loadConfigText(
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
    assert.equal(base.customRules.length, 0);
    const config = applyRuleOverrides(base, {
      optIn: ["no_todo"],
      disable: [],
      only: [],
    });
    assert.equal(config.enabledRuleIds.has("no_todo"), true);
    assert.equal(config.customRules.length, 1);
  });
});
