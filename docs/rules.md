# Built-in rules

| Id | Default | Severity | Auto-fix | Description |
| --- | --- | --- | --- | --- |
| [`align_object_colons`](#align_object_colons) | on | error | yes | Object entry colons must align to the longest name |
| [`collapse_assignment_values`](#collapse_assignment_values) | on | error | yes | Wrapped assignment whose one-line form is under 64 UTF-8 bytes |
| [`empty_function_run`](#empty_function_run) | on | error | no | `function.run` must not be called with an empty name |
| [`fence_multiline_values`](#fence_multiline_values) | on | error | yes | Multiline mock and input values must be wrapped in a triple-backtick fence |
| [`guid_placement`](#guid_placement) | on | warning | yes | `guid` needs a blank line above it only when it follows a block closer |
| [`no_null_response`](#no_null_response) | opt-in | warning | yes | Do not assign `response = null` |
| [`no_trailing_comments`](#no_trailing_comments) | on | warning | no | `//` above `guid` or after the file's closing `}` |
| [`no_trailing_newline`](#no_trailing_newline) | on | error | yes | File must end with `}` and no trailing newline |
| [`no_var_response`](#no_var_response) | opt-in | warning | no | Do not declare `var $response` |
| [`no_zero_numeric_default`](#no_zero_numeric_default) | on | error | yes | Numeric defaults of `0` must be omitted |
| [`quote_negative_numeric_default`](#quote_negative_numeric_default) | on | error | yes | Negative numeric defaults must be quoted |
| [`wrap_enum_values`](#wrap_enum_values) | on | error | yes | Enum `values` arrays wrap when compact JSON length reaches 64 |
| [`wrap_piped_values`](#wrap_piped_values) | on | warning | yes | Assignment filter pipelines wrap at pipe length 34 or 3+ filters |

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

## collapse_assignment_values

Xano collapses an assignment's object or array onto one line when that line — indent, the `name =` or `return` prefix, and the inline value — would be shorter than 64 UTF-8 bytes. A wrapped value that already fills 64 or more bytes stays wrapped. Long one-liners are left as-is; Xano does not wrap those.

The threshold is the reconstructed line's UTF-8 byte length, not visible columns and not the number of entries. Multi-byte characters count as more than one: `{Authorization: "••••••••••••"}` is 31 characters and 55 bytes, while the reconstructed line — six spaces of indent plus `value = {Authorization: "••••••••••••"}` — is 45 characters and 69 bytes, so a wrapped form of that value stays wrapped. In the same pull Xano left a 69-byte sibling inline (`value = {"X-Signature": "••••••••••••"}`), so this rule only flags wrapped → inline; it does not expand long one-liners. Nested containers are left as-is: only the outermost `name = { ... }` / `name = [ ... ]` / `return { ... }` is checked. Enum `values` arrays are owned by [`wrap_enum_values`](#wrap_enum_values). A container followed by a filter pipe (`value = [...]|join:"/"`) is skipped, because Xano does not reformat those.

```xs
input = {event_type: "manual", unit: "sets", delta: 3}

input = {
  event_type: "manual"
  unit      : "repetitions"
  delta     : 5
}
```

Auto-fixable with `--fix`: the wrapped block is rewritten as `name = {k: v, k2: v2}` (or `[a, b]`), preserving any trailing text after the closer.

Blocks that do not parse as colon-objects or arrays (comments inside, fences, `throw { name = ... }`, tabs) are skipped.

Override the cutoff with `wrap_at` (a positive integer, default 64):

```yaml
collapse_assignment_values:
  wrap_at: 64
```

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

## guid_placement

When `guid` is present, Xano places it as the last property of the top-level construct. Presence itself is not required: a file that has not yet been pushed and pulled from Xano has no `guid`, and that is valid for this rule.

The blank line is decided by the previous statement, not the key name. Comments immediately above `guid` are skipped so the predecessor is the last real statement: Xano moves those comments to the file header on push. Exactly one blank line above `guid` when that statement is a bare `}` or `]`. No blank line otherwise.

```xs
response = $result
guid = "..."
```

```xs
  }

  guid = "..."
```

Observed flush predecessors (no blank) include single-line `response = $var`, single-line `tags = [...]`, `swagger = {token: ...}` in an `api_group`, single-line `tools = [...]` in an agent, `schedule = [...]`, `actions = {...}`, single-line `index = [...]`, a `|set:` pipeline tail, and a closing triple-backtick fence.

Observed blank-line predecessors include a `}` that closes `test`, a multiline `response` / `stack` / `cache`, and a `]` that closes a multiline `index` or `tools` array.

A multiline `tags` array has not been seen in a Xano-pulled file. The closer rule would require a blank line above `guid` if `tags` ended on its own `]`, matching every other multiline array. That shape is inferred, not observed.

Default severity is warning.

Auto-fixable with `--fix`: a missing blank line is inserted, a forbidden blank line is removed, and extra blank lines collapse to one.

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

## no_trailing_comments

On push, Xano moves a `//` that sits immediately before the file's closing `}` to the file header, appending it to any existing header comments. The comment's original context is lost.

`guid` is backend-managed metadata that Xano does not show in its source editor, so a comment above `guid` (or after `guid` still inside the body) is the same shape. Nested comments — last line inside `stack {` or a `conditional` / `try` body — are left alone; those survive push.

```xs
  response = $ok
  // leftover — flagged
  guid = "..."
}
```

```xs
  response = $ok
  // leftover — flagged
}
```

```xs
  stack {
    // nested — not flagged
  }

  response = $ok
  guid = "..."
}
```

A comment after the closing `}` is invalid XanoScript (`expecting EOF`). Xano's CLI still pushes it and pull relocates it to the header; this rule reports that shape with a distinct message.

`guid_placement --fix` may insert or remove the blank line above `guid` while leaving the comment in place. Moving the comment is left to the developer; this rule has no auto-fix.

A `// xanoscriptlint:` directive in the tail is still a comment. Xano will move it to the header like any other. Suppress this rule with a file-header or region `disable`, not a tail `disable:next`.

Default severity is warning.

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

## wrap_piped_values

Xano wraps an assignment's filter pipeline when the pipe portion — every top-level `|filter` segment, indentation and base excluded — is 34 UTF-8 bytes or longer, or when there are three or more top-level filters. Shorter one- and two-filter chains stay on one line. The pulled file is canonical; a locally inline long chain (or a wrapped short chain) is push/pull churn.

The threshold is not the reconstructed line length used by [`collapse_assignment_values`](#collapse_assignment_values). A chain at deep indent can stay inline while a shorter line at shallow indent wraps, because only the `|…` bytes count. Multi-byte characters count as more than one: `|concat:"••••••••"` is 18 characters and 34 bytes, so it wraps.

```xs
value = {}|set:"id_course":$input.course_id

value = {}
  |set:"cart_uuid":$cart_uuid
  |set:"reason":$reject_reason

value = $cart
  |to_text
  |to_lower
  |trim
```

A filter of the form `|name:(<chain>)` applies the same rule to the inner chain:

```xs
value = []
  |push:($order.ts|concat:"xxxxxxxxxxxxxxxxxxxxxxx")
  |push:($order.ts
    |concat:"xxxxxxxxxxxxxxxxxxxxxxxx"
  )
```

The rule skips a chain whose base is grouped (`(…)`, a non-empty `[…]` / `{…}`), whose expression contains `$$` outside strings, whose base already spans multiple lines, or whose span includes a triple-backtick fence, `"""` block, backtick expression, trailing `//`, or a tab. Empty `{}` and `[]` bases do wrap. `||` is not a filter.

Default severity is warning.

Auto-fixable with `--fix`: an inline chain is rewritten with the base on the assignment line and one filter per continuation (statement indent + 2), and a wrapped chain below the threshold collapses to one line.

Override the cutoffs with `wrap_at` and `filter_limit` (positive integers, defaults 34 and 3):

```yaml
wrap_piped_values:
  wrap_at: 34
  filter_limit: 3
```

## Team-specific rules

Do not expect house style (for example a `// Modified:` timestamp) as a built-in. Add a `custom_rules` entry in `.xanoscriptlint.yml`. See [configuration.md](configuration.md).
