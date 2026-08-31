import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveConfig } from "../src/config.js";
import { discoverXsFiles } from "../src/discover.js";
import { withTempDir, writeXs } from "./support.js";

describe("discoverXsFiles", () => {
  it("includes **/*.xs and respects exclude-wins", async () => {
    await withTempDir(async (dir) => {
      const keep = await writeXs(dir, "api/ok.xs", "function \"a\" {\n}");
      await writeXs(dir, "skip/nope.xs", "function \"b\" {\n}");
      await writeXs(dir, "readme.md", "# hi\n");
      const root = await writeXs(dir, "root.xs", "function \"c\" {\n}");

      const config = resolveConfig(
        {
          included: ["**/*.xs"],
          excluded: ["skip/**"],
        },
        dir,
        null,
      );
      const files = await discoverXsFiles({ config, cwd: dir, cliPaths: [] });
      assert.deepEqual(
        files.sort(),
        [keep, root].sort(),
      );
    });
  });

  it("CLI paths further restrict without overriding excludes", async () => {
    await withTempDir(async (dir) => {
      const keep = await writeXs(dir, "api/ok.xs", "function \"a\" {\n}");
      await writeXs(dir, "api/skip.xs", "function \"b\" {\n}");
      await writeXs(dir, "other/x.xs", "function \"c\" {\n}");

      const config = resolveConfig(
        {
          included: ["**/*.xs"],
          excluded: ["api/skip.xs"],
        },
        dir,
        null,
      );
      const files = await discoverXsFiles({
        config,
        cwd: dir,
        cliPaths: ["api"],
      });
      assert.deepEqual(files, [keep]);
    });
  });
});
