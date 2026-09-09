# Built-in rules

| Id | Default | Severity | Auto-fix | Description |
| --- | --- | --- | --- | --- |
| [`align_mock_colons`](#align_mock_colons) | on | error | yes | Mock entry colons must align to the longest name |
| [`empty_function_run`](#empty_function_run) | on | error | no | `function.run` must not be called with an empty name |
| [`fence_multiline_mocks`](#fence_multiline_mocks) | on | error | yes | Multiline mock values must be wrapped in a triple-backtick fence |
| [`no_null_response`](#no_null_response) | opt-in | warning | yes | Do not assign `response = null` |
| [`no_trailing_newline`](#no_trailing_newline) | on | error | yes | File must end with `}` and no trailing newline |
| [`no_var_response`](#no_var_response) | opt-in | warning | no | Do not declare `var $response` |

List the same catalog from the CLI with `xanoscriptlint rules`.

## align_mock_colons

Xano realigns `mock` entry colons on push so they share one column, immediately after the longest quoted name in that block. The pulled file is canonical; local misalignment is push/pull churn.

```xs
mock = {
  "checkout short"                : {id: 1}
  "checkout longest_scenario_name": {id: 2}
}
```

Each `mock = { ... }` block is aligned independently. Text after the colon is left unchanged, including multiline and triple-backtick values. Quoted keys outside `mock` are ignored.

Auto-fixable with `--fix`: spaces between the closing `"` and `:` are inserted or removed until the colons line up.

## empty_function_run

Xano's CLI can wipe a callee string to `function.run ""` on pull/push. This rule flags empty double- or single-quoted names.

```xs
function.run ""
function.run ''
```

Comment lines are ignored.

## fence_multiline_mocks

Xano wraps multiline object and array values in `mock` blocks in a triple-backtick fence on push. Single-line values (`null`, numbers, strings, inline `{...}` / `[...]`) stay unfenced. An unfenced multiline value is push/pull churn.

````xs
mock = {
  "checkout applies gift wrap": ```
    {
      issued: []
    }
    ```
  "checkout lists open carts": ```
    [
      {id: 8}
    ]
    ```
  "checkout empty": []
}
````

Only top-level `mock = { ... }` entries are checked. Nested properties inside an already-fenced value, and multiline objects outside `mock`, are ignored.

Auto-fixable with `--fix`: the value is wrapped in a fence, the opening `{` or `[` moves onto the next line, and the body is indented two spaces relative to the key. Values that are not a bare `{` or `[` on the key line are reported but not rewritten.

## no_null_response

`response = null` is not allowed; use an empty object instead. Off by default; enable with `opt_in_rules`.

```yaml
opt_in_rules:
  - no_null_response
```

```xs
response = null
```

Auto-fixable with `--fix`: `response = null` becomes `response = {}`. Comment lines, `$response = null`, and the text inside string literals are ignored.

## no_trailing_newline

Xano pull strips trailing newlines and treats their absence as canonical. A lintable file must end with `}` as the last character — no `\n` after it.

Auto-fixable with `--fix`: trailing whitespace after the closing `}` is stripped. Files that do not end with `}` after that trim remain a reported violation.

## no_var_response

`var $response` collides with the `response` keyword. Xano rewrites it to `$response[""]`, which produces `null`. Off by default; enable with `opt_in_rules`.

```yaml
opt_in_rules:
  - no_var_response
```

## Team-specific rules

Do not expect house style (for example a `// Modified:` timestamp) as a built-in. Add a `custom_rules` entry in `.xanoscriptlint.yml`. See [configuration.md](configuration.md).
