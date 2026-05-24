# CLAUDE.md

Notes for working in this repository.

## What this is

`@theangryraven/eye-in-the-sky` is an AI driver coach framework, shipped as a
DataViewer plugin. It is published to the GitHub Packages npm registry. Treat it
as a professional project: changes ship with tests and pass CI.

This is an early scaffold. Keep things primitive until the core takes shape — do
not introduce abstractions, config, or dependencies ahead of need.

## Layout

- `index.ts` — plugin entrypoint. Default-exports a `DataViewerPlugin`.
- `plugins/types.ts` — local stub of the host plugin interfaces. Replace with the
  real DataViewer types once this builds against the host.
- `tests/` — Vitest specs (`*.test.ts`).
- `vitest.config.ts` — test + v8 coverage config; maps the `@/` alias to the repo root.

## Conventions

- The `@/` import alias resolves to the repo root (see `tsconfig.json` and
  `vitest.config.ts`). Keep both in sync.
- Type-only files (e.g. `plugins/types.ts`) are excluded from coverage.

## Commands

```
npm install            # dev dependencies
npm run typecheck      # tsc --noEmit
npm test               # vitest (watch)
npm run test:run       # vitest run (single pass)
npm run test:coverage  # vitest run --coverage
```

## CI

Each pipeline is a separate workflow under `.github/workflows/`, mirroring
DovesDataViewer: `typecheck.yml`, `test.yml`, `coverage.yml`. They run on every
push to `master` and on pull requests.

Coverage is self-hosted (no external service): `coverage.yml` runs the suite
behind a line-coverage gate (`vitest.config.ts` thresholds, currently 1% —
ratchet up as coverage grows), posts a per-PR summary comment, and on `master`
publishes a shields.io endpoint JSON to the `badges` branch via
`scripts/coverage-badge.mjs`. The README coverage badge reads that JSON.

## Before pushing

Run `npm run typecheck` and `npm run test:run`.

## Out of scope for Claude

Do not add a CODE_OF_CONDUCT file.
