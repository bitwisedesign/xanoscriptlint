import assert from "node:assert/strict";
import { symlink, writeFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { readFile } from "node:fs/promises";
import { runCli } from "../src/cli.js";
import { applyStrict, exitCodeFor, formatFixSummary, formatReport } from "../src/report.js";
import type { Correction, Violation } from "../src/rules/types.js";
import { isMainModule } from "../src/util.js";
import { CLEAN_XS, NULL_RESPONSE_XS, UNDERPADDED_MOCK_XS, collectStream, withTempDir, writeXs } from "./support.js";

const warning: Violation = {
  ruleId: "no_reserved_var",
  message: "warn",
  severity: "warning",
  file: "/tmp/a.xs",
  line: 1,
  column: 1,
};

const error: Violation = {
  ruleId: "empty_function_run",
  message: "function.run has an empty name",
  severity: "error",
  file: "/tmp/a.xs",
  line: 2,
  column: 3,
};

describe("reporters and exit codes", () => {
  it("returns 0 for warnings-only and 2 for errors", () => {
    assert.equal(exitCodeFor([warning]), 0);
    assert.equal(exitCodeFor([error]), 2);
    assert.equal(exitCodeFor([]), 0);
  });

  it("--strict promotes warnings to errors", () => {
    const promoted = applyStrict([warning], true);
    assert.equal(promoted[0].severity, "error");
    assert.equal(exitCodeFor(promoted), 2);
  });

  it("json reporter emits the violation array", () => {
    const json = formatReport([error], "json", "/tmp");
    const parsed = JSON.parse(json) as Array<{ ruleId: string; file: string }>;
    assert.equal(parsed[0].ruleId, "empty_function_run");
    assert.equal(parsed[0].file, "a.xs");
  });

  it("stylish reporter includes rule id and counts", () => {
    const stylish = formatReport([error], "stylish", "/tmp");
    assert.match(stylish, /empty_function_run/);
    assert.match(stylish, /1 problem/);
  });

  it("fix summary lists corrections and a count", () => {
    const corrections: Correction[] = [
      { ruleId: "no_trailing_newline", file: "/tmp/a.xs", line: 10 },
    ];
    const summary = formatFixSummary(corrections, "/tmp");
    assert.match(summary, /a\.xs/);
    assert.match(summary, /no_trailing_newline/);
    assert.match(summary, /Corrected 1 violation in 1 file/);
  });
});

describe("cli", () => {
  it("lists built-in rules", async () => {
    const stdout = collectStream();
    const stderr = collectStream();
    const code = await runCli(["node", "xanoscriptlint", "rules"], {
      stdout: stdout.stream,
      stderr: stderr.stream,
    });
    assert.equal(code, 0);
    assert.match(stdout.text(), /empty_function_run/);
    assert.match(stdout.text(), /no_reserved_var/);
    assert.match(stdout.text(), /opt-in/);
    assert.match(stdout.text(), /--opt-in <id>/);
    assert.match(stdout.text(), /--opt-in all/);
    assert.doesNotMatch(stdout.text(), /no_var_response/);
    const [header, separator, ...rest] = stdout.text().split("\n");
    assert.ok(header);
    const defaultCol = header.indexOf("default");
    const severityCol = header.indexOf("severity");
    const descriptionCol = header.indexOf("description");
    assert.ok(defaultCol > 0 && severityCol > defaultCol && descriptionCol > severityCol);
    const ruleRows = rest.filter((line) => line.length > 0 && !line.startsWith("Enable"));
    assert.ok(ruleRows.length > 0);
    for (const line of ruleRows) {
      assert.match(line.slice(defaultCol), /^(on|opt-in) /);
      assert.match(line.slice(severityCol), /^(error|warning) /);
    }
    assert.match(separator ?? "", /^-{10,}$/);
    assert.equal(stderr.text(), "");
  });

  it("prints help and version", async () => {
    const helpOut = collectStream();
    const helpErr = collectStream();
    const helpCode = await runCli(["node", "xanoscriptlint", "--help"], {
      stdout: helpOut.stream,
      stderr: helpErr.stream,
    });
    assert.equal(helpCode, 0);
    const helpText = helpOut.text() + helpErr.text();
    assert.match(helpText, /xanoscriptlint/);
    assert.match(helpText, /--config/);
    assert.match(helpText, /--strict/);
    assert.match(helpText, /--no-strict/);
    assert.match(helpText, /--fix/);
    assert.match(helpText, /--opt-in/);
    assert.match(helpText, /--disable/);
    assert.match(helpText, /--only/);

    const verOut = collectStream();
    const verErr = collectStream();
    const verCode = await runCli(["node", "xanoscriptlint", "--version"], {
      stdout: verOut.stream,
      stderr: verErr.stream,
    });
    assert.equal(verCode, 0);
    assert.match(verOut.text() + verErr.text(), /\d+\.\d+\.\d+/);
  });

  it("config strict: true promotes warnings to errors", async () => {
    await withTempDir(async (dir) => {
      await writeXs(
        dir,
        ".xanoscriptlint.yml",
        "strict: true\nopt_in_rules:\n  - no_null_response\nincluded:\n  - \"**/*.xs\"\n",
      );
      await writeXs(dir, "ok.xs", NULL_RESPONSE_XS);
      const cwd = process.cwd();
      process.chdir(dir);
      try {
        const stdout = collectStream();
        const stderr = collectStream();
        const code = await runCli(["node", "xanoscriptlint", "ok.xs"], {
          stdout: stdout.stream,
          stderr: stderr.stream,
        });
        assert.equal(code, 2, stderr.text());
        assert.match(stdout.text(), /no_null_response/);
      } finally {
        process.chdir(cwd);
      }
    });
  });

  it("config strict: false leaves warnings as warnings", async () => {
    await withTempDir(async (dir) => {
      await writeXs(
        dir,
        ".xanoscriptlint.yml",
        "strict: false\nopt_in_rules:\n  - no_null_response\nincluded:\n  - \"**/*.xs\"\n",
      );
      await writeXs(dir, "ok.xs", NULL_RESPONSE_XS);
      const cwd = process.cwd();
      process.chdir(dir);
      try {
        const stdout = collectStream();
        const stderr = collectStream();
        const code = await runCli(["node", "xanoscriptlint", "ok.xs"], {
          stdout: stdout.stream,
          stderr: stderr.stream,
        });
        assert.equal(code, 0, stderr.text());
        assert.match(stdout.text(), /no_null_response/);
      } finally {
        process.chdir(cwd);
      }
    });
  });

  it("--no-strict overrides config strict: true", async () => {
    await withTempDir(async (dir) => {
      await writeXs(
        dir,
        ".xanoscriptlint.yml",
        "strict: true\nopt_in_rules:\n  - no_null_response\nincluded:\n  - \"**/*.xs\"\n",
      );
      await writeXs(dir, "ok.xs", NULL_RESPONSE_XS);
      const cwd = process.cwd();
      process.chdir(dir);
      try {
        const stdout = collectStream();
        const stderr = collectStream();
        const code = await runCli(["node", "xanoscriptlint", "--no-strict", "ok.xs"], {
          stdout: stdout.stream,
          stderr: stderr.stream,
        });
        assert.equal(code, 0, stderr.text());
        assert.match(stdout.text(), /no_null_response/);
      } finally {
        process.chdir(cwd);
      }
    });
  });

  it("--opt-in enables a default-off rule without a config change", async () => {
    await withTempDir(async (dir) => {
      await writeXs(dir, ".xanoscriptlint.yml", "included:\n  - \"**/*.xs\"\n");
      await writeXs(dir, "ok.xs", NULL_RESPONSE_XS);
      const cwd = process.cwd();
      process.chdir(dir);
      try {
        const stdout = collectStream();
        const stderr = collectStream();
        const code = await runCli(
          ["node", "xanoscriptlint", "--opt-in", "no_null_response", "--reporter", "json", "ok.xs"],
          { stdout: stdout.stream, stderr: stderr.stream },
        );
        assert.equal(code, 0, stderr.text());
        assert.match(stdout.text(), /no_null_response/);
      } finally {
        process.chdir(cwd);
      }
    });
  });

  it("--opt-in all enables every built-in", async () => {
    await withTempDir(async (dir) => {
      await writeXs(dir, ".xanoscriptlint.yml", "included:\n  - \"**/*.xs\"\n");
      await writeXs(dir, "ok.xs", UNDERPADDED_MOCK_XS);
      const cwd = process.cwd();
      process.chdir(dir);
      try {
        const stdout = collectStream();
        const stderr = collectStream();
        const code = await runCli(
          ["node", "xanoscriptlint", "--opt-in", "all", "--reporter", "json", "ok.xs"],
          { stdout: stdout.stream, stderr: stderr.stream },
        );
        assert.equal(code, 0, stderr.text());
        assert.match(stdout.text(), /align_object_colons/);
      } finally {
        process.chdir(cwd);
      }
    });
  });

  it("--disable turns a default-on rule off", async () => {
    await withTempDir(async (dir) => {
      await writeXs(dir, ".xanoscriptlint.yml", "included:\n  - \"**/*.xs\"\n");
      await writeXs(dir, "ok.xs", `${CLEAN_XS}\n`);
      const cwd = process.cwd();
      process.chdir(dir);
      try {
        const stdout = collectStream();
        const stderr = collectStream();
        const code = await runCli(
          ["node", "xanoscriptlint", "--disable", "no_trailing_newline", "--reporter", "json", "ok.xs"],
          { stdout: stdout.stream, stderr: stderr.stream },
        );
        assert.equal(code, 0, stderr.text());
        assert.deepEqual(JSON.parse(stdout.text()), []);
      } finally {
        process.chdir(cwd);
      }
    });
  });

  it("--only runs exactly the listed rules", async () => {
    await withTempDir(async (dir) => {
      await writeXs(dir, ".xanoscriptlint.yml", "included:\n  - \"**/*.xs\"\n");
      await writeXs(dir, "ok.xs", NULL_RESPONSE_XS);
      const cwd = process.cwd();
      process.chdir(dir);
      try {
        const stdout = collectStream();
        const stderr = collectStream();
        const code = await runCli(
          [
            "node",
            "xanoscriptlint",
            "--only",
            "no_null_response",
            "--reporter",
            "json",
            "ok.xs",
          ],
          { stdout: stdout.stream, stderr: stderr.stream },
        );
        assert.equal(code, 0, stderr.text());
        assert.match(stdout.text(), /no_null_response/);
        assert.doesNotMatch(stdout.text(), /empty_function_run/);
      } finally {
        process.chdir(cwd);
      }
    });
  });

  it("--fix honors a CLI opt-in", async () => {
    await withTempDir(async (dir) => {
      await writeXs(dir, ".xanoscriptlint.yml", "included:\n  - \"**/*.xs\"\n");
      const filePath = await writeXs(dir, "ok.xs", NULL_RESPONSE_XS);
      const cwd = process.cwd();
      process.chdir(dir);
      try {
        const stdout = collectStream();
        const stderr = collectStream();
        const code = await runCli(
          ["node", "xanoscriptlint", "--opt-in", "no_null_response", "--fix", "ok.xs"],
          { stdout: stdout.stream, stderr: stderr.stream },
        );
        assert.equal(code, 0, stderr.text());
        assert.match(await readFile(filePath, "utf8"), /response = \{\}/);
        assert.match(stdout.text(), /no_null_response/);
      } finally {
        process.chdir(cwd);
      }
    });
  });

  it("rewrites a trailing newline with --fix", async () => {
    await withTempDir(async (dir) => {
      await writeXs(dir, ".xanoscriptlint.yml", "included:\n  - \"**/*.xs\"\n");
      const filePath = await writeXs(dir, "ok.xs", `${CLEAN_XS}\n`);
      const cwd = process.cwd();
      process.chdir(dir);
      try {
        const stdout = collectStream();
        const stderr = collectStream();
        const code = await runCli(["node", "xanoscriptlint", "--fix", "ok.xs"], {
          stdout: stdout.stream,
          stderr: stderr.stream,
        });
        assert.equal(code, 0, stderr.text());
        assert.equal(await readFile(filePath, "utf8"), CLEAN_XS);
        assert.match(stdout.text(), /no_trailing_newline/);
        assert.match(stdout.text(), /Corrected 1 violation in 1 file/);
      } finally {
        process.chdir(cwd);
      }
    });
  });

  it("keeps --fix summary off JSON stdout", async () => {
    await withTempDir(async (dir) => {
      await writeXs(dir, ".xanoscriptlint.yml", "included:\n  - \"**/*.xs\"\n");
      const filePath = await writeXs(dir, "ok.xs", `${CLEAN_XS}\n`);
      const cwd = process.cwd();
      process.chdir(dir);
      try {
        const stdout = collectStream();
        const stderr = collectStream();
        const code = await runCli(
          ["node", "xanoscriptlint", "--fix", "--reporter", "json", "ok.xs"],
          { stdout: stdout.stream, stderr: stderr.stream },
        );
        assert.equal(code, 0, stderr.text());
        assert.equal(await readFile(filePath, "utf8"), CLEAN_XS);
        assert.deepEqual(JSON.parse(stdout.text()), []);
        assert.match(stderr.text(), /Corrected 1 violation in 1 file/);
      } finally {
        process.chdir(cwd);
      }
    });
  });
});

describe("isMainModule", () => {
  it("treats an npm-style symlink as the entry file", async () => {
    await withTempDir(async (dir) => {
      const real = `${dir}/cli.js`;
      const linked = `${dir}/xanoscriptlint`;
      await writeFile(real, "#!/usr/bin/env node\n", "utf8");
      await symlink(real, linked);
      assert.equal(isMainModule(linked, real), true);
      assert.equal(isMainModule(real, real), true);
      assert.equal(isMainModule(`${dir}/other.js`, real), false);
    });
  });
});
