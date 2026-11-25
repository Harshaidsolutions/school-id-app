# Backend tests

Zero-install test suite built on Node's **built-in** test runner and V8 coverage
(`node --test --experimental-test-coverage`). TypeScript is transpiled on the fly
by [sucrase](https://github.com/alangpierce/sucrase) (pure JS — no tsx/esbuild/tsc
native binaries), via the loader in `tests/helpers/`. Runs on any machine with
Node 20+ and `npm install` (sucrase is a devDependency); no extra tooling.

## Run

    npm test            # all unit tests + coverage report
    npm run test:one tests/unit/excelSchema.test.ts   # a single file

## Layout

- `tests/helpers/loader.mjs`   – sucrase TS loader + TS-style extensionless import resolver + inline source maps
- `tests/helpers/register.mjs` – registers the loader (used via `node --import`)
- `tests/unit/*.test.ts`       – one spec per source module

Coverage maps back to the original `.ts` lines (source maps are inlined by the loader).
