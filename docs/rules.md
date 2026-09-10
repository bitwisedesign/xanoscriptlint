# Built-in rules

| Id | Default | Severity | Auto-fix | Description |
| --- | --- | --- | --- | --- |
| [`align_object_colons`](#align_object_colons) | on | error | yes | Object entry colons must align to the longest name |
| [`empty_function_run`](#empty_function_run) | on | error | no | `function.run` must not be called with an empty name |
| [`fence_multiline_values`](#fence_multiline_values) | on | error | yes | Multiline mock and input values must be wrapped in a triple-backtick fence |
| [`no_null_response`](#no_null_response) | opt-in | warning | yes | Do not assign `response = null` |
| [`no_trailing_newline`](#no_trailing_newline) | on | error | yes | File must end with `}` and no trailing newline |
| [`no_var_response`](#no_var_response) | opt-in | warning | no | Do not declare `var $response` |
| [`no_zero_numeric_default`](#no_zero_numeric_default) | on | error | yes | Numeric defaults of `0` must be omitted |
| [`quote_negative_numeric_default`](#quote_negative_numeric_default) | on | error | yes | Negative numeric defaults must be quoted |
| [`wrap_enum_values`](#wrap_enum_values) | on | error | yes | Enum `values` arrays wrap when compact JSON length reaches 64 |

List the same catalog from the CLI with `xanoscriptlint rules`.

## align_object_colons

Xano realigns `key: value` colons on push so siblings in the same `{ ... }` share one column, immediately after the longest name in that block. The pulled file is canonical; local misalignment is push/pull churn.

The rule covers assignment objects Xano realigns on push — `input = {`, `mock = {`, `data = {`, `response = {`, `return {` — and nested `{ ... }` values inside those. Each `{ ... }` aligns independently. Quoted keys count their quotes toward name length. Anonymous objects in arrays (`value = [{ ... }]`) are left as-is; Xano does not rewrite those.

```xs
input = {
  user_id   : $input.user_id
  award_uuid: $input.award_uuid
}

mock = {
  "checkout short"                : {id: 1}
  "checkout longest_scenario_name": {id: 2}
}
```

Own-line entries pad so every colon sits immediately after the longest name. Inline pairs (`{id: 1, name: "x"}`) stay compact: no pad before the colon. Exactly one space follows each colon. Text after that space is left unchanged, including multiline and triple-backtick values.

Content inside triple-backtick fences and `"""` strings is ignored, so prompt bodies and fenced JSON are not rewritten. Blocks that are not colon-object assignments (`throw { name = ... }`, `var $x { value = ... }`, `input { uuid id }` declarations, and `{ ... }` array elements) are skipped.

Auto-fixable with `--fix`: spaces before the colon are inserted or removed until the colons line up, and extra spaces after the colon collapse to one.

## empty_function_run

Xano's CLI can wipe a callee string to `function.run ""` on pull/push. This rule flags empty double- or single-quoted names.

```xs
function.run ""
function.run ''
```

Comment lines are ignored.

## fence_multiline_values

Xano wraps multiline object and array values in `mock` and `input` blocks in a triple-backtick fence on push. Single-line values (`null`, numbers, strings, inline `{...}` / `[...]`) stay unfenced. An unfenced multiline value is push/pull churn.

````xs
input = {
  items: ```
    [
      {id: 8}
    ]
    ```
}

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

Only top-level entries of `mock = { ... }` and `input = { ... }` are checked. Nested properties inside an already-fenced value, and multiline objects in other contexts (`data`, `join`, `value`), are ignored because Xano does not fence those.

`function.run` mock values stay compact. Xano CLI push accepts `{queued: []}` on those mocks and can reject a fenced rewrite, especially if `mock` loses indent relative to `input`. The rule does not fence those values. It does flag two consecutive fence openers (keys must not share one fence body) and a `mock` that is not indented with its `input` sibling inside `function.run`.

Auto-fixable with `--fix`: an eligible value is wrapped in a fence, the opening `{` or `[` moves onto the next line, and the body is indented two spaces relative to the key. Values that are not a bare `{` or `[` on the key line are reported but not rewritten. An outdented `function.run` `mock` is re-indented to match `input`. Consecutive fence openers are reported and left untouched.

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

## no_zero_numeric_default

Xano strips an explicit default of `0` from `int` and `decimal` declarations on push. The pulled file omits the default, so a local `=0` is push/pull churn. Nullable and array forms are included (`int?`, `decimal?`, `int[]`).

```xs
int retry_count?=0
decimal offset?=0.0
```

Bare zeros (`0`, `0.0`, `.0`, `-0`, `+0`) and quoted zeros (`"0"`, `'0'`) are flagged. Non-zero defaults, and `filters=min:0` on the same line, are left alone.

Auto-fixable with `--fix`: `int retry_count?=0` becomes `int retry_count?` and `decimal offset?=0.0` becomes `decimal offset?`. The optional marker stays; only the zero default is removed. A trailing `filters=` clause or metadata block is preserved.

## quote_negative_numeric_default

Xano quotes a negative `int` or `decimal` default on push. An unquoted `-1` becomes `"-1"`.

```xs
int quantity?=-1
decimal drift?=-2.5
```

Already-quoted negatives are canonical. A negative zero (`-0`) is owned by `no_zero_numeric_default`, which omits the default instead of quoting it.

Auto-fixable with `--fix`: the unquoted negative is wrapped in double quotes. Spacing around `=` and any trailing `filters=` clause or metadata block are preserved.

## wrap_enum_values

Xano wraps an enum `values` array when the compact JSON form — `["a","b"]`, quotes and commas, no spaces — is 64 characters or longer. Shorter arrays stay on one line. The pulled file is canonical; a locally inline long array (or a wrapped short array) is push/pull churn.

The threshold is the compact length, not the number of values. A six-value array can stay inline while a four-value array with longer strings wraps. Arrays that are not exclusively quoted strings, and arrays that contain comments, are left alone.

```xs
enum status {
  values = ["draft", "active"]
}

enum lane {
  values = [
    "northbound_express_lane"
    "southbound_express_lane"
    "local_collector_road"
  ]

}
```

The wrapped form has no commas between items. Auto-fix writes items two spaces deeper than `values`, puts `]` at the `values` indent, and inserts a whitespace-only line (spaces, matching the enum `}`) before the closing brace. Existing wrapped arrays are not restyled if they are already on the correct side of the threshold.

Override the cutoff with `wrap_at` (a positive integer, default 64):

```yaml
wrap_enum_values:
  wrap_at: 64
```

## Team-specific rules

Do not expect house style (for example a `// Modified:` timestamp) as a built-in. Add a `custom_rules` entry in `.xanoscriptlint.yml`. See [configuration.md](configuration.md).
