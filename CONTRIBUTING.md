# Contributing

## Requirements

- Node.js 20 or later
- npm

## Setup

```bash
npm install
```

## Checks

```bash
npm test
npm run build
npm run lint
```

`npm run lint` runs both linters; `npm run lint:ts` and `npm run lint:md` run them individually. Both run in CI on every pull request.

- `lint:ts` is [ESLint](https://eslint.org) with [typescript-eslint](https://typescript-eslint.io) type-aware rules (`eslint.config.mjs`). It catches what `tsc` allows, such as floating promises and unsafe `any` returns, so it is not redundant with `npm test`.
- `lint:md` is [markdownlint-cli2](https://github.com/DavidAnson/markdownlint-cli2) using `.markdownlint.yaml`.

`npm run lint:ts:fix` and `npm run lint:md:fix` apply the fixable findings.

Run the CLI locally after a build:

```bash
node dist/cli.js --help
```

Or without building:

```bash
npx tsx src/cli.ts --help
```

To run `xanoscriptlint` from any directory (package is not on the npm registry until published):

```bash
npm run build
npm link
```

Or `npm install -g .` from this checkout. Remove it with `npm unlink -g xanoscriptlint`.

## Pull requests

- Keep the default-on rule set conservative: language and platform pitfalls, not one team's house style.
- Add a fixture and a `node:test` case for each new rule or config behavior.
- Do not wrap `@xano/xanoscript-language-server` unless the change is explicitly about a CST backend.
