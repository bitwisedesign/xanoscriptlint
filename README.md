# xanoscriptlint

A linter for [XanoScript](https://docs.xano.com/xanoscript/key-concepts).

xanoscriptlint is a style and convention linter, not a compiler. Syntax and semantics stay with Xano (`@xano/xanoscript-language-server`, `xano_validate_xanoscript`). This tool owns convention and pitfall rules, project configuration, path filters, and custom regex rules.

Requires Node.js 20 or later. Runs on linux and macOS (Windows is untested but not blocked).

## Install

```bash
npm install --save-dev xanoscriptlint
```

```bash
npx xanoscriptlint
npx xanoscriptlint rules
npx xanoscriptlint path/to/file.xs
```

`npx` is optional. After a local install, npm puts the binary on `PATH` for scripts:

```json
"scripts": {
  "lint:xs": "xanoscriptlint"
}
```

Then `npm run lint:xs` runs `xanoscriptlint` with no `npx`.

`npm install -g xanoscriptlint` (no path) only works after the package is published to npm. To put the command on your PATH from a git checkout:

```bash
npm install
npm run build
npm link
```

Or `npm install -g /path/to/xanoscriptlint`. Remove a link with `npm unlink -g xanoscriptlint`.

## Configuration

Place `.xanoscriptlint.yml` at the project root (or pass `--config`). With no file, built-in defaults apply.

```yaml
disabled_rules:
  - no_trailing_newline
opt_in_rules:
  - no_var_response
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

| Id | Default | Severity | What it catches |
| --- | --- | --- | --- |
| `empty_function_run` | on | error | `function.run ""` / `function.run ''` |
| `no_trailing_newline` | on | error | File does not end with `}` (Xano pull strips trailing newlines) |
| `no_var_response` | opt-in | warning | `var $response` (Xano rewrites it) |

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
```

Exit `0` when there are no error-severity violations. Exit `2` when there is at least one error. Warnings alone do not fail CI unless `--strict`.

## License

MIT
