# Configuration

xanoscriptlint reads `.xanoscriptlint.yml` by walking up from the current working directory. Pass `--config` to load a specific file (this skips discovery).

No config file means built-in defaults: default-on rules enabled, `included: ["**/*.xs"]`, no excludes, no custom rules, `strict: false`.

## Strict mode

```yaml
strict: true
```

Treat warnings as errors (same as `--strict`). `--strict` and `--no-strict` override this; if neither flag is passed, the config value is used (default `false`).

## Rule enablement

Three modes. The first two may be combined with each other; `only_rules` cannot be combined with either.

### Default

Every built-in with `defaultEnabled: true` is on. That set is `empty_function_run`, `no_reserved_var`, `no_trailing_comments`, and `no_trailing_newline`. Formatting rules that match Xano push/pull are opt-in.

```yaml
disabled_rules:
  - no_trailing_newline
opt_in_rules:
  - no_null_response
  - wrap_enum_values
```

- `disabled_rules` turns rules off.
- `opt_in_rules` turns default-off rules on.
- When a rule appears in both lists, `disabled_rules` wins.

### Exclusive

```yaml
only_rules:
  - empty_function_run
  - custom_rules
```

Only the listed ids run. Use `custom_rules` to enable every defined custom rule, or list individual custom rule ids.

### CLI overrides

`--opt-in`, `--disable`, and `--only` override the config file without editing it. Repeatable and comma-separated.

```text
xanoscriptlint --opt-in wrap_enum_values,guid_placement
xanoscriptlint --opt-in all --disable no_null_response
xanoscriptlint --only empty_function_run
```

- `--opt-in <ids>` enables default-off rules. `all` enables every built-in.
- `--disable <ids>` turns rules off.
- `--only <ids>` is exclusive (like `only_rules`) and cannot be combined with `--opt-in` or `--disable`. `custom_rules` enables every defined custom rule.

CLI beats the config file. At the same level, disable beats opt-in: `--opt-in x` turns on a rule the config disabled, and `--disable x` turns off a rule the config opted in.

## Paths

```yaml
included:
  - "**/*.xs"
excluded:
  - ".xano/**"
  - "**/node_modules/**"
```

Paths are relative to the directory that contains the config file. If `included` is omitted, it defaults to `**/*.xs` (including `.xs` files in that directory). **Exclude wins.** CLI path arguments further restrict the included set; they do not override excludes.

## Per-rule options

```yaml
empty_function_run: error

no_trailing_newline:
  severity: warning

collapse_assignment_values:
  wrap_at: 64

wrap_enum_values:
  wrap_at: 64

wrap_tags_values:
  wrap_at: 64

wrap_piped_values:
  wrap_at: 34
  filter_limit: 3
```

Severity is `error` or `warning`. `wrap_enum_values` and `wrap_tags_values` also accept `wrap_at`, a positive integer (default 64) for the compact JSON length at which an enum `values` array or declaration `tags` array must wrap. `collapse_assignment_values` accepts `wrap_at` as the line length below which a wrapped assignment is collapsed. `wrap_piped_values` accepts `wrap_at` (default 34) for the pipe-portion byte length at which a filter chain wraps, and `filter_limit` (default 3) for the filter count that wraps even when the pipe portion is shorter.

## Custom rules

```yaml
custom_rules:
  no_todo_in_stack:
    name: No TODO
    regex: "TODO"
    message: "Remove TODO before shipping."
    severity: warning
    included:
      - ".*\\.xs"
    excluded:
      - ".*Test\\.xs"
```

- `regex` is required. It is tested against each non-comment line.
- `name`, `message`, `severity` are optional (`severity` defaults to `warning`).
- `included` / `excluded` are regular expressions matched against the file path.
- Full-line `//` comments are skipped so the regex does not fire in comments.

Custom rules run when defined unless `only_rules` is set and does not include `custom_rules` or that id. A custom id may also appear in `disabled_rules`.

## Suppressions

Own-line comments only (XanoScript does not allow trailing `//` on a code line):

```xs
// xanoscriptlint:disable rule_id
// xanoscriptlint:enable rule_id
// xanoscriptlint:disable:next rule_id
// xanoscriptlint:disable:previous rule_id
```

Multiple ids may be separated by spaces or commas. `disable` without `next` or `previous` applies from that line through EOF or until `enable`.

## Deprecated rule ids

`no_var_response` is a silent alias for `no_reserved_var`. It is accepted in `disabled_rules`, `opt_in_rules`, `only_rules`, as a per-rule options key, in `--opt-in` / `--disable` / `--only`, and in suppression comments. Prefer the canonical id in new configs.

## CLI flags

| Flag | Meaning |
| --- | --- |
| `--config <path>` | Load this YAML file |
| `--reporter stylish\|json` | Output format (default `stylish`) |
| `--strict` | Treat warnings as errors (overrides config) |
| `--no-strict` | Do not treat warnings as errors (overrides `strict: true` in config) |
| `--opt-in <ids>` | Enable opt-in rules (comma-separated, repeatable; `all` enables every built-in) |
| `--disable <ids>` | Disable rules (comma-separated, repeatable) |
| `--only <ids>` | Run only these rules (exclusive; cannot combine with `--opt-in` or `--disable`) |
| `--fix` | Automatically fix violations where a rule implements a fixer |
| `--version` | Print the package version |

Exit codes: `0` no errors, `2` at least one error-severity violation, `1` usage or config error.

## Out of scope

Nested directory configs, `parent_config`, analyzer/type-aware rules, JavaScript plugin rules, and SARIF are not implemented yet.
