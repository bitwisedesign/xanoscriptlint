# xanoscriptlint

A linter for [XanoScript](https://docs.xano.com/xanoscript/key-concepts).

xanoscriptlint is a style and convention linter, not a compiler. Syntax and semantics stay with Xano (`@xano/xanoscript-language-server`, `xano_validate_xanoscript`). This tool owns convention and pitfall rules, project configuration, path filters, and custom regex rules.

Requires Node.js 20 or later. Runs on linux and macOS (Windows is untested but not blocked).

## Install

```bash
npm install --save-dev @bitwisedesign/xanoscriptlint
```

```bash
npx @bitwisedesign/xanoscriptlint
npx @bitwisedesign/xanoscriptlint rules
npx @bitwisedesign/xanoscriptlint path/to/file.xs
```

`npx` is optional. After a local install, npm puts the binary on `PATH` for scripts:

```json
"scripts": {
  "lint:xs": "xanoscriptlint"
}
```

Then `npm run lint:xs` runs `xanoscriptlint` with no `npx`.

`npm install -g @bitwisedesign/xanoscriptlint` (no path) only works after the package is published to npm. To put the command on your PATH from a git checkout:

```bash
npm install
npm run build
npm link
```

Or `npm install -g /path/to/xanoscriptlint`. Remove a link with `npm unlink -g @bitwisedesign/xanoscriptlint`.

## Configuration

Place `.xanoscriptlint.yml` at the project root (or pass `--config`). With no file, built-in defaults apply.

```yaml
disabled_rules:
  - no_trailing_newline
opt_in_rules:
  - no_null_response
# only_rules: [empty_function_run]  # exclusive; cannot mix with the two above

included:
  - "**/*.xs"
excluded:
  - ".xano/**"
  - "**/node_modules/**"

empty_function_run:
  severity: error

custom_rules:
  no_todo_in_stack:
    name: No TODO
    regex: "TODO"
    message: "Remove TODO before shipping."
    severity: warning
    excluded:
      - ".*Test\\.xs"
```

- Built-in rules with `defaultEnabled: true` are on unless listed in `disabled_rules`.
- Off-by-default rules are enabled with `opt_in_rules`.
- `only_rules` is an exclusive allowlist and cannot be combined with `disabled_rules` or `opt_in_rules`.
- `custom_rules` run when defined, unless `only_rules` is set and does not include `custom_rules` or that rule id.
- `excluded` always wins over `included`. Paths are relative to the config file directory.

See [docs/configuration.md](docs/configuration.md) and [docs/rules.md](docs/rules.md).

## Built-in rules

| Id | Default | Severity | Auto-fix | What it catches |
| --- | :---: | :---: | :---: | --- |
| `align_object_colons` | ⚪️ | ⚠️ | ✅ | Object entry colons must align to the longest name (Xano rewrites this on push) |
| `collapse_assignment_values` | ⚪️ | ⚠️ | ✅ | Wrapped assignment object or array whose one-line form is under 64 UTF-8 bytes (Xano collapses it on push) |
| `empty_function_run` | 🟢 | ❌ | — | `function.run ""` / `function.run ''` |
| `fence_multiline_values` | ⚪️ | ⚠️ | ✅ | Multiline mock or input value not wrapped in a triple-backtick fence (Xano fences it on push); a one-line fence body is unfenced onto the key line; `function.run` mocks stay compact except when unfencing |
| `guid_placement` | ⚪️ | ⚠️ | ✅ | `guid` with a blank line after a single-line value, or without one after a `}` / `]` closer |
| `indentation` | ⚪️ | ⚠️ | ✅ | Code indented other than two spaces per nesting level, or a wrapped filter pipeline not at its opener's indent plus two (Xano rewrites this on push) |
| `no_null_response` | ⚪️ | ⚠️ | ✅ | `response = null` (use `response = {}`) |
| `no_reserved_var` | 🟢 | ❌ | — | reserved variable name declared via `var`, `var.update`, `as`, or `each as` |
| `no_trailing_comments` | 🟢 | ⚠️ | — | `//` above `guid` or after the file's closing `}` (Xano moves it to the header on push) |
| `no_trailing_newline` | 🟢 | ⚠️ | ✅ | File does not end with `}` (Xano pull strips trailing newlines) |
| `no_zero_numeric_default` | ⚪️ | ⚠️ | ✅ | Explicit numeric default of `0` (Xano strips it on push) |
| `no_zero_set_filter` | ⚪️ | ❌ | ✅ | `set:` of numeric `0` (does not write the field; seed it on the object literal) |
| `quote_negative_numeric_default` | ⚪️ | ⚠️ | ✅ | Unquoted negative numeric default (Xano quotes it on push) |
| `separator_indentation` | ⚪️ | ⚠️ | ✅ | Whitespace-only line whose width is not the enclosing block opener's indent, or an empty line inside a `"""` string that is not the opener's indent plus 2 (Xano rewrites this on push) |
| `statement_spacing` | ⚪️ | ⚠️ | ✅ | Blank line between sibling statements when the previous one is single-line and no comment is adjacent (Xano removes it on push) |
| `tags_placement` | ⚪️ | ⚠️ | ✅ | `tags` not immediately before the first of `llm`, `tools`, `test`, `cache`, `external_access`, or `guid`, or with the wrong blank lines around it (Xano rewrites this on push) |
| `unquote_bare_test_names` | ⚪️ | ⚠️ | ✅ | Quoted `test "name"` or top-level `mock` key `"name"` when `name` has no spaces (Xano strips those quotes on push) |
| `unquote_enum_defaults` | ⚪️ | ⚠️ | ✅ | Quoted enum default that is a bare identifier (Xano strips the quotes on push) |
| `wrap_assignment_arrays` | ⚪️ | ⚠️ | ✅ | Assignment string array is inline at compact JSON length 64+ (Xano rewrites this on push); `tags` and `values` stay with their own rules |
| `wrap_enum_values` | ⚪️ | ⚠️ | ✅ | Enum `values` array is inline at compact JSON length 64+ or wrapped below 64 (Xano rewrites this on push) |
| `wrap_piped_values` | ⚪️ | ⚠️ | ✅ | Assignment filter pipeline is inline at pipe length 34+ or 3+ filters, or wrapped below that; a grouped base stays inline (Xano rewrites this on push) |
| `wrap_tags_values` | ⚪️ | ⚠️ | ✅ | Declaration `tags` array is inline at compact JSON length 64+ or wrapped below 64 (Xano rewrites this on push) |

🟢 on · ⚪️ off · ❌ error · ⚠️ warning · ✅ auto-fix. Off-by-default rules are enabled with `opt_in_rules` or `--opt-in` (`--opt-in all` enables every built-in).

House style such as a `// Modified:` timestamp belongs in `custom_rules`, not in the default catalog:

```yaml
custom_rules:
  modified_stamp:
    name: Modified stamp
    regex: "^// Modified: \\d{2}-\\d{2}-\\d{4} \\d{2}:\\d{2}$"
    message: "Use this only as an example of a team-specific custom rule."
    severity: warning
```

(That example matches a stamp line; requiring it as the last header comment is left to your team.)

## Suppressions

XanoScript comments must be on their own line, so suppressions cannot trail a statement.

```xs
// xanoscriptlint:disable empty_function_run
// xanoscriptlint:enable empty_function_run
// xanoscriptlint:disable:next empty_function_run
// xanoscriptlint:disable:previous empty_function_run
```

`disable` without `next`/`previous` lasts until a matching `enable` or end of file. A `disable` at the top of the file is the file-wide form.

## CLI

```text
xanoscriptlint [paths…]
xanoscriptlint rules
xanoscriptlint --config path/to/.xanoscriptlint.yml
xanoscriptlint --reporter json
xanoscriptlint --strict
xanoscriptlint --no-strict
xanoscriptlint --opt-in wrap_enum_values,guid_placement
xanoscriptlint --opt-in all
xanoscriptlint --disable no_trailing_newline
xanoscriptlint --only empty_function_run
xanoscriptlint --fix
```

Exit `0` when there are no error-severity violations. Exit `2` when there is at least one error. Warnings alone do not fail CI unless `--strict` or `strict: true` in the config (`--no-strict` overrides the config).

## License

MIT
