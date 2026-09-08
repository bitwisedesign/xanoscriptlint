# Configuration

xanoscriptlint reads `.xanoscriptlint.yml` by walking up from the current working directory. Pass `--config` to load a specific file (this skips discovery).

No config file means built-in defaults: default-on rules enabled, `included: ["**/*.xs"]`, no excludes, no custom rules.

## Rule enablement

Three modes. The first two may be combined with each other; `only_rules` cannot be combined with either.

### Default

Every built-in with `defaultEnabled: true` is on.

```yaml
disabled_rules:
  - no_trailing_newline
opt_in_rules:
  - no_var_response
```

- `disabled_rules` turns default-on rules off.
- `opt_in_rules` turns default-off rules on.

### Exclusive

```yaml
only_rules:
  - empty_function_run
  - custom_rules
```

Only the listed ids run. Use `custom_rules` to enable every defined custom rule, or list individual custom rule ids.

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
```

Severity is `error` or `warning`.

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

## CLI flags

| Flag | Meaning |
| --- | --- |
| `--config <path>` | Load this YAML file |
| `--reporter stylish\|json` | Output format (default `stylish`) |
| `--strict` | Treat warnings as errors |
| `--version` | Print the package version |

Exit codes: `0` no errors, `2` at least one error-severity violation, `1` usage or config error.

## Out of scope

Nested directory configs, `parent_config`, `--fix`, analyzer/type-aware rules, JavaScript plugin rules, and SARIF are not implemented yet.
