#!/usr/bin/env node

import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { Command, CommanderError } from "commander";
import { applyRuleOverrides, ConfigError, loadConfig } from "./config.js";
import { discoverXsFiles } from "./discover.js";
import { fixFile, lintFiles, readSourceFile } from "./lint.js";
import { builtinRules } from "./rules/index.js";
import {
  applyStrict,
  exitCodeFor,
  formatFixSummary,
  formatReport,
  type ReporterName,
} from "./report.js";
import type { Correction, SourceFile } from "./rules/types.js";
import { isMainModule } from "./util.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

export async function runCli(
  argv: string[],
  io: { stdout: NodeJS.WritableStream; stderr: NodeJS.WritableStream } = process,
): Promise<number> {
  let exitCode = 0;
  const program = new Command();
  program
    .name("xanoscriptlint")
    .description("A linter for XanoScript")
    .version(version)
    .option("-c, --config <path>", "path to .xanoscriptlint.yml")
    .option("--reporter <name>", "stylish or json", "stylish")
    .option("--strict", "treat warnings as errors")
    .option("--no-strict", "do not treat warnings as errors (overrides config)")
    .option("--fix", "automatically fix violations where possible", false)
    .option(
      "--opt-in <ids>",
      "enable opt-in rules (comma-separated, repeatable; 'all' enables every built-in)",
      collectIds,
      [] as string[],
    )
    .option(
      "--disable <ids>",
      "disable rules (comma-separated, repeatable)",
      collectIds,
      [] as string[],
    )
    .option(
      "--only <ids>",
      "run only these rules (comma-separated, repeatable; exclusive)",
      collectIds,
      [] as string[],
    )
    .exitOverride()
    .configureOutput({
      writeOut: (str) => io.stdout.write(str),
      writeErr: (str) => io.stderr.write(str),
    });

  program
    .command("lint", { isDefault: true })
    .description("Lint XanoScript files")
    .argument("[paths...]", "files or directories to lint")
    .action(async (paths: string[]) => {
      const opts = program.opts<{
        config?: string;
        reporter: string;
        strict?: boolean;
        fix: boolean;
        optIn: string[];
        disable: string[];
        only: string[];
      }>();
      exitCode = await runLint(
        paths,
        {
          ...opts,
          strict:
            program.getOptionValueSource("strict") === "cli"
              ? opts.strict
              : undefined,
        },
        io,
      );
    });

  program
    .command("rules")
    .description("List built-in rules")
    .action(() => {
      io.stdout.write(formatRulesList());
    });

  try {
    await program.parseAsync(argv);
    return exitCode;
  } catch (error) {
    if (error instanceof CommanderError) {
      return error.exitCode;
    }
    const message = error instanceof Error ? error.message : String(error);
    io.stderr.write(`${message}\n`);
    return 1;
  }
}

async function runLint(
  paths: string[],
  opts: {
    config?: string;
    reporter: string;
    strict?: boolean;
    fix: boolean;
    optIn: string[];
    disable: string[];
    only: string[];
  },
  io: { stdout: NodeJS.WritableStream; stderr: NodeJS.WritableStream },
): Promise<number> {
  const reporter = parseReporter(opts.reporter);
  if (!reporter) {
    io.stderr.write(`unknown reporter: ${opts.reporter}\n`);
    return 1;
  }

  try {
    const cwd = process.cwd();
    const config = applyRuleOverrides(loadConfig({ cwd, configPath: opts.config }), {
      optIn: opts.optIn ?? [],
      disable: opts.disable ?? [],
      only: opts.only ?? [],
    });
    const strict = opts.strict ?? config.strict;
    const files = await discoverXsFiles({ config, cwd, cliPaths: paths });
    let sources = files.map((filePath) => readSourceFile(filePath));
    if (opts.fix) {
      const corrections: Correction[] = [];
      const fixed: SourceFile[] = [];
      for (const source of sources) {
        const result = fixFile(source, config);
        if (result.changed) {
          writeFileSync(source.path, result.text, "utf8");
        }
        corrections.push(...result.corrections);
        fixed.push({ path: source.path, text: result.text });
      }
      sources = fixed;
      const summary = formatFixSummary(corrections, cwd);
      if (summary.length > 0) {
        const text = summary.endsWith("\n") ? summary : `${summary}\n`;
        const stream = reporter === "json" ? io.stderr : io.stdout;
        stream.write(text);
      }
    }
    const violations = applyStrict(lintFiles(sources, config), strict);
    const report = formatReport(violations, reporter, cwd);
    if (report.length > 0) {
      io.stdout.write(report.endsWith("\n") ? report : `${report}\n`);
    }
    return exitCodeFor(violations);
  } catch (error) {
    if (error instanceof ConfigError) {
      io.stderr.write(`${error.message}\n`);
      return 1;
    }
    const message = error instanceof Error ? error.message : String(error);
    io.stderr.write(`${message}\n`);
    return 1;
  }
}

function formatRulesList(): string {
  const headers = ["id", "default", "severity", "description"];
  const rows = builtinRules.map((rule) => [
    rule.id,
    rule.defaultEnabled ? "on" : "opt-in",
    rule.defaultSeverity,
    rule.description,
  ]);
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => row[index].length)),
  );
  const format = (cells: string[]) =>
    cells
      .map((cell, index) =>
        index === cells.length - 1 ? cell : cell.padEnd(widths[index] + 2),
      )
      .join("");
  const headerLine = format(headers);
  const body = rows.map(format);
  const ruleWidth = Math.max(headerLine.length, ...body.map((line) => line.length));
  const lines = [headerLine, "-".repeat(ruleWidth), ...body];
  return `${lines.join("\n")}\n\nEnable opt-in rules with --opt-in <id> or --opt-in all.\n`;
}

function collectIds(value: string, previous: string[]): string[] {
  return [...previous, ...value.split(",").map((item) => item.trim()).filter(Boolean)];
}

function parseReporter(name: string): ReporterName | undefined {
  if (name === "stylish" || name === "json") {
    return name;
  }
  return undefined;
}

if (isMainModule(process.argv[1], fileURLToPath(import.meta.url))) {
  process.exitCode = await runCli(process.argv);
}
