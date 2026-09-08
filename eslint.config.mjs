import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    // Fixture bytes are the test contract, and dist/ is generated.
    ignores: ["dist/**", "test/fixtures/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Allow unused names that are intentionally ignored, including `catch (_)`.
      "@typescript-eslint/no-unused-vars": ["error", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      }],
    },
  },
  {
    files: ["test/**/*.ts"],
    rules: {
      // node:test's describe/test return promises the runner already awaits;
      // callers are meant to ignore them.
      "@typescript-eslint/no-floating-promises": "off",
    },
  },
  {
    // This config file is not part of tsconfig.json, so it has no type info.
    files: ["**/*.mjs"],
    extends: [tseslint.configs.disableTypeChecked],
  },
);
