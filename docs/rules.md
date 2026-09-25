# Built-in rules

| Id | Default | Severity | Auto-fix | Description |
| --- | --- | --- | --- | --- |
| [`align_object_colons`](#align_object_colons) | opt-in | warning | yes | Object entry colons must align to the longest name |
| [`collapse_assignment_values`](#collapse_assignment_values) | opt-in | warning | yes | Wrapped assignment whose one-line form is under 64 UTF-8 bytes |
| [`empty_function_run`](#empty_function_run) | on | error | no | `function.run` must not be called with an empty name |
| [`fence_multiline_values`](#fence_multiline_values) | opt-in | warning | yes | Multiline mock and input values must be fenced; a one-line fence body is unfenced |
| [`guid_placement`](#guid_placement) | opt-in | warning | yes | `guid` needs a blank line above it only when it follows a block closer |
| [`indentation`](#indentation) | opt-in | warning | yes | Code uses two spaces per nesting level; a wrapped filter pipeline sits at its opener's indent plus two |
| [`no_null_response`](#no_null_response) | opt-in | warning | yes | Do not assign `response = null` |
| [`no_reserved_var`](#no_reserved_var) | on | error | no | Do not declare a reserved variable name |
| [`no_trailing_comments`](#no_trailing_comments) | on | warning | no | `//` above `guid` or after the file's closing `}` |
| [`no_trailing_newline`](#no_trailing_newline) | on | warning | yes | File must end with `}` and no trailing newline |
| [`no_zero_numeric_default`](#no_zero_numeric_default) | opt-in | warning | yes | Numeric defaults of `0` must be omitted |
| [`no_zero_set_filter`](#no_zero_set_filter) | opt-in | error | yes | A `set:` filter of numeric `0` does not write the field |
| [`quote_negative_numeric_default`](#quote_negative_numeric_default) | opt-in | warning | yes | Negative numeric defaults must be quoted |
| [`separator_indentation`](#separator_indentation) | opt-in | warning | yes | Whitespace-only lines use the enclosing block opener's indent; empty lines in `"""` strings use the opener's indent plus 2 |
| [`statement_spacing`](#statement_spacing) | opt-in | warning | yes | Blank lines between sibling statements only after a multi-line statement or next to a comment |
| [`tags_placement`](#tags_placement) | opt-in | warning | yes | `tags` sits immediately before the first of `llm`, `tools`, `test`, `cache`, `external_access`, or `guid`, with Xano blank-line rules |
| [`unquote_bare_test_names`](#unquote_bare_test_names) | opt-in | warning | yes | Quoted `test` names and top-level `mock` keys with no spaces must be unquoted |
| [`unquote_enum_defaults`](#unquote_enum_defaults) | opt-in | warning | yes | Quoted enum defaults that are bare identifiers must be unquoted |
| [`wrap_enum_values`](#wrap_enum_values) | opt-in | warning | yes | Enum `values` arrays wrap when compact JSON length reaches 64 |
| [`wrap_piped_values`](#wrap_piped_values) | opt-in | warning | yes | Assignment filter pipelines wrap at pipe length 34 or 3+ filters; a grouped base stays inline |
| [`wrap_tags_values`](#wrap_tags_values) | opt-in | warning | yes | Declaration `tags` arrays wrap when compact JSON length reaches 64 |

List the same catalog from the CLI with `xanoscriptlint rules`.

## align_object_colons

Off by default; enable with `opt_in_rules` or `--opt-in`. Default severity is warning.

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

Off by default; enable with `opt_in_rules` or `--opt-in`. Default severity is warning.

Xano collapses an assignment's object or array onto one line when that line — indent, the `name =` or `return` prefix, and the inline value — would be shorter than 64 UTF-8 bytes. A wrapped value that already fills 64 or more bytes stays wrapped. Long one-liners are left as-is; Xano does not wrap those.

The threshold is the reconstructed line's UTF-8 byte length, not visible columns and not the number of entries. Multi-byte characters count as more than one: `{Authorization: "••••••••••••"}` is 31 characters and 55 bytes, while the reconstructed line — six spaces of indent plus `value = {Authorization: "••••••••••••"}` — is 45 characters and 69 bytes, so a wrapped form of that value stays wrapped. In the same pull Xano left a 69-byte sibling inline (`value = {"X-Signature": "••••••••••••"}`), so this rule only flags wrapped → inline; it does not expand long one-liners. Nested containers are left as-is: only the outermost `name = { ... }` / `name = [ ... ]` / `return { ... }` is checked. Enum `values` arrays are owned by [`wrap_enum_values`](#wrap_enum_values). Declaration `tags` arrays are owned by [`wrap_tags_values`](#wrap_tags_values). A container followed by a filter pipe (`value = [...]|join:"/"`) is skipped, because Xano does not reformat those.

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

Off by default; enable with `opt_in_rules` or `--opt-in`. Default severity is warning.

Xano wraps multiline object and array values in `mock` and `input` blocks in a triple-backtick fence on push. Single-line values (`null`, numbers, strings, inline `{...}` / `[...]`) stay unfenced. An unfenced multiline value, or a fence whose body is exactly one nonblank line, is push/pull churn.

````xs
input = {
  items: ```
    [
      {id: 8}
    ]
    ```
  source: {localized: {en_US: {title: "Live"}}}
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

Only top-level entries of `mock = { ... }` and `input = { ... }` are checked, including `function.run` mocks when unfencing. Nested properties inside an already-fenced value, and multiline objects in other contexts (`data`, `join`, `value`), are ignored because Xano does not fence those. Assignment fences (`value =`) and filter-argument fences (`|push:`) are left alone.

A fence whose body is exactly one nonblank line is unfenced onto the key line. Multi-line bodies stay fenced even when they would be short if flattened; Xano unfences but does not collapse. An empty body, or a body that is only a comment, is left fenced.

`function.run` mock values stay compact on the fence-insertion side. Xano CLI push accepts `{queued: []}` on those mocks and can reject a fenced rewrite, especially if `mock` loses indent relative to `input`. The rule does not wrap those values. It does flag two consecutive fence openers (keys must not share one fence body) and a `mock` that is not indented with its `input` sibling inside `function.run`.

Auto-fixable with `--fix`: an eligible multiline value is wrapped in a fence, the opening `{` or `[` moves onto the next line, and the body is indented two spaces relative to the key. A one-line fence body is moved onto the key line and the fence is removed. Values that are not a bare `{` or `[` on the key line are reported but not rewritten. An outdented `function.run` `mock` is re-indented to match `input`. Consecutive fence openers are reported and left untouched.

## guid_placement

Off by default; enable with `opt_in_rules` or `--opt-in`. Default severity is warning.

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

Observed blank-line predecessors include a `}` that closes `test`, a multiline `response` / `stack` / `cache`, and a `]` that closes a multiline `index`, `tools`, or `tags` array.

A multiline `tags` array is rewritten by [`wrap_tags_values`](#wrap_tags_values) and placed by [`tags_placement`](#tags_placement). When `tags` ends on its own `]`, this rule still requires a blank line above `guid`.

Auto-fixable with `--fix`: a missing blank line is inserted, a forbidden blank line is removed, and extra blank lines collapse to one.

## indentation

Off by default; enable with `opt_in_rules` or `--opt-in`. Default severity is warning.

Xano rewrites indentation on push. Two spaces per unclosed `{`, `[`, or `(`. A line that starts with `}`, `]`, or `)` dedents one level. The pulled file is canonical; a local indent that does not match is push/pull churn. Wrapping a stack into `db.transaction` without indenting the body is the usual miss.

```xs
    db.transaction {
      stack {
        db.add widget {
          data = {id: $id}
        }
      }
    }
```

A wrapped filter pipeline is the exception. Continuation lines whose first token is `|` (not `||`) sit at the chain opener's indent plus two, not at the brace depth of the line. The opener may itself open a parenthesis, so the continuation is not "one level deeper than the current depth":

```xs
    foreach ($declared
      |get:"tracker_uuids"
      |first_notnull:[]) {
      each as $uuid {
```

A nested `|name:(…)` group needs no extra rule. The parenthesis already adds a level, so the inner filters sit two spaces past the outer filter. A blank line between filters does not end the chain; the next `|filter` stays at the same indent. When the opener opens more than one group, the chain's extra indent ends once those groups close, including when the next line is shallower than the first continuation.

A nested object whose longest key is longer than the enclosing object's longest key does not take a level of its own. Its entries stay at the enclosing entries' indent, and its `}` sits with the enclosing object's `{`. Quoted keys count their quotes. `join` entries, whose names are longer than `table` / `type` / `where`, and a nested object whose keys are all shorter, still indent one more level.

```xs
      data = {
        job_uuid: $job_uuid
        job_type: "generate_round_coaching"
        status  : "pending"
        user_id : $auth.id
        input   : {
        round_uuid   : $round_uuid
        sync_inbox_id: $inbox.id
        model        : $model
      }
      }
```

A block fence, one whose opening triple-backtick is the last thing on its line and whose closing line is just the triple-backtick, is indented. The least-indented nonblank body line and the closing fence sit at the opener's indent plus two, and every deeper line keeps its offset from that least indent. Xano strips that much on push, so a body that sits further left is flattened and the nesting is lost. A fence opened on a `|filter` nested inside a `(...)` group of an outer chain is the exception: its body and closer sit at the opener's own indent, because the chain already supplied the extra two spaces. Whitespace-only lines in the body stay as they are. Suppressing `indentation` on the opener or on any body or closer line leaves that whole fence unmoved, so the rest of the fence is not rewritten around a line that stays put.

A fence with code on the same line as its opener or closer, and a `"""` string, are not indented on their own. When the line that opens one is mis-indented, auto-fix shifts the nonblank body lines, including the closer, by the same amount, so the relative indent inside the literal is preserved. If that shift would move any nonblank body line past column 0, that opener is left unchanged.

The rule reports nothing when the file is not safe to re-indent: braces, brackets, or parentheses do not balance, a fence or `"""` string is unterminated, or any line's indentation contains a tab.

Auto-fixable with `--fix`. [`separator_indentation`](#separator_indentation) owns whitespace-only lines. This rule runs first, so later rules that derive indent from the line they rewrite see the corrected columns.

## no_null_response

`response = null` is not allowed; use an empty object instead. Off by default; enable with `opt_in_rules` or `--opt-in`.

```yaml
opt_in_rules:
  - no_null_response
```

```xs
response = null
```

Auto-fixable with `--fix`: `response = null` becomes `response = {}`. Comment lines, `$response = null`, and the text inside string literals are ignored.

## no_reserved_var

Xano's language server blacklists these names for user-defined variables: `$auth`, `$db`, `$env`, `$error`, `$input`, `$output`, `$response`, `$this`, `$toolset`, `$var`. Declaring any of them via `var`, `var.update`, `as`, or `each as` is flagged. Reads such as `$auth.id` are left alone. Comment lines and the bodies of `"""` strings and triple-backtick fences are ignored.

On by default. Default severity is error. There is no auto-fix.

```xs
var $auth {
  value = 1
}
db.query "user" {
} as $output
foreach ($items) {
  each as $this {
  }
}
```

Xano's published essentials list is not the source of truth here (`$result` and `$index` are not reserved; `$var`, `$error`, and `$toolset` are). This rule follows the language server.

`no_var_response` is a deprecated alias for this rule. It still works in `opt_in_rules`, per-rule option keys, and suppression comments.

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

On by default. Default severity is warning.

Xano pull strips trailing newlines and treats their absence as canonical. A lintable file must end with `}` as the last character — no `\n` after it.

Auto-fixable with `--fix`: trailing whitespace after the closing `}` is stripped. Files that do not end with `}` after that trim remain a reported violation.

## no_zero_numeric_default

Off by default; enable with `opt_in_rules` or `--opt-in`. Default severity is warning.

Xano strips an explicit default of `0` from `int` and `decimal` declarations on push. The pulled file omits the default, so a local `=0` is push/pull churn. Nullable and array forms are included (`int?`, `decimal?`, `int[]`).

```xs
int retry_count?=0
decimal offset?=0.0
```

Bare zeros (`0`, `0.0`, `.0`, `-0`, `+0`) and quoted zeros (`"0"`, `'0'`) are flagged. Non-zero defaults, and `filters=min:0` on the same line, are left alone.

Auto-fixable with `--fix`: `int retry_count?=0` becomes `int retry_count?` and `decimal offset?=0.0` becomes `decimal offset?`. The optional marker stays; only the zero default is removed. A trailing `filters=` clause or metadata block is preserved.

## no_zero_set_filter

Off by default; enable with `opt_in_rules` or `--opt-in`. Default severity is error.

In XanoScript a `|set:` whose value is a bare numeric zero does not write the field. A later `|set:` on the same pipe can also be dropped. The form that keeps `0` is to seed the field on the object literal.

Bare zeros (`0`, `0.0`, `.0`, `-0`, `+0`) are flagged. Quoted `"0"` / `'0'` is a string and is left alone, as are `1`, `$x`, `null`, `false`, and `{}`.

```xs
value = {}|set:"slot":0|set:"page":0

value = {slot: 0, page: 0}

value = {}
  |set:"slot":0
  |set:"label":$title

value = {slot: 0}|set:"label":$title
```

Auto-fixable with `--fix` when the assignment base is `{}` or a single-line object literal and the key is a static name with no `.`. The zero filters are hoisted into the base and the statement is collapsed to one line. Xano does not wrap a chain whose base is a non-empty `{…}` (see [`wrap_piped_values`](#wrap_piped_values)), so a previously wrapped chain comes back inline even when it is long.

Report-only — flagged, not rewritten — when the base is a variable (`$cart|set:"slot":0`), the key is dynamic (`|set:$key:0`), the path is nested (`|set:"meta.slot":0`), the `|set:` sits inside a parenthesized filter argument (`|push:($item|set:"slot":0)`), or the base already has a non-zero value for that key (`{slot: 5}|set:"slot":0`). A `|set:` of `0` does not write, so hoisting would change `5` to `0`.

## quote_negative_numeric_default

Off by default; enable with `opt_in_rules` or `--opt-in`. Default severity is warning.

Xano quotes a negative `int` or `decimal` default on push. An unquoted `-1` becomes `"-1"`.

```xs
int quantity?=-1
decimal drift?=-2.5
```

Already-quoted negatives are canonical. A negative zero (`-0`) is owned by `no_zero_numeric_default`, which omits the default instead of quoting it.

Auto-fixable with `--fix`: the unquoted negative is wrapped in double quotes. Spacing around `=` and any trailing `filters=` clause or metadata block are preserved.

## separator_indentation

Off by default; enable with `opt_in_rules` or `--opt-in`. Default severity is warning.

Xano does not leave a truly empty line between statements inside a block. A whitespace-only line carries the indent of the enclosing block's opener: two spaces inside `stack {`, six inside a nested `if {`, and none at the top level of the file. The pulled file is canonical; an empty line where Xano stores spaces (or spaces where Xano stores an empty line) is push/pull churn.

```xs
  stack {
    var $ok {
      value = 1
    }
  
    var $next {
      value = 2
    }
  }
```

The line between the two `var` blocks is two spaces, the same indent as `stack`. A line between top-level members such as `input` and `stack` is empty. Inside a nested object that stays at its parent's indent, the whitespace line matches that object's opener line, not the dedented `}`.

This rule only rewrites lines that are already whitespace-only. Inserting and removing blank lines stays with [`guid_placement`](#guid_placement), [`tags_placement`](#tags_placement), [`statement_spacing`](#statement_spacing), and [`wrap_enum_values`](#wrap_enum_values).

An empty line inside a `"""` string is set to the opener line's indent plus 2, which is how Xano writes the body. Existing whitespace-only lines inside `"""` strings keep their width, because JavaScript `code` bodies keep wider ones. Backtick fence bodies are left alone.

```xs
    system_prompt: """
      Translate the field.
      
      Return only the text.
      """
```

The blank between those sentences is six spaces when the opener is at indent 4. [`indentation`](#indentation) still shifts a `"""` or fence body with its opener.

The same bail conditions as [`indentation`](#indentation) apply: an unbalanced file, an unterminated fence or `"""` string, or a tab in any line's indentation is not rewritten.

Auto-fixable with `--fix`. This rule runs last, so it normalizes separator widths after other rules have moved lines.

## statement_spacing

Off by default; enable with `opt_in_rules` or `--opt-in`. Default severity is warning.

Between two sibling statements, Xano keeps a blank line only when the previous statement spans more than one line, or when a `//` comment sits in the gap or directly above the previous statement. Any other blank is removed on push. This rule removes those blanks. It does not insert a missing blank after a multi-line statement.

```xs
input {
  int id
  text name
}

stack {
  function.run "Orders/lookup" as $order
  var $known {
    value = false
  }
}
```

A comment keeps the blank on either side:

```xs
input {
  int id

  // owner of the open cart
  int? owner_id?
}
```

Scope is `input {`, `schema {`, and `stack {` when that block is a direct member of the top-level construct, plus every non-literal block nested inside those. That covers control-flow bodies, statement bodies such as `db.query` and `var`, a `db.transaction`'s nested `stack`, and a `schema {` nested in an `object` input. `test` bodies, other top-level members, and the lines around `tags` and `guid` are left alone.

Skipped entirely: colon-object and array literal contents, triple-backtick fences, `"""` strings, blanks after a block opener, and blanks before a block closer. A statement is multi-line when its last code line is not its first, including a wrapped filter pipeline, so the blank after it stays. An unbalanced file, a mismatched closer, or an unterminated fence, `"""` string, or quote is not rewritten.

Auto-fixable with `--fix`: every blank in a forbidden gap is deleted. The rule runs after the wrap and collapse rules and before [`separator_indentation`](#separator_indentation).

## tags_placement

Off by default; enable with `opt_in_rules` or `--opt-in`. Default severity is warning.

Xano places a declaration's `tags = [...]` immediately before the first of `llm`, `tools`, `test`, `cache`, `external_access`, or `guid`. Everything else in the body — `canonical`, `response`, `input`, `stack`, `schema` — stays above `tags`. A missing `tags` is allowed.

Blank lines follow the predecessor and the form of the array. Exactly one blank line above `tags` when the previous statement is a bare `}` or `]`. No blank line above otherwise. Exactly one blank line below `tags` when a following member exists and the array is wrapped, or when that member is a `test` block. No blank line below when a single-line `tags` is followed by `guid`, `llm`, `tools`, `cache`, or `external_access`, or when `tags` is the last member of the declaration.

```xs
  canonical = "wDft"
  tags = ["domain:widgets", "surface:ai_agent", "concern:generative"]
  llm = {
    type: "openai"
  }
```

```xs
  response = $result
  tags = ["domain:widgets"]

  test lower_stronger {
    input = {ok: true}
  }

  guid = "g1"
```

```xs
  response = $ledger
  tags = [
    "domain:practice"
    "surface:ai_tool"
    "pipeline:widget_session_proposer"
  ]

  guid = "g1"
```

```xs
  response = $result
  tags = ["domain:platform", "surface:admin", "concern:security"]
  external_access = false
  guid = "g1"
```

The wrapped vs inline form is owned by [`wrap_tags_values`](#wrap_tags_values). This rule only moves the block and normalizes the surrounding blanks. Comments immediately above an anchor stay with that anchor.

Auto-fixable with `--fix`: `tags` is moved to the slot above the first anchor (or to the end of the declaration when there is no anchor), a missing blank is inserted, a forbidden blank is removed, and extra blanks collapse to one.

## unquote_bare_test_names

Off by default; enable with `opt_in_rules` or `--opt-in`. Default severity is warning.

Xano strips quotes from a `test` name when the name is a bare identifier — letters, digits, and underscores, starting with a letter or underscore. A name with a space, hyphen, or other punctuation stays quoted. The same rewrite applies independently to a top-level key in `mock = { ... }`; Xano does not require a `test` of that name.

```xs
test inventory_restock_applies {
  input = {id: 2}
}

test "catalog lists open shelves" {
  input = {id: 1}
}

mock = {
  "catalog lists open shelves": {id: 1}
  inventory_restock_applies   : {id: 2}
}
```

Quoted names that are already identifiers (`test "inventory_restock_applies"`, `"inventory_restock_applies":`) are push/pull churn. Nested keys inside a mock value, comment lines, and content inside triple-backtick fences or `"""` strings are left alone. `input`, `stack`, `response`, `test`, `mock`, `guid`, and `filters` stay quoted so unquoting cannot change how the line parses.

Auto-fixable with `--fix`: the quotes are dropped. Own-line mock keys keep their colon column (two spaces replace the quotes) so a later [`align_object_colons`](#align_object_colons) pass can re-align the block to the new longest name in one `--fix`.

## unquote_enum_defaults

Off by default; enable with `opt_in_rules` or `--opt-in`. Default severity is warning.

Xano strips quotes from an enum declaration default on push when the value is a bare identifier — letters, digits, and underscores, starting with a letter or underscore. A quoted `"standard"` becomes `standard`. The pulled file is canonical; a locally quoted identifier is push/pull churn.

```xs
enum shipping_speed?="standard" {
  values = ["standard", "express"]
}

enum content_type?="application/json" {
  values = ["application/json", "text/plain"]
}
```

A value that is not a bare identifier stays quoted. Unquoting `"application/json"` or `"next day"` is a parse error, so those defaults are left alone. `true`, `false`, and `null` stay quoted too, because unquoting them would turn the default into a boolean or null literal.

The declaration's opening `{` must be on the same line. Comment lines and the bodies of `"""` strings and triple-backtick fences are ignored.

Auto-fixable with `--fix`: the quotes are dropped. Spacing around `=` is preserved.

## wrap_enum_values

Off by default; enable with `opt_in_rules` or `--opt-in`. Default severity is warning.

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

// Allowed routes for this field
enum corridor {
  values = [
    "northbound_express_lane"
    "southbound_express_lane"
    "local_collector_road"
  ]

}
```

The wrapped form has no commas between items. Auto-fix writes items two spaces deeper than `values` and puts `]` at the `values` indent. A whitespace-only line (spaces, matching the enum `}`) sits before the closing brace only when a `//` comment is on the line directly above the enum. Already-wrapped arrays get that separator added or removed; a locally wrong separator is push/pull churn.

Override the cutoff with `wrap_at` (a positive integer, default 64):

```yaml
wrap_enum_values:
  wrap_at: 64
```

## wrap_piped_values

Off by default; enable with `opt_in_rules` or `--opt-in`. Default severity is warning.

Xano wraps an assignment's filter pipeline when the pipe portion — every top-level `|filter` segment, indentation and base excluded — is 34 UTF-8 bytes or longer, or when there are three or more top-level filters. Shorter one- and two-filter chains stay on one line. A grouped base (`(…)`, a non-empty `[…]` / `{…}`) stays on one line at any length and filter count; empty `{}` and `[]`, including whitespace-only `{ }` / `[ ]`, still wrap. The pulled file is canonical; a locally inline long chain (or a wrapped short chain, or a wrapped grouped-base chain) is push/pull churn.

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

value = {value_awarded: 0}|set:"reward_id":$reward_id|set:"quantity":$quantity_stored
```

A filter of the form `|name:(<chain>)` applies the same rule to the inner chain:

```xs
value = []
  |push:($order.ts|concat:"xxxxxxxxxxxxxxxxxxxxxxx")
  |push:($order.ts
    |concat:"xxxxxxxxxxxxxxxxxxxxxxxx"
  )
```

The rule skips a chain whose expression contains `$$` outside strings (including a grouped-base chain that would otherwise collapse), whose base already spans multiple lines, or whose span includes a triple-backtick fence, `"""` block, backtick expression, trailing `//`, or a tab. `||` is not a filter.

Auto-fixable with `--fix`: an inline chain is rewritten with the base on the assignment line and one filter per continuation (statement indent + 2), and a wrapped chain below the threshold — or any wrapped grouped-base chain — collapses to one line.

Override the cutoffs with `wrap_at` and `filter_limit` (positive integers, defaults 34 and 3):

```yaml
wrap_piped_values:
  wrap_at: 34
  filter_limit: 3
```

## wrap_tags_values

Off by default; enable with `opt_in_rules` or `--opt-in`. Default severity is warning.

Xano wraps a declaration `tags` array when the compact JSON form — `["a","b"]`, quotes and commas, no spaces — is 64 characters or longer. Shorter arrays stay on one line. The pulled file is canonical; a locally inline long array (or a wrapped short array) is push/pull churn.

The threshold is the compact length, not the number of tags. A three-tag array can stay inline while another three-tag array with longer strings wraps. Arrays that are not exclusively quoted strings, and arrays that contain comments, are left alone.

```xs
  tags = ["domain:widgets"]

  tags = [
    "domain:identity"
    "surface:ai_agent"
    "pipeline:widget_advisor"
    "concern:generative"
  ]
```

The wrapped form has no commas between items. Auto-fix writes items two spaces deeper than `tags` and puts `]` at the `tags` indent. Surrounding blank lines are owned by [`tags_placement`](#tags_placement); this rule only rewrites the array. [`collapse_assignment_values`](#collapse_assignment_values) does not collapse `tags`.

Override the cutoff with `wrap_at` (a positive integer, default 64):

```yaml
wrap_tags_values:
  wrap_at: 64
```

## Team-specific rules

Do not expect house style (for example a `// Modified:` timestamp) as a built-in. Add a `custom_rules` entry in `.xanoscriptlint.yml`. See [configuration.md](configuration.md).
