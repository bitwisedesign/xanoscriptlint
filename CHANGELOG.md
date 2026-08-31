# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial CLI with YAML configuration (default-on, opt-in, opt-out, `only_rules`).
- Path filtering via `included` / `excluded` (exclude wins).
- Regex `custom_rules`.
- Own-line suppressions: `disable` / `enable` / `disable:next` / `disable:previous`.
- Built-in rules: `empty_function_run`, `no_trailing_newline` (default on), `no_var_response` (opt-in).
