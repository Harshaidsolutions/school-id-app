# Testing

One command per project. Node 20+ required (CI uses Node 22).

## What runs where

| Layer | Tool | Where it runs |
|---|---|---|
| Pure-logic **unit** tests (backend + all frontends) | Node built-in runner + sucrase loader (zero install beyond `npm install`) | anywhere, incl. this repo's sandbox |
| Backend **integration** tests | `supertest` against the real Express app + a real Postgres | CI (needs a database) |
| Web **component** tests | Vitest + jsdom + Testing Library | CI / any machine with a DOM |
| React Native **component** tests | jest-expo + @testing-library/react-native | CI / dev machine |

CI runs all of it in `.github/workflows/tests.yml`.

## Commands

    # Backend (admin-web/backend)
    npm test                 # unit tests + coverage (no DB needed)
    npm run test:integration # integration — needs NODE_ENV=test, DATABASE_URL, JWT_SECRET

    # admin-web
    npm test                 # pure-logic unit tests
    npm run test:component    # React component tests (Vitest + jsdom)

    # teacher-app / admin-mobile
    npm test                 # pure-logic unit tests
    npm run test:component    # React Native component tests (jest-expo)

## Backend integration — local setup

The app's `migrate` script only ALTERs `users` / `schools` / `students` (they were
first created outside this repo), so a fresh database needs the base tables first:

    createdb idcard_test
    export DATABASE_URL=postgres://postgres:postgres@localhost:5432/idcard_test
    export NODE_ENV=test JWT_SECRET=dev-secret
    psql "$DATABASE_URL" -f scripts/test-schema.sql   # base tables
    npm run migrate                                   # the rest of the schema
    npm run test:integration

## Notes / coverage boundaries

- 8 backend modules import `sharp` (native image lib); they load and run in CI but
  not in a CPU-arch-mismatched sandbox. Image/photo/card-generation + upload middleware.
- The Excel-import, photo-upload and large record-update handlers in the three biggest
  controllers are I/O-heavy; integration tests are the right layer for those and can be
  extended in `tests/integration/`.
- React / React Native **render** tests need a DOM / native shim, so they live in the
  component suites that run under Vitest / jest-expo (CI), not the Node unit harness.
