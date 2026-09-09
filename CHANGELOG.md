# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
