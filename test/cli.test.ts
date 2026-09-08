import assert from "node:assert/strict";
import { symlink, writeFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { runCli } from "../src/cli.js";
import { applyStrict, exitCodeFor, formatReport } from "../src/report.js";
import type { Violation } from "../src/rules/types.js";
import { isMainModule } from "../src/util.js";
import { collectStream, withTempDir } from "./support.js";

const warning: Violation = {
  ruleId: "no_var_response",
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
    assert.match(stdout.text(), /opt-in/);
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

    const verOut = collectStream();
    const verErr = collectStream();
    const verCode = await runCli(["node", "xanoscriptlint", "--version"], {
      stdout: verOut.stream,
      stderr: verErr.stream,
    });
    assert.equal(verCode, 0);
    assert.match(verOut.text() + verErr.text(), /\d+\.\d+\.\d+/);
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
