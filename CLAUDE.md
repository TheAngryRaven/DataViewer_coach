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
npm install        # dev dependencies
npm run typecheck  # tsc --noEmit
npm test           # vitest run
npm run coverage   # vitest run --coverage
```

## Before pushing

Run `npm run typecheck` and `npm test`. CI (`.github/workflows/ci.yml`) runs both
on every push to `master` and on pull requests.

## Out of scope for Claude

Do not add a CODE_OF_CONDUCT file.
