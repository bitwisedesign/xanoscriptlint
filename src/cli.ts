#!/usr/bin/env node

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { ConfigError, loadConfig } from "./config.js";
import { discoverXsFiles } from "./discover.js";
import { lintFiles, readSourceFile } from "./lint.js";
import { builtinRules } from "./rules/index.js";
import {
  applyStrict,
  exitCodeFor,
  formatReport,
  type ReporterName,
} from "./report.js";
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
    .option("--strict", "treat warnings as errors", false)
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
        strict: boolean;
      }>();
      exitCode = await runLint(paths, opts, io);
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
    if (isCommanderEarlyExit(error)) {
      return 0;
    }
    const message = error instanceof Error ? error.message : String(error);
    io.stderr.write(`${message}\n`);
    return 1;
  }
}

async function runLint(
  paths: string[],
  opts: { config?: string; reporter: string; strict: boolean },
  io: { stdout: NodeJS.WritableStream; stderr: NodeJS.WritableStream },
): Promise<number> {
  const reporter = parseReporter(opts.reporter);
  if (!reporter) {
    io.stderr.write(`unknown reporter: ${opts.reporter}\n`);
    return 1;
  }

  try {
    const cwd = process.cwd();
    const config = loadConfig({ cwd, configPath: opts.config });
    const files = await discoverXsFiles({ config, cwd, cliPaths: paths });
    const sources = files.map((filePath) => readSourceFile(filePath));
    const violations = applyStrict(lintFiles(sources, config), opts.strict);
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
  const lines = ["id                        default    severity   description", "-".repeat(90)];
  for (const rule of builtinRules) {
    const enabled = rule.defaultEnabled ? "on" : "opt-in";
    lines.push(
      `${rule.id.padEnd(26)}${enabled.padEnd(11)}${rule.defaultSeverity.padEnd(11)}${rule.description}`,
    );
  }
  return `${lines.join("\n")}\n`;
}

function parseReporter(name: string): ReporterName | undefined {
  if (name === "stylish" || name === "json") {
    return name;
  }
  return undefined;
}

function isCommanderEarlyExit(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return false;
  }
  const code = (error as { code?: string }).code;
  return code === "commander.helpDisplayed" || code === "commander.version";
}

if (isMainModule(process.argv[1], fileURLToPath(import.meta.url))) {
  const code = await runCli(process.argv);
  process.exit(code);
}
