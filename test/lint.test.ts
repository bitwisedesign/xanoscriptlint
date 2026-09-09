import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { resolveConfig } from "../src/config.js";
import { lintFiles } from "../src/lint.js";
import { runCli } from "../src/cli.js";
import {
  CLEAN_XS,
  EMPTY_RUN_XS,
  collectStream,
  withTempDir,
  writeXs,
} from "./support.js";

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

describe("fixture linting", () => {
  it("clean files have no default-on violations", () => {
    const config = resolveConfig({}, "/tmp", null);
    const violations = lintFiles([{ path: "clean.xs", text: CLEAN_XS }], config);
    assert.deepEqual(violations, []);
  });

  it("committed fixtures match expected default-on findings", () => {
    const config = resolveConfig({}, fixtures, null);
    const clean = {
      path: path.join(fixtures, "clean/ok.xs"),
      text: readFileSync(path.join(fixtures, "clean/ok.xs"), "utf8"),
    };
    assert.deepEqual(lintFiles([clean], config), []);

    const emptyRun = {
      path: path.join(fixtures, "violations/empty_run.xs"),
      text: readFileSync(path.join(fixtures, "violations/empty_run.xs"), "utf8"),
    };
    assert.equal(
      lintFiles([emptyRun], config).some((v) => v.ruleId === "empty_function_run"),
      true,
    );

    const trailing = {
      path: path.join(fixtures, "violations/trailing_newline.xs"),
      text: readFileSync(path.join(fixtures, "violations/trailing_newline.xs"), "utf8"),
    };
    assert.equal(
      lintFiles([trailing], config).some((v) => v.ruleId === "no_trailing_newline"),
      true,
    );

    const objectColons = {
      path: path.join(fixtures, "violations/align_object_colons.xs"),
      text: readFileSync(path.join(fixtures, "violations/align_object_colons.xs"), "utf8"),
    };
    assert.equal(
      lintFiles([objectColons], config).some((v) => v.ruleId === "align_object_colons"),
      true,
    );

    const fenceMocks = {
      path: path.join(fixtures, "violations/fence_multiline_mocks.xs"),
      text: readFileSync(path.join(fixtures, "violations/fence_multiline_mocks.xs"), "utf8"),
    };
    assert.equal(
      lintFiles([fenceMocks], config).some((v) => v.ruleId === "fence_multiline_mocks"),
      true,
    );
  });

  it("CLI lints a violations directory and exits 2", async () => {
    await withTempDir(async (dir) => {
      await writeXs(dir, ".xanoscriptlint.yml", "included:\n  - \"**/*.xs\"\n");
      await writeXs(dir, "violations/empty_run.xs", EMPTY_RUN_XS);
      const cwd = process.cwd();
      process.chdir(dir);
      try {
        const stdout = collectStream();
        const stderr = collectStream();
        const code = await runCli(
          ["node", "xanoscriptlint", "--reporter", "json", "violations"],
          { stdout: stdout.stream, stderr: stderr.stream },
        );
        assert.equal(code, 2, stderr.text());
        assert.match(stdout.text(), /empty_function_run/);
        JSON.parse(stdout.text());
      } finally {
        process.chdir(cwd);
      }
    });
  });
});
