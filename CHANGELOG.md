# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Default-on `wrap_piped_values` flags an assignment filter pipeline that is inline when the pipe portion is 34 UTF-8 bytes or longer (or has 3+ filters), or wrapped below that cutoff, and auto-fixes it to Xano's push form. The cutoffs are configurable with `wrap_at` and `filter_limit`.

## [0.3.1] - 2026-09-11

### Fixed

- `collapse_assignment_values` measures the reconstructed line in UTF-8 bytes, matching Xano's 64-byte threshold. A wrapped value that is short in characters but at or above 64 bytes is left wrapped.

## [0.3.0] - 2026-09-10

### Added

- Default-on `no_trailing_comments` flags a `//` above `guid` or after the file's closing `}`. Xano moves those comments to the file header on push (`guid` is invisible in the editor, so a comment above it is really a trailing comment). Nested trailing comments are left alone. There is no auto-fix.
- Default-on `guid_placement` flags a `guid` that is missing a blank line after a `}` / `]` closer, or that has a blank line after a single-line value, and auto-fixes the spacing. A missing `guid` is allowed.
- Default-on `collapse_assignment_values` flags a wrapped assignment object or array whose one-line form is shorter than 64 characters, and auto-fixes it to Xano's collapsed push form. Long one-liners are left as-is. Enum `values` stay with `wrap_enum_values`. The cutoff is configurable with `wrap_at`.
- Default-on `wrap_enum_values` flags enum `values` arrays that are inline at compact JSON length 64 or longer, or wrapped below that cutoff, and auto-fixes them to Xano's push form. The cutoff is configurable with `wrap_at`.

## [0.2.1] - 2026-09-09

### Fixed

- `fence_multiline_values` no longer fences `function.run` mock values, never emits two consecutive fence openers, and re-indents an outdented `mock` so it stays a sibling of `input`. Check mode flags those invalid forms; Xano CLI push rejects them even when the language server does not.

## [0.2.0] - 2026-09-09

### Added

- Default-on `fence_multiline_values` flags unfenced multiline `mock` and `input` values and auto-fixes eligible bare `{` / `[` values on the key line to Xano's push fence. Other reported values are left unchanged.
- Default-on `align_object_colons` flags misaligned `key: value` colons in assignment objects (`input = {`, `mock = {`, and nested values) and auto-fixes them to Xano's push alignment.
- Opt-in `no_null_response` flags `response = null` and auto-fixes to `response = {}`.
- Default-on `no_zero_numeric_default` flags an explicit numeric default of `0` and auto-fixes by omitting it.
- Default-on `quote_negative_numeric_default` flags an unquoted negative numeric default and auto-fixes by quoting it.

### Changed

- Built-in rule tables in README and `docs/rules.md` add an Auto-fix column and sort rows by id.

## [0.1.0] - 2026-09-08

### Added

- Initial CLI with YAML configuration (default-on, opt-in, opt-out, `only_rules`).
- Path filtering via `included` / `excluded` (exclude wins).
- Regex `custom_rules`.
- Own-line suppressions: `disable` / `enable` / `disable:next` / `disable:previous`.
- Built-in rules: `empty_function_run`, `no_trailing_newline` (default on), `no_var_response` (opt-in).
- `--fix` applies auto-fixes for enabled rules that implement a fixer (`no_trailing_newline`).
