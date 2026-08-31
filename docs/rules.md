# Built-in rules

| Id | Default | Severity | Description |
| --- | --- | --- | --- |
| [`empty_function_run`](#empty_function_run) | on | error | `function.run` must not be called with an empty name |
| [`no_trailing_newline`](#no_trailing_newline) | on | error | File must end with `}` and no trailing newline |
| [`no_var_response`](#no_var_response) | opt-in | warning | Do not declare `var $response` |

List the same catalog from the CLI with `xanoscriptlint rules`.

## empty_function_run

Xano's CLI can wipe a callee string to `function.run ""` on pull/push. This rule flags empty double- or single-quoted names.

```xs
function.run ""
function.run ''
```

Comment lines are ignored.

## no_trailing_newline

Xano pull strips trailing newlines and treats their absence as canonical. A lintable file must end with `}` as the last character — no `\n` after it.

## no_var_response

`var $response` collides with the `response` keyword. Xano rewrites it to `$response[""]`, which produces `null`. Off by default; enable with `opt_in_rules`.

```yaml
opt_in_rules:
  - no_var_response
```

## Team-specific rules

Do not expect house style (for example a `// Modified:` timestamp) as a built-in. Add a `custom_rules` entry in `.xanoscriptlint.yml`. See [configuration.md](configuration.md).
